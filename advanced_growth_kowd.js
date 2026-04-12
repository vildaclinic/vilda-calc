(function () {
  'use strict';

  function agSafeEscape(value) {
    if (typeof advHistoryEscapeHtml === 'function') return advHistoryEscapeHtml(value);
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function agFormatNumber(value, digits) {
    if (typeof advHistoryFormatNumber === 'function') return advHistoryFormatNumber(value, digits);
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return num.toFixed(typeof digits === 'number' ? digits : 1).replace('.', ',');
  }

  function agRound(value, digits) {
    if (typeof bayleyPinneauRoundHalfUp === 'function') return bayleyPinneauRoundHalfUp(value, digits);
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    const factor = Math.pow(10, typeof digits === 'number' ? digits : 1);
    return Math.round((num + Number.EPSILON) * factor) / factor;
  }

  function agNormalizeSexKey(sex) {
    const raw = String(sex || '').trim().toUpperCase();
    if (raw === 'M') return 'boys';
    if (raw === 'F') return 'girls';
    return null;
  }

  function agNormalizeThreeState(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'yes' || raw === 'tak') return 'yes';
    if (raw === 'no' || raw === 'nie') return 'no';
    return 'unknown';
  }

  function agNormalizeTesticularVolume(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'lt4' || raw === '<4' || raw === '<4 ml') return 'lt4';
    if (raw === '4to6' || raw === '4-6' || raw === '4–6') return '4to6';
    if (raw === 'gt6' || raw === '>6' || raw === '>6 ml') return 'gt6';
    return 'unknown';
  }

  function agTesticularVolumeLabel(key) {
    switch (String(key || 'unknown')) {
      case 'lt4': return '<4 ml';
      case '4to6': return '4–6 ml';
      case 'gt6': return '>6 ml';
      default: return 'nie podano';
    }
  }

  function agProfileLabel(key) {
    switch (String(key || 'standard')) {
      case 'possible': return 'Możliwy profil KOWD-like';
      case 'probable': return 'Profil KOWD-like – prawdopodobny';
      case 'out-of-scope': return 'Poza zakresem automatycznej kwalifikacji KOWD-like';
      default: return 'Profil standardowy';
    }
  }

  function agModelLabel(key) {
    switch (String(key || '')) {
      case 'rwt': return 'RWT';
      case 'reinehr': return 'Reinehr 2019';
      case 'bayleyPinneau': return 'Bayley-Pinneau';
      default: return '—';
    }
  }

  function agBuildProfileBadgeHtml(statusKey) {
    const safeKey = String(statusKey || 'standard').trim() || 'standard';
    return '<span class="adv-growth-profile-badge is-' + agSafeEscape(safeKey) + '">' + agSafeEscape(agProfileLabel(safeKey)) + '</span>';
  }

  function agBuildModelChipHtml(kind, label) {
    const safeKind = String(kind || 'comparison').trim() || 'comparison';
    return '<span class="adv-growth-model-chip is-' + agSafeEscape(safeKind) + '">' + agSafeEscape(label || '—') + '</span>';
  }

  function agBuildGlobalDisclaimerText() {
    if (typeof ADV_GROWTH_PREDICTION_GLOBAL_DISCLAIMER_TEXT === 'string' && ADV_GROWTH_PREDICTION_GLOBAL_DISCLAIMER_TEXT.trim()) {
      return ADV_GROWTH_PREDICTION_GLOBAL_DISCLAIMER_TEXT.trim();
    }
    return 'Metody prognozowania wzrostu ostatecznego są przeznaczone dla dzieci zdrowych i nieleczonych. W przypadku chorób przewlekłych, zaburzeń endokrynologicznych lub leczenia wpływającego na wzrastanie wynik należy interpretować ostrożnie.';
  }

  function agResolveHeightStats(sex, ageYears, currentHeightCm) {
    if (!Number.isFinite(Number(currentHeightCm)) || !Number.isFinite(Number(ageYears))) {
      return { heightSds: null, heightPercentile: null, source: null };
    }
    try {
      const preferredSource = (typeof advHistoryGetPreferredSource === 'function') ? advHistoryGetPreferredSource() : 'OLAF';
      const resolved = (typeof advHistoryResolveMetric === 'function')
        ? advHistoryResolveMetric('HT', Number(currentHeightCm), sex, Number(ageYears), preferredSource)
        : null;
      if (resolved && resolved.result) {
        return {
          heightSds: Number.isFinite(Number(resolved.result.sd)) ? Number(resolved.result.sd) : null,
          heightPercentile: Number.isFinite(Number(resolved.result.percentile)) ? Number(resolved.result.percentile) : null,
          source: resolved.source || preferredSource || null
        };
      }
      return { heightSds: null, heightPercentile: null, source: preferredSource || null };
    } catch (_) {
      return { heightSds: null, heightPercentile: null, source: null };
    }
  }

  function agResolveTargetHeightSds(sex, targetHeightCm) {
    if (!Number.isFinite(Number(targetHeightCm))) return { targetHeightSds: null, source: null };
    try {
      const preferredSource = (typeof advHistoryGetPreferredSource === 'function') ? advHistoryGetPreferredSource() : 'OLAF';
      const resolved = (typeof advHistoryResolveMetric === 'function')
        ? advHistoryResolveMetric('HT', Number(targetHeightCm), sex, 18, preferredSource)
        : null;
      if (resolved && resolved.result && Number.isFinite(Number(resolved.result.sd))) {
        return { targetHeightSds: Number(resolved.result.sd), source: resolved.source || preferredSource || null };
      }
      return { targetHeightSds: null, source: preferredSource || null };
    } catch (_) {
      return { targetHeightSds: null, source: null };
    }
  }

  function agBuildProfileIntro(statusKey) {
    switch (String(statusKey || 'standard')) {
      case 'possible':
        return 'Profil oceniono jako możliwy KOWD-like na podstawie opóźnionego wieku kostnego oraz dostępnych cech dojrzewania i wzrastania.';
      case 'probable':
        return 'Profil oceniono jako KOWD-like – prawdopodobny na podstawie opóźnionego wieku kostnego, cech dojrzewania oraz wskaźników wzrastania zgodnych z profilem CDGP/KOWD.';
      case 'out-of-scope':
        return 'Automatyczną kwalifikację KOWD-like wyłączono, ponieważ zaznaczono dane wykraczające poza kohorty, na których walidowano omawiane modele.';
      default:
        return 'Nie wykryto profilu wymagającego specjalnej ścieżki KOWD-like; pokazano standardowe modele prognozowania wzrostu.';
    }
  }

  function agBuildProfileSummary(model) {
    if (!model || typeof model !== 'object') return '';
    if (model.statusKey === 'out-of-scope') {
      return 'Automatyczny dobór modelu został wyłączony; wyniki należy interpretować ostrożnie klinicznie.';
    }
    if (model.preferredModelKey === 'rwt') {
      let text = 'Preferowany model dla tego profilu: RWT.';
      if (model.preferredModelUnavailable) {
        text = 'Preferowanym modelem dla tego profilu byłby RWT, ale w aplikacji brakuje kompletu danych wejściowych do jego obliczenia.';
      }
      if (model.shouldShowReinehr) {
        text += ' Dodano także model specjalistyczny Reinehr 2019.';
      }
      text += ' Bayley-Pinneau pozostaje wynikiem porównawczym.';
      if (model.bpCautionText) text += ' ' + model.bpCautionText;
      return text;
    }
    return 'Dla tego profilu pokazano standardowe modele Bayley-Pinneau i RWT bez automatycznego modelu preferowanego.';
  }

  function agBuildRanking(model) {
    if (!model || typeof model !== 'object') return [];
    if (model.statusKey === 'out-of-scope') return [];
    const ranking = [];
    if (model.preferredModelKey === 'rwt') {
      ranking.push({ key: 'rwt', label: 'RWT', kind: model.preferredModelUnavailable ? 'unavailable' : 'preferred' });
      if (model.shouldShowReinehr) {
        ranking.push({ key: 'reinehr', label: model.specialistPriority ? 'Reinehr 2019 – model specjalistyczny szczególnie zalecany' : 'Reinehr 2019 – model specjalistyczny', kind: 'specialist' });
      }
      ranking.push({ key: 'bayleyPinneau', label: 'Bayley-Pinneau – wynik porównawczy', kind: 'comparison' });
      return ranking;
    }
    ranking.push({ key: 'bayleyPinneau', label: 'Bayley-Pinneau', kind: 'comparison' });
    ranking.push({ key: 'rwt', label: 'RWT', kind: 'comparison' });
    return ranking;
  }

  function agBuildProfileReferenceHtml() {
    const profiles = [
      {
        statusKey: 'standard',
        description: 'Brak cech wymagających ścieżki KOWD-like. Aplikacja pokazuje standardowe wyniki Bayley-Pinneau i RWT bez automatycznego modelu preferowanego.',
        models: [
          { name: 'Bayley-Pinneau', kind: 'comparison', chipLabel: 'standardowy' },
          { name: 'RWT', kind: 'comparison', chipLabel: 'standardowy' },
          { name: 'Reinehr 2019', kind: 'comparison', chipLabel: 'nie dotyczy' }
        ]
      },
      {
        statusKey: 'possible',
        description: 'Częściowe cechy profilu KOWD-like przy opóźnionym wieku kostnym ponad 1 rok. Preferowany jest RWT, a Bayley-Pinneau pozostaje wynikiem porównawczym.',
        models: [
          { name: 'RWT', kind: 'preferred', chipLabel: 'preferowany' },
          { name: 'Reinehr 2019', kind: 'specialist', chipLabel: 'specjalistyczny*' },
          { name: 'Bayley-Pinneau', kind: 'comparison', chipLabel: 'porównawczy' }
        ]
      },
      {
        statusKey: 'probable',
        description: 'Bardziej spójny obraz KOWD-like z opóźnionym dojrzewaniem i/lub wzrastaniem. Preferowany pozostaje RWT, a Reinehr 2019 jest modelem specjalistycznym.',
        models: [
          { name: 'RWT', kind: 'preferred', chipLabel: 'preferowany' },
          { name: 'Reinehr 2019', kind: 'specialist', chipLabel: 'specjalistyczny*' },
          { name: 'Bayley-Pinneau', kind: 'comparison', chipLabel: 'porównawczy' }
        ]
      },
      {
        statusKey: 'out-of-scope',
        description: 'Zaznaczono dane wyłączające automatyczną kwalifikację KOWD-like. Aplikacja nie wskazuje modelu preferowanego, a standardowe wyniki należy interpretować ostrożnie klinicznie.',
        models: [
          { name: 'Bayley-Pinneau', kind: 'warning', chipLabel: 'ostrożnie' },
          { name: 'RWT', kind: 'warning', chipLabel: 'ostrożnie' },
          { name: 'Reinehr 2019', kind: 'comparison', chipLabel: 'nie dotyczy' }
        ]
      }
    ];

    const itemsHtml = profiles.map(function (entry) {
      const modelRowsHtml = Array.isArray(entry.models)
        ? entry.models.map(function (modelEntry) {
            return '<div class="adv-growth-profile-model-row"><span class="adv-growth-profile-model-name">' + agSafeEscape(modelEntry.name) + ':</span>' + agBuildModelChipHtml(modelEntry.kind, modelEntry.chipLabel) + '</div>';
          }).join('')
        : '';

      return '<div class="adv-growth-profile-reference-item">'
        + '<p class="adv-growth-profile-title"><strong>Profil:</strong> ' + agBuildProfileBadgeHtml(entry.statusKey) + '</p>'
        + '<p class="adv-growth-profile-copy">' + agSafeEscape(entry.description) + '</p>'
        + '<div class="adv-growth-profile-models">' + modelRowsHtml + '</div>'
        + '</div>';
    }).join('');

    return `
      <div class="adv-growth-profile-reference">
        <p class="adv-growth-profile-copy"><strong>Profile rozróżniane przez aplikację (ścieżka chłopców):</strong></p>
        <div class="adv-growth-profile-reference-list">${itemsHtml}</div>
        <p class="adv-growth-profile-copy adv-growth-profile-reference-note">* Reinehr 2019 pojawia się w profilach KOWD-like tylko u chłopców od wieku metrykalnego 12 lat z opóźnieniem wieku kostnego przekraczającym 1 rok.</p>
      </div>`;
  }

  function agFormatDelayYears(delayYears) {
    const rounded = agRound(delayYears, 2);
    return agFormatNumber(rounded, 2);
  }

  function agBuildProfileEvidence(model) {
    const items = [];
    if (!model || typeof model !== 'object') return items;
    if (Number.isFinite(Number(model.boneAgeDelayYears))) {
      items.push('Wiek kostny opóźniony o ' + agFormatDelayYears(model.boneAgeDelayYears) + ' roku/lata.');
    }
    if (model.testicularVolumeEvidence) {
      items.push(model.testicularVolumeEvidence);
    } else if (model.testicularVolumeLabel) {
      items.push('Objętość jąder: ' + model.testicularVolumeLabel + '.');
    }
    if (model.familyHistoryEvidence) items.push(model.familyHistoryEvidence);
    if (model.lowHeightEvidence) items.push(model.lowHeightEvidence);
    if (model.targetGapEvidence) items.push(model.targetGapEvidence);
    if (model.missingMaturityEvidence) items.push(model.missingMaturityEvidence);
    if (model.exclusionEvidence) items.push(model.exclusionEvidence);
    return items;
  }

  function advGrowthBuildKowdProfileModel(params) {
    const sex = params && params.sex != null ? params.sex : null;
    const sexKey = agNormalizeSexKey(sex);
    const chronologicalAgeYears = Number(params && params.chronologicalAgeYears);
    const chronologicalAgeMonths = Number(params && params.chronologicalAgeMonths);
    const boneAgeYears = Number(params && params.boneAgeYears);
    const targetHeightCm = Number(params && params.targetHeightCm);
    const currentHeightCm = Number(params && params.currentHeightCm);
    const rwtDataComplete = !!(params && params.rwtDataComplete);
    const usesMaleSpecificSignals = sexKey === 'boys';
    const testicularVolumeKey = usesMaleSpecificSignals ? agNormalizeTesticularVolume(params && params.testicularVolume) : 'unknown';
    const familyHistoryKey = usesMaleSpecificSignals ? agNormalizeThreeState(params && params.familyDelayedPuberty) : 'unknown';
    const exclusionKey = usesMaleSpecificSignals ? agNormalizeThreeState(params && params.growthExclusion) : 'unknown';
    const exclusion = usesMaleSpecificSignals && exclusionKey === 'yes';

    const boneAgeDelayYears = (Number.isFinite(chronologicalAgeYears) && Number.isFinite(boneAgeYears))
      ? chronologicalAgeYears - boneAgeYears
      : null;
    const heightStats = agResolveHeightStats(sex, chronologicalAgeYears, currentHeightCm);
    const targetStats = agResolveTargetHeightSds(sex, targetHeightCm);
    const thGap = (Number.isFinite(heightStats.heightSds) && Number.isFinite(targetStats.targetHeightSds))
      ? targetStats.targetHeightSds - heightStats.heightSds
      : null;
    const lowHeightMarker = (Number.isFinite(heightStats.heightSds) && heightStats.heightSds <= -2)
      || (Number.isFinite(heightStats.heightPercentile) && heightStats.heightPercentile < 3);
    const familyMarker = familyHistoryKey === 'yes';
    const thGapMarker = Number.isFinite(thGap) && thGap >= 0.5;
    const delayedPubertyMarker = Number.isFinite(chronologicalAgeYears) && chronologicalAgeYears >= 13 && (testicularVolumeKey === 'lt4' || testicularVolumeKey === '4to6');
    const strongDelayedPubertyMarker = Number.isFinite(chronologicalAgeYears) && chronologicalAgeYears >= 13 && testicularVolumeKey === 'lt4';
    const missingMaturityEvidence = (usesMaleSpecificSignals && testicularVolumeKey === 'unknown' && Number.isFinite(boneAgeDelayYears) && boneAgeDelayYears > 1)
      ? 'Nie podano objętości jąder; uzupełnienie tego pola poprawi automatyczną kwalifikację profilu.'
      : '';

    let statusKey = 'standard';
    let preferredModelKey = null;
    let preferredModelUnavailable = false;
    let shouldShowReinehr = false;
    let specialistPriority = false;
    let bpCautionText = '';
    let exclusionEvidence = '';

    if (sexKey === 'boys') {
      if (exclusion) {
        statusKey = 'out-of-scope';
        exclusionEvidence = 'Zaznaczono chorobę przewlekłą, zaburzenie endokrynologiczne, zespół genetyczny lub leczenie wpływające na wzrastanie.';
      } else if (Number.isFinite(boneAgeDelayYears) && boneAgeDelayYears > 1) {
        statusKey = 'possible';
        if ((boneAgeDelayYears >= 2 && delayedPubertyMarker) || (delayedPubertyMarker && (lowHeightMarker || familyMarker || thGapMarker)) || (strongDelayedPubertyMarker && lowHeightMarker)) {
          statusKey = 'probable';
        }
        preferredModelKey = 'rwt';
        preferredModelUnavailable = !rwtDataComplete;
        shouldShowReinehr = Number.isFinite(chronologicalAgeYears) && chronologicalAgeYears >= 12;
        specialistPriority = Number.isFinite(boneAgeDelayYears) && boneAgeDelayYears >= 2;
        if (Number.isFinite(boneAgeYears) && boneAgeYears > 13) specialistPriority = true;
        if (Number.isFinite(boneAgeDelayYears) && boneAgeDelayYears >= 2) {
          bpCautionText = 'Bayley-Pinneau może zawyżać przy opóźnieniu wieku kostnego przekraczającym 2 lata.';
        }
      }
    }

    const testicularVolumeEvidence = (usesMaleSpecificSignals && testicularVolumeKey !== 'unknown')
      ? ((testicularVolumeKey === 'lt4' || testicularVolumeKey === '4to6')
        ? 'Objętość jąder (' + agTesticularVolumeLabel(testicularVolumeKey) + ') wspiera obraz opóźnionego dojrzewania płciowego.'
        : 'Objętość jąder >6 ml nie wspiera profilu wyraźnie opóźnionego dojrzewania.')
      : '';
    const familyHistoryEvidence = (usesMaleSpecificSignals && familyMarker) ? 'Dodatni wywiad rodzinny opóźnienia dojrzewania wzmacnia profil KOWD-like.' : '';
    const lowHeightEvidence = lowHeightMarker
      ? ('Niski wzrost dla wieku' + (Number.isFinite(heightStats.heightSds) ? ' (hSDS ' + agFormatNumber(heightStats.heightSds, 2) + ')' : '') + ' wzmacnia profil KOWD-like.')
      : '';
    const targetGapEvidence = thGapMarker ? ('Różnica target height SDS – height SDS wynosi ' + agFormatNumber(thGap, 2) + ' i wspiera profil CDGP/KOWD-like.') : '';

    const model = {
      statusKey,
      statusLabel: agProfileLabel(statusKey),
      sexKey,
      boneAgeDelayYears: Number.isFinite(boneAgeDelayYears) ? agRound(boneAgeDelayYears, 2) : null,
      boneAgeDelayMonths: Number.isFinite(boneAgeDelayYears) ? Math.round(boneAgeDelayYears * 12) : null,
      chronologicalAgeYears: Number.isFinite(chronologicalAgeYears) ? agRound(chronologicalAgeYears, 2) : null,
      chronologicalAgeMonths: Number.isFinite(chronologicalAgeMonths) ? Math.round(chronologicalAgeMonths) : null,
      boneAgeYears: Number.isFinite(boneAgeYears) ? agRound(boneAgeYears, 2) : null,
      testicularVolumeKey,
      testicularVolumeLabel: usesMaleSpecificSignals ? agTesticularVolumeLabel(testicularVolumeKey) : '',
      familyHistoryKey,
      exclusionKey,
      exclusion,
      heightSds: Number.isFinite(heightStats.heightSds) ? agRound(heightStats.heightSds, 2) : null,
      heightPercentile: Number.isFinite(heightStats.heightPercentile) ? agRound(heightStats.heightPercentile, 1) : null,
      targetHeightSds: Number.isFinite(targetStats.targetHeightSds) ? agRound(targetStats.targetHeightSds, 2) : null,
      thGap: Number.isFinite(thGap) ? agRound(thGap, 2) : null,
      lowHeightMarker,
      familyMarker,
      thGapMarker,
      delayedPubertyMarker,
      strongDelayedPubertyMarker,
      preferredModelKey,
      preferredModelLabel: preferredModelKey ? agModelLabel(preferredModelKey) : '',
      preferredModelUnavailable,
      shouldShowReinehr,
      specialistPriority,
      specialistModelKey: shouldShowReinehr ? 'reinehr' : null,
      specialistModelLabel: shouldShowReinehr ? agModelLabel('reinehr') : '',
      bpCautionText,
      rwtDataComplete,
      missingMaturityEvidence,
      testicularVolumeEvidence,
      familyHistoryEvidence,
      lowHeightEvidence,
      targetGapEvidence,
      exclusionEvidence,
      introText: agBuildProfileIntro(statusKey),
      summaryText: '',
      ranking: [],
      disclaimerText: agBuildGlobalDisclaimerText(),
      shouldPreferRwt: preferredModelKey === 'rwt',
      shouldDowngradeBayleyInReliability: sexKey === 'boys' && Number.isFinite(boneAgeDelayYears) && boneAgeDelayYears >= 2,
      isOutOfScope: statusKey === 'out-of-scope',
      isPossibleKowdLike: statusKey === 'possible' || statusKey === 'probable',
      isProbableKowdLike: statusKey === 'probable'
    };

    model.ranking = agBuildRanking(model);
    model.summaryText = agBuildProfileSummary(model);
    model.evidenceItems = agBuildProfileEvidence(model);
    return model;
  }

  function advGrowthBuildKowdProfileHtml(model) {
    if (!model || typeof model !== 'object') return '';
    if (model.sexKey !== 'boys') return '';
    const preferredRow = model.preferredModelKey
      ? '<div class="adv-growth-profile-model-row"><span class="adv-growth-profile-model-name">Preferowany model:</span>' + agBuildModelChipHtml(model.preferredModelUnavailable ? 'unavailable' : 'preferred', model.preferredModelUnavailable ? ('RWT – uzupełnij wagę i wzrost rodziców') : agModelLabel(model.preferredModelKey)) + '</div>'
      : '<div class="adv-growth-profile-model-row"><span class="adv-growth-profile-model-name">Preferowany model:</span>' + agBuildModelChipHtml('comparison', 'brak automatycznego modelu preferowanego') + '</div>';
    const specialistRow = model.shouldShowReinehr
      ? '<div class="adv-growth-profile-model-row"><span class="adv-growth-profile-model-name">Model specjalistyczny:</span>' + agBuildModelChipHtml('specialist', model.specialistPriority ? 'Reinehr 2019 – szczególnie zalecany' : 'Reinehr 2019') + '</div>'
      : '<div class="adv-growth-profile-model-row"><span class="adv-growth-profile-model-name">Model specjalistyczny:</span>' + agBuildModelChipHtml('comparison', 'nie dotyczy') + '</div>';
    const comparisonRow = '<div class="adv-growth-profile-model-row"><span class="adv-growth-profile-model-name">Bayley-Pinneau:</span>' + agBuildModelChipHtml(model.bpCautionText ? 'warning' : 'comparison', model.bpCautionText ? 'wynik porównawczy – ostrożnie' : 'wynik porównawczy') + '</div>';
    const evidenceHtml = (model.evidenceItems || []).length
      ? '<ul class="adv-growth-profile-list">' + model.evidenceItems.map(function (item) { return '<li>' + agSafeEscape(item) + '</li>'; }).join('') + '</ul>'
      : '';
    const rankingHtml = (model.ranking || []).length
      ? '<div class="adv-growth-profile-ranking">' + model.ranking.map(function (entry) {
          return '<div class="adv-growth-profile-model-row"><span class="adv-growth-profile-model-name">' + agSafeEscape(entry.label) + '</span>' + agBuildModelChipHtml(entry.kind, entry.kind === 'preferred' ? 'preferowany' : (entry.kind === 'specialist' ? 'specjalistyczny' : (entry.kind === 'unavailable' ? 'uzupełnij dane' : 'porównawczy'))) + '</div>';
        }).join('') + '</div>'
      : '';
    const warningHtml = model.bpCautionText
      ? '<p class="adv-growth-profile-warning"><strong>Uwaga:</strong> ' + agSafeEscape(model.bpCautionText) + '</p>'
      : '';
    const profileReferenceHtml = agBuildProfileReferenceHtml();
    const detailsHtml = `
      <div class="adv-growth-profile-card">
        <p class="adv-growth-profile-title"><strong>Profil predykcyjny:</strong> ${agBuildProfileBadgeHtml(model.statusKey)}</p>
        <p class="adv-growth-profile-copy">${agSafeEscape(model.introText || '')}</p>
        <div class="adv-growth-profile-models">${preferredRow}${specialistRow}${comparisonRow}</div>
        <p class="adv-growth-profile-copy">${agSafeEscape(model.summaryText || '')}</p>
        ${rankingHtml}
        ${evidenceHtml}
        ${warningHtml}
      </div>
      ${profileReferenceHtml}
      <div class="adv-growth-global-disclaimer"><strong>Uwaga ogólna:</strong> ${agSafeEscape(model.disclaimerText || agBuildGlobalDisclaimerText())}</div>`;

    if (typeof buildAdvancedGrowthDetailsToggleHtml === 'function') {
      return '<div class="adv-growth-result-block adv-growth-result-block--profile">\n        <p><strong>Profil predykcyjny:</strong> ' + agBuildProfileBadgeHtml(model.statusKey) + '</p>\n        <p><strong>Dobór modelu:</strong> ' + agSafeEscape(model.summaryText || '') + '</p>\n        ' + buildAdvancedGrowthDetailsToggleHtml('advGrowthProfileDetails', detailsHtml, { collapsedLabel: 'Dobór modelu predykcyjnego', expandedLabel: 'Ukryj dobór modelu predykcyjnego' }) + '\n      </div>';
    }
    return '<div class="adv-growth-result-block adv-growth-result-block--profile">' + detailsHtml + '</div>';
  }

  function advGrowthBuildKowdProfileSummaryLines(model) {
    if (!model || typeof model !== 'object') return [];
    if (model.sexKey !== 'boys') return [];
    const lines = ['Profil predykcyjny: ' + agProfileLabel(model.statusKey)];
    if (model.preferredModelKey) {
      if (model.preferredModelUnavailable) {
        lines.push('Preferowany model dla tego profilu: RWT (wymaga uzupełnienia masy ciała i wzrostów rodziców)');
      } else {
        lines.push('Preferowany model dla tego profilu: RWT');
      }
    }
    if (model.shouldShowReinehr) {
      lines.push('Model specjalistyczny: Reinehr 2019' + (model.specialistPriority ? ' (szczególnie zalecany)' : ''));
    }
    if (model.bpCautionText) lines.push(model.bpCautionText);
    return lines;
  }

  function advGrowthAssessReinehrCdgpReliability(result, profileModel) {
    if (!result || typeof result !== 'object' || result.available !== true) return null;
    const reasons = ['dopasowania modelu specjalistycznego do chłopców z opóźnionym wiekiem kostnym >1 roku'];
    let levelKey = 'moderate';
    if (result.interpolatedByBoneAge === true) {
      reasons.push('interpolacji liniowej między punktami wieku kostnego');
    }
    if (result.delayGroupKey === 'gte2') {
      reasons.push('osobnych współczynników dla opóźnienia BA ≥2 lata');
    }
    if (profileModel && profileModel.statusKey === 'possible') {
      levelKey = 'lowered';
      reasons.push('niepełnego obrazu klinicznego profilu KOWD-like');
    }
    if (Number.isFinite(Number(result.boneAgeYears)) && (result.boneAgeYears <= 10.7 || result.boneAgeYears >= 15.3)) {
      levelKey = 'lowered';
      reasons.push('położenia blisko granic zakresu tabeli 10,5–15,5 lat');
    }
    return {
      methodKey: 'reinehr',
      methodLabel: 'Reinehr 2019',
      levelKey,
      label: (typeof advGrowthPredictionReliabilityLabel === 'function') ? advGrowthPredictionReliabilityLabel(levelKey) : levelKey,
      reasons,
      reasonText: (typeof advGrowthFormatReasonList === 'function') ? advGrowthFormatReasonList(reasons) : reasons.join(', ')
    };
  }

  function advGrowthDetermineReinehrDelayGroup(delayYears) {
    const value = Number(delayYears);
    if (!Number.isFinite(value)) return null;
    if (value >= 2) return 'gte2';
    if (value > 1) return 'gt1lt2';
    return null;
  }

  function advGrowthInterpolateReinehrRows(rows, boneAgeMonthsTotal) {
    if (!Array.isArray(rows) || !rows.length || !Number.isFinite(Number(boneAgeMonthsTotal))) return { ok: false };
    const target = Number(boneAgeMonthsTotal);
    const normalized = rows
      .map(function (row) {
        return {
          boneAgeMonthsTotal: Number(row.boneAgeMonthsTotal),
          boneAgeLabel: row.boneAgeLabel,
          percentAdultHeight: Number(row.percentAdultHeight),
          extrapolated: !!row.extrapolated
        };
      })
      .filter(function (row) { return Number.isFinite(row.boneAgeMonthsTotal) && Number.isFinite(row.percentAdultHeight); })
      .sort(function (a, b) { return a.boneAgeMonthsTotal - b.boneAgeMonthsTotal; });
    if (!normalized.length) return { ok: false };
    const minMonths = normalized[0].boneAgeMonthsTotal;
    const maxMonths = normalized[normalized.length - 1].boneAgeMonthsTotal;
    if (target < minMonths || target > maxMonths) {
      return { ok: false, minMonths: minMonths, maxMonths: maxMonths };
    }
    for (var i = 0; i < normalized.length; i += 1) {
      if (normalized[i].boneAgeMonthsTotal === target) {
        return {
          ok: true,
          interpolated: false,
          percentAdultHeight: normalized[i].percentAdultHeight,
          lowerRow: normalized[i],
          upperRow: normalized[i],
          fraction: 0,
          extrapolated: !!normalized[i].extrapolated
        };
      }
    }
    for (var j = 1; j < normalized.length; j += 1) {
      const lower = normalized[j - 1];
      const upper = normalized[j];
      if (target < upper.boneAgeMonthsTotal) {
        const span = upper.boneAgeMonthsTotal - lower.boneAgeMonthsTotal;
        const fraction = span > 0 ? (target - lower.boneAgeMonthsTotal) / span : 0;
        const percentAdultHeight = lower.percentAdultHeight + ((upper.percentAdultHeight - lower.percentAdultHeight) * fraction);
        return {
          ok: true,
          interpolated: true,
          percentAdultHeight: percentAdultHeight,
          lowerRow: lower,
          upperRow: upper,
          fraction: fraction,
          extrapolated: !!(lower.extrapolated || upper.extrapolated)
        };
      }
    }
    return { ok: false, minMonths: minMonths, maxMonths: maxMonths };
  }

  function advGrowthCalculateReinehrCdgpPrediction(params) {
    const dataRoot = (typeof window !== 'undefined' && window.reinehrCdgpData)
      ? window.reinehrCdgpData
      : (typeof reinehrCdgpData !== 'undefined' ? reinehrCdgpData : null);
    const profileModel = params && params.profileModel;
    const displayBlock = !!(profileModel && profileModel.shouldShowReinehr);
    if (!dataRoot || !dataRoot.tables) {
      return { available: false, displayBlock: displayBlock, message: displayBlock ? 'Nie udało się wczytać danych modelu Reinehr 2019.' : '' };
    }
    const sexKey = agNormalizeSexKey(params && params.sex);
    if (sexKey !== 'boys') {
      return { available: false, displayBlock: false, message: '' };
    }
    if (!displayBlock) {
      return { available: false, displayBlock: false, message: '' };
    }
    const chronologicalAgeYears = Number(params && params.chronologicalAgeYears);
    const boneAgeYears = Number(params && params.boneAgeYears);
    const currentHeightCm = Number(params && params.currentHeightCm);
    if (!Number.isFinite(chronologicalAgeYears) || chronologicalAgeYears < 12) {
      return {
        available: false,
        displayBlock: true,
        message: 'Model Reinehr 2019 pokazuje się w aplikacji dopiero od wieku metrykalnego 12 lat u chłopców z profilem KOWD-like.'
      };
    }
    if (!Number.isFinite(currentHeightCm) || !Number.isFinite(boneAgeYears)) {
      return {
        available: false,
        displayBlock: true,
        message: 'Aby obliczyć model Reinehr 2019, uzupełnij aktualny wzrost oraz wiek kostny.'
      };
    }
    const boneAgeDelayYears = Number.isFinite(Number(params && params.boneAgeDelayYears))
      ? Number(params && params.boneAgeDelayYears)
      : (chronologicalAgeYears - boneAgeYears);
    const delayGroupKey = advGrowthDetermineReinehrDelayGroup(boneAgeDelayYears);
    if (!delayGroupKey) {
      return {
        available: false,
        displayBlock: true,
        message: 'Model Reinehr 2019 jest przeznaczony dla chłopców z opóźnieniem wieku kostnego przekraczającym 1 rok.'
      };
    }
    const rows = Array.isArray(dataRoot.tables[delayGroupKey]) ? dataRoot.tables[delayGroupKey] : [];
    if (!rows.length) {
      return { available: false, displayBlock: true, message: 'Brakuje tabel modelu Reinehr 2019 dla tej grupy opóźnienia wieku kostnego.' };
    }
    const boneAgeMonthsTotal = Math.round(boneAgeYears * 12);
    const selection = advGrowthInterpolateReinehrRows(rows, boneAgeMonthsTotal);
    if (!selection || selection.ok !== true || !Number.isFinite(Number(selection.percentAdultHeight)) || selection.percentAdultHeight <= 0) {
      const minLabel = rows[0] && rows[0].boneAgeLabel ? rows[0].boneAgeLabel : '10-6';
      const maxLabel = rows[rows.length - 1] && rows[rows.length - 1].boneAgeLabel ? rows[rows.length - 1].boneAgeLabel : '15-6';
      return {
        available: false,
        displayBlock: true,
        message: 'Model Reinehr 2019 obejmuje w aplikacji zakres wieku kostnego ' + minLabel + '–' + maxLabel + ' lat. Wpisany wiek kostny wykracza poza ten zakres.'
      };
    }
    const predictedAdultHeightRaw = currentHeightCm / (selection.percentAdultHeight / 100);
    const predictedAdultHeightCm = agRound(predictedAdultHeightRaw, 1);
    const remainingGrowthCm = agRound(predictedAdultHeightCm - currentHeightCm, 1);
    return {
      available: true,
      displayBlock: true,
      method: 'Reinehr2019',
      methodLabel: 'Reinehr 2019',
      sexKey: sexKey,
      sexLabel: 'chłopców',
      chronologicalAgeYears: agRound(chronologicalAgeYears, 2),
      chronologicalAgeMonths: Math.round(chronologicalAgeYears * 12),
      currentHeightCm: agRound(currentHeightCm, 1),
      boneAgeYears: agRound(boneAgeYears, 2),
      boneAgeLabel: selection.interpolated ? null : selection.lowerRow.boneAgeLabel,
      boneAgeDelayYears: agRound(boneAgeDelayYears, 2),
      boneAgeDelayMonths: Math.round(boneAgeDelayYears * 12),
      delayGroupKey: delayGroupKey,
      delayGroupLabel: delayGroupKey === 'gte2' ? 'opóźnienie BA ≥2 lata' : 'opóźnienie BA >1 i <2 lata',
      percentAdultHeight: agRound(selection.percentAdultHeight, 1),
      predictedAdultHeightCm: predictedAdultHeightCm,
      predictedAdultHeightCmRaw: predictedAdultHeightRaw,
      remainingGrowthCm: remainingGrowthCm,
      interpolatedByBoneAge: !!selection.interpolated,
      boneAgeNodeLowerLabel: selection.lowerRow && selection.lowerRow.boneAgeLabel ? selection.lowerRow.boneAgeLabel : null,
      boneAgeNodeUpperLabel: selection.upperRow && selection.upperRow.boneAgeLabel ? selection.upperRow.boneAgeLabel : null,
      interpolationFraction: selection.interpolated ? Number(selection.fraction || 0) : 0,
      usedExtrapolatedCoefficient: !!selection.extrapolated,
      scopeDisclaimerText: 'Model Reinehr 2019 jest modelem specjalistycznym opisanym dla chłopców z CDGP/KOWD i BA opóźnionym o ponad 1 rok; nie zastępuje oceny klinicznej.'
    };
  }

  function advGrowthBuildReinehrCdgpResultHtml(result) {
    if (!result || typeof result !== 'object') return '';
    if (result.available !== true) {
      if (!result.displayBlock) return '';
      const msg = String(result.message || '').trim();
      return msg ? '<div class="adv-growth-result-block adv-growth-result-block--reinehr"><p><em>' + agSafeEscape(msg) + '</em></p></div>' : '';
    }
    const reliability = (typeof advGrowthAssessReinehrCdgpReliability === 'function') ? advGrowthAssessReinehrCdgpReliability(result, result.profileModel || null) : null;
    const reliabilityParagraph = (typeof advGrowthBuildMethodReliabilityDetailsParagraph === 'function')
      ? advGrowthBuildMethodReliabilityDetailsParagraph(reliability)
      : '';
    const predicted = agFormatNumber(result.predictedAdultHeightCm, 1);
    const currentHeight = agFormatNumber(result.currentHeightCm, 1);
    const remaining = agFormatNumber(result.remainingGrowthCm, 1);
    const percent = agFormatNumber(result.percentAdultHeight, 1);
    const interpolationText = result.interpolatedByBoneAge
      ? 'Współczynnik zinterpolowano liniowo między punktami wieku kostnego ' + result.boneAgeNodeLowerLabel + ' i ' + result.boneAgeNodeUpperLabel + '.'
      : 'Użyto punktu wieku kostnego ' + result.boneAgeNodeLowerLabel + '.';
    const extrapolatedText = result.usedExtrapolatedCoefficient
      ? ' Zastosowany współczynnik należy do zakresu ekstrapolowanego w publikacji.'
      : '';
    const detailsHtml = '\n      <p class="adv-growth-result-details-copy"><span style="opacity:0.85;">Wyliczono z modelu Reinehr 2019 dla ' + agSafeEscape(result.sexLabel) + ' z profilem KOWD/CDGP-like. Aktualny wzrost wynosił ' + agSafeEscape(currentHeight) + ' cm, wiek kostny ' + agSafeEscape(agFormatNumber(result.boneAgeYears, 2)) + ' lat, a opóźnienie BA ' + agSafeEscape(agFormatNumber(result.boneAgeDelayYears, 2)) + ' roku/lata. Użyto grupy „' + agSafeEscape(result.delayGroupLabel) + '”. Współczynnik odpowiada ' + agSafeEscape(percent) + '% osiągniętego wzrostu ostatecznego. ' + agSafeEscape(interpolationText) + agSafeEscape(extrapolatedText) + ' Do osiągnięcia pozostaje orientacyjnie ' + agSafeEscape(remaining) + ' cm.</span></p>\n      ' + reliabilityParagraph + '\n      <p class="adv-growth-result-details-copy"><span style="opacity:0.85;">' + agSafeEscape(result.scopeDisclaimerText || '') + '</span></p>';
    if (typeof buildAdvancedGrowthDetailsToggleHtml === 'function') {
      return '<div class="adv-growth-result-block adv-growth-result-block--reinehr">\n        <p><strong>Prognoza wzrostu ostatecznego (model Reinehr 2019):</strong> ' + agSafeEscape(predicted) + ' cm</p>\n        ' + buildAdvancedGrowthDetailsToggleHtml('advGrowthReinehrDetails', detailsHtml) + '\n      </div>';
    }
    return '<div class="adv-growth-result-block adv-growth-result-block--reinehr"><p><strong>Prognoza wzrostu ostatecznego (model Reinehr 2019):</strong> ' + agSafeEscape(predicted) + ' cm</p></div>';
  }

  function advGrowthBuildReinehrCdgpSummaryText(result) {
    if (!result || typeof result !== 'object' || result.available !== true) return null;
    const predictedAdultHeight = Number(result.predictedAdultHeightCm);
    if (!Number.isFinite(predictedAdultHeight)) return null;
    return 'Prognoza wzrostu ostatecznego (Reinehr 2019): ' + agFormatNumber(predictedAdultHeight, 1) + ' cm';
  }

  function advGrowthBuildReinehrCdgpSummaryCardLine(result) {
    if (!result || typeof result !== 'object' || result.available !== true) return '';
    const predictedAdultHeight = Number(result.predictedAdultHeightCm);
    if (!Number.isFinite(predictedAdultHeight)) return '';
    return 'Prognoza wzrostu ostatecznego (model Reinehr 2019): ' + agFormatNumber(predictedAdultHeight, 1) + ' cm';
  }

  if (typeof window !== 'undefined') {
    window.advGrowthBuildKowdProfileModel = advGrowthBuildKowdProfileModel;
    window.advGrowthBuildKowdProfileHtml = advGrowthBuildKowdProfileHtml;
    window.advGrowthBuildKowdProfileSummaryLines = advGrowthBuildKowdProfileSummaryLines;
    window.advGrowthAssessReinehrCdgpReliability = advGrowthAssessReinehrCdgpReliability;
    window.advGrowthCalculateReinehrCdgpPrediction = advGrowthCalculateReinehrCdgpPrediction;
    window.advGrowthBuildReinehrCdgpResultHtml = advGrowthBuildReinehrCdgpResultHtml;
    window.advGrowthBuildReinehrCdgpSummaryText = advGrowthBuildReinehrCdgpSummaryText;
    window.advGrowthBuildReinehrCdgpSummaryCardLine = advGrowthBuildReinehrCdgpSummaryCardLine;
    window.advGrowthPredictionProfileLabel = agProfileLabel;
  }
})();
