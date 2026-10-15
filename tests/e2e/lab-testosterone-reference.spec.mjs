import { expect, test } from '../support/test-czas.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';
import { quickSelect, quickFill, closePatientEditor, expectAutomaticReference } from '../support/lab-puberty-quick.mjs';

// Wyłącznie fikcyjne dane. Badamy rzeczywisty formularz, silnik i zapis oceny;
// nie podstawiamy potwierdzonej metody ani zakresu referencyjnego do kontrolek.
test.use({ serviceWorkers: 'block' });

const user = (changes = {}) => ({ name: 'Fikcyjny pacjent testosteronu', sex: 'M', age: 19, ageMonths: 0, ...changes });
const assessment = page => page.locator('#labPubertyAssessment .vilda-lab-assessment');
const comparison = (page, name = 'age') => assessment(page).locator(`[data-comparison="${name}"]`);
const axis = (page, name = 'age') => comparison(page, name).locator('.vilda-lab-axis');
const saved = page => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());
const references = evaluation => evaluation.referencePreview || evaluation.biochemical;

async function prepare(page) {
  await page.route('**/*', route => {
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
}

async function dismiss(page) {
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (await guest.isVisible()) await guest.click();
}

async function shared(page, patient) {
  await page.evaluate(data => {
    if (!window.VildaPersistence.writeShared(data, { force: true })) throw new Error('Nie zapisano fikcyjnego kontekstu TT');
    window.dispatchEvent(new Event('focus'));
  }, patient);
}

async function open(page, patient = user()) {
  await prepare(page);
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaLabTestosterone && window.VildaLabTestosteroneData);
  await dismiss(page);
  if (patient) await shared(page, patient);
}

async function choose(page, raw = '300', unit = 'ng/dL', analyte = 'testosterone_total') {
  await page.locator('#labSubstance').fill(analyte.startsWith('testosterone') ? 'Testosteron' : analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  await page.locator('#labUnit').selectOption(unit);
  await page.locator('#labValue').fill(raw);
}

async function target(page, unit) {
  await page.locator('#labUnitTarget').selectOption(unit);
}

async function expectBounds(page, lower, upper, name = 'age') {
  await expect(axis(page, name)).toHaveCount(1);
  const bounds = await axis(page, name).evaluate(node => ({
    lower: node.getAttribute('data-range-lower'), upper: node.getAttribute('data-range-upper'),
  }));
  if (lower === null) expect(bounds.lower).toBe('unknown');
  else expect(Number(bounds.lower)).toBeCloseTo(lower, 7);
  expect(Number(bounds.upper)).toBeCloseTo(upper, 7);
}

async function expectNoOverflow(page) {
  const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
}

test('wiek i bieżące G3 z formularza głównego wystarczają do dwóch osi TT bez ponownego pytania', async ({ page }) => {
  await prepare(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await dismiss(page);
  await page.waitForFunction(() => window.VildaPubertyAssessmentState && window.VildaPubertyAssessmentUI);
  await czekajNaOdtworzenieSesji(page);
  await dismiss(page);
  await page.waitForFunction(() => !window.__vildaPersistRestoring && !window.VildaPersistence.isClearInProgress()
    && !(Number(window.__vildaPersistClearUntil || 0) > Date.now()));
  await page.locator('#sex').selectOption('M');
  await page.locator('#age').fill('12');
  await page.locator('#ageMonths').fill('3');
  await page.locator('#tannerToggleBtn').click();
  await page.locator('#pubertyAssessmentEditor .vpa-segments [data-puberty-axis="G"][data-puberty-stage="3"]').click();
  await expect.poll(() => page.evaluate(() => window.VildaPubertyAssessmentState.read().assessment?.observations?.G?.stage)).toBe(3);
  await page.evaluate(() => {
    window.vildaPersistFlushNow?.({ force: true });
    window.VildaDataImportExport.saveMainSessionNow();
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaLabTestosterone);
  await choose(page, '300');
  await target(page, 'ng/dL');
  await expect(page.locator('#labPubertyStageSummary')).toContainText('G3');
  await expect(page.locator('#labPubertyKind')).toBeHidden();
  await expect(page.locator('#labPubertyStage')).toBeHidden();
  await expectAutomaticReference(page);
  await expectBounds(page, null, 800);
  await expectBounds(page, 26, 800, 'stage');
  const recorded = await saved(page);
  expect(recorded.evaluation.input).toMatchObject({ sex: 'M', age: { years: 12, months: 3 }, puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true } });
  expect(references(recorded.evaluation).byAge.status).not.toBe('unavailable');
  expect(references(recorded.evaluation).byStage.status).toBe('within');
  expect(recorded.evaluation.biochemical.primary).toBeNull();
});

test('niemowlę ma własny zakres do końca piątego miesiąca, a od szóstego miesiąca nie dostaje normy dorosłych ani G', async ({ page }) => {
  await open(page, user({ age: 0, ageMonths: 0 }));
  await choose(page, '100');
  await target(page, 'ng/dL');
  await expectBounds(page, 75, 400);
  await expect(comparison(page, 'stage').locator('.vilda-lab-axis')).toHaveCount(0);
  await quickFill(page, 'AgeMonths', '5');
  await closePatientEditor(page);
  await expectBounds(page, 75, 400);
  await quickFill(page, 'AgeMonths', '6');
  await closePatientEditor(page);
  await expectBounds(page, null, 20);
  expect((await saved(page)).evaluation.input.age).toMatchObject({ years: 0, months: 6, precision: 'month' });
  await expect(comparison(page)).toHaveAttribute('data-status', 'above');
  await expect(comparison(page, 'stage').locator('.vilda-lab-axis')).toHaveCount(0);
  await expect(page.locator('#labPubertyGestationalAge')).toBeHidden();
});

test('znane wcześniactwo w niemowlęctwie nie dostaje zastępczego zakresu donoszonych ani dorosłych', async ({ page }) => {
  await open(page, user({ age: 0, ageMonths: 3 }));
  await choose(page, '100');
  await expect(axis(page)).toHaveCount(1);
  await quickSelect(page, 'Preterm', 'yes');
  await closePatientEditor(page);
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  const recorded = await saved(page);
  expect(references(recorded.evaluation).byAge.status).toBe('unavailable');
  expect(recorded.evaluation.limitations).toContain('preterm_reference_not_established');
  await expect(page.locator('#labPubertyGestationalAge')).toBeHidden();
});

test('osiemnaście lat zachowuje zakres nastolatka, a dopiero dziewiętnaście uruchamia zakres Mayo dorosłych i krótką notkę kliniczną', async ({ page }) => {
  await open(page, user({ age: 18, ageMonths: 11 }));
  await choose(page, '300');
  await target(page, 'ng/dL');
  await expectBounds(page, 300, 1200);
  await quickFill(page, 'AgeYears', '19');
  await quickFill(page, 'AgeMonths', '0');
  await closePatientEditor(page);
  await expectBounds(page, 240, 950);
  await expect(comparison(page)).toHaveAttribute('data-status', 'within');
  const note = assessment(page).locator('p').filter({ hasText: /Pojedynczy wynik.*hipogonadyzmu/ });
  await expect(note).toBeVisible();
  await expect(note).toContainText(/porann/i);
  await expect(note).toContainText(/czczo/);
  await page.locator('#labUnit').selectOption('nmol/L');
  await page.locator('#labValue').fill('9');
  await target(page, 'nmol/L');
  await expect(comparison(page)).toHaveAttribute('data-status', 'within');
  await expect(note).toBeVisible();
  const recorded = await saved(page);
  expect(recorded.evaluation.referencePreview.byAge.range.bounds.lower.value).toBeCloseTo(8.3208, 7);
  expect(recorded.evaluation.referencePreview.byAge.range.bounds.upper.value).toBeCloseTo(32.9365, 7);
});

test('brak wieku albo płci nie staje się domyślnym dorosłym mężczyzną', async ({ page }) => {
  await open(page, null);
  await choose(page);
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  let recorded = await saved(page);
  expect(recorded.evaluation.input.sex).toBeNull();
  expect(references(recorded.evaluation).byAge.status).toBe('unavailable');
  expect(references(recorded.evaluation).byStage.status).toBe('unavailable');
  await quickSelect(page, 'Sex', 'M');
  await closePatientEditor(page);
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  recorded = await saved(page);
  expect(recorded.evaluation.input.sex).toBe('M');
  expect(references(recorded.evaluation).byAge.status).toBe('unavailable');
  await quickFill(page, 'AgeYears', '19');
  await quickFill(page, 'AgeMonths', '0');
  await closePatientEditor(page);
  await expect(axis(page)).toHaveCount(1);
  await quickSelect(page, 'Sex', '');
  await closePatientEditor(page);
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  expect((await saved(page)).evaluation.input.sex).toBeNull();
});

test('niedostępny rekord bieżącej osoby wyłącza stare dane mężczyzny z shared zamiast dobierać dorosłą normę TT', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const id = 'fikcyjny-niedostepny-pacjent-tt';
    window._vildaCurrentPatientId = id;
    sessionStorage.setItem('vildaCurrentPatientId', id);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id } }));
  });
  await expect.poll(() => page.evaluate(() => window.VildaLabPubertyRuntime.getEffectiveContext().sourceStatus)).not.toBe('ready');
  await choose(page);
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  const recorded = await saved(page);
  expect(recorded.evaluation.input.sex).toBeNull();
  expect(references(recorded.evaluation).byAge.status).toBe('unavailable');
  expect(references(recorded.evaluation).byStage.status).toBe('unavailable');
});

