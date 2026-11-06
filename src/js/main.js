import { loadRegister, isStated } from './register.js';
import { socialsHTML, caSlotHTML, registerRowsHTML, rowHTML, skeletonRowsHTML, esc } from './render.js';
import { loadTrending, loadOwn, composeBoard, sortRows, boardStats } from './market.js';
import { FORMATS, fmtPct, letters } from './format.js';
import { initReveal, initParallax, initSpotlight, initProgress, setNum, reduced } from './motion.js';

const $ = (s, r = document) => r.querySelector(s);
const POLL_MS = 60000;
const state = { reg: null, regKey: '', trending: null, own: null, sort: 'volume', first: true, timer: 0, busy: false, failStreak: 0 };

// ---------- register-driven slots ----------
function paintRegister(reg) {
  const key = JSON.stringify(reg);
  if (key === state.regKey) return;
  state.regKey = key; state.reg = reg;
  $('#socials').innerHTML = socialsHTML(reg);
  $('#ca').innerHTML = caSlotHTML(reg.contract);
  $('#register-list').innerHTML = registerRowsHTML(reg);
  document.documentElement.dataset.ca = isStated(reg.contract) ? 'stated' : 'absent';
}
async function refreshRegister() {
  try { paintRegister(await loadRegister()); } catch (e) { /* keep what is painted */ }
}

// ---------- copy ----------
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} t.remove(); return ok;
  }
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  const ok = await copyText(b.dataset.copy);
  b.classList.toggle('copied', ok); b.classList.toggle('copy-failed', !ok);
  const hint = b.querySelector('[data-copy-hint]'); const prev = hint && hint.textContent;
  if (hint) hint.textContent = ok ? 'Copied' : 'Copy failed';
  const live = $('#toast'); if (live) live.textContent = ok ? 'Address copied' : 'Copy failed';
  clearTimeout(b._t);
  b._t = setTimeout(() => { b.classList.remove('copied', 'copy-failed'); if (hint) hint.textContent = prev || 'Copy'; if (live) live.textContent = ''; }, 1600);
});

// ---------- logos: fallback chain, then letter tile ----------
document.addEventListener('error', (e) => {
  const img = e.target; if (!(img instanceof HTMLImageElement) || !img.closest('.tile')) return;
  const fb = img.dataset.fallback;
  if (fb && !img.dataset.triedFallback) { img.dataset.triedFallback = '1'; img.src = fb; return; }
  const tile = img.closest('.tile'); const sym = img.closest('.row')?.querySelector('.row-name strong')?.textContent || '';
  tile.classList.add('tile-letters'); tile.textContent = letters(sym);
}, true);

// ---------- board ----------
const rowsEl = () => $('#rows');
function setStatus(kind) {
  const pill = $('#status'); if (!pill) return;
  pill.dataset.state = kind;
  pill.querySelector('.status-text').textContent = { live: 'Live', sync: 'Syncing', stale: 'Holding last data', off: 'Feed offline' }[kind];
}
function setNote(msg) { const n = $('#board-note'); n.textContent = msg || ''; n.hidden = !msg; }

