import { test, expect } from "@playwright/test";
import { verifyToken } from "../lib/token";
import { computeSignature } from "../lib/hmac";
import type { TokenVerificationResult } from "@/types/installation";

/**
 * Contract tests for lib/token.ts::verifyToken — the single entry-point gate
 * for every Growatt/ShinePhone URL. Pure unit tests (no browser, no dev
 * server). Run with:
 *   PW_SKIP_WEBSERVER=1 npx playwright test --project=unit
 *
 * These lock the *policy* layer (required set / non-empty set / deviceType
 * enum / timestamp+TTL / signature / multi-SN) so future contract changes
 * can't silently let a bad URL through or reject a good one. Assertions are
 * written against the CODE's actual behaviour, not the spec's intent.
 *
 * NOTE: verifyToken reads env.HMAC_SECRET lazily on first use, so we set a
 * fixed fake secret before any test runs. lib/env.ts validates each field
 * independently, so no Salesforce config is needed here.
 */

const SECRET = "test_secret_v1_1";
process.env.HMAC_SECRET = SECRET;

// Canonical 7 signed fields (sign is derived, not listed here). Timestamp is
// "now" so the default token is inside the TTL window.
function baseFields(): Record<string, string> {
  return {
    email: "john@example.com",
    name: "John Smith",
    address: "62 Tyler Cres, Tarneit, VIC",
    sn: "SN0001ABCD",
    deviceType: "battery",
    deviceModel: "ARK-10.2H-A1",
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
}

/**
 * Build a correctly-signed URLSearchParams, then apply overrides.
 *   overrides[k] === undefined  -> DELETE field k    (test "k missing")
 *   overrides[k] === "<string>" -> set field k literal
 * Special key "sign":
 *   absent from overrides       -> attach a CORRECT signature (default)
 *   sign: undefined             -> omit the sign param entirely
 *   sign: "<string>"            -> attach that literal sign (empty / tampered)
 * The signature is computed over the non-sign fields AFTER overrides, so a
 * default token always verifies unless `sign` itself is overridden or a
 * field is mutated post-build.
 */
function buildParams(overrides: Record<string, string | undefined> = {}): URLSearchParams {
  const fields = baseFields();
  for (const [k, v] of Object.entries(overrides)) {
    if (k === "sign") continue; // handled below
    if (v === undefined) delete fields[k];
    else fields[k] = v;
  }

  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) usp.set(k, v);

  if (Object.prototype.hasOwnProperty.call(overrides, "sign")) {
    const s = overrides.sign;
    if (s !== undefined) usp.set("sign", s); // literal (empty / tampered)
    // else: omit sign entirely
  } else {
    usp.set("sign", computeSignature(fields, SECRET)); // correct signature
  }
  return usp;
}

function expectRejected(r: TokenVerificationResult, reason: string) {
  expect(r.valid).toBe(false);
  expect((r as { valid: false; reason: string }).reason).toBe(reason);
}

const REQUIRED_FIELDS = [
  "email",
  "name",
  "address",
  "sn",
  "deviceType",
  "deviceModel",
  "timestamp",
  "sign",
];

// ---------------------------------------------------------------------------
test.describe("A. REQUIRED_FIELDS — presence gate", () => {
  test("all 8 fields present + correct signature -> valid", () => {
    const r = verifyToken(buildParams());
    expect(r.valid).toBe(true);
  });

  for (const field of REQUIRED_FIELDS) {
    test(`missing '${field}' -> missing_params`, () => {
      expectRejected(verifyToken(buildParams({ [field]: undefined })), "missing_params");
    });
  }

  test("no params at all -> missing_params", () => {
    expectRejected(verifyToken(new URLSearchParams()), "missing_params");
  });
});

