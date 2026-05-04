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
    console.log('[vilda-nav] START navigateTo:', url);

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
      console.warn('[vilda-nav] before-navigate canceled, full reload');
      window.location.href = url;
      return;
    }

    showLoadingBar();

    let html;
    try {
      console.log('[vilda-nav] FETCH start:', url);
      const res = await fetch(url, {
        signal: abortController.signal,
        headers: { 'Accept': 'text/html', 'X-Requested-With': 'VildaNavigator' }
      });
      console.log('[vilda-nav] FETCH response:', res.status, res.statusText);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      html = await res.text();
      console.log('[vilda-nav] FETCH body length:', html.length);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('[vilda-nav] Aborted (newer navigation took over)');
        return;
      }
      console.warn('[vilda-nav] Fetch failed, fallback to full reload:', err);
      document.dispatchEvent(new CustomEvent('vilda:navigate-error', { detail: { url, error: err } }));
      window.location.href = url;
      return;
    }

    if (currentNavigation && currentNavigation.url !== url) {
      console.log('[vilda-nav] Wyprzedzona przez nowszą nawigację');
      return;
    }

    let newDoc;
    try {
      newDoc = new DOMParser().parseFromString(html, 'text/html');
      console.log('[vilda-nav] PARSE OK, title:', newDoc.title);
    } catch (err) {
      console.warn('[vilda-nav] Parse failed, fallback:', err);
      window.location.href = url;
      return;
    }

    // Escape hatch
    if (newDoc.querySelector('meta[name="vilda-no-turbo"]')) {
      console.info('[vilda-nav] Cel ma meta vilda-no-turbo — fallback do reload');
      window.location.href = url;
      return;
    }

    const newMain = newDoc.querySelector('.main-content');
    const oldMain = document.querySelector('.main-content');
    console.log('[vilda-nav] main-content lookup: new=', !!newMain, 'old=', !!oldMain);
    if (!newMain || !oldMain) {
      console.warn('[vilda-nav] No .main-content, fallback to reload');
      window.location.href = url;
      return;
    }

    // 2. Doładuj brakujące <link rel="stylesheet">
    try {
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
      console.log('[vilda-nav] Stylesheets sync OK');
    } catch (err) {
      console.error('[vilda-nav] Error syncing stylesheets:', err);
    }

    try {
      syncInlineStyles(newDoc);
      console.log('[vilda-nav] Inline styles sync OK');
    } catch (err) {
      console.error('[vilda-nav] Error in syncInlineStyles:', err);
    }

    try {
      syncBodyClass(newDoc);
      console.log('[vilda-nav] Body class sync OK, body class now:', document.body.className);
    } catch (err) {
      console.error('[vilda-nav] Error in syncBodyClass:', err);
    }

    // 3. Aktualizuj <h1>
    try {
      const newH1 = newDoc.querySelector('header h1');
      const oldH1 = document.querySelector('header h1');
      if (newH1 && oldH1) {
        oldH1.textContent = newH1.textContent;
      }
    } catch (err) {
      console.error('[vilda-nav] Error updating h1:', err);
    }

    // 4. Podmień .main-nav
    try {
      const newMainNav = newDoc.querySelector('header .main-nav');
      const oldMainNav = document.querySelector('header .main-nav');
      if (newMainNav && oldMainNav) {
        oldMainNav.replaceWith(newMainNav);
      }
    } catch (err) {
      console.error('[vilda-nav] Error swapping main-nav:', err);
    }

    // 5. Podmień main-content — najważniejszy krok
    try {
      console.log('[vilda-nav] About to replace main-content. New child count:', newMain.children.length);
      oldMain.replaceWith(newMain);
      console.log('[vilda-nav] main-content REPLACED OK');
    } catch (err) {
      console.error('[vilda-nav] Error replacing main-content:', err);
      window.location.href = url;
      return;
    }

    // 6. Title
    if (newDoc.title) document.title = newDoc.title;

    // 7. Meta tags
    try {
      syncMetaTags(newDoc);
    } catch (err) {
      console.error('[vilda-nav] syncMetaTags error:', err);
    }

    // 8. Sidebar active
    try {
      updateSidebarActive(url);
    } catch (err) {
      console.error('[vilda-nav] updateSidebarActive error:', err);
    }

    // 9. Push history
    if (!opts.fromHistory) {
      history.pushState({ vildaNav: true }, '', url);
    }

    // 10. Inline scripts
    try {
      const newMainNavForScripts = document.querySelector('header .main-nav');
      executeScripts(newMain);
      if (newMainNavForScripts) executeScripts(newMainNavForScripts);
      console.log('[vilda-nav] executeScripts done');
    } catch (err) {
      console.error('[vilda-nav] executeScripts error:', err);
    }

    // 11. Doładuj brakujące zewnętrzne scripts
    try {
      await loadMissingScripts(newDoc);
      console.log('[vilda-nav] loadMissingScripts done');
    } catch (err) {
      console.error('[vilda-nav] loadMissingScripts error:', err);
    }

    // 12. Scroll
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView();
      else window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, 0);
    }

    // 13. Google Analytics
    if (typeof window.gtag === 'function') {
      try {
        window.gtag('event', 'page_view', {
          page_path: location.pathname + location.search,
          page_title: document.title,
          page_location: location.href
        });
      } catch (e) { /* noop */ }
    }

    // 14. Custom event
    try {
      document.dispatchEvent(new CustomEvent('vilda:navigated', {
        detail: { url, pathname: location.pathname }
      }));
    } catch (err) {
      console.error('[vilda-nav] vilda:navigated dispatch error:', err);
    }

    // 15. Lucide icons
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try {
        window.lucide.createIcons();
      } catch (e) { /* noop */ }
    }

    hideLoadingBar();
    currentNavigation = null;
    console.log('[vilda-nav] DONE navigateTo:', url);
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
    //
    // Klasa `js-loading` jest WYJĄTKIEM:
    // - jest w markupie HTML każdej strony
    // - normalnie zdejmowana przez app.js w DOMContentLoaded
    // - reguła `body.js-loading .main-content { visibility: hidden }` w style.css UKRYWA TREŚĆ
    // - po Turbo nav DOMContentLoaded nie wystrzela się drugi raz, więc gdyby Turbo
    //   dodał js-loading z markupu, treść byłaby niewidoczna do F5
    // - dlatego js-loading jest IGNOROWANA w obu kierunkach: nie dodajemy, nie usuwamy
    const newBody = newDoc.body;
    if (!newBody) return;
    const oldBody = document.body;

    const newClasses = Array.from(newBody.classList);
    const oldClasses = Array.from(oldBody.classList);

    // Klasy ignorowane całkowicie — w pełni managed przez aplikację, nie przez markup
    const IGNORED = new Set(['js-loading']);

    // Usuń stare klasy (oprócz ignored)
    for (const cls of oldClasses) {
      if (IGNORED.has(cls)) continue;
      if (!newClasses.includes(cls)) {
        oldBody.classList.remove(cls);
      }
    }
    // Dodaj nowe klasy (oprócz ignored — szczególnie js-loading nie może być dodana
    // z markupu nowej strony, bo trzymałaby visibility:hidden na main-content do F5)
    for (const cls of newClasses) {
      if (IGNORED.has(cls)) continue;
      if (!oldBody.classList.contains(cls)) {
        oldBody.classList.add(cls);
      }
    }

    // Dla pewności — Turbo nawigacja oznacza że "ładowanie zakończone".
    // Niezależnie od markupu, body NIE może mieć js-loading po Turbo (visibility:hidden
    // na main-content powodowałby pozorny brak treści — patrz komentarz wyżej).
    oldBody.classList.remove('js-loading');

    // Synchronizuj atrybuty data-* z body (np. data-page, data-theme — ustawiane w HTML)
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
