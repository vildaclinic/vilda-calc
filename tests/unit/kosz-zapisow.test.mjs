import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-KOSZ-ZAPISOW (decyzje właściciela 2026-09-30, makieta zaakceptowana): pomylony zapis (wersja karty) trafia do
// kosza z nagrobkiem w synchronizacji. Dotąd deleteSnapshot usuwał wersję tylko na jednym urządzeniu, a scalanie
// dodawało ją z powrotem przy pierwszej synchronizacji. Testy zachowaniowe: prawdziwy vilda_vault.js, dwa urządzenia
// wymieniające ładunek exportSyncPayload → mergeSyncPayload (to samo, co robi vilda_sync.js). Dane fikcyjne.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DZIEN = 864e5;

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
const adaptery = new WeakMap();

async function urzadzenie() {
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
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_retention.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  const pamiec = v.createInMemoryAdapter();
  v.setStorageAdapter(pamiec);
  adaptery.set(v, pamiec);
  await v.createUser(`Kosz#Zapisow!2026${licznik}aa`, { label: `dev${licznik}`, iterations: 10000 });
  return v;
}

// Kolejne zapisy muszą mieć rosnący savedAtISO; przy sztucznym zegarze przesuwamy go jawnie.
let zegar = Date.parse('2026-09-29T12:00:00Z');
function przesunZegar(ms) {
  zegar += ms;
  vi.setSystemTime(zegar);
}

const osoba = (lastName, firstName, dobISO, sex, extra = {}) => ({
  name: `${lastName} ${firstName}`,
  user: { lastName, firstName, dobISO, sex, height: 120, weight: 22, ...extra },
});
const ADAM = osoba('Innyrecz', 'Adam', '2016-03-12', 'M');
const ALICJA = osoba('Probna', 'Alicja', '2012-08-05', 'F', { height: 149.2, weight: 51.4 });

async function zapisz(v, payload, opcje = {}) {
  przesunZegar(60e3);
  return v.savePatient(payload, { dedup: false, ...opcje });
}

// Karta Adama: dwa jego zapisy i pomyłka (zapis Alicji z identyfikatorem Adama) jako najnowszy.
async function kartaZPomylka(v) {
  const a = await zapisz(v, ADAM);
  await zapisz(v, osoba('Innyrecz', 'Adam', '2016-03-12', 'M', { height: 121 }), { patientId: a.patientId });
  const zly = await zapisz(v, ALICJA, { patientId: a.patientId });
  return { patientId: a.patientId, zly: zly.snapshotId };
}

const idWersji = async (v, pid) => (await v.getPatient(pid)).snapshots.map((s) => s.snapshotId);

afterEach(() => { vi.useRealTimers(); });

function sztucznyZegar() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(zegar);
}

