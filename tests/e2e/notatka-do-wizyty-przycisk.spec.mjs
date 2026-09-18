import { expect, test } from '../support/test-czas.mjs';

// P-NOTATKI rata 2 (audyt „Dodaj notatkę do wizyty" 2026-09-18).
//
// G11 — cała ścieżka przycisku (bramka → klik → suggestLinkedAge → edytor) nie miała żadnego
//       testu na żywej stronie; wszystkie dotychczasowe e2e otwierały edytor wprost przez
//       `showPatientNoteEditor`.
// G8  — kotwica liczyła się przez `parseInt(#age)`, więc 5,5 roku dawało 60 mies., a zapisany
//       pomiar 66. Notatka wisiała w Historii pod wiekiem, dla którego pomiaru nie było.
// G24 — „Wpisz datę zdarzenia" bez daty (i godzina/długość bez daty przypomnienia) po cichu
//       gubiły wybór: notatka lądowała w „Bez przypisanego pomiaru", bez słowa komentarza.
// G22 — edytor nie był oknem modalnym dla klawiatury: bez role/aria-modal i bez Escape.

const HASLO = 'E2e#Wizyta!2026';

const stanPrzycisku = (page) => page.evaluate(() => {
  const btn = document.getElementById('addVisitNoteBtnSidebar');
  return {
    wylaczony: btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true',
    tip: btn.getAttribute('data-tip'),
  };
});

// `docpro.html` trzyma pola formularza w panelu, który bywa zwinięty — wartości ustawiamy więc
// przez DOM ze zdarzeniami `input`/`change`, tak jak zrobiłaby je przeglądarka.
async function wpiszPomiar(page, pola) {
  await page.evaluate((wartosci) => {
    Object.keys(wartosci).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = wartosci[id];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, pola);
}

async function przygotuj(page, strona) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch { /* brak storage — pomiń */ }
  });
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });
  await page.goto(strona, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
  await page.waitForSelector('#addVisitNoteBtnSidebar', { state: 'attached' });
  // Bramka przelicza się na zdarzeniach formularza i sesji; po `createUser` trzeba jej dać
  // dojść do stanu „zalogowany, ale bez pacjenta" — inaczej łapiemy jeszcze podpowiedź o logowaniu.
  await expect
    .poll(async () => (await stanPrzycisku(page)).tip, { timeout: 15000 })
    .toBeTruthy();
}

// Pacjent z pomiarem 66 mies. (5,5 roku) — dokładnie przypadek z G8.
async function wczytajPacjenta(page) {
  const patientId = await page.evaluate(async () => {
    const zapis = await window.VildaVault.savePatient({
      name: 'Testowa Pacjentka', sex: 'K', age: 5.5, height: 110, weight: 19,
    });
    window._vildaCurrentPatientId = zapis.patientId;
    try { window.sessionStorage.setItem('vildaCurrentPatientId', zapis.patientId); } catch { /* bez znaczenia */ }
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: zapis.patientId } }));
    return zapis.patientId;
  });
  await wpiszPomiar(page, { age: '5.5', height: '110', weight: '19' });
  return patientId;
}

const klik = (page) => page.evaluate(() => {
  const btn = document.getElementById('addVisitNoteBtnSidebar');
  btn.scrollIntoView();
  btn.click();
});

