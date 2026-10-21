import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-KOPIA-REV (decyzja właściciela PD-14 do D-7 wariant 2, 2026-10-21): „Scal kopię konta” (mergeVaultBackup) zapisuje
// dodane wersje razem z ich rewizją (rev) i chwilą zmiany (updatedAtISO) z kopii, tak jak odtworzenie konta
// (restoreVaultBackup). Dotąd zapisywała je bez obu pól: poprawka zrobiona w kopii po zapisie wizyty przegrywała potem
// w synchronizacji z niepoprawioną wersją z innego urządzenia i ginęła na obu. Prawdziwy vilda_vault.js, sejfy
// w pamięci, sztuczny zegar, dane fikcyjne.

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
function okno() {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false }, AbortController,
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_retention.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  v.setStorageAdapter(v.createInMemoryAdapter());
  return v;
}
async function urzadzenie() {
  licznik += 1;
  const v = okno();
  const haslo = `Kopia#Rev!2026${licznik}aa`;
  await v.createUser(haslo, { label: `kopia-rev-${licznik}`, iterations: 10000 });
  return { v, haslo };
}
let zegar = Date.parse('2026-10-21T09:00:00Z');
function przesunZegar(ms) { zegar += ms; vi.setSystemTime(zegar); }
function sztucznyZegar() { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(zegar); }
afterEach(() => { vi.useRealTimers(); });

const kopia = (x) => JSON.parse(JSON.stringify(x));
const sync = async (z, na) => na.v.mergeSyncPayload(kopia(await z.v.exportSyncPayload()));
const jan = (wiek, masa) => ({
  name: 'Testowy Jan',
  user: { lastName: 'Testowy', firstName: 'Jan', dobISO: '2020-01-01', sex: 'M', age: Math.floor(wiek / 12), ageMonths: wiek % 12, height: 100 + wiek / 6, weight: masa },
  advanced: { data: { measurements: [{ uid: `m-${wiek}`, ageMonths: wiek, ageYears: wiek / 12, height: 100 + wiek / 6, weight: masa }] } },
});
async function zapisz(d, p, opcje = {}) { przesunZegar(60e3); return d.v.savePatient(p, { dedup: false, ...opcje }); }
async function wersja(d, pid, sid) { return ((await d.v.getPatient(pid)) || { snapshots: [] }).snapshots.find((s) => s.snapshotId === sid) || null; }
async function poprawMase(d, pid, sid, kg) {
  przesunZegar(60e3);
  const w = await wersja(d, pid, sid);
  await d.v.updateSnapshotPayload(pid, sid, { ...w.payload, user: { ...w.payload.user, weight: kg } }, { preserveSavedAt: true });
  return wersja(d, pid, sid);
}