describe('kosz: przeniesienie, lista, przywrócenie', () => {
  it('usunięcie przenosi zapis do kosza, a karta wraca do nazwy z poprzedniego zapisu', async () => {
    sztucznyZegar();
    const v = await urzadzenie();
    const { patientId, zly } = await kartaZPomylka(v);
    expect((await v.getPatient(patientId)).header.name).toBe('Probna Alicja');

    przesunZegar(DZIEN);
    const wynik = await v.moveSnapshotToTrash(patientId, zly);
    expect(wynik).toMatchObject({ patientId, snapshotId: zly, wasPinned: false, remainingSnapshotCount: 2 });
    expect(Date.parse(wynik.expiresAtISO) - Date.parse(wynik.deletedAtISO)).toBe(30 * DZIEN);

    const karta = await v.getPatient(patientId);
    expect(karta.snapshots.map((s) => s.snapshotId)).not.toContain(zly);
    expect(karta.header.name, 'nagłówek z poprzedniego zapisu').toBe('Innyrecz Adam');

    const kosz = await v.listTrashedSnapshots();
    expect(kosz).toHaveLength(1);
    expect(kosz[0]).toMatchObject({ patientId, snapshotId: zly, patientExists: true, patientName: 'Innyrecz Adam', pinned: false });
    expect(kosz[0].payload.name).toBe('Probna Alicja');
  });

  it('przywrócenie odkłada zapis na jego miejsce w historii i przywraca nazwę karty', async () => {
    sztucznyZegar();
    const v = await urzadzenie();
    const { patientId, zly } = await kartaZPomylka(v);
    const przed = (await v.getPatient(patientId)).snapshots.find((s) => s.snapshotId === zly);
    przesunZegar(DZIEN);
    await v.moveSnapshotToTrash(patientId, zly);
    przesunZegar(DZIEN);
    await v.restoreTrashedSnapshot(patientId, zly);

    const karta = await v.getPatient(patientId);
    const wrocil = karta.snapshots.find((s) => s.snapshotId === zly);
    expect(wrocil.savedAtISO, 'miejsce w historii bez zmian').toBe(przed.savedAtISO);
    expect(wrocil.updatedAtISO > przed.savedAtISO, 'nowa chwila zmiany').toBe(true);
    expect(wrocil.rev).toBe(przed.rev + 1);
    expect(wrocil.payload.name).toBe('Probna Alicja');
    expect(karta.header.name, 'był najnowszy, więc karta znów ma jego nazwę').toBe('Probna Alicja');
    expect(await v.listTrashedSnapshots()).toEqual([]);
  });

  it('przypięty zapis: bez zgody na odpięcie odmowa i nic się nie zmienia; po przywróceniu znów przypięty', async () => {
    sztucznyZegar();
    const v = await urzadzenie();
    const { patientId, zly } = await kartaZPomylka(v);
    przesunZegar(60e3);
    await v.setSnapshotPinned(patientId, zly, true);
    const przed = await idWersji(v, patientId);

    await expect(v.moveSnapshotToTrash(patientId, zly)).rejects.toMatchObject({ code: 'przypiety' });
    expect(await idWersji(v, patientId)).toEqual(przed);
    expect(await v.listTrashedSnapshots()).toEqual([]);

    przesunZegar(60e3);
    const wynik = await v.moveSnapshotToTrash(patientId, zly, { odepnij: true });
    expect(wynik.wasPinned).toBe(true);
    expect((await v.listTrashedSnapshots())[0].pinned).toBe(true);
    przesunZegar(60e3);
    await v.restoreTrashedSnapshot(patientId, zly);
    expect((await v.getPatient(patientId)).snapshots.find((s) => s.snapshotId === zly).pinned).toBe(true);
  });

  it('ostatniego zapisu karty nie da się przenieść do kosza', async () => {
    const v = await urzadzenie();
    const a = await v.savePatient(ADAM, { dedup: false });
    await expect(v.moveSnapshotToTrash(a.patientId, a.snapshotId)).rejects.toMatchObject({ code: 'ostatni' });
    await expect(v.moveSnapshotToTrash(a.patientId, 'nie-ma-takiego')).rejects.toMatchObject({ code: 'brak' });
  });

  it('dwa równoległe usunięcia nie gubią sobie nawzajem wpisów w koszu', async () => {
    sztucznyZegar();
    const v = await urzadzenie();
    const a = await zapisz(v, ADAM);
    await zapisz(v, ADAM, { patientId: a.patientId });
    const z1 = await zapisz(v, ALICJA, { patientId: a.patientId });
    const z2 = await zapisz(v, ALICJA, { patientId: a.patientId });
    przesunZegar(DZIEN);
    await Promise.all([v.moveSnapshotToTrash(a.patientId, z1.snapshotId), v.moveSnapshotToTrash(a.patientId, z2.snapshotId)]);
    expect((await v.listTrashedSnapshots()).map((k) => k.snapshotId).sort()).toEqual([z1.snapshotId, z2.snapshotId].sort());
  });

  it('deleteSnapshot działa jak dotąd — bez nagrobka i bez kosza (retencja: retencja-nagrobki.test.mjs)', async () => {
    sztucznyZegar();
    const v = await urzadzenie();
    const { patientId, zly } = await kartaZPomylka(v);
    await v.deleteSnapshot(patientId, zly);
    expect(await v.listTrashedSnapshots()).toEqual([]);
    expect((await v.exportSyncPayload()).snapshotTombstones).toEqual([]);
  });
});

