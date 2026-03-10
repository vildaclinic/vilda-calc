/*
 * Single‑column (mobile) ordering for the results cards
 * ----------------------------------------------------
 *
 * The app uses a two‑column DOM structure:
 *   - #leftColumnWrap   (left column)
 *   - #normWrapper      (right column)
 *
 * On small screens (<700px) we want ONE vertical flow with a strict order.
 * This script moves/reorders the existing DOM nodes ONLY in that view and
 * restores the original two‑column layout on wider screens (>=700px).
 *
 * IMPORTANT: We do not change the two‑column (desktop) layout.
 */
(function () {
  'use strict';

  var MOBILE_BREAKPOINT = 700;

  // IDs of the sections/cards that participate in the single‑column ordering.
  // We also use these IDs to create "home anchors" (placeholders) so every
  // element can be restored to its original desktop position.
  var ORDER_IDS = [
    // Buttons
    'metabolicSummarySection',

    // Main results cards
    'bmiCard',
    'wflCard',
    'coleCard',
    'advancedGrowthSection',
    'toNormCard',
    'whrCard',
    'bpCard',

    // Toggles / sections
    'downSyndromeSection',
    'circSection',

    // Remaining cards
    'respiratoryCard',
    'foodCard'
  ];

  // Home anchors: Map<elementId, anchorNode>
  var homeAnchors = new Map();
  var anchorsInitialized = false;

  function getEl(id) {
    return document.getElementById(id);
  }

  // Create an invisible anchor right before the element in its *current* parent.
  // The anchor never moves; the element can be restored by inserting it right after the anchor.
  function createHomeAnchor(el) {
    if (!el || !el.parentNode || !el.id) return;
    if (homeAnchors.has(el.id)) return;

    var anchor = document.createElement('span');
    anchor.setAttribute('data-home-anchor', el.id);
    anchor.style.display = 'none';

    el.parentNode.insertBefore(anchor, el);
    homeAnchors.set(el.id, anchor);
  }

  function ensureHomeAnchors() {
    if (anchorsInitialized) return;
    ORDER_IDS.forEach(function (id) {
      createHomeAnchor(getEl(id));
    });
    anchorsInitialized = true;
  }

  function restoreToHome(id) {
    var el = getEl(id);
    var anchor = homeAnchors.get(id);
    if (!el || !anchor || !anchor.parentNode) return;
    // Insert right AFTER the anchor (anchor.nextSibling is the original element position).
    anchor.parentNode.insertBefore(el, anchor.nextSibling);
  }

  function applyMobileSingleColumnOrder() {
    var leftColumn = getEl('leftColumnWrap');
    var rightColumn = getEl('normWrapper');
    if (!leftColumn) return;

    // Desired order in single column.
    // NOTE: WFL card is optional; if it's hidden it won't affect layout.
    var desired = [
      'metabolicSummarySection',
      'bmiCard',
      'wflCard',
      'coleCard',
      'advancedGrowthSection',
      'toNormCard',
      'whrCard',
      'bpCard',
      'downSyndromeSection',
      'circSection',
      'respiratoryCard',
      'foodCard'
    ];

    desired.forEach(function (id) {
      var el = getEl(id);
      if (el) {
        // appendChild also reorders within the same parent.
        leftColumn.appendChild(el);
      }
    });

    // Hide the (now empty) right column to avoid an extra blank gap that
    // would appear because #results is displayed as grid even on mobile.
    if (rightColumn) {
      rightColumn.style.display = 'none';
    }
  }

  function restoreDesktopTwoColumnLayout() {
    var rightColumn = getEl('normWrapper');
    if (rightColumn) {
      // Restore default CSS display (flex) on desktop.
      rightColumn.style.display = '';
    }

    // Restore every moved/reordered element to its original position.
    // We restore all IDs from ORDER_IDS; the anchors ensure correct placement.
    ORDER_IDS.forEach(function (id) {
      restoreToHome(id);
    });
  }

  function reposition() {
    ensureHomeAnchors();

    var isMobile = window.innerWidth < MOBILE_BREAKPOINT;
    if (isMobile) {
      applyMobileSingleColumnOrder();
    } else {
      restoreDesktopTwoColumnLayout();
    }
  }

  // Throttle resize handling to the next animation frame.
  var rafId = null;
  function scheduleReposition() {
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(function () {
      rafId = null;
      reposition();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    reposition();
  });

  window.addEventListener('resize', function () {
    scheduleReposition();
  });
})();
