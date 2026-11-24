import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse } from 'espree';
import { describe, expect, it } from 'vitest';

// These are the production native card constructor and the exact arguments
// passed to B1. Only DOM nodes/builders are replaced with identity sentinels;
// no medical calculation or projection is reimplemented in this harness.
const source = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const tree = parse(source, { ecmaVersion: 'latest', range: true });
const text = node => source.slice(...node.range);
function descendants(root, predicate) {
  const found = [], stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (predicate(node)) found.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) stack.push(...value);
      else if (value && typeof value === 'object') stack.push(value);
    }
  }
  return found;
}
function one(root, predicate, label) {
  const found = descendants(root, predicate);
  if (found.length !== 1) throw Error('Ambiguous production ' + label + ': ' + found.length);
  return found[0];
}
const nativeCard = one(tree, node => node.type === 'FunctionDeclaration' && node.id?.name === 'se'
  && text(node).includes('/* BEGIN HOME PATIENT B1 NATIVE PRESENTATION'), 'patient card');
const nativeChildren = one(nativeCard, node => node.type === 'VariableDeclarator' && node.id?.name === 'Cs', 'card children').init;
const nativeDecorator = one(nativeCard, node => node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
  && node.callee.property.name === 'decorate' && text(node.callee.object) === 'i.VildaHomePatientNative', 'B1 decorator');
const decoratorOptions = nativeDecorator.arguments[0];
function option(name) {
  return text(one(decoratorOptions, node => node.type === 'Property' && node.key?.name === name, name + ' option').value);
}
const scrollToTreatment = text(one(tree, node => node.type === 'FunctionDeclaration' && node.id?.name === 'Kl_przewin', 'native treatment scroller'));
const diaryNotes = text(one(tree, node => node.type === 'FunctionDeclaration' && node.id?.name === 'Ob_dzNotatki', 'diary Notes link'));

const treatmentConstructor = text(one(tree, node => node.type === 'FunctionDeclaration' && node.id?.name === 'Kl_leczenie', 'native treatment constructor'));
const nativeTreatment = one(nativeCard, node => node.type === 'VariableDeclarator' && node.id?.name === 'KlL', 'native treatment').init;

function nativePanelArguments(requested = false, withTreatment = true) {
  const node = kind => ({ kind });
  let diaryArguments;
  const nativeCurrent = () => true, nativeDialog = () => null;
  const expected = { gh: node('native GH treatment'), diary: node('native obesity diary') };
  const context = vm.createContext({
    e: (tag, attrs, children = []) => ({ tag, attrs, children, appendChild(child) { this.children.push(child); } }),
    oe: element => { element.children.length = 0; }, r: null, GdTlo: false, Kl_IKONA: '', at: () => '',
    Kg_grupa: () => withTreatment ? { el: expected.gh } : null, Kl_kolejnosc: nodes => nodes,
    Ko_zapomnij() {}, Kg_zapomnij() {},
    O: node('native patient heading'), s: { ghTherapyPoints: [], timestampISO: '2026-11-19T12:00:00Z' },
    S: {}, y: {}, h: {}, t: 'fictional-diary-patient', GdNotatki: [], m: {},
    Ob_dz: (...args) => { diaryArguments = args; return withTreatment ? expected.diary : null; },
    Ot: (_label, error) => { throw error; },
    Ft: node('native tab navigation'), Nt: node('native Status panel'), Ct: node('native trajectory panel'),
    sa: node('native Notes panel'), ca: node('native timeline panel'), GdLabHost: node('native lab panel'),
    CarePatientHost: node('native care panel'), Li: null, zo: node('native return action'),
    HomePatientRequested: requested, HomePatientIsCurrent: nativeCurrent, HomePatientDialog: nativeDialog,
    VisitHistoryButton: node('native visit history action'), So: node('native versions action'), Co: null,
    i: { VildaHomePatientNative: { describeLegacy: nodes => nodes } }
  });
  vm.runInContext(treatmentConstructor, context);
  vm.runInContext('var KlL = (' + text(nativeTreatment) + ');', context);
  vm.runInContext('var Cs = (' + text(nativeChildren) + ');', context);
  return {
    expected, context, diaryArguments, nativeCurrent, nativeDialog,
    panels: vm.runInContext('(' + option('legacyPanels') + ')', context),
    summaryPanels: vm.runInContext('(' + option('legacySummary') + ')', context),
  };
}

