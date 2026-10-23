import { expect, test } from '../support/test-czas.mjs';
import { prepareDobRestoreGate } from '../support/dob-restore-gate.mjs';

// Wyłącznie fikcyjna wizyta. Sprawdza odbiorców tego samego głównego wyniku:
// ramkę Start, DocPro oraz tekst schowka Karty Pacjenta.
test.use({ serviceWorkers: 'block' });

async function ramka(page, title) {
  await page.waitForFunction((name) => {
    const frame = [...document.querySelectorAll('iframe.app-pane')].find((el) => el.title === name);
    return Boolean(frame && frame.contentWindow && frame.contentWindow.VildaDobAge
      && typeof frame.contentWindow.update === 'function' && frame.contentDocument.readyState === 'complete');
  }, title);
  const element = await page.$(`iframe.app-pane[title="${title}"]`);
  return element.contentFrame();
}

async function centyleISchowek(frame) {
  await expect.poll(() => frame.evaluate(() => window.__vildaDobRestoreGate.pending())).toBeGreaterThan(0);
  expect(await frame.evaluate(() => window.VildaDobAge.readExactAge())).toBeNull();
  await expect(frame.locator('#results')).toContainText('Wzrost: 30 centyl');
  await frame.evaluate(() => window.__vildaDobRestoreGate.release());
  await expect(frame.locator('#results')).toContainText('Wzrost: 29 centyl');
  const stan = await frame.evaluate(() => {
    const age = Number(document.getElementById('age').value) + Number(document.getElementById('ageMonths').value) / 12;
    return {
      exact: window.VildaDobAge.readExactAge(),
      fresh: window.calcPercentileStats(174, 'M', age, 'HT').percentile,
      global: window.lastHeightPercentile,
      data: window.collectUserData().user,
    };
  });
  expect(stan.exact).toMatchObject({ totalMonths: 203, days: 6208, exactMonths: 203.95893223819303 });
  expect(stan.fresh).toBeCloseTo(29.208191, 5);
  expect(stan.global).toBeCloseTo(stan.fresh, 8);
  expect(stan.data).toMatchObject({ dobISO: '2009-07-20', age: 16, ageMonths: 11, measuredAtISO: '2026-07-19' });

  // Schowek Karty Pacjenta ma własną funkcję produkcyjną dla danych rekordu.
  // Porównujemy jej wyjście z widokiem bez kopiowania wzoru centylowego do testu.
  const copy = await frame.evaluate(() => ({
    text: window.VildaPatientSummaryCopy.buildSummaryTextFromPayload(window.collectUserData()),
    user: window.collectUserData().user,
  }));
  expect(copy.text).toMatch(/Waga:[^\n]*33 centyl/);
  expect(copy.text).toMatch(/Wzrost:[^\n]*29 centyl/);
  expect(copy.user).toEqual(stan.data);
}

async function odtworzZOpóźnieniem(frame, patientId) {
  await frame.evaluate((id) => {
    window.clearAllData();
    window.__vildaDobRestoreGate.pause();
    window.VildaAuthUI.showPatientCard(id, (record) => { if (record) window.applyLoadedData(record); }, null);
  }, patientId);
  await frame.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  const wybor = frame.locator('#vildaLoadChoiceModal');
  const straznik = frame.getByRole('dialog', { name: /^Zapisać (wpisane dane|zmiany) przed wczytaniem\?$/ });
  // Odtworzenie sesji ramki może uzupełnić fikcyjne pola po clearAllData().
  // Jeśli strażnik pyta przed wczytaniem, lekarz jawnie odrzuca te dane.
  await expect(wybor.or(straznik)).toBeVisible();
  if (await straznik.isVisible()) {
    await straznik.getByRole('button', { name: /^Odrzuć (dane|zmiany) i wczytaj$/ }).click();
    await expect(straznik).toHaveCount(0);
  }
  await expect(wybor).toBeVisible();
  await frame.locator('#vildaLcmRestore').click();
  await expect(frame.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await centyleISchowek(frame);
  await expect.poll(() => frame.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
}

test('opóźnione DOB z rekordu: Start w powłoce i DocPro pokazują aktualne centyle zgodne ze schowkiem', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(prepareDobRestoreGate);
  await page.addInitScript(() => {
    window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
  });
  await page.clock.setSystemTime(new Date('2026-07-19T21:55:00Z'));
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  let start = await ramka(page, 'Start');
  await start.evaluate(async () => window.VildaVault.createUser('E2e#DobPdf!26', { label: 'e2e', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await start.waitForFunction(() => window.VildaVault.isUnlocked()
    && !document.documentElement.classList.contains('vilda-auth-locked') && typeof window.saveUserData === 'function');
  await start.evaluate(() => {
    const values = { lastName: 'Fikcyjny', firstName: 'Eksportowy', sex: 'M', dobInput: '20-07-2009', height: '174', weight: '62' };
    for (const [id, value] of Object.entries(values)) {
      const el = document.getElementById(id);
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.update();
  });
  await expect(start.locator('#results')).toContainText('Wzrost: 29 centyl');
  expect(await start.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await expect.poll(() => start.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
  const pid = await start.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);

  await page.clock.setSystemTime(new Date('2026-07-19T22:03:00Z'));
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await expect(start.locator('#results')).toContainText('Wzrost: 29 centyl');
  await expect.poll(() => start.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
  await odtworzZOpóźnieniem(start, pid);

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await ramka(page, 'DocPro');
  // DocPro wymaga PRO: fikcyjny dostęp jest warunkiem tego testu, jak w innych
  // E2E DocPro. Odtwarzanie danych i obliczenia pozostają produkcyjne.
  await docpro.waitForFunction(() => Boolean(window.VildaProAccess));
  await docpro.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await expect(docpro.locator('html')).toHaveClass(/vilda-pro-active/);
  await expect(docpro.locator('#proGateBanner')).toBeHidden();
  await expect(page.locator('iframe.app-pane[title="DocPro"]')).toBeVisible();
  await expect(docpro.locator('#height')).toBeVisible();
  // DocPro mógł wystartować w tle podczas pauzy Startu i zachować własną
  // pauzę testową. Kończymy ją przed sprawdzeniem startowego widoku;
  // właściwe odtworzenie poniżej ponownie wykonuje clear + pause.
  await docpro.evaluate(() => window.__vildaDobRestoreGate.release());
  await expect(docpro.locator('#results')).toContainText('Wzrost: 29 centyl');
  await odtworzZOpóźnieniem(docpro, pid);
});
