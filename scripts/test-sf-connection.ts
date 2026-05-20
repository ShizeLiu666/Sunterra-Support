/**
 * One-off Salesforce connectivity test.
 *
 * Purpose: prove the Client Credentials Flow works end-to-end against the
 * configured Connected App BEFORE writing any business code in
 * lib/salesforce.ts.
 *
 * Four requests:
 *   A) POST /services/oauth2/token   (grant_type=client_credentials)
 *   B) GET  /services/data/{API_VERSION}/sobjects/Customer_Care__c/describe
 *   C) GET  /services/data/{API_VERSION}/sobjects/Job__c/describe   (label: "Installation")
 *   D) GET  /services/data/{API_VERSION}/sobjects/   (list all sobjects)
 *
 * Run: npx tsx scripts/test-sf-connection.ts
 *
 * Safety:
 *   - access_token is masked (first 10 chars only) in any log output.
 *   - client_secret is never printed.
 *
 * Behavior:
 *   - If Request A fails, the script exits 1 immediately (B/C/D need a token).
 *   - If Request B/C/D fail individually, the script continues so each call
 *     can be diagnosed independently (e.g. Permission Set issues per object).
 *   - Final exit code is 1 if any of A/B/C/D failed, else 0.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface EnvMap {
  [key: string]: string;
}

function parseDotEnv(filePath: string): EnvMap {
  const raw = readFileSync(filePath, "utf8");
  const out: EnvMap = {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    // Strip surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function maskToken(token: string): string {
  if (!token) return "(empty)";
  if (token.length <= 10) return token;
  return token.slice(0, 10) + "...";
}

function maskOAuthResponse(json: Record<string, unknown>): Record<string, unknown> {
  const cloned: Record<string, unknown> = { ...json };
  if (typeof cloned.access_token === "string") {
    cloned.access_token = maskToken(cloned.access_token);
  }
  if (typeof cloned.id_token === "string") {
    cloned.id_token = maskToken(cloned.id_token);
  }
  if (typeof cloned.refresh_token === "string") {
    cloned.refresh_token = maskToken(cloned.refresh_token);
  }
  return cloned;
}

/**
 * Extract { orgId, userId } from the `id` URL returned by OAuth.
 * Format: https://{login.salesforce.com|test.salesforce.com}/id/<OrgID>/<UserID>
 */
