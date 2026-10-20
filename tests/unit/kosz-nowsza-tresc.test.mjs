import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-KOSZ-NOWSZA-TRESC (decyzja właściciela D-6 B, 2026-10-20): zapis poprawiony (albo przypięty) na jednym urządzeniu
// i przeniesiony do kosza na drugim, zanim się zsynchronizowały. Usunięcie (późniejsze) wygrywa jak dotąd, ale w koszu
// obu urządzeń leży nowsza z dwóch treści (wyższa rev, przy równej późniejsza chwila zmiany), w każdej kolejności
// synchronizacji, więc „Przywróć” oddaje poprawkę. Prawdziwy vilda_vault.js, dane fikcyjne.

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
const adaptery = new WeakMap();
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
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_retention.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  const pamiec = v.createInMemoryAdapter();
  v.setStorageAdapter(pamiec);
  adaptery.set(v, pamiec);
  await v.createUser(`Kosz#Nowsza!2026${licznik}aa`, { label: `dev${licznik}`, iterations: 10000 });
  return v;
}
let zegar = Date.parse('2026-10-20T09:00:00Z');
function przesunZegar(ms) { zegar += ms; vi.setSystemTime(zegar); }
function sztucznyZegar() { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(zegar); }
afterEach(() => { vi.useRealTimers(); });

const jan = (height, weight) => ({
  name: 'Testowy Jan',
  user: { lastName: 'Testowy', firstName: 'Jan', dobISO: '2016-03-12', sex: 'M', height, weight },
});
async function zapisz(v, p, opcje = {}) { przesunZegar(60e3); return v.savePatient(p, { dedup: false, ...opcje }); }
const wersja = async (v, pid, sid) => ((await v.getPatient(pid)) || { snapshots: [] }).snapshots.find((s) => s.snapshotId === sid) || null;
const wKoszu = async (v, sid) => (await v.listTrashedSnapshots()).find((k) => k.snapshotId === sid) || null;
const nagrobek = async (v, sid) => {
  const e = ((await v.exportSyncPayload()).snapshotTombstones || []).find((x) => x.snapshotId === sid);
  return e ? { deletedAtISO: e.deletedAtISO, rev: e.rev, updatedAtISO: e.updatedAtISO, savedAtISO: e.savedAtISO, payload: e.payload } : null;
};

// Komputer (K): Jan, trzy wizyty, druga z masą 24 kg. iPhone (P) dostaje komplet.
async function dwaUrzadzenia() {
  const P = await urzadzenie();
  const K = await urzadzenie();
  const a = await zapisz(K, jan(120, 22));
  const s2 = await zapisz(K, jan(125, 24), { patientId: a.patientId });
  await zapisz(K, jan(130, 26), { patientId: a.patientId });
  await P.mergeSyncPayload(await K.exportSyncPayload());
  return { P, K, pid: a.patientId, sid: s2.snapshotId };
}
async function poprawMase(v, pid, sid, kg) {
  const w = await wersja(v, pid, sid);
  await v.updateSnapshotPayload(pid, sid, { ...w.payload, user: { ...w.payload.user, weight: kg } }, { preserveSavedAt: true });
}
async function wymiana(P, K, kolejnosc) {
  if (kolejnosc === 'P-pierwszy') {
    await P.mergeSyncPayload(await K.exportSyncPayload());
    await K.mergeSyncPayload(await P.exportSyncPayload());
  } else if (kolejnosc === 'K-pierwszy') {
    await K.mergeSyncPayload(await P.exportSyncPayload());
    await P.mergeSyncPayload(await K.exportSyncPayload());
  } else {
    const lp = await P.exportSyncPayload();
    const lk = await K.exportSyncPayload();
    await P.mergeSyncPayload(lk);
    await K.mergeSyncPayload(lp);
  }
}

