import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tablica } from '../support/silnik-bmi.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Uruchamiamy całe pliki produkcyjne i ich publiczne generatory. Atrapy DOM/canvas
// zapisują operacje rysowania; nie zawierają logiki przypisywania BA do wizyt.
function loadRenderer({ model = true, publication = false } = {}) {
  const canvases = [];
  const document = {
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement(tag) {
      if (tag !== 'canvas') return { style: {} };
      const events = [];
      const state = { fillStyle: '', strokeStyle: '', font: '' };
      const stack = [];
      const context = new Proxy(state, {
        get(target, key) {
          if (key in target) return target[key];
          if (key === 'save') return () => stack.push({ ...target });
          if (key === 'restore') return () => {
            const saved = stack.pop();
            if (saved) {
              Object.keys(target).forEach((name) => delete target[name]);
              Object.assign(target, saved);
            }
          };
          if (key === 'measureText') return (text) => ({ width: String(text).length * 20 });
          return (...args) => events.push({
            method: String(key), args,
            fillStyle: target.fillStyle, strokeStyle: target.strokeStyle,
          });
        },
        set(target, key, value) { target[key] = value; return true; },
      });
      const canvas = { events, context, grids: [], getContext() { return context; }, toDataURL() { return 'data:image/jpeg;base64,'; } };
      canvases.push(canvas);
      return canvas;
    },
  };
  const window = {
    document,
    publicationCharts: publication,
    professionalMode: true,
    isGrowthResultsProfessionalMode() { return true; },
    getCentileChartHeaderNameState() { return { isBasicGrowth: false }; },
    buildCentileChartNameLabel() { return null; },
    addEventListener() {},
    getPalczewskaChartPlan() { return { mode: 'EXTENDED_ONLY' }; },
    PALCZEWSKA_INFANT_MIN_MONTHS: 0,
    PALCZEWSKA_INFANT_MAX_MONTHS: 35,
    PALCZEWSKA_EXTENDED_MAX_MONTHS: 216,
    Path2D: class { moveTo() {} lineTo() {} closePath() {} },
    console,
  };
  // Te same produkcyjne tablice OLAF, których używa strona; bez kopii norm.
  for (const name of ['LMS_WEIGHT_BOYS', 'LMS_WEIGHT_GIRLS', 'LMS_HEIGHT_BOYS', 'LMS_HEIGHT_GIRLS']) {
    window[name] = tablica(name);
  }
  window.window = window;
  window.globalThis = window;
  const context = vm.createContext(window);
  const files = [
    ...(model ? ['vilda_bone_age.js'] : []),
    'centile_data.js',
    'vilda_publication_creator.js',
    'vilda_centile_charts.js',
    'inline_index_03.js',
    'inline_index_04.js',
    'inline_index_07.js',
  ];
  files.forEach((file) => vm.runInContext(
    fs.readFileSync(path.join(repositoryRoot, file), 'utf8'), context, { filename: file }
  ));
  const drawGrid = window.drawCentileGrid;
  window.drawCentileGrid = (ctx, options) => {
    canvases.find((canvas) => canvas.context === ctx).grids.push(options);
    return drawGrid(ctx, options);
  };
  window._chartTestCanvases = canvases;
  return window;
}

const renderers = [
  { name: 'Palczewska 1–18, zwykła', publication: false, page: false },
  { name: 'Palczewska 1–18, publikacja', publication: true, page: false },
  { name: 'strona OLAF PRO', publication: false, page: true },
];

function drawMarkers(window, renderer, data) {
  window.advancedGrowthData = data;
  const current = { sex: 'M', userAgeMonths: 125, userHeight: 142, userWeight: 33 };
  const canvas = renderer.page
    ? window.buildCentilePageCanvas({
      ...current, rangeMinX: 36, rangeMaxX: 216, chartSource: 'OLAF',
      headerTitle: 'Fikcyjny pomiar', headerSubtitle: '', footerText: '',
    })
    : window.buildPalczewskaExtendedCanvases(current)[0];
  return markersOnCanvas(canvas, renderer);
}

