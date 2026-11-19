import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse } from 'espree';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const auth = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const home = readFileSync(new URL('../../vilda_home_patient_native.js', import.meta.url), 'utf8');
const ast = parse(auth, { ecmaVersion: 'latest' });
const homeAst = parse(home, { ecmaVersion: 'latest' });
const PID = 'fictional-diary-progress-A';
const OTHER = 'fictional-diary-progress-B';

function find(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => find(child, predicate, found));
    else if (value && typeof value === 'object') find(value, predicate, found);
  }
  return found;
}
function one(tree, predicate, label) {
  const found = find(tree, predicate);
  if (found.length !== 1) throw Error('Ambiguous production ' + label + ': ' + found.length);
  return found[0];
}
function declaration(tree, source, name) {
  const node = one(tree, node => node.type === 'FunctionDeclaration' && node.id?.name === name, name);
  return source.slice(node.start, node.end);
}
const program = ['Ob_dz', 'Ob_dzPunkty', 'Ob_dzPostepy', 'Ob_dzPowiadom'].map(name => declaration(ast, auth, name)).join('\n');
const homeCurrent = ['loadedSequence', 'current'].map(name => declaration(homeAst, home, name)).join('\n');
const card = one(ast, node => node.type === 'FunctionDeclaration' && node.id?.name === 'se', 'native patient card');
const diaryCall = one(card, node => node.type === 'CallExpression' && node.callee?.name === 'Ob_dz', 'card diary invocation');
const progressCall = one(card, node => node.type === 'CallExpression' && node.callee?.name === 'Ob_dzPostepy', 'card progress registration');
const sourcePredicate = auth.slice(diaryCall.arguments[7].start, diaryCall.arguments[7].end);
const recipientPredicate = auth.slice(progressCall.arguments[4].start, progressCall.arguments[4].end);
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function flush() { for (let index = 0; index < 8; index++) await Promise.resolve(); }

// These nodes expose native replacement/removal effects only. Clinical points,
// journal versions and conflict projection come from the actual journal module.
function node(tag = 'div', attrs = {}, children = []) {
  const result = { tag, className: attrs.class || '', textContent: attrs.text || '', children: [], parentNode: null, isConnected: true,
    get firstChild() { return this.children[0] || null; },
    appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); child.parentNode = this; this.children.push(child); return child; },
    removeChild(child) { const at = this.children.indexOf(child); if (at < 0) throw Error('Missing native child'); this.children.splice(at, 1); child.parentNode = null; return child; },
    replaceChild(next, previous) { const at = this.children.indexOf(previous); if (at < 0) throw Error('Missing native replacement'); previous.parentNode = null; next.parentNode = this; this.children[at] = next; },
    querySelector(selector) { if (selector !== ':scope > .vilda-patient-empty-msg') throw Error('Unexpected selector ' + selector); return this.children.find(child => child.className === 'vilda-patient-empty-msg') || null; },
  };
  children.forEach(child => result.appendChild(child)); return result;
}

function journalFixture() {
  const win = loadBrowserScript('vilda_cykle_leczenia.js', { crypto: globalThis.crypto });
  const D = win.VildaDziennikOtylosci;
  const drug = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP‑1)' };
  const snapshots = [
    { id: 'fictional-start', type: 'start', dateISO: '2026-06-01', ageYears: 47, ageMonths: 4, weight: 112, height: 170, dose: '0,6 mg / dobę', ...drug },
    { id: 'fictional-continuation', type: 'continue', dateISO: '2026-07-06', ageYears: 47, ageMonths: 5, weight: 108, height: 170, dose: '3,0 mg / dobę', ...drug },
  ];
  const data = { type: 'continue', dateISO: '2026-11-10', ageYears: 47, ageMonths: 9, weight: 99.1,
    weightSource: 'pacjent', height: null, dose: '3,0 mg / dobę', ...drug };
  const options = id => ({ id, teraz: new Date('2026-11-19T12:00:00Z'), urzadzenie: 'Fikcyjny test Postępów' });
  const encode = plan => {
    if (!plan.ok) throw Error('Invalid native fictional journal plan');
    return plan.wersje.map(version => D.zakoduj(PID, version));
  };
  const plan = D.planNowego(D.zloz([], snapshots), PID, data, options('fictional-entry'));
  const notes = encode(plan), base = D.zloz(notes, snapshots);
  const conflicted = notes.concat(encode(D.planPoprawki(base, PID, plan.entryId, { ...data, weight: 98.6 }, options('fictional-phone'))),
    encode(D.planPoprawki(base, PID, plan.entryId, { ...data, weight: 99.4 }, options('fictional-desktop'))));
  return { win, D, snapshots, notes, conflicted };
}

