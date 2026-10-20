import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-SW-STRONY-PRAWNE (zlecenie właściciela 2026-10-20): „Polityka prywatności” i „Regulamin” — linki ze stopki
// stron, z bramki regulaminu (vilda_terms_gate.js) i z banera zgody (vilda_chrome.js, polityka) — nie otwierały się
// offline: nie było ich w żadnej tablicy precache, więc nawigacja kończyła się Response.error() (strona błędu
// przeglądarki). Zmierzone w prawdziwym Chromium z produkcyjnym SW i zatrzymanym serwerem.
//
// Strony dochodzą do OPTIONAL_DOCUMENTS, ale NIE dostają strategii pozostałych dokumentów (pamięć, odświeżenie w tle):
// do tej zmiany szły zawsze z sieci, więc online pokazywały bieżący tekst. Pamięć najpierw oznaczałaby, że po
// wdrożeniu nowej wersji tekstu prawnego pierwsze otwarcie pokazuje poprzednią. Dlatego dla nich najpierw sieć,
// a pamięć dopiero przy jej braku.
//
// Test wykonuje PRAWDZIWY plik service workera na atrapie Cache Storage i sieci i podaje prawdziwemu nasłuchowi fetch
// syntetyczne zdarzenie nawigacji. Kontrola negatywna usuwa warunek strategii i pokazuje, że wtedy online wraca stara
// treść. Osobne bloki: nieudany zapis kopii nie unieważnia odpowiedzi z sieci, jeśli jej treść jest cała — niezależnie
// od tego, jak silnik nazywa błąd (Chromium: QuotaExceededError; Firefox: NS_ERROR_FILE_NO_DEVICE_SPACE, nie DOMException;
// zmierzone w Chromium 141 i Firefoksie 151) — a urwany strumień działa jak brak sieci (kopia z pamięci).

const ZRODLO_SW = fs.readFileSync(path.join(korzen, 'service-worker-kalorii.js'), 'utf8');
const POCHODZENIE = 'https://vilda.test';
const STRONY_PRAWNE = ['/polityka-prywatnosci.html', '/regulamin.html'];
const WARUNEK = `NETWORK_FIRST_DOCUMENTS.has(requestedPath)
          ? undefined
          : await readFromShellCache(request)`;

const kluczAdresu = (wejscie) => {
  if (typeof wejscie === 'string') {
    const u = new URL(wejscie, POCHODZENIE);
    return u.pathname + u.search;
  }
  const u = new URL(wejscie.url);
  return u.pathname + u.search;
};

// Atrapa Cache Storage: pamięci pod nazwami, klucz to ścieżka z query (tak SW zapisuje dokumenty).
// put — jak prawdziwy Cache.put: najpierw czyta treść do końca; urwany strumień odrzuca w formie Chromium
// (DOMException NetworkError). `pelna` — wyczerpany limit źródła po odczycie treści: 'chromium' (DOMException
// QuotaExceededError, kod 22) albo 'firefox' (obiekt NS_ERROR_FILE_NO_DEVICE_SPACE, nie DOMException).
function pamiec({ pelna = false } = {}) {
  const pamieci = new Map();
  const otworz = (nazwa) => {
    if (!pamieci.has(nazwa)) pamieci.set(nazwa, new Map());
    const m = pamieci.get(nazwa);
    return {
      match: async (klucz) => {
        const r = m.get(kluczAdresu(klucz));
        return r ? r.clone() : undefined;
      },
      put: async (klucz, odpowiedz) => {
        let tresc;
        try {
          tresc = await odpowiedz.arrayBuffer();
        } catch {
          throw new DOMException('Cache.put() encountered a network error', 'NetworkError');
        }
        if (pelna === 'firefox') throw { name: 'NS_ERROR_FILE_NO_DEVICE_SPACE', result: 0x80520010, message: '' };
        if (pelna) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        m.set(kluczAdresu(klucz), new Response(tresc, { status: odpowiedz.status, headers: odpowiedz.headers }));
      },
      _wstaw: (klucz, odpowiedz) => { m.set(kluczAdresu(klucz), odpowiedz.clone()); },
      delete: async (klucz) => m.delete(kluczAdresu(klucz)),
      keys: async () => [...m.keys()].map((k) => new Request(POCHODZENIE + k)),
    };
  };
  return {
    open: async (nazwa) => otworz(nazwa),
    keys: async () => [...pamieci.keys()],
    delete: async (nazwa) => pamieci.delete(nazwa),
    has: async (nazwa) => pamieci.has(nazwa),
    match: async () => undefined,
    _otworz: otworz,
  };
}

const html = (tresc) => new Response(`<!doctype html><title>${tresc}</title>`, {
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' },
});

