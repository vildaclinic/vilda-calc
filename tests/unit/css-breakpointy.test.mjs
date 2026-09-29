import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { korzen } from '../support/szklo-css.mjs';
import { inwentarzBreakpointow, progiZapytania, wPikselach } from '../support/breakpointy-css.mjs';

// P-STYLE krok 6: progi szerokości w @media są spisane w tests/fixtures/breakpointy.json. Nowa reguła używa progu z listy;
// nowy próg to decyzja właściciela (zmienia układ przy części szerokości okna), zapisywana przez
// node tests/scripts/breakpointy-css.mjs --zapisz. Lista może się kurczyć, gdy próg przestaje być używany.

const FIXTURE = path.join(korzen, 'tests/fixtures/breakpointy.json');

describe('P-STYLE krok 6: progi @media są dokładnie tymi z fixture', () => {
  it('żaden arkusz ani blok <style> nie używa progu spoza listy, a lista nie ma progów nieużywanych', { timeout: 60000 }, () => {
    const zapisane = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')).progi;
    const { progi } = inwentarzBreakpointow();
    const teraz = [...progi.keys()];
    const nowe = teraz.filter((p) => !zapisane.includes(p)).map((p) => `${p} (${[...new Set([...progi.get(p).min, ...progi.get(p).max])].join(', ')})`);
    expect(nowe, `nowe progi szerokości w @media — użyj progu z tests/fixtures/breakpointy.json albo, po decyzji, odśwież listę: node tests/scripts/breakpointy-css.mjs --zapisz:\n${nowe.join('\n')}`).toEqual([]);
    const zbedne = zapisane.filter((p) => !teraz.includes(p));
    expect(zbedne, `progi z fixture już nieużywane — odśwież listę: node tests/scripts/breakpointy-css.mjs --zapisz:\n${zbedne.join('\n')}`).toEqual([]);
  });
});

describe('inwentarz progów', () => {
  it('czyta progi z zapytania i sortuje po pikselach', () => {
    expect(progiZapytania('@media (max-width: 699.98px) and (min-width:20em)')).toEqual([{ rodzaj: 'max', prog: '699.98px' }, { rodzaj: 'min', prog: '20em' }]);
    expect(progiZapytania('@media (prefers-reduced-motion: reduce)')).toEqual([]);
    expect(wPikselach('20em')).toBe(320);
    expect(wPikselach('700px')).toBe(700);
  });
  it('liczy reguły per próg ze źródeł strony, także z bloków <style> i zagnieżdżonych @media', () => {
    const pliki = { 'index.html': '<html><head><link rel="stylesheet" href="a.css"><style>@media (max-width: 480px) { .x { color: red } }</style></head><body></body></html>', 'a.css': '@media (min-width: 700px) {\n  .a { color: red }\n  @media (max-width: 991px) { .b { color: blue } }\n}\n@media (min-width: 700px) { .c { color: green } }\n' };
    const czytaj = (p) => { if (!(p in pliki)) throw new Error(p); return pliki[p]; };
    const { progi } = inwentarzBreakpointow({ czytaj, strony: ['index.html'] });
    expect([...progi.keys()]).toEqual(['480px', '700px', '991px']);
    expect(progi.get('700px').reguly).toBe(3);
    expect([...progi.get('700px').min]).toEqual(['a.css']);
    expect([...progi.get('480px').max]).toEqual(['index.html#0']);
  });
});
