# Sunterra Support — Project Handover

> Last updated: 2026-05-20 (after Phase 2F completion)
>
> This file is the single source of truth for project state.
> Read this first when joining the project or starting a new chat session.
> It is intentionally self-contained — you should be able to understand the
> project without opening any other file.

## What this project is

Sunterra is an Australian rooftop-solar installer with ~3,000 systems deployed,
all using Growatt inverters monitored by the Growatt **ShinePhone App**. When a
customer hits a problem, ShinePhone offers a "Support" entry that deep-links to
this web app with the user's installation pre-filled.

This web app is a single-purpose mobile-first ticket-submission form: the user
picks a problem type, types a description, optionally adds photos, and submits.
The server creates a `Customer_Care__c` record in Salesforce; downstream
automation in Salesforce (owned by Sunterra Ops) routes the case to a support
engineer. The web app's responsibilities end at "case created in SF".

## Architecture

```
   ┌──────────────────────┐
   │ Growatt ShinePhone   │  user taps "Support"
   └─────────┬────────────┘
             │  signed deep-link (flat camelCase query params,
             │  HMAC-SHA256, 24h TTL)
             ▼
   ┌──────────────────────┐
   │ Next.js  app/page.tsx│  server: verifyToken()
   │                      │  ✗ invalid → /expired?reason=…
   └─────────┬────────────┘
             │ ✓ valid
             ▼
   ┌──────────────────────┐
   │ <SupportApp />       │  client wrapper, edits to name/email/address
   │  └─ <TicketForm />   │  problem type + description + photos
   └─────────┬────────────┘
             │  POST /api/submit  ({ token, form })
             ▼
   ┌──────────────────────┐
   │ /api/submit          │  re-verify token, map fields,
   │   lib/salesforce.ts  │  call Salesforce REST API
   └─────────┬────────────┘
             │  POST /sobjects/Customer_Care__c
             ▼
   ┌──────────────────────┐
   │ Salesforce sandbox   │  Customer_Care__c row created
   │ + downstream Flow*   │  *Flow owned by Sunterra Ops, not us
   └──────────────────────┘
```

## Tech stack

- **Next.js 16** (App Router, Turbopack)
- **TypeScript** (strict)
- **Tailwind CSS v4**
- **Salesforce REST API** via OAuth 2.0 **Client Credentials Flow**
  (External Client App, no username/password)
- **Node `crypto`** for HMAC-SHA256
- **Vercel** as deployment target (not yet provisioned)

No client-side data libraries (no SWR / React Query), no form library, no UI
kit. Everything is hand-rolled — keep it that way unless you have a strong
reason.

## Salesforce data model (CRITICAL — read carefully)

### Object naming

| Label (UI)     | API name           | Purpose                              |
|----------------|--------------------|--------------------------------------|
| "Case"         | `Customer_Care__c` | Support tickets (51 fields)          |
| "Installation" | `Job__c`           | Customer installations (190 fields)  |

**Warning**: Sunterra's internal language calls the object "Installation" but
its API name is `Job__c`. All code MUST use `Job__c`. The previous handover
incorrectly referred to it as `Installation__c` — **there is no such object**.

### Relationship

`Customer_Care__c.Job_Number__c` → Lookup → `Job__c`

### SN matching (CRITICAL design decision)

ShinePhone passes the inverter SN in the URL. To match it to an Installation:

- `Job__c.Inverter_Battery_Serials__c` is a Long Text Area (32k chars), storing
  multiple SNs concatenated (avg 5.6 SNs per Job).
- **Salesforce forbids Long Text Area fields in SOQL `WHERE` clauses.**
- **SOSL also rejects SNs containing `-`** (reserved as the Lucene `NOT`
  operator), and a sizeable fraction of real-world inverter SNs include `-`.

Therefore the design decision (finalised 2026-05-20):

> **The web layer does NOT query SN → `Job__c`.**
>
> 1. Web creates `Customer_Care__c` with the raw SN in
>    `Inverter_Battery_Serials__c` (plain text).
> 2. `Job_Number__c` is left blank (lookup unset).
> 3. A Salesforce Flow on the Sunterra side (owned by Ops) reconciles SN →
>    `Job__c` after-the-fact.
> 4. If Flow can't match: manual processing by the Sunterra support team.

**Do not re-implement SN lookup on the web side.** Both SOQL and SOSL were
prototyped and rejected. This decision is final.

## Salesforce environment

### Sandbox (development — what we use)

- URL: `https://sunterra--dev.sandbox.my.salesforce.com`
- Type: Developer Sandbox (200 MB, free)
- Region: Hyperforce AUS4S
- Created: 2026-05-19

### Production

- URL: `https://sunterra.my.salesforce.com`
- **Do not touch.** No code in this repo currently points at production.

### External Client App

- Name: `Sunterra Support Web App`
- API name: `Sunterra_Support_Web_App`
- OAuth flow: **Client Credentials**
- Run As: `jack.liu@sunterra.com.au.dev` (User ID `0058s00000JNvFZAA1`)
- Profile: `Salesforce API Only System Integrations`
- License: `Salesforce Integration` (free)
- Note: the Integration User cannot log in via the SF UI (API-only restriction)
  — this is expected.

