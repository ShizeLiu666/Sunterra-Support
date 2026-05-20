/**
 * Type-safe environment variable loading with per-field lazy validation.
 *
 * Design principles:
 * - Each field is validated only when first accessed
 * - HMAC config (used by token verification) is independent from
 *   Salesforce config (used by SF API integration)
 * - Missing one field doesn't break unrelated features
 *
 * Usage:
 *   import { env } from '@/lib/env';
 *   const secret = env.HMAC_SECRET;             // validates HMAC_SECRET only
 *   const clientId = env.SALESFORCE_CLIENT_ID;  // validates that only
 */

interface Env {
  // HMAC group
  HMAC_SECRET: string;
  TOKEN_TTL_SECONDS: number;

  // Salesforce group
  SALESFORCE_CLIENT_ID: string;
  SALESFORCE_CLIENT_SECRET: string;
  SALESFORCE_INSTANCE_URL: string;
  SALESFORCE_API_VERSION: string;

  // Runtime group
  NODE_ENV: "development" | "production" | "test";
  IS_DEV: boolean;
}

// Cache validated values to avoid re-reading process.env on every access.
const cache: Partial<Env> = {};

function readRequired(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `Check .env.local against .env.example`
    );
  }
  return value;
}

function readOptional(key: string, defaultValue: string): string {
  return process.env[key]?.trim() || defaultValue;
}

/**
 * Per-field lazy validators.
 * Each function validates ONLY the field it returns.
 */
const validators: { [K in keyof Env]: () => Env[K] } = {
  HMAC_SECRET: () => readRequired("HMAC_SECRET"),

  TOKEN_TTL_SECONDS: () => parseInt(readOptional("TOKEN_TTL_SECONDS", "86400"), 10),

  SALESFORCE_CLIENT_ID: () => readRequired("SALESFORCE_CLIENT_ID"),
  SALESFORCE_CLIENT_SECRET: () => readRequired("SALESFORCE_CLIENT_SECRET"),
  SALESFORCE_INSTANCE_URL: () => readRequired("SALESFORCE_INSTANCE_URL"),
  SALESFORCE_API_VERSION: () => readOptional("SALESFORCE_API_VERSION", "v62.0"),

  NODE_ENV: () => (process.env.NODE_ENV || "development") as Env["NODE_ENV"],

  IS_DEV: () => (process.env.NODE_ENV || "development") === "development",
};

/**
 * Type-safe environment variable accessor.
 * Each field validates lazily on first access and caches the result.
 */
export const env = new Proxy({} as Env, {
  get<K extends keyof Env>(_target: Env, prop: K | string | symbol): Env[K] {
    if (typeof prop !== "string" || !(prop in validators)) {
      throw new Error(`Unknown env key: ${String(prop)}`);
    }

    const key = prop as K;
    if (cache[key] === undefined) {
      cache[key] = validators[key]() as Env[K];
    }
    return cache[key] as Env[K];
  },
});

/**
 * Validate all environment variables eagerly.
 * Useful at app startup to fail fast if config is incomplete.
 *
 * Optional groups can be skipped:
 *   validateEnv({ skipSalesforce: true })  // for token-only contexts
 */
export function validateEnv(
  options: {
    skipSalesforce?: boolean;
  } = {}
): void {
  // Always validate HMAC and runtime
  void env.HMAC_SECRET;
  void env.TOKEN_TTL_SECONDS;
  void env.NODE_ENV;

  if (!options.skipSalesforce) {
    void env.SALESFORCE_CLIENT_ID;
    void env.SALESFORCE_CLIENT_SECRET;
    void env.SALESFORCE_INSTANCE_URL;
    void env.SALESFORCE_API_VERSION;
  }
}