function buildRows() {
  const ca = state.reg && state.reg.contract;
  const rows = composeBoard({ trending: state.trending || [], own: state.own, ca: isStated(ca) ? ca.value : null });
  return sortRows(rows, state.sort);
}
function fillRowNums(li, row, first) {
  const vals = { price: row.price, chg: row.change, vol: row.volume, liq: row.liquidity };
  for (const [cls, v] of Object.entries(vals)) {
    const num = li.querySelector(`.cell.${cls} .num`); if (num) setNum(num, v, { first });
  }
  const chg = li.querySelector('.cell.chg');
  if (chg) { chg.dataset.dir = Number.isFinite(row.change) ? (row.change > 0 ? 'up' : row.change < 0 ? 'down' : 'flat') : 'none';
    const a = chg.querySelector('.arrow'); if (a) a.textContent = row.change > 0 ? '▲' : row.change < 0 ? '▼' : '■'; }
}
function renderBoard() {
  const host = rowsEl(); const rows = buildRows();
  const wasSkeleton = host.querySelector('.row-skel');
  if (state.trending === null && !state.own && !state.reg) return;
  const existing = new Map([...host.children].filter((li) => !li.classList.contains('row-skel')).map((li) => [li.dataset.key + '|' + li.dataset.kind, li]));
  if (wasSkeleton) host.innerHTML = '';
  const frag = [];
  rows.forEach((row, i) => {
    const k = (row.address || 'own') + '|' + row.kind;
    let li = existing.get(k);
    if (li) { existing.delete(k); fillRowNums(li, row, false); li.style.setProperty('--i', i); }
    else {
      const t = document.createElement('template'); t.innerHTML = rowHTML(row, i).trim(); li = t.content.firstElementChild;
      li.classList.add('row-enter'); fillRowNums(li, row, true);
      li.querySelectorAll('.num').forEach((n) => { if (!reduced() && n.dataset.v !== '') n.textContent = FORMATS[n.dataset.fmt](0); });
    }
    frag.push(li);
  });
  existing.forEach((li) => li.remove());
  frag.forEach((li) => host.appendChild(li));
  renderStats(rows); renderTicker(rows);
}
function renderStats(rows) {
  const s = boardStats(rows);
  const set = (id, v) => { const el = $(`#${id} .num`); if (el) setNum(el, v, { first: el.dataset.v === '' }); };
  set('stat-count', s.count); set('stat-volume', s.volume); set('stat-liq', s.liquidity);
  const top = $('#stat-top'); const val = top.querySelector('.num'); const sym = top.querySelector('.stat-sub');
  if (s.top) { setNum(val, s.top.change, { first: val.dataset.v === '' }); sym.textContent = s.top.symbol; } else { val.textContent = '—'; sym.textContent = ''; }
  document.querySelectorAll('.stat.is-skel').forEach((e) => e.classList.remove('is-skel'));
  const c = $('#board-count'); if (c) c.textContent = String(s.count);
}
function renderTicker(rows) {
  const items = rows.filter((r) => r.kind !== 'placeholder' && Number.isFinite(r.change));
  if (!items.length) return;
  const one = items.map((r) => `<span class="tick" data-dir="${r.change > 0 ? 'up' : r.change < 0 ? 'down' : 'flat'}"><b>${esc(r.symbol)}</b><span>${FORMATS.price(r.price)}</span><i>${fmtPct(r.change)}</i></span>`).join('');
  const track = $('#ticker-track');
  track.innerHTML = `<div class="tick-set">${one}</div><div class="tick-set" aria-hidden="true">${one}</div>`;
  track.closest('.ticker').classList.remove('is-skel');
}

function showFailureRows() {
  const host = rowsEl();
  if (!host.querySelector('.row-skel')) return;
  const dash = { kind: 'trend', symbol: '—', name: '', price: NaN, change: NaN, volume: NaN, liquidity: NaN, liqLabel: 'Liquidity' };
  const rows = composeBoard({ trending: [], own: state.own });
  host.innerHTML = rows.concat(Array.from({ length: 9 }, () => dash)).slice(0, 10).map((r, i) => rowHTML(r, i)).join('');
}

// ---------- poll ----------
async function cycle() {
  if (state.busy) return; state.busy = true;
  clearTimeout(state.timer);
  setStatus(state.trending ? 'sync' : 'sync');
  await refreshRegister();
  const reg = state.reg;
  const [t, o] = await Promise.allSettled([
    loadTrending(reg, fetch),
    isStated(reg.contract) ? loadOwn(reg, fetch) : Promise.resolve(null),
  ]);
  let failed = 0;
  if (t.status === 'fulfilled') { if (t.value) state.trending = t.value; } else failed++;
  if (o.status === 'fulfilled') state.own = o.value; else failed++;
  if (!isStated(reg.contract)) state.own = null;
  const haveData = state.trending !== null;
  if (failed && !haveData) { state.failStreak++; showFailureRows(); setNote('Price feed unreachable. Retrying shortly.'); setStatus('off'); }
  else if (failed) { state.failStreak++; setNote('Feed hiccup. Showing the last good numbers.'); setStatus('stale'); renderBoard(); }
  else { state.failStreak = 0; setNote(''); setStatus('live'); renderBoard(); }
  if (haveData && !failed || haveData) state.first = false;
  state.busy = false;
  schedule();
}
function schedule() {
  clearTimeout(state.timer);
  if (document.hidden) return; // paused while hidden
  const wait = state.failStreak ? Math.min(POLL_MS, 4000 * 2 ** (state.failStreak - 1)) : POLL_MS;
  state.timer = setTimeout(cycle, wait);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(state.timer); else cycle();
});

// ---------- sort tabs ----------
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-sort]'); if (!b) return;
  state.sort = b.dataset.sort;
  document.querySelectorAll('[data-sort]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  if (state.trending) renderBoard();
});

// ---------- boot ----------
$('#rows').innerHTML = skeletonRowsHTML(10);
initProgress($('#progress'));
initSpotlight();
initParallax($('#hero'));
initReveal();
cycle();
