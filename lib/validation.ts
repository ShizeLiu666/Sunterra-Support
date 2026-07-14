/**
 * Shared, framework-agnostic field validators for the ticket form.
 *
 * Each validator returns a human-friendly error message string when the value
 * is invalid, or `null` when it passes. Messages are written to be shown
 * directly under the field (see installation-info.tsx / ticket-form.tsx).
 *
 * Validation is intentionally lenient — we are catching obvious mistakes
 * (empty fields, mistyped emails, malformed phone numbers), not enforcing
 * RFC 5322 or a carrier number range table. The server (app/api/submit) keeps
 * its own non-empty backstop so a direct POST can't bypass these checks.
 */

// Just needs a local part, an "@", and a dotted domain.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  if (v === "") return "Email is required";
  if (!EMAIL_REGEX.test(v)) return "Please enter a valid email address";
  return null;
}

/**
 * Basic AU mobile check. Accepts the local "04XXXXXXXX" form or the
 * international "+61 4XXXXXXXX" form, ignoring spaces, dashes and parens so
 * users aren't fighting formatting.
 */
export function validateAuMobile(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  if (v === "") return "Mobile number is required";
  const digits = v.replace(/[\s()-]/g, "");
  // INTENTIONAL: accept only AU mobile numbers — local `04XXXXXXXX` or
  // international `+614XXXXXXXX`. Landlines (e.g. `08…`) are DELIBERATELY
  // rejected, not an oversight: after-sales relies on SMS notifications and
  // callback, so a mobile number is a business requirement. Do not broaden
  // this to accept landlines without a product decision.
  if (/^04\d{8}$/.test(digits) || /^\+614\d{8}$/.test(digits)) return null;
  return "Please enter a valid Australian mobile number (e.g. 0412 345 678)";
}

export function validateRequired(
  value: string | undefined,
  label: string
): string | null {
  if ((value ?? "").trim() === "") return `${label} is required`;
  return null;
}
