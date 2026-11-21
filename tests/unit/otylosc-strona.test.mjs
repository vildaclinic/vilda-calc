import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { appSrc, funkcjaZ, tablica, zrodlo } from '../support/silnik-bmi.mjs';

// P-OTYLOSC-STRONA (temat D projektu „Leczenie otyłości — wpisy poza wizytą”; makieta zaakceptowana 2026-11-20):
// pomiary z dziennika leczenia pacjenta wczytanego na stronie w całej aplikacji — siatka i „Podsumowanie” w „Podsumowaniu
// wyników”, „Poprzednie pomiary” i analiza trajektorii karty zaawansowanej, PDF siatki, „Porównanie z poprzednim pomiarem”.
//   1. VildaDziennikOtylosci.pomiaryStrony / pomiaryOdcinka / opisy — na PRAWDZIWYM sejfie (adapter pamięciowy);
//   2. VildaTrajectoryAnalysis.analyze z flagą karty zaawansowanej (dziennikStrony) i bez niej;
//   3. VildaCentileLiveRender.preview — romby obok przebiegu (reported), odczyt w punkcie, przebieg bez zmian.
// Dane wyłącznie FIKCYJNE.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const W = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: '', dose: '2,4 mg / tydz.' };
// Testowa Zuzanna (fikcyjna): wizyty 11, 12, 13 lat; bieżący pomiar 13 l. 6 mies. (13.10.2026).
const WIZYTY = [
  { ageMonths: 132, height: 150.2, weight: 63.0 },
  { ageMonths: 144, height: 155.0, weight: 70.5 },
  { ageMonths: 156, height: 160.0, weight: 80.0 },
];
const BIEZACY = { ageMonths: 162, weight: 75.2, height: 162.9, dateISO: '2026-10-13' };
const MIGAWKA = [
  { id: 'p-start', type: 'start', dateISO: '2026-04-14', ageYears: 13, ageMonths: 0, weight: 80, height: 160, ...W },
  { id: 'p-paz', type: 'continue', dateISO: '2026-10-13', ageYears: 13, ageMonths: 6, weight: 75.2, height: 162.9, ...W },
];
const OD_PACJENTA = [['2026-07-10', 3, 77.8], ['2026-08-12', 4, 76.9], ['2026-11-12', 7, 74.6]];

function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; },
  };
}

// Siatki OLAF zastąpione jawnym, fikcyjnym przeliczeniem wartość → SDS (jak w otylosc-siatki.test.mjs): test sprawdza
// źródło punktów analizy, nie centyle.
const centyl = (sd) => Math.min(99.9, Math.max(0.1, 50 + 34 * Math.tanh(sd)));
function okno() {
  const doc = new EventTarget();
  doc.hidden = false;
  const win = new EventTarget();
  Object.assign(win, {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(), CustomEvent: globalThis.CustomEvent,
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis), document: doc,
    bmiSource: 'OLAF',
    advHistoryResolveMetric(param, value) {
      const sd = param === 'HT' ? 0.4 : param === 'WT' ? (value - 40) / 15 : (value - 20) / 4;
      return { result: { percentile: centyl(sd), sd }, source: 'OLAF', reason: '' };
    },
  });
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  loadBrowserScript('vilda_trajectory_analysis.js', win);
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  return { win, vault, D: win.VildaDziennikOtylosci, T: win.VildaTrajectoryAnalysis };
}

let teraz = Date.parse('2026-11-20T08:00:00.000Z');
const krok = (ms = 60e3) => { teraz += ms; vi.setSystemTime(teraz); };
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(teraz); });
afterEach(() => { vi.useRealTimers(); });

async function przygotuj({ wpisy = OD_PACJENTA, gabinet = null } = {}) {
  const U = okno();
  await U.vault.createUser('Fikcyjne#Strona!D', { label: 'Fikcyjny lekarz', iterations: 10000 });
  krok();
  const pid = (await U.vault.savePatient({ name: 'Testowa Zuzanna', user: { sex: 'F', age: 13, ageMonths: 6, height: 162.9, weight: 75.2 },
    obesityTherapyPoints: MIGAWKA }, { dedup: false })).patientId;
  const dane = wpisy.map(([d, m, kg]) => ({ type: 'continue', dateISO: d, ageYears: 13, ageMonths: m, weight: kg, weightSource: 'pacjent', height: null, ...W }));
  if (gabinet) dane.push({ type: 'continue', ageYears: 13, height: null, weightSource: 'gabinet', ...W, ...gabinet });
  for (const d of dane) {
    const plan = U.D.planNowego(await U.D.wczytaj(pid, MIGAWKA, { vault: U.vault }), pid, d);
    expect(plan.ok, JSON.stringify(plan.bledy)).toBe(true);
    krok();
    await U.D.zapisz(pid, plan.wersje, { vault: U.vault });
  }
  U.win.sessionStorage.setItem('vildaCurrentPatientId', pid);
  return { U, pid };
}

