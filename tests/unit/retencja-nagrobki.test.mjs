import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-RETENCJA-NAGROBKI (decyzja właściciela 2026-09-30). Retencja przerzedza starsze wersje karty (od 10 wersji:
// ostatnie 24 h, ostatnia wersja z dnia do 30 dni, potem z miesiąca). Dotąd przycinała tylko na jednym urządzeniu,
// a synchronizacja przywracała przycięte wersje. Teraz stawia nagrobek bez treści (nie trafia do kosza).
// Testy zachowaniowe: prawdziwy vilda_vault.js i vilda_retention.js, dwa urządzenia wymieniające ładunek
// exportSyncPayload → mergeSyncPayload (to samo, co robi vilda_sync.js). Dane fikcyjne.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DZIEN = 864e5;
const GODZINA = 36e5;

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

let licznik = 0;
const okna = new WeakMap();
const adaptery = new WeakMap();

// Retencja startuje sama po zapisie (od 10 wersji). Na czas budowania historii ją wyłączamy, żeby test
// przycinał jawnie, w wybranej chwili; `automat: true` zostawia ją włączoną.
async function urzadzenie({ automat = false } = {}) {
  licznik += 1;
  const win = {
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis),
    clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {},
    removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  if (!automat) win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_retention.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  const pamiec = v.createInMemoryAdapter();
  v.setStorageAdapter(pamiec);
  okna.set(v, win);
  adaptery.set(v, pamiec);
  await v.createUser(`Retencja#Nagrobki!2026${licznik}aa`, { label: `dev${licznik}`, iterations: 10000 });
  return v;
}

let zegar;
function sztucznyZegar() {
  zegar = Date.parse('2026-09-01T08:00:00Z');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(zegar);
}
function ustawZegar(ms) {
  zegar = ms;
  vi.setSystemTime(zegar);
}
function przesunZegar(ms) {
  ustawZegar(zegar + ms);
}

afterEach(() => { vi.useRealTimers(); });

const ZOFIA = {
  name: 'Testowa Zofia',
  user: { lastName: 'Testowa', firstName: 'Zofia', dobISO: '2015-04-20', sex: 'F', height: 128, weight: 26 },
};

// Historia karty: dni 1–3 po trzy zapisy (8:00, 9:00, 10:00), dzień 4 dwa zapisy — razem 11 wersji.
// Dziesięć dni później retencja zostawia ostatni zapis każdego dnia (4 wersje) i przycina 7.
async function kartaZHistoria(v) {
  const start = Date.parse('2026-09-01T08:00:00Z');
  const ids = [];
  let patientId = null;
  const plan = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2], [3, 0], [3, 1]];
  for (const [dzien, godzina] of plan) {
    ustawZegar(start + dzien * DZIEN + godzina * GODZINA);
    const z = await v.savePatient(ZOFIA, { dedup: false, ...(patientId ? { patientId } : {}) });
    patientId = z.patientId;
    ids.push(z.snapshotId);
  }
  const zostaja = [ids[2], ids[5], ids[8], ids[10]];
  const przyciete = ids.filter((id) => !zostaja.includes(id));
  return { patientId, ids, zostaja, przyciete };
}

const DZIEN_PRZYCIECIA = Date.parse('2026-09-11T12:00:00Z');
const idWersji = async (v, pid) => (await v.getPatient(pid)).snapshots.map((s) => s.snapshotId).sort();
const posortowane = (a) => a.slice().sort();

