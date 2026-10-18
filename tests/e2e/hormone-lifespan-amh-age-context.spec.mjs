import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/test-czas.mjs';
import { kliknij } from '../support/uklad-czekanie.mjs';

// Real form, fictional saved identities and their explicitly supplied gestation.
// Do not inject neonatal cache, replace the age adapter or infer term birth.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration="amh"]');
const profiles = { F: 'ljubicic2022-female-amh', M: 'busch2022-male-amh' };

async function prepare(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (const state of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${state}-v1`, `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaHormoneLifespanRuntime));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
  await page.evaluate(() => window.VildaVault.createUser('E2e#AmhAge!2026', { label: 'Fikcyjny sejf wieku AMH', iterations: 10000 }));
}

async function mainForm(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady() && window.VildaDobAge && window.VildaLabNeonatalContext
    && typeof window.applyLoadedData === 'function' && !document.documentElement.classList.contains('vilda-auth-locked')
    && window.VildaInit?.isInitialized('app:main-session-restore-init'));
  // Main-session restoration starts two animation frames after its initializer.
  // Empty autosave queues before that callback do not mean the form is ready.
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await page.waitForFunction(() => {
    const persistence = window.VildaPersistence;
    const session = window.VildaDataImportExport;
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return persistence && !persistence.isAutosaveSuppressed() && session && !session.isMainSessionAutosavePaused()
      && !window.VildaDobAge.restorePending() && state && !state.hasPendingSaveTimer
      && !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer;
  });
}

async function mainPatient(page, { sex = 'F', days = 120, months = 3, ga = 40 } = {}) {
  await mainForm(page);
  const id = await page.evaluate(async ({ sex, months, ga }) => {
    const user = { name: 'Fikcyjny Pacjent wieku AMH', lastName: 'Fikcyjny', firstName: 'Pacjent wieku AMH',
      sex, age: 0, ageMonths: months, weight: 5.5, height: 60 };
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {},
      perinatal: { gestationalWeeks: ga, gestationalDays: 0 } }, { dedup: false });
    const record = await window.VildaVault.getPatient(saved.patientId);
    window.applyLoadedData(record.snapshots[0].payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: {
      patientId: saved.patientId, savedAtISO: record.snapshots[0].savedAtISO, snapshotCount: 1, source: 'pick',
    } }));
    return saved.patientId;
  }, { sex, months, ga });
  await expect(page.locator('#vildaLcmNew')).toBeVisible();
  await page.locator('#vildaLcmNew').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  if (days !== null) {
    const birth = await page.evaluate(days => {
      const now = new Date(), date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
      return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
    }, days);
    await page.locator('#dobInput').fill(birth);
    await page.locator('#dobInput').dispatchEvent('change');
    await expect.poll(() => page.evaluate(() => window.VildaLabNeonatalContext.readCache()?.postnatalDays))
      .toEqual({ lower: days - 1, upper: days, source: 'main-calendar-dates' });
  } else {
    await page.locator('#age').fill('0');
    await page.locator('#ageMonths').fill(String(months));
    await page.locator('#ageMonths').dispatchEvent('change');
    await expect.poll(() => page.evaluate(() => window.VildaLabNeonatalContext.readCache())).toBeNull();
  }
  await expect.poll(() => page.evaluate(() => {
    const shared = window.VildaPersistence.readShared();
    return ['age', 'ageMonths', 'weight', 'height'].every(key => String(shared[key]) === document.getElementById(key).value);
  })).toBe(true);
  // The day cache and shared fields can precede the separate main-session
  // writer. Wait for that existing channel before navigating away from this setup.
  const expectedSession = await page.evaluate(({ id, calendarDays }) => ({
    patientId: id, cachePatientId: calendarDays ? id : null,
    sex: document.getElementById('sex').value,
    age: document.getElementById('age').value,
    ageMonths: document.getElementById('ageMonths').value,
    dobISO: window.VildaDobAge.readISO(),
  }), { id, calendarDays: days !== null });
  await expect.poll(() => page.evaluate(calendarDays => {
    const user = window.VildaPersistence.readMainSession()?.user;
    return user && {
      patientId: sessionStorage.getItem('vildaCurrentPatientId'),
      cachePatientId: calendarDays ? window.VildaLabNeonatalContext.readCache()?.identityKey ?? null : null,
      sex: user.sex, age: String(user.age), ageMonths: String(user.ageMonths), dobISO: user.dobISO ?? null,
    };
  }, days !== null)).toEqual(expectedSession);
  await converter(page, id);
  return id;
}

