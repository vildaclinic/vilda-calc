import { expect, test } from '../support/test-czas.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

// P-POKWITANIE-WIZYTA (decyzja właściciela 2026-10-15): oś oceniona świadomie w tej wizycie
// niesie wiek i datę wizyty, także gdy lekarz wpisze stadium przed wiekiem albo poprawi wiek
// po kliknięciu. Scenariusze zmierzone przed poprawką w analizie z 2026-10-15:
//   • G3 przed wiekiem → obserwacja bez wieku na zawsze, znacznik wizyty z wiekiem 0 mies.;
//   • wiek 12 → G3 → korekta na 13: „G3 (wcześniej)”, LH/FSH bez stadium; na 14: prognozy bez stadium;
//   • chip zapisu w nagłówku zostawał „zapisane” po kliknięciu stadium.
test.use({ serviceWorkers: 'block' });

async function openGuest(page) {
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
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
const snapshot = page => page.evaluate(() => {
  const user = window.collectUserData().user;
  const ctx = window.VildaPubertyAssessmentContext.readActiveContext();
  const dane = window.VildaPubertalStatus.dane({ plec: document.getElementById('sex').value, wiekLat: window.getAgeDecimal() });
  return {
    G: user.pubertyAssessment && user.pubertyAssessment.observations.G,
    reference: user.pubertyAssessmentVisit && user.pubertyAssessmentVisit.reference,
    gonadal: { status: ctx.gonadal.status, current: ctx.gonadal.current, stage: ctx.gonadal.stage },
    growth: { status: ctx.growth.status, stage: ctx.growth.stage },
    wzrastanie: { etap: dane.etap, zrodlo: dane.etapZrodlo },
    summary: document.getElementById('pubertyAssessmentSummary').textContent,
  };
});

test('stadium kliknięte przed wiekiem dostaje wiek wizyty, gdy tylko zostanie wpisany', async ({ page }) => {
  await openGuest(page);
  await page.locator('#sex').selectOption('M');
  await page.locator('#tannerToggleBtn').click();
  await stage(page, 'G', 3).click();
  let s = await snapshot(page);
  expect(s.G).toMatchObject({ stage: 3, ageMonths: null, observedAtISO: null });
  expect(s.reference.ageMonths).toBeNull();
  await page.locator('#age').fill('12');
  await expect.poll(async () => (await snapshot(page)).G.ageMonths).toBe(144);
  s = await snapshot(page);
  expect(s.reference).toMatchObject({ sex: 'M', ageMonths: 144 });
  expect(s.gonadal).toEqual({ status: 'ready', current: true, stage: 3 });
  expect(s.summary).toBe('G3');
});

test('korekta wieku po kliknięciu stadium nie odbiera dzisiejszej ocenie statusu bieżącej', async ({ page }) => {
  await openGuest(page);
  await page.locator('#sex').selectOption('M');
  await page.locator('#age').fill('12');
  await page.locator('#tannerToggleBtn').click();
  await stage(page, 'G', 3).click();
  expect((await snapshot(page)).G.ageMonths).toBe(144);
  for (const years of ['13', '14']) {
    await page.locator('#age').fill(years);
    await expect.poll(async () => (await snapshot(page)).G.ageMonths).toBe(Number(years) * 12);
    const s = await snapshot(page);
    expect(s.reference.ageMonths).toBe(Number(years) * 12);
    expect(s.gonadal).toEqual({ status: 'ready', current: true, stage: 3 });
    expect(s.growth).toEqual({ status: 'ready', stage: 3 });
    expect(s.wzrastanie).toEqual({ etap: 3, zrodlo: 'formularz' });
    expect(s.summary).toBe('G3');
  }
  await expect(page.locator('#pubertyAssessmentSummary')).not.toContainText('wcześniej');
});

test('chip pacjenta w nagłówku pokazuje niezapisane zmiany po samym kliknięciu stadium', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    localStorage.setItem('analyticsConsent', 'denied');
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  // Własny zaszyfrowany sejf w efemerycznym kontekście Playwrighta; wyłącznie fikcyjne dane.
  await page.evaluate(() => window.VildaVault.createUser('E2e#WiekWizyty!2026', { label: 'Fikcyjny sejf wieku wizyty', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI
    && window.VildaPubertyAssessmentState && typeof window.collectUserData === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await czekajNaOdtworzenieSesji(page);
  const id = await page.evaluate(async () => (await window.VildaVault.savePatient({
    name: 'Fikcyjny Aleksander', user: { lastName: 'Fikcyjny', firstName: 'Aleksander', sex: 'M', age: 12, ageMonths: 0, height: 150, weight: 40 }
  }, { dedup: false })).patientId);
  await page.evaluate(pid => window.VildaAuthUI.showPatientCard(pid, record => { if (record) window.applyLoadedData(record); }, null), id);
  await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
  await page.locator('#vildaLcmRestore').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  const chip = page.locator('#vildaPatientChip');
  await expect(chip).toHaveClass(/vilda-save-state--saved/, { timeout: 15000 });
  await page.locator('#tannerToggleBtn').click();
  await stage(page, 'G', 3).click();
  await expect(chip).toHaveClass(/vilda-save-state--dirty/, { timeout: 5000 });
  await expect(chip).toHaveAttribute('title', /Niezapisane zmiany/);
});
