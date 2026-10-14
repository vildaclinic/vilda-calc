import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_hormone_lifespan_reference.js');
const data = require('../../vilda_hormone_lifespan_data.js');
const snapshots = require('../../vilda_hormone_reference_snapshot.js');
const ui = require('../../vilda_hormone_reference_ui.js');
const resultFormatter = require('../../vilda_lab_assessment_ui.js').formatResult;
const auth = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const calendar = readFileSync(new URL('../../vilda_terminarz.js', import.meta.url), 'utf8');
const between = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  if (a < 0 || b < a) throw new Error(`Missing production helpers: ${start}`);
  return source.slice(a, b);
};

function documentDouble() {
  const doc = { createElement: tag => new Element(tag) };
  class Element {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.attributes = {}; this.listeners = {};
      this.ownerDocument = doc; this._text = ''; this.style = {}; this.value = '';
    }
    set textContent(value) { this.children = []; this._text = String(value); }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(' '); }
    set innerHTML(_) { throw new Error('HTML assignment is forbidden'); }
    get firstChild() { return this.children[0] || null; }
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
    removeChild(child) { this.children = this.children.filter(value => value !== child); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(event, callback) { (this.listeners[event] ||= []).push(callback); }
    dispatch(event) { for (const callback of this.listeners[event] || []) callback({ target: this }); }
  }
  return doc;
}
const children = element => element.children.flatMap(child => [child, ...children(child)]);
const byClass = (element, name) => children(element).filter(child => (child.getAttribute('class') || child.className || '').split(' ').includes(name));
const visibleText = element => element.tagName === 'details' ? '' : element._text + ' ' + element.children.map(visibleText).join(' ');
function snapshot(extra = {}, displayUnit = 'ng/mL') {
  const context = { analyte: 'amh', sex: 'female', ageYears: 15, ageLabel: '15 lat', preterm: 'no', ...extra };
  return snapshots.create({
    evaluation: engine.evaluate(data.patientPointData, { ...context, measurement: { value: .45, unit: 'ng/mL' } }),
    context, measurement: { raw: '0,45', sourceUnit: 'ng/mL', conversionFactor: 1 / .1401 },
    display: { unit: displayUnit, factorFromCanonical: displayUnit === 'ng/mL' ? .1401 : 1 },
    capturedAtISO: '2026-10-14T10:00:00.000Z',
    versions: { engine: engine.version, data: data.patientPointData.version, runtime: data.version },
  });
}
const lab = (reference = snapshot()) => ({ test: 'AMH', testKey: 'amh', value: '0,45', valueNum: .45, unit: 'ng/mL', hormoneReference: reference });

function hooks() {
  const document = documentDouble();
  const win = { document, VildaHormoneReferenceSnapshot: snapshots, VildaHormoneReferenceUI: ui };
  const element = (tag, attributes = {}) => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes || {})) {
      if (key === 'text') el.textContent = value;
      else el.setAttribute(key, value);
    }
    return el;
  };
  const source = between(auth, 'function Lh3HasAssessment(', 'function Lh3HasSeriesAssessment(');
  const history = new Function('i', 'e', `${source}; return {
    saved:HrSavedReference, watch:HrWatchReference, preserve:Lh3PreserveLabAfterEdit, contextState:Lh3EditorContextState
  };`)(win, element);
  const calendarSource = between(calendar, 'function TzHrSavedReference(', 'function He(');
  const schedule = new Function('w', 'g', `${calendarSource}; return {saved:TzHrSavedReference,watch:TzHrWatchReference};`)(win, document);
  const series = new Function('i', `${between(auth, 'function yi(', 'function Nl(')};return yi;`)(win);
  return { document, win, history, schedule, series };
}

