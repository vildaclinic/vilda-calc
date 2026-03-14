/*
 * tutorial.js — guided onboarding for first-time visitors
 *
 * This version uses a real full-screen backdrop instead of dimming the page
 * with a giant box-shadow on the highlighted field. Thanks to that the whole
 * application is dimmed uniformly: legends, fieldsets, buttons and messages
 * all receive the same shade, while only the current tutorial target remains
 * fully visible and interactive.
 *
 * Additionally, while the tutorial is visible — and while the cookie / local
 * storage consent banner is visible — the mobile dock and the navigation arrow
 * are temporarily hidden.
 */

(() => {
  const TUTORIAL_STORAGE_KEY = 'tutorialShown';
  const TEMP_NAV_HIDDEN_CLASS = 'nav-ui-temporarily-hidden';
  const TUTORIAL_ACTIVE_CLASS = 'tutorial-active';
  const REQUIRED_TUTORIAL_IDS = ['age', 'weight', 'height'];

  let consentBannerObserver = null;
  let consentBannerResizeHandlerAttached = false;

  function hasShownTutorial() {
    try {
      return localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true';
    } catch (_) {
      return false;
    }
  }

  function markTutorialShown() {
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    } catch (_) {
      /* ignore storage failures */
    }
  }

  function getConsentBanner() {
    return document.getElementById('consent-banner') || document.getElementById('cookieBanner');
  }

  function isElementVisible(el) {
    if (!(el instanceof Element)) return false;

    const styles = window.getComputedStyle(el);
    if (styles.display === 'none' || styles.visibility === 'hidden') return false;
    if (Number.parseFloat(styles.opacity || '1') <= 0) return false;

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isConsentBannerVisible() {
    const banner = getConsentBanner();
    return isElementVisible(banner);
  }

  function syncTemporaryNavigationUiVisibility() {
    const body = document.body;
    if (!body) return;

    const shouldHide = body.classList.contains(TUTORIAL_ACTIVE_CLASS) || isConsentBannerVisible();
    body.classList.toggle(TEMP_NAV_HIDDEN_CLASS, shouldHide);

    if (typeof window.__vildaDockUpdate === 'function') {
      window.requestAnimationFrame(() => {
        try {
          window.__vildaDockUpdate('temporary-navigation-visibility');
        } catch (_) {
          /* noop */
        }
      });
    }
  }

  function ensureConsentBannerWatcher() {
    if (consentBannerResizeHandlerAttached) return;

    const banner = getConsentBanner();

    if (banner && typeof MutationObserver === 'function') {
      consentBannerObserver = new MutationObserver(syncTemporaryNavigationUiVisibility);
      consentBannerObserver.observe(banner, {
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden', 'aria-hidden']
      });
    }

    window.addEventListener('resize', syncTemporaryNavigationUiVisibility, { passive: true });
    consentBannerResizeHandlerAttached = true;
    syncTemporaryNavigationUiVisibility();
  }

  function canRunTutorialOnCurrentPage() {
    return REQUIRED_TUTORIAL_IDS.every((id) => document.getElementById(id));
  }

  function initTutorial() {
    if (hasShownTutorial()) return;
    if (!canRunTutorialOnCurrentPage()) return;

    try {
      const resultTargetId = document.getElementById('bmiCard') ? 'bmiCard' : 'results';
      const steps = [
      { id: 'age', label: 'Krok 1', text: 'Podaj swój wiek (lata).', focus: true },
      { id: 'weight', label: 'Krok 2', text: 'Wprowadź swoją wagę (kg).', focus: true },
      { id: 'height', label: 'Krok 3', text: 'Wpisz swój wzrost (cm).', focus: true },
      { id: resultTargetId, label: 'Krok 4', text: 'Niżej zobaczysz swoje wyniki.', focus: false }
    ];

    const overlay = document.createElement('div');
    overlay.id = 'tutorialOverlay';
    overlay.className = 'tutorial-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const bubble = document.createElement('div');
    bubble.className = 'tutorial-bubble';
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-live', 'polite');
    bubble.setAttribute('aria-label', 'Samouczek aplikacji');

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'tutorial-next';
    nextBtn.textContent = 'Dalej';

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'tutorial-skip';
    skipBtn.textContent = 'Pomiń';

    let currentStep = 0;
    let currentHighlightTarget = null;
    let ended = false;
    let bubblePositionTimer = 0;
    const requiredIds = ['age', 'weight', 'height'];

    const bubbleViewportHandler = () => {
      if (!ended) {
        positionBubble(currentHighlightTarget);
      }
    };

    function hasRequiredData() {
      try {
        const age = Number.parseFloat(document.getElementById('age')?.value) || 0;
        const weight = Number.parseFloat(document.getElementById('weight')?.value) || 0;
        const height = Number.parseFloat(document.getElementById('height')?.value) || 0;
        return age > 0 && weight > 0 && height > 0;
      } catch (_) {
        return false;
      }
    }

    function detachAutoFinishListeners() {
      requiredIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.removeEventListener('input', checkAndAutoFinish);
        el.removeEventListener('blur', checkAndAutoFinish);
      });
    }

    function checkAndAutoFinish() {
      if (ended) return;
      if (currentStep === 2 && hasRequiredData()) {
        endTutorial(true);
      }
    }

    function resolveHighlightTarget(step) {
      if (!step) return null;
      const elem = document.getElementById(step.id);
      if (!elem) return null;

      if (elem.matches('input, select, textarea')) {
        return elem.closest('label') || elem;
      }

      return elem;
    }

    function removeHighlight(target) {
      if (!target) return;
      target.classList.remove('tutorial-highlight');
    }

    function positionBubble(target) {
      if (!bubble.isConnected) return;

      const viewportWidth = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
      const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
      const edgePadding = 16;
      const gap = 16;

      bubble.style.visibility = 'hidden';
      bubble.style.top = `${edgePadding}px`;
      bubble.style.left = `${edgePadding}px`;

      const bubbleRect = bubble.getBoundingClientRect();
      const fallbackRect = {
        top: edgePadding,
        bottom: edgePadding,
        left: edgePadding,
        width: viewportWidth - edgePadding * 2
      };
      const rect = target ? target.getBoundingClientRect() : fallbackRect;

      let top = rect.bottom + gap;
      const topAbove = rect.top - bubbleRect.height - gap;
      if (top + bubbleRect.height > viewportHeight - edgePadding && topAbove >= edgePadding) {
        top = topAbove;
      }
      top = Math.max(edgePadding, Math.min(top, viewportHeight - bubbleRect.height - edgePadding));

      let left = rect.left + ((rect.width || 0) - bubbleRect.width) / 2;
      if (!Number.isFinite(left)) left = edgePadding;
      left = Math.max(edgePadding, Math.min(left, viewportWidth - bubbleRect.width - edgePadding));

      bubble.style.top = `${Math.round(top)}px`;
      bubble.style.left = `${Math.round(left)}px`;
      bubble.style.visibility = 'visible';
    }

    function scheduleBubblePosition(target) {
      window.clearTimeout(bubblePositionTimer);
      window.requestAnimationFrame(() => positionBubble(target));
      bubblePositionTimer = window.setTimeout(() => positionBubble(target), 260);
    }

    function applyHighlight(stepIndex) {
      const step = steps[stepIndex];
      const elem = document.getElementById(step?.id);
      const target = resolveHighlightTarget(step);
      if (!target) return null;

      currentHighlightTarget = target;
      target.classList.add('tutorial-highlight');

      try {
        target.scrollIntoView({
          behavior: 'smooth',
          block: stepIndex === steps.length - 1 ? 'start' : 'center',
          inline: 'nearest'
        });
      } catch (_) {
        /* noop */
      }

      if (step?.focus && elem && typeof elem.focus === 'function') {
        window.setTimeout(() => {
          try {
            elem.focus({ preventScroll: true });
          } catch (_) {
            try {
              elem.focus();
            } catch (__ ) {
              /* noop */
            }
          }
        }, 350);
      }

      detachAutoFinishListeners();
      if (stepIndex === 2) {
        requiredIds.forEach((id) => {
          const el = document.getElementById(id);
          if (!el) return;
          el.addEventListener('input', checkAndAutoFinish, { passive: true });
          el.addEventListener('blur', checkAndAutoFinish, { passive: true });
        });
        window.setTimeout(checkAndAutoFinish, 120);
      }

      scheduleBubblePosition(target);
      return target;
    }

    function renderStep() {
      const step = steps[currentStep];
      if (!step) return;

      removeHighlight(currentHighlightTarget);
      currentHighlightTarget = null;

      bubble.innerHTML = `<strong>${step.label}</strong><p>${step.text}</p>`;
      bubble.appendChild(nextBtn);
      bubble.appendChild(skipBtn);
      nextBtn.textContent = currentStep === steps.length - 1 ? 'Zakończ' : 'Dalej';

      const target = applyHighlight(currentStep);
      scheduleBubblePosition(target);
    }

    function teardown() {
      detachAutoFinishListeners();
      window.clearTimeout(bubblePositionTimer);
      removeHighlight(currentHighlightTarget);
      currentHighlightTarget = null;

      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (bubble.parentNode) bubble.parentNode.removeChild(bubble);

      document.body.classList.remove(TUTORIAL_ACTIVE_CLASS);
      syncTemporaryNavigationUiVisibility();

      window.removeEventListener('resize', bubbleViewportHandler);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', bubbleViewportHandler);
        window.visualViewport.removeEventListener('scroll', bubbleViewportHandler);
      }
    }

    function endTutorial(useAutoScroll = false) {
      if (ended) return;
      ended = true;

      teardown();
      markTutorialShown();

      window.setTimeout(() => {
        if (!useAutoScroll) return;

        if (typeof window.scrollToResultsCard === 'function') {
          try {
            window.scrollToResultsCard();
            return;
          } catch (_) {
            /* noop */
          }
        }

        const resultEl = document.getElementById(resultTargetId) || document.getElementById('results');
        if (resultEl) {
          try {
            resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch (_) {
            resultEl.scrollIntoView();
          }
        }
      }, 320);
    }

    function nextStep() {
      if (currentStep === 2 && hasRequiredData()) {
        endTutorial(true);
        return;
      }

      if (currentStep >= steps.length - 1) {
        endTutorial();
        return;
      }

      currentStep += 1;
      renderStep();
    }

    nextBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      nextStep();
    });

    skipBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      endTutorial(false);
    });

    document.body.appendChild(overlay);
    document.body.appendChild(bubble);
    document.body.classList.add(TUTORIAL_ACTIVE_CLASS);
    syncTemporaryNavigationUiVisibility();

    window.addEventListener('resize', bubbleViewportHandler, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', bubbleViewportHandler, { passive: true });
      window.visualViewport.addEventListener('scroll', bubbleViewportHandler, { passive: true });
    }

      overlay.style.display = 'block';
      renderStep();
    } catch (error) {
      console.error('Tutorial initialization failed:', error);
      document.body?.classList.remove(TUTORIAL_ACTIVE_CLASS);
      syncTemporaryNavigationUiVisibility();
      markTutorialShown();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureConsentBannerWatcher();

    if (hasShownTutorial()) return;
    if (!canRunTutorialOnCurrentPage()) return;

    let started = false;
    const startTutorial = () => {
      if (started) return;
      started = true;
      initTutorial();
    };

    const banner = getConsentBanner();
    const acceptBtn = document.getElementById('consent-accept');
    const declineBtn = document.getElementById('consent-decline');

    if (!isConsentBannerVisible()) {
      startTutorial();
      return;
    }

    const startAfterConsent = () => {
      syncTemporaryNavigationUiVisibility();
      startTutorial();
    };

    if (acceptBtn) {
      acceptBtn.addEventListener('click', startAfterConsent, { once: true });
    }
    if (declineBtn) {
      declineBtn.addEventListener('click', startAfterConsent, { once: true });
    }

    if (!banner && !acceptBtn && !declineBtn) {
      startTutorial();
    }
  });
})();
