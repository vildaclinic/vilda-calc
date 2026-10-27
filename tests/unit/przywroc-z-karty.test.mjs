import { afterEach, describe, expect, it, vi } from 'vitest';
import { sztucznyZegar, przesunZegar, zegar, urzadzenie, jan, zapisz, sync, rundy, widoki, zeruj } from './polkrata-uprzaz.mjs';

// P-PRZYWROC-Z-KARTY (PRZ0, decyzja właściciela D5 = a, 2026-10-21): „Przywróć” zapisu, który jest jednocześnie w karcie
// i w koszu.
//
// Reguła. „Już w karcie” ({ alreadyInCard: true }: bez zapisu wersji, tylko zdjęcie nieaktualnego wpisu kosza) — tylko
// gdy wersja w karcie zmieniona PO usunięciu i po przycięciu (chwila zmiany rekordu późniejsza niż Bkz_ostatnie wpisu)
// ORAZ jej treść nie jest starsza niż treść kosza (chwila treści S4, _contentAtISO). Gdy treści karty nie da się
// odczytać — decyduje sama chwila zmiany. W każdym innym przypadku jeden zapis przywrócenia:
//   - treść nowsza z dwóch (karta albo kosz) po chwili treści S4, przy równej — porządek wersji;
//   - gwiazdka: najpóźniejszy z rejestrów karty, treści kosza i nagrobka;
//   - updatedAtISO = stempel późniejszy niż treść kosza, wersja w karcie i usunięcie (Bpp_chwilaZmiany),
//     _contentAtISO = ten stempel;
//   - rev = max(rev wpisu kosza, rev karty) + 1;
//   - savedAtISO i seq z karty, gdy treść z karty, inaczej z wpisu kosza (jak dotąd);
//   - wpis kosza zdjęty, nagłówek karty przebudowany (lastSavedAtISO nie maleje), onPatientSaved z isSnapshotRestore.
// Dotąd (baza ae1ac892) „już w karcie” zapadało także wtedy, gdy wersja w karcie była tylko NOWSZA po chwili zmiany
// rekordu (Bkz_nowszaWersja), choć usunięcie z innego urządzenia (zegar do przodu) było późniejsze: P zdejmował wpis
// kosza bez zapisu, a nagrobek K znów wygrywał na K i C — wizyta znikała z karty na pozostałych urządzeniach.
//
// Stan PRZ0 (jak scenariusz PRZ w s4d7-wspolne.mjs): „Testowy Jan”, dwie wizyty na K (s1 20 kg, s2 23 kg), komplet na P
// i C; P daje s1 do kosza (s2 ostatnią wersją karty P); K z zegarem 10 min do przodu daje s2 do kosza; P dostaje kosz K
// (s2 zostaje w karcie P jako ostatnia wersja i jest w koszu) i poprawia s2 na 78 kg — chwila poprawki przed chwilą
// usunięcia K. Stan „w karcie i w koszu” po A10 (N5, N-bez-odczytu a) odtwarzamy jak w kosz-przywroc-nowsza.test.mjs:
// lista kosza sprzed przywrócenia wraca do metadanych konta. Treść nieczytelną — obcym wektorem IV w rekordzie wersji.
//
// Co na tych testach daje STARY kod (baza ae1ac892: alreadyInCard dla każdej wersji w karcie nowszej po chwili zmiany
// rekordu) — zmierzone tym plikiem na kopii sejfu bazy poza repozytorium: cały plik 19 czerwonych, 8 zielonych (27);
// pierwsze 9 testów (niżej) — 6 czerwonych, 3 zielone; testy z mutacji i z przeglądu — opis przy każdym bloku:
//   N5   pierwsze „Przywróć” → { alreadyInCard: true }, karta 78 z rev 1 (oczekiwane: zapis 78 z rev 2) — czerwony.
//   N8   remis chwil → { alreadyInCard: true }, karta 78 z rev 1 — czerwony; dalej (zmierzone bez przerywania): po
//        synchronizacji K tylko „kosz 78”, po rundach P i C „karta 78 + kosz 78”, K „kosz 78”.
//   N10  poprawka z nową chwilą zapisu → { alreadyInCard: true }, rev 1 (oczekiwane: zapis rev 2 z savedAtISO karty) —
//        czerwony (po synchronizacji K tylko „kosz 78”). Kontrola N10 (treść kosza nowsza) → 74 z savedAtISO wpisu
//        kosza, jak teraz — zielona.
//   N11  brak zapisu, więc zero powiadomień onPatientSaved (oczekiwane: jedno z isSnapshotRestore) — czerwony.
//   N12  treść kosza nowsza → 74 z rev 3, na trzech karta 74, jak teraz — kontrola, zielona.
//   N16  gwiazdka na P po usunięciu K, treść kosza nowsza → { alreadyInCard: true }, na P zostaje 23* z rev 1 (stara
//        treść) — czerwony. Po rundach stary kod też dochodzi do 78* na trzech (złożenie S4 z nagrobka K i C, Bgw_zloz),
//        więc czerwone są tylko wynik „Przywróć” i stan P tuż po nim.
//   N-bez-odczytu (a) wersja w karcie nieczytelna, zmieniona po usunięciu → „już w karcie”, jak teraz — kontrola,
//        zielona; (b) nieczytelna, usunięcie późniejsze → { alreadyInCard: true }, rev 1 (wersja „nowsza” po chwili
//        rekordu), oczekiwane: zapis treści kosza 23 z rev 2 — czerwony.
// Straż sesji (SESSION_CHANGED) nie jest tu sprawdzana — osobny plik.
//
// Prawdziwy vilda_vault.js (uprząż polkrata-uprzaz.mjs: osobne okno i magazyn w pamięci na urządzenie, licznik zapisów),
// synchronizacja przez exportSyncPayload/mergeSyncPayload, sztuczny zegar (vi.useFakeTimers({ toFake: ['Date'] })).
// Dane wyłącznie FIKCYJNE („Testowy Jan”).

const M = 60e3;
afterEach(() => { vi.useRealTimers(); });

// Krok na urządzeniu z zegarem przesuniętym o ms (rozjazd zegarów), potem z powrotem.
async function naZegarze(ms, fn) {
  vi.setSystemTime(zegar.t + ms);
  try { return await fn(); } finally { vi.setSystemTime(zegar.t); }
}
// „Testowy Jan”: s1 120 cm / 20 kg, s2 125 cm / 23 kg na K; P i C dostają komplet.
async function jan2() {
  const P = await urzadzenie('P'), K = await urzadzenie('K'), C = await urzadzenie('C');
  const s1 = await zapisz(K, jan(120, 20));
  const s2 = await zapisz(K, jan(125, 23), { patientId: s1.patientId });
  await sync(K, P); await sync(K, C);
  return { P, K, C, urz: [P, K, C], pid: s1.patientId, s1: s1.snapshotId, sid: s2.snapshotId };
}
const wersja = async (v, pid, sid) => ((await v.getPatient(pid)) || { snapshots: [] }).snapshots.find((s) => s.snapshotId === sid) || null;
const wKoszu = async (v, sid) => (await v.listTrashedSnapshots()).find((e) => e.snapshotId === sid) || null;
const opis = (w) => (w ? { masa: w.payload ? w.payload.user.weight : null, pin: !!w.pinned, rev: w.rev } : null);
async function popraw(v, pid, sid, kg, opcje = { preserveSavedAt: true }) {
  const w = await wersja(v, pid, sid);
  await v.updateSnapshotPayload(pid, sid, { ...w.payload, user: { ...w.payload.user, weight: kg } }, opcje);
  return wersja(v, pid, sid);
}
// Surowa lista kosza konta (metadane) i wpis zapisu sid.
const lista = async (v) => ((await v.__px.getUserMeta(v.__uid)) || {}).snapshotTombstones || [];
const wpis = async (v, sid) => (await lista(v)).find((e) => e.snapshotId === sid) || null;
// Stan po A10 (kosz-przywroc-nowsza.test.mjs): lista kosza sprzed przywrócenia wraca do metadanych konta.
async function wstawListe(v, l) {
  const meta = await v.__px.getUserMeta(v.__uid);
  await v.__px.putUserMeta(v.__uid, { ...meta, snapshotTombstones: JSON.parse(JSON.stringify(l)) });
}
// Treść wersji sid w karcie nieczytelna: obcy wektor IV (z wpisu kosza) — AES-GCM odrzuca szyfr.
async function zepsujTresc(v, pid, sid) {
  const rek = (await v.__px.listSnapshotsForUser(v.__uid, pid)).find((s) => s.snapshotId === sid);
  const obcy = (await lista(v)).find((e) => e.payloadCipher && e.payloadCipher.iv !== rek.payloadCipher.iv).payloadCipher;
  await v.__px.putSnapshotForUser(v.__uid, { ...rek, payloadCipher: { ...rek.payloadCipher, iv: obcy.iv } });
  expect((await wersja(v, pid, sid)).payload, 'kontrola: treść wersji w karcie nieczytelna').toBeNull();
}

