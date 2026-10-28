import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test as base } from '../support/test-czas.mjs';

// Fikcyjne dane, osobny origin; brak dostępu do sejfu użytkownika.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const unavailable = 'Brak zakresu referencyjnego estradiolu dla tego kontekstu pacjenta. Przeliczenie jednostek pozostaje dostępne.';
const test = base.extend({
  e2Origin: async ({ page }, use) => {
    const server = spawn(process.execPath, [path.join(root, 'tests/support/static-server.mjs')], {
      cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit']
    });
    try {
      const origin = await new Promise((resolve, reject) => {
        let out = '';
        server.stdout.on('data', chunk => {
          out += chunk;
          const found = out.match(/http:\/\/127\.0\.0\.1:\d+/);
          if (found) resolve(found[0]);
        });
        server.once('error', reject);
        server.once('exit', code => reject(new Error(`Serwer E2 zakończył się: ${code}`)));
      });
      await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      await use(origin);
    } finally {
      if (server.exitCode === null && server.signalCode === null) {
        const closed = new Promise(resolve => { server.once('exit', resolve); });
        server.kill('SIGKILL');
        await closed;
      }
    }
  }
});
test.use({ serviceWorkers: 'block' });

const patient = changes => ({ name: 'Fikcyjny pacjent E2', sex: 'M', age: 0, ageMonths: 3, ...changes });
async function writePatient(page, data) {
  await page.evaluate(user => {
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Nie zapisano fikcyjnych danych');
    window.dispatchEvent(new Event('focus'));
  }, data);
}
async function open(page, origin, data = patient()) {
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${day}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${day}|${Date.now()}`);
  });
  await page.goto(`${origin}/przelicznik-jednostek.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.LabUnitConverter && window.VildaPersistence);
  for (const button of [page.locator('#consent-decline'), page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true })]) {
    if (await button.isVisible()) await button.click();
  }
  if (data) await writePatient(page, data);
  await choose(page);
}
async function choose(page) {
  await page.locator('#labSubstance').fill('Estradiol');
  await page.locator('#labSubstanceDropdown [data-id="estradiol"]').click();
  await page.locator('#labUnit').selectOption('pmol/L');
  await page.locator('#labUnitTarget').selectOption('pmol/L');
  await page.locator('#labValue').fill('20');
}
async function expectUnavailable(page, message = unavailable) {
  await expect(page.locator('#labRangeBlock')).toContainText(message);
  await expect(page.locator('#labRangeBlock .lab-range-scale, #labRangeBlock .lab-range-marker, #labRangeBlock .lab-range-uwaga-note')).toHaveCount(0);
  await expect(page.locator('#labResultStatus')).not.toContainText(/w zakresie normy|poniżej normy|powyżej normy/i);
  for (const selector of ['#labMeta', '#labResultSourceLine', '#labRangeBlock']) {
    await expect(page.locator(selector)).not.toContainText(/70–290|faza folikularna/i);
  }
  await expect(page.locator('#labResultStatus .lab-range-status')).toHaveCount(0);
  await expect(page.locator('#labResultBig .lab-result-big-value')).not.toHaveClass(/is-normal|is-below|is-above|is-uwaga/);
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}
async function bounds(page, text) {
  await expect(page.locator('#labMeta')).toContainText(text);
  await expect(page.locator('#labRangeBlock .lab-range-scale')).toHaveCount(1);
}

const cycleVariants = page => page.locator('#labRangeBlock [data-reference-variants="estradiol"]');
const cycleRows = page => cycleVariants(page).locator('[data-variant-id]');
const cycleIds = ['e2_female_follicular', 'e2_female_ovulation', 'e2_female_luteal', 'e2_female_postmeno'];
const cyclePhases = ['follicular', 'ovulation', 'luteal', 'postmenopause'];

