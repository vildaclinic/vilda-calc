import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Actual production functions execute; the harness supplies only DOM and
// native field/ticket plumbing. Native SK1–5 remain the browser field oracle.
const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const source = fs.readFileSync(path.join(root, 'obesity_therapy_monitor.js'), 'utf8');
const intentsSource = fs.readFileSync(path.join(root, 'vilda_ui_intents.js'), 'utf8');
const { parse } = createRequire(path.join(root, 'package.json'))('espree');
const ast = parse(source, { ecmaVersion: 'latest' });
const PID = 'fictional monitor / żółw';
const ENTRY = 'fictional deleted / Ć';
const DATA = { type: 'end', dateISO: '2026-11-03', ageYears: 13, ageMonths: 6,
  weight: 72.4, height: 163.6, dose: 'fictional dose', drug: 'fictional drug', substance: 'fictional substance' };
const fixtures = [];
function find(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => find(child, predicate, found));
    else if (value && typeof value === 'object') find(value, predicate, found);
  }
  return found;
}
function unique(nodes, label) {
  if (nodes.length !== 1) throw Error('Ambiguous production source: ' + label);
  return nodes[0];
}
const functions = ['SkrouteCurrent', 'Skwidoczny', 'Skotworz', 'Skczekaj',
  'Skpodswietl', 'Skwypelnij', 'SkcaptureClearAction'].map(name => {
  const node = unique(find(ast, value => value.type === 'FunctionDeclaration' && value.id?.name === name), name);
  return source.slice(node.start, node.end);
});
const variables = ['Sk', 'SkclearAction', 'SKTYP'].map(name => {
  const node = unique(find(ast, value => value.type === 'VariableDeclarator' && value.id?.name === name), name);
  return 'var ' + source.slice(node.start, node.end) + ';';
});
const isMonitor = node => node?.type === 'MemberExpression' && node.object?.name === 'window'
  && node.property?.name === 'obesityTherapyMonitorSkok';
const exported = unique(find(ast, node => node.type === 'ExpressionStatement'
  && node.expression?.type === 'AssignmentExpression' && isMonitor(node.expression.left)), 'monitor export');
const marker = unique(find(ast, node => node.type === 'ExpressionStatement'
  && node.expression?.type === 'CallExpression' && node.expression.callee?.object?.name === 'Object'
  && node.expression.callee?.property?.name === 'defineProperty' && isMonitor(node.expression.arguments[0])
  && node.expression.arguments[1]?.value === 'uiIntentLandingVersion'), 'same-function capability');
const code = [...variables, ...functions, source.slice(exported.start, exported.end),
  source.slice(marker.start, marker.end)].join('\n');
async function flush() { for (let index = 0; index < 20; index++) await Promise.resolve(); }