// Stan PRZ0 na P (opis w nagłówku pliku); opcjePoprawki — opcje poprawki 78 kg na P.
async function prz0(opcjePoprawki) {
  sztucznyZegar();
  const d = await jan2();
  przesunZegar(M); await d.P.moveSnapshotToTrash(d.pid, d.s1); // s2 ostatnią wersją karty P
  przesunZegar(M); await naZegarze(10 * M, () => d.K.moveSnapshotToTrash(d.pid, d.sid));
  await sync(d.K, d.P);
  przesunZegar(M);
  const karta = await popraw(d.P, d.pid, d.sid, 78, opcjePoprawki);
  const e = await wpis(d.P, d.sid);
  const k = await wKoszu(d.P, d.sid);
  expect({ karta: opis(karta), kosz: k && k.payload.user.weight, usuniecieKPozniej: e.deletedAtISO > karta.updatedAtISO },
    'kontrola: stan PRZ0 na P — w karcie 78 (rev 1), w koszu 23, usunięcie K później niż poprawka P')
    .toEqual({ karta: { masa: 78, pin: false, rev: 1 }, kosz: 23, usuniecieKPozniej: true });
  przesunZegar(M);
  return { ...d, karta, usunieto: e.deletedAtISO, savWpisu: k.savedAtISO };
}

