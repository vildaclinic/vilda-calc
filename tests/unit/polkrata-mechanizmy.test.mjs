// P-KOSZ-POLKRATA (S4 krok 1): prawa łączenia nagrobków na prawdziwym kodzie (Bkz_dolacz wycięty z
// vilda_vault.js), format ładunku (cień nigdy w nagrobku retencji, koszISO, revPary) i stempel zmiany po przycięciu,
// które wersja przypięta przeżyła. Dane fikcyjne („Testowy Jan”), sejfy w pamięci, sztuczny zegar.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, PRZYGOTOWANIA, sztucznyZegar, przesunZegar, zegar, sync, gdzieJest } from './s4d7-wspolne.mjs';

afterEach(() => { vi.useRealTimers(); });

const src = readFileSync(path.join(repoRoot, 'vilda_vault.js'), 'utf8');
const wytnij = (od, doo) => { const i = src.indexOf(od); return src.slice(i, src.indexOf(doo, i)); };
const kod = [
  src.match(/function mt\(t\)\{var e=t&&t\.rev;[^}]*\}/)[0],
  src.match(/function Bm1\(t,e\)\{.*?return n==null\?\{\}:\{seq:n\}\}/)[0],
  wytnij('function Bkz_pozniejsza(', 'async function Bkz_podniesZapis('),
  'const de = 1e15, BKZ_KOSZ_MS = 1e14;',
  wytnij('function Bkz_czysc(', 'async function Bkz_czytaj('),
].join('\n');
const { Bkz_dolacz } = new Function(kod + '\nreturn { Bkz_dolacz };')();

describe('prawa łączenia nagrobków (półkrata)', () => {
  const T = (n) => `2026-10-20T09:0${n}:00.000Z`;
  const U = [];
  const WERSJE = [[0, null], [1, 1], [1, 3], [2, 2]];
  for (let d = 2; d <= 4; d += 1) for (const [rev, u] of WERSJE) {
    if (u && u > d) continue;
    const b = { patientId: 'p', snapshotId: 's', deletedAtISO: T(d), rev, updatedAtISO: u ? T(u) : null };
    const tresc = `v${rev}@${u || 0}`;
    U.push({ ...b, payloadCipher: tresc }, { ...b, powod: 'retencja' }, { ...b });
    for (let p = d + 1; p <= 5; p += 1) U.push({ ...b, przycietoISO: T(p), payloadCipher: tresc }, { ...b, przycietoISO: T(p) });
    for (let z = (u || 0) + 1; z <= d; z += 1) U.push({ ...b, powod: 'retencja', zmianaISO: T(z) });
  }
  const polacz = (...xs) => { const m = new Map(); xs.forEach((x) => Bkz_dolacz(m, x)); return m.get('s'); };
  const stan = (e) => {
    const p = e.Bpk ? { ...e.Bpk } : null;
    if (p && p.t && p.t.wE) p.t = { c: e.payloadCipher || null, o: p.t.o, od: p.t.od };
    const { Bpk, ...pola } = e;
    return JSON.stringify([pola, p]);
  };
  const chwile = (x) => [x.deletedAtISO, x.przycietoISO].filter(Boolean);

  it(`przemienność, idempotencja i pochłanianie w parach (${U.length} nagrobków, ${U.length ** 2} par, także z remisami chwil)`, () => {
    let zle = 0;
    for (const a of U) for (const b of U) {
      const ab = polacz(a, b);
      if (stan(ab) !== stan(polacz(b, a)) || stan(polacz(ab, ab)) !== stan(ab) || stan(polacz(ab, a)) !== stan(ab)) zle += 1;
    }
    for (const a of U) if (stan(polacz(a, a)) !== stan(polacz(a))) zle += 1;
    expect(zle).toBe(0);
  }, 60_000);

  it('łączność: trójki bez remisów chwil usunięcia — 6 kolejności × 2 nawiasowania dają ten sam stan', () => {
    let trojki = 0, zalezne = 0;
    for (const a of U) for (const b of U) for (const c of U) {
      const cz = [a, b, c].flatMap(chwile);
      if (new Set(cz).size !== cz.length) continue;
      trojki += 1;
      const w = new Set();
      for (const [x, y, z] of [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]]) {
        w.add(stan(polacz(x, y, z)));
        w.add(stan(polacz(z, polacz(x, y))));
      }
      if (w.size > 1) zalezne += 1;
    }
    expect(trojki).toBeGreaterThan(1000);
    expect(zalezne).toBe(0);
  }, 180_000); // ok. 75 000 trójek × 12 złączeń na prawdziwym kodzie — dłużej niż domyślne 10 s
});

