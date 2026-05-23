/* ==========================================================================
 * VildaEpicrisisUI — wizard ankiety i generator epikryzy medycznej
 *
 * EU-1: pomocniki DOM i styl.
 * EU-2: składanie patientData z advancedGrowthData + pól formularza.
 * EU-3: cykl życia modalu (otwórz / zamknij / krok / wynik).
 * EU-4: renderery kroków 1–5 ankiety.
 * EU-5: wstrzyknięcie przycisku do #advReportActions.
 * EU-6: publiczne API { show, inject }.
 *
 * Wymaga: vilda_epicrisis.js (VildaEpicrisis), vilda_pro_access.js (VildaProAccess).
 * ========================================================================== */
(function (global) {
  'use strict';

  if (global.VildaEpicrisisUI && global.VildaEpicrisisUI.__vildaEpicrisisUI) return;

  var TOTAL_STEPS = 5;
  var OVERLAY_ID  = 'vilda-epicrisis-overlay';
  var BTN_ID      = 'advEpicrisisBtn';

  /* ── EU-1: POMOCNIKI ──────────────────────────────────────────────────── */

  var P = '--primary:#00838d';
  var clr = {
    primary:   '#00838d',
    secondary: '#00b0a6',
    text:      '#1a1a1a',
    muted:     '#6b7280',
    border:    '#d0dede',
    card:      '#f5f9f9',
    danger:    '#c62828',
    warn:      '#fffbea',
  };
  var gradient = 'linear-gradient(135deg,' + clr.primary + ',' + clr.secondary + ')';

  function el(tag, css, attrs, text) {
    var node = document.createElement(tag);
    if (css)  node.style.cssText = css;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function append(parent) {
    var children = Array.prototype.slice.call(arguments, 1);
    children.forEach(function (c) { if (c) parent.appendChild(c); });
    return parent;
  }

  /** Sekcja z tytułem wewnątrz kroku. */
  function section(title) {
    var wrap = el('div', 'margin:0 0 20px;');
    var h = el('p', 'font-weight:700;color:' + clr.primary + ';font-size:0.92rem;margin:0 0 10px;letter-spacing:0.01em;', null, title);
    append(wrap, h);
    return wrap;
  }

  /** Wiersz radio + label. */
  function radioRow(name, value, label, checked) {
    var id = 'epi-' + name + '-' + value;
    var row = el('label', 'display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 8px;border-radius:6px;font-size:0.9rem;color:' + clr.text + ';', {'for': id});
    var inp = el('input', 'flex-shrink:0;accent-color:' + clr.primary + ';width:16px;height:16px;', {'type': 'radio', 'name': name, 'value': value, 'id': id});
    if (checked) inp.checked = true;
    append(row, inp, document.createTextNode(label));
    return row;
  }

  /** Wiersz checkbox. */
  function checkRow(id, label, checked) {
    var row = el('label', 'display:flex;align-items:center;gap:8px;cursor:pointer;padding:5px 8px;border-radius:6px;font-size:0.9rem;color:' + clr.text + ';', {'for': id});
    var inp = el('input', 'flex-shrink:0;accent-color:' + clr.primary + ';width:16px;height:16px;', {'type': 'checkbox', 'id': id});
    if (checked) inp.checked = true;
    append(row, inp, document.createTextNode(label));
    return row;
  }

  /** Pole input z labelem. */
  function inputField(id, label, type, attrs, hint) {
    var wrap = el('div', 'margin-bottom:12px;');
    var lbl  = el('label', 'display:block;font-size:0.85rem;color:' + clr.muted + ';margin-bottom:3px;', {'for': id}, label);
    var inputAttrs = Object.assign({'type': type || 'text', 'id': id, 'autocomplete': 'off'}, attrs || {});
    var inp  = el('input', 'width:100%;padding:8px 10px;border:1px solid ' + clr.border + ';border-radius:6px;font-size:0.9rem;box-sizing:border-box;outline:none;', inputAttrs);
    inp.addEventListener('focus', function () { inp.style.borderColor = clr.primary; inp.style.boxShadow = '0 0 0 2px rgba(0,131,141,0.12)'; });
    inp.addEventListener('blur',  function () { inp.style.borderColor = clr.border;  inp.style.boxShadow = ''; });
    append(wrap, lbl, inp);
    if (hint) {
      var h = el('p', 'font-size:0.78rem;color:' + clr.muted + ';margin:3px 0 0;', null, hint);
      append(wrap, h);
    }
    return wrap;
  }

  /** Select z labelem. */
  function selectField(id, label, options) {
    var wrap = el('div', 'margin-bottom:12px;');
    var lbl  = el('label', 'display:block;font-size:0.85rem;color:' + clr.muted + ';margin-bottom:3px;', {'for': id}, label);
    var sel  = el('select', 'width:100%;padding:8px 10px;border:1px solid ' + clr.border + ';border-radius:6px;font-size:0.9rem;box-sizing:border-box;outline:none;background:#fff;', {'id': id});
    options.forEach(function (o) {
      var opt = el('option', null, {'value': o.value}, o.label);
      sel.appendChild(opt);
    });
    sel.addEventListener('focus', function () { sel.style.borderColor = clr.primary; });
    sel.addEventListener('blur',  function () { sel.style.borderColor = clr.border; });
    append(wrap, lbl, sel);
    return wrap;
  }

  /** Pozioma linia podziału. */
  function hr() {
    return el('hr', 'border:none;border-top:1px solid ' + clr.border + ';margin:16px 0;');
  }

  /** Odczytaj wartość radio group. */
  function radioVal(name) {
    var el = document.querySelector('#' + OVERLAY_ID + ' input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }

  /** Odczytaj wartość pola po id. */
  function fieldVal(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  /** Odczytaj float po id, null jeśli puste/NaN. */
  function fieldNum(id) {
    var v = parseFloat(fieldVal(id));
    return isFinite(v) ? v : null;
  }

  /** Zaznaczone checkboxy w grupie. */
  function checkedVals(cls) {
    var nodes = document.querySelectorAll('#' + OVERLAY_ID + ' input.' + cls + ':checked');
    return Array.prototype.map.call(nodes, function (n) { return n.value; });
  }

  /* ── EU-2: SKŁADANIE PATIENTDATA ──────────────────────────────────────── */

  function numDom(id) {
    var el = document.getElementById(id);
    var v = parseFloat(el && el.value);
    return isFinite(v) ? v : NaN;
  }

  function assemblePatientData() {
    var adv = global.advancedGrowthData || {};

    /* Wiek */
    var ageM = isFinite(adv.currentAgeMonths) ? adv.currentAgeMonths
             : (numDom('age') * 12 + (isFinite(numDom('ageMonths')) ? numDom('ageMonths') : 0));
    var ageYears    = Math.floor(ageM / 12);
    var ageMonths   = Math.round(ageM % 12);

    /* Płeć */
    var sex = adv.sex || (function () { var e = document.getElementById('sex'); return e ? e.value : 'M'; }()) || 'M';

    /* Wzrost, masa */
    var height = isFinite(adv.currentHeight) ? adv.currentHeight : numDom('height');
    var weight = isFinite(adv.currentWeight) ? adv.currentWeight : numDom('weight');

    /* Wzrost rodziców + MPH */
    var motherHeight = isFinite(numDom('advMotherHeight')) ? numDom('advMotherHeight') : null;
    var fatherHeight = isFinite(numDom('advFatherHeight')) ? numDom('advFatherHeight') : null;
    var mph       = (adv.targetHeight != null && isFinite(adv.targetHeight)) ? adv.targetHeight : null;
    var mphSds    = (adv.targetStats && isFinite(adv.targetStats.sd))       ? adv.targetStats.sd        : null;
    var mphPerc   = (adv.targetStats && isFinite(adv.targetStats.percentile)) ? adv.targetStats.percentile : null;

    /* SDS i centyl wzrostu (wywołanie globalnej calcPercentileStats) */
    var heightSds = null, heightPercentile = null;
    if (isFinite(height) && isFinite(ageM) && typeof global.calcPercentileStats === 'function') {
      var statsH = global.calcPercentileStats(height, sex, ageM / 12, 'HT');
      if (statsH) { heightSds = statsH.sd; heightPercentile = statsH.percentile; }
    }

    /* hSDS − mpSDS */
    var hSdsMpSds = (heightSds != null && mphSds != null) ? (heightSds - mphSds) : null;

    /* Niedobór do 3. centyla (binary search) */
    var heightDeficitTo3rd = null;
    if (heightPercentile != null && heightPercentile < 3 && isFinite(height) &&
        typeof global.calcPercentileStats === 'function') {
      var lo = height, hi = height + 35;
      for (var i = 0; i < 24; i++) {
        var mid = (lo + hi) / 2;
        var sm  = global.calcPercentileStats(mid, sex, ageM / 12, 'HT');
        if (!sm) break;
        if (sm.percentile < 3) lo = mid; else hi = mid;
      }
      var deficit = Math.round(((lo + hi) / 2 - height) * 10) / 10;
      if (deficit > 0.1) heightDeficitTo3rd = deficit;
    }

    /* BMI i centyl BMI */
    var bmi = null, bmiPerc = null;
    if (isFinite(height) && height > 0 && isFinite(weight)) {
      bmi = weight / Math.pow(height / 100, 2);
      bmi = Math.round(bmi * 10) / 10;
      if (typeof global.calcPercentileStats === 'function') {
        var statsB = global.calcPercentileStats(bmi, sex, ageM / 12, 'BMI');
        if (statsB) bmiPerc = statsB.percentile;
      }
    }

    /* Wiek kostny */
    var boneAge      = (adv.boneAgeMonths != null && isFinite(adv.boneAgeMonths)) ? adv.boneAgeMonths / 12 : null;
    var boneAgeDelay = (boneAge != null && isFinite(ageM))                        ? (ageM / 12 - boneAge) : null;

    /* Tempo wzrastania */
    var gv     = isFinite(adv.growthVelocity) ? adv.growthVelocity : null;
    var gvM    = isFinite(adv.growthVelocityGapM) ? adv.growthVelocityGapM : null;
    var gvLow  = null;
    if (gv != null && ageYears >= 4 && ageYears <= 12) {
      /* <4,5 cm/rok szacowany próg poniżej normy */
      gvLow = gv < 4.5;
    }

    /* Prognozy */
    var bp  = adv.bayleyPinneau || null;
    var rwt = adv.rwt           || null;
    var predictions = null;
    if ((bp  && isFinite(bp.predictedAdultHeightCm)) ||
        (rwt && isFinite(rwt.predictedAdultHeightCm))) {
      predictions = {};
      if (bp  && isFinite(bp.predictedAdultHeightCm))
        predictions.bp  = { value: bp.predictedAdultHeightCm,  error: isFinite(bp.errorSdCm)  ? bp.errorSdCm  : null };
      if (rwt && isFinite(rwt.predictedAdultHeightCm))
        predictions.rwt = { value: rwt.predictedAdultHeightCm, error: isFinite(rwt.errorSdCm) ? rwt.errorSdCm : null };
    }

    return {
      ageYears:            ageYears,
      ageMonths:           ageMonths,
      sex:                 sex,
      height:              isFinite(height)  ? height  : null,
      heightSds:           heightSds,
      heightPercentile:    heightPercentile,
      heightDeficitTo3rd:  heightDeficitTo3rd,
      weight:              isFinite(weight)  ? weight  : null,
      bmi:                 bmi,
      bmiPercentile:       bmiPerc,
      motherHeight:        motherHeight,
      fatherHeight:        fatherHeight,
      mph:                 mph,
      mphSds:              mphSds,
      mphPercentile:       mphPerc,
      hSdsMpSds:           hSdsMpSds,
      boneAge:             boneAge,
      boneAgeDelay:        boneAgeDelay,
      growthVelocity:      gv,
      growthVelocityMonths: gvM,
      growthVelocityLow:   gvLow,
      testicularVolume:    adv.testicularVolume || null,
      predictions:         predictions,
    };
  }

  /* ── EU-3: CYKL ŻYCIA MODALU ──────────────────────────────────────────── */

  var state = { step: 1, pd: null, answers: {}, result: null, profile: 'growth' };

  function openModal() {
    if (document.getElementById(OVERLAY_ID)) return;
    state.step    = 1;
    state.answers = {};
    state.result  = null;
    state.profile = 'growth';
    state.pd      = assemblePatientData();

    /* Overlay */
    var overlay = el('div',
      'position:fixed;inset:0;background:rgba(0,0,0,0.54);z-index:10050;display:flex;' +
      'align-items:center;justify-content:center;padding:12px;box-sizing:border-box;',
      {'id': OVERLAY_ID, 'role': 'dialog', 'aria-modal': 'true', 'aria-label': 'Generator epikryzy'}
    );

    /* Panel */
    var panel = el('div',
      'background:#fff;border-radius:14px;max-width:680px;width:100%;max-height:92vh;' +
      'display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.24);' +
      'box-sizing:border-box;overflow:hidden;'
    );

    /* Nagłówek */
    var header = buildHeader();

    /* Ciało (scrollowalne) */
    var body = el('div', 'flex:1;overflow-y:auto;padding:22px 24px 16px;');

    /* Stopka */
    var footer = buildFooter();

    append(panel, header, body, footer);
    append(overlay, panel);

    /* Zamknij na klik tła */
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    /* Escape */
    var onKey = function (e) {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKey);
    overlay._removeKey = function () { document.removeEventListener('keydown', onKey); };

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    renderStep(body, footer);
  }

  function closeModal() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    if (overlay._removeKey) overlay._removeKey();
    overlay.parentNode.removeChild(overlay);
    document.body.style.overflow = '';
  }

  function buildHeader() {
    var header = el('div',
      'background:' + gradient + ';color:#fff;padding:16px 20px;' +
      'display:flex;align-items:center;justify-content:space-between;flex-shrink:0;'
    );
    var left = el('div', 'display:flex;flex-direction:column;gap:2px;');
    var title = el('span', 'font-weight:700;font-size:1rem;letter-spacing:0.01em;', null, 'Generator epikryzy');
    var sub   = el('span', 'font-size:0.78rem;opacity:0.82;', null, 'Niskorosłość · tryb PRO');
    append(left, title, sub);

    var closeBtn = el('button',
      'background:rgba(255,255,255,0.18);border:none;color:#fff;width:30px;height:30px;' +
      'border-radius:50%;cursor:pointer;font-size:1.1rem;display:flex;align-items:center;' +
      'justify-content:center;flex-shrink:0;transition:background 0.15s;',
      {'type': 'button', 'aria-label': 'Zamknij', 'title': 'Zamknij (Esc)'},
      '×'
    );
    closeBtn.addEventListener('mouseenter', function () { closeBtn.style.background = 'rgba(255,255,255,0.3)'; });
    closeBtn.addEventListener('mouseleave', function () { closeBtn.style.background = 'rgba(255,255,255,0.18)'; });
    closeBtn.addEventListener('click', closeModal);

    append(header, left, closeBtn);
    return header;
  }

  function buildFooter() {
    var footer = el('div',
      'padding:12px 20px;border-top:1px solid ' + clr.border + ';display:flex;' +
      'justify-content:space-between;align-items:center;background:#fafafa;flex-shrink:0;'
    );
    footer.id = 'epi-footer';
    return footer;
  }

  function updateStepIndicator(footer) {
    footer.innerHTML = '';
    if (state.result) return;

    /* Lewy: przycisk Wstecz */
    var backBtn = el('button',
      'background:transparent;color:' + clr.primary + ';border:1.5px solid ' + clr.primary + ';' +
      'border-radius:8px;padding:9px 20px;font-weight:600;cursor:pointer;font-size:0.9rem;' +
      'transition:background 0.15s;',
      {'type': 'button'}, state.step === 1 ? 'Anuluj' : '← Wstecz'
    );
    backBtn.addEventListener('mouseenter', function () { backBtn.style.background = 'rgba(0,131,141,0.08)'; });
    backBtn.addEventListener('mouseleave', function () { backBtn.style.background = 'transparent'; });
    backBtn.addEventListener('click', function () {
      if (state.step === 1) { closeModal(); return; }
      collectAnswers();
      state.step--;
      var body   = document.querySelector('#' + OVERLAY_ID + ' [data-epi-body]');
      var footer = document.getElementById('epi-footer');
      renderStep(body, footer);
    });

    /* Środek: wskaźnik kroków */
    var dots = el('div', 'display:flex;gap:6px;align-items:center;');
    for (var i = 1; i <= TOTAL_STEPS; i++) {
      var dot = el('span',
        'display:inline-block;border-radius:50%;transition:all 0.2s;' +
        (i === state.step
          ? 'width:10px;height:10px;background:' + clr.primary + ';'
          : i < state.step
            ? 'width:8px;height:8px;background:' + clr.secondary + ';opacity:0.7;'
            : 'width:8px;height:8px;background:#d1d5db;')
      );
      dots.appendChild(dot);
    }
    var stepLabel = el('span', 'font-size:0.8rem;color:' + clr.muted + ';margin-left:4px;',
      null, state.step + ' / ' + TOTAL_STEPS);
    append(dots, stepLabel);

    /* Prawy: Dalej / Generuj */
    var isLast = state.step === TOTAL_STEPS;
    var nextBtn = el('button',
      'background:' + gradient + ';color:#fff;border:none;border-radius:8px;' +
      'padding:9px 22px;font-weight:700;cursor:pointer;font-size:0.9rem;' +
      'transition:opacity 0.15s;',
      {'type': 'button'}, isLast ? 'Generuj epikryzę ✦' : 'Dalej →'
    );
    nextBtn.addEventListener('mouseenter', function () { nextBtn.style.opacity = '0.88'; });
    nextBtn.addEventListener('mouseleave', function () { nextBtn.style.opacity = '1'; });
    nextBtn.addEventListener('click', function () {
      collectAnswers();
      if (isLast) {
        generateAndShow();
      } else {
        state.step++;
        var body   = document.querySelector('#' + OVERLAY_ID + ' [data-epi-body]');
        var footer = document.getElementById('epi-footer');
        renderStep(body, footer);
      }
    });

    append(footer, backBtn, dots, nextBtn);
  }

  function renderStep(body, footer) {
    body.innerHTML = '';
    body.setAttribute('data-epi-body', '1');
    var stepBuilders = [buildStep1, buildStep2, buildStep3, buildStep4, buildStep5];
    var builder = stepBuilders[state.step - 1];
    if (builder) append(body, builder());
    updateStepIndicator(footer);
    body.scrollTop = 0;
  }

  /* ── EU-4: RENDERERY KROKÓW ───────────────────────────────────────────── */

  /* ─── Krok 1: Wywiad ogólny ─────────────────────────────────────────── */
  function buildStep1() {
    var wrap = el('div', '');
    var sa   = state.answers;

    /* 0. Profil pacjenta — chip-toggle */
    var profSec = section('Profil pacjenta');
    var profChips = {};
    var profGroup = el('div', 'display:flex;gap:10px;flex-wrap:wrap;margin-bottom:4px;');
    ['growth', 'obesity'].forEach(function (p) {
      var lbl = p === 'growth' ? 'Niskorosłość' : 'Otyłość';
      var chip = el('button',
        'padding:7px 18px;border-radius:20px;font-size:0.88rem;font-weight:600;cursor:pointer;' +
        'border:2px solid ' + clr.primary + ';transition:background 0.15s,color 0.15s;',
        {'type': 'button', 'data-profile': p}, lbl);
      var isActive = state.profile === p;
      chip.style.background = isActive ? gradient : 'transparent';
      chip.style.color = isActive ? '#fff' : clr.primary;
      profChips[p] = chip;
      chip.addEventListener('click', function () {
        state.profile = p;
        Object.keys(profChips).forEach(function (k) {
          var active = k === p;
          profChips[k].style.background = active ? gradient : 'transparent';
          profChips[k].style.color = active ? '#fff' : clr.primary;
        });
        /* Synchronicznie pokaż/ukryj sekcję FDP */
        fdpSec.style.display = (p === 'growth') ? '' : 'none';
      });
      profGroup.appendChild(chip);
    });
    var profHint = el('p',
      'font-size:0.78rem;color:' + clr.muted + ';margin:6px 0 0;',
      null,
      'Wybór profilu dostosuje pytania w krokach 4 i 5.');
    append(profSec, profGroup, profHint);

    /* 1a. Powody hospitalizacji */
    var sec1 = section('Powód hospitalizacji');
    var growthReasons = [
      { id: 'epi-r1', val: 'diagnostyki niskorosłości',                        label: 'diagnostyki niskorosłości' },
      { id: 'epi-r2', val: 'oceny wydzielania hormonu wzrostu',                label: 'oceny wydzielania hormonu wzrostu' },
      { id: 'epi-r3', val: 'oceny wzrastania i dojrzewania',                   label: 'oceny wzrastania i dojrzewania' },
      { id: 'epi-r5', val: 'kwalifikacji do leczenia hormonem wzrostu',        label: 'kwalifikacji do leczenia hormonem wzrostu' },
    ];
    var obesityReasons = [
      { id: 'epi-ob1', val: 'diagnostyki i leczenia otyłości',                 label: 'diagnostyki i leczenia otyłości' },
      { id: 'epi-ob2', val: 'kwalifikacji do leczenia otyłości',               label: 'kwalifikacji do leczenia otyłości' },
      { id: 'epi-ob3', val: 'oceny powikłań metabolicznych otyłości',          label: 'oceny powikłań metabolicznych otyłości' },
    ];
    var allReasons = growthReasons.concat(obesityReasons);
    var savedReasons = (sa.reasons && Array.isArray(sa.reasons)) ? sa.reasons : [];
    allReasons.forEach(function (r) {
      var chk = checkRow(r.id, r.val, savedReasons.indexOf(r.val) >= 0);
      chk.querySelector('input').value = r.val;
      chk.querySelector('input').className = 'epi-reason';
      /* Pokaż/ukryj razem z profilem */
      var isOb = (obesityReasons.some(function(o){ return o.id === r.id; }));
      if (isOb) chk.setAttribute('data-profile', 'obesity');
      else      chk.setAttribute('data-profile', 'growth');
      sec1.appendChild(chk);
    });
    /* Własny powód */
    var customWrap = inputField('epi-reason-other', 'Inny powód (opcjonalnie)', 'text', {'placeholder': 'np. kwalifikacji do programu B.130 NFZ'});
    if (sa.reasonOther) customWrap.querySelector('input').value = sa.reasonOther;
    sec1.appendChild(customWrap);

    /* Pokaż tylko powody właściwe dla bieżącego profilu */
    function syncReasonVisibility() {
      sec1.querySelectorAll('[data-profile]').forEach(function (node) {
        var nodeProf = node.getAttribute('data-profile');
        node.style.display = (nodeProf === state.profile) ? '' : 'none';
      });
    }
    syncReasonVisibility();
    Object.keys(profChips).forEach(function (p) {
      profChips[p].addEventListener('click', syncReasonVisibility);
    });

    /* 1b. Wywiad rodzinny — opóźnione dojrzewanie (tylko dla profilu growth) */
    var fdpSec = section('Wywiad rodzinny: opóźnione dojrzewanie i wzrastanie');
    var fdpVal = sa.familyDelayedPuberty || '';
    append(fdpSec,
      radioRow('fdp', 'yes',     'Tak — w rodzinie stwierdzono późne dojrzewanie lub wzrastanie', fdpVal === 'yes'),
      radioRow('fdp', 'no',      'Nie — brak danych w wywiadzie rodzinnym',                       fdpVal === 'no'),
      radioRow('fdp', 'unknown', 'Brak danych / nieznane',                                        fdpVal === 'unknown')
    );
    fdpSec.style.display = (state.profile === 'growth') ? '' : 'none';

    append(wrap, profSec, hr(), sec1, hr(), fdpSec);
    return wrap;
  }

  /* ─── Krok 2: Wywiad urodzeniowy ──────────────────────────────────────── */
  /* Źródła norm urodzeniowych (SGA) — patrz window.VildaSgaBirth.
     Wybór JEDNEGO źródła; Malewski obejmuje wyłącznie masę urodzeniową. */
  var SGA_SOURCE_LABELS = {
    niklasson:   'Niklasson / Albertsson-Wikland',
    intergrowth: 'INTERGROWTH-21st',
    malewski:    'Malewski i wsp. (PL — tylko masa)'
  };
  var SGA_SOURCE_RANGE = {
    niklasson:   '24–42 tc · masa, długość, obwód głowy',
    intergrowth: '24+0–42+6 tc · masa, długość, obwód głowy',
    malewski:    '22–43 tc · wyłącznie masa urodzeniowa'
  };

  function buildStep2() {
    var wrap = el('div', '');
    var sa   = state.answers;
    var birth = sa.birth || {};

    /* ── Źródło norm SGA (jeden wybór, niezależne od modułu docpro) ── */
    var secSrc = section('Źródło norm SDS urodzeniowych');
    var srcSel = birth.sdsSource || 'niklasson';
    append(secSrc,
      radioRow('sga-source', 'niklasson',   SGA_SOURCE_LABELS.niklasson,   srcSel === 'niklasson'),
      radioRow('sga-source', 'intergrowth', SGA_SOURCE_LABELS.intergrowth, srcSel === 'intergrowth'),
      radioRow('sga-source', 'malewski',    SGA_SOURCE_LABELS.malewski,    srcSel === 'malewski')
    );
    var srcNote = el('p',
      'font-size:0.8rem;color:' + clr.muted + ';margin:6px 2px 0;',
      null, ''
    );
    secSrc.appendChild(srcNote);

    var sec = section('Dane urodzeniowe');
    append(sec,
      inputField('epi-gest-weeks',     'Wiek ciążowy — pełne tygodnie',  'number', {'min':'22','max':'43','step':'1',    'placeholder':'np. 40'}, null),
      inputField('epi-gest-days',      'Dodatkowe dni (0–6)',             'number', {'min':'0','max':'6','step':'1',     'placeholder':'np. 3'}, null),
      inputField('epi-birth-weight',   'Masa urodzeniowa (g)',             'number', {'min':'300','max':'6000','step':'10',  'placeholder':'np. 3400'}, null),
      inputField('epi-birth-length',   'Długość urodzeniowa (cm)',         'number', {'min':'20','max':'60','step':'0.5',  'placeholder':'np. 53'}, null)
    );
    if (birth.gestationalWeeks) sec.querySelector('#epi-gest-weeks').value   = birth.gestationalWeeks;
    if (birth.gestationalDays != null) sec.querySelector('#epi-gest-days').value = birth.gestationalDays;
    if (birth.birthWeightG)     sec.querySelector('#epi-birth-weight').value  = birth.birthWeightG;
    if (birth.birthLengthCm)    sec.querySelector('#epi-birth-length').value  = birth.birthLengthCm;

    var lengthFieldWrap = sec.querySelector('#epi-birth-length').parentNode;

    var hint = el('p',
      'font-size:0.8rem;color:' + clr.muted + ';background:#f0f9ff;border:1px solid #bae6fd;' +
      'border-radius:6px;padding:8px 10px;margin:10px 0 0;',
      null,
      'SDS masy i długości urodzeniowej zostanie obliczone automatycznie wg wybranego źródła.'
    );
    sec.appendChild(hint);

    /* Dynamiczna podpowiedź + wygaszenie pola długości dla źródła Malewski. */
    function syncSourceUI() {
      var checkedSrc = secSrc.querySelector('input[name="sga-source"]:checked');
      var s = (checkedSrc && checkedSrc.value) || 'niklasson';
      srcNote.textContent = 'Zakres: ' + (SGA_SOURCE_RANGE[s] || '') + '.';
      var malewski = (s === 'malewski');
      lengthFieldWrap.style.opacity = malewski ? '0.45' : '1';
      lengthFieldWrap.style.pointerEvents = malewski ? 'none' : 'auto';
      hint.textContent = malewski
        ? 'Źródło Malewski obejmuje wyłącznie masę urodzeniową — długość zostanie pominięta w epikryzie. SDS masy obliczany automatycznie.'
        : 'SDS masy i długości urodzeniowej zostanie obliczone automatycznie wg wybranego źródła.';
    }
    secSrc.querySelectorAll('input[name="sga-source"]').forEach(function (inp) {
      inp.addEventListener('change', syncSourceUI);
    });
    syncSourceUI();

    /* SGA catch-up — zawsze pokazuj, jeśli wypełnione dane */
    var sec2 = section('Nadgonienie wzrostu (dotyczy dzieci SGA)');
    var cupVal = birth.catchUp || '';
    append(sec2,
      radioRow('catchup', 'yes',     'Tak — dziecko nadgoniło wzrost do 4. roku życia',       cupVal === 'yes'),
      radioRow('catchup', 'no',      'Nie — brak nadgonienia wzrostu do 4. roku życia (SGA)', cupVal === 'no'),
      radioRow('catchup', 'unknown', 'Nie dotyczy / nieznane',                                cupVal === 'unknown')
    );

    append(wrap, secSrc, hr(), sec, hr(), sec2);
    return wrap;
  }

  /* ─── Krok 3: Stan kliniczny ─────────────────────────────────────────── */
  function buildStep3() {
    var wrap    = el('div', '');
    var sa      = state.answers;
    var clin    = sa.clinical || {};
    var sex     = (state.pd && state.pd.sex) || 'M';

    /* Proporcje */
    var sec1 = section('Budowa ciała i proporcje');
    var propVal = clin.proportionality || '';
    append(sec1,
      radioRow('proportionality', 'proportional',  'Sylwetka proporcjonalna',                          propVal === 'proportional'),
      radioRow('proportionality', 'short_limbs',   'Nieproporcjonalna — skrócenie kończyn',             propVal === 'short_limbs'),
      radioRow('proportionality', 'short_trunk',   'Nieproporcjonalna — skrócenie tułowia',             propVal === 'short_trunk')
    );

    /* Cechy dysmorficzne */
    var sec2 = section('Cechy dysmorficzne');
    var dysmVal = clin.dysmorphic || '';
    append(sec2,
      radioRow('dysmorphic', 'yes', 'Obecne cechy dysmorficzne',                 dysmVal === 'yes'),
      radioRow('dysmorphic', 'no',  'Bez widocznych cech dysmorficznych',        dysmVal === 'no')
    );

    /* Dojrzewanie wg Tannera */
    var sec3 = section('Stopień dojrzewania (Tanner)');
    var tannerOpts = [
      { value: '',  label: '— nie oceniono —' },
      { value: '1', label: 'T1' }, { value: '2', label: 'T2' },
      { value: '3', label: 'T3' }, { value: '4', label: 'T4' }, { value: '5', label: 'T5' }
    ];
    var tannerGrid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:8px;');
    if (sex === 'F') {
      var bSel = selectField('epi-tanner-b', 'Piersi (B1–B5)', tannerOpts);
      if (clin.tannerBreasts) bSel.querySelector('select').value = String(clin.tannerBreasts);
      tannerGrid.appendChild(bSel);
    } else {
      var gSel = selectField('epi-tanner-g', 'Genitalia (G1–G5)', tannerOpts);
      if (clin.tannerGenitalia) gSel.querySelector('select').value = String(clin.tannerGenitalia);
      tannerGrid.appendChild(gSel);
    }
    var pSel = selectField('epi-tanner-p', 'Owłosienie łonowe (P1–P5)', tannerOpts);
    if (clin.tannerPubic) pSel.querySelector('select').value = String(clin.tannerPubic);
    tannerGrid.appendChild(pSel);
    sec3.appendChild(tannerGrid);

    /* Choroba przewlekła */
    var sec4 = section('Choroby przewlekłe i objawy dodatkowe');
    var chroVal = clin.chronicDisease || '';
    append(sec4,
      radioRow('chronic', 'yes', 'Objawy sugerujące chorobę przewlekłą',             chroVal === 'yes'),
      radioRow('chronic', 'no',  'Bez objawów sugerujących chorobę przewlekłą',     chroVal === 'no')
    );

    /* Metoda oceny wieku kostnego */
    var sec5 = section('Metoda oceny wieku kostnego (jeśli wykonano)');
    var baMethodOpts = [
      { value: '',               label: '— nie wybrano —' },
      { value: 'Greulich-Pyle',  label: 'Greulich-Pyle' },
      { value: 'TW3',            label: 'TW3 (Tanner-Whitehouse)' },
      { value: 'Thiemann-Nitz',  label: 'Thiemann-Nitz' },
      { value: 'inne',           label: 'Inne' },
    ];
    var baSel = selectField('epi-ba-method', 'Metoda oceny wieku kostnego', baMethodOpts);
    if (sa.boneAgeMethod) baSel.querySelector('select').value = sa.boneAgeMethod;
    sec5.appendChild(baSel);

    append(wrap, sec1, hr(), sec2, hr(), sec3, hr(), sec4, hr(), sec5);
    return wrap;
  }

  /* ─── Krok 4 (obesity): Badania metaboliczne ────────────────────────────── */
  function buildStep4Obesity() {
    var wrap = el('div', '');
    var sa   = state.answers;
    var ob   = sa.obesity || {};

    /* Ciśnienie tętnicze */
    var sec1 = section('Ciśnienie tętnicze');
    var bpVal = ob.bpNormal || '';
    var bpRadios = el('div', '');
    append(bpRadios,
      radioRow('ob-bp', 'yes',  'Prawidłowe dla wieku',  bpVal === 'yes'),
      radioRow('ob-bp', 'no',   'Podwyższone',           bpVal === 'no'),
      radioRow('ob-bp', 'skip', 'Nie mierzono',          bpVal === 'skip' || bpVal === '')
    );
    sec1.appendChild(bpRadios);
    var bpExtra = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;');
    var bpSysF = inputField('epi-bp-sys',  'RR skurczowe (mmHg)', 'number', {'min':'60','max':'220','step':'1','placeholder':'np. 130'}, null);
    var bpDiaF = inputField('epi-bp-dia',  'RR rozkurczowe (mmHg)', 'number', {'min':'40','max':'140','step':'1','placeholder':'np. 85'}, null);
    if (ob.bpSystolic)  bpSysF.querySelector('input').value = ob.bpSystolic;
    if (ob.bpDiastolic) bpDiaF.querySelector('input').value = ob.bpDiastolic;
    append(bpExtra, bpSysF, bpDiaF);
    bpExtra.style.display = (bpVal === 'no') ? '' : 'none';
    bpRadios.querySelectorAll('input[type="radio"]').forEach(function (r) {
      r.addEventListener('change', function () {
        bpExtra.style.display = (radioVal('ob-bp') === 'no') ? '' : 'none';
      });
    });
    sec1.appendChild(bpExtra);

    /* Lipidogram */
    var sec2 = section('Lipidogram');
    var lipVal = ob.lipidsNormal || '';
    var lipRadios = el('div', '');
    append(lipRadios,
      radioRow('ob-lipids', 'yes',      'Prawidłowy',            lipVal === 'yes'),
      radioRow('ob-lipids', 'no',       'Zaburzenia lipidowe',   lipVal === 'no'),
      radioRow('ob-lipids', 'not_done', 'Nie wykonano',          lipVal === 'not_done' || lipVal === '')
    );
    sec2.appendChild(lipRadios);
    var lipExtra = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;');
    var lipFields = [
      { id: 'epi-chol',  label: 'Chol całk. (mmol/L)', key: 'cholTotal' },
      { id: 'epi-ldl',   label: 'LDL (mmol/L)',         key: 'ldl' },
      { id: 'epi-hdl',   label: 'HDL (mmol/L)',         key: 'hdl' },
      { id: 'epi-tg',    label: 'TG (mmol/L)',          key: 'triglycerides' },
    ];
    lipFields.forEach(function (f) {
      var ff = inputField(f.id, f.label, 'number', {'min':'0','step':'0.01','placeholder':'mmol/L'}, null);
      if (ob[f.key]) ff.querySelector('input').value = ob[f.key];
      lipExtra.appendChild(ff);
    });
    lipExtra.style.display = (lipVal === 'no') ? '' : 'none';
    lipRadios.querySelectorAll('input[type="radio"]').forEach(function (r) {
      r.addEventListener('change', function () {
        lipExtra.style.display = (radioVal('ob-lipids') === 'no') ? '' : 'none';
      });
    });
    append(sec2, lipRadios, lipExtra);

    /* Insulina / HOMA-IR */
    var sec3 = section('Insulinooporność (HOMA-IR)');
    var homaVal = ob.homaIrElevated || '';
    var homaRadios = el('div', '');
    append(homaRadios,
      radioRow('ob-homa', 'yes',  'Insulinooporność stwierdzona', homaVal === 'yes'),
      radioRow('ob-homa', 'no',   'Brak insulinooporności',       homaVal === 'no'),
      radioRow('ob-homa', 'skip', 'Nie oznaczono',                homaVal === 'skip' || homaVal === '')
    );
    sec3.appendChild(homaRadios);
    var homaExtra = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;');
    var homaF    = inputField('epi-homa',    'HOMA-IR',                  'number', {'min':'0','step':'0.01','placeholder':'np. 4,8'}, null);
    var insulinF = inputField('epi-insulin', 'Insulina na czczo (μIU/mL)', 'number', {'min':'0','step':'0.1','placeholder':'np. 22,0'}, null);
    if (ob.homaIr)  homaF.querySelector('input').value    = ob.homaIr;
    if (ob.insulin) insulinF.querySelector('input').value = ob.insulin;
    append(homaExtra, homaF, insulinF);
    homaExtra.style.display = (homaVal === 'yes' || homaVal === 'no') ? '' : 'none';
    homaRadios.querySelectorAll('input[type="radio"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var v = radioVal('ob-homa');
        homaExtra.style.display = (v === 'yes' || v === 'no') ? '' : 'none';
      });
    });
    sec3.appendChild(homaExtra);

    /* Enzymy wątrobowe */
    var sec4 = section('Enzymy wątrobowe (ALT)');
    var altVal = ob.altElevated || '';
    append(sec4,
      radioRow('ob-alt', 'yes',  'ALT podwyższone (NAFLD)',  altVal === 'yes'),
      radioRow('ob-alt', 'no',   'ALT prawidłowe',           altVal === 'no'),
      radioRow('ob-alt', 'skip', 'Nie oznaczono',            altVal === 'skip' || altVal === '')
    );
    var altExtra = inputField('epi-alt', 'ALT (U/L)', 'number', {'min':'0','step':'1','placeholder':'np. 68'}, null);
    if (ob.alt) altExtra.querySelector('input').value = ob.alt;
    altExtra.style.display = (altVal === 'yes') ? '' : 'none';
    sec4.querySelectorAll('input[type="radio"]').forEach(function (r) {
      r.addEventListener('change', function () {
        altExtra.style.display = (radioVal('ob-alt') === 'yes') ? '' : 'none';
      });
    });
    sec4.appendChild(altExtra);

    /* Tarczyca */
    var sec5 = section('Czynność tarczycy (TSH)');
    var thyObVal = ob.thyroidNormal || '';
    var thyObRadios = el('div', '');
    append(thyObRadios,
      radioRow('ob-thyroid', 'yes',  'Prawidłowa',     thyObVal === 'yes'),
      radioRow('ob-thyroid', 'no',   'Nieprawidłowa',  thyObVal === 'no'),
      radioRow('ob-thyroid', 'skip', 'Nie oznaczono',  thyObVal === 'skip' || thyObVal === '')
    );
    sec5.appendChild(thyObRadios);
    var tshObF = inputField('epi-ob-tsh', 'TSH (mU/L)', 'number', {'min':'0','step':'0.01','placeholder':'np. 4,5'}, null);
    if (ob.tsh) tshObF.querySelector('input').value = ob.tsh;
    tshObF.style.display = (thyObVal === 'no') ? '' : 'none';
    thyObRadios.querySelectorAll('input[type="radio"]').forEach(function (r) {
      r.addEventListener('change', function () {
        tshObF.style.display = (radioVal('ob-thyroid') === 'no') ? '' : 'none';
      });
    });
    sec5.appendChild(tshObF);

    append(wrap, sec1, hr(), sec2, hr(), sec3, hr(), sec4, hr(), sec5);
    return wrap;
  }

  /* ─── Krok 4: Badania laboratoryjne ────────────────────────────────────── */
  function buildStep4() {
    if (state.profile === 'obesity') return buildStep4Obesity();
    var wrap = el('div', '');
    var sa   = state.answers;
    var labs = sa.labs || {};

    /* IGF-1 */
    var sec1 = section('IGF-1 i IGFBP-3');
    var igf1Row = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:8px;');
    var igf1F  = inputField('epi-igf1',     'IGF-1 (ng/mL)',    'number', {'min':'0','step':'0.1','placeholder':'np. 52'}, null);
    var igf1SF = inputField('epi-igf1-sds', 'IGF-1 SDS',        'number', {'min':'-10','max':'10','step':'0.01','placeholder':'np. -2,30'}, null);
    if (labs.igf1)    igf1F.querySelector('input').value  = labs.igf1;
    if (labs.igf1Sds) igf1SF.querySelector('input').value = labs.igf1Sds;
    append(igf1Row, igf1F, igf1SF);
    sec1.appendChild(igf1Row);

    var igfbp3F = inputField('epi-igfbp3', 'IGFBP-3 (mg/L)', 'number', {'min':'0','step':'0.01','placeholder':'np. 2,1'}, null);
    if (labs.igfbp3) igfbp3F.querySelector('input').value = labs.igfbp3;
    sec1.appendChild(igfbp3F);

    /* Tarczyca */
    var sec2 = section('Czynność tarczycy');
    var thyVal = labs.thyroidNormal || '';
    var thyRadios = el('div', '');
    append(thyRadios,
      radioRow('thyroid', 'yes',  'Prawidłowa',    thyVal === 'yes'),
      radioRow('thyroid', 'no',   'Nieprawidłowa', thyVal === 'no'),
      radioRow('thyroid', 'skip', 'Nie oznaczono', thyVal === 'skip' || thyVal === '')
    );
    sec2.appendChild(thyRadios);
    var thyExtra = el('div', 'margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px;');
    var tshF = inputField('epi-tsh',  'TSH (mU/L)',   'number', {'min':'0','step':'0.01','placeholder':'np. 28,4'}, null);
    var ft4F = inputField('epi-ft4',  'fT4 (pmol/L)', 'number', {'min':'0','step':'0.01','placeholder':'np. 7,1'}, null);
    if (labs.tsh) tshF.querySelector('input').value = labs.tsh;
    if (labs.ft4) ft4F.querySelector('input').value = labs.ft4;
    append(thyExtra, tshF, ft4F);
    /* Pokaż/ukryj extra pola */
    thyExtra.style.display = (thyVal === 'no') ? '' : 'none';
    thyRadios.querySelectorAll('input[type="radio"]').forEach(function (r) {
      r.addEventListener('change', function () {
        thyExtra.style.display = (radioVal('thyroid') === 'no') ? '' : 'none';
      });
    });
    sec2.appendChild(thyExtra);

    /* Kortyzol */
    var sec3 = section('Kortyzol poranny');
    var corVal = labs.cortisolNormal || '';
    var corRadios = el('div', '');
    append(corRadios,
      radioRow('cortisol', 'yes',  'W normie',      corVal === 'yes'),
      radioRow('cortisol', 'no',   'Obniżony',      corVal === 'no'),
      radioRow('cortisol', 'skip', 'Nie oznaczono', corVal === 'skip' || corVal === '')
    );
    var corExtra = inputField('epi-cortisol', 'Kortyzol poranny (nmol/L)', 'number', {'min':'0','step':'1','placeholder':'np. 80'}, null);
    if (labs.cortisolMorning) corExtra.querySelector('input').value = labs.cortisolMorning;
    corExtra.style.display = (corVal === 'no') ? '' : 'none';
    corRadios.querySelectorAll('input[type="radio"]').forEach(function (r) {
      r.addEventListener('change', function () {
        corExtra.style.display = (radioVal('cortisol') === 'no') ? '' : 'none';
      });
    });
    sec3.appendChild(corRadios);
    sec3.appendChild(corExtra);

    /* Celiakia, morfologia, biochemia */
    var sec4 = section('Badania dodatkowe');
    var celVal = labs.celiacNormal || '';
    var cels = el('div', 'margin-bottom:10px;');
    var celLabel = el('p', 'font-size:0.85rem;color:' + clr.muted + ';margin:0 0 5px;', null, 'Celiakia (przeciwciała anty-tTG):');
    append(cels, celLabel,
      radioRow('celiac', 'yes',      'Prawidłowe / ujemne',                           celVal === 'yes'),
      radioRow('celiac', 'no',       'Podwyższone — podejrzenie celiakii',             celVal === 'no'),
      radioRow('celiac', 'not_done', 'Nie wykonano',                                  celVal === 'not_done' || celVal === '')
    );
    sec4.appendChild(cels);

    var cbcRow = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:16px;');
    var cbcBlock = el('div', '');
    var cbcLbl = el('p', 'font-size:0.85rem;color:' + clr.muted + ';margin:0 0 5px;', null, 'Morfologia krwi:');
    var cbcVal = labs.cbcNormal || '';
    append(cbcBlock, cbcLbl,
      radioRow('cbc', 'yes',  'Prawidłowa',  cbcVal === 'yes'),
      radioRow('cbc', 'no',   'Odchylenia',  cbcVal === 'no'),
      radioRow('cbc', 'skip', 'Nie wykonano', cbcVal === 'skip' || cbcVal === '')
    );
    var biochemBlock = el('div', '');
    var biochemLbl = el('p', 'font-size:0.85rem;color:' + clr.muted + ';margin:0 0 5px;', null, 'Biochemia krwi:');
    var biochemVal = labs.biochemNormal || '';
    append(biochemBlock, biochemLbl,
      radioRow('biochem', 'yes',  'Prawidłowa',  biochemVal === 'yes'),
      radioRow('biochem', 'no',   'Odchylenia',  biochemVal === 'no'),
      radioRow('biochem', 'skip', 'Nie wykonano', biochemVal === 'skip' || biochemVal === '')
    );
    append(cbcRow, cbcBlock, biochemBlock);
    sec4.appendChild(cbcRow);

    append(wrap, sec1, hr(), sec2, hr(), sec3, hr(), sec4);
    return wrap;
  }

  /* ─── Krok 5: GH, MRI, Genetyka, Rozpoznanie ─────────────────────────── */
  function buildStep5() {
    var wrap = el('div', '');
    var sa   = state.answers;
    var gh   = sa.ghTests   || {};
    var mri  = sa.mri       || {};
    var gen  = sa.genetics  || {};

    /* GH testy */
    var sec1 = section('Testy stymulacyjne wydzielania GH');
    var ghPerVal = gh.performed || '';
    var ghRadios = el('div', '');
    append(ghRadios,
      radioRow('gh-performed', 'yes', 'Tak — wykonano testy stymulacyjne', ghPerVal === 'yes'),
      radioRow('gh-performed', 'no',  'Nie wykonano w tej hospitalizacji', ghPerVal === 'no')
    );
    sec1.appendChild(ghRadios);

    var ghExtra = el('div', 'margin-top:12px;');

    /* Kontekst testów — który to test */
    var ctxVal = gh.context || 'both';
    var ctxBlock = el('div', 'margin-bottom:10px;');
    var ctxLbl2 = el('p', 'font-size:0.85rem;color:' + clr.muted + ';margin:0 0 5px;', null,
      'Podczas tej hospitalizacji wykonano:');
    ctxBlock.appendChild(ctxLbl2);
    var ctxOpts = [
      { value: 'both',        label: 'Oba testy stymulacyjne (ta hospitalizacja)' },
      { value: 'first_only',  label: 'Tylko 1. test (2. test potwierdzający planowany)' },
      { value: 'second_only', label: '2. test potwierdzający (1. test wykonano wcześniej)' },
    ];
    ctxOpts.forEach(function (o) {
      ctxBlock.appendChild(radioRow('gh-context', o.value, o.label, ctxVal === o.value));
    });
    ghExtra.appendChild(ctxBlock);
    ghExtra.appendChild(hr());

    /* Priming */
    var primVal = gh.priming || '';
    var primRow = el('div', 'margin-bottom:10px;');
    var primLbl = el('p', 'font-size:0.85rem;color:' + clr.muted + ';margin:0 0 5px;', null, 'Priming estrogenowy/androgenowy:');
    append(primRow, primLbl,
      radioRow('priming', 'yes', 'Tak', primVal === 'yes'),
      radioRow('priming', 'no',  'Nie', primVal === 'no')
    );
    ghExtra.appendChild(primRow);
    ghExtra.appendChild(hr());

    var testTypeOpts = [
      { value: 'clonidine', label: 'Klonidynowy' },
      { value: 'glucagon',  label: 'Glukagonowy' },
      { value: 'insulin',   label: 'Insulinowy (ITT)' },
      { value: 'ldopa',     label: 'L-DOPA' },
      { value: 'arginine',  label: 'Argininowy' },
      { value: 'ghrh',      label: 'GHRH' },
      { value: 'other',     label: 'Inny' },
    ];

    /* Blok testu 1 */
    var t1 = gh.test1 || {};
    var test1Block = el('div', 'margin-bottom:10px;');
    var t1Lbl = el('p', 'font-size:0.85rem;color:' + clr.muted + ';margin:0 0 5px;font-weight:600;', null, 'Test 1');
    var t1Grid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:8px;');
    /* Dla second_only: test1 jest opcjonalny (dodaj pusty option) */
    var testTypeOptsOpt = [{ value: '', label: '— opcjonalny —' }].concat(testTypeOpts);
    var t1Type = selectField('epi-t1-type', 'Rodzaj testu', testTypeOpts);
    var t1Peak = inputField('epi-t1-peak', 'Szczyt GH (ng/mL)', 'number', {'min':'0','step':'0.1','placeholder':'np. 3,2'}, null);
    if (t1.type)   t1Type.querySelector('select').value = t1.type;
    if (t1.peakGh) t1Peak.querySelector('input').value  = t1.peakGh;
    append(t1Grid, t1Type, t1Peak);
    append(test1Block, t1Lbl, t1Grid);
    ghExtra.appendChild(test1Block);

    /* Blok testu 2 */
    var t2 = gh.test2 || {};
    var test2Block = el('div', '');
    var t2Lbl = el('p', 'font-size:0.85rem;color:' + clr.muted + ';margin:0 0 5px;font-weight:600;', null, 'Test 2 (opcjonalnie)');
    var t2Grid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:8px;');
    var t2Type = selectField('epi-t2-type', 'Rodzaj testu', [{ value: '', label: '— opcjonalny —' }].concat(testTypeOpts));
    var t2Peak = inputField('epi-t2-peak', 'Szczyt GH (ng/mL)', 'number', {'min':'0','step':'0.1','placeholder':'np. 4,1'}, null);
    if (t2.type)   t2Type.querySelector('select').value = t2.type;
    if (t2.peakGh) t2Peak.querySelector('input').value  = t2.peakGh;
    append(t2Grid, t2Type, t2Peak);
    append(test2Block, t2Lbl, t2Grid);
    ghExtra.appendChild(test2Block);

    /* Aktualizuj etykiety i widoczność bloków na podstawie kontekstu */
    function updateGhContextUI(ctx) {
      var t1TypeSel = t1Type.querySelector('select');
      if (ctx === 'first_only') {
        /* Tylko 1. test: ukryj blok 2, t1 wymagany */
        t1Lbl.textContent = 'Test stymulacyjny (wykonany w tej hospitalizacji)';
        test2Block.style.display = 'none';
        /* Upewnij się, że t1 nie ma pustego option */
        if (t1TypeSel.options[0] && t1TypeSel.options[0].value === '') {
          t1TypeSel.removeChild(t1TypeSel.options[0]);
        }
      } else if (ctx === 'second_only') {
        /* 2. test potwierdzający: t2 = ta hospitalizacja (główny), t1 = poprzednia (opcjonalny) */
        t1Lbl.textContent = '1. test (z poprzedniej hospitalizacji — opcjonalnie)';
        t2Lbl.textContent = 'Test z tej hospitalizacji (2. test potwierdzający)';
        test2Block.style.display = '';
        /* Dodaj pusty option do t1 jeśli go nie ma */
        if (t1TypeSel.options[0] && t1TypeSel.options[0].value !== '') {
          var emptyOpt = document.createElement('option');
          emptyOpt.value = ''; emptyOpt.textContent = '— opcjonalny —';
          t1TypeSel.insertBefore(emptyOpt, t1TypeSel.options[0]);
        }
      } else {
        /* 'both': oba testy — domyślne */
        t1Lbl.textContent = 'Test 1';
        t2Lbl.textContent = 'Test 2 (opcjonalnie)';
        test2Block.style.display = '';
        /* Usuń pusty option z t1 jeśli jest */
        if (t1TypeSel.options[0] && t1TypeSel.options[0].value === '') {
          t1TypeSel.removeChild(t1TypeSel.options[0]);
        }
      }
    }

    /* Inicjalne ustawienie */
    updateGhContextUI(ctxVal);

    /* Nasłuchuj zmian kontekstu */
    ctxBlock.querySelectorAll('input[type="radio"]').forEach(function (r) {
      r.addEventListener('change', function () {
        updateGhContextUI(radioVal('gh-context') || 'both');
      });
    });

    /* Pokaż/ukryj cały blok ghExtra */
    ghExtra.style.display = (ghPerVal === 'yes') ? '' : 'none';
    ghRadios.querySelectorAll('input[type="radio"]').forEach(function (r) {
      r.addEventListener('change', function () {
        ghExtra.style.display = (radioVal('gh-performed') === 'yes') ? '' : 'none';
      });
    });
    sec1.appendChild(ghExtra);

    /* MRI */
    var sec2 = section('MRI okolicy podwzgórzowo-przysadkowej');
    var mriPerVal = mri.performed || '';
    var mriRadios = el('div', '');
    append(mriRadios,
      radioRow('mri-performed', 'yes', 'Tak — wykonano MRI', mriPerVal === 'yes'),
      radioRow('mri-performed', 'no',  'Nie wykonano',        mriPerVal === 'no')
    );
    var mriResultOpts = [
      { value: 'normal',       label: 'Obraz prawidłowy' },
      { value: 'hypoplasia',   label: 'Hipoplazja przysadki' },
      { value: 'thin_stalk',   label: 'Cienki lejek przysadki' },
      { value: 'ectopic',      label: 'Ektopia tylnego płata' },
      { value: 'microadenoma', label: 'Mikrogruczolak' },
      { value: 'macroadenoma', label: 'Makrogruczolak' },
      { value: 'other',        label: 'Inny wynik' },
    ];
    var mriExtra = selectField('epi-mri-result', 'Wynik MRI', mriResultOpts);
    if (mri.result) mriExtra.querySelector('select').value = mri.result;
    mriExtra.style.display = (mriPerVal === 'yes') ? '' : 'none';
    mriRadios.querySelectorAll('input[type="radio"]').forEach(function (r) {
      r.addEventListener('change', function () {
        mriExtra.style.display = (radioVal('mri-performed') === 'yes') ? '' : 'none';
      });
    });
    append(sec2, mriRadios, mriExtra);

    /* Genetyka */
    var sec3 = section('Badania genetyczne');
    var karyOpts = [
      { value: '',         label: '— nie wykonano / n.d. —' },
      { value: '46XX',     label: '46,XX — prawidłowy żeński' },
      { value: '46XY',     label: '46,XY — prawidłowy męski' },
      { value: '45X',      label: '45,X — Zespół Turnera' },
      { value: 'mosaic',   label: 'Mozaicyzm' },
      { value: 'other',    label: 'Inny wynik' },
    ];
    var karySel = selectField('epi-karyotype', 'Kariotyp', karyOpts);
    if (gen.karyotypeResult) karySel.querySelector('select').value = gen.karyotypeResult;
    sec3.appendChild(karySel);

    var shoxOpts = [
      { value: '',          label: '— nie wykonano —' },
      { value: 'positive',  label: 'Dodatni — mutacja/delecja SHOX potwierdzona' },
      { value: 'negative',  label: 'Ujemny — brak mutacji SHOX' },
    ];
    var shoxSel = selectField('epi-shox', 'Gen SHOX', shoxOpts);
    if (gen.shox) shoxSel.querySelector('select').value = gen.shox;
    sec3.appendChild(shoxSel);

    /* Rozpoznanie */
    var sec4 = section('Rozpoznanie robocze');
    var diagVal = sa.diagnosis || (state.profile === 'obesity' ? 'obesity' : '');
    var growthDiagItems = [
      { v: 'ghd',     lbl: 'Niedobór hormonu wzrostu (SNP / GHD)' },
      { v: 'kowd',    lbl: 'Konstytucjonalne opóźnienie wzrastania i dojrzewania (KOWD/CDGP)' },
      { v: 'iss',     lbl: 'Niskorosłość idiopatyczna (ISS)' },
      { v: 'sga',     lbl: 'Niskorosłość po urodzeniu SGA bez catch-up' },
      { v: 'turner',  lbl: 'Zespół Turnera' },
      { v: 'thyroid', lbl: 'Niedoczynność tarczycy' },
      { v: 'other',   lbl: 'Inne rozpoznanie' },
    ];
    var obesityDiagItems = [
      { v: 'obesity', lbl: 'Otyłość prosta / nadwaga' },
      { v: 'other',   lbl: 'Inne rozpoznanie' },
    ];
    var diagItems = (state.profile === 'obesity') ? obesityDiagItems : growthDiagItems;
    diagItems.forEach(function (d) {
      sec4.appendChild(radioRow('diagnosis', d.v, d.lbl, diagVal === d.v));
    });

    /* Ukryj sekcje nieistotne dla profilu otyłości */
    var isOb = state.profile === 'obesity';
    sec1.style.display = isOb ? 'none' : '';  /* GH tests */
    sec2.style.display = isOb ? 'none' : '';  /* MRI */

    append(wrap, sec1, hr(), sec2, hr(), sec3, hr(), sec4);
    return wrap;
  }

  /* ── EU-3 cd.: ZBIERANIE ODPOWIEDZI ─────────────────────────────────── */

  function collectAnswers() {
    var sa = state.answers;

    if (state.step === 1) {
      sa.reasons = checkedVals('epi-reason');
      var customReason = fieldVal('epi-reason-other');
      if (customReason) sa.reasons.push(customReason);
      sa.reasonOther = customReason;
      sa.familyDelayedPuberty = radioVal('fdp') || 'unknown';
    }

    if (state.step === 2) {
      sa.birth = {
        sdsSource:        radioVal('sga-source') || 'niklasson',
        gestationalWeeks: fieldNum('epi-gest-weeks'),
        gestationalDays:  fieldNum('epi-gest-days'),
        birthWeightG:     fieldNum('epi-birth-weight'),
        birthLengthCm:    fieldNum('epi-birth-length'),
        catchUp:          radioVal('catchup') || null,
      };
    }

    if (state.step === 3) {
      sa.clinical = {
        proportionality:  radioVal('proportionality') || null,
        dysmorphic:       radioVal('dysmorphic')       || null,
        tannerBreasts:    fieldNum('epi-tanner-b')     || null,
        tannerGenitalia:  fieldNum('epi-tanner-g')     || null,
        tannerPubic:      fieldNum('epi-tanner-p')     || null,
        chronicDisease:   radioVal('chronic')          || null,
      };
      sa.boneAgeMethod = fieldVal('epi-ba-method') || null;
    }

    if (state.step === 4) {
      if (state.profile === 'obesity') {
        /* ── Zbierz dane metaboliczne (profil otyłości) ── */
        var bpRaw    = radioVal('ob-bp');
        var lipRaw   = radioVal('ob-lipids');
        var homaRaw  = radioVal('ob-homa');
        var altRaw   = radioVal('ob-alt');
        var thyObRaw = radioVal('ob-thyroid');
        sa.obesity = {
          bpNormal:       (bpRaw   === 'skip' || !bpRaw)   ? null : bpRaw,
          bpSystolic:     fieldNum('epi-bp-sys')  || null,
          bpDiastolic:    fieldNum('epi-bp-dia')  || null,
          lipidsNormal:   (lipRaw  === 'not_done' || !lipRaw) ? null : lipRaw,
          cholTotal:      fieldNum('epi-chol')    || null,
          ldl:            fieldNum('epi-ldl')     || null,
          hdl:            fieldNum('epi-hdl')     || null,
          triglycerides:  fieldNum('epi-tg')      || null,
          homaIrElevated: (homaRaw === 'skip' || !homaRaw) ? null : homaRaw,
          homaIr:         fieldNum('epi-homa')    || null,
          insulin:        fieldNum('epi-insulin') || null,
          altElevated:    (altRaw  === 'skip' || !altRaw)  ? null : altRaw,
          alt:            fieldNum('epi-alt')     || null,
          thyroidNormal:  (thyObRaw === 'skip' || !thyObRaw) ? null : thyObRaw,
          tsh:            fieldNum('epi-ob-tsh')  || null,
        };
      } else {
        /* ── Zbierz dane laboratoryjne (profil niskorosłości) ── */
        var thyroid = radioVal('thyroid');
        var cortisol = radioVal('cortisol');
        sa.labs = {
          igf1:            fieldNum('epi-igf1')     || null,
          igf1Sds:         fieldNum('epi-igf1-sds') || null,
          igfbp3:          fieldNum('epi-igfbp3')   || null,
          thyroidNormal:   (thyroid  === 'skip' || !thyroid)  ? null : thyroid,
          tsh:             fieldNum('epi-tsh')       || null,
          ft4:             fieldNum('epi-ft4')       || null,
          cortisolNormal:  (cortisol === 'skip' || !cortisol) ? null : cortisol,
          cortisolMorning: fieldNum('epi-cortisol')  || null,
          celiacNormal:    radioVal('celiac')         || 'not_done',
          cbcNormal:       (radioVal('cbc')    === 'skip') ? null : radioVal('cbc'),
          biochemNormal:   (radioVal('biochem') === 'skip') ? null : radioVal('biochem'),
        };
      }
    }

    if (state.step === 5) {
      if (state.profile === 'obesity') {
        /* ── Profil otyłości: brak testów GH / MRI, zbierz tylko kariotyp (opcja) + diagnozę ── */
        sa.ghTests  = null;
        sa.mri      = null;
        var karyValOb = fieldVal('epi-karyotype');
        sa.genetics = {
          karyotype:       karyValOb ? 'done' : 'not_done',
          karyotypeResult: karyValOb || null,
          shox:            null,
        };
        sa.diagnosis = radioVal('diagnosis') || 'obesity';
      } else {
        /* ── Profil niskorosłości: pełen krok 5 ── */
        var ghPer    = radioVal('gh-performed');
        var ghCtx    = radioVal('gh-context') || 'both';
        var t1TypeVal = fieldVal('epi-t1-type');
        var t1PeakVal = fieldNum('epi-t1-peak');
        var t2TypeVal = fieldVal('epi-t2-type');
        var t2PeakVal = fieldNum('epi-t2-peak');
        /* Dla second_only: test2 = ta hospitalizacja (główny); test1 = poprzednia (opcjonalny) */
        sa.ghTests = {
          performed: ghPer || null,
          context:   ghPer === 'yes' ? ghCtx : null,
          priming:   radioVal('priming') || null,
          test1: (ghPer === 'yes' && t1TypeVal && t1PeakVal != null) ? {
            type:   t1TypeVal,
            peakGh: t1PeakVal
          } : null,
          test2: (ghPer === 'yes' && t2TypeVal && t2PeakVal != null) ? {
            type:   t2TypeVal,
            peakGh: t2PeakVal
          } : null,
        };

        var mriPer = radioVal('mri-performed');
        sa.mri = {
          performed: mriPer || null,
          result:    (mriPer === 'yes') ? (fieldVal('epi-mri-result') || null) : null,
        };

        var karyVal = fieldVal('epi-karyotype');
        sa.genetics = {
          karyotype:       karyVal ? 'done' : 'not_done',
          karyotypeResult: karyVal || null,
          shox:            fieldVal('epi-shox') || null,
        };

        sa.diagnosis = radioVal('diagnosis') || null;
      }
    }
  }

  /* ── EU-3a: DOCX EXPORT ──────────────────────────────────────────────── */

  var JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  function loadJsZip(cb) {
    if (global.JSZip) { cb(null, global.JSZip); return; }
    var s = global.document.createElement('script');
    s.src = JSZIP_CDN;
    s.onload  = function () { cb(null, global.JSZip); };
    s.onerror = function () { cb(new Error('Nie udało się załadować JSZip.')); };
    global.document.head.appendChild(s);
  }

  function escXml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Buduje zawartość word/document.xml z czystego tekstu epikryzy.
   * Każda linia → oddzielny <w:p>. Puste linie → odstęp między akapitami.
   */
  function buildDocxXml(text) {
    var lines = (text || '').split(/\r?\n/);
    var paras = lines.map(function (line) {
      if (!line.trim()) {
        /* Pusta linia = mały odstęp */
        return '<w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>';
      }
      /* Sprawdź czy linia wygląda jak nagłówek sekcji (np. "WYWIAD:", "BADANIE FIZYCZNE:") */
      var isHeading = /^[A-ZŁŚŻŹĆŃÓĄĘ][A-ZŁŚŻŹĆŃÓĄĘ\s]{2,}:/.test(line);
      var rPr = isHeading
        ? '<w:rPr><w:b/><w:sz w:val="22"/><w:lang w:val="pl-PL"/></w:rPr>'
        : '<w:rPr><w:sz w:val="22"/><w:lang w:val="pl-PL"/></w:rPr>';
      var pPr = isHeading
        ? '<w:pPr><w:spacing w:before="160" w:after="40"/></w:pPr>'
        : '<w:pPr><w:spacing w:after="0" w:line="320" w:lineRule="auto"/></w:pPr>';
      return '<w:p>' + pPr +
        '<w:r>' + rPr +
        '<w:t xml:space="preserve">' + escXml(line) + '</w:t>' +
        '</w:r></w:p>';
    }).join('');

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<w:body>' +
      /* Nagłówek dokumentu */
      '<w:p>' +
        '<w:pPr><w:jc w:val="center"/><w:spacing w:after="280"/></w:pPr>' +
        '<w:r><w:rPr><w:b/><w:sz w:val="28"/><w:lang w:val="pl-PL"/></w:rPr>' +
        '<w:t>Epikryza</w:t></w:r>' +
      '</w:p>' +
      paras +
      /* Definicja strony A4 z marginesami ~2,5 cm */
      '<w:sectPr>' +
        '<w:pgSz w:w="11906" w:h="16838"/>' +
        '<w:pgMar w:top="1418" w:right="1134" w:bottom="1418" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/>' +
      '</w:sectPr>' +
      '</w:body></w:document>';
  }

  /**
   * Generuje plik .docx z tekstu epikryzy i uruchamia download.
   * @param {string}      text  Treść epikryzy (edytowana przez lekarza)
   * @param {HTMLElement} btn   Przycisk do przywrócenia po zakończeniu
   */
  function exportToDocx(text, btn) {
    loadJsZip(function (err, JSZip) {
      if (err || !JSZip) {
        alert('Nie udało się załadować biblioteki do generowania .docx.\n' +
              'Sprawdź połączenie z internetem lub skopiuj tekst ręcznie.');
        btn.textContent = 'Pobierz .docx';
        btn.disabled = false;
        return;
      }
      try {
        var zip = new JSZip();

        zip.file('[Content_Types].xml',
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml"' +
          ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '</Types>'
        );

        zip.file('_rels/.rels',
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1"' +
          ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"' +
          ' Target="word/document.xml"/>' +
          '</Relationships>'
        );

        zip.file('word/_rels/document.xml.rels',
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '</Relationships>'
        );

        zip.file('word/document.xml', buildDocxXml(text));

        zip.generateAsync({
          type: 'blob',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        }).then(function (blob) {
          var dateStr = new Date().toISOString().slice(0, 10);
          var filename = 'epikryza_' + dateStr + '.docx';
          var url = (global.URL || global.webkitURL).createObjectURL(blob);
          var a = global.document.createElement('a');
          a.href     = url;
          a.download = filename;
          global.document.body.appendChild(a);
          a.click();
          setTimeout(function () {
            try { (global.URL || global.webkitURL).revokeObjectURL(url); } catch (_) {}
            try { if (a.parentNode) a.parentNode.removeChild(a); } catch (_) {}
          }, 200);
          btn.textContent = 'Pobrano ✓';
          btn.disabled = false;
          setTimeout(function () { btn.textContent = 'Pobierz .docx'; }, 3000);
        }).catch(function (e) {
          alert('Błąd eksportu: ' + (e.message || String(e)));
          btn.textContent = 'Pobierz .docx';
          btn.disabled = false;
        });
      } catch (e) {
        alert('Błąd eksportu: ' + (e.message || String(e)));
        btn.textContent = 'Pobierz .docx';
        btn.disabled = false;
      }
    });
  }

  /* ── EU-3 cd.: GENEROWANIE I PODGLĄD WYNIKU ─────────────────────────── */

  function generateAndShow() {
    var epi = global.VildaEpicrisis;
    if (!epi || typeof epi.generate !== 'function') {
      showError('Moduł VildaEpicrisis nie jest dostępny. Upewnij się, że plik vilda_epicrisis.js jest załadowany.');
      return;
    }
    var pd = state.pd;
    var sa = buildSurveyAnswers();

    var result;
    try {
      result = epi.generate(pd, sa);
    } catch (err) {
      showError('Błąd generowania: ' + (err.message || String(err)));
      return;
    }

    state.result = result;

    var body   = document.querySelector('#' + OVERLAY_ID + ' [data-epi-body]');
    var footer = document.getElementById('epi-footer');
    if (!body || !footer) return;

    body.innerHTML = '';
    footer.innerHTML = '';

    /* Podgląd epikryzy */
    var resultWrap = el('div', '');

    var titleBar = el('div',
      'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;');
    var titleTxt = el('p',
      'font-weight:700;font-size:1rem;color:' + clr.primary + ';margin:0;flex:1 1 auto;',
      null, 'Wygenerowana epikryza');

    /* Przyciski akcji po prawej stronie tytułu */
    var btnGroup = el('div', 'display:flex;gap:8px;flex-shrink:0;align-items:center;');

    var copyBtn = el('button',
      'background:transparent;color:' + clr.primary + ';border:1.5px solid ' + clr.primary + ';' +
      'border-radius:7px;padding:6px 14px;font-weight:600;font-size:0.85rem;cursor:pointer;',
      {'type': 'button'}, 'Kopiuj tekst');

    var docxBtn = el('button',
      'background:' + gradient + ';color:#fff;border:none;' +
      'border-radius:7px;padding:6px 14px;font-weight:600;font-size:0.85rem;cursor:pointer;',
      {'type': 'button'}, 'Pobierz .docx');

    append(btnGroup, copyBtn, docxBtn);
    append(titleBar, titleTxt, btnGroup);

    var textArea = el('textarea',
      'width:100%;height:340px;padding:14px;border:1px solid ' + clr.border + ';border-radius:8px;' +
      'font-size:0.88rem;line-height:1.7;resize:vertical;box-sizing:border-box;' +
      'font-family:inherit;color:' + clr.text + ';background:#fdfdfd;outline:none;',
      {'spellcheck': 'false'}
    );
    textArea.value = result.text;

    copyBtn.addEventListener('click', function () {
      var txt = textArea.value;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () {
          copyBtn.textContent = 'Skopiowano ✓';
          setTimeout(function () { copyBtn.textContent = 'Kopiuj tekst'; }, 2000);
        });
      } else {
        textArea.select();
        document.execCommand('copy');
        copyBtn.textContent = 'Skopiowano ✓';
        setTimeout(function () { copyBtn.textContent = 'Kopiuj tekst'; }, 2000);
      }
    });

    docxBtn.addEventListener('click', function () {
      docxBtn.textContent = 'Generuję…';
      docxBtn.disabled = true;
      exportToDocx(textArea.value, docxBtn);
    });

    var hint = el('p',
      'font-size:0.8rem;color:' + clr.muted + ';margin:10px 0 0;',
      null,
      'Tekst można edytować przed skopiowaniem lub pobraniem. ' +
      'Zmiany nie są zapisywane w aplikacji.'
    );

    append(resultWrap, titleBar, textArea, hint);
    body.appendChild(resultWrap);

    /* Stopka wyniku: Zamknij + Zacznij od nowa */
    var closeBtn2 = el('button',
      'background:transparent;color:' + clr.muted + ';border:1.5px solid ' + clr.border + ';' +
      'border-radius:8px;padding:9px 20px;font-weight:600;cursor:pointer;font-size:0.9rem;',
      {'type': 'button'}, 'Zamknij');
    closeBtn2.addEventListener('click', closeModal);

    var newBtn = el('button',
      'background:' + gradient + ';color:#fff;border:none;border-radius:8px;' +
      'padding:9px 22px;font-weight:700;cursor:pointer;font-size:0.9rem;',
      {'type': 'button'}, 'Generuj ponownie');
    newBtn.addEventListener('click', function () {
      state.step    = 1;
      state.result  = null;
      var body2   = document.querySelector('#' + OVERLAY_ID + ' [data-epi-body]');
      var footer2 = document.getElementById('epi-footer');
      renderStep(body2, footer2);
    });

    append(footer, closeBtn2, newBtn);
  }

  function buildSurveyAnswers() {
    var sa = state.answers;
    var out = {};
    if (sa.reasons && sa.reasons.length) out.reasons = sa.reasons;
    if (sa.familyDelayedPuberty) out.familyDelayedPuberty = sa.familyDelayedPuberty;
    /* Birth */
    if (sa.birth) {
      var b = {};
      if (sa.birth.gestationalWeeks != null) b.gestationalWeeks = sa.birth.gestationalWeeks;
      if (sa.birth.gestationalDays  != null) b.gestationalDays  = sa.birth.gestationalDays;
      if (sa.birth.birthWeightG     != null) b.birthWeightG     = sa.birth.birthWeightG;
      if (sa.birth.birthLengthCm    != null) b.birthLengthCm    = sa.birth.birthLengthCm;
      if (sa.birth.catchUp)                  b.catchUp          = sa.birth.catchUp;

      /* Oblicz SDS urodzeniowy dla JEDNEGO wybranego źródła przez API SGA
         (window.VildaSgaBirth). Malewski → tylko masa (długość pominięta). */
      var sdsSource = sa.birth.sdsSource || 'niklasson';
      b.sdsSource = sdsSource;
      if (global.VildaSgaBirth && typeof global.VildaSgaBirth.compute === 'function' &&
          sa.birth.gestationalWeeks != null &&
          (sa.birth.birthWeightG != null || sa.birth.birthLengthCm != null)) {
        try {
          var sgaRes = global.VildaSgaBirth.compute(sdsSource, {
            sex:      state.pd.sex,
            weeks:    sa.birth.gestationalWeeks,
            days:     sa.birth.gestationalDays,
            weightG:  sa.birth.birthWeightG,
            lengthCm: sa.birth.birthLengthCm
          });
          if (sgaRes) {
            b.sdsSourceLabel  = sgaRes.sourceShortLabel || null;
            b.sdsSourceError  = sgaRes.error || null;
            b.lengthSdsAvailable = sgaRes.lengthAvailable !== false;
            if (sgaRes.weightSds != null && isFinite(sgaRes.weightSds)) b.birthWeightSds = sgaRes.weightSds;
            if (sgaRes.lengthSds != null && isFinite(sgaRes.lengthSds)) b.birthLengthSds = sgaRes.lengthSds;
          }
        } catch (_) {}
      }
      out.birth = b;
    }
    /* Clinical */
    if (sa.clinical) out.clinical = sa.clinical;
    if (sa.boneAgeMethod) out.boneAgeMethod = sa.boneAgeMethod;
    /* Labs */
    if (sa.labs) {
      var labs = {};
      Object.keys(sa.labs).forEach(function (k) {
        if (sa.labs[k] != null) labs[k] = sa.labs[k];
      });
      if (Object.keys(labs).length) out.labs = labs;
    }
    /* GH */
    if (sa.ghTests) out.ghTests = sa.ghTests;
    /* MRI */
    if (sa.mri) out.mri = sa.mri;
    /* Genetics */
    if (sa.genetics) out.genetics = sa.genetics;
    /* Diagnosis */
    if (sa.diagnosis) out.diagnosis = sa.diagnosis;
    return out;
  }

  function showError(msg) {
    var body = document.querySelector('#' + OVERLAY_ID + ' [data-epi-body]');
    if (!body) return;
    body.innerHTML = '';
    var err = el('div',
      'background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;color:#991b1b;font-size:0.9rem;',
      null, msg
    );
    body.appendChild(err);
  }

  /* ── EU-5: WSTRZYKNIĘCIE PRZYCISKU ───────────────────────────────────── */

  function injectEpicrisisButton() {
    if (document.getElementById(BTN_ID)) return;
    var wrap = document.getElementById('advReportActions');
    if (!wrap) return;

    var btn = el('button',
      'background:' + gradient + ';color:#fff;border:none;border-radius:6px;padding:0.5rem 1rem;' +
      'font-size:0.92rem;font-weight:600;cursor:pointer;margin-left:8px;transition:opacity 0.15s;',
      {'type': 'button', 'id': BTN_ID},
      'Generuj epikryzę'
    );
    btn.addEventListener('mouseenter', function () { btn.style.opacity = '0.86'; });
    btn.addEventListener('mouseleave', function () { btn.style.opacity = '1'; });
    btn.addEventListener('click', function () {
      /* PRO guard */
      if (global.VildaProAccess && typeof global.VildaProAccess.hasAccess === 'function') {
        if (!global.VildaProAccess.hasAccess()) {
          alert('Generowanie epikryzy jest funkcją PRO. Uaktywnij plan PRO, aby korzystać z tej funkcji.');
          return;
        }
      }
      openModal();
    });

    wrap.appendChild(btn);
  }

  /** Obserwuj DOM — czekaj aż #advReportActions pojawi się na stronie. */
  function watchAndInject() {
    if (document.getElementById('advReportActions')) {
      injectEpicrisisButton();
      return;
    }
    var observer = new MutationObserver(function () {
      if (document.getElementById('advReportActions')) {
        injectEpicrisisButton();
        /* Nasłuchuj ponownie przy ukrywaniu/pokazywaniu przycisku */
        observer.observe(document.body, { childList: true, subtree: true });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ── EU-6: PUBLICZNE API ─────────────────────────────────────────────── */

  global.VildaEpicrisisUI = {
    __vildaEpicrisisUI: true,
    show:   openModal,
    inject: injectEpicrisisButton,
    close:  closeModal,
  };

  /* Auto-start po załadowaniu DOM */
  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', watchAndInject);
    } else {
      watchAndInject();
    }
  }

}(typeof window !== 'undefined' ? window : this));
