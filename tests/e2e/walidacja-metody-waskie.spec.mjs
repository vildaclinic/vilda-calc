import { expect, test } from '@playwright/test';

// P-WALIDACJA-DECYZJE, decyzja 3 (2026-09-15): metoda wąskiego wskazania stoi w tabeli
// „Walidacji prognoz", gdy PROFIL pacjenta jej dotyczy — także wtedy, gdy się nie policzyła —
// a komórka mówi, czego brakuje. Dotąd kolumna po prostu znikała i lekarz nie dowiadywał się,
// że dopisanie jednej liczby (np. wzrostu przy menarche) włączyłoby metodę.
// Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Waskie!26ff';

async function otworzZPacjentka(page) {
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
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaGrowthPredictionValidationModel) && Boolean(window.VildaAuthUI));

  // Dziewczynka po menarche (12,5 r.ż.) z zapisanym wiekiem menarche, ale BEZ wzrostu przy
  // menarche; wzrost ostateczny 163 cm w 17 l. Wiek kostny tylko w dwóch punktach.
  return page.evaluate(async () => {
    const w = await window.VildaVault.savePatient({
      name: 'Testowa Zofia',
      user: { lastName: 'Testowa', firstName: 'Zofia', sex: 'K', age: 17, ageMonths: 0, height: 163, weight: 55 },
      puberty: { menarcheAgeYears: 12.5 },
      advanced: {
        motherHeight: 162, fatherHeight: 176, boneAgeYears: 16,
        data: { measurements: [
          { ageMonths: 132, ageYears: 11, height: 143, weight: 36, boneAgeYears: 11 },
          { ageMonths: 156, ageYears: 13, height: 156, weight: 46 },
          { ageMonths: 180, ageYears: 15, height: 161.5, weight: 52, boneAgeYears: 14.5 },
        ] },
      },
    }, { dedup: false });
    return w.patientId;
  });
}

test('kolumna „wzrost przy menarche" stoi u dziewczynki z wiekiem menarche i mówi, czego brakuje', async ({ page }) => {
  test.setTimeout(120_000);
  const id = await otworzZPacjentka(page);
  await page.evaluate((patientId) => window.VildaAuthUI.showPatientCard(patientId), id);
  const kafelek = page.locator('.vgpv-tile');
  await expect(kafelek).toBeVisible({ timeout: 20000 });
  await kafelek.click();

  const naglowki = await page.evaluate(() => Array.from(
    document.querySelectorAll('.vgpv-tbl thead th')).map((t) => (t.textContent || '').trim()));
  expect(naglowki.some((t) => /Wzrost przy menarche/.test(t)), `nagłówki: ${naglowki.join(' | ')}`).toBe(true);
  expect(naglowki.some((t) => /TW Mark II/.test(t)), 'wiek kostny jest w punktach → TW Mark II stoi').toBe(true);

  const powody = await page.evaluate(() => Array.from(
    document.querySelectorAll('.vgpv-tbl td .vgpv-cellwhy')).map((t) => (t.textContent || '').trim()));
  expect(powody, 'punkt po menarche bez wzrostu przy menarche').toContain('brak wzrostu przy menarche');
  expect(powody, 'punkt sprzed menarche').toContain('przed menarche');
  expect(powody, 'punkt TW Mark II bez wieku kostnego').toContain('brak wieku kostnego');
});
