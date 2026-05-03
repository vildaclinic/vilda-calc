(function(global){
  'use strict';

  function hideDietSelectors(doc){
    const d = doc || document;
    const dietSel = d.getElementById('dietLevel');
    if (dietSel && typeof global.vildaAppClearHtml === 'function') global.vildaAppClearHtml(dietSel);
    const descEl = d.getElementById('dietDesc');
    const calEl = d.getElementById('dietCalorieInfo');
    const wrap = d.getElementById('dietChoiceWrap');
    if (descEl) descEl.style.display = 'none';
    if (calEl) calEl.style.display = 'none';
    if (wrap) wrap.style.display = 'none';
  }

  function renderPlanUnavailable(reason, context){
    const ctx = context || {};
    const d = ctx.doc || document;
    hideDietSelectors(d);
    const planCardEl = d.getElementById('planCard');
    if (planCardEl) planCardEl.style.display = 'block';
    const planResultsEl = d.getElementById('planResults');
    if (!planResultsEl || typeof global.vildaAppSetTrustedHtml !== 'function') return false;

    const message = reason === 'infant'
      ? 'Plan odchudzania nie jest dostępny dla niemowląt. W tym wieku moduł energii ma charakter wyłącznie informacyjny.'
      : 'Brak dostępnego planu dla podanych danych.';
    global.vildaAppSetTrustedHtml(
      planResultsEl,
      `<div class="result-card plan-col plan-result-card animate-in"><h3>Informacja</h3><p class="diet-warning">${message}</p></div>`,
      'plan-render:unavailable'
    );
    return true;
  }

  function renderNoDietsAvailable(context){
    const ctx = context || {};
    const d = ctx.doc || document;
    hideDietSelectors(d);
    const planCardEl = d.getElementById('planCard');
    if (planCardEl) planCardEl.style.display = 'block';
    return true;
  }

  global.VildaPlanRender = {
    renderPlanUnavailable: renderPlanUnavailable,
    renderNoDietsAvailable: renderNoDietsAvailable
  };
})(typeof window !== 'undefined' ? window : globalThis);
