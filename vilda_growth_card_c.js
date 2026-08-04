/* vilda_growth_card_c.js — prezentacja prognoz wzrostu na karcie „Zaawansowane obliczenia wzrostowe”.
 * Uklad „B (clean)”: duza liczba wiodaca + lista metod z przedzialem ±, cel MPH, kafel tempa
 * wzrastania, a reszta (wiarygodnosc slownie, profil/dobor modelu, nota KR) w rozwijanych „Szczegolach”.
 *
 * Czytelny modul (nie-minified) wg AGENTS.md §2: cala logika prezentacji tutaj; zminifikowany
 * vilda_advanced_growth.js jedynie WYWOLUJE window.VildaGrowthCardC.render(input).
 *
 * Zakres: SAMA PREZENTACJA + policzenie KR z window.calculateKhamisRochePrediction. NIE zmienia wzorow
 * BP/RWT/Reinehr/MPH. Kolejnosc STALA: RWT → BP → KR → Reinehr; MPH (cel, nie prognoza) na koncu listy.
 * Brakujace metody ukrywane. BEZ pastylek „NOWA”/wiarygodnosci i bez „Uwagi ogolnej” (decyzja wlasciciela).
 *
 * BLAD KR: sredni 90% przedzial bledu metody (Khamis HJ, Roche AF, Pediatrics 1994;94(4 Pt 1):504-507,
 * PMID 7936860): ±2,1 cala (chlopcy) / ±1,7 cala (dziewczeta) → ±5,3 cm / ±4,3 cm. Zbiorczy (nie per wiek).
 */
