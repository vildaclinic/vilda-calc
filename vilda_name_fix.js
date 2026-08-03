/* vilda_name_fix.js — Korekta rozdzielenia Imię/Nazwisko przy wczytaniu STARYCH rekordów.
 *
 * KONTEKST / PROBLEM
 *   Na głównym formularzu (index.html) widoczne pola to #lastName (Nazwisko) oraz
 *   #firstName (Imię). Kanonem pozostaje UKRYTE #name w konwencji „Nazwisko Imię”.
 *   Inline skrypt P-SPLIT (w index.html) przy ZEWNĘTRZNYM ustawieniu #name rozdziela
 *   je „nazwisko-najpierw” (pierwszy wyraz = nazwisko). Stare rekordy zapisane jako
 *   pojedyncze pole, ale w kolejności „Imię Nazwisko” (np. „Szymon Surdyk”), wczytują
 *   się wtedy ODWROTNIE: Nazwisko=„Szymon”, Imię=„Surdyk” (zamiana).
 *
 * ROZWIĄZANIE (hook na zdarzeniu 'vilda:patient-loaded')
 *   1. Rekord ma JAWNE części (payload.user.firstName lub payload.user.lastName) →
 *      ustaw #lastName/#firstName WPROST z tych wartości (nigdy nie dziel #name),
 *      a #name = „<Nazwisko> <Imię>” (kanon). Bez pytania, bez zapisu.
 *   2. Brak jawnych części, a nazwa ma ≥2 tokeny (dwuznaczne) → pokaż PROMPT korekty,
 *      w którym użytkownik wskazuje, który token jest nazwiskiem. Stan przejściowy do
 *      czasu wyboru: całość w #lastName, #firstName puste.
 *   3. Pojedynczy token → #lastName = nazwa, #firstName = '' (bez pytania).
 *
 * DLACZEGO payload.user.*, A NIE header.firstName/lastName?
 *   Sejf (funkcja budująca nagłówek w vilda_vault.js) działa tak: jeśli
 *   payload.user.firstName/lastName są PUSTE, to DZIELI payload.name „nazwisko-najpierw”
 *   i wynik wpisuje do header.firstName/header.lastName. Zatem samo header.* NIE odróżnia
 *   „części podanych jawnie” od „części zgadniętych przez podział”. Jedynym wiarygodnym
 *   sygnałem jest obecność payload.user.firstName/lastName. Zgadza się to z danymi
 *   produkcyjnymi (stare, jednopolowe rekordy nie mają payload.user.firstName/lastName),
 *   a jednocześnie jest odtwarzalne w teście (patrz tests/e2e/name-fix.spec.mjs).
 *
 * UTRWALENIE (bez naruszania historii)
 *   Preferowana ścieżka: updateSnapshotPayload(patientId, snapshotId, corrected,
 *   {preserveSavedAt:true}) — aktualizuje NAJNOWSZY snapshot W MIEJSCU (bez nowego
 *   snapshotu, z zachowaniem savedAtISO i snapshotCount). corrected budujemy jako
 *   {...payload, name:'Nazwisko Imię', user:{...payload.user, firstName, lastName}},
 *   dzięki czemu sejf zbuduje nagłówek z JAWNYMI częściami i rekord nie zapyta ponownie.
 *   Ścieżka zapasowa (gdyby updateSnapshotPayload nie było): savePatient(corrected,
 *   {patientId, dedup:false}) — także nada nagłówkowi jawne części (kosztem nowego
 *   snapshotu). Wszystkie wywołania sejfu są w try/catch; przy błędzie korekta działa
 *   tylko w tej sesji, a błąd trafia do console.warn. Handler NIGDY nie rzuca wyjątku.
 *
 * BEZPIECZNIKI
 *   - Skrypt jest „no-op” na stronach bez kompletu pól #lastName, #firstName, #name.
 *   - Zabezpieczenie pętli: rozstrzygnięci pacjenci (Map `resolved`) nie są pytani
 *     ponownie; ustawiamy stan PRZED zapisem, więc ewentualne wtórne zdarzenia nie
 *     powodują rekurencji. Zapis (updateSnapshotPayload) emituje tylko wewnętrzne
 *     powiadomienia sejfu, nie DOM-owe 'vilda:patient-loaded'.
 *   - Nie zmieniamy matematyki silnika ani innych funkcji.
 */
