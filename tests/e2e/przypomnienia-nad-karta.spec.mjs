import { expect, test } from '../support/test-czas.mjs';

// P-ARKUSZ na PRAWDZIWEJ stronie: dzienny arkusz przypomnień nie wchodzi na otwartą Kartę
// Pacjenta, ale też się nie gubi — wraca, gdy Karta zostanie zamknięta.
//
// Zgłoszenie i decyzja właściciela (2026-09-19, wariant „odłóż, nie porzuć"). Zegar arkusza
// rusza 3 s po odblokowaniu sejfu (plus do 2,5 s na `syncPull`), a lekarz jest w tym czasie
// już w Karcie. Zmierzone przed poprawką: Karta otwarta w t=219 ms, arkusz wszedł do DOM
// w t=2648 ms — pełnoekranowy, `z-index: 1000001`, nieprzezroczysty, a `elementFromPoint`
// w środku ekranu trafiał w arkusz, nie w Kartę. Arkusz bramkował się wyłącznie datą i nie
// pytał, co jest na ekranie.
//
// Drugi test jest KONTROLĄ: bez otwartej Karty arkusz ma nadal pokazywać się sam. Bez niego
// „naprawą" byłoby ciche wyłączenie funkcji i test pierwszy przeszedłby również wtedy.
//
// Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Arkusz!26a';
// Zegar arkusza (3 s) + oczekiwanie na syncPull (2,5 s) + zapas.
const PO_ZEGARZE_MS = 12_000;

const ARKUSZ = '.vilda-reminders-modal-overlay';

async function kontoZNotatkaNaDzis(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.waitForFunction(() => window.VildaVault.isUnlocked());

  // Bez notatki z terminem NA DZIŚ arkusz nie ma czego pokazać — oba testy byłyby puste.
  const patientId = await page.evaluate(async () => {
    const V = window.VildaVault;
    const zapis = await V.savePatient({
      name: 'Fikcyjny Jan',
      user: { lastName: 'Fikcyjny', firstName: 'Jan', sex: 'M', age: 10, ageMonths: 0, height: 135, weight: 45 },
    }, { dedup: false });
    const id = zapis.patientId || zapis.id;
    const d = new Date();
    const dwa = (n) => String(n).padStart(2, '0');
    await V.savePatientNote({
      patientId: id, title: 'Wizyta kontrolna', body: '', category: 'followup',
      dueDateISO: `${d.getFullYear()}-${dwa(d.getMonth() + 1)}-${dwa(d.getDate())}`,
    });
    return id;
  });

  // Przeładowanie = odblokowanie sejfu = start zegara arkusza.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => Boolean(window.VildaAuthUI));
  return patientId;
}

test('arkusz nie przykrywa otwartej Karty Pacjenta, a po jej zamknięciu sam wraca', async ({ page }) => {
  test.setTimeout(180_000);
  const patientId = await kontoZNotatkaNaDzis(page);

  // Lekarz wchodzi w Kartę, zanim zegar arkusza dobiegnie.
  await page.evaluate((id) => window.VildaAuthUI.showPatientEditScreen(id), patientId);
  await expect(page.getByRole('button', { name: 'Zapisz zmiany' })).toBeVisible({ timeout: 15000 });

  await page.waitForTimeout(PO_ZEGARZE_MS);

  const przyKarcie = await page.evaluate((sel) => {
    const ov = document.querySelector(sel);
    const root = document.getElementById('vilda-auth-ui-root');
    const srodek = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return {
      arkusz: !!(ov && ov.offsetHeight > 0),
      // kontrola: Karta naprawdę była otwarta przez cały ten czas, więc test nie jest trywialny
      karta: !!(root && root.offsetHeight > 0 && getComputedStyle(root).display !== 'none'),
      przykrywaSrodek: !!(ov && srodek && (ov === srodek || ov.contains(srodek))),
    };
  }, ARKUSZ);

  expect(przyKarcie.karta, 'kontrola: Karta Pacjenta jest otwarta').toBe(true);
  expect(przyKarcie.arkusz, 'arkusz nie wchodzi na otwartą Kartę').toBe(false);
  expect(przyKarcie.przykrywaSrodek, 'nic nie przykrywa środka ekranu').toBe(false);

  // Zamknięcie Karty — odłożony arkusz ma wrócić sam, bez klikania w dzwoneczek.
  await page.evaluate(() => window.VildaAuthUI.hide());
  await expect(page.locator(ARKUSZ), 'arkusz wraca po zamknięciu Karty')
    .toBeVisible({ timeout: 30_000 });
});

test('kontrola: bez otwartej Karty arkusz nadal pokazuje się sam', async ({ page }) => {
  test.setTimeout(180_000);
  await kontoZNotatkaNaDzis(page);
  await expect(page.locator(ARKUSZ), 'dzienny przegląd działa jak dotąd')
    .toBeVisible({ timeout: 30_000 });
});
