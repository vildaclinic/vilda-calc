import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const pediatric = read('../../bp_module.js');
const adult = read('../../adult_vitals.js');
// Native deployment artifacts at b48a7361cd7bd34289f5aa6a7afeb46fabb6c877.
const originalPediatric = read('../fixtures/bp-module-before-tools.js.txt');
const originalAdult = read('../fixtures/adult-vitals-before-tools.js.txt');
const clinical = {};
vm.runInNewContext(read('../../vitalSigns.js'), { window: clinical });
const centileKeys = ['percSbp', 'percDbp', 'zSbp', 'zDbp'];
const clone = value => structuredClone(value);
const defaults = {
  age: '10', ageMonths: '0', sex: 'M', height: '140',
  bpSystolic: '110', bpDiastolic: '70', bpDataToggle: false,
  heartRate: '82', hrPopulation: 'healthy', hrTemperature: '', resultsModeToggle: true,
  adultBpSystolic: '135', adultBpDiastolic: '86', adultHeartRate: '68',
  adultBpGuidelineToggle: true, adultHrAthlete: false, adultHrAthleteNo: true,
  adultHrBetaBlocker: false, adultHrBetaBlockerNo: true
};

function browser(source, scenario = {}) {
  const trace = [], ready = [];
  const values = { ...defaults, ...scenario.values };
  const nodes = new Map();
  for (const id of Object.keys(values).concat('bpResult', 'bpToggleContainer', 'adultVitalsResult', 'adultVitalsCard')) {
    if (scenario.absent?.includes(id)) continue;
    const listeners = new Map();
    let html = '', resetClass = 'result-box old', value = values[id];
    const classNames = new Set(resetClass.split(' '));
    const node = {
      id,
      style: new Proxy({ display: '' }, { set(target, key, display) {
        trace.push(['style', id, key, display]); target[key] = display; return true;
      } }),
      dataset: new Proxy(id === 'bpDataToggle' && scenario.manual ? { manual: '1' } : {}, {
        set(target, key, data) { trace.push(['dataset', id, key, data]); target[key] = data; return true; }
      }),
      addEventListener(event, callback) {
        trace.push(['listener', id, event]);
        listeners.set(event, [...(listeners.get(event) || []), callback]);
      },
      emit(event, next) {
        value = next;
        (listeners.get(event) || []).forEach(callback => callback.call(node, { type: event }));
      },
      get value() { trace.push(['value', id]); return value; },
      get checked() { trace.push(['checked', id]); return value; },
      set checked(next) { trace.push(['set-checked', id, next]); value = next; },
      set className(next) {
        trace.push(['class-name', id, next]);
        resetClass = next;
        classNames.clear();
        next.split(' ').forEach(name => classNames.add(name));
      },
      classList: {
        add(name) { trace.push(['add-class', id, name]); classNames.add(name); },
        remove(...names) { trace.push(['remove-class', id, ...names]); names.forEach(name => classNames.delete(name)); }
      },
      set textContent(next) { trace.push(['text', id, next]); html = next; },
      snapshot: () => ({ html, classNames: [...classNames], value, display: node.style.display }),
      html(next) { html = next; }
    };
    nodes.set(id, node);
  }
  const doc = { getElementById(id) { trace.push(['get', id]); return nodes.get(id) ?? null; } };
  const sdsEngine = Object.hasOwn(scenario, 'sds') && scenario.sds === null ? undefined : {
    policz(input) {
      trace.push(['sds', clone(input)]);
      if (scenario.sds === 'throw') throw new Error('SDS lookup failure');
      return { sds: scenario.sds ?? -0.75 };
    }
  };
  const engine = scenario.pulse === 'missing' ? undefined : {
    getHrPercentile(...args) { trace.push(['hr-percentile', clone(args)]); return clinical.vitalSigns.getHrPercentile(...args); },
    ...scenario.pulse === 'legacy' ? {} : {
      getHrAssessment(...args) {
        trace.push(['hr-assessment', clone(args)]);
        if (scenario.pulse === 'throw') throw new Error('pulse failure');
        return scenario.pulse === 'null' ? null : clinical.vitalSigns.getHrAssessment(...args);
      }
    }
  };
  const win = {
    document: doc,
    vildaOnReady(name, run) { trace.push(['init', name]); ready.push(run); },
    getAgeDecimal() { trace.push(['age']); return scenario.age ?? Number(values.age); },
    get vitalSigns() { trace.push(['vital-signs']); return engine; },
    get VildaSdsWzrostu() { trace.push(['height-sds']); return sdsEngine; },
    get professionalMode() { trace.push(['professional']); return scenario.professional !== false; },
    clearPulse(element) { trace.push(['clear-pulse', element.id]); },
    applyPulse(element, tone) { trace.push(['apply-pulse', element.id, tone]); },
    updateProfessionalSummaryCard() { trace.push(['summary']); },
    VildaHtml: {
      clearHtml(el) { trace.push(['clear-html', el.id]); el.html(''); },
      setTrustedHtml(el, html, opts) { trace.push(['html', el.id, opts.context, html]); el.html(html); }
    }
  };
  if (scenario.adultGate) win.patientReportIsAdultAge = age => {
    trace.push(['adult-gate', age]);
    return age >= scenario.adultGate;
  };
  const centiles = {};
  for (const key of centileKeys) {
    Object.defineProperty(win, key, {
      set(next) { trace.push(['centile', key, next]); centiles[key] = next; },
      get() { return centiles[key]; }
    });
  }
  const context = {
    window: win, document: doc, getAgeDecimal: win.getAgeDecimal, clearPulse: win.clearPulse, applyPulse: win.applyPulse,
    advHistoryGetPreferredSource() { trace.push(['sds-source']); return scenario.source || 'PALCZEWSKA'; },
    console: { error(text, error) { trace.push(['error', text, error.message]); } }
  };
  vm.runInNewContext(source, context);
  ready.forEach(run => run());
  return { trace, nodes, win, centiles, sdsEngine, engine, snapshot(id) { return nodes.get(id)?.snapshot(); } };
}

