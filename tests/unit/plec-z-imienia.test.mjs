import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { czytajListe, trescPliku, wczytajPlikDanych, zbudujZrodlo } from '../support/imiona-pesel.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');
const fixture = (plik) => path.join(korzen, 'tests/fixtures/imiona-pesel', plik);

// P-PLEC-IMIE (decyzja właściciela 2026-10-12) — płeć NOWEGO pacjenta z imienia (słownik PESEL)
// i nazwiska (-ski/-ska), tylko przed pierwszym zapisem, tylko po wpisie lekarza, zawsze z notką.
// Przed zmianą: pole płci zaczyna od „Mężczyzna”, a „Wyczyść” wraca do M — lekarz, który zapomni
// je zmienić, dostaje u „Anny” obliczenia męskie. Testy wołają PRAWDZIWY vilda_plec_z_imienia.js.
// Słownik w testach silnika jest SYNTETYCZNY (liczby wymyślone), żeby progi dało się sprawdzić
// na granicy; prawdziwy plik danych ma osobny blok niżej. Dane pacjentów wyłącznie FIKCYJNE.

const SLOWNIK = {
  id: 'TEST-PL-1',
  kraj: 'PL',
  nazwa: 'Słownik syntetyczny (test)',
  stanNa: '2026-01-01',
  imiona: {
    anna: [5000, 3],
    ewa: [3000, 0],
    jan: [0, 4000],
    piotr: [1, 3000],
    nikola: [950, 50],
    sasza: [40, 60],
    rzadkie: [19, 0],
    graniczne: [99, 1],
    'łukasz': [0, 900],
  },
};

function okno(extra = {}) {
  const w = {
    document: { readyState: 'complete', getElementById: () => null, addEventListener() {} },
    addEventListener() {},
    setTimeout: (f) => { f(); return 1; },
    ...extra,
  };
  loadBrowserScript('vilda_plec_z_imienia.js', w);
  return w;
}

const P = () => okno().VildaPlecZImienia;

describe('silnik — klucz imienia i ocena ze źródła (źródło jest argumentem)', () => {
  it('klucz: pierwsze imię, małe litery, bez znaków na brzegach; łączniki i myślniki rozdzielają', () => {
    const S = P();
    expect(S.kluczImienia(' Anna ')).toBe('anna');
    expect(S.kluczImienia('ANNA MARIA')).toBe('anna');
    expect(S.kluczImienia('Anna-Maria')).toBe('anna');
    expect(S.kluczImienia('Anna—Maria')).toBe('anna');
    expect(S.kluczImienia('„Ewa”,')).toBe('ewa');
    expect(S.kluczImienia('ŁUKASZ')).toBe('łukasz');
    expect(S.kluczImienia('')).toBe('');
    expect(S.kluczImienia(null)).toBe('');
  });

  it('≥ 99% jednej płci i ≥ 20 osób → płeć; wynik niesie źródło', () => {
    const S = P();
    const a = S.ocenImie('Anna', SLOWNIK);
    expect([a.plec, a.powod, a.kobiety, a.mezczyzni]).toEqual(['F', 'slownik', 5000, 3]);
    expect(a.zrodlo).toEqual({ id: 'TEST-PL-1', nazwa: 'Słownik syntetyczny (test)', stanNa: '2026-01-01', kraj: 'PL' });
    expect(S.ocenImie('jan', SLOWNIK).plec).toBe('M');
    expect(S.ocenImie('Piotr', SLOWNIK).plec, '1 kobieta na 3001 osób nie zmienia decyzji').toBe('M');
    // Granica: 99 na 100 = dokładnie 99% → decyzja.
    expect(S.ocenImie('Graniczne', SLOWNIK).plec).toBe('F');
  });

  it('poniżej progu udziału → niejednoznaczne; poniżej 20 osób albo brak w słowniku → nieznane', () => {
    const S = P();
    expect(S.ocenImie('Nikola', SLOWNIK)).toMatchObject({ plec: null, powod: 'niejednoznaczne', udzial: 0.95 });
    expect(S.ocenImie('Sasza', SLOWNIK)).toMatchObject({ plec: null, powod: 'niejednoznaczne' });
    expect(S.ocenImie('Rzadkie', SLOWNIK)).toMatchObject({ plec: null, powod: 'nieznane', kobiety: 19 });
    expect(S.ocenImie('Xyzabc', SLOWNIK)).toMatchObject({ plec: null, powod: 'nieznane' });
    expect(S.ocenImie('', SLOWNIK)).toMatchObject({ plec: null, powod: 'puste' });
    expect(S.ocenImie('Anna', null)).toMatchObject({ plec: null, powod: 'brak-slownika' });
  });

  it('imię wpisane bez polskich znaków trafia w słownik (indeks złożony), dokładne trafienie ma pierwszeństwo', () => {
    const S = P();
    expect(S.ocenImie('Lukasz', SLOWNIK)).toMatchObject({ plec: 'M', dokladne: false, mezczyzni: 900 });
    expect(S.ocenImie('Łukasz', SLOWNIK)).toMatchObject({ plec: 'M', dokladne: true });
  });

  it('źródło domyślne: najnowszy stan dla kraju z rejestru VildaImionaPlecZrodla', () => {
    const starsze = { ...SLOWNIK, id: 'A', stanNa: '2024-01-01', imiona: { anna: [1, 999] } };
    const nowsze = { ...SLOWNIK, id: 'B', stanNa: '2025-06-30' };
    const inny = { ...SLOWNIK, id: 'C', kraj: 'XX', stanNa: '2030-01-01' };
    const w = okno({ VildaImionaPlecZrodla: { A: starsze, B: nowsze, C: inny } });
    const S = w.VildaPlecZImienia;
    expect(S.zrodloDomyslne().id).toBe('B');
    expect(S.zrodloDomyslne('XX').id).toBe('C');
    expect(S.ocenImie('Anna').zrodlo.id, 'bez argumentu — źródło domyślne').toBe('B');
    expect(S.zrodla().map((z) => z.id)).toEqual(['A', 'B', 'C']);
  });
});

