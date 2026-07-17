/**
 * Salesforce REST API client for the Sunterra support ticket flow.
 *
 * Object model recap:
 *   - Customer_Care__c  → the "Case"/ticket record we create
 *   - Job__c            → the "Installation" record (API name is Job__c;
 *                         label is "Installation"). Reverse-lookup from
 *                         SN to Job__c is implemented as `findJobBySN()`
 *                         (SOSL) but is currently gated behind the
 *                         ENABLE_SOSL_JOB_LOOKUP env flag — see Phase 2J
 *                         multi-SN note below.
 *
 * The web layer's responsibility is intentionally minimal:
 *   - Build a Customer_Care__c record from the form payload
 *   - Stash the inverter SN(s) in Inverter_Battery_Serials__c. With
 *     ShinePhone v1 the caller passes a comma-joined string of 1..5 SNs;
 *     the field must be a Long Text Area to hold the worst case.
 *   - Leave Job_Number__c empty when the SOSL lookup is disabled or
 *     unmatched; support staff will reconcile manually.
 *
 * Auth flow: Client Credentials Flow against the Connected App configured by
 * Sunterra's SF admin. The "Run-As User" identity is set in SF; we just need
 * SALESFORCE_CLIENT_ID + SALESFORCE_CLIENT_SECRET.
 *
 * Token caching: SF Client Credentials tokens cannot be refreshed; we just
 * fetch a new one when the cached one expires. TTL of 2h is conservative
 * (default SF session is ~2h; this avoids edge-case 401s near expiry).
 */

import { env } from "@/lib/env";

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

interface SfTokenResponse {
  access_token: string;
  instance_url?: string;
  token_type?: string;
  issued_at?: string;
  signature?: string;
  scope?: string;
  id?: string;
}

interface SfCreateResponse {
  id: string;
  success: boolean;
  errors?: unknown[];
}

interface SfNameResponse {
  Name?: string;
}

function instanceBaseUrl(): string {
  return env.SALESFORCE_INSTANCE_URL.replace(/\/$/, "");
}

