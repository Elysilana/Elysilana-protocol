// Market data layer. Pure logic with an injectable fetch so the gates can exercise it without a browser.
// The trending board reads ONLY the market-source record. The own-token row reads ONLY the contract record.
import { isStated, SOLANA_ADDR } from './register.js';

const sleepDefault = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getJSON(fetchFn, url, { timeout = 10000 } = {}) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
  try {
    const res = await fetchFn(url, ctl ? { signal: ctl.signal } : undefined);
    if (!res.ok) throw new Error('http ' + res.status);
    return await res.json();
  } finally { if (t) clearTimeout(t); }
}

// Exponential backoff: base, 2*base, 4*base ... capped.
export async function withBackoff(fn, { retries = 3, base = 800, max = 8000, sleep = sleepDefault } = {}) {
  let err;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(i); } catch (e) {
      err = e;
      if (i < retries) await sleep(Math.min(max, base * 2 ** i));
    }
  }
  throw err;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

export function pairToRow(pair, extra = {}) {
  const b = pair.baseToken || {};
  return {
    address: b.address,
    symbol: b.symbol || '?',
    name: b.name || b.symbol || '',
    logo: (pair.info && pair.info.imageUrl) || extra.icon || '',
    price: num(pair.priceUsd),
    change: num(pair.priceChange && pair.priceChange.h24),
    volume: num(pair.volume && pair.volume.h24),
    liquidity: num(pair.liquidity && pair.liquidity.usd),
    liqLabel: 'Liquidity',
    url: typeof pair.url === 'string' && pair.url.startsWith('https://dexscreener.com/') ? pair.url : '',
  };
}

// best pair per token = highest 24h volume
export function bestPairs(pairs) {
  const best = new Map();
  for (const p of pairs || []) {
    if (!p || p.chainId !== 'solana' || !p.baseToken || !p.baseToken.address) continue;
    const v = num(p.volume && p.volume.h24) || 0;
    const cur = best.get(p.baseToken.address);
    if (!cur || v > (num(cur.volume && cur.volume.h24) || 0)) best.set(p.baseToken.address, p);
  }
  return [...best.values()];
}

export function solanaBoostAddresses(boosts, cap = 30) {
  const seen = new Map();
  for (const b of Array.isArray(boosts) ? boosts : []) {
    if (b && b.chainId === 'solana' && b.tokenAddress && !seen.has(b.tokenAddress)) seen.set(b.tokenAddress, b);
  }
  return { addrs: [...seen.keys()].slice(0, cap), meta: seen };
}

export function rankTrending(pairs, meta = new Map(), limit = 10) {
  return bestPairs(pairs)
    .map((p) => pairToRow(p, { icon: meta.get(p.baseToken.address)?.icon }))
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
    .slice(0, limit);
}

export async function loadTrending(reg, fetchFn, opts = {}) {
  const rec = reg['market-source'];
  if (!isStated(rec)) return null; // inert: no request at all
  const boosts = await withBackoff(() => getJSON(fetchFn, rec.boosts), opts.backoff);
  const { addrs, meta } = solanaBoostAddresses(boosts);
  if (!addrs.length) return [];
  const url = rec.pairs.replace('{addresses}', addrs.join(','));
  const pairs = await withBackoff(() => getJSON(fetchFn, url), opts.backoff);
  return rankTrending(Array.isArray(pairs) ? pairs : [], meta, 10);
}

export function selectOwnPair(pairs, ca) {
  return (pairs || [])
    .filter((p) => p && p.baseToken && p.baseToken.address === ca)
    .sort((a, b) => (num(b.volume && b.volume.h24) || 0) - (num(a.volume && a.volume.h24) || 0))[0] || null;
}

export function ownLiquidity(pair) {
  const usd = num(pair && pair.liquidity && pair.liquidity.usd);
  if (usd > 0) return { value: usd, label: 'Liquidity' };
  const mc = num(pair && pair.marketCap);
  return Number.isFinite(mc) ? { value: mc, label: 'Mkt Cap' } : { value: NaN, label: 'Liquidity' };
}

export async function loadOwn(reg, fetchFn, { fallbackLogo = 'assets/logo-192.png', log = console.log, backoff } = {}) {
  const ca = reg.contract;
  if (!isStated(ca) || !SOLANA_ADDR.test(ca.value)) return null;
  const src = reg['own-token-source'];
  if (!isStated(src)) return null;
  const addr = ca.value;
  const [dex, pump] = await Promise.all([
    withBackoff(() => getJSON(fetchFn, src.dex.replace('{CA}', addr)), backoff).catch(() => null),
    getJSON(fetchFn, src.pump.replace('{CA}', addr)).catch(() => null), // logo is best effort
  ]);
  log('[elysilana] own token raw response', { dex, pump });
  const pair = selectOwnPair(dex && dex.pairs, addr);
  const row = pair ? pairToRow(pair) : { address: addr, symbol: 'ELYSILANA', name: 'ELYSILANA', price: NaN, change: NaN, volume: NaN, liquidity: NaN, url: '' };
  // pair.info.imageUrl comes from the DexScreener CDN, which is not reliable: never used for our own row
  row.logo = (pump && typeof pump.image_uri === 'string' && pump.image_uri.startsWith('https://') ? pump.image_uri : '') || fallbackLogo;
  row.fallbackLogo = fallbackLogo;
  row.address = addr;
  const liq = ownLiquidity(pair);
  log('[elysilana] own liquidity candidates', { usd: pair && pair.liquidity && pair.liquidity.usd, marketCap: pair && pair.marketCap, chosen: liq });
  row.liquidity = liq.value; row.liqLabel = liq.label;
  row.ok = !!pair;
  return row;
}

// Row #1 pinned, trending after it, own token removed from trending, 10 rows total.
export function composeBoard({ trending, own, ca, brandLogo = 'assets/elysilana-logo.png' }) {
  const list = (trending || []).filter((r) => !own || r.address !== own.address);
  const head = own
    ? { ...own, kind: 'own' }
    : { kind: 'placeholder', address: '', symbol: 'ELYSILANA', name: 'Contract pending', logo: brandLogo, price: 0, change: NaN, volume: NaN, liquidity: NaN, liqLabel: 'Liquidity', url: '' };
  return [head, ...list.slice(0, 9).map((r) => ({ ...r, kind: 'trend' }))];
}

export function sortRows(rows, key) {
  const [head, ...rest] = rows;
  const f = { volume: 'volume', change: 'change', liquidity: 'liquidity' }[key] || 'volume';
  rest.sort((a, b) => (Number.isFinite(b[f]) ? b[f] : -Infinity) - (Number.isFinite(a[f]) ? a[f] : -Infinity));
  return [head, ...rest];
}

export function boardStats(rows) {
  const live = rows.filter((r) => r.kind !== 'placeholder');
  const sum = (k) => live.reduce((s, r) => s + (Number.isFinite(r[k]) ? r[k] : 0), 0);
  const movers = live.filter((r) => Number.isFinite(r.change));
  const top = movers.sort((a, b) => b.change - a.change)[0];
  return { count: live.length, volume: sum('volume'), liquidity: sum('liquidity'), top: top ? { symbol: top.symbol, change: top.change } : null };
}
