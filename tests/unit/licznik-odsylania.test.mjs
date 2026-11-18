// Licznik odsyłania (E3-PR0b, tests/support/licznik-odsylania.mjs): przypadki na syntetycznych trójkach (przed, po,
// ładunek) — warstwy echa, reguły pola (T domyślna, A i B diagnostyczne), klasy, przydział, usunięcia, żądania jak
// Bob_wez, strony, bajty realne, budżet minuty slotu, echo na klonach na kluczach E, strażnik pól zawsze obecnych
// i odcisk zgodny z sejfem. Dane wyłącznie fikcyjne („Ala”, masy umowne).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as LO from '../support/licznik-odsylania.mjs';
import { repo, wytnijFunkcje } from './sesja-zapisu-uprzaz.mjs';

const T0 = '2026-03-02T08:00:00.000Z', T1 = '2026-03-02T09:00:00.000Z', T2 = '2026-03-02T10:00:00.000Z';
const tresc = (sid, o = {}) => ({ user: { weight: 20 }, visit: { version: 1, visitId: 'w-' + sid }, ...o });
const wersja = (sid, o = {}) => ({ snapshotId: sid, savedAtISO: T0, rev: 1, updatedAtISO: T0, ...o, payload: tresc(sid, o.payload || {}) });
const karta = (pid, wersje, o = {}) => ({ patientId: pid, header: { firstName: 'Ala' }, createdAtISO: T0, lastSavedAtISO: T0, snapshots: wersje, ...o });
const lad = (o = {}) => ({ patients: [], snapshotTombstones: [], tombstones: [], ...o });
const wpis = (pid, sid, o = {}) => ({ patientId: pid, snapshotId: sid, deletedAtISO: T1, savedAtISO: T0, rev: 1, updatedAtISO: T0, visitIdentity: { version: 1, visitId: 'w-' + sid }, payload: tresc(sid), ...o });
const bezVisit = (w) => { const { visit: _v, ...p } = w.payload; return { ...w, payload: p }; };
const echo = (przed, po, P, o = {}) => LO.echoScalenia(przed, po, P, o);
const warstwy = (l) => Object.fromEntries(['surowe', 'po2a', 'wykA', 'wykB', 'wykT'].map((w) => [w, LO.wierszeEcha(w === 'surowe' ? l : l.filter((r) => r[w])).length]));
const MIN = 60000;

