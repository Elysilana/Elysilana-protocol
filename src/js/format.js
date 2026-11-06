// Number formatting. Values are stored raw in data-v and formatted here, so count-up can re-format every frame.
const nf = (min, max) => new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
const n0 = nf(0, 0), n2 = nf(2, 2), n4 = nf(4, 4);

export function fmtPrice(v) {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '$0.00';
  const a = Math.abs(v);
  if (a >= 1000) return '$' + n0.format(v);
  if (a >= 1) return '$' + n2.format(v);
  if (a >= 0.01) return '$' + n4.format(v);
  const dp = Math.min(12, Math.max(4, 2 - Math.floor(Math.log10(a))));
  return '$' + v.toFixed(dp);
}
export function fmtCompact(v) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const u = a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'K'] : [1, ''];
  const x = v / u[0];
  return '$' + (u[1] ? x.toFixed(Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 1 : 2) : x.toFixed(0)) + u[1];
}
export function fmtPct(v) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  return (v > 0 ? '+' : v < 0 ? '−' : '') + (a >= 1000 ? n0.format(a) : a.toFixed(2)) + '%';
}
export const fmtCount = (v) => (Number.isFinite(v) ? n0.format(Math.round(v)) : '—');
export const FORMATS = { price: fmtPrice, compact: fmtCompact, pct: fmtPct, count: fmtCount };

export const shortAddr = (a) => (a && a.length > 12 ? a.slice(0, 4) + '…' + a.slice(-4) : a || '');
// letter tile always carries at least two characters
export function letters(s) {
  const t = String(s || '').replace(/[^A-Za-z0-9]/g, '');
  if (t.length >= 2) return t.slice(0, 2).toUpperCase();
  return t ? t.toUpperCase() + t.toLowerCase() : '??';
}
