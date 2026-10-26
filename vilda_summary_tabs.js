/* One stable tab shell for the standalone professional summary. The existing
 * centile controller keeps ownership of chart work and fullscreen rendering. */
(function (w) {
  'use strict';
  if (!w || w.VildaSummaryTabs) return;
  var d = w.document, card, content, mount, home, tabs, chartPanel, empty;
  var summaryButton, chartButton, heading, started = false;
  var mode = 'dedicated', selected = 'summary';
  var information = { available: false, comparisonVisible: false, isChild: false };

  function state() { return { mode: mode, selected: selected }; }
  function announce() {
    d.dispatchEvent(new w.CustomEvent('vilda:summary-chart-state', { detail: state() }));
  }
  function select(value, focus, notify) {
    var previous = selected;
    selected = value === 'chart' ? 'chart' : 'summary';
    var chart = mode === 'summary' && selected === 'chart';
    summaryButton.setAttribute('aria-selected', chart ? 'false' : 'true');
    chartButton.setAttribute('aria-selected', chart ? 'true' : 'false');
    summaryButton.tabIndex = chart ? -1 : 0;
    chartButton.tabIndex = chart ? 0 : -1;
    content.hidden = chart;
    chartPanel.hidden = !chart;
    card.setAttribute('data-summary-tab', chart ? 'chart' : 'summary');
    if (focus) (chart ? chartButton : summaryButton).focus();
    if (notify === true || notify !== false && previous !== selected) announce();
  }
  function update() {
    if (!started) return;
    // An intermediate summary written while a saved patient is restoring must
    // not take the reserved comparison/chart slot for a single paint.
    var pending = false;
    var data = w.VildaCentileLiveData;
    if (data && typeof data.getEligibility === 'function') {
      pending = data.getEligibility().status === 'pending';
    }
    var next = information.available && information.isChild && !information.comparisonVisible && (!pending || mode === 'summary')
      ? 'summary' : 'dedicated';
    var changed = next !== mode;
    mode = next;
    tabs.hidden = mode !== 'summary';
    if (heading) heading.hidden = mode === 'summary';
    card.classList.toggle('vilda-summary-with-tabs', mode === 'summary');
    if (mode === 'summary') {
      if (mount.parentNode !== chartPanel) chartPanel.appendChild(mount);
      content.setAttribute('role', 'tabpanel');
      content.setAttribute('aria-labelledby', summaryButton.id);
    } else {
      if (mount.parentNode !== home.parentNode) home.parentNode.insertBefore(mount, home.nextSibling);
      content.removeAttribute('role');
      content.removeAttribute('aria-labelledby');
    }
    if (changed) selected = 'summary';
    select(selected, false, changed);
  }
  function makeButton(id, text, panelId) {
    var button = d.createElement('button');
    button.type = 'button';
    button.id = id;
    button.textContent = text;
    button.className = 'vilda-summary-tab';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panelId);
    return button;
  }
  function start() {
    if (started) return;
    card = d.getElementById('currentSummaryCard');
    content = d.getElementById('currentSummaryContent');
    mount = d.getElementById('vildaCentileLiveMount');
    if (!card || !content || !mount) return;
    started = true;
    home = d.createComment('Centile chart dedicated slot');
    mount.parentNode.insertBefore(home, mount);
    heading = card.querySelector('h3');
    tabs = d.createElement('div');
    tabs.className = 'vilda-summary-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Widok wyników pacjenta');
    summaryButton = makeButton('vildaSummaryTab', 'Podsumowanie', content.id);
    chartButton = makeButton('vildaSummaryChartTab', 'Siatka centylowa', 'vildaSummaryChartPanel');
    tabs.appendChild(summaryButton);
    tabs.appendChild(chartButton);
    card.insertBefore(tabs, content);
    chartPanel = d.createElement('div');
    chartPanel.id = 'vildaSummaryChartPanel';
    chartPanel.className = 'vilda-summary-chart-panel';
    chartPanel.setAttribute('role', 'tabpanel');
    chartPanel.setAttribute('aria-labelledby', chartButton.id);
    chartPanel.hidden = true;
    empty = d.createElement('p');
    empty.className = 'vilda-summary-chart-empty';
    empty.textContent = 'Uzupełnij wiek, płeć oraz wagę lub wzrost, aby zobaczyć siatkę.';
    chartPanel.appendChild(empty);
    card.appendChild(chartPanel);
    summaryButton.addEventListener('click', function () { select('summary'); });
    chartButton.addEventListener('click', function () { select('chart'); });
    tabs.addEventListener('keydown', function (event) {
      var value;
      if (event.key === 'Home') value = 'summary';
      else if (event.key === 'End') value = 'chart';
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') value = selected === 'chart' ? 'summary' : 'chart';
      else return;
      event.preventDefault();
      select(value, true);
    });
    d.addEventListener('vilda:professional-summary-updated', function (event) {
      information = event.detail || information;
      update();
    });
    var data = w.VildaCentileLiveData;
    if (data && typeof data.subscribe === 'function') data.subscribe(function (event) {
      if (event && event.identityChanged) select('summary');
      update();
    });
    information = {
      available: card.dataset.summaryAvailable === 'true',
      comparisonVisible: card.dataset.comparisonVisible === 'true',
      isChild: card.dataset.isChild === 'true'
    };
    update();
  }
  w.VildaSummaryTabs = Object.freeze({ getState: state, refresh: update });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(typeof window !== 'undefined' ? window : undefined);
