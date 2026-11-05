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
  const doc = document(path, width), win = doc.defaultView, pending = new Map(), observers = [], resizeObservers = [];
  let nextFrame = 0;
  win.innerWidth = width; win.innerHeight = 1000;
  win.requestAnimationFrame = fn => { const id = ++nextFrame; pending.set(id, fn); return id; };
  win.cancelAnimationFrame = id => pending.delete(id);
  win.MutationObserver = class {
    constructor(fn) { this.fn = fn; this.observations = []; observers.push(this); }
    observe(node, options) { this.disconnected = false; this.observations.push({ node, options }); }
    disconnect() { this.disconnected = true; this.observations = []; }
  };
  win.ResizeObserver = class {
    constructor(fn) { this.fn = fn; this.nodes = []; resizeObservers.push(this); }
    observe(node) { this.nodes.push(node); }
    disconnect() { this.nodes = []; }
  };
  doc.body.classList.add('vilda-header-menu');
  const strip = doc.add('.chrome-strip', element(0, width, 0, 64));
  doc.add('body>header', element(0, width, 0, 66));
  doc.add('#vildaHeaderSearch', element()); doc.add('.chrome-chips', element(width - 112, 96));
  const footer = doc.add('footer.site-footer', element(248, 912, 900, 100));
  footer.add('.site-footer__inner', element(248, 912, 900, 90));
  configure({ doc, win, strip });
  vm.runInNewContext(geometry, { window: win });
  const flush = () => { let passes = 0; while (pending.size) { if (++passes > 10) throw Error('layout loop'); const [id, fn] = pending.entries().next().value; pending.delete(id); fn(); } };
  flush();
  return { doc, win, strip, footer, observers, resizeObservers, pending, flush, refresh: () => { win.VildaHeaderLayout.refresh(); flush(); }, value: name => doc.documentElement.style.getPropertyValue(name) };
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

  it.each([
    ['sticky', 0, '66px'], ['fixed', 0, '66px'],
    ['sticky', 59, '125px'], ['fixed', 59, '125px'],
  ])('keeps the %s header edge at inset %ipx stable across scroll and refresh', (position, inset, expected) => {
    let header;
    const e = setup('/index.html', 1440, ({ doc, win }) => {
      form(doc);
      header = doc.querySelector('body>header');
      header.offsetTop = inset; header.top = inset;
      win.getComputedStyle = () => ({ position, top: `${inset}px` });
    });
    expect(e.value('--chrome-layout-header-height')).toBe(expected);
    // The real listener must reread a sticky header's stable CSS inset, not
    // publish its growing document offset as the height of the application bar.
    for (const scroll of [863, 1200, 0]) {
      e.win.scrollY = scroll; header.offsetTop = inset + scroll;
      e.win.dispatch('scroll'); e.flush();
      expect(e.value('--chrome-layout-header-height')).toBe(expected);
      e.win.VildaHeaderLayout.refreshNow();
      expect(e.value('--chrome-layout-header-height')).toBe(expected);
    }
  });

  it.each(['static', 'relative'])('preserves the actual flow offset for a %s header', position => {
    let header;
    const e = setup('/index.html', 1440, ({ doc, win }) => {
      form(doc);
      header = doc.querySelector('body>header');
      header.offsetTop = 17; header.top = 17;
      win.getComputedStyle = () => ({ position, top: '59px' });
    });
    expect(e.value('--chrome-layout-header-height')).toBe('83px');
    e.win.scrollY = 863; header.top = 17 - 863;
    e.win.dispatch('scroll'); e.flush();
    expect(e.value('--chrome-layout-header-height')).toBe('83px');
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

  it('prefers the visible patient card to the hidden form and leaves the brand clear at narrow desktop widths', () => {
    for (const [width, expectedSearchWidth] of [[992, '660px'], [1024, '692px']]) {
      const child = document('/docpro.html', width - 20);
      const cards = form(child, 248, 320, width - 40);
      for (const node of Object.values(cards)) node.visibility = 'hidden';
      child.defaultView.getComputedStyle = node => ({ visibility: node.visibility || 'visible' });
      child.add('.vilda-auth-root', element(0, width - 20));
      child.add('.vilda-auth-root .vilda-auth-card', element(12, width - 44));
      const frame = element(20, width - 20); frame.contentDocument = child;
      const e = setup('/app.html', width, ({ doc }) => {
        doc.frames.push(frame); doc.add('.chrome-brand', element(16, 184));
      });
      // The card starts at32px in the host, inside the brand. Its action edge
      // remains at the card's right border while Search begins after the brand.
      expect(e.value('--chrome-form-left')).toBe('212px');
      expect(e.value('--chrome-form-width')).toBe(expectedSearchWidth);
      expect(e.value('--chrome-actions-right')).toBe('12px');
    }
  });

  it('observes a late patient card, its replacement and resize, then restores the form when the card closes', () => {
    const child = document('/docpro.html', 1178);
    form(child, 12, 450, 1168);
    child.add('.main-content', element(12, 1156));
    child.defaultView.getComputedStyle = node => ({ visibility: node.visibility || 'visible' });
    const frame = element(248, 1184); frame.contentDocument = child;
    const e = setup('/app.html', 1440, ({ doc }) => {
      doc.frames.push(frame); doc.add('.chrome-brand', element(16, 184));
    });
    const edges = () => [e.value('--chrome-form-left'), e.value('--chrome-form-width'), e.value('--chrome-actions-right')];
    const mutate = (node, type = 'childList') => {
      const observer = e.observers.find(item => !item.disconnected
        && item.observations.some(entry => entry.node === node && entry.options[type]));
      expect(observer, `the actual observer watches ${type} on the changed node`).toBeDefined();
      observer.fn([{ type, target: node }]); e.flush();
    };
    expect(edges()).toEqual(['260px', '450px', '24px']);
    const root = child.add('.vilda-auth-root', element(0, 1178));
    child.add('.vilda-auth-root .vilda-auth-card', element(20, 900));
    mutate(child.body);
    expect(edges()).toEqual(['268px', '792px', '272px']);
    const replacement = child.add('.vilda-auth-root .vilda-auth-card', element(40, 1000));
    mutate(root);
    expect(edges()).toEqual(['288px', '892px', '152px']);
    replacement.left = 60; replacement.width = 800;
    const sizeObserver = e.resizeObservers.find(observer => observer.nodes.includes(replacement));
    expect(sizeObserver, 'the replacement card is observed for real size changes').toBeDefined();
    sizeObserver.fn([{ target: replacement }]); e.flush();
    expect(edges()).toEqual(['308px', '692px', '332px']);
    root.visibility = 'hidden'; mutate(root, 'attributes');
    expect(edges()).toEqual(['260px', '450px', '24px']);
    child.add('.vilda-auth-root', null); child.add('.vilda-auth-root .vilda-auth-card', null);
    mutate(child.body);
    expect(edges()).toEqual(['260px', '450px', '24px']);
  });

  it('settles route markers and reads the final iframe origin synchronously before the next frame', () => {
    const settings = document('/ustawienia.html', 853), start = document('/index.html', 928);
    settings.add('.main-content', element(0, 853)); form(start, 12, 450, 918);
    const settingsFrame = element(270, 853), startFrame = element(270, 938);
    settingsFrame.contentDocument = settings; startFrame.contentDocument = start; startFrame.hidden = true;
    const e = setup('/app.html', 1440, ({ doc }) => doc.frames.push(settingsFrame, startFrame));
    // The fake DOM models only CSS reflow: production update must read its
    // origin after changing both the route marker and scrollbar property.
    let reads = 0;
    startFrame.getBoundingClientRect = () => {
      reads += 1;
      const settled = e.doc.documentElement.classList.contains('vilda-form-layout')
        && e.value('--chrome-pane-scrollbar-width') === '10px';
      return { left: settled ? 258 : 270, width: 938, top: 66, height: 934 };
    };
    settingsFrame.hidden = true; startFrame.hidden = false;
    e.win.VildaHeaderLayout.refresh();
    expect(e.pending.size).toBe(1);
    e.win.VildaHeaderLayout.refreshNow();
    expect(e.pending.size, 'the queued stale layout pass is cancelled').toBe(0);
    expect(e.doc.documentElement.classList.contains('vilda-form-layout')).toBe(true);
    expect(start.documentElement.classList.contains('vilda-form-host-desktop')).toBe(true);
    expect(e.value('--chrome-form-left')).toBe('270px');
    const synchronousReads = reads;
    e.flush();
    expect(reads).toBe(synchronousReads);
    startFrame.hidden = true; settingsFrame.hidden = false;
    e.win.VildaHeaderLayout.refreshNow();
    expect(e.doc.documentElement.classList.contains('vilda-form-layout')).toBe(false);
    expect(e.value('--chrome-pane-scrollbar-width')).toBe('0px');
    expect(e.value('--chrome-form-left')).toBe('270px');
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

  it('keeps the two-card form stable when results appear below it and releases it for comparison within the form', () => {
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
    expect(e.doc.documentElement.classList.contains('vilda-form-fit-viewport')).toBe(true);
    expect(e.doc.documentElement.classList.contains('vilda-form-only-patient')).toBe(false);
    comparison.hidden = false; e.refresh();
    expect(e.doc.documentElement.classList.contains('vilda-form-fit-viewport')).toBe(false);
    comparison.hidden = true; e.refresh();
    expect(e.doc.documentElement.classList.contains('vilda-form-fit-viewport')).toBe(true);
  });
});

describe('production header icon markup', () => {
  it('renders one 20px lupa button for both breakpoints without a header draft input', () => {
    const context = vm.createContext({}); vm.runInContext(markup, context);
    const html = context.Ch_searchMarkup();
    expect(html).toContain('<svg width="20" height="20"');
    expect(context.Ch_searchIcon()).toContain('<svg width="20" height="20"');
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).toContain('id="vildaHeaderSearchBtn"');
    expect(html).toContain('type="button"');
    expect(html).not.toMatch(/<(input|form)\b/);
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