describe('licznik odsyłania: warstwy echa, reguły pola, klasy i przydział', () => {
  it('stan tutejszy wygrał bez zapisu → brak echa; scalanie zapisało to, co przyszło → brak echa', () => {
    const s = lad({ patients: [karta('P', [wersja('v', { rev: 3, payload: { user: { weight: 30 } } })])] });
    const P = lad({ patients: [karta('P', [wersja('v')])] });
    expect(echo(s, s, P)).toEqual([]);
    expect(echo(lad({ patients: [karta('P', [wersja('v')])] }), P, P)).toEqual([]);
  });
  it('rekord inny niż w ładunku i niż przed (treść) → 1 wiersz w każdej warstwie; snap w ładunku → E3-PR0c', () => {
    const przed = lad({ patients: [karta('P', [wersja('v', { payload: { user: { weight: 30 } } })])] });
    const P = lad({ patients: [karta('P', [wersja('v', { rev: 2, updatedAtISO: T1, payload: { user: { weight: 40 } } })])] });
    const po = lad({ patients: [karta('P', [wersja('v', { rev: 3, updatedAtISO: T1, payload: { user: { weight: 41 } } })])] });
    const l = echo(przed, po, P);
    expect(warstwy(l)).toEqual({ surowe: 1, po2a: 1, wykA: 1, wykB: 1, wykT: 1 });
    expect(l.map((r) => [r.rodzaj, r.wLadunku, r.przydzial, r.klasa])).toEqual([['snap', true, 'E3-PR0c', 'inne']]);
  });
  it('różni się sam rev → surowe 1, po2a 0 (R2)', () => {
    const P = lad({ patients: [karta('P', [wersja('v', { rev: 2 })])] });
    const po = lad({ patients: [karta('P', [wersja('v', { rev: 3 })])] });
    expect(warstwy(echo(lad({ patients: [karta('P', [wersja('v')])] }), po, P))).toEqual({ surowe: 1, po2a: 0, wykA: 0, wykB: 0, wykT: 0 });
  });
  // E3-PR0b2b (P-NOTATKA-POZNIEJSZA): scalenie zostawia tutejszą treść notatki i zapisuje sam rev = najwyższy z obu wersji.
  it('notatka pacjenta różna tylko rev (zapis samego rev przy wygranej tutejszej treści) → surowe 1, po2a 0, klasa „sam rev notatki”', () => {
    const notatka = (o = {}) => ({ id: 'n', patientId: 'P', category: 'observation', rev: 2, createdAtISO: T0, updatedAtISO: T1, bodyCipher: { iv: 'iv-1', data: 'tutejsza' }, ...o });
    const przed = lad({ patientNotes: [notatka()] });
    const P = lad({ patientNotes: [notatka({ rev: 3, updatedAtISO: T0, bodyCipher: { iv: 'iv-2', data: 'z ładunku' } })] });
    const po = lad({ patientNotes: [notatka({ rev: 3 })] });
    const l = echo(przed, po, P);
    expect(warstwy(l)).toEqual({ surowe: 1, po2a: 0, wykA: 0, wykB: 0, wykT: 0 });
    expect(l.map((r) => [r.rodzaj, r.klasa])).toEqual([['pnote', 'sam rev notatki']]);
    const tresc = echo(przed, lad({ patientNotes: [notatka({ rev: 3, bodyCipher: { iv: 'iv-3', data: 'złączenie' } })] }), P);
    expect([warstwy(tresc).po2a, tresc.map((r) => r.klasa)], 'inna treść niż przed i niż w ładunku — echo').toEqual([1, ['inne']]);
  });
  it('wpis Kosza różny tylko opisem D7 (rev, koszISO, revPary) i postacią gwiazdki w treści → po2a 0', () => {
    const k = karta('P', [wersja('w')]);
    const P = lad({ patients: [k], snapshotTombstones: [wpis('P', 'v')] });
    const po = lad({ patients: [k], snapshotTombstones: [wpis('P', 'v', { rev: 4, koszISO: T2, revPary: [1, 2], payload: tresc('v', { _pinned: true, _pinnedState: { pin: true, at: T1 } }) })] });
    expect(warstwy(echo(lad({ patients: [k] }), po, P))).toEqual({ surowe: 1, po2a: 0, wykA: 0, wykB: 0, wykT: 0 });
  });
  it('tożsamość wizyty nieobecna w encji ładunku → tłumią wszystkie reguły; obecna z inną wartością albo bez części pola → reguły B i T nie (wersja i wpis Kosza)', () => {
    const P = lad({ patients: [karta('P', [bezVisit(wersja('v'))])] });
    const po = lad({ patients: [karta('P', [wersja('v')])] });
    const l = echo(lad(), po, P).filter((r) => r.kind === 'snap');
    expect(l.map((r) => [r.po2a, r.wykA, r.wykB, r.wykT, r.klasa])).toEqual([[true, false, false, false, 'tożsamość wizyty']]);
    const P2 = lad({ patients: [karta('P', [wersja('v', { payload: { visit: { version: 1, visitId: 'inna' } } })])] });
    expect(echo(lad(), po, P2).filter((r) => r.kind === 'snap').map((r) => [r.wykA, r.wykB, r.wykT])).toEqual([[true, true, true]]);
    const k = karta('P', [wersja('w')]);
    const poK = lad({ patients: [k], snapshotTombstones: [wpis('P', 'v')] });
    const PK = lad({ patients: [k], snapshotTombstones: [wpis('P', 'v', { visitIdentity: { version: 1, visitId: 'inna' } })] });
    expect(echo(lad({ patients: [k] }), poK, PK).filter((r) => r.kind === 'stomb').map((r) => [r.klasa, r.wykB, r.wykT])).toEqual([['tożsamość wizyty', true, true]]);
    // brak części pola (visit bez patientId w ładunku, z patientId po „Scal pacjentów”) to inna wartość pola — bez tłumienia
    const P3 = lad({ patients: [karta('P', [wersja('v')])] });
    const po3 = lad({ patients: [karta('P', [wersja('v', { payload: { visit: { version: 1, visitId: 'w-v', patientId: 'P' } } })])] });
    expect(echo(lad(), po3, P3).filter((r) => r.kind === 'snap').map((r) => [r.wykA, r.wykB, r.wykT, r.klasa])).toEqual([[false, true, true, 'tożsamość wizyty']]);
    const { visitIdentity: _vi, ...bezTozsamosci } = wpis('P', 'v');
    const PK2 = lad({ patients: [k], snapshotTombstones: [bezTozsamosci] });
    expect(echo(lad({ patients: [k] }), poK, PK2).filter((r) => r.kind === 'stomb').map((r) => [r.wykB, r.wykT])).toEqual([[false, false]]);
  });
  it('odcisk przeliczony z samej tożsamości wizyty → wyk 0 (reguła T, nie B); odcisk nieświeży albo z innej treści → 1', () => {
    const z276 = (o = {}) => { const w = bezVisit(wersja('v', o)); w.payload = { ...w.payload, _pinned: true, _pinnedState: { pin: true, at: T0, h: LO.odcisk(w.payload) } }; return w; };
    const zN = (w) => { const p = { ...w.payload, visit: { version: 1, visitId: 'w-v' } }; return { ...w, payload: { ...p, _pinnedState: { ...p._pinnedState, h: LO.odcisk(p) } } }; };
    const P = lad({ patients: [karta('P', [z276()])] });
    const po = lad({ patients: [karta('P', [zN(z276())])] });
    const l = echo(lad(), po, P).filter((r) => r.kind === 'snap');
    expect(l.map((r) => [r.po2a, r.wykA, r.wykB, r.wykT, r.tlumiT, r.klasa])).toEqual([[true, true, true, false, true, 'tożsamość wizyty']]);
    // h po scaleniu nie jest odciskiem treści po (nieświeży) → bez tłumienia
    const nieswiezy = zN(z276()); nieswiezy.payload._pinnedState.h = 'nieswiezy.1';
    expect(echo(lad(), lad({ patients: [karta('P', [nieswiezy])] }), P).filter((r) => r.kind === 'snap').map((r) => r.wykT)).toEqual([true]);
    // h ładunku z innej treści (masa) → odcisk bez tożsamości wizyty go nie odtwarza
    const PInny = lad({ patients: [karta('P', [{ ...z276(), payload: { ...z276().payload, _pinnedState: { pin: true, at: T0, h: LO.odcisk({ user: { weight: 99 } }) } } }])] });
    expect(echo(lad(), po, PInny).filter((r) => r.kind === 'snap').map((r) => r.wykT)).toEqual([true]);
    // ładunek z tożsamością wizyty, a h różny (między bieżącymi) — punkt (ii) nie ma czego wyjaśnić
    const PzN = lad({ patients: [karta('P', [{ ...zN(z276()), payload: { ...zN(z276()).payload, _pinnedState: { pin: true, at: T0, h: 'inny.1' } } }])] });
    expect(echo(lad(), po, PzN).filter((r) => r.kind === 'snap').map((r) => r.wykT)).toEqual([true]);
  });
  it('gwiazdka wpisu Kosza nieobecna w ładunku (R4a) → tłumi tylko diagnostyczna reguła A; gwiazdka inna niż w ładunku → żadna', () => {
    const k = karta('P', [wersja('w')]);
    const P = lad({ patients: [k], snapshotTombstones: [wpis('P', 'v')] });
    const po = lad({ patients: [k], snapshotTombstones: [wpis('P', 'v', { gwiazdka: { pin: true, at: T1 } })] });
    expect(echo(lad({ patients: [k] }), po, P).filter((r) => r.kind === 'stomb').map((r) => [r.klasa, r.wykA, r.wykB, r.wykT, r.przydzial])).toEqual([['R4a', false, true, true, 'E3-PR0d']]);
    const P2 = lad({ patients: [k], snapshotTombstones: [wpis('P', 'v', { gwiazdka: { pin: false, at: T0 } })] });
    expect(echo(lad({ patients: [k] }), po, P2).filter((r) => r.kind === 'stomb').map((r) => [r.klasa, r.wykA, r.wykB, r.wykT])).toEqual([['R4a', true, true, true]]);
  });
  it('wpis Kosza innej karty dopisany przez scalanie (brak elementu w ładunku) → żadna reguła nie tłumi; R4a′ — treść wpisu', () => {
    const k = karta('P', [wersja('w')]), q = karta('Q', [wersja('x')]);
    const P = lad({ patients: [k, q], snapshotTombstones: [wpis('P', 'v')] });
    const po = lad({ patients: [k, q], snapshotTombstones: [wpis('P', 'v'), wpis('Q', 'v')] });
    expect(echo(lad({ patients: [k, q] }), po, P).filter((r) => r.kind === 'stomb').map((r) => [r.klasa, r.wykA, r.wykB, r.wykT])).toEqual([['inne', true, true, true]]);
    const po2 = lad({ patients: [k], snapshotTombstones: [wpis('P', 'v', { gwiazdka: { pin: true, at: T1 }, payload: tresc('v', { user: { weight: 33 } }) })] });
    expect(echo(lad({ patients: [k] }), po2, lad({ patients: [k], snapshotTombstones: [wpis('P', 'v')] })).filter((r) => r.kind === 'stomb').map((r) => r.klasa)).toEqual(['R4a′']);
  });
  it('wpis Kosza spoza ładunku (zdarzenie snap, nowsza treść w Koszu) → E3-PR0d; karta bez własnego snap w echu → nagłówek karty bez przydziału', () => {
    const przed = lad({ patients: [karta('P', [wersja('w')])], snapshotTombstones: [wpis('P', 'v')] });
    const P = lad({ patients: [karta('P', [wersja('w', { updatedAtISO: T1, payload: { user: { weight: 25 } } })])] });
    const po = lad({ patients: P.patients, snapshotTombstones: [wpis('P', 'v', { payload: tresc('v', { user: { weight: 26 } }) })] });
    expect(echo(przed, po, P).map((r) => [r.rodzaj, r.wLadunku, r.przydzial])).toEqual([['stomb', false, 'E3-PR0d']]);
    const Pk = lad({ patients: [karta('P', [wersja('v')])] });
    const poK = lad({ patients: [karta('P', [wersja('v')], { header: { firstName: 'Ola' } })] });
    expect(LO.wierszeEcha(echo(lad({ patients: [karta('P', [wersja('v')])] }), poK, Pk)).map((r) => [r.rodzaj, r.klasa, r.przydzial])).toEqual([['karta', 'nagłówek karty', 'bez przydziału']]);
    const poK2 = lad({ patients: [karta('P', [wersja('v', { updatedAtISO: T1, payload: { user: { weight: 22 } } })], { header: { firstName: 'Ola' } })] });
    expect(LO.wierszeEcha(echo(lad({ patients: [karta('P', [wersja('v')])] }), poK2, Pk)).map((r) => r.rodzaj)).toEqual(['snap']);
  });
  it('między bieżącymi urządzeniami (ładunek z polami zawsze obecnymi) warstwa wykonalna reguły T równa się po2a', () => {
    const k = karta('P', [wersja('w')]);
    const przypadki = [
      [lad(), lad({ patients: [karta('P', [wersja('v', { payload: { user: { weight: 31 } } })])] }), lad({ patients: [karta('P', [wersja('v')])] })],
      [lad({ patients: [k] }), lad({ patients: [k], snapshotTombstones: [wpis('P', 'v', { gwiazdka: { pin: true, at: T1 } })] }), lad({ patients: [k], snapshotTombstones: [wpis('P', 'v')] })],
      [lad({ patients: [k] }), lad({ patients: [k], snapshotTombstones: [wpis('P', 'v', { payload: tresc('v', { _pinnedState: { pin: true, at: T1, h: 'a.1' } }) })] }), lad({ patients: [k], snapshotTombstones: [wpis('P', 'v')] })],
      [lad(), lad({ patients: [karta('P', [wersja('v', { payload: { _pinned: true, _pinnedState: { pin: true, at: T1, h: 'b.1' } } })])] }), lad({ patients: [karta('P', [wersja('v', { payload: { _pinned: true, _pinnedState: { pin: true, at: T0, h: 'c.1' } } })])] })],
    ];
    for (const [przed, po, P] of przypadki) {
      const l = echo(przed, po, P);
      expect(l.length).toBeGreaterThan(0);
      expect(l.map((r) => r.wykT)).toEqual(l.map((r) => r.po2a));
    }
  });
  it('usunięcia przez scalanie — ślad (Kosz, pod inną kartą) albo bez śladu (karta opróżniona, wpis Kosza bez wersji)', () => {
    const przed = lad({ patients: [karta('P', [wersja('v')]), karta('G', [wersja('g')])], snapshotTombstones: [wpis('P', 'x')] });
    const po = lad({ patients: [karta('P', [wersja('g')])], snapshotTombstones: [wpis('P', 'v')] });
    expect(LO.usunieciaScalenia(przed, po, lad()).map((x) => [x.k, x.slad, x.podtyp]).sort()).toEqual([
      ['karta:G', null, 'karta opróżniona (wersje pod inną kartą)'],
      ['snap:G/g', 'pod inną kartą', null],
      ['snap:P/v', 'Kosz', null],
      ['stomb:x', null, 'wpis Kosza bez wersji (wygaśnięcie albo przycięcie)'],
    ]);
  });
  it('pokrycie dziś — hak (klucz encji, pfull karty) i przegląd (nowa chwila); nowe i noweOst w liczniku zależnie od źródła', () => {
    const r = { k: 'snap:P/v', kind: 'snap', pid: 'P', chwila: T2, chwilaP: T1, chwilaPrzed: T0 };
    expect(LO.pokrycie(r, new Set())).toEqual({ hak: false, przeglad: true });
    expect(LO.pokrycie(r, new Set(['pfull:P']))).toEqual({ hak: true, przeglad: true });
    expect(LO.pokrycie({ ...r, chwila: T1 }, new Set())).toEqual({ hak: false, przeglad: false });
    const L = LO.nowyLicznikOdsylania();
    const w = { ...r, rodzaj: 'snap', wLadunku: true, po2a: true, wykA: true, wykB: true, wykT: true, klasa: 'inne', przydzial: 'E3-PR0c', key: 'P/v', sc: ['payload.user.weight'] };
    const a = L.zapiszScalenie('zdarzenie', [w], new Set(), { natychmiast: true });
    const b = L.zapiszScalenie('blob221', [w], new Set(), { natychmiast: false });
    expect([a.nowe.length, a.noweOst.length, b.nowe.length, b.noweOst.length]).toEqual([0, 0, 1, 0]);
    expect(L.podsumuj().literal).toEqual({ 'zdarzenie|snap|w ładunku|inne': 1, 'blob221|snap|w ładunku|inne': 1 });
  });
  it('powtórka tego samego ładunku na stanie po scaleniu → 0 wierszy surowych', () => {
    const przed = lad({ patients: [karta('P', [wersja('v', { payload: { user: { weight: 30 } } })])] });
    const P = lad({ patients: [karta('P', [wersja('v', { rev: 2, updatedAtISO: T1, payload: { user: { weight: 40 } } })])] });
    const po = lad({ patients: [karta('P', [wersja('v', { rev: 3, updatedAtISO: T1, payload: { user: { weight: 41 } } })])] });
    expect(echo(przed, po, P).length).toBe(1);
    expect(echo(po, po, P).length).toBe(0);
  });
  it('licznik: źródło spoza listy, reguła spoza listy i strona bez chwili → wyjątek; reguła diagnostyczna zmienia warstwę wyk', () => {
    const L = LO.nowyLicznikOdsylania();
    expect(() => L.zapiszScalenie('nieznane', [], new Set())).toThrow(/nieznane źródło/);
    expect(() => LO.nowyLicznikOdsylania({ regula: 'X' })).toThrow(/nieznana reguła/);
    expect(() => L.zapiszStrone('zdarzenie', [], [], { dev: 'A' })).toThrow(/bez chwili/);
    const k = karta('P', [wersja('w')]);
    const l = echo(lad({ patients: [k] }), lad({ patients: [k], snapshotTombstones: [wpis('P', 'v', { gwiazdka: { pin: true, at: T1 } })] }), lad({ patients: [k], snapshotTombstones: [wpis('P', 'v')] }));
    const zA = LO.nowyLicznikOdsylania({ regula: 'A' }), zT = LO.nowyLicznikOdsylania();
    expect([zA.zapiszScalenie('zdarzenie', l).wyk.length, zT.zapiszScalenie('zdarzenie', l).wyk.length]).toEqual([0, 1]);
    expect(zT.podsumuj().wiersze).toMatchObject({ 'zdarzenie:wykA': 0, 'zdarzenie:wykB': 1, 'zdarzenie:wykT': 1, 'zdarzenie:wyk': 1 });
  });
});

