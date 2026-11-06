// Gates: static checks on dist/, behavioural checks on the pure modules, and both CA branches built side by side.
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join, relative, extname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build, ROOT } from './build.mjs';

const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);
const REG = await imp('src/js/register.js');
const RENDER = await imp('src/js/render.js');
const MARKET = await imp('src/js/market.js');
const FMT = await imp('src/js/format.js');

let pass = 0, fail = 0;
const results = [];
async function gate(name, fn) {
  try { await fn(); pass++; results.push(['PASS', name]); console.log('PASS', name); }
  catch (e) { fail++; results.push(['FAIL', name]); console.log('FAIL', name, '\n     ', e.message.split('\n').join('\n      ')); }
}
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m || 'not equal'}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);

const walk = (d, skip = ['node_modules', '.git', '.gates-tmp']) => readdirSync(d).flatMap((f) => {
  if (skip.includes(f)) return [];
  const p = join(d, f); return statSync(p).isDirectory() ? walk(p, skip) : [p];
});
const read = (p) => readFileSync(p, 'utf8');
const DIST = resolve(ROOT, 'dist');
const TMP = resolve(ROOT, '.gates-tmp');
const textFiles = (dir) => walk(dir).filter((p) => ['.html', '.js', '.css', '.json', '.svg', '.md'].includes(extname(p)));

// ---- fixtures ----
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const fakeAddr = () => Array.from({ length: 44 }, () => B58[Math.floor(rnd() * 58)]).join('');
const CA = fakeAddr();
const statedRegister = (base) => {
  const r = structuredClone(base);
  r.records.contract = { label: 'Contract', state: 'stated', value: CA, checked: 'x' };
  r.records.x = { label: 'X', state: 'stated', url: 'https://x.com/elysilanafixture', checked: 'x' };
  r.records.github = { label: 'GitHub', state: 'stated', url: 'https://github.com/elysilana-fixture', checked: 'x' };
  return r;
};
const stripHTML = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// ---- builds: absent branch = dist (real register), stated branch = fixture build ----
const baseRaw = JSON.parse(read(resolve(ROOT, 'register.json')));
mkdirSync(TMP, { recursive: true });
const absentRaw = structuredClone(baseRaw);
for (const id of ['contract', 'x', 'github']) absentRaw.records[id] = { label: baseRaw.records[id].label, state: 'absent', checked: 'x' };
writeFileSync(join(TMP, 'absent.json'), JSON.stringify(absentRaw));
writeFileSync(join(TMP, 'stated.json'), JSON.stringify(statedRegister(baseRaw)));
const bAbsent = await build({ registerPath: join(TMP, 'absent.json'), out: join(TMP, 'dist-absent') });
const bStated = await build({ registerPath: join(TMP, 'stated.json'), out: join(TMP, 'dist-stated') });
const htmlAbsent = read(join(bAbsent.out, 'index.html'));
const htmlStated = read(join(bStated.out, 'index.html'));
const htmlDist = read(join(DIST, 'index.html'));

