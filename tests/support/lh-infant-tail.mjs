import { expect, test } from '@playwright/test';
import { initializeStorage } from './insl3-age-source.mjs';
import { czekajNaOdtworzenieSesji } from './sesja-czekanie.mjs';
import { loadPatient } from './centile-live-fixture.mjs';

export { initializeStorage };
export const chart = page => page.locator('.vilda-hormone-lifespan');
export const point = page => chart(page).locator('[data-patient-concentration="lh"]');
export const sources = page => chart(page).locator('details.vhl-sources');

export async function dismiss(page) {
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
}

export async function ready(page) {
  await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaHormoneLifespanRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await dismiss(page);
}

export async function waitPatientReady(page, id, phase = 'current-patient', { inputComplete = true, requireName = false } = {}) {
  const read = () => page.evaluate(({ id, inputComplete, requireName }) => {
    const shared = window.VildaPersistence.readShared() || {};
    const patient = window.VildaSession.getPatient();
    const sessionId = sessionStorage.getItem('vildaCurrentPatientId');
    const currentId = window._vildaCurrentPatientId || sessionId;
    const known = value => ['number', 'string'].includes(typeof value)
      && String(value).trim() !== '' && Number.isFinite(Number(value));
    const named = typeof patient?.name === 'string' && patient.name.trim() !== '';
    // Charts can use the current shared form without a name. Only pinning
    // requires the named carrier returned by VildaSession.getPatient().
    const ageCarrier = patient || shared;
    const sexMatches = ageCarrier.sex === 'M';
    const ageKnown = known(ageCarrier.age) && known(ageCarrier.ageMonths);
    const matches = ageKnown && Number(ageCarrier.age) === Number(shared.age)
      && Number(ageCarrier.ageMonths) === Number(shared.ageMonths) && sexMatches && shared.sex === 'M';
    const restored = !window.__vildaPersistRestoring && !window.VildaPersistence.isRestoring()
      && !window.VildaDobAge?.restorePending?.();
    const inputSettled = !window.VildaPersistence.isClearInProgress()
      && !window.VildaDataImportExport?.isMainSessionAutosavePaused?.();
    const mainUser = window.VildaPersistence.readMainSession()?.user;
    const mainSessionMatches = mainUser?.firstName === 'Pacjent Ogonka LH' && mainUser?.lastName === 'Fikcyjny'
      && mainUser?.sex === shared.sex
      && known(mainUser?.age) && known(mainUser?.ageMonths)
      && Number(mainUser.age) === Number(shared.age) && Number(mainUser.ageMonths) === Number(shared.ageMonths)
      && (!window.VildaDobAge?.readISO || mainUser.dobISO === window.VildaDobAge.readISO());
    const authReady = window.VildaAuthUI?.isBootReady() === true;
    const sourceStatus = window.VildaPubertySource.kontekstPacjenta(id).status;
    return { ready: currentId === id && sessionId === id && (!requireName || named) && sexMatches && restored && authReady
        && sourceStatus === 'ready'
        && (!inputComplete || matches && inputSettled && mainSessionMatches),
      id, currentId, sessionId, named, requireName, ageKnown, matches, restored, authReady, inputComplete, inputSettled, mainSessionMatches,
      patient, mainUser, currentDobISO: window.VildaDobAge?.readISO?.(),
      shared: { name: shared.name, sex: shared.sex, age: shared.age, ageMonths: shared.ageMonths },
      cache: window.VildaLabNeonatalContext.readCache(),
      sourceStatus };
  }, { id, inputComplete, requireName });
  const before = await read();
  if (!before.ready) await test.info().attach(`LH-infant-fixture-readiness-${phase}`, {
    contentType: 'application/json', body: Buffer.from(JSON.stringify(before, null, 2)),
  });
  // Observe the real complete patient carrier used by pinning and the header;
  // a source-record lookup alone does not establish a ready current form.
  await expect.poll(read).toMatchObject({ ready: true });
  const after = await read();
  if (requireName) await test.info().attach('LH-infant-pin-patient-ready', {
    contentType: 'application/json', body: Buffer.from(JSON.stringify(after, null, 2)),
  });
  return after;
}

export async function choose(page, raw = '0.4') {
  await page.locator('#labSubstance').fill('LH');
  await page.locator('#labSubstanceDropdown [data-id="lh"]').click();
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labUnitTarget').selectOption('IU/L');
  await page.locator('#labValue').fill(raw);
  await expect(chart(page)).toBeVisible();
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
  await page.evaluate(() => window.VildaVault.createUser('E2e#FictionalLHInfantTail!2026', {
    label: 'Fikcyjny sejf późnego niemowlęctwa LH', iterations: 10000,
  }));
}