(function (w) {
  'use strict';

  // --- Twardy bezpiecznik: działamy tylko na stronie z KOMPLETEM pól tożsamości. -----
  var doc = w && w.document;
  if (!doc || typeof doc.getElementById !== 'function') return;

  function byId(id) { try { return doc.getElementById(id); } catch (_) { return null; } }

  var nameEl = byId('name');
  var lastNameEl = byId('lastName');
  var firstNameEl = byId('firstName');
  if (!nameEl || !lastNameEl || !firstNameEl) return; // brak formularza → nic nie robimy

  // Nie inicjalizuj dwa razy (np. przy podwójnym dołączeniu skryptu).
  if (w.VildaNameFix && w.VildaNameFix.__init) return;

  // --- Stan sesyjny ------------------------------------------------------------------
  // resolved: pacjenci z DOKONANYM w tej sesji wyborem (pick/„zostaw”) → {ln, fn}.
  //           Utrzymuje poprawne pola przy każdym ponownym wczytaniu i blokuje ponowne pytanie.
  var resolved = new Map();
  // currentPromptId: id pacjenta, dla którego prompt jest AKTUALNIE otwarty (albo null).
  var currentPromptId = null;

  // --- Drobne narzędzia --------------------------------------------------------------
  function str(x) { return x == null ? '' : String(x); }
  function norm(x) { return str(x).replace(/\s+/g, ' ').trim(); }
  function tokens(nameStr) { var n = norm(nameStr); return n ? n.split(' ') : []; }
  function warn(msg) { try { if (w.console && w.console.warn) w.console.warn('[vilda_name_fix] ' + msg); } catch (_) {} }
  function getVault() { return w.VildaVault || null; }

  // --- Ustawianie pól bez psucia przez P-SPLIT ---------------------------------------
  // Kolejność ma znaczenie: najpierw #name (kanon) — hook P-SPLIT może je błędnie
  // rozdzielić — a POTEM nadpisujemy #lastName/#firstName WPROST. Przypisanie do .value
  // nie emituje zdarzenia 'input', więc nie uruchamia ponownej synchronizacji P-SPLIT.
  // Stan końcowy jest poprawny niezależnie od liczby tokenów w nazwisku/imieniu
  // (np. nazwiska wieloczłonowe nie zostaną obcięte). Świadomie NIE emitujemy 'input'
  // na #name — odpowiada to zwykłej ścieżce „zewnętrznego” wczytania rekordu.
  function applyFields(ln, fn) {
    var l = norm(ln);
    var f = norm(fn);
    var canonical = [l, f].filter(Boolean).join(' ');
    try { nameEl.value = canonical; } catch (_) {}
    try { lastNameEl.value = l; } catch (_) {}
    try { firstNameEl.value = f; } catch (_) {}
  }

  // Stan przejściowy (prompt otwarty): całość w Nazwisko, Imię puste.
  function applyInterim(nameStr) {
    var whole = norm(nameStr);
    try { nameEl.value = whole; } catch (_) {}
    try { lastNameEl.value = whole; } catch (_) {}
    try { firstNameEl.value = ''; } catch (_) {}
  }

  // --- Statyczne ikony SVG (bez danych pacjenta → bezpieczne innerHTML) --------------
  var ICON_INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

  // --- Wstrzyknięcie stylów (paleta jak w makiecie: akcent #00838d) -------------------
  function injectStyle() {
    if (byId('vnf-style')) return;
    var css =
      '.vnf-fix{margin:6px 0 0;border:1px solid #cfe0e3;border-top:3px solid #00838d;' +
      'border-radius:14px;background:linear-gradient(180deg,#eef8f8,#fff 60%);' +
      'box-shadow:0 18px 44px rgba(13,60,65,.16);padding:16px 16px 14px;animation:vnfPop .22s ease}' +
      '@keyframes vnfPop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}' +
      '.vnf-kicker{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;' +
      'letter-spacing:.04em;text-transform:uppercase;color:#00838d;margin-bottom:6px}' +
      '.vnf-kicker svg{width:15px;height:15px;flex:0 0 auto}' +
      '.vnf-title{font-size:15.5px;font-weight:700;color:#14393d;margin:0 0 4px}' +
      '.vnf-sub{font-size:13px;color:#5a7274;margin:0 0 13px;line-height:1.45}' +
      '.vnf-sub b{color:#333}' +
      '.vnf-choices{display:flex;flex-direction:column;gap:9px}' +
      '.vnf-choice{display:flex;align-items:center;gap:12px;width:100%;text-align:left;cursor:pointer;' +
      'background:#fff;border:1.5px solid #d9e6e7;border-radius:11px;padding:11px 13px;font:inherit;color:#333;' +
      'transition:border-color .12s,background .12s,box-shadow .12s}' +
      '.vnf-choice:hover{border-color:#00838d;background:#f5f9f9;box-shadow:0 4px 12px rgba(0,131,141,.10)}' +
      '.vnf-pills{display:flex;gap:8px;flex-wrap:wrap}' +
      '.vnf-pill{font-size:13px;padding:3px 9px;border-radius:999px;font-weight:600;white-space:nowrap}' +
      '.vnf-pill--ln{background:#dff1f1;color:#0a5b62}' +
      '.vnf-pill--fn{background:#eef0f2;color:#5a6b6d}' +
      '.vnf-pill .vnf-lab{font-weight:400;opacity:.7;margin-right:4px;font-size:11px;text-transform:uppercase;letter-spacing:.03em}' +
      '.vnf-go{margin-left:auto;color:#9fb3b5;font-size:18px;line-height:1}' +
      '.vnf-leave{display:inline-block;margin-top:11px;background:none;border:0;color:#5a7274;' +
      'font:inherit;font-size:12.5px;cursor:pointer;text-decoration:underline;padding:2px 0}' +
      '.vnf-leave:hover{color:#00838d}' +
      '.vnf-done{margin:6px 0 0;border:1px solid #bfe3d8;border-left:3px solid #12996f;border-radius:12px;' +
      'background:#f1fbf6;padding:12px 14px;font-size:13.5px;color:#0d6b4c;display:flex;gap:9px;' +
      'align-items:flex-start;animation:vnfPop .22s ease}' +
      '.vnf-done svg{width:16px;height:16px;flex:0 0 auto;margin-top:1px}' +
      '.vnf-done b{color:#0a5a40}' +
      '.vnf-done--warn{border-color:#e6d3a3;border-left-color:#b7791f;background:#fdf7ea;color:#8a5a12}' +
      '.vnf-done--warn b{color:#8a5a12}' +
      '.vnf-fix[hidden],.vnf-done[hidden]{display:none!important}';
    var style = doc.createElement('style');
    style.id = 'vnf-style';
    style.textContent = css;
    (doc.head || doc.documentElement).appendChild(style);
  }

  // --- Budowa UI (raz) ---------------------------------------------------------------
  function makeChoiceButton(index) {
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'vnf-choice';
    btn.id = 'vnfChoice' + index;

    var pills = doc.createElement('span');
    pills.className = 'vnf-pills';

    var pillLn = doc.createElement('span');
    pillLn.className = 'vnf-pill vnf-pill--ln';
    var pillLnLab = doc.createElement('span');
    pillLnLab.className = 'vnf-lab';
    pillLnLab.textContent = 'Nazwisko';
    var pillLnVal = doc.createElement('span');
    pillLnVal.className = 'vnf-val';
    pillLn.appendChild(pillLnLab);
    pillLn.appendChild(pillLnVal);

    var pillFn = doc.createElement('span');
    pillFn.className = 'vnf-pill vnf-pill--fn';
    var pillFnLab = doc.createElement('span');
    pillFnLab.className = 'vnf-lab';
    pillFnLab.textContent = 'Imię';
    var pillFnVal = doc.createElement('span');
    pillFnVal.className = 'vnf-val';
    pillFn.appendChild(pillFnLab);
    pillFn.appendChild(pillFnVal);

    pills.appendChild(pillLn);
    pills.appendChild(pillFn);

    var go = doc.createElement('span');
    go.className = 'vnf-go';
    go.setAttribute('aria-hidden', 'true');
    go.textContent = '→'; // →

    btn.appendChild(pills);
    btn.appendChild(go);

    // referencje do pól wartości (aktualizowane w showPrompt)
    btn._vnfLnVal = pillLnVal;
    btn._vnfFnVal = pillFnVal;
    return btn;
  }

  function buildUi() {
    injectStyle();

    var fix = doc.createElement('div');
    fix.className = 'vnf-fix';
    fix.id = 'vnfFix';
    fix.hidden = true;
    fix.setAttribute('role', 'group');
    fix.setAttribute('aria-label', 'Rozdziel imię i nazwisko');

    var kicker = doc.createElement('div');
    kicker.className = 'vnf-kicker';
    kicker.innerHTML = ICON_INFO;
    var kickerText = doc.createElement('span');
    kickerText.textContent = 'Rozdziel imię i nazwisko';
    kicker.appendChild(kickerText);

    var title = doc.createElement('div');
    title.className = 'vnf-title';
    title.textContent = 'Ten pacjent był zapisany jako jedno pole';

    var sub = doc.createElement('p');
    sub.className = 'vnf-sub';

    var choices = doc.createElement('div');
    choices.className = 'vnf-choices';
    var choice0 = makeChoiceButton(0);
    var choice1 = makeChoiceButton(1);
    choices.appendChild(choice0);
    choices.appendChild(choice1);

    var leave = doc.createElement('button');
    leave.type = 'button';
    leave.className = 'vnf-leave';
    leave.id = 'vnfLeave';
    leave.textContent = 'Zostaw całość w polu Nazwisko';

    fix.appendChild(kicker);
    fix.appendChild(title);
    fix.appendChild(sub);
    fix.appendChild(choices);
    fix.appendChild(leave);

    var done = doc.createElement('div');
    done.className = 'vnf-done';
    done.id = 'vnfDone';
    done.hidden = true;
    done.innerHTML = ICON_CHECK;
    var doneText = doc.createElement('span');
    doneText.id = 'vnfDoneText';
    done.appendChild(doneText);

    // Wstaw tuż po ukrytym #name (pod polami tożsamości). Po dwóch wstawieniach
    // „afterend” kolejność w DOM to: #name → #vnfFix → #vnfDone.
    try {
      nameEl.insertAdjacentElement('afterend', done);
      nameEl.insertAdjacentElement('afterend', fix);
    } catch (_) {
      var parent = firstNameEl.parentNode || lastNameEl.parentNode || nameEl.parentNode;
      if (parent) { parent.appendChild(fix); parent.appendChild(done); }
    }

    return { fix: fix, sub: sub, choice0: choice0, choice1: choice1, leave: leave, done: done, doneText: doneText };
  }

  var els = buildUi();

  // --- Pomocnicze budowanie treści (textContent → bezpieczne dla danych pacjenta) -----
  function appendStrong(parent, text) {
    var b = doc.createElement('b');
    b.textContent = text;
    parent.appendChild(b);
  }

  function setSubText(nameStr) {
    var sub = els.sub;
    while (sub.firstChild) sub.removeChild(sub.firstChild);
    sub.appendChild(doc.createTextNode('Rekord ma tylko wspólną nazwę: '));
    var b = doc.createElement('b');
    b.textContent = '„' + norm(nameStr) + '”'; // „nazwa”
    sub.appendChild(b);
    sub.appendChild(doc.createTextNode('. Wskaż, które słowo jest nazwiskiem — zapiszę to na stałe, więc pytanie pojawi się tylko raz.'));
  }

  function fillChoice(btn, opt) {
    btn._vnfLnVal.textContent = opt.ln;
    btn._vnfFnVal.textContent = opt.fn;
    btn.setAttribute('data-vnf-ln', opt.ln);
    btn.setAttribute('data-vnf-fn', opt.fn);
  }

  function hidePrompt() { if (els.fix) els.fix.hidden = true; currentPromptId = null; }
  function hideDone() { if (els.done) els.done.hidden = true; }

  function showDone(kind, ln, fn) {
    var t = els.doneText;
    while (t.firstChild) t.removeChild(t.firstChild);
    if (kind === 'success') {
      appendStrong(t, 'Zapisano.');
      t.appendChild(doc.createTextNode(' Nazwisko: '));
      appendStrong(t, norm(ln));
      t.appendChild(doc.createTextNode(', Imię: '));
      appendStrong(t, norm(fn));
      t.appendChild(doc.createTextNode('. Rekord pacjenta poprawiony — następnym razem wczyta się bez pytania.'));
      els.done.className = 'vnf-done';
    } else if (kind === 'session') {
      appendStrong(t, 'Poprawiono w tej sesji.');
      t.appendChild(doc.createTextNode(' Nie udało się zapisać na stałe — przy kolejnym wczytaniu pytanie może pojawić się ponownie.'));
      els.done.className = 'vnf-done vnf-done--warn';
    } else { // 'leave'
      t.appendChild(doc.createTextNode('Zostawiono całość w polu Nazwisko. Możesz rozdzielić ręcznie w każdej chwili.'));
      els.done.className = 'vnf-done';
    }
    els.done.hidden = false;
  }

  // --- Wybór interpretacji / „zostaw całość” ------------------------------------------
  function onPick(patientId, nameStr, ln, fn) {
    applyFields(ln, fn);
    // Zapamiętaj wybór sesyjnie PRZED zapisem — ewentualne wtórne zdarzenia nie zapytają ponownie.
    if (patientId) resolved.set(patientId, { ln: norm(ln), fn: norm(fn) });
    currentPromptId = null;
    els.fix.hidden = true;
    showDone('success', ln, fn);
    // Utrwalenie w tle; przy niepowodzeniu zmień komunikat na „tylko sesja”.
    persistCorrection(patientId, ln, fn).then(function (ok) {
      if (!ok) showDone('session', ln, fn);
    });
  }

  function onLeave(patientId, nameStr) {
    var whole = norm(nameStr);
    applyFields(whole, ''); // całość → Nazwisko, Imię puste, #name = whole (kanon)
    if (patientId) resolved.set(patientId, { ln: whole, fn: '' });
    currentPromptId = null;
    els.fix.hidden = true;
    showDone('leave', whole, '');
    // Świadomie BEZ zapisu (zgodnie ze specyfikacją).
  }

  function showPrompt(patientId, nameStr, toks) {
    // Jednolita reguła dla 2 i 3+ tokenów:
    //   opcja 0: Nazwisko = OSTATNI token, Imię = reszta (przód)  → poprawna dla „Imię Nazwisko”
    //   opcja 1: Nazwisko = PIERWSZY token, Imię = reszta (tył)
    var opt0 = { ln: toks[toks.length - 1], fn: toks.slice(0, toks.length - 1).join(' ') };
    var opt1 = { ln: toks[0], fn: toks.slice(1).join(' ') };

    setSubText(nameStr);
    fillChoice(els.choice0, opt0);
    fillChoice(els.choice1, opt1);

    els.choice0.onclick = function () { onPick(patientId, nameStr, opt0.ln, opt0.fn); };
    els.choice1.onclick = function () { onPick(patientId, nameStr, opt1.ln, opt1.fn); };
    els.leave.onclick = function () { onLeave(patientId, nameStr); };

    currentPromptId = patientId || '__anon__';
    els.done.hidden = true;
    els.fix.hidden = false;
  }

  // --- Odczyt rekordu z sejfu --------------------------------------------------------
  async function loadRecord(patientId) {
    var V = getVault();
    if (!V || typeof V.getPatient !== 'function' || !patientId) return null;
    try {
      if (typeof V.isUnlocked === 'function' && !V.isUnlocked()) return null;
      var rec = await V.getPatient(patientId);
      if (!rec) return null;
      var snaps = rec.snapshots || [];
      var snap = snaps.length ? snaps[0] : null;
      return {
        header: rec.header || null,
        snapshot: snap,
        payload: (snap && snap.payload) ? snap.payload : null
      };
    } catch (e) {
      warn('getPatient nie powiodło się: ' + (e && e.message ? e.message : e));
      return null;
    }
  }

  // --- Utrwalenie korekty ------------------------------------------------------------
  async function persistCorrection(patientId, ln, fn) {
    var V = getVault();
    if (!patientId || !V) { warn('brak patientId/sejfu — korekta tylko w tej sesji'); return false; }
    try {
      if (typeof V.isUnlocked === 'function' && !V.isUnlocked()) {
        warn('sejf zablokowany — korekta tylko w tej sesji');
        return false;
      }
      var rec = await V.getPatient(patientId);
      var snaps = (rec && rec.snapshots) ? rec.snapshots : [];
      var snap = snaps.length ? snaps[0] : null;
      var payload = (snap && snap.payload) ? snap.payload : null;
      if (!payload || typeof payload !== 'object') { warn('brak payloadu do utrwalenia'); return false; }

      var baseUser = (payload.user && typeof payload.user === 'object') ? payload.user : {};
      var corrected = Object.assign({}, payload, {
        name: [norm(ln), norm(fn)].filter(Boolean).join(' '), // kanon „Nazwisko Imię”
        user: Object.assign({}, baseUser, { firstName: norm(fn), lastName: norm(ln) })
      });

      if (typeof V.updateSnapshotPayload === 'function' && snap && snap.snapshotId) {
        // Ścieżka właściwa: aktualizacja NAJNOWSZEGO snapshotu W MIEJSCU.
        // preserveSavedAt:true → zachowane savedAtISO i lastSavedAtISO, bez nowego snapshotu.
        await V.updateSnapshotPayload(patientId, snap.snapshotId, corrected, { preserveSavedAt: true });
        return true;
      }
      if (typeof V.savePatient === 'function') {
        // Ścieżka zapasowa: tworzy nowy snapshot, ale nagłówek również dostanie jawne części.
        await V.savePatient(corrected, { patientId: patientId, dedup: false });
        return true;
      }
      warn('brak API zapisu (updateSnapshotPayload/savePatient)');
      return false;
    } catch (e) {
      warn('nie udało się utrwalić korekty (sesja zachowana): ' + (e && e.message ? e.message : e));
      return false;
    }
  }

  // --- Główny handler zdarzenia ------------------------------------------------------
  async function handlePatientLoaded(ev) {
    var detail = (ev && ev.detail) || {};
    var patientId = (typeof detail.patientId === 'string')
      ? detail.patientId
      : (detail.patientId != null ? String(detail.patientId) : '');

    // Pacjent już rozstrzygnięty w tej sesji → odtwórz wybór, nie pytaj ponownie.
    if (patientId && resolved.has(patientId)) {
      hidePrompt();
      hideDone();
      var r = resolved.get(patientId);
      applyFields(r.ln, r.fn);
      return;
    }
    // Prompt już otwarty dla tego samego pacjenta → nic nie rób (bez podwójnego pytania/rekurencji).
    if (patientId && currentPromptId === patientId) return;

    var rec = await loadRecord(patientId);

    // Zamknij ewentualny prompt/potwierdzenie z poprzedniego pacjenta.
    hidePrompt();
    hideDone();

    // Bez rekordu (sejf zablokowany/błąd) — nie ruszamy pól (unikamy błędnej korekty).
    if (!rec) { warn('brak rekordu dla patientId=' + (patientId || '(brak)') + ' — pomijam'); return; }

    var payload = rec.payload || {};
    var pu = (payload.user && typeof payload.user === 'object') ? payload.user : {};
    var explicitFn = (typeof pu.firstName === 'string') ? pu.firstName.trim() : '';
    var explicitLn = (typeof pu.lastName === 'string') ? pu.lastName.trim() : '';
    var hasExplicit = !!(explicitFn || explicitLn);

    // Nazwa do analizy: payload.name → header.name → aktualne #name (kolejność zaufania).
    var nameStr = norm(payload.name) || norm(rec.header && rec.header.name) || norm(nameEl.value);

    // (1) JAWNE części → ustaw wprost, bez pytania i bez zapisu.
    if (hasExplicit) {
      applyFields(explicitLn, explicitFn);
      return;
    }

    var toks = tokens(nameStr);

    // (2) ≥2 tokeny → pytanie o rozdzielenie (stan przejściowy: całość w Nazwisko).
    if (toks.length >= 2) {
      applyInterim(nameStr);
      showPrompt(patientId, nameStr, toks);
      return;
    }

    // (3) 1 token → całość do Nazwisko, Imię puste (bez pytania).
    if (toks.length === 1) {
      applyFields(toks[0], '');
      return;
    }

    // 0 tokenów → brak nazwy, nic nie robimy.
  }

  // Handler NIGDY nie rzuca; asynchroniczne odrzucenia też wyłapujemy.
  doc.addEventListener('vilda:patient-loaded', function (ev) {
    try {
      var p = handlePatientLoaded(ev);
      if (p && typeof p.catch === 'function') {
        p.catch(function (e) { warn('handler (async) błąd: ' + (e && e.message ? e.message : e)); });
      }
    } catch (e) {
      warn('handler (sync) błąd: ' + (e && e.message ? e.message : e));
    }
  });

  // Publiczny znacznik gotowości (dla testów/diagnostyki; nie zmienia zachowania aplikacji).
  w.VildaNameFix = {
    __init: true,
    version: '1',
    resolvedCount: function () { return resolved.size; }
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
