# Sunterra Support — Project Handover

> Last updated: 2026-05-21 (Phase 2G complete; end-to-end photo upload verified)
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
picks a problem type, types a description, optionally adds up to 5 photos
(compressed client-side before upload), and submits.
The server creates a `Customer_Care__c` record in Salesforce; downstream
automation in Salesforce (Jack-owned, see "Salesforce admin" role below)
routes the case to a support engineer. The web app's responsibilities end at
"case created in SF".

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
   │ /api/submit          │  POST handler: re-verifies token, builds
   │   lib/salesforce.ts  │  SF payload, creates Customer_Care__c,
   │                      │  then uploads any attached photos
   │                      │  serially (1-by-1) as ContentVersion
   └─────────┬────────────┘
             │  POST /sobjects/Customer_Care__c
             │  POST /sobjects/ContentVersion (per photo,
             │     with FirstPublishLocationId = case Id)
             ▼
   ┌──────────────────────┐
   │ Salesforce sandbox   │  Customer_Care__c row created
   │ + downstream Flow*   │  *Flow to be implemented by Jack (Phase 2I)
   └──────────────────────┘
```

## Tech stack

- **Next.js 16** (App Router, Turbopack)
- **TypeScript** (strict)
- **Tailwind CSS v4**
- **browser-image-compression v2.x** — client-side photo
  compression (Phase 2G)
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
> 3. A Salesforce Flow on the `Customer_Care__c` insert reconciles SN →
>    `Job__c` after-the-fact. Implementation is owned by Jack and scheduled
>    as Phase 2I.
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

### Picklist values verified on 2026-05-21

- `Customer_Care__c.Status__c` accepts these active values:
  `Open` (default), `In Progress`, `Escalated`,
  `Customer Care Done, Waiting Payment From Liable`, `Closed`, `On Hold`.
  The web app sends `'Open'` (the default), which is valid. Earlier
  handover notes claiming `'New'` was the correct initial value were
  incorrect — there is no `'New'` value in this picklist.

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
- ✅ **Phase 2G-1** — `lib/salesforce.ts`: `uploadPhotoToCase()`
  helper using ContentVersion + FirstPublishLocationId for one-shot
  file + link creation. Verified end-to-end via
  `scripts/test-photo-upload.ts`.
- ✅ **Phase 2G-2** — `components/ticket-form.tsx`: client-side
  image compression via `browser-image-compression` (~26KB gzip),
  maxSizeMB: 0.8, maxWidthOrHeight: 1600. Submit button shows
  "Preparing photos..." → "Submitting..." → "Attaching photos..."
  stages. MAX_PHOTO_SIZE_BYTES raised to 15MB (selection-time
  only; compression handles the heavy lifting).
- ✅ **Phase 2G-3** — `/api/submit` + `/success` integration:
  photos transported as JSON+base64 in request body, server-side
  uploaded serially to Salesforce, partial failures surfaced via
  `?photoWarning=N` to `/success` (orange warning banner with
  singular/plural copy).
- ✅ **End-to-end verified** in sandbox: Case-14068 with 1 photo
  attached + 1 deliberately oversized payload rejected, photoWarning
  correctly displayed.

## Next phases

### Phase 2H — Production deployment (not started)

- Vercel project + custom domain `support.sunterra.com.au`
- Switch SF env vars from sandbox to production
- Verify production `Type__c` picklist values match the web's
  `TYPE_MAP`
- **Production Salesforce config** (Jack to replicate from sandbox):
  - Create matching `Sunterra Support API Access` Permission Set
    in production (Customer_Care__c + Job__c + Files implicit)
  - Verify production `Customer_Care__c` page layout includes the
    Files related list. Sandbox needed this added (Lily's 2018
    layout didn't have it). If production also lacks it, add it.
  - Verify Integration User profile is `Salesforce API Only System
    Integrations` and has the new Permission Set assigned.
- **Vercel platform constraints to address before launch:**
  - Default sync function body limit is 4.5MB. 5 photos × 0.8MB
    compressed × 1.37 base64 inflation ≈ 5.5MB worst case — could
    hit 413 in production. Options: (a) reduce client-side
    `maxSizeMB` to 0.5; (b) switch /api/submit to multipart/form-data
    + Edge runtime; (c) batch uploads through a separate /api/upload
    endpoint.
  - Default sync function timeout is 10s. Serial upload of 5 photos
    can take 5-10s under network jitter (each SF Files API call
    ~800ms-2s). Options: (a) upgrade to Vercel Pro Edge (~5min
    timeout); (b) limit concurrent uploads to 2-3 instead of fully
    serial; (c) fire-and-forget photo uploads after Case is created.
- **Replace placeholder "XXX" in /success warning banner** with the
  real Sunterra customer support email address (Jack to decide).

### Phase 2I — SN → `Job__c` reconciliation Flow (not started)

The web layer intentionally does not look up `Job__c` by SN
(see Salesforce data model > SN matching). A Salesforce Flow must run
on `Customer_Care__c` insert to:

1. Read `Inverter_Battery_Serials__c` (raw SN string from the customer).
2. Iterate over `Job__c` records and substring-match SN against
   `Job__c.Inverter_Battery_Serials__c` (Long Text Area, ~5.6 SNs avg).
3. If exactly one match: set `Customer_Care__c.Job_Number__c` to that
   `Job__c.Id`.
4. If zero or multiple matches: leave `Job_Number__c` blank; the case
   is handled manually by the support team.

Owner: Jack. Implemented declaratively in SF Setup (no Apex unless
the substring loop hits CPU limits at production data volumes).

### Outstanding items (blocking or near-blocking)

| Item                                                   | Owner    | Notes                                                |
|--------------------------------------------------------|----------|------------------------------------------------------|
| Verify field-by-field mapping on case `a1y8s00000EcUhlAAF` | Jack | ✅ Done 2026-05-21 — all 12 fields PASS (incl. Job_Number__c blank, Type__c=General Inquiries) |
| Add `'ShinePhone'` to `Case_Origin__c` picklist            | Jack | Sandbox + production both, before Growatt cut-over   |
| Add Files related list to production `Customer_Care__c` page layout | Jack | Before Phase 2H cut-over; sandbox already has it |
| Replace `XXX` placeholder in /success warning with real support email | Jack | Before Phase 2H cut-over |
| Address Vercel 4.5MB body limit + 10s timeout for photo uploads | Jack | Before Phase 2H cut-over; see Phase 2H notes |
| Implement SN → `Job__c` Flow on `Customer_Care__c` insert  | Jack | Phase 2I; the whole reason web doesn't do the lookup |
| Verify production `Type__c` picklist values vs `TYPE_MAP`  | Jack | Before Phase 2H cut-over                             |
| HMAC secret exchange with Growatt + test APK + cut-over    | Growatt  | Required before any real ShinePhone integration test |

#### Field verification detail (`a1y8s00000EcUhlAAF` / Case-14060)

Verified via SOQL on 2026-05-21 morning:

| Field                            | Expected             | Actual               | Result |
|----------------------------------|----------------------|----------------------|--------|
| `Name` (Auto Number)             | Case-XXXXX           | Case-14060           | ✅     |
| `Type__c`                        | General Inquiries    | General Inquiries    | ✅     |
| `Subject__c`                     | (any)                | Support request      | ✅     |
| `Description__c`                 | (non-empty)          | (non-empty)          | ✅     |
| `Inverter_Battery_Serials__c`    | GW2024XK8B72         | GW2024XK8B72         | ✅     |
| `Customer_Name__c`               | (non-empty)          | Jack Test            | ✅     |
| `Email__c`                       | (non-empty)          | jack-test@example... | ✅     |
| `Installation_Street__c`         | (non-empty)          | 123 Test Street, ... | ✅     |
| `Job_Number__c`                  | blank (unmatched)    | blank                | ✅⭐   |
| `Case_Origin__c`                 | Web                  | Web                  | ✅     |
| `Status__c`                      | Open (default)       | Open                 | ✅     |
| `CreatedBy.Username`             | jack.liu@sunterra... | jack.liu@sunterra... | ✅     |

The starred row (`Job_Number__c` blank) is the key design validation:
unmatched SN correctly results in a null lookup, not an error, not a
guess. The SN → `Job__c` reconciliation will be handled by the Phase 2I
Flow.

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
- **`README.md`** was updated in the 2026-05-20 handover session — no
  longer mentions `SALESFORCE_USERNAME` / `SALESFORCE_PASSWORD`. Done.
- **`docs/integration-spec.md`** was updated in the 2026-05-20 handover
  session — URL format corrected to flat camelCase, "Open questions"
  marked confirmed. Done.
- **Salesforce does not validate ContentVersion image data**:
  During Phase 2G-3 testing, SF accepted any byte stream (including
  49-byte ASCII text and random characters) as valid image content
  as long as mimeType claimed `image/jpeg`. In practice this isn't
  triggered because `browser-image-compression` re-encodes via
  Canvas which can only output valid JPEGs. But a malicious or
  poorly-coded client could upload garbage files that occupy SF
  storage and confuse support staff. Mitigations to consider
  pre-launch: server-side magic-byte verification in
  `uploadPhotoToCase()` (check first 3 bytes are `FF D8 FF` for
  JPEG, etc).
- **Photo upload: Promise.all parallel compression and encoding may
  pressure memory on low-end devices**: Browser side, all 5 photos
  compress + encode in parallel via `Promise.all`. Peak memory ~5 ×
  (1MB image + canvas + base64 buffer) ≈ 15-20 MB transient. Most
  iPhones and modern Android handle this fine; low-end Android 6/8
  devices may OOM. If reports come in post-launch, switch to limited
  concurrency (e.g. p-limit with concurrency 2-3) or sequential.
- **Photo filenames not sanitized**: Customer's original file names
  (e.g., `IMG_3421.HEIC`, or names with Chinese chars / emoji) are
  passed directly to SF `ContentVersion.PathOnClient` field
  (Text(255)). SF accepts most things, but extreme cases (>255
  chars, certain reserved chars) would fail that one photo. Currently
  handled by the per-photo failure path; could be improved with
  client-side sanitization.
- **Compression failure loses original photo**: If
  `browser-image-compression` fails on a specific photo (e.g.,
  corrupted source), the original is dropped rather than uploaded
  raw. The warning banner says "1 photo was not attached" but
  doesn't tell the user *which* photo. This is acceptable for v1
  but a candidate for UX improvement.
- **`scripts/test-partial-failure.ts` and `scripts/fixtures/broken.jpg`
  are kept for regression testing of partial-failure path**. Can
  be removed if regression suite is replaced with proper integration
  tests. `broken.jpg` is gitignored (49 bytes of ASCII).
- **Sandbox test cases need manual cleanup** (multiple records under
  the Integration User, accumulated from Phase 2F + Phase 2G testing).
  Customer_Care__c records to delete in SF UI:
  - `a1y8s00000EcTovAAF` (Phase 2F early test)
  - `a1y8s00000EcTqXAAV` (Phase 2F early test)
  - `a1y8s00000EcTtlAAF` (Phase 2F early test)
  - `a1y8s00000EcUhlAAF` / Case-14060 (Phase 2F final verification,
    keep until Phase 2I uses it as reference)
  - Case-14061 (caseNumber display rollout test)
  - Case-14063 (Phase 2G-2 end-to-end test)
  - Case-14066, Case-14067 (Phase 2G-3 failure path testing
    — SF accepted any bytes as image content, see tech debt below)
  - Case-14068 (Phase 2G-3 partial-failure final verification)

  ContentVersion records (file attachments) will be deleted
  automatically when their parent Customer_Care__c is deleted.
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
  reviews everything, owns Salesforce admin work directly, talks to Lily
  (Sunterra owner) on business decisions and to Growatt on the ShinePhone
  integration.
- **Salesforce admin** — Jack. Owns the SF data model for this project:
  configures the External Client App, Permission Sets, Integration User,
  picklist values, and will implement the SN → `Job__c` Flow in Phase 2I.
  Historical baseline (the `Customer_Care__c` object and most of its
  picklist values) was set up years ago by Lily Zhou; she is no longer
  hands-on.
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
