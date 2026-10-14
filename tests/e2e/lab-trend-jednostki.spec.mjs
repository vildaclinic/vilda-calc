import { expect, test } from '../support/test-czas.mjs';

// P-LAB-TREND-CONVERT: wynik zapisany w innej znanej jednostce trafia do „Trendu wyników”
// przeliczony tym samym współczynnikiem co przelicznik. Start ładuje konwerter od razu,
// DocPro doładowuje go leniwie w karcie — trend ma działać na obu stronach.
// Każdy test zakłada świeży, fikcyjny sejf w osobnym kontekście przeglądarki.
test.use({ serviceWorkers: 'block' });

async function openVault(page, path) {
  await page.route('**/*', (route) => route.request().url().startsWith('http://127.0.0.1:')
    ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
  });
  await page.goto(path, { waitUntil: 'load' });
  await page.evaluate(() => window.VildaSession?.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#Trend!2026', { label: 'Fikcyjny sejf trendu', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && Boolean(window.VildaAuthUI));
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  return page.evaluate(async () => (await window.VildaVault.savePatient({
    name: 'Fikcyjna Trendowa', user: { name: 'Fikcyjna Trendowa', sex: 'F', age: 34, ageMonths: 0, height: 165, weight: 60 },
  }, { dedup: false })).patientId);
}

async function saveFt4(page, patientId) {
  await page.evaluate(async (pid) => {
    const entries = [
      { date: '2026-05-26', value: '15 pmol/L', valueNum: 15, unit: 'pmol/L', age: 410 },
      { date: '2026-07-07', value: '1,2 ng/dL', valueNum: 1.2, unit: 'ng/dL', age: 412 },
      { date: '2026-09-02', value: '17 pmol/L', valueNum: 17, unit: 'pmol/L', age: 414 },
    ];
    for (const e of entries) {
      await window.VildaVault.savePatientNote({
        patientId: pid, title: 'Fikcyjne fT4', body: 'Fikcyjny wpis trendu', category: 'wynik-badania',
        clinicalDateISO: e.date, linkedAgeMonths: e.age,
        labResult: { test: 'fT4 (wolna tyroksyna)', testKey: 'ft4', value: e.value, valueNum: e.valueNum, unit: e.unit },
      });
    }
  }, patientId);
}

for (const path of ['/index.html', '/docpro.html']) {
  test(`${path}: fT4 w ng/dL trafia do trendu w pmol/L, bez „pominięto”`, async ({ page }) => {
    const patientId = await openVault(page, path);
    await saveFt4(page, patientId);
    await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid), patientId);
    await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
    const trend = page.locator('.vilda-patient-tab-content[data-tab="timeline"] .vilda-lab-trend-section');
    await expect(trend).toBeVisible();
    await expect(trend.locator('button.vilda-lab-trend-chip:not(.vilda-trend-norm-chip)')).toHaveText(/fT4 ×3/);
    await expect(trend.locator('.vilda-lab-trend-foot')).not.toContainText('pominięto');
    // Punkt przeliczony ma na wykresie obwódkę, jak dotąd; jego wartość to 1,2 × 12,87 = 15,444 pmol/L.
    await expect(trend.locator('svg circle[stroke="#26215C"]')).toHaveCount(1);
    await expect(trend.locator('svg')).toContainText('15,4');
  });
}
