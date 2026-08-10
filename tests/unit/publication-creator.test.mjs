import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

// Testy wołają PRAWDZIWE funkcje produkcyjne modułu (AGENTS.md §3.5) —
// moduł ładowany jest z pliku produkcyjnego, bez kopii algorytmu.
function loadCreator(browserGlobal = {}) {
  loadBrowserScript('vilda_publication_creator.js', browserGlobal);
  return browserGlobal.VildaPublicationCreator;
}

// Sztywna metryka tekstu: szerokość = liczba znaków * 20 px (deterministyczna).
function fakeCtx(calls = []) {
  return {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    textAlign: '',
    textBaseline: '',
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    beginPath() { calls.push(['beginPath']); },
    closePath() { calls.push(['closePath']); },
    moveTo(x, y) { calls.push(['moveTo', x, y]); },
    lineTo(x, y) { calls.push(['lineTo', x, y]); },
    stroke() { calls.push(['stroke']); },
    fill() { calls.push(['fill']); },
    rect(x, y, w, h) { calls.push(['rect', x, y, w, h]); },
    setLineDash() {},
    strokeRect() {},
    arc() {},
    clearRect() {},
    fillText(t, x, y) { calls.push(['fillText', t, x, y]); },
    measureText(t) { return { width: String(t).length * 20 }; }
  };
}

// Geometria testowa: 10 px na miesiąc, plotH/(maxY-minY) px na jednostkę wartości.
const GEOM = { plotX: 100, plotY: 100, plotW: 2040, plotH: 2600, minY: 60, maxY: 190 };
const PX_PER_UNIT = GEOM.plotH / (GEOM.maxY - GEOM.minY); // 20 px na jednostkę
const DROP_STEP = 10 * PX_PER_UNIT; // 200 px — krok opuszczania ramki

function sampleAdv() {
  return {
    measurements: [
      { ageMonths: 120, height: 140, weight: 32, arrowEnabled: true, arrowComment: 'Start terapii rhGH' },
      { ageMonths: 132, height: 148, weight: 36, arrowEnabled: false, arrowComment: 'wyłączona' },
      { ageMonths: 144, height: 156, weight: 41, arrowEnabled: true, arrowComment: '' }
    ],
    currentAgeMonths: 152,
    currentHeight: 161,
    currentWeight: 45,
    currentArrowEnabled: true,
    currentArrowComment: 'Aktualny pomiar'
  };
}

