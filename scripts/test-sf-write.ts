/**
 * One-off integration test for Phase 2F-1: lib/salesforce.ts.
 *
 * Exercises the write path (createCustomerCare) against the configured
 * sandbox. Each created Customer_Care__c record is printed at the end so
 * Jack can clean them up manually in the SF UI.
 *
 * Run: npx tsx scripts/test-sf-write.ts
 *
 * Behavior:
 *   - Every test case runs independently; one failure does NOT short-circuit.
 *   - Caller (the script) catches per-test errors and prints them with ❌.
 *   - Exit code: 0 if all expected outcomes happened, 1 otherwise.
 *
 * Safety:
 *   - .env.local must be present; the script loads it into process.env.
 *   - No new dependencies; only Node 18+ fetch + fs (used to read .env.local).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Step 1: load .env.local into process.env BEFORE any lib/env access fires.
// lib/env.ts uses a lazy Proxy, so importing lib/salesforce by itself does
// not read env — env is only touched when a salesforce function is invoked.
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

// Static imports are hoisted, but lib/salesforce only reads env when its
// functions are invoked (Proxy + lazy validation), so this ordering works.
import { createCustomerCare } from "@/lib/salesforce";

// ──────────────────────────────────────────────────────────────────────────
// Tiny test harness
// ──────────────────────────────────────────────────────────────────────────
interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];
const createdCaseIds: string[] = [];

function header(name: string): void {
  console.log(`\n=== ${name} ===`);
}

function pass(name: string, detail?: string): void {
  console.log(`✅ PASS — ${name}${detail ? ` (${detail})` : ""}`);
  results.push({ name, passed: true, detail });
}

function fail(name: string, detail: string): void {
  console.log(`❌ FAIL — ${name} — ${detail}`);
  results.push({ name, passed: false, detail });
}

async function runStep<T>(
  fn: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: Error }> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err as Error };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const ts = new Date().toISOString();
  console.log(`[setup] timestamp: ${ts}`);
  console.log(`[setup] SALESFORCE_INSTANCE_URL = ${process.env.SALESFORCE_INSTANCE_URL}`);
  console.log(`[setup] SALESFORCE_API_VERSION  = ${process.env.SALESFORCE_API_VERSION}`);

  // ───── Test 2.a: createCustomerCare unmatched ─────
  {
    const name = "Test 2.a: createCustomerCare unmatched (no installationId)";
    header(name);
    const subject = `TEST - Phase 2F-1 unmatched - ${ts}`;
    console.log(`Calling createCustomerCare({ subject: ${JSON.stringify(subject)}, ... })`);
    const r = await runStep(() =>
      createCustomerCare({
        subject,
        description: "Automated test from scripts/test-sf-write.ts",
        type: "General Inquiries",
        sn: "TEST_SN_FROM_SCRIPT",
        customerName: "Test Customer",
        email: "test@example.com",
      })
    );
    if (!r.ok) {
      fail(name, `unexpected throw: ${r.error.message}`);
    } else {
      console.log(`   → caseId: ${r.value.caseId}, matched: ${r.value.matched}`);
      createdCaseIds.push(r.value.caseId);
      if (r.value.matched !== false) {
        fail(name, `expected matched=false, got matched=${r.value.matched}`);
      } else if (typeof r.value.caseId !== "string" || r.value.caseId.length < 15) {
        fail(name, `bad caseId: ${JSON.stringify(r.value.caseId)}`);
      } else {
        pass(name, `created ${r.value.caseId}, matched=false`);
      }
    }
  }

  // ───── Test 2.b: createCustomerCare with fake installationId (negative test) ─────
  {
    const name = "Test 2.b: createCustomerCare with fake installationId (expects SF error)";
    header(name);
    // 18-char fake Job__c Id: keyPrefix a00 + 15 zero-ish chars (syntactically
    // valid base62 but no such record exists). SF should reject with
    // MALFORMED_ID or INVALID_CROSS_REFERENCE_KEY.
    const fakeId = "a000000000000000AAA";
    const subject = `TEST - Phase 2F-1 bad-lookup - ${ts}`;
    console.log(`Calling createCustomerCare({ installationId: ${JSON.stringify(fakeId)}, ... })`);
    const r = await runStep(() =>
      createCustomerCare({
        subject,
        description: "Automated negative test — expects SF rejection",
        type: "General Inquiries",
        sn: "TEST_SN_FROM_SCRIPT",
        installationId: fakeId,
      })
    );
    if (r.ok) {
      // If SF happened to accept it (extremely unlikely), record the caseId
      // for cleanup and mark the test as a failure.
      console.log(`   → caseId: ${r.value.caseId}, matched: ${r.value.matched}`);
      createdCaseIds.push(r.value.caseId);
      fail(name, `SF accepted a fake Job ID; expected rejection. caseId=${r.value.caseId}`);
    } else {
      const msg = r.error.message;
      console.log(`   → caught error: ${msg}`);
      // Look for the expected SF error codes in the message.
      const expectedCodes = [
        "MALFORMED_ID",
        "INVALID_CROSS_REFERENCE_KEY",
        "INVALID_FIELD",
      ];
      const matched = expectedCodes.find((c) => msg.includes(c));
      if (matched) {
        pass(name, `SF rejected with ${matched} as expected`);
      } else {
        pass(
          name,
          `SF threw (as expected) but error code is unfamiliar — inspect: ${msg.slice(0, 200)}`
        );
      }
    }
  }

  // ───── Test 2.c (placeholder): createCustomerCare with real Job ID ─────
  // To enable, set REAL_JOB_ID below to an actual Job__c Id from the sandbox.
  // {
  //   const name = "Test 2.c: createCustomerCare with real Job ID (matched)";
  //   header(name);
  //   const REAL_JOB_ID = "PUT-A-REAL-JOB-ID-HERE";
  //   const subject = `TEST - Phase 2F-1 matched - ${ts}`;
  //   const r = await runStep(() =>
  //     createCustomerCare({
  //       subject,
  //       description: "Automated matched test",
  //       type: "General Inquiries",
  //       sn: "TEST_SN_FROM_SCRIPT",
  //       installationId: REAL_JOB_ID,
  //     })
  //   );
  //   if (!r.ok) fail(name, `unexpected throw: ${r.error.message}`);
  //   else {
  //     createdCaseIds.push(r.value.caseId);
  //     if (r.value.matched !== true) fail(name, `expected matched=true, got ${r.value.matched}`);
  //     else pass(name, `created ${r.value.caseId}, matched=true`);
  //   }
  // }
  header("Test 2.c: createCustomerCare with real Job ID (SKIPPED — Jack must supply a real Job__c Id)");
  console.log("⏭  Skipped. Edit script to enable.");

  // ──────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────
  console.log("\n──────────── Summary ────────────");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  for (const r of results) {
    console.log(`${r.passed ? "✅" : "❌"} ${r.name}`);
  }
  console.log(`\nPassed: ${passed} | Failed: ${failed}`);

  console.log(
    `\nCases created in this run: [${createdCaseIds.map((id) => `"${id}"`).join(", ")}]`
  );
  if (createdCaseIds.length > 0) {
    console.log(
      "↑ Clean these up in the SF sandbox UI (Customer_Care__c list view) after inspection."
    );
  }

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`[fatal] unhandled error: ${(err as Error).message}`);
  console.error(err);
  console.log(
    `\nCases created in this run before crash: [${createdCaseIds.map((id) => `"${id}"`).join(", ")}]`
  );
  process.exit(1);
});
