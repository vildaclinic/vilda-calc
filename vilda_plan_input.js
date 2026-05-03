(function(global){
  'use strict';

  function readPlanInputFromDom(options){
    const opts = options || {};
    const age = (typeof opts.getAgeDecimal === 'function') ? opts.getAgeDecimal() : 0;
    const sexEl = (opts.doc || document).getElementById('sex');
    const weightEl = (opts.doc || document).getElementById('weight');
    const heightEl = (opts.doc || document).getElementById('height');
    const palEl = (opts.doc || document).getElementById('palFactor');
    const planResultsContainer = (opts.doc || document).getElementById('planResults');
    const planCardContainer = (opts.doc || document).getElementById('planCard');

    const missingRequiredDom = !sexEl || !weightEl || !heightEl || !palEl || !planResultsContainer || !planCardContainer;
    const anthroValidation = (typeof opts.getAnthroValidation === 'function') ? opts.getAnthroValidation() : null;

    const sex = sexEl ? (sexEl.value || 'M') : 'M';
    const weightKg = anthroValidation && anthroValidation.weight && anthroValidation.weight.value != null
      ? anthroValidation.weight.value
      : +(weightEl && weightEl.value);
    const heightCm = anthroValidation && anthroValidation.height && anthroValidation.height.value != null
      ? anthroValidation.height.value
      : +(heightEl && heightEl.value);
    const pal = +(palEl && palEl.value);

    return {
      age,
      sex,
      weightKg,
      heightCm,
      pal,
      anthroValidation,
      missingRequiredDom,
      planResultsContainer,
      planCardContainer
    };
  }

  function isPlanInputComplete(planInput, options){
    const input = planInput || {};
    const opts = options || {};
    if (input.missingRequiredDom) return false;
    if (input.anthroValidation) {
      return !!input.anthroValidation.complete;
    }
    const isFiniteNonNegative = typeof opts.isFiniteNonNegative === 'function'
      ? opts.isFiniteNonNegative
      : function(v){ return Number.isFinite(v) && v >= 0; };
    const isFinitePositive = typeof opts.isFinitePositive === 'function'
      ? opts.isFinitePositive
      : function(v){ return Number.isFinite(v) && v > 0; };
    return isFiniteNonNegative(input.age) && isFinitePositive(input.weightKg) && isFinitePositive(input.heightCm);
  }

  global.VildaPlanInput = {
    readPlanInputFromDom: readPlanInputFromDom,
    isPlanInputComplete: isPlanInputComplete
  };
})(typeof window !== 'undefined' ? window : globalThis);
