import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ADV-REPORT-6 (decyzja właściciela 2026-09-13), etap 6 naprawy Raportu wzrastania.
//
// Znalezisko audytu, dwa osobne wątki:
//
// 1. DOSTĘPNOŚĆ. pdfMake — jedyna biblioteka, którą raport składa się poprawnie — był
//    ładowany WYŁĄCZNIE z cdnjs, w chwili kliknięcia. Aplikacja jest PWA i ma działać bez
//    sieci, a raportu bez sieci nie dało się wygenerować wcale. Poprawka idzie wzorcem,
//    który moduł epikryzy stosuje dla JSZip: plik lokalny najpierw, CDN dopiero jako
//    zapasowe źródło, a plik lokalny leży w precache service workera.
//
// 2. PODZIAŁ STRON ścieżki zapasowej. html2canvas + jsPDF składały JEDEN wysoki obraz
//    i przesuwały go o wysokość strony, więc cięcie wypadało w przypadkowym miejscu —
//    wiersz tabeli potrafił zostać przecięty w połowie, a stron nikt nie numerował.
//    Planista `advGrowthPlanRasterPages` tnie po granicach bloków i jest czysty, żeby dało
//    się go zmierzyć bez przeglądarki.
//
// Dane wyłącznie FIKCYJNE.

let win;
beforeEach(() => { win = loadBrowserScript('vilda_advanced_growth.js', {}); });
afterEach(() => { win = null; });

const api = () => win.VildaAdvancedGrowth;
const plan = (granice, calosc, strona) => api().advGrowthPlanRasterPages(granice, calosc, strona);

describe('Raport wzrastania — podział stron w ścieżce zapasowej', () => {
  it('tnie na granicy bloku, nie w przypadkowym miejscu', () => {
    // Bloki co 100 px, strona 350 px: naiwne cięcie padłoby na 350, czyli w środku
    // czwartego bloku. Planista cofa się do 300.
    const strony = plan([100, 200, 300, 400, 500, 600], 600, 350);
    expect(strony[0]).toEqual([0, 300]);
    expect(strony[1]).toEqual([300, 600]);
  });

  it('żadna strona nie jest wyższa od strony PDF', () => {
    const strony = plan([120, 260, 380, 510, 640, 770, 900], 900, 300);
    for (const [a, b] of strony) expect(b - a).toBeLessThanOrEqual(300 + 0.5);
  });

  it('strony pokrywają cały obraz bez dziur i bez zakładek', () => {
    const strony = plan([150, 320, 480, 610, 800], 800, 250);
    expect(strony[0][0]).toBe(0);
    expect(strony[strony.length - 1][1]).toBe(800);
    for (let i = 1; i < strony.length; i += 1) expect(strony[i][0]).toBe(strony[i - 1][1]);
  });

  it('blok wyższy od strony tnie po wysokości strony — pętla musi ruszyć', () => {
    // Jedyna granica to koniec obrazu: bez tego wyjątku planista nie zrobiłby kroku.
    const strony = plan([900], 900, 300);
    expect(strony.length).toBe(3);
    expect(strony[0]).toEqual([0, 300]);
  });

  it('obraz niższy od strony to jedna strona', () => {
    expect(plan([80, 160], 200, 900)).toEqual([[0, 200]]);
  });

  it('bezsensowne wejście nie wywraca raportu', () => {
    expect(plan([], 0, 300)).toEqual([]);
    expect(plan(null, 500, 0)).toEqual([]);
    expect(plan(null, 500, 200).length).toBeGreaterThan(0);
    // Granice spoza obrazu i śmieci są odrzucane, a nie brane za miejsce cięcia.
    expect(plan([-10, Number.NaN, 900, 'x'], 400, 150)[0][1]).toBe(150);
  });
});

describe('Raport wzrastania — pdfMake lokalnie przed CDN', () => {
  it('moduł zna oba źródła i lokalne stoi pierwsze', () => {
    const s = api().advGrowthPdfMakeSources;
    expect(s.local[0]).toMatch(/^pdfmake\.min\.js\?v=\d+$/);
    expect(s.local[1]).toMatch(/^pdfmake_vfs_fonts\.js\?v=\d+$/);
    expect(s.cdn[0]).toMatch(/^https:\/\/cdnjs\./);
    expect(s.cdn[1]).toMatch(/^https:\/\/cdnjs\./);
  });

  it('pliki lokalne naprawdę leżą w repozytorium', () => {
    for (const src of api().advGrowthPdfMakeSources.local) {
      const nazwa = src.split('?')[0];
      expect(fs.existsSync(path.join(korzen, nazwa)), `${nazwa} jest w repozytorium`).toBe(true);
    }
  });

  it('lokalny pdfmake.min.js to ten sam plik, co wydanie z CDN — zgodny z przypiętym SRI', () => {
    // `cukrzyca.html` ładuje pdfMake z cdnjs z przypiętym integrity. Ten sam skrót policzony
    // z pliku w repozytorium dowodzi, że wendorowana kopia jest bajt w bajt tym wydaniem,
    // a nie przypadkową wersją — i wyłapie podmianę pliku przy przyszłej aktualizacji.
    const html = fs.readFileSync(path.join(korzen, 'cukrzyca.html'), 'utf8');
    const m = html.match(/pdfmake\/0\.2\.10\/pdfmake\.min\.js"\s+integrity="sha384-([^"]+)"/);
    expect(m, 'cukrzyca.html ma przypięty SRI pdfMake').toBeTruthy();
    const lokalny = crypto.createHash('sha384')
      .update(fs.readFileSync(path.join(korzen, 'pdfmake.min.js')))
      .digest('base64');
    expect(lokalny).toBe(m[1]);
  });

  it('oba pliki lokalne są w precache service workera pod tym samym ?v=', () => {
    // Sufiks musi się zgadzać co do znaku — inaczej SW ma w cache inny klucz niż ten,
    // o który prosi raport, i offline znów nie zadziała.
    const sw = fs.readFileSync(path.join(korzen, 'service-worker-kalorii.js'), 'utf8');
    for (const src of api().advGrowthPdfMakeSources.local) {
      expect(sw).toContain(`'/${src}'`);
    }
  });

  it('ładowanie idzie przez pomocnika lokalny-potem-CDN, a nie prosto na CDN', () => {
    const src = fs.readFileSync(path.join(korzen, 'vilda_advanced_growth.js'), 'utf8');
    const i = src.indexOf('async function wn(');
    const cialo = src.slice(i, src.indexOf('async function', i + 10));
    expect(cialo).not.toMatch(/https:\/\/cdnjs\./);
    expect(cialo).toMatch(/Rl\(/);
  });
});
