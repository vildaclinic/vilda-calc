import { describe, expect, it } from 'vitest';
import { analizaNieosiagalnych, czesciSelektora, nazwyCzesci, podmienBlok, usunNieosiagalne } from '../support/nieosiagalne-css.mjs';
import { wiedzaDom } from '../support/wiedza-dom.mjs';

// P-STYLE krok 7: reguła, której selektor wymaga klasy albo id nieobecnych nigdzie w kodzie (HTML poza <style>, JS —
// z regułą sklejania z tokenu-prefiksu i sufiksu z łącznikiem, rata 4b bis), nie dopasowuje żadnego elementu i nie ma jej
// w arkuszach ani w blokach <style>. Strażnik: (1) analiza całego repozytorium nie znajduje żadnej reguły ani części
// nieosiągalnej (node tests/scripts/usun-nieosiagalne-css.mjs --sprawdz), (2) sama analiza działa jak opisano.

describe('P-STYLE krok 7: w arkuszach i blokach <style> nie ma reguł nieosiągalnych', () => {
  it('żadna reguła ani część selektora nie wymaga nazwy nieobecnej w kodzie', { timeout: 120000 }, () => {
    const { zrodla } = analizaNieosiagalnych();
    const opis = zrodla.flatMap((z) => z.opis.map((o) => `${z.id}: ${o.cala ? o.prelude : `część ${o.czesci.join(' | ')}`}  ← ${o.nazwy.join(', ')}`));
    expect(opis, `reguły nieosiągalne (nazwa klasy/id nieobecna w HTML i JS) — usuń: node tests/scripts/usun-nieosiagalne-css.mjs, albo dodaj element z tą nazwą do kodu:\n${opis.join('\n')}`).toEqual([]);
  });
});

describe('analiza nieosiągalności', () => {
  it('części listy selektorów i nazwy wymagane przez część', () => {
    expect(czesciSelektora('.a, .b:is(.c, .d), [data-x="1,2"] .e')).toEqual(['.a', '.b:is(.c, .d)', '[data-x="1,2"] .e']);
    expect(nazwyCzesci('.card .title')).toEqual(['card', 'title']);
    expect(nazwyCzesci('#app > .row:nth-child(2n+1)')).toEqual(['app', 'row']);
    expect(nazwyCzesci('.a:not(.dead)')).toEqual(['a']); // :not(.dead) dopasowuje wszystko poza .dead
    expect(nazwyCzesci('.a:is(.dead, .x)')).toEqual(['a']); // pseudoklasy funkcyjne pomijane ostrożnie
    expect(nazwyCzesci('[class~="dead"] .a')).toEqual(['a']); // selektor atrybutu poza oceną
    expect(nazwyCzesci('.sm\\:flex')).toEqual([]); // znak ucieczki: część nieoceniana
  });

  it('reguła z nazwą nieobecną znika w całości, nieobecna część znika z listy, :not(.nieobecna) zostaje', () => {
    const html = '<html><head><link rel="stylesheet" href="a.css"><style>.dead2 { color: red }\n.zyje { color: blue }</style></head><body class="ok zyje"><div class="card">x</div><script>var K = "stala"; el.classList.add(K); el.classList.add("pre-" + n);</script></body></html>';
    const css = '.card {\n  color: red\n}\n\n.dead {\n  color: green\n}\n\n.card,\n.dead {\n  padding: 0\n}\n\n.card:not(.dead) {\n  margin: 0\n}\n\n.stala {\n  color: black\n}\n\n.pre-x {\n  color: white\n}\n\n@media (min-width: 1px) {\n  .dead .card {\n    color: pink\n  }\n}\n';
    const pliki = { 'index.html': html, 'a.css': css };
    const czytaj = (p) => { if (!(p in pliki)) throw new Error(p); return pliki[p]; };
    const wiedza = wiedzaDom(czytaj, ['index.html'], null);
    const { zrodla } = analizaNieosiagalnych({ czytaj, wiedza, strony: ['index.html'] });
    const arkusz = zrodla.find((z) => z.id === 'a.css');
    expect(arkusz.opis.map((o) => (o.cala ? o.prelude : `część ${o.czesci.join('|')}`))).toEqual(['.dead', 'część .dead', '.dead .card']);
    const po = usunNieosiagalne(arkusz).text;
    expect(po).toBe('.card {\n  color: red\n}\n\n.card {\n  padding: 0\n}\n\n.card:not(.dead) {\n  margin: 0\n}\n\n.stala {\n  color: black\n}\n\n.pre-x {\n  color: white\n}\n');
    const blok = zrodla.find((z) => z.id === 'index.html#0');
    expect(blok.opis.map((o) => o.prelude)).toEqual(['.dead2']);
    expect(podmienBlok(html, blok.css, usunNieosiagalne(blok).text)).toContain('<style>.zyje { color: blue }</style>');
  });
});
