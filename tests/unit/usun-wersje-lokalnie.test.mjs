import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-USUN-WERSJE-LOKALNIE (decyzja właściciela D-8 wariant A, 2026-10-20). deleteSnapshot usuwa wersję tylko na tym
// urządzeniu, bez nagrobka i bez kosza: synchronizacja ją przywraca. Dlatego woła go wyłącznie sejf, a żaden ekran ani
// moduł interfejsu. Wersję usuwa się z interfejsu przez kosz (moveSnapshotToTrash) albo retencję
// (pruneSnapshotsForPatient), które stawiają nagrobek. Wzór strażnika: lokalna-doba.test.mjs (git ls-files, bez tests/).

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEJF = 'vilda_vault.js';
const TOKEN = /\bdeleteSnapshot\b/g;
// [plik, dosłowny fragment, powód] — wystąpienie, które nie jest wywołaniem. Dziś puste: etykieta dziennika przycisku
// „Usuń pomiar” na osi czasu brzmi „deleteMeasurementRow from timeline” (decyzja D-8.1, 2026-10-20).
const WYJATKI = [];

function plikiProdukcyjne() {
  return execFileSync('git', ['ls-files', '-z', '--', '*.js', '*.mjs', '*.cjs', '*.html', '*.htm'], { cwd: KORZEN, encoding: 'utf8' })
    .split('\0')
    .filter((p) => p && !p.startsWith('tests/') && !p.startsWith('docs/') && p !== SEJF);
}

describe('deleteSnapshot: lokalne, wołane tylko w sejfie (D-8 A, strażnik)', () => {
  it('żaden plik poza vilda_vault.js i testami nie woła deleteSnapshot (moduły, strony z inline script, service worker)', () => {
    const winne = [];
    for (const plik of plikiProdukcyjne()) {
      let tresc = fs.readFileSync(path.join(KORZEN, plik), 'utf8');
      for (const [p, fragment] of WYJATKI) if (p === plik) tresc = tresc.split(fragment).join('');
      TOKEN.lastIndex = 0;
      let m;
      while ((m = TOKEN.exec(tresc)) !== null) {
        const wiersz = tresc.slice(0, m.index).split('\n').length;
        winne.push(`${plik}:${wiersz}  …${tresc.slice(Math.max(0, m.index - 60), m.index + 40)}…`);
      }
    }
    expect(winne, `deleteSnapshot poza sejfem (użyj moveSnapshotToTrash):\n${winne.join('\n')}`).toEqual([]);
  });

  it('wyjątki są aktualne (każdy fragment nadal stoi w swoim pliku)', () => {
    for (const [plik, fragment, powod] of WYJATKI) {
      expect(fs.readFileSync(path.join(KORZEN, plik), 'utf8'), `${plik}: ${powod}`).toContain(fragment);
    }
  });

  it('strażnik nie jest pusty — skan widzi pliki interfejsu i service worker', () => {
    const pliki = plikiProdukcyjne();
    for (const p of ['vilda_auth_ui.js', 'vilda_kosz_zapisow.js', 'vilda_version_history_ui.js', 'vilda_retention.js', 'service-worker-kalorii.js', 'app.html']) {
      expect(pliki, p).toContain(p);
    }
  });

  it('w sejfie: publiczne deleteSnapshot (Ar) nie jest wołane wewnętrznie; rdzeń Bzw_usunWersje wołają tylko Ar i Bkz_usunJesliBezZmian (kosz, retencja)', () => {
    const s = fs.readFileSync(path.join(KORZEN, SEJF), 'utf8');
    const odwolaniaAr = [...s.matchAll(/(?<![A-Za-z0-9_$.])Ar(?![A-Za-z0-9_$])/g)].map((m) => s.slice(m.index - 15, m.index + 2));
    expect(odwolaniaAr).toEqual(['async function Ar', 'deleteSnapshot:Ar']);
    expect(s.match(/\bBzw_usunWersje\(/g)).toHaveLength(3); // definicja + Ar + Bkz_usunJesliBezZmian
    expect(s).toContain('function () { return Bzw_usunWersje(t, e); }'); // Ar: bez chwili zmiany (data karty nie rośnie)
    expect(s).toContain('return Bzw_usunWersje(patientId, snapshotId, zmianaISO);');
  });
});

// --- zachowanie: prawdziwy vilda_vault.js, dwa sejfy w pamięci, sztuczny zegar, dane fikcyjne ---------------------
function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}
let licznik = 0;
async function urzadzenie(nazwa) {
  licznik += 1;
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
  await v.createUser(`Usun#Lokalnie!2026${licznik}aa`, { label: `${nazwa}${licznik}`, iterations: 10000 });
  return { nazwa, v };
}
let zegar = Date.parse('2026-10-20T09:00:00Z');
function przesunZegar(ms) { zegar += ms; vi.setSystemTime(zegar); return new Date(zegar).toISOString(); }
function sztucznyZegar() { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(zegar); }
afterEach(() => { vi.useRealTimers(); });