describe('P-KOSZ-NOWSZA-TRESC: w koszu nowsza z dwóch treści zapisu', () => {
  for (const kolejnosc of ['P-pierwszy', 'K-pierwszy', 'naraz']) {
    it(`poprawka masy na iPhonie, potem kosz na komputerze (${kolejnosc}): w koszu obu 26 kg, „Przywróć” oddaje 26 kg`, async () => {
      sztucznyZegar();
      const { P, K, pid, sid } = await dwaUrzadzenia();
      przesunZegar(60e3);
      await poprawMase(P, pid, sid, 26);
      przesunZegar(5 * 60e3);
      await K.moveSnapshotToTrash(pid, sid);
      przesunZegar(60e3);
      await wymiana(P, K, kolejnosc);
      for (const [nazwa, v] of [['P', P], ['K', K]]) {
        expect(await wersja(v, pid, sid), `${nazwa}: usunięcie wygrywa`).toBeNull();
        expect((await wKoszu(v, sid)).payload.user.weight, `${nazwa}: kosz trzyma poprawkę`).toBe(26);
      }
      expect(await nagrobek(P, sid), 'nagrobek ten sam na obu').toEqual(await nagrobek(K, sid));
      expect((await nagrobek(K, sid)).rev, 'wersja nagrobka = wersja treści').toBe(1);
      przesunZegar(60e3);
      await K.restoreTrashedSnapshot(pid, sid);
      await P.mergeSyncPayload(await K.exportSyncPayload());
      expect((await wersja(K, pid, sid)).payload.user.weight).toBe(26);
      expect((await wersja(P, pid, sid)).payload.user.weight).toBe(26);
    });
  }

  for (const kolejnosc of ['P-pierwszy', 'K-pierwszy']) {
    it(`gwiazdka na iPhonie, potem kosz na komputerze (${kolejnosc}): w koszu obu zapis przypięty`, async () => {
      sztucznyZegar();
      const { P, K, pid, sid } = await dwaUrzadzenia();
      przesunZegar(60e3);
      await P.setSnapshotPinned(pid, sid, true);
      przesunZegar(5 * 60e3);
      await K.moveSnapshotToTrash(pid, sid); // komputer nie wie o przypięciu
      przesunZegar(60e3);
      await wymiana(P, K, kolejnosc);
      expect((await wKoszu(P, sid)).pinned).toBe(true);
      expect((await wKoszu(K, sid)).pinned).toBe(true);
      przesunZegar(60e3);
      await P.restoreTrashedSnapshot(pid, sid);
      expect((await wersja(P, pid, sid)).pinned, 'przypięcie wraca razem z treścią').toBe(true);
    });
  }

  it('kontrola: poprawka PO koszu wygrywa jak dotąd — zapis zostaje w karcie na obu, kosz pusty', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    przesunZegar(60e3);
    await K.moveSnapshotToTrash(pid, sid);
    przesunZegar(5 * 60e3);
    await poprawMase(P, pid, sid, 26);
    await wymiana(P, K, 'K-pierwszy');
    expect((await wersja(P, pid, sid)).payload.user.weight).toBe(26);
    expect((await wersja(K, pid, sid)).payload.user.weight).toBe(26);
    expect(await K.listTrashedSnapshots()).toEqual([]);
  });

  it('kolejne scalenie tego samego stanu nie zapisuje listy kosza ponownie (jeden zapis metadanych — znacznik scalania)', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    przesunZegar(60e3);
    await poprawMase(P, pid, sid, 26);
    przesunZegar(5 * 60e3);
    await K.moveSnapshotToTrash(pid, sid);
    await wymiana(P, K, 'K-pierwszy');
    const ladunek = await P.exportSyncPayload();
    await K.mergeSyncPayload(ladunek);
    const pamiec = adaptery.get(K);
    const oryginal = pamiec.putUserMeta;
    const zapisy = [];
    pamiec.putUserMeta = (...x) => { zapisy.push(x[1] && x[1].snapshotTombstones); return oryginal.apply(pamiec, x); };
    await K.mergeSyncPayload(ladunek);
    pamiec.putUserMeta = oryginal;
    expect(zapisy, 'tylko znacznik scalania').toHaveLength(1);
  });

  for (const kolejnosc of ['K-potem-P', 'P-potem-K']) {
    it(`trzecie urządzenie ze starą wersją dostaje oba ładunki (${kolejnosc}): kosz z poprawką, jak na pozostałych`, async () => {
      sztucznyZegar();
      const { P, K, pid, sid } = await dwaUrzadzenia();
      const C = await urzadzenie();
      await C.mergeSyncPayload(await K.exportSyncPayload());
      przesunZegar(60e3);
      await poprawMase(P, pid, sid, 26);
      przesunZegar(5 * 60e3);
      await K.moveSnapshotToTrash(pid, sid);
      const lp = await P.exportSyncPayload();
      const lk = await K.exportSyncPayload();
      if (kolejnosc === 'K-potem-P') { await C.mergeSyncPayload(lk); await C.mergeSyncPayload(lp); } else { await C.mergeSyncPayload(lp); await C.mergeSyncPayload(lk); }
      expect(await wersja(C, pid, sid)).toBeNull();
      expect((await wKoszu(C, sid)).payload.user.weight).toBe(26);
    });
  }

  // Uwaga przeglądu #732: remis rev rozstrzyga późniejsza chwila zmiany (druga część Bkz_nowszaWersja).
  for (const kolejnosc of ['P-pierwszy', 'K-pierwszy', 'naraz']) {
    it(`obie strony poprawiły zapis (ta sama rev), późniejsza poprawka na P, kosz na K (${kolejnosc}): w koszu obu późniejsza`, async () => {
      sztucznyZegar();
      const { P, K, pid, sid } = await dwaUrzadzenia();
      przesunZegar(60e3);
      await poprawMase(K, pid, sid, 23);
      przesunZegar(60e3);
      await poprawMase(P, pid, sid, 26);
      przesunZegar(5 * 60e3);
      await K.moveSnapshotToTrash(pid, sid);
      przesunZegar(60e3);
      await wymiana(P, K, kolejnosc);
      for (const [nazwa, v] of [['P', P], ['K', K]]) expect((await wKoszu(v, sid)).payload.user.weight, nazwa).toBe(26);
      expect(await nagrobek(P, sid)).toEqual(await nagrobek(K, sid));
      expect((await nagrobek(K, sid)).rev).toBe(1);
      przesunZegar(60e3);
      await K.restoreTrashedSnapshot(pid, sid);
      expect((await wersja(K, pid, sid)).payload.user.weight).toBe(26);
    });
  }

  // Uwaga przeglądu #732: nagrobek niesie też chwilę zapisu treści — poprawka z nową chwilą zapisu (preserveSavedAt:
  // false) wraca po „Przywróć” w swoje miejsce historii.
  for (const kolejnosc of ['P-pierwszy', 'K-pierwszy']) {
    it(`poprawka z nową chwilą zapisu na P, kosz na K (${kolejnosc}): nagrobek i przywrócona wersja mają chwilę zapisu poprawki`, async () => {
      sztucznyZegar();
      const { P, K, pid, sid } = await dwaUrzadzenia();
      przesunZegar(60e3);
      const w = await wersja(P, pid, sid);
      await P.updateSnapshotPayload(pid, sid, { ...w.payload, user: { ...w.payload.user, weight: 26 } }, { preserveSavedAt: false });
      const zapisP = (await wersja(P, pid, sid)).savedAtISO;
      expect(zapisP).not.toBe(w.savedAtISO);
      przesunZegar(5 * 60e3);
      await K.moveSnapshotToTrash(pid, sid);
      przesunZegar(60e3);
      await wymiana(P, K, kolejnosc);
      for (const [nazwa, v] of [['P', P], ['K', K]]) expect((await nagrobek(v, sid)).savedAtISO, nazwa).toBe(zapisP);
      przesunZegar(60e3);
      await K.restoreTrashedSnapshot(pid, sid);
      expect((await wersja(K, pid, sid)).savedAtISO).toBe(zapisP);
    });
  }

  it('kosz na obu urządzeniach: wcześniejsze usunięcie poprawionej treści i późniejsze usunięcie starej — w koszu poprawka', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    przesunZegar(60e3);
    await poprawMase(P, pid, sid, 26);
    przesunZegar(60e3);
    await P.moveSnapshotToTrash(pid, sid);
    przesunZegar(60e3);
    await K.moveSnapshotToTrash(pid, sid); // późniejsze usunięcie, treść sprzed poprawki
    await wymiana(P, K, 'naraz');
    await wymiana(P, K, 'P-pierwszy');
    for (const v of [P, K]) expect((await wKoszu(v, sid)).payload.user.weight).toBe(26);
    expect((await nagrobek(P, sid)).deletedAtISO, 'chwila usunięcia — późniejsza').toBe((await nagrobek(K, sid)).deletedAtISO);
  });

  it('rozjazd zegarów: usunięcie z zegarem 10 min do przodu wygrywa z poprawką zrobioną później, ale kosz trzyma poprawkę', async () => {
    sztucznyZegar();
    const { P, K, pid, sid } = await dwaUrzadzenia();
    przesunZegar(60e3);
    vi.setSystemTime(zegar + 10 * 60e3);
    await K.moveSnapshotToTrash(pid, sid);
    vi.setSystemTime(zegar);
    przesunZegar(60e3);
    await poprawMase(P, pid, sid, 26);
    await wymiana(P, K, 'P-pierwszy');
    for (const v of [P, K]) {
      expect(await wersja(v, pid, sid)).toBeNull();
      expect((await wKoszu(v, sid)).payload.user.weight).toBe(26);
    }
  });
});