describe('kosz w synchronizacji (dwa urządzenia)', () => {
  it('usunięcie na A: stary ładunek nie wskrzesza zapisu na A, a B usuwa go u siebie i ma go w koszu', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const B = await urzadzenie();
    const { patientId, zly } = await kartaZPomylka(A);
    await B.mergeSyncPayload(await A.exportSyncPayload());
    const staryLadunekB = await B.exportSyncPayload();
    expect(await idWersji(B, patientId)).toContain(zly);

    przesunZegar(DZIEN);
    await A.moveSnapshotToTrash(patientId, zly);
    await A.mergeSyncPayload(staryLadunekB);
    expect(await idWersji(A, patientId), 'A: zapis nie wraca').not.toContain(zly);

    const wynik = await B.mergeSyncPayload(await A.exportSyncPayload());
    expect(wynik.trashedSnapshotCount).toBe(1);
    expect(await idWersji(B, patientId), 'B: zapis usunięty').not.toContain(zly);
    expect((await B.getPatient(patientId)).header.name, 'B: nagłówek przebudowany').toBe('Innyrecz Adam');
    const koszB = await B.listTrashedSnapshots();
    expect(koszB.map((k) => k.snapshotId)).toEqual([zly]);
    expect(koszB[0].payload.name, 'kosz na B ma treść').toBe('Probna Alicja');

    // „Przywróć” na B wraca też na A.
    przesunZegar(DZIEN);
    await B.restoreTrashedSnapshot(patientId, zly);
    await A.mergeSyncPayload(await B.exportSyncPayload());
    expect(await idWersji(A, patientId), 'A: przywrócony na B wraca').toContain(zly);
    expect(await A.listTrashedSnapshots(), 'A: kosz pusty').toEqual([]);
    expect((await A.getPatient(patientId)).header.name).toBe('Probna Alicja');
  });

  it('zmiana zapisu po usunięciu (przypięcie na B) wygrywa: zapis zostaje na obu urządzeniach', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const B = await urzadzenie();
    const { patientId, zly } = await kartaZPomylka(A);
    await B.mergeSyncPayload(await A.exportSyncPayload());

    przesunZegar(DZIEN);
    await A.moveSnapshotToTrash(patientId, zly);
    przesunZegar(60e3);
    await B.setSnapshotPinned(patientId, zly, true); // B jeszcze nie wie o usunięciu

    await B.mergeSyncPayload(await A.exportSyncPayload());
    expect(await idWersji(B, patientId), 'B: późniejsza zmiana wygrywa').toContain(zly);
    await A.mergeSyncPayload(await B.exportSyncPayload());
    expect(await idWersji(A, patientId), 'A: zapis wraca, bo zmieniono go po usunięciu').toContain(zly);
    expect(await A.listTrashedSnapshots()).toEqual([]);
    expect((await A.exportSyncPayload()).snapshotTombstones, 'nagrobek zniknął').toEqual([]);
  });

  it('nagrobek nie usuwa ostatniego zapisu karty na drugim urządzeniu', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const B = await urzadzenie();
    const { patientId, zly } = await kartaZPomylka(A);
    const ladunek = await A.exportSyncPayload();
    // B zna kartę tylko z pomylonego zapisu (jak po retencji).
    const tylkoZly = JSON.parse(JSON.stringify(ladunek));
    tylkoZly.patients[0].snapshots = tylkoZly.patients[0].snapshots.filter((s) => s.snapshotId === zly);
    await B.mergeSyncPayload(tylkoZly);
    przesunZegar(DZIEN);
    await A.moveSnapshotToTrash(patientId, zly);
    const doB = await A.exportSyncPayload();
    doB.patients = [];
    await B.mergeSyncPayload(doB);
    expect(await idWersji(B, patientId)).toEqual([zly]);
  });
});

