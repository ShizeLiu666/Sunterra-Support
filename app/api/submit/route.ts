import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/token";
import {
  createCustomerCare,
  uploadPhotoToCase,
  type CreateCustomerCareInput,
} from "@/lib/salesforce";

/**
 * POST /api/submit
 *
 * Accepts a JSON body of the form { token, form, photos? }, re-verifies the
 * URL token server-side (defense in depth — clients could bypass page.tsx and
 * POST directly), maps form values to SF picklist values, creates a
 * Customer_Care__c record via lib/salesforce, then (Phase 2G-3) uploads any
 * attached photos serially via uploadPhotoToCase.
 *
 * Job_Number__c is never set from the web layer; Sunterra's downstream SF
 * Flow reconciles SN → Job__c.
 *
 * Request body:
 *   {
 *     token:  { sn, timestamp, sign, name?, email?, address?, ... },
 *     form:   { type, subject, description, customerName?, email?, ... },
 *     photos?: [{ filename: string, mimeType: "image/...", base64: string }]
 *   }
 *   - photos is optional; max 5 entries; each base64 is raw (no data-URL prefix).
 *
 * Response shapes:
 *   200 { success: true, caseNumber, matched, photoWarning? }
 *     - caseNumber is the customer-facing Auto Number Name (e.g. "Case-14060");
 *       if the post-create Name lookup failed it falls back to the 18-char
 *       Record ID so the client always has *some* reference to display.
 *     - photoWarning is the count of photos that failed to upload; the field
 *       is OMITTED when zero (so the client URL stays clean on the happy path).
 *     - The Case is NEVER rolled back when photo uploads fail; the customer's
 *       ticket is more important than the attachments.
 *   400 { success: false, error: "invalid request body" }
 *   400 { success: false, error: "Invalid photos payload" }
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

interface PhotoInput {
  filename: string;
  mimeType: string;
  base64: string;
}

interface SubmitRequestBody {
  token: SubmitTokenPayload;
  form: SubmitFormPayload;
  photos?: PhotoInput[];
}

const MAX_PHOTOS = 5;

const TYPE_MAP: Record<string, string> = {
  battery_issue:        "Battery issue",
  inverter_issue:       "Inverter Issue",
  app_monitoring:       "WiFi Issue",
  system_performance:   "High bill",
  installation_quality: "Installation Quality Control",
  other:                "General Inquiries",
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

/**
 * Validates the optional `photos` field on the request body. Returns:
 *   - { ok: true, photos: [] }      when the field is absent (no photos)
 *   - { ok: true, photos: [...] }   when the field is a valid array
 *   - { ok: false }                 when the field is present but malformed
 */
function validatePhotos(
  raw: unknown
): { ok: true; photos: PhotoInput[] } | { ok: false } {
  if (typeof raw !== "object" || raw === null) {
    // Caller already verified the outer body; this guard is defensive.
    return { ok: false };
  }
  const obj = raw as Record<string, unknown>;
  if (!("photos" in obj) || obj.photos === undefined) {
    return { ok: true, photos: [] };
  }
  const rawPhotos = obj.photos;
  if (!Array.isArray(rawPhotos)) return { ok: false };
  if (rawPhotos.length > MAX_PHOTOS) return { ok: false };

  const photos: PhotoInput[] = [];
  for (const item of rawPhotos) {
    if (typeof item !== "object" || item === null) return { ok: false };
    const p = item as Record<string, unknown>;
    if (!isString(p.filename) || p.filename.length === 0) return { ok: false };
    if (!isString(p.mimeType) || !p.mimeType.startsWith("image/")) {
      return { ok: false };
    }
    if (!isString(p.base64) || p.base64.length === 0) return { ok: false };
    photos.push({
      filename: p.filename,
      mimeType: p.mimeType,
      base64: p.base64,
    });
  }
  return { ok: true, photos };
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

  const photosResult = validatePhotos(raw);
  if (!photosResult.ok) {
    return NextResponse.json(
      { success: false, error: "Invalid photos payload" },
      { status: 400 }
    );
  }
  body.photos = photosResult.photos;

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

    let photoFailures = 0;
    const photos = body.photos ?? [];
    if (photos.length > 0) {
      console.log(
        `[/api/submit] uploading ${photos.length} photos to case ${result.id}`
      );
      // Serial on purpose: Salesforce dislikes parallel ContentVersion writes
      // from the same session, and 5 sequential calls is fast enough.
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const uploadResult = await uploadPhotoToCase({
          caseId: result.id,
          title: `${result.name ?? "case"}-photo-${i + 1}`,
          filename: photo.filename,
          base64Data: photo.base64,
          mimeType: photo.mimeType,
        });
        if (!uploadResult.success) {
          photoFailures++;
          console.error(
            `[/api/submit] photo ${i + 1}/${photos.length} failed:`,
            uploadResult.error.kind,
            `httpStatus=${uploadResult.error.httpStatus ?? "n/a"}`,
            uploadResult.error.message.slice(0, 200)
          );
        }
      }
      console.log(
        `[/api/submit] photo upload done: ${photos.length - photoFailures}/${photos.length} succeeded`
      );
    }

    // The Case is never rolled back even if every photo failed — the customer's
    // ticket is more important than the attachments. /success renders the
    // warning banner so the user knows to email the missing photos.
    const responseBody: {
      success: true;
      caseNumber: string;
      matched: boolean;
      photoWarning?: number;
    } = {
      success: true,
      caseNumber,
      matched: result.matched,
    };
    if (photoFailures > 0) responseBody.photoWarning = photoFailures;
    return NextResponse.json(responseBody);
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
