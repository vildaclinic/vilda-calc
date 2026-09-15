import { expect, test } from '../support/test-czas.mjs';

// P-TOZSAMOSC-2 (zgłoszenie właściciela 2026-09-15) — po wczytaniu albo zapisaniu pacjenta pola
// Nazwisko/Imię są tylko do odczytu (P-TOZSAMOSC), ale kliknięcie w nie nadal otwierało
// podpowiedź pacjentów z tym samym nazwiskiem. Lista nie ma wtedy czego podpowiadać.
//
// Pomiar (przegląd 2026-09-15): samo `toBeHidden()` nie strzeże tego przebiegu — na starym kodzie
// lista po kliknięciu w zablokowane Nazwisko otwierała się po ~200 ms i ZNIKAŁA po ~1,2 s, bo
// pobranie kopii zapasowej po zapisie klika programowo w znacznik <a>, a podpowiedź chowa się na
// każdy klik poza listą. Ponawiana asercja doczekiwała tego zamknięcia. Dlatego liczymy OTWARCIA
// listy sondą w stronie (MutationObserver na style .vilda-ac-dd) i wymagamy zera.
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
  await gotowe(page);
}

async function gotowe(page) {
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

/* Sonda: liczy, ile razy lista przeszła w display:block od uzbrojenia. */
async function uzbrojSonde(page) {
  await page.evaluate(() => {
    const dd = document.querySelector('.vilda-ac-dd');
    if (!dd) throw new Error('brak .vilda-ac-dd — podpowiedź nie została zainicjowana');
    if (window.__acSonda && window.__acSonda.obs) window.__acSonda.obs.disconnect();
    const sonda = { otwarcia: 0, obs: null };
    sonda.obs = new MutationObserver(() => { if (dd.style.display === 'block') sonda.otwarcia += 1; });
    sonda.obs.observe(dd, { attributes: true, attributeFilter: ['style'] });
    window.__acSonda = sonda;
  });
}
const otwarcia = (page) => page.evaluate(() => (window.__acSonda ? window.__acSonda.otwarcia : -1));

/* Klik w pole + chwila na asynchroniczną listę pacjentów; zwraca liczbę otwarć w tym oknie. */
async function klikBezPodpowiedzi(page, selektor) {
  await uzbrojSonde(page);
  await page.locator(selektor).click();
  await page.waitForTimeout(900);
  const n = await otwarcia(page);
  expect(await lista(page).isVisible(), `${selektor}: lista ukryta w chwili pomiaru`).toBe(false);
  return n;
}

const stan = (page) => page.evaluate(() => ({
  lastNameRo: Boolean(document.getElementById('lastName').readOnly),
  advNameRo: document.getElementById('advName') ? Boolean(document.getElementById('advName').readOnly) : null,
  lastName: document.getElementById('lastName').value,
  pid: window._vildaCurrentPatientId || null,
}));

/* Karta zaawansowana jest za trybem profesjonalnym (#resultsModeToggle) — bez niego aplikacja
   chowa ją przy każdym przeliczeniu. Włączamy tryb tak, jak robi to lekarz, i odsłaniamy kartę. */
async function odslonKarteZaawansowana(page) {
  await page.evaluate(() => {
    const t = document.getElementById('resultsModeToggle');
    if (t && !t.checked) { t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); }
    ['advancedGrowthSection', 'advancedGrowthForm'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'block'; el.hidden = false; }
    });
  });
  await expect(page.locator('#advName')).toBeVisible({ timeout: 10000 });
}