describe('retencja stawia nagrobki bez treści', () => {
  it('przycięte wersje: nagrobki z powodem „retencja”, bez treści, poza koszem, w ładunku synchronizacji', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const { patientId, zostaja, przyciete } = await kartaZHistoria(A);

    ustawZegar(DZIEN_PRZYCIECIA);
    const wynik = await A.pruneSnapshotsForPatient(patientId);
    expect(wynik.prunedCount).toBe(7);
    expect(posortowane(wynik.prunedIds)).toEqual(posortowane(przyciete));
    expect(await idWersji(A, patientId)).toEqual(posortowane(zostaja));
    expect((await A.getPatient(patientId)).snapshotCount, 'nagłówek karty zna nową liczbę wersji').toBe(4);

    expect(await A.listTrashedSnapshots(), 'retencja nie zapełnia kosza').toEqual([]);
    const nagrobki = (await A.exportSyncPayload()).snapshotTombstones;
    expect(posortowane(nagrobki.map((n) => n.snapshotId))).toEqual(posortowane(przyciete));
    nagrobki.forEach((n) => {
      expect(n).toMatchObject({ patientId, powod: 'retencja', deletedAtISO: new Date(DZIEN_PRZYCIECIA).toISOString() });
      expect(n.payload, 'bez treści').toBeUndefined();
    });
  });

  it('automatyczna retencja po zapisie też stawia nagrobki', async () => {
    sztucznyZegar();
    const A = await urzadzenie({ automat: true });
    okna.get(A).localStorage.setItem('vildaRetention', '0');
    const { patientId, przyciete } = await kartaZHistoria(A);
    okna.get(A).localStorage.removeItem('vildaRetention');

    ustawZegar(DZIEN_PRZYCIECIA);
    await A.savePatient(ZOFIA, { dedup: false, patientId }); // 12. wersja uruchamia retencję w tle
    // Retencja biegnie w tle; nagrobki powstają przed usunięciem, więc czekamy na oba skutki.
    let nagrobki = [];
    let liczbaWersji = 12;
    for (let i = 0; i < 400 && (nagrobki.length < przyciete.length || liczbaWersji > 5); i += 1) {
      await new Promise((r) => { setTimeout(r, 5); });
      nagrobki = (await A.exportSyncPayload()).snapshotTombstones;
      liczbaWersji = (await A.getPatient(patientId)).snapshots.length;
    }
    expect(posortowane(nagrobki.map((n) => n.snapshotId))).toEqual(posortowane(przyciete));
    expect(nagrobki.every((n) => n.powod === 'retencja')).toBe(true);
    expect(liczbaWersji).toBe(5);
  });

  it('wersja przypięta między planem a usunięciem zostaje (plan poza blokadą, sprawdzenie pod nią)', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const { patientId, zostaja, przyciete } = await kartaZHistoria(A);
    const przypieta = przyciete[2];
    const pamiec = adaptery.get(A);
    const oryginal = pamiec.listSnapshotsForUser;
    let wywolania = 0;
    let wTrakcie = false;
    // 1. odczyt: plan (getPatient); 2. odczyt: już pod blokadą pacjenta. Między nimi ktoś przypina wersję z planu.
    pamiec.listSnapshotsForUser = async function (...x) {
      if (!wTrakcie) {
        wywolania += 1;
        if (wywolania === 2) {
          wTrakcie = true;
          await A.setSnapshotPinned(patientId, przypieta, true);
          wTrakcie = false;
        }
      }
      return oryginal.apply(this, x);
    };
    ustawZegar(DZIEN_PRZYCIECIA);
    let wynik;
    try {
      wynik = await A.pruneSnapshotsForPatient(patientId);
    } finally {
      pamiec.listSnapshotsForUser = oryginal;
    }
    expect(wynik.prunedCount).toBe(6);
    expect(wynik.prunedIds).not.toContain(przypieta);
    const karta = await A.getPatient(patientId);
    expect(karta.snapshots.map((s) => s.snapshotId).sort()).toEqual(posortowane([...zostaja, przypieta]));
    expect(karta.snapshots.find((s) => s.snapshotId === przypieta).pinned).toBe(true);
    expect((await A.exportSyncPayload()).snapshotTombstones.map((n) => n.snapshotId)).not.toContain(przypieta);
  });

  it('gdy między planem a usunięciem zniknęła wersja, którą plan zostawia, retencja nic nie usuwa', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const { patientId, ids, zostaja } = await kartaZHistoria(A);
    const pamiec = adaptery.get(A);
    const oryginal = pamiec.listSnapshotsForUser;
    let wywolania = 0;
    let wTrakcie = false;
    // Jak scalanie z nagrobkiem z innego urządzenia: ostatnia wersja dnia 1 znika bez blokady pacjenta.
    pamiec.listSnapshotsForUser = async function (...x) {
      if (!wTrakcie) {
        wywolania += 1;
        if (wywolania === 2) {
          wTrakcie = true;
          await A.deleteSnapshot(patientId, zostaja[0]);
          wTrakcie = false;
        }
      }
      return oryginal.apply(this, x);
    };
    ustawZegar(DZIEN_PRZYCIECIA);
    let wynik;
    try {
      wynik = await A.pruneSnapshotsForPatient(patientId);
    } finally {
      pamiec.listSnapshotsForUser = oryginal;
    }
    expect(wynik).toMatchObject({ prunedCount: 0, skipped: 'plan-nieaktualny' });
    expect(await idWersji(A, patientId)).toEqual(posortowane(ids.filter((id) => id !== zostaja[0])));
    expect((await A.exportSyncPayload()).snapshotTombstones).toEqual([]);
  });

  it('wersja usunięta w trakcie przez scalanie (bez blokady pacjenta): jej nagrobek zostaje', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const { patientId, ids, zostaja, przyciete } = await kartaZHistoria(A);
    const pierwsza = ids[9]; // retencja usuwa od najnowszej: dzień 4, 8:00
    const pamiec = adaptery.get(A);
    const oryginal = pamiec.listSnapshotsForUser;
    let wywolania = 0;
    let wTrakcie = false;
    // 1. odczyt: plan; 2.: pod blokadą; 3.: deleteSnapshot pierwszej wersji — tuż przed nim wersję usuwa „scalanie”.
    pamiec.listSnapshotsForUser = async function (...x) {
      if (!wTrakcie) {
        wywolania += 1;
        if (wywolania === 3) {
          wTrakcie = true;
          await A.deleteSnapshot(patientId, pierwsza);
          wTrakcie = false;
        }
      }
      return oryginal.apply(this, x);
    };
    ustawZegar(DZIEN_PRZYCIECIA);
    let wynik;
    try {
      wynik = await A.pruneSnapshotsForPatient(patientId);
    } finally {
      pamiec.listSnapshotsForUser = oryginal;
    }
    expect(wynik.prunedCount).toBe(6);
    expect(wynik.prunedIds).not.toContain(pierwsza);
    expect(await idWersji(A, patientId)).toEqual(posortowane(zostaja));
    expect(posortowane((await A.exportSyncPayload()).snapshotTombstones.map((n) => n.snapshotId)), 'nagrobek usuniętej wersji zostaje')
      .toEqual(posortowane(przyciete));
  });

  it('dwa równoległe przycięcia: każda wersja usunięta raz, żaden nagrobek nie ginie', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const { patientId, zostaja, przyciete } = await kartaZHistoria(A);
    ustawZegar(DZIEN_PRZYCIECIA);
    const [w1, w2] = await Promise.all([A.pruneSnapshotsForPatient(patientId), A.pruneSnapshotsForPatient(patientId)]);
    expect(w1.prunedCount + w2.prunedCount).toBe(7);
    expect(posortowane([...w1.prunedIds, ...w2.prunedIds])).toEqual(posortowane(przyciete));
    expect(await idWersji(A, patientId)).toEqual(posortowane(zostaja));
    expect(posortowane((await A.exportSyncPayload()).snapshotTombstones.map((n) => n.snapshotId))).toEqual(posortowane(przyciete));
  });

  it('bez zapisanych nagrobków retencja niczego nie usuwa (spróbuje przy następnym zapisie)', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const { patientId, ids } = await kartaZHistoria(A);
    const pamiec = adaptery.get(A);
    const oryginal = pamiec.putUserMeta;
    pamiec.putUserMeta = async () => { throw new Error('Fikcyjna awaria zapisu metadanych'); };
    ustawZegar(DZIEN_PRZYCIECIA);
    try {
      const wynik = await A.pruneSnapshotsForPatient(patientId);
      expect(wynik).toMatchObject({ prunedCount: 0, skipped: 'nagrobki' });
    } finally {
      pamiec.putUserMeta = oryginal;
    }
    expect(await idWersji(A, patientId)).toEqual(posortowane(ids));
  });
});

