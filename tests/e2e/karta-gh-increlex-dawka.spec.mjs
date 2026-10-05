import { expect, test } from '../support/test-czas.mjs';

// P-GH-INCRELEX-KARTA (polecenie właściciela 2026-10-05): pole „Aktualna dawka" w karcie „Leczony IGF-1
// (mekasermina)" w Karcie pacjenta pokazuje dawkę Increlex na podanie 2× na dobę — tak jak karta terapii,
// monitor i wpis do Terminarza (P-GH-INCRELEX-PODANIE). Punkt trzyma `dose` w mg/kg/d i `doseAbs` w mg/d.
//
// ZMIERZONE przed zmianą (`audyt` 72f62e0), te same kroki: „Aktualna dawka0,24 mg/kg/d" (punkt 20 kg,
// 2 × 2,4 mg) i „Aktualna dawka0,08 mg/kg/d" (stary punkt 13 kg bez doseAbs) — dawka dobowa na kg, której
// karta terapii już nie pokazuje jako głównej.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhIncKarta!26';

async function kartaPacjenta(page, punkty) {
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

  await page.evaluate((pts) => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('lastName', 'Fikcyjny'); set('firstName', 'Igf');
    set('age', '8'); set('ageMonths', '0'); set('sex', 'M'); set('height', '112'); set('weight', '20');
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', pts, { force: true });
    window.ghTherapyPoints = pts;
  }, punkty);
  expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await page.waitForTimeout(800);
  const pid = await page.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, () => {}, null), pid);

  const karta = page.locator('.vilda-gh-summary').first();
  await expect(karta).toBeVisible({ timeout: 15000 });
  return String(await karta.textContent() || '').replace(/\s+/g, ' ');
}

test('Karta pacjenta, Increlex: „Aktualna dawka" w dawce na podanie (2 × 2,4 mg, 0,12 mg/kg na podanie)', async ({ page }) => {
  test.setTimeout(120_000);
  // Punkty zapisane po P-GH-INCRELEX-PODANIE: dose = 2 × podanie / masa (mg/kg/d), doseAbs = 2 × podanie (mg/d).
  const karta = await kartaPacjenta(page, [
    { id: 'igf-e2e-s', type: 'start', ageYears: 7, ageMonths: 6, height: 108, weight: 19, program: 'IGF-1',
      drug: 'Increlex 40 mg', dose: 1.6 / 19, doseAbs: 1.6, doseUnit: 'mg/kg/d' },
    { id: 'igf-e2e-c', type: 'continue', ageYears: 8, ageMonths: 0, height: 112, weight: 20, program: 'IGF-1',
      drug: 'Increlex 40 mg', dose: 0.24, doseAbs: 4.8, doseUnit: 'mg/kg/d' },
  ]);
  expect(karta).toContain('Leczony IGF-1 (mekasermina)');
  expect(karta).toContain('Aktualna dawka2 × 2,4 mg na dobę (0,12 mg/kg na podanie)');
  expect(karta).not.toContain('mg/kg/d');
});

test('Karta pacjenta, Increlex: stary punkt bez doseAbs — dawka na podanie z mg/kg/d × masa', async ({ page }) => {
  test.setTimeout(120_000);
  // Punkt sprzed P-GH-DAWKA-PODAWANA: tylko dose (mg/kg/d) i masa; 0,08 × 13 = 1,04 mg/d → 2 × 0,52 mg.
  const karta = await kartaPacjenta(page, [
    { id: 'igf-e2e-old', type: 'start', ageYears: 8, ageMonths: 0, height: 112, weight: 13, program: 'IGF-1',
      drug: 'Increlex 40 mg', dose: 0.08, doseUnit: 'mg/kg/d' },
  ]);
  expect(karta).toContain('Aktualna dawka2 × 0,52 mg na dobę (0,04 mg/kg na podanie)');
});

test('Karta pacjenta, GH (kontrola): „Aktualna dawka" bez zmian — mg/kg/d', async ({ page }) => {
  test.setTimeout(120_000);
  const karta = await kartaPacjenta(page, [
    { id: 'gh-e2e-s', type: 'start', ageYears: 7, ageMonths: 6, height: 108, weight: 19, program: 'SNP',
      drug: 'Genotropin 12 mg', dose: 0.025, doseAbs: 0.45, doseUnit: 'mg/kg/d' },
    { id: 'gh-e2e-c', type: 'continue', ageYears: 8, ageMonths: 0, height: 112, weight: 20, program: 'SNP',
      drug: 'Genotropin 12 mg', dose: 0.025, doseAbs: 0.5, doseUnit: 'mg/kg/d' },
  ]);
  expect(karta).toContain('Leczony hormonem wzrostu (rhGH)');
  expect(karta).toContain('Aktualna dawka0,025 mg/kg/d');
  expect(karta).not.toContain('na podanie');
});
