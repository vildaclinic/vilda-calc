// P-CIEN-POZA-LISTA (PR-S4, decyzja właściciela 2026-10-26, 5b): w trybie chmurowym kopie robocze kosza (cień, D4 = a)
// nigdy na dysku — żyją tylko w pamięci dokumentu, który wykonał scalenie, najwyżej do wylogowania (znikają też przy
// blokadzie, F5 i wyjściu poza powłokę; inna instancja sejfu tego konta ich nie widzi). Adapter trybu chmurowego trzyma
// metadane konta (z listą nagrobków) w trwałej bazie urządzenia (IndexedDB vilda_user_<id>; tu: adapter w pamięci R w tej
// roli), a wersje kart i od teraz magazyn cienia — w części sesyjnej. Lista w trwałej bazie niesie same zaślepki
// { iv, cien: 1 }. Część sesyjna zapisuje zrzut do sessionStorage, ale bez cienia (limit sessionStorage: 5 242 879 znaków
// w Chromium 141, pomiar 2026-10-26; cień z R20 — 300 rekordów po ok. 24 KB — sam ma więcej). Testy ograniczeń (W1, W2
// przeglądu wariantu V): zaślepka bez rekordu w tej instancji i druga instancja sejfu — wynik jak f612fe09 (kosz z treścią
// innych urządzeń), bez wyjątku. Prawdziwy vilda_vault.js, sztuczny zegar, dane wyłącznie fikcyjne („Testowy Jan”).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  repo, SEJF, sztucznyZegar, przesunZegar, zegar, urzadzenie, sync, rundy, jan, zapisz, poprawMase, przytnij, doKosza, widoki, gdzie, stan,
} from './polkrata-uprzaz.mjs';

const M = 60e3;
const ZRZUT = 'veph:cloud-only:per-user-v1'; // klucz zrzutu części sesyjnej trybu chmurowego (bn w vilda_vault.js)
const LIMIT_CHROMIUM = 5_242_880; // znaków na pochodzenie (klucze + wartości), Chromium 141 headless
afterEach(() => { vi.useRealTimers(); });
const tick = () => new Promise((r) => { setTimeout(r, 20); });

// sessionStorage z limitem jak w przeglądarce: setItem ponad limit rzuca QuotaExceededError i zostawia starą wartość.
function magazynSesji(limit = Infinity) {
  const m = new Map();
  const st = { odmowy: 0 };
  const rozmiar = () => { let n = 0; for (const [k, v] of m) n += k.length + v.length; return n; };
  return Object.assign(st, {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const s = String(v);
      const po = rozmiar() - (m.has(k) ? k.length + m.get(k).length : 0) + k.length + s.length;
      if (po > limit) { st.odmowy += 1; const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, s);
    },
    removeItem: (k) => { m.delete(k); },
    key: (i) => Array.from(m.keys())[i] || null,
    get length() { return m.size; },
    rozmiar,
  });
}
function lokalny() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); },
    key: (i) => Array.from(m.keys())[i] || null, get length() { return m.size; } };
}
function okno(ss, ls, locks) {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: ls, sessionStorage: ss, ...(locks ? { navigator: { locks } } : {}),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {}, AbortController,
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
  };
  win.window = win; win.self = win; win.top = win;
  for (const f of ['vilda_crypto.js', 'vilda_retention.js', SEJF.N]) new Function('window', 'globalThis', readFileSync(path.join(repo, f), 'utf8'))(win, win);
  return win;
}
// „Trwała baza” urządzenia (rola IndexedDB vilda_user_<id>) z licznikiem rekordów cienia, które do niej trafiły.
function trwala(v) {
  const baza = v.createInMemoryAdapter();
  const licz = { cienZapis: 0, cienUsun: 0 };
  const px = new Proxy(baza, { get(cel, k) {
    const f = cel[k];
    if (typeof f !== 'function') return f;
    if (k === 'writeSnapshotShadowsForUser') return async (uid, rek, usun) => { licz.cienZapis += (rek || []).length; licz.cienUsun += (usun || []).length; return f.call(cel, uid, rek, usun); };
    return f.bind(cel);
  } });
  return { px, licz };
}
let nr = 0;
async function chmurowe(nazwa, opcje = {}) {
  nr += 1;
  const ss = opcje.ss || magazynSesji(opcje.limit);
  const ls = opcje.ls || lokalny();
  ls.setItem('vildaRetention', '0');
  const v = okno(ss, ls).VildaVault;
  const t = opcje.t || trwala(v);
  v.setStorageAdapter(t.px);
  const haslo = `Chmura#S4!2026${nr}aa`;
  await v.createUser(haslo, { label: `${nazwa}${nr}`, iterations: 10000, storageMode: 'cloud-only' });
  const [uz] = await v.listUsers();
  Object.assign(v, { __nazwa: nazwa, __R: t.px, __licz: t.licz, __uid: uz.userId, __haslo: haslo, __ss: ss, __ls: ls, __t: t });
  return v;
}
// Przeładowanie strony w tej samej karcie: nowy kod, ten sam sessionStorage, localStorage i trwała baza (klucz sesji
// odświeżony jak przy pracy lekarza — sztuczny zegar przeskakuje godziny).
async function przeladuj(v) {
  v.refreshPersistedSession(true);
  const n = okno(v.__ss, v.__ls).VildaVault;
  n.setStorageAdapter(v.__R);
  const ok = await n.tryRestoreSession();
  Object.assign(n, { __nazwa: v.__nazwa, __R: v.__R, __licz: v.__licz, __uid: v.__uid, __haslo: v.__haslo, __ss: v.__ss, __ls: v.__ls, __t: v.__t, __ok: ok });
  return n;
}
async function trwaleCienie(v) {
  const meta = (await v.__R.getUserMeta(v.__uid)) || {};
  const lista = meta.snapshotTombstones || [];
  return {
    rekordy: (await v.__R.listSnapshotShadowKeysForUser(v.__uid)).length,
    zaslepki: lista.filter((e) => e.Bpk && e.Bpk.t && e.Bpk.t.c && e.Bpk.t.c.cien === 1).map((e) => e.Bpk.t.c.iv),
    szyfryCieniaWLiscie: lista.filter((e) => e.Bpk && e.Bpk.t && e.Bpk.t.c && typeof e.Bpk.t.c.data === 'string').length,
    wersje: (await v.__R.listPatientsForUser(v.__uid)).length,
  };
}
// Scenariusz bazowy (jak polkrata-cien M2): K zapisuje 12 wersji; P w trybie chmurowym poprawia czwartą na 58 i wysyła
// do C; C przycina (zna 58); P scala C — u P cień 58 (11 wersji przyciętych na C).
async function przygotuj() {
  sztucznyZegar();
  const K = await urzadzenie('K'), C = await urzadzenie('C');
  const P = await chmurowe('P');
  let pid = null; const ids = [];
  for (let i = 0; i < 12; i += 1) { const r = await zapisz(K, jan(100 + i, 20 + i), pid ? { patientId: pid } : {}); pid = r.patientId; ids.push(r.snapshotId); }
  przesunZegar(M); await sync(K, P); await sync(K, C);
  const sid = ids[3];
  przesunZegar(M); await poprawMase(P, sid, 58);
  przesunZegar(M); await sync(P, C);
  przesunZegar(M); await przytnij(C, sid);
  przesunZegar(M); await sync(C, P);
  return { P, K, C, sid };
}

