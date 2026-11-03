import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(new URL('../../vilda_chrome.js', import.meta.url), 'utf8');
const geometry = source.slice(source.indexOf('/* P-HEADER-GEOMETRY:'));
const markup = source.slice(source.indexOf('function Ch_searchIcon('), source.indexOf('function Ch_attr('));
const bell = source.slice(source.indexOf('function bt('), source.indexOf('function E()', source.indexOf('function bt(')));

function events(target) {
  const listeners = new Map();
  target.addEventListener = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); };
  target.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
  target.dispatch = type => { for (const fn of [...(listeners.get(type) || [])]) fn({ type, target }); };
  target.listenerCount = type => listeners.get(type)?.size || 0;
  return target;
}
function element(left = 0, width = 0, top = 0, height = 100) {
  const classes = new Set(), properties = new Map(), children = new Map();
  return events({ left, width, top, height, hidden: false, offsetTop: 0, clientWidth: width, children: [], tagName: 'DIV',
    classList: { contains: name => classes.has(name), toggle: (name, on) => on ? classes.add(name) : classes.delete(name), add: name => classes.add(name), remove: name => classes.delete(name) },
    style: { getPropertyValue: name => properties.get(name) || '', setProperty: (name, value) => properties.set(name, value) },
    querySelector: selector => children.get(selector) || null,
    add: (selector, node) => { children.set(selector, node); return node; },
    getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; },
    getBoundingClientRect() { return { left: this.left, right: this.left + this.width, width: this.width, top: this.top, bottom: this.top + this.height, height: this.height }; },
  });
}
function document(path = '/index.html', clientWidth = 1440) {
  const nodes = new Map(), frames = [];
  const owner = events({ readyState: 'complete', documentElement: element(0, clientWidth), body: element(0, clientWidth), frames,
    querySelector: selector => selector === '#appPanes>iframe.app-pane:not([hidden])' ? frames.find(frame => !frame.hidden) || null : nodes.get(selector) || null,
    querySelectorAll: selector => selector === '#appPanes>iframe.app-pane' ? frames : [],
    getElementById: id => nodes.get(`#${id}`) || null,
    add: (selector, node) => { nodes.set(selector, node); return node; },
  });
  owner.defaultView = events({ document: owner, location: { pathname: path, hash: '' } });
  return owner;
}
function form(owner, left = 248, width = 450, right = 1160, kind = 'start') {
  const target = owner.add(kind === 'clcr' ? '#clcrActivePanel' : '#userSection fieldset.user-card', element(left, width));
  const second = owner.add(kind === 'clcr' ? '#clcrResultRail' : '#doctorSection', element(left + width + 12, right - left - width - 12));
  const workspace = owner.add(kind === 'clcr' ? '#clcrWorkspace' : '#calcForm', element(left, right - left));
  return { target, second, workspace };
}
function setup(path = '/index.html', width = 1440, configure = () => {}) {
  const doc = document(path, width), win = doc.defaultView, pending = [], observers = [];
  win.innerWidth = width; win.innerHeight = 1000;
  win.requestAnimationFrame = fn => { pending.push(fn); return pending.length; };
  win.MutationObserver = class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } };
  win.ResizeObserver = class { constructor(fn) { this.fn = fn; } observe() {} disconnect() {} };
  doc.body.classList.add('vilda-header-menu');
  const strip = doc.add('.chrome-strip', element(0, width, 0, 64));
  doc.add('body>header', element(0, width, 0, 66));
  doc.add('#vildaHeaderSearch', element()); doc.add('.chrome-chips', element(width - 112, 96));
  const footer = doc.add('footer.site-footer', element(248, 912, 900, 100));
  footer.add('.site-footer__inner', element(248, 912, 900, 90));
  configure({ doc, win, strip });
  vm.runInNewContext(geometry, { window: win });
  const flush = () => { let passes = 0; while (pending.length) { if (++passes > 10) throw Error('layout loop'); pending.shift()(); } };
  flush();
  return { doc, win, strip, footer, observers, flush, refresh: () => { win.VildaHeaderLayout.refresh(); flush(); }, value: name => doc.documentElement.style.getPropertyValue(name) };
}