describe('silnik — nazwisko i podpowiedź łączna', () => {
  it('przymiotnikowe końcówki: -ska/-cka/-dzka żeńskie, -ski/-cki/-dzki męskie; człony osobno', () => {
    const S = P();
    expect(S.ocenNazwisko('Testowska')).toMatchObject({ plec: 'F', powod: 'koncowka' });
    expect(S.ocenNazwisko('Testowski').plec).toBe('M');
    expect(S.ocenNazwisko('Testocka').plec).toBe('F');
    expect(S.ocenNazwisko('Testodzki').plec).toBe('M');
    expect(S.ocenNazwisko('Fikcyjny-Testowska')).toMatchObject({ plec: 'F', czlon: 'testowska' });
    expect(S.ocenNazwisko('Testowska-Testowski')).toMatchObject({ plec: null, powod: 'sprzeczne' });
    expect(S.ocenNazwisko('Fikcyjna')).toMatchObject({ plec: null, powod: 'brak' });
    expect(S.ocenNazwisko('Ska')).toMatchObject({ plec: null, powod: 'brak' });
    expect(S.ocenNazwisko('  ')).toMatchObject({ plec: null, powod: 'puste' });
  });

  it('ograniczenie opisane w rejestrze: rzeczownikowe nazwisko na -ska (np. „Laska”) reguła bierze za żeńskie', () => {
    expect(P().ocenNazwisko('Laska').plec).toBe('F');
  });

  it('imię ze słownika jest silniejsze od nazwiska; nazwisko decyduje, gdy imię nie rozstrzyga', () => {
    const S = P();
    expect(S.podpowiedz({ imie: 'Anna', nazwisko: 'Testowska' }, SLOWNIK)).toMatchObject({ plec: 'F', powod: 'imie-i-nazwisko', konflikt: false });
    expect(S.podpowiedz({ imie: 'Anna', nazwisko: 'Fikcyjna' }, SLOWNIK)).toMatchObject({ plec: 'F', powod: 'imie' });
    expect(S.podpowiedz({ imie: 'Jan', nazwisko: 'Testowska' }, SLOWNIK)).toMatchObject({ plec: 'M', powod: 'imie', konflikt: true });
    expect(S.podpowiedz({ imie: 'Sasza', nazwisko: 'Testowska' }, SLOWNIK)).toMatchObject({ plec: 'F', powod: 'nazwisko' });
    expect(S.podpowiedz({ imie: '', nazwisko: 'Testowski' }, SLOWNIK)).toMatchObject({ plec: 'M', powod: 'nazwisko' });
    expect(S.podpowiedz({ imie: 'Sasza', nazwisko: 'Fikcyjna' }, SLOWNIK)).toMatchObject({ plec: null, powod: 'niejednoznaczne' });
    expect(S.podpowiedz({ imie: 'Xyzabc', nazwisko: '' }, SLOWNIK)).toMatchObject({ plec: null, powod: 'nieznane' });
    expect(S.podpowiedz({ imie: '', nazwisko: 'Fikcyjna' }, SLOWNIK)).toMatchObject({ plec: null, powod: 'brak' });
    expect(S.podpowiedz({ imie: 'Anna', nazwisko: 'Testowska' }, null)).toMatchObject({ plec: 'F', powod: 'nazwisko' });
  });

  it('treść notki: decyzja automatu, rozbieżność z polem i wątpliwość — każda ma zdanie', () => {
    const S = P();
    const { STAN } = S;
    const t = (dane, stan, plec) => S.trescNotki(S.podpowiedz(dane, SLOWNIK), stan, plec);
    expect(t({ imie: 'Anna' }, STAN.AUTOMAT, 'F')).toEqual({ uwaga: false, tekst: 'Płeć ustawiona na podstawie imienia „Anna” — sprawdź.' });
    expect(t({ imie: 'Anna', nazwisko: 'Testowska' }, STAN.AUTOMAT, 'F').tekst).toBe('Płeć ustawiona na podstawie imienia i nazwiska — sprawdź.');
    expect(t({ nazwisko: 'Testowska' }, STAN.AUTOMAT, 'F').tekst).toBe('Płeć ustawiona na podstawie nazwiska „Testowska” — sprawdź.');
    expect(t({ imie: 'Jan', nazwisko: 'Testowska' }, STAN.AUTOMAT, 'M')).toEqual({
      uwaga: true, tekst: 'Płeć ustawiona na podstawie imienia „Jan”, ale nazwisko „Testowska” ma formę żeńską — sprawdź.',
    });
    expect(t({ imie: 'Anna' }, STAN.LEKARZ, 'F'), 'zgodny wybór lekarza — bez notki').toBeNull();
    expect(t({ imie: 'Anna' }, STAN.LEKARZ, 'M')).toEqual({ uwaga: true, tekst: 'Sprawdź płeć: imię „Anna” jest zwykle żeńskie.' });
    expect(t({ imie: 'Jan' }, STAN.ZEWNETRZNA, 'F').tekst).toBe('Sprawdź płeć: imię „Jan” jest zwykle męskie.');
    expect(t({ imie: 'Anna', nazwisko: 'Testowska' }, STAN.LEKARZ, 'M').tekst).toBe('Sprawdź płeć: imię i nazwisko wskazują płeć żeńską.');
    expect(t({ nazwisko: 'Testowski' }, STAN.LEKARZ, 'F').tekst).toBe('Sprawdź płeć: nazwisko „Testowski” ma formę męską.');
    expect(t({ imie: 'Sasza' }, STAN.DOMYSLNA, 'M')).toEqual({ uwaga: true, tekst: 'Sprawdź płeć: imię „Sasza” noszą kobiety i mężczyźni.' });
    expect(t({ imie: 'Xyzabc' }, STAN.AUTOMAT, 'F').tekst).toBe('Sprawdź płeć: imienia „Xyzabc” nie ma w słowniku.');
    expect(t({ imie: 'Sasza' }, STAN.LEKARZ, 'M'), 'wybór lekarza przy imieniu niejednoznacznym — bez notki').toBeNull();
    expect(t({ imie: '' }, STAN.DOMYSLNA, 'M')).toBeNull();
  });
});

