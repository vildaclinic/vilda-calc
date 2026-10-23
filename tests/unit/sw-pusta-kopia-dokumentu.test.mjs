import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-SW-PUSTA-KOPIA (2026-10-20) — pusta kopia dokumentu po zapisie przy pełnym limicie pamięci.
//
// Zmierzone w Firefoksie (151 z Playwright i 158.0.1 bez automatyzacji, limit źródła obniżony preferencją
// dom.quotaManager.temporaryStorage.fixedLimit): gdy źródło jest kilka bajtów do ok. 12 KB od limitu, cache.put treści
// mniejszej niż 64 KiB zwykle się UDAJE, ale zapisuje 0 B; treść od 64 KiB jest odrzucana zwykłym obiektem
// {name: 'NS_ERROR_FILE_NO_DEVICE_SPACE'}, nie DOMException. Odświeżenie w tle nadpisywało dobrą kopię dokumentu
// (cache-first) pustą treścią, a następna wizyta dostawała pustą stronę.
//
// Strażnik wykonuje PRAWDZIWY plik service workera (bez kopii reguły), z atrapą Cache Storage, która przy pełnym
// limicie zachowuje się jak zmierzony Firefox, i z atrapą sieci. Kontrola negatywna: ten sam plik z zapisem bez
// odczytu kontrolnego (stan sprzed poprawki) — te same scenariusze muszą wtedy dać pustą stronę.

const ZRODLO_SW = fs.readFileSync(path.join(korzen, 'service-worker-kalorii.js'), 'utf8');
const WZORZEC_ZAPISU = /async function storeDocumentCopyVerified\(cache, key, response\) \{[\s\S]*?\n\}\n/;
const ZRODLO_BEZ_KONTROLI = ZRODLO_SW.replace(
  WZORZEC_ZAPISU,
  'async function storeDocumentCopyVerified(cache, key, response) {\n  await cache.put(key, response.clone());\n  return true;\n}\n'
);
const POCHODZENIE = 'https://vilda.test';
const PROG_ODRZUCENIA = 64 * 1024;

function uruchomSW({ zrodlo = ZRODLO_SW, caches, fetch }) {
  const sluchacze = {};
  const self = {
    location: new URL(`${POCHODZENIE}/service-worker-kalorii.js`),
    registration: {},
    clients: { claim: async () => {} },
    addEventListener(typ, obsluga) { sluchacze[typ] = obsluga; },
    skipWaiting() {},
  };
  const wykonaj = new Function('self', 'caches', 'fetch', `${zrodlo}
return { SHELL_CACHE, installShell };`);
  return { ...wykonaj(self, caches, fetch), sluchacze };
}

// Dokument o zadanym rozmiarze z rozpoznawalną treścią.
function dokument(znacznik, bajty) {
  const poczatek = `<!doctype html><html lang="pl"><title>${znacznik}</title><p data-znacznik="${znacznik}">`;
  const koniec = '</p></html>';
  return poczatek + 'x'.repeat(Math.max(0, bajty - poczatek.length - koniec.length)) + koniec;
}

// Atrapa Cache Storage: wpis to bajty treści, status i nagłówki; match oddaje za każdym razem nową odpowiedź.
// Jeden limit bajtów na całe źródło. Ponad limitem — jak zmierzony Firefox: nowa treść jest zapisywana, zanim zniknie
// stara, więc liczy się zajęte + nowa; treść < 64 KiB → put się udaje, wpis ma 0 B (stara treść zwolniona); treść
// od 64 KiB → odrzucenie zwykłym obiektem, wpis bez zmian. `stan.wymus(klucz)` może narzucić wynik zapisu bez względu
// na limit: 'pusty' (put się udaje, wpis ma 0 B) albo 'odrzuc'.
function pamiec({ limit = Infinity, wymus = () => null } = {}) {
  const pamieci = new Map();
  const stan = { limit, wymus, zajete: 0, zapisy: [] };
  const klucz = (k) => {
    const adres = new URL(typeof k === 'string' ? k : k.url, POCHODZENIE);
    return `${adres.pathname}${adres.search}`;
  };
  const otworz = (nazwa) => {
    if (!pamieci.has(nazwa)) {
      const wpisy = new Map();
      const zapisz = (kk, body, odpowiedz) => {
        const stary = wpisy.get(kk)?.body.byteLength || 0;
        wpisy.set(kk, { body, status: odpowiedz.status, statusText: odpowiedz.statusText, headers: [...odpowiedz.headers] });
        stan.zajete += body.byteLength - stary;
      };
      pamieci.set(nazwa, {
        wpisy,
        async put(k, odpowiedz) {
          const kk = klucz(k);
          const body = await odpowiedz.arrayBuffer();
          stan.zapisy.push({ nazwa, klucz: kk, bajty: body.byteLength });
          const wynik = stan.wymus(kk) || (stan.zajete + body.byteLength > stan.limit
            ? (body.byteLength < PROG_ODRZUCENIA ? 'pusty' : 'odrzuc')
            : null);
          if (wynik === 'odrzuc') throw { name: 'NS_ERROR_FILE_NO_DEVICE_SPACE' };
          zapisz(kk, wynik === 'pusty' ? new ArrayBuffer(0) : body, odpowiedz);
        },
        async match(k) {
          const wpis = wpisy.get(klucz(k));
          return wpis ? new Response(wpis.body.slice(0), { status: wpis.status, statusText: wpis.statusText, headers: wpis.headers }) : undefined;
        },
        async keys() { return [...wpisy.keys()].map((kk) => new Request(`${POCHODZENIE}${kk}`)); },
        async delete(k) {
          const kk = klucz(k);
          if (!wpisy.has(kk)) return false;
          stan.zajete -= wpisy.get(kk).body.byteLength;
          wpisy.delete(kk);
          return true;
        },
      });
    }
    return pamieci.get(nazwa);
  };
  const caches = {
    open: async (nazwa) => otworz(nazwa),
    keys: async () => [...pamieci.keys()],
    has: async (nazwa) => pamieci.has(nazwa),
    delete: async (nazwa) => pamieci.delete(nazwa),
  };
  return { caches, otworz, stan };
}

