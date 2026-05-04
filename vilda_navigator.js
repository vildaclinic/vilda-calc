/**
 * vilda_navigator.js — Turbo-style klient-side nawigacja (Faza 5+6).
 *
 * Cel: kliknięcie w link wewnętrzny nie powoduje pełnego reloadu.
 * Sidebar i logo zostają na ekranie, podmieniamy tylko `.main-content` i `.main-nav`,
 * aktualizujemy `<h1>`, title, meta tags. Efekt: aplikacja "nie miga".
 *
 * To jest pragmatyczna implementacja Turbo (Hotwire-style), ~5 KB.
 * Nie wymaga bundlera ani frameworka.
 *
 * Aktywuje się tylko jeśli przeglądarka wspiera fetch + history API + DOMParser.
 * Fallback: zwykły reload (czyli zachowanie sprzed Fazy 5).
 *
 * Eventy:
 * - `vilda:before-navigate` — przed fetchem (event.detail = { url, fromHistory })
 * - `vilda:navigated` — po podmianie DOM (event.detail = { url })
 * - `vilda:navigate-error` — po błędzie (fallback do reload)
 *
 * Moduły mogą się przyłączyć:
 *   document.addEventListener('vilda:navigated', () => {
 *     // re-render ikon, re-attach listenerów dynamic content, etc.
 *   });
 */
