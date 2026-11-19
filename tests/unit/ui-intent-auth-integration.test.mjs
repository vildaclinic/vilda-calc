import { reverseBscAuthHooks } from '../../tools/account-duplicate-dismissals-auth-hooks.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { UI_INTENT_AUTH_PAIRS, applyUiIntentAuthHooks, reverseUiIntentAuthHooks } from '../../tools/private-ui-intent-auth-hooks.mjs';
import { SETTINGS_UI_INTENT_PAIR, applySettingsUiIntentHook, reverseSettingsUiIntentHook } from '../../tools/private-ui-intent-settings-hooks.mjs';
import { HOME_REMINDERS_AUTH_BASE_SHA256, reverseHomeRemindersHooks } from '../../tools/home-reminders-auth-hooks.mjs';

const { parse } = createRequire(import.meta.url)('espree');
const auth = fs.readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const settings = fs.readFileSync(new URL('../../inline_ustawienia_04.js', import.meta.url), 'utf8');
const ast = parse(auth, { ecmaVersion: 'latest' });
const settingsAst = parse(settings, { ecmaVersion: 'latest' });
const TARGET = 'fictional target B / żółw ' + 'x'.repeat(300);
const GH = 'vilda:gh-jump', LOAD = 'vilda:pendingPatientLoad';
const digest = value => createHash('sha256').update(value).digest('hex');

function find(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => find(child, predicate, found));
    else if (value && typeof value === 'object') find(value, predicate, found);
  }
  return found;
}
function declaration(name, parent = ast) {
  const matches = find(parent, node => node.type === 'FunctionDeclaration' && node.id?.name === name);
  if (matches.length !== 1) throw Error(`Ambiguous native function ${name}: ${matches.length}`);
  return matches[0];
}
const text = node => auth.slice(node.start, node.end);
const ghProducer = text(declaration('Gr'));
const pendingProducer = text(declaration('gt', declaration('Xl')));
const boundaryFunctions = ['UiIntentBoundary', 'UiIntentBindSync'].map(name => text(declaration(name))).join('\n');

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function events(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); },
    removeEventListener(type, callback) { listeners.set(type, (listeners.get(type) || []).filter(item => item !== callback)); },
    dispatchEvent(event) { for (const callback of [...(listeners.get(event.type) || [])]) callback(event); return true; },
  });
}
function environment({ embedded = false, monitor = false, inlineGrowth = false, mainPatient = 'fictional-main-A' } = {}) {
  const order = [], values = new Map(), state = { now: 123456789, receipt: true };
  const store = {
    getItem: key => values.get(key) ?? null,
    setItem: vi.fn((key, value) => { order.push(['store', key, value]); values.set(key, String(value)); }),
    removeItem: vi.fn(key => { values.delete(key); }),
  };
  if (mainPatient != null) values.set('vildaCurrentPatientId', mainPatient);
  const growth = { style: { display: 'none' }, scrollIntoView: vi.fn(options => order.push(['scroll', options])) };
  const toggle = { click: vi.fn(() => { growth.style.display = ''; order.push(['expand']); }) };
  const document = events({ hidden: false, documentElement: { classList: { contains: value => embedded && value === 'vilda-embedded' } },
    getElementById: id => !inlineGrowth ? null : id === 'toggleAdvancedGrowth' ? toggle : id === 'advancedGrowthSection' ? growth : null });
  const navigate = vi.fn((...args) => order.push(['shell', ...args]));
  const assign = vi.fn(value => order.push(['assign', value]));
  const win = events({ document, location: { href: 'https://fictional.invalid/terminarz.html', pathname: '/terminarz.html', hash: '', assign },
    history: { state: { shellNavId: 'fictional-source-pane' } }, sessionStorage: store,
    VildaPersistence: { getTabId: () => 'fictional-tab' }, Event: class { constructor(type) { this.type = type; } } });
  win.window = win; win.self = win; win.top = win;
  win.parent = embedded ? { document, location: { href: 'https://fictional.invalid/app.html#/terminarz' },
    history: { state: { shellNavId: 'fictional-source-pane' } }, VildaShell: { navigate } } : win;
  if (monitor) win.refreshGHTherapyMonitor = vi.fn();
  loadBrowserScript('vilda_ui_intents.js', win);
  const nativeTransport = win.VildaUiIntents, pending = deferred();
  const scope = vi.fn(() => {
    const native = nativeTransport.captureCallerScope();
    return { isCurrent: native.isCurrent, dispose: vi.fn(native.dispose) };
  });
  const prepare = vi.fn((kind, payload, caller) => { order.push(['prepare', kind]); state.caller = caller; state.payload = payload; return pending.promise; });
  win.VildaUiIntents = { version: 1, captureCallerScope: scope, prepare };
  const report = vi.fn(message => order.push(['error', message]));
  const context = vm.createContext({ i: win, Date: { now: () => state.now },
    remSearchDropReturn: vi.fn(() => order.push(['drop-return'])), $t: vi.fn(() => order.push(['close-card'])), pi: report });
  vm.runInContext(ghProducer + '\n' + pendingProducer + '\n' + boundaryFunctions, context);
  const receipt = { current: vi.fn(() => state.receipt && state.caller.isCurrent()), discardExact: vi.fn(() => true) };
  return { win, document, store, values, nativeTransport, context, order, state, scope, prepare, pending, receipt, report,
    navigate, assign, toggle, growth,
    run: kind => kind === 'gh' ? context.Gr(TARGET, 'fictional point / Ć') : context.gt(TARGET) };
}

