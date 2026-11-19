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

  it('granice dopuszczalnego wieku menarche należą do zakresu: 2 i 20 lat są przyjmowane', () => {
    expect(kontekst(dziewczynka(8, { menarche_age_years: 2 }))).toMatchObject({ menarche_age_years: 2, basis: 'gynecological_age' });
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
      years_since_menarche: 5, years_since_menarche_text: '5,0', threshold_years: 5, basis_pl: R1,
      phases: { postmenopause: { state: 'not_applicable', reason: 'below_adult_age' } },
    });
  });

  it('scenariusz C: przed progiem — zwykłe fazy bez wpływu, powód „za mało lat od menarche”', () => {
    expect(kontekst(dziewczynka(13, { tanner: 4, menarche_age_years: 12 }))).toMatchObject({
      life_stage: 'pediatric', basis: 'chronological_age', known_minor: true, menarche_applicable: true,
      menarche_age_years: 12, years_since_menarche: 1, years_since_menarche_text: '1,0', threshold_years: 5, basis_pl: '',
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
    expect(c).toMatchObject({ basis: 'chronological_age', menarche_applicable: true, menarche_age_years: null, years_since_menarche: null });
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
    const od = pakiety.indexOf("if (!view.lab) add(box, 'div', 'lab-pkg-card-note', note);");
    expect(od).toBeGreaterThan(-1);
    expect(pakiety.slice(od, od + 400)).toContain("if (!view.lab && !view.own && row.contextBasis) add(box, 'div', 'lab-pkg-card-note', row.contextBasis);");
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
      window: silnikWieku, Conv, syncPatientIdentity() {}, readPatientFromShared: () => shared,
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

  it('wartość lokalna spoza zakresu nadal zastępuje dane i liczy się jak brak wpisu', () => {
    const p = strona({ source: zrodlo({ menarcheAgeYears: 10 }), override: { menarche: 25 } }).getEffectivePatient();
    expect(p).toMatchObject({ menarche_age_years: 25, _menarche_overridden: true });
    expect(kontekst(p)).toMatchObject({ menarche_age_years: null, basis: 'chronological_age' });
    expect(wybierz(p).id).toBe('e2_F_tanner5');
  });

  it('bez gotowego źródła danych i dla nieliczbowych wartości pole jest puste', () => {
    expect(strona({ source: { sourceStatus: 'loading', menarcheAgeYears: 11 } }).getEffectivePatient())
      .toMatchObject({ age: null, menarche_age_years: null, _shared_menarche: null, _menarche_overridden: false });
    for (const zla of ['11', Number.NaN, null, undefined]) {
      expect(strona({ source: zrodlo({ menarcheAgeYears: zla }), override: { menarche: zla } }).getEffectivePatient())
        .toMatchObject({ menarche_age_years: null, _menarche_overridden: false, _has_override: false });
    }
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

describe('strona: opis pacjenta (R6, R7)', () => {
  const ctx = { currentSubstance: Conv.find('estradiol'), currentPatientIdentity: () => '' };
  vm.createContext(ctx);
  vm.runInContext(wytnij('    function stageLabel(stage, kind, current) {', '\n    }\n') + '\n    }\n'
    + wytnij('    var RZYMSKIE', '    /**\n     * Sprawdza CZY Tanner realnie'), ctx);
  const pacjentka = (extra = {}) => ({ sex: 'F', age: 16, life_stage: 'pediatric', tanner: 5, _shared_tanner: 5,
    _shared_tanner_kind: 'Th', _shared_tanner_current: true, _has_override: false, ...extra });

  it.each([
    ['pregnancy_t1', 'ciąża — I trymestr'], ['pregnancy_t2', 'ciąża — II trymestr'], ['pregnancy_t3', 'ciąża — III trymestr'],
    ['follicular', 'faza folikularna'], ['ovulation', 'pik owulacyjny'], ['luteal', 'faza lutealna'], ['postmenopause', 'postmenopauza'],
  ])('wybór %s w opisie pacjenta to „%s”', (cycle_phase, nazwa) => {
    expect(ctx.describePatient(pacjentka({ cycle_phase, _has_override: true })).text)
      .toBe('Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · ' + nazwa + ' · nadpisanie lokalne');
    // Także u dorosłej (R7).
    expect(ctx.describePatient({ sex: 'F', age: 19, life_stage: 'adult', cycle_phase, _has_override: true }).text)
      .toBe('Kobieta · 19 lat · ' + nazwa + ' · nadpisanie lokalne');
  });

  it('wiek menarche wpisany lokalnie: „menarche 11,0 · nadpisanie lokalne”; z danych — bez wzmianki', () => {
    expect(ctx.describePatient(pacjentka({ menarche_age_years: 11, _menarche_overridden: true, _has_override: true })).text)
      .toBe('Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 11,0 · nadpisanie lokalne');
    expect(ctx.describePatient(pacjentka({ menarche_age_years: 10, _menarche_overridden: false })).text)
      .toBe('Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V');
    expect(ctx.describePatient(pacjentka({ menarche_age_years: 11, _menarche_overridden: true, _has_override: true, cycle_phase: 'luteal' })).text)
      .toBe('Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 11,0 · faza lutealna · nadpisanie lokalne');
  });

  it.each([[10, '10,0'], [12.5, '12,5'], [11.25, '11,25'], [12.3, '12,3'], [9.999, '10,0']])('wiek menarche %d → „%s”', (lata, tekst) => {
    expect(ctx.formatMenarcheAge(lata)).toBe(tekst);
  });
  it('wartość nieliczbowa nie jest formatowana', () => {
    for (const zla of [null, undefined, '11', Number.NaN]) expect(ctx.formatMenarcheAge(zla)).toBe('');
  });
});

describe('strona: selektor „Faza cyklu / ciąża”, pole „Wiek menarche [lata]” i noty (R2, R3, R6)', () => {
  const OPCJE = [['', '(domyślnie)'], ['follicular', 'Faza folikularna'], ['ovulation', 'Pik owulacyjny'], ['luteal', 'Faza lutealna'],
    ['postmenopause', 'Postmenopauza'], ['pregnancy_t1', 'Ciąża — I trymestr'], ['pregnancy_t2', 'Ciąża — II trymestr'], ['pregnancy_t3', 'Ciąża — III trymestr']];
  // Wycinki brane dopiero w teście: na kodzie sprzed zmiany każdy test pada osobno, a nie cały plik przy wczytaniu.
  const widokKod = () => wytnij('    /* P-E2-MENARCHE (decyzje właściciela 2026-11-19) — widok reguły', '    function renderPatientSummary() {');
  const formatKod = () => wytnij('    function formatMenarcheAge(years) {', '\n    }\n') + '\n    }\n';

  it('strona ma te same opcje selektora co atrapa testu i nowe pole za „Etapem Tannera”, notę przed „Resetuj”', () => {
    const select = wytnij('<select id="labOverrideCycle">', '</select>');
    expect([...select.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map((m) => [m[1], m[2]])).toEqual(OPCJE);
    const panel = wytnij('<div class="lab-patient-override" id="labPatientOverride"', '<!-- „Wyczyść” należy do formularza');
    const kolejnosc = ['id="labOverrideTannerWrap"', 'id="labOverrideMenarcheWrap"', 'id="labOverrideMenarcheAge"', 'id="labOverrideTannerNote"',
      'id="labOverrideMenarcheNote"', 'id="labOverrideReset"'].map((znacznik) => panel.indexOf(znacznik));
    expect(kolejnosc.every((miejsce) => miejsce > -1)).toBe(true);
    expect([...kolejnosc].sort((a, b) => a - b)).toEqual(kolejnosc);
    // Pole i nota startują schowane atrybutem hidden (bez stylu na elemencie); arkusz strony pilnuje, żeby
    // hidden wygrał z display etykiety w siatce panelu.
    expect(panel).toMatch(/<label id="labOverrideMenarcheWrap" hidden>Wiek menarche \[lata\]\s*<input type="text" id="labOverrideMenarcheAge" inputmode="decimal"/);
    expect(panel).toContain('<p id="labOverrideMenarcheNote" class="lab-override-note" role="status" hidden></p>');
    const arkusz = readFileSync(new URL('../../inline_przelicznik_jednostek_00.css', import.meta.url), 'utf8');
    expect(arkusz.replace(/\s+/g, ' ')).toContain('.lab-patient-override label[hidden], .lab-patient-override .lab-override-note[hidden] { display: none; }');
  });

  // Atrapa <select>: tylko to, czego używa funkcja strony (options, value, parentNode opcji, insertBefore, removeChild).
  function atrapa({ wybrane = 'estradiol', override = {} } = {}) {
    const select = { value: '', options: [],
      removeChild(option) { this.options = this.options.filter((item) => item !== option); option.parentNode = null; },
      insertBefore(option, next) {
        const miejsce = next ? this.options.indexOf(next) : this.options.length;
        this.options = [...this.options.slice(0, miejsce), option, ...this.options.slice(miejsce)];
        option.parentNode = this;
      },
      appendChild(option) { this.insertBefore(option, null); } };
    for (const [value, textContent] of OPCJE) select.appendChild({ value, textContent, disabled: false });
    const attrs = {};
    const ctx = {
      Conv, currentSubstance: Conv.find(wybrane),
      localOverride: { sex: null, age: null, tanner: null, cycle_phase: null, menarche: null, ...override },
      overrideCycleEl: select,
      overrideMenarcheWrapEl: { hidden: true },
      overrideMenarcheEl: { placeholder: 'np. 12,5', attrs, setAttribute(name, value) { attrs[name] = value; }, removeAttribute(name) { delete attrs[name]; } },
      overrideMenarcheNoteEl: { textContent: '', hidden: true },
    };
    select.value = ctx.localOverride.cycle_phase || '';
    vm.createContext(ctx);
    vm.runInContext(formatKod() + widokKod(), ctx);
    // Ta sama kolejność co w renderPatientSummary strony; wTrakcieWpisu = zdarzenie „input” pola liczbowego.
    const rysuj = (patient, { wTrakcieWpisu = false } = {}) => {
      let reference = ctx.referenceContextFor(patient);
      const odrzucono = !wTrakcieWpisu && ctx.dropUnavailableCyclePhase(reference);
      if (odrzucono) { patient = { ...patient, cycle_phase: null }; reference = ctx.referenceContextFor(patient); }
      ctx.renderCyclePhaseOptions(reference, wTrakcieWpisu ? ctx.localOverride.cycle_phase : null);
      ctx.renderMenarcheOverrideState(patient, reference);
      return { odrzucono, opcje: select.options.map((o) => o.value + (o.disabled ? '!' : '')), wybor: select.value,
        pole: ctx.overrideMenarcheWrapEl.hidden === false, placeholder: ctx.overrideMenarcheEl.placeholder,
        nota: ctx.overrideMenarcheNoteEl.hidden === false ? ctx.overrideMenarcheNoteEl.textContent : null, attrs: { ...attrs } };
    };
    return { ctx, select, rysuj };
  }
  const WSZYSTKIE = OPCJE.map(([value]) => value);
  const BEZ_POSTMENOPAUZY = WSZYSTKIE.filter((value) => value !== 'postmenopause');
  const FAZY_WYLACZONE = BEZ_POSTMENOPAUZY.map((value) => ['follicular', 'ovulation', 'luteal'].includes(value) ? value + '!' : value);

  it('scenariusz A: po progu — bez Postmenopauzy, fazy do wyboru, placeholder „(z danych: 10,0)”, bez noty', () => {
    const w = atrapa().rysuj(dziewczynka(15, { tanner: 5, menarche_age_years: 10, _shared_menarche: 10, _menarche_overridden: false }));
    expect(w).toEqual({ odrzucono: false, opcje: BEZ_POSTMENOPAUZY, wybor: '', pole: true, placeholder: '(z danych: 10,0)', nota: null, attrs: {} });
  });

  it('scenariusz C: przed progiem — fazy wyszarzone, nota z liczbą lat „(1,0)”', () => {
    const w = atrapa().rysuj(dziewczynka(13, { tanner: 4, menarche_age_years: 12, _shared_menarche: 12, _menarche_overridden: false }));
    expect(w).toMatchObject({ opcje: FAZY_WYLACZONE, pole: true, placeholder: '(z danych: 12,0)',
      nota: 'Fazy cyklu nie zmieniają zakresu estradiolu: od menarche minęło mniej niż 5 lat (1,0).' });
  });

  it('scenariusz D: brak wpisu — fazy wyszarzone, placeholder „np. 12,5”, nota o wpisaniu wieku menarche', () => {
    const w = atrapa().rysuj(dziewczynka(16, { tanner: 5, menarche_age_years: null, _shared_menarche: null, _menarche_overridden: false }));
    expect(w).toMatchObject({ opcje: FAZY_WYLACZONE, pole: true, placeholder: 'np. 12,5',
      nota: 'Fazy cyklu działają poniżej 18 lat dopiero po 5 latach od menarche. Wpisz „Wiek menarche” tutaj (tylko dla tego sprawdzenia) albo na stałe w „+ Dane pokwitaniowe” na stronie głównej.' });
  });

  it('scenariusz G: wpis lokalny 11,0 — fazy do wyboru, nota znika; wpis odrzucony przez silnik jest oznaczony', () => {
    const a = atrapa({ override: { menarche: 11 } });
    expect(a.rysuj(dziewczynka(16, { tanner: 5, menarche_age_years: 11, _shared_menarche: null, _menarche_overridden: true })))
      .toMatchObject({ opcje: BEZ_POSTMENOPAUZY, pole: true, nota: null, attrs: {} });
    const odrzucony = a.rysuj(dziewczynka(16, { tanner: 5, menarche_age_years: 25, _shared_menarche: 10, _menarche_overridden: true }));
    expect(odrzucony).toMatchObject({ opcje: FAZY_WYLACZONE, placeholder: 'np. 12,5', attrs: { 'aria-invalid': 'true' } });
    expect(odrzucony.nota).toMatch(/^Fazy cyklu działają poniżej 18 lat dopiero po 5 latach od menarche\./);
  });

  it('wybór niedostępny dla pacjenta wraca do „nieznana”: zwykła faza przed progiem i postmenopauza poniżej 18 lat', () => {
    const faza = atrapa({ override: { cycle_phase: 'luteal' } });
    expect(faza.rysuj(dziewczynka(16, { tanner: 5, cycle_phase: 'luteal' }))).toMatchObject({ odrzucono: true, wybor: '', opcje: FAZY_WYLACZONE });
    expect(faza.ctx.localOverride.cycle_phase).toBeNull();
    const post = atrapa({ wybrane: 'prolactin', override: { cycle_phase: 'postmenopause' } });
    expect(post.rysuj({ sex: 'F', age: 16, life_stage: 'pediatric', cycle_phase: 'postmenopause' })).toMatchObject({ odrzucono: true, wybor: '', opcje: BEZ_POSTMENOPAUZY, pole: false, nota: null });
    expect(post.ctx.localOverride.cycle_phase).toBeNull();
    // Wybór dostępny zostaje: ciąża u nieletniej, faza po progu, postmenopauza u dorosłej.
    const ciaza = atrapa({ override: { cycle_phase: 'pregnancy_t1' } });
    expect(ciaza.rysuj(dziewczynka(16, { tanner: 5, cycle_phase: 'pregnancy_t1' }))).toMatchObject({ odrzucono: false, wybor: 'pregnancy_t1' });
    const poProgu = atrapa({ override: { cycle_phase: 'luteal' } });
    expect(poProgu.rysuj(dziewczynka(16, { menarche_age_years: 11, cycle_phase: 'luteal' }))).toMatchObject({ odrzucono: false, wybor: 'luteal' });
    const dorosla = atrapa({ override: { cycle_phase: 'postmenopause' } });
    expect(dorosla.rysuj({ sex: 'F', age: 55, life_stage: 'adult', cycle_phase: 'postmenopause' })).toMatchObject({ odrzucono: false, wybor: 'postmenopause', opcje: WSZYSTKIE, pole: false });
  });

  it('inne badanie z tym selektorem (prolaktyna): nieletnia bez Postmenopauzy, fazy do wyboru; dorosła — pełna lista', () => {
    const a = atrapa({ wybrane: 'prolactin' });
    expect(a.rysuj({ sex: 'F', age: 16, life_stage: 'pediatric' })).toMatchObject({ opcje: BEZ_POSTMENOPAUZY, pole: false, nota: null });
    expect(a.rysuj({ sex: 'F', age: 30, life_stage: 'adult' })).toMatchObject({ opcje: WSZYSTKIE, pole: false, nota: null });
    // Powrót do nieletniej i z powrotem zachowuje kolejność i te same elementy opcji.
    expect(a.rysuj({ sex: 'F', age: 12, life_stage: 'pediatric' }).opcje).toEqual(BEZ_POSTMENOPAUZY);
    expect(a.rysuj({ sex: 'F', life_stage: 'adult' }).opcje).toEqual(WSZYSTKIE);
  });

  it('w trakcie wpisywania liczby wybrana faza zostaje; zatwierdzony wpis rozstrzyga o jej dostępności', () => {
    // Dorosła z wybraną postmenopauzą wpisuje wiek „65”: po pierwszej cyfrze („6”) pacjentka jest przez chwilę nieletnia.
    const a = atrapa({ wybrane: 'prolactin', override: { cycle_phase: 'postmenopause' } });
    const szesc = { sex: 'F', age: 6, life_stage: 'pediatric', cycle_phase: 'postmenopause' };
    expect(a.rysuj(szesc, { wTrakcieWpisu: true })).toMatchObject({ odrzucono: false, wybor: 'postmenopause', opcje: WSZYSTKIE });
    expect(a.ctx.localOverride.cycle_phase).toBe('postmenopause');
    expect(a.rysuj({ sex: 'F', age: 65, life_stage: 'adult', cycle_phase: 'postmenopause' }, { wTrakcieWpisu: true }))
      .toMatchObject({ odrzucono: false, wybor: 'postmenopause', opcje: WSZYSTKIE });
    expect(a.rysuj({ sex: 'F', age: 65, life_stage: 'adult', cycle_phase: 'postmenopause' })).toMatchObject({ odrzucono: false, wybor: 'postmenopause' });
    // Zatwierdzony wiek 6 lat: postmenopauza nie dotyczy — wybór wraca do „nieznana”, opcja znika.
    expect(a.rysuj(szesc)).toMatchObject({ odrzucono: true, wybor: '', opcje: BEZ_POSTMENOPAUZY });
    // Estradiol: faza lutealna u dorosłej, wpisywany wiek „35” przechodzi przez „3”.
    const e = atrapa({ override: { cycle_phase: 'luteal' } });
    expect(e.rysuj(dziewczynka(3, { cycle_phase: 'luteal' }), { wTrakcieWpisu: true }))
      .toMatchObject({ odrzucono: false, wybor: 'luteal', opcje: ['', 'follicular!', 'ovulation!', 'luteal', 'pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3'] });
    // Silnik w tej chwili i tak nie używa niedostępnej fazy: zakres dziecka, nie zakres lutealny dorosłej.
    expect(wybierz(dziewczynka(3, { cycle_phase: 'luteal' }))).toMatchObject({ id: 'e2_F_prepubertal_age' });
    expect(e.rysuj({ sex: 'F', age: 35, life_stage: 'adult', cycle_phase: 'luteal' }, { wTrakcieWpisu: true })).toMatchObject({ wybor: 'luteal', opcje: WSZYSTKIE });
    expect(e.ctx.localOverride.cycle_phase).toBe('luteal');
  });

  it('opcja spoza listy strony nie jest ruszana, a jej wybór zostaje', () => {
    const a = atrapa({ override: { cycle_phase: 'fikcyjny-kontekst' } });
    a.select.appendChild({ value: 'fikcyjny-kontekst', textContent: 'Fikcyjny kontekst', disabled: false });
    a.select.value = 'fikcyjny-kontekst';
    expect(a.rysuj({ sex: 'F', age: 35, life_stage: 'adult', cycle_phase: 'fikcyjny-kontekst' }))
      .toMatchObject({ odrzucono: false, wybor: 'fikcyjny-kontekst', opcje: [...WSZYSTKIE, 'fikcyjny-kontekst'] });
    expect(a.rysuj({ sex: 'F', age: 15, life_stage: 'pediatric', menarche_age_years: 10, cycle_phase: 'fikcyjny-kontekst' }))
      .toMatchObject({ odrzucono: false, wybor: 'fikcyjny-kontekst', opcje: [...BEZ_POSTMENOPAUZY, 'fikcyjny-kontekst'] });
    // Postmenopauza wraca na swoje miejsce — przed opcjami ciąży, nie na koniec listy.
    expect(a.rysuj({ sex: 'F', age: 35, life_stage: 'adult', cycle_phase: 'fikcyjny-kontekst' }).opcje).toEqual([...WSZYSTKIE, 'fikcyjny-kontekst']);
  });

  it('estradiol u dorosłej, u mężczyzny i bez wieku: pełna lista, bez pola i bez noty', () => {
    for (const patient of [{ sex: 'F', age: 30, life_stage: 'adult' }, { sex: 'F', life_stage: 'adult' }]) {
      expect(atrapa().rysuj(patient)).toMatchObject({ opcje: WSZYSTKIE, pole: false, nota: null, placeholder: 'np. 12,5' });
    }
    expect(atrapa().rysuj({ sex: 'M', age: 15, life_stage: 'pediatric' })).toMatchObject({ opcje: BEZ_POSTMENOPAUZY, pole: false, nota: null });
  });
});

describe('strona: wiersz pod opisem pacjenta (R1) i reguły czyszczenia', () => {
  const ctx = {
    Conv, window: { LabUnitConverter: Conv }, document: { getElementById: () => null },
    readPatientFromShared: () => ({ sex: 'F', age: 15, tanner: 5 }), currentSubstance: Conv.find('estradiol'),
  };
  vm.createContext(ctx);
  vm.runInContext(wytnij('    var CYCLE_AWARE = {', '    // Substancje z silnym rytmem dobowym')
    + wytnij('    function tannerMattersForPatient(substance, patient) {', '    function renderPatientSummary() {'), ctx);
  const ZMIEN = ' Jeśli faza cyklu jest znana, wybierz ją w „Zmień ▼".';

  it('po progu: wiersz R1; przy nieznanej fazie ze wskazówką o „Zmień ▼”, przy wybranej — sam wiersz', () => {
    const p = dziewczynka(15, { tanner: 5, menarche_age_years: 10 });
    expect(ctx.buildClinicalHint(p)).toBe(R1 + ZMIEN);
    expect(ctx.buildClinicalHint({ ...p, cycle_phase: 'luteal' })).toBe(R1);
    expect(ctx.buildClinicalHint({ ...p, cycle_phase: 'pregnancy_t1' })).toBe(R1);
    // Etap życia strony bywa „adult” (brak wieku w danych wspólnych) — wskazówka dorosłej o menopauzie nie dochodzi.
    expect(ctx.buildClinicalHint({ ...p, life_stage: 'adult' })).toBe(R1 + ZMIEN);
  });

  it('przed progiem i bez wpisu: bez wiersza; dorosła zachowuje dotychczasową wskazówkę o fazie lub menopauzie', () => {
    expect(ctx.buildClinicalHint(dziewczynka(13, { tanner: 4, menarche_age_years: 12 }))).toBe('');
    expect(ctx.buildClinicalHint(dziewczynka(16, { tanner: 5 }))).toBe('');
    expect(ctx.buildClinicalHint({ sex: 'F', age: 30, life_stage: 'adult' })).toBe('Jeśli faza cyklu lub menopauza jest znana, wybierz ją w „Zmień ▼".');
    expect(ctx.buildClinicalHint({ sex: 'F', age: 30, life_stage: 'adult', cycle_phase: 'luteal' })).toBe('');
  });

  it('lokalny wiek menarche znika z resetem, zmianą osoby i zmianą płci — razem z pozostałymi nadpisaniami', () => {
    const reset = wytnij('    function resetLocalPatientOverride() {', '\n    }\n');
    expect(reset).toContain('localOverride = { sex: null, age: null, tanner: null, cycle_phase: null, menarche: null };');
    expect(reset).toContain("if (typeof overrideMenarcheEl !== 'undefined' && overrideMenarcheEl) overrideMenarcheEl.value = '';");
    const srodowisko = { overrideSexEl: { value: 'F' }, overrideAgeEl: { value: '16' }, overrideAgeMonthsEl: { value: '' },
      overrideCycleEl: { value: 'luteal' }, overrideTannerEl: { value: '5' }, overrideMenarcheEl: { value: '11,0' },
      localOverride: { sex: 'F', age: 16, tanner: 5, cycle_phase: 'luteal', menarche: 11 } };
    vm.createContext(srodowisko);
    vm.runInContext(reset + '\n    }\n', srodowisko);
    srodowisko.resetLocalPatientOverride();
    expect(vm.runInContext('localOverride', srodowisko)).toEqual({ sex: null, age: null, tanner: null, cycle_phase: null, menarche: null });
    expect(srodowisko.overrideMenarcheEl.value).toBe('');
    // Ten sam reset wołają: „Resetuj do danych pacjenta”, zmiana tożsamości pacjenta i czyszczenie formularza.
    expect(wytnij('    function syncPatientIdentity() {', '\n    }\n')).toContain('resetLocalPatientOverride();');
    expect(wytnij('    function resetLabForm() {', '\n    }\n')).toContain('resetLocalPatientOverride();');
    expect(wytnij("    if (overrideResetEl) overrideResetEl.addEventListener('click', function () {", '\n    });')).toContain('resetLocalPatientOverride();');
    expect(html).toContain("if (overrideMenarcheEl) overrideMenarcheEl.addEventListener('input', onOverrideChange);");
    // Przecinek albo kropka — ten sam parser co pole wyniku.
    expect([Conv.parseNumber('11,0'), Conv.parseNumber('12.5'), Number.isNaN(Conv.parseNumber(''))]).toEqual([11, 12.5, true]);
  });

  it('obsługa zmian panelu: wpis lokalny wieku menarche, płeć M czyści go, „input” odracza odrzucenie fazy do „change”', () => {
    const odswiezenia = [];
    const panel = {
      Conv, overrideSexEl: { value: '' }, overrideAgeEl: { value: '' }, overrideAgeMonthsEl: { value: '' },
      overrideCycleEl: { value: 'luteal' }, overrideTannerEl: { value: '' }, overrideMenarcheEl: { value: '11,5' },
      localOverride: { sex: null, age: null, tanner: null, cycle_phase: null, menarche: null },
      readPatientFromShared: () => ({ sex: 'F', age: 16 }), cyclePhaseDropDeferred: false,
      refreshPatientContext() { odswiezenia.push(panel.cyclePhaseDropDeferred); },
    };
    vm.createContext(panel);
    vm.runInContext(wytnij('    function onOverrideChange(event) {', '\n    }\n') + '\n    }\n', panel);
    const stan = () => vm.runInContext('localOverride', panel);
    panel.onOverrideChange({ type: 'input' });
    expect(stan()).toEqual({ sex: null, age: null, tanner: null, cycle_phase: 'luteal', menarche: 11.5 });
    panel.overrideMenarcheEl.value = '12.25';
    panel.onOverrideChange({ type: 'change' });
    expect(stan().menarche).toBe(12.25);
    panel.onOverrideChange();
    // Odroczenie tylko w trakcie odświeżenia wywołanego zdarzeniem „input”; po nim flaga wraca do zera.
    expect(odswiezenia).toEqual([true, false, false]);
    expect(panel.cyclePhaseDropDeferred).toBe(false);
    for (const [wpis, wartosc] of [['', null], ['abc', null], ['11', 11], [' 10,5 ', 10.5]]) {
      panel.overrideMenarcheEl.value = wpis;
      panel.onOverrideChange({ type: 'input' });
      expect(stan().menarche, wpis).toBe(wartosc);
    }
    panel.overrideMenarcheEl.value = '11';
    panel.overrideSexEl.value = 'M';
    panel.onOverrideChange({ type: 'change' });
    expect(stan()).toMatchObject({ sex: 'M', cycle_phase: null, menarche: null });
    expect([panel.overrideMenarcheEl.value, panel.overrideCycleEl.value]).toEqual(['', '']);
    // Koniec wpisu w polach liczbowych („change”, „blur”) woła tę samą obsługę — już bez odroczenia.
    panel.overrideSexEl.value = '';
    panel.onOverrideChange({ type: 'blur' });
    expect(odswiezenia[odswiezenia.length - 1]).toBe(false);
    const konce = wytnij('    [overrideAgeEl, overrideAgeMonthsEl, overrideMenarcheEl].forEach(function (node) {', '\n    });');
    expect(konce).toContain("node.addEventListener('change', onOverrideChange);");
    expect(konce).toContain("node.addEventListener('blur', onOverrideChange);");
    const widok = wytnij('    function renderPatientSummary() {', '\n    }\n');
    expect(widok).toContain('if (!cyclePhaseDropDeferred && dropUnavailableCyclePhase(reference)) {');
    expect(widok).toContain('renderCyclePhaseOptions(reference, cyclePhaseDropDeferred ? localOverride.cycle_phase : null);');
  });
});
