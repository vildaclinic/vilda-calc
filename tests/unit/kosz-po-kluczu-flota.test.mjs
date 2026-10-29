// P-KOSZ-PO-KLUCZU (PR-E3) — flota mieszana ze starszą aplikacją (tests/fixtures/vilda_vault-221.js.txt, D11 = a)
// w rundach „każdy z każdym” uprzęży polkrata-uprzaz.mjs.
//
// Reguła (opis w kosz-po-kluczu.test.mjs): wpis kosza szuka swojej wersji po kluczu także pod inną kartą (A1), ostatnia
// wersja karty przyjmuje nowszą treść kosza (Q8). Starsza aplikacja tego nie robi: zostawia wizytę pod starą kartą X
// i starą treść w ostatniej wersji karty. Kosz z poprawką rozchodzi się jednak od nowych urządzeń, a nowe urządzenia
// usuwają u siebie duplikat i stare treści.
//
// Scenariusze (jak w kosz-po-kluczu-wspolne.mjs; kroki co minutę): E4b, E4b-2w, kosz-przed, kosz-po (trzyKarty: X z x1, x,
// x3, Y, Z na K) i PRZ0-bez, E1-popr-C (jan2: X z s1, x). Potem pierwsze scalenia w jednej z 8 kolejności, 3 rundy, widok
// na P, K i C (karty z wersjami, kosz, nagrobki pacjentów) i runda kontrolna z licznikiem zapisów.
//
// Wynik (zmierzony). Na kodzie sprzed zmiany 8240e0df każda flota (także cała na 230) rozjeżdża się w 48 z 48
// przebiegów (6 scenariuszy × 8 kolejności), ze starą treścią 23 kg w karcie na 19 ze 144 widoków (48 przebiegów
// × 3 urządzenia) — jak flota samych 221 niżej (widoki na trzech identyczne z nią w 32 z 48). Na sejfie 231:
//   F1 flota nowa → widok docelowy na trzech w 8 z 8 (E4b-2w: X[nowa]; E1 — obecność jak w kosz-po-kluczu.test.mjs),
//      0 zapisów w rundzie kontrolnej.
//   F2 K (221), F3 C (221), F4 P (221) → na każdym urządzeniu każda część widoku (karty, kosz, nagrobki) jak we flocie
//      samych 221 albo jak we flocie nowej, w tej samej kolejności (równoległy przebieg w tym samym teście) — nigdy
//      gorzej; zapisów w rundzie kontrolnej nie więcej niż we flocie samych 221. Typowo urządzenie 221 z poprawką zostaje
//      ze starą kartą X[x:74] (E4b; E4b-2w: X[nowa,x:74]), a w E1 urządzenie 221 (bez Q8) trzyma x ze starą treścią
//      23 kg (PRZ0-bez: C (221) w 6 z 8, E1-popr-C: P (221) w 7 z 8); kosz z poprawką jest na trzech (flota samych 221
//      w E4b i E4b-2w: kosz 23). Rozjazd: flota nowa 16 z 48 (tylko obecność E1), K (221) 32, P (221) 32, C (221) 29,
//      flota samych 221 48; stara treść 23 kg w karcie (ze 144 widoków): C (221) 9, P (221) 7, K (221) 0, flota samych
//      221 19, flota nowa 0.
//   F5 P (221) aktualizuje aplikację przed pierwszym scaleniem → jak F1 (nota przy wydaniu: aktualizacja wszystkich
//      urządzeń).
//
// Prawdziwy vilda_vault.js i kopia 221 w osobnych oknach, magazyny w pamięci, sztuczny zegar
// (vi.useFakeTimers({ toFake: ['Date'] })), automatyczna retencja wyłączona. Dane wyłącznie fikcyjne.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sztucznyZegar, przesunZegar, zegar, urzadzenie, aktualizuj, jan, zapisz, poprawMase, doKosza, sync, rundy, zeruj, zapisy } from './polkrata-uprzaz.mjs';
import { KOLEJNOSCI_8, ola } from './s4d7-wspolne.mjs';
import { pelnyStan, widok } from './kosz-po-kluczu-wspolne.mjs';

