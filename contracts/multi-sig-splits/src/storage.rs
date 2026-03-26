//! # Storage Module for Multi-Signature Splits Contract

use crate::types::*;
use soroban_sdk::{symbol_short, Address, Env, String, Symbol, Vec};

/// Storage keys
const ADMIN: Symbol = symbol_short!("ADMIN");
const SIGNED: Symbol = symbol_short!("SIGNED");

fn signed_key(split_id: &String, signer: &Address) -> (Symbol, String, Address) {
    (SIGNED, split_id.clone(), signer.clone())
}

/// Set the admin address
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&ADMIN, admin);
}

/// Get the admin address
pub fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&ADMIN).unwrap()
}

/// Check if admin is set
pub fn has_admin(env: &Env) -> bool {
    env.storage().instance().has(&ADMIN)
}

/// Check if a multi-sig split exists
pub fn split_exists(env: &Env, split_id: &String) -> bool {
    env.storage().persistent().has(split_id)
}

/// Get a multi-sig split by ID
pub fn get_split(env: &Env, split_id: &String) -> MultisigSplit {
    env.storage().persistent().get(split_id).unwrap()
}

/// Save a multi-sig split
pub fn save_split(env: &Env, split: &MultisigSplit) {
    env.storage().persistent().set(&split.split_id, split);
}

/// Check if an address has signed a split
pub fn has_signed(env: &Env, split_id: &String, signer: &Address) -> bool {
    env.storage()
        .persistent()
        .has(&signed_key(split_id, signer))
}

/// Check if an address is an authorized signer
pub fn is_signer(env: &Env, split_id: &String, signer: &Address) -> bool {
    let split = get_split(env, split_id);
    for i in 0..split.signers.len() {
        if &split.signers.get(i).unwrap() == signer {
            return true;
        }
    }
    false
}

/// Add a signature to a split
pub fn add_signature(env: &Env, split_id: &String, signer: &Address) {
    let mut split = get_split(env, split_id);
    split.current_signatures += 1;
    env.storage()
        .persistent()
        .set(&signed_key(split_id, signer), &true);
    save_split(env, &split);
}

/// Add a new signer to the split
pub fn add_signer(env: &Env, split_id: &String, signer: &Address) -> Result<(), MultisigError> {
    let mut split = get_split(env, split_id);

    // Check if signer is already in the list
    for i in 0..split.signers.len() {
        if &split.signers.get(i).unwrap() == signer {
            return Err(MultisigError::SignerAlreadyExists);
        }
    }

    // Add the new signer
    split.signers.push_back(signer.clone());

    save_split(env, &split);
    Ok(())
}

/// Remove a signer from the split
pub fn remove_signer(env: &Env, split_id: &String, signer: &Address) -> Result<(), MultisigError> {
    let mut split = get_split(env, split_id);

    // Cannot remove the last signer
    if split.signers.len() == 1 {
        return Err(MultisigError::CannotRemoveLastSigner);
    }

    // Find and remove the signer; undo their signature if they had signed.
    let mut found = false;
    let mut new_signers = Vec::new(env);
    for i in 0..split.signers.len() {
        let s = split.signers.get(i).unwrap();
        if &s == signer {
            found = true;
            // Decrement current signatures only if this signer had signed.
            if has_signed(env, split_id, signer) && split.current_signatures > 0 {
                split.current_signatures -= 1;
                env.storage()
                    .persistent()
                    .remove(&signed_key(split_id, signer));
            }
        } else {
            new_signers.push_back(s);
        }
    }

    if !found {
        return Err(MultisigError::SignerNotFound);
    }

    split.signers = new_signers;

    // Adjust threshold if needed
    if split.required_signatures > split.signers.len() as u32 {
        split.required_signatures = split.signers.len() as u32;
    }

    save_split(env, &split);
    Ok(())
}

/// Update the signature threshold
pub fn update_threshold(
    env: &Env,
    split_id: &String,
    new_threshold: u32,
) -> Result<(), MultisigError> {
    let mut split = get_split(env, split_id);
    let num_signers = split.signers.len() as u32;

    // Validate threshold
    if new_threshold == 0 {
        return Err(MultisigError::ThresholdTooLow);
    }

    if new_threshold > num_signers {
        return Err(MultisigError::ThresholdTooHigh);
    }

    split.required_signatures = new_threshold;
    save_split(env, &split);
    Ok(())
}

/// Check if a split can be executed
pub fn can_execute(env: &Env, split: &MultisigSplit) -> bool {
    split.status == MultisigStatus::Active
        && split.current_signatures >= split.required_signatures
        && env.ledger().timestamp() >= split.created_at + split.time_lock
}

/// Check if a split has expired
pub fn is_expired(env: &Env, split: &MultisigSplit) -> bool {
    env.ledger().timestamp() > split.created_at + split.time_lock + 86400 // 24 hours grace period
}

/// Update split status
pub fn update_split_status(env: &Env, split_id: &String, status: &MultisigStatus) {
    let mut split = get_split(env, split_id);
    split.status = status.clone();
    if *status == MultisigStatus::Executed {
        split.executed_at = env.ledger().timestamp();
    }
    save_split(env, &split);
}