/* ---------------------------------------------------------------- formularz na atrapie DOM */

function formularz({ zrodla = { 'TEST-PL-1': SLOWNIK }, bez = [], blokada = false } = {}) {
  const sluchacze = { doc: [], win: [] };
  const kolejka = [];
  class Zdarzenie {
    constructor(type, init) { this.type = type; this.bubbles = Boolean(init && init.bubbles); this.isTrusted = false; }
  }
  const doc = {
    readyState: 'complete',
    getElementById: (id) => pola[id] || null,
    addEventListener: (typ, f) => { sluchacze.doc.push({ typ, f }); },
    dispatchEvent: (e) => { sluchacze.doc.filter((s) => s.typ === e.type).forEach((s) => s.f(e)); return true; },
  };
  const pola = {};
  const element = (id) => {
    const el = {
      id, value: '', readOnly: false, disabled: false, hidden: id === 'plecZImieniaNote', textContent: '', title: '',
      klasy: new Set(id === 'plecZImieniaNote' ? ['vild-dob-note'] : []), wyslane: [],
    };
    el.classList = {
      add: (k) => el.klasy.add(k),
      remove: (k) => el.klasy.delete(k),
      contains: (k) => el.klasy.has(k),
      toggle: (k, tak) => { if (tak) el.klasy.add(k); else el.klasy.delete(k); return tak; },
    };
    el.removeAttribute = (n) => { if (n === 'title') el.title = ''; };
    el.dispatchEvent = (e) => { e.target = el; el.wyslane.push([e.type, e.isTrusted]); doc.dispatchEvent(e); return true; };
    return el;
  };
  ['lastName', 'firstName', 'name', 'sex', 'plecZImieniaNote'].filter((id) => !bez.includes(id)).forEach((id) => { pola[id] = element(id); });
  if (pola.sex) pola.sex.value = 'M';
  const stanBlokady = { tak: blokada };
  const win = {
    document: doc,
    Event: Zdarzenie,
    addEventListener: (typ, f) => { sluchacze.win.push({ typ, f }); },
    setTimeout: (f) => { kolejka.push(f); return kolejka.length; },
    VildaImionaPlecZrodla: zrodla,
    VildaPolaTozsamosci: { zablokowane: () => stanBlokady.tak },
  };
  loadBrowserScript('vilda_plec_z_imienia.js', win);
  const tick = () => { while (kolejka.length) kolejka.shift()(); };
  const zaufane = (el, typ) => el.dispatchEvent({ type: typ, isTrusted: true });
  return {
    win, pola, sluchacze, tick, stanBlokady,
    M: win.VildaPlecZImienia,
    /* Lekarz wpisuje i wychodzi z pola: input przy każdym znaku (tu jeden), change po wyjściu. */
    wpisz(id, wartosc) {
      const el = pola[id];
      el.value = wartosc;
      zaufane(el, 'input');
      if (pola.name && (id === 'firstName' || id === 'lastName')) {
        pola.name.value = [pola.lastName.value, pola.firstName.value].filter(Boolean).join(' ');
        pola.name.dispatchEvent(new Zdarzenie('input', { bubbles: true })); // P-SPLIT, programowo
      }
      zaufane(el, 'change');
      tick();
    },
    /* Lekarz wybiera płeć z listy. */
    wybierz(plec) {
      pola.sex.value = plec;
      zaufane(pola.sex, 'input');
      zaufane(pola.sex, 'change');
      tick();
    },
    /* Odtworzenie po F5 albo lustro innej strony: wartości z zewnątrz, zdarzenia programowe. */
    zZewnatrz({ nazwisko, imie, plec }, flaga = '__vildaPersistRestoring') {
      win[flaga] = true;
      pola.lastName.value = nazwisko;
      pola.firstName.value = imie;
      pola.name.value = `${nazwisko} ${imie}`;
      pola.name.dispatchEvent(new Zdarzenie('input', { bubbles: true }));
      pola.sex.value = plec;
      pola.sex.dispatchEvent(new Zdarzenie('change', { bubbles: true }));
      win[flaga] = false;
      tick();
    },
    wyczysc() {
      pola.lastName.value = '';
      pola.firstName.value = '';
      pola.name.value = '';
      sluchacze.win.filter((s) => s.typ === 'vilda:user-state-cleared').forEach((s) => s.f({ type: 'vilda:user-state-cleared' }));
      pola.sex.value = 'M';
      pola.sex.dispatchEvent(new Zdarzenie('input', { bubbles: true }));
      pola.sex.dispatchEvent(new Zdarzenie('change', { bubbles: true }));
      tick();
    },
    notka: () => ({ widoczna: !pola.plecZImieniaNote.hidden, tekst: pola.plecZImieniaNote.textContent, uwaga: pola.plecZImieniaNote.klasy.has('vild-dob-error') }),
  };
}