async function converter(page, id) {
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaHormoneLifespanRuntime);
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  // Observe the production adapter without replacing any of its decisions.
  await page.evaluate(() => {
    const update = window.VildaHormoneLifespanRuntime.update;
    window.VildaHormoneLifespanRuntime.update = context => {
      window.amhAgeContext = structuredClone(context);
      return update(context);
    };
  });
}

async function choose(page, raw = '2') {
  await page.locator('#labSubstance').fill('AMH');
  await page.locator('#labSubstanceDropdown [data-id="amh"]').click();
  await page.locator('#labUnit').selectOption('ng/mL');
  await page.locator('#labValue').fill(raw);
  await expect(panel(page)).toBeVisible();
}

async function expectAgePoint(page, sex, lower, upper, label, comparison = false) {
  await expect.poll(() => page.evaluate(() => window.amhAgeContext)).toMatchObject({
    sex: sex === 'F' ? 'female' : 'male', ageYears: lower, ageUpperYears: upper,
    ageUpperInclusive: false, ageLabel: label, preterm: 'no', sourceStatus: 'ready',
  });
  await expect(point(page)).toHaveAttribute('data-profile', profiles[sex]);
  await expect(point(page)).toHaveAttribute('data-age-lower', String(lower));
  await expect(point(page)).toHaveAttribute('data-age-upper', String(upper));
  // The compact chart abbreviates labels into months; its numerical marker
  // must still represent the precise day-based age supplied by the adapter.
  const marker = comparison ? 'data-comparison-age-marker' : 'data-patient-age-marker';
  await expect(panel(page).locator(`[${marker}]`)).toHaveAttribute(marker, String(lower));
  const source = await page.evaluate(() => {
    const data = window.VildaHormoneLifespanData, engine = window.VildaHormoneLifespanReference;
    const selected = engine.selectProfile(data, window.amhAgeContext);
    if (selected.status !== 'ready') throw new Error(`Unexpected source status ${selected.status}`);
    return { reference: engine.referenceAt(selected.profile, window.amhAgeContext.ageYears),
      ngFactor: 1 / data.patientPointData.unitConversions.amh.factors['ng/mL'] };
  });
  await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value')))
    .toBeCloseTo(source.reference * (comparison ? source.ngFactor : 1), 8);
  await expect(point(page).locator('[data-median-point]')).toHaveCount(1);
  await expect(point(page).locator('[data-result-point]')).toHaveCount(1);
}

async function capture(page, name) {
  const directory = process.env.VILDA_AMH_AGE_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await panel(page).screenshot({ path: join(directory, `${name}.png`) });
  await writeFile(join(directory, `${name}.json`), JSON.stringify(await page.evaluate(() => ({
    context: window.amhAgeContext, cache: window.VildaLabNeonatalContext.readCache(),
    shared: window.VildaPersistence.readShared(), runtime: window.VildaHormoneLifespanRuntime.getState(),
  })), null, 2));
}

