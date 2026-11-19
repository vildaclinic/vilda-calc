import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const original = read('../fixtures/respiratory-module-before-tools.js.txt');
const origin = JSON.parse(read('../fixtures/respiratory-module-before-tools.origin.json'));
const current = read('../../respiratory_module.js');
const engineSource = read('../../vitalSigns.js');
const engineWindow = {};
vm.runInNewContext(engineSource, { window: engineWindow });
const realEngine = engineWindow.vitalSigns;
const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');
const plain = value => structuredClone(value);

// This is a DOM observation harness, not a second respiratory calculation.
// Both renderers call the same real production engine, including the legacy
// getRrPercentile-only path. Its arguments/results and all visible effects are
// part of the ordered trace compared below.
function observedEngine(mode, trace) {
  if (mode === 'missing') return null;
  const methods = mode === 'empty' ? [] : mode === 'percentile-only'
    ? ['getRrPercentile'] : mode === 'assessment-only'
      ? ['getRrAssessment'] : ['getRrAssessment', 'getRrPercentile'];
  const object = {};
  methods.forEach(name => {
    object[name] = (...args) => {
      trace.push(['engine-call', name, plain(args)]);
      if (mode === 'throw') throw new Error('native engine failure');
      const result = mode === 'null-assessment' && name === 'getRrAssessment'
        ? null : realEngine[name](...args);
      trace.push(['engine-return', name, plain(result)]);
      return result;
    };
  });
  return new Proxy(object, { get(target, key) {
    trace.push(['engine-read', String(key)]);
    return target[key];
  } });
}

function browser(source, scenario = {}) {
  const trace = [], nodes = new Map(), ready = [];
  const raw = { age: '10', ageMonths: '0', respiratoryRateInput: '20',
    respState: 'awake', respPopulation: 'healthy', respTemperature: '',
    resultsModeToggle: '', ...scenario.values };
  const absent = new Set(scenario.absent || []);
  function node(id) {
    let value = raw[id], className = 'result-box rr-danger old', html = '';
    const listeners = new Map();
    const element = {
      addEventListener(type, callback) {
        trace.push(['listen', id, type]);
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(callback);
      },
      classList: {
        remove(...names) {
          trace.push(['class-remove', id, ...names]);
          className = className.split(' ').filter(name => !names.includes(name)).join(' ');
        },
        add(name) {
          trace.push(['class-add', id, name]);
          if (!className.split(' ').includes(name)) className += ' ' + name;
        }
      },
      snapshot: () => ({ html, className }),
      setValue: next => { value = next; },
      setHtml: next => { html = next; },
      emit: type => (listeners.get(type) || []).forEach(callback => callback())
    };
    Object.defineProperties(element, {
      value: { get() { trace.push(['value', id]); return value; } },
      className: { set(next) { trace.push(['class-name', id, next]); className = next; } },
      textContent: { set(next) { trace.push(['text-content', id, next]); html = next; } }
    });
    return element;
  }
  Object.keys(raw).concat('respiratoryResult').forEach(id => {
    if (!absent.has(id)) nodes.set(id, node(id));
  });
  const document = {
    readyState: scenario.readyMode === 'dom-loading' ? 'loading' : 'complete',
    getElementById(id) { trace.push(['get', id]); return nodes.get(id) || null; },
    addEventListener(type, callback, options) {
      trace.push(['document-listen', type, plain(options)]);
      ready.push(callback);
    }
  };
  const nativeEngine = observedEngine(scenario.engine, trace);
  const win = {};
  Object.defineProperties(win, {
    vitalSigns: { get() { trace.push(['window-engine']); return nativeEngine; } },
    professionalMode: { get() { trace.push(['window-professional']); return scenario.professional; } }
  });
  if (!scenario.readyMode || scenario.readyMode === 'vilda-ready') {
    win.vildaOnReady = (key, callback) => { trace.push(['ready', key]); ready.push(callback); };
  }
  if (scenario.htmlMode !== 'fallback') {
    win.VildaHtml = { setTrustedHtml(element, html, options) {
      trace.push(['html', options.context, html]);
      if (scenario.htmlMode === 'throw') throw new Error('native HTML mount failure');
      element.setHtml(html);
      return true;
    } };
  }
  const context = {
    window: win, document,
    parseFloat(value) { trace.push(['parse-float', value]); return parseFloat(value); },
    clearPulse: element => { trace.push(['clear-pulse', element === nodes.get('respiratoryResult')]); },
    applyPulse: (element, severity) => { trace.push(['apply-pulse', element === nodes.get('respiratoryResult'), severity]); },
    vildaLogSwallowedCatch: (...args) => { trace.push(['log', args[0], args[1].message, plain(args[2])]); }
  };
  if (!scenario.noAgeFunction) context.getAgeDecimal = () => {
    trace.push(['age-function']);
    return Object.hasOwn(scenario, 'age') ? scenario.age : 10;
  };
  if (Object.hasOwn(scenario, 'lexicalProfessional')) {
    Object.defineProperty(context, 'professionalMode', {
      get() { trace.push(['lexical-professional']); return scenario.lexicalProfessional; }
    });
  }
  // The logger is a globalThis hook in both original and current code.
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  let failure;
  try { ready.forEach(callback => callback()); }
  catch (error) { failure = error.message; }
  return { trace, nodes, win, failure, snapshot: () => nodes.get('respiratoryResult')?.snapshot() };
}