// Atrapa sieci: tresci[ścieżka] albo 404; `online: false` — błąd sieci jak przy braku połączenia.
function siec(tresci) {
  const stan = { online: true };
  const fetch = async (zadanie) => {
    if (!stan.online) throw new TypeError('Failed to fetch');
    const sciezka = new URL(typeof zadanie === 'string' ? zadanie : zadanie.url).pathname;
    const tresc = typeof tresci === 'function' ? tresci(sciezka) : tresci[sciezka];
    return tresc === undefined
      ? new Response('', { status: 404 })
      : new Response(tresc, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  };
  return { fetch, stan };
}

// Zdarzenie fetch jak w przeglądarce: odpowiedź dla strony i praca w tle (event.waitUntil), na którą czekamy.
async function wyslij(sw, zadanie) {
  let odpowiedz;
  const wTle = [];
  sw.sluchacze.fetch({ request: zadanie, respondWith(p) { odpowiedz = p; }, waitUntil(p) { wTle.push(p); } });
  const wynik = await odpowiedz;
  await Promise.all(wTle);
  return wynik;
}

// Nawigacja: Request z trybem 'navigate' nie da się zbudować poza przeglądarką, więc obiekt z polami, których używa SW.
const nawigacja = (sw, sciezka) => wyslij(sw, {
  url: `${POCHODZENIE}${sciezka}`, method: 'GET', mode: 'navigate', headers: new Headers(), destination: 'document', cache: 'default',
});

async function trescWpisu(magazyn, sw, kk) {
  const wpis = await magazyn.otworz(sw.SHELL_CACHE).match(kk);
  return wpis ? wpis.text() : null;
}

// Kontakt (ok. 20 KB, jak kontakt.html) z dobrą kopią w pamięci powłoki i nową wersją w sieci.
async function kontaktZKopia({ zrodlo, wymus = () => null, limitWolne = null } = {}) {
  const STARA = dokument('kontakt-stara', 20_657);
  const NOWA = dokument('kontakt-nowa', 20_700);
  const magazyn = pamiec();
  const net = siec({ '/kontakt.html': NOWA });
  const sw = uruchomSW({ zrodlo, caches: magazyn.caches, fetch: net.fetch });
  await magazyn.otworz(sw.SHELL_CACHE).put('/kontakt.html', new Response(STARA, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }));
  magazyn.stan.zapisy.length = 0;
  magazyn.stan.wymus = wymus;
  if (limitWolne !== null) magazyn.stan.limit = magazyn.stan.zajete + limitWolne;
  return { STARA, NOWA, magazyn, net, sw };
}

