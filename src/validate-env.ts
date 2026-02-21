/**
 * Validates required environment variables before starting the bot or monitor.
 * If any required variable is missing, logs a warning and exits the process.
 */

function getEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Check required env vars. Throws with a clear message listing missing vars.
 * Does not exit; caller should catch and exit(1) after logging.
 */
export function validateRequiredEnv(): void {
  const missing: string[] = [];

  const apiKey = getEnv("KALSHI_API_KEY");
  if (!apiKey) missing.push("KALSHI_API_KEY");

  const keyPath = getEnv("KALSHI_PRIVATE_KEY_PATH");
  const keyPem = getEnv("KALSHI_PRIVATE_KEY_PEM");
  if (!keyPath && !keyPem) {
    missing.push("KALSHI_PRIVATE_KEY_PATH or KALSHI_PRIVATE_KEY_PEM");
  }

  const polyKey = getEnv("POLYMARKET_PRIVATE_KEY");
  const polyProxy = getEnv("POLYMARKET_PROXY");
  if (polyKey && !polyProxy) {
    missing.push("POLYMARKET_PROXY (required when POLYMARKET_PRIVATE_KEY is set)");
  }

  if (missing.length === 0) return;

  const message =
    "Missing required environment variable(s):\n  - " +
    missing.join("\n  - ") +
    "\n\nSet them in .env (see .env.sample) and try again.";
  throw new Error(message);
}

/**
 * Run validation; on failure log warning to stderr and exit(1).
 * Call this at the start of main() in bot-run and monitor-run.
 */
export function validateRequiredEnvOrExit(): void {
  try {
    validateRequiredEnv();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("\n[Config] " + msg + "\n");
    process.exit(1);
  }
}
