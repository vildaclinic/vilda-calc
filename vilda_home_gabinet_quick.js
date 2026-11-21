/* Isolated quick calculation on the doctor's start screen. Explicit reference
 * and inputs only: the selected patient's population, sex, age and form values
 * have no part in these results. All clinical calculations are native. */
(function (w) {
  'use strict';
  if (w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || w.__VILDA_HOME_GABINET_PREVIEW__ !== true) return;

  function number(value) {
    const text = String(value ?? '').trim().replace(',', '.');
    return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
  }

  function blank(value) {
    return value == null || String(value).trim() === '';
  }

  function error(errorField, message, kind = null) {
    return {kind, rows: [], errorField, message};
  }

  function childRow(metric, value, sex, ageMonths, source) {
    const height = metric === 'height';
    const stats = w.advHistoryCalcAnthroStatsForSource(value, sex, ageMonths / 12,
      height ? 'HT' : 'WT', source.toUpperCase());
    if (!stats || !Number.isFinite(stats.percentile) || !Number.isFinite(stats.sd)) return null;
    const {percentile, sd} = stats;
    const engine = w.VildaSdsWzrostu;
    const tone = w.VildaCentileLiveColors.tone(metric, percentile);
    return {
      key: metric, label: height ? 'Wzrost' : 'Masa ciała',
      value: engine.fmtCentyl(percentile) + (percentile < 1 || percentile > 99 ? ' centyla' : '. centyl'),
      detail: (height ? 'hSDS ' : 'wSDS ') + engine.fmtSds(sd) + ' · ' + (source === 'OLAF' ? 'OLAF / OLA' : source),
      tone: tone === 'neutral' ? 'normal' : tone, percentile, sds: sd, source
    };
  }

  function adultRows(years, sex, height, mass) {
    const kind = 'adult';
    if (typeof w.patientReportBuildAdultBmiPopulationSummaryText !== 'function' ||
        typeof w.BMI !== 'function' || typeof w.vildaUpdatePrepBsaHaycock !== 'function') {
      return {kind, rows: [], message: 'Podsumowanie dorosłych jest chwilowo niedostępne. Spróbuj ponownie.'};
    }
    const bmi = w.BMI(mass, height);
    const bsa = w.vildaUpdatePrepBsaHaycock(mass, height);
    if (!Number.isFinite(bmi) || !Number.isFinite(bsa)) return {kind, rows: [], message: 'Sprawdź masę i wzrost.'};
    const assessment = w.patientReportGetAdultBmiAssessment(bmi);
    const delta = w.patientReportBuildAdultBmiWeightDeltaSentence(mass, height, {lowercaseStart: true});
    const population = w.patientReportBuildAdultBmiPopulationSummaryText(bmi, sex, years);
    const bmiDetail = [w.patientReportGetAdultBmiSummaryStatusLabel(assessment.state), delta, population].filter(Boolean).join(' · ');
    const display = value => value.toLocaleString('pl-PL', {maximumFractionDigits: 2});
    return {kind, rows: [
      {key: 'weight', label: 'Waga', value: display(mass) + ' kg',
        detail: w.patientReportBuildAdultWeightPopulationSummaryText(mass, height, sex, years),
        tone: assessment.tone === 'normal' ? undefined : assessment.tone},
      {key: 'height', label: 'Wzrost', value: display(height) + ' cm',
        detail: w.patientReportBuildAdultHeightPopulationSummaryText(height, sex, years)},
      {key: 'bmi', label: 'BMI', value: w.VildaBmi.fmtBmi(bmi) + ' kg/m²', detail: bmiDetail, tone: assessment.tone},
      {key: 'bsa', label: 'Pow. ciała', value: bsa.toFixed(2).replace('.', ',') + ' m²'}
    ]};
  }

  function calculate(input = {}) {
    const years = number(input.years), months = blank(input.months) ? 0 : number(input.months);
    if (!Number.isInteger(years) || years > 130) return error('years', 'Wpisz wiek w pełnych latach od 0 do 130.');
    if (!Number.isInteger(months) || months > 11) return error('months', 'Wpisz dodatkowe miesiące od 0 do 11.');
    const ageMonths = years * 12 + months;
    const kind = years >= 18 ? 'adult' : 'child';
    const {sex} = input;
    if (sex !== 'M' && sex !== 'F') return error('sex', 'Wybierz płeć.', kind);
    const height = number(input.height), mass = number(input.mass);
    const hasHeight = !blank(input.height), hasMass = !blank(input.mass);
    if (hasHeight && (!Number.isFinite(height) || height <= 0)) return error('height', 'Wpisz wzrost większy od zera.', kind);
    if (hasMass && (!Number.isFinite(mass) || mass <= 0)) return error('mass', 'Wpisz masę ciała większą od zera.', kind);
    if (kind === 'adult') {
      if (!hasHeight || !hasMass) return error(hasHeight ? 'mass' : 'height', 'Uzupełnij wzrost i masę ciała do podsumowania.', kind);
      return adultRows(years, sex, height, mass);
    }
    if (!hasHeight && !hasMass) return error('mass', 'Wpisz masę ciała lub wzrost.', kind);
    const reference = input.reference || 'OLAF';
    if (!['OLAF', 'Palczewska'].includes(reference)) return error('reference', 'Wybierz siatki OLAF / OLA lub Palczewskiej.', kind);
    const limits = w.VildaSdsWzrostu?.G;
    if (!limits || !w.VildaCentileLiveColors || typeof w.advHistoryCalcAnthroStatsForSource !== 'function') {
      return {kind, rows: [], message: 'Obliczenia centylowe są chwilowo niedostępne. Spróbuj ponownie.'};
    }
    if (ageMonths < limits.PAL_MIN_M) return {kind, rows: [], message: 'Dla wieku poniżej 1 pełnego miesiąca obie wybrane siatki nie mają danych.'};
    const fallback = reference === 'OLAF' && ageMonths < limits.OLAF_MIN_M;
    const source = fallback ? 'Palczewska' : reference;
    const rows = [];
    if (hasMass) rows.push(childRow('weight', mass, sex, ageMonths, source));
    if (hasHeight) rows.push(childRow('height', height, sex, ageMonths, source));
    if (rows.includes(null)) return {kind, rows: rows.filter(Boolean), message: 'Brak danych odniesienia dla tego pomiaru.'};
    return {kind, rows, message: fallback ? 'Siatki OLAF / OLA rozpoczynają się w wieku 3 lat. Wyniki obliczono według siatek Palczewskiej.' : ''};
  }

  w.VildaHomeGabinetQuick = Object.freeze({calculate});
})(window);
