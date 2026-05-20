/*
 * vilda_chrome.js — wspólny komponent nagłówka i menu bocznego dla wagaiwzrost.pl
 * v1.0.0
 *
 * Cel: jedno źródło prawdy o nawigacji i strefie informacyjnej (zalogowany
 * użytkownik + wczytany pacjent) dla wszystkich podstron PWA. Eliminujemy
 * duplikację HTML w 15 plikach i likwidujemy „skakanie viewportu” podczas
 * przechodzenia między stronami — sidebar i header mają identyczne wymiary
 * i strukturę na każdej podstronie.
 *
 * Wymagania środowiska:
 *   - VildaVault (window.VildaVault)        — informacja o zalogowanym koncie
 *   - VildaPersistence (opcjonalnie)        — odczyt preferencji UI
 *   - lucide.createIcons (opcjonalnie)      — ikony w sidebarze
 *
 * Sposób użycia w HTML:
 *   <script src="vilda_chrome.js?v=1" defer></script>
 *   <header data-vilda-chrome-header></header>
 *   <aside data-vilda-chrome-sidebar class="sidebar"></aside>
 *
 * Komponent automatycznie:
 *   - renderuje header (logo + brand + chip pacjenta + chip konta),
 *   - renderuje sidebar (grupy: Pacjent / Narzędzia / Konto i pomoc),
 *   - podświetla aktywną pozycję menu wg window.location.pathname,
 *   - utrzymuje aktualny stan chipów w czasie rzeczywistym,
 *   - na mobile pokazuje hamburger w headerze i drawer-menu po kliknięciu.
 *
 * Stare elementy zachowujemy z tymi samymi ID, aby istniejący kod (custom-fixes.js,
 * vilda_data_import_export.js, mini-summary, steroid-summary) działał bez zmian:
 *   #saveDataBtnSidebar
 */

