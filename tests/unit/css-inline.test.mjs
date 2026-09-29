import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARKUSZ_WSPOLNY, BLOK_WSPOLNY, blokiStrony, korzen, nazwaArkusza, planStrony, rozdzielaBloki, segmentyStrony, zastosuj } from '../support/style-inline.mjs';

// P-STYLE krok 5a: style stron żyją w arkuszach, nie w blokach <style> — arkusz linkowany w tym samym miejscu dokumentu
// zachowuje kaskadę, a wchodzi pod te same strażniki co reszta arkuszy (formatowanie, tokeny, tryby, skórka, reguły
// nieosiągalne, progi). Strażnik: (1) żadna strona nie ma bloku <style> (node tests/scripts/wyciagnij-style-inline.mjs),
// (2) plan wyciągnięcia dzieli bloki tylko tam, gdzie coś mogłoby wnieść style pomiędzy nie.

describe('P-STYLE krok 5a: strony nie mają bloków <style>', () => {
  it('każdy blok <style> jest arkuszem linkowanym w tym samym miejscu', () => {
    const strony = fs.readdirSync(korzen).filter((f) => f.endsWith('.html')).sort();
    const bloki = strony.flatMap((s) => blokiStrony(fs.readFileSync(path.join(korzen, s), 'utf8')).map((b) => `${s}:${b.linia}`));
    expect(bloki, `bloki <style> na stronach — wyciągnij do arkuszy: node tests/scripts/wyciagnij-style-inline.mjs\n${bloki.join('\n')}`).toEqual([]);
  });

  it('arkusz powłoki osadzonej jest tym blokiem, który stał na stronach', () => {
    expect(fs.readFileSync(path.join(korzen, ARKUSZ_WSPOLNY), 'utf8').replace(/\s+/g, ' ').trim()).toBe(BLOK_WSPOLNY.replace(/\s+/g, ' ').trim());
  });
});