const pressureCases = [
  ['OLAF without an SDS engine', { sds: null }],
  ['OLAF after an SDS error', { sds: 'throw' }],
  ['NHBPEP without an SDS engine', { values: { bpDataToggle: true }, manual: true, sds: null }],
  ['NHBPEP after an SDS error', { values: { bpDataToggle: true }, manual: true, sds: 'throw' }],
  ['NHBPEP with WHO source', { values: { bpDataToggle: true }, manual: true, source: 'WHO' }],
  ['manual OLAF', { manual: true }],
  ['automatic OLAF after an unmarked checked value', { values: { bpDataToggle: true } }],
  ['age below threshold', { age: 2.99 }],
  ['first eligible age', { age: 3 }],
  ['outside OLAF availability', { age: 6.99 }],
  ['first OLAF age', { age: 7 }],
  ['last eligible age', { age: 18 }],
  ['age beyond coverage', { age: 18.001 }],
  ['no age', { values: { age: '', ageMonths: '' } }],
  ['age zero explicitly', { age: 0, values: { age: '0' } }],
  ['missing height', { values: { height: '' } }],
  ['missing BP', { values: { bpSystolic: '' } }],
  ['missing pulse and BP', { values: { heartRate: '', bpSystolic: '' } }],
  ['female fractional age', { age: 11.5, values: { sex: 'F', height: '145.5' } }],
  ['tails and danger', { values: { bpSystolic: '200', bpDiastolic: '140', heartRate: '30' } }],
  ['normal pediatric pressure', { values: { bpSystolic: '95', bpDiastolic: '58' } }],
  ['professional mode off', { professional: false }],
  ['absent optional controls', { absent: ['hrTemperature', 'hrPopulation', 'bpDataToggle', 'bpToggleContainer'] }],
  ['legacy pulse engine', { pulse: 'legacy' }],
  ['missing pulse engine', { pulse: 'missing' }],
  ['null pulse assessment', { pulse: 'null' }],
  ['failed pulse assessment', { pulse: 'throw' }],
  ['pulse outside range', { values: { heartRate: '221' } }],
  ['hospital with fever', { values: { hrPopulation: 'hospital', hrTemperature: '39.1' } }],
  ...['33.9', '34', '35.9', '36', '38.5', '42', '42.1'].map(value => [
    'temperature ' + value, { values: { hrTemperature: value } }
  ])
];

