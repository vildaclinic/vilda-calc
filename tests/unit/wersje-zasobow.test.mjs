import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { biezaceWersje, korzen, zapisaneWersje } from '../support/wersje-zasobow.mjs';

// P-SW rata 1 (decyzja właściciela 2026-09-24): service worker oddaje wpisy z ?v= z pamięci BEZ
// odświeżania w tle. Treść zmieniona pod tym samym ?v= nie dotarłaby więc do klienta z zainstalowaną
// aplikacją — ten strażnik wymaga podbicia ?v= przy każdej zmianie treści pliku. Po podbiciu:
//   node tests/scripts/wersje-zasobow.mjs --zapisz

const teraz = biezaceWersje();
const dawniej = zapisaneWersje();
const POLECENIE = 'node tests/scripts/wersje-zasobow.mjs --zapisz';

describe('P-SW rata 1: zmiana treści pliku wymaga podbicia ?v=', () => {
  it('żaden plik z ?v= nie zmienił treści bez podbicia wersji', () => {
    const bezPodbicia = Object.entries(teraz)
      .filter(([plik, w]) => dawniej[plik] && dawniej[plik].v === w.v && dawniej[plik].sha256 !== w.sha256)
      .map(([plik, w]) => `${plik}?v=${w.v}`);
    expect(bezPodbicia, `zmieniona treść pod tym samym ?v= — podbij ?v= na stronach i w precache SW:\n${bezPodbicia.join('\n')}`).toEqual([]);
  });

  it('wersje nie cofają się', () => {
    const cofniete = Object.entries(teraz)
      .filter(([plik, w]) => dawniej[plik] && w.v < dawniej[plik].v)
      .map(([plik, w]) => `${plik}: ${dawniej[plik].v} → ${w.v}`);
    expect(cofniete, cofniete.join('\n')).toEqual([]);
  });

  it(`zapisany stan jest aktualny (po podbiciu ?v= uruchom: ${POLECENIE})`, () => {
    const nieaktualne = [
      ...Object.keys(teraz).filter((plik) => !dawniej[plik] || dawniej[plik].v !== teraz[plik].v).map((p) => `nowa wersja: ${p}?v=${teraz[p].v}`),
      ...Object.keys(dawniej).filter((plik) => !teraz[plik]).map((p) => `już nieładowany: ${p}`),
    ];
    expect(nieaktualne, nieaktualne.join('\n')).toEqual([]);
  });

  it('strażnik widzi pliki, które mają znaczenie (silnik diety, dane REE, app.js, style)', () => {
    for (const p of ['vilda_diet_plan_ui.js', 'vilda_ree_rownania_data.js', 'app.js', 'style.css']) expect(teraz[p], p).toBeTruthy();
    expect(Object.keys(teraz).length).toBeGreaterThan(150);
    expect(fs.existsSync(path.join(korzen, 'tests/scripts/wersje-zasobow.mjs'))).toBe(true);
  });
});
