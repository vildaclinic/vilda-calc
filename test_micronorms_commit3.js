const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = __dirname;

function makeSandbox() {
  const document = {
    addEventListener() {},
    getElementById() { return null; }
  };
  const window = {
    dispatchEvent() {},
    addEventListener() {},
    professionalMode: false
  };
  global.window = window;
  global.document = document;
  global.CustomEvent = function(type, init) { this.type = type; this.detail = init && init.detail; };
  global.fetch = async function(url) {
    const clean = String(url).replace(/^\//, '').split('?')[0];
    const file = path.join(base, clean);
    try {
      const txt = fs.readFileSync(file, 'utf8');
      return { ok: true, json: async () => JSON.parse(txt) };
    } catch (_) {
      return { ok: false };
    }
  };
  const code = fs.readFileSync(path.join(base, 'nutrition_micros.js'), 'utf8');
  vm.runInThisContext(code, { filename: 'nutrition_micros.js' });
  return window;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async function run() {
  const window = makeSandbox();
  await window.nutritionMicrosEnsureData();

  const results = [];
  function test(name, fn) {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
    }
  }

  test('adult female has safety section with UL and safe levels', () => {
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 30, ageMonths: 0, sex: 'K' });
    assert(model && model.safety, 'missing safety section');
    assert(Array.isArray(model.safety.ul) && model.safety.ul.length > 0, 'missing UL entries');
    assert(Array.isArray(model.safety.safeLevels) && model.safety.safeLevels.length === 2, 'expected 2 safe level entries');
  });

  test('adult female includes vitamin D UL in safety', () => {
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 30, ageMonths: 0, sex: 'K' });
    const vitaminD = model.safety.ul.find((item) => item.id === 'vitamin_d');
    assert(vitaminD, 'missing vitamin D UL');
    assert(vitaminD.valueText === '100 µg/d (4000 IU/dobę)', 'unexpected vitamin D UL value: ' + vitaminD.valueText);
  });

  test('magnesium safety note is scope-limited', () => {
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 30, ageMonths: 0, sex: 'K' });
    const magnesium = model.safety.ul.find((item) => item.id === 'magnesium');
    assert(magnesium, 'missing magnesium UL');
    assert(/suplementów diety, wody i żywności wzbogacanej/i.test(magnesium.noteText), 'missing magnesium scope note');
  });

  test('adult female vitamin D norm includes IU conversion', () => {
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 30, ageMonths: 0, sex: 'K' });
    const vitaminD = model.quickSet.find((item) => item.id === 'vitamin_d');
    assert(vitaminD, 'missing vitamin D quick set entry');
    assert(vitaminD.valueText === '15 µg/d (600 IU/dobę)', 'unexpected vitamin D norm value: ' + vitaminD.valueText);
  });

  test('non vitamin D nutrients are not converted to IU', () => {
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 30, ageMonths: 0, sex: 'K' });
    const calcium = model.quickSet.find((item) => item.id === 'calcium');
    assert(calcium, 'missing calcium quick set entry');
    assert(!/IU\/dobę/.test(calcium.valueText), 'calcium should not contain IU conversion: ' + calcium.valueText);
  });


  test('adult vitamin D supplement is personalized from weight and BMI', () => {
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 30, ageMonths: 0, sex: 'K', weightKg: 70, heightCm: 170 });
    const vitaminD = model.quickSet.find((item) => item.id === 'vitamin_d');
    assert(vitaminD && vitaminD.vitaminDSupplement, 'missing vitamin D supplement model');
    assert(vitaminD.vitaminDSupplement.doseIU === 1500, 'unexpected adult dose: ' + vitaminD.vitaminDSupplement.doseIU);
    assert(vitaminD.vitaminDSupplement.doseText === '1500 IU/dobę (37,5 µg/dobę)', 'unexpected adult dose text: ' + vitaminD.vitaminDSupplement.doseText);
  });

  test('adult obesity routes vitamin D supplement to upper automatic range', () => {
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 30, ageMonths: 0, sex: 'M', weightKg: 110, heightCm: 170 });
    const vitaminD = model.quickSet.find((item) => item.id === 'vitamin_d');
    assert(vitaminD && vitaminD.vitaminDSupplement, 'missing vitamin D supplement model');
    assert(vitaminD.vitaminDSupplement.doseIU === 4000, 'unexpected obesity dose: ' + vitaminD.vitaminDSupplement.doseIU);
    assert(/Otyłość/.test(vitaminD.vitaminDSupplement.bmiWarning), 'missing obesity warning');
  });

  test('adolescent overweight vitamin D supplement uses higher range', () => {
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 15, ageMonths: 0, sex: 'M', weightKg: 72, heightCm: 170, bmiPercentile: 90 });
    const vitaminD = model.quickSet.find((item) => item.id === 'vitamin_d');
    assert(vitaminD && vitaminD.vitaminDSupplement, 'missing vitamin D supplement model');
    assert(vitaminD.vitaminDSupplement.doseIU === 3000, 'unexpected adolescent overweight dose: ' + vitaminD.vitaminDSupplement.doseIU);
    assert(vitaminD.vitaminDSupplement.selectedFromHigherRange === true, 'should mark higher range');
  });

  test('adolescent vitamin D seasonal note is separated from reason bullets', () => {
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 15, ageMonths: 0, sex: 'M', weightKg: 66, heightCm: 177, bmiPercentile: 69 });
    const vitaminD = model.quickSet.find((item) => item.id === 'vitamin_d');
    const supplement = vitaminD && vitaminD.vitaminDSupplement;
    assert(supplement, 'missing vitamin D supplement model');
    assert(/odkrytymi przedramionami i podudziami/.test(supplement.seasonText), 'missing detailed seasonal note');
    assert(!supplement.reasonItems.some((item) => /Od maja do września/.test(item)), 'seasonal note should not be included in bullet reasons');
  });

  test('girl 10-12 gets iron control when unresolved', () => {
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 10, ageMonths: 0, sex: 'K' });
    assert(model.controls && model.controls.ironVariant, 'missing iron variant control');
    const iron = model.quickSet.find((item) => item.id === 'iron');
    assert(iron && iron.unresolved, 'iron should be unresolved without selection');
    assert(iron.valueText === '10–15 mg/d', 'unexpected unresolved iron range');
  });

  test('girl 10-12 can resolve iron pre menarche', () => {
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 10, ageMonths: 0, sex: 'K', variantPreference: { iron: 'pre_menarche' } });
    const iron = model.quickSet.find((item) => item.id === 'iron');
    assert(iron && !iron.unresolved, 'iron should resolve');
    assert(iron.valueText === '10 mg/d', 'unexpected iron value for pre menarche');
  });

  test('girl 10-12 can resolve iron post menarche', () => {
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 10, ageMonths: 0, sex: 'K', variantPreference: { iron: 'post_menarche' } });
    const iron = model.quickSet.find((item) => item.id === 'iron');
    assert(iron && !iron.unresolved, 'iron should resolve');
    assert(iron.valueText === '15 mg/d', 'unexpected iron value for post menarche');
  });


  test('professional mode adds food example actions for selected micronutrients only', () => {
    window.professionalMode = true;
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 30, ageMonths: 0, sex: 'K' });
    const calcium = model.quickSet.find((item) => item.id === 'calcium');
    const iron = model.quickSet.find((item) => item.id === 'iron');
    const iodine = model.quickSet.find((item) => item.id === 'iodine');
    const zinc = model.minerals.find((item) => item.id === 'zinc');
    const folate = model.vitamins.find((item) => item.id === 'folate');
    const vitaminD = model.quickSet.find((item) => item.id === 'vitamin_d');
    assert(calcium && calcium.examplesAvailable, 'calcium should expose examples');
    assert(iron && iron.examplesAvailable, 'iron should expose examples');
    assert(iodine && iodine.examplesAvailable, 'iodine should expose examples');
    assert(zinc && zinc.examplesAvailable, 'zinc should expose examples');
    assert(folate && folate.examplesAvailable, 'folate should expose examples');
    assert(vitaminD && !vitaminD.examplesAvailable, 'vitamin D should not expose food examples');
    window.professionalMode = false;
  });

  test('standard mode does not add food example actions', () => {
    window.professionalMode = false;
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 30, ageMonths: 0, sex: 'K' });
    const calcium = model.quickSet.find((item) => item.id === 'calcium');
    assert(calcium && !calcium.examplesAvailable, 'calcium examples should be professional-only');
  });

  test('food examples sheet calculates target share for calcium', () => {
    window.professionalMode = true;
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 30, ageMonths: 0, sex: 'K' });
    const calcium = model.quickSet.find((item) => item.id === 'calcium');
    const sheet = window.nutritionMicrosBuildFoodExamplesSheetContent(calcium, model);
    assert(sheet && /Wapń/.test(sheet.title), 'missing calcium sheet title');
    assert(/Przykładowe porcje/.test(sheet.bodyHtml), 'missing portions section');
    assert(/Jogurt naturalny/.test(sheet.bodyHtml), 'missing yogurt example');
    assert(/ok\. 42% celu/.test(sheet.bodyHtml), 'expected yogurt target share around 42% for 1000 mg target');
    window.professionalMode = false;
  });

  test('unresolved iron examples use the upper target from the range', () => {
    window.professionalMode = true;
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 10, ageMonths: 0, sex: 'K' });
    const iron = model.quickSet.find((item) => item.id === 'iron');
    assert(iron && iron.examplesAvailable, 'unresolved iron should still expose examples');
    const sheet = window.nutritionMicrosBuildFoodExamplesSheetContent(iron, model);
    assert(/przykłady liczone dla wyższej wartości z zakresu/.test(sheet.bodyHtml), 'missing upper-range note for unresolved iron');
    assert(/15 mg\/d/.test(sheet.bodyHtml), 'upper iron target should be visible');
    window.professionalMode = false;
  });

  const passed = results.filter((item) => item.ok).length;
  const failed = results.filter((item) => !item.ok).length;
  const output = { passed, failed, results };
  fs.writeFileSync('/mnt/data/micronorms_commit3_test_results_v30.json', JSON.stringify(output, null, 2));
  if (failed) {
    console.error(JSON.stringify(output, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(output, null, 2));
})();
