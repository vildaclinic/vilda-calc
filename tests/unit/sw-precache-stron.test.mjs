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
// P-SW-LAB-PIN (decyzja właściciela 2026-09-29): ostatni wyjątek, lab_pin_result.js, zamknięty — adres przeszedł
// z OPTIONAL_DOCUMENTS (klucz dokumentu bez ?v=) do OPTIONAL_ASSETS jako /lab_pin_result.js?v=4, pod tym samym
// adresem, o który prosi przelicznik-jednostek.html. Lista zostaje na przyszłe wyjątki, każdy z powodem.
const WYJATKI = {};

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
  orderOptionalPrecacheUrls, installShell, readFromShellCache, INSTALL_CORE_URLS, INSTALL_OPTIONAL_URLS,
  isCurrentPrecacheUrl, SHELL_CACHE };`);
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

// Atrapa Cache Storage: osobne pamięci pod nazwami, jeden limit bajtów na całe źródło (jak quota) — put ponad limit
// jest odrzucany, delete zwalnia miejsce. Klucz to ścieżka z query (adres względny albo pełny w tym samym źródle).
// `wpisy` to pamięć powłoki instalowanej wersji SW.
function pamiec(limit = Infinity) {
  const pamieci = new Map();
  let zajete = 0;
  const klucz = (k) => { const u = new URL(typeof k === 'string' ? k : k.url, POCHODZENIE); return `${u.pathname}${u.search}`; };
  const rozmiarOdp = (o) => Number(o?.headers?.get('x-rozmiar')) || 0;
  const otworz = (nazwa) => {
    if (!pamieci.has(nazwa)) {
      const wpisy = new Map();
      pamieci.set(nazwa, {
        wpisy,
        async put(k, odpowiedz) {
          const kk = klucz(k);
          const poprzedni = wpisy.has(kk) ? rozmiarOdp(wpisy.get(kk)) : 0;
          if (zajete - poprzedni + rozmiarOdp(odpowiedz) > limit) throw new DOMException('Quota exceeded', 'QuotaExceededError');
          wpisy.set(kk, odpowiedz);
          zajete += rozmiarOdp(odpowiedz) - poprzedni;
        },
        async match(k) { return wpisy.get(klucz(k)); },
        async keys() { return [...wpisy.keys()].map((kk) => new Request(`${POCHODZENIE}${kk}`)); },
        async delete(k) { const kk = klucz(k); if (!wpisy.has(kk)) return false; zajete -= rozmiarOdp(wpisy.get(kk)); wpisy.delete(kk); return true; },
      });
    }
    return pamieci.get(nazwa);
  };
  const caches = {
    open: async (nazwa) => otworz(nazwa),
    keys: async () => [...pamieci.keys()],
    has: async (nazwa) => pamieci.has(nazwa),
    delete: async (nazwa) => { const c = pamieci.get(nazwa); if (!c) return false; for (const o of c.wpisy.values()) zajete -= rozmiarOdp(o); pamieci.delete(nazwa); return true; },
  };
  return { caches, otworz, get zajete() { return zajete; }, get wpisy() { return otworz(sw.SHELL_CACHE).wpisy; } };
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

  it('kolejka opcjonalna obejmuje każdy adres tablic (tablice append-only), a instalacja bierze z niej tylko wpisy bieżące', () => {
    const oczekiwane = [...new Set([...sw.OPTIONAL_DOCUMENTS, ...sw.OPTIONAL_ASSETS])].filter((u) => !RDZEN.has(u));
    expect(sw.OPTIONAL_PRECACHE_ORDER.length).toBe(oczekiwane.length);
    expect([...sw.OPTIONAL_PRECACHE_ORDER].sort()).toEqual([...oczekiwane].sort());
    expect(sw.OPTIONAL_PRECACHE_ORDER.slice(0, sw.OPTIONAL_DOCUMENTS.length)).toEqual(sw.OPTIONAL_DOCUMENTS);
    // P-SW-PRECACHE: listy instalacji to dokładnie wpisy bieżące tablic (historia zostaje w tablicach, nie w instalacji).
    expect(sw.INSTALL_OPTIONAL_URLS).toEqual(sw.OPTIONAL_PRECACHE_ORDER.filter((u) => !historyczny(u)));
    expect(sw.INSTALL_CORE_URLS).toEqual(sw.CORE_SHELL_URLS.filter((u) => !historyczny(u)));
  });

  it('zasób strony albo doładowywany z pliku JS stoi w rdzeniu albo przed całą historią', () => {
    const pierwszaHistoria = sw.OPTIONAL_PRECACHE_ORDER.findIndex(historyczny);
    expect(pierwszaHistoria, 'tablice mają historię — inaczej ten test niczego nie mierzy').toBeGreaterThan(0);
    expect(sw.OPTIONAL_PRECACHE_ORDER.slice(pierwszaHistoria).every(historyczny), 'po historii nie ma już wersji bieżących')
      .toBe(true);

    const zaHistoria = [...TOKENY_STRON, ...TOKENY_JS]
      .filter(({ token }) => PRECACHE.has(token) && historyczny(token))
      .map(({ strona, token }) => `${strona}: ${token}`);
    // Tu trafia odwołanie do STAREJ wersji pliku (także z rdzenia) — P-SW-PRECACHE: instalacja pobiera tylko wpisy
    // bieżące, więc takiego adresu nie ma w pamięci offline. Odwołuj się do najwyższej wersji.
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
    expect(wpisy.size, 'historia nie weszła — pamięć ma mniej wpisów niż tablice').toBeLessThan(istniejace.length);
    expect([...wpisy.keys()].filter(historyczny), 'P-SW-PRECACHE: żaden wpis historyczny nie jest instalowany').toEqual([]);

    const braki = [];
    for (const { strona, token } of TOKENY_STRON) {
      if (WYJATKI[plikTokenu(token)]) continue;
      if (!(await trafienie(sluzba, token))) braki.push(`${strona}: ${token}`);
    }
    expect(braki, braki.join('\n')).toEqual([]);
  });
});

// P-SW-PRECACHE (decyzja właściciela 2026-09-29): instalacja pobiera tylko wpisy bieżące, niezmienne wpisy ?v= kopiuje
// z poprzedniej pamięci powłoki, a historię starszych pamięci przycina przed instalacją. Zmierzone w Chromium na SW 1.1.103:
// 474 MB przy każdej instalacji i aktualizacji, przy łączu 20 Mb/s zdarzenie install przekraczało 5 minut i przeglądarka
// je przerywała; przy limicie źródła 1000 MiB aktualizacja padała na pierwszym wpisie. Opis: docs/clinical/ALGORITHMS.md.
describe('P-SW-PRECACHE: instalacja bez historii, kopia z poprzedniej pamięci, przycięcie historii', () => {
  // Pobrania atrapy sieci: ścieżka z query, tak jak w tablicach.
  const siecLiczaca = () => {
    const pobrane = [];
    return { pobrane, fetch: async (request) => { const u = new URL(request.url); pobrane.push(`${u.pathname}${u.search}`); return siec(request); } };
  };
  const doInstalacji = () => [...new Set([...sw.INSTALL_CORE_URLS, ...sw.INSTALL_OPTIONAL_URLS])];
  const wersjonowany = (adres) => /\?v=/.test(adres) && !sw.DOCUMENT_PATHS.has(adres.split('?')[0]);

  it('instalacja pobiera dokładnie wpisy bieżące, bez historii, w budżecie, który mieści się w limicie 5 minut na wolnym łączu', async () => {
    const { caches } = pamiec();
    const { pobrane, fetch } = siecLiczaca();
    await uruchomSW({ caches, fetch }).installShell();

    expect([...new Set(pobrane)].sort()).toEqual(doInstalacji().sort());
    expect(pobrane.filter(historyczny), 'żaden adres historyczny nie jest pobierany').toEqual([]);
    // Budżet: dziś ok. 390 adresów i 24 MB. Chromium przerywa zdarzenie install po 5 minutach — przy 8 Mb/s i 80 ms
    // opóźnienia na żądanie 24 MB zajęło 64 s, a 474 MB (historia) nie mieściło się nawet przy 20 Mb/s.
    const bajty = pobrane.reduce((suma, adres) => suma + (rozmiarPliku(adres) || 0), 0);
    expect(bajty, `instalacja pobiera ${(bajty / 1e6).toFixed(1)} MB`).toBeLessThan(40e6);
    expect(pobrane.length, `instalacja wysyła ${pobrane.length} żądań`).toBeLessThan(600);
  });

  it('aktualizacja kopiuje niezmienne wpisy ?v= z poprzedniej pamięci powłoki; dokumenty i adresy bez ?v= pobiera', async () => {
    const magazyn = pamiec();
    const stara = magazyn.otworz('pwa-kalorii-shell-v1.1.104');
    for (const adres of doInstalacji().filter(wersjonowany)) {
      if (rozmiarPliku(adres) !== null) await stara.put(adres, await siec(new Request(`${POCHODZENIE}${adres}`)));
    }
    const { pobrane, fetch } = siecLiczaca();
    await uruchomSW({ caches: magazyn.caches, fetch }).installShell();

    expect(pobrane.filter((adres) => wersjonowany(adres) && rozmiarPliku(adres) !== null), 'wpis ?v= z poprzedniej pamięci nie idzie z sieci').toEqual([]);
    expect(pobrane.length, 'dokumenty i adresy bez ?v= nadal z sieci').toBeGreaterThan(20);
    const brakujace = doInstalacji().filter((adres) => rozmiarPliku(adres) !== null && !magazyn.wpisy.has(adres));
    expect(brakujace, 'nowa pamięć powłoki ma komplet wpisów bieżących').toEqual([]);
  });

  it('pamięć sprzed SW 1.1.66 (zanim ?v= był niezmienny) nie jest źródłem kopii', async () => {
    const magazyn = pamiec();
    const stara = magazyn.otworz('pwa-kalorii-shell-v1.1.65');
    const wersjonowane = doInstalacji().filter((adres) => wersjonowany(adres) && rozmiarPliku(adres) !== null);
    for (const adres of wersjonowane) await stara.put(adres, await siec(new Request(`${POCHODZENIE}${adres}`)));
    const { pobrane, fetch } = siecLiczaca();
    await uruchomSW({ caches: magazyn.caches, fetch }).installShell();

    const zSieci = new Set(pobrane);
    expect(wersjonowane.filter((adres) => !zSieci.has(adres)), 'każdy wpis ?v= z sieci').toEqual([]);
  });

  it('przed instalacją historia w starszych pamięciach powłoki idzie do kosza; najwyższy ?v= i adresy bez ?v= zostają', async () => {
    const magazyn = pamiec();
    const stara = magazyn.otworz('pwa-kalorii-shell-v1.1.90');
    const inna = magazyn.otworz('pwa-kalorii-runtime');
    const odp = () => new Response('', { headers: { 'x-rozmiar': '10' } });
    for (const adres of ['/a.js?v=1', '/a.js?v=3', '/a.js?v=2', '/b.css?v=7', '/index.html', '/c.js', '/d.css?v=20261001v4']) await stara.put(adres, odp());
    await inna.put('/a.js?v=1', odp());
    await uruchomSW({ caches: magazyn.caches, fetch: siec }).installShell();

    expect([...stara.wpisy.keys()].sort()).toEqual(['/a.js?v=3', '/b.css?v=7', '/c.js', '/d.css?v=20261001v4', '/index.html']);
    expect([...inna.wpisy.keys()], 'pamięć czasu działania nie jest przycinana').toEqual(['/a.js?v=1']);
  });

  it('użytkownik, któremu stara pamięć zajęła cały limit źródła, instaluje nową wersję', async () => {
    const bajtyInstalacji = doInstalacji().reduce((suma, adres) => suma + (rozmiarPliku(adres) || 0), 0);
    // Po przycięciu stara pamięć trzyma swoje wpisy bieżące, a nowa kopiuje je obok — na czas aktualizacji potrzeba
    // miejsca na dwa komplety wpisów bieżących (w Chromium ok. 2 × 47 MiB). Zmierzony przypadek: limit 1000 MiB.
    const limit = Math.round(bajtyInstalacji * 3);
    const magazyn = pamiec(limit);
    const stara = magazyn.otworz('pwa-kalorii-shell-v1.1.103');
    // Stara instalacja: wpisy bieżące, a potem historia, dopóki starczy miejsca (jak SW ≤ 1.1.104).
    const kolejka = [...doInstalacji(), ...[...PRECACHE].filter(historyczny)].filter((adres) => rozmiarPliku(adres) !== null);
    for (const adres of kolejka) {
      try { await stara.put(adres, await siec(new Request(`${POCHODZENIE}${adres}`))); } catch { break; }
    }
    expect(limit - magazyn.zajete, 'stara pamięć zajmuje prawie cały limit').toBeLessThan(bajtyInstalacji * 0.1);

    const sluzba = uruchomSW({ caches: magazyn.caches, fetch: siec });
    await expect(sluzba.installShell()).resolves.toBeUndefined();
    const brakujace = sw.INSTALL_CORE_URLS.filter((adres) => !magazyn.wpisy.has(adres));
    expect(brakujace, 'rdzeń nowej wersji w komplecie').toEqual([]);
    expect([...stara.wpisy.keys()].filter(historyczny), 'historia starej pamięci przycięta').toEqual([]);
  });
});
