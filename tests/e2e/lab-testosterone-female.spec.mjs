import { expect, test } from '../support/test-czas.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';
import { quickSelect, quickFill, closePatientEditor, expectAutomaticReference } from '../support/lab-puberty-quick.mjs';

test.use({ serviceWorkers: 'block' });
const patient = (changes = {}) => ({ name: 'Fikcyjna pacjentka testosteronu', sex: 'F', age: 15, ageMonths: 0, ...changes });
const host = page => page.locator('#labPubertyAssessment .vilda-lab-assessment');
const age = page => host(page).locator('[data-comparison="age"]');
const axis = page => age(page).locator('.vilda-lab-axis');
const recorded = page => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());
const references = result => result.referencePreview || result.biochemical;

async function prepare(page) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date();
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${day}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${day}|${Date.now()}`);
  });
}

async function guest(page) {
  for (const button of [page.locator('#consent-decline'), page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true })]) {
    if (await button.isVisible()) await button.click();
  }
}

async function open(page, data = patient()) {
  await prepare(page);
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaLabTestosteroneData);
  await guest(page);
  if (data) await page.evaluate(user => {
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Nie zapisano fikcyjnej pacjentki');
    window.dispatchEvent(new Event('focus'));
  }, data);
}

async function choose(page, value = '30', unit = 'ng/dL', target = 'ng/dL') {
  await page.locator('#labSubstance').fill('Testosteron');
  await page.locator('#labSubstanceDropdown [data-id="testosterone_total"]').click();
  await page.locator('#labUnit').selectOption(unit);
  await page.locator('#labUnitTarget').selectOption(target);
  await page.locator('#labValue').fill(value);
}

async function bounds(page, lower, upper) {
  await expect(axis(page)).toHaveCount(1);
  if (lower === null) await expect(axis(page)).toHaveAttribute('data-range-lower', 'unknown');
  else await expect.poll(async () => Number(await axis(page).getAttribute('data-range-lower'))).toBeCloseTo(lower, 7);
  await expect.poll(async () => Number(await axis(page).getAttribute('data-range-upper'))).toBeCloseTo(upper, 7);
}

async function noStage(page) {
  await expect(host(page).locator('[data-comparison="stage"] .vilda-lab-axis')).toHaveCount(0);
  await expect(page.locator('#labPubertyRefineStage')).toBeHidden();
  await expect(page.locator('#labPubertySharedEditor')).toBeHidden();
  const result = (await recorded(page)).evaluation;
  expect(references(result).byStage.status).toBe('unavailable');
  expect(references(result).byStage.reasonCodes).toContain('female_stage_reference_not_established');
}

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

async function mainToLab(page, { years = 15, th = 3, pubic = 5, gnrha = '' } = {}) {
  await prepare(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await guest(page);
  await page.waitForFunction(() => window.VildaPubertyAssessmentState && window.VildaPubertyAssessmentUI);
  await czekajNaOdtworzenieSesji(page);
  await guest(page);
  await page.waitForFunction(() => !window.__vildaPersistRestoring && !window.VildaPersistence.isClearInProgress()
    && !(Number(window.__vildaPersistClearUntil || 0) > Date.now()));
  await page.locator('#sex').selectOption('F');
  await page.locator('#age').fill(String(years));
  await page.locator('#ageMonths').fill('0');
  if (th || pubic || gnrha) await page.locator('#tannerToggleBtn').click();
  if (th) await page.locator(`#pubertyAssessmentEditor .vpa-segments [data-puberty-axis="Th"][data-puberty-stage="${th}"]`).click();
  if (pubic) await page.locator(`#pubertyAssessmentEditor .vpa-segments [data-puberty-axis="P"][data-puberty-stage="${pubic}"]`).click();
  if (gnrha) {
    await page.locator('#pubertyOptionalDetails > summary').click();
    await page.locator('#pubertyGnrhaStatus').selectOption(gnrha);
  }
  if (th || pubic) await expect.poll(() => page.evaluate(() => {
    const state = window.VildaPubertyAssessmentState.read().assessment?.observations;
    return { th: state?.Th?.stage, pubic: state?.P?.stage };
  })).toEqual({ th, pubic });
  await page.evaluate(() => {
    window.vildaPersistFlushNow?.({ force: true });
    window.VildaDataImportExport.saveMainSessionNow();
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaLabTestosteroneData);
}

