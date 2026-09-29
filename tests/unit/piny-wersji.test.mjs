import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-PINY-WERSJI (zlecenie właściciela 2026-09-14) — zamiast pamiętać o kilkunastu miejscach,
// niech pilnuje ich test.
//
// Rytuał wydania wymaga zgodności kilku list, których nic dotąd nie porównywało. W ciągu
// jednego dnia potknąłem się o to TRZY RAZY, za każdym razem dowiadując się o tym z czerwonego
// CI, nie od siebie:
//   • `SW_VERSION` podbity w service workerze, ale nie w pinie `klirens-ui-model.test.mjs`
//     (dwa razy, przy różnych zmianach);
//   • `?v=` podbity na stronach, ale nie w `EXPECTED_BROWSER_SCRIPTS` w `vilda_smoke_tests.js`.
//
// Przy pisaniu tego pliku wyszła czwarta, starsza usterka tej samej rodziny: rytuał podbijał
// wyłącznie trzy „główne" strony (index, docpro, klirens), a `app.html`, `ustawienia.html`,
// `terminarz.html`, `notatki.html`, `subskrypcja.html` i strony statyczne zostawały w tyle.
// PIĘTNAŚCIE plików było ładowanych w dwóch różnych wersjach naraz — `vilda_vault.js` jako
// `?v=178` na pięciu stronach i `?v=181` na trzech. Ten sam plik pod dwoma kluczami cache.

const HTML = fs.readdirSync(korzen).filter((f) => f.endsWith('.html')).sort();
const WZORZEC = /(['"])([A-Za-z0-9_./-]+\.(?:js|css|mjs))\?v=(\d+)\1/g;

function czytaj(wzgledna) {
  return fs.readFileSync(path.join(korzen, wzgledna), 'utf8');
}

/* Tokeny `plik?v=N` ze wszystkich stron. Łapiemy oba rodzaje cudzysłowów, bo część stron
 * dokłada skrypty z wnętrza `<script>` (np. `var SRC_MICROS = 'nutrition_micros.js?v=28'`). */
function tokenyStron() {
  const out = [];
  for (const strona of HTML) {
    const tresc = czytaj(strona);
    for (const m of tresc.matchAll(WZORZEC)) {
      out.push({ strona, plik: m[2], wersja: Number(m[3]), token: `${m[2]}?v=${m[3]}` });
    }
  }
  return out;
}

function precacheSW() {
  return new Set([...czytaj('service-worker-kalorii.js').matchAll(/'\/([^']+\?v=\d+)'/g)]
    .map((m) => m[1]));
}

describe('Jeden plik — jedna wersja na wszystkich stronach', () => {
  it('żaden plik nie jest ładowany w dwóch różnych wersjach', () => {
    const wersje = new Map();
    for (const { plik, wersja, strona } of tokenyStron()) {
      if (!wersje.has(plik)) wersje.set(plik, new Map());
      const dla = wersje.get(plik);
      if (!dla.has(wersja)) dla.set(wersja, []);
      dla.get(wersja).push(strona);
    }

    const rozjazdy = [...wersje.entries()]
      .filter(([, dla]) => dla.size > 1)
      .map(([plik, dla]) => `${plik}: ${[...dla.entries()]
        .map(([w, strony]) => `v=${w} (${strony.join(', ')})`).join(' | ')}`);

    // Podbicie wersji na części stron to nie jest „częściowe wydanie" — to ten sam plik pod
    // dwoma kluczami cache, z których jeden może serwować starą treść z pamięci przeglądarki.
    expect(rozjazdy, rozjazdy.join('\n')).toEqual([]);
  });

  it('każdy zapinowany plik naprawdę istnieje', () => {
    const brakujace = [...new Set(tokenyStron()
      .filter(({ plik }) => !fs.existsSync(path.join(korzen, plik)))
      .map(({ plik, strona }) => `${plik} (${strona})`))];
    expect(brakujace, brakujace.join('\n')).toEqual([]);
  });
});

describe('Listy, które muszą mówić to samo', () => {
  it('EXPECTED_BROWSER_SCRIPTS zgadza się z tym, co ładuje index.html', () => {
    const smoke = czytaj('vilda_smoke_tests.js');
    const od = smoke.indexOf('EXPECTED_BROWSER_SCRIPTS');
    const blok = smoke.slice(od, smoke.indexOf(']', od));
    const lista = [...blok.matchAll(/'([^']+\?v=\d+)'/g)].map((m) => m[1]);
    expect(lista.length, 'lista ma sens tylko wtedy, gdy nie jest pusta').toBeGreaterThan(10);

    const naStronie = new Set(tokenyStron()
      .filter(({ strona }) => strona === 'index.html').map(({ token }) => token));
    // Jedyny wyjątek: sam zestaw smoke nie stoi w markupie — dokłada go `application.spec.mjs`.
    const rozjazd = lista.filter((t) => !t.startsWith('vilda_smoke_tests.js?v=') && !naStronie.has(t));
    expect(rozjazd, `tokeny z listy, których index.html nie ładuje:\n${rozjazd.join('\n')}`).toEqual([]);
  });

  it('zestaw smoke jest dokładany w tej samej wersji, którą pinuje', () => {
    const wLiscie = /vilda_smoke_tests\.js\?v=(\d+)/.exec(czytaj('vilda_smoke_tests.js'));
    const wTescie = /\/vilda_smoke_tests\.js\?v=(\d+)/.exec(czytaj('tests/e2e/application.spec.mjs'));
    expect(wLiscie, 'pin w EXPECTED_BROWSER_SCRIPTS').toBeTruthy();
    expect(wTescie, 'addScriptTag w application.spec.mjs').toBeTruthy();
    expect(wTescie[1], 'rozjazd zapala smoke „script-cache-versions"').toBe(wLiscie[1]);
  });

  it('SW_VERSION zgadza się z pinem w teście Klirensu', () => {
    const wSW = /const SW_VERSION = '([^']+)'/.exec(czytaj('service-worker-kalorii.js'));
    const wTescie = /const SW_VERSION = '([^']+)'/.exec(czytaj('tests/unit/klirens-ui-model.test.mjs'));
    expect(wSW, 'SW_VERSION w service workerze').toBeTruthy();
    expect(wTescie, 'pin SW_VERSION w klirens-ui-model.test.mjs').toBeTruthy();
    expect(wTescie[1], 'to jest ten pin, o który potknąłem się dwa razy').toBe(wSW[1]);
  });

  it('wersja kolektora zgadza się z pinem w zestawie smoke', () => {
    const wModule = /const he="([\d.]+)"/.exec(czytaj('vilda_data_import_export.js'));
    const wSmoke = /dataApi\.version === '([\d.]+)'/.exec(czytaj('vilda_smoke_tests.js'));
    expect(wModule, 'stała wersji w vilda_data_import_export.js').toBeTruthy();
    expect(wSmoke, 'pin wersji w vilda_smoke_tests.js').toBeTruthy();
    expect(wSmoke[1]).toBe(wModule[1]);
  });
});

