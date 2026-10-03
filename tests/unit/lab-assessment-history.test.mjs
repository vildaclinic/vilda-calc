import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const auth = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const calendar = readFileSync(new URL('../../vilda_terminarz.js', import.meta.url), 'utf8');
const between = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  if (a < 0 || b < a) throw new Error(`Missing production functions: ${start} / ${end}`);
  return source.slice(a, b);
};

// Small DOM for the real rendering hooks. The clinical renderer is a spy here:
// its own suite verifies clinical copy and HTML; this suite verifies the callers
// pass the saved assessment, and never evaluate against current patient data.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.style = { setProperty() {} };
    this.classList = {
      add: (name) => { this.className = [...new Set(String(this.className || '').split(' ').filter(Boolean).concat(name))].join(' '); },
      remove: (name) => { this.className = String(this.className || '').split(' ').filter((value) => value !== name).join(' '); },
    };
    this.value = '';
    this.checked = false;
    this._text = '';
    this.ownerDocument = elementDocument;
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.children = this.children.filter((node) => node !== child); }
  get firstChild() { return this.children[0] || null; }
  set textContent(value) { this._text = String(value ?? ''); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(' '); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'class') this.className = value; }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  dispatch(name) { for (const fn of this.listeners[name] || []) fn({ target: this }); }
  querySelector(selector) {
    const [tag, className] = selector.split('.');
    return walk(this).find((node) => (!tag || node.tagName === tag)
      && (!className || String(node.className || '').split(' ').includes(className))) || null;
  }
}
const elementDocument = { createElement: (tag) => new Element(tag) };
const walk = (element) => element.children.flatMap((child) => [child, ...walk(child)]);
function element(tag, attributes = {}, children = []) {
  const node = new Element(tag);
  for (const [key, value] of Object.entries(attributes || {})) {
    if (key === 'text') node.textContent = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.appendChild(child);
  return node;
}
const byClass = (node, name) => walk(node).filter((child) => String(child.className || '').split(' ').includes(name));

function setup() {
  const win = {
    document: {
      createElement: (tag) => new Element(tag),
      createElementNS: (_, tag) => new Element(tag),
      getElementById: () => null,
      head: new Element('head'),
    },
    sessionStorage: { getItem: () => null, setItem() {} },
  };
  for (const file of ['vilda_lab_puberty_data.js', 'vilda_lab_puberty.js', 'vilda_lab_snapshot.js']) loadBrowserScript(file, win);
  const snapshot = (value = '2', overrides = {}) => win.VildaLabSnapshot.create(win.VildaLabPuberty.evaluate({
    analyte: 'lh', value, unit: 'IU/L', sex: 'M',
    birthDateISO: '2020-06-17', sampleDateISO: '2026-06-17', specimen: 'serum', measurementKind: 'basal',
    assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' },
    puberty: { kind: 'G', stage: 4, assessedAtISO: '2026-06-17' },
    treatment: { gnrha: 'no', sexSteroids: 'no' }, ...overrides,
  }, win.VildaLabPubertyData));
  win.VildaLabAssessmentUI = {
    formatResult: vi.fn((lab) => `${lab.value ?? lab.assessment?.evaluation?.measurement.raw ?? ''} ${lab.unit ?? ''}`.trim()),
    renderAssessment: vi.fn((host, assessment) => { host.textContent = `saved:${assessment?.status || 'unavailable'}`; }),
  };
  const vault = {
    getPatient: vi.fn(async () => ({ snapshots: [{ payload: { user: { sex: 'F', age: 17 } } }] })),
    listPatientNotesForPatient: vi.fn(async () => []),
    listPatientLabSeries: vi.fn(async () => []),
  };
  const source = [
    between(auth, 'function Lh3HasAssessment(', 'async function Xo('),
    between(auth, 'async function Xo(', '// Rata D (P6)'),
    between(auth, 'function $r(', 'var Ta='),
    between(auth, 'function Dl(', 'function gi('),
    between(auth, 'async function Jl(', 'async function Xl('),
  ].join('\n');
  const hooks = new Function('i', 'e', 'jt', 'oe', `
    const Me={observation:{label:'Notatka'},'wynik-badania':{label:'Badanie'}};
    const gn=()=>null, na=String, Ot=()=>{}, ga=()=>{}, Xr=()=>false, Pn=()=>false, ja=()=>{}, Ta='#5856D6';
    ${source}
    return { title:Jo, noteList:Xo, timeline:$r, trend:Jl, saved:Lh3SavedAssessment, watch:Lh3WatchAssessment,
      trendList:Lh3TrendAssessments, series:Lh3HasSeriesAssessment, editState:Lh3LabEditState, contextState:Lh3EditorContextState, preserve:Lh3PreserveLabAfterEdit };
  `)(win, element, () => vault, (node) => { node.textContent = ''; });
  const calendarHooks = new Function('w', 'g', `${between(calendar, 'function TzLh3SavedAssessment(', 'function He(')}
    return {saved:TzLh3SavedAssessment,watch:TzLh3WatchAssessment};`)(win, win.document);
  return { win, vault, hooks, calendarHooks, snapshot };
}
const lab = (assessment, value = '2') => ({ test: 'LH', testKey: 'lh', value, unit: 'IU/L', valueNum: 2, assessment });
const point = (assessment, id, valueNum = null) => ({
  noteId: id, dateISO: '2026-06-17', ageMonths: 120, unit: 'IU/L', valueNum, assessment,
});

for (const scope of ['patient card', 'calendar']) {
  describe(`LH/FSH saved assessment hooks — ${scope}`, () => {
    it('keeps legacy entries without an inferred assessment', () => {
      const { win, hooks, calendarHooks } = setup();
      const api = scope === 'calendar' ? calendarHooks : hooks;
      const host = new Element();
      expect(api.saved(host, { test: 'LH', value: '2 IU/L', valueNum: 2 })).toBeNull();
      expect(host.children).toEqual([]);
      expect(win.VildaLabAssessmentUI.renderAssessment).not.toHaveBeenCalled();
    });

    it.each(['recorded', 'invalidated', 'unavailable'])('forwards the saved %s envelope unchanged', (status) => {
      const { win, hooks, calendarHooks, snapshot } = setup();
      const api = scope === 'calendar' ? calendarHooks : hooks;
      const assessment = { ...snapshot(), status };
      const before = JSON.stringify(assessment);
      const host = new Element();
      api.saved(host, lab(assessment));
      expect(win.VildaLabAssessmentUI.renderAssessment).toHaveBeenCalledWith(host.children[0], assessment, { compact: true });
      expect(JSON.stringify(assessment)).toBe(before);
    });

    it('shows an unavailable state when the shared renderer cannot load', () => {
      const { win, hooks, calendarHooks, snapshot } = setup();
      const api = scope === 'calendar' ? calendarHooks : hooks;
      delete win.VildaLabAssessmentUI;
      const host = new Element();
      api.saved(host, lab(snapshot()));
      expect(host.children[0].getAttribute('data-assessment-status')).toBe('unavailable');
      expect(host.textContent).toContain('Zapisana ocena jest niedostępna');
    });

    it('invalidates only the editor preview, restoring it after reverting the edit', () => {
      const { hooks, calendarHooks, snapshot } = setup();
      const api = scope === 'calendar' ? calendarHooks : hooks;
      const assessment = snapshot();
      const source = lab(assessment);
      const before = JSON.stringify(source);
      const container = new Element(), field = new Element('input');
      field.value = '2';
      const host = api.saved(container, source);
      api.watch(host, source, [field]);
      field.value = '3'; field.dispatch('input');
      expect(host.textContent).toBe('saved:invalidated');
      expect(JSON.stringify(source)).toBe(before);
      field.value = '2'; field.dispatch('change');
      expect(host.textContent).toBe('saved:recorded');
      expect(JSON.stringify(source)).toBe(before);
    });
  });
}

// Execute the production full-editor lab serializer, including its original
// initial-state capture and input/change handlers. This catches differences
// between a restored preview and the fields actually sent to the vault.
function fullEditorSerializer(hooks, original) {
  const fields = {};
  for (const name of ['ht', 'P', 'L', 'A', 'St']) fields[name] = new Element('input');
  Object.assign(fields.ht, { value: original.test || '' });
  Object.assign(fields.P, { value: original.value || '' });
  Object.assign(fields.L, { value: original.unit || '' });
  Object.assign(fields.A, { value: original.unit || '' });
  fields.A.style.display = '';
  Object.assign(fields.St, { value: original.norm || '' });
  const initialization = between(auth, 'function Lh3EditorLabState(){', 'try{if(r.medication');
  const branch = between(auth, 'else if(ae==="lab"){var ue={}', 'else Vt.medication=null,Vt.labResult=null;').slice(5);
  const runtime = new Function('r', 'fields', 'Lh3LabEditState', 'Lh3PreserveLabAfterEdit', `
    var {ht,P,L,A,St}=fields, st='__other__';
    const ft=()=>({id:'lh'});
    ${between(auth, 'function rt(){', 'function vt(){')}
    ${initialization}
    return {read:Lh3EditorLabState,save:function(){var Vt={},ae='lab';${branch};return Vt.labResult}};
  `)({ labResult: original }, fields, hooks.editState, hooks.preserve);
  return { fields, ...runtime };
}

describe('LH/FSH editor edit-and-revert serialization', () => {
  it.each(['P', 'ht', 'St'])('restores the original full-editor result after reverting %s', (fieldName) => {
    const { win, hooks, snapshot } = setup();
    const date = '2026-06-17';
    const original = win.VildaLabSnapshot.reconcile(null, lab(snapshot()), null, date);
    const editor = fullEditorSerializer(hooks, original);
    const field = editor.fields[fieldName], oldValue = field.value;
    const host = hooks.saved(new Element(), original);
    hooks.watch(host, original, Object.values(editor.fields), editor.read);
    field.value = '3'; field.dispatch('input');
    expect(host.textContent).toBe('saved:invalidated');
    field.value = oldValue; field.dispatch('change');
    const saved = editor.save();
    expect(host.textContent).toBe('saved:recorded');
    expect(saved).toBe(original);
    expect(saved.value).toBe('2');
    expect(win.VildaLabSnapshot.reconcile(original, saved, date, date).assessment.status).toBe('recorded');
    // Reverting a laboratory field must not erase a real sample-date change.
    expect(win.VildaLabSnapshot.reconcile(original, saved, date, '2026-06-18').assessment.status).toBe('invalidated');
  });

  it('compares the effective selected unit, ignoring a stale hidden custom-unit input', () => {
    const { hooks, snapshot } = setup();
    const original = lab(snapshot()), editor = fullEditorSerializer(hooks, original);
    const host = hooks.saved(new Element(), original);
    hooks.watch(host, original, Object.values(editor.fields), editor.read);
    editor.fields.A.value = '__other__'; editor.fields.L.value = 'custom'; editor.fields.A.dispatch('change');
    expect(host.textContent).toBe('saved:invalidated');
    editor.fields.A.value = 'IU/L'; editor.fields.A.dispatch('change');
    expect(host.textContent).toBe('saved:recorded');
    expect(editor.save()).toBe(original);
  });

  it('keeps a real result change invalidated in both preview and serialized persistence', () => {
    const { win, hooks, snapshot } = setup();
    const date = '2026-06-17';
    const original = win.VildaLabSnapshot.reconcile(null, lab(snapshot()), null, date);
    const editor = fullEditorSerializer(hooks, original);
    const host = hooks.saved(new Element(), original);
    hooks.watch(host, original, Object.values(editor.fields), editor.read);
    editor.fields.P.value = '3'; editor.fields.P.dispatch('input');
    expect(host.textContent).toBe('saved:invalidated');
    const saved = editor.save();
    expect(saved).not.toBe(original);
    expect(saved.valueNum).toBe(3);
    expect(win.VildaLabSnapshot.reconcile(original, saved, date, date).assessment.status).toBe('invalidated');
  });

  it('keeps manual-age assessment valid when only the visit anchor or inactive date changes', () => {
    const { win, hooks, snapshot } = setup();
    const original = win.VildaLabSnapshot.reconcile(null, lab(snapshot('2', {
      birthDateISO: null, sampleDateISO: null, age: { years: 6, precision: 'year' },
      puberty: { kind: 'G', stage: 4, appliesToSample: true },
    })), null, null);
    expect(original.assessment.status).toBe('recorded');
    const visit = new Element('input'), date = new Element('input'), value = new Element('input');
    visit.checked = true;
    const labState = hooks.editState('LH', '2', 'IU/L', '');
    const read = () => hooks.contextState(labState, 'lab', visit.checked, date.checked, value.value);
    const serializeDate = new Function('Dt', 'Xt', 'ce', `var Vt={},Et=72;
      ${between(auth, 'var Ht="general";', 'var Qt=!!(r.medication')};return Vt.clinicalDateISO;`);
    const host = hooks.saved(new Element(), original);
    hooks.watch(host, original, [visit, date, value], read);
    visit.checked = false; visit.dispatch('change'); // visit -> general
    expect(host.textContent).toBe('saved:recorded');
    expect(read().at(-1)).toBe(serializeDate(visit, date, value));
    value.value = '2026-06-18'; value.dispatch('input'); // still inactive
    expect(host.textContent).toBe('saved:recorded');
    expect(serializeDate(visit, date, value)).toBeNull();
    expect(win.VildaLabSnapshot.reconcile(original, original, null, serializeDate(visit, date, value)).assessment.status).toBe('recorded');
    date.checked = true; date.dispatch('change');
    expect(host.textContent).toBe('saved:invalidated');
    expect(read().at(-1)).toBe(serializeDate(visit, date, value));
    expect(win.VildaLabSnapshot.reconcile(original, original, null, serializeDate(visit, date, value)).assessment.status).toBe('invalidated');
  });

  it('invalidates a known sample date when the editor switches to a visit anchor', () => {
    const { win, hooks, snapshot } = setup();
    const original = win.VildaLabSnapshot.reconcile(null, lab(snapshot()), null, '2026-06-17');
    const visit = new Element('input'), date = new Element('input'), value = new Element('input');
    date.checked = true; value.value = '2026-06-17';
    const host = hooks.saved(new Element(), original);
    const read = () => hooks.contextState(hooks.editState('LH', '2', 'IU/L', ''), 'lab', visit.checked, date.checked, value.value);
    hooks.watch(host, original, [visit, date, value], read);
    visit.checked = true; date.checked = false; visit.dispatch('change');
    expect(host.textContent).toBe('saved:invalidated');
    expect(read().at(-1)).toBeNull();
    expect(win.VildaLabSnapshot.reconcile(original, original, '2026-06-17', null).assessment.status).toBe('invalidated');
  });

  it('preserves the original calendar result after edit and revert with its real serializer', () => {
    const { win, calendarHooks, snapshot } = setup();
    const date = '2026-06-17';
    const original = win.VildaLabSnapshot.reconcile(null, lab(snapshot()), null, date);
    const Ra = { value: 'New comment' }, de = new Element('select');
    de.value = 'lab';
    const Ua = new Element('input'), Va = new Element('input'), Za = new Element('input');
    Ua.value = 'LH'; Va.value = '2';
    const save = new Function('o', 'Ra', 'de', 'Ua', 'Va', 'Za', `${between(calendar, 'function un(){var f={body:', 'function fn(){')};return un;`)(
      { labResult: original }, Ra, de, Ua, Va, Za,
    );
    const host = calendarHooks.saved(new Element(), original);
    calendarHooks.watch(host, original, [Ua, Va, Za, de]);
    Va.value = '3'; Va.dispatch('input');
    expect(host.textContent).toBe('saved:invalidated');
    Va.value = '2'; Va.dispatch('input');
    expect(host.textContent).toBe('saved:recorded');
    expect(save().labResult).toBe(original);
    expect(save().body).toBe('New comment');
    expect(win.VildaLabSnapshot.reconcile(original, save().labResult, date, date).assessment.status).toBe('recorded');
  });
});

describe('LH/FSH clinical history and trends', () => {
  it('retains raw operators and units in the real note title and timeline view', () => {
    const { hooks, snapshot } = setup();
    const note = { type: 'note', title: 'Fikcyjne badanie', labResult: lab(snapshot('<0,02'), '<0,02') };
    expect(hooks.title(note)).toBe('LH: <0,02 IU/L');
    const row = hooks.timeline(note);
    expect(row.textContent).toContain('LH: <0,02 IU/L');
    expect(byClass(row, 'vilda-saved-lab-assessment')).toHaveLength(1);
    expect(row.textContent).not.toContain('LH: 2 IU/L');
  });

  it('renders an assessment in the actual pinned-note list, preserving older notes', async () => {
    const { win, vault, hooks, snapshot } = setup();
    const assessment = snapshot();
    vault.listPatientNotesForPatient.mockResolvedValue([
      { id: 'new', title: 'Nowe badanie', category: 'wynik-badania', clinicalDateISO: '2026-06-17', labResult: lab(assessment) },
      { id: 'old', title: 'Stare badanie', category: 'wynik-badania', clinicalDateISO: '2026-06-16', labResult: { test: 'LH', value: '2 IU/L', valueNum: 2, unit: 'IU/L' } },
    ]);
    const host = new Element();
    await hooks.noteList(host, 'fictional-patient');
    expect(byClass(host, 'vilda-patient-note-card')).toHaveLength(2);
    expect(byClass(host, 'vilda-saved-lab-assessment')).toHaveLength(1);
    expect(win.VildaLabAssessmentUI.renderAssessment).toHaveBeenCalledOnce();
    expect(win.VildaLabAssessmentUI.renderAssessment.mock.calls[0][1]).toBe(assessment);
  });

  it('renders a series containing only censored or unreadable assessments without numeric points', async () => {
    const { win, vault, hooks, snapshot } = setup();
    const points = [point(snapshot('<LOD'), 'limit'), point({ schemaVersion: 1, status: 'unavailable', evaluation: null }, 'missing')];
    vault.listPatientLabSeries.mockResolvedValue([{ testKey: 'lh', test: 'LH', points }]);
    win.LabUnitConverter = { evaluate: vi.fn(() => { throw new Error('must not reinterpret'); }) };
    const host = new Element();
    await hooks.trend(host, 'fictional-patient');
    expect(byClass(host, 'vilda-lab-trend-section')).toHaveLength(1);
    expect(byClass(host, 'vilda-lab-assessment-history-row')).toHaveLength(2);
    expect(byClass(host, 'vilda-lab-trend-chart')).toHaveLength(0);
    expect(host.textContent).toContain('<LOD IU/L');
    expect(host.textContent).toContain('saved:unavailable');
    expect(win.LabUnitConverter.evaluate).not.toHaveBeenCalled();
  });

  it('does not expose the old invalidated value as the current series measurement', () => {
    const { hooks, snapshot } = setup();
    const host = new Element(), openNote = vi.fn();
    hooks.trendList(host, { test: 'LH', points: [point({ ...snapshot(), status: 'invalidated' }, 'edited')] }, openNote);
    expect(host.textContent).toContain('saved:invalidated');
    expect(host.textContent).not.toContain('2 IU/L');
    const open = walk(host).find((node) => node.tagName === 'button');
    open.onclick();
    expect(openNote).toHaveBeenCalledWith('edited');
  });

  it('labels the existing visit-age axis explicitly without treating it as the sample age', async () => {
    const { vault, hooks, snapshot } = setup();
    const assessment = snapshot();
    vault.listPatientLabSeries.mockResolvedValue([{ testKey: 'lh', test: 'LH', points: [
      point(assessment, 'one', 2), { ...point(assessment, 'two', 2), ageMonths: 132 },
    ] }]);
    const host = new Element();
    await hooks.trend(host, 'fictional-patient');
    expect(host.textContent).toContain('wiek wizyty (kotwica)');
    expect(assessment.evaluation.ageAtSample.lowerYears).toBe(6);
    expect(byClass(host, 'vilda-lab-trend-chart')).toHaveLength(1);
  });

  it('uses the real clinical renderer in every historical hook without reading current context', () => {
    const { win, hooks, calendarHooks, snapshot } = setup();
    const assessment = snapshot('<LOD');
    const saved = lab(assessment, '<LOD');
    const before = JSON.stringify(saved);
    loadBrowserScript('vilda_lab_assessment_ui.js', win);
    Object.defineProperty(win, 'VildaLabPuberty', { get() { throw new Error('no engine during readback'); } });
    Object.defineProperty(win, 'VildaLabPubertyData', { get() { throw new Error('no current reference during readback'); } });
    for (const api of [hooks, calendarHooks]) {
      const host = new Element();
      api.saved(host, saved);
      expect(byClass(host, 'vilda-lab-assessment')).toHaveLength(1);
      expect(host.textContent).toContain('<LOD IU/L');
      expect(host.textContent).toContain('Cechy dojrzewania zbyt wcześnie — wymagają oceny');
      expect(byClass(host, 'vilda-lab-clinical')[0].getAttribute('data-clinical-code')).toBe('early_development');
    }
    const history = new Element();
    hooks.trendList(history, { test: 'LH', points: [point(assessment, 'saved-limit')] });
    expect(byClass(history, 'vilda-lab-assessment')[0].getAttribute('data-assessment-status')).toBe('recorded');
    expect(JSON.stringify(saved)).toBe(before);
  });

  it('does not create an assessment list for a legacy-only series', () => {
    const { hooks } = setup();
    const host = new Element();
    const serie = { test: 'LH', points: [{ noteId: 'old', valueNum: 2, unit: 'IU/L' }] };
    hooks.trendList(host, serie);
    expect(hooks.series(serie)).toBe(false);
    expect(host.children).toEqual([]);
  });
});
