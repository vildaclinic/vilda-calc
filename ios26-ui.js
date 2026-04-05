

// ios26-ui.js — dynamiczne uruchomienie Liquid Glass UI dla PWA Vilda Clinic
//
// Ten skrypt włącza klasę `.liquid-ios26` na <body>, dzięki czemu
// definiowane w ios26.css style (glassmorphism, animacje) stają się aktywne.
// Automatycznie „uszklamia” różne elementy strony, dodaje mikrointerakcje
// (np. efekt wciśnięcia przycisku) i obserwuje pojawianie się nowych
// kontenerów, aby nadać im animacje wejścia. Dodatkowo, jeśli biblioteka
// Lucide jest dostępna, inicjalizuje ikony wczytane poprzez atrybut
// `data-lucide`.
(function() {
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DARK_THEME_LEVELS = [0, 1, 2];
  const GLASS_THEME_LEVELS = [0, 1, 2, 3, 4];
  const HIGH_CONTRAST_THEME_LEVELS = [0, 1, 2, 3];
  const HIGH_CONTRAST_INTENSITY_LEVELS = [1, 2, 3];
  const LOCK_MOBILE_NAVIGATION_ON_TOUCH_DEVICES = true;
  const PREF_KEY_SHOW_MOBILE_DOCK = 'showMobileDock';
  const PREF_KEY_SHOW_NAVIGATION_ARROW = 'showNavigationArrow';
  const EDUCATION_PAGE_PATH = 'materialy-edukacyjne.html';
  const HOMA_IR_PAGE_PATH = 'homa-ir.html';
  const EDUCATION_FULL_LABEL = 'Edu';
  const EDUCATION_COMPACT_LABEL = 'Edu';
  const MOBILE_TOP_NAV_LAYOUT_SIGNATURE = 'docpro.html|kalkulator-klirens.html|cukrzyca.html|steroidy.html|materialy-edukacyjne.html';
  const MOBILE_TOP_NAV_FONT_CACHE_KEY = 'mobileTopNavFontCache';
  const MOBILE_TOP_NAV_FONT_CACHE_VERSION = 'v3';
  const MOBILE_TOP_NAV_MIN_FONT_REM = 0.72;
  const MOBILE_TOP_NAV_MAX_FONT_REM = 0.98;
  const MOBILE_TOP_NAV_FONT_STEP_REM = 0.01;
  const MOBILE_DOCK_SCROLL_TOP_GAP_PX = 4;

  function safeRun(label, fn) {
    try {
      return typeof fn === 'function' ? fn() : undefined;
    } catch (e) {
      console.warn(`[ios26-ui] ${label} failed`, e);
      return undefined;
    }
  }

  function refreshLucideIcons() {
    if (!window.lucide) return false;
    try {
      if (typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
        return true;
      }
      if (typeof window.lucide.replace === 'function') {
        window.lucide.replace();
        return true;
      }
    } catch (e) {
      console.warn('Lucide icons initialization failed', e);
    }
    return false;
  }

  function getArrowUpSvgMarkup() {
    return `
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="lucide lucide-arrow-up"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12 19V5"></path>
        <path d="m5 12 7-7 7 7"></path>
      </svg>
    `;
  }

  function ensureGlobalScrollTopHandler() {
    if (typeof window.scrollToTop === 'function') return window.scrollToTop;

    const fallbackScrollToTop = () => {
      const behavior = prefersReducedMotion() ? 'auto' : 'smooth';

      const tryScrollTarget = (target) => {
        if (!target) return;

        try {
          if (target === window) {
            try {
              window.scrollTo({ top: 0, left: 0, behavior });
            } catch (_) {
              window.scrollTo(0, 0);
            }
            return;
          }

          if (typeof target.scrollTo === 'function') {
            try {
              target.scrollTo({ top: 0, left: 0, behavior });
            } catch (_) {
              target.scrollTo(0, 0);
            }
            return;
          }

          if (typeof target.scrollTop === 'number') {
            target.scrollTop = 0;
          }
        } catch (_) {
          if (target && typeof target.scrollTop === 'number') {
            target.scrollTop = 0;
          }
        }
      };

      const seen = new Set();
      const targets = [];
      const addTarget = (target) => {
        if (!target) return;
        if (seen.has(target)) return;
        seen.add(target);
        targets.push(target);
      };

      const preferredSnapshot = safeRun('getPreferredDockScrollSnapshot(scrollTop)', getPreferredDockScrollSnapshot);
      addTarget(preferredSnapshot && preferredSnapshot.target ? preferredSnapshot.target : null);
      safeRun('collectDockScrollCandidates(scrollTop)', () => {
        collectDockScrollCandidates().forEach(addTarget);
      });
      addTarget(getRootScrollElement());
      addTarget(document.documentElement);
      addTarget(document.body);
      addTarget(window);

      targets.forEach(tryScrollTarget);

      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    };

    window.scrollToTop = fallbackScrollToTop;
    return fallbackScrollToTop;
  }

  function createScrollTopButton() {
    if (!document.body) return null;

    const btn = document.createElement('button');
    btn.id = 'scrollTopBtn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Powrót na górę strony');
    btn.innerHTML = '<i data-lucide="arrow-up"></i>';
    btn.dataset.ios26Injected = 'true';
    document.body.appendChild(btn);
    return btn;
  }

  function ensureScrollTopButton() {
    const btn = qs('#scrollTopBtn') || createScrollTopButton();
    if (!btn) return null;

    btn.type = 'button';
    if (!btn.getAttribute('aria-label')) {
      btn.setAttribute('aria-label', 'Powrót na górę strony');
    }

    const showArrow = shouldShowNavigationArrowByPreference();
    btn.setAttribute('aria-hidden', showArrow ? 'false' : 'true');
    if (showArrow) {
      if (btn.getAttribute('tabindex') === '-1') {
        btn.removeAttribute('tabindex');
      }
    } else {
      btn.setAttribute('tabindex', '-1');
    }

    if (btn.dataset.ios26Injected === 'true' && btn.dataset.scrollTopBound !== 'true') {
      btn.dataset.scrollTopBound = 'true';
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        const handler = ensureGlobalScrollTopHandler();
        if (typeof handler === 'function') {
          handler();
        }
      });
    }

    return btn;
  }

  function ensureScrollTopFallback() {
    const btn = ensureScrollTopButton();
    if (!btn) return;

    qsa('#scrollTopBtn').forEach((currentBtn) => {
      if (currentBtn.querySelector('svg')) return;

      const iconHost = currentBtn.querySelector('[data-lucide], i, span');
      if (iconHost && iconHost.querySelector('svg')) return;

      currentBtn.innerHTML = getArrowUpSvgMarkup();
    });
  }

  function refreshIconsAndFallbacks() {
    ensureScrollTopButton();
    refreshLucideIcons();
    ensureScrollTopFallback();
  }

  /**
   * Odczytuje poziom ustawienia wyglądu z localStorage.
   * Zwraca jedną z dozwolonych wartości lub wartość domyślną.
   */
  function readThemeLevel(key, fallback = 0, allowedLevels = DARK_THEME_LEVELS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined || raw === '') return fallback;
      const parsed = parseInt(raw, 10);
      return allowedLevels.includes(parsed) ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  }

  /**
   * Nakłada na <body> klasy odpowiadające ustawieniom z sekcji
   * „Wygląd aplikacji” (ciemne tło, płynne szkło i wysoki kontrast).
   *
   * Funkcja jest wystawiona globalnie jako window.applyThemeCustom,
   * ponieważ wywołują ją kontrolki na stronie ustawień.
   */
  function applyThemeCustom() {
    const body = document.body;
    if (!body) return { dark: 0, glass: 0, contrast: 0 };

    const darkLevel = readThemeLevel('darkBgLevel', 0, DARK_THEME_LEVELS);
    const glassLevel = readThemeLevel('glassLevel', 0, GLASS_THEME_LEVELS);
    const highContrastEnabled = readBooleanPreference('highContrastEnabled', false);
    const highContrastIntensity = readThemeLevel('highContrastLevel', 2, HIGH_CONTRAST_INTENSITY_LEVELS);
    const highContrastLevel = highContrastEnabled ? highContrastIntensity : 0;

    DARK_THEME_LEVELS.forEach((level) => {
      body.classList.remove(`dark-bg-level-${level}`);
    });

    GLASS_THEME_LEVELS.forEach((level) => {
      body.classList.remove(`glass-level-${level}`);
    });

    HIGH_CONTRAST_THEME_LEVELS.forEach((level) => {
      body.classList.remove(`high-contrast-level-${level}`);
    });

    body.classList.add(`dark-bg-level-${darkLevel}`);
    body.classList.add(`glass-level-${glassLevel}`);
    body.classList.add(`high-contrast-level-${highContrastLevel}`);

    return { dark: darkLevel, glass: glassLevel, contrast: highContrastLevel };
  }

  window.applyThemeCustom = applyThemeCustom;

  function readBooleanPreference(key, fallback = true) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined || raw === '') return fallback;

      const normalized = String(raw).trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'off'].includes(normalized)) return false;

      return fallback;
    } catch (e) {
      return fallback;
    }
  }

  function shouldShowMobileDockByPreference() {
    return readBooleanPreference(PREF_KEY_SHOW_MOBILE_DOCK, true);
  }

  function shouldShowNavigationArrowByPreference() {
    return readBooleanPreference(PREF_KEY_SHOW_NAVIGATION_ARROW, true);
  }

  function ensureNavigationVisibilityPreferenceStyle() {
    if (!document.documentElement || document.getElementById('vildaNavigationVisibilityPrefsStyle')) return;

    const style = document.createElement('style');
    style.id = 'vildaNavigationVisibilityPrefsStyle';
    style.textContent = `
      body.user-hides-mobile-dock #mobileBottomDock {
        display: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translateY(calc(100% + env(safe-area-inset-bottom, 0px) + 1.2rem)) !important;
      }

      body.user-hides-nav-arrow #scrollTopBtn {
        display: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
        transform: none !important;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }


  function ensureLockedMobileNavigationStyle() {
    if (!document.documentElement || document.getElementById('vildaLockedMobileNavigationStyle')) return;

    const style = document.createElement('style');
    style.id = 'vildaLockedMobileNavigationStyle';
    style.textContent = `
      body.mobile-nav-ui-locked #mobileBottomDock,
      body.mobile-nav-ui-locked #scrollTopBtn {
        transition: none !important;
        animation: none !important;
      }

      body.mobile-nav-ui-locked #scrollTopBtn {
        transform: none !important;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function syncLockedMobileNavigationClass(enabled = false) {
    const body = document.body;
    if (!body) return !!enabled;

    ensureLockedMobileNavigationStyle();
    body.classList.toggle('mobile-nav-ui-locked', !!enabled);
    return !!enabled;
  }

  function applyNavigationVisibilityPreferences() {
    const body = document.body;
    if (!body) {
      return { dock: true, arrow: true };
    }

    ensureNavigationVisibilityPreferenceStyle();

    const showDock = shouldShowMobileDockByPreference();
    const showArrow = shouldShowNavigationArrowByPreference();

    body.classList.toggle('user-hides-mobile-dock', !showDock);
    body.classList.toggle('user-hides-nav-arrow', !showArrow);

    const btn = ensureScrollTopButton();
    if (btn) {
      btn.setAttribute('aria-hidden', showArrow ? 'false' : 'true');
      if (showArrow) {
        if (btn.getAttribute('tabindex') === '-1') {
          btn.removeAttribute('tabindex');
        }
      } else {
        btn.setAttribute('tabindex', '-1');
      }
    }

    if (typeof window.__vildaDockSyncMode === 'function') {
      safeRun('window.__vildaDockSyncMode(visibility-prefs)', () => {
        window.__vildaDockSyncMode({ preserveVisibility: false });
      });
    } else if (typeof window.__vildaDockUpdate === 'function') {
      safeRun('window.__vildaDockUpdate(visibility-prefs)', () => {
        window.__vildaDockUpdate('visibility-prefs');
      });
    }

    window.requestAnimationFrame(() => {
      safeRun('auditNavigationCoverage(applyNavigationVisibilityPreferences)', auditNavigationCoverage);
    });

    return { dock: showDock, arrow: showArrow };
  }

  window.applyNavigationVisibilityPreferences = applyNavigationVisibilityPreferences;

  // Zastosuj zapisany wygląd także po powrocie z historii/BFCache oraz
  // po zmianie localStorage w innej karcie.
  window.addEventListener('pageshow', applyThemeCustom);
  window.addEventListener('storage', applyThemeCustom);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) applyThemeCustom();
  });

  window.addEventListener('pageshow', applyNavigationVisibilityPreferences);
  window.addEventListener('storage', (event) => {
    const key = event?.key || '';
    if (!key || key === PREF_KEY_SHOW_MOBILE_DOCK || key === PREF_KEY_SHOW_NAVIGATION_ARROW) {
      applyNavigationVisibilityPreferences();
    }
  });
  window.addEventListener('vilda-ui-visibility-change', applyNavigationVisibilityPreferences);

  let hasInitialised = false;
  let mobileTopNavFontSyncTimer = 0;
  let mobileTopNavLastViewportWidth = 0;
  let mobileTopNavLastAppliedFontRem = null;
  let mobileTopNavLastSignature = '';

  function initLiquidUi() {
    if (hasInitialised) return;
    hasInitialised = true;

    safeRun('migrateIfNeeded', migrateIfNeeded);
    safeRun('setupSW', setupSW);

    if (document.body) {
      document.body.classList.add('liquid-ios26');
    }

    safeRun('applyMobileBrowserUiOptimization', applyMobileBrowserUiOptimization);
    safeRun('setupTransientViewportResizeGuard', setupTransientViewportResizeGuard);
    safeRun('applyThemeCustom', applyThemeCustom);
    safeRun('ensureNavigationVisibilityPreferenceStyle', ensureNavigationVisibilityPreferenceStyle);
    safeRun('ensureLockedMobileNavigationStyle', ensureLockedMobileNavigationStyle);
    safeRun('applyNavigationVisibilityPreferences', applyNavigationVisibilityPreferences);
    safeRun('glassify', glassify);
    safeRun('setupPressFeedback', setupPressFeedback);
    safeRun('observeAppear', observeAppear);
    safeRun('ensureGlobalScrollTopHandler', ensureGlobalScrollTopHandler);
    safeRun('syncSingleColumnTopNavOrder', syncSingleColumnTopNavOrder);
    safeRun('setupMobileBottomDock', setupMobileBottomDock);
    safeRun('syncCompactEducationLabels', syncCompactEducationLabels);
    safeRun('auditNavigationCoverage', auditNavigationCoverage);
    safeRun('syncMobileTopNavFontSize', syncMobileTopNavFontSize);
    safeRun('refreshIconsAndFallbacks', refreshIconsAndFallbacks);

    let browserUiRefreshTimer = 0;
    let lastBrowserUiViewportWidth = getViewportWidth();
    const delayedRefresh = () => safeRun('refreshIconsAndFallbacks', refreshIconsAndFallbacks);
    const delayedDockRetry = () => safeRun('setupMobileBottomDock(retry)', setupMobileBottomDock);
    const delayedTopNavStructureSync = () => safeRun('syncSingleColumnTopNavOrder', syncSingleColumnTopNavOrder);
    const delayedCompactEducationLabels = () => safeRun('syncCompactEducationLabels', syncCompactEducationLabels);
    const delayedNavigationCoverageAudit = () => safeRun('auditNavigationCoverage', auditNavigationCoverage);
    const delayedTopNavFontSizeSync = () => scheduleMobileTopNavFontSizeSyncForWidthChange(0);
    const delayedBrowserUiRefresh = () => safeRun('applyMobileBrowserUiOptimization', applyMobileBrowserUiOptimization);
    const delayedBrowserUiPrime = () => safeRun('primeMobileBrowserUiChrome', primeMobileBrowserUiChrome);
    window.setTimeout(delayedRefresh, 150);
    window.setTimeout(delayedTopNavStructureSync, 0);
    window.setTimeout(delayedCompactEducationLabels, 0);
    window.setTimeout(delayedNavigationCoverageAudit, 0);
    window.setTimeout(delayedTopNavFontSizeSync, 30);
    window.setTimeout(delayedRefresh, 900);
    window.setTimeout(delayedDockRetry, 250);
    window.setTimeout(delayedTopNavStructureSync, 280);
    window.setTimeout(delayedCompactEducationLabels, 280);
    window.setTimeout(delayedNavigationCoverageAudit, 300);
    window.setTimeout(delayedTopNavFontSizeSync, 320);
    window.setTimeout(delayedBrowserUiRefresh, 0);
    window.setTimeout(delayedBrowserUiPrime, 120);
    window.setTimeout(delayedBrowserUiRefresh, 360);
    window.setTimeout(delayedBrowserUiPrime, 460);
    on(window, 'load', () => {
      delayedTopNavStructureSync();
      delayedDockRetry();
      delayedRefresh();
      delayedCompactEducationLabels();
      delayedNavigationCoverageAudit();
      delayedTopNavFontSizeSync();
      delayedBrowserUiRefresh();
      window.setTimeout(delayedBrowserUiPrime, 80);
    }, { passive: true, once: true });
    on(window, 'pageshow', () => {
      delayedTopNavStructureSync();
      delayedDockRetry();
      delayedRefresh();
      delayedCompactEducationLabels();
      delayedNavigationCoverageAudit();
      delayedTopNavFontSizeSync();
      delayedBrowserUiRefresh();
      window.setTimeout(delayedBrowserUiPrime, 80);
    }, { passive: true });
    on(window, 'orientationchange', () => {
      window.setTimeout(delayedBrowserUiRefresh, 60);
      window.setTimeout(delayedTopNavStructureSync, 90);
      window.setTimeout(delayedCompactEducationLabels, 90);
      window.setTimeout(delayedNavigationCoverageAudit, 100);
      window.setTimeout(delayedTopNavFontSizeSync, 110);
      window.setTimeout(delayedBrowserUiPrime, 180);
    }, { passive: true });
    on(window, 'resize', delayedTopNavStructureSync, { passive: true });
    on(window, 'resize', delayedCompactEducationLabels, { passive: true });
    on(window, 'resize', delayedNavigationCoverageAudit, { passive: true });
    on(window, 'resize', delayedTopNavFontSizeSync, { passive: true });
    if (window.visualViewport) {
      on(window.visualViewport, 'resize', () => {
        const nextViewportWidth = getViewportWidth();
        const widthDelta = Math.abs(nextViewportWidth - lastBrowserUiViewportWidth);

        if (widthDelta > 2 || !shouldOptimizeMobileBrowserUi()) {
          lastBrowserUiViewportWidth = nextViewportWidth;
          window.setTimeout(delayedTopNavStructureSync, 0);
          window.setTimeout(delayedCompactEducationLabels, 0);
          window.setTimeout(delayedNavigationCoverageAudit, 0);
          window.setTimeout(delayedTopNavFontSizeSync, 0);
          window.setTimeout(delayedBrowserUiRefresh, 0);
          return;
        }

        window.clearTimeout(browserUiRefreshTimer);
        browserUiRefreshTimer = window.setTimeout(() => {
          lastBrowserUiViewportWidth = getViewportWidth();
          safeRun('syncSingleColumnTopNavOrder(settled)', syncSingleColumnTopNavOrder);
          safeRun('syncCompactEducationLabels(settled)', syncCompactEducationLabels);
          safeRun('auditNavigationCoverage(settled)', auditNavigationCoverage);
          safeRun('syncMobileTopNavFontSize(settled)', syncMobileTopNavFontSize);
          safeRun('applyMobileBrowserUiOptimization(settled)', applyMobileBrowserUiOptimization);
        }, 180);
      }, { passive: true });
    }
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(() => {
        const currentWidth = getStableTopNavFontViewportWidth();
        if (readMobileTopNavFontCache(currentWidth) !== null) {
          safeRun('applyCachedMobileTopNavFontSize(document.fonts.ready)', () => applyCachedMobileTopNavFontSize(qs('.main-nav'), currentWidth));
          return;
        }

        scheduleMobileTopNavFontSizeSync(0, { forceMeasure: true });
      }).catch(() => {
        /* noop */
      });
    }
    document.addEventListener('touchstart', delayedBrowserUiPrime, { passive: true, once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLiquidUi);
  } else {
    initLiquidUi();
  }

  /**
   * Dodaje klasę `_glass` i animację wejścia do podstawowych kontenerów,
   * takich jak header, karty, fieldsety. Używa IntersectionObserver do
   * wykrywania pojawiania się elementów w viewport.
   */
  function glassify() {
    // Elementy, które otrzymają szklany wygląd
    const targets = [
      'header',
      '.card', '.plan-card', '.result-card', '.data-card',
      'fieldset', '#timesCard', '#intakeCard'
    ];
    qsa(targets.join(','))
      .forEach((el) => {
        el.classList.add('_glass');
        if (!prefersReducedMotion()) el.classList.add('_enter');
      });

    // Pola formularzy – nadaj im lekko rozmyte tło i zaokrąglenia
    qsa('input[type="text"], input[type="number"], select')
      .forEach((el) => {
        // nadaj klasę pomocniczą (jeśli potrzebujesz w CSS)
        el.classList.add('_glass-input');
        // Wymuszamy w stylu inline brak rozmycia (backdrop-filter), ponieważ
        // rozmycie na elementach <input> powodowało zablokowanie możliwości
        // wpisywania danych w niektórych przeglądarkach. Tłumaczymy tło
        // na lekko mleczne i zapewniamy border radius zgodnie z designem.
        el.style.backdropFilter = 'none';
        el.style.webkitBackdropFilter = 'none';
        // Jeśli nie zdefiniowano własnego tła poprzez CSS, ustaw jasne
        // półprzezroczyste tło aby współgrało z motywem Liquid Glass.
        if (!el.style.background || el.style.background === '') {
          el.style.background = 'rgba(255, 255, 255, 0.85)';
        }
        el.style.border = '1px solid rgba(0, 0, 0, 0.12)';
        el.style.borderRadius = '12px';
      });

    // Główne przyciski (Generuj siatkę, Zaawansowane obliczenia, Szacowane spożycie) wyróżnij akcentem
    ['#generateCentileChart', '#generateDsCentileChart', '#generateCentileChartAdv', '#toggleAdvancedGrowth', '#toggleIntakeCard']
      .forEach((id) => {
        const b = qs(id);
        if (b) b.classList.add('btn-accent');
      });

    // Podprzyciski IGF dostają klasę btn-icon (jeśli nie został ręcznie nadany)
    ['#toggleIgfTests', '#toggleSnp', '#toggleTurner', '#togglePws', '#toggleSga', '#toggleIgf1']
      .forEach((id) => {
        const b = qs(id);
        if (b) b.classList.add('btn-icon');
      });
  }

  /**
   * Dodaje efekt wciśnięcia do przycisków — skalowanie i cień na czas tapnięcia.
   */
  function setupPressFeedback() {
    const allButtons = qsa('button, input[type="button"], input[type="submit"]');
    allButtons.forEach((b) => {
      const press = () => b.classList.add('_pressed');
      const release = () => b.classList.remove('_pressed');
      ['pointerdown', 'touchstart', 'mousedown'].forEach((ev) => on(b, ev, press, { passive: true }));
      ['pointerup', 'pointercancel', 'mouseleave', 'touchend', 'mouseup', 'blur'].forEach((ev) => on(b, ev, release, { passive: true }));
    });
  }

  /**
   * Obserwuje pojawiające się w DOM elementy i dodaje im animację wejścia.
   * Używa IntersectionObserver i MutationObserver, aby elementy dynamicznie
   * dodawane przez app.js otrzymały klasę `_enter` i były rozmyte.
   */
  function observeAppear() {
    if (prefersReducedMotion()) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('_enter');
          io.unobserve(e.target);
        }
      });
    }, { root: null, threshold: 0.06 });

    const observeSet = () => {
      qsa('.card, .plan-card, .result-card, .data-card, fieldset, #timesCard, #intakeCard')
        .forEach((el) => io.observe(el));
    };
    observeSet();

    // Uwaga: w tej wersji nie używamy MutationObserver do śledzenia zmian w DOM.
    // Poprzedni kod obserwował wszystkie zmiany atrybutów oraz dodawanie węzłów,
    // co mogło prowadzić do zapętlenia i blokowania interakcji z formularzami.
    // Również nadajemy klasę _enter elementom zarejestrowanym w observeSet().
  }


  const MOBILE_DOCK_BREAKPOINT = '(max-width: 1100px), (pointer: coarse)';
  const MOBILE_DOCK_FIXED_ITEMS = [
    { path: 'index.html', href: 'index.html', label: 'Start', icon: 'home' },
    { path: 'docpro.html', href: 'docpro.html', label: 'DocPro', icon: 'stethoscope' },
    { path: 'kalkulator-klirens.html', href: 'kalkulator-klirens.html', label: 'Klirens', icon: 'droplets' },
    { path: 'cukrzyca.html', href: 'cukrzyca.html', label: 'Cukrzyca', icon: 'syringe' },
    { path: 'homa-ir.html', href: 'homa-ir.html', label: 'HOMA‑IR', icon: 'calculator' }
  ];
  const SINGLE_COLUMN_TOP_NAV_ITEMS = [
    { path: 'docpro.html', href: 'docpro.html', label: 'DocPro', className: 'pro-link' },
    { path: 'kalkulator-klirens.html', href: 'kalkulator-klirens.html', label: 'Klirens' },
    { path: 'cukrzyca.html', href: 'cukrzyca.html', label: 'Cukrzyca' },
    { path: 'steroidy.html', href: 'steroidy.html', label: 'Steroidy' },
    {
      path: EDUCATION_PAGE_PATH,
      href: EDUCATION_PAGE_PATH,
      label: EDUCATION_COMPACT_LABEL,
      fullLabel: EDUCATION_FULL_LABEL,
      accessibleLabel: EDUCATION_FULL_LABEL,
      forceCompactLabel: true
    }
  ];
  const MOBILE_DOCK_FALLBACKS = {
    'index.html': { href: 'index.html', label: 'Start', icon: 'home' },
    'docpro.html': { href: 'docpro.html', label: 'DocPro', icon: 'stethoscope' },
    'homa-ir.html': { href: 'homa-ir.html', label: 'HOMA‑IR', icon: 'calculator' },
    'kalkulator-klirens.html': { href: 'kalkulator-klirens.html', label: 'Klirens', icon: 'droplets' },
    'cukrzyca.html': { href: 'cukrzyca.html', label: 'Cukrzyca', icon: 'syringe' },
    'steroidy.html': { href: 'steroidy.html', label: 'Steroidy', icon: 'pill' },
    'materialy-edukacyjne.html': { href: 'materialy-edukacyjne.html', label: EDUCATION_FULL_LABEL, icon: 'book-open' },
    'ustawienia.html': { href: 'ustawienia.html', label: 'Ustawienia', icon: 'settings' },
    'instrukcja.html': { href: 'instrukcja.html', label: 'Instrukcja', icon: 'file-text' },
    'o-aplikacji.html': { href: 'o-aplikacji.html', label: 'O aplikacji', icon: 'info' },
    'kontakt.html': { href: 'kontakt.html', label: 'Kontakt', icon: 'mail' }
  };


