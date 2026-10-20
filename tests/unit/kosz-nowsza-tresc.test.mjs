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

  // P←C,P←K: na 27055774 zapis znikał i z karty, i z kosza (nagrobek bez treści) — uwaga przeglądu #733.
  for (const kolejnosc of ['K←P,K←C', 'K←C,K←P', 'C←P,C←K', 'P←C,P←K']) {
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

  // P-KOSZ-RETENCJA-PO-KOSZU (uwaga przeglądu #733). Gwiazdka postawiona na P PO koszu na K (P o koszu nie wie), a C
  // przycina tę wersję retencją jeszcze później. Przypięcie jest późniejsze niż kosz, więc wygrywa z nim, a retencja
  // nigdy nie usuwa wersji przypiętej. Na cd3a2876 scalony nagrobek brał chwilę retencji i tracił jej powód: przypięta
  // wizyta znikała z karty na P, K i C (w 5 z 8 kolejności), a lądowała w koszu.
  const KOLEJNOSCI_8 = ['K←C,P←K', 'P←K,K←C', 'K←P,K←C', 'K←C,K←P', 'C←K,P←C', 'P←C,P←K', 'C←P,C←K', 'C←K,C←P'];
  const WARIANTY_GWIAZDKI = {
    'ta sama wersja': async () => {},
    'poprawka na P przed koszem': async ({ P, K, pid, sid }) => { await poprawMase(P, pid, sid, 99); await sync(P, K); },
    'poprawka na K przed koszem': async ({ K, pid, sid }) => { await poprawMase(K, pid, sid, 99); },
  };
  for (const [wariant, przed] of Object.entries(WARIANTY_GWIAZDKI)) {
    for (const kolejnosc of KOLEJNOSCI_8) {
      it(`gwiazdka na P PO koszu na K, retencja na C (${wariant}; ${kolejnosc}): wizyta zostaje przypięta w karcie na trzech`, async () => {
        sztucznyZegar();
        const u = await trzyUrzadzenia();
        const { P, K, C, pid, sid } = u;
        przesunZegar(60e3);
        await przed(u);
        przesunZegar(60e3);
        await K.moveSnapshotToTrash(pid, sid);
        przesunZegar(60e3);
        await P.setSnapshotPinned(pid, sid, true); // P nie zna kosza
        przesunZegar(60e3);
        expect((await C.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
        await pierwszeScalenia({ P, K, C }, kolejnosc);
        await rundy(P, K, C);
        for (const [nazwa, v] of [['P', P], ['K', K], ['C', C]]) {
          const w = await wersja(v, pid, sid);
          expect(w, `${nazwa}: wizyta w karcie`).toBeTruthy();
          expect(w.pinned, `${nazwa}: przypięta`).toBe(true);
          expect(await wKoszu(v, sid), `${nazwa}: nie w koszu`).toBeNull();
        }
      });
    }
  }

  // Uwaga weryfikacji P-KOSZ-RETENCJA-PO-KOSZU: po 30 dniach wpis kosza traci treść; scalenie dwóch takich samych wpisów
  // nie może go zamienić w sam nagrobek retencji — inaczej wizyta przypięta PRZED koszem na urządzeniu offline wraca.
  for (const poWygasnieciu of ['K↔C po wygaśnięciu treści', 'bez synchronizacji po wygaśnięciu']) {
    it(`gwiazdka na P przed koszem na K, retencja na C, P offline 31 dni (${poWygasnieciu}): wizyta zostaje usunięta`, async () => {
      sztucznyZegar();
      const { P, K, C, pid, sid } = await trzyUrzadzenia();
      przesunZegar(60e3);
      await P.setSnapshotPinned(pid, sid, true); // P dalej się nie synchronizuje
      przesunZegar(60e3);
      await K.moveSnapshotToTrash(pid, sid, { odepnij: true });
      przesunZegar(60e3);
      expect((await C.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
      for (let i = 0; i < 2; i += 1) { await sync(C, K); await sync(K, C); }
      przesunZegar(31 * 864e5);
      if (poWygasnieciu.startsWith('K↔C')) for (let i = 0; i < 2; i += 1) { await sync(C, K); await sync(K, C); }
      await sync(K, P); await sync(P, K);
      await rundy(P, K, C);
      for (const [nazwa, v] of [['P', P], ['K', K], ['C', C]]) {
        expect(await wersja(v, pid, sid), `${nazwa}: usunięta wizyta nie wraca`).toBeNull();
      }
      const n = ((await K.exportSyncPayload()).snapshotTombstones || []).find((x) => x.snapshotId === sid);
      expect(n.powod, 'wpis kosza, nie sam nagrobek retencji').toBeUndefined();
    });
  }

  it('wpis kosza scalony z późniejszą retencją pokazuje chwilę kosza, nie retencji, i wygasa od niej', async () => {
    sztucznyZegar();
    const { P, K, C, pid, sid } = await trzyUrzadzenia();
    przesunZegar(60e3);
    await poprawMase(P, pid, sid, 99);
    przesunZegar(60e3);
    const r = await K.moveSnapshotToTrash(pid, sid);
    przesunZegar(60e3);
    await C.pruneSnapshotsForPatient(pid, { recentHours: 0 });
    await pierwszeScalenia({ P, K, C }, 'K←P,K←C');
    await rundy(P, K, C);
    for (const [nazwa, v] of [['P', P], ['K', K], ['C', C]]) {
      const k = await wKoszu(v, sid);
      expect(k.payload.user.weight, nazwa).toBe(99);
      expect(k.deletedAtISO, `${nazwa}: chwila kosza`).toBe(r.deletedAtISO);
      expect(k.expiresAtISO, `${nazwa}: 30 dni od kosza`).toBe(new Date(Date.parse(r.deletedAtISO) + 30 * 864e5).toISOString());
    }
    const n = ((await K.exportSyncPayload()).snapshotTombstones || []).find((x) => x.snapshotId === sid);
    expect(n.przycietoISO > n.deletedAtISO, 'chwila retencji osobno').toBe(true);
    expect(n.powod).toBeUndefined();
  });

  // Uwaga fuzz v3 (P-KOSZ-RETENCJA-PO-KOSZU): wersję zmieniono na jednym urządzeniu PO koszu na drugim, a trzecie (albo
  // to samo) przycina ją potem retencją. Zmiana po koszu unieważnia kosz, a retencja usuwa wersję, więc kosz zostaje
  // pusty. Na 57e82a50 w części kolejności kosz trzymał treść sprzed tej zmiany (opis zmiany ginął w nagrobkach
  // retencji, seedy G 3390, F 2016, F 2121) albo treść samej zmiany z wcześniejszą chwilą usunięcia (G 3101, G 3133).
  const ZMIANA_PO_KOSZU = {
    'poprawka na K, kosz na C, poprawka na P, retencja na K': async ({ P, K, C, pid, sid }) => {
      await poprawMase(K, pid, sid, 78);
      przesunZegar(60e3);
      await C.moveSnapshotToTrash(pid, sid);
      przesunZegar(60e3);
      await poprawMase(P, pid, sid, 74);
      przesunZegar(60e3);
      expect((await K.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
    },
    'poprawka na P, kosz na K, poprawka na C, retencja na C, potem na P': async ({ P, K, C, pid, sid }) => {
      await poprawMase(P, pid, sid, 78);
      przesunZegar(60e3);
      await K.moveSnapshotToTrash(pid, sid);
      przesunZegar(60e3);
      await poprawMase(C, pid, sid, 74);
      przesunZegar(60e3);
      expect((await C.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
      przesunZegar(60e3);
      expect((await P.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
    },
    'poprawka na P, kosz na K, gwiazdka i odpięcie na C, retencja na C, potem na P': async ({ P, K, C, pid, sid }) => {
      await poprawMase(P, pid, sid, 78);
      przesunZegar(60e3);
      await K.moveSnapshotToTrash(pid, sid);
      przesunZegar(60e3);
      await C.setSnapshotPinned(pid, sid, true);
      przesunZegar(60e3);
      await C.setSnapshotPinned(pid, sid, false);
      przesunZegar(60e3);
      expect((await C.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
      przesunZegar(60e3);
      expect((await P.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
    },
    // Przegląd bbbffcc0: wersje „przecięte” (wyższa rev zmieniona wcześniej niż niższa). Zmiana po koszu liczy się
    // chwilą, nie rev — tak samo jak w Bkz_wygrywa.
    'dwie poprawki na P, kosz na C, poprawka na K, retencja na K': async ({ P, K, C, pid, sid }) => {
      await poprawMase(P, pid, sid, 51);
      przesunZegar(60e3);
      await poprawMase(P, pid, sid, 52);
      przesunZegar(60e3);
      await C.moveSnapshotToTrash(pid, sid);
      przesunZegar(60e3);
      await poprawMase(K, pid, sid, 53);
      przesunZegar(60e3);
      expect((await K.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
    },
    'dwie poprawki na K, kosz na K, poprawka na P, retencja na C': async ({ P, K, C, pid, sid }) => {
      await poprawMase(K, pid, sid, 99);
      przesunZegar(60e3);
      await poprawMase(K, pid, sid, 98);
      przesunZegar(60e3);
      await K.moveSnapshotToTrash(pid, sid);
      przesunZegar(60e3);
      await poprawMase(P, pid, sid, 74);
      przesunZegar(60e3);
      expect((await C.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
    },
    'gwiazdka i odpięcie na K, kosz na K, poprawka na P, retencja na C': async ({ P, K, C, pid, sid }) => {
      await K.setSnapshotPinned(pid, sid, true);
      przesunZegar(60e3);
      await K.setSnapshotPinned(pid, sid, false);
      przesunZegar(60e3);
      await K.moveSnapshotToTrash(pid, sid);
      przesunZegar(60e3);
      await poprawMase(P, pid, sid, 74);
      przesunZegar(60e3);
      expect((await C.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
    },
    // Fuzz v5 (X3): kosz unieważniony przez nagrobek retencji wersji zmienionej po koszu bierze jego opis wersji.
    'poprawka na C, kosz na K, poprawka na P, retencja na P, potem na C': async ({ P, K, C, pid, sid }) => {
      await poprawMase(C, pid, sid, 71);
      przesunZegar(60e3);
      await K.moveSnapshotToTrash(pid, sid);
      przesunZegar(60e3);
      await poprawMase(P, pid, sid, 74);
      przesunZegar(60e3);
      expect((await P.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
      przesunZegar(60e3);
      expect((await C.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
    },
    // Zmiana zachowania wobec cd3a2876 (tam kosz brał chwilę retencji i zabierał treść zmiany): wersja poprawiona albo
    // przywrócona po koszu, a potem przycięta przez urządzenie, które o niczym nie wie, znika jak każda przycięta
    // wersja — tak samo jak bez kosza.
    'kosz na K, poprawka na P, retencja na C': async ({ P, K, C, pid, sid }) => {
      await K.moveSnapshotToTrash(pid, sid);
      przesunZegar(60e3);
      await poprawMase(P, pid, sid, 61);
      przesunZegar(60e3);
      expect((await C.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
    },
    'kosz na K, „Przywróć” na P, retencja na C': async ({ P, K, C, pid, sid }) => {
      await K.moveSnapshotToTrash(pid, sid);
      await sync(K, P);
      przesunZegar(60e3);
      await P.restoreTrashedSnapshot(pid, sid);
      przesunZegar(60e3);
      expect((await C.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
    },
  };
  for (const [wariant, przebieg] of Object.entries(ZMIANA_PO_KOSZU)) {
    for (const kolejnosc of KOLEJNOSCI_8) {
      it(`${wariant} (${kolejnosc}): wizyta usunięta, kosz pusty, ten sam nagrobek na trzech`, async () => {
        sztucznyZegar();
        const u = await trzyUrzadzenia();
        const { P, K, C, pid, sid } = u;
        przesunZegar(60e3);
        await przebieg(u);
        await pierwszeScalenia({ P, K, C }, kolejnosc);
        await rundy(P, K, C);
        const wzor = await nagrobek(K, sid);
        for (const [nazwa, v] of [['P', P], ['K', K], ['C', C]]) {
          expect(await wersja(v, pid, sid), `${nazwa}: retencja usuwa wersję`).toBeNull();
          expect(await wKoszu(v, sid), `${nazwa}: zmiana po koszu unieważnia kosz`).toBeNull();
          expect(await nagrobek(v, sid), `${nazwa}: ten sam nagrobek`).toEqual(wzor);
        }
      });
    }
  }

  // Uwaga algebry fuzz v4: wpis kosza po wygaśnięciu treści (30 dni) mógł zostać na urządzeniach z różnym opisem wersji
  // na zawsze, zależnie od kolejności łączenia. Teraz ten sam nagrobek na trzech, a zmiana poprawki zostaje w nagrobku
  // (opis wersji albo zmianaISO).
  for (const kolejnosc of KOLEJNOSCI_8) {
    it(`poprawka na K, kosz na P, retencja na K, potem na C, treść kosza wygasa przed synchronizacją (${kolejnosc}): ten sam nagrobek na trzech`, async () => {
      sztucznyZegar();
      const { P, K, C, pid, sid } = await trzyUrzadzenia();
      przesunZegar(60e3);
      await poprawMase(K, pid, sid, 78);
      const zmianaPoprawki = (await wersja(K, pid, sid)).updatedAtISO;
      przesunZegar(60e3);
      await P.moveSnapshotToTrash(pid, sid);
      przesunZegar(60e3);
      expect((await K.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
      przesunZegar(60e3);
      expect((await C.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
      przesunZegar(31 * 864e5);
      await pierwszeScalenia({ P, K, C }, kolejnosc);
      await rundy(P, K, C);
      const pelny = async (v) => {
        const e = ((await v.exportSyncPayload()).snapshotTombstones || []).find((x) => x.snapshotId === sid);
        return e ? { ...(await nagrobek(v, sid)), powod: e.powod, przycietoISO: e.przycietoISO, zmianaISO: e.zmianaISO } : null;
      };
      const wzor = await pelny(K);
      expect(wzor.powod, 'kosz późniejszy niż poprawka zostaje wpisem kosza').toBeUndefined();
      expect([wzor.updatedAtISO, wzor.zmianaISO], 'nagrobek zna zmianę poprawki').toContain(zmianaPoprawki);
      for (const [nazwa, v] of [['P', P], ['K', K], ['C', C]]) {
        expect(await wersja(v, pid, sid), `${nazwa}: wersja usunięta`).toBeNull();
        expect(await pelny(v), `${nazwa}: ten sam nagrobek`).toEqual(wzor);
      }
    });
  }

  // Przegląd bbbffcc0 (flota mieszana): nowe urządzenie przepisywało opis wersji w samym nagrobku retencji na swoją,
  // poprawioną wersję. Starsza aplikacja (cd3a2876, 44256803) czyta ten opis jako „przycięto inną wersję” i zdejmuje
  // ważny wpis kosza z treścią — kosz znikał na wszystkich urządzeniach. Opis zostaje, zmianę niesie zmianaISO.
  it('retencja pokonuje poprawioną wersję na P: nagrobek retencji zachowuje opis wersji, a zmianę niesie zmianaISO', async () => {
    sztucznyZegar();
    const { P, K, C, pid, sid } = await trzyUrzadzenia();
    przesunZegar(60e3);
    await poprawMase(P, pid, sid, 99);
    const zmianaPoprawki = (await wersja(P, pid, sid)).updatedAtISO;
    przesunZegar(60e3);
    await K.moveSnapshotToTrash(pid, sid);
    przesunZegar(60e3);
    expect((await C.pruneSnapshotsForPatient(pid, { recentHours: 0 })).prunedIds).toContain(sid);
    const zC = ((await C.exportSyncPayload()).snapshotTombstones || []).find((x) => x.snapshotId === sid);
    await sync(C, P);
    expect(await wersja(P, pid, sid), 'retencja usuwa poprawioną wersję na P').toBeNull();
    const zP = ((await P.exportSyncPayload()).snapshotTombstones || []).find((x) => x.snapshotId === sid);
    expect({ powod: zP.powod, rev: zP.rev, updatedAtISO: zP.updatedAtISO, savedAtISO: zP.savedAtISO }, 'opis wersji jak u C')
      .toEqual({ powod: zC.powod, rev: zC.rev, updatedAtISO: zC.updatedAtISO, savedAtISO: zC.savedAtISO });
    expect(zP.zmianaISO, 'zmiana poprawki w zmianaISO').toBe(zmianaPoprawki);
    await sync(P, K);
    await rundy(P, K, C);
    for (const [nazwa, v] of [['P', P], ['K', K], ['C', C]]) {
      expect(await wersja(v, pid, sid), `${nazwa}: wersja usunięta`).toBeNull();
      expect(await wKoszu(v, sid), `${nazwa}: poprawka sprzed kosza nie unieważnia kosza`).toBeTruthy();
    }
  });

  // Fuzz v5 (X3, flota mieszana): wynikowy nagrobek retencji brał opis wersji z późniejszego wpisu kosza (stara treść),
  // więc starsza aplikacja z tym samym koszem go nie zdejmowała. Teraz opis z nagrobka, który unieważnił kosz.
  it('kosz unieważniony zmianą po koszu: nagrobek retencji ma opis wersji zmienionej po koszu (C←K, P←C)', async () => {
    sztucznyZegar();
    const { P, K, C, pid, sid } = await trzyUrzadzenia();
    przesunZegar(60e3);
    await poprawMase(C, pid, sid, 71);
    przesunZegar(60e3);
    await K.moveSnapshotToTrash(pid, sid);
    przesunZegar(60e3);
    await poprawMase(P, pid, sid, 74);
    const poKoszu = await wersja(P, pid, sid);
    przesunZegar(60e3);
    await P.pruneSnapshotsForPatient(pid, { recentHours: 0 });
    przesunZegar(60e3);
    await C.pruneSnapshotsForPatient(pid, { recentHours: 0 });
    await sync(K, C);
    await sync(C, P);
    const zP = ((await P.exportSyncPayload()).snapshotTombstones || []).find((x) => x.snapshotId === sid);
    expect(zP.powod, 'sam nagrobek retencji').toBe('retencja');
    expect({ rev: zP.rev, updatedAtISO: zP.updatedAtISO }, 'opis wersji zmienionej po koszu')
      .toEqual({ rev: poKoszu.rev, updatedAtISO: poKoszu.updatedAtISO });
    expect(await wKoszu(P, sid)).toBeNull();
  });

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
    const dolacz = czesc('function Bkz_dolacz(', 'async function Bkz_czytaj(');
    expect(dolacz).toContain('okN && okS ? (Bkz_nowszaWersja(starszy, nowszy) ? starszy : nowszy)');
    expect(dolacz).toContain('const okN = !!nowszy.payloadCipher && !Bkz_nieaktualny(nowszy, starszy);');
    expect(dolacz).toContain('const okS = !!starszy.payloadCipher && !Bkz_nieaktualny(starszy, nowszy);');
    expect(czesc('async function Bkz_scalStart(', 'function Bkz_przegral(')).toContain('!Bkz_nowszaWersja(e, lokalny)');
    expect(czesc('function Bkz_pomin(', 'async function Bkz_scalKoniec(')).toContain('Bkz_nowszaWersja(zapis, e)');
    expect(czesc('async function Bkz_scalKoniec(', 'async function Bkz_poImporcie(')).toContain('Bkz_nowszaWersja(lokalna, e)');
  });
});
