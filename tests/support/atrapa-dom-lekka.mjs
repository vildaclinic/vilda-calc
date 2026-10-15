/**
 * Lekka atrapa DOM dla testów widoków budowanych przez createElement (bez innerHTML i bez CSS).
 * Repozytorium nie ma jsdom; ta atrapa daje tyle, ile potrzebują moduły rysujące drzewo elementów:
 * atrybuty, klasy, tekst, dzieci, zdarzenia (click z bąbelkowaniem do rodziców), isConnected względem
 * dokumentu, querySelector(All) dla prostych selektorów (.klasa, #id, tag, [atrybut], [atrybut="wartość"],
 * połączenia bez spacji, np. button.klasa[aria-pressed="true"]) i hidden. Dla modułów montowanych na
 * stronie: getElementById, insertBefore/nextSibling, createElementNS (SVG jako zwykłe elementy),
 * zdarzenia na dokumencie (addEventListener/dispatchEvent) i readyState „complete”.
 *
 * Użycie: const doc = atrapaDokumentu(); const host = doc.createElement('div'); doc.body.appendChild(host);
 */

function pasuje(element, selektor) {
  const tag = /^[a-z][a-z0-9-]*/i.exec(selektor);
  const reszta = selektor.slice(tag ? tag[0].length : 0);
  const czesci = (tag ? [tag[0]] : []).concat(reszta.match(/\.[\w-]+|#[\w-]+|\[[^\]]+\]/g) || []);
  if (czesci.join('') !== selektor) throw new Error(`atrapa DOM: nieobsługiwany selektor ${selektor}`);
  return czesci.every((czesc) => {
    if (czesc[0] === '.') return element.classList.contains(czesc.slice(1));
    if (czesc[0] === '#') return element.id === czesc.slice(1);
    if (czesc[0] === '[') {
      const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(czesc);
      if (!m) throw new Error(`atrapa DOM: nieobsługiwany selektor ${czesc}`);
      return m[2] === undefined ? element.hasAttribute(m[1]) : element.getAttribute(m[1]) === m[2];
    }
    return element.tagName === czesc.toUpperCase();
  });
}

class AtrapaClassList {
  constructor(element) { this.element = element; }
  get lista() { return String(this.element.className || '').split(/\s+/).filter(Boolean); }
  contains(nazwa) { return this.lista.includes(nazwa); }
  add(...nazwy) { this.element.className = [...new Set([...this.lista, ...nazwy])].join(' '); }
  remove(...nazwy) { this.element.className = this.lista.filter((n) => !nazwy.includes(n)).join(' '); }
  toggle(nazwa, wymus) {
    const ma = wymus === undefined ? !this.contains(nazwa) : !!wymus;
    if (ma) this.add(nazwa); else this.remove(nazwa);
    return ma;
  }
}

class AtrapaElement {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.atrybuty = new Map();
    this.sluchacze = new Map();
    this.className = '';
    this.wlasnyTekst = '';
    this.hidden = false;
    this.id = '';
    this.classList = new AtrapaClassList(this);
  }
  get firstChild() { return this.children[0] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const rodzenstwo = this.parentNode.children;
    return rodzenstwo[rodzenstwo.indexOf(this) + 1] || null;
  }
  get clientWidth() { return 0; }
  insertBefore(dziecko, przed) {
    if (!przed) return this.appendChild(dziecko);
    if (dziecko.parentNode) dziecko.parentNode.removeChild(dziecko);
    const i = this.children.indexOf(przed);
    if (i === -1) throw new Error('atrapa DOM: insertBefore — element odniesienia nie jest dzieckiem');
    dziecko.parentNode = this;
    this.children.splice(i, 0, dziecko);
    return dziecko;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(wezel) {
    for (let w = wezel; w; w = w.parentNode) if (w === this) return true;
    return false;
  }
  focus() { this.ownerDocument.activeElement = this; }
  get isConnected() {
    let wezel = this;
    while (wezel.parentNode) wezel = wezel.parentNode;
    return wezel === this.ownerDocument.documentElement;
  }
  get textContent() { return this.wlasnyTekst + this.children.map((c) => c.textContent).join(''); }
  set textContent(wartosc) { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this.wlasnyTekst = String(wartosc); }
  appendChild(dziecko) {
    if (dziecko.parentNode) dziecko.parentNode.removeChild(dziecko);
    dziecko.parentNode = this;
    this.children.push(dziecko);
    return dziecko;
  }
  removeChild(dziecko) {
    const i = this.children.indexOf(dziecko);
    if (i === -1) throw new Error('atrapa DOM: removeChild — to nie jest dziecko tego elementu');
    this.children.splice(i, 1);
    dziecko.parentNode = null;
    return dziecko;
  }
  setAttribute(nazwa, wartosc) {
    if (nazwa === 'class') this.className = String(wartosc);
    else if (nazwa === 'id') this.id = String(wartosc);
    else this.atrybuty.set(nazwa, String(wartosc));
  }
  getAttribute(nazwa) {
    if (nazwa === 'class') return this.className || null;
    if (nazwa === 'id') return this.id || null;
    if (nazwa === 'type' && this.type !== undefined) return this.type;
    return this.atrybuty.has(nazwa) ? this.atrybuty.get(nazwa) : null;
  }
  hasAttribute(nazwa) { return this.getAttribute(nazwa) !== null; }
  removeAttribute(nazwa) { this.atrybuty.delete(nazwa); }
  addEventListener(typ, fn) {
    if (!this.sluchacze.has(typ)) this.sluchacze.set(typ, []);
    this.sluchacze.get(typ).push(fn);
  }
  dispatch(typ) {
    const zdarzenie = { type: typ, target: this, domyslneZatrzymane: false, preventDefault() { this.domyslneZatrzymane = true; } };
    for (let wezel = this; wezel; wezel = wezel.parentNode) (wezel.sluchacze.get(typ) || []).forEach((fn) => fn(zdarzenie));
    return zdarzenie;
  }
  click() { return this.dispatch('click'); }
  potomkowie() { return this.children.flatMap((c) => [c, ...c.potomkowie()]); }
  querySelectorAll(selektory) {
    const lista = selektory.split(',').map((s) => s.trim());
    return this.potomkowie().filter((el) => lista.some((s) => {
      const kroki = s.split(/\s+/);
      if (!pasuje(el, kroki[kroki.length - 1])) return false;
      let przodek = el.parentNode, k = kroki.length - 2;
      while (k >= 0 && przodek && przodek !== this.parentNode) {
        if (pasuje(przodek, kroki[k])) k -= 1;
        przodek = przodek.parentNode;
      }
      return k < 0;
    }));
  }
  querySelector(selektory) { return this.querySelectorAll(selektory)[0] || null; }
}

export function atrapaDokumentu() {
  const doc = { readyState: 'complete', activeElement: null };
  const sluchacze = new Map();
  doc.createElement = (tag) => new AtrapaElement(doc, tag);
  doc.createElementNS = (_ns, tag) => new AtrapaElement(doc, tag);
  doc.documentElement = new AtrapaElement(doc, 'html');
  doc.body = doc.documentElement.appendChild(new AtrapaElement(doc, 'body'));
  doc.getElementById = (id) => doc.documentElement.potomkowie().find((el) => el.id === id) || null;
  doc.addEventListener = (typ, fn) => {
    if (!sluchacze.has(typ)) sluchacze.set(typ, []);
    sluchacze.get(typ).push(fn);
  };
  doc.dispatchEvent = (zdarzenie) => { (sluchacze.get(zdarzenie.type) || []).slice().forEach((fn) => fn(zdarzenie)); return true; };
  return doc;
}

/** Tekst elementów pasujących do selektora (do asercji). */
export const teksty = (korzen, selektor) => korzen.querySelectorAll(selektor).map((el) => el.textContent);