describe('retencja w synchronizacji (dwa urządzenia)', () => {
  it('A przycina: stary ładunek B nie wskrzesza wersji na A, a B usuwa te same wersje, choć sam retencję ma wyłączoną', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const B = await urzadzenie(); // vildaRetention="0" — B sam nie przycina
    const { patientId, ids, zostaja } = await kartaZHistoria(A);
    await B.mergeSyncPayload(await A.exportSyncPayload());
    expect(await idWersji(B, patientId)).toEqual(posortowane(ids));
    const staryLadunekB = await B.exportSyncPayload();

    ustawZegar(DZIEN_PRZYCIECIA);
    await A.pruneSnapshotsForPatient(patientId);
    await A.mergeSyncPayload(staryLadunekB);
    expect(await idWersji(A, patientId), 'A: przycięte nie wracają').toEqual(posortowane(zostaja));

    przesunZegar(GODZINA);
    const wynik = await B.mergeSyncPayload(await A.exportSyncPayload());
    expect(wynik.prunedSnapshotCount).toBe(7);
    expect(wynik.trashedSnapshotCount, 'to nie jest kosz').toBe(0);
    expect(await idWersji(B, patientId), 'B: te same wersje co A').toEqual(posortowane(zostaja));
    expect((await B.getPatient(patientId)).snapshotCount).toBe(4);
    expect(await B.listTrashedSnapshots(), 'B: nagrobek retencji nie wciąga treści do kosza').toEqual([]);
  });

  it('wersja przypięta na B, zanim A ją przyciął, zostaje na obu urządzeniach', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const B = await urzadzenie();
    const { patientId, zostaja, przyciete } = await kartaZHistoria(A);
    await B.mergeSyncPayload(await A.exportSyncPayload());
    const przypieta = przyciete[0];

    ustawZegar(DZIEN_PRZYCIECIA - GODZINA);
    await B.setSnapshotPinned(patientId, przypieta, true); // A jeszcze o tym nie wie
    ustawZegar(DZIEN_PRZYCIECIA);
    await A.pruneSnapshotsForPatient(patientId);

    przesunZegar(GODZINA);
    await B.mergeSyncPayload(await A.exportSyncPayload());
    expect(await idWersji(B, patientId), 'B: przypięta zostaje, reszta przycięta').toEqual(posortowane([...zostaja, przypieta]));

    await A.mergeSyncPayload(await B.exportSyncPayload());
    const kartaA = await A.getPatient(patientId);
    expect(kartaA.snapshots.map((s) => s.snapshotId).sort(), 'A: przypięta wraca').toEqual(posortowane([...zostaja, przypieta]));
    expect(kartaA.snapshots.find((s) => s.snapshotId === przypieta).pinned).toBe(true);
    for (const v of [A, B]) {
      const nagrobki = (await v.exportSyncPayload()).snapshotTombstones.map((n) => n.snapshotId);
      expect(nagrobki, 'nagrobek przypiętej zniknął').not.toContain(przypieta);
      expect(nagrobki).toHaveLength(6);
    }
  });

  it('wersja zmieniona po przycięciu (poprawka na B) wygrywa z nagrobkiem retencji', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const B = await urzadzenie();
    const { patientId, zostaja, przyciete } = await kartaZHistoria(A);
    await B.mergeSyncPayload(await A.exportSyncPayload());
    const poprawiona = przyciete[1];

    ustawZegar(DZIEN_PRZYCIECIA);
    await A.pruneSnapshotsForPatient(patientId);
    przesunZegar(GODZINA);
    const tresc = (await B.getPatient(patientId)).snapshots.find((s) => s.snapshotId === poprawiona).payload;
    await B.updateSnapshotPayload(patientId, poprawiona, { ...tresc, user: { ...tresc.user, weight: 26.4 } }, { preserveSavedAt: true });

    przesunZegar(GODZINA);
    await B.mergeSyncPayload(await A.exportSyncPayload());
    expect(await idWersji(B, patientId)).toEqual(posortowane([...zostaja, poprawiona]));
    await A.mergeSyncPayload(await B.exportSyncPayload());
    expect(await idWersji(A, patientId), 'A: poprawiona wraca').toEqual(posortowane([...zostaja, poprawiona]));
  });

  it('ta sama wersja w koszu na A i przycięta później na B: wpis z treścią zostaje w koszu na obu', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const B = await urzadzenie();
    const { patientId, przyciete } = await kartaZHistoria(A);
    await B.mergeSyncPayload(await A.exportSyncPayload());
    const wersja = przyciete[0];

    ustawZegar(DZIEN_PRZYCIECIA);
    await A.moveSnapshotToTrash(patientId, wersja);
    przesunZegar(GODZINA);
    await B.pruneSnapshotsForPatient(patientId); // późniejsze usunięcie, bez treści

    przesunZegar(GODZINA);
    await A.mergeSyncPayload(await B.exportSyncPayload());
    await B.mergeSyncPayload(await A.exportSyncPayload());
    for (const v of [A, B]) {
      const kosz = await v.listTrashedSnapshots();
      expect(kosz.map((k) => k.snapshotId)).toEqual([wersja]);
      expect(kosz[0].payload.name).toBe('Testowa Zofia');
      const nagrobek = (await v.exportSyncPayload()).snapshotTombstones.find((n) => n.snapshotId === wersja);
      expect(nagrobek.powod, 'wpis z treścią to kosz, nie retencja').toBeUndefined();
    }
  });

  it('stara treść z kosza nie łączy się z późniejszym przycięciem innej wersji (przywrócona i poprawiona)', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const C = await urzadzenie();
    const { patientId, przyciete } = await kartaZHistoria(A);
    await C.mergeSyncPayload(await A.exportSyncPayload());
    const wersja = przyciete[0];

    ustawZegar(DZIEN_PRZYCIECIA - 3 * GODZINA);
    await A.moveSnapshotToTrash(patientId, wersja);
    przesunZegar(GODZINA / 2);
    await C.mergeSyncPayload(await A.exportSyncPayload()); // C: wersja w koszu, stara treść
    expect((await C.listTrashedSnapshots()).map((k) => k.snapshotId)).toEqual([wersja]);

    przesunZegar(GODZINA / 2);
    await A.restoreTrashedSnapshot(patientId, wersja);
    przesunZegar(GODZINA / 2);
    const tresc = (await A.getPatient(patientId)).snapshots.find((s) => s.snapshotId === wersja).payload;
    await A.updateSnapshotPayload(patientId, wersja, { ...tresc, user: { ...tresc.user, weight: 26.8 } }, { preserveSavedAt: true });
    ustawZegar(DZIEN_PRZYCIECIA);
    await A.pruneSnapshotsForPatient(patientId); // C jest offline i nic o tym nie wie

    przesunZegar(GODZINA);
    await C.mergeSyncPayload(await A.exportSyncPayload());
    expect(await C.listTrashedSnapshots(), 'C: nieaktualna treść nie wraca do kosza').toEqual([]);
    const nagrobek = (await C.exportSyncPayload()).snapshotTombstones.find((n) => n.snapshotId === wersja);
    expect(nagrobek).toMatchObject({ powod: 'retencja' });
    expect(nagrobek.payload).toBeUndefined();
  });

  it('jawny import karty sprzed przycięcia przywraca wersje, a nagrobki z innego urządzenia ich nie usuwają', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const B = await urzadzenie();
    const { patientId, ids } = await kartaZHistoria(A);
    await B.mergeSyncPayload(await A.exportSyncPayload());
    const plik = await A.exportPatientEnvelope(patientId);

    ustawZegar(DZIEN_PRZYCIECIA);
    await A.pruneSnapshotsForPatient(patientId);
    await B.mergeSyncPayload(await A.exportSyncPayload()); // B też ma nagrobki

    przesunZegar(GODZINA);
    const imp = await A.importPatientFromEnvelope(plik);
    expect(imp.addedSnapshots).toBe(7);
    expect(await idWersji(A, patientId)).toEqual(posortowane(ids));
    expect((await A.exportSyncPayload()).snapshotTombstones).toEqual([]);

    await A.mergeSyncPayload(await B.exportSyncPayload());
    expect(await idWersji(A, patientId), 'import wygrywa z nagrobkami sprzed importu').toEqual(posortowane(ids));
  });
});