describe('pinned pediatric pressure and pulse presentation', () => {
  it.each(pressureCases)('keeps exact native behavior for %s', (_name, scenario) => {
    const before = browser(originalPediatric, scenario), after = browser(pediatric, scenario);
    expect(after.snapshot('bpResult')).toEqual(before.snapshot('bpResult'));
    expect(after.centiles).toEqual(before.centiles);
    expect(after.trace).toEqual(before.trace);
  });

  it('retains source toggle listener order, default and native refresh', () => {
    const before = browser(originalPediatric), after = browser(pediatric);
    const controls = [
      ['bpSystolic', 'input', '116'], ['bpDiastolic', 'input', '72'], ['heartRate', 'input', '98'],
      ['hrPopulation', 'change', 'hospital'], ['hrTemperature', 'input', '39.5'],
      ['bpDataToggle', 'change', true], ['bpDataToggle', 'change', true]
    ];
    for (const [id, event, value] of controls) {
      before.nodes.get(id).emit(event, value);
      after.nodes.get(id).emit(event, value);
      expect(after.snapshot('bpResult')).toEqual(before.snapshot('bpResult'));
      expect(after.trace).toEqual(before.trace);
    }
  });

  it.each(pressureCases)('matches separate detached previews for %s', (_name, scenario) => {
    const settings = { ...defaults, ...scenario.values };
    const after = browser(pediatric, scenario), current = after.win.bpModuleApi;
    const input = Object.freeze({
      ...clone(current.readPreviewContext()),
      sbpRaw: settings.bpSystolic, dbpRaw: settings.bpDiastolic, pulseRaw: settings.heartRate,
      temperatureRaw: scenario.absent?.includes('hrTemperature') ? '' : settings.hrTemperature,
      population: scenario.absent?.includes('hrPopulation') ? 'healthy' : settings.hrPopulation
    });
    const nativePressure = browser(originalPediatric, { ...scenario, values: { ...settings, heartRate: '' } });
    const nativePulse = browser(originalPediatric, { ...scenario, values: { ...settings, bpSystolic: '', bpDiastolic: '' } });
    const n = after.trace.length;
    const pressure = current.buildPressurePreview(input, after.sdsEngine);
    const pulse = current.buildPulsePreview(input, after.engine);
    expect(pressure.html).toBe(nativePressure.snapshot('bpResult').html);
    expect(pulse.html).toBe(nativePulse.snapshot('bpResult').html.replace(/<p class="bp-placeholder">[^<]+<\/p>/, ''));
    expect(after.trace.slice(n).every(entry => ['sds', 'hr-assessment', 'hr-percentile'].includes(entry[0]))).toBe(true);
    for (const [model, native] of [[pressure, nativePressure], [pulse, nativePulse]]) {
      const tone = native.snapshot('bpResult').classNames.find(name => name.startsWith('rr-'));
      expect(model.severity).toBe(tone?.slice(3) || '');
    }
  });

  it('exposes the existing OLAF/NHBPEP difference without shared-state writes', () => {
    const withOlaf = browser(pediatric, { sds: null, values: { heartRate: '' } });
    const api = withOlaf.win.bpModuleApi;
    const input = { ...api.readPreviewContext(), sbpRaw: '110', dbpRaw: '70', pulseRaw: '' };
    expect(api.buildPressurePreview(input, undefined)).toMatchObject({ status: 'ready', severity: 'warning' });
    expect(api.buildPressurePreview({ ...input, reference: 'NHBPEP' }, undefined)).toMatchObject({ status: 'unavailable', severity: '' });
    expect(withOlaf.centiles.percSbp).toBeCloseTo(70.83333333333334);
    expect(withOlaf.centiles.percDbp).toBe(90);
    expect(api.buildPulsePreview(input, undefined)).toMatchObject({ html: '', status: 'empty', severity: '' });
  });
});

