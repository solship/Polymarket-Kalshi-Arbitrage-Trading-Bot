import { run } from "./bot";
import { appendMonitorLogWithTimestamp } from "./monitor-logger";
import { validateRequiredEnvOrExit } from "./validate-env";

validateRequiredEnvOrExit();

run().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(err);
  appendMonitorLogWithTimestamp(`Fatal: ${msg}`);
  process.exit(1);
});
