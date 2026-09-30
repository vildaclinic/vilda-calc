import { expect, test } from '../support/test-czas.mjs';

// P-GH-BEZ-STARTU (zgłoszenie właściciela 2026-09-29) — pacjent z punktami kontrolnymi terapii GH,
// ale bez punktu „Włączenie leczenia". Monitor terapii mówi wtedy „Brak punktu włączenia leczenia…",
// a karta „Leczony hormonem wzrostu (rhGH)" w Karcie pacjenta pokazywała w polu „Włączenie" wiek
// pierwszego punktu kontrolnego, jakby to był wiek włączenia. Panel „Dane analityczne" podpisywał
// ten sam punkt jako „Wzrost przy włączeniu" i liczył od niego „catch-up od włączenia".
//
// Wartości liczbowe się nie zmieniają (baza nadal = pierwszy punkt, jak w monitorze), zmienia się
// tylko to, jak karta ten punkt nazywa.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhBezStartu!26';

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
    set('lastName', 'Fikcyjny'); set('firstName', 'Gh');
    set('age', '10'); set('ageMonths', '0'); set('sex', 'M'); set('height', '127'); set('weight', '27');
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', pts, { force: true });
    window.ghTherapyPoints = pts;
  }, punkty);
  expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await page.waitForTimeout(800);
  const pid = await page.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, () => {}, null), pid);

  const karta = page.locator('.vilda-gh-summary').first();
  await expect(karta).toBeVisible({ timeout: 15000 });
  const btn = page.locator('.vilda-gha-btn').first();
  await btn.click();
  const panel = page.locator('.vilda-gha-panel').first();
  await expect(panel).toBeVisible();
  const norm = (t) => String(t || '').replace(/\s+/g, ' ');
  return { karta: norm(await karta.textContent()), panel: norm(await panel.textContent()) };
}

test('Karta pacjenta, GH bez punktu „Włączenie leczenia": karta nie podaje wieku 1. kontroli jako wieku włączenia', async ({ page }) => {
  test.setTimeout(120_000);
  // Chłopiec; dwa punkty „Kontynuacja": 9 l. 7 mies. (122 cm) i 10 l. 0 mies. (127 cm). Brak „start".
  // Odstęp 5 mies. — tempo idzie drogą „od włączenia" (krótki odstęp), którą ta zmiana przepisuje.
  const { karta, panel } = await kartaPacjenta(page, [
    { id: 'gh-e2e-c1', type: 'continue', ageYears: 9, ageMonths: 7, height: 122, weight: 25, program: 'SNP', drug: 'Genotropin 12 mg', dose: 0.025, doseUnit: 'mg/kg/d' },
    { id: 'gh-e2e-c2', type: 'continue', ageYears: 10, ageMonths: 0, height: 127, weight: 27, program: 'SNP', drug: 'Genotropin 12 mg', dose: 0.025, doseUnit: 'mg/kg/d' },
  ]);

  // Pole „Włączenie" nie może twierdzić, że leczenie włączono w wieku pierwszej kontroli.
  expect(karta).toContain('Leczony hormonem wzrostu (rhGH)');
  expect(karta).not.toContain('Włączeniew wieku');
  expect(karta).toContain('Włączeniebrak punktu');
  expect(karta).toContain('Brak punktu włączenia leczenia (pierwszy zapisany punkt kontrolny: w wieku 9 l. 7 mies.). Dodaj punkt „Włączenie leczenia” w monitorze terapii');
  // Reszta karty bez zmian.
  expect(karta).toContain('Punkty kontrolne2');
  expect(karta).toContain('Ostatnia kontrolaw wieku 10 l. 0 mies.');

  // Panel: te same liczby, ale nazwane od 1. punktu, nie od włączenia.
  expect(panel).not.toContain('przy włączeniu');
  expect(panel).not.toContain('od włączenia');
  expect(panel).toContain('Wzrost w 1. punkcie122 cm');
  expect(panel).toContain('Przyrost od 1. punktu+5,0 cmprzez 5 mies.');
  expect(panel).toContain('Tempo wzrastania12 cm/rokod 1. punktu (z 5 mies., krótki odstęp)');
  expect(panel).toMatch(/Odpowiedź \(ΔhSDS\)[+−-]?\d+,\d{2}od 1\. punktu \(brak punktu włączenia\)/);
});

test('Karta pacjenta, GH z punktem „Włączenie leczenia": karta podaje wiek włączenia jak dotąd (kontrola)', async ({ page }) => {
  test.setTimeout(120_000);
  const { karta, panel } = await kartaPacjenta(page, [
    { id: 'gh-e2e-s', type: 'start', ageYears: 9, ageMonths: 7, height: 122, weight: 25, program: 'SNP', drug: 'Genotropin 12 mg', dose: 0.025, doseUnit: 'mg/kg/d' },
    { id: 'gh-e2e-c2', type: 'continue', ageYears: 10, ageMonths: 0, height: 127, weight: 27, program: 'SNP', drug: 'Genotropin 12 mg', dose: 0.025, doseUnit: 'mg/kg/d' },
  ]);

  expect(karta).toContain('Włączeniew wieku 9 l. 7 mies.');
  expect(karta).not.toContain('Brak punktu włączenia');
  expect(panel).toContain('Wzrost przy włączeniu122 cm');
  expect(panel).toContain('Przyrost całkowity+5,0 cmprzez 5 mies.');
  expect(panel).toContain('Tempo wzrastania12 cm/rokod włączenia (z 5 mies., krótki odstęp)');
  expect(panel).toMatch(/Odpowiedź \(ΔhSDS\)[+−-]?\d+,\d{2}catch-up od włączenia/);
  expect(panel).not.toContain('1. punkt');
});
