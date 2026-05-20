import { redirect } from "next/navigation";
import SupportApp from "@/components/support-app";
import { verifyToken } from "@/lib/token";
import type { InstallationData } from "@/types/installation";

/**
 * Mock data used ONLY in development when no URL params are present.
 */
const DEV_FALLBACK_DATA: InstallationData = {
  sn: "GW2024XK8B72",
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
    const result = verifyToken(urlParams);

    if (!result.valid) {
      redirect(`/expired?reason=${result.reason}`);
    }

    installationData = result.data!;
  }

  return <SupportApp initialData={installationData} isDevFallback={isDevFallback} />;
}
