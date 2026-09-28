import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Naprawa 2026-08-20: recalculateVar() w flu_therapy.js od zawsze wołało
// scheduleUpdateTooltip(), które nie istniało w żadnym zasięgu (bliźniaczy mechanizm
// modułu grypowego jest prywatny wewnątrz initFluTherapyModule) — każde przeliczenie
// zaleceń VAR na docpro kończyło się ReferenceError. Funkcje deklarowane są w tym samym
// zasięgu skryptu, więc asercje źródłowe wystarczają do wykrycia regresji.

describe('moduł VAR: toast „Zalecenia zostały uaktualnione" (flu_therapy.js)', () => {
  const src = fs.readFileSync(path.join(repoRoot, 'flu_therapy.js'), 'utf8');

  it('scheduleUpdateTooltip jest zdefiniowane w tym samym zasięgu, w którym woła je recalculateVar', () => {
    expect(src).toContain('scheduleUpdateTooltip()');
    expect(src).toContain('function scheduleUpdateTooltip()');
    // definicja nie jest zagnieżdżona w initFluTherapyModule (musi być top-level, jak recalculateVar)
    const defIdx = src.indexOf('function scheduleUpdateTooltip()');
    const initEnd = (() => {
      const start = src.indexOf('function initFluTherapyModule()');
      let depth = 0;
      for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return i;
      }
      return -1;
    })();
    expect(defIdx).toBeGreaterThan(initEnd);
  });

  it('toast kotwiczy się na #varResult, ma debounce i treść jak w module grypowym', () => {
    expect(src).toContain('getElementById("varResult")');
    // tekst toastu jest w pliku w postaci escapowanej (ł = ł), jak cały minifikat
    expect(src).toContain('Zalecenia zosta\\u0142y uaktualnione');
    const fnBody = src.slice(src.indexOf('function scheduleUpdateTooltip()'));
    expect(fnBody).toContain('setTimeout');
    expect(fnBody).toContain('clearTimeout');
    expect(fnBody).toContain('varTooltip');
  });

  it('strona ładuje plik z nową wersją cache, a SW ją precache\'uje', () => {
    const page = fs.readFileSync(path.join(repoRoot, 'docpro.html'), 'utf8');
    expect(page).toMatch(/flu_therapy\.js\?v=([8-9]|\d{2,})/);
    const sw = fs.readFileSync(path.join(repoRoot, 'service-worker-kalorii.js'), 'utf8');
    expect(sw).toContain("'/flu_therapy.js?v=8',");
    // historyczne adresy zostają w precache (append-only)
    expect(sw).toContain("'/flu_therapy.js?v=7',");
  });
});

// P-VAR-TOAST (zgłoszenie właściciela 2026-09-28): na docpro, nawet przy pustym formularzu,
// „Wyczyść wszystkie pola" wywoływało przy lewej krawędzi ekranu turkusową etykietę uciętą do
// „…ły uaktualnione". To toast modułu VAR (ospa wietrzna). recalculateVar() słucha `input` na
// wieku i masie; od P-MINI-WYCZYSC (2026-09-27) „Wyczyść" rozsyła po tych polach `input`, więc
// przeliczenie ruszało także przy zamkniętej karcie leczenia przeciwwirusowego. Toast centrował
// się na prostokącie ukrytej karty (0×0) → left:0 z translateX(-50%) → połowa poza ekranem.
// Bliźniaczy toast grypy od zawsze sprawdza widoczność #fluCard; VAR tego nie robił.
//
// Test wykonuje PRAWDZIWY flu_therapy.js w kontekście vm na atrapie DOM i woła prawdziwe
// recalculateVar(). Kontrola negatywna odtwarza kod sprzed poprawki i pokazuje zgłoszony przebieg.

const STRAZNIK = 'const t=document.getElementById("varResult");if(!t||typeof t.getClientRects!="function"||t.getClientRects().length===0)return;const o=typeof t.closest=="function"?';
const PRZED_POPRAWKA = 'const t=document.getElementById("varResult"),o=t&&typeof t.closest=="function"?';