test('F15 Th3 i osobne P5 z formularza głównego dają źródłową oś wieku bez niepotwierdzonej osi Th', async ({ page }) => {
  await mainToLab(page);
  await choose(page, '2,4', 'nmol/L', 'nmol/L');
  await expectAutomaticReference(page);
  await bounds(page, null, 2.60025);
  await expect(age(page)).toHaveAttribute('data-status', 'within');
  await noStage(page);
  const result = (await recorded(page)).evaluation;
  expect(result.input).toMatchObject({ sex: 'F', age: { years: 15, months: 0 }, puberty: { kind: 'Th', stage: 3 } });
  expect(result.provenance.profileId).toBe('mayo-ttst-female');
  expect(result.provenance.sourceIds).toContain('mayo-ttst-8533-female');
  await expect(page.locator('#labResultBig')).toContainText('2,4');
  await expect(page.locator('#labInfoCard')).toBeHidden();
  await host(page).getByText('Szczegóły i źródła', { exact: true }).click();
  await expect(host(page)).toContainText(/LC-MS\/MS/);
  await expect(host(page).locator('a[href*="mayocliniclabs.com/test-catalog/Overview/8533"]')).not.toHaveCount(0);
  await expect(host(page)).not.toContainText(/praktycznie pewny guz|rozpoznaniu hipogonadyzmu/i);
});

test('F8 Th2 i znane leczenie GnRHa przechodzą Start → Lab i blokują zakres bez nowej ankiety', async ({ page }) => {
  await mainToLab(page, { years: 8, th: 2, pubic: 1, gnrha: 'w-trakcie' });
  await choose(page);
  const result = (await recorded(page)).evaluation;
  expect(result.input).toMatchObject({ sex: 'F', age: { years: 8, months: 0 }, puberty: { kind: 'Th', stage: 2 }, treatment: { gnrha: 'yes', context: 'hormonal' } });
  expect(references(result).byAge.status).toBe('unavailable');
  expect(result.limitations).toContain('treatment_requires_separate_profile');
  await expect(host(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await expect(page.locator('#labPubertyPatientContext')).toContainText(/GnRHa.*w trakcie/);
  await expect(page.locator('#labPubertyTreatmentContext, #labPubertyGnrha, #labPubertySexSteroids')).toHaveCount(0);
  await expect(page.locator('#labResultBig')).toContainText('30');
});

test('płeć F z niepodanym wiekiem zachowuje konwersję bez normy dorosłych i zielonego werdyktu', async ({ page }) => {
  await open(page, null);
  await choose(page, '30', 'ng/dL', 'nmol/L');
  await quickSelect(page, 'Sex', 'F');
  await quickFill(page, 'AgeYears', '');
  await quickFill(page, 'AgeMonths', '');
  await closePatientEditor(page);
  await expect(page.locator('#labPubertyPatientSummary')).toContainText('wiek niepodany');
  const result = (await recorded(page)).evaluation;
  expect(result.input.sex).toBe('F');
  expect(result.ageAtSample.status).toBe('unknown');
  expect(references(result).byAge.status).toBe('unavailable');
  await expect(host(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await expect(page.locator('#labResultBig')).toContainText('1,04');
  await expect(page.locator('#labResultStatus')).not.toContainText(/w zakresie normy/);
  await expect(page.locator('#labRangeBlock')).not.toContainText(/0,3–2,4/);
});

test('ciąża wybrana przy estradiolu blokuje zakres i komunikat SFE po przejściu do TT, a zmiana osoby usuwa lokalną korektę', async ({ page }, testInfo) => {
  await mainToLab(page, { years: 35, th: null, pubic: null });
  await page.locator('#labSubstance').fill('Estradiol');
  await page.locator('#labSubstanceDropdown [data-id="estradiol"]').click();
  await page.locator('#labUnit').selectOption('pmol/L');
  await page.locator('#labValue').fill('200');
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideCycle').selectOption('pregnancy_t1');
  await expect(page.locator('#labOverrideCycle')).toHaveValue('pregnancy_t1');
  await choose(page, '6', 'nmol/L', 'nmol/L');
  const pregnant = (await recorded(page)).evaluation;
  await testInfo.attach('pregnancy-from-existing-cycle-control', { body: JSON.stringify(pregnant, null, 2), contentType: 'application/json' });
  expect(pregnant.input).toMatchObject({ sex: 'F', age: { years: 35, months: 0 }, pregnancy: 'yes' });
  expect(references(pregnant).byAge.status).toBe('unavailable');
  expect(pregnant.clinical.code).not.toBe('female_androgen_excess_action');
  await expect(host(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await expect(page.locator('#labResultBig')).toContainText('6');
  // An unavailable newly selected identity must clear the old person's local
  // override before any asynchronous record can be read. No vault is opened.
  await page.evaluate(() => {
    const id = 'fictional-female-tt-context-b';
    window._vildaCurrentPatientId = id;
    sessionStorage.setItem('vildaCurrentPatientId', id);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id } }));
  });
  await expect(page.locator('#labOverrideCycle')).toHaveValue('');
  await expect(page.locator('#labValue')).toHaveValue('');
  await expect.poll(async () => (await recorded(page)).evaluation.input.pregnancy).not.toBe('yes');
  await page.evaluate(() => {
    window._vildaCurrentPatientId = null;
    sessionStorage.removeItem('vildaCurrentPatientId');
    window.VildaPersistence.writeShared({ name: 'Fikcyjna inna pacjentka po zmianie kontekstu', sex: 'F', age: 35, ageMonths: 0 }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: null } }));
  });
  await expect.poll(async () => (await recorded(page)).evaluation.input.sex).toBe('F');
  await expect(page.locator('#labValue')).toHaveValue('');
  await page.locator('#labValue').fill('1');
  await bounds(page, 0.27736, 2.0802);
  expect((await recorded(page)).evaluation.input.pregnancy).toBe('unknown');
});

