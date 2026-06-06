/* ==========================================================================
 * vilda_terminarz.js — Terminarz kliniczny (Cykl A+C, 2026-06-05)
 *
 * Prywatny follow-up lekarza: trzy widoki — MIESIĄC (siatka pn-nd + panel
 * dnia), TYDZIEŃ (desktop: siatka 7 kolumn; mobile: agenda pionowa) oraz
 * DZIEŃ (desktop: karty per pacjent; mobile: checklista zaległe→dziś→
 * wykonane). To NIE jest kalendarz wizyt/booking — wyłącznie zadania
 * kliniczne lekarza z notatek pacjentów z terminem (dueDateISO).
 *
 * Dane: VildaVault.listPatientNotesInRange(from,to) (zakres widoku, także
 * wykonane) oraz listPatientNotesDueByDate (zaległe — pending z terminem
 * < dziś). Akcje: ✓ Wykonane / ↺ Cofnij (savePatientNote z completedAtISO —
 * vault robi merge-by-id, hasOwnProperty: ISO ustawia, null czyści, brak pola
 * zachowuje), ↻ Przełóż (+1 tydz./+1 mies./+3/+6 → dueDateISO), ✎ Edytuj
 * (istniejący VildaAuthUI.showPatientNoteEditor), karta pacjenta
 * (VildaAuthUI.showPatientCard — ścieżka jak w modalu przypomnień R3).
 * Live-refresh: V.onPatientNoteChanged. Breakpoint widoków: matchMedia
 * (max-width:700px) — zmiana szerokości tylko re-renderuje (dane te same).
 *
 * BEZPIECZEŃSTWO DANYCH MEDYCZNYCH: terminy + nazwiska liczone lokalnie po
 * odszyfrowaniu vaulta; moduł niczego nie zapisuje poza notatkami w vaultcie.
 * Jedyny nowy zapis: localStorage 'vilda-terminarz-view-v1' = wybrany widok
 * ('month'/'week'/'day') — czysta flaga UI bez jakiejkolwiek treści medycznej
 * (wzorzec flagi PII-banera notatek).
 * ========================================================================== */
