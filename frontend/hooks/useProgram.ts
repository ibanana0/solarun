"use client";

import { useMemo } from "react";
import { Program, type Idl } from "@coral-xyz/anchor";
import { useAnchorProvider } from "./useAnchorProvider";
// Explicitly import the IDL that was just synced
import idl from "../lib/solarun_idl.json";

export function useProgram(): Program | null {
  const provider = useAnchorProvider();

  const program = useMemo(() => {
    if (!provider) return null;

    try {
      // Create program with same format as backend: { ...idl, address: programId }
      const prog = new Program(
        { ...idl, address: idl.address } as Idl,
        provider,
      );

      // Debug: Log available methods on first load
      if (
        typeof window !== "undefined" &&
        !(window as any).__solarun_program_logged
      ) {
        console.log("[SolaRun] Program created with address:", idl.address);
        console.log(
          "[SolaRun] Available methods:",
          Object.keys((prog.methods as any) || {}),
        );
        (window as any).__solarun_program_logged = true;
      }

      return prog;
    } catch (error) {
      console.error("[SolaRun] Failed to create program:", error);
      return null;
    }
  }, [provider]);

  return program;
}
