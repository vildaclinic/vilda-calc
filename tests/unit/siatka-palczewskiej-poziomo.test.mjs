import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-PAL-POZIOM (decyzja właściciela 2026-10-16): siatka Palczewskiej 1–18 lat może trafić do PDF
// na jednej stronie A4 w poziomie — wzrost po lewej, waga po prawej, wspólny nagłówek i jedna
// stopka. Domyślnie zostają 2 strony w pionie, siatki do publikacji są zawsze w pionie.
// Testy wołają PRAWDZIWY moduł vilda_centile_landscape.js i prawdziwy adapter preferencji
// (AGENTS.md §3.5). Wykresy i teksty nagłówka daje generator z inline_index_07.js — tu atrapa,
// bo moduł ma je tylko złożyć, nie liczyć. Piksele wykresów sprawdza e2e.

function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

function zapisujacyKontekst(calls) {
  return {
    font: '', fillStyle: '', textAlign: '', textBaseline: '',
    fillRect: (...a) => calls.push(['fillRect', ...a]),
    drawImage: (img, x, y) => calls.push(['drawImage', img.id, x, y]),
    fillText(t, x, y) { calls.push(['fillText', t, x, y, this.font, this.fillStyle]); },
    measureText(t) {
      const m = /(\d+)px/.exec(this.font || '');
      return { width: String(t).length * (m ? Number(m[1]) : 10) / 2 };
    },
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
  };
}

function elementy() {
  const picker = { hidden: true };
  const radia = [{ value: 'portrait', checked: true, addEventListener() {} }, { value: 'landscape', checked: false, addEventListener() {} }];
  return { picker, radia };
}

function okno({ zAdapterem = true, generator = true } = {}) {
  const calls = [];
  const { picker, radia } = elementy();
  const win = {
    localStorage: magazyn(),
    sessionStorage: magazyn(),
    setTimeout: (fn) => fn(),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    CustomEvent: class {},
  };
  win.document = {
    readyState: 'complete',
    addEventListener() {},
    removeEventListener() {},
    hidden: false,
    getElementById: (id) => (id === 'palPdfLayoutPicker' ? picker : null),
    querySelectorAll: (sel) => (sel === 'input[name="palPdfLayout"]' ? radia : []),
    createElement: (tag) => {
      if (tag !== 'canvas') throw new Error('tylko canvas');
      return { id: 'strona', width: 0, height: 0, getContext: () => zapisujacyKontekst(calls) };
    },
  };
  win.window = win;
  if (zAdapterem) loadBrowserScript('vilda_persistence_adapter.js', win);
  if (generator) {
    win.__generator = [];
    win.buildPalczewskaExtendedCanvases = (args, layout) => {
      win.__generator.push({ args, layout });
      return [{ id: 'wzrost' }, { id: 'waga' }];
    };
    win.getPalczewskaExtendedHeaderTexts = (sex, publication) => ({
      name: 'Imię i nazwisko: Pacjent Testowy',
      mother: 'wzrost Mamy: 164,0 cm (43 centyl)',
      father: 'wzrost Taty: 181,0 cm (64 centyl)',
      mph: `MPH: 179,0 cm (52 centyl)${publication ? ' [pub]' : ''}`,
    });
  }
  loadBrowserScript('vilda_centile_landscape.js', win);
  return { win, L: win.VildaCentileLandscape, calls, picker, radia };
}

const ARGS = { sex: 'M', userAgeMonths: 120, userWeight: 33, userHeight: 141 };
const stan = (mode, extra = {}) => ({ visible: true, supported: true, source: 'PALCZEWSKA', palPlan: { mode }, ...extra });

describe('P-PAL-POZIOM: preferencja układu PDF', () => {
  it('domyślnie 2 strony w pionie; nieznana wartość wraca do pionu', () => {
    const { L } = okno();
    expect(L.readLayout()).toBe('portrait');
    expect(L.normalizeLayout('landscape')).toBe('landscape');
    for (const v of [null, undefined, '', 'LANDSCAPE', 'poziom', 1]) expect(L.normalizeLayout(v)).toBe('portrait');
  });

  it('wybór zapisuje się przez prawdziwy adapter preferencji i jest ustawieniem dokumentu (cloud-synced)', () => {
    const { win, L } = okno();
    expect(L.writeLayout('landscape')).toBe(true);
    expect(L.readLayout()).toBe('landscape');
    const P = win.VildaPersistence;
    expect(P.MODULE_KEY_META[P.MODULE_KEYS.PAL_PDF_LAYOUT].storage).toBe('cloud-synced');
    expect(P.readPreferenceRaw('PAL_PDF_LAYOUT', null)).toBe('landscape');
    expect(L.writeLayout('cokolwiek')).toBe(true);
    expect(L.readLayout(), 'zapis normalizuje wartość').toBe('portrait');
  });

  it('bez adaptera preferencji moduł zostaje przy pionie i nie rzuca', () => {
    const { L } = okno({ zAdapterem: false });
    expect(L.readLayout()).toBe('portrait');
    expect(L.writeLayout('landscape')).toBe(false);
    expect(L.shouldUseLandscape()).toBe(false);
  });
});

