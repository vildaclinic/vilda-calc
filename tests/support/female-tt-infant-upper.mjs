import { expect } from '@playwright/test';
import { initializeStorage } from './insl3-age-source.mjs';
import { loadPatient } from './centile-live-fixture.mjs';
import { czekajNaOdtworzenieSesji } from './sesja-czekanie.mjs';

// Synthetic current-form patients. The visible patient loading and DOB form
// publish the same identity, age provenance and gestation used in production.
export { initializeStorage };
export const host = page => page.locator('#labFemaleTtInfantUpper');
export const card = page => host(page).locator('.vilda-female-tt-infant-upper');
export const runtimeState = page => page.evaluate(() => window.VildaFemaleTTInfantUpperRuntime.getState());
export const sources = page => card(page).locator('[data-female-tt-infant="sources"]');
export const rows = page => card(page).locator('[data-female-tt-infant-row]');
export const patientPoint = page => card(page).locator('[data-female-tt-infant-marker="patient"]');
export const overflowPoint = page => card(page).locator('[data-female-tt-infant-marker="overflow"]');
export const gauge = page => card(page).locator('[data-female-tt-infant="gauge"]');

export async function dismiss(page) {
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
}

export async function ready(page) {
  await page.waitForFunction(() => window.VildaFemaleTTInfantUpperRuntime && window.VildaFemaleTTInfantUpper
    && window.VildaLabPubertyRuntime && !document.documentElement.classList.contains('vilda-auth-locked'));
  await dismiss(page);
}

export async function choose(page, raw = '0,15', unit = 'nmol/L', target = unit, analyte = 'testosterone_total') {
  await page.locator('#labSubstance').fill(analyte === 'testosterone_total' ? 'Testosteron' : 'LH');
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  await page.locator('#labUnit').selectOption(analyte === 'testosterone_total' ? unit : 'IU/L');
  await page.locator('#labUnitTarget').selectOption(analyte === 'testosterone_total' ? target : 'IU/L');
  await page.locator('#labValue').fill(raw);
}

export async function waitMainReady(page) {
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
    && window.VildaDobAge && window.VildaLabNeonatalContext && window.applyLoadedData
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await czekajNaOdtworzenieSesji(page);
  await page.waitForFunction(() => {
    const pending = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return !window.__vildaPersistRestoring && !window.VildaPersistence.isAutosaveSuppressed()
      && !window.VildaDataImportExport.isMainSessionAutosavePaused() && !window.VildaDobAge.restorePending()
      && (!pending || !pending.hasPendingSaveTimer && !pending.hasPendingForceSaveTimer && !pending.hasPendingElementRefreshTimer);
  });
}

