// P-KOSZ-USUWANEJ-KARTY (E4a, decyzja właściciela D6 = a, Q7) — przerwane scalenie, zmiana sesji, błąd zapisu listy,
// strona ładunku, wersja nieczytelna i retencja.
//
// Reguła. Wersje karty, która w scalaniu przegrywa z nagrobkiem pacjenta (typowo źródło „Scal pacjentów” z innego
// urządzenia), przechodzą tę samą decyzję kosza co pozostałe wersje: czytelna wersja, z którą wygrywa wpis kosza tej samej
// wersji (pod dowolną kartą), oddaje mu zmianę, opis, rev i treść. Na urządzeniu, które ma tę kartę: przed usunięciem
// karty (Bsl_usunPacjenta → Bsl_koszUsuwanejKarty) — z zapisem listy kosza PRZED usunięciem, więc przerwanie dalszej fazy
// scalania (blokada innej karty, zmiana sesji, zamknięcie aplikacji) nie gubi treści; gdy ten zapis się nie uda (błąd
// magazynu), karta zostaje do następnego scalenia. Na urządzeniu, które dostaje tę kartę w ładunku (Bsl_koszZLadunku):
// kandydat treści, jak wersja z ładunku pokonana nagrobkiem w karcie, która zostaje. Tylko wygrana kosza (przycięcie nie
// robi cienia karty usuwanej). Odczyt wersji karty, jej usunięcie, zbiór kart usuniętych i nagrobek karty — tylko w sesji
// scalania (Bses_pilnuj, bez await przed zapisem).
//
// Stan E4a (jak scenariusz E4a w s4d7-wspolne.mjs): na K „Testowy Jan” X (trzy wizyty, x = druga, 125 cm / 23 kg),
// „Testowa Ola” Y i Z; komplet na P i C. P (bez wiedzy o scaleniach) poprawia x w starej X na 74 kg; K: „Scal pacjentów”
// X → Y, Y → Z (x pod Z z rev 2) i x do kosza. Oczekiwane wszędzie: kosz 74, rev 2, x w żadnej karcie.
//
// Przypadki (gdzie zaznaczono — 8 kolejności pierwszych scaleń; potem 3 rundy „każdy z każdym” i runda kontrolna
// z licznikiem zapisów). Wynik na kodzie sprzed zmiany (25dfbbe0) — zmierzony tymi samymi krokami:
//   S1 (8 kolejności) P: zalogowanie od nowa (to samo konto) zaraz po usunięciu karty X z x w scaleniu na P — sprawdzenie
//      sesji przed nagrobkiem X kończy scalenie błędem SESSION_CHANGED: po przełączeniu żadnego zapisu, X znika bez
//      lokalnego nagrobka (zapisze go następne scalanie), kosz P ma już 74 (lista zapisana przed usunięciem); po rundach
//      kosz 74 na trzech. Dotąd kosz 23 (0/8); z decyzją kosza tylko na urządzeniu z kartą i bez zapisu listy przed
//      usunięciem (prototyp A2 przeglądu) — 74 w 1 z 8, z decyzją także po stronie ładunku, ale bez zapisu przed
//      usunięciem — 74 w 4 z 8.
//   S1b (8) jak S1, a do tego K daje do kosza jedyną wizytę z1 karty Z, którą P potem poprawia — zapis listy przed
//      usunięciem X niesie tylko wpis x (nie całą mapę scalania): P zaraz po przerwaniu ma w koszu x, a nie z1.
//   S2 P: zalogowanie od nowa zaraz po zapisie listy kosza z 74, przed usunięciem karty — karty X w nowej sesji nie
//      usuwamy (SESSION_CHANGED, po przełączeniu żadnego zapisu karty, wersji ani nagrobka), X z x 74 zostaje na P,
//      a kosz P ma 74; po rundach kosz 74 na trzech.
//   S3 P: przełączenie na konto B zaraz po usunięciu karty X — nagrobek X nie trafia do konta B (dotąd szedł do konta
//      bieżącego, czyli B); po ponownym zalogowaniu A i rundach kosz 74 na trzech.
//   S3b P: konto B na tym samym magazynie ma kopię kart A (te same identyfikatory); przełączenie na B zaraz po odczycie
//      rekordu X w Bsl_usunPacjenta — karta X konta B zostaje, bez nagrobka X w B (dotąd usuwało kartę X konta B i stawiało
//      jej nagrobek).
//   S8 P: przełączenie na konto B w zapisie listy przed usunięciem X (po odczycie wersji X, przy odczycie listy) — po
//      przełączeniu żadnego zapisu (dotąd zapisu listy w tym miejscu nie było; bez sesji scalania w tym zapisie lista
//      kosza konta A trafiłaby do konta B).
//   S7 P: zapis listy przed usunięciem X nie udaje się raz (błąd magazynu, nie zmiana sesji) — scalenie bez błędu, karta
//      X zostaje do następnego scalenia, a kosz 74 zapisuje koniec scalania; po rundach kosz 74 na trzech, X usunięta.
//   S7b P: każdy zapis listy z x nie udaje się (trwały błąd magazynu) — X z x 74 zostaje na P (dotąd: X usunięta, poprawka
//      ginęła); K dostaje ładunek P i bierze 74 do kosza (strona ładunku); po ustąpieniu błędu kosz 74 na trzech.
//   S4 strona ładunku: P wysyła poprawkę i więcej nie scala (K←P, dalej tylko K i C) — kosz 74 na K i C. Dotąd i z samą
//      decyzją po stronie urządzenia z kartą: kosz 23.
//   L-remis jak S4, ale kosz K i poprawka P w tej samej chwili (przed scaleniami) — remis to wygrana kosza: kosz 74 na K i C
//      (dotąd 23).
//   L-kp jak S4, ale kosz K przed poprawką P (w X), potem scalenia — późniejsza wersja karty X z ładunku nie zdejmuje
//      wpisu kosza: kosz 23 na K i C (jak dotąd; znane ograniczenie E4a-kp).
//   S5 wersja x nieczytelna na P (uszkodzony szyfr w magazynie) — P←K bez błędu, wpis kosza bez treści z P (23), po
//      rundach kosz 23 na trzech (jak dotąd; kontrola, zielony także na 25dfbbe0).
//   S9 (8) retencja zamiast kosza (E4a-ret): wpis x na liście konta każdego urządzenia — nagrobek retencji bez treści i bez
//      cienia (decyzja 1: przycięcie nie robi cienia karty usuwanej; kontrola, zielony także na 25dfbbe0).
//   S6 strażniki źródła: kolejność w Bsl_usunPacjenta, sprawdzenie sesji w Bsl_koszUsuwanejKarty i Bkz_zmienListe,
//      wywołania w Le.
//
// Prawdziwy vilda_vault.js (P — magazyn w pamięci z rejestrem wywołań i hakiem przełączenia sesji, jak urzadzenieH
// w przywroc-z-karty-sesja.test.mjs; K i C z polkrata-uprzaz.mjs), sztuczny zegar (vi.useFakeTimers({ toFake: ['Date'] })),
// automatyczna retencja wyłączona. Dane wyłącznie FIKCYJNE („Testowy Jan”, „Testowa Ola”).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repo, SEJF, sztucznyZegar, przesunZegar, urzadzenie, jan, zapisz, gdzie, poprawMase, doKosza, przytnij, sync, rundy, zeruj, zapisy } from './polkrata-uprzaz.mjs';
import { KOLEJNOSCI_8, ola } from './s4d7-wspolne.mjs';

