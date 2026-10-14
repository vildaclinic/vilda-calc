import { expect, test } from '../support/test-czas.mjs';
import { czekajNaBadania, sekcjaBadan } from '../support/karta-czekanie.mjs';

// P-LAB-TREND-CONVERT: wynik zapisany w innej znanej jednostce trafia na wykres przeliczony tym samym
// współczynnikiem co przelicznik. Konwerter ładuje się leniwie: Start w czasie bezczynności albo przy
// pierwszym dotknięciu, DocPro dopiero na żądanie karty — wykres ma działać na obu stronach, także gdy
// konwerter jeszcze się ładuje. Od LAB-HISTORIA PR2 (decyzja 6.12) wykres trendu jest w zakładce „Badania”
// (ten sam renderer Nl), a „Historia” go nie rysuje.
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
  test(`${path}: fT4 w ng/dL trafia na wykres w pmol/L, bez „poza wykresem”`, async ({ page }) => {
    const patientId = await openVault(page, path);
    await saveFt4(page, patientId);
    await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid), patientId);
    await page.locator('.vilda-patient-tab[data-tab="lab"]').click();
    await czekajNaBadania(page);
    const card = sekcjaBadan(page).locator('.vilda-lab-hist-card[data-series="ft4"]');
    await expect(card).toBeVisible();
    await expect(card.locator('.vilda-lab-hist-card-h')).toHaveText(/fT4 pmol\/L · ×3/);
    await expect(card.locator('.vilda-lab-hist-foot')).toHaveCount(0);
    // Punkt przeliczony ma na wykresie obwódkę, jak dotąd; jego wartość to 1,2 × 12,87 = 15,444 pmol/L.
    await expect(card.locator('svg circle[stroke="#26215C"]')).toHaveCount(1);
    await expect(card.locator('svg')).toContainText('15,4');
  });
}
