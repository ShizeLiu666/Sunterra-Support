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
  mobile?: string; // Customer mobile (user-entered; not part of the URL token)
  address?: string; // Installation address

  // spec v1.1: selected device context (describes the chosen `sn`).
  deviceType?: "inverter" | "battery"; // §3.2 enum; undefined when sent empty
  deviceModel?: string; // §3.2 model of the selected device

  // Legacy/compat fields (pre-v1.1 links).
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

  // spec v1.1 device-selection keys (raw wire values; may be empty string).
  deviceType?: string; // "inverter" | "battery" once validated
  deviceModel?: string;

  // Legacy/compat keys (pre-v1.1 links).
  inverterModel?: string;
  language?: string;

  // Generic carrier for ANY signed URL key. The client forwards every query
  // param verbatim and the server re-signs them all, so a new signed field
  // never has to be added to a whitelist to avoid invalid_signature.
  [key: string]: string | undefined;
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
