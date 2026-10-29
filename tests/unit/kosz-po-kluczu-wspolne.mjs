// P-KOSZ-PO-KLUCZU (PR-E3) — pomocniki katalogu kosz-po-kluczu.test.mjs: pełny stan urządzenia (wszystkie karty
// i wersje, kosz, nagrobki pacjentów i wersji), przebieg z wyborem kolejności rund i scenariusze. Prawdziwy
// vilda_vault.js przez s4d7-wspolne.mjs (sejfy w pamięci, sztuczny zegar, licznik zapisów). Dane wyłącznie fikcyjne
// („Testowy Jan”, „Testowa Ola”).
import { vi } from 'vitest';
import {
  PRZYGOTOWANIA, sztucznyZegar, przesunZegar, zegar, sync, jan, ola, gdzieJest, popraw, przypnij, doKosza, scalPacjentow,
} from './s4d7-wspolne.mjs';

const rel = (u, iso) => (typeof iso === 'string' && iso ? `${((Date.parse(iso) - u.t0) / 60e3).toFixed(3).replace(/\.?0+$/, '')}` : null);
// Wersje bez etykiety (głowy „Scal pacjentów”: nowy identyfikator przy każdym przebiegu) — „m” z chwilą zapisu.
const etykieta = (u, sid, sav) => (u.wersje && u.wersje[sid]) || (sid === u.sid ? 'x' : sid === u.s1 ? 's1' : `m${rel(u, sav)}`);
const karta = (u, pid) => (u.karty && u.karty[pid]) || pid.slice(0, 6);

// Pełny stan urządzenia: karty (z wersjami: masa, gwiazdka, rev, chwile), kosz, nagrobki pacjentów i nagrobki wersji.
export async function pelnyStan(u, v) {
  const karty = [];
  for (const p of await v.listPatients()) {
    const pp = await v.getPatient(p.patientId);
    karty.push({
      karta: karta(u, p.patientId), n: p.snapshotCount, last: rel(u, p.lastSavedAtISO),
      wersje: (pp ? pp.snapshots : []).map((s) => ({
        w: etykieta(u, s.snapshotId, s.savedAtISO), kg: s.payload && s.payload.user ? s.payload.user.weight : null, pin: !!s.pinned, rev: s.rev,
        upd: rel(u, s.updatedAtISO), sav: rel(u, s.savedAtISO), cz: rel(u, s.payload && s.payload._contentAtISO),
      })),
    });
  }
  karty.sort((a, b) => (a.karta < b.karta ? -1 : a.karta > b.karta ? 1 : 0));
  const kosz = (await v.listTrashedSnapshots()).map((e) => ({
    w: etykieta(u, e.snapshotId, e.savedAtISO), karta: karta(u, e.patientId), kg: e.payload && e.payload.user ? e.payload.user.weight : null,
    pin: !!e.pinned, del: rel(u, e.deletedAtISO), rev: e.rev,
  })).sort((a, b) => (a.w < b.w ? -1 : 1));
  const ex = await v.exportSyncPayload();
  const nagrP = (ex.tombstones || []).map((t) => karta(u, t.patientId)).sort();
  const nagrW = (ex.snapshotTombstones || []).map((e) => ({
    w: etykieta(u, e.snapshotId, e.savedAtISO), karta: karta(u, e.patientId), powod: e.powod || 'kosz', del: rel(u, e.deletedAtISO), rev: e.rev,
    kg: e.payload && e.payload.user ? e.payload.user.weight : null,
  })).sort((a, b) => (a.w < b.w ? -1 : 1));
  return { karty, kosz, nagrP, nagrW };
}
// Widok: „Z[x1,x3,z] Y[] | kosz x@Z:74 | nagr X,Y”; masa i gwiazdka przy x (i s1) w kartach.
export function widok(s) {
  const kk = s.karty.map((k) => `${k.karta}[${k.wersje.map((w) => (w.w === 'x' || w.w === 's1' ? `${w.w}:${w.kg}${w.pin ? '*' : ''}` : w.w)).join(',')}]`).join(' ');
  const ko = s.kosz.map((e) => `kosz ${e.w}@${e.karta}:${e.kg}${e.pin ? '*' : ''}`).join(' ');
  return [kk, ko, s.nagrP.length ? `nagr ${s.nagrP.join(',')}` : ''].filter(Boolean).join(' | ');
}

