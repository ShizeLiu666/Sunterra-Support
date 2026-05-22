/**
 * Shown after a Customer_Care__c record has been created in Salesforce.
 * Receives `?caseNumber=<Case-XXXXX>` from the ticket-form redirect, plus an
 * optional `?photoWarning=N` (Phase 2G-3) when one or more attached photos
 * failed to upload (either client-side compression failure or server-side
 * Salesforce Files upload failure).
 *
 * When the post-create Name lookup in /api/submit succeeds, caseNumber is
 * the human-friendly Auto Number (e.g. "Case-14060") and is displayed as
 * "Your case number". When it fails, caseNumber is the 18-char Record ID
 * and is displayed as "Reference" with a softer "please save this" cue so
 * the customer still has something to quote back at support.
 *
 * Style intentionally mirrors /expired: same container, same vertical rhythm,
 * same brand colors. ShinePhone deep-link return is deferred to Phase 2G.
 */

export const metadata = {
  title: "Ticket submitted - Sunterra Support",
  robots: { index: false, follow: false },
};

interface SuccessPageProps {
  searchParams: Promise<{ caseNumber?: string; photoWarning?: string }>;
}

/**
 * Heuristic: SF Auto Number for Customer_Care__c is "Case-XXXXX"; the
 * Record ID fallback is 15–18 alphanumeric characters with no hyphen.
 * We treat anything that doesn't start with "Case-" as the fallback.
 */
function looksLikeRecordIdFallback(value: string): boolean {
  return !value.startsWith("Case-");
}

export default async function SuccessPage({ searchParams }: SuccessPageProps) {
  const params = await searchParams;
  const caseNumber =
    typeof params.caseNumber === "string" && params.caseNumber.length > 0
      ? params.caseNumber
      : undefined;
  const isFallback = caseNumber ? looksLikeRecordIdFallback(caseNumber) : false;

  const parsedPhotoWarning =
    typeof params.photoWarning === "string"
      ? parseInt(params.photoWarning, 10)
      : 0;
  const photoWarning =
    Number.isFinite(parsedPhotoWarning) && parsedPhotoWarning > 0
      ? parsedPhotoWarning
      : 0;
  const showPhotoWarning = photoWarning > 0;

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
          1 business day.
        </p>

        {caseNumber && !isFallback && (
          <p className="text-sm text-gray-500 mb-6">
            Your case number:{" "}
            <code className="font-mono text-sunterra-dark/80">{caseNumber}</code>
          </p>
        )}

        {caseNumber && isFallback && (
          <p className="text-sm text-gray-500 mb-6">
            Reference (please save this):{" "}
            <code className="font-mono text-sunterra-dark/80">{caseNumber}</code>
          </p>
        )}

        {showPhotoWarning && (
          <div
            role="alert"
            className="mx-auto mb-6 max-w-md rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800"
          >
            <p>
              Note: {photoWarning}{" "}
              {photoWarning === 1 ? "photo was" : "photos were"} not attached.
              If any are important, please email us at XXX.
            </p>
          </div>
        )}

        <p className="text-sm text-sunterra-dark/70">
          You can now close this page and return to the ShinePhone app.
        </p>
      </div>
    </main>
  );
}