describe('P-PRZYWROC-Z-KARTY: „Przywróć” wersji, która jest w karcie i w koszu (PRZ0, D5 = a)', () => {
  it('N5 PRZ0, pierwsze „Przywróć” → zapis 78 z rev 2 i pusty kosz; lista kosza sprzed przywrócenia wraca (A10), drugie „Przywróć” → „już w karcie”, rev nadal 2, bez zapisu wersji, wpis znika z kosza', async () => {
    const d = await prz0();
    const listaPrzed = await lista(d.P);
    const w1 = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po1 = await wersja(d.P, d.pid, d.sid);
    expect({ juz: w1.alreadyInCard === true, karta: opis(po1), kosz: !!(await wKoszu(d.P, d.sid)) }, 'pierwsze „Przywróć”')
      .toEqual({ juz: false, karta: { masa: 78, pin: false, rev: 2 }, kosz: false });
    expect(po1.updatedAtISO > d.usunieto, 'chwila przywrócenia później niż usunięcie K').toBe(true);

    await wstawListe(d.P, listaPrzed);
    expect(!!(await wKoszu(d.P, d.sid)), 'kontrola: zapis znów w karcie i w koszu').toBe(true);
    zeruj([d.P]);
    przesunZegar(M);
    const w2 = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po2 = await wersja(d.P, d.pid, d.sid);
    expect({
      juz: w2.alreadyInCard === true, karta: opis(po2), upd: po2.updatedAtISO,
      wersje: d.P.__licz.wersje, karty: d.P.__licz.karty, kosz: !!(await wKoszu(d.P, d.sid)),
      listy: d.P.__licz.lista,
    }, 'drugie „Przywróć”').toEqual({ juz: true, karta: { masa: 78, pin: false, rev: 2 }, upd: po1.updatedAtISO, wersje: 0, karty: 0, kosz: false, listy: 1 });
  });

  it('N8 remis: usunięcie K w tej samej chwili co poprawka P (zegar stoi między operacjami) → zapis przywrócenia 78 z rev 2, stempel później niż usunięcie; po synchronizacji K przyjmuje (karta 78, bez kosza), na trzech karta 78', async () => {
    sztucznyZegar();
    const d = await jan2();
    przesunZegar(M); await d.P.moveSnapshotToTrash(d.pid, d.s1);
    przesunZegar(M);
    // Zegar stoi: kosz na K, P dostaje kosz, P poprawia — ta sama chwila.
    await d.K.moveSnapshotToTrash(d.pid, d.sid);
    await sync(d.K, d.P);
    const karta = await popraw(d.P, d.pid, d.sid, 78);
    const e = await wpis(d.P, d.sid);
    const k = await wKoszu(d.P, d.sid);
    expect({ remis: e.deletedAtISO === karta.updatedAtISO, karta: opis(karta), kosz: k && k.payload.user.weight },
      'kontrola: deletedAtISO === updatedAtISO wersji w karcie, w karcie 78, w koszu 23')
      .toEqual({ remis: true, karta: { masa: 78, pin: false, rev: 1 }, kosz: 23 });
    przesunZegar(M);
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po = await wersja(d.P, d.pid, d.sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(po), kosz: !!(await wKoszu(d.P, d.sid)) })
      .toEqual({ juz: false, karta: { masa: 78, pin: false, rev: 2 }, kosz: false });
    expect(po.updatedAtISO > e.deletedAtISO, 'stempel przywrócenia później niż usunięcie').toBe(true);
    await sync(d.P, d.K);
    expect({ karta: opis(await wersja(d.K, d.pid, d.sid)), kosz: !!(await wKoszu(d.K, d.sid)) }, 'K po synchronizacji')
      .toEqual({ karta: { masa: 78, pin: false, rev: 2 }, kosz: false });
    await rundy(d.urz, 3);
    expect(await widoki({ P: d.P, K: d.K, C: d.C }, d.sid)).toEqual({ P: 'karta 78', K: 'karta 78', C: 'karta 78' });
  });

  it('N10 PRZ0 z poprawką zmieniającą chwilę zapisu (preserveSavedAt: false) → przywrócona wersja (treść z karty) ma savedAtISO KARTY, nie wpisu kosza; K przyjmuje tę samą', async () => {
    const d = await prz0({ preserveSavedAt: false });
    expect(d.karta.savedAtISO !== d.savWpisu, 'kontrola: poprawka zmieniła chwilę zapisu wersji w karcie').toBe(true);
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po = await wersja(d.P, d.pid, d.sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(po), sav: po.savedAtISO })
      .toEqual({ juz: false, karta: { masa: 78, pin: false, rev: 2 }, sav: d.karta.savedAtISO });
    await sync(d.P, d.K);
    const naK = await wersja(d.K, d.pid, d.sid);
    expect({ karta: opis(naK), sav: naK && naK.savedAtISO }, 'K po synchronizacji').toEqual({ karta: { masa: 78, pin: false, rev: 2 }, sav: d.karta.savedAtISO });
  });

  it('N10 kontrola: treść kosza nowsza (K poprawia na 74 po poprawce P z nową chwilą zapisu i daje do kosza) → przywrócone 74 z savedAtISO wpisu kosza, jak dotąd', async () => {
    sztucznyZegar();
    const d = await jan2();
    przesunZegar(M); await d.P.moveSnapshotToTrash(d.pid, d.s1);
    przesunZegar(M); const karta = await popraw(d.P, d.pid, d.sid, 78, { preserveSavedAt: false });
    przesunZegar(M); await popraw(d.K, d.pid, d.sid, 74);
    przesunZegar(M); await d.K.moveSnapshotToTrash(d.pid, d.sid);
    await sync(d.K, d.P);
    const k = await wKoszu(d.P, d.sid);
    expect({ karta: opis(await wersja(d.P, d.pid, d.sid)), kosz: k.payload.user.weight, rozne: k.savedAtISO !== karta.savedAtISO },
      'kontrola: w karcie 78 (rev 1), w koszu 74, różne chwile zapisu')
      .toEqual({ karta: { masa: 78, pin: false, rev: 1 }, kosz: 74, rozne: true });
    przesunZegar(M);
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po = await wersja(d.P, d.pid, d.sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(po), sav: po.savedAtISO })
      .toEqual({ juz: false, karta: { masa: 74, pin: false, rev: 2 }, sav: k.savedAtISO });
  });

  it('N11 PRZ0, skutki na P: jedno onPatientSaved { snapshotId, isSnapshotRestore: true }, lastSavedAtISO karty ≥ chwila przywrócenia, _contentAtISO = updatedAtISO, _pinnedState zgodny z gwiazdką', async () => {
    const d = await prz0();
    const zdarzenia = [];
    d.P.onPatientSaved((e) => { zdarzenia.push(e); });
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const karta = await d.P.getPatient(d.pid);
    const po = karta.snapshots.find((s) => s.snapshotId === d.sid);
    expect(zdarzenia.map((e) => ({ patientId: e.patientId, snapshotId: e.snapshotId, przywrocenie: e.isSnapshotRestore === true, sav: e.savedAtISO })),
      'jedno powiadomienie onPatientSaved (planuje synchronizację)')
      .toEqual([{ patientId: d.pid, snapshotId: d.sid, przywrocenie: true, sav: po.savedAtISO }]);
    expect(w.alreadyInCard, 'zapis przywrócenia, nie „już w karcie”').toBeUndefined();
    expect(po.updatedAtISO > d.usunieto, 'chwila przywrócenia później niż usunięcie K').toBe(true);
    expect(karta.lastSavedAtISO >= po.updatedAtISO, 'lastSavedAtISO karty nie wcześniej niż chwila przywrócenia').toBe(true);
    expect(po.payload._contentAtISO, 'chwila treści = chwila przywrócenia').toBe(po.updatedAtISO);
    expect({ pinned: po.pinned, _pinned: po.payload._pinned === true, rejestr: po.payload._pinnedState && po.payload._pinnedState.pin })
      .toEqual({ pinned: false, _pinned: false, rejestr: false });
  });

  it('N12 treść kosza nowsza niż karta (P 78 — rev 1; K później 73, 74 — rev 2, potem kosz) → zapis 74 (kontrola, jak dotąd), rev = max(2, 1) + 1 = 3; na trzech karta 74', async () => {
    sztucznyZegar();
    const d = await jan2();
    przesunZegar(M); await d.P.moveSnapshotToTrash(d.pid, d.s1);
    przesunZegar(M); await popraw(d.P, d.pid, d.sid, 78);
    przesunZegar(M); await popraw(d.K, d.pid, d.sid, 73);
    przesunZegar(M); await popraw(d.K, d.pid, d.sid, 74);
    przesunZegar(M); await d.K.moveSnapshotToTrash(d.pid, d.sid);
    await sync(d.K, d.P);
    const k = await wKoszu(d.P, d.sid);
    expect({ karta: opis(await wersja(d.P, d.pid, d.sid)), kosz: k && k.payload.user.weight, revWpisu: (await wpis(d.P, d.sid)).rev },
      'kontrola: w karcie 78 (rev 1), w koszu 74 (rev 2)')
      .toEqual({ karta: { masa: 78, pin: false, rev: 1 }, kosz: 74, revWpisu: 2 });
    przesunZegar(M);
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po = await wersja(d.P, d.pid, d.sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(po), kosz: !!(await wKoszu(d.P, d.sid)) })
      .toEqual({ juz: false, karta: { masa: 74, pin: false, rev: 3 }, kosz: false });
    expect(po.updatedAtISO > k.deletedAtISO, 'chwila przywrócenia później niż usunięcie K').toBe(true);
    await rundy(d.urz, 3);
    expect(await widoki({ P: d.P, K: d.K, C: d.C }, d.sid)).toEqual({ P: 'karta 74', K: 'karta 74', C: 'karta 74' });
  });

  // Kolejność: P dostaje kosz K, POTEM przypina. Gwiazdka przed odbiorem kosza (wersja P zmieniona po usunięciu K) —
  // scalenie S4 samo składa 78* (Bgw_zloz) i zdejmuje nagrobek: nie byłoby czego przywracać.
  it('N16 tylko gwiazdka po usunięciu, treść kosza nowsza: K poprawia na 78 i daje do kosza; P (karta 23, bez poprawki) dostaje kosz i przypina PO chwili usunięcia → zapis 78* (treść z kosza, gwiazdka P — najpóźniejszy rejestr), rev 2; na K i C karta 78*', async () => {
    sztucznyZegar();
    const d = await jan2();
    przesunZegar(M); await d.P.moveSnapshotToTrash(d.pid, d.s1);
    przesunZegar(M); await popraw(d.K, d.pid, d.sid, 78);
    przesunZegar(M); await d.K.moveSnapshotToTrash(d.pid, d.sid);
    await sync(d.K, d.P);
    przesunZegar(M); await d.P.setSnapshotPinned(d.pid, d.sid, true);
    const przed = await wersja(d.P, d.pid, d.sid);
    const e = await wpis(d.P, d.sid);
    const k = await wKoszu(d.P, d.sid);
    expect({ karta: opis(przed), kosz: k && k.payload.user.weight, gwiazdkaPoUsunieciu: przed.updatedAtISO > e.deletedAtISO },
      'kontrola: w karcie 23* (rev 1, gwiazdka po usunięciu K), w koszu 78')
      .toEqual({ karta: { masa: 23, pin: true, rev: 1 }, kosz: 78, gwiazdkaPoUsunieciu: true });
    przesunZegar(M);
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po = await wersja(d.P, d.pid, d.sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(po), kosz: !!(await wKoszu(d.P, d.sid)) })
      .toEqual({ juz: false, karta: { masa: 78, pin: true, rev: 2 }, kosz: false });
    expect({ _pinned: po.payload._pinned === true, rejestr: po.payload._pinnedState && po.payload._pinnedState.pin, cz: po.payload._contentAtISO === po.updatedAtISO })
      .toEqual({ _pinned: true, rejestr: true, cz: true });
    await rundy(d.urz, 3);
    expect(await widoki({ P: d.P, K: d.K, C: d.C }, d.sid)).toEqual({ P: 'karta 78*', K: 'karta 78*', C: 'karta 78*' });
  });
});

describe('P-PRZYWROC-Z-KARTY: wersja w karcie nieczytelna — decyduje sama chwila zmiany', () => {
  it('N-bez-odczytu (a) wersja zmieniona po usunięciu (A10 po zwykłym przywróceniu), treść karty nieczytelna → „już w karcie”, bez zapisu wersji, wpis znika z kosza (kontrola, jak dotąd)', async () => {
    sztucznyZegar();
    const d = await jan2();
    przesunZegar(M); await d.P.moveSnapshotToTrash(d.pid, d.sid); // s1 zostaje w karcie: zwykłe przywrócenie
    const listaPrzed = await lista(d.P);
    przesunZegar(M);
    expect((await d.P.restoreTrashedSnapshot(d.pid, d.sid)).alreadyInCard, 'kontrola: zwykłe przywrócenie').toBeUndefined();
    await wstawListe(d.P, listaPrzed);
    await zepsujTresc(d.P, d.pid, d.sid);
    const rek = (await d.P.__px.listSnapshotsForUser(d.P.__uid, d.pid)).find((s) => s.snapshotId === d.sid);
    zeruj([d.P]);
    przesunZegar(M);
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po = (await d.P.__px.listSnapshotsForUser(d.P.__uid, d.pid)).find((s) => s.snapshotId === d.sid);
    expect({ juz: w.alreadyInCard === true, wersje: d.P.__licz.wersje, rev: po.rev, upd: po.updatedAtISO, kosz: !!(await wKoszu(d.P, d.sid)) })
      .toEqual({ juz: true, wersje: 0, rev: rek.rev, upd: rek.updatedAtISO, kosz: false });
  });

  it('N-bez-odczytu (b) PRZ0 z nieczytelną treścią karty (usunięcie K później niż zmiana karty) → zapis treści kosza 23 z rev 2, stempel później niż usunięcie, kosz pusty', async () => {
    const d = await prz0();
    await zepsujTresc(d.P, d.pid, d.sid);
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po = await wersja(d.P, d.pid, d.sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(po), sav: po.savedAtISO, kosz: !!(await wKoszu(d.P, d.sid)) })
      .toEqual({ juz: false, karta: { masa: 23, pin: false, rev: 2 }, sav: d.savWpisu, kosz: false });
    expect(po.updatedAtISO > d.usunieto, 'stempel później niż usunięcie K').toBe(true);
  });
});

