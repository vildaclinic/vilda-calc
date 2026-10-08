import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-ODTWORZ-WIEK (zgłoszenie właściciela 2026-10-08). Pacjent zapisany w wieku 16 lat 10 mies.,
// wczytany miesiąc później przez „Odtwórz zapis": formularz główny pokazywał 16 lat 11 mies.
// („Wiek na dzień dzisiejszej wizyty") i liczył centyle starego wzrostu i masy w nowym wieku,
// a Karta Pacjenta tego samego pacjenta — poprawnie — w wieku pomiaru (Rata B, P3).
//
// Testy wołają PRAWDZIWY moduł vilda_dob_age.js na atrapie DOM. „Dziś" ustawia zegar testu,
// daty budujemy konstruktorem lokalnym (strefa testów: Pacific/Chatham). Dane FIKCYJNE.

function atrapa(id) {
  const el = { id, value: '', readOnly: false, hidden: false, textContent: '', dataset: {}, classList: { toggle() {} }, nasluchy: {} };
  el.addEventListener = (n, f) => { (el.nasluchy[n] = el.nasluchy[n] || []).push(f); };
  el.dispatchEvent = (ev) => { (el.nasluchy[ev.type] || []).forEach((f) => f(ev)); return true; };
  el.focus = () => {};
  return el;
}

function srodowisko({ wybor = null, rekord = null } = {}) {
  const pola = {};
  ['dobInput', 'dobNote', 'dobError', 'dobClear', 'age', 'ageMonths', 'ageWeeks', 'ageWeeksRow', 'ageWeeksNote', 'ageWeeksError', 'restoreStateBtn']
    .forEach((id) => { pola[id] = atrapa(id); });
  pola.restoreStateBtn.style = { display: 'none' };
  const sesja = new Map();
  if (wybor) sesja.set('vildaLoadChoiceV1', wybor);
  const nasluchy = {};
  const win = {
    document: {
      readyState: 'complete',
      getElementById: (id) => pola[id] || null,
      addEventListener: (n, f) => { (nasluchy[n] = nasluchy[n] || []).push(f); },
    },
    Event: function (typ) { this.type = typ; },
    hasUserModifiedAfterLoad: false,
    setTimeout: (f) => f(),
    sessionStorage: {
      getItem: (k) => (sesja.has(k) ? sesja.get(k) : null),
      setItem: (k, v) => sesja.set(k, String(v)),
      removeItem: (k) => sesja.delete(k),
    },
    lastLoadedData: rekord,
  };
  loadBrowserScript('vilda_dob_age.js', win);
  const wyslij = (nazwa) => (nasluchy[nazwa] || []).forEach((f) => f({ type: nazwa }));
  return { win, pola, sesja, wyslij, D: win.VildaDobAge };
}

/* Rekord tak, jak zapisuje go formularz główny (kolektor): wiek z chwili zapisu i timestampISO. */
function rekordNastolatka(over = {}) {
  return {
    version: 1,
    timestampISO: new Date(2026, 5, 17, 15, 0).toISOString(),
    user: { age: 16, ageMonths: 10, sex: 'M', weight: 60, height: 172, firstName: 'Testowy', lastName: 'Fikcyjny', dobISO: '2009-07-20', ...over },
  };
}

