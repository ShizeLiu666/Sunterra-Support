# Sunterra Support — Project Handover

> Last updated: 2026-05-20
> Status: ~80% complete, ready for Salesforce integration

## Quick start

1. Install: `npm install`
2. Copy env: `cp .env.example .env.local`
3. Generate HMAC: `openssl rand -hex 32` → fill into `HMAC_SECRET` in `.env.local`
4. Add Salesforce Connected App credentials (Client Credentials Flow): `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`, `SALESFORCE_INSTANCE_URL`
5. Run: `npm run dev`
6. Test: visit `http://localhost:3000/dev/test-link`, generate a URL, open it

## Project overview

A mobile-first web app that lets Sunterra solar customers submit support tickets directly from their Growatt ShinePhone App. Sunterra has installed 3000+ solar systems in Australia; this self-service web form is expected to handle ~80% of support cases remotely instead of via phone.

User journey: customer taps "Support" in ShinePhone → ShinePhone opens a signed URL into our web with installation pre-filled → user picks problem type, describes issue, optionally uploads photos → form submits → Salesforce Case auto-created and routed to a Sunterra engineer.

See `docs/project-overview.md` for full business context.

## Architecture

```
[ShinePhone App]
       │  HTTP GET with signed URL
       │  (flat camelCase query params: sn, timestamp, sign, + optional name/email/address/inverterModel/language)
       ▼
[Sunterra Support Web - app/page.tsx]
       │  Server: verifyToken() — HMAC SHA256 + 24h TTL
       │    ✓ valid    → render <SupportApp />
       │    ✗ invalid  → redirect /expired?reason=…
       ▼
[Client: SupportApp]
       │  React state holds editable installation data
       │  User edits name/email/address (sn locked, inverterModel read-only)
       ▼
[Form submit]
       │  POST /api/submit  ⚠️ stub today
       ▼
[Salesforce Case]  ⚠️ lib/salesforce.ts stub today
       │  Flow auto-matches Case to Installation by SN
       ▼
[Done]
```

Key technical decisions:
- **Next.js 16 App Router** — server components by default; pages do token verification + redirect, client wrapper holds form state.
- **HMAC-SHA256 + 24h TTL** for URL token verification. 5-minute clock skew allowed for "timestamp in future" rejection.
- **Flat camelCase URL params** (not base64-encoded JSON envelope). Algorithm: collect all params except `sign`, sort alphabetically, join as `k=v&k=v` (no URL encoding inside the signed string), HMAC-SHA256, lowercase hex.
- **Client-side state** for user-editable installation data (`components/support-app.tsx`).
- **Client Credentials Flow** for Salesforce OAuth (no username/password needed; "Run As User" configured in the Connected App itself).
- **Per-field lazy env validation** (`lib/env.ts`) — each env var validated only when first accessed, so token-only code paths don't require SF credentials.

## Completed phases

- ✅ **Phase 1** — UI shell (mobile-first, Tailwind v4, brand colors)
- ✅ **Phase 2A** — Canonical schema (`types/installation.ts`), unified across URL parsing / token / UI / Salesforce
- ✅ **Phase 2B** — Environment variables (`lib/env.ts` per-field lazy validation; `.env.example`; `.gitignore`)
- ✅ **Phase 2C** — HMAC core (`lib/hmac.ts`), URL builder (`lib/sign-url.ts`), dev test-link generator (`/dev/test-link` + `/api/dev/build-link`)
- ✅ **Phase 2D-1** — Token verification logic (`lib/token.ts`) + full `/expired` page with reason-specific copy
- ✅ **Phase 2D-2** — Homepage URL parsing, server-side verifyToken, redirect on failure
- ✅ **Phase 2E-1** — State elevation: created `components/support-app.tsx` (client wrapper)
- ✅ **Phase 2E-2** — Editable installation fields (click-to-edit, blur to save) + new `email` field + wiring to `TicketForm`

## What works right now

End-to-end local flow:
1. Visit `/dev/test-link` → fill form → "Generate test URL"
2. Open the generated URL → `SupportApp` renders with installation data parsed from URL
3. User can edit `name`, `email`, `address` (each row tap → input, blur to save, Enter saves, Escape cancels)
4. `sn` stays locked (mono font, "Verified" pill on card header)
5. `inverterModel` displayed read-only (no Pencil affordance)
6. Click **Submit ticket** → DevTools console shows full payload: `{ installationData, problemType, description, photoCount }`

Token verification handles all failure reasons (verified via curl in 2D-2 / 2E-1):
- Missing required params (`sn`, `timestamp`, `sign`) → `/expired?reason=missing_params`
- Bad signature → `/expired?reason=invalid_signature`
- Timestamp older than `TOKEN_TTL_SECONDS` (default 86400) → `/expired?reason=expired`
- Timestamp >5 min in future, or unparseable → `/expired?reason=malformed`

