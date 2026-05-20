import crypto from "crypto";

/**
 * Canonical HMAC-SHA256 signing for URL parameters.
 *
 * Algorithm (must match Growatt's implementation):
 * 1. Collect all params except 'sign'
 * 2. Sort keys alphabetically (ascending)
 * 3. Join as "key1=value1&key2=value2&..." (no URL encoding here)
 * 4. HMAC-SHA256(joined_string, secret)
 * 5. Convert to lowercase hex
 */

export interface SignableParams {
  [key: string]: string | undefined;
}

/**
 * Build the canonical string to sign from params.
 * Excludes 'sign' field. Skips undefined/empty values.
 */
export function buildSignString(params: SignableParams): string {
  const filtered = Object.entries(params)
    .filter(([key, value]) => key !== "sign" && value !== undefined && value !== "")
    .map(([key, value]) => [key, String(value)] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b));

  return filtered.map(([k, v]) => `${k}=${v}`).join("&");
}

/**
 * Compute HMAC-SHA256 signature for given params and secret.
 * Returns lowercase hex string.
 */
export function computeSignature(params: SignableParams, secret: string): string {
  const signString = buildSignString(params);
  return crypto.createHmac("sha256", secret).update(signString, "utf8").digest("hex");
}

/**
 * Verify a signature matches the expected value.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifySignature(
  params: SignableParams,
  providedSign: string,
  secret: string
): boolean {
  const expected = computeSignature(params, secret);

  if (expected.length !== providedSign.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(providedSign, "utf8")
    );
  } catch {
    return false;
  }
}