describe('licznik odsyłania: echo na klonach, pola zawsze obecne i odcisk', () => {
  it('pełna kopia ze starszej aplikacji z encjami spoza E → drugi rząd na kluczach E 0 (bez zawężenia 1)', () => {
    const k = karta('P', [wersja('v')]);
    // echo pierwszego rzędu (E): wersja v; koperta snap niesie kartę P i wersję v
    const E = LO.kluczeKopert([{ event: { kind: 'snap', key: 'P/v' }, patients: [k] }]);
    expect([...E].sort()).toEqual(['karta:P', 'snap:P/v']);
    expect(LO.kluczeKopert([{ event: { kind: 'pfull', key: 'P' }, patients: [k] }]).has('pfull:P')).toBe(true);
    // pełna kopia C′: v bez tożsamości wizyty (starsza aplikacja jej nie zna) i wpis Kosza x spoza E z nowszą treścią,
    // bez gwiazdki; klon zapisuje treść x z kopii i zostawia swoją gwiazdkę
    const blob = lad({ patients: [karta('P', [bezVisit(wersja('v'))])], snapshotTombstones: [wpis('P', 'x', { payload: tresc('x', { user: { weight: 22 } }) })] });
    const przed = lad({ patients: [k], snapshotTombstones: [wpis('P', 'x', { gwiazdka: { pin: true, at: T1 } })] });
    const po = lad({ patients: [k], snapshotTombstones: [wpis('P', 'x', { gwiazdka: { pin: true, at: T1 }, payload: tresc('x', { user: { weight: 22 } }) })] });
    const pelne = LO.wierszeEcha(echo(przed, po, blob).filter((r) => r.wykT));
    expect(pelne.map((r) => [r.k, r.klasa])).toEqual([['stomb:x', 'R4a']]);
    expect(LO.wierszeEcha(echo(przed, po, blob, { klucze: E }).filter((r) => r.wykT))).toEqual([]);
  });
  it('strażnik pól zawsze obecnych: wersja i wpis Kosza bez tożsamości wizyty przy obecnym rodzicu → liczone; wpis bez treści → nie; kandydat visitCipher osobno', () => {
    const L = LO.nowyLicznikOdsylania();
    const { visitIdentity: _v, ...bezTozsamosci } = wpis('P', 'y');
    const { payload: _p, visitIdentity: _v2, ...bezTresci } = wpis('P', 'r', { powod: 'retencja' });
    L.sprawdzPolaZawsze(lad({ patients: [karta('P', [wersja('v'), bezVisit(wersja('u'))])], snapshotTombstones: [wpis('P', 'x'), bezTozsamosci, { ...bezTresci, visitIdentity: { version: 1, visitId: 'w-r' } }] }), 'syntetyczny');
    const pz = L.podsumuj().polaZawsze;
    expect([pz.encji, pz.bezPola]).toEqual([5, 2]);
    expect(pz.przyklady.map((x) => x.replace(/^syntetyczny /, ''))).toEqual(['snap P/u bez payload.visit', 'stomb y bez visitIdentity']);
    expect(pz.kandydaci).toEqual({ 'stomb:visitCipher': { encji: 3, bezPola: 3 } });
  });
  it('odcisk modułu równy Bgw_odcisk sejfu (kod wycięty z vilda_vault.js)', () => {
    const src = readFileSync(path.join(repo, 'vilda_vault.js'), 'utf8');
    const sejf = new Function(`${wytnijFunkcje(src, 'Bgw_kanon')}\n${wytnijFunkcje(src, 'Bgw_odcisk')}\nreturn Bgw_odcisk;`)();
    const probki = [
      tresc('v'), bezVisit(wersja('v')).payload, { b: [3, { z: 'ż', a: null }], a: 'Ala', _pinned: true, _pinnedState: { pin: true, at: T0, h: 'x.1' }, _contentAtISO: T1 },
      { user: { weight: 20.5, height: 120, dobISO: '2016-03-12' }, visit: { version: 1, visitId: 'ąę' }, lista: [] },
    ];
    for (const t of probki) expect(LO.odcisk(t)).toBe(sejf(t));
    expect(LO.odcisk({ a: 1, b: 2 })).toBe(LO.odcisk({ b: 2, a: 1 }));
    expect(LO.odcisk(tresc('v'))).not.toBe(LO.odcisk(bezVisit(wersja('v')).payload));
  });
});

