import { redirect } from "next/navigation";
import { headers } from "next/headers";
import SupportApp from "@/components/support-app";
import { verifyToken } from "@/lib/token";
import type { InstallationData } from "@/types/installation";

/**
 * Mock data used ONLY in development when no URL params are present.
 */
const DEV_FALLBACK_DATA: InstallationData = {
  sns: ["GW2024XK8B72"],
  name: "John Smith",
  email: "john.smith@example.com",
  address: "123 Solar Ave, Adelaide SA 5000, Australia",
  inverterModel: "MIN3000TL-XH",
  language: "en-AU",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;

  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      urlParams.set(key, value);
    } else if (Array.isArray(value) && value.length > 0) {
      urlParams.set(key, value[0]);
    }
  }

  const hasAnyParams = urlParams.toString().length > 0;

  let installationData: InstallationData;
  let isDevFallback = false;

  if (!hasAnyParams) {
    if (process.env.NODE_ENV === "production") {
      redirect("/expired?reason=missing_params");
    } else {
      installationData = DEV_FALLBACK_DATA;
      isDevFallback = true;
    }
  } else {
    // Request context attached to verifyToken's failure logs only —
    // helps triage Growatt integration issues (which IP / UA hit us).
    // No effect on validation logic itself.
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;
    const userAgent = h.get("user-agent") || null;
    const result = verifyToken(urlParams, { ip, userAgent, source: "page" });

    if (!result.valid) {
      redirect(`/expired?reason=${result.reason}`);
    }

    installationData = result.data!;
  }

  return <SupportApp initialData={installationData} isDevFallback={isDevFallback} />;
}
