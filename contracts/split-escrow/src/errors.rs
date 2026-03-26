use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    InvalidFeeBps = 5,
    SplitNotFound = 6,
    SplitNotPending = 7,
    SplitNotReady = 8,
    TreasuryNotSet = 9,
    ParticipantCapExceeded = 10,
    // Money-critical/upgrade failures are asserted by numeric code in tests.
    InvalidVersion = 11,
    InvalidInput = 12,
    EscrowNotActive = 13,
    /// Split is already finalized (released or cancelled) or otherwise not active.
    SplitNotActive = 14,
    InvalidMetadata = 15,
}