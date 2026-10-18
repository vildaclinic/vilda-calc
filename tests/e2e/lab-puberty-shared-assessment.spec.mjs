import { expect, test } from '../support/test-czas.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';
import { quickSelect, quickFill } from '../support/lab-puberty-quick.mjs';

test.use({ serviceWorkers: 'block' });

async function open(page, path = '/index.html') {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${day}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${day}|${Date.now()}`);
  });
  await page.goto(path, { waitUntil: 'load' });
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (path === '/index.html' || path.startsWith('/app.html')) await guest.click();
  else if (await guest.isVisible()) await guest.click();
}

async function choose(page, analyte = 'lh', value = '2') {
  await page.locator('#labSubstance').fill(analyte === 'inhibin_b' ? 'Inhibina' : analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  await page.locator('#labValue').fill(value);
}

const assessment = page => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());

async function mainObservation(page, sex, axis, stage) {
  await page.waitForFunction(() => window.VildaPubertyAssessmentState && window.VildaPubertyAssessmentUI);
  await czekajNaOdtworzenieSesji(page);
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (await guest.isVisible()) await guest.click();
  await page.waitForFunction(() => !window.__vildaPersistRestoring &&
    !window.VildaPersistence.isClearInProgress() && !(Number(window.__vildaPersistClearUntil || 0) > Date.now()));
  await page.locator('#sex').selectOption(sex);
  await page.locator('#age').fill('2');
  await page.locator('#ageMonths').fill('9');
  await page.locator('#tannerToggleBtn').click();
  await page.locator(`#pubertyAssessmentEditor .vpa-segments [data-puberty-axis="${axis}"][data-puberty-stage="${stage}"]`).click();
  await expect.poll(() => page.evaluate(key => window.VildaPubertyAssessmentState.read().assessment?.observations?.[key]?.stage, axis)).toBe(Number(stage));
  await page.evaluate(() => {
    window.vildaPersistFlushNow?.({ force: true });
    window.VildaDataImportExport.saveMainSessionNow();
  });
}

for (const [sex, axis] of [['M', 'G'], ['F', 'Th']]) {
  test(`main ${axis}3 is reused in LH without a second puberty question (${sex})`, async ({ page }) => {
    await open(page);
    await mainObservation(page, sex, axis, '3');
    await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaPubertyAssessmentContext);
    await choose(page);
    await expect(page.locator('#labPubertyStageSummary')).toContainText(`${axis}3`);
    await expect(page.locator('#labPubertyKind')).toBeHidden();
    await expect(page.locator('#labPubertyStage')).toBeHidden();
    const saved = await assessment(page);
    expect(saved.evaluation.input.puberty).toMatchObject({ kind: axis, stage: 3, appliesToCurrentContext: true });
    expect(saved.evaluation.referencePreview.byAge.status).not.toBe('unavailable');
    expect(saved.evaluation.referencePreview.byStage.status).not.toBe('unavailable');
    const valueBefore = await page.locator('#labValue').inputValue();
    await page.locator('#labPubertyRefineStage').click();
    await expect(page.locator('#labPubertyStageHint')).toContainText('Korekta tylko dla tego sprawdzenia');
    await page.locator('#labPubertySharedEditor .vpa-segments [data-puberty-axis="P"][data-puberty-stage="2"]').click();
    await expect(page.locator('#labValue')).toHaveValue(valueBefore);
    await expect(page.locator('#labPubertyStageSummary')).toContainText(`${axis}3 · P2`);
    const updated = await assessment(page);
    expect(updated.evaluation.input.puberty).toMatchObject({ kind: axis, stage: 3, appliesToCurrentContext: true });
    expect(saved.evaluation.input.puberty).toMatchObject({ kind: axis, stage: 3 });
    await page.goto('/index.html', { waitUntil: 'load' });
    await czekajNaOdtworzenieSesji(page);
    await expect.poll(() => page.evaluate(() => window.VildaPubertyAssessmentState.read().assessment?.observations?.P)).toBeNull();
  });
}

test('P alone keeps the age comparison available and never supplies a gonadal stage', async ({ page }) => {
  await open(page);
  await mainObservation(page, 'M', 'P', '4');
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await choose(page);
  await expect(page.locator('#labPubertyStageSummary')).toContainText('P4');
  const saved = await assessment(page);
  expect(saved.evaluation.input.puberty.stage).toBeNull();
  expect(saved.evaluation.referencePreview.byAge.status).not.toBe('unavailable');
  expect(saved.evaluation.referencePreview.byStage.status).toBe('unavailable');
});

