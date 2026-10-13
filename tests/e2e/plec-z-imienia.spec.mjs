import { expect, test } from '../support/test-czas.mjs';

// P-PLEC-IMIE (decyzja właściciela 2026-10-12) na PRAWDZIWYCH stronach formularza głównego.
//
// Przed zmianą: pole płci zaczyna od „Mężczyzna”, a lekarz, który zapomni je przestawić, liczy
// „Annę” jako mężczyznę. Teraz płeć NOWEGO pacjenta ustawia się z imienia (słownik PESEL)
// i nazwiska (-ska/-ski) po wyjściu z pola, zawsze z notką pod polem; wybór lekarza wygrywa,
// a odtworzenie, wczytanie i zapis niczego nie przestawiają.
//
// Lekarz pisze klawiaturą (zdarzenia zaufane, jak w gabinecie): fill + Tab, płeć wybierana
// literą na liście. Własne, fikcyjne konto sejfu; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#PlecImie!26a';

async function otworzZKontem(page, strona = '/index.html') {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto(strona, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowe(page);
  if (strona.includes('docpro')) {
    // DocPro wymaga planu PRO — dostęp fikcyjny, jak w pozostałych testach DocPro (bez zależności
    // od zewnętrznego triala).
    await page.evaluate(() => {
      window.VildaProAccess.hasAccess = () => true;
      document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    });
    await expect(page.locator('#lastName')).toBeVisible();
  }
}

async function gotowe(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => typeof window.saveUserData === 'function'
    && Boolean(window.VildaPolaTozsamosci) && Boolean(window.VildaPlecZImienia));
  await page.waitForTimeout(1500); // kaskady odtwarzania po starcie strony
}

/* Lekarz wpisuje i przechodzi Tabem dalej — `change` przychodzi przy wyjściu z pola. */
async function wpisz(page, selektor, tekst) {
  await page.locator(selektor).fill(tekst);
  await page.locator(selektor).press('Tab');
}

/* Lekarz wybiera płeć z listy klawiaturą: litera „k” → Kobieta, „m” → Mężczyzna. */
async function wybierzPlec(page, litera) {
  await page.locator('#sex').focus();
  await page.keyboard.press(litera);
  await page.locator('#sex').press('Tab');
}

const plec = (page) => page.locator('#sex').inputValue();
const notka = (page) => page.locator('#plecZImieniaNote');

async function wpiszPomiary(page) {
  await page.locator('#age').fill('9');
  await page.locator('#weight').fill('30.2');
  await page.locator('#height').fill('134');
  await page.locator('#height').press('Tab');
}

