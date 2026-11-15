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
    expect(Object.keys(WYR.WYJATKI).length, 'liczba klas').toBe(15);
    for (const [k, w] of Object.entries(WYR.WYJATKI)) {
      expect(typeof w.opis === 'string' && w.opis.length > 20 && typeof w.zrodlo === 'string' && w.zrodlo.length > 10, `opis i źródło: ${k}`).toBe(true);
      expect(typeof w.mechanizm === 'string' && w.mechanizm.length > 20, `mechanizm: ${k}`).toBe(true);
      expect(w.swiaty.length > 0 && w.swiaty.every((s) => ['W1', 'W4', 'bloby'].includes(s)), `światy: ${k}`).toBe(true);
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
