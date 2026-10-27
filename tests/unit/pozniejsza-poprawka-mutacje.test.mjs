import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-POZNIEJSZA-POPRAWKA / P-REV-MAX: testy zachowania dla elementów, które wcześniej pilnował tylko strażnik źródła
// (przegląd końcowy D-7) — zmiana jednego z nich przechodziła przez wszystkie testy zachowania i zatrzymywał ją dopiero
// toContain na vilda_vault.js. Elementy: warunek „Przywróć” (Bkz_nowszaWersja wersji w karcie i treści kosza), stempel
// Bpp_chwilaZmiany w lastSavedAtISO karty, w rekordzie dla nagłówka, przy „Przywróć” i przy imporcie z kosza, ścisła
// nierówność stempla, rev = wyższa z pary w koszu (łączenie nagrobków Bkz_dolacz, Bkz_pomin, Bkz_scalKoniec, pętla
// Bkz_nowsze) i podniesienie rev wersji odrzuconej razem z przebudową nagłówka (D-3 A).
// P-REV-MAX: rev wersji i nagrobka po scaleniu jest taka, jaką policzyłaby flota samych starszych aplikacji („najpierw
// rev”); treść wybiera reguła D-7 (późniejsza chwila zmiany). Oczekiwane rev porównano poza repozytorium z tym samym
// scenariuszem na sejfie sprzed D-7 (54a84da3) — repozytorium starszego sejfu nie ładuje. F1 (przegląd końcowy): przy
// łączeniu dwóch nagrobków nagrobek retencji i nagrobek nieaktualny (zna usunięcie sprzed późniejszej zmiany z drugiego)
// nie podnoszą rev treści kosza (Bkz_revPary) — ich rev opisuje wersję, której treści kosz nie trzyma; starsza aplikacja
// bierze wtedy rev źródła treści. Remis chwil zapisu dwóch wersji (F, H) powstaje bez ingerencji w magazyn: dwa
// urządzenia zapisują wizytę w tej samej milisekundzie. Prawdziwy vilda_vault.js, sejfy w pamięci, sztuczny zegar,
// dane fikcyjne.

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}
let licznik = 0;
const hasla = new WeakMap();
const bazy = new WeakMap();
async function urzadzenie() {
  licznik += 1;
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_retention.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  const baza = v.createInMemoryAdapter();
  v.setStorageAdapter(baza);
  const haslo = `Mutacje#D7!2026${licznik}aa`;
  await v.createUser(haslo, { label: `dev${licznik}`, iterations: 10000 });
  const [u] = await v.listUsers();
  hasla.set(v, haslo);
  bazy.set(v, { baza, uid: u.userId });
  return v;
}
let zegar = Date.parse('2026-10-21T09:00:00Z');
let przesuniecie = 0; // rozjazd zegara bieżącego urządzenia (ms)
function ustaw() { vi.setSystemTime(zegar + przesuniecie); }
function przesunZegar(ms) { zegar += ms; ustaw(); }
async function zZegarem(ms, fn) { przesuniecie = ms; ustaw(); try { return await fn(); } finally { przesuniecie = 0; ustaw(); } }
function sztucznyZegar() { vi.useFakeTimers({ toFake: ['Date'] }); ustaw(); }
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); przesuniecie = 0; });
const DZIEN = 864e5;

