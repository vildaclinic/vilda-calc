import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-POZNIEJSZA-POPRAWKA (decyzja właściciela D-7 wariant 2 z poddecyzjami PD-1..PD-17, 2026-10-21): konflikt poprawki
// tej samej wersji wizyty (ten sam snapshotId, inna treść na dwóch urządzeniach) — wygrywa późniejsza poprawka
// (chwila zmiany updatedAtISO, a bez niej savedAtISO; przy równej wyższa rev). Dotąd: najpierw rev, więc dwie
// wcześniejsze poprawki biły jedną późniejszą. Chwila zmiany poprawki jest zawsze późniejsza niż poprawiana wersja
// (stempel Bpp_chwilaZmiany), więc poprawka zrobiona po kolei wygrywa także przy rozjeździe zegarów. Prawdziwy
// vilda_vault.js, sejfy w pamięci, sztuczny zegar, dane fikcyjne. Przypadki kosza: kosz-nowsza-tresc.test.mjs; pętla
// scaleń: sync-wlasciciel-wersji.test.mjs.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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
  v.setStorageAdapter(v.createInMemoryAdapter());
  const haslo = `Pozniejsza#D7!2026${licznik}aa`;
  await v.createUser(haslo, { label: `dev${licznik}`, iterations: 10000 });
  hasla.set(v, haslo);
  return v;
}
let zegar = Date.parse('2026-10-21T09:00:00Z');
let przesuniecie = 0; // rozjazd zegara bieżącego urządzenia (ms)
function ustaw() { vi.setSystemTime(zegar + przesuniecie); }
function przesunZegar(ms) { zegar += ms; ustaw(); }
async function zZegarem(ms, fn) { przesuniecie = ms; ustaw(); try { return await fn(); } finally { przesuniecie = 0; ustaw(); } }
function sztucznyZegar() { vi.useFakeTimers({ toFake: ['Date'] }); ustaw(); }
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); przesuniecie = 0; });

const jan = (height, weight) => ({
  name: 'Testowy Jan',
  user: { lastName: 'Testowy', firstName: 'Jan', dobISO: '2016-03-12', sex: 'M', height, weight },
});
async function zapisz(v, p, opcje = {}) { przesunZegar(60e3); return v.savePatient(p, { dedup: false, ...opcje }); }
const wersja = async (v, pid, sid) => ((await v.getPatient(pid)) || { snapshots: [] }).snapshots.find((s) => s.snapshotId === sid) || null;
const wKoszu = async (v, sid) => (await v.listTrashedSnapshots()).find((k) => k.snapshotId === sid) || null;
const tresc = (s) => (s ? `${s.payload.user.height}/${s.payload.user.weight}` : null);
async function popraw(v, pid, sid, zmiana, opcje = { preserveSavedAt: true }) {
  przesunZegar(60e3);
  const w = await wersja(v, pid, sid);
  await v.updateSnapshotPayload(pid, sid, { ...w.payload, user: { ...w.payload.user, ...zmiana } }, opcje);
  return wersja(v, pid, sid);
}
const kopia = (x) => JSON.parse(JSON.stringify(x));
async function sync(z, na) { return na.mergeSyncPayload(kopia(await z.exportSyncPayload())); }
async function wymiana(P, K, kolejnosc) {
  if (kolejnosc === 'P-pierwszy') { await sync(K, P); await sync(P, K); }
  else if (kolejnosc === 'K-pierwszy') { await sync(P, K); await sync(K, P); }
  else { const lp = kopia(await P.exportSyncPayload()), lk = kopia(await K.exportSyncPayload()); await P.mergeSyncPayload(lk); await K.mergeSyncPayload(lp); }
}
// K: Jan, trzy wizyty (druga 125 cm / 24 kg); P dostaje komplet.
async function dwaUrzadzenia() {
  const P = await urzadzenie(), K = await urzadzenie();
  const a = await zapisz(K, jan(120, 22));
  const s2 = await zapisz(K, jan(125, 24), { patientId: a.patientId });
  const s3 = await zapisz(K, jan(130, 26), { patientId: a.patientId });
  await sync(K, P);
  return { P, K, pid: a.patientId, sid: s2.snapshotId, glowa: s3.snapshotId };
}
const KOL = ['P-pierwszy', 'K-pierwszy', 'naraz'];

