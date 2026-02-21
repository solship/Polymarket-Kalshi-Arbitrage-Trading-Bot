/**
 * Polymarket monitoring for Bitcoin 15m up/down market (ask prices only).
 * Same market as Kalshi: slug = btc-updown-15m-{timestamp}, Gamma API for token IDs, CLOB for order book.
 */

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";
const CLOB_API_BASE = "https://clob.polymarket.com";

/** Slug for current 15-minute slot. Format: {market}-updown-15m-{timestamp} (Unix seconds). */
function slugForCurrent15m(market: string): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMilliseconds(0);
  const m = d.getMinutes();
  const slotMin = Math.floor(m / 15) * 15;
  d.setMinutes(slotMin, 0, 0);
  const timestamp = Math.floor(d.getTime() / 1000);
  return `${market}-updown-15m-${timestamp}`;
}

/** Parse Gamma API field: may be array or JSON string. */
function parseJsonArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Fetch Up/Down token IDs for a Polymarket slug via Gamma API. */
async function fetchTokenIdsForSlug(
  slug: string
): Promise<{ upTokenId: string; downTokenId: string; conditionId: string }> {
  const url = `${GAMMA_API_BASE}/markets/slug/${slug}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Gamma API ${res.status} ${res.statusText} for slug=${slug}`);
  }
  const data = (await res.json()) as {
    outcomes?: unknown;
    clobTokenIds?: unknown;
    conditionId?: string;
  };
  const outcomes = parseJsonArray<string>(data.outcomes);
  const tokenIds = parseJsonArray<string>(data.clobTokenIds);
  const conditionId = typeof data.conditionId === "string" ? data.conditionId : "";
  const upIdx = outcomes.indexOf("Up");
  const downIdx = outcomes.indexOf("Down");
  if (upIdx < 0 || downIdx < 0) {
    throw new Error(`Missing Up/Down outcomes for slug=${slug} (outcomes: ${JSON.stringify(outcomes)})`);
  }
  if (!tokenIds[upIdx] || !tokenIds[downIdx]) {
    throw new Error(`Missing token ids for slug=${slug}`);
  }
  return {
    upTokenId: tokenIds[upIdx],
    downTokenId: tokenIds[downIdx],
    conditionId,
  };
}

/** Cache: slug -> token IDs. Slug changes every 15m, so we avoid 1 Gamma request per poll. */
let tokenIdsCache: { slug: string; upTokenId: string; downTokenId: string } | null = null;

/** Get Up/Down token IDs for a slug (cached per slug). Exported for order placement. */
export async function getTokenIdsForSlugCached(
  slug: string
): Promise<{ upTokenId: string; downTokenId: string }> {
  const c = tokenIdsCache;
  if (c && c.slug === slug) return { upTokenId: c.upTokenId, downTokenId: c.downTokenId };
  const fresh = await fetchTokenIdsForSlug(slug);
  tokenIdsCache = { slug, upTokenId: fresh.upTokenId, downTokenId: fresh.downTokenId };
  return { upTokenId: fresh.upTokenId, downTokenId: fresh.downTokenId };
}

/** Get best ask (lowest sell price) from CLOB book for one token (price 0–1). */
async function getBestAskForToken(tokenId: string): Promise<number | null> {
  const url = `${CLOB_API_BASE}/book?token_id=${encodeURIComponent(tokenId)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { asks?: Array<{ price: string; size: string }> };
  const asks = data.asks;
  if (!Array.isArray(asks) || asks.length === 0) return null;
  let best = Infinity;
  for (const level of asks) {
    const p = parseFloat(level.price);
    if (Number.isFinite(p) && p < best) best = p;
  }
  return best === Infinity ? null : best;
}

/** Polymarket ask prices for Bitcoin 15m up/down (prices 0–1). */
export interface PolymarketPrices {
  slug: string;
  /** Best ask for Up token (0–1). */
  upAsk: number;
  /** Best ask for Down token (0–1). */
  downAsk: number;
  fetchedAt: Date;
}

/**
 * Fetch current best ask for both Up and Down tokens for the active Bitcoin 15m market on Polymarket.
 */
export async function getPolymarketAskPrices(market: string = "btc"): Promise<PolymarketPrices | null> {
  const slug = slugForCurrent15m(market);
  try {
    const { upTokenId, downTokenId } = await getTokenIdsForSlugCached(slug);
    const [upAsk, downAsk] = await Promise.all([
      getBestAskForToken(upTokenId),
      getBestAskForToken(downTokenId),
    ]);
    if (upAsk == null || downAsk == null) return null;
    return {
      slug,
      upAsk,
      downAsk,
      fetchedAt: new Date(),
    };
  } catch {
    return null;
  }
}
