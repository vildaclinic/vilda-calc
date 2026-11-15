/* First increment of the doctor's home workspace. Opt-in is supplied only by
 * the isolated preview build. Existing clinical nodes, listeners and collectors
 * retain ownership; this module neither computes nor saves patient data. */
(function (w) {
  'use strict';
  if (!w || w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || w.VildaHomeWorkspace) return;
  var d = w.document, started = false, frame = 0;
  var dateLabel, historyButton, copyButton, copySource;

  function element(tag, className, text) {
    var node = d.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function byId(id) { return d.getElementById(id); }
  function currentPatientId() {
    try { return w.sessionStorage.getItem('vildaCurrentPatientId') || null; }
    catch (_) { return null; }
  }
  function appendExisting(host, ids, label) {
    ids.forEach(function (id) {
      var node = byId(id);
      if (node && label) node = node.closest('label');
      if (node) host.appendChild(node);
    });
  }
  function fieldGroup(host, title, ids) {
    var section = element('div', 'vhome-field-section');
    if (title) section.appendChild(element('h3', 'vhome-section-title', title));
    var grid = element('div', 'vhome-fields');
    appendExisting(grid, ids, true);
    section.appendChild(grid);
    host.appendChild(section);
    return section;
  }
  function buttonLabel(button, title, subtitle) {
    var label = element('span', 'vhome-action-label', title);
    label.appendChild(element('small', '', subtitle));
    button.replaceChildren(label);
  }
  function civilDate() {
    var value = null;
    try {
      if (w.VildaDobAge && typeof w.VildaDobAge.readMeasuredAtISO === 'function') {
        value = w.VildaDobAge.readMeasuredAtISO();
      }
      if (!value && w.sessionStorage.getItem('vildaLoadChoiceV1') === 'restore') return null;
    } catch (_) { return null; }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value;
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
      + '-' + String(now.getDate()).padStart(2, '0');
  }
  function refresh() {
    if (!started) return;
    var date = civilDate();
    dateLabel.textContent = date ? date.slice(8, 10) + '.' + date.slice(5, 7) + '.' + date.slice(0, 4) : 'Data nieznana';
    if (date) dateLabel.setAttribute('datetime', date);
    else dateLabel.removeAttribute('datetime');
    var id = currentPatientId(), available;
    try { available = !!(id && w.VildaVisitHistory && w.VildaVault && w.VildaVault.isUnlocked()); }
    catch (_) { available = false; }
    historyButton.disabled = !available;
    historyButton.title = available ? 'Otwórz zapisane wizyty pacjenta' : 'Wczytaj zapisanego pacjenta, aby zobaczyć jego wizyty';
    // Eligibility remains controlled by the original summary section. Moving
    // only its action must not make an unavailable summary look ready to copy.
    if (copyButton && copySource) {
      copyButton.disabled = copySource.hidden || w.getComputedStyle(copySource).display === 'none';
    }
  }
  function schedule() {
    if (frame) return;
    frame = w.requestAnimationFrame(function () { frame = 0; refresh(); });
  }
  function openHistory() {
    var id = currentPatientId();
    if (!id || !w.VildaVisitHistory) return;
    w.VildaVisitHistory.open(id, {
      patientName: byId('name') ? byId('name').value : '',
      isCurrent: function () { return currentPatientId() === id; }
    });
  }
  function start() {
    if (started) return;
    var form = byId('calcForm'), card = d.querySelector('#userSection fieldset.user-card');
    if (!form || !card || !byId('clearAllDataBtn')) return;
    started = true;
    d.documentElement.classList.add('vilda-home-workspace');

    var header = element('section', 'vhome-visit-heading');
    header.setAttribute('aria-label', 'Bieżąca wizyta');
    var identity = element('div', 'vhome-visit-identity');
    identity.appendChild(element('h1', 'vhome-visit-title', 'Ocena pacjenta'));
    var meta = element('div', 'vhome-visit-meta');
    meta.appendChild(element('span', '', 'Bieżąca wizyta'));
    dateLabel = element('time', 'vhome-visit-date');
    meta.appendChild(dateLabel);
    identity.appendChild(meta);
    header.appendChild(identity);
    historyButton = element('button', 'vhome-history-button', 'Historia wizyt');
    historyButton.type = 'button';
    historyButton.addEventListener('click', openHistory);
    header.appendChild(historyButton);
    form.before(header);

    var content = element('div', 'vhome-form-content');
    var heading = element('div', 'vhome-card-heading');
    heading.appendChild(element('h2', '', 'Dane pacjenta'));
    heading.appendChild(element('span', '', 'Bieżąca wizyta'));
    content.appendChild(heading);
    fieldGroup(content, 'Pacjent', ['firstName', 'lastName']);
    appendExisting(content, ['tozsamoscNote']);
    var demographics = fieldGroup(content, '', ['dobInput', 'sex']);
    appendExisting(demographics, ['dobNote', 'dobError', 'dobClear', 'plecZImieniaNote']);
    var age = d.querySelector('.vild-age-row');
    if (age) { age.classList.add('vhome-fields'); content.appendChild(age); }
    appendExisting(content, ['ageWeeksRow']);
    fieldGroup(content, 'Pomiary z wizyty', ['weight', 'height']);
    var extras = element('div', 'vhome-extra-data');
    appendExisting(extras, ['tannerToggleBtn', 'pubertyAssessmentSummary', 'tannerStageWrap']);
    content.appendChild(extras);
    appendExisting(content, ['loadDataMessage']);
    var actions = element('div', 'vhome-form-actions');
    var clear = byId('clearAllDataBtn'), oldActions = clear.parentElement;
    buttonLabel(clear, 'Wyczyść formularz', 'Rozpocznij nowy pomiar');
    actions.appendChild(clear);
    copyButton = byId('metabolicSummaryBtn');
    copySource = byId('metabolicSummarySection');
    if (copyButton && copySource) {
      buttonLabel(copyButton, 'Podsumowanie wyników', 'Kliknij i skopiuj');
      actions.appendChild(copyButton);
      new w.MutationObserver(schedule).observe(copySource, { attributes: true, attributeFilter: ['style', 'hidden', 'class'] });
    }
    content.appendChild(actions);
    appendExisting(content, ['restoreStateBtn']);
    // The original action wrapper now contains only whitespace/comments. Keep
    // its identity but remove the margin that would become an empty form row.
    oldActions.classList.add('vhome-empty-action-home');
    card.appendChild(content);

    ['input', 'change', 'vilda:data-applied', 'vilda:dob-restored', 'vilda:user-state-cleared',
      'vilda:session-changed', 'vilda:professional-summary-updated'].forEach(function (name) {
      d.addEventListener(name, schedule);
    });
    w.addEventListener('pageshow', schedule);
    if (w.VildaVault && typeof w.VildaVault.onLock === 'function') w.VildaVault.onLock(schedule);
    refresh();
    if (w.VildaSummaryLayout) w.VildaSummaryLayout.refresh();
  }
  w.VildaHomeWorkspace = Object.freeze({ start: start, refresh: refresh });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
