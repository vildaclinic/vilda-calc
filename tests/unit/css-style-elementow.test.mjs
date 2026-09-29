import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { atrybutyStyle, doFixture, inwentarzStyliElementow, korzen, miejscaJs, plikiJs, porownaj } from '../support/style-elementow.mjs';

// P-STYLE krok 5b (inwentarz i strażnik): style ustawiane wprost na elementach — atrybuty style= w HTML i zapisy stylu
// elementu w JS — są policzone per plik w tests/fixtures/style-elementow.json. Liczby nie mogą rosnąć: nowy styl idzie do
// klasy w arkuszu strony albo w arkuszu komponentu. Gdy ubywa (styl przeniesiony do klasy), fixture odświeża
// node tests/scripts/style-elementow.mjs --zapisz. Przeniesienie istniejących miejsc jest decyzją właściciela
// (większość w zminifikowanym JS i we własnościach, które JS ustawia albo czyta — opis w tests/support/style-elementow.mjs).

const FIXTURE = path.join(korzen, 'tests/fixtures/style-elementow.json');

describe('P-STYLE krok 5b: stylów ustawianych wprost na elementach nie przybywa', () => {
  it('liczby atrybutów style= i zapisów stylu w JS per plik są dokładnie tymi z fixture', () => {
    const zapisane = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    const { przybylo, ubylo } = porownaj(inwentarzStyliElementow(), zapisane);
    expect(przybylo, `przybyło stylów ustawianych wprost na elementach — przenieś styl do klasy w arkuszu (albo, po decyzji, odśwież fixture: node tests/scripts/style-elementow.mjs --zapisz):\n${przybylo.join('\n')}`).toEqual([]);
    expect(ubylo, `ubyło stylów na elementach — odśwież fixture: node tests/scripts/style-elementow.mjs --zapisz:\n${ubylo.join('\n')}`).toEqual([]);
  });

  it('inwentarz widzi pliki, które mają znaczenie', () => {
    const { strony, js } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    for (const s of ['index.html', 'docpro.html', 'kalkulator-klirens.html']) expect(strony[s], s).toBeGreaterThan(10);
    for (const f of ['app.js', 'vilda_chrome.js']) expect(js[f], f).toBeGreaterThan(10);
    expect(Object.keys(js).some((f) => f.endsWith('.min.js'))).toBe(false);
  });
});

describe('inwentarz stylów na elementach', () => {
  it('atrybuty style= poza komentarzami i skryptami; wartość ze zwiniętymi białymi znakami', () => {
    const html = [
      '<div style="display:none;  margin:0">a</div>',
      '<!-- <p style="color:red">stare</p> -->',
      '<script>var t = \'<b style="x:y">\';</script>',
      "<span class=\"k\" style='font-weight:400;\n opacity:.65'>b</span>",
      '<input data-style="nie">',
    ].join('\n');
    expect(atrybutyStyle(html)).toEqual([
      { linia: 1, znacznik: 'div', wartosc: 'display:none; margin:0' },
      { linia: 4, znacznik: 'span', wartosc: 'font-weight:400; opacity:.65' },
    ]);
  });

  it('rodzaje miejsc w JS: przypisanie własności (bez porównań), cssText osobno, setProperty, setAttribute, łańcuch', () => {
    const js = [
      'el.style.display = "none";',
      'if (el.style.display === "none") x();',
      'if(e.style.opacity!=="1")y();',
      'a.style.cssText="color:red";',
      'b.style.setProperty("--x","1");',
      'c.setAttribute(\'style\', "top:0");',
      'd.innerHTML = \'<span style="color:red">\' + `<i style="x">`;',
      'var style = 1;',
    ].join('\n');
    expect(miejscaJs(js)).toEqual({ wlasnosc: 1, cssText: 1, setProperty: 1, atrybut: 1, lancuch: 2, razem: 6 });
  });

  it('plikiJs pomija biblioteki *.min.js i service worker; porównanie wskazuje przyrost i ubytek per plik', () => {
    expect(plikiJs(['a.js', 'b.min.js', 'service-worker-kalorii.js', 'x.css', 'c.js'])).toEqual(['a.js', 'c.js']);
    const pliki = { 'p.html': '<p style="a:b"></p><p style="c:d"></p>', 'a.js': 'x.style.top="0";' };
    const inw = inwentarzStyliElementow({ czytaj: (p) => pliki[p], strony: ['p.html'], js: ['a.js'] });
    expect(doFixture(inw)).toEqual({ strony: { 'p.html': 2 }, js: { 'a.js': 1 } });
    expect(porownaj(inw, { strony: { 'p.html': 1, 'q.html': 3 }, js: { 'a.js': 1 } })).toEqual({ przybylo: ['p.html: 1 → 2'], ubylo: ['q.html: 3 → 0'] });
  });
});
