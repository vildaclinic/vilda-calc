/* Read-only clinical projection of two different encounters. Reference selection
 * and trajectory verdicts belong to the same native engines as the patient report. */
(function (w) {
  'use strict';
  if (w.__VILDA_HOME_GABINET_PREVIEW__ !== true) return;

  const fields = {
    height: ['Wzrost', 'cm', 1], weight: ['Masa ciała', 'kg', 1], bmi: ['BMI', 'kg/m²', 1],
    waist: ['Obwód talii', 'cm', 1], hip: ['Obwód bioder', 'cm', 1], whr: ['WHR', '', 2],
    cole: ['Wskaźnik Cole’a', '%', 1]
  };
  const direct = ['height', 'weight', 'waist', 'hip'];
  const references = ['OLAF', 'PALCZEWSKA', 'WHO', 'DS'];
  const tones = {bad: 'alert', warn: 'warn', stable: 'ok', good: 'ok'};

  const percentage = new Intl.NumberFormat('pl-PL', {
    maximumFractionDigits: 1, minimumFractionDigits: 1, signDisplay: 'exceptZero'
  });

  function positive(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const numeric = Number(String(value).trim().replace(',', '.'));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function hasMeasurements(row) {
    return direct.some(key => positive(row?.payload?.user?.[key]) !== null);
  }

  function sharesMeasurements(before, after) {
    return direct.some(key => positive(before?.payload?.user?.[key]) !== null &&
      positive(after?.payload?.user?.[key]) !== null);
  }

  function point(row) {
    const payload = row.payload, user = payload.user || {};
    const measured = w.VildaHomeVisitComparisonModel.measurementDate(row);
    const age = w.VildaHomeVisitProjection.project({...row, clinicalDateISO: measured});
    const sex = user.sex === 'K' ? 'F' : user.sex === 'F' || user.sex === 'M' ? user.sex : null;
    const source = payload.clinical?.downSyndrome === true ? 'DS' : String(payload.zscore?.dataSource || '').trim().toUpperCase();
    const population = source === 'DS' ? 'DS' : 'OGOLNA';
    const full = age.ageMonths;
    const precise = age.exactAgeMonths ?? full;
    // At the 36/216/240 month boundaries keep the native age gate consistent
    // with the form even when the exact WHO/LMS age straddles a birthday.
    const months = Number.isFinite(precise) && typeof w.vildaWiekDoSiatek === 'function'
      ? w.vildaWiekDoSiatek(precise, full, population) : precise;
    const adult = full === null || !w.VildaBmi ? null : w.VildaBmi.dorosly(full, population);
    const values = Object.fromEntries(direct.map(key => [key, positive(user[key])]));
    values.bmi = values.weight && values.height ? positive(w.BMI?.(values.weight, values.height)) : null;
    values.whr = values.waist && values.hip ? values.waist / values.hip : null;
    return {row, user, measured, full, months, sex, source, population, adult, values};
  }

  // Palczewska supplies native weight centiles across childhood (the same
  // accessor used in the summary). For uncovered ages use the mass engine's
  // explicit candidates. Never consult the current patient's population here.
  function weightStat(p) {
    const candidates = p.population === 'DS' ? ['DS']
      : new Set([p.source, ...(w.VildaMasa?.kandydaci(p.source, p.full, p.population) || [])]);
    for (const source of candidates) {
      const age = source === 'WHO' && p.full < w.VildaMasa?.G.OLAF_MIN_M ? p.months : p.full;
      const stat = w.advHistoryCalcAnthroStatsForSource?.(p.values.weight, p.sex, age / 12, 'WT', source);
      if (Number.isFinite(stat?.sd) && Number.isFinite(stat.percentile)) {
        return {sds: stat.sd, centyl: stat.percentile, siatka: source};
      }
    }
    return null;
  }

  function stat(p, key) {
    const options = {plec: p.sex, wiekMies: p.months, zrodlo: p.source, populacja: p.population};
    if (key === 'height') return w.VildaSdsWzrostu?.policz({...options, wzrost: p.values.height});
    if (key === 'weight') return weightStat(p);
    if (key === 'bmi') return w.VildaBmi?.ocen({...options, bmi: p.values.bmi, dorosly: false});
    return w.VildaBmi?.cole({...options, bmi: p.values.bmi});
  }

  function interpretation(verdict) {
    return verdict?.l ? {text: verdict.l, tone: tones[verdict.t] || null} : null;
  }

  function velocity(a, b) {
    const engine = w.VildaTempoWzrastania;
    if (!engine || a.adult !== false || b.adult !== false || !a.sex || a.sex !== b.sex ||
        !a.values.height || !b.values.height || !a.measured || !b.measured || b.measured <= a.measured) return null;
    const calendar = w.VildaDobAge?.ageFromDobISO(a.measured, new Date(b.measured + 'T12:00:00'));
    if (!calendar || calendar.totalMonths < engine.P.ODCINEK_MIN_M) return null;
    const interval = engine.odcinek({ageMonths: 0, height: a.values.height},
      {ageMonths: w.VildaDobAge.exactMonthsFromDays(calendar.days), height: b.values.height});
    if (!Number.isFinite(interval?.cmPerYear)) return null;
    const growth = w.VildaPubertyAssessment?.gonadalContext(b.user, {scope: 'growth', sex: b.sex,
      currentAgeMonths: b.full, patientId: b.row.patientId, measuredAtISO: b.measured});
    const assessment = engine.ocenWartosc(interval.cmPerYear, interval.gapM, b.full, b.sex, {
      tannerStage: growth?.usableForGrowth ? growth.stage : null, tannerKind: growth?.kind, tannerAtAgeMonths: growth?.ageMonths
    });
    const formatted = engine.formatuj(assessment);
    if (!formatted) return null;
    // The native tempo engine has general-population screening standards only.
    if (a.population === 'DS' || b.population === 'DS' || !references.includes(a.source) || !references.includes(b.source)) {
      return {text: 'Tempo wzrastania · ' + formatted.wartosc, tone: null};
    }
    const cls = formatted.ocena?.cls;
    return {text: formatted.zdanie, tone: cls === 'stable' ? null : tones[cls] || null};
  }

  function visitContext(p, familyEligible) {
    const data = p.row.payload, family = data.advanced || {};
    const trajectory = w.VildaTrajectoryAnalysis;
    const target = familyEligible && trajectory?.mphFromParents(positive(family.motherHeight), positive(family.fatherHeight), p.sex);
    // The report projects midparental height at age 18. Give the height engine
    // the historical population explicitly, even when the live chart has changed.
    const reference = target ? w.VildaSdsWzrostu?.policz({wzrost: target, wiekMies: 18 * 12,
      plec: p.sex, zrodlo: p.source, populacja: p.population}) : null;
    const context = trajectory?.buildClinicalContext({ghTherapyPoints: data.ghTherapyPoints,
      obesityTherapyPoints: data.obesityTherapyPoints, mpSds: reference?.sds});
    return context && {...context, mphReference: reference?.siatka};
  }

  function compare(previous, current) {
    const result = {rows: [], velocity: null, context: [], referenceNote: ''};
    if (!previous?.visitId || !current?.visitId || !current.patientId || !previous.payload || !current.payload ||
        previous.patientId !== current.patientId || previous.visitId === current.visitId) return result;
    const a = point(previous), b = point(current), trajectory = w.VildaTrajectoryAnalysis;
    const children = a.adult === false && b.adult === false;
    const sameBasis = children && a.sex && a.sex === b.sex && references.includes(a.source) && a.source === b.source;
    const context = visitContext(b, sameBasis && b.population === 'OGOLNA');
    const intervals = {}, contextLabels = new Set();
    if (context && a.measured && b.measured > a.measured && a.months !== null && b.months > a.months) {
      const overlaps = course => trajectory.overlapM(course, a.months, b.months) > 0;
      if (context.ghKursy?.some(overlaps)) contextLabels.add('Leczenie hormonem wzrostu');
      for (const course of context.redKursy || []) {
        if (overlaps(course)) contextLabels.add('Leczenie otyłości' +
          (course.label && course.label !== 'otyłość' ? ' · ' + course.label : ''));
      }
    }
    let differentSources = children && a.source && b.source && a.source !== b.source;
    for (const [key, [label, unit, digits]] of Object.entries(fields)) {
      let before = a.values[key], after = b.values[key];
      if (key === 'cole') {
        if (!sameBasis || !a.values.bmi || !b.values.bmi) continue;
        const first = stat(a, key), last = stat(b, key);
        if (!first?.siatka || first.siatka !== last?.siatka) {
          if (first?.siatka && last?.siatka) differentSources = true;
          continue;
        }
        before = first.cole; after = last.cole;
      }
      if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
      const row = {key, label, unit, digits, before, after, delta: after - before,
        sdsBefore: null, sdsAfter: null, deltaSds: null, percentileBefore: null, percentileAfter: null,
        reference: null, interpretation: null, detail: ''};
      if (key === 'weight') {
        const percent = row.delta / before * 100;
        row.detail = percentage.format(percent) + '% masy wyjściowej';
      } else if (key === 'bmi' && a.adult && b.adult) {
        const from = w.VildaBmi.kategoriaDorosly(before), to = w.VildaBmi.kategoriaDorosly(after);
        if (from?.etykieta && to?.etykieta) {
          row.interpretation = {text: from.etykieta === to.etykieta ? to.etykieta : from.etykieta + ' → ' + to.etykieta,
            tone: to.kolor === 'alert' ? 'alert' : to.kolor === 'improve' ? 'warn' : 'ok'};
        }
      }
      if (sameBasis && ['height', 'weight', 'bmi'].includes(key)) {
        const first = stat(a, key), last = stat(b, key);
        if (first?.siatka && last?.siatka && first.siatka !== last.siatka) differentSources = true;
        else if (first?.siatka && first.siatka === last?.siatka && Number.isFinite(first.sds) && Number.isFinite(last.sds)) {
          Object.assign(row, {reference: first.siatka, sdsBefore: first.sds, sdsAfter: last.sds,
            deltaSds: last.sds - first.sds, percentileBefore: first.centyl, percentileAfter: last.centyl});
          if (a.measured && b.measured > a.measured && b.full > a.full) {
            const basis = context?.mpSds != null && context.mphReference !== first.siatka ? {...context, mpSds: null} : context;
            const interval = trajectory?.pairVerdictInContext(key,
              {sd: first.sds, c: first.centyl, ageMonths: a.full, value: before},
              {sd: last.sds, c: last.centyl, ageMonths: b.full, value: after}, basis);
            if (interval) {
              intervals[key] = interval;
              row.interpretation = interpretation(interval.v);
              if (interval.mphOn) contextLabels.add('Kanał rodzicielski (MPH)');
            }
          }
        }
      }
      result.rows.push(row);
    }
    // The native weight verdict also takes a simultaneous BMI change into account.
    if (intervals.weight?.v && intervals.bmi?.v) {
      const weight = result.rows.find(row => row.key === 'weight'), bmi = result.rows.find(row => row.key === 'bmi');
      let verdict = trajectory.weightBmiOverlayVerdict(intervals.weight.v, weight.deltaSds, intervals.bmi.v, bmi.deltaSds);
      const addition = intervals.weight.dopisek;
      if (addition && verdict && !verdict.l.includes(addition)) verdict = w.VildaWerdykt?.zOgonem(verdict, addition) || verdict;
      weight.interpretation = interpretation(verdict);
    }
    if (differentSources) result.referenceNote = 'Różne siatki odniesienia. Dla tych pomiarów dostępna jest zmiana wartości bez różnicy SDS.';
    else if (children && (!a.sex || !b.sex || a.sex !== b.sex || !sameBasis))
      result.referenceNote = 'Do porównania SDS potrzebne są zgodne dane o płci i siatce odniesienia.';
    result.context = Array.from(contextLabels);
    result.velocity = velocity(a, b);
    return result;
  }

  w.VildaHomeComparisonClinical = Object.freeze({compare, hasMeasurements, sharesMeasurements});
})(window);