const M = 60e3;
const HASLO_B = 'Druga#Lekarka!2026bb';
afterEach(() => { vi.useRealTimers(); });

const KOD = {};
const kod = (f) => (KOD[f] || (KOD[f] = readFileSync(path.join(repo, f), 'utf8')));
// Wiersz kodu sejfu w stosie wywołań: new Function dokleja dwa wiersze nagłówka.
const wiersze = (re) => kod(SEJF.N).split('\n').flatMap((l, i) => (re.test(l) ? [i + 3] : []));
const W_REKORD = wiersze(/^ {4}const rekord = await I\(\)\.getPatientForUser\(b, patientId\);$/);
const wWierszach = (ws, s) => ws.some((w) => s.includes('<anonymous>:' + w + ':'));

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}
const cicho = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
function okno() {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {}, AbortController,
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    console: cicho,
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  for (const f of ['vilda_crypto.js', 'vilda_retention.js', SEJF.N]) new Function('window', 'globalThis', kod(f))(win, win);
  return win;
}

/* Urządzenie z przełączeniem sesji: konto B (zablokowane) i konto A w tym samym magazynie. hak.kiedy(metoda, argumenty,
   stos) — po zakończeniu wywołania magazynu, dla którego zwróci true, raz wykonuje hak.akcja, dopiero potem oddaje
   wynik. hak.blad(metoda, argumenty, stos) — wywołanie magazynu kończy się błędem bez zapisu (raz albo, przy
   hak.bladStaly, za każdym razem). hak.obserwuj(metoda, argumenty, stos) — przy każdym wywołaniu (flagi przypadków).
   Rejestr: [metoda, userId, drugi argument]. Licznik zapisów jak w polkrata-uprzaz.mjs (lista, wersje, karty). */