describe('native Auth ciphertext handoff producers', () => {
  it('awaits the GH commit, retaining the original action time, exact imported IDs and native shell navigation', async () => {
    const e = environment({ embedded: true }); const saving = e.run('gh');
    expect(e.order).toEqual([['drop-return'], ['prepare', 'gh-jump']]);
    expect(e.prepare).toHaveBeenCalledWith('gh-jump', { patientId: TARGET, ghPointId: 'fictional point / Ć', ts: 123456789 }, e.state.caller);
    expect(e.navigate).not.toHaveBeenCalled(); expect(e.store.setItem).not.toHaveBeenCalled();
    e.state.now += 59000; e.pending.resolve(e.receipt); await saving;
    expect(e.state.payload.ts).toBe(123456789);
    expect(e.navigate).toHaveBeenCalledExactlyOnceWith('docpro', true);
    expect(e.win.location.href).toBe('https://fictional.invalid/terminarz.html');
    expect(e.state.caller.dispose).toHaveBeenCalledOnce(); expect(e.report).not.toHaveBeenCalled();
    expect(e.receipt.discardExact).not.toHaveBeenCalled();
  });

  it('keeps the native standalone monitor hash and repeated-point hashchange path', async () => {
    const e = environment({ monitor: true }); e.win.location.hash = '#/docpro';
    const dispatched = vi.spyOn(e.win, 'dispatchEvent');
    const saving = e.run('gh'); expect(dispatched).not.toHaveBeenCalled();
    e.pending.resolve(e.receipt); await saving;
    expect(e.win.location.hash).toBe('#/docpro');
    expect(dispatched).toHaveBeenCalledOnce(); expect(dispatched.mock.calls[0][0].type).toBe('hashchange');
    expect(e.assign).not.toHaveBeenCalled(); expect(e.win.location.href).not.toBe('docpro.html');
  });

  it('preserves the point-only GH branch and standalone document navigation with a blank main form', async () => {
    const e = environment({ mainPatient: null }); const saving = e.context.Gr(null, 42);
    expect(e.prepare).toHaveBeenCalledWith('gh-jump', { patientId: null, ghPointId: '42', ts: 123456789 }, e.state.caller);
    expect(e.win.location.href).not.toBe('docpro.html');
    e.pending.resolve(e.receipt); await saving;
    expect(e.win.location.href).toBe('docpro.html'); expect(e.report).not.toHaveBeenCalled();
  });

  it.each(['fictional-main-A', null])('commits target B before pending-load scroll marker and exact native navigation (main=%s)', async mainPatient => {
    const e = environment({ mainPatient }); const saving = e.run('pending');
    expect(e.order).toEqual([['close-card'], ['prepare', 'pending-patient-load']]);
    expect(e.prepare).toHaveBeenCalledWith('pending-patient-load', { patientId: TARGET }, e.state.caller);
    expect(e.store.setItem).not.toHaveBeenCalled(); expect(e.assign).not.toHaveBeenCalled();
    e.pending.resolve(e.receipt); await saving;
    expect(e.order).toEqual([['close-card'], ['prepare', 'pending-patient-load'], ['store', 'vilda:postLoadScroll', 'advancedGrowth'], ['assign', 'index.html']]);
    expect(e.values.get('vildaCurrentPatientId') ?? null).toBe(mainPatient);
    expect(e.state.caller.dispose).toHaveBeenCalledOnce();
    expect(e.receipt.discardExact).not.toHaveBeenCalled();
  });

  it('keeps the existing on-page growth expansion and scroll path free of handoff work', async () => {
    const e = environment({ inlineGrowth: true }); await e.run('pending');
    expect(e.toggle.click).toHaveBeenCalledOnce();
    expect(e.growth.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: 'smooth', block: 'start' });
    expect(e.scope).not.toHaveBeenCalled(); expect(e.prepare).not.toHaveBeenCalled(); expect(e.assign).not.toHaveBeenCalled();
    expect(e.store.setItem).not.toHaveBeenCalled();
  });

  it.each(['gh', 'pending'])('does not navigate from an obsolete real source scope after %s encryption finishes', async kind => {
    const e = environment({ embedded: true }); const saving = e.run(kind);
    e.document.dispatchEvent({ type: 'vilda:patient-loaded' });
    expect(e.state.caller.isCurrent()).toBe(false);
    e.pending.resolve(e.receipt); await saving;
    expect(e.receipt.current).toHaveReturnedWith(false);
    expect(e.navigate).not.toHaveBeenCalled(); expect(e.assign).not.toHaveBeenCalled();
    expect(e.store.setItem).not.toHaveBeenCalled(); expect(e.report).not.toHaveBeenCalled();
    expect(e.state.caller.dispose).toHaveBeenCalledOnce();
    expect(e.receipt.discardExact).toHaveBeenCalledOnce();
  });

  it.each(['gh', 'pending'])('does not navigate from a superseded %s receipt even while its source remains current', async kind => {
    const e = environment({ embedded: true }); const saving = e.run(kind); e.state.receipt = false;
    expect(e.state.caller.isCurrent()).toBe(true);
    e.pending.resolve(e.receipt); await saving;
    expect(e.navigate).not.toHaveBeenCalled(); expect(e.assign).not.toHaveBeenCalled();
    expect(e.store.setItem).not.toHaveBeenCalled(); expect(e.report).not.toHaveBeenCalled();
    expect(e.receipt.discardExact).toHaveBeenCalledOnce();
  });

  it('checks the pending receipt again after writing the native scroll marker', async () => {
    const e = environment();
    e.store.setItem.mockImplementation((key, value) => { e.values.set(key, String(value)); e.state.receipt = false; });
    const saving = e.run('pending'); e.pending.resolve(e.receipt); await saving;
    expect(e.store.setItem).toHaveBeenCalledExactlyOnceWith('vilda:postLoadScroll', 'advancedGrowth');
    expect(e.receipt.current).toHaveBeenCalledTimes(2); expect(e.assign).not.toHaveBeenCalled();
    expect(e.receipt.discardExact).toHaveBeenCalledOnce();
  });

  it('discards the GH receipt when every native document-navigation path fails', async () => {
    const e = environment();
    Object.defineProperty(e.win.location, 'href', { configurable: true, get: () => 'https://fictional.invalid/terminarz.html',
      set: () => { throw Error('Fictional blocked native GH navigation'); } });
    const saving = e.run('gh'); e.pending.resolve(e.receipt); await saving;
    expect(e.receipt.discardExact).toHaveBeenCalledOnce(); expect(e.navigate).not.toHaveBeenCalled(); expect(e.assign).not.toHaveBeenCalled();
  });

  it('discards the timeline pending receipt and reports the existing error if native navigation throws', async () => {
    const e = environment(); e.assign.mockImplementation(() => { throw Error('Fictional blocked timeline navigation'); });
    const saving = e.run('pending'); e.pending.resolve(e.receipt); await saving;
    expect(e.receipt.discardExact).toHaveBeenCalledOnce();
    expect(e.report).toHaveBeenCalledExactlyOnceWith('Fictional blocked timeline navigation');
  });

  it.each(['gh', 'pending'])('surfaces a current %s crypto/storage failure through the existing native toast', async kind => {
    const e = environment({ embedded: true }); const saving = e.run(kind);
    e.pending.reject(Error('Fikcyjny błąd bezpiecznego przekazania')); await saving;
    expect(e.report).toHaveBeenCalledExactlyOnceWith('Fikcyjny błąd bezpiecznego przekazania');
    expect(e.navigate).not.toHaveBeenCalled(); expect(e.assign).not.toHaveBeenCalled();
    expect(e.state.caller.dispose).toHaveBeenCalledOnce();
  });

  it.each(['gh', 'pending'])('suppresses a late %s error after the source pane leaves', async kind => {
    const e = environment({ embedded: true }); const saving = e.run(kind);
    e.win.dispatchEvent({ type: 'pagehide' }); e.pending.reject(Error('Fikcyjny spóźniony błąd')); await saving;
    expect(e.report).not.toHaveBeenCalled(); expect(e.navigate).not.toHaveBeenCalled(); expect(e.assign).not.toHaveBeenCalled();
    expect(e.state.caller.dispose).toHaveBeenCalledOnce();
  });

  it.each(['gh', 'pending'])('fails closed through the native toast when the %s transport is missing', async kind => {
    const e = environment(); delete e.win.VildaUiIntents; await e.run(kind);
    expect(e.report).toHaveBeenCalledExactlyOnceWith('Moduł bezpiecznej nawigacji niedostępny. Odśwież stronę.');
    expect(e.navigate).not.toHaveBeenCalled(); expect(e.assign).not.toHaveBeenCalled(); expect(e.store.setItem).not.toHaveBeenCalled();
    expect(e.win.location.href).toBe('https://fictional.invalid/terminarz.html'); expect(e.win.location.hash).toBe('');
  });
});