function extractIdComponents(idUrl: string | undefined): {
  orgId: string | null;
  userId: string | null;
} {
  if (!idUrl || typeof idUrl !== "string") return { orgId: null, userId: null };
  try {
    const u = new URL(idUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    // Expected: ['id', '<OrgID>', '<UserID>']
    const idIdx = parts.indexOf("id");
    if (idIdx === -1 || parts.length < idIdx + 3) {
      return { orgId: null, userId: null };
    }
    return {
      orgId: parts[idIdx + 1] ?? null,
      userId: parts[idIdx + 2] ?? null,
    };
  } catch {
    return { orgId: null, userId: null };
  }
}

async function readBodySafely(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch (err) {
    return `(failed to read body: ${(err as Error).message})`;
  }
}

interface SfFieldDescribe {
  name: string;
  label: string;
  custom: boolean;
  type?: string;
  length?: number;
  unique?: boolean;
  externalId?: boolean;
  referenceTo?: string[];
  relationshipName?: string | null;
}

interface SfObjectDescribe {
  fields: SfFieldDescribe[];
}

interface DescribeOutcome {
  ok: boolean;
  status: number;
  customFields: SfFieldDescribe[];
  totalFields: number;
  allFields: SfFieldDescribe[];
  errorBody?: string;
}

interface SfSObjectListItem {
  name: string;
  label: string;
  labelPlural?: string;
  custom: boolean;
  keyPrefix?: string | null;
}

interface SfSObjectListResponse {
  sobjects: SfSObjectListItem[];
}

interface ListSObjectsOutcome {
  ok: boolean;
  status: number;
  customObjects: SfSObjectListItem[];
  totalObjects: number;
  errorBody?: string;
}

async function describeObject(
  sfInstanceUrl: string,
  apiVersion: string,
  objectName: string,
  accessToken: string,
  label: string,
  detailed: boolean = false
): Promise<DescribeOutcome> {
  const url = `${sfInstanceUrl.replace(/\/$/, "")}/services/data/${apiVersion}/sobjects/${objectName}/describe`;
  console.log(`\n[${label}] GET ${url}`);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    console.error(`[${label}] network error: ${(err as Error).message}`);
    return { ok: false, status: 0, customFields: [], totalFields: 0 };
  }

  console.log(`[${label}] Status: ${res.status} ${res.statusText}`);
  const rawBody = await readBodySafely(res);

  if (!res.ok) {
    console.error(`[${label}] FAILED. Raw response body:`);
    console.error(rawBody);
    return {
      ok: false,
      status: res.status,
      customFields: [],
      totalFields: 0,
      errorBody: rawBody,
    };
  }

  let parsed: SfObjectDescribe;
  try {
    parsed = JSON.parse(rawBody) as SfObjectDescribe;
  } catch (err) {
    console.error(
      `[${label}] failed to parse JSON: ${(err as Error).message}. Raw body:`
    );
    console.error(rawBody);
    return { ok: false, status: res.status, customFields: [], totalFields: 0 };
  }

  const allFields = Array.isArray(parsed.fields) ? parsed.fields : [];
  const customFields = allFields.filter(
    (f) => f && typeof f.name === "string" && f.name.endsWith("__c")
  );

  console.log(
    `[${label}] Total fields on ${objectName}: ${allFields.length} | custom (__c): ${customFields.length}`
  );

  if (customFields.length === 0) {
    console.log(`[${label}] No custom fields found on ${objectName}.`);
  } else if (detailed) {
    console.log(
      `[${label}] Custom fields (__c) on ${objectName} (detailed, sorted by name):`
    );
    const sortedDetail = [...customFields].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const f of sortedDetail) {
      const type = f.type ?? "(unknown)";
      const lengthStr = typeof f.length === "number" ? String(f.length) : "-";
      const uniqueStr = f.unique === true ? "true" : "false";
      const extIdStr = f.externalId === true ? "true" : "false";
      console.log(
        `  - ${f.name} | label: ${f.label} | type: ${type} | length: ${lengthStr} | unique: ${uniqueStr} | externalId: ${extIdStr}`
      );
    }
  } else {
    console.log(`[${label}] Custom fields (__c) on ${objectName}:`);
    for (const f of customFields) {
      console.log(`  - name: ${f.name}, label: ${f.label}`);
    }
  }

  return {
    ok: true,
    status: res.status,
    customFields,
    totalFields: allFields.length,
    allFields,
  };
}

async function listSObjects(
  sfInstanceUrl: string,
  apiVersion: string,
  accessToken: string,
  label: string
): Promise<ListSObjectsOutcome> {
  const url = `${sfInstanceUrl.replace(/\/$/, "")}/services/data/${apiVersion}/sobjects/`;
  console.log(`\n[${label}] GET ${url}`);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    console.error(`[${label}] network error: ${(err as Error).message}`);
    return { ok: false, status: 0, customObjects: [], totalObjects: 0 };
  }

  console.log(`[${label}] Status: ${res.status} ${res.statusText}`);
  const rawBody = await readBodySafely(res);

  if (!res.ok) {
    console.error(`[${label}] FAILED. Raw response body:`);
    console.error(rawBody);
    return {
      ok: false,
      status: res.status,
      customObjects: [],
      totalObjects: 0,
      errorBody: rawBody,
    };
  }

  let parsed: SfSObjectListResponse;
  try {
    parsed = JSON.parse(rawBody) as SfSObjectListResponse;
  } catch (err) {
    console.error(
      `[${label}] failed to parse JSON: ${(err as Error).message}. Raw body:`
    );
    console.error(rawBody);
    return { ok: false, status: res.status, customObjects: [], totalObjects: 0 };
  }

  const sobjects = Array.isArray(parsed.sobjects) ? parsed.sobjects : [];
  const customObjects = sobjects
    .filter((o) => o && o.custom === true)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ok: true,
    status: res.status,
    customObjects,
    totalObjects: sobjects.length,
  };
}

