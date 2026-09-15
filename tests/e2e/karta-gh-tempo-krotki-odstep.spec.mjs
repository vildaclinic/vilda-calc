import { expect, test } from '../support/test-czas.mjs';

// P-TEMPO-6 (zgłoszenie właściciela 2026-09-15) — u pacjenta leczonego hormonem wzrostu od
// 5 miesięcy zakładka „Dane analityczne" Karty pacjenta pokazywała „Przyrost całkowity +5,0 cm
// przez 5 mies.", a obok kafelek „Tempo wzrastania —". Zgodnie z decyzją 1 z P-TEMPO-4 krótki
// odstęp ma być pokazany z oznaczeniem, bez werdyktu — tak jak w monitorze GH.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhKrotki!26a';

test('Karta pacjenta, warstwa GH: tempo z 5 mies. pokazane z oznaczeniem „krótki odstęp", nie pustą kreską', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && typeof window.saveUserData === 'function');
  await page.waitForTimeout(1200);

  // Dziewczynka 10 lat, 127 cm; punkt „Rozpoczęcie" 9 l. 7 mies., 122 cm; „Kontynuacja" 10 l. 0 mies., 127 cm.
  await page.evaluate(() => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('lastName', 'Fikcyjna'); set('firstName', 'Gh');
    set('age', '10'); set('ageMonths', '0'); set('sex', 'F'); set('height', '127'); set('weight', '27');
    const pts = [
      { id: 'gh-e2e-start', type: 'start', ageYears: 9, ageMonths: 7, height: 122, weight: 25, boneAge: 8.5 },
      { id: 'gh-e2e-cont', type: 'continue', ageYears: 10, ageMonths: 0, height: 127, weight: 27 },
    ];
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', pts, { force: true });
    window.ghTherapyPoints = pts;
  });
  expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await page.waitForTimeout(800);
  const pid = await page.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, () => {}, null), pid);

  const btn = page.locator('.vilda-gha-btn').first();
  await expect(btn).toBeVisible({ timeout: 15000 });
  await btn.click();
  const panel = page.locator('.vilda-gha-panel').first();
  await expect(panel).toBeVisible();
  const tekst = (await panel.textContent()).replace(/\s+/g, ' ');
  expect(tekst).toContain('Przyrost całkowity+5,0 cmprzez 5 mies.');
  // Kontrola pozytywna zgłoszenia: kafelek nie jest pusty.
  expect(tekst).not.toContain('Tempo wzrastania—');
  expect(tekst).toContain('Tempo wzrastania12 cm/rokod włączenia (z 5 mies., krótki odstęp)');
  expect(tekst, 'nota panelu opisuje regułę krótkiego odstępu').toContain('przy krótszym odstępie liczone z ostatniego odcinka');
});