(function (global) {
  'use strict';

  var VERSION = '4.2.0';
  var doc = global.document;
  if (!doc) return;

  var MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
    'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
  var MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
    'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  var WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
  var WEEKDAYS_FULL = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];
  var CAT_LABEL = { followup: 'Kontrola', observation: 'Obserwacja', treatment: 'Leczenie', 'wynik-badania': 'Wynik badania',
    // TERMINARZ-ZAJĘCIA (2026-06-06): wydarzenia poza-pacjenckie (grafik lekarza).
    lecture: 'Wykład', seminar: 'Seminarium', practical: 'Ćwiczenia', clinic: 'Poradnia', duty: 'Dyżur', 'activity-other': 'Zajęcie' };
  var CAT_CLASS = { followup: 'tz-cat-followup', observation: 'tz-cat-observation', treatment: 'tz-cat-treatment', 'wynik-badania': 'tz-cat-wynik',
    // Uczelnia (wykład/seminarium/ćwiczenia) = fiolet; Dyżur = czerwień; Poradnia = ceglasty; Inne = grafit.
    lecture: 'tz-cat-uni', seminar: 'tz-cat-uni', practical: 'tz-cat-uni', clinic: 'tz-cat-clinic', duty: 'tz-cat-duty', 'activity-other': 'tz-cat-act' };
  // Rodzaje zajęć w selektorze „Zajęcie" (kolejność = układ chipów).
  var ACTIVITY_KINDS = [['lecture', 'Wykład'], ['seminar', 'Seminarium'], ['practical', 'Ćwiczenia'], ['clinic', 'Poradnia'], ['duty', 'Dyżur'], ['activity-other', 'Inne']];
  // Domyślny czas rezerwacji wg rodzaju (min). Vault ogranicza do 5–480.
  var ACTIVITY_DEFAULT_MIN = { lecture: 90, seminar: 90, practical: 90, clinic: 180, duty: 720, 'activity-other': 60 };
  function isActivityCat(c) { return Object.prototype.hasOwnProperty.call(ACTIVITY_DEFAULT_MIN, c); }
  // Nazwa główna wydarzenia: pacjent → nazwisko; zajęcie → MIEJSCE (gdy puste:
  // etykieta rodzaju). Temat (title) renderuje się jako linia wtórna.
  // Polska odmiana licznika wydarzeń (decyzja 2026-06-07: nie „terminy").
  function evtPlural(n) {
    var u = n % 10, t = n % 100;
    if (n === 1) return 'wydarzenie';
    if (u >= 2 && u <= 4 && !(t >= 12 && t <= 14)) return 'wydarzenia';
    return 'wydarzeń';
  }
  function nmOf(n) {
    if (n && n.isActivity) return n.patientName || CAT_LABEL[n.category] || 'Zajęcie';
    return (n && n.patientName) || '';
  }
  // DYŻUR ma specjalne traktowanie: nie odhacza się go ani nie przekłada.
  function isDuty(n) { return !!(n && n.category === 'duty'); }
  // Czas trwania: dyżur w GODZINACH, reszta w minutach.
  function durLabel(n) {
    if (!n || !(n.durationMin > 0)) return '';
    // OD–DO (2026-06-06): wpis z godziną pokazuje ZAKRES (np. 16:00–19:20).
    if (n.dueTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(n.dueTime)) {
      return n.dueTime + '–' + hhOf(Math.min(slotMinOf(n.dueTime) + n.durationMin, 1439));
    }
    if (n.category === 'duty') {
      var h = n.durationMin / 60;
      return (Math.round(h * 10) / 10) + ' h';
    }
    return n.durationMin + ' min';
  }
  function _hhAdd(hh, mins) {
    var m = slotMinOf(hh) + (mins || 0);
    if (m < 0) m = 0;
    if (m > 1435) m = 1435; // koniec w obrębie tej samej doby (23:55)
    return hhOf(m);
  }
  var VIEW_KEY = 'vilda-terminarz-view-v1'; // flaga UI (bez treści medycznej)

  // ── Święta państwowe PL (dni ustawowo wolne od pracy) — liczone LOKALNIE ────
  // Stałe + ruchome od Wielkanocy (algorytm Meeusa/Jonesa/Butchera). Wigilia
  // (24.12) ustawowo wolna od 2025 r. (ustawa z 6.12.2024). Czysta arytmetyka
  // dat — zero sieci, zero magazynów, zero danych medycznych.
  var _holidayCache = {};
  function easterSunday(y) {
    var a = y % 19;
    var b = Math.floor(y / 100);
    var c = y % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31); // 3=marzec, 4=kwiecień
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }
  function plHolidaysForYear(y) {
    if (_holidayCache[y]) return _holidayCache[y];
    var map = {};
    function put(d, name) { map[dayISO(d)] = name; }
    function fromEaster(days) {
      var e0 = easterSunday(y);
      return new Date(e0.getFullYear(), e0.getMonth(), e0.getDate() + days);
    }
    put(new Date(y, 0, 1), 'Nowy Rok');
    put(new Date(y, 0, 6), 'Trzech Króli');
    put(fromEaster(0), 'Wielkanoc');
    put(fromEaster(1), 'Poniedziałek Wielkanocny');
    put(fromEaster(49), 'Zielone Świątki');
    put(fromEaster(60), 'Boże Ciało');
    put(new Date(y, 4, 1), 'Święto Pracy');
    put(new Date(y, 4, 3), 'Konstytucji 3 Maja');
    put(new Date(y, 7, 15), 'Wniebowzięcie NMP');
    put(new Date(y, 10, 1), 'Wszystkich Świętych');
    put(new Date(y, 10, 11), 'Święto Niepodległości');
    if (y >= 2025) put(new Date(y, 11, 24), 'Wigilia');
    put(new Date(y, 11, 25), 'Boże Narodzenie');
    put(new Date(y, 11, 26), '2. dzień Świąt');
    _holidayCache[y] = map;
    return map;
  }
  function holidayName(iso) {
    var y = parseInt(String(iso || '').slice(0, 4), 10);
    if (!isFinite(y)) return null;
    return plHolidaysForYear(y)[String(iso).slice(0, 10)] || null;
  }

  var state = {
    inited: false,
    view: 'month',         // 'month' | 'week' | 'day'
    anchorISO: null,       // YYYY-MM-DD — kotwica nawigacji (mies./tydz./dzień)
    selectedISO: null,     // YYYY-MM-DD — zaznaczony dzień w siatce miesiąca
    splitISO: null,        // YYYY-MM-DD — dzień ROZCIĘCIA siatki (dwuklik, desktop)
    notesByDay: {},        // YYYY-MM-DD -> [note+patientName]
    overdue: [],           // płaska lista pending z terminem < dziś
    searchOpen: false,     // SEARCH: pasek wyszukiwania widoczny
    searchQ: '',           // SEARCH: bieżące zapytanie
    searchResults: [],     // SEARCH: wyniki z V.searchPatientNotes
    searchPatients: [],    // SEARCH: sugestie pacjentów Z BAZY pasujących do zapytania
    searchSelPid: null,    // SEARCH: wybrany pacjent = FILTR wyników (klik w pasek chipa)
    searchSelName: null,   // SEARCH: nazwisko wybranego pacjenta
    searchTlPid: null,     // S3: pacjent osi czasu (null = lista wyników)
    searchTlName: null,    // S3: nazwisko pacjenta osi czasu
    searchTlEvents: [],    // S3: wydarzenia pacjenta (notatki z dueDateISO)
    loading: false
  };

  function getVault() { return global.VildaVault || null; }
  function unlocked() {
    var V = getVault();
    return !!(V && typeof V.isUnlocked === 'function' && V.isUnlocked());
  }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function dayISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayISO() { return dayISO(new Date()); }
  function parseISO(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
  }
  function noteDayISO(n) { return (n && n.dueDateISO) ? String(n.dueDateISO).slice(0, 10) : null; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function plDate(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[3] + '.' + m[2] + '.' + m[1]) : '';
  }
  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/);
    var a = (parts[0] || '').charAt(0);
    var b = (parts[1] || '').charAt(0);
    return (a + b).toUpperCase() || '?';
  }
  // Breakpoint widoków W2/D1 (mobile) vs W1/D2 (desktop/tablet) — spójny z CSS.
  var _mq = (typeof global.matchMedia === 'function') ? global.matchMedia('(max-width:700px)') : null;
  function isMobile() { return !!(_mq && _mq.matches); }

  // ── CSS (wstrzykiwane raz — bez dotykania plików .css) ─────────────────────
  var CSS = ''
    + '.terminarz-shell{max-width:980px;margin:0 auto;padding:8px 0 40px;}'
    + '#terminarzRoot{position:relative;}'
    + '#terminarzRoot.tz-anim-clip{overflow:hidden;}'
    + '.tz-vbody--ghost,.tz-vbody{will-change:auto;}'
    + '@keyframes tzTitleIn{from{opacity:0.25;transform:translateX(var(--ttl-dx,14px));}to{opacity:1;transform:none;}}'
    + '.tz-title.is-anim-l{animation:tzTitleIn 240ms cubic-bezier(0.22,1,0.36,1);--ttl-dx:14px;}'
    + '.tz-title.is-anim-r{animation:tzTitleIn 240ms cubic-bezier(0.22,1,0.36,1);--ttl-dx:-14px;}'
    + '.terminarz-locked{text-align:center;padding:64px 16px;color:#5b6672;}'
    + '.terminarz-locked__icon{font-size:2rem;margin-bottom:8px;}'
    + '.terminarz-locked__title{font-weight:600;color:#0f2b33;margin:0 0 4px;}'
    + '.terminarz-locked__desc{margin:0;font-size:0.9rem;}'
    + '.tz-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}'
    /* ANTY-ZOOM (2026-06-05): touch-action:manipulation wyłącza double-tap-zoom
     * przeglądarki na WSZYSTKICH kontrolkach terminarza (strzałki, lupa,
     * przełącznik widoków, akcje wierszy, komórki, sloty, modal) — szybkie
     * podwójne tapnięcia nawigacji nie przybliżają już ekranu. Scroll i pinch
     * działają bez zmian; desktopowego dblclick (rozcięcie) to nie dotyka. */
    + '.terminarz-shell button,.terminarz-shell .tz-cell,.terminarz-shell .tz-wcol__head,'
    + '.terminarz-shell .tz-wcol__body,.terminarz-shell .tz-tl__item,.terminarz-shell .tz-sugg,'
    + '.tz-modal button,.tz-modal input,.tz-postpone-menu button,.tz-undo-toast button,'
    + '.terminarz-shell .tz-swipe-bg{touch-action:manipulation;}'
    + '.tz-topbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0 14px;}'
    + '.tz-topbar__sp{flex:1 1 auto;}'
    + '.tz-nav{display:flex;align-items:center;gap:6px;min-width:0;}'
    + '.tz-nav button{border:0.5px solid #d7e9ec;background:#fff;border-radius:10px;padding:8px 14px;cursor:pointer;font-size:0.95rem;color:#0f2b33;font-weight:600;}'
    + '.tz-nav button:hover{background:#f2fafb;}'
    + '.tz-title{font-weight:700;color:#0f2b33;font-size:1.3rem;line-height:1.2;text-align:left;padding:0 0 0 8px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.tz-today-m{display:none;}'
    /* ── SEARCH: lupa + pasek wyszukiwania ── */
    + '.tz-search-btn{font-size:0.95rem;line-height:1;}'
    + '.tz-searchbar{display:flex;align-items:center;gap:8px;width:100%;margin-top:10px;}'
    + '.tz-searchbar input{flex:1;height:40px;padding:0 12px;font-size:0.95rem;border:0.5px solid #d7e9ec;border-radius:10px;background:#fff;color:#0f2b33;box-sizing:border-box;}'
    + '.tz-searchbar button{flex:0 0 auto;}'
    + '.tz-ext-mark{display:inline-block;font-size:0.62rem;font-weight:600;color:#5b6672;background:#eef4f5;border-radius:6px;padding:1px 6px;vertical-align:1px;}'
    /* ── S2: nagłówki dat w wynikach ── */
    + '.tz-dhead{font-size:0.85rem;font-weight:600;color:#0f2b33;background:#f2fafb;border-radius:8px;padding:6px 12px;margin:12px 0 2px;}'
    + '.tz-dhead__rel{color:#0F6E56;font-weight:600;font-size:0.78rem;}'
    /* ── S3: chip sugestii pacjenta z bazy ── */
    + '.tz-sugg{display:flex;align-items:center;gap:9px;border:0.5px solid #5DCAA5;background:#F0FAF7;border-radius:10px;padding:8px 12px;margin:0 0 8px;}'
    + '.tz-sugg[data-select-pid]{cursor:pointer;}'
    + '.tz-sugg[data-select-pid]:hover{background:#e6f5f6;}'
    + '.tz-sugg.is-sel{background:#e6f5f6;border-color:#0F6E56;box-shadow:inset 0 0 0 1px #0F6E56;}'
    + '.tz-sugg__name{font-weight:600;color:#0f2b33;font-size:0.9rem;}'
    + '.tz-sugg__sub{font-size:0.74rem;color:#5b6672;}'
    + '.tz-sugg__sp{flex:1;}'
    /* ── S3: oś czasu pacjenta ── */
    + '.tz-tlhead{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;}'
    + '.tz-tlhead__name{font-weight:600;color:#0f2b33;font-size:0.98rem;flex:1;min-width:0;}'
    + '.tz-tl{margin-left:6px;padding-left:18px;border-left:2px solid #9FE1CB;}'
    + '.tz-tl__item{position:relative;padding:0 0 14px;cursor:pointer;}'
    + '.tz-tl__item:hover .tz-tl__title{color:#00606a;}'
    + '.tz-tl__dot{position:absolute;left:-23.5px;top:4px;width:9px;height:9px;border-radius:50%;background:#00838d;}'
    + '.tz-tl__dot.tz-cat-treatment{background:#7c5cd6;}.tz-tl__dot.tz-cat-observation{background:#0ea5e9;}.tz-tl__dot.tz-cat-wynik{background:#b45309;}'
    + '.tz-tl__dot.tz-cat-uni{background:#534AB7;}.tz-tl__dot.tz-cat-duty{background:#A32D2D;}.tz-tl__dot.tz-cat-clinic{background:#D85A30;}.tz-tl__dot.tz-cat-act{background:#5F5E5A;}'
    + '.tz-tl__dot.is-done-dot{background:#9aa8aa;}'
    + '.tz-tl__meta{font-size:0.75rem;color:#5b6672;}'
    + '.tz-tl__title{font-size:0.92rem;color:var(--cat-c,#0f2b33);margin-top:1px;}'
    + '.tz-tl__title.is-done{text-decoration:line-through;opacity:0.6;}'
    + '.tz-tl__today{position:relative;padding:2px 0 14px;}'
    + '.tz-tl__today span{position:absolute;left:-34px;top:0;background:#0F6E56;color:#fff;font-size:0.62rem;font-weight:700;border-radius:8px;padding:2px 8px;letter-spacing:0.04em;}'
    + '.tz-switch{display:flex;border:0.5px solid #d7e9ec;border-radius:10px;overflow:hidden;}'
    + '.tz-switch button{border:0;background:#fff;padding:8px 14px;font-size:0.85rem;color:#5b6672;cursor:pointer;font-weight:600;}'
    + '.tz-switch button.is-active{background:#00838d;color:#fff;}'
    + '.tz-switch button:not(.is-active):hover{background:#f2fafb;}'
    + '.tz-overdue{background:#fff7ed;border:1px solid #fdba74;border-radius:12px;padding:10px 14px;margin:0 0 14px;}'
    + '.tz-overdue__head{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;font-weight:600;color:#9a3412;}'
    + '.tz-overdue__list{margin:8px 0 0;display:none;}'
    + '.tz-overdue.is-open .tz-overdue__list{display:block;}'
    + '.tz-grid{background:#fff;border:0.5px solid #d7e9ec;border-radius:14px;overflow:hidden;}'
    + '.tz-grid__head{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));background:#f2fafb;border-bottom:1px solid #b9d2d6;}'
    + '.tz-grid__head div{padding:8px 6px;text-align:center;font-size:0.75rem;font-weight:600;color:#5b6672;text-transform:uppercase;letter-spacing:0.04em;}'
    + '.tz-grid__head div.is-wknd{background:#DEE7F1;color:#0C447C;}'
    + '.tz-grid__body{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));}'
    + '.tz-cell{height:92px;box-sizing:border-box;display:flex;flex-direction:column;align-items:flex-start;border-bottom:1px solid #c9dde0;border-right:1px solid #c9dde0;padding:6px 6px 15px;cursor:pointer;position:relative;background:#fff;transition:background .12s;}'
    + '.tz-cell__chips{flex:1 1 auto;min-height:0;overflow:hidden;align-self:stretch;}'
    + '.tz-cell:nth-child(7n){border-right:0;}'
    + '.tz-cell:hover{background:#f7fcfd;}'
    + '.tz-cell.is-other{background:#fafcfc;color:#9aa8aa;}'
    + '.tz-cell.is-selected{background:#F5FBFB;box-shadow:inset 0 0 0 2px #00838d;border-radius:8px;}'
    + '.tz-cell__num{font-size:0.82rem;font-weight:600;color:#0f2b33;display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;border-radius:12px;}'
    + '.tz-cell.is-other .tz-cell__num{color:#9aa8aa;}'
    + '.tz-cell.is-today .tz-cell__num{background:#00838d;color:#fff;}'
    + '.tz-chip{display:block;margin-top:3px;font-size:0.7rem;line-height:1.25;padding:2px 6px;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#085041;background:#E1F5EE;border-left:3px solid #0F6E56;}'
    + '.tz-chip.is-done{background:#f0f3f4;border-left-color:#9aa8aa;color:#9aa8aa;text-decoration:line-through;}'
    + '.tz-chip.tz-cat-treatment{border-left-color:#7c5cd6;background:#EEEDFE;color:#3C3489;}'
    + '.tz-chip.tz-cat-observation{border-left-color:#0ea5e9;background:#E6F1FB;color:#0C447C;}'
    + '.tz-chip.tz-cat-wynik{border-left-color:#b45309;background:#FAEEDA;color:#633806;}'
    + '.tz-chip.tz-cat-uni{border-left-color:#534AB7;background:#EEEDFE;color:#26215C;}'
    + '.tz-chip.tz-cat-duty{border-left-color:#A32D2D;background:#FCEBEB;color:#791F1F;}'
    + '.tz-chip.tz-cat-clinic{border-left-color:#D85A30;background:#FAECE7;color:#712B13;}'
    + '.tz-chip.tz-cat-act{border-left-color:#5F5E5A;background:#F1EFE8;color:#2C2C2A;}'
    + '.tz-chip--more{background:transparent;border-left:0;color:#5b6672;font-weight:600;}'
    + '.tz-day-panel{margin-top:14px;background:#fff;border:0.5px solid #d7e9ec;border-radius:14px;padding:14px 16px;}'
    + '.tz-day-panel h2{margin:0 0 10px;font-size:1.02rem;color:#0f2b33;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}'
    + '.tz-day-panel h2 button{border:0.5px solid #d7e9ec;background:#fff;border-radius:8px;padding:4px 10px;font-size:0.76rem;cursor:pointer;color:#00838d;font-weight:600;}'
    + '.tz-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:0.5px solid #eef4f5;}'
    + '.tz-row:last-child{border-bottom:0;}'
    + '.tz-row.is-done .tz-row__title{ text-decoration:line-through;opacity:0.6;}'
    + '.tz-row.is-overdue{background:#fff7ed;border-radius:10px;padding:9px 10px;border-bottom:0;margin-bottom:5px;}'
    + '.tz-row__main{min-width:0;flex:1 1 auto;}'
    + '.tz-row__patient{font-weight:600;color:var(--cat-c,#00838d);font-size:0.88rem;}'
    + '.tz-row__title{color:#0f2b33;font-size:0.92rem;margin-top:1px;word-break:break-word;}'
    + '.tz-row__meta{font-size:0.75rem;color:#5b6672;margin-top:2px;}'
    + '.tz-badge{display:inline-block;font-size:0.68rem;font-weight:600;padding:1px 7px;border-radius:8px;background:var(--cat-bg,#eef6f7);color:var(--cat-c,#00606a);margin-right:6px;}'
    + '.tz-badge--time{background:#0F6E56 !important;color:#fff !important;}'
    + '.tz-actions{display:flex;gap:6px;flex:0 0 auto;flex-wrap:wrap;justify-content:flex-end;}'
    + '.tz-actions button{border:0.5px solid #d7e9ec;background:#fff;border-radius:8px;padding:5px 9px;font-size:0.78rem;cursor:pointer;color:#0f2b33;}'
    + '.tz-actions button:hover{background:#f2fafb;}'
    + '.tz-actions .tz-done-btn{border-color:#00838d;color:#00838d;font-weight:600;}'
    + '.tz-empty{color:#5b6672;font-size:0.88rem;padding:6px 0;}'
    + '.tz-postpone-menu{position:absolute;z-index:50;background:#fff;border:0.5px solid #d7e9ec;border-radius:10px;box-shadow:0 8px 28px rgba(0,60,80,0.18);padding:4px;}'
    + '.tz-postpone-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:7px 12px;border-radius:7px;cursor:pointer;font-size:0.85rem;color:#0f2b33;}'
    + '.tz-postpone-menu button:hover{background:#f2fafb;}'
    /* L1: kompaktowy wiersz mobile — pigułka godziny + jedna linia kto—co. */
    + '.tz-row--c{align-items:center;gap:8px;padding:8px 2px;}'
    + '.tz-time-pill{display:inline-flex;align-items:center;justify-content:center;min-width:48px;'
    + 'font-size:0.74rem;font-weight:700;color:#fff;background:#0F6E56;border-radius:7px;padding:3px 7px;flex:0 0 auto;}'
    + '.tz-time-pill.is-all{background:var(--cat-bg,#eef4f5);color:var(--cat-c,#5b6672);font-size:0.58rem;line-height:1.12;font-weight:600;padding:3px 6px;text-transform:none;}'
    + '.tz-time-pill.is-done-pill{background:#c6d4d6;color:#fff;}'
    + '.tz-row--c .tz-row__line{display:flex;align-items:baseline;gap:5px;min-width:0;white-space:nowrap;overflow:hidden;}'
    + '.tz-row--c .tz-row__patient{font-size:0.88rem;flex:0 1 auto;overflow:hidden;text-overflow:ellipsis;}'
    + '.tz-row__title-in{font-size:0.82rem;color:#5b6672;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;}'
    + '.tz-row__title-in.is-done-tt{text-decoration:line-through;opacity:0.6;}'
    + '.tz-row--c .tz-row__meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px;}'
    + '.tz-mini{font-size:0.66rem;background:var(--cat-bg,#eef4f5);color:var(--cat-c,#5b6672);border-radius:5px;padding:1px 6px;}'
    /* KOLOR PER KATEGORIA (2026-06-06): nazwa+chip dziedziczą --cat-c/--cat-bg */
    + '.tz-cat-followup{--cat-c:#0F6E56;--cat-bg:#E1F5EE;}'
    + '.tz-cat-observation{--cat-c:#0C447C;--cat-bg:#E6F1FB;}'
    + '.tz-cat-treatment{--cat-c:#3C3489;--cat-bg:#EEEDFE;}'
    + '.tz-cat-wynik{--cat-c:#633806;--cat-bg:#FAEEDA;}'
    + '.tz-cat-uni{--cat-c:#3C3489;--cat-bg:#EEEDFE;}'
    + '.tz-cat-clinic{--cat-c:#712B13;--cat-bg:#FAECE7;}'
    + '.tz-cat-duty{--cat-c:#A32D2D;--cat-bg:#FCEBEB;}'
    + '.tz-cat-act{--cat-c:#2C2C2A;--cat-bg:#F1EFE8;}'
    /* DESKTOP-OŚ: siatka tygodnia 7×sloty + pas „Cały dzień". */
    + '.tz-wx{background:#fff;border:0.5px solid #d7e9ec;border-radius:14px;overflow:hidden;}'
    + '.tz-wx__row{display:grid;grid-template-columns:56px repeat(7,minmax(0,1fr));border-top:1px solid #e2edef;}'
    + '.tz-wx__row.is-full-hour{border-top:1px solid #c9dde0;}'
    + '.tz-wx__head{border-top:0;background:#f2fafb;border-bottom:1px solid #b9d2d6;}'
    + '.tz-wx__hh{text-align:right;padding:7px 8px 0 0;font-size:0.78rem;color:#46606a;font-weight:600;}'
    + '.tz-wx__hh.is-half{font-size:0.7rem;color:#8aa3aa;font-weight:400;}'
    + '.tz-wx__dh{padding:7px 6px;text-align:center;font-size:0.75rem;font-weight:600;color:#5b6672;cursor:pointer;border-left:0.5px solid #e7f1f3;}'
    + '.tz-wx__dh:hover{background:#e9f5f6;}'
    + '.tz-wx__dh .tz-wcol__num{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:11px;margin-left:3px;}'
    + '.tz-wx__dh.is-today .tz-wcol__num{background:#00838d;color:#fff;}'
    + '.tz-wx__dh.is-holiday .tz-wcol__num{color:#A32D2D;}'
    + '.tz-wx__dh.is-today.is-holiday .tz-wcol__num{color:#fff;}'
    + '.tz-wx__all{background:#fbfdfe;}'
    + '.tz-wx__bodyrel{position:relative;}'
    + '.tz-wx__bodyrel .tz-wx__row{height:60px;box-sizing:border-box;}'
    + '.tz-wx__cell{border-left:1px solid #d6e6e9;}'
    + '.tz-wx__cell.is-wknd,.tz-wb-free.is-wknd{background:#EDF2F8;}'
    + '.tz-wx__cell.is-duty,.tz-wb-free.is-duty{background:#FCEBEB;}'
    + '.tz-wx__dh.is-wknd{background:#DEE7F1;color:#0C447C;}'
    + '.tz-wx__dh.is-holiday{background:#FCEBEB;color:#A32D2D;}'
    + '.tz-wx__dh.is-today{background:#E6F5F6;color:#00606a;font-weight:600;}'
    + '.tz-wx__dh.is-duty{background:#FCEBEB;color:#A32D2D;}'
    + '.tz-cell.is-wknd{background:#EDF2F8;}'
    + '.tz-cell.is-duty{background:#FCEBEB;}'
    + '.tz-cell.is-duty.is-other{background:#FBEFEF;}'
    + '.tz-cell.is-wknd.is-other{background:#F3F6FA;}'
    + '.tz-wx__cell--all{cursor:pointer;min-height:34px;padding:3px;display:flex;flex-direction:column;gap:3px;}'
    + '.tz-wb{font-size:0.7rem;color:#085041;background:#E1F5EE;border-left:3px solid #0F6E56;'
    + 'border-radius:0 6px 6px 0;padding:5px 8px;overflow:hidden;cursor:pointer;}'
    + '.tz-wb b{display:block;font-weight:600;font-size:0.68rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.tz-wb i{display:block;font-style:normal;font-weight:700;font-size:0.78rem;color:#04342C;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.tz-wb.tz-cat-treatment i{color:#26215C;}.tz-wb.tz-cat-observation i{color:#042C53;}.tz-wb.tz-cat-wynik i{color:#412402;}'
    + '.tz-wb.tz-cat-uni i{color:#26215C;}.tz-wb.tz-cat-duty i{color:#A32D2D;}.tz-wb.tz-cat-clinic i{color:#4A1B0C;}.tz-wb.tz-cat-act i{color:#2C2C2A;}'
    + '.tz-chip.tz-cat-duty{color:#A32D2D;}'
    + '.tz-wb.is-done i{color:#9aa8aa;}'
    + '.tz-wb:hover{filter:brightness(0.96);}'
    + '.tz-wb.tz-cat-treatment{border-left-color:#7c5cd6;background:#EEEDFE;color:#3C3489;}'
    + '.tz-wb.tz-cat-observation{border-left-color:#0ea5e9;background:#E6F1FB;color:#0C447C;}'
    + '.tz-wb.tz-cat-wynik{border-left-color:#b45309;background:#FAEEDA;color:#633806;}'
    + '.tz-wb.tz-cat-uni{border-left-color:#534AB7;background:#EEEDFE;color:#3C3489;}'
    + '.tz-wb.tz-cat-duty{border-left-color:#A32D2D;background:#FCEBEB;color:#791F1F;}'
    + '.tz-wb.tz-cat-clinic{border-left-color:#D85A30;background:#FAECE7;color:#712B13;}'
    + '.tz-wb.tz-cat-act{border-left-color:#5F5E5A;background:#F1EFE8;color:#2C2C2A;}'
    + '.tz-wb.is-done{background:#f0f3f4;border-left-color:#9aa8aa;color:#9aa8aa;text-decoration:line-through;}'
    + '.tz-wb-free{background:transparent;border:0;border-left:1px solid #d6e6e9;cursor:pointer;padding:0;}'
    + '.tz-wb-free:hover{background:#f2fafb;}'
    + '.tz-wb-free.is-wknd:hover{background:#E2EAF4;}'
    + '.tz-wx .tz-wb,.tz-wx .tz-wb *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}'
    + '.tz-wb.is-drag-src{opacity:0.35;}'
    + '.tz-wb--ghost{cursor:grabbing;}'
    + '.tz-wx__dropind{position:absolute;z-index:3;border:2px dashed #00838d;border-radius:6px;'
    + 'background:rgba(0,131,141,0.10);pointer-events:none;box-sizing:border-box;}'
    + '.tz-wx__dropind span{position:absolute;top:1px;left:4px;font-size:0.66rem;font-weight:700;'
    + 'color:#00606a;background:#fff;border-radius:4px;padding:0 4px;}'
    + '.tz-wx__cell--all.is-drop{background:#d9f1f3;box-shadow:inset 0 0 0 2px #00838d;}'
    + '.tz-day-panel .tz-hcard,.tz-day-panel .tz-hcard *,.tz-day-panel .tz-row,.tz-day-panel .tz-row *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}'
    + '.tz-noselect,.tz-noselect *{-webkit-user-select:none !important;user-select:none !important;-webkit-touch-callout:none !important;}'
    + '.tz-hcard.is-drag-src{opacity:0.35;}'
    + '.tz-hslot.is-drop-row{background:#e6f6f7;box-shadow:inset 0 0 0 2px #00838d;border-radius:8px;}'
    + '.tz-dropall{border:2px dashed #00838d;border-radius:10px;background:rgba(0,131,141,0.08);'
    + 'color:#00606a;font-size:0.78rem;font-weight:600;text-align:center;padding:10px 8px;margin:0 0 8px;}'
    + '.tz-dropall.is-drop{background:#d9f1f3;}'
    + '.tz-hbubble{position:fixed;z-index:1000003;background:#04342C;color:#fff;font-size:0.78rem;'
    + 'font-weight:700;border-radius:7px;padding:3px 8px;pointer-events:none;transform:translate(-100%,-50%);}'
    + '.tz-wb--ov{position:absolute;z-index:2;box-sizing:border-box;margin:0;display:flex;flex-direction:column;justify-content:center;box-shadow:0 1px 3px rgba(0,40,48,0.14);}'
    + '.tz-wb--ov.is-min{padding:1px 6px;}'
    /* NAKŁADKI V1: długie wydarzenie jako TŁO kolumny (etykieta u góry). */
    + '.tz-wb--band{position:absolute;z-index:1;box-sizing:border-box;margin:0;display:flex;flex-direction:column;justify-content:flex-start;padding:3px 8px;opacity:0.78;}'
    /* POPOVER V1: karta szczegółów bloku tygodnia (treść + akcje 2×2). */
    + '.tz-pop{position:absolute;z-index:1000001;width:262px;background:#fff;border:0.5px solid #cfe3e6;'
    + 'border-radius:12px;box-shadow:0 14px 36px rgba(0,40,48,0.2);overflow:hidden;}'
    + '.tz-pop__head{padding:11px 13px 9px;border-bottom:0.5px solid #e7f1f3;}'
    + '.tz-pop__nm{font-size:0.95rem;font-weight:700;color:var(--cat-c,#0F6E56);}'
    + '.tz-pop__sub{font-size:0.72rem;color:#5b6672;margin-top:2px;}'
    + '.tz-pop__ttl{font-size:0.82rem;color:#0f2b33;margin-top:4px;}'
    + '.tz-pop__body{padding:9px 13px;font-size:0.82rem;line-height:1.45;color:#0f2b33;background:#FBFDFE;'
    + 'border-bottom:0.5px solid #e7f1f3;max-height:120px;overflow-y:auto;white-space:pre-wrap;}'
    + '.tz-pop__grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:10px;}'
    /* DESKTOP-OŚ: szerokie karty dnia (jedna linia + pełne akcje). */
    + '.tz-hcard--wide{gap:12px;padding:9px 12px;}'
    + '.tz-hcard--wide .tz-hcard__nm{flex:0 0 auto;font-size:0.92rem;}'
    + '.tz-hcard--wide .tz-hcard__tt{flex:1 1 auto;}'
    + '.tz-hcard--wide .tz-actions{flex:0 0 auto;}'
    /* L2: oś godzinowa dnia (sloty 30 min) — wolne okna kreskowane, klikalne. */
    + '.tz-hours{margin-top:4px;}'
    + '.tz-hslot{display:flex;align-items:flex-start;gap:8px;padding:2px 0;}'
    + '.tz-hh{width:44px;flex:0 0 auto;text-align:right;font-size:0.72rem;color:#9aa8aa;padding-top:7px;}'
    + '.tz-hfree{flex:1;height:26px;border:0;background:transparent;border-top:1px dashed #d7e9ec;margin-top:12px;cursor:pointer;padding:0;}'
    + '.tz-hcards{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;}'
    /* PLAN DNIA — proporcjonalna oś (desktop): stałe rzędy + warstwa absolutna. */
    + '.tz-dxrel{position:relative;}'
    + '.tz-hslot--grid{height:60px;box-sizing:border-box;border-top:1px dashed #d7e9ec;padding:0;gap:8px;}'
    + '.tz-hslot--grid.is-full{border-top:1px solid #c9dde0;}'
    + '.tz-hslot--grid .tz-hh{padding-top:4px;}'
    + '.tz-hslot--grid .tz-hfree{height:100%;margin-top:0;border-top:0;border-left:1px solid #e2edef;}'
    + '.tz-hcard--abs{position:absolute;z-index:2;box-sizing:border-box;overflow:hidden;align-items:flex-start;padding-top:6px;box-shadow:0 1px 3px rgba(0,40,48,0.14);}'
    + '.tz-hcard--band{z-index:1;opacity:0.8;}'
    + '.tz-hcard{display:flex;align-items:center;gap:8px;background:#f2fafb;border-left:3px solid #00838d;'
    + 'border-radius:0 9px 9px 0;padding:7px 9px;}'
    + '.tz-hcard.tz-cat-treatment{border-left-color:#7c5cd6;}.tz-hcard.tz-cat-observation{border-left-color:#0ea5e9;}.tz-hcard.tz-cat-wynik{border-left-color:#b45309;}'
    + '.tz-hcard.tz-cat-uni{border-left-color:#534AB7;}.tz-hcard.tz-cat-duty{border-left-color:#A32D2D;}.tz-hcard.tz-cat-clinic{border-left-color:#D85A30;}.tz-hcard.tz-cat-act{border-left-color:#5F5E5A;}'
    + '.tz-hcard.is-done{opacity:0.55;}'
    + '.tz-hcard.is-done .tz-hcard__tt{text-decoration:line-through;}'
    + '.tz-hcard__main{flex:1;min-width:0;}'
    + '.tz-hcard__nm{font-size:0.86rem;font-weight:600;color:var(--cat-c,#0f2b33);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.tz-hcard__tt{font-size:0.76rem;color:#5b6672;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    /* KROK 2: swipe-to-delete — wrap z czerwonym tłem + toast COFNIJ. */
    + '.tz-swipe-wrap{position:relative;overflow:hidden;}'
    + '.tz-swipe-bg{position:absolute;inset:0;display:none;align-items:center;justify-content:flex-end;'
    + 'padding-right:20px;background:#A32D2D;color:#fff;font-weight:600;font-size:0.9rem;border-radius:10px;cursor:pointer;}'
    + '.tz-swipe-wrap.is-swiping .tz-swipe-bg,.tz-swipe-wrap.is-open-swipe .tz-swipe-bg{display:flex;}'
    + '.tz-swipe-wrap .tz-row{position:relative;background:#fff;transition:transform .22s ease;touch-action:pan-y;}'
    + '.tz-swipe-wrap.is-swiping .tz-row{transition:none;}'
    + '.tz-swipe-wrap.is-removing{max-height:0 !important;opacity:0;transition:max-height .25s ease,opacity .2s ease;}'
    + '.tz-undo-toast{position:fixed;left:50%;transform:translateX(-50%);'
    + 'bottom:calc(env(safe-area-inset-bottom,0px) + 16px);background:#0f2b33;color:#fff;border-radius:12px;'
    + 'padding:10px 16px;display:flex;gap:16px;align-items:center;z-index:1000002;font-size:0.9rem;'
    + 'box-shadow:0 8px 24px rgba(0,0,0,0.3);white-space:nowrap;}'
    + 'body.has-mobile-bottom-dock-visible .tz-undo-toast{bottom:var(--mobile-dock-pinned-scroll-top-bottom,calc(env(safe-area-inset-bottom,0px) + 96px));}'
    + '.liquid-ios26 .tz-undo-toast button{background:transparent !important;border:0 !important;color:#5DCAA5 !important;'
    + 'font-weight:700 !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;'
    + 'padding:4px 6px !important;font-size:0.9rem !important;letter-spacing:0.03em;cursor:pointer;}'
    /* KROK 1: usuwanie — czerwona pozycja menu ⋮ i przycisk 🗑 w akcjach. */
    + '.tz-postpone-menu button.tz-menu-del{color:#A32D2D;font-weight:600;border-top:0.5px solid #f3dcdc;margin-top:2px;}'
    + '.tz-postpone-menu button.tz-menu-del.is-armed{background:#A32D2D;color:#fff;}'
    + '.tz-actions .tz-del-btn{color:#A32D2D;border-color:#ecc8c8;}'
    + '.tz-actions .tz-del-btn.is-armed{background:#A32D2D;color:#fff;border-color:#A32D2D;font-weight:600;}'
    /* ── Cykl C: tydzień W1 (siatka 7 kolumn — desktop/tablet) ── */
    + '.tz-week{background:#fff;border:0.5px solid #d7e9ec;border-radius:14px;overflow:hidden;display:grid;grid-template-columns:repeat(7,1fr);}'
    + '.tz-wcol{border-right:0.5px solid #e7f1f3;min-height:170px;display:flex;flex-direction:column;}'
    + '.tz-wcol:last-child{border-right:0;}'
    + '.tz-wcol__head{padding:8px 6px;text-align:center;font-size:0.75rem;font-weight:600;color:#5b6672;background:#f2fafb;border-bottom:0.5px solid #d7e9ec;cursor:pointer;}'
    + '.tz-wcol__head .tz-wcol__num{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:11px;color:#0f2b33;font-size:0.82rem;margin-left:3px;}'
    + '.tz-wcol.is-today .tz-wcol__num{background:#00838d;color:#fff;}'
    + '.tz-wcol__body{padding:5px;display:flex;flex-direction:column;gap:3px;flex:1;cursor:pointer;}'
    + '.tz-wcol__body:hover{background:#f7fcfd;}'
    + '.tz-wcol .tz-chip{white-space:normal;}'
    /* ── Cykl C: tydzień W2 (agenda pionowa — mobile) ── */
    + '.tz-agenda{background:#fff;border:0.5px solid #d7e9ec;border-radius:14px;padding:6px 14px;}'
    + '.tz-agenda__dayh{display:flex;align-items:center;gap:8px;padding:10px 0 2px;font-size:0.85rem;font-weight:600;color:#0f2b33;}'
    + '.tz-agenda__dayh .tz-badge--today{background:#00838d;color:#fff;border-radius:999px;padding:2px 9px;font-size:0.72rem;}'
    + '.tz-agenda__empty{font-size:0.78rem;color:#9aa8aa;padding:7px 0;border-bottom:0.5px solid #f3f8f9;}'
    + '.tz-agenda__empty:last-child{border-bottom:0;}'
    /* ── Cykl C: dzień D1 (checklista — mobile) ── */
    + '.tz-sec-h{font-size:0.8rem;font-weight:600;color:#5b6672;margin:14px 0 4px;}'
    + '.tz-sec-h.is-overdue{color:#9a3412;}'
    + '.tz-sec-h.is-done{color:#9aa8aa;}'
    /* ── Cykl C: dzień D2 (karty per pacjent — desktop/tablet) ── */
    + '.tz-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;align-items:start;}'
    + '.tz-card{background:#fff;border:0.5px solid #d7e9ec;border-radius:12px;padding:12px;}'
    + '.tz-card.is-overdue{background:#fff7ed;border-color:#fdba74;}'
    + '.tz-card__head{display:flex;align-items:center;gap:10px;margin-bottom:4px;}'
    + '.tz-card__ava{width:34px;height:34px;border-radius:50%;background:#e6f5f6;color:#00606a;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:0.82rem;flex:0 0 auto;}'
    + '.tz-card.is-overdue .tz-card__ava{background:#fdba74;color:#7c2d12;}'
    + '.tz-card__name{font-weight:600;color:#0f2b33;font-size:0.92rem;min-width:0;flex:1;}'
    + '.tz-card__sub{font-size:0.72rem;color:#9a3412;font-weight:600;}'
    + '.tz-card__open{border:0.5px solid #d7e9ec;background:#fff;border-radius:8px;padding:4px 10px;font-size:0.74rem;cursor:pointer;color:#00838d;font-weight:600;flex:0 0 auto;}'
    + '.tz-card__open:hover{background:#f2fafb;}'
    + '.tz-card .tz-row{padding:7px 0;}'
    /* ── Cykl D: dodawanie terminów (przycisk, FAB, plusy, modal) ── */
    + '.tz-add-btn{font-weight:600;}'
    + '.tz-fab{display:none;}'
    + '.tz-cell__add{position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:6px;display:none;align-items:center;justify-content:center;font-size:1rem;line-height:1;cursor:pointer;padding:0;}'
    + '.tz-cell:hover .tz-cell__add{display:flex;}'
    + '.tz-wcol__add{margin-left:5px;width:20px;height:20px;border-radius:6px;display:none;align-items:center;justify-content:center;font-size:0.95rem;line-height:1;cursor:pointer;padding:0;vertical-align:middle;}'
    + '.tz-wcol:hover .tz-wcol__add{display:inline-flex;}'
    + '.tz-agenda__add{margin-left:auto;width:24px;height:24px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;font-size:1rem;line-height:1;cursor:pointer;padding:0;flex:0 0 auto;}'
    + '.tz-agenda__empty{display:flex;align-items:center;gap:8px;}'
    + '.tz-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000001;padding:20px;box-sizing:border-box;}'
    + '.tz-modal{background:#fff;border-radius:14px;padding:18px 20px;max-width:420px;width:100%;max-height:90vh;overflow-y:auto;display:flex;flex-direction:column;gap:10px;box-sizing:border-box;}'
    + '.tz-modal h3{margin:0;font-size:1.05rem;font-weight:600;color:#0f2b33;}'
    /* W1 grouped-inset: szare tło arkusza, sekcje-karty, pola wpuszczone. */
    + '.tz-modal{background:#eef4f6;}'
    + '.tz-card-sec{background:#fff;border:0.5px solid #cfe3e6;border-radius:12px;padding:12px;box-shadow:0 1px 2px rgba(0,40,48,0.05);}'
    + '.tz-sec-lbl{margin:0 0 8px;font-size:0.72rem;font-weight:700;letter-spacing:0.05em;color:#00838d;text-transform:uppercase;}'
    + '.tz-nt-dur{margin-top:8px;display:inline-flex;align-items:center;gap:6px;font-size:0.78rem;font-weight:600;color:#085041;background:#E1F5EE;border-radius:8px;padding:4px 10px;}'
    + '.tz-nt-mode{display:flex;gap:4px;background:#EDF3F4;border-radius:10px;padding:3px;margin:0 0 12px;}'
    + '.tz-nt-mode button{flex:1;border:0;background:transparent;border-radius:8px;padding:9px 0;font-size:0.92rem;font-weight:600;color:#5b6672;cursor:pointer;}'
    + '.tz-nt-mode button.is-on{background:#0F6E56;color:#fff;}'
    + '.tz-nt-durrow{display:flex;align-items:center;gap:8px;font-size:0.85rem;color:#46606a;}'
    + '.tz-nt-durrow label{font-weight:600;}'
    + '.tz-nt-durrow input{width:108px;}'
    + '.tz-nt-allday{margin-left:auto;border:0.5px solid #cfe3e6;background:#fff;border-radius:8px;padding:6px 10px;font-size:0.82rem;color:#33464e;cursor:pointer;}'
    + '.tz-nt-allday.is-on{background:#0F6E56;color:#fff;border-color:#0F6E56;}'
    + '.tz-rep-days{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;}'
    + '.tz-rep-days button{width:34px;height:34px;border-radius:50%;border:0.5px solid #cfe3e6;background:#fff;font-size:0.8rem;color:#33464e;cursor:pointer;padding:0;}'
    + '.tz-rep-days button.is-on{background:#0F6E56;color:#fff;border-color:#0F6E56;font-weight:600;}'
    + '.tz-rep-endrow{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}'
    + '.tz-rep-tog{display:flex;align-items:center;gap:8px;font-size:0.85rem;color:#33464e;margin-top:8px;}'
    + '.tz-rep-tog input{width:18px;height:18px;flex:0 0 auto;}'
    + '.tz-rep-sum{margin-top:10px;background:#E1F5EE;border-radius:9px;padding:8px 10px;font-size:0.78rem;color:#04342C;line-height:1.5;}'
    + '.tz-pop__series{display:flex;flex-direction:column;gap:6px;padding:0 10px 10px;}'
    + '.tz-pop__series button{border:0.5px solid #ecc8c8;background:#fff;border-radius:9px;padding:8px 6px;font-size:0.8rem;font-weight:600;color:#A32D2D;cursor:pointer;}'
    + '.tz-pop__series button.is-armed{background:#A32D2D;color:#fff;border-color:#A32D2D;}'
    + '#tzNtTime{flex:0 0 112px;text-align:center;font-weight:600;}'
    + '.tz-nt-daterow input[type="date"]{flex:1 1 auto;}'
    + '.tz-modal__head{display:flex;align-items:center;justify-content:space-between;gap:10px;}'
    + '.tz-head-cancel,.tz-head-save{display:none;}'
    + '.tz-modal__footnote{text-align:center;}'
    + '.tz-modal label{display:block;font-size:0.78rem;color:#5b6672;margin-bottom:4px;font-weight:500;}'
    + '.tz-modal input[type="text"],.tz-modal input[type="date"],.tz-modal input[type="time"]{width:100%;height:38px;padding:0 10px;font-size:0.92rem;border:0.5px solid #d7e9ec;border-radius:8px;background:#f2fafb;color:#0f2b33;box-sizing:border-box;}'
    /* Combobox pacjenta: lista NIE jest widoczna od razu i NIE wydłuża modala —
     * dropdown absolute NAD kolejnymi polami (z-index), pokazywany po fokusie. */
    + '.tz-nt-combo{position:relative;}'
    + '.tz-nt-list{display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:40;'
    + 'background:#fff;border:0.5px solid #d7e9ec;border-radius:8px;max-height:158px;overflow-y:auto;'
    + 'box-shadow:0 10px 30px rgba(0,60,80,0.18);}'
    + '.tz-nt-list.is-open{display:block;}'
    + '.tz-nt-item{padding:7px 10px;font-size:0.88rem;cursor:pointer;color:#0f2b33;}'
    + '.tz-nt-item:hover{background:#f2fafb;}'
    + '.tz-nt-item.is-sel{background:#e6f5f6;color:#00606a;font-weight:600;}'
    + '.tz-nt-empty{padding:8px 10px;font-size:0.8rem;color:#9aa8aa;}'
    + '.tz-nt-ext{margin-top:5px;font-size:0.78rem;color:#00606a;background:#e6f5f6;border-radius:7px;padding:5px 9px;}'
    + '.tz-ntcats{display:flex;gap:6px;flex-wrap:wrap;}'
    + '.tz-nt-daterow{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}'
    + '.tz-nt-daterow input[type="date"]{width:auto;flex:0 0 auto;}'
    + '.tz-modal__err{color:#A32D2D;font-size:0.8rem;line-height:1.4;display:none;}'
    + '.tz-modal__actions{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:4px;}'
    /* ── Rozcięcie R1: panel dnia wrośnięty w siatkę (dwuklik, desktop) ── */
    + '.tz-split{grid-column:1 / -1;background:#fff;border-top:0.5px solid #bfdfe3;border-bottom:0.5px solid #e7f1f3;'
    + 'overflow:hidden;max-height:0;opacity:0;transition:max-height .3s ease,opacity .25s ease;}'
    + '.tz-split.is-open{max-height:640px;opacity:1;}'
    + '.tz-split__inner{padding:12px 16px 14px;}'
    + '.tz-split__head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:4px;}'
    + '.tz-split__title{font-weight:600;color:#0f2b33;font-size:0.95rem;}'
    + '.tz-split__btns{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}'
    + '.tz-split__btns button{border:0.5px solid #d7e9ec;background:#fff;border-radius:8px;padding:5px 10px;font-size:0.78rem;cursor:pointer;color:#00838d;font-weight:600;}'
    + '.tz-split__btns button:hover{background:#f2fafb;}'
    + '#tzSplitClose{color:#5b6672;font-size:0.95rem;line-height:1;padding:5px 9px;}'
    /* Caret na KOMÓRCE (panel ma overflow:hidden — tu się nie przytnie):
     * biały romb z obwódką, tip w górę, mostek komórka→panel. */
    + '.tz-cell.is-split{background:#e6f5f6;}'
    + '.tz-cell.is-split::after{content:"";position:absolute;left:50%;bottom:-7px;width:12px;height:12px;'
    + 'background:#fff;border-left:0.5px solid #bfdfe3;border-top:0.5px solid #bfdfe3;'
    + 'transform:translateX(-50%) rotate(45deg);z-index:3;}'
    /* ── Święta państwowe: czerwone oznaczenia w trzech widokach ── */
    + '.tz-cell.is-holiday .tz-cell__num{color:#b91c1c;}'
    + '.tz-cell.is-today.is-holiday .tz-cell__num{color:#fff;}'
    + '.tz-cell__holiday{display:block;max-width:100%;font-size:0.62rem;color:#b91c1c;font-weight:600;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.tz-wcol.is-holiday .tz-wcol__num{color:#b91c1c;}'
    + '.tz-wcol.is-today.is-holiday .tz-wcol__num{color:#fff;}'
    + '.tz-wcol__holiday{font-size:0.66rem;color:#b91c1c;font-weight:600;padding:1px 2px 0;line-height:1.15;}'
    + '.tz-holiday-inline{color:#b91c1c;font-weight:600;font-size:0.78rem;}'
    + '.tz-holiday-line{background:#fef2f2;border:0.5px solid #fecaca;color:#991b1b;border-radius:10px;padding:8px 12px;font-size:0.82rem;font-weight:600;margin:0 0 10px;}'
    + '@media (max-width:700px){.tz-cell{height:58px;padding:4px 4px 12px;}.tz-grid .tz-chip{display:none;}.tz-cell__holiday{display:none;}'
    + '.tz-cell__dots{gap:2px;bottom:4px;left:4px;right:4px;}'
    /* M2 (2026-06-05): linia 1 = ‹ tytuł › rozsunięte do KRAWĘDZI (strzałki w
     * stałych punktach, tytuł pełny i wyśrodkowany); linia 2 = Dziś + przełącznik. */
    + '.tz-nav{width:100%;justify-content:space-between;}'
    + '.tz-nav #tzToday{display:none;}'
    + '.tz-nav #tzPrev{order:1;}'
    + '.tz-title{order:2;flex:1 1 auto;text-align:center;font-size:1.05rem;padding:0 6px;}'
    + '.tz-nav #tzNext{order:3;}'
    + '.tz-today-m{display:inline-flex;align-items:center;}'
    + '.tz-topbar__sp{display:none;}'
    + '.tz-switch{flex:1 1 auto;width:auto;}'
    + '.tz-switch button{flex:1 1 0;}}'
    + '.tz-cell__dots{position:absolute;left:6px;right:6px;bottom:5px;display:flex;gap:3px;flex-wrap:nowrap;overflow:hidden;margin:0;}'
    + '.tz-dot{width:7px;height:7px;border-radius:50%;background:#00838d;display:inline-block;}'
    + '.tz-dot.tz-cat-treatment{background:#7c5cd6;}.tz-dot.tz-cat-observation{background:#0ea5e9;}.tz-dot.tz-cat-wynik{background:#b45309;}.tz-dot.is-done{opacity:0.4;}'
    + '.tz-dot.tz-cat-uni{background:#534AB7;}.tz-dot.tz-cat-duty{background:#A32D2D;}.tz-dot.tz-cat-clinic{background:#D85A30;}.tz-dot.tz-cat-act{background:#5F5E5A;}'
    /* ── KONTRA Liquid iOS26 (ios26-v2.css): `.liquid-ios26 button{...!important}`
     * maluje WSZYSTKIE przyciski na szklane kapsułki (bg/border/radius/shadow/
     * backdrop z !important). Wyższa specyficzność + !important przywraca projekt
     * terminarza. Menu „Przełóż" wisi na <body> — stąd osobny selektor bez shell. ── */
    + '.liquid-ios26 .terminarz-shell .tz-nav button,'
    + '.liquid-ios26 .terminarz-shell .tz-today-m,'
    + '.liquid-ios26 .terminarz-shell .tz-actions button,'
    + '.liquid-ios26 .terminarz-shell .tz-card__open,'
    + '.liquid-ios26 .terminarz-shell .tz-day-panel h2 button,'
    + '.liquid-ios26 .tz-postpone-menu button{'
    + 'background:#fff !important;border:0.5px solid #d7e9ec !important;color:#0f2b33 !important;'
    + 'border-radius:10px !important;box-shadow:none !important;'
    /* width/flex: globalne reguły mobile rozciągają <button> na całą linię —
     * to ścisnęło tytuł do „C…”. Przyciski nav mają sztywny rozmiar treści. */
    + 'width:auto !important;flex:0 0 auto !important;'
    + 'backdrop-filter:none !important;-webkit-backdrop-filter:none !important;transition:background-color 120ms ease !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-today-m{padding:8px 14px !important;font-size:0.95rem !important;font-weight:600 !important;cursor:pointer;}'
    /* S3: przycisk „Oś czasu →" + × osi (kontra liquid). */
    + '.liquid-ios26 .terminarz-shell .tz-sugg__btn,'
    + '.liquid-ios26 .terminarz-shell #tzTlClose{'
    + 'background:#fff !important;border:0.5px solid #5DCAA5 !important;color:#085041 !important;'
    + 'border-radius:8px !important;padding:5px 12px !important;font-size:0.8rem !important;font-weight:600 !important;'
    + 'box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;width:auto !important;flex:0 0 auto !important;}'
    + '.liquid-ios26 .terminarz-shell #tzTlClose{border-color:#d7e9ec !important;color:#5b6672 !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-sugg__btn:hover{background:#e6f5f6 !important;}'
    /* SEARCH: lupa (kapsułka jak nav) + × paska + input (theme szkli input[text]). */
    + '.liquid-ios26 .terminarz-shell .tz-search-btn,'
    + '.liquid-ios26 .terminarz-shell .tz-searchbar button{'
    + 'background:#fff !important;border:0.5px solid #d7e9ec !important;color:#0f2b33 !important;'
    + 'border-radius:10px !important;box-shadow:none !important;padding:8px 12px !important;'
    + 'backdrop-filter:none !important;-webkit-backdrop-filter:none !important;width:auto !important;flex:0 0 auto !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-search-btn[data-on="1"]{background:#e6f5f6 !important;border-color:#00838d !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-searchbar input{'
    + 'background:#fff !important;border:0.5px solid #d7e9ec !important;color:#0f2b33 !important;'
    + 'border-radius:10px !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-nav button:hover,'
    + '.liquid-ios26 .terminarz-shell .tz-actions button:hover,'
    + '.liquid-ios26 .terminarz-shell .tz-card__open:hover,'
    + '.liquid-ios26 .tz-postpone-menu button:hover{background:#f2fafb !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-actions button{border-radius:8px !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-actions .tz-done-btn{border-color:#00838d !important;color:#00838d !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-card__open,'
    + '.liquid-ios26 .terminarz-shell .tz-day-panel h2 button{border-radius:8px !important;color:#00838d !important;}'
    + '.liquid-ios26 .tz-postpone-menu button{border:0 !important;border-radius:7px !important;text-align:left !important;}'
    /* POPOVER V1: przyciski 2×2 (kontra kapsułek motywu). */
    + '.liquid-ios26 .tz-pop__grid button{'
    + 'background:#fff !important;border:0.5px solid #d7e9ec !important;color:#0f2b33 !important;'
    + 'border-radius:9px !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;'
    + 'width:auto !important;flex:0 0 auto !important;padding:9px 6px !important;font-size:0.82rem !important;font-weight:600 !important;cursor:pointer;}'
    + '.liquid-ios26 .tz-pop__grid button:hover{background:#f2fafb !important;}'
    + '.liquid-ios26 .tz-pop__grid .tz-pop__done{color:#0F6E56 !important;border-color:#5DCAA5 !important;}'
    + '.liquid-ios26 .tz-pop__grid .tz-pop__del{color:#A32D2D !important;border-color:#ecc8c8 !important;}'
    + '.liquid-ios26 .tz-pop__grid .tz-pop__del.is-armed{background:#A32D2D !important;color:#fff !important;border-color:#A32D2D !important;}'
    /* DESKTOP-OŚ: wolna komórka siatki tygodnia — przezroczysta (kontra motywu). */
    + '.liquid-ios26 .terminarz-shell .tz-wb-free{'
    + 'background:transparent !important;border:0 !important;border-left:1px solid #d6e6e9 !important;'
    + 'border-radius:0 !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;'
    + 'width:auto !important;padding:0 !important;min-height:32px;}'
    + '.liquid-ios26 .terminarz-shell .tz-wb-free:hover{background:#f2fafb !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-wb-free.is-wknd{background:#EDF2F8 !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-wb-free.is-wknd:hover{background:#E2EAF4 !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-wb-free.is-duty{background:#FCEBEB !important;}'
    /* L2: wolny slot osi — przezroczysty, kreskowany (kontra kapsułek motywu). */
    + '.liquid-ios26 .terminarz-shell .tz-hfree{'
    + 'background:transparent !important;border:0 !important;border-top:1px dashed #d7e9ec !important;'
    + 'border-radius:0 !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;'
    + 'width:auto !important;flex:1 1 auto !important;padding:0 !important;}'
    /* KROK 1: czerwień usuwania musi przebić wymuszone color:#0f2b33 z counterów. */
    + '.liquid-ios26 .tz-postpone-menu button.tz-menu-del{color:#A32D2D !important;border-top:0.5px solid #f3dcdc !important;border-radius:0 0 7px 7px !important;}'
    + '.liquid-ios26 .tz-postpone-menu button.tz-menu-del.is-armed{background:#A32D2D !important;color:#fff !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-actions .tz-del-btn{color:#A32D2D !important;border-color:#ecc8c8 !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-actions .tz-del-btn.is-armed{background:#A32D2D !important;color:#fff !important;border-color:#A32D2D !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-switch button{'
    + 'background:#fff !important;border:0 !important;border-radius:0 !important;color:#5b6672 !important;'
    + 'box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-switch button.is-active{background:#00838d !important;color:#fff !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-switch button:not(.is-active):hover{background:#f2fafb !important;}'
    /* ── Cykl D: kontry liquid dla nowych kontrolek (przyciski, FAB, plusy, modal) ── */
    + '.liquid-ios26 .terminarz-shell .tz-add-btn{'
    + 'background:#00838d !important;color:#fff !important;border:0.5px solid #00838d !important;'
    + 'border-radius:10px !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;padding:8px 14px !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-add-btn:hover{background:#006f78 !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-fab{'
    + 'background:#00838d !important;color:#fff !important;border:0 !important;border-radius:50% !important;'
    + 'box-shadow:0 6px 18px rgba(0,96,106,0.35) !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-cell__add,'
    + '.liquid-ios26 .terminarz-shell .tz-wcol__add,'
    + '.liquid-ios26 .terminarz-shell .tz-agenda__add{'
    + 'background:#e6f5f6 !important;color:#00606a !important;border:0.5px solid #bfdfe3 !important;'
    + 'border-radius:6px !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;font-weight:600 !important;}'
    + '.liquid-ios26 .tz-modal button{'
    + 'background:#fff !important;border:0.5px solid #d7e9ec !important;color:#0f2b33 !important;'
    + 'width:auto !important;flex:0 0 auto !important;'
    + 'border-radius:9px !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;padding:8px 14px !important;font-size:0.85rem !important;}'
    + '.liquid-ios26 .tz-modal button:hover{background:#f2fafb !important;}'
    + '.liquid-ios26 .tz-modal .tz-ntcat{border-radius:999px !important;padding:5px 12px !important;color:#5b6672 !important;font-size:0.8rem !important;}'
    + '.liquid-ios26 .tz-modal .tz-ntcat.is-on{background:#e6f5f6 !important;color:#00606a !important;border-color:#5DCAA5 !important;font-weight:600 !important;}'
    + '.liquid-ios26 .tz-modal .tz-nt-save{background:#00838d !important;color:#fff !important;border-color:#00838d !important;font-weight:600 !important;}'
    + '.liquid-ios26 .tz-modal .tz-nt-mode{background:#EDF3F4 !important;border-radius:10px !important;padding:3px !important;}'
    + '.liquid-ios26 .tz-modal .tz-nt-mode button{background:transparent !important;border:0 !important;border-radius:8px !important;color:#5b6672 !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;font-weight:600 !important;}'
    + '.liquid-ios26 .tz-modal .tz-nt-mode button.is-on{background:#0F6E56 !important;color:#fff !important;}'
    + '.liquid-ios26 .tz-modal .tz-nt-allday{background:#fff !important;border:0.5px solid #cfe3e6 !important;border-radius:8px !important;color:#33464e !important;width:auto !important;flex:0 0 auto !important;}'
    + '.liquid-ios26 .tz-modal .tz-nt-allday.is-on{background:#0F6E56 !important;color:#fff !important;border-color:#0F6E56 !important;}'
    + '.liquid-ios26 .tz-modal .tz-rep-days button{width:34px !important;height:34px !important;border-radius:50% !important;padding:0 !important;flex:0 0 auto !important;background:#fff !important;border:0.5px solid #cfe3e6 !important;color:#33464e !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}'
    + '.liquid-ios26 .tz-modal .tz-rep-days button.is-on{background:#0F6E56 !important;color:#fff !important;border-color:#0F6E56 !important;}'
    + '.liquid-ios26 .tz-pop__series button{background:#fff !important;border:0.5px solid #ecc8c8 !important;border-radius:9px !important;color:#A32D2D !important;width:auto !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;font-weight:600 !important;}'
    + '.liquid-ios26 .tz-pop__series button.is-armed{background:#A32D2D !important;color:#fff !important;border-color:#A32D2D !important;}'
    + '.liquid-ios26 .tz-modal .tz-nt-save:hover{background:#006f78 !important;}'
    + '.liquid-ios26 .tz-modal .tz-link-btn{background:transparent !important;border:0 !important;color:#00838d !important;'
    + 'text-decoration:underline !important;padding:0 !important;margin-right:auto !important;box-shadow:none !important;font-size:0.8rem !important;}'
    + '.liquid-ios26 .tz-modal input[type="text"],.liquid-ios26 .tz-modal input[type="date"],.liquid-ios26 .tz-modal input[type="time"]{'
    + 'background:#f2fafb !important;border:0.5px solid #d7e9ec !important;color:#0f2b33 !important;'
    + 'border-radius:8px !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}'
    /* Kontra liquid dla przycisków rozcięcia (theme: button{...!important}). */
    + '.liquid-ios26 .terminarz-shell .tz-split__btns button{'
    + 'background:#fff !important;border:0.5px solid #d7e9ec !important;color:#00838d !important;'
    + 'border-radius:8px !important;padding:5px 10px !important;font-size:0.78rem !important;font-weight:600 !important;'
    + 'box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;width:auto !important;flex:0 0 auto !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-split__btns button:hover{background:#f2fafb !important;}'
    + '.liquid-ios26 .terminarz-shell #tzSplitClose{color:#5b6672 !important;}'
    /* Mobile: FAB widoczny, arkusz od dołu, plusy w komórkach miesiąca zbędne. */
    + '@media (max-width:700px){'
    + '.tz-add-btn{display:none;}'
    + '.tz-split{display:none;}'
    + '.tz-cell.is-split::after{display:none;}'
    + '.terminarz-shell .tz-fab{display:flex;position:fixed;right:16px;bottom:calc(18px + env(safe-area-inset-bottom,0px));'
    + 'width:54px;height:54px;align-items:center;justify-content:center;font-size:1.7rem;z-index:900;cursor:pointer;'
    + 'transition:bottom 220ms ease;}'
    /* F1 (decyzja UX 2026-06-05): pionowy STOS przy prawej krawędzi — dock →
     * strzałka #scrollTopBtn (4rem) → FAB. Pozycja liczona z realnej widoczności
     * docka (body.has-mobile-bottom-dock-visible + zmienna pinned z ios26) i
     * PREFERENCJI strzałki (user-hides-nav-arrow) — nic się nie nakłada,
     * a wyłączenie docka/strzałki zsuwa FAB niżej. Transition jak strzałka. */
    + 'body:not(.user-hides-nav-arrow) .terminarz-shell .tz-fab{'
    + 'bottom:calc(env(safe-area-inset-bottom,0px) + 1rem + 4rem + 10px);}'
    + 'body.has-mobile-bottom-dock-visible.user-hides-nav-arrow .terminarz-shell .tz-fab{'
    + 'bottom:var(--mobile-dock-pinned-scroll-top-bottom,calc(env(safe-area-inset-bottom,0px) + 96px));}'
    + 'body.has-mobile-bottom-dock-visible:not(.user-hides-nav-arrow) .terminarz-shell .tz-fab{'
    + 'bottom:calc(var(--mobile-dock-pinned-scroll-top-bottom,calc(env(safe-area-inset-bottom,0px) + 96px)) + 4rem + 10px);}'
    + 'body.nav-ui-temporarily-hidden .terminarz-shell .tz-fab{'
    + 'bottom:calc(18px + env(safe-area-inset-bottom,0px)) !important;}'
    + '.tz-cell__add{display:none !important;}'
    /* REDESIGN MOBILE P2 (decyzja UX 2026-06-05): PEŁNOEKRANOWY formularz
     * w stylu natywnego iOS — górny pasek [Anuluj · Nowy termin · Zapisz],
     * treść przewijalna, kontrolki >=16px i tap-targety >=44px (HIG).
     * Desktop zostaje przy karcie ze stopką (pasek ukryty bazowo). */
    + '.tz-modal-overlay{align-items:stretch;padding:0;}'
    + '.tz-modal{max-width:none;border-radius:0;max-height:none;height:100dvh;'
    + 'padding:calc(env(safe-area-inset-top,0px) + 8px) 16px calc(env(safe-area-inset-bottom,0px) + 14px);gap:14px;box-sizing:border-box;}'
    + '.tz-modal__head{border-bottom:0.5px solid #e7f1f3;padding-bottom:10px;margin:0 -16px;padding-left:16px;padding-right:16px;}'
    + '.tz-modal h3{font-size:1.1rem;text-align:center;flex:1;}'
    + '.tz-head-cancel,.tz-head-save{display:inline-flex;}'
    + '.tz-modal__actions{display:none;}'
    + '.tz-modal label{font-size:0.85rem;}'
    /* iOS: pole z font-size <16px wywołuje auto-zoom przy fokusie — na mobile
     * KAŻDA kontrolka modalu ma >=16px (wzorzec _preventIosFocusZoom z auth UI). */
    + '.tz-modal input[type="text"],.tz-modal input[type="date"],.tz-modal input[type="time"]{font-size:16px !important;height:46px;}'
    + '.tz-modal__head{background:#fff;}'
    + '.liquid-ios26 .tz-modal .tz-ntcat{font-size:16px !important;padding:10px 16px !important;}'
    + '.tz-nt-daterow input[type="date"]{flex:1 1 150px;}'
    + '.tz-nt-item{padding:12px;font-size:16px;}'
    + '.tz-nt-ext{font-size:0.9rem;}'
    + '.liquid-ios26 .tz-modal .tz-modal__actions button{'
    + 'flex:1 1 0 !important;width:auto !important;height:48px !important;font-size:16px !important;font-weight:600 !important;}'
    + '.liquid-ios26 .tz-modal .tz-link-btn{font-size:16px !important;padding:8px 6px !important;}'
    + '.liquid-ios26 .tz-modal .tz-head-cancel,.liquid-ios26 .tz-modal .tz-head-save{'
    + 'background:transparent !important;border:0 !important;box-shadow:none !important;'
    + 'backdrop-filter:none !important;-webkit-backdrop-filter:none !important;'
    + 'font-size:16px !important;padding:8px 4px !important;min-height:44px;}'
    + '.liquid-ios26 .tz-modal .tz-head-cancel{color:#5b6672 !important;}'
    + '.liquid-ios26 .tz-modal .tz-head-save{color:#00838d !important;font-weight:700 !important;}'
    + '.liquid-ios26 .tz-modal .tz-head-save:disabled{opacity:0.5;}'
    + '.tz-searchbar input{font-size:16px !important;height:42px;}'
    + '}';

  function injectCss() {
    if (doc.getElementById('vildaTerminarzCss')) return;
    var st = doc.createElement('style');
    st.id = 'vildaTerminarzCss';
    st.textContent = CSS;
    doc.head.appendChild(st);
  }

  // ── Zakresy widoków ─────────────────────────────────────────────────────────
  function gridRange(year, month) {
    // Siatka pn-nd: od poniedziałku tygodnia z 1. dniem miesiąca, 6 tygodni (42 dni).
    var first = new Date(year, month, 1);
    var offset = (first.getDay() + 6) % 7; // pon=0
    var start = new Date(year, month, 1 - offset);
    var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 41);
    return { start: start, end: end };
  }
  function weekRange(anchorISO) {
    // pn-nd tygodnia zawierającego kotwicę.
    var a = parseISO(anchorISO);
    var off = (a.getDay() + 6) % 7; // pon=0
    var start = new Date(a.getFullYear(), a.getMonth(), a.getDate() - off);
    var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { start: start, end: end };
  }
  function currentRange() {
    if (state.view === 'week') return weekRange(state.anchorISO);
    if (state.view === 'day') {
      var d = parseISO(state.anchorISO);
      return { start: d, end: d };
    }
    var a = parseISO(state.anchorISO);
    return gridRange(a.getFullYear(), a.getMonth());
  }

  // ── Dane ────────────────────────────────────────────────────────────────────
  function loadData() {
    var V = getVault();
    if (!V || typeof V.listPatientNotesInRange !== 'function') return Promise.resolve();
    var r = currentRange();
    state.loading = true;
    var fromISO = dayISO(r.start);
    var toISO = dayISO(r.end) + 'T23:59:59.999Z';
    var pOverdue = (typeof V.listPatientNotesDueByDate === 'function')
      // Zaległe = pending z terminem PRZED dzisiejszym dniem (koniec wczoraj).
      ? V.listPatientNotesDueByDate(new Date(new Date().setHours(0, 0, 0, -1)).toISOString())
      : Promise.resolve([]);
    return Promise.all([V.listPatientNotesInRange(fromISO, toISO), pOverdue])
      .then(function (res) {
        var flat = res[0] || [];
        var byDay = {};
        for (var i = 0; i < flat.length; i += 1) {
          var k = noteDayISO(flat[i]);
          if (!k) continue;
          if (!byDay[k]) byDay[k] = [];
          byDay[k].push(flat[i]);
        }
        // GODZINA: w obrębie dnia sortuj po dueTime (wpisy całodniowe na końcu).
        Object.keys(byDay).forEach(function (k) {
          byDay[k].sort(function (a, b) {
            var x = a.dueTime || '99:99';
            var y = b.dueTime || '99:99';
            if (x < y) return -1;
            if (x > y) return 1;
            return 0;
          });
        });
        state.notesByDay = byDay;
        // Spłaszcz zaległe (DueByDate grupuje per pacjent).
        var od = [];
        (res[1] || []).forEach(function (g) {
          (g.notes || []).forEach(function (n) {
            od.push(Object.assign({}, n, { patientName: g.patientName }));
          });
        });
        state.overdue = od;
        state.loading = false;
      })
      .catch(function () { state.loading = false; });
  }

  // ── Akcje ───────────────────────────────────────────────────────────────────
  function corePayload(note) {
    // savePatientNote wymaga patientId + title/body; merge-by-id zachowuje resztę
    // (linkedAge, clinicalDate, medication, labResult) — przekazujemy tylko core.
    return {
      id: note.id,
      patientId: note.patientId,
      title: note.title || '',
      body: note.body || '',
      category: note.category,
      dueDateISO: note.dueDateISO || null
    };
  }
  function markDone(note) {
    var V = getVault();
    if (!V) return Promise.resolve();
    var p = corePayload(note);
    p.completedAtISO = new Date().toISOString();
    return V.savePatientNote(p).then(refresh).catch(function (e) {
      try { global.alert('Nie udało się oznaczyć jako wykonane: ' + (e && e.message || '')); } catch (_) {}
    });
  }
  function markUndone(note) {
    var V = getVault();
    if (!V) return Promise.resolve();
    var p = corePayload(note);
    p.completedAtISO = null; // hasOwnProperty → vault czyści znacznik
    return V.savePatientNote(p).then(refresh).catch(function (e) {
      try { global.alert('Nie udało się cofnąć: ' + (e && e.message || '')); } catch (_) {}
    });
  }
  function postpone(note, days) {
    var V = getVault();
    if (!V) return Promise.resolve();
    var base = noteDayISO(note) || todayISO();
    var b = new Date(base + 'T12:00:00');
    var nd = new Date(b.getFullYear(), b.getMonth(), b.getDate() + days);
    var p = corePayload(note);
    p.dueDateISO = dayISO(nd);
    return V.savePatientNote(p).then(refresh).catch(function (e) {
      try { global.alert('Nie udało się przełożyć: ' + (e && e.message || '')); } catch (_) {}
    });
  }
  function editNote(note) {
    // TERMINARZ-ZAJĘCIA: wydarzenie poza-pacjenckie edytujemy w SWOIM modalu
    // (pełny edytor notatki nie zna rodzaju/miejsca).
    if (note && note.isActivity) { showNewTermModal(null, null, note); return; }
    var AUI = global.VildaAuthUI;
    if (!AUI || typeof AUI.showPatientNoteEditor !== 'function') {
      try { global.alert('Edytor notatki niedostępny — odśwież stronę.'); } catch (_) {}
      return;
    }
    AUI.showPatientNoteEditor({ patientId: note.patientId, note: note, onSaved: function () { refresh(); } });
  }
  function openPatientCard(patientId, noteId) {
    // Ta sama ścieżka co „Otwórz" w modalu przypomnień R3.
    var AUI = global.VildaAuthUI;
    if (!AUI || typeof AUI.showPatientCard !== 'function') {
      try { global.alert('Karta pacjenta niedostępna — odśwież stronę.'); } catch (_) {}
      return;
    }
    AUI.showPatientCard(patientId, null, { focusNoteId: noteId || null });
  }
  // ── Cykl D (2026-06-05): szybki modal „Nowy termin" (P1+P2) ────────────────
  // Jedno wejście danych: V.savePatientNote (notatka z dueDateISO — E2E jak
  // wszystkie notatki). Picker pacjenta z V.listPatients() (odszyfrowane
  // nagłówki, sort po świeżości). Prefill daty z kontekstu („+" przy dniu).
  function defaultAddISO() {
    if (state.view === 'day') return state.anchorISO;
    if (state.view === 'month') return state.selectedISO || todayISO();
    return todayISO();
  }
  function closeNewTermModal() {
    var o = doc.getElementById('tzNewTermOverlay');
    if (o) o.remove();
    // Modal miał wpis historii (pushState przy otwarciu) — ręczne zamknięcie
    // (Anuluj/tło/Zapisz) zdejmuje go history.back(), żeby stos został spójny.
    // _tzNavModalGuard: zamknięcie wywołane Z popstate nie cofa drugi raz.
    if (o && !_tzNavModalGuard) {
      var cur = _tzNavState();
      if (cur && cur.modal) {
        try { global.history.back(); } catch (_) { /* noop */ }
      }
    }
  }
  function showNewTermModal(prefillISO, prefillTime, editObj) {
    if (!unlocked()) return;
    var V = getVault();
    if (!V || typeof V.savePatientNote !== 'function' || typeof V.listPatients !== 'function') {
      try { global.alert('Dodawanie terminów niedostępne — odśwież stronę (Ctrl+Shift+R).'); } catch (_) {}
      return;
    }
    closeNewTermModal();
    // TERMINARZ-ZAJĘCIA: tryb Pacjent|Zajęcie. editObj (zajęcie) → edycja wpisu.
    var editAct = (editObj && editObj.isActivity) ? editObj : null;
    var selMode = editAct ? 'activity' : 'patient';
    var selPid = null;
    var selName = null;
    var selCat = 'followup';
    var selKind = (editAct && isActivityCat(editAct.category)) ? editAct.category : 'lecture';
    var editId = editAct ? editAct.id : null;
    var allPatients = null; // [{patientId, name}]

    var overlay = doc.createElement('div');
    overlay.id = 'tzNewTermOverlay';
    overlay.className = 'tz-modal-overlay';
    var initISO = (typeof prefillISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(prefillISO)) ? prefillISO : todayISO();
    overlay.innerHTML = ''
      + '<div class="tz-modal" role="dialog" aria-modal="true" aria-label="Nowy termin">'
      + '<div class="tz-modal__head">'
      + '<button type="button" id="tzNtCancelTop" class="tz-head-cancel">Anuluj</button>'
      + '<h3>' + (editAct ? 'Edytuj zajęcie' : 'Nowy termin') + '</h3>'
      + '<button type="button" id="tzNtSaveTop" class="tz-head-save">Zapisz</button>'
      + '</div>'
      // TERMINARZ-ZAJĘCIA: przełącznik PACJENT | ZAJĘCIE u góry — podmienia sekcję
      // „kto" (pacjent ↔ rodzaj+miejsce) i listę kategorii. Reszta wspólna.
      + '<div class="tz-nt-mode" id="tzNtMode">'
      + '<button type="button" data-mode="patient"' + (selMode === 'patient' ? ' class="is-on"' : '') + '>Pacjent</button>'
      + '<button type="button" data-mode="activity"' + (selMode === 'activity' ? ' class="is-on"' : '') + '>Zajęcie</button>'
      + '</div>'
      // W1 grouped-inset (decyzja UX 2026-06-05): sekcje jako karty z obrysem.
      + '<section class="tz-card-sec" id="tzNtPatientSec"><p class="tz-sec-lbl">👤 Pacjent</p>'
      + '<div class="tz-nt-combo">'
      + '<input type="text" id="tzNtSearch" autocomplete="off" placeholder="Szukaj pacjenta…">'
      + '<div class="tz-nt-list" id="tzNtList"><div class="tz-nt-empty">Wczytuję pacjentów…</div></div>'
      + '</div>'
      + '<div class="tz-nt-ext" id="tzNtExtHint" style="display:none;"></div>'
      + '</section>'
      + '<section class="tz-card-sec" id="tzNtActSec" style="display:none;"><p class="tz-sec-lbl">🎓 Rodzaj zajęcia</p>'
      + '<div class="tz-ntcats" id="tzNtKinds">'
      + ACTIVITY_KINDS.map(function (k) { return '<button type="button" class="tz-ntcat' + (k[0] === selKind ? ' is-on' : '') + '" data-kind="' + k[0] + '">' + esc(k[1]) + '</button>'; }).join('')
      + '</div>'
      + '<input type="text" id="tzNtPlace" autocomplete="off" style="margin-top:8px;" placeholder="Miejsce / nazwa (np. UM Poznań, Poradnia Ostrów)" aria-label="Miejsce zajęcia">'
      + '</section>'
      + '<section class="tz-card-sec"><p class="tz-sec-lbl" id="tzNtTtlLbl">📋 Szczegóły</p>'
      + '<input type="text" id="tzNtTitle" autocomplete="off" value="Wizyta kontrolna" aria-label="Tytuł terminu">'
      + '<div class="tz-ntcats" id="tzNtCats" style="margin-top:8px;">'
      + '<button type="button" class="tz-ntcat is-on" data-cat="followup">Kontrola</button>'
      + '<button type="button" class="tz-ntcat" data-cat="wynik-badania">Wynik badania</button>'
      + '<button type="button" class="tz-ntcat" data-cat="treatment">Leczenie</button>'
      + '<button type="button" class="tz-ntcat" data-cat="observation">Obserwacja</button>'
      + '</div></section>'
      + '<section class="tz-card-sec"><p class="tz-sec-lbl">🕐 Termin</p>'
      + '<div class="tz-nt-daterow">'
      + '<input type="date" id="tzNtDate" value="' + esc(initISO) + '" aria-label="Data terminu">'
      + '<input type="time" id="tzNtTime" value="' + esc((typeof prefillTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(prefillTime)) ? prefillTime : '10:00') + '" step="300" aria-label="Godzina">'
      + '</div>'
      + '<div class="tz-nt-durrow" id="tzNtDurRow" style="display:none;margin-top:8px;">'
      + '<label for="tzNtTimeEnd">do</label>'
      + '<input type="time" id="tzNtTimeEnd" step="300" aria-label="Koniec zajęcia">'
      + '<button type="button" class="tz-nt-allday" id="tzNtAllDay">Cały dzień</button>'
      + '</div>'
      + '<div class="tz-nt-dur" id="tzNtDur">⏱ rezerwacja 30 min · Kontrola</div>'
      + '</section>'
      // TERMINARZ-SERIE: powtarzalność zajęć (materializacja; edycja wystąpienia
      // serii NIE pokazuje tej sekcji — dotyczy tylko nowych wpisów).
      + '<section class="tz-card-sec" id="tzNtRepSec" style="display:none;"><p class="tz-sec-lbl">🔁 Powtarzanie</p>'
      + '<div class="tz-ntcats" id="tzNtRepFreq">'
      + '<button type="button" class="tz-ntcat is-on" data-rep="none">Nie powtarza</button>'
      + '<button type="button" class="tz-ntcat" data-rep="w1">Co tydzień</button>'
      + '<button type="button" class="tz-ntcat" data-rep="w2">Co 2 tyg.</button>'
      + '<button type="button" class="tz-ntcat" data-rep="m1">Co miesiąc</button>'
      + '</div>'
      + '<div id="tzNtRepBody" style="display:none;">'
      + '<div class="tz-rep-days" id="tzNtRepDays">'
      + [['Pn', 1], ['Wt', 2], ['Śr', 3], ['Cz', 4], ['Pt', 5], ['So', 6], ['Nd', 0]].map(function (w) { return '<button type="button" data-dow="' + w[1] + '">' + w[0] + '</button>'; }).join('')
      + '</div>'
      + '<div class="tz-rep-endrow" id="tzNtRepEnd">'
      + '<button type="button" class="tz-ntcat is-on" data-end="m6">Przez 6 mies.</button>'
      + '<button type="button" class="tz-ntcat" data-end="until">Do dnia</button>'
      + '<button type="button" class="tz-ntcat" data-end="count">Liczba</button>'
      + '</div>'
      + '<input type="date" id="tzNtRepUntil" style="display:none;margin-top:8px;" aria-label="Koniec serii">'
      + '<input type="number" id="tzNtRepCount" min="2" max="120" step="1" value="12" inputmode="numeric" style="display:none;margin-top:8px;width:92px;" aria-label="Liczba wystąpień">'
      + '<label class="tz-rep-tog"><input type="checkbox" id="tzNtRepHol" checked> Pomijaj święta państwowe</label>'
      + '<label class="tz-rep-tog"><input type="checkbox" id="tzNtRepWknd"> Pomijaj weekendy</label>'
      + '<div class="tz-rep-sum" id="tzNtRepSum" style="display:none;"></div>'
      + '</div></section>'
      + '<div class="tz-modal__err" id="tzNtErr"></div>'
      + '<div class="tz-modal__footnote">'
      + '<button type="button" class="tz-link-btn" id="tzNtFull">Pełny edytor →</button></div>'
      + '<div class="tz-modal__actions">'
      + '<button type="button" id="tzNtCancel">Anuluj</button>'
      + '<button type="button" class="tz-nt-save" id="tzNtSave">Zapisz termin</button>'
      + '</div></div>';

    var searchEl = overlay.querySelector('#tzNtSearch');
    var listEl = overlay.querySelector('#tzNtList');
    var extHintEl = overlay.querySelector('#tzNtExtHint');
    var titleEl = overlay.querySelector('#tzNtTitle');
    var dateEl = overlay.querySelector('#tzNtDate');
    var errEl = overlay.querySelector('#tzNtErr');
    var saveBtn = overlay.querySelector('#tzNtSave');
    // TERMINARZ-ZAJĘCIA: elementy trybu i pól zajęcia.
    var modeBtns = overlay.querySelectorAll('#tzNtMode button[data-mode]');
    var patientSec = overlay.querySelector('#tzNtPatientSec');
    var actSec = overlay.querySelector('#tzNtActSec');
    var kindBtns = overlay.querySelectorAll('#tzNtKinds .tz-ntcat[data-kind]');
    var placeEl = overlay.querySelector('#tzNtPlace');
    var ttlLblEl = overlay.querySelector('#tzNtTtlLbl');
    var patCatsEl = overlay.querySelector('#tzNtCats');
    var durRowEl = overlay.querySelector('#tzNtDurRow');
    var timeEndEl = overlay.querySelector('#tzNtTimeEnd');
    var _prevStartHH = null; // zmiana startu przesuwa koniec (zachowuje długość)
    var allDayBtn = overlay.querySelector('#tzNtAllDay');
    var footnoteEl = overlay.querySelector('.tz-modal__footnote');
    // TERMINARZ-SERIE: kontrolki powtarzalności.
    var repSec = overlay.querySelector('#tzNtRepSec');
    var repBody = overlay.querySelector('#tzNtRepBody');
    var repFreqBtns = overlay.querySelectorAll('#tzNtRepFreq .tz-ntcat[data-rep]');
    var repDayBtns = overlay.querySelectorAll('#tzNtRepDays button[data-dow]');
    var repEndBtns = overlay.querySelectorAll('#tzNtRepEnd .tz-ntcat[data-end]');
    var repUntilEl = overlay.querySelector('#tzNtRepUntil');
    var repCountEl = overlay.querySelector('#tzNtRepCount');
    var repHolEl = overlay.querySelector('#tzNtRepHol');
    var repWkndEl = overlay.querySelector('#tzNtRepWknd');
    var repSumEl = overlay.querySelector('#tzNtRepSum');
    var selRep = 'none';
    var selRepEnd = 'm6';
    var _actAllDay = false; // zajęcie bez godziny (przełącznik „Cały dzień")
    var TITLE_PATIENT_DEFAULT = 'Wizyta kontrolna';

    function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
    function clearErr() { errEl.textContent = ''; errEl.style.display = 'none'; }
    // Dropdown: lista NIE jest widoczna od razu (otwiera ją fokus/wpisywanie)
    // i NIE wydłuża modala — absolute nad kolejnymi polami (patrz CSS .tz-nt-list).
    function openList() { listEl.classList.add('is-open'); }
    function closeList() { listEl.classList.remove('is-open'); }
    function isListOpen() { return listEl.classList.contains('is-open'); }

    function renderList() {
      if (!allPatients) return;
      var q = (searchEl.value || '').trim().toLowerCase();
      var hits = [];
      for (var i = 0; i < allPatients.length; i += 1) {
        var p = allPatients[i];
        if (!q || p.name.toLowerCase().indexOf(q) >= 0) hits.push(p);
        if (hits.length >= 30) break;
      }
      if (!hits.length) {
        // EXT (decyzja UX 2026-06-05): brak pasujących = po prostu CHOWAMY listę —
        // wpisany tekst stanie się osobą spoza bazy (wpis własny), zero blokady.
        listEl.innerHTML = '';
        closeList();
        return;
      }
      var h = '';
      hits.forEach(function (p) {
        h += '<div class="tz-nt-item' + (p.patientId === selPid ? ' is-sel' : '') + '" data-pid="' + esc(p.patientId) + '" data-name="' + esc(p.name) + '">' + esc(p.name) + '</div>';
      });
      listEl.innerHTML = h;
      var items = listEl.querySelectorAll('.tz-nt-item');
      for (var j = 0; j < items.length; j += 1) {
        (function (it) {
          // mousedown (nie click): wybór MUSI wyprzedzić blur inputa — przy click
          // blur zdążyłby schować listę zanim klik dotrze do elementu.
          it.addEventListener('mousedown', function (ev) {
            ev.preventDefault();
            selPid = it.getAttribute('data-pid');
            selName = it.getAttribute('data-name');
            searchEl.value = selName;
            clearErr();
            closeList();
          });
        })(items[j]);
      }
    }

    V.listPatients().then(function (records) {
      allPatients = (records || []).map(function (r) {
        return {
          patientId: r.patientId,
          name: (r.header && typeof r.header.name === 'string' && r.header.name) ? r.header.name : '(bez imienia)'
        };
      });
      renderList();
    }).catch(function () {
      listEl.innerHTML = '<div class="tz-nt-empty">Nie udało się wczytać listy pacjentów.</div>';
    });

    // EXT: podpowiedź na żywo — bez wyboru z listy wpisany tekst zapisze się
    // jako OSOBA SPOZA BAZY pacjentów (świadomość, że to nie rekord kartoteki).
    function updateExtHint() {
      var txt = (searchEl.value || '').trim();
      if (!selPid && txt.length >= 2) {
        extHintEl.textContent = '↳ osoba spoza bazy pacjentów: „' + txt + '”';
        extHintEl.style.display = 'block';
      } else {
        extHintEl.style.display = 'none';
      }
    }
    searchEl.addEventListener('input', function () {
      // Edycja tekstu unieważnia wybór, jeśli przestał pasować.
      if (selName && searchEl.value !== selName) { selPid = null; selName = null; }
      renderList();
      openList();
      updateExtHint();
    });
    searchEl.addEventListener('focus', function () { renderList(); openList(); });
    searchEl.addEventListener('blur', function () { closeList(); updateExtHint(); });

    // GODZINA (decyzja UX 2026-06-05): pole czasu + rezerwacja 30 min TYLKO dla
    // kategorii Kontrola (followup); pozostałe kategorie = wpis całodniowy.
    var timeEl = overlay.querySelector('#tzNtTime');
    var durEl = overlay.querySelector('#tzNtDur');
    // TERMINARZ-SERIE: zebrane ustawienia + podsumowanie na żywo.
    function repDows() {
      var out = [];
      for (var i = 0; i < repDayBtns.length; i += 1) {
        if (repDayBtns[i].classList.contains('is-on')) out.push(parseInt(repDayBtns[i].getAttribute('data-dow'), 10));
      }
      return out;
    }
    function repEndSpec() {
      return { mode: selRepEnd, untilISO: (repUntilEl.value || null), count: parseInt(repCountEl.value, 10) || 12 };
    }
    function repPreview() {
      if (selRep === 'none') return null;
      return genSeriesDates(dateEl.value || todayISO(), selRep, repDows(), repEndSpec(),
        !!repHolEl.checked, !!repWkndEl.checked);
    }
    var REP_LBL = { w1: 'co tydzień', w2: 'co 2 tygodnie', m1: 'co miesiąc' };
    function updateRepUI() {
      var on = (selRep !== 'none');
      repBody.style.display = on ? '' : 'none';
      var daysWrap = overlay.querySelector('#tzNtRepDays');
      daysWrap.style.display = (selRep === 'm1') ? 'none' : '';
      repUntilEl.style.display = (selRepEnd === 'until') ? '' : 'none';
      repCountEl.style.display = (selRepEnd === 'count') ? '' : 'none';
      if (!on) { repSumEl.style.display = 'none'; return; }
      var pv = repPreview();
      if (!pv || !pv.dates.length) {
        repSumEl.style.display = '';
        repSumEl.textContent = 'Seria nie zawiera żadnych wystąpień — sprawdź dni i koniec serii.';
        return;
      }
      var last = pv.dates[pv.dates.length - 1];
      repSumEl.style.display = '';
      repSumEl.textContent = '🔁 ' + (REP_LBL[selRep] || '') + ' · ' + pv.dates.length + ' wystąpień do '
        + plDate(last)
        + (pv.skippedHol ? ' · pominięte święta: ' + pv.skippedHol : '')
        + (pv.capped ? ' · (limit ' + SERIES_MAX + ')' : '');
    }
    for (var rf = 0; rf < repFreqBtns.length; rf += 1) {
      (function (btn) {
        btn.addEventListener('click', function () {
          selRep = btn.getAttribute('data-rep');
          for (var x2 = 0; x2 < repFreqBtns.length; x2 += 1) repFreqBtns[x2].classList.toggle('is-on', repFreqBtns[x2] === btn);
          updateRepUI();
        });
      })(repFreqBtns[rf]);
    }
    for (var rd = 0; rd < repDayBtns.length; rd += 1) {
      (function (btn) {
        btn.addEventListener('click', function () { btn.classList.toggle('is-on'); updateRepUI(); });
      })(repDayBtns[rd]);
    }
    for (var re = 0; re < repEndBtns.length; re += 1) {
      (function (btn) {
        btn.addEventListener('click', function () {
          selRepEnd = btn.getAttribute('data-end');
          for (var x3 = 0; x3 < repEndBtns.length; x3 += 1) repEndBtns[x3].classList.toggle('is-on', repEndBtns[x3] === btn);
          updateRepUI();
        });
      })(repEndBtns[re]);
    }
    repUntilEl.addEventListener('change', updateRepUI);
    repCountEl.addEventListener('input', updateRepUI);
    repHolEl.addEventListener('change', updateRepUI);
    repWkndEl.addEventListener('change', updateRepUI);
    dateEl.addEventListener('change', function () {
      // Zmiana daty startu: jeśli nic nie zaznaczono ręcznie, dopasuj dzień tygodnia.
      if (selRep !== 'none' && repDows().length === 0) {
        var sd = parseISO(dateEl.value);
        if (sd) for (var x4 = 0; x4 < repDayBtns.length; x4 += 1) repDayBtns[x4].classList.toggle('is-on', parseInt(repDayBtns[x4].getAttribute('data-dow'), 10) === sd.getDay());
      }
      updateRepUI();
    });
    // Prefill dnia tygodnia z daty startowej.
    (function () {
      var sd0 = parseISO(initISO);
      if (sd0) for (var x5 = 0; x5 < repDayBtns.length; x5 += 1) repDayBtns[x5].classList.toggle('is-on', parseInt(repDayBtns[x5].getAttribute('data-dow'), 10) === sd0.getDay());
    })();

    // Forma zależna od TRYBU: pacjent (jak dotąd — czas tylko dla Kontroli) /
    // zajęcie (czas zawsze + edytowalny czas trwania, opcja „Cały dzień").
    // OD–DO: koniec zajęcia godziną (np. Poradnia od 16:00 do 19:20).
    function setEndFromStart(durMin) {
      timeEndEl.value = _hhAdd(timeEl.value || '10:00', durMin);
    }
    function currentDurMin() {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeEl.value || '')) return NaN;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeEndEl.value || '')) return NaN;
      return slotMinOf(timeEndEl.value) - slotMinOf(timeEl.value);
    }
    function updateForm() {
      var isAct = (selMode === 'activity');
      if (isAct && !_actAllDay && !timeEndEl.value) setEndFromStart(ACTIVITY_DEFAULT_MIN[selKind] || 60);
      patientSec.style.display = isAct ? 'none' : '';
      actSec.style.display = isAct ? '' : 'none';
      patCatsEl.style.display = isAct ? 'none' : '';
      ttlLblEl.textContent = isAct ? '📋 Temat (opcjonalnie)' : '📋 Szczegóły';
      if (footnoteEl) footnoteEl.style.display = isAct ? 'none' : '';
      repSec.style.display = (isAct && !editId) ? '' : 'none';
      if (isAct && !editId) updateRepUI();
      if (isAct) {
        if (titleEl.value === TITLE_PATIENT_DEFAULT) titleEl.value = '';
        titleEl.placeholder = 'Temat zajęcia (np. cukrzyca typu 1)';
        timeEl.style.display = _actAllDay ? 'none' : '';
        durRowEl.style.display = _actAllDay ? 'none' : 'flex';
        durEl.style.display = 'none';
        allDayBtn.classList.toggle('is-on', _actAllDay);
      } else {
        if (!titleEl.value) titleEl.value = TITLE_PATIENT_DEFAULT;
        titleEl.placeholder = '';
        var isKontrola = (selCat === 'followup');
        timeEl.style.display = isKontrola ? '' : 'none';
        durRowEl.style.display = 'none';
        durEl.style.display = isKontrola ? '' : 'none';
      }
    }
    var catBtns = overlay.querySelectorAll('#tzNtCats .tz-ntcat[data-cat]');
    for (var cb = 0; cb < catBtns.length; cb += 1) {
      (function (btn) {
        btn.addEventListener('click', function () {
          selCat = btn.getAttribute('data-cat');
          for (var x = 0; x < catBtns.length; x += 1) catBtns[x].classList.remove('is-on');
          btn.classList.add('is-on');
          updateForm();
        });
      })(catBtns[cb]);
    }
    // Rodzaj zajęcia → podświetlenie + domyślny czas trwania.
    for (var kb = 0; kb < kindBtns.length; kb += 1) {
      (function (btn) {
        btn.addEventListener('click', function () {
          selKind = btn.getAttribute('data-kind');
          for (var y = 0; y < kindBtns.length; y += 1) kindBtns[y].classList.remove('is-on');
          btn.classList.add('is-on');
          if (!editId && ACTIVITY_DEFAULT_MIN[selKind]) setEndFromStart(ACTIVITY_DEFAULT_MIN[selKind]);
          updateForm();
        });
      })(kindBtns[kb]);
    }
    // Przełącznik trybu Pacjent | Zajęcie.
    for (var mb = 0; mb < modeBtns.length; mb += 1) {
      (function (btn) {
        btn.addEventListener('click', function () {
          selMode = btn.getAttribute('data-mode');
          for (var z = 0; z < modeBtns.length; z += 1) modeBtns[z].classList.toggle('is-on', modeBtns[z] === btn);
          clearErr();
          updateForm();
        });
      })(modeBtns[mb]);
    }
    allDayBtn.addEventListener('click', function () { _actAllDay = !_actAllDay; updateForm(); });
    // Prefill EDYCJI zajęcia.
    if (editAct) {
      placeEl.value = editAct.patientName || editAct.externalName || '';
      titleEl.value = editAct.title || '';
      if (editAct.dueTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(editAct.dueTime)) timeEl.value = editAct.dueTime;
      else _actAllDay = true;
      if (editAct.dueTime && editAct.durationMin > 0) timeEndEl.value = _hhAdd(editAct.dueTime, editAct.durationMin);
      else setEndFromStart(ACTIVITY_DEFAULT_MIN[selKind] || 60);
    } else if (selMode === 'activity' && ACTIVITY_DEFAULT_MIN[selKind]) {
      setEndFromStart(ACTIVITY_DEFAULT_MIN[selKind]);
    }
    _prevStartHH = timeEl.value || null;
    timeEl.addEventListener('change', function () {
      if (selMode !== 'activity') { _prevStartHH = timeEl.value; return; }
      var keep = NaN;
      if (_prevStartHH && /^([01]\d|2[0-3]):[0-5]\d$/.test(timeEndEl.value || '')) {
        keep = slotMinOf(timeEndEl.value) - slotMinOf(_prevStartHH);
      }
      if (!isFinite(keep) || keep < 5) keep = ACTIVITY_DEFAULT_MIN[selKind] || 60;
      setEndFromStart(keep);
      _prevStartHH = timeEl.value;
    });
    updateForm();

    function validate() {
      clearErr();
      var dISO = dateEl.value || '';
      // TERMINARZ-ZAJĘCIA: tryb „Zajęcie" — miejsce LUB temat (≥2 znaki) + data.
      if (selMode === 'activity') {
        var place = (placeEl.value || '').trim();
        var topic = (titleEl.value || '').trim();
        if ((place + topic).length < 2) {
          showErr('Podaj miejsce lub temat zajęcia (min. 2 znaki).');
          try { placeEl.focus(); } catch (_) {}
          return null;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dISO)) { showErr('Podaj datę zajęcia.'); try { dateEl.focus(); } catch (_) {} return null; }
        return { mode: 'activity', place: place, topic: topic, dISO: dISO };
      }
      // EXT: bez wyboru z listy wpisany tekst = osoba SPOZA bazy pacjentów
      // (decyzja UX 2026-06-05: system niczego nie blokuje — lekarz dodaje
      // kogo chce; nazwisko trafia do szyfrowanego externalName).
      var extName = null;
      if (!selPid) {
        extName = (searchEl.value || '').trim();
        if (extName.length < 2) {
          showErr('Wpisz osobę (min. 2 znaki) albo wybierz pacjenta z listy.');
          try { searchEl.focus(); } catch (_) {}
          return null;
        }
      }
      var title = (titleEl.value || '').trim();
      if (!title) { showErr('Podaj tytuł terminu (np. „Kontrola wzrostu”).'); try { titleEl.focus(); } catch (_) {} return null; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dISO)) { showErr('Podaj datę terminu.'); try { dateEl.focus(); } catch (_) {} return null; }
      return { mode: 'patient', title: title, dISO: dISO, extName: extName };
    }

    saveBtn.addEventListener('click', function () {
      var v = validate();
      if (!v) return;
      saveBtn.disabled = true;
      try { overlay.querySelector('#tzNtSaveTop').disabled = true; } catch (_) { /* noop */ }
      var payload;
      if (v.mode === 'activity') {
        // ZAJĘCIE: sentinel + MIEJSCE w szyfrowanym externalName, TEMAT w title.
        payload = {
          patientId: (V.ACTIVITY_PATIENT_ID || '__vilda_activity__'),
          externalName: v.place,        // jawny string ('' = czyści miejsce)
          title: v.topic,               // może być '' (wydarzenie samym miejscem)
          category: selKind,
          dueDateISO: v.dISO
        };
        if (editId) payload.id = editId;
        if (!_actAllDay && timeEl && /^([01]\d|2[0-3]):[0-5]\d$/.test(timeEl.value || '')) {
          payload.dueTime = timeEl.value;
          var dm = currentDurMin();      // od–do → minuty
          if (!isFinite(dm)) dm = ACTIVITY_DEFAULT_MIN[selKind] || 60;
          if (dm < 5) {
            saveBtn.disabled = false;
            try { overlay.querySelector('#tzNtSaveTop').disabled = false; } catch (_) { /* noop */ }
            showErr('Koniec zajęcia musi być po jego początku (min. 5 minut).');
            try { timeEndEl.focus(); } catch (_) {}
            return;
          }
          if (dm > 1440) dm = 1440;
          payload.durationMin = dm;
        } else {
          payload.dueTime = null;       // jawny null = cały dzień
        }
      } else {
        payload = v.extName
          ? { patientId: (V.EXTERNAL_PATIENT_ID || '__vilda_external__'), externalName: v.extName, title: v.title, category: selCat, dueDateISO: v.dISO }
          : { patientId: selPid, title: v.title, category: selCat, dueDateISO: v.dISO };
        // GODZINA: Kontrola rezerwuje slot 30 min (inne kategorie — całodniowe).
        if (selCat === 'followup' && timeEl && /^([01]\d|2[0-3]):[0-5]\d$/.test(timeEl.value || '')) {
          payload.dueTime = timeEl.value;
          payload.durationMin = 30;
        }
      }
      // TERMINARZ-SERIE: powtarzalne zajęcie = N zwykłych notatek (wspólny
      // seriesId), zapis SEKWENCYJNY; pojedynczy wpis = jak dotąd.
      var saveOp;
      if (v.mode === 'activity' && selRep !== 'none' && !editId) {
        var pv2 = repPreview();
        if (!pv2 || !pv2.dates.length) {
          saveBtn.disabled = false;
          try { overlay.querySelector('#tzNtSaveTop').disabled = false; } catch (_) { /* noop */ }
          showErr('Seria nie zawiera żadnych wystąpień — sprawdź dni i koniec serii.');
          return;
        }
        var sid = newSeriesId();
        var chain = Promise.resolve();
        pv2.dates.forEach(function (occISO) {
          chain = chain.then(function () {
            var p2 = Object.assign({}, payload);
            p2.dueDateISO = occISO;
            p2.seriesId = sid;
            return V.savePatientNote(p2);
          });
        });
        saveOp = chain;
      } else {
        saveOp = V.savePatientNote(payload);
      }
      saveOp
        .then(function () { closeNewTermModal(); refresh(); })
        .catch(function (e) {
          saveBtn.disabled = false;
          try { overlay.querySelector('#tzNtSaveTop').disabled = false; } catch (_) { /* noop */ }
          showErr('Nie udało się zapisać terminu: ' + (e && e.message || ''));
        });
    });

    overlay.querySelector('#tzNtFull').addEventListener('click', function () {
      // Furtka P3: pełny edytor notatki z prefillm (note BEZ id = nowa notatka).
      // EXT: pełny edytor wymaga pacjenta z bazy (edytor nie niesie externalName
      // przy NOWYM wpisie — osoba by przepadła); szybki zapis działa bez tego.
      var AUI = global.VildaAuthUI;
      if (!selPid) { showErr('Pełny edytor działa dla pacjentów z bazy — osobę spoza bazy zapisz przyciskiem „Zapisz termin”.'); return; }
      if (!AUI || typeof AUI.showPatientNoteEditor !== 'function') { showErr('Pełny edytor niedostępny — odśwież stronę.'); return; }
      var draft = { title: (titleEl.value || '').trim(), category: selCat, dueDateISO: (dateEl.value || null) };
      closeNewTermModal();
      AUI.showPatientNoteEditor({ patientId: selPid, note: draft, onSaved: function () { refresh(); } });
    });
    overlay.querySelector('#tzNtCancel').addEventListener('click', closeNewTermModal);
    overlay.querySelector('#tzNtCancelTop').addEventListener('click', closeNewTermModal);
    overlay.querySelector('#tzNtSaveTop').addEventListener('click', function () { saveBtn.click(); });
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay) closeNewTermModal(); });
    doc.addEventListener('keydown', function onEsc(ev) {
      if (ev.key !== 'Escape') return;
      if (!doc.getElementById('tzNewTermOverlay')) { doc.removeEventListener('keydown', onEsc); return; }
      // Escape najpierw zamyka dropdown pacjenta, dopiero drugi — cały modal.
      if (isListOpen()) { closeList(); return; }
      closeNewTermModal();
      doc.removeEventListener('keydown', onEsc);
    });

    doc.body.appendChild(overlay);
    // Modal = krok ścieżki: wpis historii (gest wstecz zamyka modal, nie stronę).
    _tzNavPush({ modal: 1 });
    // BEZ autofokusu: fokus otwiera dropdown pacjenta (ma być schowany do czasu
    // interakcji), a na mobile wystrzeliwałby klawiaturę przy każdym otwarciu.
  }

  // KROK 1 (2026-06-05): usuwanie wpisu — istniejąca ścieżka vaulta
  // (removePatientNote: tombstone propagowany przez sync + notify → live refresh).
  function deleteNote(note) {
    var V = getVault();
    if (!V || typeof V.removePatientNote !== 'function') {
      try { global.alert('Usuwanie niedostępne — odśwież stronę (Ctrl+Shift+R).'); } catch (_) {}
      return Promise.resolve();
    }
    return V.removePatientNote(note.id).then(refresh).catch(function (e) {
      try { global.alert('Nie udało się usunąć wpisu: ' + (e && e.message || '')); } catch (_) {}
    });
  }

  // ── POPOVER V1 (akceptacja 2026-06-05): scalona karta szczegółów bloku ──────
  // Nagłówek (kto/kiedy) + TREŚĆ notatki (np. „Pobrać krew na czczo") + akcje
  // w siatce 2×2. Toggle: drugi klik w ten sam blok lub klik POZA = wyłącznie
  // zamknięcie z POŁKNIĘCIEM kliku (capture) — nic innego się nie odpala
  // (np. pusta komórka pod kursorem nie doda terminu). Wyjątek: klik w INNY
  // blok zamyka stary i pozwala otworzyć nowy jednym ruchem.
  var _animDir = 0;   // W1: kierunek slide przy zmianie okresu (0 = bez animacji)
  var _animToken = 0; // sprzątanie tylko najnowszej animacji
  var _weekPop = null; // { el, blockEl, noteId }
  function closeWeekPopover() {
    if (!_weekPop) return;
    if (_weekPop.el && _weekPop.el.parentNode) _weekPop.el.remove();
    _weekPop = null;
  }
  function showWeekPopover(blockEl, note) {
    closePostponeMenus();
    if (_weekPop && _weekPop.noteId === note.id) { closeWeekPopover(); return; }
    closeWeekPopover();
    var done = !!note.completedAtISO;
    var iso = noteDayISO(note);
    var d = parseISO(iso);
    var when = WEEKDAYS[(d.getDay() + 6) % 7].toLowerCase() + ' ' + plDate(iso);
    if (note.dueTime) {
      when += ' · ' + note.dueTime;
      if (note.durationMin) {
        var endM = slotMinOf(note.dueTime) + note.durationMin;
        when += '–' + hhOf(Math.min(endM, 23 * 60 + 59));
      }
    } else {
      when += ' · cały dzień';
    }
    var sub = when + ' · ' + (CAT_LABEL[note.category] || '')
      + (note.isExternal ? ' · spoza bazy' : '') + (note.seriesId ? ' · 🔁 seria' : '')
      + (done ? ' · wykonane' : '');
    var pop = doc.createElement('div');
    pop.className = 'tz-pop ' + (CAT_CLASS[note.category] || '');
    pop.innerHTML = ''
      + '<div class="tz-pop__head">'
      + '<div class="tz-pop__nm">' + esc(nmOf(note)) + '</div>'
      + '<div class="tz-pop__sub">' + esc(sub) + '</div>'
      + (note.title ? ('<div class="tz-pop__ttl">' + esc(note.title) + '</div>') : '')
      + '</div>'
      + (note.body ? ('<div class="tz-pop__body">📝 ' + esc(note.body) + '</div>') : '')
      + '<div class="tz-pop__grid">'
      + (isDuty(note) ? '' : (done
        ? '<button type="button" data-pop="undone">↺ Cofnij</button>'
        : '<button type="button" class="tz-pop__done" data-pop="done">✓ Wykonane</button>')
        + '<button type="button" data-pop="postpone">↻ Przełóż</button>')
      + '<button type="button" data-pop="edit">✎ Edytuj</button>'
      + '<button type="button" class="tz-pop__del" data-pop="del">🗑 Usuń</button>'
      + '</div>'
      // TERMINARZ-SERIE: zakresy odwołania (decyzja: to / od teraz / cała).
      + (note.seriesId
        ? ('<div class="tz-pop__series">'
          + '<button type="button" data-pop="stopseries">⏹ Zatrzymaj serię od tego dnia</button>'
          + '<button type="button" data-pop="delseries">Usuń całą serię</button>'
          + '</div>')
        : '');
    doc.body.appendChild(pop);
    // Pozycja: pod blokiem, clamp do viewportu (i nad dolną krawędzią).
    var r = blockEl.getBoundingClientRect();
    var pw = pop.offsetWidth || 250;
    var ph = pop.offsetHeight || 180;
    var left = Math.min(Math.max(8, r.left + global.scrollX), global.scrollX + global.innerWidth - pw - 8);
    var top = r.bottom + global.scrollY + 6;
    if (r.bottom + ph + 12 > global.innerHeight) top = r.top + global.scrollY - ph - 6;
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
    _weekPop = { el: pop, blockEl: blockEl, noteId: note.id };
    // Akcje 2×2 (Usuń z uzbrojeniem inline jak wszędzie).
    var delArmed = false;
    pop.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('button[data-pop]') : null;
      if (!b) return;
      var act = b.getAttribute('data-pop');
      if (act === 'done') { closeWeekPopover(); markDone(note); }
      else if (act === 'undone') { closeWeekPopover(); markUndone(note); }
      else if (act === 'postpone') { showPostponeMenu(b, note); }
      else if (act === 'edit') { closeWeekPopover(); editNote(note); }
      else if (act === 'del') {
        if (!delArmed) { delArmed = true; b.textContent = 'Na pewno usunąć?'; b.classList.add('is-armed'); return; }
        closeWeekPopover();
        deleteNote(note);
      }
      else if (act === 'stopseries') {
        if (!b.classList.contains('is-armed')) { b.textContent = 'Na pewno? To i przyszłe znikną'; b.classList.add('is-armed'); return; }
        closeWeekPopover();
        stopSeries(note, noteDayISO(note));
      }
      else if (act === 'delseries') {
        if (!b.classList.contains('is-armed')) { b.textContent = 'Na pewno usunąć całą serię?'; b.classList.add('is-armed'); return; }
        closeWeekPopover();
        stopSeries(note, null);
      }
    });
  }
  // Globalne połknięcie kliku przy otwartym popoverze (capture — przed handlerami
  // komórek/bloków): poza popoverem zamyka i NIC więcej; inny blok = przełączenie.
  function _bindWeekPopSwallow() {
    // DnD: click generowany po upuszczeniu bloku NIE może otworzyć popovera
    // ani trafić w komórkę — jednorazowo połykany (guard gaśnie też po 350 ms).
    doc.addEventListener('click', function (ev) {
      if (!_dragClickGuard) return;
      _dragClickGuard = false;
      ev.stopPropagation();
      ev.preventDefault();
    }, true);
    doc.addEventListener('click', function (ev) {
      if (!_weekPop) return;
      var t = ev.target;
      if (_weekPop.el.contains(t)) return; // wnętrze popovera działa normalnie
      var menu = t && t.closest ? t.closest('.tz-postpone-menu') : null;
      if (menu) return; // submenu „Przełóż" nad popoverem
      var otherBlock = t && t.closest ? t.closest('.tz-wb[data-note-id],.tz-hcard[data-note-id],.tz-row[data-note-id]') : null;
      var sameBlock = otherBlock && _weekPop.blockEl && (otherBlock === _weekPop.blockEl);
      closeWeekPopover();
      if (otherBlock && !sameBlock) return; // pozwól otworzyć nowy jednym klikiem
      ev.stopPropagation();
      ev.preventDefault();
    }, true);
  }

  // ── DRAG&DROP (2026-06-05): przeciąganie bloków w siatce tygodnia ───────────
  // Mysz: chwyt po >6px ruchu. Dotyk (tablet): long-press ~300 ms (ruch przed
  // upływem = scroll → rezygnacja; pointercancel też anuluje). Duch bloku pod
  // palcem/kursorem, wskaźnik celu ze snapem do 15 min; pas „Cały dzień" =
  // jawne wyzerowanie godziny (null). Drop = JEDNO savePatientNote (merge-by-id
  // zachowuje treść/czas trwania; sync LWW bez zmian). Escape anuluje.
  var _drag = null;
  var _dragClickGuard = false;
  function _dragTouchBlock(ev) { if (((_drag && _drag.active) || (_hdrag && _hdrag.active)) && ev.cancelable) ev.preventDefault(); }
  function _dragKey(ev) { if (ev.key === 'Escape') { _cancelWeekDrag(); _hCancel(); } }
  function _dragCancelEv() { _cancelWeekDrag(); }
  function _cancelWeekDrag() {
    if (!_drag) return;
    if (_drag.lp) clearTimeout(_drag.lp);
    if (_drag.ghost && _drag.ghost.parentNode) _drag.ghost.remove();
    if (_drag.ind && _drag.ind.parentNode) _drag.ind.remove();
    if (_drag.blk) _drag.blk.classList.remove('is-drag-src');
    if (_drag.allCell) _drag.allCell.classList.remove('is-drop');
    doc.removeEventListener('pointermove', _dragMove);
    doc.removeEventListener('pointerup', _dragUp);
    doc.removeEventListener('pointercancel', _dragCancelEv);
    doc.removeEventListener('keydown', _dragKey);
    doc.removeEventListener('touchmove', _dragTouchBlock);
    try { doc.body.classList.remove('tz-noselect'); } catch (_) {}
    _drag = null;
  }
  function _startWeekDrag() {
    if (!_drag || _drag.active) return;
    _drag.active = true;
    closeWeekPopover();
    closePostponeMenus();
    try { doc.body.classList.add('tz-noselect'); } catch (_) {}
    try { var _sel = global.getSelection && global.getSelection(); if (_sel && _sel.removeAllRanges) _sel.removeAllRanges(); } catch (_) {}

    var blk = _drag.blk;
    var r = blk.getBoundingClientRect();
    var g = blk.cloneNode(true);
    g.className = blk.className + ' tz-wb--ghost';
    g.style.cssText = 'position:fixed;left:0;top:0;width:' + Math.round(r.width) + 'px;'
      + 'height:' + Math.round(r.height) + 'px;margin:0;z-index:1000002;pointer-events:none;'
      + 'opacity:0.92;box-shadow:0 12px 30px rgba(0,40,48,0.28);';
    doc.body.appendChild(g);
    _drag.ghost = g;
    blk.classList.add('is-drag-src');
    var grid = blk.closest('.tz-wx');
    _drag.body = grid ? grid.querySelector('.tz-wx__bodyrel') : null;
    _drag.allRow = grid ? grid.querySelector('.tz-wx__all') : null;
    _drag.days = grid ? String(grid.getAttribute('data-days') || '').split(',') : [];
    _drag.startMin = _drag.body ? (parseInt(_drag.body.getAttribute('data-start-min'), 10) || 0) : 0;
    var dm = Number(_drag.note.durationMin);
    _drag.durMin = (dm > 0) ? dm : 30;
    var ind = doc.createElement('div');
    ind.className = 'tz-wx__dropind';
    ind.innerHTML = '<span></span>';
    if (_drag.body) _drag.body.appendChild(ind);
    _drag.ind = ind;
    doc.addEventListener('touchmove', _dragTouchBlock, { passive: false });
    try { if (_drag.type === 'touch' && global.navigator && global.navigator.vibrate) global.navigator.vibrate(10); } catch (_) {}
    _dragPlace(_drag.cx, _drag.cy);
  }
  function _dragPlace(x, y) {
    var d = _drag;
    if (!d || !d.active) return;
    d.ghost.style.transform = 'translate(' + Math.round(x - d.ghost.offsetWidth / 2) + 'px,' + Math.round(y - 14) + 'px)';
    d.target = null;
    if (d.allCell) { d.allCell.classList.remove('is-drop'); d.allCell = null; }
    d.ind.style.display = 'none';
    if (!d.body) return;
    var br = d.body.getBoundingClientRect();
    var colW = (br.width - 56) / 7;
    var ar = d.allRow ? d.allRow.getBoundingClientRect() : null;
    if (ar && y >= ar.top && y <= ar.bottom && x >= br.left + 56 && x <= br.right) {
      var ci = Math.min(6, Math.max(0, Math.floor((x - br.left - 56) / colW)));
      var cells = d.allRow.querySelectorAll('.tz-wx__cell--all');
      if (cells[ci]) { d.allCell = cells[ci]; d.allCell.classList.add('is-drop'); }
      d.target = { iso: d.days[ci], time: null };
      return;
    }
    if (x < br.left + 56 || x > br.right || y < br.top || y > br.bottom) return;
    var ci2 = Math.min(6, Math.max(0, Math.floor((x - br.left - 56) / colW)));
    var rawMin = d.startMin + (y - br.top) / 2;
    var endMin = d.startMin + br.height / 2;
    var m = Math.round(rawMin / 15) * 15;
    if (m < d.startMin) m = d.startMin;
    if (m + d.durMin > endMin) m = Math.max(d.startMin, Math.floor((endMin - d.durMin) / 15) * 15);
    var hh = hhOf(m);
    d.target = { iso: d.days[ci2], time: hh };
    d.ind.style.display = 'block';
    d.ind.style.top = ((m - d.startMin) * 2 + 1) + 'px';
    d.ind.style.height = Math.max(d.durMin * 2 - 2, 14) + 'px';
    d.ind.style.left = 'calc(56px + (100% - 56px)*' + (ci2 / 7).toFixed(5) + ' + 2px)';
    d.ind.style.width = 'calc((100% - 56px)*' + (1 / 7).toFixed(5) + ' - 5px)';
    d.ind.firstChild.textContent = hh;
  }
  function _dragMove(ev) {
    if (!_drag || ev.pointerId !== _drag.pid) return;
    _drag.cx = ev.clientX; _drag.cy = ev.clientY;
    if (!_drag.active) {
      var dx = ev.clientX - _drag.sx, dy = ev.clientY - _drag.sy;
      if ((dx * dx + dy * dy) > 36) {
        if (_drag.type === 'touch') { _cancelWeekDrag(); return; }
        _startWeekDrag();
      }
      return;
    }
    if (ev.cancelable) ev.preventDefault();
    _dragPlace(ev.clientX, ev.clientY);
  }
  function _dragUp(ev) {
    if (!_drag || ev.pointerId !== _drag.pid) return;
    if (!_drag.active) { _cancelWeekDrag(); return; } // zwykły klik → popover
    _dragClickGuard = true;
    setTimeout(function () { _dragClickGuard = false; }, 350);
    var t = _drag.target;
    var note = _drag.note;
    _cancelWeekDrag();
    if (!t || !t.iso) return; // upuszczenie poza siatką = anuluj
    var sameDay = (noteDayISO(note) === t.iso);
    var sameTime = ((note.dueTime || null) === t.time);
    if (sameDay && sameTime) return;
    var V = getVault();
    if (!V) return;
    var p = corePayload(note);
    p.dueDateISO = t.iso;
    p.dueTime = t.time; // null = jawne wyzerowanie (pas „Cały dzień")
    V.savePatientNote(p).then(refresh).catch(function (e) {
      try { global.alert('Nie udało się przenieść terminu: ' + (e && e.message || '')); } catch (_) {}
    });
  }
  function bindWeekDrag(container, lookup) {
    var grid = container.querySelector('.tz-wx');
    if (!grid || grid.__tzDragBound) return;
    grid.__tzDragBound = true;
    grid.addEventListener('pointerdown', function (ev) {
      if (_drag) return;
      if (ev.button !== undefined && ev.button !== 0) return;
      var blk = ev.target && ev.target.closest ? ev.target.closest('.tz-wb[data-note-id]') : null;
      if (!blk) return;
      var note = lookup[blk.getAttribute('data-note-id')];
      if (!note) return;
      _drag = { note: note, blk: blk, pid: ev.pointerId, type: ev.pointerType || 'mouse',
        sx: ev.clientX, sy: ev.clientY, cx: ev.clientX, cy: ev.clientY,
        active: false, lp: null, target: null };
      if (_drag.type === 'touch') _drag.lp = setTimeout(_startWeekDrag, 300);
      doc.addEventListener('pointermove', _dragMove);
      doc.addEventListener('pointerup', _dragUp);
      doc.addEventListener('pointercancel', _dragCancelEv);
      doc.addEventListener('keydown', _dragKey);
    });
  }

  // ── DRAG&DROP DNIA (mobile, 2026-06-05): karty osi godzinowej L2 ───────────
  // Long-press ~300 ms (wcześniejszy ruch >10px = scroll → rezygnacja); mysz:
  // chwyt po >6px. Duch karty + podświetlony slot (górna/dolna połowa = :00/:15
  // — snap 15 min) + dymek z godziną; strefa „Cały dzień" (wstawiana na czas
  // przeciągania) = jawny null. Auto-przewijanie przy krawędziach (pętla rAF).
  // Drop = JEDNO savePatientNote w obrębie tego samego dnia.
  var _hdrag = null;
  function _hCancel() {
    if (!_hdrag) return;
    if (_hdrag.lp) clearTimeout(_hdrag.lp);
    if (_hdrag.raf) global.cancelAnimationFrame(_hdrag.raf);
    if (_hdrag.ghost && _hdrag.ghost.parentNode) _hdrag.ghost.remove();
    if (_hdrag.bub && _hdrag.bub.parentNode) _hdrag.bub.remove();
    if (_hdrag.zone && _hdrag.zone.parentNode) _hdrag.zone.remove();
    if (_hdrag.card) _hdrag.card.classList.remove('is-drag-src');
    if (_hdrag.row) _hdrag.row.classList.remove('is-drop-row');
    doc.removeEventListener('pointermove', _hMove);
    doc.removeEventListener('pointerup', _hUp);
    doc.removeEventListener('pointercancel', _hCancelEv);
    doc.removeEventListener('keydown', _dragKey);
    doc.removeEventListener('touchmove', _dragTouchBlock);
    try { doc.body.classList.remove('tz-noselect'); } catch (_) {}
    _hdrag = null;
  }
  function _hCancelEv() { _hCancel(); }
  function _hStart() {
    if (!_hdrag || _hdrag.active) return;
    _hdrag.active = true;
    closePostponeMenus();
    try { doc.body.classList.add('tz-noselect'); } catch (_) {}
    try { var _sel = global.getSelection && global.getSelection(); if (_sel && _sel.removeAllRanges) _sel.removeAllRanges(); } catch (_) {}

    var card = _hdrag.card;
    var r = card.getBoundingClientRect();
    var g = card.cloneNode(true);
    g.className = card.className + ' tz-hcard--ghost';
    g.style.cssText = 'position:fixed;left:0;top:0;width:' + Math.round(r.width) + 'px;'
      + 'margin:0;z-index:1000002;pointer-events:none;opacity:0.92;box-shadow:0 12px 30px rgba(0,40,48,0.28);';
    doc.body.appendChild(g);
    _hdrag.ghost = g;
    card.classList.add('is-drag-src');
    // Strefa „Cały dzień" — widoczna TYLKO podczas przeciągania.
    var zone = doc.createElement('div');
    zone.className = 'tz-dropall';
    zone.textContent = 'Upuść tutaj — cały dzień (bez godziny)';
    if (_hdrag.hours && _hdrag.hours.parentNode) _hdrag.hours.parentNode.insertBefore(zone, _hdrag.hours);
    _hdrag.zone = zone;
    var bub = doc.createElement('div');
    bub.className = 'tz-hbubble';
    doc.body.appendChild(bub);
    _hdrag.bub = bub;
    doc.addEventListener('touchmove', _dragTouchBlock, { passive: false });
    try { if (_hdrag.type === 'touch' && global.navigator && global.navigator.vibrate) global.navigator.vibrate(10); } catch (_) {}
    _hPlace(_hdrag.cx, _hdrag.cy);
    _hdrag.raf = global.requestAnimationFrame(_hTick);
  }
  function _hTick() {
    if (!_hdrag || !_hdrag.active) return;
    // AUTO-SCROLL: im bliżej krawędzi, tym szybciej (oś dnia dłuższa niż ekran).
    var vh = global.innerHeight || doc.documentElement.clientHeight || 0;
    var y = _hdrag.cy;
    var dy = 0;
    if (y < 90) dy = -Math.ceil((90 - y) * 0.35);
    else if (y > vh - 90) dy = Math.ceil((y - (vh - 90)) * 0.35);
    if (dy) global.scrollBy(0, dy);
    _hPlace(_hdrag.cx, _hdrag.cy);
    _hdrag.raf = global.requestAnimationFrame(_hTick);
  }
  function _hPlace(x, y) {
    var d = _hdrag;
    if (!d || !d.active) return;
    d.ghost.style.transform = 'translate(' + Math.round(x - d.ghost.offsetWidth / 2) + 'px,' + Math.round(y - 18) + 'px)';
    d.target = null;
    if (d.row) { d.row.classList.remove('is-drop-row'); d.row = null; }
    d.zone.classList.remove('is-drop');
    d.bub.style.display = 'none';
    var zr = d.zone.getBoundingClientRect();
    if (y >= zr.top && y <= zr.bottom && x >= zr.left && x <= zr.right) {
      d.zone.classList.add('is-drop');
      d.target = { time: null };
      return;
    }
    // CIĄGŁA OŚ: minuta z interpolacji położenia w slocie (martwe szczeliny
    // między wierszami → najbliższy slot), ZAOKRĄGLONA do najbliższych 15 min.
    // Stary wariant „połówkowy" wymagał celowania w dół slotu i w praktyce
    // dawał głównie :00/:30 — stąd wrażenie snapa co 30 minut.
    var rows = d.hours ? d.hours.querySelectorAll('.tz-hslot') : [];
    var info = [], i, rr, hhEl, base;
    for (i = 0; i < rows.length; i += 1) {
      hhEl = rows[i].querySelector('.tz-hh');
      base = hhEl ? slotMinOf(hhEl.textContent) : NaN;
      if (isNaN(base)) continue;
      rr = rows[i].getBoundingClientRect();
      info.push({ el: rows[i], base: base, top: rr.top, bottom: rr.bottom });
    }
    if (!info.length) return;
    if (y < info[0].top - 8 || y > info[info.length - 1].bottom + 8) return; // poza osią
    var seg = null, bestDist = Infinity, dist;
    for (i = 0; i < info.length; i += 1) {
      if (y >= info[i].top && y <= info[i].bottom) { seg = info[i]; break; }
      dist = (y < info[i].top) ? (info[i].top - y) : (y - info[i].bottom);
      if (dist < bestDist) { bestDist = dist; seg = info[i]; }
    }
    var frac = (y - seg.top) / Math.max(seg.bottom - seg.top, 1);
    if (frac < 0) frac = 0;
    if (frac > 1) frac = 1;
    var m = Math.round((seg.base + frac * 30) / 15) * 15; // snap 15 min
    var lastBase = info[info.length - 1].base;
    if (m > lastBase + 15) m = lastBase + 15;
    if (m < info[0].base) m = info[0].base;
    var rowSeg = seg;
    for (i = 0; i < info.length; i += 1) {
      if (m >= info[i].base && m < info[i].base + 30) { rowSeg = info[i]; break; }
    }
    d.row = rowSeg.el;
    d.row.classList.add('is-drop-row');
    d.target = { time: hhOf(m) };
    // Dymek zakotwiczony przy LEWEJ krawędzi przenoszonej wizyty (ducha).
    d.bub.textContent = hhOf(m);
    d.bub.style.display = 'block';
    d.bub.style.left = Math.max(60, Math.round(x - d.ghost.offsetWidth / 2 - 8)) + 'px';
    d.bub.style.top = Math.round(y) + 'px';
  }
  function _hMove(ev) {
    if (!_hdrag || ev.pointerId !== _hdrag.pid) return;
    _hdrag.cx = ev.clientX; _hdrag.cy = ev.clientY;
    if (!_hdrag.active) {
      var dx = ev.clientX - _hdrag.sx, dy = ev.clientY - _hdrag.sy;
      var d2 = dx * dx + dy * dy;
      if (_hdrag.type === 'touch') { if (d2 > 100) _hCancel(); } // ruch przed long-press = scroll
      else if (d2 > 36) _hStart();
      return;
    }
    if (ev.cancelable) ev.preventDefault();
    _hPlace(ev.clientX, ev.clientY);
  }
  function _hUp(ev) {
    if (!_hdrag || ev.pointerId !== _hdrag.pid) return;
    if (!_hdrag.active) { _hCancel(); return; } // zwykły tap → akcje jak dotąd
    _dragClickGuard = true;
    setTimeout(function () { _dragClickGuard = false; }, 350);
    var t = _hdrag.target;
    var note = _hdrag.note;
    _hCancel();
    if (!t) return; // poza osią = anuluj
    if ((note.dueTime || null) === t.time) return;
    var V = getVault();
    if (!V) return;
    var p = corePayload(note);
    p.dueTime = t.time; // null = cały dzień; data bez zmian
    V.savePatientNote(p).then(refresh).catch(function (e) {
      try { global.alert('Nie udało się przenieść terminu: ' + (e && e.message || '')); } catch (_) {}
    });
  }
  function bindDayDrag(container, lookup) {
    var hours = container.querySelector('.tz-hours');
    if (!hours) return; // tylko widoki dnia (mobile L2 / desktop oś)
    var panel = hours.closest('.tz-day-panel') || hours;
    if (panel.__tzDragBound) return;
    panel.__tzDragBound = true;
    panel.addEventListener('pointerdown', function (ev) {
      if (_hdrag || _drag) return;
      if (ev.button !== undefined && ev.button !== 0) return;
      var card = ev.target && ev.target.closest
        ? ev.target.closest('.tz-hcard[data-note-id],.tz-row--dnd[data-note-id]') : null;
      if (!card) return;
      if (ev.target.closest('.tz-actions') || ev.target.closest('button')) return; // akcje bez chwytu
      var note = lookup[card.getAttribute('data-note-id')];
      if (!note) return;
      _hdrag = { note: note, card: card, hours: hours, pid: ev.pointerId,
        type: ev.pointerType || 'mouse', sx: ev.clientX, sy: ev.clientY,
        cx: ev.clientX, cy: ev.clientY, active: false, lp: null, target: null, row: null };
      if (_hdrag.type === 'touch') _hdrag.lp = setTimeout(_hStart, 300);
      doc.addEventListener('pointermove', _hMove);
      doc.addEventListener('pointerup', _hUp);
      doc.addEventListener('pointercancel', _hCancelEv);
      doc.addEventListener('keydown', _dragKey);
    });
  }

  function closePostponeMenus() {
    var ms = doc.querySelectorAll('.tz-postpone-menu');
    for (var i = 0; i < ms.length; i += 1) ms[i].remove();
  }
  function showPostponeMenu(anchorBtn, note) {
    closePostponeMenus();
    var menu = doc.createElement('div');
    menu.className = 'tz-postpone-menu';
    [['+1 tydzień', 7], ['+1 miesiąc', 30], ['+3 miesiące', 91], ['+6 miesięcy', 182]].forEach(function (opt) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.textContent = opt[0];
      b.addEventListener('click', function () { closePostponeMenus(); postpone(note, opt[1]); });
      menu.appendChild(b);
    });
    var rect = anchorBtn.getBoundingClientRect();
    menu.style.left = Math.max(8, rect.left + global.scrollX - 40) + 'px';
    menu.style.top = (rect.bottom + global.scrollY + 4) + 'px';
    doc.body.appendChild(menu);
    setTimeout(function () {
      doc.addEventListener('click', function onOut(ev) {
        if (!menu.contains(ev.target)) { closePostponeMenus(); doc.removeEventListener('click', onOut, true); }
      }, true);
    }, 0);
  }

  // ── Render: wspólne klocki ──────────────────────────────────────────────────
  function root() { return doc.getElementById('terminarzRoot'); }

  function noteRowHtml(n, opts) {
    opts = opts || {};
    var done = !!n.completedAtISO;
    var cat = CAT_LABEL[n.category] || n.category || '';
    // KROK 2: każdy wiersz w .tz-swipe-wrap z czerwonym tłem pod spodem —
    // na mobile przeciągnięcie w lewo odsłania/usuwa (gest delegowany z roota);
    // na desktopie wrap jest neutralny (gest nieaktywny, tło niewidoczne).
    // L1 (decyzja UX 2026-06-05): wariant COMPACT — pigułka godziny PIERWSZA,
    // nazwisko i tytuł w JEDNEJ linii z wielokropkiem, meta progresywne
    // (opts.metaLine: dzień/wyniki tak, tydzień/panel miesiąca nie).
    var mainHtml;
    if (opts.compact) {
      mainHtml = ''
        + '<span class="tz-time-pill' + (n.dueTime ? '' : ' is-all') + (done ? ' is-done-pill' : '') + '">'
        + (n.dueTime ? esc(n.dueTime) : 'cały<br>dzień') + '</span>'
        + '<div class="tz-row__main">'
        + '<div class="tz-row__line">'
        + (opts.hidePatient ? '' : ('<span class="tz-row__patient">' + esc(nmOf(n)) + '</span>'))
        + ((n.title || n.body)
          ? ('<span class="tz-row__title-in' + (done ? ' is-done-tt' : '') + '">'
            + (opts.hidePatient ? '' : '— ') + esc(n.title || n.body) + '</span>')
          : '')
        + '</div>'
        + (opts.metaLine
          ? ('<div class="tz-row__meta">'
            + '<span class="tz-mini">' + esc(cat) + (n.durationMin ? ' · ' + durLabel(n) : '') + '</span>'
            + (n.isExternal ? '<span class="tz-mini">spoza bazy</span>' : '')
            + (opts.withDate ? '<span class="tz-mini">' + esc(plDate(noteDayISO(n))) + '</span>' : '')
            + (done ? '<span class="tz-mini">wykonane</span>' : '')
            + '</div>')
          : '')
        + '</div>';
    } else {
      mainHtml = ''
        + '<div class="tz-row__main">'
        + (opts.hidePatient ? '' : ('<div class="tz-row__patient">' + esc(nmOf(n))
          + (n.isExternal ? ' <span class="tz-ext-mark">spoza bazy</span>' : '') + '</div>'))
        + ((n.title || n.body) ? ('<div class="tz-row__title">' + esc(n.title || n.body) + '</div>') : '')
        + '<div class="tz-row__meta">'
        + (n.dueTime ? '<span class="tz-badge tz-badge--time">' + esc(n.dueTime) + '</span>' : '')
        + '<span class="tz-badge">' + esc(cat) + '</span>'
        + (opts.withDate ? ('termin: ' + esc(plDate(noteDayISO(n)))) : '')
        + (done ? ' · wykonane' : '') + '</div>'
        + '</div>';
    }
    return ''
      + '<div class="tz-swipe-wrap">'
      + '<div class="tz-swipe-bg" data-swipe-del="' + esc(n.id) + '">🗑 Usuń</div>'
      + '<div class="tz-row' + (done ? ' is-done' : '') + (opts.overdue ? ' is-overdue' : '')
      + (opts.compact ? ' tz-row--c' : '') + (opts.dnd ? ' tz-row--dnd' : '') + ' ' + (CAT_CLASS[n.category] || '') + '" data-note-id="' + esc(n.id) + '">'
      + mainHtml
      + '<div class="tz-actions">'
      + (opts.compact
        // KOMPAKT (mobile, wyniki wyszukiwania): ✓/↺ + menu ⋮ — pełne przyciski
        // zgniatały kolumnę tytułu do łamania słów co znak. DYŻUR: bez ✓.
        ? ((isDuty(n) ? '' : (done
          ? '<button type="button" data-act="undone" aria-label="Cofnij wykonanie">↺</button>'
          : '<button type="button" class="tz-done-btn" data-act="done" aria-label="Oznacz wykonane">✓</button>'))
          + '<button type="button" data-act="more" aria-label="Więcej akcji">⋮</button>')
        : ((isDuty(n) ? '' : (done
          ? '<button type="button" data-act="undone">↺ Cofnij</button>'
          : '<button type="button" class="tz-done-btn" data-act="done">✓ Wykonane</button>'
            + '<button type="button" data-act="postpone">↻ Przełóż</button>'))
          + '<button type="button" data-act="edit">✎ Edytuj</button>'
          // SEARCH: skok do dnia wydarzenia (czyści wyszukiwanie, otwiera widok Dzień).
          + (opts.gotoDay ? '<button type="button" data-act="goto">→ dzień</button>' : '')
          // KROK 1: usuwanie z pełnych akcji (desktop) — uzbrajanie inline.
          + '<button type="button" class="tz-del-btn" data-act="del" aria-label="Usuń wpis">🗑</button>'))
      + '</div>'
      + '</div>'
      + '</div>';
  }

  // Skok do dnia wydarzenia — wspólny dla akcji „→ dzień", menu ⋮ i osi czasu.
  function gotoNoteDay(iso) {
    state.anchorISO = iso || todayISO();
    state.searchOpen = false;
    setView('day'); // setView czyści resztę stanu wyszukiwania
  }
  // Wspólna arytmetyka slotów 30-minutowych (oś dnia mobile/desktop + tydzień).
  function slotMinOf(t) { var p = String(t).split(':'); return (+p[0]) * 60 + (+p[1]); }
  function slotRange(timedNotes) {
    var startMin = 8 * 60, endMin = 15 * 60;
    timedNotes.forEach(function (n) {
      var m0 = Math.floor(slotMinOf(n.dueTime) / 30) * 30;
      var m1 = Math.ceil((slotMinOf(n.dueTime) + (n.durationMin > 0 ? n.durationMin : 30)) / 30) * 30;
      if (m0 < startMin) startMin = m0;
      if (m1 > endMin) endMin = m1;
    });
    return { startMin: startMin, endMin: endMin };
  }
  function hhOf(mm) { return pad(Math.floor(mm / 60)) + ':' + pad(mm % 60); }

  // ── TERMINARZ-SERIE (2026-06-06): cykliczne zajęcia ─────────────────────────
  // Materializacja: seria = ZWYKŁE notatki połączone seriesId (każde wystąpienie
  // dziedziczy drag/✓/przełóż/usuń/sync). Generator pomija święta państwowe
  // (decyzja: pomiń, nie przesuwaj) i opcjonalnie weekendy. Twardy limit 120.
  var SERIES_MAX = 120;
  function newSeriesId() {
    try { if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID(); } catch (_) {}
    return 's' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function _monKey(dt) {
    var x = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return Math.round(x.getTime() / 86400000);
  }
  // rep: 'w1'|'w2'|'m1'; dows: [0..6] (getDay); end: {mode:'m6'|'until'|'count', untilISO?, count?}
  // → { dates: [ISO…], skippedHol: n, capped: bool }
  function genSeriesDates(startISO, repMode, dows, end, skipHol, skipWknd) {
    var out = [];
    var skipped = 0;
    var start = parseISO(startISO);
    if (!start) return { dates: out, skippedHol: 0, capped: false };
    var horizon;
    var maxCount = SERIES_MAX;
    if (end && end.mode === 'until' && end.untilISO) horizon = parseISO(end.untilISO);
    else if (end && end.mode === 'count') {
      maxCount = Math.max(1, Math.min(parseInt(end.count, 10) || 12, SERIES_MAX));
      horizon = new Date(start.getFullYear() + 3, start.getMonth(), start.getDate()); // bezpiecznik
    } else {
      horizon = new Date(start.getFullYear(), start.getMonth() + 6, start.getDate()); // domyślnie 6 mies.
    }
    if (!horizon || horizon < start) return { dates: out, skippedHol: 0, capped: false };
    var domAnchor = start.getDate();
    var d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    var guard = 0;
    while (out.length < maxCount && d <= horizon && guard < 1200) {
      guard += 1;
      var matches = false;
      if (repMode === 'm1') {
        matches = (d.getDate() === domAnchor); // miesiąc bez tej daty (29–31) = pominięty
      } else {
        var inDows = dows.indexOf(d.getDay()) >= 0;
        if (repMode === 'w1') matches = inDows;
        else if (repMode === 'w2') matches = inDows && (Math.round((_monKey(d) - _monKey(start)) / 7) % 2 === 0);
      }
      if (matches) {
        var iso = dayISO(d);
        var isHol = !!holidayName(iso);
        var isWk = (d.getDay() === 0 || d.getDay() === 6);
        if (skipHol && isHol) skipped += 1;
        else if (!(skipWknd && isWk)) out.push(iso);
      }
      d.setDate(d.getDate() + 1);
    }
    return { dates: out, skippedHol: skipped, capped: out.length >= maxCount && d <= horizon };
  }
  // Stop serii: usuń wystąpienia ≥ fromISO (null = całą serię); przeszłość zostaje
  // przy „od tego dnia". Tombstony przez istniejący removePatientNote (sync OK).
  function stopSeries(note, fromISO) {
    var V = getVault();
    if (!V || typeof V.listPatientNotesBySeries !== 'function' || !note || !note.seriesId) return Promise.resolve();
    return V.listPatientNotesBySeries(note.seriesId).then(function (list) {
      var doomed = (list || []).filter(function (n) {
        return fromISO ? ((noteDayISO(n) || '') >= fromISO) : true;
      });
      var chain = Promise.resolve();
      doomed.forEach(function (n) { chain = chain.then(function () { return V.removePatientNote(n.id); }); });
      return chain;
    }).then(refresh).catch(function (e) {
      try { global.alert('Nie udało się zatrzymać serii: ' + (e && e.message || '')); } catch (_) {}
    });
  }

  // KOMPAKT: menu „Więcej" (⋮ / blok tygodnia) — opcjonalnie z ✓ na czele.
  function showMoreMenu(anchorBtn, note, menuOpts) {
    closePostponeMenus();
    var menu = doc.createElement('div');
    menu.className = 'tz-postpone-menu';
    var optsList = [];
    if (menuOpts && menuOpts.withDone && !isDuty(note)) {
      optsList.push([note.completedAtISO ? '↺ Cofnij wykonanie' : '✓ Wykonane',
        function () { (note.completedAtISO ? markUndone : markDone)(note); }]);
    }
    if (!note.completedAtISO && !isDuty(note)) optsList.push(['↻ Przełóż', function () { showPostponeMenu(anchorBtn, note); }]);
    optsList.push(['✎ Edytuj', function () { editNote(note); }]);
    optsList.push(['→ dzień', function () { gotoNoteDay(noteDayISO(note)); }]);
    optsList.forEach(function (opt) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.textContent = opt[0];
      b.addEventListener('click', function () { closePostponeMenus(); opt[1](); });
      menu.appendChild(b);
    });
    // KROK 1: „Usuń" na czerwono, na końcu menu, z potwierdzeniem INLINE
    // (pierwszy klik uzbraja — „Na pewno usunąć?", drugi usuwa; natywny confirm
    // brzydko wygląda w standalone PWA). Klik poza menu = anulowanie.
    var delBtn = doc.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'tz-menu-del';
    delBtn.textContent = '🗑 Usuń';
    var _armed = false;
    delBtn.addEventListener('click', function () {
      if (!_armed) {
        _armed = true;
        delBtn.textContent = 'Na pewno usunąć?';
        delBtn.classList.add('is-armed');
        return;
      }
      closePostponeMenus();
      deleteNote(note);
    });
    menu.appendChild(delBtn);
    // TERMINARZ-SERIE: zakresy odwołania także w menu ⋮ (mobile/listy).
    if (note.seriesId) {
      [['⏹ Zatrzymaj serię od tego dnia', 'Na pewno? To i przyszłe znikną', noteDayISO(note)],
       ['Usuń całą serię', 'Na pewno usunąć całą serię?', null]].forEach(function (sd) {
        var sb = doc.createElement('button');
        sb.type = 'button';
        sb.className = 'tz-menu-del';
        sb.textContent = sd[0];
        var _sArmed = false;
        sb.addEventListener('click', function () {
          if (!_sArmed) { _sArmed = true; sb.textContent = sd[1]; sb.classList.add('is-armed'); return; }
          closePostponeMenus();
          stopSeries(note, sd[2]);
        });
        menu.appendChild(sb);
      });
    }
    var rect = anchorBtn.getBoundingClientRect();
    menu.style.left = Math.max(8, rect.left + global.scrollX - 120) + 'px';
    menu.style.top = (rect.bottom + global.scrollY + 4) + 'px';
    doc.body.appendChild(menu);
    setTimeout(function () {
      doc.addEventListener('click', function onOut(ev) {
        if (!menu.contains(ev.target)) { closePostponeMenus(); doc.removeEventListener('click', onOut, true); }
      }, true);
    }, 0);
  }

  function bindRowActions(container, lookup) {
    // KROK 2: gest swipe (delegowany z roota) czyta notatki po id — akumulujemy
    // lookup na rootcie (swapy wyników dokładają swoje wpisy).
    try {
      var _r = root();
      if (_r) {
        _r.__tzRowLookup = _r.__tzRowLookup || {};
        Object.keys(lookup).forEach(function (k) { _r.__tzRowLookup[k] = lookup[k]; });
      }
    } catch (_) { /* noop */ }
    var rows = container.querySelectorAll('.tz-row, .tz-hcard');
    for (var i = 0; i < rows.length; i += 1) {
      (function (row) {
        var note = lookup[row.getAttribute('data-note-id')];
        if (!note) return;
        var btns = row.querySelectorAll('button[data-act]');
        for (var j = 0; j < btns.length; j += 1) {
          (function (btn) {
            btn.addEventListener('click', function (ev) {
              ev.stopPropagation();
              var act = btn.getAttribute('data-act');
              if (act === 'done') markDone(note);
              else if (act === 'undone') markUndone(note);
              else if (act === 'postpone') showPostponeMenu(btn, note);
              else if (act === 'edit') editNote(note);
              else if (act === 'more') showMoreMenu(btn, note);
              else if (act === 'goto') gotoNoteDay(noteDayISO(note));
              else if (act === 'del') {
                // Uzbrajanie inline: 1. klik → „Na pewno?" (3 s na decyzję),
                // 2. klik → usunięcie. Timeout cofa uzbrojenie.
                if (btn.getAttribute('data-armed') === '1') {
                  deleteNote(note);
                  return;
                }
                btn.setAttribute('data-armed', '1');
                btn.classList.add('is-armed');
                btn.textContent = 'Na pewno?';
                setTimeout(function () {
                  if (!btn.isConnected) return;
                  btn.removeAttribute('data-armed');
                  btn.classList.remove('is-armed');
                  btn.textContent = '🗑';
                }, 3000);
              }
            });
          })(btns[j]);
        }
      })(rows[i]);
    }
    // Cykl C: przyciski „Karta pacjenta" (D2) — poza .tz-row.
    var opens = container.querySelectorAll('[data-open-patient]');
    for (var k = 0; k < opens.length; k += 1) {
      (function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          openPatientCard(btn.getAttribute('data-open-patient'), btn.getAttribute('data-focus-note') || null);
        });
      })(opens[k]);
    }
    // FILTR PACJENTA: klik w pasek chipa = zawęź wyniki; × = pokaż wszystkie.
    var sels = container.querySelectorAll('.tz-sugg[data-select-pid]');
    for (var sl = 0; sl < sels.length; sl += 1) {
      (function (bar) {
        bar.addEventListener('click', function () {
          state.searchSelPid = bar.getAttribute('data-select-pid');
          state.searchSelName = bar.getAttribute('data-select-name') || '';
          _swapSearchResultsBox();
        });
      })(sels[sl]);
    }
    var clearSel = container.querySelector('[data-clear-sel]');
    if (clearSel) clearSel.addEventListener('click', function (ev) {
      ev.stopPropagation();
      state.searchSelPid = null; state.searchSelName = null;
      _swapSearchResultsBox();
    });
    // POPOVER V1: blok wizyty w siatce tygodnia → scalona karta szczegółów.
    var wblocks = container.querySelectorAll('.tz-wb[data-note-id]');
    for (var wb = 0; wb < wblocks.length; wb += 1) {
      (function (blk) {
        blk.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var note = lookup[blk.getAttribute('data-note-id')];
          if (note) showWeekPopover(blk, note);
        });
      })(wblocks[wb]);
    }
    bindWeekDrag(container, lookup); // DnD: chwyt myszą / long-press na tablecie
    // POPOVER w DNIU (mobile): tap w kartę/wiersz = scalona karta szczegółów
    // (jak klik bloku w tygodniu na desktopie). Przyciski akcji bez zmian.
    if (isMobile()) {
      var dayPanelHours = container.querySelector('.tz-hours');
      var dayPanel = dayPanelHours ? (dayPanelHours.closest('.tz-day-panel') || dayPanelHours) : null;
      if (dayPanel && !dayPanel.__tzTapPop) {
        dayPanel.__tzTapPop = true;
        dayPanel.addEventListener('click', function (ev) {
          var el = ev.target && ev.target.closest
            ? ev.target.closest('.tz-hcard[data-note-id],.tz-row[data-note-id]') : null;
          if (!el) return;
          if (ev.target.closest('button') || ev.target.closest('.tz-actions')) return;
          var wrap2 = el.closest ? el.closest('.tz-swipe-wrap') : null;
          if (wrap2 && wrap2.classList.contains('is-open-swipe')) return; // uchylony wiersz
          var note = lookup[el.getAttribute('data-note-id')];
          if (!note) return;
          ev.stopPropagation();
          showWeekPopover(el, note);
        });
      }
    }
    bindDayDrag(container, lookup);  // DnD dnia (mobile): long-press na karcie osi
    // S3: chip sugestii „Oś czasu →" + zamknięcie osi + klik wpisu osi → dzień.
    var tls = container.querySelectorAll('[data-timeline-pid]');
    for (var t = 0; t < tls.length; t += 1) {
      (function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          openSearchTimeline(btn.getAttribute('data-timeline-pid'), btn.getAttribute('data-timeline-name') || '');
        });
      })(tls[t]);
    }
    var tlClose = container.querySelector('#tzTlClose');
    if (tlClose) tlClose.addEventListener('click', function () {
      state.searchTlPid = null; state.searchTlName = null; state.searchTlEvents = [];
      _swapSearchResultsBox();
    });
    var tlItems = container.querySelectorAll('.tz-tl__item[data-goto-day]');
    for (var ti = 0; ti < tlItems.length; ti += 1) {
      (function (it) {
        it.addEventListener('click', function () { gotoNoteDay(it.getAttribute('data-goto-day')); });
      })(tlItems[ti]);
    }
  }

  function navLabel() {
    var a = parseISO(state.anchorISO);
    if (state.view === 'week') {
      var r = weekRange(state.anchorISO);
      var s = r.start, e = r.end;
      if (s.getMonth() === e.getMonth()) {
        return s.getDate() + '–' + e.getDate() + ' ' + MONTHS_GEN[s.getMonth()] + ' ' + s.getFullYear();
      }
      var sY = s.getFullYear() === e.getFullYear() ? '' : (' ' + s.getFullYear());
      return s.getDate() + ' ' + MONTHS_GEN[s.getMonth()] + sY + ' – ' + e.getDate() + ' ' + MONTHS_GEN[e.getMonth()] + ' ' + e.getFullYear();
    }
    if (state.view === 'day') {
      var wd = WEEKDAYS_FULL[(a.getDay() + 6) % 7];
      return wd + ', ' + a.getDate() + ' ' + MONTHS_GEN[a.getMonth()] + ' ' + a.getFullYear();
    }
    return MONTHS[a.getMonth()] + ' ' + a.getFullYear();
  }

  function headerHtml() {
    // H2 (decyzja UX 2026-06-05): miesiąc/tydzień/dzień JEST tytułem strony —
    // jedna linia: ‹ tytuł › Dziś · przełącznik · + Nowy termin. Bez podtytułu;
    // nazwę strony niesie sidebar, a dla czytników ekranu ukryty <h1>.
    var prevLbl = state.view === 'month' ? 'Poprzedni miesiąc' : (state.view === 'week' ? 'Poprzedni tydzień' : 'Poprzedni dzień');
    var nextLbl = state.view === 'month' ? 'Następny miesiąc' : (state.view === 'week' ? 'Następny tydzień' : 'Następny dzień');
    return ''
      + '<h1 class="tz-sr">Terminarz kliniczny</h1>'
      + '<div class="tz-topbar">'
      // Strzałki OBOK SIEBIE przed tytułem (wzorzec Google Calendar): zmienna
      // długość etykiety (Czerwiec/Październik, zakresy tygodnia, pełne daty
      // dnia) nie może przesuwać przycisków pod kursorem przy przewijaniu.
      + '<div class="tz-nav">'
      + '<button type="button" id="tzPrev" aria-label="' + prevLbl + '">‹</button>'
      + '<button type="button" id="tzNext" aria-label="' + nextLbl + '">›</button>'
      + '<button type="button" id="tzToday">Dziś</button>'
      + '<span class="tz-title">' + esc(navLabel()) + '</span>'
      + '</div>'
      + '<span class="tz-topbar__sp"></span>'
      // SEARCH: lupa przełącza pasek wyszukiwania (pełna szerokość pod topbarem).
      + '<button type="button" id="tzSearchBtn" class="tz-search-btn" aria-label="Szukaj w terminarzu"'
      + (state.searchOpen ? ' data-on="1"' : '') + '>🔍</button>'
      // M2 mobile: „Dziś" w linii przełącznika (w pierwszej linii zostają tylko
      // ‹ tytuł › rozsunięte do krawędzi). Na desktopie ukryty — tam działa
      // tzToday w .tz-nav.
      + '<button type="button" id="tzTodayM" class="tz-today-m">Dziś</button>'
      + '<div class="tz-switch" role="tablist" aria-label="Widok terminarza">'
      + '<button type="button" data-view="month" class="' + (state.view === 'month' ? 'is-active' : '') + '">Miesiąc</button>'
      + '<button type="button" data-view="week" class="' + (state.view === 'week' ? 'is-active' : '') + '">Tydzień</button>'
      + '<button type="button" data-view="day" class="' + (state.view === 'day' ? 'is-active' : '') + '">Dzień</button>'
      + '</div>'
      + '<button type="button" id="tzAddBtn" class="tz-add-btn">+ Nowy termin</button>'
      + '</div>'
      + (state.searchOpen
        ? ('<div class="tz-searchbar">'
          + '<input type="text" id="tzSearchInput" autocomplete="off" placeholder="Szukaj: pacjent, osoba, tytuł…" value="' + esc(state.searchQ) + '">'
          + '<button type="button" id="tzSearchClear" aria-label="Zamknij wyszukiwanie">×</button>'
          + '</div>')
        : '');
  }

  // ── SEARCH (2026-06-05): wyniki wyszukiwania zamiast siatki ─────────────────
  function _searchActive() { return state.searchOpen && state.searchQ.trim().length >= 2; }
  // Fold jak w vaultcie (lokalna kopia — funkcja vaulta jest prywatna).
  function _fold(s) {
    s = String(s || '').toLowerCase();
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) { /* noop */ }
    return s.replace(/ł/g, 'l');
  }
  // Etykieta względna terminu („dziś", „za 6 dni", „3 mies. temu").
  function relDayLabel(iso) {
    var t = parseISO(todayISO());
    var d = parseISO(iso);
    var diff = Math.round((d - t) / 86400000);
    if (diff === 0) return 'dziś';
    if (diff === 1) return 'jutro';
    if (diff === -1) return 'wczoraj';
    if (diff > 1 && diff <= 45) return 'za ' + diff + ' dni';
    if (diff > 45) return 'za ' + Math.round(diff / 30.44) + ' mies.';
    if (diff < -1 && diff >= -45) return Math.abs(diff) + ' dni temu';
    return Math.round(Math.abs(diff) / 30.44) + ' mies. temu';
  }
  function _dateHeadHtml(iso) {
    var d = parseISO(iso);
    var wd = WEEKDAYS_FULL[(d.getDay() + 6) % 7];
    var hol = holidayName(iso);
    return '<div class="tz-dhead">' + esc(wd + ', ' + d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + ' ' + d.getFullYear())
      + ' <span class="tz-dhead__rel">· ' + esc(relDayLabel(iso)) + '</span>'
      + (hol ? ' <span class="tz-holiday-inline">· ' + esc(hol) + '</span>' : '') + '</div>';
  }

  // S3: oś czasu pacjenta z bazy — wszystkie jego wydarzenia chronologicznie
  // ze znacznikiem DZIŚ między minionymi a nadchodzącymi. Klik wpisu → dzień.
  function searchTimelineHtml(lookup) {
    var ev = state.searchTlEvents || [];
    var html = '<div class="tz-day-panel" id="tzSearchResults">'
      + '<div class="tz-tlhead">'
      + '<span class="tz-card__ava">' + esc(initials(state.searchTlName)) + '</span>'
      + '<span class="tz-tlhead__name">' + esc(state.searchTlName || '') + '</span>'
      + '<button type="button" class="tz-card__open" data-open-patient="' + esc(state.searchTlPid) + '" data-focus-note="">Karta pacjenta</button>'
      + '<button type="button" id="tzTlClose" aria-label="Zamknij oś czasu">×</button>'
      + '</div>';
    if (!ev.length) {
      html += '<div class="tz-empty">Brak wydarzeń w terminarzu dla tego pacjenta. Dodaj termin przyciskiem „+ Nowy termin”.</div></div>';
      return html;
    }
    var tISO = todayISO();
    var sorted = ev.slice().sort(function (a, b) { return (noteDayISO(a) || '') < (noteDayISO(b) || '') ? -1 : 1; });
    html += '<div class="tz-tl">';
    var todayInserted = false;
    for (var i = 0; i < sorted.length; i += 1) {
      var n = sorted[i];
      var iso = noteDayISO(n);
      if (!todayInserted && iso >= tISO) {
        html += '<div class="tz-tl__today"><span>DZIŚ</span></div>';
        todayInserted = true;
      }
      lookup[n.id] = n;
      var done = !!n.completedAtISO;
      html += '<div class="tz-tl__item ' + (CAT_CLASS[n.category] || '') + '" data-goto-day="' + esc(iso) + '">'
        + '<span class="tz-tl__dot ' + (done ? 'is-done-dot' : (CAT_CLASS[n.category] || '')) + '"></span>'
        + '<div class="tz-tl__meta">' + esc(plDate(iso)) + (n.dueTime ? ' ' + esc(n.dueTime) : '') + ' · ' + esc(done ? 'wykonane' : relDayLabel(iso)) + '</div>'
        + '<div class="tz-tl__title' + (done ? ' is-done' : '') + '">' + esc(n.title || n.body || nmOf(n))
        + ' <span class="tz-badge">' + esc(CAT_LABEL[n.category] || n.category || '') + '</span></div>'
        + '</div>';
    }
    if (!todayInserted) html += '<div class="tz-tl__today"><span>DZIŚ</span></div>';
    html += '</div></div>';
    return html;
  }

  function searchResultsHtml(lookup) {
    // S3 aktywne → oś czasu zamiast listy wyników.
    if (state.searchTlPid) return searchTimelineHtml(lookup);
    var res = state.searchResults || [];
    var q = state.searchQ.trim();
    var html = '<div class="tz-day-panel" id="tzSearchResults">';
    // FOKUS-FIX: kontener istnieje też PONIŻEJ progu 2 znaków (podpowiedź) —
    // dzięki temu każda litera podmienia tylko ten kontener, nigdy cały
    // nagłówek z inputem (pełny render zabijał fokus po każdym znaku).
    if (q.length < 2) {
      html += '<div class="tz-empty">Wpisz co najmniej 2 znaki, aby przeszukać terminarz (pacjent, osoba, tytuł, treść).</div></div>';
      return html;
    }
    // FILTR PACJENTA (decyzja UX 2026-06-05): klik w PASEK chipa wybiera
    // pacjenta — wyniki zawężają się do jego wydarzeń; × zdejmuje filtr.
    // „Oś czasu →" działa niezależnie (stopPropagation w bindzie przycisku).
    if (state.searchSelPid) {
      html += '<div class="tz-sugg is-sel">'
        + '<span class="tz-card__ava">' + esc(initials(state.searchSelName)) + '</span>'
        + '<span class="tz-sugg__name">' + esc(state.searchSelName || '') + '</span>'
        + '<span class="tz-sugg__sub">tylko wyniki tego pacjenta</span>'
        + '<span class="tz-sugg__sp"></span>'
        + '<button type="button" class="tz-sugg__btn" data-timeline-pid="' + esc(state.searchSelPid) + '" data-timeline-name="' + esc(state.searchSelName || '') + '">Oś czasu →</button>'
        + '<button type="button" class="tz-sugg__btn" data-clear-sel="1" aria-label="Pokaż wszystkie wyniki">×</button>'
        + '</div>';
      res = res.filter(function (n) { return n.patientId === state.searchSelPid; });
    } else {
      // Chip sugestii: pacjenci Z BAZY pasujący do zapytania.
      (state.searchPatients || []).forEach(function (p) {
        html += '<div class="tz-sugg" data-select-pid="' + esc(p.patientId) + '" data-select-name="' + esc(p.name) + '" role="button" tabindex="0">'
          + '<span class="tz-card__ava">' + esc(initials(p.name)) + '</span>'
          + '<span class="tz-sugg__name">' + esc(p.name) + '</span>'
          + '<span class="tz-sugg__sub">pacjent w bazie</span>'
          + '<span class="tz-sugg__sp"></span>'
          + '<button type="button" class="tz-sugg__btn" data-timeline-pid="' + esc(p.patientId) + '" data-timeline-name="' + esc(p.name) + '">Oś czasu →</button>'
          + '</div>';
      });
    }
    if (!res.length) {
      html += '<div class="tz-empty">' + (state.searchSelPid
        ? 'Brak wydarzeń tego pacjenta dla „' + esc(q) + '”.'
        : 'Brak wydarzeń dla „' + esc(q) + '”. Szukamy po pacjencie, osobie spoza bazy, tytule i treści.') + '</div>';
      html += '</div>';
      return html;
    }
    // S2 (decyzja UX 2026-06-05): grupowanie po DACIE z nagłówkami sekcji
    // (pełny dzień tygodnia + etykieta względna „za X dni"). Nadchodzące dni
    // rosnąco, potem minione malejąco. Mobile: kompaktowe akcje ✓ + ⋮.
    var tISO = todayISO();
    var byDay = {};
    var futureDays = [], pastDays = [];
    res.forEach(function (n) {
      var iso = noteDayISO(n);
      if (!byDay[iso]) {
        byDay[iso] = [];
        (iso >= tISO ? futureDays : pastDays).push(iso);
      }
      byDay[iso].push(n);
    });
    futureDays.sort();
    pastDays.sort(function (a, b) { return a < b ? 1 : -1; });
    var compact = isMobile();
    html += '<div class="tz-sec-h">Wyniki dla „' + esc(q) + '”'
      + (state.searchSelPid ? (' — ' + esc(state.searchSelName || '')) : '') + ' · ' + res.length + '</div>';
    futureDays.concat(pastDays).forEach(function (iso) {
      html += _dateHeadHtml(iso);
      byDay[iso].forEach(function (n) {
        lookup[n.id] = n;
        html += noteRowHtml(n, { gotoDay: !compact, compact: compact, metaLine: true });
      });
    });
    html += '</div>';
    return html;
  }

  function overdueStripHtml(lookup) {
    if (!state.overdue.length) return '';
    var html = '<div class="tz-overdue" id="tzOverdue">'
      + '<div class="tz-overdue__head" id="tzOverdueHead"><span>⚠ Zaległe: ' + state.overdue.length
      + ' ' + evtPlural(state.overdue.length)
      + '</span><span>▾</span></div>'
      + '<div class="tz-overdue__list">';
    state.overdue.forEach(function (n) { lookup[n.id] = n; html += noteRowHtml(n, { withDate: true, compact: isMobile(), metaLine: isMobile() }); });
    html += '</div></div>';
    return html;
  }

  // ── ROZCIĘCIE SIATKI R1 (2026-06-05): dwuklik dnia na desktopie ─────────────
  // Panel dnia „wrośnięty" w siatkę ZA wierszem tygodnia klikniętego dnia
  // (grid-column:1/-1 → własny wiersz na całą szerokość). Górne tygodnie stoją,
  // dolne zjeżdżają płynnie (animacja max-height). Strzałka-caret żyje jako
  // ::after KLIKNIĘTEJ KOMÓRKI (panel ma overflow:hidden na czas animacji —
  // caret w panelu byłby przycięty). Dwuklik wykrywany RĘCZNIE w handlerze
  // klika (dwa kliki w tę samą komórkę <350 ms) — natywny dblclick ginie, bo
  // pierwszy klik re-renderuje siatkę i podmienia element pod kursorem.
  var _splitAnim = false;          // true = panel właśnie otwarty → animuj wjazd
  var _lastCellClick = { iso: null, t: 0 };
  function toggleSplit(iso) {
    if (state.splitISO === iso) { closeSplit(true); return; }
    state.splitISO = iso;
    state.selectedISO = iso;
    _splitAnim = true;
    render();
  }
  function closeSplit(animated) {
    if (!state.splitISO) return;
    var p = doc.querySelector('.tz-split');
    if (!p || !animated) {
      state.splitISO = null;
      if (p) render();
      return;
    }
    p.classList.remove('is-open');
    setTimeout(function () { state.splitISO = null; render(); }, 320);
  }
  function splitPanelHtml(lookup) {
    var iso = state.splitISO;
    var items = state.notesByDay[iso] || [];
    var d = parseISO(iso);
    var wd = WEEKDAYS_FULL[(d.getDay() + 6) % 7];
    var hol = holidayName(iso);
    var head = wd + ', ' + d.getDate() + ' ' + MONTHS_GEN[d.getMonth()]
      + ' · ' + items.length + ' ' + evtPlural(items.length);
    var html = '<div class="tz-split"><div class="tz-split__inner">'
      + '<div class="tz-split__head">'
      + '<span class="tz-split__title">' + esc(head)
      + (hol ? ' · <span class="tz-holiday-inline">' + esc(hol) + '</span>' : '') + '</span>'
      + '<span class="tz-split__btns">'
      + '<button type="button" data-add-day="' + esc(iso) + '">+ Dodaj termin</button>'
      + '<button type="button" id="tzSplitOpenDay" data-day="' + esc(iso) + '">Widok dnia →</button>'
      + '<button type="button" id="tzSplitClose" aria-label="Zamknij panel dnia">×</button>'
      + '</span></div>';
    if (!items.length) {
      html += '<div class="tz-empty">Brak terminów tego dnia.</div>';
    } else {
      items.forEach(function (n) { lookup[n.id] = n; html += noteRowHtml(n, {}); });
    }
    html += '</div></div>';
    return html;
  }

  // ── Render: MIESIĄC (Cykl A — bez zmian funkcjonalnych) ─────────────────────
  function monthBodyHtml(lookup) {
    var tISO = todayISO();
    var a = parseISO(state.anchorISO);
    var month = a.getMonth();
    var r = gridRange(a.getFullYear(), month);
    var _splitWeekEnd = -1; // indeks ostatniej komórki tygodnia z rozcięciem
    var html = '<div class="tz-grid"><div class="tz-grid__head">';
    WEEKDAYS.forEach(function (w, wi) { html += '<div' + (wi >= 5 ? ' class="is-wknd"' : '') + '>' + w + '</div>'; });
    html += '</div><div class="tz-grid__body">';
    for (var i = 0; i < 42; i += 1) {
      var d = new Date(r.start.getFullYear(), r.start.getMonth(), r.start.getDate() + i);
      var iso = dayISO(d);
      var inMonth = d.getMonth() === month;
      var items = state.notesByDay[iso] || [];
      var hol = holidayName(iso);
      var isSplit = (iso === state.splitISO);
      var isWknd = (i % 7 >= 5); // So/Nd
      // DYŻUR: dzień z dyżurem wyróżniony delikatną czerwienią (cała kratka).
      var hasDuty = items.some(function (n) { return n.category === 'duty'; });
      var cls = 'tz-cell' + (inMonth ? '' : ' is-other') + (iso === tISO ? ' is-today' : '')
        + (iso === state.selectedISO ? ' is-selected' : '') + (hol ? ' is-holiday' : '')
        + (isWknd ? ' is-wknd' : '') + (hasDuty ? ' is-duty' : '') + (isSplit ? ' is-split' : '');
      html += '<div class="' + cls + '" data-day="' + iso + '"' + (hol ? ' title="' + esc(hol) + '"' : '') + '>'
        + '<span class="tz-cell__num">' + d.getDate() + '</span>'
        + '<button type="button" class="tz-cell__add" data-add-day="' + iso + '" aria-label="Dodaj termin ' + iso + '">+</button>';
      if (hol) html += '<span class="tz-cell__holiday">' + esc(hol) + '</span>';
      if (items.length) {
        // Desktop: do 2 chipów + „+N" w PRZYCINANEJ strefie (komórka ma stałą
        // wysokość — nic jej nie rozpycha); kropki ZAWSZE przy dolnej krawędzi.
        html += '<div class="tz-cell__chips">';
        for (var c = 0; c < Math.min(items.length, 2); c += 1) {
          var n2 = items[c];
          html += '<span class="tz-chip ' + (CAT_CLASS[n2.category] || '') + (n2.completedAtISO ? ' is-done' : '') + '">'
            + esc((nmOf(n2) || '').split(' ')[0] || '') + ' · ' + esc(n2.title || '') + '</span>';
        }
        if (items.length > 2) html += '<span class="tz-chip tz-chip--more">+' + (items.length - 2) + '</span>';
        html += '</div>';
        html += '<span class="tz-cell__dots">';
        for (var dgt = 0; dgt < Math.min(items.length, 4); dgt += 1) {
          html += '<span class="tz-dot ' + (CAT_CLASS[items[dgt].category] || '') + (items[dgt].completedAtISO ? ' is-done' : '') + '"></span>';
        }
        html += '</span>';
      }
      html += '</div>';
      // ROZCIĘCIE R1: panel dnia ZA wierszem tygodnia z dwukliniętym dniem
      // (grid-column:1/-1 = własny pełnoszerokościowy wiersz siatki).
      if (isSplit) _splitWeekEnd = i - (i % 7) + 6;
      if (_splitWeekEnd === i && state.splitISO) html += splitPanelHtml(lookup);
    }
    html += '</div></div>';

    // Panel wybranego dnia (+ przejście do pełnego widoku dnia).
    var tISO2 = todayISO();
    var sel = state.selectedISO || tISO2;
    var dayItems = state.notesByDay[sel] || [];
    var selHol = holidayName(sel);
    html += '<div class="tz-day-panel"><h2><span>' + esc(plDate(sel)) + (sel === tISO2 ? ' (dziś)' : '')
      + (selHol ? ' · <span class="tz-holiday-inline">' + esc(selHol) + '</span>' : '') + '</span>'
      + '<span style="display:flex;gap:6px;flex-wrap:wrap;">'
      + '<button type="button" data-add-day="' + esc(sel) + '">+ Dodaj termin</button>'
      + '<button type="button" id="tzOpenDayView" data-day="' + esc(sel) + '">Otwórz widok dnia →</button></span></h2>';
    if (!dayItems.length) {
      html += '<div class="tz-empty">Brak terminów tego dnia. Dodaj „follow-up" z karty pacjenta (Notatki → termin).</div>';
    } else {
      dayItems.forEach(function (n) { lookup[n.id] = n; html += noteRowHtml(n, { compact: isMobile(), metaLine: false }); });
    }
    html += '</div>';
    return html;
  }

  // ── Render: TYDZIEŃ (Cykl C — W1 desktop / W2 mobile) ───────────────────────
  function weekDays() {
    var r = weekRange(state.anchorISO);
    var out = [];
    for (var i = 0; i < 7; i += 1) {
      out.push(new Date(r.start.getFullYear(), r.start.getMonth(), r.start.getDate() + i));
    }
    return out;
  }

  function weekGridHtml(lookup) {
    // DESKTOP-OŚ (akceptacja 2026-06-05): klasyczna siatka kalendarza —
    // 7 dni × sloty 30 min + pas „Cały dzień". Blok wizyty = klik → popover
    // akcji (✓/↻/✎/→dzień/🗑); pusta komórka = nowy termin z datą i godziną.
    var tISO = todayISO();
    var days = weekDays();
    var dayISOs = days.map(function (d) { return dayISO(d); });
    // DYŻUR: które dni mają dyżur → cała kolumna delikatnie czerwona.
    var dutyDays = dayISOs.map(function (iso) {
      return (state.notesByDay[iso] || []).some(function (n) { return n.category === 'duty'; });
    });
    var timedAll = [];
    dayISOs.forEach(function (iso) {
      (state.notesByDay[iso] || []).forEach(function (n) { if (n.dueTime) timedAll.push(n); });
    });
    var rng = slotRange(timedAll);
    function shortName(full) {
      var parts = String(full || '').trim().split(/\s+/);
      if (parts.length < 2) return parts[0] || '';
      return parts[0] + ' ' + parts[1].charAt(0) + '.';
    }
    var html = '<div class="tz-wx" data-days="' + dayISOs.join(',') + '">';
    function wkndCls(idx) { return (idx >= 5) ? ' is-wknd' : ''; } // So/Nd wyróżnione
    // Nagłówek dni (klik dnia → widok dnia; „+" jak dotąd).
    html += '<div class="tz-wx__row tz-wx__head"><span class="tz-wx__hh"></span>';
    days.forEach(function (d, idx) {
      var iso = dayISOs[idx];
      var hol = holidayName(iso);
      html += '<div class="tz-wx__dh' + wkndCls(idx) + (dutyDays[idx] ? ' is-duty' : '') + (iso === tISO ? ' is-today' : '') + (hol ? ' is-holiday' : '') + '" data-goto-day="' + iso + '"'
        + (hol ? ' title="' + esc(hol) + '"' : '') + '>' + WEEKDAYS[idx]
        + ' <span class="tz-wcol__num">' + d.getDate() + '</span>'
        + '<button type="button" class="tz-wcol__add" data-add-day="' + iso + '" aria-label="Dodaj termin ' + iso + '">+</button>'
        + '</div>';
    });
    html += '</div>';
    // Pas „Cały dzień" (wpisy bez godziny).
    html += '<div class="tz-wx__row tz-wx__all"><span class="tz-wx__hh">cały dzień</span>';
    dayISOs.forEach(function (iso, idx) {
      html += '<div class="tz-wx__cell tz-wx__cell--all' + wkndCls(idx) + (dutyDays[idx] ? ' is-duty' : '') + '" data-add-day="' + iso + '">';
      (state.notesByDay[iso] || []).forEach(function (n) {
        if (n.dueTime) return;
        lookup[n.id] = n;
        html += '<div class="tz-wb tz-wb--all ' + (CAT_CLASS[n.category] || '') + (n.completedAtISO ? ' is-done' : '') + '" data-note-id="' + esc(n.id) + '">'
          + esc(shortName(nmOf(n))) + ' · ' + esc(n.title || '') + '</div>';
      });
      html += '</div>';
    });
    html += '</div>';
    // Sloty 30-minutowe — komórki ZAWSZE identyczne (60px) i zawsze klikalne
    // (nowy termin); wpisy żyją na warstwie proporcjonalnej PONAD siatką.
    html += '<div class="tz-wx__bodyrel" data-start-min="' + rng.startMin + '">';
    for (var mm = rng.startMin; mm < rng.endMin; mm += 30) {
      var hh = hhOf(mm);
      var isFull = (mm % 60 === 0);
      html += '<div class="tz-wx__row' + (isFull ? ' is-full-hour' : '') + '"><span class="tz-wx__hh' + (isFull ? '' : ' is-half') + '">' + hh + '</span>';
      dayISOs.forEach(function (iso, idx) {
        html += '<button type="button" class="tz-wx__cell tz-wb-free' + wkndCls(idx) + (dutyDays[idx] ? ' is-duty' : '') + '" data-add-day="' + iso + '" data-add-time="' + hh + '" aria-label="Dodaj termin ' + iso + ' ' + hh + '"></button>';
      });
      html += '</div>';
    }
    // NAKŁADKI V1 — REGUŁA RELACYJNA (2026-06-06): wydarzenie staje się TŁEM
    // kolumny (pełna szerokość, etykieta u góry, niższy z-index) tylko gdy
    // (a) jest DYŻUREM (zawsze), albo (b) NAKŁADA się na coś krótszego i jest od
    // tego co najmniej BAND_RATIO× dłuższe. Brak magicznej liczby godzin: długie
    // wydarzenie BEZ kolizji zostaje normalnym blokiem. Krótkie wizyty leżą NA
    // WIERZCHU i pakują się w pasy TYLKO między sobą — etykiety zawsze czytelne.
    var BAND_RATIO = 3;
    dayISOs.forEach(function (iso, idx) {
      var all = (state.notesByDay[iso] || []).filter(function (n) { return !!n.dueTime; })
        .map(function (n) {
          var s = slotMinOf(n.dueTime);
          return { n: n, s: s, e: s + (n.durationMin > 0 ? Number(n.durationMin) : 30) };
        })
        .sort(function (a, b) { return (a.s - b.s) || (a.e - b.e); });
      var colL = 'left:calc(56px + (100% - 56px)*' + (idx / 7).toFixed(5) + ' + 2px);';
      var colW = 'width:calc((100% - 56px)*' + (1 / 7).toFixed(5) + ' - 5px);';
      // Tło = dyżur ALBO ≥ BAND_RATIO× dłuższe od najkrótszego nakładającego się.
      all.forEach(function (ev) {
        if (ev.n.category === 'duty') { ev.band = true; return; }
        var minOther = Infinity;
        all.forEach(function (f) {
          if (f === ev) return;
          if (f.s < ev.e && f.e > ev.s) { var d = f.e - f.s; if (d < minOther) minOther = d; }
        });
        ev.band = (minOther !== Infinity) && ((ev.e - ev.s) >= BAND_RATIO * minOther);
      });
      var bands = all.filter(function (ev) { return ev.band; });
      var shorts = all.filter(function (ev) { return !ev.band; });
      // 1) TŁO: długie wydarzenia na pełną szerokość kolumny (za wizytami).
      bands.forEach(function (ev) {
        var n = ev.n;
        lookup[n.id] = n;
        var top = (ev.s - rng.startMin) * 2 + 1;
        var hpx = Math.max((ev.e - ev.s) * 2 - 2, 18);
        html += '<div class="tz-wb tz-wb--band ' + (CAT_CLASS[n.category] || '') + (n.completedAtISO ? ' is-done' : '')
          + '" style="top:' + top + 'px;height:' + hpx + 'px;' + colL + colW + '" data-note-id="' + esc(n.id) + '">'
          + '<b>' + esc(n.dueTime) + ' · ' + esc(CAT_LABEL[n.category] || '') + '</b>'
          + '<i>' + esc(nmOf(n)) + '</i></div>';
      });
      // 2) Pasy kolizji liczone TYLKO między krótkimi wizytami.
      var cluster = [], laneEnd = [];
      function flushCluster() {
        var L = laneEnd.length;
        cluster.forEach(function (ev) { ev.lanes = L; });
        cluster = []; laneEnd = [];
      }
      shorts.forEach(function (ev) {
        var maxEnd = laneEnd.length ? Math.max.apply(null, laneEnd) : 0;
        if (cluster.length && ev.s >= maxEnd) flushCluster();
        var li = -1;
        for (var k = 0; k < laneEnd.length; k += 1) { if (laneEnd[k] <= ev.s) { li = k; break; } }
        if (li < 0) { li = laneEnd.length; laneEnd.push(0); }
        laneEnd[li] = ev.e; ev.lane = li; cluster.push(ev);
      });
      flushCluster();
      shorts.forEach(function (ev) {
        var n = ev.n;
        lookup[n.id] = n;
        var top = (ev.s - rng.startMin) * 2 + 1;
        var hpx = Math.max((ev.e - ev.s) * 2 - 2, 14);
        var laneW = 1 / (7 * ev.lanes);
        var xFrac = idx / 7 + ev.lane * laneW;
        var sty = 'top:' + top + 'px;height:' + hpx + 'px;'
          + 'left:calc(56px + (100% - 56px)*' + xFrac.toFixed(5) + ' + 2px);'
          + 'width:calc((100% - 56px)*' + laneW.toFixed(5) + ' - 5px);';
        var inner;
        if (hpx < 34) {
          // Krótka wizyta (<~15 min wysokości): jedna zwięzła linia.
          inner = '<b>' + esc(n.dueTime) + ' · ' + esc(nmOf(n)) + '</b>';
        } else {
          inner = '<b>' + esc(n.dueTime) + ' · ' + esc(CAT_LABEL[n.category] || '') + '</b>'
            + '<i>' + esc(nmOf(n)) + '</i>';
        }
        html += '<div class="tz-wb tz-wb--ov' + (hpx < 34 ? ' is-min' : '') + ' ' + (CAT_CLASS[n.category] || '') + (n.completedAtISO ? ' is-done' : '')
          + '" style="' + sty + '" data-note-id="' + esc(n.id) + '">' + inner + '</div>';
      });
    });
    html += '</div>';
    html += '</div>';
    return html;
  }

  function weekAgendaHtml(lookup) {
    // W2: agenda pionowa — dni z terminami jako sekcje z pełnymi wierszami,
    // dni puste jako zwinięta linijka.
    var tISO = todayISO();
    var html = '<div class="tz-agenda">';
    weekDays().forEach(function (d, idx) {
      var iso = dayISO(d);
      var items = state.notesByDay[iso] || [];
      var hol = holidayName(iso);
      var label = WEEKDAYS_FULL[idx] + ' ' + d.getDate() + '.' + pad(d.getMonth() + 1);
      var addBtn = '<button type="button" class="tz-agenda__add" data-add-day="' + iso + '" aria-label="Dodaj termin ' + iso + '">+</button>';
      if (!items.length) {
        html += '<div class="tz-agenda__empty"><span>' + esc(label) + (iso === tISO ? ' (dziś)' : '')
          + (hol ? ' · <span class="tz-holiday-inline">' + esc(hol) + '</span>' : '') + ' — brak terminów</span>' + addBtn + '</div>';
        return;
      }
      html += '<div class="tz-agenda__dayh">'
        + (iso === tISO ? '<span class="tz-badge--today">dziś</span>' : '')
        + '<span>' + esc(label) + '</span>'
        + (hol ? '<span class="tz-holiday-inline">· ' + esc(hol) + '</span>' : '')
        + '<span style="color:#9aa8aa;font-weight:400;font-size:0.76rem;">· ' + items.length + '</span>' + addBtn + '</div>';
      items.forEach(function (n) { lookup[n.id] = n; html += noteRowHtml(n, { compact: isMobile(), metaLine: false }); });
    });
    html += '</div>';
    return html;
  }

  // ── Render: DZIEŃ (Cykl C — D2 karty desktop / D1 checklista mobile) ────────
  function daySplit() {
    var iso = state.anchorISO;
    var items = state.notesByDay[iso] || [];
    var pending = [], done = [];
    items.forEach(function (n) { (n.completedAtISO ? done : pending).push(n); });
    // Sekcja „Zaległe" tylko gdy oglądamy DZISIEJSZY dzień (zaległość liczy się
    // względem dziś, nie względem przeglądanej daty).
    var overdue = (iso === todayISO()) ? state.overdue : [];
    return { pending: pending, done: done, overdue: overdue };
  }

  function dayHolidayLineHtml() {
    var hol = holidayName(state.anchorISO);
    return hol ? '<div class="tz-holiday-line">★ ' + esc(hol) + ' — dzień ustawowo wolny od pracy</div>' : '';
  }

  function dayChecklistHtml(lookup) {
    // L2 (decyzja UX 2026-06-05): widok dnia na mobile = OŚ GODZINOWA.
    // Sloty co 30 min (zakres: min(8:00, pierwszy wpis)…max(15:00, ostatni+30));
    // wpisy bez godziny w sekcji „Cały dzień"; puste sloty kreskowane i KLIKALNE
    // (prefill daty I godziny w modalu). Zaległe (gdy dziś) jak dotąd, kompaktowo.
    var s = daySplit();
    var iso = state.anchorISO;
    var html = dayHolidayLineHtml() + '<div class="tz-day-panel">';
    if (s.overdue.length) {
      html += '<div class="tz-sec-h is-overdue">Zaległe · ' + s.overdue.length + '</div>';
      s.overdue.forEach(function (n) { lookup[n.id] = n; html += noteRowHtml(n, { withDate: true, overdue: true, compact: true, metaLine: true }); });
    }
    var all = s.pending.concat(s.done);
    var timed = all.filter(function (n) { return !!n.dueTime; });
    var allDay = all.filter(function (n) { return !n.dueTime; });
    if (allDay.length) {
      html += '<div class="tz-sec-h">Cały dzień · ' + allDay.length + '</div>';
      allDay.forEach(function (n) { lookup[n.id] = n; html += noteRowHtml(n, { compact: true, metaLine: true, dnd: true }); });
    }
    if (!timed.length && !allDay.length) {
      html += '<div class="tz-empty">Brak terminów. Dodaj „follow-up" z karty pacjenta (🔔 Przypomnij) albo tapnij wolny slot poniżej.</div>';
    }
    // Oś slotów 30-minutowych — PROPORCJONALNIE (2026-06-06, jak desktop):
    // stałe rzędy 60px (2px/min), wpisy na warstwie absolutnej o wysokości
    // = czas trwania (Poradnia 16:00–19:20 = pasek przez 200 min); dyżur /
    // relacyjnie-długie jako TŁO; kolizje krótkich w pasach.
    var rng = slotRange(timed);
    html += '<div class="tz-sec-h">Plan dnia</div><div class="tz-hours tz-hours--prop"><div class="tz-dxrel">';
    for (var mm = rng.startMin; mm < rng.endMin; mm += 30) {
      var hh = hhOf(mm);
      html += '<div class="tz-hslot tz-hslot--grid' + ((mm % 60 === 0) ? ' is-full' : '') + '"><span class="tz-hh">' + hh + '</span>'
        + '<button type="button" class="tz-hfree" data-add-day="' + esc(iso) + '" data-add-time="' + hh + '" aria-label="Dodaj termin ' + hh + '"></button></div>';
    }
    function mInner(n, hs) {
      lookup[n.id] = n;
      var done = !!n.completedAtISO;
      return '<div class="tz-hcard__main">'
        + '<div class="tz-hcard__nm">' + esc(durLabel(n) || n.dueTime) + ' · ' + esc(nmOf(n)) + '</div>'
        + (function () {
            if (hs < 46) return ''; // niski pasek = jedna linia
            var prt = [];
            if (n.title) prt.push(esc(n.title));
            if (n.durationMin && !n.dueTime) prt.push(durLabel(n));
            if (done) prt.push('wykonane');
            return prt.length ? ('<div class="tz-hcard__tt">' + prt.join(' · ') + '</div>') : '';
          })()
        + '</div>'
        + '<div class="tz-actions">'
        + (isDuty(n) ? '' : (done ? '<button type="button" data-act="undone">↺</button>'
          : '<button type="button" class="tz-done-btn" data-act="done" aria-label="Wykonane">✓</button>'))
        + '<button type="button" data-act="more" aria-label="Więcej">⋮</button>'
        + '</div>';
    }
    var mEvs = timed.map(function (n) {
      var s = slotMinOf(n.dueTime);
      return { n: n, s: s, e: s + (n.durationMin > 0 ? Number(n.durationMin) : 30) };
    }).sort(function (a, b) { return (a.s - b.s) || (a.e - b.e); });
    mEvs.forEach(function (ev) {
      if (ev.n.category === 'duty') { ev.band = true; return; }
      var minOther = Infinity;
      mEvs.forEach(function (f) {
        if (f === ev) return;
        if (f.s < ev.e && f.e > ev.s) { var d2 = f.e - f.s; if (d2 < minOther) minOther = d2; }
      });
      ev.band = (minOther !== Infinity) && ((ev.e - ev.s) >= 3 * minOther);
    });
    var GUTM = 52;
    mEvs.filter(function (ev) { return ev.band; }).forEach(function (ev) {
      var n = ev.n;
      var top = (ev.s - rng.startMin) * 2 + 1;
      var hb = Math.max((ev.e - ev.s) * 2 - 2, 18);
      html += '<div class="tz-hcard tz-hcard--abs tz-hcard--band ' + (CAT_CLASS[n.category] || '') + (n.completedAtISO ? ' is-done' : '')
        + '" style="top:' + top + 'px;height:' + hb + 'px;left:' + GUTM + 'px;right:2px;" data-note-id="' + esc(n.id) + '">' + mInner(n, hb) + '</div>';
    });
    var mShorts = mEvs.filter(function (ev) { return !ev.band; });
    var mCluster = [], mLaneEnd = [];
    function mFlush() {
      var L = mLaneEnd.length;
      mCluster.forEach(function (ev) { ev.lanes = L; });
      mCluster = []; mLaneEnd = [];
    }
    mShorts.forEach(function (ev) {
      var mx = mLaneEnd.length ? Math.max.apply(null, mLaneEnd) : 0;
      if (mCluster.length && ev.s >= mx) mFlush();
      var li = -1;
      for (var k = 0; k < mLaneEnd.length; k += 1) { if (mLaneEnd[k] <= ev.s) { li = k; break; } }
      if (li < 0) { li = mLaneEnd.length; mLaneEnd.push(0); }
      mLaneEnd[li] = ev.e; ev.lane = li; mCluster.push(ev);
    });
    mFlush();
    mShorts.forEach(function (ev) {
      var n = ev.n;
      var top = (ev.s - rng.startMin) * 2 + 1;
      var hs = Math.max((ev.e - ev.s) * 2 - 2, 26);
      var laneW = 1 / ev.lanes;
      var sty = 'top:' + top + 'px;height:' + hs + 'px;'
        + 'left:calc(' + GUTM + 'px + (100% - ' + (GUTM + 2) + 'px)*' + (ev.lane * laneW).toFixed(5) + ');'
        + 'width:calc((100% - ' + (GUTM + 2) + 'px)*' + laneW.toFixed(5) + ' - 4px);';
      html += '<div class="tz-hcard tz-hcard--abs ' + (CAT_CLASS[n.category] || '') + (n.completedAtISO ? ' is-done' : '')
        + '" style="' + sty + '" data-note-id="' + esc(n.id) + '">' + mInner(n, hs) + '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function dayCardsHtml(lookup) {
    // DESKTOP-OŚ (akceptacja 2026-06-05): szeroka oś czasu zamiast kart per
    // pacjent (4 pełne przyciski zjadały szerokość kart i tytuły łamały się
    // litera po literze). Te same sloty 30 min co mobile; karty w jednej linii
    // z PEŁNYMI akcjami + „Karta pacjenta" dla pacjentów z bazy.
    var s = daySplit();
    var iso = state.anchorISO;
    var html = dayHolidayLineHtml() + '<div class="tz-day-panel">';
    if (s.overdue.length) {
      html += '<div class="tz-sec-h is-overdue">Zaległe · ' + s.overdue.length + '</div>';
      s.overdue.forEach(function (n) { lookup[n.id] = n; html += noteRowHtml(n, { withDate: true, overdue: true }); });
    }
    var all = s.pending.concat(s.done);
    var timed = all.filter(function (n) { return !!n.dueTime; });
    var allDay = all.filter(function (n) { return !n.dueTime; });
    function wideInner(n) {
      lookup[n.id] = n;
      var done = !!n.completedAtISO;
      var meta = [];
      meta.push(CAT_LABEL[n.category] || n.category || '');
      if (n.durationMin && !n.dueTime) meta.push(durLabel(n));
      if (n.isExternal) meta.push('spoza bazy');
      if (done) meta.push('wykonane');
      return '<span class="tz-hcard__nm">' + (n.dueTime ? esc(durLabel(n) || n.dueTime) + ' · ' : '') + esc(nmOf(n)) + '</span>'
        + '<span class="tz-hcard__tt">' + (n.title ? (esc(n.title) + ' · ') : '') + esc(meta.join(' · ')) + '</span>'
        + '<div class="tz-actions">'
        + (isDuty(n) ? '' : (done
          ? '<button type="button" data-act="undone">↺ Cofnij</button>'
          : '<button type="button" class="tz-done-btn" data-act="done">✓ Wykonane</button>'
            + '<button type="button" data-act="postpone">↻ Przełóż</button>'))
        + '<button type="button" data-act="edit">✎ Edytuj</button>'
        + ((n.isExternal || n.isActivity) ? '' : '<button type="button" class="tz-card__open" data-open-patient="' + esc(n.patientId) + '" data-focus-note="' + esc(n.id) + '">Karta pacjenta</button>')
        + '<button type="button" class="tz-del-btn" data-act="del" aria-label="Usuń wpis">🗑</button>'
        + '</div>';
    }
    function wideCard(n) {
      var done = !!n.completedAtISO;
      return '<div class="tz-hcard tz-hcard--wide' + (done ? ' is-done' : '') + ' ' + (CAT_CLASS[n.category] || '') + '" data-note-id="' + esc(n.id) + '">'
        + wideInner(n) + '</div>';
    }
    if (allDay.length) {
      html += '<div class="tz-sec-h">Cały dzień · ' + allDay.length + '</div>';
      allDay.forEach(function (n) { html += '<div class="tz-hslot"><span class="tz-hh"></span>' + wideCard(n) + '</div>'; });
    }
    if (!timed.length && !allDay.length) {
      html += '<div class="tz-empty">Brak terminów tego dnia. Dodaj „follow-up" z karty pacjenta (🔔 Przypomnij) albo kliknij wolny slot poniżej.</div>';
    }
    // PLAN DNIA — PROPORCJONALNIE (2026-06-06): stałe rzędy 30 min (60px ⇒
    // 2px/min) + wpisy na warstwie absolutnej o wysokości = czas trwania
    // (Poradnia 16:00–19:20 = pasek przez 200 min). Dyżur/relacyjnie-długie
    // jako TŁO; kolizje krótkich w pasach — jak w siatce tygodnia.
    var rng = slotRange(timed);
    html += '<div class="tz-sec-h">Plan dnia</div><div class="tz-hours tz-hours--prop"><div class="tz-dxrel">';
    for (var mm = rng.startMin; mm < rng.endMin; mm += 30) {
      var hh = hhOf(mm);
      html += '<div class="tz-hslot tz-hslot--grid' + ((mm % 60 === 0) ? ' is-full' : '') + '"><span class="tz-hh">' + hh + '</span>'
        + '<button type="button" class="tz-hfree" data-add-day="' + esc(iso) + '" data-add-time="' + hh + '" aria-label="Dodaj termin ' + hh + '"></button></div>';
    }
    var dEvs = timed.map(function (n) {
      var s = slotMinOf(n.dueTime);
      return { n: n, s: s, e: s + (n.durationMin > 0 ? Number(n.durationMin) : 30) };
    }).sort(function (a, b) { return (a.s - b.s) || (a.e - b.e); });
    dEvs.forEach(function (ev) {
      if (ev.n.category === 'duty') { ev.band = true; return; }
      var minOther = Infinity;
      dEvs.forEach(function (f) {
        if (f === ev) return;
        if (f.s < ev.e && f.e > ev.s) { var d2 = f.e - f.s; if (d2 < minOther) minOther = d2; }
      });
      ev.band = (minOther !== Infinity) && ((ev.e - ev.s) >= 3 * minOther);
    });
    var GUT = 56;
    dEvs.filter(function (ev) { return ev.band; }).forEach(function (ev) {
      var n = ev.n;
      var top = (ev.s - rng.startMin) * 2 + 1;
      var hb = Math.max((ev.e - ev.s) * 2 - 2, 18);
      html += '<div class="tz-hcard tz-hcard--wide tz-hcard--abs tz-hcard--band ' + (CAT_CLASS[n.category] || '') + (n.completedAtISO ? ' is-done' : '')
        + '" style="top:' + top + 'px;height:' + hb + 'px;left:' + GUT + 'px;right:2px;" data-note-id="' + esc(n.id) + '">' + wideInner(n) + '</div>';
    });
    var dShorts = dEvs.filter(function (ev) { return !ev.band; });
    var dCluster = [], dLaneEnd = [];
    function dFlush() {
      var L = dLaneEnd.length;
      dCluster.forEach(function (ev) { ev.lanes = L; });
      dCluster = []; dLaneEnd = [];
    }
    dShorts.forEach(function (ev) {
      var mx = dLaneEnd.length ? Math.max.apply(null, dLaneEnd) : 0;
      if (dCluster.length && ev.s >= mx) dFlush();
      var li = -1;
      for (var k = 0; k < dLaneEnd.length; k += 1) { if (dLaneEnd[k] <= ev.s) { li = k; break; } }
      if (li < 0) { li = dLaneEnd.length; dLaneEnd.push(0); }
      dLaneEnd[li] = ev.e; ev.lane = li; dCluster.push(ev);
    });
    dFlush();
    dShorts.forEach(function (ev) {
      var n = ev.n;
      var top = (ev.s - rng.startMin) * 2 + 1;
      var hs = Math.max((ev.e - ev.s) * 2 - 2, 26);
      var laneW = 1 / ev.lanes;
      var sty = 'top:' + top + 'px;height:' + hs + 'px;'
        + 'left:calc(' + GUT + 'px + (100% - ' + (GUT + 2) + 'px)*' + (ev.lane * laneW).toFixed(5) + ');'
        + 'width:calc((100% - ' + (GUT + 2) + 'px)*' + laneW.toFixed(5) + ' - 4px);';
      html += '<div class="tz-hcard tz-hcard--wide tz-hcard--abs ' + (CAT_CLASS[n.category] || '') + (n.completedAtISO ? ' is-done' : '')
        + '" style="' + sty + '" data-note-id="' + esc(n.id) + '">' + wideInner(n) + '</div>';
    });
    html += '</div></div>';
    return html;
  }

  // ── Render: dyspozytor ──────────────────────────────────────────────────────
  function render() {
    var el = root();
    if (!el) return;
    _openSwipeRow = null; // KROK 2: DOM wymieniany — uchylony wiersz przestaje istnieć
    _cancelWeekDrag();    // DnD: re-render unieważnia geometrię przeciągania
    _hCancel();           // DnD dnia (mobile): jw.
    closeWeekPopover();   // POPOVER V1: re-render unieważnia kotwicę bloku
    if (!unlocked()) { renderLocked(el); return; }

    var lookup = {};
    // W1 (2026-06-07): zmiana okresu (gest/strzałki) = slide+fade ciała widoku.
    var animDir = _animDir; _animDir = 0;
    var reducedMotion = false;
    try { reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
    var oldBody = (animDir && !reducedMotion) ? el.querySelector('.tz-vbody') : null;
    var html = headerHtml();
    html += '<div class="tz-vbody">';

    if (state.searchOpen) {
      // SEARCH: przy OTWARTYM pasku ciało widoku to ZAWSZE kontener wyników
      // (poniżej 2 znaków — podpowiedź). Wpisywanie podmienia tylko kontener.
      html += searchResultsHtml(lookup);
    } else {
      // Pas zaległych: miesiąc + tydzień (w widoku dnia zaległe są sekcją/kartami).
      if (state.view !== 'day') html += overdueStripHtml(lookup);

      if (state.view === 'week') {
        html += isMobile() ? weekAgendaHtml(lookup) : weekGridHtml(lookup);
      } else if (state.view === 'day') {
        html += isMobile() ? dayChecklistHtml(lookup) : dayCardsHtml(lookup);
      } else {
        html += monthBodyHtml(lookup);
      }
    }

    html += '</div>';
    // Cykl D: FAB „+" (tylko mobile — CSS) — globalne dodawanie terminu.
    html += '<button type="button" id="tzFab" class="tz-fab" aria-label="Nowy termin">+</button>';

    el.innerHTML = html;
    // W1: duch starego ciała wyjeżdża (38% + fade), nowe wjeżdża z boku (100%);
    // tylko transform/opacity (60 fps), clip na czas animacji, token anty-wyścig.
    if (oldBody) {
      var newBody = el.querySelector('.tz-vbody');
      if (newBody) {
        _animToken += 1;
        var tok = _animToken;
        var ghost = oldBody;
        ghost.classList.add('tz-vbody--ghost');
        ghost.style.cssText += ';position:absolute;left:0;right:0;top:' + newBody.offsetTop + 'px;margin:0;pointer-events:none;z-index:4;';
        el.classList.add('tz-anim-clip');
        el.appendChild(ghost);
        newBody.style.transform = 'translateX(' + (animDir * 100) + '%)';
        var ease = 'transform 240ms cubic-bezier(0.22,1,0.36,1), opacity 240ms ease';
        global.requestAnimationFrame(function () {
          global.requestAnimationFrame(function () {
            ghost.style.transition = ease;
            newBody.style.transition = ease;
            ghost.style.transform = 'translateX(' + (-animDir * 38) + '%)';
            ghost.style.opacity = '0';
            newBody.style.transform = 'translateX(0)';
          });
        });
        var ttl = el.querySelector('.tz-title');
        if (ttl) ttl.classList.add(animDir > 0 ? 'is-anim-l' : 'is-anim-r');
        setTimeout(function () {
          if (tok !== _animToken) return; // nadpisane nowszą animacją/renderem
          if (ghost.parentNode) ghost.remove();
          newBody.style.transition = '';
          newBody.style.transform = '';
          el.classList.remove('tz-anim-clip');
        }, 290);
      }
    }

    // Zdarzenia: przełącznik widoku.
    var sw = el.querySelectorAll('.tz-switch button[data-view]');
    for (var si = 0; si < sw.length; si += 1) {
      (function (btn) {
        btn.addEventListener('click', function () { setView(btn.getAttribute('data-view')); });
      })(sw[si]);
    }
    // Nawigacja ‹ › Dziś.
    var prev = doc.getElementById('tzPrev');
    var next = doc.getElementById('tzNext');
    var tdy = doc.getElementById('tzToday');
    if (prev) prev.addEventListener('click', function () { shiftAnchor(-1); });
    if (next) next.addEventListener('click', function () { shiftAnchor(1); });
    var goToday = function () {
      state.anchorISO = todayISO();
      state.selectedISO = todayISO();
      _tzNavReplace();
      refresh();
    };
    if (tdy) tdy.addEventListener('click', goToday);
    var tdyM = doc.getElementById('tzTodayM');
    if (tdyM) tdyM.addEventListener('click', goToday);
    var oh = doc.getElementById('tzOverdueHead');
    if (oh) oh.addEventListener('click', function () {
      var box = doc.getElementById('tzOverdue');
      if (box) box.classList.toggle('is-open');
    });
    // Miesiąc: zaznaczenie dnia + przejście do widoku dnia.
    var cells = el.querySelectorAll('.tz-cell');
    for (var ci = 0; ci < cells.length; ci += 1) {
      (function (cell) {
        cell.addEventListener('click', function () {
          var iso = cell.getAttribute('data-day');
          var now = Date.now();
          // Dwuklik (desktop): dwa kliki w TĘ SAMĄ komórkę <350 ms → rozcięcie
          // siatki. Ręczna detekcja — natywny dblclick ginie po re-renderze
          // z pierwszego klika (element pod kursorem jest podmieniany).
          if (!isMobile() && _lastCellClick.iso === iso && (now - _lastCellClick.t) < 350) {
            _lastCellClick = { iso: null, t: 0 };
            toggleSplit(iso);
            return;
          }
          _lastCellClick = { iso: iso, t: now };
          state.selectedISO = iso;
          render(); // dane już w pamięci — sam re-render
        });
      })(cells[ci]);
    }
    // Rozcięcie R1: zamknięcie (×), przejście do widoku dnia, animacja wjazdu.
    var spClose = doc.getElementById('tzSplitClose');
    if (spClose) spClose.addEventListener('click', function () { closeSplit(true); });
    var spDay = doc.getElementById('tzSplitOpenDay');
    if (spDay) spDay.addEventListener('click', function () {
      state.anchorISO = spDay.getAttribute('data-day') || todayISO();
      setView('day');
    });
    var spPanel = el.querySelector('.tz-split');
    if (spPanel) {
      if (_splitAnim) {
        _splitAnim = false;
        // Start z max-height:0 (CSS) → klasa w następnej klatce = płynny wjazd.
        global.requestAnimationFrame(function () {
          global.requestAnimationFrame(function () { spPanel.classList.add('is-open'); });
        });
      } else {
        // Re-render przy otwartym panelu (np. ✓ Wykonane) — bez ponownej animacji.
        spPanel.style.transition = 'none';
        spPanel.classList.add('is-open');
        global.requestAnimationFrame(function () { spPanel.style.transition = ''; });
      }
    }
    var odv = doc.getElementById('tzOpenDayView');
    if (odv) odv.addEventListener('click', function () {
      state.anchorISO = odv.getAttribute('data-day') || todayISO();
      setView('day');
    });
    // Tydzień W1: klik dnia → widok dnia.
    var gotos = el.querySelectorAll('[data-goto-day]');
    for (var gi = 0; gi < gotos.length; gi += 1) {
      (function (g) {
        g.addEventListener('click', function () {
          state.anchorISO = g.getAttribute('data-goto-day');
          setView('day');
        });
      })(gotos[gi]);
    }
    // SEARCH: lupa + pasek (input z debounce; przy wpisywaniu re-renderujemy
    // TYLKO kontener wyników — pełny render zabiłby fokus inputa po każdej literze).
    var sBtn = doc.getElementById('tzSearchBtn');
    if (sBtn) sBtn.addEventListener('click', function () {
      state.searchOpen = !state.searchOpen;
      if (!state.searchOpen) { _resetSearchState(); }
      else { _ensurePatCache(); }
      render();
      if (state.searchOpen) { try { doc.getElementById('tzSearchInput').focus(); } catch (_) {} }
    });
    var sInput = doc.getElementById('tzSearchInput');
    if (sInput) {
      sInput.addEventListener('input', function () {
        state.searchQ = sInput.value || '';
        if (_searchTimer) clearTimeout(_searchTimer);
        _searchTimer = setTimeout(runSearch, 220);
      });
      sInput.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
          ev.stopPropagation();
          state.searchOpen = false; _resetSearchState();
          render();
        }
      });
    }
    var sClear = doc.getElementById('tzSearchClear');
    if (sClear) sClear.addEventListener('click', function () {
      state.searchOpen = false; _resetSearchState();
      render();
    });

    // Cykl D: dodawanie terminów — globalny przycisk + FAB + „+" przy dniach.
    // stopPropagation: plusy żyją WEWNĄTRZ klikalnych komórek (select dnia) i
    // nagłówków kolumn (goto-day) — klik plusa nie może odpalić rodzica.
    var addBtn = doc.getElementById('tzAddBtn');
    if (addBtn) addBtn.addEventListener('click', function () { showNewTermModal(defaultAddISO()); });
    var fab = doc.getElementById('tzFab');
    if (fab) fab.addEventListener('click', function () { showNewTermModal(defaultAddISO()); });
    var adders = el.querySelectorAll('[data-add-day]');
    for (var ai = 0; ai < adders.length; ai += 1) {
      (function (a) {
        a.addEventListener('click', function (ev) {
          ev.stopPropagation();
          // L2: wolny slot osi niesie też godzinę (data-add-time) → prefill obu.
          showNewTermModal(a.getAttribute('data-add-day'), a.getAttribute('data-add-time') || null);
        });
      })(adders[ai]);
    }
    bindRowActions(el, lookup);
  }

  function renderLocked(el) {
    el.innerHTML = ''
      + '<div class="terminarz-locked">'
      + '<div class="terminarz-locked__icon">🔒</div>'
      + '<p class="terminarz-locked__title">Zaloguj się, aby zobaczyć terminarz</p>'
      + '<p class="terminarz-locked__desc">Terminy kontroli są zaszyfrowane i dostępne tylko po odblokowaniu konta.</p>'
      + '</div>';
  }

  function setView(view) {
    if (view !== 'month' && view !== 'week' && view !== 'day') view = 'month';
    state.view = view;
    state.splitISO = null; // zmiana widoku zamyka rozcięcie siatki
    state.searchOpen = false; _resetSearchState(); // i wyszukiwanie (z osią czasu)
    try { global.localStorage.setItem(VIEW_KEY, view); } catch (_) { /* flaga UI — opcjonalna */ }
    // Zmiana widoku z UI = krok ŚCIEŻKI → wpis historii (gest wstecz cofnie).
    _tzNavPush();
    refresh();
  }

  function shiftAnchor(delta) {
    _animDir = (delta > 0) ? 1 : -1; // W1: slide+fade przy zmianie okresu
    state.splitISO = null; // przewinięcie okresu zamyka rozcięcie (dzień poza siatką)
    var a = parseISO(state.anchorISO);
    if (state.view === 'week') {
      state.anchorISO = dayISO(new Date(a.getFullYear(), a.getMonth(), a.getDate() + delta * 7));
    } else if (state.view === 'day') {
      state.anchorISO = dayISO(new Date(a.getFullYear(), a.getMonth(), a.getDate() + delta));
    } else {
      // Miesiąc: kotwica na 1. dzień miesiąca docelowego (31→luty bez przeskoku).
      state.anchorISO = dayISO(new Date(a.getFullYear(), a.getMonth() + delta, 1));
    }
    // Przewijanie okresów NIE zaśmieca historii — aktualizujemy bieżący wpis.
    _tzNavReplace();
    refresh();
  }

  // SEARCH: przeładowanie wyników (re-render TYLKO kontenera, gdy istnieje —
  // pełny render przy wpisywaniu zabiłby fokus inputa).
  var _searchTimer = null;
  function _swapSearchResultsBox() {
    // Podmiana WYŁĄCZNIE kontenera wyników — input i fokus nietknięte.
    var box = doc.getElementById('tzSearchResults');
    if (!box) {
      // Awaryjnie (kontener zniknął, np. wyścig z innym renderem): pełny
      // render + przywrócenie fokusu, żeby wpisywanie nie urywało się.
      render();
      try { var si = doc.getElementById('tzSearchInput'); if (si) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); } } catch (_) {}
      return;
    }
    var lookup = {};
    var tmp = doc.createElement('div');
    tmp.innerHTML = searchResultsHtml(lookup);
    box.replaceWith(tmp.firstChild);
    var fresh = doc.getElementById('tzSearchResults');
    if (fresh) bindRowActions(fresh, lookup);
  }
  // Pełne czyszczenie stanu wyszukiwania (zamknięcie paska / zmiana widoku).
  function _resetSearchState() {
    state.searchQ = '';
    state.searchResults = [];
    state.searchPatients = [];
    state.searchSelPid = null;
    state.searchSelName = null;
    state.searchTlPid = null;
    state.searchTlName = null;
    state.searchTlEvents = [];
    _patCache = null; // świeże nagłówki przy następnym otwarciu
  }
  // Cache nagłówków pacjentów na czas sesji wyszukiwania (sugestie chipów) —
  // jedno listPatients na otwarcie paska zamiast deszyfracji przy każdej literze.
  var _patCache = null;
  function _ensurePatCache() {
    var V = getVault();
    if (_patCache || !V || typeof V.listPatients !== 'function') return Promise.resolve();
    return V.listPatients().then(function (records) {
      _patCache = (records || []).map(function (r) {
        return { patientId: r.patientId, name: (r.header && typeof r.header.name === 'string' && r.header.name) ? r.header.name : '(bez imienia)' };
      });
    }).catch(function () { _patCache = []; });
  }
  function _matchPatients(q) {
    var fq = _fold(q);
    var hits = [];
    (_patCache || []).forEach(function (p) {
      if (_fold(p.name).indexOf(fq) >= 0) hits.push(p);
    });
    return hits.slice(0, 3);
  }
  function openSearchTimeline(pid, name) {
    var V = getVault();
    state.searchTlPid = pid;
    state.searchTlName = name;
    state.searchTlEvents = [];
    if (!V || typeof V.listPatientNotesForPatient !== 'function') { _swapSearchResultsBox(); return; }
    V.listPatientNotesForPatient(pid).then(function (notes) {
      state.searchTlEvents = (notes || []).filter(function (n) { return n && n.dueDateISO; });
      _swapSearchResultsBox();
    }).catch(function () { _swapSearchResultsBox(); });
  }
  function runSearch() {
    if (!state.searchOpen) return;
    var V = getVault();
    var q = state.searchQ.trim();
    // Nowe zapytanie zamyka oś czasu i zdejmuje filtr pacjenta (świeża lista).
    state.searchTlPid = null; state.searchTlName = null; state.searchTlEvents = [];
    state.searchSelPid = null; state.searchSelName = null;
    if (q.length < 2 || !V || typeof V.searchPatientNotes !== 'function') {
      state.searchResults = [];
      state.searchPatients = [];
      _swapSearchResultsBox();
      return;
    }
    Promise.all([V.searchPatientNotes(q), _ensurePatCache()]).then(function (res) {
      state.searchResults = res[0] || [];
      state.searchPatients = _matchPatients(q);
      _swapSearchResultsBox();
    }).catch(function () { state.searchResults = []; state.searchPatients = []; _swapSearchResultsBox(); });
  }

  var _refreshQueued = false;
  function refresh() {
    if (!unlocked()) { render(); return; }
    if (_refreshQueued) return;
    _refreshQueued = true;
    var chain = loadData();
    // SEARCH: po akcji (✓/przełóż/edycja) odśwież też wyniki, żeby lista nie kłamała.
    if (_searchActive()) {
      var V = getVault();
      if (V && typeof V.searchPatientNotes === 'function') {
        chain = chain.then(function () {
          return V.searchPatientNotes(state.searchQ.trim())
            .then(function (res) { state.searchResults = res || []; })
            .catch(function () { /* zostaw stare wyniki */ });
        });
      }
      // S3: oś czasu też musi odzwierciedlić zmiany (✓/przełóż z menu ⋮).
      if (state.searchTlPid && V && typeof V.listPatientNotesForPatient === 'function') {
        chain = chain.then(function () {
          return V.listPatientNotesForPatient(state.searchTlPid)
            .then(function (notes) {
              state.searchTlEvents = (notes || []).filter(function (n) { return n && n.dueDateISO; });
            })
            .catch(function () { /* zostaw stare */ });
        });
      }
    }
    chain.then(function () { _refreshQueued = false; render(); })
      .catch(function () { _refreshQueued = false; render(); });
  }

  // ── NAWIGACJA WSTECZ (2026-06-05): historia jak w karcie pacjenta ───────────
  // Cel: gest/przycisk „wstecz" cofa po ŚCIEŻCE terminarza (modal → widok →
  // poprzedni widok → … → wyjście ze strony) zamiast jednym ruchem opuszczać
  // aplikację. Model render-from-state (wzorzec _navInstall z auth UI):
  //  • zmiana WIDOKU z UI (przełącznik, drill-down dnia) → pushState({tzNav}),
  //  • otwarcie modalu „Nowy termin" → pushState({tzNav:{…,modal:1}}); ręczne
  //    zamknięcie = history.back() (stos spójny), wstecz zamyka modal,
  //  • strzałki/swipe/Dziś → replaceState (przewijanie nie zaśmieca historii),
  //  • popstate z obcym stanem (np. vildaNav karty pacjenta otwartej z widoku
  //    dnia) → NIE ruszamy widoku; bazowy wpis strony dostaje tzNav przez
  //    replaceState przy starcie. Gest „w przód" na stan z modal=1 nie
  //    re-otwiera modalu — flaga jest zdejmowana replaceState.
  var _tzNavReady = false;
  var _tzNavModalGuard = false;
  function _tzNavLoc(extra) {
    return Object.assign({ view: state.view, anchor: state.anchorISO, sel: state.selectedISO }, extra || {});
  }
  function _tzNavState() {
    try { return (global.history && global.history.state && global.history.state.tzNav) || null; } catch (_) { return null; }
  }
  function _tzNavInstall() {
    if (_tzNavReady || !global.addEventListener || !global.history) return;
    _tzNavReady = true;
    try { global.history.replaceState({ tzNav: _tzNavLoc() }, ''); } catch (_) { /* noop */ }
    global.addEventListener('popstate', function (e) {
      var t = (e && e.state && e.state.tzNav) || null;
      if (!t) return; // obcy/pusty stan — widoku terminarza nie ruszamy
      if (t.modal) {
        // Wstecz/w przód wylądował na wpisie modalu — nie re-otwieramy go,
        // zdejmujemy flagę (wpis staje się zwykłym stanem widoku).
        try { global.history.replaceState({ tzNav: _tzNavLoc() }, ''); } catch (_) { /* noop */ }
        return;
      }
      // Gest wstecz przy otwartym modalu → zamknij modal (bez podwójnego back).
      _tzNavModalGuard = true;
      try { closeNewTermModal(); } catch (_) { /* noop */ }
      _tzNavModalGuard = false;
      state.view = (t.view === 'week' || t.view === 'day') ? t.view : 'month';
      state.anchorISO = /^\d{4}-\d{2}-\d{2}$/.test(t.anchor || '') ? t.anchor : todayISO();
      if (typeof t.sel === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.sel)) state.selectedISO = t.sel;
      try { global.localStorage.setItem(VIEW_KEY, state.view); } catch (_) { /* noop */ }
      refresh();
    });
  }
  function _tzNavPush(extra) {
    try {
      _tzNavInstall();
      var cur = _tzNavState();
      var loc = _tzNavLoc(extra);
      // Dedup: ponowny klik w aktywny widok nie dubluje wpisu.
      if (cur && cur.view === loc.view && cur.anchor === loc.anchor && !!cur.modal === !!loc.modal) return;
      global.history.pushState({ tzNav: loc }, '');
    } catch (_) { /* noop */ }
  }
  function _tzNavReplace() {
    try {
      _tzNavInstall();
      global.history.replaceState({ tzNav: _tzNavLoc() }, '');
    } catch (_) { /* noop */ }
  }

  // ── KROK 2 (2026-06-05): swipe-to-delete na wierszach (mobile, wzór iOS Mail) ──
  // Krótkie przeciągnięcie w lewo uchyla czerwony przycisk Usuń (tap = usuń),
  // długie (≥55% szerokości) usuwa od razu. USUNIĘCIE JEST ODROCZONE: wiersz
  // znika optymistycznie, toast „Usunięto · COFNIJ" odlicza 4 s i dopiero wtedy
  // leci removePatientNote — COFNIJ tylko anuluje timer (zero realnego delete
  // przed czasem, więc cofnięcie jest w 100% bezstratne).
  var _pendingDelete = null; // { note, timer, toastEl }
  function _flushPendingDelete() {
    if (!_pendingDelete) return;
    var pd = _pendingDelete;
    _pendingDelete = null;
    try { clearTimeout(pd.timer); } catch (_) { /* noop */ }
    if (pd.toastEl && pd.toastEl.parentNode) pd.toastEl.remove();
    deleteNote(pd.note);
  }
  function deleteWithUndo(note, rowWrap) {
    // Poprzedni oczekujący wpis finalizujemy natychmiast (jeden toast naraz).
    _flushPendingDelete();
    if (rowWrap) {
      try { rowWrap.style.maxHeight = rowWrap.offsetHeight + 'px'; void rowWrap.offsetHeight; } catch (_) { /* noop */ }
      rowWrap.classList.add('is-removing');
    }
    var toast = doc.createElement('div');
    toast.className = 'tz-undo-toast';
    toast.innerHTML = '<span>Usunięto wpis</span><button type="button" id="tzUndoBtn">COFNIJ</button>';
    doc.body.appendChild(toast);
    var timer = setTimeout(function () {
      if (!_pendingDelete) return;
      var pd = _pendingDelete;
      _pendingDelete = null;
      if (pd.toastEl && pd.toastEl.parentNode) pd.toastEl.remove();
      deleteNote(pd.note);
    }, 4000);
    _pendingDelete = { note: note, timer: timer, toastEl: toast };
    toast.querySelector('#tzUndoBtn').addEventListener('click', function () {
      if (!_pendingDelete) return;
      try { clearTimeout(_pendingDelete.timer); } catch (_) { /* noop */ }
      _pendingDelete = null;
      toast.remove();
      render(); // wiersz wraca z danych — nic nie było skasowane
    });
  }
  var _openSwipeRow = null; // aktualnie uchylony wiersz (jeden naraz)
  function _closeOpenSwipeRow() {
    if (!_openSwipeRow) return;
    _openSwipeRow.style.transform = '';
    var w = _openSwipeRow.parentNode;
    if (w && w.classList) w.classList.remove('is-open-swipe');
    _openSwipeRow = null;
  }
  function bindRowSwipe(el) {
    if (el.__tzRowSwipeBound) return;
    el.__tzRowSwipeBound = true;
    var row = null, wrap = null, note = null;
    var sx = 0, sy = 0, dx = 0, taken = false;
    var onMove = null, onEnd = null;
    el.addEventListener('touchstart', function (ev) {
      if (!isMobile()) return;
      if (!ev.touches || ev.touches.length !== 1) return;
      var t = ev.target;
      row = t && t.closest ? t.closest('.tz-row') : null;
      if (!row) { _closeOpenSwipeRow(); return; }
      if (t.closest('button')) { row = null; return; } // przyciski akcji bez gestu
      wrap = row.parentNode && row.parentNode.classList && row.parentNode.classList.contains('tz-swipe-wrap')
        ? row.parentNode : null;
      if (!wrap) { row = null; return; }
      var lookupId = row.getAttribute('data-note-id');
      note = (el.__tzRowLookup && el.__tzRowLookup[lookupId]) || null;
      if (!note) { row = null; return; }
      if (_openSwipeRow && _openSwipeRow !== row) _closeOpenSwipeRow();
      sx = ev.touches[0].clientX; sy = ev.touches[0].clientY; dx = 0; taken = false;
      onMove = function (mv) {
        if ((_hdrag && _hdrag.active) || (_drag && _drag.active)) { cleanup(); return; } // DnD aktywny
        if (!row || !mv.touches || mv.touches.length !== 1) return;
        var mdx = mv.touches[0].clientX - sx;
        var mdy = mv.touches[0].clientY - sy;
        if (!taken) {
          if (Math.abs(mdy) > 12 && Math.abs(mdy) > Math.abs(mdx)) { cleanup(); return; } // pionowy scroll
          if (mdx > -10) return;          // tylko w LEWO; mały luz na drżenie
          taken = true;
          wrap.classList.add('is-swiping');
        }
        mv.preventDefault(); // przejęliśmy gest — bez scrolla w tle
        dx = Math.max(mdx, -wrap.offsetWidth * 0.92);
        if (dx > 0) dx = 0;
        row.style.transform = 'translateX(' + Math.round(dx) + 'px)';
      };
      onEnd = function () {
        if (!row) { cleanup(); return; }
        var w = wrap.offsetWidth || 320;
        wrap.classList.remove('is-swiping');
        if (taken && Math.abs(dx) >= w * 0.55) {
          // Pełne przeciągnięcie = usuń (z animacją wyjazdu).
          row.style.transform = 'translateX(' + (-w) + 'px)';
          deleteWithUndo(note, wrap);
        } else if (taken && Math.abs(dx) >= 72) {
          // Uchylenie: przycisk Usuń odsłonięty, tap w niego usuwa.
          row.style.transform = 'translateX(-96px)';
          wrap.classList.add('is-open-swipe');
          _openSwipeRow = row;
        } else if (taken) {
          row.style.transform = '';
        }
        cleanup();
      };
      function cleanup() {
        if (onMove) doc.removeEventListener('touchmove', onMove);
        if (onEnd) { doc.removeEventListener('touchend', onEnd); doc.removeEventListener('touchcancel', onEnd); }
        row = null; onMove = null; onEnd = null;
      }
      doc.addEventListener('touchmove', onMove, { passive: false });
      doc.addEventListener('touchend', onEnd, { passive: true });
      doc.addEventListener('touchcancel', onEnd, { passive: true });
    }, { passive: true });
    // Tap w odsłonięte czerwone tło = usuń.
    el.addEventListener('click', function (ev) {
      var bg = ev.target && ev.target.closest ? ev.target.closest('.tz-swipe-bg') : null;
      if (!bg) return;
      var w = bg.parentNode;
      if (!w || !w.classList.contains('is-open-swipe')) return;
      var r = w.querySelector('.tz-row');
      var id = r && r.getAttribute('data-note-id');
      var n = (el.__tzRowLookup && el.__tzRowLookup[id]) || null;
      _openSwipeRow = null;
      if (n) {
        if (r) r.style.transform = 'translateX(' + (-(w.offsetWidth || 320)) + 'px)';
        deleteWithUndo(n, w);
      }
    });
  }

  // ── Swipe (2026-06-05): poziomy gest dotykowy przewija mies./tydz./dzień ────
  // Touch-only (desktop z myszą nieobjęty; tablet/telefon działa niezależnie od
  // szerokości). Bezpieczniki: 24px martwej strefy przy krawędziach (gest
  // „wstecz" przeglądarki na iOS), ruch wyraźnie POZIOMY (|dx| ≥ 48px i
  // |dx| > 1.5·|dy| — pionowy scroll nietknięty), pojedynczy palec (pinch-zoom
  // ignorowany), limit czasu gestu. Listenery passive — zero preventDefault.
  // Modale (Nowy termin, edytor notatki, menu Przełóż) żyją na <body> POZA
  // rootem, więc gesty w nich nie przewijają kalendarza.
  function bindSwipe(el) {
    if (el.__tzSwipeBound) return;
    el.__tzSwipeBound = true;
    var sx = 0, sy = 0, st = 0, active = false;
    var EDGE = 24;
    var MIN_DX = 48;
    var MAX_DT = 600;
    el.addEventListener('touchstart', function (ev) {
      if (!ev.touches || ev.touches.length !== 1) { active = false; return; }
      // KROK 2 (decyzja UX): nawigacja gestem WYŁĄCZONA w trybie wyszukiwania
      // (lista stoi, przewijałby się tylko nagłówek — mylące) oraz na WIERSZACH
      // (te przejmuje swipe-to-delete).
      if (state.searchOpen) { active = false; return; }
      if (_drag || _hdrag) { active = false; return; } // DnD: blok/karta ma pierwszeństwo
      if (ev.target && ev.target.closest && ev.target.closest('.tz-swipe-wrap')) { active = false; return; }
      var t = ev.touches[0];
      var vw = global.innerWidth || doc.documentElement.clientWidth || 0;
      if (t.clientX < EDGE || t.clientX > vw - EDGE) { active = false; return; }
      sx = t.clientX; sy = t.clientY; st = Date.now(); active = true;
    }, { passive: true });
    el.addEventListener('touchend', function (ev) {
      if (!active) return;
      active = false;
      if (!unlocked()) return;
      var t = ev.changedTouches && ev.changedTouches[0];
      if (!t) return;
      var dx = t.clientX - sx;
      var dy = t.clientY - sy;
      if (Date.now() - st > MAX_DT) return;
      if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      // Swipe w LEWO = następny okres (kartkowanie do przodu), w PRAWO = poprzedni.
      shiftAnchor(dx < 0 ? 1 : -1);
    }, { passive: true });
    el.addEventListener('touchcancel', function () { active = false; }, { passive: true });
  }

  // ── Boot (wzorzec strony notatek: poll + onUnlock/onLock + auth-hidden) ─────
  function init() {
    if (state.inited) return;
    state.inited = true;
    injectCss();
    state.anchorISO = todayISO();
    state.selectedISO = todayISO();
    try {
      var saved = global.localStorage.getItem(VIEW_KEY);
      if (saved === 'week' || saved === 'day' || saved === 'month') state.view = saved;
    } catch (_) { /* noop */ }
    // Historia: bazowy wpis strony dostaje tzNav (replaceState) + listener
    // popstate — PO odtworzeniu widoku z localStorage, żeby baza była zgodna.
    _tzNavInstall();
    // Swipe na rootcie — element trwały (render podmienia tylko innerHTML),
    // więc wiążemy RAZ; gest działa we wszystkich widokach.
    try { bindSwipe(root()); } catch (_) { /* noop */ }
    _bindWeekPopSwallow();
    try { bindRowSwipe(root()); } catch (_) { /* noop */ }

    var V = getVault();
    if (V) {
      if (typeof V.onUnlock === 'function') V.onUnlock(function () { refresh(); });
      if (typeof V.onLock === 'function') V.onLock(function () { render(); });
      if (typeof V.onPatientNoteChanged === 'function') {
        V.onPatientNoteChanged(function () { refresh(); });
      }
    }
    doc.addEventListener('vilda:auth-hidden', function () { refresh(); });
    // Esc zamyka rozcięcie siatki (gdy nie ma nad nim modalu — ten ma własny Esc).
    doc.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape' || !state.splitISO) return;
      if (doc.getElementById('tzNewTermOverlay')) return;
      closeSplit(true);
    });
    // Cykl C: zmiana breakpointu (obrót telefonu, zmiana okna) → re-render
    // właściwego wariantu (W1↔W2, D1↔D2). Dane są te same — bez ponownego fetchu.
    if (_mq) {
      var onMq = function () { if (state.inited && unlocked()) render(); };
      if (typeof _mq.addEventListener === 'function') _mq.addEventListener('change', onMq);
      else if (typeof _mq.addListener === 'function') _mq.addListener(onMq);
    }
    if (unlocked()) refresh(); else render();
    // Vault mógł nie być gotowy przy DOMContentLoaded — krótki poll jak na notatkach.
    var tries = 0;
    var t = setInterval(function () {
      tries += 1;
      if (unlocked()) { clearInterval(t); refresh(); }
      else if (tries > 40) { clearInterval(t); }
    }, 250);
  }

  function start() {
    if (!root()) return; // moduł ładowany tylko na terminarz.html
    // Zdejmij js-loading — bez tego .main-content zostaje visibility:hidden
    // (pusta strona). Wzorzec stron z własnym bootem (notatki.html).
    try { doc.body.classList.remove('js-loading'); } catch (_) { /* noop */ }
    init();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();

  global.VildaTerminarz = { version: VERSION, refresh: refresh, setView: setView };
})(typeof window !== 'undefined' ? window : this);
