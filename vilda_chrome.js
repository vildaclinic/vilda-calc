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
          // B1.8: nowy przycisk dodający notatkę kotwiczoną do wieku aktualnej wizyty.
          // Handler w custom-fixes.js — czyta age+height+weight z głównego formularza
          // i wywołuje VildaAuthUI.showPatientNoteEditor z suggestLinkedAge=totalMo.
          // Wymaga zalogowania + wczytanego pacjenta + wpisanego wieku.
          id: 'addVisitNoteBtnSidebar',
          label: 'Dodaj notatkę do wizyty',
          icon: 'sticky-note',
          role: 'button',
          authOnly: true,
          ariaDisabled: true,
          tip: 'Wczytaj pacjenta i wpisz wiek + wzrost/wagę, aby dodać notatkę powiązaną z tą wizytą.'
        },
        {
          // Revert P6.4: usunięto item „Nowy pomiar" z sidebar — duplikował
          // naturalny flow „Wczytaj pacjenta → zmień wartości w formularzu →
          // Zapisz dane". Pozostaje hero pill „+ Nowy pomiar" w karcie
          // pacjenta (showPatientCard), który ma osobny sens UX (lekarz w
          // karcie chce szybko dodać pomiar bez nawigacji do kalkulatora).
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
        { href: 'notatki.html', label: 'Notatki', icon: 'file-text', cls: 'pro-link' },
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

  // ============ VIEW TRANSITIONS (Opcja 1, Kroki 2–3) ============
  // pageswap odpala się na WYCHODZĄCEJ stronie, pagereveal na WCHODZĄCEJ — tuż przed
  // pierwszym malowaniem. Ten plik ładuje się synchronicznie w <head>, więc listenery
  // zdążą się zarejestrować.
  //
  // Krok 2 (most do treści): gdy trwa cross-document View Transition, „zdjęcie" nowej
  // strony nie może być puste — .main-content bywa jeszcze ukryte przez `js-loading`.
  // Odsłaniamy je na czas zdjęcia; przy aktywnym auth-gate (ekran logowania) pomijamy
  // animację. Bez aktywnej VT (np. pierwsze wejście) nic nie zmieniamy.
  //
  // Krok 3 (kierunek): handler swipe zapisuje kierunek do sessionStorage tuż przed
  // nawigacją; tu odczytujemy go (z guardem świeżości) i dodajemy typ
  // `vilda-forward`/`vilda-back` do viewTransition.types, co w CSS wybiera slide w
  // odpowiednią stronę. Nawigacja BEZ flagi (klik w menu, wstecz) → domyślny cross-fade.
  var VT_DIR_KEY = 'vilda-vt-dir';
  function readVtDir() {
    try {
      var raw = global.sessionStorage && global.sessionStorage.getItem(VT_DIR_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || (o.d !== 'forward' && o.d !== 'back')) return null;
      if (typeof o.t !== 'number' || (Date.now() - o.t) > 4000) return null; // przeterminowane
      return o.d === 'forward' ? 'vilda-forward' : 'vilda-back';
    } catch (_) { return null; }
  }
  function clearVtDir() {
    try { if (global.sessionStorage) global.sessionStorage.removeItem(VT_DIR_KEY); } catch (_) {}
  }
  function addVtType(vt, type) {
    try {
      if (type && vt && vt.types && typeof vt.types.add === 'function') vt.types.add(type);
    } catch (_) {}
  }

  try {
    if (global.addEventListener) {
      // Strona wychodząca — oznacz typ na jej „zdjęciu".
      // Krok 4: gdy w chwili nawigacji otwarta jest nakładka/modal/drawer
      // (lub aktywny auth-gate), pomijamy animację — nie chcemy animować strony
      // z otwartą warstwą w stronę, która jej nie ma. swipeBlockedByOverlay()
      // jest wspólnym źródłem tych warunków (ta sama lista co dla gestu swipe).
      global.addEventListener('pageswap', function (e) {
        try {
          if (!e || !e.viewTransition) return;
          if (swipeBlockedByOverlay()) {
            if (typeof e.viewTransition.skipTransition === 'function') e.viewTransition.skipTransition();
            return;
          }
          addVtType(e.viewTransition, readVtDir());   // bez czyszczenia — pagereveal sprząta
        } catch (_) { /* noop */ }
      });
      // Strona wchodząca — most do treści + typ kierunku, a na końcu sprzątanie flagi.
      global.addEventListener('pagereveal', function (e) {
        try {
          var dirType = readVtDir();                  // odczyt zanim wyczyścimy
          if (!e || !e.viewTransition) { clearVtDir(); return; } // brak VT → tylko sprzątanie
          // Krok 4: auth-gate (ekran logowania) lub jakakolwiek otwarta nakładka →
          // bez animacji. (Na świeżo wchodzącej stronie realnie wystąpi tu głównie
          // auth-gate; pozostałe warstwy są jeszcze nieutworzone.)
          if (swipeBlockedByOverlay()) {
            if (typeof e.viewTransition.skipTransition === 'function') e.viewTransition.skipTransition();
            clearVtDir();
            return;
          }
          if (doc.body && doc.body.classList) doc.body.classList.remove('js-loading');
          addVtType(e.viewTransition, dirType);
          clearVtDir();
        } catch (_) { clearVtDir(); }
      });
    }
  } catch (_) { /* noop */ }

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
      // R4-fix flash (sync chip): render czyta synchronicznie localStorage sync-enabled
      // + sessionStorage cloud-only marker → chip mountuje się od razu w prawidłowym
      // stanie. Bez tego flash przy każdej nawigacji (jak reminders chip).
      _renderSyncBtnHtml(),
      // R4 — przycisk reminderów (notatki klinicznne pacjentów due dziś/overdue).
      // Identyczny pattern wizualny co chrome-sync-btn (30x30, lucide outline SVG,
      // border-radius 8px). Badge counter w prawym górnym rogu (czerwony=overdue,
      // pomarańczowy=today). Hidden gdy count=0 (data-count="0"). Klik → modal force.
      // R4-fix flash: stan initial czytany SYNCHRONICZNIE z sessionStorage cache
      // (vilda-reminders-count-v1) — gdy user nawigował z innej podstrony i miał
      // remindery, chip pojawia się od razu w prawidłowym stanie. Bez tego cache'u
      // chip "flashował" — najpierw hidden, potem po async refresh visible →
      // pozostałe chipy w topbar przesuwały się przy każdej nawigacji.
      _renderRemindersBtnHtml(),
      '    <div class="chrome-chip chrome-patient-chip is-empty" id="vildaPatientChip" aria-live="polite" role="button" tabindex="0" aria-haspopup="dialog" aria-expanded="false" title="Status zapisu — kliknij, aby zobaczyć legendę">',
      '      <span class="chip-icon" data-lucide="user-round" aria-hidden="true"></span>',
      '      <span class="chip-content">',
      '        <span class="chip-label">Pacjent</span>',
      '        <span class="chip-value" id="vildaPatientValue">—</span>',
      '      </span>',
      '      <span class="chrome-chip-caret" aria-hidden="true">▾</span>',
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
    // Patient chip → toggle popover legendy statusu zapisu.
    var patientChipEl = header.querySelector('#vildaPatientChip');
    if (patientChipEl) {
      patientChipEl.addEventListener('click', function (e) {
        e.stopPropagation(); // żeby document-click (close) nie odpalił od razu
        toggleSavePopover();
      });
      patientChipEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          toggleSavePopover();
        }
      });
    }
    // Klik poza popoverem → zamknij.
    doc.addEventListener('click', function (e) {
      if (!_savePopoverOpen) return;
      if (_savePopoverEl && _savePopoverEl.contains(e.target)) return;
      var pc = doc.getElementById('vildaPatientChip');
      if (pc && pc.contains(e.target)) return;
      closeSavePopover();
    });
    // Esc → zamknij.
    doc.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && _savePopoverOpen) closeSavePopover();
    });
    // Reposition przy scroll/resize.
    global.addEventListener('resize', function () { if (_savePopoverOpen) positionSavePopover(); });
    global.addEventListener('scroll', function () { if (_savePopoverOpen) positionSavePopover(); }, true);

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
    // Anuluj ewentualne odroczone ukrycie z poprzedniego zamykania (szybkie toggle).
    if (drawer.__vildaCloseTimer) { clearTimeout(drawer.__vildaCloseTimer); drawer.__vildaCloseTimer = null; }
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    // Wymuś przeliczenie układu w stanie zamkniętym (panel poza ekranem) ZANIM
    // dodamy klasę otwarcia — inaczej przeglądarka „połknie" przejście i panel
    // pojawi się skokowo zamiast wjechać.
    try { void drawer.offsetWidth; } catch (_) {}
    doc.body.classList.add('chrome-drawer-open');
    safeCreateIcons(drawer);
  }

  function closeDrawer(drawer) {
    drawer.setAttribute('aria-hidden', 'true');
    doc.body.classList.remove('chrome-drawer-open');
    // Element chowamy (display:none) dopiero PO animacji zamykania, żeby panel
    // zdążył wyjechać, a tło się wygasić. Przy redukcji ruchu — natychmiast.
    if (drawer.__vildaCloseTimer) { clearTimeout(drawer.__vildaCloseTimer); }
    var reduce = false;
    try { reduce = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) {}
    drawer.__vildaCloseTimer = setTimeout(function () {
      drawer.__vildaCloseTimer = null;
      // Tylko jeśli w międzyczasie nie otwarto ponownie.
      if (!doc.body.classList.contains('chrome-drawer-open')) drawer.hidden = true;
    }, reduce ? 0 : 320);
  }

  // ============ POPOVER LEGENDA STATUSU ZAPISU ============
  // Otwierany po kliknięciu w patient chip. Hero (aktualny stan + szczegóły)
  // + legenda pozostałych stanów. Czyta stan z window.VildaSaveStatusIndicator.
  var SAVE_STATE_INFO = {
    saved:       { c1:'#15803d', c2:'#22c55e', name:'Zapisane',          desc:'wszystko w karcie pacjenta jest aktualne',
                   heroBg:'linear-gradient(135deg, rgba(34,197,94,0.14), rgba(21,128,61,0.05))',
                   icon:'<polyline points="20 6 9 17 4 12"/>' },
    dirty:       { c1:'#b45309', c2:'#f59e0b', name:'Niezapisane zmiany', desc:'kliknij „Zapisz dane", aby zapisać snapshot',
                   heroBg:'linear-gradient(135deg, rgba(245,158,11,0.16), rgba(180,83,9,0.05))',
                   icon:'<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>' },
    new_patient: { c1:'#6d28d9', c2:'#a855f7', name:'Nowy pacjent',       desc:'brak snapshotu — zapisz, aby utworzyć kartę',
                   heroBg:'linear-gradient(135deg, rgba(168,85,247,0.16), rgba(109,40,217,0.05))',
                   icon:'<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>' },
    saving:      { c1:'#1d4ed8', c2:'#3b82f6', name:'Zapisywanie…',       desc:'trwa zapis snapshotu do vault',
                   heroBg:'linear-gradient(135deg, rgba(59,130,246,0.16), rgba(29,78,216,0.05))',
                   icon:'<path d="M21 12a9 9 0 1 1-6.219-8.56"/>' },
    error:       { c1:'#b91c1c', c2:'#ef4444', name:'Błąd zapisu',        desc:'spróbuj ponownie — kliknij „Zapisz dane"',
                   heroBg:'linear-gradient(135deg, rgba(239,68,68,0.16), rgba(185,28,28,0.05))',
                   icon:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' },
    hidden:      { c1:'#5f7274', c2:'#9eb8bb', name:'Brak danych pacjenta', desc:'wpisz dane pacjenta, aby rozpocząć',
                   heroBg:'linear-gradient(135deg, rgba(158,184,187,0.18), rgba(95,114,116,0.05))',
                   icon:'<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>' }
  };
  var SAVE_STATE_ORDER = ['saved', 'dirty', 'new_patient', 'saving', 'error'];

  var _savePopoverEl = null;
  var _savePopoverOpen = false;

  function escHtmlPop(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function buildSaveStatusPopoverHtml() {
    var SSI = global.VildaSaveStatusIndicator;
    var state = (SSI && typeof SSI.getState === 'function') ? SSI.getState() : 'hidden';
    if (!SAVE_STATE_INFO[state]) state = 'hidden';
    var cur = SAVE_STATE_INFO[state];

    // Hero subtitle — dla SAVED pokazuj snapshot/czas, dla reszty opis stanu.
    var sub = cur.desc;
    if (SSI && state === 'saved') {
      var iso = (typeof SSI.getLastSavedAtISO === 'function') ? SSI.getLastSavedAtISO() : null;
      var cnt = (typeof SSI.getLastSnapshotCount === 'function') ? SSI.getLastSnapshotCount() : null;
      var bits = [];
      if (cnt) bits.push('Snapshot #' + cnt);
      if (iso && typeof SSI._relativeTime === 'function') bits.push(SSI._relativeTime(iso));
      sub = bits.length ? bits.join(' · ') : 'Dane są aktualne';
    }

    var heroIc = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + cur.icon + '</svg>';
    var hero = '' +
      '<div class="vsp-hero" style="background:' + cur.heroBg + '">' +
        '<span class="vsp-hero-ic" style="background:linear-gradient(135deg,' + cur.c1 + ',' + cur.c2 + ')">' + heroIc + '</span>' +
        '<span class="vsp-hero-txt">' +
          '<span class="vsp-hero-title" style="color:' + cur.c1 + '">' + escHtmlPop(cur.name) + '</span>' +
          '<span class="vsp-hero-sub">' + escHtmlPop(sub) + '</span>' +
        '</span>' +
      '</div>';

    var legend = '<div class="vsp-legend-head">Pozostałe stany</div><div class="vsp-legend">';
    for (var i = 0; i < SAVE_STATE_ORDER.length; i++) {
      var k = SAVE_STATE_ORDER[i];
      if (k === state) continue;
      var info = SAVE_STATE_INFO[k];
      legend += '<div class="vsp-row">' +
        '<span class="vsp-dot" style="background:linear-gradient(135deg,' + info.c1 + ',' + info.c2 + ')"></span>' +
        '<span class="vsp-name">' + escHtmlPop(info.name) + '</span>' +
      '</div>';
    }
    legend += '</div>';

    return hero + legend;
  }

  function ensureSavePopover() {
    if (_savePopoverEl && _savePopoverEl.parentNode) return;
    _savePopoverEl = doc.createElement('div');
    _savePopoverEl.className = 'vilda-save-popover';
    _savePopoverEl.setAttribute('role', 'dialog');
    _savePopoverEl.setAttribute('aria-label', 'Status zapisu danych pacjenta');
    _savePopoverEl.hidden = true;
    doc.body.appendChild(_savePopoverEl);
  }

  function positionSavePopover() {
    var chip = doc.getElementById('vildaPatientChip');
    if (!chip || !_savePopoverEl) return;
    var rect = chip.getBoundingClientRect();
    var vw = global.innerWidth || (doc.documentElement && doc.documentElement.clientWidth) || 360;
    var popW = _savePopoverEl.offsetWidth || 290;
    var top = rect.bottom + 8;
    var right = vw - rect.right;
    if (right < 8) right = 8;
    // Klamp lewej krawędzi
    if (vw - right - popW < 8) right = Math.max(8, vw - popW - 8);
    _savePopoverEl.style.top = top + 'px';
    _savePopoverEl.style.right = right + 'px';
    _savePopoverEl.style.left = 'auto';
  }

  function openSavePopover() {
    ensureSavePopover();
    if (!_savePopoverEl) return;
    _savePopoverEl.innerHTML = buildSaveStatusPopoverHtml();
    _savePopoverEl.hidden = false;
    positionSavePopover();
    if (typeof global.requestAnimationFrame === 'function') {
      global.requestAnimationFrame(function () {
        if (_savePopoverEl) _savePopoverEl.classList.add('is-visible');
      });
    } else {
      _savePopoverEl.classList.add('is-visible');
    }
    _savePopoverOpen = true;
    var chip = doc.getElementById('vildaPatientChip');
    if (chip) chip.setAttribute('aria-expanded', 'true');
  }

  function closeSavePopover() {
    if (!_savePopoverEl) return;
    _savePopoverEl.classList.remove('is-visible');
    _savePopoverOpen = false;
    var chip = doc.getElementById('vildaPatientChip');
    if (chip) chip.setAttribute('aria-expanded', 'false');
    setTimeout(function () {
      if (_savePopoverEl && !_savePopoverOpen) _savePopoverEl.hidden = true;
    }, 180);
  }

  function toggleSavePopover() {
    if (_savePopoverOpen) closeSavePopover(); else openSavePopover();
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

  // ============ CLOUD-ONLY UI (sync btn variant + force-pull overlay) ============
  // Zamiast osobnego chipa „chmura" w nagłówku, w trybie cloud-only zmieniamy
  // wygląd istniejącego przycisku synchronizacji (#vildaSyncBtn):
  //   • tło wypełnione turkusem, biała chmura ze strzałką, kółko (jak avatar)
  //   • offline → tło pomarańczowe + ostrzegawczy pierścień
  //   • status sync (ok/error/syncing) zmienia tło (zachowane efekty)
  // Komunikacja semantyczna jednym elementem zamiast dwóch (chip + sync btn).
  function refreshCloudOnlyBadge() {
    // R4-fix flash (głębszy): czyta SYNCHRONICZNIE z sessionStorage marker zamiast
    // czekać na vault.isCloudOnlyMode(). Vault wymaga async restoreSession żeby
    // ustawić _currentStorageModeCache; w pierwszych ms po nawigacji isCloudOnlyMode()
    // zwracał false → ten handler usuwał data-cloud-only → 50-200ms później onUnlock
    // przywracał. To dawało wizualny flash (ikona przechodziła z kółka cloud-only na
    // standardowy sync btn i z powrotem). Marker sessionStorage jest TRUE/FALSE
    // SYNCHRONICZNIE od pierwszego frame'a → brak flash.
    //
    // Cross-check z vault: gdy vault zdążył już zrestorować i mówi explicit FALSE,
    // marker jest "stale" → respekrujemy vault (np. logout w trakcie sesji).
    var sessionMarker = _readCloudOnlyMarkerFromStorage();
    var v = global.VildaVault;
    var vaultExplicitFalse = (v
      && typeof v.isCloudOnlyMode === 'function'
      && typeof v.isUnlocked === 'function'
      && v.isUnlocked()           // vault zainicjalizowany + user zalogowany
      && !v.isCloudOnlyMode());   // vault explicit mówi: NIE cloud-only
    var active = sessionMarker && !vaultExplicitFalse;

    // Migracja: usuń legacy chipek jeśli został w DOM po starej wersji.
    var chip = doc.getElementById('vildaUserChip');
    if (chip) {
      var legacy = chip.querySelector('.chrome-cloud-only-badge');
      if (legacy) legacy.remove();
    }

    var syncBtn = doc.getElementById('vildaSyncBtn');
    if (!syncBtn) return;

    if (!active) {
      syncBtn.removeAttribute('data-cloud-only');
      syncBtn.removeAttribute('data-offline');
      // Przywróć domyślne aria/title (gdy user wylogował się z cloud-only).
      syncBtn.setAttribute('title', 'Synchronizacja między urządzeniami');
      syncBtn.setAttribute('aria-label', 'Status synchronizacji');
      return;
    }

    var isOffline = (typeof navigator !== 'undefined' && navigator && navigator.onLine === false);
    syncBtn.setAttribute('data-cloud-only', 'true');
    if (isOffline) {
      syncBtn.setAttribute('data-offline', 'true');
      syncBtn.setAttribute('title', 'Tryb chmurowy + brak internetu. Zapisy nie trafią do chmury, a ponowne zalogowanie nie powiedzie się dopóki nie wrócisz online.');
      syncBtn.setAttribute('aria-label', 'Tryb chmurowy — offline');
    } else {
      syncBtn.removeAttribute('data-offline');
      syncBtn.setAttribute('title', 'Tryb chmurowy aktywny — dane pacjentów tylko w chmurze. Kliknij, żeby zsynchronizować.');
      syncBtn.setAttribute('aria-label', 'Tryb chmurowy aktywny');
    }
  }

  // Słuchacze online/offline — odświeżają wygląd chipa cloud-only żeby
  // user widział że właśnie stracił/odzyskał połączenie.
  var _cloudOnlyOnlineListenerBound = false;
  function bindCloudOnlyOnlineListeners() {
    if (_cloudOnlyOnlineListenerBound) return;
    _cloudOnlyOnlineListenerBound = true;
    try {
      global.addEventListener && global.addEventListener('online', refreshCloudOnlyBadge);
      global.addEventListener && global.addEventListener('offline', refreshCloudOnlyBadge);
    } catch (_) {}
  }

  // ── Cloud-only sync state machine + overlay/banner UI ────────────────────
  // Po Kroku 9 sync cloud-only DZIAŁA W TLE — overlay NIE pokazuje się automatycznie
  // przy logowaniu. Komunikacja stanu odbywa się przez:
  //   1. animację sync btn (pulsująca chmura, kolor wg [data-sync-state])
  //   2. discreet banner na dole ekranu w razie błędu (z opcjami retry/logout)
  // Overlay pokazujemy ŚWIADOMIE w jednym przypadku: gdy user kliknie na listę
  // pacjentów (showPatientsList) i sync jeszcze nie skończył — wtedy blokujemy
  // dostęp do listy, bo lista byłaby pusta. Po complete overlay sam się ukrywa.
  var _cloudOnlySyncPhase = 'idle';   // 'idle' | 'pulling' | 'complete' | 'failed'
  var _cloudOnlySyncLastErr = null;
  function getCloudOnlySyncPhase() { return _cloudOnlySyncPhase; }
  function isCloudOnlySyncInProgress() { return _cloudOnlySyncPhase === 'pulling'; }

  // Wait helper — resolves gdy sync skończy się (complete albo failed).
  // Użyteczne dla gating: showPatientsList może await'ować przed renderem.
  function waitForCloudOnlySync() {
    return new Promise(function (resolve, reject) {
      if (_cloudOnlySyncPhase === 'complete' || _cloudOnlySyncPhase === 'idle') {
        resolve('complete'); return;
      }
      if (_cloudOnlySyncPhase === 'failed') {
        reject(_cloudOnlySyncLastErr || new Error('cloud-only sync failed')); return;
      }
      function onComplete() { cleanup(); resolve('complete'); }
      function onFailed(e) {
        cleanup();
        var d = e && e.detail;
        var err = new Error((d && d.message) || 'cloud-only sync failed');
        if (d && d.code) err.code = d.code;
        reject(err);
      }
      function cleanup() {
        doc.removeEventListener('vilda:cloud-only-sync-complete', onComplete);
        doc.removeEventListener('vilda:cloud-only-sync-failed', onFailed);
      }
      doc.addEventListener('vilda:cloud-only-sync-complete', onComplete, { once: true });
      doc.addEventListener('vilda:cloud-only-sync-failed', onFailed, { once: true });
    });
  }

  function installCloudOnlyOverlay() {
    if (doc.getElementById('vildaCloudOnlyLoading')) return;
    // Animacja spinnera — keyframe inline
    if (!doc.getElementById('vilda-cloud-only-loading-style')) {
      var s = doc.createElement('style');
      s.id = 'vilda-cloud-only-loading-style';
      s.textContent = '@keyframes vilda-co-spin{to{transform:rotate(360deg)}}@keyframes vildaCoBannerIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}';
      (doc.head || doc.documentElement).appendChild(s);
    }
    var overlay = doc.createElement('div');
    overlay.id = 'vildaCloudOnlyLoading';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2000005;display:none;align-items:center;justify-content:center;background:rgba(15,43,51,0.65);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);padding:16px;font-family:Inter,"Segoe UI",system-ui,-apple-system,sans-serif;';
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:18px;padding:28px 32px;max-width:400px;width:100%;text-align:center;box-shadow:0 18px 60px rgba(0,0,0,0.25);">' +
        '<div id="vildaCloudOnlyLoadingSpinner" style="display:inline-block;width:44px;height:44px;border:4px solid #cfe8eb;border-top-color:#00838d;border-radius:50%;animation:vilda-co-spin 0.9s linear infinite;margin-bottom:16px;"></div>' +
        '<div id="vildaCloudOnlyLoadingTitle" style="font-weight:700;font-size:18px;color:#0f2b33;margin-bottom:6px;">Synchronizacja z chmurą…</div>' +
        '<div id="vildaCloudOnlyLoadingDesc" style="font-size:13.5px;color:#5b6672;line-height:1.5;"></div>' +
        // C3: pasek progresu + counter + procent (wariant A). Ukryty na starcie —
        // pojawia się po pierwszym vilda:vault-merge-progress event z phase='patients'.
        // Dla 1-go unlock dnia z dużym vaultem (100+ pacjentów) user zobaczy „Pobrano
        // X z Y" i % zamiast czystego spinnera. Dla małych vaultów merge kończy się
        // tak szybko że pasek może się nie pokazać — to OK, sam spinner wystarczy.
        '<div id="vildaCloudOnlyLoadingProgress" style="display:none;margin-top:14px;">' +
          '<div style="background:#e8eff1;height:8px;border-radius:999px;overflow:hidden;margin-bottom:8px;">' +
            '<div id="vildaCloudOnlyProgressBar" style="background:#00838d;height:100%;width:0%;border-radius:999px;transition:width 0.2s ease;"></div>' +
          '</div>' +
          '<div style="display:flex;justify-content:space-between;font-size:12.5px;color:#5b6672;">' +
            '<span id="vildaCloudOnlyProgressCounter">Pobrano <strong style="color:#0f2b33;">0</strong> z 0</span>' +
            '<span id="vildaCloudOnlyProgressPercent"><strong style="color:#00838d;">0%</strong></span>' +
          '</div>' +
        '</div>' +
        '<div id="vildaCloudOnlyLoadingError" style="display:none;margin-top:14px;padding:10px 14px;background:#fef2f3;border:1px solid #f5b3bb;border-radius:10px;color:#9a213a;font-size:13px;text-align:left;line-height:1.45;"></div>' +
        '<div id="vildaCloudOnlyLoadingActions" style="display:none;margin-top:18px;gap:10px;justify-content:center;flex-wrap:wrap;">' +
          '<button type="button" id="vildaCloudOnlyRetry" style="padding:8px 18px;border:1px solid #00838d;border-radius:10px;background:#00838d;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Spróbuj ponownie</button>' +
          '<button type="button" id="vildaCloudOnlyLogout" style="padding:8px 18px;border:1px solid #d7e9ec;border-radius:10px;background:#fff;color:#5b6672;font-weight:600;font-size:13px;cursor:pointer;">Wyloguj się</button>' +
        '</div>' +
      '</div>';
    doc.body.appendChild(overlay);

    function setLoadingState() {
      overlay.querySelector('#vildaCloudOnlyLoadingSpinner').style.display = '';
      overlay.querySelector('#vildaCloudOnlyLoadingTitle').textContent = 'Synchronizacja z chmurą…';
      overlay.querySelector('#vildaCloudOnlyLoadingDesc').textContent = '';
      overlay.querySelector('#vildaCloudOnlyLoadingError').style.display = 'none';
      overlay.querySelector('#vildaCloudOnlyLoadingActions').style.display = 'none';
      // C3: reset progress UI przy każdym nowym sync (retry).
      var progBlock = overlay.querySelector('#vildaCloudOnlyLoadingProgress');
      if (progBlock) progBlock.style.display = 'none';
      var progBar = overlay.querySelector('#vildaCloudOnlyProgressBar');
      if (progBar) progBar.style.width = '0%';
      overlay.style.display = 'flex';
    }
    // C3: aktualizacja progress UI z eventów vilda:vault-merge-progress.
    // Pokazuje pasek + counter „X z Y" + procent. Wariant A z mockupu C3.
    function setProgressState(info) {
      if (!info || typeof info !== 'object') return;
      var current = (typeof info.current === 'number' && info.current >= 0) ? info.current : 0;
      var total = (typeof info.total === 'number' && info.total > 0) ? info.total : 0;
      var phase = info.phase || 'patients';
      if (total <= 0) return; // pusty sync — nie pokazuj paska
      // 'done' — ukryj pasek (overlay schowa się przez complete event)
      if (phase === 'done') {
        var progBlock0 = overlay.querySelector('#vildaCloudOnlyLoadingProgress');
        if (progBlock0) progBlock0.style.display = 'none';
        return;
      }
      var pct = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
      var progBlock = overlay.querySelector('#vildaCloudOnlyLoadingProgress');
      var progBar = overlay.querySelector('#vildaCloudOnlyProgressBar');
      var progCounter = overlay.querySelector('#vildaCloudOnlyProgressCounter');
      var progPct = overlay.querySelector('#vildaCloudOnlyProgressPercent');
      if (progBlock) progBlock.style.display = 'block';
      if (progBar) progBar.style.width = pct + '%';
      if (progCounter) {
        progCounter.innerHTML = 'Pobrano <strong style="color:#0f2b33;">' + current + '</strong> z ' + total;
      }
      if (progPct) {
        progPct.innerHTML = '<strong style="color:#00838d;">' + pct + '%</strong>';
      }
    }
    // C3: listener na vilda:vault-merge-progress (emitowane z vilda_sync.js
    // syncPull → vault.mergeSyncPayload onProgress callback). Try/catch w środku
    // bo nawet jeśli detail jest malformed, nie chcemy crashować overlay'a.
    doc.addEventListener('vilda:vault-merge-progress', function (ev) {
      try { setProgressState(ev && ev.detail); } catch (_) {}
    });
    function setErrorState(detail) {
      overlay.querySelector('#vildaCloudOnlyLoadingSpinner').style.display = 'none';
      overlay.querySelector('#vildaCloudOnlyLoadingTitle').textContent = 'Nie udało się pobrać danych';
      var desc = overlay.querySelector('#vildaCloudOnlyLoadingDesc');
      var code = detail && detail.code;
      if (code === 'CLOUD_ONLY_NO_SYNC') {
        desc.textContent = 'Tryb chmurowy wymaga aktywnej synchronizacji.';
      } else if (code === 'CLOUD_ONLY_NO_API') {
        desc.textContent = 'Moduł synchronizacji niedostępny — odśwież stronę.';
      } else {
        desc.textContent = 'Sprawdź połączenie z internetem i spróbuj ponownie.';
      }
      var errBox = overlay.querySelector('#vildaCloudOnlyLoadingError');
      errBox.textContent = (detail && detail.message) || 'Nieznany błąd.';
      errBox.style.display = '';
      overlay.querySelector('#vildaCloudOnlyLoadingActions').style.display = 'flex';
      overlay.style.display = 'flex';
    }
    function hideOverlay() { overlay.style.display = 'none'; }

    overlay.querySelector('#vildaCloudOnlyRetry').addEventListener('click', function () {
      var VSI = global.VildaSyncIntegration;
      if (!VSI || typeof VSI.forcePullForCloudOnly !== 'function') return;
      setLoadingState();
      VSI.forcePullForCloudOnly().then(function () { hideOverlay(); }).catch(function (err) {
        setErrorState({ code: err && err.code, message: err && err.message });
      });
    });
    overlay.querySelector('#vildaCloudOnlyLogout').addEventListener('click', function () {
      try { if (global.VildaVault && typeof global.VildaVault.lock === 'function') global.VildaVault.lock('user'); } catch (_) {}
      hideOverlay();
    });

    // Eksport handlerów dla zewnętrznych callerów (auth_ui.showPatientsList)
    overlay._showLoading = setLoadingState;
    overlay._showError = setErrorState;
    overlay._hide = hideOverlay;

    // ── Discreet error banner — pokazywany w tle gdy sync padł w trakcie pracy
    // (zamiast pełnoekranowego overlayu, który blokuje wszystko). Banner ma
    // przycisk „Spróbuj ponownie" i „Pokaż szczegóły" (uruchamia overlay).
    var banner = doc.createElement('div');
    banner.id = 'vildaCloudOnlySyncBanner';
    banner.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2000004;display:none;align-items:center;gap:10px;padding:10px 14px;background:#fff;border:1px solid #f5b3bb;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.18);font-family:Inter,"Segoe UI",system-ui,-apple-system,sans-serif;font-size:13px;color:#9a213a;max-width:480px;animation:vildaCoBannerIn 0.25s ease-out;';
    banner.innerHTML =
      '<span style="font-size:18px;line-height:1;">⚠️</span>' +
      '<span id="vildaCloudOnlySyncBannerText" style="flex:1 1 auto;line-height:1.4;color:#0f2b33;">Sync z chmurą nie powiódł się.</span>' +
      '<button type="button" id="vildaCloudOnlySyncBannerRetry" style="padding:6px 12px;border:1px solid #00838d;border-radius:8px;background:#00838d;color:#fff;font-weight:600;font-size:12.5px;cursor:pointer;">Spróbuj ponownie</button>' +
      '<button type="button" id="vildaCloudOnlySyncBannerDetails" style="padding:6px 12px;border:1px solid #d7e9ec;border-radius:8px;background:#fff;color:#5b6672;font-weight:500;font-size:12.5px;cursor:pointer;">Szczegóły</button>' +
      '<button type="button" id="vildaCloudOnlySyncBannerClose" aria-label="Zamknij" style="padding:4px 8px;border:0;background:transparent;color:#5b6672;font-size:18px;line-height:1;cursor:pointer;">×</button>';
    doc.body.appendChild(banner);

    function showBanner(detail) {
      var msg = (detail && detail.message) || 'Sync z chmurą nie powiódł się.';
      banner.querySelector('#vildaCloudOnlySyncBannerText').textContent = msg;
      banner.style.display = 'flex';
    }
    function hideBanner() { banner.style.display = 'none'; }
    banner.querySelector('#vildaCloudOnlySyncBannerRetry').addEventListener('click', function () {
      var VSI = global.VildaSyncIntegration;
      if (!VSI || typeof VSI.forcePullForCloudOnly !== 'function') return;
      hideBanner();
      VSI.forcePullForCloudOnly().catch(function () { /* failed event again will re-show */ });
    });
    banner.querySelector('#vildaCloudOnlySyncBannerDetails').addEventListener('click', function () {
      hideBanner();
      setErrorState(_cloudOnlySyncLastErr || {});
    });
    banner.querySelector('#vildaCloudOnlySyncBannerClose').addEventListener('click', hideBanner);

    // Słuchacze stanu — aktualizują phase + ewentualnie banner.
    // ŻADEN listener nie pokazuje automatycznie overlay! Overlay tylko gdy
    // user świadomie wywoła (retry z banneru, gating w showPatientsList).
    doc.addEventListener('vilda:cloud-only-sync-pulling', function () {
      _cloudOnlySyncPhase = 'pulling';
      _cloudOnlySyncLastErr = null;
      hideBanner(); // ewentualny stary banner zostaje schowany
    });
    doc.addEventListener('vilda:cloud-only-sync-complete', function () {
      _cloudOnlySyncPhase = 'complete';
      _cloudOnlySyncLastErr = null;
      hideBanner();
      // Jeśli overlay był widoczny (np. po retry z banneru) — ukryj go.
      hideOverlay();
    });
    doc.addEventListener('vilda:cloud-only-sync-failed', function (e) {
      _cloudOnlySyncPhase = 'failed';
      _cloudOnlySyncLastErr = (e && e.detail) || {};
      // Jeśli overlay otwarty — pokaż błąd w nim (priorytet); inaczej banner.
      if (overlay.style.display === 'flex') {
        setErrorState(_cloudOnlySyncLastErr);
      } else {
        showBanner(_cloudOnlySyncLastErr);
      }
    });
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

  // ============ R4-fix flash: SYNC BTN initial state z localStorage/sessionStorage ============
  // Pattern: vilda_chrome.js generuje topbar HTML synchronicznie. Stan sync btn
  // (włączony/wyłączony + cloud-only marker + online/offline) jest dostępny od
  // razu z localStorage + sessionStorage — bez czekania na vault inicjalizację.
  // Bez tego renderingu chip pojawiał się dopiero po refreshSyncBtn + refresh
  // CloudOnlyBadge → flash przy każdej nawigacji.

  var _CHROME_SYNC_ENABLED_KEY = 'vilda-sync-enabled-v1';
  var _CHROME_CLOUD_ONLY_MARKER = 'vilda-cloud-only-session-v1';

  function _readSyncEnabledFromStorage() {
    try { return (global.localStorage && global.localStorage.getItem(_CHROME_SYNC_ENABLED_KEY) === 'true'); }
    catch (_) { return false; }
  }
  function _readCloudOnlyMarkerFromStorage() {
    try { return !!(global.sessionStorage && global.sessionStorage.getItem(_CHROME_CLOUD_ONLY_MARKER)); }
    catch (_) { return false; }
  }
  function _isCurrentlyOffline() {
    try { return (typeof navigator !== 'undefined' && navigator && navigator.onLine === false); }
    catch (_) { return false; }
  }

  /**
   * Synchroniczny render HTML sync btn — czyta storage flags i ustawia od razu:
   *   - class .is-enabled gdy sync włączony (CSS: display:inline-flex)
   *   - data-cloud-only="true" gdy cloud-only mode (CSS: kółko, biała ikona)
   *   - data-offline="true" gdy offline w cloud-only (visual warning)
   *   - title/aria-label dopasowane do stanu (dla a11y)
   */
  function _renderSyncBtnHtml() {
    var syncEnabled = _readSyncEnabledFromStorage();
    var cloudOnly = _readCloudOnlyMarkerFromStorage();
    var offline = cloudOnly && _isCurrentlyOffline();

    // cloud-only zawsze widoczny (display:inline-flex w CSS przez data-cloud-only).
    // Standardowy sync btn widoczny tylko gdy is-enabled (CSS reguła).
    var classes = 'chrome-sync-btn';
    if (syncEnabled) classes += ' is-enabled';

    var attrs = ' class="' + classes + '" id="vildaSyncBtn"';
    if (cloudOnly) attrs += ' data-cloud-only="true"';
    if (offline) attrs += ' data-offline="true"';

    var title, ariaLabel;
    if (cloudOnly && offline) {
      title = 'Tryb chmurowy + brak internetu. Zapisy nie trafią do chmury, a ponowne zalogowanie nie powiedzie się dopóki nie wrócisz online.';
      ariaLabel = 'Tryb chmurowy — offline';
    } else if (cloudOnly) {
      title = 'Tryb chmurowy aktywny — dane pacjentów tylko w chmurze. Kliknij, żeby zsynchronizować.';
      ariaLabel = 'Tryb chmurowy aktywny';
    } else {
      title = 'Synchronizacja między urządzeniami';
      ariaLabel = 'Status synchronizacji';
    }
    attrs += ' title="' + title + '" aria-label="' + ariaLabel + '"';

    return '    <a href="ustawienia.html#settings-section-sync"' + attrs + '>'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<polyline points="16 16 12 12 8 16"/>'
      + '<line x1="12" y1="12" x2="12" y2="21"/>'
      + '<path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>'
      + '</svg>'
      + '    </a>';
  }

  // ============ R4 — REMINDER CHIP (notatki kliniczne pacjentów due) ============
  // Pattern wizualny zgodny z chrome-sync-btn (30x30, lucide outline SVG).
  // Live update przez V.onPatientNoteChanged. Klik → showRemindersModal force.

  var _remindersRefreshDebounce = null;
  // R4-fix flash: cache w sessionStorage przeżywa nawigację między podstronami →
  // chip renderuje się natychmiast w prawidłowym stanie przy każdej zmianie URL.
  // Bez tego chip był „hidden" podczas mount + visible po async refresh → flash.
  var REMINDERS_CACHE_KEY = 'vilda-reminders-count-v1';

  function _readRemindersCache() {
    try {
      var raw = global.sessionStorage && global.sessionStorage.getItem(REMINDERS_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.count !== 'number' || parsed.count < 0) return null;
      return parsed;
    } catch (_) { return null; }
  }

  function _writeRemindersCache(count, state) {
    try {
      if (!global.sessionStorage) return;
      global.sessionStorage.setItem(REMINDERS_CACHE_KEY, JSON.stringify({
        count: count, state: state, updatedAtISO: new Date().toISOString()
      }));
    } catch (_) {}
  }

  /**
   * Synchroniczny render HTML chip'a — czyta sessionStorage cache. Wywoływane
   * podczas generowania topbar (renderTopbarHTML). Gdy cache count>0, chip pojawia
   * się od razu z prawidłowym stanem (brak flash przy nawigacji).
   */
  function _renderRemindersBtnHtml() {
    var cache = _readRemindersCache();
    if (cache && cache.count > 0) {
      var displayCount = cache.count > 9 ? '9+' : String(cache.count);
      var state = cache.state || 'today';
      return '    <button type="button" class="chrome-reminders-btn" id="vildaRemindersBtn"'
        + ' data-count="' + cache.count + '" data-state="' + state + '"'
        + ' title="Przypomnienia" aria-label="Przypomnienia">'
        + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>'
        + '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'
        + '</svg>'
        + '<span class="chrome-reminders-badge" id="vildaRemindersBadge" aria-hidden="true">' + displayCount + '</span>'
        + '    </button>';
    }
    // Default — brak cache lub count=0: chip hidden.
    return '    <button type="button" class="chrome-reminders-btn" id="vildaRemindersBtn"'
      + ' data-count="0" data-state="empty" hidden'
      + ' title="Brak przypomnień" aria-label="Brak przypomnień">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>'
      + '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'
      + '</svg>'
      + '<span class="chrome-reminders-badge" id="vildaRemindersBadge" aria-hidden="true">0</span>'
      + '    </button>';
  }

  /**
   * Odśwież chip — pobierz aktualną listę due i zaktualizuj badge.
   * Bezpieczne wywołanie wielokrotne (debounce 250ms).
   */
  function refreshRemindersBtn() {
    clearTimeout(_remindersRefreshDebounce);
    _remindersRefreshDebounce = setTimeout(function () {
      _refreshRemindersBtnNow().catch(function () {});
    }, 250);
  }

  async function _refreshRemindersBtnNow() {
    var btn = doc.getElementById('vildaRemindersBtn');
    if (!btn) return;
    var badge = doc.getElementById('vildaRemindersBadge');
    if (!badge) return;

    var V = global.VildaVault;
    // Nie zalogowany → ukryj. R4-fix flash: wyczyść cache, żeby po nawigacji
    // pre-login chip nie pojawiał się chwilowo z stalką liczbą.
    if (!V || typeof V.isUnlocked !== 'function' || !V.isUnlocked()) {
      btn.hidden = true;
      btn.setAttribute('data-count', '0');
      btn.setAttribute('data-state', 'empty');
      btn.setAttribute('aria-label', 'Brak przypomnień');
      btn.setAttribute('title', 'Brak przypomnień');
      _writeRemindersCache(0, 'empty');
      return;
    }
    if (typeof V.listPatientNotesDueByDate !== 'function') {
      btn.hidden = true;
      return;
    }

    var reminders = [];
    try { reminders = await V.listPatientNotesDueByDate(); }
    catch (_) { reminders = []; }

    // Zlicz: pacjentów + notatek + czy są overdue (zmienia kolor badge).
    var patientCount = reminders.length;
    var noteCount = 0;
    var hasOverdue = false;
    var todayLocal = (function () {
      var d = new Date();
      return d.getFullYear() + '-'
        + String(d.getMonth() + 1).padStart(2, '0') + '-'
        + String(d.getDate()).padStart(2, '0');
    })();
    for (var i = 0; i < reminders.length; i++) {
      var notes = reminders[i].notes || [];
      noteCount += notes.length;
      for (var j = 0; j < notes.length; j++) {
        var due = notes[j].dueDateISO || '';
        // overdue gdy dueDate < dzisiaj (lokalna). Porównanie YYYY-MM-DD jest lexykogr.
        if (due && due.substring(0, 10) < todayLocal) { hasOverdue = true; break; }
      }
      if (hasOverdue) break;
    }

    if (patientCount === 0) {
      btn.hidden = true;
      btn.setAttribute('data-count', '0');
      btn.setAttribute('data-state', 'empty');
      btn.setAttribute('aria-label', 'Brak przypomnień');
      btn.setAttribute('title', 'Brak przypomnień');
      badge.textContent = '0';
      // R4-fix flash: aktualizuj cache → następna nawigacja zna prawidłowy stan.
      _writeRemindersCache(0, 'empty');
      return;
    }

    // Widoczny + badge update.
    btn.hidden = false;
    var resolvedState = hasOverdue ? 'overdue' : 'today';
    btn.setAttribute('data-count', String(patientCount));
    btn.setAttribute('data-state', resolvedState);
    badge.textContent = patientCount > 9 ? '9+' : String(patientCount);
    // R4-fix flash: zapisz cache po fetch → przy nawigacji topbar renderuje
    // chip od razu w prawidłowym stanie (z _renderRemindersBtnHtml).
    _writeRemindersCache(patientCount, resolvedState);

    // a11y label z poprawną polską odmianą.
    var pacjentowWord = (patientCount === 1) ? 'pacjent wymaga'
      : (patientCount < 5 ? 'pacjentów wymaga' : 'pacjentów wymaga');
    var label = patientCount + ' ' + pacjentowWord + ' uwagi (' + noteCount
      + (noteCount === 1 ? ' notatka' : (noteCount < 5 ? ' notatki' : ' notatek')) + ')';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }

  /**
   * Wpięcie: klik btn → otwórz modal force; live update na V.onPatientNoteChanged
   * + on day change (jeśli user trzyma stronę otwartą przez północ).
   */
  function bindRemindersBtn() {
    var btn = doc.getElementById('vildaRemindersBtn');
    if (!btn) return;
    btn.addEventListener('click', function (ev) {
      if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      try {
        var Ui = global.VildaAuthUI;
        if (Ui && typeof Ui.maybeShowReminders === 'function') {
          Ui.maybeShowReminders({ force: true }).catch(function () {});
        }
      } catch (_) {}
    });
  }

  // ============ EVENTY ============
  function bindAuthEvents() {
    var vaultListenersBound = false;

    function tryBindVault() {
      if (vaultListenersBound) return true;
      var v = global.VildaVault;
      if (!v) return false;
      vaultListenersBound = true;
      if (typeof v.onUnlock       === 'function') {
        v.onUnlock(refreshUserChip);
        v.onUnlock(refreshCloudOnlyBadge);
        // R4 — reminder chip refresh po unlock. Z opóźnieniem 3500ms żeby było po
        // sync force-pull (3000ms) i pokrywało się z maybeShowReminders auto-trigger.
        v.onUnlock(function () { setTimeout(refreshRemindersBtn, 3500); });
      }
      if (typeof v.onLock         === 'function') {
        v.onLock(refreshUserChip);
        v.onLock(refreshCloudOnlyBadge);
        v.onLock(refreshRemindersBtn); // → patientCount=0 → hidden
      }
      if (typeof v.onPatientSaved === 'function') v.onPatientSaved(refreshPatientChip);
      // R4 — real-time update chipu gdy notatka zmieniona (save/delete/complete/snooze).
      if (typeof v.onPatientNoteChanged === 'function') {
        v.onPatientNoteChanged(refreshRemindersBtn);
      }
      bindRemindersBtn();
      refreshUserChip();
      refreshCloudOnlyBadge();
      refreshRemindersBtn();
      // Overlay loading dla force-pull cloud-only — instalujemy raz po bind vault.
      try { installCloudOnlyOverlay(); } catch (_) {}
      // Online/offline listeners — chip cloud-only przełącza wygląd gdy
      // user traci/odzyskuje internet.
      try { bindCloudOnlyOnlineListeners(); } catch (_) {}
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
    // Tryb pracy:
    //  • strona z formularzem (applyLoadedData dostępne) → wczytuje od razu;
    //  • strona bez formularza (np. cukrzyca, steroidy, instrukcje) → zapisuje
    //    patientId do sessionStorage i nawiguje do index.html, gdzie receiver
    //    (processPendingPatientLoadIfReady poniżej) wczyta pacjenta po unlocku.
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
        var canLoad = typeof global.applyLoadedData === 'function';
        // Zawsze przekazujemy callback — żeby przycisk „Wczytaj tego pacjenta"
        // pojawił się w karcie pacjenta także na stronach bez formularza.
        authUI.showPatientsList(function (payload, patientId) {
          if (canLoad) {
            if (payload) {
              try { global.applyLoadedData(payload); } catch (_) {}
            }
            var vc = global.VildaChrome;
            if (vc && typeof vc.refreshPatientChip === 'function') vc.refreshPatientChip();
          } else {
            // Load+nav: zapisz tylko patientId (opaque), nie payload (zawiera
            // dane pacjenta). Vault zostanie zapytany ponownie po wczytaniu index.html.
            if (patientId) {
              try { global.sessionStorage.setItem('vilda:pendingPatientLoad', String(patientId)); } catch (_) {}
            }
            try { global.location.assign('index.html'); } catch (_) {}
          }
        });
      });
    }
  }

  // ============ PENDING PATIENT LOAD (cross-page navigation) ============
  // Gdy przycisk „Pacjenci" na podstronie bez applyLoadedData wybiera pacjenta,
  // zapisuje patientId w sessionStorage i nawiguje do index.html. Tu, po unlocku
  // vault'a, sprawdzamy ten klucz i wczytujemy pacjenta z vault'a. Payload
  // (dane pacjenta) NIE jest nigdy w sessionStorage — przechodzi tylko opaque ID.
  var _pendingLoadDone = false;
  function processPendingPatientLoadIfReady() {
    if (_pendingLoadDone) return true;
    var ss = null;
    try { ss = global.sessionStorage; } catch (_) {}
    if (!ss) { _pendingLoadDone = true; return true; }
    var pid = null;
    try { pid = ss.getItem('vilda:pendingPatientLoad'); } catch (_) {}
    if (!pid) { _pendingLoadDone = true; return true; }
    if (typeof global.applyLoadedData !== 'function') return false;
    var V = global.VildaVault;
    if (!V || typeof V.isUnlocked !== 'function' || !V.isUnlocked()) return false;
    if (typeof V.getPatient !== 'function') return false;
    // Wszystko gotowe — zdejmujemy klucz przed asynchroniczną operacją.
    try { ss.removeItem('vilda:pendingPatientLoad'); } catch (_) {}
    _pendingLoadDone = true;
    V.getPatient(pid).then(function (patientFull) {
      var snap = (patientFull && Array.isArray(patientFull.snapshots) && patientFull.snapshots.length)
        ? patientFull.snapshots[0] : null;
      if (!snap || !snap.payload) return;
      try { global.applyLoadedData(snap.payload); } catch (_) {}
      try {
        if (typeof global.CustomEvent === 'function' && doc) {
          doc.dispatchEvent(new global.CustomEvent('vilda:patient-loaded', {
            detail: {
              patientId: pid,
              savedAtISO: snap.savedAtISO || null,
              snapshotCount: (patientFull && patientFull.snapshotCount) || patientFull.snapshots.length || null,
              name: (snap.payload && snap.payload.name) || null
            }
          }));
        }
      } catch (_) {}
      var vc = global.VildaChrome;
      if (vc && typeof vc.refreshPatientChip === 'function') vc.refreshPatientChip();
    }).catch(function () {});
    return true;
  }
  // Polling: próbujemy co 250ms przez maks. 12s. Pokrywa: deferred app.js
  // (applyLoadedData definiowany późno), opóźniony auth restore, sync z vault'em.
  var _pendingPollCount = 0;
  function pollPendingLoad() {
    if (processPendingPatientLoadIfReady()) return;
    _pendingPollCount++;
    if (_pendingPollCount < 48) global.setTimeout(pollPendingLoad, 250);
  }
  if (doc) {
    doc.addEventListener('vilda:auth-hidden', function () { pollPendingLoad(); });
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', function () { global.setTimeout(pollPendingLoad, 200); }, { once: true });
    } else {
      global.setTimeout(pollPendingLoad, 200);
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
    initSwipeNav();
  }

  // ============ NAWIGACJA GESTEM (swipe ←/→) — Faza 2 ============
  // Samowystarczalny moduł. Założenia bezpieczeństwa (bez regresu):
  //   - listenery PASYWNE i BEZ preventDefault → zero wpływu na przewijanie,
  //   - nawigujemy dopiero na końcu gestu (pointerup/touchend),
  //   - reagujemy tylko na wyraźnie poziomy, dostatecznie długi i szybki gest,
  //   - szeroka lista wykluczeń (pas krawędziowy = rewir gestu systemowego,
  //     pola formularzy, poziome scrollery, wykresy, modale/drawer),
  //   - poza kolejnością sekcji i na jej końcach = no-op.
  var SWIPE = {
    EDGE_PX: 28,     // pas przy krawędzi zarezerwowany dla gestu systemowego (iOS/Android back)
    MIN_RATIO: 2,    // |dx| musi co najmniej 2× przewyższać |dy|
    MAX_MS: 600,     // dłuższy gest traktujemy jak scroll/drag, nie swipe
    MIN_FRAC: 0.12,  // próg dystansu = 12% szerokości viewportu...
    MIN_PX: 64       // ...ale nie mniej niż 64 px
  };

  // Kolejność sekcji = hrefy z grupy „Narzędzia" w MENU (jedno źródło prawdy).
  function swipeOrder() {
    var tools = null;
    for (var i = 0; i < MENU.length; i++) {
      if (MENU[i] && MENU[i].title === 'Narzędzia') { tools = MENU[i].items; break; }
    }
    var out = [];
    if (tools) {
      for (var j = 0; j < tools.length; j++) {
        if (tools[j] && tools[j].href) out.push(tools[j].href);
      }
    }
    return out;
  }

  // Czysta funkcja decyzyjna — testowalna bez DOM.
  // Zwraca 'next' | 'prev' | null.
  function decideSwipe(p) {
    if (!p) return null;
    var dx = p.dx, dy = p.dy, dt = p.dt, startX = p.startX, vw = p.viewportW || 0;
    if (typeof dx !== 'number' || typeof dy !== 'number' || typeof dt !== 'number') return null;
    if (!isFinite(dx) || !isFinite(dy) || !isFinite(dt)) return null;
    if (dt > SWIPE.MAX_MS) return null;                                  // za wolno
    if (startX < SWIPE.EDGE_PX || startX > vw - SWIPE.EDGE_PX) return null; // pas krawędziowy
    var adx = Math.abs(dx), ady = Math.abs(dy);
    var minDist = Math.max(SWIPE.MIN_PX, vw * SWIPE.MIN_FRAC);
    if (adx < minDist) return null;                                     // za krótko
    if (adx < ady * SWIPE.MIN_RATIO) return null;                       // za mało poziomo
    return dx < 0 ? 'next' : 'prev';                                    // w lewo = dalej
  }

  // Czy gest startuje w miejscu, którego NIE wolno przejmować?
  function swipeExcludedTarget(el) {
    var n = el, hops = 0;
    while (n && n.nodeType === 1 && hops < 40) {
      var tag = (n.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea' ||
          tag === 'button' || tag === 'a' || tag === 'canvas' || tag === 'svg' ||
          tag === 'video' || tag === 'iframe') return true;
      try {
        if (n.getAttribute && (n.getAttribute('role') === 'slider' ||
            n.getAttribute('contenteditable') === 'true' ||
            n.hasAttribute('data-no-swipe'))) return true;
      } catch (_) {}
      // Realnie przewijalny w poziomie kontener → zostaw go w spokoju.
      try {
        if ((n.scrollWidth - n.clientWidth) > 4 && global.getComputedStyle) {
          var ovx = global.getComputedStyle(n).overflowX || '';
          if (ovx === 'auto' || ovx === 'scroll') return true;
        }
      } catch (_) {}
      n = n.parentNode;
      hops++;
    }
    return false;
  }

  // Czy jest otwarta nakładka/menu, przy której swipe-nawigacja ma być wyłączona?
  function swipeBlockedByOverlay() {
    try {
      var de = doc.documentElement, b = doc.body;
      if (de && de.classList && de.classList.contains('vilda-auth-locked')) return true;
      if (b && b.classList && b.classList.contains('chrome-drawer-open')) return true;
      var root = doc.getElementById('vilda-auth-ui-root');
      if (root && root.style && root.style.display && root.style.display !== 'none') return true;
      if (doc.querySelector('.vilda-logout-overlay, .ww-onboarding-overlay.is-open, [aria-modal="true"]')) return true;
    } catch (_) {}
    return false;
  }

  function navigateSwipe(dir) {
    var order = swipeOrder();
    if (!order.length) return;
    var cur = currentFile();
    var idx = order.indexOf(cur);
    if (idx < 0) return;                       // strona poza kolejnością → no-op
    var target = (dir === 'next') ? order[idx + 1] : order[idx - 1];
    if (!target || target === cur) return;     // koniec kolejności → no-op
    // Krok 3: zapamiętaj kierunek dla View Transition (slide w odpowiednią stronę).
    // sessionStorage przeżywa zamianę dokumentu w tej samej karcie; flagę konsumuje
    // pagereveal na stronie docelowej (z guardem świeżości).
    try {
      if (global.sessionStorage) {
        global.sessionStorage.setItem(VT_DIR_KEY, JSON.stringify({
          d: (dir === 'next') ? 'forward' : 'back', t: Date.now()
        }));
      }
    } catch (_) {}
    try { global.location.assign(target); } catch (_) {}
  }

  function initSwipeNav() {
    if (initSwipeNav._bound) return;
    initSwipeNav._bound = true;
    var sx = 0, sy = 0, st = 0, active = false;

    function start(x, y, target) {
      if (swipeExcludedTarget(target) || swipeBlockedByOverlay()) { active = false; return; }
      sx = x; sy = y; st = Date.now(); active = true;
    }
    function finish(x, y) {
      if (!active) return;
      active = false;
      var dir = decideSwipe({
        dx: x - sx, dy: y - sy, dt: Date.now() - st, startX: sx,
        viewportW: global.innerWidth || (doc.documentElement && doc.documentElement.clientWidth) || 0
      });
      if (dir) navigateSwipe(dir);
    }

    if (global.PointerEvent) {
      doc.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'touch' || e.isPrimary === false) { active = false; return; }
        start(e.clientX, e.clientY, e.target);
      }, { passive: true });
      doc.addEventListener('pointerup', function (e) {
        if (e.pointerType !== 'touch') return;
        finish(e.clientX, e.clientY);
      }, { passive: true });
      doc.addEventListener('pointercancel', function () { active = false; }, { passive: true });
    } else {
      doc.addEventListener('touchstart', function (e) {
        if (!e.touches || e.touches.length !== 1) { active = false; return; } // multitouch → ignoruj
        var t = e.touches[0];
        start(t.clientX, t.clientY, e.target);
      }, { passive: true });
      doc.addEventListener('touchend', function (e) {
        if (!active) return;
        var t = (e.changedTouches && e.changedTouches[0]) || null;
        if (!t) { active = false; return; }
        finish(t.clientX, t.clientY);
      }, { passive: true });
      doc.addEventListener('touchcancel', function () { active = false; }, { passive: true });
    }
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
    // R4 — manual refresh chip (np. po external change reminderów).
    refreshRemindersBtn: refreshRemindersBtn,
    highlightActiveLink: function () { highlightActiveLink(); },
    showTip: showChromeTip,
    MENU: MENU,
    // Faza 2 — udostępnione do testów jednostkowych nawigacji gestem.
    decideSwipe: decideSwipe,
    swipeOrder: swipeOrder,
    // Cloud-only sync state — używane przez auth_ui (gating list pacjentów)
    // oraz testy.
    getCloudOnlySyncPhase: getCloudOnlySyncPhase,
    isCloudOnlySyncInProgress: isCloudOnlySyncInProgress,
    waitForCloudOnlySync: waitForCloudOnlySync,
    showCloudOnlySyncOverlay: function () {
      var ov = doc.getElementById('vildaCloudOnlyLoading');
      if (ov && typeof ov._showLoading === 'function') ov._showLoading();
    },
    hideCloudOnlySyncOverlay: function () {
      var ov = doc.getElementById('vildaCloudOnlyLoading');
      if (ov && typeof ov._hide === 'function') ov._hide();
    }
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
