/**
 * One-off integration test for Phase 2G-1: uploadPhotoToCase().
 *
 * Uploads a single JPEG fixture as a Salesforce File attached to a known
 * existing Customer_Care__c record, prints the resulting ContentVersion Id
 * and a clickable Salesforce URL for verification.
 *
 * Run:
 *   npx tsx scripts/test-photo-upload.ts
 *
 * Prereq (do this before running):
 *   Place a small JPG (< 100 KB) at scripts/fixtures/test-photo.jpg.
 *   The fixtures directory is gitignored — do NOT commit real customer photos.
 *
 * Verification (after a successful run):
 *   1. Open the printed Salesforce URL in a browser; OR
 *   2. In Salesforce, navigate to Customer_Care__c -> Case-14060 detail page.
 *      The "Files" related list on the right side should show the newly
 *      uploaded file (filename test-photo.jpg) with a thumbnail.
 *
 * Exit code: 0 on success, 1 on any failure.
 *
 * Safety:
 *   - .env.local must be present; the script loads it into process.env.
 *   - No new dependencies; Node 18+ fetch + fs only.
 *   - The base64 payload is never logged (its length is logged).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Load .env.local before any lib/env access fires (Proxy is lazy, but the
// salesforce module reads env at call time, so importing it is still safe).
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

import { uploadPhotoToCase } from "@/lib/salesforce";

// ──────────────────────────────────────────────────────────────────────────
// Test parameters
// ──────────────────────────────────────────────────────────────────────────

// Known-existing sandbox Customer_Care__c record (Case-14060), verified
// during Phase 2F. Used purely as an upload target for this smoke test.
const TEST_CASE_ID = "a1y8s00000EcUhlAAF";

const FIXTURE_PATH = resolve(
  process.cwd(),
  "scripts",
  "fixtures",
  "test-photo.jpg"
);

async function main(): Promise<void> {
  const ts = new Date().toISOString();
  console.log(`[setup] timestamp: ${ts}`);
  console.log(
    `[setup] SALESFORCE_INSTANCE_URL = ${process.env.SALESFORCE_INSTANCE_URL}`
  );
  console.log(
    `[setup] SALESFORCE_API_VERSION  = ${process.env.SALESFORCE_API_VERSION}`
  );
  console.log(`[setup] TEST_CASE_ID            = ${TEST_CASE_ID}`);
  console.log(`[setup] FIXTURE_PATH            = ${FIXTURE_PATH}`);

  if (!existsSync(FIXTURE_PATH)) {
    console.error(`\n❌ Fixture not found at ${FIXTURE_PATH}`);
    console.error(
      `Please place a small JPG (< 100 KB) at scripts/fixtures/test-photo.jpg and re-run.`
    );
    process.exit(1);
  }

  const bytes = readFileSync(FIXTURE_PATH);
  const base64Data = bytes.toString("base64");
  console.log(`[setup] fixture bytes:      ${bytes.length}`);
  console.log(`[setup] base64 length:      ${base64Data.length}`);

  const title = `Phase 2G test upload ${ts}`;
  console.log(`\n=== uploadPhotoToCase ===`);
  console.log(
    `Calling uploadPhotoToCase({ caseId=${TEST_CASE_ID}, title=${JSON.stringify(
      title
    )}, filename="test-photo.jpg", mimeType="image/jpeg", base64Data=<${base64Data.length} chars> })`
  );

  const result = await uploadPhotoToCase({
    caseId: TEST_CASE_ID,
    title,
    filename: "test-photo.jpg",
    base64Data,
    mimeType: "image/jpeg",
  });

  if (result.success) {
    const baseUrl = (process.env.SALESFORCE_INSTANCE_URL ?? "").replace(
      /\/$/,
      ""
    );
    const viewUrl = `${baseUrl}/${result.contentVersionId}`;
    console.log(`\n✅ Upload succeeded.`);
    console.log(`   contentVersionId: ${result.contentVersionId}`);
    console.log(`   View in Salesforce: ${viewUrl}`);
    console.log(
      `\nNext: open Customer_Care__c -> Case-14060 in the SF UI and confirm`
    );
    console.log(`      the "Files" related list shows the new attachment.`);
    process.exit(0);
  }

  console.error(`\n❌ Upload failed.`);
  console.error(`   error.kind:        ${result.error.kind}`);
  if (typeof result.error.httpStatus === "number") {
    console.error(`   error.httpStatus:  ${result.error.httpStatus}`);
  }
  console.error(`   error.message:     ${result.error.message}`);
  console.error(`   (full error object)`);
  console.error(JSON.stringify(result.error, null, 2));
  process.exit(1);
}

main().catch((err) => {
  console.error(`[fatal] unhandled error: ${(err as Error).message}`);
  console.error(err);
  process.exit(1);
});
