import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate as settle } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { parse } = require('espree');
const auth = fs.readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const chrome = fs.readFileSync(new URL('../../vilda_chrome.js', import.meta.url), 'utf8');
function production(source, name, parentName) {
  const found = [];
  function walk(node, parent) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration') {
      if (node.id.name === name && (!parentName || parentName === parent)) found.push(source.slice(node.start, node.end));
      parent = node.id.name;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => walk(child, parent));
      else if (value && typeof value === 'object') walk(value, parent);
    }
  }
  walk(parse(source, { ecmaVersion: 'latest' }), null);
  if (found.length !== 1) throw Error(`${name}: ${found.length}`);
  return found[0];
}
const helpers = auth.slice(auth.indexOf('/* P-PRZYPOMNIENIA-STAN:'), auth.indexOf('async function tn('));
const inlineCode = helpers + ['Br', 'Rr', 'xe', 'remOdswiez'].map(name => production(auth, name)).join('\n');
const badgeCode = 'var RemBadgeSequence = 0;\n' + ['kt', 'E'].map(name => production(chrome, name)).join('\n');
const deferred = () => { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; };
const groups = title => [{ patientId: 'fictional', patientName: 'Fikcyjny Pacjent', notes: [{ id: 'fictional-note', title, category: 'followup', dueDateISO: '2026-10-28' }] }];

function element(tag = 'div', attributes = {}, children = []) {
  return { tag, id: attributes.id, attributes: { ...attributes }, style: {}, isConnected: true,
    textContent: attributes.text || '', children: [...children],
    get childNodes() { return this.children; },
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    removeAttribute(name) { delete this.attributes[name]; },
  };
}
const text = node => node.textContent + node.children.map(text).join(' ');
function environment(code = inlineCode) {
  const host = element('div', { id: 'remindersInline' });
  const button = element('button', { 'data-count': '5' }), badge = element('span');
  const classes = new Set(), frames = [], timers = [], lock = [], unlock = [];
  const state = { allowed: true, unlocked: true, userId: 'fictional-account' };
  const vault = { isUnlocked: () => state.unlocked, getCurrentUser: () => ({ userId: state.userId }),
    listPatientNotesDueByDate: vi.fn(async () => groups('TERAZ')),
    onLock: fn => lock.push(fn), onUnlock: fn => unlock.push(fn) };
  const doc = { documentElement: { classList: { contains: key => classes.has(key) } },
    getElementById: id => ({ remindersInline: host, vildaRemindersBtn: button, vildaRemindersBadge: badge })[id],
    querySelector: () => null };
  const win = { document: doc, innerWidth: 1440, VildaVault: vault, requestAnimationFrame: fn => frames.push(fn) };
  const context = vm.createContext({ i: win, r: win, o: doc, jt: () => win.VildaVault,
    Date: class extends Date { constructor(...args) { if (args.length) super(...args); else super(2026, 9, 28, 12, 0, 0); } },
    dl: () => state.allowed && state.unlocked, Fr: () => false,
    Fa: () => '2026-10-28', Jc: () => 0, e: element, ii: '',
    oe: node => { node.children = []; }, Qa9: list => list.map(item => element('row', { text: item.n.title })),
    oi: (kind, label, list) => list.length ? element('section', { text: label }, list) : null,
    Tr: vi.fn(), ul: vi.fn(), Nr: vi.fn(), Dr: vi.fn(), Ot: vi.fn(),
    ni: false, Ir: '2026-10-28', wn: vi.fn(), ze: 0,
    H: () => false, _t: vi.fn(), ve: vi.fn(), Nq: () => 'wpisów',
    clearTimeout: () => {}, setTimeout: fn => { timers.push(fn); return timers.length; },
  });
  vm.runInContext(code, context);
  return { context, host, button, badge, vault, state, classes, lock, unlock,
    flush: () => { while (frames.length) frames.shift()(); },
    flushTimers: () => { while (timers.length) timers.shift()(); } };
}

