import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const source = fs.readFileSync(new URL('../../vilda_chrome.js', import.meta.url), 'utf8');
const tooltipSource = source.slice(source.indexOf('var M=null;'), source.indexOf('function Bt()'));

function environment({ phone = true, inDrawer = true, width = 956, height = 440 } = {}) {
  const styles = new Map([
    ['--vilda-safe-top', '0px'], ['--vilda-safe-left', '62px'],
    ['--vilda-safe-right', '62px'], ['--vilda-safe-bottom', '21px'],
  ]);
  const rect = { left: 700, right: 860, top: 380, height: 44 };
  const events = target => {
    const listeners = new Map();
    target.addEventListener = (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    };
    target.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
    target.fire = type => [...(listeners.get(type) || [])].forEach(fn => fn());
    target.listenerCount = type => listeners.get(type)?.size || 0;
    return target;
  };
  const tips = [], timers = [];
  const container = () => events({ appendChild: node => { node.parentNode = true; tips.push(node); }, contains: () => inDrawer });
  const drawer = container();
  const doc = events({
    body: container(),
    documentElement: { classList: { contains: name => name === 'vilda-phone' && phone } },
    createElement: () => ({
      offsetWidth: 280, offsetHeight: 80, style: {}, attributes: {},
      classList: { add: vi.fn(), remove: vi.fn() },
      setAttribute(name, value) { this.attributes[name] = value; },
      remove() { this.parentNode = null; },
    }),
  });
  const win = events({
    innerWidth: width, innerHeight: height,
    getComputedStyle: () => ({ getPropertyValue: name => styles.get(name) || '' }),
    requestAnimationFrame: fn => fn(),
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); },
    alert: vi.fn(),
  });
  const show = new Function('r', 'o', 'Cm_drawer', `${tooltipSource};return F;`)(win, doc, { element: drawer });
  const trigger = { getBoundingClientRect: () => rect };
  return { show: text => show(trigger, text), win, doc, drawer, rect, styles, tips, timers };
}

describe('Chrome: dymek menu respektuje bezpieczny obszar telefonu', () => {
  it('rzeczywisty showTip nie zasłania prawego wycięcia ani dolnego wskaźnika', () => {
    const h = environment();
    h.show('Przykładowy powód niedostępności');
    const tip = h.tips[0];
    expect(parseFloat(tip.style.left)).toBeGreaterThanOrEqual(70);
    expect(parseFloat(tip.style.left) + tip.offsetWidth).toBeLessThanOrEqual(886);
    expect(parseFloat(tip.style.top) + tip.offsetHeight).toBeLessThanOrEqual(415);
    expect(tip.attributes).toEqual({ role: 'status', 'aria-live': 'polite' });
    expect(h.win.alert).not.toHaveBeenCalled();
  });

  it('chroni lewą stronę także gdy przycisk znajduje się przy krawędzi viewportu', () => {
    const h = environment({ width: 440 });
    h.rect.left = 4; h.rect.right = 48;
    h.show('Dane demonstracyjne');
    expect(parseFloat(h.tips[0].style.left)).toBe(70);
  });

  it('respektuje górny inset po powrocie do pionu', () => {
    const h = environment({ width: 440, height: 956 });
    h.styles.set('--vilda-safe-top', '54px');
    h.styles.set('--vilda-safe-left', '0px'); h.styles.set('--vilda-safe-right', '0px');
    h.rect.left = 15; h.rect.right = 280; h.rect.top = 20;
    h.show('Dane demonstracyjne');
    expect(parseFloat(h.tips[0].style.top)).toBe(58);
    expect(parseFloat(h.tips[0].style.left)).toBeGreaterThanOrEqual(8);
  });

  it('obrót i scroll menu aktualizują położenie istniejącego dymka', () => {
    const h = environment();
    h.show('Powód pozostaje widoczny');
    const tip = h.tips[0], previousLeft = tip.style.left;
    h.win.innerWidth = 440; h.win.innerHeight = 956;
    h.styles.set('--vilda-safe-left', '0px'); h.styles.set('--vilda-safe-right', '0px');
    h.rect.left = 10; h.rect.right = 54; h.rect.top = 120;
    h.win.fire('resize');
    expect(tip.style.left).not.toBe(previousLeft);
    expect(parseFloat(tip.style.left) + tip.offsetWidth).toBeLessThanOrEqual(432);
    const top = tip.style.top;
    h.rect.top = 250; h.drawer.fire('scroll');
    expect(tip.style.top).not.toBe(top);
    expect(h.tips).toHaveLength(1);
  });

  it('po wygaśnięciu usuwa obserwowanie geometrii i dokumentu', () => {
    const h = environment(); h.show('Dane demonstracyjne');
    h.timers.find(timer => timer.delay === 0).fn();
    expect(h.win.listenerCount('resize')).toBe(1);
    expect(h.drawer.listenerCount('scroll')).toBe(1);
    expect(h.doc.listenerCount('click')).toBe(1);
    h.timers.find(timer => timer.delay === 3000).fn();
    expect(h.win.listenerCount('resize')).toBe(0);
    expect(h.drawer.listenerCount('scroll')).toBe(0);
    expect(h.doc.listenerCount('click')).toBe(0);
    h.timers.find(timer => timer.delay === 200).fn();
    expect(h.tips[0].parentNode).toBeNull();
  });

  it('zastąpienie dymka nie mnoży obserwatorów', () => {
    const h = environment(); h.show('Pierwszy'); h.show('Drugi');
    expect(h.win.listenerCount('resize')).toBe(1);
    expect(h.drawer.listenerCount('scroll')).toBe(1);
    h.timers.filter(timer => timer.delay === 0).forEach(timer => timer.fn());
    expect(h.doc.listenerCount('click')).toBe(1);
    expect(h.tips[1].textContent).toBe('Drugi');
  });

  it('tekst powodu pozostaje tekstem, a poza menu działa dotychczasowy tooltip strony', () => {
    const h = environment(); h.show('<img src=x onerror=alert(1)>');
    expect(h.tips[0].textContent).toBe('<img src=x onerror=alert(1)>');
    expect(h.tips[0].innerHTML).toBeUndefined();
    const outside = environment({ inDrawer: false }); outside.win.showTooltip = vi.fn();
    outside.show('Poza menu');
    expect(outside.win.showTooltip).toHaveBeenCalledOnce();
    expect(outside.tips).toHaveLength(0);
  });
});
