import { expect, test } from '../support/test-czas.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

async function open(page, age, sex, value, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.LabUnitConverter && window.VildaPersistence && window.VildaHormoneLifespanRuntime);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await patient(page, age, sex);
  await page.locator('#labSubstance').fill('AMH');
  await page.locator('#labSubstanceDropdown [data-id="amh"]').click();
  await page.locator('#labUnit').selectOption('ng/mL');
  await page.locator('#labUnitTarget').selectOption('ng/mL');
  await page.locator('#labValue').fill(String(value));
}

async function patient(page, age, sex) {
  await page.evaluate(({ age, sex }) => {
    window.VildaPersistence.writeShared({ name: 'Fikcyjny test zakresów AMH', sex,
      age: age ?? '', ageMonths: age == null ? '' : 0 }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, { age, sex });
}

test('AMH nastolatki: właściwy zakres wieku, źródło i niezależna mediana', async ({ page }) => {
  await open(page, 15, 'F', .45);
  await expect(page.locator('#labResultSourceLine')).toContainText('0,62–7,8 ng/mL');
  await expect(page.locator('#labResultSourceLine')).toContainText('Roche Elecsys');
  await expect(page.locator('#labResultStatus')).toContainText('poniżej');
  await expect(page.locator('[data-patient-concentration="amh"]')).toHaveAttribute('data-reference-value', '21.14');
  await expect(page.locator('[data-patient-concentration="amh"]')).toHaveAttribute('data-reference-statistic', 'group-median');
  await expect(page.locator('#labRanges')).not.toContainText('PCOS');
  await expect(page.locator('#labNotes')).not.toContainText('AMH > 5');
  await expect(page.locator('#labNotes')).not.toContainText('warunkiem kwalifikacji');
});

for (const width of [1440, 320]) test(`AMH: jednostronna granica i równość z granicą przy ${width}px`, async ({ page }) => {
  await open(page, 13, 'M', 13, width);
  await expect(page.locator('#labResultSourceLine')).toContainText('górna granica: <13 ng/mL');
  await expect(page.locator('#labResultSourceLine')).not.toContainText('0–');
  await expect(page.locator('#labResultStatus')).toContainText('powyżej zakresu');
  await expect(page.locator('#labRangeBlock .lab-range-marker')).toHaveClass(/is-above/);
  await page.locator('#labValue').fill('12.9');
  await expect(page.locator('#labResultStatus')).toContainText('Poniżej górnej granicy');
  await page.locator('#labValue').fill('0');
  await expect(page.locator('#labResultStatus')).toContainText('Poniżej górnej granicy');
  await page.locator('#labValue').fill('30');
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveClass(/is-uwaga-high/);
  await expect(page.locator('#labRangeBlock .lab-range-marker')).toHaveClass(/is-uwaga-high/);
  await page.locator('#labUnitTarget').selectOption('pmol/L');
  await expect(page.locator('#labResultSourceLine')).toContainText('górna granica: <92,8 pmol/L');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('AMH: granice dorosłych kobiet nie wyznaczają menopauzy', async ({ page }) => {
  await open(page, 45, 'F', 2.6);
  for (const [age, value, limit] of [[45, 2.6, '2,6'], [50, 2.6, '2,6'], [51, .88, '0,88'], [56, .03, '0,03']]) {
    await patient(page, age, 'F');
    await page.locator('#labValue').fill(String(value));
    await expect(page.locator('#labResultSourceLine')).toContainText(`górna granica: <${limit} ng/mL`);
    await expect(page.locator('#labResultStatus')).toContainText('powyżej zakresu');
    await expect(page.locator('#labRangeBlock')).toContainText('Zakres dla wieku');
    await expect(page.locator('#labRangeBlock')).not.toContainText('menopauza');
  }
});

test('AMH: równoważne granice po konwersji nie zmieniają klasyfikacji', async ({ page }) => {
  await open(page, 15, 'F', 7.8);
  await expect(page.locator('#labResultStatus')).toContainText('w zakresie dla wieku');
  await page.locator('#labUnit').selectOption('pmol/L');
  await page.locator('#labValue').fill(String(7.8 / .1401));
  await expect(page.locator('#labResultStatus')).toContainText('w zakresie dla wieku');
  await expect(page.locator('#labRangeBlock .lab-range-marker')).toHaveClass(/is-normal/);
  await patient(page, 13, 'M');
  await page.locator('#labValue').fill(String(13 / .1401));
  await expect(page.locator('#labResultStatus')).toContainText('powyżej zakresu');
  await expect(page.locator('#labRangeBlock .lab-range-marker')).toHaveClass(/is-above/);
});

test('AMH: brak danych nie daje ogólnej normy dorosłych', async ({ page }) => {
  await open(page, null, null, 2);
  await expect(page.locator('#labResultBig')).toContainText('2');
  await expect(page.locator('#labRangeBlock .lab-range-scale')).toHaveCount(0);
  await expect(page.locator('#labResultStatus')).toBeEmpty();
  await expect(page.locator('#labPatientText')).not.toContainText('zakres ogólny dorosły');
  await expect(page.locator('#labResultSourceLine')).toBeEmpty();
  await patient(page, 30, null);
  await page.locator('#labValue').fill('3');
  await expect(page.locator('#labRangeBlock .lab-range-scale')).toHaveCount(0);
  await expect(page.locator('#labResultStatus')).toBeEmpty();
});
