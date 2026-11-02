import { describe, expect, it, vi } from 'vitest';

import { powloka } from '../support/powloka-harness.mjs';

const calendarHref = '/terminarz.html?noteId=fikcyjne-wydarzenie';

function calendarTarget(href = calendarHref) {
  const h = powloka();
  h.shell.navigate('terminarz', true, href);
  const frame = h.ramki.get('terminarz.html');
  const targets = [];
  frame.contentWindow.addEventListener('vilda:shell-navigate-target', (event) => targets.push(event.detail));
  return { h, frame, targets };
}

describe('Powłoka: aktualność asynchronicznego celu nawigacji', () => {
  it('dostarcza cel dopiero do załadowanej, widocznej ramki i daje odbiorcy uchwyt aktualności', () => {
    const { h, frame, targets } = calendarTarget();
    expect(targets).toEqual([]);
    h.load('terminarz');
    expect(targets).toHaveLength(1);
    expect(targets[0].href).toBe(calendarHref);
    expect(targets[0].isCurrent).toBeTypeOf('function');
    expect(targets[0].isCurrent()).toBe(true);
    expect(frame.hidden).toBe(false);
    expect(h.history.state.shellHref).toBe(calendarHref);
    expect(JSON.stringify(h.history.state)).not.toContain('isCurrent');
  });

  it('ponowny identyczny href jest nową intencją i unieważnia callback pierwszej', () => {
    const { h, targets } = calendarTarget();
    h.load('terminarz');
    const first = targets[0];
    h.shell.navigate('terminarz', true, calendarHref);
    expect(targets).toHaveLength(2);
    expect(targets.map((target) => target.href)).toEqual([calendarHref, calendarHref]);
    expect(first.isCurrent()).toBe(false);
    expect(targets[1].isCurrent()).toBe(true);
  });

  it('pageshow zachowuje bieżącą intencję bez ponownego dostarczenia celu', () => {
    const { h, targets } = calendarTarget();
    h.load('terminarz');
    h.win.dispatchEvent({ type: 'pageshow' });
    h.tick(40);
    expect(targets).toHaveLength(1);
    expect(targets[0].isCurrent()).toBe(true);
  });

  it('odejście i ciepły powrót bez jawnego href nie ożywiają starego celu', () => {
    const { h, frame, targets } = calendarTarget();
    h.load('terminarz');
    const first = targets[0];
    h.shell.navigate('docpro');
    expect(frame.hidden).toBe(true);
    expect(first.isCurrent()).toBe(false);
    h.shell.navigate('terminarz');
    expect(frame.hidden).toBe(false);
    expect(targets).toHaveLength(1);
    expect(first.isCurrent()).toBe(false);
    h.shell.navigate('terminarz', true, calendarHref);
    expect(targets).toHaveLength(2);
    expect(targets[1].isCurrent()).toBe(true);
    expect(first.isCurrent()).toBe(false);
  });

  it('Back do jawnego href tworzy aktualny callback zamiast ożywiać poprzedni', () => {
    const { h, targets } = calendarTarget();
    h.load('terminarz');
    const first = targets[0];
    h.shell.navigate('docpro');
    h.history.back();
    h.tick(0);
    expect(h.win.location.hash).toBe('#/terminarz');
    expect(targets).toHaveLength(2);
    expect(first.isCurrent()).toBe(false);
    expect(targets[1].isCurrent()).toBe(true);
  });

  it('reload od razu unieważnia cel nawet przed wymianą dokumentu i dostarcza nowy po load', () => {
    const { h, frame, targets } = calendarTarget();
    h.load('terminarz');
    const first = targets[0], oldDocument = frame.contentDocument;
    h.shell.reload('terminarz');
    expect(frame.contentDocument).toBe(oldDocument);
    expect(first.isCurrent()).toBe(false);
    expect(targets).toHaveLength(1);
    h.load('terminarz');
    expect(targets).toHaveLength(2);
    expect(first.isCurrent()).toBe(false);
    expect(targets[1].isCurrent()).toBe(true);
  });

  it('niespodziewany load tej samej ramki unieważnia już dostarczony callback', () => {
    const { h, targets } = calendarTarget();
    h.load('terminarz');
    const first = targets[0];
    h.load('terminarz');
    expect(first.isCurrent()).toBe(false);
  });

  it('ukryty panel nie jest aktualnym odbiorcą', () => {
    const { h, frame, targets } = calendarTarget();
    h.load('terminarz');
    frame.hidden = true;
    expect(targets[0].isCurrent()).toBe(false);
  });

  it.each(['contentDocument', 'window.document', 'contentWindow'])('wymiana %s odrzuca callback starego dokumentu', (part) => {
    const { h, frame, targets } = calendarTarget();
    h.load('terminarz');
    const first = targets[0];
    if (part === 'contentDocument') frame.contentDocument = { ...frame.contentDocument };
    if (part === 'window.document') frame.contentWindow.document = { ...frame.contentWindow.document };
    if (part === 'contentWindow') frame.contentWindow = { ...frame.contentWindow };
    expect(first.isCurrent()).toBe(false);
  });
});