test('dawny nieokreślony Tanner i osobna cecha P nie zastępują G, ale nie usuwają osi wieku', async ({ page }) => {
  await open(page, user({ age: 12, tannerStage: '5' }));
  await choose(page, '100');
  await target(page, 'ng/dL');
  let recorded = await saved(page);
  expect(recorded.evaluation.input.puberty.kind).toBe('unspecified');
  expect(references(recorded.evaluation).byStage.status).toBe('unavailable');
  await expectBounds(page, null, 800);
  await quickSelect(page, 'Kind', 'P');
  await quickSelect(page, 'Stage', '4');
  await closePatientEditor(page);
  await expect(page.locator('#labPubertyStageSummary')).toContainText('P4');
  recorded = await saved(page);
  expect(references(recorded.evaluation).byStage.status).toBe('unavailable');
  expect(recorded.evaluation.input.puberty.kind).not.toBe('G');
  await expectBounds(page, null, 800);
  await expect(comparison(page, 'stage').locator('.vilda-lab-axis')).toHaveCount(0);
});

test('znane leczenie GnRHa blokuje porównanie bazalne bez dodawania ankiety leczenia', async ({ page }) => {
  await open(page, user({ age: 12, puberty: { gnrhaStatus: 'w-trakcie' } }));
  await choose(page, '100');
  const recorded = await saved(page);
  expect(recorded.evaluation.input.treatment).toMatchObject({ context: 'hormonal', gnrha: 'yes' });
  expect(references(recorded.evaluation).byAge.status).toBe('unavailable');
  expect(references(recorded.evaluation).byStage.status).toBe('unavailable');
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await expect(page.locator('#labPubertyPatientContext')).toContainText(/GnRHa.*w trakcie/);
  await expect(page.locator('#labPubertyTreatmentContext, #labPubertyGnrha, #labPubertySexSteroids')).toHaveCount(0);
});

