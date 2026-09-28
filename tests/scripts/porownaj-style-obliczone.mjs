// P-STYLE rata 2a: DOWÓD braku zmiany wyglądu po refaktoryzacji stylów — porównanie stylów obliczonych.
// Dwie kopie aplikacji (rewizja bazowa w tymczasowym worktree i drzewo robocze) są serwowane na dwóch
// portach, każda strona jest otwierana w obu w tych samych warunkach co siatka zrzutów (tryb gościa,
// tryb wyglądu, zegar, sieć zewnętrzna odcięta) i dla KAŻDEGO elementu porównywane są style obliczone
// (kolory, tła, obramowania, cienie, przezroczystość, z-index, typografia, pudełko, układ) oraz style
// pseudoelementów ::before/::after i geometria. Różnica stylu = zmiana wyglądu; geometria jest
// raportowana osobno (bywa niedeterministyczna o piksel).
//
//   node tests/scripts/porownaj-style-obliczone.mjs --baza origin/audyt
//     [--strony index.html,ustawienia.html] [--tryby jasny,szklo-4,kontrast-2,ciemne-tlo-1] [--okna desktop,mobile]
// Kod wyjścia 1 przy różnicy stylu. Wymaga Chromium Playwrighta (jak zestaw e2e).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CHWILA } from '../support/czas.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(korzen, 'package.json'));
const { chromium, devices } = require('playwright');