describe('P-CIEN-POZA-LISTA: adapter w pamięci — kopie robocze nigdy w zrzucie', () => {
  it('zrzut do sessionStorage (persistKey) bez magazynu cienia; po odtworzeniu z zrzutu — 0 rekordów, metadane są', async () => {
    const ss = magazynSesji(), ls = lokalny();
    const v = okno(ss, ls).VildaVault;
    const a = v.createInMemoryAdapter({ persistKey: 'test-zrzut' });
    await a.putUserMeta('u1', { snapshotTombstones: [{ snapshotId: 's1', Bpk: { t: { c: { iv: 'IV-TEST-1', cien: 1 } } } }] });
    await a.writeSnapshotShadowsForUser('u1', [
      { key: 'IV-TEST-1', c: { iv: 'IV-TEST-1', data: 'SZYFR-TESTOWY-1' }, patientId: 'p1', snapshotId: 's1', od: '2026-10-26T09:00:00.000Z' },
      { key: 'IV-TEST-2', c: { iv: 'IV-TEST-2', data: 'SZYFR-TESTOWY-2' }, patientId: 'p1', snapshotId: 's2', od: '2026-10-26T09:00:00.000Z' },
    ], []);
    expect((await a.listSnapshotShadowKeysForUser('u1')).sort()).toEqual(['IV-TEST-1', 'IV-TEST-2']);
    expect((await a.getSnapshotShadowForUser('u1', 'IV-TEST-2')).c.data).toBe('SZYFR-TESTOWY-2');
    a.flushPersist(); await tick();
    const zrzut = ss.getItem('test-zrzut');
    expect(zrzut, 'zrzut metadanych jest').toContain('IV-TEST-1');
    expect(zrzut, 'zrzut bez szyfrów cienia').not.toContain('SZYFR-TESTOWY');
    expect(zrzut, 'zrzut bez mapy cienia').not.toContain('"cienie"');
    const b = okno(ss, ls).VildaVault.createInMemoryAdapter({ persistKey: 'test-zrzut' });
    expect((await b.getUserMeta('u1')).snapshotTombstones.length, 'metadane odtworzone').toBe(1);
    expect(await b.listSnapshotShadowKeysForUser('u1'), 'cień nie przeżywa przeładowania').toEqual([]);
    await a.writeSnapshotShadowsForUser('u1', [], ['IV-TEST-1']);
    expect(await a.listSnapshotShadowKeysForUser('u1')).toEqual(['IV-TEST-2']);
    await a.deleteUserDatabase('u1');
    expect(await a.listSnapshotShadowKeysForUser('u1'), 'usunięcie konta zabiera cień').toEqual([]);
  });
});

