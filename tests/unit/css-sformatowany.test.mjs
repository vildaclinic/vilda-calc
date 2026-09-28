import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAKSYMALNA_LINIA, arkuszeAplikacji, formatujCss, korzen, zaDlugieLinie } from '../scripts/formatuj-css.mjs';

// P-STYLE rata 1 (decyzja właściciela 2026-09-28): arkusze aplikacji są w repozytorium czytelne.
//
// Do tej pory dziesięć z dwunastu arkuszy było zminifikowanych (style.css: 236 KB w 54 liniach),
// więc zmiana jednego koloru pokazywała się w diffie jako podmiana linii o długości 130 tysięcy
// znaków, a `git blame` nic nie mówił. Formatowanie zmienia wyłącznie białe znaki — dowód
// równoważności: node tests/scripts/porownaj-cssom.mjs --baza <ref> (Chromium parsuje obie
// wersje i porównuje listy reguł). Ten strażnik pilnuje, by zminifikowana postać nie wróciła,
// tą samą regułą co `node tests/scripts/formatuj-css.mjs --sprawdz`.

const czytaj = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

describe('P-STYLE rata 1: arkusze aplikacji są czytelne', () => {
  const arkusze = arkuszeAplikacji();

  it('strażnik widzi arkusze, które mają znaczenie', () => {
    for (const p of ['style.css', 'ios26-v2.css', 'vilda_chrome.css', 'vilda_auth_ui.css']) expect(arkusze, p).toContain(p);
  });

  for (const plik of arkusze) {
    it(`${plik}: żadna linia nie przekracza ${MAKSYMALNA_LINIA} znaków (uruchom npm run css:formatuj)`, () => {
      const dlugie = zaDlugieLinie(czytaj(plik));
      expect(dlugie.map((d) => `linia ${d.linia}: ${d.dlugosc} znaków`), `${plik} wygląda na zminifikowany`).toEqual([]);
    });
  }
});

describe('formatujCss zmienia tylko białe znaki', () => {
  const bezBialych = (t) => t.replace(/\s+/g, '');

  it('łańcuchy i komentarze przepisuje dosłownie, także ze spacjami na końcu', () => {
    const zrodlo = '.a::before{content:"⚠  x ";/* k   o */color:red}.b,.c{--x:1px;margin:0   auto}';
    const wynik = formatujCss(zrodlo);
    expect(wynik).toContain('content: "⚠  x "');
    expect(wynik).toContain('/* k   o */');
    expect(wynik).toContain('--x:1px'); // własności --nazwa bez normalizacji dwukropka
    expect(wynik).toContain('margin: 0 auto'); // ciąg białych znaków poza łańcuchem to jedna spacja
    expect(bezBialych(wynik)).toBe(bezBialych(zrodlo));
  });

  it('selektory po jednym w linii, deklaracje po jednej, bloki wcięte', () => {
    const wynik = formatujCss('@media (max-width:600px){.a,.b>.c{color:red;background:url(data:x;y,z)}}');
    expect(wynik).toBe([
      '@media (max-width:600px) {',
      '  .a,',
      '  .b>.c {',
      '    color: red;',
      '    background: url(data:x;y,z)',
      '  }',
      '}',
      '',
    ].join('\n'));
  });

  it('jest idempotentny na arkuszach aplikacji', () => {
    for (const plik of ['ios26-v2.css', 'vilda_shell.css', 'vilda_obesity_banner.css']) {
      const raz = formatujCss(czytaj(plik));
      expect(formatujCss(raz), plik).toBe(raz);
    }
  });
});
