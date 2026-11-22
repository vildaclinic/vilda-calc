import { expect, test } from '@playwright/test';
import { prepareGabinet, choosePatient } from '../support/gabinet-patient-fixture.mjs';
import { readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', actionTimeout: 15_000 });
test.setTimeout(180_000);

const launch = frame => frame.locator('#vhomeGabinetStart');
const button = (frame, name) => frame.getByRole('button', { name, exact: true });

async function fillPatient(frame, first, last, age, months, sex, weight, height) {
  for (const [id, value] of Object.entries({ firstName: first, lastName: last, age, ageMonths: months, weight, height })) {
    await frame.locator('#' + id).fill(value);
  }
  await frame.locator('#sex').selectOption(sex);
}

function listPatients(frame) {
  return frame.evaluate(async () => (await window.VildaVault.listPatients())
    .map(({ patientId, header }) => ({ id: patientId, first: header.firstName, last: header.lastName })));
}

async function visitsOf(frame, id) {
  return frame.evaluate(async patientId => (await window.VildaVault.getPatientVisits(patientId)).map(row => ({
    visit: row.visitId, owner: row.payload.visit.patientId, first: row.payload.user.firstName,
    last: row.payload.user.lastName, sex: row.payload.user.sex || null, dob: row.payload.user.dobISO || null,
    age: Number(row.payload.user.age), months: Number(row.payload.user.ageMonths),
    mass: Number(row.payload.user.weight), height: Number(row.payload.user.height),
    mother: Number(row.payload.advanced?.motherHeight) || null,
  })), id);
}

test('the four equal launcher tiles open an isolated calculator for adults and children', async ({ page }) => {
  const { frame } = await prepareGabinet(page);
  const home = launch(frame);
  const before = await listPatients(frame);
  const tiles = home.locator('[data-entry]');
  await expect(tiles).toHaveCount(4);
  const bounds = await tiles.evaluateAll(items => items.map(el => {
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x, y, width, height };
  }));
  expect(bounds[0].x).toBeCloseTo(bounds[2].x, 0);
  expect(bounds[1].x).toBeCloseTo(bounds[3].x, 0);
  expect(bounds[1].y).toBeCloseTo(bounds[0].y, 0);
  expect(bounds[2].y).toBeGreaterThan(bounds[0].y);
  expect(bounds[0].width).toBeCloseTo(bounds[1].width, 0);
  expect(bounds[0].height).toBeCloseTo(bounds[3].height, 0);

  await home.locator('[data-entry="quick"]').click();
  const quick = frame.getByRole('dialog', { name: 'Szybkie obliczenie' });
  await quick.locator('[name="years"]').fill('11');
  await quick.locator('[name="sex"]').selectOption('F');
  await quick.locator('[name="mass"]').fill('35');
  await quick.locator('[name="height"]').fill('146');
  for (const reference of ['Palczewska', 'OLAF']) {
    await quick.locator('[name="reference"]').selectOption(reference);
    await button(quick, 'Oblicz').click();
    await expect(quick.locator('dd strong')).toHaveCount(2);
    await expect(quick.locator('dd').first()).toContainText(/centyl/i);
  }
  await quick.locator('[name="years"]').fill('40');
  await quick.locator('[name="mass"]').fill('65');
  await quick.locator('[name="height"]').fill('172');
  await button(quick, 'Oblicz').click();
  await expect(quick.locator('dl')).toContainText('BMI');
  await expect(quick.locator('dl')).toContainText(/22,0/);
  await quick.getByRole('button', { name: 'Zamknij', exact: true }).last().click();
  await expect(home.locator('[data-entry="quick"]')).toBeFocused();

  expect(await listPatients(frame)).toEqual(before);
});

