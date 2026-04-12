/*
 * Single-column (mobile) ordering for the results cards
 * ----------------------------------------------------
 *
 * FIX: do not react to height-only resize events caused by hiding/showing
 * the mobile browser chrome (Safari/Chrome address bars).
 *
 * The previous version listened to every `resize` and re-appended the same
 * sections on phones. When the browser UI collapsed during scrolling, the
 * viewport height changed, `resize` fired, and the following sections were
 * moved again in the DOM:
 *   - #metabolicSummarySection
 *   - #advancedGrowthSection
 *   - related result cards in #normWrapper
 *
 * That is exactly the kind of operation that looks like “jumping” while the
 * user scrolls.
 *
 * This version reorders cards only when the *viewport width* changes enough
 * to matter (e.g. breakpoint crossing / rotation), not when only the height
 * changes because browser bars animate.
 */
(function () {
  'use strict';

  var MOBILE_BREAKPOINT = 700;

  // IDs of the sections/cards that participate in the single-column ordering.
  var ORDER_IDS = [
    'metabolicSummarySection',
    'bmiCard',
    'adultVitalsCard',
    'wflCard',
    'coleCard',
    'growthCalculationsSection',
    'advancedGrowthSection',
    'toNormCard',
    'planCard',
    'whrCard',
    'bpCard',
    'downSyndromeSection',
    'intakeSection',
    'circSection',
    'respiratoryCard',
    'foodCard'
  ];

  // Home anchors: Map<elementId, anchorNode>
  var homeAnchors = new Map();
  var currentMode = null; // 'mobile' | 'desktop' | null
  var lastViewportWidth = 0;
  var rafId = 0;
  var pendingForce = false;

  function getEl(id) {
    return document.getElementById(id);
  }

  function getViewportWidth() {
    return Math.max(
      (window.visualViewport && window.visualViewport.width) || 0,
      window.innerWidth || 0,
      (document.documentElement && document.documentElement.clientWidth) || 0
    );
  }

  function isMobileLayout() {
    return getViewportWidth() < MOBILE_BREAKPOINT;
  }

  function isAdultAge() {
    try {
      var age = (typeof window.getAgeDecimal === 'function') ? window.getAgeDecimal() : NaN;
      if (typeof window.patientReportIsAdultAge === 'function') {
        return !!window.patientReportIsAdultAge(age);
      }
      return isFinite(age) && age >= 18;
    } catch (_) {
      return false;
    }
  }

  function moveAfter(parent, el, referenceEl) {
    if (!parent || !el) return;

    if (referenceEl && referenceEl.parentNode === parent) {
      if (referenceEl.nextSibling !== el) {
        parent.insertBefore(el, referenceEl.nextSibling);
      }
      return;
    }

    if (el.parentNode !== parent || el !== parent.lastElementChild) {
      parent.appendChild(el);
    }
  }

  // Create an invisible anchor right before the element in its current parent.
  // The anchor never moves; the element can later be restored right after it.
  function createHomeAnchor(el) {
    if (!el || !el.parentNode || !el.id) return;
    if (homeAnchors.has(el.id)) return;

    var anchor = document.createComment('home-anchor:' + el.id);
    el.parentNode.insertBefore(anchor, el);
    homeAnchors.set(el.id, anchor);
  }

  function ensureHomeAnchors() {
    ORDER_IDS.forEach(function (id) {
      createHomeAnchor(getEl(id));
    });
  }

  function restoreToHome(id) {
    var el = getEl(id);
    var anchor = homeAnchors.get(id);
    if (!el || !anchor || !anchor.parentNode) return;

    if (anchor.nextSibling !== el) {
      anchor.parentNode.insertBefore(el, anchor.nextSibling);
    }
  }

  function applyMobileSingleColumnOrder() {
    var leftColumn = getEl('leftColumnWrap');
    var rightColumn = getEl('normWrapper');
    if (!leftColumn) return;

    var desired = [
      'metabolicSummarySection',
      'bmiCard',
      'wflCard',
      'coleCard',
      'growthCalculationsSection',
      'advancedGrowthSection',
      'toNormCard',
      'whrCard',
      'bpCard',
      'downSyndromeSection',
      'intakeSection',
      'circSection',
      'respiratoryCard',
      'foodCard'
    ];

    // Important: execute only when entering mobile layout (or on explicit force),
    // not on every transient resize. appendChild is fine here because we run it
    // only when the layout mode actually changes.
    desired.forEach(function (id) {
      var el = getEl(id);
      if (el) {
        leftColumn.appendChild(el);
      }
    });

    if (rightColumn) {
      rightColumn.style.display = 'none';
    }
  }

  function placeAdultVitalsCard() {
    var card = getEl('adultVitalsCard');
    var leftColumn = getEl('leftColumnWrap');
    var bmiCard = getEl('bmiCard');

    if (!card || !leftColumn) return;

    if (isMobileLayout()) {
      moveAfter(leftColumn, card, bmiCard);
      return;
    }

    restoreToHome('adultVitalsCard');
  }

  function placePlanCard() {
    var card = getEl('planCard');
    var leftColumn = getEl('leftColumnWrap');
    var rightColumn = getEl('normWrapper');
    var toNormCard = getEl('toNormCard');

    if (!card) return;

    if (isAdultAge()) {
      var targetParent = isMobileLayout() ? leftColumn : rightColumn;
      if (!targetParent) return;
      moveAfter(targetParent, card, toNormCard);
      return;
    }

    restoreToHome('planCard');
  }

  function applyResponsiveCardPlacements() {
    placeAdultVitalsCard();
    placePlanCard();
  }

  function restoreDesktopTwoColumnLayout() {
    var rightColumn = getEl('normWrapper');
    if (rightColumn) {
      rightColumn.style.display = '';
    }

    ORDER_IDS.forEach(function (id) {
      restoreToHome(id);
    });
  }

  function reposition(force) {
    if (force === void 0) force = false;

    ensureHomeAnchors();

    var nextMode = isMobileLayout() ? 'mobile' : 'desktop';
    if (!force && nextMode === currentMode) {
      return;
    }

    currentMode = nextMode;

    if (nextMode === 'mobile') {
      applyMobileSingleColumnOrder();
    } else {
      restoreDesktopTwoColumnLayout();
    }

    applyResponsiveCardPlacements();
  }

  function scheduleReposition(force) {
    if (force === void 0) force = false;

    pendingForce = pendingForce || !!force;

    if (rafId) return;

    rafId = requestAnimationFrame(function () {
      var shouldForce = pendingForce;
      pendingForce = false;
      rafId = 0;
      reposition(shouldForce);
    });
  }

  function handleWidthSensitiveResize() {
    var nextWidth = getViewportWidth();

    // Ignore height-only resizes (mobile browser bars, keyboard-related chrome,
    // etc.) and tiny fractional width noise.
    if (Math.abs(nextWidth - lastViewportWidth) < 2) {
      return;
    }

    lastViewportWidth = nextWidth;
    scheduleReposition(false);
  }

  function init() {
    lastViewportWidth = getViewportWidth();
    reposition(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.addEventListener('pageshow', function () {
    lastViewportWidth = getViewportWidth();
    scheduleReposition(false);
  }, { passive: true });

  window.addEventListener('resize', handleWidthSensitiveResize, { passive: true });

  if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
    window.visualViewport.addEventListener('resize', handleWidthSensitiveResize, { passive: true });
  }

  window.addEventListener('orientationchange', function () {
    window.setTimeout(function () {
      lastViewportWidth = getViewportWidth();
      scheduleReposition(false);
    }, 120);
  }, { passive: true });

  // Optional manual hook in case another script needs a one-time forced rebuild.
  window.repositionSingleColumnResults = function (force) {
    scheduleReposition(force !== false);
  };

  window.syncResponsiveCardPlacements = function () {
    ensureHomeAnchors();
    applyResponsiveCardPlacements();
  };
})();