function bootBoundaryEnvironment() {
  const e = environment(), callbacks = {}, sync = {};
  e.win.VildaUiIntents = { ...e.nativeTransport, onBoundary: vi.fn(e.nativeTransport.onBoundary) };
  const vault = { isUnlocked: () => true };
  for (const name of ['onLock', 'onUnlock', 'onCredentialChanged']) vault[name] = vi.fn(callback => { callbacks[name] = callback; });
  const syncApi = { onSyncStart: vi.fn(callback => { sync.start = callback; }) };
  e.win.VildaSync = syncApi;
  // cn() returns the distinct native integration facade, which has no public
  // onSyncStart. Only the actual VildaSync API can deliver revoke callbacks.
  const integration = Object.freeze({ refresh: vi.fn() });
  const noop = () => {};
  Object.assign(e.context, { a: vault, jt: () => vault, cn: vi.fn(() => integration), dn: 'fictional-account', Rt: null, Rn: { userId: null, at: 0 },
    GdAnulujRender: noop, Ji: noop, Ro: noop, qa: noop, vildaEndTabSession: noop, Vn: () => false, Gn: noop,
    me: noop, Ja: noop, qi: noop, je: noop, Grb: noop, Gr8: vi.fn(), Gr9: vi.fn() });
  const boot = declaration('Ei');
  const registrations = ['onLock', 'onUnlock', 'onCredentialChanged'].map(name => {
    const matches = find(boot, node => node.type === 'CallExpression' && node.callee?.type === 'MemberExpression'
      && node.callee.property?.name === name && node.arguments?.some(argument => text(argument).includes('UiIntentBoundary')));
    if (matches.length !== 1) throw Error('Ambiguous native boundary registration: ' + name);
    return text(matches[0]);
  });
  vm.runInContext('UiIntentBindSync();\n' + registrations.join(';\n'), e.context);
  const seed = () => {
    e.values.set(GH, 'fictional-cipher-gh'); e.values.set(LOAD, 'fictional-cipher-load');
    e.values.set('vilda:ui-intent-epoch:v1', 'fictional-opaque-epoch');
  };
  return { ...e, callbacks, sync, vault, syncApi, seed };
}