describe('P-ODTWORZ-WIEK — wiek pomiaru zapisanego rekordu (czyste funkcje)', () => {
  const { D } = srodowisko();

  it('doba pomiaru: najpierw user.measuredAtISO (bez godziny, czytana lokalnie), potem timestampISO', () => {
    const zMiary = D.measurementDay({ timestampISO: '2026-07-01T10:00:00.000Z', user: { measuredAtISO: '2026-06-17' } });
    expect([zMiary.getFullYear(), zMiary.getMonth(), zMiary.getDate()]).toEqual([2026, 5, 17]);
    const zZapisu = D.measurementDay({ timestampISO: new Date(2026, 5, 17, 15, 0).toISOString(), user: {} });
    expect([zZapisu.getFullYear(), zZapisu.getMonth(), zZapisu.getDate(), zZapisu.getHours()]).toEqual([2026, 5, 17, 0]);
  });

  it('doba pomiaru: zły zapis albo nieistniejący dzień przechodzi do następnego źródła, brak obu → null', () => {
    const d = D.measurementDay({ timestampISO: new Date(2026, 5, 17, 15, 0).toISOString(), user: { measuredAtISO: '2026-02-31' } });
    expect([d.getMonth(), d.getDate()]).toEqual([5, 17]);
    expect(D.measurementDay({ timestampISO: 'nie-data', user: {} })).toBeNull();
    expect(D.measurementDay({ user: {} })).toBeNull();
    expect(D.measurementDay(null)).toBeNull();
  });

  it('wejście → wynik: zapis 17-06-2026 w wieku 16 l. 10 m. daje wiek POMIARU i dokładne doby z tamtego dnia', () => {
    const p = D.ageAtMeasurement(rekordNastolatka(), '2009-07-20');
    expect(p).toMatchObject({ years: 16, ageMonths: 10, totalMonths: 202 });
    // 20-07-2009 → 17-06-2026: 6176 dób (liczone niezależnie od modułu: różnica dat w UTC)
    const doby = (Date.UTC(2026, 5, 17) - Date.UTC(2009, 6, 20)) / 86400000;
    expect(doby).toBe(6176);
    expect(p.exact).toEqual({ days: 6176, weeks: Math.floor(6176 / 7) });
  });

  it('zapisany wiek ma pierwszeństwo przed datą urodzenia — jak Karta Pacjenta (Rata B)', () => {
    // Rekord zapisany ponownie po odtworzeniu: wiek starego pomiaru, data zapisu nowsza.
    const p = D.ageAtMeasurement(rekordNastolatka({ }), '2009-07-20');
    const ponownie = D.ageAtMeasurement({ ...rekordNastolatka(), timestampISO: new Date(2026, 6, 10, 9, 0).toISOString() }, '2009-07-20');
    expect(ponownie).toMatchObject({ years: 16, ageMonths: 10, totalMonths: 202 });
    expect(ponownie.exact, 'doba zapisu nie zgadza się z wiekiem — nie zgadujemy doby pomiaru').toBeNull();
    expect(p.exact).not.toBeNull();
  });

  it('rekord bez zapisanego wieku: wiek z daty urodzenia na dobę pomiaru, nigdy na dziś', () => {
    const p = D.ageAtMeasurement({ timestampISO: '2026-07-10T10:00:00.000Z', user: { dobISO: '2009-07-20', measuredAtISO: '2026-06-17' } }, '2009-07-20');
    expect(p).toMatchObject({ years: 16, ageMonths: 10, totalMonths: 202 });
    expect(p.exact.days).toBe(6176);
  });

  it('same lata bez miesięcy liczą się jak w Karcie (lata × 12); brak wieku i daty → null', () => {
    expect(D.ageAtMeasurement({ user: { age: 7, ageMonths: null } }, null)).toMatchObject({ years: 7, ageMonths: 0, totalMonths: 84 });
    expect(D.ageAtMeasurement({ user: { sex: 'M' } }, null)).toBeNull();
    expect(D.ageAtMeasurement({ user: { age: '', ageMonths: '' } }, null)).toBeNull();
    expect(D.ageAtMeasurement(null, '2009-07-20')).toBeNull();
  });

  it('niemowlę: tygodnie z doby pomiaru; bez zgodnej doby — tygodnie zapisane w rekordzie', () => {
    // Urodzone 19-05-2026, pomiar 16-06-2026 (28. doba, 4 tygodnie, 0 mies.)
    const rek = { timestampISO: new Date(2026, 5, 16, 12, 0).toISOString(), user: { age: 0, ageMonths: 0, ageWeeks: 4, dobISO: '2026-05-19' } };
    const p = D.ageAtMeasurement(rek, '2026-05-19');
    expect(p).toMatchObject({ totalMonths: 0, weeks: 4 });
    expect(p.exact).toEqual({ days: 28, weeks: 4 });
    const bezDoby = D.ageAtMeasurement({ user: { age: 0, ageMonths: 1, ageWeeks: 6 } }, '2026-05-19');
    expect(bezDoby).toMatchObject({ totalMonths: 1, weeks: 6, exact: null });
  });
});