for (const width of [1440, 320]) test(`E2 chronological qualification at ${width}px: adult Tanner, missing age and neonatal interval`, async ({ page, e2Origin }) => {
  await page.setViewportSize({ width, height: 1000 });
  await open(page, e2Origin, patient({ age: 30, ageMonths: 0, tannerStage: 1 }));
  await page.locator('#labValue').fill('50');
  await bounds(page, '40–160');
  await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
  await expect(page.locator('#labMeta')).not.toContainText('47,8');

  await writePatient(page, patient({ age: null, ageMonths: null, tannerStage: 1 }));
  await expectUnavailable(page);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('50');

  // A completed zero month spans the source's >14-day boundary. No birth
  // time or midpoint is inserted to obtain a neonatal reference.
  await writePatient(page, patient({ age: 0, ageMonths: 0, tannerStage: 1 }));
  await expectUnavailable(page);
  await writePatient(page, patient({ age: 0, ageMonths: 1, tannerStage: 1 }));
  await bounds(page, '0–47,8');
  await expect(page.locator('#labResultStatus')).toContainText('powyżej normy');
  await writePatient(page, patient({ sex: 'F', age: 30, ageMonths: 0, tannerStage: 1 }));
  await expectCycleAlternatives(page);
  await noOverflow(page);
});

async function neutralResult(page) {
  await expect(page.locator('#labRangeBlock .lab-range-scale, #labRangeBlock .lab-range-marker')).toHaveCount(0);
  await expect(page.locator('#labResultStatus')).not.toContainText(/w zakresie normy|poniżej normy|powyżej normy/i);
  await expect(page.locator('#labResultStatus .lab-range-status')).toHaveCount(0);
  await expect(page.locator('#labResultBig .lab-result-big-value')).not.toHaveClass(/is-normal|is-below|is-above|is-uwaga/);
}

async function expectCycleAlternatives(page, unit = 'pmol/L') {
  await neutralResult(page);
  await expect(cycleVariants(page)).toBeVisible();
  await expect(cycleRows(page)).toHaveCount(4);
  expect(await cycleRows(page).evaluateAll(rows => rows.map(row => row.dataset.variantId))).toEqual(cycleIds);
  expect(await cycleRows(page).evaluateAll(rows => rows.map(row => row.dataset.reproductiveContext))).toEqual(cyclePhases);
  const expected = unit === 'pmol/L'
    ? ['70–290', '380–1460', '200–770', '0–110']
    : ['19,1–79', '104–398', '54,5–210', '0–30'];
  await expect(cycleRows(page).locator('strong')).toHaveText(expected.map(text => `${text}\u00a0${unit}`));
  await expect(cycleVariants(page)).toContainText('Faza folikularna');
  await expect(cycleVariants(page)).toContainText('Pik owulacyjny');
  await expect(cycleVariants(page)).toContainText('Faza lutealna');
  await expect(cycleVariants(page)).toContainText('Po menopauzie');
  for (const row of await cycleRows(page).all()) {
    await expect(row).not.toContainText(/poniżej|powyżej|w normie|w zakresie normy|↑|↓/i);
  }
  await expect(cycleRows(page).locator('[data-status], .lab-range-status, .vilda-lab-axis')).toHaveCount(0);
  await expect(page.locator('#labMeta')).not.toContainText('Aktualny zakres:');
}

async function openPatientEditor(page) {
  if (await page.locator('#labPatientOverride').isHidden()) await page.locator('#labPatientToggle').click();
}

test('E2 u chłopca 3 mies.: oba przeliczenia pozostają dostępne bez normy dorosłej kobiety i alarmu', async ({ page, e2Origin }, testInfo) => {
  await open(page, e2Origin);
  await testInfo.attach('E2-M3m-20pmol-before-assertion', { body: JSON.stringify(await page.evaluate(() => ({
    result: document.querySelector('#labResultBig').innerText,
    status: document.querySelector('#labResultStatus').innerText,
    range: document.querySelector('#labRangeBlock').innerText,
    meta: document.querySelector('#labMeta').innerText
  })), null, 2), contentType: 'application/json' });
  await expectUnavailable(page);
  await expect(page.locator('#labResultBig')).toContainText('20');
  await page.locator('#labUnit').selectOption('pg/mL');
  // Duży wynik zachowuje dotychczasowe zaokrąglenie wyświetlania E2.
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('73,4');
  await expect(page.locator('#labResultBig .lab-result-big-unit')).toHaveText('pmol/L');
  await expectUnavailable(page);
  await noOverflow(page);
});

