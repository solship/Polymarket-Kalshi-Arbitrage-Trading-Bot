/**
 * Unified order placement for Kalshi and Polymarket.
 *
 * --- Kalshi ---
 * placeOrder(ticker, side, count, priceCents)
 *   - ticker: Kalshi market ticker (e.g. KXBTC15M-24JAN15)
 *   - side: "yes" | "no" (up/down)
 *   - count: number of contracts
 *   - priceCents: limit price 1–99 (cents per share)
 * Env: KALSHI_API_KEY, KALSHI_PRIVATE_KEY_PEM or KALSHI_PRIVATE_KEY_PATH;
 *      KALSHI_BOT_SIDE, KALSHI_BOT_PRICE_CENTS, KALSHI_BOT_CONTRACTS, KALSHI_BOT_DRY_RUN (bot defaults).
 *
 * --- Polymarket (aligned with ww project) ---
 * placePolymarketOrder(tokenId, price, size, options?)
 *   - tokenId: CLOB token ID (from Gamma API / slug)
 *   - price: limit price 0–1
 *   - size: shares
 *   - options: { tickSize?, negRisk? } optional overrides
 * Env: POLYMARKET_PRIVATE_KEY, POLYMARKET_PROXY (required to place);
 *      POLYMARKET_TICK_SIZE or COPYTRADE_TICK_SIZE ("0.01"|"0.001"|"0.0001");
 *      POLYMARKET_NEG_RISK or COPYTRADE_NEG_RISK; POLYMARKET_CLOB_URL or CLOB_API_URL;
 *      POLYMARKET_CHAIN_ID or CHAIN_ID; optional POLYMARKET_CREDENTIAL_PATH (ww-style credential.json).
 */
export { placeOrder } from "./bot";
export type { PlacePolyResult, PlacePolymarketOrderOptions } from "./polymarket-order";
export {
  placePolymarketOrder,
  clearPolymarketClientCache,
} from "./polymarket-order";