describe('P-CIEN-POZA-LISTA: tryb chmurowy — cień tylko w pamięci dokumentu, najwyżej do wylogowania (decyzja 5b)', () => {
  it('cień w części sesyjnej: w trwałej bazie 0 rekordów i lista z samymi zaślepkami; zrzut sesji bez cienia; kosz 58 w sesji', async () => {
    const { P, K, C, sid } = await przygotuj();
    expect(P.isCloudOnlyAdapterActive()).toBe(true);
    const tr = await trwaleCienie(P);
    expect(tr.wersje, 'karty w trwałej bazie: 0 (tylko w sesji)').toBe(0);
    expect(tr.rekordy, 'rekordy cienia w trwałej bazie').toBe(0);
    expect(P.__licz.cienZapis, 'żaden rekord cienia nie trafił do trwałej bazy').toBe(0);
    expect(tr.szyfryCieniaWLiscie, 'lista w trwałej bazie bez szyfrów cienia').toBe(0);
    expect(tr.zaslepki.length, 'zaślepki cienia (11 wersji przyciętych na C)').toBe(11);
    await tick();
    const zrzut = P.__ss.getItem(ZRZUT) || '';
    expect(zrzut.length, 'zrzut części sesyjnej jest').toBeGreaterThan(0);
    for (const iv of tr.zaslepki) expect(zrzut.includes(iv), `zrzut sesji bez szyfru cienia ${iv}`).toBe(false);
    // Cień działa w sesji: K (stara kopia 23) daje do kosza — kosz 58 (treść z cienia P) na trzech.
    przesunZegar(M); await doKosza(K, sid);
    przesunZegar(M); await sync(K, P);
    await rundy([P, K, C]);
    expect(await widoki({ P, K, C }, sid)).toEqual({ P: 'kosz 58', K: 'kosz 58', C: 'kosz 58' });
    expect((await trwaleCienie(P)).rekordy).toBe(0);
    expect(P.__licz.cienZapis).toBe(0);
  }, 120_000);

  for (const powod of ['manual', 'user', 'idle']) {
    it(`blokada „${powod}”: w trwałej bazie 0 rekordów cienia, zrzut sesji bez cienia; po ponownym logowaniu cień jak wygasły (kosz 23), bez wyjątku`, async () => {
      const { P, K, C, sid } = await przygotuj();
      const zaslepki = (await trwaleCienie(P)).zaslepki;
      expect(zaslepki.length).toBe(11);
      P.lock(powod);
      await tick();
      expect(P.isCloudOnlyAdapterActive(), 'część sesyjna odpięta').toBe(false);
      const po = await trwaleCienie(P);
      expect(po.rekordy, 'po blokadzie: rekordy cienia w trwałej bazie').toBe(0);
      expect(po.szyfryCieniaWLiscie).toBe(0);
      expect(P.__licz.cienZapis).toBe(0);
      const zrzut = P.__ss.getItem(ZRZUT) || '';
      for (const iv of zaslepki) expect(zrzut.includes(iv), `po blokadzie zrzut bez szyfru cienia ${iv}`).toBe(false);
      for (let i = 0; i < P.__ss.length; i += 1) {
        const k = P.__ss.key(i);
        for (const iv of zaslepki) expect(String(P.__ss.getItem(k)).includes(iv), `sessionStorage[${k}] bez cienia`).toBe(false);
      }
      // Ponowne logowanie: nowa część sesyjna (karty z chmury — tu: ponowne scalenie), cień nie wraca.
      await P.unlockUser(P.__uid, P.__haslo);
      expect(P.isCloudOnlyAdapterActive()).toBe(true);
      przesunZegar(M); await sync(C, P);
      przesunZegar(M); await doKosza(K, sid);
      let blad = null;
      try { przesunZegar(M); await sync(K, P); await rundy([P, K, C]); } catch (er) { blad = String(er && er.message); }
      expect(blad).toBe(null);
      expect(await widoki({ P, K, C }, sid), 'cień P zniknął z sesją — treść kosza z K').toEqual({ P: 'kosz 23', K: 'kosz 23', C: 'kosz 23' });
      expect((await trwaleCienie(P)).rekordy).toBe(0);
    }, 120_000);
  }

  // W2P-1 (weryfikacja poprawki W3): uid konta i adapter cienia ustalone w tej samej chwili, przed pierwszym await
  // w Bkz_zmienListe. Blokada w odstępie między nimi (przygotowanie Z4) podmieniała I() na trwałą bazę (ur), a uid dalej
  // wskazywało konto — 11 pełnych szyfrów cienia trafiało na dysk i przeżywało wylogowanie (wbrew 5b). Blokada po każdym
  // wywołaniu trwałej bazy w scaleniu C→P, w którym powstaje 11 cieni: w każdym punkcie 0 rekordów cienia w trwałej bazie;
  // gdzie lista zapisała się już po blokadzie (rekordy w odpiętej części sesyjnej) — po ponownym logowaniu kosz 23 na trzech.
  for (const powod of ['manual', 'idle']) {
    it(`W2P-1: blokada „${powod}” po każdym wywołaniu trwałej bazy w scaleniu C→P — 0 rekordów cienia w trwałej bazie; lista zapisana po blokadzie: po ponownym logowaniu kosz 23 na trzech`, async () => {
      // Każdy przebieg od tej samej chwili (retencja zostawia ostatnią wersję dnia — dalsze testy nie mogą przejść przez północ).
      const t0 = zegar.t;
      const przebieg = async (po) => {
        zegar.t = t0; sztucznyZegar();
        const st = { uzbrojone: false, n: 0, po, P: null, gdzie: null, listaPoBlokadzie: false };
        const ss = magazynSesji(), ls = lokalny();
        const t = trwala(okno(ss, ls).VildaVault);
        const hak = new Proxy(t.px, { get(cel, k) {
          const f = cel[k];
          if (typeof f !== 'function') return f;
          return async (...a) => {
            if (st.gdzie && k === 'putUserMeta' && ((a[1] && a[1].snapshotTombstones) || []).some((e) => e.Bpk && e.Bpk.t && e.Bpk.t.c)) st.listaPoBlokadzie = true;
            const r = await f.apply(cel, a);
            if (st.uzbrojone && (st.n += 1) === st.po) { st.uzbrojone = false; st.gdzie = String(k); st.P.lock(powod); }
            return r;
          };
        } });
        const K = await urzadzenie('K'), C = await urzadzenie('C');
        const P = await chmurowe('P', { t: { px: hak, licz: t.licz }, ss, ls });
        st.P = P;
        let pid = null; const ids = [];
        for (let i = 0; i < 12; i += 1) { const r = await zapisz(K, jan(100 + i, 20 + i), pid ? { patientId: pid } : {}); pid = r.patientId; ids.push(r.snapshotId); }
        przesunZegar(M); await sync(K, P); await sync(K, C);
        const sid = ids[3];
        przesunZegar(M); await poprawMase(P, sid, 58);
        przesunZegar(M); await sync(P, C);
        przesunZegar(M); await przytnij(C, sid);
        const przed = P.__licz.cienZapis;
        st.uzbrojone = true;
        try { przesunZegar(M); await sync(C, P); } catch { /* blokada przed zapisem karty — „Zaloguj się…”, jak f612fe09 */ }
        st.uzbrojone = false;
        await tick();
        return { P, K, C, sid, st, zapisy: P.__licz.cienZapis - przed, tr: await trwaleCienie(P) };
      };
      try {
        const bez = await przebieg(Infinity);
        expect(bez.tr.zaslepki.length, 'bez blokady: 11 cieni').toBe(11);
        const N = bez.st.n;
        expect(N, 'wywołania trwałej bazy w scaleniu').toBeGreaterThan(4);
        const poBlokadzie = [];
        for (let i = 1; i <= N; i += 1) {
          const w = await przebieg(i);
          const gdzie = `blokada po wywołaniu ${i}/${N} (${w.st.gdzie})`;
          expect(w.tr.rekordy, `${gdzie}: rekordy cienia w trwałej bazie`).toBe(0);
          expect(w.zapisy, `${gdzie}: zapisy rekordów cienia do trwałej bazy`).toBe(0);
          expect(w.tr.szyfryCieniaWLiscie, `${gdzie}: szyfry cienia w trwałej liście`).toBe(0);
          if (!w.st.listaPoBlokadzie) continue;
          poBlokadzie.push(i);
          await w.P.unlockUser(w.P.__uid, w.P.__haslo);
          przesunZegar(M); await sync(w.C, w.P);
          przesunZegar(M); await doKosza(w.K, w.sid);
          przesunZegar(M); await sync(w.K, w.P);
          await rundy([w.P, w.K, w.C]);
          expect(await widoki({ P: w.P, K: w.K, C: w.C }, w.sid), `${gdzie}: cień w odpiętej części sesyjnej — treść kosza z K`).toEqual({ P: 'kosz 23', K: 'kosz 23', C: 'kosz 23' });
          expect((await trwaleCienie(w.P)).rekordy, `${gdzie}: po ponownym logowaniu`).toBe(0);
        }
        expect(poBlokadzie.length, 'punkty, w których lista zapisuje się po blokadzie (okno W2P-1 wśród nich)').toBeGreaterThan(0);
        console.info(`[W2P-1 ${powod}] wywołań ${N}, lista zapisana po blokadzie w punktach ${poBlokadzie.join(', ')}`);
      } finally { zegar.t = t0; }
    }, 600_000);
  }

  // M10 (decyzja właściciela 2026-10-26, 1: S4V-MP4 = b): „Usuń pacjenta” zdejmuje cień karty także w trybie chmurowym —
  // zaślepki tej karty znikają z trwałej listy, rekordy z części sesyjnej (ta sama partia sprzątania). Krawędź D-21: K nie
  // wie o usunięciu, zapisuje nową wizytę i daje starą kopię (23) do kosza — kosz 23 na trzech (z cieniem byłoby 58).
  it('M10: „Usuń pacjenta” w trybie chmurowym — 0 zaślepek tej karty w trwałej liście, 0 rekordów w trwałej bazie; krawędź D-21: kosz 23 na trzech', async () => {
    const { P, K, C, sid } = await przygotuj();
    const pid = (await gdzie(K, sid)).pid;
    expect((await trwaleCienie(P)).zaslepki.length, 'przed: 11 zaślepek').toBe(11);
    przesunZegar(M); await P.removePatient(pid);
    const po = await trwaleCienie(P);
    expect({ zaslepki: po.zaslepki.length, rekordy: po.rekordy, szyfry: po.szyfryCieniaWLiscie }, 'po „Usuń pacjenta”').toEqual({ zaslepki: 0, rekordy: 0, szyfry: 0 });
    expect(P.__licz.cienZapis, 'żaden rekord cienia nie trafił do trwałej bazy').toBe(0);
    przesunZegar(M); await zapisz(K, jan(120, 40), { patientId: pid });
    przesunZegar(M); await doKosza(K, sid);
    let blad = null;
    try { przesunZegar(M); await sync(K, P); await rundy([P, K, C]); } catch (er) { blad = String(er && er.message); }
    expect(blad).toBe(null);
    expect((await P.listPatients()).some((k) => k.patientId === pid), 'karta przeżywa (D-21)').toBe(true);
    expect(await widoki({ P, K, C }, sid)).toEqual({ P: 'kosz 23', K: 'kosz 23', C: 'kosz 23' });
    expect((await trwaleCienie(P)).rekordy).toBe(0);
  }, 120_000);

  // M11 (decyzja 1 na całej flocie): „Usuń pacjenta” na K przychodzi do P (tryb chmurowy) synchronizacją — końcowy zapis
  // listy scalenia zdejmuje zaślepki tej karty z trwałej listy, a rekordy z części sesyjnej. Sprawdzenie zachowaniem
  // (rekordów części sesyjnej test nie widzi): D, które o usunięciu nie wie i nie zna przycięcia, zapisuje nową wizytę (karta
  // wraca, D-21) i daje do kosza swoją starą kopię czwartej wersji (23) — kosz 23 na czterech; na 1da487ce cień 58 w sesji P
  // dawał kosz 58.
  it('M11: „Usuń pacjenta” na K dochodzi do P w trybie chmurowym — 0 zaślepek tej karty w trwałej liście, 0 rekordów w trwałej bazie; cień z sesji też znika (D-21 z D: kosz 23 na czterech)', async () => {
    sztucznyZegar();
    const K = await urzadzenie('K'), C = await urzadzenie('C'), D = await urzadzenie('D');
    const P = await chmurowe('P');
    let pid = null; const ids = [];
    for (let i = 0; i < 12; i += 1) { const r = await zapisz(K, jan(100 + i, 20 + i), pid ? { patientId: pid } : {}); pid = r.patientId; ids.push(r.snapshotId); }
    przesunZegar(M); await sync(K, P); await sync(K, C); await sync(K, D);
    const sid = ids[3];
    przesunZegar(M); await poprawMase(P, sid, 58);
    przesunZegar(M); await sync(P, C);
    przesunZegar(M); await przytnij(C, sid);
    przesunZegar(M); await sync(C, P);
    expect((await trwaleCienie(P)).zaslepki.length, 'przed: 11 zaślepek').toBe(11);
    przesunZegar(M); await K.removePatient(pid);
    przesunZegar(M); await sync(K, P);
    expect((await P.listPatients()).some((k) => k.patientId === pid), 'karta usunięta synchronizacją').toBe(false);
    const po = await trwaleCienie(P);
    expect({ zaslepki: po.zaslepki.length, rekordy: po.rekordy, szyfry: po.szyfryCieniaWLiscie }, 'po scaleniu usunięcia').toEqual({ zaslepki: 0, rekordy: 0, szyfry: 0 });
    expect(P.__licz.cienZapis, 'żaden rekord cienia nie trafił do trwałej bazy').toBe(0);
    przesunZegar(M); await zapisz(D, jan(130, 33), { patientId: pid });
    przesunZegar(M); await doKosza(D, sid);
    let blad = null;
    try { przesunZegar(M); await sync(D, P); await rundy([P, K, C, D]); } catch (er) { blad = String(er && er.message); }
    expect(blad).toBe(null);
    expect((await P.listPatients()).some((k) => k.patientId === pid), 'karta wraca (D-21)').toBe(true);
    expect(await widoki({ P, K, C, D }, sid)).toEqual({ P: 'kosz 23', K: 'kosz 23', C: 'kosz 23', D: 'kosz 23' });
    expect((await trwaleCienie(P)).rekordy).toBe(0);
    expect(P.__licz.cienZapis).toBe(0);
  }, 180_000);

  it('przeładowanie w trybie chmurowym: karta wraca z zrzutu sesji, cień nie (jak wygasły), bez wyjątku', async () => {
    const { P, K, C, sid } = await przygotuj();
    const przed = await P.listPatients();
    const wersjePrzed = (await P.getPatient(przed[0].patientId)).snapshots.map((s) => s.snapshotId);
    expect(wersjePrzed.length, 'po scaleniu przycięcia C: jedna wersja w karcie P').toBe(1);
    await tick();
    const P2 = await przeladuj(P);
    expect(P2.__ok, 'sesja odtworzona').toBe(true);
    expect(P2.isCloudOnlyAdapterActive()).toBe(true);
    const po = await P2.listPatients();
    expect(po.map((k) => k.patientId), 'karta z zrzutu sesji').toEqual(przed.map((k) => k.patientId));
    expect((await P2.getPatient(po[0].patientId)).snapshots.map((s) => s.snapshotId)).toEqual(wersjePrzed);
    expect(await gdzie(P2, sid), 'wersja przycięta — tylko w cieniu').toBe(null);
    przesunZegar(M); await doKosza(K, sid);
    let blad = null;
    try { przesunZegar(M); await sync(K, P2); await rundy([P2, K, C]); } catch (er) { blad = String(er && er.message); }
    expect(blad).toBe(null);
    expect(await widoki({ P: P2, K, C }, sid), 'cień 58 zniknął z przeładowaniem — treść kosza z K').toEqual({ P: 'kosz 23', K: 'kosz 23', C: 'kosz 23' });
    expect((await trwaleCienie(P2)).rekordy).toBe(0);
  }, 120_000);

  it('konto przełączone z trybu lokalnego: rekordy cienia z trwałej bazy przechodzą do części sesyjnej przy pierwszym użyciu', async () => {
    sztucznyZegar();
    const K = await urzadzenie('K'), C = await urzadzenie('C');
    const P = await urzadzenie('P'); // tryb lokalny: magazyn cienia w „IndexedDB” (__px)
    let pid = null; const ids = [];
    for (let i = 0; i < 12; i += 1) { const r = await zapisz(K, jan(100 + i, 20 + i), pid ? { patientId: pid } : {}); pid = r.patientId; ids.push(r.snapshotId); }
    przesunZegar(M); await sync(K, P); await sync(K, C);
    const sid = ids[3];
    przesunZegar(M); await poprawMase(P, sid, 58);
    przesunZegar(M); await sync(P, C);
    przesunZegar(M); await przytnij(C, sid);
    przesunZegar(M); await sync(C, P);
    expect((await P.__px.listSnapshotShadowKeysForUser(P.__uid)).length, 'tryb lokalny: 11 rekordów w trwałej bazie').toBe(11);
    await P.setStorageMode(P.__uid, 'cloud-only');
    P.lock('manual');
    await P.unlockUser(P.__uid, P.__haslo);
    expect(P.isCloudOnlyAdapterActive()).toBe(true);
    przesunZegar(M); await sync(K, P); // wersje kart do części sesyjnej (w chmurze — z serwera)
    przesunZegar(M); await doKosza(K, sid);
    przesunZegar(M); await sync(K, P);
    expect((await P.__px.listSnapshotShadowKeysForUser(P.__uid)).length, 'po pierwszym użyciu w trybie chmurowym: 0 rekordów w trwałej bazie').toBe(0);
    await rundy([P, K, C]);
    expect(await widoki({ P, K, C }, sid), 'treść cienia przeniesiona do sesji — kosz 58').toEqual({ P: 'kosz 58', K: 'kosz 58', C: 'kosz 58' });
    P.lock('manual');
    expect((await P.__px.listSnapshotShadowKeysForUser(P.__uid)).length, 'po wylogowaniu: 0 rekordów').toBe(0);
  }, 120_000);

  it('limit zrzutu sesji (rozmiary R20: 300 cieni po ~25 KB): zrzut kart zapisuje się i odtwarza po przeładowaniu; zrzut z cieniem przekroczyłby limit Chromium', async () => {
    sztucznyZegar();
    const POM = 90; // ok. 18 KB treści jawnie, jak „jeden zapis karty” w planie synchronizacji
    const tresc = (p, i) => ({
      name: `Testowy Jan ${p}`,
      user: { lastName: `Testowy${p}`, firstName: 'Jan', dobISO: '2016-03-12', sex: 'M', height: 100 + i, weight: 20 + i / 10 },
      advanced: { data: { measurements: Array.from({ length: POM }, (_, k) => ({
        uid: `m-${p}-${k}-0000-0000-000000000000`, ageMonths: 12 + k * 2, ageYears: (12 + k * 2) / 12, height: 70 + k, weight: 9 + k / 3,
        dateISO: `20${17 + Math.floor(k / 12)}-0${1 + (k % 9)}-1${k % 10}`, boneAgeYears: k % 5 ? null : 3 + k / 12, note: 'pomiar kontrolny w poradni',
      })) } },
    });
    const K = await urzadzenie('K');
    const C = await chmurowe('C', { limit: LIMIT_CHROMIUM });
    const KART = 10, WERSJI = 31; // 10 × 30 przyciętych na K = 300 cieni na C
    const pids = [];
    for (let p = 0; p < KART; p += 1) {
      let pid = null;
      for (let i = 0; i < WERSJI; i += 1) { przesunZegar(M); const r = await K.savePatient(tresc(p, i), { dedup: false, ...(pid ? { patientId: pid } : {}) }); pid = r.patientId; }
      pids.push(pid);
      przesunZegar(M); await sync(K, C);
      przesunZegar(M); const pr = await K.pruneSnapshotsForPatient(pid, { recentHours: 0 });
      expect(pr.prunedIds.length).toBe(WERSJI - 1);
      przesunZegar(M); await sync(K, C);
    }
    await tick();
    const tr = await trwaleCienie(C);
    expect(tr.zaslepki.length, 'cienie na C (zaślepki w trwałej liście)').toBe(KART * (WERSJI - 1));
    expect(tr.rekordy, 'w trwałej bazie 0 rekordów cienia').toBe(0);
    const zrzut = C.__ss.getItem(ZRZUT) || '';
    // Rekord cienia ma rozmiar szyfru wersji: pomiar na tej samej treści, zaszyfrowanej kluczem C.
    const szyfr = await C.encryptPayloadForCurrentUser(tresc(0, 1));
    const rekord = JSON.stringify([szyfr.iv, { key: szyfr.iv, c: szyfr, patientId: pids[0], snapshotId: 'x'.repeat(36), od: new Date().toISOString() }]).length;
    const zCieniem = zrzut.length + tr.zaslepki.length * (rekord + 1);
    const pomiar = { zrzutZnakow: zrzut.length, rekordZnakow: rekord, cieni: tr.zaslepki.length, zrzutZCieniemZnakow: zCieniem, limit: LIMIT_CHROMIUM, odmowy: C.__ss.odmowy };
    console.info('[limit zrzutu sesji]', JSON.stringify(pomiar));
    expect(rekord, 'rekord cienia ~25 KB').toBeGreaterThan(20_000);
    expect(zCieniem, 'zrzut z cieniem (wyliczony) przekroczyłby limit sessionStorage Chromium').toBeGreaterThan(LIMIT_CHROMIUM);
    expect(zrzut.length, 'zrzut bez cienia mieści się w limicie').toBeLessThan(LIMIT_CHROMIUM);
    expect(C.__ss.odmowy, 'żadna odmowa zapisu zrzutu').toBe(0);
    for (const iv of tr.zaslepki.slice(0, 20)) expect(zrzut.includes(iv)).toBe(false);
    // Przeładowanie: karty (ostatnie wersje) wracają z zrzutu.
    const C2 = await przeladuj(C);
    expect(C2.__ok).toBe(true);
    const karty = await C2.listPatients();
    expect(karty.length, 'karty odtworzone z zrzutu sesji').toBe(KART);
    for (let p = 0; p < KART; p += 1) {
      const k = await C2.getPatient(pids[p]);
      expect(k.snapshots.length, `karta ${p}: jedna wersja po przycięciu`).toBe(1);
      expect(k.snapshots[0].payload.user.height, `karta ${p}: ostatnia wersja`).toBe(100 + WERSJI - 1);
    }
  }, 900_000);
});

