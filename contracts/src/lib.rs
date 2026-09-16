//! z-latch-pay v0.1.0 — Latch autopay guard.
//!
//! Latch is the payee firewall for agent autopay: every invoice the agent
//! wants to pay is checked inside the TEE against the tenant's allowlist
//! (`z:<tid>:latch-policy`) BEFORE any payment egress happens. A vendor that
//! is not on the allowlist — the classic poisoned-invoice attack — is denied
//! with `payee_mismatch` and the payment rail is never contacted.
//!
//! The payee account detail itself (the vendor IBAN) is never a contract
//! argument and never enters WASM memory: the payment body templates the
//! `{{profile.vendor.iban}}` marker and the host's `http-with-placeholders`
//! interface resolves it from the calling user's profile at dispatch time.
//!
//! The payment rail is configurable: `z:<tid>:secrets` carries `payment_rail`
//! (`lemonsqueezy` | `stripe`), `payment_api_key`, and (Lemonsqueezy only)
//! `lemonsqueezy_variant_id`. All are seeded by the tenant SDK before use.
//!
//! # Host-capability requirements
//!
//! ```json
//! {
//!   "host_capabilities": [
//!     "kv_store", "logging", "tenant_context", "http_with_placeholders"
//!   ]
//! }
//! ```
#![warn(clippy::style, missing_debug_implementations)]
#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

extern crate alloc;

pub const CONTRACT_VERSION: &str = "0.1.0";

wit_bindgen::generate!({
    world: "latch-pay",
    path: "wit",
    additional_derives: [
        serde::Deserialize,
        serde::Serialize,
    ],
    generate_all,
});

mod pay;

struct Component;

#[cfg(target_arch = "wasm32")]
impl exports::z::latch_pay::contracts::Guest for Component {
    fn pay_invoice(
        req: exports::z::latch_pay::contracts::GenericInput,
    ) -> Result<alloc::vec::Vec<u8>, alloc::string::String> {
        let input = req.input.ok_or("pay-invoice: missing input")?;
        pay::pay_invoice(&input)
    }
}

#[cfg(target_arch = "wasm32")]
export!(Component);

#[cfg(test)]
mod tests {
    use super::CONTRACT_VERSION;

    #[test]
    fn contract_version_is_semver() {
        let parts: Vec<&str> = CONTRACT_VERSION.split('.').collect();
        assert_eq!(parts.len(), 3, "CONTRACT_VERSION must be MAJOR.MINOR.PATCH");
        for part in parts {
            assert!(part.parse::<u32>().is_ok(), "each part must be a number");
        }
    }
}
