import { test, expect } from "@playwright/test";
import {
  EMAIL_REGEX,
  validateEmail,
  validateAuMobile,
  validateRequired,
} from "../lib/validation";

/**
 * Contract tests for lib/validation.ts — the client-side field validators.
 * Pure unit tests (no browser, no dev server). Run with:
 *   PW_SKIP_WEBSERVER=1 npx playwright test --project=unit
 *
 * Assertions are written against the CODE's actual behaviour, not intent.
 * NOTE (product decision, intentional): validateAuMobile accepts ONLY AU
 * mobiles (04… / +614…); landlines are deliberately rejected.
 */

// Exact messages the validators return (asserted so a copy change is caught).
const EMAIL_REQUIRED = "Email is required";
const EMAIL_INVALID = "Please enter a valid email address";
const MOBILE_REQUIRED = "Mobile number is required";
const MOBILE_INVALID =
  "Please enter a valid Australian mobile number (e.g. 0412 345 678)";

// ---------------------------------------------------------------------------
test.describe("validateAuMobile", () => {
  test("local 04XXXXXXXX -> passes", () => {
    expect(validateAuMobile("0412345678")).toBeNull();
  });

  test("local with spaces (04 1234 5678) -> passes (spaces stripped)", () => {
    expect(validateAuMobile("04 1234 5678")).toBeNull();
  });

  test("local with hyphens/parens -> passes (separators stripped)", () => {
    expect(validateAuMobile("(04) 1234-5678")).toBeNull();
  });

  test("international +61412345678 -> passes", () => {
    expect(validateAuMobile("+61412345678")).toBeNull();
  });

  // INTENTIONAL rejection: landlines are not accepted (product decision).
  test("Adelaide landline 0881234567 -> rejected [by design]", () => {
    expect(validateAuMobile("0881234567")).toBe(MOBILE_INVALID);
  });

  test("landline without area code 88123456 -> rejected", () => {
    expect(validateAuMobile("88123456")).toBe(MOBILE_INVALID);
  });

  // REPORTED BEHAVIOUR: +61 followed by a leading 0 is NOT accepted.
  test("+610412345678 (+61 then 0) -> rejected", () => {
    expect(validateAuMobile("+610412345678")).toBe(MOBILE_INVALID);
  });

  // REPORTED BEHAVIOUR: 0061… country-code prefix is NOT accepted (needs +61).
  test("0061412345678 -> rejected", () => {
    expect(validateAuMobile("0061412345678")).toBe(MOBILE_INVALID);
  });

  test("empty string -> required", () => {
    expect(validateAuMobile("")).toBe(MOBILE_REQUIRED);
  });

  test("undefined -> required", () => {
    expect(validateAuMobile(undefined)).toBe(MOBILE_REQUIRED);
  });

  test("too short (9 digits) -> rejected", () => {
    expect(validateAuMobile("041234567")).toBe(MOBILE_INVALID);
  });

  test("too long (11 digits) -> rejected", () => {
    expect(validateAuMobile("041234567890")).toBe(MOBILE_INVALID);
  });
});

// ---------------------------------------------------------------------------
test.describe("validateEmail", () => {
  test("normal email -> passes", () => {
    expect(validateEmail("john@example.com")).toBeNull();
  });

  test("plus-addressing -> passes", () => {
    expect(validateEmail("a+tag@b.com")).toBeNull();
  });

  test("sub-domain -> passes", () => {
    expect(validateEmail("a@x.y.com")).toBeNull();
  });

  test("no TLD (abc@abc) -> rejected", () => {
    expect(validateEmail("abc@abc")).toBe(EMAIL_INVALID);
  });

  test("double @ (a@@b.com) -> rejected", () => {
    expect(validateEmail("a@@b.com")).toBe(EMAIL_INVALID);
  });

  test("no @ at all -> rejected", () => {
    expect(validateEmail("not-an-email.com")).toBe(EMAIL_INVALID);
  });

  test("empty string -> required", () => {
    expect(validateEmail("")).toBe(EMAIL_REQUIRED);
  });

  test("whitespace only -> required (trimmed)", () => {
    expect(validateEmail("   ")).toBe(EMAIL_REQUIRED);
  });

  test("undefined -> required", () => {
    expect(validateEmail(undefined)).toBe(EMAIL_REQUIRED);
  });
});

// ---------------------------------------------------------------------------
test.describe("validateRequired", () => {
  test("non-empty -> passes", () => {
    expect(validateRequired("hello", "Name")).toBeNull();
  });

  test("empty -> '<label> is required'", () => {
    expect(validateRequired("", "Name")).toBe("Name is required");
  });

  test("whitespace only -> required (trimmed), label interpolated", () => {
    expect(validateRequired("   ", "State")).toBe("State is required");
  });

  test("undefined -> required", () => {
    expect(validateRequired(undefined, "Address")).toBe("Address is required");
  });
});

// ---------------------------------------------------------------------------
test.describe("EMAIL_REGEX (exported constant)", () => {
  test("matches a dotted-domain address, rejects a TLD-less one", () => {
    expect(EMAIL_REGEX.test("john@example.com")).toBe(true);
    expect(EMAIL_REGEX.test("abc@abc")).toBe(false);
  });
});
