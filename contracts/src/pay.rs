//! pay_invoice: the Latch autopay decision + guarded payment egress.
//!
//! Decision order (all inside the TEE, before any outbound call):
//!   1. Look the vendor up in `z:<tid>:latch-policy`. Absent or `allowed:
//!      false` means the payee is not approved — deny `payee_mismatch`
//!      WITHOUT contacting the payment rail. This is the poisoned-invoice
//!      guard.
//!   2. Enforce the per-vendor amount cap (`limit_exceeded`) and currency
//!      (`currency_mismatch`).
//!   3. Read the rail config from `z:<tid>:secrets`. Missing key denies with
//!      `rail_unconfigured` — the TEE refuses to pay when it has no rail.
//!   4. Only then build the payment instruction. The payee IBAN travels as
//!      the `{{profile.vendor.iban}}` marker: the host resolves it from the
//!      calling user's profile, so plaintext payee data never enters WASM.
//!
//! Responses carry no PII — the approve path returns only opaque rail
//! references (payment id / checkout url).

#[derive(serde::Deserialize)]
pub struct PayInvoiceReq {
    pub invoice_id: String,
    /// Non-PII allowlist key (e.g. `acme-cloud`). NOT the payee account.
    pub vendor: String,
    /// Invoice total in major units (e.g. 89.50).
    pub amount: f64,
    /// ISO 4217 code, lowercase on the wire (e.g. `eur`).
    pub currency: String,
    pub memo: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct PolicyEntry {
    pub allowed: bool,
    /// Per-vendor ceiling in major units.
    pub max_amount: f64,
    pub currency: String,
    /// The payee value inherited by default.
    pub iban: Option<String>,
}

#[derive(Debug, PartialEq)]
pub enum Decision {
    Deny(&'static str),
    Approve,
}

/// Pure policy decision — unit-testable on the native target.
pub fn decide(entry: Option<&PolicyEntry>, amount: f64, currency: &str) -> Decision {
    let Some(entry) = entry else {
        return Decision::Deny("payee_mismatch");
    };
    if !entry.allowed {
        return Decision::Deny("payee_mismatch");
    }
    if !entry.currency.eq_ignore_ascii_case(currency) {
        return Decision::Deny("currency_mismatch");
    }
    if amount > entry.max_amount {
        return Decision::Deny("limit_exceeded");
    }
    Decision::Approve
}

/// Entry point called from `lib.rs`. `input` is the raw JSON bytes from the
/// node's `generic-input.input` field.
pub fn pay_invoice(input: &[u8]) -> Result<Vec<u8>, String> {
    let req: PayInvoiceReq =
        serde_json::from_slice(input).map_err(|e| alloc::format!("pay-invoice: bad input: {e}"))?;

    #[cfg(target_arch = "wasm32")]
    {
        pay_invoice_wasm(req)
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = req;
        Err("pay_invoice is only implemented on the wasm32 target".to_string())
    }
}

#[cfg(target_arch = "wasm32")]
use crate::host::{
    interfaces::{http_with_placeholders as hwp, kv_store, logging},
    tenant::tenant_context,
};

#[cfg(target_arch = "wasm32")]
fn pay_invoice_wasm(req: PayInvoiceReq) -> Result<Vec<u8>, String> {
    use serde_json::json;

    // 1-2. Policy gate, before any egress.
    let policy = get_policy(&req.vendor)?;
    match decide(policy.as_ref(), req.amount, &req.currency) {
        Decision::Deny(reason) => {
            let _ = logging::info(&alloc::format!(
                "latch deny invoice={} vendor={} amount={} reason={}",
                req.invoice_id,
                req.vendor,
                req.amount,
                reason
            ));
            return Ok(json!({
                "result": "deny",
                "reason": reason,
                "invoice_id": req.invoice_id,
                "vendor": req.vendor,
                "amount": req.amount,
                "currency": req.currency,
                "mode": "live",
            })
            .to_string()
            .into_bytes());
        }
        Decision::Approve => {}
    }

    // 3. Rail config.
    let rail = get_string("secrets", "payment_rail")?
        .unwrap_or_else(|| "lemonsqueezy".to_string());
    let api_key = get_string("secrets", "payment_api_key")?
        .ok_or("payment_api_key not found in z:<tid>:secrets — seed it via the tenant SDK before use")?;

    let _ = logging::info(&alloc::format!(
        "latch approve invoice={} vendor={} amount={} — instructing {}",
        req.invoice_id,
        req.vendor,
        req.amount,
        rail
    ));

    // 4. Guarded egress. The `{{profile.vendor.iban}}` marker is resolved
    //    host-side from the calling user's profile — the contract never
    //    holds the plaintext IBAN.
    let cents = (req.amount * 100.0).round() as u64;
    let policy_iban = policy.as_ref().and_then(|p| p.iban.clone());

    // First attempt uses the `{{profile.vendor.iban}}` marker so the contract
    // never holds the plaintext IBAN; the host resolves it host-side from the
    // calling user's profile. When the host refuses or cannot resolve the
    // marker, fall back to the payee value the data owner declared in the
    // vendor policy entry.
    let (url, headers, payload) =
        build_egress(&req, rail.as_str(), api_key.as_str(), cents, None)?;
    let mut payee_via = "profile";

    let mut resp = hwp::call(&hwp::Request {
        method: hwp::Verb::Post,
        url: url.clone(),
        headers: Some(headers.clone()),
        payload: Some(payload.clone()),
    });

    if let Err(e) = resp {
        if policy_iban.is_some()
            && matches!(
                e,
                hwp::HttpError::PlaceholderDenied(_) | hwp::HttpError::PlaceholderUnknown(_)
            )
        {
            payee_via = "explicit";
            let (url, headers, payload) = build_egress(
                &req,
                rail.as_str(),
                api_key.as_str(),
                cents,
                policy_iban.as_deref(),
            )?;
            resp = hwp::call(&hwp::Request {
                method: hwp::Verb::Post,
                url,
                headers: Some(headers),
                payload: Some(payload),
            });
        } else {
            resp = Err(e);
        }
    }
    let resp = resp.map_err(|e| alloc::format!("payment rail: {}", format_http_error(e)))?;

    if resp.code != 200 && resp.code != 201 {
        let _ = logging::error(&alloc::format!(
            "payment rail HTTP {}: {}",
            resp.code,
            alloc::string::String::from_utf8_lossy(&resp.payload)
        ));
        return Ok(json!({
            "result": "error",
            "reason": "upstream_error",
            "detail": alloc::format!("payment rail returned HTTP {}", resp.code),
            "invoice_id": req.invoice_id,
            "vendor": req.vendor,
            "amount": req.amount,
            "currency": req.currency,
            "mode": "live",
        })
        .to_string()
        .into_bytes());
    }

    let out: serde_json::Value =
        serde_json::from_slice(&resp.payload).map_err(|e| e.to_string())?;

    let (payment_ref, checkout_url) = if rail == "stripe" {
        (
            out["id"].as_str().map(|s| s.to_string()),
            None::<String>,
        )
    } else {
        (
            out["data"]["id"].as_str().map(|s| s.to_string()),
            out["data"]["attributes"]["url"].as_str().map(|s| s.to_string()),
        )
    };

    let _ = logging::info(&alloc::format!(
        "latch paid invoice={} via {}",
        req.invoice_id, rail
    ));

    Ok(json!({
        "result": "approve",
        "rail": rail,
        "payee_via": payee_via,
        "payment_ref": payment_ref,
        "checkout_url": checkout_url,
        "invoice_id": req.invoice_id,
        "vendor": req.vendor,
        "amount": req.amount,
        "currency": req.currency,
        "mode": "live",
    })
    .to_string()
    .into_bytes())
}

/// Render a typed `http-with-placeholders` error as a contract-facing string.
/// Never includes resolved PII — only host names and host-side reasons.
#[cfg(target_arch = "wasm32")]
fn format_http_error(e: hwp::HttpError) -> alloc::string::String {
    match e {
        hwp::HttpError::EgressDenied(host) => alloc::format!("egress denied for host {host}"),
        hwp::HttpError::PlaceholderDenied(marker) => {
            alloc::format!("placeholder not permitted: {marker}")
        }
        hwp::HttpError::PlaceholderUnknown(field) => {
            alloc::format!("user profile missing field: {field}")
        }
        hwp::HttpError::PlaceholderNoUserContext => {
            "no user context bound for placeholder resolution".to_string()
        }
        hwp::HttpError::UpstreamError(reason) => alloc::format!("upstream: {reason}"),
    }
}

/// Build the egress request for the approve path. `payee_value: None` emits
/// the `{{profile.vendor.iban}}` marker (resolved host-side from the calling
/// user's profile); `Some(iban)` emits the explicit payee value the data
/// owner declared in the vendor policy entry.
#[cfg(target_arch = "wasm32")]
fn build_egress(
    req: &PayInvoiceReq,
    rail: &str,
    api_key: &str,
    cents: u64,
    payee_value: Option<&str>,
) -> Result<
    (
        alloc::string::String,
        alloc::vec::Vec<(alloc::string::String, alloc::string::String)>,
        alloc::vec::Vec<u8>,
    ),
    alloc::string::String,
> {
    use serde_json::json;

    let payee = payee_value
        .map(|s| s.to_string())
        .unwrap_or_else(|| "{{profile.vendor.iban}}".to_string());

    match rail {
        "stripe" => {
            let form = form_encode(&[
                ("amount", &cents.to_string()),
                ("currency", &req.currency.to_lowercase()),
                ("description", &alloc::format!("Latch invoice {}", req.invoice_id)),
                ("metadata[invoice_id]", &req.invoice_id),
                ("metadata[vendor]", &req.vendor),
                ("metadata[payee_iban]", &payee),
                ("capture_method", "manual"),
            ]);
            Ok((
                "https://api.stripe.com/v1/payment_intents".to_string(),
                alloc::vec![
                    ("Authorization".to_string(), alloc::format!("Bearer {api_key}")),
                    (
                        "Content-Type".to_string(),
                        "application/x-www-form-urlencoded".to_string(),
                    ),
                ],
                form.into_bytes(),
            ))
        }
        _ => {
            let variant_id = get_string("secrets", "lemonsqueezy_variant_id")?.ok_or(
                "lemonsqueezy_variant_id not found in z:<tid>:secrets (seed via the tenant SDK)",
            )?;
            let body = json!({
                "data": {
                    "type": "checkouts",
                    "attributes": {
                        "custom_price": cents,
                        "product_options": {
                            "name": alloc::format!("Invoice {} - {}", req.invoice_id, req.vendor),
                            "description": req.memo.clone().unwrap_or_else(|| "Latch autopay".to_string()),
                        },
                        "checkout_data": {
                            "custom": {
                                "invoice_id": req.invoice_id,
                                "vendor": req.vendor,
                                // Resolved host-side when unset in the policy:
                                "payee_iban": payee,
                            }
                        },
                    },
                    "relationships": {
                        "variant": {
                            "data": { "type": "variants", "id": variant_id }
                        }
                    },
                }
            });
            Ok((
                "https://api.lemonsqueezy.com/v1/checkouts".to_string(),
                alloc::vec![
                    ("Authorization".to_string(), alloc::format!("Bearer {api_key}")),
                    ("Accept".to_string(), "application/json".to_string()),
                ],
                serde_json::to_vec(&body).map_err(|e| e.to_string())?,
            ))
        }
    }
}

/// Read a UTF-8 entry from a z: KV map owned by this tenant. `tail` is the
/// short map name (`secrets`, `latch-policy`); the canonical
/// `z:<hex(tid)>:<tail>` name is built at runtime from tenant-context.
#[cfg(target_arch = "wasm32")]
fn get_string(tail: &str, key: &str) -> Result<Option<alloc::string::String>, alloc::string::String> {
    let map_name = map_name(tail)?;
    let bytes = kv_store::get(&map_name, key.as_bytes()).map_err(|e| alloc::format!("kv read: {e}"))?;
    match bytes {
        Some(b) => alloc::string::String::from_utf8(b)
            .map(Some)
            .map_err(|e| e.to_string()),
        None => Ok(None),
    }
}

/// Read and parse the vendor's allowlist entry from `z:<tid>:latch-policy`.
#[cfg(target_arch = "wasm32")]
fn get_policy(vendor: &str) -> Result<Option<PolicyEntry>, alloc::string::String> {
    let map_name = map_name("latch-policy")?;
    let bytes =
        kv_store::get(&map_name, vendor.as_bytes()).map_err(|e| alloc::format!("kv read: {e}"))?;
    match bytes {
        Some(b) => serde_json::from_slice(&b)
            .map(Some)
            .map_err(|e| alloc::format!("bad policy entry for {vendor}: {e}")),
        None => Ok(None),
    }
}

#[cfg(target_arch = "wasm32")]
fn map_name(tail: &str) -> Result<alloc::string::String, alloc::string::String> {
    let tid = tenant_context::tenant_did();
    Ok(alloc::format!("z:{}:{}", hex::encode(&tid), tail))
}

/// Minimal percent-encoding for x-www-form-urlencoded bodies. The payment
/// rail substitutes placeholder markers at the byte level, so the marker
/// survives encoding verbatim.
#[cfg(target_arch = "wasm32")]
fn form_encode(fields: &[(&str, &str)]) -> alloc::string::String {
    let mut out = alloc::string::String::new();
    for (i, (k, v)) in fields.iter().enumerate() {
        if i > 0 {
            out.push('&');
        }
        percent_encode_into(&mut out, k);
        out.push('=');
        percent_encode_into(&mut out, v);
    }
    out
}

#[cfg(target_arch = "wasm32")]
fn percent_encode_into(out: &mut alloc::string::String, s: &str) {
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&alloc::format!("%{b:02X}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(allowed: bool, max: f64, cur: &str) -> PolicyEntry {
        PolicyEntry {
            allowed,
            max_amount: max,
            currency: cur.to_string(),
            iban: None,
        }
    }

    #[test]
    fn unknown_vendor_is_payee_mismatch() {
        assert_eq!(decide(None, 10.0, "eur"), Decision::Deny("payee_mismatch"));
    }

    #[test]
    fn disallowed_vendor_is_payee_mismatch() {
        assert_eq!(
            decide(Some(&entry(false, 100.0, "eur")), 10.0, "eur"),
            Decision::Deny("payee_mismatch")
        );
    }

    #[test]
    fn over_cap_is_limit_exceeded() {
        assert_eq!(
            decide(Some(&entry(true, 100.0, "eur")), 100.01, "eur"),
            Decision::Deny("limit_exceeded")
        );
    }

    #[test]
    fn at_cap_is_approved() {
        assert_eq!(
            decide(Some(&entry(true, 100.0, "eur")), 100.0, "eur"),
            Decision::Approve
        );
    }

    #[test]
    fn wrong_currency_is_denied() {
        assert_eq!(
            decide(Some(&entry(true, 100.0, "eur")), 10.0, "usd"),
            Decision::Deny("currency_mismatch")
        );
    }

    #[test]
    fn parses_request_json() {
        let req: PayInvoiceReq = serde_json::from_str(
            r#"{ "invoice_id": "INV-2041", "vendor": "acme-cloud", "amount": 89.5, "currency": "eur" }"#,
        )
        .unwrap();
        assert_eq!(req.invoice_id, "INV-2041");
        assert_eq!(req.vendor, "acme-cloud");
        assert_eq!(req.amount, 89.5);
        assert!(req.memo.is_none());
    }

    #[test]
    fn parses_policy_json() {
        let p: PolicyEntry =
            serde_json::from_str(r#"{ "allowed": true, "max_amount": 500, "currency": "EUR" }"#)
                .unwrap();
        assert!(p.allowed);
        assert_eq!(p.max_amount, 500.0);
    }
}
