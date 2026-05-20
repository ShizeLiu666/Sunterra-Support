"use client";

import { useState } from "react";
import { BrandHeader } from "@/components/brand-header";
import InstallationInfo from "@/components/installation-info";
import { TicketForm } from "@/components/ticket-form";
import type { InstallationData } from "@/types/installation";

interface SupportAppProps {
  initialData: InstallationData;
  isDevFallback?: boolean;
}

export default function SupportApp({
  initialData,
  isDevFallback = false,
}: SupportAppProps) {
  const [installationData, setInstallationData] =
    useState<InstallationData>(initialData);

  return (
    <main className="min-h-screen bg-white p-4 md:p-8 md:bg-gradient-to-br md:from-sunterra-light/30 md:to-white">
      <div className="max-w-[480px] mx-auto md:bg-white md:shadow-xl md:rounded-2xl md:p-6 space-y-4">
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
        />
        <TicketForm installationData={installationData} />
      </div>
    </main>
  );
}
