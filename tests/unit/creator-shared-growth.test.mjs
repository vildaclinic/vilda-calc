import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Wyłącznie FIKCYJNE pomiary. Wywołujemy rzeczywiste funkcje Kreatora.
const MEASUREMENTS = {
  measurements: [
    { ageMonths: 24, height: 88, weight: 12 },
    { ageMonths: 120, height: 140, weight: 32 },
    { ageMonths: 144, height: 156, weight: 41 }
  ],
  currentAgeMonths: 156,
  currentHeight: 162,
  currentWeight: 46
};
const OLAF_H = { plotX: 220, plotY: 300, plotW: 1800, plotH: 900, ageMin: 36, ageMax: 216, minY: 70, maxY: 190 };
const PAL_H = { plotX: 160, plotY: 210, plotW: 2040, plotH: 2600, ageMin: 12, ageMax: 216, minY: 60, maxY: 190 };
const OLAF_W = { ...OLAF_H, minY: 10, maxY: 100 };
const PAL_W = { ...PAL_H, minY: 0, maxY: 90 };
const LANDSCAPE = {
  format: 'landscape', width: 1684, height: 2090,
  origins: { height: { x: 120, y: 278 }, weight: { x: 1804, y: 278 } },
  refPlot: { width: 1946, height: 2745.1 }
};
const PAL_COLUMN_H = { ...PAL_H, plotX: 120, plotY: 80, plotW: 1394, plotH: 1900 };

function context() {
  return {
    font: '',
    save() {}, restore() {},
    measureText(text) { return { width: String(text).length * 20 }; }
  };
}

function prepare(chartCreatorData) {
  const win = { advancedGrowthData: structuredClone(MEASUREMENTS) };
  if (chartCreatorData) win.chartCreatorData = structuredClone(chartCreatorData);
  loadBrowserScript('vilda_publication_creator.js', win);
  const PC = win.VildaPublicationCreator;
  const adv = (source) => PC._advForContext(win.advancedGrowthData, source);
  const items = (source, kind = 'height', geom = source === 'olaf' ? OLAF_H : PAL_H) =>
    PC._computeLayout(context(), adv(source), kind, geom);
  return { win, PC, adv, items };
}

function frameData(item, geom) {
  return {
    ageMonths: geom.ageMin + ((item.x + item.w / 2 - geom.plotX) / geom.plotW) * (geom.ageMax - geom.ageMin),
    value: geom.minY + ((geom.plotY + geom.plotH - item.y - item.h / 2) / geom.plotH) * (geom.maxY - geom.minY)
  };
}

function expectData(actual, expected) {
  expect(actual.ageMonths).toBeCloseTo(expected.ageMonths, 6);
  expect(actual.value).toBeCloseTo(expected.value, 6);
}

function registerGeometry(PC, source, kind, geom) {
  PC._setSuppress(true);
  try {
    PC.drawAnnotations(context(), { chartType: kind, ctxId: source, ...geom });
  } finally {
    PC._setSuppress(false);
  }
}

