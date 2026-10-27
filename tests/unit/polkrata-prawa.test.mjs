// P-KOSZ-POLKRATA (S4 krok 1): prawa łączenia na prawdziwym sejfie w topologii produkcyjnej — jeden blob konta
// (pobierz, scal, wyślij), jak synchronizacja przez serwer. Mały deterministyczny podzbiór fuzzu praw sędziego „algebra”
// (zestaw C: 20 programów po 12 kroków, ziarna 1001–1020, każdy w 6 harmonogramach wymiany). Ten sam program kroków
// lokalnych (poprawka, gwiazdka, odpięcie, „Odepnij i usuń”, retencja, „Przywróć”, nowa wizyta, wymiany w trakcie)
// odtwarzany deterministycznie (ziarno: kroki, IV szyfru, identyfikatory, Math.random), potem harmonogram wymiany przez
// blob, 4 rundy i runda kontrolna z licznikiem zapisów. Dane wyłącznie fikcyjne („Testowy Jan”). Sprawdzane prawa:
//   L1 przemienność:   A dostaje B∪C łańcuchem w dwóch kolejnościach — ten sam widok A;
//   L2 łączność:       A←B←C, B←C←A i C←B←A (przez blob) — ten sam widok A;
//   L3 idempotencja:   A pobiera ponownie blob, który sam wysłał — stan bez zmian, 0 zapisów (D6);
//   G1 zbieżność:      po rundach ten sam pełny stan (widok, rev, eksportowany nagrobek) na P, K, C;
//   G2 harmonogram:    ten sam widok końcowy w każdym harmonogramie;
//   G3 stabilność:     runda kontrolna bez zapisów i bez zmiany stanu.
// Pełny stan zależny od harmonogramu (rev i opis nagrobka po plotce, D7) jest znanym ograniczeniem — tu tylko widok.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
let licznik = 0;
function owin(baza, licz) {
  return new Proxy(baza, {
    get(cel, k) {
      const f = cel[k];
      if (typeof f !== 'function') return f;
      if (k === 'putUserMeta') {
        return async function (...a) {
          const przed = JSON.stringify(((await cel.getUserMeta(a[0])) || {}).snapshotTombstones || null);
          const po = JSON.stringify((a[1] && a[1].snapshotTombstones) || null);
          if (przed !== po) { licz.lista += 1; if (licz.zapamietaj) licz.roznice.push({ przed: JSON.parse(przed), po: JSON.parse(po) }); }
          return f.apply(cel, a);
        };
      }
      if (k === 'putSnapshotForUser' || k === 'removeSnapshotForUser') return function (...a) { licz.wersje += 1; return f.apply(cel, a); };
      if (k === 'putPatientForUser' || k === 'removePatientForUser') return function (...a) { licz.karty += 1; return f.apply(cel, a); };
      return function (...a) { return f.apply(cel, a); };
    },
  });
}
async function urzadzenie(ziarnoId) {
  licznik += 1;
  const los16 = rng(ziarnoId);
  const losU = rng(ziarnoId * 31 + 7);
  const hx = () => Math.floor(losU() * 16).toString(16);
  const crypto = {
    subtle: globalThis.crypto.subtle,
    getRandomValues: (x) => {
      if (x instanceof Uint8Array && x.length === 16) { for (let i = 0; i < 16; i += 1) x[i] = Math.floor(los16() * 256); return x; }
      if (x instanceof Uint8Array && x.length === 12) { for (let i = 0; i < 12; i += 1) x[i] = Math.floor(los16() * 256); return x; }
      return globalThis.crypto.getRandomValues(x);
    },
    randomUUID: () => 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, hx),
  };
  const win = {
    crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {}, AbortController,
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_retention.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  const licz = { lista: 0, wersje: 0, karty: 0 };
  v.setStorageAdapter(owin(v.createInMemoryAdapter(), licz));
  await v.createUser(`Polkrata#Prawa!2026${licznik}aa`, { label: `dev${licznik}`, iterations: 2000 });
  v.__licz = licz;
  return v;
}
let zegar = 0;
let off = [0, 0, 0];
const ustaw = (dev) => vi.setSystemTime(zegar + (dev == null ? 0 : off[dev]));
async function naUrz(dev, fn) { ustaw(dev); try { return await fn(); } finally { ustaw(null); } }
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const jan = (height, weight) => ({
  name: 'Testowy Jan',
  user: { lastName: 'Testowy', firstName: 'Jan', dobISO: '2016-03-12', sex: 'M', height, weight },
});
const kopia = (x) => JSON.parse(JSON.stringify(x));
const NAZ = 'PKC';
const OFFS = [0, 600e3, -300e3];
const SEEDS = 20;
const START = 1001;
const KROKI = 12;
const CELE = [3, 4, 5];
// progi skumulowane: sync, poprawka, gwiazdka, odpięcie, kosz, retencja, przywróć, (reszta) wizyta
const PW = [0.16, 0.36, 0.52, 0.60, 0.76, 0.90, 0.96];
const ZEGAR = false;
const HARM_LOS = 2;
const TOPO = 'blob';