describe('strażniki źródła', () => {
  const src = readFileSync(path.join(repoRoot, 'vilda_vault.js'), 'utf8');
  const blok = src.slice(src.indexOf('async function Bkz_przytnij('), src.indexOf('function yr('));

  it('plan poza blokadą; sprawdzenie planu, nagrobki i usuwanie pod blokadą pacjenta, nagrobki przed usunięciem', () => {
    expect(blok).toContain("return Ap('pat:' + patientId, async function () {");
    expect(blok.indexOf('await ct(patientId)'), 'odczyt wszystkich wersji przed blokadą').toBeLessThan(blok.indexOf("return Ap('pat:'"));
    expect(blok.indexOf('!bezZmian(s)'), 'sprawdzenie planu pod blokadą').toBeGreaterThan(blok.indexOf("return Ap('pat:'"));
    expect(blok.indexOf('await Bkz_zmienListe(nagrobki, [])')).toBeGreaterThan(0);
    expect(blok.indexOf('await Bkz_zmienListe(nagrobki, [])')).toBeLessThan(blok.indexOf('await Ar(patientId, id)'));
    expect(src).toContain('async function wr(t,e){return Bkz_przytnij(t,e)}');
  });

  it('reguły, które zostają bez zmian: próg 10 wersji i wyłącznik vildaRetention="0"', () => {
    expect(src).toContain('function oo(t,e,n){if(!n&&typeof e=="number"&&e>=10){try{if(v&&v.localStorage&&v.localStorage.getItem("vildaRetention")==="0")return}');
  });
});

