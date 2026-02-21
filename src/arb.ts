/**
 * Cross-venue arb: detect when sum of opposite sides (Kalshi + Polymarket) is in
 * [ARB_SUM_LOW, ARB_SUM_THRESHOLD), log the opportunity, and place orders on both venues.
 * Called from the monitor's onPrices callback.
 */
import type { DualMarketPrices } from "./monitor";
import {
  ARB_SUM_LOW,
  ARB_SUM_THRESHOLD,
  ARB_PRICE_BUFFER,
  ARB_SIZE,
  ARB_KALSHI_MIN,
  ARB_POLY_MIN,
  ARB_DRY_RUN,
} from "./config";
import { placeOrder } from "./bot";
import { placePolymarketOrder } from "./polymarket-order";
import { getTokenIdsForSlugCached } from "./polymarket-monitor";
import { appendMonitorLogWithTimestamp } from "./monitor-logger";

/** Markets we've already placed (or dry-run) an arb for — at most once per market per leg. */
const upArbDoneTickers = new Set<string>();
const downArbDoneTickers = new Set<string>();

function inRange(sum: number): boolean {
  return Number.isFinite(sum) && sum >= ARB_SUM_LOW && sum < ARB_SUM_THRESHOLD;
}

/**
 * Check for arb opportunity and place orders if sum is in [ARB_SUM_LOW, ARB_SUM_THRESHOLD).
 * Leg 1: Kalshi UP + Polymarket DOWN → sumUp = kalshiUp + polyDown
 * Leg 2: Kalshi DOWN + Polymarket UP → sumDown = kalshiDown + polyUp
 */
export async function checkArbAndPlaceOrders(p: DualMarketPrices): Promise<void> {
  if (!p.kalshi || !p.polymarket) return;
  const kalshiTicker = p.kalshiTicker;

  const kUp = p.kalshi.upAskCents / 100;
  const kDown = p.kalshi.downAskCents / 100;
  const polyUp = p.polymarket.upAsk;
  const polyDown = p.polymarket.downAsk;

  const sumUp = kUp + polyDown;
  const sumDown = kDown + polyUp;

  const kalshiContracts = Math.max(ARB_KALSHI_MIN, Math.round(ARB_SIZE));
  const polySize = Math.max(ARB_POLY_MIN, ARB_SIZE);

  // Leg 1: buy Kalshi YES (UP) + Polymarket DOWN — once per market
  if (inRange(sumUp)) {
    if (upArbDoneTickers.has(kalshiTicker)) return; // already bought this leg for this market
    upArbDoneTickers.add(kalshiTicker);

    const kalshiPriceCents = Math.round((kUp + ARB_PRICE_BUFFER) * 100);
    const polyPrice = Math.min(1, polyDown + ARB_PRICE_BUFFER);

    const msg = `[Arb] Opportunity (UP leg): sum=${sumUp.toFixed(3)} (Kalshi UP ${kUp.toFixed(2)} + Poly DOWN ${polyDown.toFixed(2)}) — ${ARB_DRY_RUN ? "DRY RUN, would place" : "placing"} Kalshi YES @ ${(kalshiPriceCents / 100).toFixed(2)}, Poly DOWN @ ${polyPrice.toFixed(3)}`;
    console.log(msg);
    appendMonitorLogWithTimestamp(msg);

    if (!ARB_DRY_RUN) {
      const [kalshiResult, tokenIds] = await Promise.all([
        placeOrder(kalshiTicker, "yes", kalshiContracts, kalshiPriceCents, { arbLive: true }),
        getTokenIdsForSlugCached(p.polymarket.slug),
      ]);
      if ("error" in kalshiResult) {
        appendMonitorLogWithTimestamp(`[Arb] Kalshi order failed: ${kalshiResult.error}`);
      }
      const polyResult = await placePolymarketOrder(
        tokenIds.downTokenId,
        polyPrice,
        polySize
      );
      if (polyResult && "error" in polyResult) {
        appendMonitorLogWithTimestamp(`[Arb] Polymarket order failed: ${polyResult.error}`);
      }
    }
    return; // one leg per tick to avoid double-firing
  }

  // Leg 2: buy Kalshi NO (DOWN) + Polymarket UP — once per market
  if (inRange(sumDown)) {
    if (downArbDoneTickers.has(kalshiTicker)) return; // already bought this leg for this market
    downArbDoneTickers.add(kalshiTicker);

    const kalshiPriceCents = Math.round((kDown + ARB_PRICE_BUFFER) * 100);
    const polyPrice = Math.min(1, polyUp + ARB_PRICE_BUFFER);

    const msg = `[Arb] Opportunity (DOWN leg): sum=${sumDown.toFixed(3)} (Kalshi DOWN ${kDown.toFixed(2)} + Poly UP ${polyUp.toFixed(2)}) — ${ARB_DRY_RUN ? "DRY RUN, would place" : "placing"} Kalshi NO @ ${(kalshiPriceCents / 100).toFixed(2)}, Poly UP @ ${polyPrice.toFixed(3)}`;
    console.log(msg);
    appendMonitorLogWithTimestamp(msg);

    if (!ARB_DRY_RUN) {
      const [kalshiResult, tokenIds] = await Promise.all([
        placeOrder(kalshiTicker, "no", kalshiContracts, kalshiPriceCents, { arbLive: true }),
        getTokenIdsForSlugCached(p.polymarket.slug),
      ]);
      if ("error" in kalshiResult) {
        appendMonitorLogWithTimestamp(`[Arb] Kalshi order failed: ${kalshiResult.error}`);
      }
      const polyResult = await placePolymarketOrder(
        tokenIds.upTokenId,
        polyPrice,
        polySize
      );
      if (polyResult && "error" in polyResult) {
        appendMonitorLogWithTimestamp(`[Arb] Polymarket order failed: ${polyResult.error}`);
      }
    }
  }
}
