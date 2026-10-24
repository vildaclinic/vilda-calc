import { describe, expect, it, vi } from 'vitest';
import { nasluchy, powloka } from '../support/powloka-harness.mjs';

// Cały produkcyjny vilda_shell.js. Atrapa pozwala rozdzielić sygnały, które
// Safari może doręczyć w innych klatkach: viewport, orientacja i chrome.
function telefon({ phone = true } = {}) {
  const writes = [], observers = [];
  const geometry = { top: 59, header: 91, dock: 105, viewport: 956, layout: 956 };
  let main, header, dock;
  const p = powloka(null, (win, doc) => {
    if (phone) doc.documentElement.classList.add('vilda-phone');
    win.innerWidth = 440; win.innerHeight = 956;
    Object.defineProperty(doc.documentElement, 'clientHeight', { get: () => geometry.layout });
    win.visualViewport = nasluchy({ get height() { return geometry.viewport; } });
    main = doc.createElement('main'); header = doc.createElement('header'); dock = doc.createElement('nav');
    Object.defineProperty(main.style, 'height', {
      get: () => writes.at(-1), set(value) { writes.push(value); },
    });
    Object.defineProperty(header, 'offsetTop', { get: () => geometry.top });
    header.getBoundingClientRect = () => ({ height: geometry.header });
    dock.getBoundingClientRect = () => ({ top: geometry.layout - geometry.dock, height: 84 });
    const oldGetById = doc.getElementById;
    doc.getElementById = (id) => id === 'mobileBottomDock' ? dock : oldGetById(id);
    const create = doc.createElement;
    doc.createElement = (tag) => {
      const element = create(tag);
      if (tag === 'iframe') {
        const child = element.contentDocument, getById = child.getElementById;
        child.getElementById = (id) => child.body.children.find(node => node.id === id) || getById(id);
      }
      return element;
    };
    doc.querySelector = (selector) => selector === '.app-shell-main' ? main : selector === 'header' ? header : null;
    win.ResizeObserver = class {
      constructor(callback) { this.callback = callback; this.nodes = new Set(); observers.push(this); }
      observe(node) { this.nodes.add(node); }
      unobserve(node) { this.nodes.delete(node); }
    };
    win.scrollTo = vi.fn(() => { win.scrollY = 0; });
  });
  const frame = p.load('docpro');
  p.tick(100); writes.length = 0;
  function resize({ width = 956, height = 440, mode = true, focused = false, keyboard = 0 } = {}) {
    p.win.innerWidth = width; p.win.innerHeight = height - keyboard;
    geometry.layout = height; geometry.viewport = height - keyboard;
    geometry.top = mode ? 0 : 59; geometry.header = mode ? 52 : 91; geometry.dock = mode ? 77 : 105;
    if (focused) frame.contentDocument.activeElement = { tagName: 'INPUT', getAttribute: () => 'text' };
    p.doc.documentElement.classList.toggle('vilda-phone-landscape', mode);
    p.doc.dispatchEvent({ type: 'vilda:phone-layout-changed', detail: { phone, landscape: mode } });
    p.win.dispatchEvent({ type: 'resize' });
    p.win.visualViewport.dispatchEvent({ type: 'resize' });
    p.win.dispatchEvent({ type: 'orientationchange' });
  }
  return { p, frame, writes, geometry, observers, main, header, dock, resize };
}

