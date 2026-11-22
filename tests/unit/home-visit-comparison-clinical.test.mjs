import { describe, expect, it, vi } from 'vitest';
import { appSrc, funkcjaZ, oknoZSilnikiem, tablica, wczytajDoOkna } from '../support/silnik-bmi.mjs';

function setup() {
  const win = oknoZSilnikiem({ __VILDA_HOME_GABINET_PREVIEW__: true });
  const files = ['vilda_dob_age.js', 'vilda_masa.js', 'vilda_sds_wzrostu.js', 'vilda_puberty_assessment.js',
    'vilda_trajectory_analysis.js', 'vilda_tempo_wzrastania.js', 'vilda_home_visit_projection.js',
    'vilda_home_visit_comparison_model.js', 'vilda_home_comparison_clinical.js'];
  for (const file of files) wczytajDoOkna(win, file);
  for (const name of ['LMS_INFANT_HEIGHT_BOYS', 'LMS_HEIGHT_WHO_BOYS', 'LMS_HEIGHT_BOYS']) win[name] = tablica(name);
  win.VildaSdsWzrostu.ustawDane({ palCentyl: (s, a, c) => win.VildaCentileInterp.palCentileValue(s, a, c, 'HT') });
  win.BMI = new Function('CM_TO_M', 'return ' + funkcjaZ(appSrc, 'BMI'))(100);
  win.vildaWiekDoSiatek = new Function('window', 'return ' + funkcjaZ(appSrc, 'vildaWiekDoSiatek'))(win);
  return win;
}

function visit(id, when, fields, source = 'OLAF', clinical = {}) {
  return { patientId: 'A', visitId: id, clinicalDateISO: when, origin: 'explicit',
    payload: { user: { measuredAtISO: when, sex: 'M', ...fields }, zscore: { dataSource: source }, clinical } };
}
const first = { age: 8, ageMonths: 2, weight: 26, height: 126, waist: 58, hip: 66 };
const last = { age: 8, ageMonths: 9, weight: 29.5, height: 129, waist: 61, hip: 68 };
const metric = (report, key) => report.rows.find(item => item.key === key);