function diaryLink({ preview, b1, hasTreatment = true, hasEntriesTab = false }) {
  const events = [], scheduled = [], appended = [];
  const title = {
    setAttribute: (name, value) => events.push(['title-attribute', name, value]),
    focus: options => events.push(['focus', options.preventScroll])
  };
  const scroller = { scrollTop: 50, scrollHeight: 1600, clientHeight: 600, getBoundingClientRect: () => ({ top: 20 }),
    scrollTo: options => events.push(['scroll', options.top, options.behavior]) };
  const treatmentCard = { parentElement: scroller, getBoundingClientRect: () => ({ top: 200 }) };
  const section = {
    isConnected: true, parentElement: scroller, getBoundingClientRect: () => ({ top: 160 }),
    querySelector: selector => { expect(selector).toBe('.vdo-title'); return title; }
  };
  const card = {
    isConnected: true,
    classList: { contains: name => b1 && name === 'vhome-native-patient-card' },
    querySelector(selector) {
      if (selector === 'button[data-tab="leczenie"]') return hasTreatment ? { click: () => events.push(['select', 'leczenie']) } : null;
      if (selector === '.vilda-ko-seg [data-widok="wpisy"]') return hasEntriesTab ? {
        closest: selector => { expect(selector).toBe('.vilda-ko-karta'); return treatmentCard; }, click: () => events.push(['select', 'wpisy']), focus: options => events.push(['focus', options.preventScroll])
      } : null;
      if (selector === '.vdo') return section;
      if (selector === 'button[data-tab="antro"]') return { click: () => events.push(['select', 'antro']) };
      if (selector === 'button[data-tab="treatment"]') return { click: () => events.push(['select', 'treatment']) };
      throw Error('Unexpected native card selector: ' + selector);
    }
  };
  const host = {
    isConnected: true,
    closest: selector => { expect(selector).toBe('.vilda-auth-patient-card'); return card; },
    appendChild: child => appended.push(child)
  };
  const context = vm.createContext({
    i: { __VILDA_HOME_WORKSPACE_PREVIEW__: preview, document: {}, getComputedStyle: () => ({ overflowY: 'auto' }),
      setTimeout: (callback, delay) => scheduled.push({ callback, delay }) },
    e: (tag, attrs, children) => ({ tag, attrs, children })
  });
  vm.runInContext(scrollToTreatment + '\n' + diaryNotes, context);
  const plain = { id: 'fictional-plain-note', category: 'observation', body: 'Fikcyjna zwykła notatka.' };
  const diary = { id: 'fictional-diary-entry', category: 'leczenie-otylosci', body: 'Fikcyjna wersja wpisu dziennika.' };
  const notes = [plain, diary], before = JSON.stringify(notes);
  const remaining = context.Ob_dzNotatki(host, notes);
  return { events, scheduled, appended, remaining, plain, notes, before };
}

describe('home patient B1: native obesity diary presentation boundary', () => {
  it('supplies the explicit current Home lifetime contract only on the opted-in card', () => {
    expect(nativePanelArguments().diaryArguments[6]).toBeNull();
    const home = nativePanelArguments(true), scope = home.diaryArguments[6];
    expect(scope.actorLifetimeVersion).toBe(1);
    expect(scope.isCurrent).toBe(home.nativeCurrent);
    expect(scope.onDialog).toBe(home.nativeDialog);
  });

  it.each([undefined, null, 0, 1, 2, '1'])('accepts a current presentation only with the exact supported actor capability: %s', version => {
    const predicate = text(one(nativeCard, node => node.type === 'FunctionDeclaration' && node.id?.name === 'HomePatientIsCurrent', 'Home owner predicate'));
    let calls = 0;
    const context = vm.createContext({ HomePatientPresentation: { actorLifetimeVersion: version, isCurrent: () => { calls += 1; return true; } } });
    vm.runInContext(predicate, context);
    expect(context.HomePatientIsCurrent()).toBe(version === 1);
    expect(calls).toBe(version === 1 ? 1 : 0);
  });

  it('moves only the native treatment nodes and leaves navigation and Status outside Treatment', () => {
    const result = nativePanelArguments(true), { KlL, Cs, Ft, Nt } = result.context;
    expect(Array.from(result.panels)).toEqual([KlL.tresc]);
    expect(KlL.tresc.children).toEqual([result.expected.gh, result.expected.diary]);
    expect(Array.from(result.summaryPanels)).toEqual([result.expected.gh, null, result.expected.diary]);
    expect(Cs.filter(node => node === KlL.tresc)).toHaveLength(1);
    expect(Cs).not.toContain(KlL.paski);
    expect(Cs).toContain(Ft); expect(Cs).toContain(Nt);
    const plain = nativePanelArguments(false).context;
    expect(plain.Cs.indexOf(plain.KlL.paski)).toBeLessThan(plain.Cs.indexOf(plain.Ft));
    expect(plain.Cs.indexOf(plain.KlL.tresc)).toBeGreaterThan(plain.Cs.indexOf(plain.Nt));
    const empty = nativePanelArguments(true, false);
    expect(Array.from(empty.panels)).toEqual([]); expect(Array.from(empty.summaryPanels)).toEqual([]);
  });

  it.each([
    ['opted-in B1 card', { preview: true, b1: true }, 'treatment'],
    ['B1 marker without preview opt-in', { preview: false, b1: true }, 'leczenie'],
    ['preview opt-in on a native legacy card', { preview: true, b1: false }, 'leczenie'],
    ['native card without treatment', { preview: false, b1: false, hasTreatment: false }, 'antro'],
    ['native legacy card', { preview: false, b1: false }, 'leczenie'],
  ])('routes the real diary Notes link before its native scroll/focus: %s', (_name, options, tab) => {
    const result = diaryLink(options);
    expect(Array.from(result.remaining)).toEqual([result.plain]);
    expect(JSON.stringify(result.notes)).toBe(result.before);
    expect(result.appended).toHaveLength(1);
    const button = result.appended[0].children[0];
    expect(button.tag).toBe('button');
    button.attrs.onclick();
    expect(result.events).toEqual([['select', tab]]);
    expect(result.scheduled).toHaveLength(1);
    result.scheduled[0].callback();
    expect(result.events).toEqual([
      ['select', tab], ['scroll', 182, 'smooth'],
      ['title-attribute', 'tabindex', '-1'], ['focus', true],
    ]);
    expect(JSON.stringify(result.notes)).toBe(result.before);
  });
  it('opens the native entries tab, scrolls its treatment card and focuses the switch', () => {
    const result = diaryLink({ preview: true, b1: true, hasEntriesTab: true });
    result.appended[0].children[0].attrs.onclick();
    result.scheduled[0].callback();
    expect(result.events).toEqual([['select', 'treatment'], ['select', 'wpisy'], ['scroll', 222, 'smooth'], ['focus', true]]);
  });
});