describe('pomiaryStrony — dziennik pacjenta wczytanego na stronie', () => {
  it('przed odczytem dziennika i bez wpisów — [] (siatki, podsumowanie i PDF jak dotąd)', async () => {
    const { U } = await przygotuj({ wpisy: [] });
    expect(U.D.pomiaryStrony(WIZYTY.concat([BIEZACY]))).toEqual([]);
    await U.D.odswiezWczytanego();
    expect(U.D.pomiaryStrony(WIZYTY.concat([BIEZACY]))).toEqual([]);
  });

  it('masy od pacjenta z wiekiem pomiaru (także po bieżącym pomiarze); Włączenie i wizyta 13 l. 6 mies. — wizyta wygrywa', async () => {
    const { U, pid } = await przygotuj();
    await U.D.odswiezWczytanego();
    const lista = U.D.pomiaryStrony(WIZYTY.concat([BIEZACY]));
    expect(lista.map((p) => [p.ageMonths, p.weight, p.zrodloMasy, p.dateISO])).toEqual([
      [159, 77.8, 'pacjent', '2026-07-10'], [160, 76.9, 'pacjent', '2026-08-12'], [163, 74.6, 'pacjent', '2026-11-12'],
    ]);
    expect(U.D.pomiaryStrony(WIZYTY.concat([BIEZACY]), { patientId: pid })).toHaveLength(3);
    expect(U.D.pomiaryStrony(WIZYTY.concat([BIEZACY]), { patientId: 'inny-pacjent-0001' }), 'inny pacjent konsumenta').toEqual([]);
    expect(U.D.pomiaryStrony(WIZYTY.concat([BIEZACY]), { doWiekuMies: 162 }).map((p) => p.ageMonths), 'odtworzenie dawnej wizyty').toEqual([159, 160]);
  });

  it('pacjent karty zmieniony (inna karta) — [] do czasu nowego odczytu', async () => {
    const { U } = await przygotuj();
    await U.D.odswiezWczytanego();
    U.win.sessionStorage.setItem('vildaCurrentPatientId', 'inny-pacjent-0001');
    expect(U.D.pomiaryStrony(WIZYTY.concat([BIEZACY]))).toEqual([]);
  });

  it('wpis z gabinetu poza wizytą — źródło „gabinet”; zrodloMetryki dla masy i wzrostu', async () => {
    const { U } = await przygotuj({ wpisy: [], gabinet: { dateISO: '2026-08-20', ageMonths: 4, weight: 76.4, height: 161.8, heightSource: 'gabinet' } });
    await U.D.odswiezWczytanego();
    const [p] = U.D.pomiaryStrony(WIZYTY.concat([BIEZACY]));
    expect([p.ageMonths, p.zrodloMasy, p.zrodloWzrostu]).toEqual([160, 'gabinet', 'gabinet']);
    expect(U.D.zrodloMetryki(p, 'weight')).toBe('gabinet');
    expect(U.D.zrodloMetryki(p, 'height')).toBe('gabinet');
    expect(U.D.zrodloMetryki({ weight: 70, zrodloMasy: 'pacjent' }, 'weight')).toBe('pacjent');
    expect(U.D.zrodloMetryki({ weight: 70, zrodloMasy: 'pacjent' }, 'height'), 'bez wzrostu').toBeNull();
  });
});