(function (global) {
  'use strict';

  if (!global || (global.VildaChrome && global.VildaChrome.__vildaChrome)) return;

  var VERSION = '1.0.0';

  // ============ KONFIGURACJA MENU ============
  // Pojedyncze źródło prawdy o nawigacji. Zmiana tej tablicy przekłada się
  // na wszystkie podstrony aplikacji.
  var MENU = [
    {
      title: 'Pacjent',
      hideDrawerTitle: true,  // sekcja konta w drawerze już pokazuje dane pacjenta
      items: [
        {
          id: 'saveDataBtnSidebar',
          label: 'Zapisz dane',
          icon: 'save',
          role: 'button',
          ariaDisabled: true,
          tip: 'Aby zapisać dane, wprowadź imię, wiek, wzrost i wagę.'
        },
        {
          id: 'patientsListBtnSidebar',
          label: 'Pacjenci',
          icon: 'users',
          role: 'button',
          authOnly: true,
          tip: 'Zaloguj się, aby przeglądać bazę pacjentów.'
        }
      ]
    },
    {
      title: 'Narzędzia',
      items: [
        { href: 'index.html', label: 'Strona główna', icon: 'home' },
        { href: 'docpro.html', label: 'DocPro', icon: 'stethoscope', cls: 'pro-link' },
        { href: 'homa-ir.html', label: 'HOMA-IR', icon: 'calculator' },
        { href: 'kalkulator-klirens.html', label: 'Klirens', icon: 'droplets' },
        { href: 'cukrzyca.html', label: 'Cukrzyca', icon: 'syringe' },
        { href: 'steroidy.html', label: 'Steroidy', icon: 'pill' },
        { href: 'przelicznik-jednostek.html', label: 'Jednostki lab.', icon: 'flask-conical' },
        { href: 'materialy-edukacyjne.html', label: 'Edu', icon: 'book-open' }
      ]
    },
    {
      title: 'Konto',
      items: [
        { href: 'ustawienia.html', label: 'Ustawienia', icon: 'settings' }
      ]
    }
  ];

  // Pliki HTML, które reprezentują wewnętrzne instrukcje wideo —
  // przy podświetlaniu aktywnego linku traktujemy je jako część "Edu".
  var EDU_DESCENDANTS = [
    'ngenla-instrukcja.html',
    'genotropin-instrukcja.html',
    'omnitrope-instrukcja.html',
    'przelicznik-doposilkowy-instrukcja.html'
  ];

  var doc = global.document;
  if (!doc) return;

  var booted = false;
  var headerStripBound = false;
  var patientWatcherBound = false;
  var lastPatientSnapshot = '';

  // ============ HELPERY ============
  function escHTML(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function currentFile() {
    try {
      var path = global.location && global.location.pathname || '';
      var slash = path.lastIndexOf('/');
      var file = slash >= 0 ? path.substring(slash + 1) : path;
      if (!file) return 'index.html';
      return file;
    } catch (_) {
      return 'index.html';
    }
  }

  function isEduLikePage(file) {
    if (file === 'materialy-edukacyjne.html') return true;
    return EDU_DESCENDANTS.indexOf(file) !== -1;
  }

  function getInitials(label) {
    if (!label) return '?';
    var parts = String(label).trim().split(/\s+/);
    var s = '';
    for (var i = 0; i < parts.length && s.length < 2; i++) {
      if (parts[i].length) s += parts[i].charAt(0).toUpperCase();
    }
    return s || '?';
  }

  function safeCreateIcons(root) {
    try {
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: root || doc });
        return true;
      }
    } catch (_) { /* noop */ }
    return false;
  }

  /* Retry rendering Lucide icons when the library loads later than chrome.js.
     Na podstronach typu homa-ir.html biblioteka `lucide` jest dołączona z `defer`
     dopiero w body (po vilda_chrome.js), więc gdy chrome.js robi pierwszy
     `safeCreateIcons`, `window.lucide` może być jeszcze nieobecny i ikona
     hamburgera w stripie pozostaje pusta — przez co użytkownik widzi „szary pasek
     bez nic". Próbujemy ponownie po DOMContentLoaded, po window.load oraz w pętli
     z krótkim opóźnieniem aż się uda (max 20 prób, ~3 s). */
  function scheduleIconRetry() {
    var attempts = 0;
    var maxAttempts = 20;
    function tick() {
      if (safeCreateIcons()) return;
      if (attempts++ >= maxAttempts) return;
      setTimeout(tick, 150);
    }
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', tick);
    } else {
      tick();
    }
    if (global.addEventListener) {
      global.addEventListener('load', function () { safeCreateIcons(); }, { once: true });
    }
  }

  // ============ RENDER SIDEBAR ============
  function findSidebarMount() {
    // Preferowane: nowy mount-point, ale obsługujemy też istniejący <aside class="sidebar">
    return doc.querySelector('aside[data-vilda-chrome-sidebar]') ||
           doc.querySelector('aside.sidebar');
  }

  function renderSidebarItem(item) {
    var attrs = [];
    if (item.id) attrs.push('id="' + escHTML(item.id) + '"');
    attrs.push('href="' + escHTML(item.href || '#') + '"');
    var classes = ['sidebar-link'];
    if (item.cls) classes.push(item.cls);
    if (item.authOnly) classes.push('auth-only-item');
    attrs.push('class="' + classes.join(' ') + '"');
    if (item.role) attrs.push('role="' + escHTML(item.role) + '"');
    if (item.ariaDisabled) attrs.push('aria-disabled="true"');
    if (item.authOnly) attrs.push('data-auth-only="true"');
    if (item.tip) attrs.push('data-tip="' + escHTML(item.tip) + '"');

    var html = [
      '<li>',
      '  <a ' + attrs.join(' ') + '>',
      '    <span class="sidebar-icon" data-lucide="' + escHTML(item.icon || 'circle') + '" aria-hidden="true"></span>',
      '    <span class="sidebar-label">' + escHTML(item.label) + '</span>',
      '  </a>',
      item.extraHTML || '',
      '</li>'
    ].join('');
    return html;
  }

  function renderSidebarHTML() {
    var html = ['<div class="sidebar-inner">'];
    html.push('<nav class="sidebar-nav" aria-label="Nawigacja boczna">');
    for (var i = 0; i < MENU.length; i++) {
      var grp = MENU[i];
      html.push('<div class="sidebar-section">');
      html.push('  <div class="sidebar-section-title">' + escHTML(grp.title) + '</div>');
      html.push('  <ul>');
      for (var j = 0; j < grp.items.length; j++) {
        html.push(renderSidebarItem(grp.items[j]));
      }
      html.push('  </ul>');
      html.push('</div>');
    }
    html.push('</nav>');
    // Punkt rozszerzeń — tu inny kod (custom-fixes.js) wstawia mini-summary
    // i steroid-summary. Zostaje pusty kontener, do którego dotychczasowe
    // moduły appendują swoje karty.
    html.push('<div class="sidebar-extras" data-vilda-chrome-extras></div>');
    html.push('</div>');
    return html.join('');
  }

  function mountSidebar() {
    var aside = findSidebarMount();
    if (!aside) return false;

    // Sprawdź czy już zamontowane (np. po SPA-rerenderze)
    if (aside.getAttribute('data-vilda-chrome-mounted') === '1') {
      // tylko odświeżamy podświetlenie aktywnego linku
      highlightActiveLink(aside);
      return true;
    }

    // Zachowaj ewentualne pre-istniejące rozszerzenia (np. miniSummary
    // wcześniej dopisany przez custom-fixes.js, jeśli skrypty załadowały
    // się w nietypowej kolejności)
    var preExisting = [];
    var miniRef = aside.querySelector('#miniSummary');
    if (miniRef) preExisting.push(miniRef);
    var steroidRef = aside.querySelector('.steroid-summary:not(.mini-summary .steroid-summary)');
    if (steroidRef && preExisting.indexOf(steroidRef) === -1) preExisting.push(steroidRef);

    aside.classList.add('sidebar', 'sidebar-v2');
    aside.innerHTML = renderSidebarHTML();
    aside.setAttribute('data-vilda-chrome-mounted', '1');

    var extras = aside.querySelector('[data-vilda-chrome-extras]');
    if (extras && preExisting.length) {
      preExisting.forEach(function (node) { extras.appendChild(node); });
    }

    safeCreateIcons(aside);
    highlightActiveLink(aside);
    return true;
  }

  function highlightActiveLink(scope) {
    var aside = scope || findSidebarMount();
    if (!aside) return;
    var file = currentFile();
    var links = aside.querySelectorAll('.sidebar-nav a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute('href') || '';
      var slash = href.lastIndexOf('/');
      var hrefFile = slash >= 0 ? href.substring(slash + 1) : href;
      var match = hrefFile === file ||
                  (hrefFile === 'materialy-edukacyjne.html' && isEduLikePage(file));
      if (match) {
        a.setAttribute('aria-current', 'page');
        a.classList.add('is-active');
      } else {
        a.removeAttribute('aria-current');
        a.classList.remove('is-active');
      }
    }

    // To samo dla mobilnego menu (drawer)
    var mobileLinks = doc.querySelectorAll('[data-vilda-chrome-drawer] a[href]');
    for (var k = 0; k < mobileLinks.length; k++) {
      var b = mobileLinks[k];
      var hrefM = b.getAttribute('href') || '';
      var slashM = hrefM.lastIndexOf('/');
      var hrefFileM = slashM >= 0 ? hrefM.substring(slashM + 1) : hrefM;
      if (hrefFileM === file) {
        b.setAttribute('aria-current', 'page');
        b.classList.add('is-active');
      } else {
        b.removeAttribute('aria-current');
        b.classList.remove('is-active');
      }
    }
  }

  // ============ RENDER HEADER STRIP ============
  function findHeaderMount() {
    return doc.querySelector('header[data-vilda-chrome-header]') ||
           doc.querySelector('header');
  }

  function renderHeaderStripHTML() {
    return [
      '<div class="chrome-strip" data-vilda-chrome-strip>',
      '  <button type="button" class="chrome-mobile-menu-btn" aria-label="Otwórz menu" data-vilda-chrome-menu-btn>',
      // Inline SVG (3 poziome linie) — niezależne od Lucide, geometrycznie
      // wyśrodkowane w przycisku. Wcześniej fallback ≡ (U+2261) miał
      // asymetryczne metryki pionowe w wielu fontach i przesuwał się o ~1-2 px
      // w dół względem reszty pasków na mobile.
      '    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>',
      '  </button>',
      '  <a href="index.html" class="chrome-brand">',
      '    <img src="logo_vilda.jpeg" alt="" class="chrome-brand-logo">',
      '    <span class="chrome-brand-text">',
      '      <span class="chrome-brand-name">wagaiwzrost.pl</span>',
      '      <span class="chrome-brand-tagline">Vilda Clinic</span>',
      '    </span>',
      '  </a>',
      '  <div class="chrome-chips">',
      // Etykieta PRO — widoczna tylko gdy użytkownik zalogowany.
      // Stan ustawiany przez vilda_auth_ui.js (updateProBadge / hideProBadge).
      // data-pro-state="active"  → fioletowe „PRO"  (aktywna subskrypcja)
      // data-pro-state="upgrade" → turkusowe „↑ PRO" (zalogowany, brak PRO)
      '    <a href="subskrypcja.html" class="chrome-pro-badge" id="vildaProBadge"',
      '       title="Status planu PRO" aria-label="Status planu PRO">PRO</a>',
      // Przycisk statusu synchronizacji — widoczny tylko gdy sync włączony.
      // Klikniecie przenosi do sekcji sync w ustawieniach.
      // Stan ('syncing'|'ok'|'error') ustawiany przez vilda:sync-status-changed.
      '    <a href="ustawienia.html#settings-section-sync"',
      '       class="chrome-sync-btn" id="vildaSyncBtn"',
      '       title="Synchronizacja między urządzeniami" aria-label="Status synchronizacji">',
      '      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '        <polyline points="16 16 12 12 8 16"/>',
      '        <line x1="12" y1="12" x2="12" y2="21"/>',
      '        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>',
      '      </svg>',
      '    </a>',
      '    <div class="chrome-chip chrome-patient-chip is-empty" id="vildaPatientChip" aria-live="polite">',
      '      <span class="chip-icon" data-lucide="user-round" aria-hidden="true"></span>',
      '      <span class="chip-content">',
      '        <span class="chip-label">Pacjent</span>',
      '        <span class="chip-value" id="vildaPatientValue">—</span>',
      '      </span>',
      '    </div>',
      '    <div class="chrome-chip chrome-user-chip is-loading" id="vildaUserChip" aria-live="polite">',
      '      <span class="chip-avatar" id="vildaUserAvatar" aria-hidden="true">…</span>',
      '      <span class="chip-content">',
      '        <span class="chip-label">Konto</span>',
      '        <span class="chip-value" id="vildaUserValue">…</span>',
      '      </span>',
      '      <button type="button" class="chip-action" id="vildaUserAction" title="Wyloguj się" aria-label="Wyloguj się">',
      // Fallback ↩ widoczny zanim Lucide zamieni span na svg.
      '        <span data-lucide="log-out" aria-hidden="true" class="chrome-icon-fallback chrome-icon-fallback--small">&#x21AA;</span>',
      '      </button>',
      '    </div>',
      '  </div>',
      '</div>',
      // Subpasek brandingowy — widoczny tylko na mobile (ukryty przez CSS na >=992px)
      '<div class="chrome-mobile-brand-bar" aria-hidden="true">wagaiwzrost.pl</div>',
      // Mobilne menu — drawer wysuwany po kliknięciu hamburgera
      '<div class="chrome-drawer" data-vilda-chrome-drawer hidden aria-hidden="true">',
      '  <div class="chrome-drawer-backdrop" data-vilda-chrome-drawer-close></div>',
      '  <div class="chrome-drawer-panel" role="dialog" aria-label="Menu">',
      '    <div class="chrome-drawer-head">',
      '      <span class="chrome-drawer-title">Menu</span>',
      '      <button type="button" class="chrome-drawer-close" data-vilda-chrome-drawer-close aria-label="Zamknij menu">',
      // Inline SVG zamiast <span data-lucide> — niezależne od tego czy biblioteka
      // Lucide zdąży się załadować. Ikona X jest zawsze widoczna.
      '        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
      '      </button>',
      '    </div>',
      '    <div class="chrome-drawer-body" data-vilda-chrome-drawer-body></div>',
      '  </div>',
      '</div>'
    ].join('');
  }

  function renderDrawerMenuHTML() {
    var html = [];

    // Sekcja "Konto" na samym dole drawera — zastępuje funkcjonalność chipów
    // ze stripa, które na wąskich viewportach (<600px) są przycięte do samej
    // ikonki i tracą klikalność. Bez tego mobilny użytkownik nie miałby jak
    // się zalogować ani wylogować.
    html.push('<div class="chrome-drawer-account" data-vilda-chrome-drawer-account>');
    html.push('  <div class="chrome-drawer-account-row">');
    html.push('    <span class="chrome-drawer-account-avatar" data-vilda-chrome-drawer-avatar aria-hidden="true">…</span>');
    html.push('    <div class="chrome-drawer-account-info">');
    html.push('      <span class="chrome-drawer-account-label">Konto</span>');
    html.push('      <span class="chrome-drawer-account-value" data-vilda-chrome-drawer-user-value>…</span>');
    html.push('    </div>');
    html.push('  </div>');
    html.push('  <button type="button" class="chrome-drawer-account-action" data-vilda-chrome-drawer-user-action>');
    html.push('    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-vilda-chrome-drawer-action-icon><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>');
    html.push('    <span data-vilda-chrome-drawer-action-label>Zaloguj się</span>');
    html.push('  </button>');
    html.push('  <div class="chrome-drawer-patient-row" data-vilda-chrome-drawer-patient-row>');
    html.push('    <span class="chrome-drawer-patient-label">Pacjent</span>');
    html.push('    <span class="chrome-drawer-patient-value" data-vilda-chrome-drawer-patient-value>—</span>');
    html.push('  </div>');
    html.push('</div>');

    html.push('<nav class="chrome-drawer-nav" aria-label="Menu mobilne">');
    for (var i = 0; i < MENU.length; i++) {
      var grp = MENU[i];
      var items = grp.items;

      // Sprawdź czy sekcja ma cokolwiek do wyrenderowania
      var hasItems = false;
      for (var k = 0; k < items.length; k++) {
        if (items[k].href || items[k].role === 'button') { hasItems = true; break; }
      }
      if (!hasItems) continue;

      html.push('<div class="chrome-drawer-section">');
      // hideDrawerTitle: true — sekcja "Pacjent" pomija tytuł bo drawer-account
      // już pokazuje dane pacjenta i "Pacjent" pojawiłoby się podwójnie.
      if (!grp.hideDrawerTitle) {
        html.push('  <div class="chrome-drawer-section-title">' + escHTML(grp.title) + '</div>');
      }
      html.push('  <ul>');
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        if (it.role === 'button') {
          // Renderujemy przyciski akcji (Zapisz/Wczytaj/Pacjenci) jako <button>
          // z tym samym wyglądem co linki nawigacyjne.
          var btnClasses = ['chrome-drawer-btn'];
          if (it.authOnly) btnClasses.push('auth-only-item');
          html.push('<li><button type="button" class="' + btnClasses.join(' ') + '" data-drawer-btn="' + escHTML(it.id || '') + '"' + (it.authOnly ? ' data-auth-only="true"' : '') + '>');
          html.push('  <span class="chrome-drawer-icon" data-lucide="' + escHTML(it.icon || 'circle') + '" aria-hidden="true"></span>');
          html.push('  <span class="chrome-drawer-label">' + escHTML(it.label) + '</span>');
          html.push('</button></li>');
          continue;
        }
        var attrs = ['href="' + escHTML(it.href || '#') + '"'];
        if (it.cls) attrs.push('class="' + escHTML(it.cls) + '"');
        html.push('<li><a ' + attrs.join(' ') + '>');
        html.push('  <span class="chrome-drawer-icon" data-lucide="' + escHTML(it.icon || 'circle') + '" aria-hidden="true"></span>');
        html.push('  <span class="chrome-drawer-label">' + escHTML(it.label) + '</span>');
        html.push('</a></li>');
      }
      html.push('  </ul>');
      html.push('</div>');
    }
    html.push('</nav>');
    return html.join('');
  }

  function mountHeader() {
    var header = findHeaderMount();
    if (!header) return false;

    // Nie nadpisujemy headera w całości, tylko dopinamy strip + drawer.
    // To pozwala zachować stare nawigacje (.main-nav) jeśli jeszcze są
    // w HTML i je ukryć przez CSS (.has-vilda-chrome .main-nav { display:none }).
    if (header.getAttribute('data-vilda-chrome-mounted') !== '1') {
      // Ukryj stary kontener .container z logo i .main-nav,
      // bo dostarczamy własny brand i mobilne menu.
      var oldContainer = header.querySelector(':scope > .container');
      if (oldContainer) oldContainer.style.display = 'none';
      var oldMainNav = header.querySelector(':scope > .main-nav');
      if (oldMainNav) oldMainNav.style.display = 'none';

      // Wstaw strip + drawer
      var wrap = doc.createElement('div');
      wrap.setAttribute('data-vilda-chrome-wrap', '');
      wrap.innerHTML = renderHeaderStripHTML();
      header.appendChild(wrap);
      header.setAttribute('data-vilda-chrome-mounted', '1');
      doc.body.classList.add('has-vilda-chrome');

      // Mobile drawer MUSI być poza nagłówkiem — header ma `backdrop-filter`
      // i tworzy własny kontekst stosu, przez co drawer (mimo z-index: 99999)
      // był "uwięziony" w warstwie z-index: 50 nagłówka i znikał pod kartami
      // `._glass` w main-content (które też mają własne backdrop-filter
      // konteksty stosu). Wyciągamy drawer bezpośrednio do <body>, żeby był
      // top-levelowym fixed-elementem ponad wszystkim innym.
      var drawerEl = wrap.querySelector('[data-vilda-chrome-drawer]');
      if (drawerEl && drawerEl.parentElement !== doc.body) {
        doc.body.appendChild(drawerEl);
      }
    }

    // Drawer body (renderowany leniwie przy pierwszym otwarciu, ale
    // wstawiamy zawartość od razu, bo to jeden komponent). Drawer został
    // przeniesiony do <body>, więc szukamy globalnie.
    var drawerBody = doc.querySelector('[data-vilda-chrome-drawer-body]');
    if (drawerBody && !drawerBody.firstChild) {
      drawerBody.innerHTML = renderDrawerMenuHTML();
      bindDrawerButtons(drawerBody);
    }

    bindHeaderInteractions(header);
    safeCreateIcons(header);
    // Drawer też trzeba zinicjalizować ikonami (Lucide), bo siedzi już w body,
    // a `safeCreateIcons(header)` go nie obejmuje.
    var drawerEl = doc.querySelector('[data-vilda-chrome-drawer]');
    if (drawerEl) safeCreateIcons(drawerEl);
    return true;
  }

  // Binduje kliknięcia przycisków akcji w drawerze (Zapisz/Wczytaj/Pacjenci).
  // Każdy <button data-drawer-btn="SOME_ID"> deleguje kliknięcie do odpowiedniego
  // przycisku w sidebarze — custom-fixes.js ma tam pełną logikę.
  function bindDrawerButtons(container) {
    var btns = container ? container.querySelectorAll('[data-drawer-btn]') : [];
    for (var b = 0; b < btns.length; b++) {
      (function (drawerBtn) {
        drawerBtn.addEventListener('click', function () {
          var targetId = drawerBtn.getAttribute('data-drawer-btn');
          if (!targetId) return;
          // Zamknij drawer najpierw
          var drawerEl = doc.querySelector('[data-vilda-chrome-drawer]');
          if (drawerEl) closeDrawer(drawerEl);
          // Deleguj do odpowiednika w sidebarze (custom-fixes.js jest właścicielem logiki)
          var sidebarBtn = doc.getElementById(targetId);
          if (sidebarBtn && typeof sidebarBtn.click === 'function') {
            sidebarBtn.click();
          }
        });
      })(btns[b]);
    }
  }

  function bindHeaderInteractions(header) {
    if (headerStripBound) return;
    headerStripBound = true;

    // Mobile menu toggle. Drawer jest teraz wyniesiony z headera do <body>
    // (patrz mountHeader), więc szukamy go globalnie po dokumencie.
    var menuBtn = header.querySelector('[data-vilda-chrome-menu-btn]');
    var drawer = doc.querySelector('[data-vilda-chrome-drawer]');
    if (menuBtn && drawer) {
      menuBtn.addEventListener('click', function () {
        openDrawer(drawer);
      });
      var closeEls = drawer.querySelectorAll('[data-vilda-chrome-drawer-close]');
      for (var i = 0; i < closeEls.length; i++) {
        closeEls[i].addEventListener('click', function () { closeDrawer(drawer); });
      }
      doc.addEventListener('keydown', function (e) {
        if (e && e.key === 'Escape' && !drawer.hidden) closeDrawer(drawer);
      });
    }

    // Lista skryptów / styli koniecznych do działania ekranu logowania.
    // Na większości tool-pages (homa-ir, cukrzyca, instrukcja itd.) nie
    // są one statycznie dołączone, więc ładujemy je leniwie dopiero przy
    // próbie zalogowania — bez ruszania 12 plików HTML.
    var AUTH_DEPENDENCIES = [
      { type: 'css',    href: 'vilda_auth_ui.css?v=17',      test: function () { return false; } },
      { type: 'script', href: 'vilda_crypto.js?v=4',         test: function () { return !!global.VildaCrypto; } },
      { type: 'script', href: 'vilda_vault.js?v=11',         test: function () { return !!global.VildaVault; } },
      { type: 'script', href: 'vilda_auth_ui.js?v=53',       test: function () { return !!global.VildaAuthUI; } },
      { type: 'script', href: 'vilda_pro_access.js?v=2',     test: function () { return !!global.VildaProAccess; } }
    ];

    function loadOne(asset) {
      return new Promise(function (resolve, reject) {
        try {
          if (asset.test && asset.test()) { resolve(); return; }
          // Czy już dołączony, ale jeszcze nie wykonany? Sprawdzamy po href.
          var sel = asset.type === 'css'
            ? 'link[rel="stylesheet"][href*="' + asset.href.split('?')[0] + '"]'
            : 'script[src*="' + asset.href.split('?')[0] + '"]';
          var existing = doc.querySelector(sel);
          if (existing) {
            // Już jest w DOM — daj mu chwilę na execute
            if (asset.type === 'script') {
              if (asset.test && asset.test()) { resolve(); return; }
              existing.addEventListener('load', function () { resolve(); }, { once: true });
              existing.addEventListener('error', function () { reject(new Error('load-error')); }, { once: true });
              return;
            }
            resolve();
            return;
          }
          var el;
          if (asset.type === 'css') {
            el = doc.createElement('link');
            el.rel = 'stylesheet';
            el.href = asset.href;
          } else {
            el = doc.createElement('script');
            el.src = asset.href;
            el.async = false; // utrzymaj kolejność
          }
          el.addEventListener('load', function () { resolve(); }, { once: true });
          el.addEventListener('error', function () { reject(new Error('load-error')); }, { once: true });
          doc.head.appendChild(el);
        } catch (e) { reject(e); }
      });
    }

    function ensureAuthLoaded() {
      // Szybka ścieżka — wszystko gotowe.
      if (global.VildaAuthUI && global.VildaVault) return Promise.resolve();
      // Ładujemy sekwencyjnie, bo VildaAuthUI zależy od VildaVault, który zależy od VildaCrypto.
      return AUTH_DEPENDENCIES.reduce(function (chain, dep) {
        return chain.then(function () { return loadOne(dep); });
      }, Promise.resolve());
    }

    // Wspólny handler login/logout — używany przez chip w stripie i przycisk
    // w drawerze (mobile). Dzięki temu mobilny user też może się wylogować/zalogować.
    function openAuthScreen() {
      // VildaAuthUI nie ma metod `show()` ani `setup()` — eksportuje
      // showStartupScreen() i exitGuestMode(). Po dynamicznym załadowaniu
      // skryptu wywoływany jest też auto-boot, który w trybie gościa
      // ukrywa overlay (bo respektuje persisted guest flag). Dlatego dla
      // gościa wymuszamy `exitGuestMode()` (czyści flagę + pokazuje startup),
      // a dla zwykłego niezalogowanego — `showStartupScreen()`.
      var auth = global.VildaAuthUI;
      if (!auth) return false;
      try {
        if (typeof auth.isGuestMode === 'function' && auth.isGuestMode()) {
          if (typeof auth.exitGuestMode === 'function') {
            auth.exitGuestMode();
            return true;
          }
        }
        if (typeof auth.showStartupScreen === 'function') {
          auth.showStartupScreen();
          return true;
        }
        // Backward-compat — gdyby ktoś dodał show()/setup() w przyszłości.
        if (typeof auth.show === 'function') { auth.show(); return true; }
        if (typeof auth.setup === 'function') { auth.setup({ force: true }); return true; }
      } catch (_) { /* noop */ }
      return false;
    }

    function onUserActionClick() {
      var v = global.VildaVault;
      var isUnlocked = v && typeof v.isUnlocked === 'function' && v.isUnlocked();
      if (isUnlocked) {
        if (typeof v.lock === 'function') {
          try { v.lock('manual'); } catch (_) { /* noop */ }
        }
        return;
      }
      // Niezalogowany lub guest — pokaż ekran logowania, doładowując auth-skrypty
      // jeśli nie były statycznie dołączone na tej podstronie.
      ensureAuthLoaded().then(function () {
        // Auth ui dopiero co się załadował i odpalił auto-boot, który jest
        // asynchroniczny. Damy mu chwilę na zakończenie pracy zanim wymusimy
        // pokazanie ekranu startowego (inaczej `exitGuestMode()` może odpalić
        // się przed `boot()` i `boot()` w międzyczasie ukryje overlay).
        var attempts = 0;
        function tryOpen() {
          if (openAuthScreen()) return;
          if (attempts++ >= 15) {
            try { global.location.href = 'index.html'; } catch (_) {}
            return;
          }
          setTimeout(tryOpen, 100);
        }
        tryOpen();
      }).catch(function () {
        try { global.location.href = 'index.html'; } catch (_) {}
      });
    }

    var actionBtn = header.querySelector('#vildaUserAction');
    if (actionBtn) actionBtn.addEventListener('click', onUserActionClick);

    // Klik w avatar (inicjały) lub nazwę konta → zakładka „Konto i bezpieczeństwo"
    // w Ustawieniach. Tylko dla zalogowanego użytkownika (gość/niezalogowany
    // używa przycisku akcji do logowania). Standardowy pattern: avatar → ustawienia.
    function onUserChipNavigate() {
      var v = global.VildaVault;
      var isGuest = global.VildaGuestMode === true;
      var user = (v && typeof v.getCurrentUser === 'function') ? v.getCurrentUser() : null;
      if (user && !isGuest) {
        try { global.location.href = 'ustawienia.html#settings-section-account'; } catch (_) {}
      }
    }
    var userAvatar = header.querySelector('#vildaUserAvatar');
    var userValue = header.querySelector('#vildaUserValue');
    if (userAvatar) userAvatar.addEventListener('click', onUserChipNavigate);
    if (userValue) {
      userValue.addEventListener('click', onUserChipNavigate);
      // a11y — nazwa konta jest focusable (role/tabindex ustawiane w refreshUserChip
      // gdy zalogowany); Enter/Space wywołuje nawigację.
      userValue.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          onUserChipNavigate();
        }
      });
    }

    // Ten sam handler na przycisku w drawerze. Drawer mountuje się raz
    // (lazy w mountHeader), więc bindujemy bezpośrednio.
    var drawerActionBtn = doc.querySelector('[data-vilda-chrome-drawer-user-action]');
    if (drawerActionBtn) {
      drawerActionBtn.addEventListener('click', function () {
        // Po kliknięciu zamykamy drawer — żeby od razu pokazać overlay logowania
        // albo żeby użytkownik widział, że został wylogowany.
        var drawerEl = doc.querySelector('[data-vilda-chrome-drawer]');
        if (drawerEl) closeDrawer(drawerEl);
        onUserActionClick();
      });
    }
  }

  function openDrawer(drawer) {
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    doc.body.classList.add('chrome-drawer-open');
    safeCreateIcons(drawer);
  }

  function closeDrawer(drawer) {
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    doc.body.classList.remove('chrome-drawer-open');
  }

  // ============ USER CHIP ============
  function refreshUserChip() {
    var chip = doc.getElementById('vildaUserChip');
    if (!chip) return;
    var valueEl = doc.getElementById('vildaUserValue');
    var avatarEl = doc.getElementById('vildaUserAvatar');
    var actionBtn = doc.getElementById('vildaUserAction');
    if (!valueEl || !avatarEl || !actionBtn) return;

    var v = global.VildaVault;
    var isGuest = global.VildaGuestMode === true;
    var user = (v && typeof v.getCurrentUser === 'function') ? v.getCurrentUser() : null;

    chip.classList.remove('is-loading');

    var loggedInLabel;
    if (user && !isGuest) {
      chip.classList.remove('is-guest');
      chip.classList.add('is-logged-in');
      loggedInLabel = user.label || 'Użytkownik';
      valueEl.textContent = loggedInLabel;
      avatarEl.textContent = getInitials(loggedInLabel);
      // Avatar + nazwa są klikalne → ustawienia konta (handler w mountHeader).
      valueEl.setAttribute('role', 'link');
      valueEl.setAttribute('tabindex', '0');
      valueEl.setAttribute('title', 'Przejdź do ustawień konta');
      actionBtn.title = 'Wyloguj się';
      actionBtn.setAttribute('aria-label', 'Wyloguj się');
      // Inline SVG (log-out) — niezależne od Lucide.
      actionBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>';
    } else {
      chip.classList.remove('is-logged-in');
      chip.classList.add('is-guest');
      valueEl.textContent = isGuest ? 'Tryb gościa' : 'Niezalogowany';
      // Niezalogowany/gość — nazwa nie jest klikalna (brak konta do ustawień).
      valueEl.removeAttribute('role');
      valueEl.removeAttribute('tabindex');
      valueEl.removeAttribute('title');
      // Inline SVG (user-round) — niezależne od Lucide.
      avatarEl.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5"></circle><path d="M20 21a8 8 0 0 0-16 0"></path></svg>';
      actionBtn.title = 'Zaloguj się';
      actionBtn.setAttribute('aria-label', 'Zaloguj się');
      // Inline SVG (log-in) — niezależne od Lucide.
      actionBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>';
    }
    safeCreateIcons(chip);

    // Synchronizujemy też sekcję "Konto" w drawerze (mobile menu).
    refreshDrawerAccount(user, isGuest, loggedInLabel);

    // Elementy auth-only (np. "Pacjenci") — widoczne tylko dla zalogowanych.
    var loggedIn = !!(user && !isGuest);
    refreshAuthOnlyItems(loggedIn);
  }

  // Pokazuje / ukrywa elementy z flagą data-auth-only="true" w sidebarze
  // i drawerze w zależności od stanu zalogowania.
  function refreshAuthOnlyItems(loggedIn) {
    var items = doc.querySelectorAll('[data-auth-only="true"]');
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      el.style.display = loggedIn ? '' : 'none';
    }
  }

  // Aktualizuje sekcję konta w drawerze — wyświetla aktualnie zalogowanego
  // użytkownika i poprawny label przycisku (Zaloguj/Wyloguj). Korzysta z inline
  // SVG niezależnie od Lucide, żeby ikony zawsze były widoczne.
  function refreshDrawerAccount(user, isGuest, loggedInLabel) {
    var avatar = doc.querySelector('[data-vilda-chrome-drawer-avatar]');
    var valueEl = doc.querySelector('[data-vilda-chrome-drawer-user-value]');
    var iconEl = doc.querySelector('[data-vilda-chrome-drawer-action-icon]');
    var labelEl = doc.querySelector('[data-vilda-chrome-drawer-action-label]');
    if (!avatar || !valueEl || !iconEl || !labelEl) return;

    if (user && !isGuest) {
      avatar.textContent = getInitials(loggedInLabel || user.label || 'U');
      avatar.classList.add('is-logged-in');
      avatar.classList.remove('is-guest');
      valueEl.textContent = loggedInLabel || user.label || 'Użytkownik';
      // log-out icon
      iconEl.outerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-vilda-chrome-drawer-action-icon><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>';
      labelEl.textContent = 'Wyloguj się';
    } else {
      avatar.textContent = '👤';
      avatar.classList.remove('is-logged-in');
      avatar.classList.add('is-guest');
      valueEl.textContent = isGuest ? 'Tryb gościa' : 'Niezalogowany';
      // log-in icon
      iconEl.outerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-vilda-chrome-drawer-action-icon><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>';
      labelEl.textContent = 'Zaloguj się';
    }
  }

  // ============ PATIENT CHIP ============
  function getPatientFromForm() {
    // Strategie czytania kontekstu pacjenta — bierzemy pierwsze pole, które
    // ma uzupełnioną wartość. Pola formularza istnieją tylko na index.html
    // i docpro.html, ale ich wartości są synchronizowane z aliasami.
    var tryFields = ['name', 'fullName', 'advName', 'basicGrowthName'];
    var name = '';
    for (var i = 0; i < tryFields.length; i++) {
      var el = doc.getElementById(tryFields[i]);
      if (el && el.value) {
        name = String(el.value).trim();
        if (name) break;
      }
    }
    if (!name) return null;

    var ageEl = doc.getElementById('age');
    var ageMonthsEl = doc.getElementById('ageMonths');
    var sexEl = doc.getElementById('sex');

    var age = ageEl && ageEl.value ? parseInt(ageEl.value, 10) : null;
    var ageMonths = ageMonthsEl && ageMonthsEl.value ? parseInt(ageMonthsEl.value, 10) : null;
    var sex = sexEl && sexEl.value ? String(sexEl.value) : '';

    return {
      name: name,
      age: isFinite(age) ? age : null,
      ageMonths: isFinite(ageMonths) ? ageMonths : null,
      sex: sex || null
    };
  }

  function formatAge(age, ageMonths) {
    if (age == null && !ageMonths) return '';
    if (age != null && age >= 1) {
      if (ageMonths && ageMonths > 0) return age + ' l. ' + ageMonths + ' mies.';
      return age + ' l.';
    }
    if (age === 0 && ageMonths && ageMonths > 0) return ageMonths + ' mies.';
    if (age != null) return age + ' l.';
    return '';
  }

  function refreshPatientChip() {
    var chip = doc.getElementById('vildaPatientChip');
    if (!chip) return;
    var valueEl = doc.getElementById('vildaPatientValue');
    if (!valueEl) return;

    var labelEl = chip.querySelector('.chip-label');
    if (labelEl) labelEl.style.display = (global.VildaGuestMode === true) ? 'none' : '';

    var drawerValueEl = doc.querySelector('[data-vilda-chrome-drawer-patient-value]');

    // VildaSession.getPatient() próbuje najpierw pól formularza, a gdy ich brak
    // (strony bez app.js) — czyta z VildaPersistence.sharedUserData (localStorage).
    var session = global.VildaSession;
    var p = (session && typeof session.getPatient === 'function')
      ? session.getPatient()
      : getPatientFromForm();
    if (!p || !p.name) {
      chip.classList.add('is-empty');
      chip.classList.remove('has-patient');
      valueEl.textContent = 'Brak';
      if (drawerValueEl) drawerValueEl.textContent = '—';
      lastPatientSnapshot = '';
      return;
    }

    chip.classList.remove('is-empty');
    chip.classList.add('has-patient');

    var ageStr = formatAge(p.age, p.ageMonths);
    var sexStr = p.sex === 'M' ? '♂' : (p.sex === 'F' ? '♀' : '');

    var bits = [];
    bits.push(p.name);
    if (ageStr) bits.push(ageStr);
    if (sexStr) bits.push(sexStr);
    var formatted = bits.join(' · ');
    valueEl.textContent = formatted;
    if (drawerValueEl) drawerValueEl.textContent = formatted;
    lastPatientSnapshot = bits.join('|');
  }

  // ============ SYNC BUTTON ============

  var syncResetTimer = null;
  var SYNC_ENABLED_KEY = 'vilda-sync-enabled-v1';

  function refreshSyncBtn() {
    var btn = doc.getElementById('vildaSyncBtn');
    if (!btn) return;
    var enabled = false;
    try { enabled = !!(global.localStorage && global.localStorage.getItem(SYNC_ENABLED_KEY) === 'true'); }
    catch (_) {}
    if (enabled) {
      btn.classList.add('is-enabled');
    } else {
      btn.classList.remove('is-enabled');
      btn.removeAttribute('data-sync-state');
    }
  }

  function bindSyncStatusListener() {
    doc.addEventListener('vilda:sync-status-changed', function (e) {
      var btn = doc.getElementById('vildaSyncBtn');
      if (!btn) return;
      var detail = (e && e.detail) || {};
      var state  = detail.state || 'idle';

      // gdy sync wyłączony: ukryj przycisk
      if (state === 'disabled') {
        btn.classList.remove('is-enabled');
        btn.removeAttribute('data-sync-state');
        return;
      }
      // gdy włączony: upewnij się, że jest widoczny
      btn.classList.add('is-enabled');
      btn.setAttribute('data-sync-state', state);

      // Po ok/error — wróć do idle po 3 s
      if (state === 'ok' || state === 'error') {
        clearTimeout(syncResetTimer);
        syncResetTimer = setTimeout(function () {
          if (btn) btn.removeAttribute('data-sync-state');
        }, 3000);
      }
    });

    // Odczytaj stan przy starcie (sync mógł być włączony w poprzedniej sesji)
    refreshSyncBtn();
  }

  // ============ EVENTY ============
  function bindAuthEvents() {
    var vaultListenersBound = false;

    function tryBindVault() {
      if (vaultListenersBound) return true;
      var v = global.VildaVault;
      if (!v) return false;
      vaultListenersBound = true;
      if (typeof v.onUnlock       === 'function') v.onUnlock(refreshUserChip);
      if (typeof v.onLock         === 'function') v.onLock(refreshUserChip);
      if (typeof v.onPatientSaved === 'function') v.onPatientSaved(refreshPatientChip);
      refreshUserChip();
      return true;
    }

    doc.addEventListener('vilda:guest-mode-changed', refreshUserChip);

    // VildaSession.bridge uruchamia lazy-load auth na stronach bez VildaVault
    // i odpala 'vilda:auth-loaded' gdy skrypty się załadują.
    // Dzięki temu chip od razu pokazuje właściwy stan bez 10-sekundowego pollingu.
    doc.addEventListener('vilda:auth-loaded',      function () {
      tryBindVault();
      refreshUserChip();
      // vilda_pro_access.js jest teraz załadowany — odśwież badge PRO.
      try {
        if (global.VildaAuthUI && typeof global.VildaAuthUI.updateProBadge === 'function') {
          global.VildaAuthUI.updateProBadge();
        }
      } catch (_) {}
    });
    doc.addEventListener('vilda:session-changed',  function () { refreshUserChip(); refreshPatientChip(); });

    // Próba natychmiastowa — VildaVault może być już gotowy (statycznie załadowany).
    if (!tryBindVault()) {
      // VildaVault jeszcze nie załadowany — polling jako safety-net (max 10 s).
      // Na "lekkich" stronach vilda_session_bridge.js lazy-ładuje vault, więc
      // zdarzenie 'vilda:auth-loaded' powinno wypalić zanim polling się skończy.
      var attempts = 0;
      var vaultTimer = setInterval(function () {
        if (tryBindVault() || ++attempts >= 100) clearInterval(vaultTimer);
      }, 100);
    }
  }

  function bindPatientWatcher() {
    if (patientWatcherBound) return;
    patientWatcherBound = true;

    // Bezpośrednie nasłuchy na polach formularza
    var fields = ['name', 'age', 'ageMonths', 'sex', 'fullName', 'advName', 'basicGrowthName'];
    fields.forEach(function (id) {
      var el = doc.getElementById(id);
      if (el) {
        el.addEventListener('input', refreshPatientChip);
        el.addEventListener('change', refreshPatientChip);
      }
    });

    refreshPatientChip();
    setTimeout(refreshPatientChip, 300);
    setTimeout(refreshPatientChip, 1500);

    // Periodyczny watcher — pola mogą być wypełniane asynchronicznie przez
    // moduł importu pliku (vilda_data_import_export.js), który nie zawsze
    // emituje 'input' (używa setFieldValueSilently).
    if (typeof global.setInterval === 'function') {
      global.setInterval(function () {
        var p = getPatientFromForm();
        var snapshot = p ? [p.name, p.age, p.ageMonths, p.sex].join('|') : '';
        if (snapshot !== lastPatientSnapshot) {
          refreshPatientChip();
        }
      }, 1500);
    }
  }

  // ============ PRZYCISKI DANYCH (Zapisz / Wczytaj) ============
  // Bazowa obsługa dla wszystkich stron. Na stronach z custom-fixes.js
  // handler jest dezaktywowany przez ustawienie btn._cfBound = true.

  // Własny mini-tooltip vilda_chrome — niezależny od app.js.
  // Wyświetla dymek obok przycisku i chowa go po 3 s lub przy kliknięciu.
  var _chromeTip = null;
  function showChromeTip(target, msg) {
    // Preferuj app.js showTooltip jeśli dostępny (spójna stylizacja na stronach głównych).
    if (typeof global.showTooltip === 'function') {
      try { global.showTooltip(target, msg); return; } catch (_) {}
    }
    // Własna implementacja — działa na każdej stronie.
    try {
      if (_chromeTip) {
        var _old = _chromeTip;
        _old.classList.remove('vilda-tip--in');
        global.setTimeout(function () { if (_old.parentNode) _old.remove(); }, 200);
        _chromeTip = null;
      }
      var tip = doc.createElement('div');
      tip.className = 'vilda-tip';
      tip.textContent = msg;
      doc.body.appendChild(tip);
      _chromeTip = tip;

      // Pozycjonowanie: na prawo od przycisku, lub na lewo jeśli brakuje miejsca.
      var r = target.getBoundingClientRect();
      var tw = tip.offsetWidth || 220;
      var th = tip.offsetHeight || 40;
      var left = r.right + 8;
      var top = r.top + (r.height - th) / 2;
      if (left + tw > global.innerWidth - 8) left = r.left - tw - 8;
      if (top < 4) top = 4;
      if (top + th > global.innerHeight - 4) top = global.innerHeight - th - 4;
      tip.style.left = Math.round(left) + 'px';
      tip.style.top  = Math.round(top)  + 'px';

      // Animacja wejścia — wymaga osobnego frame'a po appendzie,
      // żeby transition na opacity/transform był widoczny.
      global.requestAnimationFrame(function () {
        tip.classList.add('vilda-tip--in');
      });

      var hide = function () {
        if (_chromeTip === tip) {
          tip.classList.remove('vilda-tip--in');
          global.setTimeout(function () {
            if (tip.parentNode) tip.remove();
            if (_chromeTip === tip) _chromeTip = null;
          }, 200);
        }
        doc.removeEventListener('click', hide, true);
      };
      global.setTimeout(hide, 3000);
      global.setTimeout(function () { doc.addEventListener('click', hide, true); }, 0);
      return;
    } catch (_) {}
    // Ostateczny fallback.
    if (typeof global.alert === 'function') global.alert(msg);
  }

  function bindSidebarDataButtons() {
    var saveBtn = doc.getElementById('saveDataBtnSidebar');

    if (saveBtn) {
      saveBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (saveBtn._cfBound) return; // custom-fixes.js przejął obsługę
        var v = global.VildaVault;
        var unlocked = !!(v && typeof v.isUnlocked === 'function' && v.isUnlocked());
        showChromeTip(saveBtn, unlocked
          ? 'Zapisywanie danych jest dostępne na stronie głównej pacjenta.'
          : 'Zapisywanie danych jest zarezerwowane dla zalogowanych użytkowników.');
      });
    }

    // Przycisk „Pacjenci" — fallback na stronach bez custom-fixes.js.
    // Na stronach z formularzem (applyLoadedData dostępne) przekazuje callback wczytujący.
    // Na pozostałych stronach — tryb podglądu bez wczytywania.
    var patientsBtn = doc.getElementById('patientsListBtnSidebar');
    if (patientsBtn) {
      patientsBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (patientsBtn._cfBound) return;
        var v = global.VildaVault;
        if (!(v && typeof v.isUnlocked === 'function' && v.isUnlocked())) {
          showChromeTip(patientsBtn, 'Zaloguj się, aby przeglądać bazę pacjentów.');
          return;
        }
        var authUI = global.VildaAuthUI;
        if (!authUI || typeof authUI.showPatientsList !== 'function') {
          showChromeTip(patientsBtn, 'Moduł pacjentów niedostępny — odśwież stronę.');
          return;
        }
        // Na stronach z formularzem przekaż callback wczytujący dane.
        var canLoad = typeof global.applyLoadedData === 'function';
        authUI.showPatientsList(canLoad ? function (payload) {
          if (payload) {
            try { global.applyLoadedData(payload); } catch (_) {}
          }
          var vc = global.VildaChrome;
          if (vc && typeof vc.refreshPatientChip === 'function') vc.refreshPatientChip();
        } : null);
      });
    }
  }

  // ============ BANER ZGODY (ANALITYKA) ============
  // Jeden egzemplarz banera wstrzykiwany przez vilda_chrome.js na wszystkich stronach.
  // Obsługuje Google Consent Mode v2 i zapis decyzji przez VildaPersistence.
  function initConsentBanner() {
    if (doc.getElementById('consent-banner')) return; // baner już w DOM (np. stara strona)

    // --- wstrzyknij HTML ---
    var bannerEl = doc.createElement('div');
    bannerEl.id = 'consent-banner';
    bannerEl.className = 'cookie-banner';
    bannerEl.innerHTML =
      '<p><strong>Vilda Clinic</strong> korzysta z Google Analytics (GA4) do tworzenia anonimowych statystyk odwiedzin.' +
      ' Adres IP jest anonimizowany. Zgoda jest dobrowolna i możesz ją wycofać w dowolnym momencie w' +
      ' <a href="ustawienia.html">Ustawieniach</a>.' +
      ' Więcej informacji w <a href="polityka-prywatnosci.html">Polityce prywatności</a>.</p>' +
      '<div class="cookie-buttons">' +
      '<button id="consent-accept">Akceptuję analitykę</button>' +
      '<button id="consent-decline">Nie zgadzam się</button>' +
      '</div>';
    doc.body.appendChild(bannerEl);

    // --- odczyt / zapis zgody przez VildaPersistence ---
    function readConsent() {
      try {
        var p = global.VildaPersistence;
        return p && typeof p.readPreferenceRaw === 'function'
          ? p.readPreferenceRaw('ANALYTICS_CONSENT', null)
          : null;
      } catch (_) { return null; }
    }
    function writeConsent(value) {
      try {
        var p = global.VildaPersistence;
        if (p && typeof p.writePreferenceRaw === 'function') {
          p.writePreferenceRaw('ANALYTICS_CONSENT', value, { force: true });
        }
      } catch (_) {}
    }

    // --- Consent Mode v2 + dynamiczne ładowanie GA4 ---
    function loadGA() {
      global.dataLayer = global.dataLayer || [];
      function gtag() { global.dataLayer.push(arguments); }
      gtag('consent', 'update', { analytics_storage: 'granted' });
      var s = doc.createElement('script');
      s.src = 'https://www.googletagmanager.com/gtag/js?id=G-EZZTNV8W07';
      s.async = true;
      doc.head.appendChild(s);
      gtag('js', new Date());
      gtag('config', 'G-EZZTNV8W07', { anonymize_ip: true });
    }
    function denyGA() {
      global.dataLayer = global.dataLayer || [];
      function gtag() { global.dataLayer.push(arguments); }
      gtag('consent', 'update', { analytics_storage: 'denied' });
    }

    // --- podjęta wcześniej decyzja ---
    var consent = readConsent();
    if (!consent) {
      bannerEl.style.display = 'block';
    } else if (consent === 'granted') {
      loadGA();
    } else {
      denyGA();
    }

    // --- przyciski ---
    doc.getElementById('consent-accept').addEventListener('click', function () {
      writeConsent('granted');
      bannerEl.style.display = 'none';
      loadGA();
    });
    doc.getElementById('consent-decline').addEventListener('click', function () {
      writeConsent('denied');
      bannerEl.style.display = 'none';
      denyGA();
    });
  }

  // ============ INIT ============
  function init() {
    if (booted) return;
    booted = true;

    mountHeader();
    mountSidebar();
    bindSidebarDataButtons();
    bindAuthEvents();
    bindPatientWatcher();
    refreshUserChip();
    refreshPatientChip();
    bindSyncStatusListener();
    safeCreateIcons();
    scheduleIconRetry();
    initConsentBanner();
  }

  function boot() {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // ============ API ============
  global.VildaChrome = {
    __vildaChrome: true,
    VERSION: VERSION,
    init: init,
    refreshUserChip: refreshUserChip,
    refreshPatientChip: refreshPatientChip,
    refreshSyncBtn: refreshSyncBtn,
    highlightActiveLink: function () { highlightActiveLink(); },
    showTip: showChromeTip,
    MENU: MENU
  };

  boot();
})(typeof window !== 'undefined' ? window : null);

