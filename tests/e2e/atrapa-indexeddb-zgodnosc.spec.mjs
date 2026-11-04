// Zgodność atrapy IndexedDB (tests/support/atrapa-indexeddb.mjs) z prawdziwym Chromium. Strona na
// https://atrapa-idb.invalid/ podawana przez route (bez serwera testów: kontekst bezpieczny, osobne pochodzenie, każda
// próba w nowym kontekście przeglądarki).
// Test 1 — scenariusze p1–p34 (tests/support/atrapa-indexeddb-scenariusze.mjs) dają w Chromium literał SLAD_CHROMIUM,
// który atrapa odtwarza w samoteście (tests/unit/atrapa-indexeddb.test.mjs, A1).
// Test 2 — scenariusz magazynu kolejki i kwarantanny (tests/support/scenariusz-magazynu.mjs) na sejfie z dysku
// (vilda_crypto.js, vilda_retention.js, vilda_vault.js) z bramką dziennika zdarzeń otwartą tylko na tej stronie daje
// w Chromium literał SLAD_MAGAZYNU nagrany na atrapie (tests/unit/sync-dziennik-magazyn.test.mjs). Drugie okno tej samej
// strony (window.open) trzyma połączenie z bazą kolejki podczas kasowania.
// Przy różnicy komunikat asercji i załącznik testu podają wersję przeglądarki i różniące się klucze z wartościami
// (Chromium i literał). Dane fikcyjne.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLAD_CHROMIUM, scenariuszeIDB } from '../support/atrapa-indexeddb-scenariusze.mjs';
import { SLAD_MAGAZYNU, scenariuszMagazynu } from '../support/scenariusz-magazynu.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ADRES = 'https://atrapa-idb.invalid/';
const SKRYPTY = ['vilda_crypto.js', 'vilda_retention.js', 'vilda_vault.js'];
const TYTUL = 'Fikcyjna strona magazynu';

function rozne(w, literal) {
  return Object.keys({ ...w, ...literal }).filter((k) => JSON.stringify(w[k]) !== JSON.stringify(literal[k]));
}
async function zalacz(testInfo, browser, nazwa, w, literal) {
  const r = rozne(w, literal);
  const tresc = JSON.stringify({ przegladarka: browser.version(), rozne: Object.fromEntries(r.map((k) => [k, { chromium: w[k], literal: literal[k] }])) }, null, 1);
  await testInfo.attach(nazwa, { contentType: 'application/json', body: tresc });
  return { r, opis: tresc.length > 8000 ? `${tresc.slice(0, 8000)} …` : tresc };
}

test.describe('Atrapa IndexedDB a prawdziwy Chromium', () => {
  test('p1–p34: scenariusze atrapy w Chromium = literał SLAD_CHROMIUM', async ({ page, browser }, testInfo) => {
    await page.route(`${ADRES}**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>atrapa</title>' }));
    await page.goto(ADRES);
    const w = await page.evaluate(`(${scenariuszeIDB.toString()})(indexedDB, IDBKeyRange)`);
    const { r, opis } = await zalacz(testInfo, browser, 'p1-p34', w, SLAD_CHROMIUM);
    expect(r, `klucze różne od SLAD_CHROMIUM: ${opis}`).toEqual([]);
  });

  test('scenariusz magazynu kolejki i kwarantanny w Chromium = literał SLAD_MAGAZYNU z atrapy', async ({ page, browser }, testInfo) => {
    const pliki = Object.fromEntries(SKRYPTY.map((p) => [p, readFileSync(path.join(ROOT, p), 'utf8')]));
    await page.context().route(`${ADRES}**`, (route) => {
      const plik = new URL(route.request().url()).pathname.slice(1);
      if (!plik) {
        return route.fulfill({
          status: 200, contentType: 'text/html; charset=utf-8',
          body: `<!doctype html><meta charset="utf-8"><title>${TYTUL}</title>`
            + '<script>localStorage.setItem("vildaRetention", "0")</script>'
            + SKRYPTY.map((p) => `<script src="/${p}"></script>`).join(''),
        });
      }
      if (pliki[plik]) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: pliki[plik] });
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto(ADRES);
    await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaVault._eventLog));
    const w = await page.evaluate(async ({ zrodlo, tytul }) => {
      window.VILDA_EVENT_LOG = true;
      const scenariusz = (0, eval)(`(${zrodlo})`);
      const czekaj = (ms) => new Promise((ok) => { setTimeout(ok, ms); });
      return scenariusz(window, {
        czekaj,
        drugieOkno: async () => {
          const okno = window.open(location.href);
          for (let i = 0; i < 500; i += 1) {
            try { if (okno.document.title === tytul && okno.document.readyState === 'complete') break; } catch { /* przed nawigacją */ }
            await czekaj(10);
          }
          return { indexedDB: okno.indexedDB, zamknij: () => { okno.close(); } };
        },
      });
    }, { zrodlo: scenariuszMagazynu.toString(), tytul: TYTUL });
    const { r, opis } = await zalacz(testInfo, browser, 'scenariusz-magazynu', w, SLAD_MAGAZYNU);
    expect(r, `klucze różne od SLAD_MAGAZYNU: ${opis}`).toEqual([]);
  });
});