test('wiekowe zakresy żeńskie zaczynają się od sześciu miesięcy i zmieniają się na granicach źródła 10, 12, 17 i 19 lat', async ({ page }) => {
  await open(page, patient({ age: 0, ageMonths: 5 }));
  await choose(page, '30');
  await expect(host(page).locator('.vilda-lab-axis')).toHaveCount(0);
  expect((await recorded(page)).evaluation.limitations).toContain('female_infant_reference_not_established');
  for (const [years, months, lower, upper] of [[0, 6, null, 20], [9, 11, null, 20], [10, 0, null, 44], [12, 0, null, 75], [16, 11, null, 75], [17, 0, 20, 75], [18, 11, 20, 75], [19, 0, 8, 60], [60, 0, 8, 60]]) {
    await quickFill(page, 'AgeYears', String(years));
    await quickFill(page, 'AgeMonths', String(months));
    await closePatientEditor(page);
    await bounds(page, lower, upper);
    await noStage(page);
  }
  await page.locator('#labValue').fill('60');
  await expect(age(page)).toHaveAttribute('data-status', 'within');
  const before = (await recorded(page)).evaluation;
  await page.locator('#labUnitTarget').selectOption('nmol/L');
  await bounds(page, 0.27736, 2.0802);
  await expect(axis(page)).toHaveAttribute('data-patient-value', '2.0802');
  await expect(page.locator('#labResultBig')).toContainText('2,08');
  expect((await recorded(page)).evaluation).toEqual(before);
  await page.locator('#labUnit').selectOption('nmol/L');
  await page.locator('#labValue').fill('2,2');
  await expect(age(page)).toHaveAttribute('data-status', 'above');
});

test('stary Tanner i lokalne G3 po zmianie M → F nie wybierają żeńskiego stadium', async ({ page }) => {
  await open(page, patient({ sex: 'M', age: 12, tannerStage: '5' }));
  await choose(page, '30');
  expect((await recorded(page)).evaluation.input.puberty.kind).toBe('unspecified');
  await quickSelect(page, 'Kind', 'G');
  await quickSelect(page, 'Stage', '3');
  await closePatientEditor(page);
  await expect(host(page).locator('[data-comparison="stage"] .vilda-lab-axis')).toHaveCount(1);
  await quickSelect(page, 'Sex', 'F');
  await closePatientEditor(page);
  await bounds(page, null, 75);
  await noStage(page);
  const result = (await recorded(page)).evaluation;
  expect(result.input.sex).toBe('F');
  expect(result.input.puberty.kind).not.toBe('G');
  expect(result.provenance.profileId).toBe('mayo-ttst-female');
  await quickSelect(page, 'Sex', 'M');
  await closePatientEditor(page);
  await expect(page.locator('#labPubertyRefineStage')).toBeVisible();
  await expect(axis(page)).toHaveAttribute('data-range-upper', '800');
});

test('żeński dolny kraniec <7 nie jest zerem ani LOD, a operatory nie dostają dokładnego punktu', async ({ page }) => {
  await open(page, patient({ age: 8 }));
  await choose(page, '6');
  await bounds(page, null, 20);
  await expect(age(page)).not.toHaveAttribute('data-status', /^(within|below)$/);
  await expect(axis(page)).toHaveAttribute('data-reference-display', 'upper-bound-only');
  await expect(age(page)).not.toContainText(/limit oznaczalności|granic[ay] wykrywalności|LoD|LoQ/i);
  await page.locator('#labValue').fill('7');
  await expect(age(page)).toHaveAttribute('data-status', 'within');
  await page.locator('#labUnitTarget').selectOption('nmol/L');
  for (const raw of ['<7', '<LOD']) {
    await page.locator('#labValue').fill(raw);
    const result = (await recorded(page)).evaluation;
    expect(result.measurement).toMatchObject({ raw, operator: '<', unit: 'nmol/L', sourceUnit: 'ng/dL', isExact: false, plotValue: null });
    await expect(host(page).locator('.vilda-lab-axis-marker')).toHaveCount(0);
    await expect(axis(page)).not.toHaveAttribute('data-patient-value', /.+/);
    await expect(page.locator('#labResultBig')).toContainText(raw === '<7' ? /<\s*0,24/ : '<LOD');
    await expect(page.locator('#labHormoneLifespan [data-patient-concentration="t"] [data-result-point]')).toHaveCount(0);
  }
});

