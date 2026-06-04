/* ==========================================================================
 * vilda_terminarz.js — Terminarz kliniczny (Cykl A, 2026-06-04)
 *
 * Prywatny follow-up lekarza: siatka MIESIĘCZNA z notatek pacjentów z terminem
 * (dueDateISO) + pas „Zaległe" + panel wybranego dnia z akcjami. To NIE jest
 * kalendarz wizyt/booking — wyłącznie zadania kliniczne lekarza.
 *
 * Dane: VildaVault.listPatientNotesInRange(from,to) (siatka, także wykonane)
 * oraz listPatientNotesDueByDate (pas zaległych — pending z terminem < dziś).
 * Akcje: ✓ Wykonane / ↺ Cofnij (savePatientNote z completedAtISO — vault robi
 * merge-by-id, hasOwnProperty: ISO ustawia, null czyści, brak pola zachowuje),
 * ↻ Przełóż (+1 tydz./+1 mies./+3 mies. → dueDateISO), ✎ Edytuj (istniejący
 * VildaAuthUI.showPatientNoteEditor). Live-refresh: V.onPatientNoteChanged.
 *
 * BEZPIECZEŃSTWO DANYCH MEDYCZNYCH: terminy + nazwiska liczone lokalnie po
 * odszyfrowaniu vaulta; moduł niczego nie zapisuje poza notatkami w vaultcie
 * (żadnych nowych magazynów, zero plaintextu poza pamięcią strony).
 * ========================================================================== */
