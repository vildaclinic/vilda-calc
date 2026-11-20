/* Home tools use the current document's native vital-signs presentation. */
(function (w) {
  'use strict';

  const tools = w.VildaHomeTools;
  if (!tools || typeof tools.register !== 'function') return;
  const get = id => w.document.getElementById(id);
  const respiration = [
    ['rrRaw', 'respiratoryRateInput', 'Oddechy · /min'],
    ['temperatureRaw', 'respTemperature', 'Temperatura · °C'],
    ['state', 'respState', 'Stan pacjenta'],
    ['population', 'respPopulation', 'Populacja odniesienia', {
      healthy: 'Dzieci zdrowe', hospital: 'Dzieci hospitalizowane'
    }]
  ];
  const pediatric = [
    ['sbpRaw', 'bpSystolic', 'Skurczowe · mmHg'],
    ['dbpRaw', 'bpDiastolic', 'Rozkurczowe · mmHg'],
    ['pulseRaw', 'heartRate', 'Tętno · uderzenia/min'],
    ['temperatureRaw', 'hrTemperature', 'Temperatura · °C'],
    ['population', 'hrPopulation', 'Populacja odniesienia', {
      healthy: 'Dzieci zdrowe · Fleming', hospital: 'Dzieci hospitalizowane · Bonafide'
    }]
  ];
  const adult = [
    ['sbpRaw', 'adultBpSystolic', 'Skurczowe · mmHg'],
    ['dbpRaw', 'adultBpDiastolic', 'Rozkurczowe · mmHg'],
    ['pulseRaw', 'adultHeartRate', 'Tętno · uderzenia/min']
  ];

  function readFields(fields, context) {
    for (const [key, id] of fields) {
      const control = get(id);
      if (!control) return null;
      context[key] = control.value;
    }
    return context;
  }

  function descriptor([key, id, label, labels]) {
    const control = get(id);
    if (control.options) {
      return {
        key, label, type: 'select',
        options: Array.from(control.options, option => [option.value, labels?.[option.value] ?? option.textContent])
      };
    }
    return { key, label, type: 'number', min: control.min, max: control.max, step: control.step, placeholder: 'Nie podano' };
  }

  function validValue(control, value) {
    if (typeof value !== 'string') return false;
    if (control.options) {
      return Array.from(control.options).some(option => option.value === value && !option.disabled);
    }
    const copy = control.cloneNode(false);
    copy.value = value;
    return copy.value === value && copy.validity.valid;
  }

  function valueChanges(fields, draft) {
    return fields.map(([key, id]) => ({ control: get(id), value: draft[key], property: 'value' }));
  }

  function changedControls(changes) {
    return changes.filter(change => change.control?.[change.property] !== change.value);
  }

  function validChanges(changes) {
    return changes.every(({ control, property, value }) => {
      if (!control || control.disabled) return false;
      return property === 'value' ? validValue(control, value) : typeof value === 'boolean';
    });
  }

  function applyChanges(changes, isCurrent) {
    if (!isCurrent() || !validChanges(changes) || !isCurrent()) return false;

    // Each native listener sees the complete set of committed values.
    changes.forEach(({ control, property, value, manual }) => {
      if (manual) control.dataset.manual = '1';
      control[property] = value;
    });
    for (const { control, property } of changes) {
      if (!isCurrent()) return false;
      const event = property === 'checked' || control.options ? 'change' : 'input';
      control.dispatchEvent(new w.Event(event, { bubbles: true }));
    }
    return isCurrent();
  }

  tools.register('respiration', {
    read() {
      const native = w.VildaRespiratory;
      return native && readFields(respiration, native.readPreviewContext());
    },
    hasData: values => values.rrRaw.trim() !== '',
    fields: () => respiration.map(descriptor),
    render(draft) {
      return w.VildaRespiratory.buildPreview({ ...draft, rrRaw: draft.rrRaw.trim() }, w.vitalSigns);
    },
    apply(draft, isCurrent) {
      return applyChanges(changedControls(valueChanges(respiration, draft)), isCurrent);
    }
  });

  function readPressure() {
    const adultApi = w.adultVitalsApi, pediatricApi = w.bpModuleApi;
    if (!adultApi || !pediatricApi) return null;
    if (!adultApi.useAdultAge()) {
      return readFields(pediatric, { adult: false, ...pediatricApi.readPreviewContext() });
    }
    const reference = get('adultBpGuidelineToggle');
    const athlete = get('adultHrAthlete'), betaBlocker = get('adultHrBetaBlocker');
    if (!reference || !athlete || !betaBlocker) return null;
    return readFields(adult, {
      adult: true, reference: reference.checked ? 'ESC' : 'AHA', athlete: athlete.checked, betaBlocker: betaBlocker.checked
    });
  }

  function pressureChanges(draft) {
    const changes = changedControls(valueChanges(draft.adult ? adult : pediatric, draft));
    if (draft.adult) {
      changes.push(...changedControls([
        { control: get('adultBpGuidelineToggle'), property: 'checked', value: draft.reference === 'ESC' }
      ]));
      for (const [key, id] of [['athlete', 'adultHrAthlete'], ['betaBlocker', 'adultHrBetaBlocker']]) {
        const yes = get(id);
        if (yes?.checked !== draft[key]) {
          changes.push({ control: draft[key] ? yes : get(id + 'No'), property: 'checked', value: true });
        }
      }
    } else if (draft.referenceSelectable) {
      const live = w.bpModuleApi.readPreviewContext();
      if (live.referenceSelectable && live.reference !== draft.reference) {
        changes.push({ control: get('bpDataToggle'), property: 'checked', value: draft.reference === 'NHBPEP', manual: true });
      }
    }
    return changes;
  }

  function pressureFields(draft, metric) {
    if (metric === 'pulse') {
      const pulse = (draft.adult ? adult : pediatric).slice(2).map(descriptor);
      if (draft.adult) {
        pulse.push(
          { key: 'athlete', type: 'checkbox', label: 'Osoba trenująca' },
          { key: 'betaBlocker', type: 'checkbox', label: 'Przyjmuje beta-bloker' }
        );
      }
      return pulse;
    }
    const reference = draft.adult
      ? { label: 'Klasyfikacja dla dorosłych', options: [['ESC', 'ESC / PTK'], ['AHA', 'AHA / ACC']] }
      : { label: 'Normy ciśnienia', disabled: !draft.referenceSelectable,
          options: draft.referenceSelectable ? [['OLAF', 'OLAF'], ['NHBPEP', 'NHBPEP']] : [['NHBPEP', 'NHBPEP']] };
    return [...(draft.adult ? adult : pediatric).slice(0, 2).map(descriptor), { key: 'reference', type: 'select', ...reference }];
  }

  function mountPressure(view, draft, edit) {
    const doc = view.document;
    const tabs = doc.createElement('div'), panel = doc.createElement('div');
    tabs.className = 'vhome-vitals-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Widok modułu');
    panel.className = 'vhome-vitals-field-panel';
    panel.id = 'vhomeVitalsPanel';
    panel.setAttribute('role', 'tabpanel');
    const buttons = [
      ['pressure', 'Ciśnienie'],
      ['pulse', 'Tętno']
    ].map(([metric, title]) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.id = 'vhomeVitalsTab-' + metric;
      button.textContent = title;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', panel.id);
      button.addEventListener('click', () => select(metric));
      button.addEventListener('keydown', event => {
        const next = { ArrowLeft: metric === 'pulse' ? 'pressure' : 'pulse',
          ArrowRight: metric === 'pressure' ? 'pulse' : 'pressure', Home: 'pressure', End: 'pulse' }[event.key];
        if (!next) return;
        event.preventDefault();
        select(next);
        buttons.find(([id]) => id === next)[1].focus();
      });
      tabs.appendChild(button);
      return [metric, button];
    });
    function select(metric) {
      if (view.vitalMetric === metric) return;
      view.vitalMetric = metric;
      buttons.forEach(([id, button]) => {
        button.setAttribute('aria-selected', String(id === metric));
        button.tabIndex = id === metric ? 0 : -1;
      });
      panel.setAttribute('aria-labelledby', 'vhomeVitalsTab-' + metric);
      view.controls.clear();
      panel.replaceChildren(...pressureFields(draft, metric).map(field => {
        const label = view.makeField(field, draft, edit);
        if (field.type === 'select') label.classList.add('vhome-vitals-wide');
        return label;
      }));
      view.refresh();
    }
    view.context.after(tabs);
    view.input.append(panel);
    select('pressure');
  }

  tools.register('pressure', {
    read: readPressure,
    hasData: values => [values.sbpRaw, values.dbpRaw, values.pulseRaw].some(value => value.trim() !== ''),
    mount: mountPressure,
    render(draft, view) {
      if (draft.adult) return w.adultVitalsApi.buildPreview(draft, view.vitalMetric);
      if (view.vitalMetric !== 'pulse') return w.bpModuleApi.buildPressurePreview(draft, w.VildaSdsWzrostu);
      const result = w.bpModuleApi.buildPulsePreview(draft, w.vitalSigns);
      if (!result.html) result.html = result.status === 'empty'
        ? '<p class="bp-placeholder">Wpisz tętno, aby zobaczyć wynik.</p>'
        : '<p class="bp-placeholder">Brak danych do obliczenia centyla tętna.</p>';
      return result;
    },
    validate(draft) {
      return validChanges(pressureChanges(draft));
    },
    apply(draft, isCurrent) {
      return applyChanges(pressureChanges(draft), isCurrent);
    }
  });
})(window);