// Testy dopisane po teście mutacyjnym Bkz_przywroc (mut2, 2026-10-27): każdy zabija mutanta, który przeżył cały zestaw
// testów PRZ (8 plików), albo którego zabijał tylko strażnik źródła. W tytule mutant i wynik na bazie ae1ac892
// (zmierzony tym plikiem na kopii z sejfem bazy). Przycięcie — retencja z recentHours: 0 na C (zostaje ostatnia wersja
// dnia, więc s2 musi mieć na C nowszą wizytę s3).
const ola = (height, weight) => ({
  name: 'Testowa Ola',
  user: { lastName: 'Testowa', firstName: 'Ola', dobISO: '2017-05-02', sex: 'F', height, weight },
});
const surowa = async (v, pid, sid) => (await v.__px.listSnapshotsForUser(v.__uid, pid)).find((s) => s.snapshotId === sid) || null;
// „Testowy Jan” z trzema wizytami na K (s1 20 kg, s2 23 kg, s3 25 kg), komplet na P i C; P daje s1 i s3 do kosza —
// s2 jedyną wersją karty P; K daje s2 do kosza (zegar bez rozjazdu); P dostaje kosz K (s2 w karcie i w koszu 23)
// i poprawia s2 na 78 (po usunięciu); C (bez wiedzy o koszu) przycina s1 i s2, P dostaje przycięcie od C.
async function prz0ZPrzycieciem() {
  sztucznyZegar();
  const P = await urzadzenie('P'), K = await urzadzenie('K'), C = await urzadzenie('C');
  const s1 = await zapisz(K, jan(120, 20));
  const pid = s1.patientId;
  const s2 = await zapisz(K, jan(125, 23), { patientId: pid });
  const s3 = await zapisz(K, jan(130, 25), { patientId: pid });
  await sync(K, P); await sync(K, C);
  const sid = s2.snapshotId;
  przesunZegar(M); await P.moveSnapshotToTrash(pid, s1.snapshotId); await P.moveSnapshotToTrash(pid, s3.snapshotId);
  przesunZegar(M); await K.moveSnapshotToTrash(pid, sid);
  await sync(K, P);
  przesunZegar(M); const karta = await popraw(P, pid, sid, 78);
  przesunZegar(M);
  expect((await C.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds, 'kontrola: retencja na C przycina s2').toContain(sid);
  await sync(C, P);
  const e = await wpis(P, sid);
  const k = await wKoszu(P, sid);
  expect({
    karta: opis(await wersja(P, pid, sid)), kosz: k && k.payload.user.weight,
    poUsunieciu: e.deletedAtISO < karta.updatedAtISO, przedPrzycieciem: karta.updatedAtISO < e.przycietoISO,
  }, 'kontrola: na P karta 78 (rev 1, zmiana po usunięciu K, przed przycięciem C), w koszu 23 z chwilą przycięcia')
    .toEqual({ karta: { masa: 78, pin: false, rev: 1 }, kosz: 23, poUsunieciu: true, przedPrzycieciem: true });
  przesunZegar(M);
  return { P, K, C, urz: [P, K, C], pid, sid, przycieto: e.przycietoISO };
}

describe('P-PRZYWROC-Z-KARTY: przycięcie, gwiazdka, chwila zmiany i seq (testy z mutacji)', () => {
  // M18 (Bkz_ostatnie(e) → e.deletedAtISO w Bkz_przywroc) i M18a (tylko w warunku „już w karcie”): „już w karcie”, bez
  // zapisu — przycięcie C (późniejsze niż poprawka P) wygrywa z wersją nieprzypiętą na K i C. Baza: „już w karcie”,
  // po rundach P „karta 78”, K „karta 78”, C „brak” — czerwony.
  it('N-przycięcie: wersja w karcie zmieniona po usunięciu K, ale przed przycięciem na C → zapis przywrócenia 78 z rev 2, stempel później niż przycięcie; na trzech karta 78', async () => {
    const d = await prz0ZPrzycieciem();
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po = await wersja(d.P, d.pid, d.sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(po), kosz: !!(await wKoszu(d.P, d.sid)) })
      .toEqual({ juz: false, karta: { masa: 78, pin: false, rev: 2 }, kosz: false });
    expect(po.updatedAtISO > d.przycieto, 'stempel przywrócenia później niż przycięcie C').toBe(true);
    przesunZegar(M);
    await rundy(d.urz, 3);
    expect(await widoki({ P: d.P, K: d.K, C: d.C }, d.sid)).toEqual({ P: 'karta 78', K: 'karta 78', C: 'karta 78' });
  });

  // M18c (doISO: e.deletedAtISO w gałęzi „już w karcie”): wpis z chwilą przycięcia późniejszą niż usunięcie nie znika
  // z kosza (Bkz_zmienListe zdejmuje tylko nagrobek nie późniejszy niż doISO). Baza: zielony (ta sama gałąź, doISO
  // z Bkz_ostatnie).
  it('N-przycięcie, „już w karcie”: P poprawia s2 na 79 już po przycięciu → „już w karcie”, rev bez zmian, bez zapisu wersji, wpis (z chwilą przycięcia) znika z kosza P', async () => {
    const d = await prz0ZPrzycieciem();
    const karta = await popraw(d.P, d.pid, d.sid, 79);
    expect(karta.updatedAtISO > d.przycieto, 'kontrola: poprawka później niż przycięcie').toBe(true);
    przesunZegar(M);
    zeruj([d.P]);
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(await wersja(d.P, d.pid, d.sid)), wersje: d.P.__licz.wersje, kosz: !!(await wKoszu(d.P, d.sid)), wpis: !!(await wpis(d.P, d.sid)) })
      .toEqual({ juz: true, karta: { masa: 79, pin: false, rev: 2 }, wersje: 0, kosz: false, wpis: false });
  });

  // M19 (gwiazdka tylko z karty, bez rejestru treści kosza i nagrobka): na P zostaje 78* — odpięcie K (późniejsze)
  // ginie na P aż do następnej synchronizacji (katalog PRZ-odp sprawdza tylko stan po rundach). Baza: treść wybierana
  // po chwili zmiany rekordu — 23 z rev 3 (utrata poprawki 78) — czerwony.
  it('N-odepnij (PRZ-odp): P przypina s2 (K zna gwiazdkę), daje s1 do kosza, poprawia s2 na 78; K (zegar +10 min) „Odepnij i usuń” s2; P dostaje kosz K → tuż po „Przywróć” na P 78 bez gwiazdki z rev 3', async () => {
    sztucznyZegar();
    const d = await jan2();
    przesunZegar(M); await d.P.setSnapshotPinned(d.pid, d.sid, true); await sync(d.P, d.K);
    przesunZegar(M); await d.P.moveSnapshotToTrash(d.pid, d.s1);
    przesunZegar(M); await popraw(d.P, d.pid, d.sid, 78);
    przesunZegar(M); await naZegarze(10 * M, () => d.K.moveSnapshotToTrash(d.pid, d.sid, { odepnij: true }));
    await sync(d.K, d.P);
    const k = await wKoszu(d.P, d.sid);
    expect({ karta: opis(await wersja(d.P, d.pid, d.sid)), kosz: k && k.payload.user.weight, koszGwiazdka: k && k.pinned },
      'kontrola: na P karta 78* (rev 2), w koszu 23 bez gwiazdki').toEqual({ karta: { masa: 78, pin: true, rev: 2 }, kosz: 23, koszGwiazdka: false });
    przesunZegar(M);
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po = await wersja(d.P, d.pid, d.sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(po), rejestr: po.payload._pinnedState && po.payload._pinnedState.pin, _pinned: po.payload._pinned === true })
      .toEqual({ juz: false, karta: { masa: 78, pin: false, rev: 3 }, rejestr: false, _pinned: false });
  });

  // M12a (rejestr gwiazdki z karty zamiast z treści kosza, nagrobek dalej) i M19: 23* na P, a po rundach 23* na trzech —
  // nagrobek K (221) nie ma pola gwiazdka, odpięcie K jest tylko w treści kosza. Baza: zielony.
  it('N-221-odepnij: P przypina s2 (K na 221 zna gwiazdkę) i daje s1 do kosza; K (221) odpina s2 i daje do kosza; P (karta 23*) dostaje kosz → zapis 23 bez gwiazdki z rev 3; na trzech karta 23', async () => {
    sztucznyZegar();
    const P = await urzadzenie('P'), K = await urzadzenie('K', 'S221'), C = await urzadzenie('C');
    const s1 = await zapisz(K, jan(120, 20));
    const pid = s1.patientId;
    const sid = (await zapisz(K, jan(125, 23), { patientId: pid })).snapshotId;
    await sync(K, P); await sync(K, C);
    przesunZegar(M); await P.setSnapshotPinned(pid, sid, true); await sync(P, K);
    przesunZegar(M); await P.moveSnapshotToTrash(pid, s1.snapshotId);
    przesunZegar(M); await K.setSnapshotPinned(pid, sid, false);
    przesunZegar(M); await K.moveSnapshotToTrash(pid, sid);
    await sync(K, P);
    const e = await wpis(P, sid);
    expect({ widoki: await widoki({ P, K, C }, sid), gwiazdkaNagrobka: e.gwiazdka || null },
      'kontrola: P karta 23* + kosz 23, nagrobek 221 bez rejestru gwiazdki')
      .toEqual({ widoki: { P: 'karta 23* + kosz 23', K: 'kosz 23', C: 'karta 23' }, gwiazdkaNagrobka: null });
    przesunZegar(M);
    const w = await P.restoreTrashedSnapshot(pid, sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(await wersja(P, pid, sid)) })
      .toEqual({ juz: false, karta: { masa: 23, pin: false, rev: 3 } });
    przesunZegar(M);
    await rundy([P, K, C], 3);
    expect(await widoki({ P, K, C }, sid)).toEqual({ P: 'karta 23', K: 'karta 23', C: 'karta 23' });
  });

  // M28 (bez rejestru nagrobka, Bgw_zWpisu(e)): na P 78 bez gwiazdki tuż po „Przywróć” (dopiero rundy składają 78*).
  // Baza: zielony.
  it('N-rejestr-nagrobka: P daje s1 do kosza; K poprawia s2 na 78; C (bez wiedzy) przypina s2; K (zegar +10 min) daje s2 do kosza; P dostaje kosz K i wersję C → treść kosza 78 bez gwiazdki, rejestr nagrobka przypięty → tuż po „Przywróć” na P 78* z rev 2', async () => {
    sztucznyZegar();
    const d = await jan2();
    przesunZegar(M); await d.P.moveSnapshotToTrash(d.pid, d.s1);
    przesunZegar(M); await popraw(d.K, d.pid, d.sid, 78);
    przesunZegar(M); await d.C.setSnapshotPinned(d.pid, d.sid, true);
    przesunZegar(M); await naZegarze(10 * M, () => d.K.moveSnapshotToTrash(d.pid, d.sid));
    await sync(d.K, d.P); await sync(d.C, d.P);
    const e = await wpis(d.P, d.sid);
    const k = await wKoszu(d.P, d.sid);
    expect({
      karta: opis(await wersja(d.P, d.pid, d.sid)), kosz: k && k.payload.user.weight,
      rejestrTresci: k && k.payload._pinnedState && k.payload._pinnedState.pin, rejestrNagrobka: !!(e.gwiazdka && e.gwiazdka.pin),
    }, 'kontrola: na P karta 23, w koszu 78 z treścią bez gwiazdki i przypiętym rejestrem nagrobka')
      .toEqual({ karta: { masa: 23, pin: false, rev: 0 }, kosz: 78, rejestrTresci: false, rejestrNagrobka: true });
    przesunZegar(M);
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po = await wersja(d.P, d.pid, d.sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(po), rejestr: po.payload._pinnedState && po.payload._pinnedState.pin })
      .toEqual({ juz: false, karta: { masa: 78, pin: true, rev: 2 }, rejestr: true });
  });

  // M34 (Vn z savedAtISO wpisu kosza zamiast przywróconej wersji). Baza: „już w karcie”, bez powiadomienia — czerwony.
  it('N10b PRZ0 z poprawką zmieniającą chwilę zapisu: onPatientSaved niesie savedAtISO przywróconej wersji (karty), nie wpisu kosza', async () => {
    const d = await prz0({ preserveSavedAt: false });
    const zdarzenia = [];
    d.P.onPatientSaved((e) => { zdarzenia.push(e); });
    await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po = await wersja(d.P, d.pid, d.sid);
    expect({ sav: po.savedAtISO, zdarzenia: zdarzenia.map((e) => ({ sid: e.snapshotId, przywrocenie: e.isSnapshotRestore === true, sav: e.savedAtISO })) })
      .toEqual({ sav: d.karta.savedAtISO, zdarzenia: [{ sid: d.sid, przywrocenie: true, sav: d.karta.savedAtISO }] });
  });

  // M27 (opis wersji w karcie zastąpiony opisem wpisu kosza w porównaniu treści): przy równej chwili treści karta nie jest
  // „nowsza” — zapis przywrócenia z rev 2 zamiast „już w karcie”. Baza: zielony.
  it('N-gwiazdka-po-usunięciu, ta sama treść: P daje s1 do kosza; K daje s2 do kosza; P dostaje kosz i przypina s2 → „już w karcie”, rev 1, bez zapisu wersji, kosz P pusty; na trzech karta 23*', async () => {
    sztucznyZegar();
    const d = await jan2();
    przesunZegar(M); await d.P.moveSnapshotToTrash(d.pid, d.s1);
    przesunZegar(M); await d.K.moveSnapshotToTrash(d.pid, d.sid);
    await sync(d.K, d.P);
    przesunZegar(M); await d.P.setSnapshotPinned(d.pid, d.sid, true);
    const przed = await wersja(d.P, d.pid, d.sid);
    const e = await wpis(d.P, d.sid);
    const k = await wKoszu(d.P, d.sid);
    expect({ karta: opis(przed), kosz: k && k.payload.user.weight, poUsunieciu: przed.updatedAtISO > e.deletedAtISO, ta: przed.payload._contentAtISO === k.payload._contentAtISO },
      'kontrola: karta 23* (gwiazdka po usunięciu), w koszu 23, ta sama chwila treści')
      .toEqual({ karta: { masa: 23, pin: true, rev: 1 }, kosz: 23, poUsunieciu: true, ta: true });
    przesunZegar(M);
    zeruj([d.P]);
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(await wersja(d.P, d.pid, d.sid)), wersje: d.P.__licz.wersje, kosz: !!(await wKoszu(d.P, d.sid)) })
      .toEqual({ juz: true, karta: { masa: 23, pin: true, rev: 1 }, wersje: 0, kosz: false });
    przesunZegar(M);
    await rundy(d.urz, 3);
    expect(await widoki({ P: d.P, K: d.K, C: d.C }, d.sid)).toEqual({ P: 'karta 23*', K: 'karta 23*', C: 'karta 23*' });
  });

  // M31 (Bpp_chwilaZmiany bez chwili zmiany wersji w karcie): stempel przywrócenia z zegara P (teraz) — wcześniejszy niż
  // wersja w karcie, którą zastępuje. Baza: „już w karcie”, 23* z rev 1 — czerwony.
  it('N-zegar-karty: K poprawia s2 na 78 i daje do kosza; P dostaje kosz i przypina s2 z zegarem +10 min → zapis 78* z rev 2 ze stemplem później niż wersja w karcie, choć zegar P już wrócił; na trzech karta 78*', async () => {
    sztucznyZegar();
    const d = await jan2();
    przesunZegar(M); await d.P.moveSnapshotToTrash(d.pid, d.s1);
    przesunZegar(M); await popraw(d.K, d.pid, d.sid, 78);
    przesunZegar(M); await d.K.moveSnapshotToTrash(d.pid, d.sid);
    await sync(d.K, d.P);
    przesunZegar(M); await naZegarze(10 * M, () => d.P.setSnapshotPinned(d.pid, d.sid, true));
    const przed = await wersja(d.P, d.pid, d.sid);
    expect({ karta: opis(przed), wPrzyszlosci: przed.updatedAtISO > new Date(zegar.t + 2 * M).toISOString() },
      'kontrola: karta 23* z chwilą zmiany z zegara +10 min').toEqual({ karta: { masa: 23, pin: true, rev: 1 }, wPrzyszlosci: true });
    przesunZegar(M);
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po = await wersja(d.P, d.pid, d.sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(po) }).toEqual({ juz: false, karta: { masa: 78, pin: true, rev: 2 } });
    expect(po.updatedAtISO > przed.updatedAtISO, 'stempel przywrócenia później niż zastępowana wersja w karcie').toBe(true);
    przesunZegar(M);
    await rundy(d.urz, 3);
    expect(await widoki({ P: d.P, K: d.K, C: d.C }, d.sid)).toEqual({ P: 'karta 78*', K: 'karta 78*', C: 'karta 78*' });
  });

  // M20 (Bm1(obecna, e) → Bm1(e)) i M46 (seq karty także przy treści z kosza). „Scal pacjentów” na P przenumerowuje
  // wersje karty docelowej (seq), wpis kosza zostaje z dawnym numerem. Baza: N-seq — „już w karcie” (seq 3 bez zapisu,
  // rev 1) — czerwony; N-seq kontrola — zielony.
  async function zeScaleniem(kontrola) {
    sztucznyZegar();
    const P = await urzadzenie('P'), K = await urzadzenie('K'), C = await urzadzenie('C');
    const o1 = await zapisz(K, ola(110, 18));
    await zapisz(K, ola(111, 19), { patientId: o1.patientId });
    const s1 = await zapisz(K, jan(120, 20));
    const pid = s1.patientId;
    const sid = (await zapisz(K, jan(125, 23), { patientId: pid })).snapshotId;
    await sync(K, P); await sync(K, C);
    przesunZegar(M); await P.moveSnapshotToTrash(pid, s1.snapshotId);
    if (kontrola) { przesunZegar(M); await popraw(P, pid, sid, 78); przesunZegar(M); await popraw(K, pid, sid, 73); przesunZegar(M); await popraw(K, pid, sid, 74); }
    przesunZegar(M); await naZegarze(10 * M, () => K.moveSnapshotToTrash(pid, sid));
    await sync(K, P);
    if (!kontrola) { przesunZegar(M); await popraw(P, pid, sid, 78); }
    przesunZegar(M); await P.mergePatients(o1.patientId, pid);
    const rek = await surowa(P, pid, sid);
    const k = await wKoszu(P, sid);
    expect({ seqKarty: rek.seq, seqWpisu: (await wpis(P, sid)).seq, karta: opis(await wersja(P, pid, sid)), kosz: k && k.payload.user.weight },
      'kontrola: po „Scal pacjentów” s2 w karcie z seq 3, wpis kosza z seq 2')
      .toEqual({ seqKarty: 3, seqWpisu: 2, karta: { masa: 78, pin: false, rev: 1 }, kosz: kontrola ? 74 : 23 });
    przesunZegar(M);
    return { P, K, C, pid, sid };
  }
  it('N-seq: treść z karty (78 nowsza niż kosz 23), wersja w karcie z seq przenumerowanym przez „Scal pacjentów” → przywrócona wersja ma seq karty (3)', async () => {
    const d = await zeScaleniem(false);
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po = await surowa(d.P, d.pid, d.sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(await wersja(d.P, d.pid, d.sid)), seq: po.seq })
      .toEqual({ juz: false, karta: { masa: 78, pin: false, rev: 2 }, seq: 3 });
  });
  it('N-seq kontrola: treść z kosza (74 nowsza niż karta 78) → przywrócona wersja ma seq wpisu kosza (2), jak dotąd', async () => {
    const d = await zeScaleniem(true);
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po = await surowa(d.P, d.pid, d.sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(await wersja(d.P, d.pid, d.sid)), seq: po.seq })
      .toEqual({ juz: false, karta: { masa: 74, pin: false, rev: 3 }, seq: 2 });
  });
});