describe('pomiaryOdcinka i opisy — karta „Porównanie z poprzednim pomiarem”', () => {
  it('masy od pacjenta między poprzednim (13 l. 0 mies.) a dzisiejszym pomiarem (13 l. 9 mies.)', async () => {
    const { U } = await przygotuj();
    await U.D.odswiezWczytanego();
    const os = [{ ageMonths: 156, weight: 80 }, { ageMonths: 165, weight: 73.5 }];
    expect(U.D.pomiaryOdcinka(os, 156, 165).map((p) => [p.ageMonths, p.weight])).toEqual([[159, 77.8], [160, 76.9], [163, 74.6]]);
    expect(U.D.pomiaryOdcinka(os, 160, 165).map((p) => p.ageMonths), 'od wyłącznie, do włącznie').toEqual([163]);
    expect(U.D.pomiaryOdcinka(os, 165, 156), 'odwrócony odcinek').toEqual([]);
    const [ostatni] = U.D.pomiaryOdcinka(os, 160, 165);
    expect(U.D.opisMasyOdPacjenta(ostatni)).toBe('od pacjenta 12.11.2026: 74,6 kg');
    expect(U.D.opisMasyOdPacjenta({ weight: 70 })).toBe('od pacjenta: 70 kg');
    expect([1, 2, 5, 12, 22].map((n) => U.D.opisOdcinka(n))).toEqual([
      'w odcinku 1 pomiar od pacjenta', 'w odcinku 2 pomiary od pacjenta', 'w odcinku 5 pomiarów od pacjenta',
      'w odcinku 12 pomiarów od pacjenta', 'w odcinku 22 pomiary od pacjenta',
    ]);
  });

  it('wpis z tego samego miesiąca życia co dzisiejszy pomiar — pominięty (wizyta wygrywa)', async () => {
    const { U } = await przygotuj();
    await U.D.odswiezWczytanego();
    expect(U.D.pomiaryOdcinka([{ ageMonths: 162, weight: 75.2 }, { ageMonths: 163, weight: 74 }], 162, 163)).toEqual([]);
  });
});

describe('analiza trajektorii karty zaawansowanej (dziennikStrony)', () => {
  const wejscie = (nad = {}) => ({ measurements: WIZYTY.map((m) => ({ ...m, ageYears: m.ageMonths / 12 })),
    currentAgeMonths: 162, currentAgeYears: 13.5, currentHeight: 162.9, currentWeight: 75.2, sex: 'F', source: 'OLAF', ...nad });

  it('z flagą — seria wagi z masami od pacjenta (wariant B), żeton i karta wagi podpisane', async () => {
    const { U } = await przygotuj();
    await U.D.odswiezWczytanego();
    const model = U.T.analyze(wejscie({ dziennikStrony: true }));
    expect(model.points.map((p) => [p.ageMonths, p.weight, p.zrodloMasy])).toEqual([
      [132, 63, null], [144, 70.5, null], [156, 80, null], [159, 77.8, 'pacjent'], [160, 76.9, 'pacjent'], [162, 75.2, null], [163, 74.6, 'pacjent'],
    ]);
    expect(model.metrics.find((m) => m.metric === 'weight').odPacjenta).toBe(3);
    expect(U.T.buildPatientHtml(model)).toContain('w tym 3 od pacjenta</span>');
  });

  it('bez flagi (Karta pacjenta podaje pomiary sama) — tylko wizyty', async () => {
    const { U } = await przygotuj();
    await U.D.odswiezWczytanego();
    const model = U.T.analyze(wejscie());
    expect(model.points.map((p) => p.ageMonths)).toEqual([132, 144, 156, 162]);
  });

  it('odtworzenie dawnej wizyty 13 l. 4 mies. (jest późniejszy pomiar) — bez wpisów po jej wieku', async () => {
    const { U } = await przygotuj();
    await U.D.odswiezWczytanego();
    const model = U.T.analyze(wejscie({ dziennikStrony: true, currentAgeMonths: 158, currentAgeYears: 158 / 12, currentWeight: 78.5,
      measurements: WIZYTY.concat([{ ageMonths: 162, height: 162.9, weight: 75.2 }]) }));
    expect(model.points.filter((p) => p.zrodloMasy === 'pacjent').map((p) => p.ageMonths)).toEqual([]);
    expect(model.points.map((p) => p.ageMonths)).toEqual([132, 144, 156, 158, 162]);
  });
});

