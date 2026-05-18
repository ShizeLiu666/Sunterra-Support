# Handover Document - 2026-05-17

## Project status snapshot

Sunterra Support is a mobile-first ticket submission web app. Users come from
Growatt ShinePhone App via deep link, submit support tickets that create Cases
in Salesforce.

## Phase 1 (Current) - UI Complete

### What's done

✅ Project scaffolded with Next.js 16 + TypeScript + Tailwind v4
✅ Brand color tokens defined in app/globals.css
✅ Sunterra logo integrated in public/sunterra-logo.png
✅ Full ticket submission form UI built:
   - Brand header with logo + "Support Request" title
   - Pre-filled installation info card with Verified pill
   - 6 problem type cards (Lucide icons)
   - Description textarea with 500 char limit + 3-tier color counter
   - Photo upload with 5-photo limit, 5MB per file
   - Sticky submit button (mobile)
✅ Mobile + desktop responsive design
✅ Playwright tests: 21/21 passing
✅ Deployed to Vercel: https://sunterra-support.vercel.app
✅ GitHub repo: https://github.com/ShizeLiu666/Sunterra-Support (Private)

### Current pre-filled data (hardcoded in app/page.tsx)

```typescript
const mockData = {
  name: 'John Smith',
  address: '12 Pine Street, Adelaide SA 5000',
  inverter: 'Growatt SPH 6000',
  serialNumber: 'YRP0F7G0CG',
};
```

This is hardcoded as placeholder. Phase 2 will replace with URL param parsing.

## Phase 2 (Not Started) - Business Logic

### What needs to be done

❌ URL parameter parsing (data, timestamp, sign)
❌ HMAC SHA256 token verification (lib/token.ts is empty stub)
❌ Real form submission to Salesforce
❌ Salesforce REST API integration (lib/salesforce.ts is empty stub)
❌ Success page (app/success/page.tsx is placeholder)
❌ Expired page (app/expired/page.tsx is placeholder)
❌ Photo upload to storage (currently local preview only)
❌ Dev tool: test URL generator

### Blocked on

Waiting for Growatt R&D confirmation on URL parameter format. See:
docs/integration-spec.md - "Open questions" section

Specifically need:
1. Which fields ShinePhone can actually pass
2. Whether HMAC SHA256 signing is feasible
3. How to securely exchange the secret
4. System browser vs WebView for redirect

## Key decisions made

1. **Tech stack**: Next.js 16 + TS + Tailwind v4 (modern stack)
2. **Mobile-first**: Form is max-w-[480px], optimized for phone
3. **Photo upload**: Local preview only in Phase 1, no server upload yet
4. **Token verification**: Server-side only, secret never exposed to client
5. **Deployment**: Vercel Hobby for demo, will upgrade to Pro for production
6. **Domain**: Currently sunterra-support.vercel.app, will move to
   support.sunterra.com.au when ready

## Important files

- `.cursorrules` - AI coding rules (read this first!)
- `docs/project-overview.md` - Project goals and stakeholders
- `docs/integration-spec.md` - ShinePhone integration spec + open questions
- `components/ticket-form.tsx` - Main form component (most complex)
- `components/brand-header.tsx` - Logo + title
- `components/installation-info.tsx` - Pre-filled user info card
- `app/page.tsx` - Main entry, mock data lives here
- `lib/token.ts` - Empty stub for HMAC verification
- `lib/salesforce.ts` - Empty stub for Salesforce API client

## Test commands

```bash
npm test           # Default: mobile-iphone-14-pro + webview
npm run test:all   # All 7 device profiles
npm run test:report # View HTML report
```

## Recent commits

Run `git log --oneline -10` to see recent work.

## Next session priority

Decide based on Growatt response:
1. If Growatt confirmed → implement URL parsing + token validation
2. If Growatt still pending → build dev test-URL generator first
3. Either way → wire up Salesforce stub with mock data flow

## Contacts (for context)

- Lily: Sunterra ops director, project owner (在澳洲 SA)
- Harrison: Growatt main contact (在国内)
- Jack: Sunterra tech lead (you)
