import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'espree';
import { describe, expect, it, vi } from 'vitest';
import { applyHomeRemindersHooks, reverseHomeRemindersHooks, verifyHomeRemindersHooks, HOME_REMINDERS_AUTH_BASE_SHA256 } from '../../tools/home-reminders-auth-hooks.mjs';

const source = fs.readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const baseline = reverseHomeRemindersHooks(source);
const functions = [];
const stack = [[parse(source, { ecmaVersion: 'latest', range: true }), null]];
while (stack.length) {
  const [node, parent] = stack.pop();
  if (!node || typeof node !== 'object') continue;
  let next = parent;
  if (node.type === 'FunctionDeclaration') { functions.push({ name: node.id.name, parent, text: source.slice(...node.range) }); next = node.id.name; }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) stack.push(...value.map(child => [child, next]));
    else if (value && typeof value === 'object') stack.push([value, next]);
  }
}
function production(name, parent) {
  const found = functions.filter(fn => fn.name === name && (!parent || fn.parent === parent));
  if (found.length !== 1) throw Error('Ambiguous production function: ' + name);
  return found[0].text;
}
function environment() {
  const flags = new Set(['vilda-centile-live-reserved', 'vilda-centile-live-booting']);
  const state = { moved: true, marker: 'true', pro: true, unlocked: true, reader: true };
  const host = { id: 'remindersInline', isConnected: true, style: { height: '700px', minHeight: '700px', maxHeight: '700px' },
    getAttribute: () => state.marker, closest: () => state.moved ? {} : null,
    getClientRects: () => [1], getBoundingClientRect: () => ({ top: 500 }) };
  const doc = { documentElement: { classList: { contains: flag => flags.has(flag) } }, getElementById: () => host,
    querySelector: () => ({ offsetHeight: 900, getBoundingClientRect: () => ({ bottom: 900 }) }) };
  host.ownerDocument = doc;
  const vault = { isUnlocked: () => state.unlocked, get listPatientNotesDueByDate() { return state.reader ? () => [] : undefined; } };
  const win = { document: doc, __VILDA_HOME_WORKSPACE_PREVIEW__: true, VildaHomeRemindersPresentation: { decorate() {} }, innerWidth: 390 };
  const context = vm.createContext({ i: win, jt: () => vault, ll: () => state.pro, Lr: () => true, sl: () => false });
  vm.runInContext(['HomeRemindersInlineEnabled', 'HomeRemindersPresentationRequested', 'dl', 'remInlineReserved', 'Dr'].map(name => production(name)).join('\n'), context);
  return { context, win, host, doc, vault, state };
}