describe('P-POZNIEJSZA-POPRAWKA: wersja tej samej karty — wygrywa późniejsza poprawka', () => {
  for (const kol of KOL) {
    it(`T1 dwie poprawki na K (rev 2), jedna późniejsza na P (rev 1), ${kol}: na obu poprawka P, rev 2 (wyższa z dwóch, P-REV-MAX)`, async () => {
      sztucznyZegar();
      const { P, K, pid, sid } = await dwaUrzadzenia();
      await popraw(K, pid, sid, { weight: 30 });
      expect((await popraw(K, pid, sid, { weight: 31 })).rev, 'kontrola: K ma rev 2').toBe(2);
      expect((await popraw(P, pid, sid, { weight: 40 })).rev, 'kontrola: P ma rev 1').toBe(1);
      await wymiana(P, K, kol);
      await wymiana(P, K, 'naraz');
      for (const [nazwa, v] of [['P', P], ['K', K]]) {
        const w = await wersja(v, pid, sid);
        expect({ masa: w.payload.user.weight, rev: w.rev }, `${nazwa}: późniejsza poprawka, rev wyższa z dwóch`).toEqual({ masa: 40, rev: 2 });
      }
    });
  }

  it('T1b A: dwie poprawki masy (27 kg, rev 2); B później jedna poprawka wzrostu (127 cm, rev 1): 127/24 i rev 2 na obu po jednej wymianie — poprawki A giną (LWW całej wersji)', async () => {
    sztucznyZegar();
    const { P: B, K: A, pid, sid } = await dwaUrzadzenia();
    await popraw(A, pid, sid, { weight: 25 });
    await popraw(A, pid, sid, { weight: 27 });
    przesunZegar(3 * 60e3);
    await popraw(B, pid, sid, { height: 127 });
    await wymiana(B, A, 'P-pierwszy');
    for (const [nazwa, v] of [['A', A], ['B', B]]) {
      const w = await wersja(v, pid, sid);
      expect({ tresc: tresc(w), rev: w.rev }, nazwa).toEqual({ tresc: '127/24', rev: 2 });
    }
  });

  for (const kol of KOL) {
    it(`T2 rozjazd zegarów: K (+10 min) poprawia, P dostaje i poprawia po niej dobrym zegarem, ${kol}: na obu poprawka P (stempel)`, async () => {
      sztucznyZegar();
      const { P, K, pid, sid } = await dwaUrzadzenia();
      const naK = await zZegarem(10 * 60e3, () => popraw(K, pid, sid, { weight: 30 }));
      await sync(K, P);
      const naP = await popraw(P, pid, sid, { weight: 40 });
      expect(naP.updatedAtISO > naK.updatedAtISO, 'stempel: poprawka P później niż poprawiana wersja z zegara K').toBe(true);
      expect(Date.parse(naP.updatedAtISO) - Date.parse(naK.updatedAtISO), 'stempel: 1–1000 ms po poprawianej wersji')
        .toBeLessThanOrEqual(1000);
      await wymiana(P, K, kol);
      await wymiana(P, K, 'naraz');
      for (const [nazwa, v] of [['P', P], ['K', K]]) expect((await wersja(v, pid, sid)).payload.user.weight, nazwa).toBe(40);
    });
  }

  it('T3 rozjazd zegarów: K (+10 min) poprawia; P i C po niej równolegle (oba za zegarem K): zbieżnie na trzech, wygrywa wyższy stempel, nie późniejszy zegar', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    const C = await urzadzenie();
    await sync(K, C);
    await zZegarem(10 * 60e3, () => popraw(K, pid, sid, { weight: 30 }));
    await sync(K, P); await sync(K, C);
    const los = vi.spyOn(Math, 'random');
    los.mockReturnValue(0.9);
    const naP = await popraw(P, pid, sid, { weight: 40 }); // P wcześniej według zegara, ale z wyższym stemplem
    los.mockReturnValue(0.1);
    const naC = await popraw(C, pid, sid, { weight: 50 });
    los.mockRestore();
    expect(naP.updatedAtISO > naC.updatedAtISO, 'kontrola: losowy składnik rozdziela dwa stemple').toBe(true);
    for (let i = 0; i < 2; i += 1) { await sync(P, C); await sync(C, P); await sync(P, K); await sync(K, P); await sync(C, K); await sync(K, C); }
    for (const [nazwa, v] of [['P', P], ['C', C], ['K', K]]) expect((await wersja(v, pid, sid)).payload.user.weight, nazwa).toBe(40);
  });

  it('T4 wersja z ładunku bez updatedAtISO: odbiorca zapisuje null, nie „teraz” — późniejsza prawdziwa poprawka C zostaje', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    const C = await urzadzenie();
    await sync(K, C);
    await popraw(C, pid, sid, { weight: 50 });
    przesunZegar(5 * 60e3);
    const l = kopia(await K.exportSyncPayload());
    for (const p of l.patients) for (const s of p.snapshots) if (s.snapshotId === sid) { s.rev = 1; s.updatedAtISO = null; }
    await P.mergeSyncPayload(l);
    const surowaP = (await P.exportSyncPayload()).patients[0].snapshots.find((s) => s.snapshotId === sid);
    expect(surowaP.updatedAtISO, 'P: bez wymyślonej chwili').toBeNull();
    for (let i = 0; i < 2; i += 1) { await sync(P, C); await sync(C, P); }
    for (const [nazwa, v] of [['P', P], ['C', C]]) expect((await wersja(v, pid, sid)).payload.user.weight, nazwa).toBe(50);
  });

  for (const kol of KOL) {
    it(`T6 dwie poprawki masy na K (rev 2), później gwiazdka na P (rev 1), ${kol}: 24 kg z gwiazdką na obu (LWW całej wersji, PD-12)`, async () => {
      sztucznyZegar();
      const { P, K, pid, sid } = await dwaUrzadzenia();
      await popraw(K, pid, sid, { weight: 30 });
      await popraw(K, pid, sid, { weight: 31 });
      przesunZegar(60e3);
      await P.setSnapshotPinned(pid, sid, true);
      await wymiana(P, K, kol);
      await wymiana(P, K, 'naraz');
      for (const [nazwa, v] of [['P', P], ['K', K]]) {
        const w = await wersja(v, pid, sid);
        expect({ masa: w.payload.user.weight, pinned: !!w.pinned }, nazwa).toEqual({ masa: 24, pinned: true });
      }
    });
  }

  it('T8 [kontrola] pełny remis (ta sama rev i chwila zmiany, inna treść z ładunku): zostaje tutejsza, bez zapisu (PD-3)', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    const przed = await popraw(K, pid, sid, { weight: 30 });
    await sync(K, P);
    await popraw(P, pid, sid, { weight: 40 });
    const l = kopia(await P.exportSyncPayload());
    for (const p of l.patients) for (const s of p.snapshots) if (s.snapshotId === sid) { s.rev = przed.rev; s.updatedAtISO = przed.updatedAtISO; }
    const wynik = await K.mergeSyncPayload(l);
    expect(wynik.updatedSnapshotCount, 'bez zapisu wersji').toBe(0);
    const po = await wersja(K, pid, sid);
    expect({ masa: po.payload.user.weight, rev: po.rev, updatedAtISO: po.updatedAtISO }).toEqual({ masa: 30, rev: przed.rev, updatedAtISO: przed.updatedAtISO });
  });

  for (const kol of KOL) {
    it(`T10 rozjazd przy edycji bieżącej wizyty (preserveSavedAt: false): K (+10 min) edytuje, P po niej, ${kol}: na obu edycja P`, async () => {
      sztucznyZegar();
      const { P, K, pid, glowa } = await dwaUrzadzenia();
      await zZegarem(10 * 60e3, () => popraw(K, pid, glowa, { weight: 61 }, { preserveSavedAt: false }));
      await sync(K, P);
      const naP = await popraw(P, pid, glowa, { weight: 62 }, { preserveSavedAt: false });
      expect(naP.savedAtISO, 'PD-4c: chwila zapisu = teraz, bez stempla').toBe(new Date().toISOString());
      await wymiana(P, K, kol);
      await wymiana(P, K, 'naraz');
      for (const [nazwa, v] of [['P', P], ['K', K]]) {
        const w = await wersja(v, pid, glowa);
        expect({ masa: w.payload.user.weight, savedAtISO: w.savedAtISO }, nazwa).toEqual({ masa: 62, savedAtISO: naP.savedAtISO });
      }
    });
  }
});