describe('zmiana od poprzedniej wizyty', () => {
  it('porównuje samą masę dorosłego bez zakładania wzrostu, BMI lub oceny kierunku', () => {
    const win = setup(), clinical = win.VildaHomeComparisonClinical;
    const a = visit('a', '2026-01-01', { age: 45, weight: '92,5' });
    const b = visit('b', '2026-11-01', { age: 46, weight: 90 });
    expect(clinical.hasMeasurements(a)).toBe(true);
    expect(clinical.sharesMeasurements(a, b)).toBe(true);
    expect(clinical.sharesMeasurements(a, visit('c', null, { height: 180 }))).toBe(false);
    expect(clinical.hasMeasurements(visit('c', null, { height: 0, weight: '', waist: -1 }))).toBe(false);
    const result = clinical.compare(a, b);
    expect(result.rows.map(r => r.key)).toEqual(['weight']);
    expect(result.rows[0]).toMatchObject({ before: 92.5, after: 90, delta: -2.5, deltaSds: null, interpretation: null });
    expect(result.rows[0].detail).toContain('2,7%');
    expect(result.velocity).toBeNull();
    expect(clinical.compare(a, {...b, patientId: 'B'}).rows).toEqual([]);
    expect(clinical.compare(a, a).rows).toEqual([]);
  });

  it('stosuje własny wiek i siatkę każdego punktu; BMI i SDS pochodzą z silnika', () => {
    const w = setup();
    const a = visit('a', '2025-01-10', { ...first, dobISO: '2016-11-09' });
    const b = visit('b', '2025-08-10', { ...last, dobISO: '2016-11-09' });
    const original = JSON.stringify([a, b]);
    const result = w.VildaHomeComparisonClinical.compare(a, b), bmi = metric(result, 'bmi');
    const expected = [a, b].map(row => {
      const user = row.payload.user;
      const age = w.VildaDobAge.ageFromDobISO(user.dobISO, new Date(user.measuredAtISO + 'T12:00:00'));
      return w.VildaBmi.ocen({ wiekMies: w.VildaDobAge.exactMonthsFromDays(age.days), plec: 'M',
        bmi: w.BMI(user.weight, user.height), zrodlo: 'OLAF', populacja: 'OGOLNA', dorosly: false });
    });
    expect(bmi.deltaSds).toBeCloseTo(expected[1].sds - expected[0].sds, 8);
    expect(bmi.reference).toBe('OLAF');
    expect(bmi.interpretation.text).toContain('BMI');
    expect(metric(result, 'height').deltaSds).not.toBeNull();
    expect(metric(result, 'cole').before).toBeGreaterThan(0);
    expect(metric(result, 'whr').delta).toBeCloseTo(61 / 68 - 58 / 66);
    expect(metric(result, 'waist').interpretation).toBeNull();
    expect(result.velocity.text).toContain('cm/rok');
    expect(JSON.stringify([a, b])).toBe(original);
  });

  it('odróżnia wybraną siatkę i rzeczywiste źródło każdego pomiaru', () => {
    const w = setup();
    const a = visit('a', '2025-01-10', first), b = visit('b', '2025-08-10', last, 'WHO');
    const changed = w.VildaHomeComparisonClinical.compare(a, b);
    expect(metric(changed, 'bmi').delta).toBeGreaterThan(0);
    expect(metric(changed, 'height').deltaSds).toBeNull();
    expect(metric(changed, 'cole')).toBeUndefined();
    expect(changed.referenceNote).toMatch(/Różne siatki/);
    b.payload.zscore.dataSource = '';
    expect(w.VildaHomeComparisonClinical.compare(a, b).referenceNote).toContain('siatce');
    b.payload.zscore.dataSource = 'OLAF';
    b.payload.user.sex = 'F';
    expect(metric(w.VildaHomeComparisonClinical.compare(a, b), 'bmi').interpretation).toBeNull();
    b.payload.user.sex = 'M';
    w.advHistoryCalcAnthroStatsForSource = vi.fn((weight, sex, age, kind, source) => {
      if (source === 'OLAF' && weight === first.weight) return null;
      return { sd: 0.1, percentile: 54 };
    });
    const fallback = w.VildaHomeComparisonClinical.compare(a, b);
    expect(metric(fallback, 'weight').deltaSds).toBeNull();
    expect(fallback.referenceNote).toMatch(/Różne siatki/);
  });

  it('zachowuje siatki DS po osiemnastych urodzinach i nie nadaje normy tempa populacji ogólnej', () => {
    const w = setup(), ds = { downSyndrome: true };
    const a = visit('a', '2024-01-01', { age: 18, weight: 55, height: 150 }, 'OLAF', ds);
    const b = visit('b', '2025-01-01', { age: 19, weight: 56, height: 152 }, 'WHO', ds);
    const report = w.VildaHomeComparisonClinical.compare(a, b);
    expect(metric(report, 'bmi').reference).toBe('DS');
    expect(report.velocity).toMatchObject({ tone: null });
    expect(report.velocity.text).not.toMatch(/zwolnion|prawidłow/);
  });

  it('tempo wymaga dwóch dat pomiaru i co najmniej sześciu miesięcy rzeczywistego odstępu', () => {
    const w = setup(), a = visit('a', '2025-01-10', first);
    // Celowo stała data *wizyty*. Data zapisu ani duża deklarowana zmiana wieku nie zastępują daty pomiaru.
    for (const measuredAtISO of [undefined, '2025-01-10', '2025-07-09']) {
      const b = visit('b', '2025-12-31', { ...last, measuredAtISO });
      expect(w.VildaHomeComparisonClinical.compare(a, b).velocity).toBeNull();
    }
    const b = visit('b', '2025-07-30', last);
    const report = w.VildaHomeComparisonClinical.compare(a, b);
    expect(report.velocity.text).toContain('5,5 cm/rok');
    expect(metric(report, 'weight').delta).toBe(3.5);
  });

  it('opisuje kategorię BMI dorosłego i chroni kontekst rodzinny dziecka przed stanem innego formularza', () => {
    const w = setup();
    const a = visit('a', '2024-01-01', {age: 35, height: 175, weight: 75});
    const b = visit('b', '2025-01-01', {age: 36, height: 175, weight: 85});
    const adult = metric(w.VildaHomeComparisonClinical.compare(a, b), 'bmi');
    expect(adult.interpretation).toEqual({text: 'Prawidłowe → Nadwaga', tone: 'warn'});
    expect(adult.deltaSds).toBeNull();
    const c = visit('c', '2024-01-01', first), d = visit('d', '2025-01-01', last);
    d.payload.advanced = {motherHeight: 165, fatherHeight: 180};
    w.vildaMpSdsStats = vi.fn(() => { throw new Error('odczyt niezwiązany z wizytą'); });
    const child = w.VildaHomeComparisonClinical.compare(c, d);
    expect(child.context).toContain('Kanał rodzicielski (MPH)');
    expect(w.vildaMpSdsStats).not.toHaveBeenCalled();
    d.payload.zscore.dataSource = '';
    expect(w.VildaHomeComparisonClinical.compare(c, d).velocity.tone).toBeNull();
  });

  it('bierze kontekst nakładających się kursów z porównywanej wizyty, także przy samej masie', () => {
    const w = setup();
    const a = visit('a', '2024-01-01', {age: 35, weight: 100});
    const b = visit('b', '2025-01-01', {age: 36, weight: 90});
    b.payload.obesityTherapyPoints = [{type: 'start', ageYears: 35, ageMonths: 4}];
    b.payload.ghTherapyPoints = [{type: 'start', ageYears: 12}, {type: 'end', ageYears: 14}];
    expect(w.VildaHomeComparisonClinical.compare(a, b).context).toEqual(['Leczenie otyłości']);
    delete b.payload.obesityTherapyPoints;
    expect(w.VildaHomeComparisonClinical.compare(a, b).context).toEqual([]);
  });
});
