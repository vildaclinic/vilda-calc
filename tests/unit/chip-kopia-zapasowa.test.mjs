import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../vilda_chrome.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest' });

function nodes(root) {
  const found = [];
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.type === 'string') found.push(value);
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  }
  visit(root);
  return found;
}

const declarations = nodes(ast).filter((node) => node.type === 'FunctionDeclaration');
const header = declarations.find((node) => node.id?.name === 'tt');
if (!header) throw new Error('Nie znaleziono produkcyjnego montowania nagłówka tt().');
const registrations = nodes(header).filter((node) => {
  if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') return false;
  if (node.callee.object.name !== 'o' || node.callee.property.name !== 'addEventListener') return false;
  if (node.arguments[0]?.value !== 'click') return false;
  const callbackNodes = nodes(node.arguments[1]);
  return callbackNodes.some((child) => child.type === 'Literal' && child.value === 'vildaPatientChip')
    && callbackNodes.some((child) => child.type === 'CallExpression' && child.callee.name === 'te');
});
if (registrations.length !== 1) throw new Error('Oczekiwano jednego listenera document.click zamykającego chip.');

// Wycinamy rejestrację rzeczywistego listenera oraz produkcyjne helpery Cm_*.
// DOM i te() są podstawione; decyzja o zamknięciu pozostaje w kodzie aplikacji.
const registration = source.slice(registrations[0].start, registrations[0].end);
const helpers = declarations.filter((node) => node.id?.name.startsWith('Cm_'))
  .map((node) => source.slice(node.start, node.end)).join('\n');

class Element {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.nodeType = 1;
    this.attributes = attributes;
    this.children = [];
    this.parentElement = null;
  }
  append(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }
  contains(target) {
    return this === target || this.children.some((child) => child === target || child.contains?.(target));
  }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  getAttribute(name) { return this.hasAttribute(name) ? this.attributes[name] : null; }
  closest(selector) {
    if (selector !== 'a[download]') throw new Error(`Nieobsługiwany selektor fixture: ${selector}`);
    for (let current = this; current; current = current.parentElement) {
      if (current.tagName === 'A' && current.hasAttribute('download')) return current;
    }
    return null;
  }
}

function fixture() {
  const body = new Element('body');
  const chip = body.append(new Element('button', { id: 'vildaPatientChip' }));
  const chipChild = chip.append(new Element('span'));
  const popup = body.append(new Element('div'));
  const popupChild = popup.append(new Element('button'));
  const outside = body.append(new Element('button'));
  const ordinaryLink = body.append(new Element('a', { href: 'ustawienia.html' }));
  // Tak jak fallback eksportu: link z download w body, poza chipem i popupem.
  const download = body.append(new Element('a', { download: 'fikcyjna-kopia.wiw', href: 'blob:fikcyjna-kopia' }));
  const emptyDownload = body.append(new Element('a', { download: '', href: 'blob:fikcyjna-kopia' }));
  const downloadChild = download.append(new Element('span'));
  const text = outside.append({ nodeType: 3, parentElement: null });
  const close = vi.fn();
  const listeners = new Map();
  const document = {
    getElementById: (id) => id === 'vildaPatientChip' ? chip : null,
    addEventListener(type, listener) {
      if (listeners.has(type)) throw new Error(`Powtórzony listener ${type}`);
      listeners.set(type, listener);
    },
    dispatchEvent(event) {
      const listener = listeners.get(event.type);
      if (!listener) throw new Error('Produkcja nie zarejestrowała document.click.');
      listener(event);
    },
  };
  new Function('o', 'h', 'te', `${helpers}\nvar O=true;${registration};`)(document, popup, close);
  const click = (target, isTrusted) => {
    const event = { type: 'click', target };
    Object.defineProperty(event, 'isTrusted', { value: isTrusted });
    document.dispatchEvent(event);
  };
  return { close, click, download, emptyDownload, downloadChild, outside, ordinaryLink, chip, chipChild, popup, popupChild, text };
}

describe('Chip pacjenta — kliknięcie automatycznej kopii poza popupem', () => {
  it.each(['download', 'emptyDownload', 'downloadChild'])('programowy klik a[download] (%s) nie zamyka otwartego popupu', (target) => {
    const env = fixture();
    env.click(env[target], false);
    expect(env.close).not.toHaveBeenCalled();
  });

  it.each(['outside', 'download'])('rzeczywisty klik poza popupem (%s) nadal go zamyka', (target) => {
    const env = fixture();
    env.click(env[target], true);
    expect(env.close).toHaveBeenCalledOnce();
  });

  it.each(['outside', 'ordinaryLink'])('programowy klik poza popupem bez download (%s) zachowuje zamknięcie', (target) => {
    const env = fixture();
    env.click(env[target], false);
    expect(env.close).toHaveBeenCalledOnce();
  });

  it.each(['chip', 'chipChild', 'popup', 'popupChild'])('klik wewnątrz %s pozostawia popup otwarty', (target) => {
    const env = fixture();
    env.click(env[target], true);
    expect(env.close).not.toHaveBeenCalled();
  });

  it('programowy klik z tekstowym targetem poza popupem nie rzuca błędu i zamyka popup', () => {
    const env = fixture();
    expect(() => env.click(env.text, false)).not.toThrow();
    expect(env.close).toHaveBeenCalledOnce();
  });
});
