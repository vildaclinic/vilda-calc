/*
 * tutorial.js — onboarding hub zamiast pełnoekranowego tutorialu
 *
 * Założenia nowej wersji:
 * - usuwamy wymuszony walkthrough krok-po-kroku;
 * - pokazujemy krótki, opcjonalny ekran startowy dopasowany do roli użytkownika;
 * - zostawiamy stały przycisk „Pomoc”, aby onboarding dało się otworzyć ponownie;
 * - używamy wskazówek osadzonych w układzie strony i delikatnych podświetleń,
 *   zamiast sztywnego dymka z overlayem;
 * - zachowujemy zgodność z index.html i docpro.html.
 */

(() => {

  function tutorialSetTrustedHtml(element, markup, context) {
    if (!element) return false;
    const html = markup == null ? '' : String(markup);
    try {
      if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.setTrustedHtml === 'function') {
        return window.VildaHtml.setTrustedHtml(element, html, { context: context || 'tutorial' });
      }
      element.textContent = html;
      return true;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('tutorial.js', _, { helper: 'tutorialSetTrustedHtml', context: context || '' });
      }
      return false;
    }
  }

  function tutorialClearHtml(element) {
    if (!element) return false;
    try {
      if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.clearHtml === 'function') return window.VildaHtml.clearHtml(element);
      element.textContent = '';
      return true;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('tutorial.js', _, { helper: 'tutorialClearHtml' });
      }
      return false;
    }
  }

  function tutorialRestoreClonedChildren(element, snapshots, context) {
    if (!element || !Array.isArray(snapshots)) return false;
    try {
      if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.restoreClonedChildren === 'function') {
        return window.VildaHtml.restoreClonedChildren(element, snapshots, { context: context || 'tutorial:restore-cloned-children' });
      }
      tutorialClearHtml(element);
      snapshots.forEach(function (node) {
        if (node && typeof node.cloneNode === 'function') element.appendChild(node.cloneNode(true));
      });
      return true;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('tutorial.js', _, { helper: 'tutorialRestoreClonedChildren', context: context || '' });
      }
      return false;
    }
  }

  const ONBOARDING_VERSION = '2026-03';
  const STORAGE_KEYS = {
    role: `wwOnboardingRole:${ONBOARDING_VERSION}`,
    firstSessionStarted: `wwOnboardingFirstSessionStarted:${ONBOARDING_VERSION}`,
    firstSessionActive: `wwOnboardingFirstSessionActive:${ONBOARDING_VERSION}`,
    launcherHint: `wwOnboardingLauncherHint:${ONBOARDING_VERSION}`,
    launcherResolved: `wwOnboardingLauncherResolved:${ONBOARDING_VERSION}`
  };

  const compareInstructionSnapshots = new WeakMap();

  const state = {
    page: detectPageType(),
    role: null,
    started: false,
    overlay: null,
    sheet: null,
    dynamicTitle: null,
    dynamicText: null,
    dynamicList: null,
    selectionNote: null,
    primaryBtn: null,
    secondaryLink: null,
    launcher: null,
    launcherPulseTimer: null,
    toast: null,
    bannerObserver: null,
    helpVisible: false,
    formGuideAutoDismissCleanup: null,
    homeResultsObserver: null,
    homeResultsStateCleanup: null,
    homeResultsSyncTimer: null,
    compareInstructionStateCleanup: null,
    compareInstructionSyncTimer: null,
    desktopDockOffsetCleanup: null,
    desktopDockOffsetRaf: null,
    desktopDockOffsetTrailTimers: [],
    observedDesktopDock: null
  };

  function detectPageType() {
    try {
      const path = (window.location.pathname || '').toLowerCase();
      if (path.includes('docpro')) return 'docpro';
      const title = (document.title || '').toLowerCase();
      if (title.includes('docpro')) return 'docpro';
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('tutorial.js', _, { line: 58 });
    }
  }
    return 'home';
  }

  function getPersistence() {
    try {
      return window.VildaPersistence || null;
    } catch (_) {
      return null;
    }
  }

  function lsGet(key) {
    try {
      const persistence = getPersistence();
      return persistence && typeof persistence.readRaw === 'function'
        ? persistence.readRaw('local', key)
        : null;
    } catch (_) {
      return null;
    }
  }

  function lsSet(key, value) {
    try {
      const persistence = getPersistence();
      if (persistence && typeof persistence.writeRaw === 'function') {
        persistence.writeRaw('local', key, value);
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('tutorial.js', _, { line: 87 });
    }
  }
  }

  function ssGet(key) {
    try {
      const persistence = getPersistence();
      return persistence && typeof persistence.readRaw === 'function'
        ? persistence.readRaw('session', key)
        : null;
    } catch (_) {
      return null;
    }
  }

  function ssSet(key, value) {
    try {
      const persistence = getPersistence();
      if (persistence && typeof persistence.writeRaw === 'function') {
        persistence.writeRaw('session', key, value);
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('tutorial.js', _, { line: 109 });
    }
  }
  }

  function shouldShowLauncherInCurrentSession() {
    if (ssGet(STORAGE_KEYS.launcherResolved) === 'true') {
      return false;
    }

    if (isHomeResultsReady()) {
      ssSet(STORAGE_KEYS.launcherResolved, 'true');
      return false;
    }

    if (ssGet(STORAGE_KEYS.firstSessionActive) === 'true') {
      return true;
    }

    if (lsGet(STORAGE_KEYS.firstSessionStarted) === 'true') {
      return false;
    }

    lsSet(STORAGE_KEYS.firstSessionStarted, 'true');
    ssSet(STORAGE_KEYS.firstSessionActive, 'true');
    return true;
  }

  function getSavedRole() {
    const saved = lsGet(STORAGE_KEYS.role);
    if (saved === 'personal' || saved === 'doctor') return saved;
    return state.page === 'docpro' ? 'doctor' : 'personal';
  }

  function saveRole(role) {
    lsSet(STORAGE_KEYS.role, role);
  }

  function injectStyles() {
    if (document.getElementById('ww-onboarding-styles')) return;

    const style = document.createElement('style');
    style.id = 'ww-onboarding-styles';
    style.textContent = `
      :root {
        --ww-help-z: 1201;
        --ww-overlay-bg: rgba(7, 12, 20, 0.42);
        --ww-surface: rgba(255,255,255,0.96);
        --ww-text: #14212b;
        --ww-muted: #50606f;
        --ww-border: rgba(0,0,0,0.08);
        --ww-pro-accent: #9900ff;
        --ww-pro-accent-soft: rgba(153, 0, 255, 0.08);
        --ww-pro-accent-ring: rgba(153, 0, 255, 0.26);
      }

      @keyframes wwHelpPulsePurple {
        0% {
          box-shadow: 0 0 0 0 var(--ww-pro-accent-ring);
        }
        70% {
          box-shadow: 0 0 0 10px var(--ww-pro-accent-soft);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(153, 0, 255, 0);
        }
      }

      .ww-help-launcher {
        position: fixed;
        left: max(var(--mobile-dock-side-gap, 0.75rem), calc(env(safe-area-inset-left, 0px) + 0.35rem));
        bottom: var(--ww-safe-scroll-top-btn-bottom, var(--scroll-top-btn-bottom, calc(env(safe-area-inset-bottom, 0px) + 1rem)));
        z-index: var(--ww-help-z);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: auto !important;
        inline-size: auto !important;
        max-width: calc(100vw - max(var(--mobile-dock-side-gap, 0.75rem), calc(env(safe-area-inset-left, 0px) + 0.35rem)) - max(var(--mobile-dock-side-gap, 0.75rem), calc(env(safe-area-inset-right, 0px) + 0.35rem)) - 0.5rem);
        margin: 0 !important;
        border: 0;
        border-radius: 999px;
        min-height: 3rem;
        min-width: 0 !important;
        padding: 0.78rem 1.1rem;
        background: var(--primary, #00838d);
        color: #fff;
        box-shadow: 0 12px 28px rgba(0,0,0,0.22);
        box-sizing: border-box;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        overflow: visible;
        isolation: isolate;
        transition: bottom 220ms ease, background 0.2s ease, transform 220ms ease, opacity 220ms ease, box-shadow 120ms ease;
      }

      .ww-help-launcher::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        border: 1.5px solid rgba(153, 0, 255, 0.72);
        box-shadow: 0 0 0 0 rgba(153, 0, 255, 0);
        pointer-events: none;
      }

      .ww-help-launcher.ww-help-launcher--pulse::after {
        animation: wwHelpPulsePurple 1.333333s ease-in-out 6;
      }

      body.has-mobile-bottom-dock .ww-help-launcher {
        bottom: var(--ww-safe-scroll-top-btn-bottom, var(--scroll-top-btn-bottom, calc(env(safe-area-inset-bottom, 0px) + 1rem))) !important;
      }

      body.mobile-nav-ui-locked .ww-help-launcher {
        bottom: var(--scroll-top-btn-bottom, calc(env(safe-area-inset-bottom, 0px) + 1rem)) !important;
        transition: background 0.2s ease, box-shadow 120ms ease, opacity 220ms ease !important;
        transform: none !important;
      }

      body.mobile-nav-ui-locked.has-mobile-bottom-dock-visible .ww-help-launcher {
        bottom: var(--mobile-dock-pinned-scroll-top-bottom, var(--scroll-top-btn-bottom, calc(env(safe-area-inset-bottom, 0px) + 1rem))) !important;
      }

      body.mobile-nav-ui-locked .ww-help-launcher:hover,
      body.mobile-nav-ui-locked .ww-help-launcher:focus-visible {
        transform: none !important;
      }

      body.has-mobile-bottom-dock #scrollTopBtn {
        bottom: var(--scroll-top-btn-bottom, 1rem) !important;
      }

      body.mobile-nav-ui-locked.has-mobile-bottom-dock-visible #scrollTopBtn {
        bottom: var(--mobile-dock-pinned-scroll-top-bottom, var(--scroll-top-btn-bottom, 1rem)) !important;
      }

      .ww-help-launcher:hover,
      .ww-help-launcher:focus-visible {
        transform: translateY(-1px);
      }

      .ww-help-launcher__label {
        display: inline-block;
        white-space: nowrap;
      }

      @media (prefers-reduced-motion: reduce) {
        .ww-help-launcher.ww-help-launcher--pulse::after {
          animation: none;
        }
      }

      .ww-close-icon {
        display: block;
        width: 1rem;
        height: 1rem;
        flex: 0 0 auto;
        stroke: currentColor;
        color: inherit;
        overflow: visible;
        pointer-events: none;
      }

      .ww-onboarding-overlay {
        position: fixed;
        inset: 0;
        z-index: calc(var(--ww-help-z) + 1);
        display: none;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background: var(--ww-overlay-bg);
        backdrop-filter: blur(4px);
      }

      .ww-onboarding-overlay.is-open {
        display: flex;
      }

      .ww-onboarding-sheet {
        width: min(100%, 42rem);
        max-height: min(88vh, 56rem);
        overflow: auto;
        background: var(--ww-surface);
        color: var(--ww-text);
        border-radius: 24px;
        border: 1px solid var(--ww-border);
        box-shadow: 0 24px 64px rgba(0,0,0,0.2);
        padding: 1.2rem 1.2rem calc(1.2rem + env(safe-area-inset-bottom, 0px));
      }

      .ww-onboarding-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1rem;
      }

      .ww-onboarding-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--primary, #00838d);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .ww-onboarding-title {
        margin: 0.35rem 0 0;
        font-size: clamp(1.25rem, 1rem + 1vw, 1.8rem);
        line-height: 1.15;
      }

      .ww-onboarding-subtitle {
        margin: 0.6rem 0 0;
        color: var(--ww-muted);
        line-height: 1.5;
      }

      .ww-onboarding-close {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0 !important;
        border: 0 !important;
        background: transparent !important;
        color: #111 !important;
        width: 2.2rem !important;
        min-width: 2.2rem !important;
        max-width: 2.2rem !important;
        height: 2.2rem !important;
        min-height: 2.2rem !important;
        border-radius: 999px;
        box-shadow: none !important;
        cursor: pointer;
        font-size: 0;
        line-height: 1;
        flex: 0 0 auto;
      }

      .ww-onboarding-close:hover,
      .ww-onboarding-close:focus-visible {
        background: rgba(0,0,0,0.06);
        color: var(--ww-text);
      }

      .ww-role-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.8rem;
        margin: 1rem 0 1.1rem;
      }

      .ww-role-card {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.45rem;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        min-height: 0;
        box-sizing: border-box;
        margin: 0 !important;
        border: 1px solid var(--ww-border);
        border-radius: 18px;
        padding: 0.95rem;
        background: rgba(255,255,255,0.75);
        cursor: pointer;
        text-align: left;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        transition: border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
      }

      .ww-role-card:hover,
      .ww-role-card:focus-visible {
        transform: translateY(-1px);
      }

      .ww-role-card.is-selected {
        border-color: var(--primary, #00838d);
        box-shadow: 0 0 0 2px rgba(0,131,141,0.18);
      }

      .ww-role-card[data-role="doctor"].is-selected {
        border-color: var(--ww-pro-accent);
        box-shadow: 0 0 0 2px rgba(153,0,255,0.2);
      }

      .ww-role-card:focus-visible {
        outline: 2px solid rgba(0,131,141,0.35);
        outline-offset: 2px;
      }

      .ww-role-card[data-role="doctor"].is-selected:focus-visible {
        outline-color: rgba(153, 0, 255, 0.35);
      }

      .ww-role-card__title {
        display: block;
        font-size: 1rem;
        font-weight: 800;
        margin-bottom: 0.35rem;
        color: var(--ww-text);
      }

      .ww-role-card__desc {
        display: block;
        color: var(--ww-muted);
        line-height: 1.45;
        font-size: 0.95rem;
      }

      .ww-role-card__hint {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-top: auto;
        min-height: 2rem;
        padding: 0.38rem 0.72rem;
        border-radius: 999px;
        background: rgba(0,131,141,0.08);
        color: var(--primary, #00838d);
        font-size: 0.82rem;
        font-weight: 700;
        line-height: 1.2;
        white-space: nowrap;
      }

      .ww-role-card.is-selected .ww-role-card__hint {
        background: rgba(0,131,141,0.14);
      }

      .ww-role-card[data-role="doctor"].is-selected .ww-role-card__hint {
        background: rgba(153, 0, 255, 0.14);
        color: var(--ww-pro-accent);
      }

      .ww-role-grid-note {
        margin: -0.15rem 0 1rem;
        color: var(--ww-muted);
        font-size: 0.92rem;
        line-height: 1.45;
      }

      .ww-dynamic-panel {
        border-radius: 18px;
        border: 1px solid var(--ww-border);
        background: rgba(255,255,255,0.78);
        padding: 1rem;
      }

      .ww-dynamic-panel h3 {
        margin: 0;
        font-size: 1.05rem;
      }

      .ww-dynamic-panel p {
        margin: 0.45rem 0 0;
        color: var(--ww-muted);
        line-height: 1.5;
      }

      .ww-step-list {
        margin: 0.85rem 0 0;
        padding-left: 1.15rem;
      }

      .ww-step-list li {
        margin: 0.35rem 0;
        line-height: 1.45;
      }

      .ww-sheet-footer {
        display: flex;
        flex-wrap: wrap;
        gap: 0.7rem;
        margin-top: 1rem;
      }

      .ww-btn,
      .ww-link-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 2.8rem;
        padding: 0.72rem 1rem;
        border-radius: 14px;
        border: 1px solid transparent;
        text-decoration: none;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .ww-btn--primary {
        background: var(--primary, #00838d);
        color: #fff;
        border-color: var(--primary, #00838d);
      }

      .ww-btn--ghost,
      .ww-link-btn {
        background: rgba(255,255,255,0.72);
        color: var(--ww-text);
        border-color: var(--ww-border);
      }

      .ww-inline-guide {
        margin-top: 0.9rem;
        border: 1px solid rgba(0,0,0,0.07);
        box-shadow: 0 14px 30px rgba(0,0,0,0.08);
      }

      .ww-inline-guide--embedded {
        margin-top: 0;
        padding: 0;
        border: 0;
        box-shadow: none;
        background: transparent;
        color: var(--ww-text);
        text-align: left;
      }

      .ww-inline-guide--embedded .ww-inline-guide__head,
      .ww-inline-guide--embedded .ww-inline-guide__desc,
      .ww-inline-guide--embedded .ww-inline-guide__list,
      .ww-inline-guide--embedded .ww-inline-guide__actions {
        text-align: left;
      }

      .ww-info-card-has-guide {
        display: block !important;
      }

      .ww-info-card-has-guide #errorBox {
        display: none !important;
      }

      .ww-compare-guide-host {
        display: block !important;
        margin: 0 !important;
        font-size: 1rem !important;
        font-weight: 400 !important;
        text-align: left !important;
        color: var(--ww-text) !important;
      }

      .ww-compare-guide-host a {
        color: inherit;
        font-size: inherit;
      }

      .ww-compare-instruction-suppressed {
        display: none !important;
      }

      .ww-inline-guide__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.8rem;
      }

      .ww-inline-guide__title {
        margin: 0;
        font-size: 1.05rem;
      }

      .ww-inline-guide__desc {
        margin: 0.35rem 0 0;
        color: var(--ww-muted);
        line-height: 1.5;
      }

      .ww-inline-guide__close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0 !important;
        border: 0 !important;
        background: transparent !important;
        color: #111 !important;
        width: 2rem !important;
        min-width: 2rem !important;
        max-width: 2rem !important;
        height: 2rem !important;
        min-height: 2rem !important;
        border-radius: 999px;
        box-shadow: none !important;
        font-size: 0;
        line-height: 1;
        cursor: pointer;
        flex: 0 0 auto;
      }

      .ww-inline-guide__close:hover,
      .ww-inline-guide__close:focus-visible {
        background: rgba(0,0,0,0.06);
        color: var(--ww-text);
      }

      .ww-inline-guide__list {
        margin: 0.85rem 0 0;
        padding-left: 1.15rem;
      }

      .ww-inline-guide__list li {
        margin: 0.36rem 0;
        line-height: 1.45;
      }

      .ww-inline-guide__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
        margin-top: 0.95rem;
      }

      .ww-soft-focus {
        position: relative;
        z-index: 2;
        box-shadow: 0 0 0 3px rgba(255,255,255,0.98), 0 0 0 6px rgba(0,131,141,0.22), 0 14px 28px rgba(0,0,0,0.12);
        border-radius: 14px;
        transition: box-shadow 160ms ease;
      }

      .ww-toast {
        position: fixed;
        left: 50%;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem);
        transform: translateX(-50%) translateY(10px);
        z-index: calc(var(--ww-help-z) + 2);
        min-width: min(92vw, 20rem);
        max-width: min(92vw, 32rem);
        background: rgba(20, 33, 43, 0.96);
        color: #fff;
        padding: 0.85rem 1rem;
        border-radius: 14px;
        box-shadow: 0 18px 32px rgba(0,0,0,0.24);
        opacity: 0;
        pointer-events: none;
        transition: opacity 160ms ease, transform 160ms ease;
        text-align: center;
        line-height: 1.4;
      }

      .ww-toast.is-visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      body.has-mobile-bottom-dock-visible .ww-toast {
        bottom: calc(var(--scroll-top-btn-bottom, calc(env(safe-area-inset-bottom, 0px) + 1rem)) + 0.75rem);
      }

      body.mobile-nav-ui-locked.has-mobile-bottom-dock-visible .ww-toast {
        bottom: calc(var(--mobile-dock-pinned-scroll-top-bottom, var(--scroll-top-btn-bottom, calc(env(safe-area-inset-bottom, 0px) + 1rem))) + 0.75rem);
      }

      @media (max-width: 720px) {
        .ww-help-launcher {
          width: auto !important;
          inline-size: auto !important;
          min-width: 0 !important;
          margin-top: 0 !important;
          padding: 0.76rem 1rem;
          border-radius: 18px;
        }

        .ww-onboarding-overlay {
          align-items: flex-end;
          padding: 0;
        }

        .ww-onboarding-sheet {
          width: 100%;
          max-height: min(90vh, 48rem);
          border-radius: 22px 22px 0 0;
          padding: 1rem 1rem calc(1.05rem + env(safe-area-inset-bottom, 0px));
        }

        .ww-role-grid {
          grid-template-columns: 1fr;
        }

        .ww-role-card,
        .ww-role-card:hover,
        .ww-role-card:focus-visible {
          transform: none;
        }

        .ww-onboarding-close,
        .ww-inline-guide__close {
          margin-top: 0 !important;
        }

        .ww-sheet-footer,
        .ww-inline-guide__actions {
          flex-direction: column;
        }

        .ww-btn,
        .ww-link-btn {
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function getCloseIconMarkup() {
    return `
      <svg class="ww-close-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 6L18 18M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    `;
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && !el.hidden;
  }

  function getNumericInputValue(id) {
    const input = document.getElementById(id);
    if (!input) return 0;
    const rawValue = typeof input.value === 'string' ? input.value.replace(',', '.') : input.value;
    const value = parseFloat(rawValue);
    return Number.isFinite(value) ? value : 0;
  }

  function getAgeForLauncherState() {
    try {
      if (typeof window.getAgeDecimal === 'function') {
        const age = Number(window.getAgeDecimal());
        if (Number.isFinite(age)) return age;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('tutorial.js', _, { line: 759 });
    }
  }
    return getNumericInputValue('age');
  }

  function isHomeResultsReady() {
    if (state.page !== 'home') return false;

    const results = document.getElementById('results');
    if (!results || !isVisible(results)) return false;

    const age = getAgeForLauncherState();
    const weight = getNumericInputValue('weight');
    const height = getNumericInputValue('height');

    return age > 0 && weight > 0 && height > 0;
  }

  function applyLauncherVisibility(isVisibleNow) {
    if (!state.launcher) return;

    if (isVisibleNow) {
      state.launcher.hidden = false;
      state.launcher.removeAttribute('hidden');
      state.launcher.removeAttribute('aria-hidden');
      state.launcher.style.display = '';
      updateLauncherOffset();
      return;
    }

    state.launcher.hidden = true;
    state.launcher.setAttribute('hidden', '');
    state.launcher.setAttribute('aria-hidden', 'true');
    state.launcher.style.display = 'none';
    state.launcher.classList.remove('ww-help-launcher--pulse');
    window.clearTimeout(state.launcherPulseTimer);
  }

  function suppressLauncherForCurrentSession() {
    ssSet(STORAGE_KEYS.launcherResolved, 'true');
    applyLauncherVisibility(false);
  }

  function syncLauncherWithResultsState() {
    if (state.page !== 'home') return;

    if (ssGet(STORAGE_KEYS.launcherResolved) === 'true') {
      applyLauncherVisibility(false);
      return;
    }

    if (isHomeResultsReady()) {
      suppressLauncherForCurrentSession();
    }
  }

  function scheduleLauncherResultsSync() {
    if (state.page !== 'home') return;

    const run = () => {
      syncLauncherWithResultsState();
    };

    window.clearTimeout(state.homeResultsSyncTimer);
    run();
    window.requestAnimationFrame(run);
    state.homeResultsSyncTimer = window.setTimeout(run, 140);
  }

  function observeHomeResultsState() {
    if (state.page !== 'home') return;
    if (state.homeResultsStateCleanup) return;

    const cleanups = [];
    const form = document.getElementById('calcForm');

    if (form) {
      const handleFormChange = () => {
        scheduleLauncherResultsSync();
      };
      form.addEventListener('input', handleFormChange, true);
      form.addEventListener('change', handleFormChange, true);
      cleanups.push(() => {
        form.removeEventListener('input', handleFormChange, true);
        form.removeEventListener('change', handleFormChange, true);
      });
    }

    const observedTargets = ['results', 'compareInstruction', 'errorBox']
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    if (observedTargets.length && typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(() => {
        scheduleLauncherResultsSync();
      });

      observedTargets.forEach((target) => {
        observer.observe(target, {
          attributes: true,
          attributeFilter: ['style', 'class', 'hidden']
        });
      });

      state.homeResultsObserver = observer;
      cleanups.push(() => observer.disconnect());
    }

    const handlePageShow = () => {
      scheduleLauncherResultsSync();
    };
    window.addEventListener('pageshow', handlePageShow);
    cleanups.push(() => window.removeEventListener('pageshow', handlePageShow));

    state.homeResultsStateCleanup = () => {
      cleanups.forEach((cleanup) => {
        try {
          cleanup();
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('tutorial.js', _, { line: 878 });
    }
  }
      });
    };

    scheduleLauncherResultsSync();
    window.setTimeout(scheduleLauncherResultsSync, 260);
  }

  function readCssPxNumber(value, fallback = 0) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getRemSizeInPx() {
    const root = document.documentElement;
    if (!root) return 16;
    const fontSize = parseFloat(window.getComputedStyle(root).fontSize || '16');
    return Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 16;
  }

  function isDesktopPointerEnvironment() {
    if (!(window.matchMedia instanceof Function)) return false;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const fine = window.matchMedia('(pointer: fine)').matches;
    return fine && !coarse;
  }

  function clearDesktopDockOffsetTrailTimers() {
    if (!Array.isArray(state.desktopDockOffsetTrailTimers)) return;
    state.desktopDockOffsetTrailTimers.forEach((timer) => {
      window.clearTimeout(timer);
    });
    state.desktopDockOffsetTrailTimers = [];
  }

  function computeDesktopDockAwareBottomPx() {
    const remPx = Math.max(12, Math.round(getRemSizeInPx()));
    const rootStyle = document.documentElement
      ? window.getComputedStyle(document.documentElement)
      : null;
    const baseBottom = Math.max(
      remPx,
      Math.round(readCssPxNumber(rootStyle?.getPropertyValue('--scroll-top-btn-bottom'), remPx))
    );

    if (!isDesktopPointerEnvironment()) {
      return baseBottom;
    }

    const bodyHasDock = !!(document.body && document.body.classList.contains('has-mobile-bottom-dock'));
    if (!bodyHasDock) {
      return baseBottom;
    }

    const dock = document.getElementById('mobileBottomDock');
    if (!dock || dock.hidden || dock.classList.contains('is-keyboard-hidden')) {
      return baseBottom;
    }

    const dockStyle = window.getComputedStyle(dock);
    if (dockStyle.display === 'none' || dockStyle.visibility === 'hidden') {
      return baseBottom;
    }

    const viewportHeight = Math.max(getViewportHeight(), 1);
    const dockRect = dock.getBoundingClientRect();
    const dockBottomGap = Math.max(0, Math.round(readCssPxNumber(dockStyle.bottom, 0)));
    const dockHeight = Math.max(
      0,
      Math.round(
        dock.offsetHeight
        || readCssPxNumber(dockStyle.height, 0)
        || dockRect.height
        || 0
      )
    );
    const currentVisibleLift = Math.max(0, Math.round(viewportHeight - dockRect.top));
    const dockTopLift = Math.max(0, dockHeight + dockBottomGap);
    const projectedVisibleLift = dock.classList.contains('is-hidden')
      ? currentVisibleLift
      : Math.max(
          dockTopLift + remPx,
          dockHeight + (dockBottomGap * 2)
        );
    const cushion = 6;
    const fullSafeBottom = Math.max(baseBottom, currentVisibleLift, projectedVisibleLift) + cushion;
    const dockAnchorBottom = dock.classList.contains('is-hidden')
      ? currentVisibleLift
      : Math.max(currentVisibleLift, dockTopLift);
    const elevatedGap = Math.max(0, fullSafeBottom - dockAnchorBottom);
    const relaxedGap = Math.max(0, Math.round(elevatedGap / 2));

    return Math.max(baseBottom, dockAnchorBottom + relaxedGap);
  }

  function applyDesktopDockAwareOffset() {
    if (!document.documentElement) return;
    const nextBottom = computeDesktopDockAwareBottomPx();
    document.documentElement.style.setProperty('--ww-safe-scroll-top-btn-bottom', `${Math.max(0, Math.round(nextBottom))}px`);
  }

  function scheduleDesktopDockAwareOffsetSync({ withTrail = false } = {}) {
    if (state.desktopDockOffsetRaf) {
      window.cancelAnimationFrame(state.desktopDockOffsetRaf);
    }

    state.desktopDockOffsetRaf = window.requestAnimationFrame(() => {
      state.desktopDockOffsetRaf = null;
      applyDesktopDockAwareOffset();
    });

    if (!withTrail) return;

    clearDesktopDockOffsetTrailTimers();
    [70, 150, 240, 340].forEach((delay) => {
      const timer = window.setTimeout(() => {
        applyDesktopDockAwareOffset();
      }, delay);
      state.desktopDockOffsetTrailTimers.push(timer);
    });
  }

  function bindDesktopDockOffsetObserver() {
    if (typeof MutationObserver === 'undefined') return () => {};
    if (!document.body) return () => {};

    let dockObserver = null;

    const attachDockObserver = () => {
      const dock = document.getElementById('mobileBottomDock');
      if (dock === state.observedDesktopDock) return;

      if (dockObserver) {
        dockObserver.disconnect();
        dockObserver = null;
      }

      state.observedDesktopDock = dock || null;

      if (!dock) return;

      dockObserver = new MutationObserver(() => {
        scheduleDesktopDockAwareOffsetSync({ withTrail: true });
      });

      dockObserver.observe(dock, {
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden']
      });
    };

    const bodyObserver = new MutationObserver((mutations) => {
      let shouldResync = false;

      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.target === document.body) {
          shouldResync = true;
        }

        if (mutation.type === 'childList') {
          shouldResync = true;
        }
      });

      attachDockObserver();

      if (shouldResync) {
        scheduleDesktopDockAwareOffsetSync({ withTrail: true });
      }
    });

    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true
    });

    attachDockObserver();

    return () => {
      bodyObserver.disconnect();
      if (dockObserver) dockObserver.disconnect();
      state.observedDesktopDock = null;
    };
  }

  function observeDesktopDockAwareOffset() {
    if (state.desktopDockOffsetCleanup) return;

    const cleanups = [];
    const scheduleFast = () => {
      scheduleDesktopDockAwareOffsetSync({ withTrail: false });
    };
    const scheduleTrail = () => {
      scheduleDesktopDockAwareOffsetSync({ withTrail: true });
    };
    const handleDockTransitionRun = (event) => {
      if (event.target && event.target.id === 'mobileBottomDock') {
        scheduleTrail();
      }
    };
    const handleDockTransitionEnd = (event) => {
      if (event.target && event.target.id === 'mobileBottomDock') {
        scheduleFast();
      }
    };

    window.addEventListener('resize', scheduleTrail, { passive: true });
    cleanups.push(() => window.removeEventListener('resize', scheduleTrail));

    window.addEventListener('orientationchange', scheduleTrail, { passive: true });
    cleanups.push(() => window.removeEventListener('orientationchange', scheduleTrail));

    window.addEventListener('pageshow', scheduleTrail, { passive: true });
    cleanups.push(() => window.removeEventListener('pageshow', scheduleTrail));

    document.addEventListener('scroll', scheduleFast, true);
    cleanups.push(() => document.removeEventListener('scroll', scheduleFast, true));

    document.addEventListener('transitionrun', handleDockTransitionRun, true);
    cleanups.push(() => document.removeEventListener('transitionrun', handleDockTransitionRun, true));

    document.addEventListener('transitionstart', handleDockTransitionRun, true);
    cleanups.push(() => document.removeEventListener('transitionstart', handleDockTransitionRun, true));

    document.addEventListener('transitionend', handleDockTransitionEnd, true);
    cleanups.push(() => document.removeEventListener('transitionend', handleDockTransitionEnd, true));

    if (window.visualViewport) {
      const handleViewportResize = () => scheduleTrail();
      const handleViewportScroll = () => scheduleFast();
      window.visualViewport.addEventListener('resize', handleViewportResize, { passive: true });
      cleanups.push(() => window.visualViewport.removeEventListener('resize', handleViewportResize));
      window.visualViewport.addEventListener('scroll', handleViewportScroll, { passive: true });
      cleanups.push(() => window.visualViewport.removeEventListener('scroll', handleViewportScroll));
    }

    cleanups.push(bindDesktopDockOffsetObserver());

    state.desktopDockOffsetCleanup = () => {
      clearDesktopDockOffsetTrailTimers();
      if (state.desktopDockOffsetRaf) {
        window.cancelAnimationFrame(state.desktopDockOffsetRaf);
        state.desktopDockOffsetRaf = null;
      }
      cleanups.forEach((cleanup) => {
        try {
          cleanup();
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('tutorial.js', _, { line: 1128 });
    }
  }
      });
      state.desktopDockOffsetCleanup = null;
    };

    scheduleDesktopDockAwareOffsetSync({ withTrail: true });
    window.setTimeout(() => scheduleDesktopDockAwareOffsetSync({ withTrail: true }), 220);
    window.setTimeout(() => scheduleDesktopDockAwareOffsetSync({ withTrail: true }), 900);
  }

  function updateLauncherOffset() {
    if (!state.launcher) return;
    state.launcher.style.removeProperty('bottom');
    scheduleDesktopDockAwareOffsetSync({ withTrail: true });
  }

  function observeCookieBanner() {
    updateLauncherOffset();
  }

  function createLauncher() {
    if (state.launcher) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ww-help-launcher';
    btn.setAttribute('aria-label', 'Otwórz pomoc i szybki start');
    tutorialSetTrustedHtml(btn, `
      <span class="ww-help-launcher__label">Pomoc</span>
    `, 'tutorial:btn');
    btn.addEventListener('click', () => {
      showSheet();
    });

    document.body.appendChild(btn);
    state.launcher = btn;

    window.requestAnimationFrame(() => {
      if (!state.launcher) return;
      state.launcher.classList.add('ww-help-launcher--pulse');
      window.clearTimeout(state.launcherPulseTimer);
      state.launcherPulseTimer = window.setTimeout(() => {
        if (state.launcher) {
          state.launcher.classList.remove('ww-help-launcher--pulse');
        }
      }, 8050);
    });

    observeCookieBanner();
  }

  function createOverlay() {
    if (state.overlay) return;

    const overlay = document.createElement('div');
    overlay.className = 'ww-onboarding-overlay';
    tutorialSetTrustedHtml(overlay, `
      <section class="ww-onboarding-sheet" role="dialog" aria-modal="true" aria-labelledby="ww-onboarding-title">
        <div class="ww-onboarding-head">
          <div>
            <span class="ww-onboarding-eyebrow">Szybki start</span>
            <h2 id="ww-onboarding-title" class="ww-onboarding-title"></h2>
            <p class="ww-onboarding-subtitle"></p>
          </div>
          <button type="button" class="ww-onboarding-close" aria-label="Zamknij pomoc">${getCloseIconMarkup()}</button>
        </div>

        <div class="ww-role-grid" role="group" aria-label="Wybierz sposób korzystania z aplikacji"></div>
        <p class="ww-role-grid-note" aria-live="polite">Kliknij wybraną kartę, aby zaktualizować instrukcję poniżej.</p>

        <div class="ww-dynamic-panel">
          <h3></h3>
          <p></p>
          <ol class="ww-step-list"></ol>
        </div>

        <div class="ww-sheet-footer">
          <button type="button" class="ww-btn ww-btn--primary"></button>
          <a class="ww-link-btn" href="instrukcja.html">Pełna instrukcja</a>
          <button type="button" class="ww-btn ww-btn--ghost">Zamknij</button>
        </div>
      </section>
    `, 'tutorial:overlay');

    const roleGrid = overlay.querySelector('.ww-role-grid');
    const config = getRoleConfigs();

    config.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'ww-role-card';
      card.dataset.role = item.id;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', 'false');
      tutorialSetTrustedHtml(card, `
        <span class="ww-role-card__title">${item.cardTitle}</span>
        <span class="ww-role-card__desc">${item.cardDescription}</span>
        <span class="ww-role-card__hint">Kliknij, aby wybrać</span>
      `, 'tutorial:card');
      const activateCard = () => {
        selectRole(item.id);
      };
      card.addEventListener('click', activateCard);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activateCard();
        }
      });
      roleGrid.appendChild(card);
    });

    const closeBtn = overlay.querySelector('.ww-onboarding-close');
    const dismissBtn = overlay.querySelector('.ww-btn--ghost');

    closeBtn.addEventListener('click', () => hideSheet({ showLauncherHint: true, renderInlineGuide: true }));
    dismissBtn.addEventListener('click', () => hideSheet({ showLauncherHint: true, renderInlineGuide: true }));

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        hideSheet({ showLauncherHint: true, renderInlineGuide: true });
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.helpVisible) {
        hideSheet({ renderInlineGuide: true });
      }
    });

    state.overlay = overlay;
    state.sheet = overlay.querySelector('.ww-onboarding-sheet');
    state.dynamicTitle = overlay.querySelector('.ww-dynamic-panel h3');
    state.dynamicText = overlay.querySelector('.ww-dynamic-panel p');
    state.dynamicList = overlay.querySelector('.ww-step-list');
    state.selectionNote = overlay.querySelector('.ww-role-grid-note');
    state.primaryBtn = overlay.querySelector('.ww-btn--primary');
    state.secondaryLink = overlay.querySelector('.ww-link-btn');

    document.body.appendChild(overlay);
    selectRole(getSavedRole());
  }

  function getRoleConfigs() {
    if (state.page === 'docpro') {
      return [
        {
          id: 'doctor',
          cardTitle: 'Jestem lekarzem',
          cardDescription: 'Strona główna pozostaje dostępna do kalkulatorów i rozszerzonych wyników. Moduły oraz materiały DocPro są dostępne po weryfikacji numeru PWZ.',
          panelTitle: 'Jak rozpocząć pracę w DocPro?',
          panelText: 'DocPro udostępnia moduły i materiały profesjonalne po weryfikacji numeru PWZ. Na stronie głównej możesz równolegle korzystać z kalkulatorów i rozszerzonych wyników po włączeniu „Wyników profesjonalnych” w karcie „Centyle, BMI & Basal Metabolic Rate”.',
          steps: [
            'Wpisz numer prawa wykonywania zawodu lekarza, aby potwierdzić dostęp do DocPro.',
            'Po weryfikacji uzupełnij podstawowe dane pacjenta.',
            'Na stronie głównej możesz dodatkowo korzystać z kalkulatorów i „Wyników profesjonalnych” w karcie „Centyle, BMI & Basal Metabolic Rate”.'
          ],
          primaryLabel: 'Przejdź do weryfikacji PWZ',
          action: () => {
            ensureInlineGuide('doctor');
            waitForVisible('#pwzNumber', 1800, (input) => {
              softlyFocus(input, { message: 'Tutaj rozpoczniesz weryfikację numeru PWZ.' });
            });
          }
        },
        {
          id: 'personal',
          cardTitle: 'Korzystam prywatnie',
          cardDescription: 'Podstawowe obliczenia i wyniki znajdziesz na stronie głównej aplikacji.',
          panelTitle: 'Przejdź do strony głównej',
          panelText: 'Na stronie głównej wpiszesz wiek, wagę i wzrost, a wyniki pojawią się automatycznie pod formularzem.',
          steps: [
            'Otwórz stronę główną aplikacji.',
            'Wpisz wiek, wagę i wzrost.',
            'Sprawdź wyniki pod formularzem.'
          ],
          primaryLabel: 'Otwórz stronę główną',
          action: () => {
            window.location.href = 'index.html';
          }
        }
      ];
    }

    return [
      {
        id: 'personal',
        cardTitle: 'Korzystam prywatnie',
        cardDescription: 'Wprowadź dane, sprawdź wyniki i porównuj zapisane pomiary.',
        panelTitle: 'Jak zacząć?',
        panelText: 'Wpisz wiek, wagę i wzrost. Wyniki pojawią się automatycznie poniżej formularza.',
        steps: [
          'Wpisz wiek, wagę i wzrost.',
          'Sprawdź wyniki wyświetlone pod formularzem.',
          'Aby wrócić do wcześniejszych pomiarów, zapisz dane i wczytaj je ponownie.'
        ],
        primaryLabel: 'Przejdź do formularza',
        action: () => {
          runHomePrimaryAction('personal', { ensureGuide: true });
        }
      },
      {
        id: 'doctor',
        cardTitle: 'Jestem lekarzem',
        cardDescription: 'Na stronie głównej możesz wprowadzić dane pacjenta, korzystać z kalkulatorów i podsumowań, a po wyświetleniu wyników włączyć „Wyniki profesjonalne”. Moduły DocPro są dostępne po weryfikacji numeru PWZ.',
        panelTitle: 'Jak korzystać z aplikacji jako lekarz?',
        panelText: 'Na stronie głównej wprowadzisz dane pacjenta i skorzystasz z kalkulatorów oraz podsumowań. Po wyświetleniu wyników możesz w karcie „Centyle, BMI & Basal Metabolic Rate” włączyć „Wyniki profesjonalne”. Moduły i materiały DocPro są dostępne po weryfikacji numeru PWZ.',
        steps: [
          'Na stronie głównej wprowadź dane pacjenta i korzystaj z kalkulatorów oraz podsumowań.',
          'Po wyświetleniu wyników przełącz kartę „Centyle, BMI & Basal Metabolic Rate” na „Wyniki profesjonalne”.',
          'Aby otworzyć moduły i materiały DocPro, przejdź do DocPro i potwierdź numer PWZ.'
        ],
        primaryLabel: 'Wprowadź dane pacjenta',
        action: () => {
          runHomePrimaryAction('doctor', { ensureGuide: true });
        }
      }
    ];
  }

  function getConfigForRole(roleId) {
    return getRoleConfigs().find((item) => item.id === roleId) || getRoleConfigs()[0];
  }

  function selectRole(roleId) {
    state.role = roleId;
    saveRole(roleId);

    if (!state.overlay) return;

    state.overlay.querySelectorAll('.ww-role-card').forEach((card) => {
      const isSelected = card.dataset.role === roleId;
      card.classList.toggle('is-selected', isSelected);
      card.setAttribute('aria-pressed', String(isSelected));
      const hint = card.querySelector('.ww-role-card__hint');
      if (hint) {
        hint.textContent = isSelected ? 'Wybrano' : 'Kliknij, aby wybrać';
      }
    });

    const config = getConfigForRole(roleId);
    const dialogTitle = state.page === 'docpro'
      ? 'Wybierz sposób korzystania z DocPro'
      : 'Wybierz sposób korzystania z aplikacji';
    const dialogSubtitle = state.page === 'docpro'
      ? 'Wybierz odpowiednią ścieżkę i przejdź dalej.'
      : 'Wybierz odpowiednią ścieżkę i przejdź dalej.';

    const titleEl = state.overlay.querySelector('.ww-onboarding-title');
    const subtitleEl = state.overlay.querySelector('.ww-onboarding-subtitle');
    if (titleEl) titleEl.textContent = dialogTitle;
    if (subtitleEl) subtitleEl.textContent = dialogSubtitle;
    if (state.selectionNote) {
      state.selectionNote.textContent = `Wybrano: ${config.cardTitle}. Kliknij inną kartę, aby zaktualizować instrukcję poniżej.`;
    }

    state.dynamicTitle.textContent = config.panelTitle;
    state.dynamicText.textContent = config.panelText;
    tutorialClearHtml(state.dynamicList);
    config.steps.forEach((step) => {
      const li = document.createElement('li');
      li.textContent = step;
      state.dynamicList.appendChild(li);
    });
    state.primaryBtn.textContent = config.primaryLabel;
    state.primaryBtn.onclick = (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      hideSheet();
      config.action();
    };
  }

  function showSheet() {
    createOverlay();
    state.overlay.classList.add('is-open');
    state.helpVisible = true;
    requestAnimationFrame(() => {
      const selected = state.overlay.querySelector('.ww-role-card.is-selected') || state.primaryBtn;
      try {
        selected && selected.focus();
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('tutorial.js', _, { line: 1413 });
    }
  }
    });
  }

  function hideSheet({ showLauncherHint = false, renderInlineGuide = false } = {}) {
    if (!state.overlay) return;
    state.overlay.classList.remove('is-open');
    state.helpVisible = false;

    if (renderInlineGuide && state.role) {
      ensureInlineGuide(state.role);
    }

    if (showLauncherHint && ssGet(STORAGE_KEYS.launcherHint) !== 'true') {
      ssSet(STORAGE_KEYS.launcherHint, 'true');
      showToast('Pomoc możesz otworzyć ponownie przyciskiem „Pomoc”.');
    }
  }

  function showToast(message) {
    if (!message) return;
    if (!state.toast) {
      const toast = document.createElement('div');
      toast.className = 'ww-toast';
      document.body.appendChild(toast);
      state.toast = toast;
    }
    state.toast.textContent = message;
    state.toast.classList.add('is-visible');
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      if (state.toast) state.toast.classList.remove('is-visible');
    }, 2600);
  }

  function getViewportHeight() {
    if (window.visualViewport && Number.isFinite(window.visualViewport.height)) {
      return window.visualViewport.height;
    }
    return window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight || 0;
  }

  function getCurrentScrollTop() {
    return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  function blurActiveEditableElement() {
    const active = document.activeElement;
    if (!active || !(active instanceof Element)) return false;
    if (!active.matches('input, select, textarea')) return false;
    try {
      active.blur();
      return true;
    } catch (_) {
      return false;
    }
  }

  function requestMobileDockVisible(delay = 0) {
    const run = () => {
      if (!isSingleColumnLayout()) return;

      if (typeof window.__vildaDockSyncMode === 'function') {
        try {
          window.__vildaDockSyncMode({ preserveVisibility: false });
          return;
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('tutorial.js', _, { line: 1479 });
    }
  }
      }

      if (typeof window.__vildaDockUpdate === 'function') {
        try {
          window.__vildaDockUpdate('browser-ui-resize');
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('tutorial.js', _, { line: 1487 });
    }
  }
      }

      const dock = document.getElementById('mobileBottomDock');
      if (dock) {
        dock.classList.remove('is-keyboard-hidden');
        dock.classList.remove('is-hidden');
        document.body.classList.add('has-mobile-bottom-dock-visible');
      }
    };

    if (delay > 0) {
      window.setTimeout(run, delay);
      return;
    }

    run();
  }

  function getStickyTopOffset() {
    let offset = 16;

    try {
      const header = document.querySelector('header');
      if (header) {
        const style = window.getComputedStyle(header);
        if (style.position === 'sticky' || style.position === 'fixed') {
          const rect = header.getBoundingClientRect();
          if (rect.height > 0 && rect.top <= 0) {
            offset += Math.ceil(rect.height) + 8;
          }
        }
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('tutorial.js', _, { line: 1522 });
    }
  }

    return offset;
  }

  function setDocumentScrollTop(nextTop, { smooth = true } = {}) {
    const top = Math.max(0, Number.isFinite(nextTop) ? nextTop : 0);
    const prefersReducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const behavior = smooth && !prefersReducedMotion ? 'smooth' : 'auto';

    try {
      window.scrollTo({ top, left: 0, behavior });
    } catch (_) {
      try { window.scrollTo(0, top); } catch (__) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('tutorial.js', __, { line: 1537 });
    }
  }
    }

    const scrollRoot = document.scrollingElement || document.documentElement || document.body;
    if (scrollRoot && typeof scrollRoot.scrollTop === 'number') {
      scrollRoot.scrollTop = top;
    }
    if (document.documentElement && typeof document.documentElement.scrollTop === 'number') {
      document.documentElement.scrollTop = top;
    }
    if (document.body && typeof document.body.scrollTop === 'number') {
      document.body.scrollTop = top;
    }
  }

  function getScrollAnchorTarget(target) {
    if (!target || typeof target.closest !== 'function') return target;
    if (target.matches('input, select, textarea')) {
      return target.closest('label') || target;
    }
    return target.closest('.card, fieldset') || target;
  }

  function computeScrollTopForTarget(target, { block = 'center', offset = null } = {}) {
    const anchor = getScrollAnchorTarget(target);
    if (!anchor) return 0;

    const rect = anchor.getBoundingClientRect();
    const viewportHeight = Math.max(getViewportHeight(), 1);
    const currentTop = getCurrentScrollTop();
    const safeOffset = Math.max(getStickyTopOffset(), Number.isFinite(offset) ? offset : 0);

    if (block === 'start') {
      return currentTop + rect.top - safeOffset;
    }

    const targetHeight = Math.max(rect.height || 0, 1);
    const visibleTargetHeight = Math.min(targetHeight, Math.max(48, viewportHeight - safeOffset * 2));
    const centeredOffset = Math.max(safeOffset, (viewportHeight - visibleTargetHeight) / 2);

    return currentTop + rect.top - centeredOffset;
  }

  function scrollElementIntoView(target, { block = 'center', offset = null } = {}) {
    const anchor = getScrollAnchorTarget(target);
    if (!anchor) return;

    if (!isSingleColumnLayout() && typeof anchor.scrollIntoView === 'function') {
      try {
        anchor.scrollIntoView({ behavior: 'smooth', block, inline: 'nearest' });
        return;
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('tutorial.js', _, { line: 1588 });
    }
  }
    }

    const nextTop = computeScrollTopForTarget(anchor, { block, offset });
    setDocumentScrollTop(nextTop, { smooth: true });

    const retry = () => {
      const retryTop = computeScrollTopForTarget(anchor, { block, offset });
      if (Math.abs(retryTop - getCurrentScrollTop()) > 2) {
        setDocumentScrollTop(retryTop, { smooth: false });
      }
    };

    window.requestAnimationFrame(retry);
    window.setTimeout(retry, 180);
  }

  function softlyFocus(target, {
    message = '',
    block = 'center',
    offset = null,
    focusEditable = true,
    preserveDock = false
  } = {}) {
    if (!target) return;

    const shouldPreserveDock = preserveDock && isSingleColumnLayout();
    if (shouldPreserveDock) {
      blurActiveEditableElement();
    }

    const focusTarget = target.matches('input, select, textarea')
      ? target
      : target.querySelector('input, select, textarea');

    scrollElementIntoView(target, { block, offset });

    target.classList.remove('ww-soft-focus');
    // restart animacji/podświetlenia
    void target.offsetWidth;
    target.classList.add('ww-soft-focus');

    window.setTimeout(() => {
      target.classList.remove('ww-soft-focus');
    }, 2200);

    if (focusEditable && focusTarget && typeof focusTarget.focus === 'function') {
      window.setTimeout(() => {
        try {
          focusTarget.focus({ preventScroll: true });
        } catch (_) {
          try { focusTarget.focus(); } catch (__) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('tutorial.js', __, { line: 1641 });
    }
  }
        }
      }, 260);
    }

    if (message) showToast(message);

    if (shouldPreserveDock) {
      requestMobileDockVisible();
      window.requestAnimationFrame(() => requestMobileDockVisible());
      requestMobileDockVisible(180);
      requestMobileDockVisible(520);
    }
  }

  function isSingleColumnLayout() {
    try {
      const form = document.getElementById('calcForm');
      if (form) {
        const halves = form.querySelectorAll(':scope > .half');
        if (halves.length >= 2) {
          const firstRect = halves[0].getBoundingClientRect();
          const secondRect = halves[1].getBoundingClientRect();
          if (Math.abs(firstRect.top - secondRect.top) > 24) {
            return true;
          }
        }
      }

      return window.matchMedia('(max-width: 700px)').matches;
    } catch (_) {
      return (window.innerWidth || 0) <= 700;
    }
  }

  function normalizeTextContent(text) {
    return String(text || '')
      .replace(/ /g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function shouldSuppressDefaultCompareInstruction(compareInstruction) {
    if (state.page !== 'home') return false;
    if (!compareInstruction) return false;
    if (!isSingleColumnLayout()) return false;
    if (compareInstruction.dataset.wwGuideEmbedded === 'true' || compareInstruction.classList.contains('ww-compare-guide-host')) {
      return false;
    }

    const normalizedText = normalizeTextContent(compareInstruction.textContent);
    if (!normalizedText) return false;

    return normalizedText.includes('Uzupełnij wymagane pola')
      && normalizedText.includes('podaj imię')
      && normalizedText.includes('pojawi się porównanie aktualnych danych z poprzednimi');
  }

  function syncSingleColumnCompareInstructionState() {
    const compareInstruction = document.getElementById('compareInstruction');
    if (!compareInstruction) return;

    const shouldSuppress = shouldSuppressDefaultCompareInstruction(compareInstruction);
    compareInstruction.classList.toggle('ww-compare-instruction-suppressed', shouldSuppress);
  }

  function scheduleSingleColumnCompareInstructionSync() {
    const run = () => {
      syncSingleColumnCompareInstructionState();
    };

    window.clearTimeout(state.compareInstructionSyncTimer);
    run();
    window.requestAnimationFrame(run);
    state.compareInstructionSyncTimer = window.setTimeout(run, 140);
  }

  function observeSingleColumnCompareInstructionState() {
    if (state.page !== 'home') return;
    if (state.compareInstructionStateCleanup) return;

    const compareInstruction = document.getElementById('compareInstruction');
    if (!compareInstruction) return;

    const cleanups = [];

    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(() => {
        scheduleSingleColumnCompareInstructionSync();
      });

      observer.observe(compareInstruction, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'data-ww-guide-embedded']
      });

      cleanups.push(() => observer.disconnect());
    }

    const handleResize = () => {
      scheduleSingleColumnCompareInstructionSync();
    };

    window.addEventListener('resize', handleResize);
    cleanups.push(() => window.removeEventListener('resize', handleResize));

    window.addEventListener('orientationchange', handleResize);
    cleanups.push(() => window.removeEventListener('orientationchange', handleResize));

    state.compareInstructionStateCleanup = () => {
      cleanups.forEach((cleanup) => {
        try {
          cleanup();
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('tutorial.js', _, { line: 1757 });
    }
  }
      });
    };

    scheduleSingleColumnCompareInstructionSync();
    window.setTimeout(scheduleSingleColumnCompareInstructionSync, 260);
  }

  function getFirstMissingCoreField() {
    const fields = [
      { selector: '#age', label: 'wiek' },
      { selector: '#weight', label: 'wagę' },
      { selector: '#height', label: 'wzrost' }
    ];

    for (const field of fields) {
      const el = document.querySelector(field.selector);
      if (!el || !isVisible(el)) continue;
      const value = typeof el.value === 'string' ? el.value.trim() : String(el.value ?? '').trim();
      if (!value) {
        return { ...field, element: el };
      }
    }

    return null;
  }

  function getSingleColumnFieldMessage(roleId, fieldLabel) {
    if (roleId === 'doctor') {
      return `Uzupełnij pole „${fieldLabel}”, aby przejść dalej do wyników pacjenta.`;
    }
    return `Uzupełnij pole „${fieldLabel}”, aby wyświetlić wyniki.`;
  }

  function runHomePrimaryAction(roleId, { ensureGuide = false } = {}) {
    const execute = () => {
      if (focusSingleColumnDataTarget(roleId)) return;

      const fallbackMessage = roleId === 'doctor'
        ? 'Wprowadź dane pacjenta, aby wyświetlić wyniki i w razie potrzeby przełączyć na „Wyniki profesjonalne”.'
        : 'Zacznij od wieku, a następnie wpisz wagę i wzrost.';

      waitForVisible('#age', 1200, (input) => {
        softlyFocus(input, {
          message: fallbackMessage,
          block: 'start',
          offset: 16
        });
      });
    };

    if (ensureGuide) {
      ensureInlineGuide(roleId);
      window.requestAnimationFrame(execute);
      return;
    }

    execute();
  }

  function focusSingleColumnDataTarget(roleId) {
    if (!isSingleColumnLayout()) return false;

    const missingField = getFirstMissingCoreField();
    if (missingField && missingField.element) {
      softlyFocus(missingField.element, {
        message: getSingleColumnFieldMessage(roleId, missingField.label),
        block: 'start',
        offset: 16,
        focusEditable: false,
        preserveDock: true
      });
      return true;
    }

    const fallbackSelector = roleId === 'doctor' ? '#bmiCard' : '#results';
    waitForVisible(fallbackSelector, 1200, (target) => {
      softlyFocus(target, {
        block: 'start',
        offset: 16,
        preserveDock: true,
        message: roleId === 'doctor'
          ? 'Dane są już kompletne. Wyniki i przełącznik „Wyniki profesjonalne” znajdziesz poniżej formularza.'
          : 'Dane są już kompletne. Wyniki znajdziesz poniżej formularza.'
      });
    });
    return true;
  }

  function waitForVisible(selector, timeoutMs, callback) {
    const startedAt = Date.now();
    const tick = () => {
      const el = document.querySelector(selector);
      if (el && isVisible(el)) {
        callback(el);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        const fallback = document.querySelector(selector);
        if (fallback) callback(fallback);
        return;
      }
      window.setTimeout(tick, 120);
    };
    tick();
  }

  function detachFormGuideAutoDismiss() {
    if (typeof state.formGuideAutoDismissCleanup === 'function') {
      state.formGuideAutoDismissCleanup();
      state.formGuideAutoDismissCleanup = null;
    }
  }

  function removeInlineGuide({ restoreInfoCard = true } = {}) {
    const existing = document.getElementById('wwInlineGuide');
    if (existing) existing.remove();

    detachFormGuideAutoDismiss();

    const infoCard = document.getElementById('infoMessages');
    if (infoCard) infoCard.classList.remove('ww-info-card-has-guide');

    const compareInstruction = document.getElementById('compareInstruction');
    if (!compareInstruction) return;

    if (compareInstruction.dataset.wwGuideEmbedded === 'true') {
      compareInstruction.classList.remove('ww-compare-guide-host');
      delete compareInstruction.dataset.wwGuideEmbedded;

      if (restoreInfoCard) {
        const snapshot = compareInstructionSnapshots.get(compareInstruction) || [];
        if (snapshot.length) {
          tutorialRestoreClonedChildren(compareInstruction, snapshot, 'tutorial:compareInstruction');
        } else {
          tutorialClearHtml(compareInstruction);
        }
        const originalDisplay = compareInstruction.dataset.wwOriginalInlineDisplay || '';
        if (originalDisplay) {
          compareInstruction.style.display = originalDisplay;
        } else {
          compareInstruction.style.removeProperty('display');
        }

        if (typeof window.updateCompareInstructionVisibility === 'function') {
          try {
            window.updateCompareInstructionVisibility();
          } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('tutorial.js', _, { line: 1901 });
    }
  }
        }
      }
    }

    scheduleSingleColumnCompareInstructionSync();
  }

  function attachFormGuideAutoDismiss() {
    detachFormGuideAutoDismiss();

    const form = document.getElementById('calcForm');
    if (!form) return;

    const dismiss = (event) => {
      const target = event.target;
      if (!target || !(target instanceof Element)) return;
      if (!document.getElementById('wwInlineGuide')) return;
      if (!target.closest('#calcForm')) return;
      removeInlineGuide();
    };

    form.addEventListener('input', dismiss, true);
    form.addEventListener('change', dismiss, true);

    state.formGuideAutoDismissCleanup = () => {
      form.removeEventListener('input', dismiss, true);
      form.removeEventListener('change', dismiss, true);
    };
  }

  function buildInlineGuide(config) {
    removeInlineGuide();

    const card = document.createElement('section');
    card.id = 'wwInlineGuide';
    card.className = config.embedInInfoCard ? 'ww-inline-guide ww-inline-guide--embedded' : 'card ww-inline-guide';

    const head = document.createElement('div');
    head.className = 'ww-inline-guide__head';

    const headText = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'ww-inline-guide__title';
    title.textContent = config.title;

    const desc = document.createElement('p');
    desc.className = 'ww-inline-guide__desc';
    desc.textContent = config.description;

    headText.appendChild(title);
    headText.appendChild(desc);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ww-inline-guide__close';
    closeBtn.setAttribute('aria-label', 'Ukryj szybki start');
    tutorialSetTrustedHtml(closeBtn, getCloseIconMarkup(), 'tutorial:closeBtn');
    closeBtn.addEventListener('click', () => removeInlineGuide());

    head.appendChild(headText);
    head.appendChild(closeBtn);

    const list = document.createElement('ol');
    list.className = 'ww-inline-guide__list';
    config.steps.forEach((step) => {
      const li = document.createElement('li');
      li.textContent = step;
      list.appendChild(li);
    });

    const actions = document.createElement('div');
    actions.className = 'ww-inline-guide__actions';

    config.actions.forEach((action) => {
      let node;
      if (action.type === 'link') {
        node = document.createElement('a');
        node.href = action.href;
        node.className = 'ww-link-btn';
        node.textContent = action.label;
      } else {
        node = document.createElement('button');
        node.type = 'button';
        node.className = `ww-btn ${action.variant === 'ghost' ? 'ww-btn--ghost' : 'ww-btn--primary'}`;
        node.textContent = action.label;
        node.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (typeof action.onClick === 'function') {
            action.onClick(event);
          }
        });
      }
      actions.appendChild(node);
    });

    card.appendChild(head);
    card.appendChild(list);
    card.appendChild(actions);

    if (config.embedInInfoCard) {
      const infoCard = document.getElementById('infoMessages');
      const compareInstruction = document.getElementById('compareInstruction');
      if (infoCard && compareInstruction) {
        if (!compareInstructionSnapshots.has(compareInstruction)) {
          compareInstructionSnapshots.set(compareInstruction, compareInstruction.childNodes
            ? Array.prototype.slice.call(compareInstruction.childNodes).map(function (node) { return node.cloneNode(true); })
            : []);
        }
        if (!Object.prototype.hasOwnProperty.call(compareInstruction.dataset, 'wwOriginalInlineDisplay')) {
          compareInstruction.dataset.wwOriginalInlineDisplay = compareInstruction.style.display || '';
        }

        infoCard.classList.add('ww-info-card-has-guide');
        compareInstruction.classList.add('ww-compare-guide-host');
        compareInstruction.dataset.wwGuideEmbedded = 'true';
        compareInstruction.style.display = 'block';
        tutorialClearHtml(compareInstruction);
        compareInstruction.appendChild(card);

        if (config.dismissOnFormInteraction) {
          attachFormGuideAutoDismiss();
        }
        scheduleSingleColumnCompareInstructionSync();
        return;
      }
    }

    const anchor = document.querySelector(config.anchorSelector);
    if (!anchor || !anchor.parentNode) return;

    if (config.position === 'beforebegin') {
      anchor.parentNode.insertBefore(card, anchor);
    } else if (config.position === 'afterbegin') {
      anchor.insertBefore(card, anchor.firstChild);
    } else {
      anchor.insertAdjacentElement('afterend', card);
    }

    scheduleSingleColumnCompareInstructionSync();
  }

  function ensureInlineGuide(roleId) {
    if (state.page === 'docpro' && roleId === 'doctor') {
      buildInlineGuide({
        anchorSelector: '#doctorContainer',
        position: 'afterend',
        title: 'DocPro — dostęp profesjonalny',
        description: 'Po weryfikacji numeru PWZ uzyskasz dostęp do materiałów i modułów DocPro. Na stronie głównej możesz nadal korzystać z kalkulatorów oraz „Wyników profesjonalnych”.',
        steps: [
          'Wpisz numer PWZ, aby potwierdzić uprawnienia i odblokować DocPro.',
          'Po weryfikacji uzupełnij podstawowe dane pacjenta.',
          'Na stronie głównej w karcie „Centyle, BMI & Basal Metabolic Rate” możesz włączyć „Wyniki profesjonalne” dla rozszerzonych wyników.'
        ],
        actions: [
          {
            type: 'button',
            label: 'Wpisz PWZ',
            onClick: () => {
              waitForVisible('#pwzNumber', 1800, (input) => {
                softlyFocus(input, { message: 'Po weryfikacji PWZ odblokujesz treści i moduły DocPro.' });
              });
            }
          },
          {
            type: 'link',
            href: 'index.html',
            label: 'Strona główna'
          },
          {
            type: 'link',
            href: 'instrukcja.html',
            label: 'Pełna instrukcja'
          }
        ]
      });
      return;
    }

    if (state.page === 'home' && roleId === 'doctor') {
      buildInlineGuide({
        embedInInfoCard: true,
        dismissOnFormInteraction: true,
        title: 'Strona główna dla lekarza',
        description: 'Na stronie głównej wprowadzisz dane pacjenta i skorzystasz z kalkulatorów oraz podsumowań. Po wyświetleniu wyników możesz włączyć „Wyniki profesjonalne”, a moduły DocPro są dostępne po weryfikacji numeru PWZ.',
        steps: [
          'Wprowadź dane pacjenta na stronie głównej.',
          'Po wyświetleniu wyników przełącz kartę „Centyle, BMI & Basal Metabolic Rate” na „Wyniki profesjonalne”.',
          'Gdy potrzebujesz materiałów i modułów DocPro, przejdź do DocPro i potwierdź numer PWZ.'
        ],
        actions: [
          {
            type: 'button',
            label: 'Wprowadź dane pacjenta',
            onClick: () => {
              runHomePrimaryAction('doctor');
            }
          },
          {
            type: 'link',
            href: 'docpro.html',
            label: 'Otwórz DocPro'
          },
          {
            type: 'link',
            href: 'instrukcja.html',
            label: 'Pełna instrukcja'
          }
        ]
      });
      return;
    }

    if (state.page === 'home' && roleId === 'personal') {
      buildInlineGuide({
        embedInInfoCard: true,
        dismissOnFormInteraction: true,
        title: 'Pierwsze kroki',
        description: 'Uzupełnij formularz i sprawdź wyniki pod nim.',
        steps: [
          'Wpisz wiek, wagę i wzrost.',
          'Wyniki pojawią się automatycznie pod formularzem.',
          'Aby porównać wcześniejsze pomiary, zapisz dane i wczytaj je ponownie.'
        ],
        actions: [
          {
            type: 'button',
            label: 'Uzupełnij dane',
            onClick: () => {
              runHomePrimaryAction('personal');
            }
          },
          {
            type: 'link',
            href: 'instrukcja.html',
            label: 'Pełna instrukcja'
          },
          {
            type: 'link',
            href: 'docpro.html',
            label: 'DocPro dla lekarzy'
          }
        ]
      });
    }
  }

  function startAfterConsentGate() {
    if (state.started) return;
    state.started = true;
    injectStyles();

    if (shouldShowLauncherInCurrentSession()) {
      createLauncher();
    }

    observeHomeResultsState();
    observeSingleColumnCompareInstructionState();
    observeDesktopDockAwareOffset();
    syncLauncherWithResultsState();
    syncSingleColumnCompareInstructionState();
    scheduleDesktopDockAwareOffsetSync({ withTrail: true });
  }

  function init() {
    const boot = () => {
      const banner = document.getElementById('consent-banner');
      if (!banner || !isVisible(banner)) {
        startAfterConsentGate();
        return;
      }

      const handleConsentClick = (event) => {
        const target = event.target;
        if (!target || !target.id) return;
        if (target.id === 'consent-accept' || target.id === 'consent-decline') {
          document.removeEventListener('click', handleConsentClick);
          window.setTimeout(startAfterConsentGate, 50);
        }
      };

      document.addEventListener('click', handleConsentClick);

      // Jeżeli baner został już obsłużony innym skryptem i schowany bez kliknięcia,
      // uruchamiamy onboarding po krótkiej chwili.
      let checks = 0;
      const poll = () => {
        if (state.started) return;
        if (!isVisible(banner)) {
          document.removeEventListener('click', handleConsentClick);
          startAfterConsentGate();
          return;
        }
        checks += 1;
        if (checks < 30) {
          window.setTimeout(poll, 250);
        }
      };
      poll();
    };

    if (typeof window.vildaOnReady === 'function') {
      window.vildaOnReady('tutorial:boot', boot);
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  }

  if (typeof window.vildaSafeInit === 'function') {
    window.vildaSafeInit('tutorial:init', init);
  } else {
    init();
  }
})();
