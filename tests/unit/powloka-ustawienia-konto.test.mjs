import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

// Wykonujemy rzeczywisty blok inline Ustawień, bez kopii parsera URL/sekcji.
const html = readFileSync(new URL('../../ustawienia.html', import.meta.url), 'utf8');
const production = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .find((match) => match[1].includes('function openSectionFromHash'))?.[1];
if (!production) throw new Error('Brak produkcyjnego inicjalizatora sekcji Ustawień.');
const locksProduction = readFileSync(new URL('../../inline_ustawienia_07.js', import.meta.url), 'utf8');

function ustawienia(hash = '', locked = false, authLifecycle = false) {
  const events = new Map();
  const documentEvents = new Map();
  const sections = new Map();
  const unlockListeners = [];
  const timers = new Map();
  const trace = [];
  let timerId = 0;
  let unlocked = false;
  const schedule = (fn) => { const id = ++timerId; timers.set(id, fn); return id; };
  function flush() {
    for (let count = 0; timers.size; count++) {
      if (count > 20) throw new Error('Nieograniczony polling celu Ustawień.');
      const [id, fn] = timers.entries().next().value;
      timers.delete(id);
      fn();
    }
  }
  for (const id of ['settings-section-account', 'settings-section-appearance', 'settings-section-pro', 'dangerZoneAccordion']) {
    const classes = new Set(id.startsWith('settings-section-') ? ['settings-accordion'] : []);
    if (locked && id !== 'settings-section-appearance') classes.add('settings-accordion--locked');
    let open = false;
    const children = [];
    const summary = {
      addEventListener() {}, removeEventListener() {},
      appendChild: (child) => children.push(child),
      querySelector: () => children.find((child) => child.className === 'settings-lock-tip') || null,
      closest: () => sections.get(id),
    };
    const chevron = { innerHTML: '⌄' };
    sections.set(id, {
      id,
      get open() { return open; },
      set open(value) {
        open = value;
        trace.push({ id, open: value, locked: classes.has('settings-accordion--locked'), unlocked });
      },
      classList: {
        contains: (name) => classes.has(name),
        add: (name) => classes.add(name), remove: (name) => classes.delete(name),
      },
      querySelector: (selector) => selector === 'summary' ? summary : chevron,
      summary,
      scrollIntoView: vi.fn(),
    });
  }
  const window = {
    URL,
    setTimeout: schedule,
    location: new URL(`https://vilda.test/aplikacja/ustawienia.html?embedded=1${hash}`),
    addEventListener: (name, listener) => events.set(name, listener),
  };
  if (authLifecycle) window.VildaVault = {
    isUnlocked: () => unlocked,
    onUnlock: (listener) => unlockListeners.push(listener),
  };
  const document = {
    readyState: 'loading',
    addEventListener: (name, listener) => {
      if (!documentEvents.has(name)) documentEvents.set(name, []);
      documentEvents.get(name).push(listener);
    },
    querySelectorAll: () => [...sections.values()].filter((s) => s.id.startsWith('settings-section-')),
    getElementById: (id) => sections.get(id) || null,
    querySelector: () => null,
    createElement: () => ({ classList: { add() {}, remove() {} } }),
  };
  const context = vm.createContext({ window, document, URL, decodeURIComponent,
    setTimeout: schedule, clearTimeout: (id) => timers.delete(id) });
  vm.runInContext(production, context);
  if (authLifecycle) vm.runInContext(locksProduction, context);
  documentEvents.get('DOMContentLoaded').forEach((listener) => listener());
  flush();
  function target(href) {
    const listener = events.get('vilda:shell-navigate-target');
    expect(listener, 'Ustawienia odbierają cel wejścia z powłoki po inicjalizacji').toBeTypeOf('function');
    listener({ detail: { href } });
    flush();
  }
  function unlock() { unlocked = true; unlockListeners.forEach((listener) => listener()); flush(); }
  function choose(id) {
    const summary = sections.get(id).summary;
    for (const listener of documentEvents.get('click') || []) {
      listener({ isTrusted: true, target: { closest: (selector) => selector.includes('summary') ? summary : null } });
    }
    flush();
  }
  return { sections, window, events, target, unlock, choose, flush, trace, account: sections.get('settings-section-account') };
}