function environment() {
  const journal = journalFixture(), state = { pro: true, homeOwner: true, nativeOwner: true, loaded: 7 };
  const read = deferred(), vault = { isUnlocked: () => true, assertSyncOperationSession() {}, listPatientNotesForPatient: vi.fn(() => read.promise) };
  const win = journal.win; win.VildaVault = vault; win.VildaProAccess = { hasAccess: () => state.pro };
  win.VildaDataImportExport = { getApplyLoadedDataSequence: () => state.loaded };
  const projections = [], sections = [], errors = vi.fn();
  win.VildaDziennikOtylosci = { ...journal.D, zloz: vi.fn((...args) => { const value = journal.D.zloz(...args); projections.push(value); return value; }) };
  win.VildaDziennikOtylosciUI = { sekcja: vi.fn(options => { sections.push(options); return node('section'); }) };
  const context = vm.createContext({ i: win, w: win, active: null, Ob_dzSluchacze: [], jt: () => win.VildaVault,
    e: node, Cl: vi.fn(points => Object.assign(node(), { points })),
    Ml: vi.fn((points, _sex, _age, value) => Object.assign(node(), { points, value })), jl: vi.fn((_pid, points) => Object.assign(node(), { points })), Ot: errors });
  vm.runInContext(homeCurrent + '\n' + program, context);
  function recipient({ home: isHome = true, patientId = PID, empty = false } = {}) {
    const ct = node(), initial = empty ? null : node('plot');
    ct.appendChild(initial || node('p', { class: 'vilda-patient-empty-msg' }));
    const view = { disposed: false, vault, token: {}, homeOwner: () => state.homeOwner,
      ownerCurrent: () => state.nativeOwner, root: ct, loaded: state.loaded };
    context.active = view;
    const current = () => context.current(view), render = vi.fn(() => node('plot'));
    context.Ob_dzPostepy(patientId, ct, initial, render, isHome ? current : null);
    return { ct, initial, view, current, render };
  }
  function mount(homeContext, notificationIsCurrent) {
    return context.Ob_dz(PID, { name: 'Fikcyjny dorosły A', obesityTherapyPoints: journal.snapshots }, 'M', 574,
      journal.notes, { dobISO: '1979-01-12' }, homeContext, notificationIsCurrent);
  }
  return { ...journal, state, win, vault, read, context, projections, sections, errors, recipient, mount };
}

