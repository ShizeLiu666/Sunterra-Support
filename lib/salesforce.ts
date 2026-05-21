/**
 * Salesforce REST API client for the Sunterra support ticket flow.
 *
 * Object model recap:
 *   - Customer_Care__c  → the "Case"/ticket record we create
 *   - Job__c            → the "Installation" record (API name is Job__c;
 *                         label is "Installation"). We do NOT query Job__c
 *                         from the web layer — Sunterra's Salesforce admin
 *                         owns the SN → Job association via SF Flow.
 *
 * The web layer's responsibility is intentionally minimal:
 *   - Build a Customer_Care__c record from the form payload
 *   - Stash the inverter SN in Inverter_Battery_Serials__c (plain text)
 *   - Leave Job_Number__c empty; downstream Flow will reconcile if it can
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
  sn: string; // → Inverter_Battery_Serials__c (stored as plain text)

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
 *   - matched — true iff an installationId was supplied (the SN already
 *               resolved to a Job__c upstream).
 *
 * Fields with undefined/null values are omitted from the POST body so SF's
 * defaults stay in effect. Specifically: Status__c and Priority__c are
 * never sent — they rely on SF defaults.
 */
export async function createCustomerCare(
  input: CreateCustomerCareInput
): Promise<{ id: string; name: string | null; matched: boolean }> {
  const token = await getAccessToken();

  const body: Record<string, string> = {
    Subject__c: input.subject,
    Description__c: input.description,
    Type__c: input.type,
    Inverter_Battery_Serials__c: input.sn,
    Case_Origin__c: input.caseOrigin ?? "Web",
  };

  if (input.installationId) {
    body.Job_Number__c = input.installationId;
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

  return {
    id,
    name,
    matched: !!input.installationId,
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
