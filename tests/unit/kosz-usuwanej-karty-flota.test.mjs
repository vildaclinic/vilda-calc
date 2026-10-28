// P-KOSZ-USUWANEJ-KARTY (E4a, decyzja właściciela D6 = a, Q7) — flota mieszana ze starszą aplikacją
// (tests/fixtures/vilda_vault-221.js.txt, D11 = a) w rundach „każdy z każdym” uprzęży polkrata-uprzaz.mjs.
//
// Reguła: wersje karty, która w scalaniu przegrywa z nagrobkiem pacjenta, przechodzą decyzję kosza — na urządzeniu
// z kartą przed jej usunięciem, na urządzeniu, które dostaje ją w ładunku, jako kandydat treści. Starsza aplikacja tego
// nie robi: usuwa kartę razem z wersjami, a kartę z ładunku pomija. Poprawka trafia więc do kosza, gdy nową aplikację ma
// urządzenie, które ją trzyma, albo urządzenie, które dostanie ją w ładunku, zanim urządzenie z poprawką usunie kartę.
//
// Scenariusze (jak E4a w s4d7-wspolne.mjs; „Testowy Jan” X z trzema wizytami — x = druga, 125 cm / 23 kg — oraz „Testowa
// Ola” Y i Z na K, komplet na P i C; kroki co minutę): E4a — P poprawia x w starej X na 74, K: „Scal pacjentów” X → Y,
// Y → Z, kosz x; E4a-1 — jedno scalenie X → Y; U1 — K: kosz x w X i „Usuń pacjenta” X; E4a-kontrola — bez kosza. Potem
// pierwsze scalenia w jednej z 8 kolejności, 3 rundy, widok x na P, K i C i runda kontrolna z licznikiem zapisów.
//
// Wynik (zmierzony; na kodzie sprzed zmiany 25dfbbe0 każda flota: kosz 23 w 8 z 8, E4a-kontrola karta 74 r2):
//   F1 flota nowa                → kosz 74 na trzech w 8 z 8 (E4a, E4a-1, U1).
//   F2 K (221)                   → kosz 74 w 8 z 8 — scalenia i kosz robi starsza aplikacja, poprawkę trzyma nowa.
//   F3 C (221)                   → kosz 74 w 8 z 8.
//   F4 P (221) — urządzenie z poprawką ma starszą aplikację → kosz 74 tylko w kolejnościach, w których nowe K albo C
//      dostaje ładunek P, zanim P scali nagrobki (K←P,K←C; K←C,K←P; C←P,C←K; C←K,C←P); w pozostałych kosz 23 — tak jak we
//      flocie samych 221 (równoległy przebieg w tym samym teście), nigdy gorzej.
//   F5 P (221) aktualizuje aplikację przed pierwszym scaleniem → kosz 74 w 8 z 8 (nota przy wydaniu: aktualizacja
//      wszystkich urządzeń).
//   E4a-kontrola (bez kosza) w każdej flocie → karta Z 74 r2 w 8 z 8, jak dotąd.
// W tych scenariuszach zawsze: ten sam widok na trzech, stan stabilny, 0 zapisów listy, wersji i kart w rundzie
// kontrolnej (z 221 i przypiętą wizytą po „Odepnij i usuń” ścieżka E4a ma ten sam rozjazd widoku co bez scalenia — ODP,
// ALGORITHMS P-KOSZ-USUWANEJ-KARTY, „Flota mieszana”).
//
// Prawdziwy vilda_vault.js i kopia 221 w osobnych oknach, magazyny w pamięci, sztuczny zegar
// (vi.useFakeTimers({ toFake: ['Date'] })), automatyczna retencja wyłączona. Dane wyłącznie fikcyjne.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sztucznyZegar, przesunZegar, urzadzenie, aktualizuj, jan, zapisz, gdzie, poprawMase, doKosza, sync, rundy, zeruj, zapisy } from './polkrata-uprzaz.mjs';
import { KOLEJNOSCI_8 } from './s4d7-wspolne.mjs';

const M = 60e3;
afterEach(() => { vi.useRealTimers(); });
const ola = (height, weight) => ({ name: 'Testowa Ola', user: { lastName: 'Testowa', firstName: 'Ola', dobISO: '2017-05-01', sex: 'F', height, weight } });

