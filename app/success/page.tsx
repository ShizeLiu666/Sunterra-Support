/**
 * Shown after a Customer_Care__c record has been created in Salesforce.
 * Receives `?caseId=<SF record id>` from the ticket-form redirect.
 *
 * Style intentionally mirrors /expired: same container, same vertical rhythm,
 * same brand colors. ShinePhone deep-link return is deferred to Phase 2G.
 */

export const metadata = {
  title: "Ticket submitted - Sunterra Support",
  robots: { index: false, follow: false },
};

interface SuccessPageProps {
  searchParams: Promise<{ caseId?: string }>;
}

export default async function SuccessPage({ searchParams }: SuccessPageProps) {
  const params = await searchParams;
  const caseId = typeof params.caseId === "string" ? params.caseId : undefined;

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6 md:bg-gradient-to-br md:from-sunterra-light/30 md:to-white">
      <div className="w-full max-w-[480px] bg-white md:shadow-xl md:rounded-2xl p-8 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-sunterra-light flex items-center justify-center mb-6">
          <svg
            className="w-8 h-8 text-sunterra-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold text-sunterra-dark mb-3">
          Ticket Submitted
        </h1>

        <p className="text-gray-600 mb-6 leading-relaxed">
          Thanks — we&apos;ve received your support request and will respond within
          24 hours.
        </p>

        {caseId && (
          <p className="text-sm text-gray-500 mb-6">
            Reference:{" "}
            <code className="font-mono text-sunterra-dark/80">{caseId}</code>
          </p>
        )}

        <p className="text-sm text-sunterra-dark/70">
          You can now close this page and return to the ShinePhone app.
        </p>
      </div>
    </main>
  );
}
