// Motion layer: damped-spring solver, scroll reveal, parallax, spotlight, scroll progress, count-up.
// Every effect checks reduced motion first and falls back to the final state instantly.
import { FORMATS } from './format.js';

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: true, addEventListener() {} };
export const reduced = () => mq.matches;
mq.addEventListener && mq.addEventListener('change', () => { document.documentElement.dataset.motion = mq.matches ? 'off' : 'on'; });

// Damped harmonic oscillator, semi-implicit Euler on a fixed sub-step. Returns a cancel function.
export function spring(from, to, onUpdate, { k = 170, c = 19, m = 1, eps = 0.0008, onDone } = {}) {
  if (reduced()) { onUpdate(to); onDone && onDone(); return () => {}; }
  let x = from, v = 0, last = performance.now(), raf = 0, dead = false;
  const step = (now) => {
    if (dead) return;
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    while (dt > 0) {
      const h = Math.min(dt, 1 / 240);
      v += ((-k * (x - to) - c * v) / m) * h;
      x += v * h; dt -= h;
    }
    if (Math.abs(x - to) < eps && Math.abs(v) < eps) { onUpdate(to); onDone && onDone(); return; }
    onUpdate(x); raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => { dead = true; cancelAnimationFrame(raf); };
}

export function initReveal(root = document) {
  const els = [...root.querySelectorAll('[data-reveal]:not([data-revealed])')];
  if (reduced() || !('IntersectionObserver' in window)) { els.forEach((e) => (e.dataset.revealed = '1')); return; }
  const io = new IntersectionObserver((entries) => {
    const vis = entries.filter((e) => e.isIntersecting);
    vis.forEach((e, n) => {
      io.unobserve(e.target);
      const el = e.target, delay = (Number(el.dataset.stagger) || n) * 70;
      setTimeout(() => {
        el.dataset.revealed = '1';
        setTimeout(() => { el.style.opacity = ''; el.style.transform = ''; }, 1800); // safety net if frames are throttled
        spring(0, 1, (p) => { el.style.opacity = Math.max(0, Math.min(1, p)); el.style.transform = `translate3d(0,${(1 - p) * 26}px,0)`; },
          { onDone: () => { el.style.opacity = ''; el.style.transform = ''; } });
      }, delay);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((e) => io.observe(e));
  // if the observer never reports (throttled or headless renderer), show what is already in view
  setTimeout(() => els.forEach((e) => {
    if (e.dataset.revealed) return;
    const r = e.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) { io.unobserve(e); e.dataset.revealed = '1'; e.style.opacity = ''; e.style.transform = ''; }
  }), 2500);
}

export function initParallax(host) {
  if (!host) return;
  const layers = [...host.querySelectorAll('[data-depth]')];
  if (!layers.length || reduced()) return;
  const t = { px: 0, py: 0, sy: 0 }, cur = { px: 0, py: 0, sy: 0 };
  let raf = 0;
  const frame = () => {
    let moving = false;
    for (const k of ['px', 'py', 'sy']) {
      const d = t[k] - cur[k];
      if (Math.abs(d) > 0.05) { cur[k] += d * 0.09; moving = true; } else cur[k] = t[k];
    }
    for (const l of layers) {
      const z = Number(l.dataset.depth);
      l.style.transform = `translate3d(${(cur.px * z).toFixed(2)}px,${(cur.py * z + cur.sy * z * 0.6).toFixed(2)}px,0)`;
    }
    raf = moving ? requestAnimationFrame(frame) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  host.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect();
    t.px = ((e.clientX - r.left) / r.width - 0.5) * -40;
    t.py = ((e.clientY - r.top) / r.height - 0.5) * -40;
    kick();
  }, { passive: true });
  host.addEventListener('pointerleave', () => { t.px = 0; t.py = 0; kick(); });
  addEventListener('scroll', () => { const r = host.getBoundingClientRect(); t.sy = Math.max(-200, Math.min(200, -r.top)) * -0.25; kick(); }, { passive: true });
}

export function initSpotlight() {
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest && e.target.closest('[data-spot]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });
}

export function initProgress(bar) {
  if (!bar) return;
  let q = 0;
  const upd = () => {
    q = 0;
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
  };
  addEventListener('scroll', () => { if (!q) q = requestAnimationFrame(upd); }, { passive: true });
  addEventListener('resize', upd); upd();
}

// Count a .num element to a new value; flash when it changed after first paint.
export function setNum(el, value, { first = false } = {}) {
  const fmt = FORMATS[el.dataset.fmt] || String;
  const prev = el.dataset.v === '' || el.dataset.v == null ? NaN : Number(el.dataset.v);
  el.dataset.v = Number.isFinite(value) ? value : '';
  if (el._cancel) el._cancel();
  if (!Number.isFinite(value)) { el.textContent = '—'; return; }
  if (reduced()) { el.textContent = fmt(value); return; }
  const from = first || !Number.isFinite(prev) ? 0 : prev;
  if (!first && prev === value) { el.textContent = fmt(value); return; }
  if (!first) {
    const cell = el.closest('.cell') || el;
    cell.classList.remove('flash-up', 'flash-down'); void cell.offsetWidth;
    cell.classList.add(value >= prev ? 'flash-up' : 'flash-down');
  }
  el._cancel = spring(0, 1, (p) => { el.textContent = fmt(from + (value - from) * Math.min(1, Math.max(0, p))); },
    { k: 120, c: 22, onDone: () => { el.textContent = fmt(value); } });
}