describe('actual Auth public boundary registration', () => {
  it('registers real callbacks once, preserves restore and retires login, lock and credential handoffs', () => {
    const e = bootBoundaryEnvironment();
    for (const name of ['onLock', 'onUnlock', 'onCredentialChanged']) expect(e.vault[name]).toHaveBeenCalledOnce();
    expect(e.syncApi.onSyncStart).toHaveBeenCalledOnce();
    expect(e.context.cn).not.toHaveBeenCalled();
    e.seed(); e.callbacks.onUnlock({ userId: 'fictional-account', trigger: 'restore' });
    expect(e.values.get(GH)).toBe('fictional-cipher-gh'); expect(e.values.get(LOAD)).toBe('fictional-cipher-load');
    const cases = [
      () => e.callbacks.onUnlock({ userId: 'fictional-account', trigger: 'login' }),
      () => e.callbacks.onLock('manual'),
      ...['password-changed', 'password-reset', 'password-changed-remotely'].map(action => () => e.callbacks.onCredentialChanged({ action, updatedAtISO: '2026-11-19T00:00:00Z' })),
    ];
    for (const boundary of cases) {
      e.seed(); boundary();
      expect(e.values.has(GH)).toBe(false); expect(e.values.has(LOAD)).toBe(false);
      expect(e.values.has('vilda:ui-intent-epoch:v1')).toBe(false);
    }
    expect(e.context.Gr8).toHaveBeenCalledTimes(2); expect(e.context.Gr9).toHaveBeenCalledExactlyOnceWith('2026-11-19T00:00:00Z');
  });

  it('clears only on actual revoke notifications, including the native cross-document marker prefix', () => {
    const e = bootBoundaryEnvironment(); e.seed();
    e.sync.start({ operation: 'push' }); e.win.dispatchEvent({ type: 'storage', key: 'vilda-sync-enabled-v1' });
    expect(e.values.has(GH)).toBe(true); expect(e.values.has(LOAD)).toBe(true);
    e.sync.start({ operation: 'revoke' });
    expect(e.values.has(GH)).toBe(false); expect(e.values.has(LOAD)).toBe(false);
    e.seed(); e.win.dispatchEvent({ type: 'storage', key: 'vilda-sync-revoked-v1:fictional-opaque-slot', newValue: 'fictional-marker' });
    expect(e.values.has(GH)).toBe(false); expect(e.values.has(LOAD)).toBe(false);
    expect(e.win.VildaUiIntents.onBoundary.mock.calls.map(([detail]) => detail)).toEqual(['revoke', 'revoke']);
  });
});