describe('P-SW-PUSTA-KOPIA: pusta kopia dokumentu nie zastępuje dobrej', () => {
  it('strażnik podmienia w kontroli negatywnej prawdziwą funkcję zapisu', () => {
    expect(WZORZEC_ZAPISU.test(ZRODLO_SW), 'storeDocumentCopyVerified w pliku SW').toBe(true);
    expect(ZRODLO_BEZ_KONTROLI).not.toBe(ZRODLO_SW);
  });

  it('pełny limit jak w Firefoksie: odświeżenie w tle zostawia poprzednią kopię, kolejne wizyty nie są puste', async () => {
    // 100 B wolnego: nowa treść (ok. 20 KB) się nie mieści, więc put „udaje się” z wpisem 0 B.
    const { STARA, magazyn, net, sw } = await kontaktZKopia({ limitWolne: 100 });

    expect(await (await nawigacja(sw, '/kontakt.html')).text(), 'pierwsza wizyta z cache').toBe(STARA);
    expect(magazyn.stan.zapisy.map((z) => z.bajty), 'nowa kopia, potem ponowne wstawienie poprzedniej')
      .toEqual([20_700, 20_657]);
    expect(await trescWpisu(magazyn, sw, '/kontakt.html'), 'poprzednia kopia przetrwała').toBe(STARA);

    net.stan.online = false;
    expect(await (await nawigacja(sw, '/kontakt.html')).text(), 'wizyta offline').toBe(STARA);

    net.stan.online = true;
    const online = await nawigacja(sw, '/kontakt.html');
    expect(online.status).toBe(200);
    expect(await online.text(), 'następna wizyta online').toBe(STARA);
    expect(await trescWpisu(magazyn, sw, '/kontakt.html'), 'po kolejnym odświeżeniu w tle').toBe(STARA);
  });

  it('kontrola negatywna: bez odczytu kontrolnego ten sam scenariusz daje pustą stronę online i offline', async () => {
    const { STARA, magazyn, net, sw } = await kontaktZKopia({ zrodlo: ZRODLO_BEZ_KONTROLI, limitWolne: 100 });

    expect(await (await nawigacja(sw, '/kontakt.html')).text()).toBe(STARA);
    expect(await trescWpisu(magazyn, sw, '/kontakt.html'), 'dobra kopia nadpisana pustą').toBe('');

    net.stan.online = false;
    const offline = await nawigacja(sw, '/kontakt.html');
    expect(offline.status).toBe(200);
    expect(await offline.text(), 'pusta strona offline').toBe('');

    net.stan.online = true;
    expect(await (await nawigacja(sw, '/kontakt.html')).text(), 'pusta strona przy następnej wizycie online').toBe('');
  });

  it('miejsce jest: nowa kopia zastępuje starą jednym zapisem', async () => {
    const { NOWA, magazyn, sw } = await kontaktZKopia();

    await nawigacja(sw, '/kontakt.html');
    expect(magazyn.stan.zapisy.map((z) => z.bajty)).toEqual([20_700]);
    expect(await trescWpisu(magazyn, sw, '/kontakt.html')).toBe(NOWA);
  });

  it('pusta treść także przy ponownym wstawieniu: wpis znika — online strona z sieci, offline błąd sieci, nie pusta strona', async () => {
    const { NOWA, magazyn, net, sw } = await kontaktZKopia({ wymus: (kk) => (kk === '/kontakt.html' ? 'pusty' : null) });

    await nawigacja(sw, '/kontakt.html');
    expect(magazyn.stan.zapisy.length, 'nowa kopia i próba ponownego wstawienia poprzedniej').toBe(2);
    expect(await trescWpisu(magazyn, sw, '/kontakt.html'), 'bez pustego wpisu').toBeNull();

    // Bez kopii nawigacja czeka na sieć; zapis znów zawodzi, ale strona dostaje to, co przyszło.
    expect(await (await nawigacja(sw, '/kontakt.html')).text(), 'online').toBe(NOWA);
    expect(await trescWpisu(magazyn, sw, '/kontakt.html')).toBeNull();

    net.stan.online = false;
    const offline = await nawigacja(sw, '/kontakt.html');
    expect(offline.type, 'offline: błąd sieci zamiast pustego dokumentu 200').toBe('error');
  });

  it('kontrola negatywna: wymuszona pusta treść bez odczytu kontrolnego zostaje w pamięci i offline daje pusty dokument 200', async () => {
    const { magazyn, net, sw } = await kontaktZKopia({
      zrodlo: ZRODLO_BEZ_KONTROLI,
      wymus: (kk) => (kk === '/kontakt.html' ? 'pusty' : null),
    });

    await nawigacja(sw, '/kontakt.html');
    expect(await trescWpisu(magazyn, sw, '/kontakt.html')).toBe('');
    net.stan.online = false;
    const offline = await nawigacja(sw, '/kontakt.html');
    expect(offline.status).toBe(200);
    expect(await offline.text()).toBe('');
  });

  it('odrzucenie zwykłym obiektem (treść od 64 KiB): poprzednia kopia nietknięta, bez ponownego zapisu', async () => {
    const STARA = dokument('start-stara', 149_061);
    const NOWA = dokument('start-nowa', 149_100);
    const magazyn = pamiec();
    const sw = uruchomSW({ caches: magazyn.caches, fetch: siec({ '/index.html': NOWA }).fetch });
    await magazyn.otworz(sw.SHELL_CACHE).put('/index.html', new Response(STARA, { status: 200 }));
    magazyn.stan.zapisy.length = 0;
    magazyn.stan.limit = magazyn.stan.zajete + 1_000;

    expect(await (await nawigacja(sw, '/index.html')).text()).toBe(STARA);
    expect(magazyn.stan.zapisy.map((z) => z.bajty), 'jedna (odrzucona) próba, bez przepisywania starej kopii')
      .toEqual([149_100]);
    expect(await trescWpisu(magazyn, sw, '/index.html')).toBe(STARA);
  });

  it('bez kopii w pamięci i z odrzuconym zapisem strona online dostaje odpowiedź z sieci (wcześniej: błąd sieci)', async () => {
    const NOWA = dokument('start-nowa', 149_100);
    for (const [zrodlo, oczekiwane] of [[ZRODLO_SW, NOWA], [ZRODLO_BEZ_KONTROLI, null]]) {
      const magazyn = pamiec({ limit: 1_000 });
      const sw = uruchomSW({ zrodlo, caches: magazyn.caches, fetch: siec({ '/index.html': NOWA }).fetch });
      const odpowiedz = await nawigacja(sw, '/index.html');
      if (oczekiwane === null) {
        expect(odpowiedz.type, 'kontrola negatywna: odrzucony zapis przerywał odpowiedź').toBe('error');
      } else {
        expect(odpowiedz.status).toBe(200);
        expect(await odpowiedz.text()).toBe(oczekiwane);
      }
      expect(await trescWpisu(magazyn, sw, '/index.html')).toBeNull();
    }
  });

  it('dokument pobrany poza nawigacją (ten sam klucz co kopia z nawigacji) też nie zostawia pustej kopii', async () => {
    const { STARA, magazyn, sw } = await kontaktZKopia({ limitWolne: 100 });

    expect(await (await wyslij(sw, new Request(`${POCHODZENIE}/kontakt.html`))).text()).toBe(STARA);
    expect(magazyn.stan.zapisy.length, 'ścieżka zasobów też sprawdza zapis dokumentu').toBe(2);
    expect(await trescWpisu(magazyn, sw, '/kontakt.html')).toBe(STARA);
  });
});