describe('native journal refresh and optional Home progress ownership', () => {
  it('delivers the exact fresh native projection and conflict metadata without changing the note DTOs', async () => {
    const e = environment(), target = e.recipient(), isCurrent = () => target.current();
    const box = e.mount({ isCurrent }, isCurrent), before = JSON.stringify(e.conflicted);
    e.sections[0].onZmiana(); expect(e.vault.listPatientNotesForPatient).toHaveBeenCalledExactlyOnceWith(PID);
    e.read.resolve(e.conflicted); await flush();
    const fresh = e.projections.at(-1);
    expect(fresh).toEqual(e.D.zloz(e.conflicted, e.snapshots)); expect(fresh.konflikty).toHaveLength(1);
    expect(fresh.punkty.some(point => point.dziennik?.konflikt)).toBe(true);
    expect(target.render).toHaveBeenCalledExactlyOnceWith(fresh.punkty);
    expect(e.sections.at(-1).stan).toBe(fresh); expect(e.context.Ml.mock.calls.at(-1)[3]).toBe(fresh);
    expect(box.children[0].points).toBe(fresh.punkty); expect(target.ct.children).toEqual([target.render.mock.results[0].value]);
    expect(JSON.stringify(e.conflicted)).toBe(before); expect(e.errors).not.toHaveBeenCalled();
  });

  it.each(['account', 'PRO', 'patient', 'load', 'visit'])('does not redraw or notify Home after %s invalidates a pending actual native note read', async boundary => {
    const e = environment(), target = e.recipient(), current = () => target.current();
    const box = e.mount({ isCurrent: current }, current), children = [...box.children];
    e.sections[0].onZmiana();
    if (boundary === 'account') e.win.VildaVault = { ...e.vault };
    if (boundary === 'PRO') e.state.pro = false;
    if (boundary === 'patient') e.state.homeOwner = false;
    if (boundary === 'load') e.state.loaded++;
    if (boundary === 'visit') e.state.nativeOwner = false;
    expect(current()).toBe(false); e.read.resolve(e.conflicted); await flush();
    expect(e.projections).toHaveLength(1); expect(e.sections).toHaveLength(1); expect(box.children).toEqual(children);
    expect(target.render).not.toHaveBeenCalled(); expect(e.errors).not.toHaveBeenCalled();
  });

  it.each(['account', 'PRO', 'patient', 'load', 'visit'])('prunes an already connected Home progress recipient after %s expires it', boundary => {
    const e = environment(), target = e.recipient();
    if (boundary === 'account') e.win.VildaVault = { ...e.vault };
    if (boundary === 'PRO') e.state.pro = false;
    if (boundary === 'patient') e.state.homeOwner = false;
    if (boundary === 'load') e.state.loaded++;
    if (boundary === 'visit') e.state.nativeOwner = false;
    e.context.Ob_dzPowiadom(PID, e.D.zloz(e.conflicted, e.snapshots), () => true);
    expect(target.render).not.toHaveBeenCalled(); expect(e.context.Ob_dzSluchacze).toHaveLength(0);
    expect(target.ct.children).toEqual([target.initial]);
  });

  it.each([undefined, null, true, () => false, () => 1, () => { throw Error('Fictional obsolete source'); }])('requires an explicit current source for Home while preserving legacy notifications (%s)', source => {
    const e = environment(), legacy = e.recipient({ home: false }), target = e.recipient();
    const fresh = e.D.zloz(e.conflicted, e.snapshots);
    e.context.Ob_dzPowiadom(PID, fresh, source);
    expect(target.render).not.toHaveBeenCalled(); expect(target.ct.children).toEqual([target.initial]);
    expect(legacy.render).toHaveBeenCalledExactlyOnceWith(fresh.punkty); expect(e.errors).not.toHaveBeenCalled();
  });

  it('retains default legacy refreshes and the exact native point-only reader', async () => {
    const e = environment(), legacy = e.recipient({ home: false }); e.mount(null, undefined);
    e.sections[0].onZmiana(); e.read.resolve(e.conflicted); await flush();
    expect(legacy.render).toHaveBeenCalledExactlyOnceWith(e.projections.at(-1).punkty);
    const points = e.context.Ob_dzPunkty({ obesityTherapyPoints: e.snapshots }, e.conflicted);
    expect(points).toEqual(e.D.zloz(e.conflicted, e.snapshots).punkty);
    expect(e.errors).not.toHaveBeenCalled();
  });

  it('keeps a fresh Home recipient unchanged when an obsolete native card finishes reading the same patient', async () => {
    const e = environment(), target = e.recipient(), originalOwner = {}, sourceState = { owner: originalOwner };
    const originalRoot = { isConnected: true };
    Object.assign(e.context, { CareReadOwner: originalOwner, Eo: originalRoot, HomePatientRequested: false,
      remReadCurrent: owner => owner === sourceState.owner, HomePatientIsCurrent: () => true });
    const sourceCurrent = vm.runInContext('(' + sourcePredicate + ')', e.context);
    const legacyBox = e.mount(null, sourceCurrent); e.sections[0].onZmiana();
    sourceState.owner = {}; originalRoot.isConnected = false;
    expect(target.current()).toBe(true); expect(sourceCurrent()).toBe(false);
    e.read.resolve(e.conflicted); await flush();
    expect(e.projections).toHaveLength(2); expect(legacyBox.children[0].points).toBe(e.projections.at(-1).punkty);
    expect(target.render).not.toHaveBeenCalled(); expect(target.ct.children).toEqual([target.initial]);
    expect(e.errors).not.toHaveBeenCalled();
  });

  it('prunes disconnected recipients and does not send another patient\'s points', () => {
    const e = environment(), target = e.recipient(); target.ct.isConnected = false;
    e.context.Ob_dzPowiadom(PID, { punkty: [] }, () => true);
    expect(e.context.Ob_dzSluchacze).toHaveLength(0); expect(target.render).not.toHaveBeenCalled();
    const other = e.recipient({ patientId: OTHER });
    e.context.Ob_dzPowiadom(PID, { punkty: [] }, () => true);
    expect(other.render).not.toHaveBeenCalled();
  });

  it('keeps native empty-panel replacement and removal without changing the supplied projected points', () => {
    const e = environment(), target = e.recipient({ empty: true }), fresh = e.D.zloz(e.conflicted, e.snapshots);
    e.context.Ob_dzPowiadom(PID, fresh, () => true);
    expect(target.render).toHaveBeenCalledExactlyOnceWith(fresh.punkty);
    expect(target.ct.children).toEqual([target.render.mock.results[0].value]);
    target.render.mockReturnValueOnce(null); e.context.Ob_dzPowiadom(PID, fresh, () => true);
    expect(target.ct.children).toHaveLength(1); expect(target.ct.children[0].className).toBe('vilda-patient-empty-msg');
  });
});

describe('native card passes the original read owner to journal notification and full Home predicate to progress', () => {
  it('captures the original CareReadOwner/Eo closure instead of recapturing a source owner at completion', () => {
    const owner = {}, Eo = { isConnected: true }, state = { active: owner, home: true };
    const remReadCurrent = vi.fn(value => value === state.active);
    const homeCurrent = () => state.home;
    const context = vm.createContext({ CareReadOwner: owner, Eo, remReadCurrent, HomePatientRequested: true, HomePatientIsCurrent: homeCurrent });
    const current = vm.runInContext('(' + sourcePredicate + ')', context);
    expect(current()).toBe(true); state.active = {}; expect(current()).toBe(false);
    state.active = owner; Eo.isConnected = false; expect(current()).toBe(false);
    Eo.isConnected = true; state.home = false; expect(current()).toBe(false);
    context.HomePatientRequested = false; expect(current()).toBe(true);
    expect(remReadCurrent.mock.calls.every(([value]) => value === owner)).toBe(true);
    context.HomePatientRequested = true; expect(vm.runInContext('(' + recipientPredicate + ')', context)).toBe(homeCurrent);
    context.HomePatientRequested = false; expect(vm.runInContext('(' + recipientPredicate + ')', context)).toBeNull();
  });
});