describe('format ładunku', () => {
  // X5: P 77, 78, kosz P; C 74 (nie zna kosza); C przycina. P←C: kosz P nieaktualny (zmiana C po nim) — sam nagrobek
  // retencji; treść 78 zostaje w cieniu tylko lokalnie. Potem K (nie wie o niczym) daje do kosza → w koszu 78.
  it('cień treści nigdy w ładunku nagrobka retencji; koszISO = chwila kosza nieaktualnego; późniejszy ważny kosz bierze treść z cienia', async () => {
    sztucznyZegar();
    const u = await PRZYGOTOWANIA.jan12();
    const { P, K, C, sid } = u;
    const popraw = async (v, kg) => { const g = await gdzieJest(v, sid); await v.updateSnapshotPayload(g.pid, sid, { ...g.s.payload, user: { ...g.s.payload.user, weight: kg } }, { preserveSavedAt: true }); przesunZegar(60e3); };
    przesunZegar(60e3);
    await popraw(P, 77); await popraw(P, 78);
    const kp = await P.moveSnapshotToTrash(u.pid, sid); przesunZegar(60e3);
    await popraw(C, 74);
    expect((await C.pruneSnapshotsForPatient(u.pid, { recentHours: 0 })).prunedIds).toContain(sid);
    przesunZegar(60e3);
    await sync(C, P);
    const n = (await P.exportSyncPayload()).snapshotTombstones.find((x) => x.snapshotId === sid);
    expect(n.powod, 'kosz unieważniony zmianą C — sam nagrobek retencji').toBe('retencja');
    expect(n.payload, 'bez treści w ładunku (F5)').toBeUndefined();
    expect(n.koszISO, 'chwila kosza nieaktualnego').toBe(kp.deletedAtISO);
    expect(await P.listTrashedSnapshots(), 'kosz pusty na P').toEqual([]);
    await K.moveSnapshotToTrash(u.pid, sid); // K: treść 23 kg, później niż każda znana zmiana
    przesunZegar(60e3);
    await sync(K, P);
    const k = (await P.listTrashedSnapshots()).find((x) => x.snapshotId === sid);
    expect(k && k.payload.user.weight, 'w koszu najnowsza istniejąca treść (78) z cienia').toBe(78);
    const e = (await P.exportSyncPayload()).snapshotTombstones.find((x) => x.snapshotId === sid);
    expect({ rev: e.rev, powod: e.powod || null, koszISO: e.koszISO || null }).toEqual({ rev: 2, powod: null, koszISO: null });
  });

  it('koszISO z ładunku nie późniejsze niż zmiana, którą zna nagrobek — inaczej pomijane (nie robi z retencji ważnego kosza)', async () => {
    sztucznyZegar();
    const u = await PRZYGOTOWANIA.jan12(['P', 'K']);
    const { P, K, sid } = u;
    przesunZegar(60e3);
    expect((await K.pruneSnapshotsForPatient(u.pid, { recentHours: 0 })).prunedIds).toContain(sid);
    const l = await K.exportSyncPayload();
    const n = l.snapshotTombstones.find((x) => x.snapshotId === sid);
    n.koszISO = new Date(zegar.t + 864e5).toISOString(); // spreparowane: „kosz” późniejszy niż wszystko
    await P.mergeSyncPayload(l);
    const e = (await P.exportSyncPayload()).snapshotTombstones.find((x) => x.snapshotId === sid);
    expect({ powod: e.powod, koszISO: e.koszISO || null }).toEqual({ powod: 'retencja', koszISO: null });
    expect(await P.listTrashedSnapshots()).toEqual([]);
  });
});

