/**
 * One-off integration test for Phase 2F-2 Step #1: findJobBySN().
 *
 * Exercises the SOSL-based SN → Job__c lookup against the configured
 * sandbox. Does NOT touch /api/submit, createCustomerCare(), or any
 * UI — this is pure Salesforce read traffic.
 *
 * Run:
 *   npx tsx scripts/test-sosl-lookup.ts
 *
 * Verification:
 *   Expect 4/4 PASS and exit code 0.
 *
 * Data dependency (Partial Copy `sunterra--test` real-data baseline):
 *   - Job__c record JOB-26359 must exist in the sandbox with
 *     Inverter_Battery_Serials__c containing the token "YRP2FXA0C6".
 *     This is real production-sample data (verified via Case-14018
 *     in the SF UI). If Test 1 starts failing, check whether the
 *     Job/SN association in production has changed since the last
 *     Partial Copy refresh.
 *
 * Safety:
 *   - .env.local must be present; this script loads it into process.env.
 *   - No new dependencies; Node 18+ fetch + fs only.
 *   - The access token is never logged.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Step 1: load .env.local before any lib/env access fires.
// ──────────────────────────────────────────────────────────────────────────
function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(envPath, "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

import { findJobBySN, type JobLookupResult } from "@/lib/salesforce";

// ──────────────────────────────────────────────────────────────────────────
// Minimal OAuth (Client Credentials) — intentionally NOT using the
// cached getAccessToken from lib/salesforce because findJobBySN is a
// pure function that takes the token as a parameter. We want this test
// to mirror that calling convention.
// ──────────────────────────────────────────────────────────────────────────
interface OAuthResponse {
  access_token: string;
  instance_url?: string;
}

async function getAccessToken(): Promise<string> {
  const instance = (process.env.SALESFORCE_INSTANCE_URL ?? "").replace(
    /\/$/,
    ""
  );
  const res = await fetch(`${instance}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SALESFORCE_CLIENT_ID ?? "",
      client_secret: process.env.SALESFORCE_CLIENT_SECRET ?? "",
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(
      `OAuth failed: HTTP ${res.status} ${await res.text().catch(() => "")}`
    );
  }
  const json = (await res.json()) as OAuthResponse;
  return json.access_token;
}

// ──────────────────────────────────────────────────────────────────────────
// Tiny test harness
// ──────────────────────────────────────────────────────────────────────────
interface TestCase {
  name: string;
  input: string;
  expect:
    | { kind: "match"; name: string } // require a record back, .name must equal this
    | { kind: "null" }; // require null
}

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

function fmtActual(actual: JobLookupResult | null): string {
  if (actual === null) return "null";
  return `{ id: "${actual.id}", name: "${actual.name}" }`;
}

async function runCase(
  tc: TestCase,
  accessToken: string,
  instanceUrl: string
): Promise<TestResult> {
  console.log(`\n--- ${tc.name} ---`);
  console.log(`  input:    ${JSON.stringify(tc.input)}`);
  if (tc.expect.kind === "match") {
    console.log(`  expected: match with name="${tc.expect.name}"`);
  } else {
    console.log(`  expected: null`);
  }

  let actual: JobLookupResult | null;
  try {
    actual = await findJobBySN(tc.input, accessToken, instanceUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  actual:   THREW (should never happen!) — ${msg}`);
    return {
      name: tc.name,
      passed: false,
      detail: `findJobBySN threw: ${msg}`,
    };
  }

  console.log(`  actual:   ${fmtActual(actual)}`);

  let passed = false;
  let detail = "";
  if (tc.expect.kind === "null") {
    passed = actual === null;
    detail = passed
      ? "got null as expected"
      : `expected null, got ${fmtActual(actual)}`;
  } else {
    passed =
      actual !== null &&
      typeof actual.id === "string" &&
      actual.id.length > 0 &&
      actual.name === tc.expect.name;
    detail = passed
      ? `matched name="${tc.expect.name}" id="${actual!.id}"`
      : `expected match name="${tc.expect.name}", got ${fmtActual(actual)}`;
  }

  console.log(`  result:   ${passed ? "✅ PASS" : "❌ FAIL"} — ${detail}`);
  return { name: tc.name, passed, detail };
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const ts = new Date().toISOString();
  console.log(`[setup] timestamp:                ${ts}`);
  console.log(
    `[setup] SALESFORCE_INSTANCE_URL = ${process.env.SALESFORCE_INSTANCE_URL}`
  );
  console.log(
    `[setup] SALESFORCE_API_VERSION  = ${process.env.SALESFORCE_API_VERSION}`
  );

  const instanceUrl = (process.env.SALESFORCE_INSTANCE_URL ?? "").replace(
    /\/$/,
    ""
  );
  if (!instanceUrl) {
    console.error("❌ SALESFORCE_INSTANCE_URL is not set.");
    process.exit(1);
  }

  console.log(`\n[oauth] fetching access token ...`);
  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error(
      `❌ Could not obtain OAuth token: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    process.exit(1);
  }
  console.log(`[oauth] ok (token length=${accessToken.length})`);

  const cases: TestCase[] = [
    {
      name: "Test 1: Happy path — SN=YRP2FXA0C6 → JOB-26359 (real prod data)",
      input: "YRP2FXA0C6",
      expect: { kind: "match", name: "JOB-26359" },
    },
    {
      name: "Test 2: Unmatched SN → null",
      input: "SUNTERRACLAUDETEST404XYZ",
      expect: { kind: "null" },
    },
    {
      name: "Test 3: SOSL hyphens in SN — should not throw",
      input: "YRP-2FXA-0C6",
      expect: { kind: "null" },
    },
    {
      name: "Test 4: Empty input — short-circuits to null",
      input: "",
      expect: { kind: "null" },
    },
  ];

  const results: TestResult[] = [];
  for (const tc of cases) {
    results.push(await runCase(tc, accessToken, instanceUrl));
  }

  // ────────────────── Summary ──────────────────
  console.log(`\n──────────── Summary ────────────`);
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed);
  for (const r of results) {
    console.log(`${r.passed ? "✅" : "❌"} ${r.name}`);
  }
  console.log(`\nPassed: ${passed}/${results.length}`);

  if (failed.length > 0) {
    console.log(`\nFailures:`);
    for (const r of failed) {
      console.log(`  - ${r.name}\n      ${r.detail}`);
    }
  }

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`[fatal] unhandled error: ${(err as Error).message}`);
  console.error(err);
  process.exit(1);
});
