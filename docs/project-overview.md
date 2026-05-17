# Sunterra Support - Project Overview

## What is this?
A web app that lets Sunterra solar customers submit support tickets directly from their Growatt ShinePhone App. Tickets are automatically created as Cases in Salesforce.

## Why does this exist?
Sunterra has installed 3000+ solar systems in Australia. Customers frequently call support for minor issues, overwhelming the phone lines. This system shifts that burden to a self-service web form, expected to handle ~80% of cases remotely.

## How it works (high level)

1. User experiences an issue with their solar system
2. Opens ShinePhone App, taps "Support" button
3. App opens our web page with their info pre-filled in URL params
4. User selects issue type, describes problem, uploads photos
5. Form submits to our Salesforce, creates a Case
6. Sunterra engineer resolves the case (remote or onsite)
7. App pushes notification to user when case is closed

## Stakeholders

- **Sunterra**: Australian solar installation company
  - Lily: Project owner (operations director)
  - Jack: Technical lead (you)
- **Growatt**: App vendor (ShinePhone)
  - Harrison: Main contact
  - Growatt R&D team: implementing App-side changes

## Project phases

**Phase 1 (current)**: Build the ticket submission flow
- App → Web form → Salesforce Case creation
- Mobile-first web UI
- HMAC token validation

**Phase 2 (future)**: 
- Push notifications back to App
- Status tracking
- Resolution workflow
