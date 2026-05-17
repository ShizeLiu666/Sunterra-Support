# Integration Specification

This document tracks the technical integration between ShinePhone App and Sunterra Support web.

## Status: ⏳ PENDING - awaiting Growatt confirmation

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

## URL parameter spec (PROPOSED, not yet confirmed)

When ShinePhone redirects users to our web:

https://support.sunterra.com.au/?data=<base64>&timestamp=<unix>&sign=<hmac> 

### data (Base64-encoded JSON)
Contains user and installation info. Decoded JSON:
```json
{
  "userId": "growatt user id",
  "name": "customer full name",
  "address": "installation address",
  "sn": "inverter serial number",
  "inverterModel": "e.g. Growatt SPH 6000",
  "plantId": "growatt plant id",
  "phone": "customer phone (optional)"
}
```

### timestamp
Unix timestamp (seconds) when the URL was generated.
- Valid for 24 hours after this time
- After expiry, web shows /expired page

### sign
HMAC-SHA256 signature of `data + timestamp` using shared secret.
- Prevents URL forgery
- Shared secret must be securely exchanged between Growatt and Sunterra

## Open questions (need Growatt confirmation)

- [ ] Which fields can ShinePhone actually pass? (SN is required)
- [ ] System browser or in-app WebView for redirect?
- [ ] Can Growatt implement HMAC signing? How to exchange secret?
- [ ] 24-hour expiry acceptable?
- [ ] Testing approach during integration?
- [ ] R&D contact person on Growatt side?

## Security requirements

1. All Salesforce credentials live on server (never client)
2. URL signature prevents tampering
3. 24-hour expiry limits replay attacks
4. HTTPS only