describe('licznik odsyłania: żądania, strony, bajty realne i budżet minuty slotu', () => {
  it('żądania jak Bob_wez — element = bajty + 45, ciało 13 + Σ + (n − 1); 200 → 1, 201 → 2; 5 × 250 KiB → 2; granica ciała 1 MiB; > 262 144 B → oversize', () => {
    expect(LO.partie(Array(200).fill(1000)).zadan).toBe(1);
    expect(LO.partie(Array(201).fill(1000)).zadan).toBe(2);
    expect(LO.partie(Array(5).fill(250 * 1024))).toMatchObject({ zadan: 2, oversize: 0, zdarzen: [4, 1] });
    // dokładnie 1 MiB ciała przy 4 zdarzeniach: 13 + 4 × (b + 45) + 3 = 1 048 576 → b = 262 095 B (≤ 262 144)
    const b = (1048576 - 13 - 3 - 4 * 45) / 4;
    expect(LO.cialo(Array(4).fill(LO.elementCiala(b)))).toBe(1048576);
    expect(LO.partie(Array(4).fill(b))).toMatchObject({ zadan: 1, cialo: [1048576] });
    expect(LO.partie([...Array(3).fill(b), b + 1])).toMatchObject({ zadan: 2, zdarzen: [3, 1] });
    expect(LO.partie([262144, 262145, 1000])).toMatchObject({ zadan: 1, oversize: 1, zdarzen: [2] });
  });
  it('strony dostawy po 200 zdarzeń; bajty realne — treść 32–45 KiB, bez treści 3 KiB, nigdy mniej niż bajty uprzęży', () => {
    expect(LO.strony(450)).toEqual([[0, 200], [200, 400], [400, 450]]);
    expect(LO.realne([{ tresci: 1, bajty: 1500 }, { tresci: 0, bajty: 400 }, { tresci: 2, bajty: 3000 }])).toEqual({ od: 3 * 32768 + 3072, do: 3 * 46080 + 3072 });
    expect(LO.realny({ tresci: 0, bajty: 5000 })).toEqual({ od: 5000, do: 5000 });
    expect(LO.realny({ tresci: 1, bajty: 50000 })).toEqual({ od: 50000, do: 50000 });
  });
  it('budżet minuty slotu: 94 wiersze z treścią w jednym kroku → przekroczony (94 × 46 080 B > 4 MiB), 90 → w budżecie; te same 94 w dwóch krokach → w budżecie; 601 wierszy → przekroczony', () => {
    const tr = (n) => Array(n).fill({ tresci: 1, bajty: 1700 });
    const budzet = (lista) => LO.budzetSlotow(lista.map(([t, dev, w]) => ({ t, dev, wiersze: w })));
    const czerwony = budzet([[MIN, 'A', tr(47)], [MIN, 'B', tr(47)]]);
    expect(94 * 46080).toBeGreaterThan(4 * 1048576);
    expect(czerwony).toMatchObject({ slotow: 1, zgodne: false });
    expect(czerwony.przekroczone.map((s) => [s.wierszy, s.realneDo, s.ok])).toEqual([[94, 94 * 46080, { wierszy: true, bajtow: false, zadan: true }]]);
    expect(budzet([[MIN, 'A', tr(45)], [MIN, 'B', tr(45)]])).toMatchObject({ zgodne: true, maksRealne: { realneDo: 90 * 46080 } });
    expect(budzet([[MIN, 'A', tr(47)], [2 * MIN, 'B', tr(47)]])).toMatchObject({ slotow: 2, zgodne: true });
    const wiersze = budzet([[MIN, 'A', Array(601).fill({ tresci: 0, bajty: 200 })]]);
    expect(wiersze.przekroczone.map((s) => s.ok)).toEqual([{ wierszy: false, bajtow: true, zadan: true }]);
    // żądania na urządzenie z bajtów realnych: 22 treści na żądanie (13 + 22 × 46 125 + 21 ≤ 1 MiB), 47 → 3
    expect(czerwony.przekroczone[0].urz.A).toEqual({ wierszy: 47, zadan: 3, oversize: 0, zadanUprzaz: 1 });
  });
  it('budżet minuty slotu: wiersz, którego górna granica przekracza limit zdarzenia (stomb z 6 treściami: 6 × 46 080 B > 262 144 B), to osobne żądanie i oversize w wyniku; 5 treści — w partii', () => {
    const budzet = (lista) => LO.budzetSlotow(lista.map(([t, dev, w]) => ({ t, dev, wiersze: w })));
    expect(6 * 46080).toBeGreaterThan(262144);
    expect(5 * 46080).toBeLessThanOrEqual(262144);
    const sam = budzet([[MIN, 'A', [{ tresci: 6, bajty: 9000 }]]]);
    expect([sam.maksZadan.zadanMaks, sam.oversize, sam.maksZadan.urz.A]).toEqual([1, 1, { wierszy: 1, zadan: 1, oversize: 1, zadanUprzaz: 1 }]);
    // 5 × 250 KiB (2 żądania) i jeden wiersz ponad limit → 3 żądania
    const z = budzet([[MIN, 'A', [...Array(5).fill({ tresci: 0, bajty: 250 * 1024 }), { tresci: 6, bajty: 9000 }]], [MIN, 'B', [{ tresci: 5, bajty: 9000 }]]]);
    expect([z.maksZadan.urz.A, z.maksZadan.urz.B, z.oversize]).toEqual([{ wierszy: 6, zadan: 3, oversize: 1, zadanUprzaz: 2 }, { wierszy: 1, zadan: 1, oversize: 0, zadanUprzaz: 1 }, 1]);
  });
  it('licznik zbiera strony z chwilą i urządzeniem: budżet warstwy wyk i naiwnej (po2a) osobno', () => {
    const L = LO.nowyLicznikOdsylania();
    L.zapiszStrone('blob221', Array(2).fill({ tresci: 1, bajty: 1700 }), Array(60).fill({ tresci: 1, bajty: 1700 }), { t: MIN, dev: 'A', opis: 'syntetyczna' });
    L.zapiszStrone('blob221', [], Array(60).fill({ tresci: 1, bajty: 1700 }), { t: MIN, dev: 'B' });
    const p = L.podsumuj();
    expect([p.stron, p.budzet.zgodne, p.budzetNaiwny.zgodne, p.budzetNaiwny.maksWierszy.wierszy]).toEqual([2, true, false, 120]);
  });
});