describe('P-KOPIA-REV: „Scal kopię konta” zachowuje rewizję i chwilę zmiany wersji z kopii', () => {
  it('nowa karta z kopii (N bez tej karty): wersja z rev i updatedAtISO kopii; po synchronizacji z P poprawka zostaje na obu', async () => {
    sztucznyZegar();
    const P = await urzadzenie(), C = await urzadzenie(), N = await urzadzenie();
    const a = await zapisz(P, jan(60, 19));
    const s2 = await zapisz(P, jan(66, 20), { patientId: a.patientId });
    await sync(P, C);
    const poprawiona = await poprawMase(C, a.patientId, s2.snapshotId, 21);
    expect(poprawiona.rev, 'kontrola: poprawka na C ma rev 1').toBe(1);
    const wynik = await N.v.mergeVaultBackup(await C.v.exportVaultBackup(), C.haslo);
    expect(wynik.addedSnapshotCount, 'kontrola: obie wersje dodane').toBe(2);
    const naN = await wersja(N, a.patientId, s2.snapshotId);
    expect({ rev: naN.rev, updatedAtISO: naN.updatedAtISO, masa: naN.payload.user.weight }, 'N: rev i chwila zmiany z kopii')
      .toEqual({ rev: 1, updatedAtISO: poprawiona.updatedAtISO, masa: 21 });
    for (let r = 0; r < 2; r += 1) { await sync(N, P); await sync(P, N); }
    expect((await wersja(P, a.patientId, s2.snapshotId)).payload.user.weight, 'P: poprawka z kopii').toBe(21);
    expect((await wersja(N, a.patientId, s2.snapshotId)).payload.user.weight, 'N: poprawka z kopii').toBe(21);
  });

  it('karta już jest (N ma starsze wersje): dopisana wersja z rev i updatedAtISO kopii; po synchronizacji z P poprawka zostaje na obu', async () => {
    sztucznyZegar();
    const P = await urzadzenie(), C = await urzadzenie(), N = await urzadzenie();
    const a = await zapisz(P, jan(60, 19));
    await sync(P, N);
    const s2 = await zapisz(P, jan(66, 20), { patientId: a.patientId });
    await sync(P, C);
    const poprawiona = await poprawMase(C, a.patientId, s2.snapshotId, 22);
    const wynik = await N.v.mergeVaultBackup(await C.v.exportVaultBackup(), C.haslo);
    expect(wynik.addedSnapshotCount, 'kontrola: dopisana tylko brakująca wersja').toBe(1);
    const naN = await wersja(N, a.patientId, s2.snapshotId);
    expect({ rev: naN.rev, updatedAtISO: naN.updatedAtISO, masa: naN.payload.user.weight }, 'N: rev i chwila zmiany z kopii')
      .toEqual({ rev: 1, updatedAtISO: poprawiona.updatedAtISO, masa: 22 });
    for (let r = 0; r < 2; r += 1) { await sync(N, P); await sync(P, N); }
    expect((await wersja(P, a.patientId, s2.snapshotId)).payload.user.weight, 'P: poprawka z kopii').toBe(22);
    expect((await wersja(N, a.patientId, s2.snapshotId)).payload.user.weight, 'N: poprawka z kopii').toBe(22);
  });

  it('[kontrola] wersja bez poprawki: rev 0 i updatedAtISO z kopii (jak odtworzenie konta), bez wymyślania chwili', async () => {
    sztucznyZegar();
    const C = await urzadzenie(), N = await urzadzenie(), R = { v: okno() };
    const a = await zapisz(C, jan(60, 19));
    const naC = await wersja(C, a.patientId, a.snapshotId);
    const plik = await C.v.exportVaultBackup();
    przesunZegar(60e3);
    await N.v.mergeVaultBackup(plik, C.haslo);
    await R.v.restoreVaultBackup(plik, C.haslo);
    const naN = await wersja(N, a.patientId, a.snapshotId), naR = await wersja(R, a.patientId, a.snapshotId);
    const pola = (w) => ({ rev: w.rev, updatedAtISO: w.updatedAtISO });
    expect(pola(naR), 'kontrola: odtworzenie konta zachowuje oba pola').toEqual(pola(naC));
    expect(pola(naN), '„Scal kopię konta” jak odtworzenie').toEqual(pola(naC));
  });

  it('strażnik źródła: obie gałęzie „Scal kopię konta” zapisują rev i updatedAtISO wersji z kopii', () => {
    const src = readFileSync(path.join(repoRoot, 'vilda_vault.js'), 'utf8');
    const ss = src.slice(src.indexOf('async function ss('), src.indexOf('async function Hr('));
    expect(ss.length, 'kontrola: wycięta cała funkcja').toBeGreaterThan(2000);
    expect(ss).toContain('savedAtISO:C.savedAtISO||l,rev:mt(C),updatedAtISO:typeof C.updatedAtISO=="string"&&C.updatedAtISO?C.updatedAtISO:null');
    expect(ss).toContain('savedAtISO:_.savedAtISO||l,rev:mt(_),updatedAtISO:typeof _.updatedAtISO=="string"&&_.updatedAtISO?_.updatedAtISO:null');
  });
});