let nr = 0;
async function urzadzenieH(nazwa) {
  nr += 1;
  const hak = { kiedy: null, akcja: null, blad: null, bladStaly: false, obserwuj: null };
  const v = okno().VildaVault;
  const wyw = [];
  const licz = { lista: 0, wersje: 0, karty: 0 };
  const baza = v.createInMemoryAdapter();
  const px = new Proxy(baza, { get(cel, k) {
    const f = cel[k];
    if (typeof f !== 'function') return f;
    return function (...a) {
      wyw.push([String(k), a[0], a[1]]);
      const stos = hak.kiedy || hak.blad || hak.obserwuj ? String(new Error().stack) : '';
      if (hak.obserwuj) hak.obserwuj(String(k), a, stos);
      if (hak.blad && hak.blad(String(k), a, stos)) {
        if (!hak.bladStaly) hak.blad = null;
        return Promise.reject(new Error('atrapa: zapis nie powiódł się'));
      }
      const licznik = async () => {
        if (k === 'putUserMeta') {
          const stare = await cel.getUserMeta(a[0]);
          if (JSON.stringify((stare && stare.snapshotTombstones) || []) !== JSON.stringify((a[1] && a[1].snapshotTombstones) || [])) licz.lista += 1;
        } else if (k === 'putSnapshotForUser' || k === 'removeSnapshotForUser') licz.wersje += 1;
        else if (k === 'putPatientForUser' || k === 'removePatientForUser') licz.karty += 1;
      };
      const r0 = k === 'putUserMeta' ? licznik().then(() => f.apply(cel, a)) : (licznik(), f.apply(cel, a));
      if (!hak.kiedy || !r0 || typeof r0.then !== 'function') return r0;
      return r0.then(async (w) => {
        if (hak.kiedy && hak.kiedy(String(k), a, stos)) { hak.kiedy = null; await hak.akcja(); }
        return w;
      });
    };
  } });
  v.setStorageAdapter(px);
  const kontoB = await v.createUser(HASLO_B, { label: `Fikcyjna Druga ${nr}`, iterations: 1000 });
  v.lock('manual');
  const haslo = `Kosz#Karty!2026${nr}aa`;
  const kontoA = await v.createUser(haslo, { label: `${nazwa}${nr}`, iterations: 1000 });
  Object.assign(v, { __nazwa: nazwa, __app: 'N', __licz: licz, __px: px, __baza: baza, __haslo: haslo, __uid: kontoA.userId, __uidB: kontoB.userId, __hak: hak, __wyw: wyw });
  return v;
}
// Przełączenie sesji raz, w miejscu wskazanym przez kiedy: blokada i zalogowanie konta B albo ponownie konta A.
function przelacz(v, kiedy, naB) {
  const st = { zrobione: false, od: -1 };
  v.__hak.kiedy = kiedy;
  v.__hak.akcja = async () => {
    st.zrobione = true;
    v.lock('manual');
    if (naB) await v.unlockUser(v.__uidB, HASLO_B);
    else await v.unlockUser(v.__uid, v.__haslo);
    st.od = v.__wyw.length;
  };
  return st;
}
const kto = (v, u) => (u === v.__uid ? 'A' : u === v.__uidB ? 'B' : String(u));
const ZAPIS = /^(put|remove|write|delete|update)/;
const zapisyPo = (v, st) => v.__wyw.slice(st.od).filter(([k]) => ZAPIS.test(k)).map(([k, u]) => `${k}(${kto(v, u)})`);
async function zalogujA(v) { v.__hak.kiedy = null; v.lock('manual'); await v.unlockUser(v.__uid, v.__haslo); }
// Scalenie, które może się skończyć zmianą sesji (SESSION_CHANGED) — wynik: 'ok' albo kod błędu.
async function scal(z, na) {
  try { await sync(z, na); return 'ok'; } catch (er) { if (er && er.code === 'SESSION_CHANGED') return 'SESSION_CHANGED'; throw er; }
}