function settingsModeEnvironment({ pro = true } = {}) {
  const order = [], pending = deferred(), checked = { checked: true }, status = { style: {} };
  const matches = find(settingsAst, node => node.type === 'CallExpression' && node.callee?.type === 'MemberExpression'
    && node.callee.property?.name === 'addEventListener' && node.arguments?.[0]?.value === 'change'
    && node.arguments?.[1] && settings.slice(node.arguments[1].start, node.arguments[1].end).includes('await w.setStorageMode(z.userId,h)'));
  if (matches.length !== 1) throw Error('Ambiguous native Settings storage-mode listener');
  const callback = matches[0].arguments[1];
  const win = { VildaVault: { isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-owner' }),
    setStorageMode: vi.fn((...args) => { order.push(['set-mode', ...args]); return pending.promise; }) },
  VildaUiIntents: { version: 1, clear: vi.fn(() => order.push(['clear-intents'])) }, VildaProAccess: { hasAccess: () => pro } };
  const context = vm.createContext({ window: win, localStorage: { getItem: () => 'true' }, navigator: { onLine: true },
    o: checked, i: { style: {} }, d: status, u: { style: {} }, v: 'local', S: vi.fn(), setTimeout: vi.fn(), console: { error: vi.fn() } });
  const run = vm.runInContext('(' + settings.slice(callback.start, callback.end) + ')', context);
  return { order, pending, win, run, checked };
}