async function przebieg({ seed, harm }) {
  const r = rng(seed);
  const mrr = rng(((seed * 2654435761) ^ 0x9e3779b9) >>> 0);
  vi.spyOn(Math, 'random').mockImplementation(() => mrr());
  zegar = Date.parse('2026-10-01T08:00:00Z') + (seed % 97) * 3 * 864e5;
  off = [0, 0, 0];
  ustaw(null);
  const offWyl = [0, 1, 2].map(() => OFFS[Math.floor(r() * 3)]);
  const P = await urzadzenie(seed * 8 + 1); const K = await urzadzenie(seed * 8 + 2); const C = await urzadzenie(seed * 8 + 3);
  const D = [P, K, C];
  const ids = []; const ix = (sid) => { let k = ids.indexOf(sid); if (k < 0) { ids.push(sid); k = ids.length - 1; } return k; };
  const log = []; const bledy = [];
  const tr = (s) => [s.payload.user.height, s.payload.user.weight, !!(s.pinned || (s.payload && s.payload._pinned))];
  const znajdz = async (v, sid) => {
    for (const p of await v.listPatients()) {
      const pp = await v.getPatient(p.patientId);
      if (!pp) continue;
      const k = pp.snapshots.findIndex((s) => s.snapshotId === sid);
      if (k >= 0) return { pid: p.patientId, s: pp.snapshots[k], glowa: k === 0 };
    }
    return null;
  };
  const stan = async (v) => {
    const kk = [];
    for (const p of await v.listPatients()) {
      const pp = await v.getPatient(p.patientId);
      if (!pp) continue;
      for (const s of pp.snapshots) kk.push([ix(s.snapshotId), s.rev || 0, s.updatedAtISO || null, s.savedAtISO || null, ...tr(s)]);
    }
    kk.sort((a, b) => a[0] - b[0]);
    const kosz = (await v.listTrashedSnapshots()).map((e) => [ix(e.snapshotId), e.payload ? e.payload.user.height : null, e.payload ? e.payload.user.weight : null, !!e.pinned, e.deletedAtISO]).sort((a, b) => a[0] - b[0]);
    const ex = await v.exportSyncPayload();
    const nagr = (ex.snapshotTombstones || []).map((e) => [ix(e.snapshotId), e.deletedAtISO, e.rev, e.updatedAtISO || null, e.savedAtISO || null, e.powod || null, e.przycietoISO || null, e.zmianaISO || null, e.koszISO || null, e.revPary ? JSON.stringify(e.revPary) : null, e.payload ? e.payload.user.height : null, e.payload ? e.payload.user.weight : null, !!(e.payload && e.payload._pinned)]).sort((a, b) => a[0] - b[0]);
    const widok = [...kk.map((x) => ['k', x[0], x[4], x[5], x[6]]), ...kosz.map((x) => ['t', x[0], x[1], x[2], x[3]])].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
    return { widok: JSON.stringify(widok), pelny: JSON.stringify({ kk, kosz, nagr }) };
  };
  // tylko wpisy listy nagrobków, które się zmieniły (lokalnie, z Bpk / cien)
  const roznice = (lista) => lista.map(({ przed, po }) => {
    const a = new Map((przed || []).map((e) => [e.snapshotId, JSON.stringify(e)]));
    const b = new Map((po || []).map((e) => [e.snapshotId, JSON.stringify(e)]));
    const ids = new Set([...a.keys(), ...b.keys()]);
    return [...ids].filter((k) => a.get(k) !== b.get(k)).map((k) => ({ i: ix(k), przed: a.get(k) || null, po: b.get(k) || null }));
  });
  const sync0 = async (zi, nai) => { const l = kopia(await naUrz(zi, () => D[zi].exportSyncPayload())); await naUrz(nai, () => D[nai].mergeSyncPayload(l)); };
  // Topologia „blob” (produkcja: jeden blob konta, PUT z If-Match): urządzenie pobiera blob, scala, wysyła swój eksport.
  let blob = null;
  const blobSync = async (di) => { if (blob) await naUrz(di, () => D[di].mergeSyncPayload(kopia(blob))); blob = kopia(await naUrz(di, () => D[di].exportSyncPayload())); };
  const sync = TOPO === 'blob' ? async (zi, nai) => { await blobSync(zi); await blobSync(nai); } : sync0;
  // Przygotowanie: X — 4 dni × 3 wizyty na K, komplet na P i C.
  let pidX = null;
  for (let d = 0; d < 4; d += 1) {
    for (let j = 0; j < 3; j += 1) {
      zegar += 60e3; ustaw(null);
      const x = await K.savePatient(jan(100 + ids.length, 20 + ids.length), { dedup: false, ...(pidX ? { patientId: pidX } : {}) });
      pidX = x.patientId; ix(x.snapshotId);
    }
    zegar += 864e5 - 3 * 60e3;
  }
  await sync0(1, 0); await sync0(1, 2);
  if (TOPO === 'blob') blob = kopia(await K.exportSyncPayload());
  zegar += 3600e3; ustaw(null);
  off = ZEGAR ? offWyl : [0, 0, 0];
  const pula = CELE.slice();
  for (let k = 0; k < KROKI; k += 1) {
    const los = { dt: r(), x: r(), dev: Math.floor(r() * 3), sidR: r(), rz: r(), rkg: r(), rpole: r(), rl: r(), rtyp: r(), rpres: r() };
    zegar += 60e3 + Math.floor(los.dt * 120e3); ustaw(null);
    const { x, dev } = los;
    const v = D[dev]; const N = NAZ[dev];
    // Cel: losowy z puli, ale obecny na tym urządzeniu (w karcie), gdy któryś jest — inaczej krok trafia w „brak”.
    let si = pula[Math.floor(los.sidR * pula.length)];
    if (!(await naUrz(dev, () => znajdz(v, ids[si])))) {
      const obecne = [];
      for (const q of pula) if (await naUrz(dev, () => znajdz(v, ids[q]))) obecne.push(q);
      if (obecne.length) si = obecne[Math.floor(los.sidR * obecne.length)];
    }
    const sid = ids[si];
    try {
      await naUrz(dev, async () => {
        if (x < PW[0]) {
          let z = Math.floor(los.rz * 3); if (z === dev) z = (z + 1) % 3;
          await sync(z, dev); log.push(`${N}←${NAZ[z]}`);
        } else if (x < PW[1]) {
          const c = await znajdz(v, sid);
          if (!c) { log.push(`${N}:popraw(${si},brak)`); return; }
          const pole = los.rpole < 0.5 ? 'weight' : 'height';
          const wart = pole === 'weight' ? 30 + Math.floor(los.rkg * 60) : 100.5 + Math.floor(los.rkg * 60);
          await v.updateSnapshotPayload(c.pid, sid, { ...c.s.payload, user: { ...c.s.payload.user, [pole]: wart } }, { preserveSavedAt: true });
          log.push(`${N}:popraw(${si},${pole === 'weight' ? 'kg' : 'cm'}=${wart})`);
        } else if (x < PW[3]) {
          const naCo = x < PW[2];
          const c = await znajdz(v, sid);
          if (!c) { log.push(`${N}:${naCo ? 'gwiazdka' : 'odepnij'}(${si},brak)`); return; }
          await v.setSnapshotPinned(c.pid, sid, naCo);
          log.push(`${N}:${naCo ? 'gwiazdka' : 'odepnij'}(${si})`);
        } else if (x < PW[4]) {
          const c = await znajdz(v, sid);
          if (!c) { log.push(`${N}:kosz(${si},brak)`); return; }
          await v.moveSnapshotToTrash(c.pid, sid, { odepnij: true });
          log.push(`${N}:kosz(${si}${tr(c.s)[2] ? '*' : ''})`);
        } else if (x < PW[5]) {
          const pr = await v.pruneSnapshotsForPatient(pidX, { recentHours: 0 });
          log.push(`${N}:retencja(${pr.prunedIds.map((i) => ids.indexOf(i)).join('.')})`);
        } else if (x < PW[6]) {
          const l = await v.listTrashedSnapshots();
          if (!l.length) { log.push(`${N}:przywroc(pusto)`); return; }
          const e = l[Math.floor(los.rl * l.length)];
          const w = await v.restoreTrashedSnapshot(e.patientId, e.snapshotId);
          log.push(`${N}:przywroc(${ix(e.snapshotId)}${w && w.alreadyInCard ? ',juz' : ''})`);
        } else {
          const x2 = await v.savePatient(jan(140 + (k % 20), 40 + Math.floor(los.rkg * 20)), { dedup: false, patientId: pidX });
          const i = ix(x2.snapshotId); pula.push(i);
          log.push(`${N}:wizyta(${i})`);
        }
      });
    } catch (er) {
      bledy.push({ k, dev, kod: (er && er.code) || null, msg: String(er && er.message).slice(0, 160) });
      log.push(`${N}:blad(${(er && (er.code || er.message)) || er})`);
    }
  }
  // Faza 2: harmonogram (lista par [na, z]).
  const wynik = { seed, harm: harm.nazwa, log, bledy, A: harm.A };
  if (harm.blob) { for (const d of harm.blob) { zegar += 60e3; ustaw(null); await blobSync(d); } }
  else for (const [na, z] of harm.kroki) { zegar += 60e3; ustaw(null); await sync(z, na); }
  const sA = await stan(D[harm.A]);
  wynik.poPrefiksie = sA;
  if (harm.powtorzBlob) {
    // L3 (blob): to samo urządzenie pobiera ten sam blob drugi raz (nikt inny w międzyczasie nie wysłał).
    const l = D[harm.A].__licz; Object.assign(l, { lista: 0, wersje: 0, karty: 0, zapamietaj: true, roznice: [] });
    zegar += 60e3; ustaw(null);
    await naUrz(harm.A, () => D[harm.A].mergeSyncPayload(kopia(blob)));
    l.zapamietaj = false;
    wynik.powtorzZapisy = { lista: l.lista, wersje: l.wersje, karty: l.karty };
    wynik.powtorzStan = await stan(D[harm.A]);
    if (l.roznice.length) wynik.powtorzRoznice = roznice(l.roznice);
  }
  if (harm.powtorz) {
    // L3: ponowne scalenie tych samych ładunków (stan źródeł się nie zmienił) — 0 zapisów, stan bez zmian.
    const l = D[harm.A].__licz; Object.assign(l, { lista: 0, wersje: 0, karty: 0, zapamietaj: true, roznice: [] });
    for (const [na, z] of harm.powtorz) { zegar += 60e3; ustaw(null); await sync(z, na); }
    l.zapamietaj = false;
    wynik.powtorzZapisy = { lista: l.lista, wersje: l.wersje, karty: l.karty };
    if (l.roznice.length) wynik.powtorzRoznice = roznice(l.roznice);
    wynik.powtorzStan = await stan(D[harm.A]);
  }
  const runda = TOPO === 'blob' ? async () => { await blobSync(0); await blobSync(1); await blobSync(2); }
    : async () => { await sync(1, 0); await sync(0, 1); await sync(1, 2); await sync(2, 1); await sync(0, 2); await sync(2, 0); };
  try {
    for (let i = 0; i < 4; i += 1) { zegar += 60e3; ustaw(null); await runda(); }
    const s1 = await Promise.all(D.map(stan));
    for (const v of D) Object.assign(v.__licz, { lista: 0, wersje: 0, karty: 0 });
    zegar += 60e3; ustaw(null);
    await runda();
    const s2 = await Promise.all(D.map(stan));
    wynik.koniec = s1;
    wynik.kontrolaZapisy = D.map((v) => ({ ...v.__licz }));
    wynik.niestabilny = JSON.stringify(s1) !== JSON.stringify(s2);
  } catch (er) { wynik.wyjatek = String(er && (er.stack || er.message)).slice(0, 600); }
  return wynik;
}