describe('VildaPublicationCreator — geometria adnotacji (parytet z generatorem)', () => {
  it('łamie komentarz twardo co 12 znaków, jak dotychczasowy generator', () => {
    const PC = loadCreator();
    expect(PC._wrapComment('')).toEqual([]);
    expect(PC._wrapComment('   ')).toEqual([]);
    expect(PC._wrapComment('abcdefghijkl')).toEqual(['abcdefghijkl']);
    expect(PC._wrapComment('abcdefghijklmnop')).toEqual(['abcdefghijkl', 'mnop']);
    expect(PC._wrapComment('Start terapii rhGH')).toEqual(['Start terapi', 'i rhGH']);
  });

  it('zbiera tylko włączone strzałki z poprawnymi wartościami, posortowane wg wieku', () => {
    const PC = loadCreator();
    const arrows = PC._collectArrows(sampleAdv(), 'height');
    expect(arrows.map((a) => a.ageMonths)).toEqual([120, 144, 152]);
    expect(arrows.map((a) => a.value)).toEqual([140, 156, 161]);
    expect(arrows[2].key).toBe('cur');
    expect(arrows[0].key).toBe('a120');
  });

  it('na siatce masy używa masy ciała jako wartości i pomija pomiary bez masy', () => {
    const PC = loadCreator();
    const adv = sampleAdv();
    adv.measurements[0].weight = null;
    const arrows = PC._collectArrows(adv, 'weight');
    expect(arrows.map((a) => a.ageMonths)).toEqual([144, 152]);
    expect(arrows.map((a) => a.value)).toEqual([41, 45]);
  });

  it('kandydaci do kliknięcia obejmują też punkty bez strzałki, w zakresie 12–216 mies.', () => {
    const PC = loadCreator();
    const adv = sampleAdv();
    adv.measurements.push({ ageMonths: 6, height: 66, weight: 7 });
    const pts = PC._collectPoints(adv, 'height');
    expect(pts.map((p) => p.ageMonths)).toEqual([120, 132, 144, 152]);
    expect(pts.find((p) => p.ageMonths === 132).enabled).toBe(false);
  });

  it('układ automatyczny: ramka wyśrodkowana pod punktem, pierwszy odstęp = 10 jednostek wartości', () => {
    const PC = loadCreator();
    const adv = {
      measurements: [
        { ageMonths: 120, height: 140, arrowEnabled: true, arrowComment: 'abcd' }
      ]
    };
    const items = PC._computeLayout(fakeCtx(), adv, 'height', GEOM);
    expect(items).toHaveLength(1);
    const it0 = items[0];
    const px = GEOM.plotX + (120 - 12) * (GEOM.plotW / 204);
    const py = GEOM.plotY + GEOM.plotH - (140 - GEOM.minY) * PX_PER_UNIT;
    expect(it0.px).toBeCloseTo(px, 6);
    expect(it0.py).toBeCloseTo(py, 6);
    // szerokość ramki: 2*20 padding + 4 znaki * 20 px
    expect(it0.w).toBeCloseTo(40 + 80, 6);
    // wysokość: 2*20 padding + 1 wiersz * 52 px
    expect(it0.h).toBeCloseTo(40 + 52, 6);
    expect(it0.autoX).toBeCloseTo(px - it0.w / 2, 6);
    // tip 15 px pod punktem, ramka: tip + krok + 5 px odstępu
    expect(it0.autoY).toBeCloseTo(py + 15 + DROP_STEP + 5, 6);
    expect(it0.moved).toBe(false);
    expect(it0.x).toBe(it0.autoX);
    expect(it0.y).toBe(it0.autoY);
  });

  it('kolizja ramek: druga ramka w tym samym miejscu jest opuszczana o wielokrotność kroku', () => {
    const PC = loadCreator();
    const adv = {
      measurements: [
        { ageMonths: 120, height: 140, arrowEnabled: true, arrowComment: 'pierwsza' },
        { ageMonths: 121, height: 140, arrowEnabled: true, arrowComment: 'druga' }
      ]
    };
    const items = PC._computeLayout(fakeCtx(), adv, 'height', GEOM);
    expect(items).toHaveLength(2);
    expect(items[1].drop).toBeGreaterThan(items[0].drop);
    expect((items[1].drop - items[0].drop) % DROP_STEP).toBeCloseTo(0, 6);
  });

  it('ręczne przesunięcie z pubLayout jest nakładane na pozycję automatyczną (per siatka)', () => {
    const PC = loadCreator();
    const adv = sampleAdv();
    adv.pubLayout = { height: { a120: { dx: 60, dy: -110 } }, weight: {} };
    const itemsH = PC._computeLayout(fakeCtx(), adv, 'height', GEOM);
    const moved = itemsH.find((i) => i.key === 'a120');
    expect(moved.moved).toBe(true);
    expect(moved.x).toBeCloseTo(moved.autoX + 60, 6);
    expect(moved.y).toBeCloseTo(moved.autoY - 110, 6);
    // ta sama adnotacja na siatce masy pozostaje w pozycji automatycznej
    const itemsW = PC._computeLayout(fakeCtx(), adv, 'weight', GEOM);
    const same = itemsW.find((i) => i.key === 'a120');
    expect(same.moved).toBe(false);
  });

  it('rysowanie: ramka nieprzesunięta ma pionową strzałkę, przesunięta — łącznik do punktu', () => {
    const PC = loadCreator();
    const adv = sampleAdv();
    adv.pubLayout = { height: { cur: { dx: 200, dy: -300 } }, weight: {} };
    const items = PC._computeLayout(fakeCtx(), adv, 'height', GEOM);
    const calls = [];
    expect(() => PC._drawItems(fakeCtx(calls), items)).not.toThrow();
    const rects = calls.filter((c) => c[0] === 'rect');
    // dwie ramki z komentarzem (a120 i cur); a144 ma pusty komentarz — bez ramki
    expect(rects).toHaveLength(2);
    const movedItem = items.find((i) => i.key === 'cur');
    const movedRect = rects.find((r) => Math.abs(r[1] - movedItem.x) < 0.01);
    expect(movedRect).toBeTruthy();
    expect(movedRect[2]).toBeCloseTo(movedItem.y, 6);
  });

  it('drawAnnotations zapamiętuje geometrię i w trybie podglądu nie maluje na kanwie', () => {
    const win = {};
    const PC = loadCreator(win);
    win.advancedGrowthData = sampleAdv();
    const calls = [];
    PC._setSuppress(true);
    try {
      PC.drawAnnotations(fakeCtx(calls), {
        chartType: 'weight',
        plotX: GEOM.plotX, plotY: GEOM.plotY, plotW: GEOM.plotW, plotH: GEOM.plotH,
        minY: 0, maxY: 90
      });
    } finally {
      PC._setSuppress(false);
    }
    expect(calls).toHaveLength(0);
    expect(PC._geomStore.weight).toEqual({
      plotX: GEOM.plotX, plotY: GEOM.plotY, plotW: GEOM.plotW, plotH: GEOM.plotH,
      minY: 0, maxY: 90
    });
    // bez tłumienia — maluje adnotacje
    PC.drawAnnotations(fakeCtx(calls), {
      chartType: 'weight',
      plotX: GEOM.plotX, plotY: GEOM.plotY, plotW: GEOM.plotW, plotH: GEOM.plotH,
      minY: 0, maxY: 90
    });
    expect(calls.filter((c) => c[0] === 'fillText').length).toBeGreaterThan(0);
  });
});

