import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import { describe, expect, it, vi } from 'vitest';

// Rzeczywiste Mn i jego odczyt scrolla/fokusu z ios26-ui.js. Wycinamy AST,
// nie odtwarzamy decyzji korekty w teście. Jedynie bramka viewportu qe jest
// ustawiona na telefon, a RAF pozwala wstawić nowszą nawigację przed callbackiem.
const source = fs.readFileSync(new URL('../../ios26-ui.js', import.meta.url), 'utf8');
const names = new Set(['Mn', 've', 'Ye', 'P', 'Y']);
const functions = new Map();
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration' && names.has(node.id?.name)) {
    functions.set(node.id.name, source.slice(node.start, node.end));
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') walk(value);
  }
}
walk(parse(source, { ecmaVersion: 'latest' }));
if (functions.size !== names.size) throw new Error('Nie znaleziono rzeczywistych funkcji mobilnej korekty scrolla');

class Element {
  constructor(tagName) { this.tagName = tagName; }
  matches(selector) {
    if (selector === 'input') return this.tagName === 'INPUT';
    return ['TEXTAREA', 'SELECT'].includes(this.tagName);
  }
  getAttribute(name) { return name === 'type' ? 'text' : null; }
}

function telefon() {
  const raf = [];
  const mobile = { eligible: true };
  const root = { scrollTop: 0, scrollHeight: 2000, clientHeight: 852 };
  const body = { ...root };
  const doc = { documentElement: root, body, scrollingElement: root, activeElement: body };
  const win = { location: { hash: '' }, scrollY: 0, pageYOffset: 0,
    innerHeight: 852, visualViewport: { height: 852 },
    requestAnimationFrame: vi.fn((callback) => { raf.push(callback); return raf.length; }) };
  const setTop = (top) => {
    win.scrollY = win.pageYOffset = root.scrollTop = body.scrollTop = top;
  };
  win.scrollTo = vi.fn((x, y) => setTop(y));
  const context = { window: win, document: doc, Element, qe: () => mobile.eligible };
  vm.runInNewContext([...functions.values()].join('\n'), context, { timeout: 1000 });
  return { win, doc, mobile, setTop, correction: context.Mn,
    flush: () => { expect(raf).toHaveLength(1); raf.shift()(); } };
}

describe('Mobilna korekta scrolla nie nadpisuje nowszej decyzji między Mn i RAF', () => {
  it('kontrola: niezmieniony top0 nadal ustawia1 dokładnie raz', () => {
    const h = telefon();
    expect(h.correction()).toBe(true);
    expect(h.win.scrollTo).not.toHaveBeenCalled();
    h.flush();
    expect(h.win.scrollTo).toHaveBeenCalledExactlyOnceWith(0, 1);
    expect(h.win.scrollY).toBe(1);
  });

  it('nowsze przewinięcie sekcji Settings do824 pozostaje po starszym RAF', () => {
    const h = telefon();
    expect(h.correction()).toBe(true);
    h.setTop(824); // późniejszy scrollIntoView, zanim stara korekta otrzyma klatkę
    h.flush();
    expect(h.win.scrollTo).not.toHaveBeenCalled();
    expect(h.win.scrollY).toBe(824);
    expect(h.doc.documentElement.scrollTop).toBe(824);
  });

  it('hash ustawiony po planowaniu korekty anuluje stary RAF', () => {
    const h = telefon();
    expect(h.correction()).toBe(true);
    h.win.location.hash = '#settings-section-account';
    h.flush();
    expect(h.win.scrollTo).not.toHaveBeenCalled();
    expect(h.win.scrollY).toBe(0);
  });

  it('focus pola ustawiony po planowaniu korekty anuluje stary RAF', () => {
    const h = telefon();
    expect(h.correction()).toBe(true);
    h.doc.activeElement = new Element('INPUT');
    h.flush();
    expect(h.win.scrollTo).not.toHaveBeenCalled();
    expect(h.doc.activeElement.tagName).toBe('INPUT');
    expect(h.win.scrollY).toBe(0);
  });

  it('zmiana mobilnej bramki qe przed RAF anuluje korektę', () => {
    const h = telefon();
    expect(h.correction()).toBe(true);
    h.mobile.eligible = false;
    h.flush();
    expect(h.win.scrollTo).not.toHaveBeenCalled();
    expect(h.win.scrollY).toBe(0);
  });

  it('skrócenie dokumentu do max63 przed RAF anuluje korektę', () => {
    const h = telefon();
    expect(h.correction()).toBe(true);
    h.doc.documentElement.scrollHeight = h.doc.body.scrollHeight = 915; // 915 - 852 = 63
    h.flush();
    expect(h.win.scrollTo).not.toHaveBeenCalled();
    expect(h.win.scrollY).toBe(0);
  });
});
