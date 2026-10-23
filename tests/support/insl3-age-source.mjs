import { expect } from '@playwright/test';
import { closePatientEditor, quickFill } from './lab-puberty-quick.mjs';

// All patients in these tests are fictional. Values are read from the real
// converter/chart integration; no source data or reader result is stubbed.
export const chart = page => page.locator('.vilda-hormone-lifespan');
export const sources = page => chart(page).locator('details.vhl-sources');
export const source = page => chart(page).locator('[data-lifespan="insl3-age-source"]');
export const sourceValue = page => source(page).locator('[data-insl3-age="value"]');
export const insl3Line = page => chart(page).locator('[data-line="insl3"]');

export async function initializeStorage(page) {
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date();
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    for (const state of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${state}-v1`, `${day}|${Date.now()}`);
  });
}

export async function awaitConverter(page) {
  await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaHormoneLifespanRuntime && window.VildaInsl3AgeSource);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
}

export async function setCurrentPatient(page, { age = 25, months = '', sex = 'M' } = {}) {
  await page.evaluate(({ age, months, sex }) => {
    if (!window.VildaPersistence.writeShared({ name: 'Fikcyjna Osoba E2E Źródła', sex, age, ageMonths: months }, { force: true }))
      throw new Error('Cannot load the fictional INSL3 context');
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, { age, months, sex });
}

export async function loadVaultPatient(page, { age = 25, months = '', sex = 'M' } = {}) {
  const id = await page.evaluate(async ({ age, months, sex }) => {
    const user = { name: 'Fikcyjna Osoba E2E Źródła', sex, age, ageMonths: months };
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot load the fictional INSL3 patient');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, { age, months, sex });
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  return id;
}

export async function chooseLh(page, raw = '') {
  await page.locator('#labSubstance').fill('LH');
  await page.locator('#labSubstanceDropdown [data-id="lh"]').click();
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labUnitTarget').selectOption('IU/L');
  await page.locator('#labValue').fill(raw);
  await expect(chart(page)).toBeVisible();
}

export async function selectInsl3(page) {
  const toggle = chart(page).locator('[data-hormone="insl3"]');
  if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click();
  await expect(insl3Line(page)).toBeVisible();
}

export async function openSources(page) {
  if (!await sources(page).evaluate(node => node.open)) await sources(page).locator('summary').click();
  await expect(sources(page)).toHaveAttribute('open', '');
}

export async function setQuickAge(page, age, months = '') {
  await quickFill(page, 'AgeYears', String(age));
  await quickFill(page, 'AgeMonths', String(months));
  await closePatientEditor(page);
}

export async function prepareConverter(page, { age = 25, months = '', sex = 'M', width = 1440, vault = false } = {}) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await initializeStorage(page);
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  if (vault) {
    await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
    await page.waitForFunction(() => window.VildaVault);
    await page.evaluate(() => window.VildaVault.createUser('E2e#FictionalInsl3!2026', {
      label: 'Fikcyjny sejf INSL3 E2E', iterations: 10000,
    }));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault?.isUnlocked() && !document.documentElement.classList.contains('vilda-auth-locked'));
  }
  await awaitConverter(page);
  const id = vault ? await loadVaultPatient(page, { age, months, sex }) : null;
  if (!vault) await setCurrentPatient(page, { age, months, sex });
  await chooseLh(page);
  return id;
}

export async function expectValue(page, value) {
  await expect(source(page)).toHaveAttribute('data-read-status', 'ready');
  await expect(sourceValue(page)).toContainText(new RegExp(`≈\\s*${value.replace('.', '[,.]')}\\s*ng/mL`, 'i'));
  await expect(sourceValue(page)).not.toContainText(/[–—]/);
}

export async function expectUnavailable(page) {
  await expect(source(page)).toHaveAttribute('data-read-status', 'unavailable');
  await expect(sourceValue(page)).toHaveCount(0);
  await expect(source(page).locator('[data-insl3-age="reason"]')).not.toBeEmpty();
}

export async function geometry(page) {
  return insl3Line(page).evaluateAll(paths => paths.map(path => ({
    d: path.getAttribute('d'), dash: path.getAttribute('stroke-dasharray'),
    divisor: path.getAttribute('data-divisor'), ceiling: path.getAttribute('data-ceiling'),
    viewBox: path.ownerSVGElement.getAttribute('viewBox'),
  })));
}

export async function expectNoInsl3Point(page) {
  await expect(chart(page).locator('[data-patient-concentration="insl3"], [data-reference-line="insl3"], [data-reference-background="insl3"]')).toHaveCount(0);
}

export async function expectFits(page) {
  expect(await source(page).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