test('zablokowane pole tożsamości nie otwiera podpowiedzi pacjenta; wolne pole nadal ją ma', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);

  // Pierwsza wizyta: zapis tworzy pacjentkę, a pola tożsamości stają się „z kartoteki".
  await wpisz(page, { lastName: 'Fikcyjna', firstName: 'Ewa', sex: 'F', age: '9', ageMonths: '2', weight: '30', height: '134' });
  expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await page.waitForTimeout(800);
  await expect.poll(async () => (await stan(page)).lastNameRo, { message: 'po zapisie nazwisko jest tylko do odczytu' }).toBe(true);

  // Zgłoszony przebieg: klik w zablokowane pole → dotąd pokazywała się lista z tym samym nazwiskiem.
  expect(await klikBezPodpowiedzi(page, '#lastName'), 'po zapisie lista nie otwiera się ani na chwilę').toBe(0);
  expect(await klikBezPodpowiedzi(page, '#firstName')).toBe(0);

  // Kopia nazwy w karcie zaawansowanej: po zapisie wstępnie wypełniona tym samym nazwiskiem —
  // przed utwardzeniem była wolna i otwierała listę (przegląd 2026-09-15).
  await odslonKarteZaawansowana(page);
  expect((await stan(page)).advNameRo, 'nazwa w karcie zaawansowanej też z kartoteki').toBe(true);
  expect(await klikBezPodpowiedzi(page, '#advName')).toBe(0);

  // Kontrola pozytywna: po wyczyszczeniu pola są wolne i podpowiedź działa — także w karcie.
  await page.evaluate(() => window.clearAllData());
  await page.waitForTimeout(800);
  expect((await stan(page)).lastNameRo).toBe(false);
  // Bez danych wizyty sekcja wyników (a z nią karta zaawansowana) jest zwinięta — dajemy same liczby, bez nazwiska.
  await wpisz(page, { sex: 'F', age: '9', ageMonths: '2', weight: '30', height: '134' });
  await odslonKarteZaawansowana(page);
  await page.locator('#advName').click();
  await page.keyboard.type('Fik');
  await expect(lista(page), 'wolne pole nazwy w karcie podpowiada zapisaną pacjentkę').toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await expect(lista(page)).toBeHidden();

  // Nazwa z karty synchronizuje się z Nazwiskiem, więc pole główne wypełniamy od nowa (fill = zaufany input).
  await page.locator('#lastName').click();
  await page.locator('#lastName').fill('Fik');
  await expect(lista(page), 'wolne pole podpowiada zapisaną pacjentkę').toBeVisible({ timeout: 5000 });
  await expect(lista(page).locator('.vilda-ac-row').first()).toContainText('Fikcyjna Ewa');

  // Wybór z podpowiedzi wczytuje pacjentkę — od tej chwili pola są zablokowane i lista znika.
  // Formularz ma niezapisane liczby, więc aplikacja może najpierw zapytać strażnikiem niezapisanych
  // zmian (okno .vug); na CI pytała, lokalnie nie — odpowiadamy „Odrzuć … i wczytaj", jak lekarz.
  await lista(page).locator('.vilda-ac-row').first().click();
  const straznik = page.locator('.vug-backdrop .vug-btn.vug-danger');
  await expect.poll(async () => {
    if (await straznik.isVisible()) await straznik.click();
    return (await stan(page)).pid;
  }, { message: 'wybór z listy wczytuje pacjentkę', timeout: 10000 }).toBeTruthy();
  await expect(page.locator('#vildaLoadChoiceModal'), 'pytanie „Nowy pomiar / Odtwórz zapis"').toBeVisible({ timeout: 5000 });
  await page.locator('#vildaLcmNew').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await expect.poll(async () => (await stan(page)).lastNameRo).toBe(true);
  expect((await stan(page)).lastName).toBe('Fikcyjna');
  await expect(lista(page)).toBeHidden();

  expect(await klikBezPodpowiedzi(page, '#lastName'), 'po wczytaniu podpowiedź milczy').toBe(0);
  await uzbrojSonde(page);
  await page.locator('#firstName').click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  expect(await otwarcia(page), 'klawiatura na zablokowanym polu niczego nie otwiera ani nie wybiera').toBe(0);
  expect((await stan(page)).lastName).toBe('Fikcyjna');
});

test('docpro.html: to samo zachowanie na drugiej stronie, z kontrolą pozytywną', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page);
  await wpisz(page, { lastName: 'Fikcyjny', firstName: 'Jan', sex: 'M', age: '7', ageMonths: '0', weight: '24', height: '121' });
  expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await page.waitForTimeout(800);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await gotowe(page);
  // DocPro chowa kalkulator za bramką PRO (html.vilda-pro-inactive → .container ukryty). Podpowiedź
  // nie zależy od PRO; na potrzeby kliknięcia odsłaniamy kontener tak, jak widzi go użytkownik z planem.
  await page.evaluate(() => {
    document.documentElement.classList.remove('vilda-pro-inactive');
    document.documentElement.classList.add('vilda-pro-active');
  });
  await page.waitForTimeout(2000);
  await expect.poll(async () => (await stan(page)).lastNameRo, { message: 'docpro: nazwisko z kartoteki' }).toBe(true);
  expect(await klikBezPodpowiedzi(page, '#lastName'), 'docpro: zablokowane pole nie otwiera listy').toBe(0);

  // Kontrola pozytywna na tej stronie: po wyczyszczeniu podpowiedź działa.
  await page.evaluate(() => window.clearAllData());
  await page.waitForTimeout(800);
  expect((await stan(page)).lastNameRo).toBe(false);
  await page.locator('#lastName').click();
  await page.keyboard.type('Fik');
  await expect(lista(page), 'docpro: wolne pole podpowiada zapisanego pacjenta').toBeVisible({ timeout: 5000 });
  await expect(lista(page).locator('.vilda-ac-row').first()).toContainText('Fikcyjny Jan');
});