describe('P-PRZYWROC-Z-KARTY: wyścig z listą kosza i błąd szyfrowania (testy z mutacji)', () => {
  // M36 (gałąź „już w karcie” zdejmuje wpis bez doISO): późniejsze usunięcie z C, scalone w innej karcie w trakcie
  // „Przywróć”, znika z kosza P. Baza: czerwony już na kontroli — pierwsze „Przywróć” stanu PRZ0 to w bazie „już
  // w karcie” (karta 78 z rev 1, nie 2); sama gałąź „już w karcie” z doISO jest w bazie taka sama.
  it('N-wyścig: w trakcie „Przywróć” („już w karcie”) inna karta P zapisuje późniejsze usunięcie s2 z C → „już w karcie”, późniejszy wpis zostaje w koszu P', async () => {
    const d = await prz0();
    const listaPrzed = await lista(d.P);
    await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    const po1 = await wersja(d.P, d.pid, d.sid);
    // C (bez wiedzy o krokach P i K, zegar +30 min) daje s2 do kosza; P scala — późniejsze usunięcie (s2 zostaje
    // w karcie P jako ostatnia wersja). Ta lista to „lista innej karty”; P wraca do listy sprzed pierwszego „Przywróć”.
    przesunZegar(M); await naZegarze(30 * M, () => d.C.moveSnapshotToTrash(d.pid, d.sid));
    await sync(d.C, d.P);
    const pozniej = await wpis(d.P, d.sid);
    expect({ karta: opis(await wersja(d.P, d.pid, d.sid)), pozniej: !!pozniej && pozniej.deletedAtISO > po1.updatedAtISO },
      'kontrola: po scaleniu z C karta 78 (rev 2) i wpis kosza z usunięciem późniejszym niż przywrócenie')
      .toEqual({ karta: { masa: 78, pin: false, rev: 2 }, pozniej: true });
    const listaPozniej = await lista(d.P);
    await wstawListe(d.P, listaPrzed);
    expect((await wpis(d.P, d.sid)).deletedAtISO < po1.updatedAtISO, 'kontrola: wpis kosza sprzed pierwszego „Przywróć”').toBe(true);
    przesunZegar(M);
    const oryg = d.P.__px.listSnapshotsForUser;
    let wywolania = 0;
    d.P.__px.listSnapshotsForUser = async (...a) => {
      const r = await oryg(...a);
      wywolania += 1;
      if (wywolania === 1) await wstawListe(d.P, listaPozniej); // inna karta: zapis listy po odczycie wersji w „Przywróć”
      return r;
    };
    let w;
    try { w = await d.P.restoreTrashedSnapshot(d.pid, d.sid); } finally { d.P.__px.listSnapshotsForUser = oryg; }
    const e = await wpis(d.P, d.sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(await wersja(d.P, d.pid, d.sid)), wpis: !!e && e.deletedAtISO === pozniej.deletedAtISO })
      .toEqual({ juz: true, karta: { masa: 78, pin: false, rev: 2 }, wpis: true });
  });

  // M41 (szyfr zapasowy zawsze z wpisu kosza): przy błędzie szyfrowania treść kosza 23 zastępuje nowszą treść karty 78.
  // Baza: „już w karcie” bez szyfrowania (78 z rev 1) — czerwony na kontroli.
  it('N-błąd-szyfrowania: PRZ0, szyfrowanie nowej treści przywrócenia zawodzi raz → zapis z dotychczasowym szyfrem treści karty (78), nie treści kosza; rev 2', async () => {
    const d = await prz0();
    const szyfruj = vi.spyOn(globalThis.crypto.subtle, 'encrypt').mockRejectedValueOnce(new Error('chwilowy błąd WebCrypto'));
    let w, wywolania;
    try { w = await d.P.restoreTrashedSnapshot(d.pid, d.sid); wywolania = szyfruj.mock.calls.length; } finally { szyfruj.mockRestore(); }
    const po = await wersja(d.P, d.pid, d.sid);
    expect(wywolania, 'kontrola: „Przywróć” szyfrowało nową treść').toBeGreaterThan(0);
    expect({
      juz: w.alreadyInCard === true, karta: opis(po), kosz: !!(await wKoszu(d.P, d.sid)),
      szyfrKarty: po.payload._contentAtISO === d.karta.payload._contentAtISO,
    }, 'zapis z dotychczasowym szyfrem karty (chwila treści z poprawki 78)')
      .toEqual({ juz: false, karta: { masa: 78, pin: false, rev: 2 }, kosz: false, szyfrKarty: true });
  });
});