describe('actual Settings supported storage-mode boundary', () => {
  it('retires committed handoffs before awaiting the original per-owner storage-mode setter', async () => {
    const e = settingsModeEnvironment(); const saving = e.run();
    expect(e.order).toEqual([['clear-intents'], ['set-mode', 'fictional-owner', 'cloud-only']]);
    e.pending.resolve(); await saving;
    expect(e.win.VildaVault.setStorageMode).toHaveBeenCalledExactlyOnceWith('fictional-owner', 'cloud-only');
    expect(e.win.VildaUiIntents.clear).toHaveBeenCalledOnce();
  });

  it('retains handoffs when the existing native PRO gate rejects a mode change', async () => {
    const e = settingsModeEnvironment({ pro: false }); await e.run();
    expect(e.checked.checked).toBe(false); expect(e.order).toEqual([]);
    expect(e.win.VildaUiIntents.clear).not.toHaveBeenCalled(); expect(e.win.VildaVault.setStorageMode).not.toHaveBeenCalled();
  });

  it('preserves the native setting attempt if the optional intent cleanup fails', async () => {
    const e = settingsModeEnvironment();
    e.win.VildaUiIntents.clear.mockImplementation(() => { throw Error('Fictional optional cleanup failure'); });
    const saving = e.run();
    expect(e.win.VildaVault.setStorageMode).toHaveBeenCalledExactlyOnceWith('fictional-owner', 'cloud-only');
    e.pending.resolve(); await saving;
    expect(e.checked.checked).toBe(true);
  });
});

