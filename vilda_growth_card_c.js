/* vilda_growth_card_c.js — prezentacja prognoz wzrostu na karcie „Zaawansowane obliczenia wzrostowe”
 * w układzie „Wariant C” (wynik wiodący + rozwijane metody + cel MPH na końcu).
 *
 * Czytelny moduł (nie-minified) zgodnie z AGENTS.md §2: cała logika prezentacji i konsensusu tutaj,
 * a zminifikowany vilda_advanced_growth.js jedynie WYWOŁUJE window.VildaGrowthCardC.render(input).
 *
 * Zakres: SAMA PREZENTACJA prognoz + policzenie metody Khamisa-Roche’a (KR) z globalnego silnika
 * window.calculateKhamisRochePrediction. NIE zmienia wzorów BP/RWT/Reinehr ani MPH — bierze ich
 * gotowe wyniki. Kolejność metod STAŁA: RWT → Bayley–Pinneau → Khamis–Roche → Reinehr/CDGP, a MPH
 * (cel rodzicielski, nie prognoza) na końcu. Brakujące metody są ukrywane.
 *
 * BŁĄD KR (dana kliniczna): średni 90% przedział błędu metody wg Khamis HJ, Roche AF, Pediatrics
 * 1994;94(4 Pt 1):504–507 (PMID 7936860): ±2,1 cala (chłopcy) / ±1,7 cala (dziewczęta) →
 * ±5,3 cm / ±4,3 cm. Wartość jest ZBIORCZA (nie zależy od wieku), inaczej niż tablicowe ± dla BP/RWT.
 * Wiarygodność KR: „orientacyjna” (stała, konserwatywnie — nowa metoda, populacja Fels).
 */