// Trzy urządzenia (uwagi przeglądu #732): ten sam zapis poprawiony albo przypięty na iPhonie (P), przeniesiony do kosza
// na komputerze (K) i przycięty retencją na tablecie (C), który nie znał ani poprawki, ani kosza. Nagrobek retencji
// (późniejszy, bez treści, stara wersja) nie może zdjąć wpisu kosza z nowszą treścią: na 27055774 wpis kosza znikał
// (albo zostawał tylko na części urządzeń), a przypięty zapis wracał do karty na wszystkich trzech.
async function trzyUrzadzenia() {
  const P = await urzadzenie();
  const K = await urzadzenie();
  const C = await urzadzenie();
  let pid = null;
  const ids = [];
  for (let i = 0; i < 12; i += 1) {
    const r = await zapisz(K, jan(100 + i, 20 + i), pid ? { patientId: pid } : {});
    pid = r.patientId;
    ids.push(r.snapshotId);
  }
  await P.mergeSyncPayload(await K.exportSyncPayload());
  await C.mergeSyncPayload(await K.exportSyncPayload());
  return { P, K, C, pid, sid: ids[3] };
}
async function sync(z, na) { await na.mergeSyncPayload(await z.exportSyncPayload()); }
async function rundy(P, K, C) {
  for (let r = 0; r < 3; r += 1) {
    await sync(K, P); await sync(P, K); await sync(K, C); await sync(C, K); await sync(P, C); await sync(C, P);
  }
}
const KOLEJNOSCI_3 = ['K←P,K←C', 'K←C,K←P', 'P←K,K←C', 'C←K,C←P', 'C←P,C←K'];
async function pierwszeScalenia(urz, kolejnosc) {
  for (const krok of kolejnosc.split(',')) {
    const [na, z] = krok.split('←');
    await sync(urz[z], urz[na]);
  }
}

