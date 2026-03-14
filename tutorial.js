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
  const ONBOARDING_VERSION = '2026-03';
  const STORAGE_KEYS = {
    seen: `wwOnboardingSeen:${ONBOARDING_VERSION}`,
    role: `wwOnboardingRole:${ONBOARDING_VERSION}`,
    launcherHint: `wwOnboardingLauncherHint:${ONBOARDING_VERSION}`
  };

  const state = {
    page: detectPageType(),
    role: null,
    started: false,
    overlay: null,
    sheet: null,
    dynamicTitle: null,
    dynamicText: null,
    dynamicList: null,
    primaryBtn: null,
    secondaryLink: null,
    launcher: null,
    toast: null,
    bannerObserver: null,
    helpVisible: false
  };

  function detectPageType() {
    try {
      const path = (window.location.pathname || '').toLowerCase();
      if (path.includes('docpro')) return 'docpro';
      const title = (document.title || '').toLowerCase();
      if (title.includes('docpro')) return 'docpro';
    } catch (_) {}
    return 'home';
  }

  function lsGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function lsSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_) {
      /* ignore */
    }
  }

  function hasSeenOnboarding() {
    return lsGet(STORAGE_KEYS.seen) === 'true' || lsGet('tutorialShown') === 'true';
  }

  function markOnboardingSeen() {
    lsSet(STORAGE_KEYS.seen, 'true');
    // Zachowujemy kompatybilność z dotychczasowym kluczem.
    lsSet('tutorialShown', 'true');
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
        --ww-help-z: 10040;
        --ww-overlay-bg: rgba(7, 12, 20, 0.42);
        --ww-surface: rgba(255,255,255,0.96);
        --ww-text: #14212b;
        --ww-muted: #50606f;
        --ww-border: rgba(0,0,0,0.08);
      }

      .ww-help-launcher {
        position: fixed;
        left: 1rem;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem);
        z-index: var(--ww-help-z);
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        border: 0;
        border-radius: 999px;
        padding: 0.78rem 1rem;
        background: var(--primary, #00838d);
        color: #fff;
        box-shadow: 0 12px 28px rgba(0,0,0,0.22);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        max-width: min(88vw, 14rem);
      }

      .ww-help-launcher:hover,
      .ww-help-launcher:focus-visible {
        transform: translateY(-1px);
      }

      .ww-help-launcher__icon {
        width: 1.55rem;
        height: 1.55rem;
        display: inline-grid;
        place-items: center;
        border-radius: 999px;
        background: rgba(255,255,255,0.18);
        font-weight: 800;
        line-height: 1;
      }

      .ww-help-launcher__label {
        white-space: nowrap;
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
        border: 0;
        background: transparent;
        color: var(--ww-muted);
        width: 2.2rem;
        height: 2.2rem;
        border-radius: 999px;
        cursor: pointer;
        font-size: 1.4rem;
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
        border: 1px solid var(--ww-border);
        border-radius: 18px;
        padding: 0.95rem;
        background: rgba(255,255,255,0.75);
        cursor: pointer;
        text-align: left;
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
        border: 0;
        background: transparent;
        color: var(--ww-muted);
        width: 2rem;
        height: 2rem;
        border-radius: 999px;
        font-size: 1.3rem;
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

      @media (max-width: 720px) {
        .ww-help-launcher {
          padding: 0.78rem 0.92rem;
          border-radius: 18px;
        }

        .ww-help-launcher__label {
          display: none;
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

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && !el.hidden;
  }

  function updateLauncherOffset() {
    if (!state.launcher) return;
    const banner = document.getElementById('consent-banner');
    const bannerVisible = banner && isVisible(banner);
    const dockActive = !!(document.body && document.body.classList.contains('has-mobile-bottom-dock') && window.matchMedia && window.matchMedia('(max-width: 991.98px)').matches);

    let bottom = 'calc(env(safe-area-inset-bottom, 0px) + 1rem)';
    if (dockActive) bottom = 'calc(env(safe-area-inset-bottom, 0px) + 6rem)';
    if (bannerVisible && dockActive) bottom = 'calc(env(safe-area-inset-bottom, 0px) + 10rem)';
    else if (bannerVisible) bottom = 'calc(env(safe-area-inset-bottom, 0px) + 5.25rem)';

    state.launcher.style.bottom = bottom;
  }

  function observeCookieBanner() {
    const banner = document.getElementById('consent-banner');
    if (!banner || state.bannerObserver) {
      updateLauncherOffset();
      return;
    }

    state.bannerObserver = new MutationObserver(updateLauncherOffset);
    state.bannerObserver.observe(banner, {
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden']
    });

    updateLauncherOffset();
  }

  function createLauncher() {
    if (state.launcher) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ww-help-launcher';
    btn.setAttribute('aria-label', 'Otwórz pomoc i szybki start');
    btn.innerHTML = `
      <span class="ww-help-launcher__icon" aria-hidden="true">?</span>
      <span class="ww-help-launcher__label">Pomoc</span>
    `;
    btn.addEventListener('click', () => {
      showSheet({ markSeen: false });
    });

    document.body.appendChild(btn);
    state.launcher = btn;
    observeCookieBanner();
  }

  function createOverlay() {
    if (state.overlay) return;

    const overlay = document.createElement('div');
    overlay.className = 'ww-onboarding-overlay';
    overlay.innerHTML = `
      <section class="ww-onboarding-sheet" role="dialog" aria-modal="true" aria-labelledby="ww-onboarding-title">
        <div class="ww-onboarding-head">
          <div>
            <span class="ww-onboarding-eyebrow">Szybki start</span>
            <h2 id="ww-onboarding-title" class="ww-onboarding-title"></h2>
            <p class="ww-onboarding-subtitle"></p>
          </div>
          <button type="button" class="ww-onboarding-close" aria-label="Zamknij pomoc">×</button>
        </div>

        <div class="ww-role-grid" role="group" aria-label="Wybierz sposób korzystania z aplikacji"></div>

        <div class="ww-dynamic-panel">
          <h3></h3>
          <p></p>
          <ol class="ww-step-list"></ol>
        </div>

        <div class="ww-sheet-footer">
          <button type="button" class="ww-btn ww-btn--primary"></button>
          <a class="ww-link-btn" href="instrukcja.html">Pełna instrukcja</a>
          <button type="button" class="ww-btn ww-btn--ghost">Teraz nie</button>
        </div>
      </section>
    `;

    const roleGrid = overlay.querySelector('.ww-role-grid');
    const config = getRoleConfigs();

    config.forEach((item) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'ww-role-card';
      card.dataset.role = item.id;
      card.innerHTML = `
        <span class="ww-role-card__title">${item.cardTitle}</span>
        <span class="ww-role-card__desc">${item.cardDescription}</span>
      `;
      card.addEventListener('click', () => {
        selectRole(item.id);
      });
      roleGrid.appendChild(card);
    });

    const closeBtn = overlay.querySelector('.ww-onboarding-close');
    const dismissBtn = overlay.querySelector('.ww-btn--ghost');

    closeBtn.addEventListener('click', () => hideSheet({ markSeen: true, showLauncherHint: true }));
    dismissBtn.addEventListener('click', () => hideSheet({ markSeen: true, showLauncherHint: true }));

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        hideSheet({ markSeen: true, showLauncherHint: true });
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.helpVisible) {
        hideSheet({ markSeen: true });
      }
    });

    state.overlay = overlay;
    state.sheet = overlay.querySelector('.ww-onboarding-sheet');
    state.dynamicTitle = overlay.querySelector('.ww-dynamic-panel h3');
    state.dynamicText = overlay.querySelector('.ww-dynamic-panel p');
    state.dynamicList = overlay.querySelector('.ww-step-list');
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
          cardDescription: 'Wejdź szybko do DocPro i aktywuj moduły po weryfikacji PWZ.',
          panelTitle: 'DocPro bez pełnoekranowego tutorialu',
          panelText: 'Ta strona ma prowadzić do celu możliwie szybko. Najpierw aktywuj dostęp, potem wprowadź dane pacjenta i uruchom potrzebny kalkulator.',
          steps: [
            'Wpisz numer prawa wykonywania zawodu lekarza.',
            'Uzupełnij podstawowe dane pacjenta w formularzu po lewej.',
            'Korzystaj tylko z tych modułów, których potrzebujesz w danej sytuacji.'
          ],
          primaryLabel: 'Przejdź do PWZ',
          action: () => {
            ensureInlineGuide('doctor');
            waitForVisible('#pwzNumber', 1800, (input) => {
              softlyFocus(input, { message: 'Dostęp do modułów pojawi się po prawidłowej weryfikacji PWZ.' });
            });
          }
        },
        {
          id: 'personal',
          cardTitle: 'Korzystam prywatnie',
          cardDescription: 'Ta część serwisu jest przeznaczona dla lekarzy. Wersja ogólna jest na stronie głównej.',
          panelTitle: 'Lepiej zacząć od wersji standardowej',
          panelText: 'Jeżeli nie korzystasz z modułu profesjonalnego, przejdź do głównej wersji aplikacji. Tam wyniki i podstawowe obliczenia są pokazane bez dodatkowych kroków.',
          steps: [
            'Otwórz stronę główną aplikacji.',
            'Wpisz wiek, wagę i wzrost.',
            'Wyniki pojawią się automatycznie pod formularzem.'
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
        cardDescription: 'Szybkie wyniki, historia pomiarów i porównanie danych bez zbędnych kroków.',
        panelTitle: 'Najkrótsza ścieżka do wyniku',
        panelText: 'Na stronie głównej nie potrzebujesz klasycznego tutorialu. Najważniejsze jest szybkie uzupełnienie formularza i możliwość wrócenia do pomocy wtedy, kiedy naprawdę jej potrzebujesz.',
        steps: [
          'Wpisz wiek, wagę i wzrost.',
          'Wyniki aktualizują się automatycznie pod formularzem.',
          'Jeśli chcesz porównywać pomiary, zapisz dane i później wczytaj je ponownie.'
        ],
        primaryLabel: 'Przejdź do formularza',
        action: () => {
          ensureInlineGuide('personal');
          waitForVisible('#age', 1200, (input) => {
            softlyFocus(input, { message: 'Wpisz wiek, wagę i wzrost — wyniki odświeżają się automatycznie.' });
          });
        }
      },
      {
        id: 'doctor',
        cardTitle: 'Jestem lekarzem',
        cardDescription: 'Moduł profesjonalny jest osobną ścieżką i nie powinien obciążać zwykłego startu aplikacji.',
        panelTitle: 'Osobna ścieżka dla lekarzy',
        panelText: 'Zamiast mieszać oba scenariusze w jednym tutorialu, lepiej rozdzielić wejście: użytkownik ogólny zostaje tutaj, a lekarz przechodzi do DocPro i tam przechodzi weryfikację PWZ.',
        steps: [
          'Otwórz stronę DocPro.',
          'Zweryfikuj numer PWZ.',
          'Uruchom potrzebny moduł specjalistyczny dopiero wtedy, gdy go potrzebujesz.'
        ],
        primaryLabel: 'Otwórz DocPro',
        action: () => {
          window.location.href = 'docpro.html';
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
      card.classList.toggle('is-selected', card.dataset.role === roleId);
    });

    const config = getConfigForRole(roleId);
    const dialogTitle = state.page === 'docpro'
      ? 'Jak zacząć w DocPro?'
      : 'Jak chcesz korzystać z aplikacji?';
    const dialogSubtitle = state.page === 'docpro'
      ? 'Zamiast sztywnego samouczka masz krótki start, który można zamknąć i otworzyć ponownie.'
      : 'Zamiast pełnoekranowego walkthrough pokazuję tylko to, co potrzebne tu i teraz.';

    const titleEl = state.overlay.querySelector('.ww-onboarding-title');
    const subtitleEl = state.overlay.querySelector('.ww-onboarding-subtitle');
    if (titleEl) titleEl.textContent = dialogTitle;
    if (subtitleEl) subtitleEl.textContent = dialogSubtitle;

    state.dynamicTitle.textContent = config.panelTitle;
    state.dynamicText.textContent = config.panelText;
    state.dynamicList.innerHTML = '';
    config.steps.forEach((step) => {
      const li = document.createElement('li');
      li.textContent = step;
      state.dynamicList.appendChild(li);
    });
    state.primaryBtn.textContent = config.primaryLabel;
    state.primaryBtn.onclick = () => {
      hideSheet({ markSeen: true });
      config.action();
    };
  }

  function showSheet({ markSeen = false } = {}) {
    createOverlay();
    if (markSeen) markOnboardingSeen();
    state.overlay.classList.add('is-open');
    state.helpVisible = true;
    requestAnimationFrame(() => {
      const selected = state.overlay.querySelector('.ww-role-card.is-selected') || state.primaryBtn;
      try {
        selected && selected.focus();
      } catch (_) {}
    });
  }

  function hideSheet({ markSeen = false, showLauncherHint = false } = {}) {
    if (!state.overlay) return;
    if (markSeen) markOnboardingSeen();
    state.overlay.classList.remove('is-open');
    state.helpVisible = false;
    if (showLauncherHint && lsGet(STORAGE_KEYS.launcherHint) !== 'true') {
      lsSet(STORAGE_KEYS.launcherHint, 'true');
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

  function softlyFocus(target, { message = '' } = {}) {
    if (!target) return;
    const focusTarget = target.matches('input, select, textarea, button, a')
      ? target
      : target.querySelector('input, select, textarea, button, a');

    try {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch (_) {}

    target.classList.remove('ww-soft-focus');
    // restart animacji/podświetlenia
    void target.offsetWidth;
    target.classList.add('ww-soft-focus');

    window.setTimeout(() => {
      target.classList.remove('ww-soft-focus');
    }, 2200);

    if (focusTarget && typeof focusTarget.focus === 'function') {
      window.setTimeout(() => {
        try {
          focusTarget.focus({ preventScroll: true });
        } catch (_) {
          try { focusTarget.focus(); } catch (__) {}
        }
      }, 220);
    }

    if (message) showToast(message);
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

  function buildInlineGuide(config) {
    const existing = document.getElementById('wwInlineGuide');
    if (existing) existing.remove();

    const anchor = document.querySelector(config.anchorSelector);
    if (!anchor || !anchor.parentNode) return;

    const card = document.createElement('section');
    card.id = 'wwInlineGuide';
    card.className = 'card ww-inline-guide';

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
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => card.remove());

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
        node.addEventListener('click', action.onClick);
      }
      actions.appendChild(node);
    });

    card.appendChild(head);
    card.appendChild(list);
    card.appendChild(actions);

    if (config.position === 'beforebegin') {
      anchor.parentNode.insertBefore(card, anchor);
    } else if (config.position === 'afterbegin') {
      anchor.insertBefore(card, anchor.firstChild);
    } else {
      anchor.insertAdjacentElement('afterend', card);
    }
  }

  function ensureInlineGuide(roleId) {
    if (state.page === 'docpro' && roleId === 'doctor') {
      buildInlineGuide({
        anchorSelector: '#doctorContainer',
        position: 'afterend',
        title: 'DocPro: szybki start',
        description: 'To jest pomoc osadzona w układzie strony, a nie osobny tutorial zasłaniający interfejs.',
        steps: [
          'Najpierw wpisz PWZ, aby odblokować moduły specjalistyczne.',
          'Następnie uzupełnij dane pacjenta po lewej stronie.',
          'Otwieraj tylko te sekcje, których faktycznie potrzebujesz — reszta może pozostać zwinięta.'
        ],
        actions: [
          {
            type: 'button',
            label: 'Wpisz PWZ',
            onClick: () => {
              waitForVisible('#pwzNumber', 1800, (input) => {
                softlyFocus(input, { message: 'Po poprawnym PWZ pojawią się moduły PRO.' });
              });
            }
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
        anchorSelector: '.user-card',
        position: 'afterend',
        title: 'Pierwsze kroki',
        description: 'Najważniejsze informacje są teraz w jednym krótkim bloku, który dobrze układa się także na telefonach.',
        steps: [
          'Wpisz wiek, wagę i wzrost — wyniki pojawią się automatycznie niżej.',
          'Jeżeli chcesz porównać pomiary w czasie, zapisz dane i później wczytaj je ponownie.',
          'Pomoc wraca po kliknięciu przycisku „Pomoc” w prawym dolnym rogu.'
        ],
        actions: [
          {
            type: 'button',
            label: 'Uzupełnij dane',
            onClick: () => {
              waitForVisible('#age', 1200, (input) => {
                softlyFocus(input, { message: 'Zacznij od wieku, potem wpisz wagę i wzrost.' });
              });
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
    createLauncher();
    createOverlay();

    // Wariant bez autostartu: nie pokazujemy żadnego tutorialu ani modala
    // przy pierwszym uruchomieniu. Zostawiamy wyłącznie przycisk „Pomoc”,
    // który otwiera ten sam ekran startowy na żądanie użytkownika.
    if (!hasSeenOnboarding()) {
      markOnboardingSeen();
    }
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

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  }

  init();
})();
