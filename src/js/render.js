// Pure string renderers shared by the build (prerender) and the browser. No DOM needed.
import { isStated, handleOf } from './register.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ICONS = {
  // official X mark
  x: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  // official GitHub Octicon mark-github
  github: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>',
  copy: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path fill="currentColor" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>',
};

export function socialHTML(id, rec) {
  const label = rec ? rec.label : id;
  if (isStated(rec)) {
    return `<a class="icon-btn" data-social="${id}" data-state="stated" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)} @${esc(handleOf(rec))}">${ICONS[id]}</a>`;
  }
  return `<span class="icon-btn" data-social="${id}" data-state="inert" role="img" aria-disabled="true" aria-label="${esc(label)} pending">${ICONS[id]}</span>`;
}
export const socialsHTML = (reg) => socialHTML('x', reg.x) + socialHTML('github', reg.github);

export function caSlotHTML(rec) {
  if (isStated(rec)) {
    return `<div class="ca-slot" data-ca-state="stated"><span class="ca-label">Contract</span>` +
      `<button type="button" class="ca-value" data-copy="${esc(rec.value)}" aria-label="Copy contract address"><code>${esc(rec.value)}</code>` +
      `<span class="ca-hint" data-copy-hint>Copy</span></button></div>`;
  }
  return `<div class="ca-slot" data-ca-state="inert"><span class="ca-label">Contract</span>` +
    `<span class="ca-value" aria-disabled="true"><code>pending</code></span></div>`;
}

export function registerRowsHTML(reg) {
  const order = ['chain', 'market-source', 'contract', 'x', 'github'];
  return order.filter((id) => reg[id]).map((id) => {
    const r = reg[id];
    const stated = isStated(r);
    if (stated && (id === 'x' || id === 'github')) {
      return `<li class="reg-row" data-record="${id}" data-state="stated"><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer"><span class="reg-label">${esc(r.label)}</span><span class="reg-detail">@${esc(handleOf(r))}</span></a></li>`;
    }
    if (stated) {
      return `<li class="reg-row" data-record="${id}" data-state="stated"><span class="reg-label">${esc(r.label)}</span><span class="reg-detail">${esc(r.value)}</span></li>`;
    }
    return `<li class="reg-row" data-record="${id}" data-state="inert"><span class="reg-label">${esc(r.label)}</span><span class="reg-detail">pending</span></li>`;
  }).join('');
}

// ---- market rows ----
import { FORMATS, letters } from './format.js';

const cell = (cls, fmt, v, extra = '') => {
  const ok = Number.isFinite(v);
  return `<span class="cell ${cls}"${extra}><span class="num" data-fmt="${fmt}" data-v="${ok ? v : ''}">${ok ? FORMATS[fmt](v) : '—'}</span></span>`;
};
export function tileHTML(row) {
  if (row.logo) {
    return `<span class="tile"><img src="${esc(row.logo)}" alt="" width="40" height="40" loading="lazy" decoding="async" referrerpolicy="no-referrer"${row.fallbackLogo ? ` data-fallback="${esc(row.fallbackLogo)}"` : ''}></span>`;
  }
  return `<span class="tile tile-letters" aria-hidden="true">${esc(letters(row.symbol))}</span>`;
}
export function rowHTML(row, i = 0) {
  const ph = row.kind === 'placeholder';
  const dots = '· · · · ·';
  const name = `<span class="tile-wrap">${tileHTML(row)}</span><span class="row-name"><strong>${esc(row.symbol)}</strong><small>${esc(row.name || '')}</small></span>`;
  const main = row.url && !ph
    ? `<a class="row-main" href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">${name}</a>`
    : `<span class="row-main"${ph ? ' aria-disabled="true"' : ''}>${name}</span>`;
  const dir = Number.isFinite(row.change) ? (row.change > 0 ? 'up' : row.change < 0 ? 'down' : 'flat') : 'none';
  const liqTitle = row.liqLabel === 'Mkt Cap' ? ' title="Mkt Cap"' : '';
  let cells;
  if (ph) {
    cells = `<span class="cell price"><span class="num" data-fmt="price" data-v="0">$0.00</span></span>` +
      `<span class="cell chg" data-dir="none"><span class="dots">${dots}</span></span>` +
      `<span class="cell vol"><span class="dots">${dots}</span></span>` +
      `<span class="cell liq"><span class="dots">${dots}</span></span>`;
  } else {
    cells = cell('price', 'price', row.price) +
      `<span class="cell chg" data-dir="${dir}">${Number.isFinite(row.change) ? `<span class="arrow" aria-hidden="true">${row.change > 0 ? '▲' : row.change < 0 ? '▼' : '■'}</span>` : ''}<span class="num" data-fmt="pct" data-v="${Number.isFinite(row.change) ? row.change : ''}">${Number.isFinite(row.change) ? FORMATS.pct(row.change) : '—'}</span></span>` +
      cell('vol', 'compact', row.volume) + cell('liq', 'compact', row.liquidity, liqTitle);
  }
  const copy = !ph && row.address
    ? `<button type="button" class="copy" data-copy="${esc(row.address)}" aria-label="Copy address for ${esc(row.symbol)}">${ICONS.copy}<span class="copy-done" aria-hidden="true">Copied</span></button>`
    : `<span class="copy copy-off" aria-hidden="true"></span>`;
  return `<li class="row ${ph ? 'row-ph' : ''} ${row.kind === 'own' ? 'row-own' : ''}" data-key="${esc(row.address || 'own')}" data-kind="${row.kind || 'trend'}" data-spot style="--i:${i}">${main}${cells}${copy}</li>`;
}
export const skeletonRowsHTML = (n = 10) => Array.from({ length: n }, (_, i) =>
  `<li class="row row-skel" data-spot aria-hidden="true" style="--i:${i}"><span class="row-main"><span class="tile-wrap"><span class="tile skel"></span></span><span class="row-name"><span class="skel bar bar-a"></span><span class="skel bar bar-b"></span></span></span><span class="cell price"><span class="skel bar"></span></span><span class="cell chg"><span class="skel bar"></span></span><span class="cell vol"><span class="skel bar"></span></span><span class="cell liq"><span class="skel bar"></span></span><span class="copy copy-off"></span></li>`).join('');
