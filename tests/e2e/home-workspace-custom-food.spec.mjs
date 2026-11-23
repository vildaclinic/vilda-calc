import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { choosePatient, prepareGabinet } from '../support/gabinet-patient-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

test('przelicza posiłek w podglądzie bez zastosowania go w zapisanej wizycie', async ({ page }) => {
  const { frame, ids } = await prepareGabinet(page);
  await choosePatient(frame, 'Antoni');
  await frame.getByRole('tab', { name: 'Analiza', exact: true }).click();
  await frame.locator('#vhomeOtherToolsToggle').click();
  const persisted = () => frame.evaluate(async id => ({
    foods: VildaPersistence.readMainSession()?.foods ?? null,
    snapshots: (await VildaVault.getPatient(id)).snapshots,
    nativeRows: document.querySelector('#foodList')?.childElementCount,
  }), ids.a);
  const before = await persisted();

  await frame.locator('[data-home-tool="food"]').click();
  const dialog = frame.locator('#vhomeToolDialog');
  const draft = dialog.frameLocator('iframe[data-home-tool-draft]');
  await expect(draft.getByText('Obliczenie robocze. Wynik dostępny w tym oknie.')).toBeVisible();
  await expect(dialog.locator('.vhome-dialog-apply')).toBeDisabled();
  await expect(dialog.locator('.vhome-dialog-apply')).toBeHidden();
  const editor = draft.locator('.vhome-tool-food-manual');
  await editor.getByText('Dodaj własny produkt', { exact: true }).click();
  await editor.getByRole('textbox', { name: 'Produkt', exact: true }).fill('Fikcyjny jogurt');
  await editor.getByRole('spinbutton', { name: 'Porcja · g', exact: true }).fill('75');
  await editor.getByRole('spinbutton', { name: 'Energia · kcal/100 g' }).fill('160');
  await editor.getByRole('button', { name: 'Dodaj własny produkt do posiłku' }).click();
  await expect(draft.locator('.vhome-tool-food-total')).toContainText(/120\s*kcal/);
  await dialog.locator('.vhome-dialog-cancel').click();
  await expect(dialog).toBeHidden();
  expect(await persisted()).toEqual(before);
});