// Rejestr gwiazdki przypięty w składnikach nagrobka sid w trwałej bazie (jak stan po scaleniu w innej karcie) — koniec
// następnego scalenia przywraca wersję z cienia (Bgw_wskrzes, Bpc_pelny wypełnia pamięć podręczną szyfrów cienia).
async function przypnijWNagrobku(P, sid) {
  const meta = await P.__R.getUserMeta(P.__uid);
  const at = new Date(Date.now()).toISOString();
  const lista = meta.snapshotTombstones.map((e) => (e.snapshotId === sid ? { ...e, gwiazdka: { pin: true, at }, Bpk: { ...e.Bpk, g: { pin: true, at } } } : e));
  await P.__R.putUserMeta(P.__uid, { ...meta, snapshotTombstones: lista });
}

describe('P-CIEN-POZA-LISTA: tryb chmurowy — blokada czyści pamięć podręczną szyfrów cienia (R5 przeglądu wariantu V)', () => {
  it('cień odczytany przed blokadą (wypełniona pamięć podręczna) nie wraca po ponownym logowaniu: karta 23*, potem kosz 23* na trzech', async () => {
    const { P, K, C, sid } = await przygotuj();
    await przypnijWNagrobku(P, sid);
    przesunZegar(M); await sync(C, P);
    expect((await widoki({ P }, sid)).P, 'przed blokadą: wersja z cienia 58 (pamięć podręczna wypełniona)').toBe('karta 58*');
    P.lock('manual'); await tick();
    await P.unlockUser(P.__uid, P.__haslo);
    przesunZegar(M); await sync(C, P);
    przesunZegar(M); await sync(K, P);
    expect((await widoki({ P }, sid)).P, 'po ponownym logowaniu cień jak wygasły — wersja z K').toBe('karta 23*');
    przesunZegar(M); await doKosza(K, sid);
    przesunZegar(M); await sync(K, P);
    await rundy([P, K, C]);
    expect(await widoki({ P, K, C }, sid)).toEqual({ P: 'kosz 23*', K: 'kosz 23*', C: 'kosz 23*' });
  }, 120_000);
});