const jan = (height, weight, imie = 'Jan') => ({
  name: `Testowy ${imie}`,
  user: { lastName: 'Testowy', firstName: imie, dobISO: '2016-03-12', sex: 'M', height, weight },
});
async function zapisz(v, p, opcje = {}) { przesunZegar(60e3); return v.savePatient(p, { dedup: false, ...opcje }); }
const wersja = async (v, pid, sid) => ((await v.getPatient(pid)) || { snapshots: [] }).snapshots.find((s) => s.snapshotId === sid) || null;
const wKoszu = async (v, sid) => (await v.listTrashedSnapshots()).find((k) => k.snapshotId === sid) || null;
// Nagrobek zapisu sid z ładunku synchronizacji: masa z treści kosza (null bez treści) i rev.
const nagrobek = async (v, sid) => {
  const e = ((await v.exportSyncPayload()).snapshotTombstones || []).find((x) => x.snapshotId === sid);
  return e ? { masa: e.payload ? e.payload.user.weight : null, rev: e.rev } : null;
};
async function popraw(v, pid, sid, zmiana, opcje = { preserveSavedAt: true }) {
  przesunZegar(60e3);
  const w = await wersja(v, pid, sid);
  await v.updateSnapshotPayload(pid, sid, { ...w.payload, user: { ...w.payload.user, ...zmiana } }, opcje);
  return wersja(v, pid, sid);
}
const kopia = (x) => JSON.parse(JSON.stringify(x));
async function sync(z, na) { return na.mergeSyncPayload(kopia(await z.exportSyncPayload())); }
async function naraz(P, K) { const lp = kopia(await P.exportSyncPayload()), lk = kopia(await K.exportSyncPayload()); await P.mergeSyncPayload(lk); await K.mergeSyncPayload(lp); }
// K: Jan, trzy wizyty (druga 125 cm / 24 kg); P dostaje komplet.
async function dwaUrzadzenia() {
  const P = await urzadzenie(), K = await urzadzenie();
  const a = await zapisz(K, jan(120, 22));
  const s2 = await zapisz(K, jan(125, 24), { patientId: a.patientId });
  const s3 = await zapisz(K, jan(130, 26), { patientId: a.patientId });
  await sync(K, P);
  return { P, K, pid: a.patientId, sid: s2.snapshotId, s1: a.snapshotId, s3: s3.snapshotId };
}
// Remis chwil zapisu dwóch wersji jednej karty bez ingerencji w magazyn: K i P (obie znają kartę) zapisują nową wizytę
// w tej samej milisekundzie — K „Testowy Jan” (a), P „Testowy Janek” (b); N dostaje obie. Kolejność a i b rozstrzyga
// wtedy dopiero chwila zmiany, rev, numer kolejny i snapshotId.
async function dwieWizytyNaRaz() {
  const P = await urzadzenie(), K = await urzadzenie(), N = await urzadzenie();
  const a0 = await zapisz(K, jan(120, 22));
  const pid = a0.patientId;
  await sync(K, P); await sync(K, N);
  przesunZegar(60e3);
  const a = await K.savePatient(jan(125, 24), { dedup: false, patientId: pid });
  const b = await P.savePatient(jan(130, 26, 'Janek'), { dedup: false, patientId: pid });
  return { P, K, N, pid, a: a.snapshotId, b: b.snapshotId };
}

