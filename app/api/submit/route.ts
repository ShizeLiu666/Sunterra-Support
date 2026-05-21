import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/token";
import {
  createCustomerCare,
  type CreateCustomerCareInput,
} from "@/lib/salesforce";

/**
 * POST /api/submit
 *
 * Accepts a JSON body of the form { token, form }, re-verifies the URL token
 * server-side (defense in depth — clients could bypass page.tsx and POST
 * directly), maps form values to SF picklist values, and creates a
 * Customer_Care__c record via lib/salesforce.
 *
 * Job_Number__c is never set from the web layer; Sunterra's downstream SF
 * Flow reconciles SN → Job__c.
 *
 * Response shapes:
 *   200 { success: true, caseNumber, matched }
 *     - caseNumber is the customer-facing Auto Number Name (e.g. "Case-14060");
 *       if the post-create Name lookup failed it falls back to the 18-char
 *       Record ID so the client always has *some* reference to display.
 *   400 { success: false, error: "invalid request body" }
 *   401 { success: false, error: "invalid token" }
 *   500 { success: false, error: <message> }
 */

interface SubmitTokenPayload {
  sn: string;
  timestamp: string;
  sign: string;
  name?: string;
  email?: string;
  address?: string;
  inverterModel?: string;
  language?: string;
}

interface SubmitFormPayload {
  type: string;
  subject: string;
  description: string;
  customerName?: string;
  email?: string;
  mobile?: string;
  installationStreet?: string;
  installationSuburb?: string;
  installationState?: string;
  installationPostcode?: string;
}

interface SubmitRequestBody {
  token: SubmitTokenPayload;
  form: SubmitFormPayload;
}

const TYPE_MAP: Record<string, string> = {
  system_not_working: "Growatt inverter Issue",
  warning_or_error: "Inverter Issue",
  cannot_see_data: "WiFi Issue",
  low_output: "Growatt inverter Issue",
  battery_issue: "Growatt Battery issue",
  other: "General Inquiries",
};
const DEFAULT_SF_TYPE = "General Inquiries";

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isOptionalString(v: unknown): v is string | undefined {
  return v === undefined || typeof v === "string";
}

function validateBody(raw: unknown): SubmitRequestBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const t = obj.token;
  const f = obj.form;
  if (typeof t !== "object" || t === null) return null;
  if (typeof f !== "object" || f === null) return null;

  const tk = t as Record<string, unknown>;
  const fm = f as Record<string, unknown>;

  if (!isString(tk.sn) || !isString(tk.timestamp) || !isString(tk.sign)) {
    return null;
  }
  if (
    !isOptionalString(tk.name) ||
    !isOptionalString(tk.email) ||
    !isOptionalString(tk.address) ||
    !isOptionalString(tk.inverterModel) ||
    !isOptionalString(tk.language)
  ) {
    return null;
  }

  if (
    !isString(fm.type) ||
    !isString(fm.subject) ||
    !isString(fm.description)
  ) {
    return null;
  }
  if (
    !isOptionalString(fm.customerName) ||
    !isOptionalString(fm.email) ||
    !isOptionalString(fm.mobile) ||
    !isOptionalString(fm.installationStreet) ||
    !isOptionalString(fm.installationSuburb) ||
    !isOptionalString(fm.installationState) ||
    !isOptionalString(fm.installationPostcode)
  ) {
    return null;
  }

  const token: SubmitTokenPayload = {
    sn: tk.sn,
    timestamp: tk.timestamp,
    sign: tk.sign,
  };
  if (tk.name !== undefined) token.name = tk.name;
  if (tk.email !== undefined) token.email = tk.email;
  if (tk.address !== undefined) token.address = tk.address;
  if (tk.inverterModel !== undefined) token.inverterModel = tk.inverterModel;
  if (tk.language !== undefined) token.language = tk.language;

  const form: SubmitFormPayload = {
    type: fm.type,
    subject: fm.subject,
    description: fm.description,
  };
  if (fm.customerName !== undefined) form.customerName = fm.customerName;
  if (fm.email !== undefined) form.email = fm.email;
  if (fm.mobile !== undefined) form.mobile = fm.mobile;
  if (fm.installationStreet !== undefined) form.installationStreet = fm.installationStreet;
  if (fm.installationSuburb !== undefined) form.installationSuburb = fm.installationSuburb;
  if (fm.installationState !== undefined) form.installationState = fm.installationState;
  if (fm.installationPostcode !== undefined) form.installationPostcode = fm.installationPostcode;

  return { token, form };
}

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid request body" },
      { status: 400 }
    );
  }

  const body = validateBody(raw);
  if (!body) {
    return NextResponse.json(
      { success: false, error: "invalid request body" },
      { status: 400 }
    );
  }

  const urlParams = new URLSearchParams();
  urlParams.set("sn", body.token.sn);
  urlParams.set("timestamp", body.token.timestamp);
  urlParams.set("sign", body.token.sign);
  if (body.token.name) urlParams.set("name", body.token.name);
  if (body.token.email) urlParams.set("email", body.token.email);
  if (body.token.address) urlParams.set("address", body.token.address);
  if (body.token.inverterModel) urlParams.set("inverterModel", body.token.inverterModel);
  if (body.token.language) urlParams.set("language", body.token.language);

  const tokenResult = verifyToken(urlParams);
  if (!tokenResult.valid) {
    console.log(
      `[/api/submit] case_failed: reason=token_${tokenResult.reason ?? "unknown"} sn=${body.token.sn}`
    );
    return NextResponse.json(
      { success: false, error: "invalid token" },
      { status: 401 }
    );
  }

  const sfType = TYPE_MAP[body.form.type] ?? DEFAULT_SF_TYPE;

  const customerName = body.form.customerName ?? body.token.name;
  const email = body.form.email ?? body.token.email;
  const mobile = body.form.mobile;

  const formHasAddress = !!(
    body.form.installationStreet ||
    body.form.installationSuburb ||
    body.form.installationState ||
    body.form.installationPostcode
  );

  let installationStreet: string | undefined;
  let installationSuburb: string | undefined;
  let installationState: string | undefined;
  let installationPostcode: string | undefined;
  if (formHasAddress) {
    installationStreet = body.form.installationStreet || undefined;
    installationSuburb = body.form.installationSuburb || undefined;
    installationState = body.form.installationState || undefined;
    installationPostcode = body.form.installationPostcode || undefined;
  } else if (body.token.address) {
    installationStreet = body.token.address;
  }

  const sfInput: CreateCustomerCareInput = {
    subject: body.form.subject,
    description: body.form.description,
    type: sfType,
    sn: body.token.sn,
  };
  if (customerName) sfInput.customerName = customerName;
  if (email) sfInput.email = email;
  if (mobile) sfInput.mobile = mobile;
  if (installationStreet) sfInput.installationStreet = installationStreet;
  if (installationSuburb) sfInput.installationSuburb = installationSuburb;
  if (installationState) sfInput.installationState = installationState;
  if (installationPostcode) sfInput.installationPostcode = installationPostcode;

  try {
    const result = await createCustomerCare(sfInput);
    const caseNumber = result.name ?? result.id;
    console.log(
      `[/api/submit] case_created: id=${result.id} name=${result.name ?? "(unavailable)"} sn=${body.token.sn} type=${sfType} matched=${result.matched}`
    );
    return NextResponse.json({
      success: true,
      caseNumber,
      matched: result.matched,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(
      `[/api/submit] case_failed: reason=${message.slice(0, 160)} sn=${body.token.sn}`
    );
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
