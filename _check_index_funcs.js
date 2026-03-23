function getEffectiveCentileGrowthDataState() {
  const adv = (window.advancedGrowthData && typeof window.advancedGrowthData === 'object') ? window.advancedGrowthData : null;
  const basic = buildBasicGrowthCentileDataState();
  if (!adv && !basic) return null;
  if (!adv) return basic;
  if (!basic) return adv;

  const pickString = (a, b) => (typeof a === 'string' && a.trim()) ? a.trim() : ((typeof b === 'string' && b.trim()) ? b.trim() : '');
  const pickNumber = (a, b) => Number.isFinite(Number(a)) ? Number(a) : (Number.isFinite(Number(b)) ? Number(b) : null);
  const pickBoolean = (a, b) => (typeof a === 'boolean') ? a : !!b;
  const advMeasurements = Array.isArray(adv.measurements) ? sanitizeCentileMeasurementEntries(adv.measurements) : [];
  const basicMeasurements = Array.isArray(basic.measurements) ? sanitizeCentileMeasurementEntries(basic.measurements) : [];
  const advHasMeasurements = advMeasurements.length > 0;
  const basicHasMeasurements = basicMeasurements.length > 0;

  if (advHasMeasurements) {
    const merged = Object.assign({}, adv);
    merged.measurements = advMeasurements;
    merged.currentAgeMonths = pickNumber(adv.currentAgeMonths, basic.currentAgeMonths);
    merged.currentHeight = pickNumber(adv.currentHeight, basic.currentHeight);
    merged.currentWeight = pickNumber(adv.currentWeight, basic.currentWeight);
    merged.name = pickString(adv.name, basic.name);
    merged.sex = pickString(adv.sex, basic.sex) || 'M';
    merged.sourceModule = pickString(adv.sourceModule, '');
    merged.currentArrowEnabled = pickBoolean(adv.currentArrowEnabled, basic.currentArrowEnabled);
    merged.currentArrowComment = pickString(adv.currentArrowComment, basic.currentArrowComment);
    if (!Number.isFinite(Number(merged.growthVelocity)) && Number.isFinite(Number(basic.growthVelocity))) {
      merged.growthVelocity = Number(basic.growthVelocity);
    }
    if (!Number.isFinite(Number(merged.growthVelocityGapM)) && Number.isFinite(Number(basic.growthVelocityGapM))) {
      merged.growthVelocityGapM = Number(basic.growthVelocityGapM);
    }
    if (!(typeof merged.growthVelocityContext === 'string' && merged.growthVelocityContext.trim()) && basic.growthVelocityContext) {
      merged.growthVelocityContext = basic.growthVelocityContext;
    }
    if (typeof merged.growthVelocityUsedLastYear !== 'boolean') {
      merged.growthVelocityUsedLastYear = !!basic.growthVelocityUsedLastYear;
    }
    merged.isLosingGrowth = !!(merged.isLosingGrowth || basic.isLosingGrowth);
    return merged;
  }

  if (basicHasMeasurements) {
    return basic;
  }

  const merged = Object.assign({}, adv);
  merged.measurements = mergeCentileMeasurementSets(advMeasurements, basicMeasurements);
  merged.currentAgeMonths = pickNumber(adv.currentAgeMonths, basic.currentAgeMonths);
  merged.currentHeight = pickNumber(adv.currentHeight, basic.currentHeight);
  merged.currentWeight = pickNumber(adv.currentWeight, basic.currentWeight);
  merged.name = pickString(adv.name, basic.name);
  merged.sex = pickString(adv.sex, basic.sex) || 'M';
  merged.sourceModule = pickString(adv.sourceModule, basic.sourceModule);
  merged.currentArrowEnabled = pickBoolean(adv.currentArrowEnabled, basic.currentArrowEnabled);
  merged.currentArrowComment = pickString(adv.currentArrowComment, basic.currentArrowComment);
  if (!Number.isFinite(Number(merged.growthVelocity)) && Number.isFinite(Number(basic.growthVelocity))) {
    merged.growthVelocity = Number(basic.growthVelocity);
  }
  if (!Number.isFinite(Number(merged.growthVelocityGapM)) && Number.isFinite(Number(basic.growthVelocityGapM))) {
    merged.growthVelocityGapM = Number(basic.growthVelocityGapM);
  }
  if (!(typeof merged.growthVelocityContext === 'string' && merged.growthVelocityContext.trim()) && basic.growthVelocityContext) {
    merged.growthVelocityContext = basic.growthVelocityContext;
  }
  if (typeof merged.growthVelocityUsedLastYear !== 'boolean') {
    merged.growthVelocityUsedLastYear = !!basic.growthVelocityUsedLastYear;
  }
  merged.isLosingGrowth = !!(merged.isLosingGrowth || basic.isLosingGrowth);
  return merged;
}

function buildCentilePageCanvas({
  rangeMinX, rangeMaxX, sex, userAgeMonths, userWeight, userHeight,
  headerTitle, headerSubtitle, footerText, chartSource
}