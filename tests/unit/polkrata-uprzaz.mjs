// P-KOSZ-POLKRATA (S4 krok 1): uprząż testów wad i praw łączenia na prawdziwym sejfie. Dane wyłącznie fikcyjne
// („Testowy Jan”). Każde urządzenie to osobne okno z vilda_crypto.js, vilda_retention.js i sejfem: 'N' — vilda_vault.js
// z repozytorium, 'S221' — starsza aplikacja (tests/fixtures/vilda_vault-221.js.txt, kopia vilda_vault.js z 54a84da3,
// decyzja właściciela D11 = a: flota mieszana i cofnięcie wydania). Magazyn w pamięci owinięty licznikiem zapisów
// (lista nagrobków, wersje, karty), sztuczny zegar (vi.useFakeTimers({ toFake: ['Date'] })), automatyczna retencja
// wyłączona (vildaRetention = 0) — przycięcie tylko jawnie (pruneSnapshotsForPatient z recentHours: 0).
import { vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SEJF = { N: 'vilda_vault.js', S221: 'tests/fixtures/vilda_vault-221.js.txt' };
const KOD = {};
function src(plik) { if (!KOD[plik]) KOD[plik] = readFileSync(path.join(repo, plik), 'utf8'); return KOD[plik]; }
export const DZIEN = 864e5;

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}
function okno(app, ls) {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: ls || makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {}, AbortController,
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
  };
  win.window = win; win.self = win; win.top = win;
  if (!ls) win.localStorage.setItem('vildaRetention', '0');
  for (const f of ['vilda_crypto.js', 'vilda_retention.js', SEJF[app]]) new Function('window', 'globalThis', src(f))(win, win);
  return win;
}
let licznik = 0;
export async function urzadzenie(nazwa, app = 'N') {
  licznik += 1;
  const win = okno(app);
  const v = win.VildaVault;
  const baza = v.createInMemoryAdapter();
  const licz = { lista: 0, wersje: 0, karty: 0 };
  const px = new Proxy(baza, {
    get(cel, k) {
      const f = cel[k];
      if (typeof f !== 'function') return f;
      if (k === 'putUserMeta') {
        return async function (uid, meta) {
          const stare = await cel.getUserMeta(uid);
          if (JSON.stringify((stare && stare.snapshotTombstones) || []) !== JSON.stringify((meta && meta.snapshotTombstones) || [])) licz.lista += 1;
          return f.call(cel, uid, meta);
        };
      }
      if (k === 'putSnapshotForUser' || k === 'removeSnapshotForUser') return function (...a) { licz.wersje += 1; return f.apply(cel, a); };
      if (k === 'putPatientForUser' || k === 'removePatientForUser') return function (...a) { licz.karty += 1; return f.apply(cel, a); };
      return f.bind(cel);
    },
  });
  v.setStorageAdapter(px);
  const haslo = `Polkrata#S4!2026${licznik}aa`;
  await v.createUser(haslo, { label: `${nazwa}${licznik}`, iterations: 10000 });
  const [uz] = await v.listUsers();
  Object.assign(v, { __nazwa: nazwa, __app: app, __licz: licz, __px: px, __ls: win.localStorage, __haslo: haslo, __uid: uz.userId });
  return v;
}
// Zmiana aplikacji na urządzeniu (aktualizacja albo cofnięcie wydania): inny kod, ten sam magazyn i localStorage,
// odblokowanie tym samym hasłem.
export async function aktualizuj(v, app = 'N') {
  if (v.__app === app) return v;
  try { v.lock('manual'); } catch { /* */ }
  const win = okno(app, v.__ls);
  const n = win.VildaVault;
  n.setStorageAdapter(v.__px);
  await n.unlockUser(v.__uid, v.__haslo);
  Object.assign(n, { __nazwa: v.__nazwa, __app: app, __licz: v.__licz, __px: v.__px, __ls: v.__ls, __haslo: v.__haslo, __uid: v.__uid });
  return n;
}

export const zegar = { t: Date.parse('2026-10-20T09:00:00Z'), baza: 0 };
export function przesunZegar(ms) { zegar.t += ms; vi.setSystemTime(zegar.t); }
export function sztucznyZegar() { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(zegar.t); }
// Chwila względem początku kroków scenariusza (zegar.baza), w minutach: 't+3'.
export function rel(iso) {
  if (!iso) return iso === undefined ? undefined : null;
  const ms = Date.parse(iso) - zegar.baza;
  if (!Number.isFinite(ms)) return iso;
  const m = ms / 60e3;
  return 't' + (m >= 0 ? '+' : '') + (Number.isInteger(m) ? m : m.toFixed(3));
}