describe('P-PAL-POZIOM: kiedy strona pozioma', () => {
  it('tylko po wybraniu poziomu, poza trybem publikacji i przy dostępnym generatorze', () => {
    const { win, L } = okno();
    expect(L.shouldUseLandscape(), 'domyślny pion').toBe(false);
    L.writeLayout('landscape');
    expect(L.shouldUseLandscape()).toBe(true);
    win.publicationCharts = true;
    expect(L.shouldUseLandscape(), 'siatki do publikacji zawsze w pionie').toBe(false);
    win.publicationCharts = false;
    delete win.getPalczewskaExtendedHeaderTexts;
    expect(L.shouldUseLandscape(), 'bez generatora nagłówka — dotychczasowy pion').toBe(false);
  });

  it('przełącznik widać tylko, gdy przycisk wygeneruje siatkę 1–18 lat', () => {
    const { win, L } = okno();
    expect(L.isToggleRelevant(stan('EXTENDED_ONLY'))).toBe(true);
    expect(L.isToggleRelevant(stan('BOTH_REQUIRED'))).toBe(true);
    expect(L.isToggleRelevant(stan('CHOICE')), 'wiek 1–3 lata: wybór zakresu w oknie').toBe(true);
    expect(L.isToggleRelevant(stan('INFANT_ONLY')), 'sama siatka 0–3 lata ma jedną stronę').toBe(false);
    expect(L.isToggleRelevant(stan('EXTENDED_ONLY', { supported: false })), 'bez wyników PRO').toBe(false);
    expect(L.isToggleRelevant(stan('EXTENDED_ONLY', { visible: false })), '18 lat i więcej').toBe(false);
    expect(L.isToggleRelevant(stan('EXTENDED_ONLY', { source: 'OLAF' }))).toBe(false);
    expect(L.isToggleRelevant(null)).toBe(false);
    win.publicationCharts = true;
    expect(L.isToggleRelevant(stan('EXTENDED_ONLY')), 'tryb publikacji').toBe(false);
  });

  it('refreshToggle pokazuje albo chowa przełącznik i zaznacza zapisany układ', () => {
    const { L, picker, radia } = okno();
    L.refreshToggle(stan('EXTENDED_ONLY'));
    expect(picker.hidden).toBe(false);
    expect(radia.map((r) => r.checked)).toEqual([true, false]);
    L.writeLayout('landscape');
    L.refreshToggle(stan('BOTH_REQUIRED'));
    expect(radia.map((r) => r.checked)).toEqual([false, true]);
    L.refreshToggle(stan('INFANT_ONLY'));
    expect(picker.hidden).toBe(true);
  });
});

