import { expect, test } from '../support/test-czas.mjs';
import { quickFill, quickSelect, closePatientEditor } from '../support/lab-puberty-quick.mjs';

// The diagram consumes the production converter's current context. All people
// below are fictional; no mock context API substitutes for the form or vault.
test.use({ serviceWorkers: 'block' });

const chart = (page) => page.locator('#labHormoneLifespan');
const ageMarker = (page) => chart(page).locator('[data-patient-age-marker]');
const names = { lh: 'LH', fsh: 'FSH', inhibin_b: 'Inhibina B', amh: 'AMH', estradiol: 'Estradiol', cortisol: 'Kortyzol' };

async function open(page, patient) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime && window.VildaHormoneLifespanRuntime));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  if (patient) await page.evaluate((data) => {
    if (!window.VildaPersistence.writeShared(data, { force: true })) throw new Error('Cannot seed fictional diagram context');
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, patient);
}

async function choose(page, analyte) {
  await page.locator('#labSubstance').fill(names[analyte]);
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
}

async function expectAge(page, years) {
  await expect(ageMarker(page)).toHaveCount(1);
  await expect.poll(async () => Number(await ageMarker(page).getAttribute('data-patient-age-marker'))).toBeCloseTo(years, 6);
}

test('unknown context never becomes a fictional patient and local LH edits determine the diagram', async ({ page }) => {
  await open(page);
  await choose(page, 'lh');
  await expect(chart(page)).toBeHidden();
  await quickSelect(page, 'Sex', 'F');
  await expect(chart(page)).toBeVisible();
  await expect(ageMarker(page)).toHaveCount(0);
  await quickFill(page, 'AgeYears', '0');
  await quickFill(page, 'AgeMonths', '3');
  await quickSelect(page, 'Preterm', 'no');
  await closePatientEditor(page);
  await expectAge(page, 0.25);
  await expect(chart(page).locator('[data-hormone="lh"]')).toHaveAttribute('aria-pressed', 'true');
  await quickSelect(page, 'Preterm', 'yes');
  await expect(ageMarker(page)).toHaveCount(0);
  await page.locator('#labClearBtn').click();
  await expect(chart(page)).toBeHidden();
  await expect(ageMarker(page)).toHaveCount(0);
});

test('diagram controls do not change the clinical assessment, entered result or shared patient data', async ({ page }) => {
  await open(page, { name: 'Fikcyjna pacjentka wykresu', sex: 'F', age: 0, ageMonths: 4 });
  await choose(page, 'inhibin_b');
  await page.locator('#labValue').fill('80');
  await quickSelect(page, 'Preterm', 'no');
  await closePatientEditor(page);
  const before = await page.evaluate(() => ({
    shared: window.VildaPersistence.readShared(),
    assessment: window.VildaLabPubertyRuntime.getAssessment(),
  }));
  await expectAge(page, 4 / 12);
  await chart(page).locator('[data-hormone="amh"]').click();
  await chart(page).locator('[data-hormone="e2"]').click();
  await chart(page).locator('[data-view="mini"]').click();
  await expectAge(page, 4 / 12);
  await chart(page).locator('[data-view="life"]').click();
  await expect(page.locator('#labValue')).toHaveValue('80');
  const after = await page.evaluate(() => ({
    shared: window.VildaPersistence.readShared(),
    assessment: window.VildaLabPubertyRuntime.getAssessment(),
  }));
  expect(after).toEqual(before);
});

test('legacy AMH uses the current local age, unknown age has no adult marker and analyte changes reset selection', async ({ page }) => {
  await open(page, { name: 'Fikcyjna pacjentka bez wieku', sex: 'F' });
  await choose(page, 'amh');
  await expect(chart(page)).toBeVisible();
  await expect(ageMarker(page)).toHaveCount(0);
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideAge').fill('12');
  await page.locator('#labOverrideAgeMonths').fill('6');
  await expectAge(page, 12.5);
  await chart(page).locator('[data-hormone="fsh"]').click();
  await choose(page, 'estradiol');
  await expect(chart(page).locator('[data-hormone][aria-pressed="true"]')).toHaveCount(1);
  await expect(chart(page).locator('[data-hormone="e2"]')).toHaveAttribute('aria-pressed', 'true');
  await expectAge(page, 12.5);
  await choose(page, 'cortisol');
  await expect(chart(page)).toBeHidden();
  await expect(ageMarker(page)).toHaveCount(0);
});

