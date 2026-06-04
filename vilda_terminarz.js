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

  var VERSION = '1.4.2';
  var doc = global.document;
  if (!doc) return;

  var MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
    'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
  var MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
    'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  var WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
  var WEEKDAYS_FULL = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];
  var CAT_LABEL = { followup: 'Kontrola', observation: 'Obserwacja', treatment: 'Leczenie', 'wynik-badania': 'Wynik badania' };
  var CAT_CLASS = { followup: 'tz-cat-followup', observation: 'tz-cat-observation', treatment: 'tz-cat-treatment', 'wynik-badania': 'tz-cat-wynik' };
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
    notesByDay: {},        // YYYY-MM-DD -> [note+patientName]
    overdue: [],           // płaska lista pending z terminem < dziś
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
    + '.terminarz-locked{text-align:center;padding:64px 16px;color:#5b6672;}'
    + '.terminarz-locked__icon{font-size:2rem;margin-bottom:8px;}'
    + '.terminarz-locked__title{font-weight:600;color:#0f2b33;margin:0 0 4px;}'
    + '.terminarz-locked__desc{margin:0;font-size:0.9rem;}'
    + '.tz-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}'
    + '.tz-topbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0 14px;}'
    + '.tz-topbar__sp{flex:1 1 auto;}'
    + '.tz-nav{display:flex;align-items:center;gap:6px;min-width:0;}'
    + '.tz-nav button{border:0.5px solid #d7e9ec;background:#fff;border-radius:10px;padding:8px 14px;cursor:pointer;font-size:0.95rem;color:#0f2b33;font-weight:600;}'
    + '.tz-nav button:hover{background:#f2fafb;}'
    + '.tz-title{font-weight:700;color:#0f2b33;font-size:1.3rem;line-height:1.2;text-align:left;padding:0 0 0 8px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.tz-today-m{display:none;}'
    + '.tz-switch{display:flex;border:0.5px solid #d7e9ec;border-radius:10px;overflow:hidden;}'
    + '.tz-switch button{border:0;background:#fff;padding:8px 14px;font-size:0.85rem;color:#5b6672;cursor:pointer;font-weight:600;}'
    + '.tz-switch button.is-active{background:#00838d;color:#fff;}'
    + '.tz-switch button:not(.is-active):hover{background:#f2fafb;}'
    + '.tz-overdue{background:#fff7ed;border:1px solid #fdba74;border-radius:12px;padding:10px 14px;margin:0 0 14px;}'
    + '.tz-overdue__head{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;font-weight:600;color:#9a3412;}'
    + '.tz-overdue__list{margin:8px 0 0;display:none;}'
    + '.tz-overdue.is-open .tz-overdue__list{display:block;}'
    + '.tz-grid{background:#fff;border:0.5px solid #d7e9ec;border-radius:14px;overflow:hidden;}'
    + '.tz-grid__head{display:grid;grid-template-columns:repeat(7,1fr);background:#f2fafb;border-bottom:0.5px solid #d7e9ec;}'
    + '.tz-grid__head div{padding:8px 6px;text-align:center;font-size:0.75rem;font-weight:600;color:#5b6672;text-transform:uppercase;letter-spacing:0.04em;}'
    + '.tz-grid__body{display:grid;grid-template-columns:repeat(7,1fr);}'
    + '.tz-cell{min-height:92px;border-bottom:0.5px solid #e7f1f3;border-right:0.5px solid #e7f1f3;padding:6px;cursor:pointer;position:relative;background:#fff;transition:background .12s;}'
    + '.tz-cell:nth-child(7n){border-right:0;}'
    + '.tz-cell:hover{background:#f7fcfd;}'
    + '.tz-cell.is-other{background:#fafcfc;color:#9aa8aa;}'
    + '.tz-cell.is-selected{background:#e6f5f6;box-shadow:inset 0 0 0 2px #00838d;border-radius:8px;}'
    + '.tz-cell__num{font-size:0.82rem;font-weight:600;color:#0f2b33;display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;border-radius:12px;}'
    + '.tz-cell.is-other .tz-cell__num{color:#9aa8aa;}'
    + '.tz-cell.is-today .tz-cell__num{background:#00838d;color:#fff;}'
    + '.tz-chip{display:block;margin-top:3px;font-size:0.7rem;line-height:1.25;padding:2px 6px;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#0f2b33;background:#eef6f7;border-left:3px solid #00838d;}'
    + '.tz-chip.is-done{opacity:0.55;text-decoration:line-through;}'
    + '.tz-chip.tz-cat-treatment{border-left-color:#7c5cd6;}'
    + '.tz-chip.tz-cat-observation{border-left-color:#0ea5e9;}'
    + '.tz-chip.tz-cat-wynik{border-left-color:#b45309;}'
    + '.tz-chip--more{background:transparent;border-left:0;color:#5b6672;font-weight:600;}'
    + '.tz-day-panel{margin-top:14px;background:#fff;border:0.5px solid #d7e9ec;border-radius:14px;padding:14px 16px;}'
    + '.tz-day-panel h2{margin:0 0 10px;font-size:1.02rem;color:#0f2b33;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}'
    + '.tz-day-panel h2 button{border:0.5px solid #d7e9ec;background:#fff;border-radius:8px;padding:4px 10px;font-size:0.76rem;cursor:pointer;color:#00838d;font-weight:600;}'
    + '.tz-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:0.5px solid #eef4f5;}'
    + '.tz-row:last-child{border-bottom:0;}'
    + '.tz-row.is-done .tz-row__title{ text-decoration:line-through;opacity:0.6;}'
    + '.tz-row.is-overdue{background:#fff7ed;border-radius:10px;padding:9px 10px;border-bottom:0;margin-bottom:5px;}'
    + '.tz-row__main{min-width:0;}'
    + '.tz-row__patient{font-weight:600;color:#00838d;font-size:0.88rem;}'
    + '.tz-row__title{color:#0f2b33;font-size:0.92rem;margin-top:1px;word-break:break-word;}'
    + '.tz-row__meta{font-size:0.75rem;color:#5b6672;margin-top:2px;}'
    + '.tz-badge{display:inline-block;font-size:0.68rem;font-weight:600;padding:1px 7px;border-radius:8px;background:#eef6f7;color:#00606a;margin-right:6px;}'
    + '.tz-actions{display:flex;gap:6px;flex:0 0 auto;flex-wrap:wrap;justify-content:flex-end;}'
    + '.tz-actions button{border:0.5px solid #d7e9ec;background:#fff;border-radius:8px;padding:5px 9px;font-size:0.78rem;cursor:pointer;color:#0f2b33;}'
    + '.tz-actions button:hover{background:#f2fafb;}'
    + '.tz-actions .tz-done-btn{border-color:#00838d;color:#00838d;font-weight:600;}'
    + '.tz-empty{color:#5b6672;font-size:0.88rem;padding:6px 0;}'
    + '.tz-postpone-menu{position:absolute;z-index:50;background:#fff;border:0.5px solid #d7e9ec;border-radius:10px;box-shadow:0 8px 28px rgba(0,60,80,0.18);padding:4px;}'
    + '.tz-postpone-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:7px 12px;border-radius:7px;cursor:pointer;font-size:0.85rem;color:#0f2b33;}'
    + '.tz-postpone-menu button:hover{background:#f2fafb;}'
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
    + '.tz-modal label{display:block;font-size:0.78rem;color:#5b6672;margin-bottom:4px;font-weight:500;}'
    + '.tz-modal input[type="text"],.tz-modal input[type="date"]{width:100%;height:38px;padding:0 10px;font-size:0.92rem;border:0.5px solid #d7e9ec;border-radius:8px;background:#fff;color:#0f2b33;box-sizing:border-box;}'
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
    + '.tz-ntcats{display:flex;gap:6px;flex-wrap:wrap;}'
    + '.tz-nt-daterow{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}'
    + '.tz-nt-daterow input[type="date"]{width:auto;flex:0 0 auto;}'
    + '.tz-modal__err{color:#A32D2D;font-size:0.8rem;line-height:1.4;display:none;}'
    + '.tz-modal__actions{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:4px;}'
    /* ── Święta państwowe: czerwone oznaczenia w trzech widokach ── */
    + '.tz-cell.is-holiday .tz-cell__num{color:#b91c1c;}'
    + '.tz-cell.is-today.is-holiday .tz-cell__num{color:#fff;}'
    + '.tz-cell__holiday{display:block;font-size:0.62rem;color:#b91c1c;font-weight:600;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.tz-wcol.is-holiday .tz-wcol__num{color:#b91c1c;}'
    + '.tz-wcol.is-today.is-holiday .tz-wcol__num{color:#fff;}'
    + '.tz-wcol__holiday{font-size:0.66rem;color:#b91c1c;font-weight:600;padding:1px 2px 0;line-height:1.15;}'
    + '.tz-holiday-inline{color:#b91c1c;font-weight:600;font-size:0.78rem;}'
    + '.tz-holiday-line{background:#fef2f2;border:0.5px solid #fecaca;color:#991b1b;border-radius:10px;padding:8px 12px;font-size:0.82rem;font-weight:600;margin:0 0 10px;}'
    + '@media (max-width:700px){.tz-cell{min-height:58px;padding:4px;}.tz-grid .tz-chip{display:none;}.tz-cell__holiday{display:none;}'
    + '.tz-cell__dots{display:flex;gap:2px;margin-top:3px;flex-wrap:wrap;}'
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
    + '.tz-cell__dots{display:flex;gap:3px;margin-top:4px;flex-wrap:wrap;}'
    + '.tz-dot{width:7px;height:7px;border-radius:50%;background:#00838d;display:inline-block;}'
    + '.tz-dot.tz-cat-treatment{background:#7c5cd6;}.tz-dot.tz-cat-observation{background:#0ea5e9;}.tz-dot.tz-cat-wynik{background:#b45309;}.tz-dot.is-done{opacity:0.4;}'
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
    + '.liquid-ios26 .terminarz-shell .tz-nav button:hover,'
    + '.liquid-ios26 .terminarz-shell .tz-actions button:hover,'
    + '.liquid-ios26 .terminarz-shell .tz-card__open:hover,'
    + '.liquid-ios26 .tz-postpone-menu button:hover{background:#f2fafb !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-actions button{border-radius:8px !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-actions .tz-done-btn{border-color:#00838d !important;color:#00838d !important;}'
    + '.liquid-ios26 .terminarz-shell .tz-card__open,'
    + '.liquid-ios26 .terminarz-shell .tz-day-panel h2 button{border-radius:8px !important;color:#00838d !important;}'
    + '.liquid-ios26 .tz-postpone-menu button{border:0 !important;border-radius:7px !important;text-align:left !important;}'
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
    + 'border-radius:9px !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;padding:8px 14px !important;font-size:0.85rem !important;}'
    + '.liquid-ios26 .tz-modal button:hover{background:#f2fafb !important;}'
    + '.liquid-ios26 .tz-modal .tz-ntcat{border-radius:999px !important;padding:5px 12px !important;color:#5b6672 !important;font-size:0.8rem !important;}'
    + '.liquid-ios26 .tz-modal .tz-ntcat.is-on{background:#e6f5f6 !important;color:#00606a !important;border-color:#5DCAA5 !important;font-weight:600 !important;}'
    + '.liquid-ios26 .tz-modal .tz-nt-save{background:#00838d !important;color:#fff !important;border-color:#00838d !important;font-weight:600 !important;}'
    + '.liquid-ios26 .tz-modal .tz-nt-save:hover{background:#006f78 !important;}'
    + '.liquid-ios26 .tz-modal .tz-link-btn{background:transparent !important;border:0 !important;color:#00838d !important;'
    + 'text-decoration:underline !important;padding:0 !important;margin-right:auto !important;box-shadow:none !important;font-size:0.8rem !important;}'
    + '.liquid-ios26 .tz-modal input[type="text"],.liquid-ios26 .tz-modal input[type="date"]{'
    + 'background:#fff !important;border:0.5px solid #d7e9ec !important;color:#0f2b33 !important;'
    + 'border-radius:8px !important;box-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}'
    /* Mobile: FAB widoczny, arkusz od dołu, plusy w komórkach miesiąca zbędne. */
    + '@media (max-width:700px){'
    + '.tz-add-btn{display:none;}'
    + '.terminarz-shell .tz-fab{display:flex;position:fixed;right:16px;bottom:calc(18px + env(safe-area-inset-bottom,0px));'
    + 'width:54px;height:54px;align-items:center;justify-content:center;font-size:1.7rem;z-index:900;cursor:pointer;}'
    + '.tz-cell__add{display:none !important;}'
    + '.tz-modal-overlay{align-items:flex-end;padding:0;}'
    + '.tz-modal{max-width:none;border-radius:14px 14px 0 0;max-height:86vh;padding-bottom:calc(18px + env(safe-area-inset-bottom,0px));}'
    /* iOS: pole z font-size <16px wywołuje auto-zoom przy fokusie — na mobile
     * KAŻDE pole modalu ma >=16px (wzorzec _preventIosFocusZoom z auth UI). */
    + '.tz-modal input[type="text"],.tz-modal input[type="date"]{font-size:16px !important;height:42px;}'
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
  }
  function showNewTermModal(prefillISO) {
    if (!unlocked()) return;
    var V = getVault();
    if (!V || typeof V.savePatientNote !== 'function' || typeof V.listPatients !== 'function') {
      try { global.alert('Dodawanie terminów niedostępne — odśwież stronę (Ctrl+Shift+R).'); } catch (_) {}
      return;
    }
    closeNewTermModal();
    var selPid = null;
    var selName = null;
    var selCat = 'followup';
    var allPatients = null; // [{patientId, name}]

    var overlay = doc.createElement('div');
    overlay.id = 'tzNewTermOverlay';
    overlay.className = 'tz-modal-overlay';
    var initISO = (typeof prefillISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(prefillISO)) ? prefillISO : todayISO();
    overlay.innerHTML = ''
      + '<div class="tz-modal" role="dialog" aria-modal="true" aria-label="Nowy termin">'
      + '<h3>Nowy termin</h3>'
      + '<div><label for="tzNtSearch">Pacjent</label>'
      + '<div class="tz-nt-combo">'
      + '<input type="text" id="tzNtSearch" autocomplete="off" placeholder="Szukaj pacjenta…">'
      + '<div class="tz-nt-list" id="tzNtList"><div class="tz-nt-empty">Wczytuję pacjentów…</div></div>'
      + '</div></div>'
      + '<div><label for="tzNtTitle">Tytuł</label>'
      + '<input type="text" id="tzNtTitle" autocomplete="off" value="Wizyta kontrolna"></div>'
      + '<div><label>Kategoria</label><div class="tz-ntcats" id="tzNtCats">'
      + '<button type="button" class="tz-ntcat is-on" data-cat="followup">Kontrola</button>'
      + '<button type="button" class="tz-ntcat" data-cat="wynik-badania">Wynik badania</button>'
      + '<button type="button" class="tz-ntcat" data-cat="treatment">Leczenie</button>'
      + '<button type="button" class="tz-ntcat" data-cat="observation">Obserwacja</button>'
      + '</div></div>'
      + '<div><label for="tzNtDate">Termin</label>'
      + '<div class="tz-nt-daterow"><input type="date" id="tzNtDate" value="' + esc(initISO) + '">'
      + '<button type="button" class="tz-ntcat" data-plus-days="7">+1 tydz.</button>'
      + '<button type="button" class="tz-ntcat" data-plus-days="30">+1 mies.</button>'
      + '<button type="button" class="tz-ntcat" data-plus-days="91">+3 mies.</button>'
      + '</div></div>'
      + '<div class="tz-modal__err" id="tzNtErr"></div>'
      + '<div class="tz-modal__actions">'
      + '<button type="button" class="tz-link-btn" id="tzNtFull">Pełny edytor →</button>'
      + '<button type="button" id="tzNtCancel">Anuluj</button>'
      + '<button type="button" class="tz-nt-save" id="tzNtSave">Zapisz termin</button>'
      + '</div></div>';

    var searchEl = overlay.querySelector('#tzNtSearch');
    var listEl = overlay.querySelector('#tzNtList');
    var titleEl = overlay.querySelector('#tzNtTitle');
    var dateEl = overlay.querySelector('#tzNtDate');
    var errEl = overlay.querySelector('#tzNtErr');
    var saveBtn = overlay.querySelector('#tzNtSave');

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
        listEl.innerHTML = '<div class="tz-nt-empty">' + (allPatients.length ? 'Brak pacjenta dla „' + esc(q) + '”.' : 'Brak pacjentów — zapisz pierwszego w aplikacji.') + '</div>';
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

    searchEl.addEventListener('input', function () {
      // Edycja tekstu unieważnia wybór, jeśli przestał pasować.
      if (selName && searchEl.value !== selName) { selPid = null; selName = null; }
      renderList();
      openList();
    });
    searchEl.addEventListener('focus', function () { renderList(); openList(); });
    searchEl.addEventListener('blur', function () { closeList(); });

    var catBtns = overlay.querySelectorAll('.tz-ntcat[data-cat]');
    for (var cb = 0; cb < catBtns.length; cb += 1) {
      (function (btn) {
        btn.addEventListener('click', function () {
          selCat = btn.getAttribute('data-cat');
          for (var x = 0; x < catBtns.length; x += 1) catBtns[x].classList.remove('is-on');
          btn.classList.add('is-on');
        });
      })(catBtns[cb]);
    }
    var plusBtns = overlay.querySelectorAll('[data-plus-days]');
    for (var pb = 0; pb < plusBtns.length; pb += 1) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var days = parseInt(btn.getAttribute('data-plus-days'), 10) || 0;
          var t = new Date();
          dateEl.value = dayISO(new Date(t.getFullYear(), t.getMonth(), t.getDate() + days));
        });
      })(plusBtns[pb]);
    }

    function validate() {
      clearErr();
      if (!selPid) { showErr('Wybierz pacjenta z listy.'); try { searchEl.focus(); } catch (_) {} return null; }
      var title = (titleEl.value || '').trim();
      if (!title) { showErr('Podaj tytuł terminu (np. „Kontrola wzrostu”).'); try { titleEl.focus(); } catch (_) {} return null; }
      var dISO = dateEl.value || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dISO)) { showErr('Podaj datę terminu.'); try { dateEl.focus(); } catch (_) {} return null; }
      return { title: title, dISO: dISO };
    }

    saveBtn.addEventListener('click', function () {
      var v = validate();
      if (!v) return;
      saveBtn.disabled = true;
      V.savePatientNote({ patientId: selPid, title: v.title, category: selCat, dueDateISO: v.dISO })
        .then(function () { closeNewTermModal(); refresh(); })
        .catch(function (e) {
          saveBtn.disabled = false;
          showErr('Nie udało się zapisać terminu: ' + (e && e.message || ''));
        });
    });

    overlay.querySelector('#tzNtFull').addEventListener('click', function () {
      // Furtka P3: pełny edytor notatki z prefillm (note BEZ id = nowa notatka).
      var AUI = global.VildaAuthUI;
      if (!selPid) { showErr('Najpierw wybierz pacjenta z listy.'); return; }
      if (!AUI || typeof AUI.showPatientNoteEditor !== 'function') { showErr('Pełny edytor niedostępny — odśwież stronę.'); return; }
      var draft = { title: (titleEl.value || '').trim(), category: selCat, dueDateISO: (dateEl.value || null) };
      closeNewTermModal();
      AUI.showPatientNoteEditor({ patientId: selPid, note: draft, onSaved: function () { refresh(); } });
    });
    overlay.querySelector('#tzNtCancel').addEventListener('click', closeNewTermModal);
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
    // BEZ autofokusu: fokus otwiera dropdown pacjenta (ma być schowany do czasu
    // interakcji), a na mobile wystrzeliwałby klawiaturę przy każdym otwarciu.
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
    return ''
      + '<div class="tz-row' + (done ? ' is-done' : '') + (opts.overdue ? ' is-overdue' : '') + '" data-note-id="' + esc(n.id) + '">'
      + '<div class="tz-row__main">'
      + (opts.hidePatient ? '' : ('<div class="tz-row__patient">' + esc(n.patientName || '') + '</div>'))
      + '<div class="tz-row__title">' + esc(n.title || n.body || '(bez tytułu)') + '</div>'
      + '<div class="tz-row__meta"><span class="tz-badge">' + esc(cat) + '</span>'
      + (opts.withDate ? ('termin: ' + esc(plDate(noteDayISO(n)))) : '')
      + (done ? ' · wykonane' : '') + '</div>'
      + '</div>'
      + '<div class="tz-actions">'
      + (done
        ? '<button type="button" data-act="undone">↺ Cofnij</button>'
        : '<button type="button" class="tz-done-btn" data-act="done">✓ Wykonane</button>'
          + '<button type="button" data-act="postpone">↻ Przełóż</button>')
      + '<button type="button" data-act="edit">✎ Edytuj</button>'
      + '</div>'
      + '</div>';
  }

  function bindRowActions(container, lookup) {
    var rows = container.querySelectorAll('.tz-row');
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
      + '</div>';
  }

  function overdueStripHtml(lookup) {
    if (!state.overdue.length) return '';
    var html = '<div class="tz-overdue" id="tzOverdue">'
      + '<div class="tz-overdue__head" id="tzOverdueHead"><span>⚠ Zaległe: ' + state.overdue.length
      + (state.overdue.length === 1 ? ' termin' : (state.overdue.length < 5 ? ' terminy' : ' terminów'))
      + '</span><span>▾</span></div>'
      + '<div class="tz-overdue__list">';
    state.overdue.forEach(function (n) { lookup[n.id] = n; html += noteRowHtml(n, { withDate: true }); });
    html += '</div></div>';
    return html;
  }

  // ── Render: MIESIĄC (Cykl A — bez zmian funkcjonalnych) ─────────────────────
  function monthBodyHtml(lookup) {
    var tISO = todayISO();
    var a = parseISO(state.anchorISO);
    var month = a.getMonth();
    var r = gridRange(a.getFullYear(), month);
    var html = '<div class="tz-grid"><div class="tz-grid__head">';
    WEEKDAYS.forEach(function (w) { html += '<div>' + w + '</div>'; });
    html += '</div><div class="tz-grid__body">';
    for (var i = 0; i < 42; i += 1) {
      var d = new Date(r.start.getFullYear(), r.start.getMonth(), r.start.getDate() + i);
      var iso = dayISO(d);
      var inMonth = d.getMonth() === month;
      var items = state.notesByDay[iso] || [];
      var hol = holidayName(iso);
      var cls = 'tz-cell' + (inMonth ? '' : ' is-other') + (iso === tISO ? ' is-today' : '')
        + (iso === state.selectedISO ? ' is-selected' : '') + (hol ? ' is-holiday' : '');
      html += '<div class="' + cls + '" data-day="' + iso + '"' + (hol ? ' title="' + esc(hol) + '"' : '') + '>'
        + '<span class="tz-cell__num">' + d.getDate() + '</span>'
        + '<button type="button" class="tz-cell__add" data-add-day="' + iso + '" aria-label="Dodaj termin ' + iso + '">+</button>';
      if (hol) html += '<span class="tz-cell__holiday">' + esc(hol) + '</span>';
      if (items.length) {
        // Desktop: do 2 chipów + „+N"; mobile (CSS): kropki.
        for (var c = 0; c < Math.min(items.length, 2); c += 1) {
          var n2 = items[c];
          html += '<span class="tz-chip ' + (CAT_CLASS[n2.category] || '') + (n2.completedAtISO ? ' is-done' : '') + '">'
            + esc((n2.patientName || '').split(' ')[0] || '') + ' · ' + esc(n2.title || '') + '</span>';
        }
        if (items.length > 2) html += '<span class="tz-chip tz-chip--more">+' + (items.length - 2) + '</span>';
        html += '<span class="tz-cell__dots">';
        for (var dgt = 0; dgt < Math.min(items.length, 4); dgt += 1) {
          html += '<span class="tz-dot ' + (CAT_CLASS[items[dgt].category] || '') + (items[dgt].completedAtISO ? ' is-done' : '') + '"></span>';
        }
        html += '</span>';
      }
      html += '</div>';
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
      dayItems.forEach(function (n) { lookup[n.id] = n; html += noteRowHtml(n, {}); });
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

  function weekGridHtml() {
    // W1: 7 kolumn pn-nd, chipy pacjent+tytuł; klik dnia → widok dnia.
    var tISO = todayISO();
    var html = '<div class="tz-week">';
    weekDays().forEach(function (d, idx) {
      var iso = dayISO(d);
      var items = state.notesByDay[iso] || [];
      var hol = holidayName(iso);
      html += '<div class="tz-wcol' + (iso === tISO ? ' is-today' : '') + (hol ? ' is-holiday' : '') + '">'
        + '<div class="tz-wcol__head" data-goto-day="' + iso + '"' + (hol ? ' title="' + esc(hol) + '"' : '') + '>' + WEEKDAYS[idx]
        + '<span class="tz-wcol__num">' + d.getDate() + '</span>'
        + '<button type="button" class="tz-wcol__add" data-add-day="' + iso + '" aria-label="Dodaj termin ' + iso + '">+</button></div>'
        + '<div class="tz-wcol__body" data-goto-day="' + iso + '">';
      if (hol) html += '<span class="tz-wcol__holiday">' + esc(hol) + '</span>';
      items.forEach(function (n) {
        html += '<span class="tz-chip ' + (CAT_CLASS[n.category] || '') + (n.completedAtISO ? ' is-done' : '') + '">'
          + esc((n.patientName || '').split(' ')[0] || '') + ' · ' + esc(n.title || '') + '</span>';
      });
      html += '</div></div>';
    });
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
      items.forEach(function (n) { lookup[n.id] = n; html += noteRowHtml(n, {}); });
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
    // D1: checklista zaległe → dziś → wykonane.
    var s = daySplit();
    var html = dayHolidayLineHtml() + '<div class="tz-day-panel">';
    if (s.overdue.length) {
      html += '<div class="tz-sec-h is-overdue">Zaległe · ' + s.overdue.length + '</div>';
      s.overdue.forEach(function (n) { lookup[n.id] = n; html += noteRowHtml(n, { withDate: true, overdue: true }); });
    }
    html += '<div class="tz-sec-h">Na ten dzień · ' + s.pending.length + '</div>';
    if (!s.pending.length) {
      html += '<div class="tz-empty">Brak terminów. Dodaj „follow-up" z karty pacjenta (🔔 Przypomnij).</div>';
    } else {
      s.pending.forEach(function (n) { lookup[n.id] = n; html += noteRowHtml(n, {}); });
    }
    if (s.done.length) {
      html += '<div class="tz-sec-h is-done">Wykonane · ' + s.done.length + '</div>';
      s.done.forEach(function (n) { lookup[n.id] = n; html += noteRowHtml(n, {}); });
    }
    html += '</div>';
    return html;
  }

  function groupByPatient(notes) {
    var order = [], byPid = {};
    notes.forEach(function (n) {
      if (!byPid[n.patientId]) { byPid[n.patientId] = { patientId: n.patientId, patientName: n.patientName, notes: [] }; order.push(n.patientId); }
      byPid[n.patientId].notes.push(n);
    });
    return order.map(function (pid) { return byPid[pid]; });
  }

  function dayCardsHtml(lookup) {
    // D2: karty per pacjent; zaległe (tylko dziś) jako bursztynowe karty na czele.
    var s = daySplit();
    var html = dayHolidayLineHtml();
    var groups = [];
    groupByPatient(s.overdue).forEach(function (g) { g._overdue = true; groups.push(g); });
    groupByPatient(s.pending.concat(s.done)).forEach(function (g) { groups.push(g); });
    if (!groups.length) {
      return html + '<div class="tz-day-panel"><div class="tz-empty">Brak terminów tego dnia. Dodaj „follow-up" z karty pacjenta (🔔 Przypomnij).</div></div>';
    }
    html += '<div class="tz-cards">';
    groups.forEach(function (g) {
      var firstNoteId = g.notes.length ? g.notes[0].id : '';
      html += '<div class="tz-card' + (g._overdue ? ' is-overdue' : '') + '">'
        + '<div class="tz-card__head">'
        + '<span class="tz-card__ava">' + esc(initials(g.patientName)) + '</span>'
        + '<span class="tz-card__name">' + esc(g.patientName || '')
        + (g._overdue ? '<div class="tz-card__sub">zaległe</div>' : '') + '</span>'
        + '<button type="button" class="tz-card__open" data-open-patient="' + esc(g.patientId) + '" data-focus-note="' + esc(firstNoteId) + '">Karta pacjenta</button>'
        + '</div>';
      g.notes.forEach(function (n) {
        lookup[n.id] = n;
        html += noteRowHtml(n, { hidePatient: true, withDate: !!g._overdue });
      });
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  // ── Render: dyspozytor ──────────────────────────────────────────────────────
  function render() {
    var el = root();
    if (!el) return;
    if (!unlocked()) { renderLocked(el); return; }

    var lookup = {};
    var html = headerHtml();

    // Pas zaległych: miesiąc + tydzień (w widoku dnia zaległe są sekcją/kartami).
    if (state.view !== 'day') html += overdueStripHtml(lookup);

    if (state.view === 'week') {
      html += isMobile() ? weekAgendaHtml(lookup) : weekGridHtml();
    } else if (state.view === 'day') {
      html += isMobile() ? dayChecklistHtml(lookup) : dayCardsHtml(lookup);
    } else {
      html += monthBodyHtml(lookup);
    }

    // Cykl D: FAB „+" (tylko mobile — CSS) — globalne dodawanie terminu.
    html += '<button type="button" id="tzFab" class="tz-fab" aria-label="Nowy termin">+</button>';

    el.innerHTML = html;

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
          state.selectedISO = cell.getAttribute('data-day');
          render(); // dane już w pamięci — sam re-render
        });
      })(cells[ci]);
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
          showNewTermModal(a.getAttribute('data-add-day'));
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
    try { global.localStorage.setItem(VIEW_KEY, view); } catch (_) { /* flaga UI — opcjonalna */ }
    refresh();
  }

  function shiftAnchor(delta) {
    var a = parseISO(state.anchorISO);
    if (state.view === 'week') {
      state.anchorISO = dayISO(new Date(a.getFullYear(), a.getMonth(), a.getDate() + delta * 7));
    } else if (state.view === 'day') {
      state.anchorISO = dayISO(new Date(a.getFullYear(), a.getMonth(), a.getDate() + delta));
    } else {
      // Miesiąc: kotwica na 1. dzień miesiąca docelowego (31→luty bez przeskoku).
      state.anchorISO = dayISO(new Date(a.getFullYear(), a.getMonth() + delta, 1));
    }
    refresh();
  }

  var _refreshQueued = false;
  function refresh() {
    if (!unlocked()) { render(); return; }
    if (_refreshQueued) return;
    _refreshQueued = true;
    loadData().then(function () { _refreshQueued = false; render(); })
      .catch(function () { _refreshQueued = false; render(); });
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

    var V = getVault();
    if (V) {
      if (typeof V.onUnlock === 'function') V.onUnlock(function () { refresh(); });
      if (typeof V.onLock === 'function') V.onLock(function () { render(); });
      if (typeof V.onPatientNoteChanged === 'function') {
        V.onPatientNoteChanged(function () { refresh(); });
      }
    }
    doc.addEventListener('vilda:auth-hidden', function () { refresh(); });
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
