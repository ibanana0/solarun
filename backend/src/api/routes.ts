/**
 * SolaRun API Routes - Staking & Fee Distribution
 *
 * Routes:
 * POST   /api/events/create            - Create new event with stake requirement
 * POST   /api/events/:eventId/confirm-stake - Confirm blockchain stake deposit
 * GET    /api/events/:eventId/details   - Get event details with stake/fee info
 * POST   /api/events/complete           - Handle event completion
 * POST   /api/events/failure            - Handle event failure
 * GET    /api/events/pending-distributions - Get pending fee distributions
 * POST   /api/events/:eventId/confirm-distribution - Confirm fee distribution
 * GET    /api/protocol/config           - Get protocol configuration
 * PUT    /api/protocol/config           - Update protocol configuration
 */

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  createEvent,
  confirmStakeDeposit,
  getEventDetails,
  updateEventVaultAddress,
} from "./createEvent";
import {
  handleEventCompletion,
  getPendingFeeDistributions,
  confirmFeeDistribution,
  handleEventFailure,
} from "./eventCompletionListener";
import {
  getProtocolConfig,
  updateProtocolConfig,
} from "../lib/fee-distribution-service";
import {
  verifyVaultIntegrity,
  autoDetectAndSlashFraud,
} from "../lib/fraud-detection-service";

const router = Router();

// ============================================================================
// Event Creation & Staking Routes
// ============================================================================

/**
 * POST /api/events/create
 * Create a new event with stake requirement
 */
router.post("/events/create", async (req: Request, res: Response) => {
  try {
    const result = await createEvent(req.body);
    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[POST /events/create] ${message}`);
    res.status(400).json({ success: false, message });
  }
});

/**
 * POST /api/events/:eventId/confirm-stake
 * Confirm blockchain stake deposit for an event
 */
router.post(
  "/events/:eventId/confirm-stake",
  async (req: Request, res: Response) => {
    try {
      const { eventId } = req.params;
      const { admin_wallet, stake_amount, tx_signature } = req.body;

      if (!admin_wallet || !stake_amount || !tx_signature) {
        res.status(400).json({
          success: false,
          message:
            "Missing required fields: admin_wallet, stake_amount, tx_signature",
        });
        return;
      }

      await confirmStakeDeposit(
        eventId,
        admin_wallet,
        stake_amount,
        tx_signature,
      );
      res.json({
        success: true,
        message: "Stake deposit confirmed",
        event_id: eventId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[POST /events/:eventId/confirm-stake] ${message}`);
      res.status(400).json({ success: false, message });
    }
  },
);

/**
 * GET /api/events/:eventId/details
 * Get event details including stake and fee information
 */
router.get("/events/:eventId/details", async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const event = await getEventDetails(eventId);
    res.json({ success: true, data: event });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[GET /events/:eventId/details] ${message}`);
    res.status(400).json({ success: false, message });
  }
});

/**
 * PUT /api/events/:eventId/vault-address
 * Update event vault address after blockchain initialization
 */
router.put(
  "/events/:eventId/vault-address",
  async (req: Request, res: Response) => {
    try {
      const { eventId } = req.params;
      const { vault_address } = req.body;

      if (!vault_address) {
        res.status(400).json({
          success: false,
          message: "Missing required field: vault_address",
        });
        return;
      }

      await updateEventVaultAddress(eventId, vault_address);
      res.json({
        success: true,
        message: "Vault address updated",
        event_id: eventId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[PUT /events/:eventId/vault-address] ${message}`);
      res.status(400).json({ success: false, message });
    }
  },
);

// ============================================================================
// Event Completion & Fee Distribution Routes
// ============================================================================

/**
 * POST /api/events/complete
 * Handle event completion (triggered by IoT system or admin)
 */
router.post("/events/complete", async (req: Request, res: Response) => {
  try {
    const result = await handleEventCompletion(req.body);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[POST /events/complete] ${message}`);
    res.status(400).json({ success: false, message });
  }
});

/**
 * POST /api/events/failure
 * Handle event failure (cancel event, slash admin stake)
 */
router.post("/events/failure", async (req: Request, res: Response) => {
  try {
    const { event_id, failure_reason } = req.body;

    if (!event_id || !failure_reason) {
      res.status(400).json({
        success: false,
        message: "Missing required fields: event_id, failure_reason",
      });
      return;
    }

    await handleEventFailure(event_id, failure_reason);
    res.json({
      success: true,
      message: "Event failure processed",
      event_id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[POST /events/failure] ${message}`);
    res.status(400).json({ success: false, message });
  }
});

/**
 * GET /api/events/pending-distributions
 * Get all pending fee distributions
 */
router.get(
  "/events/pending-distributions",
  async (_req: Request, res: Response) => {
    try {
      const distributions = await getPendingFeeDistributions();
      res.json({ success: true, data: distributions });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[GET /events/pending-distributions] ${message}`);
      res.status(400).json({ success: false, message });
    }
  },
);

/**
 * POST /api/events/:eventId/confirm-distribution
 * Confirm fee distribution on blockchain
 */
router.post(
  "/events/:eventId/confirm-distribution",
  async (req: Request, res: Response) => {
    try {
      const { eventId } = req.params;
      const { tx_signature, admin_wallet } = req.body;

      if (!tx_signature || !admin_wallet) {
        res.status(400).json({
          success: false,
          message: "Missing required fields: tx_signature, admin_wallet",
        });
        return;
      }

      await confirmFeeDistribution(eventId, tx_signature, admin_wallet);
      res.json({
        success: true,
        message: "Fee distribution confirmed",
        event_id: eventId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[POST /events/:eventId/confirm-distribution] ${message}`);
      res.status(400).json({ success: false, message });
    }
  },
);

