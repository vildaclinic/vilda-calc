import { expect } from './test-czas.mjs';
import { initializeStorage } from './insl3-age-source.mjs';

// Fictional current-form contexts. E2 keeps the legacy converter's controls
// and laboratory assessment; only the new source-age card has these hooks.
export const host = page => page.locator('#labMaleE2Age');
// The iOS fallback moves this same card into a dialog, outside its host.
export const card = page => page.locator('.vilda-male-e2-age');
export const median = page => card(page).locator('[data-male-e2-age="median"]');
export const sources = page => card(page).locator('[data-male-e2-age="sources"]');
export const curve = page => card(page).locator('[data-male-e2-age-curve="source"]');
export const patientPoint = page => card(page).locator('[data-male-e2-age-marker="patient"]');
export const sourcePoint = page => card(page).locator('[data-male-e2-age-marker="source"]');
export const overflowPoint = page => card(page).locator('[data-male-e2-age-marker="overflow"]');
export const runtimeState = page => page.evaluate(() => window.VildaMaleE2AgeRuntime.getState());
export { initializeStorage };

export async function ready(page, { vault = false } = {}) {
  await page.waitForFunction(vault => window.VildaMaleE2AgeRuntime && window.VildaMaleE2Age
    && window.LabUnitConverter && (!vault || window.VildaVault?.isUnlocked())
    && !document.documentElement.classList.contains('vilda-auth-locked'), vault);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
}

export async function setCurrentPatient(page, { age = 12, months = '', sex = 'M' } = {}) {
  await page.evaluate(({ age, months, sex }) => {
    if (!window.VildaPersistence.writeShared({ name: 'Fikcyjna Osoba E2 wieku E2E', sex, age, ageMonths: months }, { force: true })) {
      throw new Error('Cannot load the fictional male E2 current context');
    }
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, { age, months, sex });
}

export async function loadPatient(page, { age = 12, months = 0, sex = 'M', gnrhaStatus = '' } = {}) {
  const id = await page.evaluate(async ({ age, months, sex, gnrhaStatus }) => {
    const user = { name: 'Fikcyjna Osoba E2 wieku E2E', sex, age, ageMonths: months };
    const saved = await window.VildaVault.savePatient({ name: user.name, user,
      puberty: gnrhaStatus ? { gnrhaStatus } : {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot load the fictional E2 patient');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, { age, months, sex, gnrhaStatus });
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  return id;
}

export async function choose(page, raw = '20', unit = 'pmol/L', target = unit, analyte = 'estradiol') {
  const label = { estradiol: 'Estradiol', lh: 'LH', testosterone_total: 'Testosteron' }[analyte];
  await page.locator('#labSubstance').fill(label || analyte);
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  const selectedUnit = analyte === 'lh' ? 'IU/L' : unit;
  await page.locator('#labUnit').selectOption(selectedUnit);
  await page.locator('#labUnitTarget').selectOption(analyte === 'lh' ? 'IU/L' : target);
  await page.locator('#labValue').fill(raw);
}

export async function prepare(page, { width = 1440, vault = false, age = 12, months = 0, sex = 'M' } = {}) {
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
    await page.evaluate(() => window.VildaVault.createUser('E2e#FictionalMaleE2Age!2026', {
      label: 'Fikcyjny sejf E2 chłopców według wieku', iterations: 10000,
    }));
    await page.reload({ waitUntil: 'load' });
  }
  await ready(page, { vault });
  const id = vault ? await loadPatient(page, { age, months, sex }) : null;
  if (!vault) await setCurrentPatient(page, { age, months, sex });
  await choose(page);
  return id;
}

async function openPatientEditor(page) {
  if (await page.locator('#labPatientOverride').isHidden()) await page.locator('#labPatientToggle').click();
  await expect(page.locator('#labPatientOverride')).toBeVisible();
}

export async function setQuickAge(page, age, months = '') {
  await openPatientEditor(page);
  await page.locator('#labOverrideAge').fill(String(age));
  await page.locator('#labOverrideAgeMonths').fill(String(months));
  await page.locator('#labPatientToggle').click();
}

export async function setQuickSex(page, sex) {
  await openPatientEditor(page);
  await page.locator('#labOverrideSex').selectOption(sex);
  await page.locator('#labPatientToggle').click();
}

export async function expectMedian(page, expected = 6.129050070456699) {
  // A native fullscreen card is taken out of its host's box geometry.
  await expect(card(page)).toBeVisible();
  await expect.poll(async () => Number(await median(page).getAttribute('data-source-value'))).toBeCloseTo(expected, 11);
  await expect(median(page)).toHaveAttribute('data-source-unit', 'pmol/L');
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
  return card(page).locator('[data-male-e2-age-curve]').evaluateAll(paths => paths.map(path => ({
    kind: path.getAttribute('data-male-e2-age-curve'), d: path.getAttribute('d'),
    viewBox: path.ownerSVGElement.getAttribute('viewBox'),
    sourceTicks: [...path.ownerSVGElement.querySelectorAll('[data-male-e2-age-axis="y"]')]
      .map(tick => tick.getAttribute('data-source-axis-value')),
  })));
}

export async function laboratoryFacts(page) {
  return page.evaluate(() => ({
    range: document.getElementById('labRangeBlock').textContent,
    meta: document.getElementById('labMeta').textContent,
    status: document.getElementById('labResultStatus').textContent,
    source: document.getElementById('labResultSourceLine').textContent,
    value: document.querySelector('#labResultBig .lab-result-big-value')?.textContent,
    unit: document.querySelector('#labResultBig .lab-result-big-unit')?.textContent,
  }));
}

export async function expectFits(page) {
  expect(await host(page).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const axis = card(page).locator('[data-male-e2-age-axis="y"]').first();
  if (await axis.count()) {
    const labelSize = await axis.evaluate(node => {
      const svg = node.ownerSVGElement;
      return parseFloat(getComputedStyle(node).fontSize)
        * svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    });
    expect(labelSize).toBeGreaterThanOrEqual(9.5);
  }
}