test('standalone correction uses the same editor with an explicit local scope and no patient write', async ({ page }) => {
  await open(page, '/przelicznik-jednostek.html');
  await choose(page);
  await quickSelect(page, 'Sex', 'M');
  await quickFill(page, 'AgeYears', '14');
  await quickFill(page, 'AgeMonths', '0');
  const before = await page.evaluate(() => ({ shared: window.VildaPersistence.readShared(), main: window.VildaPersistence.readMainSession() }));
  await page.locator('#labPubertyRefineStage').click();
  await expect(page.locator('#labPubertyStageHint')).toContainText('Korekta tylko dla tego sprawdzenia');
  await page.locator('#labPubertySharedEditor .vpa-segments [data-puberty-axis="G"][data-puberty-stage="3"]').click();
  await expect(page.locator('#labValue')).toHaveValue('2');
  const saved = await assessment(page);
  expect(saved.evaluation.input.puberty).toMatchObject({ kind: 'G', stage: 3, appliesToCurrentContext: true, source: 'lab-local' });
  expect(saved.evaluation.referencePreview.byStage.status).not.toBe('unavailable');
  expect(await page.evaluate(() => ({ shared: window.VildaPersistence.readShared(), main: window.VildaPersistence.readMainSession() }))).toEqual(before);
  await quickFill(page, 'AgeYears', '15');
  const earlier = await assessment(page);
  expect(earlier.evaluation.input.puberty).toMatchObject({ kind: 'G', stage: null, appliesToCurrentContext: false });
  expect(earlier.evaluation.referencePreview.byAge.status).not.toBe('unavailable');
  expect(earlier.evaluation.referencePreview.byStage.status).toBe('unavailable');
  await expect(page.locator('#labPubertyStageSummary')).toContainText('wcześniej');
  await quickSelect(page, 'Kind', 'G');
  await quickSelect(page, 'Stage', '3');
  expect((await assessment(page)).evaluation.input.puberty).toMatchObject({ kind: 'G', stage: 3, appliesToCurrentContext: true });
  await quickSelect(page, 'Sex', 'F');
  const changed = await assessment(page);
  expect(changed.evaluation.input.puberty).toMatchObject({ kind: 'unspecified', stage: null, appliesToCurrentContext: false });
});

test('the shell edits one live visit from lab and retains the analyte and result across panels', async ({ page }) => {
  await open(page, '/app.html#/start');
  const mainElement = page.locator('iframe.app-pane[title="Start"]');
  await expect(mainElement).toBeVisible();
  const main = await (await mainElement.elementHandle()).contentFrame();
  await mainObservation(main, 'M', 'G', '3');
  const original = await main.evaluate(() => window.VildaPubertyAssessmentState.read().assessment.observations.G);
  await page.evaluate(() => { location.hash = '/lab'; });
  const labElement = page.locator('iframe.app-pane[title="Jednostki laboratoryjne"]');
  await expect(labElement).toBeVisible();
  const lab = await (await labElement.elementHandle()).contentFrame();
  await lab.waitForFunction(() => window.VildaLabPubertyRuntime);
  await choose(lab);
  await expect(lab.locator('#labPubertyStageSummary')).toContainText('G3');
  await lab.locator('#labPubertyRefineStage').click();
  await expect(lab.locator('#labPubertyStageHint')).toContainText('Wspólna ocena tej wizyty');
  await lab.locator('#labPubertySharedEditor .vpa-segments [data-puberty-axis="P"][data-puberty-stage="2"]').click();
  await expect.poll(() => main.evaluate(() => window.VildaPubertyAssessmentState.read().assessment.observations.P?.stage)).toBe(2);
  expect(await main.evaluate(() => window.VildaPubertyAssessmentState.read().assessment.observations.G)).toEqual(original);
  const pinned = await lab.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());
  await lab.locator('#labPubertySharedEditor .vpa-segments [data-puberty-axis="G"][data-puberty-stage="4"]').click();
  expect(pinned.evaluation.input.puberty).toMatchObject({ kind: 'G', stage: 3 });
  await expect.poll(() => main.evaluate(() => window.VildaPubertyAssessmentState.read().assessment.observations.G?.stage)).toBe(4);
  await expect(lab.locator('#labValue')).toHaveValue('2');
  await page.evaluate(() => { location.hash = '/start'; });
  await expect(mainElement).toBeVisible();
  await page.evaluate(() => { location.hash = '/lab'; });
  await expect(labElement).toBeVisible();
  await expect(lab.locator('#labValue')).toHaveValue('2');
  await expect(lab.locator('#labSubstance')).toHaveValue(/LH/);
  await expect(lab.locator('#labPubertyStageSummary')).toContainText('G4 · P2');
});
