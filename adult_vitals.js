(function(window, document) {
  'use strict';

  const GUIDELINES = {
    AHA: {
      key: 'AHA',
      label: 'AHA/ACC',
      shortLabel: 'AHA',
      cardLabel: 'Klasyfikacja AHA/ACC dla dorosłych'
    },
    ESC: {
      key: 'ESC',
      label: 'ESC/PTK',
      shortLabel: 'ESC/PTK',
      cardLabel: 'Klasyfikacja ESC/PTK dla dorosłych'
    }
  };

  function el(id) {
    return document.getElementById(id);
  }

  function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : NaN;
  }

  function formatInt(value) {
    const num = toNumber(value);
    return Number.isFinite(num) ? String(Math.round(num)) : '—';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function appendSentence(base, addition) {
    const current = String(base || '').trim();
    const extra = String(addition || '').trim();
    if (!current) return extra;
    if (!extra) return current;
    const needsDot = /[.!?]$/.test(current);
    return needsDot ? `${current} ${extra}` : `${current}. ${extra}`;
  }

  function joinContextParts(parts) {
    const clean = (parts || []).map(function(part) {
      return String(part || '').trim();
    }).filter(Boolean);
    if (!clean.length) return '';
    if (clean.length === 1) return clean[0];
    if (clean.length === 2) return clean[0] + ' lub ' + clean[1];
    return clean.slice(0, -1).join(', ') + ' lub ' + clean[clean.length - 1];
  }

  function getSelectedGuidelineKey() {
    const toggle = el('adultBpGuidelineToggle');
    return (toggle && toggle.checked) ? 'ESC' : 'AHA';
  }

  function getGuidelineMeta(key) {
    return GUIDELINES[String(key || '').toUpperCase()] || GUIDELINES.ESC;
  }

  function getState() {
    const guidelineKey = getSelectedGuidelineKey();
    const meta = getGuidelineMeta(guidelineKey);
    return {
      guidelineKey: meta.key,
      guidelineLabel: meta.label,
      guidelineCardLabel: meta.cardLabel,
      sbp: toNumber(el('adultBpSystolic') && el('adultBpSystolic').value),
      dbp: toNumber(el('adultBpDiastolic') && el('adultBpDiastolic').value),
      hr: toNumber(el('adultHeartRate') && el('adultHeartRate').value),
      athlete: !!(el('adultHrAthlete') && el('adultHrAthlete').checked),
      betaBlocker: !!(el('adultHrBetaBlocker') && el('adultHrBetaBlocker').checked)
    };
  }

  function clearHomePulse(node) {
    if (!node) return;
    try {
      if (typeof window.clearPulse === 'function') {
        window.clearPulse(node);
        return;
      }
    } catch (_) {}
    node.classList.remove('pulse-danger-infinite', 'pulse-warning-infinite', 'pulse-danger-2s', 'pulse-warning-2s');
  }

  function applyHomePulse(node, level) {
    if (!node || !level) return;
    try {
      if (typeof window.applyPulse === 'function') {
        window.applyPulse(node, level);
        return;
      }
    } catch (_) {}
    const cls = level === 'danger' ? 'pulse-danger-infinite' : 'pulse-warning-infinite';
    node.classList.add(cls);
  }

  function syncHomeResultTone(resultBox, tone) {
    if (!resultBox) return;
    resultBox.classList.remove('adult-vitals-warning', 'adult-vitals-danger');
    clearHomePulse(resultBox);
    if (tone === 'danger') {
      resultBox.classList.add('adult-vitals-danger');
      applyHomePulse(resultBox, 'danger');
    } else if (tone === 'warn') {
      resultBox.classList.add('adult-vitals-warning');
      applyHomePulse(resultBox, 'warning');
    }
  }

  function hasAnyMeasurement(state) {
    const s = state || getState();
    return (Number.isFinite(s.sbp) && s.sbp > 0)
      || (Number.isFinite(s.dbp) && s.dbp > 0)
      || (Number.isFinite(s.hr) && s.hr > 0);
  }

  function getMeasurementValueText(top, bottom, unit) {
    const hasTop = Number.isFinite(top) && top > 0;
    const hasBottom = Number.isFinite(bottom) && bottom > 0;
    if (hasTop && hasBottom) return `${formatInt(top)}/${formatInt(bottom)} ${unit}`;
    if (hasTop) return `${formatInt(top)}/— ${unit}`;
    if (hasBottom) return `—/${formatInt(bottom)} ${unit}`;
    return '';
  }

  function getHeartRateContextText(opts) {
    const hasBetaBlocker = !!(opts && opts.betaBlocker);
    const hasAthleteContext = !!(opts && opts.athlete);
    if (hasBetaBlocker && hasAthleteContext) return 'stosowaniu beta‑blokera i regularnym uprawianiu sportu';
    if (hasBetaBlocker) return 'stosowaniu beta‑blokera';
    if (hasAthleteContext) return 'regularnym uprawianiu sportu';
    return '';
  }

  function getHeartRateContextRowText(opts) {
    const hasBetaBlocker = !!(opts && opts.betaBlocker);
    const hasAthleteContext = !!(opts && opts.athlete);
    if (hasBetaBlocker && hasAthleteContext) {
      return 'Stosowanie beta‑blokera i regularne uprawianie sportu mogą obniżać tętno spoczynkowe.';
    }
    if (hasBetaBlocker) {
      return 'Stosowanie beta‑blokera może obniżać tętno spoczynkowe.';
    }
    if (hasAthleteContext) {
      return 'Regularne uprawianie sportu może obniżać tętno spoczynkowe.';
    }
    return '';
  }

  function classifyBloodPressure(sbp, dbp, guidelineKey) {
    const guideline = getGuidelineMeta(guidelineKey);
    const hasSbp = Number.isFinite(sbp) && sbp > 0;
    const hasDbp = Number.isFinite(dbp) && dbp > 0;
    const valueText = getMeasurementValueText(sbp, dbp, 'mm Hg');

    if (!hasSbp && !hasDbp) {
      return {
        hasMeasurement: false,
        hasCompleteMeasurement: false,
        guidelineKey: guideline.key,
        guidelineLabel: guideline.label,
        key: 'missing',
        tone: 'normal',
        badge: 'Informacyjnie',
        valueText: '',
        shortStatus: 'Brak wpisanego pomiaru RR.',
        statusText: 'Wpisz ciśnienie skurczowe i rozkurczowe, aby odnieść wynik do wytycznych dla dorosłych.',
        summaryTail: '',
        note: '',
        headlineTitle: 'Ciśnienie tętnicze u dorosłych warto oceniać w powtarzanych pomiarach.',
        headlineText: 'Do interpretacji potrzebny jest rzeczywisty pomiar ciśnienia skurczowego i rozkurczowego.'
      };
    }

    if (!(hasSbp && hasDbp)) {
      return {
        hasMeasurement: true,
        hasCompleteMeasurement: false,
        guidelineKey: guideline.key,
        guidelineLabel: guideline.label,
        key: 'partial',
        tone: 'normal',
        badge: 'Informacyjnie',
        valueText,
        shortStatus: 'Niepełny pomiar RR.',
        statusText: 'Aby sklasyfikować ciśnienie tętnicze u dorosłych, wpisz zarówno wartość skurczową, jak i rozkurczową.',
        summaryTail: '',
        note: 'Do pełnej klasyfikacji potrzebne są obie składowe ciśnienia tętniczego.',
        headlineTitle: 'Ciśnienie tętnicze wymaga uzupełnienia pomiaru.',
        headlineText: 'Do klasyfikacji potrzebne są jednocześnie wartości skurczowe i rozkurczowe.'
      };
    }

    const isSevere = sbp > 180 || dbp > 120;
    const isAhaStage2 = sbp >= 140 || dbp >= 90;
    const isAhaStage1 = (sbp >= 130 && sbp <= 139) || (dbp >= 80 && dbp <= 89);
    const isAhaElevated = (sbp >= 120 && sbp <= 129 && dbp < 80);
    const isEscHypertension = sbp >= 140 || dbp >= 90;
    const isLow = sbp < 90 || dbp < 60;

    if (guideline.key === 'AHA') {
      if (isSevere) {
        return {
          hasMeasurement: true,
          hasCompleteMeasurement: true,
          guidelineKey: guideline.key,
          guidelineLabel: guideline.label,
          key: 'severe',
          tone: 'danger',
          badge: 'Pilna kontrola',
          valueText,
          classificationLabel: 'bardzo wysokie ciśnienie tętnicze',
          shortStatus: 'bardzo wysokie ciśnienie tętnicze.',
          statusText: 'bardzo wysokie ciśnienie tętnicze (>180 i/lub >120 mm Hg).',
          summaryTail: 'bardzo wysokie ciśnienie tętnicze.',
          note: 'bardzo wysokie ciśnienie tętnicze (>180 i/lub >120 mm Hg).',
          headlineTitle: 'Ciśnienie tętnicze jest bardzo wysokie u dorosłych.',
          headlineText: 'Wynik przekracza 180 i/lub 120 mm Hg.'
        };
      }
      if (isAhaStage2) {
        return {
          hasMeasurement: true,
          hasCompleteMeasurement: true,
          guidelineKey: guideline.key,
          guidelineLabel: guideline.label,
          key: 'stage2',
          tone: 'danger',
          badge: 'Nadciśnienie 2°',
          valueText,
          classificationLabel: 'nadciśnienie 2. stopnia',
          shortStatus: 'nadciśnienie 2. stopnia.',
          statusText: 'nadciśnienie 2. stopnia (≥140 i/lub ≥90 mm Hg).',
          summaryTail: 'nadciśnienie 2. stopnia.',
          note: 'nadciśnienie 2. stopnia (≥140 i/lub ≥90 mm Hg).',
          headlineTitle: 'Ciśnienie tętnicze odpowiada nadciśnieniu 2. stopnia u dorosłych.',
          headlineText: 'Wynik odpowiada nadciśnieniu 2. stopnia.'
        };
      }
      if (isAhaStage1) {
        return {
          hasMeasurement: true,
          hasCompleteMeasurement: true,
          guidelineKey: guideline.key,
          guidelineLabel: guideline.label,
          key: 'stage1',
          tone: 'warn',
          badge: 'Nadciśnienie 1°',
          valueText,
          classificationLabel: 'nadciśnienie 1. stopnia',
          shortStatus: 'nadciśnienie 1. stopnia.',
          statusText: 'nadciśnienie 1. stopnia (130–139 i/lub 80–89 mm Hg).',
          summaryTail: 'nadciśnienie 1. stopnia.',
          note: 'nadciśnienie 1. stopnia (130–139 i/lub 80–89 mm Hg).',
          headlineTitle: 'Ciśnienie tętnicze odpowiada nadciśnieniu 1. stopnia u dorosłych.',
          headlineText: 'Wynik odpowiada nadciśnieniu 1. stopnia.'
        };
      }
      if (isAhaElevated) {
        return {
          hasMeasurement: true,
          hasCompleteMeasurement: true,
          guidelineKey: guideline.key,
          guidelineLabel: guideline.label,
          key: 'elevated',
          tone: 'warn',
          badge: 'Ciśnienie podwyższone',
          valueText,
          classificationLabel: 'ciśnienie podwyższone',
          shortStatus: 'ciśnienie podwyższone.',
          statusText: 'ciśnienie podwyższone (120–129 i <80 mm Hg).',
          summaryTail: 'ciśnienie podwyższone.',
          note: 'ciśnienie podwyższone (120–129 i <80 mm Hg).',
          headlineTitle: 'Ciśnienie tętnicze jest podwyższone u dorosłych.',
          headlineText: 'Wynik mieści się w kategorii ciśnienia podwyższonego.'
        };
      }
      if (isLow) {
        return {
          hasMeasurement: true,
          hasCompleteMeasurement: true,
          guidelineKey: guideline.key,
          guidelineLabel: guideline.label,
          key: 'low',
          tone: 'warn',
          badge: 'Do interpretacji',
          valueText,
          classificationLabel: 'ciśnienie poniżej typowego zakresu',
          shortStatus: 'Wynik poniżej typowego zakresu dla dorosłych.',
          statusText: 'Wynik znajduje się poniżej typowego zakresu dla dorosłych (<90 i/lub <60 mm Hg).',
          summaryTail: 'wynik poniżej typowego zakresu dla dorosłych.',
          note: 'Wynik znajduje się poniżej typowego zakresu dla dorosłych (<90 i/lub <60 mm Hg).',
          headlineTitle: 'Ciśnienie tętnicze jest poniżej typowego zakresu dla dorosłych.',
          headlineText: 'Wynik znajduje się poniżej typowego zakresu dla dorosłych.'
        };
      }
      return {
        hasMeasurement: true,
        hasCompleteMeasurement: true,
        guidelineKey: guideline.key,
        guidelineLabel: guideline.label,
        key: 'normal',
        tone: 'normal',
        badge: 'W zakresie',
        valueText,
        classificationLabel: 'prawidłowe ciśnienie tętnicze',
        shortStatus: 'prawidłowe ciśnienie tętnicze.',
        statusText: 'prawidłowe ciśnienie tętnicze (<120 i <80 mm Hg).',
        summaryTail: 'wynik w prawidłowym zakresie dla dorosłych.',
        note: 'prawidłowe ciśnienie tętnicze (<120 i <80 mm Hg).',
        headlineTitle: 'Ciśnienie tętnicze mieści się w prawidłowym zakresie dla dorosłych.',
        headlineText: 'Wynik mieści się w prawidłowym zakresie.'
      };
    }

    if (isSevere) {
      return {
        hasMeasurement: true,
        hasCompleteMeasurement: true,
        guidelineKey: guideline.key,
        guidelineLabel: guideline.label,
        key: 'severe',
        tone: 'danger',
        badge: 'Pilna kontrola',
        valueText,
        classificationLabel: 'bardzo wysokie ciśnienie tętnicze',
        shortStatus: 'bardzo wysokie ciśnienie tętnicze.',
        statusText: 'bardzo wysokie ciśnienie tętnicze (>180 i/lub >120 mm Hg).',
        summaryTail: 'bardzo wysokie ciśnienie tętnicze.',
        note: 'bardzo wysokie ciśnienie tętnicze (>180 i/lub >120 mm Hg).',
        headlineTitle: 'Ciśnienie tętnicze jest bardzo wysokie u dorosłych.',
        headlineText: 'Wynik przekracza 180 i/lub 120 mm Hg.'
      };
    }
    if (isEscHypertension) {
      return {
        hasMeasurement: true,
        hasCompleteMeasurement: true,
        guidelineKey: guideline.key,
        guidelineLabel: guideline.label,
        key: 'hypertension',
        tone: 'danger',
        badge: 'Nadciśnienie',
        valueText,
        classificationLabel: 'nadciśnienie tętnicze',
        shortStatus: 'nadciśnienie tętnicze.',
        statusText: 'nadciśnienie tętnicze (≥140 i/lub ≥90 mm Hg).',
        summaryTail: 'nadciśnienie tętnicze.',
        note: 'nadciśnienie tętnicze (≥140 i/lub ≥90 mm Hg).',
        headlineTitle: 'Ciśnienie tętnicze odpowiada nadciśnieniu tętniczemu u dorosłych.',
        headlineText: 'Wynik odpowiada nadciśnieniu tętniczemu.'
      };
    }
    if (isLow) {
      return {
        hasMeasurement: true,
        hasCompleteMeasurement: true,
        guidelineKey: guideline.key,
        guidelineLabel: guideline.label,
        key: 'low',
        tone: 'warn',
        badge: 'Do interpretacji',
        valueText,
        classificationLabel: 'ciśnienie poniżej typowego zakresu',
        shortStatus: 'Wynik poniżej typowego zakresu dla dorosłych.',
        statusText: 'Wynik znajduje się poniżej typowego zakresu dla dorosłych (<90 i/lub <60 mm Hg).',
        summaryTail: 'wynik poniżej typowego zakresu dla dorosłych.',
        note: 'Wynik znajduje się poniżej typowego zakresu dla dorosłych (<90 i/lub <60 mm Hg).',
        headlineTitle: 'Ciśnienie tętnicze jest poniżej typowego zakresu dla dorosłych.',
        headlineText: 'Wynik znajduje się poniżej typowego zakresu dla dorosłych.'
      };
    }
    if (sbp >= 120 || dbp >= 70) {
      return {
        hasMeasurement: true,
        hasCompleteMeasurement: true,
        guidelineKey: guideline.key,
        guidelineLabel: guideline.label,
        key: 'elevated',
        tone: 'warn',
        badge: 'Ciśnienie podwyższone',
        valueText,
        classificationLabel: 'podwyższone ciśnienie tętnicze',
        shortStatus: 'podwyższone ciśnienie tętnicze.',
        statusText: 'podwyższone ciśnienie tętnicze (120–139 i/lub 70–89 mm Hg).',
        summaryTail: 'podwyższone ciśnienie tętnicze.',
        note: 'podwyższone ciśnienie tętnicze (120–139 i/lub 70–89 mm Hg).',
        headlineTitle: 'Ciśnienie tętnicze jest podwyższone u dorosłych.',
        headlineText: 'Wynik mieści się w kategorii podwyższonego ciśnienia tętniczego.'
      };
    }
    return {
      hasMeasurement: true,
      hasCompleteMeasurement: true,
      guidelineKey: guideline.key,
      guidelineLabel: guideline.label,
      key: 'normal',
      tone: 'normal',
      badge: 'W zakresie',
      valueText,
      classificationLabel: 'prawidłowe ciśnienie tętnicze',
      shortStatus: 'prawidłowe ciśnienie tętnicze.',
      statusText: 'prawidłowe ciśnienie tętnicze (<120 i <70 mm Hg).',
      summaryTail: 'wynik w prawidłowym zakresie dla dorosłych.',
      note: 'prawidłowe ciśnienie tętnicze (<120 i <70 mm Hg).',
      headlineTitle: 'Ciśnienie tętnicze mieści się w prawidłowym zakresie dla dorosłych.',
      headlineText: 'Wynik mieści się w prawidłowym zakresie.'
    };
  }

  function classifyHeartRate(hr, opts) {
    const hasMeasurement = Number.isFinite(hr) && hr > 0;
    const contextText = getHeartRateContextText(opts || {});
    const hasContext = !!contextText;
    const valueText = hasMeasurement ? `${formatInt(hr)} ud./min` : '';

    if (!hasMeasurement) {
      return {
        hasMeasurement: false,
        tone: 'normal',
        badge: 'Informacyjnie',
        key: 'missing',
        valueText: '',
        shortStatus: 'Brak wpisanego tętna.',
        statusText: 'Wpisz tętno spoczynkowe, aby odnieść wynik do typowego zakresu 60–100/min u dorosłych.',
        summaryTail: '',
        note: '',
        headlineTitle: 'Tętno spoczynkowe u dorosłych warto interpretować w pełnym spoczynku.',
        headlineText: 'Do oceny potrzebny jest rzeczywisty pomiar tętna spoczynkowego.'
      };
    }

    if (hr > 100) {
      return {
        hasMeasurement: true,
        tone: 'warn',
        badge: 'Tachykardia',
        key: 'high',
        valueText,
        shortStatus: 'powyżej typowego zakresu spoczynkowego.',
        statusText: 'Tętno spoczynkowe przekracza typowy zakres dla dorosłych (>100/min).',
        summaryTail: 'powyżej typowego zakresu spoczynkowego dla dorosłych.',
        note: 'Tętno spoczynkowe przekracza typowy zakres dla dorosłych (>100/min).',
        headlineTitle: 'Tętno spoczynkowe jest powyżej typowego zakresu dla dorosłych.',
        headlineText: 'Tętno spoczynkowe przekracza typowy zakres dla dorosłych.'
      };
    }

    if (hr < 60) {
      if (hasContext) {
        if (hr >= 50) {
          return {
            hasMeasurement: true,
            tone: 'normal',
            badge: 'Do interpretacji',
            key: 'low-context',
            valueText,
            shortStatus: 'poniżej 60/min, z możliwym wpływem treningu lub beta‑blokera.',
            statusText: `Tętno spoczynkowe jest poniżej 60/min. Przy ${contextText} taki wynik może występować.`,
            summaryTail: 'poniżej typowego zakresu spoczynkowego dla dorosłych.',
            note: `Tętno spoczynkowe jest poniżej 60/min. Przy ${contextText} taki wynik może występować.`,
            headlineTitle: 'Tętno spoczynkowe jest poniżej typowego zakresu dla dorosłych.',
            headlineText: `Przy ${contextText} niższe tętno spoczynkowe może występować.`
          };
        }
        return {
          hasMeasurement: true,
          tone: 'warn',
          badge: 'Do oceny',
          key: 'low-context-warn',
          valueText,
          shortStatus: 'wyraźnie poniżej 60/min, z możliwym wpływem treningu lub beta‑blokera.',
          statusText: `Tętno spoczynkowe jest wyraźnie poniżej 60/min. Przy ${contextText} taki wynik może występować.`,
          summaryTail: 'wyraźnie poniżej typowego zakresu spoczynkowego dla dorosłych.',
          note: `Tętno spoczynkowe jest wyraźnie poniżej 60/min. Przy ${contextText} taki wynik może występować.`,
          headlineTitle: 'Tętno spoczynkowe jest wyraźnie poniżej typowego zakresu dla dorosłych.',
          headlineText: `Przy ${contextText} niższe tętno spoczynkowe może występować.`
        };
      }
      return {
        hasMeasurement: true,
        tone: 'warn',
        badge: 'Bradykardia',
        key: 'low',
        valueText,
        shortStatus: 'poniżej typowego zakresu spoczynkowego.',
        statusText: 'Tętno spoczynkowe jest poniżej typowego zakresu dla dorosłych (<60/min).',
        summaryTail: 'poniżej typowego zakresu spoczynkowego dla dorosłych.',
        note: 'Tętno spoczynkowe jest poniżej typowego zakresu dla dorosłych (<60/min).',
        headlineTitle: 'Tętno spoczynkowe jest poniżej typowego zakresu dla dorosłych.',
        headlineText: 'Tętno spoczynkowe jest poniżej typowego zakresu dla dorosłych.'
      };
    }

    return {
      hasMeasurement: true,
      tone: 'normal',
      badge: 'W zakresie',
      key: 'normal',
      valueText,
      shortStatus: 'w typowym zakresie spoczynkowym.',
      statusText: 'Tętno spoczynkowe mieści się w typowym zakresie 60–100/min dla dorosłych.',
      summaryTail: 'w typowym zakresie spoczynkowym dla dorosłych.',
      note: 'Tętno spoczynkowe mieści się w typowym zakresie 60–100/min dla dorosłych.',
      headlineTitle: 'Tętno spoczynkowe mieści się w typowym zakresie dla dorosłych.',
      headlineText: 'Wynik nie wskazuje na odchylenie od typowego zakresu spoczynkowego.'
    };
  }

  function buildBloodPressureRows(guidelineKey, activeKey) {
    if (String(guidelineKey || '').toUpperCase() === 'AHA') {
      return [
        { label: 'Prawidłowe', value: '<120 i <80 mm Hg', highlighted: activeKey === 'normal' },
        { label: 'Podwyższone', value: '120–129 i <80 mm Hg', highlighted: activeKey === 'elevated' },
        { label: 'Nadciśnienie 1°', value: '130–139 lub 80–89 mm Hg', highlighted: activeKey === 'stage1' },
        { label: 'Nadciśnienie 2°', value: '≥140 lub ≥90 mm Hg', highlighted: activeKey === 'stage2' },
        { label: 'Bardzo wysokie', value: '>180 i/lub >120 mm Hg', highlighted: activeKey === 'severe' },
        { label: 'Niskie RR*', value: '<90 i/lub <60 mm Hg', highlighted: activeKey === 'low' }
      ];
    }
    return [
      { label: 'Prawidłowe', value: '<120 i <70 mm Hg', highlighted: activeKey === 'normal' },
      { label: 'Podwyższone RR', value: '120–139 lub 70–89 mm Hg', highlighted: activeKey === 'elevated' },
      { label: 'Nadciśnienie', value: '≥140 lub ≥90 mm Hg', highlighted: activeKey === 'hypertension' },
      { label: 'Bardzo wysokie', value: '>180 i/lub >120 mm Hg', highlighted: activeKey === 'severe' },
      { label: 'Niskie RR*', value: '<90 i/lub <60 mm Hg', highlighted: activeKey === 'low' }
    ];
  }

  function buildHeartRateRows(hrInfo, state) {
    const rows = [
      { label: 'Typowe', value: '60–100 / min', highlighted: hrInfo.key === 'normal' },
      { label: 'Poniżej zakresu', value: '<60 / min', highlighted: hrInfo.key === 'low' || hrInfo.key === 'low-context' || hrInfo.key === 'low-context-warn' },
      { label: 'Powyżej zakresu', value: '>100 / min', highlighted: hrInfo.key === 'high' }
    ];
    const contextRowText = getHeartRateContextRowText(state || {});
    if (contextRowText) {
      rows.push({ label: 'Kontekst', value: contextRowText, highlighted: false });
    }
    return rows;
  }

  function buildSummaryLines(state) {
    const s = state || getState();
    const guidelineKey = s.guidelineKey;
    const bpInfo = classifyBloodPressure(s.sbp, s.dbp, guidelineKey);
    const hrInfo = classifyHeartRate(s.hr, { athlete: s.athlete, betaBlocker: s.betaBlocker });
    const lines = [];
    if (bpInfo.hasMeasurement) {
      if (bpInfo.hasCompleteMeasurement && bpInfo.summaryTail) {
        lines.push(`Ciśnienie tętnicze: ${bpInfo.valueText} – ${bpInfo.summaryTail}`);
      } else if (bpInfo.valueText) {
        lines.push(`Ciśnienie tętnicze: ${bpInfo.valueText}`);
      }
    }
    if (hrInfo.hasMeasurement && hrInfo.summaryTail) {
      lines.push(`Tętno: ${hrInfo.valueText} – ${hrInfo.summaryTail}`);
    }
    return lines;
  }

  function buildOverallAssessment(bpInfo, hrInfo, guidelineKey, hasAnyInput) {
    const guideline = getGuidelineMeta(guidelineKey);
    const bpMeasured = !!(bpInfo && bpInfo.hasMeasurement);
    const hrMeasured = !!(hrInfo && hrInfo.hasMeasurement);
    const bpTone = bpInfo ? bpInfo.tone : 'normal';
    const hrTone = hrInfo ? hrInfo.tone : 'normal';
    let tone = 'normal';
    let badge = hasAnyInput ? 'W zakresie' : 'Informacyjnie';
    let note = '';

    if (!hasAnyInput) {
      return {
        tone: 'normal',
        badge: 'Informacyjnie',
        title: '',
        note: 'Nie wpisano pomiarów RR ani tętna. Pokazano klasyfikację dla dorosłych oraz typowy zakres tętna spoczynkowego 60–100/min.',
        subtitle: guideline.cardLabel
      };
    }

    if (bpTone === 'danger' || hrTone === 'danger') {
      tone = 'danger';
      badge = (bpTone === 'danger' && bpInfo && bpInfo.badge) ? bpInfo.badge : ((hrInfo && hrInfo.badge) || 'Wymaga pilnej kontroli');
    } else if (bpTone === 'warn' || hrTone === 'warn') {
      tone = 'warn';
      badge = (bpTone === 'warn' && bpInfo && bpInfo.badge) ? bpInfo.badge : ((hrInfo && hrInfo.badge) || 'Do kontroli');
    } else if ((bpInfo && bpInfo.badge && bpInfo.badge !== 'W zakresie' && bpInfo.badge !== 'Informacyjnie') || (hrInfo && hrInfo.badge && hrInfo.badge !== 'W zakresie' && hrInfo.badge !== 'Informacyjnie')) {
      badge = (bpInfo && bpInfo.badge && bpInfo.badge !== 'W zakresie' && bpInfo.badge !== 'Informacyjnie') ? bpInfo.badge : hrInfo.badge;
    }

    if (bpMeasured && hrMeasured) {
      if (bpTone === 'normal' && hrTone === 'normal') {
        note = 'Ciśnienie tętnicze i tętno spoczynkowe mieszczą się obecnie w typowym zakresie dla dorosłych.';
      } else {
        note = appendSentence(bpInfo.note, hrInfo.note);
      }
    } else if (bpMeasured) {
      note = bpInfo.note;
      if (bpInfo.hasCompleteMeasurement) {
        note = appendSentence(note, 'Rozpoznanie nadciśnienia opiera się na powtarzanych pomiarach, a nie na pojedynczym odczycie.');
      }
    } else if (hrMeasured) {
      note = hrInfo.note;
    }

    return {
      tone: tone,
      badge: badge,
      title: '',
      note: note,
      subtitle: guideline.cardLabel
    };
  }

  function buildReportCardData(options) {
    const opts = options || {};
    const state = opts.state || getState();
    const hasInput = hasAnyMeasurement(state);
    const effectiveGuidelineKey = hasInput ? state.guidelineKey : (opts.forceGuidelineKey || 'ESC');
    const guideline = getGuidelineMeta(effectiveGuidelineKey);
    const bpInfo = classifyBloodPressure(state.sbp, state.dbp, effectiveGuidelineKey);
    const hrInfo = classifyHeartRate(state.hr, { athlete: state.athlete, betaBlocker: state.betaBlocker });
    const overall = buildOverallAssessment(bpInfo, hrInfo, effectiveGuidelineKey, hasInput);
    const bpRows = buildBloodPressureRows(effectiveGuidelineKey, bpInfo.key);
    const hrRows = buildHeartRateRows(hrInfo, state);
    const note = hasInput
      ? ''
      : 'Nie wpisano pomiarów RR ani tętna. Pokazano klasyfikację ESC/PTK dla dorosłych oraz typowy zakres tętna spoczynkowego 60–100/min.';

    return {
      title: 'Ciśnienie i tętno',
      badge: overall.badge,
      tone: overall.tone,
      subtitle: guideline.cardLabel,
      note: note,
      valueFirst: hasInput,
      items: [
        {
          label: 'Ciśnienie tętnicze',
          tone: bpInfo.tone,
          valueText: hasInput ? (bpInfo.valueText || '') : '',
          statusText: hasInput ? (bpInfo.statusText || '') : '',
          referenceRows: bpRows,
          valueFirst: hasInput
        },
        {
          label: 'Tętno spoczynkowe',
          tone: hrInfo.tone,
          valueText: hasInput ? (hrInfo.valueText || '') : '',
          statusText: hasInput ? (hrInfo.statusText || '') : '',
          referenceRows: hrRows,
          valueFirst: hasInput
        }
      ],
      hideMissingMeasurementLabels: !hasInput
    };
  }

  function buildMiniTableHtml(title, rows) {
    const rowsHtml = (rows || []).map(function(row) {
      const highlighted = row && row.highlighted ? ' class="is-highlighted"' : '';
      return `<tr${highlighted}><td>${escapeHtml((row && row.label) || '')}</td><td>${escapeHtml((row && row.value) || '')}</td></tr>`;
    }).join('');
    return `
      <div class="adult-vitals-mini-card">
        <div class="adult-vitals-mini-title">${escapeHtml(title)}</div>
        <div class="adult-vitals-mini-table-wrap">
          <table class="adult-vitals-mini-table">
            <thead>
              <tr><th>Kategoria</th><th>Zakres</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>`;
  }

  function buildGuidelineExplanationHtml(guidelineKey) {
    const normalizedKey = String(guidelineKey || '').toUpperCase();
    if (normalizedKey === 'AHA') {
      return '<div class="adult-vitals-guideline-note"><strong>AHA</strong> — klasyfikacja nadciśnienia wg American Heart Association (AHA) i American College of Cardiology (ACC).</div>';
    }
    return '<div class="adult-vitals-guideline-note"><strong>ESC/PTK</strong> — klasyfikacja nadciśnienia wg European Society of Cardiology (ESC) i Polskiego Towarzystwa Kardiologicznego (PTK).</div>';
  }

  function buildHomeResultHtml(state) {
    const s = state || getState();
    const guidelineKey = s.guidelineKey;
    const bpInfo = classifyBloodPressure(s.sbp, s.dbp, guidelineKey);
    const hrInfo = classifyHeartRate(s.hr, { athlete: s.athlete, betaBlocker: s.betaBlocker });
    const overall = buildOverallAssessment(bpInfo, hrInfo, guidelineKey, hasAnyMeasurement(s));
    const bpRows = buildBloodPressureRows(guidelineKey, bpInfo.key);
    const hrRows = buildHeartRateRows(hrInfo, s);

    const bpLine = bpInfo.valueText
      ? `<div class="adult-vitals-result-line adult-vitals-result-line--emphasis tone-${escapeHtml(bpInfo.tone || 'normal')}"><span class="adult-vitals-result-label">Ciśnienie:</span><span class="adult-vitals-result-value">${escapeHtml(bpInfo.valueText)}</span><span class="adult-vitals-result-separator">—</span><span class="adult-vitals-result-status">${escapeHtml(bpInfo.shortStatus || '—')}</span></div>`
      : '<div class="adult-vitals-result-line adult-vitals-result-line--emphasis"><span class="adult-vitals-result-label">Ciśnienie:</span><span class="adult-vitals-result-status">wpisz RR skurczowe i rozkurczowe.</span></div>';
    const hrLine = hrInfo.valueText
      ? `<div class="adult-vitals-result-line adult-vitals-result-line--emphasis tone-${escapeHtml(hrInfo.tone || 'normal')}"><span class="adult-vitals-result-label">Tętno:</span><span class="adult-vitals-result-value">${escapeHtml(hrInfo.valueText)}</span><span class="adult-vitals-result-separator">—</span><span class="adult-vitals-result-status">${escapeHtml(hrInfo.shortStatus || '—')}</span></div>`
      : '<div class="adult-vitals-result-line adult-vitals-result-line--emphasis"><span class="adult-vitals-result-label">Tętno:</span><span class="adult-vitals-result-status">wpisz tętno spoczynkowe.</span></div>';

    const shouldShowNote = !(bpInfo.hasCompleteMeasurement && hrInfo.hasMeasurement);
    const noteHtml = (shouldShowNote && overall.note)
      ? `<div class="adult-vitals-summary-note">${escapeHtml(overall.note)}</div>`
      : '';
    const guidelineInfoHtml = buildGuidelineExplanationHtml(guidelineKey);

    return `
      <div class="adult-vitals-summary tone-${escapeHtml(overall.tone || 'normal')}">
        <div class="adult-vitals-summary-top">
          <div>
            <div class="adult-vitals-summary-kicker">${escapeHtml(overall.subtitle || '')}</div>
            ${overall.title ? `<div class="adult-vitals-summary-title">${escapeHtml(overall.title)}</div>` : ''}
          </div>
          <div class="adult-vitals-summary-badge tone-${escapeHtml(overall.tone || 'normal')}">${escapeHtml(overall.badge || 'Informacyjnie')}</div>
        </div>
        <div class="adult-vitals-result-rows">
          ${bpLine}
          ${hrLine}
        </div>
        ${noteHtml}
        <div class="adult-vitals-mini-grid">
          ${buildMiniTableHtml('Ciśnienie tętnicze', bpRows)}
          ${buildMiniTableHtml('Tętno spoczynkowe', hrRows)}
        </div>
        ${guidelineInfoHtml}
      </div>`;
  }

  function refreshVisibility() {
    const card = el('adultVitalsCard');
    const resultBox = el('adultVitalsResult');
    const ageValue = (typeof window.getAgeDecimal === 'function') ? window.getAgeDecimal() : NaN;
    const isAdult = (typeof window.patientReportIsAdultAge === 'function')
      ? window.patientReportIsAdultAge(ageValue)
      : (Number.isFinite(ageValue) && ageValue >= 18);
    if (!card || !resultBox) return;
    card.style.display = isAdult ? '' : 'none';
    resultBox.className = 'result-box adult-vitals-result-box';
    clearHomePulse(resultBox);
    if (!isAdult) {
      resultBox.innerHTML = '';
    } else {
      const state = getState();
      resultBox.innerHTML = buildHomeResultHtml(state);
      const bpInfo = classifyBloodPressure(state.sbp, state.dbp, state.guidelineKey);
      const hrInfo = classifyHeartRate(state.hr, { athlete: state.athlete, betaBlocker: state.betaBlocker });
      const overall = buildOverallAssessment(bpInfo, hrInfo, state.guidelineKey, hasAnyMeasurement(state));
      syncHomeResultTone(resultBox, overall.tone);
    }
    try {
      if (typeof window.updateProfessionalSummaryCard === 'function') {
        window.updateProfessionalSummaryCard();
      }
    } catch (_) {}
  }

  function bindEvents() {
    [
      'adultBpGuidelineToggle',
      'adultBpSystolic',
      'adultBpDiastolic',
      'adultHeartRate',
      'adultHrAthlete',
      'adultHrAthleteNo',
      'adultHrBetaBlocker',
      'adultHrBetaBlockerNo',
      'age',
      'ageMonths',
      'sex',
      'weight',
      'height'
    ].forEach(function(id) {
      const node = el(id);
      if (!node) return;
      node.addEventListener('input', refreshVisibility);
      node.addEventListener('change', refreshVisibility);
    });
  }

  function init() {
    if (!el('adultVitalsCard')) return;
    bindEvents();
    refreshVisibility();
  }

  window.adultVitalsApi = {
    GUIDELINES: GUIDELINES,
    getState: getState,
    hasAnyMeasurement: hasAnyMeasurement,
    classifyBloodPressure: classifyBloodPressure,
    classifyHeartRate: classifyHeartRate,
    buildSummaryLines: buildSummaryLines,
    buildReportCardData: buildReportCardData,
    refresh: refreshVisibility,
    refreshVisibility: refreshVisibility
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);