// E4a: X (3 wizyty, x druga 125 cm / 23 kg), Y, Z na K, komplet na P i C. P z hakiem (konto A), K i C — zwykłe.
async function trzyKarty() {
  sztucznyZegar();
  const P = await urzadzenieH('P'), K = await urzadzenie('K'), C = await urzadzenie('C');
  const x1 = await zapisz(K, jan(120, 20));
  const X = x1.patientId;
  const x2 = await zapisz(K, jan(125, 23), { patientId: X });
  await zapisz(K, jan(130, 25), { patientId: X });
  const Y = (await zapisz(K, ola(110, 18))).patientId;
  const Z = (await zapisz(K, ola(111, 19))).patientId;
  await sync(K, P); await sync(K, C);
  const u = { P, K, C, urz: [P, K, C], X, Y, Z, sid: x2.snapshotId, xWDecyzji: false };
  // Flaga: P przeczytał wersje X w decyzji kosza usuwanej karty (stos z Bsl_koszUsuwanejKarty) — haki niżej czekają na nią.
  P.__hak.obserwuj = (k, a, stos) => {
    if (k === 'listSnapshotsForUser' && a[1] === X && stos.includes('Bsl_koszUsuwanejKarty')) u.xWDecyzji = true;
  };
  return u;
}
// Kroki E4a: P poprawia x w starej X na 74; K: X → Y, Y → Z, x do kosza (co minutę).
async function krokiE4a(u) {
  przesunZegar(M); await poprawMase(u.P, u.sid, 74);
  przesunZegar(M); await u.K.mergePatients(u.X, u.Y);
  przesunZegar(M); await u.K.mergePatients(u.Y, u.Z);
  przesunZegar(M); await doKosza(u.K, u.sid);
  przesunZegar(M);
}
async function stanX(v, sid) {
  const g = await gdzie(v, sid);
  const k = (await v.listTrashedSnapshots()).find((e) => e.snapshotId === sid) || null;
  // rev wpisu kosza — z nagrobka w ładunku synchronizacji (lista kosza jej nie pokazuje)
  const n = k ? ((await v.exportSyncPayload()).snapshotTombstones || []).find((e) => e.snapshotId === sid) : null;
  return { karta: g ? { masa: g.s.payload.user.weight, rev: g.s.rev } : null, kosz: k ? { masa: k.payload ? k.payload.user.weight : null, rev: n ? n.rev : null } : null };
}
async function pierwsze(u, kol) {
  const wyniki = [];
  for (const k of kol.split(',')) { const [na, z] = k.split('←'); wyniki.push(`${k}: ${await scal(u[z], u[na])}`); }
  return wyniki;
}
// Po rundach: ten sam stan x na trzech i 0 zapisów w rundzie kontrolnej.
async function rundyIKontrola(u, oczekiwany) {
  await rundy(u.urz, 3);
  for (const v of u.urz) expect(await stanX(v, u.sid), `${v.__nazwa}: po rundach`).toEqual(oczekiwany);
  zeruj(u.urz);
  await rundy(u.urz, 1);
  expect(zapisy(u.urz), 'runda kontrolna bez zapisów').toEqual({ P: { lista: 0, wersje: 0, karty: 0 }, K: { lista: 0, wersje: 0, karty: 0 }, C: { lista: 0, wersje: 0, karty: 0 } });
}
const KOSZ_74 = { karta: null, kosz: { masa: 74, rev: 2 } };
// Zakończone usunięcie karty X razem z x w Bsl_usunPacjenta (po decyzji kosza jej wersji).
const poUsunieciuX = (u) => (k, a) => k === 'removePatientForUser' && a[1] === u.X && u.xWDecyzji;
// Zapis listy z wpisem x przed usunięciem X — zapis listy w Bsl_koszUsuwanejKarty (P dotąd o koszu x nie wiedział).
const listaPrzedUsunieciemX = (u) => (k, a) => k === 'putUserMeta' && u.xWDecyzji
  && !u.P.__wyw.some(([m, , p]) => m === 'removePatientForUser' && p === u.X)
  && ((a[1] && a[1].snapshotTombstones) || []).some((e) => e && e.snapshotId === u.sid);
// Konto B na tym samym magazynie z kopią kart konta A (te same patientId i snapshotId — np. kopia zaimportowana).
async function kopiaWB(v) {
  const ex = JSON.parse(JSON.stringify(await v.exportSyncPayload()));
  delete ex.credential; delete ex.passkeys; delete ex.passkeyTombstones; ex.userPreferences = {};
  v.lock('manual'); await v.unlockUser(v.__uidB, HASLO_B);
  await v.mergeSyncPayload(ex);
  v.lock('manual'); await v.unlockUser(v.__uid, v.__haslo);
}

