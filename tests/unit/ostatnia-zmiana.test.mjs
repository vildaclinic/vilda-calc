// Wyrocznia „nie zginęła ostatnia zmiana” (E3-PR0a, tests/support/ostatnia-zmiana.mjs) — testy samej wyroczni na
// małych syntetycznych historiach (bez sejfu): eksporty przed i po każdej mutacji jak z exportSyncPayload, widoki jak
// z exportSyncPayload i listTrashedSnapshots. Sprawdzają, że wyrocznia wykrywa utratę treści, że „Przywróć” jest zapisem
// treści z chwilą przywrócenia (rozpoznany po operacji, nie po różnicy eksportu), że głowa „Scal pacjentów” nie jest
// zapisem lekarza, że retencja nie usuwa ostatniego stanu wizyty (P-TRWALE-WIZYTY), że zniknięcie bez operacji (także
// przy „Scal pacjentów”) jest naruszeniem bez klasy, i że każda klasa tabeli wyjątków wymaga swojego mechanizmu z historii:
// dla każdej klasy pozytyw i negatyw (ten sam objaw bez mechanizmu — bez klasy). Dane wyłącznie fikcyjne („Testowy Jan…”).
import { describe, expect, it } from 'vitest';
import * as WYR from '../support/ostatnia-zmiana.mjs';

const T0 = Date.parse('2026-03-02T08:00:00.000Z');
const T = (min) => T0 + min * 60e3;
const pl = (kg, { pid = 'P', vid = 'wiz-' + pid, imie = 'Jan1', pinned = false } = {}) => ({
  name: `Testowy ${imie}`, user: { height: 120, weight: kg },
  visit: { version: 1, visitId: vid, patientId: pid, clinicalDateISO: '2026-03-02', createdAtISO: '2026-03-02T00:00:00.000Z', origin: 'legacy-inferred' },
  ...(pinned ? { _pinned: true } : {}),
});
const wersja = (sid, kg, o = {}) => ({ snapshotId: sid, payload: pl(kg, o), updatedAtISO: o.at || '2026-03-02T08:00:00.000Z', rev: o.rev || 1 });
const karta = (pid, wersje) => ({ patientId: pid, snapshots: wersje });
const stan = ({ karty = [], nagrobki = [], kosz = [], notatki = [], nagrNotatek = [] } = {}) => ({
  patients: karty, tombstones: nagrobki.map((p) => ({ patientId: p })), snapshotTombstones: kosz,
  patientNotes: notatki, patientNoteTombstones: nagrNotatek, notes: [], patientLists: [],
});
const wpisKosza = (sid, pid, kg, o = {}) => ({ snapshotId: sid, patientId: pid, payload: pl(kg, { pid, ...o }), ...(o.powod ? { powod: o.powod } : {}), ...(o.pinned ? { pinned: true } : {}) });
const notatka = (id, pid, body, o = {}) => ({ id, patientId: pid, title: 'Fikcyjna', body, category: 'inne', updatedAtISO: o.at || '2026-03-02T08:00:00.000Z', rev: o.rev || 1 });
// Widok urządzenia: okno Kosza z wpisów eksportu (z treścią), patientExists — karta wpisu jest w eksporcie; pinned — pole
// wpisu syntetycznego (gwiazdka w oknie Kosza).
const widok = (st) => WYR.widokZ(st, (st.snapshotTombstones || []).filter((e) => e.payload).map((e) => ({ ...e, pinned: !!e.pinned, patientExists: (st.patients || []).some((p) => p.patientId === e.patientId) })));
const op = (nazwa, ...args) => ({ nazwa, args });
const skrot = (lista) => lista.map((x) => `${x.urz} ${x.id} ${x.rodzaj} [${x.klasa}]`).sort();
const tylko = (lista, id) => skrot(lista.filter((x) => x.id === id));

// Wspólne stany: karta P z wizytami v i w (różne wizyty), karta Q z wizytą q; „Scal pacjentów” P → Q (v i w przeniesione
// pod Q, visit.patientId = Q; głowa h z treścią q), notatka n karty P.
const bazaPQ = (o = {}) => stan({ karty: [karta('P', [wersja('v', 20, { vid: o.vidV || 'wiz-v' }), wersja('w', 21, { vid: o.vidW || 'wiz-w' })]), karta('Q', [wersja('q', 30, { pid: 'Q', imie: 'Jan2' })])], notatki: o.notatki || [] });
const scalonePQ = (o = {}) => stan({
  karty: [karta('Q', [...(o.bezV ? [] : [wersja('v', 20, { pid: 'Q', vid: 'wiz-v' })]), wersja('w', 21, { pid: 'Q', vid: 'wiz-w' }), wersja('q', 30, { pid: 'Q', imie: 'Jan2' }), wersja('h', 30, { pid: 'Q', imie: 'Jan2' })]), ...(o.karty || [])],
  nagrobki: ['P'], notatki: o.notatki || [], kosz: o.kosz || [],
});

describe('wyrocznia „nie zginęła ostatnia zmiana”: model i ocena na syntetycznych historiach', () => {
  it('wykrywa utratę treści: poprawka A (30 kg) nie dotarła do B — „treść” na B; brak wizyty — „utrata”; bez klasy', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const M = WYR.nowyModel();
    const poA = stan({ karty: [karta('P', [wersja('v', 30, { at: '2026-03-02T08:01:00.000Z', rev: 2 }), wersja('w', 21)])] });
    WYR.zapisz(M, { dev: 'A', opis: 'poprawka', przed: baza, po: poA, t: T(1), operacje: [op('updateSnapshotPayload', 'P', 'v')] });
    expect(skrot(WYR.ocen(M, { A: widok(poA), B: widok(baza) })), 'B bez poprawki').toEqual(['B v treść [null]']);
    expect(skrot(WYR.ocen(M, { A: widok(poA), B: widok(stan({ karty: [karta('P', [wersja('w', 21)])] })) })), 'B bez wizyty v').toEqual(['B v utrata [null]']);
    expect(WYR.ocen(M, { A: widok(poA), B: widok(poA) }), 'obie z poprawką').toEqual([]);
    expect(WYR.bezWyjatku(WYR.ocen(M, { B: widok(baza) }), 'W4').length, 'naruszenie bez klasy czerwieni').toBe(1);
  });

  it('„Przywróć” jest zapisem treści z chwilą przywrócenia (R4, PD-9): wygrywa z poprawką B zrobioną po koszu, której A nie znało; rozpoznane po operacji', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const kosz = stan({ karty: [karta('P', [wersja('w', 21)])], kosz: [wpisKosza('v', 'P', 20)] });
    const poprawkaB = stan({ karty: [karta('P', [wersja('v', 28, { rev: 2 }), wersja('w', 21)])] });
    const przywrocone = stan({ karty: [karta('P', [wersja('v', 20, { rev: 3 }), wersja('w', 21)])] });
    const historia = (zOperacja) => {
      const M = WYR.nowyModel();
      WYR.zapisz(M, { dev: 'A', opis: 'kosz', przed: baza, po: kosz, t: T(1), operacje: [op('moveSnapshotToTrash', 'P', 'v')] });
      WYR.zapisz(M, { dev: 'B', opis: 'poprawka', przed: baza, po: poprawkaB, t: T(2), operacje: [op('updateSnapshotPayload', 'P', 'v')] });
      WYR.zapisz(M, { dev: 'A', opis: 'przywróć', przed: kosz, po: przywrocone, t: T(3), operacje: zOperacja ? [op('restoreTrashedSnapshot', 'P', 'v')] : [] });
      return M;
    };
    const M = historia(true);
    expect(WYR.ocen(M, { A: widok(przywrocone), B: widok(przywrocone) }), 'v z treścią przywrócenia (20 kg) na obu').toEqual([]);
    expect(skrot(WYR.ocen(M, { A: widok(przywrocone), B: widok(poprawkaB) })), 'B z poprawką sprzed przywrócenia').toEqual(['B v treść [null]']);
    // Bez operacji „Przywróć” (sama różnica eksportu: kosz → karta z tą samą treścią) treść nie jest zapisem — model
    // oczekiwałby poprawki B (28 kg), a prawdziwy wynik przywrócenia (20 kg) byłby „naruszeniem”.
    expect(skrot(WYR.ocen(historia(false), { A: widok(przywrocone) })), 'bez operacji: przywrócenie nierozpoznane').toEqual(['A v treść [null]']);
  });

  it('„Przywróć”, które nie zdejmuje wpisu Kosza (zmiana kodu): wizyta w karcie i w oknie Kosza — „także w Koszu”, bez klasy', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const kosz = stan({ karty: [karta('P', [wersja('w', 21)])], kosz: [wpisKosza('v', 'P', 20)] });
    const zWpisem = stan({ karty: [karta('P', [wersja('v', 20, { rev: 2 }), wersja('w', 21)])], kosz: [wpisKosza('v', 'P', 20)] });
    const M = WYR.nowyModel();
    WYR.zapisz(M, { dev: 'A', opis: 'kosz', przed: baza, po: kosz, t: T(1), operacje: [op('moveSnapshotToTrash', 'P', 'v')] });
    WYR.zapisz(M, { dev: 'A', opis: 'przywróć', przed: kosz, po: zWpisem, t: T(2), operacje: [op('restoreTrashedSnapshot', 'P', 'v')] });
    expect(skrot(WYR.ocen(M, { A: widok(zWpisem) }))).toEqual(['A v także w Koszu [null]']);
  });

  it('głowa „Scal pacjentów” nie jest zapisem lekarza: jej brak przy tej samej treści w karcie nie jest utratą; brak treści — utrata', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20)]), karta('Q', [wersja('q', 30, { pid: 'Q', imie: 'Jan2' })])] });
    // A: „Scal pacjentów” P → Q — v przeniesiona (visit.patientId = Q), głowa h z treścią q (tożsamość wizyty Q)
    const scalone = stan({ karty: [karta('Q', [wersja('v', 20, { pid: 'Q', vid: 'wiz-P' }), wersja('q', 30, { pid: 'Q', imie: 'Jan2' }), wersja('h', 30, { pid: 'Q', imie: 'Jan2' })])], nagrobki: ['P'] });
    const M = WYR.nowyModel();
    WYR.zapisz(M, { dev: 'A', opis: 'Scal pacjentów', przed: baza, po: scalone, t: T(1), operacje: [op('mergePatients', 'P', 'Q')] });
    expect(WYR.ocen(M, { A: widok(scalone) }), 'A po scaleniu').toEqual([]);
    const bezGlowy = stan({ karty: [karta('Q', [wersja('v', 20, { pid: 'Q', vid: 'wiz-P' }), wersja('q', 30, { pid: 'Q', imie: 'Jan2' })])], nagrobki: ['P'] });
    expect(WYR.ocen(M, { B: widok(bezGlowy) }), 'B bez głowy, z treścią q w karcie').toEqual([]);
    const bezTresci = stan({ karty: [karta('Q', [wersja('v', 20, { pid: 'Q', vid: 'wiz-P' })])], nagrobki: ['P'] });
    expect(skrot(WYR.ocen(M, { B: widok(bezTresci) })), 'B bez q i bez głowy').toEqual(['B h utrata [null]', 'B q utrata [null]']);
  });

  it('powrót karty po „Usuń pacjenta” (hak H1): późniejsza zmiana na B przywraca wersje usunięte na A; wersja, którą B samo wcześniej usunęło, nie wraca', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)]), karta('Q', [wersja('q', 30, { pid: 'Q', imie: 'Jan2' })])] });
    const bezP = { ...baza, patients: [baza.patients[1]], tombstones: [{ patientId: 'P' }] };
    // A usuwa P; B bez wiedzy dopisuje do P wizytę n — v i w wracają z kartą (pełna karta B)
    {
      const M = WYR.nowyModel();
      WYR.zapisz(M, { dev: 'A', opis: 'usuń pacjenta', przed: baza, po: bezP, t: T(1), operacje: [op('removePatient', 'P')] });
      const poB = { ...baza, patients: [karta('P', [wersja('v', 20), wersja('w', 21), wersja('n', 25)]), baza.patients[1]] };
      WYR.zapisz(M, { dev: 'B', opis: 'nowa wersja', przed: baza, po: poB, t: T(2) });
      expect(WYR.ocen(M, { A: widok(poB), B: widok(poB) }), 'pełna karta na obu').toEqual([]);
      const czesciowa = { ...baza, patients: [karta('P', [wersja('n', 25)]), baza.patients[1]] };
      expect(skrot(WYR.ocen(M, { A: widok(czesciowa) })), 'A z kartą częściową (po samych zdarzeniach)').toEqual(['A v utrata [karta częściowa (nagrobek przegrał lokalnie, bez haka H1)]', 'A w utrata [karta częściowa (nagrobek przegrał lokalnie, bez haka H1)]']);
    }
    // A usuwa P (T1); B dopisuje n (T2) i sam usuwa P (T3); A — z kartą częściową [n] — dopisuje m (T4): v i w nie wracają
    {
      const M = WYR.nowyModel();
      WYR.zapisz(M, { dev: 'A', opis: 'usuń pacjenta', przed: baza, po: bezP, t: T(1), operacje: [op('removePatient', 'P')] });
      const poB = { ...baza, patients: [karta('P', [wersja('v', 20), wersja('w', 21), wersja('n', 25)]), baza.patients[1]] };
      WYR.zapisz(M, { dev: 'B', opis: 'nowa wersja', przed: baza, po: poB, t: T(2) });
      WYR.zapisz(M, { dev: 'B', opis: 'usuń pacjenta', przed: poB, po: bezP, t: T(3), operacje: [op('removePatient', 'P')] });
      const czesciowaA = { ...baza, patients: [karta('P', [wersja('n', 25)]), baza.patients[1]] };
      const poA = { ...baza, patients: [karta('P', [wersja('n', 25), wersja('m', 26)]), baza.patients[1]] };
      WYR.zapisz(M, { dev: 'A', opis: 'nowa wersja', przed: czesciowaA, po: poA, t: T(4) });
      expect(WYR.ocen(M, { A: widok(poA), B: widok(poA) }), 'karta P z n i m na obu, bez v i w').toEqual([]);
    }
  });

  it('P-TRWALE-WIZYTY: wersja przycięta retencją na A, która na B jest jedyną wersją swojej wizyty w karcie, zostaje (nie „wskrzeszenie”)', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20, { vid: 'wiz-1' }), wersja('w', 21, { vid: 'wiz-1' })])] });
    const przyciete = stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-1' })])], kosz: [{ snapshotId: 'v', patientId: 'P', powod: 'retencja' }] });
    const M = WYR.nowyModel();
    WYR.zapisz(M, { dev: 'A', opis: 'retencja', przed: baza, po: przyciete, t: T(1), operacje: [op('pruneSnapshotsForPatient', 'P')] });
    const jedyna = stan({ karty: [karta('P', [wersja('v', 20, { vid: 'wiz-1' }), wersja('x', 22, { vid: 'wiz-2' })])] });
    expect(WYR.ocen(M, { B: widok(jedyna) }).filter((x) => x.id === 'v'), 'v — jedyny stan wizyty wiz-1 na B').toEqual([]);
    expect(skrot(WYR.ocen(M, { B: widok(baza) }).filter((x) => x.id === 'v')), 'v obok w tej samej wizyty').toEqual(['B v wskrzeszenie [null]']);
  });

  it('P-TRWALE-WIZYTY: retencja, po której na urządzeniu przycinającym nie zostaje żadna wersja wizyty, nie zmienia modelu — naruszenie bez klasy; ta sama retencja przy drugiej wersji tej wizyty — bez naruszenia', () => {
    const historia = (vidW) => {
      const baza = stan({ karty: [karta('P', [wersja('v', 20, { vid: 'wiz-1' }), wersja('w', 21, { vid: vidW })])] });
      const przyciete = stan({ karty: [karta('P', [wersja('w', 21, { vid: vidW })])], kosz: [{ snapshotId: 'v', patientId: 'P', powod: 'retencja' }] });
      const M = WYR.nowyModel();
      WYR.zapisz(M, { dev: 'A', opis: 'retencja', przed: baza, po: przyciete, t: T(1), operacje: [op('pruneSnapshotsForPatient', 'P')] });
      return { M, baza, przyciete };
    };
    const inna = historia('wiz-2');
    const l = WYR.ocen(inna.M, { A: widok(inna.przyciete), B: widok(inna.baza) });
    expect(skrot(l), 'v — ostatni stan wiz-1: na A naruszenie, na B (zachowana) — nic').toEqual(['A v retencja usunęła ostatni stan wizyty [null]']);
    expect(WYR.bezWyjatku(l, 'W1').length, 'czerwień w każdym świecie').toBe(1);
    const ta = historia('wiz-1');
    expect(WYR.ocen(ta.M, { A: widok(ta.przyciete) }), 'v obok w tej samej wizyty: retencja dozwolona').toEqual([]);
    // wersja wizyty wiz-1 usunięta ręcznie (Kosz) zdejmuje ochronę starszych wersji tej wizyty (Bvisit_applyDeletedHeads)
    const baza = stan({ karty: [karta('P', [wersja('v', 20, { vid: 'wiz-1' }), wersja('w', 21, { vid: 'wiz-2' })])], kosz: [wpisKosza('u', 'P', 22, { vid: 'wiz-1' })] });
    const przyciete = { ...baza, patients: [karta('P', [wersja('w', 21, { vid: 'wiz-2' })])], snapshotTombstones: [...baza.snapshotTombstones, { snapshotId: 'v', patientId: 'P', powod: 'retencja' }] };
    const M = WYR.nowyModel();
    WYR.zapisz(M, { dev: 'A', opis: 'retencja', przed: baza, po: przyciete, t: T(1), operacje: [op('pruneSnapshotsForPatient', 'P')] });
    expect(WYR.ocen(M, { A: widok(przyciete) }), 'wersja wiz-1 w Koszu: retencja ostatniej wersji w karcie dozwolona').toEqual([]);
  });

  it('zniknięcie bez operacji: wersja karty źródłowej, której „Scal pacjentów” nie przeniosło (ani pod Q, ani do Kosza), i zniknięcie bez Kosza, retencji i „Usuń pacjenta” — naruszenie bez klasy na tym urządzeniu', () => {
    const baza = bazaPQ();
    {
      const M = WYR.nowyModel();
      const zgubione = scalonePQ({ bezV: true });
      WYR.zapisz(M, { dev: 'A', opis: 'Scal pacjentów', przed: baza, po: zgubione, t: T(1), operacje: [op('mergePatients', 'P', 'Q')] });
      expect(skrot(WYR.ocen(M, { A: widok(zgubione) })), 'A: v zniknęła przy scaleniu').toEqual(['A v zniknięcie bez operacji [null]']);
      expect(skrot(WYR.ocen(M, { A: widok(scalonePQ()) })), 'v pod Q — bez naruszenia').toEqual([]);
    }
    {
      const M = WYR.nowyModel();
      const scalone = scalonePQ();
      WYR.zapisz(M, { dev: 'A', opis: 'Scal pacjentów', przed: baza, po: scalone, t: T(1), operacje: [op('mergePatients', 'P', 'Q')] });
      expect(WYR.ocen(M, { A: widok(scalone) }), 'scalenie przenosi v i w pod Q').toEqual([]);
    }
    {
      const M = WYR.nowyModel();
      const bezV = stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-w', rev: 2 })]), baza.patients[1]] });
      WYR.zapisz(M, { dev: 'A', opis: 'poprawka w', przed: baza, po: bezV, t: T(1), operacje: [op('updateSnapshotPayload', 'P', 'w')] });
      expect(skrot(WYR.ocen(M, { A: widok(bezV), B: widok(baza) })), 'A: v zniknęła bez operacji; B ma v — bez naruszenia').toEqual(['A v zniknięcie bez operacji [null]']);
    }
  });
});

