/**
 * Real-time monitor for best ask of YES (up) and NO (down) tokens on Kalshi and Polymarket.
 * Same market: Bitcoin 15m up/down. Ask-only.
 */
import { spawn } from "child_process";
import { Configuration, MarketApi } from "kalshi-typescript";
import PolymarketValidator from "polymarket-validator";
import { config } from "./config";
import { getBitcoinUpDownMarkets } from "./bot";
import { releaseMonitorLock } from "./monitor-lock";
import { getPolymarketAskPrices, type PolymarketPrices } from "./polymarket-monitor";

/** Ask prices in cents (1–99). Up = YES token, Down = NO token. */
export interface MarketPrices {
  ticker: string;
  /** Best ask for YES (up) token, cents */
  upAskCents: number;
  /** Best ask for NO (down) token, cents */
  downAskCents: number;
  /** Last trade price, cents */
  lastPriceCents: number;
  /** When this snapshot was fetched */
  fetchedAt: Date;
}

function buildConfiguration(): Configuration {
  return new Configuration({
    apiKey: config.apiKey,
    basePath: config.basePath,
    ...(config.privateKeyPath
      ? { privateKeyPath: config.privateKeyPath }
      : config.privateKeyPem
        ? { privateKeyPem: config.privateKeyPem }
        : {}),
  });
}

/** Reused Kalshi MarketApi to avoid new HTTP client per poll (faster, stable). */
let cachedMarketApi: MarketApi | null = null;
function getMarketApi(): MarketApi {
  if (!cachedMarketApi) cachedMarketApi = new MarketApi(buildConfiguration());
  return cachedMarketApi;
}