function fixture({ choice = false, journal = true, points = [{ id: ENTRY, weight: 80 }], closed = false } = {}) {
  vi.useFakeTimers();
  const observers = new Set(), scopes = [], storeValues = new Map([['vildaCurrentPatientId', PID]]);
  function mutation(target, type) {
    for (const observer of observers) if (observer.targets.some(entry =>
      type === 'attributes' ? entry.options.attributes && entry.target === target
        : entry.options.childList && (entry.target === target || entry.options.subtree && entry.target.contains(target)))) {
      queueMicrotask(() => { if (observers.has(observer)) observer.callback([{ target, type }]); });
    }
  }
  class Element extends EventTarget {
    constructor(id = '', tagName = 'div') {
      super(); this.id = id; this.tagName = tagName; this.children = []; this.parentNode = null;
      this.value = ''; this.className = ''; this.textContent = ''; this._hidden = false;
      this.classList = { add: vi.fn(), remove: vi.fn(), contains: () => false };
      this.scrollIntoView = vi.fn();
    }
    get isConnected() { return this === html || !!this.parentNode?.isConnected; }
    get offsetParent() { return this.isConnected && !this.hidden ? this.parentNode || this : null; }
    get hidden() { return this._hidden; }
    set hidden(value) { this._hidden = !!value; mutation(this, 'attributes'); }
    appendChild(child) {
      if (child.parentNode) child.remove();
      child.parentNode = this; this.children.push(child); mutation(this, 'childList'); return child;
    }
    remove() {
      const parent = this.parentNode; if (!parent) return;
      parent.children = parent.children.filter(child => child !== this); this.parentNode = null;
      mutation(parent, 'childList');
    }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    all() { return [this, ...this.children.flatMap(child => child.all())]; }
    querySelectorAll(selector) {
      if (selector !== '.obm-msg-actions > button') throw Error('Unexpected selector: ' + selector);
      return this.all().filter(node => node.tagName === 'button' && node.parentNode?.className === 'obm-msg-actions');
    }
    click() { this.dispatchEvent(new Event('click')); }
  }
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.targets = []; }
    observe(target, options) { this.targets.push({ target, options }); observers.add(this); }
    disconnect() { observers.delete(this); this.targets = []; }
  }
  const html = new Element('html'), body = html.appendChild(new Element('body'));
  const document = new EventTarget();
  Object.assign(document, { hidden: false, documentElement: html, body,
    getElementById: id => html.all().find(element => element.id === id) || null,
    querySelector: () => null });
  const fieldIds = ['obesityAge', 'obesityAgeMonths', 'obesityWeight', 'obesityHeight',
    'obesityDose', 'obesityDate'];
  fieldIds.forEach(id => body.appendChild(new Element(id, 'input')));
  const card = body.appendChild(new Element('obesityCard'));
  const section = body.appendChild(new Element('obesityMonitorSection'));
  card.hidden = closed; section.hidden = closed;
  const toggle = body.appendChild(new Element('toggleObesityTherapy', 'button'));
  const tab = body.appendChild(new Element('obesityTabMonBtn', 'button'));
  toggle.addEventListener('click', () => { card.hidden = false; });
  tab.addEventListener('click', () => { section.hidden = false; });
  const messageParent = body.appendChild(new Element('message-parent'));
  let message = messageParent.appendChild(new Element('obesityTherapyActionMsg'));
  message.hidden = true;
  const modal = choice ? body.appendChild(new Element('vildaLoadChoiceModal')) : null;
  const state = { route: true, unlocked: true, account: 'fictional account', generation: 1,
    mode: 'local', ephemeral: false, visit: 'fictional visit', sequence: 1, points };
  const store = { getItem: key => storeValues.get(key) ?? null,
    setItem: vi.fn((key, value) => storeValues.set(key, String(value))),
    removeItem: vi.fn(key => storeValues.delete(key)) };
  const vault = { isUnlocked: () => state.unlocked, getCurrentUser: () => ({ userId: state.account }),
    captureSyncOperationSession: () => ({ generation: state.generation }),
    assertSyncOperationSession: token => { if (token.generation !== state.generation) throw Error('Changed ticket'); },
    getCurrentStorageModeSync: () => state.mode, isEphemeralMode: () => state.ephemeral };
  const win = new EventTarget();
  Object.assign(win, { document, sessionStorage: store, MutationObserver, _vildaCurrentPatientId: PID,
    location: new URL('https://fictional.invalid/docpro.html'), history: { state: { shellNavId: 'fictional-pane' } },
    VildaVault: vault, VildaAuthUI: { isGuestMode: () => false },
    VildaDataImportExport: { getApplyLoadedDataSequence: () => state.sequence },
    VildaVisitContext: { currentFor: () => ({ visitId: state.visit }) },
    VildaDziennikOtylosci: { wpisPoId: (_journal, id) => id === ENTRY ? { biezaca: { dane: DATA } } : null } });
  win.window = win; win.self = win; win.top = win; win.parent = win;
  new Function('window', 'globalThis', intentsSource)(win, win);
  const realTransport = win.VildaUiIntents;
  win.VildaUiIntents = Object.freeze({ ...realTransport, captureCallerScope() {
    const scope = realTransport.captureCallerScope(), dispose = vi.fn(scope.dispose);
    const captured = Object.freeze({ isCurrent: scope.isCurrent, dispose }); scopes.push(captured); return captured;
  } });
  const fields = id => document.getElementById(id);
  let context;
  const clear = vi.fn(() => { fieldIds.forEach(id => { fields(id).value = ''; }); context.Es = null; });
  const clearMessage = vi.fn(() => { message.hidden = true; });
  const edit = vi.fn(id => { context.Es = id; fields('obesityWeight').value = String(state.points.find(p => p.id === id)?.weight ?? ''); });
  const report = vi.fn();
  const showMessage = vi.fn((_kind, text, actions = []) => {
    message.textContent = text;
    [...message.children].forEach(child => child.remove()); message.hidden = false;
    if (actions.length) {
      const actionsNode = message.appendChild(new Element('', 'div')); actionsNode.className = 'obm-msg-actions';
      for (const action of actions) {
        const button = actionsNode.appendChild(new Element('', 'button'));
        button.textContent = action.label; button.addEventListener('click', action.run);
      }
    }
  });
  context = vm.createContext({ window: win, document, Date, Promise, setTimeout, clearTimeout,
    getComputedStyle: element => ({ display: element.hidden ? 'none' : 'block' }),
    c: fields, d: report, Dzp: () => win._vildaCurrentPatientId, Dzpid: journal ? PID : 'fictional other',
    Dzs: {}, Es: null, I: () => state.points, Ec: clear, Cc: clearMessage, Ee: edit,
    Ek: (id, value) => { fields(id).value = String(value); }, Eg: vi.fn(), CyS: vi.fn(), Cm: showMessage });
  vm.runInContext(code, context);
  const monitor = win.obesityTherapyMonitorSkok;
  const complete = vi.fn(() => { state.route = false; });
  const options = () => ({ isCurrent: () => state.route, onComplete: complete });
  const target = tryb => ({ patientId: PID, tryb, entryId: tryb === 'wlaczenie' ? null : ENTRY });
  const h = { win, document, state, context, monitor, complete, options, target, fields,
    clear, clearMessage, edit, showMessage, report, scopes, store, observers, messageParent, modal, card, section,
    get message() { return message; },
    button: () => message.querySelectorAll('.obm-msg-actions > button')[0],
    replaceMessage() {
      message.remove(); message = messageParent.appendChild(new Element('obesityTherapyActionMsg'));
    } };
  fixtures.push(h); return h;
}
afterEach(() => {
  for (const h of fixtures.splice(0)) {
    h.state.route = false; h.win.dispatchEvent(new Event('pagehide'));
    h.context.SkclearAction?.dispose();
  }
  vi.clearAllTimers(); vi.useRealTimers();
});

