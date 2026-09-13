import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// ADV-REPORT-1 (decyzja właściciela 2026-09-13). Raport wzrastania nie miał dotąd
// ŻADNEGO testu. Ten plik pokrywa trzy usterki etapu 1:
//  1. tabela raportu czyta świeże pola formularza, a prognozy pamięć ostatniego
//     przeliczenia karty — po zmianie danych bez „Oblicz" wydruk łączył nowe pomiary
//     ze starymi prognozami i nic tego nie sygnalizowało;
//  2. punkt aktualny dublował wiersz historyczny o tym samym wieku, bo deduplikacja
//     wymagała ZGODNOŚCI wieku, wzrostu i wagi naraz;
//  3. getAgeDecimal() zwraca 0 przy pustych polach wieku, więc raport dostawał punkt
//     „0 lat 0 mies. (akt.)" z bieżącym wzrostem.
// Testy wołają PRAWDZIWE funkcje produkcyjne przez zamrożone API modułu.
// Dane wyłącznie FIKCYJNE.

const FIELDS = {
  sex: 'M', age: '9', ageMonths: '8', height: '129.5', weight: '27.6',
  advBoneAge: '7.5', advMotherHeight: '170', advFatherHeight: '170',
  advTesticularVolume: '', advFamilyDelayedPuberty: '', advGrowthExclusion: '',
};

let win;
let fields;
let rows;

function makeDoc() {
  return {
    getElementById(id) {
      if (!Object.prototype.hasOwnProperty.call(fields, id)) return null;
      return { get value() { return fields[id]; }, set value(v) { fields[id] = v; } };
    },
  };
}

beforeEach(() => {
  fields = { ...FIELDS };
  rows = [];
  globalThis.document = makeDoc();
  globalThis.collectAdvancedMeasurements = () => rows.map((r, i) => ({ ...r, domIndex: i }));
  globalThis.getAgeDecimal = () => {
    const y = parseFloat(fields.age); const m = parseFloat(fields.ageMonths);
    return (Number.isFinite(y) ? y : 0) + (Number.isFinite(m) ? m / 12 : 0);
  };
  globalThis.advHistoryGetPreferredSource = () => 'OLAF';
  win = loadBrowserScript('vilda_advanced_growth.js', {});
});

afterEach(() => {
  delete globalThis.document;
  delete globalThis.collectAdvancedMeasurements;
  delete globalThis.getAgeDecimal;
  delete globalThis.advHistoryGetPreferredSource;
});

const api = () => win.VildaAdvancedGrowth;

describe('Raport wzrastania — odcisk wejścia prognoz', () => {
  it('ten sam formularz daje ten sam odcisk, zmiana dowolnego pola prognostycznego go zmienia', () => {
    const fp = api().advGrowthBuildCalculationFingerprint;
    const base = fp();
    expect(typeof base).toBe('string');
    expect(fp()).toBe(base); // stabilny, bez znacznika czasu
    for (const [id, val] of [['height', '131.0'], ['advBoneAge', '8.5'], ['advMotherHeight', '168'], ['sex', 'F']]) {
      const prev = fields[id];
      fields[id] = val;
      expect(fp(), `zmiana pola ${id} musi zmienić odcisk`).not.toBe(base);
      fields[id] = prev;
    }
    expect(fp()).toBe(base);
  });

  it('dopisanie wiersza pomiarowego zmienia odcisk (tabela i prognozy zależą od historii)', () => {
    const fp = api().advGrowthBuildCalculationFingerprint;
    const base = fp();
    rows.push({ ageMonths: 78, height: 108.5, weight: 15.3, boneAgeYears: null });
    expect(fp()).not.toBe(base);
  });

  it('prognozy uznaje się za aktualne dopiero po zatwierdzeniu modelu z tego samego formularza', () => {
    const a = api();
    expect(a.advGrowthPredictionsMatchCurrentInput()).toBe(false); // nic nie policzono
    a.commitAdvancedGrowthDataPayload({ bayleyPinneau: { available: true } }, { global: win });
    expect(a.advGrowthPredictionsMatchCurrentInput()).toBe(true);
    fields.height = '131.0'; // lekarz poprawia wzrost i NIE klika „Oblicz"
    expect(a.advGrowthPredictionsMatchCurrentInput()).toBe(false);
  });
});

describe('Raport wzrastania — punkt aktualny w zestawie punktów', () => {
  it('puste pola wieku nie tworzą punktu „0 lat 0 mies. (akt.)"', () => {
    rows.push({ ageMonths: 78, height: 108.5, weight: 15.3 });
    fields.age = ''; fields.ageMonths = '';
    const pts = api().advGrowthCollectAllPointsForReport();
    expect(pts).toHaveLength(1);
    expect(pts.some((p) => p.pointType === 'current')).toBe(false);
    expect(pts.some((p) => p.ageMonths === 0)).toBe(false);
  });

  it('wiek 0 lat 0 mies. wpisany jawnie nadal daje punkt aktualny (noworodek to nie brak danych)', () => {
    rows.push({ ageMonths: 0, height: 52, weight: 3.4 });
    fields.age = '0'; fields.ageMonths = '0'; fields.height = '52'; fields.weight = '3.4';
    const pts = api().advGrowthCollectAllPointsForReport();
    expect(pts.some((p) => p.pointType === 'current' || p.isCurrentPoint === true)).toBe(true);
  });

  it('wiersz historyczny z samym wzrostem scala się z punktem aktualnym zamiast go dublować', () => {
    rows.push({ ageMonths: 78, height: 108.5, weight: 15.3 });
    rows.push({ ageMonths: 116, height: 129.5, weight: null }); // ten sam wiek co formularz, bez wagi
    const pts = api().advGrowthCollectAllPointsForReport();
    const at116 = pts.filter((p) => p.ageMonths === 116);
    expect(at116).toHaveLength(1);
    expect(at116[0].weight).toBe(27.6);      // waga z formularza uzupełniła wiersz
    expect(at116[0].isCurrentPoint).toBe(true); // oznaczony jako aktualny
    expect(at116[0].pointType).toBe('history'); // ale nadal liczy się jako punkt historyczny
  });

  it('sprzeczny pomiar w tym samym wieku zostawia oba wiersze — to dane do obejrzenia, nie duplikat', () => {
    rows.push({ ageMonths: 116, height: 124.0, weight: 27.6 }); // inny wzrost niż w formularzu
    const pts = api().advGrowthCollectAllPointsForReport();
    expect(pts.filter((p) => p.ageMonths === 116)).toHaveLength(2);
  });
});