async function trzyKarty(flota) {
  sztucznyZegar();
  const u = {};
  for (const n of ['P', 'K', 'C']) u[n] = await urzadzenie(n, flota[n] || 'N');
  const x1 = await zapisz(u.K, jan(120, 20));
  u.X = x1.patientId;
  const x2 = await zapisz(u.K, jan(125, 23), { patientId: u.X });
  await zapisz(u.K, jan(130, 25), { patientId: u.X });
  u.Y = (await zapisz(u.K, ola(110, 18))).patientId;
  u.Z = (await zapisz(u.K, ola(111, 19))).patientId;
  await sync(u.K, u.P); await sync(u.K, u.C);
  u.sid = x2.snapshotId;
  return u;
}
const KROKI = {
  E4a: async (u) => {
    przesunZegar(M); await poprawMase(u.P, u.sid, 74);
    przesunZegar(M); await u.K.mergePatients(u.X, u.Y); przesunZegar(M); await u.K.mergePatients(u.Y, u.Z);
    przesunZegar(M); await doKosza(u.K, u.sid); przesunZegar(M);
  },
  'E4a-1': async (u) => {
    przesunZegar(M); await poprawMase(u.P, u.sid, 74);
    przesunZegar(M); await u.K.mergePatients(u.X, u.Y); przesunZegar(M); await doKosza(u.K, u.sid); przesunZegar(M);
  },
  U1: async (u) => {
    przesunZegar(M); await poprawMase(u.P, u.sid, 74);
    przesunZegar(M); await doKosza(u.K, u.sid); przesunZegar(M); await u.K.removePatient(u.X); przesunZegar(M);
  },
  'E4a-kontrola': async (u) => {
    przesunZegar(M); await poprawMase(u.P, u.sid, 74);
    przesunZegar(M); await u.K.mergePatients(u.X, u.Y); przesunZegar(M); await u.K.mergePatients(u.Y, u.Z); przesunZegar(M);
  },
};
async function widok(v, sid) {
  const g = await gdzie(v, sid);
  const k = (await v.listTrashedSnapshots()).find((e) => e.snapshotId === sid) || null;
  return [g ? `karta ${g.s.payload.user.weight} r${g.s.rev}` : '', k ? `kosz ${k.payload ? k.payload.user.weight : '?'}` : ''].filter(Boolean).join(' + ') || 'brak';
}
// Przebieg: kroki, (opcjonalnie) aktualizacja P, pierwsze scalenia, 3 rundy; widok na trzech i zapisy rundy kontrolnej.
async function przebieg(scen, flota, kol, przedScaleniami) {
  const u = await trzyKarty(flota);
  await KROKI[scen](u);
  if (przedScaleniami) await przedScaleniami(u);
  for (const k of kol.split(',')) { const [na, z] = k.split('←'); await sync(u[z], u[na]); }
  const urz = [u.P, u.K, u.C];
  await rundy(urz, 3);
  const w = {};
  for (const n of ['P', 'K', 'C']) w[n] = await widok(u[n], u.sid);
  zeruj(urz);
  await rundy(urz, 1);
  const w2 = {};
  for (const n of ['P', 'K', 'C']) w2[n] = await widok(u[n], u.sid);
  return { w, stabilny: JSON.stringify(w) === JSON.stringify(w2), zap: zapisy(urz) };
}
const BEZ_ZAPISOW = { P: { lista: 0, wersje: 0, karty: 0 }, K: { lista: 0, wersje: 0, karty: 0 }, C: { lista: 0, wersje: 0, karty: 0 } };
const wszedzie = (s) => ({ P: s, K: s, C: s });
function sprawdz(r, oczekiwany) {
  expect(r.w, 'widok x na P, K i C').toEqual(wszedzie(oczekiwany));
  expect(r.stabilny, 'stan stabilny').toBe(true);
  expect(r.zap, 'runda kontrolna bez zapisów').toEqual(BEZ_ZAPISOW);
}
// F4: kolejności, w których nowe K albo C dostaje ładunek P, zanim P (221) scali nagrobki.
const F4_74 = new Set(['K←P,K←C', 'K←C,K←P', 'C←P,C←K', 'C←K,C←P']);

describe('P-KOSZ-USUWANEJ-KARTY — flota mieszana z 221', () => {
  for (const scen of ['E4a', 'E4a-1', 'U1']) {
    for (const kol of KOLEJNOSCI_8) {
      it(`F1 ${scen} flota nowa (${kol}): kosz 74 na trzech`, async () => { sprawdz(await przebieg(scen, {}, kol), 'kosz 74'); });
      it(`F2 ${scen} K (221) (${kol}): kosz 74 na trzech`, async () => { sprawdz(await przebieg(scen, { K: 'S221' }, kol), 'kosz 74'); });
      it(`F3 ${scen} C (221) (${kol}): kosz 74 na trzech`, async () => { sprawdz(await przebieg(scen, { C: 'S221' }, kol), 'kosz 74'); });
      it(`F4 ${scen} P (221) z poprawką (${kol}): ${F4_74.has(kol) ? 'kosz 74' : 'kosz 23, jak flota samych 221'}`, async () => {
        const r = await przebieg(scen, { P: 'S221' }, kol);
        sprawdz(r, F4_74.has(kol) ? 'kosz 74' : 'kosz 23');
        if (!F4_74.has(kol)) {
          const stara = await przebieg(scen, { P: 'S221', K: 'S221', C: 'S221' }, kol);
          expect(r.w, 'nie gorzej niż flota samych 221').toEqual(stara.w);
        }
      });
      it(`F5 ${scen} P (221) aktualizuje aplikację przed scaleniami (${kol}): kosz 74 na trzech`, async () => {
        sprawdz(await przebieg(scen, { P: 'S221' }, kol, async (u) => { u.P = await aktualizuj(u.P, 'N'); }), 'kosz 74');
      });
    }
  }
  for (const [fn, fl] of [['nowa', {}], ['K (221)', { K: 'S221' }], ['C (221)', { C: 'S221' }], ['P (221)', { P: 'S221' }]]) {
    for (const kol of KOLEJNOSCI_8) {
      it(`E4a-kontrola flota ${fn} (${kol}): karta Z 74 r2, jak dotąd`, async () => { sprawdz(await przebieg('E4a-kontrola', fl, kol), 'karta 74 r2'); });
    }
  }
});