describe('production inline reminder read boundary', () => {
  it('distinguishes failed storage reads from a legitimately empty list and supports recovery', async () => {
    const e = environment();
    e.vault.listPatientNotesDueByDate.mockRejectedValueOnce(Error('FICTIONAL_READ_FAILURE'));
    await e.context.Br(e.host);
    expect(e.host.getAttribute('data-reminders-state')).toBe('error');
    expect(text(e.host)).toContain('Nie udało się wczytać przypomnień');
    expect(text(e.host)).toContain('Spróbuj ponownie');
    expect(text(e.host)).not.toContain('Brak przypomnień na dziś');
    expect(e.context.Tr).not.toHaveBeenCalled();
    expect(e.context.ul).not.toHaveBeenCalled();
    e.vault.listPatientNotesDueByDate.mockResolvedValueOnce([]);
    await e.context.Br(e.host);
    expect(e.host.getAttribute('data-reminders-state')).toBe('ready');
    expect(text(e.host)).toContain('Brak przypomnień na dziś');
    expect(e.context.Tr).toHaveBeenCalledWith(0);
  });

  it.each(['resolve', 'reject'])('a late older %s cannot replace a newer list', async completion => {
    const e = environment(), older = deferred(), newer = deferred();
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);
    const p = e.context.Br(e.host), q = e.context.Br(e.host);
    newer.resolve(groups('NOWSZA')); await q;
    if (completion === 'resolve') older.resolve(groups('STARSZA')); else older.reject(Error('OLD_ERROR'));
    await p;
    expect(text(e.host)).toContain('NOWSZA');
    expect(text(e.host)).not.toContain('STARSZA');
    expect(e.host.getAttribute('data-reminders-state')).toBe('ready');
    expect(e.context.Tr).toHaveBeenCalledTimes(1);
  });

  it('invalidates an old read as soon as a new refresh is queued, before the next animation frame', async () => {
    const e = environment(), older = deferred();
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => older.promise);
    const p = e.context.Br(e.host);
    e.context.xe(); older.resolve(groups('STARSZA')); await p;
    expect(text(e.host)).not.toContain('STARSZA');
    e.flush(); await settle();
    expect(text(e.host)).toContain('TERAZ');
  });

  it.each(['vilda-centile-live-reserved', 'vilda-centile-live-booting'])('%s suppresses data reads behind the chart', async cls => {
    const e = environment(); e.classes.add(cls);
    e.context.Rr();
    expect(e.vault.listPatientNotesDueByDate).not.toHaveBeenCalled();
    expect(e.host.style.display).toBe('none');
    e.classes.delete(cls); e.context.Rr(); await settle();
    expect(e.vault.listPatientNotesDueByDate).toHaveBeenCalledTimes(1);
    expect(text(e.host)).toContain('TERAZ');
  });

  it('a chart taking the slot during a read prevents any late repaint or count update', async () => {
    const e = environment(), pending = deferred();
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => pending.promise);
    const p = e.context.Br(e.host); e.classes.add('vilda-centile-live-reserved');
    pending.resolve(groups('UKRYTE')); await p;
    expect(e.host.children).toHaveLength(0);
    expect(e.context.Tr).not.toHaveBeenCalled();
  });

  it.each(['user', 'vault', 'lock-cycle', 'removed'])('rejects completion after a changed %s boundary', async change => {
    const e = environment(), pending = deferred();
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => pending.promise);
    const p = e.context.Br(e.host);
    if (change === 'user') e.state.userId = 'other-fictional-account';
    if (change === 'vault') e.context.i.VildaVault = { ...e.vault };
    if (change === 'lock-cycle') { e.lock.forEach(fn => fn()); e.unlock.forEach(fn => fn()); }
    if (change === 'removed') e.host.isConnected = false;
    pending.resolve(groups('STARE')); await p;
    expect(e.host.children).toHaveLength(0);
    expect(e.context.Tr).not.toHaveBeenCalled();
  });

  it('coalesces the mutation event and action callback into one read and paint', async () => {
    const e = environment(); e.context.xe(); e.context.remOdswiez();
    expect(e.vault.listPatientNotesDueByDate).not.toHaveBeenCalled();
    e.flush(); await settle();
    expect(e.vault.listPatientNotesDueByDate).toHaveBeenCalledTimes(1);
    expect(e.context.Tr).toHaveBeenCalledTimes(1);
  });

  it('repeated layout changes keep the ready rows and only measure their height', async () => {
    const e = environment(); await e.context.Br(e.host);
    const first = e.host.children[0]; e.vault.listPatientNotesDueByDate.mockClear();
    for (let n = 0; n < 5; n++) e.context.remInlineLayout();
    e.flush(); await settle();
    expect(e.host.children[0]).toBe(first);
    expect(e.vault.listPatientNotesDueByDate).not.toHaveBeenCalled();
    expect(e.context.Dr).toHaveBeenCalledTimes(5);
  });

  it('resizing an initially pending card does not launch another read', async () => {
    const e = environment(), pending = deferred();
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => pending.promise);
    const p = e.context.Br(e.host);
    e.context.remInlineLayout(); e.context.remInlineLayout(); e.flush();
    expect(e.vault.listPatientNotesDueByDate).toHaveBeenCalledTimes(1);
    pending.resolve(groups('TERAZ')); await p;
  });

  it('immediately clears the already-rendered list on lock, even before the scheduled frame', async () => {
    const e = environment(); await e.context.Br(e.host);
    expect(e.host.children).not.toHaveLength(0);
    e.state.unlocked = false; e.lock.forEach(fn => fn());
    expect(e.host.children).toHaveLength(0);
    expect(e.host.style.display).toBe('none');
  });

  it('does not retain the previous account rows while the new account read is pending', async () => {
    const e = environment(); await e.context.Br(e.host);
    const pending = deferred(); e.state.userId = 'other-fictional-account';
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => pending.promise);
    const p = e.context.Br(e.host);
    expect(e.host.children).toHaveLength(0);
    pending.resolve(groups('NOWE_KONTO')); await p;
    expect(text(e.host)).toContain('NOWE_KONTO');
  });
});