test('300 ng/dL jest przeliczane na 10,401 nmol/L, a zmiana jednostki osi nie zmienia zapisanej oceny', async ({ page }) => {
  await open(page);
  await choose(page, '300');
  await expectAutomaticReference(page);
  await target(page, 'nmol/L');
  await expectBounds(page, 8.3208, 32.9365);
  await expect(axis(page)).toHaveAttribute('data-patient-value', '10.401');
  await expect(page.locator('#labResultBig')).toContainText('10,401');
  const original = await saved(page);
  expect(original.evaluation.measurement).toMatchObject({ value: 10.401, unit: 'nmol/L', sourceValue: 300, sourceUnit: 'ng/dL', isExact: true, plotValue: 10.401 });
  await target(page, 'ng/dL');
  await expectBounds(page, 240, 950);
  await expect(axis(page)).toHaveAttribute('data-patient-value', '300');
  await expect(page.locator('#labResultBig')).toContainText('300');
  expect((await saved(page)).evaluation).toEqual(original.evaluation);
  await page.locator('#labShowAllToggle').click();
  const rows = page.locator('#labResultsBody tr');
  await expect(rows.filter({ hasText: 'nmol/L' })).toContainText('10,401');
  await expect(rows.filter({ hasText: 'ng/mL' })).toContainText('3');
  await expect(rows.filter({ hasText: 'pg/mL' })).toContainText(/3[\s\u00a0]?000/);
  await page.locator('#labValue').fill('1 000');
  expect((await saved(page)).evaluation.measurement).toMatchObject({ sourceValue: 1000, value: 34.67 });
});

