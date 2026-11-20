/* Clinical assessment stays with the native calculators. The tool form passes
 * detached measurements to their presentation functions until explicit Apply. */
(function (w) {
  'use strict';
  const tools = w.VildaHomeTools;
  if (!tools) return;
  const d = w.document;
  const byId = id => d.getElementById(id);
  const value = id => byId(id)?.value ?? '';
  const age = () => typeof w.getAgeDecimal === 'function' ? Number(w.getAgeDecimal()) || 0 : 0;
  function readPopulation() {
    const patient = w.sessionStorage.getItem('vildaCurrentPatientId') || w._vildaCurrentPatientId || null;
    const state = w.VildaDsSource?.getState?.();
    const ready = patient ? state?.patientId === patient && state.status === 'ready' : !state?.patientId;
    return { ready, ds: !!(ready && patient && state.population === 'DS') };
  }

  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function setResult(node, html, context) {
    w.VildaHtml.setTrustedHtml(node, html, { context: 'home-tools:' + context });
    return node;
  }
  function resultBox(doc, result, context) {
    const box = setResult(element(doc, 'div', 'result-box'), result.html, context);
    if (result.severity) box.dataset.severity = result.severity;
    return box;
  }
  function numberField(key, label, min, max) {
    return { key, label, type: 'number', min, max, step: 0.1 };
  }
  function applyValues(changes, isCurrent) {
    if (!isCurrent()) return false;
    const pending = changes.map(([id, next, event = 'input']) => ({ node: byId(id), next, event }));
    if (pending.some(({ node }) => !node || node.disabled || node.readOnly)) return false;
    const changed = pending.filter(({ node, next }) => node.value !== next);
    changed.forEach(({ node, next }) => { node.value = next; });
    for (const { node, event } of changed) {
      if (!isCurrent()) return false;
      node.dispatchEvent(new w.Event(event, { bubbles: true }));
    }
    return isCurrent();
  }
  function nativeAction(id, label, options = {}) {
    const control = () => options.selector ? byId(id)?.querySelector(options.selector) : byId(id);
    const initial = control();
    return {
      label,
      closeBefore: options.closeBefore,
      disabled: !initial || initial.disabled === true,
      run(isCurrent) {
        const node = control();
        if (!node || node.disabled || !isCurrent()) return false;
        node.click();
        return true;
      },
    };
  }

  function readWfh() {
    const population = readPopulation();
    return {
      ...w.VildaWfh.readInput(),
      source: value('wfhNormsSource'),
      bmiSource: typeof bmiSource === 'string' ? bmiSource : null,
      years: value('age'),
      months: value('ageMonths'),
      populationReady: population.ready,
      ds: population.ds,
    };
  }
  function wfhResult(draft) {
    return w.VildaWfh.buildResult({
      ...draft,
      age: draft.age ?? NaN,
      source: draft.source === 'who' ? 'who' : 'imid',
    });
  }
  const coleResult = draft => draft.populationReady ? w.vildaUpdatePrepBuildColeDisplay(draft) : null;
  function mountWfh(view, draft, edit) {
    const doc = view.document;
    const toPolish = (raw, unit) => raw ? Number(raw).toLocaleString('pl-PL') + ' ' + unit : '—';
    const context = element(doc, 'dl', 'vhome-tool-shared-fields');
    const reportedAge = [draft.years ? draft.years + ' l.' : '', draft.months ? draft.months + ' mies.' : '']
      .filter(Boolean).join(' ');
    const sex = draft.sex === 'M' ? 'Męska' : draft.sex === 'F' ? 'Żeńska' : '—';
    [
      ['Wiek', reportedAge || '—'],
      ['Płeć', sex],
      ['Masa ciała', toPolish(draft.weight, 'kg')],
      ['Wysokość / długość', toPolish(draft.height, 'cm')],
    ].forEach(([label, text]) => context.append(element(doc, 'dt', '', label), element(doc, 'dd', '', text)));
    view.input.appendChild(context);
    if (!wfhResult(draft).showSource) return;
    const label = element(doc, 'label', 'vhome-tool-field vhome-tool-anthropometry-source');
    const select = element(doc, 'select');
    Array.from(byId('wfhNormsSource')?.options || []).forEach(native => {
      const option = element(doc, 'option', '', native.textContent);
      option.value = native.value;
      select.appendChild(option);
    });
    select.value = draft.source;
    select.dataset.homeToolField = 'source';
    select.addEventListener('change', () => edit('source', select.value));
    view.controls.set('source', select);
    label.append(element(doc, 'span', '', 'Źródło norm (do 2. roku życia)'), select);
    view.input.appendChild(label);
  }

  function renderWfh(draft, { document: doc }) {
    const root = element(doc, 'div', 'vhome-tool-anthropometry');
    const result = wfhResult(draft);
    if (result.assessment && !result.severity) result.severity = 'normal';
    root.appendChild(resultBox(doc, result, 'wfh'));
    const reminder = w.vildaUpdatePrepWflReminder(draft.age);
    if (reminder) root.appendChild(element(doc, 'p', 'source-note', reminder));

    const cole = coleResult(draft);
    const section = element(doc, 'section', 'vhome-tool-anthropometry');
    if (cole) {
      const valueBox = resultBox(doc, cole, 'cole-value');
      if (cole.category) valueBox.appendChild(element(doc, 'div', '', cole.category));
      section.appendChild(valueBox);
      const info = element(doc, 'details');
      info.append(
        element(doc, 'summary', '', 'Interpretacja i normy'),
        setResult(element(doc, 'div', 'cole-explanation'), cole.explanationHtml, 'cole-explanation'),
        setResult(element(doc, 'div'), cole.tableHtml, 'cole-table')
      );
      section.appendChild(info);
      if (cole.bannerHtml) {
        const banner = setResult(element(doc, 'div'), cole.bannerHtml, 'cole-diagnostics');
        banner.querySelector('a')?.remove();
        section.appendChild(banner);
      }
    } else {
      section.appendChild(element(doc, 'h4', '', 'Wskaźnik Cole’a'));
      section.appendChild(element(doc, 'p', 'circ-placeholder', draft.populationReady
        ? 'Brak wyniku wskaźnika Cole’a dla bieżących danych.'
        : 'Ocena będzie dostępna po potwierdzeniu danych pacjenta.'));
    }
    root.appendChild(section);
    return root;
  }

  if (w.VildaWfh?.buildResult && w.vildaUpdatePrepBuildColeDisplay) tools.register('wfh', {
    inputTitle: 'Dane ze wspólnego formularza',
    read: readWfh,
    mount: mountWfh,
    render: renderWfh,
    status: draft => draft && (draft.weight && draft.height ? 'Dane z bieżącej wizyty' : 'Uzupełnij główny formularz'),
    apply: (draft, isCurrent) => wfhResult(draft).showSource && ['imid', 'who'].includes(draft.source)
      && applyValues([['wfhNormsSource', draft.source, 'change']], isCurrent),
    actions: draft => coleResult(draft)?.bannerHtml ? [nativeAction('coleObesityKidsBanner', 'Otwórz panel diagnostyczny', {
      selector: 'a[href]', closeBefore: true,
    })] : [],
  });

  function readWhr() {
    const weight = Number(value('weight')) || 0;
    const height = Number(value('height')) || 0;
    const population = readPopulation();
    return {
      waist: value('waistCm'),
      hip: value('hipCm'),
      age: age(),
      sex: value('sex') || 'M',
      bmi: weight > 0 && height > 0 ? w.BMI(weight, height) : null,
      centile: Number.isFinite(w.bmiPercentileValue) ? w.bmiPercentileValue : null,
      coleKey: typeof w.coleKluczValue === 'string' && w.coleKluczValue
        || (typeof w.coleCatValue === 'string' ? w.coleCatValue : null),
      populationReady: population.ready,
      ds: population.ds,
    };
  }
  function renderWhr(draft, { document: doc }) {
    const root = element(doc, 'div', 'vhome-tool-anthropometry');
    const waist = parseFloat(draft.waist) || 0, hip = parseFloat(draft.hip) || 0;
    const result = waist > 0 && hip > 0
      ? w.interpretWHR(draft.age, draft.sex, waist, hip, draft.bmi, draft.centile, draft.coleKey)
      : null;
    if (result) {
      const tone = result.state === 'bad' ? 'danger' : result.state === 'warn' ? 'warning'
        : result.showTable || draft.age >= 18 ? 'normal' : '';
      const box = element(doc, 'div', 'result-box');
      if (tone) box.dataset.severity = tone;
      box.append(
        setResult(element(doc, 'strong'), result.header, 'whr-value'),
        setResult(element(doc, 'div'), result.interp, 'whr-interpretation')
      );
      if (result.state === 'ok' && result.note) box.appendChild(element(doc, 'p', 'source-note', result.note));
      root.appendChild(box);
      if (result.showTable) {
        root.append(
          element(doc, 'h4', '', 'Centyle obwodów'),
          setResult(element(doc, 'div', 'data-card'), result.tableHtml, 'whr-table')
        );
      }
    } else {
      const suggested = draft.populationReady && w.shouldSuggestWHR(draft.age, draft.sex, draft.bmi, draft.centile, draft.coleKey);
      if (suggested && !(waist > 0 && hip > 0)) {
        const suggestion = element(doc, 'p', 'result-box', byId('whrSuggest')?.textContent.trim());
        suggestion.dataset.severity = 'warning';
        root.appendChild(suggestion);
      }
      root.appendChild(element(doc, 'p', 'circ-placeholder', 'Podaj obwód talii i bioder, aby obliczyć WHR.'));
    }
    const source = byId('whrCard')?.querySelector('small.muted')?.textContent.trim();
    if (source) root.appendChild(element(doc, 'p', 'source-note', source));
    return root;
  }
  if (w.interpretWHR && w.shouldSuggestWHR && w.BMI) tools.register('whr', {
    read: readWhr,
    fields: [
      numberField('waist', 'Obwód talii · cm', 30, 200),
      numberField('hip', 'Obwód bioder · cm', 30, 200),
    ],
    render: renderWhr,
    status: draft => draft && (draft.waist || draft.hip ? 'Zapisano dane modułu' : 'Bez zapisanego pomiaru'),
    hasData: draft => !!(draft && (draft.waist || draft.hip)),
    apply: (draft, isCurrent) => applyValues([['waistCm', draft.waist], ['hipCm', draft.hip]], isCurrent),
  });

  function readCircumferences() {
    const input = w.VildaCircumference.readInput('head');
    const population = readPopulation();
    const dsModule = w.VildaDownSyndrome;
    return {
      head: input.value,
      chest: value('chestCircumference'),
      source: input.source ?? 'imid',
      age: Number.isFinite(input.age) ? input.age : null,
      ageEmpty: input.ageEmpty,
      sex: input.sex,
      pro: input.pro,
      birth: JSON.stringify(input.birth),
      populationReady: population.ready,
      ds: population.ds,
      dsHead: population.ds ? value('headCircumDS') : null,
      dsAge: population.ds ? dsModule?.readAgeYears?.() ?? null : null,
      dsSex: population.ds ? dsModule?.readSex?.() ?? null : null,
    };
  }
  function renderCircumferences(draft, { document: doc }) {
    const root = element(doc, 'div', 'vhome-tool-anthropometry');
    if (!draft.populationReady) {
      root.appendChild(element(doc, 'p', 'circ-placeholder', 'Ocena będzie dostępna po potwierdzeniu danych pacjenta.'));
      return root;
    }
    const input = { ...draft, age: draft.age ?? NaN, birth: JSON.parse(draft.birth) };
    const api = w.VildaCircumference;
    root.append(
      resultBox(doc, api.buildResult('head', { ...input, value: draft.head }), 'head-circumference'),
      resultBox(doc, api.buildResult('chest', { ...input, value: draft.chest, ds: false }), 'chest-circumference')
    );
    const note = api.headChestNote(parseFloat(draft.head), parseFloat(draft.chest), input.age);
    if (note) root.appendChild(setResult(element(doc, 'div'), note, 'head-chest-comparison'));
    if (draft.ds) {
      const section = element(doc, 'section', 'vhome-tool-anthropometry');
      section.appendChild(element(doc, 'h4', '', 'Obwód głowy · referencja DS'));
      const ds = w.VildaDownSyndrome?.buildHeadCircResult?.({
        value: draft.dsHead, age: draft.dsAge ?? NaN, sex: draft.dsSex, pro: draft.pro,
      });
      if (ds) section.appendChild(resultBox(doc, ds, 'down-syndrome-head'));
      else section.appendChild(element(doc, 'p', 'circ-placeholder', 'Podaj obwód głowy i aktualny wiek, aby zobaczyć centyl DS.'));
      section.appendChild(element(doc, 'p', 'source-note', 'Zemel 2015 · pomiar dla zespołu Downa'));
      root.appendChild(section);
    }
    return root;
  }
  function circumferenceAction(metric, id, label) {
    const button = byId(id);
    return {
      label,
      disabled: !button || button.disabled,
      run(isCurrent) {
        const ownerInput = JSON.stringify(readCircumferences());
        return w.VildaCircumference.requestChart(metric, () => isCurrent()
          && JSON.stringify(readCircumferences()) === ownerInput);
      },
    };
  }
  if (w.VildaCircumference?.buildResult) tools.register('circumferences', {
    read: readCircumferences,
    fields(draft) {
      const fields = [
        numberField('head', 'Obwód głowy · cm', 18, 65),
        numberField('chest', 'Obwód klatki piersiowej · cm', 25, 130),
        {
          key: 'source', label: 'Normy obwodu głowy 0–5 lat', type: 'select',
          options: Array.from(byId('circNormsSource')?.options || [], option => [option.value, option.textContent]),
        },
      ];
      if (draft.ds) fields.push(numberField('dsHead', 'Osobny pomiar głowy · referencja DS · cm', 25, 60));
      if (!draft.populationReady) fields.forEach(field => { field.disabled = true; });
      return fields;
    },
    render: renderCircumferences,
    status: draft => draft && (draft.head || draft.chest || draft.dsHead ? 'Zapisano dane modułu' : 'Bez zapisanego pomiaru'),
    hasData: draft => !!(draft && (draft.head || draft.chest || draft.dsHead)),
    apply(draft, isCurrent) {
      if (!draft.populationReady || !['imid', 'who'].includes(draft.source)) return false;
      const changes = [
        ['headCircumference', draft.head], ['chestCircumference', draft.chest],
        ['circNormsSource', draft.source, 'change'],
      ];
      if (draft.ds) changes.push(['headCircumDS', draft.dsHead]);
      return applyValues(changes, isCurrent);
    },
    actions: draft => draft.populationReady ? [
      circumferenceAction('head', 'generateHeadCircChart', 'Siatka obwodu głowy PDF'),
      circumferenceAction('chest', 'generateChestCircChart', 'Siatka obwodu klatki PDF'),
    ] : [],
  });
})(window);
