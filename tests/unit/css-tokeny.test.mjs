import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { arkuszeAplikacji, korzen, mapaWartosci, normalizuj, podzielAtomy, tokenizuj } from '../support/tokeny-css.mjs';

// P-STYLE rata 2a (decyzja właściciela 2026-09-28): kolory, cienie, z-index i przezroczystość, które
// mają token w design systemie, są w arkuszach zmiennymi var(--token), nie literałami. Rata 2b dokłada
// odstępy, promienie, grubości obramowań, rozmycie tła i wymiary układu — każde tylko we własnościach,
// w których niesie to znaczenie. Strażnik pilnuje, by literał nie wrócił (ta sama mapa, której użył
// tests/scripts/tokenizuj-css.mjs), by każdy użyty token miał zmienną w :root style.css, i sprawdza sam
// mechanizm zamiany na małych przykładach.

const { mapa, deklaracje } = mapaWartosci();
const czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');

describe('P-STYLE raty 2a i 2b: literały równe tokenom nie wracają do arkuszy', () => {
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

  it('mapa zna tokeny kluczowe dla tych rat', () => {
    expect(mapa.color.get('#00838d')).toBe('primary');
    expect(mapa.color.get('#5a7274')).toBe('text-muted');
    expect(mapa.color.get('#d0dede')).toBe('line');
    expect(mapa.color.has('#ffffff'), 'white zostaje literałem').toBe(false);
    expect(mapa.zindex.size).toBeGreaterThan(20);
    // rata 2b: ta sama liczba w innej rodzinie to inny token; zero i --radius (efektywnie 12px, nadpisywany) poza mapą
    expect(mapa.spacing.get('1rem')).toBe('space-1');
    expect(mapa.spacing.get('.5rem')).toBe('space-0-5');
    expect(mapa.spacing.get('12px')).toBe('space-12px');
    expect(mapa.spacing.has('0'), 'zero nie jest odstępem').toBe(false);
    expect(mapa.radius.get('12px')).toBe('radius-12');
    expect(mapa.radius.get('999px')).toBe('radius-pill');
    expect(mapa.radius.get('50%')).toBe('radius-circle');
    expect(mapa.border.get('1px')).toBe('border-hairline');
    expect(mapa.border.get('2px')).toBe('border-emphasis');
    expect(mapa.blur.get('blur(14px)')).toBe('blur-card');
    expect(mapa.blur.get('saturate(115%)')).toBe('blur-card-saturate');
    expect(mapa.layout.get('960px')).toBe('container-max-width');
    expect(mapa.layout.has('44px'), 'shell-scroll-top-size zostaje literałem (wartość dzielą niepowiązane elementy)').toBe(false);
    expect(mapa.layout.has('520px'), 'edu-portrait-max-width zostaje literałem').toBe(false);
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
    expect(text).toContain('border: var(--border-hairline) solid var(--line)');
    expect(text).toContain('--x: #00838d');
    expect(text).toContain('content: "#00838d"');
    expect(text).toContain('box-shadow: var(--shadow-button-glass), 0 0 0 1px #fff');
    expect(text).toContain('linear-gradient(#00838d, #fff)');
    expect(text).toContain(`z-index: var(--${mapa.zindex.get('1000')})`);
    expect(text).toContain(`opacity: var(--${mapa.opacity.get('.8')})`);
    expect(zamiany).toHaveLength(6); // color, border (grubość i kolor), box-shadow, z-index, opacity
  });

  it('rata 2b: wymiar dostaje token tylko we własności swojej rodziny; zero, calc(), prelude @media i font-size zostają', () => {
    const zrodlo = [
      '@media (max-width: 600px) {',
      '  .a { padding: .5rem 1rem 0; margin: 0 auto; gap: 12px; font-size: 1rem; line-height: 1.5; width: 12px; top: 1rem }',
      '}',
      '.b { border-radius: 12px 12px 0 0; border-top-left-radius: 50%; border-bottom: 2px dashed #ccc; outline: 3px solid transparent; padding: calc(1rem + 2px) -1rem; max-width: 960px }',
      '.c { backdrop-filter: blur(14px) saturate(115%); -webkit-backdrop-filter: blur(14px); grid-template-columns: 34px 1fr 230px; min-height: 44px; --mobile-dock-height: 80px }',
    ].join('\n');
    const { text, zamiany } = tokenizuj(zrodlo, mapa);
    expect(text).toContain('padding: var(--space-0-5) var(--space-1) 0;');
    expect(text).toContain('margin: 0 auto;');
    expect(text).toContain('gap: var(--space-12px);');
    expect(text).toContain('font-size: 1rem; line-height: 1.5; width: 12px; top: 1rem');
    expect(text).toContain('@media (max-width: 600px)');
    expect(text).toContain('border-radius: var(--radius-12) var(--radius-12) 0 0;');
    expect(text).toContain('border-top-left-radius: var(--radius-circle);');
    expect(text).toContain(`border-bottom: var(--border-emphasis) dashed var(--${mapa.color.get('#cccccc')});`);
    expect(text).toContain('outline: var(--border-pro) solid transparent;');
    expect(text).toContain('padding: calc(1rem + 2px) -1rem;');
    expect(text).toContain('max-width: var(--container-max-width)');
    expect(text).toContain('backdrop-filter: var(--blur-card) var(--blur-card-saturate);');
    expect(text).toContain('-webkit-backdrop-filter: var(--blur-card);');
    expect(text).toContain('grid-template-columns: 34px 1fr var(--decor-sidebar-width);');
    expect(text).toContain('min-height: 44px;');
    expect(text).toContain('--mobile-dock-height: 80px');
    expect(zamiany.filter((z) => z.rodzina === 'spacing')).toHaveLength(3);
    expect(zamiany.filter((z) => z.rodzina === 'radius')).toHaveLength(3);
    expect(zamiany.filter((z) => z.rodzina === 'border')).toHaveLength(2);
    expect(zamiany.filter((z) => z.rodzina === 'blur')).toHaveLength(3);
    expect(zamiany.filter((z) => z.rodzina === 'layout')).toHaveLength(2);
    expect(zamiany.find((z) => z.token === 'radius-12').selektor).toBe('.b');
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