export const jan = (height, weight) => ({
  name: 'Testowy Jan',
  user: { lastName: 'Testowy', firstName: 'Jan', dobISO: '2016-03-12', sex: 'M', height, weight },
});
export async function zapisz(v, p, opcje = {}) { przesunZegar(60e3); return v.savePatient(p, { dedup: false, ...opcje }); }
export async function gdzie(v, sid) {
  for (const k of await v.listPatients()) {
    const p = await v.getPatient(k.patientId);
    const s = p && p.snapshots.find((x) => x.snapshotId === sid);
    if (s) return { pid: k.patientId, s };
  }
  return null;
}
export async function poprawMase(v, sid, kg) {
  const g = await gdzie(v, sid);
  await v.updateSnapshotPayload(g.pid, sid, { ...g.s.payload, user: { ...g.s.payload.user, weight: kg } }, { preserveSavedAt: true });
}
export async function przypnij(v, sid, tak) { const g = await gdzie(v, sid); await v.setSnapshotPinned(g.pid, sid, tak); }
export async function doKosza(v, sid) { const g = await gdzie(v, sid); return v.moveSnapshotToTrash(g.pid, sid, { odepnij: true }); }
export async function przytnij(v, sid) {
  const g = await gdzie(v, sid);
  const r = await v.pruneSnapshotsForPatient(g.pid, { recentHours: 0 });
  if (!r.prunedIds.includes(sid)) throw new Error(`retencja na ${v.__nazwa} nie przycięła zapisu`);
}
export async function sync(z, na) { await na.mergeSyncPayload(JSON.parse(JSON.stringify(await z.exportSyncPayload()))); }
export async function rundy(urz, n = 3) {
  for (let r = 0; r < n; r += 1) for (const a of urz) for (const b of urz) if (a !== b) await sync(a, b);
}
export function zeruj(urz) { for (const v of urz) Object.assign(v.__licz, { lista: 0, wersje: 0, karty: 0 }); }
export function zapisy(urz) { return Object.fromEntries(urz.map((v) => [v.__nazwa, { ...v.__licz }])); }

// „Testowy Jan”: 12 wersji na K (100+i cm, 20+i kg, co minutę), reszta dostaje komplet. sid = czwarta (103 cm, 23 kg) —
// retencja z recentHours: 0 przycina ją (zostaje ostatnia wersja dnia).
export async function urzadzenia(nazwy, flota = {}) {
  const u = {};
  for (const n of nazwy) u[n] = await urzadzenie(n, flota[n] || 'N');
  let pid = null;
  const ids = [];
  for (let i = 0; i < 12; i += 1) {
    const r = await zapisz(u.K, jan(100 + i, 20 + i), pid ? { patientId: pid } : {});
    pid = r.patientId; ids.push(r.snapshotId);
  }
  for (const n of nazwy) if (n !== 'K') await sync(u.K, u[n]);
  return { u, lista: nazwy.map((n) => u[n]), pid, ids, sid: ids[3] };
}

// Stan zapisu sid na urządzeniu: karta, kosz, eksportowany nagrobek (chwile względne) i widok („karta 23*”, „kosz 78”,
// „brak”).
export async function stan(v, sid) {
  const g = await gdzie(v, sid);
  const k = (await v.listTrashedSnapshots()).find((e) => e.snapshotId === sid) || null;
  const n = ((await v.exportSyncPayload()).snapshotTombstones || []).find((e) => e.snapshotId === sid) || null;
  return {
    karta: g ? { masa: g.s.payload.user.weight, pin: !!g.s.pinned, rev: g.s.rev, zm: rel(g.s.updatedAtISO) } : null,
    kosz: k ? { masa: k.payload && k.payload.user.weight, pin: !!k.pinned, del: rel(k.deletedAtISO) } : null,
    nagrobek: n ? {
      rodzaj: n.powod === 'retencja' ? 'retencja' : n.payload ? 'kosz' : 'kosz-bez-tresci',
      del: rel(n.deletedAtISO), przyc: rel(n.przycietoISO), rev: n.rev, zm: rel(n.updatedAtISO), zmISO: rel(n.zmianaISO),
      masa: n.payload ? n.payload.user.weight : undefined, pin: n.payload ? !!n.payload._pinned : undefined,
    } : null,
  };
}
export function widok(s) {
  return [s.karta ? `karta ${s.karta.masa}${s.karta.pin ? '*' : ''}` : '', s.kosz ? `kosz ${s.kosz.masa}${s.kosz.pin ? '*' : ''}` : '']
    .filter(Boolean).join(' + ') || 'brak';
}
export async function widoki(u, sid, nazwy = Object.keys(u)) {
  const w = {};
  for (const n of nazwy) w[n] = widok(await stan(u[n], sid));
  return w;
}
// Eksportowany nagrobek sid (wszystkie pola ładunku; treść jako masa) — do porównania urządzeń.
export async function eksportNagrobka(v, sid) {
  const n = ((await v.exportSyncPayload()).snapshotTombstones || []).find((e) => e.snapshotId === sid) || null;
  if (!n) return null;
  const o = {};
  for (const k of Object.keys(n).sort()) if (k !== 'payload' && k !== 'payloadCipher') o[k] = n[k];
  o.tresc = n.payload ? { masa: n.payload.user.weight, pin: !!n.payload._pinned } : null;
  return o;
}