const argv = process.argv.slice(2);
const opcja = (nazwa, domyslna) => { const i = argv.indexOf(nazwa); return i >= 0 && argv[i + 1] ? argv[i + 1] : domyslna; };
const baza = opcja('--baza', 'origin/audyt');
if (!/^[A-Za-z0-9_./~^-]{1,80}$/.test(baza)) { console.error('nieprawidłowa rewizja'); process.exit(2); }
const WSZYSTKIE_STRONY = fs.readdirSync(korzen).filter((f) => f.endsWith('.html')).sort();
const strony = opcja('--strony', '').split(',').filter(Boolean).filter((s) => WSZYSTKIE_STRONY.includes(s));
const listaStron = strony.length ? strony : WSZYSTKIE_STRONY;
const TRYBY = {
  jasny: { preferencje: {}, klasa: 'glass-level-0' },
  'szklo-4': { preferencje: { glassLevel: '4' }, klasa: 'glass-level-4' },
  'kontrast-2': { preferencje: { highContrastEnabled: 'true', highContrastLevel: '2' }, klasa: 'high-contrast-level-2' },
  'ciemne-tlo-1': { preferencje: { darkBgLevel: '1' }, klasa: 'dark-bg-level-1' },
};
const tryby = opcja('--tryby', Object.keys(TRYBY).join(',')).split(',').filter((t) => TRYBY[t]);
const OKNA = {
  desktop: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
  mobile: { ...(devices['iPhone 15 Pro'] || devices['iPhone 13']), browserName: 'chromium' },
};
const okna = opcja('--okna', 'desktop,mobile').split(',').filter((o) => OKNA[o]);
const DOMYSLNE = { darkBgLevel: '0', glassLevel: '0', highContrastEnabled: 'false', highContrastLevel: '2' };
const WLASNOSCI = ['color', 'background-color', 'background-image', 'background-position', 'background-size', 'background-repeat', 'background-clip', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius', 'outline-color', 'outline-width', 'outline-style', 'outline-offset', 'box-shadow', 'text-shadow', 'opacity', 'z-index', 'filter', 'backdrop-filter', 'visibility', 'display', 'position', 'top', 'right', 'bottom', 'left', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'row-gap', 'column-gap', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-transform', 'text-decoration-line', 'text-decoration-color', 'text-align', 'white-space', 'overflow-x', 'overflow-y', 'transform', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items', 'justify-content', 'grid-template-columns', 'grid-template-rows', 'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end', 'order', 'cursor', 'pointer-events', 'mix-blend-mode', 'caret-color', 'accent-color', 'fill', 'stroke', 'scrollbar-color'];
const PSEUDO = ['content', 'color', 'background-color', 'background-image', 'border-top-color', 'border-bottom-color', 'box-shadow', 'opacity', 'z-index', 'width', 'height', 'display'];

// 1. worktree rewizji bazowej i dwa serwery statyczne
const sha = execFileSync('git', ['rev-parse', '--short', baza], { cwd: korzen, encoding: 'utf8' }).trim();
const katalogBazy = fs.mkdtempSync(path.join(os.tmpdir(), `vilda-baza-${sha}-`));
execFileSync('git', ['worktree', 'add', '--detach', katalogBazy, baza], { cwd: korzen, stdio: 'ignore' });
const serwery = [];
function serwer(katalog, port) {
  const p = spawn(process.execPath, [path.join(katalog, 'tests/support/static-server.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  serwery.push(p);
}
const PORT_BAZA = 4191;
const PORT_ROBOCZE = 4192;
serwer(katalogBazy, PORT_BAZA);
serwer(korzen, PORT_ROBOCZE);
function sprzatanie() {
  for (const p of serwery) { try { p.kill(); } catch { /* już zamknięty */ } }
  try { execFileSync('git', ['worktree', 'remove', '--force', katalogBazy], { cwd: korzen, stdio: 'ignore' }); } catch { /* worktree już usunięty */ }
}
process.on('exit', sprzatanie);
process.on('SIGINT', () => { sprzatanie(); process.exit(130); });
await new Promise((r) => { setTimeout(r, 1200); });

// 2. migawka strony
async function migawka(przegladarka, okno, port, strona, tryb) {
  const ctx = await przegladarka.newContext({ ...OKNA[okno], locale: 'pl-PL', timezoneId: 'Europe/Warsaw', serviceWorkers: 'block', baseURL: `http://127.0.0.1:${port}` });
  const page = await ctx.newPage();
  try {
    await page.clock.install({ time: new Date(CHWILA) });
    await page.clock.resume();
    await page.route(/.*/, (route) => (new URL(route.request().url()).host === `127.0.0.1:${port}` ? route.continue() : route.abort()));
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
        window.localStorage.setItem('analyticsConsent', 'denied');
      } catch (_) { /* brak storage — pomiń */ }
    });
    const gosc = async () => {
      const przycisk = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
      if ((await przycisk.count()) && (await przycisk.first().isVisible())) { await przycisk.first().click(); await page.waitForTimeout(600); }
    };
    await page.goto(`/${strona}`, { waitUntil: 'load' });
    await gosc();
    const maPersistence = await page.evaluate(() => Boolean(window.VildaPersistence && typeof window.VildaPersistence.writePreferenceRaw === 'function'));
    if (maPersistence) {
      await page.evaluate((p) => { for (const [k, v] of Object.entries(p)) window.VildaPersistence.writePreferenceRaw(k, v, { force: true }); }, { ...DOMYSLNE, ...TRYBY[tryb].preferencje });
      await page.reload({ waitUntil: 'load' });
      await gosc();
    }
    if (strona === 'index.html' && await page.evaluate(() => typeof window.update === 'function')) {
      await page.evaluate(() => {
        const ustaw = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
        ustaw('age', 10); ustaw('ageMonths', 3); ustaw('sex', 'F'); ustaw('weight', 32); ustaw('height', 138);
        window.update();
      });
      await page.waitForFunction(() => { const el = document.getElementById('bmiResult'); return Boolean(el && /BMI/.test(el.textContent)); });
    }
    await page.evaluate(() => document.fonts.ready);
    // przycisk przypomnień w chrome: vilda_chrome.js chowa go z opóźnieniem (dławik 250 ms), gdy sejf nie jest
    // odblokowany — w trybie gościa zawsze; migawka zrobiona przed tym momentem różniłaby się od zrobionej po
    // Wyścig w aplikacji (poza zakresem porównania stylów): na stronach statycznych vilda_chrome.js raz chowa
    // przycisk dla gościa, a raz nie — zależy od kolejności ładowania skryptów. Obie strony dostają stan docelowy
    // trybu gościa (ukryty), żeby różnica nie udawała zmiany stylów.
    await page.evaluate(() => {
      const b = document.getElementById('vildaRemindersBtn');
      const v = window.VildaVault;
      if (b && !(v && typeof v.isUnlocked === 'function' && v.isUnlocked())) b.hidden = true;
    });
    // dock na telefonie pokazuje się z opóźnieniem (klasa has-mobile-bottom-dock-visible na body)
    if (okno === 'mobile') {
      await page.waitForFunction(() => !document.getElementById('mobileBottomDock') || document.body.classList.contains('has-mobile-bottom-dock-visible'), null, { timeout: 6000 }).catch(() => { /* dock nie pokazał się w 6 s — porównujemy stan jaki jest */ });
    }
    // animacje i przejścia zamrożone po obu stronach: porównujemy style docelowe, nie klatki
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    // Strona jest przyjmowana dopiero, gdy dwie kolejne migawki (co 500 ms) są identyczne: moduły chrome
    // (np. przycisk przypomnień) przełączają klasy asynchronicznie, a porównujemy stan ustalony, nie klatkę.
    // Elementy dokładane po bezczynności (np. dekoracyjny pasek powłoki, moduły karty przy pierwszym, zimnym
    // ładowaniu) potrafią przyjść po sekundzie — pierwsza migawka dopiero po 1,2 s, kolejne co 600 ms.
    await page.waitForTimeout(1200);
    let ostatnia = null;
    let stabilna = false;
    for (let i = 0; i < 10; i++) {
      const biezaca = await zbierz(page);
      if (ostatnia && JSON.stringify(biezaca) === JSON.stringify(ostatnia)) { stabilna = true; break; }
      ostatnia = biezaca;
      await page.waitForTimeout(600);
    }
    return { ...ostatnia, stabilna };
  } finally {
    await ctx.close();
  }
}

/** Migawka stylów obliczonych, pseudoelementów i geometrii wszystkich elementów strony. */
async function zbierz(page) {
    return await page.evaluate(([wlasnosci, pseudo]) => {
      const out = [];
      const klasyBody = document.body.className;
      for (const el of document.querySelectorAll('body, body *')) {
        if (/^(SCRIPT|STYLE|LINK|META|TEMPLATE|NOSCRIPT)$/.test(el.tagName)) continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const klucz = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].join('.')}` : ''}`;
        const style = wlasnocsiMap(cs, wlasnosci);
        const przed = getComputedStyle(el, '::before');
        const po = getComputedStyle(el, '::after');
        const ps = przed.content && przed.content !== 'none' ? wlasnocsiMap(przed, pseudo) : '';
        const pa = po.content && po.content !== 'none' ? wlasnocsiMap(po, pseudo) : '';
        out.push([klucz, `${Math.round(r.x * 2) / 2},${Math.round(r.y * 2) / 2},${Math.round(r.width * 2) / 2},${Math.round(r.height * 2) / 2}`, style, ps, pa]);
      }
      return { klasyBody, elementy: out };
      function wlasnocsiMap(cs, lista) { return lista.map((w) => cs.getPropertyValue(w)).join('\u0001'); }
    }, [WLASNOSCI, PSEUDO]);
}

