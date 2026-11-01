/* Source-view adapter only. The laboratory age and saved assessment stay intact. */
(function (root) {
  'use strict';
  function days(value) {
    return value && Number.isSafeInteger(value.lower) && Number.isSafeInteger(value.upper) &&
      value.lower >= 0 && value.upper >= value.lower;
  }
  function adapt(context, source, evaluation) {
    var result = Object.assign({}, context), input = evaluation && evaluation.input;
    if (!input || !source || source.sourceStatus !== 'ready' || source.sex !== 'F' || input.sex !== 'F' ||
        context.sourceStatus !== 'ready' || context.contextBasis !== 'current-patient' || context.sampleDateISO ||
        typeof context.identityKey !== 'string' || context.identityKey !== context.currentIdentityKey ||
        source.identityKey !== context.identityKey) return result;
    var neonatal = input.neonatalAge || {}, gestational = neonatal.gestationalDays;
    if (days(gestational)) {
      result.gestationalAgeDays = gestational.lower;
      result.gestationalAgeUpperDays = gestational.upper;
      result.gestationalAgeUpperInclusive = true;
    }
    var pna = neonatal.postnatalDays, inherited = source.neonatalAge && source.neonatalAge.postnatalDays;
    var calendar = source.neonatalAge && source.neonatalAge.femaleTtCalendarAge;
    // A local age edit removes inherited PNA. Only the matching main-form cache
    // can refine this source view. Only derived age crosses the page boundary;
    // no birthday or collection date is transported or invented.
    if (!days(pna) || !days(inherited) || pna.source !== 'main-calendar-dates' ||
        inherited.source !== pna.source || inherited.lower !== pna.lower || inherited.upper !== pna.upper ||
        !calendar || !days(calendar.postnatalDays) || calendar.postnatalDays.source !== pna.source ||
        calendar.postnatalDays.lower !== pna.lower || calendar.postnatalDays.upper !== pna.upper ||
        !Number.isFinite(calendar.lowerYears) || !Number.isFinite(calendar.upperYears) ||
        calendar.lowerYears < 0 || calendar.upperYears < calendar.lowerYears || calendar.upperInclusive !== true) return result;
    result.ageYears = calendar.lowerYears;
    result.ageUpperYears = calendar.upperYears;
    result.ageUpperInclusive = true;
    return result;
  }
  function adaptMedian(context, source, evaluation, calendarPolicy) {
    var result = adapt(context, source, evaluation), input = evaluation && evaluation.input;
    if (!input || !source || source.sourceStatus !== 'ready' || source.sex !== 'F' || input.sex !== 'F' ||
        context.sourceStatus !== 'ready' || context.contextBasis !== 'current-patient' || context.sampleDateISO ||
        typeof context.identityKey !== 'string' || context.identityKey !== context.currentIdentityKey ||
        source.identityKey !== context.identityKey) return result;
    var supplied = input.neonatalAge && input.neonatalAge.postnatalDays;
    var inherited = source.neonatalAge && source.neonatalAge.postnatalDays;
    if (supplied != null) {
      // A local edit removes inherited PNA. A mismatch must not regain it from
      // the main form, a previous patient or a newly fabricated birthday.
      if (days(supplied) && days(inherited) && supplied.lower === inherited.lower && supplied.upper === inherited.upper &&
          supplied.source === inherited.source && ['main-calendar-dates', 'main-completed-weeks'].indexOf(supplied.source) >= 0) {
        result.postnatalDays = { lower: supplied.lower, upper: supplied.upper, source: supplied.source };
      }
      return result;
    }
    var age = input.age, resolved = evaluation.ageAtSample;
    var min = calendarPolicy && calendarPolicy.minMonthSpanDays, max = calendarPolicy && calendarPolicy.maxMonthSpanDays;
    // A reported completed calendar month can already identify a whole source
    // bin. Reuse the TT engine's conservative calendar envelopes, not 30 days
    // per month. The clinical assessment and its chronology remain untouched.
    if (!age || age.years !== 0 || age.precision !== 'month' || !Number.isInteger(age.months) || age.months < 0 || age.months >= 6 ||
        !resolved || resolved.source !== 'reported-age' || resolved.status !== 'known' ||
        context.ageYears !== resolved.lowerYears || context.ageUpperYears !== resolved.upperYears ||
        context.ageUpperInclusive !== resolved.upperInclusive || !Array.isArray(min) || !Array.isArray(max) ||
        min.length !== 12 || max.length !== 12 || min[0] !== 0 || max[0] !== 0 ||
        !min.every(function (value, index) { return Number.isSafeInteger(value) && value >= 0 &&
          Number.isSafeInteger(max[index]) && max[index] >= value &&
          (!index || value > min[index - 1] && max[index] > max[index - 1]); })) return result;
    result.postnatalDays = { lower: min[age.months], upper: max[age.months + 1], source: 'reported-calendar-month-envelope' };
    return result;
  }
  var api = Object.freeze({ adapt: adapt, adaptMedian: adaptMedian });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VildaFemaleTTInfantContext = api;
})(typeof window !== 'undefined' ? window : globalThis);