for (const [sex, width] of [['F', 1440], ['M', 320]]) {
  test(`${sex} AMH uses main-form 119–120 days in both ordinary views and comparison at ${width}px`, async ({ page }) => {
    await prepare(page, width);
    await mainPatient(page, { sex });
    await choose(page);
    await expect(page.locator('#labRangeBlock .lab-range-card')).toBeVisible();
    await expect(page.locator('#labRangeBlock .lab-range-title')).toHaveText('Zakres dla wieku');
    const originalShared = await page.evaluate(() => window.VildaPersistence.readShared());
    for (const view of ['life', 'mini']) {
      await panel(page).locator(`[data-view="${view}"]`).click();
      await expectAgePoint(page, sex, 119 / 366, 121 / 365, '119–120 dni');
      await capture(page, `${sex}-${width}-${view}`);
    }
    await panel(page).locator('.vhl-compare-toggle').click();
    await expectAgePoint(page, sex, 119 / 366, 121 / 365, '119–120 dni', true);
    await expect(panel(page).locator('[data-comparison-curve="amh"]')).toHaveCount(2);
    await panel(page).locator('.vhl-compare-toggle').click();
    // A deliberate local age remains authoritative over borrowed calendar days.
    await page.locator('#labPatientToggle').click();
    await page.locator('#labOverrideAge').fill('0');
    await page.locator('#labOverrideAgeMonths').fill('6');
    await expectAgePoint(page, sex, .5, 7 / 12, '6 mies.');
    await page.locator('#labOverrideAgeMonths').fill('');
    await page.locator('#labOverrideAge').fill('');
    await expectAgePoint(page, sex, 119 / 366, 121 / 365, '119–120 dni');
    expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(originalShared);
    await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test('AMH keeps a genuine month-only main-form age without inventing postnatal days', async ({ page }) => {
  await prepare(page);
  await mainPatient(page, { days: null, months: 3 });
  await choose(page);
  await expectAgePoint(page, 'F', .25, 4 / 12, '3 mies.');
  expect(await page.evaluate(() => window.VildaLabNeonatalContext.readCache())).toBeNull();
});

test('clearing the same patient date removes cached AMH day precision', async ({ page }) => {
  await prepare(page);
  const id = await mainPatient(page);
  await choose(page);
  await expectAgePoint(page, 'F', 119 / 366, 121 / 365, '119–120 dni');
  await mainForm(page);
  await expect(page.locator('#dobClear')).toBeVisible();
  const months = Number(await page.locator('#ageMonths').inputValue());
  expect(months).toBeGreaterThan(0);
  expect(months).toBeLessThan(6);
  await kliknij(page.locator('#dobClear'));
  await expect(page.locator('#dobInput')).toHaveValue('');
  await expect(page.locator('#ageMonths')).toHaveValue(String(months));
  // Clearing the date itself must notify the age cache and the session writer.
  // No unrelated measurement edit may be needed to remove day precision.
  await expect.poll(() => page.evaluate(() => window.VildaLabNeonatalContext.readCache())).toBeNull();
  await expect.poll(() => page.evaluate(() => String(window.VildaPersistence.readShared()?.ageMonths))).toBe(String(months));
  await expect.poll(() => page.evaluate(() => {
    const user = window.VildaPersistence.readMainSession()?.user;
    return user && { dobISO: user.dobISO ?? null, ageMonths: String(user.ageMonths) };
  })).toEqual({ dobISO: null, ageMonths: String(months) });
  await mainForm(page);
  await expect(page.locator('#dobInput')).toHaveValue('');
  await expect(page.locator('#ageMonths')).toHaveValue(String(months));
  await expect.poll(() => page.evaluate(() => window.VildaLabNeonatalContext.readCache())).toBeNull();
  await converter(page, id);
  await choose(page);
  await expectAgePoint(page, 'F', months / 12, months / 12 + 1 / 12, `${months} mies.`);
});

test('switching fictional identities clears the result and cannot borrow the first patient day cache or term status', async ({ page }) => {
  await prepare(page);
  await mainPatient(page);
  await choose(page);
  await expectAgePoint(page, 'F', 119 / 366, 121 / 365, '119–120 dni');
  const nextId = await page.evaluate(async () => {
    const user = { name: 'Fikcyjna Druga Pacjentka AMH', sex: 'F', age: 0, ageMonths: 4 };
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    window.VildaPersistence.writeShared(user, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  });
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, nextId)).toBe('ready');
  await expect(page.locator('#labValue')).toHaveValue('');
  await expect(point(page)).toHaveCount(0);
  await page.locator('#labValue').fill('2');
  await expect.poll(() => page.evaluate(() => window.amhAgeContext)).toMatchObject({
    identityKey: nextId, ageYears: 4 / 12,
    ageLabel: '4 mies.', preterm: 'unknown', sourceStatus: 'ready',
  });
  await expect.poll(() => page.evaluate(() => window.amhAgeContext.ageUpperYears)).toBeCloseTo(5 / 12, 14);
  await expect(point(page)).toHaveCount(0);
});

test('known GA32 keeps the AMH conversion but excludes term-infant source ranges and the source point', async ({ page }) => {
  await prepare(page);
  await mainPatient(page, { ga: 32 });
  await choose(page);
  await page.locator('#labUnitTarget').selectOption('pmol/L');
  await expect.poll(() => page.evaluate(() => window.amhAgeContext)).toMatchObject({
    ageYears: 119 / 366, ageUpperYears: 121 / 365,
    ageLabel: '119–120 dni', preterm: 'yes', sourceStatus: 'ready',
  });
  await expect(page.locator('#labResultBig .lab-result-big-value')).toBeVisible();
  await expect(page.locator('#labResultBig')).toContainText('pmol/L');
  await expect(page.locator('#labRangeBlock .lab-range-empty')).toHaveText('Brak zakresu AMH dla wcześniaka w 1. roku życia.');
  await expect(page.locator('#labRangeBlock .lab-range-card')).toHaveCount(0);
  await expect(point(page)).toHaveCount(0);
  for (const view of ['life', 'mini']) {
    await panel(page).locator(`[data-view="${view}"]`).click();
    await expect(point(page)).toHaveCount(0);
    await expect(panel(page).locator('[data-lifespan="scale-note"]'))
      .toContainText('Te dane dotyczą niemowląt urodzonych o czasie; brak dopasowanego odniesienia dla wyniku.');
  }
  await capture(page, 'preterm-GA32-120days');
});
