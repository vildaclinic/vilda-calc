// This script contains custom fixes for the Waga i wzrost application.
//
// 1. In single‑column (mobile) view the metabolic summary is split into
//    two cards (“currentSummaryCardLeft” and “currentSummaryCardRight”).  On
//    narrow screens we merge the content of the right card into the left
//    card and remove the right card entirely.  This ensures that the
//    summary appears as a single card with combined content.  Merging
//    happens once per render and is re‑attempted whenever the DOM
//    changes or the window is resized.
//
// 2. The application automatically scrolls certain elements into view
//    when switching between standard and professional result modes.  On
//    mobile devices this behaviour can be jarring.  We disable
//    scrollIntoView calls globally while the viewport is narrower than
//    700 px by overriding Element.prototype.scrollIntoView.  The
//    original implementation is restored when the viewport widens again.

(function() {
  'use strict';

  /**
   * Merge the right summary card into the left one on small screens.
   * If the cards are not present or the viewport is wide, the
   * function does nothing.  Once merged the left card is marked
   * via a data attribute to avoid repeated work.
   */
  function mergeSummaryCards() {
    // Only merge in single‑column layout
    if (window.innerWidth >= 700) return;
    const leftCard  = document.getElementById('currentSummaryCardLeft');
    const rightCard = document.getElementById('currentSummaryCardRight');
    if (!leftCard || !rightCard) return;
    // Skip if already merged
    if (leftCard.dataset.merged === 'true') return;
    const leftContent  = leftCard.querySelector('.summary-content');
    const rightContent = rightCard.querySelector('.summary-content');
    if (leftContent && rightContent) {
      // Move all child nodes from rightContent into leftContent
      while (rightContent.firstChild) {
        leftContent.appendChild(rightContent.firstChild);
      }
    }
    // Remove the right card from the DOM
    rightCard.remove();
    // Mark as merged to avoid repeating
    leftCard.dataset.merged = 'true';
  }

  /**
   * Disable or restore scrollIntoView based on viewport width.
   * On narrow screens (<700 px) scrollIntoView is overridden with a
   * no‑op to prevent automatic scrolling when toggling result modes.
   * On wider screens the original method is restored.
   */
  function toggleAutoScrollDisable() {
    if (window.innerWidth < 700) {
      if (!Element.prototype._originalScrollIntoView) {
        Element.prototype._originalScrollIntoView = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function() {
          // Intentionally do nothing on small screens
        };
      }
    } else {
      if (Element.prototype._originalScrollIntoView) {
        Element.prototype.scrollIntoView = Element.prototype._originalScrollIntoView;
        delete Element.prototype._originalScrollIntoView;
      }
    }
  }

  // Observe the DOM for summary card insertion and attempt merging
  const observer = new MutationObserver(mergeSummaryCards);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Merge on resize and after DOM is ready
  window.addEventListener('resize', mergeSummaryCards);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    mergeSummaryCards();
  } else {
    document.addEventListener('DOMContentLoaded', mergeSummaryCards);
  }

  // Disable scrollIntoView on mobile and restore on wider screens
  toggleAutoScrollDisable();
  window.addEventListener('resize', toggleAutoScrollDisable);

  /**
   * Inject styles for the custom shortcut dropdown.  The Liquid Glass
   * theme (ios26-v2.css) loads after sidebar.css and may override the
   * appearance of our dropdown.  By adding a <style> tag at runtime
   * after all CSS has loaded, we ensure these rules have the highest
   * specificity and are applied even under Liquid Glass.  The styles
   * increase the height of the dropdown, enlarge padding and line height
   * on each option, and ensure long titles wrap instead of being
   * truncated.  This function is idempotent; it will only insert the
   * styles once.
   */
  function injectShortcutStyles() {
    if (document.getElementById('shortcutStyleInjected')) return;
    var style = document.createElement('style');
    style.id = 'shortcutStyleInjected';
    style.textContent = `
      .mini-summary .shortcut-dropdown {
        max-height: 24rem !important;
      }
      .mini-summary .shortcut-option {
        padding: 0.7rem 1.2rem !important;
        line-height: 1.4 !important;
        white-space: normal !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        text-overflow: unset !important;
        overflow: visible !important;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Distribute test cards between two column containers so that the overall
   * heights of the columns remain equal.  The function collects all
   * descendant elements with the `.gh-test-card` class from both
   * containers, then splits them into two groups.  If there is an odd
   * number of cards, the left column receives the smaller half (⌊n/2⌋)
   * while the right column receives the remainder.  Each card's flex
   * settings are recalculated so that the total flex-grow values of
   * both columns match.  For example, with five cards the left column
   * will contain two cards each with flex-grow 3, and the right column
   * three cards each with flex-grow 2 (2 × 3 = 3 × 2 = 6).  On narrower
   * screens (<700 px) the distribution is skipped entirely and the
   * original order of cards remains unchanged.
   *
   * @param {string} leftId  The ID of the left column container.
   * @param {string} rightId The ID of the right column container.
   */
  function distributeTestCards(leftId, rightId) {
    // Only apply the distribution logic on larger screens (two‑column layout).
    if (window.innerWidth < 700) {
      return;
    }
    const leftContainer  = document.getElementById(leftId);
    const rightContainer = document.getElementById(rightId);
    if (!leftContainer || !rightContainer) return;

    // Gather all test cards from both containers in their current order.
    const leftCards  = Array.from(leftContainer.querySelectorAll('.gh-test-card'));
    const rightCards = Array.from(rightContainer.querySelectorAll('.gh-test-card'));
    const allCards   = leftCards.concat(rightCards);
    const total      = allCards.length;
    if (!total) return;

    // Determine how many cards should go into each column.  We put the
    // smaller half into the left column to keep the difference in card
    // counts at most one.  The remainder goes to the right column.
    const leftCount  = Math.floor(total / 2);
    const rightCount = total - leftCount;

    // Clear existing children so that we can re‑append cards in the new order.
    leftContainer.innerHTML  = '';
    rightContainer.innerHTML = '';

    // Reset any inline flex styles from previous runs.  Without this the
    // flex values or paddings could accumulate when the user resizes the window.
    allCards.forEach(card => {
      card.style.flex      = '';
      card.style.flexGrow  = '';
      card.style.flexShrink = '';
      card.style.flexBasis = '';
    });

    // Append cards to the left and right containers based on the computed
    // distribution.  Preserve the original ordering of cards.
    allCards.forEach((card, index) => {
      if (index < leftCount) {
        leftContainer.appendChild(card);
      } else {
        rightContainer.appendChild(card);
      }
      // Override flex settings so each card keeps its natural height.  This
      // prevents CSS rules (which assign flex-grow to cards) from stretching
      // them.  Using 0 0 auto stops growth and shrinkage and lets content
      // determine the height of the card.
      card.style.flex = '0 0 auto';
    });

    // Do not assign flex-grow to cards.  Keep their natural height.
    // Instead, equalise column heights by adding padding to the shorter column.
    // First reset any padding applied previously.
    leftContainer.style.paddingBottom  = '0';
    rightContainer.style.paddingBottom = '0';

    // Override any height:100% declarations coming from CSS.  Using
    // auto allows the container to shrink-wrap its content and rely on
    // padding-bottom (added below) to equalise column heights without
    // introducing empty space inside cards.
    leftContainer.style.height  = 'auto';
    rightContainer.style.height = 'auto';

    // Use requestAnimationFrame to ensure DOM has reflowed before measuring.
    requestAnimationFrame(() => {
      const leftHeight  = leftContainer.getBoundingClientRect().height;
      const rightHeight = rightContainer.getBoundingClientRect().height;
      if (leftHeight < rightHeight) {
        leftContainer.style.paddingBottom  = `${rightHeight - leftHeight}px`;
        rightContainer.style.paddingBottom = '0';
      } else if (rightHeight < leftHeight) {
        rightContainer.style.paddingBottom = `${leftHeight - rightHeight}px`;
        leftContainer.style.paddingBottom  = '0';
      }
    });
  }

  /**
   * Adjust the layout of all available test groups.  This helper simply
   * calls distributeTestCards on each pair of column containers.  It can
   * be invoked after the DOM is ready, after a test list is toggled, or
   * whenever the window is resized.
   */
  function adjustAllTestCards() {
    distributeTestCards('ghTestsLeft',   'ghTestsRight');
    distributeTestCards('ogttTestsLeft', 'ogttTestsRight');
    distributeTestCards('acthTestsLeft', 'acthTestsRight');
  }

  // Run the distribution once the DOM has loaded.  Using DOMContentLoaded
  // ensures that the test containers exist before we attempt to modify
  // them.  We also run it on resize events to handle dynamic changes
  // between mobile and desktop layouts.
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    adjustAllTestCards();
  } else {
    document.addEventListener('DOMContentLoaded', adjustAllTestCards);
  }
  window.addEventListener('resize', adjustAllTestCards);

  // Hook into test toggle buttons so that whenever a list of tests is
  // shown or hidden, the cards are redistributed.  Because the DOM
  // updates (showing/hiding of containers) occur within the same tick of
  // the event loop, we schedule the redistribution via setTimeout with
  // a zero delay.  This ensures that our logic runs after the active
  // classes are applied and new elements have been inserted.
  ['toggleGhTests', 'toggleOgttTests', 'toggleActhTests'].forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', function() {
        setTimeout(adjustAllTestCards, 0);
      });
    }
  });
})();
// ---------------------------------------------------------------------------
// Obsługa przycisków „Zapisz dane” i „Wczytaj dane” w bocznym sidebarze
// (desktop).  Wykorzystujemy istniejącą logikę z app.js poprzez
// window.vildaExport, ale nie modyfikujemy samego app.js.
(function () {
  function syncSidebarMenuState() {
    var headerSave  = document.getElementById('saveDataBtn');
    var headerLoad  = document.getElementById('loadDataBtn');
    var sidebarSave = document.getElementById('saveDataBtnSidebar');
    var sidebarLoad = document.getElementById('loadDataBtnSidebar');

    if (sidebarSave && headerSave) {
      if (headerSave.disabled || headerSave.hasAttribute('disabled')) {
        sidebarSave.setAttribute('disabled', '');
        sidebarSave.setAttribute('aria-disabled', 'true');
      } else {
        sidebarSave.removeAttribute('disabled');
        sidebarSave.removeAttribute('aria-disabled');
      }
    }

    if (sidebarLoad && headerLoad) {
      if (headerLoad.disabled || headerLoad.hasAttribute('disabled')) {
        sidebarLoad.setAttribute('disabled', '');
        sidebarLoad.setAttribute('aria-disabled', 'true');
      } else {
        sidebarLoad.removeAttribute('disabled');
        sidebarLoad.removeAttribute('aria-disabled');
      }
    }
  }

  function initSidebarMenu() {
    var sidebarSave  = document.getElementById('saveDataBtnSidebar');
    var sidebarLoad  = document.getElementById('loadDataBtnSidebar');
    var sidebarFile  = document.getElementById('fileInputSidebar');
    var headerSave   = document.getElementById('saveDataBtn');
    var headerLoad   = document.getElementById('loadDataBtn');

    // Na starcie wyrównaj stan disabled z przyciskami w menu hamburgera
    syncSidebarMenuState();

    // ZAPISZ DANE (proxy do window.vildaExport.saveUserData)
    if (sidebarSave) {
      sidebarSave.addEventListener('click', function (e) {
        e.preventDefault();

        // Jeżeli oryginalny przycisk jest nieaktywny – pokaż tę samą informację
        if (sidebarSave.hasAttribute('disabled')) {
          var msg =
            (headerSave && (headerSave.getAttribute('data-tip') || headerSave.getAttribute('title'))) ||
            sidebarSave.getAttribute('data-tip') ||
            'Aby zapisać dane, uzupełnij wymagane pola.';
          if (typeof showTooltip === 'function') {
            showTooltip(sidebarSave, msg);
          } else {
            alert(msg);
          }
          return;
        }

        if (window.vildaExport && typeof window.vildaExport.saveUserData === 'function') {
          window.vildaExport.saveUserData();
          // Po zapisie logika w app.js może zmienić stan przycisków
          syncSidebarMenuState();
        }
      });
    }

    // WCZYTAJ DANE (własne odczytywanie pliku, ale używa applyLoadedData z app.js)
    if (sidebarLoad && sidebarFile) {
      sidebarLoad.addEventListener('click', function (e) {
        e.preventDefault();

        if (sidebarLoad.hasAttribute('disabled')) {
          var msg =
            (headerLoad && (headerLoad.getAttribute('data-tip') || headerLoad.getAttribute('title'))) ||
            sidebarLoad.getAttribute('data-tip') ||
            'Wczytywanie danych jest możliwe tylko na początku sesji.';
          if (typeof showTooltip === 'function') {
            showTooltip(sidebarLoad, msg);
          } else {
            alert(msg);
          }
          return;
        }

        sidebarFile.click();
      });

      sidebarFile.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function () {
          try {
            var obj = JSON.parse(reader.result);
            if (window.vildaExport && typeof window.vildaExport.applyLoadedData === 'function') {
              window.vildaExport.applyLoadedData(obj);
            }
            // Po wczytaniu danych przycisk „Wczytaj dane” w hamburgerze
            // zostanie wyłączony – odświeżamy też stan w sidebarze.
            syncSidebarMenuState();
          } catch (err) {
            var msg = 'Nieprawidłowy plik JSON. Upewnij się, że wskazałeś plik zapisany z aplikacji.';
            if (typeof showTooltip === 'function') {
              showTooltip(sidebarLoad, msg);
            } else {
              alert(msg);
            }
          } finally {
            e.target.value = '';
          }
        };
        reader.readAsText(file, 'utf-8');
      });
    }

    // Za każdym razem, gdy użytkownik edytuje dane wejściowe, logika w app.js
    // zmienia stan disabled przycisków w hamburgerze.  Tutaj tylko to
    // „podglądamy” i kopiujemy do sidebara.
    ['input', 'change'].forEach(function (evtName) {
      document.addEventListener(
        evtName,
        function () {
          syncSidebarMenuState();
        },
        true
      );
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initSidebarMenu();
  } else {
    document.addEventListener('DOMContentLoaded', initSidebarMenu);
  }
})();
// ---------------------------------------------------------------------------
// Wyróżnianie aktywnej pozycji w bocznym sidebarze
(function () {
  function normalizePath(path) {
    if (!path) return '/';

    // Utnij query string i hash
    var qIndex = path.indexOf('?');
    if (qIndex !== -1) path = path.slice(0, qIndex);
    var hashIndex = path.indexOf('#');
    if (hashIndex !== -1) path = path.slice(0, hashIndex);

    // /index.html traktujemy jak /
    if (path === '/index.html') return '/';

    // Usuń końcowy slash (oprócz samego "/")
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return path;
  }

  function markActiveSidebarLink() {
    var links = document.querySelectorAll('.sidebar-nav a[href]');
    if (!links.length) return;

    var current = normalizePath(window.location.pathname || '/');

    links.forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href) return;

      // Odpuść zewnętrzne linki typu https://..., mailto:
      if (href.indexOf('http') === 0 || href.indexOf('mailto:') === 0) return;

      var normalizedHref = normalizePath(href);

      if (normalizedHref === current) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('is-active');
        link.removeAttribute('aria-current');
      }
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    markActiveSidebarLink();
  } else {
    document.addEventListener('DOMContentLoaded', markActiveSidebarLink);
  }
})();
// ---------------------------------------------------------------------------
// Wyróżnianie aktywnej pozycji w bocznym sidebarze
(function () {
  'use strict';

  function normalizePath(path) {
    if (!path) return 'index';
  
    // Utnij query string i hash
    var qIndex = path.indexOf('?');
    if (qIndex !== -1) path = path.slice(0, qIndex);
    var hashIndex = path.indexOf('#');
    if (hashIndex !== -1) path = path.slice(0, hashIndex);
  
    // Usuń końcowy slash, np. "/docpro/" -> "/docpro"
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
  
    // Weź tylko ostatni segment po "/" – ignorujemy katalogi
    var lastSlash = path.lastIndexOf('/');
    if (lastSlash !== -1) {
      path = path.slice(lastSlash + 1); // "docpro.html" albo "docpro"
    }
  
    // Pusta ścieżka lub index.html = strona główna
    if (path === '' || path.toLowerCase() === 'index.html') {
      return 'index';
    }
  
    // Obetnij rozszerzenie .html
    if (path.toLowerCase().endsWith('.html')) {
      path = path.slice(0, -5);
    }
  
    // Porównujemy bez rozróżniania wielkości liter
    return path.toLowerCase();
  }

  function markActiveSidebarLink() {
    var links = document.querySelectorAll('.sidebar-nav a[href]');
    if (!links.length) return;

    var current = normalizePath(window.location.pathname || '/');

    links.forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href) return;

      // Pseudo‑przyciski (Zapisz/Wczytaj) – nie zaznaczamy
      if (link.getAttribute('role') === 'button') {
        return;
      }

      // Linki kotwicowe typu "#sekcja" – też pomijamy
      if (href === '#' || href.charAt(0) === '#') {
        return;
      }

      // Linki zewnętrzne: https://..., //..., mailto:
      if (/^(https?:)?\/\//i.test(href) || href.indexOf('mailto:') === 0) {
        return;
      }

      var normalizedHref = normalizePath(href);

      if (normalizedHref === current) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('is-active');
        link.removeAttribute('aria-current');
      }
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    markActiveSidebarLink();
  } else {
    document.addEventListener('DOMContentLoaded', markActiveSidebarLink);
  }
})();

// ---------------------------------------------------------------------------
// Mini summary in the sidebar
//
// The sidebar contains a vertical menu. When the user scrolls down and the
// entire menu disappears from view (i.e. the last menu item is no longer
// visible in the viewport), we display a compact summary of the entered
// personal data (name, age, weight, height and body surface area).  The
// summary disappears again as soon as any menu item reappears on screen.
//
// The summary follows the same colouring rules for weight and height as the
// main "Podsumowanie wyników" card: values in the extreme percentiles (below
// the 3rd or above the 97th percentile for children) are coloured red via the
// `status‑alert` class, while values within the normal range remain in the
// default colour.  The percentile (centyl) for weight and height is shown
// alongside the numeric value, and updates dynamically when the user edits
// their inputs or changes the centile data source (Palczewska/OLAF/WHO).
(function(){
  'use strict';

  /**
   * Escape HTML special characters to prevent XSS when inserting user input.
   *
   * @param {string} str Input string
   * @returns {string} Escaped string
   */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Compute the percentile for a given value using the appropriate data source.
   * For Palczewska and OLAF (<3 years) we use calcPercentileStatsPal; otherwise
   * calcPercentileStats.  Returns the raw percentile (0–100) or null if
   * unavailable.
   *
   * @param {number} value  The measurement (weight or height)
   * @param {string} sex    'M' or 'F'
   * @param {number} age    Age in decimal years
   * @param {string} param  'WT' for weight or 'HT' for height
   * @param {string} src    Selected data source ('PALCZEWSKA', 'OLAF' or 'WHO')
   * @returns {number|null}
   */
  function computePercentile(value, sex, age, param, src) {
    // Make sure required globals exist before calling them.
    try {
      // Decide whether to use Palczewska tables.  For OLAF we fall back to
      // Palczewska below the minimum age (3 years).  Age can be fractional.
      var usePal = false;
      if (typeof OLAF_DATA_MIN_AGE !== 'undefined') {
        usePal = (src === 'PALCZEWSKA') || (src === 'OLAF' && age < OLAF_DATA_MIN_AGE);
      } else {
        // If the constant is missing, default to using Palczewska for Palczewska source only.
        usePal = (src === 'PALCZEWSKA');
      }
      var stats;
      if (usePal && typeof calcPercentileStatsPal === 'function') {
        stats = calcPercentileStatsPal(value, sex, age, param);
      } else if (typeof calcPercentileStats === 'function') {
        stats = calcPercentileStats(value, sex, age, param);
      }
      if (stats && typeof stats.percentile === 'number') {
        return stats.percentile;
      }
    } catch (e) {
      // swallow any errors; simply return null
    }
    return null;
  }

  /**
   * Format a percentile as a string with an appropriate word (centyl/centyla).
   * Uses the global formatCentile and centylWord helpers if available; falls
   * back to a simple rounding otherwise.  Returned string contains HTML
   * entities (&lt; or &gt;) where necessary.
   *
   * @param {number|null} p Percentile (0–100)
   * @returns {string} e.g. "37 centyl", "&lt;1 centyla", "&gt;100 centyla"
   */
  function formatCentileDisplay(p) {
    if (p == null || isNaN(p)) return '';
    if (typeof formatCentile === 'function' && typeof centylWord === 'function') {
      var raw = formatCentile(p);
      var word = centylWord(raw);
      // Replace entities for display
      var txt = raw.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      return txt + ' ' + word;
    }
    // Fallback: round to nearest integer and append 'centyl'
    var rounded = Math.round(p);
    return rounded + ' centyl';
  }

  /**
   * Determine the CSS class for a percentile value in children.  If the
   * percentile is outside the 3–97 range we return ' status-alert';
   * otherwise an empty string.  For adults we return an empty string.
   *
   * @param {number|null} p   Percentile
   * @param {number} age      Age in decimal years
   * @returns {string}
   */
  function getStatusClass(p, age) {
    if (p == null || isNaN(p)) return '';
    if (age >= 18) return '';
    if (p < 3 || p > 97) return ' status-alert';
    return '';
  }

  /**
   * Build the content of the mini summary and update its visibility.
   */
  function updateMiniSummary() {
    var mini = document.getElementById('miniSummary');
    if (!mini) return;

    // Read inputs
    var nameEl   = document.getElementById('name');
    var nameVal  = nameEl ? nameEl.value.trim() : '';
    var yearsEl  = document.getElementById('age');
    var monthsEl = document.getElementById('ageMonths');
    var weightEl = document.getElementById('weight');
    var heightEl = document.getElementById('height');
    var sexEl    = document.getElementById('sex');
    var sexVal   = sexEl ? sexEl.value : 'M';

    // Numeric values
    var ageYears  = 0;
    var yrs = 0, mos = 0;
    if (yearsEl || monthsEl) {
      var years  = yearsEl ? parseFloat(yearsEl.value)  || 0 : 0;
      var months = monthsEl ? parseFloat(monthsEl.value) || 0 : 0;
      // Limit months to [0,11]
      mos = Math.max(0, Math.min(11, months));
      yrs = Math.floor(years);
      ageYears = yrs + mos / 12;
    }
    var weightVal = weightEl ? parseFloat(weightEl.value) || 0 : 0;
    var heightVal = heightEl ? parseFloat(heightEl.value) || 0 : 0;

    // Determine selected data source from radio buttons; fall back to OLAF
    var dsEl = document.querySelector('input[name="dataSource"]:checked');
    var srcVal = dsEl ? dsEl.value : (typeof bmiSource !== 'undefined' ? bmiSource : 'OLAF');

    // Compute percentiles and status classes only if basic data are present
    var weightPerc = null;
    var heightPerc = null;
    var weightClass = '';
    var heightClass = '';
    if (ageYears > 0 && weightVal > 0 && heightVal > 0) {
      weightPerc = computePercentile(weightVal, sexVal, ageYears, 'WT', srcVal);
      heightPerc = computePercentile(heightVal, sexVal, ageYears, 'HT', srcVal);
      weightClass = getStatusClass(weightPerc, ageYears);
      heightClass = getStatusClass(heightPerc, ageYears);
    }

    // Format age string (e.g. "3 lata 5 mies.") if any non‑zero age
    var ageStr = '';
    if (yrs > 0 || mos > 0) {
      var yearWord;
      if (yrs === 1) {
        yearWord = 'rok';
      } else if (yrs % 10 >= 2 && yrs % 10 <= 4 && (yrs % 100 < 10 || yrs % 100 >= 20)) {
        yearWord = 'lata';
      } else {
        yearWord = 'lat';
      }
      // If months are non‑integer (due to input) round to nearest integer
      var mosInt = Math.round(mos);
      ageStr = yrs + ' ' + yearWord;
      if (mosInt > 0) {
        ageStr += ' ' + mosInt + ' mies.';
      }
    }

    // Compute body surface area (Mosteller) if weight and height available
    var bsaStr = '';
    if (weightVal > 0 && heightVal > 0) {
      var bsa = Math.sqrt((heightVal * weightVal) / 3600);
      if (!isNaN(bsa)) {
        bsaStr = bsa.toFixed(2) + ' m²';
      }
    }

    // Format percentile strings
    var weightPercStr = (weightPerc != null) ? formatCentileDisplay(weightPerc) : '';
    var heightPercStr = (heightPerc != null) ? formatCentileDisplay(heightPerc) : '';

    // Build summary lines
    var lines = [];
    if (nameVal) {
      lines.push('<div class="ms-row"><strong>' + escapeHtml(nameVal) + '</strong></div>');
    }
    if (ageStr) {
      lines.push('<div class="ms-row">Wiek: ' + escapeHtml(ageStr) + '</div>');
    }
    if (weightVal > 0) {
      var weightHtml = '<span class="result-val' + weightClass + '">' + escapeHtml(weightVal.toFixed(1).replace('.', ',')) + ' kg</span>';
      var centHtml = weightPercStr ? ' – <span class="muted">' + weightPercStr + '</span>' : '';
      lines.push('<div class="ms-row">Waga: ' + weightHtml + centHtml + '</div>');
    }
    if (heightVal > 0) {
      var heightHtml = '<span class="result-val' + heightClass + '">' + escapeHtml(heightVal.toFixed(1).replace('.', ',')) + ' cm</span>';
      var centHtmlH = heightPercStr ? ' – <span class="muted">' + heightPercStr + '</span>' : '';
      lines.push('<div class="ms-row">Wzrost: ' + heightHtml + centHtmlH + '</div>');
    }
    if (bsaStr) {
      lines.push('<div class="ms-row">Pow. ciała: ' + escapeHtml(bsaStr) + '</div>');
    }

    // Update inner HTML of the content container if present; otherwise update the mini summary itself
    var contentDiv = document.getElementById('miniSummaryContent');
    if (contentDiv) {
      contentDiv.innerHTML = lines.join('');
    } else {
      mini.innerHTML = lines.join('');
    }

    // If there is no data, always hide the summary
    var hasContent = lines.length > 0;
    if (!hasContent) {
      // On the steroid calculator page, keep the mini summary visible if the
      // steroid shortcuts have been moved into it.  Without this, the mini
      // summary would disappear when there is no patient data (e.g. weight,
      // height) even though the steroid shortcuts are present.  Check if
      // the steroid summary exists and is currently a child of the mini summary.
      var p = window.location.pathname || '';
      var fname = p.substring(p.lastIndexOf('/') + 1) || '';
      if (fname === 'steroidy.html') {
        var steroidInMini = false;
        var ster = document.getElementById('steroidSummary');
        if (ster && ster.parentElement === mini) {
          steroidInMini = true;
        }
        if (!steroidInMini) {
          mini.style.display = 'none';
        }
      } else {
        mini.style.display = 'none';
      }
    }
    // Otherwise the IntersectionObserver callback will control visibility

    // If the mini summary has been hidden (display: none) but the steroid
    // shortcut container is still inside it, move the steroid shortcuts
    // back to the appropriate sidebar.  Without this additional check,
    // there are edge cases where the IntersectionObserver may not fire
    // when scrolling back to the top of the page, leaving the steroid
    // shortcuts stuck inside a hidden mini summary.  This ensures the
    // shortcuts remain visible once the navigation menu reappears.
    try {
      var miniStyle = mini && mini.style ? mini.style.display : '';
      if (mini && miniStyle === 'none') {
        var pathname = window.location.pathname || '';
        var fnameFix = pathname.substring(pathname.lastIndexOf('/') + 1) || '';
        if (fnameFix === 'steroidy.html') {
          var sterEl = document.getElementById('steroidSummary');
          if (sterEl && sterEl.parentElement === mini) {
            if (typeof window.positionSteroidSummary === 'function') {
              window.positionSteroidSummary();
            } else {
              // Fallback positioning (duplicate of logic in IntersectionObserver)
              var lSide = document.querySelector('.desktop-layout .sidebar');
              var dSide = document.querySelector('.desktop-layout .decor-sidebar');
              var dVis = false;
              if (dSide) {
                var ds = window.getComputedStyle(dSide);
                dVis = ds && ds.display !== 'none';
              }
              if (dVis && dSide) {
                if (sterEl.parentElement !== dSide) {
                  dSide.appendChild(sterEl);
                }
              } else if (lSide) {
                var miniRef = document.getElementById('miniSummary');
                if (miniRef && miniRef.parentElement === lSide) {
                  if (sterEl.parentElement !== lSide || sterEl.nextSibling !== miniRef) {
                    lSide.insertBefore(sterEl, miniRef);
                  }
                } else {
                  if (sterEl.parentElement !== lSide) {
                    lSide.appendChild(sterEl);
                  }
                }
              }
            }
          }
        }
      }
    } catch (errReposition) {
      // ignore reposition errors
    }

    // Re-render shortcuts to ensure that WFL availability reflects the current age.
    // Without this, the disabled/enabled state of the WFL shortcut would not
    // update when the user changes age or months.  Only call if the
    // renderShortcuts function exists (it will be defined after initShortcuts).
    try {
      if (typeof renderShortcuts === 'function') {
        renderShortcuts();
      }
    } catch (ex) {
      // Ignore errors silently
    }
  }

  /**
   * Initialise the mini summary and attach observers.
   */
  function initMiniSummary() {
    // Show only on desktop (same breakpoint as sidebar)
    if (window.innerWidth < 992) return;
    var sidebar = document.querySelector('.desktop-layout .sidebar');
    if (!sidebar) return;
    // Avoid duplicate summary
    if (document.getElementById('miniSummary')) return;
    // The Liquid Glass theme loads after sidebar.css and may override
    // dropdown styling.  We define overrides directly in ios26-v2.css,
    // so no runtime injection is needed here.
    // Create the summary element
    var mini = document.createElement('div');
    mini.id = 'miniSummary';
    mini.className = 'mini-summary';
    mini.style.display = 'none';
    sidebar.appendChild(mini);
    // Create subcontainers for summary content and shortcuts
    var contentDiv = document.createElement('div');
    contentDiv.id = 'miniSummaryContent';
    mini.appendChild(contentDiv);
    var shortcutsDiv = document.createElement('div');
    shortcutsDiv.id = 'miniShortcutsContainer';
    shortcutsDiv.className = 'mini-shortcuts';
    mini.appendChild(shortcutsDiv);
    // Determine current page
    var path = window.location.pathname || '';
    var fileName = path.substring(path.lastIndexOf('/') + 1) || '';
    // On the steroid calculator page we do not use generic card shortcuts in
    // the mini summary.  Hide the shortcuts container and skip
    // initialising the shortcuts UI.  The steroid summary UI handles its
    // own shortcuts separately, and the generic mini-shortcuts would
    // duplicate them when the mini summary becomes visible.
    if (fileName === 'steroidy.html') {
      shortcutsDiv.style.display = 'none';
    } else {
      // Initialise generic shortcuts UI for other pages
      initShortcuts();
    }
    // Update contents initially
    updateMiniSummary();
    // Observe last item of the menu to toggle visibility
    var nav = sidebar.querySelector('.sidebar-nav');
    var lastItem = nav ? nav.querySelector('li:last-child') : null;
    if (lastItem && typeof IntersectionObserver !== 'undefined') {
      var observer = new IntersectionObserver(function(entries) {
        var entry = entries && entries[0];
        if (!entry) return;
        var miniEl = document.getElementById('miniSummary');
        if (!miniEl) return;
        // Determine current page
        var path = window.location.pathname;
        var file = path.substring(path.lastIndexOf('/') + 1);
        // Show summary only if it has content and the last menu item is not visible
        var navVisible = entry.isIntersecting;
        if (navVisible) {
          miniEl.style.display = 'none';
        } else {
          // Check content within the summary content container
          var contentEl = document.getElementById('miniSummaryContent');
          var hasContent = contentEl && contentEl.innerHTML.trim() !== '';
          if (hasContent) {
            miniEl.style.display = 'block';
          } else {
            miniEl.style.display = 'none';
          }
        }
        // On the steroid calculator page, integrate steroid shortcuts into the
        // mini summary when the navigation menu is hidden.  When nav is
        // not visible, the mini summary becomes visible.  We move the
        // steroid summary container inside the mini summary’s shortcut
        // container so that it scrolls along with the summary.  When nav
        // becomes visible again, we move the steroid summary back to
        // its standard sidebar location (decorative or primary sidebar).
        if (file === 'steroidy.html') {
          var steroidEl = document.getElementById('steroidSummary');
          if (steroidEl) {
            var miniEl = document.getElementById('miniSummary');
            // When the navigation (sidebar nav) is hidden (the mini summary is shown),
            // integrate the steroid shortcut list into the mini summary itself.  This
            // ensures the steroid shortcuts scroll along with the patient data on
            // the steroide page, matching the behaviour of shortcuts on other pages.
            if (!navVisible) {
              if (miniEl && steroidEl.parentElement !== miniEl) {
                // Remove from its current parent (right or left sidebar) and append
                // directly to the mini summary after its existing content.  The
                // CSS for `.mini-summary .steroid-summary` handles spacing and
                // top border to align with other summary sections.
                if (steroidEl.parentElement) {
                  steroidEl.parentElement.removeChild(steroidEl);
                }
                miniEl.appendChild(steroidEl);
              }
            } else {
              // When the navigation becomes visible again we need to move the
              // steroid shortcut container back to its normal sidebar location.
              // Do not explicitly remove the element from the mini summary here.
              // Repositioning via appendChild/insertBefore will automatically
              // detach the node from its current parent.  This avoids leaving
              // the element unattached if the positioning function is not yet
              // defined.
              if (typeof window.positionSteroidSummary === 'function') {
                window.positionSteroidSummary();
              } else {
                // Fallback positioning if the global function is not yet defined.
                var leftSidebar = document.querySelector('.desktop-layout .sidebar');
                var decorSidebar = document.querySelector('.desktop-layout .decor-sidebar');
                var decorVis = false;
                if (decorSidebar) {
                  var dsStyle = window.getComputedStyle(decorSidebar);
                  decorVis = dsStyle && dsStyle.display !== 'none';
                }
                // If the right decorative sidebar is visible, move the steroid
                // summary there.  Otherwise place it in the main sidebar.  Do
                // not remove the element first; appendChild/insertBefore will
                // handle detaching it from its previous parent.
                if (decorVis && decorSidebar) {
                  if (steroidEl.parentElement !== decorSidebar) {
                    decorSidebar.appendChild(steroidEl);
                  }
                } else if (leftSidebar) {
                  var miniRef = document.getElementById('miniSummary');
                    if (miniRef && miniRef.parentElement === leftSidebar) {
                      if (steroidEl.parentElement !== leftSidebar || steroidEl.nextSibling !== miniRef) {
                        leftSidebar.insertBefore(steroidEl, miniRef);
                      }
                    } else {
                      if (steroidEl.parentElement !== leftSidebar) {
                        leftSidebar.appendChild(steroidEl);
                      }
                    }
                }
              }
            }
          }
        }
      }, { root: null, threshold: 0 });
      observer.observe(lastItem);
    }
    // Listen to input changes on relevant fields
    var fields = ['name','age','ageMonths','weight','height','sex'];
    fields.forEach(function(id){
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', updateMiniSummary);
        el.addEventListener('change', updateMiniSummary);
      }
    });
    // Listen for changes to data source radios
    var dsRadios = document.querySelectorAll('input[name="dataSource"]');
    dsRadios.forEach(function(rad) {
      rad.addEventListener('change', updateMiniSummary);
    });
    // Also update on window resize (to recalc status classes if crossing age boundary)
    window.addEventListener('resize', function(){
      // If user resizes below desktop, hide summary; if above, update position
      if (window.innerWidth < 992) {
        var miniEl = document.getElementById('miniSummary');
        if (miniEl) {
          miniEl.style.display = 'none';
        }
      } else {
        updateMiniSummary();
      }
    });
  }

  /**
   * Shortcuts module for mini summary
   *
   * Allows the user to add up to three shortcuts to cards on the page.  Each
   * shortcut scrolls to its associated card and expands it if hidden.  The
   * shortcuts are stored in localStorage using a key based on the current
   * page filename (e.g. "shortcuts-index.html").  The list of available
   * cards is generated at runtime by scanning for elements with classes
   * ``card``, ``plan-card`` or ``result-card`` that have an ID and a
   * heading (h1–h4).  Cards that reside within the sidebar are ignored.
   */
  var shortcutMax = 3;
  var currentShortcuts = [];

  // ---- Steroid shortcuts (steroidy.html) ----
  // Number of steroid shortcut pairs allowed
  var steroidShortcutMax = 3;
  // Array of steroid shortcut objects: { id: 'src|tgt', src: 'id1', tgt: 'id2' }
  var steroidShortcuts = [];

  /**
   * Return the localStorage key for steroid shortcuts.  This key is
   * specific to the steroide page and independent of other pages.
   */
  function getSteroidShortcutStorageKey() {
    return 'shortcuts-steroidy.html';
  }

  /**
   * Load steroid shortcuts from localStorage.  Populates the
   * `steroidShortcuts` array.  If parsing fails, resets to an empty
   * array.
   */
  function loadSteroidShortcuts() {
    var key = getSteroidShortcutStorageKey();
    steroidShortcuts = [];
    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          steroidShortcuts = arr;
        }
      }
    } catch (ex) {
      steroidShortcuts = [];
    }
  }

  /**
   * Save the current steroid shortcuts to localStorage.
   */
  function saveSteroidShortcuts() {
    try {
      var key = getSteroidShortcutStorageKey();
      localStorage.setItem(key, JSON.stringify(steroidShortcuts || []));
    } catch (ex) {
      // ignore storage errors (e.g. private browsing)
    }
  }

  /**
   * Render the steroid shortcuts list UI.  Creates rows for each
   * shortcut and attaches click and remove handlers.  Shows or hides
   * the Add button depending on remaining capacity.
   */
  function renderSteroidShortcuts() {
    var list = document.getElementById('steroidShortcutList');
    var addBtn = document.getElementById('addSteroidShortcutBtn');
    if (!list || !addBtn) return;
    list.innerHTML = '';
    // Render each stored pair
    steroidShortcuts.forEach(function(pair) {
      var srcId = pair.src;
      var tgtId = pair.tgt;
      var srcDrug = (typeof getDrug === 'function') ? getDrug(srcId) : null;
      var tgtDrug = (typeof getDrug === 'function') ? getDrug(tgtId) : null;
      var srcLabel = srcDrug ? srcDrug.label : srcId;
      var tgtLabel = tgtDrug ? tgtDrug.label : tgtId;
      // Format the title as “z [src] na [tgt]”
      var title = 'z ' + srcLabel + ' na ' + tgtLabel;
      var row = document.createElement('div');
      row.className = 'shortcut-row';
      var link = document.createElement('div');
      link.className = 'shortcut-link';
      link.textContent = title;
      link.addEventListener('click', function(ev) {
        applySteroidShortcut(pair);
      });
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'shortcut-remove';
      remove.textContent = '×';
      remove.addEventListener('click', function(ev) {
        // Prevent link click when removing
        ev.stopPropagation();
        removeSteroidShortcut(pair.id);
      });
      row.appendChild(link);
      row.appendChild(remove);
      list.appendChild(row);
    });
    // Show or hide the add button based on capacity.  Use the number of
    // rendered rows rather than the raw array length to ensure the
    // button hides whenever the maximum has been reached.  This guards
    // against cases where duplicate pairs are not added but still
    // appear as distinct rows.
    var rowCount = list.children.length;
    if (rowCount >= steroidShortcutMax) {
      // Hide the add button once maximum shortcuts is reached.  Use
      // inline style to avoid interference from theme styles.
      addBtn.style.display = 'none';
    } else {
      // Reset display to default to show the button again when
      // shortcuts are removed.
      addBtn.style.display = '';
    }
  }

  /**
   * Remove a steroid shortcut by its id.  Updates storage and re-renders.
   * @param {string} id Pair identifier (format: src|tgt)
   */
  function removeSteroidShortcut(id) {
    steroidShortcuts = steroidShortcuts.filter(function(pair) {
      return pair.id !== id;
    });
    saveSteroidShortcuts();
    renderSteroidShortcuts();
  }

  /**
   * Apply a steroid shortcut: set the first source select and target
   * select to the pair values, trigger associated events, and scroll
   * the form into view.  If no dose rows exist, one will be added.
   * @param {Object} pair Shortcut object with src and tgt properties
   */
  function applySteroidShortcut(pair) {
    if (!pair) return;
    var srcId = pair.src;
    var tgtId = pair.tgt;
    // Ensure at least one dose row exists.  If none, click the add button
    var rows = document.querySelectorAll('.dose-row');
    if (!rows || rows.length === 0) {
      var addBtn = document.getElementById('addDoseBtn');
      if (addBtn) addBtn.click();
      rows = document.querySelectorAll('.dose-row');
    }
    var firstSel = document.querySelector('select.srcDrug');
    if (firstSel) {
      // Set the value and dispatch change to trigger group filtering
      firstSel.value = srcId;
      firstSel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    var tgtSel = document.getElementById('targetDrug');
    if (tgtSel) {
      // After group filter runs, set the target value.  Delay slightly to
      // allow updateGroupFilters() to repopulate the target list.
      setTimeout(function() {
        tgtSel.value = tgtId;
        tgtSel.dispatchEvent(new Event('change', { bubbles: true }));
      }, 50);
    }
    // Scroll to the form to ensure the user sees the changes
    var form = document.getElementById('calcForm');
    if (form) {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Show the pair selection panel for creating a new steroid shortcut.
   * This panel contains two select boxes: source and target.  The
   * target list is dynamically filtered based on the group of the
   * selected source.  Confirming adds a new shortcut, while Cancel
   * closes the panel.  Clicking outside the panel also closes it.
   */
  function showSteroidPairSelect() {
    var container = document.getElementById('steroidSummary');
    var addBtn = document.getElementById('addSteroidShortcutBtn');
    if (!container || !addBtn) return;
    // Prevent multiple panels
    if (document.getElementById('steroidPairPanel')) return;
    // Create panel
    var panel = document.createElement('div');
    panel.id = 'steroidPairPanel';
    panel.className = 'steroid-dropdown';
    // Row for source selection
    var row1 = document.createElement('div');
    row1.className = 'pair-row';
    var lbl1 = document.createElement('label');
    lbl1.textContent = 'Steryd źródłowy';
    lbl1.setAttribute('for', 'selectSrcDrug');
    var selSrc = document.createElement('select');
    selSrc.id = 'selectSrcDrug';
    selSrc.style.width = '100%';
    row1.appendChild(lbl1);
    row1.appendChild(selSrc);
    // Row for target selection
    var row2 = document.createElement('div');
    row2.className = 'pair-row';
    var lbl2 = document.createElement('label');
    lbl2.textContent = 'Steryd docelowy';
    lbl2.setAttribute('for', 'selectTgtDrug');
    var selTgt = document.createElement('select');
    selTgt.id = 'selectTgtDrug';
    selTgt.style.width = '100%';
    row2.appendChild(lbl2);
    row2.appendChild(selTgt);
    // Populate source list with all drugs (grouped)
    function buildOptions(sel, filterGroup) {
      sel.innerHTML = '';
      if (typeof DRUGS === 'undefined') return;
      var groups = {};
      DRUGS.forEach(function(d) {
        if (filterGroup && d.group !== filterGroup) return;
        if (!groups[d.group]) {
          var optg = document.createElement('optgroup');
          optg.label = d.group;
          groups[d.group] = optg;
        }
        var o = document.createElement('option');
        o.value = d.id;
        o.textContent = d.label;
        groups[d.group].appendChild(o);
      });
      Object.values(groups).forEach(function(g) { sel.appendChild(g); });
    }
    buildOptions(selSrc, null);
    // When source changes, populate target from same group
    selSrc.addEventListener('change', function() {
      var src = selSrc.value;
      var grp = (typeof getDrug === 'function' && getDrug(src)) ? getDrug(src).group : null;
      buildOptions(selTgt, grp);
      // Select first available target by default
      if (selTgt.options.length > 0) {
        selTgt.selectedIndex = 0;
      }
    });
    // Trigger initial target population
    selSrc.dispatchEvent(new Event('change'));
    // Action buttons
    var actions = document.createElement('div');
    actions.className = 'pair-actions';
    var confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'add-row confirm-pair';
    confirm.textContent = 'Dodaj';
    confirm.addEventListener('click', function() {
      var src = selSrc.value;
      var tgt = selTgt.value;
      if (!src || !tgt) return;
      // Compose id and ensure uniqueness
      var id = src + '|' + tgt;
      var exists = steroidShortcuts.some(function(p) { return p.id === id; });
      if (!exists && steroidShortcuts.length < steroidShortcutMax) {
        steroidShortcuts.push({ id: id, src: src, tgt: tgt });
        saveSteroidShortcuts();
        renderSteroidShortcuts();
      }
      // Close panel
      if (panel && panel.parentElement) panel.parentElement.removeChild(panel);
      addBtn.style.display = '';
      // Remove outside click handler
      document.removeEventListener('click', outsideClick, true);
    });
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'add-row cancel-pair';
    cancel.textContent = 'Anuluj';
    cancel.addEventListener('click', function() {
      if (panel && panel.parentElement) panel.parentElement.removeChild(panel);
      addBtn.style.display = '';
      document.removeEventListener('click', outsideClick, true);
    });
    actions.appendChild(confirm);
    actions.appendChild(cancel);
    // Assemble panel
    panel.appendChild(row1);
    panel.appendChild(row2);
    panel.appendChild(actions);
    container.insertBefore(panel, addBtn.nextSibling);
    // Hide add button while panel is open
    addBtn.style.display = 'none';
    // Outside click handler to close panel
    function outsideClick(ev) {
      if (!panel || !panel.parentElement) {
        document.removeEventListener('click', outsideClick, true);
        return;
      }
      // Ignore clicks inside the panel
      if (panel.contains(ev.target)) return;
      // Ignore clicks on the add button (should be hidden anyway)
      if (ev.target === addBtn) return;
      // Remove panel and show button
      if (panel.parentElement) panel.parentElement.removeChild(panel);
      addBtn.style.display = '';
      document.removeEventListener('click', outsideClick, true);
    }
    setTimeout(function() {
      document.addEventListener('click', outsideClick, true);
    }, 0);
  }

  /**
   * Initialise steroid shortcuts.  This function runs only on
   * steroide.html when the screen is sufficiently wide for the
   * sidebar.  It creates the shortcut container below the menu,
   * loads stored pairs and renders them.
   */
  function initSteroidShortcuts() {
    // Only apply on steroide page
    var path = window.location.pathname;
    var file = path.substring(path.lastIndexOf('/') + 1);
    if (file !== 'steroidy.html') return;
    // Only show on desktop
    if (window.innerWidth < 992) return;
    var sidebar = document.querySelector('.desktop-layout .sidebar');
    if (!sidebar) return;
    // Avoid duplicates
    if (document.getElementById('steroidSummary')) return;
    // Create container
    var container = document.createElement('div');
    container.id = 'steroidSummary';
    container.className = 'steroid-summary';
    // Info text
    var info = document.createElement('div');
    info.className = 'shortcut-info';
    info.textContent = 'Można dodać maksymalnie 3 skróty. Skróty pozwalają szybko ustawić przeliczenia sterydów (źródłowy → docelowy).';
    container.appendChild(info);
    // List container
    var list = document.createElement('div');
    list.id = 'steroidShortcutList';
    list.className = 'steroid-shortcuts';
    container.appendChild(list);
    // Add button
    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.id = 'addSteroidShortcutBtn';
    addBtn.className = 'add-shortcut-btn';
    addBtn.textContent = 'Dodaj skrót';
    addBtn.addEventListener('click', showSteroidPairSelect);
    container.appendChild(addBtn);
    // Append after sidebar nav
    var nav = sidebar.querySelector('.sidebar-nav');
    if (nav && nav.parentElement === sidebar) {
      nav.parentElement.appendChild(container);
    } else {
      sidebar.appendChild(container);
    }
    // Load and render shortcuts
    loadSteroidShortcuts();
    renderSteroidShortcuts();

    // Position the steroid summary in the appropriate sidebar (left or right).
    function positionSteroidSummary() {
      var cont = document.getElementById('steroidSummary');
      if (!cont) return;
      // Right decorative sidebar (visible on very wide screens)
      var decor = document.querySelector('.desktop-layout .decor-sidebar');
      // Left sidebar (primary navigation)
      var side = document.querySelector('.desktop-layout .sidebar');
      // Determine if the right sidebar is visible via CSS display property
      var decorVisible = false;
      if (decor) {
        var style = window.getComputedStyle(decor);
        decorVisible = style && style.display !== 'none';
      }
      if (decorVisible && decor) {
        // Move to right sidebar if not already there
        if (cont.parentElement !== decor) {
          decor.appendChild(cont);
        }
      } else {
        // Otherwise attach to left sidebar.  Insert before the mini summary
        // if present to avoid falling under it when the mini summary becomes
        // visible (on steroide.html scrolling).
        if (side) {
          var miniEl = document.getElementById('miniSummary');
          if (miniEl && miniEl.parentElement === side) {
            if (cont.parentElement !== side || cont.nextSibling !== miniEl) {
              side.insertBefore(cont, miniEl);
            }
          } else {
            if (cont.parentElement !== side) {
              side.appendChild(cont);
            }
          }
        }
      }
    }
    // Call once to position initially
    positionSteroidSummary();
    // Reposition on resize events
    window.addEventListener('resize', positionSteroidSummary);

    // Expose the positioning function globally so it can be invoked
    // from the IntersectionObserver callback in initMiniSummary.  The
    // steroid page requires moving the shortcut container between
    // different parents (decor sidebar, left sidebar) depending on
    // screen width and navigation visibility.  Attaching the
    // function to window avoids repeated duplication of the logic.
    window.positionSteroidSummary = positionSteroidSummary;
  }

  /**
   * Show a temporary notification indicating that the steroid
   * calculation results have been refreshed automatically.  A small
   * toast appears in the bottom-right corner of the viewport and
   * fades out after a short delay.  If a toast already exists, its
   * message and opacity are reset.  Styling is applied inline to
   * avoid reliance on external CSS files and to ensure the toast
   * remains visible regardless of the current theme (e.g. Liquid Glass).
   */
  function showAutoCalcNotification() {
    var id = 'steroidAutoToast';
    var toast = document.getElementById(id);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = id;
      toast.className = 'auto-toast';
      // Base positioning: fixed at bottom‑right with high z‑index
      toast.style.position = 'fixed';
      toast.style.bottom = '1rem';
      toast.style.right = '1rem';
      toast.style.zIndex = '9999';
      // Visual appearance similar to other cards
      toast.style.background = 'var(--card)';
      toast.style.border = '1px solid #d0dede';
      toast.style.padding = '0.5rem 1rem';
      toast.style.borderRadius = 'var(--radius)';
      toast.style.boxShadow = 'var(--shadow)';
      toast.style.fontSize = '0.9rem';
      toast.style.color = '#000';
      // Disable interactions to avoid intercepting clicks
      toast.style.pointerEvents = 'none';
      document.body.appendChild(toast);
    }
    // Reset message and opacity
    toast.textContent = 'Wynik został zaktualizowany';
    toast.style.opacity = '1';
    toast.style.transition = '';
    // Schedule fade out after a delay
    setTimeout(function() {
      if (!toast) return;
      toast.style.transition = 'opacity 0.5s';
      toast.style.opacity = '0';
    }, 2500);
  }

  /**
   * Initialise automatic recalculation for the steroid calculator.  On
   * the steroide page, attach input and change listeners to the
   * calculation form.  After any change, schedule the form to be
   * submitted automatically after a short delay.  When the form
   * submission is dispatched, a non-blocking notification toast is
   * displayed to inform the user that the result has been updated.
   */
  function initSteroidAutoCalc() {
    var path = window.location.pathname;
    var file = path.substring(path.lastIndexOf('/') + 1);
    if (file !== 'steroidy.html') return;
    var form = document.getElementById('calcForm');
    if (!form) return;
    // Hide the manual submit button on the steroid calculator since auto
    // recalculation is enabled.  We select the submit button by type
    // within the calculation form and hide it.  This is done only on
    // steroide.html.
    var submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.style.display = 'none';
    }
    var timer = null;
    function schedule() {
      // Clear any pending timer
      if (timer) clearTimeout(timer);
      timer = setTimeout(function() {
        // Attempt to dispatch submit event and show notification
        try {
          var ev = new Event('submit', { bubbles: true, cancelable: true });
          form.dispatchEvent(ev);
          // Show toast only if results section is visible (i.e. calculation succeeded)
          var resultsSec = document.getElementById('results');
          if (resultsSec && resultsSec.style.display !== 'none') {
            showAutoCalcNotification();
          }
        } catch (e) {
          // ignore errors (e.g. invalid input triggers alert)
        }
      }, 400);
    }
    // Attach listeners to capture user input
    // Use capture phase to ensure we catch events before other handlers
    form.addEventListener('input', schedule, true);
    form.addEventListener('change', schedule, true);
  }

  // Determine the localStorage key for the current page
  function getShortcutStorageKey() {
    var path = window.location.pathname;
    var file = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    return 'shortcuts-' + file;
  }

  // Load shortcuts from localStorage
  function loadShortcuts() {
    var key = getShortcutStorageKey();
    try {
      var data = localStorage.getItem(key);
      if (data) {
        var arr = JSON.parse(data);
        if (Array.isArray(arr)) {
          currentShortcuts = arr;
        }
      }
    } catch (e) {
      // ignore parse errors
    }
  }

  // Save shortcuts to localStorage
  function saveShortcuts() {
    var key = getShortcutStorageKey();
    try {
      localStorage.setItem(key, JSON.stringify(currentShortcuts));
    } catch (e) {
      // localStorage may be unavailable (private mode); ignore
    }
  }

  // Compute available cards for shortcuts.  Each entry has an id and a title.
  // The list of cards is filtered per page to avoid offering shortcuts to
  // elements that are irrelevant on the current subpage.  On DocPro the
  // general result cards from the home page are hidden via CSS but still
  // present in the DOM.  Those should not appear in the dropdown.  We also
  // assign stable IDs to cards that lack one (e.g. GH test cards) using a
  // slugified version of their title.  This ensures that saved shortcuts
  // remain valid across reloads.  For DocPro we also treat <strong> tags
  // inside GH/OGTT/ACTH cards as headings.
  function computeAvailableCards() {
    var results = [];
    // Determine current file name (e.g. index.html, docpro.html).  If the
    // pathname ends with a slash (e.g. index), default to index.html.
    var path = window.location.pathname;
    var file = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

    // Helper to slugify a string into a safe identifier.  Converts to
    // lowercase, replaces Polish diacritics with ASCII equivalents, and
    // replaces any non‑alphanumeric characters with dashes.  Leading and
    // trailing dashes are trimmed.  If the slug is empty, returns null.
    function slugify(str) {
      if (!str) return null;
      var map = {
        'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ż':'z','ź':'z',
        'Ą':'a','Ć':'c','Ę':'e','Ł':'l','Ń':'n','Ó':'o','Ś':'s','Ż':'z','Ź':'z'
      };
      var slug = '';
      for (var i = 0; i < str.length; i++) {
        var ch = str[i];
        slug += map[ch] || ch;
      }
      slug = slug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        // Trim leading/trailing dashes
        .replace(/^-+|-+$/g, '');
      return slug || null;
    }

    // Determine which elements to inspect for headings.  By default we
    // include all cards/plan/result elements.  On the DocPro page we
    // restrict the list to GH/OGTT/ACTH test cards and the top‐level
    // professional module card.  This prevents shortcuts from being
    // created to general BMI/BMR/WFL cards that are irrelevant on
    // DocPro.
    var nodes;
    // When on the kidney clearance calculator page, build shortcuts from
    // the list of supported formulas rather than scanning DOM cards.  The
    // calculator defines a global array ALL_FORMS_SORTED (populated by
    // populateFormulaPicker) containing objects with id and label fields.  We
    // include every formula regardless of version, sorted alphabetically by
    // label.  Clicking a shortcut will highlight the required input fields
    // for that formula instead of scrolling to a DOM element.
    if (file === 'kalkulator-klirens.html') {
      try {
        var list = [];
        // Prefer the globally sorted list if available; fall back to
        // FORMULAS if exported globally.  Both contain objects with
        // id (formula id) and label (human‑readable name) properties.
        var source = null;
        if (Array.isArray(window.ALL_FORMS_SORTED) && window.ALL_FORMS_SORTED.length) {
          source = window.ALL_FORMS_SORTED;
        } else if (Array.isArray(window.FORMULAS) && window.FORMULAS.length) {
          source = window.FORMULAS;
        }
        if (source) {
          // Sort the formulas by label using Polish locale to match the
          // application’s alphabetical ordering.
          var sorted = source.slice().sort(function(a, b) {
            return (a.label || '').localeCompare(b.label || '', 'pl', { sensitivity: 'base' });
          });
          sorted.forEach(function(f) {
            if (f && f.id && f.label) {
              list.push({ id: f.id, title: f.label });
            }
          });
        } else {
          // Fallback: extract options from the formula picker if available.
          var picker = document.getElementById('formulaPicker');
          if (picker && picker.options) {
            var opts = [];
            for (var i = 0; i < picker.options.length; i++) {
              var opt = picker.options[i];
              var val = opt.value;
              var text = opt.textContent || opt.innerText;
              if (val && !opt.disabled && text) {
                opts.push({ id: val, title: text.trim() });
              }
            }
            // Sort extracted options alphabetically
            opts.sort(function(a, b) {
              return (a.title || '').localeCompare(b.title || '', 'pl', { sensitivity: 'base' });
            });
            list = opts;
          }
        }
        return list;
      } catch (e) {
        // In case of error (e.g. formulas not yet loaded), fall back to an empty list
        return [];
      }
    }
    if (file === 'docpro.html') {
      // On the DocPro page we offer shortcuts to endocrine test cards as well as
      // specific therapy/calculator modules.  We intentionally exclude the
      // overarching professional module card ("Moduł profesjonalny") and other
      // general results from the home page.  Start with all GH/OGTT/ACTH test
      // cards.  These cards are created in the DOM at page load but are
      // hidden until the appropriate toggle is clicked.
      nodes = Array.from(document.querySelectorAll('.gh-test-card'));
      // Next, manually add the IDs of additional modules.  Each module has a
      // hidden card and/or a toggle button; we add the card IDs so that
      // shortcuts scroll to the associated content.  The corresponding
      // toggles will be handled in gotoCard via findToggleForCard.
      var extras = [];
      // Bisphosphonate therapy card
      var bis = document.getElementById('bisphosCard');
      if (bis) extras.push(bis);
      // Z‑score calculator card (batch mode)
      var zs = document.getElementById('zscoreCard');
      if (zs) extras.push(zs);
      // Antibiotic therapy card (may be injected later; still push a stub
      // placeholder node with the expected ID so that the dropdown lists it).
      var abx = document.getElementById('antibioticTherapyCard');
      if (!abx) {
        // Create a dummy element to carry the ID and title; it will not be
        // appended to the DOM but allows slug generation to proceed.  A
        // heading property is added below.
        abx = document.createElement('div');
        abx.id = 'antibioticTherapyCard';
        var strong = document.createElement('strong');
        strong.textContent = 'Antybiotykoterapia';
        abx.appendChild(strong);
      }
      extras.push(abx);
      // IGF therapy is represented by a toggle button rather than a card.  We
      // include the button itself in the list so that users can create a
      // shortcut to the treatment section.  The title is derived below.
      var igfBtn = document.getElementById('toggleIgfTests');
      if (igfBtn) extras.push(igfBtn);
      nodes = nodes.concat(extras);
    } else {
      // For other pages include all cards/plan/result elements.  This covers
      // index.html and other potential pages.  Cards inside the sidebar are
      // ignored below.
      nodes = Array.from(document.querySelectorAll('.card, .plan-card, .result-card'));
    }
    nodes.forEach(function(node) {
      // Skip anything inside the sidebar
      if (node.closest && node.closest('.sidebar')) return;
      // For DocPro, ignore nodes that are general summary cards (prev/current)
      if (file === 'docpro.html') {
        if (node.id && /summarycard/i.test(node.id)) return;
      }
      // Determine a heading.  For standard cards use h1–h5; for DocPro test
      // cards and our extra modules, allow <strong> or use the element's
      // own textContent if it is a button.  This yields titles for
      // buttons like toggleIgfTests.
      var heading = node.querySelector ? node.querySelector('h1, h2, h3, h4, h5') : null;
      if (!heading && file === 'docpro.html') {
        heading = node.querySelector ? node.querySelector('strong') : null;
      }
      var title = '';
      if (heading) {
        // Use textContent but trim any nested subtitles.  The subhead is
        // wrapped in a span with class "subhead", so we exclude its
        // text when building the title.  If there are no spans, use
        // the full textContent.
        var cloned = heading.cloneNode(true);
        // Remove any span.subhead children to avoid including the
        // explanatory parentheses in the title.  This allows us to
        // create concise titles like "Spalanie kalorii" instead of
        // "Spalanie kalorii (czyli ile czasu …)".
        var subheads = cloned.querySelectorAll('span.subhead');
        subheads.forEach(function(el) { el.parentNode.removeChild(el); });
        title = cloned.textContent.trim();
      } else if (node.tagName && node.tagName.toLowerCase() === 'button') {
        title = node.textContent.trim();
      } else if (node.id === 'antibioticTherapyCard') {
        title = 'Antybiotykoterapia';
      }
      if (!title) return;
      var id = node.id;
      // If the node lacks an id, generate a stable slug based on the title
      if (!id) {
        var slug = slugify(title);
        if (!slug) return;
        var candidate = slug;
        var counter = 1;
        while (document.getElementById(candidate)) {
          candidate = slug + '-' + counter;
          counter++;
        }
        node.id = candidate;
        id = candidate;
      }
      // Skip the professionalModule on DocPro (user request)
      if (file === 'docpro.html' && id === 'professionalModule') return;

      // On index.html exclude certain cards that should not appear as shortcuts.
      if (file === 'index.html') {
        var excludedTitles = [
          'Ostatni pomiar',
          'Podsumowanie wyników',
          'Moduł profesjonalny',
          'Wybrana dieta'
        ];
        // Exclude by title match (case‑sensitive) or by id if known
        if (excludedTitles.indexOf(title) !== -1) {
          return;
        }
        // Special case: for the "Obwód głowy i klatki piersiowej" module use the toggle
        // button id as the target rather than the hidden card id.  This ensures that
        // the shortcut scrolls to the button and expands the card via a simple
        // click.  It also avoids storing the hidden card id in localStorage,
        // which would require custom handling to reveal the section.
        if (id === 'circCard') {
          results.push({ id: 'toggleCircSection', title: title });
          return;
        }

        // Special case: shorten long titles for calorie cards.  The
        // "timesCard" displays calorie-burning times with a subhead
        // explaining the meaning, and "totalCard" shows total caloric
        // intake with a subhead.  For the shortcuts menu we use
        // concise labels without parentheses as requested by the user.
        if (id === 'timesCard') {
          title = 'Spalanie kalorii';
        } else if (id === 'totalCard') {
          title = 'Łączna kaloryczność';
        }
      }
      results.push({ id: id, title: title });
    });
    return results;
  }

  // Attempt to find a toggle button for a given card.  Many cards are
  // controlled by a button whose id begins with "toggle" followed by
  // a variant of the card id (e.g. toggleIntakeCard toggles #intakeCard).
  function findToggleForCard(cardId) {
    // Special mappings for DocPro modules that do not follow the standard
    // naming convention.  These buttons control cards whose IDs are
    // unrelated to their toggles.
    if (cardId === 'antibioticTherapyCard') {
      return 'toggleAbxTherapy';
    }
    if (cardId === 'zscoreCard') {
      return 'toggleZscore';
    }
    if (cardId === 'bisphosCard') {
      return 'toggleBisphos';
    }
    // Special mapping for the head/chest circumference card on the home page.
    // The card id circCard is controlled by toggleCircSection rather than
    // following the naming convention.  Without this mapping the shortcut
    // would not expand the card when selected.  We support both the actual
    // element ID (circCard) and its slugified form (obwod-glowy-i-klatki-piersiowej)
    // in case the node lacks an id and a slug was generated.
    if (cardId === 'circCard' || cardId === 'obwod-glowy-i-klatki-piersiowej') {
      return 'toggleCircSection';
    }
    // If a user saved a shortcut directly to a toggle button (e.g. toggleIgfTests),
    // we treat the element itself as the activator and do not attempt to find
    // another toggle.  In such cases we return null to signal that gotoCard
    // should handle it specially.
    if (/^toggle/.test(cardId)) {
      return null;
    }

    var candidates = [];
    // Convert kebab-case to camelCase and capitalise first letter
    var camel = cardId.replace(/[-_](.)/g, function(_, ch) { return ch.toUpperCase(); });
    var base = camel.charAt(0).toUpperCase() + camel.slice(1);
    // Try direct match (toggle + Base)
    candidates.push('toggle' + base);
    // If base ends with common suffixes, try without them
    ['Card', 'Form', 'Section', 'Container', 'Box'].forEach(function(suffix) {
      if (base.endsWith(suffix)) {
        var trimmed = base.slice(0, -suffix.length);
        if (trimmed) {
          candidates.push('toggle' + trimmed);
          candidates.push('toggle' + trimmed + 'Card');
        }
      }
    });
    // Also try toggle + base + 'Card'
    candidates.push('toggle' + base + 'Card');
    for (var i = 0; i < candidates.length; i++) {
      var id = candidates[i];
      var btn = document.getElementById(id);
      if (btn && btn.tagName.toLowerCase() === 'button') {
        return id;
      }
    }
    return null;
  }

  // Scroll to the specified card and expand it if hidden
  function gotoCard(cardId) {
    var el = document.getElementById(cardId);
    // Detect the current page to support formula shortcuts on the creatinine clearance calculator.
    var pathname = window.location.pathname;
    var fileName = pathname.substring(pathname.lastIndexOf('/') + 1) || 'index.html';
    // On the klirens calculator page the "cardId" may refer to a formula rather than a DOM element.
    // If no element exists with the given id and the page matches, attempt to highlight the
    // corresponding formula fields.  The formula definitions are available in
    // window.ALL_FORMS_SORTED (preferred) or window.FORMULAS.  We set the
    // calculator version accordingly and then call highlightFields to mark
    // required inputs.  For the KT/V formula we also enable the advanced
    // KT/V fields toggle.
    if (!el && fileName === 'kalkulator-klirens.html') {
      try {
        var list2 = null;
        if (Array.isArray(window.ALL_FORMS_SORTED) && window.ALL_FORMS_SORTED.length) {
          list2 = window.ALL_FORMS_SORTED;
        } else if (Array.isArray(window.FORMULAS) && window.FORMULAS.length) {
          list2 = window.FORMULAS;
        }
        if (list2) {
          var formula = list2.find(function(f) { return f && f.id === cardId; });
          if (formula) {
            // Determine target version (basic, advanced, spot or pro) and apply it.
            var targetVer = formula.version || 'basic';
            // Special handling for KT/V: always require pro version and enable
            // advanced KT/V fields via ktvToggle.
            if (formula.id === 'KTV') {
              targetVer = 'pro';
            }
            var applied = false;
            // Attempt to apply the version via applyVersion if available.
            if (typeof window.applyVersion === 'function') {
              try {
                window.applyVersion(targetVer);
                applied = true;
              } catch (er) {
                applied = false;
              }
            }
            if (!applied) {
              try {
                if (typeof window.setVersion === 'function') {
                  window.setVersion(targetVer);
                  applied = true;
                }
              } catch (er2) {
                applied = false;
              }
            }
            if (!applied) {
              var btnVers = document.querySelector('.version-option[data-version="' + targetVer + '"]');
              if (btnVers && !btnVers.classList.contains('selected')) {
                try { btnVers.click(); applied = true; } catch (_) {}
              }
            }
            // For KT/V formulas ensure the KT/V advanced toggle is enabled.
            if (formula.id === 'KTV') {
              var advToggle = document.getElementById('ktvToggle');
              if (advToggle && !advToggle.checked) {
                advToggle.checked = true;
              }
            }
            // Highlight required fields after a short delay to allow UI to update.
            setTimeout(function() {
              try {
                if (typeof window.highlightFields === 'function') {
                  window.highlightFields(formula, true);
                }
              } catch (er3) {}
            }, 100);
            return;
          }
        }
      } catch (er0) {
        // Ignore errors and fall through if formula lookup fails
      }
    }
    if (!el) return;
    // Special handling for Down Syndrome calculations on the home page.  The
    // Down Syndrome section is entirely hidden by default (both the
    // wrapper and the card).  When navigating via a shortcut we need
    // to ensure that the wrapper is shown and the card expanded before
    // scrolling.  Without this, clicking the shortcut does nothing.
    if (cardId === 'downSyndromeCard') {
      // Ensure the containing section is visible
      var dsSection = document.getElementById('downSyndromeSection');
      if (dsSection && dsSection.style.display === 'none') {
        dsSection.style.display = 'block';
      }
      // Expand the card if hidden by clicking its toggle button
      var dsCard = document.getElementById('downSyndromeCard');
      var toggleDs = document.getElementById('toggleDownSyndrome');
      if (dsCard && toggleDs) {
        var styleDs = window.getComputedStyle(dsCard);
        var hiddenDs = (styleDs.display === 'none' || dsCard.offsetHeight === 0);
        if (hiddenDs) {
          toggleDs.click();
        }
        // Scroll to the card after expansion
        setTimeout(function() {
          try {
            dsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch (e) {
            dsCard.scrollIntoView(true);
          }
        }, 150);
      }
      return;
    }

    // Special handling for the head/chest circumference module on the home page.
    // The module is hidden by default and controlled by a custom toggle button
    // (toggleCircSection).  Regardless of whether the card ID, slug or toggle
    // itself was saved as the shortcut, we perform the same expansion and
    // scroll logic.  This check catches cardId equal to circCard, its slug,
    // the toggle ID directly, or any id containing "obwod" or "circ".
    {
      var lcId = (cardId || '').toLowerCase();
      var isCircModule = false;
      if (cardId === 'circCard' || cardId === 'obwod-glowy-i-klatki-piersiowej' || cardId === 'toggleCircSection') {
        isCircModule = true;
      }
      // Additional fuzzy matching: if the id itself contains fragments like
      // "circ" or "obwod", treat it as the circumference module.  This
      // ensures that even unknown ids or slugs created from the title
      // correctly activate the module.
      if (!isCircModule && (lcId.indexOf('circ') !== -1 || lcId.indexOf('obwod') !== -1)) {
        isCircModule = true;
      }
      if (isCircModule) {
        var circToggle2 = document.getElementById('toggleCircSection');
        // Scroll to toggle first
        if (circToggle2) {
          try {
            circToggle2.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch (e) {
            circToggle2.scrollIntoView(true);
          }
          // Click toggle to reveal the card
          circToggle2.click();
        }
        // After toggling, scroll to the card
        setTimeout(function() {
          var cardEl2 = document.getElementById('circCard');
          if (cardEl2) {
            try {
              cardEl2.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch (e3) {
              cardEl2.scrollIntoView(true);
            }
          } else if (circToggle2) {
            try {
              circToggle2.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch (e4) {
              circToggle2.scrollIntoView(true);
            }
          }
        }, 200);
        return;
      }
    }
    // If the target element is a button, simply click it and scroll to it.
    // Special case: if the button is the circumference toggle, also scroll
    // to the associated card after expansion.  This ensures that the user
    // lands on the content rather than the button itself.
    if (el.tagName && el.tagName.toLowerCase() === 'button') {
      // For buttons, scroll to the button before clicking so that it is visible
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        el.scrollIntoView(true);
      }
      // Click the toggle to reveal its associated card/section
      el.click();
      // Determine if this is the circumference toggle
      if (cardId === 'toggleCircSection') {
        // After a short delay, scroll to the actual circumference card if it exists;
        // otherwise scroll back to the toggle.  The delay gives the UI time to expand.
        setTimeout(function() {
          var circCardEl2 = document.getElementById('circCard');
          if (circCardEl2) {
            try {
              circCardEl2.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch (err) {
              circCardEl2.scrollIntoView(true);
            }
          } else {
            try {
              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch (e) {
              el.scrollIntoView(true);
            }
          }
        }, 200);
      } else {
        // For other buttons, simply ensure the button remains in view after click
        setTimeout(function() {
          try {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch (e) {
            el.scrollIntoView(true);
          }
        }, 100);
      }
      return;
    }
    // On the DocPro page, test cards reside inside nested lists.  If the
    // destination is a GH/OGTT/ACTH test card we need to ensure that the
    // relevant toggle buttons are activated before scrolling.  We also
    // open the general endocrine tests section.  Determine the group by
    // checking the card's ancestors.  Use try/catch to guard against
    // missing wrappers.
    var path = window.location.pathname;
    var file = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    if (file === 'docpro.html' && el.classList.contains('gh-test-card')) {
      // Ensure the endocrine tests section is visible
      var endoBtn = document.getElementById('toggleEndoTests');
      if (endoBtn && endoBtn.offsetParent === null) {
        // The wrapper might be hidden; still click to attempt to open
        endoBtn.click();
      } else if (endoBtn) {
        endoBtn.click();
      }
      // Determine specific group (GH, OGTT, ACTH) by examining parent id
      var groupBtn = null;
      var parent = el.parentElement;
      while (parent) {
        var pid = parent.id;
        if (pid === 'ghTestsLeft' || pid === 'ghTestsRight') {
          groupBtn = document.getElementById('toggleGhTests');
          break;
        }
        if (pid === 'ogttTestsLeft' || pid === 'ogttTestsRight') {
          groupBtn = document.getElementById('toggleOgttTests');
          break;
        }
        if (pid === 'acthTestsLeft' || pid === 'acthTestsRight') {
          groupBtn = document.getElementById('toggleActhTests');
          break;
        }
        parent = parent.parentElement;
      }
      if (groupBtn) {
        groupBtn.click();
      }
    }
    // Expand the card if hidden by clicking its toggle.  For special
    // mappings the toggle ID may be provided via findToggleForCard.
    var style = window.getComputedStyle(el);
    var hidden = (style.display === 'none' || el.offsetHeight === 0);
    if (hidden) {
      var toggleId = findToggleForCard(cardId);
      if (toggleId) {
        var btn2 = document.getElementById(toggleId);
        if (btn2) {
          btn2.click();
        }
      }
    }
    // Scroll after a small delay to allow expansion
    setTimeout(function() {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        el.scrollIntoView(true);
      }
    }, 150);
  }

  // Render the list of current shortcuts in the UI
  function renderShortcuts() {
    var listEl = document.getElementById('shortcutList');
    if (!listEl) return;
    // Clear current items
    listEl.innerHTML = '';
    // Build map of available cards for title lookup
    var avail = computeAvailableCards();
    var lookup = {};
    avail.forEach(function(item) {
      lookup[item.id] = item;
    });
    // Read current age in years to determine WFL availability
    var ageYears = 0;
    try {
      var yearsEl  = document.getElementById('age');
      var monthsEl = document.getElementById('ageMonths');
      var yrs = yearsEl ? parseFloat(yearsEl.value) || 0 : 0;
      var mos = monthsEl ? parseFloat(monthsEl.value) || 0 : 0;
      ageYears = yrs + (mos / 12);
    } catch (ex) {
      ageYears = 0;
    }
    // Create each shortcut
    currentShortcuts.forEach(function(cid) {
      var info = lookup[cid] || { id: cid, title: cid };
      var row = document.createElement('div');
      row.className = 'shortcut-row';
      // Shortcut link
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shortcut-link';
      btn.textContent = info.title;
      // Determine if this shortcut should be disabled (WFL over age > 2)
      var isWfl = false;
      if (cid === 'wflCard' || (info.title && info.title.toLowerCase().includes('wfl'))) {
        isWfl = true;
      }
      var tooltipText;
      if (isWfl && ageYears > 2) {
        // Mark as disabled: grey text and provide a tooltip.  Do not attach a
        // click handler so that clicking does nothing, but leave pointer
        // events enabled so the browser can display the title tooltip on hover.
        btn.classList.add('disabled-shortcut');
        tooltipText = 'Ta pozycja jest dostępna tylko przy wieku użytkownika poniżej 2 lat';
        // Apply the tooltip to both the button and its row container.  Some
        // browsers may not show the title when hovering over nested flex
        // elements; duplicating it on the row improves reliability.
        btn.title = tooltipText;
        row.title = tooltipText;
      }
      row.appendChild(btn);
      // Remove button (always active)
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'shortcut-remove';
      remove.setAttribute('aria-label', 'Usuń skrót');
      remove.textContent = '×';
      remove.addEventListener('click', function(e) {
        e.stopPropagation();
        removeShortcut(cid);
      });
      row.appendChild(remove);
      // Attach a single click handler to the row rather than only the label.
      // This makes the entire row clickable except for the remove button.  When
      // the shortcut is disabled, clicking the row does nothing.  When
      // active, it navigates to the associated card.
      row.addEventListener('click', function(e) {
        // Ignore clicks on the remove button
        if (e.target && e.target.classList.contains('shortcut-remove')) {
          return;
        }
        if (isWfl && ageYears > 2) {
          // Disabled: do nothing
          return;
        }
        gotoCard(cid);
      });
      listEl.appendChild(row);
    });
    // Update visibility of Add button
    var addBtn = document.getElementById('addShortcutBtn');
    if (addBtn) {
      if (currentShortcuts.length >= shortcutMax) {
        addBtn.style.display = 'none';
      } else {
        addBtn.style.display = '';
      }
    }
  }

  // Remove a shortcut and update storage
  function removeShortcut(cardId) {
    var idx = currentShortcuts.indexOf(cardId);
    if (idx >= 0) {
      currentShortcuts.splice(idx, 1);
      saveShortcuts();
      renderShortcuts();
    }
  }

  // Add a new shortcut
  function addShortcut(cardId) {
    if (!cardId) return;
    if (currentShortcuts.indexOf(cardId) >= 0) return;
    if (currentShortcuts.length >= shortcutMax) return;
    currentShortcuts.push(cardId);
    saveShortcuts();
    renderShortcuts();
  }

  // Show the dropdown list for adding a shortcut
  function showShortcutSelect() {
    var addBtn   = document.getElementById('addShortcutBtn');
    var container = document.getElementById('miniShortcutsContainer');
    if (!addBtn || !container) return;
    // Remove any existing dropdown
    var existingDropdown = document.getElementById('shortcutDropdown');
    if (existingDropdown) {
      existingDropdown.parentElement.removeChild(existingDropdown);
    }
    // Compute available items (cards or formulas depending on page)
    var list = [];
    try {
      list = computeAvailableCards();
    } catch (ex) {
      list = [];
    }
    // Filter out items that are already added
    var options = list.filter(function(item) {
      return currentShortcuts.indexOf(item.id) === -1;
    });
    // If no options remain, do nothing
    if (!options.length) return;
    // Build a custom dropdown using divs so we can control spacing and wrapping
    var dd = document.createElement('div');
    dd.id = 'shortcutDropdown';
    dd.className = 'shortcut-dropdown';
    // Apply inline styles to ensure the dropdown always has a solid white
    // background and no backdrop blur, regardless of theme CSS.  Inline
    // styles take precedence over most external rules unless those rules
    // also specify !important.  We avoid !important here because the
    // Liquid Glass theme does not mark the dropdown background as important.
    dd.style.background = '#ffffff';
    dd.style.backdropFilter = 'none';
    dd.style.webkitBackdropFilter = 'none';
    options.forEach(function(item) {
      var optDiv = document.createElement('div');
      optDiv.className = 'shortcut-option';
      optDiv.textContent = item.title;
      optDiv.dataset.id = item.id;
      // Allow long titles to wrap instead of being truncated
      optDiv.style.whiteSpace = 'normal';
      optDiv.style.wordBreak = 'break-word';
      optDiv.addEventListener('click', function() {
        addShortcut(item.id);
        // Remove dropdown after selection
        var drop = document.getElementById('shortcutDropdown');
        if (drop) drop.parentElement.removeChild(drop);
        // Restore the add button if we still have capacity
        if (currentShortcuts.length < shortcutMax) {
          addBtn.style.display = '';
        }
        // Remove outside click handler since the dropdown is gone
        if (typeof outsideClickHandler === 'function') {
          document.removeEventListener('click', outsideClickHandler, true);
        }
      });
      dd.appendChild(optDiv);
    });
    // Add a cancel option so the user can close the dropdown without adding a shortcut
    var cancelRow = document.createElement('div');
    cancelRow.className = 'shortcut-option cancel-option';
    cancelRow.textContent = 'Anuluj';
    cancelRow.addEventListener('click', function() {
      var drop = document.getElementById('shortcutDropdown');
      if (drop) drop.parentElement.removeChild(drop);
      addBtn.style.display = '';
      // Remove outside click handler when closing via cancel
      if (typeof outsideClickHandler === 'function') {
        document.removeEventListener('click', outsideClickHandler, true);
      }
    });
    dd.appendChild(cancelRow);
    // Insert the dropdown after the add button
    container.insertBefore(dd, addBtn.nextSibling);
    // Hide the add button while the dropdown is open
    addBtn.style.display = 'none';

    // Close the dropdown when clicking anywhere outside of it.  We attach
    // this handler after a short delay to avoid capturing the click that
    // triggered the dropdown to open.  By registering the listener in
    // the capture phase (third argument `true`), we ensure it fires
    // before other handlers and catches clicks even if they occur deep
    // within nested elements.  Once a click outside the dropdown is
    // detected, the dropdown is removed and the add button is shown
    // again.  The handler is cleaned up automatically in all
    // closure paths (selection, cancel, or outside click).
    var outsideClickHandler;
    outsideClickHandler = function(ev) {
      var drop = document.getElementById('shortcutDropdown');
      // If the dropdown has already been removed, unregister the handler.
      if (!drop) {
        document.removeEventListener('click', outsideClickHandler, true);
        return;
      }
      // Ignore clicks on the dropdown itself (or within it) so that
      // selecting an option doesn’t immediately close the list.
      if (drop.contains(ev.target)) {
        return;
      }
      // Also ignore the click if it’s on the “Add shortcut” button,
      // which may still be hidden but could be clicked very quickly
      // before display is toggled.
      if (ev.target === addBtn) {
        return;
      }
      // For any other click, close the dropdown and restore the add button.
      drop.parentElement.removeChild(drop);
      addBtn.style.display = '';
      document.removeEventListener('click', outsideClickHandler, true);
    };
    setTimeout(function() {
      document.addEventListener('click', outsideClickHandler, true);
    }, 0);
  }

  // Initialise shortcut UI
  function initShortcuts() {
    var container = document.getElementById('miniShortcutsContainer');
    if (!container) return;
    // Insert an informational paragraph explaining the purpose of shortcuts and
    // the maximum allowed.  This text appears above the list and the add
    // button to orient the user.  It is styled via sidebar.css.
    var info = document.createElement('div');
    info.className = 'shortcut-info';
    // Determine the current page to customise the explanatory text.  On
    // the kidney clearance calculator the shortcuts lead to formulas
    // rather than cards, so use a different description.  On other
    // pages keep the generic wording referring to cards.  Use
    // pathname and filename similar to other helpers.
    var p = window.location.pathname || '';
    var fname = p.substring(p.lastIndexOf('/') + 1) || 'index.html';
    var infoText;
    if (fname === 'kalkulator-klirens.html') {
      infoText = 'Można dodać maksymalnie 3 skróty. Skróty prowadzą do wybranych formuł możliwych do obliczenia na stronie.';
    } else {
      infoText = 'Można dodać maksymalnie 3 skróty. Skróty prowadzą do wybranych kart na stronie.';
    }
    info.textContent = infoText;
    container.appendChild(info);

    // Create header row for shortcuts list and controls
    // List container
    var list = document.createElement('div');
    list.id = 'shortcutList';
    container.appendChild(list);
    // Add button
    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.id = 'addShortcutBtn';
    addBtn.className = 'add-shortcut-btn';
    addBtn.textContent = 'Dodaj skrót';
    addBtn.addEventListener('click', function() {
      showShortcutSelect();
    });
    container.appendChild(addBtn);
    // Select element for choosing new card
    var selectEl = document.createElement('select');
    selectEl.id = 'shortcutSelect';
    selectEl.style.display = 'none';
    selectEl.addEventListener('change', function() {
      var cid = selectEl.value;
      if (cid) {
        addShortcut(cid);
      }
      // Reset selection and hide
      selectEl.selectedIndex = 0;
      selectEl.style.display = 'none';
      // Show add button again if capacity allows
      if (currentShortcuts.length < shortcutMax) {
        addBtn.style.display = '';
      }
    });
    container.appendChild(selectEl);
    // Load from storage
    loadShortcuts();
    // Remove any shortcuts whose cards are no longer available (e.g. filtered
    // out on specific pages).  This prevents outdated shortcuts (such as
    // summary cards or professional module links) from lingering in the UI.
    try {
      var availList = computeAvailableCards();
      var availIds = availList.map(function(item) { return item.id; });
      currentShortcuts = currentShortcuts.filter(function(cid) {
        return availIds.indexOf(cid) !== -1;
      });
      saveShortcuts();
    } catch (ex) {
      // ignore errors, continue
    }
    // Render the list
    renderShortcuts();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initMiniSummary();
    initSteroidShortcuts();
    initSteroidAutoCalc();
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      initMiniSummary();
      initSteroidShortcuts();
      initSteroidAutoCalc();
    });
  }
})();