import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'espree';

const authURL = new URL('../../vilda_auth_ui.js', import.meta.url);
const productionIndexes = new Map();

export function authProductionSource() { return fs.readFileSync(authURL, 'utf8'); }

// Extract exact declarations from the current production file. A parent name
// disambiguates nested callbacks without copying their implementation here.
function productionIndex(source) {
  if (productionIndexes.has(source)) return productionIndexes.get(source);
  const functions = new Map(), returnDeclarations = [], returnNames = new Set();
  function walk(node, parent) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration') {
      if (!functions.has(node.id.name)) functions.set(node.id.name, []);
      functions.get(node.id.name).push({ node, parent });
      if (!parent && /^remSearch/.test(node.id.name)) {
        returnDeclarations.push(node); returnNames.add(node.id.name);
      }
      parent = node.id.name;
    } else if (!parent && node.type === 'VariableDeclaration'
      && node.declarations.some(item => /^remSearch/.test(item.id?.name || ''))) returnDeclarations.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => walk(child, parent));
      else if (value && typeof value === 'object') walk(value, parent);
    }
  }
  walk(parse(source, { ecmaVersion: 'latest' }), null);
  const index = { functions, returnDeclarations, returnNames };
  productionIndexes.set(source, index); return index;
}

export function authProductionFunction(source, name, parentName) {
  const found = (productionIndex(source).functions.get(name) || []).filter(item => !parentName || item.parent === parentName);
  if (found.length !== 1) throw new Error(`Production declaration ${name}: expected 1, found ${found.length}`);
  return source.slice(found[0].node.start, found[0].node.end);
}

export function authProductionReturnProgram(source) {
  const { returnDeclarations, returnNames } = productionIndex(source);
  for (const name of ['remSearchDropReturn', 'remSearchCreateReturn', 'remSearchCurrentReturn', 'remSearchResume', 'remSearchPatientReturn']) {
    if (!returnNames.has(name)) throw new Error('Missing production Search return helper: ' + name);
  }
  return returnDeclarations.slice().sort((left, right) => left.start - right.start).map(node => source.slice(node.start, node.end)).join('\n');
}

export function authDeferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

// Only the host surfaces and vault notifications are test doubles. Ownership,
// return-ticket decisions and navigation callbacks are supplied as exact
// production declarations in script, not reconstructed by this harness.
export function authReturnEnvironment(script, bindings = {}, source = authProductionSource()) {
  const lock = [], unlock = [], timers = new Map(), calls = [];
  let serial = 0;
  const state = { unlocked: true, userId: 'fictional-search-return-account' };
  const vault = {
    isUnlocked: () => state.unlocked,
    getCurrentUser: () => state.unlocked ? { userId: state.userId } : null,
    onLock: callback => { lock.push(callback); },
    onUnlock: callback => { unlock.push(callback); },
  };
  const documentEvents = new EventTarget(), windowEvents = new EventTarget();
  const document = {
    getElementById: () => null,
    querySelector: () => null,
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
    dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents),
  };
  const win = {
    document, VildaVault: vault,
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents),
    setTimeout: callback => { timers.set(++serial, callback); return serial; },
    clearTimeout: id => timers.delete(id),
  };
  win.self = win; win.top = win;
  const ownerProgram = [authProductionFunction(source, 'remReadOwner'), authProductionFunction(source, 'remReadCurrent')].join('\n');
  const context = vm.createContext({
    i: win, jt: () => win.VildaVault, Promise, Date, Event, CustomEvent,
    setTimeout: win.setTimeout, clearTimeout: win.clearTimeout,
    remReadEpoch: 0, remReadVault: null, remB22Full: null,
    remB22Views: new WeakMap(),
    remInlineHide: () => { calls.push({ action: 'hide-inline' }); },
    el: () => { calls.push({ action: 'close-auth-surface' }); },
    Ot: (where, error) => { calls.push({ action: 'reported-error', where, message: error?.message }); },
    ...bindings,
  });
  vm.runInContext(ownerProgram + '\n' + script, context);
  return {
    context, win, document, vault, state, calls,
    owner: () => context.remReadOwner(),
    current: owner => context.remReadCurrent(owner),
    lock() { state.unlocked = false; lock.slice().forEach(callback => callback()); },
    unlock(userId = state.userId) { state.userId = userId; state.unlocked = true; unlock.slice().forEach(callback => callback()); },
    replaceVault(replacement = { ...vault }) { win.VildaVault = replacement; return replacement; },
    async flushTimers() {
      const pending = [...timers.values()]; timers.clear();
      for (const callback of pending) await callback();
    },
    pendingTimerCount: () => timers.size,
  };
}
