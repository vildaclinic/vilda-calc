/* The Start document retains native calculations and writes. Draft controls
 * live in a blank child document outside Start's document-level autosave. */
(function (w) {
  'use strict';
  if (!w || w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || w.VildaHomeTools) return;
  const d = w.document;
  const catalogue = [
    ['pressure', 'Ciśnienie i tętno', 'Osobna ocena ciśnienia i tętna, z właściwym kontekstem wieku.', ['bpCard', 'adultVitalsCard'], 'chart'],
    ['respiration', 'Częstość oddechów', 'Czuwanie lub sen, temperatura i populacja odniesienia.', ['respiratoryCard'], 'chart'],
    ['circumferences', 'Głowa i klatka piersiowa', 'Dwa pomiary i dwie oceny, z jawnym źródłem norm.', ['circSection'], 'patient'],
    ['whr', 'Talia, biodra i WHR', 'Obwody w centymetrach i bezwymiarowy iloraz WHR.', ['whrCard'], 'patient'],
    ['wfh', 'Masa do wysokości ciała', 'Proporcja masy do wysokości lub długości, IMiD / WHO.', ['wfhSection', 'coleCard'], 'chart'],
    ['nutrition', 'Normy żywieniowe', 'Makroskładniki, witaminy i minerały w jednym miejscu.', ['nutritionNormsSection', 'nutritionMicrosSection'], 'food'],
    ['food', 'Energia posiłków', 'Wiele produktów, wielkość porcji i łączna energia.', ['foodSection'], 'food'],
    ['intake', 'Szacowane spożycie energii', 'Historia pomiarów, analizowany okres i bilans energii.', ['intakeSection'], 'chart'],
  ];
  const downSyndrome = ['down-syndrome', 'Obliczenia dla dzieci z zespołem Downa'];
  const iconPaths = {
    chart: 'M4 3v17h17M7 15l4-5 4 2 5-7',
    patient: 'M16 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0M4 21v-2a8 8 0 0 1 16 0v2',
    food: 'M7 3v7m-3-7v5a3 3 0 0 0 6 0V3M7 11v10M19 3c-4 4-4 8 0 9v9m0-18v9',
  };
  const adapters = new Map();
  let dialog, grid, trigger, chartButton, downShortcut, active, resizeParent, frame = 0;
  let legacyReminder, summaryReminder, adultCard, adultHistory;
  const byId = id => d.getElementById(id);
  const serialize = value => JSON.stringify(value);
  const detach = value => JSON.parse(serialize(value));
  function entryFor(id) { return id === downSyndrome[0] ? downSyndrome : catalogue.find(entry => entry[0] === id); }
  function doctorResults() { return d.documentElement.classList.contains('vhome-doctor-results'); }
  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function tileIcon(name) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = d.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = d.createElementNS(ns, 'path');
    path.setAttribute('d', iconPaths[name]);
    svg.appendChild(path);
    return svg;
  }
  function ready() {
    return w.VildaAuthUI?.isBootReady() && w.VildaProAccess?.hasAccess()
      && w.VildaDataImportExport?.getSaveReadiness?.()?.ready
      && !w.VildaPersistence?.isAutosaveSuppressed?.();
  }
  function identity() {
    const patientId = w.sessionStorage.getItem('vildaCurrentPatientId') || null;
    const measuredAtISO = w.VildaDobAge?.readMeasuredAtISO?.();
    const visit = w.VildaVisitContext.capture({ user: { measuredAtISO } }, { patientId, readOnly: true });
    return serialize([patientId, visit, w.VildaDataImportExport.getApplyLoadedDataSequence(),
      ['name', 'firstName', 'lastName', 'sex', 'age', 'ageMonths', 'ageWeeks', 'dobInput', 'weight', 'height']
        .map(id => byId(id)?.value ?? null)]);
  }
  function owner() {
    if (!ready()) return null;
    const vault = w.VildaVault;
    const panel = w.VildaPanelPacjent;
    const ticket = panel?.captureWriteAuthority();
    if (!ticket) return null;
    const token = vault.captureSyncOperationSession();
    vault.assertSyncOperationSession(token);
    return { vault, panel, ticket, token, identity: identity() };
  }
  function owned(item) {
    try {
      const scope = item.owner;
      if (w.VildaVault !== scope.vault || w.VildaPanelPacjent !== scope.panel
        || !w.VildaProAccess?.hasAccess() || !scope.panel.isWriteAuthorityCurrent(scope.ticket)
        || identity() !== scope.identity) return false;
      scope.vault.assertSyncOperationSession(scope.token);
      return true;
    } catch (_) { return false; }
  }
  function current(item) {
    try {
      return active === item && dialog.open && item.frame?.isConnected && item.frame.contentDocument === item.view.document
        && owned(item) && serialize(item.adapter.read()) === item.original;
    } catch (_) { return false; }
  }
  function dirty(item) { return serialize(item.values) !== item.original; }
  function close(force) {
    const item = active;
    if (!item) return true;
    if (!force && item.busy) return false;
    if (!force && dirty(item) && !w.confirm('Odrzucić zmiany w tym module?')) return false;
    active = null;
    w.clearInterval(item.timer);
    dialog.close();
    dialog.querySelector('.vhome-dialog-body').replaceChildren();
    item.handle?.release();
    if (owned(item) && item.opener?.isConnected) item.opener.focus({ preventScroll: true });
    schedule();
    return true;
  }
  function focusable(container) {
    return Array.from(container.querySelectorAll('input:not([type="hidden"]),select,textarea,button,summary,a[href],[tabindex]'))
      .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
  }
  function bridgeKey(item, event) {
    if (active !== item) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const fields = focusable(item.view.document.body);
    const first = fields[0], last = fields.at(-1);
    if (!first || event.shiftKey && event.target === first || !event.shiftKey && event.target === last) {
      event.preventDefault();
      dialog.querySelector(event.shiftKey ? '.vhome-dialog-close' : '.vhome-dialog-cancel').focus();
    }
  }
  function parentKey(event) {
    if (!active || event.key !== 'Tab') return;
    const closing = dialog.querySelector('.vhome-dialog-close');
    const cancel = dialog.querySelector('.vhome-dialog-cancel');
    const apply = dialog.querySelector('.vhome-dialog-apply');
    const fields = focusable(active.view.document.body);
    let next;
    if (event.shiftKey && event.target === closing) next = apply.disabled ? cancel : apply;
    else if (!event.shiftKey && event.target === closing) next = fields[0] || cancel;
    else if (event.shiftKey && event.target === cancel) next = fields.at(-1) || closing;
    else if (!event.shiftKey && (event.target === apply || event.target === cancel && apply.disabled)) next = closing;
    if (next) { event.preventDefault(); next.focus(); }
  }
  function makeField(view, field, draft, edit) {
    const doc = view.document;
    const label = element(doc, 'label', 'vhome-tool-field');
    label.appendChild(element(doc, 'span', '', field.label));
    const control = element(doc, field.type === 'select' ? 'select' : 'input');
    if (field.type === 'select') field.options.forEach(([value, text]) => {
      const option = element(doc, 'option', '', text);
      option.value = value;
      control.appendChild(option);
    });
    else control.type = field.type || 'text';
    ['min', 'max', 'step', 'placeholder'].forEach(key => {
      if (field[key] != null) control.setAttribute(key, field[key]);
    });
    control.required = field.required === true;
    control.disabled = field.disabled === true;
    if (control.type === 'number') control.inputMode = 'decimal';
    control.dataset.homeToolField = field.key;
    if (control.type === 'checkbox') control.checked = !!draft[field.key];
    else control.value = draft[field.key] ?? '';
    const name = control.matches('select,input[type="checkbox"]') ? 'change' : 'input';
    control.addEventListener(name, () => edit(field.key, control.type === 'checkbox' ? control.checked : control.value));
    view.controls.set(field.key, control);
    label.appendChild(control);
    return label;
  }
  function updateResult(item) {
    if (active !== item) return;
    if (!current(item)) { close(true); return; }
    const view = item.view;
    const result = item.adapter.render(item.values, view);
    if (!current(item)) { if (active === item) close(true); return; }
    view.result.replaceChildren();
    if (result?.nodeType) view.result.appendChild(result);
    else if (typeof result?.html === 'string') {
      w.VildaHtml.setTrustedHtml(view.result, result.html, { context: 'home-tools:native-result' });
    }
    view.result.dataset.severity = result?.severity || '';
    view.result.dataset.resultStatus = result?.status || '';
    view.actions.replaceChildren();
    (item.adapter.actions?.(item.values, view) || []).forEach(action => {
      const button = element(view.document, 'button', 'vhome-tool-action', action.label);
      button.type = 'button';
      button.disabled = dirty(item) || !!action.disabled;
      button.addEventListener('click', () => {
        if (!current(item) || dirty(item)) return;
        if (action.closeBefore) close(true);
        action.run(() => (action.closeBefore || active === item) && owned(item));
      });
      view.actions.appendChild(button);
    });
    dialog.querySelector('.vhome-dialog-apply').disabled = item.busy || !dirty(item) || !item.adapter.apply;
  }
  function valid(item) {
    const fields = focusable(item.view.input).filter(node => node.matches('input,select,textarea'));
    const invalid = fields.find(node => !node.validity.valid);
    if (invalid) { invalid.reportValidity(); return false; }
    return !item.adapter.validate || item.adapter.validate(item.values);
  }
  function patientContext(doc) {
    const context = element(doc, 'div', 'vhome-tool-context');
    const read = id => byId(id)?.value.trim() || '';
    const name = [read('firstName'), read('lastName')].filter(Boolean).join(' ');
    const years = read('age'), months = read('ageMonths'), weeks = read('ageWeeks');
    const sex = { M: 'Chłopiec', F: 'Dziewczynka' }[read('sex')];
    const format = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });
    const yearUnit = { one: 'rok', few: 'lata' }[new Intl.PluralRules('pl-PL').select(Number(years))] || 'lat';
    const age = [years && `${format.format(years)} ${yearUnit}`, months && `${format.format(months)} mies.`,
      weeks && Number(weeks) > 0 && `${format.format(weeks)} tyg.`].filter(Boolean).join(' ');
    const measurements = [['weight', 'kg'], ['height', 'cm']].map(([id, unit]) => {
      const value = read(id);
      return value && Number.isFinite(Number(value)) ? `${format.format(value)} ${unit}` : '';
    });
    const description = [age || 'Nie podano wieku', sex || 'Nie podano płci', ...measurements].filter(Boolean).join(' · ');
    context.append(element(doc, 'strong', '', name || 'Pacjent'), element(doc, 'p', '', description));
    return context;
  }
  async function apply() {
    const item = active;
    if (!item) return;
    if (!current(item)) { close(true); return; }
    if (item.busy || !dirty(item)) return;
    if (!valid(item)) { item.view.error.textContent = 'Sprawdź dane pomiaru.'; return; }
    item.busy = true;
    dialog.querySelector('.vhome-dialog-apply').disabled = true;
    let applied = false;
    try { applied = await item.adapter.apply(item.values, () => active === item && owned(item)); }
    catch (_) { /* Keep the current draft available when the native actor refuses. */ }
    finally {
      if (active === item) {
        item.busy = false;
        if (applied || !current(item)) close(true);
        else {
          item.view.error.textContent = 'Nie udało się zastosować danych. Sprawdź formularz.';
          dialog.querySelector('.vhome-dialog-apply').disabled = false;
        }
      }
    }
  }
  function mountDraft(item, title) {
    const body = dialog.querySelector('.vhome-dialog-body');
    const iframe = element(d, 'iframe', 'vhome-tool-frame');
    iframe.title = title + ' — dane i wynik';
    iframe.setAttribute('data-home-tool-draft', '');
    body.replaceChildren(iframe);
    item.frame = iframe;
    const doc = iframe.contentDocument;
    doc.documentElement.lang = 'pl';
    doc.documentElement.className = 'vhome-tool-draft-document';
    const skin = d.documentElement.getAttribute('data-theme');
    if (skin) doc.documentElement.setAttribute('data-theme', skin);
    Array.from(d.querySelectorAll('link[rel="stylesheet"]')).forEach(source => {
      const url = new URL(source.href);
      if (url.origin !== w.location.origin || !/\/(?:vilda_home_tools|style|inline_index_\d+)\.css$/.test(url.pathname)) return;
      const link = doc.createElement('link'); link.rel = 'stylesheet'; link.href = url.href;
      doc.head.appendChild(link);
    });
    const layout = element(doc, 'div', 'vhome-tool-layout');
    const inputCard = element(doc, 'section', 'vhome-tool-box');
    const resultCard = element(doc, 'section', 'vhome-tool-box');
    const input = element(doc, 'div', 'vhome-tool-fields');
    const result = element(doc, 'div', 'vhome-tool-result');
    const actions = element(doc, 'div', 'vhome-tool-actions');
    const error = element(doc, 'p', 'vhome-tool-error'); error.setAttribute('role', 'alert');
    inputCard.append(element(doc, 'h3', '', item.adapter.inputTitle || 'Dane pomiaru'), input, error);
    resultCard.append(element(doc, 'h3', '', 'Wynik'), result, actions);
    const context = patientContext(doc);
    layout.append(context, inputCard, resultCard);
    doc.body.replaceChildren(layout);
    const view = item.view = { document: doc, input, result, actions, error, context, controls: new Map() };
    view.makeField = (field, values, onEdit) => makeField(view, field, values, onEdit);
    view.refresh = () => updateResult(item);
    const edit = (key, value) => {
      if (!current(item) || item.busy) return;
      item.values[key] = detach(value);
      error.textContent = '';
      updateResult(item);
    };
    if (item.adapter.mount) item.adapter.mount(view, item.values, edit);
    else {
      const fields = typeof item.adapter.fields === 'function' ? item.adapter.fields(item.values, view) : item.adapter.fields;
      fields.forEach(field => input.appendChild(makeField(view, field, item.values, edit)));
    }
    doc.addEventListener('keydown', event => bridgeKey(item, event));
    ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'touchmove', 'wheel'].forEach(type => {
      doc.addEventListener(type, event => {
        if (event.isTrusted && event.target?.ownerDocument === doc && !d.hidden && !w.frameElement?.hidden && current(item)) {
          w.VildaAuthUI.recordActivity?.(event);
        }
      }, { passive: true });
    });
  }
  function open(id, opener) {
    if (!dialog || active || !adapters.has(id)) return false;
    try {
      const scope = owner();
      const adapter = adapters.get(id);
      const original = scope && adapter.read();
      if (!original) return false;
      const title = entryFor(id)[1];
      const item = active = { owner: scope, adapter, opener, values: detach(original), original: serialize(original) };
      byId('vhomeToolDialogTitle').textContent = title;
      dialog.querySelector('.vhome-dialog-close').setAttribute('aria-label', 'Zamknij ' + title.toLowerCase());
      w.VildaHomeWorkspace.fitDialog(dialog);
      dialog.showModal();
      mountDraft(item, title);
      item.handle = w.VildaHomeDialogHistory.create({ group: item, isOpen: () => active === item,
        requestClose: () => close(false) });
      item.handle.enter();
      item.timer = w.setInterval(() => { if (!item.busy && !current(item)) close(true); }, 250);
      updateResult(item);
      dialog.querySelector('.vhome-dialog-close').focus({ preventScroll: true });
      return true;
    } catch (_) { close(true); return false; }
  }
  function canOpenDownSyndrome() {
    try { return !!(dialog && doctorResults() && ready() && adapters.get(downSyndrome[0])?.read()); }
    catch (_) { return false; }
  }
  function openDownSyndrome(opener) {
    return canOpenDownSyndrome() && open(downSyndrome[0], opener);
  }
  function setupAdultCard(growth) {
    const card = element(d, 'section', 'vhome-adult-vitals');
    card.id = 'vhomeAdultVitalsCard'; card.hidden = true;
    const heading = element(d, 'h2', '', 'Ciśnienie i tętno');
    heading.id = 'vhomeAdultVitalsTitle'; card.setAttribute('aria-labelledby', heading.id);
    const icon = tileIcon('chart'); icon.querySelector('path').setAttribute('d', 'M2 12h5l3-8 4 16 3-8h5');
    heading.prepend(icon);
    const bp = element(d, 'strong', 'vhome-adult-bp');
    const pulse = element(d, 'p', 'vhome-adult-pulse'), note = element(d, 'p', 'vhome-adult-note');
    const button = element(d, 'button', 'vhome-adult-open', 'Przejrzyj pomiary');
    button.type = 'button'; button.addEventListener('click', () => open('pressure', button));
    card.append(heading, bp, pulse, note, button);
    growth.after(card);
    adultCard = { card, bp, pulse, note, button };
    new w.MutationObserver(schedule).observe(d.documentElement, { attributes: true, subtree: true, attributeFilter: ['data-vhome-screen'] });
  }
  function clearAdultCard() {
    if (!adultCard) return;
    adultHistory = null; adultCard.card.hidden = true;
    adultCard.bp.textContent = adultCard.pulse.textContent = adultCard.note.textContent = '';
  }
  function refreshAdultCard(enabled, values) {
    if (!adultCard) return;
    const screen = adultCard.card.closest('[data-vhome-screen]')?.dataset.vhomeScreen;
    const id = w.sessionStorage.getItem('vildaCurrentPatientId');
    const encounter = id && w.VildaHomeEncounter?.state(id);
    if (!enabled || screen !== 'analysis' || !values?.adult || !id || !encounter || encounter.busy
      || w.VildaPanelPacjent?.nieaktualny() || w.VildaPanelPacjent?.wlasciciel() !== id) {
      clearAdultCard(); return;
    }
    const {card, bp, pulse, note} = adultCard, adapter = adapters.get('pressure');
    card.hidden = false;
    let data = adapter.summarizeAdult(values);
    let date = encounter.date || w.VildaDobAge?.readMeasuredAtISO?.(), label = 'Data pomiaru';
    let empty = 'Brak zapisanej pary pomiarów ciśnienia.';
    if (!data.pressure && !data.pulse) {
      let guard;
      try { guard = owner(); } catch (_) { clearAdultCard(); return; }
      if (!guard) { clearAdultCard(); return; }
      const key = serialize([guard.identity, encounter, date]);
      if (!adultHistory || adultHistory.key !== key || !owned(adultHistory)) {
        const request = adultHistory = { key, owner: guard, pending: true };
        guard.vault.getPatientVisits(id).then(visits => {
          if (adultHistory === request && owned(request)) request.data = adapter.previousAdultMeasurement(visits, {...encounter, date});
        }).catch(() => { request.failed = true; }).finally(() => {
          if (adultHistory === request) { request.pending = false; schedule(); }
        });
      }
      data = adultHistory.data || {};
      if (adultHistory.pending) empty = 'Wczytywanie wcześniejszych pomiarów…';
      if (adultHistory.failed) empty = 'Nie udało się wczytać wcześniejszych pomiarów.';
      date = data.date; label = 'Ostatni zapisany pomiar';
    } else adultHistory = null;
    bp.hidden = !data.pressure; bp.textContent = data.pressure || ''; bp.dataset.tone = data.pressureTone || '';
    pulse.hidden = !data.pulse; pulse.textContent = data.pulse ? 'Tętno · ' + data.pulse : ''; pulse.dataset.tone = data.pulseTone || '';
    const details = [];
    if (!data.complete) details.push(data.pressure ? 'Niepełny pomiar ciśnienia.' : empty);
    if (date && (data.pressure || data.pulse)) details.push(label + ' · ' + date.split('-').reverse().join('.'));
    note.textContent = details.join(' ');
  }
  function refresh() {
    frame = 0;
    if (active && !active.busy && !current(active)) close(true);
    const enabled = ready();
    const deviceWidth = w.VildaHomeWorkspace.getDeviceViewportWidth();
    grid.dataset.columns = deviceWidth >= 1700 ? '4' : deviceWidth <= 600 ? '1' : '2';
    if (grid) grid.querySelectorAll('[data-home-tool]').forEach(button => {
      const adapter = adapters.get(button.dataset.homeTool);
      let values = null;
      try { if (enabled && adapter) values = adapter.read(); } catch (_) { /* Native form still settling. */ }
      if (button.dataset.homeTool === 'pressure') refreshAdultCard(enabled, values);
      button.disabled = !values;
      const state = button.querySelector('.vhome-tool-tile-state');
      const hasData = values && adapter?.hasData?.(values);
      state.textContent = adapter?.status?.(values)
        || (!adapter ? 'Karta dostępna poniżej' : !values ? 'Uzupełnij dane wizyty'
          : hasData ? 'Zapisano dane modułu' : 'Bez zapisanego pomiaru');
      state.dataset.state = hasData ? 'saved' : 'empty';
    });
    if (chartButton) chartButton.disabled = !w.VildaHomeGrowth?.canOpenCharts?.('pdf');
    const growth = byId('vhomeGrowthCard');
    downShortcut.hidden = !!(growth && !growth.hidden) || !canOpenDownSyndrome();
    if (summaryReminder) {
      const content = doctorResults() && legacyReminder.style.display !== 'none' ? legacyReminder.textContent : '';
      summaryReminder.hidden = !content;
      if (summaryReminder.textContent !== content) summaryReminder.textContent = content;
    }
  }
  function schedule() { if (!frame) frame = w.requestAnimationFrame(refresh); }
  function hideNative(entry) {
    if (entry === downSyndrome) {
      byId('downSyndromeSection')?.classList.add('vhome-replaced-result');
      return;
    }
    entry[3].forEach(id => byId(id)?.classList.add('vhome-tool-original'));
  }
  function start() {
    const cards = byId('vhomeMainCards');
    if (grid || !cards || !w.VildaHomeDialogHistory) return;
    const host = element(d, 'section', 'vhome-other-tools'); host.id = 'vhomeOtherTools';
    host.setAttribute('aria-label', 'Pozostałe pomiary i narzędzia');
    trigger = element(d, 'button', 'vhome-tools-toggle', 'Pozostałe pomiary i narzędzia');
    trigger.id = 'vhomeOtherToolsToggle'; trigger.type = 'button';
    trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'vhomeOtherToolsPanel');
    const content = element(d, 'div', 'vhome-tools-content');
    content.id = 'vhomeOtherToolsPanel'; content.hidden = true;
    const intro = element(d, 'div', 'vhome-tools-intro');
    const text = element(d, 'div');
    text.append(element(d, 'strong', '', 'Uzupełniające pomiary i obliczenia'),
      element(d, 'p', '', 'Wybierz kafelek. Wspólne dane pacjenta są już w oknie modułu.'));
    intro.append(text, element(d, 'span', 'vhome-tools-count', `${catalogue.length} narzędzi`));
    grid = element(d, 'div', 'vhome-tools-grid'); grid.id = 'vhomeOtherToolsGrid';
    catalogue.forEach(entry => {
      const [id, title, description, , icon] = entry;
      const button = element(d, 'button', 'vhome-tool-tile'); button.type = 'button'; button.dataset.homeTool = id;
      const openLabel = element(d, 'small', 'vhome-tool-tile-action', 'Otwórz moduł ↗');
      openLabel.setAttribute('aria-hidden', 'true');
      button.append(tileIcon(icon), element(d, 'strong', '', title), element(d, 'span', 'vhome-tool-description', description),
        element(d, 'span', 'vhome-tool-tile-state'), openLabel);
      button.addEventListener('click', () => open(id, button)); grid.appendChild(button);
      if (adapters.has(id)) hideNative(entry);
    });
    trigger.addEventListener('click', () => {
      content.hidden = !content.hidden;
      trigger.setAttribute('aria-expanded', String(!content.hidden));
      if (!content.hidden) refresh();
    });
    downShortcut = element(d, 'button', 'vhome-generate-charts vhome-down-shortcut', downSyndrome[1]);
    downShortcut.type = 'button'; downShortcut.hidden = true;
    downShortcut.setAttribute('aria-haspopup', 'dialog');
    downShortcut.setAttribute('data-home-down-syndrome', '');
    downShortcut.addEventListener('click', () => openDownSyndrome(downShortcut));
    content.append(intro, grid, downShortcut);
    host.append(trigger, content); cards.after(host);
    dialog = w.VildaHomeWorkspace.createDialog({ id: 'vhomeToolDialog', titleId: 'vhomeToolDialogTitle',
      title: 'Dane pomiaru', applyLabel: 'Zastosuj dane', onClose: () => close(false), onApply: apply });
    dialog.addEventListener('keydown', parentKey);
    const summary = byId('currentSummaryCard');
    if (summary) {
      chartButton = element(d, 'button', 'vhome-generate-charts', 'Generuj siatki');
      chartButton.id = 'vhomeGenerateCharts'; chartButton.type = 'button';
      chartButton.addEventListener('click', () => w.VildaHomeGrowth.openCharts({ mode: 'pdf', opener: chartButton }));
      summary.after(chartButton);
      byId('bmiCard')?.classList.add('vhome-replaced-result');
      legacyReminder = byId('wflReminderBMI');
      if (legacyReminder) {
        summaryReminder = element(d, 'div', 'wfl-reminder vhome-summary-reminder');
        summaryReminder.hidden = true;
        summary.after(summaryReminder);
        new w.MutationObserver(schedule).observe(legacyReminder, { attributes: true, attributeFilter: ['style'], childList: true });
      }
    }
    const growth = byId('vhomeGrowthCard');
    if (growth) {
      if (w.__VILDA_HOME_GABINET_PREVIEW__ === true) setupAdultCard(growth);
      byId('growthCalculationsSection')?.classList.add('vhome-replaced-result');
      new w.MutationObserver(schedule).observe(growth, { attributes: true, attributeFilter: ['hidden'] });
    }
    if (adapters.has(downSyndrome[0])) hideNative(downSyndrome);
    byId('toggleDownSyndrome')?.addEventListener('click', event => {
      if (!doctorResults() || !adapters.has(downSyndrome[0])) return;
      event.preventDefault(); event.stopImmediatePropagation();
      openDownSyndrome(trigger);
    }, true);
    ['input', 'change', 'vilda:data-applied', 'vilda:load-choice-applied', 'vilda:user-state-cleared', 'vilda:patient-loaded',
      'vilda:main-session-restored', 'vilda:auth-boot-settled', 'vildaProAccessChanged', 'vilda:professional-summary-updated']
      .forEach(name => d.addEventListener(name, schedule));
    ['vilda:user-state-cleared', 'vilda:patient-loaded', 'vilda:auth-loaded'].forEach(name => {
      d.addEventListener(name, () => { if (active && !owned(active)) close(true); });
    });
    if (adultCard) {
      d.addEventListener('vilda:home-encounter-changed', schedule);
      w.VildaVault?.onPatientSaved?.(() => { adultHistory = null; schedule(); });
    }
    w.addEventListener('resize', schedule);
    w.addEventListener('nutritionMicrosDataReady', schedule);
    try {
      if (w.parent !== w && w.frameElement?.classList.contains('app-pane')) {
        resizeParent = w.parent;
        resizeParent.addEventListener('resize', schedule);
      }
    } catch (_) { /* This page can also be shown on its own. */ }
    w.addEventListener('pagehide', () => { resizeParent?.removeEventListener('resize', schedule); close(true); });
    w.addEventListener('pageshow', () => { resizeParent?.addEventListener('resize', schedule); schedule(); });
    w.VildaVault?.onLock?.(() => { clearAdultCard(); close(true); schedule(); });
    refresh();
  }
  w.VildaHomeTools = Object.freeze({ openDownSyndrome, canOpenDownSyndrome, register(id, adapter) {
    const entry = entryFor(id);
    if (!entry || adapters.has(id)) return;
    adapters.set(id, adapter);
    if (grid) { hideNative(entry); schedule(); }
  } });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