function harmonogramy(seed) {
  const r = rng(seed * 7919 + 17);
  const A = Math.floor(r() * 3); const B = (A + 1) % 3; const C = (A + 2) % 3;
  if (TOPO === 'blob') {
    // L1 (blob): A dostaje B∪C łańcuchem w dwóch kolejnościach; L3: A pobiera ten sam blob ponownie.
    const h = [
      { nazwa: 'L-AB-AC', A, blob: [B, C, A], powtorzBlob: true },
      { nazwa: 'L-AC-AB', A, blob: [C, B, A] },
      { nazwa: 'L-BC-AB', A, blob: [A, B, C, A] },
      { nazwa: 'L-CB-AC', A, blob: [A, C, B, A] },
    ];
    for (let j = 0; j < HARM_LOS; j += 1) {
      const kol = []; for (let i = 0; i < 6; i += 1) kol.push(Math.floor(r() * 3));
      h.push({ nazwa: `R${j}:blob ${kol.map((d) => NAZ[d]).join(',')}`, A, blob: kol });
    }
    return h;
  }
  const h = [
    { nazwa: 'L-AB-AC', A, kroki: [[A, B], [A, C]], powtorz: [[A, C], [A, B]] },
    { nazwa: 'L-AC-AB', A, kroki: [[A, C], [A, B]] },
    { nazwa: 'L-BC-AB', A, kroki: [[B, C], [A, B]] },
    { nazwa: 'L-CB-AC', A, kroki: [[C, B], [A, C]] },
  ];
  for (let j = 0; j < HARM_LOS; j += 1) {
    const kroki = [];
    for (let i = 0; i < 6; i += 1) { const na = Math.floor(r() * 3); let z = Math.floor(r() * 3); if (z === na) z = (z + 1) % 3; kroki.push([na, z]); }
    h.push({ nazwa: `R${j}:${kroki.map(([na, z]) => `${NAZ[na]}←${NAZ[z]}`).join(',')}`, A, kroki });
  }
  return h;
}