// Prawdziwe producenty siatek (modelOnly) i prawdziwy moduł podglądu, jak w centile-live-preview-model.test.mjs.
function silnikPodgladu() {
  const document = {
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    getElementById() { return null; }, createElement: vi.fn(() => { throw Error('Preview created DOM/canvas'); }),
  };
  const win = {
    document, professionalMode: true, publicationCharts: false, addEventListener() {}, console,
    isGrowthResultsProfessionalMode() { return true; },
    getCentileChartHeaderNameState() { return { isBasicGrowth: false }; },
    buildCentileChartNameLabel() { return null; },
    PALCZEWSKA_INFANT_MIN_MONTHS: 0, PALCZEWSKA_INFANT_MAX_MONTHS: 35, PALCZEWSKA_EXTENDED_MAX_MONTHS: 216,
    OLAF_DATA_MIN_AGE: 3,
  };
  win.window = win; win.globalThis = win;
  for (const name of ['LMS_WEIGHT_BOYS', 'LMS_WEIGHT_GIRLS', 'LMS_HEIGHT_BOYS', 'LMS_HEIGHT_GIRLS',
    'LMS_INFANT_HEIGHT_BOYS', 'LMS_INFANT_HEIGHT_GIRLS', 'LMS_HEIGHT_WHO_BOYS', 'LMS_HEIGHT_WHO_GIRLS',
    'LMS_INFANT_WEIGHT_BOYS', 'LMS_INFANT_WEIGHT_GIRLS']) win[name] = tablica(name);
  const context = vm.createContext(win);
  for (const file of ['centile_data.js', 'ds_lms.js', 'vilda_bmi.js', 'vilda_centile_interpolation.js', 'vilda_sds_wzrostu.js',
    'vilda_centile_charts.js', 'inline_index_03.js', 'inline_index_04.js', 'inline_index_05.js', 'inline_index_07.js', 'vilda_centile_live_colors.js', 'vilda_centile_live_render.js']) {
    vm.runInContext(zrodlo(file), context, { filename: file });
  }
  win.VildaSdsWzrostu.ustawDane({ palCentyl: (sex, age, p) => win.VildaCentileInterp.palCentileValue(sex, age, p, 'HT'),
    LMS_HEIGHT_DS_INFANT_BOYS: win.VildaDsLMS.NIEMOWLE.HT.M, LMS_HEIGHT_DS_INFANT_GIRLS: win.VildaDsLMS.NIEMOWLE.HT.F,
    LMS_HEIGHT_DS_BOYS: win.VildaDsLMS.DZIECKO.HT.M, LMS_HEIGHT_DS_GIRLS: win.VildaDsLMS.DZIECKO.HT.F });
  for (const name of ['vildaDsTablica', 'vildaDsWiersz', 'vildaWiekDoSiatek', 'erf', 'normalCDF', 'normInv', 'getPalReferenceCentileInterpolated', 'getPalCentile',
    'calcPercentileStatsPal', 'getPLWeightCentile', 'getPLHeightCentile']) {
    vm.runInContext(funkcjaZ(appSrc, name), context, { filename: `app.js:${name}` });
  }
  return win;
}

describe('podgląd siatki „Podsumowania wyników” — pomiary z dziennika obok przebiegu', () => {
  const win = silnikPodgladu();
  const snapshot = {
    sex: 'F', source: 'OLAF', ageMonths: 162, exactAgeMonths: 162, currentHeight: 162.9, currentWeight: 75.2, professionalMode: true,
    measurements: WIZYTY,
    reportedMeasurements: [
      { ageMonths: 159, ageYears: 159 / 12, weight: 77.8, height: null, dateISO: '2026-07-10', zrodloMasy: 'pacjent', zrodloWzrostu: null, zDziennika: true },
      { ageMonths: 160, ageYears: 160 / 12, weight: 76.4, height: 161.8, dateISO: '2026-08-20', zrodloMasy: 'gabinet', zrodloWzrostu: 'gabinet', zDziennika: true },
      { ageMonths: 163, ageYears: 163 / 12, weight: 74.6, height: null, dateISO: '2026-11-12', zrodloMasy: 'pacjent', zrodloWzrostu: null, zDziennika: true },
    ],
  };

  it('waga: romby od pacjenta i kropka z gabinetu z centylem; przebieg (points) tylko z wizyt', () => {
    const ready = win.VildaCentileLiveRender.preview(snapshot);
    expect(ready.status).toBe('ready');
    const w = ready.weight;
    expect(w.points.map((p) => p.ageMonths)).toEqual([132, 144, 156, 162]);
    expect(w.reported.map((p) => [p.ageMonths, p.value, p.origin, p.dateISO, p.reported])).toEqual([
      [159, 77.8, 'pacjent', '2026-07-10', true], [160, 76.4, 'gabinet', '2026-08-20', true], [163, 74.6, 'pacjent', '2026-11-12', true],
    ]);
    w.reported.forEach((p) => {
      expect(Number.isFinite(p.percentile), 'centyl z tej samej funkcji co pomiary').toBe(true);
      expect(p.current).toBe(false);
    });
    // Odczyt w punkcie z dziennika — ten punkt; między wizytami bez punktu — interpolacja z wizyt jak dotąd.
    expect(win.VildaCentileLiveRender.probe(w, 163)).toMatchObject({ value: 74.6, origin: 'pacjent', reported: true, exact: true });
    expect(win.VildaCentileLiveRender.probe(w, 159)).toMatchObject({ value: 77.8, reported: true });
    const miedzy = win.VildaCentileLiveRender.probe(w, 158);
    expect(miedzy.exact).toBe(false);
    expect(miedzy.reported).toBeUndefined();
  });

  it('wzrost: tylko wpis z wpisanym wzrostem; bez dziennika — reported puste', () => {
    const ready = win.VildaCentileLiveRender.preview(snapshot);
    expect(ready.height.reported.map((p) => [p.ageMonths, p.value, p.origin])).toEqual([[160, 161.8, 'gabinet']]);
    const bez = win.VildaCentileLiveRender.preview({ ...snapshot, reportedMeasurements: undefined });
    expect(bez.weight.reported).toEqual([]);
    expect(bez.weight.points.map((p) => p.ageMonths)).toEqual([132, 144, 156, 162]);
  });
});