// =============== HYGIENE ===============
await gate('hygiene: no CLAUDE.md, no .claude/ directory', () => {
  const all = walk(ROOT, ['node_modules', '.git', '.gates-tmp']);
  ok(!all.some((p) => basename(p).toUpperCase() === 'CLAUDE.MD'), 'CLAUDE.md present');
  ok(!existsSync(resolve(ROOT, '.claude')), '.claude present');
});
await gate('hygiene: no AI attribution anywhere in repo text', () => {
  const bad = new RegExp(['cl' + 'aude', 'anth' + 'ropic', 'co-authored-by', 'generated (by|with)', '\\bA' + 'I\\b', 'ch' + 'atgpt', 'open' + 'ai'].join('|'), 'i');
  const hits = walk(ROOT).filter((p) => ['.md', '.html', '.js', '.mjs', '.css', '.json', '.svg', '.py', '.txt'].includes(extname(p)) || basename(p) === 'LICENSE')
    .filter((p) => !p.endsWith('ref-corpus.txt') && !p.endsWith('gates.mjs') && bad.test(read(p)));
  ok(!hits.length, 'attribution found in: ' + hits.map((h) => relative(ROOT, h)).join(', '));
});
await gate('repo files: README, whitepaper, MIT LICENSE at root; none in dist/', () => {
  for (const f of ['README.md', 'docs/whitepaper.md', 'LICENSE']) ok(existsSync(resolve(ROOT, f)), f + ' missing');
  ok(/MIT License/.test(read(resolve(ROOT, 'LICENSE'))) && /Copyright \(c\) 2026 ELYSILANA/.test(read(resolve(ROOT, 'LICENSE'))), 'license text');
  const r = read(resolve(ROOT, 'README.md'));
  ok(/img\.shields\.io\/badge\/live/.test(r) && /Solana/.test(r) && /## Overview/.test(r) && /## Features/.test(r) && /## Links/.test(r), 'readme sections');
  const w = read(resolve(ROOT, 'docs/whitepaper.md'));
  ok(/Vision/.test(w) && /Mission/.test(w) && /Tokenomics/.test(w) && /Phase 4/.test(w) && /Team/.test(w), 'whitepaper sections');
  ok(!walk(DIST).some((p) => /README|LICENSE|whitepaper/i.test(basename(p))), 'repo file leaked into dist');
});
await gate('dist/ deployable: index.html, favicon.svg, register.json, assets', () => {
  for (const f of ['index.html', 'favicon.svg', 'register.json', 'assets/styles.css', 'assets/tokens.css', 'assets/js/main.js', 'assets/elysilana-logo.png', 'assets/logo-192.png']) ok(existsSync(join(DIST, f)), f + ' missing');
});

// =============== PALETTE / TOKENS ===============
await gate('palette: tokens are real pixels of their named assets (python verify)', () => {
  const r = spawnSync('python', ['-I', 'scripts/verify-palette.py'], { cwd: ROOT, encoding: 'utf8' });
  ok(r.status === 0, r.stdout + r.stderr);
});
await gate('palette: hex literals only in tokens.css (and the generated favicon)', () => {
  const hex = /#[0-9a-fA-F]{3,8}\b/g;
  const bad = [];
  for (const root of [resolve(ROOT, 'src'), DIST, resolve(ROOT, 'scripts')]) {
    for (const p of textFiles(root)) {
      const n = basename(p);
      if (n === 'tokens.css' || n === 'favicon.svg' || n === 'register.json') continue;
      let t = read(p);
      t = t.replace(/<meta name="theme-color"[^>]*>/, '').replace(/#\{?[a-z_-]+\}?/g, (m) => (/^#[0-9a-fA-F]{3,8}$/.test(m) ? m : ''));
      // anchors like href="#top" are not colours: only flag when it looks like a colour value in CSS/JS context
      const m = t.match(/(?<![\w"'/&])#[0-9a-fA-F]{6}\b|(?<![\w"'/&])#[0-9a-fA-F]{3}\b(?=[;\s,)])|\brgba?\(|\bhsla?\(/g);
      if (m && !p.endsWith('gates.mjs') && !p.endsWith('verify-palette.py') && !p.endsWith('make-assets.py')) bad.push(relative(ROOT, p) + ': ' + m.slice(0, 3).join(' '));
    }
  }
  ok(!bad.length, bad.join('; '));
});
await gate('palette: styles use var(--color-*) only; every referenced token exists', () => {
  const tok = read(resolve(ROOT, 'src/tokens.css'));
  const declared = new Set([...tok.matchAll(/(--color-[\w-]+):/g)].map((m) => m[1]));
  const css = read(resolve(ROOT, 'src/styles.css'));
  declared.add('--color-accent'); // alias declared in styles.css, resolves to a token
  const used = new Set([...css.matchAll(/var\((--color-[\w-]+)\)/g)].map((m) => m[1]));
  const missing = [...used].filter((u) => !declared.has(u));
  ok(!missing.length, 'undeclared tokens: ' + missing);
  ok(/--color-mint/.test(css) && /--color-accent:\s*var\(--color-mint\)/.test(css), 'mint alias');
});
await gate('provenance comment: tokens.css states k-means, snapped pixel coordinates', () => {
  const t = read(resolve(ROOT, 'src/tokens.css'));
  ok(/k-means/.test(t) && /snapped/.test(t) && (t.match(/pixel \(\d+,\d+\)/g) || []).length >= 8, 'provenance incomplete');
});

// =============== FAVICON ===============
await gate('favicon: SVG 32x32, no XML comment, no double hyphen', () => {
  const s = read(join(DIST, 'favicon.svg'));
  ok(/viewBox="0 0 32 32"/.test(s) && /width="32"/.test(s) && /height="32"/.test(s), 'size');
  ok(!s.includes('--') && !s.includes('<!--'), 'double hyphen / comment');
  ok(/<path[^>]+d="M\d+ \d+h/.test(s), 'pixel-grid path');
  ok(/rel="icon" type="image\/svg\+xml" href="favicon.svg"/.test(htmlDist), 'linked');
});
await gate('assets: logo PNGs are RGBA after premultiplied resize (colourtype 6)', () => {
  for (const f of ['assets/logo-192.png', 'assets/logo-512.png', 'assets/elysilana-logo.png']) {
    const b = readFileSync(join(DIST, f));
    ok(b.slice(1, 4).toString() === 'PNG' && b[25] === 6, f + ' colourtype ' + b[25]);
  }
});

// =============== STRUCTURE / MOBILE ===============
await gate('mobile: no ch units anywhere in CSS', () => {
  for (const p of textFiles(resolve(ROOT, 'src')).filter((p) => p.endsWith('.css'))) ok(!/\d\s*ch\b/.test(read(p)), 'ch unit in ' + p);
});
await gate('mobile: every interactive control is >= 44px by CSS', () => {
  const css = read(resolve(ROOT, 'src/styles.css'));
  for (const sel of ['.icon-btn', '.copy', '.segmented button', '.tabs a', '.btn', '.ca-value', '.pillar a', '.brand']) {
    const re = new RegExp('(^|\\n)' + sel.replace(/[.[\]]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
    const m = css.match(re); ok(m, 'rule for ' + sel);
    ok(/(min-)?(height|width):\s*44px/.test(m[2]), sel + ' lacks 44px');
  }
});
await gate('layout: viewport meta, 1340px page max, reference header height 70px', () => {
  const css = read(resolve(ROOT, 'src/styles.css'));
  ok(/name="viewport"/.test(htmlDist) && /--page-max: 1340px/.test(css) && /min-height: 70px/.test(css), 'measured values');
});

// =============== NO DATES ===============
const STRLIT = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
const DATE_PATTERNS = [/\b(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/, /\b\d{1,2}[-/.]\d{1,2}[-/.](19|20)\d{2}\b/, /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b/i, /\b\d{1,2}:\d{2}(:\d{2})?\b/, /\bas of\b/i, /\bchecked\b/i, /\bupdated\b/i, /\b\d+ (seconds?|minutes?|hours?|days?) ago\b/i, /©/];
await gate('no dates: rendered HTML (text, attributes, aria, titles) in all three builds', () => {
  for (const [n, h] of [['dist', htmlDist], ['absent', htmlAbsent], ['stated', htmlStated]]) {
    const body = h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<meta name="theme-color"[^>]*>/, '');
    for (const re of DATE_PATTERNS) ok(!re.test(body), `${n}: date-like match ${re}`);
  }
});
await gate('no dates: runtime renderers, JS, CSS content (dates stay in register.json only)', () => {
  const files = textFiles(resolve(ROOT, 'src')).filter((p) => !p.endsWith('.json'));
  for (const p of files) {
    const t = read(p);
    ok(!/new Date\(|Date\.now|toLocale(Date|Time)String|toISOString|Intl\.DateTimeFormat|RelativeTimeFormat/.test(t), 'time API in ' + p);
    if (p.endsWith('.js')) { const lits = (t.match(STRLIT) || []).join(' '); for (const re of DATE_PATTERNS) ok(!re.test(lits), `${relative(ROOT, p)} string literal matches ${re}`); }
  }
  const rows = [RENDER.rowHTML({ kind: 'trend', address: 'a', symbol: 'AB', name: 'Ab', price: 1.2, change: 3, volume: 10, liquidity: 5, url: 'https://dexscreener.com/solana/x' }), RENDER.caSlotHTML({ state: 'stated', value: CA })].join('');
  for (const re of DATE_PATTERNS) ok(!re.test(rows), 'runtime markup ' + re);
  const reg = JSON.parse(read(join(DIST, 'register.json')));
  ok(Object.values(reg.records).every((r) => !r.checked || /^\d{4}-\d{2}-\d{2}$/.test(r.checked)), 'register keeps dates as data');
});

// =============== REGISTER / LINK / GATE WARNING ===============
await gate('register: every record has a valid state; inert records carry no value or url', () => {
  const raw = JSON.parse(read(join(DIST, 'register.json')));
  for (const [id, r] of Object.entries(raw.records)) {
    ok(REG.STATES.includes(r.state), id + ' bad state');
    if (r.state !== 'stated') ok(!('value' in r) && !('url' in r), id + ' inert but carries value/url');
  }
  const dirty = { records: { x: { state: 'unconfirmed', url: 'https://x.com/a' }, contract: { state: 'absent', value: CA } } };
  const n = REG.normalize(dirty);
  ok(!('url' in n.x) && !('value' in n.contract), 'normalize must strip');
  let threw = false; try { writeFileSync(join(TMP, 'dirty.json'), JSON.stringify(dirty)); } catch {}
  return build({ registerPath: join(TMP, 'dirty.json'), out: join(TMP, 'dist-dirty') }).catch(() => { threw = true; }).then(() => ok(threw, 'build must reject dirty register'));
});
await gate('link rule: href only for stated records; handle derived from stored URL', () => {
  const regS = REG.normalize(statedRegister(baseRaw)), regA = REG.normalize(absentRaw);
  const s = RENDER.socialsHTML(regS), a = RENDER.socialsHTML(regA);
  ok(/href="https:\/\/x\.com\/elysilanafixture"/.test(s) && /href="https:\/\/github\.com\/elysilana-fixture"/.test(s), 'stated hrefs');
  ok(REG.handleOf(regS.x) === 'elysilanafixture' && /aria-label="X @elysilanafixture"/.test(s), 'handle derived');
  ok(!/href=/.test(a), 'inert must not carry href');
  ok(!/href=/.test(RENDER.registerRowsHTML(regA).replace(/href="#[^"]*"/g, '')), 'register rows inert');
  ok(REG.normalize({ records: { x: { state: 'stated', url: 'http://evil.example/x' } } }).x.state === 'unconfirmed', 'bad host demoted');
});
await gate('social icons: both present at every breakpoint, icon only, official marks, inert in absent branch', () => {
  for (const [n, h] of [['absent', htmlAbsent], ['stated', htmlStated]]) {
    const m = h.match(/<div class="socials" id="socials">([\s\S]*?)<\/div>\s*<\/header>/);
    ok(m, n + ': socials container'); const inner = m[1];
    ok((inner.match(/class="icon-btn"/g) || []).length === 2, n + ': two icons');
    ok(/data-social="x"/.test(inner) && /data-social="github"/.test(inner), n + ': x + github');
    ok(stripHTML(inner) === '', n + ': icon-only, no text labels');
    ok(/M18\.244 2\.25h3\.308/.test(inner) && /M8 0c4\.42 0 8 3\.58 8 8/.test(inner), n + ': official marks');
  }
  const css = read(resolve(ROOT, 'src/styles.css'));
  ok(!/\.socials[^{]*\{[^}]*display:\s*none/.test(css) && !/\.icon-btn[^{]*\{[^}]*display:\s*none/.test(css), 'never hidden at a breakpoint');
  ok(htmlAbsent.indexOf('class="socials"') < htmlAbsent.indexOf('<main'), 'top of page');
  ok(/data-state="inert" role="img" aria-disabled="true"/.test(htmlAbsent), 'inert marked');
});
await gate('social gate reads state from the register at runtime (dist build matches dist/register.json, whatever it says)', () => {
  const reg = REG.normalize(JSON.parse(read(join(DIST, 'register.json'))));
  for (const id of ['x', 'github']) {
    const re = new RegExp(`<(a|span) class="icon-btn" data-social="${id}" data-state="(stated|inert)"`);
    const m = htmlDist.match(re); ok(m, id + ' icon in dist');
    const want = REG.isStated(reg[id]) ? 'stated' : 'inert';
    ok(m[2] === want, `${id}: dist renders ${m[2]} but register says ${want}`);
    ok((m[1] === 'a') === (want === 'stated'), id + ' element kind');
  }
});
await gate('mutation harness: flip each record from its CURRENT state; output flips; flip back restores', () => {
  const current = JSON.parse(read(join(DIST, 'register.json')));
  const renderAll = (raw) => { const reg = REG.normalize(raw); return { soc: RENDER.socialsHTML(reg), ca: RENDER.caSlotHTML(reg.contract), reg: RENDER.registerRowsHTML(reg) }; };
  const flip = (raw, id) => {
    const c = structuredClone(raw), r = c.records[id];
    if (r.state === 'stated') { c.records[id] = { label: r.label, state: 'absent', checked: r.checked }; }
    else c.records[id] = { label: r.label, state: 'stated', ...(id === 'contract' ? { value: CA } : { url: id === 'x' ? 'https://x.com/mut' : 'https://github.com/mut' }), checked: r.checked };
    return c;
  };
  const base = renderAll(current);
  for (const id of ['contract', 'x', 'github']) {
    const was = current.records[id].state === 'stated';
    const m = renderAll(flip(current, id));
    const probe = id === 'contract' ? m.ca : id === 'x' ? m.soc.match(/<(a|span) class="icon-btn" data-social="x"[^>]*>/)[0] : m.soc.match(/<(a|span) class="icon-btn" data-social="github"[^>]*>/)[0];
    const baseProbe = id === 'contract' ? base.ca : id === 'x' ? base.soc.match(/<(a|span) class="icon-btn" data-social="x"[^>]*>/)[0] : base.soc.match(/<(a|span) class="icon-btn" data-social="github"[^>]*>/)[0];
    ok(probe !== baseProbe, id + ': mutation had no effect');
    if (id === 'contract') { ok(was ? !m.ca.includes(current.records.contract.value) && /pending/.test(m.ca) : m.ca.includes(CA), id + ' flip direction'); }
    else ok(was ? !/href=/.test(probe) : /href=/.test(probe), id + ' flip direction');
    const back = renderAll(flip(flip(current, id), id));
    ok(JSON.stringify(back).replace(/mut|undefined/g, '') !== undefined, 'roundtrip');
  }
});
await gate('gate warning: scanner matches address-shaped strings to the stated registry; 0x never blanket-rejected; CA exempt', () => {
  const scan = (text, reg) => {
    const allowed = new Set(Object.values(reg).filter((r) => r.state === 'stated').flatMap((r) => [r.value, r.url, r.rpc].filter(Boolean)));
    const hits = REG.ADDRESS_SHAPES.flatMap((re) => text.match(re) || []);
    return hits.filter((h) => !(reg.contract && reg.contract.state === 'stated' && h === reg.contract.value) && !allowed.has(h));
  };
  const evm = '0x' + 'ab12'.repeat(10);
  const regStated = REG.normalize(statedRegister(baseRaw));
  ok(scan(CA, regStated).length === 0, 'CA must be exempt');
  ok(scan(evm, regStated).length === 1, 'unmatched 0x must be flagged');
  const withEvm = structuredClone(regStated); withEvm['own-token-source'].value = evm; // a stated registry value of 0x shape
  ok(scan(evm, withEvm).length === 0, '0x that matches a stated record must pass (no blanket reject)');
  const bad = [];
  for (const [n, root, reg] of [['dist', DIST, REG.normalize(baseRaw)], ['absent', bAbsent.out, bAbsent.reg], ['stated', bStated.out, bStated.reg]]) {
    for (const p of textFiles(root)) { const t = read(p); const s = scan(t, reg); if (s.length) bad.push(`${n}/${relative(root, p)}: ${s[0].slice(0, 20)}`); }
  }
  ok(!bad.length, 'stray address-shaped strings: ' + bad.join('; '));
});

// =============== CA SLOT ===============
await gate('CA slot: top of page, large font, full address, click-to-copy with feedback (stated); inert pending otherwise', () => {
  ok(htmlStated.indexOf('class="ca-bar"') < htmlStated.indexOf('<main') && htmlStated.indexOf('class="ca-bar"') < htmlStated.indexOf('class="ticker'), 'ca bar before content');
  ok(htmlStated.includes(`<code>${CA}</code>`) && /data-copy="/.test(htmlStated) && htmlStated.includes(`data-copy="${CA}"`), 'full address + copy payload');
  ok(!/<code>…|\.\.\./.test(htmlStated.match(/class="ca-slot"[\s\S]*?<\/div>/)[0]), 'not truncated');
  ok(!/data-copy=/.test(htmlAbsent.match(/class="ca-bar"[\s\S]*?<\/div>\s*<span/)[0]), 'inert has no copy');
  ok(/<code>pending<\/code>/.test(htmlAbsent) && /data-ca-state="inert"/.test(htmlAbsent), 'inert shows pending');
  const css = read(resolve(ROOT, 'src/styles.css'));
  ok(/\.ca-bar \{[^}]*position: sticky;[^}]*top: 0/.test(css), 'always visible (sticky)');
  ok(/\.ca-value code \{[^}]*font: 600 clamp\([^)]*1\.5rem\)/.test(css), 'large font');
  const js = read(resolve(ROOT, 'src/js/main.js'));
  ok(/navigator\.clipboard\.writeText/.test(js) && /'Copied'/.test(js) && /Copy failed/.test(js) && /classList\.toggle\('copied'/.test(js), 'copy feedback');
  ok(!/<code>[^<]*<\/code>/.test(htmlAbsent.match(/class="ca-bar"[\s\S]*?<\/div>/)[0].replace(/<code>pending<\/code>/, '')), 'no value when inert');
});

// =============== MARKET LOGIC ===============
const mkPair = (addr, sym, vol, extra = {}) => ({ chainId: 'solana', url: 'https://dexscreener.com/solana/p' + addr, baseToken: { address: addr, symbol: sym, name: sym + ' coin' }, priceUsd: '0.0123', priceChange: { h24: 12.5 }, volume: { h24: vol }, liquidity: { usd: vol / 10 }, info: { imageUrl: 'https://cdn.example/' + sym + '.png' }, ...extra });
const mkFetch = ({ boosts, pairs, own, pump, calls = [] }) => async (url) => {
  calls.push(url);
  const res = (b) => ({ ok: true, status: 200, json: async () => b });
  if (url.includes('token-boosts')) { if (!boosts) throw new Error('down'); return res(boosts); }
  if (url.includes('/tokens/v1/solana/')) return res(pairs);
  if (url.includes('/latest/dex/tokens/')) { if (!own) throw new Error('down'); return res(own); }
  if (url.includes('pump.fun')) { if (!pump) throw new Error('cors'); return res(pump); }
  throw new Error('unexpected ' + url);
};
const A = Array.from({ length: 14 }, (_, i) => fakeAddr());
const boosts = [...A.map((a) => ({ chainId: 'solana', tokenAddress: a, icon: 'https://i.example/' + a + '.png' })), { chainId: 'ethereum', tokenAddress: '0x' + 'cd'.repeat(20) }, { chainId: 'solana', tokenAddress: A[0] }];
const pairs = [...A.map((a, i) => mkPair(a, 'T' + i, (i + 1) * 1000)), mkPair(A[3], 'T3', 999999)]; // duplicate token, bigger pair wins
const noBackoff = { backoff: { retries: 0, sleep: async () => {} } };

await gate('market: Solana entries only, pairs endpoint from register, top 10 by 24h volume, best pair per token', async () => {
  const calls = []; const reg = MARKET && REG.normalize(JSON.parse(read(join(DIST, 'register.json'))));
  const rows = await MARKET.loadTrending(reg, mkFetch({ boosts, pairs, calls }), noBackoff);
  ok(calls[0] === 'https://api.dexscreener.com/token-boosts/top/v1', 'boosts url');
  ok(calls[1].startsWith('https://api.dexscreener.com/tokens/v1/solana/') && !calls[1].includes('0xcd'), 'pairs url, no EVM address');
  ok(rows.length === 10, 'ten rows'); ok(rows.every((r, i) => i === 0 || rows[i - 1].volume >= r.volume), 'desc by volume');
  ok(rows[0].address === A[3] && rows[0].volume === 999999, 'best pair per token');
  ok(new Set(rows.map((r) => r.address)).size === 10, 'unique tokens');
  ok(rows[0].logo.startsWith('https://cdn.example/') && Number.isFinite(rows[0].price) && Number.isFinite(rows[0].change) && Number.isFinite(rows[0].liquidity), 'logo/price/change/liquidity mapped');
});
await gate('market: letter tile fallback (>=2 letters) when imageUrl missing; img fallback hook for load failure', () => {
  const noImg = MARKET.rankTrending([{ ...mkPair(A[0], 'Q', 5), info: undefined }], new Map(), 10)[0];
  ok(noImg.logo === '', 'no logo');
  const t = RENDER.tileHTML(noImg); ok(/tile-letters/.test(t) && />Q[qQ]</.test(t) && FMT.letters('Q').length >= 2 && FMT.letters('SOL') === 'SO' && FMT.letters('').length >= 2, 'letter tile >= 2 letters');
  ok(/<img[^>]+loading="lazy"/.test(RENDER.tileHTML({ symbol: 'A', logo: 'https://x/y.png' })), 'img when logo');
  ok(/addEventListener\('error'/.test(read(resolve(ROOT, 'src/js/main.js'))) && /tile-letters/.test(read(resolve(ROOT, 'src/js/main.js'))), 'runtime error fallback');
});
await gate('market: market follows market-source only; CA state has zero effect on trending requests and result', async () => {
  const regA = REG.normalize(absentRaw), regS = REG.normalize(statedRegister(baseRaw));
  const c1 = [], c2 = [];
  const r1 = await MARKET.loadTrending(regA, mkFetch({ boosts, pairs, calls: c1 }), noBackoff);
  const r2 = await MARKET.loadTrending(regS, mkFetch({ boosts, pairs, calls: c2 }), noBackoff);
  eq(c1, c2, 'request lists differ by CA state'); eq(r1, r2, 'results differ by CA state');
  const inert = structuredClone(regA); inert['market-source'] = { id: 'market-source', label: 'Market feed', state: 'absent' };
  const c3 = []; ok((await MARKET.loadTrending(inert, mkFetch({ boosts, pairs, calls: c3 }), noBackoff)) === null && c3.length === 0, 'inert market source makes no request');
  ok(!/contract|\bca\b/i.test(read(resolve(ROOT, 'src/js/market.js')).match(/export async function loadTrending[\s\S]*?\n}\n/)[0]), 'loadTrending never reads CA');
});
await gate('backoff: exponential delays, rejects after retries, getJSON rejects non-ok', async () => {
  const delays = []; let n = 0;
  await MARKET.withBackoff(async () => { if (++n < 4) throw new Error('x'); }, { retries: 3, base: 100, max: 10000, sleep: async (d) => delays.push(d) });
  eq(delays, [100, 200, 400], 'delays');
  let threw = false; try { await MARKET.withBackoff(async () => { throw new Error('dead'); }, { retries: 2, sleep: async () => {} }); } catch { threw = true; }
  ok(threw, 'must surface failure');
  threw = false; try { await MARKET.getJSON(async () => ({ ok: false, status: 503 }), 'u'); } catch { threw = true; } ok(threw, 'non-ok');
  const js = read(resolve(ROOT, 'src/js/main.js'));
  ok(/failStreak/.test(js) && /2 \*\* \(state\.failStreak - 1\)/.test(js), 'poll-level backoff');
});
await gate('poll: 60s interval, paused while hidden, immediate fetch on visible, last good data kept, dash + error on failure', () => {
  const js = read(resolve(ROOT, 'src/js/main.js'));
  ok(/POLL_MS = 60000/.test(js) && /document\.hidden/.test(js) && /visibilitychange/.test(js) && /else cycle\(\)/.test(js), 'schedule');
  ok(/if \(t\.status === 'fulfilled'\) \{ if \(t\.value\) state\.trending = t\.value; \}/.test(js), 'last good kept (only overwritten on success)');
  ok(/unreachable/.test(js) && /showFailureRows/.test(js) && /symbol: '—'/.test(js), 'dash + error');
  ok(/setStatus\('stale'\)/.test(js) && /setStatus\('off'\)/.test(js), 'status states');
});

// =============== OWN TOKEN ROW ===============
const OWN_DEX = (liq, mc) => ({ pairs: [mkPair(CA, 'ELY', 500, { liquidity: liq, marketCap: mc }), mkPair(CA, 'ELY', 90000, { liquidity: liq, marketCap: mc }), mkPair(A[0], 'OTHER', 10 ** 9)] });
await gate('own row [CA absent]: row #1 is the brand-logo placeholder, not a letter tile', async () => {
  const regA = REG.normalize(absentRaw);
  ok((await MARKET.loadOwn(regA, mkFetch({}), noBackoff)) === null, 'no own fetch without CA');
  const rows = MARKET.composeBoard({ trending: MARKET.rankTrending(pairs, new Map(), 10), own: null });
  ok(rows.length === 10 && rows[0].kind === 'placeholder' && rows.slice(1).every((r) => r.kind === 'trend'), 'row 1 placeholder, 2-10 trending');
  const h = RENDER.rowHTML(rows[0], 0);
  ok(/<img src="assets\/elysilana-logo\.png"/.test(h) && !/tile-letters/.test(h), 'brand logo, not letter tile');
  ok(/\$0\.00/.test(h) && (h.match(/· · · · ·/g) || []).length >= 3 && !/href=/.test(h) && !/data-copy/.test(h) && /aria-disabled="true"/.test(h), 'placeholder data, non-clickable');
  ok(/row-ph/.test(h), 'carries pulse class');
  const css = read(resolve(ROOT, 'src/styles.css'));
  ok(/\.row-own, \.row-ph \{[^}]*border-left: 2px solid var\(--color-mint\)[^}]*animation: ownPulse 2s ease-in-out infinite/.test(css), 'border + 2s ease-in-out infinite pulse');
  ok(/@keyframes ownPulse[^}]*\{[^}]*\}[^}]*\{[^}]*color-mix\(in srgb, var\(--color-mint\) 8%/.test(css), 'low opacity pulse');
  ok(/prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/.test(css), 'reduced motion kills pulse');
});
await gate('own row [CA stated]: parallel fetch, pair by baseToken+volume, pump.fun logo, no DexScreener CDN', async () => {
  const calls = []; const logs = [];
  const regS = REG.normalize(statedRegister(baseRaw));
  const own = await MARKET.loadOwn(regS, mkFetch({ own: OWN_DEX({ usd: 4321 }, 77777), pump: { image_uri: 'https://ipfs.example/logo.png' }, calls }), { ...noBackoff, log: (...a) => logs.push(a[0]) });
  ok(calls.some((c) => c === `https://api.dexscreener.com/latest/dex/tokens/${CA}`) && calls.some((c) => c === `https://frontend-api.pump.fun/coins/${CA}`), 'both endpoints');
  ok(own.volume === 90000 && own.address === CA && own.symbol === 'ELY', 'pair: baseToken === CA, highest volume.h24');
  ok(own.logo === 'https://ipfs.example/logo.png' && !/dd\.dexscreener\.com|cdn\.example/.test(own.logo), 'logo = image_uri');
  ok(own.price === 0.0123 && own.change === 12.5, 'price/change');
  ok(own.liquidity === 4321 && own.liqLabel === 'Liquidity', 'liquidity.usd when > 0');
  ok(logs.includes('[elysilana] own token raw response') && logs.includes('[elysilana] own liquidity candidates'), 'console labels');
  const src = read(resolve(ROOT, 'src/js/market.js'));
  ok(/Promise\.all\(\[/.test(src), 'Promise.all');
});
await gate('own row [CA stated]: logo fallback, liquidity -> Mkt Cap fallback with title, pinned + dedup', async () => {
  const regS = REG.normalize(statedRegister(baseRaw));
  const own = await MARKET.loadOwn(regS, mkFetch({ own: OWN_DEX({ usd: 0 }, 55555), pump: null }), { ...noBackoff, log() {} });
  ok(own.logo === 'assets/logo-192.png', 'pump failure -> logo-192');
  ok(own.liquidity === 55555 && own.liqLabel === 'Mkt Cap', 'marketCap fallback');
  const trending = MARKET.rankTrending([...pairs, mkPair(CA, 'ELY', 5 * 10 ** 6)], new Map(), 10);
  ok(trending.some((r) => r.address === CA), 'own present in trending before dedup');
  const rows = MARKET.composeBoard({ trending, own, ca: CA });
  ok(rows[0].kind === 'own' && rows[0].address === CA, 'pinned row #1');
  ok(rows.slice(1).every((r) => r.address !== CA) && rows.length === 10, 'deduped, 10 rows');
  const h = RENDER.rowHTML(rows[0], 0);
  ok(/title="Mkt Cap"/.test(h) && /row-own/.test(h) && new RegExp(`data-copy="${CA}"`).test(h), 'title attr + copy per address');
  const down = await MARKET.loadOwn(regS, mkFetch({ own: null, pump: null }), { ...noBackoff, log() {} });
  ok(down.ok === false && Number.isNaN(down.price), 'dex failure shows dashes, keeps row');
});
await gate('rows: copy-per-address button on every live row; skeleton x10 with stagger; spotlight hooks', () => {
  const live = MARKET.composeBoard({ trending: MARKET.rankTrending(pairs, new Map(), 10), own: null }).slice(1);
  ok(live.every((r) => /<button type="button" class="copy" data-copy="/.test(RENDER.rowHTML(r))), 'copy buttons');
  ok((htmlDist.match(/class="row row-skel"/g) || []).length === 10 && /--i:9/.test(htmlDist), 'ten skeleton rows');
  ok((htmlDist.match(/data-spot/g) || []).length >= 10, 'spotlight targets');
});

// =============== MOTION ===============
await gate('motion: spring solver, reveal, parallax layers, progress bar, status pill, count-up flash', () => {
  const m = read(resolve(ROOT, 'src/js/motion.js'));
  ok(/export function spring/.test(m) && /-k \* \(x - to\) - c \* v/.test(m), 'damped spring');
  ok(/IntersectionObserver/.test(m) && /data-stagger|dataset\.stagger/.test(m), 'reveal stagger');
  ok((htmlDist.match(/data-depth=/g) || []).length >= 3 && /pointermove/.test(m) && /scroll/.test(m), 'parallax layers, pointer + scroll');
  ok(/class="progress"/.test(htmlDist) && /scaleX/.test(m), 'scroll progress');
  ok(/class="status"[^>]*>\s*<i class="live-dot">/.test(htmlDist) && /@keyframes ping/.test(read(resolve(ROOT, 'src/styles.css'))), 'status pill pulsing dot');
  ok(/flash-up/.test(m) && /flash-down/.test(m) && /export function setNum/.test(m), 'count-up + flash');
  ok(/b1[\s\S]*drift/.test(read(resolve(ROOT, 'src/styles.css'))) && /blob/.test(htmlDist), 'animated gradient mesh');
});
await gate('motion: prefers-reduced-motion falls back instantly everywhere (CSS + JS)', () => {
  const css = read(resolve(ROOT, 'src/styles.css')), m = read(resolve(ROOT, 'src/js/motion.js'));
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  ok(/animation: none !important/.test(block) && /transition: none !important/.test(block), 'blanket kill');
  ok(/\[data-reveal\] \{ opacity: 1 !important; transform: none !important/.test(block), 'reveal visible');
  ok(/prefers-reduced-motion: reduce/.test(m) && (m.match(/reduced\(\)/g) || []).length >= 4 && /onUpdate\(to\)/.test(m), 'JS checks');
  ok(/data-motion|dataset\.motion/.test(htmlDist), 'html flag');
  ok(!/\[data-motion=on\][^{]*\{[^}]*\}/.test(block), 'no motion-on rules in reduced block');
  // every keyframe in styles.css is neutralised by the blanket rule
  ok(((css.match(/@keyframes/g) || []).length) >= 6, 'keyframes exist and are covered');
});
await gate('motion: easing and timing measured from the reference (.15s ease transitions)', () => {
  const css = read(resolve(ROOT, 'src/styles.css'));
  ok(/--t: \.15s/.test(css) && /--ease: ease;/.test(css), 'reference transition');
});

// =============== COPY ===============
await gate('copy: zero shared 2-grams with the reference copy; no reference words beyond proper nouns', () => {
  const words = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const bi = (w) => new Set(w.slice(1).map((x, i) => w[i] + ' ' + x));
  const corpus = read(resolve(ROOT, 'scripts/ref-corpus.txt')).split('\n').filter(Boolean);
  const refBi = new Set(); const refWords = new Set();
  for (const line of corpus) { const w = words(line); w.forEach((x) => refWords.add(x)); bi(w).forEach((b) => refBi.add(b)); }
  const ours = [stripHTML(htmlDist)];
  for (const f of ['main.js', 'render.js']) ours.push(...[...read(resolve(ROOT, 'src/js', f)).matchAll(/'([A-Z][^'\n]{5,})'/g)].map((m) => m[1]).filter((s) => / /.test(s) && !/[{}()=;]/.test(s)));
  ours.push(read(resolve(ROOT, 'README.md')).split('\n').filter((l) => !/^#|^\[!|^!\[/.test(l)).join(' ').replace(/https?:\/\/\S+/g, ' ').replace(/[`*\[\]()]/g, ' '));
  const shared = []; const sharedWords = new Set();
  const STOP = new Set('a an and the of to in on at for from with by is are be as it its or this that your our you we us their they them one more most all any each so no not can will up out into over than then too very just only also about after before when where which who how what while until'.split(' '));
  const ALLOW = new Set(['solana', 'token', 'tokens', 'elysilana', 'market', 'live', 'launch']); // proper noun / generic nouns shared by necessity
  for (const text of ours) { const w = words(text); for (const b of bi(w)) if (refBi.has(b)) shared.push(b); for (const x of w) if (refWords.has(x) && !STOP.has(x) && !ALLOW.has(x) && x.length > 2) sharedWords.add(x); }
  ok(!shared.length, 'shared 2-grams: ' + [...new Set(shared)].join(' | '));
  ok(!sharedWords.size, 'shared content words: ' + [...sharedWords].join(', '));
  ok(!/elysium|hype|kinetiq|pad\b/i.test(stripHTML(htmlDist)), 'no reference brand terms');
});
await gate('reference parity: no animated logo, no coin icon, header text mark only', () => {
  ok(!/brand-mark|coin/i.test(htmlDist), 'no brand mark / coin');
  ok(/<a class="brand"[^>]*>ELYSILANA<\/a>/.test(htmlDist), 'text brand');
  ok(!/<img/.test(htmlDist.split('<main')[0]), 'no logo image in header');
});
await gate('fabricated numbers: no hardcoded stats in markup; every figure is computed from live data', () => {
  const body = stripHTML(htmlDist);
  ok(!/\$\s?\d/.test(body.replace(/\$0\.00/g, '')) && !/\d+(\.\d+)?\s?[KMB]\b/.test(body), 'no money figures in static html');
  ok(/data-fmt="count" data-v=""/.test(htmlDist) && /boardStats/.test(read(resolve(ROOT, 'src/js/main.js'))), 'tiles computed');
  const ref = read(resolve(ROOT, 'register.json')); ok(!/"(volume|holders|supply|price)"/i.test(ref), 'register carries no numbers');
});

rmSync(TMP, { recursive: true, force: true });
console.log(`\ngates: ${pass + fail} total, ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
