import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

// Prawdziwy zapis ze Startu, fikcyjny sejf i natywny zegar. DocPro nie ma
// części kontrolek Startu; brak kontrolki nie może usuwać danych pacjenta.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', actionTimeout: 15_000 });
test.setTimeout(150_000);

async function settled(owner) {
  await owner.waitForFunction(() => window.VildaVault?.isUnlocked()
    && window.VildaAuthUI?.isBootReady?.()
    && typeof window.collectUserData === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await czekajNaOdtworzenieSesji(owner);
  await owner.waitForFunction(() => !window.__vildaPersistRestoring
    && !window.VildaDobAge?.restorePending?.()
    && !window.VildaDataImportExport?.isMainSessionRestorePending?.()
    && (!/\/docpro\.html$/u.test(location.pathname)
      || (window.VildaDocproStatePersistence?.isReady?.() === true
        && window.VildaDocproStatePersistence.isRestoring() === false)));
  await owner.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function observed(owner) {
  return owner.evaluate(() => {
    const indicator = window.VildaSaveStatusIndicator;
    return {
      state: indicator?.getState(),
      reference: indicator?.getReferenceFingerprint(),
      current: indicator?._computeCanonicalFingerprint(),
      patientId: sessionStorage.getItem('vildaCurrentPatientId'),
      choice: sessionStorage.getItem('vildaLoadChoiceV1'),
      main: window.VildaPersistence?.readMainSession(),
      shared: window.VildaPersistence?.readShared?.(),
      domUser: Object.fromEntries(['height', 'weight', 'dobInput', 'age', 'ageMonths']
        .map(id => [id, document.getElementById(id)?.value])),
      loadedUser: window.lastLoadedData?.user,
    };
  });
}

// Dane, których odpowiednich kontrolek nie ma w DocPro. Porównujemy wartości
// faktycznie zapisane przez lekarza, również inne niż domyślne ustawienia UI.
function unownedInputs(payload) {
  return {
    intakePal: payload.intake?.pal,
    planPal: payload.plan?.palFactor,
    planPalSelected: payload.plan?.palWybrany,
    heartRate: payload.bp?.heartRate,
    heartTemperature: payload.bp?.temperature,
    heartPopulation: payload.bp?.population,
    respiratory: payload.respiratory,
    adultGuideline: payload.adultVitals?.guideline,
  };
}

function measurementTuple(row) {
  return { ageMonths: Number(row.ageMonths), height: Number(row.height), weight: Number(row.weight) };
}

async function expectSaved(page, owner, { patientId, reference, original, choice, label, compareUnowned = true }) {
  try {
    await expect.poll(async () => {
      const state = await observed(owner);
      return {
        state: state.state, patientId: state.patientId,
        hasReference: typeof state.reference === 'string' && state.reference.length > 0,
        equal: state.reference === state.current,
      };
    }, { message: label, timeout: 15_000 }).toEqual({
      state: 'saved', patientId, hasReference: true, equal: true,
    });
    const state = await observed(owner);
    expect(state.choice, `${label}: zachowany wybór wizyty`).toBe(choice);
    if (reference) expect(state.reference, `${label}: ta sama baza po nawigacji`).toBe(reference);
    if (compareUnowned) {
      expect(unownedInputs(state.main), `${label}: zachowane wejścia spoza DocPro`)
        .toEqual(unownedInputs(original));
    }
    expect(state.main.user.dobISO, `${label}: DOB pacjenta C, nie wcześniejszego B`)
      .toBe(original.user.dobISO);
    if (choice === 'new') {
      expect(state.main.user.height, `${label}: nowy pomiar bez wzrostu`).toBeNull();
      expect(state.main.user.weight, `${label}: nowy pomiar bez masy`).toBeNull();
      expect(state.main.user.measuredAtISO ?? null, `${label}: brak daty nowego pomiaru`).toBeNull();
      await expect(owner.locator('#height')).toHaveValue('');
      await expect(owner.locator('#weight')).toHaveValue('');
      const previous = {
        ageMonths: Number(original.user.age) * 12 + Number(original.user.ageMonths || 0),
        height: original.user.height, weight: original.user.weight,
      };
      const history = (state.main.advanced?.data?.measurements || []).map(measurementTuple);
      expect(history, `${label}: poprzedni pomiar zarchiwizowany raz`)
        .toEqual(expect.arrayContaining([previous, { ageMonths: 120, height: 141, weight: 33 }]));
      expect(history.filter(row => JSON.stringify(row) === JSON.stringify(previous))).toHaveLength(1);
    } else {
      expect(state.main.user, `${label}: odtworzony pomiar`).toMatchObject({
        height: original.user.height, weight: original.user.weight,
        measuredAtISO: original.user.measuredAtISO,
      });
    }
    await expect(page.locator('#vildaPatientChip')).toHaveClass(/vilda-save-state--saved(?:\s|$)/u);
    await expect(page.locator('#vildaPatientChip')).toHaveAttribute('title', /Dane pacjenta zapisane/u);
    return state.reference;
  } catch (error) {
    await test.info().attach(`origin-${label}`, {
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
    return { patientId, original: record.snapshots[0].payload };
  });
  expect(unownedInputs(result.original)).toMatchObject({
    intakePal: '1.8', planPal: 1.8, planPalSelected: true,
    heartRate: 82, heartTemperature: 37.2, heartPopulation: 'hospital',
    respiratory: { rate: 18, temperature: 37.1, state: 'sleep', population: 'hospital' },
  });
  return result;
}

for (const choice of ['restore', 'new']) {
  test(`zapis Start → DocPro B → C (${choice}) → Start → F5 zachowuje wejścia i stan zapisany`, async ({ page }) => {
    const fixture = await createFictionalVault(page, { shell: true });
    const { patientId, original } = await saveFullPatientOnStart(fixture.frame);
    expect(patientId).not.toBe(fixture.ids.b);
    await page.evaluate(() => window.VildaShell.navigate('docpro'));
    let owner = await shellFrame(page, 'DocPro');
    await settled(owner);
    const professional = owner.locator('#professionalConfirmBtn');
    if (await professional.isVisible()) await professional.click();
    await loadPatient(owner, fixture.ids.b, 'restore', { clear: true });
    await settled(owner);
    await loadPatient(owner, patientId, choice);
    await settled(owner);
    const reference = await expectSaved(page, owner, {
      patientId, original, choice, label: `DocPro-${choice}`,
    });

    await page.evaluate(() => window.VildaShell.navigate('start'));
    owner = await shellFrame(page, 'Start');
    await settled(owner);
    await expectSaved(page, owner, { patientId, original, choice, reference, label: `Start-${choice}` });

    // Żadne collectUserData/readyForPatient pomiędzy nawigacją a F5: odczyty
    // powyżej są bez efektów ubocznych, a reload uruchamia prawdziwy flush sesji.
    await page.reload({ waitUntil: 'load' });
    owner = await shellFrame(page, 'Start');
    await settled(owner);
    await expectSaved(page, owner, { patientId, original, choice, reference, label: `F5-${choice}` });
    const saved = await owner.evaluate(async id => (await window.VildaVault.getPatient(id)).snapshots[0].payload, patientId);
    expect(saved, 'nawigacja i odtworzenie nie zapisują nowej migawki pacjenta').toEqual(original);
  });
}

test('stary zapis bez PAL: nowy pomiar z DocPro pozostaje zapisany po Start i F5', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: true });
  const legacy = JSON.parse(JSON.stringify(fixture.patients.a));
  legacy.name = 'Fikcyjny Cezary Stary Zapis';
  legacy.advanced.name = legacy.name;
  legacy.advanced.data.name = legacy.name;
  legacy.user.firstName = 'Cezary Stary Zapis';
  legacy.user.weight = 75;
  legacy.advanced.data.currentWeight = 75;
  expect(legacy).not.toHaveProperty('plan');
  expect(legacy).not.toHaveProperty('intake');
  const { patientId, original } = await fixture.frame.evaluate(async payload => {
    const id = (await window.VildaVault.savePatient(payload, { dedup: false })).patientId;
    return { patientId: id, original: (await window.VildaVault.getPatient(id)).snapshots[0].payload };
  }, legacy);

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  let owner = await shellFrame(page, 'DocPro');
  await settled(owner);
  const professional = owner.locator('#professionalConfirmBtn');
  if (await professional.isVisible()) await professional.click();
  await loadPatient(owner, fixture.ids.b, 'restore', { clear: true });
  await settled(owner);
  await loadPatient(owner, patientId, 'new');
  await settled(owner);
  const options = { patientId, original, choice: 'new', compareUnowned: false };
  const reference = await expectSaved(page, owner, { ...options, label: 'legacy-DocPro-new' });
  const baseline = await observed(owner);
  expect(Number.isFinite(baseline.main.plan?.palFactor), 'domyślny PAL z rzeczywistego API aplikacji').toBe(true);

  await page.evaluate(() => window.VildaShell.navigate('start'));
  owner = await shellFrame(page, 'Start');
  await settled(owner);
  await expectSaved(page, owner, { ...options, reference, label: 'legacy-Start-new' });
  await expect(owner.locator('#palFactor')).toHaveValue(String(baseline.main.plan.palFactor));
  await expect(owner.locator('#intakePal')).toHaveValue(String(baseline.main.intake.pal));

  await page.reload({ waitUntil: 'load' });
  owner = await shellFrame(page, 'Start');
  await settled(owner);
  await expectSaved(page, owner, { ...options, reference, label: 'legacy-F5-new' });
  const after = await observed(owner);
  expect(after.main.plan.palFactor).toBe(baseline.main.plan.palFactor);
  expect(after.main.intake.pal).toBe(baseline.main.intake.pal);
  const saved = await owner.evaluate(async id => (await window.VildaVault.getPatient(id)).snapshots[0].payload, patientId);
  expect(saved, 'stary rekord pozostaje niezmieniony po odtworzeniu nowej wizyty').toEqual(original);
});
