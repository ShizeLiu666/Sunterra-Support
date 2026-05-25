import type { InstallationData } from "@/types/installation";
import { computeSignature } from "./hmac";

/**
 * Build a signed test URL for development.
 *
 * Used by /dev/test-link page to generate URLs that mimic
 * what ShinePhone would send in production.
 */

export interface BuildSignedUrlOptions {
  baseUrl: string; // e.g., "http://localhost:3000"
  data: InstallationData; // sn + optional fields
  secret: string; // HMAC secret
  timestamp?: number; // Unix seconds; defaults to now
}

export function buildSignedUrl(opts: BuildSignedUrlOptions): string {
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);

  // Wire format: SNs are concatenated with commas into a single `sn`
  // param value. The HMAC signature is computed over this joined string
  // verbatim. Empty arrays still produce a "" value so dev scenarios
  // that test the "missing SN" path can exercise it.
  const joinedSn = opts.data.sns.join(",");

  const params: Record<string, string> = {
    sn: joinedSn,
    timestamp: String(timestamp),
  };

  if (opts.data.name) params.name = opts.data.name;
  if (opts.data.email) params.email = opts.data.email;
  if (opts.data.address) params.address = opts.data.address;
  if (opts.data.inverterModel) params.inverterModel = opts.data.inverterModel;
  if (opts.data.language) params.language = opts.data.language;

  const sign = computeSignature(params, opts.secret);

  const url = new URL(opts.baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  url.searchParams.set("sign", sign);

  return url.toString();
}