describe('P-KOSZ-USUWANEJ-KARTY — przerwane scalenie i zmiana sesji', () => {
  for (const kol of KOLEJNOSCI_8) {
    it(`S1 (${kol}): zalogowanie od nowa zaraz po usunięciu X z x na P — kosz P ma już 74, po rundach kosz 74 na trzech`, async () => {
      const u = await trzyKarty();
      await krokiE4a(u);
      const st = przelacz(u.P, poUsunieciuX(u), false);
      const wyniki = await pierwsze(u, kol);
      if (!st.zrobione) {
        // X z x usuwa P dopiero w rundach (np. C←P,C←K: najpierw C bierze 74 i usuwa X u siebie) — przełączenie tam.
        for (const [z, na] of [['K', 'P'], ['C', 'P']]) { if (st.zrobione) break; wyniki.push(`runda ${na}←${z}: ${await scal(u[z], u[na])}`); }
      }
      expect(st.zrobione, `przełączenie po usunięciu X na P (${wyniki.join('; ')})`).toBe(true);
      expect(wyniki.some((w) => w.endsWith('SESSION_CHANGED')), 'scalenie przerwane zmianą sesji').toBe(true);
      expect(zapisyPo(u.P, st), 'po przełączeniu żadnego zapisu').toEqual([]);
      expect((await u.P.__baza.listTombstonesForUser(u.P.__uid)).map((t) => t.patientId), 'X bez lokalnego nagrobka').not.toContain(u.X);
      expect((await stanX(u.P, u.sid)).kosz, 'P zaraz po przerwaniu: kosz z poprawką').toEqual({ masa: 74, rev: 2 });
      await rundyIKontrola(u, KOSZ_74);
    });
  }

  for (const kol of KOLEJNOSCI_8) {
    it(`S1b (${kol}): przerwanie po usunięciu X — zapis listy przed usunięciem niesie tylko wpis x, bez wpisu z1 poprawionego później na P`, async () => {
      const u = await trzyKarty();
      const z1 = (await u.P.getPatient(u.Z)).snapshots[0].snapshotId;
      await krokiE4a(u);
      await doKosza(u.K, z1); przesunZegar(M); // K: jedyna wizyta „Testowej Oli” Z do kosza
      await poprawMase(u.P, z1, 20); przesunZegar(M); // P: później poprawia z1 — wpis kosza z1 przegra na P
      const st = przelacz(u.P, poUsunieciuX(u), false);
      const wyniki = await pierwsze(u, kol);
      if (!st.zrobione) {
        for (const [z, na] of [['K', 'P'], ['C', 'P']]) { if (st.zrobione) break; wyniki.push(`runda ${na}←${z}: ${await scal(u[z], u[na])}`); }
      }
      expect(st.zrobione, `przełączenie po usunięciu X na P (${wyniki.join('; ')})`).toBe(true);
      const kosz = (await u.P.listTrashedSnapshots()).map((e) => e.snapshotId);
      expect(kosz, 'P zaraz po przerwaniu: x w koszu').toContain(u.sid);
      expect(kosz, 'P zaraz po przerwaniu: bez wpisu z1 (z1 jest w karcie Z z poprawką)').not.toContain(z1);
    });
  }

  it('S2: zalogowanie od nowa zaraz po zapisie listy kosza z 74, przed usunięciem X — X nie znika w nowej sesji, kosz P ma 74', async () => {
    const u = await trzyKarty();
    await krokiE4a(u);
    const st = przelacz(u.P, listaPrzedUsunieciemX(u), false);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie po zapisie listy w Bsl_koszUsuwanejKarty').toBe(true);
    const po = zapisyPo(u.P, st);
    expect(po.filter((z) => /^(removePatientForUser|putTombstoneForUser|removeSnapshotForUser|putSnapshotForUser|putPatientForUser)/.test(z)), 'po przełączeniu bez zapisów kart, wersji i nagrobków').toEqual([]);
    expect(await stanX(u.P, u.sid), 'P: x 74 dalej w X, w koszu 74').toEqual({ karta: { masa: 74, rev: 1 }, kosz: { masa: 74, rev: 2 } });
    await rundyIKontrola(u, KOSZ_74);
  });

  it('S3: przełączenie na konto B zaraz po usunięciu X na P — nagrobek X nie trafia do konta B; po zalogowaniu A kosz 74 na trzech', async () => {
    const u = await trzyKarty();
    await krokiE4a(u);
    const st = przelacz(u.P, poUsunieciuX(u), true);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione).toBe(true);
    expect(zapisyPo(u.P, st), 'po przełączeniu na B żadnego zapisu').toEqual([]);
    expect((await u.P.__baza.listTombstonesForUser(u.P.__uidB)).map((t) => t.patientId), 'konto B bez nagrobka X').toEqual([]);
    await zalogujA(u.P);
    expect((await stanX(u.P, u.sid)).kosz, 'A: kosz z poprawką zapisany przed usunięciem X').toEqual({ masa: 74, rev: 2 });
    await rundyIKontrola(u, KOSZ_74);
  });

  it('S3b: konto B z kopią kart A, przełączenie na B zaraz po odczycie rekordu X w Bsl_usunPacjenta — karta X konta B zostaje, bez nagrobka X w B', async () => {
    const u = await trzyKarty();
    await krokiE4a(u);
    await kopiaWB(u.P);
    const kartyB = async () => (await u.P.__baza.listPatientsForUser(u.P.__uidB)).map((p) => p.patientId).sort();
    const przed = await kartyB();
    expect(przed, 'kontrola: konto B ma kopię karty X').toContain(u.X);
    const st = przelacz(u.P, (k, a, stos) => k === 'getPatientForUser' && a[0] === u.P.__uid && a[1] === u.X && wWierszach(W_REKORD, stos), true);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie po odczycie rekordu X w Bsl_usunPacjenta').toBe(true);
    expect(zapisyPo(u.P, st), 'po przełączeniu na B żadnego zapisu').toEqual([]);
    expect(await kartyB(), 'konto B: karty bez zmian (także X)').toEqual(przed);
    expect((await u.P.__baza.listTombstonesForUser(u.P.__uidB)).map((t) => t.patientId), 'konto B bez nagrobka X').toEqual([]);
  });

  it('S8: przełączenie na konto B w zapisie listy przed usunięciem X (przy odczycie listy) — po przełączeniu żadnego zapisu', async () => {
    const u = await trzyKarty();
    await krokiE4a(u);
    const st = przelacz(u.P, (k, a) => k === 'getUserMeta' && a[0] === u.P.__uid && u.xWDecyzji
      && !u.P.__wyw.some(([m, , p]) => m === 'removePatientForUser' && p === u.X), true);
    expect(await scal(u.K, u.P)).toBe('SESSION_CHANGED');
    expect(st.zrobione, 'przełączenie przy odczycie listy po decyzji kosza X').toBe(true);
    expect(zapisyPo(u.P, st), 'po przełączeniu na B żadnego zapisu (lista, karta, nagrobek)').toEqual([]);
    expect(((await u.P.__baza.getUserMeta(u.P.__uidB)) || {}).snapshotTombstones || [], 'lista kosza konta B pusta').toEqual([]);
  });
});

