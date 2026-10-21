import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-REV-MAX (decyzja właściciela 2026-10-21 do D-7 wariant 2: PD-6 c + PD-7 b, zamiast PD-6 a):
// rev wersji po scaleniu = wyższa z dwóch, niezależnie od tego, która treść wygrała (przyjęcie: max, odrzucenie:
// podniesienie tutejszej rev do zdalnej bez zmiany treści i chwil). Tak liczą starsze aplikacje („najpierw rev”, zawsze
// zostają przy wyższej rev), więc rev na każdym urządzeniu floty mieszanej jest taka sama jak we flocie samych starych.
// Repozytorium nie ładuje starszego sejfu, więc tu wszystkie urządzenia są nowe: test przypina rev, którą nowa
// aplikacja pokazuje starszej (S10, S10b, S9). Prawdziwy vilda_vault.js, sejfy w pamięci, sztuczny zegar, dane fikcyjne.

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}
let licznik = 0;
// Urządzenie z licznikiem putSnapshotForUser (adapter w pamięci owinięty przed utworzeniem konta).
async function urzadzenie(nazwa) {
  licznik += 1;
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_retention.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  const baza = v.createInMemoryAdapter();
  const d = { nazwa, v, baza, zapisy: 0 };
  v.setStorageAdapter(new Proxy(baza, {
    get(cel, k) {
      const f = cel[k];
      if (k !== 'putSnapshotForUser' || typeof f !== 'function') return typeof f === 'function' ? f.bind(cel) : f;
      return function (...a) { d.zapisy += 1; return f.apply(cel, a); };
    },
  }));
  await v.createUser(`RevMax#D7!2026${licznik}aa`, { label: `dev${licznik}`, iterations: 10000 });
  return d;
}
let zegar = Date.parse('2026-10-21T09:00:00Z');
function przesunZegar(ms) { zegar += ms; vi.setSystemTime(zegar); }
function sztucznyZegar() { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(zegar); }
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const jan = (height, weight) => ({
  name: 'Testowy Jan',
  user: { lastName: 'Testowy', firstName: 'Jan', dobISO: '2016-03-12', sex: 'M', height, weight },
});
async function zapisz(d, p, opcje = {}) { przesunZegar(60e3); return d.v.savePatient(p, { dedup: false, ...opcje }); }
const wersja = async (d, pid, sid) => ((await d.v.getPatient(pid)) || { snapshots: [] }).snapshots.find((s) => s.snapshotId === sid) || null;
async function masa(d, pid, sid, kg) {
  przesunZegar(60e3);
  const w = await wersja(d, pid, sid);
  await d.v.updateSnapshotPayload(pid, sid, { ...w.payload, user: { ...w.payload.user, weight: kg } }, { preserveSavedAt: true });
  return wersja(d, pid, sid);
}
const kopia = (x) => JSON.parse(JSON.stringify(x));
async function sync(z, na) { przesunZegar(1e3); return na.v.mergeSyncPayload(kopia(await z.v.exportSyncPayload())); }
const opis = async (d, pid, sid) => { const w = await wersja(d, pid, sid); return { masa: w.payload.user.weight, rev: w.rev }; };
async function rundy(urz, ile = 2) { for (let r = 0; r < ile; r += 1) for (const x of urz) for (const y of urz) if (x !== y) await sync(x, y); }
// O: Jan, trzy wizyty (druga 125 cm / 24 kg); pozostałe urządzenia dostają komplet od O.
async function start(nazwy, zrodlo = 0) {
  const urz = [];
  for (const n of nazwy) urz.push(await urzadzenie(n));
  const Z = urz[zrodlo];
  const a = await zapisz(Z, jan(120, 22));
  const s2 = await zapisz(Z, jan(125, 24), { patientId: a.patientId });
  await zapisz(Z, jan(130, 26), { patientId: a.patientId });
  for (const d of urz) if (d !== Z) await sync(Z, d);
  return { urz, pid: a.patientId, sid: s2.snapshotId };
}