describe('formularz — nowy pacjent: płeć z nazwiska i imienia po wyjściu z pola', () => {
  it('„Testowska” → Kobieta z notką; potem „Anna” → notka „imienia i nazwiska”; płeć zmieniona zdarzeniami input/change', () => {
    const f = formularz();
    f.wpisz('lastName', 'Testowska');
    expect(f.pola.sex.value).toBe('F');
    expect(f.M.stan()).toBe('automat');
    expect(f.notka()).toEqual({ widoczna: true, uwaga: false, tekst: 'Płeć ustawiona na podstawie nazwiska „Testowska” — sprawdź.' });
    expect(f.pola.sex.wyslane, 'jak wybór z listy: input, potem change (programowe)').toEqual([['input', false], ['change', false]]);
    f.wpisz('firstName', 'Anna');
    expect(f.pola.sex.value).toBe('F');
    expect(f.notka().tekst).toBe('Płeć ustawiona na podstawie imienia i nazwiska — sprawdź.');
    expect(f.pola.plecZImieniaNote.title).toContain('5000');
    expect(f.pola.plecZImieniaNote.title).toContain('Słownik syntetyczny (test)');
  });

  it('„Jan” przy domyślnym M: płeć bez zmiany wartości, ale z notką, skąd jest', () => {
    const f = formularz();
    f.wpisz('firstName', 'Jan');
    expect(f.pola.sex.value).toBe('M');
    expect(f.pola.sex.wyslane, 'ta sama wartość — bez zdarzeń').toEqual([]);
    expect(f.M.stan()).toBe('automat');
    expect(f.notka().tekst).toBe('Płeć ustawiona na podstawie imienia „Jan” — sprawdź.');
  });

  it('automat idzie za poprawką imienia, dopóki lekarz sam nie wybierze płci', () => {
    const f = formularz();
    f.wpisz('firstName', 'Anna');
    expect(f.pola.sex.value).toBe('F');
    f.wpisz('firstName', 'Jan');
    expect(f.pola.sex.value).toBe('M');
    f.wpisz('firstName', 'Xyzabc');
    expect(f.pola.sex.value, 'imię nieznane nie cofa decyzji').toBe('M');
    expect(f.notka()).toEqual({ widoczna: true, uwaga: true, tekst: 'Sprawdź płeć: imienia „Xyzabc” nie ma w słowniku.' });
  });

  it('pisanie (input bez change) niczego nie rozstrzyga — decyzja dopiero po wyjściu z pola', () => {
    const f = formularz();
    f.pola.firstName.value = 'An';
    f.pola.firstName.dispatchEvent({ type: 'input', isTrusted: true });
    f.tick();
    expect(f.pola.sex.value).toBe('M');
    expect(f.notka().widoczna).toBe(false);
  });

  it('wybór lekarza wygrywa: po ręcznym wyborze automat nie zmienia płci, tylko ostrzega o rozbieżności', () => {
    const f = formularz();
    f.wpisz('firstName', 'Anna');
    f.wybierz('M');
    expect(f.M.stan()).toBe('lekarz');
    expect(f.notka()).toEqual({ widoczna: true, uwaga: true, tekst: 'Sprawdź płeć: imię „Anna” jest zwykle żeńskie.' });
    f.wpisz('firstName', 'Ewa');
    expect(f.pola.sex.value, 'dotąd automat; teraz wybór lekarza zostaje').toBe('M');
    expect(f.notka().tekst).toBe('Sprawdź płeć: imię „Ewa” jest zwykle żeńskie.');
    f.wybierz('F');
    expect(f.notka().widoczna, 'zgodny wybór lekarza — notka znika').toBe(false);
  });

  it('wyczyszczenie imienia i nazwiska przez lekarza: automat znów może działać; własny wybór lekarza zostaje', () => {
    const f = formularz();
    f.wpisz('firstName', 'Anna');
    f.wpisz('firstName', '');
    expect(f.M.stan()).toBe('domyslna');
    expect(f.pola.sex.value, 'bez cichej zmiany').toBe('F');
    expect(f.notka().widoczna).toBe(false);
    f.wpisz('firstName', 'Jan');
    expect(f.pola.sex.value).toBe('M');
    f.wybierz('F');
    f.wpisz('firstName', '');
    expect(f.M.stan()).toBe('lekarz');
  });

  it('imię niejednoznaczne bez nazwiska: płeć bez zmian i ostrzeżenie; z nazwiskiem -ska — płeć z nazwiska', () => {
    const f = formularz();
    f.wpisz('firstName', 'Sasza');
    expect(f.pola.sex.value).toBe('M');
    expect(f.notka()).toEqual({ widoczna: true, uwaga: true, tekst: 'Sprawdź płeć: imię „Sasza” noszą kobiety i mężczyźni.' });
    f.wpisz('lastName', 'Testowska');
    expect(f.pola.sex.value).toBe('F');
    expect(f.notka().tekst).toBe('Płeć ustawiona na podstawie nazwiska „Testowska” — sprawdź.');
  });

  it('imię i nazwisko sprzeczne: decyduje imię, notka mówi o nazwisku', () => {
    const f = formularz();
    f.wpisz('lastName', 'Testowska');
    expect(f.pola.sex.value).toBe('F');
    f.wpisz('firstName', 'Jan');
    expect(f.pola.sex.value).toBe('M');
    expect(f.notka()).toEqual({ widoczna: true, uwaga: true, tekst: 'Płeć ustawiona na podstawie imienia „Jan”, ale nazwisko „Testowska” ma formę żeńską — sprawdź.' });
  });

  it('bez pliku danych działa tylko reguła nazwiska; imię nie daje ostrzeżeń', () => {
    const f = formularz({ zrodla: null });
    f.wpisz('firstName', 'Anna');
    expect(f.pola.sex.value).toBe('M');
    expect(f.notka().widoczna).toBe(false);
    f.wpisz('lastName', 'Testowska');
    expect(f.pola.sex.value).toBe('F');
  });
});