test('zmiana kontekstu M3m → F3m → dorosły M przywraca istniejące dopasowane zakresy i ponownie je usuwa', async ({ page, e2Origin }) => {
  await open(page, e2Origin);
  await expectUnavailable(page);
  await writePatient(page, patient({ sex: 'F' }));
  await bounds(page, '0–183');
  await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
  await writePatient(page, patient({ age: 35, ageMonths: 0 }));
  await bounds(page, '40–160');
  await page.locator('#labValue').fill('80');
  await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
  await writePatient(page, patient());
  await expectUnavailable(page);
  await expect(page.locator('#labResultBig')).toContainText('80');
});

test('lokalne doprecyzowanie wieku wybiera istniejący zakres, reset wraca do M3m; układ 320 px', async ({ page, e2Origin }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await open(page, e2Origin);
  await expectUnavailable(page);
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideAge').fill('35');
  await page.locator('#labOverrideAgeMonths').fill('0');
  await bounds(page, '40–160');
  await noOverflow(page);
  await page.locator('#labOverrideReset').click();
  await expectUnavailable(page);
  await expect(page.locator('#labOverrideAge')).toHaveValue('');
  await expect(page.locator('#labResultBig')).toContainText('20');
  await noOverflow(page);
  await testInfo.attach('E2-M3m-320', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('bez płci i wieku nie pojawia się opis zakresu ogólnego dorosłych', async ({ page, e2Origin }) => {
  await open(page, e2Origin, null);
  await expectUnavailable(page);
  await expect(page.locator('#labPatientText')).toContainText('Brak danych pacjenta — bez zakresu referencyjnego');
  await expect(page.locator('#labResultBig')).toContainText('20');
});

test('przypięcie E2 zapisuje brak zakresu bez klasyfikacji; dopasowany zakres nadal zapisuje się z wynikiem', async ({ page, e2Origin }, testInfo) => {
  await open(page, e2Origin);
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
  await page.evaluate(() => window.VildaVault.createUser('E2e#FikcyjneE2!2026', { label: 'Fikcyjny sejf E2', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady() && !document.documentElement.classList.contains('vilda-auth-locked'));
  const patientId = await page.evaluate(async user => {
    const saved = await window.VildaVault.savePatient({ name: user.name, user }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    window.VildaPersistence.writeShared(user, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, patient());
  await expect.poll(() => page.evaluate(pid => window.VildaPubertySource.kontekstPacjenta(pid).status, patientId)).toBe('ready');
  await choose(page);
  await expectUnavailable(page);
  async function pin(comment) {
    await page.locator('#labPinResultBtn').click();
    await page.locator('#labPinComment').fill(comment);
    await page.locator('#labPinDate').fill('2026-06-17');
    await page.locator('#labPinSave').click();
    await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  }
  const notes = () => page.evaluate(async pid => (await window.VildaVault.listPatientNotesForPatient(pid))
    .filter(note => note.labResult?.testKey === 'estradiol').map(note => note.labResult), patientId);
  await pin('Fikcyjny wynik bez dopasowanego zakresu');
  const blocked = (await notes())[0];
  expect(blocked).toMatchObject({ testKey: 'estradiol', valueNum: 20, unit: 'pmol/L', range: {
    status: 'unavailable', classification: null, display: null,
    context: { sex: 'M', ageYears: 0.25, localOverride: false },
    range: { low: null, high: null, matched: false, isDefault: false, noInterpretation: true }
  } });
  await expect(page.locator('#labHistoryStrip .lab-strip-chip-v').last()).not.toContainText(/↑|↓/);
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideSex').selectOption('F');
  await bounds(page, '0–183');
  await page.locator('#labValue').fill('30');
  await pin('Fikcyjny wynik z istniejącym zakresem F3m');
  const saved = await notes();
  expect(saved.find(item => item.valueNum === 20)).toEqual(blocked);
  expect(saved.find(item => item.valueNum === 30)).toMatchObject({ range: {
    status: 'recorded', classification: 'within', display: { unit: 'pmol/L', low: 0, high: 183 },
    context: { sex: 'F', ageYears: 0.25, localOverride: true },
    range: { low: 0, high: 183, matched: true, isDefault: false }
  } });
  await testInfo.attach('E2-pinned-range-envelopes', { body: JSON.stringify(saved, null, 2), contentType: 'application/json' });
});

for (const width of [1440, 320]) {
  test(`E2 F35 bez fazy: wynik od razu i cztery neutralne odniesienia bez dodatkowych pytań (${width} px)`, async ({ page, e2Origin }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, e2Origin, patient({ name: 'Fikcyjna pacjentka E2 bez fazy', sex: 'F', age: 35, ageMonths: 0 }));
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('20');
    await expect(page.locator('#labResultBig .lab-result-big-unit')).toHaveText('pmol/L');
    await expect(page.locator('#labPatientOverride')).toBeHidden();
    await expectCycleAlternatives(page);
    await expect(page.locator('#labClinicalHint')).not.toContainText(/domyślnie.*folikular/i);
    const sources = await page.locator('#labSourcesList').textContent();
    expect(sources).toContain('Tietz 2018');
    expect(sources).toContain('PTMRiE / PTGP 2018');
    await noOverflow(page);
    await page.locator('#labUnitTarget').selectOption('pg/mL');
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('5,45');
    await expectCycleAlternatives(page, 'pg/mL');
    expect(await page.locator('#labSourcesList').textContent()).toBe(sources);
    await noOverflow(page);
    const screenshot = testInfo.outputPath(`E2-unknown-cycle-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach(`E2-unknown-cycle-${width}`, { path: screenshot, contentType: 'image/png' });
  });
}

test('znana faza lub menopauza wybiera dotychczasowe granice, zachowuje ich końce i źródła po zmianie jednostki', async ({ page, e2Origin }) => {
  await open(page, e2Origin, patient({ sex: 'F', age: 35, ageMonths: 0 }));
  await expectCycleAlternatives(page);
  await openPatientEditor(page);
  for (const [phase, low, high] of [['follicular', 70, 290], ['ovulation', 380, 1460], ['luteal', 200, 770], ['postmenopause', 0, 110]]) {
    await page.locator('#labOverrideCycle').selectOption(phase);
    await expect(cycleVariants(page)).toHaveCount(0);
    await bounds(page, `${low}–${high}`);
    await page.locator('#labValue').fill(String(low));
    await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
    await page.locator('#labValue').fill(String(high));
    await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
    const sources = await page.locator('#labSourcesList').textContent();
    expect(sources).toContain('Tietz 2018');
    if (phase === 'postmenopause') expect(sources).toContain('PTMRiE');
    await page.locator('#labUnitTarget').selectOption('pg/mL');
    await bounds(page, `${low}–${high}`);
    await expect(page.locator('#labResultBig .lab-result-big-unit')).toHaveText('pg/mL');
    await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
    expect(await page.locator('#labSourcesList').textContent()).toBe(sources);
    await page.locator('#labValue').fill(String(high + 1));
    await expect(page.locator('#labResultStatus')).toContainText('powyżej normy');
    await page.locator('#labUnitTarget').selectOption('pmol/L');
  }
});

test('zachowany Tanner I–V u dorosłej nie zastępuje fazy: nieznana daje alternatywy, znana wybiera zakres cyklu', async ({ page, e2Origin }) => {
  await open(page, e2Origin, patient({ sex: 'F', age: 35, ageMonths: 0, tannerStage: '1' }));
  await openPatientEditor(page);
  for (let stage = 1; stage <= 5; stage += 1) {
    await page.locator('#labOverrideCycle').selectOption('');
    await writePatient(page, patient({ sex: 'F', age: 35, ageMonths: 0, tannerStage: String(stage) }));
    await expectCycleAlternatives(page);
    await page.locator('#labOverrideCycle').selectOption('ovulation');
    await bounds(page, '380–1460');
    await page.locator('#labValue').fill('400');
    await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
  }
});

test('znana ciąża i nieobsługiwany kontekst nie pokazują czterech alternatyw dla nieznanej fazy', async ({ page, e2Origin }) => {
  await open(page, e2Origin, patient({ sex: 'F', age: 35, ageMonths: 0, tannerStage: '5' }));
  await openPatientEditor(page);
  for (const phase of ['pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3', 'fictional-unsupported-context']) {
    if (phase === 'fictional-unsupported-context') await page.locator('#labOverrideCycle').evaluate(select => {
      const option = document.createElement('option');
      option.value = 'fictional-unsupported-context'; option.textContent = 'Fikcyjny nieobsługiwany kontekst';
      select.appendChild(option);
    });
    await page.locator('#labOverrideCycle').selectOption(phase);
    await expect(page.locator('#labOverrideCycle')).toHaveValue(phase);
    await expectUnavailable(page, 'Brak zakresu estradiolu dla wskazanego kontekstu cyklu lub ciąży. Przeliczenie jednostek pozostaje dostępne.');
    await expect(cycleVariants(page)).toHaveCount(0);
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('20');
  }
});

test('reset, zmiana płci i zmiana tożsamości usuwają lokalną fazę bez przenoszenia jej na inną osobę', async ({ page, e2Origin }) => {
  await open(page, e2Origin, patient({ sex: 'F', age: 35, ageMonths: 0 }));
  await openPatientEditor(page);
  await page.locator('#labOverrideCycle').selectOption('luteal');
  await bounds(page, '200–770');
  await page.locator('#labOverrideReset').click();
  await expect(page.locator('#labOverrideCycle')).toHaveValue('');
  await expectCycleAlternatives(page);
  await page.locator('#labOverrideCycle').selectOption('follicular');
  await bounds(page, '70–290');
  await page.locator('#labOverrideSex').selectOption('M');
  await bounds(page, '40–160');
  await expect(page.locator('#labOverrideCycle')).toHaveValue('');
  await page.locator('#labOverrideSex').selectOption('F');
  await expectCycleAlternatives(page);
  await page.locator('#labOverrideCycle').selectOption('luteal');
  await bounds(page, '200–770');
  await page.evaluate(() => {
    const id = 'fictional-e2-other-patient';
    window._vildaCurrentPatientId = id;
    sessionStorage.setItem('vildaCurrentPatientId', id);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id } }));
  });
  await expect(page.locator('#labOverrideCycle')).toHaveValue('');
  await expect(page.locator('#labValue')).toHaveValue('');
  await page.evaluate(() => {
    window._vildaCurrentPatientId = null;
    sessionStorage.removeItem('vildaCurrentPatientId');
    window.VildaPersistence.writeShared({ name: 'Fikcyjna inna pacjentka E2', sex: 'F', age: 35, ageMonths: 0 }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: null } }));
  });
  await page.locator('#labValue').fill('20');
  await expectCycleAlternatives(page);
  await expect(page.locator('#labOverrideCycle')).toHaveValue('');
});

test('nowy zapis E2 bez fazy zachowuje pomiar bez oceny, a stary zakres folikularny jest odczytywany bez ponownej klasyfikacji', async ({ page, e2Origin }, testInfo) => {
  test.setTimeout(120_000);
  const user = patient({ name: 'Fikcyjna pacjentka E2 historii', sex: 'F', age: 35, ageMonths: 0 });
  await open(page, e2Origin, user);
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
  await page.evaluate(() => window.VildaVault.createUser('E2e#FikcyjnaHistoriaE2!2026', { label: 'Fikcyjny sejf fazy E2', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady() && !document.documentElement.classList.contains('vilda-auth-locked'));
  const { patientId, oldNoteId } = await page.evaluate(async data => {
    const saved = await window.VildaVault.savePatient({ name: data.name, user: data }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    window.VildaPersistence.writeShared(data, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    // Literalny zapis sprzed zmiany. Nie powstaje przez dzisiejszy dobór zakresu.
    const oldRange = {
      schemaVersion: 1, kind: 'laboratory-reference-range', analyte: 'estradiol', status: 'recorded', reasonCodes: [],
      capturedAtISO: '2026-06-16T09:00:00.000Z', classification: 'below',
      context: { sex: 'F', ageYears: 35, lifeStage: 'adult', tanner: null, cyclePhase: null, timeOfDay: null, testProtocol: null, method: null, localOverride: false },
      measurement: { raw: '50', sourceValue: 50, sourceUnit: 'pmol/L', siValue: 50, siUnit: 'pmol/L', factorToSi: 1 },
      range: { id: 'e2_female_default', low: 70, high: 290, unit: 'pmol/L', context: 'Kobiety dorosłe (domyślnie: faza folikularna)',
        when: { sex: 'F', life_stage: 'adult' }, matched: true, isDefault: false, noInterpretation: false,
        sourceIds: ['tietz_2018'], sources: [{ id: 'tietz_2018', label: 'Tietz 2018', citation: 'Fikcyjny historyczny zapis źródła Tietz 2018', url: null }] },
      display: { unit: 'pmol/L', low: 70, high: 290 }, versions: { engine: 'LabUnitConverter 2.0.1', data: 'LabUnitsData 2.0.1' }
    };
    const oldNote = await window.VildaVault.savePatientNote({
      patientId: saved.patientId, title: 'Fikcyjny historyczny E2', body: '', category: 'wynik-badania', clinicalDateISO: '2026-06-16',
      labResult: { test: 'Estradiol', testKey: 'estradiol', value: '50 pmol/L', valueNum: 50, unit: 'pmol/L', range: oldRange }
    });
    return { patientId: saved.patientId, oldNoteId: oldNote.id };
  }, user);
  await expect.poll(() => page.evaluate(pid => window.VildaPubertySource.kontekstPacjenta(pid).status, patientId)).toBe('ready');
  const notes = () => page.evaluate(pid => window.VildaVault.listPatientNotesForPatient(pid), patientId);
  const oldSaved = (await notes()).find(note => note.id === oldNoteId).labResult;
  expect(oldSaved.range).toMatchObject({ status: 'recorded', classification: 'below', range: { id: 'e2_female_default', low: 70, high: 290 } });
  await choose(page);
  await expectCycleAlternatives(page);
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinOverlay')).toContainText('bez jednej oceny względem zakresu');
  await expect(page.locator('#labPinOverlay [data-reference-variants]')).toHaveCount(0);
  await page.locator('#labPinComment').fill('Fikcyjny wynik E2 bez fazy');
  await page.locator('#labPinDate').fill('2026-06-17');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const saved = await notes();
  const current = saved.find(note => note.labResult?.valueNum === 20);
  expect(current.labResult).toMatchObject({ testKey: 'estradiol', valueNum: 20, unit: 'pmol/L', range: {
    schemaVersion: 1, kind: 'laboratory-reference-range', status: 'unavailable', classification: null, display: null,
    context: { sex: 'F', ageYears: 35, lifeStage: 'adult', cyclePhase: null, localOverride: false },
    measurement: { raw: '20', sourceValue: 20, sourceUnit: 'pmol/L', siValue: 20, siUnit: 'pmol/L' },
    range: { low: null, high: null, noInterpretation: true, sourceIds: [], sources: [] }
  } });
  expect(JSON.stringify(current.labResult.range)).not.toMatch(/reference_variants|referenceVariants|e2_female_follicular|e2_female_ovulation|e2_female_luteal|e2_female_postmeno/);
  expect(saved.find(note => note.id === oldNoteId).labResult).toEqual(oldSaved);
  // Odczyt historii musi wystarczyć sam sobie, także gdy bieżący silnik nie jest dostępny.
  await page.evaluate(() => {
    window.LabUnitConverter.evaluate = () => { throw new Error('Fikcyjna blokada ponownej oceny historii E2'); };
    window.LabUnitConverter.selectRange = () => { throw new Error('Fikcyjna blokada ponownego doboru historii E2'); };
  });
  const strip = page.locator('#labHistoryStrip');
  const oldChip = strip.locator(`button.lab-strip-chip[data-note-id="${oldNoteId}"]`);
  await expect(oldChip.locator('.lab-strip-chip-v')).toHaveText('50↓');
  await oldChip.click();
  await expect(strip.locator('.lab-strip-detail-range')).toContainText('70–290');
  await expect(strip.locator('.lab-strip-detail-range')).toContainText('poniżej');
  await expect(strip.locator('.lab-strip-detail-range')).toContainText('faza folikularna');
  const currentChip = strip.locator(`button.lab-strip-chip[data-note-id="${current.id}"]`);
  await expect(currentChip.locator('.lab-strip-chip-v')).toHaveText('20');
  await currentChip.click();
  await expect(strip.locator('.lab-strip-detail .lab-strip-muted')).toContainText('bez oceny względem zakresu w dniu przypięcia');
  await expect(strip.locator('.lab-strip-detail-range, [data-reference-variants]')).toHaveCount(0);
  expect((await notes()).find(note => note.id === oldNoteId).labResult).toEqual(oldSaved);
  await testInfo.attach('E2-cycle-new-and-historical-envelopes', { body: JSON.stringify(saved.map(note => note.labResult), null, 2), contentType: 'application/json' });
});
