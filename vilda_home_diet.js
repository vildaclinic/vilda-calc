/* Opt-in dietary workspace. Draft controls have no canonical IDs/names or
 * native delegated actions. Apply uses the original controls and actors;
 * recommendations, qualification, BMI forecasts and documents remain native. */
(function (w) {
  'use strict';
  if (!w || w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || w.VildaHomeDiet) return;
  var d = w.document, card, dialog, planActions, draft, started = false, frame = 0, sequence = 0, loading = null, readinessTimer;
  var planFields = ['palFactor', 'dietLevel', 'reduceToggle', 'stabilizationToggle', 'growthEndedFlag', 'customGoalKg'];
  var documentFields = ['nutritionNormsFlag', 'vitDSuppFlag', 'hydrationFlag', 'journeyFlag', 'peerMassFlag', 'alcoholFlag'];
  var fields = planFields.concat(documentFields);
  var tabLabels = ['Plan żywieniowy', 'Zalecenia dla pacjenta'];
  var valueChanges = new WeakMap();
  function el(tag, cls, text) { var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function byId(id) { return d.getElementById(id); }
  function value(id) { var n = byId(id); return n ? n.type === 'checkbox' ? n.checked : n.value : null; }
  function setText(n, text) { if (n && n.textContent !== text) n.textContent = text; }
  function patientId() { try { return w.sessionStorage.getItem('vildaCurrentPatientId') || null; } catch (_) { return null; } }
  function readOnlyVisit() { return w.VildaHomeGabinet?.visitMeasurementsReadOnly?.() === true; }
  function canEdit() {
    try {
      return !!(w.VildaVault?.isUnlocked() && w.VildaAuthUI?.isBootReady() && w.VildaProAccess?.hasAccess()
        && !w.__vildaPersistRestoring && !w.__vildaLustroWpis && !w.VildaDataImportExport.isMainSessionRestorePending()
        && !w.VildaPersistence?.isAutosaveSuppressed() && !w.VildaPersistence?.isClearInProgress?.()
        && !(Number(w.__vildaPersistClearUntil || 0) > Date.now()) && !w.VildaPanelPacjent?.nieaktualny());
    } catch (_) { return false; }
  }
  function owner() {
    if (!canEdit()) return null;
    var measured = w.VildaDobAge?.readMeasuredAtISO();
    var id = patientId(), saved = readOnlyVisit() && id ? w.VildaHomeEncounter?.state(id) : null;
    return { account: w.VildaVault.getCurrentUser().userId, patient: id, readOnly: readOnlyVisit(),
      saved: saved && !saved.busy ? [saved.visitId, saved.snapshotId, saved.revision] : null,
      load: w.VildaDataImportExport.getApplyLoadedDataSequence(),
      basics: ['firstName', 'lastName', 'sex', 'dobInput', 'age', 'ageMonths', 'ageWeeks', 'height', 'weight'].map(value),
      visit: w.VildaVisitContext ? w.VildaVisitContext.capture({ user: { measuredAtISO: measured } }, { patientId: patientId(), readOnly: true }) : null };
  }
  function goal() { return byId('customGoalWrap')?.querySelector('[data-cel-wlasny-choice][aria-pressed="true"]')?.getAttribute('data-cel-wlasny-choice') || 'maintain'; }
  function journeyState() { return w.VildaBmiJourney?.getSnapshot()?.state || null; }
  function configured() {
    try { return w.VildaPersistence?.readPreferenceJSON('CARD_VISIBILITY', {})?.dietRecommendationsBtn !== false; }
    catch (_) { return true; }
  }
  function snapshot() {
    var who = owner(); if (!who) return null;
    var inputs = Array.from(d.querySelectorAll('#calcForm input[id], #calcForm select[id], #planCard input[id], #planCard select[id], #advancedGrowthSection input[id], #advancedGrowthSection select[id], #whrCard input[id], #whtrCard input[id]'));
    return { owner: who, fields: fields.map(function (id) { return [id, value(id)]; }), goal: goal(),
      source: d.querySelector('input[name="dataSource"]:checked')?.value,
      population: [w.VildaDsSource?.getState()?.status || null, w.VildaDsSource?.populacja() || null],
      inputs: inputs.sort(function (a, b) { return a.id.localeCompare(b.id); }).map(function (n) { return [n.id, n.type === 'checkbox' || n.type === 'radio' ? n.checked : n.value]; }),
      fieldState: fields.map(function (id) { var n = byId(id); return n ? [id, n.disabled, n.dataset.manual || '', n.options ? Array.from(n.options).map(function (o) { return [o.value, o.disabled, o.hidden]; }) : null] : [id]; }),
      history: Array.from(d.querySelectorAll('#advMeasurements .measure-row')).map(function (row) {
        return Array.from(row.querySelectorAll('input')).map(function (n) { return [n.className, n.type === 'checkbox' ? n.checked : n.value]; });
      }), journey: journeyState(), intake: [w.intakeHistory || null, w.intakeEstimatedKcalPerDay ?? null],
      norms: typeof w.nutritionNormsGetUiState === 'function' ? w.nutritionNormsGetUiState() : null,
      manual: [w.__vildaPlanPalTouched === true, w.__vildaDietLevelTouched === true, w.__vildaDietStrategyTouched === true, w.__vildaDietGoalChoice ?? null],
      configured: configured(), birth: w.vildaBirthData || null, gh: w.ghTherapyPoints || null, obesity: w.obesityTherapyPoints || null };
  }
  function ownerValid(item) {
    try { if (!item || item.vault !== w.VildaVault) return false; item.vault.assertSyncOperationSession(item.token); return JSON.stringify(owner()) === item.ownerKey; }
    catch (_) { return false; }
  }
  async function savedVisitSource(item, who) {
    if (!who.readOnly) return null;
    if (!who.saved?.[0] || !who.saved[1]) return null;
    try {
      var rows = await item.vault.getPatientVisits(who.patient);
      if (!ownerValid(item)) return null;
      var row = rows.find(entry => entry.patientId === who.patient && entry.visitId === who.saved[0]
        && entry.snapshotId === who.saved[1] && (entry.rev ?? 0) === who.saved[2]);
      if (row?.payload?.visit?.patientId === who.patient && row.payload.visit.visitId === row.visitId) return row.payload;
    } catch (_) { /* The chart can still explain why this report is unavailable. */ }
    return null;
  }
  function savedReportReady(item) {
    if (!item.readOnly) return true;
    if (!item.saved?.visit) return false;
    // The native report uses the live calculator. Check its clinical inputs
    // against the saved form, including options omitted from legacy records.
    var decision = w.VildaSaveStatusIndicator?.getCurrentDecision?.();
    if (!decision?.ready || decision.state !== 'saved') return false;
    var plan = item.saved.plan || {};
    if ((plan.palWybrany === true) !== (w.__vildaPlanPalTouched === true)
        || (plan.dietaWybrana === true) !== (w.__vildaDietLevelTouched === true)
        || plan.palFactor != null && Number(plan.palFactor) !== Number(value('palFactor'))
        || plan.dietLevel && plan.dietLevel !== value('dietLevel')
        || (Number(plan.customGoalKg) || null) !== (Number(value('customGoalKg')) || null)) return false;
    if (['growthEndedFlag', ...documentFields].some(id => { var input = byId(id); return input && input.checked !== input.defaultChecked; })) return false;
    if (w.__vildaDietStrategyTouched && goalStrategy() !== w.dietDefaultStrategyFromDom?.()) return false;
    var movement = hasRoad() && journeyState()?.moves;
    return !movement || (movement.walk === true && Object.keys(movement).every(key => key === 'walk' || !movement[key]));
  }
  function goalStrategy() { return value('stabilizationToggle') && !value('reduceToggle') ? 'stabilization' : 'reduction'; }
  function stillOwned() { return !!(draft && ownerValid(draft) && (draft.applying || JSON.stringify(snapshot()) === draft.fingerprint)); }
  function dirty() { return !!(draft && JSON.stringify([draft.values, draft.goal, draft.moves]) !== draft.initial); }
  function sourceVisible(n) { return !!(n && !n.hidden && w.getComputedStyle(n).display !== 'none'); }
  function withinVisible(n, stop) {
    for (var node = n; node && node !== stop; node = node.parentElement) if (!sourceVisible(node)) return false;
    return !!n;
  }
  function available() { return configured() && canEdit() && sourceVisible(byId('metabolicSummarySection')) && sourceVisible(byId('dietRecommendationsBtn')) && !byId('dietRecommendationsBtn').disabled; }
  function hasRoad() { return sourceVisible(byId('toNormCard')) && !!byId('bmiJourneyMount'); }
  function button(text, fn, cls) { var n = el('button', cls || 'vhome-diet-action', text); n.type = 'button'; n.addEventListener('click', fn); return n; }
  function section(title, cls, host) { var n = el('section', 'vhome-diet-section ' + cls); n.appendChild(el('h3', '', title)); host.appendChild(n); return n; }
  function note(text) { return el('p', 'vhome-diet-note', text); }
  function change(control, read) { valueChanges.set(control, read); }
  function field(id, text, host) {
    var original = byId(id); if (!original) return null;
    var label = el('label', 'vhome-diet-field', text), control = original.cloneNode(true);
    Array.from(control.attributes).forEach(function (a) { if (!['type', 'min', 'max', 'step', 'inputmode', 'autocomplete'].includes(a.name)) control.removeAttribute(a.name); });
    control.removeAttribute('id'); control.removeAttribute('name'); control.setAttribute('aria-label', text);
    control.dataset.homeDietField = id; control.disabled = original.disabled;
    if (control.tagName === 'SELECT') {
      control.replaceChildren(); Array.from(original.options).forEach(function (o) { var option = el('option', '', o.textContent); option.value = o.value; option.disabled = o.disabled; option.hidden = o.hidden; control.appendChild(option); });
    }
    control.value = draft.values[id]; change(control, function () { draft.values[id] = control.value; });
    label.appendChild(control); host.appendChild(label); return control;
  }
  function resultCopy(source) {
    var copy = source.cloneNode(true), nodes = [copy].concat(Array.from(copy.querySelectorAll('*'))), ids = new Map();
    nodes.forEach(function (n) { if (n.id) { var id = 'vhomeDietCopy-' + (++sequence); ids.set(n.id, id); n.id = id; }
      Array.from(n.attributes).forEach(function (a) { if (/^on/i.test(a.name) || /^data-/.test(a.name) || a.name === 'name' || a.name === 'form') n.removeAttribute(a.name); });
    });
    nodes.forEach(function (n) { ['for', 'aria-controls', 'aria-labelledby', 'aria-describedby'].forEach(function (attr) { if (n.hasAttribute(attr)) n.setAttribute(attr, n.getAttribute(attr).split(' ').map(function (id) { return ids.get(id) || id; }).join(' ')); }); });
    return copy;
  }
  function readonlyCopy(source, cls) {
    var copy = resultCopy(source); copy.classList.add(cls);
    copy.querySelectorAll('button,input,select,textarea').forEach(function (n) { n.disabled = true; n.removeAttribute('tabindex'); }); return copy;
  }
  function ownText(node) {
    return Array.from(node?.childNodes || []).filter(part => part.nodeType === 3).map(part => part.nodeValue).join('').trim();
  }
  function plainLabel(text) {
    return text.trim().replace(/^[^\p{L}\d−≤]+/u, '');
  }
  function nativeRoad() {
    var info = byId('toNormInfo'), mount = byId('bmiJourneyMount');
    return hasRoad() && info?.contains(mount) && mount.querySelector('.bmi-journey-goalbox') ? mount : null;
  }
  function nativeEnergy() {
    var road = nativeRoad(), original = road?.querySelector('.bmi-journey-kcal');
    if (!original && sourceVisible(byId('planCard'))) original = byId('planResults')?.querySelector('.plan2-hero');
    var amount = original?.querySelector('.bmi-journey-kcaln, .plan2-n')?.textContent.trim();
    var unit = original?.querySelector('.bmi-journey-kcalu, .plan2-u')?.textContent.trim();
    if (!amount || !unit) return null;
    var limit = amount.startsWith('≤'), caption = original.querySelector('.bmi-journey-kcalcap, .plan2-cap')?.textContent.trim() || '';
    return { amount, unit, limit, caption, label: limit ? 'Górny limit energii'
      : caption.startsWith('zalecana') ? 'Zalecana kaloryczność' : 'Kaloryczność diety' };
  }
  function energyNumber(result) {
    var row = el('span', 'vhome-diet-energy-number');
    row.append(el('strong', '', result.amount), ' ', el('span', '', result.unit));
    return row;
  }
  function fact(label, text, detail) {
    var row = el('div'), content = el('dd', '', text);
    if (detail) content.appendChild(el('small', '', detail));
    row.append(el('dt', '', label), content); return row;
  }
  function numericValue(id) {
    var input = byId(id);
    return input?.validity.valid && Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : null;
  }
  function ageLabel() {
    var years = numericValue('age'), months = numericValue('ageMonths'), weeks = numericValue('ageWeeks');
    if (years == null && months == null && weeks == null) return '—';
    var yearsUnit = years === 1 ? ' rok' : new Intl.PluralRules('pl-PL').select(years) === 'few' ? ' lata' : ' lat';
    return [years ? years + yearsUnit : '', months ? months + ' mies.' : '', weeks ? weeks + ' tyg.' : ''].filter(Boolean).join(' ') || '0 lat';
  }
  function renderMeasurements(host) {
    var measure = el('div', 'vhome-diet-measurements'), list = el('dl');
    var decimal = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    var height = numericValue('height'), mass = numericValue('weight');
    var bmi = w.VildaBmi?.bmi({ masaKg: mass, wzrostCm: height });
    var sex = byId('sex')?.selectedOptions[0]?.textContent.trim();
    list.append(fact('Wiek', ageLabel(), value('sex') ? sex : ''), fact('Wzrost', height > 0 ? decimal.format(height) + ' cm' : '—'),
      fact('Masa ciała', mass > 0 ? decimal.format(mass) + ' kg' : 'Brak pomiaru'), fact('BMI', bmi == null ? '—' : w.VildaBmi.fmtBmi(bmi)));
    measure.append(el('h4', '', 'Dane z wizyty'), list); host.appendChild(measure);
  }
  function draftProjection() {
    var key = JSON.stringify([draft.values, draft.goal, draft.moves]);
    if (draft.projectionKey !== key) {
      draft.projectionKey = key;
      var values = draft.values;
      draft.projection = w.VildaBmiJourney?.previewPlan?.({ pal: values.palFactor, dietKey: values.dietLevel,
        strategy: values.stabilizationToggle && !values.reduceToggle ? 'stabilization' : 'reduction',
        goal: draft.goal, customGoalKg: values.customGoalKg, growthEnded: values.growthEndedFlag, moves: draft.moves }) || null;
    }
    return draft.projection;
  }
  function renderEnergy() {
    var host = byId('vhomeDietPlanEnergy');
    var pending = dirty(), result = pending ? null : nativeEnergy();
    host.dataset.state = pending ? 'pending' : result ? 'ready' : 'empty';
    if (result) {
      host.replaceChildren(el('h4', '', result.label), energyNumber(result), note(result.caption));
    } else if (pending) {
      host.replaceChildren(el('h4', '', 'Niezastosowane założenia'), note('Zastosuj zmiany, aby zobaczyć aktualny plan i przygotować zalecenia.'));
    } else if (available()) {
      host.replaceChildren(el('h4', '', 'Zalecenia opisowe'), note('Można przygotować zalecenia na podstawie danych wizyty.'));
    } else {
      host.replaceChildren(el('h4', '', 'Brak wyniku energetycznego'), note('Zalecenia zależą od wieku oraz pomiarów bieżącej wizyty.'));
    }
  }
  function movementRow(label, entry) {
    var row = el('tr'), name = el('th', '', label);
    name.scope = 'row'; row.append(name, el('td', '', entry.energy), el('td', '', entry.mass)); return row;
  }
  function renderImpact(impact) {
    var host = byId('vhomeDietImpact'), jump = byId('vhomeDietImpactJump');
    host.hidden = !impact; jump.hidden = !impact;
    if (!impact) return;
    byId('vhomeDietImpactStatus').hidden = !dirty();
    var comparison = byId('vhomeDietImpactComparison'), estimate = byId('vhomeDietImpactEstimate');
    estimate.hidden = comparison.hidden = !impact.withoutMovement && !impact.withMovement;
    comparison.replaceChildren(fact('Sama dieta', impact.withoutMovement || '—'));
    if (impact.withMovement) comparison.appendChild(fact('Dieta i ruch', impact.withMovement));
    var energy = byId('vhomeDietImpactEnergy');
    if (impact.movementEnergy) energy.replaceChildren('Wkład ruchu ', el('strong', '', impact.movementEnergy + ' kcal/tydz.'));
    else energy.textContent = 'Bez dodatkowego ruchu w planie.';
    byId('vhomeDietImpactRows').replaceChildren(...impact.rows.map(row => movementRow(row.label, row)));
    byId('vhomeDietImpactTotal').replaceChildren(movementRow('Razem', impact.total));
  }
  function appendProjected(host, source, key) {
    if (!source) return;
    var clone = readonlyCopy(source, 'vhome-diet-projected');
    if (key === 'goal') clone.querySelectorAll('.bmi-journey-g4').forEach(n => n.remove());
    clone.dataset.homeDietProjection = key; host.appendChild(clone);
  }
  function nativeNotices(road) {
    var plan = byId('planResults'), warning = byId('planWarning');
    var candidates = [...(road?.querySelectorAll('.bmi-journey-warn') || []), ...(plan?.querySelectorAll('.plan2-warn, .diet-warning') || [])];
    if (sourceVisible(warning)) candidates.push(warning);
    var seen = new Set();
    return candidates.filter(node => {
      if (!sourceVisible(node)) return false;
      var text = node.textContent.trim(); if (!text || seen.has(text)) return false;
      seen.add(text); return true;
    });
  }
  function renderFollowup(impact) {
    var host = byId('vhomeDietPlanSummary'), road = dirty() ? null : nativeRoad();
    var key = road ? 'road:' + Boolean(impact) : dirty() ? 'pending' : 'no-road';
    if (draft.followupKey === key) return;
    draft.followupKey = key;
    var plan = byId('planResults');
    var fallback = !dirty() && !road && sourceVisible(byId('planCard')) && plan?.textContent.trim();
    var details = host.querySelector('details'), full = byId('vhomeDietRoadResult');
    host.hidden = !road && !fallback;
    var facts = host.querySelector('dl'), notices = host.querySelector('.vhome-diet-plan-notices');
    facts.replaceChildren(); notices.replaceChildren(); full.replaceChildren();
    if (host.hidden) return;
    nativeNotices(road).forEach(node => appendProjected(notices, node, 'notice'));
    if (road) {
      var goalFact = fact('Cel planu', ''), goalHost = goalFact.lastElementChild;
      goalHost.dataset.homeDietSummary = 'goal';
      appendProjected(goalHost, road.querySelector('.bmi-journey-goalbox'), 'goal'); facts.appendChild(goalFact);
      var control = road.querySelector('.bmi-journey-kontrola');
      if (control) {
        var controlFact = fact('Kontrola', '');
        controlFact.lastElementChild.dataset.homeDietSummary = 'control';
        appendProjected(controlFact.lastElementChild, control, 'control'); facts.appendChild(controlFact);
      }
      if (!impact) {
        var estimate = road.querySelector('.bmi-journey-hero');
        if (estimate) {
          var forecast = fact('Szacowany czas do celu', '');
          forecast.lastElementChild.dataset.homeDietSummary = 'forecast';
          appendProjected(forecast.lastElementChild, estimate, 'forecast'); facts.appendChild(forecast);
        }
      }
      road.querySelectorAll('.energy-mode-badge-row, .bmi-journey-growth').forEach(node => appendProjected(notices, node, 'qualification'));
      var copy = readonlyCopy(byId('toNormInfo'), 'vhome-diet-native-road');
      copy.querySelectorAll('.bmi-journey-seg, .bmi-journey-chips').forEach(node => {
        if (node.previousElementSibling?.classList.contains('bmi-journey-lbl')) node.previousElementSibling.remove();
        node.remove();
      });
      if (impact) copy.querySelector('.bmi-journey-table')?.remove();
      full.appendChild(copy);
    }
    if (plan?.textContent.trim()) {
      var nativeDetails = el('details', 'vhome-diet-native-plan-details'); nativeDetails.id = 'vhomeDietNativePlan';
      nativeDetails.append(el('summary', '', 'Pełny wynik modułu energetycznego'), readonlyCopy(plan, 'vhome-diet-native-plan'));
      full.appendChild(nativeDetails);
    }
    var disclaimer = byId('toNormNote');
    if (road && sourceVisible(disclaimer)) appendProjected(full, disclaimer, 'disclaimer');
    facts.hidden = !facts.children.length; details.hidden = !full.children.length;
  }
  function setChoices(control, entries, selected) {
    var key = JSON.stringify(entries);
    if (control.dataset.choices !== key) {
      control.dataset.choices = key;
      control.replaceChildren(...entries.map(entry => {
        var option = el('option', '', entry.label); option.value = entry.key; option.disabled = !!entry.disabled;
        if (entry.reason) option.title = entry.reason;
        return option;
      }));
    }
    control.value = selected;
    control.disabled = draft.readOnly || entries.length <= 1;
    control.parentElement.hidden = !entries.length;
  }
  function addSetting(host, name, label, read) {
    var field = el('label', 'vhome-diet-field', label), select = el('select');
    select.dataset.homeDietField = name; select.setAttribute('aria-label', label);
    field.append(select, el('small', 'vhome-diet-note')); host.appendChild(field);
    change(select, function () { read(select.value); }); return select;
  }
  function renderSettings(projection) {
    var strategy = setting('strategy'), pal = setting('palFactor'), diet = setting('dietLevel'), aim = setting('goal'), target = setting('customGoalKg');
    var context = byId('dietRecommendationsContent');
    var strategies = Array.from(context.querySelectorAll('[data-diet-strategy-choice]')).filter(node => withinVisible(node, context))
      .map(node => ({ key: node.dataset.dietStrategyChoice, label: node.textContent.trim(), disabled: node.disabled, reason: node.title }));
    if (projection?.stabilizationAvailable === false && draft.values.growthEndedFlag) strategies = strategies.filter(entry => entry.key !== 'stabilization');
    if (projection?.stabilizationAvailable && strategies.length && !strategies.some(entry => entry.key === 'stabilization')) {
      var hiddenStabilization = context.querySelector('[data-diet-strategy-choice="stabilization"]');
      if (hiddenStabilization) strategies.push({ key: 'stabilization', label: hiddenStabilization.textContent.trim() });
    }
    var strategyValue = projection?.strategy ?? (draft.values.stabilizationToggle ? 'stabilization' : 'reduction');
    setChoices(strategy, strategies, strategyValue);
    setText(strategy.nextElementSibling, strategies.find(entry => entry.disabled && entry.reason)?.reason || '');
    var road = nativeRoad(), activePlan = sourceVisible(byId('planCard'));
    var palChoices = activePlan || road || projection?.diets.length ? Array.from(byId('palFactor').options).filter(entry => !entry.hidden)
      .map(entry => ({ key: entry.value, label: entry.textContent, disabled: entry.disabled })) : [];
    setChoices(pal, palChoices, draft.values.palFactor);
    setText(pal.nextElementSibling, draft.values.palFactor !== draft.baseValues.palFactor ? 'Zmiana niezastosowana'
      : w.__vildaPlanPalTouched === true ? 'Wybrany przez lekarza' : 'Wartość domyślna');
    var diets = projection?.diets;
    if (!diets?.length && !dirty() && road) diets = Array.from(road.querySelectorAll('[data-journey="diet"]')).map(node => ({
      key: node.dataset.key, label: ownText(node), disabled: node.disabled, reason: node.title,
      detail: node.querySelector('.bmi-journey-sub')?.textContent.trim()
    }));
    if ((!diets || !diets.length) && activePlan && withinVisible(byId('dietLevel'), byId('planCard'))) {
      diets = Array.from(byId('dietLevel').options).filter(entry => !entry.hidden).map(entry => ({ key: entry.value, label: entry.textContent, disabled: entry.disabled }));
    }
    diets = diets || [];
    var dietKey = projection?.dietKey || draft.values.dietLevel;
    setChoices(diet, diets.map(entry => ({ ...entry, label: entry.label + (entry.disabled ? ' · niedostępna' : '') })), dietKey);
    var unavailable = [...new Set(diets.filter(entry => entry.disabled).map(entry => entry.reason).filter(Boolean))];
    setText(diet.nextElementSibling, [diets.find(entry => entry.key === dietKey)?.detail, ...unavailable].filter(Boolean).join(' · '));
    var goalWrap = byId('customGoalWrap');
    var goalChoices = sourceVisible(goalWrap) ? Array.from(goalWrap.querySelectorAll('[data-cel-wlasny-choice]')).map(node => ({ key: node.dataset.celWlasnyChoice, label: node.textContent.trim(), disabled: node.disabled })) : [];
    if (projection) goalChoices = projection.customGoalVisible
      ? [{ key: 'maintain', label: 'Utrzymanie' }, { key: 'custom', label: 'Cel własny', disabled: !projection.customGoalAvailable }] : [];
    setChoices(aim, goalChoices, draft.goal);
    setText(aim.nextElementSibling, projection?.customGoalHint || (sourceVisible(goalWrap) ? byId('customGoalHint')?.textContent || '' : ''));
    var targetAvailable = draft.goal === 'custom' && goalChoices.some(entry => entry.key === 'custom' && !entry.disabled);
    target.parentElement.hidden = !targetAvailable;
    target.disabled = draft.readOnly || !targetAvailable;
    target.required = targetAvailable;
    if (projection?.customGoalMinKg != null) target.min = String(projection.customGoalMinKg);
    if (projection?.customGoalMaxKg != null) target.max = String(projection.customGoalMaxKg);
    if (target.value !== draft.values.customGoalKg) target.value = draft.values.customGoalKg ?? '';
    setText(target.nextElementSibling, targetAvailable ? projection?.customGoalHint || '' : '');
    var growth = setting('growthEndedFlag'), growthOriginal = byId('growthEndedFlag');
    growth.parentElement.hidden = !withinVisible(growthOriginal, context);
    growth.disabled = draft.readOnly || growthOriginal.disabled; growth.checked = !!draft.values.growthEndedFlag;
    var growthNote = growth.parentElement.querySelector('small');
    setText(growthNote, growthOriginal.disabled ? growthOriginal.closest('label')?.title || '' : '');
    var moves = projection?.moves ?? [];
    if (!moves.length && !dirty() && road) moves = Array.from(road.querySelectorAll('[data-journey="move"]')).map(node => ({
      key: node.dataset.key, label: plainLabel(node.textContent), selected: node.getAttribute('aria-pressed') === 'true' }));
    renderMovementChoices(moves);
    byId('vhomeDietNoSettings').hidden = Array.from(byId('vhomeDietFields').children).some(node => !node.hidden) || !growth.parentElement.hidden || moves.length > 0;
  }
  function setting(name) { return dialog.querySelector('[data-home-diet-field="' + name + '"]'); }
  function renderMovementChoices(moves) {
    var picker = byId('vhomeDietMovement'), choices = byId('vhomeDietMovementChoices');
    picker.hidden = !moves.length;
    var key = moves.map(move => move.key).join(' ');
    if (choices.dataset.keys !== key) {
      choices.dataset.keys = key;
      choices.replaceChildren();
      moves.forEach(move => {
        var input = checkbox(choices, 'move-' + move.key, plainLabel(move.label), checked => { draft.moves[move.key] = checked; });
        delete input.dataset.homeDietField;
        input.dataset.homeDietJourney = 'move'; input.dataset.key = move.key;
      });
    }
    choices.querySelectorAll('input').forEach((input, index) => {
      input.checked = !!moves[index].selected; input.disabled = draft.readOnly;
    });
    var selected = moves.filter(move => move.selected);
    setText(byId('vhomeDietMovementSummary'), selected.length > 1 ? selected.length + ' aktywności'
      : selected.length ? plainLabel(selected[0].label) : 'Brak dodatkowego ruchu');
  }
  function currentReport(item, report) {
    return !!(report && draft === item && item.report === report && stillOwned() && !dirty() && available() && savedReportReady(item));
  }
  function refreshReport() {
    var status = byId('vhomeDietReportMessage'), paper = byId('vhomeDietEnergy'), prepare = byId('vhomeDietPrepareReport');
    var pdf = dialog.querySelector('[data-home-diet-action="pdf"]'), usable = stillOwned() && !dirty() && available() && savedReportReady(draft);
    var report = usable ? draft.report : null;
    dialog.querySelectorAll('.vhome-diet-options-body input').forEach(input => { input.disabled = !usable || draft.readOnly; });
    prepare.disabled = !usable || !!report;
    paper.hidden = !report; status.hidden = !!report;
    byId('vhomeDietExportActions').hidden = !report;
    var canPdf = w.VildaDietRecommendations?.hasHomePdfAvailable?.() === true;
    pdf.disabled = !report || !canPdf || !!draft.pdfPending;
    setText(byId('vhomeDietPdfNote'), report && !canPdf ? 'Dla danych tej wizyty dostępne jest kopiowanie zaleceń.' : '');
    if (report) {
      if (paper.firstElementChild !== report.host) paper.replaceChildren(report.host);
    } else {
      paper.replaceChildren();
      setText(status, dirty() ? 'Wróć do zakładki „Plan żywieniowy” i zastosuj zmiany przed przygotowaniem dokumentu.'
        : usable ? 'Wybierz treść i przygotuj zalecenia, aby zobaczyć podgląd.' : 'Do przygotowania zaleceń potrzebne są potwierdzone dane i ustawienia tej wizyty.');
    }
  }
  function refreshFooter() {
    if (!draft || !dialog.open) return;
    if (!stillOwned()) { close(true); return; }
    var projection = !draft.readOnly || draft.canReport ? draftProjection() : null;
    if (!draft.readOnly && draft.goal === 'custom' && projection?.customGoalAvailable === false && draft.values.growthEndedFlag !== draft.baseValues.growthEndedFlag) {
      draft.goal = 'maintain'; projection = draftProjection();
    }
    var changed = dirty(), applyButton = planActions.querySelector('.vhome-dialog-apply');
    planActions.hidden = draft.readOnly;
    applyButton.disabled = !changed || draft.readOnly;
    planActions.querySelector('.vhome-dialog-cancel').hidden = !changed;
    if (!draft.readOnly || draft.canReport) {
      var impact = projection?.impact;
      renderEnergy(); renderSettings(projection); renderImpact(impact); renderFollowup(impact);
    }
    refreshReport();
  }
  function selectTab(index, focus) {
    draft.tab = index;
    dialog.querySelectorAll('.vhome-diet-tabs [role="tab"]').forEach((tab, position) => {
      var active = index === position;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      var panel = byId(tab.getAttribute('aria-controls'));
      if (panel) panel.hidden = !active;
      if (active && focus) tab.focus({ preventScroll: true });
    });
    if (focus) dialog.querySelector('.vhome-dialog-body').scrollTop = 0;
  }
  function createWorkspace() {
    dialog = w.VildaHomeWorkspace.createDialog({ id: 'vhomeDietDialog', titleId: 'vhomeDietTitle', title: 'Zalecenia dietetyczne',
      applyLabel: 'Zastosuj założenia', onApply: apply, onClose: function () { close(false); } });
    dialog.classList.add('vhome-diet-workspace');
    var title = byId('vhomeDietTitle'), header = el('div'), context = el('p', 'vhome-diet-context');
    context.id = 'vhomeDietContext'; title.before(header); header.append(title, context);
    var tabs = el('div', 'vhome-diet-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Zalecenia dietetyczne');
    tabLabels.forEach((label, index) => {
      var tab = button(label, function () { selectTab(index, true); });
      tab.id = 'vhomeDietTab' + index; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', 'vhomeDietPanel' + index);
      tab.addEventListener('keydown', event => {
        var position = { ArrowRight: 1 - index, ArrowLeft: 1 - index, Home: 0, End: 1 }[event.key];
        if (position == null) return;
        event.preventDefault(); selectTab(position, true);
      });
      tabs.appendChild(tab);
    });
    dialog.querySelector('.vhome-dialog-body').before(tabs);
    planActions = dialog.querySelector('.vhome-dialog-footer'); planActions.classList.add('vhome-diet-plan-actions');
    var cancel = button('Cofnij zmiany', resetPlan, 'vhome-dialog-cancel');
    planActions.querySelector('.vhome-dialog-cancel').replaceWith(cancel);
  }
  function panel(index) {
    var host = el('section', 'vhome-diet-tab-panel'); host.id = 'vhomeDietPanel' + index;
    host.setAttribute('role', 'tabpanel'); host.setAttribute('aria-labelledby', 'vhomeDietTab' + index); host.tabIndex = 0; return host;
  }
  function renderImpactShell(host) {
    var impact = el('section', 'vhome-diet-impact'), heading = el('div', 'vhome-diet-impact-heading');
    impact.id = 'vhomeDietImpact'; impact.hidden = true;
    var name = el('h4', '', 'Wpływ ruchu na plan'); name.id = 'vhomeDietImpactHeading'; name.tabIndex = -1;
    impact.setAttribute('aria-labelledby', name.id);
    var status = el('span', 'vhome-diet-preview-state', 'Podgląd zmian'); status.id = 'vhomeDietImpactStatus'; status.hidden = true;
    heading.append(name, status);
    var live = el('div'); live.setAttribute('role', 'status');
    var estimate = note('Szacowany czas do celu'); estimate.id = 'vhomeDietImpactEstimate';
    var comparison = el('dl', 'vhome-diet-impact-comparison'); comparison.id = 'vhomeDietImpactComparison';
    var energy = note(''); energy.id = 'vhomeDietImpactEnergy'; live.append(estimate, comparison, energy);
    var details = el('details', 'vhome-diet-impact-details');
    var table = el('table', 'vhome-diet-impact-table'), headings = el('thead'), row = el('tr'), body = el('tbody'), total = el('tfoot');
    body.id = 'vhomeDietImpactRows'; total.id = 'vhomeDietImpactTotal';
    ['Składnik planu', 'kcal/tydz.', 'kg/mies.'].forEach(label => { var cell = el('th', '', label); cell.scope = 'col'; row.appendChild(cell); });
    headings.appendChild(row); table.append(headings, body, total);
    details.append(el('summary', '', 'Tygodniowy wkład diety i ruchu'), table,
      note('Kolumna kg/mies. pokazuje równoważnik masy wyliczony z deficytu energii.'));
    impact.append(heading, live, details); host.appendChild(impact);
  }
  function checkbox(host, name, label, onChange) {
    var id = 'vhomeDietField-' + name, wrap = el('label', 'vhome-diet-check'), input = el('input');
    input.type = 'checkbox'; input.id = id; input.dataset.homeDietField = name; wrap.htmlFor = id;
    wrap.append(input, el('span', '', label)); host.appendChild(wrap);
    change(input, function () { onChange(input.checked); }); return input;
  }
  function renderPlanGrid(host) {
    var grid = el('div', 'vhome-diet-grid'); host.appendChild(grid);
    var outcome = section('Wynik energetyczny', 'vhome-diet-outcome', grid), energy = el('div', 'vhome-diet-energy-result');
    energy.id = 'vhomeDietPlanEnergy'; outcome.appendChild(energy);
    var assumptions = section('Założenia planu', 'vhome-diet-assumptions', grid);
    if (draft.readOnly && !draft.canReport) {
      outcome.appendChild(note('Dla tej wizyty brakuje potwierdzonych danych do obliczeń.'));
      var saved = draft.saved?.plan;
      if (!saved || ![saved.palFactor, saved.dietLevel, saved.customGoalKg].some(value => value != null && value !== '')) {
        assumptions.appendChild(note(draft.saved ? 'W tej wizycie nie zapisano indywidualnych założeń żywieniowych.' : 'Brak dostępnego zapisu założeń dla tej wizyty.'));
      } else {
        var facts = el('dl', 'vhome-diet-saved-facts'); facts.id = 'vhomeDietPlanSummary';
        if (saved.palFactor != null) facts.appendChild(fact('Poziom aktywności (PAL)', String(saved.palFactor).replace('.', ',')));
        if (saved.dietLevel) facts.appendChild(fact('Wariant diety', w.DIET_LEVELS?.[saved.dietLevel]?.label || saved.dietLevel));
        if (saved.customGoalKg != null) facts.appendChild(fact('Masa docelowa', String(saved.customGoalKg).replace('.', ',') + ' kg'));
        assumptions.appendChild(facts);
      }
      return;
    }

    renderMeasurements(outcome); renderImpactShell(outcome);
    var controls = el('div', 'vhome-diet-fields'); controls.id = 'vhomeDietFields'; assumptions.appendChild(controls);
    addSetting(controls, 'strategy', 'Strategia', v => { draft.values.reduceToggle = v === 'reduction'; draft.values.stabilizationToggle = v === 'stabilization'; });
    addSetting(controls, 'palFactor', 'Poziom aktywności (PAL)', v => { draft.values.palFactor = v; });
    addSetting(controls, 'dietLevel', 'Wariant diety', v => { draft.values.dietLevel = v; });
    addSetting(controls, 'goal', 'Cel', v => { draft.goal = v; });
    var target = field('customGoalKg', 'Masa docelowa (kg)', controls); target?.parentElement.appendChild(el('small', 'vhome-diet-note'));
    var growth = checkbox(assumptions, 'growthEndedFlag', byId('growthEndedLabel')?.textContent.trim() || 'Wzrost zakończony', value => { draft.values.growthEndedFlag = value; });
    growth.parentElement.lastElementChild.appendChild(el('small', 'vhome-diet-note'));
    var movement = el('details', 'vhome-diet-movement'), title = el('summary', '', 'Ruch w planie ');
    movement.id = 'vhomeDietMovement';
    var chosen = el('span', 'vhome-diet-movement-summary'); chosen.id = 'vhomeDietMovementSummary'; title.appendChild(chosen);
    var choices = el('div', 'vhome-diet-moves'); choices.id = 'vhomeDietMovementChoices'; choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', 'Ruch w planie');
    var jump = button('Zobacz wpływ ruchu', function () {
      byId('vhomeDietImpactHeading').focus({ preventScroll: true }); byId('vhomeDietImpact').scrollIntoView({ block: 'start' });
    }, 'vhome-diet-impact-jump'); jump.id = 'vhomeDietImpactJump'; jump.setAttribute('aria-controls', 'vhomeDietImpact');
    movement.append(title, choices, jump); assumptions.appendChild(movement);
    var none = note('Vilda dobiera zalecenia do danych wizyty.'); none.id = 'vhomeDietNoSettings'; assumptions.append(none, planActions);
    var status = note(''); status.id = 'vhomeDietDraftStatus'; status.setAttribute('role', 'status'); assumptions.appendChild(status);
    var followup = section('Cel i kontrola', 'vhome-diet-followup vhome-diet-native-road', grid);
    followup.id = 'vhomeDietPlanSummary'; followup.hidden = true;
    var details = el('details', 'vhome-diet-road-details'), result = el('div'); result.id = 'vhomeDietRoadResult';
    details.append(el('summary', '', 'Szczegóły planu BMI'), result);
    followup.append(el('dl'), el('div', 'vhome-diet-plan-notices'), details);
  }
  function renderReportGrid(host) {
    var grid = el('div', 'vhome-diet-grid vhome-diet-report-grid'); host.appendChild(grid);
    var options = section('Treść dokumentu', 'vhome-diet-options', grid), fields = el('div', 'vhome-diet-options-body');
    fields.setAttribute('role', 'group'); fields.setAttribute('aria-label', 'Dodatkowe sekcje dokumentu');
    var context = byId('dietRecommendationsContent');
    documentFields.forEach(id => {
      var original = byId(id);
      if (!withinVisible(original, context)) return;
      var input = checkbox(fields, id, original.closest('label')?.querySelector('span')?.textContent.trim() || '', checked => {
        draft.scope[id] = checked; draft.report = null; setText(byId('vhomeDietReportStatus'), '');
      });
      input.checked = draft.scope[id];
    });
    var prepare = button('Przygotuj zalecenia', prepareReport, 'vhome-diet-action vhome-diet-primary'); prepare.id = 'vhomeDietPrepareReport'; prepare.dataset.homeDietAction = 'generate';
    options.append(note('Wybierz dodatkowe sekcje do przekazania pacjentowi.'), fields, prepare);
    var preview = section('Podgląd zaleceń', 'vhome-diet-document', grid), message = note(''); message.id = 'vhomeDietReportMessage';
    var paper = el('div', 'vhome-diet-document-paper'); paper.id = 'vhomeDietEnergy'; paper.tabIndex = -1;
    var actions = el('div', 'vhome-diet-actions'); actions.id = 'vhomeDietExportActions';
    var copy = button('Kopiuj zalecenia', copyReport, 'vhome-diet-action vhome-diet-primary'); copy.dataset.homeDietAction = 'copy';
    var pdf = button('Raport PDF dla pacjenta', savePdf); pdf.dataset.homeDietAction = 'pdf'; actions.append(copy, pdf);
    var pdfNote = note(''); pdfNote.id = 'vhomeDietPdfNote';
    var status = note(''); status.id = 'vhomeDietReportStatus'; status.setAttribute('role', 'status');
    preview.append(message, paper, actions, pdfNote, status);
  }
  function render() {
    var body = dialog.querySelector('.vhome-dialog-body'), plan = panel(0), report = panel(1);
    var patient = [value('firstName'), value('lastName')].filter(Boolean).join(' ') || 'Bieżący pomiar';
    setText(byId('vhomeDietContext'), draft.readOnly ? patient + ' · Zapisana wizyta' : patient);
    valueChanges = new WeakMap(); renderPlanGrid(plan); renderReportGrid(report);
    body.replaceChildren(plan, report); selectTab(draft.tab, false);
  }
  function rebase() {
    var base = snapshot(); if (!base || !draft || !ownerValid(draft)) return false;
    draft.values = Object.fromEntries(planFields.map(id => [id, value(id)])); draft.goal = goal();
    var selectedDiet = nativeRoad()?.querySelector('[data-journey="diet"][aria-pressed="true"]');
    if (selectedDiet) draft.values.dietLevel = selectedDiet.dataset.key;
    draft.baseValues = { ...draft.values }; draft.baseGoal = draft.goal;
    draft.baseMoves = { ...journeyState()?.moves }; draft.moves = { ...draft.baseMoves };
    draft.fingerprint = JSON.stringify(base); draft.projectionKey = null; draft.followupKey = null;
    draft.initial = JSON.stringify([draft.values, draft.goal, draft.moves]); return true;
  }
  function resetPlan() {
    if (!stillOwned() || draft.readOnly || !dirty()) return;
    draft.values = { ...draft.baseValues }; draft.goal = draft.baseGoal; draft.moves = { ...draft.baseMoves };
    setText(byId('vhomeDietDraftStatus'), ''); refreshFooter();
    dialog.querySelector('#vhomeDietPanel0 select:not([disabled])')?.focus({ preventScroll: true });
  }
  function apply() {
    if (!stillOwned() || draft.readOnly || readOnlyVisit() || !dirty()) return;
    var projection = draftProjection(), status = byId('vhomeDietDraftStatus');
    var invalid = Array.from(byId('vhomeDietPanel0').querySelectorAll('input,select')).find(n => !n.disabled && !n.checkValidity());
    if (invalid) { invalid.reportValidity(); return; }
    if (draft.goal === 'custom' && projection && !projection.customGoalActive) {
      setText(status, projection.customGoalHint || 'Sprawdź masę docelową w założeniach planu.'); return;
    }
    var item = draft, values = { ...item.values }, desiredGoal = item.goal, moves = { ...item.moves };
    if (projection?.dietKey) values.dietLevel = projection.dietKey;
    var changed = planFields.filter(id => values[id] !== item.baseValues[id]);
    item.applying = true; item.report = null;
    function valid() { return draft === item && ownerValid(item); }
    function write(id) {
      var field = byId(id); if (!field || field.disabled) return;
      if (field.type === 'checkbox') field.checked = values[id]; else field.value = values[id];
    }
    function notify(id) {
      var field = byId(id); if (!field || field.disabled || !valid()) return;
      field.dispatchEvent(new w.Event('input', { bubbles: true }));
      if (valid()) field.dispatchEvent(new w.Event('change', { bubbles: true }));
    }
    function update() { if (valid() && typeof w.update === 'function') w.update(); }
    try {
      var inputs = changed.filter(id => id !== 'customGoalKg' && id !== 'dietLevel');
      inputs.forEach(write);
      if (changed.includes('palFactor')) w.__vildaPlanPalTouched = true;
      if (changed.includes('reduceToggle') || changed.includes('stabilizationToggle')) w.__vildaDietStrategyTouched = true;
      inputs.forEach(notify); update(); if (!valid()) return;
      // Growth status can unlock a previously disabled native custom-goal actor.
      if (goal() !== desiredGoal) {
        var actor = Array.from(byId('customGoalWrap').querySelectorAll('[data-cel-wlasny-choice]'))
          .find(node => node.dataset.celWlasnyChoice === desiredGoal && !node.disabled);
        if (actor) actor.click();
      }
      if (!valid()) return;
      if (desiredGoal === 'custom' && goal() === 'custom' && value('customGoalKg') !== values.customGoalKg) {
        write('customGoalKg'); notify('customGoalKg'); update(); if (!valid()) return;
      }
      if (changed.includes('dietLevel')) {
        var road = nativeRoad();
        var dietActor = Array.from(road?.querySelectorAll('[data-journey="diet"]') || []).find(node => node.dataset.key === values.dietLevel && !node.disabled);
        if (dietActor) dietActor.click();
        else if (!road && sourceVisible(byId('planCard'))) { write('dietLevel'); notify('dietLevel'); update(); }
      }
      if (!valid()) return;
      for (var key of Object.keys(moves)) {
        if (!valid()) return;
        var moveActor = Array.from(nativeRoad()?.querySelectorAll('[data-journey="move"]') || []).find(node => node.dataset.key === key);
        if (moveActor && !moveActor.disabled && (moveActor.getAttribute('aria-pressed') === 'true') !== !!moves[key]) moveActor.click();
      }
      if (!valid()) return;
      if (typeof w.vildaPersistFlushNow === 'function') w.vildaPersistFlushNow({ force: true });
      if (!valid()) return;
      item.applying = false;
      if (!rebase()) return;
      setText(status, ''); refreshFooter(); schedule();
      byId('vhomeDietPlanEnergy').scrollIntoView({ block: 'nearest' });
    } finally { if (draft === item) { item.applying = false; if (!ownerValid(item)) close(true); } }
  }
  function prepareReport() {
    if (!stillOwned() || dirty() || !available() || !savedReportReady(draft)) return;
    var item = draft, scope = { ...item.scope }, host = el('div', 'vhome-diet-native-energy'), result;
    try { result = w.VildaDietRecommendations?.prepareHomeReport(scope, host); } catch (_) { /* Report content stays scoped to the current visit. */ }
    if (draft !== item || !stillOwned()) return;
    if (!result?.textOutput) { setText(byId('vhomeDietReportStatus'), 'Nie udało się przygotować zaleceń.'); return; }
    item.report = { scope, host, result };
    setText(byId('vhomeDietReportStatus'), ''); refreshReport();
    byId('vhomeDietEnergy').focus({ preventScroll: true });
    byId('vhomeDietEnergy').scrollIntoView({ block: 'nearest' });
  }
  async function copyReport() {
    var item = draft, report = item?.report;
    if (!currentReport(item, report)) return;
    var copied = false;
    try { copied = await w.VildaDietRecommendations.copyHomeReport(report.result, { isCurrent: () => currentReport(item, report) }); }
    catch (_) { /* Prompt for manual copy when the browser refuses access. */ }
    if (currentReport(item, report)) setText(byId('vhomeDietReportStatus'), copied ? 'Skopiowano zalecenia.' : 'Zaznacz tekst w podglądzie i skopiuj go ręcznie.');
  }
  async function savePdf() {
    var item = draft, report = item?.report;
    if (!currentReport(item, report) || item.pdfPending || !w.VildaDietRecommendations.hasHomePdfAvailable()) return;
    item.pdfPending = true;
    var actor = dialog.querySelector('[data-home-diet-action="pdf"]');
    try {
      var task = w.VildaDietRecommendations.generatePdfReport(actor, 'classic', {
        scope: report.scope, isCurrent: () => currentReport(item, report)
      });
      refreshReport(); await task;
    } catch (_) {
      if (currentReport(item, report)) setText(byId('vhomeDietReportStatus'), 'Nie udało się przygotować dokumentu. Spróbuj ponownie.');
    } finally { item.pdfPending = false; if (draft === item) refreshReport(); }
  }
  function close(force, focus, fromHistory) {
    if (!dialog?.open) return true;
    if (!force && dirty() && !w.confirm('Odrzucić niezastosowane założenia planu?')) return false;
    var old = draft; draft = null;
    if (old) w.clearInterval(old.timer);
    dialog.close(); dialog.removeAttribute('aria-modal'); dialog.querySelector('.vhome-dialog-body').replaceChildren();
    if (!fromHistory && old && w.history.state?.vildaHomeDialog === old.historyToken) w.history.back();
    if (focus || !force) (old?.opener?.isConnected && !old.opener.disabled ? old.opener : byId('vhomeDietExpand')).focus({ preventScroll: true });
    return true;
  }
  async function open(mode) {
    var tab = mode === 'report' ? 1 : 0;
    if (dialog?.open) { if (stillOwned()) { selectTab(tab, true); return true; } close(true); return false; }
    if (!canEdit() || !configured()) return false;
    var opener = d.activeElement, vault = w.VildaVault, token = vault.captureSyncOperationSession(), who = owner();
    if (!who) return false;
    var pending = { vault, token, ownerKey: JSON.stringify(who) };
    try { loading = loading || w.VildaPatientReportLoader.ensure(); await loading; }
    catch (_) { loading = null; setText(byId('vhomeDietNote'), 'Nie udało się otworzyć zaleceń. Spróbuj ponownie.'); return false; }
    if (!ownerValid(pending) || dialog?.open) return false;
    var saved = await savedVisitSource(pending, who);
    if (!ownerValid(pending) || dialog?.open) return false;
    if (!dialog) createWorkspace();
    draft = { ...pending, opener, tab, historyToken: 'diet-' + Date.now(), applying: false, readOnly: who.readOnly, saved,
      scope: Object.fromEntries(documentFields.map(id => [id, withinVisible(byId(id), byId('dietRecommendationsContent')) && value(id) === true])) };
    draft.canReport = available() && savedReportReady(draft);
    if (!rebase()) { draft = null; return false; }
    render(); w.VildaHomeWorkspace.fitDialog(dialog); dialog.setAttribute('aria-modal', 'true'); dialog.showModal(); refreshFooter();
    w.history.pushState(Object.assign({}, w.history.state, { vildaHomeDialog: draft.historyToken }), '', w.location.href);
    draft.timer = w.setInterval(function () { if (!stillOwned()) close(true); }, 250);
    if (mode === 'road' && byId('vhomeDietImpact') && !byId('vhomeDietImpact').hidden) byId('vhomeDietImpact').scrollIntoView({ block: 'nearest' });
    else selectTab(tab, true);
    return true;
  }
  function renderHome(ready, reportReady) {
    var result = reportReady && !readOnlyVisit() ? nativeEnergy() : null;
    var host = byId('vhomeDietHomeSummary'); host.replaceChildren();
    if (!result) {
      var empty = el('div', 'vhome-diet-home-empty');
      var text = readOnlyVisit() && ready ? 'Zobacz plan i zalecenia z zapisanej wizyty.'
        : !reportReady ? 'Dla bieżących danych moduł nie udostępnia zaleceń dietetycznych.'
          : 'Dla tej wizyty dostępne są zalecenia żywieniowe.';
      var info = note(text); info.id = 'vhomeDietNote'; empty.appendChild(info); host.appendChild(empty); return;
    }
    var metrics = el('dl', 'vhome-diet-home-result'), energy = el('div', 'vhome-diet-home-energy');
    var energyValue = el('dd'); energyValue.append(energyNumber(result), el('small', '', result.limit ? 'Górna granica dnia' : 'Z wybranej diety'));
    energy.append(el('dt', '', result.label), energyValue);
    var mode = nativeRoad()?.querySelector('.bmi-journey-kcalcap')?.textContent || result.caption;
    var strategy = goal() === 'custom' ? 'Cel własny' : mode.includes('stabilizacja') || goalStrategy() === 'stabilization' ? 'Stabilizacja masy' : 'Redukcja masy';
    var pal = value('palFactor');
    metrics.append(energy, fact('Strategia', strategy), fact('Aktywność (PAL)', pal ? pal.replace('.', ',') : '—',
      pal ? w.__vildaPlanPalTouched === true ? 'Wybrany przez lekarza' : 'Wartość domyślna' : ''));
    host.appendChild(metrics);
  }
  function refresh() {
    frame = 0; w.clearTimeout(readinessTimer); if (!started) return;
    card.hidden = !w.VildaProAccess?.hasAccess() || !configured();
    var ready = !card.hidden && canEdit(), reportReady = available();
    byId('vhomeDietExpand').disabled = !ready;
    card.querySelector('[data-home-diet-open="energy"]').disabled = !ready;
    card.querySelector('[data-home-diet-open="report"]').disabled = !ready || !reportReady;
    renderHome(ready, reportReady);
    var grid = byId('vhomeMainCards'), heading = byId('vhomeAnalysisHeading');
    if (grid && heading) heading.hidden = grid.hidden = Array.from(grid.children).every(node => node.hidden);
    if (draft && !draft.applying && !stillOwned()) close(true);
    else if (draft && !draft.applying) refreshFooter();
    if (!card.hidden && !ready && w.VildaVault?.isUnlocked()
      && (!w.VildaPanelPacjent || (w.VildaPanelPacjent.wlasciciel() || null) === patientId())) readinessTimer = w.setTimeout(schedule, 250);
  }
  function schedule() { if (!frame) frame = w.requestAnimationFrame(refresh); }
  function start() {
    if (started || !w.VildaHomeWorkspace || !byId('vhomeMainCards') || !byId('dietRecommendationsBtn')) return;
    started = true;
    // Clipping a separate owner leaves native visibility checks and PDF gates intact.
    var nativeHost = el('div', 'vhome-diet-native'); nativeHost.inert = true; nativeHost.setAttribute('aria-hidden', 'true');
    byId('dietRecommendationsBtn').before(nativeHost); nativeHost.append(byId('dietRecommendationsBtn'), byId('dietRecommendationsContent'));
    ['planCard', 'toNormCard'].forEach(id => { var node = byId(id); if (node) { node.classList.add('vhome-diet-native'); node.inert = true; node.setAttribute('aria-hidden', 'true'); } });
    card = el('section', 'vhome-diet-card'); card.id = 'vhomeDietCard'; card.setAttribute('aria-labelledby', 'vhomeDietHeading');
    var header = el('div', 'vhome-diet-heading'), title = el('h2', '', 'Zalecenia dietetyczne'); title.id = 'vhomeDietHeading';
    var expand = button('', function () { open('energy'); }, 'vhome-diet-expand'); expand.id = 'vhomeDietExpand';
    expand.setAttribute('aria-label', 'Powiększ zalecenia dietetyczne'); expand.setAttribute('aria-haspopup', 'dialog');
    var icon = byId('vhomeGrowthExpand')?.querySelector('svg'); if (icon) expand.appendChild(icon.cloneNode(true)); header.append(title, expand);
    var content = el('div', 'vhome-diet-content'), summary = el('div', 'vhome-diet-home-summary'); summary.id = 'vhomeDietHomeSummary';
    var links = el('div', 'vhome-diet-links');
    [['energy', 'Otwórz plan żywieniowy'], ['report', 'Kopiowanie i raport PDF']].forEach(([mode, label]) => {
      var actor = button(label, function () { open(mode); }, 'vhome-diet-action' + (mode === 'energy' ? ' vhome-diet-primary' : ''));
      actor.dataset.homeDietOpen = mode; actor.setAttribute('aria-haspopup', 'dialog'); links.appendChild(actor);
    });
    content.append(summary, links); card.append(header, content); byId('vhomeMainCards').appendChild(card);
    byId('dietRecommendationsBtn').addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); open('energy'); }, true);
    ['input', 'change'].forEach(name => w.addEventListener(name, event => {
      if (!dialog?.open || !dialog.contains(event.target)) return;
      event.stopImmediatePropagation();
      if (!stillOwned()) { close(true); return; }
      var read = valueChanges.get(event.target); if (read && !draft.readOnly) { read(); refreshFooter(); }
    }, true));
    w.addEventListener('popstate', function () {
      if (dialog?.open && w.history.state?.vildaHomeDialog !== draft.historyToken && !close(false, true, true)) {
        w.history.pushState(Object.assign({}, w.history.state, { vildaHomeDialog: draft.historyToken }), '', w.location.href);
      }
    });
    ['input', 'change', 'vilda:data-applied', 'vilda:user-state-cleared', 'vilda:session-changed', 'vilda:professional-summary-updated', 'vilda:state-restored', 'vilda:main-session-restored', 'vilda:initial-main-session-restore-settled', 'vilda:auth-boot-settled', 'vildaProAccessChanged', 'vildaResultsModeChanged'].forEach(name => d.addEventListener(name, schedule));
    var observer = new w.MutationObserver(schedule);
    ['toNormInfo', 'planResults'].forEach(id => { var node = byId(id); if (node) observer.observe(node, { childList: true, subtree: true }); });
    ['metabolicSummarySection', 'dietRecommendationsBtn', 'toNormCard', 'planCard'].forEach(id => {
      var node = byId(id); if (node) observer.observe(node, { attributes: true, attributeFilter: ['hidden', 'style'] });
    });
    if (w.VildaVault?.onLock) w.VildaVault.onLock(function () { close(true); schedule(); });
    w.addEventListener('pageshow', schedule); refresh();
  }
  w.VildaHomeDiet = Object.freeze({ open: open, refresh: schedule });
  d.addEventListener('vilda:home-workspace-ready', start);
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})(typeof window !== 'undefined' ? window : globalThis);
