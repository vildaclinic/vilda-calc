import { expect, test } from '@playwright/test';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

// P-SESJA-ZAPISU — okna zapisu przy blokadzie sejfu, na prawdziwej stronie (index.html w Chromium).
//
// Co pilnuje: okno, które zapis otworzył w jednej sesji („Który to pacjent?”, „Ktoś inny zmienił ten rekord po
// wczytaniu danych”), należy do tej sesji. Przy blokadzie sejfu znika z DOM, zapis, który na nie czekał, kończy się
// od razu (kod SESSION_CHANGED), a blokada karty pacjenta (Web Lock vilda-save-pat:<id>) jest wolna. Po zalogowaniu
// innego konta przez ekran logowania nie ma okna, powiadomienia o zapisie (#vildaSaveFeedback) ani karty na liście
// pacjentów tego konta. Test jednostkowy (tests/unit/okna-zapisu-blokada.test.mjs) sprawdza funkcje okien na lekkiej
// atrapie DOM; tutaj to samo na żywej stronie: z CSS aplikacji, ekranem logowania i Web Locks przeglądarki.
//
// Przypadki:
//   E1. „Który to pacjent?” — dwie karty „Testowy Jan” bez daty urodzenia, w formularzu ten sam pacjent bez daty,
//       „Zapisz dane”, blokada z bezczynności, logowanie drugiego konta przez ekran logowania.
//   E2. „Ktoś inny zmienił ten rekord…” — pacjent wczytany do formularza, pomiar dopisany w drugiej karcie
//       przeglądarki, „Zapisz dane”, blokada, logowanie drugiego konta; navigator.locks.query(): w czasie okna
//       blokada karty jest trzymana, po blokadzie sejfu — wolna.
//
// Czerwone na audycie sprzed zmiany (sprawdzone na 2af9de53): E1 i E2.
//
// Konta są fikcyjne i powstają w teście (createUser w efemerycznym profilu przeglądarki); dane wyłącznie fikcyjne.
// Okna, blokada i logowanie drugiego konta idą przez UI aplikacji. Bez stałych odczekań: test czeka na zdarzenia
// strony, stan DOM i wynik zapisu. Sprawdzenia po blokadzie są miękkie (expect.soft), żeby raport pokazywał komplet
// rozbieżności, a nie tylko pierwszą.
test.use({ serviceWorkers: 'block' });

const miekko = expect.configure({ soft: true });

const KONTO_A = { label: 'Testowa Lekarka A', haslo: 'E2e#OknaZapisuA!26aa' };
const KONTO_B = { label: 'Testowy Lekarz B', haslo: 'E2e#OknaZapisuB!26bb' };

const PYTANIE_TOZSAMOSC = 'Który to pacjent?';
const PYTANIE_KONFLIKT = 'Ktoś inny zmienił ten rekord po wczytaniu danych';

const JAN_BEZ_DATY = (wzrost) => ({
  name: 'Testowy Jan',
  user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 9, ageMonths: 0, height: wzrost, weight: 28 },
});

const JAN_Z_POMIAREM = {
  name: 'Testowy Jan',
  user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 5, ageMonths: 6, height: 108, weight: 18 },
  growthBasic: { data: { measurements: [{ ageMonths: 60, ageYears: 5, height: 105, weight: 17 }] } },
};

async function regulamin(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
}

async function gotowa(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => typeof window.saveUserData === 'function'
    && typeof window.collectUserData === 'function' && Boolean(window.VildaAuthUI)
    && typeof window.VildaVault.setPatientIdentityResolver === 'function');
  await czekajNaOdtworzenieSesji(page);
}

