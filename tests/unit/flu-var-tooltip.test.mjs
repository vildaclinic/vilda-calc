import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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
    expect(page).toMatch(/flu_therapy\.js\?v=([7-9]|\d{2,})/);
    const sw = fs.readFileSync(path.join(repoRoot, 'service-worker-kalorii.js'), 'utf8');
    expect(sw).toContain("'/flu_therapy.js?v=7',");
  });
});