describe('P-POZNIEJSZA-POPRAWKA: „Przywróć”, import z kosza i import pliku', () => {
  async function poprawkiPoKoszu(ile) {
    const P = await urzadzenie(), N = await urzadzenie();
    const a = await zapisz(N, jan(120, 22));
    const s2 = await zapisz(N, jan(125, 24), { patientId: a.patientId });
    await zapisz(N, jan(130, 26), { patientId: a.patientId });
    await sync(N, P);
    const pid = a.patientId, sid = s2.snapshotId;
    const plik = await N.exportPatientEnvelope(pid);
    przesunZegar(60e3);
    await N.moveSnapshotToTrash(pid, sid);
    for (let i = 0; i < ile; i += 1) await popraw(P, pid, sid, { weight: 30 + i }); // P nie wie o koszu
    return { P, N, pid, sid, plik };
  }
  for (const ile of [1, 2]) {
    it(`P${ile} kosz na N, ${ile} ${ile === 1 ? 'poprawka' : 'poprawki'} na P po koszu, „Przywróć” na N: przywrócenie jest najpóźniejszą zmianą (PD-9)`, async () => {
      sztucznyZegar();
      const { P, N, pid, sid } = await poprawkiPoKoszu(ile);
      przesunZegar(60e3);
      await N.restoreTrashedSnapshot(pid, sid);
      for (let r = 0; r < 2; r += 1) await wymiana(P, N, 'P-pierwszy');
      for (const [nazwa, v] of [['P', P], ['N', N]]) expect((await wersja(v, pid, sid)).payload.user.weight, nazwa).toBe(24);
    });
    it(`P3 (${ile}) kosz na N, ${ile} ${ile === 1 ? 'poprawka' : 'poprawki'} na P po koszu, N importuje plik karty sprzed kosza: wraca treść z pliku (PD-9)`, async () => {
      sztucznyZegar();
      const { P, N, pid, sid, plik } = await poprawkiPoKoszu(ile);
      const usuniecie = (await N.exportSyncPayload()).snapshotTombstones.find((e) => e.snapshotId === sid).deletedAtISO;
      przesunZegar(60e3);
      await N.importPatientFromEnvelope(plik, hasla.get(N));
      const poImporcie = await wersja(N, pid, sid);
      expect(poImporcie, 'kontrola: import zdejmuje zapis z kosza').toBeTruthy();
      expect(poImporcie.updatedAtISO > usuniecie, 'chwila zmiany po imporcie późniejsza niż usunięcie').toBe(true);
      for (let r = 0; r < 2; r += 1) await wymiana(P, N, 'P-pierwszy');
      for (const [nazwa, v] of [['P', P], ['N', N]]) expect((await wersja(v, pid, sid)).payload.user.weight, nazwa).toBe(24);
    });
  }

  it('P4 usunięcie na K z zegarem 10 min do przodu, „Przywróć” na P (dobry zegar): zapis zostaje w karcie na P, K i C (stempel > usunięcie)', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    const C = await urzadzenie();
    await sync(K, C);
    przesunZegar(60e3);
    await zZegarem(10 * 60e3, () => K.moveSnapshotToTrash(pid, sid));
    await sync(K, P);
    expect(await wersja(P, pid, sid), 'kontrola: na P zapis w koszu').toBeNull();
    przesunZegar(60e3);
    await P.restoreTrashedSnapshot(pid, sid);
    const przywrocona = await wersja(P, pid, sid);
    const usuniecie = (await K.exportSyncPayload()).snapshotTombstones.find((e) => e.snapshotId === sid).deletedAtISO;
    expect(przywrocona.updatedAtISO > usuniecie, 'chwila przywrócenia późniejsza niż usunięcie z zegara K').toBe(true);
    for (let r = 0; r < 2; r += 1) { await sync(P, K); await sync(K, P); await sync(K, C); await sync(C, K); await sync(P, C); await sync(C, P); }
    for (const [nazwa, v] of [['P', P], ['K', K], ['C', C]]) {
      expect((await wersja(v, pid, sid)) && (await wersja(v, pid, sid)).payload.user.weight, `${nazwa}: w karcie`).toBe(24);
      expect(await wKoszu(v, sid), `${nazwa}: nie w koszu`).toBeNull();
    }
  });

  it('P4b usunięcie na K z zegarem 10 min do przodu, P importuje plik karty sprzed usunięcia: zapis wraca do karty na P, K i C (stempel importu > usunięcie)', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    const C = await urzadzenie();
    await sync(K, C);
    const plik = await P.exportPatientEnvelope(pid);
    przesunZegar(60e3);
    await zZegarem(10 * 60e3, () => K.moveSnapshotToTrash(pid, sid));
    await sync(K, P);
    expect(await wersja(P, pid, sid), 'kontrola: na P zapis w koszu').toBeNull();
    przesunZegar(60e3);
    await P.importPatientFromEnvelope(plik, hasla.get(P));
    expect(await wersja(P, pid, sid), 'kontrola: import przywraca zapis').toBeTruthy();
    for (let r = 0; r < 2; r += 1) { await sync(P, K); await sync(K, P); await sync(K, C); await sync(C, K); await sync(P, C); await sync(C, P); }
    for (const [nazwa, v] of [['P', P], ['K', K], ['C', C]]) {
      expect((await wersja(v, pid, sid)) && (await wersja(v, pid, sid)).payload.user.weight, `${nazwa}: w karcie`).toBe(24);
      expect(await wKoszu(v, sid), `${nazwa}: nie w koszu`).toBeNull();
    }
  });

  // Przegląd D-7: stempel niesie chwilę z przyszłości (zegar K do przodu) na kolejne poprawki, więc usunięcie do kosza
  // i retencja na dobrym zegarze dostają chwilę późniejszą niż usuwana wersja (Bpp_chwilaZmiany) — inaczej przegrywały
  // z nią i wizyta wracała do karty na wszystkich urządzeniach.
  async function zPrzyszloscia() {
    const { P, K, pid, sid } = await dwaUrzadzenia();
    const C = await urzadzenie();
    await sync(K, C);
    await zZegarem(10 * 60e3, () => popraw(K, pid, sid, { weight: 30 }));
    await sync(K, P); await sync(K, C);
    const naP = await popraw(P, pid, sid, { weight: 40 });
    await sync(P, K); await sync(P, C);
    przesunZegar(60e3);
    return { P, K, C, pid, sid, naP };
  }
  const trzyRundy = async (P, K, C) => { for (let r = 0; r < 3; r += 1) { await sync(P, K); await sync(K, P); await sync(K, C); await sync(C, K); await sync(P, C); await sync(C, P); } };
  it('P6 poprawka na wersji z zegara do przodu, potem kosz na dobrym zegarze: zapis w koszu na P, K i C (stempel usunięcia)', async () => {
    sztucznyZegar();
    const { P, K, C, pid, sid, naP } = await zPrzyszloscia();
    const kosz = await P.moveSnapshotToTrash(pid, sid);
    expect(kosz.deletedAtISO > naP.updatedAtISO, 'usunięcie później niż usuwana wersja').toBe(true);
    await trzyRundy(P, K, C);
    for (const [nazwa, v] of [['P', P], ['K', K], ['C', C]]) {
      expect(await wersja(v, pid, sid), `${nazwa}: nie w karcie`).toBeNull();
      expect((await wKoszu(v, sid)).payload.user.weight, `${nazwa}: w koszu poprawka`).toBe(40);
    }
  });
  it('P7 jak P6, ale retencja na C zamiast kosza: przycięta wersja nie wraca', async () => {
    sztucznyZegar();
    const { P, K, C, pid, sid } = await zPrzyszloscia();
    expect((await C.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds, 'kontrola: retencja przycina').toContain(sid);
    await trzyRundy(P, K, C);
    for (const [nazwa, v] of [['P', P], ['K', K], ['C', C]]) expect(await wersja(v, pid, sid), nazwa).toBeNull();
  });
  it('P8 kosz na K (+10 min), „Przywróć” na P, P po minucie usuwa ponownie: zapis kończy w koszu na trzech', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    const C = await urzadzenie();
    await sync(K, C);
    przesunZegar(60e3);
    await zZegarem(10 * 60e3, () => K.moveSnapshotToTrash(pid, sid));
    await sync(K, P); await sync(K, C);
    przesunZegar(60e3);
    await P.restoreTrashedSnapshot(pid, sid);
    await sync(P, K); await sync(P, C);
    przesunZegar(60e3);
    await P.moveSnapshotToTrash(pid, sid);
    await trzyRundy(P, K, C);
    for (const [nazwa, v] of [['P', P], ['K', K], ['C', C]]) {
      expect(await wersja(v, pid, sid), `${nazwa}: drugie usunięcie zostaje`).toBeNull();
      expect(await wKoszu(v, sid), `${nazwa}: w koszu`).toBeTruthy();
    }
  });

  async function trzyIN() {
    const K = await urzadzenie(), P = await urzadzenie(), C = await urzadzenie(), N = await urzadzenie();
    const a = await zapisz(K, jan(120, 22));
    const s2 = await zapisz(K, jan(125, 24), { patientId: a.patientId });
    await zapisz(K, jan(130, 26), { patientId: a.patientId });
    await sync(K, P); await sync(K, C);
    const pid = a.patientId, sid = s2.snapshotId;
    await popraw(P, pid, sid, { weight: 25 });
    await popraw(P, pid, sid, { weight: 27 }); // P: rev 2, wcześniej
    przesunZegar(4 * 60e3);
    await popraw(C, pid, sid, { height: 127 }); // C: rev 1, najpóźniej
    return { P, C, N, pid, sid };
  }
  it('P5 import pliku karty od C (późniejsza poprawka, rev 1) na pustym N; P ma dwie wcześniejsze poprawki (rev 2): po synchronizacji wygrywa poprawka z pliku', async () => {
    sztucznyZegar();
    const { P, C, N, pid, sid } = await trzyIN();
    await N.importPatientFromEnvelope(await C.exportPatientEnvelope(pid), hasla.get(C));
    for (let r = 0; r < 2; r += 1) await wymiana(P, N, 'P-pierwszy');
    for (const [nazwa, v] of [['P', P], ['N', N]]) expect(tresc(await wersja(v, pid, sid)), nazwa).toBe('127/24');
  });
  it('„Scal kopię konta” od C (późniejsza poprawka, rev 1) na pustym N; P ma dwie wcześniejsze poprawki (rev 2): po synchronizacji wygrywa poprawka z kopii (P-KOPIA-REV + D-7)', async () => {
    sztucznyZegar();
    const { P, C, N, pid, sid } = await trzyIN();
    await N.mergeVaultBackup(await C.exportVaultBackup(), hasla.get(C));
    for (let r = 0; r < 2; r += 1) await wymiana(P, N, 'P-pierwszy');
    for (const [nazwa, v] of [['P', P], ['N', N]]) expect(tresc(await wersja(v, pid, sid)), nazwa).toBe('127/24');
  });
});