async function readBodySnippet(res: Response, max: number = 1000): Promise<string> {
  try {
    const text = await res.text();
    return text.length > max ? text.slice(0, max) + "…(truncated)" : text;
  } catch {
    return "(failed to read response body)";
  }
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  console.log("[salesforce] OAuth: fetching new access token (cache miss)");

  const url = `${instanceBaseUrl()}/services/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.SALESFORCE_CLIENT_ID,
    client_secret: env.SALESFORCE_CLIENT_SECRET,
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });
  } catch (err) {
    throw new Error(
      `Salesforce OAuth network error: ${(err as Error).message}`
    );
  }

  if (!res.ok) {
    const snippet = await readBodySnippet(res);
    throw new Error(
      `Salesforce OAuth failed: ${res.status} ${res.statusText} — ${snippet}`
    );
  }

  let json: SfTokenResponse;
  try {
    json = (await res.json()) as SfTokenResponse;
  } catch (err) {
    throw new Error(
      `Salesforce OAuth: failed to parse response JSON: ${(err as Error).message}`
    );
  }

  if (!json.access_token) {
    throw new Error("Salesforce OAuth: response missing access_token");
  }

  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };

  return json.access_token;
}

/**
 * Input for createCustomerCare. Field comments document the SF mapping.
 */
export interface CreateCustomerCareInput {
  // Required
  subject: string; // → Subject__c
  description: string; // → Description__c
  type: string; // → Type__c (caller passes already-mapped SF picklist value)
  sn: string; // → Inverter_Battery_Serials__c. With ShinePhone v1 this is
  //              a comma-joined string of 1..5 SNs (e.g. "SN1,SN2,SN3");
  //              caller is responsible for joining. SF field must be a
  //              Long Text Area to hold the worst case.

  // Optional association
  installationId?: string | null; // → Job_Number__c (omit field entirely if null/undefined)

  // Optional customer info
  customerName?: string; // → Customer_Name__c
  email?: string; // → Email__c
  mobile?: string; // → Mobile__c

  // Optional installation address
  installationStreet?: string; // → Installation_Street__c
  installationSuburb?: string; // → Installation_Suburb__c
  installationState?: string; // → Installation_State__c
  installationPostcode?: string; // → Installation_Postcode__c

  // Optional source
  caseOrigin?: string; // → Case_Origin__c (defaults to 'Web')
}

/**
 * Create a Customer_Care__c record in Salesforce.
 *
 * Returns { id, name, matched }:
 *   - id      — Salesforce Record ID (18-char), API-side identifier.
 *   - name    — Auto Number `Name` field (e.g. "Case-14060"), the
 *               customer-facing reference. `null` if the post-create GET
 *               failed; the create itself is still considered successful.
 *   - matched — true iff Phase 2F-2's findJobBySN() resolved the input SN
 *               to a Job__c record. Phase 2F-2 owns this resolution
 *               internally; the legacy `input.installationId` escape hatch
 *               still wins for Job_Number__c when present, but does NOT
 *               flip matched=true (matched strictly reflects the SOSL
 *               lookup outcome).
 *
 * Fields with undefined/null values are omitted from the POST body so SF's
 * defaults stay in effect. Specifically: Status__c and Priority__c are
 * never sent — they rely on SF defaults.
 */
export async function createCustomerCare(
  input: CreateCustomerCareInput
): Promise<{ id: string; name: string | null; matched: boolean }> {
  const token = await getAccessToken();

  // --- Phase 2F-2: SN reverse-lookup to Job__c ---
  // findJobBySN never throws; on any failure (network/timeout/permission/
  // 0 results/etc.) it returns null and logs to console.error. We treat
  // null as "unmatched" — case is still created, just without Job_Number__c
  // populated. Support staff will reconcile manually.
  //
  // Phase 2J (multi-SN ShinePhone v1): the lookup is gated behind
  // ENABLE_SOSL_JOB_LOOKUP. With multi-SN, `input.sn` is a comma-joined
  // string like "SN1,SN2,SN3" — SOSL would never resolve that as a single
  // serial. The findJobBySN function is preserved so we can flip the flag
  // back on once ShinePhone supports a single-SN entry point.
  let matchedJob: JobLookupResult | null = null;
  if (env.ENABLE_SOSL_JOB_LOOKUP && input.sn) {
    matchedJob = await findJobBySN(input.sn, token, instanceBaseUrl());
  }
  // --- end Phase 2F-2 SN lookup ---

  const body: Record<string, string> = {
    Subject__c: input.subject,
    Description__c: input.description,
    Type__c: input.type,
    Inverter_Battery_Serials__c: input.sn,
    Case_Origin__c: input.caseOrigin ?? "Web",
  };

  // Phase 2F-2: caller-supplied installationId still takes precedence
  // (legacy escape hatch); otherwise fall back to the SOSL-resolved
  // Job__c when available. Either way: omit Job_Number__c entirely
  // when both are absent — never send it as null.
  if (input.installationId) {
    body.Job_Number__c = input.installationId;
  } else if (matchedJob) {
    body.Job_Number__c = matchedJob.id;
  }
  if (input.customerName) body.Customer_Name__c = input.customerName;
  if (input.email) body.Email__c = input.email;
  if (input.mobile) body.Mobile__c = input.mobile;
  if (input.installationStreet) body.Installation_Street__c = input.installationStreet;
  if (input.installationSuburb) body.Installation_Suburb__c = input.installationSuburb;
  if (input.installationState) body.Installation_State__c = input.installationState;
  if (input.installationPostcode) body.Installation_Postcode__c = input.installationPostcode;

  const url = `${instanceBaseUrl()}/services/data/${env.SALESFORCE_API_VERSION}/sobjects/Customer_Care__c`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Salesforce Customer_Care__c create network error: ${(err as Error).message}`
    );
  }

  if (!res.ok) {
    const snippet = await readBodySnippet(res);
    throw new Error(
      `Salesforce Customer_Care__c create failed: ${res.status} ${res.statusText} — ${snippet}`
    );
  }

  let json: SfCreateResponse;
  try {
    json = (await res.json()) as SfCreateResponse;
  } catch (err) {
    throw new Error(
      `Salesforce Customer_Care__c create: failed to parse response JSON: ${(err as Error).message}`
    );
  }

  if (!json.id) {
    throw new Error("Salesforce Customer_Care__c create: response missing id");
  }

  const id = json.id;
  const name = await fetchCustomerCareName(id, token);

  // --- case_created log: SOSL job-match observability (log-only) ---
  // sn_prefix = family code of the matched SN(s), so a miss can be classified
  // by SN type (inverter vs battery) at a glance. Safe on empty/undefined/multi:
  //   - leading letters are the family code: "RXS1F4K04L" -> RXS, "YRP0.." -> YRP,
  //     "OMRR.." -> OMRR
  //   - a digit-leading SN has no leading letters, so fall back to first 4 chars:
  //     "0VYQ.." -> 0VYQ
  //   - multi-SN (comma-joined): each part's prefix, deduped, joined with "|"
  //   - empty / undefined -> "(none)"  (never throws)
  const snPrefix = (raw: string | undefined | null): string => {
    const parts = (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parts.length === 0) return "(none)";
    const prefixes = parts.map((s) => {
      const up = s.toUpperCase();
      const letters = up.match(/^[A-Z]+/);
      return letters
        ? letters[0].slice(0, 4)
        : up.replace(/[^A-Z0-9]/g, "").slice(0, 4);
    });
    return [...new Set(prefixes)].join("|");
  };
  // Fixed, grep-able tag for a REAL miss: SOSL actually ran but found nothing.
  // Strictly sosl_enabled===true && matched===false — NOT when SOSL is disabled.
  const missTag =
    env.ENABLE_SOSL_JOB_LOOKUP === true && matchedJob === null
      ? " JOB_LOOKUP_MISS"
      : "";

  console.log(
    `[salesforce] createCustomerCare: case_created id=${id} name=${name ?? "(unavailable)"} sn=${input.sn} sn_prefix=${snPrefix(input.sn)} type=${input.type} sosl_enabled=${env.ENABLE_SOSL_JOB_LOOKUP} matched=${matchedJob !== null} ${matchedJob ? `job=${matchedJob.name}(${matchedJob.id})` : "job=null"}${missTag}`
  );

  return {
    id,
    name,
    matched: matchedJob !== null,
  };
}

