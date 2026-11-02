import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'espree';
import { describe, expect, it, vi } from 'vitest';

const source = fs.readFileSync(new URL('../../vilda_terminarz.js', import.meta.url), 'utf8');
const declarations = new Map();
function collect(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration') declarations.set(node.id.name, source.slice(node.start, node.end));
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') collect(value);
  }
}
collect(parse(source, { ecmaVersion: 'latest' }));
const program = ['TzCalendarTarget', 'TzTargetCurrent', 'TzTargetAuth', 'TzReceiveTarget']
  .map(name => { if (!declarations.has(name)) throw new Error('Missing production receiver ' + name); return declarations.get(name); }).join('\n');
const target = id => 'https://fictional.invalid/terminarz.html#vilda-event=' + encodeURIComponent(id) + '&vilda-search-return=fictional-token';

function receiver(resolve = async () => ({ expectedNoteId: 'fictional-a', expectedPatientId: 'fictional-patient', isCurrent: () => true, onReturn() {} })) {
  const open = vi.fn(async () => ({ opened: true })), unavailable = vi.fn(() => false);
  const auth = { isBootReady: () => true, resolveSearchCalendarTarget: vi.fn(resolve) };
  const win = { URL, location: new URL('https://fictional.invalid/terminarz.html'), VildaAuthUI: auth, setTimeout };
  win.top = win;
  const context = vm.createContext({ w: win, URL, URLSearchParams, Promise, TzTargetSequence: 0,
    Nt: () => true, TzOpenEvent: open, TzUnavailableTarget: unavailable });
  vm.runInContext(program, context);
  return { context, win, auth, open, unavailable, receive: (href, guard) => context.TzReceiveTarget(href, guard) };
}

describe('the actual calendar receiver binds a URL target to its owning return ticket', () => {
  it('passes only the authorized exact ID and bridge callbacks into the independently tested calendar API', async () => {
    const test = receiver();
    expect(await test.receive(target('fictional-a'), () => true)).toBe(true);
    expect(test.auth.resolveSearchCalendarTarget).toHaveBeenCalledWith('fictional-token');
    expect(test.open).toHaveBeenCalledTimes(1);
    const options = test.open.mock.calls[0][0];
    expect(options).toMatchObject({ noteId: 'fictional-a', expectedPatientId: 'fictional-patient', returnToken: 'fictional-token' });
    expect(options.isCurrent()).toBe(true);
    expect(typeof options.onReturn).toBe('function');
  });

  it('prefers the explicit top owner instead of resolving the ticket in another iframe AuthUI', async () => {
    const test = receiver();
    const topResolve = vi.fn(async () => ({ expectedNoteId: 'fictional-a', isCurrent: () => true }));
    test.win.top = { VildaAuthUI: { isBootReady: () => true, resolveSearchCalendarTarget: topResolve } };
    expect(await test.receive(target('fictional-a'), () => true)).toBe(true);
    expect(topResolve).toHaveBeenCalledWith('fictional-token');
    expect(test.auth.resolveSearchCalendarTarget).not.toHaveBeenCalled();
  });

  it.each(['fictional-other-note', 'fictional-a&vilda-event=fictional-b'])('rejects a changed URL ID %s under a valid ticket before reading that note', async id => {
    const test = receiver();
    expect(await test.receive(target(id), () => true)).toBe(false);
    expect(test.open).not.toHaveBeenCalled();
    expect(test.unavailable).toHaveBeenCalledTimes(1);
  });

  it('reports an unavailable ticket without opening an event or an editor', async () => {
    const test = receiver(async () => null);
    expect(await test.receive(target('fictional-a'), () => true)).toBe(false);
    expect(test.open).not.toHaveBeenCalled();
    expect(test.unavailable).toHaveBeenCalledTimes(1);
  });

  it('discards a delayed bridge after shell navigation or ticket ownership was revoked', async () => {
    let release;
    const pendingBridge = new Promise(resolve => { release = resolve; });
    const test = receiver(() => pendingBridge);
    let current = true;
    const pending = test.receive(target('fictional-a'), () => current);
    current = false;
    release({ expectedNoteId: 'fictional-a', isCurrent: () => true });
    expect(await pending).toBe(false);
    expect(test.open).not.toHaveBeenCalled();
    expect(test.unavailable).not.toHaveBeenCalled();
  });

  it('rejects a different origin and unexpected fragment fields before touching the bridge', async () => {
    const test = receiver();
    for (const href of [target('fictional-a').replace('fictional.invalid', 'different.invalid'), target('fictional-a') + '&query=fictional-name']) {
      expect(await test.receive(href, () => true)).toBe(false);
    }
    expect(test.auth.resolveSearchCalendarTarget).not.toHaveBeenCalled();
    expect(test.open).not.toHaveBeenCalled();
  });
});
