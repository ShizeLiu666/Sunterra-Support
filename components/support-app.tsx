"use client";

import { useState } from "react";
import { BrandHeader } from "@/components/brand-header";
import InstallationInfo from "@/components/installation-info";
import { TicketForm } from "@/components/ticket-form";
import type { InstallationData, UrlParams } from "@/types/installation";
import {
  validateAuMobile,
  validateEmail,
  validateRequired,
} from "@/lib/validation";

// Fields that participate in client-side validation. The string keys are used
// for the `touched` map and the error lookups passed down to both children.
type TicketField =
  | "name"
  | "email"
  | "mobile"
  | "address"
  | "state"
  | "problemType"
  | "description";

const FIELD_ORDER: readonly TicketField[] = [
  "name",
  "email",
  "mobile",
  "address",
  "state",
  "problemType",
  "description",
];

interface SupportAppProps {
  initialData: InstallationData;
  isDevFallback?: boolean;
}

/**
 * Read the original URL token (sn + timestamp + sign + optional fields) from
 * window.location so the form submit can forward it for server-side
 * re-verification. The server (app/page.tsx) has already validated it once;
 * this is just a pass-through. Returns null during SSR/initial render before
 * hydration completes.
 */
function readTokenFromUrl(): UrlParams | null {
  if (typeof window === "undefined") return null;
  const sp = new URLSearchParams(window.location.search);
  const sn = sp.get("sn");
  const timestamp = sp.get("timestamp");
  const sign = sp.get("sign");
  if (!sn || !timestamp || !sign) return null;

  // Forward EVERY query param verbatim (including empty `key=` values) so the
  // server can rebuild the exact same canonical string for re-verification.
  // No whitelist: any signed field — deviceType, deviceModel, or anything
  // Growatt adds later — is carried automatically, so it can never be silently
  // dropped and cause invalid_signature on submit.
  const token: UrlParams = { sn, timestamp, sign };
  sp.forEach((value, key) => {
    token[key] = value;
  });
  return token;
}

export default function SupportApp({
  initialData,
  isDevFallback = false,
}: SupportAppProps) {
  const [installationData, setInstallationData] =
    useState<InstallationData>(initialData);
  const [token] = useState<UrlParams | null>(() => readTokenFromUrl());

  // Ticket draft state, lifted out of TicketForm so the confirm view can read
  // the same values. TicketForm is a controlled component for these fields;
  // its submit/compress/redirect logic is unchanged.
  const [problemType, setProblemType] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [photos, setPhotos] = useState<File[]>([]);

  // Same-page view toggle: "form" = edit, "confirm" = read-only review.
  const [view, setView] = useState<"form" | "confirm">("form");

  // Field-level validation feedback. A field's error is only *shown* once the
  // user has interacted with it (touched) or has tried to advance (Review
  // clicked) — this keeps the form from greeting users with a wall of red.
  const [touched, setTouched] = useState<Partial<Record<TicketField, boolean>>>(
    {}
  );
  const [reviewAttempted, setReviewAttempted] = useState(false);

  const markTouched = (field: TicketField) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  };

  // Raw errors regardless of touched state — used to compute whether Review
  // can proceed (canReview) and, after gating, what to display per field.
  const rawErrors: Record<TicketField, string | null> = {
    name: validateRequired(installationData.name, "Name"),
    email: validateEmail(installationData.email),
    mobile: validateAuMobile(installationData.mobile),
    address: validateRequired(installationData.address, "Address"),
    state: validateRequired(installationData.state, "State"),
    problemType: problemType ? null : "Please select a problem type",
    description: description.trim() ? null : "Please describe the issue",
  };
  const canReview = Object.values(rawErrors).every((e) => e === null);
  const firstInvalidField =
    FIELD_ORDER.find((field) => rawErrors[field] !== null) ?? null;

  const visibleError = (field: TicketField): string | null =>
    touched[field] || reviewAttempted ? rawErrors[field] : null;
  const isValid = (field: TicketField): boolean => rawErrors[field] === null;

  // Called by TicketForm when the user taps Review. Reveals every field's
  // error (so untouched-but-invalid fields surface) and lets the form decide
  // whether to advance based on canReview.
  const handleReviewAttempt = () => setReviewAttempted(true);

  return (
    <main className="min-h-screen bg-white md:p-8 md:bg-gradient-to-br md:from-sunterra-light/30 md:to-white">
      <div className="w-full bg-white p-6 space-y-6 md:max-w-[480px] md:mx-auto md:rounded-2xl md:p-8 md:shadow-xl">
        <BrandHeader />

        {process.env.NODE_ENV === "development" && (
          <div className="text-xs text-gray-400 text-center mt-2 md:mb-4">
            <a
              href="/dev/test-link"
              className="underline hover:text-gray-600"
            >
              🛠 Dev: Generate test link
            </a>
            {isDevFallback && (
              <span className="ml-2 text-yellow-600">
                (showing fallback mock data — no URL params)
              </span>
            )}
          </div>
        )}

        {view === "form" && (
          <InstallationInfo
            data={installationData}
            onChange={setInstallationData}
            errors={{
              name: visibleError("name"),
              email: visibleError("email"),
              mobile: visibleError("mobile"),
              address: visibleError("address"),
              state: visibleError("state"),
            }}
            valid={{
              name: isValid("name"),
              email: isValid("email"),
              mobile: isValid("mobile"),
              address: isValid("address"),
              state: isValid("state"),
            }}
            onFieldTouched={markTouched}
          />
        )}
        <TicketForm
          installationData={installationData}
          token={token}
          problemType={problemType}
          setProblemType={setProblemType}
          description={description}
          setDescription={setDescription}
          photos={photos}
          setPhotos={setPhotos}
          view={view}
          setView={setView}
          problemTypeError={visibleError("problemType")}
          descriptionError={visibleError("description")}
          problemTypeValid={isValid("problemType")}
          descriptionValid={isValid("description")}
          firstInvalidField={firstInvalidField}
          onFieldTouched={markTouched}
          canReview={canReview}
          onReviewAttempt={handleReviewAttempt}
        />
      </div>
    </main>
  );
}