describe('P-SW-PUSTA-KOPIA: instalacja nie wpuszcza pustej kopii dokumentu do nowej pamięci powłoki', () => {
  const tresc = (sciezka) => (sciezka.endsWith('.html') ? dokument(sciezka, 2_000) : `/* ${sciezka} */`);
  const instaluj = async ({ zrodlo, wymus }) => {
    const magazyn = pamiec({ wymus });
    const net = siec(tresc);
    const sw = uruchomSW({ zrodlo, caches: magazyn.caches, fetch: net.fetch });
    let blad = null;
    await sw.installShell().catch((e) => { blad = e; });
    return { magazyn, net, sw, blad };
  };

  it('dokument opcjonalny zapisany jako 0 B: bez wpisu (offline błąd sieci, nie pusta strona), reszta instalacji bez zmian', async () => {
    const { magazyn, net, sw, blad } = await instaluj({ wymus: (kk) => (kk === '/kontakt.html' ? 'pusty' : null) });

    expect(blad).toBeNull();
    expect(await trescWpisu(magazyn, sw, '/kontakt.html')).toBeNull();
    expect(await trescWpisu(magazyn, sw, '/terminarz.html')).toBe(tresc('/terminarz.html'));
    expect(await trescWpisu(magazyn, sw, '/index.html')).toBe(tresc('/index.html'));

    net.stan.online = false;
    expect((await nawigacja(sw, '/kontakt.html')).type).toBe('error');
    expect(await (await nawigacja(sw, '/terminarz.html')).text()).toBe(tresc('/terminarz.html'));
  });

  it('wymagany dokument główny zapisany jako 0 B: instalacja się nie kończy, więc zostaje poprzednia wersja SW', async () => {
    const { magazyn, sw, blad } = await instaluj({ wymus: (kk) => (kk === '/index.html' ? 'pusty' : null) });

    expect(String(blad?.message)).toContain('/index.html');
    expect(await trescWpisu(magazyn, sw, '/index.html')).toBeNull();
  });

  it('kontrola negatywna: bez odczytu kontrolnego instalacja kończy się z pustym dokumentem głównym', async () => {
    const { magazyn, sw, blad } = await instaluj({
      zrodlo: ZRODLO_BEZ_KONTROLI,
      wymus: (kk) => (kk === '/index.html' ? 'pusty' : null),
    });

    expect(blad).toBeNull();
    expect(await trescWpisu(magazyn, sw, '/index.html')).toBe('');
  });
});
