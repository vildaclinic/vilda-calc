import { expect, test } from '../support/test-czas.mjs';

// P-GH-PROGRAM-ODBLOKUJ: pole „Program terapeutyczny” (#therProg) w karcie leczenia GH/IGF-1 jest zablokowane, gdy
// monitor ma punkty leczenia (program wynika z punktu „Włączenie”). Po „Wyczyść wszystkie pola” albo usunięciu ostatniego
// punktu lista jest pusta, więc pole ma się odblokować bez przeładowania strony. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhProgramOdblokuj!26';
const P1 = {
  id: 'gh-e2e-p1', type: 'start', ageYears: 8, ageMonths: 0, weight: 25, height: 122, boneAge: null,
  dose: 0.028, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP',
  igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.7,
};

async function docproZPunktem(page) {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })); } catch (_) { /* pomiń */ }
  });
  await page.route(/^https:\/\/vilda-sync\./, (route) => route.abort());
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function' && Boolean(window.vildaGhIgfPersistApi), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate((punkt) => {
    window.vildaGhIgfPersistApi.ensureMounted();
    const karta = document.getElementById('ghIgfTherapyCard');
    karta.style.display = 'block';
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
    set('age', '9'); set('ageMonths', '0'); set('sex', 'M'); set('height', '130'); set('weight', '29');
    if (typeof window.update === 'function') window.update();
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', [punkt], { force: true });
    window.refreshGHTherapyMonitor();
  }, P1);
  await expect(page.locator('#therProg')).toBeDisabled();
  await expect(page.locator('#therProg')).toHaveValue('SNP');
}

test('„Wyczyść wszystkie pola” odblokowuje program terapeutyczny', async ({ page }) => {
  await docproZPunktem(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.evaluate(() => document.getElementById('clearAllDataBtn').click());
  await expect.poll(() => page.evaluate(() => (window.ghTherapyPoints || []).length)).toBe(0);
  await expect(page.locator('#ghTherapyTbody')).toContainText('Brak zapisanych punktów leczenia.');
  await expect(page.locator('#therProg')).toBeEnabled();
});

test('usunięcie ostatniego punktu odblokowuje program terapeutyczny', async ({ page }) => {
  await docproZPunktem(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.evaluate(() => window.ghActivateTab && window.ghActivateTab('mon'));
  await page.evaluate(() => document.querySelector('#ghTherapyTbody .delete-gh-pt-btn').click());
  // Potwierdzenie monitora (#ghDeleteOverlay): „Anuluj” / „Usuń”.
  await page.locator('#ghDeleteOverlay').getByRole('button', { name: 'Usuń', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window.ghTherapyPoints || []).length)).toBe(0);
  await expect(page.locator('#therProg')).toBeEnabled();
});