describe('P-REV-MAX: rev wersji po scaleniu = wyższa z dwóch (PD-6 c)', () => {
  /* S10: O trzy wczesne poprawki (32, rev 3); N później jedna (40, rev 1). N odrzuca 32 i podnosi rev do 3 bez zmiany
     treści i chwili. O2 dostaje 40 od N i poprawia najpóźniej (41). We flocie mieszanej O i O2 są starsze: przy rev
     zdalnej (bez podnoszenia) O2 dostawała 40 z rev 1, poprawiała do rev 2 i przyjmowała potem po rev 32 z rev 3 od O
     — 41 ginęła na wszystkich urządzeniach, także po aktualizacji (flota samych starych i samych nowych ją zachowują). */
  it('S10: odrzucenie wcześniejszej treści z wyższą rev podnosi tutejszą rev (40, rev 3); najpóźniejsza poprawka 41 z rev 4 zostaje wszędzie', async () => {
    sztucznyZegar();
    const { urz: [O, N, O2], pid, sid } = await start(['O', 'N', 'O2']);
    await masa(O, pid, sid, 30); await masa(O, pid, sid, 31);
    expect((await masa(O, pid, sid, 32)).rev, 'kontrola: O ma rev 3').toBe(3);
    const przed = await masa(N, pid, sid, 40);
    expect(przed.rev, 'kontrola: N ma rev 1').toBe(1);
    N.zapisy = 0;
    await sync(O, N);
    const po = await wersja(N, pid, sid);
    expect({ masa: po.payload.user.weight, rev: po.rev, updatedAtISO: po.updatedAtISO, savedAtISO: po.savedAtISO }, 'N: treść i chwile tutejsze, rev zdalna')
      .toEqual({ masa: 40, rev: 3, updatedAtISO: przed.updatedAtISO, savedAtISO: przed.savedAtISO });
    expect(N.zapisy, 'jeden zapis: podniesienie rev').toBe(1);
    N.zapisy = 0;
    await sync(O, N);
    expect(N.zapisy, 'ten sam ładunek drugi raz: bez zapisu (bez ping-ponga)').toBe(0);
    await sync(N, O2);
    expect(await opis(O2, pid, sid), 'O2 dostaje 40 z rev 3').toEqual({ masa: 40, rev: 3 });
    expect((await masa(O2, pid, sid, 41)).rev, 'O2: najpóźniejsza poprawka, rev 4').toBe(4);
    await sync(O, O2);
    expect(await opis(O2, pid, sid), 'O2 po O: 41 zostaje (rev 4 > 3 także dla starszej aplikacji)').toEqual({ masa: 41, rev: 4 });
    await rundy([O, N, O2]);
    for (const d of [O, N, O2]) expect(await opis(d, pid, sid), d.nazwa).toEqual({ masa: 41, rev: 4 });
  });

  /* S10b: N ma 32 z rev 3 (od O), N2 poprawia później (40, rev 1). N przyjmuje 40 z rev 3 (wyższa z dwóch), nie 1 —
     bez spadku rev (R7). Dalej jak S10: najpóźniejsza poprawka O2 dostaje rev 4 i zostaje wszędzie. */
  it('S10b: przyjęcie późniejszej treści z niższą rev zostawia wyższą rev (40, rev 3, bez spadku); 41 z rev 4 zostaje wszędzie', async () => {
    sztucznyZegar();
    const { urz: [O, N, N2, O2], pid, sid } = await start(['O', 'N', 'N2', 'O2']);
    await masa(N, pid, sid, 30); await masa(N, pid, sid, 31);
    expect((await masa(N, pid, sid, 32)).rev, 'kontrola: N ma rev 3').toBe(3);
    await sync(N, O);
    expect((await masa(N2, pid, sid, 40)).rev, 'kontrola: N2 ma rev 1').toBe(1);
    const wynik = await sync(N2, N);
    expect(await opis(N, pid, sid), 'N: późniejsza treść, rev wyższa z dwóch').toEqual({ masa: 40, rev: 3 });
    expect(wynik.updatedSnapshotCount, 'przyjęcie liczy się jak dotąd').toBe(1);
    await sync(N, O2);
    expect((await masa(O2, pid, sid, 41)).rev, 'O2: najpóźniejsza poprawka, rev 4').toBe(4);
    await sync(O, O2);
    await rundy([O, N, N2, O2]);
    for (const d of [O, N, N2, O2]) expect(await opis(d, pid, sid), d.nazwa).toEqual({ masa: 41, rev: 4 });
  });

  /* S9 (znane ograniczenie floty mieszanej, „jak dziś”): N trzy wczesne poprawki (rev 3) przyjmuje późniejszą N2 (40,
     rev 1) i trzyma rev 3; O2 poprawia najpóźniej dwa razy (51, rev 2). Między nowymi aplikacjami 51 wygrywa chwilą, a O2
     podnosi rev do 3. Starsza O2 przyjęłaby po rev 40 z rev 3 i jej 51 by zginęła — flota samych starych gubi ją tak samo
     (zostaje tam 32 z rev 3); znika dopiero po aktualizacji O2. */
  it('S9 (wszystkie nowe): najpóźniejsza poprawka 51 zostaje wszędzie z rev 3', async () => {
    sztucznyZegar();
    const { urz: [N, N2, O2], pid, sid } = await start(['N', 'N2', 'O2'], 1);
    await masa(N, pid, sid, 30); await masa(N, pid, sid, 31); await masa(N, pid, sid, 32);
    await masa(N2, pid, sid, 40);
    await masa(O2, pid, sid, 50);
    expect((await masa(O2, pid, sid, 51)).rev, 'kontrola: O2 ma rev 2').toBe(2);
    await sync(N2, N);
    expect(await opis(N, pid, sid), 'N: 40, rev 3').toEqual({ masa: 40, rev: 3 });
    await sync(N, O2);
    expect(await opis(O2, pid, sid), 'O2: tutejsza 51 wygrywa chwilą, rev podniesiona do 3').toEqual({ masa: 51, rev: 3 });
    await rundy([N, N2, O2]);
    for (const d of [N, N2, O2]) expect(await opis(d, pid, sid), d.nazwa).toEqual({ masa: 51, rev: 3 });
  });

  /* D-3 A: podniesiony rekord trafia do Bng_zap „bez treści jawnej”. Wersja bez updatedAtISO po obu stronach: po
     podniesieniu tutejszy rekord ma tę samą rev i chwilę co jawna treść zdalna, więc bez wymiany wpisu nagłówek wziąłby
     odrzuconą treść zdalną (zmierzone na wariancie bez wymiany: „Testowa Ola”). */
  it('podniesienie przy wersji bez updatedAtISO: treść i nagłówek z tutejszej (zwycięskiej) wersji', async () => {
    sztucznyZegar();
    const P = await urzadzenie('P');
    const zap = await zapisz(P, jan(125, 24));
    const pid = zap.patientId, sid = zap.snapshotId;
    const [u] = await P.v.listUsers();
    const rek = (await P.baza.listSnapshotsForUser(u.userId, pid)).find((s) => s.snapshotId === sid);
    const bez = { ...rek }; delete bez.updatedAtISO;
    await P.baza.putSnapshotForUser(u.userId, bez);
    const lad = kopia(await P.v.exportSyncPayload());
    delete lad.credential;
    const S = lad.patients.find((p) => p.patientId === pid).snapshots.find((s) => s.snapshotId === sid);
    S.rev = 3; delete S.updatedAtISO; S.savedAtISO = new Date(Date.parse(rek.savedAtISO) - 60e3).toISOString();
    S.payload = { ...S.payload, name: 'Testowa Ola', user: { ...S.payload.user, firstName: 'Ola', lastName: 'Testowa' } };
    przesunZegar(60e3);
    await P.v.mergeSyncPayload(lad);
    const po = (await P.baza.listSnapshotsForUser(u.userId, pid)).find((s) => s.snapshotId === sid);
    const karta = await P.v.getPatient(pid);
    expect({ rev: po.rev, updatedAtISO: po.updatedAtISO || null, tresc: karta.snapshots[0].payload.name, naglowek: karta.header.name })
      .toEqual({ rev: 3, updatedAtISO: null, tresc: 'Testowy Jan', naglowek: 'Testowy Jan' });
  });
});
