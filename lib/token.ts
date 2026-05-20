import { env } from "./env";
import { verifySignature } from "./hmac";
import type {
  InstallationData,
  TokenVerificationResult,
} from "@/types/installation";

/**
 * Maximum allowed clock skew (5 minutes).
 * Prevents rejection due to minor clock differences between
 * ShinePhone server and our server.
 */
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

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

  if (!sn || !timestampStr || !sign) {
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

  if (age > env.TOKEN_TTL_SECONDS) {
    return { valid: false, reason: "expired" };
  }

  const allParams: Record<string, string> = {};
  params.forEach((value, key) => {
    allParams[key] = value;
  });

  const valid = verifySignature(allParams, sign, env.HMAC_SECRET);
  if (!valid) {
    return { valid: false, reason: "invalid_signature" };
  }

  const data: InstallationData = {
    sn,
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
