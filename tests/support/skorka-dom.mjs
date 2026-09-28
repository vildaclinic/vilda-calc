// P-STYLE rata 4b: przebieg w Chromium uzupełniający analizę statyczną złożenia skórki (tests/support/skorka-css.mjs)
// o to, czego nie widać w arkuszach: (1) arkusze wstrzykiwane z JS (<style> i <link> dołożone po załadowaniu) — trafiają
// do kaskady strony na swojej pozycji w dokumencie; (2) style inline na elementach dopasowanych przez składane
// deklaracje z !important (dziś !important skórki wygrywa ze stylem inline, po złożeniu przegrałby); (3) spójność
// wiedzy o DOM: każda klasa i id na stronie w spoczynku występuje na typie elementu, jaki analiza statyczna
// przewiduje (naruszenie = wiedza jest zła i analiza nie może na niej polegać). Strony w trybie gościa, jak w dowodzie
// stylów obliczonych (tests/scripts/porownaj-style-obliczone.mjs), desktop i telefon.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { CHWILA } from './czas.mjs';
import { korzen, longhandy } from './skorka-css.mjs';

const require = createRequire(path.join(korzen, 'package.json'));
const { chromium, devices } = require('playwright');

const OKNA = {
  desktop: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
  mobile: { ...(devices['iPhone 15 Pro'] || devices['iPhone 13']), browserName: 'chromium' },
};
const PORT = 4193;
const STANY = /:(?:hover|focus-visible|focus-within|focus|active)\b/g;

/** Selektor do querySelectorAll: bez pseudoklas stanu i pseudoelementów (element-gospodarz), puste złożenie → `*`. */
export function selektorDoZapytania(selektor) {
  const bez = selektor.replace(/::?(?:before|after|placeholder|selection|marker|backdrop|first-line|first-letter)\b/g, '').replace(STANY, '');
  return bez.replace(/(^|[\s>+~])(?=[\s>+~]|$)/g, '$1*').replace(/\*\s*\*/g, '*').replace(/^\*\s+(?=\S)/, '').trim() || '*';
}