describe('plan wyciągnięcia', () => {
  it('nazwa arkusza jak wyciągniętych skryptów inline_<strona>_<NN>', () => {
    expect(nazwaArkusza('kalkulator-klirens.html', 0)).toBe('inline_kalkulator_klirens_00.css');
    expect(nazwaArkusza('docpro.html', 12)).toBe('inline_docpro_12.css');
  });

  it('blok <style> w łańcuchu skryptu nie jest źródłem stylów strony; atrybuty bloku zatrzymują plan', () => {
    const html = '<head><script>var t = "<style>.x{}</style>";</script><style>.a{color:red}</style></head><body></body>';
    expect(blokiStrony(html).map((b) => b.css)).toEqual(['.a{color:red}']);
    expect(() => planStrony('x.html', '<head><style media="print">.a{}</style></head>')).toThrow(/atrybuty/);
  });

  it('<body>, <script> i <style> w komentarzu HTML nie są znacznikami', () => {
    const html = '<head><style>.a{}</style><!-- przed renderem <body> stoi <script>x()</script>; <style>.k{}</style> --><script defer src="a.js"></script><style>.b{}</style></head><body></body>';
    expect(blokiStrony(html).map((b) => [b.css, b.wHead])).toEqual([['.a{}', true], ['.b{}', true]]);
    expect(segmentyStrony(html).map((s) => s.bloki.length)).toEqual([2]);
  });

  it('między blokami rozdziela: link do arkusza, synchroniczny skrypt, granica <body>; nie rozdziela: defer, async, module, dane, znaczniki', () => {
    expect(rozdzielaBloki('\n<link rel="stylesheet" href="a.css">\n')).toBe('link do arkusza');
    expect(rozdzielaBloki('<link href="https://fonts.googleapis.com/css2" rel="stylesheet" media="print">')).toBe('link do arkusza');
    expect(rozdzielaBloki('<link rel="preconnect" href="https://fonts.gstatic.com">')).toBeNull();
    expect(rozdzielaBloki('<script>x()</script>')).toBe('synchroniczny skrypt');
    expect(rozdzielaBloki('<script src="a.js"></script>')).toBe('synchroniczny skrypt');
    expect(rozdzielaBloki('<script type="text/javascript">x()</script>')).toBe('synchroniczny skrypt');
    expect(rozdzielaBloki('<script defer src="a.js"></script><script async src="b.js"></script><script type="module">x()</script>')).toBeNull();
    expect(rozdzielaBloki('<script type="application/ld+json">{"a":1}</script>')).toBeNull();
    expect(rozdzielaBloki('</head>\n<body class="x">')).toBe('granica <body>');
    expect(rozdzielaBloki('<div class="a"><p>tekst</p></div><!-- k -->')).toBeNull();
  });

  it('segmenty i linki w miejscu pierwszego bloku; blok powłoki osadzonej idzie do wspólnego arkusza, reszta bloku do arkusza strony', () => {
    const html = [
      '<html><head>',
      `  <style>${BLOK_WSPOLNY}.vilda-embedded #tzFab{display:none!important}</style>`,
      '  <link href="style.css?v=1" rel="stylesheet">',
      '  <style>.a{color:red}</style>',
      '  <script defer src="x.js"></script>',
      '  <style>',
      '    .b{color:blue}',
      '    .b:hover{',
      '      color:navy}',
      '  </style>',
      '  <script>x()</script>',
      '  <style>.c{color:green}</style>',
      '</head>',
      '<body>',
      '  <div><style>.d{color:black}</style></div>',
      '  <style>.e{color:white}</style>',
      '</body></html>',
    ].join('\n');
    const segmenty = segmentyStrony(html);
    expect(segmenty.map((s) => [s.bloki.length, s.powod])).toEqual([[1, 'pierwszy blok'], [2, 'link do arkusza'], [1, 'synchroniczny skrypt'], [2, 'granica <body>']]);
    const plan = planStrony('moja-strona.html', html);
    expect(plan.map((p) => p.linki)).toEqual([
      [ARKUSZ_WSPOLNY, 'inline_moja_strona_00.css'],
      ['inline_moja_strona_01.css'],
      ['inline_moja_strona_02.css'],
      ['inline_moja_strona_03.css'],
    ]);
    expect(plan[0].pliki['inline_moja_strona_00.css']).toBe('.vilda-embedded #tzFab{display:none!important}\n');
    // treść bloku dosłownie (przycięte tylko brzegi): wcięcie kontynuacji wartości wielowierszowej jest częścią wartości w CSSOM
    expect(plan[1].pliki['inline_moja_strona_01.css']).toBe('.a{color:red}\n.b{color:blue}\n    .b:hover{\n      color:navy}\n');
    expect(plan[3].pliki['inline_moja_strona_03.css']).toBe('.d{color:black}\n.e{color:white}\n');
    expect(zastosuj(html, plan)).toBe([
      '<html><head>',
      `  <link href="${ARKUSZ_WSPOLNY}?v=1" rel="stylesheet">`,
      '  <link href="inline_moja_strona_00.css?v=1" rel="stylesheet">',
      '  <link href="style.css?v=1" rel="stylesheet">',
      '  <link href="inline_moja_strona_01.css?v=1" rel="stylesheet">',
      '  <script defer src="x.js"></script>',
      '  <script>x()</script>',
      '  <link href="inline_moja_strona_02.css?v=1" rel="stylesheet">',
      '</head>',
      '<body>',
      '  <div><link href="inline_moja_strona_03.css?v=1" rel="stylesheet"></div>',
      '</body></html>',
    ].join('\n'));
  });

  it('numer arkusza omija nazwę zajętą inną treścią, a zajętą tą samą treścią przyjmuje', () => {
    const html = '<head><style>.a{}</style><link rel="stylesheet" href="s.css"><style>.b{}</style></head>';
    const zajete = { 'inline_x_00.css': '.inne{}\n', 'inline_x_02.css': '.b{}\n' };
    const plan = planStrony('x.html', html, (n) => zajete[n] ?? null);
    expect(plan.map((p) => p.linki)).toEqual([['inline_x_01.css'], ['inline_x_02.css']]);
  });
});
