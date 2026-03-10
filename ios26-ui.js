

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
  const THEME_LEVELS = [0, 1, 2];

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
      <svg viewBox="0 0 24 24" width="48" height="48" aria-hidden="true" focusable="false">
        <path d="M12 19V5" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></path>
        <path d="M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `;
  }

  function ensureScrollTopFallback() {
    qsa('#scrollTopBtn').forEach((btn) => {
      if (btn.querySelector('svg')) return;

      const iconHost = btn.querySelector('[data-lucide], i, span');
      if (iconHost && iconHost.querySelector('svg')) return;

      btn.innerHTML = getArrowUpSvgMarkup();
    });
  }

  function refreshIconsAndFallbacks() {
    refreshLucideIcons();
    ensureScrollTopFallback();
  }

  /**
   * Odczytuje poziom ustawienia wyglądu z localStorage.
   * Zwraca jedną z dozwolonych wartości 0/1/2 lub wartość domyślną.
   */
  function readThemeLevel(key, fallback = 0) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined || raw === '') return fallback;
      const parsed = parseInt(raw, 10);
      return THEME_LEVELS.includes(parsed) ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  }

  /**
   * Nakłada na <body> klasy odpowiadające ustawieniom z sekcji
   * „Wygląd aplikacji” (ciemne tło i płynne szkło).
   *
   * Funkcja jest wystawiona globalnie jako window.applyThemeCustom,
   * ponieważ wywołują ją suwaki na stronie ustawień.
   */
  function applyThemeCustom() {
    const body = document.body;
    if (!body) return { dark: 0, glass: 0 };

    const darkLevel = readThemeLevel('darkBgLevel', 0);
    const glassLevel = readThemeLevel('glassLevel', 0);

    THEME_LEVELS.forEach((level) => {
      body.classList.remove(`dark-bg-level-${level}`);
      body.classList.remove(`glass-level-${level}`);
    });

    body.classList.add(`dark-bg-level-${darkLevel}`);
    body.classList.add(`glass-level-${glassLevel}`);

    return { dark: darkLevel, glass: glassLevel };
  }

  window.applyThemeCustom = applyThemeCustom;

  // Zastosuj zapisany wygląd także po powrocie z historii/BFCache oraz
  // po zmianie localStorage w innej karcie.
  window.addEventListener('pageshow', applyThemeCustom);
  window.addEventListener('storage', applyThemeCustom);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) applyThemeCustom();
  });


  let hasInitialised = false;

  function initLiquidUi() {
    if (hasInitialised) return;
    hasInitialised = true;

    safeRun('migrateIfNeeded', migrateIfNeeded);
    safeRun('setupSW', setupSW);

    if (document.body) {
      document.body.classList.add('liquid-ios26');
    }

    safeRun('applyThemeCustom', applyThemeCustom);
    safeRun('glassify', glassify);
    safeRun('setupPressFeedback', setupPressFeedback);
    safeRun('observeAppear', observeAppear);
    safeRun('setupMobileBottomDock', setupMobileBottomDock);
    safeRun('refreshIconsAndFallbacks', refreshIconsAndFallbacks);

    const delayedRefresh = () => safeRun('refreshIconsAndFallbacks', refreshIconsAndFallbacks);
    const delayedDockRetry = () => safeRun('setupMobileBottomDock(retry)', setupMobileBottomDock);
    window.setTimeout(delayedRefresh, 150);
    window.setTimeout(delayedRefresh, 900);
    window.setTimeout(delayedDockRetry, 250);
    on(window, 'load', () => {
      delayedDockRetry();
      delayedRefresh();
    }, { passive: true, once: true });
    on(window, 'pageshow', () => {
      delayedDockRetry();
      delayedRefresh();
    }, { passive: true });
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
  const MOBILE_DOCK_CORE_PATHS = ['index.html', 'docpro.html', 'kalkulator-klirens.html', 'cukrzyca.html'];
  const MOBILE_DOCK_DEFAULT_EXTRA_PATH = 'homa-ir.html';
  const MOBILE_DOCK_FALLBACKS = {
    'index.html': { href: 'index.html', label: 'Start', icon: 'home' },
    'docpro.html': { href: 'docpro.html', label: 'DocPro', icon: 'stethoscope' },
    'homa-ir.html': { href: 'homa-ir.html', label: 'HOMA‑IR', icon: 'calculator' },
    'kalkulator-klirens.html': { href: 'kalkulator-klirens.html', label: 'Klirens', icon: 'droplets' },
    'cukrzyca.html': { href: 'cukrzyca.html', label: 'Cukrzyca', icon: 'syringe' },
    'steroidy.html': { href: 'steroidy.html', label: 'Steroidy', icon: 'pill' },
    'materialy-edukacyjne.html': { href: 'materialy-edukacyjne.html', label: 'Materiały', icon: 'book-open' },
    'ustawienia.html': { href: 'ustawienia.html', label: 'Ustawienia', icon: 'settings' },
    'instrukcja.html': { href: 'instrukcja.html', label: 'Instrukcja', icon: 'file-text' },
    'o-aplikacji.html': { href: 'o-aplikacji.html', label: 'O aplikacji', icon: 'info' },
    'kontakt.html': { href: 'kontakt.html', label: 'Kontakt', icon: 'mail' }
  };

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

  function isEditableField(el) {
    if (!(el instanceof Element)) return false;
    if (el.matches('textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;
    if (!el.matches('input')) return false;

    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'file', 'color', 'image', 'hidden'].includes(type);
  }

  function getVisibleBottomOverlayHeight() {
    return qsa('.cookie-banner, #cookieBanner').reduce((max, el) => {
      if (!el) return max;

      const styles = window.getComputedStyle(el);
      if (styles.display === 'none' || styles.visibility === 'hidden') return max;

      const rect = el.getBoundingClientRect();
      if (!rect.height) return max;

      const isBottomOverlay = (styles.position === 'fixed' || styles.position === 'sticky')
        && rect.bottom >= (window.innerHeight - 2);

      return isBottomOverlay ? Math.max(max, Math.ceil(rect.height)) : max;
    }, 0);
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

  function getRootScrollElement() {
    return document.scrollingElement || document.documentElement || document.body || null;
  }

  function getViewportHeight() {
    return Math.max(
      window.visualViewport?.height || 0,
      window.innerHeight || 0,
      document.documentElement?.clientHeight || 0
    );
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
    const visibleHeight = Math.max(
      viewportHeight,
      root?.clientHeight || 0,
      document.documentElement?.clientHeight || 0,
      document.body?.clientHeight || 0
    );

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

  function shouldEnableMobileDock() {
    const viewportWidth = Math.max(
      window.visualViewport?.width || 0,
      window.innerWidth || 0,
      document.documentElement?.clientWidth || 0
    );

    if (window.matchMedia && window.matchMedia(MOBILE_DOCK_BREAKPOINT).matches) {
      return true;
    }

    if (isTouchAppleDevice() && viewportWidth > 0 && viewportWidth <= 1366) {
      return true;
    }

    return viewportWidth > 0 && viewportWidth <= 1100;
  }

  function setupMobileBottomDock() {
    if (!document.body || qs('#mobileBottomDock')) return;

    const navEntries = collectNavEntries();
    const currentPath = normalizePath(window.location.pathname);
    const preferredPaths = [...MOBILE_DOCK_CORE_PATHS];
    preferredPaths.push(preferredPaths.includes(currentPath) ? MOBILE_DOCK_DEFAULT_EXTRA_PATH : currentPath);

    const dockEntries = Array.from(new Set(preferredPaths))
      .map((path) => getNavEntryForPath(path, navEntries))
      .filter(Boolean)
      .slice(0, 5);

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
      label.textContent = entry.label;

      anchor.append(iconWrap, label);
      list.appendChild(anchor);
    });

    dock.appendChild(list);
    document.body.appendChild(dock);

    const mediaQuery = window.matchMedia(MOBILE_DOCK_BREAKPOINT);
    let activeScrollTarget = window;
    let lastScrollY = 0;
    let ticking = false;
    const detachScrollListeners = [];

    function setDockVisible(visible) {
      dock.classList.toggle('is-hidden', !visible);
    }

    function updateDockOffsets() {
      const extraOffset = shouldEnableMobileDock() ? getVisibleBottomOverlayHeight() : 0;
      document.documentElement.style.setProperty('--mobile-dock-extra-offset', `${Math.max(0, extraOffset)}px`);
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

    function syncDockMode() {
      refreshScrollBindings();

      const enabled = shouldEnableMobileDock();
      dock.hidden = !enabled;
      document.body.classList.toggle('has-mobile-bottom-dock', enabled);

      if (!enabled) {
        dock.classList.remove('is-hidden', 'is-keyboard-hidden');
        document.documentElement.style.setProperty('--mobile-dock-extra-offset', '0px');
        lastScrollY = getWindowScrollSnapshot().top;
        activeScrollTarget = window;
        return;
      }

      const snapshot = readDockScrollSnapshot();
      lastScrollY = snapshot.top;
      setDockVisible(true);
      updateDockOffsets();
    }

    function updateDockOnScroll() {
      if (!shouldEnableMobileDock() || dock.classList.contains('is-keyboard-hidden')) return;

      const snapshot = readDockScrollSnapshot();
      const currentY = snapshot.top;
      const delta = currentY - lastScrollY;

      if (snapshot.max <= 20) {
        setDockVisible(true);
        lastScrollY = currentY;
        updateDockOffsets();
        return;
      }

      if (Math.abs(delta) < 8) {
        lastScrollY = currentY;
        updateDockOffsets();
        return;
      }

      if (currentY <= 24) {
        setDockVisible(true);
      } else if (delta > 0 && currentY > 110) {
        setDockVisible(false);
      } else if (delta < 0) {
        setDockVisible(true);
      }

      lastScrollY = currentY;
      updateDockOffsets();
    }

    function requestDockUpdate() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        updateDockOnScroll();
        ticking = false;
      });
    }

    on(window, 'resize', syncDockMode, { passive: true });
    on(window, 'orientationchange', syncDockMode, { passive: true });
    on(window, 'load', syncDockMode, { passive: true, once: true });
    on(window, 'pageshow', syncDockMode, { passive: true });
    if (window.visualViewport) {
      on(window.visualViewport, 'resize', () => {
        syncDockMode();
        updateDockOffsets();
      }, { passive: true });
      on(window.visualViewport, 'scroll', updateDockOffsets, { passive: true });
    }

    document.addEventListener('focusin', (event) => {
      if (!shouldEnableMobileDock()) return;
      if (isEditableField(event.target)) {
        dock.classList.add('is-keyboard-hidden');
      }
    });

    document.addEventListener('focusout', () => {
      if (!shouldEnableMobileDock()) return;
      window.setTimeout(() => {
        if (!isEditableField(document.activeElement)) {
          dock.classList.remove('is-keyboard-hidden');
          setDockVisible(true);
        }
        syncDockMode();
        updateDockOffsets();
      }, 120);
    });

    if ('MutationObserver' in window) {
      const overlayObserver = new MutationObserver(() => {
        refreshScrollBindings();
        updateDockOffsets();
      });
      qsa('.cookie-banner, #cookieBanner, .main-content, .container').forEach((overlay) => {
        overlayObserver.observe(overlay, { attributes: true, childList: true, subtree: true });
      });
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncDockMode);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(syncDockMode);
    }

    syncDockMode();
    window.setTimeout(syncDockMode, 250);
    window.setTimeout(syncDockMode, 1200);
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
   * Wyświetla baner informujący o dostępnej aktualizacji.  Po kliknięciu
   * „Przeładuj” wysyła do service worker'a komunikat o natychmiastowym
   * przejęciu kontroli.  Po kliknięciu „Później” baner znika.
   */
  function showUpdateBanner(onReload) {
    // Sprawdź, czy baner już istnieje.
    if (document.getElementById('sw-update-banner')) return;
    const bar = document.createElement('div');
    bar.id = 'sw-update-banner';
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
      <span><strong>Nowa wersja aplikacji</strong> — przeładować?</span>
      <div style="display:flex; gap:.5rem;">
        <button id="sw-refresh" class="btn">Przeładuj</button>
        <button id="sw-dismiss" class="btn" style="opacity:.8">Później</button>
      </div>
    `;
    document.body.appendChild(bar);
    const refresh = bar.querySelector('#sw-refresh');
    const dismiss = bar.querySelector('#sw-dismiss');
    refresh.addEventListener('click', () => {
      if (typeof onReload === 'function') onReload();
    });
    dismiss.addEventListener('click', () => {
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