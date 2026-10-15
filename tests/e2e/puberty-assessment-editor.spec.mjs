import { expect, test } from '../support/test-czas.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

test.use({ serviceWorkers: 'block' });

async function open(page) {
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({
      version: 1, acceptedAtISO: new Date().toISOString(),
    }));
    localStorage.setItem('analyticsConsent', 'denied');
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.VildaPubertyAssessmentContext && window.VildaPubertyAssessmentUI));
  await czekajNaOdtworzenieSesji(page);
  await page.waitForFunction(() => !window.__vildaPersistRestoring
    && !window.VildaPersistence.isClearInProgress()
    && !(Number(window.__vildaPersistClearUntil || 0) > Date.now()));
}

const stage = (page, axis, value) => page.locator(`.vpa-segments [data-puberty-axis="${axis}"][data-puberty-stage="${value ?? ''}"]`);
const raw = page => page.evaluate(() => window.collectUserData().user.pubertyAssessment);

test('anonymous visit needs only age/sex and independent G/P; optional measurements do not choose G', async ({ page }) => {
  await open(page);
  await page.locator('#age').fill('12');
  await page.locator('#sex').selectOption('M');
  await expect(page.locator('#pubertyAssessmentEditor')).toBeHidden();
  await page.locator('#tannerToggleBtn').click();
  await expect(page.locator('#tannerStage')).toBeHidden();
  await expect(stage(page, 'G', null)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#pubertyOptionalDetails')).not.toHaveAttribute('open');
  await expect(page.locator('#advTesticularVolume')).toBeHidden();
  await stage(page, 'P', 3).click();
  await expect(stage(page, 'G', null)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#pubertyAssessmentSummary')).toHaveText('P3');
  await stage(page, 'G', 2).click();
  await expect(page.locator('#pubertyAssessmentSummary')).toHaveText('G2 · P3');
  await page.locator('#pubertyOptionalDetails > summary').click();
  await page.locator('#advTesticularVolume').selectOption('lt4');
  await expect(stage(page, 'G', 2)).toHaveAttribute('aria-pressed', 'true');
  expect((await raw(page)).observations).toMatchObject({ G: { stage: 2 }, P: { stage: 3 }, Th: null });
  for (const id of ['name', 'height', 'weight']) await expect(page.locator('#' + id)).toHaveValue('');
  await page.locator('#tannerToggleBtn').click();
  await expect(page.locator('#pubertyAssessmentEditor')).toBeHidden();
  await expect(page.locator('#tannerToggleBtn')).toHaveText('+ Dane pokwitaniowe (wpisane)');
});

test('guide choices select the same stage and show indicative Prader volumes only on demand', async ({ page }) => {
  await open(page);
  await page.locator('#age').fill('12');
  await page.locator('#tannerToggleBtn').click();
  await expect(page.getByText('Orientacyjna objętość jądra: ok. 4–6 ml', { exact: true })).toBeHidden();
  await page.locator('[data-puberty-guide-toggle="G"]').click();
  await expect(page.getByText('Orientacyjna objętość jądra: ok. 4–6 ml', { exact: true })).toBeVisible();
  await expect(page.locator('#pubertyAssessmentGuideG')).toContainText('pojedynczego jądra');
  await expect(page.locator('#pubertyAssessmentGuideG')).toContainText('nie są granice stadiów');
  await page.locator('[data-puberty-guide-choice][data-puberty-axis="G"][data-puberty-stage="3"]').click();
  await expect(stage(page, 'G', 3)).toHaveAttribute('aria-pressed', 'true');
  await expect(stage(page, 'G', 3)).toBeFocused();
  await expect(page.locator('#pubertyAssessmentGuideG')).toBeHidden();
  await expect(page.locator('#pubertyAssessmentG .vpa-definition')).toContainText('głównie na długość');
  await stage(page, 'G', 4).click();
  expect((await raw(page)).observations.G.stage).toBe(4);
});

test('female help explains Th morphology and sex-specific P2, including a clean 320px layout', async ({ page }) => {
  await open(page);
  await page.setViewportSize({ width: 320, height: 850 });
  await page.locator('#age').fill('12');
  await page.locator('#sex').selectOption('F');
  await page.locator('#tannerToggleBtn').click();
  await expect(page.locator('#pubertyAssessmentG')).toHaveCount(0);
  await page.locator('[data-puberty-guide-toggle="Th"]').click();
  await expect(page.locator('#pubertyAssessmentGuideTh')).toContainText('jeden ciągły obrys');
  await expect(page.locator('#pubertyAssessmentGuideTh')).toContainText('wtórne uwypuklenie');
  await expect(page.locator('#pubertyAssessmentGuideTh')).toContainText('oglądaniem i palpacyjnie');
  await page.locator('[data-puberty-guide-choice][data-puberty-axis="Th"][data-puberty-stage="4"]').click();
  await expect(stage(page, 'Th', 4)).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-puberty-guide-toggle="P"]').click();
  await expect(page.locator('#pubertyAssessmentGuideP')).toContainText('wzdłuż warg sromowych');
  await page.locator('[data-puberty-guide-choice][data-puberty-axis="P"][data-puberty-stage="2"]').click();
  await expect(page.locator('#pubertyAssessmentSummary')).toHaveText('Th4 · P2');
  const layout = await page.locator('#tannerStageWrap').evaluate(element => ({
    width: element.getBoundingClientRect().width,
    scrollWidth: element.scrollWidth,
    viewport: document.documentElement.clientWidth,
    right: element.getBoundingClientRect().right,
  }));
  expect(layout.right).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
});

test('editing or clearing one axis preserves the other observation and its date', async ({ page }) => {
  await open(page);
  const previousG = { stage: 3, observedAtISO: '2026-02-17', ageMonths: 140, source: 'fictional-previous-exam' };
  await page.evaluate(g => window.applyLoadedData({ user: { sex: 'M', age: 12,
    pubertyAssessment: { version: 1, sex: 'M', observations: {
      G: g, Th: null, P: { stage: 2, observedAtISO: '2026-03-17', ageMonths: 141, source: 'fictional-previous-exam' },
    } },
  } }, { isSessionRestore: true }), previousG);
  await page.locator('#tannerToggleBtn').click();
  await expect(page.locator('#pubertyAssessmentG .vpa-provenance')).toContainText('17.02.2026');
  await stage(page, 'P', 4).click();
  expect((await raw(page)).observations.G).toEqual(previousG);
  await stage(page, 'P', null).click();
  expect((await raw(page)).observations.G).toEqual(previousG);
  expect((await raw(page)).observations.P).toBeNull();
  await expect(stage(page, 'P', null)).toHaveAttribute('aria-pressed', 'true');
  await expect(stage(page, 'G', 3)).toHaveAttribute('aria-pressed', 'true');
});

test('a sex change preserves historical P and G without assigning them to the new assessment', async ({ page }) => {
  await open(page);
  await page.locator('#age').fill('12');
  await page.locator('#tannerToggleBtn').click();
  await stage(page, 'G', 3).click();
  await stage(page, 'P', 2).click();
  const maleP = (await raw(page)).observations.P;
  await page.locator('#sex').selectOption('F');
  await expect(stage(page, 'Th', null)).toHaveAttribute('aria-pressed', 'true');
  await expect(stage(page, 'P', null)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#pubertyAssessmentP .vpa-provenance')).toContainText('innej płci');
  await stage(page, 'Th', 3).click();
  const female = await raw(page);
  expect(female.observations.G).toMatchObject({ stage: 3, sex: 'M' });
  expect(female.observations.P).toEqual(maleP);
  expect(female.observations.Th).toMatchObject({ stage: 3, sex: 'F' });
  await stage(page, 'P', 3).click();
  expect((await raw(page)).observations.P).toMatchObject({ stage: 3, sex: 'F' });
});

test('a real edit during a restore pause survives the main session and F5 without a name', async ({ page }) => {
  await open(page);
  await page.locator('#age').fill('12');
  await page.locator('#sex').selectOption('F');
  await page.locator('#tannerToggleBtn').click();
  await stage(page, 'Th', 4).click();
  await page.evaluate(() => { window.__vildaPersistPauseUntil = Date.now() + 750; });
  await stage(page, 'Th', 3).click();
  await expect.poll(() => page.evaluate(() => window.VildaPersistence.readMainSession()?.user?.pubertyAssessment?.observations?.Th?.stage)).toBe(3);
  const before = await raw(page);
  await page.reload({ waitUntil: 'load' });
  await czekajNaOdtworzenieSesji(page);
  await expect.poll(() => raw(page)).toEqual(before);
  await expect(page.locator('#name')).toHaveValue('');
  await expect(page.locator('#pubertyAssessmentEditor')).toBeHidden();
  await page.locator('#tannerToggleBtn').click();
  await expect(stage(page, 'Th', 3)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.VildaPubertyAssessmentContext.readActiveContext().axisStates.Th.current)).toBe(true);
});

test('real clear/restore preparation disables editing briefly and enables it without another question', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.clearAllData();
    window.vildaOtworzDanePokwitaniowe();
  });
  await expect(page.locator('#pubertyAssessmentEditor')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#pubertyAssessmentEditor [data-puberty-context-note]')).toHaveText('Trwa przygotowanie formularza…');
  await expect(stage(page, 'G', 3)).toBeDisabled();
  await expect(stage(page, 'G', 3)).toBeEnabled({ timeout: 10000 });
  await expect(page.locator('#pubertyAssessmentEditor')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#pubertyAssessmentEditor [data-puberty-context-note]')).toBeHidden();
});
