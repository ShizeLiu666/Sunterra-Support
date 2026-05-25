import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { buildSignedUrl } from "@/lib/sign-url";
import { MAX_SNS, type InstallationData } from "@/types/installation";

/**
 * Dev-only endpoint: builds a signed test URL.
 *
 * Returns 404 in production to prevent any chance of abuse.
 */

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { data, scenario } = body as {
      data: InstallationData;
      scenario: "valid" | "expired" | "tampered" | "missing_sn";
    };

    if (!Array.isArray(data.sns)) {
      return NextResponse.json(
        { message: "data.sns must be an array of SNs" },
        { status: 400 }
      );
    }

    if (scenario !== "missing_sn" && data.sns.length === 0) {
      return NextResponse.json(
        { message: "At least one SN is required for this scenario" },
        { status: 400 }
      );
    }

    if (data.sns.length > MAX_SNS) {
      return NextResponse.json(
        { message: `At most ${MAX_SNS} SNs are allowed` },
        { status: 400 }
      );
    }

    let timestamp = Math.floor(Date.now() / 1000);
    if (scenario === "expired") {
      timestamp = timestamp - 25 * 3600;
    }

    let scenarioData = { ...data };
    if (scenario === "missing_sn") {
      scenarioData = { ...data, sns: [] };
    }

    const origin =
      req.headers.get("origin") || `http://localhost:${process.env.PORT || 3000}`;

    let url = buildSignedUrl({
      baseUrl: origin,
      data: scenarioData,
      secret: env.HMAC_SECRET,
      timestamp,
    });

    if (scenario === "tampered") {
      const urlObj = new URL(url);
      const sign = urlObj.searchParams.get("sign") || "";
      const tampered = sign.slice(0, -1) + (sign.endsWith("0") ? "1" : "0");
      urlObj.searchParams.set("sign", tampered);
      url = urlObj.toString();
    }

    return NextResponse.json({ url, scenario, timestamp });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ message }, { status: 500 });
  }
}