### Permission Set

- Name: `Sunterra Support API Access`
- Assigned to the Integration User above
- Object permissions:
  - `Customer_Care__c` — Read / Create / Edit
  - `Job__c` — Read (kept for future Flow / read-only diagnostics)
- Field-level security: full read/edit on all fields the web layer touches

### API version

- `v62.0` — set via `SALESFORCE_API_VERSION` in `.env.local`

## Completed phases

- ✅ **Phase 1** — UI shell (mobile-first, Tailwind v4, brand colours)
- ✅ **Phase 2A** — Canonical schema (`types/installation.ts`), unified across
  URL parsing / token / UI / Salesforce
- ✅ **Phase 2B** — Per-field lazy env validation (`lib/env.ts`)
- ✅ **Phase 2C** — HMAC core (`lib/hmac.ts`), URL builder (`lib/sign-url.ts`),
  dev test-link generator (`/dev/test-link` + `/api/dev/build-link`)
- ✅ **Phase 2D-1/2** — `verifyToken()` (`lib/token.ts`), `/expired` page,
  homepage URL parsing + redirect on failure
- ✅ **Phase 2E-1/2** — `<SupportApp />` client wrapper + editable installation
  fields wired through to `TicketForm`
- ✅ **Phase 2F-1** — `lib/salesforce.ts`: OAuth Client Credentials Flow,
  in-memory token cache (2h), `createCustomerCare()` with structured errors
- ✅ **Phase 2F-2** — `app/api/submit/route.ts`: body validation, server-side
  token re-verification (defence in depth), TYPE_MAP, address-merge logic
- ✅ **Phase 2F-3** — `components/ticket-form.tsx`: `handleSubmit` does real
  fetch, `isSubmitting`/`submitError` state, redirects to `/success?caseId=…`
- ✅ **Phase 2F-4** — `app/success/page.tsx`: English copy, displays caseId from
  search params, matches `/expired` styling
- ✅ **End-to-end verified** in sandbox: caseId `a1y8s00000EcUhlAAF`

## Next phases

### Phase 2G — Photo upload (not started)

The UI already accepts photos as in-memory `File` objects with object-URL
previews; nothing is uploaded yet.

- Pick a storage target (S3 vs Cloudinary vs Vercel Blob — TBD)
- Upload during form submit, get back URLs
- Attach URLs to `Customer_Care__c` (TBD which field; ask Ops)

### Phase 2H — Production deployment (not started)

- Vercel project + custom domain `support.sunterra.com.au`
- Switch SF env vars from sandbox to production
- Verify production `Type__c` picklist values match the web's `TYPE_MAP`

### Outstanding items (blocking or near-blocking)

| Item                                                   | Owner    | Notes                                                |
|--------------------------------------------------------|----------|------------------------------------------------------|
| Verify field-by-field mapping on case `a1y8s00000EcUhlAAF` | Sunterra | Sandbox check, scheduled 2026-05-21                  |
| Add `'ShinePhone'` to `Case_Origin__c` picklist            | Sunterra Ops | Web currently sends `'Web'` as fallback              |
| Implement SN → `Job__c` Flow on `Customer_Care__c` insert  | Sunterra Ops | The whole reason web doesn't do the lookup           |
| Verify production `Type__c` picklist values vs `TYPE_MAP`  | Sunterra Ops | Sandbox values may differ from production            |
| HMAC secret exchange with Growatt + test APK + cut-over    | Growatt  | Required before any real ShinePhone integration test |

## Key environment variables

Listed in `.env.example`. Names + purposes only — never paste real values into
docs.

| Variable                   | Purpose                                                                |
|----------------------------|------------------------------------------------------------------------|
| `HMAC_SECRET`              | Shared secret with Growatt for signing/verifying deep-link URLs.        |
| `TOKEN_TTL_SECONDS`        | Deep-link validity window (default 86400 = 24h).                       |
| `SALESFORCE_CLIENT_ID`     | Consumer Key of the External Client App.                               |
| `SALESFORCE_CLIENT_SECRET` | Consumer Secret of the External Client App.                            |
| `SALESFORCE_INSTANCE_URL`  | SF org base URL (sandbox URL today, prod URL once Phase 2H ships).     |
| `SALESFORCE_API_VERSION`   | REST API version path segment (`v62.0`).                               |
| `NODE_ENV`                 | `development` enables `/dev/*` tools; `production` 404s them.          |

All Salesforce variables are server-side only and must never reach the client.

## Key file map