function uruchomSW(zrodlo, { caches, fetch }) {
  const nasluchy = {};
  const self = {
    location: new URL(`${POCHODZENIE}/service-worker-kalorii.js`),
    registration: {},
    clients: { claim: async () => {} },
    addEventListener(typ, fn) { nasluchy[typ] = fn; },
    skipWaiting() {},
  };
  const wykonaj = new Function('self', 'caches', 'fetch', `${zrodlo}
return { OPTIONAL_DOCUMENTS, DOCUMENT_PATHS, INSTALL_OPTIONAL_URLS, SHELL_CACHE };`);
  return { ...wykonaj(self, caches, fetch), nasluchy };
}

// Syntetyczne zdarzenie nawigacji: Request z mode 'navigate' nie da się zbudować poza przeglądarką, więc obiekt
// niesie dokładnie to, czego SW używa (url, method, mode, cache, headers, destination).
async function nawiguj(sw, sciezka) {
  let odpowiedz;
  const czekaj = [];
  const zdarzenie = {
    request: {
      url: POCHODZENIE + sciezka, method: 'GET', mode: 'navigate', cache: 'default',
      destination: 'document', headers: new Headers(),
    },
    respondWith(p) { odpowiedz = p; },
    waitUntil(p) { czekaj.push(p); },
  };
  sw.nasluchy.fetch(zdarzenie);
  expect(odpowiedz, `SW odpowiada na nawigację do ${sciezka}`).toBeTruthy();
  const wynik = await odpowiedz;
  await Promise.all(czekaj.map((p) => Promise.resolve(p).catch(() => undefined)));
  return wynik;
}

const tytul = async (r) => (/<title>([^<]*)<\/title>/.exec(await r.text()) || [])[1];