/* Dwa fikcyjne konta w jednym profilu przeglądarki; po odświeżeniu strony zalogowane jest konto A. */
async function dwaKonta(page) {
  await regulamin(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  const konta = await page.evaluate(async ([a, b]) => {
    const V = window.VildaVault;
    const kontoB = await V.createUser(b.haslo, { label: b.label, iterations: 10000 });
    V.lock('manual');
    const kontoA = await V.createUser(a.haslo, { label: a.label, iterations: 10000 });
    return { a: kontoA.userId, b: kontoB.userId };
  }, [KONTO_A, KONTO_B]);
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
  expect(await page.evaluate(() => window.VildaVault.getCurrentUser().userId), 'zalogowane konto A').toBe(konta.a);
  return konta;
}

/* Obserwator wyniku zapisów z formularza: notuje, czy zapis trwa, czy się zakończył i z jakim kodem.
   Wywołanie i jego wynik przechodzą bez zmian. */
async function obserwujZapisy(page) {
  await page.evaluate(() => {
    const V = window.VildaVault;
    const zapisz = V.savePatient;
    window.__zapisyFormularza = [];
    V.savePatient = function obserwowanyZapis(...argumenty) {
      const wpis = { stan: 'trwa', kod: null };
      window.__zapisyFormularza.push(wpis);
      const wynik = zapisz.apply(this, argumenty);
      wynik.then(() => { wpis.stan = 'zapisany'; }, (e) => { wpis.stan = 'odrzucony'; wpis.kod = (e && e.code) || null; });
      return wynik;
    };
  });
}
const zapisyFormularza = (page) => page.evaluate(() => window.__zapisyFormularza.map((w) => ({ ...w })));

/* Blokady kart pacjentów w Web Locks przeglądarki (trzymane i czekające). */
const blokadyKart = (page) => page.evaluate(async () => {
  const q = await navigator.locks.query();
  return [...q.held, ...q.pending].map((l) => l.name).filter((n) => n.startsWith('vilda-save-pat:')).sort();
});

/* Blokada z bezczynności; liczba okien zapisu w DOM odczytana w tym samym zadaniu, zaraz po lock(). */
const zablokujZBezczynnosci = (page) => page.evaluate(() => {
  window.VildaVault.lock('idle');
  return document.querySelectorAll('.vilda-auth-overlay-sheet').length;
});

/* Logowanie przez ekran logowania: karta konta → hasło → „Zaloguj się”. */
async function zalogujPrzezEkran(page, konto, userId) {
  await page.locator(`.vilda-auth-user-card[title="Zaloguj jako ${konto.label}"]`).click();
  await page.getByPlaceholder('Hasło', { exact: true }).fill(konto.haslo);
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await page.waitForFunction((id) => window.VildaVault.isUnlocked()
    && window.VildaVault.getCurrentUser().userId === id, userId);
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await expect(page.getByRole('button', { name: 'Zaloguj się', exact: true }), 'ekran logowania zamknięty').toHaveCount(0);
}

/* Lista pacjentów zalogowanego konta: sejf i widok „Pacjenci” z paska bocznego. Przycisk paska jest klikalny,
   gdy nic nie zasłania strony; limit kliknięcia daje czytelny błąd zamiast przekroczenia czasu testu. */
async function sprawdzPustaListe(page) {
  miekko(await page.evaluate(async () => (await window.VildaVault.listPatients()).length),
    'sejf drugiego konta bez kart').toBe(0);
  await page.getByRole('navigation', { name: 'Nawigacja boczna' })
    .getByRole('button', { name: 'Pacjenci', exact: true }).click({ timeout: 10_000 });
  const lista = page.locator('.vilda-auth-patients');
  await expect(lista.locator('.vilda-auth-title', { hasText: 'Pacjenci' })).toBeVisible();
  await miekko(lista.locator('.pt-count'), 'lista pacjentów drugiego konta').toHaveText('Brak zapisanych pacjentów.');
  await miekko(lista, 'na liście nie ma karty z formularza').not.toContainText('Testowy Jan');
}

async function wpiszWizyteJanaBezDaty(page) {
  await page.fill('#lastName', 'Testowy');
  await page.fill('#firstName', 'Jan');
  await page.selectOption('#sex', 'M');
  await page.fill('#age', '9');
  await page.fill('#ageMonths', '0');
  await page.fill('#height', '132');
  await page.fill('#weight', '29');
}

/* Wczytanie jak lekarz: Karta Pacjenta → „Wczytaj tego pacjenta” → „Nowy pomiar”, potem dzisiejsza wizyta.
   Nowa wizyta jest gotowa po zdarzeniu vilda:load-choice-applied. */
async function wczytajINowaWizyta(page, patientId) {
  const zastosowano = page.evaluate(() => new Promise((gotowe) => {
    document.addEventListener('vilda:load-choice-applied', (e) => gotowe(e.detail && e.detail.patientId), { once: true });
  }));
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id,
    (r) => { if (r) window.applyLoadedData(r); }, null), patientId);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
  await page.locator('#vildaLcmNew').click();
  expect(await zastosowano, 'wczytany pacjent w formularzu').toBe(patientId);
  await page.fill('#age', '6');
  await page.fill('#ageMonths', '0');
  await page.fill('#height', '112');
  await page.fill('#weight', '20');
}

/* Druga karta przeglądarki z tym samym kontem dopisuje pomiar z 6 lat 8 mies. i się zamyka. */
async function zapisWDrugiejKarcie(context, konto, userId, patientId) {
  const druga = await context.newPage();
  await regulamin(druga);
  await druga.goto('/index.html', { waitUntil: 'load' });
  await druga.waitForFunction(() => Boolean(window.VildaVault));
  await druga.evaluate(async (a) => window.VildaVault.unlockUser(a.userId, a.haslo), { userId, haslo: konto.haslo });
  await druga.evaluate(async ([pid, rekord]) => {
    const r = JSON.parse(JSON.stringify(rekord));
    r.growthBasic.data.measurements.push({ ageMonths: 80, ageYears: 80 / 12, height: 116, weight: 21 });
    await window.VildaVault.savePatient(r, { patientId: pid, dedup: false });
  }, [patientId, JAN_Z_POMIAREM]);
  await druga.close();
}