describe('P-POZNIEJSZA-POPRAWKA: „Przywróć”, import z kosza i stempel chwili zmiany', () => {
  it('A „Przywróć” — w karcie późniejsza poprawka z niższą rev (40, rev 1), w koszu wcześniejsza treść z wyższą rev (31, rev 2), usunięcie po obu: zapis przywrócenia z nowszą treścią z karty (40, rev 3, chwila po usunięciu), wpis kosza znika, K przyjmuje go po synchronizacji (P-PRZYWROC-Z-KARTY, PRZ0; dotąd „już w karcie” bez zapisu — usunięcie K znów wygrywało)', async () => {
    sztucznyZegar();
    const { P, K, pid, sid, s1, s3 } = await dwaUrzadzenia();
    przesunZegar(60e3);
    await P.moveSnapshotToTrash(pid, s1); przesunZegar(60e3); await P.moveSnapshotToTrash(pid, s3); // na P sid ostatnią wersją karty
    await popraw(K, pid, sid, { weight: 30 }); await popraw(K, pid, sid, { weight: 31 }); // K: rev 2, wcześniej
    await popraw(P, pid, sid, { weight: 40 }); // P: rev 1, później, K o niej nie wie
    przesunZegar(60e3); await K.moveSnapshotToTrash(pid, sid);
    await sync(K, P);
    const przed = await wersja(P, pid, sid), k = await wKoszu(P, sid);
    expect({ karta: przed && przed.payload.user.weight, rev: przed && przed.rev, kosz: k && k.payload.user.weight }, 'kontrola: na P w karcie i w koszu')
      .toEqual({ karta: 40, rev: 1, kosz: 31 });
    przesunZegar(60e3);
    // Starsza aplikacja („najpierw rev”: 1 < 2) zapisałaby tu treść kosza 31 z rev 3 — to akcja, nie scalenie; treść
    // i to, czy „Przywróć” zapisuje, wybiera reguła D-7.
    const usunieto = ((await K.exportSyncPayload()).snapshotTombstones || []).find((x) => x.snapshotId === sid).deletedAtISO;
    const wynik = await P.restoreTrashedSnapshot(pid, sid);
    const po = await wersja(P, pid, sid);
    expect({ juz: wynik.alreadyInCard === true, masa: po.payload.user.weight, rev: po.rev, kosz: await wKoszu(P, sid) })
      .toEqual({ juz: false, masa: 40, rev: 3, kosz: null });
    expect(po.updatedAtISO > usunieto, 'chwila przywrócenia później niż usunięcie K').toBe(true);
    await sync(P, K);
    const naK = await wersja(K, pid, sid);
    expect({ masa: naK && naK.payload.user.weight, rev: naK && naK.rev, kosz: await wKoszu(K, sid) }, 'K po synchronizacji')
      .toEqual({ masa: 40, rev: 3, kosz: null });
  });

  it('B poprawka — lastSavedAtISO karty ze stempla: K (+10 min) poprawia, P (dobry zegar) poprawia po niej; chwila zapisu karty na P nie wcześniejsza niż poprawka, a usunięcie pacjenta na C w chwili poprawki K przegrywa z kartą', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    const C = await urzadzenie(); await sync(K, C);
    const zK = await zZegarem(10 * 60e3, () => popraw(K, pid, sid, { weight: 30 }));
    await sync(K, P);
    const zP = await popraw(P, pid, sid, { weight: 40 });
    expect(zP.updatedAtISO > zK.updatedAtISO, 'kontrola: stempel poprawki P').toBe(true);
    expect((await P.getPatient(pid)).lastSavedAtISO >= zP.updatedAtISO, 'lastSavedAtISO >= chwila poprawki').toBe(true);
    vi.setSystemTime(Date.parse(zK.updatedAtISO)); await C.removePatient(pid); ustaw();
    await sync(C, P); await sync(P, C);
    for (const [n, v] of [['P', P], ['C', C]]) expect((await wersja(v, pid, sid) || { payload: { user: {} } }).payload.user.weight, n).toBe(40);
  });

  it('C „Przywróć” — nagłówek karty ze stempla: kosz na K (+10 min), „Przywróć” na P (dobry zegar): chwila zapisu karty na P nie wcześniejsza niż przywrócenie', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    przesunZegar(60e3);
    await zZegarem(10 * 60e3, () => K.moveSnapshotToTrash(pid, sid));
    await sync(K, P);
    przesunZegar(60e3);
    await P.restoreTrashedSnapshot(pid, sid);
    const w = await wersja(P, pid, sid);
    expect((await P.getPatient(pid)).lastSavedAtISO >= w.updatedAtISO).toBe(true);
  });

  it('D import z kosza — stempel zna wersję z pliku: wersja z poprawką z zegara +10 min w pliku karty, zapis w koszu na N; import daje chwilę zmiany późniejszą niż wersja z pliku, a późniejsza poprawka N wygrywa z K', async () => {
    sztucznyZegar();
    const { P: N, K, pid, sid } = await dwaUrzadzenia();
    const P = await urzadzenie(); await sync(K, P);
    przesunZegar(60e3);
    await N.moveSnapshotToTrash(pid, sid); // N nie zna poprawki K
    const zK = await zZegarem(10 * 60e3, () => popraw(K, pid, sid, { weight: 30 }));
    await sync(K, P);
    const plik = await P.exportPatientEnvelope(pid);
    przesunZegar(60e3);
    await N.importPatientFromEnvelope(plik, hasla.get(P));
    const po = await wersja(N, pid, sid);
    expect(po && po.payload.user.weight, 'kontrola: import przywraca wersję z pliku').toBe(30);
    expect(po.updatedAtISO > zK.updatedAtISO, 'chwila zmiany po imporcie późniejsza niż wersja z pliku').toBe(true);
    await popraw(N, pid, sid, { weight: 50 });
    await naraz(N, K); await naraz(N, K);
    for (const [n, v] of [['N', N], ['K', K]]) expect((await wersja(v, pid, sid)).payload.user.weight, n).toBe(50);
  });

  it('G stempel ściśle późniejszy: „Przywróć” w tej samej milisekundzie co usunięcie z zegara do przodu daje chwilę późniejszą niż usunięcie, zapis zostaje w karcie na P i K', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    przesunZegar(60e3);
    await zZegarem(10 * 60e3, () => K.moveSnapshotToTrash(pid, sid));
    await sync(K, P);
    const usuniecie = (await K.exportSyncPayload()).snapshotTombstones.find((e) => e.snapshotId === sid).deletedAtISO;
    vi.setSystemTime(Date.parse(usuniecie)); // zegar P dokładnie w chwili usunięcia
    await P.restoreTrashedSnapshot(pid, sid);
    const w = await wersja(P, pid, sid);
    expect(w.updatedAtISO > usuniecie, 'chwila przywrócenia > usunięcie').toBe(true);
    ustaw();
    await sync(K, P); await sync(P, K);
    for (const [n, v] of [['P', P], ['K', K]]) expect(await wersja(v, pid, sid), n).not.toBeNull();
  });

  it('I „Przywróć” — stempel zna treść kosza: wpis kosza starszej aplikacji (usunięcie wcześniejsze niż treść z zegara +10 min); „Przywróć” daje chwilę późniejszą niż treść kosza, a późniejsza poprawka P wygrywa z K', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    const zK = await zZegarem(10 * 60e3, () => popraw(K, pid, sid, { weight: 30 }));
    await sync(K, P);
    przesunZegar(60e3);
    await P.moveSnapshotToTrash(pid, sid);
    const { baza, uid } = bazy.get(P);
    const meta = await baza.getUserMeta(uid);
    const teraz = new Date().toISOString(); // starsza aplikacja: deletedAtISO = teraz, wcześniej niż treść
    await baza.putUserMeta(uid, { ...meta, snapshotTombstones: meta.snapshotTombstones.map((e) => (e.snapshotId === sid ? { ...e, deletedAtISO: teraz } : e)) });
    expect((await wKoszu(P, sid)).payload.user.weight, 'kontrola: w koszu treść K').toBe(30);
    przesunZegar(60e3);
    await P.restoreTrashedSnapshot(pid, sid);
    const w = await wersja(P, pid, sid);
    expect(w.updatedAtISO > zK.updatedAtISO, 'chwila przywrócenia > chwila treści kosza').toBe(true);
    await popraw(P, pid, sid, { weight: 50 });
    await naraz(P, K); await naraz(P, K);
    for (const [n, v] of [['P', P], ['K', K]]) expect((await wersja(v, pid, sid)).payload.user.weight, n).toBe(50);
  });
});