describe('production header geometry', () => {
  it('aligns both Search edges with card one and the bell with card two, including the empty decorative track', () => {
    const e = setup('/index.html', 1440, ({ doc }) => form(doc));
    expect(e.value('--chrome-form-left')).toBe('248px');
    expect(e.value('--chrome-form-width')).toBe('450px');
    expect(e.value('--chrome-actions-right')).toBe('280px');
    expect(e.doc.documentElement.classList.contains('vilda-form-layout')).toBe(true);
    expect(e.value('--chrome-layout-header-height')).toBe('66px');
    expect(e.value('--chrome-menu-footer-height')).toBe('100px');
    expect(e.value('--chrome-form-footer-height')).toBe('100px');
  });

  it('reserves an invariant 108px action slot in a genuinely single-column desktop form', () => {
    let cards;
    const e = setup('/index.html', 1024, ({ doc }) => { cards = form(doc, 248, 740, 988); cards.second.hidden = true; });
    expect(e.value('--chrome-form-left')).toBe('248px'); expect(e.value('--chrome-form-width')).toBe('632px');
    expect(e.value('--chrome-actions-right')).toBe('36px');
    e.doc.querySelector('.chrome-chips').width = 44; e.refresh();
    expect(e.value('--chrome-form-width')).toBe('632px'); expect(e.value('--chrome-actions-right')).toBe('36px');
  });

  it('measures the active iframe rather than a retained save owner and removes old source listeners', () => {
    const first = document('/index.html', 900), next = document('/kalkulator-klirens.html', 1178);
    form(first, 0, 444, 900); form(next, 0, 583, 1178, 'clcr');
    const one = element(248, 906), two = element(248, 1184); one.contentDocument = first; two.contentDocument = next; two.hidden = true;
    const e = setup('/app.html', 1680, ({ doc, win }) => { doc.frames.push(one, two); win.VildaActiveSaveOwner = first; });
    expect(e.value('--chrome-actions-right')).toBe('532px'); expect(e.value('--chrome-pane-scrollbar-width')).toBe('6px');
    expect(first.defaultView.listenerCount('resize')).toBe(1);
    one.hidden = true; two.hidden = false; e.refresh();
    expect(e.value('--chrome-form-left')).toBe('248px'); expect(e.value('--chrome-form-width')).toBe('583px');
    expect(e.value('--chrome-actions-right')).toBe('254px'); expect(e.value('--chrome-pane-scrollbar-width')).toBe('6px');
    expect(first.defaultView.listenerCount('resize')).toBe(0); expect(next.defaultView.listenerCount('resize')).toBe(1);
    expect(next.documentElement.classList.contains('vilda-form-host-desktop')).toBe(true);
    expect(next.documentElement.classList.contains('vilda-chrome-wide-host')).toBe(true);
    expect(e.doc.documentElement.classList.contains('vilda-form-layout')).toBe(true);
  });

  it('marks a narrow embedded form using host desktop mode and preserves the actual taller footer', () => {
    const child = document('/docpro.html', 734); form(child, 0, 361, 734);
    const frame = element(248, 740); frame.contentDocument = child;
    const footer = child.add('footer.site-footer', element(0, 734, 860, 140));
    footer.add('.site-footer__inner', element(0, 734, 860, 130));
    const e = setup('/app.html', 1024, ({ doc }) => doc.frames.push(frame));
    expect(child.documentElement.classList.contains('vilda-form-host-desktop')).toBe(true);
    expect(e.value('--chrome-form-width')).toBe('361px'); expect(e.value('--chrome-actions-right')).toBe('42px');
    expect(e.value('--chrome-menu-footer-height')).toBe('140px');
    expect(child.documentElement.style.getPropertyValue('--chrome-form-footer-height')).toBe('140px');
    footer.height = 180; e.refresh();
    expect(e.value('--chrome-menu-footer-height')).toBe('180px');
    expect(child.documentElement.style.getPropertyValue('--chrome-form-footer-height')).toBe('180px');
  });

  it('measures a stable scrollbar gutter before overflow and keeps the same offset after overflow', () => {
    const child = document('/index.html', 928); child.documentElement.width = 918; form(child, 0, 453, 918);
    const frame = element(248, 928); frame.contentDocument = child;
    const e = setup('/app.html', 1440, ({ doc }) => doc.frames.push(frame));
    expect(e.value('--chrome-pane-scrollbar-width')).toBe('10px');
    child.documentElement.clientWidth = 918; e.refresh();
    expect(e.value('--chrome-pane-scrollbar-width')).toBe('10px');
  });

  it('uses the actual compact footer and dock reserve for the form without changing the menu minimum', () => {
    const e = setup('/index.html', 390, ({ doc }) => { doc.querySelector('footer.site-footer').height = 192; });
    expect(e.value('--chrome-menu-footer-height')).toBe('96px');
    expect(e.value('--chrome-form-footer-height')).toBe('192px');
    e.footer.height = 72; e.refresh();
    expect(e.value('--chrome-form-footer-height')).toBe('72px');
    expect(e.value('--chrome-menu-footer-height')).toBe('96px');
  });

  it.each(['phone', 'narrow'])('clears desktop iframe markers and scrollbar compensation for %s', mode => {
    const child = document('/docpro.html', 734); form(child, 0, 361, 734);
    const frame = element(248, 740); frame.contentDocument = child;
    const e = setup('/app.html', 1024, ({ doc }) => doc.frames.push(frame));
    if (mode === 'phone') e.doc.documentElement.classList.add('vilda-phone'); else e.win.innerWidth = 390;
    e.refresh();
    expect(child.documentElement.classList.contains('vilda-form-host-desktop')).toBe(false);
    expect(child.documentElement.classList.contains('vilda-chrome-wide-host')).toBe(false);
    expect(e.value('--chrome-pane-scrollbar-width')).toBe('0px');
    expect(e.value('--chrome-menu-footer-height')).toBe('96px');
  });

  it.each(['/przelicznik-jednostek.html', '/terminarz.html'])('does not opt %s into the three-form layout', path => {
    const child = document(path, 900), frame = element(248, 906); frame.contentDocument = child;
    child.add('.main-content', element(0, 900));
    const e = setup('/app.html', 1440, ({ doc }) => doc.frames.push(frame));
    expect(e.doc.documentElement.classList.contains('vilda-form-layout')).toBe(false);
    expect(child.documentElement.classList.contains('vilda-form-layout')).toBe(false);
    expect(child.documentElement.classList.contains('vilda-form-host-desktop')).toBe(false);
    expect(e.value('--chrome-pane-scrollbar-width')).toBe('0px');
  });

  it('marks an embedded form at boot without mounting its own header geometry', () => {
    const e = setup('/docpro.html', 734, ({ doc }) => doc.documentElement.classList.add('vilda-embedded'));
    expect(e.doc.documentElement.classList.contains('vilda-form-layout')).toBe(true);
    expect(e.value('--chrome-form-width')).toBe('');
  });

  it('reserves the default Start track before its iframe loads and clears the obsolete action position', () => {
    const e = setup('/app.html', 1440, ({ strip }) => strip.classList.add('chrome-header-actions-before-search'));
    expect(e.doc.documentElement.classList.contains('vilda-form-layout')).toBe(true);
    expect(e.strip.classList.contains('chrome-header-actions-before-search')).toBe(false);
    e.win.location.hash = '#/terminarz'; e.refresh();
    expect(e.doc.documentElement.classList.contains('vilda-form-layout')).toBe(false);
  });

  it('stretches only the plain two-card form and releases it when results or comparison become visible', () => {
    let container, workspace, results, comparison;
    const e = setup('/docpro.html', 1440, ({ doc }) => {
      const cards = form(doc); workspace = cards.workspace;
      doc.add('#calcForm', workspace);
      const user = element(248, 450); user.id = 'userSection'; cards.second.id = 'doctorSection';
      comparison = element(248, 912); comparison.id = 'comparisonSection'; comparison.hidden = true;
      workspace.children = [user, cards.second, comparison];
      container = doc.add('.main-content>.container', element(248, 912));
      results = element(248, 912); results.hidden = true;
      const script = element(0, 10); script.tagName = 'SCRIPT';
      container.children = [workspace, results, script];
    });
    expect(e.doc.documentElement.classList.contains('vilda-form-fit-viewport')).toBe(true);
    expect(e.doc.documentElement.classList.contains('vilda-form-only-patient')).toBe(false);
    workspace.children[1].height = 0; e.refresh();
    expect(e.doc.documentElement.classList.contains('vilda-form-only-patient')).toBe(true);
    workspace.children[1].height = 100; e.refresh();
    expect(e.doc.documentElement.classList.contains('vilda-form-only-patient')).toBe(false);
    results.hidden = false; e.refresh();
    expect(e.doc.documentElement.classList.contains('vilda-form-fit-viewport')).toBe(false);
    expect(e.doc.documentElement.classList.contains('vilda-form-only-patient')).toBe(false);
    results.hidden = true; comparison.hidden = false; e.refresh();
    expect(e.doc.documentElement.classList.contains('vilda-form-fit-viewport')).toBe(false);
    comparison.hidden = true; e.refresh();
    expect(e.doc.documentElement.classList.contains('vilda-form-fit-viewport')).toBe(true);
  });
});

describe('production header icon markup', () => {
  it('renders a bounded 18px Search icon in the desktop form and keeps the mobile icon at21px', () => {
    const context = vm.createContext({}); vm.runInContext(markup, context);
    expect(context.Ch_searchMarkup()).toContain('<svg width="18" height="18"');
    expect(context.Ch_searchIcon()).toContain('<svg width="21" height="21"');
  });

  it.each([null, { count: 3, state: 'overdue' }, { count: 12, state: 'today' }, 'loading'])('renders the same bell and tooltip for cached state %j', cache => {
    const context = vm.createContext({ St: () => cache === 'loading' ? null : cache, H: () => cache === 'loading' });
    vm.runInContext(bell, context); const html = context.bt();
    expect(html).toContain('title="Otwórz przypomnienia"');
    expect(html).toContain('<svg width="21" height="21"');
    expect(html).not.toContain('chrome-reminders-label');
    expect(html).toContain('id="vildaRemindersBadge"');
    expect(html).toContain(`data-count="${cache?.count || 0}"`);
  });
});
