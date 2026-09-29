import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-SW-DOCPRO (decyzja właściciela 2026-09-28) — DocPro nie startował offline.
//
// Zmierzone w prawdziwym Chromium (produkcyjny SW zarejestrowany przez aplikację, instalacja
// zakończona, potem offline i przeładowanie /docpro.html). Dwie niezależne przyczyny:
//
// 1. Pięć zasobów DocPro nie miało wstępnego pobrania: vilda_sync, vilda_sync_integration,
//    vilda_session_bridge, vilda_data_safety_explainer, vilda_obesity_banner.css. Ta sama luka
//    dotyczyła ustawienia.css (Ustawienia) i edu-video-ui.css z nieliczbowym ?v= (instrukcje wideo).
// 2. Wpisy, które W TABLICY SĄ, też nie docierały do pamięci. Instalacja pobiera ok. 2,5 tys.
//    adresów — hosting ignoruje ?v=, więc każdy historyczny adres to pełna kopia bieżącego pliku,
//    razem ok. 470 MB, a Chromium dokłada do tego pamięć podręczną kodu. Limit pamięci źródła
//    kończył się w połowie OPTIONAL_ASSETS, cache.put kolejnych wpisów był odrzucany, a błąd wpisu
//    opcjonalnego — połykany. Nowe wersje dopisuje się zwykle na końcu tablic, więc ginęły właśnie
//    wersje bieżące: app.js?v=228, vilda_auth_ui.js?v=465, vilda_advanced_growth.js?v=72 i dalsze.
//
// Strażnik wykonuje PRAWDZIWY plik service workera (bez kopii reguły) z atrapą Cache Storage
// z limitem bajtów i atrapą sieci, która oddaje rozmiary plików z dysku.

