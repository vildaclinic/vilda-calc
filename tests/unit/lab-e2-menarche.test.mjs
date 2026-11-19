import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { skrotDanychEstradiolu, skrotyDoboru, skrotyEstradioluBezZmian } from '../support/lab-selection-matrix.mjs';

// P-E2-MENARCHE (decyzje właściciela 2026-11-19): estradiol u dziewczynki poniżej 18 lat — zakresy dorosłej
// kobiety dopiero po 5 latach od menarche. Testy wywołują PRAWDZIWE dane (lab_units_data.js), silnik
// (lab_unit_converter.js), model pakietu (vilda_lab_packages.js) i funkcje strony wycięte z
// przelicznik-jednostek.html; nie mają własnej kopii reguły. Konteksty pacjentów wyłącznie FIKCYJNE.
function fixture(editDescriptor) {
  const win = {};
  loadBrowserScript('lab_units_data.js', win);
  if (editDescriptor) {
    const data = win.LabUnitsData;
    const descriptor = structuredClone(data.find('estradiol'));
    editDescriptor(descriptor);
    win.LabUnitsData = { ...data, find: (id) => id === 'estradiol' ? descriptor : data.find(id),
      list: () => data.list().map((item) => item.id === 'estradiol' ? descriptor : item) };
  }
  loadBrowserScript('lab_unit_converter.js', win);
  loadBrowserScript('vilda_lab_range_snapshot.js', win);
  loadBrowserScript('vilda_lab_packages.js', win);
  return win;
}
const win = fixture();
const Conv = win.LabUnitConverter;
const e2 = Conv.find('estradiol');
const polityka = e2.reference_selection_policy;
const baza = JSON.parse(readFileSync(new URL('../fixtures/lab-selection-inne-badania-baza.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');

const wybierz = (patient, converter = Conv) => converter.selectRange(converter.find('estradiol'), patient);
const ocen = (patient, value = 450, converter = Conv) => converter.evaluate('estradiol', { value, unit: 'pmol/L', patient });
const kontekst = (patient, id = 'estradiol', converter = Conv) => converter.referenceContext(id, patient);
// Dziewczynka tak, jak podaje ją strona: wiek jako przedział [age, ageUpperYears), etap życia z wieku.
const dziewczynka = (age, extra = {}) => ({ sex: 'F', age, life_stage: 'pediatric', ...extra });
const miesiac = 1 / 12;

const R1 = 'Od menarche: 5,0 lat (≥ 5) — zakresy estradiolu jak u dorosłej.';
const NAGLOWEK_NIELETNIA = 'Zakres estradiolu zależy od fazy cyklu. Poniżej dostępne warianty odniesienia.';
const NAGLOWEK_DOROSLA = 'Zakres estradiolu zależy od fazy cyklu lub menopauzy. Poniżej dostępne warianty odniesienia.';
const BRAK_DLA_KONTEKSTU = 'Brak zakresu estradiolu dla wskazanego kontekstu cyklu lub ciąży. Przeliczenie jednostek pozostaje dostępne.';
const FAZY = [
  ['follicular', 'e2_female_follicular', 70, 290],
  ['ovulation', 'e2_female_ovulation', 380, 1460],
  ['luteal', 'e2_female_luteal', 200, 770],
];
const CIAZA = ['pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3'];

function oczekujWariantowNieletniej(range) {
  expect(range).toMatchObject({ id: 'estradiol-matched-reference-only', low: null, high: null, no_interpretation: true,
    reference_unavailable: true, reference_context_required: true, matched: false, is_default: false, source_ids: [],
    context_pl: NAGLOWEK_NIELETNIA });
  expect(range.reference_variants.map((v) => [v.cycle_phase, v.id, v.low, v.high])).toEqual(FAZY);
  expect(range.reference_variants.map((v) => v.label)).toEqual(['Faza folikularna wczesna', 'Pik owulacyjny', 'Faza lutealna']);
}

describe('dane estradiolu: reguła jest w polityce deskryptora, stężenia bez zmian', () => {
  it('próg, granica wieku i lista wyborów nie dotyczących nieletnich są danymi', () => {
    expect(polityka).toMatchObject({ id: 'estradiol-matched-reference-only', version: '2026-11-19.1' });
    expect(polityka.chronological_age.adult_min_years).toBe(18);
    expect(polityka.gynecological_age).toMatchObject({
      id: 'e2-gynecological-age-qualification', when: { sex: 'F' }, menarche_key: 'menarche_age_years',
      menarche_min_years: 2, menarche_max_years: 20, adult_context_after_years: 5,
      contexts_not_applicable_below_adult_age: ['postmenopause'], pregnancy_contexts: CIAZA,
      context_pl: NAGLOWEK_NIELETNIA,
      basis_pl: 'Od menarche: {years} lat (≥ {threshold}) — zakresy estradiolu jak u dorosłej.',
    });
    // R9 (decyzja właściciela nr 5): granica wieku menarche dla reguły to OSOBNE pole — zakres poprawności wpisu (2–20) zostaje.
    expect(polityka.gynecological_age.adult_context_min_menarche_years).toBe(8);
    expect([polityka.gynecological_age.menarche_min_years, polityka.gynecological_age.menarche_max_years]).toEqual([2, 20]);
  });

  it('stężenia, wiersze, jednostki i dotychczasowe części polityki są takie jak w bazie (origin/audyt)', () => {
    expect(baza.baza.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(skrotDanychEstradiolu(Conv)).toBe(baza.daneEstradiolu);
    // Dorosła nadal ma cztery warianty i dotychczasowy nagłówek w danych.
    expect(polityka.adult_female_context.variants.map((v) => v.cycle_phase)).toEqual(['follicular', 'ovulation', 'luteal', 'postmenopause']);
    expect(polityka.adult_female_context.context_pl).toBe(NAGLOWEK_DOROSLA);
  });

  it('silnik czyta próg i listę wyborów z przekazanego deskryptora (bez liczby reguły w kodzie)', () => {
    const prog3 = fixture((d) => { d.reference_selection_policy.gynecological_age.adult_context_after_years = 3; }).LabUnitConverter;
    const trzyLata = dziewczynka(15, { menarche_age_years: 12 });
    expect(wybierz(trzyLata)).toMatchObject({ id: 'e2_F_latepubertal_age' });
    expect(wybierz(trzyLata, prog3)).toMatchObject({ reference_context_required: true, reference_basis: 'gynecological_age',
      reference_basis_pl: 'Od menarche: 3,0 lat (≥ 3) — zakresy estradiolu jak u dorosłej.' });
    const zPostmenopauza = fixture((d) => { d.reference_selection_policy.gynecological_age.contexts_not_applicable_below_adult_age = []; }).LabUnitConverter;
    const piecLat = dziewczynka(15, { menarche_age_years: 10 });
    expect(wybierz(piecLat, zPostmenopauza).reference_variants.map((v) => v.cycle_phase)).toEqual(['follicular', 'ovulation', 'luteal', 'postmenopause']);
    expect(kontekst(piecLat, 'estradiol', zPostmenopauza).phases).toEqual({});
    const bezReguly = fixture((d) => { delete d.reference_selection_policy.gynecological_age; }).LabUnitConverter;
    expect(wybierz(piecLat, bezReguly)).toMatchObject({ id: 'e2_F_latepubertal_age', low: 0, high: 290 });
    expect(kontekst(piecLat, 'estradiol', bezReguly)).toMatchObject({ policy_id: null, known_minor: false, phases: {} });
  });
});

describe('próg lat od menarche (liczony od dolnej granicy znanego wieku, bez zaokrąglania)', () => {
  it('4,99 roku → wiersz pediatryczny; 5,0 lat → obsługa jak u dorosłej', () => {
    const ponizej = dziewczynka(15, { tanner: 5, menarche_age_years: 10.01 });
    expect(kontekst(ponizej).years_since_menarche).toBeCloseTo(4.99, 10);
    expect(wybierz(ponizej)).toEqual(wybierz(dziewczynka(15, { tanner: 5 })));
    expect(wybierz(ponizej)).toMatchObject({ id: 'e2_F_tanner5', low: 0, high: 290, matched: true });
    expect(ocen(ponizej)).toMatchObject({ status: 'above', low: 0, high: 290 });
    oczekujWariantowNieletniej(wybierz(dziewczynka(15, { tanner: 5, menarche_age_years: 10 })));
  });

  it('cały znany wiek musi spełniać próg: [15, 16) z menarche 10,5 — nie; [15,5; 15,583) z 10,5 — tak', () => {
    const rok = dziewczynka(15, { ageUpperYears: 16, ageUpperInclusive: false, menarche_age_years: 10.5 });
    expect(wybierz(rok)).toMatchObject({ id: 'e2_F_latepubertal_age', low: 0, high: 290 });
    expect(kontekst(rok)).toMatchObject({ basis: 'chronological_age', life_stage: 'pediatric', years_since_menarche: 4.5 });
    const zMiesiacami = dziewczynka(15.5, { ageUpperYears: 15.5 + miesiac, ageUpperInclusive: false, menarche_age_years: 10.5 });
    oczekujWariantowNieletniej(wybierz(zMiesiacami));
    expect(kontekst(zMiesiacami)).toMatchObject({ basis: 'gynecological_age', life_stage: 'adult', years_since_menarche: 5 });
  });

  it('szum zmiennoprzecinkowy odejmowania nie odbiera progu (16,4 − 11,4 = 4,999…98)', () => {
    expect(16.4 - 11.4).toBeLessThan(5);
    const p = dziewczynka(16.4, { menarche_age_years: 11.4 });
    expect(wybierz(p).reference_basis).toBe('gynecological_age');
    expect(kontekst(p)).toMatchObject({ basis: 'gynecological_age', years_since_menarche_text: '5,0', basis_pl: R1 });
    // Realnie brakująca część roku nie jest szumem: 4,999 roku to nadal poniżej progu.
    expect(wybierz(dziewczynka(16, { menarche_age_years: 11.001 })).id).toBe('e2_F_latepubertal_age');
  });

  it.each([
    ['NaN', Number.NaN], ['nieskończoność', Infinity], ['poniżej 2 lat', 1.99], ['powyżej 20 lat', 20.01],
    ['późniejsza niż wiek', 16.5], ['napis', '10'], ['null', null], ['ujemna', -3],
  ])('nieprawidłowy wiek menarche (%s) liczy się jak brak wpisu', (_opis, menarche) => {
    for (const cycle_phase of [null, 'luteal', 'postmenopause']) {
      const bez = dziewczynka(16, { tanner: 5, cycle_phase });
      const z = { ...bez, menarche_age_years: menarche };
      expect(wybierz(z)).toEqual(wybierz(bez));
      expect(ocen(z)).toEqual(ocen(bez));
      expect(wybierz(z)).toMatchObject({ id: 'e2_F_tanner5', low: 0, high: 290 });
    }
    expect(kontekst(dziewczynka(16, { menarche_age_years: menarche }))).toMatchObject({
      menarche_applicable: true, menarche_age_years: null, years_since_menarche: null, years_since_menarche_text: '',
      basis: 'chronological_age', life_stage: 'pediatric', basis_pl: '',
    });
  });

  it('granice dopuszczalnego wieku menarche należą do zakresu: 2 i 20 lat są przyjmowane (2,0 jako wpis — reguły nie uruchamia, R9)', () => {
    expect(kontekst(dziewczynka(8, { menarche_age_years: 2 }))).toMatchObject({ menarche_age_years: 2, years_since_menarche: 6,
      basis: 'chronological_age', not_qualified_reason: 'menarche_before_min_age' });
    expect(kontekst({ sex: 'F', age: 20, life_stage: 'adult', menarche_age_years: 20 })).toMatchObject({ menarche_applicable: false, basis: 'chronological_age' });
    expect(kontekst(dziewczynka(17.5, { menarche_age_years: 17.5 }))).toMatchObject({ menarche_age_years: 17.5, years_since_menarche: 0, years_since_menarche_text: '0,0' });
  });
});

describe('R1 — po progu estradiol jak u dorosłej kobiety', () => {
  const kwalifikuje = (extra = {}) => dziewczynka(15, { ageUpperYears: 16, ageUpperInclusive: false, tanner: 5, menarche_age_years: 10, ...extra });

  it.each(FAZY)('wybrana faza %s → wiersz dorosłej %s %d–%d i zwykła ocena', (cycle_phase, id, low, high) => {
    const range = wybierz(kwalifikuje({ cycle_phase }));
    const dorosla = wybierz({ sex: 'F', age: 30, life_stage: 'adult', cycle_phase });
    expect(range).toMatchObject({ id, low, high, matched: true, is_default: false, no_interpretation: false,
      reference_basis: 'gynecological_age', reference_basis_pl: R1 });
    // Ten sam wiersz, opis populacji i źródła co u dorosłej — dochodzą tylko pola podstawy doboru.
    expect({ ...range, reference_basis: undefined, reference_basis_pl: undefined }).toEqual({ ...dorosla, reference_basis: undefined, reference_basis_pl: undefined });
    for (const value of [low, high]) expect(ocen(kwalifikuje({ cycle_phase }), value).status).toBe('within');
    expect(ocen(kwalifikuje({ cycle_phase }), high + 1)).toMatchObject({ status: 'above', low, high, reference_basis: 'gynecological_age', reference_basis_pl: R1 });
  });

  it('scenariusz B makiety: 15 lat, menarche 10,0, faza lutealna, E2 450 pmol/L → 200–770, w zakresie', () => {
    expect(ocen(kwalifikuje({ cycle_phase: 'luteal' }), 450)).toMatchObject({ status: 'within', low: 200, high: 770, context_pl: 'Kobiety, faza lutealna' });
  });

  it.each([undefined, null, '', 'unknown', 'nieznana', 'nieustalona'])('nieznana faza (%j) → trzy warianty bez oceny, bez postmenopauzy', (cycle_phase) => {
    const range = wybierz(kwalifikuje({ cycle_phase }));
    oczekujWariantowNieletniej(range);
    expect(range).toMatchObject({ reference_basis: 'gynecological_age', reference_basis_pl: R1 });
    const wynik = ocen(kwalifikuje({ cycle_phase }), 450);
    expect(wynik).toMatchObject({ ok: true, siValue: 450, status: 'no_interpretation', low: null, high: null, lowInUnit: null, highInUnit: null,
      reference_context_required: true, reference_basis: 'gynecological_age', reference_basis_pl: R1, context_pl: NAGLOWEK_NIELETNIA });
    expect(wynik.reference_variants.map((v) => v.id)).toEqual(['e2_female_follicular', 'e2_female_ovulation', 'e2_female_luteal']);
  });

  it('postmenopauza przekazana dla nieletniej liczy się jak faza nieznana — nigdy zakres postmenopauzalny', () => {
    const range = wybierz(kwalifikuje({ cycle_phase: 'postmenopause' }));
    expect(range).toEqual(wybierz(kwalifikuje()));
    oczekujWariantowNieletniej(range);
    expect(JSON.stringify(range)).not.toContain('e2_female_postmeno');
    expect(ocen(kwalifikuje({ cycle_phase: 'postmenopause' }), 50).status).toBe('no_interpretation');
  });

  it.each(CIAZA)('ciąża (%s) → brak zakresu i komunikat jak u dorosłej', (cycle_phase) => {
    const range = wybierz(kwalifikuje({ cycle_phase }));
    expect(range).toMatchObject({ low: null, high: null, no_interpretation: true, reference_unavailable: true,
      reference_context_required: false, matched: false, context_pl: BRAK_DLA_KONTEKSTU });
    expect(range.reference_variants || []).toEqual([]);
    expect(ocen(kwalifikuje({ cycle_phase }), 3000)).toMatchObject({ status: 'no_interpretation', low: null, high: null, context_pl: BRAK_DLA_KONTEKSTU });
  });

  it.each([null, 1, 2, 3, 4, 5])('stadium Tannera (%j) nie dobiera już zakresu', (tanner) => {
    expect(wybierz(kwalifikuje({ tanner }))).toEqual(wybierz(kwalifikuje({ tanner: null })));
    expect(wybierz(kwalifikuje({ tanner, cycle_phase: 'follicular' }))).toMatchObject({ id: 'e2_female_follicular', low: 70, high: 290 });
  });

  it('scenariusz A makiety: bez wyboru fazy wynik 450 pmol/L nie dostaje oceny', () => {
    expect(ocen(kwalifikuje(), 450)).toMatchObject({ status: 'no_interpretation', reference_context_required: true });
  });
});

describe('R2 i R4 — przed progiem albo bez wpisanej menarche', () => {
  const PRZYPADKI = [
    ['bez menarche, Th V, 16 lat', dziewczynka(16, { tanner: 5 }), 'e2_F_tanner5', 0, 290],
    ['menarche rok temu, Th IV, 13 lat', dziewczynka(13, { tanner: 4, menarche_age_years: 12 }), 'e2_F_tanner4', 55.14, 312.46],
    ['bez menarche i bez stadium, 12 lat', dziewczynka(12), 'e2_F_peripubertal_age', 0, 312.46],
    ['menarche 4 lata temu, bez stadium, 16 lat', dziewczynka(16, { menarche_age_years: 12 }), 'e2_F_latepubertal_age', 0, 290],
  ];

  it.each(PRZYPADKI)('%s: zakres jak dotąd, zwykła faza cyklu i postmenopauza nic nie zmieniają', (_opis, patient, id, low, high) => {
    const range = wybierz(patient);
    expect(range).toMatchObject({ id, low, high, matched: true, is_default: false, no_interpretation: false });
    expect(range).not.toHaveProperty('reference_basis');
    for (const cycle_phase of ['follicular', 'ovulation', 'luteal', 'postmenopause']) {
      expect(wybierz({ ...patient, cycle_phase }), cycle_phase).toEqual(range);
      expect(ocen({ ...patient, cycle_phase }, 150), cycle_phase).toEqual(ocen(patient, 150));
    }
  });

  it.each(PRZYPADKI)('%s + ciąża → brak zakresu i komunikat jak u dorosłej (R4)', (_opis, patient) => {
    for (const cycle_phase of CIAZA) {
      const range = wybierz({ ...patient, cycle_phase });
      expect(range, cycle_phase).toMatchObject({ id: 'estradiol-matched-reference-only', low: null, high: null, no_interpretation: true,
        reference_unavailable: true, reference_context_required: false, matched: false, is_default: false, source_ids: [],
        context_pl: BRAK_DLA_KONTEKSTU });
      expect(range).not.toHaveProperty('reference_basis');
      expect(range).not.toHaveProperty('reference_variants');
      // Ten sam wynik co u dorosłej z wybraną ciążą.
      expect(range).toEqual(wybierz({ sex: 'F', age: 30, life_stage: 'adult', cycle_phase }));
      expect(ocen({ ...patient, cycle_phase }, 3000)).toMatchObject({ status: 'no_interpretation', low: null, high: null });
    }
  });

  it('scenariusze C, D i E makiety', () => {
    expect(ocen(dziewczynka(13, { tanner: 4, menarche_age_years: 12 }), 150)).toMatchObject({ status: 'within', low: 55.14, high: 312.46 });
    expect(ocen(dziewczynka(16, { tanner: 5 }), 250)).toMatchObject({ status: 'within', low: 0, high: 290 });
    expect(ocen(dziewczynka(16, { tanner: 5, cycle_phase: 'pregnancy_t1' }), 3000)).toMatchObject({ status: 'no_interpretation', context_pl: BRAK_DLA_KONTEKSTU });
  });
});

describe('R9 — menarche przed ukończeniem 8 lat nie uruchamia reguły (decyzja właściciela nr 5 z 2026-11-19)', () => {
  // Silnik bez bloku reguły daje wyniki bazy (origin/audyt) — wzorzec „zakres jak dotąd”.
  const jakWBazie = fixture((d) => { delete d.reference_selection_policy.gynecological_age; }).LabUnitConverter;
  const FAZY_BEZ_WPLYWU = Object.fromEntries(['follicular', 'ovulation', 'luteal'].map((faza) => [faza, { state: 'no_effect', reason: 'menarche_before_min_age' }]));

  it('7 lat, menarche 2,0 (5 lat od menarche) → zakres jak w bazie przy każdym stadium, bez podstawy „lata od menarche”', () => {
    for (const tanner of [undefined, 1, 2, 3]) {
      const p = dziewczynka(7, { ageUpperYears: 8, ageUpperInclusive: false, tanner, menarche_age_years: 2 });
      expect(kontekst(p), String(tanner)).toMatchObject({ menarche_age_years: 2, years_since_menarche: 5, basis: 'chronological_age', life_stage: 'pediatric', basis_pl: '' });
      expect(wybierz(p), String(tanner)).toEqual(wybierz(p, jakWBazie));
      expect(ocen(p, 150), String(tanner)).toEqual(ocen(p, 150, jakWBazie));
      expect(wybierz(p)).not.toHaveProperty('reference_basis');
    }
    expect(wybierz(dziewczynka(7, { menarche_age_years: 2 }))).toMatchObject({ id: 'e2_F_prepubertal_age', matched: true });
  });

  it('13,0 lat, menarche 7,99 → zakres dziecięcy jak bez wieku menarche; wartość przyjęta, zwykłe fazy „bez wpływu” z własnym powodem', () => {
    const p = dziewczynka(13, { ageUpperYears: 13 + miesiac, ageUpperInclusive: false, tanner: 4, menarche_age_years: 7.99 });
    expect(wybierz(p)).toEqual(wybierz({ ...p, menarche_age_years: undefined }));
    expect(wybierz(p)).toMatchObject({ id: 'e2_F_tanner4', low: 55.14, high: 312.46, matched: true });
    const c = kontekst(p);
    expect(c).toMatchObject({ menarche_applicable: true, menarche_age_years: 7.99, adult_context_min_menarche_years: 8, threshold_years: 5,
      basis: 'chronological_age', life_stage: 'pediatric', basis_pl: '', not_qualified_reason: 'menarche_before_min_age', years_since_menarche_text: '5,0' });
    expect(c.phases).toEqual({ postmenopause: { state: 'not_applicable', reason: 'below_adult_age' }, ...FAZY_BEZ_WPLYWU });
  });

  it('13,0 lat, menarche 8,0 → reguła R1: „Od menarche: 5,0 lat (≥ 5)…”, trzy warianty bez oceny; granica należy do reguły, porównanie bez zaokrąglania', () => {
    const p = dziewczynka(13, { ageUpperYears: 13 + miesiac, ageUpperInclusive: false, tanner: 4, menarche_age_years: 8 });
    oczekujWariantowNieletniej(wybierz(p));
    expect(wybierz(p)).toMatchObject({ reference_basis: 'gynecological_age', reference_basis_pl: R1 });
    expect(kontekst(p)).toMatchObject({ basis: 'gynecological_age', life_stage: 'adult', not_qualified_reason: null, basis_pl: R1,
      phases: { postmenopause: { state: 'not_applicable', reason: 'below_adult_age' } } });
    expect(wybierz({ ...p, cycle_phase: 'luteal' })).toMatchObject({ id: 'e2_female_luteal', low: 200, high: 770 });
    // 7,999999 to nadal „przed ukończeniem 8 lat” — wartość nie jest zaokrąglana do granicy.
    expect(kontekst({ ...p, menarche_age_years: 7.999999 })).toMatchObject({ basis: 'chronological_age', not_qualified_reason: 'menarche_before_min_age' });
    expect(wybierz({ ...p, menarche_age_years: 7.999999 }).id).toBe('e2_F_tanner4');
  });

  it('16 lat, menarche 7,9 albo 3,0 (8,1 i 13 lat od menarche) → zakres dziecięcy; E2 450 pmol/L nadal „powyżej normy” 0–290', () => {
    for (const menarche of [7.9, 3, 2]) {
      const p = dziewczynka(16, { ageUpperYears: 17, ageUpperInclusive: false, tanner: 5, menarche_age_years: menarche });
      expect(wybierz(p), String(menarche)).toEqual(wybierz({ ...p, menarche_age_years: undefined }));
      expect(wybierz(p), String(menarche)).toEqual(wybierz(p, jakWBazie));
      expect(ocen(p, 450), String(menarche)).toMatchObject({ status: 'above', low: 0, high: 290 });
      expect(ocen(p, 450)).not.toHaveProperty('reference_basis');
      expect(kontekst(p)).toMatchObject({ menarche_age_years: menarche, not_qualified_reason: 'menarche_before_min_age', phases: FAZY_BEZ_WPLYWU });
    }
    expect(kontekst(dziewczynka(16, { menarche_age_years: 7.9 })).years_since_menarche_text).toBe('8,1');
  });

  it('taka dziewczynka + zwykła faza albo postmenopauza → nic nie zmieniają (R2, R3); + ciąża → brak zakresu jak u dorosłej (R4)', () => {
    const p = dziewczynka(16, { tanner: 5, menarche_age_years: 3 });
    const bez = dziewczynka(16, { tanner: 5 });
    for (const cycle_phase of ['follicular', 'ovulation', 'luteal', 'postmenopause']) {
      expect(wybierz({ ...p, cycle_phase }), cycle_phase).toEqual(wybierz(p));
      expect(wybierz({ ...p, cycle_phase }), cycle_phase).toEqual(wybierz({ ...bez, cycle_phase }));
      expect(ocen({ ...p, cycle_phase }, 150), cycle_phase).toEqual(ocen(bez, 150));
    }
    for (const cycle_phase of CIAZA) {
      const range = wybierz({ ...p, cycle_phase });
      expect(range, cycle_phase).toEqual(wybierz({ ...bez, cycle_phase }));
      expect(range).toEqual(wybierz({ sex: 'F', age: 30, life_stage: 'adult', cycle_phase }));
      expect(range).toMatchObject({ id: 'estradiol-matched-reference-only', low: null, high: null, reference_context_required: false, context_pl: BRAK_DLA_KONTEKSTU });
      expect(ocen({ ...p, cycle_phase }, 3000)).toMatchObject({ status: 'no_interpretation', low: null, high: null });
    }
    // Wpis poniżej zakresu poprawności (1,99) to nadal „brak wpisu”, nie R9.
    expect(kontekst(dziewczynka(16, { menarche_age_years: 1.99 }))).toMatchObject({ menarche_age_years: null, not_qualified_reason: 'menarche_not_recorded' });
  });

  it('pakiet: 16 lat, menarche 3,0, E2 450 pmol/L → jak dotąd: ocena zakresem Tannera V, bez noty o kontekście i bez wiersza o menarche', () => {
    const Model = win.VildaLabPackages;
    const wiersz = (patient) => Model.evaluateRow({ converter: Conv, snapshot: win.VildaLabRangeSnapshot, data: win.LabUnitsData,
      patient, capturedAtISO: '2026-06-17T10:00:00.000Z', analyteId: 'estradiol', raw: '450', unit: 'pmol/L' });
    const zKarty = (extra) => ({ sex: 'F', age: 16, ageUpperYears: 17, ageUpperInclusive: false, tanner: 5, cycle_phase: null,
      time_of_day: null, test_protocol: null, method: null, life_stage: 'pediatric', ...extra });
    const row = wiersz(zKarty({ menarche_age_years: 3 }));
    expect(row).not.toHaveProperty('contextRequired');
    expect(row).not.toHaveProperty('contextBasis');
    expect(row.view).toMatchObject({ text: 'powyżej normy', population: e2.reference_ranges_si.find((r) => r.id === 'e2_F_tanner5').context_pl });
    expect(row.view).toEqual(wiersz(zKarty({})).view);
    expect(row.range.range).toEqual(wiersz(zKarty({})).range.range);
    // Dla porównania: ta sama dziewczynka z menarche 11,0 dostaje kartę jak dorosła.
    expect(wiersz(zKarty({ menarche_age_years: 11 }))).toMatchObject({ contextRequired: true, contextBasis: R1 });
  });

  it('granica jest daną deskryptora: inna liczba przesuwa granicę, brak pola = brak granicy, pole nieliczbowe nie kwalifikuje nikogo', () => {
    const z = (zmiana) => fixture((d) => { zmiana(d.reference_selection_policy.gynecological_age); }).LabUnitConverter;
    const granica9 = z((g) => { g.adult_context_min_menarche_years = 9; });
    const p85 = dziewczynka(14, { menarche_age_years: 8.5 });
    expect(kontekst(p85)).toMatchObject({ basis: 'gynecological_age', years_since_menarche_text: '5,5' });
    expect(kontekst(p85, 'estradiol', granica9)).toMatchObject({ basis: 'chronological_age', adult_context_min_menarche_years: 9, not_qualified_reason: 'menarche_before_min_age' });
    expect(wybierz(p85, granica9).id).toBe('e2_F_latepubertal_age');
    expect(kontekst(dziewczynka(14, { menarche_age_years: 9 }), 'estradiol', granica9).basis).toBe('gynecological_age');
    const granica2 = z((g) => { g.adult_context_min_menarche_years = 2; });
    const siedem = dziewczynka(7, { menarche_age_years: 2 });
    expect(kontekst(siedem, 'estradiol', granica2)).toMatchObject({ basis: 'gynecological_age', adult_context_min_menarche_years: 2, not_qualified_reason: null });
    const bezPola = z((g) => { delete g.adult_context_min_menarche_years; });
    expect(kontekst(siedem, 'estradiol', bezPola)).toMatchObject({ basis: 'gynecological_age', adult_context_min_menarche_years: null });
    for (const zla of ['8', Number.NaN, true, {}]) {
      const zepsuta = z((g) => { g.adult_context_min_menarche_years = zla; });
      const p = dziewczynka(15, { tanner: 5, menarche_age_years: 10 });
      expect(kontekst(p, 'estradiol', zepsuta), String(zla)).toMatchObject({ basis: 'chronological_age', not_qualified_reason: 'menarche_before_min_age', adult_context_min_menarche_years: null });
      expect(wybierz(p, zepsuta).id, String(zla)).toBe('e2_F_tanner5');
    }
    // Zakres poprawności wpisu jest niezależny od granicy reguły.
    expect(kontekst(dziewczynka(16, { menarche_age_years: 1.99 }), 'estradiol', granica2).menarche_age_years).toBeNull();
  });
});

describe('granica 18 lat i populacje, których reguła nie dotyczy (R8)', () => {
  it.each(FAZY)('faza %s: 17,99 roku po progu i 18,0 lat dają ten sam zakres — bez skoku w dniu 18. urodzin', (cycle_phase, id, low, high) => {
    const przed = wybierz(dziewczynka(17.99, { menarche_age_years: 12, cycle_phase }));
    const po = wybierz({ sex: 'F', age: 18, life_stage: 'adult', menarche_age_years: 12, cycle_phase });
    expect([przed.id, przed.low, przed.high, przed.context_pl, przed.source_ids]).toEqual([po.id, po.low, po.high, po.context_pl, po.source_ids]);
    expect([po.id, po.low, po.high]).toEqual([id, low, high]);
    expect(po).not.toHaveProperty('reference_basis');
    expect(ocen(dziewczynka(17.99, { menarche_age_years: 12, cycle_phase }), 250).status)
      .toBe(ocen({ sex: 'F', age: 18, life_stage: 'adult', cycle_phase }, 250).status);
  });

  it('od 18 lat bez zmian: cztery warianty, postmenopauza dostępna, wiek menarche bez znaczenia', () => {
    for (const age of [18, 30, 65]) {
      const dorosla = { sex: 'F', age, life_stage: 'adult' };
      const range = wybierz(dorosla);
      expect(range.reference_variants.map((v) => v.cycle_phase)).toEqual(['follicular', 'ovulation', 'luteal', 'postmenopause']);
      expect(range.context_pl).toBe(NAGLOWEK_DOROSLA);
      expect(range).not.toHaveProperty('reference_basis');
      expect(wybierz({ ...dorosla, menarche_age_years: 12 })).toEqual(range);
      expect(wybierz({ ...dorosla, cycle_phase: 'postmenopause' })).toMatchObject({ id: 'e2_female_postmeno', low: 0, high: 110 });
      expect(kontekst(dorosla)).toMatchObject({ life_stage: 'adult', basis: 'chronological_age', known_minor: false, menarche_applicable: false, phases: {} });
    }
  });

  it('mężczyźni, płeć nieznana, brak wieku, pierwsze dni życia i wiek przecinający granicę — wynik jak w bazie', () => {
    const teraz = skrotyEstradioluBezZmian(Conv);
    expect(Object.keys(teraz)).toEqual(Object.keys(baza.estradiolBezZmian));
    for (const [grupa, wzorzec] of Object.entries(baza.estradiolBezZmian)) expect(teraz[grupa], grupa).toEqual(wzorzec);
  });

  it.each([
    ['chłopiec 15 lat', { sex: 'M', age: 15, life_stage: 'pediatric', tanner: 5 }],
    ['płeć nieznana', { sex: null, age: 15, life_stage: 'pediatric' }],
    ['brak wieku', { sex: 'F', life_stage: 'adult' }],
    ['12. doba życia', { sex: 'F', age: 12 / 365.25, life_stage: 'pediatric' }],
    ['wiek [17, 19)', { sex: 'F', age: 17, ageUpperYears: 19, ageUpperInclusive: false, life_stage: 'pediatric' }],
  ])('%s: wiek menarche i wybór fazy niczego nie zmieniają', (_opis, patient) => {
    const range = wybierz(patient);
    expect(range).not.toHaveProperty('reference_basis');
    expect(wybierz({ ...patient, menarche_age_years: 10 })).toEqual(range);
    expect(ocen({ ...patient, menarche_age_years: 10 }, 150)).toEqual(ocen(patient, 150));
  });
});

describe('inne badania katalogu — dobór zakresu i ocena bez zmian', () => {
  it('macierz pacjentów × 33 badania poza estradiolem daje te same wyniki co kod bazy (origin/audyt)', () => {
    const teraz = skrotyDoboru(Conv);
    expect(Object.keys(teraz).sort()).toEqual(Object.keys(baza.badania).sort());
    expect(Object.keys(teraz)).toHaveLength(33);
    expect(teraz).not.toHaveProperty('estradiol');
    for (const [id, wzorzec] of Object.entries(baza.badania)) expect(teraz[id], id).toEqual(wzorzec);
    expect(baza.pacjenci).toBe(wzorzecLiczbyPacjentow(teraz));
  });

  it('postmenopauza i wiek menarche przekazane dla nieletniej nie zmieniają doboru w innym badaniu', () => {
    for (const id of ['prolactin', 'progesterone', 'tsh', 'ft4', 'oh17_progesterone', 'androstenedione', 'estrone']) {
      const substance = Conv.find(id);
      const p = { sex: 'F', age: 16, life_stage: 'pediatric', tanner: 5, method: id === 'oh17_progesterone' ? 'immunoassay_pl' : null };
      for (const cycle_phase of [null, 'luteal', 'postmenopause', 'pregnancy_t1']) {
        expect(Conv.selectRange(substance, { ...p, cycle_phase, menarche_age_years: 10 }), id + ' ' + cycle_phase)
          .toEqual(Conv.selectRange(substance, { ...p, cycle_phase }));
      }
    }
  });
});
function wzorzecLiczbyPacjentow(skroty) { return Object.values(skroty)[0].wybory; }

describe('LabUnitConverter.referenceContext — o regułę pyta strona', () => {
  it('scenariusz A: po progu — etap „dorosła” z lat od menarche, niedostępna tylko postmenopauza', () => {
    expect(kontekst(dziewczynka(15, { ageUpperYears: 16, ageUpperInclusive: false, tanner: 5, menarche_age_years: 10 }))).toEqual({
      policy_id: 'estradiol-matched-reference-only', policy_version: '2026-11-19.1',
      life_stage: 'adult', basis: 'gynecological_age', known_minor: true, adult_min_years: 18,
      menarche_applicable: true, menarche_age_years: 10, menarche_min_years: 2, menarche_max_years: 20,
      adult_context_min_menarche_years: 8, not_qualified_reason: null,
      years_since_menarche: 5, years_since_menarche_text: '5,0', threshold_years: 5, basis_pl: R1,
      phases: { postmenopause: { state: 'not_applicable', reason: 'below_adult_age' } },
    });
  });

  it('scenariusz C: przed progiem — zwykłe fazy bez wpływu, powód „za mało lat od menarche”', () => {
    expect(kontekst(dziewczynka(13, { tanner: 4, menarche_age_years: 12 }))).toMatchObject({
      life_stage: 'pediatric', basis: 'chronological_age', known_minor: true, menarche_applicable: true,
      menarche_age_years: 12, years_since_menarche: 1, years_since_menarche_text: '1,0', threshold_years: 5, basis_pl: '',
      not_qualified_reason: 'below_gynecological_age',
      phases: {
        postmenopause: { state: 'not_applicable', reason: 'below_adult_age' },
        follicular: { state: 'no_effect', reason: 'below_gynecological_age' },
        ovulation: { state: 'no_effect', reason: 'below_gynecological_age' },
        luteal: { state: 'no_effect', reason: 'below_gynecological_age' },
      },
    });
  });

  it('scenariusz D: brak wpisu — zwykłe fazy bez wpływu, powód „menarche nie wpisana”; ciąża zostaje dostępna', () => {
    const c = kontekst(dziewczynka(16, { tanner: 5 }));
    expect(c).toMatchObject({ basis: 'chronological_age', menarche_applicable: true, menarche_age_years: null, years_since_menarche: null,
      not_qualified_reason: 'menarche_not_recorded' });
    expect(Object.keys(c.phases).sort()).toEqual(['follicular', 'luteal', 'ovulation', 'postmenopause']);
    for (const faza of ['follicular', 'ovulation', 'luteal']) expect(c.phases[faza]).toEqual({ state: 'no_effect', reason: 'menarche_not_recorded' });
    for (const faza of CIAZA) expect(c.phases).not.toHaveProperty(faza);
  });

  it.each([
    [4.96, '4,9'], [4.999999, '4,9'], [5, '5,0'], [5.04, '5,0'], [5.09, '5,0'], [1, '1,0'], [0.04, '0,0'], [7.25, '7,2'], [12.3, '12,3'],
  ])('lata od menarche %d pokazywane jako „%s” (jedno miejsce, przecinek, zaokrąglenie w dół)', (lata, tekst) => {
    // Wiek dobrany tak, żeby odejmowanie dało dokładnie podaną liczbę lat (menarche 2,0).
    const c = kontekst(dziewczynka(2 + lata, { menarche_age_years: 2 }));
    expect(c.years_since_menarche).toBeCloseTo(lata, 9);
    expect(c.years_since_menarche_text).toBe(tekst);
  });

  it('wiersz R1 nie łamie się w „(≥ 5)” (twarda spacja) i nie pokazuje „5,0” przed progiem', () => {
    expect(kontekst(dziewczynka(15, { menarche_age_years: 10 })).basis_pl).toBe(R1);
    expect(R1).toContain('(≥ 5)');
    expect(kontekst(dziewczynka(15, { menarche_age_years: 8.5 })).basis_pl).toBe('Od menarche: 6,5 lat (≥ 5) — zakresy estradiolu jak u dorosłej.');
    expect(kontekst(dziewczynka(15, { menarche_age_years: 10.04 }))).toMatchObject({ years_since_menarche_text: '4,9', basis_pl: '' });
  });

  it('R3 dla każdego badania: u pacjenta na pewno poniżej 18 lat postmenopauza nie dotyczy, zwykłe fazy zostają', () => {
    for (const id of ['prolactin', 'progesterone', 'tsh', 'ft4', 'ft3', 'oh17_progesterone', 'androstenedione', 'estrone']) {
      const c = kontekst({ sex: 'F', age: 16.5, life_stage: 'pediatric' }, id);
      expect(c, id).toMatchObject({ known_minor: true, adult_min_years: 18, basis: null, life_stage: 'pediatric', menarche_applicable: false });
      expect(c.phases, id).toEqual({ postmenopause: { state: 'not_applicable', reason: 'below_adult_age' } });
      expect(kontekst({ sex: 'F', age: 30, life_stage: 'adult' }, id), id).toMatchObject({ known_minor: false, phases: {}, life_stage: 'adult', basis: null });
      expect(kontekst({ sex: 'F', life_stage: 'adult' }, id).phases, id).toEqual({});
    }
  });

  it('„na pewno poniżej 18 lat” wymaga całego znanego wieku', () => {
    const znany = (patient, id = 'estradiol') => kontekst(patient, id).known_minor;
    expect(znany({ sex: 'F', age: 17, ageUpperYears: 18, ageUpperInclusive: false })).toBe(true);
    expect(znany({ sex: 'F', age: 17, ageUpperYears: 18, ageUpperInclusive: true })).toBe(false);
    expect(znany({ sex: 'F', age: 17, ageUpperYears: 19, ageUpperInclusive: false })).toBe(false);
    expect(znany({ sex: 'F', age: 17.99 })).toBe(true);
    expect(znany({ sex: 'F', age: 18 })).toBe(false);
    for (const age of [undefined, null, '15', Number.NaN, -1]) expect(znany({ sex: 'F', age })).toBe(false);
    // Noworodek jest na pewno nieletni (lista wyborów), choć estradiol nie ma dla niego zakresu.
    expect(kontekst({ sex: 'F', age: 5 / 365.25 })).toMatchObject({ known_minor: true, life_stage: null, basis: null, menarche_applicable: true });
  });

  it('mężczyzna i płeć nieznana: reguła menarche nie dotyczy; brak wieku — nic nie wiadomo', () => {
    expect(kontekst({ sex: 'M', age: 15, menarche_age_years: 10 })).toMatchObject({ known_minor: true, menarche_applicable: false,
      basis: 'chronological_age', life_stage: 'pediatric', phases: { postmenopause: { state: 'not_applicable', reason: 'below_adult_age' } } });
    expect(kontekst({ sex: null, age: 15, menarche_age_years: 10 })).toMatchObject({ menarche_applicable: false, basis: 'chronological_age' });
    expect(Object.keys(kontekst({ sex: null, age: 15 }).phases)).toEqual(['postmenopause']);
    expect(kontekst({ sex: 'F', menarche_age_years: 10 })).toMatchObject({ known_minor: false, menarche_applicable: false, basis: null, life_stage: null, phases: {} });
  });

  it('funkcja jest czysta: nie zmienia wejścia ani danych, przyjmuje identyfikator albo deskryptor', () => {
    const patient = dziewczynka(15, { tanner: 5, menarche_age_years: 10, cycle_phase: 'postmenopause' });
    const przed = structuredClone(patient), dane = structuredClone(e2);
    const wynik = kontekst(patient);
    expect(Conv.referenceContext(e2, patient)).toEqual(wynik);
    wybierz(patient); ocen(patient);
    expect(patient).toEqual(przed);
    expect(e2).toEqual(dane);
    expect(Conv.referenceContext('nie-ma-takiego-badania', patient)).toMatchObject({ known_minor: true, basis: null });
    expect(Conv.referenceContext('estradiol')).toMatchObject({ known_minor: false, basis: null, phases: {} });
    expect(Conv.version).toBe('2.0.4');
  });
});

describe('pakiet badań (R5): karta estradiolu jak u dorosłej + wiersz o menarche', () => {
  const Model = win.VildaLabPackages;
  const wiersz = (patient, raw = '450') => Model.evaluateRow({ converter: Conv, snapshot: win.VildaLabRangeSnapshot, data: win.LabUnitsData,
    patient, capturedAtISO: '2026-06-17T10:00:00.000Z', analyteId: 'estradiol', raw, unit: 'pmol/L' });
  const zKarty = (extra) => ({ sex: 'F', age: 15, ageUpperYears: 16, ageUpperInclusive: false, tanner: 5, cycle_phase: null,
    time_of_day: null, test_protocol: null, method: null, life_stage: 'pediatric', ...extra });

  it('scenariusz F: 15 lat, menarche 10,0 — bez oceny, nota o kontekście i wiersz R1 z silnika', () => {
    const row = wiersz(zKarty({ menarche_age_years: 10 }));
    expect(row).toMatchObject({ status: 'ok', own: '', contextRequired: true, contextBasis: R1 });
    expect(row.view).toMatchObject({ state: '', text: 'bez oceny względem zakresu', bounds: '', marker: null });
    expect(row.view).not.toHaveProperty('classification');
    // Zapis nie niesie zakresu ani kategorii — jak u dorosłej bez fazy.
    expect(row.range).toMatchObject({ status: 'unavailable', classification: null, display: null,
      range: { id: 'estradiol-matched-reference-only', low: null, high: null, noInterpretation: true } });
  });

  it('bez progu karta zostaje pediatryczna, u dorosłej nota bez wiersza o menarche', () => {
    const pediatryczna = wiersz(zKarty({ menarche_age_years: 12 }));
    expect(pediatryczna).not.toHaveProperty('contextRequired');
    expect(pediatryczna).not.toHaveProperty('contextBasis');
    expect(pediatryczna.view).toMatchObject({ text: 'powyżej normy', population: e2.reference_ranges_si.find((r) => r.id === 'e2_F_tanner5').context_pl });
    const dorosla = wiersz({ sex: 'F', age: 30, tanner: null, cycle_phase: null, time_of_day: null, test_protocol: null, method: null, life_stage: 'adult' });
    expect(dorosla).toMatchObject({ contextRequired: true });
    expect(dorosla).not.toHaveProperty('contextBasis');
  });

  it('widok pakietu rysuje wiersz pod notą o kontekście tym samym wyciszonym stylem', () => {
    const pakiety = readFileSync(new URL('../../vilda_lab_packages.js', import.meta.url), 'utf8');
    // Wiersz o menarche stoi w tej samej gałęzi co nota o kontekście (karta bez normy z wydruku); „else” noty
    // o zastąpieniu oceny normą z wydruku należy — jak przed zmianą — do warunku „bez normy z wydruku”.
    const rysowanie = pakiety.slice(pakiety.indexOf('        if (note) {'), pakiety.indexOf("button(box, 'lab-pkg-link lab-pkg-card-link', 'Oceń '"));
    expect(rysowanie.replace(/\s*\/\/[^\n]*\n/g, '\n').replace(/\s+/g, ' ').trim()).toBe(
      "if (note) { if (!view.lab) { add(box, 'div', 'lab-pkg-card-note', note); "
      + "if (!view.own && row.contextBasis) add(box, 'div', 'lab-pkg-card-note', row.contextBasis); } "
      + "else if (view.replaced) add(box, 'div', 'lab-pkg-card-note', REPLACED_NOTE);");
    expect(Model.version).toBe('1.8.0');
  });
});

describe('zapis zakresu przy przypięciu: format bez zmian, dawne zapisy nie są przeliczane', () => {
  // Te same wywołania co captureLabRange strony: selectRange + evaluate + VildaLabRangeSnapshot.create.
  function przypnij(okno, patient, raw = '450') {
    const converter = okno.LabUnitConverter, descriptor = converter.find('estradiol');
    const range = converter.selectRange(descriptor, patient);
    const row = descriptor.reference_ranges_si.find((entry) => entry.id === range.id);
    return okno.VildaLabRangeSnapshot.create({
      analyte: 'estradiol', range, when: row ? row.when : null, patient,
      evaluation: converter.evaluate('estradiol', { value: raw, unit: 'pmol/L', patient }),
      factorToSi: 1, measurement: { raw, sourceUnit: 'pmol/L' },
      sources: range.source_ids.map((id) => ({ id, label: converter.findSource(id).label_short, citation: converter.findSource(id).full_cite, url: converter.findSource(id).url })),
      versions: { engine: 'LabUnitConverter ' + converter.version, data: 'LabUnitsData ' + okno.LabUnitsData.version },
      capturedAtISO: '2026-11-19T12:00:00.000Z',
    });
  }
  const pacjentkaA = (extra = {}) => ({ sex: 'F', age: 15, ageUpperYears: 16, ageUpperInclusive: false, tanner: 5, life_stage: 'pediatric',
    menarche_age_years: 10, cycle_phase: null, time_of_day: null, test_protocol: null, method: null, _has_override: false, ...extra });

  it('po progu z wybraną fazą: zapisany jest użyty wiersz dorosłej; pola zapisu te same co u dorosłej', () => {
    const zapis = przypnij(win, pacjentkaA({ cycle_phase: 'luteal', _has_override: true }));
    expect(zapis).toMatchObject({ schemaVersion: 1, status: 'recorded', classification: 'within', reasonCodes: [],
      context: { sex: 'F', ageYears: 15, lifeStage: 'pediatric', tanner: 5, cyclePhase: 'luteal', localOverride: true },
      range: { id: 'e2_female_luteal', low: 200, high: 770, context: 'Kobiety, faza lutealna', matched: true, isDefault: false,
        when: { sex: 'F', life_stage: 'adult', cycle_phase: 'luteal' } },
      display: { unit: 'pmol/L', low: 200, high: 770 }, versions: { engine: 'LabUnitConverter 2.0.4' } });
    const dorosla = przypnij(win, { sex: 'F', age: 30, tanner: 5, life_stage: 'adult', cycle_phase: 'luteal', _has_override: true });
    for (const czesc of ['context', 'range', 'measurement', 'versions', 'display']) expect(Object.keys(zapis[czesc]), czesc).toEqual(Object.keys(dorosla[czesc]));
    expect(Object.keys(zapis)).toEqual(Object.keys(dorosla));
    expect(win.VildaLabRangeSnapshot.normalize(JSON.parse(JSON.stringify(zapis)))).toEqual(zapis);
    expect(win.VildaLabRangeSnapshot.describe(zapis)).toMatchObject({ status: 'recorded', classification: 'within',
      population: 'Kobiety, faza lutealna', subject: 'dziewczynka, 15 l, Tanner V (ustawione w przeliczniku)' });
    expect(win.VildaLabRangeSnapshot.version).toBe('1.1.0');
  });

  it('po progu bez fazy: zapis bez zakresu i kategorii, bez niezastosowanych wariantów', () => {
    const zapis = przypnij(win, pacjentkaA());
    expect(zapis).toMatchObject({ status: 'unavailable', reasonCodes: ['range_no_interpretation'], classification: null, display: null,
      range: { id: 'estradiol-matched-reference-only', low: null, high: null, noInterpretation: true, sourceIds: [] } });
    expect(JSON.stringify(zapis)).not.toContain('e2_female_');
    expect(win.VildaLabRangeSnapshot.describe(zapis)).toMatchObject({ status: 'unavailable', text: 'bez oceny względem zakresu w dniu przypięcia' });
  });

  it('zapis sprzed reguły (zakres pediatryczny, „powyżej”) zostaje historycznym zapisem — bez ponownej kwalifikacji', () => {
    const przedRegula = fixture((d) => { delete d.reference_selection_policy.gynecological_age; });
    const dawny = przypnij(przedRegula, pacjentkaA());
    expect(dawny).toMatchObject({ status: 'recorded', classification: 'above', range: { id: 'e2_F_tanner5', low: 0, high: 290 } });
    const biezace = fixture();
    const evaluate = vi.spyOn(biezace.LabUnitConverter, 'evaluate');
    const selectRange = vi.spyOn(biezace.LabUnitConverter, 'selectRange');
    const odczyt = biezace.VildaLabRangeSnapshot.normalize(JSON.parse(JSON.stringify(dawny)));
    expect(odczyt).toEqual(dawny);
    expect(biezace.VildaLabRangeSnapshot.describe(odczyt)).toMatchObject({ status: 'recorded', classification: 'above',
      text: 'powyżej zapisanego zakresu', bounds: '0–290\u00a0pmol/L' });
    expect(evaluate).not.toHaveBeenCalled();
    expect(selectRange).not.toHaveBeenCalled();
  });
});

// ── Strona przelicznika: prawdziwe funkcje wycięte z przelicznik-jednostek.html ────────────────────────────────
function wytnij(od, dokad) {
  const start = html.indexOf(od);
  const end = html.indexOf(dokad, start + od.length);
  if (start < 0 || end <= start) throw new Error('Nie znaleziono w przeliczniku: ' + od);
  return html.slice(start, end);
}

describe('strona: wiek menarche dociera do silnika (dane pacjenta i pole lokalne)', () => {
  const adapter = wytnij('    function getEffectivePatient()', '    var RZYMSKIE');
  const wiek = wytnij('    function lifespanLegacyAge(source)', '    function lifespanContraindicated(source');
  const metody = wytnij('    var METHOD_OPTIONS = {', '    // ─');
  const silnikWieku = loadBrowserScript('vilda_lab_puberty.js');
  function strona({ source, shared = { sex: 'F', age: 16, tanner: 5 }, override = {}, wybrane = 'estradiol' }) {
    const ctx = {
      window: silnikWieku, Conv, syncPatientIdentity() {}, currentPatientIdentity: () => '', readPatientFromShared: () => shared,
      localOverride: { sex: null, age: null, tanner: null, cycle_phase: null, menarche: null, ...override },
      measurementCtx: {}, currentSubstance: Conv.find(wybrane),
      overrideAgeEl: { value: '' }, overrideAgeMonthsEl: { value: '' },
      describePatient: () => ({ text: 'opis', missing: false }), readPubertyPatientContext: () => source,
    };
    vm.createContext(ctx);
    vm.runInContext(metody + wiek + adapter, ctx);
    return ctx;
  }
  const zrodlo = (extra = {}) => ({ sourceStatus: 'ready', sex: 'F', ageYears: 16, ageMonths: null, ...extra });

  it('wiek menarche z danych pacjenta → pole silnika; bez wpisu lokalnego nie ma „nadpisania”', () => {
    const p = strona({ source: zrodlo({ menarcheAgeYears: 11 }) }).getEffectivePatient();
    expect(p).toMatchObject({ sex: 'F', age: 16, ageUpperYears: 17, ageUpperInclusive: false, menarche_age_years: 11,
      _shared_menarche: 11, _menarche_overridden: false, _has_override: false });
    oczekujWariantowNieletniej(wybierz(p));
    expect(kontekst(p)).toMatchObject({ basis: 'gynecological_age', years_since_menarche_text: '5,0' });
  });

  it('pierwszeństwo: wartość wpisana lokalnie zastępuje wartość z danych (scenariusz G)', () => {
    const lokalnie = strona({ source: zrodlo(), override: { menarche: 11 } }).getEffectivePatient();
    expect(lokalnie).toMatchObject({ menarche_age_years: 11, _shared_menarche: null, _menarche_overridden: true, _has_override: true });
    expect(kontekst(lokalnie).basis).toBe('gynecological_age');
    const obie = strona({ source: zrodlo({ menarcheAgeYears: 10 }), override: { menarche: 13 } }).getEffectivePatient();
    expect(obie).toMatchObject({ menarche_age_years: 13, _shared_menarche: 10, _menarche_overridden: true, _has_override: true });
    expect(kontekst(obie)).toMatchObject({ basis: 'chronological_age', years_since_menarche_text: '3,0' });
    expect(wybierz(obie)).toMatchObject({ id: 'e2_F_tanner5' });
  });

  it('wpis lokalny, którego silnik nie przyjmuje (25; nieliczbowy = NaN), zastępuje dane i liczy się jak brak wpisu — nadpisanie, ale nie wartość do pokazania', () => {
    for (const wpis of [25, 1, 16.5, Number.NaN]) {
      const p = strona({ source: zrodlo({ menarcheAgeYears: 10 }), override: { menarche: wpis } }).getEffectivePatient();
      expect(p, String(wpis)).toMatchObject({ menarche_age_years: wpis, _shared_menarche: 10, _menarche_overridden: true, _menarche_applied: false, _has_override: true });
      expect(kontekst(p)).toMatchObject({ menarche_age_years: null, basis: 'chronological_age' });
      expect(wybierz(p).id).toBe('e2_F_tanner5');
    }
    // Wpis przyjęty przez silnik jest wartością do pokazania w opisie pacjenta.
    expect(strona({ source: zrodlo(), override: { menarche: 11 } }).getEffectivePatient()).toMatchObject({ _menarche_applied: true, _has_override: true });
    expect(strona({ source: zrodlo({ menarcheAgeYears: 10 }) }).getEffectivePatient()).toMatchObject({ _menarche_applied: false, _has_override: false });
  });

  it('wpis lokalny u pacjentki, której pole nie dotyczy (wiek lokalny 30 lat; płeć M), nie jest ani nadpisaniem, ani wartością do pokazania', () => {
    const dorosla = strona({ source: zrodlo(), override: { menarche: 9, age: 30 } });
    dorosla.overrideAgeEl.value = '30';
    expect(dorosla.getEffectivePatient()).toMatchObject({ age: 30, _menarche_overridden: true, _menarche_applied: false, _has_override: true });
    // Samo nadpisanie wieku zostaje nadpisaniem; bez niego wpis menarche u dorosłej z danych nie liczy się wcale.
    const zDanych = strona({ source: zrodlo({ ageYears: 30 }), shared: { sex: 'F', age: 30 }, override: { menarche: 9 } }).getEffectivePatient();
    expect(zDanych).toMatchObject({ age: 30, _menarche_applied: false, _has_override: false });
    const chlopiec = strona({ source: zrodlo({ sex: 'M' }), shared: { sex: 'M', age: 16 }, override: { menarche: 11 } }).getEffectivePatient();
    expect(chlopiec).toMatchObject({ sex: 'M', _menarche_applied: false, _has_override: false });
  });

  it('bez gotowego źródła danych pole jest puste; wartość nieliczbowa w danych nie jest wiekiem menarche', () => {
    expect(strona({ source: { sourceStatus: 'loading', menarcheAgeYears: 11 } }).getEffectivePatient())
      .toMatchObject({ age: null, menarche_age_years: null, _shared_menarche: null, _menarche_overridden: false });
    for (const zla of ['11', Number.NaN, null, undefined]) {
      expect(strona({ source: zrodlo({ menarcheAgeYears: zla }) }).getEffectivePatient())
        .toMatchObject({ menarche_age_years: null, _menarche_overridden: false, _has_override: false });
    }
    // Stan pola: null = puste (brak nadpisania); napis nie jest stanem pola i nie liczy się.
    for (const brak of [null, undefined, '11']) {
      expect(strona({ source: zrodlo({ menarcheAgeYears: 10 }), override: { menarche: brak } }).getEffectivePatient())
        .toMatchObject({ menarche_age_years: 10, _menarche_overridden: false, _has_override: false });
    }
  });

  it('wybór fazy niedostępny dla badania i pacjenta nie trafia do odbiorców pacjenta — zapamiętany wybór zostaje nietknięty', () => {
    // Estradiol, 16 lat bez menarche: faza lutealna nie działa; ciąża i brak wyboru przechodzą.
    const e2 = strona({ source: zrodlo(), override: { cycle_phase: 'luteal' } });
    expect(e2.getEffectivePatient()).toMatchObject({ cycle_phase: null, _has_override: false });
    expect(vm.runInContext('localOverride.cycle_phase', e2)).toBe('luteal');
    expect(strona({ source: zrodlo(), override: { cycle_phase: 'pregnancy_t1' } }).getEffectivePatient()).toMatchObject({ cycle_phase: 'pregnancy_t1', _has_override: true });
    // Po progu faza przechodzi; postmenopauza nigdy poniżej 18 lat.
    expect(strona({ source: zrodlo({ menarcheAgeYears: 11 }), override: { cycle_phase: 'luteal' } }).getEffectivePatient()).toMatchObject({ cycle_phase: 'luteal', _has_override: true });
    expect(strona({ source: zrodlo({ menarcheAgeYears: 11 }), override: { cycle_phase: 'postmenopause' } }).getEffectivePatient().cycle_phase).toBeNull();
    // Inne badania (prolaktyna, LH, inhibina B — ta sama funkcja podaje fazę wykresowi): postmenopauza tylko od 18 lat.
    for (const wybrane of ['prolactin', 'lh', 'inhibin_b', 'tsh']) {
      expect(strona({ source: zrodlo(), shared: { sex: 'F', age: 12 }, override: { cycle_phase: 'postmenopause' }, wybrane }).getEffectivePatient().cycle_phase, wybrane).toBeNull();
      expect(strona({ source: zrodlo(), shared: { sex: 'F', age: 12 }, override: { cycle_phase: 'luteal' }, wybrane }).getEffectivePatient().cycle_phase, wybrane).toBe('luteal');
      expect(strona({ source: zrodlo(), shared: { sex: 'F', age: 40 }, override: { cycle_phase: 'postmenopause' }, wybrane }).getEffectivePatient().cycle_phase, wybrane).toBe('postmenopause');
    }
    // Bez wieku nie wiadomo, że pacjentka jest nieletnia — wybór przechodzi jak dotąd.
    expect(strona({ source: zrodlo(), shared: { sex: 'F' }, override: { cycle_phase: 'postmenopause' }, wybrane: 'prolactin' }).getEffectivePatient().cycle_phase).toBe('postmenopause');
  });

  it('inne badania nie dostają wieku menarche; wpis lokalny nie jest dla nich nadpisaniem', () => {
    const p = strona({ source: zrodlo({ menarcheAgeYears: 11 }), override: { menarche: 11 }, wybrane: 'prolactin' }).getEffectivePatient();
    expect(p).not.toHaveProperty('menarche_age_years');
    expect(p._has_override).toBe(false);
  });

  it('pakiet (R5): wiek menarche wyłącznie z danych pacjenta — lokalny wpis pojedynczego badania nie wchodzi', () => {
    const ctx = strona({ source: zrodlo({ menarcheAgeYears: 11 }), override: { menarche: 14 }, wybrane: 'tsh' });
    ctx.packageSampleAdjust = (context) => context;
    const pakiet = ctx.getPackagePatient('estradiol').patient;
    expect(pakiet).toMatchObject({ sex: 'F', age: 16, menarche_age_years: 11, _menarche_overridden: false, _has_override: false, cycle_phase: null });
    expect(ocen(pakiet, 450)).toMatchObject({ reference_context_required: true, reference_basis_pl: R1 });
    expect(ctx.getPackagePatient('tsh').patient).not.toHaveProperty('menarche_age_years');
    // Wiersz „Stadium dobiera normę według Tannera” nie wymienia estradiolu: żadne stadium nie zmienia doboru.
    const zakresy = [null, 1, 2, 3, 4, 5].map((tanner) => wybierz({ ...pakiet, tanner }).id);
    expect(new Set(zakresy).size).toBe(1);
    const bezMenarche = strona({ source: zrodlo(), wybrane: 'tsh' });
    bezMenarche.packageSampleAdjust = (context) => context;
    const pediatryczna = bezMenarche.getPackagePatient('estradiol').patient;
    expect(new Set([null, 1, 2, 3, 4, 5].map((tanner) => wybierz({ ...pediatryczna, tanner }).id)).size).toBeGreaterThan(1);
  });
});

describe('strona: wiek menarche z danych bieżącej osoby (readPubertyPatientContext)', () => {
  const makeReader = new Function('window', 'sessionStorage', 'persistence', 'extractTannerFromAny',
    `${wytnij('    function readPubertyPatientContext() {', '    var pubertyUI =')}; return readPubertyPatientContext;`);
  function harness({ saved = true, rekord = { menarcheAgeYears: 10.5 }, wspolne = undefined } = {}) {
    const id = saved ? 'fikcyjna-pacjentka-menarche' : '';
    const shared = { sex: 'F', age: 16, ageMonths: 0 };
    if (wspolne) shared.puberty = wspolne;
    const payload = { user: { sex: 'F', age: 16 }, puberty: rekord };
    const storage = { getItem: (key) => key === 'vildaCurrentPatientId' ? id || null : null };
    const w = { sessionStorage: storage, _vildaCurrentPatientId: id,
      document: { readyState: 'loading', getElementById: () => null, addEventListener() {} },
      addEventListener() {}, VildaVault: { isUnlocked: () => true } };
    loadBrowserScript('vilda_puberty_source.js', w);
    if (saved) w.VildaPubertySource.zapamietaj(payload, id);
    return { w, read: makeReader(w, storage, { readShared: () => shared }, () => null) };
  }

  it('rekord pacjenta: payload.puberty.menarcheAgeYears', () => {
    expect(harness().read()).toMatchObject({ sourceStatus: 'ready', sex: 'F', menarcheAgeYears: 10.5 });
    expect(harness({ rekord: { menarcheAgeYears: '11,25' } }).read().menarcheAgeYears).toBe(11.25);
  });

  it('żywy panel albo sesja formularza mają pierwszeństwo przed rekordem — także gdy pole jest tam puste', () => {
    const h = harness();
    const aktywna = (puberty) => ({ available: true, scope: 'visit', sex: 'F', demographics: { sex: 'F', ageYears: 16, ageMonths: 0, birthDateISO: null },
      assessmentContext: { status: 'absent', assessment: null, legacy: null }, gonadal: null, puberty });
    h.w.VildaPubertyAssessmentContext = { readActiveContext: () => aktywna({ menarcheAgeYears: 12 }) };
    expect(h.read().menarcheAgeYears).toBe(12);
    h.w.VildaPubertyAssessmentContext = { readActiveContext: () => aktywna({ menarcheAgeYears: null }) };
    expect(h.read()).not.toHaveProperty('menarcheAgeYears');
  });

  it('bez wybranego pacjenta: dane wspólne formularza; brak wpisu nie dodaje pola do kontekstu', () => {
    expect(harness({ saved: false, wspolne: { menarcheAgeYears: 11 } }).read()).toMatchObject({ identityKey: '', menarcheAgeYears: 11 });
    expect(harness({ saved: false }).read()).not.toHaveProperty('menarcheAgeYears');
    expect(harness({ rekord: { onsetAgeYears: 9 } }).read()).not.toHaveProperty('menarcheAgeYears');
    // Wybrany pacjent nie pożycza wieku menarche z danych wspólnych innej osoby.
    expect(harness({ rekord: { onsetAgeYears: 9 }, wspolne: { menarcheAgeYears: 11 } }).read()).not.toHaveProperty('menarcheAgeYears');
  });
});


// Krok „Pacjent” strony na PRAWDZIWYCH funkcjach wyciętych z przelicznik-jednostek.html: getEffectivePatient
// (z filtrem dostępności wyboru fazy), describePatient, buildClinicalHint, renderPatientSummary (z wcześniejszym
// powrotem dla badań z własnym formularzem), onOverrideChange i onOverrideNumberCommitted. Elementy strony są
// atrapami; kolejność kroków i reguły pochodzą wyłącznie z kodu strony i silnika.
describe('strona: krok „Pacjent” — opis, selektor fazy, pole „Wiek menarche [lata]”, noty i zdarzenia panelu', () => {
  const OPCJE = [['', '(domyślnie)'], ['follicular', 'Faza folikularna'], ['ovulation', 'Pik owulacyjny'], ['luteal', 'Faza lutealna'],
    ['postmenopause', 'Postmenopauza'], ['pregnancy_t1', 'Ciąża — I trymestr'], ['pregnancy_t2', 'Ciąża — II trymestr'], ['pregnancy_t3', 'Ciąża — III trymestr']];
  const WSZYSTKIE = OPCJE.map(([value]) => value);
  const BEZ_POSTMENOPAUZY = WSZYSTKIE.filter((value) => value !== 'postmenopause');
  const FAZY_WYLACZONE = BEZ_POSTMENOPAUZY.map((value) => ['follicular', 'ovulation', 'luteal'].includes(value) ? value + '!' : value);
  const R2_BRAK = 'Fazy cyklu działają poniżej 18 lat dopiero po 5 latach od menarche. Wpisz „Wiek menarche” tutaj (tylko dla tego sprawdzenia) albo na stałe w „+ Dane pokwitaniowe” na stronie głównej.';
  const ODRZUCONY = 'Wpisany wiek menarche nie jest brany pod uwagę: podaj liczbę od 2 do 20 lat (najwyżej dwa miejsca po przecinku), nie większą niż wiek pacjentki.';
  const ZMIEN = ' Jeśli faza cyklu jest znana, wybierz ją w „Zmień ▼".';
  const silnikWieku = loadBrowserScript('vilda_lab_puberty.js');
  // Wycinki brane dopiero w teście: na kodzie sprzed zmiany każdy test pada osobno, a nie cały plik przy wczytaniu.
  const kodStrony = () => [
    wytnij('    var CYCLE_AWARE = {', '    // Substancje z silnym rytmem dobowym'),
    wytnij('    function isPubertySubstance(substance) {', '    function readPubertyPatientContext() {'),
    wytnij('    function stageLabel(stage, kind, current) {', '\n    }\n') + '\n    }\n',
    wytnij('    function lifespanLegacyAge(source)', '    function lifespanContraindicated(source'),
    wytnij('    function getEffectivePatient()', '    var RZYMSKIE'),
    wytnij('    var RZYMSKIE', '    /**\n     * Renderuje sekcję "Źródła"'),
    wytnij('    function onOverrideChange(event) {', "    if (overrideSexEl) overrideSexEl.addEventListener('change', onOverrideChange);"),
    wytnij('    function resetLocalPatientOverride() {', '\n    }\n') + '\n    }\n',
  ].join('\n');

  function panel({ wybrane = 'estradiol', shared = { sex: 'F', age: 16, tanner: 5, tannerKind: 'Th', tannerCurrent: true }, source = null, override = {} } = {}) {
    const el = (extra = {}) => ({ value: '', textContent: '', hidden: false, style: {}, attrs: {}, classList: { toggle() {} },
      setAttribute(name, value) { this.attrs[name] = value; }, removeAttribute(name) { delete this.attrs[name]; }, ...extra });
    // Atrapa <select>: opcje z parentNode, insertBefore/removeChild; wyjęcie wybranej opcji wybiera pierwszą (jak w przeglądarce).
    const select = el({ options: [],
      removeChild(option) { this.options = this.options.filter((item) => item !== option); option.parentNode = null; if (this.value === option.value) this.value = this.options[0].value; },
      insertBefore(option, next) {
        const miejsce = next ? this.options.indexOf(next) : this.options.length;
        this.options = [...this.options.slice(0, miejsce), option, ...this.options.slice(miejsce)];
        option.parentNode = this;
      },
      appendChild(option) { this.insertBefore(option, null); } });
    for (const [value, textContent] of OPCJE) select.appendChild({ value, textContent, disabled: false });
    const licznik = { wynik: 0, formularz: 0 };
    const stanDanych = { shared, source: source || { sourceStatus: 'ready', sex: shared.sex, ageYears: shared.age, ageMonths: null } };
    const ctx = {
      Conv, window: { LabUnitConverter: Conv, VildaLabPuberty: silnikWieku.VildaLabPuberty }, document: { getElementById: () => null },
      currentSubstance: wybrane ? Conv.find(wybrane) : null, measurementCtx: {},
      localOverride: { sex: null, age: null, tanner: null, cycle_phase: null, menarche: null, ...override },
      syncPatientIdentity() {}, currentPatientIdentity: () => '',
      readPatientFromShared: () => stanDanych.shared, readPubertyPatientContext: () => stanDanych.source,
      pubertyUI: { setPatientContext() { licznik.formularz += 1; } },
      // Prawdziwe refreshPatientContext rysuje opis pacjenta, a potem wynik; licznik zastępuje rysowanie wyniku.
      refreshPatientContext() { ctx.renderPatientSummary(); licznik.wynik += 1; },
      patientTextEl: el(), patientCtxEl: el(), clinicalHintEl: el(), overrideResetEl: el(),
      overrideSexEl: el(), overrideAgeEl: el(), overrideAgeMonthsEl: el(), overrideCycleWrapEl: el(), overrideCycleEl: select,
      overrideTannerWrapEl: el(), overrideTannerEl: el(), overrideTannerDefaultEl: el(), overrideTannerNoteEl: el(),
      overrideMenarcheWrapEl: el({ hidden: true }), overrideMenarcheEl: el({ placeholder: 'np. 12,5' }), overrideMenarcheNoteEl: el({ hidden: true }),
    };
    select.value = ctx.localOverride.cycle_phase || '';
    vm.createContext(ctx);
    vm.runInContext(kodStrony(), ctx);
    const pola = { wiek: ctx.overrideAgeEl, miesiace: ctx.overrideAgeMonthsEl, menarche: ctx.overrideMenarcheEl, plec: ctx.overrideSexEl, faza: select };
    const h = {
      ctx, select, licznik, dane: stanDanych,
      lokalne: () => vm.runInContext('localOverride', ctx),
      // Zdarzenia strony: „input” w polu liczbowym, „change” w polu wyboru, koniec wpisu („blur”/„change” pola liczbowego).
      wpisz(pole, tekst) { pola[pole].value = tekst; ctx.onOverrideChange({ type: 'input' }); return h.stan(); },
      wybierz(pole, wartosc) { pola[pole].value = wartosc; ctx.onOverrideChange({ type: 'change' }); return h.stan(); },
      zakoncz() { ctx.onOverrideNumberCommitted(); return h.stan(); },
      odswiez() { ctx.renderPatientSummary(); return h.stan(); },
      stan: () => ({
        opis: ctx.patientTextEl.textContent,
        wiersz: ctx.clinicalHintEl.style.display === 'none' ? null : ctx.clinicalHintEl.textContent || null,
        opcje: select.options.map((o) => o.value + (o.disabled ? '!' : '')), faza: select.value, zapamietana: h.lokalne().cycle_phase,
        pole: ctx.overrideMenarcheWrapEl.hidden === false, placeholder: ctx.overrideMenarcheEl.placeholder,
        nota: ctx.overrideMenarcheNoteEl.hidden === false ? ctx.overrideMenarcheNoteEl.textContent : null,
        bledny: ctx.overrideMenarcheEl.attrs['aria-invalid'] === 'true', reset: ctx.overrideResetEl.style.display !== 'none',
        // To, co dostaje wynik, przypięcie i wykres: pacjent z getEffectivePatient i dobrany dla niego zakres.
        fazaDlaWyniku: ctx.getEffectivePatient().cycle_phase,
        zakres: ctx.currentSubstance ? (Conv.selectRange(ctx.currentSubstance, ctx.getEffectivePatient()) || {}).id || null : null,
      }),
    };
    return h;
  }
  const dziewczynka16 = (menarche) => ({ sourceStatus: 'ready', sex: 'F', ageYears: 16, ageMonths: null, ...(menarche == null ? {} : { menarcheAgeYears: menarche }) });

  it('strona ma te same opcje selektora co atrapa testu, nowe pole za „Etapem Tannera” i notę przed „Resetuj”', () => {
    const select = wytnij('<select id="labOverrideCycle">', '</select>');
    expect([...select.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map((m) => [m[1], m[2]])).toEqual(OPCJE);
    const markup = wytnij('<div class="lab-patient-override" id="labPatientOverride"', '<!-- „Wyczyść” należy do formularza');
    const kolejnosc = ['id="labOverrideTannerWrap"', 'id="labOverrideMenarcheWrap"', 'id="labOverrideMenarcheAge"', 'id="labOverrideTannerNote"',
      'id="labOverrideMenarcheNote"', 'id="labOverrideReset"'].map((znacznik) => markup.indexOf(znacznik));
    expect(kolejnosc.every((miejsce) => miejsce > -1)).toBe(true);
    expect([...kolejnosc].sort((a, b) => a - b)).toEqual(kolejnosc);
    // Pole i nota startują schowane atrybutem hidden (bez stylu na elemencie); arkusz strony pilnuje, żeby
    // hidden wygrał z display etykiety w siatce panelu.
    expect(markup).toMatch(/<label id="labOverrideMenarcheWrap" hidden>Wiek menarche \[lata\]\s*<input type="text" id="labOverrideMenarcheAge" inputmode="decimal"/);
    expect(markup).toContain('<p id="labOverrideMenarcheNote" class="lab-override-note" role="status" hidden></p>');
    const arkusz = readFileSync(new URL('../../inline_przelicznik_jednostek_00.css', import.meta.url), 'utf8');
    expect(arkusz.replace(/\s+/g, ' ')).toContain('.lab-patient-override label[hidden], .lab-patient-override .lab-override-note[hidden] { display: none; }');
  });

  it('scenariusz A: 15 lat, menarche 10,0 w danych → wiersz o menarche ze wskazówką, lista bez Postmenopauzy, pole z „(z danych: 10,0)”', () => {
    const h = panel({ shared: { sex: 'F', age: 15, tanner: 5, tannerKind: 'Th', tannerCurrent: true }, source: { sourceStatus: 'ready', sex: 'F', ageYears: 15, ageMonths: null, menarcheAgeYears: 10 } });
    expect(h.odswiez()).toMatchObject({ opis: 'Kobieta · 15 lat · wiek dziecięcy/młodzieńczy · Th V', wiersz: R1 + ZMIEN, opcje: ['', 'follicular', 'ovulation', 'luteal', 'pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3'],
      faza: '', pole: true, placeholder: '(z danych: 10,0)', nota: null, bledny: false, reset: false, zakres: 'estradiol-matched-reference-only' });
    expect(h.select.options[0].textContent).toBe('(nieznana)');
    // Scenariusz B: wybrana faza lutealna → wiersz bez wskazówki, zakres dorosłej.
    expect(h.wybierz('faza', 'luteal')).toMatchObject({ opis: 'Kobieta · 15 lat · wiek dziecięcy/młodzieńczy · Th V · faza lutealna · nadpisanie lokalne',
      wiersz: R1, faza: 'luteal', zapamietana: 'luteal', fazaDlaWyniku: 'luteal', zakres: 'e2_female_luteal', reset: true });
  });

  it('scenariusze C i D: przed progiem albo bez wpisu → fazy wyszarzone, nota, zakres jak dotąd', () => {
    const c = panel({ shared: { sex: 'F', age: 13, tanner: 4, tannerKind: 'Th', tannerCurrent: true }, source: { sourceStatus: 'ready', sex: 'F', ageYears: 13, ageMonths: null, menarcheAgeYears: 12 } });
    expect(c.odswiez()).toMatchObject({ opis: 'Kobieta · 13 lat · wiek dziecięcy/młodzieńczy · Th IV', wiersz: null, opcje: FAZY_WYLACZONE, pole: true,
      placeholder: '(z danych: 12,0)', nota: 'Fazy cyklu nie zmieniają zakresu estradiolu: od menarche minęło mniej niż 5 lat (1,0).', zakres: 'e2_F_tanner4' });
    const d = panel({ source: dziewczynka16() });
    expect(d.odswiez()).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V', wiersz: null, opcje: FAZY_WYLACZONE, pole: true,
      placeholder: 'np. 12,5', nota: R2_BRAK, reset: false, zakres: 'e2_F_tanner5' });
    // Scenariusz E: ciąża u nieletniej → faza przechodzi do wyniku, opis słowami.
    expect(d.wybierz('faza', 'pregnancy_t1')).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · ciąża — I trymestr · nadpisanie lokalne',
      fazaDlaWyniku: 'pregnancy_t1', zakres: 'estradiol-matched-reference-only', nota: R2_BRAK });
  });

  it('scenariusz G i opis pacjenta: wpis przyjęty przez silnik → „menarche 11,0 · nadpisanie lokalne”; wpis odrzucony albo nieużywany nie jest ogłaszany jako wartość', () => {
    const h = panel({ source: dziewczynka16() });
    h.odswiez();
    expect(h.wpisz('menarche', '11,0')).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 11,0 · nadpisanie lokalne',
      wiersz: R1 + ZMIEN, opcje: BEZ_POSTMENOPAUZY, nota: null, bledny: false, reset: true });
    expect(h.wpisz('menarche', '11.25').opis).toBe('Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 11,25 · nadpisanie lokalne');
    // Wpis odrzucony przez silnik: nadal nadpisanie lokalne (reset zostaje), ale nie „menarche 25,0”.
    for (const wpis of ['25', '1', '16,5']) {
      expect(h.wpisz('menarche', wpis), wpis).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · nadpisanie lokalne',
        wiersz: null, opcje: FAZY_WYLACZONE, nota: ODRZUCONY, bledny: true, reset: true, zakres: 'e2_F_tanner5' });
    }
    // Wiek nadpisany na 30 lat: pole schowane i nieużywane — opis nie wymienia menarche (nadpisaniem jest sam wiek).
    h.wpisz('menarche', '9');
    expect(h.wpisz('wiek', '30')).toMatchObject({ pole: false, nota: null, bledny: false, reset: true });
    expect(h.stan().opis).toBe('Kobieta · 30 lat · Th V · nadpisanie lokalne');
    expect(h.stan().opis).not.toContain('menarche');
  });

  it.each([
    ['12,5,', 'przecinek na końcu'], ['12,5 lat', 'jednostka'], ['12;5', 'średnik'], ['1e1', 'wykładnik'], ['0x10', 'zapis szesnastkowy'],
    ['-12', 'znak minus'], ['+12', 'znak plus'], ['12.555', 'trzy miejsca po kropce'], [',', 'sam separator'], [',5', 'bez cyfr przed separatorem'],
    ['12 5', 'spacja w środku'], ['dwanaście', 'słowo'], ['12..5', 'dwie kropki'],
  ])('wpis „%s” (%s) nie jest zwykłą liczbą dziesiętną → wpis odrzucony: zastępuje wartość z danych, nota, oznaczenie pola', (wpis) => {
    // W danych menarche 10,0 (po progu u 16-latki): bez wpisu byłaby obsługa jak u dorosłej.
    const h = panel({ source: dziewczynka16(10) });
    expect(h.odswiez()).toMatchObject({ wiersz: 'Od menarche: 6,0 lat (≥ 5) — zakresy estradiolu jak u dorosłej.' + ZMIEN, zakres: 'estradiol-matched-reference-only' });
    const stan = h.wpisz('menarche', wpis);
    expect(Number.isNaN(h.lokalne().menarche)).toBe(true);
    expect(stan).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · nadpisanie lokalne', wiersz: null, opcje: FAZY_WYLACZONE,
      nota: ODRZUCONY, bledny: true, reset: true, zakres: 'e2_F_tanner5' });
    // Skasowanie wpisu wraca do wartości z danych.
    expect(h.wpisz('menarche', '')).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V', nota: null, bledny: false, reset: false, zakres: 'estradiol-matched-reference-only' });
    expect(h.lokalne().menarche).toBeNull();
  });

  // „12,” i „9.” to niedokończony zapis liczby całkowitej (w drodze do „12,5”), nie wpis odrzucony.
  it.each([['11', 11], ['11,0', 11], ['11.0', 11], [' 12,5 ', 12.5], ['12.25', 12.25], ['012', 12], ['9', 9], ['12,', 12], ['9.', 9]])('wpis „%s” jest liczbą %d', (wpis, liczba) => {
    const h = panel({ source: dziewczynka16() });
    h.wpisz('menarche', wpis);
    expect(h.lokalne().menarche).toBe(liczba);
  });

  it('granice w nocie o odrzuconym wpisie pochodzą z odpowiedzi silnika', () => {
    const inne = fixture((d) => { Object.assign(d.reference_selection_policy.gynecological_age, { menarche_min_years: 3, menarche_max_years: 19.5 }); });
    const h = panel({ source: dziewczynka16() });
    h.ctx.Conv = inne.LabUnitConverter;
    h.ctx.currentSubstance = inne.LabUnitConverter.find('estradiol');
    expect(h.wpisz('menarche', '2,5').nota).toBe('Wpisany wiek menarche nie jest brany pod uwagę: podaj liczbę od 3 do 19,5 lat (najwyżej dwa miejsca po przecinku), nie większą niż wiek pacjentki.');
    // Nieprawidłowa wartość w DANYCH pacjenta (bez wpisu tutaj) to zwykły brak wpisu, nie „odrzucony wpis”.
    const zDanych = panel({ source: dziewczynka16(25) });
    expect(zDanych.odswiez()).toMatchObject({ nota: R2_BRAK, bledny: false, placeholder: 'np. 12,5' });
  });

  it('R9: menarche przed ukończeniem 8 lat (z danych 3,0; wpis lokalny 7,9) → nota „…menarche przed ukończeniem 8 lat (3,0) — zostaje zakres dziecięcy.”, fazy wyszarzone, zakres jak dotąd; wpis 8,0 → reguła', () => {
    const r9 = (wiek) => `Fazy cyklu nie zmieniają zakresu estradiolu: menarche przed ukończeniem 8 lat (${wiek}) — zostaje zakres dziecięcy.`;
    // 16 lat, w danych menarche 3,0 (13 lat od menarche): wartość przyjęta i podpowiadana, ale reguły nie uruchamia.
    const zDanych = panel({ source: dziewczynka16(3) });
    expect(zDanych.odswiez()).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V', wiersz: null, opcje: FAZY_WYLACZONE, pole: true,
      placeholder: '(z danych: 3,0)', nota: r9('3,0'), bledny: false, reset: false, zakres: 'e2_F_tanner5' });
    // Ciąża zostaje do wyboru i daje brak zakresu (R4); nota zostaje.
    expect(zDanych.wybierz('faza', 'pregnancy_t1')).toMatchObject({ fazaDlaWyniku: 'pregnancy_t1', zakres: 'estradiol-matched-reference-only', nota: r9('3,0') });
    // 13 lat, Th IV: wpis lokalny 7,9 jest poprawnym nadpisaniem (bez noty o odrzuceniu); 8,0 uruchamia regułę (5,0 lat).
    const lokalnie = panel({ shared: { sex: 'F', age: 13, tanner: 4, tannerKind: 'Th', tannerCurrent: true }, source: { sourceStatus: 'ready', sex: 'F', ageYears: 13, ageMonths: null, menarcheAgeYears: 8 } });
    expect(lokalnie.odswiez()).toMatchObject({ wiersz: R1 + ZMIEN, placeholder: '(z danych: 8,0)', nota: null, opcje: BEZ_POSTMENOPAUZY });
    for (const [wpis, pokazany] of [['7,9', '7,9'], ['7.99', '7,99'], ['3', '3,0'], ['2', '2,0']]) {
      expect(lokalnie.wpisz('menarche', wpis), wpis).toMatchObject({ opis: `Kobieta · 13 lat · wiek dziecięcy/młodzieńczy · Th IV · menarche ${pokazany} · nadpisanie lokalne`,
        wiersz: null, opcje: FAZY_WYLACZONE, nota: r9(pokazany), bledny: false, reset: true, zakres: 'e2_F_tanner4' });
    }
    expect(lokalnie.wpisz('menarche', '8,0')).toMatchObject({ opis: 'Kobieta · 13 lat · wiek dziecięcy/młodzieńczy · Th IV · menarche 8,0 · nadpisanie lokalne',
      wiersz: R1 + ZMIEN, opcje: BEZ_POSTMENOPAUZY, nota: null, bledny: false, zakres: 'estradiol-matched-reference-only' });
    // Wpis poniżej zakresu poprawności (1) to nadal wpis odrzucony, nie R9.
    expect(lokalnie.wpisz('menarche', '1')).toMatchObject({ nota: ODRZUCONY, bledny: true });
    // Wybrana faza przestaje działać, gdy wpis schodzi poniżej granicy; zakończony wpis ją kasuje.
    lokalnie.wpisz('menarche', '8');
    lokalnie.zakoncz();
    expect(lokalnie.wybierz('faza', 'luteal')).toMatchObject({ zakres: 'e2_female_luteal' });
    expect(lokalnie.wpisz('menarche', '7')).toMatchObject({ zakres: 'e2_F_tanner4', fazaDlaWyniku: null, faza: 'luteal', nota: r9('7,0') });
    expect(lokalnie.zakoncz()).toMatchObject({ faza: '', zapamietana: null, opcje: FAZY_WYLACZONE,
      opis: 'Kobieta · 13 lat · wiek dziecięcy/młodzieńczy · Th IV · menarche 7,0 · nadpisanie lokalne' });
  });

  it('R9: liczba w nocie („8”) pochodzi z odpowiedzi silnika, a o powodzie rozstrzyga silnik', () => {
    const granica9 = fixture((d) => { d.reference_selection_policy.gynecological_age.adult_context_min_menarche_years = 9; });
    const h = panel({ source: dziewczynka16(8.5) });
    expect(h.odswiez()).toMatchObject({ wiersz: 'Od menarche: 7,5 lat (≥ 5) — zakresy estradiolu jak u dorosłej.' + ZMIEN, nota: null });
    h.ctx.Conv = granica9.LabUnitConverter;
    h.ctx.currentSubstance = granica9.LabUnitConverter.find('estradiol');
    expect(h.odswiez()).toMatchObject({ wiersz: null, opcje: FAZY_WYLACZONE, placeholder: '(z danych: 8,5)',
      nota: 'Fazy cyklu nie zmieniają zakresu estradiolu: menarche przed ukończeniem 9 lat (8,5) — zostaje zakres dziecięcy.' });
    // Strona nie porównuje sama wieku menarche z granicą: tekst wybiera pole not_qualified_reason odpowiedzi silnika.
    const widok = wytnij('    function renderMenarcheOverrideState(p, reference) {', '\n    }\n');
    expect(widok).toContain("reference.not_qualified_reason === 'menarche_before_min_age'");
    expect(widok).toContain('plainNumber(reference.adult_context_min_menarche_years)');
    expect(widok).not.toMatch(/menarche_age_years\s*[<>]/);
    // Kod strony dla tej reguły (odczyt pacjenta i widok) nie ma własnej liczby 8.
    for (const kod of [wytnij('    function applyMenarcheAge(p, source, local) {', '    function getPackagePatient('),
      wytnij('    var cycleOptionNodes;', '    function renderPatientSummary() {')]) {
      expect(kod).not.toMatch(/ukończeniem 8 lat|[<>]=?\s*8\b|\b8\s*[<>]/);
    }
  });

  it('wpisywanie wieku przez wartość pośrednią (prolaktyna, dorosła z postmenopauzą): wynik i opis od razu bez niedostępnej fazy, zapamiętany wybór zostaje i wraca przy „65”', () => {
    const h = panel({ wybrane: 'prolactin', shared: { sex: 'F', age: 40 } });
    h.odswiez();
    expect(h.wybierz('faza', 'postmenopause')).toMatchObject({ opis: 'Kobieta · 40 lat · postmenopauza · nadpisanie lokalne', fazaDlaWyniku: 'postmenopause', opcje: WSZYSTKIE });
    // „6” (sześciolatka): wynik i opis bez postmenopauzy; wybór w selektorze i jego opcja zostają.
    expect(h.wpisz('wiek', '6')).toMatchObject({ opis: 'Kobieta · 6 lat · wiek dziecięcy/młodzieńczy · nadpisanie lokalne', fazaDlaWyniku: null,
      faza: 'postmenopause', zapamietana: 'postmenopause', opcje: WSZYSTKIE });
    // „65”: wybór wraca do wyniku i opisu bez ponownego wybierania.
    expect(h.wpisz('wiek', '65')).toMatchObject({ opis: 'Kobieta · 65 lat · postmenopauza · nadpisanie lokalne', fazaDlaWyniku: 'postmenopause', faza: 'postmenopause', opcje: WSZYSTKIE });
    const rysowaniaWyniku = h.licznik.wynik;
    expect(h.zakoncz()).toMatchObject({ faza: 'postmenopause', zapamietana: 'postmenopause', opcje: WSZYSTKIE });
    // Wiek „15” w trakcie wpisu: jak wyżej; zakończony wpis kasuje wybór i wyjmuje opcję.
    expect(h.wpisz('wiek', '15')).toMatchObject({ fazaDlaWyniku: null, faza: 'postmenopause', zapamietana: 'postmenopause', opcje: WSZYSTKIE });
    const przedKoncem = h.licznik.wynik;
    expect(h.zakoncz()).toMatchObject({ opis: 'Kobieta · 15 lat · wiek dziecięcy/młodzieńczy · nadpisanie lokalne', fazaDlaWyniku: null, faza: '', zapamietana: null, opcje: BEZ_POSTMENOPAUZY });
    // Koniec wpisu nie rysuje wyniku ponownie (pierwsze kliknięcie w wynik po wyjściu z pola nie może zginąć).
    expect(h.licznik.wynik).toBe(przedKoncem);
    expect(przedKoncem).toBe(rysowaniaWyniku + 1);
    // Odrzucony wybór nie wraca sam, gdy wiek znowu jest dorosły.
    expect(h.wpisz('wiek', '65')).toMatchObject({ opis: 'Kobieta · 65 lat · nadpisanie lokalne', fazaDlaWyniku: null, faza: '', opcje: WSZYSTKIE });
  });

  it('wpisywanie wieku i wieku menarche w estradiolu: faza zapamiętana zostaje, wynik w trakcie liczony bez niej', () => {
    const dorosla = panel({ shared: { sex: 'F', age: 40 }, source: { sourceStatus: 'ready', sex: 'F', ageYears: 40, ageMonths: null } });
    dorosla.odswiez();
    expect(dorosla.wybierz('faza', 'luteal')).toMatchObject({ zakres: 'e2_female_luteal', fazaDlaWyniku: 'luteal' });
    // „3” (trzylatka): zakres dziecka, opis bez fazy; lutealna zostaje wybrana i dostępna na liście, pozostałe fazy wyszarzone.
    expect(dorosla.wpisz('wiek', '3')).toMatchObject({ opis: 'Kobieta · 3 lat · wiek dziecięcy/młodzieńczy · nadpisanie lokalne', zakres: 'e2_F_prepubertal_age', fazaDlaWyniku: null,
      faza: 'luteal', zapamietana: 'luteal', opcje: ['', 'follicular!', 'ovulation!', 'luteal', 'pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3'] });
    expect(dorosla.wpisz('wiek', '35')).toMatchObject({ opis: 'Kobieta · 35 lat · faza lutealna · nadpisanie lokalne', zakres: 'e2_female_luteal', faza: 'luteal', opcje: WSZYSTKIE });
    expect(dorosla.zakoncz()).toMatchObject({ faza: 'luteal', zakres: 'e2_female_luteal' });
    // Dziewczynka po progu z wybraną fazą poprawia wpis menarche z „11” na „10”: po skasowaniu („” → dane bez menarche) i po „1” faza nie ginie.
    const nieletnia = panel({ source: dziewczynka16() });
    nieletnia.odswiez();
    nieletnia.wpisz('menarche', '11');
    nieletnia.zakoncz();
    expect(nieletnia.wybierz('faza', 'luteal')).toMatchObject({ zakres: 'e2_female_luteal', opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 11,0 · faza lutealna · nadpisanie lokalne' });
    expect(nieletnia.wpisz('menarche', '')).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V', zakres: 'e2_F_tanner5', fazaDlaWyniku: null, faza: 'luteal', zapamietana: 'luteal', nota: R2_BRAK });
    expect(nieletnia.wpisz('menarche', '1')).toMatchObject({ zakres: 'e2_F_tanner5', fazaDlaWyniku: null, faza: 'luteal', nota: ODRZUCONY });
    expect(nieletnia.wpisz('menarche', '10')).toMatchObject({ zakres: 'e2_female_luteal', fazaDlaWyniku: 'luteal', faza: 'luteal', nota: null,
      opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 10,0 · faza lutealna · nadpisanie lokalne' });
    // Zakończony wpis 12 (4 lata od menarche): faza skasowana i wyszarzona.
    nieletnia.wpisz('menarche', '12');
    expect(nieletnia.zakoncz()).toMatchObject({ faza: '', zapamietana: null, opcje: FAZY_WYLACZONE, zakres: 'e2_F_tanner5',
      opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 12,0 · nadpisanie lokalne' });
  });

  it('każde odświeżenie poza wpisywaniem liczby zatwierdza dostępność wyboru: zmiana badania, zmiana danych pacjenta', () => {
    // Faza lutealna wybrana w prolaktynie; to samo badanie → estradiol u dziewczynki bez menarche.
    const h = panel({ wybrane: 'prolactin', source: dziewczynka16() });
    h.odswiez();
    expect(h.wybierz('faza', 'luteal')).toMatchObject({ faza: 'luteal', fazaDlaWyniku: 'luteal' });
    h.ctx.currentSubstance = Conv.find('estradiol');
    expect(h.odswiez()).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V', faza: '', zapamietana: null, opcje: FAZY_WYLACZONE, reset: false });
    // Postmenopauza dorosłej; dane pacjenta zmieniają się na dziewczynkę 12 lat (ta sama karta).
    const zmiana = panel({ wybrane: 'prolactin', shared: { sex: 'F', age: 40 } });
    zmiana.odswiez();
    zmiana.wybierz('faza', 'postmenopause');
    zmiana.dane.shared = { sex: 'F', age: 12 };
    expect(zmiana.odswiez()).toMatchObject({ opis: 'Kobieta · 12 lat · wiek dziecięcy/młodzieńczy', faza: '', zapamietana: null, opcje: BEZ_POSTMENOPAUZY });
    // Wybór dostępny zostaje: ciąża u nieletniej, postmenopauza u dorosłej.
    const dorosla = panel({ wybrane: 'prolactin', shared: { sex: 'F', age: 55 } });
    dorosla.wybierz('faza', 'postmenopause');
    expect(dorosla.odswiez()).toMatchObject({ faza: 'postmenopause', zapamietana: 'postmenopause', opcje: WSZYSTKIE, pole: false });
  });

  it('LH, FSH, inhibina B, testosteron (własny formularz): zatwierdzenie przed wcześniejszym powrotem — postmenopauza nie zostaje u pacjentki poniżej 18 lat', () => {
    for (const wybrane of ['lh', 'fsh', 'inhibin_b', 'testosterone_total']) {
      const h = panel({ wybrane, shared: { sex: 'F', age: 40 } });
      h.select.value = 'postmenopause';
      h.lokalne().cycle_phase = 'postmenopause';
      // Dorosła: wybór zostaje (wykres LH i inhibiny B czyta go przez getEffectivePatient).
      expect(h.odswiez()).toMatchObject({ faza: 'postmenopause', zapamietana: 'postmenopause', fazaDlaWyniku: 'postmenopause' });
      // Dane pacjenta zmieniają się na dziewczynkę 12 lat: wybór skasowany, choć opis pacjenta tej ścieżki nie jest rysowany.
      h.dane.shared = { sex: 'F', age: 12 };
      const przed = h.licznik.formularz;
      expect(h.odswiez(), wybrane).toMatchObject({ faza: '', zapamietana: null, fazaDlaWyniku: null, opis: '' });
      expect(h.licznik.formularz).toBe(przed + 1);
      // Ciąża u nieletniej zostaje (testosteron czyta ją z lokalnego wyboru).
      h.select.value = 'pregnancy_t1';
      h.lokalne().cycle_phase = 'pregnancy_t1';
      expect(h.odswiez()).toMatchObject({ faza: 'pregnancy_t1', zapamietana: 'pregnancy_t1', fazaDlaWyniku: 'pregnancy_t1' });
    }
  });

  it('inne badanie z tym selektorem, dorosła, mężczyzna, brak wieku, brak badania: listy opcji', () => {
    const prl = panel({ wybrane: 'prolactin', source: dziewczynka16() });
    expect(prl.odswiez()).toMatchObject({ opcje: BEZ_POSTMENOPAUZY, pole: false, nota: null });
    expect(prl.select.options[0].textContent).toBe('(domyślnie)');
    prl.dane.shared = { sex: 'F', age: 30 };
    expect(prl.odswiez()).toMatchObject({ opcje: WSZYSTKIE, pole: false });
    prl.dane.shared = { sex: 'F', age: 12 };
    expect(prl.odswiez().opcje).toEqual(BEZ_POSTMENOPAUZY);
    // Postmenopauza wraca na swoje miejsce — przed opcjami ciąży.
    prl.dane.shared = { sex: 'F' };
    expect(prl.odswiez().opcje).toEqual(WSZYSTKIE);
    for (const shared of [{ sex: 'F', age: 30 }, { sex: 'F' }]) {
      const e2 = panel({ shared, source: { sourceStatus: 'ready', sex: 'F', ageYears: shared.age == null ? null : shared.age, ageMonths: null } });
      expect(e2.odswiez()).toMatchObject({ opcje: WSZYSTKIE, pole: false, nota: null, placeholder: 'np. 12,5' });
    }
    const chlopiec = panel({ shared: { sex: 'M', age: 15 }, source: { sourceStatus: 'ready', sex: 'M', ageYears: 15, ageMonths: null } });
    expect(chlopiec.odswiez()).toMatchObject({ opcje: BEZ_POSTMENOPAUZY, pole: false, nota: null });
    // Bez wybranego badania: postmenopauza nieletniej też nie jest proponowana ani ogłaszana w opisie.
    const bezBadania = panel({ wybrane: null, shared: { sex: 'F', age: 12 }, override: { cycle_phase: 'postmenopause' } });
    expect(bezBadania.odswiez()).toMatchObject({ opis: 'Kobieta · 12 lat · wiek dziecięcy/młodzieńczy', faza: '', zapamietana: null, opcje: BEZ_POSTMENOPAUZY });
  });

  it('opcja spoza listy strony nie jest ruszana, a jej wybór zostaje', () => {
    const h = panel({ shared: { sex: 'F', age: 35 }, source: { sourceStatus: 'ready', sex: 'F', ageYears: 35, ageMonths: null } });
    h.select.appendChild({ value: 'fikcyjny-kontekst', textContent: 'Fikcyjny kontekst', disabled: false });
    expect(h.wybierz('faza', 'fikcyjny-kontekst')).toMatchObject({ faza: 'fikcyjny-kontekst', fazaDlaWyniku: 'fikcyjny-kontekst', opcje: [...WSZYSTKIE, 'fikcyjny-kontekst'] });
    h.dane.shared = { sex: 'F', age: 15 };
    h.dane.source = { sourceStatus: 'ready', sex: 'F', ageYears: 15, ageMonths: null, menarcheAgeYears: 10 };
    expect(h.odswiez()).toMatchObject({ faza: 'fikcyjny-kontekst', opcje: [...BEZ_POSTMENOPAUZY, 'fikcyjny-kontekst'] });
  });

  it('wiersz pod opisem pacjenta: po progu R1 (ze wskazówką przy nieznanej fazie); dorosła zachowuje dotychczasową wskazówkę', () => {
    const h = panel({ source: dziewczynka16(11) });
    const wiersz = (patient) => h.ctx.buildClinicalHint(patient);
    const p = dziewczynka(15, { tanner: 5, menarche_age_years: 10 });
    expect(wiersz(p)).toBe(R1 + ZMIEN);
    expect(wiersz({ ...p, cycle_phase: 'luteal' })).toBe(R1);
    expect(wiersz({ ...p, cycle_phase: 'pregnancy_t1' })).toBe(R1);
    // Etap życia strony bywa „adult” (brak wieku w danych wspólnych) — wskazówka dorosłej o menopauzie nie dochodzi.
    expect(wiersz({ ...p, life_stage: 'adult' })).toBe(R1 + ZMIEN);
    expect(wiersz(dziewczynka(13, { tanner: 4, menarche_age_years: 12 }))).toBe('');
    expect(wiersz(dziewczynka(16, { tanner: 5 }))).toBe('');
    expect(wiersz({ sex: 'F', age: 30, life_stage: 'adult' })).toBe('Jeśli faza cyklu lub menopauza jest znana, wybierz ją w „Zmień ▼".');
    expect(wiersz({ sex: 'F', age: 30, life_stage: 'adult', cycle_phase: 'luteal' })).toBe('');
  });

  it.each([
    ['pregnancy_t1', 'ciąża — I trymestr'], ['pregnancy_t2', 'ciąża — II trymestr'], ['pregnancy_t3', 'ciąża — III trymestr'],
    ['follicular', 'faza folikularna'], ['ovulation', 'pik owulacyjny'], ['luteal', 'faza lutealna'], ['postmenopause', 'postmenopauza'],
  ])('opis pacjenta: wybór %s to „%s” — także u dorosłej (R7)', (cycle_phase, nazwa) => {
    const opis = panel().ctx.describePatient;
    expect(opis({ sex: 'F', age: 16, life_stage: 'pediatric', tanner: 5, _shared_tanner: 5, _shared_tanner_kind: 'Th', _shared_tanner_current: true, cycle_phase, _has_override: true }).text)
      .toBe('Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · ' + nazwa + ' · nadpisanie lokalne');
    expect(opis({ sex: 'F', age: 19, life_stage: 'adult', cycle_phase, _has_override: true }).text).toBe('Kobieta · 19 lat · ' + nazwa + ' · nadpisanie lokalne');
  });

  it.each([[10, '10,0'], [12.5, '12,5'], [11.25, '11,25'], [12.3, '12,3'], [9.999, '10,0']])('wiek menarche %d → „%s”; wartość nieliczbowa nie jest formatowana', (lata, tekst) => {
    const format = panel().ctx.formatMenarcheAge;
    expect(format(lata)).toBe(tekst);
    for (const zla of [null, undefined, '11', Number.NaN]) expect(format(zla)).toBe('');
  });

  it('czyszczenie: reset panelu i płeć „Mężczyzna” kasują lokalny wiek menarche i wybór fazy', () => {
    const h = panel({ source: dziewczynka16() });
    h.odswiez();
    h.wpisz('menarche', '11');
    h.wybierz('faza', 'luteal');
    expect(h.lokalne()).toMatchObject({ menarche: 11, cycle_phase: 'luteal' });
    expect(h.wybierz('plec', 'M')).toMatchObject({ pole: false, faza: '' });
    expect(h.lokalne()).toMatchObject({ sex: 'M', menarche: null, cycle_phase: null });
    expect(h.ctx.overrideMenarcheEl.value).toBe('');
    // Wpis odrzucony (NaN) też jest kasowany dla płci „Mężczyzna”.
    h.wybierz('plec', '');
    h.wpisz('menarche', 'abc');
    h.wybierz('plec', 'M');
    expect(h.lokalne().menarche).toBeNull();
    // „Resetuj do danych pacjenta”, zmiana pacjenta i „Wyczyść wszystkie pola” wołają resetLocalPatientOverride.
    h.wybierz('plec', '');
    h.wpisz('menarche', '11');
    h.wybierz('faza', 'luteal');
    h.ctx.resetLocalPatientOverride();
    expect(h.lokalne()).toEqual({ sex: null, age: null, tanner: null, cycle_phase: null, menarche: null });
    expect([h.ctx.overrideMenarcheEl.value, h.select.value]).toEqual(['', '']);
    expect(wytnij('    function syncPatientIdentity() {', '\n    }\n')).toContain('resetLocalPatientOverride();');
    expect(wytnij('    function resetLabForm() {', '\n    }\n')).toContain('resetLocalPatientOverride();');
    expect(wytnij("    if (overrideResetEl) overrideResetEl.addEventListener('click', function () {", '\n    });')).toContain('resetLocalPatientOverride();');
    // Zmiana płci w danych tej samej osoby (ścieżka wykresu): faza i wiek menarche porzuconego kontekstu znikają razem.
    const zmianaPlci = wytnij('        if (lifespanCurrentSex && lifespanCurrentSex !== currentSex) {', '        lifespanCurrentSex = currentSex;');
    expect(zmianaPlci).toContain('localOverride.cycle_phase = null;');
    expect(zmianaPlci).toContain('localOverride.menarche = null;');
    expect(zmianaPlci).toContain("if (typeof overrideMenarcheEl !== 'undefined' && overrideMenarcheEl) overrideMenarcheEl.value = '';");
  });

  it('nasłuchy pól liczbowych: „input” przelicza, koniec wpisu („change”, „blur”) tylko zatwierdza wybór i odświeża opis — bez rysowania wyniku', () => {
    expect(html).toContain("if (overrideMenarcheEl) overrideMenarcheEl.addEventListener('input', onOverrideChange);");
    const konce = wytnij('    [overrideAgeEl, overrideAgeMonthsEl, overrideMenarcheEl].forEach(function (node) {', '\n    });');
    expect(konce).toContain("node.addEventListener('change', onOverrideNumberCommitted);");
    expect(konce).toContain("node.addEventListener('blur', onOverrideNumberCommitted);");
    expect(konce).not.toContain('onOverrideChange');
    const h = panel({ source: dziewczynka16() });
    h.odswiez();
    h.wpisz('miesiace', '3');
    const rysowania = h.licznik.wynik;
    for (let i = 0; i < 3; i += 1) h.zakoncz();
    expect(h.licznik.wynik).toBe(rysowania);
    expect(wytnij('    function onOverrideNumberCommitted() {', '\n    }\n')).not.toMatch(/refreshPatientContext|renderResults/);
  });
});
