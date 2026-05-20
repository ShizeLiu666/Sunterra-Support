import Link from "next/link";

/**
 * Shown when token validation fails:
 * - Missing params
 * - Invalid signature
 * - Expired (>24h)
 * - Malformed timestamp
 *
 * Tells user to re-launch from ShinePhone.
 */
export default function ExpiredPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  return <ExpiredContent searchParams={searchParams} />;
}

async function ExpiredContent({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const params = await searchParams;
  const reason = params.reason;

  const messages: Record<string, { title: string; description: string }> = {
    missing_params: {
      title: "Link incomplete",
      description:
        "This link is missing required information. Please open Sunterra Support from the ShinePhone app.",
    },
    invalid_signature: {
      title: "Invalid link",
      description:
        "This link could not be verified. Please open Sunterra Support from the ShinePhone app to start a new request.",
    },
    expired: {
      title: "Link expired",
      description:
        "This link has expired (links are valid for 24 hours). Please open Sunterra Support from the ShinePhone app to start a new request.",
    },
    malformed: {
      title: "Invalid link",
      description:
        "This link appears to be malformed. Please open Sunterra Support from the ShinePhone app to start a new request.",
    },
    default: {
      title: "Link not valid",
      description:
        "Please open Sunterra Support from the ShinePhone app to start a new request.",
    },
  };

  const message = messages[reason ?? "default"] ?? messages.default;

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6 md:bg-gradient-to-br md:from-sunterra-light/30 md:to-white">
      <div className="w-full max-w-[480px] bg-white md:shadow-xl md:rounded-2xl p-8 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center mb-6">
          <svg
            className="w-8 h-8 text-yellow-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold text-sunterra-dark mb-3">
          {message.title}
        </h1>

        <p className="text-gray-600 mb-8 leading-relaxed">{message.description}</p>

        {process.env.NODE_ENV === "development" && (
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-3">Development mode</p>
            <Link
              href="/dev/test-link"
              className="inline-block text-sm text-sunterra-primary underline hover:opacity-80"
            >
              Open test link generator →
            </Link>
            {reason && (
              <p className="mt-3 text-xs text-gray-400 font-mono">Reason: {reason}</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export const metadata = {
  title: "Link not valid - Sunterra Support",
  robots: { index: false, follow: false },
};