// ============================================================================
// Protocol Configuration Routes
// ============================================================================

/**
 * GET /api/protocol/config
 * Get current protocol configuration
 */
router.get("/protocol/config", async (_req: Request, res: Response) => {
  try {
    const config = await getProtocolConfig();
    if (!config) {
      res.status(404).json({
        success: false,
        message: "Protocol configuration not found. Please initialize.",
      });
      return;
    }
    res.json({ success: true, data: config });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[GET /protocol/config] ${message}`);
    res.status(400).json({ success: false, message });
  }
});

/**
 * PUT /api/protocol/config
 * Update protocol configuration (admin only)
 */
router.put("/protocol/config", async (req: Request, res: Response) => {
  try {
    const { treasury_address, protocol_fee_bps } = req.body;

    if (!treasury_address || protocol_fee_bps === undefined) {
      res.status(400).json({
        success: false,
        message: "Missing required fields: treasury_address, protocol_fee_bps",
      });
      return;
    }

    await updateProtocolConfig(treasury_address, protocol_fee_bps);
    res.json({
      success: true,
      message: "Protocol configuration updated",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[PUT /protocol/config] ${message}`);
    res.status(400).json({ success: false, message });
  }
});

// ============================================================================
// Security & Fraud Detection Routes
// ============================================================================

/**
 * GET /api/admin/vault-integrity/:eventId
 * Check vault balance integrity for a specific event
 */
router.get(
  "/admin/vault-integrity/:eventId",
  async (req: Request, res: Response) => {
    try {
      const { eventId } = req.params;
      const result = await verifyVaultIntegrity(eventId);
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[GET /admin/vault-integrity/:eventId] ${message}`);
      res.status(400).json({ success: false, message });
    }
  },
);

/**
 * POST /api/admin/trigger-fraud-scan
 * Manually trigger fraud detection scan across all recently completed events
 */
router.post(
  "/admin/trigger-fraud-scan",
  async (_req: Request, res: Response) => {
    try {
      await autoDetectAndSlashFraud();
      res.json({ success: true, message: "Fraud detection scan completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[POST /admin/trigger-fraud-scan] ${message}`);
      res.status(500).json({ success: false, message });
    }
  },
);

// ============================================================================
// Deposit Susulan & Validation Routes
// ============================================================================

/**
 * GET /api/events/:eventId/deposit-status
 * Check if event requires deposit before starting
 */
router.get(
  "/events/:eventId/deposit-status",
  async (req: Request, res: Response) => {
    try {
      const { eventId } = req.params;
      const { supabase } = await import("../lib/supabase");

      const { data: event, error } = await supabase
        .from("race_events")
        .select(
          "id, name, stake_status, stake_amount, deposit_deadline, status",
        )
        .eq("id", eventId)
        .single();

      if (error || !event) {
        res.status(404).json({ success: false, message: "Event not found" });
        return;
      }

      const canStart = event.stake_status === "staked";
      const requiresDeposit =
        event.stake_status === "pending" && event.stake_amount > 0;
      const isExpired =
        event.deposit_deadline && new Date(event.deposit_deadline) < new Date();

      res.json({
        success: true,
        data: {
          event_id: event.id,
          can_start: canStart,
          requires_deposit: requiresDeposit,
          stake_status: event.stake_status,
          stake_amount: event.stake_amount,
          deposit_deadline: event.deposit_deadline,
          is_expired: isExpired,
          status: event.status,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[GET /events/:eventId/deposit-status] ${message}`);
      res.status(400).json({ success: false, message });
    }
  },
);

/**
 * POST /api/events/:eventId/validate-start
 * Validate if event can be started (check deposit status)
 */
router.post(
  "/events/:eventId/validate-start",
  async (req: Request, res: Response) => {
    try {
      const { eventId } = req.params;
      const { supabase } = await import("../lib/supabase");

      const { data: event, error } = await supabase
        .from("race_events")
        .select("stake_status, stake_amount, status")
        .eq("id", eventId)
        .single();

      if (error || !event) {
        res.status(404).json({
          success: false,
          can_start: false,
          message: "Event not found",
        });
        return;
      }

      // Check if event requires deposit
      if (event.stake_amount > 0 && event.stake_status !== "staked") {
        res.status(403).json({
          success: false,
          can_start: false,
          message: "Event cannot be started. Deposit required.",
          required_action: "complete_deposit",
        });
        return;
      }

      // Check if event is in correct status
      if (event.status !== "pending") {
        res.status(400).json({
          success: false,
          can_start: false,
          message: `Event cannot be started. Current status: ${event.status}`,
        });
        return;
      }

      res.json({
        success: true,
        can_start: true,
        message: "Event can be started",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[POST /events/:eventId/validate-start] ${message}`);
      res.status(400).json({ success: false, can_start: false, message });
    }
  },
);

/**
 * POST /api/admin/trigger-auto-cancel
 * Manually trigger auto-cancel check (for testing or manual run)
 */
router.post(
  "/admin/trigger-auto-cancel",
  async (_req: Request, res: Response) => {
    try {
      const { triggerManualCheck } =
        await import("../services/auto-cancel-scheduler");
      const cancelledEvents = await triggerManualCheck();

      res.json({
        success: true,
        message: `Auto-cancel check completed. ${cancelledEvents.length} event(s) cancelled.`,
        cancelled_events: cancelledEvents,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[POST /admin/trigger-auto-cancel] ${message}`);
      res.status(500).json({ success: false, message });
    }
  },
);

export default router;
