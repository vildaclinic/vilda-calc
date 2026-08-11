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

// Sztywna metryka tekstu zależna od czcionki: szerokość = liczba znaków * (fs/2)
// (przy domyślnych 40 px daje to 20 px/znak, jak we wcześniejszych oczekiwaniach).
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
    measureText(t) {
      const m = /(\d+(?:\.\d+)?)px/.exec(this.font || '');
      const fs = m ? Number(m[1]) : 40;
      return { width: String(t).length * (fs / 2) };
    }
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

  it('nadpisanie en:0 ukrywa adnotację tylko na wskazanej siatce', () => {
    const PC = loadCreator();
    const adv = sampleAdv();
    // ukryj adnotację a120 wyłącznie na siatce masy ciała
    adv.pubLayout = { height: {}, weight: { a120: { en: 0 } } };
    const arrowsH = PC._collectArrows(adv, 'height');
    const arrowsW = PC._collectArrows(adv, 'weight');
    expect(arrowsH.map((a) => a.key)).toContain('a120');
    expect(arrowsW.map((a) => a.key)).not.toContain('a120');
    // pozostałe adnotacje na siatce masy nietknięte
    expect(arrowsW.map((a) => a.key)).toEqual(['a144', 'cur']);
  });

  it('nadpisanie txt podmienia treść tylko na wskazanej siatce (druga zachowuje wspólną)', () => {
    const PC = loadCreator();
    const adv = sampleAdv();
    adv.pubLayout = { height: { a120: { txt: 'Etykieta siatki wzrostu' } }, weight: {} };
    const h = PC._collectArrows(adv, 'height').find((a) => a.key === 'a120');
    const w = PC._collectArrows(adv, 'weight').find((a) => a.key === 'a120');
    expect(h.comment).toBe('Etykieta siatki wzrostu');
    expect(h.ownText).toBe(true);
    expect(w.comment).toBe('Start terapii rhGH');
    expect(w.ownText).toBe(false);
    // punkty raportują stan ukrycia/osobnej treści dla kreatora
    adv.pubLayout.weight.a120 = { en: 0 };
    const ptH = PC._collectPoints(adv, 'height').find((p) => p.key === 'a120');
    const ptW = PC._collectPoints(adv, 'weight').find((p) => p.key === 'a120');
    expect(ptH.ownText).toBe(true);
    expect(ptH.hiddenHere).toBe(false);
    expect(ptW.hiddenHere).toBe(true);
    expect(ptW.sharedComment).toBe('Start terapii rhGH');
  });

  it('updateOverride scala pola i usuwa pusty wpis; przesunięcie nie kasuje ukrycia', () => {
    const win = {};
    const PC = loadCreator(win);
    win.advancedGrowthData = sampleAdv();
    // ukrycie + przesunięcie współistnieją w jednym wpisie
    PC._updateOverride('weight', 'a120', { en: 0 });
    PC._updateOverride('weight', 'a120', { dx: 50, dy: -30 });
    expect(win.advancedGrowthData.pubLayout.weight.a120).toEqual({ en: 0, dx: 50, dy: -30 });
    // wyzerowanie przesunięcia zostawia ukrycie
    PC._updateOverride('weight', 'a120', { dx: 0, dy: 0 });
    expect(win.advancedGrowthData.pubLayout.weight.a120).toEqual({ en: 0 });
    // zdjęcie ukrycia usuwa cały wpis
    PC._updateOverride('weight', 'a120', { en: undefined });
    expect(win.advancedGrowthData.pubLayout.weight.a120).toBeUndefined();
    // sama treść też utrzymuje wpis, a jej usunięcie go czyści
    PC._updateOverride('height', 'cur', { txt: 'osobna' });
    expect(win.advancedGrowthData.pubLayout.height.cur).toEqual({ txt: 'osobna' });
    PC._updateOverride('height', 'cur', { txt: undefined });
    expect(win.advancedGrowthData.pubLayout.height.cur).toBeUndefined();
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

  it('wolna strzałka z ramką: kotwica w jednostkach danych, ramka pod kotwicą, przesunięcie stosowane', () => {
    const PC = loadCreator();
    const adv = { measurements: [], pubFree: { height: [{ id: 1, ageMonths: 100, value: 150, txt: 'Uwaga', arrow: true, dx: 80, dy: -60 }], weight: [] } };
    const items = PC._computeLayout(fakeCtx(), adv, 'height', GEOM);
    expect(items).toHaveLength(1);
    const it0 = items[0];
    const px = GEOM.plotX + (100 - 12) * (GEOM.plotW / 204);
    const py = GEOM.plotY + GEOM.plotH - (150 - GEOM.minY) * PX_PER_UNIT;
    expect(it0.kind).toBe('free');
    expect(it0.key).toBe('f1');
    expect(it0.px).toBeCloseTo(px, 6);
    expect(it0.py).toBeCloseTo(py, 6);
    expect(it0.autoX).toBeCloseTo(px - it0.w / 2, 6);
    expect(it0.autoY).toBeCloseTo(py + 15 + DROP_STEP + 5, 6);
    expect(it0.x).toBeCloseTo(it0.autoX + 80, 6);
    expect(it0.y).toBeCloseTo(it0.autoY - 60, 6);
    expect(it0.moved).toBe(true);
    // wolna adnotacja żyje tylko na swojej siatce
    expect(PC._computeLayout(fakeCtx(), adv, 'weight', GEOM)).toHaveLength(0);
  });

  it('samodzielna etykieta: ramka wyśrodkowana na kotwicy, bez strzałki', () => {
    const PC = loadCreator();
    const adv = { measurements: [], pubFree: { height: [{ id: 2, ageMonths: 60, value: 100, txt: 'Etykieta', arrow: false }], weight: [] } };
    const items = PC._computeLayout(fakeCtx(), adv, 'height', GEOM);
    expect(items).toHaveLength(1);
    const it0 = items[0];
    expect(it0.arrow).toBe(false);
    expect(it0.autoX).toBeCloseTo(it0.px - it0.w / 2, 6);
    expect(it0.autoY).toBeCloseTo(it0.py - it0.h / 2, 6);
    const calls = [];
    PC._drawItems(fakeCtx(calls), items);
    // jest ramka i tekst, ale ŻADNEJ kreski strzałki (moveTo/lineTo poza rect)
    expect(calls.filter((c) => c[0] === 'rect')).toHaveLength(1);
    expect(calls.filter((c) => c[0] === 'fillText')).toHaveLength(1);
    expect(calls.filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo')).toHaveLength(0);
  });

  it('sama strzałka (bez treści): rysuje grot i linię, bez ramki', () => {
    const PC = loadCreator();
    const adv = { measurements: [], pubFree: { height: [{ id: 3, ageMonths: 80, value: 120, txt: '', arrow: true }], weight: [] } };
    const items = PC._computeLayout(fakeCtx(), adv, 'height', GEOM);
    expect(items).toHaveLength(1);
    expect(items[0].w).toBe(0);
    const calls = [];
    PC._drawItems(fakeCtx(calls), items);
    expect(calls.filter((c) => c[0] === 'rect')).toHaveLength(0);
    expect(calls.filter((c) => c[0] === 'fill').length).toBeGreaterThan(0);
    // pionowa linia od grotu do ogona pod kotwicą
    const lineStart = calls.find((c) => c[0] === 'moveTo' && Math.abs(c[1] - items[0].px) < 1e-6);
    expect(lineStart).toBeTruthy();
  });

  it('rozmiar czcionki: nadpisanie fs zmienia wymiary ramki, a prune usuwa fs domyślne', () => {
    const win = {};
    const PC = loadCreator(win);
    const adv = sampleAdv();
    adv.pubLayout = { height: { a120: { fs: 52 } }, weight: {} };
    const it52 = PC._computeLayout(fakeCtx(), adv, 'height', GEOM).find((i) => i.key === 'a120');
    expect(it52.fs).toBe(52);
    // 'Start terapii rhGH' → ['Start terapi','i rhGH']: max 12 znaków * 26 px + 2*20
    expect(it52.w).toBeCloseTo(12 * 26 + 40, 6);
    expect(it52.h).toBeCloseTo(2 * 52 * 1.3 + 40, 6);
    // prune: fs=40 (domyślne) znika, fs=52 zostaje
    win.advancedGrowthData = sampleAdv();
    PC._updateOverride('height', 'a120', { fs: 40 });
    expect(win.advancedGrowthData.pubLayout.height.a120).toBeUndefined();
    PC._updateOverride('height', 'a120', { fs: 52 });
    expect(win.advancedGrowthData.pubLayout.height.a120).toEqual({ fs: 52 });
  });

  it('pubFree: add/update/remove na realnym magazynie danych karty', () => {
    const win = {};
    const PC = loadCreator(win);
    win.advancedGrowthData = sampleAdv();
    const id = PC._addFree('height', { ageMonths: 90.24, value: 123.46, txt: 'x', arrow: true });
    expect(id).toBe(1);
    expect(win.advancedGrowthData.pubFree.height[0]).toEqual({ id: 1, ageMonths: 90.2, value: 123.5, txt: 'x', arrow: true, fs: 40 });
    PC._updateFree('height', id, { txt: 'y', fs: 64, dx: 10, dy: 0 });
    expect(win.advancedGrowthData.pubFree.height[0].txt).toBe('y');
    expect(win.advancedGrowthData.pubFree.height[0].fs).toBe(64);
    expect(win.advancedGrowthData.pubFree.height[0].dx).toBe(10);
    expect(win.advancedGrowthData.pubFree.height[0].dy).toBeUndefined();
    // id rośnie globalnie (obie siatki)
    expect(PC._addFree('weight', { ageMonths: 50, value: 20, txt: '', arrow: true })).toBe(2);
    PC._removeFree('height', id);
    expect(win.advancedGrowthData.pubFree.height).toHaveLength(0);
    expect(win.advancedGrowthData.pubFree.weight).toHaveLength(1);
  });

  it('pubOptions: domyślne wartości (summary wyłączona, widoczność z globalnych flag, reszta włączona)', () => {
    const win = {};
    const PC = loadCreator(win);
    win.advancedGrowthData = sampleAdv();
    expect(PC.isElementEnabled('summary')).toBe(false);
    expect(PC.isElementEnabled('boneAge')).toBe(true);
    expect(PC.isElementEnabled('mph')).toBe(true);
    expect(PC.isElementEnabled('patientName')).toBe(true);
    expect(PC.isElementEnabled('parentsHeader')).toBe(true);
    expect(PC.isElementEnabled('footer')).toBe(true);
    // trzy opcje widoczności dziedziczą starty z globalnych flag Ustawień
    expect(PC.isElementEnabled('bandReference')).toBe(true);
    win.centileShowBandReference = false;
    expect(PC.isElementEnabled('bandReference')).toBe(false);
    win.centileShowHeightValueLabel = false;
    expect(PC.isElementEnabled('heightLabel')).toBe(false);
    expect(PC.isElementEnabled('weightLabel')).toBe(true);
  });

  it('pubOptions: setOption zapisuje per wydruk w danych karty i wygrywa z globalnymi flagami', () => {
    // opcje publikacyjne obowiązują w trybie publikacji (rozstrzyganie kontekstu)
    const win = { centileShowBandReference: false, publicationCharts: true };
    const PC = loadCreator(win);
    win.advancedGrowthData = sampleAdv();
    PC._setOption('bandReference', true);
    // pierwszy zapis zasiewa komplet opcji wartościami domyślnymi
    expect(win.advancedGrowthData.pubOptions.bandReference).toBe(true);
    expect(win.advancedGrowthData.pubOptions.summary).toBe(false);
    expect(win.advancedGrowthData.pubOptions.boneAge).toBe(true);
    expect(PC.isElementEnabled('bandReference')).toBe(true);
    PC._setOption('boneAge', false);
    expect(PC.isElementEnabled('boneAge')).toBe(false);
    PC._setOption('summary', true);
    expect(PC.isElementEnabled('summary')).toBe(true);
  });

  it('klamra: dwie pionowe linie od punktów, spinka nad wyższym, ramka nad ogonkiem', () => {
    const PC = loadCreator();
    const adv = sampleAdv();
    adv.pubFree = { height: [{ id: 5, br: 1, a1: 120, a2: 152, txt: 'Okres leczenia', fs: 40 }], weight: [] };
    const items = PC._computeLayout(fakeCtx(), adv, 'height', GEOM);
    const br = items.find((i) => i.bracket);
    expect(br).toBeTruthy();
    const x1 = GEOM.plotX + (120 - 12) * (GEOM.plotW / 204);
    const x2 = GEOM.plotX + (152 - 12) * (GEOM.plotW / 204);
    const y1 = GEOM.plotY + GEOM.plotH - (140 - GEOM.minY) * PX_PER_UNIT; // wzrost 140 przy 120 mies.
    const y2 = GEOM.plotY + GEOM.plotH - (161 - GEOM.minY) * PX_PER_UNIT; // bieżący 161 przy 152 mies.
    expect(br.x1).toBeCloseTo(x1, 6);
    expect(br.x2).toBeCloseTo(x2, 6);
    // spinka nad WYŻSZYM punktem (mniejsze y) o krok 10 jednostek
    expect(br.yb).toBeCloseTo(Math.min(y1, y2) - DROP_STEP, 6);
    // ramka wyśrodkowana nad ogonkiem
    expect(br.px).toBeCloseTo((x1 + x2) / 2, 6);
    expect(br.autoX).toBeCloseTo(br.px - br.w / 2, 6);
    expect(br.autoY).toBeCloseTo(br.yb - 46 - br.h, 6);
    // rysowanie: pozioma spinka od x1 do x2 na poziomie yb
    const calls = [];
    PC._drawItems(fakeCtx(calls), [br]);
    const horiz = calls.some((c, i) => c[0] === 'moveTo' && Math.abs(c[1] - x1) < 0.01 && Math.abs(c[2] - br.yb) < 0.01 &&
      calls[i + 1] && calls[i + 1][0] === 'lineTo' && Math.abs(calls[i + 1][1] - x2) < 0.01 && Math.abs(calls[i + 1][2] - br.yb) < 0.01);
    expect(horiz).toBe(true);
    // brak grotu strzałki (fill tylko dla ramki)
    expect(calls.filter((c) => c[0] === 'closePath')).toHaveLength(0);
  });

  it('klamra: brak któregoś punktu pomiaru pomija klamrę; końce rozwiązywane per siatka', () => {
    const PC = loadCreator();
    const adv = sampleAdv();
    // a2=200 nie istnieje wśród pomiarów → klamra pominięta
    adv.pubFree = { height: [{ id: 6, br: 1, a1: 120, a2: 200, txt: '', fs: 40 }], weight: [] };
    expect(PC._computeLayout(fakeCtx(), adv, 'height', GEOM).filter((i) => i.bracket)).toHaveLength(0);
    // na siatce masy końce mają wartości masy
    adv.pubFree = { height: [], weight: [{ id: 7, br: 1, a1: 120, a2: 144, txt: 'x', fs: 40 }] };
    const brW = PC._computeLayout(fakeCtx(), adv, 'weight', { plotX: 100, plotY: 100, plotW: 2040, plotH: 2600, minY: 0, maxY: 90 }).find((i) => i.bracket);
    expect(brW).toBeTruthy();
    const yW1 = 100 + 2600 - (32 - 0) * (2600 / 90);
    const yW2 = 100 + 2600 - (41 - 0) * (2600 / 90);
    expect(brW.y1).toBeCloseTo(yW1, 4);
    expect(brW.y2).toBeCloseTo(yW2, 4);
  });

  it('klamra: bdy reguluje wysokość poprzeczki, także pod punktami (nogi w dół, ramka pod spinką)', () => {
    const PC = loadCreator();
    const adv = sampleAdv();
    // bdy ujemne: spinka wyżej niż pozycja automatyczna, ramka nadal nad nią
    adv.pubFree = { height: [{ id: 8, br: 1, a1: 120, a2: 152, txt: 'x', fs: 40, bdy: -300 }], weight: [] };
    let br = PC._computeLayout(fakeCtx(), adv, 'height', GEOM).find((i) => i.bracket);
    expect(br.yb).toBeCloseTo(br.ybAuto - 300, 6);
    expect(br.autoY).toBeCloseTo(br.yb - 46 - br.h, 6);
    // bdy dodatnie pod oba punkty: nogi biegną w dół, ramka pod spinką
    const yLow = Math.max(br.y1, br.y2);
    const bdyDown = Math.round(yLow + 400 - br.ybAuto);
    adv.pubFree.height[0].bdy = bdyDown;
    br = PC._computeLayout(fakeCtx(), adv, 'height', GEOM).find((i) => i.bracket);
    expect(br.yb).toBeCloseTo(br.ybAuto + bdyDown, 4);
    expect(br.yb).toBeGreaterThan(yLow);
    expect(br.autoY).toBeCloseTo(br.yb + 46, 6);
    const calls = [];
    PC._drawItems(fakeCtx(calls), [br]);
    // noga od punktu 1 startuje POD kropką (y1 + odstęp 15) i schodzi do yb
    const legDown = calls.some((c, i) => c[0] === 'moveTo' && Math.abs(c[1] - br.x1) < 0.01 && Math.abs(c[2] - (br.y1 + 15)) < 0.01 &&
      calls[i + 1] && calls[i + 1][0] === 'lineTo' && Math.abs(calls[i + 1][2] - br.yb) < 0.01);
    expect(legDown).toBe(true);
    // poprzeczka nie wychodzi poza pole wykresu (clamp do dołu obszaru)
    adv.pubFree.height[0].bdy = 99999;
    br = PC._computeLayout(fakeCtx(), adv, 'height', GEOM).find((i) => i.bracket);
    expect(br.yb).toBeCloseTo(GEOM.plotY + GEOM.plotH, 6);
  });

  it('klamra: _updateFree(bdy) zapisuje wysokość poprzeczki w pubFree i czyści wartość zerową', () => {
    const win = {};
    const PC = loadCreator(win);
    win.advancedGrowthData = sampleAdv();
    const id = PC._addFree('height', { br: 1, a1: 120, a2: 152, txt: '', fs: 40 });
    PC._updateFree('height', id, { bdy: 250 });
    expect(win.advancedGrowthData.pubFree.height[0].bdy).toBe(250);
    PC._updateFree('height', id, { bdy: 0 });
    expect('bdy' in win.advancedGrowthData.pubFree.height[0]).toBe(false);
  });

  it('opcje elementów per kontekst: zwykły render czyta chartCreatorData, publikacyjny pubOptions', () => {
    const win = {};
    const PC = loadCreator(win);
    win.advancedGrowthData = sampleAdv();
    // poza kreatorem i renderami: wartości domyślne = dotychczasowe zachowanie
    expect(PC.isElementEnabled('summary')).toBe(false);
    expect(PC.isElementEnabled('boneAge')).toBe(true);
    // zapis opcji w kontekście zwykłym trafia do magazynu centralnego z regularnymi domyślnymi
    PC._setContext('palRegular');
    PC._setOption('boneAge', false);
    PC._setContext('pub');
    expect(win.chartCreatorData.palRegular.options.boneAge).toBe(false);
    expect(win.chartCreatorData.palRegular.options.summary).toBe(true); // zwykła siatka: ramka domyślnie włączona
    expect(win.advancedGrowthData.pubOptions).toBeUndefined();
    // render zwykłej siatki (flaga generatora) honoruje opcje kontekstu zwykłego
    PC._setRegularRender(true);
    expect(PC.isElementEnabled('boneAge')).toBe(false);
    expect(PC.isElementEnabled('summary')).toBe(true);
    PC._setRegularRender(false);
    // render publikacyjny nie widzi opcji zwykłych (własne domyślne)
    win.publicationCharts = true;
    expect(PC.isElementEnabled('boneAge')).toBe(true);
    expect(PC.isElementEnabled('summary')).toBe(false);
    win.publicationCharts = false;
    // bez renderu i kreatora wracają domyślne globalne
    expect(PC.isElementEnabled('boneAge')).toBe(true);
  });

  it('inline_index_07.js: bramki elementów działają też w gałęziach zwykłej siatki', () => {
    const generatorSource = fs.readFileSync(path.join(repositoryRoot, 'inline_index_07.js'), 'utf8');
    // flaga renderu zwykłego ustawiana w ze() i zdejmowana w finally
    expect(generatorSource).toContain('_setRegularRender(!window.publicationCharts)');
    expect(generatorSource).toContain('_setRegularRender(!1)');
    // nagłówek zwykły: imię i nazwisko + wiersz rodziców/MPH za bramkami
    expect(generatorSource).toContain('}else{Pe&&__pubok("patientName")&&(');
    expect(generatorSource).toContain('const n=__pubok("parentsHeader")?[Ue,qe,He].filter(Boolean):[];');
    // stopka zwykła wagaiwzrost.pl za bramką footer
    expect(generatorSource).toContain('else if(__pubok("footer")){e.textAlign="left"');
    // wiek kostny i MPH bramkowane bez warunku trybu publikacji
    expect(generatorSource).toContain('if(!__pubok("boneAge"))return;');
    expect(generatorSource).toContain('if(!__pubok("mph"))return;');
    expect(generatorSource).not.toContain('if(S&&!__pubok("boneAge"))return;');
    // ramka podsumowania zwykła
    expect(generatorSource).toContain('else if(!t||!__pubok("summary"))return;');
  });

  it('inline_index_03.js: helpery widoczności pytają kreator bezwarunkowo (kontekst rozstrzyga moduł)', () => {
    const core = fs.readFileSync(path.join(repositoryRoot, 'inline_index_03.js'), 'utf8');
    expect(core).toContain('function isCentileCurrentPointLabelVisible(e){if(typeof window<"u"&&(e==="cm"||e==="kg")){try{');
    expect(core).toContain('function isCentileBandReferenceVisible(){if(typeof window<"u"){try{');
  });

  it('kontekst palRegular: strzałki z magazynu centralnego, checkboxy pomiarów ignorowane', () => {
    const win = {};
    const PC = loadCreator(win);
    win.advancedGrowthData = sampleAdv();
    const advReg = PC._advForContext(win.advancedGrowthData, 'palRegular');
    // pomiar a120 ma arrowEnabled=true, ale w kontekście zwykłym liczy się magazyn shared
    expect(PC._collectArrows(advReg, 'height')).toHaveLength(0);
    // wpis w shared włącza adnotację na OBU siatkach ze wspólną treścią
    win.chartCreatorData.palRegular.shared.a120 = { on: 1, txt: 'Diagnoza' };
    const h = PC._collectArrows(advReg, 'height');
    const w2 = PC._collectArrows(advReg, 'weight');
    expect(h.map((a) => a.key)).toEqual(['a120']);
    expect(w2.map((a) => a.key)).toEqual(['a120']);
    expect(h[0].comment).toBe('Diagnoza');
    // punkty klikalne raportują stan z magazynu centralnego
    const pts = PC._collectPoints(advReg, 'height');
    expect(pts.find((p) => p.key === 'a120').enabled).toBe(true);
    expect(pts.find((p) => p.key === 'cur').enabled).toBe(false); // currentArrowEnabled ignorowane
    // kontekst publikacyjny nieruszony: nadal czyta checkboxy pomiarów
    expect(PC._collectArrows(win.advancedGrowthData, 'height').map((a) => a.key)).toEqual(['a120', 'a144', 'cur']);
  });

  it('kontekst palRegular: magazyny układu i wolnych adnotacji odseparowane od advancedGrowthData', () => {
    const win = {};
    const PC = loadCreator(win);
    win.advancedGrowthData = sampleAdv();
    PC._setContext('palRegular');
    PC._updateOverride('height', 'a120', { dx: 70, dy: -40 });
    const freeId = PC._addFree('height', { ageMonths: 100, value: 120, txt: 'Notatka', arrow: false });
    PC._setContext('pub');
    // zapisy trafiły do chartCreatorData, nie do danych karty
    expect(win.chartCreatorData.palRegular.layout.height.a120).toEqual({ dx: 70, dy: -40 });
    expect(win.chartCreatorData.palRegular.free.height[0].txt).toBe('Notatka');
    expect(win.advancedGrowthData.pubLayout).toBeUndefined();
    expect(win.advancedGrowthData.pubFree).toBeUndefined();
    // a zapisy publikacyjne nie widzą wpisów kontekstu zwykłego
    PC._updateOverride('height', 'cur', { dx: 5, dy: 5 });
    expect(win.advancedGrowthData.pubLayout.height.cur).toEqual({ dx: 5, dy: 5 });
    expect(win.chartCreatorData.palRegular.layout.height.cur).toBeUndefined();
    expect(freeId).toBe(1);
  });

  it('drawAnnotations wybiera magazyn wg trybu renderu (publicationCharts)', () => {
    const win = {};
    const PC = loadCreator(win);
    win.advancedGrowthData = sampleAdv();
    win.advancedGrowthData.measurements = [];
    win.advancedGrowthData.currentArrowEnabled = false;
    // etykieta tylko w magazynie kontekstu zwykłego
    PC._setContext('palRegular');
    PC._addFree('height', { ageMonths: 100, value: 120, txt: 'Zwykła', arrow: false });
    PC._setContext('pub');
    const geom = { chartType: 'height', ...GEOM };
    // render zwykłej siatki (publicationCharts=false) maluje etykietę z magazynu centralnego
    win.publicationCharts = false;
    let calls = [];
    PC.drawAnnotations(fakeCtx(calls), geom);
    expect(calls.some((c) => c[0] === 'fillText' && c[1] === 'Zwykła')).toBe(true);
    // render publikacyjny (flaga true) nie widzi tej etykiety
    win.publicationCharts = true;
    calls = [];
    PC.drawAnnotations(fakeCtx(calls), geom);
    expect(calls.some((c) => c[0] === 'fillText' && c[1] === 'Zwykła')).toBe(false);
  });

  it('grot na orbicie: ramka w poziomie od punktu → grot z boku punktu, linia pozioma', () => {
    const PC = loadCreator();
    // środek ramki (1300, 1000) idealnie na prawo od punktu (1000, 1000)
    const item = {
      key: 'x', px: 1000, py: 1000, tipY: 1015, drop: 200, fs: 40,
      autoX: 900, autoY: 1220, x: 1200, y: 950, w: 200, h: 100,
      lines: ['ab'], comment: 'ab', moved: true
    };
    const calls = [];
    PC._drawItems(fakeCtx(calls), [item]);
    // wierzchołek grotu na orbicie: 15 px od punktu po stronie ramki → (1015, 1000)
    const apex = calls.find((c) => c[0] === 'moveTo' && Math.abs(c[1] - 1015) < 1e-6 && Math.abs(c[2] - 1000) < 1e-6);
    expect(apex).toBeTruthy();
    // łącznik zaczyna się od podstawy grotu (1025, 1000) i biegnie poziomo do środka ramki (1300, 1000)
    const lineStart = calls.find((c) => c[0] === 'moveTo' && Math.abs(c[1] - 1025) < 1e-6 && Math.abs(c[2] - 1000) < 1e-6);
    expect(lineStart).toBeTruthy();
    const lineEnd = calls.find((c) => c[0] === 'lineTo' && Math.abs(c[1] - 1300) < 1e-6 && Math.abs(c[2] - 1000) < 1e-6);
    expect(lineEnd).toBeTruthy();
  });

  it('grot na orbicie: ramka nad punktem → grot nad punktem (nie chowa się pod punktem)', () => {
    const PC = loadCreator();
    // środek ramki (1000, 800) idealnie nad punktem (1000, 1000)
    const item = {
      key: 'x', px: 1000, py: 1000, tipY: 1015, drop: 200, fs: 40,
      autoX: 900, autoY: 1220, x: 900, y: 750, w: 200, h: 100,
      lines: ['ab'], comment: 'ab', moved: true
    };
    const calls = [];
    PC._drawItems(fakeCtx(calls), [item]);
    // wierzchołek grotu NAD punktem: (1000, 985)
    const apex = calls.find((c) => c[0] === 'moveTo' && Math.abs(c[1] - 1000) < 1e-6 && Math.abs(c[2] - 985) < 1e-6);
    expect(apex).toBeTruthy();
    // żaden element strzałki nie jest rysowany poniżej punktu
    const belowPoint = calls.filter((c) => (c[0] === 'moveTo' || c[0] === 'lineTo') && c[2] > 1000.01);
    expect(belowPoint).toHaveLength(0);
  });

  it('magnes pionu: środek ramki w progu od pionu punktu doskakuje idealnie do pionu', () => {
    const PC = loadCreator();
    // ramka automatycznie wyśrodkowana pod punktem: autoX + w/2 === px
    const item = { autoX: 400, autoY: 900, w: 200, h: 100, px: 500, py: 700 };
    // przesunięcie w bok o 10 px przy progu 16 px → dx wraca do idealnego pionu (0)
    let s = PC._applySnap(item, 10, 300, 16);
    expect(s.v).toBe(true);
    expect(s.dx).toBe(0);
    expect(s.dy).toBe(300);
    // poza progiem — bez przyciągania
    s = PC._applySnap(item, 40, 300, 16);
    expect(s.v).toBe(false);
    expect(s.dx).toBe(40);
  });

  it('magnes poziomu: środek ramki na wysokości punktu daje idealnie poziomą strzałkę', () => {
    const PC = loadCreator();
    const item = { autoX: 400, autoY: 900, w: 200, h: 100, px: 500, py: 700 };
    // środek ramki Y = 900+50+dy; punkt py=700 → dy=-250 idealnie; -242 jest w progu 16
    const s = PC._applySnap(item, 300, -242, 16);
    expect(s.h).toBe(true);
    expect(s.dy).toBe(-250);
    expect(s.dx).toBe(300);
  });

  it('magnes pozycji automatycznej: małe przesunięcie w obu osiach wraca do (0,0)', () => {
    const PC = loadCreator();
    const item = { autoX: 400, autoY: 900, w: 200, h: 100, px: 500, py: 700 };
    const s = PC._applySnap(item, 6, -9, 16);
    expect(s.auto).toBe(true);
    expect(s.dx).toBe(0);
    expect(s.dy).toBe(0);
    // bez progu (0) — funkcja niczego nie zmienia
    const raw = PC._applySnap(item, 6, -9, 0);
    expect(raw.dx).toBe(6);
    expect(raw.dy).toBe(-9);
    expect(raw.auto).toBe(false);
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
    // bez tłumienia — maluje adnotacje (render publikacyjny czyta dane karty)
    win.publicationCharts = true;
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

  it('inline_index_07.js bramkuje elementy siatki publikacyjnej przez isElementEnabled', () => {
    expect(generatorSource).toContain('__pubok=n=>');
    expect(generatorSource).toContain('__pubok("patientName")');
    expect(generatorSource).toContain('__pubok("parentsHeader")');
    expect(generatorSource).toContain('__pubok("boneAge")');
    expect(generatorSource).toContain('__pubok("mph")');
    expect(generatorSource).toContain('__pubok("summary")');
    expect(generatorSource).toContain('__pubok("footer")');
  });

  it('inline_index_03.js: helpery widoczności pytają kreator w trybie publikacji', () => {
    const core = fs.readFileSync(path.join(repositoryRoot, 'inline_index_03.js'), 'utf8');
    expect(core).toContain('isElementEnabled(e==="cm"?"heightLabel":"weightLabel")');
    expect(core).toContain('isElementEnabled("bandReference")');
  });

  it('inline_index_07.js woła VildaPublicationCreator.drawAnnotations dla obu siatek', () => {
    expect(generatorSource).toContain(
      'PC.drawAnnotations(e,{chartType:o,plotX:te+120,plotY:ne+80,plotW:Z-120-100,plotH:U-80-80,minY:F,maxY:R})'
    );
    // delegacja jest poza gałęzią wyłącznie-wzrostową i BEZ bramki trybu
    // publikacji — drawAnnotations sam wybiera magazyn wg publicationCharts
    // (centralny kreator siatek: kontekst palRegular dla zwykłej siatki)
    expect(generatorSource).toContain('})()),(function(){try{var PC=window.VildaPublicationCreator');
    expect(generatorSource).not.toContain('window.publicationCharts&&(function(){try{var PC=window.VildaPublicationCreator');
    // …a stary blok rysujący strzałki tylko dla wzrostu został usunięty
    expect(generatorSource).not.toContain('if(!window.publicationCharts||o!=="height")return;const t=window.advancedGrowthData');
  });

  it('index.html ładuje moduł kreatora i zawiera przycisk otwierający (PRO)', () => {
    const indexHtml = fs.readFileSync(path.join(repositoryRoot, 'index.html'), 'utf8');
    expect(indexHtml).toContain('vilda_publication_creator.js?v=16');
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

  it('nowy obiekt danych karty dziedziczy pubLayout i pubFree z poprzedniego', () => {
    const win = {};
    win.advancedGrowthData = {
      pubLayout: { height: { a120: { dx: 60, dy: -110 } }, weight: {} },
      pubFree: { height: [{ id: 1, ageMonths: 100, value: 150, txt: 'Uwaga', arrow: true, fs: 40 }], weight: [] }
    };
    const commit = extractRealCommit()(win);
    const fresh = { measurements: [] };
    commit(fresh, { global: win });
    expect(win.advancedGrowthData).toBe(fresh);
    expect(win.advancedGrowthData.pubLayout).toEqual({ height: { a120: { dx: 60, dy: -110 } }, weight: {} });
    expect(win.advancedGrowthData.pubFree.height).toHaveLength(1);
    expect(win.advancedGrowthData.pubFree.height[0].txt).toBe('Uwaga');
  });

  it('nowy obiekt danych karty dziedziczy pubOptions z poprzedniego', () => {
    const win = {};
    win.advancedGrowthData = { pubOptions: { boneAge: false, summary: true } };
    const commit = extractRealCommit()(win);
    const fresh = { measurements: [] };
    commit(fresh, { global: win });
    expect(win.advancedGrowthData.pubOptions).toEqual({ boneAge: false, summary: true });
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
