/* LH/FSH interpretation, preparation stage: not loaded by the application yet.
 * References and clinical thresholds are supplied explicitly by the caller.
 * See docs/clinical/LH_FSH.md. No DOM, storage, network or current-date access.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaLabPuberty = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var VERSION = '1.1.0';
  var DAY_MS = 86400000;
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function text(value, max) { return typeof value === 'string' ? value.trim().slice(0, max || 160) : ''; }
  function copy(value) { return value == null ? null : JSON.parse(JSON.stringify(value)); }
  function unique(values) { return Array.from(new Set(values)); }
  function flag(value) { return value === true || value === 'yes' ? 'yes' : value === false || value === 'no' ? 'no' : 'unknown'; }
  function operator(value) { return ({ '≤': '<=', '≥': '>=' })[value] || value; }
  function kind(value) {
    var key = text(value, 24).toUpperCase();
    return ({ TH: 'Th', M: 'Th', B: 'Th', G: 'G', P: 'P', PH: 'P', AX: 'Ax' })[key] || 'unspecified';
  }
  function dateISO(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    var parts = value.split('-').map(Number);
    if (parts[0] < 1900 || parts[0] > 2200) return null;
    var time = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    var d = new Date(time);
    return d.getUTCFullYear() === parts[0] && d.getUTCMonth() === parts[1] - 1 && d.getUTCDate() === parts[2]
      ? { time: time, year: parts[0], month: parts[1] - 1, day: parts[2] } : null;
  }
  function anniversary(birth, months) {
    var year = birth.year + Math.floor((birth.month + months) / 12);
    var month = (birth.month + months) % 12;
    var lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return Date.UTC(year, month, Math.min(birth.day, lastDay));
  }
  function missingAge(status, reason) {
    return { status: status, precision: null, source: null, lowerYears: null, upperYears: null, upperInclusive: false, ageDays: null, reasonCodes: [reason] };
  }
  function resolveAge(context) {
    context = context || {};
    var sample = dateISO(context.sampleDateISO);
    if (context.sampleDateISO != null && context.sampleDateISO !== '' && !sample) return missingAge('invalid', 'invalid_sample_date');
    if (context.birthDateISO != null && context.birthDateISO !== '') {
      var birth = dateISO(context.birthDateISO);
      if (!birth) return missingAge('invalid', 'invalid_birth_date');
      if (!sample) return missingAge('unknown', 'missing_sample_date');
      if (sample.time < birth.time) return missingAge('invalid', 'sample_before_birth');
      var months = (sample.year - birth.year) * 12 + sample.month - birth.month;
      if (anniversary(birth, months) > sample.time) months -= 1;
      var start = anniversary(birth, months);
      var end = anniversary(birth, months + 1);
      var years = (months + (sample.time - start) / (end - start)) / 12;
      return { status: 'known', precision: 'day', source: 'dates', lowerYears: years, upperYears: years, upperInclusive: true,
        ageDays: (sample.time - birth.time) / DAY_MS, reasonCodes: [], anniversaryPolicy: 'clamp-to-last-calendar-day' };
    }
    var age = context.age;
    if (!age || typeof age !== 'object') return missingAge('unknown', 'missing_age');
    if (!['year', 'month', 'day'].includes(age.precision)) return missingAge('unknown', 'missing_age_precision');
    if (!Number.isInteger(age.years) || age.years < 0 || age.years > 120) return missingAge('invalid', 'invalid_age');
    var m = age.precision === 'year' ? 0 : age.months;
    if (!Number.isInteger(m) || m < 0 || m > 11) return missingAge('invalid', 'invalid_age');
    var lo = age.years + m / 12;
    var hi = lo + (age.precision === 'year' ? 1 : 1 / 12);
    var inclusive = false;
    var reasons = [];
    if (age.precision === 'day') {
      if (!Number.isInteger(age.days) || age.days < 0 || age.days > 30) return missingAge('invalid', 'invalid_age');
      // Without dates the length of the calendar month is unknown. Do not invent DOB.
      lo += age.days / (31 * 12);
      // Residual days cannot fill or overrun the stated completed month.
      var shortestPossibleMonth = Math.max(28, age.days + 1);
      hi = age.years + m / 12 + age.days / (shortestPossibleMonth * 12);
      inclusive = true;
      if (age.days) reasons.push('manual_day_age_without_calendar_dates');
    }
    return { status: 'known', precision: age.precision, source: 'reported-age', lowerYears: lo, upperYears: hi,
      upperInclusive: inclusive, ageDays: null, reasonCodes: reasons };
  }
  function invalidMeasurement(raw, unit, reason) {
    return { status: 'invalid', raw: raw, operator: null, value: null, unit: null, sourceValue: null, sourceUnit: unit,
      isExact: false, plotValue: null, limitKind: null, reasonCodes: [reason] };
  }
  function parseMeasurement(rawValue, unit) {
    var sourceUnit = text(unit, 24);
    var raw = typeof rawValue === 'string' ? text(rawValue, 96) : finite(rawValue) ? String(rawValue) : '';
    var op, value = null, limitKind = null;
    if (!['IU/L', 'mIU/mL'].includes(sourceUnit)) return invalidMeasurement(raw, sourceUnit, 'unsupported_unit');
    if (rawValue && typeof rawValue === 'object') {
      op = operator(rawValue.operator || '=');
      value = rawValue.value;
      if (!['=', '<', '<=', '>', '>='].includes(op) || !finite(value)) return invalidMeasurement(raw, sourceUnit, 'invalid_measurement');
      raw = op === '=' ? String(value) : op + String(value);
    } else {
      var censored = raw.match(/^(<=|<|≤)\s*(LOD|LOQ)$/i);
      if (censored) { op = operator(censored[1]); limitKind = censored[2].toUpperCase(); }
      else {
        var parsed = raw.match(/^(<=|>=|<|>|=|≤|≥)?\s*((?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)$/i);
        if (!parsed) return invalidMeasurement(raw, sourceUnit, 'invalid_measurement');
        op = operator(parsed[1] || '=');
        value = Number(parsed[2].replace(',', '.'));
      }
    }
    if (value !== null && (!finite(value) || value < 0 || (op === '<' && value === 0))) return invalidMeasurement(raw, sourceUnit, 'invalid_measurement');
    return { status: 'valid', raw: raw, operator: op, value: value, unit: 'IU/L', sourceValue: value, sourceUnit: sourceUnit,
      isExact: op === '=' && value !== null, plotValue: op === '=' ? value : null, limitKind: limitKind,
      reasonCodes: limitKind ? ['unquantified_detection_limit'] : [] };
  }
  function interval(low, high, lowInclusive, highInclusive) {
    return { low: low, high: high, lowInclusive: lowInclusive, highInclusive: highInclusive };
  }
  function ageInterval(age) { return interval(age.lowerYears, age.upperYears, true, age.upperInclusive); }
  function measurementInterval(m) {
    if (m.value === null) return null;
    if (m.operator === '=') return interval(m.value, m.value, true, true);
    if (m.operator === '<' || m.operator === '<=') return interval(0, m.value, true, m.operator === '<=');
    return interval(m.value, Infinity, m.operator === '>=', false);
  }
  function boundsInterval(bounds) {
    if (!bounds || typeof bounds !== 'object') return null;
    var l = bounds.lower, u = bounds.upper;
    if (!l && !u) return null;
    if (l && (!finite(l.value) || !['>', '>='].includes(operator(l.operator)))) return null;
    if (u && (!finite(u.value) || !['<', '<='].includes(operator(u.operator)))) return null;
    var lo = l ? l.value : -Infinity, hi = u ? u.value : Infinity;
    var li = l ? operator(l.operator) === '>=' : false, ui = u ? operator(u.operator) === '<=' : false;
    if (lo > hi || (lo === hi && (!li || !ui))) return null;
    return interval(lo, hi, li, ui);
  }
  function relation(q, r) {
    if (q.high < r.low || (q.high === r.low && (!q.highInclusive || !r.lowInclusive))) return 'below';
    if (q.low > r.high || (q.low === r.high && (!q.lowInclusive || !r.highInclusive))) return 'above';
    var lowOK = q.low > r.low || (q.low === r.low && (!q.lowInclusive || r.lowInclusive));
    var highOK = q.high < r.high || (q.high === r.high && (!q.highInclusive || r.highInclusive));
    return lowOK && highOK ? 'within' : 'indeterminate';
  }
  function compareMeasurement(measurement, range) {
    if (!measurement || measurement.status !== 'valid') return { status: 'unavailable', reasonCodes: ['invalid_measurement'] };
    var bounds = boundsInterval(range);
    if (!bounds || (range.censoredLower && range.lower)) return { status: 'unavailable', reasonCodes: ['invalid_reference_range'] };
    var censored = range.censoredLower;
    if ((range.lower && range.lower.value < 0) || (range.upper && range.upper.value < 0) || (censored && (!['<', '<='].includes(operator(censored.operator)) || (censored.value !== null && (!finite(censored.value) || censored.value <= 0))))) return { status: 'unavailable', reasonCodes: ['invalid_reference_range'] };
    var quantity = measurementInterval(measurement);
    if (!quantity) return { status: 'indeterminate', reasonCodes: ['unquantified_detection_limit'] };
    var result = relation(quantity, bounds);
    return { status: result, reasonCodes: result === 'indeterminate' ? ['censored_result_crosses_reference_boundary'] : range.censoredLower ? ['censored_reference_lower_limit'] : [] };
  }
  function ageMatches(age, bounds) {
    if (!age || age.status !== 'known') return 'unknown';
    if (!bounds) return 'within';
    var r = boundsInterval(bounds);
    return r ? relation(ageInterval(age), r) : 'unknown';
  }
  function ageTest(age, bound) {
    var b = {};
    if (!bound || !finite(bound.value)) return 'unknown';
    if (['<', '<='].includes(operator(bound.operator))) b.upper = bound;
    else if (['>', '>='].includes(operator(bound.operator))) b.lower = bound;
    else return 'unknown';
    return ageMatches(age, b);
  }
  function observationCurrent(observation, sampleDateISO) {
    if (!observation || typeof observation !== 'object') return false;
    var sample = dateISO(sampleDateISO), assessed = dateISO(observation.assessedAtISO);
    if (observation.assessedAtISO && !assessed) return false;
    if (sample && assessed && assessed.time > sample.time) return false;
    return observation.appliesToSample === true || Boolean(sample && assessed && sample.time === assessed.time);
  }
  function pubertyAtSample(input) {
    var p = input.puberty || {}, k = kind(p.kind);
    var validStage = Number.isInteger(p.stage) && p.stage >= 1 && p.stage <= 5;
    var expected = input.sex === 'F' ? 'Th' : input.sex === 'M' ? 'G' : null;
    var reasons = [];
    if (!validStage) reasons.push('missing_puberty_stage');
    if (k === 'unspecified' && validStage) reasons.push('ambiguous_puberty_kind');
    if (validStage && !observationCurrent(p, input.sampleDateISO)) reasons.push('puberty_not_confirmed_at_sample');
    if (['Th', 'G'].includes(k) && k !== expected) reasons.push('puberty_kind_sex_mismatch');
    return { kind: k, stage: validStage ? p.stage : null, usable: validStage && k === expected && observationCurrent(p, input.sampleDateISO), reasonCodes: reasons };
  }
  function therapy(input) {
    var t = input.treatment || {};
    return { gnrha: flag(t.gnrha), sexSteroids: flag(t.sexSteroids) };
  }
  function clinicalResult(profile, status, code, title, description, reasons) {
    return { status: status, code: code, title: title, text: description, reasonCodes: unique(reasons || []), sourceIds: copy(profile && profile.sourceIds || []) };
  }
  function assessTiming(input, profile) {
    input = input || {};
    var result = function (status, code, title, description, reasons) { return clinicalResult(profile, status, code, title, description, reasons); };
    if (!profile || !profile.earlyAgeYears || !profile.absentOnsetAgeYears || !profile.onset || !boundsInterval(profile.scopeAgeYears) || !profile.thelarche) return result('limited', 'clinical_profile_missing', 'Brak profilu kryteriów klinicznych', 'Nie wybrano wersjonowanych reguł czasu dojrzewania.', ['clinical_profile_missing']);
    var sex = input.sex;
    if (!['M', 'F'].includes(sex)) return result('limited', 'missing_sex', 'Ocena dojrzewania ograniczona', 'Brak płci właściwej dla kryteriów.', ['missing_sex']);
    var age = resolveAge(input);
    if (age.status !== 'known') return result('limited', 'missing_age', 'Ocena dojrzewania ograniczona', 'Brak wiarygodnego wieku w dniu pobrania.', age.reasonCodes);
    if (ageTest(age, profile.earlyAgeYears[sex]) === 'unknown' || ageTest(age, profile.absentOnsetAgeYears[sex]) === 'unknown' || ageTest(age, profile.infantAgeYears) === 'unknown') return result('limited', 'clinical_profile_missing', 'Niepełny profil kryteriów klinicznych', 'Brakuje granic wymaganych do oceny czasu rozwoju.', ['clinical_profile_missing']);
    var scope = ageMatches(age, profile.scopeAgeYears);
    if (scope === 'above' || scope === 'below') return result('out_of_scope', 'out_of_scope', 'Poza zakresem pediatrycznym', 'Profil nie obejmuje tego wieku.', ['clinical_age_out_of_scope']);
    if (scope !== 'within') return result('limited', 'missing_age', 'Niewystarczająca dokładność wieku', 'Podany wiek przecina granicę zakresu profilu.', ['age_precision_crosses_scope']);
    var p = pubertyAtSample(input), history = input.history || {}, t = therapy(input);
    var onsetRule = profile.onset[sex];
    if (!onsetRule || !finite(onsetRule.stage)) return result('limited', 'clinical_profile_missing', 'Brak kryterium początku dojrzewania', '', ['clinical_profile_missing']);
    var expected = onsetRule.axis;
    var volume = input.testicularVolume || {};
    var threshold = onsetRule.testisVolume;
    var volumeUsable = sex === 'M' && threshold && finite(threshold.value) && finite(volume.value) && volume.value >= 0 && volume.unit === threshold.unit && volume.method === threshold.method && observationCurrent(volume, input.sampleDateISO);
    var volumePresent = Boolean(volumeUsable && ageTest({ status: 'known', lowerYears: volume.value, upperYears: volume.value, upperInclusive: true }, threshold) === 'within');
    var stagePresent = p.usable && p.stage >= onsetRule.stage;
    var present = stagePresent || volumePresent;
    var absent = (p.usable && p.stage < onsetRule.stage) || (volumeUsable && !volumePresent);
    var inconsistent = (p.usable && volumeUsable && stagePresent !== volumePresent);
    var progressive = ['progression', 'growthAcceleration', 'cnsSymptoms'].some(function (key) { return flag(history[key]) === 'yes'; });
    var infant = ageTest(age, profile.infantAgeYears);
    var early = ageTest(age, profile.earlyAgeYears[sex]);
    var late = ageTest(age, profile.absentOnsetAgeYears[sex]);
    var onset = input.onset || {}, onsetAge = null, onsetKnown = false, onsetUncertain = false;
    if (kind(onset.kind) === expected && (onset.age || onset.dateISO)) {
      var onsetDate = dateISO(onset.dateISO), sampleDate = dateISO(input.sampleDateISO);
      if (onset.dateISO && !onsetDate) inconsistent = true;
      if (onsetDate && sampleDate && onsetDate.time > sampleDate.time) inconsistent = true;
      onsetAge = onset.dateISO ? resolveAge({ birthDateISO: input.birthDateISO, sampleDateISO: onset.dateISO }) : resolveAge({ age: onset.age });
      onsetKnown = onsetAge.status === 'known';
      if (onsetAge.status === 'invalid') inconsistent = true;
      if (onsetKnown && (onsetAge.lowerYears > age.upperYears || (onsetAge.lowerYears === age.upperYears && !age.upperInclusive))) inconsistent = true;
      onsetUncertain = !onsetKnown || onsetAge.upperYears > age.lowerYears;
    }
    if (inconsistent) return result('warning', 'inconsistent_puberty_context', 'Dane dojrzewania wymagają uzgodnienia', 'Stadium, objętość jąder lub wiek początku są ze sobą sprzeczne. Nie rozstrzygamy czasu początku z niezgodnych danych.', ['inconsistent_puberty_context']);
    if (infant === 'within') {
      var advanced = profile.infantAdvancedStageMin && p.usable && p.stage >= profile.infantAdvancedStageMin[sex];
      if (advanced || (present && progressive)) return result('warning', 'early_development', 'Rozwinięte lub postępujące cechy u niemowlęcia', 'Minipuberty nie wyjaśnia automatycznie rozwiniętych lub postępujących cech płciowych; wymagana jest ocena przebiegu i przyczyny.', ['infant_advanced_or_progressive_features']);
      return result('notice', 'infant_context', 'Wiek niemowlęcy — odrębna interpretacja', 'Minipuberty wymaga właściwych norm wieku, płci i metody. Samo stężenie LH/FSH nie potwierdza fizjologicznego przebiegu.', p.reasonCodes.concat(['infant_context']));
    }
    if (infant === 'indeterminate') return result('limited', 'missing_age', 'Niewystarczająca dokładność wieku', 'Nie można pewnie wybrać kontekstu niemowlęcego.', ['age_precision_crosses_infant_boundary']);
    if (present && early === 'within') {
      var initialThelarche = sex === 'F' && p.stage === profile.thelarche.initialStage && !progressive;
      if (initialThelarche) return result('notice', 'early_thelarche', 'Wczesny rozwój gruczołów sutkowych — ocena przebiegu', 'Th2 przed granicą wieku wymaga oceny progresji i objawów towarzyszących. Nie jest automatycznym rozpoznaniem CPP ani wyborem obserwacji.', ['early_thelarche', 'low_lh_does_not_exclude_cpp']);
      return result('warning', 'early_development', 'Cechy dojrzewania zbyt wcześnie — wymagają oceny', 'Cechy płciowe nie są adekwatne do wieku. Zgodność hormonu z zakresem stadium nie ustala przyczyny ani prawidłowego czasu rozwoju.', ['early_development', 'low_lh_does_not_exclude_cpp']);
    }
    if (onsetUncertain) return result('limited', 'onset_context_uncertain', 'Czas początku wymaga doprecyzowania', 'Podana data lub dokładność wieku nie pozwala potwierdzić czasu początku względem dnia pobrania.', ['onset_context_uncertain']);
    if (onsetKnown) {
      var infancyAtOnset = ageTest(onsetAge, profile.infantAgeYears);
      if (infancyAtOnset === 'within' && onset.confirmedPubertalOnset !== true) return result('limited', 'infant_context', 'Początek w niemowlęctwie wymaga doprecyzowania', 'Nie traktujemy automatycznie zmian związanych z minipuberty jako trwałego początku pokwitania.', ['infant_onset_not_confirmed']);
      if (ageTest(onsetAge, profile.earlyAgeYears[sex]) === 'within') return result('warning', 'early_onset_history', 'Przedwczesny początek w wywiadzie', 'Obecny wiek lub stadium nie unieważniają wcześniejszego początku cech płciowych. Przyczyna nie jest ustalana z samego LH/FSH.', ['early_onset_history']);
      if (ageTest(onsetAge, { operator: '>', value: profile.absentOnsetAgeYears[sex].value }) === 'within') return result('warning', 'late_onset_history', 'Późny początek w wywiadzie', 'Początek cech odnotowano po granicy wieku; obecne stadium nie usuwa tej informacji.', ['late_onset_history']);
      if ([ageTest(onsetAge, profile.infantAgeYears), ageTest(onsetAge, profile.earlyAgeYears[sex]), ageTest(onsetAge, { operator: '>', value: profile.absentOnsetAgeYears[sex].value })].includes('indeterminate')) return result('limited', 'onset_context_uncertain', 'Czas początku wymaga doprecyzowania', 'Podany przedział wieku początku przecina granicę interpretacji.', ['onset_precision_crosses_clinical_boundary']);
    }
    if (absent && late === 'within') {
      if (t.gnrha !== 'no' || t.sexSteroids !== 'no' || flag(history.regression) === 'yes' || onsetKnown) return result('limited', 'treatment_context', 'Brak cech wymaga uwzględnienia wywiadu', 'Leczenie, wcześniejszy początek lub regresja mogą zmieniać interpretację. Nie rozpoznajemy nowego opóźnienia z samego aktualnego stadium.', ['treatment_or_previous_onset_context']);
      return result('warning', 'absent_onset', 'Brak początku dojrzewania — wymaga oceny', sex === 'F' ? 'Brak rozwoju gruczołów sutkowych do granicy wieku. Pojedyncze LH/FSH nie ustala przyczyny.' : 'Brak początku rozwoju narządów płciowych lub powiększenia jąder do kryterium początku w granicznym wieku. Pojedyncze LH/FSH nie ustala przyczyny.', ['absent_onset']);
    }
    if ((present && early === 'indeterminate') || (absent && late === 'indeterminate')) return result('limited', 'missing_age', 'Niewystarczająca dokładność wieku', 'Podany przedział wieku przecina kliniczną granicę decyzji.', ['age_precision_crosses_clinical_boundary']);
    if (!p.usable && !volumeUsable) return result('limited', p.kind === 'unspecified' && p.stage !== null ? 'ambiguous_puberty_kind' : 'missing_puberty_assessment', 'Brak odpowiedniej oceny dojrzewania', 'Potrzebna jest ocena Th/M lub G. P i Ax ani ogólny numer Tannera nie zastępują tej informacji.', p.reasonCodes.concat(['missing_puberty_assessment']));
    if (t.gnrha !== 'no' || t.sexSteroids !== 'no') return result('limited', 'treatment_context', 'Interpretacja zależna od leczenia', 'Nie oceniamy skuteczności leczenia GnRHa ani jego wpływu na dojrzewanie z pojedynczego LH/FSH.', ['treatment_context']);
    return result('no_timing_alert', 'timing_not_abnormal', 'Brak wykrytej niezgodności czasu dojrzewania', 'Ocena dotyczy dostępnych danych o czasie początku, nie całego przebiegu ani etiologii dojrzewania.', onsetKnown ? [] : ['onset_history_missing']);
  }
  function contextObservationCurrent(observation, input) {
    if (!observationCurrent(observation, input.sampleDateISO)) return false;
    var birth = dateISO(input.birthDateISO), assessed = dateISO(observation.assessedAtISO);
    return !(birth && assessed && assessed.time < birth.time);
  }
  function appendClinicalContext(input, profile, clinical, age, puberty) {
    var policy = profile && profile.contextMessages;
    if (!policy || clinical.status === 'out_of_scope' || !['lh', 'fsh'].includes(input.analyte)) return null;
    var history = input.history || {}, attention = null;
    function append(rule, description) {
      if (!rule || !rule.code || !(description || rule.text)) return;
      clinical.text += '\n\n' + (description || rule.text);
      clinical.reasonCodes = unique(clinical.reasonCodes.concat(rule.code));
      clinical.sourceIds = unique(clinical.sourceIds.concat(rule.sourceIds || []));
    }
    (policy.history || []).forEach(function (rule) {
      if (flag(history[rule.field]) !== 'yes') return;
      append(rule);
      if (!attention) attention = { status: 'attention', code: rule.code, title: rule.title };
    });
    var earlyCns = policy.earlyThelarcheWithCns, onsetRule = profile.onset && profile.onset.F;
    if (earlyCns && onsetRule && input.sex === 'F' && flag(history.cnsSymptoms) === 'yes' && puberty.usable &&
        puberty.kind === onsetRule.axis && puberty.stage >= onsetRule.stage && contextObservationCurrent(input.puberty, input) &&
        ageTest(age, profile.earlyAgeYears && profile.earlyAgeYears.F) === 'within') append(earlyCns);
    var infantVolume = policy.infantTesticularVolume, volume = input.testicularVolume || {};
    if (infantVolume && input.sex === infantVolume.sex && ageTest(age, profile.infantAgeYears) === 'within' &&
        finite(volume.value) && volume.value >= 0 && volume.unit === infantVolume.unit && contextObservationCurrent(volume, input)) {
      var method = text(infantVolume.methods && infantVolume.methods[volume.method]) || infantVolume.unknownMethod;
      append(infantVolume, infantVolume.text.replace('{value}', String(volume.value).replace('.', ','))
        .replace('{unit}', volume.unit).replace('{method}', method));
    }
    return attention;
  }
  function unavailable(reason) { return { status: 'unavailable', reasonCodes: Array.isArray(reason) ? unique(reason) : [reason], range: null }; }
  function comparison(measurement, row, profile, data) {
    var c = compareMeasurement(measurement, row.range);
    c.range = { id: row.id, profileId: profile.id, profileVersion: profile.version, dataVersion: data.dataVersion,
      sourceId: profile.sourceId, source: copy(data.sources && data.sources[profile.sourceId]), population: copy(profile.population), method: copy(profile.method),
      material: profile.material, unit: profile.unit, sex: row.sex, age: copy(row.age), stage: copy(row.stage), bounds: copy(row.range) };
    return c;
  }
  function selectComparison(measurement, profile, data, age, sex, puberty, forStage) {
    var candidates = profile.rows.filter(function (row) {
      if (!row || row.sex !== sex) return false;
      return forStage ? Boolean(row.stage && row.stage.kind === puberty.kind && row.stage.value === puberty.stage) : !row.stage;
    });
    if (forStage && !puberty.usable) return unavailable(puberty.reasonCodes.concat(['missing_typed_stage_at_sample']));
    if (forStage && !finite(profile.stageAgeMinYears)) return unavailable('stage_age_scope_missing');
    if (forStage && age.lowerYears < profile.stageAgeMinYears) return unavailable('stage_reference_not_for_infant');
    if (candidates.some(function (row) { return (!forStage && !row.age) || (row.age && (row.age.axis !== 'chronologicalYears' || !boundsInterval(row.age))); })) return unavailable('invalid_reference_age_axis');
    var matches = candidates.filter(function (row) { return ageMatches(age, row.age) === 'within'; });
    if (matches.length > 1) return unavailable('ambiguous_reference_rows');
    if (!matches.length) return unavailable(candidates.some(function (row) { return ageMatches(age, row.age) === 'indeterminate'; }) ? 'age_precision_crosses_reference_boundary' : 'no_matching_reference_range');
    return comparison(measurement, matches[0], profile, data);
  }
  function localComparison(input, measurement, age, clinicalProfile) {
    var local = normalizedLocal(input.localReference), assay = input.assay || {};
    if (!local) return unavailable('no_local_reference');
    if (!clinicalProfile || !boundsInterval(clinicalProfile.scopeAgeYears)) return unavailable('clinical_scope_not_established');
    if (ageMatches(age, clinicalProfile.scopeAgeYears) !== 'within') return unavailable('local_reference_outside_pediatric_scope');
    if (!local.id || !local.version || !local.source || !local.source.id || !local.source.label || !local.population || !local.population.label || local.applicabilityConfirmed !== true) return unavailable('local_reference_provenance_or_applicability_missing');
    if (age.status !== 'known' || !['M', 'F'].includes(input.sex)) return unavailable('local_reference_patient_context_missing');
    if (local.analyte !== input.analyte || local.material !== 'serum' || local.material !== input.specimen || !['IU/L', 'mIU/mL'].includes(local.unit)) return unavailable('local_reference_context_mismatch');
    if (assay.confirmation !== 'reported' || !assay.methodId || assay.methodId !== local.methodId) return unavailable('local_reference_method_not_confirmed');
    var c = compareMeasurement(measurement, local.range);
    if (c.status === 'unavailable') return c;
    c.range = { id: text(local.id), profileId: 'local', profileVersion: text(local.version), sourceId: text(local.source.id), source: copy(local.source), population: copy(local.population), method: { id: text(local.methodId) }, material: 'serum', unit: local.unit, bounds: copy(local.range), basis: 'local-confirmed-for-patient' };
    return c;
  }
  function normalizedAge(age) {
    return age ? { years: finite(age.years) ? age.years : null, months: finite(age.months) ? age.months : null, days: finite(age.days) ? age.days : null, precision: text(age.precision, 16) } : null;
  }
  function normalizedBound(bound) {
    return bound ? { operator: text(operator(bound.operator), 8), value: finite(bound.value) ? bound.value : null } : null;
  }
  function normalizedLocal(local) {
    if (!local) return null;
    var source = local.source || {}, population = local.population || {}, range = local.range || {};
    return { id: text(local.id), version: text(local.version), analyte: text(local.analyte, 8), material: text(local.material, 24), unit: text(local.unit, 24), methodId: text(local.methodId), applicabilityConfirmed: local.applicabilityConfirmed === true,
      source: { id: text(source.id), label: text(source.label), version: text(source.version), url: text(source.url, 512) },
      population: { label: text(population.label) },
      range: { lower: normalizedBound(range.lower), upper: normalizedBound(range.upper), censoredLower: normalizedBound(range.censoredLower), sourceText: text(range.sourceText) } };
  }
  function normalizedInput(input) {
    var p = input.puberty || {}, v = input.testicularVolume || {}, a = input.assay || {}, o = input.onset || {}, h = input.history || {};
    return {
      analyte: text(input.analyte, 8), value: typeof input.value === 'object' && input.value ? { operator: operator(input.value.operator || '='), value: finite(input.value.value) ? input.value.value : null } : typeof input.value === 'number' ? (finite(input.value) ? input.value : null) : text(input.value, 96), unit: text(input.unit, 24),
      sex: ['M', 'F'].includes(input.sex) ? input.sex : null, sampleDateISO: text(input.sampleDateISO, 64) || null, birthDateISO: text(input.birthDateISO, 64) || null,
      age: normalizedAge(input.age),
      specimen: text(input.specimen, 24) || 'unknown', measurementKind: text(input.measurementKind, 24) || 'unknown',
      assay: { profileId: text(a.profileId, 80), methodId: text(a.methodId, 80), confirmation: text(a.confirmation, 32) || 'unknown' },
      puberty: { kind: kind(p.kind), stage: Number.isInteger(p.stage) ? p.stage : null, assessedAtISO: text(p.assessedAtISO, 64) || null, appliesToSample: p.appliesToSample === true, source: text(p.source, 80) || 'provided' },
      testicularVolume: { value: finite(v.value) ? v.value : null, unit: text(v.unit, 16), method: text(v.method, 40), assessedAtISO: text(v.assessedAtISO, 64) || null, appliesToSample: v.appliesToSample === true },
      onset: { kind: kind(o.kind), dateISO: text(o.dateISO, 64) || null, age: normalizedAge(o.age), confirmedPubertalOnset: o.confirmedPubertalOnset === true },
      history: { progression: flag(h.progression), growthAcceleration: flag(h.growthAcceleration), cnsSymptoms: flag(h.cnsSymptoms), regression: flag(h.regression) },
      treatment: therapy(input), preterm: flag(input.preterm), gestationalAgeWeeks: finite(input.gestationalAgeWeeks) ? input.gestationalAgeWeeks : null,
      localReference: normalizedLocal(input.localReference)
    };
  }
  function evaluate(input, data) {
    input = input || {}; data = data || {};
    var normalized = normalizedInput(input), measurement = parseMeasurement(input.value, input.unit), age = resolveAge(input), puberty = pubertyAtSample(input);
    var clinical = assessTiming(input, data.clinicalProfile);
    var clinicalAttention = appendClinicalContext(input, data.clinicalProfile, clinical, age, puberty);
    var bio = { status: 'unavailable', primary: null, byAge: unavailable('no_matching_profile'), byStage: unavailable('no_matching_profile'), local: unavailable('no_local_reference'), reasonCodes: [] };
    var profile = Array.isArray(data.profiles) ? data.profiles.find(function (p) { return p && p.id === (input.assay || {}).profileId; }) : null;
    var gates = [], assay = input.assay || {}, t = therapy(input), biochemicalPolicy = data.biochemicalPolicy;
    if (!['lh', 'fsh'].includes(input.analyte)) gates.push('unsupported_analyte');
    if (measurement.status !== 'valid') gates.push('invalid_measurement');
    if (age.status !== 'known') gates.push.apply(gates, age.reasonCodes);
    if (!['M', 'F'].includes(input.sex)) gates.push('missing_sex');
    if (input.specimen !== 'serum') gates.push('unsupported_or_unknown_specimen');
    if (input.measurementKind !== 'basal') gates.push('non_basal_or_unknown_measurement');
    if (t.gnrha !== 'no' || t.sexSteroids !== 'no') gates.push(t.gnrha === 'yes' || t.sexSteroids === 'yes' ? 'treatment_requires_separate_profile' : 'treatment_context_unknown');
    if (!biochemicalPolicy || !biochemicalPolicy.id || !biochemicalPolicy.version || ageTest({ status: 'known', lowerYears: 0, upperYears: 0, upperInclusive: true }, biochemicalPolicy.infantAgeYears) === 'unknown' || ageTest({ status: 'known', lowerYears: 0, upperYears: 0, upperInclusive: true }, biochemicalPolicy.pretermGestationalWeeks) === 'unknown') gates.push('biochemical_policy_missing');
    else if (age.status === 'known' && ageTest(age, biochemicalPolicy.infantAgeYears) !== 'above') {
      if (flag(input.preterm) !== 'no') gates.push(flag(input.preterm) === 'yes' ? 'preterm_reference_not_established' : 'infant_gestational_context_missing');
      if (finite(input.gestationalAgeWeeks) && ageTest({ status: 'known', lowerYears: input.gestationalAgeWeeks, upperYears: input.gestationalAgeWeeks, upperInclusive: true }, biochemicalPolicy.pretermGestationalWeeks) === 'within') gates.push('preterm_reference_not_established');
    }
    if (!gates.length) bio.local = localComparison(input, measurement, age, data.clinicalProfile);
    else if (input.localReference) bio.local = unavailable(gates);
    var profileGates = gates.slice();
    if (!profile) profileGates.push('no_matching_profile');
    else {
      if (!profile.id || !profile.version || !data.dataVersion || !profile.sourceId || !data.sources || !data.sources[profile.sourceId] || !profile.population || !profile.population.label || !Array.isArray(profile.rows) || !profile.scope || !boundsInterval(profile.scope.age) || profile.scope.age.axis !== 'chronologicalYears' || profile.unit !== 'IU/L') profileGates.push('invalid_reference_profile');
      if (profile.examinationType !== input.measurementKind) profileGates.push('profile_measurement_kind_mismatch');
      if (profile.active !== true) profileGates.push('profile_not_active');
      if (profile.analyte !== input.analyte) profileGates.push('profile_analyte_mismatch');
      if (!profile.method || assay.methodId !== profile.method.id || assay.confirmation !== 'reported') profileGates.push('method_not_confirmed');
      if (profile.material !== input.specimen) profileGates.push('profile_material_mismatch');
      var scope = ageMatches(age, profile.scope && profile.scope.age);
      if (scope !== 'within') profileGates.push(scope === 'indeterminate' ? 'age_precision_crosses_scope' : 'age_outside_profile');
    }
    if (!profileGates.length) {
      bio.byAge = selectComparison(measurement, profile, data, age, input.sex, puberty, false);
      bio.byStage = selectComparison(measurement, profile, data, age, input.sex, puberty, true);
    } else { bio.byAge = unavailable(profileGates); bio.byStage = unavailable(profileGates); }
    bio.primary = bio.local.status !== 'unavailable' ? 'local' : bio.byStage.status !== 'unavailable' ? 'stage' : bio.byAge.status !== 'unavailable' ? 'age' : null;
    bio.status = bio.primary ? 'available' : 'unavailable';
    bio.reasonCodes = bio.primary === 'local' ? bio.local.reasonCodes.slice() : unique(gates.concat(profileGates, input.localReference ? bio.local.reasonCodes : [], bio.byAge.reasonCodes, bio.byStage.reasonCodes));
    if (bio.primary === 'local' && [bio.byAge, bio.byStage].some(function (c) { return ['within', 'above', 'below'].includes(c.status) && c.status !== bio.local.status; })) bio.reasonCodes.push('source_reference_disagreement');
    var all = [bio.local, bio.byAge, bio.byStage];
    var decisive = bio.primary === 'local' ? [bio.local] : [bio.byAge, bio.byStage];
    var abnormal = decisive.some(function (c) { return c.status === 'above' || c.status === 'below'; });
    var uncertain = decisive.some(function (c) { return c.status === 'indeterminate'; });
    var summary;
    if (!['lh', 'fsh'].includes(input.analyte)) {
      clinical = clinicalResult(data.clinicalProfile, 'out_of_scope', 'out_of_scope', 'Analit poza zakresem modułu', 'Moduł dotyczy wyłącznie LH i FSH.', ['unsupported_analyte']);
      summary = { status: 'out_of_scope', code: 'unsupported_analyte', title: 'Analit poza zakresem modułu' };
    } else if (clinical.status === 'warning' || clinical.status === 'notice') summary = { status: 'attention', code: clinical.code, title: clinical.title };
    else if (clinicalAttention) summary = clinicalAttention;
    else if (measurement.status !== 'valid') summary = { status: 'invalid', code: 'invalid_measurement', title: 'Nieprawidłowy zapis wyniku lub jednostki' };
    else if (abnormal) summary = { status: 'attention', code: 'outside_reference_range', title: 'Wynik poza wskazanym zakresem referencyjnym' };
    else if (clinical.status === 'out_of_scope') summary = { status: 'out_of_scope', code: 'out_of_scope', title: clinical.title };
    else if (!bio.primary || uncertain || clinical.status === 'limited') summary = { status: 'limited', code: 'limited_interpretation', title: 'Interpretacja ograniczona dostępnymi danymi' };
    else summary = { status: 'compared', code: 'reference_comparison_available', title: 'Wynik porównano z wybranym zakresem' };
    var limitations = unique(clinical.reasonCodes.concat(bio.reasonCodes, measurement.reasonCodes));
    if (bio.primary && age.status === 'known' && biochemicalPolicy && ageTest(age, biochemicalPolicy.infantAgeYears) === 'within') limitations.push('broad_infant_reference_not_full_minipuberty_assessment');
    return { schemaVersion: 1, engineVersion: VERSION, dataVersion: data.dataVersion || null, analyte: normalized.analyte,
      input: copy(normalized), measurement: measurement, ageAtSample: age, biochemical: bio, clinical: clinical, summary: summary,
      provenance: { clinicalProfileId: data.clinicalProfile && data.clinicalProfile.id || null, clinicalProfileVersion: data.clinicalProfile && data.clinicalProfile.version || null, biochemicalPolicyId: biochemicalPolicy && biochemicalPolicy.id || null, biochemicalPolicyVersion: biochemicalPolicy && biochemicalPolicy.version || null, profileId: profile && profile.id || null, profileVersion: profile && profile.version || null,
        sourceIds: unique(clinical.sourceIds.concat(biochemicalPolicy && biochemicalPolicy.sourceIds || [], all.filter(function (c) { return c.range; }).map(function (c) { return c.range.sourceId; }))) }, limitations: unique(limitations) };
  }
  return Object.freeze({ version: VERSION, evaluate: evaluate, parseMeasurement: parseMeasurement, resolveAge: resolveAge, compareMeasurement: compareMeasurement, assessTiming: assessTiming });
});
