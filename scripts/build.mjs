// Build: src/ + register.json -> dist/. Prerenders the register-driven slots with the same renderers the browser uses.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function build({ registerPath = resolve(ROOT, 'register.json'), out = resolve(ROOT, 'dist') } = {}) {
  const { normalize } = await import(pathToFileURL(resolve(ROOT, 'src/js/register.js')).href);
  const { socialsHTML, caSlotHTML, registerRowsHTML, skeletonRowsHTML } = await import(pathToFileURL(resolve(ROOT, 'src/js/render.js')).href);

  const raw = JSON.parse(readFileSync(registerPath, 'utf8'));
  for (const [id, r] of Object.entries(raw.records)) {
    if (r.state !== 'stated' && ('value' in r || 'url' in r)) throw new Error(`register: inert record "${id}" carries value or url`);
  }
  const reg = normalize(raw);

  // clear contents, not the folder itself (a dev server may hold it open on Windows)
  if (existsSync(out)) for (const f of readdirSync(out)) rmSync(resolve(out, f), { recursive: true, force: true });
  mkdirSync(resolve(out, 'assets/js'), { recursive: true });
  cpSync(resolve(ROOT, 'src/js'), resolve(out, 'assets/js'), { recursive: true });
  for (const f of ['tokens.css', 'styles.css']) cpSync(resolve(ROOT, 'src', f), resolve(out, 'assets', f));
  for (const f of ['logo-192.png', 'logo-512.png']) cpSync(resolve(ROOT, 'src/assets', f), resolve(out, 'assets', f));
  cpSync(resolve(ROOT, 'brand/elysilana-logo.png'), resolve(out, 'assets/elysilana-logo.png'));
  cpSync(resolve(ROOT, 'src/assets/favicon.svg'), resolve(out, 'favicon.svg'));
  // register ships as data; the page re-reads it on every poll
  writeFileSync(resolve(out, 'register.json'), JSON.stringify(raw, null, 2) + '\n');
  writeFileSync(resolve(out, '_headers'), '/register.json\n  Cache-Control: no-store\n/assets/*\n  Cache-Control: public, max-age=300\n');

  const tokens = readFileSync(resolve(ROOT, 'src/tokens.css'), 'utf8');
  const theme = /--color-bg:\s*(#[0-9a-f]{6})/i.exec(tokens)[1];
  const html = readFileSync(resolve(ROOT, 'src/index.template.html'), 'utf8')
    .replace('{{THEME}}', theme)
    .replace('{{CA_STATE}}', reg.contract && reg.contract.state === 'stated' ? 'stated' : 'absent')
    .replace('{{SOCIALS}}', socialsHTML(reg))
    .replace('{{CA_SLOT}}', caSlotHTML(reg.contract))
    .replace('{{REGISTER}}', registerRowsHTML(reg))
    .replace('{{SKELETON}}', skeletonRowsHTML(10));
  if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error('unfilled template slot');
  writeFileSync(resolve(out, 'index.html'), html);
  return { out, reg };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { out } = await build();
  console.log('build ok ->', out);
}
