import { test, expect } from "@playwright/test";
import { buildSignString, computeSignature, verifySignature } from "../lib/hmac";

/**
 * Locks lib/hmac against Sunterra ShinePhone URL Spec v1.1, Section 4.
 *
 * These are pure unit tests (no browser, no dev server). Run with:
 *   PW_SKIP_WEBSERVER=1 npx playwright test --project=unit
 */

const SPEC_PARAMS = {
  email: "john@example.com",
  name: "John Smith",
  address: "62 Tyler Cres, Tarneit, VIC",
  sn: "SN0001ABCD",
  deviceType: "battery",
  deviceModel: "ARK-10.2H-A1",
  timestamp: "1716200000",
};

// Spec v1.1 §4.1 worked example: HMAC input after sorting by field name.
const SPEC_WORKED_EXAMPLE =
  "address=62 Tyler Cres, Tarneit, VIC" +
  "&deviceModel=ARK-10.2H-A1" +
  "&deviceType=battery" +
  "&email=john@example.com" +
  "&name=John Smith" +
  "&sn=SN0001ABCD" +
  "&timestamp=1716200000";

// Spec v1.1 §4.2 empty contact/address example.
const SPEC_EMPTY_EXAMPLE =
  "address=" +
  "&deviceModel=ARK-10.2H-A1" +
  "&deviceType=battery" +
  "&email=" +
  "&name=" +
  "&sn=SN0001ABCD" +
  "&timestamp=1716200000";

test.describe("spec v1.1 §4 — buildSignString canonical HMAC input", () => {
  test("§4.1 worked example matches spec byte-for-byte", () => {
    expect(buildSignString(SPEC_PARAMS)).toBe(SPEC_WORKED_EXAMPLE);
  });

  test("order is field-name ascending regardless of input key order", () => {
    const shuffled = {
      timestamp: "1716200000",
      sn: "SN0001ABCD",
      deviceModel: "ARK-10.2H-A1",
      deviceType: "battery",
      name: "John Smith",
      email: "john@example.com",
      address: "62 Tyler Cres, Tarneit, VIC",
    };
    expect(buildSignString(shuffled)).toBe(SPEC_WORKED_EXAMPLE);

    const keyOrder = buildSignString(shuffled)
      .split("&")
      .map((pair) => pair.slice(0, pair.indexOf("=")));
    expect(keyOrder).toEqual([
      "address",
      "deviceModel",
      "deviceType",
      "email",
      "name",
      "sn",
      "timestamp",
    ]);
  });

  test("§4.2 empty email/name/address are kept as key= (not omitted)", () => {
    const params = {
      email: "",
      name: "",
      address: "",
      sn: "SN0001ABCD",
      deviceType: "battery",
      deviceModel: "ARK-10.2H-A1",
      timestamp: "1716200000",
    };
    expect(buildSignString(params)).toBe(SPEC_EMPTY_EXAMPLE);
  });

  test("sign is excluded from the canonical string", () => {
    expect(buildSignString({ ...SPEC_PARAMS, sign: "deadbeef" })).toBe(
      SPEC_WORKED_EXAMPLE
    );
  });

  test("undefined values are dropped; raw (non URL-encoded) values preserved", () => {
    expect(
      buildSignString({ a: "x y,z", b: undefined as unknown as string })
    ).toBe("a=x y,z");
  });
});

test.describe("spec v1.1 §4 — computeSignature / verifySignature", () => {
  const secret = "test_secret_v1_1";

  test("signature is 64-char lowercase hex", () => {
    expect(computeSignature(SPEC_PARAMS, secret)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("verifySignature round-trips and rejects tampering", () => {
    const sig = computeSignature(SPEC_PARAMS, secret);
    expect(verifySignature(SPEC_PARAMS, sig, secret)).toBe(true);

    const tampered = { ...SPEC_PARAMS, sn: "SN9999ZZZZ" };
    expect(verifySignature(tampered, sig, secret)).toBe(false);
  });
});
