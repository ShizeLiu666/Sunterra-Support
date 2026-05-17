# Sunterra Support

A mobile-first ticket submission web app for Sunterra customers, opened via deep link from the Growatt ShinePhone App and used to create Cases in Salesforce.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in real values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
app/
  layout.tsx          Root layout (fonts, html shell)
  page.tsx            Ticket submission form (entry page)
  globals.css         Tailwind v4 + Sunterra brand color tokens
  success/page.tsx    Shown after a ticket is created
  expired/page.tsx    Shown when the deep-link token is invalid/expired
  api/submit/route.ts POST endpoint that creates the Salesforce Case
components/           Reusable UI components
lib/
  token.ts            HMAC-SHA256 deep-link token verification
  salesforce.ts       Salesforce Case creation client
public/               Static assets
```

## Tech stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 · deployed to Vercel.

## Brand colors

Defined as Tailwind tokens in `app/globals.css`: `sunterra-primary` `#1D9E75`, `sunterra-accent` `#FAC775`, `sunterra-dark` `#04342C`, `sunterra-light` `#E1F5EE`. Use them like `bg-sunterra-primary` or `text-sunterra-dark`.
