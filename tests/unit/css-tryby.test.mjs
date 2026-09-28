import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZWINIETY, arkuszeAplikacji, korzen, przepiszPreludia, rozwinSelektory, zwinArkusz, zwinSelektory } from '../support/tryby-css.mjs';
import { canonicalSelectorList, specificity } from '../../design-system/lib/css.mjs';

// P-STYLE rata 3 (decyzja właściciela 2026-09-28): reguły wysokiego kontrastu mają jeden selektor z
// :is(.high-contrast-level-1, .high-contrast-level-2, .high-contrast-level-3) zamiast trzech części na poziom.
// Strażnik pilnuje, by triplety nie wróciły (node tests/scripts/zwin-tryby-css.mjs), i sprawdza równoważność
// zwinięcia: te same elementy (suma trzech części) i ta sama swoistość (:is() = maksimum argumentów).

const czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');

describe('P-STYLE rata 3: triplety selektorów kontrastu nie wracają do arkuszy', () => {
  for (const plik of arkuszeAplikacji()) {
    it(`${plik}: żadna reguła nie powtarza selektora dla poziomów 1, 2 i 3 (uruchom node tests/scripts/zwin-tryby-css.mjs)`, () => {
      expect(zwinArkusz(czytaj(plik)).zwiniete).toBe(0);
    });
  }

  it('partiale design systemu są w tej samej postaci co źródło', () => {
    const katalog = path.join(korzen, 'design-system/src/partials');
    for (const f of fs.readdirSync(katalog).filter((x) => x.endsWith('.css'))) {
      expect(zwinArkusz(fs.readFileSync(path.join(katalog, f), 'utf8')).zwiniete, f).toBe(0);
    }
  });

  it('bloki zmiennych --hc-* na poziom zostają osobne (wartości różnią się między poziomami)', () => {
    const css = czytaj('style.css');
    for (const lv of ['1', '2', '3']) expect(css).toMatch(new RegExp(`^body\\.high-contrast-level-${lv}\\.liquid-ios26 \\{\\n  --hc-surface:`, 'm'));
  });
});

describe('zwinSelektory: równoważność zwinięcia', () => {
  const triplet = 'body.high-contrast-level-1.liquid-ios26 .card, body.high-contrast-level-2.liquid-ios26 .card, body.high-contrast-level-3.liquid-ios26 .card';

  it('zwija komplet trzech poziomów do :is(), zostawia części bez kompletu i bez klasy poziomu', () => {
    const { lista, zwiniete } = zwinSelektory(`${triplet}, .inne, body.high-contrast-level-2.liquid-ios26 .tylko2, body.high-contrast-level-3.liquid-ios26 .tylko2`);
    expect(zwiniete).toBe(1);
    expect(lista.split(',\n')).toEqual([
      `body${ZWINIETY}.liquid-ios26 .card`,
      '.inne',
      'body.high-contrast-level-2.liquid-ios26 .tylko2',
      'body.high-contrast-level-3.liquid-ios26 .tylko2',
    ]);
  });

  it('rozwinięcie odtwarza trzy części, a producent design systemu widzi obie postaci jako tę samą listę', () => {
    const { lista } = zwinSelektory(triplet);
    expect(rozwinSelektory(lista)).toEqual(triplet.split(', '));
    expect(canonicalSelectorList(lista)).toEqual(canonicalSelectorList(triplet));
  });

  it('swoistość zwiniętej części równa się swoistości każdej z części tripletu', () => {
    const { lista } = zwinSelektory(triplet);
    for (const czesc of triplet.split(', ')) expect(specificity(lista)).toBe(specificity(czesc));
    const ustawienia = zwinSelektory('body.page-settings.high-contrast-level-1 .x, body.page-settings.high-contrast-level-2 .x, body.page-settings.high-contrast-level-3 .x').lista;
    expect(specificity(ustawienia)).toBe(specificity('body.page-settings.high-contrast-level-1 .x'));
  });

  it('nie zwija części z dwoma różnymi poziomami ani list, w których poziomy występują w różnych złożeniach', () => {
    expect(zwinSelektory('body.high-contrast-level-1 .a.high-contrast-level-2').zwiniete).toBe(0);
    expect(zwinSelektory('body.high-contrast-level-1 .a, body.high-contrast-level-2 .b, body.high-contrast-level-3 .c').zwiniete).toBe(0);
  });
});

describe('przepiszPreludia i zwinArkusz nie tykają @-reguł, deklaracji, łańcuchów i komentarzy', () => {
  it('przepisuje tylko prelude reguł stylu, z zachowaniem wcięcia', () => {
    const css = [
      '/* body.high-contrast-level-1 x, body.high-contrast-level-2 x, body.high-contrast-level-3 x */',
      '@media (max-width: 600px) {',
      '  body.high-contrast-level-1 .a,',
      '  body.high-contrast-level-2 .a,',
      '  body.high-contrast-level-3 .a {',
      '    content: "body.high-contrast-level-1 .a, body.high-contrast-level-2 .a, body.high-contrast-level-3 .a";',
      '    color: var(--hc-text) !important',
      '  }',
      '}',
      '@keyframes x {',
      '  0%, 100% { opacity: 1 }',
      '}',
    ].join('\n');
    const { text, zwiniete, reguly } = zwinArkusz(css);
    expect(zwiniete).toBe(1);
    expect(reguly).toBe(1);
    expect(text).toContain(`\n  body${ZWINIETY} .a {\n`);
    expect(text).toContain('content: "body.high-contrast-level-1 .a, body.high-contrast-level-2 .a, body.high-contrast-level-3 .a";');
    expect(text).toContain('/* body.high-contrast-level-1 x, body.high-contrast-level-2 x, body.high-contrast-level-3 x */');
    expect(text).toContain('@media (max-width: 600px) {');
    expect(text).toContain('0%, 100% { opacity: 1 }');
    expect(przepiszPreludia(css, () => 'ZMIANA')).not.toContain('@media ZMIANA');
  });
});
