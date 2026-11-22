/* Read-only navigator for the selected patient's saved visits. The surrounding
 * workspace owns the visit list, the detail dialog and all clinical actions. */
(function (w) {
  'use strict';
  if (w.VildaHomeVisitScene) return;

  const limit = 9;
  let sequence = 0;

  function make(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function countLabel(n) {
    const plural = n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14);
    return n + ' ' + (n === 1 ? 'wizyta' : plural ? 'wizyty' : 'wizyt');
  }

  function savedDate(row) {
    return row.dateCertain === false && !!row.dateISO;
  }

  function displayDate(row, label = row.dateLabel) {
    return savedDate(row) ? 'Zapis z ' + label : label;
  }

  function measurement(doc, label, value) {
    const group = make(doc, 'div');
    const parts = /^(.*?)\s+(cm|kg)$/.exec(value || '');
    const number = make(doc, 'dd', '', parts ? parts[1] : value || '—');
    if (parts) number.append(' ', make(doc, 'small', '', parts[2]));
    group.append(make(doc, 'dt', '', label), number);
    return group;
  }

  function sheet(doc, row, i, length) {
    const paper = make(doc, 'article', 'vhs-paper');
    paper.dataset.visitId = row.visitId;
    paper.dataset.depth = String(Math.round(8 * i / Math.max(1, length - 1)));
    const label = make(doc, 'div', 'vhs-paper-label');
    label.append(make(doc, 'span', '', savedDate(row) ? 'Data zapisu' : 'Wizyta ' + String(length - i).padStart(2, '0')));
    if (i === 0) label.append(make(doc, 'span', 'vhs-latest', 'Najnowsza'));
    const age = make(doc, 'p', 'vhs-age', row.ageLabel || '—');
    age.append(make(doc, 'small', '', 'Wiek podczas wizyty'));
    const measurements = make(doc, 'dl', 'vhs-metrics');
    measurements.append(measurement(doc, 'Wysokość ciała', row.heightLabel), measurement(doc, 'Masa ciała', row.weightLabel));
    const foot = make(doc, 'div', 'vhs-paper-foot');
    foot.append(make(doc, 'span', '', row.ordinal || 'Zapis wizyty'), make(doc, 'span', '', row.yearLabel || ''));
    paper.append(label, make(doc, 'h3', '', row.dateLabel), age, measurements,
      make(doc, 'p', 'vhs-note', row.description || 'Otwórz podgląd pomiarów i dokumentacji wizyty.'),
      make(doc, 'div', 'vhs-lines'), foot);
    return paper;
  }

  function mount(host, options) {
    const { rows, patientName, onBack, onOpen, backLabel } = options;
    const doc = host.ownerDocument;
    const id = 'vhs-' + (++sequence);
    const panel = make(doc, 'section', 'vhs-scene');
    panel.setAttribute('aria-labelledby', id + '-title');
    panel.innerHTML = `
      <div class="vhs-heading">
        <div><span class="vhs-eyebrow">Karta pacjenta · Przebieg opieki</span><h1 tabindex="-1">Wizyty pacjenta</h1><p class="vhs-patient"></p></div>
        <button type="button" class="vhs-back"><span aria-hidden="true">←</span> <span></span></button>
      </div>
      <div class="vhs-surface">
        <div class="vhs-toolbar">
          <div class="vhs-total"><strong></strong><span>Ostatni zachowany zapis każdej wizyty</span></div>
          <div class="vhs-modes" role="group" aria-label="Sposób przeglądania wizyt">
            <button type="button" data-mode="papers" aria-pressed="true">Kartki</button>
            <button type="button" data-mode="list" aria-pressed="false">Lista</button>
          </div>
        </div>
        <p class="vhs-help">Przesuwaj myszą lub palcem, aby przeglądać wizyty. Kliknij uniesioną kartkę, aby otworzyć jej szczegóły.</p>
        <div class="vhs-empty" hidden><h2>Tu pojawią się zapisane wizyty</h2><p>Każda kartka przedstawia ostatni zachowany zapis wizyty.</p></div>
        <div class="vhs-papers">
          <div class="vhs-stage" aria-hidden="true"></div>
          <div class="vhs-caption" role="tabpanel" aria-live="polite" aria-atomic="true"><strong></strong><span></span></div>
          <div class="vhs-rail" role="tablist" aria-label="Zapisane wizyty, od najnowszej do najstarszej"></div>
          <div class="vhs-endpoints"><span></span><span></span></div>
        </div>
        <div class="vhs-list" role="group" aria-label="Lista zapisanych wizyt" hidden></div>
        <div class="vhs-controls">
          <div class="vhs-navigation">
            <button type="button" data-newer><span aria-hidden="true">←</span> Nowsza</button>
            <span class="vhs-counter"></span>
            <button type="button" data-older>Starsza <span aria-hidden="true">→</span></button>
          </div>
          <button type="button" class="vhs-open">Otwórz podgląd wizyty <span aria-hidden="true">↗</span></button>
        </div>
      </div>`;
    const find = selector => panel.querySelector(selector);
    const title = find('h1'), modes = find('.vhs-modes'), help = find('.vhs-help');
    const papers = find('.vhs-papers'), stage = find('.vhs-stage'), rail = find('.vhs-rail');
    const caption = find('.vhs-caption'), list = find('.vhs-list'), counter = find('.vhs-counter');
    const newer = find('[data-newer]'), older = find('[data-older]'), openButton = find('.vhs-open');
    const length = rows.length;
    let selected = -1, destroyed = false;
    let hoverTimer, hoverIndex = -1, pointer = null, gestureFrame = 0, gestureIndex = -1;
    const nodes = new Map();
    const reduced = w.matchMedia('(prefers-reduced-motion: reduce)');
    const lifecycle = new w.AbortController();
    const listen = { signal: lifecycle.signal };
    // In the application shell the sidebars sit outside the patient iframe.
    const viewport = w.frameElement?.classList.contains('app-pane') ? w.parent : w;
    const wide = viewport.matchMedia('(min-width: 1700px)');
    const updateWidth = () => panel.toggleAttribute('data-wide', wide.matches);
    updateWidth();
    wide.addEventListener('change', updateWidth);

    title.id = id + '-title';
    caption.id = id + '-caption';
    help.id = id + '-help';
    rail.setAttribute('aria-describedby', help.id);
    find('.vhs-patient').textContent = patientName || '';
    find('.vhs-back span:last-child').textContent = backLabel || 'Wróć do karty pacjenta';
    find('.vhs-total strong').textContent = countLabel(length);
    find('.vhs-empty').hidden = !!length;
    modes.hidden = help.hidden = papers.hidden = find('.vhs-controls').hidden = !length;
    const numberVisible = Math.min(length, limit);
    stage.dataset.count = String(numberVisible);
    const ticks = doc.createDocumentFragment(), lines = doc.createDocumentFragment();
    for (const [i, row] of rows.entries()) {
      const tick = make(doc, 'button');
      tick.type = 'button';
      tick.id = id + '-tick-' + i;
      tick.dataset.visitId = row.visitId;
      tick.dataset.index = String(i);
      tick.dataset.depth = String(Math.round(8 * i / Math.max(1, length - 1)));
      tick.setAttribute('role', 'tab');
      tick.setAttribute('aria-controls', caption.id);
      tick.setAttribute('aria-label', [displayDate(row), row.ordinal, row.ageLabel].filter(Boolean).join(' · '));
      tick.setAttribute('aria-selected', 'false');
      tick.tabIndex = -1;
      const shortDate = /^\d{4}-\d{2}-\d{2}$/.test(row.dateISO)
        ? row.dateISO.slice(8) + '.' + row.dateISO.slice(5, 7) : '—';
      tick.append(make(doc, 'small', '', shortDate));
      ticks.append(tick);

      const line = make(doc, 'button');
      line.type = 'button';
      line.dataset.visitId = row.visitId;
      line.dataset.index = String(i);
      const date = make(doc, 'span');
      date.append(make(doc, 'strong', '', displayDate(row)), make(doc, 'small', '', row.ordinal || (i === 0 ? 'Najnowsza zachowana wizyta' : 'Zapis wizyty')));
      const arrow = make(doc, 'span', 'vhs-arrow', '↗');
      arrow.setAttribute('aria-hidden', 'true');
      line.append(date, make(doc, 'span', '', row.ageLabel), arrow);
      lines.append(line);
    }
    rail.append(ticks);
    list.append(lines);
    if (length) find('.vhs-endpoints span').textContent = 'Najnowsza · ' + rows[0].dateLabel;
    if (length > 1) find('.vhs-endpoints span:last-child').textContent = rows[length - 1].dateLabel + ' · Najstarsza';
    host.replaceChildren(panel);

    function cancelHover() {
      w.clearTimeout(hoverTimer);
      hoverIndex = -1;
    }

    function cancelTouch() {
      if (gestureFrame) w.cancelAnimationFrame(gestureFrame);
      gestureFrame = 0;
      pointer = null;
    }

    function renderSheets(previousIndex) {
      const first = Math.max(0, Math.min(length - numberVisible, selected - Math.floor(numberVisible / 2)));
      for (const [i, node] of nodes) {
        if (i >= first && i < first + numberVisible) continue;
        node.remove();
        nodes.delete(i);
      }
      for (let i = first; i < first + numberVisible; i++) {
        let node = nodes.get(i);
        if (!node) {
          node = sheet(doc, rows[i], i, length);
          nodes.set(i, node);
          node.dataset.slot = String(i - first);
          stage.append(node);
          // Newly entering sheets need a resting pose before turning toward the reader.
          if (i === selected && previousIndex >= 0 && !reduced.matches) w.getComputedStyle(node).transform;
        }
        node.dataset.slot = String(i - first);
        node.toggleAttribute('data-active', i === selected);
      }
    }

    function revealTick() {
      const tick = rail.children[selected];
      if (!tick || rail.hidden || papers.hidden) return;
      const visible = rail.getBoundingClientRect(), bounds = tick.getBoundingClientRect();
      if (bounds.left < visible.left) rail.scrollLeft += bounds.left - visible.left;
      else if (bounds.right > visible.right) rail.scrollLeft += bounds.right - visible.right;
    }

    function select(index, reveal = true) {
      if (destroyed || !length || !Number.isInteger(index)) return;
      cancelHover();
      const next = Math.max(0, Math.min(index, length - 1));
      if (next === selected) return;
      if (selected >= 0) {
        const previous = rail.children[selected];
        previous.tabIndex = -1;
        previous.setAttribute('aria-selected', 'false');
        list.children[selected].removeAttribute('aria-current');
      }
      const previousIndex = selected;
      selected = next;
      const row = rows[selected], tick = rail.children[selected];
      tick.tabIndex = 0;
      tick.setAttribute('aria-selected', 'true');
      list.children[selected].setAttribute('aria-current', 'true');
      caption.setAttribute('aria-labelledby', tick.id);
      const longDate = row.dateISO && w.VildaVersionHistory?.dayLabelPL?.(row.dateISO);
      caption.firstElementChild.textContent = [displayDate(row, longDate || row.dateLabel), row.ordinal].filter(Boolean).join(' · ');
      caption.lastElementChild.textContent = row.ageLabel;
      counter.textContent = (selected + 1) + ' z ' + length;
      newer.disabled = selected === 0;
      older.disabled = selected === length - 1;
      renderSheets(previousIndex);
      if (reveal) revealTick();
    }

    function setMode(next) {
      cancelHover();
      cancelTouch();
      papers.hidden = next !== 'papers';
      list.hidden = !papers.hidden;
      help.hidden = papers.hidden;
      for (const button of modes.children) button.setAttribute('aria-pressed', String(button.dataset.mode === next));
      if (!papers.hidden) revealTick();
    }

    function open(opener) {
      cancelHover();
      cancelTouch();
      if (!destroyed && selected >= 0) onOpen(selected, opener);
    }

    function onHover(index) {
      if (index === hoverIndex) return;
      cancelHover();
      if (index === selected) return;
      if (reduced.matches) { select(index, false); return; }
      hoverIndex = index;
      hoverTimer = w.setTimeout(() => select(index, false), 24);
    }

    function indexAt(x) {
      const bounds = stage.getBoundingClientRect();
      const scale = stage.clientWidth ? bounds.width / stage.clientWidth : 1;
      const inset = scale * parseFloat(w.getComputedStyle(stage).getPropertyValue('--vhs-inset'));
      const span = Math.max(1, bounds.width - 2 * inset);
      const fraction = Math.max(0, Math.min(1, (x - bounds.left - inset) / span));
      const raw = fraction * (length - 1);
      return Math.abs(raw - selected) < (reduced.matches ? .5 : .59) ? selected : Math.round(raw);
    }

    function touchesRaisedPaper(event) {
      const r = nodes.get(selected)?.getBoundingClientRect();
      return r && event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    }

    panel.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !panel.contains(button)) return;
      if (button.matches('.vhs-back')) onBack();
      else if (button.parentElement === modes) setMode(button.dataset.mode);
      else if (button === newer) select(selected - 1);
      else if (button === older) select(selected + 1);
      else if (button === openButton) open(button);
      else if (button.parentElement === rail) select(Number(button.dataset.index));
      else if (button.parentElement === list) {
        select(Number(button.dataset.index));
        open(button);
      }
    }, listen);

    rail.addEventListener('keydown', event => {
      const keys = { ArrowLeft: selected - 1, ArrowRight: selected + 1, Home: 0, End: length - 1 };
      if (!Object.hasOwn(keys, event.key)) return;
      event.preventDefault();
      select(keys[event.key]);
      rail.children[selected].focus({ preventScroll: true });
    }, listen);
    rail.addEventListener('pointermove', event => {
      const tick = event.target.closest('[role="tab"]');
      if (event.pointerType === 'mouse' && tick) onHover(Number(tick.dataset.index));
    }, listen);
    rail.addEventListener('pointerleave', cancelHover, listen);
    stage.addEventListener('pointerleave', cancelHover, listen);
    stage.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      cancelHover();
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, direction: null };
    }, listen);
    stage.addEventListener('pointermove', event => {
      if (event.pointerType === 'mouse' && !pointer) { onHover(indexAt(event.clientX)); return; }
      if (!pointer || event.pointerId !== pointer.id) return;
      const dx = Math.abs(event.clientX - pointer.x), dy = Math.abs(event.clientY - pointer.y);
      if (!pointer.direction && Math.max(dx, dy) > 8) {
        pointer.direction = dx > dy ? 'horizontal' : 'vertical';
        if (pointer.direction === 'horizontal') stage.setPointerCapture(event.pointerId);
      }
      if (pointer.direction !== 'horizontal') return;
      gestureIndex = indexAt(event.clientX);
      if (!gestureFrame) gestureFrame = w.requestAnimationFrame(() => {
        gestureFrame = 0;
        select(gestureIndex, false);
      });
    }, listen);
    stage.addEventListener('pointerup', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const direction = pointer.direction;
      cancelTouch();
      if (direction === 'horizontal') select(indexAt(event.clientX));
      else if (!direction && touchesRaisedPaper(event)) open(openButton);
      else if (!direction) select(indexAt(event.clientX));
    }, listen);
    stage.addEventListener('pointercancel', cancelTouch, listen);
    stage.addEventListener('lostpointercapture', cancelTouch, listen);
    select(0);
    title.focus({ preventScroll: true });

    return {
      select,
      destroy() {
        destroyed = true;
        cancelHover();
        cancelTouch();
        wide.removeEventListener('change', updateWidth);
        lifecycle.abort();
        nodes.clear();
        panel.remove();
      }
    };
  }

  w.VildaHomeVisitScene = Object.freeze({ mount });
})(window);
