import { env } from "./env";
import { buildSignString, verifySignature } from "./hmac";
import {
  MAX_SNS,
  type InstallationData,
  type TokenVerificationFailureReason,
  type TokenVerificationResult,
} from "@/types/installation";

/**
 * Maximum allowed clock skew (5 minutes).
 * Prevents rejection due to minor clock differences between
 * ShinePhone server and our server.
 */
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

/**
 * Required fields per spec §3. Used by the missing_params failure log
 * to tell us which required field(s) were absent — saves a round-trip
 * when triaging Growatt integration issues.
 */
const REQUIRED_FIELDS = ["sn", "timestamp", "sign"] as const;

/**
 * Keys whose VALUES are safe to log. Per the Sunterra logging policy:
 *   - `sn` is an operational identifier, not PII (Growatt-confirmed).
 *   - `timestamp` is an integer, not PII; useful for clock-drift debug.
 *   - `inverterModel` is a device model string, not personal.
 *   - `language` is a BCP47 locale code, not personal.
 * Everything else (name, email, address, any future field) is redacted
 * to `<redacted>` in canonical-string logs to preserve key/order
 * structure for debug without leaking PII.
 */
const NON_PII_VALUE_KEYS = new Set([
  "sn",
  "timestamp",
  "inverterModel",
  "language",
]);

/**
 * Optional request context attached to verifyToken failure logs to help
 * triage Growatt integration issues (which IP / UA is hitting us, what
 * fields are arriving, what canonical string we're signing). The
 * function still works without this — context is purely diagnostic.
 */
export interface TokenVerifyContext {
  ip?: string | null;
  userAgent?: string | null;
}

interface FailureLogArgs {
  reason: TokenVerificationFailureReason;
  fields: string[];
  sn: string | null;
  context?: TokenVerifyContext;
  extras?: Record<string, string | number>;
}

/**
 * Single-line structured log for verifyToken failures. Intentionally
 * does NOT print:
 *   - the HMAC secret (never read here, but guarded by convention)
 *   - the provided `sign` value (leaking either signature could aid
 *     an offline attack)
 *   - PII values (email / name / address) — only their KEYS appear in
 *     the `fields=[...]` list
 * DOES print:
 *   - failure reason (matches the /expired?reason= we return to the user)
 *   - list of field NAMES present in the URL
 *   - sn value (operational identifier; safe per Growatt agreement)
 *   - canonical sign string with PII values redacted, when
 *     reason=invalid_signature — this is the debug-critical bit when
 *     Growatt and Sunterra signatures don't agree
 *   - age / ttl / skew when reason=expired
 *   - request IP / User-Agent if the caller passed them in
 *
 * Format example:
 *   [verifyToken] reason=invalid_signature fields=[email,name,sn,timestamp,sign] sn=SN0001 signString="email=<redacted>&name=<redacted>&sn=SN0001&timestamp=1716200000" ip=203.0.113.5 ua="Mozilla/5.0…"
 */
function logFailure(args: FailureLogArgs): void {
  const parts: string[] = [`[verifyToken] reason=${args.reason}`];
  parts.push(`fields=[${args.fields.join(",")}]`);
  if (args.sn) parts.push(`sn=${args.sn}`);
  if (args.extras) {
    for (const [k, v] of Object.entries(args.extras)) {
      // signString is the only multi-token value we always wrap in
      // quotes (per the requested format), since it contains `&` and
      // would otherwise be ambiguous on the log line.
      if (k === "signString") {
        parts.push(`signString="${v}"`);
      } else {
        parts.push(`${k}=${v}`);
      }
    }
  }
  if (args.context?.ip) parts.push(`ip=${args.context.ip}`);
  if (args.context?.userAgent) parts.push(`ua="${args.context.userAgent}"`);
  console.log(parts.join(" "));
}

/**
 * Snapshot of the KEY NAMES present in the URL (no values). Used to
 * tell us, when something fails, which fields actually arrived — handy
 * for diagnosing "Growatt forgot to send `email`" type issues.
 */
function fieldsList(params: URLSearchParams): string[] {
  const keys: string[] = [];
  params.forEach((_value, key) => keys.push(key));
  return keys;
}

/**
 * Strip PII values from a canonical sign string. Input format is
 * "key1=value1&key2=value2&…"; output keeps the same shape but replaces
 * any value whose key is not in NON_PII_VALUE_KEYS with `<redacted>`.
 *
 * Why: when signatures don't match we want to see exactly what Sunterra
 * fed into HMAC (key order, separators, encoding of `sn`/`timestamp`,
 * etc.) without dumping `name=John Smith&email=john@…` into logs.
 */
