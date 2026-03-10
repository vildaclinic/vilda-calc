/* hypertension_therapy.js
 * Moduł: Leczenie nadciśnienia — dorośli (ESC 2024) + pediatria (dzieci i młodzież)
 * - Na podstawie danych z karty „Dane użytkownika” (wiek) oraz wprowadzonych wartości BP
 * - Proponuje schemat terapii (monoterapia vs terapia skojarzona 2/3 lekami) zgodnie z algorytmem
 * - Generuje podsumowanie postępowania wg ESC 2024 (bez dawek; z przykładami substancji czynnych)
 * - Dla pacjentów <18 rż: generuje część pediatryczną (klasyfikacja RR wg wartości centylowych oraz zalecenia diagnostyczno‑terapeutyczne)
 * - Przykłady zawierają także nazwy handlowe dostępne w Polsce (lista przykładowa; weryfikuj dostępność w aktualnym RPL/ChPL)
 * - (Przycisk kopiowania zaleceń może być ukryty w HTML — funkcja pozostawiona na później)
 *
 * UWAGA: Moduł ma charakter edukacyjny. Dobór leku i dawki zawsze wg obrazu klinicznego i ChPL.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function safeNumber(v) {
    const raw = String(v ?? '').replace(',', '.').trim();
    if (raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getUserContext() {
    const ageYearsBase = safeNumber($('age')?.value);
    const ageMonthsExtra = safeNumber($('ageMonths')?.value);
    const sex = ($('sex')?.value || '').toUpperCase(); // 'M' / 'F'

    // Wiek z części „Dane użytkownika” jest podawany jako lata + (opcjonalnie) dodatkowe miesiące.
    // Dla obliczeń pediatrycznych używamy wieku w latach z częścią ułamkową.
    const ageYears = (ageYearsBase != null)
      ? (ageYearsBase + ((ageMonthsExtra != null ? ageMonthsExtra : 0) / 12))
      : null;

    const ageMonthsTotal = (ageYearsBase != null)
      ? (ageYearsBase * 12 + (ageMonthsExtra != null ? ageMonthsExtra : 0))
      : null;

    const weightKg = safeNumber($('weight')?.value);
    const heightCm = safeNumber($('height')?.value);

    let bmi = null;
    if (weightKg != null && heightCm != null && heightCm > 0) {
      const hM = heightCm / 100;
      bmi = weightKg / (hM * hM);
    }

    return {
      sex: (sex === 'M' || sex === 'F') ? sex : null,
      ageYears,
      ageYearsBase,
      ageMonthsExtra,
      ageMonthsTotal,
      weightKg,
      heightCm,
      bmi,
    };
  }

  /** Kategoryzacja BP wg tabeli w wytycznych ESC 2024 (Kardiologia Polska 2-3/2024):
   * - Niepodwyższone: SBP <120 i DBP <70
   * - Podwyższone: SBP 120–139 i/lub DBP 70–89
   * - Nadciśnienie: SBP >=140 i/lub DBP >=90
   */
  function classifyBp(sbp, dbp) {
    if (sbp == null || dbp == null) return { key: 'unknown', label: 'Brak danych', color: '#444' };

    if (sbp >= 140 || dbp >= 90) return { key: 'hypertension', label: 'Nadciśnienie (≥140/90)', color: '#8a1f11' };
    if (sbp < 120 && dbp < 70) return { key: 'normal', label: 'Niepodwyższone BP (<120/70)', color: '#1f5f2a' };
    return { key: 'elevated', label: 'Podwyższone BP (120/70–139/89)', color: '#7a5a00' };
  }

  function isBp130_80Plus(sbp, dbp) {
    if (sbp == null || dbp == null) return false;
    return (sbp >= 130) || (dbp >= 80);
  }

  // ===== PEDIATRIA: narzędzia do klasyfikacji RR na podstawie wieku / płci / wzrostu =====

  // Model obliczania centyli RR oparty o wielomian (wiek-10) i z-score wzrostu.
  // Wartości współczynników zostały zestawione w pracy opisującej wyprowadzanie centyli RR u dzieci.
  // (W module używane do oszacowania P90/P95/P99 oraz percentyla dla podanego pomiaru).
  const PED_BP_COEFS = {
    // Chłopcy
    M: {
      sbp: {
        intercept: 103.88965,
        a1: 1.71846,
        a2: 0.11811,
        a3: -0.00064,
        a4: -0.00144,
        h1: 1.25749,
        h2: 0.06251,
        h3: -0.02104,
        h4: 0.00952,
        sigma: 9.64402,
      },
      dbp: {
        intercept: 62.26646,
        a1: 0.74699,
        a2: -0.01614,
        a3: -0.00146,
        a4: 0.00093,
        h1: 0.23818,
        h2: 0,
        h3: 0.00714,
        h4: 0.00540,
        sigma: 11.00126,
      },
    },
    // Dziewczęta
    F: {
      sbp: {
        intercept: 104.04188,
        a1: 1.65051,
        a2: -0.00118,
        a3: -0.00691,
        a4: 0.00104,
        h1: 1.15931,
        h2: 0,
        h3: 0.00188,
        h4: 0.01146,
        sigma: 9.63113,
      },
      dbp: {
        intercept: 62.46709,
        a1: 0.79915,
        a2: -0.00742,
        a3: -0.00249,
        a4: 0.00078,
        h1: 0.28437,
        h2: 0,
        h3: -0.00675,
        h4: 0.00716,
        sigma: 10.20142,
      },
    },
  };

  function hasPedsMathHelpers() {
    return (typeof normalCDF === 'function' && typeof normInv === 'function');
  }

  function clamp(v, lo, hi) {
    if (v == null) return v;
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function fmtAge(ctx) {
    if (ctx.ageYearsBase == null) return 'brak danych';
    const y = ctx.ageYearsBase;
    const m = (ctx.ageMonthsExtra != null) ? ctx.ageMonthsExtra : 0;
    if (!m) return `${y} lat`;
    return `${y} lat ${m} mies.`;
  }

  function tryCalcHeightStats(ctx) {
    // W aplikacji istnieją funkcje centylowe (Palczewska/OLAF/WHO) — używamy ich, jeśli są dostępne.
    // W razie braku funkcji: zwracamy null i w dalszych obliczeniach przyjmujemy Height‑Z=0 (50 centyl).
    try {
      if (!ctx || ctx.heightCm == null || ctx.ageYears == null || !ctx.sex) return null;
      if (typeof calcPercentileStatsPal === 'function') {
        return calcPercentileStatsPal(ctx.heightCm, ctx.sex, ctx.ageYears, 'HT');
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function tryCalcBmiStats(ctx) {
    try {
      if (!ctx || ctx.bmi == null || ctx.ageYears == null || !ctx.sex) return null;
      if (typeof calcPercentileStatsPal === 'function') {
        return calcPercentileStatsPal(ctx.bmi, ctx.sex, ctx.ageYears, 'BMI');
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function pediatricBpMeanSigma(ageYears, sex, heightZ, type) {
    const sexKey = (sex === 'M' || sex === 'F') ? sex : null;
    if (!sexKey) return null;
    const cfg = PED_BP_COEFS?.[sexKey]?.[type];
    if (!cfg) return null;

    const age = ageYears;
    const a = (age != null) ? (age - 10) : null;
    if (a == null) return null;

    const z = (heightZ != null && Number.isFinite(heightZ)) ? heightZ : 0;

    const a2 = a * a;
    const a3 = a2 * a;
    const a4 = a2 * a2;
    const z2 = z * z;
    const z3 = z2 * z;
    const z4 = z2 * z2;

    const mu =
      cfg.intercept +
      cfg.a1 * a +
      cfg.a2 * a2 +
      cfg.a3 * a3 +
      cfg.a4 * a4 +
      cfg.h1 * z +
      (cfg.h2 || 0) * z2 +
      (cfg.h3 || 0) * z3 +
      (cfg.h4 || 0) * z4;

    return { mu, sigma: cfg.sigma };
  }

  function pediatricBpPercentiles(ageYears, sex, heightZ) {
    if (ageYears == null || !sex || !hasPedsMathHelpers()) return null;

    // Zakres modelu w literaturze obejmuje wiek szkolny i nastolatki.
    // Dla skrajnych wieków obliczenia traktujemy jako orientacyjne.
    const age = clamp(ageYears, 1, 17);

    const sbp = pediatricBpMeanSigma(age, sex, heightZ, 'sbp');
    const dbp = pediatricBpMeanSigma(age, sex, heightZ, 'dbp');
    if (!sbp || !dbp) return null;

    const z90 = normInv(0.90);
    const z95 = normInv(0.95);
    const z99 = normInv(0.99);

    const out = {
      sbpMu: sbp.mu,
      sbpSigma: sbp.sigma,
      dbpMu: dbp.mu,
      dbpSigma: dbp.sigma,
      sbp90: sbp.mu + z90 * sbp.sigma,
      sbp95: sbp.mu + z95 * sbp.sigma,
      sbp99: sbp.mu + z99 * sbp.sigma,
      dbp90: dbp.mu + z90 * dbp.sigma,
      dbp95: dbp.mu + z95 * dbp.sigma,
      dbp99: dbp.mu + z99 * dbp.sigma,
    };

    return out;
  }

  function pediatricBpPercentileForValue(value, mu, sigma) {
    if (!hasPedsMathHelpers() || value == null || mu == null || sigma == null) return null;
    const z = (value - mu) / sigma;
    return normalCDF(z) * 100;
  }

  function classifyPediatricEsh(sbp, dbp, p) {
    if (!p || sbp == null || dbp == null) {
      return { key: 'unknown', label: 'Brak danych do klasyfikacji pediatrycznej', color: '#444' };
    }
    const stage2Sbp = p.sbp99 + 5;
    const stage2Dbp = p.dbp99 + 5;
    if (sbp >= stage2Sbp || dbp >= stage2Dbp) {
      return { key: 'grade2', label: 'Nadciśnienie (II stopień) ≥99. centyl + 5 mm Hg', color: '#8a1f11' };
    }
    if (sbp >= p.sbp95 || dbp >= p.dbp95) {
      return { key: 'grade1', label: 'Nadciśnienie (I stopień) ≥95. centyl', color: '#b04a00' };
    }
    if (sbp >= p.sbp90 || dbp >= p.dbp90) {
      return { key: 'high_normal', label: 'Wysokie prawidłowe / podwyższone (90.–<95. centyl)', color: '#7a5a00' };
    }
    return { key: 'normal', label: 'Prawidłowe (<90. centyl)', color: '#1f5f2a' };
  }

  function classifyAdolescentAap(sbp, dbp) {
    if (sbp == null || dbp == null) return { key: 'unknown', label: 'Brak danych', color: '#444' };
    if (sbp >= 140 || dbp >= 90) return { key: 'stage2', label: 'Nadciśnienie 2. stopnia (≥140/90)', color: '#8a1f11' };
    if (sbp >= 130 || dbp >= 80) return { key: 'stage1', label: 'Nadciśnienie 1. stopnia (130–139/80–89)', color: '#b04a00' };
    if (sbp >= 120 && sbp <= 129 && dbp < 80) return { key: 'elevated', label: 'Podwyższone (120–129/<80)', color: '#7a5a00' };
    return { key: 'normal', label: 'Prawidłowe (<120/<80)', color: '#1f5f2a' };
  }

  function renderRecPlain(title, points) {
    const lines = [];
    if (title) lines.push(title);
    points.forEach((p, idx) => {
      lines.push(`${idx + 1}. ${p.text}`);
      // W trybie plain-text (kopiowanie) zachowujemy wcięcia „podpunktów”.
      // Konwencja: elementy zaczynające się od "– " traktujemy jako podpunkty.
      (p.bullets || []).forEach((b) => {
        const raw = String(b ?? '');
        const t = raw.trim();
        const isSub = /^[–—-]\s+/.test(t);
        const clean = isSub ? t.replace(/^[–—-]\s+/, '') : t;
        lines.push(`${isSub ? '      – ' : '   • '}${clean}`);
      });
    });
    return lines.join('\n');
  }

  function isSubBullet(text) {
    const t = String(text ?? '').trim();
    return /^[–—-]\s+/.test(t);
  }

  function stripSubBulletPrefix(text) {
    const t = String(text ?? '').trim();
    return t.replace(/^[–—-]\s+/, '');
  }

  // Renderuje listę punktów z obsługą podpunktów (wcięcie jak „tabulator”).
  // Konwencja danych: elementy zaczynające się od "– " (lub "- "/"— ") są podpunktami
  // przypisanymi do poprzedniego punktu nadrzędnego.
  function renderBulletsHtml(bulletsArr) {
    if (!bulletsArr || !bulletsArr.length) return '';

    const out = [];
    let i = 0;
    while (i < bulletsArr.length) {
      const raw = String(bulletsArr[i] ?? '');
      const t = raw.trim();

      // Jeżeli trafimy na „podpunkt” bez punktu nadrzędnego, renderujemy go jako zwykły punkt.
      if (isSubBullet(t)) {
        out.push(`<li>${emphasizeLabelHtml(stripSubBulletPrefix(t))}</li>`);
        i += 1;
        continue;
      }

      // Punkt nadrzędny
      const parentText = emphasizeLabelHtml(t);

      // Zbierz kolejne podpunkty
      const subs = [];
      let j = i + 1;
      while (j < bulletsArr.length) {
        const nxt = String(bulletsArr[j] ?? '').trim();
        if (!isSubBullet(nxt)) break;
        subs.push(stripSubBulletPrefix(nxt));
        j += 1;
      }

      if (subs.length) {
        const subHtml = `<ul class="htn-rec-subbullets">${subs.map(s => `<li>${emphasizeLabelHtml(s)}</li>`).join('')}</ul>`;
        out.push(`<li class="htn-bullet-has-sub">${parentText}${subHtml}</li>`);
      } else {
        out.push(`<li>${parentText}</li>`);
      }

      i = j;
    }

    return `<ul class="htn-rec-bullets">${out.join('')}</ul>`;
  }

  function emphasizeLabelHtml(text) {
    const raw = String(text ?? '').trim();
    const idx = raw.indexOf(':');
    // Jeżeli nagłówek ma krótką etykietę (np. "1. rzut:", "Preferowane połączenia:"),
    // pogrubiamy część przed pierwszym dwukropkiem.
    if (idx > 0 && idx < 70) {
      const lead = raw.slice(0, idx).trim();
      const rest = raw.slice(idx + 1);
      return `<strong>${escapeHtml(lead)}:</strong>${escapeHtml(rest)}`;
    }
    return escapeHtml(raw);
  }

  function renderRecHtml(title, points) {
    const cards = points.map((p, idx) => {
      const hasBadge = !!(p.badge && p.badge.label);

      let headerText = String(p.text ?? '');
      // Jeżeli mamy badge, usuń duplikat etykiety po "→" w nagłówku.
      if (hasBadge && headerText.includes('→')) {
        headerText = headerText.split('→')[0].trim();
      }

      const badgeHtml = hasBadge
        ? `<span class="htn-badge" style="background:${escapeHtml(p.badge.color || '#666')}">${escapeHtml(p.badge.label)}</span>`
        : '';

      const bullets = (p.bullets && p.bullets.length)
        ? renderBulletsHtml(p.bullets)
        : '';

      return `
        <section class="htn-rec-card">
          <div class="htn-rec-head">
            <div class="htn-rec-index">${idx + 1}</div>
            <div class="htn-rec-title">
              <div class="htn-rec-title-row">
                <div class="htn-rec-title-text">${emphasizeLabelHtml(headerText)}</div>
                ${badgeHtml}
              </div>
            </div>
          </div>
          ${bullets}
        </section>
      `;
    }).join('');

    return `
      <div class="htn-rec-wrap">
        ${title ? `<div class="htn-rec-top">${escapeHtml(title)}</div>` : ''}
        ${cards}
      </div>
    `;
  }

  function copyTextToClipboard(text) {
    if (!text) return Promise.resolve(false);
    // Prefer Clipboard API when available
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
    }
    // Fallback for older browsers
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return Promise.resolve(!!ok);
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const wrapper = $('hypertensionButtonWrapper');
    const toggleBtn = $('toggleHypertensionTherapy');
    const card = $('hypertensionCard');

    const sbpEl = $('htnSbp');
    const dbpEl = $('htnDbp');
    const highRiskEl = $('htnHighRisk');
    const monoPrefEl = $('htnMonotherapyPref');
    const betaIndEl = $('htnBetaIndication');
    const pregEl = $('htnPregnancy');
    const stageEl = $('htnStage');
    const comboEl = $('htnCombo');

    // Kontenery dla elementów „dorosłych” – będą ukrywane w trybie pediatrycznym (<18 rż)
    const switchesWrap = $('htnSwitches');
    const adultSelectorsWrap = $('htnAdultSelectors');

    const eligibilityBox = $('htnEligibilityBox');
    const copyBtn = $('htnCopyRec');
    const resultBox = $('htnResult');

    // Informacje dodatkowe – skróty użyte w module (lista alfabetyczna)
    const infoBtn = $('htnShowInfo');
    const infoSection = $('htnInfoSection');
    const abbrevList = $('htnAbbrevList');

    // Źródła – sekcja rozwijana na dole modułu
    const sourcesBtn = $('htnShowSources');
    const sourcesSection = $('htnSourcesSection');
    const sourcesList = $('htnSourcesList');

    if (!wrapper || !toggleBtn || !card || !sbpEl || !dbpEl || !highRiskEl || !monoPrefEl || !betaIndEl || !pregEl || !stageEl || !comboEl || !resultBox || !eligibilityBox) {
      return;
    }

    // Tymczasowo ukrywamy przycisk "Zalecenia do wklejenia" zgodnie z decyzją
    // o ograniczeniu modułu do podpowiedzi terapeutycznych (bez gotowych zaleceń do wklejenia).
    if (copyBtn) {
      copyBtn.style.display = 'none';
    }

    const abbrevs = [
      {
        key: 'ABPM',
        text: 'Ambulatory Blood Pressure Monitoring – 24‑godzinne ambulatoryjne monitorowanie ciśnienia tętniczego (tzw. holter RR).',
      },
      {
        key: 'ACEi',
        text: 'Angiotensin‑Converting Enzyme inhibitor – inhibitor konwertazy angiotensyny.',
      },
      {
        key: 'ARB',
        text: 'Angiotensin II Receptor Blocker – antagonista receptora angiotensyny II (sartan).',
      },
      {
        key: 'BMI',
        text: 'Body Mass Index – wskaźnik masy ciała (kg/m²).',
      },
      {
        key: 'BP',
        text: 'Blood Pressure – ciśnienie tętnicze.',
      },
      {
        key: 'CCB',
        text: 'Calcium Channel Blocker – bloker kanału wapniowego (najczęściej dihydropirydynowy).',
      },
      {
        key: 'CKD',
        text: 'Chronic Kidney Disease – przewlekła choroba nerek.',
      },
      {
        key: 'CVD',
        text: 'Cardiovascular Disease – choroba sercowo‑naczyniowa.',
      },
      {
        key: 'DBP',
        text: 'Diastolic Blood Pressure – ciśnienie rozkurczowe.',
      },
      {
        key: 'ESC',
        text: 'European Society of Cardiology – Europejskie Towarzystwo Kardiologiczne.',
      },
      {
        key: 'FH',
        text: 'Familial Hypercholesterolemia – hipercholesterolemia rodzinna.',
      },
      {
        key: 'Frailty',
        text: 'Zespół kruchości (frailty) – stan wyraźnie zmniejszonej rezerwy fizjologicznej i odporności na stresory (np. osłabienie, spowolnienie, upadki, ograniczona samodzielność).',
      },
      {
        key: 'HBPM',
        text: 'Home Blood Pressure Monitoring – domowe pomiary ciśnienia tętniczego.',
      },
      {
        key: 'HFrEF',
        text: 'Heart Failure with reduced Ejection Fraction – niewydolność serca ze zmniejszoną frakcją wyrzutową.',
      },
      {
        key: 'HMOD',
        text: 'Hypertension‑Mediated Organ Damage – uszkodzenie narządowe związane z nadciśnieniem.',
      },
      {
        key: 'MRA',
        text: 'Mineralocorticoid Receptor Antagonist – antagonista receptora mineralokortykoidowego (np. spironolakton).',
      },
      {
        key: 'SBP',
        text: 'Systolic Blood Pressure – ciśnienie skurczowe.',
      },
      {
        key: 'SCORE2',
        text: 'Systematic COronary Risk Evaluation 2 – narzędzie do oceny ryzyka sercowo‑naczyniowego.',
      },
    ];

    function renderAbbrevList() {
      if (!abbrevList) return;

      const sorted = [...abbrevs].sort((a, b) =>
        String(a.key).localeCompare(String(b.key), 'pl', { sensitivity: 'base' })
      );

      abbrevList.innerHTML = sorted
        .map((it) => `<li><strong>${escapeHtml(it.key)}</strong> — ${escapeHtml(it.text)}</li>`)
        .join('');
    }

    renderAbbrevList();

    if (infoBtn && infoSection) {
      infoBtn.addEventListener('click', () => {
        const isHidden = (infoSection.style.display === 'none' || infoSection.style.display === '');
        infoSection.style.display = isHidden ? 'block' : 'none';
        infoBtn.classList.toggle('active-toggle', isHidden);
      });
    }

    // Źródła – lista referencji użytych do przygotowania modułu
    const sources = [
      'ESC 2024: wytyczne dotyczące postępowania w podwyższonym ciśnieniu tętniczym i nadciśnieniu (algorytm eskalacji terapii, dobór klas leków).',
      'Kardiologia Polska: opracowanie / tłumaczenie zaleceń ESC 2024 (plik PDF dołączony do projektu).',
      'ESH (Europejskie Towarzystwo Nadciśnienia): wytyczne dotyczące nadciśnienia u dzieci i młodzieży (progi centylowe, diagnostyka i leczenie).',
      'AAP 2017: „Clinical Practice Guideline for Screening and Management of High Blood Pressure in Children and Adolescents” (Pediatrics).',
      'NHBPEP: „The Fourth Report on the Diagnosis, Evaluation, and Treatment of High Blood Pressure in Children and Adolescents” (Pediatrics, 2004).',
      'Projekt OLAF: polskie siatki centylowe RR dla wieku 7–18 lat (wykorzystywane w module RR u dzieci).',
      'Obrycki Ł. i wsp. (Pediatric Nephrology, 2025): etiologia nadciśnienia u dzieci w dużej europejskiej kohorcie (udział przyczyn wtórnych: nerkowe/koarktacja/renowaskularne/polekowe).',
      'leksykon.com.pl – ogólnodostępna baza produktów leczniczych w Polsce (nazwy handlowe/preparaty złożone; weryfikuj aktualność w ChPL/RPL).',
    ];

    function renderSourcesList() {
      if (!sourcesList) return;
      sourcesList.innerHTML = sources.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
    }
    renderSourcesList();

    if (sourcesBtn && sourcesSection) {
      sourcesBtn.addEventListener('click', () => {
        const isHidden = (sourcesSection.style.display === 'none' || sourcesSection.style.display === '');
        sourcesSection.style.display = isHidden ? 'block' : 'none';
        sourcesBtn.classList.toggle('active-toggle', isHidden);
      });
    }

    // Tooltip – spójny z innymi tooltipami w aplikacji (.menu-tooltip w style.css)
    const tooltip = document.createElement('div');
    tooltip.className = 'menu-tooltip copy-tooltip';
    tooltip.style.position = 'fixed';
    tooltip.style.display = 'none';
    tooltip.style.opacity = '0';
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    tooltip.style.transform = 'translate(-50%, -100%) translateY(2px)';
    document.body.appendChild(tooltip);

    let tooltipTimeout = null;
    let tooltipHideTimeout = null;
    function showTooltip(anchorEl, text) {
      try {
        if (tooltipTimeout) clearTimeout(tooltipTimeout);
        if (tooltipHideTimeout) clearTimeout(tooltipHideTimeout);

        tooltip.textContent = text;

        const rect = anchorEl.getBoundingClientRect();
        const left = Math.round(rect.left + rect.width / 2);
        const top = Math.round(rect.top - 10);

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';

        tooltip.style.display = 'block';
        tooltip.style.opacity = '0';
        tooltip.style.transform = 'translate(-50%, -100%) translateY(2px)';

        requestAnimationFrame(() => {
          tooltip.style.opacity = '1';
          tooltip.style.transform = 'translate(-50%, -100%) translateY(0px)';
        });

        tooltipTimeout = setTimeout(() => {
          tooltip.style.opacity = '0';
          tooltip.style.transform = 'translate(-50%, -100%) translateY(2px)';
          tooltipHideTimeout = setTimeout(() => {
            tooltip.style.display = 'none';
          }, 220);
        }, 1600);
      } catch (e) {
        // ignore
      }
    }

    function setResultEmpty(msg) {
      resultBox.innerHTML = `<div style="font-size:0.95rem; color:#444;">${escapeHtml(msg)}</div>`;
      if (copyBtn) copyBtn.dataset.copyText = '';
    }

    function setEligibilityInfo(lines) {
      if (!lines || !lines.length) {
        eligibilityBox.style.display = 'none';
        eligibilityBox.innerHTML = '';
        return;
      }
      eligibilityBox.style.display = 'block';
      eligibilityBox.innerHTML = `
        <div style="font-weight:700; margin-bottom:0.3rem;">Uwagi</div>
        <ul style="margin:0.2rem 0 0 1.1rem;">
          ${lines.map(l => `<li>${escapeHtml(l)}</li>`).join('')}
        </ul>
      `;
    }

    function hasRequiredBpValues() {
      return safeNumber(sbpEl?.value) != null && safeNumber(dbpEl?.value) != null;
    }

    function showMissingBpMessage() {
      setEligibilityInfo([]);
      setResultEmpty('Aby zobaczyć wyniki modułu „Leczenie nadciśnienia”, uzupełnij pola SBP (mm Hg) oraz DBP (mm Hg).');
    }

    // Ukrywanie elementów przeznaczonych dla dorosłych w trybie pediatrycznym (<18 rż).
    // Dotyczy: przełączników ryzyka/monoterapii/BB/ciąży oraz selektorów „Etap leczenia” i „Preferowane połączenie”.
    function toggleBlock(el, show) {
      if (!el) return;
      if (show) {
        const prev = (el.dataset && Object.prototype.hasOwnProperty.call(el.dataset, 'prevDisplay'))
          ? el.dataset.prevDisplay
          : null;
        el.style.display = (prev != null) ? prev : '';
      } else {
        if (el.dataset && !Object.prototype.hasOwnProperty.call(el.dataset, 'prevDisplay')) {
          el.dataset.prevDisplay = el.style.display || '';
        }
        el.style.display = 'none';
      }
    }

    function syncAdultOnlyUi(ctx) {
      const isPeds = !!(ctx && typeof ctx.ageYears === 'number' && !isNaN(ctx.ageYears) && ctx.ageYears < 18);

      // 1) Przełączniki (ryzyko/monoterapia/beta‑bloker/ciąża)
      toggleBlock(switchesWrap, !isPeds);

      // 2) Selektory etapu i preferowanego połączenia (dorosłych)
      if (adultSelectorsWrap) {
        toggleBlock(adultSelectorsWrap, !isPeds);
      } else {
        // Fallback dla starszej wersji HTML (bez wrappera): ukryj etykiety bezpośrednio.
        const stageLabel = stageEl ? stageEl.closest('label') : null;
        const comboLabel = comboEl ? comboEl.closest('label') : null;
        toggleBlock(stageLabel, !isPeds);
        toggleBlock(comboLabel, !isPeds);
      }
    }

    function buildPediatricPlan(ctx, sbp, dbp) {
      const notes = [];
      const points = [];

      notes.push('Tryb pediatryczny (<18 rż): progi RR i zalecenia różnią się od algorytmu dla dorosłych.');
      notes.push('W części pediatrycznej moduł korzysta z oszacowania centyli RR zależnego od wieku/płci i wzrostu; wynik traktuj jako orientacyjny i zawsze potwierdzaj RR (HBPM/ABPM) oraz decyzje kliniczne w oparciu o pełne wytyczne.');
      notes.push('Dla pacjentów ≥18 rż moduł stosuje algorytm dorosłych (ESC 2024).');

      const title = 'Nadciśnienie u dzieci i młodzieży — podsumowanie (pediatria, <18 rż)';

      // --- Dane antropometryczne ---
      const ageTxt = fmtAge(ctx);
      const sexTxt = ctx.sex === 'M' ? 'chłopiec' : (ctx.sex === 'F' ? 'dziewczynka' : 'brak danych');

      const htStats = tryCalcHeightStats(ctx);
      const heightZ = (htStats && typeof htStats.sd === 'number') ? htStats.sd : 0;
      const heightCent = (htStats && typeof htStats.percentile === 'number') ? htStats.percentile : null;

      const bmiStats = tryCalcBmiStats(ctx);
      const bmiCent = (bmiStats && typeof bmiStats.percentile === 'number') ? bmiStats.percentile : null;

      let bmiCat = '';
      if (typeof bmiCategoryChildExact === 'function' && bmiCent != null) {
        bmiCat = bmiCategoryChildExact(bmiCent);
      } else if (bmiCent != null) {
        if (bmiCent < 5) bmiCat = 'Niedowaga';
        else if (bmiCent < 85) bmiCat = 'Prawidłowe';
        else if (bmiCent < 95) bmiCat = 'Nadwaga';
        else bmiCat = 'Otyłość';
      }

      const demoBullets = [
        `Płeć: ${sexTxt}.`,
        `Wiek: ${ageTxt}.`,
      ];
      if (ctx.heightCm != null) {
        if (heightCent != null) demoBullets.push(`Wzrost: ${ctx.heightCm} cm (≈ ${heightCent.toFixed(0)}. centyl; Height‑Z≈${heightZ.toFixed(2)}).`);
        else demoBullets.push(`Wzrost: ${ctx.heightCm} cm.`);
      }
      if (ctx.weightKg != null) demoBullets.push(`Masa ciała: ${ctx.weightKg} kg.`);
      if (ctx.bmi != null) {
        if (bmiCent != null && bmiCat) demoBullets.push(`BMI: ${ctx.bmi.toFixed(1)} kg/m² (≈ ${bmiCent.toFixed(0)}. centyl; ${bmiCat}).`);
        else demoBullets.push(`BMI: ${ctx.bmi.toFixed(1)} kg/m².`);
      }

      points.push({
        text: 'Dane pacjenta (z „Dane użytkownika”):',
        bullets: demoBullets,
      });

      // --- Klasyfikacja RR ---
      if (sbp == null || dbp == null) {
        points.push({
          text: 'Uzupełnij SBP i DBP (mm Hg), aby obliczyć centyle RR i sklasyfikować wynik u pacjenta pediatrycznego.',
          bullets: [
            'Pomiar musi być standaryzowany (właściwy mankiet, odpoczynek, ≥2 pomiary) — najlepiej potwierdzić HBPM i/lub ABPM.',
          ],
        });
      } else {
        // Klasyfikacja pediatryczna: preferencyjnie korzystamy z API bp_module.js
        // (spójność z kartą "Ciśnienie tętnicze u dzieci" na index.html).
        let clsEsh = null;
        let clsBullets = [];

        // 1) Próba użycia wspólnego modułu bp_module.js (identyczne obliczenia jak w karcie RR).
        let apiRes = null;
        try {
          if (typeof window !== 'undefined' && window.bpModuleApi && typeof window.bpModuleApi.computePediatricBp === 'function') {
            apiRes = window.bpModuleApi.computePediatricBp({
              ageYears: ctx.ageYears,
              sex: ctx.sex,
              heightCm: ctx.heightCm,
              sbp,
              dbp,
            });
          }
        } catch (e) {
          apiRes = null;
        }

        if (apiRes && apiRes.ok) {
          const sev = apiRes.severity;
          const keyMap = {
            normal: 'normal',
            high: 'high_normal',
            stage1: 'grade1',
            stage2: 'grade2',
          };
          const colorMap = {
            normal: '#1f5f2a',
            high: '#7a5a00',
            stage1: '#b04a00',
            stage2: '#8a1f11',
          };

          clsEsh = {
            key: keyMap[sev] || 'unknown',
            label: apiRes.interp || 'Brak danych',
            color: colorMap[sev] || '#444',
          };

          const fmtCent = (val) => {
            if (val == null || !Number.isFinite(val)) return '–';
            if (val < 1) return '<1';
            if (val > 99) return '>99';
            return String(Math.round(val));
          };

          const t = apiRes.thresholds || {};
          const datasetTxt = (apiRes.datasetChoice === 'OLAF')
            ? 'OLAF (Polska, 7–18 lat)'
            : 'NHBPEP (4th Report, 3–18 lat)';

          clsBullets.push(`Zestaw norm użyty do obliczeń: ${datasetTxt}.`);
          if (Number.isFinite(apiRes.percSbp) && Number.isFinite(t.sbp90) && Number.isFinite(t.sbp95) && Number.isFinite(t.sbp99) && Number.isFinite(t.sbp99Plus5)) {
            clsBullets.push(`SBP ~${fmtCent(apiRes.percSbp)}. centyl (P90≈${t.sbp90.toFixed(0)}, P95≈${t.sbp95.toFixed(0)}, P99≈${t.sbp99.toFixed(0)}, P99+5≈${t.sbp99Plus5.toFixed(0)} mm Hg).`);
          } else if (Number.isFinite(apiRes.percSbp)) {
            clsBullets.push(`SBP ~${fmtCent(apiRes.percSbp)}. centyl.`);
          }

          if (Number.isFinite(apiRes.percDbp) && Number.isFinite(t.dbp90) && Number.isFinite(t.dbp95) && Number.isFinite(t.dbp99) && Number.isFinite(t.dbp99Plus5)) {
            clsBullets.push(`DBP ~${fmtCent(apiRes.percDbp)}. centyl (P90≈${t.dbp90.toFixed(0)}, P95≈${t.dbp95.toFixed(0)}, P99≈${t.dbp99.toFixed(0)}, P99+5≈${t.dbp99Plus5.toFixed(0)} mm Hg).`);
          } else if (Number.isFinite(apiRes.percDbp)) {
            clsBullets.push(`DBP ~${fmtCent(apiRes.percDbp)}. centyl.`);
          }

          clsBullets.push('Klasyfikacja w pediatrii opiera się na centylach (wiek/płeć/wzrost): wysokie prawidłowe ≥P90; nadciśnienie ≥P95; II stopień ~≥P99 + 5 mm Hg. W tej aplikacji dodatkowo: ≥120/80 jest traktowane jako „wysokie prawidłowe”.');

          // Często spotykany alternatywny próg dla „2. stopnia” w rekomendacjach amerykańskich (AAP): P95 + 12 mm Hg.
          if (Number.isFinite(t.sbp95) && Number.isFinite(t.dbp95)) {
            clsBullets.push(`Dla porównania: w części zaleceń (AAP) „2. stopień” bywa definiowany jako ≥P95 + 12 mm Hg (orientacyjnie: SBP≈${(t.sbp95 + 12).toFixed(0)}, DBP≈${(t.dbp95 + 12).toFixed(0)} mm Hg).`);
          }

          if (ctx.ageYears != null && ctx.ageYears >= 13) {
            const clsAap = classifyAdolescentAap(sbp, dbp);
            clsBullets.push(`Dla porównania (AAP 2017, od 13 rż progi jak u dorosłych): ${clsAap.label}.`);
          }
        } else {
          // 2) Fallback: lokalny model (gdy brak/nieaktualny bp_module.js)
          const p = pediatricBpPercentiles(ctx.ageYears, ctx.sex, heightZ);
          if (!p) {
            points.push({
              text: `Aktualne BP: ${sbp}/${dbp} mm Hg — brak możliwości wyliczenia centyli (sprawdź: płeć, wiek, wzrost).`,
              bullets: [
                'Dla pediatrii potrzebne są: płeć, wiek i wzrost (do oceny centyli RR).',
                'Jeśli nie można wyliczyć centyli: rozważ interpretację w oparciu o tabele i/lub konsultację pediatryczną.',
              ],
            });
          } else {
            const sbpPct = pediatricBpPercentileForValue(sbp, p.sbpMu, p.sbpSigma);
            const dbpPct = pediatricBpPercentileForValue(dbp, p.dbpMu, p.dbpSigma);

            clsEsh = classifyPediatricEsh(sbp, dbp, p);

            clsBullets = [];
            if (sbpPct != null) clsBullets.push(`SBP ~${sbpPct.toFixed(0)}. centyl (P90≈${p.sbp90.toFixed(0)}, P95≈${p.sbp95.toFixed(0)}, P99≈${p.sbp99.toFixed(0)} mm Hg).`);
            if (dbpPct != null) clsBullets.push(`DBP ~${dbpPct.toFixed(0)}. centyl (P90≈${p.dbp90.toFixed(0)}, P95≈${p.dbp95.toFixed(0)}, P99≈${p.dbp99.toFixed(0)} mm Hg).`);
            clsBullets.push('Klasyfikacja w pediatrii opiera się na centylach (wiek/płeć/wzrost): wysokie prawidłowe ≥P90; nadciśnienie ≥P95; II stopień ~≥P99 + 5 mm Hg (w praktyce).');

            clsBullets.push(`Dla porównania: w części zaleceń (AAP) „2. stopień” bywa definiowany jako ≥P95 + 12 mm Hg (orientacyjnie: SBP≈${(p.sbp95 + 12).toFixed(0)}, DBP≈${(p.dbp95 + 12).toFixed(0)} mm Hg).`);

            if (ctx.ageYears != null && ctx.ageYears >= 13) {
              const clsAap = classifyAdolescentAap(sbp, dbp);
              clsBullets.push(`Dla porównania (AAP 2017, od 13 rż progi jak u dorosłych): ${clsAap.label}.`);
            }
          }
        }

        if (clsEsh) {
          points.push({
            text: `Aktualne BP (gabinetowe): ${sbp}/${dbp} mm Hg → ${clsEsh.label}.`,
            badge: { label: clsEsh.label, color: clsEsh.color },
            bullets: clsBullets,
          });

          // --- Ścieżka kliniczna (personalizacja pediatryczna — bardziej „kliniczne” różnicowanie) ---
          // Celem jest szybka orientacja, czy obraz pasuje bardziej do pierwotnego HTN (częściej u starszych dzieci z nadwagą/otyłością),
          // czy raczej wymaga pilnej diagnostyki wtórnych przyczyn (częściej u <6 rż, bez nadwagi, w II stopniu).
          const clinicalBullets = [];

          if (ctx.ageYears != null) {
            if (ctx.ageYears < 6) {
              clinicalBullets.push('Wiek <6 rż: nadciśnienie pierwotne jest rzadsze — przy utrwalonych nieprawidłowych wartościach RR szybciej kieruj diagnostykę w stronę przyczyn wtórnych i rozważ konsultację nefrologiczną/kardiologiczną.');
            } else {
              clinicalBullets.push('Wiek ≥6 rż: częściej spotyka się nadciśnienie pierwotne (szczególnie przy nadwadze/otyłości), ale przy obrazie klinicznym sugerującym wtórne nadciśnienie zawsze należy poszerzyć diagnostykę.');
            }
          }
          if (clsEsh.key === 'grade1' || clsEsh.key === 'grade2') {
            // Najczęstsze przyczyny wtórnego nadciśnienia u dzieci (orientacyjnie; udział wśród przypadków SH — odsetki zależne od populacji)
            clinicalBullets.push('Najczęstsze przyczyny wtórnego nadciśnienia u dzieci (udział wśród przypadków wtórnych; wartości orientacyjne):');
            clinicalBullets.push('– choroby miąższu nerek: ~43,5%');
            clinicalBullets.push('– koarktacja aorty: ~20,7%');
            clinicalBullets.push('– nadciśnienie naczyniowo‑nerkowe (zwężenie tętnicy nerkowej): ~18%');
            clinicalBullets.push('– nadciśnienie polekowe: ~4,2%');
            clinicalBullets.push('– zespół środkowej aorty: ~3,6%');
          }

          const hasOverweight = (bmiCent != null && Number.isFinite(bmiCent) && bmiCent >= 85);
          const hasObesity = (bmiCent != null && Number.isFinite(bmiCent) && bmiCent >= 95);

          if (bmiCent != null && Number.isFinite(bmiCent)) {
            if (hasObesity) clinicalBullets.push('BMI ≥95. centyla (otyłość) — częsty kontekst pierwotnego/otyłościowego nadciśnienia; nacisk na intensywną modyfikację stylu życia + przesiew w kierunku zaburzeń metabolicznych i obturacyjnego bezdechu sennego (wg objawów).');
            else if (hasOverweight) clinicalBullets.push('BMI 85.–<95. centyla (nadwaga) — zwiększa prawdopodobieństwo nadciśnienia pierwotnego; kluczowe leczenie żywieniowe i aktywność fizyczna.');
          } else {
            clinicalBullets.push('Brak pełnych danych do oceny centyla BMI — w pediatrii nadwaga/otyłość istotnie wpływa na prawdopodobieństwo nadciśnienia pierwotnego.');
          }

          if (clsEsh.key === 'grade2') {
            clinicalBullets.push('Wartości w zakresie II stopnia: zwykle wymaga szybszego potwierdzenia (ABPM/HBPM), pilniejszej diagnostyki oraz rozważenia wcześniejszego włączenia farmakoterapii (zwłaszcza przy utrwaleniu RR, objawach lub podejrzeniu HMOD).');
          } else if (clsEsh.key === 'grade1') {
            clinicalBullets.push('Nadciśnienie 1. stopnia: często rozpoczyna się od intensywnych interwencji niefarmakologicznych i monitorowania; farmakoterapię rozważa się przy utrwaleniu RR mimo leczenia niefarmakologicznego oraz przy współistniejących chorobach/HMOD.');
          } else if (clsEsh.key === 'high_normal') {
            clinicalBullets.push('Wysokie prawidłowe/podwyższone: zwykle styl życia + kontrola RR; ABPM/HBPM przy wątpliwościach.');
          }

          // Objawy/cechy, które powinny nasilać podejrzenie nadciśnienia wtórnego u dzieci
          if (clsEsh.key === 'grade1' || clsEsh.key === 'grade2') {
            clinicalBullets.push('Podejrzenie nadciśnienia wtórnego rozważ szczególnie, gdy występują:');
            clinicalBullets.push('– bardzo wczesny początek (zwłaszcza <6 rż) lub nagłe narastanie wartości RR;');
            clinicalBullets.push('– nadciśnienie 2. stopnia, kryza nadciśnieniowa lub objawy (np. ból głowy, zaburzenia widzenia, neurologiczne);');
            clinicalBullets.push('– brak dodatniego wywiadu rodzinnego i brak nadwagi/otyłości;');
            clinicalBullets.push('– odchylenia nerkowe/„moczowe” (krwiomocz, białkomocz, spadek eGFR/kreatynina ↑) lub nawracające ZUM;');
            clinicalBullets.push('– cechy koarktacji aorty (osłabione i/lub opóźnione tętno na tętnicach udowych w porównaniu z kończyną górną, różnica ciśnień (zwłaszcza SBP) między kończynami górnymi i dolnymi, szmer skurczowy w okolicy międzyłopatkowej);');
            clinicalBullets.push('– cechy endokrynopatii (napadowe bóle głowy + poty + kołatania, cechy Cushinga, hipokaliemia);');
            clinicalBullets.push('– ekspozycja na leki/substancje podnoszące RR (sympatykomimetyki, GKS, leki na ADHD/psychostymulujące, kofeina/energetyki, nikotyna).');
          }

          points.push({
            text: 'Szybka ścieżka kliniczna',
            bullets: clinicalBullets,
          });

          // --- Potwierdzenie i diagnostyka ---
          const diagBullets = [
            'Potwierdź RR: powtarzalne, standaryzowane pomiary gabinetowe + HBPM i/lub ABPM (ABPM jest szczególnie przydatne do potwierdzenia rozpoznania i oceny „white‑coat”/nadciśnienia maskowanego).',
            'Oceń tło kliniczne i możliwe przyczyny: leki/substancje podnoszące RR — m.in. sympatykomimetyki/dekongestanty OTC (pseudoefedryna, fenylefryna; donosowe alfa‑mimetyki: oksymetazolina, ksylometazolina), NLPZ dostępne OTC (ibuprofen, naproksen), glikokortykosteroidy (prednizon/prednizolon, deksametazon), leki stosowane w ADHD/psychostymulujące (metylfenidat, deksamfetamina, lisdeksamfetamina, atomoksetyna), a także kofeina/napoje energetyczne i nikotyna.',
            'Przy podejrzeniu koarktacji aorty: porównaj SBP na kończynach górnych i dolnych (prawidłowo SBP na kończynach dolnych bywa podobne lub nieco wyższe; podejrzane: SBP na kończynach górnych > SBP na dolnych, a różnica (ramię–noga) ≥20 mm Hg sugeruje istotny gradient ciśnień i wymaga weryfikacji), oceń tętno na tętnicach udowych (prawidłowo: dobrze wyczuwalne i bez opóźnienia względem tętna na tętnicy promieniowej; podejrzane: słabe i/lub opóźnione), osłuchaj okolicę przedsercową oraz przestrzeń międzyłopatkową w poszukiwaniu szmeru skurczowego; rozważ ECHO serca/konsultację kardiologiczną.',
            'Podstawowy pakiet badań zwykle obejmuje: kreatynina/eGFR, elektrolity, badanie ogólne moczu, albuminuria, lipidogram; w zależności od obrazu klinicznego — glikemia/HbA1c, TSH, USG nerek (szczególnie u młodszych dzieci lub przy nieprawidłowym moczu), ECHO serca (ocena HMOD/LVH).',
          ];
          if (ctx.ageYears != null && ctx.ageYears < 6) {
            diagBullets.unshift('Wiek <6 rż: częściej tło wtórne — przy utrwalonych nieprawidłowych wartościach RR zwykle szybciej poszerz diagnostykę (w tym rozważ USG nerek) i konsultację nefrologiczną/kardiologiczną.');
          }

          points.push({
            text: 'Potwierdzenie pomiaru i diagnostyka (pediatria — skrót):',
            bullets: diagBullets,
          });

          // --- Leczenie niefarmakologiczne ---
          const lifeBullets = [
            'Modyfikacja stylu życia jest podstawą na każdym etapie: redukcja sodu, dieta typu DASH, regularna aktywność fizyczna, prawidłowa ilość snu.',
            'Jeśli występuje nadwaga/otyłość: leczenie żywieniowe i aktywność fizyczna są kluczowe; rozważ przesiew w kierunku zaburzeń metabolicznych i bezdechu sennego zgodnie z obrazem klinicznym.',
            'Unikaj napojów energetycznych i substancji podnoszących RR (np. niektóre leki OTC, sympatykomimetyki).',
          ];
          if (bmiCat && (bmiCat === 'Nadwaga' || bmiCat.startsWith('Otyłość'))) {
            lifeBullets.unshift(`BMI sugeruje: ${bmiCat} — nacisk na redukcję masy ciała/zmianę stylu życia.`);
          }

          points.push({
            text: 'Interwencje niefarmakologiczne (dzieci i młodzież):',
            bullets: lifeBullets,
          });

          // --- Kiedy leki? ---
          const medBullets = [];
          if (clsEsh.key === 'normal') {
            medBullets.push('Brak wskazań do farmakoterapii — profilaktyka i okresowa kontrola RR.');
          } else if (clsEsh.key === 'high_normal') {
            medBullets.push('Zwykle: intensywne interwencje niefarmakologiczne i kontrola RR (często w horyzoncie kilku miesięcy), z ABPM/HBPM w razie wątpliwości.');
          } else if (clsEsh.key === 'grade1') {
            medBullets.push('Zwykle: interwencje niefarmakologiczne + kontrola (kilka wizyt). Farmakoterapię rozważa się m.in. przy utrwalonym nadciśnieniu mimo intensywnego leczenia niefarmakologicznego (często po ok. 3–6 mies.) oraz w obecności chorób współistniejących/HMOD (np. LVH, CKD, cukrzyca).');
          } else {
            medBullets.push('II stopień: szybsza weryfikacja/eskalacja — często wskazana pilna diagnostyka, ABPM oraz rozważenie włączenia farmakoterapii (zwłaszcza przy utrwaleniu RR, objawach lub podejrzeniu HMOD).');
          }

          medBullets.push('Leki pierwszego wyboru u dzieci i młodzieży (dobór i dawkowanie zależne od wieku, masy ciała i wskazań; weryfikuj ChPL):');
          medBullets.push('– ACEI: enalapryl (np. Enarenal, Enalapril Vitabalans), kaptopryl (np. Captopril Jelfa).');
          medBullets.push('– ARB/sartany: losartan (np. Cozaar, Lorista, Xartan), kandesartan (np. Atacand), walsartan (np. Diovan, Walsartan Krka).');
          medBullets.push('– CCB (dihydropirydynowe, długo działające): amlodypina (np. Norvasc).');
          medBullets.push('– Diuretyk tiazydowy/tiazydopodobny: hydrochlorotiazyd lub indapamid (gdy wskazane).');
          medBullets.push('– Preferencje kliniczne: w CKD/proteinurii/cukrzycy zwykle preferuje się ACEi/ARB; beta‑blokery nie są typowym „1. wyborem” w pierwotnym nadciśnieniu, ale mogą być potrzebne przy określonych wskazaniach kardiologicznych.');
          medBullets.push('– Cel leczenia w pediatrii bywa definiowany jako RR <90. centyla (a u starszych nastolatków często także <130/80), o ile tolerowane — zawsze indywidualizuj.');
          medBullets.push('– U dojrzewających dziewcząt: ACEi/ARB są przeciwwskazane w ciąży — uwzględnij poradnictwo i planowanie rodziny.');

          points.push({
            text: 'Farmakoterapia (pediatria — kiedy i czym, skrót):',
            bullets: medBullets,
          });
        }
      }

      const html = renderRecHtml(title, points);
      const plain = renderRecPlain(title, points);
      const plainCopy = plain.replace(/^[^\n]*\n?/, '').trimStart();

      return { html, plainCopy, notes };
    }

    function buildPlan() {
      const ctx = getUserContext();
      const sbp = safeNumber(sbpEl.value);
      const dbp = safeNumber(dbpEl.value);
      const bp = classifyBp(sbp, dbp);

      // Tryb pediatryczny: <18 rż (progi centylowe RR) — osobny tor rekomendacji.
      if (ctx.ageYears != null && ctx.ageYears < 18) {
        return buildPediatricPlan(ctx, sbp, dbp);
      }

      const highRisk = !!highRiskEl.checked;
      const monoPref = !!monoPrefEl.checked;
      const betaInd = !!betaIndEl.checked;
      const pregnancy = !!pregEl.checked;

      const stage = stageEl.value || 'init';
      const combo = comboEl.value || 'ras_ccb';

      const notes = [];

      if (ctx.ageYears != null && ctx.ageYears < 18) {
        notes.push('Wytyczne ESC 2024 dotyczą głównie dorosłych; u dzieci i młodzieży progi rozpoznania i leczenia mogą być inne.');
      }

      notes.push('Moduł stanowi skrócone podsumowanie algorytmu ESC 2024 i nie zastępuje indywidualnej decyzji klinicznej.');
      notes.push('Moduł nie podaje dawek. W nawiasach podano przykłady substancji czynnych oraz wybrane nazwy handlowe dostępne w Polsce (lista przykładowa; bez wskazania preferencji). Wybór leku i dawkowania zawsze zgodnie z obrazem klinicznym, interakcjami i Charakterystyką Produktu Leczniczego.');

      // Wskazanie do farmakoterapii (uproszczenie na podstawie algorytmu ESC 2024)
      const pharmIndicated =
        (bp.key === 'hypertension') ||
        (bp.key === 'elevated' && highRisk && isBp130_80Plus(sbp, dbp));

      const title = 'Leczenie nadciśnienia — algorytm ESC 2024 (podsumowanie dla lekarza)';
      const points = [];

      // 1) Klasyfikacja BP i potwierdzenie pomiarów
      if (sbp != null && dbp != null) {
        points.push({
          text: `Aktualne BP (gabinetowe): ${sbp}/${dbp} mm Hg → ${bp.label}.`,
          badge: { label: bp.label, color: bp.color },
          bullets: [
            'Potwierdź wartości BP: HBPM i/lub ABPM albo powtórzone standaryzowane pomiary gabinetowe.',
            'U osób w wieku podeszłym / z objawami: rozważ ocenę hipotensji ortostatycznej (pomiar w pozycji stojącej).',
          ],
        });
      } else {
        points.push({
          text: 'Uzupełnij SBP i DBP (mm Hg), aby moduł mógł sklasyfikować BP i podpowiedzieć dalsze kroki wg ESC 2024.',
        });
      }

      // 2) Kwalifikacja do farmakoterapii
      const indBullets = [];
      if (bp.key === 'hypertension') {
        indBullets.push('Przy potwierdzonym nadciśnieniu (≥140/90 mm Hg) farmakoterapia jest zwykle wskazana równolegle z interwencjami niefarmakologicznymi.');
      } else if (bp.key === 'elevated') {
        if (isBp130_80Plus(sbp, dbp) && highRisk) {
          indBullets.push('W podwyższonym BP 130–139/80–89 mm Hg u osób wysokiego ryzyka sercowo‑naczyniowego można rozważyć farmakoterapię (zwykle po okresie intensywnych interwencji niefarmakologicznych ~3 mies.).');
          indBullets.push('W tej grupie preferowana jest wstępna monoterapia (z miareczkowaniem).');
        } else if (isBp130_80Plus(sbp, dbp) && !highRisk) {
          indBullets.push('W podwyższonym BP 130–139/80–89 mm Hg bez wysokiego ryzyka: zwykle interwencje niefarmakologiczne + monitorowanie; farmakoterapia zależna od indywidualnej oceny ryzyka.');
        } else {
          indBullets.push('W podwyższonym BP poniżej 130/80: interwencje niefarmakologiczne + okresowa kontrola.');
        }
      } else if (bp.key === 'normal') {
        indBullets.push('Przy niepodwyższonym BP (<120/70 mm Hg) nie ma wskazań do farmakoterapii — profilaktyka i okresowa kontrola.');
      } else {
        indBullets.push('Brak danych BP — uzupełnij SBP/DBP, potwierdź pomiary i oceń ryzyko sercowo‑naczyniowe.');
      }

      points.push({
        text: 'Kiedy rozważyć/rozpocząć farmakoterapię (ESC 2024 — skrót):',
        bullets: indBullets,
      });

      // 3) Cele leczenia i kontrola
      points.push({
        text: 'Cele terapii i tempo kontroli:',
        bullets: [
          'Dla większości dorosłych: docelowe SBP 120–139 mm Hg oraz DBP 70–79 mm Hg (o ile tolerowane).',
          'Ocena efektu po 1–3 miesiącach po każdej zmianie leczenia (preferencyjnie po 1 miesiącu, jeśli to możliwe).',
          'Po uzyskaniu kontroli BP: wizyty kontrolne co najmniej raz w roku.',
          'Ostrożność/indywidualizacja m.in. u osób z objawową hipotensją ortostatyczną, z umiarkowanym lub ciężkim zespołem kruchości (frailty — pacjent wyraźnie osłabiony, z ograniczoną samodzielnością), z ograniczoną przewidywaną długością życia oraz w wieku ≥85 lat.',
        ],
      });

      // 4) Styl życia
      const lifestyleBullets = [
        'Ograniczenie sodu w diecie i unikanie żywności wysokoprzetworzonej.',
        'Regularna aktywność fizyczna dostosowana do możliwości.',
        'Redukcja masy ciała u osób z nadwagą/otyłością, ograniczenie alkoholu, zaprzestanie palenia.',
        'Higiena snu i redukcja stresu.',
      ];
      if (ctx.bmi != null) {
        lifestyleBullets.push(`BMI z „Danych użytkownika”: ${ctx.bmi.toFixed(1)} kg/m² (interpretuj w kontekście wieku i masy mięśniowej).`);
      }
      points.push({
        text: 'Interwencje niefarmakologiczne (zawsze równolegle do leczenia):',
        bullets: lifestyleBullets,
      });

      // 5) Farmakoterapia — krok po kroku (I–IV) + dobór klas leków (ESC 2024)
      // Uwaga: nazwy handlowe poniżej są przykładami preparatów dostępnych w PL; weryfikuj aktualną dostępność i zawsze indywidualizuj dobór (w tym dawki).
      // (Nazwa handlowa → skład w nawiasie), aby szybciej rozpoznać preparaty złożone w praktyce.

      // 5a) Leki 1. wyboru (pojedyncze substancje — przykłady)
      const aceiItems = [
        'perindopryl (Prestarium, Perindopril Krka)',
        'ramipryl (Tritace, Polpril)',
      ];
      const arbItems = [
        'losartan (Cozaar, Lorista)',
        'walsartan (Diovan, Walsartan Krka)',
      ];
      const ccbItems = [
        'amlodypina (Norvasc, Amlozek)',
        'lerkanidipina (Lercan, Lapress)',
      ];
      const diurItems = [
        'indapamid (Tertensif SR)',
        'chlortalidon (Hygroton, Uldiulan)',
        'hydrochlorotiazyd (Hydrochlorothiazide Orion, Hydrochlorothiazide Aurovitas)',
      ];

      // 5b) Preparaty złożone (2 leki) — przykłady nazw handlowych (PL)
      const fdcRasCcb = [
        'Co‑Prestarium / Aramlessa / Perindopril+Amlodipine (Teva, Krka) (perindopryl+amlodypina)',
        'Egiramlon (ramipryl+amlodypina)',
        'Wamlox / Dipperam (amlodypina+walsartan)',
        'Coripren / Lercaprel (enalapryl+lerkanidipina)',
      ];

      const fdcRasDiur = [
        'Noliprel (perindopryl+indapamid)',
        'Hyzaar / Lorista H (losartan+hydrochlorotiazyd)',
        'Co‑Diovan (walsartan+hydrochlorotiazyd)',
      ];

      // 5c) Preparaty złożone (3 leki) — przykłady nazw handlowych (PL)
      const fdcTriple = [
        'Triplixam (perindopryl+indapamid+amlodypina)',
        'Co‑Amlessa (perindopryl+amlodypina+indapamid)',
        'Dipperam HCT / Exforge HCT (amlodypina+walsartan+hydrochlorotiazyd)',
      ];

      // 5d) Inne klasy „kolejnych kroków”
      const mraItems = [
        'spironolakton (Verospiron, Spironol)',
        'eplerenon (Inspra, Eplerenon Medreg)',
      ];
      const bbItems = [
        'bisoprolol (Concor)',
        'metoprolol (Betaloc ZOK)',
        'karwedilol (Dilatrend)',
        'nebiwolol (Nebilet)',
      ];

      // 5e) Teksty skrótowe używane również w „Szybkiej podpowiedzi” i w opcjach wyboru połączenia
      const comboRasCcb = 'ACEi/ARB + CCB (dihydropirydynowy) — preferowane połączenie 2‑lekowe.';
      const comboRasDiur = 'ACEi/ARB + diuretyk tiazydowy/tiazydopodobny — preferowane połączenie 2‑lekowe.';
      const tripleCombo = 'ACEi/ARB + CCB + diuretyk tiazydowy/tiazydopodobny (terapia 3‑lekowa).';

      const pharmBullets = [
        'W module oznaczenia „I–IV rzut” to kolejne kroki intensyfikacji leczenia: od rozpoczęcia farmakoterapii do postępowania przy podejrzeniu nadciśnienia opornego (praktyczny algorytm ESC 2024).',

        'Leki 1. wyboru (podstawa algorytmu):',

        'ACEi:',
        `– ${aceiItems[0]}`,
        `– ${aceiItems[1]}`,

        'ARB/sartany:',
        `– ${arbItems[0]}`,
        `– ${arbItems[1]}`,

        'CCB (dihydropirydynowe):',
        `– ${ccbItems[0]}`,
        `– ${ccbItems[1]}`,

        'Diuretyki tiazydowe/tiazydopodobne:',
        `– ${diurItems[0]}`,
        `– ${diurItems[1]}`,
        `– ${diurItems[2]}`,

        'I rzut (krok 1 — rozpoczęcie): u większości pacjentów z potwierdzonym nadciśnieniem (≥140/90 mm Hg) preferuj terapię skojarzoną 2 lekami w niskich dawkach (najlepiej preparat złożony w 1 tabletce).',

        'Preferowane połączenia 2‑lekowe (wybierz jedno):',
        'ACEi/ARB + CCB (dihydropirydynowy):',
        `– ${fdcRasCcb[0]}`,
        `– ${fdcRasCcb[1]}`,
        `– ${fdcRasCcb[2]}`,
        `– ${fdcRasCcb[3]}`,

        'ACEi/ARB + diuretyk tiazydowy/tiazydopodobny:',
        `– ${fdcRasDiur[0]}`,
        `– ${fdcRasDiur[1]}`,
        `– ${fdcRasDiur[2]}`,

        'Kiedy preferować wstępną monoterapię (zamiast 2 leków od startu):',
        '– w podwyższonym BP 130–139/80–89 mm Hg (jeśli włączasz leki) oraz u osób z większym ryzykiem działań niepożądanych: wiek ≥85 lat, objawowa hipotensja ortostatyczna, umiarkowany/ciężki zespół kruchości (frailty — pacjent wyraźnie osłabiony, z ograniczoną samodzielnością).',

        'Nie łącz ACEi i ARB ze sobą.',

        `II rzut (krok 2 — brak kontroli po 1–3 mies. na 2 lekach): eskaluj do terapii 3‑lekowej: ${tripleCombo}`,
        'Przykłady preparatów 3‑składnikowych (1 tabletka):',
        `– ${fdcTriple[0]}`,
        `– ${fdcTriple[1]}`,
        `– ${fdcTriple[2]}`,
        'Preferuj preparaty złożone (1 tabletka), jeśli dostępne i dobrze tolerowane.',

        'III rzut (krok 3 — brak kontroli po 1–3 mies. na 3 lekach): zwiększ dawki do maksymalnych tolerowanych; równolegle zweryfikuj pseudooporność (adherencja, technika pomiaru, ABPM/HBPM, czynniki/leki podnoszące BP) i rozważ diagnostykę przyczyn wtórnych.',

        'IV rzut (krok 4 — podejrzenie nadciśnienia opornego): rozważ, gdy BP pozostaje poza celem mimo maksymalnie tolerowanej terapii 3‑lekowej (ACEi/ARB + CCB + diuretyk) oraz po wykluczeniu pseudooporności.',
        'Postępowanie: ocena adherencji, ABPM/HBPM, diagnostyka przyczyn wtórnych; rozważ konsultację/skierowanie do ośrodka hipertensjologicznego.',

        'Jeśli brak przeciwwskazań i możliwy monitoring (K+ i funkcja nerek): rozważ dołączenie MRA (antagonista receptora mineralokortykoidowego):',
        'MRA:',
        `– ${mraItems[0]}`,
        `– ${mraItems[1]}`,

        'Beta‑bloker może być dodany na dowolnym etapie, jeżeli istnieją wskazania kliniczne (np. dławica, stan po zawale, HFrEF, kontrola częstości w tachyarytmiach — np. AF/AFL).',
        'Przykłady beta‑blokerów:',
        `– ${bbItems[0]}`,
        `– ${bbItems[1]}`,
        `– ${bbItems[2]}`,
        `– ${bbItems[3]}`,

        'Ciąża / planowanie ciąży: ACEi i ARB są przeciwwskazane. Leczenie dobieraj wg wytycznych położniczych (np. labetalol — Trandate; metyldopa — Dopegyt; nifedypina o przedłużonym uwalnianiu) i/lub po konsultacji.',
      ];

      points.push({
        text: 'Farmakoterapia — krok po kroku (I–IV): dobór klas i eskalacja leczenia wg ESC 2024:',
        bullets: pharmBullets,
      });

      // 6) Szybka podpowiedź na podstawie danych i wybranego etapu
      const actionBullets = [];
      if (sbp != null && dbp != null) {
        const stageLabel = stage === 'init'
          ? 'I rzut (rozpoczęcie)'
          : stage === 'step2'
            ? 'II rzut (eskalacja do 3 leków)'
            : stage === 'step3'
              ? 'III rzut (maksymalizacja terapii 3‑lekowej)'
              : 'IV rzut (nadciśnienie oporne)';

        actionBullets.push(`Wybrany etap w module: ${stageLabel}.`);

        if (!pharmIndicated) {
          if (bp.key === 'elevated' && isBp130_80Plus(sbp, dbp) && !highRisk) {
            actionBullets.push('W tej konfiguracji (bez „wysokiego ryzyka”): preferuj interwencje niefarmakologiczne + monitorowanie; farmakoterapię rozważ po ocenie całkowitego ryzyka.');
          } else if (bp.key === 'normal') {
            actionBullets.push('Brak wskazań do farmakoterapii — profilaktyka i okresowa kontrola BP.');
          } else {
            actionBullets.push('Zanim podejmiesz decyzję o lekach: potwierdź BP oraz wykonaj ocenę ryzyka sercowo‑naczyniowego.');
          }
        } else {
          if (pregnancy) {
            actionBullets.push('Zaznaczono ciążę/planowanie: nie stosuj ACEi/ARB. Dobór leczenia wg wytycznych położniczych/konsultacji.');
          } else {
            const age85 = (ctx.ageYears != null && ctx.ageYears >= 85);
            const preferMonoNow = monoPref || age85 || (bp.key === 'elevated');

            if (stage === 'init') {
              if (preferMonoNow) {
                actionBullets.push('Preferuj wstępną monoterapię w niskiej dawce (z miareczkowaniem): wybierz 1 z klas 1. wyboru.');
                actionBullets.push('Przykłady klas 1. wyboru (wybierz jedną):');

                actionBullets.push('ACEi:');
                aceiItems.forEach((it) => actionBullets.push(`– ${it}`));

                actionBullets.push('ARB/sartany:');
                arbItems.forEach((it) => actionBullets.push(`– ${it}`));

                actionBullets.push('CCB (dihydropirydynowe):');
                ccbItems.forEach((it) => actionBullets.push(`– ${it}`));

                actionBullets.push('Diuretyki tiazydowe/tiazydopodobne:');
                diurItems.forEach((it) => actionBullets.push(`– ${it}`));
              } else {
                const chosenCombo = combo === 'ras_diuretic' ? comboRasDiur : comboRasCcb;
                actionBullets.push('Preferuj terapię 2‑lekową w niskich dawkach (najlepiej preparat złożony w 1 tabletce).');
                actionBullets.push(`Wybrane połączenie: ${chosenCombo}`);
                actionBullets.push('Przykłady preparatów złożonych (1 tabletka):');
                (combo === 'ras_diuretic' ? fdcRasDiur : fdcRasCcb).forEach((it) => actionBullets.push(`– ${it}`));
              }
            } else if (stage === 'step2') {
              actionBullets.push('Jeśli BP poza celem po 1–3 mies. na 2 lekach: przejdź na terapię 3‑lekową (ACEi/ARB + CCB + diuretyk).');
              if (combo === 'ras_ccb') {
                actionBullets.push('Jeśli dotychczas było ACEi/ARB + CCB: dołącz diuretyk tiazydowy/tiazydopodobny.');
              } else {
                actionBullets.push('Jeśli dotychczas było ACEi/ARB + diuretyk: dołącz CCB (dihydropirydynowy).');
              }
              actionBullets.push(`Docelowy schemat 3‑lekowy: ${tripleCombo}`);
              actionBullets.push('Przykłady preparatów złożonych (1 tabletka):');
              fdcTriple.forEach((it) => actionBullets.push(`– ${it}`));
            } else if (stage === 'step3') {
              actionBullets.push('Jeśli BP poza celem po 1–3 mies. na 3 lekach: zwiększ dawki do maksymalnych tolerowanych i zweryfikuj pseudooporność.');
              actionBullets.push('Weryfikacja: adherencja, ABPM/HBPM, technika pomiaru, przyczyny wtórne, leki podnoszące BP.');
            } else if (stage === 'resistant') {
              actionBullets.push('Podejrzenie nadciśnienia opornego: skieruj do ośrodka/hipertensjologa i oceń pseudooporność.');
              actionBullets.push(`Rozważ dodanie MRA (np. ${mraItems[0]}) — monitoruj potas i funkcję nerek.`);
            }
          }

          if (betaInd) {
            actionBullets.push('Zaznaczono wskazania do beta‑blokera: rozważ dołączenie beta‑blokera na dowolnym etapie (np. w dławicy, po zawale, w HFrEF lub do kontroli częstości pracy serca w tachyarytmiach).');
          }
        }
      } else {
        actionBullets.push('Uzupełnij SBP i DBP, aby otrzymać spersonalizowaną „szybką podpowiedź” dla wybranego etapu.');
      }

      points.push({
        text: 'Szybka podpowiedź na podstawie Twoich danych i ustawień modułu:',
        bullets: actionBullets,
      });

      // Informacja o źródle (widoczna w „Uwagi”)
      notes.push('Algorytm oparty na Wytycznych ESC 2024 dotyczących postępowania w podwyższonym BP i nadciśnieniu (Kardiologia Polska 2–3/2024; praktyczny algorytm farmakoterapii).');

      const html = renderRecHtml(title, points);
      const plain = renderRecPlain(title, points);
      const plainCopy = plain.replace(/^[^\n]*\n?/, '').trimStart();

      return { html, plainCopy, notes };
    }



    // Aktualizacja listy „Preferowane połączenie…” zależnie od wybranego etapu leczenia.
    // Dzięki temu opis opcji zmienia się „na żywo” po każdej zmianie etapu.
    function syncComboOptions() {
      if (!comboEl || !stageEl) return;

      const stage = stageEl.value || 'init';
      const prevValue = comboEl.value || 'ras_ccb';

      const optionsByStage = {
        init: [
          {
            value: 'ras_ccb',
            label: 'ACEi/ARB + CCB (dihydropirydynowy)',
          },
          {
            value: 'ras_diuretic',
            label: 'ACEi/ARB + diuretyk (tiazydowy/tiazydopodobny)',
          },
        ],
        step2: [
          {
            value: 'ras_ccb',
            label: '2 leki: ACEi/ARB + CCB → dołącz diuretyk (3 leki)',
          },
          {
            value: 'ras_diuretic',
            label: '2 leki: ACEi/ARB + diuretyk → dołącz CCB (3 leki)',
          },
        ],
        step3: [
          {
            value: 'ras_ccb',
            label: '3 leki: ACEi/ARB + CCB + diuretyk',
          },
          {
            value: 'ras_diuretic',
            label: '3 leki: ACEi/ARB + CCB + diuretyk',
          },
        ],
        resistant: [
          {
            value: 'ras_ccb',
            label: 'Podejrzenie opornego: 3 leki + rozważ MRA / diagnostyka wtórna',
          },
          {
            value: 'ras_diuretic',
            label: 'Podejrzenie opornego: 3 leki + rozważ MRA / diagnostyka wtórna',
          },
        ],
      };

      const opts = optionsByStage[stage] || optionsByStage.init;

      // Odśwież listę opcji
      comboEl.innerHTML = '';
      opts.forEach((it) => {
        const opt = document.createElement('option');
        opt.value = it.value;
        opt.textContent = it.label;
        comboEl.appendChild(opt);
      });

      // Zachowaj poprzedni wybór, jeśli nadal ma sens
      if (opts.some((o) => o.value === prevValue)) {
        comboEl.value = prevValue;
      } else {
        comboEl.value = opts[0]?.value || 'ras_ccb';
      }
    }

    function updateOutput() {
      const ctx = getUserContext();
      syncAdultOnlyUi(ctx);

      // Dla dorosłych odświeżamy opcje „Preferowane połączenie…” zgodnie z wybranym etapem.
      // W trybie pediatrycznym selektory są ukryte i nie mają znaczenia klinicznego.
      if (!(ctx && typeof ctx.ageYears === 'number' && !isNaN(ctx.ageYears) && ctx.ageYears < 18)) {
        syncComboOptions();
      }

      if (!hasRequiredBpValues()) {
        showMissingBpMessage();
        return;
      }

      const plan = buildPlan();
      resultBox.innerHTML = plan.html;
      if (copyBtn) copyBtn.dataset.copyText = plan.plainCopy;
      setEligibilityInfo(plan.notes || []);
    }

    // Domyślny komunikat
    showMissingBpMessage();

    
    // Ujednolicenie szerokości przycisku „Leczenie nadciśnienia” z pozostałymi przyciskami modułu.
    // app.js może ustawiać szerokości (px w układzie ≥700px; 100% w układzie jednokolumnowym) dla listy głównych przycisków,
    // ale nie obejmuje toggleHypertensionTherapy. Dla spójności kopiujemy szerokość z przycisku referencyjnego.
    function syncHypertensionButtonWidth() {
      try {
        if (!toggleBtn) return;

        const refIds = [
          'toggleIgfTests',
          'toggleEndoTests',
          'toggleAbxTherapy',
          'toggleFluTherapy',
          'toggleObesityTherapy',
          'toggleBisphos',
          'toggleZscore',
          'toggleGhTests',
          'toggleOgttTests',
          'toggleActhTests',
        ];

        let refWidth = '';
        for (const id of refIds) {
          const b = document.getElementById(id);
          if (b && b.style && b.style.width) {
            refWidth = b.style.width;
            break;
          }
        }

        if (refWidth) {
          toggleBtn.style.width = refWidth;
        } else {
          // Fallback: zachowanie podobne do app.js
          toggleBtn.style.width = (window.innerWidth < 700) ? '100%' : 'auto';
        }
      } catch (e) {
        // ignore
      }
    }

// Widoczność modułu zależna od aktywacji modułu profesjonalnego
    function syncVisibilityWithDoctorModule() {
      const abxWrapper = $('abxButtonWrapper');
      const doctorOn = !!abxWrapper
        && window.getComputedStyle(abxWrapper).display !== 'none'
        && abxWrapper.style.display !== 'none';

      if (doctorOn) {
        wrapper.style.display = 'flex';
        syncHypertensionButtonWidth();
      } else {
        wrapper.style.display = 'none';
        card.style.display = 'none';
        toggleBtn.classList.remove('active-toggle');
      }
    }

    syncVisibilityWithDoctorModule();

    // Dopasuj szerokość przycisku „Leczenie nadciśnienia” do pozostałych przycisków modułu.
    // W układzie jednokolumnowym będzie to zwykle 100%; w dwukolumnowym – stała szerokość w px.
    syncHypertensionButtonWidth();
    window.addEventListener('resize', () => {
      requestAnimationFrame(syncHypertensionButtonWidth);
    });

    const visInterval = setInterval(syncVisibilityWithDoctorModule, 700);
    setTimeout(() => clearInterval(visInterval), 12000);

    // Toggle card
    toggleBtn.addEventListener('click', () => {
      const isHidden = (card.style.display === 'none' || card.style.display === '');
      card.style.display = isHidden ? 'block' : 'none';
      toggleBtn.classList.toggle('active-toggle', isHidden);
      if (isHidden) updateOutput();
    });

    // Aktualizacja po zmianach
    // Aktualizuj również po zmianie danych z karty „Dane użytkownika” (wiek, płeć, wzrost, masa) — istotne dla części pediatrycznej.
    const inputs = [
      sbpEl,
      dbpEl,
      highRiskEl,
      monoPrefEl,
      betaIndEl,
      pregEl,
      stageEl,
      comboEl,
      $('age'),
      $('ageMonths'),
      $('sex'),
      $('height'),
      $('weight'),
    ].filter(Boolean);
    inputs.forEach((el) => {
      el.addEventListener('input', () => {
        if (card.style.display === 'none' || card.style.display === '') return;
        updateOutput();
      });
      el.addEventListener('change', () => {
        if (card.style.display === 'none' || card.style.display === '') return;
        updateOutput();
      });
    });

    // Kopiowanie (przycisk może być ukryty w HTML)
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const txt = copyBtn.dataset.copyText || '';
      if (!txt.trim()) {
        showTooltip(copyBtn, 'Brak zaleceń do skopiowania.');
        return;
      }
      copyTextToClipboard(txt).then((ok) => {
        if (ok) showTooltip(copyBtn, 'Zalecenia skopiowane do schowka.');
        else showTooltip(copyBtn, 'Nie udało się skopiować. Zaznacz i skopiuj ręcznie.');
      });
    });
  });
})();
