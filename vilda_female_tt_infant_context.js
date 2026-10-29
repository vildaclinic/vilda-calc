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
  var api = Object.freeze({ adapt: adapt });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VildaFemaleTTInfantContext = api;
})(typeof window !== 'undefined' ? window : globalThis);