const kopia = (x) => { const y = JSON.parse(JSON.stringify(x)); if (y && typeof y === 'object') delete y.credential; return y; };
const zapis = (nazwa, wiek) => ({
  name: nazwa, timestampISO: new Date().toISOString(),
  user: { sex: 'M', age: Math.floor(wiek / 12), ageMonths: wiek % 12, height: 100 + wiek / 6, weight: 15 + wiek / 12 },
  advanced: { data: { measurements: [{ uid: 'm-' + wiek, ageMonths: wiek, ageYears: wiek / 12, height: 100 + wiek / 6, weight: 15 + wiek / 12 }] } },
});
async function zapisz(d, p, opcje = {}) { przesunZegar(60e3); return d.v.savePatient(p, { dedup: false, ...opcje }); }
const sync = async (z, na) => na.v.mergeSyncPayload(kopia(await z.v.exportSyncPayload()));
const odszyfruj = async (d, z) => kopia(await d.v.decryptPayloadForCurrentUser(z.iv, z.data));
async function idWersji(d, pid) { const p = await d.v.getPatient(pid); return p ? p.snapshots.map((s) => s.snapshotId) : []; }
async function karta(d, pid) { return (await d.v.listPatients()).find((x) => x.patientId === pid) || null; }

// Karta s1–s3 na A; B ma komplet.
async function trzyWersje() {
  const A = await urzadzenie('A'), B = await urzadzenie('B');
  const s1 = await zapisz(A, zapis('Przykladowy Kamil', 60));
  const pid = s1.patientId;
  const s2 = await zapisz(A, zapis('Przykladowy Kamil', 66), { patientId: pid });
  const s3 = await zapisz(A, zapis('Testowy Piotr', 72), { patientId: pid });
  await sync(A, B);
  return { A, B, pid, s1, s2, s3 };
}

describe('deleteSnapshot: usunięcie tylko na tym urządzeniu (D-8 A, zachowanie)', () => {
  it('D1 deleteSnapshot(s2) na A: bez nagrobka, bez kosza, data karty bez zmian; A → B nie usuwa, pełny ładunek i delta B → A przywracają', async () => {
    sztucznyZegar();
    const c = await trzyWersje();
    const przed = (await karta(c.A, c.pid)).lastSavedAtISO;
    przesunZegar(60e3);
    await c.A.v.deleteSnapshot(c.pid, c.s2.snapshotId);
    const lad = await c.A.v.exportSyncPayload();
    expect(lad.snapshotTombstones || [], 'bez nagrobka wersji').toEqual([]);
    expect(await c.A.v.listTrashedSnapshots(), 'bez kosza').toEqual([]);
    expect((await karta(c.A, c.pid)).lastSavedAtISO, 'data karty bez zmian').toBe(przed);
    expect(await idWersji(c.A, c.pid)).not.toContain(c.s2.snapshotId);
    await sync(c.A, c.B);
    await c.B.v.mergeSyncPayload(await odszyfruj(c.A, await c.A.v.buildPatientDelta(c.pid)));
    expect(await idWersji(c.B, c.pid), 'B: usunięcie się nie propaguje').toContain(c.s2.snapshotId);
    await c.A.v.mergeSyncPayload(await odszyfruj(c.B, await c.B.v.buildPatientDelta(c.pid)));
    expect(await idWersji(c.A, c.pid), 'A: delta karty B przywraca wersję').toContain(c.s2.snapshotId);
    przesunZegar(60e3);
    await c.A.v.deleteSnapshot(c.pid, c.s2.snapshotId);
    const w = await sync(c.B, c.A);
    expect(w.addedSnapshotCount, 'pełny ładunek B przywraca wersję').toBe(1);
    expect(await idWersji(c.A, c.pid)).toContain(c.s2.snapshotId);
  });

  it('D2 deleteSnapshot najnowszej wersji: nagłówek z poprzedniej (D-3 A), po B → A wersja i jej nagłówek wracają', async () => {
    sztucznyZegar();
    const c = await trzyWersje();
    przesunZegar(60e3);
    await c.A.v.deleteSnapshot(c.pid, c.s3.snapshotId);
    expect((await karta(c.A, c.pid)).header.name).toBe('Przykladowy Kamil');
    await sync(c.B, c.A);
    expect((await karta(c.A, c.pid)).header.name).toBe('Testowy Piotr');
    expect((await c.A.v.getPatient(c.pid)).snapshots[0].snapshotId).toBe(c.s3.snapshotId);
  });

  it('D3 [kontrola] kosz zamiast deleteSnapshot: wersja nie wraca na A, B usuwa ją i ma ją w koszu', async () => {
    sztucznyZegar();
    const c = await trzyWersje();
    przesunZegar(60e3);
    await c.A.v.moveSnapshotToTrash(c.pid, c.s2.snapshotId);
    await sync(c.B, c.A);
    expect(await idWersji(c.A, c.pid)).not.toContain(c.s2.snapshotId);
    await sync(c.A, c.B);
    expect(await idWersji(c.B, c.pid)).not.toContain(c.s2.snapshotId);
    expect((await c.B.v.listTrashedSnapshots()).map((e) => e.snapshotId)).toEqual([c.s2.snapshotId]);
  });
});
