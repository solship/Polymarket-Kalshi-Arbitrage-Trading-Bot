#!/usr/bin/env node
/**
 * Standalone script: place one limit buy order for the DOWN token on the current
 * Bitcoin 15m up/down Polymarket (same market the monitor/arb use).
 *
 * Usage:
 *   npx ts-node src/scripts/place-poly-down.ts [price] [size]
 *
 * If price/size omitted: price = current best DOWN ask + 0.01, size = max(ARB_POLY_MIN, ARB_SIZE), raised so price×size >= POLYMARKET_MIN_USD ($1).
 * Requires: POLYMARKET_PRIVATE_KEY, POLYMARKET_PROXY in .env.
 * Uses forcePlace so the order is placed even if ARB_DRY_RUN is true.
 */
import "dotenv/config";
import {
  getPolymarketAskPrices,
  getTokenIdsForSlugCached,
} from "../polymarket-monitor";
import { placePolymarketOrder } from "../polymarket-order";
import { ARB_POLY_MIN, ARB_SIZE, POLYMARKET_MIN_USD } from "../config";

async function main(): Promise<void> {
  const market = "btc";
  const prices = await getPolymarketAskPrices(market);
  if (!prices) {
    console.error("Could not fetch Polymarket prices for current 15m slot. Check slug/market.");
    process.exit(1);
  }

  const slug = prices.slug;
  const downAsk = prices.downAsk;
  const { downTokenId } = await getTokenIdsForSlugCached(slug);

  const priceArg = process.argv[2];
  const sizeArg = process.argv[3];
  const price = priceArg != null ? parseFloat(priceArg) : Math.min(1, downAsk + 0.01);
  let size = sizeArg != null ? parseFloat(sizeArg) : Math.max(ARB_POLY_MIN, ARB_SIZE);

  if (!Number.isFinite(price) || price <= 0 || price > 1) {
    console.error("Invalid price (use 0–1). Example: 0.45");
    process.exit(1);
  }
  const minUsd = POLYMARKET_MIN_USD > 0 ? POLYMARKET_MIN_USD : 1;
  const minSizeForNotional = Math.ceil(minUsd / price);
  size = Math.max(size, minSizeForNotional);
  if (!Number.isFinite(size) || size < ARB_POLY_MIN) {
    console.error(`Invalid size (min ${ARB_POLY_MIN} shares, notional >= $${minUsd}). Example: ${minSizeForNotional}`);
    process.exit(1);
  }

  console.log(`Slug: ${slug}`);
  console.log(`DOWN token: ${downTokenId.slice(0, 16)}...`);
  console.log(`Current best DOWN ask: ${downAsk.toFixed(3)}`);
  console.log(`Placing BUY DOWN @ ${price.toFixed(3)} x ${size} ...`);

  const result = await placePolymarketOrder(downTokenId, price, size, {
    forcePlace: true,
  });

  if (result === null) {
    console.error("Polymarket not configured (missing POLYMARKET_PRIVATE_KEY or POLYMARKET_PROXY).");
    process.exit(1);
  }
  if ("error" in result) {
    console.error("Order failed:", result.error);
    process.exit(1);
  }
  console.log("Order placed:", result.orderId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