const ZRODLO_SW = fs.readFileSync(path.join(korzen, 'service-worker-kalorii.js'), 'utf8');
const POCHODZENIE = 'https://vilda.test';
// Dowolna wartość ?v=, nie tylko liczba: edu-video-ui.css jest ładowany jako ?v=20261001v4 i ?v=20261001v7,
// a SW traktuje jako niezmienny każdy adres z parametrem v (isImmutableVersionedRequest).
const WZORZEC = /(['"])([A-Za-z0-9_./-]+\.(?:js|css|mjs))\?v=([A-Za-z0-9._-]+)\1/g;

// Zasoby ładowane bez ?v= (src/href własnego pochodzenia) — też muszą przeżyć brak sieci.
const WZORZEC_BEZ_WERSJI = /\b(?:src|href)=(["'])(?!https?:|\/\/|data:|#|mailto:|tel:|javascript:)([^"'?#]+\.(?:js|mjs|css|json|png|jpe?g|webp|svg|ico))\1/g;

// Zasoby doładowywane z plików JS, które ŚWIADOMIE nie są zasobem aplikacji.
const POMIJANE_W_JS = {
  'vilda_smoke_tests.js': 'zestaw smoke dokłada wyłącznie test e2e (application.spec.mjs); strony go nie ładują',
};

// Zasoby stron z precache, które ŚWIADOMIE zostają bez wstępnego pobrania — każdy z powodem.
const WYJATKI = {
  'lab_pin_result.js':
    'adres /lab_pin_result.js stoi w OPTIONAL_DOCUMENTS, więc precache zapisuje go pod kluczem dokumentu bez ?v=, '
    + 'a przelicznik-jednostek.html prosi o lab_pin_result.js?v=4 — samo dopisanie adresu do tablicy nic nie da; '
    + 'naprawa wymaga zmiany kluczy dokumentów w SW (osobna decyzja)',
};

function uruchomSW({ caches = null, fetch = null } = {}) {
  const self = {
    location: new URL(`${POCHODZENIE}/service-worker-kalorii.js`),
    registration: {},
    clients: { claim: async () => {} },
    addEventListener() {},
    skipWaiting() {},
  };
  const wykonaj = new Function('self', 'caches', 'fetch', `${ZRODLO_SW}
return { CORE_SHELL_URLS, OPTIONAL_DOCUMENTS, OPTIONAL_ASSETS, DOCUMENT_PATHS, OPTIONAL_PRECACHE_ORDER,
  orderOptionalPrecacheUrls, installShell, readFromShellCache };`);
  return wykonaj(self, caches, fetch);
}

const rozmiarPliku = (adres) => {
  try {
    return fs.statSync(path.join(korzen, decodeURIComponent(adres.split('?')[0]))).size;
  } catch {
    return null;
  }
};

// Atrapa sieci: odpowiedź bez treści, z rozmiarem pliku w nagłówku; brak pliku → 404.
async function siec(request) {
  const rozmiar = rozmiarPliku(new URL(request.url).pathname);
  return rozmiar === null
    ? new Response('', { status: 404 })
    : new Response('', { status: 200, headers: { 'x-rozmiar': String(rozmiar) } });
}

// Atrapa Cache Storage z limitem bajtów, jak quota źródła: put ponad limit jest odrzucany.
function pamiec(limit = Infinity) {
  const wpisy = new Map();
  let zajete = 0;
  const cache = {
    async put(klucz, odpowiedz) {
      const rozmiar = Number(odpowiedz.headers.get('x-rozmiar')) || 0;
      const poprzedni = wpisy.has(klucz) ? Number(wpisy.get(klucz).headers.get('x-rozmiar')) || 0 : 0;
      if (zajete - poprzedni + rozmiar > limit) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      wpisy.set(klucz, odpowiedz);
      zajete += rozmiar - poprzedni;
    },
    async match(klucz) {
      return wpisy.get(klucz);
    },
  };
  return { caches: { open: async () => cache }, wpisy };
}

const sw = uruchomSW();
const RDZEN = new Set(sw.CORE_SHELL_URLS);
const PRECACHE = new Set([...sw.CORE_SHELL_URLS, ...sw.OPTIONAL_DOCUMENTS, ...sw.OPTIONAL_ASSETS]);
const STRONY = [...sw.DOCUMENT_PATHS].filter((adres) => adres.endsWith('.html'));

function tokenyPliku(wzgledna) {
  const tresc = fs.readFileSync(path.join(korzen, wzgledna), 'utf8');
  return [...new Set([...tresc.matchAll(WZORZEC)].map((m) => `/${m[2].replace(/^\.?\//, '')}?v=${m[3]}`))];
}

const TOKENY_STRON = STRONY.flatMap((strona) => tokenyPliku(strona.slice(1)).map((token) => ({ strona, token })));
const plikTokenu = (token) => token.slice(1).split('?')[0];

const BEZ_WERSJI_STRON = STRONY.flatMap((strona) => {
  const tresc = fs.readFileSync(path.join(korzen, strona.slice(1)), 'utf8');
  return [...new Set([...tresc.matchAll(WZORZEC_BEZ_WERSJI)].map((m) => `/${m[2].replace(/^\.?\//, '')}`))]
    .map((adres) => ({ strona, adres }));
});

const PLIKI_JS = fs.readdirSync(korzen).filter((f) => f.endsWith('.js') && f !== 'service-worker-kalorii.js').sort();
const TOKENY_JS = PLIKI_JS.flatMap((plik) => tokenyPliku(plik).map((token) => ({ strona: plik, token })));

// Wpis historyczny = adres z ?v=, dla którego tablice SW mają wyższą wersję tego samego pliku.
const NAJWYZSZA = new Map();
for (const adres of PRECACHE) {
  const m = /^([^?]+)\?v=(\d+)$/.exec(adres);
  if (m) NAJWYZSZA.set(m[1], Math.max(NAJWYZSZA.get(m[1]) || 0, Number(m[2])));
}
const historyczny = (adres) => {
  const m = /^([^?]+)\?v=(\d+)$/.exec(adres);
  return Boolean(m) && NAJWYZSZA.get(m[1]) > Number(m[2]);
};

async function trafienie(sluzbaSW, token) {
  return Boolean(await sluzbaSW.readFromShellCache(new Request(`${POCHODZENIE}${token}`)));
}

describe('P-SW-DOCPRO: strony z precache startują offline', () => {
  it('strażnik widzi strony, które mają znaczenie', () => {
    for (const strona of ['/index.html', '/docpro.html', '/kalkulator-klirens.html', '/ustawienia.html', '/app.html']) {
      expect(STRONY, strona).toContain(strona);
    }
    expect(TOKENY_STRON.filter(({ strona }) => strona === '/docpro.html').length).toBeGreaterThan(100);
  });

  it('po instalacji każdy zasób z ?v= tych stron jest w pamięci pod kluczem, o który strona poprosi', async () => {
    const { caches } = pamiec();
    const sluzba = uruchomSW({ caches, fetch: siec });
    await sluzba.installShell();

    const braki = [];
    for (const { strona, token } of TOKENY_STRON) {
      if (WYJATKI[plikTokenu(token)]) continue;
      if (!(await trafienie(sluzba, token))) braki.push(`${strona}: ${token}`);
    }
    // Brak na tej liście to strona, która offline startuje bez modułu. Dopisz adres na końcu
    // OPTIONAL_ASSETS (append-only) i podbij SW_VERSION.
    expect(braki, braki.join('\n')).toEqual([]);

    const brakiBezWersji = [];
    for (const { strona, adres } of BEZ_WERSJI_STRON) {
      if (!(await trafienie(sluzba, adres))) brakiBezWersji.push(`${strona}: ${adres}`);
    }
    expect(BEZ_WERSJI_STRON.length, 'strony ładują też zasoby bez ?v= — inaczej ta część niczego nie mierzy')
      .toBeGreaterThan(20);
    expect(brakiBezWersji, brakiBezWersji.join('\n')).toEqual([]);
  });

  it('zasób doładowywany z pliku JS (np. leniwy moduł sejfu z vilda_chrome.js) też jest w pamięci', async () => {
    const { caches } = pamiec();
    const sluzba = uruchomSW({ caches, fetch: siec });
    await sluzba.installShell();

    const braki = [];
    for (const { strona, token } of TOKENY_JS) {
      if (POMIJANE_W_JS[plikTokenu(token)]) continue;
      if (!(await trafienie(sluzba, token))) braki.push(`${strona}: ${token}`);
    }
    expect(TOKENY_JS.length).toBeGreaterThan(20);
    expect(braki, braki.join('\n')).toEqual([]);
  });

  it('każdy wyjątek jest nadal prawdziwy — strona go ładuje, a offline go nie ma', async () => {
    const { caches } = pamiec();
    const sluzba = uruchomSW({ caches, fetch: siec });
    await sluzba.installShell();

    for (const [plik, powod] of Object.entries(WYJATKI)) {
      expect(powod.length).toBeGreaterThan(40);
      const tokeny = TOKENY_STRON.filter(({ token }) => plikTokenu(token) === plik);
      expect(tokeny.length, `${plik}: żadna strona z precache go nie ładuje — usuń wyjątek`).toBeGreaterThan(0);
      for (const { token } of tokeny) {
        expect(await trafienie(sluzba, token), `${token}: jest już w pamięci offline — usuń wyjątek`).toBe(false);
      }
    }
  });
});

describe('P-SW-DOCPRO: przy wyczerpanym limicie pamięci giną wpisy historyczne, nie bieżące', () => {
  it('kolejność opcjonalnego precache: dokumenty i wersje bieżące, potem historia', () => {
    expect(sw.orderOptionalPrecacheUrls(
      ['/a.js?v=1', '/b.js'],
      ['/x.html'],
      ['/a.js?v=2', '/c.js?v=1', '/c.js?v=3', '/c.js?v=2', '/b.js', '/d.png', '/a.js?v=1', '/d.png'],
    )).toEqual(['/x.html', '/a.js?v=2', '/c.js?v=3', '/d.png', '/c.js?v=1', '/c.js?v=2']);
  });

  it('żaden adres nie znika z instalacji — zmienia się tylko kolejność (append-only)', () => {
    const oczekiwane = [...new Set([...sw.OPTIONAL_DOCUMENTS, ...sw.OPTIONAL_ASSETS])].filter((u) => !RDZEN.has(u));
    expect(sw.OPTIONAL_PRECACHE_ORDER.length).toBe(oczekiwane.length);
    expect([...sw.OPTIONAL_PRECACHE_ORDER].sort()).toEqual([...oczekiwane].sort());
    expect(sw.OPTIONAL_PRECACHE_ORDER.slice(0, sw.OPTIONAL_DOCUMENTS.length)).toEqual(sw.OPTIONAL_DOCUMENTS);
  });

  it('zasób strony albo doładowywany z pliku JS stoi w rdzeniu albo przed całą historią', () => {
    const pierwszaHistoria = sw.OPTIONAL_PRECACHE_ORDER.findIndex(historyczny);
    expect(pierwszaHistoria, 'tablice mają historię — inaczej ten test niczego nie mierzy').toBeGreaterThan(0);
    expect(sw.OPTIONAL_PRECACHE_ORDER.slice(pierwszaHistoria).every(historyczny), 'po historii nie ma już wersji bieżących')
      .toBe(true);

    const zaHistoria = [...TOKENY_STRON, ...TOKENY_JS]
      .filter(({ token }) => PRECACHE.has(token) && !RDZEN.has(token))
      .filter(({ token }) => sw.OPTIONAL_PRECACHE_ORDER.indexOf(token) >= pierwszaHistoria)
      .map(({ strona, token }) => `${strona}: ${token}`);
    // Tu trafia odwołanie do STAREJ wersji pliku spoza rdzenia — przy wyczerpanym limicie zginie
    // pierwsze. Odwołuj się do najwyższej wersji albo przenieś adres do CORE_SHELL_URLS.
    expect(zaHistoria, zaHistoria.join('\n')).toEqual([]);
  });

  it('limit mieszczący rdzeń i wersje bieżące wystarcza, by każda strona z precache miała komplet', async () => {
    const bajty = (adresy) => adresy.reduce((suma, adres) => suma + (rozmiarPliku(adres) || 0), 0);
    const opcjonalne = [...new Set([...sw.OPTIONAL_DOCUMENTS, ...sw.OPTIONAL_ASSETS])].filter((u) => !RDZEN.has(u));
    const limit = bajty([...RDZEN]) + bajty(opcjonalne.filter((u) => !historyczny(u)));

    const { caches, wpisy } = pamiec(limit);
    const sluzba = uruchomSW({ caches, fetch: siec });
    await sluzba.installShell();

    const istniejace = [...PRECACHE].filter((u) => rozmiarPliku(u) !== null);
    expect(wpisy.size, 'limit naprawdę zadziałał — część historii nie weszła').toBeLessThan(istniejace.length);

    const braki = [];
    for (const { strona, token } of TOKENY_STRON) {
      if (WYJATKI[plikTokenu(token)]) continue;
      if (!(await trafienie(sluzba, token))) braki.push(`${strona}: ${token}`);
    }
    expect(braki, braki.join('\n')).toEqual([]);
  });
});