for (const strona of ['/index.html', '/docpro.html']) {
  test(`G11 — przycisk „Dodaj notatkę do wizyty" na ${strona}`, async ({ page }) => {
    await przygotuj(page, strona);

    // Bez pacjenta w bazie bramka trzyma przycisk wyłączony i mówi, czego brakuje (G20).
    await expect.poll(async () => (await stanPrzycisku(page)).tip, { timeout: 15000 }).toContain('Pacjenci');
    const przed = await stanPrzycisku(page);
    expect(przed.wylaczony).toBe(true);
    await klik(page);
    await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);

    await wczytajPacjenta(page);
    await expect.poll(async () => (await stanPrzycisku(page)).wylaczony).toBe(false);

    await klik(page);
    const arkusz = page.locator('.vilda-patient-note-editor-overlay .vilda-pne');
    await expect(arkusz).toBeVisible();

    // G8: kotwica to 66 mies. (5,5 roku), a nie 60 — i zgadza się z zapisanym pomiarem.
    const opcja = arkusz.locator('label.b3-anchor-option', { hasText: 'Powiąż z wizytą' });
    await expect(opcja).toContainText('5 lat 6 mies.');
    const wiekiPomiarow = await page.evaluate(async (id) => {
      const zdarzenia = await window.VildaVault.listPatientTimelineEvents(id);
      return zdarzenia.filter((z) => z.type === 'measurement').map((z) => z.ageMonths);
    }, await page.evaluate(() => window._vildaCurrentPatientId));
    expect(wiekiPomiarow).toContain(66);

    // G22: edytor przedstawia się jako okno modalne i zamyka się Escape.
    await expect(arkusz).toHaveAttribute('role', 'dialog');
    await expect(arkusz).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
  });
}

test('G24 — „Wpisz datę zdarzenia" bez daty zatrzymuje zapis', async ({ page }) => {
  await przygotuj(page, '/index.html');
  await wczytajPacjenta(page);
  await expect.poll(async () => (await stanPrzycisku(page)).wylaczony).toBe(false);
  await klik(page);
  const arkusz = page.locator('.vilda-patient-note-editor-overlay .vilda-pne');
  await expect(arkusz).toBeVisible();

  await arkusz.locator('input[name="b3-anchor"][value="date"]').check();
  await arkusz.locator('textarea').first().fill('Treść notatki kontrolnej');
  await arkusz.getByRole('button', { name: 'Dodaj notatkę' }).click();

  await expect(arkusz).toContainText('Wpisz datę zdarzenia albo wybierz inną opcję powiązania.');
  await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(1);
  expect(await page.evaluate(async () => (await window.VildaVault.listAllPatientNotes()).length)).toBe(0);
});

test('G8 — bez zapisanego pomiaru dla kotwicy edytor ostrzega, ale nie blokuje', async ({ page }) => {
  await przygotuj(page, '/index.html');
  await page.evaluate(async () => {
    const zapis = await window.VildaVault.savePatient({
      name: 'Bez Pomiaru', sex: 'M', age: 3, height: 95, weight: 14,
    });
    window._vildaCurrentPatientId = zapis.patientId;
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: zapis.patientId } }));
  });
  // Nowy pomiar wpisany w formularzu, ale jeszcze NIE zapisany przyciskiem „Zapisz dane".
  await wpiszPomiar(page, { age: '4', height: '102', weight: '16' });
  await expect.poll(async () => (await stanPrzycisku(page)).wylaczony).toBe(false);
  await klik(page);

  const arkusz = page.locator('.vilda-patient-note-editor-overlay .vilda-pne');
  await expect(arkusz).toBeVisible();
  await expect(arkusz).toContainText('Dla tego wieku nie ma jeszcze zapisanego pomiaru');
  // Ostrzeżenie, nie blokada: zapis przechodzi (decyzja właściciela D7).
  await arkusz.locator('textarea').first().fill('Notatka przed zapisem pomiaru');
  await arkusz.getByRole('button', { name: 'Dodaj notatkę' }).click();
  await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
  expect(await page.evaluate(async () => (await window.VildaVault.listAllPatientNotes()).length)).toBe(1);
});

// `custom-fixes.js` (bramka) jest wpięty tylko na stronach z formularzem pacjenta, więc na
// terminarzu podpowiedź ustawia `vilda_chrome.js` — i musi mówić co innego niż o polach formularza.
test('G20 — na stronie bez formularza pacjenta podpowiedź kieruje na Start/DocPro (D11)', async ({ page }) => {
  await przygotuj(page, '/terminarz.html');
  await expect.poll(async () => (await stanPrzycisku(page)).tip, { timeout: 15000 }).toContain('Start i DocPro');
  const stan = await stanPrzycisku(page);
  expect(stan.wylaczony).toBe(true);
  await klik(page);
  await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
});
