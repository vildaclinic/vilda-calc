/* ===========================================================================
   lab_pin_result.js — „Przypnij wynik do wizyty" (2026-06-12, akceptacja:
   wersja bazowa projektu „Wyniki lab → wizyta")
   ---------------------------------------------------------------------------
   Na stronie Jednostki lab., przy wczytanym pacjencie Z BAZY, przeliczony
   wynik można jednym tapnięciem zapisać jako notatkę pacjenta:
     • kategoria 'wynik-badania' (indygo w palecie),
     • clinicalDateISO = data badania (BEZ dueDateISO — wynik to historia
       kliniczna, nie zadanie: nie trafia do Terminarza ani Przypomnień),
     • linkedAgeMonths = wiek bieżącej wizyty (kotwica — Historia karty
       ustawia wynik przy właściwej wizycie, obok wzrostu/wagi/centyli),
     • labResult = { test, value } — strukturalnie (schemat B3.0 vaulta),
       fundament pod przyszły wykres trendu parametru na osi wieku.
   Integracja CZYTA DOM przelicznika (bez modyfikacji jego skryptu):
   #labSubstance, #labValue, #labUnit, #labResultBig, #labResultSection.
   Pacjent: VildaSession.getPatient() (imię/wiek z danych współdzielonych)
   + vildaCurrentPatientId (sessionStorage — wzorzec „Dodaj notatkę do
   wizyty" z custom-fixes.js). Vault lazy przez VildaSession.ensureAuthLoaded.
   =========================================================================== */
