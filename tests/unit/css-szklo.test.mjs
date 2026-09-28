import { describe, expect, it } from 'vitest';
import { arkuszeZeStronami, bezSkorki, martweDeklaracje, martweWKaskadzie, parsuj, pokrywaCzesc, usunMartwe } from '../support/szklo-css.mjs';
import { wiedzaDom } from '../support/wiedza-dom.mjs';

// P-STYLE rata 4a (decyzja właściciela 2026-09-28): skórka .liquid-ios26 jest zawsze włączona, a jej nadpisania
// z !important wygrywają z regułami bazowymi o tym samym selektorze. Deklaracje bazowe, których nigdy nie widać,
// są usunięte; strażnik pilnuje, by nie wróciły (node tests/scripts/usun-martwe-css.mjs), i sprawdza samą analizę
// na małych przykładach: kiedy deklaracja jest martwa, a kiedy nie wolno jej ruszyć.
// Rata 4b rozszerza pokrycie: nadpisanie pokrywa regułę bazową także wtedy, gdy każdy element bazowy pasuje do
// nadpisania (skrajne złożenie bazy zawiera proste selektory nadpisania, typ może wynikać z wiedzy o DOM), a nadpisanie
// nieważne zasłania nieważną deklarację bazową wyższą swoistością.

describe('P-STYLE rata 4a: martwe deklaracje bazowe nie wracają do arkuszy', () => {
  const arkusze = arkuszeZeStronami();
  const wynik = martweWKaskadzie(arkusze, wiedzaDom());

  it('cztery arkusze są globalne (ładowane na każdej stronie): ios26-v2, style, sidebar, vilda_chrome', () => {
    expect(arkusze.filter((a) => a.globalny).map((a) => a.nazwa)).toEqual(['ios26-v2.css', 'sidebar.css', 'style.css', 'vilda_chrome.css']);
  });

  for (const a of arkusze) {
    it(`${a.nazwa}: żadna deklaracja bazowa nie jest zasłonięta nadpisaniem skórki z tego samego lub globalnego arkusza (uruchom node tests/scripts/usun-martwe-css.mjs)`, () => {
      const { martwe } = wynik.get(a.nazwa);
      expect(martwe.map((m) => `${m.regula.prelude.slice(0, 60)} { ${m.deklaracja.prop} }`)).toEqual([]);
    });
  }
});

describe('bezSkorki: selektor nadpisania bez prefiksu skórki', () => {
  it('zdejmuje klasę skórki z pierwszego złożenia i gołe body', () => {
    expect(bezSkorki('.liquid-ios26 .card')).toBe('.card');
    expect(bezSkorki('body.liquid-ios26 header')).toBe('header');
    expect(bezSkorki('body.liquid-ios26.page-settings .x')).toBe('body.page-settings .x');
    expect(bezSkorki('.liquid-ios26 #a > .b')).toBe('#a > .b');
    expect(bezSkorki('body .x')).toBe('.x');
    expect(bezSkorki('body.dark-bg-level-1 .x')).toBe('body.dark-bg-level-1 .x');
  });

  it('odmawia, gdy skórka stoi za kombinatorem dziecka albo gdzie indziej niż w pierwszym złożeniu', () => {
    expect(bezSkorki('body.liquid-ios26 > .x')).toBeNull();
    expect(bezSkorki('.a .liquid-ios26 .x')).toBeNull();
    expect(bezSkorki('.liquid-ios26')).toBeNull();
  });
});