export async function mainPatient(page, {
  months = 3, days = 10, completedMonthsOnly = false, ga = 39, sex = 'F', gnrhaStatus = '', origin = '',
} = {}) {
  await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
  await dismiss(page);
  await waitMainReady(page);
  const id = await page.evaluate(async ({ months, ga, sex, gnrhaStatus }) => {
    const user = { name: 'Fikcyjna Dziewczynka TT Niemowlę', firstName: 'Dziewczynka TT', lastName: 'Fikcyjna',
      sex, age: 0, ageMonths: months, weight: 5, height: 60 };
    const payload = { name: user.name, user, puberty: { gnrhaStatus } };
    if (ga !== null) payload.perinatal = { gestationalWeeks: ga, gestationalDays: 0 };
    return (await window.VildaVault.savePatient(payload, { dedup: false })).patientId;
  }, { months, ga, sex, gnrhaStatus });
  // The fixture intentionally starts a fresh fictional visit. Clear the
  // previous visit through the production reset before visible patient load;
  // an absent DOB in the next record must not retain an old auto-age lock.
  await loadPatient(page, id, 'new', { clear: true });
  await waitMainReady(page);
  // A new measurement clears its visit data. Enter the actual current age;
  // do not rely on a restored zero being republished through a truthy test.
  const clearDob = page.locator('#dobClear');
  if (await clearDob.isVisible()) await clearDob.click();
  else {
    await page.locator('#dobInput').fill('');
    await page.locator('#dobInput').dispatchEvent('change');
  }
  await expect(page.locator('#age')).toBeEditable({ timeout: 10_000 });
  await page.locator('#age').fill('0', { timeout: 10_000 });
  await page.locator('#ageMonths').fill(String(months), { timeout: 10_000 });
  if (!completedMonthsOnly) {
    const birth = await page.evaluate(({ months, days }) => {
      const today = new Date();
      const birth = new Date(today.getFullYear(), today.getMonth() - months, today.getDate() - days);
      return `${String(birth.getDate()).padStart(2, '0')}-${String(birth.getMonth() + 1).padStart(2, '0')}-${birth.getFullYear()}`;
    }, { months, days });
    await page.locator('#dobInput').fill(birth);
    await page.locator('#dobInput').dispatchEvent('change');
    await expect.poll(() => page.evaluate(() => window.VildaDobAge.readISO())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect.poll(() => page.evaluate(() => {
      const cache = window.VildaLabNeonatalContext.readCache();
      const exact = window.VildaDobAge.readExactAge();
      return Boolean(cache?.postnatalDays?.source === 'main-calendar-dates'
        && exact && cache.postnatalDays.upper === exact.days);
    })).toBe(true);
  }
  await page.evaluate(() => {
    window.vildaPersistFlushNow?.({ force: true });
    window.VildaDataImportExport.saveMainSessionNow();
  });
  await expect.poll(() => page.evaluate(id => ({
    currentId: sessionStorage.getItem('vildaCurrentPatientId'),
    source: window.VildaPubertySource.kontekstPacjenta(id).status,
    pending: Boolean(window.__vildaPersistRestoring || window.VildaDobAge.restorePending()),
  }), id)).toEqual({ currentId: id, source: 'ready', pending: false });
  await page.goto(`${origin}/przelicznik-jednostek.html`, { waitUntil: 'load' });
  await ready(page);
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  return id;
}

export async function start(page, { width = 1440, origin = '', offline = false } = {}) {
  await page.setViewportSize({ width, height: 1000 });
  await initializeStorage(page);
  if (!offline) await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.goto(`${origin}/przelicznik-jednostek.html`, { waitUntil: 'load' });
  await ready(page);
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
  await page.evaluate(() => window.VildaVault.createUser('E2e#FictionalFemaleTtInfant!2026', {
    label: 'Fikcyjny sejf niemowlęcego TT dziewcząt', iterations: 10000,
  }));
}

export async function prepare(page, options = {}) {
  await start(page, options);
  const id = await mainPatient(page, options);
  await choose(page);
  return id;
}

export async function expectFits(page) {
  expect(await host(page).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

export async function laboratoryFacts(page) {
  return page.evaluate(() => {
    const result = window.VildaLabPubertyRuntime.getAssessment()?.evaluation;
    return { biochemical: result?.biochemical, preview: result?.referencePreview, input: result?.input,
      measurement: result?.measurement };
  });
}

// Qualified renderer contract, separate from ordinary UI (whose assay and
// material are genuinely unknown). Only module INPUT is supplied. Identity,
// current age and result still come from the real production form/assessment;
// the real parser, engine, renderer and main presentation callback all run.
export async function supplyReportedSample(page, changes = {}) {
  return page.evaluate(changes => {
    const runtime = window.VildaFemaleTTInfantUpperRuntime;
    const current = runtime.getState();
    if (!current?.ageContext || !current.identityKey) throw new Error('No current production infant age context');
    const assessment = window.VildaLabPubertyRuntime.getAssessment()?.evaluation;
    const source = window.VildaPubertySource.kontekstPacjenta(current.identityKey);
    const gestation = source?.neonatalAge?.gestationalDays;
    const ga = gestation && gestation.lower === gestation.upper ? gestation.lower : null;
    return runtime.update({
      sourceStatus: 'ready', analyte: 'testosterone_total', sex: 'female',
      identityKey: current.identityKey, currentIdentityKey: sessionStorage.getItem('vildaCurrentPatientId'),
      contextBasis: 'current-patient', ageYears: current.ageContext.lowerYears,
      ageUpperYears: current.ageContext.upperYears, ageUpperInclusive: current.ageContext.upperInclusive,
      gestationalAgeDays: ga, gestationalAgeUpperDays: ga,
      gestationalAgeUpperInclusive: ga !== null ? true : undefined,
      specimen: 'serum', assayMethodId: 'lc-ms/ms',
      measurement: assessment?.measurement, displayUnit: document.getElementById('labUnitTarget').value,
      treatment: {}, ...changes,
    });
  }, changes);
}

export async function expectNoPatientPoint(page) {
  await expect(patientPoint(page)).toHaveCount(0);
  await expect(overflowPoint(page)).toHaveCount(0);
}

export async function expectNoInfantReference(page) {
  await expect(host(page)).toBeHidden();
  await expect(rows(page)).toHaveCount(0);
  await expectNoPatientPoint(page);
  await expect(page.locator('#labPubertyAssessment [data-comparison="age"] .vilda-lab-axis')).toHaveCount(0);
}

export async function expectUpper(page, value = .21, mode = 'ready') {
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toHaveAttribute('data-mode', mode);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).locator('strong')).toHaveAttribute('data-source-value', String(value));
  await expect(card(page)).toContainText('Górna wartość odniesienia');
  await expect(card(page).locator('input, select, textarea')).toHaveCount(0);
}
