import { expect, test } from '../support/test-czas.mjs';

// P-TOZSAMOSC-2 (zgłoszenie właściciela 2026-09-15) — po wczytaniu albo zapisaniu pacjenta pola
// Nazwisko/Imię są tylko do odczytu (P-TOZSAMOSC), ale kliknięcie w nie nadal otwierało
// podpowiedź pacjentów z tym samym nazwiskiem. Lista nie ma wtedy czego podpowiadać.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Podpowiedz!26a';

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
  await page.waitForFunction(() => typeof window.saveUserData === 'function' && Boolean(window.VildaPolaTozsamosci));
  await page.waitForTimeout(1200);
}

function wpisz(page, pola) {
  return page.evaluate((p) => {
    Object.keys(p).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) throw new Error('brak pola ' + id);
      el.value = p[id];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, pola);
}

const lista = (page) => page.locator('.vilda-ac-dd');

const stan = (page) => page.evaluate(() => ({
  lastNameRo: Boolean(document.getElementById('lastName').readOnly),
  lastName: document.getElementById('lastName').value,
  pid: window._vildaCurrentPatientId || null,
}));

test('zablokowane pole tożsamości nie otwiera podpowiedzi pacjenta; wolne pole nadal ją ma', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);

  // Pierwsza wizyta: zapis tworzy pacjenta, a pola tożsamości stają się „z kartoteki".
  await wpisz(page, { lastName: 'Fikcyjna', firstName: 'Ewa', sex: 'K', age: '9', ageMonths: '2', weight: '30', height: '134' });
  expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await page.waitForTimeout(800);
  await expect.poll(async () => (await stan(page)).lastNameRo, { message: 'po zapisie nazwisko jest tylko do odczytu' }).toBe(true);

  // Zgłoszony przebieg: klik w zablokowane pole → dotąd pokazywała się lista z tym samym nazwiskiem.
  await page.locator('#lastName').click();
  await page.waitForTimeout(700);
  await expect(lista(page), 'po zapisie podpowiedź nie ma czego podpowiadać').toBeHidden();
  await page.locator('#firstName').click();
  await page.waitForTimeout(700);
  await expect(lista(page)).toBeHidden();

  // Kontrola pozytywna: po wyczyszczeniu pole jest wolne i podpowiedź działa.
  await page.evaluate(() => window.clearAllData());
  await page.waitForTimeout(800);
  expect((await stan(page)).lastNameRo).toBe(false);
  await page.locator('#lastName').click();
  await page.keyboard.type('Fik');
  await expect(lista(page), 'wolne pole podpowiada zapisanego pacjenta').toBeVisible({ timeout: 5000 });
  await expect(lista(page).locator('.vilda-ac-row').first()).toContainText('Fikcyjna Ewa');

  // Wybór z podpowiedzi wczytuje pacjenta — od tej chwili pola są zablokowane i lista znika.
  await lista(page).locator('.vilda-ac-row').first().click();
  await expect.poll(async () => (await stan(page)).pid, { message: 'wybór z listy wczytuje pacjenta' }).toBeTruthy();
  await page.waitForTimeout(1500);
  if (await page.locator('#vildaLcmNew').count()) await page.locator('#vildaLcmNew').click();
  await expect.poll(async () => (await stan(page)).lastNameRo).toBe(true);
  expect((await stan(page)).lastName).toBe('Fikcyjna');
  await expect(lista(page)).toBeHidden();

  await page.locator('#lastName').click();
  await page.waitForTimeout(700);
  await expect(lista(page), 'po wczytaniu podpowiedź milczy').toBeHidden();
  await page.locator('#firstName').click();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(500);
  await expect(lista(page)).toBeHidden();
});

test('docpro.html: to samo zachowanie na drugiej stronie', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page);
  await wpisz(page, { lastName: 'Fikcyjny', firstName: 'Jan', sex: 'M', age: '7', ageMonths: '0', weight: '24', height: '121' });
  expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await page.waitForTimeout(800);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked() && Boolean(window.VildaPolaTozsamosci));
  // DocPro chowa kalkulator za bramką PRO (html.vilda-pro-inactive → .container ukryty). Podpowiedź
  // nie zależy od PRO; na potrzeby kliknięcia odsłaniamy kontener tak, jak widzi go użytkownik z planem.
  await page.evaluate(() => {
    document.documentElement.classList.remove('vilda-pro-inactive');
    document.documentElement.classList.add('vilda-pro-active');
  });
  await page.waitForTimeout(2500);
  await expect.poll(async () => (await stan(page)).lastNameRo, { message: 'docpro: nazwisko z kartoteki' }).toBe(true);
  await page.locator('#lastName').click();
  await page.waitForTimeout(700);
  await expect(lista(page)).toBeHidden();
});
