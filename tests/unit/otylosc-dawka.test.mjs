import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-OTYLOSC-DAWKA (temat B projektu „Leczenie otyłości — wpisy poza wizytą”; decyzja właściciela 2026-11-19:
// „Przecinek + podpowiedzi”). Na produkcyjnym module: dawkaPL (widok z przecinkiem dziesiętnym; zapis bez zmian)
// i podpowiedziDawek (przyciski pod polem „Dawka” w monitorze z tabeli zwiększania dawki ChPL). Tabele niżej to
// wiersze `dosing.escalation` z obesity_therapy.js — test pilnuje też, że są tam nadal takie same.
// Dane wyłącznie FIKCYJNE.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const D = loadBrowserScript('vilda_cykle_leczenia.js', {}).VildaDziennikOtylosci;

const WEGOVY = [
  { label: 'Tyg. 1–4', dose: '0,25 mg', note: 'dawka początkowa' },
  { label: 'Tyg. 5–8', dose: '0,5 mg', note: '' },
  { label: 'Tyg. 9–12', dose: '1,0 mg', note: '' },
  { label: 'Tyg. 13–16', dose: '1,7 mg', note: '' },
  { label: 'Tyg. 17+', dose: '2,4 mg', note: 'dawka podtrzymująca' },
  { label: 'Opcjonalnie', dose: '7,2 mg', note: 'tylko dorośli z wyjściowym BMI ≥30 kg/m², po co najmniej 4 tyg. stosowania dawki 2,4 mg' },
];
const MOUNJARO = [
  { label: 'Tyg. 1–4', dose: '2,5 mg', note: 'dawka początkowa' },
  { label: 'Tyg. 5–8', dose: '5 mg', note: '' },
  { label: 'Dalej (w razie potrzeby)', dose: '+2,5 mg co ≥4 tyg.', note: 'zwiększanie nie częściej niż co 4 tygodnie' },
  { label: 'Podtrzymująco', dose: '5, 10 lub 15 mg', note: 'maks. 15 mg 1×/tydz.' },
];
const MYSIMBA = [
  { label: 'Tydz. 1', dose: '1 tabl. rano', note: '' },
  { label: 'Tydz. 4+', dose: '2 tabl. rano + 2 tabl. wieczorem', note: 'maks. 4 tabl./dobę' },
];

describe('dawkaPL — dawka do pokazania z przecinkiem dziesiętnym', () => {
  it('kropka między cyframi → przecinek; reszta tekstu i dawki z przecinkiem bez zmian', () => {
    expect(D.dawkaPL('0.25')).toBe('0,25');
    expect(D.dawkaPL(' 2.4 mg / tydz. ')).toBe('2,4 mg / tydz.');
    expect(D.dawkaPL('2,4')).toBe('2,4');
    expect(D.dawkaPL('1 tabl. rano')).toBe('1 tabl. rano');
    expect(D.dawkaPL('s.c. 1.5 mg')).toBe('s.c. 1,5 mg');
    expect(D.dawkaPL(null)).toBe('');
    expect(D.dawkaPL(undefined)).toBe('');
  });
});

describe('podpowiedziDawek — przyciski pod polem „Dawka” z tabeli ChPL', () => {
  it('Wegovy (1×/tydz.): każda dawka z „ / tydz.”; uwaga przy 7,2 mg pod przyciskami, zwykłe opisy — tylko w dymku', () => {
    const p = D.podpowiedziDawek(WEGOVY, '1×/tydz.');
    expect(p.dawki.map((x) => x.wartosc)).toEqual(['0,25 mg / tydz.', '0,5 mg / tydz.', '1,0 mg / tydz.', '1,7 mg / tydz.', '2,4 mg / tydz.', '7,2 mg / tydz.']);
    expect(p.dawki[4]).toEqual({ wartosc: '2,4 mg / tydz.', etykieta: 'Tyg. 17+', uwaga: 'dawka podtrzymująca' });
    expect(p.uwagi).toEqual(['7,2 mg / tydz. — tylko dorośli z wyjściowym BMI ≥30 kg/m², po co najmniej 4 tyg. stosowania dawki 2,4 mg']);
  });

  it('Saxenda: dawka z „/ dobę” bez dopisku; Mounjaro: wiersze bez jednej dawki — zdaniem, nie przyciskiem', () => {
    expect(D.podpowiedziDawek([{ label: 'Tydz. 5+', dose: '3,0 mg / dobę', note: 'dawka podtrzymująca (docelowa)' }], '1×/dobę'))
      .toEqual({ dawki: [{ wartosc: '3,0 mg / dobę', etykieta: 'Tydz. 5+', uwaga: 'dawka podtrzymująca (docelowa)' }], uwagi: [] });
    const m = D.podpowiedziDawek(MOUNJARO, '1×/tydz.');
    expect(m.dawki.map((x) => x.wartosc)).toEqual(['2,5 mg / tydz.', '5 mg / tydz.']);
    expect(m.uwagi).toEqual([
      'Dalej (w razie potrzeby): +2,5 mg co ≥4 tyg. (zwiększanie nie częściej niż co 4 tygodnie)',
      'Podtrzymująco: 5, 10 lub 15 mg (maks. 15 mg 1×/tydz.)',
    ]);
  });

  it('Mysimba (wg titracji): tabletki bez „/ tydz.”; uwaga o maksimum pod przyciskami', () => {
    const p = D.podpowiedziDawek(MYSIMBA, 'wg titracji');
    expect(p.dawki.map((x) => x.wartosc)).toEqual(['1 tabl. rano', '2 tabl. rano + 2 tabl. wieczorem']);
    expect(p.uwagi).toEqual(['2 tabl. rano + 2 tabl. wieczorem — maks. 4 tabl./dobę']);
  });

  it('brak tabeli, puste wiersze i powtórki — bez błędu i bez duplikatów', () => {
    expect(D.podpowiedziDawek(null, '')).toEqual({ dawki: [], uwagi: [] });
    expect(D.podpowiedziDawek([{}, { dose: '' }, { dose: '0.5 mg' }, { dose: '0,5 mg' }], '1×/tydz.').dawki.map((x) => x.wartosc)).toEqual(['0,5 mg / tydz.']);
  });

  it('tabele w teście = wiersze dosing.escalation w obesity_therapy.js (źródło przycisków w monitorze)', () => {
    const zrodlo = fs.readFileSync(path.join(ROOT, 'obesity_therapy.js'), 'utf8');
    // Zminifikowany plik zapisuje znaki jako \uXXXX albo \xXX — JSON zna tylko pierwsze.
    const odkoduj = (t) => JSON.parse('"' + t.replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1') + '"');
    const wiersze = [...zrodlo.matchAll(/\{label:"((?:[^"\\]|\\.)*)",dose:"((?:[^"\\]|\\.)*)",note:"((?:[^"\\]|\\.)*)"\}/g)]
      .map((m) => ({ label: odkoduj(m[1]), dose: odkoduj(m[2]), note: odkoduj(m[3]) }));
    for (const w of [...WEGOVY, ...MOUNJARO, ...MYSIMBA]) {
      expect(wiersze, `${w.label}: ${w.dose}`).toContainEqual(w);
    }
    expect(zrodlo, 'opcja listy leku w monitorze niesie tabelę dawek i częstość')
      .toContain('d.setAttribute("data-dawki",JSON.stringify((r.dosing&&r.dosing.escalation||[]).map(');
  });
});
