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
