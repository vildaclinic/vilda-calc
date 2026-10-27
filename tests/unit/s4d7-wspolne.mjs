// Pomiar S4 po D-7 (P-POZNIEJSZA-POPRAWKA, vilda_vault.js 222) — wspólne pomocniki i katalog scenariuszy.
// Prawdziwy vilda_vault.js (ten z katalogu repozytorium, w którym leży test), sejfy z magazynem w pamięci, sztuczny
// zegar (vi.useFakeTimers({ toFake: ['Date'] })), dane fikcyjne („Testowy Jan”, „Testowa Ola”). Wzorowane na
// tests/unit/kosz-nowsza-tresc.test.mjs i pomocnikach przeglądu zbieżności (zb-wspolne.mjs).
//
// Każdy scenariusz: przygotowanie (karta na K, komplet na pozostałych), kroki lokalne bez synchronizacji (każdy krok
// 1 min po poprzednim), pierwsze scalenia w danej kolejności („K←C,P←K” = najpierw K scala ładunek C, potem P scala
// ładunek K), 3 rundy pełnej wymiany (K→P, P→K, K→C, C→K, P→C, C→P; przy D jeszcze D↔K, D↔P, D↔C), opcjonalny krok po
// rundach (+3 rundy), pomiar stanu na każdym urządzeniu, potem dodatkowa runda z licznikiem zapisów.
import { vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodloSejfu = readFileSync(path.join(repoRoot, 'vilda_vault.js'), 'utf8');
// D-7 (222) ma stempel chwili zmiany; sejf sprzed D-7 (221, 54a84da3) — nie.
export const WERSJA_SEJFU = zrodloSejfu.includes('function Bpp_chwilaZmiany') ? 'd7-222' : 'baza-221';

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

// Licznik zapisów magazynu (tylko gdy licz.aktywny): lista nagrobków (putUserMeta ze zmienioną listą), wersje
// (put/removeSnapshotForUser), rekordy kart (put/removePatientForUser), reszta.
function owin(baza, licz) {
  return new Proxy(baza, {
    get(cel, k) {
      const f = cel[k];
      if (typeof f !== 'function') return f;
      if (k === 'putUserMeta') {
        return async function (...a) {
          if (licz.aktywny) {
            const przed = JSON.stringify(((await cel.getUserMeta(a[0])) || {}).snapshotTombstones || null);
            const po = JSON.stringify((a[1] && a[1].snapshotTombstones) || null);
            if (przed !== po) licz.lista += 1;
          }
          return f.apply(cel, a);
        };
      }
      if (typeof k === 'string' && /^(put|remove)/.test(k)) {
        return function (...a) {
          if (licz.aktywny) {
            if (k === 'putSnapshotForUser' || k === 'removeSnapshotForUser') licz.wersje += 1;
            else if (k === 'putPatientForUser' || k === 'removePatientForUser') licz.karty += 1;
            else licz.inne += 1;
          }
          return f.apply(cel, a);
        };
      }
      return function (...a) { return f.apply(cel, a); };
    },
  });
}

let licznik = 0;
export async function urzadzenie(nazwa) {
  licznik += 1;
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0'); // bez retencji w tle po zapisie — przycina tylko krok scenariusza
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_retention.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  const licz = { aktywny: false, lista: 0, wersje: 0, karty: 0, inne: 0 };
  v.setStorageAdapter(owin(v.createInMemoryAdapter(), licz));
  await v.createUser(`S4#Pomiar!2026${licznik}aa`, { label: `${nazwa}${licznik}`, iterations: 10000 });
  v.__nazwa = nazwa;
  v.__licz = licz;
  return v;
}

export const zegar = { t: Date.parse('2026-10-21T09:00:00Z') };
export function przesunZegar(ms) { zegar.t += ms; vi.setSystemTime(zegar.t); }
export function sztucznyZegar() { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(zegar.t); }

export const jan = (height, weight) => ({
  name: 'Testowy Jan',
  user: { lastName: 'Testowy', firstName: 'Jan', dobISO: '2016-03-12', sex: 'M', height, weight },
});
export const ola = (height, weight) => ({
  name: 'Testowa Ola',
  user: { lastName: 'Testowa', firstName: 'Ola', dobISO: '2017-05-01', sex: 'F', height, weight },
});
async function zapisz(v, p, opcje = {}) { przesunZegar(60e3); return v.savePatient(p, { dedup: false, ...opcje }); }
export async function sync(z, na) { await na.mergeSyncPayload(await z.exportSyncPayload()); }

// --- przygotowania ---------------------------------------------------------------------------------------------
// „Testowy Jan”, 12 wizyt na K (wzrost 100+i, masa 20+i), komplet na pozostałych; s = 4. wizyta (103 cm / 23 kg).
async function jan12(nazwy = ['P', 'K', 'C']) {
  const u = { urz: [] };
  for (const n of nazwy) { u[n] = await urzadzenie(n); u.urz.push(u[n]); }
  let pid = null;
  const ids = [];
  for (let i = 0; i < 12; i += 1) {
    const r = await zapisz(u.K, jan(100 + i, 20 + i), pid ? { patientId: pid } : {});
    pid = r.patientId;
    ids.push(r.snapshotId);
  }
  for (const v of u.urz) if (v !== u.K) await sync(u.K, v);
  Object.assign(u, { pid, ids, sid: ids[3], karty: { [pid]: 'J' } });
  return u;
}
// Dwie wizyty (s1 120 cm / 20 kg, s2 125 cm / 23 kg) — „Przywróć” przy ostatniej wersji karty (jak K7).
async function jan2() {
  const u = { urz: [] };
  for (const n of ['P', 'K', 'C']) { u[n] = await urzadzenie(n); u.urz.push(u[n]); }
  const s1 = await zapisz(u.K, jan(120, 20));
  const s2 = await zapisz(u.K, jan(125, 23), { patientId: s1.patientId });
  await sync(u.K, u.P); await sync(u.K, u.C);
  Object.assign(u, { pid: s1.patientId, sid: s2.snapshotId, s1: s1.snapshotId, karty: { [s1.patientId]: 'J' } });
  return u;
}
// E4: X (3 wizyty, s = druga, 125 cm / 23 kg), Y, Z (Ola) na K, komplet na P i C.
async function trzyKarty() {
  const u = { urz: [] };
  for (const n of ['P', 'K', 'C']) { u[n] = await urzadzenie(n); u.urz.push(u[n]); }
  const x1 = await zapisz(u.K, jan(120, 20));
  const X = x1.patientId;
  const x2 = await zapisz(u.K, jan(125, 23), { patientId: X });
  await zapisz(u.K, jan(130, 25), { patientId: X });
  const Y = (await zapisz(u.K, ola(110, 18))).patientId;
  const Z = (await zapisz(u.K, ola(111, 19))).patientId;
  await sync(u.K, u.P); await sync(u.K, u.C);
  Object.assign(u, { X, Y, Z, pid: X, sid: x2.snapshotId, karty: { [X]: 'X', [Y]: 'Y', [Z]: 'Z' } });
  return u;
}
export const PRZYGOTOWANIA = { jan12, jan12x4: () => jan12(['P', 'K', 'C', 'D']), jan2, trzyKarty };

// --- kroki --------------------------------------------------------------------------------------------------------
export async function gdzieJest(v, sid) {
  for (const p of await v.listPatients()) {
    const pp = await v.getPatient(p.patientId);
    const s = pp && pp.snapshots.find((q) => q.snapshotId === sid);
    if (s) return { pid: p.patientId, s };
  }
  return null;
}
function krok(u, opis) { u.dziennik.push(`t+${Math.round((zegar.t - u.t0) / 60e3)}m ${opis}`); }
export async function popraw(u, n, kg, sid = u.sid) {
  const g = await gdzieJest(u[n], sid);
  if (!g) throw new Error(`popraw: ${n} nie ma wersji`);
  await u[n].updateSnapshotPayload(g.pid, sid, { ...g.s.payload, user: { ...g.s.payload.user, weight: kg } }, { preserveSavedAt: true });
  krok(u, `${n}: poprawka masy ${kg} kg`); przesunZegar(60e3);
}
export async function przypnij(u, n, tak, sid = u.sid) {
  const g = await gdzieJest(u[n], sid);
  await u[n].setSnapshotPinned(g.pid, sid, tak);
  krok(u, `${n}: ${tak ? 'gwiazdka' : 'odpięcie'}`); przesunZegar(60e3);
}
export async function doKosza(u, n, sid = u.sid) {
  const g = await gdzieJest(u[n], sid);
  const r = await u[n].moveSnapshotToTrash(g.pid, sid, { odepnij: true });
  krok(u, `${n}: kosz${r.wasPinned ? ' (przypięta, z potwierdzeniem odpięcia)' : ''}`); przesunZegar(60e3);
  return r;
}
export async function przytnij(u, n, sid = u.sid) {
  const g = await gdzieJest(u[n], sid);
  const r = await u[n].pruneSnapshotsForPatient(g.pid, { recentHours: 0 });
  const ok = r.prunedIds.includes(sid);
  u.warunki.push(`${n} retencja przycina s: ${ok}`);
  if (!ok) u.warunkiBledne = true;
  krok(u, `${n}: retencja${ok ? '' : ' (NIE przycięła s)'}`); przesunZegar(60e3);
}
export async function scalPacjentow(u, n, z, na) {
  await u[n].mergePatients(u[z], u[na]);
  krok(u, `${n}: Scal pacjentów ${z} → ${na}`); przesunZegar(60e3);
}

// --- stan ---------------------------------------------------------------------------------------------------------
const rel = (u, iso) => (typeof iso === 'string' && iso ? `${((Date.parse(iso) - u.t0) / 60e3).toFixed(3).replace(/\.?0+$/, '')}` : null);
export async function stan(u, v, sid = u.sid) {
  const g = await gdzieJest(v, sid);
  const k = (await v.listTrashedSnapshots()).find((e) => e.snapshotId === sid) || null;
  const e = ((await v.exportSyncPayload()).snapshotTombstones || []).find((x) => x.snapshotId === sid) || null;
  return {
    status: g && k ? 'karta+kosz' : g ? 'karta' : k ? 'kosz' : 'brak',
    karta: g ? { karta: u.karty[g.pid] || '?', masa: g.s.payload.user.weight, pin: !!g.s.pinned, rev: g.s.rev, upd: rel(u, g.s.updatedAtISO), sav: rel(u, g.s.savedAtISO) } : null,
    kosz: k ? { masa: k.payload && k.payload.user.weight, pin: !!k.pinned, del: rel(u, k.deletedAtISO) } : null,
    nagrobek: e ? {
      del: rel(u, e.deletedAtISO), rev: e.rev, upd: rel(u, e.updatedAtISO), sav: rel(u, e.savedAtISO), powod: e.powod || null,
      przyc: rel(u, e.przycietoISO), zmiana: rel(u, e.zmianaISO),
      masa: e.payload ? e.payload.user.weight : null, pin: e.payload ? !!e.payload._pinned : null,
    } : null,
  };
}
// Krótki opis: „karta 74”, „karta 23*”, „kosz 78”, „karta 78 + kosz 23”, „brak”; przy kilku kartach z etykietą.
export function krotko(s, zEtykieta = false) {
  const kk = s.karta ? `karta${zEtykieta ? ' ' + s.karta.karta : ''} ${s.karta.masa}${s.karta.pin ? '*' : ''}` : '';
  const ko = s.kosz ? `kosz ${s.kosz.masa}${s.kosz.pin ? '*' : ''}` : '';
  return [kk, ko].filter(Boolean).join(' + ') || 'brak';
}

// --- przebieg -----------------------------------------------------------------------------------------------------
export function rundaPelna(u) {
  const p = [['K', 'P'], ['P', 'K'], ['K', 'C'], ['C', 'K'], ['P', 'C'], ['C', 'P']];
  if (u.D) p.push(['D', 'K'], ['K', 'D'], ['D', 'P'], ['P', 'D'], ['D', 'C'], ['C', 'D']);
  return p;
}
export async function rundy(u, ile = 3) {
  for (let r = 0; r < ile; r += 1) {
    for (const [z, na] of rundaPelna(u)) { await sync(u[z], u[na]); if (r === 0) await slad(u, `runda: ${na}←${z}`); }
  }
}
// Ślad (SLAD=1): po każdym kroku pierwszych scaleń i po każdej rundzie — krótki stan i nagrobek s na każdym urządzeniu.
async function slad(u, gdzie) {
  if (process.env.SLAD !== '1') return;
  const w = {};
  for (const v of u.urz) {
    const s = await stan(u, v);
    const n = s.nagrobek;
    w[v.__nazwa] = `${krotko(s)}${n ? ` [nagr ${n.powod === 'retencja' ? 'ret' : 'kosz'} del ${n.del}${n.przyc ? ' przyc ' + n.przyc : ''} rev ${n.rev} upd ${n.upd}${n.zmiana ? ' zm ' + n.zmiana : ''}${n.masa != null ? ' treść ' + n.masa + (n.pin ? '*' : '') : ''}]` : ''}`;
  }
  u.slad.push({ gdzie, ...w });
}
export async function pierwszeScalenia(u, kolejnosc) {
  for (const k of kolejnosc.split(',')) { const [na, z] = k.split('←'); await sync(u[z], u[na]); await slad(u, k); }
}
export async function przebieg(scen, kolejnosc) {
  sztucznyZegar();
  const u = await PRZYGOTOWANIA[scen.przygotuj]();
  u.dziennik = []; u.warunki = []; u.warunkiBledne = false; u.slad = [];
  u.t0 = zegar.t;
  przesunZegar(60e3);
  await scen.kroki(u);
  await slad(u, 'po krokach');
  await pierwszeScalenia(u, kolejnosc);
  await rundy(u, 3);
  let poRundach = null;
  if (scen.poRundach) { poRundach = await scen.poRundach(u); await rundy(u, 3); }
  const nazwy = u.urz.map((v) => v.__nazwa);
  const st = {};
  for (const v of u.urz) st[v.__nazwa] = await stan(u, v);
  // Dodatkowa runda z licznikiem zapisów (stan zbieżny nie powinien niczego zapisywać).
  for (const v of u.urz) Object.assign(v.__licz, { aktywny: true, lista: 0, wersje: 0, karty: 0, inne: 0 });
  await rundy(u, 1);
  const zapisy = {};
  for (const v of u.urz) { v.__licz.aktywny = false; zapisy[v.__nazwa] = { lista: v.__licz.lista, wersje: v.__licz.wersje, karty: v.__licz.karty, inne: v.__licz.inne }; }
  const st2 = {};
  for (const v of u.urz) st2[v.__nazwa] = await stan(u, v);
  const j = (x) => JSON.stringify(x);
  const wzor = st[nazwy[0]];
  return {
    u, st, zapisy, poRundach,
    zbieznyPelny: nazwy.every((n) => j(st[n]) === j(wzor)),
    zbieznyWidok: nazwy.every((n) => krotko(st[n], true) === krotko(wzor, true)),
    stabilny: j(st) === j(st2),
    krotko: Object.fromEntries(nazwy.map((n) => [n, krotko(st[n], scen.przygotuj === 'trzyKarty')])),
  };
}

// Krok na urządzeniu z zegarem przesuniętym o ms (rozjazd zegarów), potem z powrotem.
export async function naZegarze(u, ms, fn) {
  vi.setSystemTime(zegar.t + ms);
  try { return await fn(); } finally { vi.setSystemTime(zegar.t); }
}
// „Przywróć” s na P (ile razy, z 3 rundami po każdym, gdy wpis jeszcze jest w koszu P); stan przed i po.
async function przywrocNaP(u, ile) {
  const opis = { przed: { P: krotko(await stan(u, u.P)), K: krotko(await stan(u, u.K)), C: krotko(await stan(u, u.C)) }, proby: [] };
  for (let i = 0; i < ile; i += 1) {
    if (!(await u.P.listTrashedSnapshots()).some((e) => e.snapshotId === u.sid)) break;
    if (i > 0) przesunZegar(60e3);
    let wynik;
    try { wynik = await u.P.restoreTrashedSnapshot(u.pid, u.sid); } catch (er) { wynik = { blad: er.code || er.message }; }
    const w = wynik.blad ? `błąd ${wynik.blad}` : wynik.alreadyInCard ? 'już w karcie' : 'przywrócono';
    krok(u, `P: Przywróć s → ${w}`);
    const naP = krotko(await stan(u, u.P));
    przesunZegar(60e3);
    if (i < ile - 1) await rundy(u, 3);
    opis.proby.push({ wynik: w, naP, poRundach: i < ile - 1 ? { P: krotko(await stan(u, u.P)), K: krotko(await stan(u, u.K)), C: krotko(await stan(u, u.C)) } : null });
  }
  return opis;
}

// --- katalog ------------------------------------------------------------------------------------------------------
export const KOLEJNOSCI_8 = ['K←C,P←K', 'P←K,K←C', 'K←P,K←C', 'K←C,K←P', 'C←K,P←C', 'P←C,P←K', 'C←P,C←K', 'C←K,C←P'];
// S5 (4 urządzenia): 6 kolejności z przeglądu zbieżności (zb-s5.test.mjs) + 2.
export const KOLEJNOSCI_S5 = ['P←K,P←C,P←D,K←P', 'P←K,P←C,K←P,P←D', 'P←K,P←D,P←C,K←P', 'K←C,P←K,P←D,K←P', 'D←K,D←C,P←D', 'P←D,P←K,P←C', 'K←P,K←C,K←D', 'C←D,C←K,C←P'];

// „regula”: wynik zgodny z regułami po D-7 (LWW całej wersji, R1), na wszystkich urządzeniach i w każdej kolejności;
// „alternatywa”: wynik przy odczycie „gwiazdka chroni wizytę przed retencją bez względu na późniejszą poprawkę bez
// gwiazdki” (o ile się różni). Uzasadnienie — pomiar.md.
export const SCENARIUSZE = {
  S4: {
    opis: 't1 gwiazdka na P; t2 K (nie zna gwiazdki) — kosz; t3 C (nie zna ani gwiazdki, ani kosza) poprawia masę na 74; t4 C przycina retencją',
    przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await przypnij(u, 'P', true); await doKosza(u, 'K'); await popraw(u, 'C', 74); await przytnij(u, 'C'); },
    regula: 'brak', alternatywa: 'karta 23*',
  },
  'S4-kontrola': {
    opis: 'S4 bez kosza: t1 gwiazdka na P; t3 C poprawia na 74; t4 C przycina',
    przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await przypnij(u, 'P', true); przesunZegar(60e3); await popraw(u, 'C', 74); await przytnij(u, 'C'); },
    regula: 'brak', alternatywa: 'karta 23*',
  },
  S5: {
    opis: '4 urządzenia: P gwiazdka i poprawka 99 (rev 2); K kosz; D poprawia po koszu na 74 (rev 1); C przycina',
    przygotuj: 'jan12x4', kolejnosci: KOLEJNOSCI_S5,
    kroki: async (u) => { await przypnij(u, 'P', true); await popraw(u, 'P', 99); await doKosza(u, 'K'); await popraw(u, 'D', 74); await przytnij(u, 'C'); },
    regula: 'brak', alternatywa: 'karta 99*',
  },
  K10a: {
    opis: 'gwiazdka, odpięcie, gwiazdka na P (rev 3); później C poprawia na 58 (rev 1); K przycina',
    przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await przypnij(u, 'P', true); await przypnij(u, 'P', false); await przypnij(u, 'P', true); await popraw(u, 'C', 58); await przytnij(u, 'K'); },
    regula: 'brak', alternatywa: 'karta 23*',
  },
  K10b: {
    opis: 'C poprawia dwa razy (57, 58; rev 2) przed późniejszą gwiazdką na P (rev 1); K przycina',
    przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await popraw(u, 'C', 57); await popraw(u, 'C', 58); await przypnij(u, 'P', true); await przytnij(u, 'K'); },
    regula: 'karta 23*',
  },
  S6: {
    opis: 't1 gwiazdka na P (rev 1); t2 C poprawia na 58 (rev 1, później); t3 K przycina',
    przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await przypnij(u, 'P', true); await popraw(u, 'C', 58); await przytnij(u, 'K'); },
    regula: 'brak', alternatywa: 'karta 23*',
  },
  X5: {
    opis: 'P poprawia 2× (77, 78) i daje do kosza; C poprawia po koszu P (74); K (bez wiedzy) — kosz (23); C przycina',
    przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await popraw(u, 'P', 77); await popraw(u, 'P', 78); await doKosza(u, 'P'); await popraw(u, 'C', 74); await doKosza(u, 'K'); await przytnij(u, 'C'); },
    regula: 'kosz (jedna treść w każdej kolejności: 78 albo 23; 74 niedostępne — tylko w nagrobku retencji)',
  },
  S1: {
    opis: 'K poprawia na 99 i wysyła do C; K kosz; C poprawia po koszu (74); P (bez wiedzy) kosz później; C przycina',
    przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await popraw(u, 'K', 99); await sync(u.K, u.C); await doKosza(u, 'K'); await popraw(u, 'C', 74); await doKosza(u, 'P'); await przytnij(u, 'C'); },
    regula: 'kosz (jedna treść w każdej kolejności: 99 albo 23)',
  },
  X1: {
    opis: '(= X6) P poprawia 2× (77, 78) i kosz; C poprawia po koszu P (74); K kosz (23); C kosz (74)',
    przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await popraw(u, 'P', 77); await popraw(u, 'P', 78); await doKosza(u, 'P'); await popraw(u, 'C', 74); await doKosza(u, 'K'); await doKosza(u, 'C'); },
    regula: 'kosz 74',
  },
  X3: {
    opis: 'C poprawia (71); K kosz; P poprawia po koszu (74); P przycina; C przycina',
    przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await popraw(u, 'C', 71); await doKosza(u, 'K'); await popraw(u, 'P', 74); await przytnij(u, 'P'); await przytnij(u, 'C'); },
    regula: 'brak',
  },
  'PC-PK': {
    opis: 'P poprawia na 99; K (bez wiedzy) kosz; C (bez wiedzy) przycina; wszystkie 8 kolejności (znane ograniczenie: P←C,P←K)',
    przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await popraw(u, 'P', 99); await doKosza(u, 'K'); await przytnij(u, 'C'); },
    regula: 'kosz 99',
  },
  T4: {
    opis: 'P gwiazdka, potem świadomie kosz przypiętej (z potwierdzeniem odpięcia); C (bez wiedzy) poprawia na 74 i przycina',
    przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await przypnij(u, 'P', true); await doKosza(u, 'P'); await popraw(u, 'C', 74); await przytnij(u, 'C'); },
    regula: 'brak',
  },
  'T4-poprawka': {
    opis: 'P gwiazdka, świadomy kosz przypiętej; C (bez wiedzy) poprawia na 74 (bez retencji)',
    przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await przypnij(u, 'P', true); await doKosza(u, 'P'); await popraw(u, 'C', 74); },
    regula: 'karta 74',
  },
  T4b: {
    opis: 'P gwiazdka, świadomy kosz przypiętej; C (bez wiedzy) tylko przycina',
    przygotuj: 'jan12', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await przypnij(u, 'P', true); await doKosza(u, 'P'); await przytnij(u, 'C'); },
    regula: 'kosz 23*',
  },
  PRZ: {
    opis: 'ograniczenie z P-POZNIEJSZA-POPRAWKA: s2 ostatnią wersją karty na P (P daje s1 do kosza); K (zegar +10 min) daje s2 do kosza; P dostaje kosz K, poprawia s2 na 78 (chwila poprawki przed chwilą usunięcia K) i od razu „Przywróć” s2 (przed kolejną synchronizacją); po rundach drugie „Przywróć” na P',
    przygotuj: 'jan2', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => {
      await doKosza(u, 'P', u.s1);
      await naZegarze(u, 10 * 60e3, () => doKosza(u, 'K'));
      await sync(u.K, u.P); krok(u, 'P ← K (P dostaje kosz s2; s2 zostaje w karcie P jako ostatnia wersja)');
      await popraw(u, 'P', 78);
      let wynik;
      try { wynik = await u.P.restoreTrashedSnapshot(u.pid, u.sid); } catch (er) { wynik = { blad: er.code || er.message }; }
      u.pierwszePrzywroc = wynik.blad ? `błąd ${wynik.blad}` : wynik.alreadyInCard ? 'już w karcie' : 'przywrócono';
      krok(u, `P: Przywróć s2 → ${u.pierwszePrzywroc}`); przesunZegar(60e3);
    },
    poRundach: async (u) => ({ pierwsze: u.pierwszePrzywroc, ...(await przywrocNaP(u, 1)) }),
    regula: 'karta 78 (zapis w karcie na trzech już po pierwszym „Przywróć”)',
  },
  'PRZ-kontrola': {
    opis: 's2 ostatnią wersją karty na P: P poprawia s2 (78) i daje s1 do kosza; K (bez wiedzy) daje s2 do kosza później; po rundach „Przywróć” s2 na P',
    przygotuj: 'jan2', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await popraw(u, 'P', 78); await doKosza(u, 'P', u.s1); await doKosza(u, 'K'); },
    poRundach: (u) => przywrocNaP(u, 1),
    regula: 'karta 78',
  },
  'PRZ-po-koszu': {
    opis: 'kontrola: jak PRZ bez rozjazdu zegarów — poprawka P po koszu K (chwila poprawki po usunięciu); „Przywróć” s2 na P',
    przygotuj: 'jan2', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await doKosza(u, 'P', u.s1); await doKosza(u, 'K'); await sync(u.K, u.P); krok(u, 'P ← K'); await popraw(u, 'P', 78); },
    poRundach: (u) => przywrocNaP(u, 1),
    regula: 'karta 78',
  },
  'PRZ-K7': {
    opis: 'kontrola (K7): P poprawia s2 2× (78) i daje s1 do kosza; K poprawia s2 później (74) i daje do kosza; „Przywróć” s2 na P',
    przygotuj: 'jan2', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await popraw(u, 'P', 77); await popraw(u, 'P', 78); await doKosza(u, 'P', u.s1); await popraw(u, 'K', 74); await doKosza(u, 'K'); },
    poRundach: (u) => przywrocNaP(u, 1),
    regula: 'karta 74',
  },
  E4a: {
    opis: 'P (bez wiedzy) poprawia x w starej X na 74; potem K: Scal pacjentów X → Y → Z i kosz x',
    przygotuj: 'trzyKarty', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await popraw(u, 'P', 74); await scalPacjentow(u, 'K', 'X', 'Y'); await scalPacjentow(u, 'K', 'Y', 'Z'); await doKosza(u, 'K'); },
    regula: 'kosz 74',
  },
  'E4a-1': {
    opis: 'jak E4a, jedno scalenie X → Y',
    przygotuj: 'trzyKarty', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await popraw(u, 'P', 74); await scalPacjentow(u, 'K', 'X', 'Y'); await doKosza(u, 'K'); },
    regula: 'kosz 74',
  },
  'E4a-kontrola': {
    opis: 'jak E4a bez kosza: poprawka w starej X przed scaleniami X → Y → Z',
    przygotuj: 'trzyKarty', kolejnosci: KOLEJNOSCI_8,
    kroki: async (u) => { await popraw(u, 'P', 74); await scalPacjentow(u, 'K', 'X', 'Y'); await scalPacjentow(u, 'K', 'Y', 'Z'); },
    regula: 'karta Z 74',
  },
};