No URL params at all:
- **Dev**: shows fallback mock data with a "(showing fallback mock data — no URL params)" banner
- **Prod**: redirects to `/expired?reason=missing_params`

## What's NOT done yet

- ⏳ **Phase 2F — Salesforce API integration**
  - `lib/salesforce.ts` is a stub (throws `"Salesforce API not yet implemented"`)
  - Need: `getAccessToken()` via Client Credentials Flow, `createCase()` calling `/services/data/v62.0/sobjects/Case`, token caching (~2h TTL)
- ⏳ **Phase 2G — Real form submission**
  - `app/api/submit/route.ts` returns `{ success: true, data: { message: "hello world" } }` placeholder
  - Need: re-verify token server-side, call `createCase()`, return `{ success, caseId } | { success: false, error }`
  - `components/ticket-form.tsx`: replace console.log with real `fetch('/api/submit')`, add loading/success/error UI states, redirect to `/success?caseId=…`
- ⏳ **Phase 2H — Photo upload to cloud storage**
  - Photos currently exist as local `File` objects with object URLs for preview only
  - Need: Vercel Blob or S3 upload before form submit, then attach URLs to Case
- ⏳ **`/success` page** — currently a placeholder; needs case-ID display + "what happens next" copy
- ⏳ **Production deployment** — custom domain `support.sunterra.com.au` pending (currently on Vercel default)

Pending Salesforce-side configuration (Lily):
- Case object custom fields: `SN__c` (inverter SN), `InstallationAddress__c`, `ContactEmail__c`, etc.
- **Flow 1**: auto-match Case to Installation by SN on Case create
- Connected App "Run-As User" verified to have Create Case + Read Installation permissions

Pending Growatt-side (Harrison):
- URL parameter spec is verbally confirmed (flat camelCase + HMAC-SHA256). Need written confirmation + signed secret exchange procedure.
- Test APK for end-to-end integration testing
- Decision: in-app WebView vs system browser for redirect

## Key files

```
project-root/
├── app/
│   ├── layout.tsx                       Root layout (server)
│   ├── page.tsx                         Server: token verification + redirect, delegates rendering to <SupportApp />
│   ├── globals.css                      Tailwind v4 @theme with sunterra-* color tokens
│   ├── expired/page.tsx                 Error page with reason-specific copy (4 reasons + default)
│   ├── success/page.tsx                 ⚠️ Placeholder - to be built in 2G
│   ├── dev/test-link/
│   │   ├── page.tsx                     Server: blocks in prod, renders <TestLinkClient />
│   │   └── TestLinkClient.tsx           Form to build signed test URLs (valid/expired/tampered/missing_sn)
│   └── api/
│       ├── submit/route.ts              ⚠️ Stub - to be implemented in 2G
│       └── dev/build-link/route.ts      Dev-only URL signing endpoint (404 in prod)
├── components/
│   ├── support-app.tsx                  Client wrapper, holds installationData state, wires onChange + TicketForm prop
│   ├── installation-info.tsx            Editable card: EditableRow (name/email/address) + ReadOnlyRow (inverter) + LockedRow (sn)
│   ├── ticket-form.tsx                  Problem type grid + description + photo upload; receives installationData prop
│   └── brand-header.tsx                 Logo + "Sunterra Support" title
├── lib/
│   ├── env.ts                           Per-field lazy env validation (HMAC group + Salesforce group + runtime)
│   ├── hmac.ts                          buildSignString / computeSignature / verifySignature (timing-safe)
│   ├── sign-url.ts                      buildSignedUrl() for dev test-link
│   ├── token.ts                         verifyToken(URLSearchParams) — missing/malformed/expired/invalid_signature
│   └── salesforce.ts                    ⚠️ Stub - to be implemented in 2F
├── types/
│   └── installation.ts                  InstallationData / UrlParams / TokenVerificationResult / TicketSubmission
└── docs/
    ├── project-overview.md              Business context (stable)
    ├── integration-spec.md              ⚠️ Slightly stale - see "Known issues" below
    └── handover.md                      ← This file
```

## Conventions established