function porownaj(a, b) {
  const wynik = { style: [], geometria: 0, struktura: null };
  if (a.elementy.length !== b.elementy.length) {
    // pierwszy element, który jest po jednej stronie, a nie po drugiej — wskazuje, co dorenderowało się asynchronicznie
    const kluczeA = a.elementy.map((e) => e[0]); const kluczeB = b.elementy.map((e) => e[0]);
    let i = 0; while (i < Math.min(kluczeA.length, kluczeB.length) && kluczeA[i] === kluczeB[i]) i++;
    wynik.struktura = `liczba elementów ${a.elementy.length} ↔ ${b.elementy.length}; pierwsza rozbieżność przy ${i}: ${kluczeA[i] || '(koniec)'} ↔ ${kluczeB[i] || '(koniec)'}`;
  }
  const n = Math.min(a.elementy.length, b.elementy.length);
  for (let i = 0; i < n; i++) {
    const [ka, ra, sa, pa1, pa2] = a.elementy[i];
    const [kb, rb, sb, pb1, pb2] = b.elementy[i];
    if (ka !== kb) { wynik.struktura = wynik.struktura || `element ${i}: ${ka} ↔ ${kb}`; break; }
    if (sa !== sb) {
      const va = sa.split('\u0001'); const vb = sb.split('\u0001');
      const roznice = WLASNOSCI.map((w, j) => (va[j] !== vb[j] ? `${w}: ${va[j]} → ${vb[j]}` : null)).filter(Boolean);
      wynik.style.push(`${ka}: ${roznice.join('; ')}`);
    }
    if (pa1 !== pb1) wynik.style.push(`${ka}::before: ${pa1} → ${pb1}`);
    if (pa2 !== pb2) wynik.style.push(`${ka}::after: ${pa2} → ${pb2}`);
    if (ra !== rb) wynik.geometria++;
  }
  return wynik;
}

