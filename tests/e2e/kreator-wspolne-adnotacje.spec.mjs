import { expect, test } from '@playwright/test';
import { czekajNaGenerator, czekajNaOdblokowanie, orientacja, palczewskaPro, wygenerujPdf } from '../support/siatka-poziomo.mjs';
import {
  generujZKreatora, kliknijDane, kreator, magazynWspolny, nagrywajAdnotacje,
  odtworzJson, otworzZrodlo, przeciagnij, przygotujKreator, przesunRamke,
  punktWidoczny, sprawdzRamkeWDanych, stanUkladu, tekstyEksportu,
  tekstyPodgladu, ustawDaneKreatora, wyczyscNagranie, zapiszKomentarz,
} from '../support/kreator-wspolne-adnotacje.mjs';

test.use({ serviceWorkers: 'block' });

test('OLAF ↔ Palczewska: komentarz, strzałka, etykieta i klamra zachowują kotwice i ręczne położenia po JSON', async ({ page }) => {
  test.setTimeout(180_000);
  await przygotujKreator(page);
  await otworzZrodlo(page, 'OLAF');

  await kliknijDane(page, 'height', 120, 141);
  await zapiszKomentarz(page, 'E2E-pomiar');
  await przesunRamke(page, 'olaf', 'height', 'cur');

  await kreator(page).getByRole('button', { name: '+ Strzałka', exact: true }).click();
  await kliknijDane(page, 'height', 156, 150);
  await zapiszKomentarz(page, 'E2E-strz');
  let store = await magazynWspolny(page);
  const arrow = store.free.height.find((f) => f.txt === 'E2E-strz');
  await przesunRamke(page, 'olaf', 'height', `f${arrow.id}`);

  await kreator(page).getByRole('button', { name: '+ Etykieta', exact: true }).click();
  await kliknijDane(page, 'height', 72, 145);
  await zapiszKomentarz(page, 'E2E-tekst');
  store = await magazynWspolny(page);
  const label = store.free.height.find((f) => f.txt === 'E2E-tekst');
  await przesunRamke(page, 'olaf', 'height', `f${label.id}`);

  await kreator(page).getByRole('button', { name: '+ Klamra', exact: true }).click();
  await kliknijDane(page, 'height', 84, 123.6);
  await kliknijDane(page, 'height', 120, 141);
  await zapiszKomentarz(page, 'E2E-klamra');
  store = await magazynWspolny(page);
  const bracket = store.free.height.find((f) => f.br);
  const beforeBar = (await stanUkladu(page, 'olaf', 'height', `f${bracket.id}`)).item;
  await przeciagnij(page, { x: (beforeBar.x1 + beforeBar.x2) / 2, y: beforeBar.yb }, 0, 25);

  store = await magazynWspolny(page);
  expect(store.version).toBe(1);
  expect(store.shared.cur.txt).toBe('E2E-pomiar');
  expect(store.layout.height.cur.frame).toEqual({ ageMonths: expect.any(Number), value: expect.any(Number) });
  for (const id of [arrow.id, label.id]) {
    expect(store.free.height.find((f) => f.id === id).frame).toEqual({ ageMonths: expect.any(Number), value: expect.any(Number) });
  }
  expect(store.free.height.find((f) => f.id === bracket.id).bracketValue).toEqual(expect.any(Number));
  const olaf = await stanUkladu(page, 'olaf', 'height', 'cur');
  const initialStore = store;
  await page.screenshot({ path: test.info().outputPath('wspolne-adnotacje-olaf.png') });

  await odtworzJson(page);
  await otworzZrodlo(page, 'PALCZEWSKA');
  await expect(kreator(page)).toContainText('E2E-pomiar');
  await expect(kreator(page)).toContainText('E2E-strz');
  await expect(kreator(page)).toContainText('E2E-tekst');
  await expect(kreator(page)).toContainText('E2E-klamra');
  expect(await magazynWspolny(page), 'zmiana populacji nie kopiuje ani nie zmienia danych adnotacji').toEqual(initialStore);
  const pal = await stanUkladu(page, 'palRegular', 'height', 'cur');
  expect(olaf.geom.ageMin).toBe(36);
  expect(pal.geom.ageMin ?? 12).toBe(12);
  expect(pal.geom.plotH).not.toBe(olaf.geom.plotH);
  expect([pal.item.ageMonths, pal.item.value]).toEqual([120, 141]);
  await sprawdzRamkeWDanych(page, 'palRegular', 'height', 'cur', store.layout.height.cur.frame);
  for (const id of [arrow.id, label.id]) {
    const free = store.free.height.find((f) => f.id === id);
    const mapped = await sprawdzRamkeWDanych(page, 'palRegular', 'height', `f${id}`, free.frame);
    expect([mapped.ageMonths, mapped.value]).toEqual([free.ageMonths, free.value]);
  }
  const palBracket = (await stanUkladu(page, 'palRegular', 'height', `f${bracket.id}`)).item;
  expect([palBracket.a1, palBracket.a2]).toEqual([84, 120]);
  await punktWidoczny(page, { x: pal.item.px, y: pal.item.py });
  await page.screenshot({ path: test.info().outputPath('wspolne-adnotacje-palczewska.png') });

  // Edycja w drugim źródle zmienia ten sam obiekt; powrót nie przywraca starej kopii.
  const labelPal = (await stanUkladu(page, 'palRegular', 'height', `f${label.id}`)).item;
  const screen = await punktWidoczny(page, { x: labelPal.x + labelPal.w / 2, y: labelPal.y + labelPal.h / 2 });
  await page.mouse.click(screen.x, screen.y);
  await zapiszKomentarz(page, 'E2E-zmiana');
  await przesunRamke(page, 'palRegular', 'height', `f${label.id}`);
  const edited = await magazynWspolny(page);
  await odtworzJson(page);
  await otworzZrodlo(page, 'OLAF');
  await expect(kreator(page)).toContainText('E2E-zmiana');
  expect((await magazynWspolny(page)).free.height).toHaveLength(3);
  await sprawdzRamkeWDanych(page, 'olaf', 'height', `f${label.id}`, edited.free.height.find((f) => f.id === label.id).frame);
  expect((await magazynWspolny(page)).free.height.find((f) => f.id === bracket.id).bracketValue)
    .toBe(initialStore.free.height.find((f) => f.id === bracket.id).bracketValue);
});

