import { env } from "./env";
import { verifySignature } from "./hmac";
import {
  MAX_SNS,
  type InstallationData,
  type TokenVerificationResult,
} from "@/types/installation";

/**
 * Maximum allowed clock skew (5 minutes).
 * Prevents rejection due to minor clock differences between
 * ShinePhone server and our server.
 */
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

/**
 * Parse the raw `sn` URL parameter into an array of SNs.
 *
 * Wire format: a comma-joined string, e.g. `"SN1,SN2,SN3"`.
 * Returns the parsed list, or null if the parameter is structurally
 * invalid (empty after trim/filter, or more than MAX_SNS entries).
 *
 * Whitespace around each SN is stripped. Empty entries produced by
 * stray commas (e.g. `"SN1,,SN3"`) are filtered out before counting.
 */
function parseSnList(raw: string): string[] | null {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return null;
  if (parts.length > MAX_SNS) return null;
  return parts;
}

/**
 * Verify URL parameters against HMAC signature and timestamp.
 *
 * @param params - URLSearchParams from the incoming request
 * @returns Verification result with reason if invalid
 */
export function verifyToken(params: URLSearchParams): TokenVerificationResult {
  const sn = params.get("sn");
  const timestampStr = params.get("timestamp");
  const sign = params.get("sign");

  if (!sn || !sn.trim() || !timestampStr || !sign) {
    return { valid: false, reason: "missing_params" };
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || timestamp <= 0) {
    return { valid: false, reason: "malformed" };
  }

  const now = Math.floor(Date.now() / 1000);
  const age = now - timestamp;

  // Reject if too far in the future (clock attack)
  if (age < -MAX_CLOCK_SKEW_SECONDS) {
    return { valid: false, reason: "malformed" };
  }

  // Per spec §5: "Validation rule: current_unix_time - timestamp ≤
  // 86400 + 300". The +MAX_CLOCK_SKEW_SECONDS grace covers the case
  // where ShinePhone's clock is ahead of ours and they sign a
  // near-expiry timestamp; without this we'd reject up to 5 minutes
  // before the spec mandates expiry.
  if (age > env.TOKEN_TTL_SECONDS + MAX_CLOCK_SKEW_SECONDS) {
    return { valid: false, reason: "expired" };
  }

  // Signature verification operates on the raw `sn` string verbatim
  // (comma-joined, no split). This MUST match what Growatt signs.
  const allParams: Record<string, string> = {};
  params.forEach((value, key) => {
    allParams[key] = value;
  });

  const valid = verifySignature(allParams, sign, env.HMAC_SECRET);
  if (!valid) {
    return { valid: false, reason: "invalid_signature" };
  }

  // Only AFTER signature verification do we split the SN list.
  // Splitting before would let an attacker influence the parse path
  // without paying the HMAC cost.
  const sns = parseSnList(sn);
  if (!sns) {
    // sn was syntactically valid for signing (non-empty string) but
    // either resolved to zero non-empty entries or more than MAX_SNS.
    return { valid: false, reason: "malformed" };
  }

  const data: InstallationData = {
    sns,
    name: params.get("name") || undefined,
    email: params.get("email") || undefined,
    address: params.get("address") || undefined,
    inverterModel: params.get("inverterModel") || undefined,
    language: params.get("language") || undefined,
  };

  return { valid: true, data };
}

/**
 * Convenience helper: extract URLSearchParams from a Request URL
 * and verify it.
 */
export function verifyTokenFromUrl(url: string): TokenVerificationResult {
  try {
    const parsed = new URL(url);
    return verifyToken(parsed.searchParams);
  } catch {
    return { valid: false, reason: "malformed" };
  }
}