test('a real patient switch clears legacy overrides, a same-patient refresh preserves them, and vault lock clears the diagram', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#LifeChart!2026', { label: 'Fikcyjny sejf wykresu', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI && window.VildaHormoneLifespanRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  const people = await page.evaluate(async () => {
    const list = [];
    for (const user of [
      { name: 'Fikcyjna osoba wykresu A', sex: 'F', age: 30, ageMonths: 0 },
      { name: 'Fikcyjna osoba wykresu B', sex: 'M', age: 8, ageMonths: 0 },
    ]) {
      const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {},
        perinatal: { gestationalWeeks: 32, gestationalDays: 2 } }, { dedup: false });
      list.push({ id: saved.patientId, user });
    }
    return list;
  });
  async function loadPerson(person) {
    await page.evaluate(({ id, user }) => {
      window._vildaCurrentPatientId = id;
      sessionStorage.setItem('vildaCurrentPatientId', id);
      window.VildaPersistence.writeShared(user, { force: true });
      document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id } }));
    }, person);
    await expect.poll(() => page.evaluate((id) => window.VildaPubertySource.kontekstPacjenta(id).status, person.id)).toBe('ready');
  }
  await loadPerson(people[0]);
  await choose(page, 'amh');
  await expectAge(page, 30);
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideAge').fill('16');
  await page.locator('#labOverrideSex').selectOption('M');
  await expectAge(page, 16);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:session-changed')));
  await expect(page.locator('#labOverrideAge')).toHaveValue('16');
  await expectAge(page, 16);
  await loadPerson(people[1]);
  await expect(page.locator('#labOverrideAge')).toHaveValue('');
  await expect(page.locator('#labOverrideSex')).toHaveValue('');
  await expectAge(page, 8);
  // A known preterm birth remains relevant even when a local selector is
  // contradicted. The clinical form and patient record themselves are unchanged.
  await page.evaluate((person) => {
    window.VildaPersistence.writeShared({ ...person.user, age: 0, ageMonths: 4 }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, people[1]);
  await choose(page, 'lh');
  await quickSelect(page, 'Preterm', 'no');
  await expect.poll(() => page.evaluate(() => window.VildaHormoneLifespanRuntime.getState().preterm)).toBe('yes');
  await expect(ageMarker(page)).toHaveCount(0);
  await page.evaluate(() => window.VildaVault.lock());
  await expect(chart(page)).toBeHidden();
  await expect(ageMarker(page)).toHaveCount(0);
});

async function infantPeakHeights(page) {
  return chart(page).locator('[data-lifespan="chart"]').evaluate((svg) => {
    const sector = svg.querySelector('[data-sector]');
    const top = Number(sector.getAttribute('y'));
    const height = Number(sector.getAttribute('height'));
    const bottom = top + height;
    return Object.fromEntries(['e2', 'amh', 'inhb'].map((hormone) => {
      const paths = [...svg.querySelectorAll(`[data-line="${hormone}"]`)]
        .filter((path) => !path.hasAttribute('data-age-to') || Number(path.dataset.ageTo) <= 1);
      if (!paths.length) throw new Error(`Missing infant curve: ${hormone}`);
      let peak = 0;
      for (const path of paths) {
        const length = path.getTotalLength();
        for (let i = 0; i <= 1000; i += 1) {
          peak = Math.max(peak, (bottom - path.getPointAtLength(length * i / 1000).y) / height);
        }
      }
      return [hormone, peak];
    }));
  });
}