describe('actual obesity jump monitor contract', () => {
  it.each(['edytuj', 'ponownie', 'wlaczenie'])('keeps the one-argument boolean path and native %s fields', async mode => {
    const h = fixture({ closed: true });
    expect(h.monitor(h.target(mode))).toBe(true); await flush();
    expect(h.card.hidden).toBe(false); expect(h.section.hidden).toBe(false);
    if (mode === 'edytuj') { expect(h.edit).toHaveBeenCalledExactlyOnceWith(ENTRY); expect(h.fields('obesityWeight').value).toBe('80'); }
    if (mode === 'ponownie') {
      expect(h.fields('obesityWeight').value).toBe('72.4'); expect(h.fields('obesityDate').value).toBe('2026-11-03');
      h.button().click(); expect(h.fields('obesityWeight').value).toBe('');
    }
    if (mode === 'wlaczenie') expect(h.message.textContent).toContain('Nowy cykl leczenia otyłości');
    expect(h.complete).not.toHaveBeenCalled(); expect(h.store.setItem).not.toHaveBeenCalled();
  });
  it('marks this exact exported function without a writable or enumerable capability', () => {
    const h = fixture();
    expect(h.win.obesityTherapyMonitorSkok).toBe(h.monitor);
    expect(Object.getOwnPropertyDescriptor(h.monitor, 'uiIntentLandingVersion'))
      .toEqual({ value: 1, writable: false, enumerable: false, configurable: false });
    expect(Object.keys(h.monitor)).not.toContain('uiIntentLandingVersion');
  });
  it.each([{}, { isCurrent: true, onComplete() {} }, { isCurrent: () => true }, { onComplete() {} }])(
    'rejects a malformed scoped contract without UI mutation: %j', invalid => {
      const h = fixture(); expect(h.monitor(h.target('wlaczenie'), invalid)).toBe(false);
      expect(h.context.Sk).toBe(0); expect(h.clear).not.toHaveBeenCalled();
    });
  it('refuses an already-stale optional route before accepting ownership', () => {
    const h = fixture(); h.state.route = false;
    expect(h.monitor(h.target('wlaczenie'), h.options())).toBe(false);
    expect(h.complete).not.toHaveBeenCalled(); expect(h.context.Sk).toBe(0);
  });
  it('cancels a pending journal poll without mutation and completes once', async () => {
    const h = fixture({ journal: false });
    expect(h.monitor(h.target('edytuj'), h.options())).toBe(true); await flush();
    h.state.route = false; await vi.advanceTimersByTimeAsync(150); await flush();
    expect(h.edit).not.toHaveBeenCalled(); expect(h.clear).not.toHaveBeenCalled();
    expect(h.complete).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels the six-hour visit-choice wait on the next real production poll', async () => {
    const h = fixture({ choice: true }), target = { ...h.target('wlaczenie'), poWczytaniu: true };
    expect(h.monitor(target, h.options())).toBe(true); await flush();
    await vi.advanceTimersByTimeAsync(1000); expect(h.complete).not.toHaveBeenCalled();
    h.state.route = false; await vi.advanceTimersByTimeAsync(150); await flush();
    expect(h.clear).not.toHaveBeenCalled(); expect(h.complete).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('retains completion until the nested edit-point poll has actually landed', async () => {
    const h = fixture({ points: [] });
    h.monitor(h.target('edytuj'), h.options()); await flush();
    expect(h.complete).not.toHaveBeenCalled(); expect(h.edit).not.toHaveBeenCalled();
    h.state.points.push({ id: ENTRY, weight: 80 }); await vi.advanceTimersByTimeAsync(150); await flush();
    expect(h.edit).toHaveBeenCalledExactlyOnceWith(ENTRY); expect(h.complete).toHaveBeenCalledOnce();
    expect(h.store.setItem).not.toHaveBeenCalled();
  });
});

async function completedClearFixture() {
  const h = fixture();
  expect(h.monitor(h.target('ponownie'), h.options())).toBe(true); await flush();
  expect(h.complete).toHaveBeenCalledOnce(); expect(h.state.route).toBe(false);
  expect(h.scopes).toHaveLength(1); expect(h.scopes[0].isCurrent()).toBe(true);
  expect(h.fields('obesityWeight').value).toBe('72.4'); return h;
}
describe('new explicit Clear action after the route has completed', () => {
  it('keeps legitimate doctor input editable, then clears exactly once', async () => {
    const h = await completedClearFixture(), serial = h.context.Sk, button = h.button();
    h.fields('obesityWeight').value = '73.1'; h.fields('obesityWeight').dispatchEvent(new Event('input'));
    expect(h.context.Sk).toBe(serial);
    const before = h.clear.mock.calls.length; button.click();
    expect(h.fields('obesityWeight').value).toBe(''); expect(h.clear).toHaveBeenCalledTimes(before + 1);
    expect(h.clearMessage).toHaveBeenCalledOnce(); expect(h.scopes[0].dispose).toHaveBeenCalledOnce();
    button.click(); expect(h.clear).toHaveBeenCalledTimes(before + 1);
    expect(h.store.setItem).not.toHaveBeenCalled();
  });
  const changes = {
    detached: h => h.button().remove(),
    'replaced message': h => h.replaceMessage(),
    'new visit': h => { h.state.visit = 'fictional replacement visit'; },
    lock: h => { h.state.unlocked = false; },
    account: h => { h.state.account = 'fictional replacement account'; },
    ticket: h => { h.state.generation++; },
    mode: h => { h.state.mode = 'cloud-only'; },
    ephemeral: h => { h.state.ephemeral = true; },
    Vault: h => { h.win.VildaVault = { ...h.win.VildaVault }; },
    transport: h => { h.win.VildaUiIntents = { ...h.win.VildaUiIntents }; },
    'visit module': h => { h.win.VildaVisitContext = { ...h.win.VildaVisitContext }; },
    'monitor function': h => { h.win.obesityTherapyMonitorSkok = () => true; },
    'monitor serial': h => { h.context.Sk++; },
    patient: h => { h.win._vildaCurrentPatientId = 'fictional replacement patient'; },
    editor: h => { h.context.Es = 'fictional different editor'; },
    navigation: h => h.win.dispatchEvent(new Event('popstate')),
    'choice event': h => h.document.dispatchEvent(new Event('vilda:load-choice-applied')),
    'restore event': h => h.document.dispatchEvent(new Event('vilda:state-restored')),
    clear: h => h.document.dispatchEvent(new Event('vilda:user-state-cleared'))
  };
  it.each(Object.entries(changes))('cannot clear a later owner after %s', async (_name, change) => {
    const h = await completedClearFixture(), button = h.button(), before = h.clear.mock.calls.length;
    h.fields('obesityWeight').value = '81.3'; change(h); await flush(); button.click();
    expect(h.fields('obesityWeight').value).toBe('81.3');
    expect(h.clear).toHaveBeenCalledTimes(before); expect(h.clearMessage).not.toHaveBeenCalled();
    expect(h.context.SkclearAction).toBeNull(); expect(h.scopes[0].dispose).toHaveBeenCalledOnce();
    expect(h.store.setItem).not.toHaveBeenCalled();
  });
  it('disposes its captured caller scope when the entire message parent is removed, without a click', async () => {
    const h = await completedClearFixture(), before = h.clear.mock.calls.length;
    h.messageParent.remove(); await flush();
    expect(h.context.SkclearAction).toBeNull(); expect(h.scopes[0].dispose).toHaveBeenCalledOnce();
    expect(h.scopes[0].isCurrent()).toBe(false); expect(h.clear).toHaveBeenCalledTimes(before);
    expect(h.observers.size).toBe(0);
  });
  it('rejects a forged click target even while the real action owner remains current', async () => {
    const h = await completedClearFixture(), before = h.clear.mock.calls.length;
    const action = h.context.SkclearAction; action.run({ currentTarget: h.fields('obesityWeight') });
    expect(h.clear).toHaveBeenCalledTimes(before); expect(h.scopes[0].dispose).toHaveBeenCalledOnce();
  });
});