describe('martweDeklaracje i usunMartwe', () => {
  const zrodlo = [
    '.card {',
    '  background: #fff;',
    '  color: #333;',
    '  padding: 1rem',
    '}',
    '',
    '.liquid-ios26 .card {',
    '  background: rgba(255,255,255,.5) !important;',
    '  color: #111',
    '}',
    '',
    '.plan-card, .result-card {',
    '  border: 1px solid #ccc;',
    '  margin: 0',
    '}',
    '',
    '.liquid-ios26 .plan-card {',
    '  border: none !important',
    '}',
    '',
    '@media (max-width: 600px) {',
    '  .card {',
    '    background: #eee;',
    '    padding: .5rem',
    '  }',
    '',
    '  .liquid-ios26 .card {',
    '    background: #ddd !important',
    '  }',
    '}',
    '',
    '.only {',
    '  opacity: .5',
    '}',
    '',
    '.liquid-ios26 .only, .liquid-ios26 .other {',
    '  opacity: 1 !important',
    '}',
    '',
    '@supports (backdrop-filter: blur(1px)) {',
    '  .glass {',
    '    background: red',
    '  }',
    '}',
    '',
    '.liquid-ios26 .glass {',
    '  background: blue !important',
    '}',
  ].join('\n');

  it('parsuje reguły z kontekstem @-reguł i pozycjami', () => {
    const reguly = parsuj(zrodlo);
    expect(reguly.map((r) => r.prelude)).toContain('.card');
    const wMedia = reguly.find((r) => r.kontekst.length && r.prelude === '.card');
    expect(wMedia.kontekst).toEqual(['@media (max-width: 600px)']);
    expect(wMedia.deklaracje.map((d) => d.prop)).toEqual(['background', 'padding']);
    expect(zrodlo.slice(wMedia.start, wMedia.end)).toMatch(/^\.card \{[\s\S]*\}$/);
  });

  it('martwa jest tylko ta sama własność, pod nadpisaniem !important o pokrywającym selektorze i w tym samym kontekście', () => {
    const { martwe, martweCzesci } = martweDeklaracje(zrodlo);
    const opis = martwe.map((m) => `${m.regula.kontekst.join('|') || '-'} ${m.regula.prelude} ${m.deklaracja.prop}`);
    expect(opis).toEqual([
      '- .card background',
      '- .card color', // nadpisanie nieważne, ale o wyższej swoistości niż nieważna baza (rata 4b); padding nie jest nadpisany
      '@media (max-width: 600px) .card background', // ten sam kontekst @media
      '- .only opacity', // nadpisanie pokrywa .only (i więcej)
      '@supports (backdrop-filter: blur(1px)) .glass background', // nadpisanie poza kontekstem obowiązuje zawsze (rata 4b)
    ]);
    // .plan-card, .result-card: nadpisanie pokrywa tylko .plan-card — border zostaje żywy dla .result-card,
    // ale część .plan-card jest martwa (każda deklaracja reguły ma dla niej zwycięzcę? nie: margin nie jest nadpisany)
    expect(martweCzesci).toEqual([]);
  });

  it('rata 4b: martwa część selektora znika z listy, gdy każda deklaracja reguły ma dla niej zwycięzcę', () => {
    const css = '.a, .b {\n  color: red;\n  background: blue\n}\n\n.liquid-ios26 .a {\n  color: green !important;\n  background: white !important\n}\n';
    const { martwe, martweCzesci } = martweDeklaracje(css);
    expect(martwe).toEqual([]); // .b nie jest pokryte — żadna deklaracja nie jest martwa dla całej reguły
    expect(martweCzesci.map((c) => c.nr)).toEqual([0]);
    const { text, czesci } = usunMartwe(css);
    expect(czesci).toBe(1);
    expect(text).toContain('.b {\n  color: red;\n  background: blue\n}');
    expect(text).not.toContain('.a, .b');
  });

  it('rata 4b: pusty blok @media po usunięciu reguły znika w całości', () => {
    const css = '@media (max-width: 600px) {\n  .x {\n    color: red\n  }\n}\n\n.liquid-ios26 .x {\n  color: blue !important\n}\n';
    const { text } = usunMartwe(css);
    expect(text).toBe('.liquid-ios26 .x {\n  color: blue !important\n}\n');
  });

  it('usuwa martwe deklaracje, a regułę bez deklaracji w całości; reszta tekstu bez zmian', () => {
    const { text, usuniete, reguly } = usunMartwe(zrodlo);
    expect(usuniete).toBe(5);
    expect(reguly).toBe(2);
    expect(text).toContain('.card {\n  padding: 1rem\n}');
    expect(text).toContain('  .card {\n    padding: .5rem\n  }');
    expect(text).not.toContain('.only {');
    expect(text).toContain('.liquid-ios26 .only, .liquid-ios26 .other {\n  opacity: 1 !important\n}');
    expect(text).toContain('.plan-card, .result-card {\n  border: 1px solid #ccc;\n  margin: 0\n}');
    expect(text).not.toContain('@supports'); // reguła .glass w całości martwa, pusty blok @supports znika
    expect(martweDeklaracje(text).martwe).toEqual([]);
  });

  it('kaskada wieloarkuszowa: nadpisanie z innego arkusza liczy się tylko, gdy ten arkusz jest globalny', () => {
    const baza = '.card {\n  background: #fff;\n  color: #333\n}\n';
    const nadpisanie = '.liquid-ios26 .card {\n  background: red !important\n}\n';
    const zGlobalnym = martweWKaskadzie([{ nazwa: 'style.css', css: baza, globalny: true }, { nazwa: 'ios26-v2.css', css: nadpisanie, globalny: true }]);
    expect(zGlobalnym.get('style.css').martwe.map((m) => m.deklaracja.prop)).toEqual(['background']);
    const zLokalnym = martweWKaskadzie([{ nazwa: 'style.css', css: baza, globalny: true }, { nazwa: 'ustawienia.css', css: nadpisanie, globalny: false }]);
    expect(zLokalnym.get('style.css').martwe).toEqual([]);
    // arkusz lokalny może zasłaniać własne reguły bazowe
    const wlasny = martweWKaskadzie([{ nazwa: 'ustawienia.css', css: baza + nadpisanie, globalny: false }]);
    expect(wlasny.get('ustawienia.css').martwe.map((m) => m.deklaracja.prop)).toEqual(['background']);
  });

  it('rata 4b: pokrycie elementowe — każdy element bazy pasuje do nadpisania', () => {
    expect(pokrywaCzesc('.card', '.card.special')).toBe(true);
    expect(pokrywaCzesc('.card', '.sidebar .card:hover')).toBe(true);
    expect(pokrywaCzesc('button', 'button.add-row')).toBe(true);
    expect(pokrywaCzesc('button:hover', 'button.add-row')).toBe(false); // stan w nadpisaniu, którego baza nie wymaga
    expect(pokrywaCzesc('.card', '.card:after')).toBe(false); // inny pseudoelement
    expect(pokrywaCzesc('.card:after', '.card.x:after')).toBe(true);
    expect(pokrywaCzesc('.a .b', '.a .b.c')).toBe(true);
    expect(pokrywaCzesc('.a .b', '.x .b.c')).toBe(false);
    expect(pokrywaCzesc('.a > .b', '.a > .b.c')).toBe(false); // kombinatory inne niż potomek: tylko równość
    expect(pokrywaCzesc('button', '.faq')).toBe(false);
    const wiedza = { klasy: new Map([['faq', { tagi: new Set(['button']), wolna: false }], ['luz', { tagi: new Set(['button', 'a']), wolna: false }], ['dyn', { tagi: new Set(['button']), wolna: true }]]), idy: new Map() };
    expect(pokrywaCzesc('button', '.faq', wiedza)).toBe(true); // klasa tylko na button
    expect(pokrywaCzesc('button', '.luz', wiedza)).toBe(false); // także na <a>
    expect(pokrywaCzesc('button', '.dyn', wiedza)).toBe(false); // klasa zapisywana w JS na nieznanym odbiorcy
    expect(pokrywaCzesc('button', 'a.faq', wiedza)).toBe(false); // jawny typ bazy przeważa
  });

  it('rata 4b: nadpisanie nieważne zasłania tylko nieważną bazę i tylko wyższą swoistością', () => {
    const css = '.x {\n  color: red;\n  background: blue !important\n}\n\n.liquid-ios26 .x {\n  color: green;\n  background: white\n}\n';
    const { martwe } = martweDeklaracje(css);
    expect(martwe.map((m) => m.deklaracja.prop)).toEqual(['color']); // background bazy jest !important — nieważne nadpisanie go nie zasłania
    const rowna = '.x {\n  color: red\n}\n\n.liquid-ios26 .y, .liquid-ios26 .x {\n  color: green\n}\n';
    expect(martweDeklaracje(rowna).martwe.map((m) => m.deklaracja.prop)).toEqual(['color']);
  });

  it('nie tyka łańcuchów, komentarzy ani reguł @keyframes', () => {
    const css = '/* .x { color: red } */\n.x {\n  content: "a; b";\n  color: red\n}\n\n.liquid-ios26 .x {\n  color: blue !important\n}\n\n@keyframes k {\n  0% { color: red }\n}\n';
    const { text, usuniete } = usunMartwe(css);
    expect(usuniete).toBe(1);
    expect(text).toContain('/* .x { color: red } */');
    expect(text).toContain('.x {\n  content: "a; b"\n}');
    expect(text).toContain('0% { color: red }');
  });
});