describe('A4: ten sam handler sekcji dla samodzielnych Ustawień i ciepłej powłoki', () => {
  it('początkowy hash nadal otwiera konto i przewija do niego', () => {
    const ui = ustawienia('#settings-section-account');
    expect(ui.account.open).toBe(true);
    expect(ui.account.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: 'instant' });
  });

  it('początkowy hash nie otwiera zamkniętej sekcji konta', () => {
    const ui = ustawienia('#settings-section-account', true);
    expect(ui.account.open).toBe(false);
    expect(ui.account.scrollIntoView).not.toHaveBeenCalled();
  });

  it('malformed hash nie wyłącza późniejszego hashchange', () => {
    const ui = ustawienia('#%E0%A4%A');
    ui.window.location.hash = '#settings-section-account';
    ui.events.get('hashchange')({ type: 'hashchange' });
    ui.flush();
    expect(ui.account.open).toBe(true);
  });

  it('początkowy hash przetrwa realną inicjalizację kłódek i otworzy konto po onUnlock', () => {
    const ui = ustawienia('#settings-section-account', false, true);
    expect(ui.account.classList.contains('settings-accordion--locked')).toBe(true);
    expect(ui.account.open).toBe(false);
    ui.unlock();
    expect(ui.account.classList.contains('settings-accordion--locked')).toBe(false);
    expect(ui.account.open, 'onUnlock usuwa kłódkę, a target sekcji nie może zginąć').toBe(true);
  });

  it('cold target shell pozostaje pod prawdziwą kłódką i realizuje się dopiero po onUnlock', () => {
    const ui = ustawienia('', false, true);
    ui.target('/aplikacja/ustawienia.html#settings-section-account');
    expect(ui.account.open).toBe(false);
    ui.unlock();
    expect(ui.account.open).toBe(true);
    expect(ui.account.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: 'instant' });
  });

  it('wybór innej sekcji anuluje oczekujące konto przed onUnlock', () => {
    const ui = ustawienia('', false, true);
    ui.target('/aplikacja/ustawienia.html#settings-section-account');
    ui.choose('settings-section-appearance');
    ui.unlock();
    expect(ui.account.open).toBe(false);
    expect(ui.account.scrollIntoView).not.toHaveBeenCalled();
  });

  it('nowszy hash zastępuje oczekujące konto przed onUnlock', () => {
    const ui = ustawienia('#settings-section-account', false, true);
    ui.window.location.hash = '#settings-section-appearance';
    ui.events.get('hashchange')({ type: 'hashchange' });
    ui.flush();
    ui.unlock();
    expect(ui.account.open).toBe(false);
    expect(ui.sections.get('settings-section-appearance').open).toBe(true);
  });

  it('cel konta otwiera sekcję w nowym dokumencie bez dodawania hashu ramki', () => {
    const ui = ustawienia();
    ui.target('/aplikacja/ustawienia.html#settings-section-account');
    expect(ui.account.open).toBe(true);
    expect(ui.account.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: 'instant' });
    expect(ui.window.location.hash).toBe('');
  });

  it('cel zastępuje bieżące miejsce w ciepłych Ustawieniach i działa ponownie przy Forward', () => {
    const ui = ustawienia('#settings-section-appearance');
    ui.target('ustawienia.html#settings%2Dsection%2Daccount');
    expect(ui.account.open).toBe(true);
    expect(ui.window.location.hash).toBe('#settings-section-appearance');
    ui.account.open = false;
    ui.target('/aplikacja/ustawienia.html#settings-section-account');
    expect(ui.account.open).toBe(true);
    expect(ui.account.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it.each(['settings-section-account', 'settings-section-pro'])(
    'zdarzenie powłoki nie omija istniejącej kłódki %s', (id) => {
      const ui = ustawienia('', true);
      ui.target(`/aplikacja/ustawienia.html#${id}`);
      const section = ui.sections.get(id);
      expect(section.open).toBe(false);
      expect(section.scrollIntoView).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    {},
    '/aplikacja/docpro.html#settings-section-account',
    '/inna/ustawienia.html#settings-section-account',
    'https://inna.test/aplikacja/ustawienia.html#settings-section-account',
    'javascript:alert(1)',
    '/aplikacja/ustawienia.html#dangerZoneAccordion',
    '/aplikacja/ustawienia.html#%E0%A4%A',
  ])('niewłaściwy cel nie otwiera konta ani dowolnego details: %s', (href) => {
    const ui = ustawienia();
    ui.target(href);
    expect([...ui.sections.values()].every((s) => !s.open)).toBe(true);
    expect([...ui.sections.values()].every((s) => s.scrollIntoView.mock.calls.length === 0)).toBe(true);
  });
});