const NAVIGATION_REACHABILITY_ROUTES = [
  { path: 'index.html', href: 'index.html', label: 'Strona główna', icon: 'home' },
  { path: 'docpro.html', href: 'docpro.html', label: 'DocPro', icon: 'stethoscope', className: 'pro-link' },
  { path: 'homa-ir.html', href: 'homa-ir.html', label: 'HOMA‑IR', icon: 'calculator' },
  { path: 'kalkulator-klirens.html', href: 'kalkulator-klirens.html', label: 'Klirens', icon: 'droplets' },
  { path: 'cukrzyca.html', href: 'cukrzyca.html', label: 'Cukrzyca', icon: 'syringe' },
  { path: 'steroidy.html', href: 'steroidy.html', label: 'Steroidy', icon: 'pill' },
  { path: EDUCATION_PAGE_PATH, href: EDUCATION_PAGE_PATH, label: EDUCATION_FULL_LABEL, icon: 'book-open' },
  { path: 'ustawienia.html', href: 'ustawienia.html', label: 'Ustawienia', icon: 'settings' },
  { path: 'instrukcja.html', href: 'instrukcja.html', label: 'Instrukcja', icon: 'file-text' },
  { path: 'o-aplikacji.html', href: 'o-aplikacji.html', label: 'O aplikacji', icon: 'info' },
  { path: 'kontakt.html', href: 'kontakt.html', label: 'Kontakt', icon: 'mail' }
];
const HAMBURGER_FALLBACK_ROUTE_ORDER = NAVIGATION_REACHABILITY_ROUTES
  .filter((route) => normalizePath(route.path) !== EDUCATION_PAGE_PATH)
  .map((route) => normalizePath(route.path));

  function normalizeMobileTopNavFontViewportWidth(value = getViewportWidth()) {
    const normalized = Math.round(Number(value) || 0);
    return normalized > 0 ? normalized : 0;
  }

  function getStableTopNavFontViewportWidth() {
    const innerWidth = Number(window.innerWidth) || 0;
    const documentWidth = Number(document.documentElement?.clientWidth) || 0;
    const fallbackVisualViewportWidth = Number(window.visualViewport?.width) || 0;
    const stableWidth = Math.max(innerWidth, documentWidth) || fallbackVisualViewportWidth;
    return normalizeMobileTopNavFontViewportWidth(stableWidth);
  }

  function getMobileTopNavCacheSignature() {
    return MOBILE_TOP_NAV_LAYOUT_SIGNATURE;
  }

  function readMobileTopNavFontCachePayload() {
    try {
      const raw = localStorage.getItem(MOBILE_TOP_NAV_FONT_CACHE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.version !== MOBILE_TOP_NAV_FONT_CACHE_VERSION) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function readMobileTopNavFontCache(viewportWidth = getViewportWidth()) {
    const payload = readMobileTopNavFontCachePayload();
    if (!payload) return null;

    const normalizedWidth = normalizeMobileTopNavFontViewportWidth(viewportWidth);
    const cachedWidth = normalizeMobileTopNavFontViewportWidth(payload.width);
    const cachedFontRem = Number(payload.fontRem);
    const cachedSignature = String(payload.signature || '').trim();

    if (!normalizedWidth || cachedWidth !== normalizedWidth) return null;
    if (cachedSignature !== getMobileTopNavCacheSignature()) return null;
    if (!Number.isFinite(cachedFontRem)) return null;
    if (cachedFontRem < MOBILE_TOP_NAV_MIN_FONT_REM || cachedFontRem > MOBILE_TOP_NAV_MAX_FONT_REM) return null;

    return Number(cachedFontRem.toFixed(2));
  }

  function writeMobileTopNavFontCache(viewportWidth, fontRem) {
    const normalizedWidth = normalizeMobileTopNavFontViewportWidth(viewportWidth);
    const normalizedFontRem = Number(fontRem);

    if (!normalizedWidth || !Number.isFinite(normalizedFontRem)) return null;

    const payload = {
      version: MOBILE_TOP_NAV_FONT_CACHE_VERSION,
      width: normalizedWidth,
      fontRem: Number(normalizedFontRem.toFixed(2)),
      signature: getMobileTopNavCacheSignature()
    };

    try {
      localStorage.setItem(MOBILE_TOP_NAV_FONT_CACHE_KEY, JSON.stringify(payload));
      return payload;
    } catch (e) {
      return null;
    }
  }

  function applyMobileTopNavFontSizeValue(nav, fontRem, viewportWidth = getViewportWidth()) {
    if (!nav || !nav.style) return null;

    const normalizedFontRem = Number(fontRem);
    if (!Number.isFinite(normalizedFontRem)) return null;

    const normalizedWidth = normalizeMobileTopNavFontViewportWidth(viewportWidth);
    const finalFontRem = Number(normalizedFontRem.toFixed(2));
    nav.style.setProperty('--mobile-top-nav-font-size', `${finalFontRem.toFixed(2)}rem`);
    nav.dataset.mobileTopNavFontWidth = String(normalizedWidth || '');
    nav.dataset.mobileTopNavFontRem = finalFontRem.toFixed(2);
    mobileTopNavLastViewportWidth = normalizedWidth;
    mobileTopNavLastAppliedFontRem = finalFontRem;
    mobileTopNavLastSignature = getMobileTopNavCacheSignature();
    return finalFontRem;
  }

  function clearMobileTopNavFontSize(nav) {
    if (!nav || !nav.style) return;
    nav.style.removeProperty('--mobile-top-nav-font-size');
    delete nav.dataset.mobileTopNavFontWidth;
    delete nav.dataset.mobileTopNavFontRem;
    mobileTopNavLastAppliedFontRem = null;
  }

  function applyCachedMobileTopNavFontSize(nav, viewportWidth = getViewportWidth()) {
    const cachedFontRem = readMobileTopNavFontCache(viewportWidth);
    if (cachedFontRem === null || cachedFontRem === undefined) return null;
    return applyMobileTopNavFontSizeValue(nav, cachedFontRem, viewportWidth);
  }

  function isElementVisibleForLayout(el) {
    if (!el) return false;

    let style;
    try {
      style = window.getComputedStyle(el);
    } catch (e) {
      style = null;
    }

    if (style && (style.display === 'none' || style.visibility === 'hidden')) {
      return false;
    }

    const rect = typeof el.getBoundingClientRect === 'function'
      ? el.getBoundingClientRect()
      : null;

    return !!(rect && rect.width > 0 && rect.height > 0);
  }

  function getMobileTopNavLinks(nav) {
    return qsa('.main-nav > ul > li > a[href]', nav?.ownerDocument || document).filter((link) => {
      if (!nav || !nav.contains(link)) return false;
      if (!isElementVisibleForLayout(link)) return false;

      const label = (link.textContent || '').replace(/\s+/g, ' ').trim();
      return !!label;
    });
  }

  function doMobileTopNavLabelsFit(links) {
    return links.every((link) => {
      if (!link || link.clientWidth <= 0 || link.clientHeight <= 0) return true;

      const widthFits = link.scrollWidth <= (link.clientWidth + 1);
      const heightFits = link.scrollHeight <= (link.clientHeight + 1);
      return widthFits && heightFits;
    });
  }

  function areDocumentFontsReady() {
    try {
      if (!document.fonts || !('status' in document.fonts)) return true;
      return document.fonts.status === 'loaded';
    } catch (e) {
      return true;
    }
  }

  function shouldAutofitSingleColumnTopNav(nav, viewportWidth = getStableTopNavFontViewportWidth()) {
    if (!nav) return false;

    const normalizedWidth = normalizeMobileTopNavFontViewportWidth(viewportWidth);
    if (!normalizedWidth) return false;

    const rootList = getTopLevelNavRootList(nav);
    if (!rootList) return false;

    try {
      const rootListStyle = window.getComputedStyle(rootList);
      if (rootListStyle?.display === 'grid') {
        return true;
      }
    } catch (e) {
      /* noop */
    }

    return normalizedWidth <= 600;
  }

  function syncMobileTopNavFontSize(options = {}) {
    const nav = qs('.main-nav');
    if (!nav) return null;

    const normalizedWidth = getStableTopNavFontViewportWidth();
    const shouldAutofit = shouldAutofitSingleColumnTopNav(nav, normalizedWidth);
    const forceMeasure = options.forceMeasure === true;

    if (!shouldAutofit) {
      clearMobileTopNavFontSize(nav);
      mobileTopNavLastViewportWidth = normalizedWidth;
      mobileTopNavLastSignature = getMobileTopNavCacheSignature();
      return null;
    }

    if (!forceMeasure) {
      const cachedFontRem = applyCachedMobileTopNavFontSize(nav, normalizedWidth);
      if (cachedFontRem !== null && cachedFontRem !== undefined) {
        return cachedFontRem;
      }

      if (!areDocumentFontsReady()) {
        return null;
      }
    }

    if (!isElementVisibleForLayout(nav)) return null;

    const links = getMobileTopNavLinks(nav);
    if (!links.length) {
      clearMobileTopNavFontSize(nav);
      return null;
    }

    let bestSize = MOBILE_TOP_NAV_MIN_FONT_REM;

    applyMobileTopNavFontSizeValue(nav, MOBILE_TOP_NAV_MIN_FONT_REM, normalizedWidth);

    for (let size = MOBILE_TOP_NAV_MAX_FONT_REM; size >= (MOBILE_TOP_NAV_MIN_FONT_REM - 0.0001); size -= MOBILE_TOP_NAV_FONT_STEP_REM) {
      const candidate = Number(size.toFixed(2));
      applyMobileTopNavFontSizeValue(nav, candidate, normalizedWidth);

      if (doMobileTopNavLabelsFit(links)) {
        bestSize = candidate;
        break;
      }
    }

    applyMobileTopNavFontSizeValue(nav, bestSize, normalizedWidth);
    writeMobileTopNavFontCache(normalizedWidth, bestSize);
    return bestSize;
  }

  function scheduleMobileTopNavFontSizeSync(delay = 0, options = {}) {
    window.clearTimeout(mobileTopNavFontSyncTimer);
    mobileTopNavFontSyncTimer = window.setTimeout(() => {
      safeRun('syncMobileTopNavFontSize', () => syncMobileTopNavFontSize(options));
    }, Math.max(0, Number(delay) || 0));
  }

  function scheduleMobileTopNavFontSizeSyncForWidthChange(delay = 0, options = {}) {
    const normalizedWidth = getStableTopNavFontViewportWidth();
    const cachedFontForWidth = readMobileTopNavFontCache(normalizedWidth);
    const hasCurrentDocumentFont = normalizedWidth
      && normalizedWidth === mobileTopNavLastViewportWidth
      && Number.isFinite(mobileTopNavLastAppliedFontRem)
      && mobileTopNavLastSignature === getMobileTopNavCacheSignature();

    if (!options.forceMeasure && normalizedWidth && normalizedWidth === mobileTopNavLastViewportWidth) {
      if (cachedFontForWidth !== null && cachedFontForWidth !== undefined) {
        safeRun('applyCachedMobileTopNavFontSize(width-stable)', () => applyCachedMobileTopNavFontSize(qs('.main-nav'), normalizedWidth));
        return;
      }

      if (hasCurrentDocumentFont) {
        safeRun('applyMobileTopNavFontSizeValue(width-stable)', () => applyMobileTopNavFontSizeValue(qs('.main-nav'), mobileTopNavLastAppliedFontRem, normalizedWidth));
        return;
      }
    }

    scheduleMobileTopNavFontSizeSync(delay, options);
  }

  function shouldUseCompactEducationLabel() {
    if (!isLikelyMobileTouchBrowser()) return false;

    let minScreenSide = 0;
    try {
      const screenWidth = Number(window.screen?.width) || 0;
      const screenHeight = Number(window.screen?.height) || 0;
      if (screenWidth > 0 && screenHeight > 0) {
        minScreenSide = Math.min(screenWidth, screenHeight);
      }
    } catch (e) {
      minScreenSide = 0;
    }

    if (minScreenSide > 0) return minScreenSide <= 500;

    const viewportWidth = getViewportWidth();
    return viewportWidth > 0 && viewportWidth <= 820;
  }

  function getAccessibleNavLabel(path, label) {
    return normalizePath(path) === EDUCATION_PAGE_PATH
      ? EDUCATION_FULL_LABEL
      : (label || '');
  }

  function getResponsiveNavLabel(path, label) {
    const baseLabel = label || '';
    if (normalizePath(path) === EDUCATION_PAGE_PATH && shouldUseCompactEducationLabel()) {
      return EDUCATION_COMPACT_LABEL;
    }
    return baseLabel;
  }

  function getTopLevelNavRootList(nav) {
    if (!nav) return null;
    return Array.from(nav.children || []).find((child) => child && child.tagName === 'UL') || null;
  }

  function getTopLevelNavAnchor(item) {
    if (!item) return null;
    return Array.from(item.children || []).find((child) => child && child.tagName === 'A' && child.hasAttribute('href')) || null;
  }

  function buildSingleColumnTopNavItem(config, existingAnchor, currentPath) {
    const normalizedPath = normalizePath(config.path || config.href);
    const fallback = MOBILE_DOCK_FALLBACKS[normalizedPath] || {};
    const label = config.label
      || fallback.label
      || existingAnchor?.textContent?.replace(/\s+/g, ' ').trim()
      || normalizedPath;
    const fullLabel = config.fullLabel
      || fallback.label
      || existingAnchor?.dataset?.fullLabel
      || label;
    const accessibleLabel = config.accessibleLabel || getAccessibleNavLabel(normalizedPath, fullLabel);

    const li = existingAnchor?.parentElement && existingAnchor.parentElement.tagName === 'LI'
      ? existingAnchor.parentElement
      : document.createElement('li');
    let anchor = existingAnchor;

    if (!anchor || anchor.parentElement !== li) {
      anchor = document.createElement('a');
      li.textContent = '';
      li.appendChild(anchor);
    }

    anchor.setAttribute('href', config.href || fallback.href || normalizedPath);
    anchor.textContent = label;
    anchor.dataset.fullLabel = fullLabel;

    if (config.forceCompactLabel) {
      anchor.dataset.forceCompactLabel = 'true';
    } else {
      delete anchor.dataset.forceCompactLabel;
    }

    if (config.className) {
      anchor.className = '';
      config.className.split(/\s+/).filter(Boolean).forEach((className) => anchor.classList.add(className));
    } else if (!existingAnchor) {
      anchor.removeAttribute('class');
    }

    anchor.setAttribute('aria-label', accessibleLabel);
    if (config.forceCompactLabel || label !== accessibleLabel) {
      anchor.title = accessibleLabel;
    } else {
      anchor.removeAttribute('title');
    }

    if (normalizedPath === currentPath) {
      anchor.setAttribute('aria-current', 'page');
      li.classList.add('is-active');
    } else {
      anchor.removeAttribute('aria-current');
      li.classList.remove('is-active');
    }

    return li;
  }

  function syncSingleColumnTopNavOrder() {
    const nav = qs('.main-nav');
    const rootList = getTopLevelNavRootList(nav);
    if (!nav || !rootList) return;
    if (!isElementVisibleForLayout(nav)) return;

    const menuToggleItem = Array.from(rootList.children || []).find((child) => child?.classList?.contains('menu-toggle'));
    if (!menuToggleItem) return;

    const currentPath = normalizePath(window.location.pathname);
    const existingByPath = new Map();

    Array.from(rootList.children || []).forEach((item) => {
      if (!item || item === menuToggleItem) return;
      const anchor = getTopLevelNavAnchor(item);
      if (!anchor) return;

      const path = normalizePath(anchor.getAttribute('href'));
      if (!existingByPath.has(path)) {
        existingByPath.set(path, anchor);
      }
    });

    Array.from(rootList.children || []).forEach((item) => {
      if (item && item !== menuToggleItem) {
        item.remove();
      }
    });

    SINGLE_COLUMN_TOP_NAV_ITEMS.forEach((config) => {
      const anchor = existingByPath.get(normalizePath(config.path || config.href)) || null;
      const item = buildSingleColumnTopNavItem(config, anchor, currentPath);
      rootList.appendChild(item);
    });
  }

  function syncCompactEducationLabels() {
    const useCompactLabel = shouldUseCompactEducationLabel();

    qsa('.main-nav > ul > li > a[href]').forEach((link) => {
      const path = normalizePath(link.getAttribute('href'));
      if (path !== EDUCATION_PAGE_PATH) return;

      const originalLabel = link.dataset.fullLabel
        || link.textContent.replace(/\s+/g, ' ').trim()
        || EDUCATION_FULL_LABEL;

      if (!link.dataset.fullLabel) {
        link.dataset.fullLabel = originalLabel;
      }

      const forceCompactLabel = link.dataset.forceCompactLabel === 'true';
      const nextLabel = forceCompactLabel
        ? EDUCATION_COMPACT_LABEL
        : getResponsiveNavLabel(path, link.dataset.fullLabel || originalLabel);
      if (link.textContent !== nextLabel) {
        link.textContent = nextLabel;
      }

      const accessibleLabel = getAccessibleNavLabel(path, link.dataset.fullLabel || originalLabel);
      link.setAttribute('aria-label', accessibleLabel);
      if (forceCompactLabel || useCompactLabel) {
        link.title = accessibleLabel;
      } else {
        link.removeAttribute('title');
      }
    });

    qsa('#mobileBottomDock .mobile-bottom-dock__item[href]').forEach((link) => {
      const path = normalizePath(link.getAttribute('href'));
      if (path !== EDUCATION_PAGE_PATH) return;

      const labelEl = link.querySelector('.mobile-bottom-dock__label');
      if (!labelEl) return;

      const originalLabel = labelEl.dataset.fullLabel
        || labelEl.textContent.replace(/\s+/g, ' ').trim()
        || EDUCATION_FULL_LABEL;

      if (!labelEl.dataset.fullLabel) {
        labelEl.dataset.fullLabel = originalLabel;
      }

      const nextLabel = getResponsiveNavLabel(path, labelEl.dataset.fullLabel || originalLabel);
      if (labelEl.textContent !== nextLabel) {
        labelEl.textContent = nextLabel;
      }

      const accessibleLabel = getAccessibleNavLabel(path, labelEl.dataset.fullLabel || originalLabel);
      link.setAttribute('aria-label', accessibleLabel);
      if (useCompactLabel) {
        link.title = accessibleLabel;
      } else {
        link.removeAttribute('title');
      }
    });
  }

  function normalizePath(value) {
    if (!value) return 'index.html';

    let pathname = value;
    try {
      pathname = new URL(value, window.location.origin).pathname || value;
    } catch (e) {
      pathname = String(value);
    }

    const cleaned = String(pathname)
      .split('#')[0]
      .split('?')[0]
      .trim();

    if (!cleaned || cleaned === '/') return 'index.html';

    const tail = cleaned
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .pop();

    return (tail || 'index.html').toLowerCase();
  }

  function getNavEntryForPath(path, linkMap) {
    const normalized = normalizePath(path);
    if (linkMap.has(normalized)) return linkMap.get(normalized);

    const fallback = MOBILE_DOCK_FALLBACKS[normalized];
    if (!fallback) return null;

    return {
      path: normalized,
      href: fallback.href || normalized,
      label: fallback.label,
      icon: fallback.icon || 'circle'
    };
  }

  function collectNavEntries() {
    const entries = new Map();

    qsa('.sidebar-nav a[href], .main-nav > ul > li > a[href]')
      .filter((link) => {
        const href = (link.getAttribute('href') || '').trim();
        return href && href !== '#' && !href.startsWith('javascript:')
          && !link.hasAttribute('disabled') && link.getAttribute('aria-disabled') !== 'true';
      })
      .forEach((link) => {
        const path = normalizePath(link.getAttribute('href'));
        if (entries.has(path)) return;

        const fallback = MOBILE_DOCK_FALLBACKS[path] || {};
        const label = fallback.label
          || link.querySelector('.sidebar-label')?.textContent?.trim()
          || link.textContent.replace(/\s+/g, ' ').trim();
        const icon = link.querySelector('[data-lucide]')?.getAttribute('data-lucide')
          || fallback.icon
          || 'circle';

        entries.set(path, {
          path,
          href: link.getAttribute('href'),
          label,
          icon
        });
      });

    return entries;
  }


function getReachabilityRouteConfig(path) {
  const normalized = normalizePath(path);
  return NAVIGATION_REACHABILITY_ROUTES.find((route) => normalizePath(route.path || route.href) === normalized) || null;
}

function isUsableNavLink(link, includeManagedFallbacks = true) {
  if (!(link instanceof Element)) return false;

  const href = (link.getAttribute('href') || '').trim();
  if (!href || href === '#' || href.startsWith('javascript:')) return false;
  if (!includeManagedFallbacks && link.dataset.routeFallback === 'true') return false;
  if (link.hasAttribute('disabled') || link.getAttribute('aria-disabled') === 'true') return false;

  return true;
}

function collectCoverageFromLinks(links, coverage, includeManagedFallbacks = true) {
  (links || []).forEach((link) => {
    if (!isUsableNavLink(link, includeManagedFallbacks)) return;
    coverage.add(normalizePath(link.getAttribute('href')));
  });
}

function getReachableNavigationState(options = {}) {
  const includeManagedFallbacks = options.includeManagedFallbacks !== false;
  const coverage = new Set();

  const mainNav = qs('.main-nav');
  const rootList = getTopLevelNavRootList(mainNav);
  const menuToggleItem = rootList
    ? Array.from(rootList.children || []).find((child) => child?.classList?.contains('menu-toggle'))
    : null;
  const menuToggleLabel = menuToggleItem ? qs('label', menuToggleItem) : null;
  const verticalMenu = menuToggleItem ? qs('.vertical-menu', menuToggleItem) : null;
  const topNavVisible = !!(mainNav && rootList && isElementVisibleForLayout(mainNav));
  const hamburgerAvailable = !!(menuToggleItem && menuToggleLabel && isElementVisibleForLayout(menuToggleLabel) && verticalMenu);

  if (topNavVisible && rootList) {
    Array.from(rootList.children || []).forEach((item) => {
      if (!item || item === menuToggleItem) return;
      const anchor = getTopLevelNavAnchor(item);
      if (!isUsableNavLink(anchor, includeManagedFallbacks)) return;
      coverage.add(normalizePath(anchor.getAttribute('href')));
    });
  }

  if (hamburgerAvailable && verticalMenu) {
    collectCoverageFromLinks(qsa('a[href]', verticalMenu), coverage, includeManagedFallbacks);
  }

  const sidebarNav = qs('.sidebar-nav');
  const sidebarVisible = !!(sidebarNav && isElementVisibleForLayout(sidebarNav));
  if (sidebarVisible && sidebarNav) {
    collectCoverageFromLinks(qsa('a[href]', sidebarNav), coverage, includeManagedFallbacks);
  }

  const dock = qs('#mobileBottomDock');
  const dockVisible = !!(
    dock
    && !dock.hidden
    && !dock.classList.contains('is-hidden')
    && !dock.classList.contains('is-keyboard-hidden')
    && isElementVisibleForLayout(dock)
  );
  if (dockVisible && dock) {
    collectCoverageFromLinks(qsa('.mobile-bottom-dock__item[href]', dock), coverage, includeManagedFallbacks);
  }

  return {
    coverage,
    mainNav,
    rootList,
    menuToggleItem,
    verticalMenu,
    hamburgerAvailable,
    sidebarNav,
    sidebarVisible,
    dock,
    dockVisible
  };
}

function shouldAllowRouteInHamburger(routePath, reachabilityState = {}) {
  const normalized = normalizePath(routePath);

  if (normalized === EDUCATION_PAGE_PATH) return false;
  if (normalized === HOMA_IR_PAGE_PATH) {
    return !reachabilityState.dockVisible;
  }

  return true;
}

function enforceHamburgerRoutePolicy(reachabilityState = {}) {
  const verticalMenu = reachabilityState.verticalMenu;
  if (!verticalMenu) return false;

  let hasMutated = false;

  qsa('a[href]', verticalMenu).forEach((link) => {
    if (!isUsableNavLink(link, true)) return;

    const routePath = normalizePath(link.getAttribute('href'));
    if (shouldAllowRouteInHamburger(routePath, reachabilityState)) return;

    link.parentElement?.remove();
    hasMutated = true;
  });

  return hasMutated;
}


function buildManagedHamburgerLink(routeConfig, currentPath) {
  const li = document.createElement('li');
  li.dataset.routeFallback = 'true';

  const link = document.createElement('a');
  const normalizedPath = normalizePath(routeConfig.path || routeConfig.href);
  link.setAttribute('href', routeConfig.href || normalizedPath);
  link.dataset.routeFallback = 'true';
  link.textContent = routeConfig.label || normalizedPath;

  if (normalizedPath === currentPath) {
    link.setAttribute('aria-current', 'page');
  }

  li.appendChild(link);
  return li;
}

function getManagedHamburgerRouteItem(verticalMenu, path) {
  if (!verticalMenu) return null;
  const normalized = normalizePath(path);

  return Array.from(verticalMenu.children || []).find((item) => {
    if (!(item instanceof Element) || item.tagName !== 'LI') return false;
    const link = item.querySelector('a[href]');
    if (!link || link.dataset.routeFallback !== 'true') return false;
    return normalizePath(link.getAttribute('href')) === normalized;
  }) || null;
}

function ensureManagedHamburgerRoute(verticalMenu, routeConfig, currentPath) {
  if (!verticalMenu || !routeConfig) return null;

  const normalizedPath = normalizePath(routeConfig.path || routeConfig.href);
  const existingLink = qsa('a[href]', verticalMenu).find((link) => normalizePath(link.getAttribute('href')) === normalizedPath) || null;

  if (existingLink) {
    if (existingLink.dataset.routeFallback === 'true') {
      existingLink.textContent = routeConfig.label || normalizedPath;
      if (normalizedPath === currentPath) {
        existingLink.setAttribute('aria-current', 'page');
      } else {
        existingLink.removeAttribute('aria-current');
      }
    }
    return existingLink;
  }

  const listItem = buildManagedHamburgerLink(routeConfig, currentPath);
  const routeOrder = HAMBURGER_FALLBACK_ROUTE_ORDER;
  const nextOrderIndex = routeOrder.indexOf(normalizedPath);
  const existingItems = Array.from(verticalMenu.children || []).filter((item) => item instanceof Element && item.tagName === 'LI');

  let insertBefore = null;
  if (nextOrderIndex >= 0) {
    insertBefore = existingItems.find((item) => {
      const link = item.querySelector('a[href]');
      if (!link) return false;
      const existingPath = normalizePath(link.getAttribute('href'));
      const existingOrderIndex = routeOrder.indexOf(existingPath);
      return existingOrderIndex >= 0 && existingOrderIndex > nextOrderIndex;
    }) || null;
  }

  verticalMenu.insertBefore(listItem, insertBefore);
  return listItem.querySelector('a[href]');
}

function removeManagedHamburgerRoute(verticalMenu, path) {
  const item = getManagedHamburgerRouteItem(verticalMenu, path);
  if (item) {
    item.remove();
  }
}

function ensureSidebarRoute(sidebarNav, routeConfig, currentPath) {
  if (!sidebarNav || !routeConfig) return null;

  const normalizedPath = normalizePath(routeConfig.path || routeConfig.href);
  const existingLink = qsa('a[href]', sidebarNav).find((link) => normalizePath(link.getAttribute('href')) === normalizedPath) || null;
  if (existingLink) {
    if (normalizedPath === currentPath) {
      existingLink.setAttribute('aria-current', 'page');
    }
    return existingLink;
  }

  const list = qs('ul', sidebarNav);
  if (!list) return null;

  const li = document.createElement('li');
  li.dataset.routeFallback = 'true';

  const link = document.createElement('a');
  link.setAttribute('href', routeConfig.href || normalizedPath);
  link.dataset.routeFallback = 'true';
  if (routeConfig.className) {
    link.className = routeConfig.className;
  }

  const icon = document.createElement('span');
  icon.className = 'sidebar-icon';
  icon.setAttribute('data-lucide', routeConfig.icon || 'circle');

  const label = document.createElement('span');
  label.className = 'sidebar-label';
  label.textContent = routeConfig.label || normalizedPath;

  if (normalizedPath === currentPath) {
    link.setAttribute('aria-current', 'page');
  }

  link.appendChild(icon);
  link.appendChild(label);
  li.appendChild(link);
  list.appendChild(li);
  return link;
}

function clearUnusedManagedNavigationFallbacks(verticalMenu, sidebarNav, requiredPaths = new Set()) {
  qsa('.vertical-menu a[href][data-route-fallback="true"]').forEach((link) => {
    const path = normalizePath(link.getAttribute('href'));
    if (!requiredPaths.has(path)) {
      link.parentElement?.remove();
    }
  });

  qsa('.sidebar-nav a[href][data-route-fallback="true"]').forEach((link) => {
    const path = normalizePath(link.getAttribute('href'));
    if (!requiredPaths.has(path)) {
      link.parentElement?.remove();
    }
  });
}

function auditNavigationCoverage() {
  const currentPath = normalizePath(window.location.pathname);
  let baselineState = getReachableNavigationState({ includeManagedFallbacks: false });
  const hamburgerPolicyChanged = enforceHamburgerRoutePolicy(baselineState);

  if (hamburgerPolicyChanged) {
    baselineState = getReachableNavigationState({ includeManagedFallbacks: false });
  }

  const missingRoutes = NAVIGATION_REACHABILITY_ROUTES.filter((route) => {
    const routePath = normalizePath(route.path || route.href);
    if (routePath === currentPath) return false;
    return !baselineState.coverage.has(routePath);
  });

  const requiredFallbackPaths = new Set();
  let hasMutatedNavigation = hamburgerPolicyChanged;

  missingRoutes.forEach((route) => {
    const routePath = normalizePath(route.path || route.href);
    const canUseHamburger = baselineState.hamburgerAvailable
      && baselineState.verticalMenu
      && shouldAllowRouteInHamburger(routePath, baselineState);
    const insertedInHamburger = canUseHamburger
      ? ensureManagedHamburgerRoute(baselineState.verticalMenu, route, currentPath)
      : null;

    if (insertedInHamburger) {
      requiredFallbackPaths.add(routePath);
      hasMutatedNavigation = true;
      return;
    }

    const insertedInSidebar = baselineState.sidebarNav
      ? ensureSidebarRoute(baselineState.sidebarNav, route, currentPath)
      : null;

    if (insertedInSidebar) {
      requiredFallbackPaths.add(routePath);
      hasMutatedNavigation = true;
    } else {
      console.warn('[ios26-ui] Navigation coverage gap for route:', routePath);
    }
  });

  clearUnusedManagedNavigationFallbacks(baselineState.verticalMenu, baselineState.sidebarNav, requiredFallbackPaths);

  if (hasMutatedNavigation) {
    safeRun('syncCompactEducationLabels(auditNavigationCoverage)', syncCompactEducationLabels);
    safeRun('refreshIconsAndFallbacks(auditNavigationCoverage)', refreshIconsAndFallbacks);
  }
}

  function isEditableField(el) {
    if (!(el instanceof Element)) return false;
    if (el.matches('textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;
    if (!el.matches('input')) return false;

    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'file', 'color', 'image', 'hidden'].includes(type);
  }

  function getVisibleBottomOverlayHeight() {
    const viewportHeight = getViewportHeight();

    return qsa('.cookie-banner, #cookieBanner').reduce((max, el) => {
      if (!el) return max;

      const styles = window.getComputedStyle(el);
      if (styles.display === 'none' || styles.visibility === 'hidden') return max;

      const rect = el.getBoundingClientRect();
      if (!rect.height) return max;

      const isBottomOverlay = (styles.position === 'fixed' || styles.position === 'sticky')
        && rect.bottom >= (viewportHeight - 2);

      return isBottomOverlay ? Math.max(max, Math.ceil(rect.height)) : max;
    }, 0);
  }

  function getRemSizeInPx() {
    const fontSize = parseFloat(window.getComputedStyle(document.documentElement).fontSize || '16');
    return Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 16;
  }

  function isTouchAppleDevice() {
    try {
      const ua = navigator.userAgent || '';
      return /iPhone|iPad|iPod/i.test(ua)
        || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
    } catch (e) {
      return false;
    }
  }

  function isStandaloneDisplayMode() {
    try {
      return !!(
        window.matchMedia?.('(display-mode: standalone)').matches
        || window.navigator.standalone === true
      );
    } catch (e) {
      return false;
    }
  }

  function shouldOptimizeMobileBrowserUi() {
    if (!document.documentElement || !document.body) return false;
    if (!isTouchAppleDevice() || isStandaloneDisplayMode()) return false;

    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
    const viewportWidth = getViewportWidth();

    return !!(coarsePointer || (viewportWidth > 0 && viewportWidth <= 1100));
  }

  function isLikelyMobileTouchBrowser() {
    try {
      const ua = navigator.userAgent || '';
      if (/Android|webOS|iPhone|iPod|Mobile|Tablet|Silk|Kindle|Opera Mini|IEMobile/i.test(ua)) {
        return true;
      }
    } catch (e) {
      /* noop */
    }

    if (isTouchAppleDevice()) return true;

    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
    const hoverNone = window.matchMedia?.('(hover: none)').matches;
    return !!(coarsePointer && hoverNone);
  }

  function shouldLockMobileNavigationUi() {
    if (!LOCK_MOBILE_NAVIGATION_ON_TOUCH_DEVICES) return false;
    if (!isLikelyMobileTouchBrowser()) return false;

    const viewportWidth = getViewportWidth();
    return viewportWidth > 0 && viewportWidth <= 1366;
  }

  function shouldPinMobileDockForSafariChrome() {
    return shouldLockMobileNavigationUi();
  }

  function syncScrollTopButtonPositionMode(isPinned = shouldLockMobileNavigationUi()) {
    const btn = ensureScrollTopButton();
    if (!btn) return;

    if (isPinned) {
      btn.style.setProperty('transition', 'none', 'important');
      btn.style.setProperty('transform', 'none', 'important');
      return;
    }

    btn.style.removeProperty('transition');
    btn.style.removeProperty('transform');
  }

  function readCssPxNumber(value, fallback = 0) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getLayoutViewportHeight() {
    return window.innerHeight || document.documentElement?.clientHeight || getViewportHeight();
  }

  function getPinnedDockAnchorMetrics(dock) {
    if (!dock) {
      return {
        bottomGap: 0,
        height: 0,
        visibleLift: 0,
        scrollTopBottom: 0
      };
    }

    const computedStyle = window.getComputedStyle ? window.getComputedStyle(dock) : null;
    const dockRect = dock.getBoundingClientRect ? dock.getBoundingClientRect() : null;
    const rectHeight = dockRect ? Math.max(0, Math.round(dockRect.height)) : 0;
    const computedBottomGap = Math.max(0, Math.round(readCssPxNumber(computedStyle?.bottom, 0)));
    const layoutViewportHeight = Math.max(getLayoutViewportHeight(), 1);
    const measuredLayoutBottomGap = dockRect
      ? Math.max(0, Math.round(layoutViewportHeight - dockRect.bottom))
      : computedBottomGap;
    const fallbackHeight = Math.max(
      0,
      Math.round(
        dock.offsetHeight
        || readCssPxNumber(computedStyle?.height, 0)
        || rectHeight
        || 0
      )
    );
    const height = rectHeight > 0 ? rectHeight : fallbackHeight;
    const bottomGap = computedBottomGap > 0
      ? computedBottomGap
      : measuredLayoutBottomGap;
    const visibleLift = Math.max(0, height + bottomGap);
    const scrollTopBottom = Math.max(0, visibleLift + MOBILE_DOCK_SCROLL_TOP_GAP_PX);

    return {
      bottomGap,
      height,
      visibleLift,
      scrollTopBottom
    };
  }

  function getDockAnchorMetrics(dock, viewportHeight = getViewportHeight()) {
    if (!dock) {
      return {
        bottomGap: 0,
        height: 0,
        visibleLift: 0,
        scrollTopBottom: 0
      };
    }

    const computedStyle = window.getComputedStyle ? window.getComputedStyle(dock) : null;
    const dockRect = dock.getBoundingClientRect ? dock.getBoundingClientRect() : null;
    const rectHeight = dockRect ? Math.max(0, Math.round(dockRect.height)) : 0;
    const fallbackBottomGap = Math.max(0, Math.round(readCssPxNumber(computedStyle?.bottom, 0)));
    const fallbackHeight = Math.max(
      0,
      Math.round(
        dock.offsetHeight
        || readCssPxNumber(computedStyle?.height, 0)
        || rectHeight
        || 0
      )
    );

    const measuredBottomGap = dockRect
      ? Math.max(0, Math.round(viewportHeight - dockRect.bottom))
      : fallbackBottomGap;
    const measuredVisibleLift = dockRect
      ? Math.max(0, Math.round(viewportHeight - dockRect.top))
      : Math.max(0, fallbackHeight + fallbackBottomGap);

    const visibleLift = measuredVisibleLift > 0
      ? measuredVisibleLift
      : Math.max(0, fallbackHeight + fallbackBottomGap);
    const bottomGap = measuredBottomGap > 0
      ? measuredBottomGap
      : fallbackBottomGap;
    const height = rectHeight > 0 ? rectHeight : fallbackHeight;
    const scrollTopBottom = Math.max(0, visibleLift + MOBILE_DOCK_SCROLL_TOP_GAP_PX);

    return {
      bottomGap,
      height,
      visibleLift,
      scrollTopBottom
    };
  }

  function shouldGuardTransientViewportResize() {
    if (!document.documentElement || !document.body) return false;
    if (isStandaloneDisplayMode()) return false;

    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
    const viewportWidth = getViewportWidth();
    return !!(coarsePointer || (viewportWidth > 0 && viewportWidth <= 1100));
  }

  function setupTransientViewportResizeGuard() {
    if (window.__vildaTransientViewportResizeGuardInstalled) return;
    window.__vildaTransientViewportResizeGuardInstalled = true;

    let lastWidth = getViewportWidth();
    let lastHeight = getViewportHeight();
    let orientationCooldownUntil = 0;
    let settleTimer = 0;

    const syncBaseline = () => {
      lastWidth = getViewportWidth();
      lastHeight = getViewportHeight();
    };

    on(window, 'orientationchange', () => {
      orientationCooldownUntil = Date.now() + 1200;
      window.clearTimeout(settleTimer);
      window.setTimeout(syncBaseline, 180);
    }, { passive: true });

    window.addEventListener('resize', (event) => {
      const nextWidth = getViewportWidth();
      const nextHeight = getViewportHeight();
      const widthDelta = Math.abs(nextWidth - lastWidth);
      const heightDelta = Math.abs(nextHeight - lastHeight);
      const keyboardLikely = isEditableField(document.activeElement) || heightDelta > 220;
      const transientBrowserUiResize = shouldGuardTransientViewportResize()
        && Date.now() > orientationCooldownUntil
        && widthDelta <= 2
        && heightDelta >= 20
        && heightDelta <= 180
        && !keyboardLikely;

      lastWidth = nextWidth;
      lastHeight = nextHeight;

      if (!transientBrowserUiResize) return;

      if (event && typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }

      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        safeRun('applyMobileBrowserUiOptimization(settled)', applyMobileBrowserUiOptimization);
        if (typeof window.__vildaDockUpdate === 'function') {
          window.__vildaDockUpdate('browser-ui-resize');
        }
      }, 120);
    }, true);
  }

  function applyMobileBrowserUiOptimization() {
    const enabled = shouldOptimizeMobileBrowserUi();
    const lockedMobileNavigation = shouldLockMobileNavigationUi();
    const root = document.documentElement;
    const body = document.body;
    if (!root || !body) return false;

    syncLockedMobileNavigationClass(lockedMobileNavigation);
    root.classList.toggle('mobile-browser-ui-optimized', enabled);
    body.classList.toggle('mobile-browser-ui-optimized', enabled);

    if (!enabled) {
      root.style.height = '';
      body.style.height = '';
      root.style.minHeight = '';
      body.style.minHeight = '';
      root.style.overscrollBehaviorY = '';
      body.style.overscrollBehaviorY = '';
      root.style.webkitOverflowScrolling = '';
      body.style.webkitOverflowScrolling = '';
      return false;
    }

    root.style.height = 'auto';
    body.style.height = 'auto';
    root.style.minHeight = '100%';
    body.style.minHeight = '100%';
    root.style.overscrollBehaviorY = 'auto';
    body.style.overscrollBehaviorY = 'auto';
    root.style.webkitOverflowScrolling = 'touch';
    body.style.webkitOverflowScrolling = 'touch';

    if (window.CSS?.supports?.('min-height: 100svh')) {
      body.style.minHeight = '100svh';
    } else if (window.CSS?.supports?.('min-height: 100dvh')) {
      body.style.minHeight = '100dvh';
    }

    return true;
  }

  function primeMobileBrowserUiChrome() {
    if (!shouldOptimizeMobileBrowserUi()) return false;
    if (window.location.hash) return false;
    if (document.activeElement && isEditableField(document.activeElement)) return false;

    const snapshot = getWindowScrollSnapshot();
    if ((snapshot.max || 0) < 64) return false;
    if ((snapshot.top || 0) > 0.5) return false;

    window.requestAnimationFrame(() => {
      try {
        window.scrollTo(0, Math.min(1, snapshot.max || 0));
      } catch (e) {
        /* noop */
      }
    });
    return true;
  }

  function getRootScrollElement() {
    return document.scrollingElement || document.documentElement || document.body || null;
  }

  function getViewportWidth() {
    const visualViewportWidth = window.visualViewport?.width || 0;
    if (visualViewportWidth > 0) return visualViewportWidth;
    return window.innerWidth || document.documentElement?.clientWidth || 0;
  }

  function getViewportHeight() {
    const visualViewportHeight = window.visualViewport?.height || 0;
    if (visualViewportHeight > 0) return visualViewportHeight;
    return window.innerHeight || document.documentElement?.clientHeight || 0;
  }

  function getWindowScrollSnapshot() {
    const root = getRootScrollElement();
    const viewportHeight = getViewportHeight();
    const currentY = Math.max(
      window.scrollY || 0,
      window.pageYOffset || 0,
      root?.scrollTop || 0,
      document.documentElement?.scrollTop || 0,
      document.body?.scrollTop || 0
    );
    const fullHeight = Math.max(
      root?.scrollHeight || 0,
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0
    );
    const visibleHeight = viewportHeight
      || root?.clientHeight
      || document.documentElement?.clientHeight
      || document.body?.clientHeight
      || 0;

    return {
      target: window,
      top: Math.max(currentY, 0),
      max: Math.max(fullHeight - visibleHeight, 0)
    };
  }

  function isScrollableElement(el) {
    if (!(el instanceof Element)) return false;

    const styles = window.getComputedStyle(el);
    const overflowY = `${styles.overflowY || ''} ${styles.overflow || ''}`.toLowerCase();
    const allowsScroll = /(auto|scroll|overlay)/.test(overflowY);
    if (!allowsScroll) return false;

    return (el.scrollHeight - el.clientHeight) > 16;
  }

  function getElementScrollSnapshot(el) {
    if (!isScrollableElement(el)) return null;

    return {
      target: el,
      top: Math.max(el.scrollTop || 0, 0),
      max: Math.max((el.scrollHeight || 0) - (el.clientHeight || 0), 0)
    };
  }

  function collectDockScrollCandidates() {
    const seen = new Set();
    const candidates = [];

    const addCandidate = (target) => {
      if (!target) return;
      const normalized = target === document ? window : target;
      if (seen.has(normalized)) return;
      seen.add(normalized);
      candidates.push(normalized);
    };

    addCandidate(window);
    addCandidate(getRootScrollElement());
    addCandidate(document.documentElement);
    addCandidate(document.body);

    qsa('[data-mobile-dock-scroll], .main-content, .main-content > .container, main, .container')
      .forEach(addCandidate);

    return candidates;
  }

  function getPreferredDockScrollSnapshot(preferredTarget = null) {
    const orderedCandidates = [];
    const pushCandidate = (target) => {
      if (!target) return;
      const normalized = target === document ? window : target;
      if (orderedCandidates.includes(normalized)) return;
      orderedCandidates.push(normalized);
    };

    pushCandidate(preferredTarget);
    collectDockScrollCandidates().forEach(pushCandidate);

    let best = getWindowScrollSnapshot();

    orderedCandidates.forEach((candidate) => {
      const snapshot = candidate === window ? getWindowScrollSnapshot() : getElementScrollSnapshot(candidate);
      if (!snapshot) return;

      const bestIsIdleWindow = best.target === window && best.max <= 0 && best.top <= 0;
      const snapshotHasProgress = snapshot.top > 0 || snapshot.max > 0;
      const bestScore = best.max + (best.top > 0 ? 1000000 : 0);
      const snapshotScore = snapshot.max + (snapshot.top > 0 ? 1000000 : 0);

      if (bestIsIdleWindow && snapshotHasProgress) {
        best = snapshot;
        return;
      }

      if (snapshotScore > bestScore + 4) {
        best = snapshot;
      }
    });

    return best;
  }

  function shouldUseMobileDockLayout() {
    const viewportWidth = getViewportWidth();

    if (window.matchMedia && window.matchMedia(MOBILE_DOCK_BREAKPOINT).matches) {
      return true;
    }

    if (isTouchAppleDevice() && viewportWidth > 0 && viewportWidth <= 1366) {
      return true;
    }

    return viewportWidth > 0 && viewportWidth <= 1100;
  }

  function shouldEnableMobileDock() {
    if (!shouldShowMobileDockByPreference()) return false;
    return shouldUseMobileDockLayout();
  }

  function setupMobileBottomDock() {
    if (!document.body || qs('#mobileBottomDock')) return;

    const navEntries = collectNavEntries();
    const currentPath = normalizePath(window.location.pathname);

    const dockEntries = MOBILE_DOCK_FIXED_ITEMS.map((config) => {
      const normalizedPath = normalizePath(config.path || config.href);
      const navEntry = getNavEntryForPath(normalizedPath, navEntries) || {};
      const fallback = MOBILE_DOCK_FALLBACKS[normalizedPath] || {};

      return {
        path: normalizedPath,
        href: config.href || navEntry.href || fallback.href || normalizedPath,
        label: config.label || navEntry.label || fallback.label || normalizedPath,
        icon: config.icon || navEntry.icon || fallback.icon || 'circle'
      };
    }).filter(Boolean);

    if (!dockEntries.length) return;

    const dock = document.createElement('nav');
    dock.id = 'mobileBottomDock';
    dock.className = 'mobile-bottom-dock';
    dock.setAttribute('aria-label', 'Szybka nawigacja');

    const list = document.createElement('div');
    list.className = 'mobile-bottom-dock__list';

    dockEntries.forEach((entry) => {
      const anchor = document.createElement('a');
      anchor.className = 'mobile-bottom-dock__item';
      anchor.href = entry.href;

      if (normalizePath(entry.href) === currentPath) {
        anchor.classList.add('is-active');
        anchor.setAttribute('aria-current', 'page');
      }

      const iconWrap = document.createElement('span');
      iconWrap.className = 'mobile-bottom-dock__icon';
      iconWrap.setAttribute('aria-hidden', 'true');

      const icon = document.createElement('span');
      icon.setAttribute('data-lucide', entry.icon || 'circle');
      iconWrap.appendChild(icon);

      const label = document.createElement('span');
      label.className = 'mobile-bottom-dock__label';
      label.dataset.fullLabel = entry.label;
      label.textContent = getResponsiveNavLabel(entry.path, entry.label);
      anchor.setAttribute('aria-label', getAccessibleNavLabel(entry.path, entry.label));
      if (normalizePath(entry.path) === EDUCATION_PAGE_PATH && shouldUseCompactEducationLabel()) {
        anchor.title = getAccessibleNavLabel(entry.path, entry.label);
      }

      anchor.append(iconWrap, label);
      list.appendChild(anchor);
    });

    dock.appendChild(list);
    document.body.appendChild(dock);

    const mediaQuery = window.matchMedia(MOBILE_DOCK_BREAKPOINT);
    let activeScrollTarget = window;
    let lastScrollY = 0;
    let ticking = false;
    let hasInitialDockState = false;
    let lastViewportWidth = getViewportWidth();
    let lastViewportHeight = getViewportHeight();
    let resizeSettleTimer = 0;
    const detachScrollListeners = [];
    const shouldPinDock = () => shouldLockMobileNavigationUi();

    function syncDockVisibilityClass() {
      const isVisible = !dock.hidden
        && !dock.classList.contains('is-hidden')
        && !dock.classList.contains('is-keyboard-hidden');
      document.body.classList.toggle('has-mobile-bottom-dock-visible', isVisible);
    }

    function setDockVisible(visible) {
      const mustStayVisible = shouldPinDock() && !dock.classList.contains('is-keyboard-hidden');
      const shouldHide = !visible && !mustStayVisible;
      if (dock.classList.contains('is-hidden') === shouldHide) {
        syncDockVisibilityClass();
        updateDockMetrics();
        return;
      }
      dock.classList.toggle('is-hidden', shouldHide);
      syncDockVisibilityClass();
      updateDockMetrics();
    }

    function updateDockMetrics() {
      const enabled = shouldEnableMobileDock();
      const lockedMobileNavigation = shouldLockMobileNavigationUi();
      const extraOffset = enabled ? getVisibleBottomOverlayHeight() : 0;
      const rootStyle = document.documentElement.style;
      const baseScrollTopBottom = Math.round(getRemSizeInPx() + Math.max(0, extraOffset));
      let nextVisibleLift = 0;
      let nextScrollTopBottom = baseScrollTopBottom;

      syncLockedMobileNavigationClass(lockedMobileNavigation);
      syncScrollTopButtonPositionMode(lockedMobileNavigation);
      rootStyle.setProperty('--mobile-dock-extra-offset', `${Math.max(0, extraOffset)}px`);

      const isVisible = enabled
        && !dock.hidden
        && !dock.classList.contains('is-hidden')
        && !dock.classList.contains('is-keyboard-hidden');

      if (isVisible) {
        const dockMetrics = lockedMobileNavigation
          ? getPinnedDockAnchorMetrics(dock)
          : getDockAnchorMetrics(dock, getViewportHeight());
        nextVisibleLift = dockMetrics.visibleLift;
        nextScrollTopBottom = Math.max(baseScrollTopBottom, dockMetrics.scrollTopBottom);
      }

      rootStyle.setProperty('--mobile-dock-visible-lift', `${Math.max(0, nextVisibleLift)}px`);
      rootStyle.setProperty('--scroll-top-btn-bottom', `${Math.max(0, nextScrollTopBottom)}px`);
    }

    function bindScrollTarget(target) {
      if (!target) return;

      const eventTarget = target === document ? window : target;
      const handler = () => {
        if (eventTarget !== window && eventTarget instanceof Element) {
          activeScrollTarget = eventTarget;
        }
        requestDockUpdate();
      };

      on(eventTarget, 'scroll', handler, { passive: true });
      detachScrollListeners.push(() => eventTarget.removeEventListener('scroll', handler));
    }

    function refreshScrollBindings() {
      while (detachScrollListeners.length) {
        const dispose = detachScrollListeners.pop();
        if (typeof dispose === 'function') dispose();
      }

      collectDockScrollCandidates().forEach(bindScrollTarget);
    }

    function readDockScrollSnapshot() {
      const snapshot = getPreferredDockScrollSnapshot(activeScrollTarget);
      activeScrollTarget = snapshot.target;
      return snapshot;
    }

    function syncDockMode(options = {}) {
      const preserveVisibility = options.preserveVisibility !== false;
      refreshScrollBindings();

      const enabled = shouldEnableMobileDock();
      const lockedMobileNavigation = syncLockedMobileNavigationClass(shouldLockMobileNavigationUi());
      const pinnedDockMode = enabled && shouldPinDock();
      dock.hidden = !enabled;
      document.body.classList.toggle('has-mobile-bottom-dock', enabled);
      document.body.classList.toggle('ios-safari-dock-pinned', pinnedDockMode);
      document.body.classList.toggle('mobile-dock-pinned', pinnedDockMode);
      syncScrollTopButtonPositionMode(lockedMobileNavigation);

      if (!enabled) {
        dock.classList.remove('is-hidden', 'is-keyboard-hidden');
        document.body.classList.remove('has-mobile-bottom-dock-visible');
        document.body.classList.remove('ios-safari-dock-pinned');
        document.body.classList.remove('mobile-dock-pinned');
        document.documentElement.style.setProperty('--mobile-dock-extra-offset', '0px');
        document.documentElement.style.setProperty('--mobile-dock-visible-lift', '0px');
        document.documentElement.style.setProperty('--scroll-top-btn-bottom', `${Math.round(getRemSizeInPx())}px`);
        lastScrollY = getWindowScrollSnapshot().top;
        activeScrollTarget = window;
        hasInitialDockState = false;
        safeRun('auditNavigationCoverage(syncDockMode:disabled)', auditNavigationCoverage);
        return;
      }

      const snapshot = readDockScrollSnapshot();
      lastScrollY = snapshot.top;

      if (!hasInitialDockState || !preserveVisibility || shouldPinDock()) {
        setDockVisible(true);
      } else {
        syncDockVisibilityClass();
        updateDockMetrics();
      }

      hasInitialDockState = true;
      safeRun('auditNavigationCoverage(syncDockMode:enabled)', auditNavigationCoverage);
    }

    function handleViewportResize(forceSync = false) {
      const currentWidth = getViewportWidth();
      const currentHeight = getViewportHeight();
      const widthDelta = Math.abs(currentWidth - lastViewportWidth);
      const heightDelta = Math.abs(currentHeight - lastViewportHeight);
      const widthChanged = widthDelta > 4;
      const transientHeightOnlyShift = !forceSync
        && widthDelta <= 2
        && heightDelta >= 18
        && heightDelta <= 220
        && !dock.classList.contains('is-keyboard-hidden');

      lastViewportWidth = currentWidth;
      lastViewportHeight = currentHeight;

      if (forceSync || widthChanged) {
        syncDockMode({ preserveVisibility: !forceSync });
        return;
      }

      updateDockMetrics();

      if (transientHeightOnlyShift) {
        window.clearTimeout(resizeSettleTimer);
        resizeSettleTimer = window.setTimeout(() => {
          updateDockMetrics();
        }, 120);
      }
    }

    function updateDockOnScroll() {
      if (!shouldEnableMobileDock() || dock.classList.contains('is-keyboard-hidden')) return;

      const snapshot = readDockScrollSnapshot();
      const currentY = snapshot.top;
      const delta = currentY - lastScrollY;
      const nearBottom = (snapshot.max - currentY) <= 28;

      if (shouldPinDock()) {
        if (dock.classList.contains('is-hidden')) {
          setDockVisible(true);
        } else {
          syncDockVisibilityClass();
        }
        lastScrollY = currentY;
        return;
      }

      if (snapshot.max <= 20) {
        setDockVisible(true);
        lastScrollY = currentY;
        updateDockMetrics();
        return;
      }

      if (Math.abs(delta) < 12) {
        lastScrollY = currentY;
        updateDockMetrics();
        return;
      }

      if (currentY <= 24) {
        setDockVisible(true);
      } else if (delta > 14 && currentY > 120) {
        setDockVisible(false);
      } else if (delta < -18) {
        setDockVisible(true);
      } else if (nearBottom) {
        updateDockMetrics();
      }

      lastScrollY = currentY;
      updateDockMetrics();
    }

    function requestDockUpdate() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        updateDockOnScroll();
        ticking = false;
      });
    }

    on(window, 'resize', () => handleViewportResize(false), { passive: true });
    on(window, 'orientationchange', () => handleViewportResize(true), { passive: true });
    on(window, 'load', () => syncDockMode({ preserveVisibility: false }), { passive: true, once: true });
    on(window, 'pageshow', () => syncDockMode({ preserveVisibility: true }), { passive: true });
    if (window.visualViewport) {
      on(window.visualViewport, 'resize', () => handleViewportResize(false), { passive: true });
      on(window.visualViewport, 'scroll', () => {
        if (shouldPinDock()) return;
        updateDockMetrics();
      }, { passive: true });
    }

    document.addEventListener('focusin', (event) => {
      if (!shouldEnableMobileDock()) return;
      if (isEditableField(event.target)) {
        dock.classList.add('is-keyboard-hidden');
        syncDockVisibilityClass();
      }
    });

    document.addEventListener('focusout', () => {
      if (!shouldEnableMobileDock()) return;
      window.setTimeout(() => {
        if (!isEditableField(document.activeElement)) {
          dock.classList.remove('is-keyboard-hidden');
          setDockVisible(true);
          syncDockVisibilityClass();
        }
        handleViewportResize(false);
      }, 120);
    });

    if ('MutationObserver' in window) {
      const overlayObserver = new MutationObserver(() => {
        updateDockMetrics();
      });
      qsa('.cookie-banner, #cookieBanner').forEach((overlay) => {
        overlayObserver.observe(overlay, { attributes: true, childList: true, subtree: true });
      });
    }

    if (typeof ResizeObserver !== 'undefined') {
      const dockResizeObserver = new ResizeObserver(() => {
        updateDockMetrics();
      });
      dockResizeObserver.observe(dock);
      dockResizeObserver.observe(list);
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', () => syncDockMode({ preserveVisibility: false }));
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(() => syncDockMode({ preserveVisibility: false }));
    }

    window.__vildaDockUpdate = (reason) => {
      if (reason === 'browser-ui-resize') {
        handleViewportResize(false);
        requestDockUpdate();
        return;
      }
      updateDockMetrics();
    };
    window.__vildaDockSyncMode = syncDockMode;

    syncDockMode({ preserveVisibility: false });
    window.setTimeout(() => syncDockMode({ preserveVisibility: true }), 250);
    window.setTimeout(() => syncDockMode({ preserveVisibility: true }), 1200);
    window.setTimeout(refreshIconsAndFallbacks, 0);
  }


  /**
   * Numer wersji schematu stanu zapisywanego w localStorage.  Zwiększ tę
   * wartość za każdym razem, gdy zmieniasz strukturę danych.  Funkcja
   * migrateIfNeeded() wykorzystuje tę stałą, aby wykonać odpowiednie
   * migracje.
   */
  const APP_SCHEMA_VER = 1;

  /**
   * Odczytuje zapisany stan z localStorage, zwracając pusty obiekt w
   * przypadku błędu.  Korzysta ze wspólnego klucza dla aplikacji.
   */
  function getSaved() {
    try {
      return JSON.parse(localStorage.getItem('wagaiwzrost_state') || '{}');
    } catch (e) {
      return {};
    }
  }

  /**
   * Aktualizuje zapisany stan w localStorage do najnowszej wersji
   * schematu.  Dodaj tutaj kolejne bloki if dla poszczególnych migracji.
   * Migracje powinny być idempotentne — tzn. ich wielokrotne wykonanie
   * nie powinno zmieniać danych kolejny raz.
   */
  function migrateIfNeeded() {
    const data = getSaved();
    const current = Number(data?.schemaVersion ?? 0);
    if (current === APP_SCHEMA_VER) return;
    let migrated = { ...data };
    // Przykładowa migracja: jeśli zmieniła się nazwa pola height_cm na height.
    if (current <= 0 && migrated.height_cm && !migrated.height) {
      migrated.height = migrated.height_cm;
      delete migrated.height_cm;
    }
    // Ustaw nową wersję schematu.
    migrated.schemaVersion = APP_SCHEMA_VER;
    try {
      localStorage.setItem('wagaiwzrost_state', JSON.stringify(migrated));
    } catch (e) {
      console.warn('State migration could not be persisted', e);
    }
  }

  /**
   * Wstrzykuje style dolnego banera aktualizacji PWA.  Baner pozostaje
   * jedynym komunikatem o nowej wersji aplikacji, a przycisk „Przeładuj”
   * otrzymuje tę samą fioletową pulsującą obwódkę, co stały przycisk
   * „Pomoc”.
   */
  function ensureUpdateBannerStyles() {
    if (document.getElementById('ww-sw-update-banner-styles')) return;
    const style = document.createElement('style');
    style.id = 'ww-sw-update-banner-styles';
    style.textContent = `
      @keyframes wwHelpPulsePurple {
        0% {
          box-shadow: 0 0 0 0 rgba(153, 0, 255, 0.26);
        }
        70% {
          box-shadow: 0 0 0 10px rgba(153, 0, 255, 0.08);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(153, 0, 255, 0);
        }
      }

      #sw-update-banner {
        box-sizing: border-box;
        flex-wrap: wrap;
        row-gap: .65rem;
      }

      #sw-update-banner .ww-sw-update-banner__message {
        flex: 1 1 14rem;
        min-width: 0;
        line-height: 1.35;
      }

      #sw-update-banner .ww-sw-update-banner__actions {
        display: flex;
        gap: .5rem;
        flex: 0 0 auto;
        align-items: center;
      }

      #sw-update-banner #sw-refresh {
        position: relative;
        isolation: isolate;
        overflow: visible;
      }

      #sw-update-banner #sw-refresh::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        border: 1.5px solid rgba(153, 0, 255, 0.72);
        box-shadow: 0 0 0 0 rgba(153, 0, 255, 0);
        pointer-events: none;
      }

      #sw-update-banner #sw-refresh.ww-sw-refresh--pulse::after {
        animation: wwHelpPulsePurple 1.333333s ease-in-out infinite;
      }

      @media (max-width: 560px) {
        #sw-update-banner {
          align-items: stretch;
        }

        #sw-update-banner .ww-sw-update-banner__actions {
          width: 100%;
        }

        #sw-update-banner .ww-sw-update-banner__actions .btn {
          flex: 1 1 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #sw-update-banner #sw-refresh.ww-sw-refresh--pulse::after {
          animation: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Wyświetla dolny baner informujący o dostępnej aktualizacji.  Po
   * kliknięciu „Przeładuj” wysyła do service worker'a komunikat o
   * natychmiastowym przejęciu kontroli.  Po kliknięciu „Później” baner
   * znika.
   */
  function showUpdateBanner(onReload) {
    // Sprawdź, czy baner już istnieje.
    if (document.getElementById('sw-update-banner')) return;
    ensureUpdateBannerStyles();
    const bar = document.createElement('div');
    bar.id = 'sw-update-banner';
    bar.setAttribute('role', 'alert');
    bar.setAttribute('aria-live', 'polite');
    bar.style.cssText = `
      position:fixed;
      inset:auto 1rem 1rem 1rem;
      z-index:9999;
      padding:.75rem 1rem;
      border-radius:.75rem;
      box-shadow:0 10px 30px rgba(0,0,0,.15);
      background:#fff;
      display:flex;
      gap:.75rem;
      align-items:center;
      justify-content:space-between;
      font-size:1rem;
    `;
    bar.innerHTML = `
      <span class="ww-sw-update-banner__message"><strong>Nowa wersja aplikacji</strong> — przeładować?</span>
      <div class="ww-sw-update-banner__actions">
        <button id="sw-refresh" class="btn ww-sw-refresh--pulse">Przeładuj</button>
        <button id="sw-dismiss" class="btn" style="opacity:.8">Później</button>
      </div>
    `;
    document.body.appendChild(bar);
    const refresh = bar.querySelector('#sw-refresh');
    const dismiss = bar.querySelector('#sw-dismiss');
    refresh?.addEventListener('click', () => {
      if (typeof onReload === 'function') onReload();
    });
    dismiss?.addEventListener('click', () => {
      bar.remove();
    });
  }

  /**
   * Rejestruje service worker'a i nasłuchuje jego stanu, aby w razie
   * dostępności aktualizacji pokazać baner.  Gdy nowy service worker
   * przejmie kontrolę, odświeża stronę po migracji danych.
   */
  async function setupSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('/service-worker-kalorii.js');
      function listen(registration) {
        if (!registration) return;
        // Jeżeli nowy service worker czeka na aktywację, pokaż baner.
        if (registration.waiting) {
          showUpdateBanner(() => {
            registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
          });
        }
        registration.addEventListener('updatefound', () => {
          const newSW = registration.installing;
          newSW?.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner(() => {
                registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
              });
            }
          });
        });
      }
      listen(reg);
      // Po przejęciu kontroli przez nowy service worker przeładuj stronę.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        migrateIfNeeded();
        window.location.reload();
      });
    } catch (e) {
      console.warn('Service Worker registration failed', e);
    }
  }

})();