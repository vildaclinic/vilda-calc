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
async function expectUnavailable(page) {
  await expect(page.locator('#labRangeBlock')).toContainText(unavailable);
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