- **Field naming**: camelCase (matches URL params from ShinePhone)
- **Required URL params**: `sn`, `timestamp`, `sign`
- **Optional URL params**: `name`, `email`, `address`, `inverterModel`, `language`
- **HMAC algorithm**: collect all params except `sign`, sort keys alphabetically, join as `k=v&k=v` (raw values, no URL encoding inside the signed string), HMAC-SHA256, lowercase hex
- **Component exports**: mixed — `TicketForm` / `BrandHeader` are named exports, `InstallationInfo` and `SupportApp` are default exports. ⚠️ Cleanup candidate.
- **Env access**: `import { env } from '@/lib/env';` — each field validated lazily on first access. Use `validateEnv({ skipSalesforce: true })` for token-only contexts (currently unused).
- **Dev tools** (`/dev/*` pages and `/api/dev/*` routes) gated by `process.env.NODE_ENV === 'development'`
- **Error responses** from API routes: `{ success: boolean, data?: any, error?: string }` (per `.cursorrules`)

## Known issues / tech debt

- `tests/ui.spec.ts` (Playwright) references **old mock strings** (`"12 Pine Street"`, `"YRP0F7G0CG"`, `"Growatt SPH 6000"`) and the old DOM structure of `InstallationInfo`. Several assertions will fail at runtime. **Defer to test-phase cleanup.**
- **`docs/integration-spec.md` is stale**:
  - URL format section still says `?data=<base64>&timestamp=...&sign=...` — actual impl is flat camelCase query params.
  - "Open questions" still lists `[ ] Can Growatt implement HMAC signing?` and `[ ] Which fields can ShinePhone actually pass?` — both verbally resolved during 2C. Should be moved to "Confirmed" / status updated to ✅.
- **Import style mixed** in `components/support-app.tsx` (named imports for BrandHeader/TicketForm, default import for InstallationInfo). Pick a convention and standardize in a follow-up.
- **`useEffect` in `InstallationInfo`** has `// eslint-disable-next-line react-hooks/set-state-in-effect` on the draft-sync effect. Modern React 19 guidance is to use `key={value}` or derive-during-render instead. Refactor candidate.
- **`README.md` line 60** mentions removed `SALESFORCE_USERNAME` / `SALESFORCE_PASSWORD`. Should be rewritten to reflect Client Credentials Flow.
- **Production deployment not configured yet** — custom domain `support.sunterra.com.au` pending; currently on Vercel default URL.
- **Unused `TicketSubmission` type** in `types/installation.ts` — defined but not yet imported anywhere. Will be used in 2G.

## How the team is working

- **Jack** — Sunterra tech lead, project coordinator (you)
- **Lily** — Sunterra ops director, project owner, Salesforce admin (SA, Australia)
- **Harrison (Growatt)** — ShinePhone integration partner (China)
- **Claude** — provides strategy and writes Cursor prompts
- **Cursor Opus 4.7** — code execution

Communication pattern:
1. Claude writes structured task prompts with explicit constraints (forbidden / required lists)
2. Cursor reports back: file changes, `tsc --noEmit` + `npm run lint` results, curl verification, observations on spec issues
3. Jack reviews report → approves next phase or asks for revision
4. Phases are numbered (1, 2A, 2B, 2C, 2D-1, 2D-2, 2E-1, 2E-2, …) for traceability

## Next immediate task — Phase 2F: Salesforce API integration

Concrete steps:

1. **Implement `lib/salesforce.ts`**:
   - `getAccessToken()` using Client Credentials Flow:
     - `POST {SALESFORCE_INSTANCE_URL}/services/oauth2/token` with `grant_type=client_credentials`, `client_id`, `client_secret`
     - Returns `{ access_token, instance_url, ... }`
   - **In-memory token cache** (SF tokens valid ~2h) — re-fetch only when expired or on 401
   - `createCase(input: CreateCaseInput)`:
     - `POST {instance_url}/services/data/{SALESFORCE_API_VERSION}/sobjects/Case`
     - Body: `{ Subject, Description, SN__c, ContactEmail__c, ... }` (field mapping TBD with Lily)
     - On 401 → retry once after refreshing token
     - Return `{ caseId }` or throw with structured error

2. **Implement `app/api/submit/route.ts`**:
   - Read body: `{ installationData, problemType, description }` (Phase 2H will add photos)
   - Re-verify token server-side (defense in depth — client could have tampered)
   - Call `createCase()`
   - Return `{ success: true, data: { caseId } }` or `{ success: false, error: "…" }` with appropriate HTTP status

3. **Update `components/ticket-form.tsx`** (UI changes finally allowed):
   - Replace `console.log` in `handleSubmit` with real `fetch('/api/submit', { method: 'POST', body: JSON.stringify({...}) })`
   - Add `isSubmitting` state → disable button + show spinner
   - Add success state → redirect to `/success?caseId=…`
   - Add error state → show friendly error message above submit button

4. **Build `/success` page** — show case number, "we'll be in touch within 24h" copy, link back to ShinePhone.

**Acceptance**: end-to-end test from `/dev/test-link` generates a real Case in Salesforce sandbox, visible in SF UI within seconds, with all installation data correctly mapped.