describe('P-ODTWORZ-WIEK — formularz po „Odtwórz zapis"', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 10, 12, 0)); // 10-07-2026: z daty urodzenia 16 l. 11 m.
  });
  afterEach(() => { vi.useRealTimers(); });

  it('ZGŁOSZENIE: odtworzony zapis zostaje w wieku z dnia pomiaru, notka mówi to wprost', () => {
    const { pola, wyslij, D } = srodowisko({ wybor: 'restore', rekord: rekordNastolatka() });
    // restoreLoadedState wpisuje zapisany wiek bez zdarzeń, potem rozgłasza vilda:state-restored
    pola.age.value = '16'; pola.ageMonths.value = '10';
    wyslij('vilda:state-restored');

    expect(pola.dobInput.value).toBe('20-07-2009');
    expect(pola.dobInput.readOnly).toBe(true);
    expect(pola.age.value).toBe('16');
    expect(pola.ageMonths.value, 'dotąd 11 — wiek z daty urodzenia na dziś').toBe('10');
    expect(pola.age.readOnly).toBe(true);
    expect(pola.dobNote.textContent).toBe(
      'Z kartoteki. Pomiar z 17-06-2026 — wiek w dniu pomiaru: 16 lat 10 mies. (aktualnie pacjent ma 16 lat 11 mies.). '
      + 'Wiek na dziś liczy „Nowy pomiar”. Zmiana daty w Karcie Pacjenta.'
    );
    expect(pola.dobNote.textContent).not.toContain('mies..');
    expect(pola.dobNote.textContent).not.toContain('dzisiejszej wizyty');

    // Dokładny wiek dla siatek i tygodnie do zapisu — z doby pomiaru, nie z dzisiaj.
    expect(D.readExactAge()).toEqual({ totalMonths: 202, days: 6176, exactMonths: 6176 / 30.4375 });
    expect(D.readWeeks()).toBeNull();
  });

  it('KONTROLA: bez wyboru „Odtwórz" (nowe wczytanie, „Nowy pomiar") wiek liczy się na dziś', () => {
    for (const wybor of [null, 'new']) {
      const { pola, wyslij, D } = srodowisko({ wybor, rekord: rekordNastolatka() });
      wyslij('vilda:patient-loaded');
      expect(pola.ageMonths.value).toBe('11');
      expect(pola.dobNote.textContent).toBe('Z kartoteki. Wiek na dzień dzisiejszej wizyty: 16 lat 11 mies. Zmiana daty w Karcie Pacjenta.');
      expect(D.readExactAge().totalMonths).toBe(203);
    }
  });

  it('F5 po odtworzeniu (setFromSession) nie przestawia wieku na dzisiejszy', () => {
    const { pola, D } = srodowisko({ wybor: 'restore', rekord: rekordNastolatka() });
    pola.age.value = '16'; pola.ageMonths.value = '10';
    expect(D.setFromSession('2009-07-20', { zRekordu: true })).toBe(true);
    expect([pola.age.value, pola.ageMonths.value]).toEqual(['16', '10']);
    expect(D.readExactAge().days).toBe(6176);
  });

  it('cudzy wpis wieku przy odtworzonym zapisie wraca do wieku pomiaru', () => {
    const { pola, wyslij } = srodowisko({ wybor: 'restore', rekord: rekordNastolatka() });
    wyslij('vilda:state-restored');
    pola.ageMonths.value = '11';
    pola.ageMonths.dispatchEvent({ type: 'input' });
    expect(pola.ageMonths.value).toBe('10');
  });

  it('rekord zapisany dziś (wybór „restore" po własnym zapisie) dostaje zwykłą notkę dzisiejszej wizyty', () => {
    const dzis = { ...rekordNastolatka({ age: 16, ageMonths: 11 }), timestampISO: new Date(2026, 6, 10, 11, 0).toISOString() };
    const { pola, wyslij, D } = srodowisko({ wybor: 'restore', rekord: dzis });
    wyslij('vilda:patient-loaded');
    expect(pola.ageMonths.value).toBe('11');
    expect(pola.dobNote.textContent).toBe('Z kartoteki. Wiek na dzień dzisiejszej wizyty: 16 lat 11 mies. Zmiana daty w Karcie Pacjenta.');
    expect(D.readExactAge().totalMonths).toBe(203);
  });

  it('rekord zapisany ponownie po odtworzeniu: wiek pomiaru zostaje, dokładnego wieku nie zgadujemy', () => {
    const ponownie = { ...rekordNastolatka(), timestampISO: new Date(2026, 6, 9, 9, 0).toISOString() };
    const { pola, wyslij, D } = srodowisko({ wybor: 'restore', rekord: ponownie });
    wyslij('vilda:state-restored');
    expect(pola.ageMonths.value).toBe('10');
    expect(pola.dobNote.textContent).toBe(
      'Z kartoteki. Zapisany pomiar — wiek w dniu pomiaru: 16 lat 10 mies. (aktualnie pacjent ma 16 lat 11 mies.). '
      + 'Wiek na dziś liczy „Nowy pomiar”. Zmiana daty w Karcie Pacjenta.'
    );
    expect(D.readExactAge(), 'siatki wracają do wiersza ukończonego miesiąca z pól wieku').toBeNull();
  });

  it('niemowlę: tygodnie i dokładny wiek z dnia pomiaru, wiersz tygodni tylko do odczytu', () => {
    // Urodzona 19-05-2026, pomiar 16-06-2026 (28. doba); dziś 10-07-2026 to już 52. doba (1 mies.).
    const rek = { timestampISO: new Date(2026, 5, 16, 12, 0).toISOString(), user: { age: 0, ageMonths: 0, ageWeeks: 4, sex: 'F', dobISO: '2026-05-19' } };
    const { pola, wyslij, D } = srodowisko({ wybor: 'restore', rekord: rek });
    wyslij('vilda:state-restored');
    expect([pola.age.value, pola.ageMonths.value]).toEqual(['0', '0']);
    expect(pola.ageWeeksRow.hidden).toBe(false);
    expect(pola.ageWeeks.value).toBe('4');
    expect(pola.ageWeeks.readOnly).toBe(true);
    expect(pola.ageWeeksNote.textContent).toBe('4 tygodnie życia w dniu pomiaru.');
    expect(pola.dobNote.textContent).toContain('(aktualnie pacjentka ma 0 lat 1 mies.)');
    expect(D.readExactAge()).toEqual({ totalMonths: 0, days: 28, exactMonths: 28 / 30.4375 });
    expect(D.readWeeks()).toBe(4);
  });

  it('data dopisana w formularzu po zapisie wizyty bez daty: dziś zapisana wizyta dostaje wiek z tej daty na dziś', () => {
    // Zapis bez daty z ręcznym wiekiem 16/6; aplikacja po własnym zapisie ustawia wybór „restore".
    const bezDaty = { timestampISO: new Date(2026, 6, 10, 9, 0).toISOString(), user: { age: 16, ageMonths: 6, sex: 'M', height: 172, weight: 60 } };
    const { pola, D } = srodowisko({ wybor: 'restore', rekord: bezDaty });
    pola.age.value = '16'; pola.ageMonths.value = '6';
    pola.dobInput.value = '20-07-2009';
    pola.dobInput.dispatchEvent({ type: 'input' });
    expect([pola.age.value, pola.ageMonths.value]).toEqual(['16', '11']);
    expect(pola.dobNote.textContent).toBe('Wiek liczony z daty urodzenia na dzień wizyty: 16 lat 11 mies.');
    expect(D.readExactAge().totalMonths).toBe(203);
  });

  it('data dopisana w formularzu do odtworzonej starej wizyty bez daty: wiek z tej daty na dzień tamtego pomiaru', () => {
    const stary = { timestampISO: new Date(2026, 5, 17, 15, 0).toISOString(), user: { age: 16, ageMonths: 9, sex: 'M', height: 172, weight: 60 } };
    const { pola, D } = srodowisko({ wybor: 'restore', rekord: stary });
    pola.dobInput.value = '20-07-2009';
    pola.dobInput.dispatchEvent({ type: 'input' });
    expect([pola.age.value, pola.ageMonths.value]).toEqual(['16', '10']);
    expect(pola.dobNote.textContent).toBe('Pomiar z 17-06-2026 — wiek w dniu pomiaru: 16 lat 10 mies. (aktualnie pacjent ma 16 lat 11 mies.). Wiek na dziś liczy „Nowy pomiar”.');
    expect(D.readExactAge().days).toBe(6176);
  });

  it('wybór „restore" bez wczytanego rekordu niczego nie wymyśla — działa wiek na dziś', () => {
    const { pola, D } = srodowisko({ wybor: 'restore', rekord: null });
    D.setFromRecord('2009-07-20');
    expect(pola.ageMonths.value).toBe('11');
  });
});

describe('P-ODTWORZ-WIEK — „Odtwórz zapisany stan" ustawia wybór od chwili potwierdzenia', () => {
  const kod = readFileSync(path.join(repoRoot, 'vilda_data_import_export.js'), 'utf8');
  const rt = kod.slice(kod.indexOf('function rt(e){'), kod.indexOf('function Nt(e){'));

  it('wybór „restore" stoi PO pytaniu o niezapisane dane, a PRZED przeliczeniami karty wzrastania', () => {
    const wybor = 'try{a.sessionStorage&&a.sessionStorage.setItem("vildaLoadChoiceV1","restore")}catch{}';
    const pytanie = rt.indexOf('Czy na pewno chcesz przywr');
    const pierwszy = rt.indexOf(wybor);
    expect(pytanie).toBeGreaterThan(0);
    expect(pierwszy, 'wybór ustawiony na początku odtwarzania').toBeGreaterThan(pytanie);
    expect(pierwszy, 'przed przeliczeniem karty podstawowej').toBeLessThan(rt.indexOf('a.calculateBasicGrowth()'));
  });
});