/**
 * Fetch the `Name` (Auto Number, e.g. "Case-14060") of a freshly-created
 * Customer_Care__c record. This is the customer-facing reference; we display
 * it on the /success page instead of the opaque 18-char Record ID.
 *
 * Failure is non-fatal: we log via console.error and return null, letting
 * the caller fall back to the Record ID. The Case itself is already created
 * at this point, so we never want a display-only lookup to roll it back.
 *
 * Reuses the cached OAuth token from getAccessToken(); does not refresh it.
 */
async function fetchCustomerCareName(
  recordId: string,
  token: string
): Promise<string | null> {
  const url = `${instanceBaseUrl()}/services/data/${env.SALESFORCE_API_VERSION}/sobjects/Customer_Care__c/${encodeURIComponent(
    recordId
  )}?fields=Name`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const snippet = await readBodySnippet(res, 300);
      console.error(
        `[salesforce] fetchCustomerCareName: HTTP ${res.status} ${res.statusText} for ${recordId} — ${snippet}`
      );
      return null;
    }

    const json = (await res.json()) as SfNameResponse;
    if (typeof json.Name !== "string" || json.Name.length === 0) {
      console.error(
        `[salesforce] fetchCustomerCareName: response missing Name for ${recordId}`
      );
      return null;
    }

    return json.Name;
  } catch (err) {
    console.error(
      `[salesforce] fetchCustomerCareName: network error for ${recordId} — ${(err as Error).message}`
    );
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2G-1: photo upload to Salesforce Files
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Salesforce Files plumbing recap:
 *   - A "file" in SF is a ContentDocument with one or more ContentVersion rows.
 *   - To attach a file to a record (here: Customer_Care__c), you normally need
 *     a ContentDocumentLink. Setting ContentVersion.FirstPublishLocationId at
 *     create time lets SF auto-build that link, so this is a single round-trip.
 *   - VersionData is base64-encoded bytes (raw bytes, no data-URL prefix).
 *
 * This helper is intentionally side-effect free at the module level: no I/O,
 * no env access until called. It reuses getAccessToken()'s cache so back-to-back
 * uploads share an OAuth token.
 */

export interface PhotoUploadInput {
  caseId: string; // Customer_Care__c Record ID (15 or 18 alphanumeric chars)
  title: string; // Display title in SF Files UI
  filename: string; // Logical filename (e.g. "photo-1.jpg"); used as PathOnClient
  base64Data: string; // Raw base64 of the image bytes, NO data-URL prefix
  mimeType: string; // e.g. "image/jpeg" — must start with "image/"
}

/**
 * Error categories that callers can branch on. `kind` is the contract; the
 * other fields are diagnostic and should never be shown raw to the customer.
 */
export type PhotoUploadError = {
  kind:
    | "network"
    | "auth"
    | "permission"
    | "too_large"
    | "sf_rejected"
    | "unknown";
  message: string;
  httpStatus?: number;
};

export type PhotoUploadResult =
  | { success: true; contentVersionId: string }
  | { success: false; error: PhotoUploadError };

interface SfErrorEntry {
  message?: string;
  errorCode?: string;
  fields?: string[];
}

interface SfContentVersionCreateResponse {
  id?: string;
  success?: boolean;
  errors?: unknown[];
}

const CASE_ID_ALNUM_REGEX = /^[a-zA-Z0-9]+$/;
const MAX_PHOTO_DECODED_BYTES = 5 * 1024 * 1024; // 5 MB

function classifyPhotoUploadError(
  httpStatus: number,
  errorCode: string | undefined,
  message: string
): PhotoUploadError {
  if (httpStatus === 401 || errorCode === "INVALID_SESSION_ID") {
    return { kind: "auth", message, httpStatus };
  }
  if (
    httpStatus === 403 ||
    errorCode === "INSUFFICIENT_ACCESS_OR_READONLY"
  ) {
    return { kind: "permission", message, httpStatus };
  }
  if (httpStatus === 413 || errorCode === "FILE_TOO_LARGE") {
    return { kind: "too_large", message, httpStatus };
  }
  if (httpStatus >= 400 && httpStatus < 500) {
    return { kind: "sf_rejected", message, httpStatus };
  }
  return { kind: "unknown", message, httpStatus };
}

/**
 * Upload a single photo as a Salesforce File attached to a Customer_Care__c
 * record. Never throws — every failure path returns
 * { success: false, error: PhotoUploadError } so callers can branch on `kind`.
 *
 * The OAuth token is fetched via getAccessToken() (cached). The base64 payload
 * is never logged.
 */
export async function uploadPhotoToCase(
  input: PhotoUploadInput
): Promise<PhotoUploadResult> {
  // ── Local validation (fail-fast, no network) ─────────────────────────────
  const caseId =
    typeof input.caseId === "string" ? input.caseId.trim() : "";
  const validCaseIdLength = caseId.length === 15 || caseId.length === 18;
  if (!validCaseIdLength || !CASE_ID_ALNUM_REGEX.test(caseId)) {
    return {
      success: false,
      error: {
        kind: "sf_rejected",
        message: `Invalid caseId shape (expected 15- or 18-char alphanumeric SF Record ID): ${JSON.stringify(
          input.caseId
        )}`,
      },
    };
  }
  if (typeof input.base64Data !== "string" || input.base64Data.length === 0) {
    return {
      success: false,
      error: { kind: "sf_rejected", message: "base64Data is empty" },
    };
  }
  if (typeof input.mimeType !== "string" || !input.mimeType.startsWith("image/")) {
    return {
      success: false,
      error: {
        kind: "sf_rejected",
        message: `mimeType must start with "image/": got ${JSON.stringify(
          input.mimeType
        )}`,
      },
    };
  }

  // base64 encodes 3 bytes per 4 chars; this is a safe upper-bound estimate.
  const estimatedDecodedBytes = Math.floor(input.base64Data.length * 0.75);
  if (estimatedDecodedBytes > MAX_PHOTO_DECODED_BYTES) {
    return {
      success: false,
      error: {
        kind: "too_large",
        message: `Photo too large (~${estimatedDecodedBytes} bytes decoded, limit ${MAX_PHOTO_DECODED_BYTES} bytes / 5 MB)`,
      },
    };
  }

  // ── OAuth (cached) ───────────────────────────────────────────────────────
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[salesforce] uploadPhotoToCase: OAuth failed for case ${caseId} — ${message}`
    );
    return { success: false, error: { kind: "auth", message } };
  }

  // ── POST /sobjects/ContentVersion ────────────────────────────────────────
  const url = `${instanceBaseUrl()}/services/data/${env.SALESFORCE_API_VERSION}/sobjects/ContentVersion`;
  const requestBody = {
    Title: input.title,
    PathOnClient: input.filename,
    VersionData: input.base64Data,
    FirstPublishLocationId: caseId,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[salesforce] uploadPhotoToCase: network error for case ${caseId} — ${message}`
    );
    return { success: false, error: { kind: "network", message } };
  }

  // ── Success path ─────────────────────────────────────────────────────────
  if (res.status === 201) {
    let json: SfContentVersionCreateResponse;
    try {
      json = (await res.json()) as SfContentVersionCreateResponse;
    } catch (err) {
      const message = `Salesforce ContentVersion: failed to parse 201 response JSON: ${
        (err as Error).message
      }`;
      console.error(
        `[salesforce] uploadPhotoToCase: ${message} (case ${caseId})`
      );
      return {
        success: false,
        error: { kind: "unknown", message, httpStatus: 201 },
      };
    }
    if (typeof json.id !== "string" || json.id.length === 0) {
      const message = "Salesforce ContentVersion: 201 response missing id";
      console.error(
        `[salesforce] uploadPhotoToCase: ${message} (case ${caseId})`
      );
      return {
        success: false,
        error: { kind: "unknown", message, httpStatus: 201 },
      };
    }
    return { success: true, contentVersionId: json.id };
  }

  // ── Error path: parse SF error body (array or object) ────────────────────
  const rawBody = await readBodySnippet(res, 800);
  let sfErrorCode: string | undefined;
  let sfMessage = rawBody;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0] as SfErrorEntry;
      sfErrorCode = first.errorCode;
      if (typeof first.message === "string") sfMessage = first.message;
    } else if (typeof parsed === "object" && parsed !== null) {
      const obj = parsed as SfErrorEntry;
      sfErrorCode = obj.errorCode;
      if (typeof obj.message === "string") sfMessage = obj.message;
    }
  } catch {
    // body wasn't JSON — keep rawBody as sfMessage
  }

  const classified = classifyPhotoUploadError(res.status, sfErrorCode, sfMessage);
  console.error(
    `[salesforce] uploadPhotoToCase: HTTP ${res.status} (${classified.kind}) for case ${caseId}${
      sfErrorCode ? ` errorCode=${sfErrorCode}` : ""
    } — ${sfMessage.slice(0, 200)}`
  );

  return { success: false, error: classified };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2F-2 (Step #1): SOSL lookup SN → Job__c
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escape special characters for SOSL FIND clauses.
 *
 * SOSL reserved characters that need escaping with backslash:
 *   ?  &  |  !  {  }  [  ]  (  )  ^  ~  *  :  \  "  +  -
 *
 * This prevents both syntax errors (e.g. unmatched braces) and
 * injection-style misbehavior from user-supplied SN strings.
 */
function escapeSosl(str: string): string {
  return str.replace(/[\\?&|!{}\[\]()^~*:"+\-]/g, "\\$&");
}

/**
 * Result of findJobBySN(): matched Job__c record, or null if
 * unmatched / lookup failed.
 */
export interface JobLookupResult {
  id: string; // Job__c Salesforce Record Id (a00...)
  name: string; // Job__c.Name auto-number (e.g., "JOB-27763")
}

interface SfSoslSearchResponse {
  searchRecords?: Array<{ Id: string; Name: string }>;
}

/**
 * Look up Job__c (a.k.a. Installation) record by inverter/battery
 * serial number using SOSL Search API.
 *
 * Why SOSL not SOQL:
 *   Job__c.Inverter_Battery_Serials__c is Long Text Area (32k),
 *   which CANNOT be used in any SOQL WHERE clause. SOSL Search
 *   API is the platform's intended mechanism for searching
 *   long-text content.
 *
 * Why this never throws:
 *   This function is called from createCustomerCare() at ticket
 *   submission time. If the SOSL lookup fails for any reason
 *   (network, timeout, permission, SF rejection), we MUST still
 *   let the Customer_Care__c case be created — just with
 *   Job_Number__c left blank (unmatched). Support staff will
 *   reconcile manually.
 *
 * @param sn          The inverter SN (typically from ShinePhone URL)
 * @param accessToken OAuth bearer token (caller's responsibility
 *                    to fetch/cache)
 * @param instanceUrl SF instance base URL (e.g.,
 *                    https://sunterra--dev.sandbox.my.salesforce.com)
 * @returns           { id, name } if exactly 1 match,
 *                    { id, name } of first if multiple matches
 *                      (+ console.warn),
 *                    null if 0 matches, network error, timeout,
 *                      or any other failure
 */
export async function findJobBySN(
  sn: string,
  accessToken: string,
  instanceUrl: string
): Promise<JobLookupResult | null> {
  const trimmedSn = sn?.trim();
  if (!trimmedSn) {
    return null;
  }

  const escapedSn = escapeSosl(trimmedSn);
  const soslQuery = `FIND {${escapedSn}} IN ALL FIELDS RETURNING Job__c(Id, Name) LIMIT 5`;
  const baseUrl = instanceUrl.replace(/\/$/, "");
  const url = `${baseUrl}/services/data/${env.SALESFORCE_API_VERSION}/search/?q=${encodeURIComponent(
    soslQuery
  )}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? "timeout (4s)"
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(
      `[findJobBySN] sn="${trimmedSn}" network failure: ${reason}`
    );
    return null;
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const snippet = await readBodySnippet(res);
    console.error(
      `[findJobBySN] sn="${trimmedSn}" HTTP ${res.status}: ${snippet}`
    );
    return null;
  }

  let data: SfSoslSearchResponse;
  try {
    data = (await res.json()) as SfSoslSearchResponse;
  } catch (err) {
    console.error(
      `[findJobBySN] sn="${trimmedSn}" failed to parse JSON response:`,
      err
    );
    return null;
  }

  const records = data.searchRecords ?? [];

  if (records.length === 0) {
    return null;
  }

  if (records.length > 1) {
    console.warn(
      `[findJobBySN] sn="${trimmedSn}" matched ${records.length} ` +
        `Job__c records; SN should be globally unique. Using first match.`
    );
  }

  const first = records[0];
  return { id: first.Id, name: first.Name };
}