(function (global) {
  'use strict';

  var VERSION = '1.0.1';
  var doc = global.document;
  if (!doc) return;

  var MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
    'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
  var WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
  var CAT_LABEL = { followup: 'Kontrola', observation: 'Obserwacja', treatment: 'Leczenie', 'wynik-badania': 'Wynik badania' };
  var CAT_CLASS = { followup: 'tz-cat-followup', observation: 'tz-cat-observation', treatment: 'tz-cat-treatment', 'wynik-badania': 'tz-cat-wynik' };

  var state = {
    inited: false,
    year: null,
    month: null,           // 0-11
    selectedISO: null,     // YYYY-MM-DD
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

  // ── CSS (wstrzykiwane raz — bez dotykania plików .css) ─────────────────────
  var CSS = ''
    + '.terminarz-shell{max-width:980px;margin:0 auto;padding:8px 0 40px;}'
    + '.terminarz-locked{text-align:center;padding:64px 16px;color:#5b6672;}'
    + '.terminarz-locked__icon{font-size:2rem;margin-bottom:8px;}'
    + '.terminarz-locked__title{font-weight:600;color:#0f2b33;margin:0 0 4px;}'
    + '.terminarz-locked__desc{margin:0;font-size:0.9rem;}'
    + '.tz-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:6px 0 14px;}'
    + '.tz-head h1{margin:0;font-size:1.4rem;color:#0f2b33;}'
    + '.tz-head__sub{margin:2px 0 0;font-size:0.82rem;color:#5b6672;}'
    + '.tz-nav{display:flex;align-items:center;gap:6px;}'
    + '.tz-nav button{border:0.5px solid #d7e9ec;background:#fff;border-radius:10px;padding:8px 14px;cursor:pointer;font-size:0.95rem;color:#0f2b33;font-weight:600;}'
    + '.tz-nav button:hover{background:#f2fafb;}'
    + '.tz-nav .tz-month-label{min-width:170px;text-align:center;font-weight:600;color:#0f2b33;font-size:1.02rem;}'
    + '.tz-overdue{background:#fff7ed;border:1px solid #fdba74;border-radius:12px;padding:10px 14px;margin:0 0 14px;}'
    + '.tz-overdue__head{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;font-weight:600;color:#9a3412;}'
    + '.tz-overdue__list{margin:8px 0 0;display:none;}'
    + '.tz-overdue.is-open .tz-overdue__list{display:block;}'
    + '.tz-grid{background:#fff;border:0.5px solid #d7e9ec;border-radius:14px;overflow:hidden;}'
    + '.tz-grid__week,{display:grid;}'
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
    + '.tz-day-panel h2{margin:0 0 10px;font-size:1.02rem;color:#0f2b33;}'
    + '.tz-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:0.5px solid #eef4f5;}'
    + '.tz-row:last-child{border-bottom:0;}'
    + '.tz-row.is-done .tz-row__title{ text-decoration:line-through;opacity:0.6;}'
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
    + '@media (max-width:700px){.tz-cell{min-height:58px;padding:4px;}.tz-chip{display:none;}'
    + '.tz-cell__dots{display:flex;gap:2px;margin-top:3px;flex-wrap:wrap;}'
    + '.tz-nav .tz-month-label{min-width:120px;font-size:0.92rem;}}'
    + '.tz-cell__dots{display:flex;gap:3px;margin-top:4px;flex-wrap:wrap;}'
    + '.tz-dot{width:7px;height:7px;border-radius:50%;background:#00838d;display:inline-block;}'
    + '.tz-dot.tz-cat-treatment{background:#7c5cd6;}.tz-dot.tz-cat-observation{background:#0ea5e9;}.tz-dot.tz-cat-wynik{background:#b45309;}.tz-dot.is-done{opacity:0.4;}';

  function injectCss() {
    if (doc.getElementById('vildaTerminarzCss')) return;
    var st = doc.createElement('style');
    st.id = 'vildaTerminarzCss';
    st.textContent = CSS;
    doc.head.appendChild(st);
  }

  // ── Dane ────────────────────────────────────────────────────────────────────
  function gridRange(year, month) {
    // Siatka pn-nd: od poniedziałku tygodnia z 1. dniem miesiąca, 6 tygodni (42 dni).
    var first = new Date(year, month, 1);
    var offset = (first.getDay() + 6) % 7; // pon=0
    var start = new Date(year, month, 1 - offset);
    var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 41);
    return { start: start, end: end };
  }

  function loadMonth() {
    var V = getVault();
    if (!V || typeof V.listPatientNotesInRange !== 'function') return Promise.resolve();
    var r = gridRange(state.year, state.month);
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

  // ── Render ──────────────────────────────────────────────────────────────────
  function root() { return doc.getElementById('terminarzRoot'); }

  function noteRowHtml(n, withDate) {
    var done = !!n.completedAtISO;
    var cat = CAT_LABEL[n.category] || n.category || '';
    return ''
      + '<div class="tz-row' + (done ? ' is-done' : '') + '" data-note-id="' + esc(n.id) + '">'
      + '<div class="tz-row__main">'
      + '<div class="tz-row__patient">' + esc(n.patientName || '') + '</div>'
      + '<div class="tz-row__title">' + esc(n.title || n.body || '(bez tytułu)') + '</div>'
      + '<div class="tz-row__meta"><span class="tz-badge">' + esc(cat) + '</span>'
      + (withDate ? ('termin: ' + esc(plDate(noteDayISO(n)))) : '')
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
  }

  function render() {
    var el = root();
    if (!el) return;
    if (!unlocked()) { renderLocked(el); return; }

    var tISO = todayISO();
    var lookup = {};
    var html = ''
      + '<div class="tz-head">'
      + '<div><h1>Terminarz kliniczny</h1>'
      + '<p class="tz-head__sub">Kontrole i zadania per pacjent — z notatek z terminem. To nie jest kalendarz wizyt.</p></div>'
      + '<div class="tz-nav">'
      + '<button type="button" id="tzPrev" aria-label="Poprzedni miesiąc">‹</button>'
      + '<span class="tz-month-label">' + MONTHS[state.month] + ' ' + state.year + '</span>'
      + '<button type="button" id="tzNext" aria-label="Następny miesiąc">›</button>'
      + '<button type="button" id="tzToday">Dziś</button>'
      + '</div></div>';

    // Pas zaległych.
    if (state.overdue.length) {
      html += '<div class="tz-overdue" id="tzOverdue">'
        + '<div class="tz-overdue__head" id="tzOverdueHead"><span>⚠ Zaległe: ' + state.overdue.length
        + (state.overdue.length === 1 ? ' termin' : (state.overdue.length < 5 ? ' terminy' : ' terminów'))
        + '</span><span>▾</span></div>'
        + '<div class="tz-overdue__list">';
      state.overdue.forEach(function (n) { lookup[n.id] = n; html += noteRowHtml(n, true); });
      html += '</div></div>';
    }

    // Siatka.
    var r = gridRange(state.year, state.month);
    html += '<div class="tz-grid"><div class="tz-grid__head">';
    WEEKDAYS.forEach(function (w) { html += '<div>' + w + '</div>'; });
    html += '</div><div class="tz-grid__body">';
    for (var i = 0; i < 42; i += 1) {
      var d = new Date(r.start.getFullYear(), r.start.getMonth(), r.start.getDate() + i);
      var iso = dayISO(d);
      var inMonth = d.getMonth() === state.month;
      var items = state.notesByDay[iso] || [];
      var cls = 'tz-cell' + (inMonth ? '' : ' is-other') + (iso === tISO ? ' is-today' : '')
        + (iso === state.selectedISO ? ' is-selected' : '');
      html += '<div class="' + cls + '" data-day="' + iso + '"><span class="tz-cell__num">' + d.getDate() + '</span>';
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

    // Panel wybranego dnia.
    var sel = state.selectedISO || tISO;
    var dayItems = state.notesByDay[sel] || [];
    html += '<div class="tz-day-panel"><h2>' + esc(plDate(sel)) + (sel === tISO ? ' (dziś)' : '') + '</h2>';
    if (!dayItems.length) {
      html += '<div class="tz-empty">Brak terminów tego dnia. Dodaj „follow-up" z karty pacjenta (Notatki → termin).</div>';
    } else {
      dayItems.forEach(function (n) { lookup[n.id] = n; html += noteRowHtml(n, false); });
    }
    html += '</div>';

    el.innerHTML = html;

    // Zdarzenia.
    var prev = doc.getElementById('tzPrev');
    var next = doc.getElementById('tzNext');
    var tdy = doc.getElementById('tzToday');
    if (prev) prev.addEventListener('click', function () { shiftMonth(-1); });
    if (next) next.addEventListener('click', function () { shiftMonth(1); });
    if (tdy) tdy.addEventListener('click', function () {
      var now = new Date();
      state.year = now.getFullYear(); state.month = now.getMonth(); state.selectedISO = todayISO();
      refresh();
    });
    var oh = doc.getElementById('tzOverdueHead');
    if (oh) oh.addEventListener('click', function () {
      var box = doc.getElementById('tzOverdue');
      if (box) box.classList.toggle('is-open');
    });
    var cells = el.querySelectorAll('.tz-cell');
    for (var ci = 0; ci < cells.length; ci += 1) {
      (function (cell) {
        cell.addEventListener('click', function () {
          state.selectedISO = cell.getAttribute('data-day');
          render(); // dane już w pamięci — sam re-render
        });
      })(cells[ci]);
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

  function shiftMonth(delta) {
    var m = state.month + delta;
    var y = state.year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    state.year = y; state.month = m;
    refresh();
  }

  var _refreshQueued = false;
  function refresh() {
    if (!unlocked()) { render(); return; }
    if (_refreshQueued) return;
    _refreshQueued = true;
    loadMonth().then(function () { _refreshQueued = false; render(); })
      .catch(function () { _refreshQueued = false; render(); });
  }

  // ── Boot (wzorzec strony notatek: poll + onUnlock/onLock + auth-hidden) ─────
  function init() {
    if (state.inited) return;
    state.inited = true;
    injectCss();
    var now = new Date();
    state.year = now.getFullYear();
    state.month = now.getMonth();
    state.selectedISO = todayISO();

    var V = getVault();
    if (V) {
      if (typeof V.onUnlock === 'function') V.onUnlock(function () { refresh(); });
      if (typeof V.onLock === 'function') V.onLock(function () { render(); });
      if (typeof V.onPatientNoteChanged === 'function') {
        V.onPatientNoteChanged(function () { refresh(); });
      }
    }
    doc.addEventListener('vilda:auth-hidden', function () { refresh(); });
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

  global.VildaTerminarz = { version: VERSION, refresh: refresh };
})(typeof window !== 'undefined' ? window : this);