describe('P-REV-MAX w koszu: treść późniejszej poprawki, rev wyższa z pary (jak we flocie starszych aplikacji)', () => {
  it('E1 łączenie dwóch ważnych nagrobków (Bkz_dolacz): P dwie poprawki (78, rev 2), K później jedna (74, rev 1), potem kosz na P (nie zna poprawki K) i kosz na K; wymiana naraz: nagrobek 74 z rev 2 na obu', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    await popraw(P, pid, sid, { weight: 77 }); await popraw(P, pid, sid, { weight: 78 });
    await popraw(K, pid, sid, { weight: 74 });
    przesunZegar(60e3); await P.moveSnapshotToTrash(pid, sid); // usunięcie po poprawce K: nagrobek P ważny
    przesunZegar(60e3); await K.moveSnapshotToTrash(pid, sid);
    await naraz(P, K);
    for (const [n, v] of [['P', P], ['K', K]]) expect(await nagrobek(v, sid), n).toEqual({ masa: 74, rev: 2 });
  });

  it('E1b (F1) łączenie z nagrobkiem nieaktualnym (Bkz_revPary): kosz na P po dwóch poprawkach (78, rev 2), K później poprawia (74, rev 1) i daje do kosza; wymiana naraz: nagrobek 74 z rev 1 na obu — nagrobek P zna usunięcie sprzed poprawki K i rev nie podnosi', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    await popraw(P, pid, sid, { weight: 77 }); await popraw(P, pid, sid, { weight: 78 });
    przesunZegar(60e3); await P.moveSnapshotToTrash(pid, sid);
    await popraw(K, pid, sid, { weight: 74 }); // po usunięciu na P: nagrobek P nieaktualny wobec nagrobka K
    przesunZegar(60e3); await K.moveSnapshotToTrash(pid, sid);
    await naraz(P, K);
    for (const [n, v] of [['P', P], ['K', K]]) expect(await nagrobek(v, sid), n).toEqual({ masa: 74, rev: 1 });
  });

  it('F1 łączenie z nagrobkiem retencji (Bkz_revPary): kosz z treścią rev 0 na K + przycięcie po dwóch poprawkach (rev 2) na P, przycięcie przed koszem: wpis kosza z treścią K i rev 0 na K i P, bez chwili przycięcia', async () => {
    sztucznyZegar();
    const P = await urzadzenie(), K = await urzadzenie();
    let pid = null; const ids = [];
    for (let i = 0; i < 6; i += 1) {
      przesunZegar(i === 4 ? 60e3 : DZIEN); // wizyty co dzień; ids[3] i ids[4] tego samego dnia
      const r = await K.savePatient(jan(100 + i, 20 + i), { dedup: false, ...(pid ? { patientId: pid } : {}) });
      pid = r.patientId; ids.push(r.snapshotId);
    }
    const sid = ids[3];
    await sync(K, P);
    await popraw(P, pid, sid, { weight: 30 }); await popraw(P, pid, sid, { weight: 31 }); // P: rev 2
    przesunZegar(60e3);
    expect((await P.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds, 'kontrola: P przycina tylko sid').toEqual([sid]);
    przesunZegar(60e3); await K.moveSnapshotToTrash(pid, sid); // K: treść 23 kg z rev 0, później niż przycięcie
    przesunZegar(1e3); await sync(P, K);
    przesunZegar(1e3); await sync(K, P);
    for (const [n, v] of [['K', K], ['P', P]]) {
      const e = ((await v.exportSyncPayload()).snapshotTombstones || []).find((x) => x.snapshotId === sid);
      expect({ masa: e.payload ? e.payload.user.weight : null, rev: e.rev, powod: e.powod || null, przycieto: e.przycietoISO || null }, n)
        .toEqual({ masa: 23, rev: 0, powod: null, przycieto: null });
    }
  });

  it('E2 Bkz_pomin i Bkz_scalKoniec: kosz na K po późniejszej poprawce (74, rev 1), P ma w karcie dwie wcześniejsze (78, rev 2); wymiana naraz: nagrobek 74 z rev 2 na obu po jednym scaleniu', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    await popraw(P, pid, sid, { weight: 77 }); await popraw(P, pid, sid, { weight: 78 });
    await popraw(K, pid, sid, { weight: 74 });
    przesunZegar(60e3); await K.moveSnapshotToTrash(pid, sid);
    await naraz(P, K);
    for (const [n, v] of [['P', P], ['K', K]]) expect(await nagrobek(v, sid), n).toEqual({ masa: 74, rev: 2 });
  });

  it('E3 Bkz_scalKoniec (wersja lokalna nowsza niż treść kosza): K poprawia (74, rev 1), potem P bez wiedzy o niej daje do kosza po dwóch wcześniejszych (78, rev 2); wymiana naraz: nagrobek 74 z rev 2 na obu po jednym scaleniu', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    await popraw(P, pid, sid, { weight: 77 }); await popraw(P, pid, sid, { weight: 78 });
    await popraw(K, pid, sid, { weight: 74 });
    przesunZegar(60e3); await P.moveSnapshotToTrash(pid, sid);
    await naraz(P, K);
    for (const [n, v] of [['P', P], ['K', K]]) expect(await nagrobek(v, sid), n).toEqual({ masa: 74, rev: 2 });
  });

  it('E4 pętla Bkz_nowsze (podniesienie rev nagrobka): P trzy poprawki (79, rev 3), sid ostatnią wersją karty; R później poprawia (74, rev 1); K daje do kosza; R ← P: nagrobek 74 z rev 3 (wyższa z trzech)', async () => {
    sztucznyZegar();
    const { P, K, pid, sid, s1, s3 } = await dwaUrzadzenia();
    const R = await urzadzenie(); await sync(K, R);
    await popraw(P, pid, sid, { weight: 77 }); await popraw(P, pid, sid, { weight: 78 }); await popraw(P, pid, sid, { weight: 79 });
    przesunZegar(60e3); await P.moveSnapshotToTrash(pid, s1); przesunZegar(60e3); await P.moveSnapshotToTrash(pid, s3);
    await popraw(R, pid, sid, { weight: 74 });
    await zapisz(R, jan(135, 28), { patientId: pid }); // R: czwarta wizyta, karta nie zostanie pusta
    przesunZegar(60e3); await K.moveSnapshotToTrash(pid, sid);
    await sync(K, P);
    const naP = await wersja(P, pid, sid), kP = await wKoszu(P, sid);
    expect({ karta: naP && naP.payload.user.weight, kosz: kP && kP.payload.user.weight }, 'kontrola: na P w karcie i w koszu').toEqual({ karta: 79, kosz: 24 });
    await sync(P, R);
    expect(await nagrobek(R, sid)).toEqual({ masa: 74, rev: 3 });
  });

  it('E5 pętla Bkz_nowsze (rev treści przejętej z wersji): K sid ostatnią wersją karty, późniejsza poprawka (74, rev 1); P daje do kosza po dwóch wcześniejszych (78, rev 2); K ← P (w karcie i w koszu), C ← K: nagrobek 74 z rev 2 na C', async () => {
    sztucznyZegar();
    const { P, K, pid, sid, s1, s3 } = await dwaUrzadzenia();
    const C = await urzadzenie(); await sync(K, C);
    przesunZegar(60e3); await K.moveSnapshotToTrash(pid, s1); przesunZegar(60e3); await K.moveSnapshotToTrash(pid, s3);
    await popraw(P, pid, sid, { weight: 77 }); await popraw(P, pid, sid, { weight: 78 });
    await popraw(K, pid, sid, { weight: 74 });
    przesunZegar(60e3); await P.moveSnapshotToTrash(pid, sid);
    await zapisz(C, jan(135, 28), { patientId: pid }); // C: czwarta wizyta, karta nie zostanie pusta
    await sync(P, K);
    const naK = await wersja(K, pid, sid), kK = await wKoszu(K, sid);
    expect({ karta: naK && naK.payload.user.weight, kosz: kK && kK.payload.user.weight }, 'kontrola: na K w karcie i w koszu').toEqual({ karta: 74, kosz: 78 });
    await sync(K, C);
    expect(await nagrobek(C, sid)).toEqual({ masa: 74, rev: 2 });
  });
});

