/* Shared form geometry for the summary and inline chart. Only the right card
 * is constrained; the form and the separate comparison keep their own flow. */
(function (w) {
  'use strict';
  if (!w || w.VildaSummaryLayout) return;
  var d = w.document;

  function createFormGeometry(form, fieldset, doctor) {
    var collapsedHeight = 0, lastWidth = 0;
    function twoColumns() {
      if (!form || !fieldset || !doctor || !form.getClientRects().length) return false;
      var columns = w.getComputedStyle(form).gridTemplateColumns.trim().split(/\s+/);
      var left = fieldset.getBoundingClientRect(), right = doctor.getBoundingClientRect();
      return columns.length === 2 && left.width > 0 && right.width > 0
        && right.left >= left.right - 1 && right.top < left.bottom;
    }
    function collapsedBounds() {
      var bounds = fieldset.getBoundingClientRect();
      var puberty = d.getElementById('tannerStageWrap');
      var expanded = puberty && puberty.getClientRects().length
        && w.getComputedStyle(puberty).display !== 'none';
      if (!expanded) {
        collapsedHeight = bounds.height;
        lastWidth = bounds.width;
      } else if (!collapsedHeight || Math.abs(bounds.width - lastWidth) > 1) {
        var styles = w.getComputedStyle(puberty);
        var removed = puberty.getBoundingClientRect().height
          + (parseFloat(styles.marginTop) || 0) + (parseFloat(styles.marginBottom) || 0);
        var before = puberty.previousElementSibling, after = puberty.nextElementSibling;
        while (before && !before.getClientRects().length) before = before.previousElementSibling;
        while (after && !after.getClientRects().length) after = after.nextElementSibling;
        if (before && after) {
          // The normal collapsed gap between neighbours survives hiding Tanner.
          var bottomMargin = parseFloat(w.getComputedStyle(before).marginBottom) || 0;
          var topMargin = parseFloat(w.getComputedStyle(after).marginTop) || 0;
          var remainingGap = Math.max(0, bottomMargin, topMargin) + Math.min(0, bottomMargin, topMargin);
          removed = after.getBoundingClientRect().top - before.getBoundingClientRect().bottom - remainingGap;
        }
        collapsedHeight = bounds.height - removed;
        lastWidth = bounds.width;
      }
      return { top: bounds.top, height: collapsedHeight };
    }
    function availableHeight(target, trailing, minimum) {
      var bounds = collapsedBounds();
      // The status strip can move the card down without changing the form.
      var offset = Math.max(0, target.getBoundingClientRect().top - bounds.top);
      return Math.max(minimum || 0, Math.round(bounds.height - offset - (trailing || 0)));
    }
    return Object.freeze({
      twoColumns: twoColumns, availableHeight: availableHeight,
      reset: function () { collapsedHeight = 0; lastWidth = 0; }
    });
  }

  var card, content, hint, geometry, frame = 0, started = false, overflowing = false;
  function setSize(element, name, value) {
    if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
  }
  function scrollCue() {
    if (!hint || hint.hidden) return;
    // Keep its space at the end of a scroll, so the final rows do not jump.
    var atEnd = content.scrollHeight - content.clientHeight - content.scrollTop <= 4;
    hint.classList.toggle('vilda-summary-scroll-hint-at-end', atEnd);
  }
  function clearOverflow() {
    overflowing = false;
    hint.hidden = true;
    content.removeAttribute('tabindex');
    if (content.getAttribute('role') === 'region') {
      content.removeAttribute('role');
      content.removeAttribute('aria-label');
    }
  }
  function release() {
    card.classList.remove('vilda-summary-height-matched');
    card.style.removeProperty('--vilda-summary-card-height');
    content.style.removeProperty('--vilda-summary-content-height');
    clearOverflow();
  }
  function refresh() {
    if (!started) return;
    if (!card.getClientRects().length || !geometry.twoColumns()) {
      release();
      return;
    }
    var height = geometry.availableHeight(card);
    if (!height) { release(); return; }
    setSize(card, '--vilda-summary-card-height', height + 'px');
    card.classList.add('vilda-summary-height-matched');
    if (content.hidden) { clearOverflow(); return; }

    var style = w.getComputedStyle(card);
    var trailing = (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    var available = Math.max(0, Math.floor(card.getBoundingClientRect().top + height - trailing - content.getBoundingClientRect().top));
    setSize(content, '--vilda-summary-content-height', available + 'px');
    overflowing = content.scrollHeight > content.clientHeight + 1;
    if (!overflowing) { clearOverflow(); return; }

    hint.hidden = false;
    setSize(hint, '--vilda-summary-hint-bottom', trailing + 'px');
    var hintStyle = w.getComputedStyle(hint);
    var cueHeight = hint.getBoundingClientRect().height + (parseFloat(hintStyle.marginTop) || 0);
    setSize(content, '--vilda-summary-content-height', Math.max(0, available - cueHeight) + 'px');
    content.setAttribute('tabindex', '0');
    if (content.getAttribute('role') !== 'tabpanel') {
      content.setAttribute('role', 'region');
      content.setAttribute('aria-label', 'Podsumowanie wyników');
    }
    scrollCue();
  }
  function schedule() {
    if (!frame) frame = w.requestAnimationFrame(function () { frame = 0; refresh(); });
  }
  function start() {
    if (started) return;
    var form = d.getElementById('calcForm');
    var fieldset = d.querySelector('#userSection fieldset.user-card');
    var doctor = d.getElementById('doctorSection');
    card = d.getElementById('currentSummaryCard');
    content = d.getElementById('currentSummaryContent');
    if (!form || !fieldset || !doctor || !card || !content) return;
    started = true;
    geometry = createFormGeometry(form, fieldset, doctor);
    hint = d.createElement('div');
    hint.id = 'vildaSummaryScrollHint';
    hint.className = 'vilda-summary-scroll-hint';
    hint.textContent = 'Przewiń, aby zobaczyć dalsze wyniki ↓';
    hint.setAttribute('aria-hidden', 'true');
    hint.hidden = true;
    card.appendChild(hint);
    content.addEventListener('scroll', scrollCue, { passive: true });
    content.addEventListener('toggle', schedule, true);
    d.addEventListener('vilda:professional-summary-updated', refresh);
    d.addEventListener('vilda:summary-chart-state', refresh);
    w.addEventListener('resize', schedule);
    w.addEventListener('pageshow', refresh);
    if (typeof w.ResizeObserver === 'function') {
      var resize = new w.ResizeObserver(schedule);
      resize.observe(fieldset);
      resize.observe(card);
      var strip = d.getElementById('vildaStatusSide');
      if (strip) resize.observe(strip);
    }
    if (typeof w.MutationObserver === 'function') {
      // Content updates and visibility changes are coalesced. Never observe the
      // size properties written here, which would continually schedule layouts.
      var changes = new w.MutationObserver(schedule);
      changes.observe(content, { childList: true, subtree: true, characterData: true });
      var wrap = d.getElementById('currentSummaryWrap');
      if (wrap) changes.observe(wrap, { attributes: true, attributeFilter: ['style', 'hidden'] });
    }
    refresh();
  }
  w.VildaSummaryLayout = Object.freeze({ createFormGeometry: createFormGeometry, refresh: refresh });
  if (d && d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true });
  else if (d) start();
})(typeof window !== 'undefined' ? window : undefined);