describe('production fullscreen reminder refresh', () => {
  function modal() {
    const e = environment();
    Object.assign(e.context, { s: element('dialog'), R: element(), a: { onClose: vi.fn() }, et: vi.fn() });
    e.context.Qc0 = vi.fn(() => { e.context.s.isConnected = false; });
    vm.runInContext(production(auth, 'H', 'Mr'), e.context);
    return e;
  }

  it('a failed refresh keeps the dialog open with a retry and recovers', async () => {
    const e = modal(); e.vault.listPatientNotesDueByDate.mockRejectedValueOnce(Error('READ_FAILURE'));
    await e.context.H();
    expect(e.context.Qc0).not.toHaveBeenCalled();
    expect(text(e.context.R)).toContain('Nie udało się wczytać przypomnień');
    await e.context.H(); expect(e.context.et).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'])('a late older %s cannot clear or replace a newer fullscreen list', async completion => {
    const e = modal(), older = deferred(), newer = deferred();
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);
    const p = e.context.H(), q = e.context.H(); newer.resolve(groups('NOWSZA')); await q;
    if (completion === 'resolve') older.resolve([]); else older.reject(Error('OLD_FAILURE'));
    await p;
    expect(e.context.et).toHaveBeenCalledTimes(1);
    expect(e.context.et.mock.calls[0][0][0].notes[0].title).toBe('NOWSZA');
    expect(e.context.Qc0).not.toHaveBeenCalled();
    expect(e.context.R.children).toHaveLength(0);
  });

  it('does not repaint after the modal is closed', async () => {
    const e = modal(), pending = deferred();
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => pending.promise);
    const p = e.context.H(); e.context.s.isConnected = false; pending.resolve(groups('STARE')); await p;
    expect(e.context.et).not.toHaveBeenCalled();
  });
});

describe('production reminder badge read boundary', () => {
  it('shows an error marker and retains the last count instead of caching a false zero', async () => {
    const e = environment(badgeCode);
    e.vault.listPatientNotesDueByDate.mockRejectedValueOnce(Error('FICTIONAL_READ_FAILURE'));
    await e.context.kt();
    expect(e.button.getAttribute('data-state')).toBe('error');
    expect(e.button.getAttribute('data-count')).toBe('5');
    expect(e.badge.textContent).toBe('?');
    expect(e.context.ve).not.toHaveBeenCalled();
    await e.context.kt();
    expect(e.button.getAttribute('data-state')).toBe('today');
    expect(e.badge.textContent).toBe('1');
    expect(e.context.ve).toHaveBeenCalledWith(1, 'today');
  });

  it.each(['resolve', 'reject'])('ignores an older %s after a newer zero result', async completion => {
    const e = environment(badgeCode), older = deferred(), newer = deferred();
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);
    const p = e.context.kt(), q = e.context.kt(); newer.resolve([]); await q;
    if (completion === 'resolve') older.resolve(groups('STARE')); else older.reject(Error('OLD_ERROR'));
    await p;
    expect(e.button.getAttribute('data-state')).toBe('empty');
    expect(e.badge.textContent).toBe('');
    expect(e.context.ve).toHaveBeenCalledTimes(1);
  });

  it('invalidates the pending badge read immediately when a newer refresh is scheduled', async () => {
    const e = environment(badgeCode), pending = deferred();
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => pending.promise);
    const p = e.context.kt(); e.context.E(); pending.resolve([]); await p;
    expect(e.context.ve).not.toHaveBeenCalled();
    e.flushTimers(); await settle();
    expect(e.button.getAttribute('data-count')).toBe('1');
  });

  it('cannot publish a count from the previous account', async () => {
    const e = environment(badgeCode), pending = deferred();
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => pending.promise);
    const p = e.context.kt(); e.state.userId = 'other-fictional-account'; pending.resolve(groups('STARE')); await p;
    expect(e.context.ve).not.toHaveBeenCalled();
  });
});