describe('optional home reminders native presentation boundary', () => {
  it('reverses to the exact native B1 artifact and replays idempotently without changing writers', () => {
    expect(createHash('sha256').update(baseline).digest('hex')).toBe(HOME_REMINDERS_AUTH_BASE_SHA256);
    expect(applyHomeRemindersHooks(baseline)).toBe(source);
    expect(applyHomeRemindersHooks(source)).toBe(source);
    expect(verifyHomeRemindersHooks(source).base).toBe(baseline);
    const cwd = fileURLToPath(new URL('../..', import.meta.url));
    expect(execFileSync(process.execPath, ['tools/patient_b1_auth_hooks.mjs', '--check'], { cwd, encoding: 'utf8' })).toContain('clinical builders preserved');
  });
  it('keeps placement gates unless the exact original host is explicitly moved and the presentation is available', () => {
    const e = environment();
    expect(e.context.dl()).toBe(true); expect(e.context.remInlineReserved()).toBe(false);
    for (const change of [() => { e.state.moved = false; }, () => { e.state.marker = 'false'; },
      () => { e.host.id = 'other'; }, () => { e.host.isConnected = false; },
      () => { e.win.__VILDA_HOME_WORKSPACE_PREVIEW__ = false; }, () => { e.win.VildaHomeRemindersPresentation = null; }]) {
      const original = { ...e.state }; change();
      expect(e.context.dl()).toBe(false); expect(e.context.remInlineReserved()).toBe(true);
      Object.assign(e.state, original); e.host.id = 'remindersInline'; e.host.isConnected = true;
      e.win.__VILDA_HOME_WORKSPACE_PREVIEW__ = true; e.win.VildaHomeRemindersPresentation = { decorate() {} };
    }
  });
  it('does not bypass account/PRO/reader requirements and releases only the legacy dimensions for the opted-in host', () => {
    const e = environment();
    for (const key of ['pro', 'unlocked', 'reader']) { e.state[key] = false; expect(e.context.dl()).toBe(false); e.state[key] = true; }
    e.context.Dr(e.host); expect(e.host.style).toEqual({ height: '', minHeight: '', maxHeight: '' });
    e.state.marker = 'false'; e.win.innerWidth = 1440; e.context.Dr(e.host);
    expect(e.host.style).toEqual({ height: '400px', minHeight: '400px', maxHeight: '400px' });
  });
  it('carries an explicit presentation request to the top document and preserves default request options', () => {
    const opened = vi.fn(), opts = { newReminder: true }, ctx = vm.createContext({
      HomeRemindersRequested: true, HomeRemindersContext: null, options: {}, i: { top: { VildaAuthUI: { maybeShowReminders: opened } } },
    });
    vm.runInContext(production('remB22Request') + '\n' + production('HomeRemindersRequest', 'remB22Create'), ctx);
    ctx.HomeRemindersRequest(opts); expect(opened).toHaveBeenLastCalledWith({ force: true, newReminder: true, homePresentation: true, homeContext: null, contextLabel: '', showPatientName: true });
    expect(opts).toEqual({ newReminder: true });
    ctx.HomeRemindersRequested = false; ctx.HomeRemindersRequest(opts);
    expect(opened).toHaveBeenLastCalledWith({ force: true, newReminder: true });
  });
  it('retains a busy native dialog and changes presentation only after an idle dialog can close', () => {
    const previous = { alive: () => true, homePresentation: false, homeContext: null, root: {}, request: vi.fn(), close: vi.fn(), canChangePresentation: () => false };
    const root = { setAttribute: vi.fn(), showModal: vi.fn(), querySelector: () => ({ focus: vi.fn() }) };
    const next = { setGroups: vi.fn(), request: vi.fn(), fit: vi.fn() }, create = vi.fn(() => next);
    const ctx = vm.createContext({ remB22Full: previous, al: vi.fn(), remB22Node: () => root, remB22Create: create,
      zamknijPisaniePodArkuszem: vi.fn(), i: { __VILDA_HOME_WORKSPACE_PREVIEW__: true, VildaHomeRemindersPresentation: { decorate() {} },
        document: { body: { appendChild: vi.fn(), classList: { add: vi.fn() } } } } });
    vm.runInContext(production('HomeRemindersPresentationRequested') + '\n' + production('remB22Open'), ctx);
    expect(ctx.remB22Open([], {})).toBe(previous.root); expect(previous.request).toHaveBeenCalledWith({});
    expect(ctx.remB22Open([], { homePresentation: true })).toBe(previous.root);
    expect(previous.close).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
    previous.canChangePresentation = () => true;
    expect(ctx.remB22Open([], { homePresentation: true })).toBe(root);
    expect(previous.close).toHaveBeenCalledOnce(); expect(create).toHaveBeenCalledWith(root, true, { homePresentation: true });
    expect(next.setGroups).toHaveBeenCalledWith([]); expect(next.request).toHaveBeenCalledWith({ homePresentation: true });
  });
  it('reuses the complete native detail body with no changed action or writer predicate', () => {
    const start = baseline.indexOf('  function renderDetail() {'), end = baseline.indexOf('  async function selectLinked(', start);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    const original = baseline.slice(start, end).trim().replace('function renderDetail() {', 'function HomeRemindersRenderDetail(detail, row) {')
      .replace('clear(detail); detail.scrollTop = 0; var row = currentRow();', 'clear(detail); detail.scrollTop = 0;')
      .replaceAll('remB22Request(', 'HomeRemindersRequest(')
      .replaceAll('ga(', 'HomeRemindersOpenEditor(')
      .replace("        close(); HomeRemindersOpenEditor({ patientId: note.patientId, note: note, onSaved: function () { HomeRemindersRequest({ noteId: note.id }); } });",
        "        var homeReturn = HomeRemindersContext ? HomeRemindersPosition() : null;\n        close(); HomeRemindersOpenEditor({ patientId: note.patientId, note: note, onSaved: function () { HomeRemindersRequest({ noteId: note.id }); },\n          onCancel: homeReturn ? function () { HomeRemindersRequest({ homePosition: homeReturn }); } : undefined });")
      .replace('if (!row) {', 'if (!row || !HomeRemindersOwnRow(row)) {')
      .replace('if (!saved && !note.completedAtISO', 'if (!HomeRemindersContext && !saved && !note.completedAtISO')
      .replace('if (state.busy) return; more.open = false;', 'if (state.busy || !alive() || !HomeRemindersOwnRow(row)) return; more.open = false;');
    expect(production('HomeRemindersRenderDetail', 'remB22Create')).toBe(original);
  });
  it('produces at most two actual native card nodes, full totals and native formatted labels without a read/write', () => {
    const rows = [
      { n: { id: 'qa-1', title: 'Fikcyjny krok planu', dueDateISO: '2026-11-16', careContext: { planId: 'qa-plan' } } },
      { n: { id: 'qa-2', title: 'Fikcyjny wynik', dueDateISO: '2026-11-18', category: 'wynik-badania' } },
      { n: { id: 'qa-3', title: 'Fikcyjny termin', dueDateISO: '2026-11-19', category: 'followup' } },
    ];
    const nodes = rows.map(row => ({ dataset: { noteId: row.n.id }, classList: { contains: () => false } })), render = vi.fn(), detail = vi.fn();
    let current = true;
    const ctx = vm.createContext({ HomeRemindersPresentation: { render }, HomeRemindersUpdating: false,
      alive: () => current, visible: () => rows, full: false, options: {},
      HomeRemindersReadPhase: 'ready', HomeRemindersHistoryReadPhase: 'ready', root: { classList: { contains: () => false } },
      state: { tab: 'active', rows, busy: false, editing: false, historyLoading: false, historyLimit: 50, savedOutcome: null },
      list: { querySelectorAll: () => nodes, children: nodes }, Fa: () => '2026-11-18',
      detail: { children: [] },
      Jv: () => ({ label: 'Natywna kategoria QA' }), make: () => ({ dataset: {} }), HomeRemindersRenderDetail: detail,
      Ot: (name, error) => { throw error; } });
    vm.runInContext(['remB22Day', 'remB22Date', 'remA7DaysLate', 'remA7Category'].map(name => production(name)).join('\n')
      + '\n' + production('status', 'remB22Create') + '\n' + production('HomeRemindersDateParts', 'remB22Create')
      + '\n' + production('HomeRemindersUpdate', 'remB22Create'), ctx);
    ctx.HomeRemindersUpdate(); const snapshot = render.mock.calls[0][0];
    expect(snapshot.total).toBe(3); expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.entries[0].node).toBe(nodes[0]); expect(snapshot.entries[0]).toMatchObject({ sourceLabel: 'Plan opieki', dateLabel: '16.11.2026', dateParts: { day: '16', month: 'lis' }, statusLabel: '2 dni po terminie' });
    expect(snapshot.entries[1].sourceLabel).toBe('Oczekujący wynik'); expect(detail).not.toHaveBeenCalled();
    ctx.full = true; ctx.state.detached = rows[0]; ctx.state.selected = 'qa-1'; ctx.root.classList.contains = () => true;
    ctx.HomeRemindersUpdate(); expect(render.mock.calls[1][0].entries).toHaveLength(3); expect(detail).toHaveBeenCalledTimes(3);
    expect(render.mock.calls[1][0]).toMatchObject({ inlineFormEditing: true, detachedDetailVisible: true });
    expect(detail.mock.calls[0][1]).toBe(rows[0]);
    ctx.full = false; ctx.root.classList.contains = () => false; ctx.HomeRemindersReadPhase = 'loading'; ctx.HomeRemindersUpdate();
    expect(render.mock.calls[2][0]).toMatchObject({ phase: 'loading', total: null, inlineFormEditing: false, detachedDetailVisible: false });
    const feedback = { classList: { contains: name => name === 'vb22-error' } }, retry = { classList: { contains: name => name === 'vb22-text' } };
    ctx.detail.children = [feedback]; ctx.list.children = [retry];
    ctx.HomeRemindersReadPhase = 'error'; ctx.HomeRemindersUpdate();
    expect(render.mock.calls[3][0]).toMatchObject({ phase: 'error', total: null }); expect(render.mock.calls[3][0].feedbackNodes[0]).toBe(feedback);
    expect(render.mock.calls[3][0].tailNodes[0]).toBe(retry);
    ctx.HomeRemindersReadPhase = 'ready'; ctx.state.savedOutcome = { awaitingRead: true, readError: false }; ctx.HomeRemindersUpdate();
    expect(render.mock.calls[4][0]).toMatchObject({ phase: 'partial', total: null });
    ctx.detail.children = []; ctx.list.children = [feedback, retry];
    ctx.state.savedOutcome = null; ctx.state.tab = 'history'; ctx.HomeRemindersHistoryReadPhase = 'error'; ctx.HomeRemindersUpdate();
    expect(render.mock.calls[5][0]).toMatchObject({ phase: 'error', total: null });
    expect(render.mock.calls[5][0].feedbackNodes[0]).toBe(feedback);
    current = false; ctx.HomeRemindersUpdate(); expect(render).toHaveBeenCalledTimes(6);
  });
  it('publishes a failed native history read after its own error and retry nodes, then recovers', async () => {
    const errorNode = {}, retryNode = {}, list = { children: [], appendChild(node) { this.children.push(node); } };
    const update = vi.fn(), read = vi.fn().mockRejectedValueOnce(Error('FICTIONAL_HISTORY_READ')).mockResolvedValueOnce([]);
    const ctx = vm.createContext({ sequence: 0, searchNavigation: null, careReturn: null, full: true, search: {}, list,
      HomeRemindersHistoryReadPhase: 'loading', HomeRemindersUpdate: update, HomeRemindersContext: null,
      state: { tab: 'active', historyReady: false, historyLoading: false, editing: false, history: [] },
      root: { classList: { remove() {} } }, alive: () => true, vault: { listReminderHistory: read },
      render: vi.fn(), report: () => list.appendChild(errorNode), textButton: () => retryNode, remA7DatedRow: vi.fn() });
    vm.runInContext(production('HomeRemindersOwnNote', 'remB22Create') + '\n' + production('loadHistory', 'remB22Create') + '\n' + production('switchTab', 'remB22Create'), ctx);
    await ctx.switchTab('history');
    expect(ctx.HomeRemindersHistoryReadPhase).toBe('error'); expect(ctx.state.historyReady).toBe(false);
    expect(list.children).toEqual([errorNode, retryNode]); expect(update).toHaveBeenCalledOnce();
    await ctx.switchTab('history');
    expect(read).toHaveBeenCalledTimes(2); expect(ctx.HomeRemindersHistoryReadPhase).toBe('ready'); expect(ctx.state.historyReady).toBe(true);
  });
  it('disposes presentation and nested-dialog callbacks once without preventing native cleanup', () => {
    const child = vi.fn(), destroy = vi.fn(() => { throw Error('Fikcyjny błąd dekoratora'); }), logged = vi.fn();
    const ctx = vm.createContext({ HomeRemindersPresentation: { destroy }, HomeRemindersMainCleanup: null, HomeRemindersOutcomeCleanup: child, Ot: logged });
    vm.runInContext(production('HomeRemindersClearOutcome', 'remB22Create') + '\n' + production('HomeRemindersDispose', 'remB22Create'), ctx);
    ctx.HomeRemindersDispose(); ctx.HomeRemindersDispose(); expect(child).toHaveBeenCalledOnce(); expect(destroy).toHaveBeenCalledOnce();
    expect(ctx.HomeRemindersPresentation).toBeNull(); expect(ctx.HomeRemindersOutcomeCleanup).toBeNull(); expect(logged).toHaveBeenCalledOnce();
  });
});