function inputFor(scenario) {
  const values = { age: '10', ageMonths: '0', respiratoryRateInput: '20',
    respState: 'awake', respPopulation: 'healthy', respTemperature: '', ...scenario.values };
  const absent = new Set(scenario.absent || []);
  const value = id => absent.has(id) ? '' : values[id];
  const text = id => value(id) == null ? '' : String(value(id)).trim();
  return Object.freeze({
    ageYears: scenario.noAgeFunction ? parseFloat(value('age')) || 0
      : Object.hasOwn(scenario, 'age') ? scenario.age : 10,
    ageFieldsFilled: text('age') !== '' || text('ageMonths') !== '',
    rrRaw: text('respiratoryRateInput'),
    state: absent.has('respState') ? 'awake' : values.respState,
    population: absent.has('respPopulation') ? 'healthy' : values.respPopulation,
    temperatureRaw: absent.has('respTemperature') ? '' : values.respTemperature,
    professional: scenario.lexicalProfessional || scenario.professional
  });
}

const cases = [
  ['empty rate and age', { values: { respiratoryRateInput: '', age: '', ageMonths: '' } }],
  ['whitespace rate', { values: { respiratoryRateInput: '   ' } }],
  ['invalid rate', { values: { respiratoryRateInput: 'bad' } }],
  ['non-finite rate', { values: { respiratoryRateInput: 'Infinity' } }],
  ['missing age', { values: { age: '', ageMonths: '' } }],
  ['explicit newborn age', { age: 0, values: { age: '0', respiratoryRateInput: '43' } }],
  ['months alone', { age: 0.5, values: { age: '', ageMonths: '6', respiratoryRateInput: '38' } }],
  ['negative age', { age: -0.01 }],
  ['invalid age result', { age: NaN }],
  ['last eligible age', { age: 18 }],
  ['age beyond coverage', { age: 18.001 }],
  ['zero rate', { values: { respiratoryRateInput: '0' } }],
  ['rate below minimum', { values: { respiratoryRateInput: '2.99' } }],
  ['minimum rate', { values: { respiratoryRateInput: '3' } }],
  ['maximum rate', { values: { respiratoryRateInput: '200' } }],
  ['rate beyond maximum', { values: { respiratoryRateInput: '200.01' } }],
  ['rate whitespace and decimal', { values: { respiratoryRateInput: ' 24.6 ' } }],
  ['quiet sleep', { age: 1, values: { respState: 'sleep', respiratoryRateInput: '22' } }],
  ['sleep boundary', { age: 4.5, values: { respState: 'sleep' } }],
  ['sleep beyond coverage', { age: 4.50001, values: { respState: 'sleep' } }],
  ['hospital fever', { values: { respPopulation: 'hospital', respTemperature: '39.5' } }],
  ['hospital sleeping with fever', { values: { respPopulation: 'hospital', respState: 'sleep', respTemperature: '39.5' } }],
  ['sleep temperature assumption', { age: 1, values: { respState: 'sleep', respTemperature: '38' } }],
  ['missing option elements', { absent: ['respState', 'respPopulation', 'respTemperature'] }],
  ['fallback decimal age ignores months', { noAgeFunction: true, values: { age: '1.5', ageMonths: '6' } }],
  ['fallback months alone remains zero', { noAgeFunction: true, values: { age: '', ageMonths: '6' } }],
  ['fallback invalid age remains zero', { noAgeFunction: true, values: { age: 'bad' } }],
  ['fallback absent age element', { noAgeFunction: true, absent: ['age'], values: { ageMonths: '6' } }],
  ['missing native engine', { engine: 'missing' }],
  ['empty native engine', { engine: 'empty' }],
  ['legacy percentile-only engine', { engine: 'percentile-only', values: { respTemperature: '39' } }],
  ['assessment-only native engine', { engine: 'assessment-only' }],
  ['null native assessment', { engine: 'null-assessment' }],
  ['lexical professional mode', { lexicalProfessional: true, professional: false }],
  ['window professional fallback', { lexicalProfessional: false, professional: true }]
];
['', 'bad', '0', '33.99', '34', '35.99', '36', '37', '42', '42.01'].forEach(temperature => {
  cases.push(['temperature ' + JSON.stringify(temperature), { values: { respTemperature: temperature } }]);
});
// Sample native reference points rather than copying or inverting a formula.
[0, 0.5, 2, 10, 18].forEach(age => {
  const reference = realEngine.getRrValues(age, { population: 'healthy', state: 'awake' });
  Object.entries(reference).forEach(([point, rate]) => {
    cases.push([`native ${point} at ${age} years`, { age, values: { respiratoryRateInput: String(rate) } }]);
  });
});