// Service worker wstępnie pobiera zasoby z tablicy `PRECACHE_URLS`, dopisywanej wyłącznie
// na końcu (historia wszystkich wydanych wersji). Plik, którego bieżącego tokenu tam nie ma,
// nie jest pobierany z góry — offline ratuje go dopiero cache czasu działania, czyli po
// pierwszej wizycie ONLINE. To nie jest awaria, ale jest luka, więc pilnujemy, żeby nie rosła.
describe('Zasoby poza wstępnym pobraniem service workera', () => {
  // P-SLOWA-MPH rata 3 (2026-09-28): lab_clinical_panels.js wrócił do precache (wpis ?v=143), lista skurczyła się o jeden.
  // P-SW-DOCPRO (decyzja właściciela 2026-09-28): vilda_sync, vilda_sync_integration, vilda_session_bridge,
  // vilda_data_safety_explainer, vilda_obesity_banner.css i ustawienia.css dopisane do precache — bez nich
  // DocPro nie startował offline. P-SW-LAB-PIN (2026-09-29): lab_pin_result.js wrócił do precache jako ?v=4 —
  // lista jest pusta i ma taka zostać.
  const ZNANE = [];

  it('lista plików bez wstępnego pobrania nie rośnie', () => {
    const precache = precacheSW();
    const poza = [...new Set(tokenyStron()
      .filter(({ token }) => !precache.has(token))
      .map(({ plik }) => plik))].sort();

    // Nowy plik na tej liście znaczy, że ktoś dołożył zasób do strony i nie dopisał go
    // do tablicy service workera — najczęściej przez pominięcie kroku rytuału wydania.
    const nowe = poza.filter((p) => !ZNANE.includes(p));
    expect(nowe, `pliki bez wstępnego pobrania, dopisane po ustaleniu tej listy:\n${nowe.join('\n')}`)
      .toEqual([]);
    expect(poza.length, 'lista skurczyła się — zaktualizuj ZNANE').toBe(ZNANE.length);
  });
});

// Rata 4b bis / recenzja #462 (2026-09-29): skrypty też dokładają zasoby z `?v=` — `vilda_chrome.js` i
// `vilda_session_bridge.js` wstrzykiwały `vilda_auth_ui.css?v=17`, `vilda_vault.js?v=11`, `vilda_auth_ui.js?v=53`…
// na 14 stronach bez własnych linków, podczas gdy strony linkowały 75, 187, 465. Pod kontrolą service workera klucz
// historyczny trzyma bieżącą treść (precache pobiera go na nowo przy każdej wersji SW), ale bez SW o świeżości decyduje
// pamięć HTTP przeglądarki. Ten test pilnuje, by adres wstrzykiwany z JS miał tę samą wersję, którą linkują strony.
describe('Adresy wstrzykiwane z JS mają wersję ze stron', () => {
  const JS = fs.readdirSync(korzen).filter((f) => f.endsWith('.js') && !f.startsWith('service-worker')).sort();
  it('każdy token plik?v=N w skrypcie zgadza się z wersją tego pliku na stronach', () => {
    const naStronach = new Map();
    for (const { plik, wersja } of tokenyStron()) naStronach.set(plik, wersja);
    const rozjazdy = [];
    for (const skrypt of JS) {
      for (const m of czytaj(skrypt).matchAll(WZORZEC)) {
        const plik = m[2].replace(/^\//, '');
        const wersja = Number(m[3]);
        if (!naStronach.has(plik)) continue; // plik ładowany wyłącznie ze skryptu: skrypt jest źródłem wersji
        if (naStronach.get(plik) !== wersja) rozjazdy.push(`${skrypt}: ${plik}?v=${wersja}, strony ładują ?v=${naStronach.get(plik)}`);
      }
    }
    expect([...new Set(rozjazdy)], rozjazdy.join('\n')).toEqual([]);
  });
});