describe('formularz — czego automat nie rusza', () => {
  it('pacjent z kartoteki (blokada tożsamości) albo wyłączone pole płci: brak zmian i brak notki', () => {
    const f = formularz({ blokada: true });
    f.wpisz('firstName', 'Anna');
    expect(f.pola.sex.value).toBe('M');
    expect(f.notka().widoczna).toBe(false);
    const g = formularz();
    g.pola.sex.disabled = true;
    g.wpisz('firstName', 'Anna');
    expect(g.pola.sex.value).toBe('M');
    expect(g.notka().widoczna).toBe(false);
  });

  it('blokada po pierwszym zapisie chowa notkę (vilda:tozsamosc-zmiana)', () => {
    const f = formularz();
    f.wpisz('firstName', 'Anna');
    expect(f.notka().widoczna).toBe(true);
    f.stanBlokady.tak = true;
    f.win.document.dispatchEvent({ type: 'vilda:tozsamosc-zmiana', detail: { zablokowane: true } });
    f.tick();
    expect(f.notka().widoczna).toBe(false);
  });

  it('odtworzenie po F5 i lustro innej strony: płeć z zewnątrz jest nietykalna, rozbieżność tylko ostrzega', () => {
    ['__vildaPersistRestoring', '__vildaLustroWpis'].forEach((flaga) => {
      const f = formularz();
      f.zZewnatrz({ nazwisko: 'Fikcyjna', imie: 'Anna', plec: 'M' }, flaga);
      expect(f.M.stan(), flaga).toBe('zewnetrzna');
      expect(f.pola.sex.value).toBe('M');
      expect(f.notka(), `${flaga}: rozbieżność widoczna od razu`).toEqual({ widoczna: true, uwaga: true, tekst: 'Sprawdź płeć: imię „Anna” jest zwykle żeńskie.' });
      f.wpisz('firstName', 'Ewa');
      expect(f.pola.sex.value, `${flaga}: automat nie zmienia płci z zewnątrz`).toBe('M');
    });
  });

  it('zdarzenia programowe na polach tożsamości bez flag (P-SPLIT przy pisaniu) nie są „zewnętrzne”', () => {
    const f = formularz();
    f.pola.name.value = 'Testowska';
    f.pola.name.dispatchEvent({ type: 'input', isTrusted: false });
    f.pola.firstName.value = 'Anna';
    f.pola.firstName.dispatchEvent({ type: 'change', isTrusted: false });
    f.tick();
    expect(f.M.stan()).toBe('domyslna');
    expect(f.pola.sex.value, 'zdarzenie programowe nie uruchamia automatu').toBe('M');
  });

  it('„Wyczyść” (vilda:user-state-cleared) zaczyna od nowa: stan domyślny, notka schowana', () => {
    const f = formularz();
    f.wpisz('firstName', 'Anna');
    f.wybierz('M');
    f.wyczysc();
    expect(f.M.stan()).toBe('domyslna');
    expect(f.notka().widoczna).toBe(false);
    f.wpisz('firstName', 'Ewa');
    expect(f.pola.sex.value).toBe('F');
  });

  it('wczytanie albo zapis pacjenta z wypełnioną tożsamością: płeć z kartoteki', () => {
    const f = formularz();
    f.pola.lastName.value = 'Fikcyjna';
    f.pola.firstName.value = 'Anna';
    f.pola.sex.value = 'M';
    f.win.document.dispatchEvent({ type: 'vilda:patient-loaded' });
    f.tick();
    expect(f.M.stan()).toBe('zewnetrzna');
  });

  it('strona bez pól imienia i płci (np. klirens): brak nasłuchów, brak wyjątku', () => {
    const f = formularz({ bez: ['firstName', 'sex'] });
    expect(f.M.__init).toBe(true);
    expect(f.sluchacze.doc).toEqual([]);
    expect(f.sluchacze.win).toEqual([]);
  });
});

