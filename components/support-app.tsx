"use client";

import { useState } from "react";
import { BrandHeader } from "@/components/brand-header";
import InstallationInfo from "@/components/installation-info";
import { TicketForm } from "@/components/ticket-form";
import type { InstallationData, UrlParams } from "@/types/installation";

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

  const token: UrlParams = { sn, timestamp, sign };
  const name = sp.get("name");
  const email = sp.get("email");
  const address = sp.get("address");
  const inverterModel = sp.get("inverterModel");
  const language = sp.get("language");
  // Use `!== null` (NOT truthy) so empty-string fields survive into the
  // forwarded token state, matching `lib/hmac.ts::buildSignString` which
  // keeps empty strings in the canonical (only undefined is omitted).
  // URLSearchParams.get() returns:
  //   - `null`  when the key is absent from the URL  → skip
  //   - `""`    when the key is present-but-empty    → KEEP (Growatt sends
  //                                                    `?email=&...` for
  //                                                    accounts with no
  //                                                    on-file email)
  //   - `"foo"` when the key has a value              → KEEP
  // Filtering empties here would make /api/submit receive `token.email=
  // undefined`, then `validateBody` drops the key, then the rebuilt
  // canonical sign string omits `email=` → invalid_signature even though
  // the original URL verified fine on first load.
  if (name !== null) token.name = name;
  if (email !== null) token.email = email;
  if (address !== null) token.address = address;
  if (inverterModel !== null) token.inverterModel = inverterModel;
  if (language !== null) token.language = language;
  return token;
}

export default function SupportApp({
  initialData,
  isDevFallback = false,
}: SupportAppProps) {
  const [installationData, setInstallationData] =
    useState<InstallationData>(initialData);
  const [token] = useState<UrlParams | null>(() => readTokenFromUrl());
  const [fieldErrors, setFieldErrors] = useState<{
    address?: string;
    state?: string;
  }>({});

  // Submit-time only (no realtime/onBlur). Returns true when address + state
  // are both present; otherwise sets inline errors and scrolls/focuses the
  // first empty field. Called by TicketForm at the top of handleSubmit.
  const validateContactBeforeSubmit = (): boolean => {
    const next: { address?: string; state?: string } = {};
    if (!installationData.address?.trim()) {
      next.address = "Please enter your installation address";
    }
    if (!installationData.state?.trim()) {
      next.state = "Please select your state";
    }
    setFieldErrors(next);
    const firstInvalidId = next.address
      ? "contact-address"
      : next.state
        ? "contact-state"
        : null;
    if (firstInvalidId) {
      const el = document.getElementById(firstInvalidId);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
      return false;
    }
    return true;
  };

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

        <InstallationInfo
          data={installationData}
          onChange={setInstallationData}
          errors={fieldErrors}
        />
        <TicketForm
          installationData={installationData}
          token={token}
          onValidateBeforeSubmit={validateContactBeforeSubmit}
        />
      </div>
    </main>
  );
}