(function (w) {
  'use strict';

  var STYLE_ID = 'vgcc-style';
  // Błąd KR (połówka 90% przedziału) wg płci — z pracy 1994 (±2,1/±1,7 cala → cm).
  var KR_ERR_HALFWIDTH_CM = { M: 5.3, F: 4.3 };
  // Progi zgodności metod (rozrzut max−min prognoz), spójne z modułem walidacji: ≤3 dobra, ≤6 umiarkowana.
  var AGREE_GOOD_CM = 3, AGREE_MODERATE_CM = 6;

  var CSS = [
    '.vgcc{--vgcc-brand:#00838d;--vgcc-ink:#14393d;--vgcc-muted:#5a7274;--vgcc-line:#e3ecec}',
    '.vgcc-lead{background:linear-gradient(180deg,#fff,#f4fafa);border:1px solid #00838d33;border-radius:12px;padding:.85rem;text-align:center;margin:.2rem 0 .55rem}',
    '.vgcc-lead-cap{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--vgcc-muted)}',
    '.vgcc-lead-big{font-size:1.85rem;font-weight:800;color:var(--vgcc-ink);line-height:1.05}',
    '.vgcc-lead-rng{color:var(--vgcc-muted);font-size:.86rem;margin-top:.12rem}',
    '.vgcc-lead-rng b{color:var(--vgcc-ink)}',
    '.vgcc-details{background:#fff;border:1px solid var(--vgcc-line);border-radius:10px;overflow:hidden}',
    '.vgcc-details>summary{cursor:pointer;list-style:none;padding:.55rem .75rem;font-weight:700;color:#006b73;display:flex;justify-content:space-between;align-items:center;font-size:.9rem}',
    '.vgcc-details>summary::-webkit-details-marker{display:none}',
    '.vgcc-details>summary::after{content:"\\25BE";color:var(--vgcc-muted);margin-left:.5rem}',
    '.vgcc-details[open]>summary::after{content:"\\25B4"}',
    '.vgcc-row{display:flex;align-items:center;gap:.45rem;justify-content:space-between;padding:.5rem .75rem;border-top:1px solid var(--vgcc-line);font-size:.9rem}',
    '.vgcc-row-l{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;min-width:0}',
    '.vgcc-nm{font-weight:700;color:#233}',
    '.vgcc-val{font-weight:800;color:var(--vgcc-ink);font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.vgcc-pm{color:var(--vgcc-muted);font-size:.78rem;white-space:nowrap}',
    '.vgcc-row-mph{background:#fbf6ec;border-top:1px solid #e7d8bb}',
    '.vgcc-row-mph .vgcc-nm{color:#8a4b00}',
    '.vgcc-tgt{font-size:.62rem;font-weight:800;color:#8a4b00;background:#f6e9cf;border:1px solid #e0c893;border-radius:5px;padding:.06rem .32rem}',
    '.vgcc-newtag{display:inline-block;background:var(--vgcc-brand);color:#fff;font-size:.58rem;font-weight:800;padding:.06rem .34rem;border-radius:5px}',
    '.vgcc-badge{display:inline-flex;align-items:center;justify-content:center;padding:.22rem .55rem;border-radius:999px;font-size:.72rem;font-weight:700;line-height:1.2;border:1px solid;white-space:nowrap}',
    '.vgcc-badge.is-high{background:#00838d1f;border-color:#00838d42;color:#0a5157}',
    '.vgcc-badge.is-moderate{background:#00838d14;border-color:#00838d33;color:#0a5157}',
    '.vgcc-badge.is-lowered{background:#c75d001f;border-color:#c75d003d;color:#8a4b00}',
    '.vgcc-badge.is-low{background:#c628281a;border-color:#c628283d;color:#c62828}',
    '.vgcc-badge.is-indicative{background:#5a6f701a;border-color:#5a6f7033;color:#445758}',
    '.vgcc-hint{font-size:.78rem;color:var(--vgcc-muted);padding:.45rem .75rem;border-top:1px dashed #d0dede;background:#fafcfc}',
    '.vgcc-fn{font-size:.72rem;color:var(--vgcc-muted);margin:.4rem .1rem 0}',
    '.vgcc-disc{margin-top:.55rem;padding:.6rem .8rem;border-radius:12px;border:1px solid rgba(199,93,0,.22);background:linear-gradient(180deg,#fff9f0,#fff5e6);color:#6d4a11;font-size:.78rem}',
    '.vgcc-empty{padding:.7rem;text-align:center;color:var(--vgcc-muted);font-size:.9rem}'
  ].join('');

  function ensureStyle() {
    try {
      if (typeof document === 'undefined' || !document.getElementById) return;
      if (document.getElementById(STYLE_ID)) return;
      var st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = CSS;
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

  // levelKey (z modułu wiarygodności) → etykieta PL + klasa CSS.
  function levelLabel(k) {
    switch (String(k || '')) {
      case 'high': return 'wysoka';
      case 'moderate': return 'umiarkowana';
      case 'lowered': return 'obniżona';
      case 'low': return 'niska';
      default: return 'orientacyjna';
    }
  }
  function levelClass(k) {
    switch (String(k || '')) {
      case 'high': return 'is-high';
      case 'moderate': return 'is-moderate';
      case 'lowered': return 'is-lowered';
      case 'low': return 'is-low';
      default: return 'is-indicative';
    }
  }
  function sexLabel(sex) {
    var s = String(sex || '').trim().toUpperCase();
    return (s === 'F' || s === 'K') ? 'dziewczynka' : 'chłopiec';
  }
  function sexKey(sex) {
    var s = String(sex || '').trim().toUpperCase();
    return (s === 'F' || s === 'K') ? 'F' : 'M';
  }

  // Odczyt levelKey danej metody z modelu wiarygodności (Ht → entryMap[methodKey].levelKey).
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

  // Konsensus prognoz: mediana, zakres (min–max) i zgodność (rozrzut).
  function consensus(values) {
    var v = (values || []).map(num).filter(function (x) { return x !== null; }).sort(function (a, b) { return a - b; });
    if (!v.length) return { count: 0, median: null, min: null, max: null, spread: null, agreementKey: null, agreementLabel: null };
    var n = v.length;
    var median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
    var min = v[0], max = v[n - 1], spread = max - min;
    var agreementKey = spread <= AGREE_GOOD_CM ? 'dobra' : (spread <= AGREE_MODERATE_CM ? 'umiarkowana' : 'niska');
    return { count: n, median: median, min: min, max: max, spread: spread, agreementKey: agreementKey, agreementLabel: agreementKey };
  }

  // Buduje uporządkowaną listę dostępnych metod (STAŁA kolejność) + policza KR.
  function buildModel(input) {
    input = input || {};
    var sk = sexKey(input.sex);
    var entries = [];

    // 1. RWT
    (function () {
      var val = predValue(input.rwt);
      if (val === null) return;
      entries.push({ key: 'rwt', label: 'RWT', value: val, pm: num(input.rwt.errorBoundHalfWidthCm),
        levelKey: levelFor(input.reliabilityModel, 'rwt') || 'moderate' });
    })();
    // 2. Bayley–Pinneau
    (function () {
      var val = predValue(input.bp);
      if (val === null) return;
      entries.push({ key: 'bp', label: 'Bayley–Pinneau', value: val, pm: num(input.bp.errorBoundHalfWidthCm),
        levelKey: levelFor(input.reliabilityModel, 'bayleyPinneau') || 'moderate' });
    })();
    // 3. Khamis–Roche — policz z globalnego silnika (jeśli obecny)
    var khamisComputed = null;
    (function () {
      var engine = w.calculateKhamisRochePrediction;
      if (typeof engine !== 'function') return;
      var r;
      try {
        r = engine({
          sex: input.sex,
          chronologicalAgeYears: input.ageYears,
          chronologicalAgeMonths: input.ageMonths,
          currentHeightCm: input.currentHeightCm,
          currentWeightKg: input.currentWeightKg,
          motherHeightCm: input.motherHeightCm,
          fatherHeightCm: input.fatherHeightCm
        });
      } catch (_) { r = null; }
      khamisComputed = r;
      var val = predValue(r);
      if (val === null) return;
      entries.push({ key: 'khamis', label: 'Khamis–Roche', value: val, pm: KR_ERR_HALFWIDTH_CM[sk],
        levelKey: 'indicative', isNew: true, note: 'bez WK' });
    })();
    // 4. Reinehr/CDGP
    (function () {
      var val = predValue(input.reinehr);
      if (val === null) return;
      entries.push({ key: 'reinehr', label: 'Reinehr/CDGP', value: val, pm: num(input.reinehr.errorBoundHalfWidthCm),
        levelKey: levelFor(input.reliabilityModel, 'reinehr') || 'indicative' });
    })();

    var con = consensus(entries.map(function (e) { return e.value; }));
    var mphCm = num(input.mphCm);
    var mphCentileText = input.mphCentileText != null ? String(input.mphCentileText) : '';

    // Podpowiedź o wieku kostnym: gdy go brak, a metody bez KR nie policzyły się.
    var boneAgeMissing = num(input.boneAgeYears) === null;
    var missingBoneMethods = boneAgeMissing && entries.some(function (e) { return e.key === 'khamis'; }) &&
      !entries.some(function (e) { return e.key === 'bp'; });

    return {
      sexKey: sk,
      subhead: input.subheadHtml || '',
      entries: entries,
      consensus: con,
      mph: mphCm !== null ? { cm: mphCm, centileText: mphCentileText } : null,
      hasKhamis: entries.some(function (e) { return e.key === 'khamis'; }),
      khamisComputed: khamisComputed,
      showBoneAgeHint: missingBoneMethods,
      // Tekst ostrzeżenia bierzemy z aplikacji (Hn / profil), nie dublujemy słów w kodzie.
      disclaimerText: input.disclaimerText != null ? String(input.disclaimerText) : '',
      // Podsumowanie profilu (KOWD-like/CDGP-like) z aplikacji — zachowujemy jako kontekst kliniczny.
      profileSummaryHtml: input.profileSummaryHtml != null ? String(input.profileSummaryHtml) : ''
    };
  }

  function badge(levelKey) {
    return '<span class="vgcc-badge ' + levelClass(levelKey) + '">' + esc(levelLabel(levelKey)) + '</span>';
  }

  function methodRow(e) {
    var right = '<span class="vgcc-val">' + esc(fmt1(e.value)) + ' cm</span>';
    if (e.pm !== null && e.pm !== undefined) {
      right += ' <span class="vgcc-pm">±' + esc(fmt1(e.pm)) + (e.key === 'khamis' ? '<sup>*</sup>' : '') + '</span>';
    } else if (e.note) {
      right += ' <span class="vgcc-pm">' + esc(e.note) + '</span>';
    }
    var left = '<span class="vgcc-nm">' + esc(e.label) + '</span>';
    if (e.isNew) left += ' <span class="vgcc-newtag">NOWA</span>';
    left += ' ' + badge(e.levelKey);
    return '<div class="vgcc-row"><div class="vgcc-row-l">' + left + '</div><div>' + right + '</div></div>';
  }

  function mphRow(mph) {
    var right = '<span class="vgcc-val">' + esc(fmt1(mph.cm)) + ' cm</span>';
    if (mph.centileText) right += ' <span class="vgcc-pm">' + esc(mph.centileText) + '</span>';
    return '<div class="vgcc-row vgcc-row-mph"><div class="vgcc-row-l"><span class="vgcc-nm">MPH</span> ' +
      '<span class="vgcc-tgt">CEL RODZICIELSKI</span></div><div>' + right + '</div></div>';
  }

  function leadHtml(model) {
    var c = model.consensus;
    if (c.count >= 2) {
      var rng = '<b>' + esc(fmt1(c.min)) + '–' + esc(fmt1(c.max)) + ' cm</b> · zgodność <b>' + esc(c.agreementLabel) + '</b>' +
        (c.spread !== null ? ' (' + esc(fmt1(c.spread)) + ' cm)' : '');
      return '<div class="vgcc-lead"><div class="vgcc-lead-cap">Konsensus ' + c.count + ' metod</div>' +
        '<div class="vgcc-lead-big">≈ ' + esc(fmt0(c.median)) + ' cm</div>' +
        '<div class="vgcc-lead-rng">' + rng + '</div></div>';
    }
    if (c.count === 1) {
      var e = model.entries[0];
      var sub = (e.pm !== null && e.pm !== undefined ? '±' + esc(fmt1(e.pm)) + ' cm (90%) · ' : '') + esc(levelLabel(e.levelKey));
      return '<div class="vgcc-lead"><div class="vgcc-lead-cap">' + esc(e.label) +
        ' — jedyna dostępna metoda</div>' +
        '<div class="vgcc-lead-big">≈ ' + esc(fmt0(e.value)) + ' cm</div>' +
        '<div class="vgcc-lead-rng">' + sub + '</div></div>';
    }
    return '<div class="vgcc-lead"><div class="vgcc-empty">Uzupełnij dane (wzrost, masę, wzrost rodziców, wiek kostny), aby policzyć prognozę.</div></div>';
  }

  function detailsHtml(model) {
    var count = model.entries.length;
    var rows = model.entries.map(methodRow).join('');
    if (model.mph) rows += mphRow(model.mph);
    if (model.showBoneAgeHint) {
      rows += '<div class="vgcc-hint">Bayley–Pinneau, RWT i Reinehr wymagają <b>wieku kostnego</b> — uzupełnij, aby je zobaczyć.</div>';
    }
    var summary = 'Metody szczegółowo (' + count + ')' + (model.mph ? ' + cel MPH' : '');
    return '<details class="vgcc-details" open><summary>' + esc(summary) + '</summary>' + rows + '</details>';
  }

  function footnoteHtml(model) {
    if (!model.hasKhamis) return '';
    return '<p class="vgcc-fn"><sup>*</sup> Khamis–Roche: średni 90% przedział błędu metody ' +
      '(±5,3 cm chłopcy / ±4,3 cm dziewczęta; Khamis–Roche 1994), nie zależy od wieku ' +
      '— inaczej niż tablicowe ± dla BP/RWT. Liczy się bez wieku kostnego.</p>';
  }

  function disclaimerBlock(model) {
    var base = model.disclaimerText ? esc(model.disclaimerText) : '';
    var kr = model.hasKhamis ? ' Khamis–Roche: populacja Fels (białe dzieci USA), bez wieku kostnego — najsłabsza dla nietypowego wzrostu.' : '';
    if (!base && !kr) return '';
    return '<div class="vgcc-disc"><strong>Uwaga ogólna:</strong> ' + base + esc(kr) + '</div>';
  }

  function render(input) {
    ensureStyle();
    var model;
    try { model = buildModel(input); } catch (_) { model = null; }
    if (!model) return '';
    var html = '<div class="vgcc">' + leadHtml(model) + detailsHtml(model) + footnoteHtml(model);
    if (model.profileSummaryHtml) html += '<div class="vgcc-fn">' + model.profileSummaryHtml + '</div>';
    html += disclaimerBlock(model);
    html += '</div>';
    return html;
  }

  w.VildaGrowthCardC = {
    version: '1',
    KR_ERR_HALFWIDTH_CM: KR_ERR_HALFWIDTH_CM,
    render: render,
    _buildModel: buildModel,
    _consensus: consensus,
    _levelLabel: levelLabel,
    _levelClass: levelClass,
    _esc: esc,
    _sexKey: sexKey,
    _sexLabel: sexLabel
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