// 3. przebieg: strony × tryby × okna, kilka stron naraz
const przegladarka = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const zadania = [];
for (const okno of okna) for (const strona of listaStron) for (const tryb of tryby) zadania.push({ okno, strona, tryb });
let roznicStylu = 0;
let roznicGeometrii = 0;
let problemyStruktury = 0;
const linie = [];
const ROWNOLEGLE = 3;
let indeks = 0;
async function pracownik() {
  while (indeks < zadania.length) {
    const z = zadania[indeks++];
    const etykieta = `${z.okno} ${z.strona} [${z.tryb}]`;
    try {
      const [a, b] = await Promise.all([migawka(przegladarka, z.okno, PORT_BAZA, z.strona, z.tryb), migawka(przegladarka, z.okno, PORT_ROBOCZE, z.strona, z.tryb)]);
      const w = porownaj(a, b);
      const niestabilna = (!a.stabilna ? ' baza niestabilna' : '') + (!b.stabilna ? ' robocza niestabilna' : '');
      if (niestabilna) linie.push(`NIESTABILNA ${etykieta}:${niestabilna} (strona nie dała dwóch identycznych migawek w 5 s)`);
      if (w.struktura) { problemyStruktury++; linie.push(`STRUKTURA ${etykieta}: ${w.struktura}`); }
      if (w.style.length) { roznicStylu += w.style.length; linie.push(`STYL ${etykieta}: ${w.style.length} elementów, np.:\n    ${w.style.slice(0, 5).join('\n    ')}`); }
      if (w.geometria) roznicGeometrii += w.geometria;
      console.log(`${w.struktura || w.style.length ? 'RÓŻNICA' : 'OK     '} ${etykieta}: ${a.elementy.length} elementów${w.geometria ? `, geometria: ${w.geometria}` : ''}${w.style.length ? `, STYL: ${w.style.length}` : ''}`);
    } catch (e) {
      problemyStruktury++;
      linie.push(`BŁĄD ${etykieta}: ${String(e).slice(0, 200)}`);
      console.log(`BŁĄD   ${etykieta}: ${String(e).slice(0, 120)}`);
    }
  }
}
await Promise.all(Array.from({ length: ROWNOLEGLE }, pracownik));
await przegladarka.close();
console.log(`\nPorównanie ${baza} (${sha}) ↔ drzewo robocze: ${zadania.length} przebiegów; różnic stylu: ${roznicStylu}, elementów z inną geometrią: ${roznicGeometrii}, problemów struktury: ${problemyStruktury}`);
if (linie.length) console.log(linie.join('\n'));
process.exit(roznicStylu || problemyStruktury ? 1 : 0);