function markersOnCanvas(canvas, renderer) {
  const grid = canvas.grids[0];
  const markerRadius = renderer.publication ? 36 : 24;
  const markerColor = renderer.publication ? '#000000' : '#00838d';
  return canvas.events
    .filter((event) => event.method === 'arc'
      && event.args[2] === markerRadius && event.strokeStyle === markerColor)
    .map((event) => ({
      // Odwracamy geometrię osi, żeby sprawdzać odwzorowanie punktów, a nie
      // przywiązywać regresję do liczby pikseli konkretnego układu strony.
      baMonths: Math.round(grid.minX + (event.args[0] - (grid.x + 120))
        / ((grid.w - 220) / (grid.maxX - grid.minX))),
      height: Number((grid.maxY - (event.args[1] - (grid.y + 80))
        / ((grid.h - 160) / (grid.maxY - grid.minY))).toFixed(6)),
    }))
    .sort((a, b) => a.height - b.height || a.baMonths - b.baMonths);
}

function examination(atAgeMonths, years = 9) {
  return { years, atAgeMonths, dateISO: '2026-07-01', source: 'manual' };
}

function sampleData(current = null) {
  return {
    currentAgeMonths: 125, currentHeight: 142, currentWeight: 33,
    boneAgeMonths: 108,
    boneAgeContext: { version: 1, current, last: examination(123) },
    measurements: [
      { ageMonths: 123, height: 141, weight: 32, boneAgeYears: 9 },
      { ageMonths: 125, height: 142, weight: 33 },
    ],
  };
}

for (const renderer of renderers) {
  describe(`markery wieku kostnego — ${renderer.name}`, () => {
    it('na kontroli bez nowego badania rysuje wyłącznie BA historycznej wizyty', () => {
      const window = loadRenderer(renderer);
      const data = sampleData();
      const before = JSON.stringify(data);
      expect(drawMarkers(window, renderer, data)).toEqual([{ baMonths: 108, height: 141 }]);
      expect(JSON.stringify(data)).toBe(before);
      expect(data.measurements[1]).not.toHaveProperty('boneAgeYears');
    });

    it('nowy wynik równy poprzedniemu zachowuje dwa badania na różnych wizytach', () => {
      const window = loadRenderer(renderer);
      expect(drawMarkers(window, renderer, sampleData(examination(125)))).toEqual([
        { baMonths: 108, height: 141 }, { baMonths: 108, height: 142 },
      ]);
    });

    it('pierwsze badanie bieżącej wizyty rysuje przy aktualnej wysokości', () => {
      const window = loadRenderer(renderer);
      const data = sampleData(examination(125));
      data.boneAgeContext.last = null;
      delete data.measurements[0].boneAgeYears;
      expect(drawMarkers(window, renderer, data)).toEqual([{ baMonths: 108, height: 142 }]);
    });

    it('nie rysuje globalnego badania powiązanego z innym wiekiem wizyty', () => {
      const window = loadRenderer(renderer);
      expect(drawMarkers(window, renderer, sampleData(examination(123)))).toEqual([
        { baMonths: 108, height: 141 },
      ]);
    });

    it('nie dubluje globalnego i historycznego markeru tego samego punktu', () => {
      const window = loadRenderer(renderer);
      const data = sampleData(examination(125));
      data.measurements[1].boneAgeYears = 9;
      expect(drawMarkers(window, renderer, data)).toEqual([
        { baMonths: 108, height: 141 }, { baMonths: 108, height: 142 },
      ]);
      expect(data.measurements).toHaveLength(2);
    });

    it('przy deduplikacji uwzględnia wysokość, nie usuwa innego punktu tego samego wieku', () => {
      const window = loadRenderer(renderer);
      const data = sampleData(examination(125));
      data.measurements.push({ ageMonths: 125, height: 143, boneAgeYears: 9 });
      expect(drawMarkers(window, renderer, data)).toEqual([
        { baMonths: 108, height: 141 }, { baMonths: 108, height: 142 },
        { baMonths: 108, height: 143 },
      ]);
    });

    it('przy deduplikacji uwzględnia wiek, zachowuje różne wizyty przy tej samej wysokości', () => {
      const window = loadRenderer(renderer);
      const data = sampleData(examination(125));
      data.measurements[0].height = 142;
      expect(drawMarkers(window, renderer, data)).toEqual([
        { baMonths: 108, height: 142 }, { baMonths: 108, height: 142 },
      ]);
    });

    it('przy deduplikacji uwzględnia BA, zachowuje inny wynik tego samego punktu', () => {
      const window = loadRenderer(renderer);
      const data = sampleData(examination(125, 9.5));
      data.measurements[1].boneAgeYears = 9;
      expect(drawMarkers(window, renderer, data)).toEqual([
        { baMonths: 108, height: 141 }, { baMonths: 108, height: 142 },
        { baMonths: 114, height: 142 },
      ]);
    });

    it('zaokrągla BA spójnie z dawnym rendererem i rozpoznaje identyczny punkt', () => {
      const window = loadRenderer(renderer);
      const data = sampleData(examination(125, 9.1));
      data.measurements[1].boneAgeYears = 9.1;
      expect(drawMarkers(window, renderer, data)).toEqual([
        { baMonths: 108, height: 141 }, { baMonths: 109, height: 142 },
      ]);
    });

    it('zachowuje historyczne badania różnych wizyt o identycznym BA', () => {
      const window = loadRenderer(renderer);
      const data = sampleData();
      data.measurements[1].boneAgeYears = 9;
      expect(drawMarkers(window, renderer, data)).toEqual([
        { baMonths: 108, height: 141 }, { baMonths: 108, height: 142 },
      ]);
    });

    it('zachowuje dotychczasowe markery danych legacy bez kontekstu wizyty', () => {
      const window = loadRenderer(renderer);
      const data = sampleData();
      delete data.boneAgeContext;
      expect(drawMarkers(window, renderer, data)).toEqual([
        { baMonths: 108, height: 141 }, { baMonths: 108, height: 142 },
      ]);
    });

    it('fallback legacy działa również bez wspólnego modelu', () => {
      const window = loadRenderer({ ...renderer, model: false });
      const data = sampleData();
      delete data.boneAgeContext;
      expect(drawMarkers(window, renderer, data)).toEqual([
        { baMonths: 108, height: 141 }, { baMonths: 108, height: 142 },
      ]);
    });

    it('przy braku modelu nie interpretuje last danych version1 jako nowego badania', () => {
      const window = loadRenderer({ ...renderer, model: false });
      expect(drawMarkers(window, renderer, sampleData())).toEqual([{ baMonths: 108, height: 141 }]);
    });

    it('kontekst kreatora dziedziczy powiązanie wizyty i nie pokazuje last jako current', () => {
      const window = loadRenderer(renderer);
      const data = sampleData();
      const contextualData = window.VildaPublicationCreator._advForContext(
        data, renderer.page ? 'olaf' : 'palRegular'
      );
      expect(drawMarkers(window, renderer, contextualData)).toEqual([{ baMonths: 108, height: 141 }]);
      expect(contextualData.boneAgeContext).toBe(data.boneAgeContext);
    });

    it('zachowuje przełącznik widoczności BA kreatora publikacji', () => {
      const window = loadRenderer(renderer);
      const data = sampleData(examination(125));
      if (renderer.publication) data.pubOptions = { boneAge: false };
      else window.chartCreatorData = {
        [renderer.page ? 'olaf' : 'palRegular']: { options: { boneAge: false } },
      };
      expect(drawMarkers(window, renderer, data)).toEqual([]);
    });
  });
}