describe('źródła łatek w artefaktach zminifikowanych (temat D)', () => {
  const plik = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  it('karta zaawansowana, porównanie i PDF wołają dziennik strony jawnie', () => {
    expect(plik('vilda_advanced_growth.js')).toContain('TJ9=window.VildaTrajectoryAnalysis.analyze({dziennikStrony:!0,measurements:or,');
    const karty = plik('vilda_summary_cards.js');
    expect(karty).toContain('<span id="porownaniePacjent" class="porownanie-chip porownanie-chip--pacjent" hidden></span>');
    expect(karty).toContain('Dz.pomiaryOdcinka([{ageMonths:t.ageMonths,weight:t.weightKg},{ageMonths:A*12,weight:s}],t.ageMonths,A*12)');
    const pdf = plik('inline_index_04.js');
    expect(pdf).toContain('legacyLayout:__legacyLayout,pomiaryDziennika:__dz04}){');
    expect(pdf).toContain('suppressSummaryBox:!!t,pomiaryDziennika:!t}).toDataURL(');
    expect(pdf).toContain('if(__dz04!==!0)return;');
  });
});

describe('VildaAdvDziennik (vilda_cykle_leczenia.js) — bloki „pomiar od pacjenta” w „Poprzednich pomiarach” (czyste funkcje)', () => {
  const okno = { document: { readyState: 'complete', getElementById: () => null, addEventListener() {} } };
  const I = loadBrowserScript('vilda_cykle_leczenia.js', okno).VildaAdvDziennik.__internals;

  it('wiek wiersza jak collectAdvancedMeasurements; opis wieku; miejsce bloku między wierszami', () => {
    expect(I.wiekMies('13', '7')).toBe(163);
    expect(I.wiekMies('12,5', '')).toBe(150);
    expect(I.wiekMies('', '')).toBeNull();
    expect(I.wiekOpis(163)).toBe('13 l. 7 mies.');
    expect(I.wiekOpis(156)).toBe('13 l.');
    expect(I.miejsceBloku([132, 144, 156], 159), 'po ostatnim wierszu').toBe(-1);
    expect(I.miejsceBloku([132, 156, null], 150), 'przed wierszem 13 l.').toBe(1);
    expect(I.odPacjenta({ zrodloMasy: 'gabinet', zrodloWzrostu: 'pacjent' })).toBe(true);
    expect(I.odPacjenta({ zrodloMasy: 'gabinet' })).toBe(false);
  });

  it('pomiaryDoListy: ostatnia wizyta — także wpisy po niej; dawna wizyta (jest późniejszy wiersz) — do jej wieku', () => {
    const wywolania = [];
    const D = { pomiaryStrony: (os, o) => { wywolania.push([os.map((x) => x.ageMonths), o.doWiekuMies]); return [{ ageMonths: 159 }]; } };
    const wiersze = [{ ageMonths: 132, weight: 63 }, { ageMonths: 144, weight: 70.5 }, { ageMonths: 156, weight: 80 }];
    expect(I.pomiaryDoListy(D, wiersze, { ageMonths: 162, weight: 75.2 })).toEqual([{ ageMonths: 159 }]);
    I.pomiaryDoListy(D, wiersze, { ageMonths: 150, weight: 68 });
    I.pomiaryDoListy(D, wiersze, null);
    expect(wywolania).toEqual([[[132, 144, 156, 162], null], [[132, 144, 156, 150], 150], [[132, 144, 156], null]]);
    expect(I.pomiaryDoListy(null, wiersze, null), 'bez modułu dziennika').toEqual([]);
  });
});
