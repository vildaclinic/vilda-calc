#!/usr/bin/env node
// Kontrola podglądów design systemu (po npm run design-system): każdy components/<Nazwa>/preview.html
// jest renderowany w Chromium tak, jak robi to strona (tokens.css + bundle.css, <html data-theme>),
// przy 960 px szerokości, w wybranych motywach. Sprawdzane są: wysokość treści względem znacznika
// @dsCard, przewijanie poziome, brak widocznego tekstu, błędy konsoli, kontrakt pliku.
//   node design-system/check.mjs [--themes light,high-contrast-2,glass-4,dark-bg-1] [--shots <katalog>] [--only Nazwa]
// Wymaga zainstalowanego Chromium Playwrighta (npx playwright install chromium).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '..', 'package.json'));
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const themes = opt('--themes', 'light,high-contrast-2,glass-4,dark-bg-1').split(',');
const shots = opt('--shots', '');
const only = opt('--only', '');
const outDir = path.join(here, 'out');
const comp = path.join(outDir, 'project', 'components');
if (!fs.existsSync(comp)) { console.error('Brak design-system/out — najpierw uruchom npm run design-system.'); process.exit(2); }

// Podglądy, których korzeń wypełnia okno (min-height: 100vh w źródle): wysokość treści rośnie z ramką, więc nie jest miarą.
const VIEWPORT_BOUND = new Set(['AuthCard', 'AuthSheet']);
// Strona bez klasy liquid-ios26 w aplikacji (subskrypcja.html) — jej karta też jej nie ma.
const NO_GLASS = new Set(['PlanCard', 'Cover']);

const tokens = fs.readFileSync(path.join(outDir, 'build', 'tokens.css'), 'utf8');
const bundle = fs.readFileSync(path.join(comp, 'bundle.css'), 'utf8');
const names = fs.readdirSync(comp, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(comp, d.name, 'preview.html')))
  .map((d) => d.name)
  .filter((n) => !only || n === only)
  .sort();
if (shots) fs.mkdirSync(shots, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.DS_CHROME) launchOptions.executablePath = process.env.DS_CHROME;
const browser = await chromium.launch(launchOptions);
const report = [];
for (const name of names) {
  const src = fs.readFileSync(path.join(comp, name, 'preview.html'), 'utf8');
  const marker = /^<!--\s*@dsCard([^>]*)-->/.exec(src);
  const height = marker ? Number((/height=(\d+)/.exec(marker[1]) || [])[1]) : NaN;
  const body = src.replace(/^<!--[^>]*-->\s*/, '');
  const entry = { name, markerHeight: height, problems: [] };
  if (!marker) entry.problems.push('brak znacznika @dsCard w pierwszej linii');
  if (!/<html[^>]*lang="pl"/i.test(body)) entry.problems.push('html bez lang="pl"');
  if (!NO_GLASS.has(name) && !/<body[^>]*class="[^"]*liquid-ios26/i.test(body)) entry.problems.push('body bez klasy liquid-ios26');
  if (/<script[^>]*src=/i.test(body)) entry.problems.push('zewnętrzny <script src>');
  if (/<iframe|<object|<embed|<frame/i.test(body)) entry.problems.push('niedozwolony element osadzający');
  if (/<img[^>]*src="(?!data:|\/_blob\/)/i.test(body)) entry.problems.push('zewnętrzny obraz');

  for (const theme of themes) {
    const page = await browser.newPage({ viewport: { width: 960, height: Math.max(200, (height || 300) + 40) } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|fonts\.g(oogleapis|static)\.com/.test(m.text())) errors.push(m.text().slice(0, 160)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    let html = body;
    const pre = `<style id="tokens">${tokens}</style><style id="bundle">${bundle}</style>`;
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + pre) : pre + html;
    html = html.replace(/<html([^>]*)>/i, (m, a) => `<html${a.replace(/\sdata-theme="[^"]*"/, '')} data-theme="${theme}">`);
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(120);
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const b = document.body;
      let maxBottom = 0;
      for (const el of b.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (r.width || r.height) maxBottom = Math.max(maxBottom, r.bottom + window.scrollY); }
      return { scrollWidth: Math.max(de.scrollWidth, b.scrollWidth), contentBottom: Math.round(maxBottom), textCount: b.innerText.trim().length };
    });
    if (shots) await page.screenshot({ path: path.join(shots, `${name}-${theme}.png`), clip: { x: 0, y: 0, width: 960, height: Math.max(40, Math.min(4000, Math.max(height || 0, m.contentBottom) + 8)) } });
    if (theme === themes[0]) {
      if (height && !VIEWPORT_BOUND.has(name) && m.contentBottom > height + 2) entry.problems.push(`treść ${m.contentBottom}px wyższa niż znacznik ${height}px (przycięcie)`);
      if (height && !VIEWPORT_BOUND.has(name) && height > m.contentBottom + 120) entry.problems.push(`znacznik ${height}px dużo wyższy niż treść ${m.contentBottom}px (pusty pas)`);
      if (m.scrollWidth > 962) entry.problems.push(`przewijanie poziome: scrollWidth ${m.scrollWidth}`);
      if (m.textCount === 0 && name !== 'Cover') entry.problems.push('brak widocznego tekstu');
      entry.contentBottom = m.contentBottom;
    }
    if (errors.length) entry.problems.push(`${theme}: błędy konsoli: ${errors.join(' | ').slice(0, 240)}`);
    await page.close();
  }
  report.push(entry);
  console.log(`${name.padEnd(22)} znacznik=${String(height).padStart(4)} treść=${String(entry.contentBottom).padStart(4)} ${entry.problems.length ? `PROBLEMY: ${entry.problems.join('; ')}` : 'ok'}`);
}
await browser.close();
const bad = report.filter((r) => r.problems.length);
fs.writeFileSync(path.join(outDir, 'check-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n${report.length} podglądów, ${bad.length} z problemami → ${path.join(outDir, 'check-report.json')}`);
process.exit(bad.length ? 1 : 0);