// Kolejności rund pełnej wymiany: katalog s4d7 (K→P, P→K, K→C, C→K, P→C, C→P) i cel.md (P→K, P→C, K→P, K→C, C→P, C→K).
export const RUNDY = {
  katalog: [['K', 'P'], ['P', 'K'], ['K', 'C'], ['C', 'K'], ['P', 'C'], ['C', 'P']],
  cel: [['P', 'K'], ['P', 'C'], ['K', 'P'], ['K', 'C'], ['C', 'P'], ['C', 'K']],
};
const DEV3 = ['P', 'K', 'C'];

// Przebieg: przygotowanie, kroki (co minutę), pierwsze scalenia w danej kolejności, 3 rundy, pomiar, runda kontrolna
// z licznikiem zapisów (lista nagrobków wersji, wersje, karty), pomiar po niej.
export async function przebiegE3(scen, kolejnosc, runda = 'katalog') {
  sztucznyZegar();
  const u = await PRZYGOTOWANIA[scen.przygotuj]();
  u.dziennik = []; u.warunki = []; u.warunkiBledne = false; u.slad = [];
  u.t0 = zegar.t;
  if (scen.przygotuj === 'trzyKarty') {
    // Lista wersji karty od najnowszej: x3 (130 cm / 25 kg), x, x1 (120 cm / 20 kg).
    const x = (await u.K.getPatient(u.X)).snapshots;
    u.wersje = { [x[2].snapshotId]: 'x1', [u.sid]: 'x', [x[0].snapshotId]: 'x3' };
    u.wersje[(await u.K.getPatient(u.Y)).snapshots[0].snapshotId] = 'y';
    u.wersje[(await u.K.getPatient(u.Z)).snapshots[0].snapshotId] = 'z';
  } else {
    u.X = u.pid; u.karty = { [u.pid]: 'X' }; u.wersje = { [u.s1]: 's1', [u.sid]: 'x' };
  }
  przesunZegar(60e3);
  await scen.kroki(u);
  for (const k of kolejnosc.split(',')) { const [na, z] = k.split('←'); await sync(u[z], u[na]); }
  for (let r = 0; r < 3; r += 1) for (const [z, na] of RUNDY[runda]) await sync(u[z], u[na]);
  const st = {};
  for (const n of DEV3) st[n] = await pelnyStan(u, u[n]);
  for (const n of DEV3) Object.assign(u[n].__licz, { aktywny: true, lista: 0, wersje: 0, karty: 0, inne: 0 });
  for (const [z, na] of RUNDY[runda]) await sync(u[z], u[na]);
  const zapisy = {};
  for (const n of DEV3) { u[n].__licz.aktywny = false; zapisy[n] = { lista: u[n].__licz.lista, wersje: u[n].__licz.wersje, karty: u[n].__licz.karty }; }
  const st2 = {};
  for (const n of DEV3) st2[n] = await pelnyStan(u, u[n]);
  const j = JSON.stringify;
  return {
    u, st, zapisy,
    widoki: Object.fromEntries(DEV3.map((n) => [n, widok(st[n])])),
    zbieznyPelny: DEV3.every((n) => j(st[n]) === j(st.P)),
    stabilny: j(st) === j(st2),
  };
}

// --- kroki ------------------------------------------------------------------------------------------------------------
export const XYZ = async (u) => { await scalPacjentow(u, 'K', 'X', 'Y'); await scalPacjentow(u, 'K', 'Y', 'Z'); };
export async function naZegarze(ms, fn) {
  vi.setSystemTime(zegar.t + ms);
  try { return await fn(); } finally { vi.setSystemTime(zegar.t); }
}
// Nowa wizyta (135 cm / 27 kg) w karcie X na urządzeniu n.
export async function nowaWizyta(u, n) {
  const r = await u[n].savePatient(jan(135, 27), { dedup: false, patientId: u.X });
  u.wersje[r.snapshotId] = 'nowa';
  przesunZegar(60e3);
}
export async function przytnijKarte(u, n, pid) {
  const r = await u[n].pruneSnapshotsForPatient(pid, { recentHours: 0 });
  const ok = r.prunedIds.includes(u.sid);
  u.warunki.push(`${n} retencja przycina x: ${ok}`);
  if (!ok) u.warunkiBledne = true;
  przesunZegar(60e3);
}
export async function przywroc(u, n) {
  let w;
  try { w = await u[n].restoreTrashedSnapshot(u.pid, u.sid); } catch (er) { w = { blad: er.code || er.message }; }
  u.przywroc = w.blad ? `błąd ${w.blad}` : w.alreadyInCard ? 'już w karcie' : 'przywrócono';
  przesunZegar(60e3);
}
const koszS1 = async (u, n) => { await doKosza(u, n, u.s1); };
// Poprawka masy x z nową chwilą zapisu (preserveSavedAt: false) — savedAtISO wersji też się zmienia.
async function poprawNowyZapis(u, n, kg) {
  const g = await gdzieJest(u[n], u.sid);
  await u[n].updateSnapshotPayload(g.pid, u.sid, { ...g.s.payload, user: { ...g.s.payload.user, weight: kg } }, { preserveSavedAt: false });
  przesunZegar(60e3);
}
// Identyfikator wersji o etykiecie (x1, x3, y, z) z przygotowania trzyKarty.
const idWersji = (u, et) => Object.keys(u.wersje).find((s) => u.wersje[s] === et);

