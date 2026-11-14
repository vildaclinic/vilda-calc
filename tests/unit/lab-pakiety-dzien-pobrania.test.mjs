import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// LAB-PAKIETY PR7 (makieta i decyzje właściciela z 2026-11-14): ocena w dniu pobrania. Przy dacie pobrania
// wcześniejszej niż dziś pakiet ocenia wyniki dla wieku pacjenta z dnia pobrania (ukończone lata i miesiące
// z daty urodzenia), a stadium z karty stosuje dopiero po potwierdzeniu dla tego dnia. Silniki, normy i ich
// polityki zostają bez zmian: strona podaje formularzowi pacjenta „w dniu pobrania”, więc ocena jest tą, którą
// pojedyncze badanie dałoby pacjentowi w tym wieku. Tutaj: model pakietu na PRAWDZIWYCH silnikach i prawdziwej
// kopercie oceny — (1) koperta policzona dla dnia pobrania zapisuje się jako aktualna, policzona dla dziś przy
// innej dacie — jak dotąd jako wymagająca ponownej oceny; (2) wynik w dniu pobrania równa się wynikowi
// pojedynczego badania u pacjenta w tym wieku, także dla odniesienia przedpokwitaniowego LH; (3) opis daty
// i wieku; (4) kontrakt strony. Przepływ w przeglądarce: tests/e2e/lab-pakiet-dzien-pobrania*.spec.mjs.
// Dane wyłącznie FIKCYJNE.
const require = createRequire(import.meta.url);
const SILNIKI = {
  lh: [require('../../vilda_lab_puberty.js'), require('../../vilda_lab_puberty_data.js')],
  fsh: [require('../../vilda_lab_puberty.js'), require('../../vilda_lab_puberty_data.js')],
};
const Koperta = require('../../vilda_lab_snapshot.js');
const WidokOceny = require('../../vilda_lab_assessment_ui.js');
const Formularz = require('../../vilda_lab_puberty_ui.js');

