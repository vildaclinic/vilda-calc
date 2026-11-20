/* Estimated intake uses the same input, energy/risk, and presentation models
 * as the native card. Only Apply reaches the native shared history actors. */
(function (w, d) {
  'use strict';
  const tools = w.VildaHomeTools;
  if (!tools) return;

  const fields = [
    ['ageYears', 'intake-ageY', 'Wiek · lata', 1, 0, 130],
    ['ageMonths', 'intake-ageM', 'Wiek · miesiące', 1, 0, 11],
    ['height', 'intake-ht', 'Wzrost · cm', 'any'],
    ['weight', 'intake-wt', 'Masa · kg', 'any'],
  ];
  const rowIds = new WeakMap();
  const counts = new Intl.PluralRules('pl');
  const numbers = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
  let nextRowId = 0;
  const byId = id => d.getElementById(id);
  const nativeRows = () => Array.from(d.querySelectorAll('#intakeMeasurements .measure-row-intake'));
  const fieldControl = (node, className) => node.querySelector('.' + className);
  const event = name => new w.Event(name, { bubbles: true });

  function copyRow(node) {
    if (!rowIds.has(node)) rowIds.set(node, ++nextRowId);
    const locked = node.dataset.locked === 'true';
    const syncId = node.dataset.advIntakeSyncId || null;
    const advanced = syncId && w._findAdvRowBySyncId?.(syncId);
    const ghId = node.getAttribute('data-gh-id') || advanced?.getAttribute('data-gh-id') || null;
    const gh = !!ghId || node.getAttribute('data-gh-sync') === 'true' || advanced?.getAttribute('data-gh-sync') === 'true';
    const values = Object.fromEntries(fields.map(([key, className]) => [key, fieldControl(node, className).value]));
    return { id: rowIds.get(node), locked, gh, ghId, syncId, values };
  }

  function read() {
    const pal = byId('intakePal');
    if (!pal || !byId('intakeMeasurements') || byId('toggleIntakeCard')?.style.display === 'none'
        || !w.VildaAnorexiaRisk?.previewRiskAdjustment || !w.VildaEstimatedIntakeInputModel || !w.VildaEstimatedIntakeUI
        || !w.VildaEstimatedIntakeDomMount || !w.VildaEstimatedIntakeRuntime || !w.VildaEstimatedIntake
        || !w.VildaDataImportExport?.scheduleMainSessionSave || typeof w.vildaPersistScheduleSave !== 'function'
        || typeof w.vildaHandleIntakeHistoryAdd !== 'function' || typeof w.vildaHandleIntakeHistoryRowRemove !== 'function') return null;
    return {
      pal: pal.value,
      palOptions: Array.from(pal.options, option => [option.value, option.text]),
      nativePalDefault: w.__vildaIntakePalDefault || null,
      nativePalTouched: w.__vildaIntakePalTouched === true,
      source: d.querySelector('[name="dataSource"]:checked')?.value || null,
      population: w.VildaDsSource?.populacja?.() || 'OGOLNA',
      basics: w.getUserBasics(),
      rows: nativeRows().map(copyRow),
    };
  }

  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function mount(view, draft, edit) {
    const doc = view.document;
    const panel = element(doc, 'div', 'vhome-tool-intake-panel');
    const palMode = element(doc, 'p', 'muted');
    const openingPal = draft.pal;
    const updatePalMode = value => {
      palMode.textContent = draft.nativePalTouched || value !== openingPal
        ? 'Ustawienie własne' : 'Domyślnie jak w zaleceniach dietetycznych';
    };
    const pal = view.makeField({ key: 'pal', label: 'Poziom aktywności (PAL)', type: 'select', options: draft.palOptions }, draft, (key, value) => {
      updatePalMode(value);
      edit(key, value);
    });
    updatePalMode(draft.pal);
    view.controls.get('pal').id = 'intakePal';
    const list = element(doc, 'div', 'vhome-tool-intake-rows');
    list.id = 'intakeMeasurements';
    const add = element(doc, 'button', 'vhome-tool-action', 'Dodaj pomiar');
    add.type = 'button';
    panel.append(pal, palMode, element(doc, 'h4', '', 'Pomiary historyczne'), list, add);
    view.input.append(panel);

    let rows = draft.rows.slice();
    function updateRows() {
      edit('rows', rows);
    }
    function draw(focusIndex) {
      list.replaceChildren();
      rows.forEach((row, index) => {
        const card = element(doc, 'div', 'measure-row-intake vhome-tool-intake-row');
        if (row.locked) card.dataset.locked = 'true';
        const readOnly = row.locked || row.gh;
        const title = row.locked ? 'Bieżąca wizyta' : row.gh ? 'Pomiar z leczenia GH' : 'Pomiar historyczny';
        card.setAttribute('role', 'group');
        card.setAttribute('aria-label', title);
        card.append(element(doc, 'h4', '', title));
        fields.forEach(([key, className, label, step, min, max]) => {
          const descriptor = { key, type: 'number', label, disabled: readOnly, step };
          const control = view.makeField({ ...descriptor, min, max }, row.values, (name, value) => {
            rows = rows.map((previous, i) => i === index
              ? { ...previous, values: { ...previous.values, [name]: value } } : previous);
            updateRows();
          });
          const input = control.querySelector('input');
          // Already stored entries remain editable with their original values.
          if (!input.validity.valid) {
            input.removeAttribute('min');
            input.removeAttribute('max');
            input.step = 'any';
          }
          input.className = className;
          card.append(control);
        });
        if (!readOnly && (row.id === null || Object.values(row.values).some(Boolean))) {
          const remove = element(doc, 'button', 'vhome-tool-action', 'Usuń pomiar');
          remove.type = 'button';
          remove.addEventListener('click', () => {
            rows = rows.filter((_, i) => i !== index);
            draw(Math.min(index, rows.length - 1));
            updateRows();
          });
          card.append(remove);
        }
        list.append(card);
        if (index === focusIndex && !readOnly) card.querySelector('input').focus();
      });
      if (focusIndex !== undefined && !list.contains(doc.activeElement)) add.focus();
    }

    add.addEventListener('click', () => {
      rows = [...rows, { id: null, locked: false, gh: false, ghId: null, syncId: null,
        values: Object.fromEntries(fields.map(([key]) => [key, ''])) }];
      draw(rows.length - 1);
      updateRows();
    });
    draw();
  }

  function previewEnergy(input) {
    return w.energyBuildIntakeObservedState({ ...input, renderRisk: false });
  }

  function render(draft, view) {
    const doc = view.document;
    const inputAdapter = w.VildaEstimatedIntakeInputModel;
    const intake = w.VildaEstimatedIntake;
    const native = w.getVildaEstimatedIntakeCalculationModelDependencies();
    const dependencies = {
      ...native,
      energyBuildIntakeObservedState: previewEnergy,
      buildIntakeIntervals: intake.buildIntakeIntervals,
      intervalDependencies: { ...native.intervalDependencies, energyBuildIntakeObservedState: previewEnergy },
    };
    const input = inputAdapter.buildEstimatedIntakeCalcInputModel({ document: doc }, {
      getUserBasics: () => draft.basics,
      readIntakeRows: () => intake.readIntakeRows({ document: doc }),
    });
    const lastObserved = inputAdapter.buildEstimatedIntakeLastObservedModel(input, {}, dependencies);
    const model = intake.buildEstimatedIntakeCalculationModel(input, lastObserved, dependencies);
    const markup = w.VildaEstimatedIntakeUI.buildResultsHtml(model);
    const result = element(doc, 'div', 'vhome-tool-intake-result');
    const nativeResult = element(doc, 'div', 'result-box');
    nativeResult.id = 'intakeResults';
    const legend = element(doc, 'div', 'muted');
    legend.id = 'intakeLegend';
    const nativeLegend = byId('intakeLegend');
    if (nativeLegend) legend.append(...Array.from(nativeLegend.childNodes, node => doc.importNode(node, true)));
    w.VildaEstimatedIntakeDomMount.applyEstimatedIntakeResultsRenderModel({ res: nativeResult, legendEl: legend }, markup);
    const last = model.intervals.at(-1);
    if (last && Number.isFinite(last.intakePerDay) && Number.isFinite(last.energyDeltaPerDay)) {
      const summary = element(doc, 'section', 'vhome-tool-intake-kpis');
      summary.setAttribute('aria-label', 'Ostatni analizowany okres');
      const balance = (last.energyDeltaPerDay > 0 ? '+' : '') + numbers.format(last.energyDeltaPerDay);
      for (const [label, value] of [['Szacowane spożycie', numbers.format(last.intakePerDay)], ['Bilans energii', balance]]) {
        const item = element(doc, 'div', '');
        item.append(element(doc, 'span', '', label), element(doc, 'strong', '', value + ' kcal/d'));
        summary.append(item);
      }
      result.append(summary);
    }
    result.append(nativeResult, legend);
    const plan = model.postRenderRiskPlan;
    if (plan?.shouldRun) {
      const risk = previewEnergy({
        ageYears: plan.row.ageYears,
        ageMonthsOpt: (plan.row.ageMonths || 0) % 12,
        sex: plan.sex,
        weightKg: plan.row.weight,
        heightCm: plan.rowHeight,
        palInput: plan.pal,
        history: w.VildaEstimatedIntakeRuntime.buildEstimatedIntakeWindowHistory(model.commitPlan.rows),
        intakeKcalPerDay: plan.intakeKcalPerDay,
        applyRiskAdjust: true,
      });
      if (risk.riskHtml) {
        const severity = risk.risk.level === 'high' ? 'danger' : 'warn';
        const alert = element(doc, 'div', 'intake-alert ' + severity);
        alert.setAttribute('role', 'status');
        w.VildaHtml.setTrustedHtml(alert, risk.riskHtml, { context: 'home-tools:intake-risk' });
        nativeResult.append(alert);
        result.severity = severity === 'warn' ? 'warning' : severity;
      }
    }
    return result;
  }

  function sameValues(a, b) {
    return fields.every(([key]) => a[key] === b[key]);
  }

  function complete(values) {
    const { ageYears, ageMonths, height, weight } = values;
    return (ageYears !== '' || ageMonths !== '') && Number(ageYears) >= 0 && Number(ageMonths) >= 0
      && Number(height) > 0 && Number(weight) > 0;
  }

  function planRows(draft, nodes) {
    const originals = new Map(nodes.map(node => {
      const row = copyRow(node);
      return [row.id, { node, row }];
    }));
    const keep = new Set();
    const edits = [];
    const additions = [];
    for (const row of draft.rows) {
      if (row.id === null) {
        if (!complete(row.values)) return null;
        additions.push(row.values);
        continue;
      }
      const original = originals.get(row.id);
      if (!original || keep.has(row.id)) return null;
      keep.add(row.id);
      if (sameValues(row.values, original.row.values)) continue;
      if (original.row.locked || original.row.gh || !complete(row.values)) return null;
      edits.push({ ...original, values: row.values });
    }
    const remove = Array.from(originals.values()).filter(({ row }) => !keep.has(row.id));
    if (remove.some(({ row }) => row.locked || row.gh)) return null;
    return { edits, additions, remove };
  }

  function validate(draft) {
    return draft.palOptions.some(([value]) => value === draft.pal) && !!planRows(draft, nativeRows());
  }

  function apply(draft, isCurrent) {
    if (!isCurrent()) return false;
    const pal = byId('intakePal');
    if (!pal || !Array.from(pal.options).some(option => option.value === draft.pal)) return false;
    const plan = planRows(draft, nativeRows());
    if (!plan) return false;
    const pendingFields = plan.edits.slice();
    for (const values of plan.additions) {
      if (!isCurrent()) return false;
      const before = new Set(nativeRows());
      if (w.vildaHandleIntakeHistoryAdd() !== true || !isCurrent()) return false;
      const created = nativeRows().filter(row => !before.has(row) && !copyRow(row).locked && !copyRow(row).gh);
      if (created.length !== 1) return false;
      pendingFields.push({ node: created[0], values });
    }
    for (const { node } of plan.remove) {
      if (!isCurrent() || !node.isConnected || copyRow(node).gh) return false;
      if (w.vildaHandleIntakeHistoryRowRemove(node) !== true) return false;
    }
    for (const { node, values } of pendingFields) {
      if (!isCurrent() || !node.isConnected) return false;
      const live = copyRow(node);
      if (live.locked || live.gh) return false;
      fields.forEach(([key, className]) => { fieldControl(node, className).value = values[key]; });
    }
    if (!isCurrent()) return false;
    const palChanged = pal.value !== draft.pal;
    if (palChanged) {
      pal.value = draft.pal;
      w.__vildaIntakePalTouched = true;
      w.__vildaIntakePalDefault = null;
    }
    for (const { node } of pendingFields) {
      if (!isCurrent() || !node.isConnected) return false;
      fieldControl(node, 'intake-ageY').dispatchEvent(event('input'));
    }
    if (!isCurrent()) return false;
    if (palChanged) pal.dispatchEvent(event('change'));
    if (!isCurrent()) return false;
    w.calcEstimatedIntake();
    if (!isCurrent()) return false;
    w.vildaPersistScheduleSave();
    w.VildaDataImportExport.scheduleMainSessionSave();
    return true;
  }

  function historyCount(values) {
    return values?.rows.filter(row => !row.locked && complete(row.values)).length || 0;
  }

  function status(values) {
    if (!values) return 'Uzupełnij główny formularz';
    const count = historyCount(values);
    if (!count) return 'Dodaj historię pomiarów';
    const noun = counts.select(count);
    const label = { one: 'wcześniejszy pomiar', few: 'wcześniejsze pomiary', many: 'wcześniejszych pomiarów' }[noun];
    return 'Historia · ' + count + ' ' + label;
  }

  tools.register('intake', { read, mount, render, validate, apply, status, hasData: values => historyCount(values) > 0 });
})(window, document);