// DOB supplies possible completed days [days-1,days]. The graph conservatively
// encloses elapsed time as [days-1,days+1), using its existing365.25-day year.
// Exact-day renderer checks remain separate; no birth time is invented.
export async function mainPatient(page, { days = 300, ga = 40, gnrhaStatus = '', origin = '' } = {}) {
  await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
  await dismiss(page);
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady() && window.VildaDobAge
    && window.VildaLabNeonatalContext && window.applyLoadedData
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await czekajNaOdtworzenieSesji(page);
  await page.waitForFunction(() => {
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return !window.__vildaPersistRestoring && !window.VildaPersistence.isAutosaveSuppressed()
      && !window.VildaDataImportExport.isMainSessionAutosavePaused() && !window.VildaDobAge.restorePending() && (!state
      || !state.hasPendingSaveTimer && !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer);
  });
  const id = await page.evaluate(async ({ ga, gnrhaStatus }) => {
    const user = { name: 'Fikcyjny Pacjent Ogonka LH', firstName: 'Pacjent Ogonka LH', lastName: 'Fikcyjny',
      sex: 'M', age: 0, ageMonths: 9, weight: 8, height: 70 };
    const saved = await window.VildaVault.savePatient({ name: user.name, user,
      perinatal: { gestationalWeeks: ga, gestationalDays: 0 }, puberty: { gnrhaStatus } }, { dedup: false });
    return saved.patientId;
  }, { ga, gnrhaStatus });
  const beforeLoad = await page.evaluate(() => {
    const shared = window.VildaPersistence.readShared() || {};
    return { currentId: sessionStorage.getItem('vildaCurrentPatientId'), patient: window.VildaSession.getPatient(),
      shared: { name: shared.name, fullName: shared.fullName, sex: shared.sex, age: shared.age, ageMonths: shared.ageMonths } };
  });
  // Use the same visible patient-card Load/New-measurement sequence as the
  // real picker. It publishes the selected person's name and identity itself.
  await loadPatient(page, id, 'new');
  const afterLoad = await waitPatientReady(page, id, 'after-patient-modal', { inputComplete: false });
  await test.info().attach('LH-infant-real-patient-load', { contentType: 'application/json',
    body: Buffer.from(JSON.stringify({ workflow: 'patient-card-visible-load-and-new-measurement', beforeLoad, afterLoad }, null, 2)) });
  const birth = await page.evaluate(days => {
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
    return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
  }, days);
  await page.locator('#dobInput').fill(birth);
  await page.locator('#dobInput').dispatchEvent('change');
  await expect.poll(() => page.evaluate(() => window.VildaLabNeonatalContext.readCache()?.postnatalDays))
    .toEqual({ lower: days - 1, upper: days, source: 'main-calendar-dates' });
  await expect.poll(() => page.evaluate(id => window.VildaLabNeonatalContext.read(
    window.VildaPersistence.readShared(), id, window.VildaPubertySource.kontekstPacjenta(id),
    { includeMinipuberty: true, includeInfantLhTail: true },
  )?.postnatalDays, id)).toEqual({ lower: days - 1, upper: days, source: 'main-calendar-dates' });
  await page.evaluate(() => {
    window.vildaPersistFlushNow?.({ force: true });
    window.VildaDataImportExport.saveMainSessionNow();
  });
  await waitPatientReady(page, id, 'before-navigation');
  await page.goto(`${origin}/przelicznik-jednostek.html`, { waitUntil: 'load' });
  await ready(page);
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  await waitPatientReady(page, id, 'converter-patient');
  return id;
}

export async function geometry(page) {
  return chart(page).locator('[data-stable-reference-line="lh"]').evaluate(line => ({
    d: line.getAttribute('d'), viewBox: line.ownerSVGElement.getAttribute('viewBox'),
    divisor: line.getAttribute('data-divisor'), ceiling: line.getAttribute('data-ceiling'),
  }));
}

export async function expectNumeric(page, value, reference, { approximate = true } = {}) {
  await expect(point(page)).toHaveCount(1);
  await expect(point(page)).toHaveAttribute('data-profile', 'busch2022-male-lh');
  await expect(point(page)).toHaveAttribute('data-value', String(value));
  await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value'))).toBeCloseTo(reference, 6);
  await expect(point(page).locator('[data-median-point]')).toHaveCount(1);
  await expect(point(page).locator('line')).toHaveCount(1);
  if (approximate) {
    await expect(point(page)).toHaveAttribute('data-reference-policy', 'male-lh-infant-tail-model-median');
    await expect(chart(page).locator('[data-lifespan="scale-note"]'))
      .toContainText('Przybliżona mediana modelu Busch 2022');
    await expect(point(page).locator('[data-dot-label="median"]')).toContainText('≈');
  } else expect(await point(page).getAttribute('data-reference-policy')).toBeNull();
}

export async function expectResultOnly(page, value, policy = 'male-lh-infant-tail-result-only') {
  await expect(point(page)).toHaveCount(1);
  await expect(point(page)).toHaveAttribute('data-result-only', 'true');
  await expect(point(page)).toHaveAttribute('data-result-only-policy', policy);
  await expect(point(page)).toHaveAttribute('data-value', String(value));
  for (const attribute of ['data-median', 'data-profile', 'data-reference-value', 'data-reference-statistic', 'data-ratio']) {
    expect(await point(page).getAttribute(attribute)).toBeNull();
  }
  await expect(point(page).locator('line')).toHaveCount(0);
  await expect(chart(page).locator('[data-median-point], [data-dot-label="median"]')).toHaveCount(0);
}

export async function fits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

export async function exactDay(page, id, days, overrides = {}) {
  // Call the public production renderer with explicitly exact current-context
  // input. Do not rewrite neonatal caches or pretend a DOB records birth time.
  await page.evaluate(({ id, days, overrides }) => window.VildaHormoneLifespanRuntime.update({
    analyte: 'lh', sex: 'male', ageYears: days / 365.25, ageUpperYears: days / 365.25,
    ageUpperInclusive: true, sourceStatus: 'ready', identityKey: id, currentIdentityKey: id,
    infantLhContextAvailable: true, childhoodLhContextAvailable: true,
    contextBasis: 'current-patient', preterm: 'no', specimen: 'unknown',
    measurement: { value: .4, unit: 'IU/L', operator: '=' }, displayUnit: 'IU/L', ...overrides,
  }), { id, days, overrides });
}
