/**
 * Canonical schema for installation/customer data.
 * Used across URL parsing, token verification, UI display, and Salesforce API.
 *
 * Field naming convention: camelCase, matches Growatt URL params.
 */

// Data from ShinePhone URL (what we receive).
export interface InstallationData {
  // Required
  sn: string; // Device serial number — used to match SF Installation

  // Optional (from ShinePhone)
  name?: string; // Customer name (could be account name, user-editable)
  email?: string; // Customer email (primary contact method)
  address?: string; // Installation address
  inverterModel?: string; // Inverter model (e.g., "MIN3000TL-XH")
  language?: string; // Language code (e.g., "en-AU", "zh-CN")
}

// URL params from ShinePhone (raw, before validation).
export interface UrlParams extends InstallationData {
  timestamp: string; // Unix timestamp (seconds), as string from URL
  sign: string; // HMAC-SHA256 signature
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