(function (global) {
  'use strict';
  var doc = global.document;
  if (!doc) return;

  function $(id) { return doc.getElementById(id); }

  function currentPatientId() {
    if (global._vildaCurrentPatientId) return global._vildaCurrentPatientId;
    try { return (global.sessionStorage && global.sessionStorage.getItem('vildaCurrentPatientId')) || null; }
    catch (_) { return null; }
  }
  function sessionPatient() {
    try {
      var S = global.VildaSession;
      return (S && typeof S.getPatient === 'function') ? S.getPatient() : null;
    } catch (_) { return null; }
  }
  function visitAgeMonths() {
    var p = sessionPatient();
    if (!p) return null;
    var t = 0;
    if (p.age != null && isFinite(p.age)) t += parseInt(p.age, 10) * 12;
    if (p.ageMonths != null && isFinite(p.ageMonths)) t += parseInt(p.ageMonths, 10);
    return t > 0 ? t : null;
  }
  function ageLabel(m) {
    if (!m) return null;
    var y = Math.floor(m / 12);
    var mm = m % 12;
    return y + ' l' + (mm ? ' ' + mm + ' m' : '');
  }

  // Zajętość docka (wzorzec modali Terminarza/Notatek): dock własny albo rodzica.
  function dockOcc() {
    function occOf(w) {
      try {
        var dock = w.document.getElementById('mobileBottomDock');
        if (!dock) return 0;
        var r = dock.getBoundingClientRect();
        var vh = (w.visualViewport && w.visualViewport.height) || w.innerHeight || 0;
        if (!vh || !r || !r.height) return 0;
        var occ = Math.max(0, Math.round(vh - r.top));
        return (occ > 0 && occ < vh) ? occ : 0;
      } catch (e) { return 0; }
    }
    var own = occOf(global);
    if (own) return own;
    try { if (global.parent && global.parent !== global) return occOf(global.parent); } catch (e) { /* noop */ }
    return 0;
  }

  function readConversion() {
    var sub = $('labSubstance');
    var val = $('labValue');
    var unit = $('labUnit');
    var big = $('labResultBig');
    var section = $('labResultSection');
    if (!sub || !val || !unit || !big) return null;
    var subName = String(sub.value || '').trim();
    var rawVal = String(val.value || '').trim();
    var unitFrom = unit.options && unit.selectedIndex >= 0 ? String(unit.options[unit.selectedIndex].textContent || unit.value).trim() : String(unit.value || '').trim();
    var converted = String(big.textContent || '').trim()
      .replace(/([0-9])(?=[A-Za-zµ%])/g, '$1 '); // spacja liczba↔jednostka (spany w DOM sklejają się)
    var empty = section && section.classList.contains('is-empty');
    if (!subName || !rawVal || !converted || empty) return null;
    return { test: subName, raw: rawVal, unitFrom: unitFrom, converted: converted };
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ── „Karta wizyty" pod sekcją wyniku (projekt B, akceptacja 2026-06-12) ────
  // Indygo = kolor kategorii „Wynik badania" w Terminarzu/Historii — panel od
  // razu komunikuje, dokąd trafi wynik. UWAGA: motyw ios26-v2.css spłaszcza
  // przyciski globalnie (`.liquid-ios26 button { background:rgba(255,255,255,.2)
  // !important; color:#111 !important }`) — dlatego przycisk MUSI mieć regułę
  // o wyższej swoistości z !important (ten sam wzorzec co button#labClearBtn).
  var row = null;
  var btn = null;
  var ctxEl = null;
  function ensureStyle() {
    if ($('labPinStyle')) return;
    var st = doc.createElement('style');
    st.id = 'labPinStyle';
    st.textContent = ''
      + '#labPinRow{display:none;background:#EEEDFE;border-left:3px solid #5856D6;border-radius:0 10px 10px 0;padding:10px 12px;margin-top:12px;align-items:center;gap:10px;flex-wrap:wrap;}'
      + '#labPinRow.is-on{display:flex;}'
      + '#labPinInfo{flex:1 1 170px;min-width:0;}'
      + '#labPinCtx{display:block;font-size:0.84rem;font-weight:600;color:#26215C;}'
      + '#labPinSub{display:block;font-size:0.72rem;color:#534AB7;margin-top:2px;}'
      + 'button#labPinResultBtn,.liquid-ios26 button#labPinResultBtn{background:#5856D6 !important;color:#fff !important;border:0 !important;border-radius:10px !important;padding:10px 14px !important;font-size:0.86rem !important;font-weight:600 !important;cursor:pointer !important;font-family:inherit !important;white-space:nowrap !important;line-height:1.2 !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;box-shadow:none !important;}'
      + 'button#labPinResultBtn:hover,.liquid-ios26 button#labPinResultBtn:hover{background:#4a48c9 !important;color:#fff !important;}'
      + '@media (max-width:560px){#labPinRow.is-on{display:block;}#labPinRow button#labPinResultBtn{display:block !important;width:100% !important;margin-top:8px !important;white-space:normal !important;}}';
    doc.head.appendChild(st);
  }
  function ensureRow() {
    if (row) return row;
    var section = $('labResultSection');
    if (!section || !section.parentNode) return null;
    ensureStyle();
    row = doc.createElement('div');
    row.id = 'labPinRow';
    var info = doc.createElement('div');
    info.id = 'labPinInfo';
    ctxEl = doc.createElement('span');
    ctxEl.id = 'labPinCtx';
    var sub = doc.createElement('span');
    sub.id = 'labPinSub';
    sub.textContent = 'wynik trafi do karty pacjenta';
    info.appendChild(ctxEl);
    info.appendChild(sub);
    btn = doc.createElement('button');
    btn.type = 'button';
    btn.id = 'labPinResultBtn';
    btn.textContent = '📌 Przypnij do wizyty';
    row.appendChild(info);
    row.appendChild(btn);
    section.parentNode.insertBefore(row, section.nextSibling);
    btn.addEventListener('click', openSheet);
    return row;
  }

  var _refreshT = null;
  function refresh() {
    clearTimeout(_refreshT);
    _refreshT = setTimeout(function () {
      var r = ensureRow();
      if (!r) return;
      var conv = readConversion();
      var pid = currentPatientId();
      var p = sessionPatient();
      var show = !!(conv && pid && p && p.name);
      r.classList.toggle('is-on', show);
      if (show) {
        var age = ageLabel(visitAgeMonths());
        ctxEl.textContent = p.name + (age ? ' · wizyta: ' + age : '');
      }
    }, 150);
  }

  // ── Mini-arkusz ────────────────────────────────────────────────────────────
  var overlay = null;
  function closeSheet() {
    if (overlay) { overlay.remove(); overlay = null; }
  }
  function openSheet() {
    closeSheet();
    var conv = readConversion();
    var pid = currentPatientId();
    var p = sessionPatient();
    if (!conv || !pid || !p) return;
    // Vault może być lazy — dociągnij w tle już teraz.
    try { if (global.VildaSession && typeof global.VildaSession.ensureAuthLoaded === 'function') global.VildaSession.ensureAuthLoaded(); } catch (_) {}

    var ageM = visitAgeMonths();
    var occ = dockOcc();
    overlay = doc.createElement('div');
    overlay.id = 'labPinOverlay';
    overlay.style.cssText = 'position:fixed;left:0;right:0;top:0;bottom:' + occ + 'px;background:rgba(8,30,35,0.42);z-index:2000020;display:flex;align-items:center;justify-content:center;padding:16px;';
    var sheet = doc.createElement('div');
    sheet.style.cssText = 'background:#fff;border-radius:14px;max-width:420px;width:100%;max-height:100%;overflow-y:auto;padding:16px;box-sizing:border-box;font-family:inherit;';
    sheet.innerHTML = ''
      + '<div style="font-size:1rem;font-weight:600;color:#0f2b33;margin:0 0 12px;">Przypnij wynik · ' + escHtml(p.name) + '</div>'
      + '<div style="background:#EEEDFE;border-left:3px solid #5856D6;border-radius:0 9px 9px 0;padding:9px 12px;margin:0 0 12px;">'
      + '<div style="font-size:0.92rem;font-weight:600;color:#26215C;">' + escHtml(conv.test) + ': ' + escHtml(conv.raw) + ' ' + escHtml(conv.unitFrom) + ' = ' + escHtml(conv.converted) + '</div>'
      + '<div style="font-size:0.74rem;color:#534AB7;margin-top:2px;">kategoria: Wynik badania' + (ageM ? ' · kotwica: wizyta ' + escHtml(ageLabel(ageM)) : ' · bez kotwicy wieku (uzupełnij wiek na stronie głównej)') + '</div>'
      + '</div>'
      + '<div style="margin:0 0 10px;"><label style="display:block;font-size:0.76rem;color:#5b6672;margin-bottom:4px;" for="labPinDate">Data badania</label>'
      + '<input type="date" id="labPinDate" value="' + todayISO() + '" style="width:100%;box-sizing:border-box;border:1px solid #cfe3e6;border-radius:9px;padding:8px 10px;font-size:16px;font-family:inherit;color:#0f2b33;background:#fff;" /></div>'
      + '<div style="margin:0 0 14px;"><label style="display:block;font-size:0.76rem;color:#5b6672;margin-bottom:4px;" for="labPinComment">Komentarz (opcjonalnie)</label>'
      + '<input type="text" id="labPinComment" maxlength="300" placeholder="np. kontrola po zmianie dawki" style="width:100%;box-sizing:border-box;border:1px solid #cfe3e6;border-radius:9px;padding:8px 10px;font-size:16px;font-family:inherit;color:#0f2b33;background:#fff;" /></div>'
      + '<p id="labPinErr" style="display:none;color:#C2271D;font-size:0.78rem;margin:0 0 10px;"></p>'
      + '<div style="display:flex;justify-content:flex-end;gap:8px;">'
      + '<button type="button" id="labPinCancel" style="background:#fff;border:1px solid #d7e9ec;color:#5b6672;border-radius:9px;padding:8px 14px;font-size:0.85rem;cursor:pointer;font-family:inherit;">Anuluj</button>'
      + '<button type="button" id="labPinSave" style="background:#00838d;border:0;color:#fff;border-radius:9px;padding:8px 16px;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:inherit;">Zapisz do karty</button>'
      + '</div>';
    overlay.appendChild(sheet);
    doc.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSheet(); });
    $('labPinCancel').addEventListener('click', closeSheet);
    $('labPinSave').addEventListener('click', function () { saveResult(conv, pid, ageM); });
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function sheetErr(msg) {
    var e = $('labPinErr');
    if (e) { e.textContent = msg; e.style.display = 'block'; }
  }
  function waitForVault(timeoutMs) {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function tick() {
        var V = global.VildaVault;
        if (V && typeof V.savePatientNote === 'function') { resolve(V); return; }
        if (Date.now() - t0 > timeoutMs) { resolve(null); return; }
        setTimeout(tick, 120);
      })();
    });
  }

  async function saveResult(conv, pid, ageM) {
    var saveBtn = $('labPinSave');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Zapisuję…'; }
    try {
      try { if (global.VildaSession && typeof global.VildaSession.ensureAuthLoaded === 'function') global.VildaSession.ensureAuthLoaded(); } catch (_) {}
      var V = await waitForVault(5000);
      if (!V) { sheetErr('Moduł danych nie załadował się — odśwież stronę.'); return; }
      if (typeof V.isUnlocked !== 'function' || !V.isUnlocked()) { sheetErr('Zaloguj się, aby przypiąć wynik do karty pacjenta.'); return; }
      var patient = null;
      try { patient = await V.getPatient(pid); } catch (_) { patient = null; }
      if (!patient) { sheetErr('Nie znalazłem pacjenta w bazie — wczytaj go ponownie z listy „Pacjenci".'); return; }

      var dateEl = $('labPinDate');
      var commentEl = $('labPinComment');
      var dateISO = (dateEl && /^\d{4}-\d{2}-\d{2}$/.test(dateEl.value)) ? dateEl.value : todayISO();
      var comment = commentEl ? String(commentEl.value || '').trim() : '';

      var valueLine = conv.raw + ' ' + conv.unitFrom + ' = ' + conv.converted;
      var payload = {
        patientId: pid,
        title: conv.test + ': ' + conv.raw + ' ' + conv.unitFrom,
        body: '= ' + conv.converted + (comment ? '\n' + comment : ''),
        category: 'wynik-badania',
        // Data badania = zdarzenie kliniczne; ŚWIADOMIE bez dueDateISO —
        // wynik nie jest zadaniem (nie trafia do Terminarza/Przypomnień).
        clinicalDateISO: dateISO,
        labResult: { test: conv.test, value: valueLine }
      };
      if (ageM) payload.linkedAgeMonths = ageM;
      await V.savePatientNote(payload);
      closeSheet();
      try {
        var toast = $('labToast');
        if (toast) {
          toast.textContent = '✓ Przypięto do karty: ' + conv.test + (ageM ? ' (wizyta ' + ageLabel(ageM) + ')' : '');
          toast.classList.add('is-visible');
          setTimeout(function () { toast.classList.remove('is-visible'); }, 2400);
        }
      } catch (_) {}
    } catch (e) {
      sheetErr('Nie udało się zapisać: ' + (e && e.message ? e.message : e));
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Zapisz do karty'; }
    }
  }

  // ── Wyzwalacze odświeżania widoczności ─────────────────────────────────────
  function bind() {
    ['labSubstance', 'labValue', 'labUnit', 'labUnitTarget'].forEach(function (id) {
      var elx = $(id);
      if (elx) { elx.addEventListener('input', refresh); elx.addEventListener('change', refresh); }
    });
    var big = $('labResultBig');
    if (big && typeof global.MutationObserver === 'function') {
      new global.MutationObserver(refresh).observe(big, { childList: true, characterData: true, subtree: true });
    }
    doc.addEventListener('vilda:session-changed', refresh);
    doc.addEventListener('vilda:auth-loaded', refresh);
    doc.addEventListener('vilda:patient-loaded', refresh);
    refresh();
    setTimeout(refresh, 1200);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', bind);
  else bind();
})(window);
