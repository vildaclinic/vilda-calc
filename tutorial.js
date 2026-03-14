/*
 * tutorial.js — guided onboarding for first-time visitors
 *
 * This version dims the application with four fixed blockers placed around
 * the currently active target. Thanks to that the page is darkened evenly,
 * while the active field stays fully clear and interactive — without relying
 * on z-index battles inside nested stacking contexts.
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
  const SPOTLIGHT_PADDING = 10;
  const SPOTLIGHT_MIN_MARGIN = 8;

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

  function getElementRect(el) {
    if (!isElementVisible(el)) return null;

    const rect = el.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;

    return {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height
    };
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
        { id: resultTargetId, label: 'Krok 4', text: 'Tutaj pojawią się Twoje wyniki po uzupełnieniu danych.', focus: false }
      ];

      const overlay = document.createElement('div');
      overlay.id = 'tutorialOverlay';
      overlay.className = 'tutorial-overlay';
      overlay.setAttribute('aria-hidden', 'true');

      const blockerTop = document.createElement('div');
      blockerTop.className = 'tutorial-blocker tutorial-blocker-top';
      const blockerRight = document.createElement('div');
      blockerRight.className = 'tutorial-blocker tutorial-blocker-right';
      const blockerBottom = document.createElement('div');
      blockerBottom.className = 'tutorial-blocker tutorial-blocker-bottom';
      const blockerLeft = document.createElement('div');
      blockerLeft.className = 'tutorial-blocker tutorial-blocker-left';
      const highlightFrame = document.createElement('div');
      highlightFrame.className = 'tutorial-highlight-frame';

      overlay.appendChild(blockerTop);
      overlay.appendChild(blockerRight);
      overlay.appendChild(blockerBottom);
      overlay.appendChild(blockerLeft);
      overlay.appendChild(highlightFrame);

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
      let tutorialUiPositionTimer = 0;
      const requiredIds = ['age', 'weight', 'height'];

      const tutorialViewportHandler = () => {
        if (!ended) {
          refreshTutorialUi(currentHighlightTarget);
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
          return isElementVisible(elem) ? elem : null;
        }

        return isElementVisible(elem) ? elem : null;
      }

      function removeHighlight(target) {
        if (!target) return;
        target.classList.remove('tutorial-highlight');
      }

      function setBoxStyles(el, top, left, width, height) {
        el.style.top = `${Math.max(0, Math.round(top))}px`;
        el.style.left = `${Math.max(0, Math.round(left))}px`;
        el.style.width = `${Math.max(0, Math.round(width))}px`;
        el.style.height = `${Math.max(0, Math.round(height))}px`;
      }

      function updateSpotlight(target) {
        if (!overlay.isConnected) return;

        const viewportWidth = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
        const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
        const rect = getElementRect(target);

        if (!rect) {
          setBoxStyles(blockerTop, 0, 0, viewportWidth, viewportHeight);
          setBoxStyles(blockerRight, 0, viewportWidth, 0, 0);
          setBoxStyles(blockerBottom, viewportHeight, 0, 0, 0);
          setBoxStyles(blockerLeft, 0, 0, 0, 0);
          highlightFrame.style.display = 'none';
          return;
        }

        const holeTop = Math.max(SPOTLIGHT_MIN_MARGIN, rect.top - SPOTLIGHT_PADDING);
        const holeLeft = Math.max(SPOTLIGHT_MIN_MARGIN, rect.left - SPOTLIGHT_PADDING);
        const holeRight = Math.min(viewportWidth - SPOTLIGHT_MIN_MARGIN, rect.right + SPOTLIGHT_PADDING);
        const holeBottom = Math.min(viewportHeight - SPOTLIGHT_MIN_MARGIN, rect.bottom + SPOTLIGHT_PADDING);
        const holeWidth = Math.max(0, holeRight - holeLeft);
        const holeHeight = Math.max(0, holeBottom - holeTop);

        setBoxStyles(blockerTop, 0, 0, viewportWidth, holeTop);
        setBoxStyles(blockerBottom, holeBottom, 0, viewportWidth, viewportHeight - holeBottom);
        setBoxStyles(blockerLeft, holeTop, 0, holeLeft, holeHeight);
        setBoxStyles(blockerRight, holeTop, holeRight, viewportWidth - holeRight, holeHeight);

        highlightFrame.style.display = 'block';
        setBoxStyles(highlightFrame, holeTop, holeLeft, holeWidth, holeHeight);
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
        const rect = getElementRect(target);

        if (!rect) {
          let centeredTop = (viewportHeight - bubbleRect.height) / 2;
          let centeredLeft = (viewportWidth - bubbleRect.width) / 2;
          centeredTop = Math.max(edgePadding, Math.min(centeredTop, viewportHeight - bubbleRect.height - edgePadding));
          centeredLeft = Math.max(edgePadding, Math.min(centeredLeft, viewportWidth - bubbleRect.width - edgePadding));
          bubble.style.top = `${Math.round(centeredTop)}px`;
          bubble.style.left = `${Math.round(centeredLeft)}px`;
          bubble.style.visibility = 'visible';
          return;
        }

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

      function refreshTutorialUi(target) {
        updateSpotlight(target);
        positionBubble(target);
      }

      function scheduleTutorialUiPosition(target) {
        window.clearTimeout(tutorialUiPositionTimer);
        window.requestAnimationFrame(() => refreshTutorialUi(target));
        tutorialUiPositionTimer = window.setTimeout(() => refreshTutorialUi(target), 280);
      }

      function applyHighlight(stepIndex) {
        const step = steps[stepIndex];
        const elem = document.getElementById(step?.id);
        const target = resolveHighlightTarget(step);

        currentHighlightTarget = target;
        if (target) {
          target.classList.add('tutorial-highlight');
        }

        try {
          if (target) {
            target.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
          }
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

        scheduleTutorialUiPosition(target);
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

        applyHighlight(currentStep);
      }

      function teardown() {
        detachAutoFinishListeners();
        window.clearTimeout(tutorialUiPositionTimer);
        removeHighlight(currentHighlightTarget);
        currentHighlightTarget = null;

        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (bubble.parentNode) bubble.parentNode.removeChild(bubble);

        document.body.classList.remove(TUTORIAL_ACTIVE_CLASS);
        syncTemporaryNavigationUiVisibility();

        window.removeEventListener('resize', tutorialViewportHandler);
        window.removeEventListener('scroll', tutorialViewportHandler);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', tutorialViewportHandler);
          window.visualViewport.removeEventListener('scroll', tutorialViewportHandler);
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

      window.addEventListener('resize', tutorialViewportHandler, { passive: true });
      window.addEventListener('scroll', tutorialViewportHandler, { passive: true });
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', tutorialViewportHandler, { passive: true });
        window.visualViewport.addEventListener('scroll', tutorialViewportHandler, { passive: true });
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