(function (w) {
  'use strict';

  var STYLE_ID = 'vgcc-style';
  var KR_ERR_HALFWIDTH_CM = { M: 5.3, F: 4.3 };
  var AGREE_GOOD_CM = 3, AGREE_MODERATE_CM = 6;

  var CSS = [
    '.vgcc{--vgcc-brand:#00838d;--vgcc-ink:#14393d;--vgcc-muted:#5a7274;--vgcc-line:#e3ecec}',
    '.vgcc-hero{background:linear-gradient(180deg,#fff,#f4fafa);border:1px solid #00838d33;border-radius:12px;padding:.8rem;text-align:center;margin:.15rem 0 .55rem}',
    '.vgcc-hero-cap{font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:var(--vgcc-muted)}',
    '.vgcc-hero-big{font-size:2rem;font-weight:800;color:var(--vgcc-ink);line-height:1.05}',
    '.vgcc-hero-sub{color:var(--vgcc-muted);font-size:.85rem;margin-top:.12rem}',
    '.vgcc-hero-sub b{color:var(--vgcc-ink)}',
    '.vgcc-methods{background:#fff;border:1px solid var(--vgcc-line);border-radius:9px;padding:.1rem .6rem;margin-bottom:.5rem}',
    '.vgcc-row{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.42rem .1rem;border-top:1px solid var(--vgcc-line);font-size:.9rem}',
    '.vgcc-row:first-child{border-top:0}',
    '.vgcc-nm{font-weight:700;color:#233}',
    '.vgcc-val{font-weight:800;color:var(--vgcc-ink);font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.vgcc-pm{color:var(--vgcc-muted);font-size:.78rem;white-space:nowrap}',
    '.vgcc-mph{display:flex;align-items:center;gap:.4rem;justify-content:center;background:#fbf6ec;border:1px solid #e7d8bb;border-radius:9px;padding:.4rem .6rem;margin:.1rem 0 .5rem;font-size:.84rem;color:#6d4a11}',
    '.vgcc-mph b{color:#8a4b00}',
    '.vgcc-stats{display:flex;gap:.5rem;margin:.15rem 0 .5rem}',
    '.vgcc-stat{flex:1;background:#fff;border:1px solid var(--vgcc-line);border-radius:9px;padding:.45rem .5rem;text-align:center}',
    '.vgcc-stat .k{font-size:.64rem;text-transform:uppercase;letter-spacing:.03em;color:var(--vgcc-muted)}',
    '.vgcc-stat .v{font-weight:800;color:var(--vgcc-ink);font-variant-numeric:tabular-nums;font-size:1rem}',
    '.vgcc-stat .u{font-size:.66rem;color:var(--vgcc-muted)}',
    '.vgcc-hint{font-size:.78rem;color:var(--vgcc-muted);margin:.3rem 0 .4rem}',
    '.vgcc-det{background:#fff;border:1px solid var(--vgcc-line);border-radius:9px;margin-top:.1rem}',
    '.vgcc-det>summary{cursor:pointer;list-style:none;padding:.5rem .7rem;font-weight:700;color:#006b73;display:flex;justify-content:space-between;align-items:center;font-size:.84rem}',
    '.vgcc-det>summary::-webkit-details-marker{display:none}',
    '.vgcc-det>summary::after{content:"\\25BE";color:var(--vgcc-muted);margin-left:.5rem}',
    '.vgcc-det[open]>summary::after{content:"\\25B4"}',
    '.vgcc-det-body{padding:.15rem .7rem .6rem;font-size:.8rem;color:#445}',
    '.vgcc-det-body p{margin:.35rem 0}',
    '.vgcc-lbl{color:var(--vgcc-muted)}',
    '.vgcc-empty{padding:.7rem;text-align:center;color:var(--vgcc-muted);font-size:.9rem}'
  ].join('');

  function ensureStyle() {
    try {
      if (typeof document === 'undefined' || !document.getElementById) return;
      if (document.getElementById(STYLE_ID)) return;
      var st = document.createElement('style');
      st.id = STYLE_ID; st.textContent = CSS;
      (document.head || document.documentElement).appendChild(st);
    } catch (_) { /* noop */ }
  }

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : Number(v);
    return isFinite(n) ? n : null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function fmt1(v) { var n = num(v); return n === null ? '' : n.toFixed(1).replace('.', ','); }
  function fmt0(v) { var n = num(v); return n === null ? '' : String(Math.round(n)); }

  function levelLabel(k) {
    switch (String(k || '')) {
      case 'high': return 'wysoka';
      case 'moderate': return 'umiarkowana';
      case 'lowered': return 'obniżona';
      case 'low': return 'niska';
      default: return 'orientacyjna';
    }
  }
  function sexKey(sex) {
    var s = String(sex || '').trim().toUpperCase();
    return (s === 'F' || s === 'K') ? 'F' : 'M';
  }
  function levelFor(reliabilityModel, methodKey) {
    if (!reliabilityModel) return null;
    var map = reliabilityModel.entryMap || null;
    if (map && map[methodKey] && map[methodKey].levelKey) return map[methodKey].levelKey;
    var entries = reliabilityModel.entries;
    if (Array.isArray(entries)) {
      for (var i = 0; i < entries.length; i++) if (entries[i] && entries[i].methodKey === methodKey) return entries[i].levelKey;
    }
    return null;
  }
  function predValue(result) {
    if (!result || typeof result !== 'object' || result.available !== true) return null;
    return num(result.predictedAdultHeightCm);
  }

  function consensus(values) {
    var v = (values || []).map(num).filter(function (x) { return x !== null; }).sort(function (a, b) { return a - b; });
    if (!v.length) return { count: 0, median: null, min: null, max: null, spread: null, agreementLabel: null };
    var n = v.length;
    var median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
    var min = v[0], max = v[n - 1], spread = max - min;
    var agreementLabel = spread <= AGREE_GOOD_CM ? 'dobra' : (spread <= AGREE_MODERATE_CM ? 'umiarkowana' : 'niska');
    return { count: n, median: median, min: min, max: max, spread: spread, agreementLabel: agreementLabel };
  }

  function buildModel(input) {
    input = input || {};
    var sk = sexKey(input.sex);
    var rm = input.reliabilityModel || null;
    var entries = [];

    function add(key, label, result, pm) {
      var val = predValue(result);
      if (val === null) return;
      entries.push({ key: key, label: label, value: val, pm: pm, levelKey: null });
    }
    // 1. RWT  2. Bayley-Pinneau  3. Khamis-Roche  4. Reinehr/CDGP
    add('rwt', 'RWT', input.rwt, num(input.rwt && input.rwt.errorBoundHalfWidthCm));
    if (entries.length) entries[entries.length - 1].levelKey = levelFor(rm, 'rwt') || 'moderate';
    add('bp', 'Bayley–Pinneau', input.bp, num(input.bp && input.bp.errorBoundHalfWidthCm));
    (function () {
      var e = entries[entries.length - 1];
      if (e && e.key === 'bp') e.levelKey = levelFor(rm, 'bayleyPinneau') || 'moderate';
    })();
    (function () {
      var engine = w.calculateKhamisRochePrediction;
      if (typeof engine !== 'function') return;
      var r;
      try {
        r = engine({ sex: input.sex, chronologicalAgeYears: input.ageYears, chronologicalAgeMonths: input.ageMonths,
          currentHeightCm: input.currentHeightCm, currentWeightKg: input.currentWeightKg,
          motherHeightCm: input.motherHeightCm, fatherHeightCm: input.fatherHeightCm });
      } catch (_) { r = null; }
      var val = predValue(r);
      if (val === null) return;
      entries.push({ key: 'khamis', label: 'Khamis–Roche', value: val, pm: KR_ERR_HALFWIDTH_CM[sk], levelKey: 'indicative', noBoneAge: true });
    })();
    add('reinehr', 'Reinehr/CDGP', input.reinehr, num(input.reinehr && input.reinehr.errorBoundHalfWidthCm));
    (function () {
      var e = entries[entries.length - 1];
      if (e && e.key === 'reinehr') e.levelKey = levelFor(rm, 'reinehr') || 'indicative';
    })();

    var con = consensus(entries.map(function (e) { return e.value; }));
    var mphCm = num(input.mphCm);
    var boneAgeMissing = num(input.boneAgeYears) === null;

    return {
      sexKey: sk,
      entries: entries,
      consensus: con,
      mph: mphCm !== null ? { cm: mphCm, centileText: input.mphCentileText != null ? String(input.mphCentileText) : '' } : null,
      tempo: num(input.growthVelocityCmPerYear) !== null ? { cm: num(input.growthVelocityCmPerYear), context: input.growthVelocityContext != null ? String(input.growthVelocityContext) : '' } : null,
      hasKhamis: entries.some(function (e) { return e.key === 'khamis'; }),
      boneAgeMissing: boneAgeMissing,
      showBoneAgeHint: boneAgeMissing && entries.some(function (e) { return e.key === 'khamis'; }) && !entries.some(function (e) { return e.key === 'bp'; }),
      profileStatus: rm && rm.profileStatusLabel ? String(rm.profileStatusLabel) : '',
      profileSummary: rm && rm.profileSummaryText ? String(rm.profileSummaryText) : ''
    };
  }

  function heroHtml(model) {
    var c = model.consensus;
    if (c.count >= 2) {
      return '<div class="vgcc-hero"><div class="vgcc-hero-cap">Konsensus ' + c.count + ' metod</div>' +
        '<div class="vgcc-hero-big">≈ ' + esc(fmt0(c.median)) + ' cm</div>' +
        '<div class="vgcc-hero-sub"><b>' + esc(fmt1(c.min)) + '–' + esc(fmt1(c.max)) + ' cm</b> · zgodność ' + esc(c.agreementLabel) + '</div></div>';
    }
    if (c.count === 1) {
      var e = model.entries[0];
      var sub = (e.pm !== null && e.pm !== undefined ? '±' + esc(fmt1(e.pm)) + ' cm' : '') +
        (model.boneAgeMissing ? (e.pm != null ? ' · ' : '') + '<b>bez wieku kostnego</b>' : '');
      return '<div class="vgcc-hero"><div class="vgcc-hero-cap">' + esc(e.label) + '</div>' +
        '<div class="vgcc-hero-big">≈ ' + esc(fmt0(e.value)) + ' cm</div>' +
        '<div class="vgcc-hero-sub">' + sub + '</div></div>';
    }
    return '<div class="vgcc-hero"><div class="vgcc-empty">Uzupełnij dane (wzrost, masę, wzrost rodziców, wiek kostny), aby policzyć prognozę.</div></div>';
  }

  function methodsHtml(model) {
    if (model.consensus.count < 2) return ''; // dla 1 metody hero wystarcza
    var rows = model.entries.map(function (e) {
      var right = '<span class="vgcc-val">' + esc(fmt1(e.value)) + ' cm</span>' +
        (e.pm !== null && e.pm !== undefined ? ' <span class="vgcc-pm">±' + esc(fmt1(e.pm)) + '</span>' : '');
      return '<div class="vgcc-row"><span class="vgcc-nm">' + esc(e.label) + '</span><span>' + right + '</span></div>';
    }).join('');
    return '<div class="vgcc-methods">' + rows + '</div>';
  }

  function mphHtml(model) {
    if (!model.mph) return '';
    var c = model.mph.centileText ? ' <span class="vgcc-pm">' + esc(model.mph.centileText) + '</span>' : '';
    return '<div class="vgcc-mph">🎯 Cel rodzicielski (MPH): <b>' + esc(fmt1(model.mph.cm)) + ' cm</b>' + c + '</div>';
  }

  function statsHtml(model) {
    if (!model.tempo) return '';
    var ctx = model.tempo.context ? '<div class="u">' + esc(model.tempo.context) + '</div>' : '<div class="u">cm/rok</div>';
    return '<div class="vgcc-stats"><div class="vgcc-stat"><div class="k">Tempo wzrastania</div>' +
      '<div class="v">' + esc(fmt1(model.tempo.cm)) + '</div>' + ctx + '</div></div>';
  }

  function detailsHtml(model) {
    var parts = [];
    if (model.entries.length) {
      var rel = model.entries.map(function (e) { return esc(e.label) + ' ' + esc(levelLabel(e.levelKey)); }).join(' · ');
      parts.push('<p><span class="vgcc-lbl">Wiarygodność:</span> ' + rel + '</p>');
    }
    if (model.profileStatus || model.profileSummary) {
      parts.push('<p><span class="vgcc-lbl">Profil predykcyjny:</span> ' + esc(model.profileStatus || '') +
        (model.profileSummary ? '. ' + esc(model.profileSummary) : '') + '</p>');
    }
    if (model.hasKhamis) {
      parts.push('<p><span class="vgcc-lbl">Khamis–Roche:</span> błąd zbiorczy 90% metody (±5,3 cm chłopcy / ±4,3 cm dziewczęta; Khamis–Roche 1994), nie zależy od wieku; liczy się bez wieku kostnego, populacja Fels (białe dzieci USA).</p>');
    }
    if (!parts.length) return '';
    return '<details class="vgcc-det"><summary>Szczegóły i wiarygodność</summary><div class="vgcc-det-body">' + parts.join('') + '</div></details>';
  }

  function render(input) {
    ensureStyle();
    var model;
    try { model = buildModel(input); } catch (_) { model = null; }
    if (!model) return '';
    var html = '<div class="vgcc">' + heroHtml(model) + methodsHtml(model) + mphHtml(model) + statsHtml(model);
    if (model.showBoneAgeHint) html += '<p class="vgcc-hint">Bayley–Pinneau, RWT i Reinehr wymagają wieku kostnego — uzupełnij, aby je zobaczyć.</p>';
    html += detailsHtml(model);
    html += '</div>';
    return html;
  }

  w.VildaGrowthCardC = {
    version: '2',
    KR_ERR_HALFWIDTH_CM: KR_ERR_HALFWIDTH_CM,
    render: render,
    _buildModel: buildModel,
    _consensus: consensus,
    _levelLabel: levelLabel,
    _esc: esc,
    _sexKey: sexKey
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