describe('Kreator — wspólne adnotacje OLAF i Palczewskiej', () => {
  it('dodanie na OLAF, edycja na Palczewskiej i usunięcie na OLAF zmienia jeden wpis', () => {
    const { win, PC, adv } = prepare();
    PC._setContext('olaf');
    const id = PC._addFree('height', { ageMonths: 120, value: 140, txt: 'Kontrola', arrow: true });
    expect(PC._collectFree(adv('palRegular'), 'height')).toMatchObject([
      { id, ageMonths: 120, value: 140, comment: 'Kontrola', arrow: true }
    ]);
    PC._setContext('palRegular');
    PC._updateFree('height', id, { txt: 'Kontrola po 3 miesiącach', fs: 52 });
    expect(PC._collectFree(adv('olaf'), 'height')[0]).toMatchObject({ comment: 'Kontrola po 3 miesiącach', fs: 52 });
    PC._setContext('olaf');
    PC._removeFree('height', id);
    expect(PC._collectFree(adv('palRegular'), 'height')).toEqual([]);
    expect(win.chartCreatorData.growth.version).toBe(1);
  });

  it('dodanie na Palczewskiej, edycja na OLAF i usunięcie na Palczewskiej działa także dla masy', () => {
    const { PC, adv } = prepare();
    PC._setContext('palRegular');
    const id = PC._addFree('weight', { ageMonths: 144, value: 41, txt: 'Masa', arrow: false });
    expect(PC._collectFree(adv('olaf'), 'weight')[0]).toMatchObject({ id, value: 41, arrow: false });
    PC._setContext('olaf');
    PC._updateFree('weight', id, { txt: 'Zmiana masy' });
    expect(PC._collectFree(adv('palRegular'), 'weight')[0].comment).toBe('Zmiana masy');
    PC._setContext('palRegular');
    PC._removeFree('weight', id);
    expect(PC._collectFree(adv('olaf'), 'weight')).toEqual([]);
  });

  it('włączenie pomiaru i treść na jednym źródle są dostępne na drugim; nadpisanie dotyczy tego samego rodzaju wykresu', () => {
    const { PC, adv } = prepare();
    PC._setContext('olaf');
    PC._regRoot().shared.a120 = { on: 1, txt: 'Początek obserwacji' };
    PC._updateOverride('height', 'a120', { txt: 'Wzrost', fs: 52, en: 0 });
    expect(PC._collectArrows(adv('palRegular'), 'height')).toEqual([]);
    expect(PC._collectArrows(adv('palRegular'), 'weight')).toMatchObject([
      { key: 'a120', comment: 'Początek obserwacji', value: 32 }
    ]);
    PC._setContext('palRegular');
    PC._updateOverride('height', 'a120', { en: undefined });
    expect(PC._collectArrows(adv('olaf'), 'height')).toMatchObject([
      { key: 'a120', comment: 'Wzrost', fs: 52, value: 140 }
    ]);
    delete PC._regRoot().shared.a120;
    expect(PC._collectArrows(adv('olaf'), 'height')).toEqual([]);
    expect(PC._collectArrows(adv('olaf'), 'weight')).toEqual([]);
  });

  it('WHO, Palczewska niemowlęca i publikacja zachowują własne adnotacje', () => {
    const { win, PC, adv } = prepare();
    for (const source of ['olaf', 'who', 'palInfant', 'pub']) {
      PC._setContext(source);
      PC._addFree('height', { ageMonths: 120, value: 140, txt: source, arrow: false });
    }
    expect(PC._collectFree(adv('palRegular'), 'height').map((it) => it.comment)).toEqual(['olaf']);
    expect(PC._collectFree(adv('who'), 'height').map((it) => it.comment)).toEqual(['who']);
    expect(PC._collectFree(adv('palInfant'), 'height').map((it) => it.comment)).toEqual(['palInfant']);
    expect(PC._collectFree(win.advancedGrowthData, 'height').map((it) => it.comment)).toEqual(['pub']);
  });

  it('wspólne adnotacje nie łączą opcji wyglądu wydruków ani pozycji poziomego PDF', () => {
    const { win, PC, adv } = prepare();
    PC._setContext('olaf');
    PC._setOption('boneAge', false);
    PC._addFree('height', { ageMonths: 120, value: 140, txt: 'Notatka', arrow: false });
    PC._setContext('palRegular');
    PC._setOption('boneAge', true);
    win.chartCreatorData.palRegular.posL = { height: { f1: { dx: 40 } }, weight: {} };
    expect(win.chartCreatorData.olaf.options.boneAge).toBe(false);
    expect(win.chartCreatorData.palRegular.options.boneAge).toBe(true);
    expect(adv('palRegular').pubPosL.height.f1).toEqual({ dx: 40 });
    expect(adv('olaf').pubPosL).toBeNull();
    expect(win.chartCreatorData.growth.options).toBeUndefined();
  });

  it('kotwica oraz środek przesuniętej ramki zachowują wiek i cm przy różnych skalach', () => {
    const { win, PC, items } = prepare();
    PC._setContext('olaf');
    registerGeometry(PC, 'olaf', 'height', OLAF_H);
    const id = PC._addFree('height', { ageMonths: 120, value: 140, txt: 'Kontrola', arrow: true });
    const initial = items('olaf')[0];
    const expected = frameData({ ...initial, x: initial.x + 180, y: initial.y - 75 }, OLAF_H);
    PC._updateFree('height', id, { dx: 180, dy: -75 });
    expectData(win.chartCreatorData.growth.free.height[0].frame, expected);
    const olaf = items('olaf')[0];
    const pal = items('palRegular')[0];
    expectData(frameData(olaf, OLAF_H), expected);
    expectData(frameData(pal, PAL_H), expected);
    expect([pal.ageMonths, pal.value]).toEqual([120, 140]);
    expect(pal.px).not.toBe(olaf.px);
    expect(pal.py).not.toBe(olaf.py);
  });

  it('przesunięcie etykiety masy na Palczewskiej zachowuje dane przy powrocie na OLAF', () => {
    const { PC, items } = prepare();
    PC._setContext('palRegular');
    registerGeometry(PC, 'palRegular', 'weight', PAL_W);
    const id = PC._addFree('weight', { ageMonths: 144, value: 41, txt: 'Masa', arrow: false });
    const original = items('palRegular', 'weight', PAL_W)[0];
    const expected = frameData({ ...original, x: original.x - 102, y: original.y + 260 }, PAL_W);
    PC._updateFree('weight', id, { dx: -102, dy: 260 });
    expectData(frameData(items('olaf', 'weight', OLAF_W)[0], OLAF_W), expected);
    expectData(frameData(items('palRegular', 'weight', PAL_W)[0], PAL_W), expected);
  });

  it('ramka adnotacji pomiarowej ma wspólną pozycję danych po ręcznym przesunięciu', () => {
    const { win, PC, items } = prepare();
    PC._setContext('olaf');
    registerGeometry(PC, 'olaf', 'height', OLAF_H);
    PC._regRoot().shared.a120 = { txt: 'Początek' };
    const initial = items('olaf')[0];
    const expected = frameData({ ...initial, x: initial.x + 90, y: initial.y - 45 }, OLAF_H);
    PC._setOffset('height', 'a120', 90, -45);
    expectData(win.chartCreatorData.growth.layout.height.a120.frame, expected);
    expectData(frameData(items('palRegular')[0], PAL_H), expected);
    expectData(frameData(items('olaf')[0], OLAF_H), expected);
  });

  it('klamra zachowuje końce pomiarowe, wartość poprzeczki oraz pozycję ramki', () => {
    const { win, PC, items } = prepare();
    PC._setContext('olaf');
    registerGeometry(PC, 'olaf', 'height', OLAF_H);
    const id = PC._addFree('height', { br: 1, a1: 120, a2: 144, txt: 'Okres' });
    const original = items('olaf')[0];
    const expectedBar = OLAF_H.minY + ((OLAF_H.plotY + OLAF_H.plotH - original.yb + 30) / OLAF_H.plotH) * (OLAF_H.maxY - OLAF_H.minY);
    PC._updateFree('height', id, { bdy: -30 });
    expect(win.chartCreatorData.growth.free.height[0].bracketValue).toBeCloseTo(expectedBar, 6);
    const afterBar = items('olaf')[0];
    const expectedFrame = frameData({ ...afterBar, x: afterBar.x + 100, y: afterBar.y - 20 }, OLAF_H);
    PC._updateFree('height', id, { dx: 100, dy: -20 });
    const pal = items('palRegular')[0];
    const palBarValue = PAL_H.minY + ((PAL_H.plotY + PAL_H.plotH - pal.yb) / PAL_H.plotH) * (PAL_H.maxY - PAL_H.minY);
    expect(palBarValue).toBeCloseTo(expectedBar, 6);
    expect([pal.a1, pal.a2]).toEqual([120, 144]);
    expectData(frameData(pal, PAL_H), expectedFrame);
  });

  it.each(['poprzeczka', 'ramka'])(
    'pierwsza edycja w poziomie zachowuje pozostałe położenia przeniesione z OLAF: %s', (part) => {
      const { win, PC, items } = prepare();
      PC._setContext('olaf');
      registerGeometry(PC, 'olaf', 'height', OLAF_H);
      const id = PC._addFree('height', { br: 1, a1: 120, a2: 144, txt: 'Okres' });
      items('olaf');
      PC._updateFree('height', id, { bdy: -30 });
      items('olaf');
      PC._updateFree('height', id, { dx: 100, dy: -20 });
      const central = structuredClone(win.chartCreatorData.growth);

      function openLandscape(target) {
        target.PC._setContext('palRegular');
        target.PC._setEditLayout('landscape');
        registerGeometry(target.PC, 'palRegular', 'height', { ...PAL_COLUMN_H, layout: LANDSCAPE, transient: true });
        const geom = target.PC._geomStoreL.height;
        return { geom, before: target.items('palRegular', 'height', geom)[0] };
      }

      const first = openLandscape({ PC, items });
      expect(win.chartCreatorData.palRegular?.posL).toBeUndefined();
      const inherited = {
        dx: first.before.x - first.before.autoX,
        dy: first.before.y - first.before.autoY,
        bdy: first.before.bdy
      };
      // Kontrola: identyczna karta z już zapisanym położeniem odpowiadającym
      // faktycznemu renderowi. Pierwsza edycja ma zachować się tak samo.
      const existing = prepare(JSON.parse(JSON.stringify(win.chartCreatorData)));
      existing.win.chartCreatorData.palRegular = {
        posL: { height: { ['f' + id]: structuredClone(inherited) }, weight: {} }
      };
      const saved = openLandscape(existing);
      expect([saved.before.x, saved.before.y, saved.before.yb]).toEqual([first.before.x, first.before.y, first.before.yb]);
      const patch = part === 'poprzeczka'
        ? { bdy: Math.round(inherited.bdy + 35) }
        : { dx: Math.round(inherited.dx + 80), dy: Math.round(inherited.dy + 30) };
      PC._updateFree('height', id, patch);
      existing.PC._updateFree('height', id, patch);
      const actual = items('palRegular', 'height', first.geom)[0];
      const expected = existing.items('palRegular', 'height', saved.geom)[0];
      expect([actual.x, actual.y, actual.yb]).toEqual([expected.x, expected.y, expected.yb]);
      expect(win.chartCreatorData.palRegular.posL.height['f' + id]).toEqual({ ...inherited, ...patch });
      expect(win.chartCreatorData.growth).toEqual(central);
      if (part === 'poprzeczka') {
        expect(actual.x).toBeCloseTo(first.before.x, 6);
        expect(actual.y - first.before.y).toBeCloseTo(actual.yb - first.before.yb, 6);
      } else {
        expect(actual.yb).toBeCloseTo(first.before.yb, 6);
      }
    }
  );

  it('reset poziomu zeruje własne położenia frame i bracketValue bez starych przesunięć pikselowych', () => {
    const { win, PC, items } = prepare({
      growth: {
        version: 1,
        shared: { a120: { txt: 'Pomiar' } },
        layout: { height: { a120: { frame: { ageMonths: 132, value: 150 } } }, weight: {} },
        free: {
          height: [
            { id: 1, ageMonths: 144, value: 156, txt: 'Ramka', arrow: false, frame: { ageMonths: 156, value: 165 } },
            { id: 2, br: 1, a1: 120, a2: 144, txt: 'Klamra', bracketValue: 175 }
          ],
          weight: []
        }
      },
      palRegular: { posL: { height: { f1: { dx: 75 } }, weight: { f9: { dy: 30 } } } }
    });
    const central = structuredClone(win.chartCreatorData.growth);
    PC._setContext('palRegular');
    PC._setEditLayout('landscape');
    registerGeometry(PC, 'palRegular', 'height', { ...PAL_COLUMN_H, layout: LANDSCAPE, transient: true });
    PC._resetLayout('height');
    expect(win.chartCreatorData.palRegular.posL).toEqual({
      height: { a120: {}, f1: {}, f2: {} },
      weight: { f9: { dy: 30 } }
    });
    expect(win.chartCreatorData.growth).toEqual(central);
    const reset = items('palRegular', 'height', PC._geomStoreL.height);
    for (const item of reset) {
      expect([item.x, item.y]).toEqual([item.autoX, item.autoY]);
      if (item.bracket) expect(item.yb).toBe(item.ybAuto);
    }
  });

  it('JSON zapis i odczyt zachowuje wspólną treść i pozycję bez aliasów obiektów', () => {
    const { win, PC, items } = prepare();
    PC._setContext('olaf');
    registerGeometry(PC, 'olaf', 'height', OLAF_H);
    const id = PC._addFree('height', { ageMonths: 120, value: 140, txt: 'Zapis', arrow: true });
    PC._updateFree('height', id, { dx: 180, dy: -75 });
    const expected = frameData(items('olaf')[0], OLAF_H);
    const restored = prepare(JSON.parse(JSON.stringify(win.chartCreatorData)));
    const pal = restored.items('palRegular')[0];
    expect(pal.comment).toBe('Zapis');
    expectData(frameData(pal, PAL_H), expected);
    restored.PC._setContext('palRegular');
    restored.PC._updateFree('height', id, { txt: 'Po odczycie' });
    expect(restored.items('olaf')[0].comment).toBe('Po odczycie');
    expect(win.chartCreatorData.growth.free.height[0].txt).toBe('Zapis');
  });

  it('adnotacja poza zakresem OLAF jest pomijana w rysowaniu i wraca na Palczewskiej', () => {
    const { win, PC, items } = prepare();
    PC._setContext('palRegular');
    PC._regRoot().shared.a24 = { txt: 'Pomiar 2 lata' };
    PC._addFree('height', { ageMonths: 24, value: 88, txt: 'Wolna 2 lata', arrow: false });
    expect(items('palRegular')).toHaveLength(2);
    expect(items('olaf')).toEqual([]);
    expect(win.chartCreatorData.growth.shared.a24.txt).toBe('Pomiar 2 lata');
    expect(win.chartCreatorData.growth.free.height).toHaveLength(1);
    expect(items('palRegular').map((it) => it.comment)).toEqual(['Pomiar 2 lata', 'Wolna 2 lata']);
  });
});