describe('prawa łączenia w topologii blob (zestaw C, 20 programów)', () => {
  for (let i = 0; i < SEEDS; i += 1) {
    const seed = START + i;
    it(`program ${seed}: L1, L2, L3, G1, G2, G3`, async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const wyniki = [];
      for (const harm of harmonogramy(seed)) {
        wyniki.push(await przebieg({ seed, harm }));
        vi.restoreAllMocks();
      }
      const log = wyniki[0].log.join(' ');
      for (const w of wyniki) {
        expect(w.wyjatek || null, `${w.harm}: wyjątek (${log})`).toBeNull();
        expect(w.niestabilny, `${w.harm}: G3 stan po rundzie kontrolnej (${log})`).toBe(false);
        expect(w.kontrolaZapisy.map((z) => [z.lista, z.wersje, z.karty]), `${w.harm}: G3 zapisy w rundzie kontrolnej (${log})`).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
        expect(new Set(w.koniec.map((s) => s.pelny)).size, `${w.harm}: G1 pełny stan na P, K, C (${log})`).toBe(1);
      }
      expect(new Set(wyniki.map((w) => JSON.stringify(w.koniec.map((s) => s.widok)))).size, `G2 widok w 6 harmonogramach (${log})`).toBe(1);
      const h = Object.fromEntries(wyniki.map((w) => [w.harm.split(':')[0], w]));
      expect(h['L-AC-AB'].poPrefiksie.widok, `L1 (${log})`).toBe(h['L-AB-AC'].poPrefiksie.widok);
      expect(h['L-BC-AB'].poPrefiksie.widok, `L2 (${log})`).toBe(h['L-AB-AC'].poPrefiksie.widok);
      expect(h['L-CB-AC'].poPrefiksie.widok, `L2 (${log})`).toBe(h['L-AB-AC'].poPrefiksie.widok);
      const a = h['L-AB-AC'];
      expect(a.powtorzZapisy, `L3 zapisy przy ponownym pobraniu własnego bloba (${log}) ${JSON.stringify(a.powtorzRoznice || null).slice(0, 600)}`).toEqual({ lista: 0, wersje: 0, karty: 0 });
      expect(a.powtorzStan.pelny, `L3 stan (${log})`).toBe(a.poPrefiksie.pelny);
    }, 120_000);
  }
});
