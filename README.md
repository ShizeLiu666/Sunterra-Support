# Sunterra Support

A mobile-first ticket submission web app for Sunterra customers, opened via deep link from the Growatt ShinePhone App and used to create Cases in Salesforce.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in real values
export PATH="$HOME/.nvm/versions/node/v20.19.5/bin:$PATH"
POSTCSS_SKIP_FALLBACKS=1 npx next dev --webpack
```

Open [http://localhost:3000](http://localhost:3000).

Branch status: `main` is production (`https://support.sunterra.com.au/`);
`milestone-2` is the strict v1.1 Preview branch.

## Project structure

```
app/
  layout.tsx          Root layout (fonts, html shell)
  page.tsx            Ticket submission form (entry page)
  globals.css         Tailwind v4 + Sunterra brand color tokens
  success/page.tsx    Shown after a ticket is created
  expired/page.tsx    Shown when the deep-link token is invalid/expired
  api/submit/route.ts POST endpoint: re-verifies all signed URL params
                      generically and creates the Salesforce Customer_Care__c
components/           Reusable UI components
lib/
  token.ts            HMAC-SHA256 deep-link token verification
  salesforce.ts       Salesforce Case creation client
tests/
  hmac.spec.ts        Locks spec v1.1 HMAC canonicalization examples
public/               Static assets
```

## Tech stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 · deployed to Vercel.

## Brand colors

Defined as Tailwind tokens in `app/globals.css`: `sunterra-primary` `#1D9E75`, `sunterra-accent` `#FAC775`, `sunterra-dark` `#04342C`, `sunterra-light` `#E1F5EE`. Use them like `bg-sunterra-primary` or `text-sunterra-dark`.

## Environment Setup

1. Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

2. Generate an HMAC secret:

```bash
openssl rand -hex 32
```

   Paste the output into `HMAC_SECRET` in `.env.local`.

3. Fill in Salesforce credentials. This project uses the **OAuth 2.0 Client
   Credentials Flow** via an External Client App, so no SF username or password
   is needed — the "Run As User" is configured inside the External Client App
   itself.

   - `SALESFORCE_CLIENT_ID` — External Client App Consumer Key
   - `SALESFORCE_CLIENT_SECRET` — External Client App Consumer Secret
   - `SALESFORCE_INSTANCE_URL` — SF org base URL
     (sandbox: `https://sunterra--dev.sandbox.my.salesforce.com`,
     production: `https://sunterra.my.salesforce.com`)
   - `SALESFORCE_API_VERSION` — REST API version path segment (`v62.0`)

4. Never commit `.env.local`. It's gitignored.

## Development tools

In development mode (`NODE_ENV=development`) the app exposes a helper at
[http://localhost:3000/dev/test-link](http://localhost:3000/dev/test-link).

That page still exists, with preset variants such as valid / expired /
tampered / missing-sn, but it is a legacy helper and does **not** generate the
strict v1.1 URL shape.

These endpoints are gated by `NODE_ENV` and return 404 in production builds.

For strict v1.1 testing, use the local script instead:

```bash
TEST_BASE_URL=http://localhost:3000/ npx tsx scripts/gen-prod-test-url.local.ts
```

Replace `TEST_BASE_URL` with a Preview or production host when needed. The
script is gitignored (`*.local.ts`) and emits strict v1.1 signed URLs, including
a known-match sandbox SN (`NTCIA01092`).

On `milestone-2`, `/api/submit` forwards every signed URL param for
re-verification instead of using a hard-coded whitelist, and
`tests/hmac.spec.ts` locks the strict v1.1 HMAC worked examples.