describe('Kreator — migracja dotychczasowych adnotacji bez utraty treści', () => {
  it('zachowuje oba wolne wpisy z tym samym ID, pozycje poziome Palczewskiej oraz opcje źródeł', () => {
    const { win, PC, adv } = prepare({
      palRegular: {
        options: { boneAge: true },
        shared: {}, layout: { height: {}, weight: {} },
        free: { height: [{ id: 1, ageMonths: 120, value: 140, txt: 'Pal-notka', arrow: false }], weight: [] },
        posL: { height: { f1: { dx: 40, dy: 20 } }, weight: {} }
      },
      olaf: {
        options: { boneAge: false },
        shared: {}, layout: { height: {}, weight: {} },
        free: { height: [{ id: 1, ageMonths: 144, value: 156, txt: 'OLAF-notka', arrow: true }], weight: [] }
      }
    });
    const migrated = PC._growthRoot();
    expect(migrated.version).toBe(1);
    expect(migrated.free.height).toHaveLength(2);
    expect(new Set(migrated.free.height.map((it) => it.id)).size).toBe(2);
    const pal = migrated.free.height.find((it) => it.txt === 'Pal-notka');
    const olaf = migrated.free.height.find((it) => it.txt === 'OLAF-notka');
    expect(pal).toMatchObject({ ageMonths: 120, value: 140, arrow: false });
    expect(olaf).toMatchObject({ ageMonths: 144, value: 156, arrow: true });
    expect(win.chartCreatorData.palRegular.posL.height['f' + pal.id]).toEqual({ dx: 40, dy: 20 });
    expect(win.chartCreatorData.palRegular.posL.height['f' + olaf.id]).toBeUndefined();
    expect(win.chartCreatorData.palRegular.options).toEqual({ boneAge: true });
    expect(win.chartCreatorData.olaf.options).toEqual({ boneAge: false });
    for (const source of ['olaf', 'palRegular']) {
      expect(win.chartCreatorData[source].free).toBeUndefined();
      expect(win.chartCreatorData[source].layout).toBeUndefined();
      expect(win.chartCreatorData[source].shared).toBeUndefined();
    }
    const saved = JSON.stringify(win.chartCreatorData);
    PC._growthRoot();
    adv('olaf');
    adv('palRegular');
    expect(JSON.stringify(win.chartCreatorData)).toBe(saved);
  });

  it('różne komentarze tego samego pomiaru zachowuje jako bazowy i powiązaną alternatywę', () => {
    const { PC, adv, win } = prepare({
      palRegular: { shared: { a120: { txt: 'Komentarz Pal' } } },
      olaf: { shared: { a120: { txt: 'Komentarz OLAF' } } }
    });
    PC._growthRoot();
    for (const source of ['olaf', 'palRegular']) {
      expect(PC._collectArrows(adv(source), 'height')).toMatchObject([
        { key: 'a120', comment: 'Komentarz Pal', ageMonths: 120, value: 140 }
      ]);
      expect(PC._collectFree(adv(source), 'height')).toMatchObject([
        { comment: 'Komentarz OLAF', ageMonths: 120, value: 140, arrow: true }
      ]);
      expect(PC._collectFree(adv(source), 'weight')).toMatchObject([
        { comment: 'Komentarz OLAF', ageMonths: 120, value: 32, arrow: true }
      ]);
    }
    expect(win.chartCreatorData.growth.free.height[0].pointKey).toBe('a120');
    win.advancedGrowthData.measurements.find((it) => it.ageMonths === 120).height = 142;
    expect(PC._collectFree(adv('olaf'), 'height')[0].value).toBe(142);
  });

  it('identyczne komentarze pomiaru z obu źródeł nie tworzą podwójnych strzałek', () => {
    const { PC, adv } = prepare({
      palRegular: { shared: { a120: { on: 1, txt: 'Ten sam komentarz' } } },
      olaf: { shared: { a120: { on: 1, txt: 'Ten sam komentarz' } } }
    });
    PC._growthRoot();
    expect(PC._collectArrows(adv('olaf'), 'height')).toHaveLength(1);
    expect(PC._collectFree(adv('olaf'), 'height')).toEqual([]);
    expect(PC._collectArrows(adv('palRegular'), 'weight')).toHaveLength(1);
    expect(PC._collectFree(adv('palRegular'), 'weight')).toEqual([]);
  });

  it.each([-80, 80])('ręczne układy obu źródeł zachowuje również dla tego samego tekstu i pikseli: OLAF dx=%s', (olafDx) => {
    const { PC, adv } = prepare({
      palRegular: {
        shared: { a120: { txt: 'Kontrola' } },
        layout: { height: { a120: { dx: 80, dy: -40 } }, weight: {} }
      },
      olaf: {
        shared: { a120: { txt: 'Kontrola' } },
        layout: { height: { a120: { dx: olafDx, dy: -40 } }, weight: {} }
      }
    });
    PC._growthRoot();
    expect(PC._collectArrows(adv('olaf'), 'height')).toMatchObject([{ key: 'a120', comment: 'Kontrola' }]);
    expect(PC._collectFree(adv('palRegular'), 'height')).toMatchObject([{ comment: 'Kontrola', dx: olafDx, dy: -40 }]);
    expect(PC._collectFree(adv('palRegular'), 'weight')).toEqual([]);
    registerGeometry(PC, 'olaf', 'height', OLAF_H);
    registerGeometry(PC, 'palRegular', 'height', PAL_H);
    const layout = PC._computeLayout(context(), adv('palRegular'), 'height', PAL_H);
    expect(layout).toHaveLength(2);
    expect([layout[0].x, layout[0].y]).not.toEqual([layout[1].x, layout[1].y]);
  });

  it('ukrycie alternatywy na wzroście nie gubi jej komentarza na masie', () => {
    const { PC, adv } = prepare({
      palRegular: { shared: { a120: { txt: 'Bazowy' } } },
      olaf: {
        shared: { a120: { txt: 'Alternatywa' } },
        layout: { height: { a120: { en: 0 } }, weight: { a120: { txt: 'Alternatywa masy', fs: 52 } } }
      }
    });
    PC._growthRoot();
    expect(PC._collectFree(adv('olaf'), 'height')).toEqual([]);
    expect(PC._collectFree(adv('palRegular'), 'weight')).toMatchObject([
      { comment: 'Alternatywa masy', fs: 52, ageMonths: 120, value: 32 }
    ]);
  });

  it('konflikt komentarzy przeżywa migrację bez dostępnego pomiaru i wraca po odtworzeniu danych', () => {
    const { win, PC, adv } = prepare({
      palRegular: { shared: { a120: { txt: 'Bazowy' } } },
      olaf: { shared: { a120: { txt: 'Alternatywa' } } }
    });
    win.advancedGrowthData.measurements = [];
    PC._growthRoot();
    expect(PC._collectFree(adv('olaf'), 'height')).toEqual([]);
    expect(win.chartCreatorData.growth.free.height).toMatchObject([{ pointKey: 'a120', txt: 'Alternatywa' }]);
    win.advancedGrowthData.measurements = [{ ageMonths: 120, height: 140, weight: 32 }];
    expect(PC._collectFree(adv('palRegular'), 'height')).toMatchObject([{ comment: 'Alternatywa', value: 140 }]);
  });

  it('stare pikselowe pozycje przelicza przez geometrię ich źródła, a później zachowuje dane na drugiej siatce', () => {
    const legacy = {
      olaf: {
        shared: { a120: { txt: 'Pomiar' } },
        layout: { height: { a120: { dx: 90, dy: -45 } }, weight: {} },
        free: { height: [{ id: 1, ageMonths: 144, value: 156, txt: 'Etykieta', arrow: false, dx: 100, dy: -20 }], weight: [] }
      }
    };
    const { PC, items } = prepare(legacy);
    const before = PC._computeLayout(context(), {
      ...structuredClone(MEASUREMENTS), __ctxRegular: true,
      pubLayout: structuredClone(legacy.olaf.layout), pubFree: structuredClone(legacy.olaf.free), pubShared: structuredClone(legacy.olaf.shared)
    }, 'height', OLAF_H);
    const expectedMeasurement = frameData(before.find((it) => it.key === 'a120'), OLAF_H);
    const expectedLabel = frameData(before.find((it) => it.kind === 'free'), OLAF_H);
    PC._growthRoot();
    registerGeometry(PC, 'olaf', 'height', OLAF_H);
    registerGeometry(PC, 'palRegular', 'height', PAL_H);
    const pal = items('palRegular');
    expectData(frameData(pal.find((it) => it.key === 'a120'), PAL_H), expectedMeasurement);
    expectData(frameData(pal.find((it) => it.comment === 'Etykieta'), PAL_H), expectedLabel);
    const olaf = items('olaf');
    expectData(frameData(olaf.find((it) => it.key === 'a120'), OLAF_H), expectedMeasurement);
    expectData(frameData(olaf.find((it) => it.comment === 'Etykieta'), OLAF_H), expectedLabel);
  });

  it.each(['nowy zapis pacjenta', 'zmiana pomiarów tej samej karty'])(
    'nie migruje położeń przez geometrię poprzednich danych: %s', (change) => {
      const legacy = {
        olaf: {
          free: { height: [{ id: 1, ageMonths: 144, value: 156, txt: 'Stara ramka', arrow: false, dx: 100, dy: -20 }], weight: [] }
        }
      };
      const { win, PC, items } = prepare(legacy);
      registerGeometry(PC, 'olaf', 'height', OLAF_H);
      if (change === 'nowy zapis pacjenta') win.chartCreatorData = structuredClone(legacy);
      win.advancedGrowthData = { ...structuredClone(MEASUREMENTS), currentHeight: 180 };
      const updatedSource = { ...OLAF_H, minY: 50, maxY: 210, plotH: 1200 };
      const original = PC._computeLayout(context(), {
        ...win.advancedGrowthData,
        pubFree: structuredClone(legacy.olaf.free)
      }, 'height', updatedSource)[0];
      const expected = frameData(original, updatedSource);
      items('palRegular');
      // Bez geometrii źródła dla nowych danych nie wolno utrwalić błędnego frame.
      // Węzłowy test nie ma DOM, więc czeka na jej rejestrację przez generator.
      expect(win.chartCreatorData.growth.free.height[0].frame).toBeUndefined();
      expect(win.chartCreatorData.growth.free.height[0].legacyPos).toEqual({ context: 'olaf', key: 'f1' });
      registerGeometry(PC, 'olaf', 'height', updatedSource);
      expectData(frameData(items('palRegular')[0], PAL_H), expected);
    }
  );
});
