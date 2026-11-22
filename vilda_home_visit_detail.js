/* Read-only detail of a saved visit. Only the explicit edit action hands the
 * selected visit back to the clinical form owner. */
(function (w) {
  'use strict';
  const d = w.document;
  const panels = [['visit', 'Wizyta'], ['compare', 'Porównanie'], ['general', 'Informacje ogólne']];
  const summaries = [['results', 'Wyniki'], ['chart', 'Siatka centylowa']];
  let active;

  function el(tag, className, text) {
    const node = d.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function button(label, action, value) {
    const b = el('button', '', label);
    b.type = 'button';
    b.dataset.vdAction = action;
    if (value) b.dataset.vdValue = value;
    return b;
  }

  function tabs(choices, selected, action, label) {
    const group = el('div', action === 'tab' ? 'vd-tabs' : 'vd-summary-tabs');
    group.setAttribute('role', 'tablist');
    group.setAttribute('aria-label', label);
    choices.forEach(([value, title]) => {
      const b = button(title, action, value);
      b.id = 'vd-tab-' + value;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(value === selected));
      b.setAttribute('aria-controls', 'vd-panel-' + action);
      b.tabIndex = value === selected ? 0 : -1;
      group.append(b);
    });
    return group;
  }

  function tabPanel(type, value) {
    const section = el('div', 'vd-panel');
    section.id = 'vd-panel-' + type;
    section.setAttribute('role', 'tabpanel');
    section.setAttribute('aria-labelledby', 'vd-tab-' + value);
    section.tabIndex = 0;
    return section;
  }

  function card(title) {
    const section = el('section', 'vd-card');
    section.append(el('h3', '', title));
    return section;
  }

  function withUnit(value, unit) {
    return value && value !== '—' ? [value, unit].filter(Boolean).join(' ') : '—';
  }

  function facts(row) {
    const user = row.payload?.user || {};
    const advanced = row.payload?.advanced || {};
    const vitals = Number.isFinite(row.ageMonths)
      ? row.payload?.[row.ageMonths >= 216 ? 'adultVitals' : 'bp'] : null;
    const list = el('dl', 'vd-facts');
    function add(label, value, unit) {
      if (typeof value !== 'string' && !Number.isFinite(value)) return;
      const text = String(value).trim();
      if (!text) return;
      const item = el('div');
      item.append(el('dt', '', label), el('dd', '', unit ? text.replace('.', ',') + ' ' + unit : text));
      list.append(item);
    }
    const date = /^(\d{4})-(\d\d)-(\d\d)(?:T|$)/.exec(user.measuredAtISO || '');
    if (date) {
      const iso = date[1] + '-' + date[2] + '-' + date[3];
      const stamp = new Date(iso + 'T12:00:00Z');
      if (Number.isFinite(stamp.getTime()) && stamp.toISOString().startsWith(iso))
        add('Data pomiaru', [date[3], date[2], date[1]].join('.'));
    }
    add('Płeć', { M: 'Chłopiec / mężczyzna', F: 'Dziewczynka / kobieta' }[user.sex]);
    add('Obwód talii', user.waist, 'cm');
    add('Obwód bioder', user.hip, 'cm');
    add('Stopień Tannera', user.tannerStage);
    add('Zapisany wiek kostny', advanced.boneAgeYears, 'lat');
    add('Wzrost matki', advanced.motherHeight, 'cm');
    add('Wzrost ojca', advanced.fatherHeight, 'cm');
    add('Ciśnienie skurczowe', vitals?.systolic, 'mmHg');
    add('Ciśnienie rozkurczowe', vitals?.diastolic, 'mmHg');
    add('Tętno', vitals?.heartRate, 'ud./min');
    return list;
  }

  function comparison(container, row, values) {
    container.append(el('p', 'vd-notice', 'Porównujesz zapis wybranej wizyty z pomiarami w otwartym formularzu.'));
    const table = el('table', 'vd-compare-table');
    table.append(el('caption', '', 'Porównanie pomiarów'));
    const head = table.createTHead().insertRow();
    [['Pomiar'], [row.dateLabel, row.ageLabel], ['Bieżąca wizyta', values?.ageLabel]].forEach(([label, age]) => {
      const cell = el('th', '', label);
      cell.scope = 'col';
      if (age) cell.append(el('small', '', age));
      head.append(cell);
    });
    const body = table.createTBody();
    (values?.rows || []).forEach(item => {
      const tr = body.insertRow();
      const label = el('th', '', item.label);
      label.scope = 'row';
      const history = el('td', '', withUnit(item.historical, item.unit));
      const current = el('td', '', withUnit(item.current, item.unit));
      if (item.difference && item.difference !== '—')
        current.append(el('small', 'vd-difference', 'Różnica ' + withUnit(item.difference, item.unit)));
      tr.append(label, history, current);
    });
    const wrap = el('div', 'vd-card');
    if (body.rows.length) wrap.append(table);
    else wrap.append(el('p', 'vd-empty', 'Brak pomiarów do porównania.'));
    container.append(wrap);
  }

  function general(container, info, openRecord) {
    const notice = el('div', 'vd-notice');
    notice.append(el('strong', '', 'Aktualne informacje o pacjencie'),
      el('p', '', 'Wpisy z Karty pacjenta mogą pochodzić z innych dni niż wybrana wizyta.'));
    container.append(notice);
    const grid = el('div', 'vd-grid');
    (info?.sections || []).forEach(section => {
      const block = card(section.title);
      (section.entries || []).forEach(entry => {
        const record = el('article', 'vd-record');
        if (entry.title) record.append(el('strong', '', entry.title));
        if (entry.body) record.append(el('p', '', entry.body));
        if (entry.meta) record.append(el('small', '', entry.meta));
        block.append(record);
      });
      if (!section.entries?.length) block.append(el('p', 'vd-empty', 'Brak wpisów.'));
      grid.append(block);
    });
    if (grid.children.length) container.append(grid);
    if (openRecord) {
      const links = card('Dokumentacja pacjenta');
      const actions = el('div', 'vd-record-actions');
      [['lab', 'Badania pacjenta'], ['notes', 'Notatki pacjenta'], ['care', 'Plany opieki']].forEach(([key, label]) => {
        actions.append(button(label, 'record', key));
      });
      links.append(actions);
      container.append(links);
    } else if (!grid.children.length) {
      container.append(el('p', 'vd-empty', 'Brak informacji ogólnych do wyświetlenia.'));
    }
  }

  function open(options) {
    if (!options?.rows?.length || (options.isCurrent && !options.isCurrent())) return null;
    active?.close(false);
    const dialog = el('dialog', 'vhome-detail-dialog vhome-history-detail');
    dialog.id = 'vhomeVisitDetail';
    const heading = el('div', 'vhome-dialog-heading');
    const title = el('h2');
    title.id = 'vd-visit-title';
    const dismiss = button('×', 'close');
    dismiss.className = 'vhome-dialog-close';
    dismiss.setAttribute('aria-label', 'Zamknij podgląd wizyty');
    heading.append(title, dismiss);
    const scroll = el('div', 'vhome-dialog-body');
    dialog.append(heading, scroll);
    dialog.setAttribute('aria-labelledby', title.id);
    dialog.setAttribute('aria-modal', 'true');

    let index = Math.max(0, Math.min(Number.isInteger(options.index) ? options.index : 0, options.rows.length - 1));
    let tab = 'visit', summary = 'results', metric = 'height', expanded = false, closed = false;
    let chart = null, frame = 0;
    const returnTo = options.opener || d.activeElement;
    const history = w.VildaHomeDialogHistory?.create({
      isOpen: () => !closed && dialog.open,
      requestClose: () => { close(); return true; }
    });
    const row = () => options.rows[index];

    function close(restoreFocus = true) {
      if (closed) return;
      closed = true;
      active = null;
      w.cancelAnimationFrame(frame);
      w.removeEventListener('resize', resize);
      w.visualViewport?.removeEventListener('resize', resize);
      history?.release();
      if (dialog.open) dialog.close();
      dialog.remove();
      dialog.replaceChildren();
      if (restoreFocus && returnTo?.isConnected && (!options.isCurrent || options.isCurrent())) {
        // List navigation changes the active visit while the dialog is open.
        const selected = returnTo.hasAttribute('data-index') ? returnTo.parentElement?.children[index] : returnTo;
        (selected || returnTo).focus({ preventScroll: true });
      }
      options.onClose?.();
    }

    function current() {
      if (closed) return false;
      if (!options.isCurrent || options.isCurrent()) return true;
      close(false);
      return false;
    }

    function drawChart() {
      if (!chart || !current()) return;
      const mount = chart.querySelector('.vd-chart');
      const result = options.renderChart?.(mount, row(), metric, expanded);
      const available = result === true || result?.available === true;
      if (!available && !mount.hasChildNodes()) mount.append(el('p', 'vd-empty', 'Dla tej wizyty siatka jest niedostępna.'));
      const enlarge = chart.querySelector('[data-vd-action="expand"]');
      if (enlarge) enlarge.hidden = !available;
    }

    function resize() {
      if (!current()) return;
      w.VildaHomeWorkspace?.fitDialog?.(dialog);
      w.cancelAnimationFrame(frame);
      if (chart) frame = w.requestAnimationFrame(drawChart);
    }

    function chartControls(container) {
      const controls = el('div', 'vd-chart-select');
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', 'Pomiar na siatce');
      [['height', 'Wysokość'], ['weight', 'Masa ciała']].forEach(([key, label]) => {
        const b = button(label, 'metric', key);
        b.setAttribute('aria-pressed', String(metric === key));
        controls.append(b);
      });
      container.append(controls, el('div', 'vd-chart'));
      if (!expanded) container.append(button('Powiększ siatkę ↗', 'expand'));
      chart = container;
    }

    function visit(container, selected) {
      if (expanded) {
        const full = card('Siatka centylowa');
        container.append(button('← Wróć do podsumowania', 'collapse'), full);
        chartControls(full);
        return;
      }
      const grid = el('div', 'vd-grid');
      const result = card('Podsumowanie wyników');
      const panel = tabPanel('summary', summary);
      result.append(tabs(summaries, summary, 'summary', 'Podsumowanie historycznej wizyty'), panel);
      if (summary === 'chart') chartControls(panel);
      else {
        (selected.metrics || []).forEach(item => {
          const line = el('div', 'vd-result-row');
          line.dataset.tone = item.tone || 'neutral';
          const label = el('div', '', item.label);
          if (item.assessment) label.append(el('small', '', item.assessment));
          const value = el('strong', '', item.display || '—');
          if (item.display && item.display !== '—' && item.unit) value.append(' ', el('small', '', item.unit));
          line.append(label, value);
          panel.append(line);
        });
        panel.append(el('p', 'vd-meta', selected.referenceLabel
          ? 'Wybrane siatki referencyjne · ' + selected.referenceLabel : 'Nie zapisano źródła odniesienia.'));
      }
      grid.append(result);
      const details = facts(selected);
      if (details.children.length) {
        const block = card('Dane zapisane podczas wizyty');
        block.append(details);
        grid.append(block);
      }
      options.appendDocuments?.(grid, selected, refresh);
      if (grid.children.length === 1) result.classList.add('vd-wide');
      container.append(grid);
      const actions = el('div', 'vd-footer');
      if (selected.visitId && options.onEdit) actions.append(button('Edytuj wizytę', 'edit'));
      actions.append(button('Porównaj z bieżącą wizytą', 'compare'));
      container.append(actions);
    }

    function render(focus, reset = true) {
      if (!current()) return;
      const selected = row();
      const previousScroll = scroll.scrollTop;
      chart = null;
      title.textContent = selected.dateISO === '' ? 'Zapis bez ustalonej daty'
        : (selected.dateCertain ? 'Wizyta z ' : 'Zapis z ') + selected.dateLabel;
      const top = el('div', 'vd-topbar');
      const identity = el('div', 'vd-identity');
      identity.append(el('span', 'vd-pill', 'Podgląd wizyty'), el('h3', '', options.patientName),
        el('p', '', [selected.ageLabel, selected.description, selected.ordinal].filter(Boolean).join(' · ')));
      const nav = el('div', 'vd-navigation');
      const prev = button('←', 'newer'), next = button('→', 'older');
      prev.setAttribute('aria-label', 'Nowsza wizyta');
      next.setAttribute('aria-label', 'Starsza wizyta');
      prev.disabled = index === 0;
      next.disabled = index === options.rows.length - 1;
      const count = el('span', 'vd-page-count', (index + 1) + ' / ' + options.rows.length);
      count.setAttribute('aria-live', 'polite');
      nav.append(prev, count, next);
      top.append(identity, nav);
      const main = tabPanel('tab', tab);
      scroll.replaceChildren(top, tabs(panels, tab, 'tab', 'Zawartość podglądu wizyty'), main);
      if (tab === 'compare') comparison(main, selected, options.getComparison?.(selected));
      else if (tab === 'general') general(main, options.getGeneral?.(selected), options.onOpenRecord);
      else visit(main, selected);
      if (selected.origin === 'legacy-inferred') {
        scroll.append(el('p', 'vd-meta', selected.dateSource === 'measuredAt'
          ? 'Wizytę odtworzono z dawnych zapisów według daty pomiaru. Zapisy z tego samego dnia są połączone.'
          : 'Widoczna data pochodzi z zapisu danych. Data kliniczna wizyty jest niepotwierdzona.'));
      }
      if (selected.savedLabel && selected.savedLabel !== '—') scroll.append(el('p', 'vd-meta', 'Ostatni zapis tej wizyty · ' + selected.savedLabel));
      if (selected.revisionCount > 1) scroll.append(el('p', 'vd-meta', 'Zachowane wersje tej wizyty · ' + selected.revisionCount));
      scroll.scrollTop = reset ? 0 : previousScroll;
      if (chart) drawChart();
      if (focus) (scroll.querySelector(focus) || d.getElementById('vd-tab-' + tab))?.focus({ preventScroll: true });
    }

    function refresh() { render(null, false); }

    dialog.addEventListener('click', event => {
      if (!current()) return;
      const b = event.target.closest('button[data-vd-action]');
      if (!b) {
        if (event.target === dialog) {
          const r = dialog.getBoundingClientRect();
          if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
        }
        return;
      }
      const action = b.dataset.vdAction, value = b.dataset.vdValue;
      if (action === 'close') return close();
      if (action === 'record' && options.onOpenRecord) {
        close(false);
        options.onOpenRecord(value);
        return;
      }
      if (action === 'edit') {
        const selected = row();
        if (!selected.visitId || !options.onEdit) return;
        close(false);
        options.onEdit(selected);
        return;
      }
      if (action === 'older' || action === 'newer') {
        const target = index + (action === 'older' ? 1 : -1);
        if (!options.rows[target]) return;
        index = target;
        expanded = false;
        options.onSelect?.(index);
        return render('[data-vd-action="' + action + '"]:not(:disabled)');
      }
      if (action === 'tab' || action === 'compare') {
        tab = action === 'compare' ? 'compare' : value;
        expanded = false;
        return render('#vd-tab-' + tab);
      }
      if (action === 'summary') {
        summary = value;
        return render('#vd-tab-' + value, false);
      }
      if (action === 'metric') {
        metric = value;
        return render('[data-vd-action="metric"][data-vd-value="' + value + '"]', false);
      }
      expanded = action === 'expand';
      render(expanded ? '[data-vd-action="collapse"]' : '[data-vd-action="expand"]');
    });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      const b = event.target.closest('[role="tab"]');
      if (!b || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const list = Array.from(b.parentNode.children);
      const step = event.key === 'ArrowRight' ? 1 : -1;
      let next = (list.indexOf(b) + step + list.length) % list.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = list.length - 1;
      event.preventDefault();
      list[next].click();
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => close());
    active = { close, refresh };
    d.body.append(dialog);
    w.VildaHomeWorkspace?.fitDialog?.(dialog);
    dialog.showModal();
    history?.enter();
    render();
    w.addEventListener('resize', resize);
    w.visualViewport?.addEventListener('resize', resize);
    return active;
  }

  w.VildaHomeVisitDetail = Object.freeze({ open });
})(window);