describe('P-PRZYWROC-Z-KARTY: sesja w gałęzi „już w karcie” (test z mutacji)', () => {
  // M15d (Bkz_zmienListe w gałęzi „już w karcie” bez opcji sesji): lista kosza zapisana po ponownym zalogowaniu —
  // wpis znika, choć „Przywróć” kończy się SESSION_CHANGED. Sesja zmienia się w odczycie wstępnym listy w Bkz_zmienListe,
  // już po straży pilnuj() tej gałęzi. Baza: brak straży sesji — „już w karcie” bez błędu, lista zapisana — czerwony.
  it('N-sesja-już-w-karcie: drugie „Przywróć” (stan A10, „już w karcie”), w trakcie zmiany listy ponowne zalogowanie tego samego konta → SESSION_CHANGED („Przywracanie przerwane”), bez zapisu listy po przełączeniu, wpis zostaje w koszu', async () => {
    const d = await prz0();
    const listaPrzed = await lista(d.P);
    await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    await wstawListe(d.P, listaPrzed);
    przesunZegar(M);
    const oryg = d.P.__px.getUserMeta;
    let przelaczono = false;
    let po = null;
    d.P.__px.getUserMeta = async (...a) => {
      const wZmianieListy = !przelaczono && new Error().stack.includes('Bkz_zmienListe');
      const r = await oryg(...a);
      if (wZmianieListy) {
        przelaczono = true;
        d.P.lock('manual');
        await d.P.unlockUser(d.P.__uid, d.P.__haslo);
        po = { ...d.P.__licz };
      }
      return r;
    };
    let wynik;
    try { wynik = await d.P.restoreTrashedSnapshot(d.pid, d.sid); } catch (er) { wynik = { kod: er.code, msg: er.message }; } finally { d.P.__px.getUserMeta = oryg; }
    expect(przelaczono, 'kontrola: przełączenie w zmianie listy kosza').toBe(true);
    const zapisyPo = { lista: d.P.__licz.lista - po.lista, wersje: d.P.__licz.wersje - po.wersje, karty: d.P.__licz.karty - po.karty };
    expect({ wynik, zapisyPo, wKoszu: !!(await wKoszu(d.P, d.sid)) }).toEqual({
      wynik: { kod: 'SESSION_CHANGED', msg: 'W trakcie zablokowano sejf albo przełączono konto. Przywracanie przerwane.' },
      zapisyPo: { lista: 0, wersje: 0, karty: 0 }, wKoszu: true,
    });
  });
});

