// Register pattern: one record per external fact. state: stated | absent | unconfirmed.
// Only a stated record may carry a value or url. Everything else renders inert.
export const STATES = ['stated', 'absent', 'unconfirmed'];
export const SOLANA_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const ADDRESS_SHAPES = [/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, /\b0x[0-9a-fA-F]{40}\b/g];

const HOSTS = { x: ['x.com', 'twitter.com'], github: ['github.com'] };
export function safeUrl(u, id) {
  try {
    const url = new URL(String(u));
    return url.protocol === 'https:' && (HOSTS[id] || [url.hostname]).includes(url.hostname.replace(/^www\./, ''));
  } catch { return false; }
}

export function normalize(raw) {
  const out = {};
  for (const [id, r] of Object.entries((raw && raw.records) || {})) {
    let state = STATES.includes(r.state) ? r.state : 'unconfirmed';
    if (id === 'contract' && state === 'stated' && !SOLANA_ADDR.test(String(r.value || ''))) state = 'unconfirmed';
    if ((id === 'x' || id === 'github') && state === 'stated' && !safeUrl(r.url, id)) state = 'unconfirmed';
    const rec = { id, label: r.label || id, state, checked: r.checked };
    // inert records never carry value or url
    if (state === 'stated') for (const k of Object.keys(r)) if (!(k in rec)) rec[k] = r[k];
    out[id] = rec;
  }
  return out;
}
export const isStated = (rec) => !!rec && rec.state === 'stated';

// Store the URL, derive the handle.
export function handleOf(rec) {
  if (!isStated(rec) || !rec.url) return '';
  return new URL(rec.url).pathname.split('/').filter(Boolean)[0] || '';
}

export async function loadRegister(fetchFn = fetch, url = './register.json') {
  const res = await fetchFn(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('register ' + res.status);
  return normalize(await res.json());
}
