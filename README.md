# Kalshi + Polymarket Trading Toolkit

TypeScript app for **Bitcoin 15-minute up/down** markets on [Kalshi](https://kalshi.com) and [Polymarket](https://polymarket.com): Kalshi REST API, Polymarket CLOB/Gamma, dual-venue monitoring, and cross-venue arbitrage.

## About Developer
Here is Alexei who is expert of trading bot development especially EVM, Solana and Prediction market such as Polymarket, Klashi, etc.
If you have any question for dev, contact me via telegram(https://t.me/@bitship1_1)

## Prove of Work
Please check this log to see how the bot is working [here](https://github.com/Stuboyo77/polymarket-kalshi-arbitrage-trading-bot/tree/main/logs)

## Features

- **Balance** — Kalshi portfolio balance (REST).
- **Kalshi single order** — One limit order on the first open KXBTC15M market.
- **Dual-venue monitor** — Best-ask prices from Kalshi + Polymarket; 15m-slot logs; optional process restart at :00/:15/:30/:45; integrated arb.
- **Cross-venue arb** — When sum of opposite sides is in `[ARB_SUM_LOW, ARB_SUM_THRESHOLD)`, place one order on each venue (at most one per leg per market).
- **Polymarket single order** — One limit buy for the DOWN token on the current BTC 15m market.

## Setup

```bash
cp .env.sample .env
# Set KALSHI_API_KEY and KALSHI_PRIVATE_KEY_PATH or KALSHI_PRIVATE_KEY_PEM
npm install
```

For Polymarket orders / arb Poly leg: set `POLYMARKET_PRIVATE_KEY` and `POLYMARKET_PROXY`. The monitor uses [polymarket-validator](https://www.npmjs.com/package/polymarket-validator) for config validation at startup.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run dual price monitor + arb (single-instance lock, 15m log files). |
| `npm run balance` | Fetch and print Kalshi portfolio balance. |
| `npm run kalshi-single-order` | Place one Kalshi limit order on first open KXBTC15M market. |
| `npm run poly-single-order` | Place one Polymarket limit buy (DOWN token). Optional: `[price] [size]`. |
| `npm run build` | Compile TypeScript to `dist/`. |

## Environment

**Kalshi (required):** `KALSHI_API_KEY`, `KALSHI_PRIVATE_KEY_PATH` or `KALSHI_PRIVATE_KEY_PEM`. Optional: `KALSHI_DEMO`, `KALSHI_BASE_PATH`.

**Bot:** `KALSHI_BOT_SIDE` (yes/no), `KALSHI_BOT_PRICE_CENTS`, `KALSHI_BOT_CONTRACTS`, `KALSHI_BOT_MAX_MARKETS`, `KALSHI_BOT_DRY_RUN`.

**Monitor:** `KALSHI_MONITOR_INTERVAL_MS` (default 200), `KALSHI_MONITOR_TICKER` (optional), `KALSHI_MONITOR_NO_RESTART` (disable 15m restart).

**Arb:** `ARB_SUM_THRESHOLD` (default 0.92), `ARB_SUM_LOW` (default 0.75), `ARB_PRICE_BUFFER`, `ARB_SIZE`, `ARB_DRY_RUN`.

**Polymarket:** `POLYMARKET_PRIVATE_KEY`, `POLYMARKET_PROXY`; optional: `POLYMARKET_CLOB_URL`, `POLYMARKET_CHAIN_ID`, `POLYMARKET_TICK_SIZE`, `POLYMARKET_NEG_RISK`, `POLYMARKET_CREDENTIAL_PATH`, `POLYMARKET_MIN_USD`.

See `.env.sample` for all variables.

## Monitor & arb

`npm start` starts the dual monitor. It polls at `KALSHI_MONITOR_INTERVAL_MS`, logs to console and `logs/monitor_YYYY-MM-DD_HH-{00|15|30|45}.log`, and runs arb when the combined price (e.g. Kalshi UP + Polymarket DOWN) is in range. One monitor process only (`logs/monitor.lock`). Without `KALSHI_MONITOR_TICKER`, the process can restart at quarter-hour boundaries; set `KALSHI_MONITOR_NO_RESTART=true` to disable.

## Examples

```bash
# Dry run Kalshi order
KALSHI_BOT_DRY_RUN=true npm run kalshi-single-order

# Kalshi YES @ 50¢, 2 contracts
KALSHI_BOT_SIDE=yes KALSHI_BOT_PRICE_CENTS=50 KALSHI_BOT_CONTRACTS=2 npm run kalshi-single-order

# Polymarket DOWN @ 0.45, size 10
npm run poly-single-order 0.45 10
```

## Programmatic API

- **Kalshi:** `placeOrder(ticker, side, count, priceCents, options?)` from `./bot` or `./orders`.
- **Polymarket:** `placePolymarketOrder(tokenId, price, size, options?)` from `./polymarket-order` or `./orders`. Token IDs: `getTokenIdsForSlugCached(slug)` in `./polymarket-monitor`.

## Stack

Node/TypeScript, [kalshi-typescript](https://www.npmjs.com/package/kalshi-typescript), [@polymarket/clob-client](https://www.npmjs.com/package/@polymarket/clob-client), ethers, [polymarket-validator](https://www.npmjs.com/package/polymarket-validator).

## Docs

[Kalshi API](https://docs.kalshi.com/) · [TypeScript SDK](https://docs.kalshi.com/sdks/typescript/quickstart) · [WebSockets](https://docs.kalshi.com/websockets/websocket-connection)