// W1 przeglądu wariantu V (ograniczenie): zaślepka bez rekordu w magazynie tej instancji liczy się jak wygasła dopiero, gdy
// potrzebny jest pełny szyfr (treść ważnego kosza, Bgw_*). Do tego czasu jest dla algebry „treścią z szyfrem”: nie przyjmuje
// tej samej ani starszej treści z ładunku. Scenariusz: P (tryb chmurowy) poprawia na 58 i wysyła do C i D; C przycina,
// P scala C (cień 58 w sesji); P loguje się ponownie (zaślepka w trwałej liście bez rekordu); D (zna 58, nie zna przycięcia)
// wysyła do P — zaślepka zostaje (ten sam iv); D sam przycina; K (stara kopia 23) daje do kosza. Wynik jak f612fe09:
// kosz 23 (cień naprawdę wygasły dałby 58). Bez ponownego logowania — kosz 58.
describe('P-CIEN-POZA-LISTA: tryb chmurowy — wisząca zaślepka (W1, ograniczenie; wynik jak f612fe09)', () => {
  async function scen(relog) {
    sztucznyZegar();
    const K = await urzadzenie('K'), C = await urzadzenie('C'), D = await urzadzenie('D');
    const P = await chmurowe('P');
    let pid = null; const ids = [];
    for (let i = 0; i < 12; i += 1) { const r = await zapisz(K, jan(100 + i, 20 + i), pid ? { patientId: pid } : {}); pid = r.patientId; ids.push(r.snapshotId); }
    przesunZegar(M); await sync(K, P); await sync(K, C); await sync(K, D);
    const sid = ids[3];
    przesunZegar(M); await poprawMase(P, sid, 58);
    przesunZegar(M); await sync(P, C); await sync(P, D);
    przesunZegar(M); await przytnij(C, sid);
    przesunZegar(M); await sync(C, P);
    if (relog) { P.lock('manual'); await P.unlockUser(P.__uid, P.__haslo); przesunZegar(M); await sync(C, P); }
    const iv = async () => { const m = await P.__R.getUserMeta(P.__uid); const e = m.snapshotTombstones.find((x) => x.snapshotId === sid); return e && e.Bpk && e.Bpk.t && e.Bpk.t.c ? e.Bpk.t.c.iv : null; };
    const ivPrzed = await iv();
    przesunZegar(M); await sync(D, P);
    const ivPo = await iv();
    przesunZegar(M); await przytnij(D, sid);
    przesunZegar(M); await doKosza(K, sid);
    let blad = null;
    try { przesunZegar(M); await sync(K, P); await rundy([P, K, C, D]); } catch (er) { blad = String(er && er.message); }
    return { ivPrzed, ivPo, blad, widoki: await widoki({ P, K, C, D }, sid) };
  }
  it('ponowne logowanie, potem D (ta sama treść 58) — zaślepka bez rekordu nie przyjmuje treści z ładunku; kosz 23 na czterech, bez wyjątku', async () => {
    const w = await scen(true);
    expect(w.ivPrzed, 'zaślepka w trwałej liście').toBeTruthy();
    expect(w.ivPo, 'treść 58 z ładunku D nie zastąpiła zaślepki (ten sam iv)').toBe(w.ivPrzed);
    expect(w.blad).toBe(null);
    expect(w.widoki).toEqual({ P: 'kosz 23', K: 'kosz 23', C: 'kosz 23', D: 'kosz 23' });
  }, 180_000);
  it('kontrola bez ponownego logowania — rekord jest w sesji: kosz 58 na czterech', async () => {
    const w = await scen(false);
    expect(w.blad).toBe(null);
    expect(w.widoki).toEqual({ P: 'kosz 58', K: 'kosz 58', C: 'kosz 58', D: 'kosz 58' });
  }, 180_000);
});

