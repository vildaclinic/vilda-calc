(function(global){
  'use strict';

  function buildPlanState(planInput, options){
    const input = planInput || {};
    const opts = options || {};
    const ageMonthsOpt = Number.isFinite(opts.ageMonthsOpt) ? opts.ageMonthsOpt : 0;
    const intakeHistory = opts.intakeHistory || null;
    const intakeKcalPerDay = opts.intakeKcalPerDay || null;
    const mountId = opts.mountId || 'anorexiaTmpMount';
    const builder = typeof opts.energyBuildPlanReductionState === 'function'
      ? opts.energyBuildPlanReductionState
      : (typeof global.energyBuildPlanReductionState === 'function' ? global.energyBuildPlanReductionState : null);

    if (!builder) {
      return {
        reeKcal: null,
        teeRawKcal: null,
        teeBaselineKcal: null,
        diets: [],
        isInfantPlanUnavailable: false,
        __error: 'missing-energyBuildPlanReductionState'
      };
    }

    return builder({
      ageYears: input.age,
      ageMonthsOpt,
      sex: input.sex,
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      palInput: input.pal,
      history: intakeHistory,
      intakeKcalPerDay,
      mountId
    });
  }

  function resolvePlanDiets(planState, context, options){
    const state = planState || {};
    const ctx = context || {};
    if (Array.isArray(state.diets) && state.diets.length) {
      return state.diets.slice();
    }
    const proposer = (options && typeof options.proposeDietsFromTEE === 'function')
      ? options.proposeDietsFromTEE
      : (typeof global.proposeDietsFromTEE === 'function' ? global.proposeDietsFromTEE : null);
    if (!proposer) return [];
    return proposer(state.teeBaselineKcal, ctx.sex, !!ctx.isChildEnergy);
  }

  global.VildaPlanEnergy = {
    buildPlanState: buildPlanState,
    resolvePlanDiets: resolvePlanDiets
  };
})(typeof window !== 'undefined' ? window : globalThis);