const M = 60e3;
afterEach(() => { vi.useRealTimers(); });

async function przygotuj(flota, trzy) {
  sztucznyZegar();
  const u = {};
  for (const n of ['P', 'K', 'C']) u[n] = await urzadzenie(n, flota[n] || 'N');
  if (trzy) {
    const x1 = await zapisz(u.K, jan(120, 20)); u.X = x1.patientId;
    const x2 = await zapisz(u.K, jan(125, 23), { patientId: u.X });
    const x3 = await zapisz(u.K, jan(130, 25), { patientId: u.X });
    const y = await zapisz(u.K, ola(110, 18)), z = await zapisz(u.K, ola(111, 19));
    u.Y = y.patientId; u.Z = z.patientId; u.sid = x2.snapshotId;
    u.karty = { [u.X]: 'X', [u.Y]: 'Y', [u.Z]: 'Z' };
    u.wersje = { [x1.snapshotId]: 'x1', [x2.snapshotId]: 'x', [x3.snapshotId]: 'x3', [y.snapshotId]: 'y', [z.snapshotId]: 'z' };
  } else {
    const s1 = await zapisz(u.K, jan(120, 20)); u.X = s1.patientId;
    const s2 = await zapisz(u.K, jan(125, 23), { patientId: u.X });
    u.s1 = s1.snapshotId; u.sid = s2.snapshotId; u.karty = { [u.X]: 'X' }; u.wersje = { [u.s1]: 's1', [u.sid]: 'x' };
  }
  await sync(u.K, u.P); await sync(u.K, u.C);
  u.t0 = zegar.t;
  return u;
}
const naZegarze = async (ms, fn) => { vi.setSystemTime(zegar.t + ms); try { return await fn(); } finally { vi.setSystemTime(zegar.t); } };
const XYZ = async (u) => { przesunZegar(M); await u.K.mergePatients(u.X, u.Y); przesunZegar(M); await u.K.mergePatients(u.Y, u.Z); };
const SCEN = {
  E4b: [true, async (u) => { await XYZ(u); przesunZegar(M); await poprawMase(u.P, u.sid, 74); przesunZegar(M); await doKosza(u.K, u.sid); przesunZegar(M); }],
  'E4b-2w': [true, async (u) => {
    await XYZ(u); przesunZegar(M); await poprawMase(u.P, u.sid, 74); przesunZegar(M);
    u.wersje[(await u.P.savePatient(jan(135, 27), { dedup: false, patientId: u.X })).snapshotId] = 'nowa';
    przesunZegar(M); await doKosza(u.K, u.sid); przesunZegar(M);
  }],
  'kosz-przed': [true, async (u) => { przesunZegar(M); await doKosza(u.P, u.sid); przesunZegar(M); await u.K.mergePatients(u.X, u.Y); przesunZegar(M); }],
  'kosz-po': [true, async (u) => { przesunZegar(M); await u.K.mergePatients(u.X, u.Y); przesunZegar(M); await doKosza(u.P, u.sid); przesunZegar(M); }],
  'PRZ0-bez': [false, async (u) => {
    przesunZegar(M); await doKosza(u.P, u.s1); przesunZegar(M); await naZegarze(10 * M, () => doKosza(u.K, u.sid));
    await sync(u.K, u.P); przesunZegar(M); await poprawMase(u.P, u.sid, 78); przesunZegar(M);
  }],
  'E1-popr-C': [false, async (u) => {
    przesunZegar(M); await poprawMase(u.C, u.sid, 74); przesunZegar(M); await doKosza(u.P, u.s1);
    przesunZegar(M); await naZegarze(10 * M, () => doKosza(u.K, u.sid)); przesunZegar(M);
  }],
};
// Widok docelowy floty nowej: na trzech ten sam albo — E1 — P trzyma x, K s1, C jedno z dwóch.
const E1 = (kg) => ({ P: [`X[x:${kg}] | kosz s1@X:20 kosz x@X:${kg}`], K: [`X[s1:20] | kosz s1@X:20 kosz x@X:${kg}`], C: [`X[x:${kg}] | kosz s1@X:20 kosz x@X:${kg}`, `X[s1:20] | kosz s1@X:20 kosz x@X:${kg}`] });
const wszedzie = (w) => ({ P: [w], K: [w], C: [w] });
const CEL = {
  E4b: wszedzie('Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y'),
  'E4b-2w': wszedzie('X[nowa] Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y'),
  'kosz-przed': wszedzie('Y[m2,y,x3,x1] Z[z] | kosz x@X:23 | nagr X'),
  'kosz-po': wszedzie('Y[m1,y,x3,x1] Z[z] | kosz x@X:23 | nagr X'),
  'PRZ0-bez': E1(78),
  'E1-popr-C': E1(74),
};