// Karta pacjenta buduje external.adv z pomiarów osi czasu, bez globalnego
// boneAgeMonths formularza. Wywołujemy realny publiczny eksport, a atrapą jest
// jedynie zapis PDF; obie strony korzystają z tej samej funkcji inline_index_04.
it('eksport external karty pacjenta rysuje tylko własne BA i przywraca stan formularza', async () => {
  const window = loadRenderer();
  const unrelated = { currentAgeMonths: 125, currentHeight: 150, boneAgeMonths: 120 };
  window.advancedGrowthData = unrelated;
  const payload = {
    external: true, ageMonths: 125, height: 142, weight: 33, sex: 'M', returnBlob: true,
    adv: {
      currentAgeMonths: 125, currentHeight: 142, currentWeight: 33,
      sourceModule: 'vilda-patient-card',
      measurements: [{ ageMonths: 123, height: 141, weight: 32, boneAgeYears: 9 }],
    },
  };
  const result = { syntheticPdf: true };
  window.jspdf = { jsPDF: class { addImage() {} addPage() {} output() { return result; } } };
  expect(await window.generateCentileChart(payload)).toBe(result);
  expect(markersOnCanvas(window._chartTestCanvases[0], renderers[2])).toEqual([
    { baMonths: 108, height: 141 },
  ]);
  expect(window.advancedGrowthData).toBe(unrelated);
  expect(payload.adv).not.toHaveProperty('boneAgeMonths');
});
