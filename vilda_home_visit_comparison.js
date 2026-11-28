/* Read-only comparison in the Analysis workspace. Source selection belongs to
 * the encounter chronology, clinical calculations to the existing clinical actors. */
(function (w, d) {
  'use strict';
  if (w.__VILDA_HOME_GABINET_PREVIEW__ !== true) return;
  const dates = w.VildaHomeVisitComparisonModel;
  const clinical = w.VildaHomeComparisonClinical;
  const subscribed = new WeakSet();
  const defaultTitle = 'Zmiana od poprzedniej wizyty';
  let card, title, visitInterval, visitSources, stateText, metrics, velocity, fallback, expand, retry;
  let dialog, detailInterval, historyHandle, scope, earlierId, shown, renderFrame = 0;

  function node(tag, className, text) {
    const result = d.createElement(tag);
    if (className) result.className = className;
    if (text != null) result.textContent = text;
    return result;
  }
  function button(label, id, action) {
    const result = node('button', 'vcomp-action', label);
    result.type = 'button';
    result.id = id;
    result.addEventListener('click', action);
    return result;
  }
  function day(iso) { return iso ? iso.split('-').reverse().join('.') : ''; }
  function visitDay(row) { return day(dates.clinicalDate(row)) || 'data nieustalona'; }
  function formatted(value, digits, signed = false) {
    if (!Number.isFinite(value)) return '—';
    return value.toLocaleString('pl-PL', {
      minimumFractionDigits: 0, maximumFractionDigits: digits, signDisplay: signed ? 'exceptZero' : 'auto'
    });
  }
  function interval(days) {
    if (days === null) return '';
    if (days === 0) return 'Tego samego dnia';
    return days === 1 ? '1 dzień' : days + ' dni';
  }
  function intervalLabel(days) {
    const duration = interval(days);
    return duration ? 'Odstęp wizyt · ' + duration : '';
  }
  function currentLabel(mode) {
    return mode === 'browse' ? 'Oglądana wizyta' : mode === 'edit' ? 'Korekta w formularzu' : 'Nowa wizyta';
  }
  function closeDetails(restoreFocus = true) {
    if (!dialog?.open) return true;
    dialog.close();
    detailInterval.textContent = '';
    dialog.querySelector('.vhome-dialog-body').replaceChildren();
    historyHandle?.release();
    historyHandle = null;
    if (restoreFocus && card.isConnected && !card.hidden && !expand.hidden) expand.focus({preventScroll: true});
    return true;
  }
  function reset() {
    scope = null;
    earlierId = null;
    shown = null;
    closeDetails(false);
    if (card) {
      card.hidden = true;
      clearComparison();
      stateText.textContent = fallback.textContent = '';
    }
  }
  function active() {
    if (!card?.closest('[data-vhome-screen="analysis"]') || !w.VildaAuthUI?.isBootReady() ||
        !w.VildaProAccess?.hasAccess() || w.__vildaPersistRestoring ||
        w.VildaDataImportExport?.isMainSessionRestorePending() || w.VildaPanelPacjent?.nieaktualny()) return null;
    const vault = w.VildaVault, patientId = w.sessionStorage.getItem('vildaCurrentPatientId');
    if (!vault?.isUnlocked() || !patientId || w.VildaPanelPacjent?.wlasciciel() !== patientId) return null;
    if (w.frameElement?.classList.contains('app-pane') && w.parent.VildaShell?.getCurrentRoute() !== 'start') return null;
    const encounter = w.VildaHomeEncounter?.state(patientId);
    if (!encounter?.visitId || encounter.busy) return null;
    return {patientId, encounter, vault};
  }
  function matches(owner, current) {
    if (!owner || !current || scope !== owner || owner.vault !== current.vault || owner.patientId !== current.patientId ||
        owner.encounter.visitId !== current.encounter.visitId || owner.encounter.mode !== current.encounter.mode ||
        owner.encounter.snapshotId !== current.encounter.snapshotId || owner.encounter.revision !== current.encounter.revision) return false;
    try { owner.vault.assertSyncOperationSession(owner.token); return true; } catch (_) { return false; }
  }
  function schedule() {
    if (!renderFrame) renderFrame = w.requestAnimationFrame(() => { renderFrame = 0; update(); });
  }
  function invalidate() { reset(); schedule(); }
  function subscribe(vault) {
    if (subscribed.has(vault)) return;
    subscribed.add(vault);
    vault.onLock?.(() => { if (w.VildaVault === vault) reset(); });
    function changed(event) {
      if (scope?.vault === vault && (!event?.patientId || event.patientId === scope.patientId)) invalidate();
    }
    vault.onPatientSaved?.(changed);
    vault.onPatientDeleted?.(changed);
  }
  function status(text, allowRetry = false) {
    shown = null;
    closeDetails(false);
    clearComparison();
    stateText.textContent = text;
    fallback.hidden = expand.hidden = true;
    retry.hidden = !allowRetry;
    card.hidden = false;
  }
  async function read(owner) {
    try {
      const rows = await owner.vault.getPatientVisits(owner.patientId);
      if (!matches(owner, active())) return;
      owner.rows = rows;
      schedule();
    } catch (_) {
      if (matches(owner, active())) status('Nie udało się odczytać poprzednich wizyt.', true);
    }
  }
  function clearComparison() {
    title.textContent = defaultTitle;
    visitInterval.textContent = '';
    visitSources.replaceChildren();
    metrics.replaceChildren();
    velocity.replaceChildren();
  }
  function setClinicalTone(element, tone) {
    if (['ok', 'warn', 'alert'].includes(tone)) element.dataset.tone = tone;
  }
  function isCaution(tone) { return tone === 'warn' || tone === 'alert'; }
  function deltaUnit(row) {
    return row.unit === '%' ? 'p.p.' : row.unit;
  }
  function compactMetric(row) {
    const item = node('div', 'vcomp-metric');
    item.dataset.comparisonMetric = row.key;
    const delta = node('dd', 'vcomp-delta', formatted(row.delta, row.digits, true));
    const unit = deltaUnit(row);
    if (unit) delta.append(' ', node('span', 'vcomp-unit', unit));
    const values = node('dd', 'vcomp-values');
    values.append(node('span', 'vcomp-before', formatted(row.before, row.digits)),
      node('span', 'vcomp-arrow', ' → '), node('strong', '', formatted(row.after, row.digits)));
    if (row.unit) values.append(' ' + row.unit);
    item.append(node('dt', '', row.label), delta, values);
    if (row.interpretation?.text) {
      setClinicalTone(item, row.interpretation.tone);
      item.append(node('dd', 'vcomp-verdict', row.interpretation.text));
    }
    return item;
  }
  function visitTime(iso) {
    const time = node('time', '', day(iso));
    time.dateTime = iso;
    return time;
  }
  function addSource(body, label, row) {
    const box = node('div', 'vcomp-source');
    const clinicalDay = dates.clinicalDate(row), measuredDay = dates.measurementDate(row);
    const date = node('dd');
    date.append(clinicalDay ? visitTime(clinicalDay) : visitDay(row));
    box.append(node('dt', '', label), date);
    if (measuredDay && measuredDay !== clinicalDay) {
      const measurement = node('dd', 'vcomp-muted', 'Pomiar · ');
      measurement.append(visitTime(measuredDay));
      box.append(measurement);
    }
    body.append(box);
  }
  function renderSources(target, pair, mode) {
    target.replaceChildren();
    if (pair.reference) addSource(target, pair.reference === pair.previous ? 'Poprzednia wizyta' : 'Wcześniejsza wizyta', pair.reference);
    addSource(target, currentLabel(mode), pair.current);
  }
  function comparisonTable(rows) {
    const wrap = node('div', 'vcomp-table-wrap');
    const table = node('table', 'vcomp-table');
    table.setAttribute('aria-label', 'Porównanie pomiarów');
    const heading = table.createTHead().insertRow();
    for (const label of ['Pomiar', 'Poprzednio', 'Obecnie', 'Zmiana']) {
      const cell = node('th', '', label);
      cell.scope = 'col';
      if (label === 'Poprzednio') {
        cell.setAttribute('aria-label', label);
        cell.replaceChildren(node('span', 'vcomp-long-label', label), node('span', 'vcomp-short-label', 'Poprz.'));
      }
      heading.append(cell);
    }
    const body = table.createTBody();
    for (const row of rows) {
      const line = body.insertRow();
      line.dataset.comparisonMetric = row.key;
      const label = node('th', '', row.label);
      label.scope = 'row';
      if (row.unit) label.append(' ', node('span', 'vcomp-table-unit', row.unit));
      const delta = formatted(row.delta, row.digits, true) + (row.unit === '%' ? ' p.p.' : '');
      const change = node('td', 'vcomp-table-delta', delta);
      setClinicalTone(change, row.interpretation?.tone);
      line.append(label, node('td', '', formatted(row.before, row.digits)), node('td', '', formatted(row.after, row.digits)), change);
    }
    wrap.append(table);
    return wrap;
  }
  function detailMetric(row) {
    const item = node('section', 'vcomp-detail-metric');
    if (Number.isFinite(row.deltaSds)) {
      const source = row.reference ? ' · ' + row.reference : '';
      item.append(node('p', 'vcomp-note', 'SDS ' + formatted(row.sdsBefore, 2) + ' → ' + formatted(row.sdsAfter, 2) +
        ' · ΔSDS ' + formatted(row.deltaSds, 2, true) + source));
    }
    if (Number.isFinite(row.percentileBefore) && Number.isFinite(row.percentileAfter)) {
      item.append(node('p', 'vcomp-note', 'Centyl ' + formatted(row.percentileBefore, 1) + ' → ' + formatted(row.percentileAfter, 1)));
    }
    if (row.detail) item.append(node('p', 'vcomp-note', row.detail));
    if (row.interpretation?.text) {
      const label = node('p', 'vcomp-interpretation', row.interpretation.text);
      setClinicalTone(label, row.interpretation.tone);
      item.append(label);
    }
    if (!item.hasChildNodes()) return null;
    item.prepend(node('h3', '', row.label));
    return item;
  }
  function renderDetails(view) {
    const {pair, result, mode} = view;
    const body = dialog.querySelector('.vhome-dialog-body');
    const sources = node('dl', 'vcomp-sources');
    renderSources(sources, pair, mode);
    detailInterval.textContent = intervalLabel(pair.elapsedDays);
    const content = d.createDocumentFragment();
    content.append(sources, comparisonTable(result.rows), ...result.rows.map(detailMetric).filter(Boolean));
    const notes = node('div', 'vcomp-context');
    if (result.velocity?.text) {
      const tempo = node('p', 'vcomp-note', result.velocity.text);
      if (isCaution(result.velocity.tone)) {
        tempo.classList.add('vcomp-interpretation');
        setClinicalTone(tempo, result.velocity.tone);
      }
      notes.append(tempo);
    }
    if (result.referenceNote) notes.append(node('p', 'vcomp-note', result.referenceNote));
    for (const text of result.context || []) notes.append(node('p', 'vcomp-note', text));
    if (notes.hasChildNodes()) content.append(notes);
    body.replaceChildren(content);
  }
  function openDetails() {
    if (!shown || !matches(scope, active()) || d.querySelector('dialog[open]')) return;
    if (!dialog) {
      const close = () => closeDetails();
      dialog = w.VildaHomeWorkspace.createDialog({id: 'vhomeVisitComparisonDialog', titleId: 'vhomeVisitComparisonDialogTitle',
        title: 'Szczegóły porównania', applyLabel: 'Zamknij', onApply: close, onClose: close});
      const heading = dialog.querySelector('.vhome-dialog-heading'), intro = node('div');
      detailInterval = node('p', 'vcomp-interval');
      intro.append(heading.querySelector('h2'), detailInterval);
      heading.prepend(intro);
      dialog.querySelector('.vhome-dialog-cancel').remove();
      dialog.setAttribute('aria-modal', 'true');
    }
    renderDetails(shown);
    w.VildaHomeWorkspace.fitDialog(dialog);
    dialog.showModal();
    historyHandle = w.VildaHomeDialogHistory.create({isOpen: () => dialog.open, requestClose: () => closeDetails()});
    historyHandle.enter();
    dialog.querySelector('.vhome-dialog-close').focus({preventScroll: true});
  }
  function render(pair, result, mode) {
    const {current, previous, reference, earlierMeasured} = pair;
    const changedBaseline = reference?.visitId !== previous?.visitId;
    const sourceDates = [reference, current].map(row => [dates.clinicalDate(row), dates.measurementDate(row)]);
    const earlierDay = earlierMeasured && dates.measurementDate(earlierMeasured);
    const signature = JSON.stringify([sourceDates, pair.elapsedDays, mode, result, current.visitId, previous?.visitId, reference?.visitId,
      earlierMeasured?.visitId, earlierDay, earlierMeasured && visitDay(earlierMeasured),
      pair.hasCurrentMeasurements, pair.hasReferenceMeasurements]);
    if (shown?.signature === signature) return;
    title.textContent = changedBaseline ? 'Zmiana od wcześniejszej wizyty' : defaultTitle;
    visitInterval.textContent = intervalLabel(pair.elapsedDays);
    renderSources(visitSources, pair, mode);
    let message = '';
    if (!pair.hasCurrentMeasurements) {
      message = mode === 'browse' ? 'Brak pomiarów na tej wizycie.' : 'Wpisz pomiar, aby zobaczyć zmianę.';
      const measured = pair.hasReferenceMeasurements ? reference : earlierMeasured;
      const measuredDay = measured && dates.measurementDate(measured);
      if (measuredDay) message += ' Ostatni pomiar · ' + day(measuredDay);
      else if (measured) message += ' Ostatnia wizyta z pomiarami · ' + visitDay(measured);
    } else if (!dates.clinicalDate(current)) message = 'Data wizyty nieustalona. Brak podstaw do wyboru poprzedniej wizyty.';
    else if (!previous) message = 'Brak wcześniejszej wizyty do porównania.';
    else if (!pair.hasReferenceMeasurements) message = 'Poprzednia wizyta bez pomiarów.';
    else if (!result.rows.length) message = 'Na tych wizytach zmierzono różne parametry.';
    stateText.textContent = message;
    const primary = result.rows.filter(row => ['height', 'weight', 'bmi'].includes(row.key));
    metrics.replaceChildren(...(primary.length ? primary : result.rows.slice(0, 3)).map(compactMetric));
    velocity.replaceChildren();
    if (result.velocity?.value) {
      velocity.append('Tempo wzrastania · ', node('strong', '', result.velocity.value));
      if (result.velocity.period) velocity.append(' (' + result.velocity.period + ')');
      if (result.velocity.assessment && isCaution(result.velocity.tone)) {
        const label = node('span', 'vcomp-interpretation', result.velocity.assessment);
        setClinicalTone(label, result.velocity.tone);
        velocity.append(' ', label);
      }
    }
    const offered = pair.hasCurrentMeasurements && earlierMeasured && earlierMeasured.visitId !== previous?.visitId;
    fallback.hidden = !offered && !changedBaseline;
    if (!fallback.hidden) fallback.textContent = changedBaseline ? 'Wróć do poprzedniej wizyty' :
      earlierDay ? 'Porównaj z pomiarem z ' + day(earlierDay) : 'Porównaj z wizytą z ' + visitDay(earlierMeasured);
    expand.hidden = result.rows.length === 0;
    retry.hidden = true;
    card.hidden = false;
    shown = {pair, result, mode, signature};
    if (dialog?.open) {
      if (result.rows.length) renderDetails(shown);
      else closeDetails(false);
    }
  }
  function update() {
    const now = active();
    if (!now) { reset(); return; }
    if (!matches(scope, now)) {
      reset();
      subscribe(now.vault);
      scope = {...now, token: now.vault.captureSyncOperationSession()};
      read(scope);
      return;
    }
    if (!scope.rows) return;
    try {
      const draft = now.encounter.mode !== 'browse' ? w.VildaDataImportExport.captureCurrentUserDataReadOnly() : null;
      const pair = dates.select(now.patientId, scope.rows, now.encounter, draft, earlierId);
      if (!pair.current) { status('Nie można ustalić wizyty do porównania.', true); return; }
      const result = pair.reference ? clinical.compare(pair.reference, pair.current) : {rows: []};
      render(pair, result, now.encounter.mode);
    } catch (_) {
      status('Porównanie jest chwilowo niedostępne.', true);
    }
  }
  function start() {
    const form = d.getElementById('calcForm');
    if (!form || card || !dates || !clinical) return;
    card = node('section', 'vcomp-card');
    card.id = 'vhomeVisitComparison';
    card.hidden = true;
    card.setAttribute('aria-labelledby', 'vhomeVisitComparisonTitle');
    const header = node('div', 'vcomp-heading');
    title = node('h2', '', defaultTitle);
    title.id = 'vhomeVisitComparisonTitle';
    visitInterval = node('p', 'vcomp-interval');
    visitSources = node('dl', 'vcomp-sources');
    expand = button('Szczegóły porównania', 'vhomeVisitComparisonDetails', openDetails);
    expand.hidden = true;
    expand.setAttribute('aria-haspopup', 'dialog');
    header.append(title, visitInterval);
    stateText = node('p', 'vcomp-state');
    metrics = node('dl', 'vcomp-metrics');
    velocity = node('div', 'vcomp-velocity');
    fallback = button('', 'vhomeVisitComparisonEarlier', () => {
      if (!shown || !matches(scope, active())) return;
      earlierId = shown.pair.reference?.visitId === shown.pair.earlierMeasured?.visitId ? null : shown.pair.earlierMeasured?.visitId;
      update();
    });
    retry = button('Spróbuj ponownie', 'vhomeVisitComparisonRetry', invalidate);
    retry.hidden = fallback.hidden = true;
    const actions = node('div', 'vcomp-actions');
    actions.append(velocity, fallback, retry, expand);
    card.append(header, visitSources, stateText, metrics, actions);
    form.after(card);
    const host = form.closest('.container')?.parentElement;
    if (host) new w.MutationObserver(schedule).observe(host, {attributes: true, attributeFilter: ['data-vhome-screen']});
    if (w.frameElement?.classList.contains('app-pane')) {
      new w.MutationObserver(schedule).observe(w.frameElement, {attributes: true, attributeFilter: ['class', 'hidden']});
    }
    ['input','change','vilda:home-encounter-changed','vilda:initial-main-session-restore-settled','vilda:professional-summary-updated',
      'vilda:therapy-points-changed','vilda:ds-source-state','vildaProAccessChanged'].forEach(name => d.addEventListener(name, schedule));
    ['vilda:patient-loaded','vilda:user-state-cleared','vilda:session-changed','vilda:data-applied'].forEach(name => d.addEventListener(name, invalidate));
    w.addEventListener('pageshow', schedule);
    w.addEventListener('pagehide', reset);
    schedule();
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, {once: true}); else start();
})(window, document);
