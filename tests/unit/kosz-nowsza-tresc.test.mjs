import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-KOSZ-NOWSZA-TRESC (decyzja właściciela D-6 B, 2026-10-20): zapis poprawiony (albo przypięty) na jednym urządzeniu
// i przeniesiony do kosza na drugim, zanim się zsynchronizowały. Usunięcie (późniejsze) wygrywa jak dotąd, ale w koszu
// obu urządzeń leży nowsza z dwóch treści, w każdej kolejności synchronizacji, więc „Przywróć” oddaje poprawkę. Od
// P-POZNIEJSZA-POPRAWKA (D-7 wariant 2, 2026-10-21) „nowsza” = późniejsza chwila zmiany, przy równej wyższa rev (dotąd:
// wyższa rev, przy równej późniejsza chwila) — ta sama reguła co dla wersji tej samej karty. Prawdziwy vilda_vault.js,
// dane fikcyjne.

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

  // Uwaga przeglądu #732: przy tej samej rev wygrywa późniejsza chwila zmiany (od P-POZNIEJSZA-POPRAWKA — pierwsza
  // część Bkz_nowszaWersja, niezależnie od rev).
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

  // P-KOSZ-POLKRATA (rekomendacja Q4 z cel.md — czeka na decyzję właściciela): P scala retencję C, zanim dostanie kosz
  // K. Nagrobek retencji (późniejszy niż poprawka) wygrywa z poprawką jak dotąd, ale treść poprawki zostaje lokalnie
  // w cieniu nagrobka (niewidoczna, nie w ładunku nagrobka retencji). Kosz K przychodzi potem i jest ważny (żadna
  // zmiana nie jest od niego późniejsza), więc bierze nowszą treść — z cienia. Dotąd (ograniczenie „P←C,P←K”): 23 kg.
  it('poprawka na P, kosz na K, retencja na C (P←C,P←K): kosz z poprawką, jak w pozostałych kolejnościach (cień treści)', async () => {
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
      expect((await wKoszu(v, sid)).payload.user.weight, `${nazwa}: kosz z poprawką`).toBe(99);
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

// P-POZNIEJSZA-POPRAWKA (decyzja właściciela D-7 wariant 2, 2026-10-21): treść kosza wybiera ta sama reguła co wersję
// tej samej karty — późniejsza chwila zmiany, przy równej wyższa rev. Kartę i kosz zmieniamy razem (ALGORITHMS E4):
// inaczej to, co trafia do kosza, zależy od tego, czy urządzenie najpierw scaliło kartę. Przypadki K1–K11 ze
// specyfikacji D-7 (8 kolejności pierwszych scaleń + 3 rundy na trzech urządzeniach).
describe('P-POZNIEJSZA-POPRAWKA: kosz i „Przywróć” liczą na tej samej osi czasu co karta', () => {
  const KOLEJNOSCI_8 = ['K←C,P←K', 'P←K,K←C', 'K←P,K←C', 'K←C,K←P', 'C←K,P←C', 'P←C,P←K', 'C←P,C←K', 'C←K,C←P'];
  const ola = (height, weight) => ({
    name: 'Testowa Ola',
    user: { lastName: 'Testowa', firstName: 'Ola', dobISO: '2017-05-01', sex: 'F', height, weight },
  });
  async function gdzieJest(v, sid) {
    for (const p of await v.listPatients()) {
      const s = (await v.getPatient(p.patientId)).snapshots.find((q) => q.snapshotId === sid);
      if (s) return { pid: p.patientId, s };
    }
    return null;
  }
  async function popraw(v, sid, kg) {
    const g = await gdzieJest(v, sid);
    await v.updateSnapshotPayload(g.pid, sid, { ...g.s.payload, user: { ...g.s.payload.user, weight: kg } }, { preserveSavedAt: true });
  }
  async function przypnij(v, sid, tak) { const g = await gdzieJest(v, sid); await v.setSnapshotPinned(g.pid, sid, tak); }
  async function doKosza(v, sid) { const g = await gdzieJest(v, sid); return v.moveSnapshotToTrash(g.pid, sid, { odepnij: true }); }
  async function przytnij(v, sid) {
    const g = await gdzieJest(v, sid);
    expect((await v.pruneSnapshotsForPatient(g.pid, { recentHours: 0 })).prunedIds, 'kontrola: retencja przycina zapis').toContain(sid);
  }
  async function stan(v, sid) {
    const g = await gdzieJest(v, sid);
    const k = await wKoszu(v, sid);
    return {
      karta: g ? { masa: g.s.payload.user.weight, pin: !!g.s.pinned } : null,
      kosz: k ? { masa: k.payload.user.weight, pin: !!k.pinned } : null,
    };
  }
  // E4: X (3 wersje), Y, Z na K; „Scal pacjentów” X → Y → Z na K podbija rev przeniesionych wersji do 2.
  async function trzyKarty() {
    const P = await urzadzenie(), K = await urzadzenie(), C = await urzadzenie();
    const x1 = await zapisz(K, jan(120, 20));
    const X = x1.patientId;
    const x2 = await zapisz(K, jan(125, 23), { patientId: X });
    await zapisz(K, jan(130, 25), { patientId: X });
    const Y = (await zapisz(K, ola(110, 18))).patientId;
    const Z = (await zapisz(K, ola(111, 19))).patientId;
    await sync(K, P); await sync(K, C);
    return { P, K, C, X, Y, Z, sid: x2.snapshotId };
  }
  async function przebieg(przygotuj, krok, kolejnosc) {
    sztucznyZegar();
    const u = await przygotuj();
    przesunZegar(60e3);
    await krok(u);
    await pierwszeScalenia(u, kolejnosc);
    await rundy(u.P, u.K, u.C);
    return { u, st: [await stan(u.P, u.sid), await stan(u.K, u.sid), await stan(u.C, u.sid)] };
  }
  const dwiePoprawkiPotemJedna = async ({ P, K, sid }) => {
    await popraw(P, sid, 77); przesunZegar(60e3); await popraw(P, sid, 78); przesunZegar(60e3); // P: rev 2, wcześniej
    await popraw(K, sid, 74); przesunZegar(60e3); // K: rev 1, najpóźniej
  };
  const SCEN = {
    'K1 dwie poprawki na P (rev 2), późniejsza na K (rev 1), kosz na C, które nic nie wie': [trzyUrzadzenia, async (u) => {
      await dwiePoprawkiPotemJedna(u); await doKosza(u.C, u.sid);
    }, { karta: null, kosz: { masa: 74, pin: false } }],
    'K2 jak K1, kosz na K': [trzyUrzadzenia, async (u) => {
      await dwiePoprawkiPotemJedna(u); await doKosza(u.K, u.sid);
    }, { karta: null, kosz: { masa: 74, pin: false } }],
    'K3 jak K1, K scala z P przed koszem': [trzyUrzadzenia, async (u) => {
      await dwiePoprawkiPotemJedna(u); await sync(u.P, u.K); przesunZegar(60e3); await doKosza(u.K, u.sid);
    }, { karta: null, kosz: { masa: 74, pin: false } }],
    'K4 dwie poprawki i kosz na P (78, rev 2), poprawka na C po koszu (74, rev 1), kosz na K później': [trzyUrzadzenia, async ({ P, K, C, sid }) => {
      await popraw(P, sid, 77); przesunZegar(60e3); await popraw(P, sid, 78); przesunZegar(60e3);
      await doKosza(P, sid); przesunZegar(60e3); await popraw(C, sid, 74); przesunZegar(60e3); await doKosza(K, sid);
    }, { karta: null, kosz: { masa: 74, pin: false } }],
    'K8 zegar K +10 min: K poprawia (74), P przyjmuje i poprawia na niej (77), C daje do kosza 20 min później': [trzyUrzadzenia, async ({ P, K, C, sid }) => {
      vi.setSystemTime(zegar + 10 * 60e3); await popraw(K, sid, 74); vi.setSystemTime(zegar);
      await sync(K, P); przesunZegar(60e3); await popraw(P, sid, 77);
      przesunZegar(20 * 60e3); await doKosza(C, sid);
    }, { karta: null, kosz: { masa: 77, pin: false } }],
    'K8b jak K8, bez kosza': [trzyUrzadzenia, async ({ P, K, sid }) => {
      vi.setSystemTime(zegar + 10 * 60e3); await popraw(K, sid, 74); vi.setSystemTime(zegar);
      await sync(K, P); przesunZegar(60e3); await popraw(P, sid, 77);
    }, { karta: { masa: 77, pin: false }, kosz: null }],
    // K9 — P-PRZYPIETA-POLKRATA (S4 krok 2, W3, decyzja właściciela D1 = C): PD-12 dla gwiazdki — późniejsza gwiazdka P
    // nie kasuje wcześniejszych poprawek C; karta 58 kg z gwiazdką (rekord złożony). Dotąd (LWW całej wersji): 23 kg
    // z gwiazdką, poprawki C przepadały.
    'K9 dwie poprawki na C (rev 2) przed późniejszą gwiazdką na P (rev 1), retencja na K': [trzyUrzadzenia, async ({ P, K, C, sid }) => {
      await popraw(C, sid, 57); przesunZegar(60e3); await popraw(C, sid, 58); przesunZegar(60e3);
      await przypnij(P, sid, true); przesunZegar(60e3); await przytnij(K, sid);
    }, { karta: { masa: 58, pin: true }, kosz: null }],
  };
  for (const [nazwa, [przygotuj, krok, oczekiwany]] of Object.entries(SCEN)) {
    for (const kolejnosc of KOLEJNOSCI_8) {
      it(`${nazwa} (${kolejnosc})`, async () => {
        const { st } = await przebieg(przygotuj, krok, kolejnosc);
        for (const [i, n] of ['P', 'K', 'C'].entries()) expect(st[i], n).toEqual(oczekiwany);
      });
    }
  }

  for (const kolejnosc of KOLEJNOSCI_8) {
    // P-KOSZ-PO-KLUCZU (E3): wpis kosza x (pod Z) znajduje x pod starą X po snapshotId — x znika z X, a pusta X (bez
    // innych wersji niż te, które przegrały) razem z nią; nagrobki X i Y na trzech. Dotąd (8240e0df) na P zostawała karta
    // X z x 74 obok kosza 74.
    it(`K5 (E4b) „Scal pacjentów” X → Y → Z na K, P (bez wiedzy) poprawia x w starej X, K później daje x do kosza (${kolejnosc}): w koszu poprawka, x w żadnej karcie, karty X nie ma`, async () => {
      const { u, st } = await przebieg(trzyKarty, async ({ P, K, X, Y, Z, sid }) => {
        await K.mergePatients(X, Y); przesunZegar(60e3); await K.mergePatients(Y, Z); przesunZegar(60e3);
        await popraw(P, sid, 74); przesunZegar(60e3);
        await doKosza(K, sid);
      }, kolejnosc);
      for (const [i, n] of ['P', 'K', 'C'].entries()) {
        const v = u[n];
        const nagrobki = ((await v.exportSyncPayload()).tombstones || []).map((t) => t.patientId);
        expect({ ...st[i], kartaX: !!(await v.getPatient(u.X)), nagrobekX: nagrobki.includes(u.X), nagrobekY: nagrobki.includes(u.Y) },
          `${n}: kosz z poprawką, x w żadnej karcie, bez karty X`)
          .toEqual({ karta: null, kosz: { masa: 74, pin: false }, kartaX: false, nagrobekX: true, nagrobekY: true });
      }
    });
    // K6 (E4a) — P-KOSZ-USUWANEJ-KARTY (decyzja właściciela D6 = a, Q7): wersje karty X, która przegrywa z nagrobkiem
    // pacjenta, przechodzą decyzję kosza, więc w koszu poprawka. Dotąd (znane ograniczenie PD-16) kosz 23 na trzech.
    it(`K6 (E4a) poprawka PRZED scaleniami, potem kosz na K (${kolejnosc}): w koszu poprawka`, async () => {
      const { st } = await przebieg(trzyKarty, async ({ P, K, X, Y, Z, sid }) => {
        await popraw(P, sid, 74); przesunZegar(60e3);
        await K.mergePatients(X, Y); przesunZegar(60e3); await K.mergePatients(Y, Z); przesunZegar(60e3);
        await doKosza(K, sid);
      }, kolejnosc);
      for (const [i, n] of ['P', 'K', 'C'].entries()) expect(st[i], `${n}: kosz z poprawką, x w żadnej karcie`).toEqual({ karta: null, kosz: { masa: 74, pin: false } });
    });
  }

  for (const kolejnosc of KOLEJNOSCI_8) {
    it(`K7 „Przywróć” na P: ta sama wersja w karcie (78, rev 2, wcześniej) i w koszu (74, rev 1, później) (${kolejnosc}): wraca 74 z rev 3, zbieżnie`, async () => {
      const przygotuj = async () => {
        const P = await urzadzenie(), K = await urzadzenie(), C = await urzadzenie();
        const s1 = await zapisz(K, jan(120, 20));
        const s2 = await zapisz(K, jan(125, 23), { patientId: s1.patientId });
        await sync(K, P); await sync(K, C);
        return { P, K, C, pid: s1.patientId, sid: s2.snapshotId, s1: s1.snapshotId };
      };
      const { u } = await przebieg(przygotuj, async ({ P, K, sid, s1 }) => {
        await popraw(P, sid, 77); przesunZegar(60e3); await popraw(P, sid, 78); przesunZegar(60e3);
        await doKosza(P, s1); przesunZegar(60e3); // P: kosz nie zdejmuje ostatniej wersji karty
        await popraw(K, sid, 74); przesunZegar(60e3); await doKosza(K, sid); przesunZegar(60e3);
      }, kolejnosc);
      const przed = await stan(u.P, u.sid);
      expect(przed.karta && przed.kosz, 'kontrola: na P zapis w karcie i w koszu').toBeTruthy();
      expect(przed.kosz.masa, 'kontrola: kosz trzyma późniejszą poprawkę').toBe(74);
      przesunZegar(60e3);
      const wynik = await u.P.restoreTrashedSnapshot(u.pid, u.sid);
      expect(wynik.alreadyInCard, 'treść kosza jest nowsza — przywracamy').toBeUndefined();
      const naP = await wersja(u.P, u.pid, u.sid);
      expect({ masa: naP.payload.user.weight, rev: naP.rev }).toEqual({ masa: 74, rev: 3 });
      await rundy(u.P, u.K, u.C);
      for (const [n, v] of [['P', u.P], ['K', u.K], ['C', u.C]]) expect(await stan(v, u.sid), n).toEqual({ karta: { masa: 74, pin: false }, kosz: null });
    });
  }

  // K10 (S6b) — P-PRZYPIETA-POLKRATA, S4 krok 2 (W3, decyzja właściciela D1 = C „gwiazdka z własną datą”): gwiazdka,
  // odpięcie i gwiazdka na P (rev 3), potem późniejsza poprawka masy na C (rev 1, bez wiedzy o gwiazdce), retencja na K.
  // Gwiazdka P (rejestr z chwilą ostatniego przypięcia) i poprawka C to osobne składniki: karta 58 kg z gwiazdką w 8 z 8
  // kolejności (rekord złożony). W kroku 1 (B2): 7 × 23 kg z gwiazdką (poprawka przepadała), 1 × brak (P←C,P←K); na
  // 1d6be72e: 4 × karta bez gwiazdki, 3 × przypięta, 1 × brak; na 54a84da3: 8 × przypięta.
  for (const kolejnosc of KOLEJNOSCI_8) {
    it(`K10 (S6b, W3) gwiazdka/odpięcie/gwiazdka na P (rev 3), późniejsza poprawka na C, retencja na K (${kolejnosc}): 58 kg z gwiazdką`, async () => {
      const { st } = await przebieg(trzyUrzadzenia, async ({ P, K, C, sid }) => {
        await przypnij(P, sid, true); przesunZegar(60e3); await przypnij(P, sid, false); przesunZegar(60e3);
        await przypnij(P, sid, true); przesunZegar(60e3); await popraw(C, sid, 58); przesunZegar(60e3); await przytnij(K, sid);
      }, kolejnosc);
      for (const [i, n] of ['P', 'K', 'C'].entries()) expect(st[i], n).toEqual({ karta: { masa: 58, pin: true }, kosz: null });
    });
  }

  // P-REV-MAX (PD-7 b): rev treści nagrobka = wyższa z łączonej pary, jak w starszych aplikacjach (tam treść z wyższą
  // rev). Treść bez zmian (K1: 74 kg), rev nie zależy od kolejności scaleń.
  for (const kolejnosc of KOLEJNOSCI_8) {
    it(`K1r jak K1 (${kolejnosc}): w koszu 74 kg z rev 2 (wyższa z pary, P-REV-MAX) na trzech`, async () => {
      const { u } = await przebieg(trzyUrzadzenia, async (x) => { await dwiePoprawkiPotemJedna(x); await doKosza(x.C, x.sid); }, kolejnosc);
      for (const [n, v] of [['P', u.P], ['K', u.K], ['C', u.C]]) {
        const e = await nagrobek(v, u.sid);
        expect({ masa: e && e.payload && e.payload.user.weight, rev: e && e.rev }, n).toEqual({ masa: 74, rev: 2 });
      }
    });
  }

  it('K11 A: dwie poprawki masy (27 kg, rev 2), B: późniejsza poprawka wzrostu (127 cm, rev 1); kosz na A, potem „Przywróć”: kosz i przywrócenie 127/24, rev 3 (wyższa z dwóch 2, + 1)', async () => {
    sztucznyZegar();
    const { P: B, K: A, pid, sid } = await dwaUrzadzenia();
    przesunZegar(60e3); await poprawMase(A, pid, sid, 25);
    przesunZegar(60e3); await poprawMase(A, pid, sid, 27);
    przesunZegar(4 * 60e3);
    const w = await wersja(B, pid, sid);
    await B.updateSnapshotPayload(pid, sid, { ...w.payload, user: { ...w.payload.user, height: 127 } }, { preserveSavedAt: true });
    przesunZegar(2 * 60e3);
    await A.moveSnapshotToTrash(pid, sid);
    await wymiana(A, B, 'P-pierwszy');
    for (const [n, v] of [['A', A], ['B', B]]) {
      const k = await wKoszu(v, sid);
      expect(`${k.payload.user.height}/${k.payload.user.weight}`, `${n}: kosz`).toBe('127/24');
    }
    przesunZegar(60e3);
    await A.restoreTrashedSnapshot(pid, sid);
    const po = await wersja(A, pid, sid);
    expect({ tresc: `${po.payload.user.height}/${po.payload.user.weight}`, rev: po.rev }).toEqual({ tresc: '127/24', rev: 3 });
  });
});

describe('strażnik źródła', () => {
  const src = readFileSync(path.join(repoRoot, 'vilda_vault.js'), 'utf8');
  // P-KOSZ-POLKRATA: rev wpisu kosza = najwyższa z rev treści, par (chwila usunięcia, rev) treści wpisów kosza, które
  // kosz może trzymać (Bpk_tr: bez treści unieważnionych zmianą po ich usunięciu), i rev wersji pokonanych w scalaniu
  // (wr, para z chwilą kosza — D6); nagrobek retencji rev do kosza nie dokłada.
  it('P-REV-MAX (PD-7 b): rev treści kosza = wyższa z pary w łączeniu nagrobków, w Bkz_pomin i w Bkz_scalKoniec', () => {
    const czesc = (od, doo) => src.slice(src.indexOf(od), src.indexOf(doo));
    expect(czesc('function Bpk_tr(', 'function Bpk_dl(')).toContain("if (!x || typeof x.od !== 'string' || !(x.od >= (z || ''))) continue;");
    const wpis = czesc('function Bpk_wpis(', 'function Bkz_dolacz(');
    expect(wpis).toContain('const tr = Bpk_wr(pk) >= 0 ? Bpk_tr((pk.tr || []).concat([{ od: pk.k, rev: Bpk_wr(pk) }]), pk.z) : (pk.tr || []);');
    expect(wpis).toContain('e.rev = tr.reduce(function (m, x) { return Math.max(m, x.rev); }, e.rev);');
    expect(czesc('function Bpk_zWersji(', 'function Bpk_polacz(')).toContain('tr: [], wr: tresc ? mt(w) : -1,');
    expect(czesc('function Bpk_polacz(', 'function Bpk_wazny(')).toContain('wr: Math.max(Bpk_wr(a), Bpk_wr(c)),');
    expect(czesc('function Bkz_pomin(', 'async function Bkz_scalKoniec(')).toContain('Bpk_zWersja(e, Bpk_zWersji(zapis, { c: null, od: od }, st))');
    expect(czesc('async function Bkz_scalKoniec(', 'async function Bkz_poImporcie(')).toContain('Bpk_zWersja(e, Bpk_zWersji(lokalna, { c: szyfr, od: od }, st))');
  });
  it('jedna reguła „nowsza wersja” w łączeniu nagrobków, w treści z ładunku, w pętli wersji i na końcu scalania', () => {
    expect(src).toContain('function Bkz_nowszaWersja(x, y) {');
    const czesc = (od, doo) => src.slice(src.indexOf(od), src.indexOf(doo));
    // P-KOSZ-POLKRATA: porządek liniowy Bpk_nowszy = Bkz_nowszaWersja, przy pełnym remisie chwila zapisu.
    expect(czesc('function Bpk_nowszy(', 'function Bpk_trescLepsza(')).toContain('if (Bkz_nowszaWersja(x, y)) return true;');
    // P-PRZYPIETA-POLKRATA (W3): treść kosza i cienia — najpierw późniejsza chwila treści, przy równej ta sama reguła wersji.
    expect(czesc('function Bpk_trescNowsza(', 'function Bpk_trescLepsza(')).toContain('return x !== y ? x > y : Bpk_nowszy(a.o, b.o);');
    expect(czesc('function Bpk_trescLepsza(', 'function Bpk_tr(')).toContain('if (Bpk_trescNowsza(b, a)) return b;');
    expect(czesc('function Bkz_dolacz(', 'async function Bkz_czytaj(')).toContain('Bpk_polacz(Bpk_zWpisu(byl), Bpk_zWpisu(e))');
    expect(czesc('async function Bkz_scalStart(', 'function Bkz_przegral(')).toContain('Bpk_nowszaTrescKosza(Bgw_t, tl)');
    expect(czesc('function Bpk_nowszaTrescKosza(', 'function Bpk_trescLepsza(')).toContain('return Bpk_trescNowsza(t, tl) && mt(t.o) === mt(tl.o);');
    expect(czesc('function Bkz_pomin(', 'async function Bkz_scalKoniec(')).toContain('Bpk_trescNowsza({ o: Bpk_opis(zapis), cz: st.cz }, { o: Bpk_opis(byla.zapis), cz: byla.st.cz })');
    expect(czesc('async function Bkz_scalKoniec(', 'async function Bkz_poImporcie(')).toContain('!Bpk_trescNowsza({ o: o, cz: x.st.cz }, pk.t)');
  });
  it('P-POZNIEJSZA-POPRAWKA: „nowsza” = późniejsza chwila zmiany, przy równej wyższa rev; opis nagrobka tą samą regułą', () => {
    const czesc = (od, doo) => src.slice(src.indexOf(od), src.indexOf(doo));
    const regula = czesc('function Bkz_nowszaWersja(x, y) {', 'function Bkz_chwilaKosza(');
    expect(regula).toContain('const zx = Bkz_zmiana(x), zy = Bkz_zmiana(y);');
    expect(regula).toContain('if (zx !== zy) return zx > zy;');
    expect(regula).toContain('return mt(x) > mt(y);');
    expect(czesc('function Bpk_dl(', 'function Bpk_karta(')).toContain('return Bpk_nowszy(c.d, a.d) ? c : a;');
  });
});