test.describe('P-SESJA-ZAPISU — okna zapisu przy blokadzie sejfu i logowaniu innego konta', () => {
  test('E1: „Który to pacjent?” znika przy blokadzie, zapis kończy się w swojej sesji, drugie konto nie widzi okna, powiadomienia ani karty', async ({ page }) => {
    test.setTimeout(120_000);
    const konta = await dwaKonta(page);
    await page.evaluate(async ([p1, p2]) => {
      await window.VildaVault.savePatient(p1, { dedup: false });
      await window.VildaVault.savePatient(p2, { dedup: false });
    }, [JAN_BEZ_DATY(130), JAN_BEZ_DATY(131)]);
    await obserwujZapisy(page);

    await wpiszWizyteJanaBezDaty(page);
    await page.locator('#saveDataBtnSidebar').click();
    const okno = page.getByRole('alertdialog', { name: PYTANIE_TOZSAMOSC });
    await expect(okno).toBeVisible();
    await expect(okno).toContainText('bez daty urodzenia');
    expect(await zapisyFormularza(page), 'zapis czeka na odpowiedź').toEqual([{ stan: 'trwa', kod: null }]);

    miekko(await zablokujZBezczynnosci(page), 'od razu po blokadzie okna zapisu nie ma w DOM').toBe(0);
    await miekko(page.locator('.vilda-auth-overlay-sheet'), 'po blokadzie brak okna zapisu w DOM').toHaveCount(0);
    await miekko(page.locator('body'), 'po blokadzie brak klasy otwartego okna').not.toHaveClass(/vilda-modal-alert-open/);
    await miekko.poll(() => zapisyFormularza(page), { message: 'zapis kończy się w sesji, w której ruszył', timeout: 5000 })
      .toEqual([{ stan: 'odrzucony', kod: 'SESSION_CHANGED' }]);
    miekko(await blokadyKart(page), 'po blokadzie brak blokady karty pacjenta').toEqual([]);

    await zalogujPrzezEkran(page, KONTO_B, konta.b);
    await miekko(page.getByRole('alertdialog', { name: PYTANIE_TOZSAMOSC }), 'po zalogowaniu drugiego konta brak okna')
      .toHaveCount(0);
    await miekko(page.getByRole('button', { name: /To inne dziecko/ }), 'brak przycisku okna').toHaveCount(0);
    await miekko(page.locator('#vildaSaveFeedback'), 'po zmianie sesji brak powiadomienia o zapisie').toHaveCount(0);
    await sprawdzPustaListe(page);
  });

  test('E2: okno konfliktu znika przy blokadzie i zwalnia blokadę karty, drugie konto nie widzi okna, powiadomienia ani karty', async ({ page, context }) => {
    test.setTimeout(120_000);
    const konta = await dwaKonta(page);
    const patientId = await page.evaluate(
      async (r) => (await window.VildaVault.savePatient(r, { dedup: false })).patientId, JAN_Z_POMIAREM);
    await wczytajINowaWizyta(page, patientId);
    await zapisWDrugiejKarcie(context, KONTO_A, konta.a, patientId);
    await page.bringToFront();
    await obserwujZapisy(page);

    await page.locator('#saveDataBtnSidebar').click();
    const okno = page.getByRole('alertdialog', { name: PYTANIE_KONFLIKT });
    await expect(okno).toBeVisible();
    await expect(okno.locator('.vilda-auth-conflict-list li')).toContainText('6 lat 8 mies.');
    expect(await blokadyKart(page), 'w czasie okna blokada karty jest trzymana').toEqual([`vilda-save-pat:${patientId}`]);
    expect(await zapisyFormularza(page), 'zapis czeka na odpowiedź').toEqual([{ stan: 'trwa', kod: null }]);

    miekko(await zablokujZBezczynnosci(page), 'od razu po blokadzie okna zapisu nie ma w DOM').toBe(0);
    await miekko(page.locator('.vilda-auth-overlay-sheet'), 'po blokadzie brak okna zapisu w DOM').toHaveCount(0);
    await miekko.poll(() => blokadyKart(page), { message: 'po blokadzie blokada karty jest wolna', timeout: 5000 })
      .toEqual([]);
    await miekko.poll(() => zapisyFormularza(page), { message: 'zapis kończy się w sesji, w której ruszył', timeout: 5000 })
      .toEqual([{ stan: 'odrzucony', kod: 'SESSION_CHANGED' }]);

    await zalogujPrzezEkran(page, KONTO_B, konta.b);
    await miekko(page.getByRole('alertdialog', { name: PYTANIE_KONFLIKT }), 'po zalogowaniu drugiego konta brak okna')
      .toHaveCount(0);
    await miekko(page.locator('#vildaSaveFeedback'), 'po zmianie sesji brak powiadomienia o zapisie').toHaveCount(0);
    miekko(await blokadyKart(page), 'po zalogowaniu drugiego konta brak blokady karty').toEqual([]);
    await sprawdzPustaListe(page);
  });
});