/* ---------------------------------------------------------------- generator słownika */

describe('generator słownika (tests/scripts/imiona-pesel.mjs) na syntetycznych plikach CSV', () => {
  it('czyta oba formaty (przecinek z kolumną płci i BOM; średnik bez kolumny płci, liczba ze spacją)', () => {
    const z = czytajListe(fixture('syntetyczne-zenskie.csv'), 'F');
    expect(z.wiersze[0]).toEqual({ imie: 'ANNA', liczba: 5000 });
    expect(z.wiersze.find((w) => w.imie === 'ANNA-MARIA')).toEqual({ imie: 'ANNA-MARIA', liczba: 25 });
    expect(z.plik.sha256).toMatch(/^[0-9a-f]{64}$/);
    const m = czytajListe(fixture('syntetyczne-meskie.csv'), 'M');
    expect(m.wiersze[0]).toEqual({ imie: 'JAN', liczba: 4000 });
  });

  it('kolumna płci niezgodna z rolą pliku → błąd (pomylone pliki)', () => {
    expect(() => czytajListe(fixture('syntetyczne-meskie-z-plcia.csv'), 'F')).toThrow(/płeć/);
    expect(czytajListe(fixture('syntetyczne-meskie-z-plcia.csv'), 'M').wiersze).toEqual([{ imie: 'JAN', liczba: 4000 }]);
  });

  it('sumuje po kluczu silnika, odcina imiona poniżej progu, zapis jest deterministyczny i daje się wczytać', () => {
    const z = zbudujZrodlo({
      kobiety: fixture('syntetyczne-zenskie.csv'), mezczyzni: fixture('syntetyczne-meskie.csv'),
      stanNa: '2026-01-01', adres: 'https://dane.gov.pl/pl/dataset/test',
    });
    expect(z.imiona).toEqual({
      anna: [5025, 3], ewa: [3000, 0], jan: [0, 4000], nikola: [950, 50], piotr: [1, 3000], sasza: [40, 60], 'łukasz': [0, 900],
    });
    expect(z.minLiczba).toBe(20);
    expect(z.liczbaImion).toBe(7);
    expect(z.id).toBe('PESEL-2026-01-01');
    expect(z.pliki.map((p) => p.plec)).toEqual(['F', 'M']);
    const tresc = trescPliku(z);
    expect(trescPliku(z)).toBe(tresc);
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'imiona-pesel-')), 'dane.js');
    fs.writeFileSync(tmp, tresc);
    const rej = wczytajPlikDanych(tmp);
    expect(Object.keys(rej)).toEqual(['PESEL-2026-01-01']);
    expect(rej['PESEL-2026-01-01'].imiona.anna).toEqual([5025, 3]);
    expect(P().ocenImie('Anna', rej['PESEL-2026-01-01']).plec).toBe('F');
  });

  it('bez daty stanu albo adresu zbioru generator odmawia', () => {
    const wej = { kobiety: fixture('syntetyczne-zenskie.csv'), mezczyzni: fixture('syntetyczne-meskie.csv') };
    expect(() => zbudujZrodlo({ ...wej, adres: 'x' })).toThrow(/stan-na/);
    expect(() => zbudujZrodlo({ ...wej, stanNa: '2026-01-01' })).toThrow(/adres/);
  });
});

