import { expect } from './test-czas.mjs';
import { closePatientEditor, quickFill } from './lab-puberty-quick.mjs';
import { initializeStorage } from './insl3-age-source.mjs';

// Fictional current-form contexts only. The module, data bundle, parser,
// converter, laboratory assessment and UI all remain the production ones.
export const host = page => page.locator('#labFemaleTtAge');
export const card = page => host(page).locator('.vilda-female-tt-age');
export const median = page => card(page).locator('[data-female-tt-age="median"]');
export const sources = page => card(page).locator('[data-female-tt-age="sources"]');
export const curve = page => card(page).locator('[data-female-tt-age-curve="source"]');
export const patientPoint = page => card(page).locator('[data-female-tt-age-marker="patient"]');
export const sourcePoint = page => card(page).locator('[data-female-tt-age-marker="source"]');
export const overflowPoint = page => card(page).locator('[data-female-tt-age-marker="overflow"]');
export const runtimeState = page => page.evaluate(() => window.VildaFemaleTTAgeRuntime.getState());

export { initializeStorage };

export async function ready(page, { vault = false } = {}) {
  await page.waitForFunction(vault => window.VildaFemaleTTAgeRuntime && window.VildaFemaleTTAge
    && window.VildaLabPubertyRuntime && (!vault || window.VildaVault?.isUnlocked())
    && !document.documentElement.classList.contains('vilda-auth-locked'), vault);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
}

export async function setCurrentPatient(page, { age = 12, months = '', sex = 'F' } = {}) {
  await page.evaluate(({ age, months, sex }) => {
    if (!window.VildaPersistence.writeShared({ name: 'Fikcyjna Osoba TT wieku E2E', sex, age, ageMonths: months }, { force: true })) {
      throw new Error('Cannot load fictional female TT context');
    }
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, { age, months, sex });
}

export async function loadPatient(page, { age = 12, months = 0, sex = 'F', gnrhaStatus = '' } = {}) {
  const id = await page.evaluate(async ({ age, months, sex, gnrhaStatus }) => {
    const user = { name: 'Fikcyjna Osoba TT wieku E2E', sex, age, ageMonths: months };
    const saved = await window.VildaVault.savePatient({ name: user.name, user,
      puberty: gnrhaStatus ? { gnrhaStatus } : {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot load fictional TT patient');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, { age, months, sex, gnrhaStatus });
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  return id;
}

export async function choose(page, raw = '0,65', unit = 'nmol/L', target = unit, analyte = 'testosterone_total') {
  await page.locator('#labSubstance').fill(analyte === 'testosterone_total' ? 'Testosteron' : 'LH');
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  await page.locator('#labUnit').selectOption(analyte === 'testosterone_total' ? unit : 'IU/L');
  await page.locator('#labUnitTarget').selectOption(analyte === 'testosterone_total' ? target : 'IU/L');
  await page.locator('#labValue').fill(raw);
}

export async function prepare(page, { width = 1440, vault = false, age = 12, months = 0, sex = 'F' } = {}) {
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
    await page.evaluate(() => window.VildaVault.createUser('E2e#FictionalFemaleTtAge!2026', {
      label: 'Fikcyjny sejf TT dziewcząt według wieku', iterations: 10000,
    }));
    await page.reload({ waitUntil: 'load' });
  }
  await ready(page, { vault });
  const id = vault ? await loadPatient(page, { age, months, sex }) : null;
  if (!vault) await setCurrentPatient(page, { age, months, sex });
  await choose(page);
  return id;
}

export async function setQuickAge(page, age, months = '') {
  await quickFill(page, 'AgeYears', String(age));
  await quickFill(page, 'AgeMonths', String(months));
  await closePatientEditor(page);
}

export async function expectMedian(page, expected = 0.42502815745885664) {
  // Native fullscreen takes the visible card out of its host's layout, so
  // the host can have a zero-sized rectangle while the card is on screen.
  await expect(card(page)).toBeVisible();
  await expect.poll(async () => Number(await median(page).getAttribute('data-source-value'))).toBeCloseTo(expected, 11);
  await expect(median(page)).toHaveAttribute('data-source-unit', 'nmol/L');
  await expect(curve(page)).toHaveCount(1);
  await expect(sourcePoint(page)).toHaveCount(1);
  await expect(card(page)).toContainText(/Madsen/);
}

export async function expectNoPatientPoint(page) {
  await expect(patientPoint(page)).toHaveCount(0);
  await expect(overflowPoint(page)).toHaveCount(0);
}

export async function expectNoMedian(page, { hidden = false } = {}) {
  if (hidden) await expect(host(page)).toBeHidden();
  else await expect(host(page)).toBeVisible();
  await expect(host(page).locator('[data-source-value]')).toHaveCount(0);
  await expect(curve(page)).toHaveCount(0);
  await expect(sourcePoint(page)).toHaveCount(0);
  await expectNoPatientPoint(page);
}

export async function geometry(page) {
  return curve(page).evaluateAll(paths => paths.map(path => ({
    d: path.getAttribute('d'), viewBox: path.ownerSVGElement.getAttribute('viewBox'),
    sourceTicks: [...path.ownerSVGElement.querySelectorAll('[data-female-tt-age-axis="y"]')]
      .map(tick => tick.getAttribute('data-source-axis-value')),
  })));
}

export async function laboratoryFacts(page) {
  return page.evaluate(() => {
    const result = window.VildaLabPubertyRuntime.getAssessment()?.evaluation;
    const comparison = result?.referencePreview?.byAge || result?.biochemical?.byAge;
    return { status: comparison?.status, bounds: comparison?.range?.bounds, provenance: result?.provenance,
      clinical: result?.clinical, biochemical: result?.biochemical };
  });
}

export async function expectFits(page) {
  expect(await host(page).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const axis = card(page).locator('[data-female-tt-age-axis="y"]').first();
  if (await axis.count()) {
    // A large minimum SVG viewBox can fit the card while shrinking 10px axis
    // labels to unreadable text. Measure the rendered scale, not only overflow.
    const labelSize = await axis.evaluate(node => {
      const svg = node.ownerSVGElement;
      return parseFloat(getComputedStyle(node).fontSize)
        * svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    });
    expect(labelSize).toBeGreaterThanOrEqual(9.5);
  }
}
