// Wyrocznia „nie zginęła ostatnia zmiana” (E3-PR0a, tests/support/ostatnia-zmiana.mjs) — testy samej wyroczni na
// małych syntetycznych historiach (bez sejfu): eksporty przed i po każdej mutacji jak z exportSyncPayload, widoki jak
// z exportSyncPayload i listTrashedSnapshots. Sprawdzają, że wyrocznia wykrywa utratę treści, że „Przywróć” jest zapisem
// treści z chwilą przywrócenia (rozpoznany po operacji, nie po różnicy eksportu), że głowa „Scal pacjentów” nie jest
// zapisem lekarza, że retencja nie usuwa ostatniego stanu wizyty (P-TRWALE-WIZYTY) i jak działa klasyfikacja wyjątków.
// Dane wyłącznie fikcyjne („Testowy Jan…”).
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
const wpisKosza = (sid, pid, kg, o = {}) => ({ snapshotId: sid, patientId: pid, payload: pl(kg, { pid, ...o }), ...(o.powod ? { powod: o.powod } : {}) });
const notatka = (id, pid, body, o = {}) => ({ id, patientId: pid, title: 'Fikcyjna', body, category: 'inne', updatedAtISO: o.at || '2026-03-02T08:00:00.000Z', rev: o.rev || 1 });
// Widok urządzenia: okno Kosza z wpisów eksportu (z treścią), patientExists — karta wpisu jest w eksporcie.
const widok = (st) => WYR.widokZ(st, (st.snapshotTombstones || []).filter((e) => e.payload).map((e) => ({ ...e, pinned: false, patientExists: (st.patients || []).some((p) => p.patientId === e.patientId) })));
const op = (nazwa, ...args) => ({ nazwa, args });
const skrot = (lista) => lista.map((x) => `${x.urz} ${x.id} ${x.rodzaj} [${x.klasa}]`).sort();

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

  it('klasyfikacja wyjątków: utrata wersji nieznanej scalającemu (E1/E1b), notatka przepięta przy równoległym „Usuń pacjenta” (D21-9), Kosz pod kartą usuniętą po scaleniu (P5)', () => {
    const baza = stan({ karty: [karta('P', [wersja('v', 20), wersja('w', 21)]), karta('Q', [wersja('q', 30, { pid: 'Q', imie: 'Jan2' })])], notatki: [notatka('n', 'P', 'Fikcyjna treść')] });
    const glowa = wersja('h', 30, { pid: 'Q', imie: 'Jan2' });
    const scalone = stan({ karty: [karta('Q', [wersja('v', 20, { pid: 'Q', vid: 'wiz-P' }), wersja('w', 21, { pid: 'Q', vid: 'wiz-P' }), wersja('q', 30, { pid: 'Q', imie: 'Jan2' }), glowa])], nagrobki: ['P'], notatki: [notatka('n', 'Q', 'Fikcyjna treść', { rev: 2 })] });
    // E1/E1b: B dopisuje wizytę n1 w P bez połączenia; A bez wiedzy „Scal pacjentów” P → Q — n1 nie ma nigdzie
    {
      const M = WYR.nowyModel();
      const poB = { ...baza, patients: [karta('P', [wersja('v', 20), wersja('w', 21), wersja('n1', 25)]), baza.patients[1]] };
      WYR.zapisz(M, { dev: 'B', opis: 'nowa wersja', przed: baza, po: poB, t: T(1) });
      WYR.zapisz(M, { dev: 'A', opis: 'Scal pacjentów', przed: baza, po: scalone, t: T(2), operacje: [op('mergePatients', 'P', 'Q')] });
      const l = WYR.ocen(M, { A: widok(scalone), B: widok(scalone) });
      expect(skrot(l)).toEqual(['A n1 utrata [E1/E1b (utrata wersji nieznanej scalającemu)]', 'B n1 utrata [E1/E1b (utrata wersji nieznanej scalającemu)]']);
      expect(WYR.bezWyjatku(l, 'bloby'), 'klasa dozwolona także przy samych blobach').toEqual([]);
    }
    // D21-9: A „Scal pacjentów” P → Q (notatka n idzie do Q), B bez wiedzy „Usuń pacjenta” P (nagrobek notatki n)
    {
      const M = WYR.nowyModel();
      WYR.zapisz(M, { dev: 'A', opis: 'Scal pacjentów', przed: baza, po: scalone, t: T(1), operacje: [op('mergePatients', 'P', 'Q')] });
      const usuniety = stan({ karty: [baza.patients[1]], nagrobki: ['P'], nagrNotatek: [{ id: 'n' }] });
      WYR.zapisz(M, { dev: 'B', opis: 'usuń pacjenta', przed: baza, po: usuniety, t: T(2), operacje: [op('removePatient', 'P')] });
      const poWymianie = { ...scalone, patientNotes: [], patientNoteTombstones: [{ id: 'n' }] };
      expect(skrot(WYR.ocen(M, { A: widok(poWymianie) }).filter((x) => x.id === 'n'))).toEqual(['A n utrata [D21-9 (notatka przepięta przy równoległym „Usuń pacjenta”)]']);
    }
    // P5: B daje v do Kosza pod P; A bez wiedzy „Scal pacjentów” P → Q — wpis Kosza pod usuniętą P, okno Kosza go nie pokazuje
    {
      const M = WYR.nowyModel();
      const koszB = { ...baza, patients: [karta('P', [wersja('w', 21)]), baza.patients[1]], snapshotTombstones: [wpisKosza('v', 'P', 20)] };
      WYR.zapisz(M, { dev: 'B', opis: 'kosz', przed: baza, po: koszB, t: T(1), operacje: [op('moveSnapshotToTrash', 'P', 'v')] });
      WYR.zapisz(M, { dev: 'A', opis: 'Scal pacjentów', przed: baza, po: scalone, t: T(2), operacje: [op('mergePatients', 'P', 'Q')] });
      const poWymianie = { ...scalone, patients: [karta('Q', scalone.patients[0].snapshots.filter((x) => x.snapshotId !== 'v'))], snapshotTombstones: [wpisKosza('v', 'P', 20)] };
      expect(skrot(WYR.ocen(M, { A: widok(poWymianie) }).filter((x) => x.id === 'v'))).toEqual(['A v utrata [P5 (Kosz pod kartą usuniętą po scaleniu)]']);
    }
  });

  it('tabela wyjątków: każda klasa z opisem, źródłem i światami; E1/E1b — do naprawy w E3-PR0 (9a), E4b — w E3-PR0e (4a) i nie po W4; klasa null zawsze czerwieni', () => {
    for (const [k, w] of Object.entries(WYR.WYJATKI)) {
      expect(typeof w.opis === 'string' && w.opis.length > 20 && typeof w.zrodlo === 'string' && w.zrodlo.length > 10, `opis i źródło: ${k}`).toBe(true);
      expect(w.swiaty.length > 0 && w.swiaty.every((s) => ['W1', 'W4', 'bloby'].includes(s)), `światy: ${k}`).toBe(true);
      expect(Object.isFrozen(w), `zamrożona: ${k}`).toBe(true);
    }
    expect(Object.isFrozen(WYR.WYJATKI)).toBe(true);
    expect(WYR.WYJATKI['E1/E1b (utrata wersji nieznanej scalającemu)'].naprawa).toBe('do naprawy w E3-PR0 (decyzja 9a z 2026-11-15)');
    expect(WYR.WYJATKI['E4b (stara karta po „Scal pacjentów”)'].naprawa).toBe('do naprawy w E3-PR0e (4a)');
    const e4b = [{ klasa: 'E4b (stara karta po „Scal pacjentów”)' }];
    expect([WYR.bezWyjatku(e4b, 'W1').length, WYR.bezWyjatku(e4b, 'W4').length], 'E4b: W1 dozwolone, W4 czerwone').toEqual([0, 1]);
    for (const s of ['W1', 'W4', 'bloby']) expect(WYR.bezWyjatku([{ klasa: null }], s).length, `null w ${s}`).toBe(1);
  });
});