const SN_LIKE_KEYWORDS = [
  "serial",
  "sn",
  "inverter",
  "panel",
  "battery",
  "module",
  "device",
  "equipment",
  "unit",
  "asset",
];

/**
 * Heuristic: flag fields whose name OR label contains any of the SN_LIKE_KEYWORDS.
 * These are candidates for the canonical SN-style field we will use to match
 * an installation record. Returns each field paired with the keywords that hit.
 */
function flagSnLikeFields(
  fields: SfFieldDescribe[]
): Array<{ field: SfFieldDescribe; matched: string[] }> {
  const out: Array<{ field: SfFieldDescribe; matched: string[] }> = [];
  for (const f of fields) {
    const name = (f.name || "").toLowerCase();
    const label = (f.label || "").toLowerCase();
    const nameTokens = name.split(/[^a-z0-9]+/).filter(Boolean);
    const labelTokens = label.split(/[^a-z0-9]+/).filter(Boolean);
    const matched: string[] = [];
    for (const kw of SN_LIKE_KEYWORDS) {
      const hit =
        nameTokens.includes(kw) ||
        labelTokens.includes(kw) ||
        // Allow embedded matches for longer keywords; for the 2-char "sn"
        // require a token boundary to avoid e.g. "snapshot".
        (kw.length > 2 && (name.includes(kw) || label.includes(kw)));
      if (hit) matched.push(kw);
    }
    if (matched.length > 0) {
      out.push({ field: f, matched });
    }
  }
  return out;
}