describe('scalanie bez zmian w koszu nie zapisuje metadanych konta', () => {
  it('kolejna synchronizacja tego samego stanu: jeden zapis userMeta — sam znacznik scalania, kosz nic nie dokłada', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const { patientId, zly } = await kartaZPomylka(A);
    przesunZegar(DZIEN);
    await A.moveSnapshotToTrash(patientId, zly);
    const ladunek = await A.exportSyncPayload();
    await A.mergeSyncPayload(ladunek); // pierwsze scalenie może uporządkować listę
    const pamiec = adaptery.get(A);
    const zapisy = [];
    const oryginal = pamiec && pamiec.putUserMeta;
    if (pamiec) pamiec.putUserMeta = (...x) => { zapisy.push(x[1] && x[1].snapshotTombstones); return oryginal.apply(pamiec, x); };
    await A.mergeSyncPayload(ladunek);
    if (pamiec) pamiec.putUserMeta = oryginal;
    // Scalanie zawsze zapisuje chwilę ostatniego scalenia (Gx); lista nagrobków bez zmian nie dokłada drugiego zapisu.
    expect(zapisy, 'tylko znacznik scalania').toHaveLength(1);
    expect((await A.listTrashedSnapshots()).map((k) => k.snapshotId)).toEqual([zly]);
  });
});

describe('ważność kosza i nagrobka', () => {
  it('po 30 dniach treść znika z kosza, a nagrobek dalej blokuje powrót; po roku znika i on', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const { patientId, zly } = await kartaZPomylka(A);
    const stary = await A.exportSyncPayload();
    przesunZegar(DZIEN);
    await A.moveSnapshotToTrash(patientId, zly);

    przesunZegar(31 * DZIEN);
    expect(await A.listTrashedSnapshots(), 'kosz pusty po 30 dniach').toEqual([]);
    const eksport = await A.exportSyncPayload();
    expect(eksport.snapshotTombstones).toHaveLength(1);
    expect(eksport.snapshotTombstones[0].payload, 'bez treści').toBeUndefined();
    await A.mergeSyncPayload(stary);
    expect(await idWersji(A, patientId), 'nagrobek dalej działa').not.toContain(zly);
    await expect(A.restoreTrashedSnapshot(patientId, zly)).rejects.toMatchObject({ code: 'brak' });

    przesunZegar(335 * DZIEN);
    expect((await A.exportSyncPayload()).snapshotTombstones, 'po roku nagrobek znika').toEqual([]);
  });
});

describe('jawny import zdejmuje nagrobek (jak u pacjentów)', () => {
  it('import pliku karty sprzed usunięcia przywraca zapis i nagrobek z innego urządzenia go nie usuwa', async () => {
    sztucznyZegar();
    const A = await urzadzenie();
    const B = await urzadzenie();
    const { patientId, zly } = await kartaZPomylka(A);
    await B.mergeSyncPayload(await A.exportSyncPayload());
    const plik = await A.exportPatientEnvelope(patientId);

    przesunZegar(DZIEN);
    await A.moveSnapshotToTrash(patientId, zly);
    await B.mergeSyncPayload(await A.exportSyncPayload()); // B też ma nagrobek

    przesunZegar(DZIEN);
    const imp = await A.importPatientFromEnvelope(plik);
    expect(imp.addedSnapshots).toBe(1);
    expect(await idWersji(A, patientId)).toContain(zly);
    expect(await A.listTrashedSnapshots()).toEqual([]);

    await A.mergeSyncPayload(await B.exportSyncPayload()); // nagrobek z B jest starszy niż import
    expect(await idWersji(A, patientId), 'import wygrywa z nagrobkiem sprzed importu').toContain(zly);
  });
});