describe('opis retencji w historii wersji', () => {
  it('zgadza się z regułami vilda_retention.js i progiem sejfu (już nie „dojdzie w kolejnym etapie”)', () => {
    const ui = readFileSync(path.join(repoRoot, 'vilda_version_history_ui.js'), 'utf8');
    const m = ui.match(/text:"(Gdy karta[^"]*)"/);
    expect(m, 'opis retencji pod listą wersji').not.toBeNull();
    const opis = JSON.parse(`"${m[1]}"`);
    expect(opis).toBe('Gdy karta ma co najmniej 10 wersji, zapis przerzedza starsze na wszystkich urządzeniach: '
      + 'z ostatnich 24 h zostają wszystkie, do 30 dni — ostatnia z każdego dnia, starsze — ostatnia z miesiąca '
      + '(najwyżej 40). Przypięte zostają zawsze.');
    expect(ui).not.toContain('dojdzie w kolejnym etapie');

    const retencja = readFileSync(path.join(repoRoot, 'vilda_retention.js'), 'utf8');
    expect(retencja, 'limit 40').toContain('r.cap>0?Math.floor(r.cap):40');
    expect(retencja, '24 h').toContain('r.recentHours:24');
    expect(retencja, '30 dni').toContain('r.dailyDays:30');
    const vault = readFileSync(path.join(repoRoot, 'vilda_vault.js'), 'utf8');
    expect(vault, 'próg 10 wersji').toContain('typeof e=="number"&&e>=10');
  });
});