test('returning from rapid intake reuses the already styled launcher', async ({ page }) => {
  const { frame } = await prepareGabinet(page);
  const home = launch(frame);
  const grid = home.locator('.vgs-launch-tiles');
  await expect(grid).toHaveCSS('display', 'grid');
  const stylesheet = await home.locator('link[rel="stylesheet"]').elementHandle();
  const icons = home.locator('.vgs-launch-symbol svg');
  const widths = await icons.evaluateAll(items => items.map(icon => icon.getBoundingClientRect().width));

  await home.locator('[data-entry="rapid"]').click();
  await expect(frame.locator('#gbRapidTitle')).toBeVisible();
  await expect(grid).toHaveCount(0);
  expect(await stylesheet.evaluate(link => link.isConnected && Boolean(link.sheet))).toBe(true);

  await button(frame.locator('#gbEntryHeader'), 'Ekran startowy').click();
  await expect(grid).toBeVisible();
  expect(await stylesheet.evaluate(link => link.isConnected && Boolean(link.sheet))).toBe(true);
  expect(await icons.evaluateAll(items => items.map(icon => icon.getBoundingClientRect().width))).toEqual(widths);
});

test('rapid intake stores one visit per save, starts the next patient clean and preserves homonyms across reload', async ({ page }) => {
  const { frame, ids } = await prepareGabinet(page);
  const home = launch(frame);
  const before = await listPatients(frame);
  const unchanged = await visitsOf(frame, ids.a);
  await home.locator('[data-entry="rapid"]').click();
  await fillPatient(frame, 'Alicja', 'Testowa', '10', '6', 'F', '33.5', '140');
  await expect(button(frame.locator('#currentSummaryCard'), 'Generuj siatki')).toBeVisible();
  await frame.locator('[data-growth-open="data"]').click();
  const growth = frame.getByRole('dialog', { name: 'Zaawansowane obliczenia wzrostowe', exact: true });
  await growth.locator('[data-growth-field="advMotherHeight"]').fill('166');
  await button(growth, 'Zastosuj dane').click();
  await expect(growth).toBeHidden();
  expect(await listPatients(frame)).toEqual(before);
  await button(frame, 'Zapisz pacjenta').click();
  const next = button(frame, 'Następny pacjent');
  await expect(next).toBeVisible({ timeout: 15_000 });
  const after = await listPatients(frame);
  expect(after).toHaveLength(before.length + 1);
  const child = after.find(r => r.first === 'Alicja' && r.last === 'Testowa');
  expect(child).toBeDefined();
  const childVisits = await visitsOf(frame, child.id);
  expect(childVisits).toHaveLength(1);
  expect(childVisits[0]).toMatchObject({ visit: expect.any(String), owner: child.id, mass: 33.5,
    height: 140, age: 10, months: 6, sex: 'F', dob: null, mother: 166 });
  await next.click();
  await expect(frame.locator('[data-rapid-receipt]')).toBeHidden();
  await expect(frame.locator('#firstName')).toBeFocused();
  for (const id of ['firstName', 'lastName', 'height', 'weight', 'age', 'sex']) {
    await expect(frame.locator('#' + id)).toHaveValue('');
  }

  await fillPatient(frame, 'Jan', 'Drugi', '47', '', 'M', '92', '180');
  await button(frame, 'Zapisz pacjenta').click();
  await expect(next).toBeVisible({ timeout: 15_000 });
  const current = await listPatients(frame);
  expect(current).toEqual(expect.arrayContaining([expect.objectContaining({ first: 'Jan', last: 'Drugi' })]));
  const adult = current.find(r => r.first === 'Jan' && r.last === 'Drugi');
  expect(adult.id).not.toBe(child.id);
  const adultVisits = await visitsOf(frame, adult.id);
  expect(adultVisits).toHaveLength(1);
  expect(adultVisits[0]).toMatchObject({ owner: adult.id, mass: 92, height: 180, age: 47, sex: 'M', dob: null, mother: null });
  expect(adultVisits[0].visit).not.toBe(childVisits[0].visit);
  expect(await visitsOf(frame, child.id)).toEqual(childVisits);

  await next.click();
  await fillPatient(frame, 'Alicja', 'Testowa', '10', '6', 'F', '34', '141');
  await button(frame, 'Zapisz pacjenta').click();
  const match = frame.getByRole('dialog');
  await expect(match).toBeVisible();
  expect(await visitsOf(frame, child.id)).toEqual(childVisits);
  await match.getByRole('button', { name: /Alicja|Dodaj wizytę/ }).click();
  await expect(next).toBeVisible({ timeout: 15_000 });
  const followups = await visitsOf(frame, child.id);
  expect(followups).toHaveLength(2);
  expect(new Set(followups.map(v => v.visit)).size).toBe(2);
  expect(followups.map(v => v.mass).sort()).toEqual([33.5, 34]);
  expect(await listPatients(frame)).toHaveLength(before.length + 2);
  expect(await visitsOf(frame, ids.a)).toEqual(unchanged);

  await button(frame, 'Otwórz kartę pacjenta').click();
  await expect(frame.locator('#vhomePatientOverview')).toBeVisible({ timeout: 15_000 });
  await expect(frame.locator('#vhomeGabinetHeader')).toContainText('Alicja');
  await page.reload({ waitUntil: 'load' });
  const reloaded = await shellFrame(page);
  await readyForPatient(reloaded);
  await choosePatient(reloaded, 'Alicja');
  expect(await visitsOf(reloaded, child.id)).toEqual(followups);
  expect(await visitsOf(reloaded, adult.id)).toEqual(adultVisits);
});