describe('P-PRZYWROC-Z-KARTY: rejestr gwiazdki z jego chwilą i nieczytelna treść kosza (przegląd PRZ0)', () => {
  // Rejestr gwiazdki przywrócenia: najpóźniejszy z rejestrów (wersji w karcie, treści kosza, nagrobka) z jego własną
  // chwilą — także gdy ma tę samą gwiazdkę co rejestr treści. Dotąd przy tej samej gwiazdce zostawał rejestr treści ze
  // starszą chwilą i wcześniejsze przypięcie z innego urządzenia wracało po „Odepnij i usuń” (D2 = a). Baza: 44* na trzech.
  it('N-rejestr-chwila (zwykła gałąź): P przypina s2, K zna gwiazdkę; C (bez wiedzy) poprawia s2 na 44; K „Odepnij i usuń” s2 i dostaje poprawkę C; „Przywróć” na K → 44 bez gwiazdki z rejestrem odpięcia K; po rundach na trzech karta 44 bez gwiazdki', async () => {
    sztucznyZegar();
    const d = await jan2();
    przesunZegar(M); await d.P.setSnapshotPinned(d.pid, d.sid, true);
    przesunZegar(M); await sync(d.P, d.K);
    przesunZegar(M); await popraw(d.C, d.pid, d.sid, 44);
    przesunZegar(M); await d.K.moveSnapshotToTrash(d.pid, d.sid, { odepnij: true });
    przesunZegar(M); await sync(d.C, d.K);
    const e = await wpis(d.K, d.sid);
    const k = await wKoszu(d.K, d.sid);
    expect({ kosz: k && k.payload.user.weight, nagrobek: e.gwiazdka && e.gwiazdka.pin, rejestrTresci: k && k.payload._pinnedState.at },
      'kontrola: w koszu K 44 (treść C bez rejestru), rejestr nagrobka — odpięcie K').toEqual({ kosz: 44, nagrobek: false, rejestrTresci: null });
    przesunZegar(M);
    const w = await d.K.restoreTrashedSnapshot(d.pid, d.sid);
    const r = await wersja(d.K, d.pid, d.sid);
    // rev 3 = rev nagrobka (przypięcie 1, odpięcie 2) + 1.
    expect({ juz: w.alreadyInCard === true, karta: opis(r), rejestr: { pin: r.payload._pinnedState.pin, at: r.payload._pinnedState.at } },
      'tuż po „Przywróć” na K').toEqual({ juz: false, karta: { masa: 44, pin: false, rev: 3 }, rejestr: { pin: false, at: e.gwiazdka.at } });
    przesunZegar(M);
    await rundy(d.urz, 3);
    expect(await widoki({ P: d.P, K: d.K, C: d.C }, d.sid)).toEqual({ P: 'karta 44', K: 'karta 44', C: 'karta 44' });
  });

  // To samo w gałęzi treści z karty: D daje s1 do kosza (s2 ostatnią wersją D) i poprawia s2 na 60, K odpina i daje do
  // kosza później; D dostaje kosz K (karta 60 + kosz 44) — „Przywróć” na D zapisuje 60 z rejestrem odpięcia K.
  // Baza: „już w karcie” (karta D 60 r1); po rundach P, K i C sam kosz 60, D karta 60* i kosz 60 — czerwony.
  it('N-rejestr-chwila (treść z karty, 4 urządzenia): P przypina s2; C (bez wiedzy) poprawia na 44; D poprawia na 60 jako ostatnią wersję; K „Odepnij i usuń”; „Przywróć” na D → 60 bez gwiazdki z rejestrem odpięcia K; po rundach na czterech karta 60', async () => {
    sztucznyZegar();
    const d = await jan2();
    const D = await urzadzenie('D');
    await sync(d.K, D);
    const urz = [...d.urz, D];
    przesunZegar(M); await d.P.setSnapshotPinned(d.pid, d.sid, true);
    przesunZegar(M); await sync(d.P, d.K);
    przesunZegar(M); await popraw(d.C, d.pid, d.sid, 44);
    przesunZegar(M); await D.moveSnapshotToTrash(d.pid, d.s1);
    przesunZegar(M); await popraw(D, d.pid, d.sid, 60);
    przesunZegar(M); await d.K.moveSnapshotToTrash(d.pid, d.sid, { odepnij: true });
    przesunZegar(M); await sync(d.C, d.K);
    przesunZegar(M); await sync(d.K, D);
    const e = await wpis(D, d.sid);
    expect({ karta: opis(await wersja(D, d.pid, d.sid)), kosz: (await wKoszu(D, d.sid)).payload.user.weight, nagrobek: e.gwiazdka && e.gwiazdka.pin },
      'kontrola: D — karta 60 i kosz 44, rejestr nagrobka — odpięcie K').toEqual({ karta: { masa: 60, pin: false, rev: 1 }, kosz: 44, nagrobek: false });
    przesunZegar(M);
    const w = await D.restoreTrashedSnapshot(d.pid, d.sid);
    const r = await wersja(D, d.pid, d.sid);
    // rev 3 = max(rev nagrobka 2, rev karty D 1) + 1.
    expect({ juz: w.alreadyInCard === true, karta: opis(r), rejestr: { pin: r.payload._pinnedState.pin, at: r.payload._pinnedState.at } },
      'tuż po „Przywróć” na D').toEqual({ juz: false, karta: { masa: 60, pin: false, rev: 3 }, rejestr: { pin: false, at: e.gwiazdka.at } });
    przesunZegar(M);
    await rundy(urz, 3);
    expect(await widoki({ P: d.P, K: d.K, C: d.C, D }, d.sid)).toEqual({ P: 'karta 60', K: 'karta 60', C: 'karta 60', D: 'karta 60' });
  });

  // Treść wpisu kosza nieczytelna na tym urządzeniu (obcy wektor IV). Wygrywa treść, której nie da się tu odczytać —
  // „Przywróć” odmawia bez zapisu ('nieczytelny'), a nowsza czytelna kopia zostaje na innych urządzeniach i tam da się
  // ją przywrócić. Treść karty nowsza — zapis treści karty. Dotąd (baza) zapis nieczytelnego szyfru w karcie, a eksport
  // synchronizacji z tego urządzenia przestawał działać — czerwony (pierwszy i trzeci test).
  async function koszNieczytelny(d) {
    const meta = await d.P.__px.getUserMeta(d.P.__uid);
    const rek = (await d.P.__px.listSnapshotsForUser(d.P.__uid, d.pid)).find((s) => s.snapshotId === d.s1) ||
      (await d.P.__px.listSnapshotsForUser(d.P.__uid, d.pid))[0];
    await d.P.__px.putUserMeta(d.P.__uid, { ...meta, snapshotTombstones: meta.snapshotTombstones.map((x) => (x.snapshotId === d.sid
      ? { ...x, payloadCipher: { ...x.payloadCipher, iv: rek.payloadCipher.iv } } : x)) });
    expect((await wKoszu(d.P, d.sid)).payload, 'kontrola: treść wpisu kosza na P nieczytelna').toBeNull();
  }
  it('N-kosz-nieczytelny: P (karta 78, ostatnia wersja) dostaje kosz K z późniejszą poprawką 74, treść wpisu kosza na P nieczytelna → odmowa bez zapisu; „Przywróć” na K → na trzech karta 74', async () => {
    sztucznyZegar();
    const d = await jan2();
    przesunZegar(M); await d.P.moveSnapshotToTrash(d.pid, d.s1);
    przesunZegar(M); await popraw(d.P, d.pid, d.sid, 78);
    przesunZegar(M); await popraw(d.K, d.pid, d.sid, 74);
    przesunZegar(M); await d.K.moveSnapshotToTrash(d.pid, d.sid);
    await sync(d.K, d.P);
    await koszNieczytelny(d);
    const przed = { karta: opis(await wersja(d.P, d.pid, d.sid)), lista: JSON.stringify(await lista(d.P)) };
    expect(przed.karta, 'kontrola: P — karta 78').toEqual({ masa: 78, pin: false, rev: 1 });
    przesunZegar(M);
    let w;
    try { w = await d.P.restoreTrashedSnapshot(d.pid, d.sid); } catch (er) { w = { kod: er.code, msg: er.message }; }
    expect({ w, karta: opis(await wersja(d.P, d.pid, d.sid)), lista: JSON.stringify(await lista(d.P)) }, 'odmowa na P, bez zapisu')
      .toEqual({ w: { kod: 'nieczytelny', msg: 'Treści tego zapisu w koszu nie da się odczytać na tym urządzeniu.' }, ...przed });
    przesunZegar(M);
    expect((await d.K.restoreTrashedSnapshot(d.pid, d.sid)).alreadyInCard, '„Przywróć” na K: zapis').toBeUndefined();
    przesunZegar(M);
    await rundy(d.urz, 3);
    expect(await widoki({ P: d.P, K: d.K, C: d.C }, d.sid)).toEqual({ P: 'karta 74', K: 'karta 74', C: 'karta 74' });
  });
  it('N-kosz-nieczytelny, treść karty nowsza: K daje s2 do kosza (zegar +10 min), P poprawia s2 na 78 po kosz; treść wpisu kosza na P nieczytelna → zapis treści karty 78 z rev 2; na trzech karta 78', async () => {
    sztucznyZegar();
    const d = await jan2();
    przesunZegar(M); await d.P.moveSnapshotToTrash(d.pid, d.s1);
    przesunZegar(M); await naZegarze(10 * M, () => d.K.moveSnapshotToTrash(d.pid, d.sid));
    await sync(d.K, d.P);
    przesunZegar(M); await popraw(d.P, d.pid, d.sid, 78);
    await koszNieczytelny(d);
    przesunZegar(M);
    const w = await d.P.restoreTrashedSnapshot(d.pid, d.sid);
    expect({ juz: w.alreadyInCard === true, karta: opis(await wersja(d.P, d.pid, d.sid)), kosz: !!(await wKoszu(d.P, d.sid)) }, 'tuż po „Przywróć” na P')
      .toEqual({ juz: false, karta: { masa: 78, pin: false, rev: 2 }, kosz: false });
    przesunZegar(M);
    await rundy(d.urz, 3);
    expect(await widoki({ P: d.P, K: d.K, C: d.C }, d.sid)).toEqual({ P: 'karta 78', K: 'karta 78', C: 'karta 78' });
  });
  it('N-kosz-nieczytelny, wizyta tylko w koszu: K daje s2 do kosza, P dostaje kosz, treść wpisu nieczytelna na P → odmowa bez zapisu (dotąd nieczytelny szyfr w karcie P)', async () => {
    sztucznyZegar();
    const d = await jan2();
    przesunZegar(M); await d.K.moveSnapshotToTrash(d.pid, d.sid);
    await sync(d.K, d.P);
    await koszNieczytelny(d);
    przesunZegar(M);
    let w;
    try { w = await d.P.restoreTrashedSnapshot(d.pid, d.sid); } catch (er) { w = { kod: er.code }; }
    expect({ w, wKarcie: await wersja(d.P, d.pid, d.sid), wKoszu: !!(await wKoszu(d.P, d.sid)) })
      .toEqual({ w: { kod: 'nieczytelny' }, wKarcie: null, wKoszu: true });
  });
});
