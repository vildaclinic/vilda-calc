import { expect, test } from '@playwright/test';
import { createFictionalVault, shellFrame } from '../support/centile-live-fixture.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

// Fikcyjny sejf, rzeczywiste przyciski i natywny zegar. W powłoce picker
// Klirensu należy do Startu; samodzielny Klirens ma własny picker i Restore.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', actionTimeout: 15_000 });
test.setTimeout(240_000);

async function settled(owner) {
  await owner.waitForFunction(() => window.VildaVault?.isUnlocked()
    && window.VildaAuthUI?.isBootReady?.()
    && typeof window.collectUserData === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await czekajNaOdtworzenieSesji(owner);
  await owner.waitForFunction(() => !window.__vildaPersistRestoring
    && !window.VildaDobAge?.restorePending?.()
    && !window.VildaDataImportExport?.isMainSessionRestorePending?.()
    && Number(window.__vildaPersistPauseUntil || 0) <= Date.now());
  await owner.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function observed(owner) {
  return owner.evaluate(() => {
    const indicator = window.VildaSaveStatusIndicator;
    return {
      path: location.pathname,
      state: indicator?.getState(),
      reference: indicator?.getReferenceFingerprint(),
      current: indicator?._computeCanonicalFingerprint(),
      patientId: sessionStorage.getItem('vildaCurrentPatientId'),
      choice: sessionStorage.getItem('vildaLoadChoiceV1'),
      main: window.VildaPersistence?.readMainSession(),
      clcr: window.VildaPersistence?.readClcrSession?.(),
      shared: window.VildaPersistence?.readShared?.(),
      domUser: Object.fromEntries(['height', 'weight', 'dobInput', 'age', 'ageMonths']
        .map(id => [id, document.getElementById(id)?.value])),
      loadedUser: window.lastLoadedData?.user,
    };
  });
}

function unownedInputs(payload) {
  return {
    intakePal: payload.intake?.pal,
    plan: payload.plan,
    bp: payload.bp,
    respiratory: payload.respiratory,
    adultVitals: payload.adultVitals,
  };
}

function measurementTuple(row) {
  return { ageMonths: Number(row.ageMonths), height: Number(row.height), weight: Number(row.weight) };
}

async function expectSaved(page, owner, { original, patientId, choice, reference, full, blank, archive, label }) {
  try {
    await settled(owner);
    await expect.poll(async () => {
      const state = await observed(owner);
      return {
        state: state.state, patientId: state.patientId,
        equal: Boolean(state.reference) && state.reference === state.current,
      };
    }, { timeout: 15_000, message: label }).toEqual({ state: 'saved', patientId, equal: true });
    const state = await observed(owner);
    expect(state.choice, `${label}: zachowany wybór wizyty`).toBe(choice);
    if (reference) expect(state.reference, `${label}: niezmieniona baza`).toBe(reference);
    expect(state.main.user.dobISO, `${label}: DOB aktualnego pacjenta`).toBe(original.user.dobISO);
    if (full) {
      expect(unownedInputs(state.main), `${label}: zachowane wejścia nieobecne w Klirensie`)
        .toEqual(unownedInputs(original));
    }
    if (blank) {
      expect(state.main.user.height, `${label}: brak nowego wzrostu`).toBeNull();
      expect(state.main.user.weight, `${label}: brak nowej masy`).toBeNull();
      expect(state.main.user.measuredAtISO ?? null, `${label}: brak daty nowego pomiaru`).toBeNull();
      await expect(owner.locator('#height')).toHaveValue('');
      await expect(owner.locator('#weight')).toHaveValue('');
    } else {
      expect(state.main.user, `${label}: odtworzony pomiar`).toMatchObject({
        height: original.user.height, weight: original.user.weight,
        measuredAtISO: original.user.measuredAtISO,
      });
      await expect(owner.locator('#height')).toHaveValue(String(original.user.height));
      await expect(owner.locator('#weight')).toHaveValue(String(original.user.weight));
    }
    const history = (state.main.advanced?.data?.measurements || []).map(measurementTuple);
    const originalHistory = (original.advanced?.data?.measurements || []).map(measurementTuple);
    expect(history, `${label}: zachowana historia źródłowa`).toEqual(expect.arrayContaining(originalHistory));
    if (choice === 'restore') {
      expect(history, `${label}: odtworzenie nie dopisuje nowej wizyty`).toEqual(originalHistory);
    }
    if (archive) {
      const previous = {
        ageMonths: original.user.age * 12 + (original.user.ageMonths || 0),
        height: original.user.height, weight: original.user.weight,
      };
      expect(history.filter(row => JSON.stringify(row) === JSON.stringify(previous)),
        `${label}: poprzedni pomiar zarchiwizowany raz`).toHaveLength(1);
    }
    const basicHistory = (original.growthBasic?.data?.measurements || []).map(measurementTuple);
    if (basicHistory.length) {
      expect((state.main.growthBasic?.data?.measurements || []).map(measurementTuple),
        `${label}: zachowana podstawowa historia`).toEqual(expect.arrayContaining(basicHistory));
    }
    await expect(page.locator('#vildaPatientChip')).toHaveClass(/vilda-save-state--saved(?:\s|$)/u);
    await expect(page.locator('#vildaPatientChip')).toHaveAttribute('title', /Dane pacjenta zapisane/u);
    return state;
  } catch (error) {
    await test.info().attach(`klirens-origin-${label}`, {
      body: JSON.stringify({ original, actual: await observed(owner) }, null, 2),
      contentType: 'application/json',
    });
    throw error;
  }
}

async function saveFullPatientOnStart(start) {
  await start.evaluate(() => window.clearAllData());
  await start.waitForFunction(() => !window.__vildaPersistRestoring
    && Date.now() > Number(window.__vildaPersistClearUntil || 0));
  for (const [id, value] of Object.entries({
    lastName: 'Fikcyjny', firstName: 'Celina Zapis Start',
    age: '13', ageMonths: '0', weight: '75', height: '158',
  })) await start.locator(`#${id}`).fill(value);
  await start.locator('#dobInput').fill('17-06-2013');
  await start.locator('#dobInput').blur();
  if (!await start.locator('#resultsModeToggle').isChecked()) {
    await start.locator('#resultsModeToggleContainer .switch').click();
    await expect(start.locator('#resultsModeToggle')).toBeChecked();
  }
  await start.locator('#toggleAdvancedGrowth').click();
  await start.locator('#advMotherHeight').fill('165');
  await start.locator('#advFatherHeight').fill('180');
  let row = start.locator('#advMeasurements .measure-row').last();
  if (await row.count() === 0) {
    await start.locator('#advAddMeasurementBtn').click();
    row = start.locator('#advMeasurements .measure-row').last();
  }
  for (const [selector, value] of Object.entries({
    '.adv-age-years': '10', '.adv-age-months': '0', '.adv-height': '141', '.adv-weight': '33',
  })) await row.locator(selector).fill(value);
  await row.locator('.adv-weight').blur();
  await start.locator('[data-journey="pal"][data-key="1.8"]').click();
  await expect(start.locator('#palFactor')).toHaveValue('1.8');
  if (!await start.locator('#intakeCard').isVisible()) await start.locator('#toggleIntakeCard').click();
  await start.locator('#intakePal').selectOption('1.8');
  for (const [id, value] of Object.entries({
    heartRate: '82', hrTemperature: '37.2', bpSystolic: '118', bpDiastolic: '74',
    respiratoryRateInput: '18', respTemperature: '37.1',
  })) await start.locator(`#${id}`).fill(value);
  await start.locator('#hrPopulation').selectOption('hospital');
  await start.locator('#respState').selectOption('sleep');
  await start.locator('#respPopulation').selectOption('hospital');
  await start.locator('#respPopulation').blur();
  await start.evaluate(() => window.saveUserData());
  await start.waitForFunction(() => Boolean(sessionStorage.getItem('vildaCurrentPatientId'))
    && window.VildaSaveStatusIndicator?.getState() === 'saved');
  const result = await start.evaluate(async () => {
    const patientId = sessionStorage.getItem('vildaCurrentPatientId');
    const record = await window.VildaVault.getPatient(patientId);
    return { patientId, original: record.snapshots[0].payload, snapshotCount: record.snapshots.length };
  });
  expect(result.original).toMatchObject({
    intake: { pal: '1.8' }, plan: { palFactor: 1.8, palWybrany: true },
    bp: { heartRate: 82, temperature: 37.2, population: 'hospital', systolic: 118, diastolic: 74 },
    respiratory: { rate: 18, temperature: 37.1, state: 'sleep', population: 'hospital' },
  });
  return result;
}

async function seed(page, { shell, full }) {
  const fixture = await createFictionalVault(page, { shell });
  let saved;
  if (full) saved = await saveFullPatientOnStart(fixture.frame);
  else {
    const legacy = JSON.parse(JSON.stringify(fixture.patients.a));
    legacy.name = 'Fikcyjny Cezary Klirens Legacy';
    legacy.user.firstName = 'Cezary Klirens Legacy';
    legacy.user.weight = 75;
    legacy.advanced.name = legacy.name;
    legacy.advanced.data.name = legacy.name;
    legacy.advanced.data.currentWeight = 75;
    expect(legacy).not.toHaveProperty('plan');
    expect(legacy).not.toHaveProperty('intake');
    saved = await fixture.frame.evaluate(async payload => {
      const patientId = (await window.VildaVault.savePatient(payload, { dedup: false })).patientId;
      const record = await window.VildaVault.getPatient(patientId);
      return { patientId, original: record.snapshots[0].payload, snapshotCount: record.snapshots.length };
    }, legacy);
  }
  return { ...fixture, ...saved };
}

async function pickVisibleCard(owner, name, patientId, choice) {
  await owner.locator('.pt-rcard2').filter({ hasText: name }).first().click();
  await owner.getByRole('button', { name: 'Wczytaj tego pacjenta', exact: true }).click();
  await owner.waitForFunction(({ id, withChoice }) => Boolean(document.querySelector('.vug-backdrop'))
    || Boolean(document.getElementById('vildaLoadChoiceModal'))
    || (!withChoice && sessionStorage.getItem('vildaCurrentPatientId') === id),
  { id: patientId, withChoice: Boolean(choice) });
  const guard = owner.locator('.vug-backdrop');
  if (await guard.isVisible()) {
    const reload = guard.getByRole('button', { name: 'Wczytaj ponownie', exact: true });
    if (await reload.isVisible()) await reload.click();
    else await guard.getByRole('button', { name: /^Odrzuć .*wczytaj$/u }).click();
  }
  if (choice) {
    await expect(owner.locator('#vildaLoadChoiceModal')).toBeVisible();
    await owner.locator(choice === 'restore' ? '#vildaLcmRestore' : '#vildaLcmNew').click();
  }
  await expect.poll(() => owner.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(patientId);
  await settled(owner);
}

async function nativePick(owner, name, patientId) {
  await owner.locator('#clcrChoosePatientBtn').click();
  await pickVisibleCard(owner, name, patientId);
  await expect(owner.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  if (!await owner.locator('#restoreStateBtn').isVisible()) {
    const expand = owner.locator('#clcrIdentityBar [data-ident-act="toggle"]');
    if (await expand.isVisible()) await expand.click();
  }
  await expect(owner.locator('#restoreStateBtn')).toBeVisible();
}

async function reloadStart(page, shell) {
  await page.reload({ waitUntil: 'load' });
  const owner = shell ? await shellFrame(page, 'Start') : page;
  await settled(owner);
  return owner;
}

async function expectVaultUnchanged(owner, patientId, original, snapshotCount) {
  const record = await owner.evaluate(id => window.VildaVault.getPatient(id), patientId);
  expect(record.snapshots, 'nawigacja nie tworzy nowej wersji w sejfie').toHaveLength(snapshotCount);
  expect(record.snapshots[0].payload, 'nawigacja nie zmienia zapisu w sejfie').toEqual(original);
}

for (const full of [true, false]) {
  test(`powłoka, picker Klirensu na Starcie: ${full ? 'pełny C restore' : 'legacy C new'} zachowuje dane i status`, async ({ page }) => {
    const fixture = await seed(page, { shell: true, full });
    const { patientId, original } = fixture;
    const choice = full ? 'restore' : 'new';
    const options = { patientId, original, full, choice, blank: !full, archive: !full };
    await page.evaluate(() => window.VildaShell.navigate('klirens'));
    let owner = await shellFrame(page, 'Kalkulator klirensu');
    await settled(owner);
    await owner.locator('#clcrChoosePatientBtn').click();
    await expect(page).toHaveURL(/\/app\.html#\/start/u);
    owner = await shellFrame(page, 'Start');
    await settled(owner);
    await pickVisibleCard(owner, original.user.firstName, patientId, choice);
    await expect(page).toHaveURL(/\/app\.html#\/start/u);
    const baseline = await expectSaved(page, owner, { ...options, label: 'shell-picker-Start' });
    const reference = baseline.reference;

    // Wybór pozostawia użytkownika na Starcie; powrót do Klirensu jest jawny.
    await page.evaluate(() => window.VildaShell.navigate('klirens'));
    owner = await shellFrame(page, 'Kalkulator klirensu');
    await expectSaved(page, owner, { ...options, reference, label: 'shell-return-Klirens' });
    await page.evaluate(() => window.VildaShell.navigate('start'));
    owner = await shellFrame(page, 'Start');
    await expectSaved(page, owner, { ...options, reference, label: 'shell-return-Start' });
    owner = await reloadStart(page, true);
    await expectSaved(page, owner, { ...options, reference, label: 'shell-F5' });
    await expectVaultUnchanged(owner, patientId, original, fixture.snapshotCount);
  });

  test(`samodzielny Klirens, ${full ? 'pełny C' : 'legacy C'}: domyślne wczytanie i istniejący Restore zachowują dane po Start/F5`, async ({ page }) => {
    const fixture = await seed(page, { shell: false, full });
    const { patientId, original } = fixture;
    await page.goto('/kalkulator-klirens.html', { waitUntil: 'load' });
    await settled(page);
    await nativePick(page, fixture.patients.b.user.firstName, fixture.ids.b);
    await nativePick(page, original.user.firstName, patientId);
    const initial = await observed(page);
    const options = { patientId, original, full, choice: initial.choice, blank: true };
    // Klirens nie oferuje modala NEW. Domyślny import zostawia puste bieżące
    // pomiary; wymagamy zachowania historii, bez dopisywania mu wyboru wizyty.
    let baseline = await expectSaved(page, page, { ...options, label: 'native-default' });
    let reference = baseline.reference;
    await page.goto('/index.html', { waitUntil: 'load' });
    await expectSaved(page, page, { ...options, reference, label: 'native-default-Start' });
    await reloadStart(page, false);
    await expectSaved(page, page, { ...options, reference, label: 'native-default-F5' });

    await page.goto('/kalkulator-klirens.html', { waitUntil: 'load' });
    await settled(page);
    await nativePick(page, fixture.patients.b.user.firstName, fixture.ids.b);
    await nativePick(page, original.user.firstName, patientId);
    const confirmation = page.waitForEvent('dialog');
    const restoreClick = page.locator('#restoreStateBtn').click();
    const dialog = await confirmation;
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('Czy na pewno chcesz przywrócić zapisany stan?');
    await dialog.accept();
    await restoreClick;
    const restored = { patientId, original, full, choice: 'restore', blank: false };
    baseline = await expectSaved(page, page, { ...restored, label: 'native-Restore' });
    reference = baseline.reference;
    await page.goto('/index.html', { waitUntil: 'load' });
    await expectSaved(page, page, { ...restored, reference, label: 'native-Restore-Start' });
    await reloadStart(page, false);
    await expectSaved(page, page, { ...restored, reference, label: 'native-Restore-F5' });
    await expectVaultUnchanged(page, patientId, original, fixture.snapshotCount);
  });
}