test('an explicitly unspecified sex stays unknown when the clinician opens a legacy clinical tool', async ({ page }) => {
  const { frame } = await prepareGabinet(page);
  await launch(frame).locator('[data-entry="rapid"]').click();
  await fillPatient(frame, 'Alicja', 'Kontrolna', '11', '4', '', '31.5', '140');
  await button(frame, 'Zapisz pacjenta').click();
  await button(frame, 'Otwórz kartę pacjenta').click();
  await expect(frame.locator('#vhomePatientOverview')).toBeVisible();
  const id = await frame.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'));
  const assertStart = async () => {
    await expect(page).toHaveURL(/app\.html[^#]*#\/start$/);
    await expect(page.locator('iframe.app-pane[title="Start"]')).toBeVisible();
  };
  await (await visibleChromeMenu(page)).locator('a[href="docpro.html"]').click();
  await assertStart();
  await page.evaluate(() => window.VildaShell.navigate('klirens'));
  await assertStart();
  await page.evaluate(() => { window.location.hash = '/docpro'; });
  await assertStart();
  const visits = await visitsOf(frame, id);
  expect(visits).toHaveLength(1);
  expect(visits[0].sex).toBeNull();
  await page.goto('/app.html?deep=1#/klirens', { waitUntil:'load' });
  await assertStart();
  await page.goto('/docpro.html', { waitUntil:'domcontentloaded' }).catch(error => {
    // Engines may report the interrupted document navigation before the redirect.
    if (!/interrupted|aborted/i.test(error.message)) throw error;
  });
  await assertStart();
  const active = page.frameLocator('iframe.app-pane[title="Start"]:visible');
  await expect(active.locator('#calcForm')).toBeAttached();
  await expect(page.locator('iframe.app-pane:is([title="DocPro"], [title="Kalkulator klirensu"]):visible')).toHaveCount(0);
  await expect.poll(() => page.evaluate(patientId => {
    const session = window.VildaPersistence?.readMainSession();
    return window.VildaShell?.getCurrentRoute() === 'start' &&
      sessionStorage.getItem('vildaCurrentPatientId') === patientId &&
      session?.visit?.patientId === patientId && session.user.sex === '';
  }, id)).toBe(true);
  await expect(active.locator('#currentSummaryCard')).toBeHidden();
});