test('life and minipuberty preserve relative female peak heights and result editing preserves manual view and selection', async ({ page }) => {
  await open(page, { name: 'Fikcyjna pacjentka skali', sex: 'F', age: 0, ageMonths: 4 });
  await choose(page, 'amh');
  await chart(page).locator('[data-hormone="inhb"]').click();
  await chart(page).locator('[data-hormone="e2"]').click();
  const life = await infantPeakHeights(page);
  await chart(page).locator('[data-view="mini"]').click();
  const mini = await infantPeakHeights(page);
  for (const hormone of ['e2', 'amh', 'inhb']) expect(Math.abs(life[hormone] - mini[hormone])).toBeLessThan(0.002);
  expect(mini.e2).toBeGreaterThan(0.08);
  expect(mini.e2).toBeLessThan(0.1);
  expect(mini.amh).toBeGreaterThan(0.6);
  expect(mini.amh).toBeLessThan(0.7);
  expect(mini.inhb).toBeGreaterThan(0.99);
  await page.locator('#labValue').fill('2');
  await expect(chart(page).locator('[data-view="mini"]')).toHaveAttribute('aria-pressed', 'true');
  expect((await page.evaluate(() => window.VildaHormoneLifespanRuntime.getState())).selected.sort()).toEqual(['amh', 'e2', 'inhb']);
  expect(await infantPeakHeights(page)).toEqual(mini);
  await choose(page, 'estradiol');
  await expect(chart(page).locator('[data-view="life"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(chart(page).locator('[data-hormone][aria-pressed="true"]')).toHaveCount(1);
  await expect(chart(page).locator('[data-hormone="e2"]')).toHaveAttribute('aria-pressed', 'true');
});

test('stage highlight moves in the same SVG, reduced motion is immediate, and the separate E2 cycle belongs only to the adult view', async ({ page }) => {
  await open(page, { name: 'Fikcyjna dorosła pacjentka cyklu', sex: 'F', age: 30, ageMonths: 0 });
  await choose(page, 'estradiol');
  const cycle = chart(page).locator('[data-lifespan="cycle-panel"]');
  await expect(cycle).toBeVisible();
  await expect(cycle.locator('[data-cycle-curve="e2"]')).toHaveCount(1);
  const moving = await chart(page).evaluate(async (host) => {
    const svg = host.querySelector('[data-lifespan="chart"]');
    const frame = svg.querySelector('[data-sector-highlight]');
    const start = Number(frame.getAttribute('x'));
    const target = Number(svg.querySelector('[data-sector="0"]').getAttribute('x')) + 0.8;
    host.querySelector('button[data-stage="0"]').click();
    const immediate = Number(frame.getAttribute('x'));
    await new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
    return { sameSvg: svg === host.querySelector('[data-lifespan="chart"]'),
      sameFrame: frame === svg.querySelector('[data-sector-highlight]'), start, target, immediate,
      intermediate: Number(frame.getAttribute('x')) };
  });
  expect(moving.sameSvg).toBe(true);
  expect(moving.sameFrame).toBe(true);
  expect(moving.immediate).toBe(moving.start);
  expect(moving.intermediate).toBeLessThan(moving.start);
  expect(moving.intermediate).toBeGreaterThan(moving.target);
  await expect.poll(async () => Number(await chart(page).locator('[data-sector-highlight]').getAttribute('x'))).toBeCloseTo(moving.target, 4);
  await expect(cycle).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await chart(page).evaluate((host) => {
    const svg = host.querySelector('[data-lifespan="chart"]');
    const frame = svg.querySelector('[data-sector-highlight]');
    const target = Number(svg.querySelector('[data-sector="3"]').getAttribute('x')) + 0.8;
    host.querySelector('button[data-stage="3"]').click();
    return { sameFrame: frame === svg.querySelector('[data-sector-highlight]'), x: Number(frame.getAttribute('x')), target };
  });
  expect(reduced.sameFrame).toBe(true);
  expect(reduced.x).toBeCloseTo(reduced.target, 4);
  await expect(cycle).toBeVisible();
  await chart(page).locator('[data-view="mini"]').click();
  await expect(cycle).toBeHidden();
});