async function przebieg(scen, flota, kol, aktualizujP = false) {
  const [trzy, kroki] = SCEN[scen];
  const u = await przygotuj(flota, trzy);
  await kroki(u);
  if (aktualizujP) u.P = await aktualizuj(u.P, 'N');
  for (const k of kol.split(',')) { const [na, z] = k.split('←'); await sync(u[z], u[na]); }
  const urz = [u.P, u.K, u.C];
  await rundy(urz, 3);
  const w = {};
  for (const n of ['P', 'K', 'C']) w[n] = widok(await pelnyStan(u, u[n]));
  zeruj(urz);
  await rundy(urz, 1);
  const w2 = {};
  for (const n of ['P', 'K', 'C']) w2[n] = widok(await pelnyStan(u, u[n]));
  const zap = zapisy(urz);
  return { w, stabilny: JSON.stringify(w) === JSON.stringify(w2), zap, ileZapisow: Object.values(zap).reduce((s, z) => s + z.lista + z.wersje + z.karty, 0) };
}
const ZERO = { lista: 0, wersje: 0, karty: 0 };
function docelowy(scen, r) {
  for (const n of ['P', 'K', 'C']) expect(CEL[scen][n], `${n}: widok`).toContain(r.w[n]);
  expect(r.stabilny, 'stan stabilny').toBe(true);
  expect(r.zap, 'runda kontrolna bez zapisów').toEqual({ P: ZERO, K: ZERO, C: ZERO });
}
// Części widoku: karty, kosz, nagrobki pacjentów.
function czesci(w) {
  const p = w.split(' | ');
  return {
    karty: p.filter((x) => !x.startsWith('kosz') && !x.startsWith('nagr')).join(''),
    kosz: p.filter((x) => x.startsWith('kosz')).join(''),
    nagrobki: p.filter((x) => x.startsWith('nagr')).join(''),
  };
}

describe('P-KOSZ-PO-KLUCZU — flota mieszana z 221', () => {
  for (const scen of Object.keys(SCEN)) {
    for (const kol of KOLEJNOSCI_8) {
      it(`F1 i F5 ${scen} (${kol}): flota nowa i P (221) zaktualizowane przed scaleniami — widok docelowy`, async () => {
        docelowy(scen, await przebieg(scen, {}, kol));
        docelowy(scen, await przebieg(scen, { P: 'S221' }, kol, true));
      });
      it(`F2–F4 ${scen} (${kol}): K, C albo P na 221 — nigdy gorzej niż flota samych 221`, async () => {
        const stara = await przebieg(scen, { P: 'S221', K: 'S221', C: 'S221' }, kol);
        const nowa = await przebieg(scen, {}, kol);
        for (const [fn, flota] of [['K (221)', { K: 'S221' }], ['C (221)', { C: 'S221' }], ['P (221)', { P: 'S221' }]]) {
          const r = await przebieg(scen, flota, kol);
          for (const n of ['P', 'K', 'C']) {
            const a = czesci(r.w[n]), s = czesci(stara.w[n]), c = czesci(nowa.w[n]);
            for (const k of ['karty', 'kosz', 'nagrobki']) expect([s[k], c[k]], `${fn}, ${n}: ${k} jak flota 221 albo nowa`).toContain(a[k]);
          }
          expect(r.stabilny, `${fn}: stan stabilny`).toBe(true);
          expect(r.ileZapisow, `${fn}: zapisów w rundzie kontrolnej nie więcej niż flota samych 221`).toBeLessThanOrEqual(stara.ileZapisow);
        }
      }, 60_000);
    }
  }
});
