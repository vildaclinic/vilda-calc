import { expect, test } from '../support/test-czas.mjs';

// P-DS-5 na PRAWDZIWEJ stronie: pole „Zespół Downa" w karcie pacjenta.
//
// Zgłoszenie właściciela (1.0.971): „na środku dużego pustego pola jest checkbox a etykieta
// jest przesunięta skrajnie na prawo". Przyczyna źródłowa NIE była w tym polu — globalna reguła
// `input,select,option{width:100%;padding:.45rem;border:1px solid #ccc}` w style.css obejmuje
// także pola wyboru, więc checkbox rozciągał się na całą szerokość wiersza (to „puste pole"
// było rozdmuchanym checkboxem z ramką), a etykieta lądowała przy prawej krawędzi.
//
// Ten test mierzy GEOMETRIĘ na żywym ekranie, a nie obecność klasy w CSS: asercja na samą klasę
// przeszłaby również wtedy, gdyby globalna reguła znowu wygrała specyficznością. Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#DsPole!26a';

async function otworzZKontem(page) {
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
  await page.waitForFunction(() => Boolean(window.VildaAuthUI));
}

async function otworzEdycje(page) {
  const patientId = await page.evaluate(async () => {
    const w = await window.VildaVault.savePatient({
      name: 'Testowy Pacjent',
      user: { lastName: 'Testowy', firstName: 'Pacjent', sex: 'M', age: 10, ageMonths: 0, height: 135, weight: 45 },
    }, { dedup: false });
    return w.patientId;
  });
  await page.evaluate((id) => window.VildaAuthUI.showPatientEditScreen(id), patientId);
  await expect(page.getByRole('button', { name: 'Zapisz zmiany' })).toBeVisible();
  return patientId;
}

test('pole „Zespół Downa" ma checkbox wielkości checkboxa, a etykieta stoi tuż obok', async ({ page }) => {
  await otworzZKontem(page);
  await otworzEdycje(page);

  const pole = page.locator('#vePatientDownSyndrome');
  await expect(pole).toBeVisible({ timeout: 15000 });
  await pole.scrollIntoViewIfNeeded();

  const geom = await pole.evaluate((el) => {
    const wiersz = el.closest('label');
    const opis = wiersz.querySelector('.ve-check-txt');
    const c = el.getBoundingClientRect();
    const w = wiersz.getBoundingClientRect();
    const t = opis.getBoundingClientRect();
    return {
      checkboxW: c.width, checkboxH: c.height, wierszW: w.width,
      odstep: t.left - c.right,
      tytulLewaKrawedz: t.left - w.left,
      etykietaJestWierszem: wiersz.tagName === 'LABEL',
    };
  });

  // to była istota zgłoszenia: checkbox ma być checkboxem, nie pasem na całą szerokość
  expect(geom.checkboxW, 'szerokość checkboxa').toBeLessThanOrEqual(24);
  expect(geom.checkboxH, 'wysokość checkboxa').toBeLessThanOrEqual(24);
  expect(geom.wierszW, 'kontrola: wiersz jest szeroki, więc test nie jest trywialny').toBeGreaterThan(200);
  expect(geom.checkboxW, 'checkbox nie rozciąga się na wiersz').toBeLessThan(geom.wierszW / 3);
  // etykieta tuż obok pola, a nie przy prawej krawędzi
  expect(geom.odstep, 'odstęp pole ↔ opis').toBeLessThan(24);
  expect(geom.tytulLewaKrawedz, 'opis zaczyna się przy lewej krawędzi wiersza').toBeLessThan(60);
  expect(geom.etykietaJestWierszem, 'cały wiersz jest <label>').toBe(true);

  // opis mówi, CO się zmieni — nie sama nazwa rozpoznania
  const wiersz = page.locator('#vePatientDownSyndrome').locator('xpath=ancestor::label[1]');
  await expect(wiersz).toContainText('Zespół Downa');
  await expect(wiersz).toContainText('Zemel 2015');

  // klikalny w całości: kliknięcie w tekst przestawia pole
  await expect(pole).not.toBeChecked();
  await wiersz.locator('.ve-check-txt b').click();
  await expect(pole).toBeChecked();
});
