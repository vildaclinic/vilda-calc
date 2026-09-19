import { expect, test } from '../support/test-czas.mjs';

// P-ZRODLA na PRAWDZIWEJ ścieżce: zaznaczenie „Zespół Downa" w Karcie Pacjenta przestawia
// siatki strony głównej BEZ przeładowania.
//
// Zgłoszenie właściciela (2026-09-19): „trzeba go zaznaczyć, potem jak się wróci na stronę
// główną, to trzeba ją przeładować, żeby ta funkcja zaczęła działać".
//
// Zmierzona przyczyna to WYŚCIG, nie opóźnienie: `vilda_ds_source.js` odświeżał flagę
// asynchronicznie (`VildaVault.getPatient(...).then(...)`) i nie ogłaszał tego nikomu,
// a karta główna przemalowywała się tylko przy okazji — zdarzeniem `input` ze ścieżki
// zapisu, w pomiarze ~2,3 s po zamknięciu Karty. Kto przegrał ten wyścig, zostawał na
// siatce populacyjnej aż do F5.
//
// DLATEGO TEN TEST SPOWALNIA ODCZYT SEJFU. Testowy sejf ma 10 000 iteracji PBKDF2 i pusty
// rekord, więc odczyt rozstrzyga się w kilkanaście milisekund i wyścig wygrywa ZAWSZE —
// bez spowolnienia test byłby zielony także na zepsutym kodzie (zmierzone: bez opóźnienia
// wynik poprawiał się sam w t≈3,3 s; z opóźnieniem 6 s był nadal stary 20 s po zapisie).
//
// Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#DsPrzel!26a';
const OPOZNIENIE_SEJFU_MS = 6000;

async function otworz(page) {
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
  await page.waitForFunction(() => Boolean(window.VildaBmi) && Boolean(window.VildaAuthUI)
    && Boolean(window.VildaDsSource) && Boolean(window.VildaZrodlaPacjenta));
}

async function wypelnij(page, pola) {
  await page.evaluate((p) => {
    for (const [id, v] of Object.entries(p)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, pola);
}

test('zaznaczenie rozpoznania w Karcie przestawia stronę główną bez przeładowania — także gdy sejf odpowiada wolno', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  await wypelnij(page, { sex: 'M', age: '10', ageMonths: '0', weight: '45', height: '135' });

  const wiersz = page.locator('#bmiResult');
  await expect(wiersz).toBeVisible({ timeout: 15000 });
  await expect(wiersz, 'przed rozpoznaniem — bez noty o siatce DS').not.toContainText('Downa');

  const centyl = () => wiersz.evaluate((el) => {
    const m = el.textContent.match(/(\d+)\s*centyl/);
    return m ? Number(m[1]) : null;
  });
  const przed = await centyl();
  expect(przed, 'kontrola: karta główna w ogóle policzyła centyl').toBeGreaterThan(0);

  // pacjent zapisany i wczytany — tak, jak u lekarza przed wejściem w Kartę
  const patientId = await page.evaluate(async () => {
    const w = await window.VildaVault.savePatient({
      name: 'Fikcyjny Jan',
      user: { lastName: 'Fikcyjny', firstName: 'Jan', sex: 'M', age: 10, ageMonths: 0, height: 135, weight: 45 },
    }, { dedup: false });
    return w.patientId;
  });
  await page.evaluate((id) => {
    window._vildaCurrentPatientId = id;
    try { window.sessionStorage.setItem('vildaCurrentPatientId', id); } catch (_) { /* brak storage */ }
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id } }));
  }, patientId);

  // Karta Pacjenta → zaznaczenie pola → zapis
  await page.evaluate((id) => window.VildaAuthUI.showPatientEditScreen(id), patientId);
  await expect(page.getByRole('button', { name: 'Zapisz zmiany' })).toBeVisible({ timeout: 15000 });
  await page.locator('#vePatientDownSyndrome').check();

  // Spowolnienie WŁĄCZAMY dopiero teraz — ekran edycji jest już wczytany, a spowolnić chcemy
  // wyłącznie odczyt, który odświeża flagę po zapisie.
  await page.evaluate((ms) => {
    const g = window.VildaVault.getPatient.bind(window.VildaVault);
    window.VildaVault.getPatient = function () {
      const a = arguments;
      return new Promise((res, rej) => { setTimeout(() => { g.apply(null, a).then(res, rej); }, ms); });
    };
  }, OPOZNIENIE_SEJFU_MS);

  await page.getByRole('button', { name: 'Zapisz zmiany' }).click();

  // Bez przeładowania i bez dotykania formularza: strona ma sama dojść do siatki DS.
  await expect(wiersz, 'strona główna po zapisie rozpoznania').toContainText('Downa', { timeout: 40_000 });

  const poZapisie = await centyl();
  const oczekiwane = await page.evaluate(() => {
    const ds = window.VildaBmi.policz({ bmi: 45 / 1.35 ** 2, plec: 'M', wiekMies: 120, zrodlo: 'OLAF', populacja: 'DS' });
    const og = window.VildaBmi.policz({ bmi: 45 / 1.35 ** 2, plec: 'M', wiekMies: 120, zrodlo: 'OLAF', populacja: 'OGOLNA' });
    return { ds: Math.round(ds.centyl), ogolna: Math.round(og.centyl) };
  });
  expect(oczekiwane.ds, 'kontrola: siatka DS naprawdę daje inną liczbę').not.toBe(oczekiwane.ogolna);
  expect(poZapisie, 'centyl karty głównej liczony na siatce DS').toBe(oczekiwane.ds);
  expect(poZapisie, 'i rzeczywiście zmieniony wobec stanu sprzed zapisu').not.toBe(przed);
});
