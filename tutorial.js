/*
 * tutorial.js — guided tutorial for first-time visitors
 *
 * Ta wersja rozszerza poprzedni tutorial o dwie rzeczy:
 *  1) ukrywa mobilny dock i strzałkę nawigacyjną podczas tutoriala,
 *  2) pilnuje także widoczności banera zgody na analytics i wtedy również
 *     ukrywa elementy mobilnej nawigacji.
 *
 * Dodatkowo tutorial korzysta z pełnoekranowego overlayu, dzięki czemu
 * wyszarzenie reszty aplikacji jest jednolite i bardziej profesjonalne.
 */

(() => {
  const STORAGE_KEY = 'tutorialShown';
  const BODY_TUTORIAL_CLASS = 'tutorial-active';
  const BODY_COOKIE_BANNER_CLASS = 'cookie-banner-active';

  function setBodyFlag(className, enabled) {
    try {
      if (document.body) {
        document.body.classList.toggle(className, !!enabled);
      }
    } catch (_) {}
  }

  function tutorialWasShown() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch (_) {
      return false;
    }
  }

  function markTutorialShown() {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch (_) {}
  }

  function isElementVisible(el) {
    if (!el) return false;
    try {
      if (el.hidden) return false;
      const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (style) {
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden') return false;
        if (parseFloat(style.opacity || '1') === 0) return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    } catch (_) {
      return false;
    }
  }

  function syncConsentBannerState() {
    try {
      const banner = document.getElementById('consent-banner');
      const visible = !!banner && isElementVisible(banner);
      setBodyFlag(BODY_COOKIE_BANNER_CLASS, visible);
      return visible;
    } catch (_) {
      setBodyFlag(BODY_COOKIE_BANNER_CLASS, false);
      return false;
    }
  }

  function observeConsentBanner() {
    const banner = document.getElementById('consent-banner');
    syncConsentBannerState();
    if (!banner) return;

    if (!banner.dataset.tutorialConsentObserved) {
      banner.dataset.tutorialConsentObserved = 'true';
      try {
        const observer = new MutationObserver(() => {
          syncConsentBannerState();
        });
        observer.observe(banner, {
          attributes: true,
          attributeFilter: ['style', 'class', 'hidden', 'aria-hidden']
        });
      } catch (_) {}

      ['transitionend', 'animationend'].forEach((eventName) => {
        banner.addEventListener(eventName, () => {
          syncConsentBannerState();
        }, true);
      });
    }

    ['consent-accept', 'consent-decline'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.tutorialConsentWired === 'true') return;
      btn.dataset.tutorialConsentWired = 'true';
      btn.addEventListener('click', () => {
        setTimeout(syncConsentBannerState, 0);
      }, true);
    });
  }

  function initTutorial() {
    try {
      if (tutorialWasShown()) return;

      const steps = [
        { id: 'age', label: 'Krok 1', text: 'Podaj swój wiek (lata).', focus: true },
        { id: 'weight', label: 'Krok 2', text: 'Wprowadź swoją wagę (kg).', focus: true },
        { id: 'height', label: 'Krok 3', text: 'Wpisz swój wzrost (cm).', focus: true },
        { id: 'results', label: 'Krok 4', text: 'Następnie przewiń w dół, aby zobaczyć swoje wyniki.', focus: false }
      ];

      const overlay = document.createElement('div');
      overlay.id = 'tutorialOverlay';
      overlay.className = 'tutorial-overlay';

      const bubble = document.createElement('div');
      bubble.className = 'tutorial-bubble';
      overlay.appendChild(bubble);
      document.body.appendChild(overlay);
      setBodyFlag(BODY_TUTORIAL_CLASS, true);

      const nextBtn = document.createElement('button');
      nextBtn.className = 'tutorial-next';
      nextBtn.textContent = 'Dalej';

      const skipBtn = document.createElement('button');
      skipBtn.className = 'tutorial-skip';
      skipBtn.textContent = 'Pomiń';

      let currentStep = 0;
      let ended = false;
      const requiredIds = ['age', 'weight', 'height'];

      function hasRequiredData() {
        try {
          const a = parseFloat(document.getElementById('age')?.value) || 0;
          const w = parseFloat(document.getElementById('weight')?.value) || 0;
          const h = parseFloat(document.getElementById('height')?.value) || 0;
          return a > 0 && w > 0 && h > 0;
        } catch (_) {
          return false;
        }
      }

      function detachRequiredListeners() {
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

      function getStepTarget(stepIndex) {
        const step = steps[stepIndex];
        if (!step) return null;
        const elem = document.getElementById(step.id);
        if (!elem) return null;
        return elem.closest('label') || elem;
      }

      function removeHighlight(stepIndex) {
        const target = getStepTarget(stepIndex);
        if (target) {
          target.classList.remove('tutorial-highlight');
        }
      }

      function applyHighlight(stepIndex) {
        const step = steps[stepIndex];
        const target = getStepTarget(stepIndex);
        const elem = step ? document.getElementById(step.id) : null;
        if (!target) return;

        detachRequiredListeners();
        target.classList.add('tutorial-highlight');
        try {
          target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } catch (_) {}

        if (step && step.focus && elem && typeof elem.focus === 'function') {
          setTimeout(() => {
            try { elem.focus(); } catch (_) {}
          }, 280);
        }

        if (stepIndex === 2) {
          requiredIds.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', checkAndAutoFinish, { passive: true });
            el.addEventListener('blur', checkAndAutoFinish, { passive: true });
          });
          setTimeout(checkAndAutoFinish, 120);
        }
      }

      function renderStep() {
        const step = steps[currentStep];
        if (!step) return;
        steps.forEach((_, idx) => {
          if (idx !== currentStep) removeHighlight(idx);
        });
        applyHighlight(currentStep);
        bubble.innerHTML = `<strong>${step.label}</strong><p>${step.text}</p>`;
        bubble.appendChild(nextBtn);
        bubble.appendChild(skipBtn);
        nextBtn.textContent = (currentStep === steps.length - 1) ? 'Zakończ' : 'Dalej';
      }

      function nextStep() {
        if (currentStep === 2 && hasRequiredData()) {
          endTutorial(true);
          return;
        }
        if (currentStep >= steps.length - 1) {
          endTutorial(false);
        } else {
          currentStep += 1;
          renderStep();
        }
      }

      function endTutorial(useAutoScroll) {
        if (ended) return;
        ended = true;
        detachRequiredListeners();
        steps.forEach((_, idx) => removeHighlight(idx));
        setBodyFlag(BODY_TUTORIAL_CLASS, false);
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        markTutorialShown();

        setTimeout(() => {
          if (useAutoScroll && typeof window.scrollToResultsCard === 'function') {
            try {
              window.scrollToResultsCard();
              return;
            } catch (_) {}
          }
          const resEl = document.getElementById('results');
          if (resEl) {
            try {
              resEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch (_) {}
          }
        }, 320);
      }

      nextBtn.addEventListener('click', (event) => {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        nextStep();
      });

      skipBtn.addEventListener('click', (event) => {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        endTutorial(false);
      });

      overlay.style.display = 'block';
      renderStep();
    } catch (error) {
      console.error('Tutorial initialization failed:', error);
      setBodyFlag(BODY_TUTORIAL_CLASS, false);
      markTutorialShown();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      observeConsentBanner();

      if (tutorialWasShown()) {
        syncConsentBannerState();
        return;
      }

      let started = false;
      const startTutorial = () => {
        if (started) return;
        started = true;
        syncConsentBannerState();
        initTutorial();
      };

      const banner = document.getElementById('consent-banner');
      if (!banner || !isElementVisible(banner)) {
        startTutorial();
      } else {
        const handleClick = (event) => {
          const target = event.target;
          const id = target && target.id ? target.id : '';
          if (id === 'consent-accept' || id === 'consent-decline') {
            setTimeout(() => {
              syncConsentBannerState();
              startTutorial();
            }, 0);
            document.removeEventListener('click', handleClick);
          }
        };
        document.addEventListener('click', handleClick);
      }
    } catch (error) {
      console.error('Cookie consent detection failed:', error);
      setBodyFlag(BODY_COOKIE_BANNER_CLASS, false);
      initTutorial();
    }
  });
})();
