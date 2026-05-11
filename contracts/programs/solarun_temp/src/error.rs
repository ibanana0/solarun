use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    // E0001-E0009: Event Initialization
    #[msg("E0001: End time must be after start time")]
    EndTimeInvalid,

    #[msg("E0002: Vault capacity must be greater than zero")]
    VaultCapacityZero,

    #[msg("E0003: Invalid event ID (empty or too long, max 36 chars)")]
    InvalidEventId,

    #[msg("E0004: Event has already been started")]
    EventAlreadyStarted,

    // E0010-E0019: Participant Registration
    #[msg("E0010: Event not found")]
    EventNotFound,

    #[msg("E0011: Event is not in Active or Initialized status")]
    EventNotActive,

    #[msg("E0012: Chip UID already exists in this event")]
    ChipUidAlreadyExists,

    #[msg("E0013: Wallet address already registered for this event")]
    WalletAlreadyRegistered,

    #[msg("E0015: Event creator cannot register as a participant in their own event")]
    CreatorCannotRegister,

    #[msg("E0014: Invalid chip UID (empty or too long, max 20 chars)")]
    InvalidChipUid,

    #[msg("Maximum participants reached")]
    MaxParticipantsReached,

    // E0020-E0029: Finish Recording
    #[msg("E0020: Event not found for finish recording")]
    FinishEventNotFound,

    #[msg("E0021: Event is not in Active status")]
    FinishEventNotActive,

    #[msg("E0022: Participant not found for this event")]
    ParticipantNotFound,

    #[msg("E0023: Invalid checkpoint ID (must be 0, 1, or 2)")]
    InvalidCheckpointId,

    #[msg("E0024: Participant has already finished, cannot record duplicate finish")]
    ParticipantAlreadyFinished,

    // E0030-E0039: Refund Distribution
    #[msg("E0030: Event not found for refund processing")]
    RefundEventNotFound,

    #[msg("E0031: Event must be Completed before processing refunds")]
    EventNotCompleted,

    #[msg("E0032: Vault is empty, cannot process refunds")]
    VaultEmpty,

    #[msg("E0033: Invalid finisher position")]
    InvalidFinisherPosition,

    #[msg("E0034: Transfer to participant failed")]
    TransferFailed,

    #[msg("E0035: Arithmetic overflow in prize calculation")]
    ArithmeticOverflow,

    #[msg("E0036: Invalid wallet address (zero address)")]
    InvalidWalletAddress,

    // E0040-E0049: Access Control
    #[msg("E0040: Unauthorized signer (not admin)")]
    UnauthorizedAdmin,

    #[msg("E0041: Unauthorized signer (not backend)")]
    UnauthorizedBackend,

    // E0050-E0059: Input Validation
    #[msg("E0050: Invalid full name (empty or too long, max 50 chars)")]
    InvalidFullName,

    #[msg("E0051: Invalid runner ID (empty or too long, max 36 chars)")]
    InvalidRunnerId,

    #[msg("E0052: Invalid wallet address format")]
    InvalidWalletFormat,

    #[msg("Event must be in Initialized status to register")]
    EventNotInitialized,

    #[msg("Event must be in Active status to record finish")]
    EventNotActiveForFinish,

    #[msg("Event must be in Completed status to process refunds")]
    EventNotCompletedForRefund,

    // E0060-E0069: Staking & Protocol Fees
    #[msg("E0060: Insufficient stake amount")]
    InsufficientStake,

    #[msg("E0061: Stake already deposited for this event")]
    StakeAlreadyDeposited,

    #[msg("E0062: Global state account not found")]
    GlobalStateNotFound,

    #[msg("E0063: Treasury address not set")]
    TreasuryAddressNotSet,

    #[msg("E0064: Event already completed, cannot process again")]
    EventAlreadyCompleted,

    #[msg("E0065: Insufficient funds in vault for fee distribution")]
    InsufficientVaultFunds,

    #[msg("E0066: Stake vault error")]
    StakeVaultError,

    #[msg("E0067: Cannot refund - event must be in Completed status")]
    CannotRefundEventNotCompleted,

    #[msg("E0068: Refund already processed")]
    RefundAlreadyProcessed,

    #[msg("Stake amount is below minimum required")]
    StakeTooLow,
    
    #[msg("Stake amount exceeds maximum allowed")]
    StakeTooHigh,
    
    #[msg("Protocol fee cannot exceed 10000 bps (100%)")]
    InvalidProtocolFee,

    #[msg("Stake is locked during dispute period")]
    StakeLocked,
    
    #[msg("No stake to release")]
    NoStakeToRelease,
}