describe('respiratory presentation — pinned native parity', () => {
  it('keeps the exact pre-refactor source and its Git/SHA-256 origin', () => {
    expect(origin.sourceCommit).toBe('7de34c337d65658572d6889fea118ba63d5dc2b4');
    expect(origin.sourcePath).toBe('respiratory_module.js');
    expect(origin.sourceGitBlob).toBe('bfff8fc89081ae1f12cbc5d12e352b30cf4fd980');
    expect(origin.sourceSha256).toBe('a17c0e0ec94f5e9654c8007ec22bcce5efcc8ecc9829de748db2f582ab3fd09c');
    expect(hash('sha256', original)).toBe(origin.sourceSha256);
    expect(hash('sha1', Buffer.concat([Buffer.from(`blob ${Buffer.byteLength(original)}\0`), Buffer.from(original)])))
      .toBe(origin.sourceGitBlob);
  });

  it.each(cases)('%s keeps exact HTML, native access/engine order and pulse effects', (_name, scenario) => {
    const before = browser(original, scenario), after = browser(current, scenario);
    expect(before.failure).toBeUndefined();
    expect(after.failure).toBeUndefined();
    expect(after.snapshot()).toEqual(before.snapshot());
    expect(after.trace).toEqual(before.trace);

    const trace = [], result = after.win.VildaRespiratory.buildResult(inputFor(scenario), observedEngine(scenario.engine, trace));
    const legacy = before.snapshot();
    const severity = legacy.className.includes('rr-danger') ? 'danger'
      : legacy.className.includes('rr-warning') ? 'warning' : '';
    expect(plain(result)).toEqual({ html: legacy.html, severity });
    expect(trace).toEqual(before.trace.filter(entry => entry[0].startsWith('engine-')));
  });

  it('covers normal, warning and danger with the real engine', () => {
    const severities = new Set(cases.map(([, scenario]) => {
      const state = browser(original, scenario).snapshot();
      return state.className.includes('rr-danger') ? 'danger'
        : state.className.includes('rr-warning') ? 'warning' : '';
    }));
    expect([...severities].sort()).toEqual(['', 'danger', 'warning']);
  });

  it.each(['vilda-ready', 'dom-loading', 'immediate'])('keeps %s initialization and every native event binding', readyMode => {
    const before = browser(original, { readyMode }), after = browser(current, { readyMode });
    const changes = [
      ['respiratoryRateInput', 'input', '32'], ['age', 'input', '2'],
      ['ageMonths', 'input', '3'], ['respState', 'change', 'sleep'],
      ['respState', 'input', 'awake'], ['respPopulation', 'change', 'hospital'],
      ['respPopulation', 'input', 'healthy'], ['respTemperature', 'input', '38'],
      ['resultsModeToggle', 'change', '']
    ];
    changes.forEach(([id, event, value]) => {
      before.nodes.get(id).setValue(value); after.nodes.get(id).setValue(value);
      before.nodes.get(id).emit(event); after.nodes.get(id).emit(event);
      expect(after.snapshot()).toEqual(before.snapshot());
      expect(after.trace).toEqual(before.trace);
    });
    expect(after.trace.filter(entry => entry[0] === 'clear-pulse')).toHaveLength(changes.length + 1);
    expect(after.trace.filter(entry => entry[0] === 'html')).toHaveLength(changes.length + 1);
  });

  it.each([
    ['missing input', { absent: ['respiratoryRateInput'] }],
    ['missing result', { absent: ['respiratoryResult'] }],
    ['HTML helper absent', { htmlMode: 'fallback' }],
    ['HTML helper failure', { htmlMode: 'throw', values: { respiratoryRateInput: '200' } }],
    ['native engine failure', { engine: 'throw' }]
  ])('%s retains the native effect and failure trace', (_name, scenario) => {
    const before = browser(original, scenario), after = browser(current, scenario);
    expect(after.failure).toEqual(before.failure);
    expect(after.snapshot()).toEqual(before.snapshot());
    expect(after.trace).toEqual(before.trace);
  });

  it('builds every draft result without reading browser context or mutating its inputs/engine', () => {
    const win = { vildaOnReady() {} }, context = { window: win };
    vm.createContext(context);
    vm.runInContext(current, context);
    const buildResult = win.VildaRespiratory.buildResult, forbiddenReads = [];
    // Install after module registration. A model invocation may only read its
    // explicit input/engine; globals throw even if accessed through typeof.
    ['window', 'document', 'globalThis', 'professionalMode', 'localStorage',
      'sessionStorage', 'history', 'VildaPersistence', 'setTimeout',
      'dispatchEvent', 'applyPulse', 'clearPulse'].forEach(name => {
      Object.defineProperty(context, name, { configurable: true, get() {
        forbiddenReads.push(name); throw new Error('Unexpected browser context read: ' + name);
      } });
    });
    const engine = new Proxy(Object.freeze({
      getRrAssessment: realEngine.getRrAssessment,
      getRrPercentile: realEngine.getRrPercentile
    }), { set() { throw new Error('Unexpected native engine mutation'); } });
    cases.forEach(([, scenario]) => {
      const input = inputFor(scenario), before = plain(input);
      const explicitEngine = scenario.engine ? observedEngine(scenario.engine, []) : engine;
      const result = buildResult(input, explicitEngine);
      expect(typeof result.html).toBe('string');
      expect(plain(input)).toEqual(before);
    });
    expect(forbiddenReads).toEqual([]);
  });

  it('resolves the native engine only after validation and keeps explicit resolver failures', () => {
    const api = browser(current).win.VildaRespiratory;
    let calls = 0;
    const resolve = () => { calls += 1; return realEngine; };
    api.buildResult(inputFor({ values: { respiratoryRateInput: '' } }), resolve);
    api.buildResult(inputFor({ values: { age: '', ageMonths: '' } }), resolve);
    api.buildResult(inputFor({ age: 19 }), resolve);
    api.buildResult(inputFor({ values: { respiratoryRateInput: '0' } }), resolve);
    expect(calls).toBe(0);
    expect(api.buildResult(inputFor({}), resolve).html).toContain('Fleming');
    expect(calls).toBe(1);
    expect(() => api.buildResult(inputFor({}), () => { throw new Error('native lookup failure'); }))
      .toThrow('native lookup failure');
  });
});