function redactSignString(signString: string): string {
  if (!signString) return signString;
  return signString
    .split("&")
    .map((pair) => {
      const eqIdx = pair.indexOf("=");
      if (eqIdx === -1) return pair;
      const key = pair.slice(0, eqIdx);
      if (NON_PII_VALUE_KEYS.has(key)) return pair;
      return `${key}=<redacted>`;
    })
    .join("&");
}

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
 * @param params  URLSearchParams from the incoming request
 * @param context Optional request context (IP, User-Agent) included in
 *                failure logs. Not used for validation logic — the
 *                contract for valid/invalid is independent of context.
 * @returns Verification result with reason if invalid
 */
export function verifyToken(
  params: URLSearchParams,
  context?: TokenVerifyContext,
): TokenVerificationResult {
  const fields = fieldsList(params);
  const sn = params.get("sn");
  const timestampStr = params.get("timestamp");
  const sign = params.get("sign");

  if (!sn || !sn.trim() || !timestampStr || !sign) {
    const missing = REQUIRED_FIELDS.filter((f) => {
      const v = params.get(f);
      return v === null || v.trim() === "";
    });
    logFailure({
      reason: "missing_params",
      fields,
      sn,
      context,
      extras: { missing: `[${missing.join(",")}]` },
    });
    return { valid: false, reason: "missing_params" };
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || timestamp <= 0) {
    logFailure({
      reason: "malformed",
      fields,
      sn,
      context,
      extras: {
        cause: "timestamp_parse",
        timestamp_raw: timestampStr,
      },
    });
    return { valid: false, reason: "malformed" };
  }

  const now = Math.floor(Date.now() / 1000);
  const age = now - timestamp;

  // Reject if too far in the future (clock attack)
  if (age < -MAX_CLOCK_SKEW_SECONDS) {
    logFailure({
      reason: "malformed",
      fields,
      sn,
      context,
      extras: {
        cause: "future_timestamp",
        age,
        skew: MAX_CLOCK_SKEW_SECONDS,
      },
    });
    return { valid: false, reason: "malformed" };
  }

  // Per spec §5: "Validation rule: current_unix_time - timestamp ≤
  // 86400 + 300". The +MAX_CLOCK_SKEW_SECONDS grace covers the case
  // where ShinePhone's clock is ahead of ours and they sign a
  // near-expiry timestamp; without this we'd reject up to 5 minutes
  // before the spec mandates expiry.
  if (age > env.TOKEN_TTL_SECONDS + MAX_CLOCK_SKEW_SECONDS) {
    logFailure({
      reason: "expired",
      fields,
      sn,
      context,
      extras: {
        age,
        ttl: env.TOKEN_TTL_SECONDS,
        skew: MAX_CLOCK_SKEW_SECONDS,
      },
    });
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
    // Recompute the canonical sign string for diagnostic logging only.
    // The provided `sign` and expected signature are never logged.
    // PII values inside the canonical string are redacted; structure
    // (keys, order, separators, non-PII values like sn/timestamp) is
    // preserved so we can compare byte-for-byte against what Growatt
    // claims to have signed.
    const signString = buildSignString(allParams);
    logFailure({
      reason: "invalid_signature",
      fields,
      sn,
      context,
      extras: { signString: redactSignString(signString) },
    });
    return { valid: false, reason: "invalid_signature" };
  }

  // Only AFTER signature verification do we split the SN list.
  // Splitting before would let an attacker influence the parse path
  // without paying the HMAC cost.
  const sns = parseSnList(sn);
  if (!sns) {
    // sn was syntactically valid for signing (non-empty string) but
    // either resolved to zero non-empty entries or more than MAX_SNS.
    const partCount = sn.split(",").filter((s) => s.trim().length > 0).length;
    logFailure({
      reason: "malformed",
      fields,
      sn,
      context,
      extras: {
        cause: "sn_parse",
        sn_count: partCount,
        max: MAX_SNS,
      },
    });
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
 * and verify it. Context is forwarded as-is for failure logging.
 */
export function verifyTokenFromUrl(
  url: string,
  context?: TokenVerifyContext,
): TokenVerificationResult {
  try {
    const parsed = new URL(url);
    return verifyToken(parsed.searchParams, context);
  } catch {
    return { valid: false, reason: "malformed" };
  }
}
