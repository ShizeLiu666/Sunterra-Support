/**
 * One-off integration test for Phase 2G-3 partial-failure path.
 *
 * Submits a real /api/submit request (against a locally-running dev server)
 * with TWO photos in the body:
 *   1. "broken" slot   — an OVERSIZED base64 string (>5 MB decoded). The
 *                        uploadPhotoToCase helper does a local pre-flight
 *                        size check (5 MB cap) and returns
 *                        { kind: 'too_large' } WITHOUT contacting
 *                        Salesforce. This is the only reliable way to
 *                        deterministically exercise the partial-failure
 *                        path against the live sandbox.
 *   2. test-photo.jpg  — real JPEG fixture from Phase 2G-1
 *
 * NOTE: Earlier iterations of this script tried two simpler failure
 * triggers, both of which Salesforce silently accepts:
 *   (a) garbage ASCII bytes encoded as valid base64 (broken.jpg on disk).
 *       Salesforce stores ContentVersion bytes as-is and does NOT validate
 *       that they form a real image. Result: HTTP 201, 2/2 succeeded.
 *   (b) intentionally INVALID base64 chars (`"@@@ ... @@@"`). Salesforce's
 *       decoder is unexpectedly lenient — also HTTP 201, 2/2 succeeded.
 * Only the oversized-payload approach reliably triggers a server-side
 * failure (specifically: uploadPhotoToCase's own pre-flight check).
 *
 * Goal: verify that when ONE photo fails to upload to Salesforce, the
 * resulting Case is still created, the API response includes
 * `photoWarning: 1`, and the SF Files area on the case holds exactly 1
 * ContentDocumentLink.
 *
 * Prereqs:
 *   - npm run dev must already be running on http://localhost:3000
 *   - scripts/fixtures/test-photo.jpg must exist (Phase 2G-1)
 *   - scripts/fixtures/broken.jpg must exist; create with:
 *       echo "this is not a valid image file just random bytes" > scripts/fixtures/broken.jpg
 *
 * Run:
 *   npx tsx scripts/test-partial-failure.ts
 *
 * Side effects:
 *   - Creates 1 Customer_Care__c record in the SF sandbox (test data; Jack
 *     should delete after review).
 *   - Creates 1 or 2 ContentVersion rows attached to that Case, depending
 *     on whether Salesforce actually rejects the broken bytes.
 *
 * Exit code: 0 if all assertions pass, 1 otherwise.
 *
 * Safety:
 *   - Does NOT modify any business code.
 *   - Does NOT install dependencies.
 *   - Never logs base64 payload (only its length).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";

// ──────────────────────────────────────────────────────────────────────────
// Load .env.local — same pattern as scripts/test-photo-upload.ts.
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

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────
const DEV_BASE_URL = "http://localhost:3000";
const SUBMIT_URL = `${DEV_BASE_URL}/api/submit`;
const BROKEN_PATH = resolve(
  process.cwd(),
  "scripts",
  "fixtures",
  "broken.jpg"
);
const PHOTO_PATH = resolve(
  process.cwd(),
  "scripts",
  "fixtures",
  "test-photo.jpg"
);

// Arbitrary SN — verifyToken does not whitelist SNs, only validates the
// HMAC signature + timestamp. Distinct from production SNs to make
// cleanup obvious.
const TEST_SN = "GW2024-PARTIAL-FAIL";

const EXPECTED_PHOTO_WARNING = 1;
const EXPECTED_SF_FILES = 1;

// ──────────────────────────────────────────────────────────────────────────
// HMAC signing — mirrors lib/hmac.ts#computeSignature so this script has
// zero dependency on lib/ modules (would otherwise have to mock env access).
// ──────────────────────────────────────────────────────────────────────────
function signParams(
  params: Record<string, string>,
  secret: string
): string {
  const signString = Object.entries(params)
    .filter(([k, v]) => k !== "sign" && v !== undefined && v !== "")
    .map(([k, v]) => [k, String(v)] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return crypto
    .createHmac("sha256", secret)
    .update(signString, "utf8")
    .digest("hex");
}

// ──────────────────────────────────────────────────────────────────────────
// Salesforce helpers — minimal OAuth + SOQL, intentionally NOT importing
// lib/salesforce because its private getAccessToken cache is unhelpful in
// a one-shot script.
// ──────────────────────────────────────────────────────────────────────────
interface OAuthResponse {
  access_token: string;
}
interface SoqlCaseLookup {
  records?: Array<{ Id: string }>;
}
interface SoqlLinkLookup {
  records?: Array<{ Id: string; ContentDocumentId: string }>;
}

async function sfOAuth(): Promise<string> {
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
      `SF OAuth failed: HTTP ${res.status} ${await res.text().catch(() => "")}`
    );
  }
  const json = (await res.json()) as OAuthResponse;
  return json.access_token;
}

async function sfQuery<T>(token: string, soql: string): Promise<T> {
  const instance = (process.env.SALESFORCE_INSTANCE_URL ?? "").replace(
    /\/$/,
    ""
  );
  const apiVersion = process.env.SALESFORCE_API_VERSION || "v62.0";
  const url = `${instance}/services/data/${apiVersion}/query?q=${encodeURIComponent(
    soql
  )}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(
      `SOQL query failed: HTTP ${res.status} ${await res.text().catch(() => "")}`
    );
  }
  return (await res.json()) as T;
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────
interface SubmitOk {
  success: true;
  caseNumber: string;
  matched: boolean;
  photoWarning?: number;
}
interface SubmitErr {
  success: false;
  error: string;
}
type SubmitResponse = SubmitOk | SubmitErr;

async function main(): Promise<void> {
  const ts = new Date().toISOString();
  console.log(`[setup] timestamp: ${ts}`);
  console.log(`[setup] SUBMIT_URL: ${SUBMIT_URL}`);
  console.log(
    `[setup] SALESFORCE_INSTANCE_URL: ${process.env.SALESFORCE_INSTANCE_URL}`
  );

  // ── Preflight ────────────────────────────────────────────────────────────
  if (!existsSync(BROKEN_PATH)) {
    console.error(`❌ Missing fixture: ${BROKEN_PATH}`);
    console.error(
      `   Create with: echo "this is not a valid image file just random bytes" > scripts/fixtures/broken.jpg`
    );
    process.exit(1);
  }
  if (!existsSync(PHOTO_PATH)) {
    console.error(`❌ Missing fixture: ${PHOTO_PATH}`);
    console.error(
      `   Place a small JPG (<100KB) at scripts/fixtures/test-photo.jpg`
    );
    process.exit(1);
  }

  try {
    await fetch(DEV_BASE_URL, { method: "GET" });
  } catch (err) {
    console.error(`❌ Dev server not reachable at ${DEV_BASE_URL}.`);
    console.error(`   Start it in another terminal with: npm run dev`);
    console.error(`   Underlying error: ${(err as Error).message}`);
    process.exit(1);
  }
  console.log(`[setup] dev server reachable`);

  // ── Prepare payload ──────────────────────────────────────────────────────
  const brokenBytes = readFileSync(BROKEN_PATH);
  const photoBytes = readFileSync(PHOTO_PATH);
  const photoB64 = photoBytes.toString("base64");
  // Oversized payload: ~7 MB of valid base64 chars. Estimated decoded size
  // is 7_000_000 * 0.75 ≈ 5.25 MB, just over uploadPhotoToCase's 5 MB cap.
  // The helper rejects this locally with { kind: 'too_large' } before ever
  // calling Salesforce.
  const brokenB64 = "A".repeat(7_000_000);
  console.log(
    `[setup] broken.jpg     ${brokenBytes.length} bytes on disk (NOT sent; using oversized payload instead)`
  );
  console.log(
    `[setup] payload "broken" base64 length = ${brokenB64.length} chars (~${Math.round(
      brokenB64.length * 0.75
    )} bytes decoded; triggers uploadPhotoToCase 5 MB cap)`
  );
  console.log(
    `[setup] test-photo.jpg ${photoBytes.length} bytes  -> base64 ${photoB64.length}`
  );

  const secret = process.env.HMAC_SECRET;
  if (!secret || secret.length === 0) {
    console.error(`❌ HMAC_SECRET missing from .env.local`);
    process.exit(1);
  }
  const tokenParams: Record<string, string> = {
    sn: TEST_SN,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  const sign = signParams(tokenParams, secret);
  console.log(
    `[setup] token sn=${tokenParams.sn} timestamp=${tokenParams.timestamp} sign=${sign.slice(
      0,
      12
    )}...`
  );

  const body = {
    token: {
      sn: tokenParams.sn,
      timestamp: tokenParams.timestamp,
      sign,
    },
    form: {
      type: "system_not_working",
      subject: "Support: System not working",
      description: `Phase 2G-3 partial failure test ${ts}`,
      customerName: "Test User (Phase 2G-3 partial)",
      email: "test@example.com",
      installationStreet: "123 Test St (partial failure test)",
    },
    photos: [
      { filename: "broken.jpg", mimeType: "image/jpeg", base64: brokenB64 },
      {
        filename: "test-photo.jpg",
        mimeType: "image/jpeg",
        base64: photoB64,
      },
    ],
  };

  // ── POST /api/submit ─────────────────────────────────────────────────────
  console.log(`\n[POST] ${SUBMIT_URL}`);
  const t0 = Date.now();
  const res = await fetch(SUBMIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const httpElapsed = Date.now() - t0;
  const text = await res.text();
  console.log(`[POST] HTTP ${res.status} in ${httpElapsed}ms`);
  console.log(`[POST] response body: ${text}`);

  let parsed: SubmitResponse | null = null;
  try {
    parsed = JSON.parse(text) as SubmitResponse;
  } catch {
    parsed = null;
  }

  if (!parsed || parsed.success !== true) {
    console.error(`❌ Case creation failed; cannot proceed to SF verification.`);
    process.exit(1);
  }

  const caseNumber = parsed.caseNumber;
  const apiPhotoWarning =
    typeof parsed.photoWarning === "number" ? parsed.photoWarning : undefined;
  console.log(`\n[api]   caseNumber       = ${caseNumber}`);
  console.log(`[api]   matched          = ${parsed.matched}`);
  console.log(
    `[api]   photoWarning     = ${apiPhotoWarning ?? "(absent / 0)"}`
  );

  // ── SF verification: resolve Id, then count ContentDocumentLink rows ─────
  console.log(`\n[sf]    OAuth ...`);
  const sfToken = await sfOAuth();
  console.log(`[sf]    OAuth ok`);

  let caseId: string;
  if (caseNumber.startsWith("Case-")) {
    const escaped = caseNumber.replace(/'/g, "\\'");
    const soql = `SELECT Id FROM Customer_Care__c WHERE Name = '${escaped}' LIMIT 1`;
    console.log(`[sf]    SOQL: ${soql}`);
    const lookup = await sfQuery<SoqlCaseLookup>(sfToken, soql);
    if (!lookup.records || lookup.records.length === 0) {
      console.error(
        `❌ Could not resolve case Id from caseNumber=${caseNumber}`
      );
      process.exit(1);
    }
    caseId = lookup.records[0].Id;
  } else {
    caseId = caseNumber;
  }
  console.log(`[sf]    case Id = ${caseId}`);

  const linkSoql = `SELECT Id, ContentDocumentId FROM ContentDocumentLink WHERE LinkedEntityId = '${caseId}'`;
  console.log(`[sf]    SOQL: ${linkSoql}`);
  const links = await sfQuery<SoqlLinkLookup>(sfToken, linkSoql);
  const sfFilesCount = links.records?.length ?? 0;
  console.log(`[sf]    ContentDocumentLink rows = ${sfFilesCount}`);
  if (links.records && links.records.length > 0) {
    for (const r of links.records) {
      console.log(`        - link ${r.Id}  -> document ${r.ContentDocumentId}`);
    }
  }

  // ── Final structured report ──────────────────────────────────────────────
  const pass =
    parsed.success === true &&
    caseNumber.startsWith("Case-") &&
    apiPhotoWarning === EXPECTED_PHOTO_WARNING &&
    sfFilesCount === EXPECTED_SF_FILES;

  console.log(`\n──────────── Structured result ────────────`);
  const result = {
    case_created: parsed.success === true,
    case_number: caseNumber,
    case_id: caseId,
    api_response_photo_warning: apiPhotoWarning,
    sf_files_count: sfFilesCount,
    expected: {
      photo_warning: EXPECTED_PHOTO_WARNING,
      sf_files: EXPECTED_SF_FILES,
    },
    pass,
  };
  console.log(JSON.stringify(result, null, 2));

  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(`[fatal] ${(err as Error).message}`);
  console.error(err);
  process.exit(1);
});
