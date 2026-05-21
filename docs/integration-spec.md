# Integration Specification

> Version: v1.1 — post-Phase-2F alignment

This document tracks the technical integration between ShinePhone App and Sunterra Support web.

## Status: ✅ URL contract confirmed; awaiting production secret exchange + test APK

## Data flow
[ShinePhone App]
↓ HTTP GET with signed URL
[Sunterra Support Web]
↓ Validate signature & timestamp
↓ Show pre-filled form
↓ User submits
[Sunterra Server]
↓ POST to Salesforce REST API
[Salesforce]
↓ Create Case
↓ Trigger Flow 1 (match Installation by SN)
[Done]

## URL parameter spec

When ShinePhone redirects users to the support web, parameters are passed as
**flat camelCase query-string fields** (no Base64 envelope, no JSON blob).

```
https://support.sunterra.com.au/?sn=<serial>&timestamp=<unix>&sign=<hmac>
    &name=<...>&email=<...>&address=<...>&inverterModel=<...>&language=<...>
```

### Required parameters

| Name        | Type    | Notes                                                                 |
|-------------|---------|-----------------------------------------------------------------------|
| `sn`        | string  | Inverter serial number; identifies the user's installation.           |
| `timestamp` | integer | Unix timestamp in **seconds** at the moment the URL was generated.    |
| `sign`      | string  | HMAC-SHA256 signature, lowercase hex (see algorithm below).           |

### Optional parameters

All optional fields pre-fill the form so the customer doesn't retype known
information. Any subset may be sent; missing fields are simply blank in the UI.

| Name            | Notes                                          |
|-----------------|------------------------------------------------|
| `name`          | Customer full name.                            |
| `email`         | Customer email (primary contact).              |
| `address`       | Installation address (single string).          |
| `inverterModel` | e.g. `MIN3000TL-XH`.                           |
| `language`      | BCP-47 language tag, e.g. `en-AU` or `zh-CN`.  |

### Signature algorithm

The signing canonicalisation is identical on both sides; mismatched
canonicalisation is the most common integration bug.

1. Collect every query parameter **except `sign`**.
2. Drop parameters whose value is empty or absent.
3. Sort the remaining keys **alphabetically (ascending)**.
4. Join as `key=value&key=value&...`. **Values are used raw** — do not
   URL-encode inside the signed string. URL-encoding happens only when the
   final URL is assembled.
5. Compute `HMAC-SHA256(joined_string, shared_secret)`.
6. Express the digest as **lowercase hex**. That is `sign`.

### Token lifetime

- `timestamp` is checked against server-side `TOKEN_TTL_SECONDS` (default
  86400 = 24 hours).
- Timestamps further than ~5 minutes in the future are rejected as malformed
  (clock-skew guard).
- Expired or tampered URLs land on `/expired?reason=...` with reason-specific
  copy.

## Open questions

- ✅ **Which fields can ShinePhone actually pass?** Confirmed (Growatt, 2026-05-12):
  required = `sn` / `timestamp` / `sign`; optional = `name` / `email` /
  `address` / `inverterModel` / `language`.
- ✅ **Can Growatt implement HMAC signing? How to exchange secret?** Confirmed
  (Growatt, 2026-05-12): HMAC-SHA256 implementable; secret to be exchanged
  out-of-band before production cut-over.
- [ ] System browser or in-app WebView for redirect?
- [ ] 24-hour expiry acceptable in practice, or should it be shorter?
- [ ] Testing approach during integration (staging APK, beta channel, …)?
- [ ] Named R&D contact on the Growatt side for the integration window?

## Security requirements

1. All Salesforce credentials live on server (never client)
2. URL signature prevents tampering
3. 24-hour expiry limits replay attacks
4. HTTPS only