// E3-PR0c: model odsyłania (wyrocznia sejfu z włączonym przełącznikiem odsyłania) i warstwa „odesłane”.
describe('licznik odsyłania: model odsyłania poprawionych wizyt (E3-PR0c) i warstwa „odesłane”', () => {
  const zdarzenie = (o) => ({ event: { kind: 'snap', key: 'P/v', atISO: T1, dev: null }, ...lad(o) });
  const zlozony = () => {
    const przed = lad({ patients: [karta('P', [wersja('v', { payload: { _pinned: true, _pinnedState: { pin: true, at: T1 } } })])] });
    const P = { patients: [karta('P', [wersja('v', { rev: 2, updatedAtISO: T1, payload: { user: { weight: 17.2 } } })])] };
    const po = lad({ patients: [karta('P', [wersja('v', { rev: 3, updatedAtISO: T1, payload: { user: { weight: 17.2 }, _pinned: true, _pinnedState: { pin: true, at: T1 } } })])] });
    return { przed, P, po };
  };
  it('rekord złożony po kopercie zdarzenia → jeden wiersz snap; ten sam ładunek bez event (stara delta) → pusto', () => {
    const { przed, P, po } = zlozony();
    const m = LO.modelEcha(przed, po, zdarzenie(P));
    expect(m.wiersze.map((r) => [r.k, r.klasa])).toEqual([['snap:P/v', 'gwiazdka']]);
    expect(m.spoza).toEqual([]);
    expect(LO.modelEcha(przed, po, lad(P))).toEqual({ wiersze: [], spoza: [] });
  });
  it('wersja przeniesiona w tym scaleniu (przed pod Q, po pod P) → pusto; wersja przed scaleniem pod żadną kartą (np. tylko w Koszu) → wiersz', () => {
    const { P, po } = zlozony();
    const przedQ = lad({ patients: [karta('Q', [wersja('v')])] });
    expect(LO.modelEcha(przedQ, po, zdarzenie(P)).wiersze, 'przeniesiona').toEqual([]);
    const przedKosz = lad({ patients: [karta('P', [wersja('w')])], snapshotTombstones: [wpis('P', 'v')] });
    const poK = lad({ patients: [karta('P', [wersja('w'), ...po.patients[0].snapshots])] });
    expect(LO.modelEcha(przedKosz, poK, zdarzenie(P)).wiersze.map((r) => [r.k, r.nowa]), 'tylko w Koszu przed scaleniem').toEqual([['snap:P/v', true]]);
  });
  it('wersja spoza kandydatów ładunku zmieniona scaleniem → wiersz w spoza (strażnik kandydatów); kandydaci — wersje kart i wpisy Kosza ładunku', () => {
    const przed = lad({ patients: [karta('P', [wersja('v'), wersja('x')])] });
    const P = { patients: [karta('P', [wersja('v')])], snapshotTombstones: [wpis('P', 'y')] };
    const po = lad({ patients: [karta('P', [wersja('v'), wersja('x', { rev: 2, updatedAtISO: T1, payload: { user: { weight: 33 } } })])] });
    const m = LO.modelEcha(przed, po, zdarzenie(P));
    expect(m.spoza.map((r) => r.k)).toEqual(['snap:P/x']);
    expect([...LO.kandydaciEcha(P)].sort()).toEqual(['v', 'y']);
  });
  it('sam rev i tożsamość wizyty dopisana przez bieżącą wersję → pusto (warstwa wykonalna reguły pola)', () => {
    const przed = lad({ patients: [karta('P', [wersja('v')])] });
    expect(LO.modelEcha(przed, lad({ patients: [karta('P', [wersja('v', { rev: 4 })])] }), zdarzenie({ patients: [karta('P', [wersja('v', { rev: 4 })])] })).wiersze, 'sam rev').toEqual([]);
    const P = { patients: [karta('P', [bezVisit(wersja('v', { rev: 2, updatedAtISO: T1 }))])] };
    const po = lad({ patients: [karta('P', [wersja('v', { rev: 2, updatedAtISO: T1 })])] });
    expect(LO.modelEcha(lad(), po, zdarzenie(P)).wiersze, 'tożsamość wizyty').toEqual([]);
  });
  it('warstwa „odesłane”: koperta = wiersz modelu → klucz literału; koperta bez wiersza → ponad model; wiersz bez koperty → nieodesłane; pusta bez wywołań', () => {
    const L = LO.nowyLicznikOdsylania();
    expect(L.podsumuj().odeslane).toEqual({ literal: {}, ponadModel: 0, nieodeslane: 0, przyklady: [] });
    const { przed, P, po } = zlozony();
    const m = LO.modelEcha(przed, po, zdarzenie(P));
    L.zapiszOdeslane('zdarzenie', [{ event: { kind: 'snap', key: 'P/v' } }], m.wiersze);
    L.zapiszOdeslane('zdarzenie', [{ event: { kind: 'snap', key: 'P/x' } }], []);
    L.zapiszOdeslane('zdarzenie', [], m.wiersze);
    const o = L.podsumuj().odeslane;
    expect({ literal: o.literal, ponadModel: o.ponadModel, nieodeslane: o.nieodeslane }).toEqual({ literal: { 'zdarzenie|snap|w ładunku|gwiazdka': 1 }, ponadModel: 1, nieodeslane: 1 });
    expect(() => L.zapiszOdeslane('nieznane', [], [])).toThrow(/nieznane źródło/);
  });
  it('„samo oznaczenie” notatki (wykonanie z ładunku i tutejsza późniejsza treść — rekord złączony) → klucz zdarzenie|pnote|w ładunku|inne (nie „sam rev notatki”)', () => {
    const notatka = (o = {}) => ({ id: 'n', patientId: 'P', category: 'observation', rev: 2, createdAtISO: T0, updatedAtISO: T1, bodyCipher: { iv: 'iv-1', data: 'tutejsza' }, ...o });
    const przed = lad({ patientNotes: [notatka()] });
    const P = lad({ patientNotes: [notatka({ rev: 3, updatedAtISO: T0, completedAtISO: T0, bodyCipher: { iv: 'iv-2', data: 'z ładunku' } })] });
    const po = lad({ patientNotes: [notatka({ rev: 3, completedAtISO: T0, updatedAtISO: '2026-03-02T09:00:00.001Z', bodyCipher: { iv: 'iv-3', data: 'złączenie' } })] });
    const l = echo(przed, po, P).filter((r) => r.wykT);
    expect(l.map((r) => LO.kluczLiteralu('zdarzenie', r))).toEqual(['zdarzenie|pnote|w ładunku|inne']);
    expect(LO.modelEcha(przed, po, { ...P, event: { kind: 'pnote', key: 'n', atISO: T0, dev: null } }).wiersze, 'notatek model odsyłania nie obejmuje').toEqual([]);
  });
});