async function main(): Promise<void> {
  const envPath = resolve(process.cwd(), ".env.local");
  console.log(`[setup] loading env from: ${envPath}`);
  const env = parseDotEnv(envPath);

  const instanceUrl = env.SALESFORCE_INSTANCE_URL;
  const clientId = env.SALESFORCE_CLIENT_ID;
  const clientSecret = env.SALESFORCE_CLIENT_SECRET;
  const apiVersion = env.SALESFORCE_API_VERSION || "v62.0";

  if (!instanceUrl || !clientId || !clientSecret) {
    console.error("[fatal] missing required env vars:", {
      SALESFORCE_INSTANCE_URL: !!instanceUrl,
      SALESFORCE_CLIENT_ID: !!clientId,
      SALESFORCE_CLIENT_SECRET: !!clientSecret,
    });
    process.exit(1);
  }

  console.log(`[setup] SALESFORCE_INSTANCE_URL = ${instanceUrl}`);
  console.log(`[setup] SALESFORCE_CLIENT_ID length = ${clientId.length}`);
  console.log(`[setup] SALESFORCE_CLIENT_SECRET length = ${clientSecret.length}`);
  console.log(
    `[setup] SALESFORCE_API_VERSION = ${apiVersion}${env.SALESFORCE_API_VERSION ? "" : " (default — env var not set)"}`
  );

  // ─────────────────────────────────────────────
  // Request A: OAuth token via Client Credentials Flow
  // ─────────────────────────────────────────────
  const tokenUrl = `${instanceUrl.replace(/\/$/, "")}/services/oauth2/token`;
  console.log(`\n[Request A] POST ${tokenUrl}`);

  const tokenBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  let tokenRes: Response;
  try {
    tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: tokenBody.toString(),
    });
  } catch (err) {
    console.error(`[Request A] network error: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`[Request A] Status: ${tokenRes.status} ${tokenRes.statusText}`);
  const tokenRawBody = await readBodySafely(tokenRes);

  let tokenJson: Record<string, unknown> | null = null;
  try {
    tokenJson = JSON.parse(tokenRawBody) as Record<string, unknown>;
  } catch {
    tokenJson = null;
  }

  if (!tokenRes.ok) {
    console.error("[Request A] FAILED. Raw response body:");
    console.error(tokenRawBody);
    process.exit(1);
  }

  if (!tokenJson || typeof tokenJson.access_token !== "string") {
    console.error("[Request A] Unexpected response shape. Raw body:");
    console.error(tokenRawBody);
    process.exit(1);
  }

  console.log("[Request A] Response (masked):");
  console.log(JSON.stringify(maskOAuthResponse(tokenJson), null, 2));

  const idUrl =
    typeof tokenJson.id === "string" ? (tokenJson.id as string) : undefined;
  const { orgId, userId } = extractIdComponents(idUrl);
  console.log(`[Request A] id URL: ${idUrl ?? "(missing)"}`);
  console.log(`[Request A] Org ID: ${orgId ?? "(could not parse)"}`);
  console.log(`[Request A] Run-As User ID: ${userId ?? "(could not parse)"}`);

  const accessToken = tokenJson.access_token as string;
  const sfInstanceUrl =
    typeof tokenJson.instance_url === "string"
      ? (tokenJson.instance_url as string)
      : instanceUrl;

  // ─────────────────────────────────────────────
  // Request B: describe Customer_Care__c
  // (B failure must NOT block Request C or D)
  // ─────────────────────────────────────────────
  const bResult = await describeObject(
    sfInstanceUrl,
    apiVersion,
    "Customer_Care__c",
    accessToken,
    "Request B"
  );

  // ─────────────────────────────────────────────
  // Request C: describe Job__c (label is "Installation"; API name is Job__c)
  // ─────────────────────────────────────────────
  const cResult = await describeObject(
    sfInstanceUrl,
    apiVersion,
    "Job__c",
    accessToken,
    "Request C",
    true
  );

  if (cResult.ok) {
    // 🔑 unique=true or externalId=true → strong primary-key candidates
    const keyFields = cResult.customFields.filter(
      (f) => f.unique === true || f.externalId === true
    );
    if (keyFields.length === 0) {
      console.log(
        "\n[Request C] 🔑 No custom fields are marked unique=true or externalId=true."
      );
    } else {
      console.log(
        "\n[Request C] 🔑 Custom fields with unique=true or externalId=true (strong SOQL-lookup-key candidates):"
      );
      for (const f of keyFields) {
        const lengthStr =
          typeof f.length === "number" ? String(f.length) : "-";
        console.log(
          `  - 🔑 ${f.name} | label: ${f.label} | type: ${f.type ?? "(unknown)"} | length: ${lengthStr} | unique: ${f.unique === true} | externalId: ${f.externalId === true}`
        );
      }
    }

    // ⭐ SN heuristic hits (expanded keyword set)
    const snLike = flagSnLikeFields(cResult.customFields);
    if (snLike.length === 0) {
      console.log(
        `\n[Request C] ⭐ No SN-like fields detected (no field name/label containing any of: ${SN_LIKE_KEYWORDS.join(", ")}).`
      );
    } else {
      console.log(
        `\n[Request C] ⭐ SN-like candidates (name/label matched any of: ${SN_LIKE_KEYWORDS.join(", ")}):`
      );
      for (const { field, matched } of snLike) {
        const lengthStr =
          typeof field.length === "number" ? String(field.length) : "-";
        const uniqueStr = field.unique === true ? "true" : "false";
        const extIdStr = field.externalId === true ? "true" : "false";
        console.log(
          `  - ⭐ ${field.name} | label: ${field.label} | type: ${field.type ?? "(unknown)"} | length: ${lengthStr} | unique: ${uniqueStr} | externalId: ${extIdStr} | matched: ${matched.join(", ")}`
        );
      }
    }
  }

  // ─────────────────────────────────────────────
  // Request D: list all sobjects (find what custom objects exist)
  // ─────────────────────────────────────────────
  const dResult = await listSObjects(
    sfInstanceUrl,
    apiVersion,
    accessToken,
    "Request D"
  );

  if (dResult.ok) {
    console.log(
      `[Request D] Total sobjects: ${dResult.totalObjects} | custom: ${dResult.customObjects.length}`
    );

    if (dResult.customObjects.length === 0) {
      console.log("[Request D] No custom objects found.");
    } else {
      console.log("[Request D] Custom objects (sorted by name):");
      for (const o of dResult.customObjects) {
        const kp = o.keyPrefix ?? "(none)";
        console.log(`  - ${o.name} (label: ${o.label}, keyPrefix: ${kp})`);
      }

      // Keyword hits: install / job / site / asset (case-insensitive,
      // substring match on name OR label). "installation" is covered by "install".
      const keywords = ["install", "job", "site", "asset"];
      const hits: { obj: SfSObjectListItem; matched: string[] }[] = [];
      for (const o of dResult.customObjects) {
        const name = (o.name || "").toLowerCase();
        const label = (o.label || "").toLowerCase();
        const matched = keywords.filter(
          (kw) => name.includes(kw) || label.includes(kw)
        );
        if (matched.length > 0) {
          hits.push({ obj: o, matched });
        }
      }

      if (hits.length === 0) {
        console.log(
          "\n[Request D] ⭐ No keyword hits for install/job/site/asset."
        );
      } else {
        console.log(
          "\n[Request D] ⭐ Keyword hits (install/job/site/asset/installation):"
        );
        for (const { obj, matched } of hits) {
          console.log(
            `  - ⭐ ${obj.name} (label: ${obj.label}, keyPrefix: ${obj.keyPrefix ?? "(none)"}) — matched: ${matched.join(", ")}`
          );
        }
      }
    }
  }

  // ─────────────────────────────────────────────
  // Job_Number__c metadata extraction (from Request B)
  // ─────────────────────────────────────────────
  console.log("\n[Job_Number__c metadata] (from Request B / Customer_Care__c describe)");
  if (!bResult.ok) {
    console.log(
      "  Skipped — Request B failed, so the describe payload is unavailable."
    );
  } else {
    const jobNumberField = bResult.allFields.find(
      (f) => f && f.name === "Job_Number__c"
    );
    if (!jobNumberField) {
      console.log("  Field 'Job_Number__c' not found in Customer_Care__c describe payload.");
    } else {
      const refTo = Array.isArray(jobNumberField.referenceTo)
        ? jobNumberField.referenceTo
        : [];
      console.log(`  type:             ${jobNumberField.type ?? "(missing)"}`);
      console.log(
        `  referenceTo:      ${refTo.length > 0 ? "[" + refTo.join(", ") + "]" : "(none / not a reference)"}`
      );
      console.log(
        `  relationshipName: ${jobNumberField.relationshipName ?? "(none)"}`
      );
    }
  }

  // ─────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────
  console.log("\n[summary]");
  console.log(`  Request A (OAuth):              ${tokenRes.ok ? "OK" : "FAIL"} (${tokenRes.status})`);
  console.log(`  Request B (Customer_Care__c):   ${bResult.ok ? "OK" : "FAIL"} (${bResult.status})`);
  console.log(`  Request C (Installation__c):    ${cResult.ok ? "OK" : "FAIL"} (${cResult.status})`);
  console.log(`  Request D (list sobjects):      ${dResult.ok ? "OK" : "FAIL"} (${dResult.status})`);

  const anyFailure = !bResult.ok || !cResult.ok || !dResult.ok;
  if (anyFailure) {
    console.log("\n[done] One or more calls failed. See logs above.");
    process.exit(1);
  }
  console.log("\n[done] Salesforce connectivity test completed successfully.");
}

main().catch((err) => {
  console.error(`[fatal] unhandled error: ${(err as Error).message}`);
  console.error(err);
  process.exit(1);
});