describe('strażnik źródła P-POZNIEJSZA-POPRAWKA', () => {
  const src = readFileSync(path.join(repoRoot, 'vilda_vault.js'), 'utf8');
  const czesc = (od, doo) => {
    const i = src.indexOf(od);
    expect(i, `kontrola: jest ${od}`).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf(doo, i));
  };
  it('wersja tej samej karty: jedna reguła Bkz_nowszaWersja, zapis z treścią i chwilą zwycięzcy, rev = wyższa z dwóch także przy odrzuceniu (P-REV-MAX), bez „teraz”', () => {
    const scal = czesc('async function Bsl_scalPacjenta(', 'function Bsw_bezNowych(');
    expect(scal).toContain('if (!Bkz_nowszaWersja(S, g)) {');
    expect(scal).toContain('rev: Math.max(mt(S), mt(g)), updatedAtISO: zmianaZdalna, payloadCipher: szyfry[k],');
    expect(scal).toContain('if (mt(S) > mt(g)) {');
    expect(scal).toContain('Bng_dopisz(Bng_zap, Bng_j, Object.assign({}, g, { rev: mt(S) }, Bm1(g, S)), null, g.payloadCipher)');
    expect(scal).not.toContain('rev: mt(S), updatedAtISO');
    expect(scal).not.toContain('zmianaZdalna || teraz');
    expect(scal).not.toContain('revZdalna > revLokalna');
  });
  it('poprawka w miejscu: stempel w updatedAtISO, w rekordzie dla nagłówka i w lastSavedAtISO; savedAtISO bez stempla', () => {
    const akt = czesc('async function Bzw_aktualizujWersje(', 'function tn(t)');
    expect(akt).toContain('d=y&&a.savedAtISO||l,Bpp_z=Bpp_chwilaZmiany(a.updatedAtISO,a.savedAtISO);');
    expect(akt).toContain('rev:mt(a)+1,updatedAtISO:Bpp_z,payloadCipher:i},Bm1(a))');
    expect(akt).toContain('{savedAtISO:d,rev:mt(a)+1,updatedAtISO:Bpp_z,payloadCipher:i}');
    expect(akt).toContain('lastSavedAtISO:Bkz_pozniejsza(p.lastSavedAtISO,Bpp_z)');
    expect(akt).not.toContain('updatedAtISO:l');
  });
  it('„Przywróć” i import z kosza: reguła Bkz_nowszaWersja i stempel z chwilą usunięcia', () => {
    const przywroc = czesc('async function Bkz_przywroc(', 'async function Bkz_poImporcie(');
    expect(przywroc).toContain('e.deletedAtISO < zmianaObecnej || Bkz_nowszaWersja(obecna, e)');
    expect(przywroc).not.toContain('mt(obecna) > revUsuniecia');
    expect(przywroc).toContain("Bpp_chwilaZmiany(Bkz_znanaZmiana(e), obecna ? Bkz_zmiana(obecna) : '', Bkz_ostatnie(e))");
    expect(przywroc).toContain('updatedAtISO: zmiana,');
    expect(przywroc).toContain('Bkz_przebudujNaglowek(patientId, zmiana)');
    const poImporcie = czesc('async function Bkz_poImporcie(', '\n}\n');
    expect(poImporcie).toContain('Bpp_chwilaZmiany(wersja.updatedAtISO, wersja.savedAtISO, Bkz_znanaZmiana(e), Bkz_ostatnie(e))');
    expect(poImporcie).not.toContain('updatedAtISO: teraz');
  });
  it('usunięcie do kosza i retencja: chwila usunięcia później niż usuwana wersja', () => {
    expect(czesc('async function Bkz_doKosza(', 'Bkz_zmienListe([wpis], [])')).toContain('deletedAtISO: Bpp_chwilaZmiany(Bkz_zmiana(zapis)),');
    const ret = czesc('const Bpp_t = function (s)', 'powod: \'retencja\'');
    expect(ret).toContain('return z > teraz ? Bpp_chwilaZmiany(z) : teraz;');
    expect(ret).toContain('deletedAtISO: Bpp_t(s),');
  });
  it('reguła właściciela wersji wspólnej dwóm kartom zostaje „najpierw rev” (PD-1)', () => {
    const wl = czesc('function Bsw_nowszyRekord(', 'function Bsw_nowszaTresc(');
    expect(wl).toContain('return rz !== rl ? rz > rl : Bsw_zmiana(S) > Bsw_zmiana(g);');
  });
});
