import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-GH-NOWY-POMIAR (2026-10-01). „Nowy pomiar” w oknie wyboru przy wczytaniu pacjenta przenosi bieżący pomiar
// poprzedniej wizyty do historii (`_ensureCurrentMeasurementInHistory`, vilda_data_import_export.js). Gdy z tego
// pomiaru powstał punkt terapii GH, wiersz ręczny w historii karty zaawansowanej chował wiersz punktu (reguła
// „wiersz ręczny wygrywa” w mostku), więc pomiar wyglądał jak ręczny, dawał się poprawiać bez punktu
// i trafiał do zapisu dwa razy.
//
// REGUŁA: bieżący pomiar NIE jest dopisywany do `advanced.data.measurements` jako nowy wpis, gdy punkt GH ma ten
// sam miesiąc wieku, wzrost w granicy ±0,11 cm i (jeżeli oba są podane) masę w granicy ±0,11 kg — dokładnie jak
// reguła ghReczny mostka. Istniejący wpis z tego samego miesiąca jest nadpisywany jak dotąd. Historia karty
// podstawowej (`growthBasic`) dostaje pomiar jak dotąd. Tę samą funkcję woła edycja pomiaru w „Szybkim pomiarze”
// (vilda_auth_ui.js) — reguła działa tam tak samo.
//
// Test woła PRAWDZIWĄ funkcję modułu na atrapie okna. Dane wyłącznie FIKCYJNE.

function modul() {
  const doc = {
    readyState: 'complete', addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  };
  const win = {
    document: doc, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { pathname: '/index.html' },
  };
  win.window = win; win.self = win; win.globalThis = win;
  loadBrowserScript('vilda_data_import_export.js', win);
  return win.VildaDataImportExport;
}

// Dziewczynka: wiersz ręczny 11 l. / 123,9 cm; bieżący pomiar wizyty 13 l. 1 mies. / 139,9 cm / 45 kg.
const RECZNY = { ageYears: 11, ageMonths: 132, height: 123.9, weight: 35 };
function rekord(punkty, biezacy = { age: 13, ageMonths: 1, height: 139.9, weight: 45 }) {
  return {
    user: { ...biezacy },
    advanced: { data: { measurements: [{ ...RECZNY }] } },
    ghTherapyPoints: punkty,
  };
}
const punkt = (zmiany = {}) => ({ id: 'gh-1', type: 'start', ageYears: 13, ageMonths: 1, height: 139.9, weight: 45, ...zmiany });
const historia = (r) => r.advanced.data.measurements.map((m) => `${m.ageMonths}m ${m.height}`);
const historiaPodst = (r) => r.growthBasic.data.measurements.map((m) => `${m.ageMonths}m ${m.height}`);

describe('P-GH-NOWY-POMIAR — „Nowy pomiar” nie dubluje w karcie zaawansowanej pomiaru, z którego powstał punkt GH', () => {
  const api = modul();

  it('funkcja jest dostępna w publicznym API modułu', () => {
    expect(typeof api._ensureCurrentMeasurementInHistory).toBe('function');
  });

  it('punkt z tego samego pomiaru: karta zaawansowana bez nowego wiersza, karta podstawowa z pomiarem jak dotąd', () => {
    const r = rekord([punkt()]);
    api._ensureCurrentMeasurementInHistory(r);
    expect(historia(r)).toEqual(['132m 123.9']);
    expect(historiaPodst(r)).toEqual(['157m 139.9']);
  });

  it('granica wzrostu jak w mostku: 0,10 cm różnicy — ten sam pomiar; 0,15 cm — inny pomiar', () => {
    const tenSam = rekord([punkt({ height: 140.0 })]);
    api._ensureCurrentMeasurementInHistory(tenSam);
    expect(historia(tenSam)).toEqual(['132m 123.9']);

    const inny = rekord([punkt({ height: 140.05 })]);
    api._ensureCurrentMeasurementInHistory(inny);
    expect(historia(inny)).toEqual(['132m 123.9', '157m 139.9']);
  });

  it('masa: inna masa (0,5 kg) — inny pomiar; punkt bez masy — porównanie samego wzrostu', () => {
    const innaMasa = rekord([punkt({ weight: 45.5 })]);
    api._ensureCurrentMeasurementInHistory(innaMasa);
    expect(historia(innaMasa)).toEqual(['132m 123.9', '157m 139.9']);

    const bezMasy = rekord([punkt({ weight: null })]);
    api._ensureCurrentMeasurementInHistory(bezMasy);
    expect(historia(bezMasy)).toEqual(['132m 123.9']);
  });

  it('inny miesiąc wieku punktu (13 l. 2 mies.) — pomiar trafia do historii jak dotąd', () => {
    const r = rekord([punkt({ ageMonths: 2 })]);
    api._ensureCurrentMeasurementInHistory(r);
    expect(historia(r)).toEqual(['132m 123.9', '157m 139.9']);
  });

  it('bez punktów GH albo z punktem bez wzrostu — zachowanie jak dotąd', () => {
    const bez = rekord([]);
    api._ensureCurrentMeasurementInHistory(bez);
    expect(historia(bez)).toEqual(['132m 123.9', '157m 139.9']);

    const brakListy = rekord(undefined);
    api._ensureCurrentMeasurementInHistory(brakListy);
    expect(historia(brakListy)).toEqual(['132m 123.9', '157m 139.9']);

    const bezWzrostu = rekord([punkt({ height: null })]);
    api._ensureCurrentMeasurementInHistory(bezWzrostu);
    expect(historia(bezWzrostu)).toEqual(['132m 123.9', '157m 139.9']);
  });

  it('wpis z tego samego miesiąca już w historii — nadpisany bieżącym pomiarem jak dotąd (zmiana dotyczy tylko dopisania)', () => {
    const r = rekord([punkt()]);
    r.advanced.data.measurements.push({ ageYears: 157 / 12, ageMonths: 157, height: 141.0, weight: 45 });
    api._ensureCurrentMeasurementInHistory(r);
    expect(historia(r)).toEqual(['132m 123.9', '157m 139.9']);
  });

  it('bieżący pomiar bez wzrostu (sama masa) — dopisany jak dotąd, punkt wymaga wzrostu', () => {
    const r = rekord([punkt()], { age: 13, ageMonths: 1, weight: 45 });
    api._ensureCurrentMeasurementInHistory(r);
    expect(historia(r)).toEqual(['132m 123.9', '157m null']);
  });
});
