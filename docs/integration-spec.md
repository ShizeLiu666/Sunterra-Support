# Integration Specification

> Version: v1.1 strict
>
> Current implementation target: `milestone-2` Preview.

This document is the source of truth for the ShinePhone App -> Sunterra Support
signed URL contract used by the strict v1.1 implementation.

## Status

`milestone-2` implements the strict v1.1 terminal contract:

- Single selected-device SN only.
- All 8 v1.1 URL keys are required.
- No legacy multi-SN or old-field compatibility is retained on `milestone-2`.
- `deviceType` / `deviceModel` are displayed to the customer on the confirm
  page, but are not written to Salesforce yet because `Customer_Care__c` has no
  device fields.

## Data Flow

```text
ShinePhone App
  -> opens signed URL in WebView
Sunterra Support Web
  -> verifies required keys, timestamp, deviceType enum, and HMAC
  -> shows pre-filled ticket form
  -> customer confirms/completes details
Sunterra Server (/api/submit)
  -> re-verifies the original signed URL params
  -> creates Customer_Care__c in Salesforce
Salesforce
  -> stores the support ticket
```

## Final URL Format

ShinePhone must pass a plain query string with flat camelCase keys. No JSON,
Base64 envelope, or request body is used.

The final URL display order is mandatory:

```text
email -> name -> address -> sn -> deviceType -> deviceModel -> timestamp -> sign
```

Example:

```text
https://support.sunterra.com.au/?email=john%40example.com&name=John%20Smith&address=62%20Tyler%20Cres%2C%20Tarneit%2C%20VIC&sn=SN0001ABCD&deviceType=battery&deviceModel=ARK-10.2H-A1&timestamp=1716200000&sign=<hmac_hex>
```

The URL is URL-encoded in the browser-visible query string. The HMAC input is
not URL-encoded; see "Signature Algorithm" below.

## Required Fields

All 8 keys must be present in the final URL.

| Key           | Type                    | Value rule                                                    |
|---------------|-------------------------|---------------------------------------------------------------|
| `email`       | string                  | Key required. May be empty as `email=`.                       |
| `name`        | string                  | Key required. May be empty as `name=`.                        |
| `address`     | string                  | Key required. May be empty as `address=`.                     |
| `sn`          | string                  | Required non-empty. Exactly one selected problem-device SN.   |
| `deviceType`  | enum                    | Required non-empty. Must be `inverter` or `battery`.          |
| `deviceModel` | string                  | Required non-empty. Model of the selected device.             |
| `timestamp`   | integer string seconds  | Required non-empty. Unix timestamp in seconds.                |
| `sign`        | lowercase hex string    | Required non-empty. HMAC-SHA256 signature.                    |

### SN Rule

`sn` must identify the exact device selected by the user before entering
Sunterra Support.

- If the customer selected a battery, send the battery SN.
- If the customer selected an inverter, send the inverter SN.
- Do not send all system SNs.
- Do not send comma-separated multi-SN values.

The strict `milestone-2` implementation does not preserve old multi-SN
compatibility. Old links that omit any v1.1 key are rejected with
`/expired?reason=missing_params`.

### Device Context

`deviceType` describes the selected `sn` and must be one of:

- `inverter`
- `battery`

`deviceModel` describes the selected device model, for example:

- Battery selected: `sn=BAT123456&deviceType=battery&deviceModel=ARK-10.2H-A1`
- Inverter selected: `sn=INV123456&deviceType=inverter&deviceModel=MIN3000TL-XH`

## Signature Algorithm

The signing canonicalization must be identical on both sides. Mismatched
canonicalization is the most common integration bug.

1. Collect every v1.1 URL field except `sign`.
2. Keep fields with empty values. Empty values are signed exactly as `key=`.
3. Sort by field name ascending.
4. Join as `key=value&key=value&...`.
5. Use raw values in the HMAC input. Do not URL-encode values inside the signed
   string. URL encoding happens only when assembling the final URL.
6. Compute `HMAC-SHA256(joined_string, shared_secret)`.
7. Encode the digest as lowercase hex and place it in `sign`.

Important correction from the previous document: empty values are **not**
dropped before signing. `email=`, `name=`, and `address=` must remain in both
the final URL and the HMAC input.

### Worked Example

Final URL display order:

```text
email=john@example.com&name=John Smith&address=62 Tyler Cres, Tarneit, VIC&sn=SN0001ABCD&deviceType=battery&deviceModel=ARK-10.2H-A1&timestamp=1716200000&sign=<hmac_hex>
```

HMAC input after sorting by field name:

```text
address=62 Tyler Cres, Tarneit, VIC&deviceModel=ARK-10.2H-A1&deviceType=battery&email=john@example.com&name=John Smith&sn=SN0001ABCD&timestamp=1716200000
```

Empty contact/address example:

```text
address=&deviceModel=ARK-10.2H-A1&deviceType=battery&email=&name=&sn=SN0001ABCD&timestamp=1716200000
```

The implementation is locked by `tests/hmac.spec.ts`, including the spec v1.1
worked example and the empty-value example.

## Verification Behavior

Initial page load and `/api/submit` both verify the signed token.

- Missing any of the 8 required keys -> `/expired?reason=missing_params`.
- Blank `sn`, `deviceType`, `deviceModel`, `timestamp`, or `sign` ->
  `/expired?reason=missing_params`.
- Blank `email`, `name`, or `address` is allowed if the key is present and
  signed as `key=`.
- `deviceType` outside `inverter` / `battery` ->
  `/expired?reason=malformed`.
- Invalid HMAC -> `/expired?reason=invalid_signature`.
- Expired timestamp -> `/expired?reason=expired`.

`/api/submit` forwards all received signed params generically for re-verification
instead of rebuilding a hard-coded whitelist. This prevents future signed fields
from being accidentally dropped and causing submit-time `invalid_signature`.

## Token Lifetime

- `timestamp` is checked against server-side `TOKEN_TTL_SECONDS` (default
  86400 = 24 hours).
- Timestamps further than 5 minutes in the future are rejected as malformed.
- Expired or tampered URLs land on `/expired?reason=...` with reason-specific
  copy.

## Security Requirements

1. All Salesforce credentials live on the server and are never exposed to the
   client.
2. URL signature prevents tampering with customer, device, and timestamp
   fields.
3. 24-hour expiry limits replay attacks.
4. HTTPS only in deployed environments.