test('żeńskie przypięcie zachowuje 60 ng/dL, wiek35 i zapisany zakres po późniejszej korekcie wieku oraz odczycie historii', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, patient({ age: 35 }));
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => window.VildaVault);
  // New isolated Playwright profile; this is a fictional test vault, never an existing user's vault.
  await page.evaluate(() => window.VildaVault.createUser('E2e#FemaleTestosterone!2026', { label: 'Fikcyjny sejf żeńskiego TT', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI && window.VildaLabPubertyRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  const id = await page.evaluate(async user => {
    const result = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    window._vildaCurrentPatientId = result.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', result.patientId);
    window.VildaPersistence.writeShared(user, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: result.patientId } }));
    return result.patientId;
  }, patient({ age: 35 }));
  await expect.poll(() => page.evaluate(patientId => window.VildaPubertySource.kontekstPacjenta(patientId).status, id)).toBe('ready');
  await choose(page, '60', 'ng/dL', 'nmol/L');
  await bounds(page, 0.27736, 2.0802);
  const original = await recorded(page);
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinComment').fill('Fikcyjny żeński wynik TT — niezmienna ocena źródłowa');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate(patientId => window.VildaVault.listPatientNotesForPatient(patientId), id);
  expect(notes).toHaveLength(1);
  const note = notes[0];
  expect(note.labResult).toMatchObject({ valueNum: 60, unit: 'ng/dL' });
  expect(note.labResult.assessment.evaluation).toEqual(original.evaluation);
  await quickFill(page, 'AgeYears', '15');
  await closePatientEditor(page);
  await bounds(page, null, 2.60025);
  const series = await page.evaluate(patientId => window.VildaVault.listPatientLabSeries(patientId), id);
  const point = series.find(item => item.testKey === 'testosterone_total').points.find(item => item.noteId === note.id);
  expect(point).toMatchObject({ plotValue: 60, unit: 'ng/dL' });
  expect(point.assessment.evaluation).toEqual(original.evaluation);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  await page.evaluate(patientId => window.VildaAuthUI.showPatientCard(patientId), id);
  await page.locator('.vilda-patient-tab[data-tab="lab"]').click();
  const card = page.locator('.vilda-lab-hist-card[data-series="testosterone_total"]');
  await expect(card.locator('.vilda-lab-hist-status-context')).toContainText('35 l 0 m w dniu pobrania');
  await card.locator(`button[data-note-id="${note.id}"]`).click();
  const historical = page.locator('.vilda-saved-lab-assessment .vilda-lab-assessment');
  await expect(historical.locator('[data-comparison="age"] .vilda-lab-axis')).toHaveAttribute('data-range-upper', '2.0802');
  expect((await page.evaluate(noteId => window.VildaVault.getPatientNote(noteId), note.id)).labResult.assessment.evaluation).toEqual(original.evaluation);
});

test.describe('żeńskie TT na telefonie 320 px', () => {
  test.use({ viewport: { width: 320, height: 780 }, isMobile: true, hasTouch: true });
  test('jedna oś wieku, wynik i źródło mieszczą się bez dodatkowych pól i starej notki męskiej', async ({ page }) => {
    await open(page, patient({ age: 35 }));
    await choose(page, '60', 'ng/dL', 'nmol/L');
    await bounds(page, 0.27736, 2.0802);
    await expectAutomaticReference(page);
    await noStage(page);
    await noOverflow(page);
    await page.locator('#labPubertyEditPatient').click();
    await noOverflow(page);
    await closePatientEditor(page);
    await host(page).getByText('Szczegóły i źródła', { exact: true }).click();
    await expect(host(page)).toContainText(/LC-MS\/MS/);
    await expect(host(page)).not.toContainText(/Pojedynczy wynik.*hipogonadyzmu|praktycznie pewny guz/i);
    await noOverflow(page);
    await page.locator('#labValue').fill('<LOD');
    await expect(page.locator('#labResultBig')).toContainText('<LOD');
    await expect(host(page).locator('.vilda-lab-axis-marker')).toHaveCount(0);
    await noOverflow(page);
  });
});