export async function przebiegDom({ zrodla, analiza, wiedza, strony = null, okna = ['desktop', 'mobile'] }) {
  const serwer = spawn(process.execPath, [path.join(korzen, 'tests/support/static-server.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  const przegladarka = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  const wynik = { dynamiczne: {}, inline: [], naruszenia: [] };
  try {
    await new Promise((r) => { setTimeout(r, 1000); });
    const lista = strony || [...zrodla.keys()];
    const wiedzaJson = { klasy: Object.fromEntries([...wiedza.klasy].filter(([, e]) => !e.wolna).map(([k, e]) => [k, [...e.tagi]])), idy: Object.fromEntries([...wiedza.idy].filter(([, e]) => !e.wolna).map(([k, e]) => [k, [...e.tagi]])) };
    const kandydaci = analiza.zlozone.map((k) => ({ klucz: k.klucz, arkusz: k.arkusz, wazna: k.deklaracja.important, prop: k.deklaracja.prop, longhandy: [...new Set([k.deklaracja.prop, ...longhandy(k.deklaracja.prop)])], selektory: k.regula.czesci.map((c) => selektorDoZapytania(c.zlozony)) }));
    for (const okno of okna) {
      for (const strona of lista) {
        const statyczne = zrodla.get(strona);
        const naStronie = new Set(statyczne.map((z) => z.id));
        const ctx = await przegladarka.newContext({ ...OKNA[okno], locale: 'pl-PL', timezoneId: 'Europe/Warsaw', serviceWorkers: 'block', baseURL: `http://127.0.0.1:${PORT}` });
        const page = await ctx.newPage();
        try {
          await page.clock.install({ time: new Date(CHWILA) });
          await page.clock.resume();
          await page.route(/.*/, (route) => (new URL(route.request().url()).host === `127.0.0.1:${PORT}` ? route.continue() : route.abort()));
          await page.addInitScript(() => {
            try {
              window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
              window.localStorage.setItem('analyticsConsent', 'denied');
            } catch (_) { /* brak storage */ }
          });
          await page.goto(`/${strona}`, { waitUntil: 'load' });
          const przycisk = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
          if ((await przycisk.count()) && (await przycisk.first().isVisible())) { await przycisk.first().click(); await page.waitForTimeout(600); }
          await page.evaluate(() => document.fonts.ready);
          if (okno === 'mobile') await page.waitForFunction(() => !document.getElementById('mobileBottomDock') || document.body.classList.contains('has-mobile-bottom-dock-visible'), null, { timeout: 6000 }).catch(() => {});
          await page.waitForTimeout(1500);
          const dane = await page.evaluate(([blokiStatyczne, linkiStatyczne, kand, wiedzaW]) => {
            const norm = (t) => t.replace(/\s+/g, ' ').trim();
            const statyczneTeksty = new Set(blokiStatyczne.map(norm));
            const wezly = [...document.querySelectorAll('link[rel="stylesheet"], style')];
            const dynamiczne = [];
            let indeks = 0; // pozycja wśród źródeł statycznych (jak w zrodlaStron)
            for (const w of wezly) {
              if (w.tagName === 'LINK') {
                const href = (w.getAttribute('href') || '').split('?')[0];
                if (linkiStatyczne.includes(href)) { indeks++; continue; }
                if (/^[a-z0-9_-]+\.css$/i.test(href)) dynamiczne.push({ pozycja: indeks, arkusz: href });
                continue;
              }
              const tekst = w.textContent || '';
              if (statyczneTeksty.has(norm(tekst))) { indeks++; continue; }
              if (tekst.trim()) dynamiczne.push({ pozycja: indeks, css: tekst });
            }
            const opisEl = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 4).join('.')}` : ''}`;
            const inline = [];
            for (const k of kand) {
              if (!k.wazna) continue;
              for (const sel of k.selektory) {
                let elementy;
                try { elementy = [...document.querySelectorAll(sel)]; } catch { continue; }
                for (const el of elementy) {
                  const trafione = k.longhandy.filter((l) => el.style.getPropertyValue(l) && el.style.getPropertyPriority(l) !== 'important');
                  if (trafione.length) inline.push({ klucz: k.klucz, opis: `${opisEl(el)} style="${trafione.map((l) => `${l}: ${el.style.getPropertyValue(l)}`).join('; ')}"` });
                }
              }
            }
            const naruszenia = [];
            for (const el of document.querySelectorAll('*')) {
              const tag = el.tagName.toLowerCase();
              for (const k of el.classList) { const t = wiedzaW.klasy[k]; if (t && !t.includes(tag)) naruszenia.push(`klasa ${k} na <${tag}> (${opisEl(el)}), oczekiwane: ${t.join(', ')}`); }
              if (el.id && wiedzaW.idy[el.id] && !wiedzaW.idy[el.id].includes(tag)) naruszenia.push(`id ${el.id} na <${tag}>, oczekiwane: ${wiedzaW.idy[el.id].join(', ')}`);
            }
            return { dynamiczne, inline, naruszenia };
          }, [statyczne.filter((z) => z.typ === 'style').map((z) => z.css), statyczne.filter((z) => z.typ !== 'style').map((z) => z.id), kandydaci.filter((k) => naStronie.has(k.arkusz)), wiedzaJson]);
          for (const d of dane.dynamiczne) {
            const l = wynik.dynamiczne[strona] || (wynik.dynamiczne[strona] = []);
            const css = d.css ?? (() => { try { return fs.readFileSync(path.join(korzen, d.arkusz), 'utf8'); } catch { return ''; } })();
            if (css && !l.some((x) => x.pozycja === d.pozycja && x.css === css)) l.push({ pozycja: d.pozycja, css, ...(d.arkusz ? { arkusz: d.arkusz } : {}) });
          }
          for (const i of dane.inline) if (!wynik.inline.some((x) => x.klucz === i.klucz && x.opis === i.opis)) wynik.inline.push({ ...i, strona, okno });
          for (const n of dane.naruszenia) { const opis = `${strona} (${okno}): ${n}`; if (!wynik.naruszenia.includes(opis)) wynik.naruszenia.push(opis); }
          console.log(`${okno.padEnd(7)} ${strona.padEnd(40)} dynamiczne: ${dane.dynamiczne.length}, inline: ${dane.inline.length}, naruszenia wiedzy: ${dane.naruszenia.length}`);
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await przegladarka.close();
    try { serwer.kill(); } catch { /* już zamknięty */ }
  }
  for (const l of Object.values(wynik.dynamiczne)) l.sort((a, b) => a.pozycja - b.pozycja);
  wynik.inline.sort((a, b) => a.klucz.localeCompare(b.klucz) || a.opis.localeCompare(b.opis));
  return wynik;
}