function searchTransfer(sourceRoute = 'docpro') {
  let active;
  const authority = {
    closeSearchNavigation: vi.fn(),
    isSearchCalendarTransferCurrent: vi.fn((descriptor) => descriptor === active),
    resumeSearchCalendarTransfer: vi.fn((descriptor) => {
      if (descriptor !== active) return false;
      active = null;
      return true;
    }),
  };
  const h = powloka(null, (win) => { win.VildaAuthUI = authority; });
  if (sourceRoute !== 'docpro') h.shell.navigate(sourceRoute);
  const source = h.load(sourceRoute);
  const descriptor = { token: 'fikcyjny-transfer-1', sourceRoute, targetRoute: 'terminarz' };
  active = descriptor;
  authority.closeSearchNavigation.mockClear();
  source.contentWindow.VildaAuthUI.hide.mockClear();
  const href = `/terminarz.html#vilda-event=fikcyjne-wydarzenie&vilda-search-return=${descriptor.token}`;
  const open = (value = descriptor, targetHref = href) => h.shell.navigate('terminarz', true, targetHref, null, { searchCalendarTransfer: value });
  return { h, source, descriptor, authority, href, open, invalidateOwner: () => { active = null; } };
}

describe('Powłoka: jednorazowy transfer Search do Terminarza', () => {
  it('przekazuje ten sam uchwyt do TOP i źródłowego AuthUI bez zapisywania go w historii', () => {
    const { h, source, descriptor, authority, href, open } = searchTransfer();
    expect(h.shell.getCurrentRoute()).toBe('docpro');
    open();
    expect(h.shell.getCurrentRoute()).toBe('terminarz');
    expect(authority.closeSearchNavigation).toHaveBeenCalledWith({ searchCalendarTransfer: descriptor });
    expect(source.contentWindow.VildaAuthUI.hide).toHaveBeenCalledWith({ shellNavigation: true, searchCalendarTransfer: descriptor });
    expect(h.history.state.shellHref).toBe(href);
    expect(h.history.state.searchCalendarTransfer).toBeUndefined();
    expect(JSON.stringify(h.history.state)).not.toContain('sourceRoute');
  });

  it('jawny powrót przywraca widoczne źródło i wznawia jego Search dokładnie raz', () => {
    const { h, source, descriptor, authority, open } = searchTransfer();
    open();
    h.load('terminarz');
    const resumedAt = [];
    const resume = authority.resumeSearchCalendarTransfer.getMockImplementation();
    authority.resumeSearchCalendarTransfer.mockImplementation((value) => {
      resumedAt.push({ route: h.shell.getCurrentRoute(), hidden: source.hidden });
      return resume(value);
    });
    expect(h.shell.returnFromSearchCalendar(descriptor)).toBe(true);
    h.tick(0);
    expect(h.shell.getCurrentRoute()).toBe('docpro');
    expect(resumedAt).toEqual([{ route: 'docpro', hidden: false }]);
    expect(authority.resumeSearchCalendarTransfer).toHaveBeenCalledExactlyOnceWith(descriptor);
    expect(h.shell.returnFromSearchCalendar(descriptor)).toBe(false);
    expect(authority.resumeSearchCalendarTransfer).toHaveBeenCalledOnce();
  });

  it('natywny Back do źródłowego wpisu historii wznawia Search jeden raz', () => {
    const { h, descriptor, authority, open } = searchTransfer();
    const sourceNavigationId = h.history.state.shellNavId;
    open();
    h.load('terminarz');
    h.history.back();
    h.tick(0);
    expect(h.shell.getCurrentRoute()).toBe('docpro');
    expect(h.history.state.shellNavId).toBe(sourceNavigationId);
    expect(authority.resumeSearchCalendarTransfer).toHaveBeenCalledExactlyOnceWith(descriptor);
    h.history.forward();
    h.tick(0);
    h.history.back();
    h.tick(0);
    expect(authority.resumeSearchCalendarTransfer).toHaveBeenCalledOnce();
    expect(h.shell.returnFromSearchCalendar(descriptor)).toBe(false);
  });

  it('transfer wewnątrz Terminarza tworzy nowy wpis, aby Back miał granicę powrotu do Search', () => {
    const { h, descriptor, authority, open } = searchTransfer('terminarz');
    const sourceNavigationId = h.history.state.shellNavId;
    const priorPushCount = h.history.pushState.mock.calls.length;
    open();
    expect(h.history.state.shellNavId).not.toBe(sourceNavigationId);
    expect(h.history.pushState).toHaveBeenCalledTimes(priorPushCount + 1);
    h.history.back();
    h.tick(0);
    expect(h.shell.getCurrentRoute()).toBe('terminarz');
    expect(h.history.state.shellNavId).toBe(sourceNavigationId);
    expect(authority.resumeSearchCalendarTransfer).toHaveBeenCalledExactlyOnceWith(descriptor);
  });

  it('kopia deskryptora nie uzyskuje uprawnień właściciela Search', () => {
    const { h, source, descriptor, authority, open } = searchTransfer();
    const copy = { ...descriptor };
    open(copy);
    expect(authority.closeSearchNavigation.mock.calls.every((args) => args.length === 0)).toBe(true);
    expect(source.contentWindow.VildaAuthUI.hide).toHaveBeenCalledWith({ shellNavigation: true });
    expect(h.shell.returnFromSearchCalendar(copy)).toBe(false);
    expect(h.shell.returnFromSearchCalendar(descriptor)).toBe(false);
    expect(authority.resumeSearchCalendarTransfer).not.toHaveBeenCalled();
  });

  it.each([
    '/terminarz.html#vilda-event=fikcyjne-wydarzenie&vilda-search-return=inny-token',
    '/terminarz.html#vilda-event=fikcyjne-wydarzenie',
    '/terminarz.html#vilda-search-return=fikcyjny-transfer-1',
  ])('href bez zgodnego celu i tokenu nie zachowuje transferu: %s', (href) => {
    const { h, descriptor, authority, open } = searchTransfer();
    open(descriptor, href);
    expect(h.shell.returnFromSearchCalendar(descriptor)).toBe(false);
    expect(authority.resumeSearchCalendarTransfer).not.toHaveBeenCalled();
    expect(authority.closeSearchNavigation.mock.calls.every((args) => args.length === 0)).toBe(true);
  });

  it('unieważnienie właściciela między otwarciem i powrotem uniemożliwia wznowienie', () => {
    const { h, descriptor, authority, open, invalidateOwner } = searchTransfer();
    open();
    invalidateOwner();
    expect(h.shell.returnFromSearchCalendar(descriptor)).toBe(false);
    h.history.back();
    h.tick(0);
    expect(authority.resumeSearchCalendarTransfer).not.toHaveBeenCalled();
  });

  it.each(['ta sama trasa i ten sam href', 'inna trasa'])('nowa zwykła intencja porzuca uchwyt: %s', (intent) => {
    const { h, descriptor, authority, href, open } = searchTransfer();
    open();
    h.load('terminarz');
    if (intent === 'ta sama trasa i ten sam href') h.shell.navigate('terminarz', true, href);
    else h.shell.navigate('lab');
    expect(h.shell.returnFromSearchCalendar(descriptor)).toBe(false);
    h.history.back();
    h.tick(0);
    expect(authority.resumeSearchCalendarTransfer).not.toHaveBeenCalled();
  });

  it('reload źródła unieważnia kontekst przed wymianą jego dokumentu', () => {
    const { h, source, descriptor, authority, open } = searchTransfer();
    const oldDocument = source.contentDocument;
    open();
    h.shell.reload('docpro');
    expect(source.contentDocument).toBe(oldDocument);
    expect(h.shell.returnFromSearchCalendar(descriptor)).toBe(false);
    expect(authority.resumeSearchCalendarTransfer).not.toHaveBeenCalled();
  });

  it.each(['contentDocument', 'window.document', 'contentWindow'])('wymiana źródłowego %s nie wznawia Search należącego do starego okna', (part) => {
    const { h, source, descriptor, authority, open } = searchTransfer();
    open();
    if (part === 'contentDocument') source.contentDocument = { ...source.contentDocument };
    if (part === 'window.document') source.contentWindow.document = { ...source.contentWindow.document };
    if (part === 'contentWindow') source.contentWindow = { ...source.contentWindow };
    expect(h.shell.returnFromSearchCalendar(descriptor)).toBe(false);
    expect(authority.resumeSearchCalendarTransfer).not.toHaveBeenCalled();
  });

  it('same-route transfer czeka na cofnięcie sentinela i zachowuje descriptor w każdym quietClose', () => {
    const { h, source, descriptor, authority, href, open } = searchTransfer('terminarz');
    const sourceNavigationId = h.history.state.shellNavId;
    const onBack = vi.fn(), targets = [];
    source.contentWindow.VildaAuthUI.hide.mockImplementation((options) => h.shell.releaseAuthHistory(source.contentWindow, { quiet: options?.shellNavigation === true }));
    source.contentWindow.addEventListener('vilda:shell-navigate-target', (event) => targets.push(event.detail));
    expect(h.shell.ensureAuthHistory(source.contentWindow, onBack, source.contentDocument)).toBe(true);
    open();
    expect(h.history.back).toHaveBeenCalledOnce();
    expect(targets).toEqual([]);
    expect(h.history.state.shellNavId).toBe(sourceNavigationId);
    expect(authority.resumeSearchCalendarTransfer).not.toHaveBeenCalled();
    h.tick(0);
    expect(h.shell.getCurrentRoute()).toBe('terminarz');
    expect(h.history.state.shellNavId).not.toBe(sourceNavigationId);
    expect(h.history.state.shellHref).toBe(href);
    expect(h.history.state.shellAuthId).toBeUndefined();
    expect(targets).toHaveLength(1);
    expect(targets[0].href).toBe(href);
    expect(targets[0].isCurrent()).toBe(true);
    expect(onBack).not.toHaveBeenCalled();
    expect(authority.closeSearchNavigation.mock.calls.length).toBeGreaterThan(0);
    expect(authority.closeSearchNavigation.mock.calls.every((args) => args.length === 1 && args[0].searchCalendarTransfer === descriptor)).toBe(true);
    expect(source.contentWindow.VildaAuthUI.hide.mock.calls.length).toBeGreaterThan(0);
    expect(source.contentWindow.VildaAuthUI.hide.mock.calls.every(([options]) => options.shellNavigation === true && options.searchCalendarTransfer === descriptor)).toBe(true);
    h.history.back();
    h.tick(0);
    expect(h.history.state.shellNavId).toBe(sourceNavigationId);
    expect(authority.resumeSearchCalendarTransfer).toHaveBeenCalledExactlyOnceWith(descriptor);
  });

  it('nowsza zwykła nawigacja podczas pendingBack zastępuje transfer i nie wznawia Search', () => {
    const { h, source, descriptor, authority, open } = searchTransfer('terminarz');
    const onBack = vi.fn();
    source.contentWindow.VildaAuthUI.hide.mockImplementation((options) => h.shell.releaseAuthHistory(source.contentWindow, { quiet: options?.shellNavigation === true }));
    expect(h.shell.ensureAuthHistory(source.contentWindow, onBack, source.contentDocument)).toBe(true);
    open();
    expect(h.history.back).toHaveBeenCalledOnce();
    authority.closeSearchNavigation.mockClear();
    source.contentWindow.VildaAuthUI.hide.mockClear();
    h.shell.navigate('lab');
    h.tick(0);
    expect(h.shell.getCurrentRoute()).toBe('lab');
    expect(h.history.state.shellHref).toBeUndefined();
    expect(authority.closeSearchNavigation.mock.calls.length).toBeGreaterThan(0);
    expect(authority.closeSearchNavigation.mock.calls.every((args) => args.length === 0)).toBe(true);
    expect(source.contentWindow.VildaAuthUI.hide).toHaveBeenCalledWith({ shellNavigation: true });
    expect(h.shell.returnFromSearchCalendar(descriptor)).toBe(false);
    h.history.back();
    h.tick(0);
    expect(h.shell.getCurrentRoute()).toBe('terminarz');
    expect(authority.resumeSearchCalendarTransfer).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('jawny powrót podczas pendingBack sentinela kalendarza zachowuje descriptor do wznowienia źródła', () => {
    const { h, source, descriptor, authority, open } = searchTransfer();
    const sourceNavigationId = h.history.state.shellNavId;
    open();
    const calendar = h.load('terminarz'), onBack = vi.fn();
    expect(h.shell.ensureAuthHistory(calendar.contentWindow, onBack, calendar.contentDocument)).toBe(true);
    h.shell.releaseAuthHistory(calendar.contentWindow);
    expect(h.history.back).toHaveBeenCalledOnce();
    authority.closeSearchNavigation.mockClear();
    source.contentWindow.VildaAuthUI.hide.mockClear();
    calendar.contentWindow.VildaAuthUI.hide.mockClear();
    expect(h.shell.returnFromSearchCalendar(descriptor)).toBe(true);
    expect(h.shell.getCurrentRoute()).toBe('terminarz');
    expect(authority.resumeSearchCalendarTransfer).not.toHaveBeenCalled();
    expect(h.shell.returnFromSearchCalendar(descriptor)).toBe(false);
    h.tick(0);
    expect(h.shell.getCurrentRoute()).toBe('docpro');
    expect(h.history.state.shellNavId).toBe(sourceNavigationId);
    expect(h.history.state.shellAuthId).toBeUndefined();
    expect(source.hidden).toBe(false);
    expect(authority.resumeSearchCalendarTransfer).toHaveBeenCalledExactlyOnceWith(descriptor);
    expect(authority.closeSearchNavigation.mock.calls.length).toBeGreaterThan(0);
    expect(authority.closeSearchNavigation.mock.calls.every((args) => args.length === 1 && args[0].searchCalendarTransfer === descriptor)).toBe(true);
    expect(calendar.contentWindow.VildaAuthUI.hide.mock.calls.length).toBeGreaterThan(0);
    expect(calendar.contentWindow.VildaAuthUI.hide.mock.calls.every(([options]) => options.shellNavigation === true && options.searchCalendarTransfer === descriptor)).toBe(true);
    expect(source.contentWindow.VildaAuthUI.hide.mock.calls.every(([options]) => options.shellNavigation === true && options.searchCalendarTransfer === descriptor)).toBe(true);
    expect(onBack).not.toHaveBeenCalled();
    expect(h.shell.returnFromSearchCalendar(descriptor)).toBe(false);
    expect(authority.resumeSearchCalendarTransfer).toHaveBeenCalledOnce();
  });

  it('przyjęty same-route descriptor nie tworzy kolejnego źródła ani granicy historii', () => {
    const { h, source, descriptor, authority, open } = searchTransfer('terminarz');
    const sourceNavigationId = h.history.state.shellNavId;
    open();
    const targetNavigationId = h.history.state.shellNavId;
    const pushCount = h.history.pushState.mock.calls.length;
    expect(targetNavigationId).not.toBe(sourceNavigationId);
    authority.closeSearchNavigation.mockClear();
    source.contentWindow.VildaAuthUI.hide.mockClear();
    open();
    expect(h.history.state.shellNavId).toBe(targetNavigationId);
    expect(h.history.pushState).toHaveBeenCalledTimes(pushCount);
    expect(authority.closeSearchNavigation.mock.calls.length).toBeGreaterThan(0);
    expect(authority.closeSearchNavigation.mock.calls.every((args) => args.length === 0)).toBe(true);
    expect(source.contentWindow.VildaAuthUI.hide).toHaveBeenCalledWith({ shellNavigation: true });
    expect(h.shell.returnFromSearchCalendar(descriptor)).toBe(false);
    h.history.back();
    h.tick(0);
    expect(h.history.state.shellNavId).toBe(sourceNavigationId);
    expect(authority.resumeSearchCalendarTransfer).not.toHaveBeenCalled();
  });

  it.each(['jawny powrót', 'natywny Back'])('%s zachowuje ciepłe źródło lab bez ponownego wykonania historycznego linku klinicznego', (kind) => {
    const { h, source, descriptor, authority, href, open } = searchTransfer('lab');
    const clinicalHref = '/przelicznik-jednostek.html?wskazanie=obesity_kids';
    const freshClinicalHref = '/przelicznik-jednostek.html?wskazanie=adrenal_insufficiency';
    const sourceTargets = [], calendarTargets = [];
    source.contentWindow.addEventListener('vilda:shell-navigate-target', (event) => sourceTargets.push(event.detail));
    h.shell.navigate('lab', true, clinicalHref);
    const sourceNavigationId = h.history.state.shellNavId;
    expect(sourceTargets.map((target) => target.href)).toEqual([clinicalHref]);
    source.contentWindow.scrollY = 480;
    source.contentWindow.scrollTo = vi.fn((options) => { source.contentWindow.scrollY = options.top; });
    open();
    expect(source.hidden).toBe(true);
    source.contentWindow.scrollY = 0;
    expect(source.contentWindow.scrollTo).not.toHaveBeenCalled();
    const calendar = h.ramki.get('terminarz.html');
    calendar.contentWindow.addEventListener('vilda:shell-navigate-target', (event) => calendarTargets.push(event.detail));
    h.load('terminarz');
    expect(calendarTargets.map((target) => target.href)).toEqual([href]);
    expect(sourceTargets[0].isCurrent()).toBe(false);
    if (kind === 'jawny powrót') expect(h.shell.returnFromSearchCalendar(descriptor)).toBe(true);
    else h.history.back();
    h.tick(0);
    expect(h.shell.getCurrentRoute()).toBe('lab');
    expect(h.history.state.shellNavId).toBe(sourceNavigationId);
    expect(h.history.state.shellHref).toBe(clinicalHref);
    expect(source.contentWindow.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 480, behavior: 'instant' });
    expect(source.contentWindow.scrollY).toBe(480);
    expect(authority.resumeSearchCalendarTransfer).toHaveBeenCalledExactlyOnceWith(descriptor);
    expect(sourceTargets.map((target) => target.href)).toEqual([clinicalHref]);
    expect(calendarTargets.map((target) => target.href)).toEqual([href]);
    expect(calendarTargets.at(-1).isCurrent()).toBe(false);
    h.win.dispatchEvent({ type: 'pageshow' });
    expect(sourceTargets.map((target) => target.href)).toEqual([clinicalHref]);
    h.shell.navigate('lab', true, freshClinicalHref);
    expect(sourceTargets.map((target) => target.href)).toEqual([clinicalHref, freshClinicalHref]);
    expect(sourceTargets.at(-1).isCurrent()).toBe(true);
  });

  it.each(['jawny powrót', 'natywny Back'])('%s w tym samym Terminarzu nie odtwarza starego opaque tokenu źródła', (kind) => {
    const { h, source, descriptor, authority, href, open } = searchTransfer('terminarz');
    const oldHref = '/terminarz.html#vilda-event=fikcyjne-stare-wydarzenie&vilda-search-return=fikcyjny-stary-token';
    const targets = [];
    source.contentWindow.addEventListener('vilda:shell-navigate-target', (event) => targets.push(event.detail));
    h.shell.navigate('terminarz', true, oldHref);
    const sourceNavigationId = h.history.state.shellNavId;
    expect(targets.map((target) => target.href)).toEqual([oldHref]);
    open();
    expect(targets.map((target) => target.href)).toEqual([oldHref, href]);
    const searchTarget = targets.at(-1);
    expect(searchTarget.isCurrent()).toBe(true);
    if (kind === 'jawny powrót') expect(h.shell.returnFromSearchCalendar(descriptor)).toBe(true);
    else h.history.back();
    h.tick(0);
    expect(h.shell.getCurrentRoute()).toBe('terminarz');
    expect(h.history.state.shellNavId).toBe(sourceNavigationId);
    expect(h.history.state.shellHref).toBe(oldHref);
    expect(authority.resumeSearchCalendarTransfer).toHaveBeenCalledExactlyOnceWith(descriptor);
    expect(targets.map((target) => target.href)).toEqual([oldHref, href]);
    expect(targets.at(-1)).toBe(searchTarget);
    expect(searchTarget.isCurrent()).toBe(false);
    h.win.dispatchEvent({ type: 'pageshow' });
    expect(targets.map((target) => target.href)).toEqual([oldHref, href]);
    h.shell.navigate('terminarz', true, oldHref);
    expect(targets.map((target) => target.href)).toEqual([oldHref, href, oldHref]);
    expect(targets.at(-1).isCurrent()).toBe(true);
  });
});

describe('Powłoka: jawne linki poza transferem Search', () => {
  it('zwykłe Back i Forward nadal dostarczają historyczny cel, a świeży link działa w ciepłej ramce', () => {
    const { h, targets } = calendarTarget();
    const freshHref = '/terminarz.html?noteId=fikcyjne-nowe-wydarzenie';
    h.load('terminarz');
    expect(targets.map((target) => target.href)).toEqual([calendarHref]);
    h.shell.navigate('docpro');
    h.history.back();
    h.tick(0);
    expect(targets.map((target) => target.href)).toEqual([calendarHref, calendarHref]);
    h.history.forward();
    h.tick(0);
    expect(targets.map((target) => target.href)).toEqual([calendarHref, calendarHref]);
    h.history.back();
    h.tick(0);
    expect(targets.map((target) => target.href)).toEqual([calendarHref, calendarHref, calendarHref]);
    h.shell.navigate('terminarz', true, freshHref);
    expect(targets.map((target) => target.href)).toEqual([calendarHref, calendarHref, calendarHref, freshHref]);
    expect(targets.at(-1).isCurrent()).toBe(true);
  });
});