// W2 przeglądu wariantu V / S4V-MP1 (ograniczenie): w trybie chmurowym lista nagrobków jest wspólna (trwała baza), a magazyn
// cienia — w części sesyjnej każdej instancji sejfu (druga karta przeglądarki albo ramka powłoki app.html; ramki jednej karty
// dzielą sessionStorage). Instancja bez cienia, która pierwsza scali późniejszy kosz, bierze treść innych urządzeń dla całej
// floty (jak f612fe09; po pierwszym scaleniu tej instancji przejściowo kosz bez treści) — bez wyjątku. Instancja z cieniem —
// kosz 58. Wspólna atrapa Web Locks.
function atrapaLocks() {
  const st = new Map();
  const stan0 = (n) => { if (!st.has(n)) st.set(n, { zajeta: false, kolejka: [] }); return st.get(n); };
  function uruchom(n, cb) {
    const s = stan0(n);
    s.zajeta = true;
    const wynik = Promise.resolve().then(() => cb({ name: n }));
    const zwolnij = () => { s.zajeta = false; const nast = s.kolejka.shift(); if (nast) nast.start(); };
    wynik.then(zwolnij, zwolnij);
    return wynik;
  }
  return {
    request(n, opcje, cb) {
      if (typeof opcje === 'function') { cb = opcje; opcje = {}; }
      const s = stan0(n);
      if (opcje.ifAvailable) return s.zajeta ? Promise.resolve().then(() => cb(null)) : uruchom(n, cb);
      if (!s.zajeta) return uruchom(n, cb);
      return new Promise((resolve, reject) => { s.kolejka.push({ start: () => uruchom(n, cb).then(resolve, reject) }); });
    },
  };
}
async function dwieInstancje(wspolnaSesja, tryb = 'cloud-only') {
  nr += 1;
  const ls = lokalny(); ls.setItem('vildaRetention', '0');
  const locks = atrapaLocks();
  const ss1 = magazynSesji(), ss2 = wspolnaSesja ? ss1 : magazynSesji();
  const v1 = okno(ss1, ls, locks).VildaVault;
  const t = trwala(v1);
  v1.setStorageAdapter(t.px);
  const haslo = `Chmura#Dwie!2026${nr}aa`;
  await v1.createUser(haslo, { label: `P${nr}`, iterations: 10000, ...(tryb ? { storageMode: tryb } : {}) });
  const [uz] = await v1.listUsers();
  const v2 = okno(ss2, ls, locks).VildaVault;
  v2.setStorageAdapter(t.px);
  await v2.unlockUser(uz.userId, haslo);
  for (const [v, n, ss] of [[v1, 'P1', ss1], [v2, 'P2', ss2]]) Object.assign(v, { __nazwa: n, __uid: uz.userId, __R: t.px, __licz: t.licz, __haslo: haslo, __ss: ss, __ls: ls, __t: t });
  return { P1: v1, P2: v2 };
}
describe('P-CIEN-POZA-LISTA: tryb chmurowy — dwie instancje sejfu jednego konta (W2 / S4V-MP1, ograniczenie; wynik jak f612fe09)', () => {
  for (const [rodzaj, wspolna] of [['dwie karty', false], ['dwie ramki powłoki (wspólny sessionStorage)', true]]) {
    for (const scala of ['P2', 'P1']) {
      it(`${rodzaj}: kosz K scala ${scala === 'P2' ? 'instancja bez cienia (P2) — kosz 23 na czterech' : 'instancja z cieniem (P1) — kosz 58 na czterech'}, bez wyjątku`, async () => {
        sztucznyZegar();
        const K = await urzadzenie('K'), C = await urzadzenie('C');
        const { P1, P2 } = await dwieInstancje(wspolna);
        expect([P1.isCloudOnlyAdapterActive(), P2.isCloudOnlyAdapterActive()]).toEqual([true, true]);
        let pid = null; const ids = [];
        for (let i = 0; i < 12; i += 1) { const r = await zapisz(K, jan(100 + i, 20 + i), pid ? { patientId: pid } : {}); pid = r.patientId; ids.push(r.snapshotId); }
        przesunZegar(M); await sync(K, P1); await sync(K, P2); await sync(K, C);
        const sid = ids[3];
        przesunZegar(M); await poprawMase(P1, sid, 58);
        przesunZegar(M); await sync(P1, C); await sync(P1, P2); // P2 ma 58 w swojej części sesyjnej
        przesunZegar(M); await przytnij(C, sid);
        przesunZegar(M); await sync(C, P1); // P1: cień 58 w swojej części sesyjnej, zaślepka na wspólnej liście
        przesunZegar(M); await sync(C, P2); // P2: zaślepka P1 na liście, rekordu w swojej sesji nie ma
        const tr = await trwaleCienie(P1);
        expect({ rekordy: tr.rekordy, zaslepki: tr.zaslepki.length, szyfry: tr.szyfryCieniaWLiscie }, 'trwała baza: same zaślepki').toEqual({ rekordy: 0, zaslepki: 11, szyfry: 0 });
        przesunZegar(M); await doKosza(K, sid);
        const v = scala === 'P2' ? P2 : P1;
        let blad = null;
        try { przesunZegar(M); await sync(K, v); } catch (er) { blad = String(er && er.message); }
        const po = (await stan(v, sid)).nagrobek;
        try { await rundy([P1, P2, K, C]); } catch (er) { blad = blad || String(er && er.message); }
        expect(blad).toBe(null);
        expect(po && po.rodzaj, 'po pierwszym scaleniu: ważny kosz').toBe(scala === 'P2' ? 'kosz-bez-tresci' : 'kosz');
        const m = scala === 'P2' ? 23 : 58;
        expect(await widoki({ P1, P2, K, C }, sid)).toEqual({ P1: `kosz ${m}`, P2: `kosz ${m}`, K: `kosz ${m}`, C: `kosz ${m}` });
        expect((await trwaleCienie(P1)).rekordy, 'trwała baza bez rekordów cienia').toBe(0);
      }, 180_000);
    }
  }
});

