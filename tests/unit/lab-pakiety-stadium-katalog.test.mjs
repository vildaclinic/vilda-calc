import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// LAB-PAKIETY PR8 (decyzja właściciela z 2026-11-14): stadium w pakiecie, w którym dobiera ono tylko normy
// katalogu. Normy i reguły doboru zakresu zostają bez zmian — tutaj (1) przypadki „wejście → wynik” z katalogu,
// na których widać, że stadium zmienia normę IGF-1, IGFBP-3 i androstendionu, czyli po co pakietowi bez LH wiersz
// stadium i pytanie o dzień pobrania; (2) kontrakt strony: nośnik oceny pokwitania i lista badań, którym stadium
// dobiera normę. Przepływ w przeglądarce: tests/e2e/lab-pakiet-stadium-katalog*.spec.mjs. Dane wyłącznie FIKCYJNE.
const win = {};
for (const plik of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_range_snapshot.js', 'vilda_lab_packages.js']) loadBrowserScript(plik, win);
const Conv = win.LabUnitConverter, Model = win.VildaLabPackages;
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
const pakiety = readFileSync(new URL('../../vilda_lab_packages.js', import.meta.url), 'utf8');

const pacjent = (dane) => ({ cycle_phase: null, time_of_day: null, test_protocol: null, method: null, life_stage: dane.age >= 18 ? 'adult' : 'pediatric', ...dane });
const wiersz = (id, raw, unit, dane) => {
  const row = Model.evaluateRow({ converter: Conv, snapshot: win.VildaLabRangeSnapshot, data: win.LabUnitsData, analyteId: id, raw, unit,
    patient: pacjent(dane), capturedAtISO: '2026-06-17T10:00:00.000Z', own: '' });
  // Zakres ma twardą spację przed jednostką — tutaj zwykła, jak w tekście czytanym z karty wyniku.
  return [row.range.range.id, row.view.bounds.replace(/\u00a0/g, ' '), row.view.text];
};
const DZIEWCZYNKA = { sex: 'F', age: 10 + 1 / 12 }, CHLOPIEC = { sex: 'M', age: 12 + 3 / 12 };

describe('stadium dobiera normę katalogu (bez zmian w normach)', () => {
  it('IGF-1 65 nmol/L u dziewczynki 10 l 1 m: bez stadium w zakresie, dla Tanner II powyżej, dla Tanner III w zakresie', () => {
    expect(wiersz('igf1', '65', 'nmol/L', { ...DZIEWCZYNKA, tanner: null })).toEqual(['igf1_F_peripubertal_age', '15,5–76,8 nmol/L', 'w zakresie normy']);
    expect(wiersz('igf1', '65', 'nmol/L', { ...DZIEWCZYNKA, tanner: 2 })).toEqual(['igf1_F_tanner2', '15,5–59,1 nmol/L', 'powyżej normy']);
    expect(wiersz('igf1', '65', 'nmol/L', { ...DZIEWCZYNKA, tanner: 3 })).toEqual(['igf1_F_tanner3', '33,8–69,3 nmol/L', 'w zakresie normy']);
  });

  it('IGFBP-3 4 mg/L: bez stadium zakres ogólny dorosłych bez oceny dla dziecka, ze stadium — norma dla Tannera', () => {
    expect(wiersz('igfbp3', '4', 'mg/L', { ...DZIEWCZYNKA, tanner: null })).toEqual(['igfbp3_default', '2,6–8,6 mg/L', 'zakres ogólny — bez oceny dla dziecka']);
    expect(wiersz('igfbp3', '4', 'mg/L', { ...DZIEWCZYNKA, tanner: 2 })).toEqual(['igfbp3_tanner2', '2–5,8 mg/L', 'w zakresie normy']);
    expect(wiersz('igfbp3', '4', 'mg/L', { ...DZIEWCZYNKA, tanner: 3 })).toEqual(['igfbp3_tanner3', '2,5–7,5 mg/L', 'w zakresie normy']);
  });

  it('androstendion 2 nmol/L u chłopca 12 l 3 m: norma według wieku albo według Tannera', () => {
    expect(wiersz('androstenedione', '2', 'nmol/L', { ...CHLOPIEC, tanner: null })).toEqual(['a4_M_peripubertal_age', '1,08–4,89 nmol/L', 'w zakresie normy']);
    expect(wiersz('androstenedione', '2', 'nmol/L', { ...CHLOPIEC, tanner: 2 })).toEqual(['a4_M_tanner2', '1,08–2,27 nmol/L', 'w zakresie normy']);
    expect(wiersz('androstenedione', '2', 'nmol/L', { ...CHLOPIEC, tanner: 3 })).toEqual(['a4_M_tanner3', '1,74–3,49 nmol/L', 'w zakresie normy']);
  });

  it('TSH nie zależy od stadium — pakiet „Tarczyca” nie dostaje wiersza stadium', () => {
    const bez = wiersz('tsh', '2,1', 'mIU/L', { ...DZIEWCZYNKA, tanner: null });
    for (const tanner of [1, 2, 3, 4, 5]) expect(wiersz('tsh', '2,1', 'mIU/L', { ...DZIEWCZYNKA, tanner })).toEqual(bez);
  });

  it('katalog ma jedenaście badań z normą według Tannera poza LH i FSH, które pakiet ocenia silnikiem pokwitaniowym', () => {
    const zTannerem = win.LabUnitsData.list().filter((badanie) => (badanie.reference_ranges_si || []).some((zakres) => /tanner/i.test(JSON.stringify(zakres.when || {}))))
      .map((badanie) => badanie.id).filter((id) => !['lh', 'fsh'].includes(id));
    expect(zTannerem.sort()).toEqual(['androstenedione', 'dhea_s', 'dht', 'estradiol', 'estrone', 'igf1', 'igfbp3', 'oh17_pregnenolone', 'pregnenolone', 'shbg', 'testosterone_free']);
  });
});

describe('kontrakt strony i pakietu', () => {
  it('wiersz stadium bez badania pokwitaniowego niesie formularz ustawiony na nośnik; LH nie trafia do oceny pakietu', () => {
    const od = html.indexOf('    function packagePubertyPresentation(analyteIds) {');
    const opis = html.slice(od, html.indexOf('    // Edytor stadium pakietu', od));
    expect(od).toBeGreaterThan(-1);
    expect(html).toContain("var PACKAGE_STAGE_CARRIER = 'lh';");
    expect(opis).toContain('if (!out.stage) {');
    expect(opis).toContain('var carrier = tannerIds.length ? packagePubertySelect(PACKAGE_STAGE_CARRIER) : null;');
    expect(opis).toContain('if (carrier && !carrier.view.stage.hidden) {');
    expect(opis).toContain('packagePubertyStageAnalyte = PACKAGE_STAGE_CARRIER;');
    expect(opis).toContain('catalog: tannerIds };');
    // Nośnik służy tylko wierszowi stadium: ocenę badania strona liczy wyłącznie dla badania, o które pyta pakiet.
    expect(html).toContain("return selected.ui.getAssessment({ testKey: packagePubertyAnalyte, raw: String(raw == null ? '' : raw), unit: String(unit || '') });");
  });

  it('badania, którym stadium dobiera normę: tylko badania z normą katalogu, pytane bez stadium', () => {
    const od = html.indexOf('    function packageTannerAnalytes(analyteIds) {');
    const lista = html.slice(od, html.indexOf('\n    }\n', od));
    expect(od).toBeGreaterThan(-1);
    expect(lista).toContain('if (!substance || ownAssessmentKind({ id: id })) return false;');
    expect(lista).toContain('tannerMattersForPatient(substance, Object.assign({}, described.patient, { tanner: null }))');
  });

  it('notka w kroku „Pacjent” nazywa badania, którym stadium dobiera normę', () => {
    expect(pakiety).toContain("var STAGE_CATALOG_NOTE = 'Stadium dobiera normę według Tannera: ';");
    expect(pakiety).toContain("if (stage) notes.push(catalog.length ? STAGE_CATALOG_NOTE + catalog.join(', ') + '.' : STAGE_NOTE);");
    expect(Model.version).toBe('1.8.0');
  });
});
