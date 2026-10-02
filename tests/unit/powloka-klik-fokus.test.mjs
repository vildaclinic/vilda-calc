import { describe, expect, it, vi } from 'vitest';
import { powloka } from '../support/powloka-harness.mjs';

function link(h, options = {}) {
  const attrs = { href: options.href || 'homa-ir.html', ...options.attrs };
  const anchor = {
    getAttribute: (key) => attrs[key] ?? null,
    hasAttribute: (key) => Object.hasOwn(attrs, key),
    get target() { return attrs.target || ''; },
    closest: (selector) => selector === '.chrome-drawer-nav' ? (options.drawer ? {} : null) : anchor,
  };
  const event = { type: 'click', target: anchor, button: 0, ...options.event };
  event.preventDefault = vi.fn(() => { event.defaultPrevented = true; });
  event.stopPropagation = vi.fn();
  h.doc.dispatchEvent(event);
  return event;
}
function withDrawer() {
  const chrome = { closeDrawer: vi.fn(() => true) };
  return { ...powloka(chrome), chrome };
}

describe('Powłoka: kwalifikacja rzeczywistego handlera kliknięć', () => {
  it.each([
    { event: { ctrlKey: true } }, { event: { metaKey: true } },
    { event: { shiftKey: true } }, { event: { altKey: true } },
    { event: { button: 1 } }, { event: { button: 2 } },
    { event: { defaultPrevented: true } }, { attrs: { download: '' } },
    { attrs: { target: '_blank' } }, { attrs: { target: '_parent' } },
    { attrs: { target: 'inne-okno' } },
  ])('natywny klik %j pozostawia trasę, menu i obsługę przeglądarce', (options) => {
    const h = withDrawer(); const before = h.history.pushState.mock.calls.length;
    const event = link(h, { drawer: true, ...options });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(h.chrome.closeDrawer).not.toHaveBeenCalled();
    expect(h.win.location.hash).toBe('#/docpro');
    expect(h.history.pushState.mock.calls.length).toBe(before);
  });

  it.each([{}, { event: { detail: 0 } }, { attrs: { target: '_self' } }])(
    'zwykły klik / Enter / self %j nadal otwiera panel', (options) => {
      const h = withDrawer(); const event = link(h, options);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(h.win.location.hash).toBe('#/homa');
    },
  );

  it('korzysta ze wspólnej kwalifikacji Chrome przed przejęciem kliku', () => {
    const chrome = { isPlainNavigationClick: vi.fn(() => false), closeDrawer: vi.fn() };
    const h = powloka(chrome); const event = link(h);
    expect(chrome.isPlainNavigationClick).toHaveBeenCalledOnce();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(chrome.closeDrawer).not.toHaveBeenCalled();
    expect(h.win.location.hash).toBe('#/docpro');
  });
});

describe('Powłoka: fokus należy do aktualnej intencji menu', () => {
  it('ciepły docelowy panel dostaje focus po zamknięciu drawer', () => {
    const h = withDrawer(); h.shell.navigate('homa'); const f = h.load('homa');
    h.shell.navigate('docpro');
    link(h, { drawer: true });
    expect(h.chrome.closeDrawer).toHaveBeenCalledWith({ reason: 'navigation' });
    expect(f.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(h.doc.activeElement).toBe(f);
  });

  it('zimna ramka dostaje focus dopiero po load, przed klinicznym targetem', () => {
    const h = withDrawer();
    link(h, { drawer: true, href: 'przelicznik-jednostek.html?wskazanie=obesity_kids' });
    const f = h.ramki.get('przelicznik-jednostek.html');
    expect(f.focus).not.toHaveBeenCalled();
    const atTarget = [];
    f.contentWindow.addEventListener('vilda:shell-navigate-target', () => atTarget.push(f.focus.mock.calls.length));
    h.load('lab');
    expect(f.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(atTarget).toEqual([1]);
    h.win.dispatchEvent({ type: 'pageshow' });
    expect(f.focus).toHaveBeenCalledOnce();
  });

  it('nowsze przejście nie przenosi później fokusu do poprzedniego cold celu', () => {
    const h = withDrawer(); link(h, { drawer: true });
    h.shell.navigate('docpro'); const f = h.load('homa');
    h.shell.navigate('homa');
    expect(f.focus).not.toHaveBeenCalled();
  });

  it.each(['pointerdown', 'keydown'])('późniejsze %s kończy oczekiwanie na fokus', (type) => {
    const h = withDrawer(); link(h, { drawer: true });
    h.win.dispatchEvent({ type }); const f = h.load('homa');
    expect(f.focus).not.toHaveBeenCalled();
  });

  it('ponowne menu lub modal może anulować cold fokus bez zmiany trasy', () => {
    const h = withDrawer(); link(h, { drawer: true });
    h.shell.cancelPendingPaneFocus(); const f = h.load('homa');
    expect(h.win.location.hash).toBe('#/homa');
    expect(f.focus).not.toHaveBeenCalled();
  });

  it.each([false, true])('focus przechodzi przez nativeBack; anulowanie=%s zachowuje się zgodnie z intencją', (cancel) => {
    const h = withDrawer(); h.shell.navigate('start'); const f = h.load('start');
    h.shell.ensureAuthHistory(f.contentWindow, vi.fn(), f.contentDocument);
    f.contentWindow.VildaAuthUI.hide.mockImplementation((options) => h.shell.releaseAuthHistory(f.contentWindow, { quiet: options?.shellNavigation === true }));
    link(h, { drawer: true, href: 'index.html' });
    expect(f.focus).not.toHaveBeenCalled();
    if (cancel) h.shell.cancelPendingPaneFocus();
    h.tick(0);
    expect(h.win.location.hash).toBe('#/start');
    expect(f.focus).toHaveBeenCalledTimes(cancel ? 0 : 1);
  });

  it('zwykły sidebar z zamkniętym drawer nie przejmuje fokusu', () => {
    const h = powloka({ closeDrawer: () => false });
    link(h); const f = h.load('homa');
    expect(f.focus).not.toHaveBeenCalled();
  });
});


describe('Powłoka: nazwy tras pochodzą ze stałej listy', () => {
  it('obsługuje wszystkie opublikowane trasy', () => {
    const h = powloka();
    for (const route of Object.keys(h.shell.routes)) {
      h.shell.navigate(route);
      expect(h.win.location.hash).toBe('#/' + route);
    }
  });
  it('nie zamienia obiektu użytkownika na dynamiczny klucz cache ramek', () => {
    const h = powloka();
    const toString = vi.fn(() => 'homa');
    h.shell.navigate({ toString });
    expect(h.win.location.hash).toBe('#/terminarz');
    expect(toString).not.toHaveBeenCalled();
    expect(h.ramki.has('homa-ir.html')).toBe(false);
  });
  it.each(['__proto__', 'constructor', 'toString', 'nieznana'])('nieznana trasa %s zachowuje dotychczasowy domyślny panel', (route) => {
    const h = powloka();
    h.shell.navigate(route);
    expect(h.win.location.hash).toBe('#/terminarz');
    expect(h.ramki.has('terminarz.html')).toBe(true);
  });
});