describe('P-KOSZ-USUWANEJ-KARTY — błąd zapisu listy, strona ładunku, wersja nieczytelna, retencja', () => {
  it('S7: błąd zapisu listy przed usunięciem X (raz, nie zmiana sesji) — scalenie bez błędu, X zostaje, kosz 74 z końca scalania', async () => {
    const u = await trzyKarty();
    await krokiE4a(u);
    let bylBlad = false;
    const lista = listaPrzedUsunieciemX(u);
    u.P.__hak.blad = (k, a) => { const tak = lista(k, a); if (tak) bylBlad = true; return tak; };
    expect(await scal(u.K, u.P), 'scalenie kończy się bez błędu').toBe('ok');
    expect(bylBlad, 'atrapa błędu zadziałała w zapisie listy przed usunięciem X').toBe(true);
    expect(await stanX(u.P, u.sid), 'P: X z x 74 zostaje, kosz 74 (koniec scalania)').toEqual({ karta: { masa: 74, rev: 1 }, kosz: { masa: 74, rev: 2 } });
    await rundyIKontrola(u, KOSZ_74);
  });

  it('S7b: trwały błąd zapisu listy z x na P — X z x 74 zostaje na P, K bierze 74 z ładunku P; po ustąpieniu błędu kosz 74 na trzech', async () => {
    const u = await trzyKarty();
    await krokiE4a(u);
    u.P.__hak.bladStaly = true;
    u.P.__hak.blad = (k, a) => k === 'putUserMeta' && ((a[1] && a[1].snapshotTombstones) || []).some((e) => e && e.snapshotId === u.sid);
    expect(await scal(u.K, u.P), 'scalenie kończy się bez błędu').toBe('ok');
    expect(await stanX(u.P, u.sid), 'P: X z poprawką zostaje (bez zapisanej kopii treści karty nie usuwamy)').toEqual({ karta: { masa: 74, rev: 1 }, kosz: null });
    expect(await scal(u.P, u.K)).toBe('ok');
    expect((await stanX(u.K, u.sid)).kosz, 'K po K←P: kosz z poprawką (strona ładunku)').toEqual({ masa: 74, rev: 2 });
    u.P.__hak.blad = null; u.P.__hak.bladStaly = false;
    await rundyIKontrola(u, KOSZ_74);
  });

  it('S4: P wysyła poprawkę i więcej nie scala (K←P, dalej tylko K i C) — kosz 74 na K i C', async () => {
    const u = await trzyKarty();
    await krokiE4a(u);
    expect(await scal(u.P, u.K)).toBe('ok'); // K: karta X z ładunku P przegrywa z nagrobkiem X (N) — wersje do decyzji kosza
    expect((await stanX(u.K, u.sid)).kosz, 'K po K←P').toEqual({ masa: 74, rev: 2 });
    await rundy([u.K, u.C], 3);
    for (const v of [u.K, u.C]) expect(await stanX(v, u.sid), v.__nazwa).toEqual(KOSZ_74);
    zeruj([u.K, u.C]);
    await rundy([u.K, u.C], 1);
    expect(zapisy([u.K, u.C])).toEqual({ K: { lista: 0, wersje: 0, karty: 0 }, C: { lista: 0, wersje: 0, karty: 0 } });
  });

  // Strona ładunku: kosz K przed scaleniami, poprawka P w tej samej chwili (L-remis) albo później (L-kp); P wysyła i więcej nie scala.
  async function ladunekPoKoszu(poprawkaPozniej) {
    const u = await trzyKarty();
    przesunZegar(M); await doKosza(u.K, u.sid);
    if (poprawkaPozniej) przesunZegar(M);
    await poprawMase(u.P, u.sid, 74);
    przesunZegar(M); await u.K.mergePatients(u.X, u.Y); przesunZegar(M); await u.K.mergePatients(u.Y, u.Z); przesunZegar(M);
    expect(await scal(u.P, u.K)).toBe('ok'); // K←P: karta X z ładunku w N
    const naK = (await stanX(u.K, u.sid)).kosz;
    await rundy([u.K, u.C], 3);
    return { naK, K: (await stanX(u.K, u.sid)).kosz, C: (await stanX(u.C, u.sid)).kosz };
  }
  it('L-remis: kosz K i poprawka P w tej samej chwili, potem scalenia; P wysyła i więcej nie scala — kosz 74 na K i C (remis = wygrana kosza)', async () => {
    const w = await ladunekPoKoszu(false);
    expect(w).toEqual({ naK: { masa: 74, rev: 1 }, K: { masa: 74, rev: 1 }, C: { masa: 74, rev: 1 } });
  });
  it('L-kp: kosz K, później poprawka P w X, potem scalenia; P wysyła i więcej nie scala — wpis kosza zostaje (kosz 23 na K i C, E4a-kp)', async () => {
    const w = await ladunekPoKoszu(true);
    expect(w).toEqual({ naK: { masa: 23, rev: 0 }, K: { masa: 23, rev: 0 }, C: { masa: 23, rev: 0 } });
  });

  it('S5: x nieczytelna na P (uszkodzony szyfr) — P←K bez błędu, kosz bez treści z P (23), po rundach kosz 23 na trzech', async () => {
    const u = await trzyKarty();
    await krokiE4a(u);
    const s = (await u.P.__baza.listSnapshotsForUser(u.P.__uid, u.X)).find((q) => q.snapshotId === u.sid);
    const d = s.payloadCipher.data;
    await u.P.__baza.putSnapshotForUser(u.P.__uid, { ...s, payloadCipher: { ...s.payloadCipher, data: (d[0] === 'A' ? 'B' : 'A') + d.slice(1) } });
    expect(await scal(u.K, u.P)).toBe('ok');
    expect(await stanX(u.P, u.sid), 'P: X usunięta, w koszu treść K').toEqual({ karta: null, kosz: { masa: 23, rev: 2 } });
    await rundyIKontrola(u, { karta: null, kosz: { masa: 23, rev: 2 } });
  });

  // Wpis listy konta dla x: powód i to, czy niesie treść albo cień (Bpk.t.c — pełny szyfr albo zaślepka { iv, cien: 1 }).
  async function wpisX(v, sid) {
    const m = (await v.__px.getUserMeta(v.__uid)) || {};
    const e = (m.snapshotTombstones || []).find((x) => x.snapshotId === sid) || null;
    return e ? { powod: e.powod || null, tresc: !!(e.payloadCipher || (e.Bpk && e.Bpk.t && e.Bpk.t.c)) } : null;
  }
  for (const kol of KOLEJNOSCI_8) {
    it(`S9 (${kol}): E4a-ret — wpis retencji x bez treści i bez cienia na trzech`, async () => {
      sztucznyZegar();
      const u = { P: await urzadzenie('P'), K: await urzadzenie('K'), C: await urzadzenie('C') };
      const x1 = await zapisz(u.K, jan(120, 20)); u.X = x1.patientId;
      const x2 = await zapisz(u.K, jan(125, 23), { patientId: u.X });
      await zapisz(u.K, jan(130, 25), { patientId: u.X });
      u.Y = (await zapisz(u.K, ola(110, 18))).patientId; u.Z = (await zapisz(u.K, ola(111, 19))).patientId;
      await sync(u.K, u.P); await sync(u.K, u.C); u.sid = x2.snapshotId;
      przesunZegar(M); await poprawMase(u.P, u.sid, 74);
      przesunZegar(M); await u.K.mergePatients(u.X, u.Y); przesunZegar(M); await u.K.mergePatients(u.Y, u.Z);
      przesunZegar(M); await przytnij(u.K, u.sid); przesunZegar(M);
      for (const k of kol.split(',')) { const [na, z] = k.split('←'); await sync(u[z], u[na]); }
      await rundy([u.P, u.K, u.C], 3);
      for (const n of ['P', 'K', 'C']) expect(await wpisX(u[n], u.sid), `${n}: wpis x`).toEqual({ powod: 'retencja', tresc: false });
    });
  }
});