describe('powłoka — spójny pomiar przy obrocie telefonu', () => {
  it('grupa zdarzeń mierzy raz przed kolejną klatką, bez poprawki po 200 ms', () => {
    const h = telefon(); h.resize();
    expect(h.writes).toEqual([]);
    h.p.tick(15); expect(h.writes).toEqual([]);
    h.p.tick(1); expect(h.writes).toEqual(['388px']);
    expect([...h.p.timery.values()].some(timer => timer.ms === 200)).toBe(false);
    h.p.tick(250); expect(h.writes).toEqual(['388px']);
  });

  it('wczesna fizyczna orientacja nie wymusza nieaktualnego rozmiaru', () => {
    const h = telefon();
    h.p.win.dispatchEvent({ type: 'orientationchange' });
    h.p.tick(16); expect(h.writes).toEqual([]);
    h.resize(); h.p.tick(16);
    expect(h.writes).toEqual(['388px']);
    h.p.win.dispatchEvent({ type: 'orientationchange' });
    h.p.tick(250); expect(h.writes).toEqual(['388px']);
  });

  it('rzeczywista późniejsza zmiana nagłówka odświeża wysokość przez ResizeObserver', () => {
    const h = telefon(); h.resize(); h.p.tick(16);
    const observer = h.observers.find(o => o.nodes.has(h.header));
    expect(observer.nodes.has(h.dock)).toBe(true);
    expect(observer.nodes.has(h.main), 'nie obserwujemy wysokości, którą sami zapisujemy').toBe(false);
    h.geometry.header = 56;
    observer.callback([{ target: h.header }]); observer.callback([{ target: h.header }]);
    h.p.tick(16); expect(h.writes).toEqual(['388px', '384px']);
  });

  it('późny safe-area przesuwa nagłówek bez zmiany jego wysokości — content-box body uruchamia pomiar', () => {
    const h = telefon(); h.resize(); h.p.tick(16);
    const observer = h.observers.find(o => o.nodes.has(h.p.doc.body));
    expect(observer).toBeTruthy();
    h.geometry.top = 6;
    observer.callback([{ target: h.p.doc.body }]);
    h.p.tick(16); expect(h.writes).toEqual(['388px', '382px']);
  });

  it('zmiana Docka aktualizuje rezerwę w aktywnym i ukrytym dokumencie w tej samej klatce', () => {
    const h = telefon();
    h.p.shell.navigate('start'); const other = h.p.load('start'); h.p.shell.navigate('docpro');
    h.resize(); h.p.tick(16);
    const spacer = frame => frame.contentDocument.body.children.find(el => el.id === 'vilda-shell-dock-spacer');
    expect(spacer(h.frame).style.height).toBe('77px');
    expect(spacer(other).style.height).toBe('77px');
  });

  it('sama klawiatura nadal zamraża wysokość i zachowuje przesunięcie powłoki i fokus', () => {
    const h = telefon();
    const input = { tagName: 'INPUT', getAttribute: () => 'text' };
    h.frame.contentDocument.activeElement = input;
    h.p.win.innerHeight = 620; h.geometry.viewport = 620; h.p.win.scrollY = 40;
    h.p.win.dispatchEvent({ type: 'resize' }); h.p.win.visualViewport.dispatchEvent({ type: 'resize' });
    h.p.tick(250);
    expect(h.writes).toEqual([]);
    expect(h.p.win.scrollY).toBe(40);
    expect(h.p.win.scrollTo).not.toHaveBeenCalled();
    expect(h.frame.contentDocument.activeElement).toBe(input);
  });

  it('rzeczywisty obrót z aktywnym polem porzuca wysokość pionową, lecz nie mierzy samego pasa nad klawiaturą', () => {
    const h = telefon(); h.p.win.scrollY = 40;
    h.resize({ focused: true, keyboard: 200 });
    const input = h.frame.contentDocument.activeElement;
    h.p.tick(16);
    expect(h.writes).toEqual(['388px']);
    expect(h.p.win.scrollY).toBe(40);
    expect(h.frame.contentDocument.activeElement).toBe(input);
    const spacer = h.frame.contentDocument.body.children.find(el => el.id === 'vilda-shell-dock-spacer');
    expect(spacer.style.height).toBe('77px');
    h.geometry.viewport = 200; h.p.win.innerHeight = 200;
    h.p.win.visualViewport.dispatchEvent({ type: 'resize' }); h.p.win.dispatchEvent({ type: 'resize' });
    h.p.tick(250); expect(h.writes).toEqual(['388px']); expect(h.p.win.scrollY).toBe(40);
  });

  it('powrót do pionu przy aktywnym polu odbudowuje pełną wysokość pionową', () => {
    const h = telefon(); h.resize({ focused: true, keyboard: 200 }); h.p.tick(16);
    h.resize({ width: 440, height: 956, mode: false, focused: true, keyboard: 336 }); h.p.tick(16);
    expect(h.writes).toEqual(['388px', '806px']);
  });

  it('spóźniony visualViewport poprzedniej orientacji nie zatruwa zamrożonej bazy aktywnego pola', () => {
    const h = telefon(); h.resize({ focused: true, keyboard: 200 });
    h.geometry.viewport = 956; // VV jeszcze portretowy, layout viewport już poziomy.
    h.p.tick(16); expect(h.writes).toEqual(['388px']);
    h.geometry.viewport = 240; h.p.win.visualViewport.dispatchEvent({ type: 'resize' });
    h.p.tick(16); expect(h.writes).toEqual(['388px']);
    h.resize({ width: 440, height: 956, mode: false, focused: true, keyboard: 336 });
    h.geometry.viewport = 240; // odwrotna kolejność przy powrocie do pionu.
    h.p.tick(16); expect(h.writes).toEqual(['388px', '806px']);
    h.geometry.viewport = 620; h.p.win.visualViewport.dispatchEvent({ type: 'resize' });
    h.p.tick(16); expect(h.writes).toEqual(['388px', '806px']);
  });

  it('po obrocie z fokusem późny chrome i safe-area korygują geometrię, ale sama klawiatura jej nie zmienia', () => {
    const h = telefon(); h.resize({ focused: true, keyboard: 200 }); h.p.tick(16);
    h.geometry.header = 54; h.geometry.top = 6;
    const observer = h.observers.find(o => o.nodes.has(h.header));
    observer.callback([{ target: h.header }, { target: h.p.doc.body }]);
    h.p.tick(16); expect(h.writes).toEqual(['388px', '380px']);
    h.geometry.viewport = 180; h.p.win.innerHeight = 180;
    h.p.win.visualViewport.dispatchEvent({ type: 'resize' }); h.p.tick(250);
    expect(h.writes).toEqual(['388px', '380px']);
  });

  it('focusout odblokowuje aktualny pomiar, a przejście do kolejnego pola zachowuje freeze', () => {
    const h = telefon(); h.resize({ focused: true, keyboard: 200 }); h.p.tick(16);
    h.geometry.viewport = 180; h.p.win.innerHeight = 180;
    h.frame.contentDocument.dispatchEvent({ type: 'focusout' }); h.p.tick(16);
    expect(h.writes).toEqual(['388px']);
    h.frame.contentDocument.activeElement = h.frame.contentDocument.body;
    h.geometry.viewport = 438; h.p.win.innerHeight = 438;
    h.frame.contentDocument.dispatchEvent({ type: 'focusout' }); h.p.tick(16);
    expect(h.writes).toEqual(['388px', '386px']);
  });

  it('zwykły obrót wyrównuje tylko powłokę — nigdy przewinięcie dokumentu pacjenta', () => {
    const h = telefon();
    h.frame.contentWindow.scrollY = 500; h.frame.contentWindow.scrollTo = vi.fn();
    h.p.win.scrollY = 30; h.resize(); h.p.tick(16);
    expect(h.p.win.scrollY).toBe(0);
    expect(h.frame.contentWindow.scrollY).toBe(500);
    expect(h.frame.contentWindow.scrollTo).not.toHaveBeenCalled();
  });

  it('desktop zachowuje dotychczasowy bezpośredni pomiar resize', () => {
    const h = telefon({ phone: false });
    h.geometry.viewport = 900; h.p.win.dispatchEvent({ type: 'resize' });
    expect(h.writes).toEqual(['750px']);
  });
});
