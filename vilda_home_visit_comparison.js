/* Read-only comparison in the Analysis workspace. Source selection belongs to
 * the encounter chronology, clinical calculations to the existing clinical actors. */
(function (w, d) {
  'use strict';
  if (w.__VILDA_HOME_GABINET_PREVIEW__ !== true) return;
  const dates = w.VildaHomeVisitComparisonModel;
  const clinical = w.VildaHomeComparisonClinical;
  const subscribed = new WeakSet();
  let card, subtitle, stateText, metrics, velocity, fallback, expand, retry;
  let dialog, historyHandle, scope, earlierId, shown, renderFrame = 0;

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
  function datedSource(label, row) {
    const clinicalDay = dates.clinicalDate(row), measuredDay = dates.measurementDate(row);
    const measurement = measuredDay && measuredDay !== clinicalDay ? ' (pomiar ' + day(measuredDay) + ')' : '';
    return label + ' · ' + visitDay(row) + measurement;
  }
  function currentLabel(mode) {
    return mode === 'browse' ? 'Oglądana wizyta' : mode === 'edit' ? 'Korekta w formularzu' : 'Nowa wizyta';
  }
  function closeDetails(restoreFocus = true) {
    if (!dialog?.open) return true;
    dialog.close();
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
      subtitle.textContent = stateText.textContent = fallback.textContent = '';
      metrics.replaceChildren();
      velocity.replaceChildren();
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
    subtitle.textContent = '';
    stateText.textContent = text;
    metrics.replaceChildren();
    velocity.replaceChildren();
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
  function clinicalLabel(value) {
    const item = node('span', 'vcomp-interpretation', value.text);
    if (['ok', 'warn', 'alert'].includes(value.tone)) item.dataset.tone = value.tone;
    return item;
  }
  function signed(value, digits, unit) {
    return formatted(value, digits, true) + (unit ? ' ' + unit : '');
  }
  function change(row) {
    return signed(row.delta, row.digits, row.unit === '%' ? 'p.p.' : row.unit);
  }
  function compactMetric(row) {
    const item = node('div', 'vcomp-metric');
    item.dataset.comparisonMetric = row.key;
    item.append(node('dt', '', row.label));
    const values = node('dd', 'vcomp-values');
    values.append(node('span', 'vcomp-before', formatted(row.before, row.digits)),
      node('span', 'vcomp-arrow', ' → '), node('strong', '', formatted(row.after, row.digits)), ' ' + row.unit);
    const delta = node('dd', 'vcomp-delta', 'Zmiana ' + change(row));
    if (Number.isFinite(row.deltaSds)) delta.append(' · ΔSDS ' + formatted(row.deltaSds, 2, true));
    item.append(values, delta);
    return item;
  }
  function addSource(body, label, row) {
    const box = node('div', 'vcomp-source');
    const clinicalDay = dates.clinicalDate(row), measuredDay = dates.measurementDate(row);
    box.append(node('dt', '', label), node('dd', '', visitDay(row)));
    if (measuredDay && measuredDay !== clinicalDay) box.append(node('dd', 'vcomp-muted', 'Pomiar · ' + day(measuredDay)));
    body.append(box);
  }
  function detailMetric(row, result) {
    const item = node('section', 'vcomp-detail-metric');
    item.dataset.comparisonMetric = row.key;
    item.append(node('h3', '', row.label));
    const values = node('dl', 'vcomp-detail-values');
    const unit = row.unit ? ' ' + row.unit : '';
    const entries = [['Poprzednio', formatted(row.before, row.digits) + unit], ['Obecnie', formatted(row.after, row.digits) + unit],
      ['Zmiana', change(row)]];
    entries.forEach(([label, value]) => {
      const box = node('div');
      box.append(node('dt', '', label), node('dd', '', value));
      values.append(box);
    });
    item.append(values);
    if (Number.isFinite(row.deltaSds)) {
      const source = row.reference ? ' · ' + row.reference : '';
      item.append(node('p', 'vcomp-note', 'SDS ' + formatted(row.sdsBefore, 2) + ' → ' + formatted(row.sdsAfter, 2) +
        ' · ΔSDS ' + formatted(row.deltaSds, 2, true) + source));
    }
    if (Number.isFinite(row.percentileBefore) && Number.isFinite(row.percentileAfter)) {
      item.append(node('p', 'vcomp-note', 'Centyl ' + formatted(row.percentileBefore, 1) + ' → ' + formatted(row.percentileAfter, 1)));
    }
    if (row.detail) item.append(node('p', 'vcomp-note', row.detail));
    if (row.interpretation?.text) item.append(clinicalLabel(row.interpretation));
    if (row.key === 'height' && result.velocity?.text) item.append(' ', clinicalLabel(result.velocity));
    return item;
  }
  function renderDetails(view) {
    const {pair, result, mode} = view;
    const body = dialog.querySelector('.vhome-dialog-body');
    const sources = node('dl', 'vcomp-sources');
    addSource(sources, pair.reference === pair.previous ? 'Poprzednia wizyta' : 'Wybrana wcześniejsza wizyta', pair.reference);
    addSource(sources, currentLabel(mode), pair.current);
    const content = d.createDocumentFragment();
    content.append(sources);
    const duration = interval(pair.elapsedDays);
    if (duration) content.append(node('p', 'vcomp-note', 'Odstęp między wizytami · ' + duration));
    result.rows.forEach(row => content.append(detailMetric(row, result)));
    if (result.referenceNote) content.append(node('p', 'vcomp-note', result.referenceNote));
    for (const text of result.context || []) content.append(node('p', 'vcomp-note', text));
    body.replaceChildren(content);
  }
  function openDetails() {
    if (!shown || !matches(scope, active()) || d.querySelector('dialog[open]')) return;
    if (!dialog) {
      const close = () => closeDetails();
      dialog = w.VildaHomeWorkspace.createDialog({id: 'vhomeVisitComparisonDialog', titleId: 'vhomeVisitComparisonDialogTitle',
        title: 'Szczegóły porównania', applyLabel: 'Zamknij', onApply: close, onClose: close});
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
    const sourceLabel = changedBaseline ? 'Wcześniejsza wizyta' : 'Poprzednia wizyta';
    const duration = interval(pair.elapsedDays);
    const parts = [reference && datedSource(sourceLabel, reference), datedSource(currentLabel(mode), current),
      duration && 'Odstęp wizyt · ' + duration];
    const earlierDay = earlierMeasured && dates.measurementDate(earlierMeasured);
    const signature = JSON.stringify([parts, mode, result, current.visitId, previous?.visitId, reference?.visitId,
      earlierMeasured?.visitId, earlierDay, earlierMeasured && visitDay(earlierMeasured),
      pair.hasCurrentMeasurements, pair.hasReferenceMeasurements]);
    if (shown?.signature === signature) return;
    subtitle.textContent = parts.filter(Boolean).join('  /  ');
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
    if (result.velocity?.text) velocity.append(clinicalLabel(result.velocity));
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
      if (draft && now.encounter.mode === 'new') {
        const population = w.VildaDsSource?.getState();
        if (population?.patientId === now.patientId && population.status === 'ready') {
          draft.clinical = {...draft.clinical, downSyndrome: population.population === 'DS'};
        }
      }
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
    const header = node('div', 'vcomp-heading'), intro = node('div');
    const title = node('h2', '', 'Zmiana od poprzedniej wizyty');
    title.id = 'vhomeVisitComparisonTitle';
    subtitle = node('p', 'vcomp-subtitle');
    expand = button('Szczegóły porównania', 'vhomeVisitComparisonDetails', openDetails);
    expand.hidden = true;
    expand.setAttribute('aria-haspopup', 'dialog');
    intro.append(title, subtitle);
    header.append(intro, expand);
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
    card.append(header, stateText, metrics, velocity, fallback, retry);
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