// --- scenariusze ------------------------------------------------------------------------------------------------------
export const SCEN = {
  // rodzina E4b: wpis kosza wersji pod kartą docelową „Scal pacjentów”, wersja jeszcze pod starą kartą
  E4b: { przygotuj: 'trzyKarty', kroki: async (u) => { await XYZ(u); await popraw(u, 'P', 74); await doKosza(u, 'K'); } },
  'E4b-1': { przygotuj: 'trzyKarty', kroki: async (u) => { await scalPacjentow(u, 'K', 'X', 'Y'); await popraw(u, 'P', 74); await doKosza(u, 'K'); } },
  'E4b-pin': { przygotuj: 'trzyKarty', kroki: async (u) => { await XYZ(u); await przypnij(u, 'P', true); await doKosza(u, 'K'); } },
  'E4b-C': { przygotuj: 'trzyKarty', kroki: async (u) => { await XYZ(u); await popraw(u, 'C', 74); await doKosza(u, 'K'); } },
  'E4b-2w': { przygotuj: 'trzyKarty', kroki: async (u) => { await XYZ(u); await popraw(u, 'P', 74); await nowaWizyta(u, 'P'); await doKosza(u, 'K'); } },
  'kosz-przed': { przygotuj: 'trzyKarty', kroki: async (u) => { await doKosza(u, 'P'); await scalPacjentow(u, 'K', 'X', 'Y'); } },
  'kosz-po': { przygotuj: 'trzyKarty', kroki: async (u) => { await scalPacjentow(u, 'K', 'X', 'Y'); await doKosza(u, 'P'); } },
  'kosz-po-2': { przygotuj: 'trzyKarty', kroki: async (u) => { await XYZ(u); await popraw(u, 'C', 74); await doKosza(u, 'P'); } },
  'E4b-ret': { przygotuj: 'trzyKarty', kroki: async (u) => { await XYZ(u); await popraw(u, 'P', 74); await przytnijKarte(u, 'K', u.Z); } },
  'E4b-ret-pin': { przygotuj: 'trzyKarty', kroki: async (u) => { await XYZ(u); await przypnij(u, 'P', true); await przytnijKarte(u, 'K', u.Z); } },
  'E4b-bez-kosza': { przygotuj: 'trzyKarty', kroki: async (u) => { await XYZ(u); await popraw(u, 'P', 74); } },
  // np-ret-A1: retencja starej karty X na urządzeniu bez wiedzy (C), zmiana x w X na drugim (P), „Scal pacjentów”
  // X → Y na trzecim (K) — wersja wygrywająca z retencją przechodzi pod Y za scaleniem (Bsw_przezyteRetencji)
  'npret-pin': { przygotuj: 'trzyKarty', kroki: async (u) => { await przypnij(u, 'P', true); await przytnijKarte(u, 'C', u.X); await scalPacjentow(u, 'K', 'X', 'Y'); } },
  'npret-popr': { przygotuj: 'trzyKarty', kroki: async (u) => { await przytnijKarte(u, 'C', u.X); await popraw(u, 'P', 74); await scalPacjentow(u, 'K', 'X', 'Y'); } },
  // przycięcie na urządzeniu scalającym, pod kartą docelową (E4a-ret-pin z jednym scaleniem)
  'npret-K': { przygotuj: 'trzyKarty', kroki: async (u) => { await przypnij(u, 'P', true); await scalPacjentow(u, 'K', 'X', 'Y'); await przytnijKarte(u, 'K', u.Y); } },
  // jak npret-pin, a żadna wersja X nie przechodzi w tej fazie: x3 (jedyna nieprzycięta) do kosza na K pod Y — karta
  // docelowa z wpisu kosza x3; albo do kosza na P w X przed przycięciem — karta docelowa z ładunku K (x3 pod Y)
  'npret-kosz3-K': { przygotuj: 'trzyKarty', kroki: async (u) => { await przypnij(u, 'P', true); await przytnijKarte(u, 'C', u.X); await scalPacjentow(u, 'K', 'X', 'Y'); await doKosza(u, 'K', idWersji(u, 'x3')); } },
  // jak npret-pin, a karta docelowa W powstaje na K tuż przed scaleniem (P i C jej nie znają) — na P to nowa karta
  // z ładunku K
  'npret-nowaW': { przygotuj: 'trzyKarty', kroki: async (u) => {
    await przypnij(u, 'P', true); await przytnijKarte(u, 'C', u.X);
    const w = await u.K.savePatient(ola(112, 20), { dedup: false });
    Object.assign(u, { W: w.patientId }); u.karty[w.patientId] = 'W'; u.wersje[w.snapshotId] = 'w'; przesunZegar(60e3);
    await scalPacjentow(u, 'K', 'X', 'W');
  } },
  'npret-kosz3-P': { przygotuj: 'trzyKarty', kroki: async (u) => { await przypnij(u, 'P', true); await doKosza(u, 'P', idWersji(u, 'x3')); await przytnijKarte(u, 'C', u.X); await scalPacjentow(u, 'K', 'X', 'Y'); } },
  // Q8: ostatnia wersja karty, którą nagrobek oszczędza, przyjmuje nowszą treść kosza
  'PRZ0-bez': { przygotuj: 'jan2', kroki: async (u) => {
    await koszS1(u, 'P'); await naZegarze(10 * 60e3, () => doKosza(u, 'K')); await sync(u.K, u.P); await popraw(u, 'P', 78);
  } },
  'E1-popr-C': { przygotuj: 'jan2', kroki: async (u) => {
    await popraw(u, 'C', 74); await koszS1(u, 'P'); await naZegarze(10 * 60e3, () => doKosza(u, 'K'));
  } },
  'E1-C': { przygotuj: 'jan2', kroki: async (u) => { await popraw(u, 'C', 74); await koszS1(u, 'P'); await doKosza(u, 'K'); } },
  'E1-dwa': { przygotuj: 'jan2', kroki: async (u) => { await koszS1(u, 'P'); await doKosza(u, 'K'); } },
  // jak E1-C, ale poprawka C z nową chwilą zapisu: rekord całej nowszej wersji (Q8) bierze savedAtISO ze źródła treści
  'E1-C-sav': { przygotuj: 'jan2', kroki: async (u) => { await poprawNowyZapis(u, 'C', 74); await koszS1(u, 'P'); await doKosza(u, 'K'); } },
  // Q8 pod inną kartą: P „Scal pacjentów” X → Y, P daje do kosza y, x1 i głowę scalenia (na P Y = [x3, x]); K (bez
  // wiedzy o scaleniu) daje do kosza x i x3 w X — dwa wpisy kosza karty X, której na P nie ma, na obie wersje Y
  'Q8-obca-2': { przygotuj: 'trzyKarty', kroki: async (u) => {
    await scalPacjentow(u, 'P', 'X', 'Y');
    await doKosza(u, 'P', idWersji(u, 'y')); await doKosza(u, 'P', idWersji(u, 'x1'));
    for (const s of (await u.P.getPatient(u.Y)).snapshots) if (!u.wersje[s.snapshotId]) await doKosza(u, 'P', s.snapshotId);
    const naP = (await u.P.getPatient(u.Y)).snapshots.map((s) => u.wersje[s.snapshotId] || '?').join(',');
    u.warunki.push(`P: Y = [${naP}]`);
    if (naP !== 'x3,x') u.warunkiBledne = true;
    await doKosza(u, 'K'); await doKosza(u, 'K', idWersji(u, 'x3'));
  } },
  PRZ0: { przygotuj: 'jan2', kroki: async (u) => {
    await popraw(u, 'P', 78); await koszS1(u, 'P'); await doKosza(u, 'K'); await sync(u.K, u.P); await przywroc(u, 'P');
  } },
  PRZ: { przygotuj: 'jan2', kroki: async (u) => {
    await koszS1(u, 'P'); await naZegarze(10 * 60e3, () => doKosza(u, 'K')); await sync(u.K, u.P); await popraw(u, 'P', 78); await przywroc(u, 'P');
  } },
};