test('własne produkty zachowują dane z etykiety po zastosowaniu i odtworzeniu wizyty', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true; });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  const fixture = await createFictionalVault(page, { shell: true, waitForAccountReadyBeforeReload: true });
  let frame = fixture.frame;
  await loadPatient(frame, fixture.ids.a, 'restore');
  await readyForPatient(frame);

  async function openFood() {
    const toggle = frame.locator('#vhomeOtherToolsToggle');
    if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
    await frame.locator('[data-home-tool="food"]').click();
    const dialog = frame.locator('#vhomeToolDialog');
    await expect(dialog).toBeVisible();
    return { dialog, draft: dialog.frameLocator('iframe[data-home-tool-draft]') };
  }

  async function draftManualFood(draft, name, grams, kcal) {
    const editor = draft.locator('.vhome-tool-food-manual');
    if (await editor.getAttribute('open') === null) await editor.getByText('Dodaj własny produkt', { exact: true }).click();
    await editor.getByRole('textbox', { name: 'Produkt', exact: true }).fill(name);
    await editor.getByRole('spinbutton', { name: 'Porcja · g', exact: true }).fill(grams);
    await editor.getByRole('spinbutton', { name: 'Energia · kcal/100 g' }).fill(kcal);
    await editor.getByRole('button', { name: 'Dodaj własny produkt do posiłku' }).click();
  }

  const patientFood = () => frame.evaluate(() => VildaPersistence.readMainSession()?.foods ?? { snacks: [], meals: [] });
  const liveRows = () => frame.evaluate(() => Array.from(document.querySelectorAll('#foodList > .food-row'), row => {
    const custom = VildaMacroPractice.readCustomFoodRow(row);
    return custom ? { kind: 'custom', ...custom } : { kind: 'catalogue', key: row.querySelector('select').value };
  }));
  const label = 'Fikcyjny jogurt & owoce <bez cukru>';

  let { dialog, draft } = await openFood();
  await draftManualFood(draft, label, '75', '160');
  await expect(draft.locator('.vhome-tool-food-total')).toContainText(/120\s*kcal/);
  await expect(draft.getByText(label, { exact: true })).toBeVisible();
  expect(await liveRows()).toEqual([]);
  expect((await patientFood()).custom).toBeUndefined();
  page.once('dialog', confirmation => confirmation.accept());
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await liveRows()).toEqual([]);

  ({ dialog, draft } = await openFood());
  await draftManualFood(draft, label, '125.5', '120');
  const picker = draft.locator('.vhome-tool-food-picker');
  await picker.getByRole('searchbox').fill('snickers');
  await picker.getByRole('button', { name: 'Dodaj do posiłku', exact: true }).click();
  await draftManualFood(draft, 'Fikcyjna woda', '80', '0');
  await expect(draft.locator('.vhome-tool-food-total')).toContainText(/395\s*kcal/);
  await expect(draft.locator('.vhome-tool-food-table').getByText(/brak danych o makroskładnikach/)).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Zastosuj dane', exact: true }).click();
  await expect(dialog).toBeHidden();
  const appliedRows = await liveRows();
  expect(appliedRows.map(row => row.kind)).toEqual(['custom', 'catalogue', 'custom']);
  await expect(frame.locator('#foodTotalKcal')).toContainText(/395\s*kcal/);
  const ownProducts = appliedRows.filter(row => row.kind === 'custom').map(({ kind, ...food }) => food);
  expect(ownProducts).toEqual([
    { id: expect.stringMatching(/^food-/), name: label, grams: 125.5, kcalPer100g: 120 },
    { id: expect.stringMatching(/^food-/), name: 'Fikcyjna woda', grams: 80, kcalPer100g: 0 },
  ]);
  expect(ownProducts[0].id).not.toBe(ownProducts[1].id);
  const savedFoods = { snacks: [{ key: 'snickers', qty: 1 }], meals: [], custom: ownProducts };
  await expect.poll(patientFood).toEqual(savedFoods);
  await page.locator('aside.sidebar-v2 #saveDataBtnSidebar').click();
  await expect.poll(() => frame.evaluate(async id => {
    const record = await VildaVault.getPatient(id);
    return record.snapshots.find(snapshot => snapshot.payload?.foods?.custom?.length)?.payload.foods;
  }, fixture.ids.a)).toEqual(savedFoods);

  await page.reload({ waitUntil: 'load' });
  frame = await shellFrame(page);
  await readyForPatient(frame);
  await expect.poll(async () => (await liveRows()).filter(row => row.kind === 'custom').map(({ kind, ...food }) => food)).toEqual(ownProducts);
  expect((await liveRows()).filter(row => row.kind === 'catalogue')).toEqual([{ kind: 'catalogue', key: 'snickers' }]);
  await expect(frame.locator('#foodTotalKcal')).toContainText(/395\s*kcal/);

  await loadPatient(frame, fixture.ids.b, 'restore');
  await expect.poll(liveRows).toEqual([]);
  await loadPatient(frame, fixture.ids.a, 'restore');
  await expect.poll(patientFood).toEqual(savedFoods);
  await expect(frame.locator('#foodTotalKcal')).toContainText(/395\s*kcal/);

  await frame.locator('#clearAllDataBtn').click();
  const clearWarning = frame.getByRole('dialog', { name: /^Zapisać (wpisane dane|zmiany) przed wyczyszczeniem\?$/ });
  await expect.poll(async () => await clearWarning.isVisible() || (await liveRows()).length === 0).toBe(true);
  if (await clearWarning.isVisible()) await clearWarning.getByRole('button', { name: /^Odrzuć (dane|zmiany) i wyczyść$/ }).click();
  await expect.poll(liveRows).toEqual([]);
  await expect.poll(async () => (await patientFood()).custom).toBeUndefined();
});