describe('wersja przypięta, która przeżyła przycięcie', () => {
  // K z zegarem 10 min do przodu przycina s; P przypiął s wcześniej (K o tym nie wie). Na P przypięta przeżywa przycięcie,
  // a nagrobek retencji zostaje (P-KOSZ-POLKRATA). Odpięcie na P (dobry zegar, „teraz” przed chwilą przycięcia K) dostaje
  // stempel późniejszy niż to przycięcie, więc wersja zostaje w karcie na P i K. Bez stempla przegrałaby z przycięciem.
  it('odpięcie po przyciętym na zegarze do przodu: stempel późniejszy niż przycięcie, wersja zostaje na obu', async () => {
    sztucznyZegar();
    const u = await PRZYGOTOWANIA.jan12(['P', 'K']);
    const { P, K, sid } = u;
    przesunZegar(60e3);
    await P.setSnapshotPinned(u.pid, sid, true);
    przesunZegar(60e3);
    vi.setSystemTime(zegar.t + 10 * 60e3);
    expect((await K.pruneSnapshotsForPatient(u.pid, { recentHours: 0 })).prunedIds).toContain(sid);
    vi.setSystemTime(zegar.t);
    await sync(K, P);
    const n = (await P.exportSyncPayload()).snapshotTombstones.find((x) => x.snapshotId === sid);
    expect(n && n.powod, 'nagrobek retencji zostaje przy przypiętej').toBe('retencja');
    expect((await gdzieJest(P, sid)).s.pinned, 'przypięta zostaje').toBe(true);
    przesunZegar(60e3);
    await P.setSnapshotPinned(u.pid, sid, false);
    const w = (await gdzieJest(P, sid)).s;
    expect(w.updatedAtISO > n.deletedAtISO, 'chwila odpięcia później niż przycięcie').toBe(true);
    await sync(P, K); await sync(K, P); await sync(P, K);
    for (const [nazwa, v] of [['P', P], ['K', K]]) {
      const g = await gdzieJest(v, sid);
      expect(g && { pin: g.s.pinned }, `${nazwa}: wersja w karcie, odpięta`).toEqual({ pin: false });
      expect((await v.exportSyncPayload()).snapshotTombstones.some((x) => x.snapshotId === sid), `${nazwa}: nagrobek przegrał`).toBe(false);
    }
  });
});

describe('P-REV-MAX: wersja, która przeżywa nagrobek, i pominięta wersja z ładunku', () => {
  // K10b: C poprawia dwa razy (58 kg, rev 2), później P przypina (rev 1), K przycina. P scala retencję K (przypięta
  // przeżywa, nagrobek zostaje i zna jej rejestr gwiazdki), potem ładunek C. W kroku 1: 58 kg (rev 2) przegrywała
  // z przycięciem, a przypięta na P dostawała rev 2 (R3a). W3 (S4 krok 2, D1 = C): gwiazdka z rejestru nagrobka chroni
  // też wersję C przed przycięciem, a scalenie wersji składa treść C z gwiazdką P — rekord złożony 58* z rev 2 + 1
  // (starsza aplikacja z 58 kg rev 2 przyjmuje go) i chwilą zmiany = chwila gwiazdki P (późniejsza z prawdziwych, D3 = a).
  it('K10b na P (P←K, potem P←C): karta 58* z rev 3 (rekord złożony), chwila zmiany = chwila gwiazdki P', async () => {
    sztucznyZegar();
    const u = await PRZYGOTOWANIA.jan12();
    const { P, K, C, sid } = u;
    const popraw = async (v, kg) => { const g = await gdzieJest(v, sid); await v.updateSnapshotPayload(g.pid, sid, { ...g.s.payload, user: { ...g.s.payload.user, weight: kg } }, { preserveSavedAt: true }); przesunZegar(60e3); };
    przesunZegar(60e3);
    await popraw(C, 57); await popraw(C, 58);
    await P.setSnapshotPinned(u.pid, sid, true); przesunZegar(60e3);
    expect((await K.pruneSnapshotsForPatient(u.pid, { recentHours: 0 })).prunedIds).toContain(sid);
    przesunZegar(60e3);
    const przed = (await gdzieJest(P, sid)).s;
    await sync(K, P);
    await sync(C, P);
    const w = (await gdzieJest(P, sid)).s;
    expect({ masa: w.payload.user.weight, pin: w.pinned, rev: w.rev, upd: w.updatedAtISO }).toEqual({ masa: 58, pin: true, rev: 3, upd: przed.updatedAtISO });
  });
});