// Odpowiedź, której strumień urywa się w połowie treści (zerwane połączenie po nagłówkach).
const zerwana = () => new Response(new ReadableStream({
  start(c) {
    c.enqueue(new TextEncoder().encode('<!doctype html><title>nowa'));
    c.error(new TypeError('network error'));
  },
}), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

function srodowisko(zrodlo = ZRODLO_SW, { siec = true, pelna = false, odpowiedz = () => html('nowa') } = {}) {
  const caches = pamiec({ pelna });
  const zapytania = [];
  const trybyPamieci = [];
  const fetch = async (req) => {
    zapytania.push(kluczAdresu(req));
    trybyPamieci.push(req && req.cache);
    if (!siec) throw new TypeError('Failed to fetch');
    return odpowiedz();
  };
  const sw = uruchomSW(zrodlo, { caches, fetch });
  const powloka = caches._otworz(sw.SHELL_CACHE);
  return { sw, powloka, zapytania, trybyPamieci };
}

describe('P-SW-STRONY-PRAWNE: strony prawne w precache, nawigacja najpierw do sieci', () => {
  it('obie strony są w OPTIONAL_DOCUMENTS i w zestawie instalacji', () => {
    const { sw } = srodowisko();
    for (const s of STRONY_PRAWNE) {
      expect(sw.OPTIONAL_DOCUMENTS, s).toContain(s);
      expect(sw.DOCUMENT_PATHS.has(s), s).toBe(true);
      expect(sw.INSTALL_OPTIONAL_URLS, `instalacja pobiera ${s}`).toContain(s);
    }
  });

  for (const s of STRONY_PRAWNE) {
    it(`${s} online: bieżący tekst z sieci, nie z pamięci; pamięć dostaje nową treść`, async () => {
      const { sw, powloka, zapytania, trybyPamieci } = srodowisko();
      await powloka.put(s, html('stara'));
      const r = await nawiguj(sw, s);
      expect(await tytul(r)).toBe('nowa');
      expect(zapytania).toContain(s);
      expect(trybyPamieci, 'żądanie do sieci rewaliduje pamięć HTTP przeglądarki').toContain('no-cache');
      expect(await tytul(await powloka.match(s)), 'zapas offline odświeżony').toBe('nowa');
    });

    it(`${s} offline: strona z pamięci zamiast strony błędu`, async () => {
      const { sw, powloka } = srodowisko(ZRODLO_SW, { siec: false });
      await powloka.put(s, html('stara'));
      const r = await nawiguj(sw, s);
      expect(r.type).not.toBe('error');
      expect(await tytul(r)).toBe('stara');
    });
  }

  it('adres bez .html (/regulamin): online najpierw sieć, offline strona z pamięci', async () => {
    const online = srodowisko();
    await online.powloka.put('/regulamin.html', html('stara'));
    expect(await tytul(await nawiguj(online.sw, '/regulamin'))).toBe('nowa');
    const offline = srodowisko(ZRODLO_SW, { siec: false });
    await offline.powloka.put('/regulamin.html', html('stara'));
    expect(await tytul(await nawiguj(offline.sw, '/regulamin'))).toBe('stara');
  });

  it('kontrola: pozostałe dokumenty bez zmian — z pamięci, odświeżenie w tle', async () => {
    const { sw, powloka, zapytania } = srodowisko();
    await powloka.put('/kontakt.html', html('stara'));
    expect(await tytul(await nawiguj(sw, '/kontakt.html'))).toBe('stara');
    expect(zapytania, 'odświeżenie w tle nadal idzie').toContain('/kontakt.html');
    expect(await tytul(await powloka.match('/kontakt.html'))).toBe('nowa');
  });

  it('kontrola negatywna: bez warunku strategii strona prawna online pokazuje starą treść', async () => {
    expect(ZRODLO_SW.split(WARUNEK).length - 1, 'warunek strategii jest w pliku dokładnie raz').toBe(1);
    const bezWarunku = ZRODLO_SW.replace(WARUNEK, 'await readFromShellCache(request)');
    const { sw, powloka } = srodowisko(bezWarunku);
    await powloka.put('/regulamin.html', html('stara'));
    expect(await tytul(await nawiguj(sw, '/regulamin.html'))).toBe('stara');
  });
});

// Blok catch zapisu kopii nawigacji, dokładnie jak w produkcyjnym SW — i dwie wcześniejsze, błędne wersje tej poprawki.
const CATCH_PRODUKCJA = `      } catch (_) {
        void _;
        const body = await safeResponse.blob();
        return new Response(body, {
          status: safeResponse.status,
          statusText: safeResponse.statusText,
          headers: copyHeadersForSyntheticResponse(safeResponse)
        });
      }`;
const CATCH_POLYKA_KAZDY = `      } catch (_) {
        void _;
      }`;
const CATCH_PO_NAZWIE = `      } catch (error) {
        if (!error || error.name !== 'QuotaExceededError') throw error;
      }`;
const wariant = (blok) => {
  expect(ZRODLO_SW.split(CATCH_PRODUKCJA).length - 1, 'blok catch zapisu jest w SW dokładnie raz').toBe(1);
  return ZRODLO_SW.replace(CATCH_PRODUKCJA, blok);
};

describe('P-SW-STRONY-PRAWNE: nieudany zapis kopii nie unieważnia odpowiedzi z sieci, jeśli jej treść jest cała', () => {
  for (const silnik of ['chromium', 'firefox']) {
    for (const s of STRONY_PRAWNE) {
      it(`${s} online, pełny limit (${silnik}): tekst z sieci, nie stara kopia`, async () => {
        const { sw, powloka } = srodowisko(ZRODLO_SW, { pelna: silnik });
        powloka._wstaw(s, html('stara'));
        expect(await tytul(await nawiguj(sw, s))).toBe('nowa');
      });

      it(`${s} online, pełny limit (${silnik}), bez kopii: tekst z sieci, nie strona błędu`, async () => {
        const { sw } = srodowisko(ZRODLO_SW, { pelna: silnik });
        const r = await nawiguj(sw, s);
        expect(r.type).not.toBe('error');
        expect(await tytul(r)).toBe('nowa');
      });
    }

    it(`skutek dla pozostałych dokumentów (${silnik}): bez kopii i przy pełnym limicie — odpowiedź z sieci zamiast błędu`, async () => {
      const { sw } = srodowisko(ZRODLO_SW, { pelna: silnik });
      const r = await nawiguj(sw, '/kontakt.html');
      expect(r.type).not.toBe('error');
      expect(await tytul(r)).toBe('nowa');
    });
  }

  it('kontrola negatywna: rozstrzyganie po nazwie błędu (QuotaExceededError) — w Firefoksie online stara kopia', async () => {
    const { sw, powloka } = srodowisko(wariant(CATCH_PO_NAZWIE), { pelna: 'firefox' });
    powloka._wstaw('/regulamin.html', html('stara'));
    expect(await tytul(await nawiguj(sw, '/regulamin.html'))).toBe('stara');
  });
});

describe('P-SW-STRONY-PRAWNE: urwany strumień działa jak brak sieci', () => {
  for (const s of STRONY_PRAWNE) {
    it(`${s}: połączenie urwane w trakcie treści — strona z pamięci, nie pusta odpowiedź`, async () => {
      const { sw, powloka, zapytania } = srodowisko(ZRODLO_SW, { odpowiedz: zerwana });
      powloka._wstaw(s, html('stara'));
      const r = await nawiguj(sw, s);
      expect(zapytania, 'nawigacja poszła do sieci').toContain(s);
      expect(await tytul(r)).toBe('stara');
    });
  }

  it('urwany strumień przy pełnym limicie — też kopia z pamięci (urwanie wygrywa)', async () => {
    const { sw, powloka } = srodowisko(ZRODLO_SW, { odpowiedz: zerwana, pelna: 'chromium' });
    powloka._wstaw('/regulamin.html', html('stara'));
    expect(await tytul(await nawiguj(sw, '/regulamin.html'))).toBe('stara');
  });

  it('kontrola negatywna: catch połykający każdy błąd bez odczytu treści — uszkodzona odpowiedź zamiast kopii', async () => {
    const { sw, powloka } = srodowisko(wariant(CATCH_POLYKA_KAZDY), { odpowiedz: zerwana });
    powloka._wstaw('/regulamin.html', html('stara'));
    const r = await nawiguj(sw, '/regulamin.html');
    await expect(r.text()).rejects.toThrow();
  });
});