describe('wyrocznia: klasy tabeli wyjątków wymagają mechanizmu (pozytyw; negatyw — ten sam objaw bez mechanizmu, bez klasy)', () => {
  it('E1/E1b: wersja nieznana scalającemu ginie razem z kartą (pozytyw); utrata bez scalenia — bez klasy', () => {
    const baza = bazaPQ();
    const M = WYR.nowyModel();
    const poB = stan({ karty: [karta('P', [...baza.patients[0].snapshots, wersja('n1', 25)]), baza.patients[1]] });
    WYR.zapisz(M, { dev: 'B', opis: 'nowa wersja', przed: baza, po: poB, t: T(1) });
    WYR.zapisz(M, { dev: 'A', opis: 'Scal pacjentów', przed: baza, po: scalonePQ(), t: T(2), operacje: [op('mergePatients', 'P', 'Q')] });
    const l = WYR.ocen(M, { A: widok(scalonePQ()), B: widok(scalonePQ()) });
    expect(skrot(l)).toEqual(['A n1 utrata [E1/E1b (utrata wersji nieznanej scalającemu)]', 'B n1 utrata [E1/E1b (utrata wersji nieznanej scalającemu)]']);
    expect(WYR.bezWyjatku(l, 'bloby'), 'klasa dozwolona także przy samych blobach').toEqual([]);
    const M2 = WYR.nowyModel();
    WYR.zapisz(M2, { dev: 'B', opis: 'nowa wersja', przed: baza, po: poB, t: T(1) });
    expect(tylko(WYR.ocen(M2, { A: widok(baza) }), 'n1'), 'bez scalenia: utrata bez klasy').toEqual(['A n1 utrata [null]']);
  });

  it('D21-9: notatka przepięta pod Q przy równoległym „Usuń pacjenta” P (pozytyw); utrata notatki bez scalenia — bez klasy', () => {
    const baza = bazaPQ({ notatki: [notatka('n', 'P', 'Fikcyjna treść')] });
    const usuniety = stan({ karty: [baza.patients[1]], nagrobki: ['P'], nagrNotatek: [{ id: 'n' }] });
    const M = WYR.nowyModel();
    const scalone = scalonePQ({ notatki: [notatka('n', 'Q', 'Fikcyjna treść', { rev: 2 })] });
    WYR.zapisz(M, { dev: 'A', opis: 'Scal pacjentów', przed: baza, po: scalone, t: T(1), operacje: [op('mergePatients', 'P', 'Q')] });
    WYR.zapisz(M, { dev: 'B', opis: 'usuń pacjenta', przed: baza, po: usuniety, t: T(2), operacje: [op('removePatient', 'P')] });
    expect(tylko(WYR.ocen(M, { A: widok({ ...scalone, patientNotes: [], patientNoteTombstones: [{ id: 'n' }] }) }), 'n')).toEqual(['A n utrata [D21-9 (notatka przepięta przy równoległym „Usuń pacjenta”)]']);
    const M2 = WYR.nowyModel();
    const poprawka = stan({ karty: baza.patients, notatki: [notatka('n', 'P', 'Fikcyjna treść 2', { rev: 2 })] });
    WYR.zapisz(M2, { dev: 'A', opis: 'notatka', przed: baza, po: poprawka, t: T(1) });
    expect(tylko(WYR.ocen(M2, { B: widok(stan({ karty: baza.patients })) }), 'n'), 'bez scalenia: utrata bez klasy').toEqual(['B n utrata [null]']);
  });

  it('P5: wpis Kosza pod kartą z aliasem „Scal pacjentów”, okno Kosza go nie pokazuje (pozytyw); ukryty wpis Kosza karty bez scalenia — bez klasy', () => {
    const baza = bazaPQ();
    const koszB = stan({ karty: [karta('P', [baza.patients[0].snapshots[1]]), baza.patients[1]], kosz: [wpisKosza('v', 'P', 20, { vid: 'wiz-v' })] });
    const M = WYR.nowyModel();
    WYR.zapisz(M, { dev: 'B', opis: 'kosz', przed: baza, po: koszB, t: T(1), operacje: [op('moveSnapshotToTrash', 'P', 'v')] });
    WYR.zapisz(M, { dev: 'A', opis: 'Scal pacjentów', przed: baza, po: scalonePQ(), t: T(2), operacje: [op('mergePatients', 'P', 'Q')] });
    const poWymianie = scalonePQ({ bezV: true, kosz: [wpisKosza('v', 'P', 20, { vid: 'wiz-v' })] });
    expect(tylko(WYR.ocen(M, { A: widok(poWymianie) }), 'v')).toEqual(['A v utrata [P5 (Kosz pod kartą usuniętą po scaleniu)]']);
    // bez scalenia: karty P brak w widoku B (bez żadnej operacji kartowej), wpis Kosza v ukryty
    const M2 = WYR.nowyModel();
    WYR.zapisz(M2, { dev: 'B', opis: 'kosz', przed: baza, po: koszB, t: T(1), operacje: [op('moveSnapshotToTrash', 'P', 'v')] });
    expect(tylko(WYR.ocen(M2, { B: widok(stan({ karty: [baza.patients[1]], kosz: [wpisKosza('v', 'P', 20, { vid: 'wiz-v' })] })) }), 'v'), 'bez aliasu karty wpisu').toEqual(['B v utrata [null]']);
  });

  it('P6: notatka zapisana w starej karcie po scaleniu albo nieznana urządzeniu scalającemu (pozytywy); notatka znana scalającemu, której scalenie nie przepięło — bez klasy', () => {
    const baza = bazaPQ({ notatki: [notatka('n', 'P', 'Fikcyjna treść')] });
    const scalone = scalonePQ({ notatki: [notatka('n', 'Q', 'Fikcyjna treść', { rev: 2 })] });
    {
      const M = WYR.nowyModel();
      WYR.zapisz(M, { dev: 'A', opis: 'Scal pacjentów', przed: baza, po: scalone, t: T(1), operacje: [op('mergePatients', 'P', 'Q')] });
      const poB = { ...baza, patientNotes: [notatka('n', 'P', 'Fikcyjna treść B', { rev: 2 })] };
      WYR.zapisz(M, { dev: 'B', opis: 'notatka', przed: baza, po: poB, t: T(2) });
      expect(tylko(WYR.ocen(M, { A: widok({ ...scalone, patientNotes: [notatka('n', 'P', 'Fikcyjna treść B', { rev: 2 })] }) }), 'n'), 'zapis w starej karcie po scaleniu').toEqual(['A n utrata (pod kartą usuniętą) [P6 (notatka przy starej karcie)]']);
    }
    {
      const M = WYR.nowyModel();
      const poB = { ...baza, patientNotes: [...baza.patientNotes, notatka('n2', 'P', 'Fikcyjna treść 2')] };
      WYR.zapisz(M, { dev: 'B', opis: 'notatka', przed: baza, po: poB, t: T(1) });
      WYR.zapisz(M, { dev: 'A', opis: 'Scal pacjentów', przed: baza, po: scalone, t: T(2), operacje: [op('mergePatients', 'P', 'Q')] });
      expect(tylko(WYR.ocen(M, { A: widok({ ...scalone, patientNotes: [...scalone.patientNotes, notatka('n2', 'P', 'Fikcyjna treść 2')] }) }), 'n2'), 'nieznana scalającemu').toEqual(['A n2 utrata (pod kartą usuniętą) [P6 (notatka przy starej karcie)]']);
    }
    {
      const M = WYR.nowyModel();
      const nieprzepieta = { ...scalone, patientNotes: [notatka('n', 'P', 'Fikcyjna treść')] };
      WYR.zapisz(M, { dev: 'A', opis: 'Scal pacjentów', przed: baza, po: nieprzepieta, t: T(1), operacje: [op('mergePatients', 'P', 'Q')] });
      expect(tylko(WYR.ocen(M, { A: widok(nieprzepieta), B: widok(nieprzepieta) }), 'n'), 'scalenie znało n i jej nie przepięło').toEqual(['A n utrata (pod kartą usuniętą) [null]', 'B n utrata (pod kartą usuniętą) [null]']);
    }
  });

  it('E4b i D-4 A: wizyta pod starą kartą po „Scal pacjentów” — E4b tylko w W1; ta wizyta zapisana w starej karcie po scaleniu — D-4 A; nieruszona wizyta pod wróconą kartą — E4b, nie D-4 A; jedyna wersja karty usuniętej bez scalenia — bez klasy', () => {
    const baza = bazaPQ();
    const M = WYR.nowyModel();
    WYR.zapisz(M, { dev: 'A', opis: 'Scal pacjentów', przed: baza, po: scalonePQ(), t: T(1), operacje: [op('mergePatients', 'P', 'Q')] });
    // B (bez wiedzy o scaleniu, po samych zdarzeniach): karta P z v i w
    const l = WYR.ocen(M, { B: widok(baza) });
    expect(skrot(l.filter((x) => ['v', 'w'].includes(x.id)))).toEqual(['B v inna karta [E4b (stara karta po „Scal pacjentów”)]', 'B w inna karta [E4b (stara karta po „Scal pacjentów”)]']);
    expect([WYR.bezWyjatku(l, 'W1').length, WYR.bezWyjatku(l, 'W4').length > 0, WYR.bezWyjatku(l, 'bloby').length > 0], 'E4b: dozwolona tylko w W1').toEqual([0, true, true]);
    // B poprawia v w starej P po scaleniu: P wraca z v (D-4 A); w pod wróconą P — nieruszona, więc E4b
    const poB = stan({ karty: [karta('P', [wersja('v', 26, { vid: 'wiz-v', rev: 2 }), wersja('w', 21, { vid: 'wiz-w' })]), baza.patients[1]] });
    WYR.zapisz(M, { dev: 'B', opis: 'poprawka v', przed: baza, po: poB, t: T(2), operacje: [op('updateSnapshotPayload', 'P', 'v')] });
    const wrocona = scalonePQ({ bezV: true, karty: [karta('P', [wersja('v', 26, { vid: 'wiz-v', rev: 2 })])] });
    expect(tylko(WYR.ocen(M, { A: widok(wrocona) }), 'v'), 'v zapisana w P po scaleniu').toEqual(['A v inna karta [D-4 A (stara karta wraca po zapisie bez wiedzy o scaleniu)]']);
    const cofniete = stan({ karty: [poB.patients[0], karta('Q', scalonePQ().patients[0].snapshots.filter((q) => !['v', 'w'].includes(q.snapshotId)))], nagrobki: ['P'] });
    expect(skrot(WYR.ocen(M, { A: widok(cofniete) }).filter((x) => ['v', 'w'].includes(x.id))), 'w pod P (scalenie cofnięte)').toEqual(['A v inna karta [D-4 A (stara karta wraca po zapisie bez wiedzy o scaleniu)]', 'A w inna karta [E4b (stara karta po „Scal pacjentów”)]']);
    // „Usuń pacjenta” jednowizytowej karty bez scalenia: karta zostaje na B z jedyną wersją — wskrzeszenie bez klasy
    const jedna = stan({ karty: [karta('P', [wersja('v', 20)])] });
    const M2 = WYR.nowyModel();
    WYR.zapisz(M2, { dev: 'A', opis: 'usuń pacjenta', przed: jedna, po: stan({ nagrobki: ['P'] }), t: T(1), operacje: [op('removePatient', 'P')] });
    expect(skrot(WYR.ocen(M2, { B: widok(jedna) })), 'bez aliasu karty').toEqual(['B v wskrzeszenie [null]']);
  });

  it('kosz-po-2: zapis w starej karcie po scaleniu, potem kosz w starej karcie — przy samych blobach stara karta z ostatnią wersją (pozytyw, tylko bloby); kosz urządzenia, które o scaleniu wiedziało — E4b, czerwień przy blobach', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20, { vid: 'wiz-v' })]), karta('Q', [wersja('q', 30, { pid: 'Q', imie: 'Jan2' })])] });
    const scalone = stan({ karty: [karta('Q', [wersja('v', 20, { pid: 'Q', vid: 'wiz-v' }), wersja('q', 30, { pid: 'Q', imie: 'Jan2' }), wersja('h', 30, { pid: 'Q', imie: 'Jan2' })])], nagrobki: ['P'] });
    const poprawkaC = stan({ karty: [karta('P', [wersja('v', 74, { vid: 'wiz-v', rev: 2 })]), baza.patients[1]] });
    // widok C przy samych blobach: stara P z v (74 kg) jedyną wersją, v także w Koszu
    const widokC = stan({ karty: [poprawkaC.patients[0], karta('Q', scalone.patients[0].snapshots.filter((q) => q.snapshotId !== 'v'))], nagrobki: ['P'], kosz: [wpisKosza('v', 'Q', 74, { vid: 'wiz-v' })] });
    const historia = (koszNa) => {
      const M = WYR.nowyModel();
      WYR.zapisz(M, { dev: 'K', opis: 'Scal pacjentów', przed: baza, po: scalone, t: T(1), operacje: [op('mergePatients', 'P', 'Q')] });
      WYR.zapisz(M, { dev: 'C', opis: 'poprawka', przed: baza, po: poprawkaC, t: T(2), operacje: [op('updateSnapshotPayload', 'P', 'v')] });
      if (koszNa === 'P') WYR.zapisz(M, { dev: 'P', opis: 'kosz', przed: { ...baza, patients: [karta('P', [wersja('v', 20, { vid: 'wiz-v' }), wersja('v2', 22, { vid: 'wiz-v2' })]), baza.patients[1]] }, po: { ...baza, patients: [karta('P', [wersja('v2', 22, { vid: 'wiz-v2' })]), baza.patients[1]], snapshotTombstones: [wpisKosza('v', 'P', 20, { vid: 'wiz-v' })] }, t: T(3), operacje: [op('moveSnapshotToTrash', 'P', 'v')] });
      else WYR.zapisz(M, { dev: 'K', opis: 'kosz', przed: scalone, po: { ...scalone, patients: [karta('Q', scalone.patients[0].snapshots.filter((q) => q.snapshotId !== 'v'))], snapshotTombstones: [wpisKosza('v', 'Q', 20, { vid: 'wiz-v' })] }, t: T(3), operacje: [op('moveSnapshotToTrash', 'Q', 'v')] });
      return M;
    };
    const l = WYR.ocen(historia('P'), { C: widok(widokC) }).filter((x) => x.id === 'v');
    expect(skrot(l), 'kosz w starej P na P (bez wiedzy)').toEqual(['C v obecność [kosz-po-2 (stara karta z ostatnią wersją przy samych blobach)]']);
    expect(['W1', 'W4', 'bloby'].map((s) => WYR.bezWyjatku(l, s).length), 'dozwolona tylko w świecie samych blobów').toEqual([1, 1, 0]);
    const k = WYR.ocen(historia('K'), { C: widok(widokC) }).filter((x) => x.id === 'v');
    expect(skrot(k), 'kosz pod Q na K (urządzenie scalające)').toEqual(['C v obecność [E4b (stara karta po „Scal pacjentów”)]']);
    expect(WYR.bezWyjatku(k, 'bloby').length, 'E4b przy samych blobach — czerwień').toBe(1);
  });

  it('E1 (obecność): ostatnia wersja żywej karty zostaje, gdy urządzenie dawało ją do Kosza przy innych wersjach (pozytyw, z najpóźniejszym rejestrem gwiazdki); kosz jedynej wersji karty — bez klasy; inna gwiazdka — „gwiazdka” bez klasy', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const M = WYR.nowyModel();
    WYR.zapisz(M, { dev: 'A', opis: 'kosz w', przed: baza, po: stan({ karty: [karta('P', [wersja('v', 20)])], kosz: [wpisKosza('w', 'P', 21)] }), t: T(1), operacje: [op('moveSnapshotToTrash', 'P', 'w')] });
    // B (bez wiedzy): gwiazdka v, potem „Odepnij i usuń” v — ostatni rejestr gwiazdki: odpięta
    const przypieta = stan({ karty: [karta('P', [wersja('v', 20, { pinned: true, rev: 2 }), wersja('w', 21)])] });
    WYR.zapisz(M, { dev: 'B', opis: 'gwiazdka v', przed: baza, po: przypieta, t: T(2), operacje: [op('setSnapshotPinned', 'P', 'v', true)] });
    WYR.zapisz(M, { dev: 'B', opis: 'odepnij i usuń v', przed: przypieta, po: stan({ karty: [karta('P', [wersja('w', 21)])], kosz: [wpisKosza('v', 'P', 20)] }), t: T(3), operacje: [op('moveSnapshotToTrash', 'P', 'v')] });
    const zostawiona = (pin) => stan({ karty: [karta('P', [wersja('v', 20, { pinned: pin, rev: 3 })])], kosz: [wpisKosza('v', 'P', 20), wpisKosza('w', 'P', 21)] });
    expect(tylko(WYR.ocen(M, { C: widok(zostawiona(false)) }), 'v'), 'v ostatnią wersją P, bez gwiazdki').toEqual(['C v obecność [E1 (obecność)]']);
    expect(tylko(WYR.ocen(M, { C: widok(zostawiona(true)) }), 'v'), 'v z gwiazdką — nie najpóźniejszy rejestr').toEqual(['C v gwiazdka [null]', 'C v obecność [E1 (obecność)]']);
    // kosz jedynej wersji karty (urządzenie nie miało innych wersji)
    const jedna = stan({ karty: [karta('P', [wersja('v', 20)])] });
    const M2 = WYR.nowyModel();
    WYR.zapisz(M2, { dev: 'A', opis: 'kosz v', przed: jedna, po: stan({ karty: [karta('P', [])], kosz: [wpisKosza('v', 'P', 20)] }), t: T(1), operacje: [op('moveSnapshotToTrash', 'P', 'v')] });
    expect(tylko(WYR.ocen(M2, { B: widok(jedna) }), 'v'), 'bez mechanizmu Q8').toEqual(['B v obecność [null]']);
  });

  it('R4a i R4a′: kosz na urządzeniu bez wiedzy o późniejszej gwiazdce albo poprawce (pozytywy, nie po W4); kosz urządzenia, które je znało — bez klasy', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const przypieta = stan({ karty: [karta('P', [wersja('v', 20, { pinned: true, rev: 2 }), wersja('w', 21)])] });
    const poprawiona = stan({ karty: [karta('P', [wersja('v', 30, { rev: 2 }), wersja('w', 21)])] });
    const koszV = (kg = 20) => stan({ karty: [karta('P', [wersja('w', 21)])], kosz: [wpisKosza('v', 'P', kg)] });
    {
      const M = WYR.nowyModel();
      WYR.zapisz(M, { dev: 'A', opis: 'gwiazdka v', przed: baza, po: przypieta, t: T(1), operacje: [op('setSnapshotPinned', 'P', 'v', true)] });
      WYR.zapisz(M, { dev: 'B', opis: 'kosz v', przed: baza, po: koszV(), t: T(2), operacje: [op('moveSnapshotToTrash', 'P', 'v')] });
      const l = WYR.ocen(M, { B: widok(koszV()) });
      expect(tylko(l, 'v'), 'R4a').toEqual(['B v gwiazdka Kosza [R4a]']);
      expect(['W1', 'W4', 'bloby'].map((s) => WYR.bezWyjatku(l, s).length), 'R4a: W1 i bloby').toEqual([0, 1, 0]);
    }
    {
      const M = WYR.nowyModel();
      WYR.zapisz(M, { dev: 'A', opis: 'gwiazdka v', przed: baza, po: przypieta, t: T(1), operacje: [op('setSnapshotPinned', 'P', 'v', true)] });
      WYR.zapisz(M, { dev: 'A', opis: 'odepnij i usuń v', przed: przypieta, po: koszV(), t: T(2), operacje: [op('moveSnapshotToTrash', 'P', 'v')] });
      const zGwiazdka = { ...koszV(), snapshotTombstones: [wpisKosza('v', 'P', 20, { pinned: true })] };
      expect(tylko(WYR.ocen(M, { B: widok(zGwiazdka) }), 'v'), 'kosz znał gwiazdkę').toEqual(['B v gwiazdka Kosza [null]']);
    }
    {
      const M = WYR.nowyModel();
      WYR.zapisz(M, { dev: 'A', opis: 'poprawka v', przed: baza, po: poprawiona, t: T(1), operacje: [op('updateSnapshotPayload', 'P', 'v')] });
      WYR.zapisz(M, { dev: 'B', opis: 'kosz v', przed: baza, po: koszV(), t: T(2), operacje: [op('moveSnapshotToTrash', 'P', 'v')] });
      expect(tylko(WYR.ocen(M, { B: widok(koszV()) }), 'v'), 'R4a′').toEqual(['B v treść [R4a′]']);
    }
    {
      const M = WYR.nowyModel();
      WYR.zapisz(M, { dev: 'A', opis: 'poprawka v', przed: baza, po: poprawiona, t: T(1), operacje: [op('updateSnapshotPayload', 'P', 'v')] });
      WYR.zapisz(M, { dev: 'A', opis: 'kosz v', przed: poprawiona, po: koszV(30), t: T(2), operacje: [op('moveSnapshotToTrash', 'P', 'v')] });
      expect(tylko(WYR.ocen(M, { B: widok(koszV()) }), 'v'), 'kosz znał poprawkę').toEqual(['B v treść [null]']);
    }
  });

  it('R5-E1: „Przywróć” przed „Usuń pacjenta”, karta wraca nową wizytą z innego urządzenia, wizyta w Koszu (pozytyw); ten sam objaw bez „Przywróć” — bez klasy', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const koszB = stan({ karty: [karta('P', [wersja('w', 21)])], kosz: [wpisKosza('v', 'P', 20)] });
    const historia = (zPrzywroc) => {
      const M = WYR.nowyModel();
      let przedA = baza;
      if (zPrzywroc) {
        WYR.zapisz(M, { dev: 'B', opis: 'kosz v', przed: baza, po: koszB, t: T(1), operacje: [op('moveSnapshotToTrash', 'P', 'v')] });
        WYR.zapisz(M, { dev: 'B', opis: 'przywróć v', przed: koszB, po: stan({ karty: [karta('P', [wersja('v', 20, { rev: 2 }), wersja('w', 21)])] }), t: T(2), operacje: [op('restoreTrashedSnapshot', 'P', 'v')] });
        przedA = koszB;
      }
      WYR.zapisz(M, { dev: 'A', opis: 'usuń pacjenta', przed: przedA, po: stan({ nagrobki: ['P'] }), t: T(3), operacje: [op('removePatient', 'P')] });
      WYR.zapisz(M, { dev: 'C', opis: 'nowa wizyta', przed: baza, po: stan({ karty: [karta('P', [...baza.patients[0].snapshots, wersja('n', 25)])] }), t: T(4) });
      return M;
    };
    const wKoszu = stan({ karty: [karta('P', [wersja('w', 21), wersja('n', 25)])], kosz: [wpisKosza('v', 'P', 20)] });
    expect(tylko(WYR.ocen(historia(true), { A: widok(wKoszu) }), 'v'), 'R5-E1').toEqual(['A v obecność [R5-E1]']);
    expect(tylko(WYR.ocen(historia(false), { A: widok(wKoszu) }), 'v'), 'bez „Przywróć”').toEqual(['A v obecność [null]']);
  });

  it('npret i retencja: przypięta wizyta przycięta na urządzeniu bez wiedzy o gwiazdce, Kosz przed przycięciem (pozytywy, tylko W1); utrata bez przycięcia — bez klasy', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20, { vid: 'wiz-1' }), wersja('w', 21, { vid: 'wiz-1' })])] });
    const przyciete = stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-1' })])], kosz: [{ snapshotId: 'v', patientId: 'P', powod: 'retencja' }] });
    {
      const M = WYR.nowyModel();
      WYR.zapisz(M, { dev: 'B', opis: 'gwiazdka v', przed: baza, po: stan({ karty: [karta('P', [wersja('v', 20, { vid: 'wiz-1', pinned: true, rev: 2 }), wersja('w', 21, { vid: 'wiz-1' })])] }), t: T(1), operacje: [op('setSnapshotPinned', 'P', 'v', true)] });
      WYR.zapisz(M, { dev: 'A', opis: 'retencja', przed: baza, po: przyciete, t: T(2), operacje: [op('pruneSnapshotsForPatient', 'P')] });
      const l = WYR.ocen(M, { A: widok(przyciete) });
      expect(tylko(l, 'v'), 'npret').toEqual(['A v utrata [npret (przypięta wizyta przeżywa przycięcie)]']);
      expect(WYR.bezWyjatku(l, 'W4').length, 'npret po W4 — czerwień').toBe(1);
    }
    {
      const M = WYR.nowyModel();
      WYR.zapisz(M, { dev: 'B', opis: 'kosz v', przed: baza, po: stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-1' })])], kosz: [wpisKosza('v', 'P', 20, { vid: 'wiz-1' })] }), t: T(1), operacje: [op('moveSnapshotToTrash', 'P', 'v')] });
      WYR.zapisz(M, { dev: 'A', opis: 'retencja', przed: baza, po: przyciete, t: T(2), operacje: [op('pruneSnapshotsForPatient', 'P')] });
      expect(tylko(WYR.ocen(M, { A: widok(przyciete) }), 'v'), 'retencja po Koszu').toEqual(['A v utrata [retencja (przycięcie bez treści)]']);
      const M2 = WYR.nowyModel();
      WYR.zapisz(M2, { dev: 'B', opis: 'kosz v', przed: baza, po: stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-1' })])], kosz: [wpisKosza('v', 'P', 20, { vid: 'wiz-1' })] }), t: T(1), operacje: [op('moveSnapshotToTrash', 'P', 'v')] });
      expect(tylko(WYR.ocen(M2, { A: widok(stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-1' })])] })) }), 'v'), 'bez przycięcia').toEqual(['A v utrata [null]']);
    }
  });

  it('notatki od nowa po „Scal pacjentów”: scalenie zapisuje notatkę usuniętą wcześniej na innym urządzeniu (pozytyw); wskrzeszenie bez scalenia — bez klasy', () => {
    const baza = bazaPQ({ notatki: [notatka('n', 'P', 'Fikcyjna treść')] });
    const usunieta = { ...baza, patientNotes: [], patientNoteTombstones: [{ id: 'n' }] };
    const scalone = scalonePQ({ notatki: [notatka('n', 'Q', 'Fikcyjna treść', { rev: 2 })] });
    const M = WYR.nowyModel();
    WYR.zapisz(M, { dev: 'B', opis: 'usuń notatkę', przed: baza, po: usunieta, t: T(1), operacje: [] });
    WYR.zapisz(M, { dev: 'A', opis: 'Scal pacjentów', przed: baza, po: scalone, t: T(2), operacje: [op('mergePatients', 'P', 'Q')] });
    expect(tylko(WYR.ocen(M, { A: widok(scalone) }), 'n')).toEqual(['A n wskrzeszenie [notatki od nowa po „Scal pacjentów”]']);
    const M2 = WYR.nowyModel();
    WYR.zapisz(M2, { dev: 'B', opis: 'usuń notatkę', przed: baza, po: usunieta, t: T(1), operacje: [] });
    expect(tylko(WYR.ocen(M2, { A: widok(baza) }), 'n'), 'bez scalenia').toEqual(['A n wskrzeszenie [null]']);
  });

  it('D-4 A (Kosz w zwróconej starej karcie): A scala P → Q; B bez wiedzy zapisuje nową wersję u w P (P wraca), potem daje v do Kosza w P; A usuwa Q — wpis Kosza zostaje przy żywej P (pozytyw, wszystkie światy); kosz w P, która przed nim nie wróciła (także gdy wraca dopiero zapisem po koszu) — bez klasy', () => {
    const KL = 'D-4 A (Kosz w zwróconej starej karcie)';
    const baza = bazaPQ();
    const zU = stan({ karty: [karta('P', [...baza.patients[0].snapshots, wersja('u', 22, { vid: 'wiz-u' })]), baza.patients[1]] });
    const koszWP = (przed) => ({ ...przed, patients: [karta('P', przed.patients[0].snapshots.filter((s) => s.snapshotId !== 'v')), ...przed.patients.slice(1)], snapshotTombstones: [wpisKosza('v', 'P', 20, { vid: 'wiz-v' })] });
    const swiaty = ['W1', 'W4', 'bloby', 'W1 floty', 'W4 floty', 'p6f W1', 'p6f W4'];
    const historia = (kolejnosc) => {
      const M = WYR.nowyModel();
      WYR.zapisz(M, { dev: 'A', opis: 'Scal pacjentów', przed: baza, po: scalonePQ(), t: T(1), operacje: [op('mergePatients', 'P', 'Q')] });
      let t = 2;
      for (const krok of kolejnosc) {
        if (krok === 'u') WYR.zapisz(M, { dev: 'B', opis: 'nowa wersja u w P', przed: baza, po: zU, t: T(t++) });
        else WYR.zapisz(M, { dev: 'B', opis: 'kosz v w P', przed: krok === 'kosz po u' ? zU : baza, po: koszWP(krok === 'kosz po u' ? zU : baza), t: T(t++), operacje: [op('moveSnapshotToTrash', 'P', 'v')] });
      }
      WYR.zapisz(M, { dev: 'A', opis: 'usuń pacjenta Q', przed: scalonePQ(), po: stan({ nagrobki: ['P', 'Q'] }), t: T(t), operacje: [op('removePatient', 'Q')] });
      return M;
    };
    // widok po powrocie P: u w karcie P, v w Koszu P
    const wrocona = stan({ karty: [karta('P', [wersja('u', 22, { vid: 'wiz-u' })])], nagrobki: ['Q'], kosz: [wpisKosza('v', 'P', 20, { vid: 'wiz-v' })] });
    const l = WYR.ocen(historia(['u', 'kosz po u']), { A: widok(wrocona) }).filter((x) => x.id === 'v');
    expect(skrot(l), 'P wróciła przed koszem').toEqual([`A v wskrzeszenie [${KL}]`]);
    expect(swiaty.map((s) => WYR.bezWyjatku(l, s).length), 'dozwolona we wszystkich światach').toEqual([0, 0, 0, 0, 0, 0, 0]);
    // negatyw: kosz w P, która nie wróciła (widok B bez wiedzy o scaleniu i o usunięciu Q)
    const bezPowrotu = WYR.ocen(historia(['kosz']), { B: widok(koszWP(baza)) }).filter((x) => x.id === 'v');
    expect(skrot(bezPowrotu), 'P bez powrotu przed koszem').toEqual(['B v wskrzeszenie [null]']);
    expect(swiaty.map((s) => WYR.bezWyjatku(bezPowrotu, s).length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    // negatyw: P wraca dopiero zapisem po koszu
    expect(tylko(WYR.ocen(historia(['kosz', 'u']), { A: widok(wrocona) }), 'v'), 'zapis w P po koszu').toEqual(['A v wskrzeszenie [null]']);
  });

  it('klasa nie zależy od nazwy przebiegu (bez klasy Q8-obca-2): ocena nie ma parametru przebiegu', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const M = WYR.nowyModel();
    WYR.zapisz(M, { dev: 'A', opis: 'poprawka', przed: baza, po: stan({ karty: [karta('P', [wersja('v', 30, { rev: 2 }), wersja('w', 21)])] }), t: T(1), operacje: [op('updateSnapshotPayload', 'P', 'v')] });
    const bez = WYR.ocen(M, { B: widok(baza) }), z = WYR.ocen(M, { B: widok(baza) }, { przebieg: 'Q8-obca-2 K←C,P←K' });
    expect(skrot(z)).toEqual(skrot(bez));
    expect(skrot(z)).toEqual(['B v treść [null]']);
    expect(Object.keys(WYR.WYJATKI).some((k) => /Q8/.test(k)), 'brak klasy przebiegu Q8-obca-2').toBe(false);
  });

  it('tabela wyjątków: każda klasa z opisem, mechanizmem, źródłem i światami; E1/E1b — do naprawy w E3-PR0 (9a), E4b — tylko W1 (4a); klasa null zawsze czerwieni', () => {
    // klasy samych bieżących urządzeń (bez pola cechy; E3-PR0b dopisało „D-4 A (Kosz w zwróconej starej karcie)”); klasy
    // floty ze starszą aplikacją — osobny przypadek niżej
    expect(Object.values(WYR.WYJATKI).filter((w) => !w.cechy).length, 'liczba klas').toBe(16);
    for (const [k, w] of Object.entries(WYR.WYJATKI)) {
      expect(typeof w.opis === 'string' && w.opis.length > 20 && typeof w.zrodlo === 'string' && w.zrodlo.length > 10, `opis i źródło: ${k}`).toBe(true);
      expect(typeof w.mechanizm === 'string' && w.mechanizm.length > 20, `mechanizm: ${k}`).toBe(true);
      expect(w.swiaty.length > 0 && w.swiaty.every((s) => (w.cechy ? Object.keys(WYR.SWIATY_FLOTY) : ['W1', 'W4', 'bloby']).includes(s)), `światy: ${k}`).toBe(true);
      expect(Object.isFrozen(w), `zamrożona: ${k}`).toBe(true);
    }
    expect(Object.isFrozen(WYR.WYJATKI)).toBe(true);
    expect(WYR.WYJATKI['E1/E1b (utrata wersji nieznanej scalającemu)'].naprawa).toBe('do naprawy w E3-PR0 (decyzja właściciela 9a z 2026-11-15)');
    expect(WYR.WYJATKI['E4b (stara karta po „Scal pacjentów”)'].naprawa).toBe('do naprawy w osobnym PR etapu E3-PR0 (stara karta po „Scal pacjentów”; decyzja właściciela 4a z 2026-11-15)');
    expect(WYR.WYJATKI['E4b (stara karta po „Scal pacjentów”)'].swiaty, 'E4b: tylko W1').toEqual(['W1']);
    const e4b = [{ klasa: 'E4b (stara karta po „Scal pacjentów”)' }];
    expect(['W1', 'W4', 'bloby'].map((s) => WYR.bezWyjatku(e4b, s).length), 'E4b: W1 dozwolone, W4 i bloby czerwone').toEqual([0, 1, 1]);
    for (const s of ['W1', 'W4', 'bloby']) expect(WYR.bezWyjatku([{ klasa: null }], s).length, `null w ${s}`).toBe(1);
  });
});

// ── Flota ze starszą aplikacją (E3-PR0b) ─────────────────────────────────────────────────────────────────────────────
// Urządzenie C ma sejf 221 (app 'S221': bez składników W3, bez haków dziennika, bez ratunku notatek, retencja v1; jego
// zapisy treści nie mają payload.visit), D — sejf 276 ('S276': retencja v1), A i B — bieżące ('N'). Negatyw każdej klasy
// floty: ten sam objaw z mechanizmem na bieżącym urządzeniu (flota w ocenie przez stare) — bez klasy floty.
const bezWizyty = (p) => { const { visit: _wizyta, ...r } = p; return r; };
const wersja221 = (sid, kg, o = {}) => ({ ...wersja(sid, kg, o), payload: bezWizyty(pl(kg, o)) });
const zap = (M, dev, app, opis, przed, po, min, ...operacje) => WYR.zapisz(M, { dev, app, opis, przed, po, t: T(min), operacje });
const W_FLOCIE = ['W1 floty', 'W4 floty', 'p6f W1', 'p6f W4'];
// Liczba naruszeń, które czerwienią, w światach W1, W4, bloby i w czterech światach floty.
const czerwoneWSwiatach = (l) => ['W1', 'W4', 'bloby', ...W_FLOCIE].map((s) => WYR.bezWyjatku(l, s).length);
const KL = {
  przycinajace: 'retencja starszej aplikacji (urządzenie przycinające)',
  glowa: 'retencja starszej aplikacji (odbiorca zachował głowę wizyty)',
  gwiazdka: 'gwiazdka ze starszej aplikacji',
  przywroc: '„Przywróć” na starszej aplikacji bez chwili treści',
  nadpisana: 'zmiana starszej aplikacji nadpisana przed wysłaniem (bez W3)',
  rev: 'najpierw rev (starsza aplikacja)',
  notatka: 'notatka bez ratunku D-21 (starsza aplikacja)',
  czesciowa: 'karta częściowa (starsza aplikacja)',
  r4a: 'R4a (starsza aplikacja)',
  r4aPrim: 'R4a′ (starsza aplikacja)',
};
const dwieWizyty = () => stan({ karty: [karta('P', [wersja('v', 20, { vid: 'wiz-1' }), wersja('w', 21, { vid: 'wiz-2' })])] });
const nagrobekRetencji = { snapshotId: 'v', patientId: 'P', powod: 'retencja' };

describe('wyrocznia: flota ze starszą aplikacją (E3-PR0b) — normalizacja tożsamości wizyty i klasy z mechanizmem na urządzeniu starszej aplikacji', () => {
  it('normalizacja tożsamości wizyty: oczekiwany zapis bez payload.visit (poprawka na 221) — treść z visit dopisaną przez bieżące urządzenie porównuje się bez visit; po wyłączeniu (E2_AB_NORM_VISIT=0) — „treść”', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const na221 = stan({ karty: [karta('P', [wersja221('v', 30, { rev: 2 }), wersja('w', 21)])] });
    const naA = stan({ karty: [karta('P', [wersja('v', 30, { rev: 2 }), wersja('w', 21)])] }); // A wyznaczyło tożsamość wizyty
    const M = WYR.nowyModel();
    zap(M, 'C', 'S221', 'poprawka', baza, na221, 1, op('updateSnapshotPayload', 'P', 'v'));
    const byla = WYR.NORM_VISIT.wlaczona;
    try {
      WYR.NORM_VISIT.wlaczona = true;
      const uzyta = WYR.NORM_VISIT.uzyta;
      expect(WYR.ocen(M, { A: widok(naA), C: widok(na221) }), 'A z visit, C bez').toEqual([]);
      expect(WYR.NORM_VISIT.uzyta - uzyta, 'porównania rozstrzygnięte normalizacją').toBeGreaterThan(0);
      WYR.NORM_VISIT.wlaczona = false;
      expect(tylko(WYR.ocen(M, { A: widok(naA), C: widok(na221) }), 'v'), 'bez normalizacji').toEqual(['A v treść [null]']);
    } finally { WYR.NORM_VISIT.wlaczona = byla; }
  });

  it('normalizacja tożsamości wizyty — negatyw: oczekiwany zapis z payload.visit porównuje się ściśle (inna tożsamość wizyty albo jej brak w fakcie to „treść” bez klasy)', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const M = WYR.nowyModel();
    zap(M, 'A', 'N', 'poprawka', baza, stan({ karty: [karta('P', [wersja('v', 30, { rev: 2 }), wersja('w', 21)])] }), 1, op('updateSnapshotPayload', 'P', 'v'));
    const innaWizyta = stan({ karty: [karta('P', [wersja('v', 30, { rev: 2, vid: 'wiz-inna' }), wersja('w', 21)])] });
    const bezVisit = stan({ karty: [karta('P', [wersja221('v', 30, { rev: 2 }), wersja('w', 21)])] });
    expect(tylko(WYR.ocen(M, { B: widok(innaWizyta), C: widok(bezVisit) }, { stare: ['C'] }), 'v')).toEqual(['B v treść [null]', 'C v treść [null]']);
  });

  it('normalizacja tożsamości wizyty — negatyw karty wizyty: w widoku bieżącego urządzenia visit.patientId innej karty niż karta wersji (oczekiwany zapis z 221) — porównanie ścisłe, „treść” bez klasy; ten sam fakt w widoku starszej aplikacji — z normalizacją', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const M = WYR.nowyModel();
    zap(M, 'C', 'S221', 'poprawka', baza, stan({ karty: [karta('P', [wersja221('v', 30, { rev: 2 }), wersja('w', 21)])] }), 1, op('updateSnapshotPayload', 'P', 'v'));
    const obcaKarta = stan({ karty: [karta('P', [wersja('v', 30, { rev: 2, pid: 'Q', vid: 'wiz-P' }), wersja('w', 21)])] });
    expect(tylko(WYR.ocen(M, { A: widok(obcaKarta) }), 'v'), 'A: visit.patientId = Q pod kartą P').toEqual(['A v treść [null]']);
    expect(tylko(WYR.ocen(M, { C: widok(obcaKarta) }), 'v'), 'C (starsza aplikacja)').toEqual([]);
  });

  it('retencja starszej aplikacji (urządzenie przycinające): retencja v1 na 221 i na 276 usuwa u siebie ostatni stan wizyty — klasa tylko w widoku przycinającego i tylko w światach floty', () => {
    for (const [dev, app] of [['C', 'S221'], ['D', 'S276']]) {
      const baza = dwieWizyty();
      const przyciete = stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-2' })])], kosz: [nagrobekRetencji] });
      const M = WYR.nowyModel();
      zap(M, dev, app, 'retencja', baza, przyciete, 1, op('pruneSnapshotsForPatient', 'P'));
      const l = WYR.ocen(M, { A: widok(baza), [dev]: widok(przyciete) });
      expect(skrot(l), app).toEqual([`${dev} v retencja usunęła ostatni stan wizyty [${KL.przycinajace}]`]);
      expect(czerwoneWSwiatach(l), `${app}: tylko światy floty`).toEqual([1, 1, 1, 0, 0, 0, 0]);
    }
  });

  it('retencja starszej aplikacji (urządzenie przycinające) — negatyw: ta sama retencja na bieżącym urządzeniu i widok bieżącego urządzenia bez innej wersji tej wizyty — bez klasy', () => {
    const baza = dwieWizyty();
    const przyciete = stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-2' })])], kosz: [nagrobekRetencji] });
    const naN = WYR.nowyModel();
    zap(naN, 'A', 'N', 'retencja', baza, przyciete, 1, op('pruneSnapshotsForPatient', 'P'));
    expect(skrot(WYR.ocen(naN, { A: widok(przyciete) }, { stare: ['C'] })), 'retencja na A').toEqual(['A v retencja usunęła ostatni stan wizyty [null]']);
    const na221 = WYR.nowyModel();
    zap(na221, 'C', 'S221', 'retencja', baza, przyciete, 1, op('pruneSnapshotsForPatient', 'P'));
    expect(skrot(WYR.ocen(na221, { B: widok(przyciete) })), 'widok B (nie przycinał, bez innej wersji wiz-1)').toEqual(['B v retencja usunęła ostatni stan wizyty [null]']);
  });

  it('retencja starszej aplikacji (odbiorca zachował głowę wizyty): 221 przycina v, nie znając nowszej wersji u tej samej wizyty — bieżące A zachowuje u, usuwa v', () => {
    const baza = dwieWizyty();
    const zU = stan({ karty: [karta('P', [...baza.patients[0].snapshots, wersja('u', 25, { vid: 'wiz-1' })])] });
    const przyciete = stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-2' })])], kosz: [nagrobekRetencji] });
    const M = WYR.nowyModel();
    zap(M, 'A', 'N', 'nowa wersja wizyty wiz-1', baza, zU, 1);
    zap(M, 'C', 'S221', 'retencja', baza, przyciete, 2, op('pruneSnapshotsForPatient', 'P'));
    const poWymianie = stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-2' }), wersja('u', 25, { vid: 'wiz-1' })])], kosz: [nagrobekRetencji] });
    const l = WYR.ocen(M, { A: widok(poWymianie), C: widok(poWymianie) });
    expect(skrot(l)).toEqual([`A v retencja usunęła ostatni stan wizyty [${KL.glowa}]`, `C v retencja usunęła ostatni stan wizyty [${KL.przycinajace}]`]);
    expect(czerwoneWSwiatach(l)).toEqual([2, 2, 2, 0, 0, 0, 0]);
  });

  it('retencja starszej aplikacji (odbiorca zachował głowę wizyty) — negatyw: przycięcie na bieżącym urządzeniu; widok urządzenia starszej aplikacji z inną wersją tej wizyty — bez klasy', () => {
    const baza = dwieWizyty();
    const zU = stan({ karty: [karta('P', [...baza.patients[0].snapshots, wersja('u', 25, { vid: 'wiz-1' })])] });
    const przyciete = stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-2' })])], kosz: [nagrobekRetencji] });
    const poWymianie = stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-2' }), wersja('u', 25, { vid: 'wiz-1' })])], kosz: [nagrobekRetencji] });
    const naN = WYR.nowyModel();
    zap(naN, 'A', 'N', 'nowa wersja wizyty wiz-1', baza, zU, 1);
    zap(naN, 'B', 'N', 'retencja', baza, przyciete, 2, op('pruneSnapshotsForPatient', 'P'));
    expect(skrot(WYR.ocen(naN, { A: widok(poWymianie) }, { stare: ['C'] })), 'przycięcie na B').toEqual(['A v retencja usunęła ostatni stan wizyty [null]']);
    const na221 = WYR.nowyModel();
    zap(na221, 'A', 'N', 'nowa wersja wizyty wiz-1', baza, zU, 1);
    zap(na221, 'C', 'S221', 'retencja', baza, przyciete, 2, op('pruneSnapshotsForPatient', 'P'));
    expect(skrot(WYR.ocen(na221, { D: widok(poWymianie) }, { stare: ['D'] })), 'widok D (276)').toEqual(['D v retencja usunęła ostatni stan wizyty [null]']);
    // bieżące A bez nagrobka retencji tej wersji (nagrobek do A nie doszedł, a v i tak zniknęło) — bez klasy
    const bezNagrobka = stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-2' }), wersja('u', 25, { vid: 'wiz-1' })])] });
    expect(skrot(WYR.ocen(na221, { A: widok(bezNagrobka) })), 'widok A bez nagrobka retencji').toEqual(['A v retencja usunęła ostatni stan wizyty [null]']);
  });

  it('gwiazdka ze starszej aplikacji: „Odepnij i usuń” na 221 (treść Kosza z gwiazdką, bez pola gwiazdka) — Kosz z gwiazdką w widoku A (W20) i C (semantyka 221); „Przywróć” na A — karta z gwiazdką sprzed', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20, { pinned: true }), wersja('w', 21)])] });
    const kosz = stan({ karty: [karta('P', [wersja('w', 21)])], kosz: [wpisKosza('v', 'P', 20, { pinned: true })] });
    const M = WYR.nowyModel();
    zap(M, 'C', 'S221', 'odepnij i usuń', baza, kosz, 1, op('moveSnapshotToTrash', 'P', 'v', { odepnij: true }));
    const l = WYR.ocen(M, { A: widok(kosz), C: widok(kosz) });
    expect(tylko(l, 'v')).toEqual([`A v gwiazdka Kosza [${KL.gwiazdka}]`, `C v gwiazdka Kosza [${KL.gwiazdka}]`]);
    expect(czerwoneWSwiatach(l)).toEqual([2, 2, 2, 0, 0, 0, 0]);
    const przywrocone = stan({ karty: [karta('P', [wersja('v', 20, { pinned: true, rev: 2 }), wersja('w', 21)])] });
    zap(M, 'A', 'N', 'przywróć', kosz, przywrocone, 2, op('restoreTrashedSnapshot', 'P', 'v'));
    expect(tylko(WYR.ocen(M, { A: widok(przywrocone) }), 'v'), 'po „Przywróć”').toEqual([`A v gwiazdka [${KL.gwiazdka}]`]);
  });

  it('gwiazdka ze starszej aplikacji — negatyw: „Odepnij i usuń” na bieżącym urządzeniu i na 276 (rejestr gwiazdki znany), a Kosz z gwiazdką — bez klasy', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20, { pinned: true }), wersja('w', 21)])] });
    const kosz = stan({ karty: [karta('P', [wersja('w', 21)])], kosz: [wpisKosza('v', 'P', 20, { pinned: true })] });
    for (const [dev, app] of [['B', 'N'], ['D', 'S276']]) {
      const M = WYR.nowyModel();
      zap(M, dev, app, 'odepnij i usuń', baza, kosz, 1, op('moveSnapshotToTrash', 'P', 'v', { odepnij: true }));
      expect(tylko(WYR.ocen(M, { A: widok(kosz) }, { stare: ['C'] }), 'v'), app).toEqual(['A v gwiazdka Kosza [null]']);
    }
  });

  it('gwiazdka ze starszej aplikacji — warunek faktu: kosz na 221 bez wiedzy o gwiazdce z A, a bieżące B ze swoją gwiazdką sprzed kosza (W20 na B, do którego gwiazdka A nie doszła) — R4a, tylko po samych zdarzeniach (czerwień w W4 floty); kosz na 221, które gwiazdkę znało, a B z gwiazdką inną niż wynik W20 — czerwień bez klasy; widok C zgodny z 221 — klasa; widok urządzenia starszej aplikacji z listy stare', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const przypieta = stan({ karty: [karta('P', [wersja('v', 20, { pinned: true, rev: 2 }), wersja('w', 21)])] });
    const kosz = stan({ karty: [karta('P', [wersja('w', 21)])], kosz: [wpisKosza('v', 'P', 20)] });
    const koszZGwiazdka = stan({ karty: [karta('P', [wersja('w', 21)])], kosz: [wpisKosza('v', 'P', 20, { pinned: true })] });
    const historia = (dev, app) => {
      const M = WYR.nowyModel();
      zap(M, 'A', 'N', 'gwiazdka', baza, przypieta, 1, op('setSnapshotPinned', 'P', 'v', true));
      zap(M, dev, app, 'usuń', baza, kosz, 2, op('moveSnapshotToTrash', 'P', 'v'));
      return M;
    };
    const M = historia('C', 'S221');
    const l = WYR.ocen(M, { B: widok(kosz), C: widok(kosz) }).filter((x) => x.id === 'v');
    expect(skrot(l), 'B bez gwiazdki (W20 na B), C bez gwiazdki (221)').toEqual(['B v gwiazdka Kosza [R4a]', `C v gwiazdka Kosza [${KL.gwiazdka}]`]);
    expect(czerwoneWSwiatach(l.filter((x) => x.urz === 'B')), 'R4a: W1 i W1 floty — tak, W4 floty — czerwień').toEqual([0, 1, 0, 0, 1, 0, 1]);
    expect(tylko(WYR.ocen(M, { B: widok(koszZGwiazdka) }), 'v'), 'B zgodne z W20 z modelu').toEqual([]);
    expect(tylko(WYR.ocen(M, { E: widok(kosz) }), 'v'), 'E spoza stare — widok bieżącej aplikacji').toEqual(['E v gwiazdka Kosza [R4a]']);
    expect(tylko(WYR.ocen(M, { E: widok(kosz) }, { stare: ['E'] }), 'v'), 'E w stare — semantyka 221').toEqual([`E v gwiazdka Kosza [${KL.gwiazdka}]`]);
    // kosz na 221, które znało ostatnią gwiazdkę (wersja bez gwiazdki u wszystkich): W20 daje „bez gwiazdki” na każdym
    // bieżącym urządzeniu, więc Kosz z gwiazdką w widoku B to czerwień w każdym świecie (bez R4a)
    const znana = WYR.nowyModel();
    zap(znana, 'C', 'S221', 'usuń', baza, kosz, 1, op('moveSnapshotToTrash', 'P', 'v'));
    const twardy = WYR.ocen(znana, { B: widok(koszZGwiazdka) }).filter((x) => x.id === 'v');
    expect(skrot(twardy), 'B z gwiazdką inną niż W20').toEqual(['B v gwiazdka Kosza [null]']);
    expect(czerwoneWSwiatach(twardy)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    // ten sam kosz na bieżącym urządzeniu bez wiedzy o gwiazdce: R4a (dozwolona w W1 i w W1 floty, nie w W4 floty)
    const naN = WYR.ocen(historia('C', 'N'), { B: widok(kosz) }, { stare: ['D'] }).filter((x) => x.id === 'v');
    expect(skrot(naN)).toEqual(['B v gwiazdka Kosza [R4a]']);
    expect(czerwoneWSwiatach(naN)).toEqual([0, 1, 0, 0, 1, 0, 1]);
  });

  it('„Przywróć” na starszej aplikacji bez chwili treści: kosz v (30 kg) na 221, poprawka A (19 kg) bez wiedzy o koszu, „Przywróć” na 221 — wszędzie 19 kg (poprawka z bieżącej aplikacji)', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 30), wersja('w', 21)])] });
    const kosz = stan({ karty: [karta('P', [wersja('w', 21)])], kosz: [wpisKosza('v', 'P', 30)] });
    const poprawka = stan({ karty: [karta('P', [wersja('v', 19, { rev: 2 }), wersja('w', 21)])] });
    const M = WYR.nowyModel();
    zap(M, 'C', 'S221', 'usuń', baza, kosz, 1, op('moveSnapshotToTrash', 'P', 'v'));
    zap(M, 'A', 'N', 'poprawka', baza, poprawka, 2, op('updateSnapshotPayload', 'P', 'v'));
    zap(M, 'C', 'S221', 'przywróć', kosz, stan({ karty: [karta('P', [wersja('v', 30, { rev: 3 }), wersja('w', 21)])] }), 3, op('restoreTrashedSnapshot', 'P', 'v'));
    const l = WYR.ocen(M, { A: widok(poprawka), C: widok(poprawka) });
    expect(tylko(l, 'v')).toEqual([`A v treść [${KL.przywroc}]`, `C v treść [${KL.przywroc}]`]);
    expect(czerwoneWSwiatach(l)).toEqual([2, 2, 2, 0, 0, 0, 0]);
  });

  it('„Przywróć” na starszej aplikacji bez chwili treści — negatyw: „Przywróć” na bieżącym urządzeniu (chwila przywrócenia wygrywa); poprawka na urządzeniu starszej aplikacji (bez pól W3); po „Przywróć” na 221 fakt inny niż poprawka — bez klasy', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 30), wersja('w', 21)])] });
    const kosz = stan({ karty: [karta('P', [wersja('w', 21)])], kosz: [wpisKosza('v', 'P', 30)] });
    const poprawka = stan({ karty: [karta('P', [wersja('v', 19, { rev: 2 }), wersja('w', 21)])] });
    const historia = (dev, app, poprawkaNa = ['A', 'N']) => {
      const M = WYR.nowyModel();
      zap(M, 'C', 'S221', 'usuń', baza, kosz, 1, op('moveSnapshotToTrash', 'P', 'v'));
      zap(M, ...poprawkaNa, 'poprawka', baza, poprawka, 2, op('updateSnapshotPayload', 'P', 'v'));
      zap(M, dev, app, 'przywróć', kosz, stan({ karty: [karta('P', [wersja('v', 30, { rev: 3 }), wersja('w', 21)])] }), 3, op('restoreTrashedSnapshot', 'P', 'v'));
      return M;
    };
    expect(tylko(WYR.ocen(historia('B', 'N'), { A: widok(poprawka) }), 'v'), '„Przywróć” na B').toEqual(['A v treść [null]']);
    expect(tylko(WYR.ocen(historia('C', 'S221', ['E', 'S221']), { A: widok(poprawka) }), 'v'), 'poprawka na E (221)').toEqual(['A v treść [null]']);
    const inna = stan({ karty: [karta('P', [wersja('v', 25, { rev: 3 }), wersja('w', 21)])] });
    expect(tylko(WYR.ocen(historia('C', 'S221'), { A: widok(inna) }), 'v'), 'fakt 25 kg').toEqual(['A v treść [null]']);
  });

  it('zmiana starszej aplikacji nadpisana przed wysłaniem: (a) poprawka na 221, potem gwiazdka A bez wiedzy o niej — wszędzie stara treść; gwiazdka na 221, potem poprawka A bez wiedzy o niej — wszędzie bez gwiazdki; (b) gwiazdka 221 na wersji utworzonej na 221 bez wiedzy o poprawce A — stara treść 221', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    {
      const M = WYR.nowyModel();
      zap(M, 'C', 'S221', 'poprawka', baza, stan({ karty: [karta('P', [wersja221('v', 23, { rev: 2 }), wersja('w', 21)])] }), 1, op('updateSnapshotPayload', 'P', 'v'));
      const gwiazdkaA = stan({ karty: [karta('P', [wersja('v', 20, { pinned: true, rev: 2 }), wersja('w', 21)])] });
      zap(M, 'A', 'N', 'gwiazdka', baza, gwiazdkaA, 2, op('setSnapshotPinned', 'P', 'v', true));
      const l = WYR.ocen(M, { A: widok(gwiazdkaA), C: widok(gwiazdkaA) });
      expect(tylko(l, 'v'), 'poprawka 221 nadpisana').toEqual([`A v treść [${KL.nadpisana}]`, `C v treść [${KL.nadpisana}]`]);
      expect(czerwoneWSwiatach(l)).toEqual([2, 2, 2, 0, 0, 0, 0]);
    }
    {
      const M = WYR.nowyModel();
      zap(M, 'C', 'S221', 'gwiazdka', baza, stan({ karty: [karta('P', [wersja('v', 20, { pinned: true, rev: 2 }), wersja('w', 21)])] }), 1, op('setSnapshotPinned', 'P', 'v', true));
      const poprawkaA = stan({ karty: [karta('P', [wersja('v', 26, { rev: 2 }), wersja('w', 21)])] });
      zap(M, 'A', 'N', 'poprawka', baza, poprawkaA, 2, op('updateSnapshotPayload', 'P', 'v'));
      expect(tylko(WYR.ocen(M, { A: widok(poprawkaA), C: widok(poprawkaA) }), 'v'), 'gwiazdka 221 nadpisana').toEqual([`A v gwiazdka [${KL.nadpisana}]`, `C v gwiazdka [${KL.nadpisana}]`]);
    }
    {
      const bez = stan({ karty: [karta('P', [wersja('w', 21)])] });
      const nowaC = stan({ karty: [karta('P', [wersja('w', 21), wersja221('v', 20)])] });
      const M = WYR.nowyModel();
      zap(M, 'C', 'S221', 'nowa wersja', bez, nowaC, 1);
      zap(M, 'A', 'N', 'poprawka', nowaC, stan({ karty: [karta('P', [wersja('w', 21), wersja('v', 25, { rev: 2 })])] }), 2, op('updateSnapshotPayload', 'P', 'v'));
      const gwiazdkaC = stan({ karty: [karta('P', [wersja('w', 21), wersja221('v', 20, { pinned: true, rev: 2 })])] });
      zap(M, 'C', 'S221', 'gwiazdka', nowaC, gwiazdkaC, 3, op('setSnapshotPinned', 'P', 'v', true));
      const naA = stan({ karty: [karta('P', [wersja('w', 21), wersja('v', 20, { pinned: true, rev: 2 })])] }); // A wyznaczyło tożsamość wizyty
      expect(tylko(WYR.ocen(M, { A: widok(naA), C: widok(gwiazdkaC) }), 'v'), 'gwiazdka 221 jak zmiana treści').toEqual([`A v treść [${KL.nadpisana}]`, `C v treść [${KL.nadpisana}]`]);
    }
  });

  it('zmiana starszej aplikacji nadpisana przed wysłaniem — negatyw: te same zapisy na bieżących urządzeniach; gwiazdka 221 na wersji utworzonej na bieżącym urządzeniu (z polami W3) — bez klasy', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const gwiazdkaA = stan({ karty: [karta('P', [wersja('v', 20, { pinned: true, rev: 2 }), wersja('w', 21)])] });
    {
      const M = WYR.nowyModel();
      zap(M, 'D', 'N', 'poprawka', baza, stan({ karty: [karta('P', [wersja('v', 23, { rev: 2 }), wersja('w', 21)])] }), 1, op('updateSnapshotPayload', 'P', 'v'));
      zap(M, 'A', 'N', 'gwiazdka', baza, gwiazdkaA, 2, op('setSnapshotPinned', 'P', 'v', true));
      expect(tylko(WYR.ocen(M, { A: widok(gwiazdkaA) }, { stare: ['C'] }), 'v'), 'poprawka na D').toEqual(['A v treść [null]']);
    }
    {
      const M = WYR.nowyModel();
      zap(M, 'D', 'N', 'gwiazdka', baza, stan({ karty: [karta('P', [wersja('v', 20, { pinned: true, rev: 2 }), wersja('w', 21)])] }), 1, op('setSnapshotPinned', 'P', 'v', true));
      const poprawkaA = stan({ karty: [karta('P', [wersja('v', 26, { rev: 2 }), wersja('w', 21)])] });
      zap(M, 'A', 'N', 'poprawka', baza, poprawkaA, 2, op('updateSnapshotPayload', 'P', 'v'));
      expect(tylko(WYR.ocen(M, { A: widok(poprawkaA) }, { stare: ['C'] }), 'v'), 'gwiazdka na D').toEqual(['A v gwiazdka [null]']);
    }
    {
      const bez = stan({ karty: [karta('P', [wersja('w', 21)])] });
      const nowaB = stan({ karty: [karta('P', [wersja('w', 21), wersja('v', 20)])] });
      const M = WYR.nowyModel();
      zap(M, 'B', 'N', 'nowa wersja', bez, nowaB, 1);
      zap(M, 'A', 'N', 'poprawka', nowaB, stan({ karty: [karta('P', [wersja('w', 21), wersja('v', 25, { rev: 2 })])] }), 2, op('updateSnapshotPayload', 'P', 'v'));
      const gwiazdkaC = stan({ karty: [karta('P', [wersja('w', 21), wersja('v', 20, { pinned: true, rev: 2 })])] });
      zap(M, 'C', 'S221', 'gwiazdka', nowaB, gwiazdkaC, 3, op('setSnapshotPinned', 'P', 'v', true));
      expect(tylko(WYR.ocen(M, { A: widok(gwiazdkaC) }), 'v'), 'wersja utworzona na B').toEqual(['A v treść [null]']);
    }
  });

  it('zmiana starszej aplikacji nadpisana przed wysłaniem — negatyw: zmiana opuściła 221 (oczekiwana treść albo gwiazdka jest w innym widoku punktu), więc jej brak w widoku bieżącego D leży po stronie wymiany bieżących urządzeń — bez klasy', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    {
      // (a) treść: poprawka 23 kg na 221, gwiazdka A bez wiedzy o niej; B ma poprawkę z gwiazdką, D — samą gwiazdkę A
      const M = WYR.nowyModel();
      zap(M, 'C', 'S221', 'poprawka', baza, stan({ karty: [karta('P', [wersja221('v', 23, { rev: 2 }), wersja('w', 21)])] }), 1, op('updateSnapshotPayload', 'P', 'v'));
      const gwiazdkaA = stan({ karty: [karta('P', [wersja('v', 20, { pinned: true, rev: 2 }), wersja('w', 21)])] });
      zap(M, 'A', 'N', 'gwiazdka', baza, gwiazdkaA, 2, op('setSnapshotPinned', 'P', 'v', true));
      const zPoprawka = stan({ karty: [karta('P', [wersja('v', 23, { pinned: true, rev: 3 }), wersja('w', 21)])] });
      const l = WYR.ocen(M, { B: widok(zPoprawka), D: widok(gwiazdkaA) });
      expect(tylko(l, 'v'), '(a) treść').toEqual(['D v treść [null]']);
      expect(l.find((x) => x.id === 'v').gdzieIndziej).toEqual(['B']);
    }
    {
      // (a) gwiazdka: gwiazdka na 221, poprawka A bez wiedzy o niej; B ma poprawkę z gwiazdką, D — samą poprawkę A
      const M = WYR.nowyModel();
      zap(M, 'C', 'S221', 'gwiazdka', baza, stan({ karty: [karta('P', [wersja('v', 20, { pinned: true, rev: 2 }), wersja('w', 21)])] }), 1, op('setSnapshotPinned', 'P', 'v', true));
      const poprawkaA = stan({ karty: [karta('P', [wersja('v', 26, { rev: 2 }), wersja('w', 21)])] });
      zap(M, 'A', 'N', 'poprawka', baza, poprawkaA, 2, op('updateSnapshotPayload', 'P', 'v'));
      const zGwiazdka = stan({ karty: [karta('P', [wersja('v', 26, { pinned: true, rev: 3 }), wersja('w', 21)])] });
      expect(tylko(WYR.ocen(M, { B: widok(zGwiazdka), D: widok(poprawkaA) }), 'v'), '(a) gwiazdka').toEqual(['D v gwiazdka [null]']);
    }
    {
      // (b): poprawka A (25 kg) wersji utworzonej na 221 i gwiazdka 221 bez wiedzy o niej; B ma poprawkę A z gwiazdką
      const bez = stan({ karty: [karta('P', [wersja('w', 21)])] });
      const nowaC = stan({ karty: [karta('P', [wersja('w', 21), wersja221('v', 20)])] });
      const M = WYR.nowyModel();
      zap(M, 'C', 'S221', 'nowa wersja', bez, nowaC, 1);
      zap(M, 'A', 'N', 'poprawka', nowaC, stan({ karty: [karta('P', [wersja('w', 21), wersja('v', 25, { rev: 2 })])] }), 2, op('updateSnapshotPayload', 'P', 'v'));
      zap(M, 'C', 'S221', 'gwiazdka', nowaC, stan({ karty: [karta('P', [wersja('w', 21), wersja221('v', 20, { pinned: true, rev: 2 })])] }), 3, op('setSnapshotPinned', 'P', 'v', true));
      const naA = stan({ karty: [karta('P', [wersja('w', 21), wersja('v', 20, { pinned: true, rev: 2 })])] });
      const naB = stan({ karty: [karta('P', [wersja('w', 21), wersja('v', 25, { pinned: true, rev: 3 })])] });
      expect(tylko(WYR.ocen(M, { A: widok(naA), B: widok(naB) }), 'v'), '(b)').toEqual(['A v treść [null]']);
    }
  });

  it('najpierw rev (starsza aplikacja): poprawka na 221 (rev 3), później poprawka B (rev 2) bez wiedzy o niej; karta wraca z 221 — wszędzie wcześniejsza treść z wyższym rev', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const na221 = stan({ karty: [karta('P', [wersja221('v', 23, { rev: 3 }), wersja('w', 21)])] });
    const M = WYR.nowyModel();
    zap(M, 'C', 'S221', 'poprawka', baza, na221, 1, op('updateSnapshotPayload', 'P', 'v'));
    zap(M, 'B', 'N', 'poprawka', baza, stan({ karty: [karta('P', [wersja('v', 26, { rev: 2 }), wersja('w', 21)])] }), 2, op('updateSnapshotPayload', 'P', 'v'));
    const naA = stan({ karty: [karta('P', [wersja('v', 23, { rev: 3 }), wersja('w', 21)])] }); // A wyznaczyło tożsamość wizyty
    const l = WYR.ocen(M, { A: widok(naA), C: widok(na221) });
    expect(tylko(l, 'v')).toEqual([`A v treść [${KL.rev}]`, `C v treść [${KL.rev}]`]);
    expect(czerwoneWSwiatach(l)).toEqual([2, 2, 2, 0, 0, 0, 0]);
  });

  it('najpierw rev — negatyw: te same poprawki na bieżących urządzeniach; na 221 z rev zgodnym z kolejnością chwil — bez klasy', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const historia = (dev, app, revC, revB) => {
      const M = WYR.nowyModel();
      zap(M, dev, app, 'poprawka', baza, stan({ karty: [karta('P', [wersja221('v', 23, { rev: revC }), wersja('w', 21)])] }), 1, op('updateSnapshotPayload', 'P', 'v'));
      zap(M, 'B', 'N', 'poprawka', baza, stan({ karty: [karta('P', [wersja('v', 26, { rev: revB }), wersja('w', 21)])] }), 2, op('updateSnapshotPayload', 'P', 'v'));
      return M;
    };
    const fakt = stan({ karty: [karta('P', [wersja221('v', 23, { rev: 3 }), wersja('w', 21)])] });
    expect(tylko(WYR.ocen(historia('D', 'N', 3, 2), { A: widok(fakt) }, { stare: ['C'] }), 'v'), 'poprawka na D').toEqual(['A v treść [null]']);
    expect(tylko(WYR.ocen(historia('C', 'S221', 2, 3), { A: widok(fakt) }), 'v'), 'rev 2 < rev 3').toEqual(['A v treść [null]']);
  });

  it('najpierw rev — przyczyna po stronie bieżącej aplikacji: B samo zapisało późniejszą treść (rev 2), a pokazuje wcześniejszą z 221 (rev 3) — bieżąca aplikacja wybiera po chwili (rekord 221 bez pól W3 ma chwilę treści updatedAtISO), więc bez klasy, także gdy A ma oczekiwaną; karta wraca zmianą 221 po „Usuń pacjenta” — klasa także w widoku B', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const na221 = stan({ karty: [karta('P', [wersja221('v', 23, { rev: 3 }), wersja('w', 21)])] });
    const poB = stan({ karty: [karta('P', [wersja('v', 26, { rev: 2 }), wersja('w', 21)])] });
    const naB = stan({ karty: [karta('P', [wersja('v', 23, { rev: 3 }), wersja('w', 21)])] }); // B wyznaczyło tożsamość wizyty
    const M = WYR.nowyModel();
    zap(M, 'C', 'S221', 'poprawka', baza, na221, 1, op('updateSnapshotPayload', 'P', 'v'));
    zap(M, 'B', 'N', 'poprawka', baza, poB, 2, op('updateSnapshotPayload', 'P', 'v'));
    expect(tylko(WYR.ocen(M, { A: widok(poB), B: widok(naB) }), 'v'), 'A z oczekiwaną treścią').toEqual(['B v treść [null]']);
    expect(tylko(WYR.ocen(M, { B: widok(naB) }), 'v'), 'sam widok B').toEqual(['B v treść [null]']);
    // „Usuń pacjenta” na A (zna poprawkę B), potem 221 bez wiedzy o usunięciu zmienia kartę: jedynym źródłem wersji v
    // po powrocie karty jest 221
    zap(M, 'A', 'N', 'usuń pacjenta', poB, stan({ nagrobki: ['P'] }), 3, op('removePatient', 'P'));
    const zU = stan({ karty: [karta('P', [...na221.patients[0].snapshots, wersja221('u', 25)])] });
    zap(M, 'C', 'S221', 'nowa wersja', na221, zU, 4);
    const wrocona = stan({ karty: [karta('P', [wersja('v', 23, { rev: 3 }), wersja('w', 21), wersja('u', 25)])] });
    expect(tylko(WYR.ocen(M, { A: widok(wrocona), B: widok(wrocona) }), 'v'), 'karta wróciła zmianą 221').toEqual([`A v treść [${KL.rev}]`, `B v treść [${KL.rev}]`]);
  });

  it('notatka bez ratunku D-21 (starsza aplikacja): (a) „Usuń pacjenta” na A, nagrobek notatki doszedł do 221, potem zmiana karty na 221; (b) „Usuń pacjenta” na 221, potem zmiana karty na A — karta wraca bez notatki', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20)])], notatki: [notatka('n', 'P', 'Fikcyjna treść')] });
    const usuniety = stan({ nagrobki: ['P'], nagrNotatek: [{ id: 'n' }] });
    {
      const M = WYR.nowyModel();
      zap(M, 'A', 'N', 'usuń pacjenta', baza, usuniety, 1, op('removePatient', 'P'));
      const przedC = stan({ karty: [karta('P', [wersja('v', 20)])], nagrNotatek: [{ id: 'n' }] });
      const poC = stan({ karty: [karta('P', [wersja('v', 20), wersja221('u', 25)])], nagrNotatek: [{ id: 'n' }] });
      zap(M, 'C', 'S221', 'nowa wersja', przedC, poC, 2);
      const l = WYR.ocen(M, { A: widok(poC), C: widok(poC) });
      expect(tylko(l, 'n'), '(a)').toEqual([`A n utrata [${KL.notatka}]`, `C n utrata [${KL.notatka}]`]);
      expect(czerwoneWSwiatach(l)).toEqual([2, 2, 2, 0, 0, 0, 0]);
    }
    {
      const M = WYR.nowyModel();
      zap(M, 'C', 'S221', 'usuń pacjenta', baza, usuniety, 1, op('removePatient', 'P'));
      const poA = stan({ karty: [karta('P', [wersja('v', 20), wersja('u', 25)])], notatki: [notatka('n', 'P', 'Fikcyjna treść')] });
      zap(M, 'A', 'N', 'nowa wersja', baza, poA, 2);
      expect(tylko(WYR.ocen(M, { A: widok(stan({ karty: poA.patients })) }), 'n'), '(b)').toEqual([`A n utrata [${KL.notatka}]`]);
    }
  });

  it('notatka bez ratunku D-21 — negatyw: „Usuń pacjenta” na bieżącym urządzeniu albo na 276 (ratunek D-21 działa) i powrót karty na A — utrata bez klasy', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20)])], notatki: [notatka('n', 'P', 'Fikcyjna treść')] });
    const poA = stan({ karty: [karta('P', [wersja('v', 20), wersja('u', 25)])], notatki: [notatka('n', 'P', 'Fikcyjna treść')] });
    for (const [dev, app] of [['B', 'N'], ['D', 'S276']]) {
      const M = WYR.nowyModel();
      zap(M, dev, app, 'usuń pacjenta', baza, stan({ nagrobki: ['P'], nagrNotatek: [{ id: 'n' }] }), 1, op('removePatient', 'P'));
      zap(M, 'A', 'N', 'nowa wersja', baza, poA, 2);
      expect(tylko(WYR.ocen(M, { A: widok(stan({ karty: poA.patients })) }, { stare: ['C'] }), 'n'), app).toEqual(['A n utrata [null]']);
    }
  });

  it('notatka bez ratunku D-21 — negatyw (a): „Usuń pacjenta” na A, a 221 zmienia kartę, mając jeszcze notatkę (nagrobek do niego nie doszedł) — jego pełna kopia niesie rekord notatki, ratunek D-21 bieżącej aplikacji ją przywraca; utrata bez klasy', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20)])], notatki: [notatka('n', 'P', 'Fikcyjna treść')] });
    const M = WYR.nowyModel();
    zap(M, 'A', 'N', 'usuń pacjenta', baza, stan({ nagrobki: ['P'], nagrNotatek: [{ id: 'n' }] }), 1, op('removePatient', 'P'));
    const poC = stan({ karty: [karta('P', [wersja('v', 20), wersja221('u', 25)])], notatki: [notatka('n', 'P', 'Fikcyjna treść')] });
    zap(M, 'C', 'S221', 'nowa wersja', baza, poC, 2);
    const bezN = stan({ karty: poC.patients });
    expect(tylko(WYR.ocen(M, { A: widok(bezN), B: widok(bezN) }), 'n')).toEqual(['A n utrata [null]', 'B n utrata [null]']);
  });

  it('karta częściowa (starsza aplikacja): (a) „Usuń pacjenta” na A, karta wraca zmianą 221 (bez haka H1); (b) retencja v1 na 276 usunęła ostatni stan wizyty, potem „Usuń pacjenta” i powrót karty z B — dozwolona także w W4 floty', () => {
    {
      const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
      const M = WYR.nowyModel();
      zap(M, 'A', 'N', 'usuń pacjenta', baza, stan({ nagrobki: ['P'] }), 1, op('removePatient', 'P'));
      zap(M, 'C', 'S221', 'nowa wersja', baza, stan({ karty: [karta('P', [...baza.patients[0].snapshots, wersja221('u', 25)])] }), 2);
      const l = WYR.ocen(M, { A: widok(stan({ karty: [karta('P', [wersja221('u', 25)])] })) });
      expect(skrot(l), '(a)').toEqual([`A v utrata [${KL.czesciowa}]`, `A w utrata [${KL.czesciowa}]`]);
      expect(czerwoneWSwiatach(l)).toEqual([2, 2, 2, 0, 0, 0, 0]);
    }
    {
      const baza = dwieWizyty();
      const M = WYR.nowyModel();
      zap(M, 'D', 'S276', 'retencja', baza, stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-2' })])], kosz: [nagrobekRetencji] }), 1, op('pruneSnapshotsForPatient', 'P'));
      zap(M, 'A', 'N', 'usuń pacjenta', baza, stan({ nagrobki: ['P'] }), 2, op('removePatient', 'P'));
      zap(M, 'B', 'N', 'nowa wersja', baza, stan({ karty: [karta('P', [...baza.patients[0].snapshots, wersja('u', 25, { vid: 'wiz-3' })])] }), 3);
      const bezV = stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-2' }), wersja('u', 25, { vid: 'wiz-3' })])], kosz: [nagrobekRetencji] });
      expect(tylko(WYR.ocen(M, { D: widok(bezV) }), 'v'), '(b)').toEqual([`D v utrata [${KL.czesciowa}]`]);
    }
  });

  it('karta częściowa (starsza aplikacja) — negatyw: powrót karty zmianą bieżącego urządzenia i przycięcie na bieżącym urządzeniu — klasa samych bieżących urządzeń (tylko W1 i W1 floty)', () => {
    {
      const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
      const M = WYR.nowyModel();
      zap(M, 'A', 'N', 'usuń pacjenta', baza, stan({ nagrobki: ['P'] }), 1, op('removePatient', 'P'));
      zap(M, 'B', 'N', 'nowa wersja', baza, stan({ karty: [karta('P', [...baza.patients[0].snapshots, wersja('u', 25)])] }), 2);
      const l = WYR.ocen(M, { A: widok(stan({ karty: [karta('P', [wersja('u', 25)])] })) }, { stare: ['C'] });
      expect(skrot(l)).toEqual(['A v utrata [karta częściowa (nagrobek przegrał lokalnie, bez haka H1)]', 'A w utrata [karta częściowa (nagrobek przegrał lokalnie, bez haka H1)]']);
      expect(czerwoneWSwiatach(l), 'W4 i W4 floty — czerwień').toEqual([0, 2, 2, 0, 2, 0, 2]);
    }
    {
      const baza = dwieWizyty();
      const M = WYR.nowyModel();
      zap(M, 'E', 'N', 'retencja', baza, stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-2' })])], kosz: [nagrobekRetencji] }), 1, op('pruneSnapshotsForPatient', 'P'));
      zap(M, 'A', 'N', 'usuń pacjenta', baza, stan({ nagrobki: ['P'] }), 2, op('removePatient', 'P'));
      zap(M, 'B', 'N', 'nowa wersja', baza, stan({ karty: [karta('P', [...baza.patients[0].snapshots, wersja('u', 25, { vid: 'wiz-3' })])] }), 3);
      const bezV = stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-2' }), wersja('u', 25, { vid: 'wiz-3' })])], kosz: [nagrobekRetencji] });
      expect(tylko(WYR.ocen(M, { E: widok(bezV) }, { stare: ['C'] }), 'v')).toEqual(['E v utrata [karta częściowa (nagrobek przegrał lokalnie, bez haka H1)]']);
    }
  });

  it('karta częściowa (starsza aplikacja), wariant (b) — przycięcie związane z urządzeniem: retencja v1 na 276 (D), „Usuń pacjenta” na A, kartę zwraca bieżące B, które miało v (pełna karta z hakiem H1) — w widokach A i B klasa samych bieżących urządzeń (czerwień w W4 floty); kartę zwraca samo D — klasa floty także w widoku A', () => {
    const baza = dwieWizyty();
    const przyciete = stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-2' })])], kosz: [nagrobekRetencji] });
    const bezV = stan({ karty: [karta('P', [wersja('w', 21, { vid: 'wiz-2' }), wersja('u', 25, { vid: 'wiz-3' })])] });
    const historia = (zwraca) => {
      const M = WYR.nowyModel();
      zap(M, 'D', 'S276', 'retencja', baza, przyciete, 1, op('pruneSnapshotsForPatient', 'P'));
      zap(M, 'A', 'N', 'usuń pacjenta', baza, stan({ nagrobki: ['P'] }), 2, op('removePatient', 'P'));
      const przed = zwraca === 'D' ? przyciete : baza;
      zap(M, zwraca, zwraca === 'D' ? 'S276' : 'N', 'nowa wersja', przed, { ...przed, patients: [karta('P', [...przed.patients[0].snapshots, wersja('u', 25, { vid: 'wiz-3' })])] }, 3);
      return M;
    };
    const l = WYR.ocen(historia('B'), { A: widok(bezV), B: widok(bezV) }).filter((x) => x.id === 'v');
    expect(skrot(l), 'kartę zwraca B').toEqual(['A v utrata [karta częściowa (nagrobek przegrał lokalnie, bez haka H1)]', 'B v utrata [karta częściowa (nagrobek przegrał lokalnie, bez haka H1)]']);
    expect(czerwoneWSwiatach(l)).toEqual([0, 2, 2, 0, 2, 0, 2]);
    const zD = WYR.ocen(historia('D'), { A: widok(bezV) }).filter((x) => x.id === 'v');
    expect(skrot(zD), 'kartę zwraca D').toEqual([`A v utrata [${KL.czesciowa}]`]);
    expect(czerwoneWSwiatach(zD)).toEqual([1, 1, 1, 0, 0, 0, 0]);
  });

  it('R4a i R4a′ (starsza aplikacja): kosz na A bez wiedzy o gwiazdce albo poprawce zapisanej na 221 — 221 traci je po nagrobku, więc różnica zostaje także po pełnej wymianie (W4 floty)', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const kosz = stan({ karty: [karta('P', [wersja('w', 21)])], kosz: [wpisKosza('v', 'P', 20)] });
    {
      const M = WYR.nowyModel();
      zap(M, 'C', 'S221', 'poprawka', baza, stan({ karty: [karta('P', [wersja221('v', 23, { rev: 2 }), wersja('w', 21)])] }), 1, op('updateSnapshotPayload', 'P', 'v'));
      zap(M, 'A', 'N', 'usuń', baza, kosz, 2, op('moveSnapshotToTrash', 'P', 'v'));
      const l = WYR.ocen(M, { A: widok(kosz), C: widok(kosz) });
      expect(tylko(l, 'v'), 'R4a′').toEqual([`A v treść [${KL.r4aPrim}]`, `C v treść [${KL.r4aPrim}]`]);
      expect(czerwoneWSwiatach(l)).toEqual([2, 2, 2, 0, 0, 0, 0]);
    }
    {
      const M = WYR.nowyModel();
      zap(M, 'C', 'S221', 'gwiazdka', baza, stan({ karty: [karta('P', [wersja('v', 20, { pinned: true, rev: 2 }), wersja('w', 21)])] }), 1, op('setSnapshotPinned', 'P', 'v', true));
      zap(M, 'A', 'N', 'usuń', baza, kosz, 2, op('moveSnapshotToTrash', 'P', 'v'));
      expect(tylko(WYR.ocen(M, { A: widok(kosz), C: widok(kosz) }), 'v'), 'R4a').toEqual([`A v gwiazdka Kosza [${KL.r4a}]`, `C v gwiazdka Kosza [${KL.r4a}]`]);
    }
  });

  it('R4a i R4a′ (starsza aplikacja) — negatyw: gwiazdka albo poprawka na bieżącym urządzeniu — R4a i R4a′ samych bieżących urządzeń (W1 i W1 floty, czerwień w W4 floty)', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)])] });
    const kosz = stan({ karty: [karta('P', [wersja('w', 21)])], kosz: [wpisKosza('v', 'P', 20)] });
    {
      const M = WYR.nowyModel();
      zap(M, 'D', 'N', 'poprawka', baza, stan({ karty: [karta('P', [wersja('v', 23, { rev: 2 }), wersja('w', 21)])] }), 1, op('updateSnapshotPayload', 'P', 'v'));
      zap(M, 'A', 'N', 'usuń', baza, kosz, 2, op('moveSnapshotToTrash', 'P', 'v'));
      const l = WYR.ocen(M, { A: widok(kosz) }, { stare: ['C'] });
      expect(tylko(l, 'v')).toEqual(['A v treść [R4a′]']);
      expect(czerwoneWSwiatach(l)).toEqual([0, 1, 0, 0, 1, 0, 1]);
    }
    {
      const M = WYR.nowyModel();
      zap(M, 'D', 'N', 'gwiazdka', baza, stan({ karty: [karta('P', [wersja('v', 20, { pinned: true, rev: 2 }), wersja('w', 21)])] }), 1, op('setSnapshotPinned', 'P', 'v', true));
      zap(M, 'A', 'N', 'usuń', baza, kosz, 2, op('moveSnapshotToTrash', 'P', 'v'));
      expect(tylko(WYR.ocen(M, { A: widok(kosz) }, { stare: ['C'] }), 'v')).toEqual(['A v gwiazdka Kosza [R4a]']);
    }
  });

  it('tabela klas floty: opis z „do decyzji właściciela (znane ograniczenie starszej wersji)”, cechy starszej aplikacji, tylko światy floty; klasa samych bieżących urządzeń w świecie floty — jak w odpowiedniku bez floty; zapis historii zna app urządzenia', () => {
    const floty = Object.entries(WYR.WYJATKI).filter(([, w]) => w.cechy);
    expect(floty.map(([nazwa]) => nazwa).sort()).toEqual(Object.values(KL).sort());
    const cechy = new Set(Object.values(WYR.CECHY_STARSZYCH).flat());
    for (const [nazwa, w] of floty) {
      expect(w.opis.includes(WYR.DO_DECYZJI), `opis: ${nazwa}`).toBe(true);
      expect(w.swiaty, `światy: ${nazwa}`).toEqual(W_FLOCIE);
      expect(w.cechy.length > 0 && w.cechy.every((c) => cechy.has(c)) && Object.isFrozen(w.cechy), `cechy: ${nazwa}`).toBe(true);
      expect(['W1', 'W4', 'bloby'].map((s) => WYR.dozwolonaW(nazwa, s)), `bez floty: ${nazwa}`).toEqual([false, false, false]);
    }
    expect(WYR.DO_DECYZJI).toBe('do decyzji właściciela (znane ograniczenie starszej wersji)');
    expect(WYR.SWIATY).toEqual(['W1', 'W4', 'bloby', ...W_FLOCIE]);
    expect(Object.keys(WYR.CECHY_STARSZYCH)).toEqual(['S221', 'S276']);
    expect(W_FLOCIE.map((s) => WYR.dozwolonaW('E1 (obecność)', s)), 'E1: W1, W4, bloby').toEqual([true, true, true, true]);
    expect(W_FLOCIE.map((s) => WYR.dozwolonaW('E4b (stara karta po „Scal pacjentów”)', s)), 'E4b: tylko W1').toEqual([true, false, true, false]);
    expect(W_FLOCIE.map((s) => WYR.dozwolonaW('kosz-po-2 (stara karta z ostatnią wersją przy samych blobach)', s)), 'kosz-po-2: tylko bloby').toEqual([false, false, false, false]);
    expect(W_FLOCIE.map((s) => WYR.dozwolonaW('D-4 A (Kosz w zwróconej starej karcie)', s)), 'Kosz w zwróconej starej karcie: W1, W4, bloby').toEqual([true, true, true, true]);
    expect(WYR.dozwolonaW('klasa spoza tabeli', 'W1')).toBe(false);
    const M = WYR.nowyModel();
    const baza = stan({ karty: [karta('P', [wersja('v', 20)])] });
    zap(M, 'C', 'S221', 'poprawka', baza, stan({ karty: [karta('P', [wersja221('v', 21, { rev: 2 })])] }), 1, op('updateSnapshotPayload', 'P', 'v'));
    WYR.zapisz(M, { dev: 'A', opis: 'poprawka', przed: baza, po: stan({ karty: [karta('P', [wersja('v', 22, { rev: 3 })])] }), t: T(2), operacje: [op('updateSnapshotPayload', 'P', 'v')] });
    expect(Object.fromEntries(M.app), 'app domyślnie N').toEqual({ C: 'S221', A: 'N' });
  });
});