// ---------------------------------------------------------------------------
test.describe("B. NON_EMPTY_FIELDS — present-but-empty gate", () => {
  // Empty value on a NON_EMPTY field is treated as missing => missing_params
  // (the non-empty check lives inside the presence filter).
  for (const field of ["sn", "timestamp", "deviceType", "deviceModel"]) {
    test(`empty '${field}' -> missing_params`, () => {
      expectRejected(verifyToken(buildParams({ [field]: "" })), "missing_params");
    });
  }

  // email / name / address MAY be present-but-empty (signed as `key=`).
  for (const field of ["email", "name", "address"]) {
    test(`empty '${field}' -> valid (present-but-empty allowed)`, () => {
      const r = verifyToken(buildParams({ [field]: "" }));
      expect(r.valid).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
test.describe("C. deviceType enum", () => {
  test("deviceType=inverter -> valid", () => {
    expect(verifyToken(buildParams({ deviceType: "inverter" })).valid).toBe(true);
  });

  test("deviceType=battery -> valid", () => {
    expect(verifyToken(buildParams({ deviceType: "battery" })).valid).toBe(true);
  });

  test("deviceType=meter (not in enum) -> malformed", () => {
    expectRejected(verifyToken(buildParams({ deviceType: "meter" })), "malformed");
  });

  // HAZARD: the enum Set is lowercase-only, so matching is case-SENSITIVE.
  // A future Growatt build sending "INVERTER" would be rejected. Asserted as
  // the code actually behaves (malformed); flagged in the report, not fixed.
  test("deviceType=INVERTER (uppercase) -> malformed [case-sensitive]", () => {
    expectRejected(verifyToken(buildParams({ deviceType: "INVERTER" })), "malformed");
  });
});

// ---------------------------------------------------------------------------
test.describe("D. timestamp / TTL", () => {
  const now = () => Math.floor(Date.now() / 1000);

  test("timestamp within TTL -> valid", () => {
    expect(verifyToken(buildParams({ timestamp: String(now()) })).valid).toBe(true);
  });

  test("timestamp older than TTL (86400s) + skew -> expired", () => {
    const old = String(now() - (86400 + 3600));
    expectRejected(verifyToken(buildParams({ timestamp: old })), "expired");
  });

  // Future beyond the 5-min skew is rejected as malformed (clock-attack guard).
  test("timestamp far in the future (+1h) -> malformed [future guarded]", () => {
    const future = String(now() + 3600);
    expectRejected(verifyToken(buildParams({ timestamp: future })), "malformed");
  });

  // Near-future within the 300s skew grace is accepted.
  test("timestamp slightly in the future (+60s) -> valid [within skew]", () => {
    const near = String(now() + 60);
    expect(verifyToken(buildParams({ timestamp: near })).valid).toBe(true);
  });

  test("non-numeric timestamp ('abc') -> malformed", () => {
    expectRejected(verifyToken(buildParams({ timestamp: "abc" })), "malformed");
  });
});

// ---------------------------------------------------------------------------
test.describe("E. signature", () => {
  test("correct signature -> valid", () => {
    expect(verifyToken(buildParams()).valid).toBe(true);
  });

  test("signature tampered by one char -> invalid_signature", () => {
    const p = buildParams();
    const sig = p.get("sign") as string;
    const flipped = sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a");
    p.set("sign", flipped);
    expectRejected(verifyToken(p), "invalid_signature");
  });

  test("field value mutated but sign left stale -> invalid_signature", () => {
    const p = buildParams(); // valid signature over the original sn
    p.set("sn", "SN9999ZZZZ"); // change value without re-signing
    expectRejected(verifyToken(p), "invalid_signature");
  });

  test("extra signed field (foo=bar, participates in signature) -> valid", () => {
    // Signature is not whitelist-driven: an extra signed key still verifies.
    const r = verifyToken(buildParams({ foo: "bar" }));
    expect(r.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
test.describe("F. multi-SN boundary (MAX_SNS=5)", () => {
  test("1 SN -> valid", () => {
    const r = verifyToken(buildParams({ sn: "SNONLY01" }));
    expect(r.valid).toBe(true);
    expect(r.data?.sns).toEqual(["SNONLY01"]);
  });

  test("5 SNs -> valid", () => {
    const r = verifyToken(buildParams({ sn: "S1,S2,S3,S4,S5" }));
    expect(r.valid).toBe(true);
    expect(r.data?.sns).toHaveLength(5);
  });

  test("6 SNs (over MAX_SNS) -> malformed", () => {
    expectRejected(verifyToken(buildParams({ sn: "S1,S2,S3,S4,S5,S6" })), "malformed");
  });

  test("SNs with surrounding spaces -> valid and trimmed", () => {
    const r = verifyToken(buildParams({ sn: "AA, BB, CC" }));
    expect(r.valid).toBe(true);
    expect(r.data?.sns).toEqual(["AA", "BB", "CC"]);
  });
});