test.describe('Płeć nowego pacjenta z imienia i nazwiska', () => {
  test('nowy pacjent: nazwisko -ska, potem imię — „Kobieta” z notką; zapis blokuje płeć i chowa notkę', async ({ page }) => {
    test.setTimeout(150_000);
    await otworzZKontem(page);
    expect(await plec(page), 'pusty formularz zaczyna od M').toBe('M');
    await expect(notka(page)).toBeHidden();

    await wpisz(page, '#lastName', 'Testowska');
    expect(await plec(page), 'dotąd zostawało M').toBe('F');
    await expect(notka(page)).toHaveText('Płeć ustawiona na podstawie nazwiska „Testowska” — sprawdź.');
    await wpisz(page, '#firstName', 'Anna');
    await expect(notka(page)).toHaveText('Płeć ustawiona na podstawie imienia i nazwiska — sprawdź.');
    await expect(notka(page)).toHaveClass(/vild-dob-note/);
    await expect(notka(page)).not.toHaveClass(/vild-dob-error/);
    expect(await notka(page).getAttribute('title')).toContain('Anna');

    await wpiszPomiary(page);
    expect(await page.evaluate(() => window.collectUserData().user.sex), 'rekord liczy się dla kobiety').toBe('F');
    expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => document.getElementById('sex').disabled), 'po zapisie płeć z kartoteki').toBe(true);
    await expect(notka(page)).toBeHidden();
    const zapisana = await page.evaluate(async () => {
      const [p] = await window.VildaVault.listPatients();
      return (await window.VildaVault.getPatient(p.patientId)).snapshots[0].payload.user.sex;
    });
    expect(zapisana).toBe('F');
  });

  test('wybór lekarza wygrywa; odtworzenie po F5 nie uruchamia automatu, rozbieżność tylko ostrzega', async ({ page }) => {
    test.setTimeout(150_000);
    await otworzZKontem(page);
    await wpisz(page, '#lastName', 'Fikcyjny');
    await wpisz(page, '#firstName', 'Jan');
    expect(await plec(page)).toBe('M');
    await expect(notka(page)).toHaveText('Płeć ustawiona na podstawie imienia „Jan” — sprawdź.');

    await wybierzPlec(page, 'k');
    expect(await plec(page), 'wybór lekarza').toBe('F');
    expect(await page.evaluate(() => window.VildaPlecZImienia.stan())).toBe('lekarz');
    await expect(notka(page)).toHaveText('Sprawdź płeć: imię „Jan” jest zwykle męskie.');
    await expect(notka(page)).toHaveClass(/vild-dob-error/);

    await wpisz(page, '#firstName', 'Piotr');
    expect(await plec(page), 'automat nie przestawia wyboru lekarza').toBe('F');
    await expect(notka(page)).toHaveText('Sprawdź płeć: imię „Piotr” jest zwykle męskie.');

    await page.waitForTimeout(1500); // autozapis sesji formularza
    await page.reload({ waitUntil: 'load' });
    await gotowe(page);
    expect(await page.locator('#firstName').inputValue()).toBe('Piotr');
    expect(await plec(page), 'F5 odtwarza wybór lekarza').toBe('F');
    expect(await page.evaluate(() => window.VildaPlecZImienia.stan())).toBe('zewnetrzna');
    await expect(notka(page)).toHaveText('Sprawdź płeć: imię „Piotr” jest zwykle męskie.');

    await wpisz(page, '#firstName', 'Ewa');
    expect(await plec(page)).toBe('F');
    await expect(notka(page), 'płeć zgodna z imieniem — bez notki').toBeHidden();

    // „Wyczyść” zaczyna nowego pacjenta: automat znów działa.
    await page.evaluate(() => window.clearAllData());
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.VildaPlecZImienia.stan())).toBe('domyslna');
    expect(await plec(page)).toBe('M');
    await wpisz(page, '#firstName', 'Ewa');
    expect(await plec(page)).toBe('F');
  });

  // P-PLEC-IMIE-2 (zgłoszenie właściciela 2026-10-13): drugi nowy pacjent po „Odrzuć dane i wyczyść”
  // zostawał przy „Mężczyzna” z notką „Sprawdź płeć: imię „Anna” jest zwykle żeńskie.”, a po twardym
  // odświeżeniu pierwszy znowu działał. Przyczyna: ~3,2 s po „Wyczyść” custom-fixes.js ponawia `change`
  // na polach lustra formularza (także na płci, bez zmiany wartości). Gdy lekarz zdążył już wpisać
  // nazwisko, moduł brał to powiadomienie za płeć wpisaną z zewnątrz i wyłączał automat.
  test('po „Odrzuć dane i wyczyść” kolejny nowy pacjent też dostaje płeć z imienia — nawet gdy nazwisko wpisano przed odświeżeniem lustra formularza', async ({ page }) => {
    test.setTimeout(150_000);
    await otworzZKontem(page);
    await wpisz(page, '#lastName', 'Fikcyjna');
    await wpisz(page, '#firstName', 'Anna');
    expect(await plec(page)).toBe('F');

    // Prawdziwe kliknięcie „Wyczyść” → okno strażnika niezapisanych danych → „Odrzuć dane i wyczyść”.
    // Strażnik pyta tylko, gdy wskaźnik zapisu zdążył uznać formularz za nowego pacjenta.
    await page.waitForFunction(() => window.VildaSaveStatusIndicator.getState() === 'new_patient');
    await page.locator('#clearAllDataBtn').scrollIntoViewIfNeeded();
    await page.locator('#clearAllDataBtn').click();
    await page.locator('.vug-btn.vug-danger').click();
    await expect(page.locator('.vug-backdrop')).toHaveCount(0);
    await expect(page.locator('#sex')).toHaveValue('M');
    await expect.poll(() => page.evaluate(() => window.VildaPlecZImienia.stan())).toBe('domyslna');

    // Nazwisko od razu, imię dopiero po odświeżeniu lustra (custom-fixes.js, 3,2 s po kliknięciu).
    await wpisz(page, '#lastName', 'Fikcyjna');
    await page.waitForTimeout(3600);
    await wpisz(page, '#firstName', 'Anna');
    expect(await plec(page), 'dotąd zostawało M z notką „Sprawdź płeć”').toBe('F');
    expect(await page.evaluate(() => window.VildaPlecZImienia.stan())).toBe('automat');
    await expect(notka(page)).toHaveText('Płeć ustawiona na podstawie imienia „Anna” — sprawdź.');
  });

  test('docpro: ten sam formularz; imię i nazwisko sprzeczne — decyduje imię, notka mówi o nazwisku; imię spoza słownika ostrzega', async ({ page }) => {
    test.setTimeout(150_000);
    await otworzZKontem(page, '/docpro.html');
    await wpisz(page, '#lastName', 'Testowski');
    expect(await plec(page)).toBe('M');
    await expect(notka(page)).toHaveText('Płeć ustawiona na podstawie nazwiska „Testowski” — sprawdź.');
    await wpisz(page, '#firstName', 'Anna');
    expect(await plec(page)).toBe('F');
    await expect(notka(page)).toHaveText('Płeć ustawiona na podstawie imienia „Anna”, ale nazwisko „Testowski” ma formę męską — sprawdź.');
    await expect(notka(page)).toHaveClass(/vild-dob-error/);

    await wpisz(page, '#lastName', 'Fikcyjna');
    await wpisz(page, '#firstName', 'Xyzabc');
    expect(await plec(page), 'imię nieznane nie cofa decyzji').toBe('F');
    await expect(notka(page)).toHaveText('Sprawdź płeć: imienia „Xyzabc” nie ma w słowniku.');
  });
});