(function (window, document) {
  'use strict';

  // Feature detection — bez tych API rezygnujemy.
  if (!window.fetch || !window.history || !window.history.pushState || !window.DOMParser) {
    return;
  }

  // === STAN ===

  // Pamięć skryptów już załadowanych (po src). Pozwala uniknąć ponownego doładowania
  // tego samego skryptu. Inicjalizujemy z aktualnego dokumentu.
  const loadedScripts = new Set();
  Array.from(document.querySelectorAll('script[src]')).forEach(s => {
    loadedScripts.add(normalizeSrc(s.src));
  });

  // Pamięć stylów już załadowanych
  const loadedStyles = new Set();
  Array.from(document.querySelectorAll('link[rel="stylesheet"]')).forEach(l => {
    loadedStyles.add(normalizeSrc(l.href));
  });

  // Aktualna nawigacja (do anulowania przy szybkim klikaniu)
  let currentNavigation = null;

  // === HELPERS ===

  function normalizeSrc(src) {
    if (!src) return '';
    try {
      const u = new URL(src, location.href);
      // Ignoruj query string `?v=N` przy porównaniu — to cache buster, nie zmienia treści.
      // Ale musi być dokładnie ten sam plik.
      return u.origin + u.pathname;
    } catch (e) {
      return src;
    }
  }

  function isInternalLink(a) {
    if (!a || !a.href) return false;
    if (a.target && a.target !== '_self') return false;
    if (a.hasAttribute('download')) return false;
    if (a.dataset.noTurbo === 'true') return false;
    // Tylko same origin
    try {
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return false;
      // Ignoruj mailto:, tel:, javascript:
      if (!/^https?:$/.test(url.protocol)) return false;
      // Ignoruj # bez ścieżki (czysty fragment do tej samej strony)
      if (url.pathname === location.pathname && url.search === location.search && url.hash) {
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // === LOADING BAR ===
  // Cienki turkusowy pasek na górze, jak w Turbolinks.

  let loadingBarEl = null;
  let loadingBarTimer = null;

  function showLoadingBar() {
    if (!loadingBarEl) {
      loadingBarEl = document.createElement('div');
      loadingBarEl.id = 'vilda-nav-progress';
      loadingBarEl.style.cssText =
        'position:fixed;top:0;left:0;height:3px;width:0;' +
        'background:#00b0a6;z-index:9999;transition:width .2s ease-out;' +
        'box-shadow:0 0 8px rgba(0,176,166,.6);pointer-events:none;';
      document.body.appendChild(loadingBarEl);
    }
    loadingBarEl.style.opacity = '1';
    loadingBarEl.style.width = '20%';
    // Po 200ms idziemy do 60%, potem 80% — symulacja postępu
    clearTimeout(loadingBarTimer);
    loadingBarTimer = setTimeout(() => {
      if (loadingBarEl) loadingBarEl.style.width = '60%';
      loadingBarTimer = setTimeout(() => {
        if (loadingBarEl) loadingBarEl.style.width = '85%';
      }, 400);
    }, 200);
  }

  function hideLoadingBar() {
    clearTimeout(loadingBarTimer);
    if (!loadingBarEl) return;
    loadingBarEl.style.width = '100%';
    setTimeout(() => {
      if (loadingBarEl) loadingBarEl.style.opacity = '0';
    }, 150);
  }

  // === GŁÓWNA LOGIKA ===

  async function navigateTo(url, opts = {}) {
    opts = opts || {};

    // Anuluj poprzednią nawigację jeśli była
    if (currentNavigation) {
      currentNavigation.abortController.abort();
    }
    const abortController = new AbortController();
    currentNavigation = { url, abortController };

    // Eventy
    const beforeEvent = new CustomEvent('vilda:before-navigate', {
      detail: { url, fromHistory: !!opts.fromHistory },
      cancelable: true
    });
    if (!document.dispatchEvent(beforeEvent)) {
      // Anulowane przez listenera — fallback do zwykłego reload
      window.location.href = url;
      return;
    }

    showLoadingBar();

    let html;
    try {
      const res = await fetch(url, {
        signal: abortController.signal,
        headers: { 'Accept': 'text/html', 'X-Requested-With': 'VildaNavigator' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      html = await res.text();
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('[vilda-nav] Fetch failed, fallback to full reload:', err);
      document.dispatchEvent(new CustomEvent('vilda:navigate-error', { detail: { url, error: err } }));
      window.location.href = url;
      return;
    }

    if (currentNavigation && currentNavigation.url !== url) return; // wyprzedzona

    let newDoc;
    try {
      newDoc = new DOMParser().parseFromString(html, 'text/html');
    } catch (err) {
      console.warn('[vilda-nav] Parse failed, fallback:', err);
      window.location.href = url;
      return;
    }

    // Escape hatch: jeśli docelowa strona ma <meta name="vilda-no-turbo">,
    // fallback do pełnego reloadu. Dla podstron które wymagają fresh init
    // wszystkich modułów (np. po regresjach JavaScript).
    if (newDoc.querySelector('meta[name="vilda-no-turbo"]')) {
      console.info('[vilda-nav] Cel ma meta vilda-no-turbo — fallback do reload');
      window.location.href = url;
      return;
    }

    // === PODMIANA DOM ===

    // 1. main-content (główna treść)
    const newMain = newDoc.querySelector('.main-content');
    const oldMain = document.querySelector('.main-content');
    if (!newMain || !oldMain) {
      console.warn('[vilda-nav] No .main-content, fallback to reload');
      window.location.href = url;
      return;
    }

    // 2. Doładuj brakujące <link rel="stylesheet"> z nowej strony
    // (np. klirens może mieć inline style/skrypty których nie ma index)
    const newLinks = Array.from(newDoc.querySelectorAll('link[rel="stylesheet"]'));
    for (const link of newLinks) {
      const norm = normalizeSrc(link.href);
      if (!loadedStyles.has(norm)) {
        loadedStyles.add(norm);
        const clone = document.createElement('link');
        clone.rel = 'stylesheet';
        clone.href = link.href;
        if (link.media) clone.media = link.media;
        document.head.appendChild(clone);
      }
    }

    // 2a. Synchronizuj inline <style> bloki z <head> nowej strony.
    // Niektóre strony (cukrzyca: 102 KB inline, klirens: 46 KB, docpro: 33 KB,
    // ustawienia: 18 KB) mają duże <style> bloki w head, specyficzne dla strony.
    // Bez tego style strony X "trzymają" wygląd po nawigacji do strony Y.
    syncInlineStyles(newDoc);

    // 2b. Synchronizuj <body> klasę i atrybuty.
    // Strony różnią się body class (page-cukrzyca, page-settings, edu-page,
    // has-sidebar, liquid-ios26 ...). Bez synchronizacji style "page-X" nie aktywują się.
    // Zachowujemy js-loading jeśli było (navigator nie powinien jego ruszać),
    // ale klas page-* musimy zresetować i ustawić zgodnie z nową stroną.
    syncBodyClass(newDoc);

    // 3. Aktualizuj <h1> w headerze (textContent — bez flickera logo)
    const newH1 = newDoc.querySelector('header h1');
    const oldH1 = document.querySelector('header h1');
    if (newH1 && oldH1) {
      oldH1.textContent = newH1.textContent;
    }

    // 4. Podmień .main-nav (różny set linków save/load między stronami)
    const newMainNav = newDoc.querySelector('header .main-nav');
    const oldMainNav = document.querySelector('header .main-nav');
    if (newMainNav && oldMainNav) {
      oldMainNav.replaceWith(newMainNav);
    }

    // 5. Podmień main-content
    oldMain.replaceWith(newMain);

    // 6. Aktualizuj title
    if (newDoc.title) {
      document.title = newDoc.title;
    }

    // 7. Aktualizuj meta description i og:tags
    syncMetaTags(newDoc);

    // 8. Aktualizuj aktywny element w sidebarze
    updateSidebarActive(url);

    // 9. Push history state (jeśli nie z popstate)
    if (!opts.fromHistory) {
      history.pushState({ vildaNav: true }, '', url);
    }

    // 10. Wykonaj inline scripts z nowego main-content + main-nav
    // (DOMParser nie wykonuje skryptów, więc musimy ręcznie)
    executeScripts(newMain);
    if (newMainNav) executeScripts(newMainNav);

    // 11. Doładuj brakujące zewnętrzne <script src> z nowej strony (z całego dokumentu)
    await loadMissingScripts(newDoc);

    // 12. Scroll: do góry, lub do hash jeśli był
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView();
      else window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, 0);
    }

    // 13. Google Analytics — track jako nowy pageview
    if (typeof window.gtag === 'function') {
      try {
        window.gtag('event', 'page_view', {
          page_path: location.pathname + location.search,
          page_title: document.title,
          page_location: location.href
        });
      } catch (e) { /* noop */ }
    }

    // 14. Wystrzel custom event — moduły mogą się re-inicjalizować
    document.dispatchEvent(new CustomEvent('vilda:navigated', {
      detail: { url, pathname: location.pathname }
    }));

    // 15. Lucide icons — re-render dla nowych <span data-lucide="X"> w main-content.
    // Lucide jest commonly używane w sidebar i navigation, ale też w treści stron.
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try {
        window.lucide.createIcons();
      } catch (e) { /* noop */ }
    }

    hideLoadingBar();
    currentNavigation = null;
  }

  // === SYNC HELPERS ===

  // Atrybut na elemencie identyfikujący że dany style/element został dodany przez navigator
  // (zarządzamy nim — usuwamy przy następnej nawigacji, żeby nie zostawiać śmieci)
  const NAV_OWNED_ATTR = 'data-vilda-nav-owned';

  // Zachowaj sygnaturę (text content) inline style które są już w <head> przy starcie aplikacji.
  // Te STYLE PIERWOTNE NIE są usuwane przy nawigacji — to są style oryginalnej strony.
  // Reszta (style dodane przez navigator z nowej strony) są usuwane przy każdej nawigacji.
  const initialInlineStyleSignatures = new Set();
  Array.from(document.head.querySelectorAll('style')).forEach(s => {
    initialInlineStyleSignatures.add(s.textContent.trim().slice(0, 200));
  });

  function syncInlineStyles(newDoc) {
    // Krok 1: usuń style dodane wcześniej przez navigator (z poprzedniej nawigacji)
    Array.from(document.head.querySelectorAll(`style[${NAV_OWNED_ATTR}]`))
      .forEach(s => s.remove());

    // Krok 2: dla każdego <style> w nowym <head>, jeśli nie ma go już w obecnym head
    // (na bazie sygnatury content prefix), dodaj kopię oznaczoną jako "owned" przez navigator.
    const newStyles = Array.from(newDoc.head.querySelectorAll('style'));
    const currentSigs = new Set();
    Array.from(document.head.querySelectorAll('style')).forEach(s => {
      currentSigs.add(s.textContent.trim().slice(0, 200));
    });

    for (const newStyle of newStyles) {
      const sig = newStyle.textContent.trim().slice(0, 200);
      if (currentSigs.has(sig)) continue;
      if (initialInlineStyleSignatures.has(sig)) continue;
      const clone = document.createElement('style');
      // Skopiuj atrybuty (id, media, etc.)
      for (const attr of newStyle.attributes) {
        clone.setAttribute(attr.name, attr.value);
      }
      clone.textContent = newStyle.textContent;
      clone.setAttribute(NAV_OWNED_ATTR, 'style');
      document.head.appendChild(clone);
    }
  }

  function syncBodyClass(newDoc) {
    // Strony różnią się body class (page-cukrzyca, page-settings, edu-page,
    // has-sidebar, liquid-ios26 itp.) — te klasy aktywują specyficzne reguły CSS.
    // Klasy `js-loading` jest dynamiczna (managed przez app.js), nie ruszamy.
    const newBody = newDoc.body;
    if (!newBody) return;
    const oldBody = document.body;

    const newClasses = Array.from(newBody.classList);
    const oldClasses = Array.from(oldBody.classList);

    // Klasy które chronimy przed zmianą (managed przez inne moduły, nie przez markup HTML)
    const PROTECTED = new Set(['js-loading']);

    // Usuń stare klasy (oprócz protected)
    for (const cls of oldClasses) {
      if (PROTECTED.has(cls)) continue;
      if (!newClasses.includes(cls)) {
        oldBody.classList.remove(cls);
      }
    }
    // Dodaj nowe klasy
    for (const cls of newClasses) {
      if (!oldBody.classList.contains(cls)) {
        oldBody.classList.add(cls);
      }
    }

    // Synchronizuj atrybuty data-* z body (np. data-page, data-theme — ustawiane w HTML)
    // (atrybuty inne niż class)
    for (const attr of Array.from(oldBody.attributes)) {
      if (attr.name === 'class') continue;
      if (attr.name.startsWith('data-vilda-')) continue; // nasze własne, zostawiamy
      if (!newBody.hasAttribute(attr.name)) {
        oldBody.removeAttribute(attr.name);
      }
    }
    for (const attr of Array.from(newBody.attributes)) {
      if (attr.name === 'class') continue;
      if (oldBody.getAttribute(attr.name) !== attr.value) {
        oldBody.setAttribute(attr.name, attr.value);
      }
    }
  }

  function syncMetaTags(newDoc) {
    // Zaktualizuj te meta tagi które się różnią między stronami
    const selectors = [
      'meta[name="description"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[property="og:url"]',
      'meta[property="og:image"]',
      'link[rel="canonical"]'
    ];
    for (const sel of selectors) {
      const oldEl = document.head.querySelector(sel);
      const newEl = newDoc.head.querySelector(sel);
      if (oldEl && newEl) {
        // Skopiuj atrybuty content/href
        if (newEl.hasAttribute('content')) oldEl.setAttribute('content', newEl.getAttribute('content'));
        if (newEl.hasAttribute('href')) oldEl.setAttribute('href', newEl.getAttribute('href'));
      } else if (newEl && !oldEl) {
        document.head.appendChild(newEl.cloneNode(true));
      }
    }
  }

  function updateSidebarActive(url) {
    const path = new URL(url, location.href).pathname;
    const targetFile = path.split('/').pop() || 'index.html';
    document.querySelectorAll('aside.sidebar a, aside.sidebar [aria-current]').forEach(a => {
      a.removeAttribute('aria-current');
      a.classList.remove('is-active');
    });
    document.querySelectorAll('aside.sidebar a').forEach(a => {
      const aPath = a.getAttribute('href');
      if (!aPath) return;
      const aFile = aPath.split('/').pop() || 'index.html';
      if (aFile === targetFile || (targetFile === '' && aFile === 'index.html')) {
        a.setAttribute('aria-current', 'page');
        a.classList.add('is-active');
      }
    });
  }

  function executeScripts(root) {
    // Znajdź <script> wewnątrz root i wykonaj je ponownie.
    // DOMParser tworzy script elementy które NIE są wykonywane przez przeglądarkę.
    // Tworzymy nowe elementy i wstawiamy je — wtedy się wykonują.
    const scripts = Array.from(root.querySelectorAll('script'));
    for (const oldScript of scripts) {
      const newScript = document.createElement('script');
      // Skopiuj atrybuty
      for (const attr of oldScript.attributes) {
        newScript.setAttribute(attr.name, attr.value);
      }
      // Inline body
      if (!oldScript.src) {
        newScript.textContent = oldScript.textContent;
      } else {
        // Z atrybutem src — sprawdź czy nie był już załadowany (deduplikacja)
        const norm = normalizeSrc(oldScript.src);
        if (loadedScripts.has(norm)) {
          // Już załadowany — pomiń, nie wykonujemy ponownie
          oldScript.remove();
          continue;
        }
        loadedScripts.add(norm);
      }
      // Zastąp stary nowym
      oldScript.parentNode.replaceChild(newScript, oldScript);
    }
  }

  function loadMissingScripts(newDoc) {
    // Doładuj zewnętrzne skrypty których nie ma jeszcze na obecnej stronie.
    // Np. klirens ma vilda_creatinine.js — nie ma go w index.
    // Po nawigacji do klirens trzeba go dograć.
    const newSrcs = Array.from(newDoc.querySelectorAll('script[src]')).map(s => ({
      src: s.src,
      defer: s.defer,
      async: s.async,
      norm: normalizeSrc(s.src)
    }));
    const promises = [];
    for (const item of newSrcs) {
      if (loadedScripts.has(item.norm)) continue;
      loadedScripts.add(item.norm);
      promises.push(new Promise((resolve) => {
        const el = document.createElement('script');
        el.src = item.src;
        el.onload = () => resolve();
        el.onerror = () => {
          console.warn('[vilda-nav] Failed to load script:', item.src);
          resolve();
        };
        // Bez defer/async — chcemy wykonanie teraz, w kolejności
        document.head.appendChild(el);
      }));
    }
    return Promise.all(promises);
  }

  // === EVENT HANDLERS ===

  document.addEventListener('click', (e) => {
    // Ignoruj jeśli modyfikator klawiszowy (Ctrl+klik = nowa karta)
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (e.button !== 0) return; // tylko lewy przycisk

    const a = e.target.closest('a[href]');
    if (!isInternalLink(a)) return;
    e.preventDefault();
    navigateTo(a.href);
  });

  window.addEventListener('popstate', (e) => {
    // Tylko jeśli stan był nasz (uniknij konfliktu z innymi pushState)
    // W praktyce: każda nawigacja przeglądarka zostawia własny entry,
    // więc obsługujemy wszystkie popstate.
    navigateTo(location.href, { fromHistory: true });
  });

  // === EXPOSE API ===

  window.VildaNavigator = {
    version: '1.0.0',
    navigateTo: navigateTo,
    isInternalLink: isInternalLink
  };

  console.log('[vilda-nav] Aktywny — Turbo-style nawigacja.');
})(window, document);
