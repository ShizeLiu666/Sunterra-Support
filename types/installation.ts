/**
 * Canonical schema for installation/customer data.
 * Used across URL parsing, token verification, UI display, and Salesforce API.
 *
 * Field naming convention: camelCase, matches Growatt URL params.
 *
 * SN-list semantics (2026-05-25 protocol change):
 *   The wire URL carries a single `sn` query param whose value is a
 *   comma-joined string of 1..5 inverter/battery serial numbers (e.g.
 *   `?sn=SN1,SN2,SN3`). HMAC signing operates on that raw string verbatim.
 *   Once verified, the application layer splits on `,` to produce
 *   `InstallationData.sns: string[]` — the parsed form every UI / API
 *   consumer works with.
 */

/** Maximum allowed serial numbers in a single ShinePhone deep link. */
export const MAX_SNS = 5;

// Application-side representation: SNs are already parsed into an array.
export interface InstallationData {
  // Required
  sns: string[]; // Inverter/battery serial numbers (1..MAX_SNS)

  // Optional (from ShinePhone)
  name?: string; // Customer name (could be account name, user-editable)
  email?: string; // Customer email (primary contact method)
  address?: string; // Installation address
  state?: string; // Installation state/territory (AU abbrev; user-selected in form, NOT from URL / not signed)
  inverterModel?: string; // Inverter model (e.g., "MIN3000TL-XH")
  language?: string; // Language code (e.g., "en-AU", "zh-CN")
}

// Raw URL params from ShinePhone (wire format, before parsing).
// `sn` is the comma-joined string of all SNs — this is the form the HMAC
// signature is computed over. Do NOT split it before verifying the signature.
export interface UrlParams {
  sn: string; // raw comma-joined SN list, e.g. "SN1,SN2,SN3"
  timestamp: string; // Unix timestamp (seconds), as string from URL
  sign: string; // HMAC-SHA256 signature

  name?: string;
  email?: string;
  address?: string;
  inverterModel?: string;
  language?: string;
}

export type TokenVerificationFailureReason =
  | "missing_params"
  | "invalid_signature"
  | "expired"
  | "malformed";

// Token verification result.
export interface TokenVerificationResult {
  valid: boolean;
  reason?: TokenVerificationFailureReason;
  data?: InstallationData; // Only present if valid: true
}

// Form submission payload (what user submits).
export interface TicketSubmission {
  installation: InstallationData; // From URL (with user edits applied)
  problemType: string; // e.g., "system_not_working"
  description: string;
  photos?: File[]; // For Phase 1, can be omitted
}