function uruchom(zrodlo, { wynikWidoczny, prostokatKarty }) {
  const pole = (id, dodatki = {}) => ({
    id, value: '', dataset: {}, style: {}, textContent: '', dzieci: [],
    appendChild(c) { this.dzieci.push(c); return c; },
    setAttribute() {},
    ...dodatki,
  });
  const karta = { getBoundingClientRect: () => ({ ...prostokatKarty }) };
  const elementy = {
    age: pole('age'),
    ageMonths: pole('ageMonths'),
    weight: pole('weight'),
    varPreparation: pole('varPreparation'),
    // getClientRects() jest puste, gdy element lub przodek ma display:none — tak jak w przeglądarce
    varResult: pole('varResult', { getClientRects: () => (wynikWidoczny ? [{}] : []), closest: () => karta }),
  };
  const body = {
    dzieci: [],
    appendChild(c) { this.dzieci.push(c); if (c.id) elementy[c.id] = c; return c; },
  };
  const timery = [];
  const kontekst = {
    document: {
      readyState: 'complete',
      body,
      getElementById: (id) => elementy[id] || null,
      createElement: (tag) => pole('', { tag }),
    },
    setTimeout: (fn, ms) => timery.push({ fn, ms: ms || 0 }),
    clearTimeout: (id) => { if (timery[id - 1]) timery[id - 1].fn = null; },
    requestAnimationFrame: (fn) => timery.push({ fn, ms: 0 }),
    innerWidth: 1440,
    // init modułu (przyciski, nasłuchy) nie jest przedmiotem testu — pomijamy go jak strona bez DOM
    vildaOnReady: () => {},
  };
  kontekst.window = kontekst;
  vm.createContext(kontekst);
  vm.runInContext(zrodlo, kontekst, { filename: 'flu_therapy.js' });

  // Przewija zegar do „tuż przed zgaszeniem": wykonuje debounce (800 ms) i klatkę animacji,
  // ale nie timer 2 s, który chowa toast.
  const przewin = () => {
    for (let i = 0; i < timery.length; i++) {
      const t = timery[i];
      if (t.fn && t.ms <= 800) { const fn = t.fn; t.fn = null; fn(); i = -1; }
    }
  };
  return { kontekst, elementy, body, przewin };
}

const UKRYTA = { left: 0, width: 0, top: 0, height: 0 };
const OTWARTA = { left: 400, width: 600, top: 120, height: 500 };

describe('P-VAR-TOAST: toast VAR tylko przy widocznej karcie', () => {
  const src = fs.readFileSync(path.join(repoRoot, 'flu_therapy.js'), 'utf8');

  it('poprawka jest w pliku (jedno wystąpienie strażnika widoczności)', () => {
    expect(src.split(STRAZNIK).length - 1).toBe(1);
    expect(src).not.toContain(PRZED_POPRAWKA);
  });

  it('zamknięta karta (np. po „Wyczyść wszystkie pola" na pustym formularzu): przeliczenie idzie, toastu nie ma', () => {
    const { kontekst, elementy, body, przewin } = uruchom(src, { wynikWidoczny: false, prostokatKarty: UKRYTA });
    kontekst.recalculateVar();
    przewin();
    // przeliczenie zaleceń nadal się odbywa — zmienia się tylko to, że nie ma toastu
    expect(elementy.varResult.textContent).toContain('Uzupełnij wiek i masę ciała');
    expect(elementy.varTooltip).toBeUndefined();
    expect(body.dzieci).toHaveLength(0);
  });

  it('karta otwarta, ale wybrana grypa (sekcja VAR ukryta): toastu VAR też nie ma', () => {
    const { kontekst, elementy, przewin } = uruchom(src, { wynikWidoczny: false, prostokatKarty: OTWARTA });
    kontekst.recalculateVar();
    przewin();
    expect(elementy.varTooltip).toBeUndefined();
  });

  it('widoczna sekcja VAR: toast pojawia się wyśrodkowany nad kartą', () => {
    const { kontekst, elementy, przewin } = uruchom(src, { wynikWidoczny: true, prostokatKarty: OTWARTA });
    kontekst.recalculateVar();
    przewin();
    const toast = elementy.varTooltip;
    expect(toast).toBeTruthy();
    expect(toast.textContent).toBe('Zalecenia zostały uaktualnione');
    expect(toast.style.display).toBe('block');
    expect(toast.style.opacity).toBe('1');
    expect(toast.style.left).toBe('700px');
    expect(toast.style.transform).toBe('translateX(-50%)');
  });

  it('kontrola negatywna: kod sprzed poprawki pokazuje toast przy zamkniętej karcie w left:0', () => {
    const zepsute = src.replace(STRAZNIK, PRZED_POPRAWKA);
    expect(zepsute).not.toBe(src);
    const { kontekst, elementy, przewin } = uruchom(zepsute, { wynikWidoczny: false, prostokatKarty: UKRYTA });
    kontekst.recalculateVar();
    przewin();
    const toast = elementy.varTooltip;
    expect(toast).toBeTruthy();
    expect(toast.style.display).toBe('block');
    expect(toast.style.left).toBe('0px');
  });
});