describe('P-KOSZ-USUWANEJ-KARTY — strażniki źródła', () => {
  const src = kod(SEJF.N);
  it('S6: Bsl_usunPacjenta — decyzja kosza przed usunięciem karty; usunięcie, zbiór kart usuniętych i nagrobek pod Bses_pilnuj bez await pomiędzy', () => {
    const f = src.slice(src.indexOf('async function Bsl_usunPacjenta('), src.indexOf('function yr(t,e){'));
    const iKosz = f.indexOf('if (ctx && !(await Bsl_koszUsuwanejKarty(ctx, patientId, opcje))) return PatientClinicalWriteValue(PatientClinicalOperationAccount,0);');
    const iUsun = f.indexOf('Bses_pilnuj(opcje); // P-CHMURA-OPIS: usuniecie karty tylko w sesji scalania');
    const iRemove = f.indexOf('await I().removePatientForUser(b, PatientClinicalWriteValue(b,patientId));');
    const iNagr = f.indexOf('Bses_pilnuj(opcje); // P-CHMURA-OPIS: zbior kart usunietych i nagrobek karty tylko w sesji scalania');
    const iZbior = f.indexOf('Bpc_usunieta(patientId);');
    const iPut = f.indexOf('await I().putTombstoneForUser(b, PatientClinicalWriteValue(b,{ patientId: patientId, deletedAtISO: deletedAtISO }));');
    const bezAwait = (a, z) => f.slice(a, z).replace(/\/\/[^\n]*/g, '').replace(/^\s*Bses_pilnuj\(opcje\);/, '');
    expect(iKosz).toBeGreaterThan(0);
    expect(iUsun).toBeGreaterThan(iKosz);
    expect(iRemove).toBeGreaterThan(iUsun);
    expect(bezAwait(iUsun, iRemove), 'bez await między sprawdzeniem sesji a usunięciem karty').not.toMatch(/\bawait\b/);
    expect(iNagr).toBeGreaterThan(iRemove);
    expect(iZbior, 'zbiór kart usuniętych po sprawdzeniu sesji').toBeGreaterThan(iNagr);
    expect(iPut).toBeGreaterThan(iZbior);
    expect(bezAwait(iNagr, iPut), 'bez await między sprawdzeniem sesji a nagrobkiem').not.toMatch(/\bawait\b/);
    const k = src.slice(src.indexOf('async function Bsl_koszUsuwanejKarty('), src.indexOf('function Bsl_koszZLadunku('));
    // ta sama decyzja co wersja tutejsza w Bkz_scalKoniec (tylko gałąź kosza), odczyt wersji i zapis listy w sesji scalania
    expect(k.indexOf('Bses_pilnuj(opcje);')).toBeGreaterThan(0);
    expect(k.indexOf('Bses_pilnuj(opcje);'), 'sprawdzenie sesji przed odczytem wersji karty').toBeLessThan(k.indexOf('listSnapshotsForUser(b, patientId)'));
    expect(k).toContain('if (!kosz || kosz < Bkz_zmiana(s)) continue;');
    expect(k).toContain('Bpk_zWersja(e, Bpk_zWersji(s, { c: kosz >= granicaKosza ? s.payloadCipher : null, od: kosz }, Bgw_stan(s, tresc)))');
    expect(k).toContain('await Bkz_zmienListe(dodaj, [], { naStarcie: ctx.naStarcie, Bses_s: opcje && opcje.Bses_s });');
    // Bkz_zmienListe: sprawdzenie sesji scalania przed pierwszym odczytem magazynu
    const z = src.slice(src.indexOf('async function Bkz_zmienListe('), src.indexOf('async function Bpk_retencjaZapisu('));
    expect(z.indexOf('Bses_pilnuj(opcje);')).toBeGreaterThan(0);
    expect(z.indexOf('Bses_pilnuj(opcje);')).toBeLessThan(z.indexOf('getUserMeta(Bpc_uid)'));
  });
  it('S6: Le — karta z ładunku w N do decyzji kosza (Bsl_koszZLadunku), usuwanie kart z kontekstem kosza (bez niego w imporcie)', () => {
    const le = src.slice(src.indexOf('async function Le(t,e){'), src.indexOf('prunedSnapshotCount:Bkz_S.przyciete||0}'));
    expect(le).toContain('if(!F||!F.patientId||!F.header)continue;if(N.has(F.patientId)){Bsl_koszZLadunku(Bkz_S,F);continue}');
    expect(le).toContain('w+=await Bsl_usunPacjenta(j,m[j],e,Bses_imp?null:Bkz_S)');
  });
});
