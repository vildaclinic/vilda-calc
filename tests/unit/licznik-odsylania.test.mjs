// Licznik odsyłania (E3-PR0b, tests/support/licznik-odsylania.mjs): przypadki na syntetycznych trójkach (przed, po,
// ładunek) — warstwy echa, reguły pola (T domyślna, A i B diagnostyczne), klasy, przydział, usunięcia, żądania jak
// Bob_wez, strony, bajty realne, budżet minuty slotu, echo na klonach na kluczach E, strażnik pól zawsze obecnych
// i odcisk zgodny z sejfem; od E3-PR0e2a kanon wersji warstwy po2a bez rev i bez pól POLA_POMIJANE (chwila przypisania
// wersji do karty, jak Bev_ECHO_POMIJANE sejfu). Dane wyłącznie fikcyjne („Ala”, masy umowne).
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
  it('chwila przypisania wersji do karty pomijana jak rev (E3-PR0e2a): sama różnica pola wobec ładunku albo stanu przed → surowe 1, po2a 0, model odsyłania pusto; pole i treść inne niż w ładunku → wiersz', () => {
    expect(LO.POLA_POMIJANE.snap, 'lista pól pomijanych wersji').toEqual(['assignedAtISO']);
    const przed = lad({ patients: [karta('P', [wersja('v', { assignedAtISO: T2, payload: { user: { weight: 30 } } })])] });
    const P = { patients: [karta('P', [wersja('v', { rev: 2, updatedAtISO: T1, assignedAtISO: T1, payload: { user: { weight: 40 } } })])] };
    const po = lad({ patients: [karta('P', [wersja('v', { rev: 2, updatedAtISO: T1, assignedAtISO: T2, payload: { user: { weight: 40 } } })])] });
    expect(warstwy(echo(przed, po, P)), 'treść z ładunku, tutejsza późniejsza chwila przypisania').toEqual({ surowe: 1, po2a: 0, wykA: 0, wykB: 0, wykT: 0 });
    expect(LO.modelEcha(przed, po, zdarzenie(P)).wiersze, 'model odsyłania').toEqual([]);
    const bezPola = lad({ patients: [karta('P', [wersja('v')])] });
    const tylkoPo = lad({ patients: [karta('P', [wersja('v', { assignedAtISO: T2 })])] });
    expect(warstwy(echo(bezPola, tylkoPo, bezPola)), 'chwila przypisania tylko po scaleniu').toEqual({ surowe: 1, po2a: 0, wykA: 0, wykB: 0, wykT: 0 });
    const inna = lad({ patients: [karta('P', [wersja('v', { rev: 3, updatedAtISO: T1, assignedAtISO: T2, payload: { user: { weight: 41 } } })])] });
    expect(warstwy(echo(przed, inna, P)), 'pole i treść inne').toEqual({ surowe: 1, po2a: 1, wykA: 1, wykB: 1, wykT: 1 });
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

// E3-PR0d: model odsyłania wpisów Kosza (stomb, klucz = snapshotId) — warstwa wykonalna reguły pola bez samego
// wygaśnięcia treści (względem stanu przed scaleniem i względem ładunku po regule pola).
describe('licznik odsyłania: model odsyłania wpisów Kosza (E3-PR0d)', () => {
  const zd = (kind, key, o) => ({ event: { kind, key, atISO: T1, dev: null }, ...lad(o) });
  const gw = { pin: true, at: T1 };
  const karty = () => [karta('P', [wersja('w')])];
  const modelK = (przed, po, P) => LO.modelEcha(przed, po, P).wiersze.filter((r) => r.kind === 'stomb').map((r) => [r.k, r.wLadunku, r.klasa]);
  const bezTresci = (e) => { const { payload: _p, ...r } = e; return r; };
  it('gwiazdka w ładunku (koperta stomb bez gwiazdki, scalanie dokłada tutejszą) i spoza ładunku (koperta snap) → wiersz stomb v (R4a)', () => {
    const po = lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v', { gwiazdka: gw })] });
    expect(modelK(lad({ patients: [karta('P', [wersja('w'), wersja('v')])] }), po, zd('stomb', 'v', { snapshotTombstones: [wpis('P', 'v')] })), 'w ładunku').toEqual([['stomb:v', true, 'R4a']]);
    const P = { patients: [karta('P', [wersja('v', { updatedAtISO: T0, payload: { _pinned: true, _pinnedState: { pin: true, at: T0 } } })])] };
    expect(modelK(lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v')] }), po, zd('snap', 'P/v', P)), 'spoza ładunku').toEqual([['stomb:v', false, 'R4a']]);
  });
  it('nowsza treść (R4a′) i wpis pod kartą, której po scaleniu nie ma (R5 z zapisem) → wiersz stomb v', () => {
    const P = { snapshotTombstones: [wpis('P', 'v')] };
    const po = lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v', { payload: tresc('v', { user: { weight: 40 } }) })] });
    expect(modelK(lad({ patients: [karta('P', [wersja('w'), wersja('v', { payload: { user: { weight: 40 } } })])] }), po, zd('stomb', 'v', P)), 'R4a′').toEqual([['stomb:v', true, 'R4a′']]);
    const poR5 = lad({ snapshotTombstones: [wpis('P', 'v', { gwiazdka: gw })], tombstones: [{ patientId: 'P', deletedAtISO: T2 }] });
    expect(modelK(lad({ snapshotTombstones: [wpis('P', 'v')], tombstones: [{ patientId: 'P', deletedAtISO: T2 }] }), poR5, zd('snap', 'P/v', { patients: [karta('P', [wersja('v')])] })), 'R5 z zapisem').toEqual([['stomb:v', false, 'R5']]);
  });
  it('sam opis wpisu (D7), sama postać gwiazdki w treści (R4n), tożsamość wizyty nieobecna w ładunku → pusto', () => {
    const przed = lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v', { gwiazdka: gw })] });
    const P = { snapshotTombstones: [wpis('P', 'v', { gwiazdka: gw })] };
    expect(modelK(przed, lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v', { gwiazdka: gw, rev: 5, updatedAtISO: T2, zmianaISO: T2 })] }), zd('stomb', 'v', P)), 'D7').toEqual([]);
    expect(modelK(przed, lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v', { gwiazdka: gw, payload: tresc('v', { _pinned: true, _pinnedState: { pin: true, at: T2 } }) })] }), zd('stomb', 'v', P)), 'R4n').toEqual([]);
    const Pbez = { snapshotTombstones: [(({ visitIdentity: _v, ...e }) => ({ ...e, payload: { user: { weight: 20 } } }))(wpis('P', 'v'))] };
    expect(modelK(lad({ patients: [karta('P', [wersja('w'), wersja('v')])] }), lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v')] }), zd('stomb', 'v', Pbez)), 'tożsamość wizyty').toEqual([]);
  });
  it('samo wygaśnięcie treści względem stanu przed scaleniem i względem ładunku → pusto; wygaśnięcie i gwiazdka → wiersz', () => {
    const przed = lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v')] });
    const poBez = lad({ patients: karty(), snapshotTombstones: [bezTresci(wpis('P', 'v'))] });
    expect(modelK(przed, poBez, zd('snap', 'P/v', { patients: [karta('P', [wersja('v')])] })), 'względem przed').toEqual([]);
    expect(modelK(lad({ patients: [karta('P', [wersja('w'), wersja('v')])] }), poBez, zd('stomb', 'v', { snapshotTombstones: [wpis('P', 'v')] })), 'względem ładunku').toEqual([]);
    const poGw = lad({ patients: karty(), snapshotTombstones: [bezTresci(wpis('P', 'v', { gwiazdka: gw }))] });
    expect(modelK(przed, poGw, zd('snap', 'P/v', { patients: [karta('P', [wersja('v')])] })), 'wygaśnięcie i gwiazdka').toEqual([['stomb:v', false, 'R4a′']]);
    expect([LO.samoWygasniecie([wpis('P', 'v')], [bezTresci(wpis('P', 'v'))]), LO.samoWygasniecie([wpis('P', 'v')], [wpis('P', 'v')]), LO.samoWygasniecie([wpis('P', 'v')], [bezTresci(wpis('Q', 'v'))])], 'samoWygasniecie: zdjęta treść / nic / inna karta').toEqual([true, false, false]);
  });
  it('stary wpis bez zapisanej tożsamości (tożsamość z treści znika razem z treścią): zdjęta tylko treść → pusto, zdjęte treść i visitIdentity → wiersz (jedno odesłanie bez treści)', () => {
    const przed = lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v')] });
    const P = { patients: [karta('P', [wersja('v')])] };
    expect(modelK(przed, lad({ patients: karty(), snapshotTombstones: [bezTresci(wpis('P', 'v'))] }), zd('snap', 'P/v', P)), 'sama treść').toEqual([]);
    const { visitIdentity: _v, ...bezTozsamosci } = bezTresci(wpis('P', 'v'));
    expect(modelK(przed, lad({ patients: karty(), snapshotTombstones: [bezTozsamosci] }), zd('snap', 'P/v', P)), 'treść i tożsamość').toEqual([['stomb:v', false, 'R4a′']]);
  });
  it('stara delta (ładunek bez event) → pusto; wpis zdjęty scaleniem → pusto; wpis spoza kandydatów → spoza; tylko savedAtISO inne → wiersz (savedAtISO nie należy do kanonu)', () => {
    const przed = lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v')] });
    const po = lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v', { gwiazdka: gw })] });
    expect(LO.modelEcha(przed, po, lad({ snapshotTombstones: [wpis('P', 'v')] })).wiersze, 'stara delta').toEqual([]);
    expect(modelK(przed, lad({ patients: [karta('P', [wersja('w'), wersja('v', { updatedAtISO: T2 })])] }), zd('snap', 'P/v', { patients: [karta('P', [wersja('v', { updatedAtISO: T2 })])] })), 'wpis zdjęty scaleniem').toEqual([]);
    const m = LO.modelEcha(przed, po, zd('snap', 'P/w', { patients: [karta('P', [wersja('w')])] }));
    expect(m.spoza.map((r) => r.k), 'spoza kandydatów').toEqual(['stomb:v']);
    expect(modelK(przed, lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v', { savedAtISO: T1 })] }), zd('snap', 'P/v', { patients: [karta('P', [wersja('v')])] })), 'savedAtISO').toEqual([['stomb:v', false, 'inne']]);
  });
  it('sprawdzian długich przebiegów: wiersz stomb tylko przez savedAtISO (względem stanu przed albo względem ładunku po regule pola) → jego klucz; savedAtISO i gwiazdka inne → pusto; bez wierszy stomb → pusto', () => {
    const przed = lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v')] });
    const P = { patients: [karta('P', [wersja('v')])] };
    const tylko = (przedX, po, L) => LO.wierszeTylkoSavedAtISO(przedX, po, L, LO.modelEcha(przedX, po, L).wiersze);
    expect(tylko(przed, lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v', { savedAtISO: T1 })] }), zd('snap', 'P/v', P)), 'względem stanu przed').toEqual(['stomb:v']);
    const { visitIdentity: _v, ...bezV } = wpis('P', 'v', { savedAtISO: T0 });
    expect(tylko(lad({ patients: [karta('P', [wersja('w'), wersja('v')])] }), lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v', { savedAtISO: T1 })] }), zd('stomb', 'v', { snapshotTombstones: [bezV] })), 'względem ładunku po regule pola').toEqual(['stomb:v']);
    expect(tylko(przed, lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v', { savedAtISO: T1, gwiazdka: gw })] }), zd('snap', 'P/v', P)), 'savedAtISO i gwiazdka').toEqual([]);
    expect(tylko(przed, przed, zd('snap', 'P/v', P)), 'bez wierszy').toEqual([]);
  });
  it('reguła pola i kanon wpisu: bez visitIdentity i payload.visit nieobecnych w elemencie ładunku tej samej karty; kanon bez opisu, seq i postaci gwiazdki, lista posortowana', () => {
    const e = wpis('P', 'v', { gwiazdka: gw });
    const { visitIdentity: _v, ...bezV } = e;
    expect(LO.regulaPolaKosza([e], [bezV]), 'bez visitIdentity').toEqual([bezV]);
    expect(LO.regulaPolaKosza([e, wpis('Q', 'v')], [bezV]).map((x) => [x.patientId, 'visitIdentity' in x]), 'element innej karty bez pary').toEqual([['P', false], ['Q', true]]);
    expect(LO.kanonKosza([wpis('Q', 'v'), wpis('P', 'v', { rev: 7, seq: 3 })]), 'kanon').toEqual(LO.kanonKosza([wpis('P', 'v'), wpis('Q', 'v', { updatedAtISO: T2 })]));
  });
  it('warstwa „odesłane” z kopertą stomb → klucz literału zdarzenie|stomb|…', () => {
    const L = LO.nowyLicznikOdsylania();
    const przed = lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v')] });
    const po = lad({ patients: karty(), snapshotTombstones: [wpis('P', 'v', { gwiazdka: gw })] });
    const m = LO.modelEcha(przed, po, zd('snap', 'P/v', { patients: [karta('P', [wersja('v')])] }));
    L.zapiszOdeslane('zdarzenie', [{ event: { kind: 'stomb', key: 'v' } }], m.wiersze);
    const o = L.podsumuj().odeslane;
    expect({ literal: o.literal, ponadModel: o.ponadModel, nieodeslane: o.nieodeslane }).toEqual({ literal: { 'zdarzenie|stomb|spoza|R4a': 1 }, ponadModel: 0, nieodeslane: 0 });
  });
});

// E3-PR0d2: model odsyłania ukrytego wpisu Kosza karty usuniętej — wpis Kosza wersji, którą ładunek zdarzenia niósł pod
// kartą P, zostaje po scaleniu, choć wersji nie ma pod żadną kartą; wersja wygrywa z każdym elementem wpisu (z żadnym
// nie przegrywa w rozstrzygnięciu „nagrobek wygrywa z wersją” z kodu wyciętego z sejfu, LO.wygrywaZKodu); karty żadnego
// elementu wpisu nie ma; karta P przegrała
// z nagrobkiem pacjenta. Granica liczona z kopert i ładunków partii, przypisanie kopert klucza najpierw do odsyłania
// wpisów E3-PR0d.
describe('licznik odsyłania: model odsyłania ukrytego wpisu Kosza karty usuniętej (E3-PR0d2)', () => {
  const nagrobekWygrywa = LO.wygrywaZKodu(readFileSync(path.join(repo, 'vilda_vault.js'), 'utf8'), wytnijFunkcje);
  const T_PO = '2026-03-02T11:00:00.000Z'; // później niż T2
  const zd = (kind, key, o) => ({ event: { kind, key, atISO: T2, dev: null }, ...lad(o) });
  const nagrobek = (pid, at = T2) => ({ patientId: pid, deletedAtISO: at });
  // Stan po „Usuń pacjenta” na tym urządzeniu: wpis Kosza v pod P (Kosz o T1), nagrobek P (T2), bez karty P.
  const ukryty = (o = {}) => lad({ snapshotTombstones: [wpis('P', 'v')], tombstones: [nagrobek('P')], ...o });
  // Koperta snap P/v z wersją zmienioną po Koszu (T2) pod kartą P zapisaną o T1.
  const snapV = (w = {}, k = {}) => zd('snap', 'P/v', { patients: [karta('P', [wersja('v', { updatedAtISO: T2, ...w })], k)] });
  const model = (przed, po, P) => LO.modelStanu(przed, po, P, { nagrobekWygrywa }).map((r) => [r.k, r.retencja]);
  it('ukryty wpis i późniejsza wersja pod kartą P przegraną z nagrobkiem pacjenta → jeden wiersz stomb v (klasa ukrytego wpisu, przydział E3-PR0d2, bez retencji)', () => {
    const l = LO.modelStanu(ukryty(), ukryty(), snapV(), { nagrobekWygrywa });
    expect(l.map((r) => ({ k: r.k, kind: r.kind, rodzaj: r.rodzaj, key: r.key, pid: r.pid, wLadunku: r.wLadunku, klasa: r.klasa, przydzial: r.przydzial, zeStanu: r.zeStanu, retencja: r.retencja })))
      .toEqual([{ k: 'stomb:v', kind: 'stomb', rodzaj: 'stomb', key: 'v', pid: 'P', wLadunku: false, klasa: LO.KLASA_ZE_STANU, przydzial: 'E3-PR0d2', zeStanu: true, retencja: false }]);
    expect(LO.modelStanu(ukryty(), ukryty(), snapV(), {}), 'bez rozstrzygnięcia — pusto').toEqual([]);
  });
  it('karta P żywa, wersja pod kartą po scaleniu, wersja nie późniejsza niż Kosz, wpis z dwoma elementami — wersja wygrywa z jednym, z drugim (Kosz później) nie → pusto', () => {
    expect(model(ukryty(), lad({ patients: [karta('P', [wersja('w')])], snapshotTombstones: [wpis('P', 'v')], tombstones: [nagrobek('P', T0)] }), snapV()), 'karta P żywa').toEqual([]);
    expect(model(ukryty(), ukryty({ patients: [karta('Q', [wersja('v')])] }), snapV()), 'wersja pod kartą Q po scaleniu').toEqual([]);
    expect(model(ukryty(), ukryty(), snapV({ updatedAtISO: T1 })), 'wersja w chwili Kosza').toEqual([]);
    expect(model(ukryty(), ukryty(), snapV({ updatedAtISO: T0 })), 'wersja przed Koszem').toEqual([]);
    for (const wpisy of [[wpis('P', 'v'), wpis('R', 'v', { deletedAtISO: T_PO })], [wpis('R', 'v', { deletedAtISO: T_PO }), wpis('P', 'v')]]) {
      const dwa = ukryty({ snapshotTombstones: wpisy });
      expect(model(dwa, dwa, snapV()), `dwa elementy (pierwszy pod ${wpisy[0].patientId}): z elementem pod P wersja wygrywa, z elementem pod R (Kosz później) nie`).toEqual([]);
    }
  });
  it('wpis porządkowania: wersja nie późniejsza niż przycięcie bez gwiazdki → pusto; z gwiazdką → wiersz z retencją', () => {
    const ret = ukryty({ snapshotTombstones: [wpis('P', 'v', { powod: 'retencja' })] });
    expect(model(ret, ret, snapV({ updatedAtISO: T0 })), 'bez gwiazdki').toEqual([]);
    expect(model(ret, ret, snapV({ updatedAtISO: T0, payload: { _pinned: true } })), 'z gwiazdką').toEqual([['stomb:v', true]]);
  });
  it('wpis pod żywą kartą Q, wpis z dwoma elementami — jeden pod żywą kartą Q, element bez poprawnego patientId → pusto', () => {
    const zQ = (wpisy) => ukryty({ patients: [karta('Q', [wersja('q')])], snapshotTombstones: wpisy });
    expect(model(zQ([wpis('Q', 'v')]), zQ([wpis('Q', 'v')]), snapV()), 'wpis pod żywą Q').toEqual([]);
    expect(model(zQ([wpis('P', 'v'), wpis('Q', 'v')]), zQ([wpis('P', 'v'), wpis('Q', 'v')]), snapV()), 'dwa elementy, jeden pod żywą Q').toEqual([]);
    expect(model(zQ([wpis('P', 'v'), wpis('R', 'v')]), zQ([wpis('P', 'v'), wpis('R', 'v')]), snapV()), 'kontrola: dwa elementy, karty żadnego nie ma').toEqual([['stomb:v', false]]);
    const { patientId: _p, ...bezKarty } = wpis('P', 'v');
    for (const e of [bezKarty, { ...bezKarty, patientId: '' }, { ...bezKarty, patientId: 7 }]) {
      expect(model(ukryty({ snapshotTombstones: [wpis('P', 'v'), e] }), ukryty({ snapshotTombstones: [wpis('P', 'v'), e] }), snapV()), `element z patientId ${JSON.stringify(e.patientId)}`).toEqual([]);
    }
  });
  it('karta P bez nagrobka, nagrobek wcześniejszy niż zapis karty P z ładunku → pusto; nagrobek równy zapisowi, brak zapisu, najpóźniejszy z dwóch nagrobków → wiersz', () => {
    expect(model(ukryty({ tombstones: [] }), ukryty({ tombstones: [] }), snapV()), 'bez nagrobka').toEqual([]);
    expect(model(ukryty({ tombstones: [nagrobek('Q', T_PO)] }), ukryty({ tombstones: [nagrobek('Q', T_PO)] }), snapV()), 'nagrobek innej karty').toEqual([]);
    expect(model(ukryty(), ukryty(), snapV({}, { lastSavedAtISO: T_PO })), 'nagrobek przed zapisem karty P').toEqual([]);
    expect(model(ukryty(), ukryty(), snapV({}, { lastSavedAtISO: T2 })), 'nagrobek równy zapisowi').toEqual([['stomb:v', false]]);
    const bezZapisu = snapV();
    delete bezZapisu.patients[0].lastSavedAtISO;
    expect(model(ukryty(), ukryty(), bezZapisu), 'brak zapisu karty P').toEqual([['stomb:v', false]]);
    const dwa = ukryty({ tombstones: [nagrobek('P', T1), nagrobek('P', T_PO)] });
    expect(model(dwa, dwa, snapV({}, { lastSavedAtISO: T2 })), 'najpóźniejszy z dwóch nagrobków').toEqual([['stomb:v', false]]);
  });
  it('stara delta bez event, koperta stomb (karta bez wersji) → pusto; ta sama wersja pod dwiema kartami ładunku → jeden wiersz', () => {
    const { event: _e, ...delta } = snapV();
    expect(model(ukryty(), ukryty(), delta), 'stara delta').toEqual([]);
    expect(model(ukryty(), ukryty(), zd('stomb', 'v', { snapshotTombstones: [wpis('P', 'v')], patients: [karta('P', [])] })), 'koperta stomb').toEqual([]);
    const dwie = ukryty({ tombstones: [nagrobek('P'), nagrobek('R')] });
    expect(model(dwie, dwie, zd('snap', 'P/v', { patients: [karta('P', [wersja('v', { updatedAtISO: T2 })]), karta('R', [wersja('v', { updatedAtISO: T2 })])] })), 'dwie karty').toEqual([['stomb:v', false]]);
  });
  it('granica z kopert i ładunków partii: dwie koperty stomb v przy jednym ładunku z v → naruszenie; przy dwóch → brak; ładunek z v tylko w snapshotTombstones liczy się; koperty snap poza granicą', () => {
    const k = (kind, key) => ({ event: { kind, key } });
    expect(LO.ponadGranica([snapV()], [k('stomb', 'v'), k('stomb', 'v')]), 'jeden ładunek').toEqual([{ v: 'v', n: 2, zdarzen: 1 }]);
    expect(LO.ponadGranica([snapV(), snapV()], [k('stomb', 'v'), k('stomb', 'v')]), 'dwa ładunki').toEqual([]);
    expect(LO.ponadGranica([zd('stomb', 'v', { snapshotTombstones: [wpis('P', 'v')] })], [k('stomb', 'v')]), 'v tylko w snapshotTombstones').toEqual([]);
    expect(LO.ponadGranica([zd('snap', 'P/w', { patients: [karta('P', [wersja('w')])] })], [k('stomb', 'v')]), 'ładunek bez v').toEqual([{ v: 'v', n: 1, zdarzen: 0 }]);
    expect(LO.ponadGranica([null, undefined], [k('snap', 'P/v'), k('snap', 'P/v')]), 'koperty snap').toEqual([]);
  });
  it('przypisanie kopert: klucz z wierszem odsyłania wpisów E3-PR0d i wierszem ze stanu w jednej partii — pierwsza koperta do E3-PR0d, druga ze stanu (z retencją wiersza); snap — E3-PR0d; koperta stomb bez wiersza → wyjątek', () => {
    const k = (kind, key) => ({ event: { kind, key } });
    const wiersz = { k: 'stomb:v', kind: 'stomb', key: 'v' };
    const zs = (retencja) => ({ k: 'stomb:v', kind: 'stomb', key: 'v', zeStanu: true, retencja });
    expect(LO.przypiszKoperty([k('snap', 'P/w'), k('stomb', 'v'), k('stomb', 'v')], [{ k: 'snap:P/w', kind: 'snap', key: 'P/w' }, wiersz], [zs(true)]))
      .toEqual([{ src: 'echo' }, { src: 'echo' }, { src: 'stan', retencja: true }]);
    expect(LO.przypiszKoperty([k('stomb', 'v')], [], [zs(false)]), 'tylko wiersz ze stanu').toEqual([{ src: 'stan', retencja: false }]);
    expect(() => LO.przypiszKoperty([k('stomb', 'v'), k('stomb', 'v')], [wiersz], []), 'koperta bez wiersza').toThrow(/bez wiersza modelu/);
  });
});

// E3-PR0d2: model ze stanu bierze z sejfu wyłącznie rozstrzygnięcie „nagrobek wygrywa z wersją” (Bkz_wygrywa z chwilą
// zmiany i stanem gwiazdki wersji) — kod wycięty z vilda_vault.js (LO.wygrywaZKodu), wzór „odcisk z kodu wyciętego”
// wyżej. Strażnik „wycięte = sejf”: domknięcie wywołań w bieżącym sejfie = lista licznika, jedyna zmienna modułu,
// bez zegara, licznik bez własnych kopii tych funkcji, tekst wycinka = tekst deklaracji, wywołanie w bloku
// P-DZIENNIK-ZDARZEN (część odsyłania) z tymi samymi argumentami co w modelu, próbki.
describe('licznik odsyłania: rozstrzygnięcie „nagrobek wygrywa z wersją” z kodu sejfu (wycięte = sejf)', () => {
  const src = readFileSync(path.join(repo, 'vilda_vault.js'), 'utf8');
  const drzewo = async () => {
    const { parse } = await import('acorn');
    const { analyze } = await import('eslint-scope');
    const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'script', ranges: true });
    const sm = analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
    const zI = sm.acquire(ast.body[0].expression.callee);
    const dekl = new Map();
    const ile = new Map();
    const zmienneModulu = new Map();
    for (const z of zI.variables) for (const d of z.defs) {
      if (d.type === 'Variable') { if (!zmienneModulu.has(z.name)) zmienneModulu.set(z.name, []); zmienneModulu.get(z.name).push(d.parent); }
      if (d.type !== 'FunctionName') continue;
      ile.set(z.name, (ile.get(z.name) || 0) + 1);
      if (!dekl.has(z.name)) dekl.set(z.name, d.node);
    }
    const refs = (node) => { const out = new Set(); const odw = (z) => { for (const r of z.references) if (r.resolved && r.resolved.scope === zI) out.add(r.resolved.name); for (const c of z.childScopes) odw(c); }; odw(sm.acquire(node)); return out; };
    const q = ['Bkz_wygrywa', 'Bkz_zmiana', 'Bgw_stan'];
    const funkcje = new Set();
    const zmienne = new Set();
    while (q.length) { const n = q.shift(); if (funkcje.has(n) || !dekl.has(n)) continue; funkcje.add(n); for (const w of refs(dekl.get(n))) { if (dekl.has(w)) q.push(w); else zmienne.add(w); } }
    return { ast, dekl, ile, funkcje, zmienne, zmienneModulu };
  };
  // Zegar w ciele funkcji (jak B7 w tests/unit/sync-zdarzenia-buildery.test.mjs).
  const zegar = (node) => {
    const z = [];
    const idz = (n) => {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'NewExpression' && n.callee.type === 'Identifier' && n.callee.name === 'Date' && n.arguments.length === 0) z.push('new Date()');
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'Date') z.push('Date()');
      // Date.parse(x) — czysta funkcja argumentu, nie zegar (Bnp_iso, wołana przy części Kosza E3-PR0e2b)
      if (n.type === 'MemberExpression' && n.object.type === 'Identifier' && ['Date', 'performance'].includes(n.object.name) && !(n.object.name === 'Date' && !n.computed && n.property.name === 'parse')) z.push(n.object.name + '.…');
      for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach(idz); else if (x && typeof x.type === 'string') idz(x); }
    };
    idz(node.body);
    return z;
  };
  it('domknięcie wywołań Bkz_wygrywa, Bkz_zmiana i Bgw_stan w sejfie = lista licznika; jedyna zmienna modułu w nim — Bgw_czPam; bez zegara; licznik bez własnych deklaracji tych funkcji', async () => {
    const { dekl, funkcje, zmienne } = await drzewo();
    expect([...funkcje].sort(), 'domknięcie = WYGRYWA_Z_SEJFU').toEqual([...LO.WYGRYWA_Z_SEJFU].sort());
    expect([...zmienne].sort(), 'zmienne modułu w domknięciu = STALE_WYGRYWA').toEqual([...LO.STALE_WYGRYWA].sort());
    expect([...funkcje].filter((n) => zegar(dekl.get(n)).length), 'funkcje z zegarem w domknięciu').toEqual([]);
    expect(zegar({ body: (await import('acorn')).parse('function f() { return Date.now(); }', { ecmaVersion: 'latest' }).body[0].body }), 'samokontrola wykrywacza zegara').toEqual(['Date.…']);
    expect(zegar({ body: (await import('acorn')).parse('function f(x) { return Date.parse(x); }', { ecmaVersion: 'latest' }).body[0].body }), 'samokontrola: Date.parse(x) nie jest zegarem').toEqual([]);
    const tekstLO = readFileSync(path.join(repo, 'tests/support/licznik-odsylania.mjs'), 'utf8');
    expect([...LO.WYGRYWA_Z_SEJFU, ...LO.STALE_WYGRYWA].filter((n) => new RegExp(`(?:function\\s+${n}\\s*\\(|(?:const|let|var)\\s+${n}\\s*=)`).test(tekstLO)), 'deklaracje w liczniku').toEqual([]);
  });
  it('tekst wycinka = tekst deklaracji: dla każdej funkcji domknięcia jedna deklaracja, a wytnijFunkcje daje dokładnie jej tekst; stała Bgw_czPam zadeklarowana raz, a LO.stalaZKodu daje dokładnie tekst jej deklaracji z drzewa składni', async () => {
    const { dekl, ile, funkcje, zmienneModulu } = await drzewo();
    const zle = [...funkcje].filter((n) => ile.get(n) !== 1 || wytnijFunkcje(src, n) !== src.slice(dekl.get(n).start, dekl.get(n).end));
    expect(zle, 'funkcje z wieloma deklaracjami albo wycinkiem innym niż deklaracja').toEqual([]);
    expect(funkcje.size, 'kontrola: domknięcie niepuste').toBe(LO.WYGRYWA_Z_SEJFU.length);
    for (const n of LO.STALE_WYGRYWA) {
      expect((src.match(new RegExp(`\\nconst ${n} = `, 'g')) || []).length, `deklaracje stałej ${n} (tekst)`).toBe(1);
      const d = zmienneModulu.get(n) || [];
      expect(d.map((x) => [x.kind, x.declarations.length]), `deklaracje stałej ${n} w zasięgu modułu`).toEqual([['const', 1]]);
      expect(LO.stalaZKodu(src, n), `wycinek stałej ${n} = deklaracja`).toBe(src.slice(d[0].start, d[0].end));
    }
  });
  it('w bloku P-DZIENNIK-ZDARZEN dokładnie jedno wywołanie Bkz_wygrywa — w Bev_wstepUkrytych, z drugim argumentem Bkz_zmiana(X) i trzecim Bgw_stan(X, X.payload) dla tego samego X', async () => {
    const { ast } = await drzewo();
    const a = src.indexOf('/* P-DZIENNIK-ZDARZEN: poczatek bloku */');
    const b = src.indexOf('/* P-DZIENNIK-ZDARZEN: koniec bloku */');
    expect(a > 0 && b > a, 'kontrola: znaczniki bloku').toBe(true);
    const wyw = [];
    const idz = (n, f) => {
      if (!n || typeof n.type !== 'string') return;
      const g = n.type === 'FunctionDeclaration' && n.id ? n.id.name : f;
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'Bkz_wygrywa' && n.start > a && n.end < b) wyw.push({ f: g, n });
      for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach((y) => idz(y, g)); else if (x && typeof x.type === 'string') idz(x, g); }
    };
    idz(ast, null);
    const t = (n) => src.slice(n.start, n.end);
    const forma = wyw.map(({ f, n }) => {
      const [, z, s] = n.arguments;
      const ok = n.arguments.length === 3 && z.type === 'CallExpression' && t(z.callee) === 'Bkz_zmiana' && z.arguments.length === 1
        && s.type === 'CallExpression' && t(s.callee) === 'Bgw_stan' && s.arguments.length === 2
        && t(s.arguments[0]) === t(z.arguments[0]) && t(s.arguments[1]) === `${t(z.arguments[0])}.payload`;
      return { funkcja: f, forma: ok };
    });
    expect(forma, 'wywołania Bkz_wygrywa w bloku').toEqual([{ funkcja: 'Bev_wstepUkrytych', forma: true }]);
  });
  it('próbki: Kosz przed wersją — wersja wygrywa; wersja nie późniejsza niż Kosz — Kosz; przycięcie bez gwiazdki — przycięcie; przycięcie przy gwiazdce wersji albo przypiętym rejestrze wpisu — wersja; przypięty rejestr wpisu przy wersji wcześniejszej niż Kosz — Kosz', () => {
    const rozstrzygnij = LO.wygrywaZKodu(src, wytnijFunkcje);
    const S = (o = {}) => wersja('v', o);
    const gw = { pin: true, at: T0 };
    expect(rozstrzygnij(wpis('P', 'v'), S({ updatedAtISO: T2 })), 'Kosz przed wersją').toBe(false);
    expect(rozstrzygnij(wpis('P', 'v'), S({ updatedAtISO: T1 })), 'wersja w chwili Kosza').toBe(true);
    expect(rozstrzygnij(wpis('P', 'v', { powod: 'retencja' }), S()), 'przycięcie bez gwiazdki').toBe(true);
    expect(rozstrzygnij(wpis('P', 'v', { powod: 'retencja' }), S({ payload: { _pinned: true } })), 'przycięcie przy gwiazdce wersji').toBe(false);
    expect(rozstrzygnij(wpis('P', 'v', { powod: 'retencja', gwiazdka: gw }), S()), 'przycięcie przy przypiętym rejestrze wpisu').toBe(false);
    expect(rozstrzygnij(wpis('P', 'v', { gwiazdka: gw }), S()), 'przypięty rejestr wpisu, wersja przed Koszem').toBe(true);
    expect(() => rozstrzygnij(wpis('P', 'v'), null), 'wersja null — wyjątek (sejf: jak wersja wygrywa)').toThrow();
  });
});