test('stary zapis OLAF migruje raz, a adnotacje podglądu obu źródeł trafiają w te same miejsca na PDF', async ({ page }) => {
  test.setTimeout(180_000);
  await przygotujKreator(page, { legacy: true });
  await nagrywajAdnotacje(page);
  await otworzZrodlo(page, 'OLAF');
  let store = await magazynWspolny(page);
  expect(store.version).toBe(1);
  expect(store.shared.cur.txt).toBe('E2E-legacy');
  expect(store.free.height).toHaveLength(1);
  expect(store.free.height[0]).toMatchObject({ ageMonths: 168, value: 160, txt: 'E2E-stary', arrow: false });

  const olafPreview = await tekstyPodgladu(page);
  expect(olafPreview).toHaveLength(3); // komentarz na obu wykresach i etykieta wzrostu
  await wyczyscNagranie(page);
  expect((await wygenerujPdf(page, generujZKreatora)).map(orientacja)).toEqual(['pion']);
  expect(await tekstyEksportu(page)).toEqual(olafPreview);

  await odtworzJson(page);
  await wyczyscNagranie(page);
  await otworzZrodlo(page, 'PALCZEWSKA');
  const palPreview = await tekstyPodgladu(page);
  expect(palPreview).toHaveLength(3);
  await wyczyscNagranie(page);
  expect((await wygenerujPdf(page, generujZKreatora)).map(orientacja)).toEqual(['pion', 'pion']);
  expect(await tekstyEksportu(page)).toEqual(palPreview);
  store = await magazynWspolny(page);
  expect(store.free.height, 'migracja i ponowne otwarcie nie duplikują starych etykiet').toHaveLength(1);
  await odtworzJson(page);
  await otworzZrodlo(page, 'OLAF');
  expect((await magazynWspolny(page)).free.height).toHaveLength(1);
});

