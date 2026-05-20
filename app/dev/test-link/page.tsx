import { redirect } from "next/navigation";
import TestLinkClient from "./TestLinkClient";

/**
 * Dev-only page for generating test URLs.
 *
 * Blocks access in production (NODE_ENV === 'production').
 * In dev, presents a form to build a signed URL with custom params.
 */
export default function TestLinkPage() {
  if (process.env.NODE_ENV === "production") {
    redirect("/expired");
  }

  return <TestLinkClient />;
}

export const metadata = {
  title: "Test Link Generator (Dev Only)",
  robots: { index: false, follow: false },
};