// W3P-1 w drugiej karcie przeglądarki (tryb lokalny, wspólny magazyn i atrapa Web Locks; ograniczenie): zbiór kart
// usuniętych żyje w pamięci dokumentu, więc „Usuń pacjenta” w P2 w trakcie scalenia w P1, które przycina wersje tej karty,
// nie powstrzyma końcowego zapisu listy w P1 — cień wraca do magazynu (11). Zdejmuje go najbliższe scalenie w dowolnej
// karcie: każde scalenie przechodzi wygrywające nagrobki kart (Bsl_usunPacjenta), także lokalny nagrobek tej karty, więc
// karta trafia do zbioru tamtego dokumentu przed końcowym zapisem listy. Na 1da487ce cień zostawał do wygaśnięcia.
describe('P-CIEN-POZA-LISTA: tryb lokalny — „Usuń pacjenta” w drugiej karcie w trakcie scalenia (W3P-1, ograniczenie)', () => {
  const rekordyKarty = async (v, pid) => {
    let n = 0;
    for (const k of await v.__R.listSnapshotShadowKeysForUser(v.__uid)) if ((await v.__R.getSnapshotShadowForUser(v.__uid, k)).patientId === pid) n += 1;
    return n;
  };
  for (const kto of ['P1', 'P2']) {
    it(`M11g: P2 usuwa kartę w trakcie scalenia w P1 — po scaleniu P1 cień zostaje (11); najbliższe scalenie w ${kto} go zdejmuje (0)`, async () => {
      sztucznyZegar();
      const K = await urzadzenie('K'), C = await urzadzenie('C');
      const { P1, P2 } = await dwieInstancje(false, null);
      expect([P1.isCloudOnlyAdapterActive(), P2.isCloudOnlyAdapterActive()]).toEqual([false, false]);
      let pid = null; const ids = [];
      for (let i = 0; i < 12; i += 1) { const r = await zapisz(K, jan(100 + i, 20 + i), pid ? { patientId: pid } : {}); pid = r.patientId; ids.push(r.snapshotId); }
      przesunZegar(M); await sync(K, P1); await sync(K, C);
      const sid = ids[3];
      przesunZegar(M); await poprawMase(P1, sid, 58);
      przesunZegar(M); await sync(P1, C);
      przesunZegar(M); await przytnij(C, sid);
      const ladunek = JSON.parse(JSON.stringify(await C.exportSyncPayload()));
      const st = { pr: null, czekal: false, przedKoncem: null };
      const hak = new Proxy(P1.__R, { get(cel, k) {
        const f = cel[k];
        if (typeof f !== 'function') return f;
        return async (...a) => {
          if (k === 'getUserMeta' && st.pr && !st.czekal) {
            const stos = new Error().stack || '';
            if (stos.includes('Bkz_scalKoniec') && stos.includes('Bkz_zmienListe')) {
              st.czekal = true;
              st.przedKoncem = await Promise.race([st.pr, new Promise((r) => { setTimeout(() => r('limit'), 5000); })]);
            }
          }
          const r = await f.apply(cel, a);
          if (k === 'removeSnapshotForUser' && !st.pr) st.pr = P2.removePatient(pid).then(() => 'ok', (e) => String(e && e.message));
          return r;
        };
      } });
      P1.setStorageAdapter(hak);
      let s1;
      try { przesunZegar(M); s1 = await P1.mergeSyncPayload(ladunek).then(() => 'ok', (e) => String(e && e.message)); } finally { P1.setStorageAdapter(P1.__R); }
      expect([s1, await st.pr], 'scalenie P1 i „Usuń pacjenta” P2 bez błędu').toEqual(['ok', 'ok']);
      expect({ czekal: st.czekal, przedKoncem: st.przedKoncem }, 'usunięcie w P2 przed końcowym zapisem listy P1').toEqual({ czekal: true, przedKoncem: 'ok' });
      expect((await P1.listPatients()).some((x) => x.patientId === pid), 'karty nie ma').toBe(false);
      expect(await rekordyKarty(P1, pid), 'po scaleniu P1: cień usuniętej karty wrócił z mapy scalania P1 (ograniczenie)').toBe(11);
      przesunZegar(M); await sync(C, kto === 'P1' ? P1 : P2);
      expect(await rekordyKarty(P1, pid), `najbliższe scalenie w ${kto}: 0 rekordów cienia usuniętej karty`).toBe(0);
      const meta = (await P1.__R.getUserMeta(P1.__uid)) || {};
      expect((meta.snapshotTombstones || []).filter((e) => e.patientId === pid && e.Bpk && e.Bpk.t && e.Bpk.t.c).length, 'lista bez cienia tej karty').toBe(0);
    }, 180_000);
  }
});
