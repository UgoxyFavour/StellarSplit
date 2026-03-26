#![no_std]

mod errors;
mod storage;
mod types;

#[cfg(test)]
mod test;

use errors::Error;
use soroban_sdk::{contract, contractimpl, vec, Address, Bytes, Env, IntoVal, String, Symbol, Val};
use types::{Dispute, DisputeResult, DisputeStatus};

const VOTING_PERIOD: u64 = 604_800; // 7 days in seconds

const MAX_SPLIT_ID_BYTES: usize = 64;

fn generate_dispute_id(env: &Env, split_id: &String) -> String {
    let split_len = split_id.len() as usize;
    // Dispute IDs include split_id bytes; keep it bounded to avoid
    // allocating unbounded buffers in `no_std`.
    assert!(split_len <= MAX_SPLIT_ID_BYTES);

    // Convert Soroban `String` into a `Bytes` blob for hashing.
    let mut split_buf = [0u8; MAX_SPLIT_ID_BYTES];
    split_id.copy_into_slice(&mut split_buf[..split_len]);
    let split_bytes = Bytes::from_slice(env, &split_buf[..split_len]);

    let mut input = Bytes::new(env);
    input.append(&split_bytes);
    let seq = env.ledger().sequence().to_be_bytes();
    input.append(&Bytes::from_slice(env, &seq));
    let hash = env.crypto().sha256(&input);
    let hash_bytes = &hash.to_array()[..8];
    let mut id_bytes = Bytes::from_slice(env, b"dis_");
    id_bytes.append(&Bytes::from_slice(env, hash_bytes));

    // `String::from_bytes` expects a byte slice; convert via a fixed buffer.
    let id_buf = id_bytes.to_buffer::<32>();
    String::from_bytes(env, id_buf.as_slice())
}

#[contract]
pub struct DisputeContract;

#[contractimpl]
impl DisputeContract {
    /// Raise a new dispute against a split.
    pub fn raise_dispute(
        env: Env,
        split_id: String,
        raiser: Address,
        reason: String,
        escrow_contract: Address,
        escrow_split_id: u64,
    ) -> Result<String, Error> {
        raiser.require_auth();

        let now = env.ledger().timestamp();
        let dispute_id = generate_dispute_id(&env, &split_id);

        if storage::has_dispute(&env, &dispute_id) {
            return Err(Error::AlreadyExists);
        }

        let dispute = Dispute {
            dispute_id: dispute_id.clone(),
            split_id,
            raiser,
            reason,
            status: DisputeStatus::Voting,
            votes_for: 0,
            votes_against: 0,
            voters: soroban_sdk::Vec::new(&env),
            created_at: now,
            voting_ends_at: now + VOTING_PERIOD,
            result: None,
            escrow_contract,
            escrow_split_id,
        };

        storage::save_dispute(&env, &dispute);
        storage::add_to_list(&env, dispute_id.clone());

        Ok(dispute_id)
    }

    /// Cast a vote on an open dispute.
    pub fn vote_on_dispute(
        env: Env,
        dispute_id: String,
        voter: Address,
        support: bool, // true = support the dispute, false = dismiss it
    ) -> Result<(), Error> {
        voter.require_auth();

        let mut dispute = storage::get_dispute(&env, &dispute_id)?;

        // Must be in Voting status
        if dispute.status != DisputeStatus::Voting {
            return Err(Error::DisputeClosed);
        }

        let now = env.ledger().timestamp();

        // Voting window must still be open
        if now > dispute.voting_ends_at {
            return Err(Error::VotingPeriodEnded);
        }

        // Each address can only vote once
        if storage::has_voted(&env, &dispute_id, &voter) {
            return Err(Error::AlreadyVoted);
        }

        // Record the vote
        if support {
            dispute.votes_for += 1;
        } else {
            dispute.votes_against += 1;
        }

        dispute.voters.push_back(voter.clone());
        storage::record_vote(&env, &dispute_id, &voter);
        storage::save_dispute(&env, &dispute);

        Ok(())
    }

    /// Resolve a dispute after voting period ends.
    pub fn resolve_dispute(
        env: Env,
        dispute_id: String,
        resolver: Address,
    ) -> Result<DisputeResult, Error> {
        let mut dispute = storage::get_dispute(&env, &dispute_id)?;

        if dispute.status != DisputeStatus::Voting {
            return Err(Error::DisputeClosed);
        }

        let now = env.ledger().timestamp();

        // Voting period must have ended
        if now <= dispute.voting_ends_at {
            return Err(Error::VotingPeriodActive);
        }

        // Determine result based on votes
        let result = if dispute.votes_for > dispute.votes_against {
            DisputeResult::UpheldForRaiser
        } else if dispute.votes_against > dispute.votes_for {
            DisputeResult::DismissedForRaiser
        } else {
            DisputeResult::Tied
        };

        // Auth boundary: only the escrow creator (owner) is allowed to finalize the escrow action.
        resolver.require_auth();

        let get_creator_sym = Symbol::new(&env, "get_creator");
        let get_creator_args: soroban_sdk::Vec<Val> =
            vec![&env, dispute.escrow_split_id.into_val(&env)];
        let escrow_creator: Address =
            env.invoke_contract(&dispute.escrow_contract, &get_creator_sym, get_creator_args);

        if resolver != escrow_creator {
            return Err(Error::UnauthorizedResolver);
        }

        // Drive the next step in the payment lifecycle by updating escrow settlement state.
        // Upheld => dispute is valid => cancel/undo the escrow.
        // Dismissed/Tied => dispute is invalid or tie => continue settlement by releasing funds.
        if result == DisputeResult::UpheldForRaiser {
            let reverse_sym = Symbol::new(&env, "reverse_split");
            let reverse_args: soroban_sdk::Vec<Val> =
                vec![&env, dispute.escrow_split_id.into_val(&env)];
            env.invoke_contract::<()>(&dispute.escrow_contract, &reverse_sym, reverse_args);
        } else {
            let release_sym = Symbol::new(&env, "release_funds");
            let release_args: soroban_sdk::Vec<Val> =
                vec![&env, dispute.escrow_split_id.into_val(&env)];
            env.invoke_contract::<()>(&dispute.escrow_contract, &release_sym, release_args);
        }

        dispute.status = DisputeStatus::Resolved;
        dispute.result = Some(match result {
            DisputeResult::UpheldForRaiser => 0u32,
            DisputeResult::DismissedForRaiser => 1u32,
            DisputeResult::Tied => 2u32,
        });
        storage::save_dispute(&env, &dispute);

        Ok(result)
    }

    /// Get a dispute record.
    pub fn get_dispute(env: Env, dispute_id: String) -> Result<Dispute, Error> {
        storage::get_dispute(&env, &dispute_id)
    }

    /// Get all dispute IDs.
    pub fn get_all_disputes(env: Env) -> soroban_sdk::Vec<String> {
        storage::get_list(&env)
    }
}