describe('production manually requested reminder sheet', () => {
  function sheet() {
    const e = environment();
    Object.assign(e.context, { rl: () => null, Er: () => false, Sr: 'shown', ei: 'closed',
      wn: vi.fn(async () => {}), Mr: vi.fn(), ol: vi.fn(), nakladkaOtwarta: () => false,
      arkuszCzekaWyzej: () => false, lekarzPisze: () => true,
      ponowArkuszPoZamknieciu: vi.fn(), ponowArkuszPoPrzerwie: vi.fn(), remShowReadError: vi.fn() });
    vm.runInContext(production(auth, 'tn'), e.context);
    return e;
  }

  it('automatic sync refresh cannot cancel the explicit bell click while the doctor is typing', async () => {
    const e = sheet(), pending = deferred();
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => pending.promise);
    const forced = e.context.tn({ force: true });
    expect(await e.context.tn()).toBe(false);
    expect(e.vault.listPatientNotesDueByDate).toHaveBeenCalledTimes(1);
    pending.resolve(groups('RĘCZNE')); expect(await forced).toBe(true);
    expect(e.context.Mr).toHaveBeenCalledTimes(1);
    expect(e.context.ponowArkuszPoPrzerwie).not.toHaveBeenCalled();
  });

  it('a newer manual opening supersedes an earlier manual read', async () => {
    const e = sheet(), older = deferred(), manual = deferred();
    e.context.lekarzPisze = () => false;
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => manual.promise);
    const first = e.context.tn({ force: true }); await settle();
    const second = e.context.tn({ force: true });
    manual.resolve(groups('RĘCZNE')); expect(await second).toBe(true);
    older.resolve(groups('STARSZE RĘCZNE')); expect(await first).toBe(false);
    expect(e.context.Mr).toHaveBeenCalledTimes(1);
    expect(e.context.Mr.mock.calls[0][0][0].notes[0].title).toBe('RĘCZNE');
  });

  it.each([undefined, {}, { force: false }])('an unsolicited call (%j) does not start sync, read data, or schedule an opening', async options => {
    const e = sheet();
    e.context.lekarzPisze = () => false;
    expect(await e.context.tn(options)).toBe(false);
    expect(e.context.wn).not.toHaveBeenCalled();
    expect(e.vault.listPatientNotesDueByDate).not.toHaveBeenCalled();
    expect(e.context.Mr).not.toHaveBeenCalled();
    expect(e.context.ponowArkuszPoZamknieciu).not.toHaveBeenCalled();
    expect(e.context.ponowArkuszPoPrzerwie).not.toHaveBeenCalled();
  });

  it('a fresh second device needs no daily marker from the first device and the bell still opens repeatedly', async () => {
    const first = sheet(), second = sheet();
    for (const e of [first, second]) {
      e.context.lekarzPisze = () => false;
      expect(await e.context.tn()).toBe(false);
      expect(e.context.wn).not.toHaveBeenCalled();
      expect(e.vault.listPatientNotesDueByDate).not.toHaveBeenCalled();
      expect(await e.context.tn({ force: true })).toBe(true);
      expect(await e.context.tn({ force: true })).toBe(true);
      expect(e.context.Mr).toHaveBeenCalledTimes(2);
    }
  });

  it('a failed manual read releases its priority and permits retry', async () => {
    const e = sheet(); e.vault.listPatientNotesDueByDate.mockRejectedValueOnce(Error('READ_FAILURE'));
    expect(await e.context.tn({ force: true })).toBe(false);
    expect(e.context.remShowReadError).toHaveBeenCalledTimes(1);
    expect(await e.context.tn({ force: true })).toBe(true);
    expect(e.context.Mr).toHaveBeenCalledTimes(1);
  });
});