describe('strażniki źródła', () => {
  const src = readFileSync(path.join(repoRoot, 'vilda_vault.js'), 'utf8');

  it('nagrobek z treścią (kosz) stawia wyłącznie moveSnapshotToTrash; retencja od P-RETENCJA-NAGROBKI stawia własny, bez treści', () => {
    expect(src).toContain('moveSnapshotToTrash:Bkz_doKosza,listTrashedSnapshots:Bkz_lista,restoreTrashedSnapshot:Bkz_przywroc,');
    expect(src).toContain('pruneSnapshotsForPatient:wr,');
    expect(src).toContain('async function wr(t,e){return Bkz_przytnij(t,e)}');
    expect(src, 'stara retencja bez nagrobka zniknęła').not.toMatch(/for\(let s=0;s<o\.length;s\+=1\)try\{await Ar\(t,o\[s\]\)/);
  });

  it('scalanie sprawdza nagrobek w obu pętlach wersji i zwraca liczbę przeniesionych do kosza', () => {
    expect(src.match(/if\(Bkz_pomin\(Bkz_S,F\.patientId,[SY]\)\)continue;/g)).toHaveLength(2);
    expect(src).toContain('trashedSnapshotCount:Bkz_n,prunedSnapshotCount:Bkz_S.przyciete||0');
    expect(src).toContain('snapshotTombstones:await Bkz_eksport()');
  });
});

// ── Interfejs: czyste funkcje vilda_kosz_zapisow.js i ich użycie w sprawdzeniu ─────────────────

function modulKosza() {
  const win = { document: { readyState: 'complete', getElementById: () => null, addEventListener() {} }, addEventListener() {} };
  win.window = win;
  loadBrowserScript('vilda_kosz_zapisow.js', win);
  return win.VildaKoszZapisow;
}

const K = modulKosza();

describe('pomiary zapisu i pokrycie w karcie drugiej osoby', () => {
  it('pomiar = wiek w miesiącach + wzrost/masa z bieżącej wizyty i z historii; bez wieku albo bez wartości — nie', () => {
    const payload = {
      user: { age: 14, ageMonths: 1, height: 150, weight: 52 },
      advanced: { data: { measurements: [
        { ageMonths: 166, ageYears: 166 / 12, height: 149.2, weight: 51.4 },
        { ageMonths: 169, height: 150, weight: 52 }, // ten sam co wizyta — raz
        { ageMonths: 160 }, // bez wartości
        { height: 140, weight: 40 }, // bez wieku
      ] } },
      growthBasic: { data: { measurements: [{ ageMonths: 150.4, height: 141 }] } },
    };
    expect(K.pomiaryZapisu(payload)).toEqual([
      { miesiace: 150, wzrost: 141, masa: null },
      { miesiace: 166, wzrost: 149.2, masa: 51.4 },
      { miesiace: 169, wzrost: 150, masa: 52 },
    ]);
    expect(K.pomiaryZapisu(null)).toEqual([]);
  });

  it('pokrycie: ten sam miesiąc i wartości z dokładnością 0,05; brak masy po jednej stronie to inny pomiar', () => {
    const p = [{ miesiace: 169, wzrost: 150, masa: 52 }, { miesiace: 166, wzrost: 149.2, masa: 51.4 }];
    expect(K.pokrycie(p, [{ miesiace: 169, wzrost: 150.04, masa: 52 }, { miesiace: 166, wzrost: 149.2, masa: 51.4 }]).brakuje).toBe(0);
    const w = K.pokrycie(p, [{ miesiace: 166, wzrost: 149.2, masa: 51.4 }, { miesiace: 169, wzrost: 150, masa: null }]);
    expect(w.brakuje).toBe(1);
    expect(w.wiersze.map((x) => x.jest)).toEqual([false, true]);
    expect(K.pokrycie(p, [{ miesiace: 168, wzrost: 150, masa: 52 }, { miesiace: 166, wzrost: 149.2, masa: 51.4 }]).brakuje, 'inny miesiąc').toBe(1);
  });

  it('ocena przed usunięciem na świeżym odczycie: brak, bez karty, braki, można; nazwa karty po usunięciu', () => {
    const I = K.__internals;
    const zap = (id, savedAtISO, name, user, extra = {}) => ({ snapshotId: id, savedAtISO, payload: { name, user, ...extra }, pinned: !!extra._pinned });
    const A = { snapshots: [
      zap('m', '2026-09-29T14:12:00Z', 'Probna Alicja', { age: 14, ageMonths: 1, height: 150, weight: 52 }),
      zap('a2', '2026-09-29T13:40:00Z', 'Innyrecz Adam', { age: 10, ageMonths: 6, height: 121, weight: 22.5 }),
      zap('a1', '2026-09-29T13:38:00Z', 'Innyrecz Adam', { age: 10, ageMonths: 6, height: 120, weight: 22 }),
    ] };
    const Bpelna = { snapshots: [zap('b1', '2026-09-29T14:20:00Z', 'Probna Alicja', { age: 14, ageMonths: 1, height: 150, weight: 52 })] };
    const Bbez = { snapshots: [zap('b1', '2026-09-20T10:00:00Z', 'Probna Alicja', { age: 13, ageMonths: 10, height: 149.2, weight: 51.4 })] };
    expect(I.ocenUsuniecie(A, 'nie-ma', Bpelna).stan).toBe('brak');
    expect(I.ocenUsuniecie(A, 'm', null).stan).toBe('bez-karty');
    const braki = I.ocenUsuniecie(A, 'm', Bbez);
    expect(braki.stan).toBe('braki');
    expect(braki.pokrycie.brakuje).toBe(1);
    const mozna = I.ocenUsuniecie(A, 'm', Bpelna);
    expect(mozna).toMatchObject({ stan: 'mozna', przypiety: false, zmianaNazwy: { nazwa: 'Innyrecz Adam', savedAtISO: '2026-09-29T13:40:00Z' } });
    expect(I.ocenUsuniecie(A, 'a1', Bpelna).zmianaNazwy, 'nie najnowszy — nazwa bez zmian').toBe(null);
    const przypiety = { snapshots: [zap('m', '2026-09-29T14:12:00Z', 'Probna Alicja', { age: 14, ageMonths: 1, height: 150, weight: 52 }, { _pinned: true }), A.snapshots[1]] };
    expect(I.ocenUsuniecie(przypiety, 'm', Bpelna).przypiety).toBe(true);
    expect(I.ocenUsuniecie({ snapshots: [A.snapshots[0]] }, 'm', Bpelna).stan, 'jedyny zapis').toBe('brak');
  });

  it('teksty kosza: odmiana dni, wiek, nazwa pliku kopii (osobna od automatycznej kopii pacjenta)', () => {
    const I = K.__internals;
    expect([0, 1, 2, 4, 5, 12, 22, 25, 30].map(I.tekstPozostalo)).toEqual([
      'znika dziś', 'został 1 dzień', 'zostały 2 dni', 'zostały 4 dni', 'zostało 5 dni', 'zostało 12 dni',
      'zostały 22 dni', 'zostało 25 dni', 'zostało 30 dni']);
    expect(I.dniDoKonca('2026-10-30T11:05:00Z', Date.parse('2026-09-30T11:05:00Z'))).toBe(30);
    expect(I.formatWieku(169)).toBe('14\u00a0l. 1\u00a0mies.');
    expect(I.formatWieku(8)).toBe('8\u00a0mies.');
    expect(I.formatWieku(120)).toBe('10\u00a0l.');
    expect(I.nazwaPliku('1a2b3c4d', Date.parse('2026-09-30T09:05:00'))).toBe('wagaiwzrost_pacjent_1a2b3c4d_przed_usunieciem_2026-09-30_0905.wiw');
    expect(I.nazwaPliku('../zle', 0)).toMatch(/^wagaiwzrost_pacjent_00000000_przed_usunieciem_/);
  });
});

describe('sprawdzenie liczy pokrycie przy zapisie „inna osoba” (oba moduły, prawdziwy sejf)', () => {
  async function sejfZModulami() {
    licznik += 1;
    const win = {
      crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
      localStorage: makeStorage(), sessionStorage: makeStorage(),
      setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
      addEventListener() {}, removeEventListener() {},
      document: { addEventListener() {}, removeEventListener() {}, hidden: false, readyState: 'complete', getElementById: () => null },
    };
    win.window = win; win.self = win; win.top = win;
    loadBrowserScript('vilda_crypto.js', win);
    loadBrowserScript('vilda_vault.js', win);
    loadBrowserScript('vilda_kosz_zapisow.js', win);
    loadBrowserScript('vilda_spojnosc_zapisow.js', win);
    win.VildaVault.setStorageAdapter(win.VildaVault.createInMemoryAdapter());
    await win.VildaVault.createUser(`Kosz#Pokrycie!2026${licznik}aa`, { label: 'x', iterations: 10000 });
    return win;
  }

  it('pomiary pomylonego zapisu w karcie drugiej osoby — brakuje 0; bez nich — brakuje 1', async () => {
    sztucznyZegar();
    const win = await sejfZModulami();
    const v = win.VildaVault;
    const alicja = (h, wg, age, m) => ({ name: 'Probna Alicja', user: { lastName: 'Probna', firstName: 'Alicja', dobISO: '2012-08-05', sex: 'F', age, ageMonths: m, height: h, weight: wg } });
    const adam = { name: 'Innyrecz Adam', user: { lastName: 'Innyrecz', firstName: 'Adam', dobISO: '2016-03-12', sex: 'M', age: 10, ageMonths: 6, height: 121, weight: 22.5 } };
    const a = await zapisz(v, adam);
    await zapisz(v, adam, { patientId: a.patientId });
    const b = await zapisz(v, alicja(149.2, 51.4, 13, 10));
    await zapisz(v, alicja(150, 52, 14, 1), { patientId: a.patientId }); // pomyłka: nowy pomiar Alicji w karcie Adama

    let wynik = await win.VildaSpojnoscZapisow.sprawdz(v);
    let obcy = wynik.oceny.find((k) => k.patientId === a.patientId).ocenione.find((o) => o.ocena === 'obcy');
    expect(obcy.innaKarta.patientId).toBe(b.patientId);
    expect(obcy.pokrycie.brakuje, 'pomiaru 14 l. 1 mies. nie ma w karcie Alicji').toBe(1);

    await zapisz(v, alicja(150, 52, 14, 1), { patientId: b.patientId }); // lekarz dopisuje go w karcie Alicji
    wynik = await win.VildaSpojnoscZapisow.sprawdz(v);
    obcy = wynik.oceny.find((k) => k.patientId === a.patientId).ocenione.find((o) => o.ocena === 'obcy');
    expect(obcy.pokrycie.brakuje).toBe(0);
  });
});

describe('strażniki interfejsu', () => {
  const kosz = readFileSync(path.join(repoRoot, 'vilda_kosz_zapisow.js'), 'utf8');

  it('dane pacjenta trafiają do DOM wyłącznie przez textContent', () => {
    expect(kosz).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  });

  it('z sejfu: odczyty oraz wyłącznie przeniesienie do kosza i przywrócenie (bez deleteSnapshot, bez zapisu pacjenta)', () => {
    const wolane = new Set([...kosz.matchAll(/(?:sejf\(\)|\bv)\.([A-Za-z]+)\(/g)].map((m) => m[1]));
    expect([...wolane].sort()).toEqual(['getPatient', 'isUnlocked', 'listTrashedSnapshots', 'moveSnapshotToTrash', 'restoreTrashedSnapshot', 'shortHashOfPatientId']);
  });

  it('historia wersji woła kosz pod listą wersji; dziennik dostępu ma etykiety nowych zdarzeń', () => {
    expect(readFileSync(path.join(repoRoot, 'vilda_version_history_ui.js'), 'utf8'))
      .toContain('b.VildaKoszZapisow.wstawDoHistorii(t,a)');
    const dz = readFileSync(path.join(repoRoot, 'inline_ustawienia_04.js'), 'utf8');
    expect(dz).toContain('"snapshot.trash":"Usuni\\u0119cie zapisu do kosza"');
    expect(dz).toContain('"snapshot.restore":"Przywr\\xF3cenie zapisu z kosza"');
  });
});