describe('P-NAGLOWEK-NAJNOWSZEJ przy remisie chwil zapisu: nagłówek z wersji, która po zapisie jest najnowsza', () => {
  it('F podniesienie rev wersji odrzuconej (D-3 A): z ładunku ta sama wersja z rev 3, wcześniejszą chwilą i inną treścią; treść zostaje, rev 3, wersja wychodzi na czoło karty i nagłówek idzie za nią', async () => {
    sztucznyZegar();
    const { P, K, pid, a, b } = await dwieWizytyNaRaz();
    await sync(K, P);
    const przed = await P.getPatient(pid);
    const [glowa, druga] = przed.snapshots;
    expect({ remis: glowa.savedAtISO === druga.savedAtISO && glowa.updatedAtISO === druga.updatedAtISO, para: [glowa.snapshotId, druga.snapshotId].sort(), naglowek: przed.header.name },
      'kontrola: dwie wizyty z tą samą chwilą zapisu i zmiany, nagłówek z czoła karty')
      .toEqual({ remis: true, para: [a, b].sort(), naglowek: glowa.payload.name });
    // Ładunek jak od starszej aplikacji: ta sama wersja z rev 3, bez chwili zmiany, z wcześniejszą chwilą zapisu.
    const lad = kopia(await P.exportSyncPayload());
    delete lad.credential;
    const S = lad.patients.find((p) => p.patientId === pid).snapshots.find((s) => s.snapshotId === druga.snapshotId);
    S.rev = 3; delete S.updatedAtISO; S.savedAtISO = new Date(Date.parse(druga.savedAtISO) - 60e3).toISOString();
    S.payload = { ...S.payload, name: 'Testowa Ola', user: { ...S.payload.user, firstName: 'Ola', lastName: 'Testowa' } };
    przesunZegar(60e3);
    await P.mergeSyncPayload(lad);
    const karta = await P.getPatient(pid);
    expect({ glowa: karta.snapshots[0].snapshotId, rev: karta.snapshots[0].rev, tresc: karta.snapshots[0].payload.name, naglowek: karta.header.name })
      .toEqual({ glowa: druga.snapshotId, rev: 3, tresc: druga.payload.name, naglowek: druga.payload.name });
  });

  it('H poprawka — rekord dla nagłówka ze stempla: K (+20 min) poprawia a, P (+15 min) poprawia b, N (dobry zegar) poprawia a po obu: a na czele karty N i nagłówek z a, nie z b', async () => {
    sztucznyZegar();
    const { P, K, N, pid, a, b } = await dwieWizytyNaRaz();
    await zZegarem(20 * 60e3, () => popraw(K, pid, a, { weight: 25 }));
    await zZegarem(15 * 60e3, () => popraw(P, pid, b, { weight: 27 }));
    await sync(K, N); await sync(P, N);
    const przed = await N.getPatient(pid);
    expect({ glowa: przed.snapshots[0].snapshotId, remis: przed.snapshots[0].savedAtISO === przed.snapshots[1].savedAtISO }, 'kontrola: na N remis chwil zapisu, na czele a (późniejsza zmiana)')
      .toEqual({ glowa: a, remis: true });
    await popraw(N, pid, a, { weight: 26 }); // zegar N za chwilami K i P
    const karta = await N.getPatient(pid);
    expect({ glowa: karta.snapshots[0].snapshotId, naglowek: karta.header.name }).toEqual({ glowa: a, naglowek: 'Testowy Jan' });
  });
});