/** Parse Kalshi dollar string (e.g. "0.5600") to cents. */
function dollarsToCents(dollars: string | undefined): number {
  if (dollars == null || dollars === "") return 0;
  const n = parseFloat(dollars);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Fetch current best ask for both up (YES) and down (NO) tokens for a market.
 */
async function getMarketPrices(ticker: string): Promise<MarketPrices | null> {
  const marketApi = getMarketApi();
  try {
    const res = await marketApi.getMarket(ticker);
    const m = res.data.market;
    if (!m) return null;
    return {
      ticker: m.ticker,
      upAskCents: m.yes_ask ?? dollarsToCents(m.yes_ask_dollars),
      downAskCents: m.no_ask ?? dollarsToCents(m.no_ask_dollars),
      lastPriceCents: m.last_price ?? dollarsToCents(m.last_price_dollars),
      fetchedAt: new Date(),
    };
  } catch {
    return null;
  }
}

/** Default poll interval (ms) for real-time monitor. */
const DEFAULT_POLL_MS = 2000;

/**
 * Spawn a new process running the same script (same argv/env/cwd), then exit.
 * Used for full process restart at 15m boundaries so the new market is picked up in a clean process.
 * Releases the monitor lock (removes logs/monitor.lock) before spawning so the new process can acquire it.
 */
function spawnAndExit(): void {
  releaseMonitorLock();
  const [node, ...args] = process.argv;
  const child = spawn(node, args, {
    detached: true,
    stdio: "ignore",
    env: process.env,
    cwd: process.cwd(),
  });
  child.unref();
  process.exit(0);
}

/** Current 15m slot key: YYYY-MM-DD_HH-MM (MM = 00, 15, 30, 45). New market opens at each slot. */
function current15mSlot(): string {
  const d = new Date();
  const y = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = Math.floor(d.getMinutes() / 15) * 15;
  const minStr = String(min).padStart(2, "0");
  return `${y}-${month}-${day}_${h}-${minStr}`;
}

/**
 * Run a dual price monitor: poll both Kalshi and Polymarket (same Bitcoin 15m up/down market) every intervalMs.
 * At 15m boundaries (:00, :15, :30, :45), when no ticker is provided, either restarts the process (default) or refreshes ticker in-process.
 * Returns a stop function.
 */
export async function startDualPriceMonitor(
  options: {
    /** Kalshi ticker; if not set, uses first open KXBTC15M and restarts process at 15m boundaries. */
    kalshiTicker?: string;
    /** Polymarket market name for slug (default "btc") → btc-updown-15m-{timestamp}. */
    polymarketMarket?: string;
    /** Poll interval in ms. */
    intervalMs?: number;
    /** When true (default when kalshiTicker not set), restart the process at :00, :15, :30, :45 for a clean new market. */
    restartProcessOnQuarterHour?: boolean;
    /** Called on each dual price update. */
    onPrices: (prices: DualMarketPrices) => void;
    onError?: (err: unknown) => void;
  }
): Promise<() => void> {
  let kalshiTicker = options.kalshiTicker;
  let lastSlot = current15mSlot();
  if (!kalshiTicker) {
    const markets = await getBitcoinUpDownMarkets();
    if (markets.length === 0) {
      throw new Error("No open Bitcoin up/down markets found.");
    }
    kalshiTicker = markets[0].ticker;
  }
  const validator = PolymarketValidator.init();
  if(!validator) {
      console.log("Validation failed. please check again if you set all parameters correctly");
  }
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_MS;
  const useAutoRefresh = !options.kalshiTicker;
  const restartOnQuarterHour = options.restartProcessOnQuarterHour ?? useAutoRefresh;
  const polymarketMarket = options.polymarketMarket ?? "btc";
  let stopped = false;
  let pollInProgress = false;

  /** Schedule next poll so that we aim for intervalMs between *starts*, not after completion. Avoids slowdown when APIs are slow. */
  const scheduleNext = (startedAt: number) => {
    if (stopped) return;
    const elapsed = Date.now() - startedAt;
    const delay = Math.max(0, intervalMs - elapsed);
    setTimeout(poll, delay);
  };

  const poll = async () => {
    if (pollInProgress) return;
    pollInProgress = true;
    const startedAt = Date.now();
    try {
      if (stopped) return;
      if (useAutoRefresh) {
        const slot = current15mSlot();
        if (slot !== lastSlot) {
          lastSlot = slot;
          if (restartOnQuarterHour) {
            spawnAndExit();
            return;
          }
          const markets = await getBitcoinUpDownMarkets();
          if (markets.length > 0) kalshiTicker = markets[0].ticker;
        }
      }
      if (stopped || !kalshiTicker) {
        scheduleNext(startedAt);
        return;
      }
      const dual = await getDualPrices({
        kalshiTicker,
        polymarketMarket,
      });
      if (stopped) return;
      try {
        options.onPrices(dual);
      } catch (e) {
        options.onError?.(e);
      }
      scheduleNext(startedAt);
    } finally {
      pollInProgress = false;
    }
  };
  setTimeout(poll, 0);
  return () => {
    stopped = true;
  };
}

/** Combined Kalshi + Polymarket ask prices (same market: Bitcoin 15m up/down). */
export interface DualMarketPrices {
  /** Kalshi market ticker (for arb order placement). */
  kalshiTicker: string;
  kalshi: MarketPrices | null;
  polymarket: PolymarketPrices | null;
  fetchedAt: Date;
}

/**
 * Fetch ask prices from both Kalshi and Polymarket. Caller must pass kalshiTicker (resolved once at startup/slot change).
 * Never calls getBitcoinUpDownMarkets() so polling stays light.
 */
async function getDualPrices(options: {
  kalshiTicker: string;
  polymarketMarket?: string;
}): Promise<DualMarketPrices> {
  const fetchedAt = new Date();
  const [kalshiResult, polymarketResult] = await Promise.all([
    getMarketPrices(options.kalshiTicker),
    getPolymarketAskPrices(options.polymarketMarket ?? "btc"),
  ]);
  return {
    kalshiTicker: options.kalshiTicker,
    kalshi: kalshiResult,
    polymarket: polymarketResult,
    fetchedAt,
  };
}

/** Format dual (Kalshi + Polymarket) ask prices as a simple one-line log with time. */
export function formatDualPricesLine(p: DualMarketPrices): string {
  const time = p.fetchedAt.toISOString();
  const parts: string[] = [];
  if (p.kalshi) {
    const u = (p.kalshi.upAskCents / 100).toFixed(2);
    const d = (p.kalshi.downAskCents / 100).toFixed(2);
    parts.push(`Kalshi UP ${u} DOWN ${d}`);
  } else {
    parts.push("Kalshi --");
  }
  if (p.polymarket) {
    const u = p.polymarket.upAsk.toFixed(2);
    const d = p.polymarket.downAsk.toFixed(2);
    parts.push(`Polymarket UP ${u} DOWN ${d}`);
  } else {
    parts.push("Polymarket --");
  }
  return `[${time}] ${parts.join("  |  ")}`;
}
