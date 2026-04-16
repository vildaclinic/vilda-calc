const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = '/mnt/data/work_v29';

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
    assert(vitaminD.valueText === '100 µg/d', 'unexpected vitamin D UL value');
  });

  test('magnesium safety note is scope-limited', () => {
    const model = window.nutritionMicrosBuildCardModel({ ageYears: 30, ageMonths: 0, sex: 'K' });
    const magnesium = model.safety.ul.find((item) => item.id === 'magnesium');
    assert(magnesium, 'missing magnesium UL');
    assert(/suplementów diety, wody i żywności wzbogacanej/i.test(magnesium.noteText), 'missing magnesium scope note');
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

  const passed = results.filter((item) => item.ok).length;
  const failed = results.filter((item) => !item.ok).length;
  const output = { passed, failed, results };
  fs.writeFileSync('/mnt/data/micronorms_commit3_test_results_v29.json', JSON.stringify(output, null, 2));
  if (failed) {
    console.error(JSON.stringify(output, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(output, null, 2));
})();