test('źródłowe minimum <7 nie daje fałszywego wyniku poniżej ani pewnej zielonej normy dla 6 ng/dL', async ({ page }) => {
  await open(page, user({ age: 6 }));
  await choose(page, '6');
  await target(page, 'ng/dL');
  await expectBounds(page, null, 20);
  await expect(comparison(page)).not.toHaveAttribute('data-status', /^(within|below)$/);
  const recorded = await saved(page);
  expect(references(recorded.evaluation).byAge.status).not.toMatch(/^(within|below)$/);
  await expect(comparison(page)).toContainText(/<\s*7(?:\D|$)/);
  await expect(comparison(page)).not.toContainText(/limit oznaczalności|granic[ay] wykrywalności|LoD|LoQ/i);
  await page.locator('#labValue').fill('7');
  await expect(comparison(page)).toHaveAttribute('data-status', 'within');
  await expectBounds(page, null, 20);
});

test('wyniki <300 i <LOD zachowują operator w przeliczeniach i nie dostają dokładnego punktu', async ({ page }) => {
  await open(page);
  await choose(page, '<300');
  await target(page, 'nmol/L');
  for (const raw of ['<300', '<LOD', '<LOQ']) {
    await page.locator('#labValue').fill(raw);
    const recorded = await saved(page);
    expect(recorded.evaluation.measurement).toMatchObject({ raw, operator: '<', isExact: false, plotValue: null });
    await expect(axis(page).locator('.vilda-lab-axis-marker')).toHaveCount(0);
    await expect(axis(page)).not.toHaveAttribute('data-patient-value', /.+/);
    await expect(page.locator('#labResultBig')).toContainText(raw === '<300' ? /<\s*10,401/ : raw);
  }
});

test('zmiana płci bez ponownego wyboru analitu przełącza wspólny panel i dotychczasowe żeńskie normy', async ({ page }) => {
  await open(page, user({ age: 30 }));
  await choose(page, '30');
  await target(page, 'ng/dL');
  await expectBounds(page, 240, 950);
  const chosen = await page.locator('#labSubstance').inputValue();
  await shared(page, user({ sex: 'F', age: 30 }));
  await expect(page.locator('#labPubertyPanel')).toBeVisible();
  await expect(page.locator('#labPubertySex')).toHaveValue('F');
  await expect(assessment(page)).toHaveCount(0);
  await expect(page.locator('#labRangeBlock')).not.toBeEmpty();
  await expect(page.locator('#labMeta')).toContainText(/0,3.*2,4/);
  await expect(page.locator('#labValue')).toHaveValue('30');
  await expect(page.locator('#labSubstance')).toHaveValue(chosen);
  await quickSelect(page, 'Sex', 'M');
  await closePatientEditor(page);
  await expectBounds(page, 240, 950);
  expect((await saved(page)).evaluation.input.sex).toBe('M');
  await quickSelect(page, 'Sex', 'F');
  await closePatientEditor(page);
  await expect(assessment(page)).toHaveCount(0);
  await expect(page.locator('#labRangeBlock')).not.toBeEmpty();
  await expect(page.locator('#labMeta')).toContainText(/0,3.*2,4/);
  await expect(page.locator('#labValue')).toHaveValue('30');
  expect(await page.evaluate(() => window.VildaPersistence.readShared().sex)).toBe('F');
});