describe('Integracja: generator siatek deleguje adnotacje do modułu', () => {
  const generatorSource = fs.readFileSync(
    path.join(repositoryRoot, 'inline_index_07.js'),
    'utf8'
  );

  it('inline_index_07.js woła VildaPublicationCreator.drawAnnotations dla obu siatek', () => {
    expect(generatorSource).toContain(
      'PC.drawAnnotations(e,{chartType:o,plotX:te+120,plotY:ne+80,plotW:Z-120-100,plotH:U-80-80,minY:F,maxY:R})'
    );
    // delegacja jest poza gałęzią wyłącznie-wzrostową…
    expect(generatorSource).toContain('})()),window.publicationCharts&&(function(){try{var PC=window.VildaPublicationCreator');
    // …a stary blok rysujący strzałki tylko dla wzrostu został usunięty
    expect(generatorSource).not.toContain('if(!window.publicationCharts||o!=="height")return;const t=window.advancedGrowthData');
  });

  it('index.html ładuje moduł kreatora i zawiera przycisk otwierający (PRO)', () => {
    const indexHtml = fs.readFileSync(path.join(repositoryRoot, 'index.html'), 'utf8');
    expect(indexHtml).toContain('vilda_publication_creator.js?v=1');
    expect(indexHtml).toContain('id="openPublicationCreatorBtn"');
    expect(indexHtml).toContain('Kreator adnotacji<sup class="pro-superscript">PRO</sup>');
  });

  it('service worker precache zawiera nowe wersje plików', () => {
    const sw = fs.readFileSync(path.join(repositoryRoot, 'service-worker-kalorii.js'), 'utf8');
    expect(sw).toContain("'/vilda_publication_creator.js?v=1'");
    expect(sw).toContain("'/inline_index_07.js?v=2'");
    expect(sw).toContain("'/vilda_advanced_growth.js?v=30'");
  });
});

describe('Trwałość układu: commit danych karty zachowuje pubLayout (realny Dt)', () => {
  function extractRealCommit() {
    const source = fs.readFileSync(
      path.join(repositoryRoot, 'vilda_advanced_growth.js'),
      'utf8'
    );
    const start = source.indexOf('function Dt(e,t){');
    expect(start).toBeGreaterThan(-1);
    const endMarker = 'return e||null}';
    const end = source.indexOf(endMarker, start) + endMarker.length;
    const fnSource = source.slice(start, end);
    // wolne zmienne produkcyjnego Dt: R (logger) oraz i (domyślny global)
    return (globalRef) => new Function(
      'R', 'i',
      `return (${fnSource.replace(/^function Dt/, 'function')})`
    )(() => {}, globalRef);
  }

  it('nowy obiekt danych karty dziedziczy pubLayout z poprzedniego', () => {
    const win = {};
    win.advancedGrowthData = { pubLayout: { height: { a120: { dx: 60, dy: -110 } }, weight: {} } };
    const commit = extractRealCommit()(win);
    const fresh = { measurements: [] };
    commit(fresh, { global: win });
    expect(win.advancedGrowthData).toBe(fresh);
    expect(win.advancedGrowthData.pubLayout).toEqual({ height: { a120: { dx: 60, dy: -110 } }, weight: {} });
  });

  it('istniejący pubLayout nowego obiektu nie jest nadpisywany, a null czyści dane', () => {
    const win = {};
    win.advancedGrowthData = { pubLayout: { height: { a120: { dx: 1, dy: 2 } }, weight: {} } };
    const commit = extractRealCommit()(win);
    const withOwn = { pubLayout: { height: {}, weight: { cur: { dx: 9, dy: 9 } } } };
    commit(withOwn, { global: win });
    expect(win.advancedGrowthData.pubLayout.weight.cur).toEqual({ dx: 9, dy: 9 });
    commit(null, { global: win });
    expect(win.advancedGrowthData).toBeNull();
  });
});