test('pierwsze otwarcie Palczewskiej po reloadzie odtwarza pikselowy układ OLAF według geometrii źródła', async ({ page }) => {
  test.setTimeout(180_000);
  await przygotujKreator(page, { legacy: true });

  // Niezależny wzorzec starego zapisu: prawdziwy generator OLAF i oryginalny
  // wrapper układu, bez __sharedGrowth i bez nowej migracji pozycji.
  const original = await page.evaluate(() => {
    const pc = window.VildaPublicationCreator;
    const legacy = JSON.parse(JSON.stringify(window.chartCreatorData.olaf));
    pc._setSuppress(true);
    try {
      window.buildCentilePageCanvas({
        rangeMinX: 36, rangeMaxX: 216, sex: 'M', userAgeMonths: 120,
        userWeight: 33, userHeight: 141, chartSource: 'OLAF',
        headerTitle: 'Siatka centylowa chłopcy', headerSubtitle: 'Badanie OLAF (3–18 lat)', footerText: '',
      });
    } finally {
      pc._setSuppress(false);
    }
    const adv = Object.create(window.advancedGrowthData);
    adv.__ctxRegular = true;
    adv.pubLayout = legacy.layout;
    adv.pubFree = legacy.free;
    adv.pubShared = legacy.shared;
    const geom = JSON.parse(JSON.stringify(pc._geomStore.height));
    const items = pc._computeLayout(document.createElement('canvas').getContext('2d'), adv, 'height', geom);
    return {
      geom,
      centers: Object.fromEntries(items.map((it) => [it.key, { x: it.x + it.w / 2, y: it.y + it.h / 2 }])),
    };
  });
  expect(Object.keys(original.centers).sort()).toEqual(['cur', 'f10']);

  // Reload usuwa cache geometrii i stan zamknięcia modułu; Palczewska jest
  // pierwszą siatką otwieraną z ponownie ustawionym historycznym zapisem.
  await page.reload({ waitUntil: 'load' });
  await czekajNaOdblokowanie(page);
  await czekajNaGenerator(page);
  await palczewskaPro(page);
  await ustawDaneKreatora(page, { legacy: true });
  await page.evaluate(() => {
    window.chartCreatorData.olaf.options = { summary: true };
    window.chartCreatorData.palRegular = { options: { summary: false } };
  });
  expect(await page.evaluate(() => window.VildaPublicationCreator._geomByContext.olaf)).toBeUndefined();
  await nagrywajAdnotacje(page);
  await otworzZrodlo(page, 'PALCZEWSKA');

  const state = await page.evaluate((original) => {
    const pc = window.VildaPublicationCreator;
    const growth = window.chartCreatorData.growth;
    const entries = { cur: growth.layout.height.cur, f10: growth.free.height.find((f) => f.id === 10) };
    const ctx = document.createElement('canvas').getContext('2d');
    const centers = {};
    for (const [key, entry] of Object.entries(entries)) {
      // Rzutujemy zapisaną kotwicę ramki na oryginalne osie funkcją produkcyjną.
      // Równość do dawnych pikseli dowodzi zachowania położenia w danych bez
      // powielania formuły transformacji w teście.
      const probe = pc._computeLayout(ctx, {
        measurements: [], pubLayout: {},
        pubFree: { height: [{ id: 'probe', ...entry.frame, arrow: false }] },
      }, 'height', original.geom)[0];
      centers[key] = { x: probe.px, y: probe.py };
    }
    return {
      centers,
      sourceGeom: pc._geomByContext.olaf?.height,
      activeGeom: pc._geomStore.height,
      targetGeom: pc._geomByContext.palRegular?.height,
      geometryContexts: Object.keys(pc._geomByContext),
      targetSummary: pc.isElementEnabled('summary'),
      sourceSummary: window.chartCreatorData.olaf.options.summary,
      frames: Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value.frame])),
    };
  }, original);
  expect(state.activeGeom, 'wewnętrzny render źródła nie zastępuje geometrii Palczewskiej').toEqual(state.targetGeom);
  expect(state.activeGeom.ageMin ?? 12).toBe(12);
  expect(state.targetSummary, 'po wewnętrznym renderze nadal obowiązują opcje Palczewskiej').toBe(false);
  expect(state.sourceSummary).toBe(true);
  for (const key of ['cur', 'f10']) {
    expect(state.centers[key].x).toBeCloseTo(original.centers[key].x, 5);
    expect(state.centers[key].y).toBeCloseTo(original.centers[key].y, 5);
    await sprawdzRamkeWDanych(page, 'palRegular', 'height', key, state.frames[key]);
  }
  const preview = await tekstyPodgladu(page);
  expect(preview).toHaveLength(3);
  await wyczyscNagranie(page);
  expect((await wygenerujPdf(page, generujZKreatora)).map(orientacja)).toEqual(['pion', 'pion']);
  expect(await tekstyEksportu(page)).toEqual(preview);
  expect(state.sourceGeom, `geometria OLAF zbudowana na żądanie; cache: ${state.geometryContexts}`).toBeTruthy();
  expect(state.sourceGeom.ageMin).toBe(36);
  expect(state.targetGeom, `render na żądanie zachowuje cache docelowej geometrii; cache: ${state.geometryContexts}`).toBeTruthy();
});

test('bez sieci po załadowaniu aplikacji: zmiana OLAF na Palczewską zachowuje adnotację i generuje PDF', async ({ page, context }) => {
  test.setTimeout(150_000);
  await przygotujKreator(page);
  await otworzZrodlo(page, 'OLAF');
  await kreator(page).getByRole('button', { name: '+ Etykieta', exact: true }).click();
  await kliknijDane(page, 'height', 156, 150);
  await zapiszKomentarz(page, 'E2E-offline');
  await page.evaluate(() => window.vildaEnsurePdfLibraries());
  const before = await magazynWspolny(page);
  await context.setOffline(true);
  try {
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    expect(await page.evaluate(() => fetch(`/README.md?brak-sieci=${Date.now()}`).then(() => false, () => true))).toBe(true);
    await odtworzJson(page);
    await otworzZrodlo(page, 'PALCZEWSKA');
    await expect(kreator(page)).toContainText('E2E-offline');
    expect(await magazynWspolny(page)).toEqual(before);
    expect((await wygenerujPdf(page, generujZKreatora)).map(orientacja)).toEqual(['pion', 'pion']);
  } finally {
    await context.setOffline(false);
  }
});
