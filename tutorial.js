/*
 * tutorial.js — simple guided tutorial for first-time visitors
 *
 * This script displays a step‑by‑step guide when a user visits the
 * application for the first time. It highlights the age, weight and
 * height fields in sequence, explaining what should be entered in each.
 * The entire page is dimmed with an overlay, while the current field
 * remains interactive and visually emphasised. A small bubble with
 * instructions and navigation buttons (Next/Finish and Skip) leads
 * the user through the process. After completing the final step the
 * page automatically scrolls to the results section. The tutorial
 * records completion using localStorage so it won’t be shown again.
 */

(() => {
  // Encapsulated function that sets up and runs the tutorial
  function initTutorial() {
    try {
      // Safety check: if tutorial was already completed during this session
      if (localStorage.getItem('tutorialShown') === 'true') return;
      // Define the sequence of steps. Each entry references an element id
      // and provides label/text shown in the bubble. The last step
      // highlights the results container instead of an input field.
      const steps = [
        { id: 'age', label: 'Krok 1', text: 'Podaj swój wiek (lata).', focus: true },
        { id: 'weight', label: 'Krok 2', text: 'Wprowadź swoją wagę (kg).', focus: true },
        { id: 'height', label: 'Krok 3', text: 'Wpisz swój wzrost (cm).', focus: true },
        { id: 'results', label: 'Krok 4', text: 'Następnie przewiń w dół aby zobaczyć swoje wyniki.', focus: false }
      ];

      // Create overlay and bubble elements
      const overlay = document.createElement('div');
      overlay.id = 'tutorialOverlay';
      overlay.className = 'tutorial-overlay';
      const bubble = document.createElement('div');
      bubble.className = 'tutorial-bubble';
      overlay.appendChild(bubble);
      document.body.appendChild(overlay);

      // Buttons for navigation
      const nextBtn = document.createElement('button');
      nextBtn.className = 'tutorial-next';
      nextBtn.textContent = 'Dalej';
      const skipBtn = document.createElement('button');
      skipBtn.className = 'tutorial-skip';
      skipBtn.textContent = 'Pomiń';
      bubble.appendChild(nextBtn);
      bubble.appendChild(skipBtn);

      let currentStep = 0;
      // NEW: Flag to ensure the tutorial is ended only once
      let ended = false;
      // NEW: Input element ids that are required for auto-finishing the tutorial
      const requiredIds = ['age', 'weight', 'height'];

      // NEW: Helper to check if all required inputs are filled with positive numbers
      function hasRequiredData() {
        try {
          const a = parseFloat(document.getElementById('age')?.value)    || 0;
          const w = parseFloat(document.getElementById('weight')?.value) || 0;
          const h = parseFloat(document.getElementById('height')?.value) || 0;
          return (a > 0 && w > 0 && h > 0);
        } catch (_) {
          return false;
        }
      }

      // NEW: Called on input/blur to auto-finish the tutorial when on step 3 and data is complete
      function checkAndAutoFinish() {
        if (ended) return;
        if (currentStep === 2 && hasRequiredData()) {
          endTutorial(true);
        }
      }

      function removeHighlight(stepIndex) {
        const step = steps[stepIndex];
        if (!step) return;
        const elem = document.getElementById(step.id);
        if (!elem) return;
        const target = elem.closest('label') || elem;
        target.classList.remove('tutorial-highlight');
      }

      function applyHighlight(stepIndex) {
        const step = steps[stepIndex];
        if (!step) return;
        const elem = document.getElementById(step.id);
        if (!elem) return;
        const wrapper = elem.closest('label');
        const target = wrapper || elem;
        target.classList.add('tutorial-highlight');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (step.focus && typeof elem.focus === 'function') {
          setTimeout(() => {
            try { elem.focus(); } catch (e) {}
          }, 400);
        }

        // NEW: On the third tutorial step (height), attach listeners to detect when required data is complete
        if (stepIndex === 2) {
          requiredIds.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.removeEventListener('input', checkAndAutoFinish);
            el.removeEventListener('blur', checkAndAutoFinish);
            el.addEventListener('input', checkAndAutoFinish, { passive: true });
            el.addEventListener('blur', checkAndAutoFinish, { passive: true });
          });
          // Immediately check once in case the fields are already filled
          setTimeout(checkAndAutoFinish, 150);
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
        if (currentStep === steps.length - 1) {
          nextBtn.textContent = 'Zakończ';
        } else {
          nextBtn.textContent = 'Dalej';
        }
      }

      function nextStep() {
        // NEW: If we're on the third step and required data is filled, finish early with autoscroll
        if (currentStep === 2 && hasRequiredData()) {
          endTutorial(true);
          return;
        }
        if (currentStep >= steps.length - 1) {
          endTutorial();
        } else {
          currentStep += 1;
          renderStep();
        }
      }

      function endTutorial(useAutoScroll) {
        if (ended) return;
        ended = true;
        steps.forEach((_, idx) => removeHighlight(idx));
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        try {
          localStorage.setItem('tutorialShown', 'true');
        } catch (e) {}
        // NEW: If requested and available, use the global scrollToResultsCard() for a smoother experience
        setTimeout(() => {
          if (useAutoScroll && typeof window.scrollToResultsCard === 'function') {
            try {
              window.scrollToResultsCard();
              return;
            } catch (_) {}
          }
          const resEl = document.getElementById('results');
          if (resEl) {
            resEl.scrollIntoView({ behavior: 'smooth' });
          }
        }, 400);
      }

      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        nextStep();
      });
      skipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        endTutorial();
      });

      overlay.style.display = 'block';
      renderStep();
    } catch (err) {
      console.error('Tutorial initialization failed:', err);
      try { localStorage.setItem('tutorialShown', 'true'); } catch (e) {}
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      // Do nothing if tutorial has already been shown
      if (localStorage.getItem('tutorialShown') === 'true') return;
      let started = false;
      // Helper to start tutorial once
      const startTutorial = () => {
        if (!started) {
          started = true;
          initTutorial();
        }
      };

      // We no longer observe the cookie banner; instead, we wait for the user to
      // interact with the cookie consent buttons. When either consent button
      // (accept or decline) is clicked, the tutorial will start. If no banner
      // exists (meaning the user has already made a choice on a previous visit
      // or a banner is not used), the tutorial starts immediately.
      const banner = document.getElementById('consent-banner');
      if (!banner) {
        // If there is no cookie banner, we assume the decision has already been made.
        startTutorial();
      } else {
        const handleClick = (e) => {
          const target = e.target;
          if (!target || !target.id) return;
          const id = target.id;
          if (id === 'consent-accept' || id === 'consent-decline') {
            e.stopPropagation();
            startTutorial();
            document.removeEventListener('click', handleClick);
          }
        };
        document.addEventListener('click', handleClick);
      }
    } catch (err) {
      console.error('Cookie consent detection failed:', err);
      initTutorial();
    }
  });
})();