test('przejście TT → wolny testosteron → LH zachowuje dotychczasowe odrębne ścieżki', async ({ page }) => {
  await open(page);
  await choose(page);
  expect((await saved(page)).evaluation.analyte).toBe('testosterone_total');
  await choose(page, '10', 'pg/mL', 'testosterone_free');
  await target(page, 'pg/mL');
  await expect(page.locator('#labPubertyPanel')).toBeHidden();
  await expect(assessment(page)).toHaveCount(0);
  await expect(page.locator('#labResultBig')).toContainText('10');
  await choose(page, '2', 'IU/L', 'lh');
  expect((await saved(page)).evaluation.analyte).toBe('lh');
  expect((await saved(page)).evaluation.measurement).toMatchObject({ value: 2, unit: 'IU/L' });
});

test('rzeczywiste przypięcie przechowuje 300 ng/dL i historyczną ocenę bez przeliczania po zmianie wieku', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => window.VildaVault);
  await page.evaluate(() => window.VildaVault.createUser('E2e#Testosterone!2026', { label: 'Fikcyjny sejf testosteronu', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI && window.VildaLabPubertyRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  const patientId = await page.evaluate(async data => {
    const result = await window.VildaVault.savePatient({ name: data.name, user: data, puberty: {} }, { dedup: false });
    window._vildaCurrentPatientId = result.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', result.patientId);
    window.VildaPersistence.writeShared(data, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: result.patientId } }));
    return result.patientId;
  }, user());
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, patientId)).toBe('ready');
  await choose(page, '300');
  await target(page, 'nmol/L');
  const original = await saved(page);
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinComment').fill('Fikcyjny wynik TT 300 ng/dL — zapis oceny i jednostek');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), patientId);
  expect(notes).toHaveLength(1);
  const note = notes[0];
  expect(note.labResult).toMatchObject({ valueNum: 300, unit: 'ng/dL' });
  expect(note.labResult.assessment.evaluation).toEqual(original.evaluation);
  await quickFill(page, 'AgeYears', '12');
  await closePatientEditor(page);
  expect((await saved(page)).evaluation.input.age.years).toBe(12);
  const series = await page.evaluate(id => window.VildaVault.listPatientLabSeries(id), patientId);
  const point = series.find(item => item.testKey === 'testosterone_total').points.find(item => item.noteId === note.id);
  expect(point.plotValue).toBe(300);
  expect(point.unit).toBe('ng/dL');
  expect(point.assessment.evaluation).toEqual(original.evaluation);
  await page.evaluate(id => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="lab"]').click();
  const card = page.locator('.vilda-lab-hist-card[data-series="testosterone_total"]');
  await expect(card.locator('.vilda-lab-hist-status-context')).toContainText('19 l 0 m w dniu pobrania');
  await card.locator(`button[data-note-id="${note.id}"]`).click();
  const historical = page.locator('.vilda-saved-lab-assessment .vilda-lab-assessment');
  await expect(historical).toHaveAttribute('data-assessment-status', 'recorded');
  await expect(historical.locator('[data-comparison="age"] .vilda-lab-axis')).toHaveAttribute('data-range-lower', '8.3208');
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), note.id)).labResult.assessment.evaluation).toEqual(original.evaluation);
});

test.describe('telefon 320 px', () => {
  test.use({ viewport: { width: 320, height: 780 }, isMobile: true, hasTouch: true });

  test('wynik, źródło, notka dorosłych i otwarta korekta mieszczą się w czystym widoku', async ({ page }) => {
    await open(page);
    await choose(page, '300');
    await target(page, 'nmol/L');
    await expectBounds(page, 8.3208, 32.9365);
    await expectNoOverflow(page);
    const note = assessment(page).locator('p').filter({ hasText: /Pojedynczy wynik.*hipogonadyzmu/ });
    await expect(note).toBeVisible();
    await page.locator('#labPubertyEditPatient').click();
    await expectNoOverflow(page);
    await closePatientEditor(page);
    await quickFill(page, 'AgeYears', '12');
    await closePatientEditor(page);
    await quickSelect(page, 'Kind', 'G');
    await quickSelect(page, 'Stage', '3');
    await expectNoOverflow(page);
    await closePatientEditor(page);
    await target(page, 'pg/mL');
    await expectBounds(page, 260, 8000, 'stage');
    await expectNoOverflow(page);
    await page.locator('#labValue').fill('<LOD');
    await expect(assessment(page).locator('.vilda-lab-axis-marker')).toHaveCount(0);
    await expectNoOverflow(page);
  });
});