describe('static and lazy native handoff dependencies', () => {
  it('loads the helper once after Vault and before Auth on all eight static entry documents', () => {
    for (const name of ['app.html', 'index.html', 'docpro.html', 'terminarz.html', 'ustawienia.html', 'subskrypcja.html', 'notatki.html', 'kalkulator-klirens.html']) {
      const html = fs.readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
      const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(match => match[1]);
      const paths = scripts.map(value => value.split('?')[0]);
      expect(paths.filter(value => value === 'vilda_ui_intents.js'), name).toHaveLength(1);
      const helper = paths.indexOf('vilda_ui_intents.js');
      expect(helper, name).toBeGreaterThan(paths.indexOf('vilda_vault.js'));
      expect(helper, name).toBeLessThan(paths.indexOf('vilda_auth_ui.js'));
      expect(scripts[helper], name).toMatch(/^vilda_ui_intents\.js\?v=\d+$/);
      if (name === 'docpro.html') expect(helper).toBeLessThan(paths.indexOf('gh_therapy_monitor.js'));
    }
  });

  it.each([
    { file: 'vilda_chrome.js', name: 'u', root: 'r', dependency: 'd', load: 'c', property: 'href', ready: 'test' },
    { file: 'vilda_session_bridge.js', name: 'w', root: 'n', dependency: 'V', load: 'A', property: 'src', ready: 'ready' },
  ])('requires and loads the helper through the actual $file lazy readiness function', async config => {
    const source = fs.readFileSync(new URL('../../' + config.file, import.meta.url), 'utf8');
    const tree = parse(source, { ecmaVersion: 'latest' });
    const functions = find(tree, node => node.type === 'FunctionDeclaration' && node.id?.name === config.name
      && source.slice(node.start, node.end).includes(config.root + '.VildaUiIntents'));
    const arrays = find(tree, node => node.type === 'VariableDeclarator' && node.id?.name === config.dependency
      && node.init?.type === 'ArrayExpression' && source.slice(node.init.start, node.init.end).includes('vilda_ui_intents.js'));
    expect(functions).toHaveLength(1); expect(arrays).toHaveLength(1);
    const globals = {};
    for (const member of find(functions[0], node => node.type === 'MemberExpression' && node.object?.name === config.root
      && node.property?.name?.startsWith('Vilda'))) globals[member.property.name] = {};
    const load = vi.fn(() => Promise.resolve());
    const context = vm.createContext({ [config.root]: globals, [config.load]: load, f: null });
    vm.runInContext('var ' + config.dependency + '=' + source.slice(arrays[0].init.start, arrays[0].init.end)
      + ';\n' + source.slice(functions[0].start, functions[0].end), context);
    const dependencies = context[config.dependency];
    const paths = dependencies.map(entry => entry[config.property].split('?')[0]);
    const helper = dependencies.filter(entry => entry[config.property].startsWith('vilda_ui_intents.js?'));
    expect(helper).toHaveLength(1);
    expect(paths.indexOf('vilda_ui_intents.js')).toBeGreaterThan(paths.indexOf('vilda_vault.js'));
    expect(paths.indexOf('vilda_ui_intents.js')).toBeLessThan(paths.indexOf('vilda_auth_ui.js'));
    await context[config.name](); expect(load).not.toHaveBeenCalled();
    delete globals.VildaUiIntents;
    expect(helper[0][config.ready]()).toBe(false);
    await context[config.name]();
    expect(load.mock.calls.map(([entry]) => entry[config.property])).toEqual(dependencies.map(entry => entry[config.property]));
    globals.VildaUiIntents = { version: 1 }; expect(helper[0][config.ready]()).toBe(true);
  });
});

describe('exact reproducible Auth security delta', () => {
  it('reverses all 16 unique pairs to the prior checkpoint, replays idempotently and commutes with unchanged Home hooks', () => {
    expect(UI_INTENT_AUTH_PAIRS).toHaveLength(16);
    for (const pair of UI_INTENT_AUTH_PAIRS) expect(auth.split(pair.after)).toHaveLength(2);
    const prior = reverseUiIntentAuthHooks(auth);
    // Prior checkpoint 633ee436 plus exact PR1000/PR1002 native delta and its optional B1 lifetime hooks.
    expect(digest(reverseBscAuthHooks(prior))).toBe('12c87b88789bb0e0de6f5ce31fa30adfe82d6952de12ae683e54f7bb4f517a2c');
    expect(applyUiIntentAuthHooks(prior)).toBe(auth); expect(applyUiIntentAuthHooks(auth)).toBe(auth);
    const securedNative = reverseHomeRemindersHooks(auth);
    expect(digest(reverseBscAuthHooks(securedNative))).toBe(HOME_REMINDERS_AUTH_BASE_SHA256);
    const priorNative = reverseUiIntentAuthHooks(securedNative);
    expect(priorNative).toBe(reverseHomeRemindersHooks(prior));
    expect(digest(reverseBscAuthHooks(priorNative))).toBe('c2deeccd66218ec110fd56ddde619d96d45986ede4f27f47cdaa679540542744');
    expect(applyUiIntentAuthHooks(priorNative)).toBe(securedNative);
  });

  it('reverses only the optional Settings boundary and replays it idempotently', () => {
    expect(settings.split(SETTINGS_UI_INTENT_PAIR.after)).toHaveLength(2);
    const prior = reverseSettingsUiIntentHook(settings);
    expect(applySettingsUiIntentHook(prior)).toBe(settings); expect(applySettingsUiIntentHook(settings)).toBe(settings);
  });
});