// ============================================================
// === Globalna funkcja scrollowania uwzględniająca sticky header ===
// ============================================================
// scrollIntoView({block:'start'}) nie respektuje scroll-padding-top w Safari
// i starszych wersjach Chrome. Na desktopie (≥992 px) nagłówek jest sticky
// (position: sticky; top: 0) i pokrywa górę viewport, przez co element
// wjeżdża pod nagłówek. window.vildaScrollTo() oblicza offset ręcznie
// i używa window.scrollTo(), co działa poprawnie we wszystkich przeglądarkach.
//
// Użycie:
//   window.vildaScrollTo(el)
//   window.vildaScrollTo(el, { behavior: 'smooth', block: 'start' })
//   window.vildaScrollTo(el, { behavior: 'smooth', block: 'start' }, 150)
//
// Parametry:
//   el     — element DOM do przewinięcia
//   opts   — { behavior: 'smooth'|'auto', block: 'start'|'center'|... }
//   delay  — opóźnienie w ms (domyślnie 100 ms); użyj 150+ gdy przed
//            scrollem otwierasz akordeon (<details open>) i trzeba dać
//            czas na przeliczenie layoutu
(function (global) {
  'use strict';
  global.vildaScrollTo = function (el, opts, delay) {
    if (!el) return;
    var ms       = (typeof delay === 'number') ? delay : 100;
    var behavior = (opts && opts.behavior) ? opts.behavior : 'smooth';
    var block    = (opts && opts.block)    ? opts.block    : 'start';

    setTimeout(function () {
      try {
        if (global.innerWidth >= 992 && block === 'start') {
          // Desktop + sticky header: ręczny offset zamiast scrollIntoView,
          // bo scrollIntoView ignoruje scroll-padding-top w Safari
          var header  = document.querySelector('header');
          var headerH = header ? header.getBoundingClientRect().height : 64;
          var gap     = 12; // dodatkowy margines wizualny pod nagłówkiem
          var rect    = el.getBoundingClientRect();
          var top     = Math.round(rect.top + global.pageYOffset - headerH - gap);
          global.scrollTo({ top: top, behavior: behavior });
        } else {
          // Tablet, mobile, lub block != 'start': natywny scrollIntoView
          el.scrollIntoView({ behavior: behavior, block: block });
        }
      } catch (e) { /* ignoruj błędy scrollowania */ }
    }, ms);
  };
})(typeof window !== 'undefined' ? window : {});
