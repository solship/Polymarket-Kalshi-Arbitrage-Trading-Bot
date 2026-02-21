/**
 * Single-instance lock for the monitor so only one process writes to the 15m log file.
 * Prevents multiple `npm run monitor` instances from causing excessive fetches and log spam.
 */
import * as fs from "fs";
import * as path from "path";

const LOGS_DIR = "logs";
const LOCK_FILE = path.join(LOGS_DIR, "monitor.lock");

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * If monitor.lock exists, kill the process whose PID is in the file (in case it wasn't
 * killed after a previous restart), then remove the lock file.
 */
function killExistingAndRemoveLock(): void {
  let existing: string;
  try {
    existing = fs.readFileSync(LOCK_FILE, "utf8").trim();
  } catch {
    return;
  }
  const existingPid = parseInt(existing, 10);
  if (!Number.isFinite(existingPid)) return;
  if (existingPid === process.pid) {
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch {
      // ignore
    }
    return;
  }
  if (isPidRunning(existingPid)) {
    try {
      process.kill(existingPid, "SIGTERM");
    } catch {
      // ignore
    }
  }
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch {
    // ignore
  }
}

/**
 * Try to acquire the single-instance lock. On startup, if monitor.lock exists, kills the
 * process recorded there (in case it survived a previous restart) and removes the file,
 * then acquires the lock. Exits the process only if another monitor is currently running
 * and we did not take over.
 * Call releaseMonitorLock() on normal exit and SIGINT.
 */
export function acquireMonitorLock(): void {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch {
    // ignore
  }
  killExistingAndRemoveLock();
  const pid = process.pid;
  const content = String(pid);

  try {
    fs.writeFileSync(LOCK_FILE, content, { flag: "wx" });
    return;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") throw err;
  }

  let existing: string;
  try {
    existing = fs.readFileSync(LOCK_FILE, "utf8").trim();
  } catch {
    existing = "";
  }
  const existingPid = parseInt(existing, 10);
  if (Number.isFinite(existingPid) && isPidRunning(existingPid)) {
    console.error(
      `Another monitor is already running (PID ${existingPid}). Only one instance is allowed. Exiting.`
    );
    process.exit(1);
  }

  try {
    fs.writeFileSync(LOCK_FILE, content);
  } catch (e) {
    console.error("Monitor lock file error:", e);
    process.exit(1);
  }
}

/** Release the single-instance lock. Call on exit. */
export function releaseMonitorLock(): void {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch {
    // ignore
  }
}