const win = {};
for (const plik of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_range_snapshot.js', 'vilda_lab_packages.js']) loadBrowserScript(plik, win);
const Conv = win.LabUnitConverter, ZrzutNormy = win.VildaLabRangeSnapshot, Model = win.VildaLabPackages;
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
const pakiety = readFileSync(new URL('../../vilda_lab_packages.js', import.meta.url), 'utf8');
const CHWILA = '2026-06-17T10:00:00.000Z', DZIS = '2026-06-17', POBRANIE = '2026-06-06';

// Pola szybkiego formularza w stanie domyślnym pojedynczego badania (jak w lab-pakiety-pokwitanie.test.mjs).
const pola = (pacjent) => ({
  contextBasis: 'current-patient', referenceSelection: 'automatic', specimen: 'unknown', measurementKind: 'unknown',
  observationSource: 'provided', gnrha: 'unknown', sexSteroids: 'unknown', treatmentContext: 'unknown', preterm: 'unknown',
  reproductiveContext: 'unknown', kind: 'unspecified', stage: '', pubertyAppliesToCurrentContext: false, ...pacjent,
});
// Dziewczynka ur. 10.04.2019: dziś 7 l 2 m, w dniu pobrania (06.06.2026) 7 l 1 m.
// Stadium Th2 potwierdzone dla dnia pobrania to lokalna korekta formularza („lab-local”) — jak „Zmień ocenę”.
const W_DNIU_POBRANIA_TH2 = pola({ sex: 'F', ageYears: '7', ageMonths: '1', kind: 'Th', stage: '2', observationSource: 'lab-local', pubertyAppliesToCurrentContext: true });
// Stadium dzisiejszej wizyty przed potwierdzeniem: podane, ale nie dla tego dnia.
const W_DNIU_POBRANIA_CZEKA = pola({ sex: 'F', ageYears: '7', ageMonths: '1', kind: 'Th', stage: '2', assessedAt: DZIS, observationSource: 'visit',
  pubertyAppliesToCurrentContext: false, currentContextAvailable: true, pubertyObservationProvided: true });
const DZIS_TH2 = pola({ sex: 'F', ageYears: '7', ageMonths: '2', kind: 'Th', stage: '2', pubertyAppliesToCurrentContext: true });
const ocen = (kto) => (id, raw, unit) => {
  const [silnik, dane] = SILNIKI[id];
  return Koperta.create(silnik.evaluate(Formularz.buildInput(kto, { analyte: id, raw, unit }), dane));
};
const pacjentKatalogu = { sex: 'F', age: 7 + 1 / 12, tanner: 2, cycle_phase: null, time_of_day: null, test_protocol: null, method: null, life_stage: 'pediatric' };
const wiersz = (id, raw, unit, kto, extra = {}) => Model.evaluateRow({
  converter: Conv, snapshot: ZrzutNormy, data: win.LabUnitsData, analyteId: id, raw, unit, patient: pacjentKatalogu, capturedAtISO: CHWILA,
  own: 'puberty', assess: ocen(kto), assessmentUI: WidokOceny, ...extra,
});
const porownania = (row) => row.view.comparisons.map((p) => [p.key, p.title, p.label, p.range, p.status]);
const zapis = (row, extra) => Model.planSave({ rows: [row], patientId: 'fikcyjny-pacjent', dateISO: POBRANIE, todayISO: DZIS, comment: '',
  snapshot: ZrzutNormy, assessmentSnapshot: Koperta, ...extra });

describe('ocena policzona dla dnia pobrania', () => {
  it('LH u dziewczynki 7 l 1 m w dniu pobrania z potwierdzonym Th2: wiek z dnia pobrania w wejściu silnika, osie wieku i stadium', () => {
    const row = wiersz('lh', '0,6', 'IU/L', W_DNIU_POBRANIA_TH2);
    expect(row.assessment.status).toBe('recorded');
    expect(row.assessment.evaluation.input).toMatchObject({ analyte: 'lh', sex: 'F', contextBasis: 'current-patient', sampleDateISO: null,
      age: { years: 7, months: 1, precision: 'month' }, puberty: { kind: 'Th', stage: 2, appliesToCurrentContext: true, source: 'lab-local' } });
    expect(porownania(row)).toEqual([
      ['age', 'Dla wieku', 'Powyżej zakresu', '≤0,3', 'above'],
      ['stage', 'Dla stadium Th2', 'Nie przekracza górnej granicy', '≤4,1', 'within'],
    ]);
  });

  it('stadium z karty czeka na potwierdzenie: silnik dostaje je jako podane, ale nie dla tego dnia — ocena tylko według wieku', () => {
    const row = wiersz('lh', '0,6', 'IU/L', W_DNIU_POBRANIA_CZEKA);
    expect(row.assessment.evaluation.input.puberty).toMatchObject({ kind: 'Th', stage: 2, appliesToCurrentContext: false });
    expect(porownania(row)).toEqual([['age', 'Dla wieku', 'Powyżej zakresu', '≤0,3', 'above']]);
    // Podane, nieaktualne stadium nie staje się „brakiem stadium”: odniesienie przedpokwitaniowe nie wchodzi w jego miejsce.
    expect(row.assessment.evaluation.prepubertalLh.status).toBe('unavailable');
    expect(row.assessment.evaluation.prepubertalLh.reasonCodes).toEqual(['prepubertal_lh_stage_incompatible_or_unconfirmed']);
  });

  it('odniesienie przedpokwitaniowe LH działa dla wieku z dnia pobrania bez zmiany polityki: chłopiec 6 l 2 m, bez stadium, LH 0,4', () => {
    const chlopiec = pola({ sex: 'M', ageYears: '6', ageMonths: '2', currentContextAvailable: true, pubertyObservationProvided: false });
    const koperta = ocen(chlopiec)('lh', '0,4', 'IU/L');
    expect(koperta.evaluation.prepubertalLh).toMatchObject({ status: 'available', policyId: 'prepubertal-lh-clinical-orienting', policyVersion: '2026-10-25.1',
      comparison: { status: 'above' } });
    const widok = WidokOceny.buildView(koperta.evaluation, { compact: true });
    expect(widok.comparisons.filter((p) => p.key !== 'local').map((p) => [p.key, p.title, p.status])).toEqual([['prepubertal', 'Odniesienie przedpokwitaniowe', 'above']]);
    // Polityka w danych zostaje ta sama (bieżący kontekst pacjenta); pakiet podaje jej pacjenta w wieku z dnia pobrania.
    expect(SILNIKI.lh[1].prepubertalLhPolicy).toMatchObject({ version: '2026-10-25.1', contextBasis: 'current-patient', currentContextRequired: true });
  });
});

describe('zapis: ocena dla dnia pobrania jest aktualna, ocena dla dziś przy innej dacie — jak dotąd', () => {
  it('assessedForISO równe dacie pobrania: koperta zapisuje się jako aktualna i związana z dniem pobrania', () => {
    const row = wiersz('lh', '0,6', 'IU/L', W_DNIU_POBRANIA_TH2);
    const plan = zapis(row, { assessedForISO: POBRANIE });
    expect(plan.ok).toBe(true);
    const lab = plan.notes[0].labResult;
    expect(plan.notes[0].clinicalDateISO).toBe(POBRANIE);
    expect(lab).toMatchObject({ test: row.test, testKey: 'lh', value: '0,6', valueNum: 0.6, unit: 'IU/L' });
    expect(lab.assessment.status).toBe('recorded');
    expect(lab.assessment.reasonCodes).toEqual([]);
    expect(lab.assessment.evaluation).toEqual(row.assessment.evaluation);
    // To samo uzgodnienie, które robi okno przypięcia dla wyniku wpisanego w dniu pobrania.
    const przypiecie = { test: row.test, value: '0,6', assessment: Koperta.normalize(row.assessment), testKey: 'lh', valueNum: 0.6, unit: 'IU/L' };
    expect(lab).toEqual(Koperta.reconcile(przypiecie, przypiecie, POBRANIE, POBRANIE));
    // Ponowny odczyt z tą samą datą nie zmienia stanu; z inną — unieważnia, jak każdą zapisaną ocenę.
    expect(Koperta.reconcile(null, lab, null, POBRANIE).assessment.status).toBe('recorded');
    expect(Koperta.reconcile(null, lab, null, DZIS).assessment.status).toBe('invalidated');
  });

  it('bez assessedForISO (ocena dla dzisiejszego wieku, inna data pobrania — brak daty urodzenia): „wymaga ponownej oceny”, jak w PR6', () => {
    const row = wiersz('lh', '0,6', 'IU/L', DZIS_TH2);
    const lab = zapis(row).notes[0].labResult;
    expect(lab.assessment.status).toBe('invalidated');
    expect(lab.assessment.reasonCodes).toEqual(['result_or_clinical_date_changed']);
    const dzis = zapis(row, { assessedForISO: DZIS }).notes[0].labResult;
    expect(dzis).toEqual(lab);
  });

  it('data sprzed urodzenia wstrzymuje zapis i kopiowanie', () => {
    const row = wiersz('lh', '0,6', 'IU/L', W_DNIU_POBRANIA_TH2);
    const blad = 'Data pobrania jest wcześniejsza niż data urodzenia pacjenta.';
    expect(zapis(row, { assessedForISO: POBRANIE, dateError: blad })).toEqual({ ok: false, error: blad, notes: [], rows: [] });
    expect(Model.buildCopyText({ rows: [row], dateISO: POBRANIE, todayISO: DZIS, dateError: blad })).toMatchObject({ ok: false, error: blad, text: '' });
    expect(Model.buildCopyText({ rows: [row], dateISO: POBRANIE, todayISO: DZIS }).text).toBe(
      'Badania (pobranie 06.06.2026):\nLH: 0,6 IU/L — dla wieku: powyżej zakresu (≤0,3); dla stadium Th2: nie przekracza górnej granicy (≤4,1)');
  });
});

describe('opis dnia pobrania', () => {
  it('wiek słowami', () => {
    expect(Model.ageWords({ years: 7, months: 1 })).toBe('7 lat i 1 mies.');
    expect(Model.ageWords({ years: 1, months: 0 })).toBe('1 rok');
    expect(Model.ageWords({ years: 2, months: 11 })).toBe('2 lata i 11 mies.');
    expect(Model.ageWords({ years: 12, months: 0 })).toBe('12 lat');
    expect(Model.ageWords({ years: 22, months: 3 })).toBe('22 lata i 3 mies.');
    expect(Model.ageWords({ years: 0, months: 5 })).toBe('5 mies.');
    expect(Model.ageWords({ years: 0, months: 0 })).toBe('poniżej 1 mies.');
    expect(Model.ageWords(null)).toBe('');
    expect(Model.ageWords({ years: 7 })).toBe('');
  });

  it('zdanie przy dacie pobrania: kiedy, wiek w dniu pobrania i — gdy inny — wiek dziś', () => {
    const dated = (extra) => ({ mode: 'dated', dateISO: POBRANIE, daysAgo: 11, age: { years: 7, months: 1 }, today: { years: 7, months: 2 }, ...extra });
    expect(Model.describeSample(dated())).toEqual({ before: 'Pobranie 11 dni temu. Aplikacja ocenia wyniki dla wieku w dniu pobrania: ',
      age: '7 lat i 1 mies.', after: ' (dziś 7 lat i 2 mies.).' });
    // Ten sam wiek co dziś: bez nawiasu; wiek kończący się skrótem zamyka zdanie własną kropką.
    expect(Model.describeSample(dated({ daysAgo: 1, today: { years: 7, months: 1 } }))).toEqual({
      before: 'Pobranie wczoraj. Aplikacja ocenia wyniki dla wieku w dniu pobrania: ', age: '7 lat i 1 mies.', after: '' });
    expect(Model.describeSample(dated({ age: { years: 12, months: 0 }, today: { years: 12, months: 0 } })).after).toBe('.');
    expect(Model.describeSample(dated({ age: { years: 12, months: 0 }, today: { years: 12, months: 1 } })).after).toBe(' (dziś 12 lat i 1 mies.).');
    expect(Model.describeSample(dated({ daysAgo: 120, dateISO: '2026-02-17', age: { years: 6, months: 10 }, today: null })).before)
      .toBe('Pobranie 17.02.2026. Aplikacja ocenia wyniki dla wieku w dniu pobrania: ');
    // Bez oceny w dniu pobrania (dziś, brak daty urodzenia, data sprzed urodzenia) zdania nie ma.
    for (const mode of ['today', 'no-birth-date', 'before-birth']) expect(Model.describeSample(dated({ mode }))).toBeNull();
    expect(Model.describeSample(dated({ age: null }))).toBeNull();
  });
});

describe('kontrakt strony i pakietu', () => {
  it('niewidoczna instancja formularza czyta pacjenta „w dniu pobrania”, a pojedyncze badanie — jak dotąd', () => {
    expect(html).toContain('return packageSampleAdjust(readPubertyPatientContextFor(packagePubertyAnalyte ? Conv.find(packagePubertyAnalyte) : null));');
    expect(html).toContain('readPatientContext: readPubertyPatientContext,');
    expect(html.match(/packageSampleAdjust\(/g)).toHaveLength(3); // definicja, formularz pakietu, nośnik wieku estradiolu w pakiecie
    expect(html).toContain("setSampleDate: function (dateISO, todayISO) { return packageSampleView(packageSampleSet(dateISO, todayISO)); },");
    expect(html).toContain('confirmStage: function () { return packagePubertyConfirmStage(false); },');
  });

  it('pakiet pyta stronę o dzień pobrania przed oceną i przed zapisem, a bez tej funkcji działa jak dotąd', () => {
    expect(pakiety).toContain("state.sample = view && typeof view === 'object' && typeof view.mode === 'string' ? view : { mode: 'today', dateISO: null };");
    expect(pakiety).toContain("assessedForISO: sample.mode === 'dated' ? sample.dateISO : today(), dateError: sampleDateError()");
    expect(pakiety.match(/syncSample\(\);/g).length).toBeGreaterThanOrEqual(3); // odświeżenie, zapis, kopiowanie
  });

  it('silniki i polityki zostają bez zmian: pakiet nie wysyła im daty próbki', () => {
    expect(html).not.toContain("contextBasis: 'sample'");
    expect(pakiety).not.toContain('sampleDateISO:');
  });
});