const adultCases = [
  ['below active age', { age: 17.999 }],
  ['first eligible age', { age: 18 }],
  ['configured age gate', { age: 18.5, adultGate: 19 }],
  ['normal ESC/PTK', { age: 30, values: { adultBpSystolic: '115', adultBpDiastolic: '68' } }],
  ['AHA elevated pressure', { age: 30, values: { adultBpGuidelineToggle: false } }],
  ['danger', { age: 30, values: { adultBpSystolic: '195', adultBpDiastolic: '126' } }],
  ['partial pressure', { age: 30, values: { adultBpDiastolic: '' } }],
  ['lower pulse with context', { age: 30, values: { adultHeartRate: '54', adultHrAthlete: true } }],
  ['lower pulse with beta-blocker', { age: 50, values: { adultHeartRate: '43', adultHrBetaBlocker: true } }],
  ['faster pulse', { age: 30, values: { adultHeartRate: '117' } }],
  ['no data', { age: 30, values: { adultBpSystolic: '', adultBpDiastolic: '', adultHeartRate: '' } }]
];

describe('pinned adult pressure and pulse presentation', () => {
  it.each(adultCases)('keeps exact native behavior for %s', (_name, scenario) => {
    const before = browser(originalAdult, scenario), after = browser(adult, scenario);
    expect(after.snapshot('adultVitalsResult')).toEqual(before.snapshot('adultVitalsResult'));
    expect(after.snapshot('adultVitalsCard')).toEqual(before.snapshot('adultVitalsCard'));
    expect(after.trace).toEqual(before.trace);
    if (before.snapshot('adultVitalsCard').display !== 'none') {
      const api = after.win.adultVitalsApi, native = api.getState();
      const input = Object.freeze({
        reference: native.guidelineKey, sbpRaw: String(native.sbp), dbpRaw: String(native.dbp),
        pulseRaw: String(native.hr), athlete: native.athlete, betaBlocker: native.betaBlocker
      });
      const n = after.trace.length;
      const preview = api.buildPreview(input);
      expect(preview.html).toBe(before.snapshot('adultVitalsResult').html);
      const pressure = api.buildPreview(input, 'pressure'), pulse = api.buildPreview(input, 'pulse');
      expect(pressure.html).not.toContain('class="adult-vitals-result-label">Tętno:');
      expect(pulse.html).not.toContain('class="adult-vitals-result-label">Ciśnienie:');
      expect(after.trace.slice(n)).toEqual([]);
    }
  });
});

it('pins both native source fixtures to their pre-change Git blobs and SHA-256 hashes', () => {
  for (const [source, blob, sha256] of [
    [originalPediatric, '7dd3c570ba0836f11cbfa27126218340227abfdf', '4bfcf8a2d97c07858bff34c4369bc589016c77fdcc573a13b8793b85b9e1076d'],
    [originalAdult, '4b2e261e644d58186a8d77f6730a0827ecf8b605', '69e91e7183a94d44f8acf557cb65e1fa250b0d05c4e9673895b9f7b55d1f2549']
  ]) {
    expect(createHash('sha256').update(source).digest('hex')).toBe(sha256);
    expect(createHash('sha1').update('blob ' + Buffer.byteLength(source) + '\0').update(source).digest('hex')).toBe(blob);
  }
});
