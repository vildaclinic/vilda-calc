import { expect, test } from '../support/test-czas.mjs';
import { fictionalPatient, loadPatient, readyForPatient } from '../support/centile-live-fixture.mjs';
import { zemelPatient as patient } from '../support/zemel-creator.mjs';
import { kreator, kliknijDane, zapiszKomentarz, magazynWspolny, przesunRamke, nagrywajAdnotacje,
  tekstyPodgladu, tekstyEksportu, wyczyscNagranie, generujZKreatora } from '../support/kreator-wspolne-adnotacje.mjs';
import { wygenerujPdf, orientacja } from '../support/siatka-poziomo.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);

test('Zemel: adnotacje, ręczne położenie, PDF oraz rzeczywisty zapis pacjenta i F5', async ({ page }) => {
  await patient(page);
  await nagrywajAdnotacje(page);
  await page.locator('#openChartCreatorBtn').click();
  await expect(kreator(page)).toHaveAttribute('aria-label', /zespół Downa · Zemel 2015/);
  await expect(kreator(page).locator('[data-opt="mph"]')).toHaveCount(0);
  await expect(kreator(page).locator('[data-opt="parentsHeader"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.VildaPublicationCreator._geomStore.height)).toMatchObject({ source: 'DS', ageMin: 0, ageMax: 240 });

  await kliknijDane(page, 'height', 108, 123);
  await zapiszKomentarz(page, 'E2E-POMIAR');
  expect((await magazynWspolny(page)).shared.a108.txt).toBe('E2E-POMIAR');
  await kreator(page).getByRole('button', { name: '+ Klamra', exact: true }).click();
  await kliknijDane(page, 'height', 84, 110);
  await kliknijDane(page, 'height', 108, 123);
  await zapiszKomentarz(page, 'E2E-KLAMRA');
  expect((await magazynWspolny(page)).free.height.some(item => item.br && item.txt === 'E2E-KLAMRA')).toBe(true);

  await kreator(page).getByRole('button', { name: '+ Etykieta', exact: true }).click();
  await kliknijDane(page, 'height', 144, 130);
  await zapiszKomentarz(page, 'E2E-ZEMEL');
  const entry = (await magazynWspolny(page)).free.height.find(item => item.txt === 'E2E-ZEMEL');
  expect(entry).toMatchObject({ ageMonths: expect.any(Number), value: expect.any(Number), arrow: false });
  await przesunRamke(page, 'olaf', 'height', `f${entry.id}`);
  const stored = await magazynWspolny(page);
  expect(stored.free.height.find(item => item.id === entry.id).frame).toEqual({ ageMonths: expect.any(Number), value: expect.any(Number) });
  await wyczyscNagranie(page);
  const preview = await tekstyPodgladu(page);
  await page.screenshot({ path: test.info().outputPath('zemel-kreator-desktop-po.png') });
  await wyczyscNagranie(page);
  expect((await wygenerujPdf(page, generujZKreatora)).map(orientacja)).toEqual(['pion']);
  expect(await tekstyEksportu(page)).toEqual(preview);
  expect(await magazynWspolny(page)).toEqual(stored);
  await kreator(page).getByRole('button', { name: 'Zamknij kreator' }).click();
  await page.locator('#saveDataBtnSidebar').click();
  await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().state)).toBe('saved');
  await page.reload({ waitUntil: 'load' });
  await readyForPatient(page);
  await page.locator('#openChartCreatorBtn').click();
  await expect(kreator(page)).toHaveAttribute('aria-label', /Zemel 2015/);
  expect(await magazynWspolny(page)).toEqual(stored);
  await expect(kreator(page)).toContainText('E2E-ZEMEL');
});

test('rzeczywisty checkbox DS wybiera Zemel, a po wyłączeniu przywraca Palczewską i wspólną adnotację', async ({ page }) => {
  const id = await patient(page, { source: 'PALCZEWSKA', ds: false });
  await page.evaluate(id => window.VildaAuthUI.showPatientEditScreen(id), id);
  await page.locator('#vePatientDownSyndrome').check();
  await page.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.VildaPopulacjaPacjenta())).toBe('DS');
  await page.locator('#openChartCreatorBtn').click();
  await expect(kreator(page)).toHaveAttribute('aria-label', /Zemel 2015/);
  await kreator(page).getByRole('button', { name: '+ Strzałka', exact: true }).click();
  await kliknijDane(page, 'height', 108, 123);
  await zapiszKomentarz(page, 'E2E-STRZ');
  const annotations = await magazynWspolny(page);
  await kreator(page).getByRole('button', { name: 'Zamknij kreator' }).click();
  await page.evaluate(id => window.VildaAuthUI.showPatientEditScreen(id), id);
  await page.locator('#vePatientDownSyndrome').uncheck();
  await page.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.VildaPopulacjaPacjenta())).toBe('OGOLNA');
  await page.locator('#openChartCreatorBtn').click();
  await expect(kreator(page)).toHaveAttribute('aria-label', /Palczewska/);
  expect(await magazynWspolny(page)).toEqual(annotations);
  await expect(kreator(page)).toContainText('E2E-STRZ');
});

for (const age of [1, 19, 20]) {
  test(`Zemel: rzeczywisty przycisk otwiera siatkę DS dla wieku ${age} lat`, async ({ page }) => {
    await patient(page, { age });
    await expect(page.locator('#openChartCreatorBtn')).toBeVisible();
    await page.locator('#openChartCreatorBtn').click();
    await expect(kreator(page)).toHaveAttribute('aria-label', /Zemel 2015/);
    expect(await page.evaluate(() => window.VildaPublicationCreator._geomStore.height)).toMatchObject({ ageMin: 0, ageMax: 240, source: 'DS' });
  });
}

test('zmiana pacjenta porzuca niedokończoną etykietę DS bez zmiany adnotacji kolejnej osoby', async ({ page }) => {
  await patient(page);
  await page.locator('#openChartCreatorBtn').click();
  await kreator(page).getByRole('button', { name: '+ Etykieta', exact: true }).click();
  await kliknijDane(page, 'height', 144, 130);
  await expect(page.getByLabel('Treść komentarza')).toBeVisible();
  const fresh = (await magazynWspolny(page)).free.height.at(-1);
  const other = fictionalPatient({ firstName: 'InnaOsoba', note: 'E2E-INNY' });
  other.chartCreator.growth.free.height[0].id = fresh.id;
  const id = await page.evaluate(async record => (await window.VildaVault.savePatient(record, { dedup: false })).patientId, other);
  await loadPatient(page, id, 'restore');
  await expect(kreator(page)).toHaveCount(0);
  expect((await magazynWspolny(page)).free.height).toEqual(other.chartCreator.growth.free.height);
  expect(await page.evaluate(async id => (await window.VildaVault.getPatient(id)).snapshots[0].payload.chartCreator.growth.free.height, id))
    .toEqual(other.chartCreator.growth.free.height);
});

test('poza 240 miesiącami DS nie przechodzi do zastępczej siatki populacji ogólnej', async ({ page }) => {
  await patient(page, { age: 20 });
  await page.locator('#ageMonths').fill('1');
  await page.locator('#ageMonths').blur();
  await expect(page.locator('#openChartCreatorBtn')).toBeHidden();
  const messages = [];
  page.once('dialog', async dialog => { messages.push(dialog.message()); await dialog.dismiss(); });
  await page.evaluate(() => window.VildaPublicationCreator.open({ context: 'olaf' }));
  expect(messages).toEqual([expect.stringContaining('0–20 lat')]);
  await expect(kreator(page)).toHaveCount(0);
});