describe('P-KOSZ-NOWSZA-TRESC: trzy urządzenia, retencja starej wersji na trzecim', () => {
  for (const kolejnosc of KOLEJNOSCI_3) {
    it(`poprawka na P, kosz na K, retencja na C (${kolejnosc}): kosz z poprawką i ten sam nagrobek na trzech`, async () => {
      sztucznyZegar();
      const { P, K, C, pid, sid } = await trzyUrzadzenia();
      przesunZegar(60e3);
      await poprawMase(P, pid, sid, 99);
      przesunZegar(60e3);
      await K.moveSnapshotToTrash(pid, sid);
      przesunZegar(60e3);
      const przyciete = await C.pruneSnapshotsForPatient(pid, { recentHours: 0 });
      expect(przyciete.prunedIds, 'retencja na C przycina ten zapis').toContain(sid);
      await pierwszeScalenia({ P, K, C }, kolejnosc);
      await rundy(P, K, C);
      const wzor = await nagrobek(K, sid);
      for (const [nazwa, v] of [['P', P], ['K', K], ['C', C]]) {
        expect(await wersja(v, pid, sid), `${nazwa}: zapis nie wraca do karty`).toBeNull();
        const k = await wKoszu(v, sid);
        expect(k, `${nazwa}: wpis kosza jest`).toBeTruthy();
        expect(k.payload.user.weight, `${nazwa}: kosz trzyma poprawkę`).toBe(99);
        expect(await nagrobek(v, sid), `${nazwa}: ten sam nagrobek`).toEqual(wzor);
      }
      expect(wzor.rev, 'wersja nagrobka = wersja treści').toBe(1);
    });
  }

  // Ograniczenie sprzed zmiany (P-RETENCJA-NAGROBKI): P scala retencję C, zanim dostanie kosz K. Nagrobek retencji
  // (późniejszy niż poprawka) wygrywa z poprawką jak dotąd i nie niesie treści, więc poprawka przepada, zanim dotrze
  // gdziekolwiek. Kosz K przychodzi potem z treścią sprzed poprawki. Wynik zbieżny i taki sam jak na 44256803.
  it('poprawka na P, kosz na K, retencja na C (P←C,P←K): poprawka przegrywa z retencją jak dotąd, kosz zbieżny ze starą treścią', async () => {
    sztucznyZegar();
    const { P, K, C, pid, sid } = await trzyUrzadzenia();
    przesunZegar(60e3);
    await poprawMase(P, pid, sid, 99);
    przesunZegar(60e3);
    await K.moveSnapshotToTrash(pid, sid);
    przesunZegar(60e3);
    await C.pruneSnapshotsForPatient(pid, { recentHours: 0 });
    await pierwszeScalenia({ P, K, C }, 'P←C,P←K');
    await rundy(P, K, C);
    const wzor = await nagrobek(K, sid);
    for (const [nazwa, v] of [['P', P], ['K', K], ['C', C]]) {
      expect(await wersja(v, pid, sid), `${nazwa}: zapis nie wraca`).toBeNull();
      expect((await wKoszu(v, sid)).payload.user.weight, `${nazwa}: kosz z treścią sprzed poprawki`).toBe(23);
      expect(await nagrobek(v, sid), `${nazwa}: ten sam nagrobek`).toEqual(wzor);
    }
  });

  for (const kolejnosc of ['K←P,K←C', 'K←C,K←P', 'C←P,C←K']) {
    it(`gwiazdka na P, kosz na K, retencja na C (${kolejnosc}): zapis nie wraca do karty, w koszu obu przypięty`, async () => {
      sztucznyZegar();
      const { P, K, C, pid, sid } = await trzyUrzadzenia();
      przesunZegar(60e3);
      await P.setSnapshotPinned(pid, sid, true);
      przesunZegar(60e3);
      await K.moveSnapshotToTrash(pid, sid); // komputer nie wie o przypięciu
      przesunZegar(60e3);
      await C.pruneSnapshotsForPatient(pid, { recentHours: 0 });
      await pierwszeScalenia({ P, K, C }, kolejnosc);
      await rundy(P, K, C);
      for (const [nazwa, v] of [['P', P], ['K', K], ['C', C]]) {
        expect(await wersja(v, pid, sid), `${nazwa}: usunięty zapis nie wraca`).toBeNull();
        expect((await wKoszu(v, sid)).pinned, `${nazwa}: w koszu zapis przypięty`).toBe(true);
      }
    });
  }

  it('kontrola: retencja wersji przywróconej i zmienionej po koszu zdejmuje starą treść kosza jak dotąd', async () => {
    sztucznyZegar();
    const { P, K, C, pid, sid } = await trzyUrzadzenia();
    przesunZegar(60e3);
    await K.moveSnapshotToTrash(pid, sid);
    await sync(K, P);
    await sync(K, C);
    przesunZegar(60e3);
    await C.restoreTrashedSnapshot(pid, sid);
    przesunZegar(60e3);
    await poprawMase(C, pid, sid, 31);
    przesunZegar(60e3);
    await C.pruneSnapshotsForPatient(pid, { recentHours: 0 });
    await rundy(P, K, C);
    for (const [nazwa, v] of [['P', P], ['K', K], ['C', C]]) {
      expect(await wersja(v, pid, sid), `${nazwa}: przycięta`).toBeNull();
      expect(await wKoszu(v, sid), `${nazwa}: stara treść nie wraca do kosza`).toBeNull();
    }
  });
});

describe('strażnik źródła', () => {
  const src = readFileSync(path.join(repoRoot, 'vilda_vault.js'), 'utf8');
  it('jedna reguła „nowsza wersja” w łączeniu nagrobków, w treści z ładunku, w pętli wersji i na końcu scalania', () => {
    expect(src).toContain('function Bkz_nowszaWersja(x, y) {');
    const czesc = (od, doo) => src.slice(src.indexOf(od), src.indexOf(doo));
    expect(czesc('function Bkz_dolacz(', 'async function Bkz_czytaj(')).toContain('} else if (starszy.payloadCipher && Bkz_nowszaWersja(starszy, nowszy)) {');
    expect(czesc('async function Bkz_scalStart(', 'function Bkz_przegral(')).toContain('!Bkz_nowszaWersja(e, lokalny)');
    expect(czesc('function Bkz_pomin(', 'async function Bkz_scalKoniec(')).toContain('Bkz_nowszaWersja(zapis, e)');
    expect(czesc('async function Bkz_scalKoniec(', 'async function Bkz_poImporcie(')).toContain('Bkz_nowszaWersja(lokalna, e)');
  });
});