/* ---------------------------------------------------------------- prawdziwy plik danych i okablowanie */

describe('plik danych vilda_imiona_plec_dane.js (rejestr PESEL)', () => {
  // Odczyt w testach, nie przy zbieraniu — brak pliku ma być czerwonym testem, a nie wywrotką pliku.
  const zrodla = () => Object.values(wczytajPlikDanych());

  it('rejestruje jedno źródło PL z metadanymi: zbiór, wydawca, stan, adres na dane.gov.pl, SHA-256 obu plików', () => {
    expect(zrodla()).toHaveLength(1);
    const z = zrodla()[0];
    expect(z.kraj).toBe('PL');
    expect(z.wydawca).toBe('Ministerstwo Cyfryzacji');
    expect(z.zbior).toBe('Lista imion występujących w rejestrze PESEL');
    expect(z.stanNa).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(z.id).toBe(`PESEL-${z.stanNa}`);
    expect(z.adres).toMatch(/^https:\/\/dane\.gov\.pl\//);
    expect(z.pliki.map((p) => p.plec)).toEqual(['F', 'M']);
    z.pliki.forEach((p) => expect(p.sha256).toMatch(/^[0-9a-f]{64}$/));
    expect(z.minLiczba).toBe(20);
  });

  it('wpisy: klucze posortowane i znormalizowane jak w silniku, liczby całkowite, każde imię ≥ minLiczba osób', () => {
    const z = zrodla()[0];
    const S = P();
    const klucze = Object.keys(z.imiona);
    expect(klucze.length).toBe(z.liczbaImion);
    expect(klucze.length).toBeGreaterThan(1000);
    expect([...klucze].sort()).toEqual(klucze);
    klucze.forEach((k) => {
      expect(S.kluczImienia(k), k).toBe(k);
      const [kob, mez] = z.imiona[k];
      expect(Number.isInteger(kob) && Number.isInteger(mez) && kob >= 0 && mez >= 0, k).toBe(true);
      expect(kob + mez, k).toBeGreaterThanOrEqual(z.minLiczba);
    });
  });

  it('przypadki syntetyczne (wejście → oczekiwana płeć) na prawdziwym słowniku', () => {
    const z = zrodla()[0];
    const S = P();
    const plec = (imie) => S.ocenImie(imie, z).plec;
    ['Anna', 'Maria', 'Katarzyna', 'Zuzanna', 'Julia', 'Noemi', 'Miriam', 'Beatrycze'].forEach((i) => expect(plec(i), i).toBe('F'));
    ['Jan', 'Piotr', 'Jakub', 'Antoni', 'Barnaba', 'Kosma', 'Bonawentura'].forEach((i) => expect(plec(i), i).toBe('M'));
    expect(plec('Lukasz'), 'bez polskich znaków').toBe('M');
  });
});

describe('okablowanie: obie strony formularza głównego, service worker; klirens bez zmian', () => {
  const index = zrodlo('index.html');
  const docpro = zrodlo('docpro.html');

  it('index.html i docpro.html ładują dane, potem moduł, po vilda_pola_tozsamosci.js; notka pod polem płci', () => {
    [index, docpro].forEach((h) => {
      const tozsamosc = h.indexOf('vilda_pola_tozsamosci.js?v=');
      const dane = h.indexOf('vilda_imiona_plec_dane.js?v=');
      const modul = h.indexOf('vilda_plec_z_imienia.js?v=');
      expect(tozsamosc).toBeGreaterThan(-1);
      expect(dane).toBeGreaterThan(tozsamosc);
      expect(modul).toBeGreaterThan(dane);
      const plec = h.indexOf('<select id="sex"');
      const notka = h.indexOf('<div id="plecZImieniaNote" class="vild-dob-note" role="status" aria-live="polite" hidden></div>');
      expect(notka).toBeGreaterThan(plec);
      expect(notka - plec).toBeLessThan(600);
    });
  });

  it('service worker zna oba pliki', () => {
    const sw = zrodlo('service-worker-kalorii.js');
    expect(sw).toMatch(/'\/vilda_imiona_plec_dane\.js\?v=\d+',/);
    expect(sw).toMatch(/'\/vilda_plec_z_imienia\.js\?v=\d+',/);
  });

  it('kalkulator klirensu nie ładuje modułu (decyzja właściciela: klirensu nie ruszać)', () => {
    const klirens = zrodlo('kalkulator-klirens.html');
    expect(klirens).not.toContain('vilda_plec_z_imienia.js');
    expect(klirens).not.toContain('vilda_imiona_plec_dane.js');
  });
});