describe('Saved educational AMH reference renderer', () => {
  it('shows the stored group median in the selected unit, with the source and saved age collapsed', () => {
    const saved = snapshot(), before = JSON.stringify(saved), host = documentDouble().createElement('main');
    expect(saved.status).toBe('recorded');
    ui.render(host, saved, { compact: true });
    expect(visibleText(host)).toContain('Mediana grupy ≈2,96 ng/mL');
    expect(visibleText(host)).toContain('Grupa 15–18,9 lat');
    expect(visibleText(host)).not.toContain('Jopling');
    const details = byClass(host, 'vilda-hormone-reference-details')[0];
    expect(details.getAttribute('open')).toBeNull();
    expect(details.textContent).toContain('15 lat');
    expect(details.textContent).toContain('N=30');
    expect(details.textContent).toContain('Jopling 2018');
    expect(details.textContent).toContain(data.patientPointData.version);
    expect(details.textContent).toContain('0,45 ng/mL');
    expect(children(host).filter(child => ['input', 'button', 'select'].includes(child.tagName))).toHaveLength(0);
    expect(visibleText(host)).not.toMatch(/w normie|powyżej|poniżej|prawidłow/i);
    expect(JSON.stringify(saved)).toBe(before);
  });

  it('uses saved physical concentrations and distinguishes an infant median from a group median', () => {
    const host = documentDouble().createElement('main');
    ui.render(host, snapshot({}, 'pmol/L'));
    expect(visibleText(host)).toContain('Mediana grupy ≈21,14 pmol/L');
    ui.render(host, snapshot({ ageYears: .25, ageLabel: '3 miesiące' }, 'pmol/L'));
    expect(visibleText(host)).toContain('Mediana ≈17 pmol/L');
    expect(visibleText(host)).not.toContain('Mediana grupy');
    expect(byClass(host, 'vilda-hormone-reference')).toHaveLength(1);
  });

  it('isolates source disclosure clicks from row navigation without cancelling native summary or link actions', () => {
    const host = documentDouble().createElement('main'), navigate = vi.fn();
    host.addEventListener('click', navigate);
    ui.render(host, snapshot());
    const details = byClass(host, 'vilda-hormone-reference-details')[0];
    const targets = [details.children[0], byClass(host, 'vilda-hormone-reference-source')[0]];
    for (const target of targets) {
      let stopped = false;
      const event = { target, stopPropagation() { stopped = true; }, preventDefault: vi.fn() };
      for (let current = target; current; current = current.parentNode) {
        for (const listener of current.listeners.click || []) listener(event);
        if (stopped) break;
      }
      expect(stopped).toBe(true);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(navigate).not.toHaveBeenCalled();
    expect(targets[1].getAttribute('href')).toBe(snapshot().reference.url);
  });

  it('does not call current tables, context, converter, clock, or engines when reopening a historical reference', () => {
    const host = documentDouble().createElement('main'), saved = snapshot();
    const win = { VildaHormoneReferenceSnapshot: snapshots };
    for (const name of ['VildaHormoneLifespanData', 'VildaHormoneLifespanReference', 'LabUnitConverter', 'VildaLabPuberty', 'localStorage']) {
      Object.defineProperty(win, name, { get() { throw new Error(`Forbidden historical read: ${name}`); } });
    }
    loadBrowserScript('vilda_hormone_reference_ui.js', win);
    win.VildaHormoneReferenceUI.render(host, saved);
    expect(visibleText(host)).toContain('2,96 ng/mL');
  });

  it('hides an invalidated number in historical details, keeping the old payload intact', () => {
    const saved = { ...snapshot(), status: 'invalidated', reasonCodes: ['result_or_clinical_date_changed'] };
    const before = JSON.stringify(saved), host = documentDouble().createElement('main');
    ui.render(host, saved);
    expect(byClass(host, 'vilda-hormone-reference')[0].getAttribute('data-reference-status')).toBe('invalidated');
    expect(visibleText(host)).toContain('Odniesienie z wcześniejszego zapisu');
    expect(visibleText(host)).not.toMatch(/2,96|Mediana/);
    expect(host.textContent).toContain('Dawne odniesienie: Mediana grupy ≈2,96 ng/mL');
    expect(JSON.stringify(saved)).toBe(before);
  });

  it.each([
    [{ ageYears: 75 }, 'Brak odniesienia dla zapisanego wieku.'],
    [{ ageYears: 14, ageUpperYears: 16 }, 'Podany wiek obejmuje różne grupy odniesienia.'],
    [{ assayMethodId: 'known-other-assay' }, 'Metoda próbki nie odpowiada źródłu odniesienia.'],
  ])('preserves an unavailable reason without an invented number: %j', (context, expected) => {
    const host = documentDouble().createElement('main');
    ui.render(host, snapshot(context));
    expect(visibleText(host)).toContain(expected);
    expect(byClass(host, 'vilda-hormone-reference-value')).toHaveLength(0);
  });

  it.each([
    source => { source.reference.url = 'javascript:alert(1)'; },
    source => { source.reference.sourceLabel = '<img src=x onerror=alert(1)>'; },
    source => { source.display.referenceValue = 999; },
    source => { source.schemaVersion = 999; },
  ])('rejects malformed saved data rather than rendering executable content or fabricated numbers', mutate => {
    const source = snapshot(), host = documentDouble().createElement('main');
    mutate(source); ui.render(host, source);
    expect(visibleText(host)).toContain('Zapisane odniesienie jest niedostępne.');
    expect(children(host).filter(child => child.tagName === 'a')).toHaveLength(0);
    expect(byClass(host, 'vilda-hormone-reference-value')).toHaveLength(0);
  });
});

for (const name of ['history', 'schedule']) describe(`Saved AMH reference hooks: ${name}`, () => {
  it('does not manufacture a reference for an old result without the optional field', () => {
    const { document, [name]: api } = hooks(), host = document.createElement('main');
    expect(api.saved(host, { test: 'AMH', value: '0,45 ng/mL' })).toBeNull();
    expect(host.children).toEqual([]);
  });

  it('renders the actual saved payload and shows missing-renderer readback explicitly', () => {
    const { document, win, [name]: api } = hooks(), host = document.createElement('main');
    api.saved(host, lab());
    expect(visibleText(host)).toContain('2,96 ng/mL');
    delete win.VildaHormoneReferenceUI;
    const fallback = api.saved(host, lab());
    expect(fallback.getAttribute('data-reference-status')).toBe('unavailable');
    expect(fallback.textContent).toBe('Zapisane odniesienie jest niedostępne.');
  });

  it('invalidates a result-edit preview and restores it on revert without mutating the saved reference', () => {
    const { document, [name]: api } = hooks(), source = lab(), before = JSON.stringify(source);
    const host = api.saved(document.createElement('main'), source), field = document.createElement('input');
    field.value = '0,45'; api.watch(host, source, [field]);
    field.value = '1'; field.dispatch('input');
    expect(byClass(host, 'vilda-hormone-reference')[0].getAttribute('data-reference-status')).toBe('invalidated');
    expect(visibleText(host)).not.toContain('2,96');
    field.value = '0,45'; field.dispatch('change');
    expect(visibleText(host)).toContain('2,96 ng/mL');
    expect(JSON.stringify(source)).toBe(before);
  });
});

describe('AMH history integration keeps numeric trends and edit persistence independent', () => {
  it('projects the reference without using its availability as the numeric trend gate', () => {
    const { series } = hooks();
    const refs = [snapshot(), snapshots.unavailable('unsupported-age'), { ...snapshot(), status: 'invalidated', reasonCodes: ['changed'] }];
    const points = refs.map((hormoneReference, index) => ({ noteId: `fictional-${index}`, dateISO: '2026-10-14', ageMonths: 180,
      valueNum: index, unit: 'ng/mL', norm: '1–10 ng/mL', hormoneReference }));
    const result = series({ testKey: 'amh', points });
    expect(result.skipped).toBe(0);
    expect(result.points.map(point => point.v)).toEqual([0, 1, 2]);
    expect(result.points.map(point => point.hormoneReference)).toEqual(refs);
    expect(result.points.every(point => point.norm === '1–10 ng/mL' && !('assessment' in point))).toBe(true);
  });

  it('preserves the saved reference for a norm-only edit without changing laboratory-only legacy behavior', () => {
    const { history } = hooks(), original = lab(), state = ['AMH', '0,45', 'ng/mL', ''];
    const replacement = { test: 'AMH', value: '0,45 ng/mL', valueNum: .45, unit: 'ng/mL', norm: '1–10 ng/mL' };
    const saved = history.preserve(original, replacement, state, [...state.slice(0, 3), '1–10 ng/mL'], true);
    expect(saved).toEqual({ ...original, norm: '1–10 ng/mL' });
    expect(original).not.toHaveProperty('norm');
    const legacy = { test: 'AMH', value: '0,45 ng/mL' };
    expect(history.preserve(legacy, replacement, state, [...state.slice(0, 3), '1–10 ng/mL'], true)).toBe(replacement);
  });

  it('invalidates only an active clinical date, not the independent visit-age anchor or an inactive date field', () => {
    const { document, history } = hooks(), source = lab(), host = history.saved(document.createElement('main'), source);
    const date = document.createElement('input'), toggle = document.createElement('input');
    let visitSelected = true, dateSelected = false;
    const read = () => history.contextState(['AMH', '0,45', 'ng/mL'], 'lab', visitSelected, dateSelected, date.value);
    history.watch(host, source, [date, toggle], read);
    date.value = '2026-10-01'; date.dispatch('input');
    expect(visibleText(host)).toContain('2,96 ng/mL');
    visitSelected = false; toggle.dispatch('change');
    expect(visibleText(host)).toContain('2,96 ng/mL');
    dateSelected = true; toggle.dispatch('change');
    expect(visibleText(host)).not.toContain('2,96 ng/mL');
  });

  it('the real calendar serializer retains metadata on a norm-only edit and changes actual results normally', () => {
    const { document } = hooks(), original = lab(), de = document.createElement('select');
    const Ua = document.createElement('input'), Va = document.createElement('input'), Za = document.createElement('input');
    de.value = 'lab'; Ua.value = 'AMH'; Va.value = '0,45'; Za.value = '1–10 ng/mL';
    const serialize = new Function('o', 'Ra', 'de', 'Ua', 'Va', 'Za', `${between(calendar, 'function un(){var f={body:', 'function fn(){')};return un;`)(
      { labResult: original }, { value: 'Fikcyjny komentarz' }, de, Ua, Va, Za);
    expect(serialize().labResult).toEqual({ ...original, norm: '1–10 ng/mL' });
    Va.value = '1';
    expect(serialize().labResult).toEqual({ test: 'AMH', value: '1', norm: '1–10 ng/mL' });
  });

  it.each([
    ['0,45', 'ng/mL', '0,45 ng/mL'],
    ['0,45 ng/mL', 'ng/mL', '0,45 ng/mL'],
    ['<0,02', 'ng/mL', '<0,02 ng/mL'],
    ['3,21', 'pmol/L', '3,21 pmol/L'],
  ])('formats stored AMH value %s with its source unit in the actual title and timeline row', (value, unit, expected) => {
    const { document, win } = hooks();
    win.VildaLabAssessmentUI = { renderAssessment: vi.fn(), formatResult: resultFormatter };
    const e = (tag, attributes = {}, childNodes = []) => {
      const el = document.createElement(tag);
      for (const [key, value] of Object.entries(attributes || {})) {
        if (key === 'text') el.textContent = value;
        else if (key !== 'style') el.setAttribute(key, value);
      }
      for (const child of childNodes) el.appendChild(child);
      return el;
    };
    const source = [between(auth, 'function Lh3HasAssessment(', 'async function Xo('), between(auth, 'function $r(', 'var Ta=')].join('\n');
    const runtime = new Function('i', 'e', `const Xr=()=>false,Pn=()=>false;${source};return {timeline:$r,title:Jo};`)(win, e);
    const saved = { ...lab(), value, unit }, row = runtime.timeline({ type: 'note', labResult: saved });
    expect(visibleText(row)).toContain('2,96 ng/mL');
    expect(visibleText(row)).toContain('AMH: ' + expected);
    expect(visibleText(row)).not.toMatch(/ng\/mL ng\/mL|pmol\/L pmol\/L/);
    expect(runtime.title({ labResult: saved })).toBe('AMH: ' + expected);
    expect(win.VildaLabAssessmentUI.renderAssessment).not.toHaveBeenCalled();
    expect(saved).not.toHaveProperty('assessment');
  });
});