```
app/
  page.tsx                       Server entry: verifyToken() + redirect, renders <SupportApp />
  layout.tsx                     Root layout + fonts
  expired/page.tsx               Token-failure page (reason-specific copy)
  success/page.tsx               Post-submit page; shows caseId from ?caseId=
  api/submit/route.ts            POST handler: re-verifies token, builds SF payload, creates Customer_Care__c
  api/dev/build-link/route.ts    Dev-only URL signer (404 in production)
  dev/test-link/                 Dev-only test-URL generator UI

components/
  support-app.tsx                Client wrapper, holds installationData + token state
  installation-info.tsx          Editable installation card (sn locked, others click-to-edit)
  ticket-form.tsx                Problem-type grid + description + photos + submit logic
  brand-header.tsx               Logo and title strip

lib/
  env.ts                         Per-field lazy env validation
  hmac.ts                        HMAC-SHA256 sign/verify (timing-safe)
  sign-url.ts                    URL builder used by the dev test-link tool
  token.ts                       verifyToken(URLSearchParams) → reason-tagged result
  salesforce.ts                  OAuth + token cache + createCustomerCare()

types/installation.ts            Single canonical schema (InstallationData, UrlParams, …)

scripts/
  test-sf-connection.ts          One-off connectivity / schema probe (kept for re-runs)
  test-sf-write.ts               One-off createCustomerCare smoke test (kept for re-runs)

docs/
  handover.md                    ← this file
  integration-spec.md            URL format + Growatt-facing contract
  project-overview.md            Business context (stable, rarely edited)
```

## Known tech debt

Carried forward from previous handover, updated to today's state:

- **`tests/ui.spec.ts` (Playwright) is rotted** — references old mock strings
  (`"12 Pine Street"`, `"YRP0F7G0CG"`, `"Growatt SPH 6000"`) and the old DOM
  of `InstallationInfo`. Defer to a test-phase cleanup.
- **Mixed import style in `components/support-app.tsx`** — named imports for
  `BrandHeader`/`TicketForm`, default import for `InstallationInfo`. Pick one
  and standardise in a follow-up.
- **`useEffect` in `InstallationInfo`** still carries
  `// eslint-disable-next-line react-hooks/set-state-in-effect` on the
  draft-sync effect. Modern React 19 guidance is `key={value}` or
  derive-during-render. Refactor candidate.
- **`README.md`** was updated this session — no longer mentions
  `SALESFORCE_USERNAME` / `SALESFORCE_PASSWORD`. Done.
- **`docs/integration-spec.md`** was updated this session — URL format corrected
  to flat camelCase, "Open questions" marked confirmed. Done.
- **Sandbox test cases need manual cleanup** (4 records, all under the
  Integration User). To delete in SF UI:
  - `a1y8s00000EcTovAAF`
  - `a1y8s00000EcTqXAAV`
  - `a1y8s00000EcTtlAAF`
  - `a1y8s00000EcUhlAAF`
- **Unused `TicketSubmission` type** in `types/installation.ts` — defined but
  never imported. Either wire it in or delete it.
- **Production deployment** not configured (no Vercel project, no custom
  domain).

## How to test locally

1. Make sure `.env.local` is configured (HMAC secret + Salesforce Client
   Credentials + sandbox `SALESFORCE_INSTANCE_URL`). Copy `.env.example` if
   starting fresh.
2. `npm run dev`
3. Open `http://localhost:3000/dev/test-link` — the dev-only test-URL
   generator. Pick "valid" and hit "Generate test URL".
4. Click through the generated URL → edit installation info if desired →
   pick a problem type, type a description → "Submit ticket".
5. On success the page redirects to `/success?caseId=…`. Open the sandbox at
   `https://sunterra--dev.sandbox.my.salesforce.com` and check the
   `Customer_Care__c` record exists with the expected field values.

If the test-link page 404s, you're not in development mode — check `NODE_ENV`.

## Working mode (for Claude / AI assistants joining the project)

This is a multi-party project. Roles:

- **Sunterra tech coordinator** — owns the project, drives the schedule,
  reviews everything, talks to Sunterra Ops and Growatt.
- **Sunterra Ops** — Salesforce admin and process owner. Writes Flows, manages
  picklists, owns the data model.
- **Growatt** — ShinePhone integration partner. Will eventually sign URLs and
  redirect users to this web app.
- **Claude (planning AI)** — gives strategy, writes the structured Cursor
  prompts (does not edit code directly).
- **Cursor agent (coding AI)** — executes the code changes inside the IDE,
  reports back results.

Communication loop:

1. Planning AI writes a Cursor prompt with:
   - **Business context** (1–2 paragraphs)
   - **Task list** numbered Step 1 / Step 2 / …
   - A **🔴 forbidden** list and a **🟢 required** list (be explicit, leave no
     "interpret as you wish" room)
   - A fixed **report format** (sections A / B / C / …)
   - "Stop and report when done, do not proceed."
2. Coding AI executes, reports back exactly in that format.
3. Tech coordinator reviews the report → either approves the next phase or
   feeds the report back to the planning AI for revision.

When you (a future planning AI) write Cursor prompts:

- Always state what NOT to touch (it's the cheapest way to prevent damage).
- Always require a fixed report shape so reviews are mechanical.
- Prefer small, locked-down steps with a verification gate between them, over
  one big "implement everything".
- Salesforce assumptions are dangerous — read this handover's Salesforce
  section before guessing field names, object names, or query strategies.