describe('P-PAL-POZIOM: składanie strony A4 poziomo', () => {
  it('geometria: dwie kolumny obok siebie, nagłówek nad wykresami, stopka pod nimi, wszystko na kartce', () => {
    const { L } = okno();
    const g = L.GEOMETRY;
    expect([g.pageWidth, g.pageHeight], 'A4 poziomo w 300 dpi').toEqual([3508, 2480]);
    expect(g.heightX + g.slotWidth).toBe(g.weightX);
    expect(g.weightX + g.slotWidth).toBeLessThanOrEqual(g.pageWidth);
    expect(g.slotTop + g.slotHeight).toBeLessThan(g.footerBaselineY - 38);
    expect(g.parentsY + 36).toBeLessThanOrEqual(g.slotTop);
    // Pole rysowania siatki wzrostu wg marginesów generatora (120 px z lewej, 100 px z prawej).
    expect(g.plotLeft).toBe(g.heightX + 120);
    expect(g.plotRight).toBe(g.heightX + g.slotWidth - g.rightReserve - 100);
    // Napisy co najmniej 5 mm od krawędzi kartki (11,811 px/mm).
    expect(g.titleY / 11.811).toBeGreaterThanOrEqual(5);
    expect((g.pageHeight - g.footerBaselineY) / 11.811).toBeGreaterThanOrEqual(5);
  });

  it('wykresy daje generator z parametrem układu; strona ma wspólny nagłówek i jedną stopkę', () => {
    const { win, L, calls } = okno();
    const strona = L.buildPage(ARGS);
    expect([strona.width, strona.height]).toEqual([3508, 2480]);
    expect(win.__generator).toEqual([{ args: ARGS, layout: { width: 1684, height: 2090, rightReserve: 70, bottomReserve: 30 } }]);
    expect(calls.filter((c) => c[0] === 'drawImage')).toEqual([
      ['drawImage', 'wzrost', 120, 278],
      ['drawImage', 'waga', 1804, 278],
    ]);
    const teksty = calls.filter((c) => c[0] === 'fillText');
    const t = (s) => teksty.find((c) => c[1] === s);
    expect(t('Siatki centylowe wzrostu i wagi – chłopcy'), 'jeden wspólny tytuł').toBeTruthy();
    expect(t('Badanie Palczewskiej i Niedźwieckiej (1–18 lat)')).toBeTruthy();
    // Imię i dane rodziców nad siatką wzrostu (lewa kolumna), w kolejności Mama, Tata, MPH.
    expect(t('Imię i nazwisko: Pacjent Testowy').slice(2, 4)).toEqual([240, 190]);
    const rodzice = ['wzrost Mamy: 164,0 cm (43 centyl)', 'wzrost Taty: 181,0 cm (64 centyl)', 'MPH: 179,0 cm (52 centyl)'].map(t);
    expect(rodzice.every(Boolean)).toBe(true);
    expect(rodzice[0][2]).toBe(240);
    expect(rodzice[0][2] < rodzice[1][2] && rodzice[1][2] < rodzice[2][2]).toBe(true);
    expect(rodzice.every((c) => c[3] === 240)).toBe(true);
    expect(rodzice[2][2], 'MPH zaczyna się nad lewą kolumną').toBeLessThan(L.GEOMETRY.weightX);
    // Jedna stopka (dwa fragmenty: tekst i pogrubiona domena).
    expect(teksty.filter((c) => c[1] === 'Siatkę centylową wygenerowano ze strony')).toHaveLength(1);
    expect(teksty.filter((c) => c[1] === ' wagaiwzrost.pl')).toHaveLength(1);
    // Nagłówek po wykresach: białe tło wykresów nie przykrywa liter nagłówka.
    const ostatniObraz = calls.map((c) => c[0]).lastIndexOf('drawImage');
    expect(calls.findIndex((c) => c[0] === 'fillText')).toBeGreaterThan(ostatniObraz);
  });

  it('teksty nagłówka: polskie (nie publikacyjne), z jednej funkcji generatora', () => {
    const { L, calls } = okno();
    L.buildPage(ARGS);
    expect(calls.some((c) => c[0] === 'fillText' && String(c[1]).includes('[pub]'))).toBe(false);
  });

  it('bramki „Elementy siatki” Kreatora: wyłączone elementy nagłówka i stopki nie są rysowane, w kontekście zwykłej siatki', () => {
    const { win, L, calls } = okno();
    const konteksty = [];
    let zwykly = false;
    win.VildaPublicationCreator = {
      _setRegularRender: (v) => { zwykly = !!v; konteksty.push(zwykly); },
      isElementEnabled: (n) => { expect(zwykly, `bramka ${n} w kontekście zwykłej siatki`).toBe(true); return n === 'patientName'; },
    };
    L.buildPage(ARGS);
    const teksty = calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
    expect(teksty).toContain('Imię i nazwisko: Pacjent Testowy');
    expect(teksty.some((s) => s.startsWith('wzrost Mamy') || s.startsWith('MPH:'))).toBe(false);
    expect(teksty).not.toContain(' wagaiwzrost.pl');
    expect(konteksty, 'kontekst ustawiony i zdjęty').toEqual([true, false]);
  });

  it('bez generatora albo bez dwóch wykresów — null (Re wraca wtedy do 2 stron w pionie)', () => {
    expect(okno({ generator: false }).L.buildPage(ARGS)).toBeNull();
    const { win, L } = okno();
    win.buildPalczewskaExtendedCanvases = () => [{ id: 'wzrost' }];
    expect(L.buildPage(ARGS)).toBeNull();
    expect(L.buildPage(null)).toBeNull();
  });

  it('dziewczynka: tytuł w żeńskiej formie', () => {
    const { L, calls } = okno();
    L.buildPage({ ...ARGS, sex: 'F' });
    expect(calls.some((c) => c[0] === 'fillText' && c[1] === 'Siatki centylowe wzrostu i wagi – dziewczynki')).toBe(true);
  });
});
