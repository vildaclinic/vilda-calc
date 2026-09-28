import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { arkuszeAplikacji, korzen, mapaWartosci, normalizuj, podzielAtomy, tokenizuj } from '../support/tokeny-css.mjs';

// P-STYLE rata 2a (decyzja właściciela 2026-09-28): kolory, cienie, z-index i przezroczystość, które
// mają token w design systemie, są w arkuszach zmiennymi var(--token), nie literałami. Strażnik pilnuje,
// by literał nie wrócił (ta sama mapa, której użył tests/scripts/tokenizuj-css.mjs), by każdy użyty
// token miał zmienną w :root style.css, i sprawdza sam mechanizm zamiany na małych przykładach.

const { mapa, deklaracje } = mapaWartosci();
const czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');

describe('P-STYLE rata 2a: literały równe tokenom nie wracają do arkuszy', () => {
  for (const plik of arkuszeAplikacji()) {
    it(`${plik}: żaden literał objętej rodziny nie ma odpowiednika w tokenach (uruchom node tests/scripts/tokenizuj-css.mjs)`, () => {
      const { zamiany } = tokenizuj(czytaj(plik), mapa);
      expect(zamiany.map((z) => `${z.prop}: ${z.literal} → var(--${z.token})`)).toEqual([]);
    });
  }

  it('każdy token użyty w arkuszach ma zmienną w :root style.css', () => {
    const uzyte = new Set();
    for (const plik of arkuszeAplikacji()) for (const m of czytaj(plik).matchAll(/var\(--([A-Za-z0-9_-]+)/g)) uzyte.add(m[1]);
    const root = /^:root \{\n([\s\S]*?)\n\}/.exec(czytaj('style.css'));
    expect(root, 'style.css zaczyna się blokiem :root').toBeTruthy();
    const brak = [];
    for (const lista of Object.values(deklaracje)) for (const t of lista) if (uzyte.has(t.name) && !new RegExp(`^\\s*--${t.name}:`, 'm').test(root[1])) brak.push(t.name);
    expect(brak).toEqual([]);
  });

  it('mapa zna tokeny kluczowe dla tej raty', () => {
    expect(mapa.color.get('#00838d')).toBe('primary');
    expect(mapa.color.get('#5a7274')).toBe('text-muted');
    expect(mapa.color.get('#d0dede')).toBe('line');
    expect(mapa.color.has('#ffffff'), 'white zostaje literałem').toBe(false);
    expect(mapa.zindex.size).toBeGreaterThan(20);
  });
});

describe('tokenizuj zamienia tylko atomy najwyższego poziomu w objętych własnościach', () => {
  it('obsługuje !important, skróty, warstwy cienia; nie tyka --zmiennych, łańcuchów, gradientów i @media', () => {
    const zrodlo = [
      '@media (max-width: 600px) {',
      '  .a { color: #00838d !important; border: 1px solid #d0dede; --x: #00838d; content: "#00838d"; }',
      '}',
      '.b { box-shadow: 0 4px 12px #0000001a, 0 0 0 1px #fff; background: linear-gradient(#00838d, #fff); z-index: 1000; opacity: .8 }',
    ].join('\n');
    const { text, zamiany } = tokenizuj(zrodlo, mapa);
    expect(text).toContain('color: var(--primary) !important');
    expect(text).toContain('border: 1px solid var(--line)');
    expect(text).toContain('--x: #00838d');
    expect(text).toContain('content: "#00838d"');
    expect(text).toContain('box-shadow: var(--shadow-button-glass), 0 0 0 1px #fff');
    expect(text).toContain('linear-gradient(#00838d, #fff)');
    expect(text).toContain(`z-index: var(--${mapa.zindex.get('1000')})`);
    expect(text).toContain(`opacity: var(--${mapa.opacity.get('.8')})`);
    expect(zamiany).toHaveLength(5); // color, border, box-shadow, z-index, opacity
  });

  it('normalizuj sprowadza zapisy koloru do jednej postaci', () => {
    expect(normalizuj('#FFF')).toBe('#ffffff');
    expect(normalizuj('rgba(0, 131, 141, 0.16)')).toBe('rgba(0,131,141,.16)');
    expect(normalizuj('0 4px 12px #0000001A')).toBe('0 4px 12px #0000001a');
  });

  it('podzielAtomy zachowuje separatory i nie dzieli wewnątrz nawiasów ani łańcuchów', () => {
    const czesci = podzielAtomy('1px solid rgba(0, 0, 0, .1), "a b"', 'slowa');
    expect(czesci.map((c) => c.tekst).join('')).toBe('1px solid rgba(0, 0, 0, .1), "a b"');
    expect(czesci.filter((c) => c.atom).map((c) => c.tekst)).toEqual(['1px', 'solid', 'rgba(0, 0, 0, .1)', '"a b"']);
  });
});
