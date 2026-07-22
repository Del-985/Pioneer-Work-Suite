type NodeEnvironment = "development" | "test" | "production";

try {
  const loadEnvFile = (process as typeof process & {
    loadEnvFile?: (path?: string) => void;
  }).loadEnvFile;
  loadEnvFile?.();
} catch (error: any) {
  if (error?.code !== "ENOENT") throw error;
}

function parseEnvironment(value: string | undefined): NodeEnvironment {
  return value === "production" || value === "test" ? value : "development";
}

function parseInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function parseOrigins(value: string | undefined, environment: NodeEnvironment): string[] {
  const defaults = environment === "production"
    ? ["https://del-985.github.io", "tauri://localhost", "https://tauri.localhost"]
    : [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "tauri://localhost",
        "https://tauri.localhost",
      ];
  const origins = value
    ? value.split(",").map((origin) => origin.trim()).filter(Boolean)
    : defaults;
  return [...new Set(origins)];
}

const environment = parseEnvironment(process.env.NODE_ENV);
const configuredSecret = process.env.JWT_SECRET?.trim();

if (environment === "production" && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error("JWT_SECRET must contain at least 32 characters in production");
}

export const config = Object.freeze({
  environment,
  isProduction: environment === "production",
  port: parseInteger("PORT", process.env.PORT, 4000, 1, 65535),
  jwtSecret: configuredSecret || "development-only-secret-change-before-deploying",
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS, environment),
  jsonBodyLimit: process.env.JSON_BODY_LIMIT?.trim() || "2mb",
  shutdownTimeoutMs: parseInteger(
    "SHUTDOWN_TIMEOUT_MS",
    process.env.SHUTDOWN_TIMEOUT_MS,
    10_000,
    1_000,
    60_000
  ),
});
