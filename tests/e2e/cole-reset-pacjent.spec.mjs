import { expect, test } from '../support/test-czas.mjs';

// P-COLE-RESET — wskaźnik Cole'a i rodzina BMI poprzedniego pacjenta nie przechodzą na następnego
// (2026-10-13, polecenie właściciela: „zajmij się resetem Cola między pacjentami”).
//
// Cole (colePercentValue, coleCatValue, coleKluczValue) i rodzina BMI (bmiPercentileValue,
// lastBmiCategory, lastBmiKategoria, lastBmiPercentile) to globalne wartości pochodne. Powstają tylko
// w pełnym update(), po walidacji. Dotąd nic ich nie zerowało: ani zmiana pacjenta, ani „Wyczyść”,
// ani update() zatrzymany na niekompletnych danych lub błędzie zakresu. Karta „Szacowane spożycie
// energii” rozwija się sama przy Cole ≥ 110% i czyta go w słuchaczu pola, zanim update() policzy nowy.
// Po wczytaniu drugiego dziecka rozwijała się więc na Cole pierwszego. Dopóki lekarz nie opuścił
// pola, rekord i sesja niosły intake.history. Nagłówek raportu i epikryza czytały cudzy Cole.
//
// Kontrakt: global = bieżący formularz albo null. Kontrole: ten sam pacjent po F5 i po ponownym
// wczytaniu zachowuje własny Cole. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#ColeReset!26';
const POCHODNE = [
  'colePercentValue', 'coleCatValue', 'coleKluczValue',
  'bmiPercentileValue', 'lastBmiCategory', 'lastBmiKategoria', 'lastBmiPercentile',
];
const PUSTE = Object.fromEntries(POCHODNE.map((k) => [k, null]));

// Dwie dziewczynki ur. 1.10.2014 (w chwili testu 11 l. 8 mies.), 150 cm.
// A: 52 kg — Cole ok. 128% (otyłość), karta spożycia rozwija się z powodu Cole.
// B: 40 kg — Cole ok. 98%, BMI w normie; karta spożycia zostaje zwinięta.
const A = { nazwisko: 'ProbnaOtyla', masa: '52' };
const B = { nazwisko: 'ProbnaNorma', masa: '40' };

async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
  });
  page.on('dialog', (d) => { d.accept().catch(() => {}); });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await zalogowana(page);
}

async function zalogowana(page) {
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => {
    const V = window.VildaVault;
    if (V.isUnlocked()) return;
    const u = await V.listUsers();
    await V.unlockUser(u[0].userId, pw);
  }, HASLO);
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
}

const pochodne = (page) => page.evaluate((klucze) => Object.fromEntries(
  klucze.map((k) => [k, window[k] === undefined ? null : window[k]]),
), POCHODNE);

const cole = (page) => page.evaluate(() => window.colePercentValue);

// Formularz jak przy wpisaniu z klawiatury: zdarzenia input i change, potem przeliczenie.
async function wpiszPacjentke(page, p) {
  await page.evaluate(() => window.clearAllData());
  await page.fill('#lastName', p.nazwisko);
  await page.fill('#firstName', 'Fikcyjna');
  await page.locator('#dobInput').fill('01-10-2014');
  await page.locator('#dobInput').dispatchEvent('change');
  await page.locator('#dobInput').blur();
  await expect(page.locator('#age')).toHaveValue('11');
  await page.evaluate((masa) => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('sex', 'F'); set('height', '150'); set('weight', masa);
    window.update();
  }, p.masa);
  await expect.poll(() => cole(page)).toEqual(expect.any(Number));
}

async function zapisz(page) {
  const przed = await page.evaluate(
    async () => (await window.VildaVault.listPatients()).map((x) => x.patientId),
  );
  await page.locator('#saveDataBtnSidebar').click();
  let id = null;
  await expect.poll(async () => {
    const po = await page.evaluate(
      async () => (await window.VildaVault.listPatients()).map((x) => x.patientId),
    );
    id = po.find((x) => !przed.includes(x)) || null;
    return id;
  }, { message: 'w sejfie pojawia się nowy pacjent' }).not.toBeNull();
  return id;
}

// Karta pacjenta → „Wczytaj tego pacjenta” → okno „Odtwórz zapis” / „Nowy pomiar”, jak lekarz:
// bez czyszczenia formularza poprzedniego pacjenta.
async function wczytajDoWyboru(page, pid) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (rekord) => {
    if (rekord) window.applyLoadedData(rekord);
  }, null), pid);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  const ponownie = page.getByRole('button', { name: 'Wczytaj ponownie' });
  const okno = page.locator('#vildaLoadChoiceModal');
  await expect(ponownie.or(okno)).toBeVisible();
  if (await ponownie.isVisible()) await ponownie.click();
  await expect(okno).toBeVisible();
}

async function wybierz(page, przycisk) {
  await page.locator(przycisk).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
}

async function przygotujObiePacjentki(page) {
  await otworz(page);
  await wpiszPacjentke(page, A);
  const colePacjentkiA = await cole(page);
  const pidA = await zapisz(page);
  await wpiszPacjentke(page, B);
  const colePacjentkiB = await cole(page);
  const pidB = await zapisz(page);
  expect(colePacjentkiA, 'warunek scenariusza: A ma Cole ≥ 110%').toBeGreaterThanOrEqual(110);
  expect(colePacjentkiB, 'warunek scenariusza: B ma Cole < 110%').toBeLessThan(110);
  return { pidA, pidB, colePacjentkiA, colePacjentkiB };
}

// Każda zmiana widoczności karty spożycia od tej chwili.
async function sledzKarteSpozycia(page) {
  await page.evaluate(() => {
    const karta = document.getElementById('intakeCard');
    window.__kartaSpozycia = [karta.style.display];
    new MutationObserver(() => window.__kartaSpozycia.push(karta.style.display))
      .observe(karta, { attributes: true, attributeFilter: ['style'] });
  });
}

const stanSpozycia = (page) => page.evaluate(() => {
  const intake = (window.collectUserData() || {}).intake || {};
  return {
    widoki: window.__kartaSpozycia.slice(),
    widoczna: getComputedStyle(document.getElementById('intakeCard')).display !== 'none',
    historia: intake.history ?? null,
    kcal: intake.estKcalPerDay ?? null,
  };
});

// Wpisanie jak lekarz: masa, potem wzrost, klawisz po klawiszu, bez opuszczania pola wzrostu.
async function wpiszKlawiszami(page, masa, wzrost) {
  for (const [pole, wartosc] of [['#weight', masa], ['#height', wzrost]]) {
    await page.locator(pole).click();
    await page.keyboard.press('Control+A');
    await page.locator(pole).pressSequentially(wartosc, { delay: 120 });
  }
}

test.describe('Cole i rodzina BMI nie przechodzą na następnego pacjenta', () => {
  test('„Nowy pomiar” innej pacjentki: brak cudzego Cole, karta spożycia nie rozwija się na nim', async ({ page }) => {
    test.setTimeout(120_000);
    const { pidA, pidB, colePacjentkiA, colePacjentkiB } = await przygotujObiePacjentki(page);

    await wczytajDoWyboru(page, pidA);
    await wybierz(page, '#vildaLcmRestore');
    await expect.poll(() => cole(page), { message: 'A po „Odtwórz zapis” ma własny Cole' })
      .toBeCloseTo(colePacjentkiA, 1);

    // Wczytanie innej pacjentki zeruje wartości pochodne A, zanim formularz dostanie zdarzenie.
    await wczytajDoWyboru(page, pidB);
    expect(await pochodne(page), 'okno wyboru B: bez Cole i BMI pacjentki A').toEqual(PUSTE);

    await wybierz(page, '#vildaLcmNew');
    await expect(page.locator('#weight')).toHaveValue('');
    expect(await pochodne(page), '„Nowy pomiar” B: puste pola, brak wartości pochodnych').toEqual(PUSTE);

    await sledzKarteSpozycia(page);
    await wpiszKlawiszami(page, B.masa, '150');
    await expect.poll(() => cole(page), { message: 'Cole liczony z pól B' }).toBeCloseTo(colePacjentkiB, 1);
    await page.waitForTimeout(1500);
    // Dotąd (audyt 94d7b55): karta rozwijała się na Cole A (≈ 128%) i zostawała rozwinięta do
    // opuszczenia pola; rekord i sesja niosły wtedy intake.history pacjentki B.
    const przedBlur = await stanSpozycia(page);
    expect(przedBlur.widoki, 'karta spożycia ani razu nie rozwinięta').not.toContain('block');
    expect(przedBlur.widoczna).toBe(false);
    expect(przedBlur.historia, 'collectUserData().intake.history przed opuszczeniem pola').toBeNull();
    expect(przedBlur.kcal).toBeNull();

    await page.keyboard.press('Tab');
    await page.waitForTimeout(1500);
    const poBlur = await stanSpozycia(page);
    expect(poBlur.widoczna).toBe(false);
    expect(poBlur.historia).toBeNull();
    expect(await cole(page)).toBeCloseTo(colePacjentkiB, 1);
  });

  test('„Wyczyść” zeruje Cole i BMI od razu; dziecko wpisane ręcznie po nim nie dziedziczy Cole', async ({ page }) => {
    test.setTimeout(90_000);
    await otworz(page);
    await wpiszPacjentke(page, A);
    expect(await cole(page), 'warunek scenariusza: A ma Cole ≥ 110%').toBeGreaterThanOrEqual(110);

    // Synchronicznie, w tym samym zadaniu co „Wyczyść” — bez czekania na klatkę update().
    const poWyczysc = await page.evaluate((klucze) => {
      window.clearAllData();
      return Object.fromEntries(klucze.map((k) => [k, window[k] === undefined ? null : window[k]]));
    }, POCHODNE);
    expect(poWyczysc, 'wartości pochodne zaraz po clearAllData()').toEqual(PUSTE);

    await sledzKarteSpozycia(page);
    await page.locator('#lastName').pressSequentially('ProbnaReczna', { delay: 20 });
    await page.locator('#age').click();
    await page.locator('#age').pressSequentially('12', { delay: 120 });
    await page.locator('#ageMonths').click();
    await page.locator('#ageMonths').pressSequentially('0', { delay: 120 });
    await page.selectOption('#sex', 'F');
    await wpiszKlawiszami(page, B.masa, '150');
    await expect.poll(() => cole(page), { message: 'Cole liczony z wpisanych pól' }).toBeLessThan(110);
    await page.waitForTimeout(1500);
    const stan = await stanSpozycia(page);
    expect(stan.widoki, 'karta spożycia ani razu nie rozwinięta').not.toContain('block');
    expect(stan.historia).toBeNull();
  });

  test('update() zatrzymany na błędzie zakresu albo braku masy nie zostawia Cole w raporcie', async ({ page }) => {
    test.setTimeout(90_000);
    await otworz(page);
    await wpiszPacjentke(page, A);
    const colePacjentkiA = await cole(page);
    expect(colePacjentkiA).toBeGreaterThanOrEqual(110);
    const faktyCole = () => page.evaluate(() => {
      const f = window.patientReportZbierzFaktyNaglowka({ cards: [], historyCount: 0 });
      return f && f.cole ? f.cole : null;
    });
    expect(await faktyCole(), 'warunek scenariusza: nagłówek raportu ma Cole').not.toBeNull();

    const ustaw = (id, v) => page.evaluate(([id, v]) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }, [id, v]);

    // Wzrost 39 cm jest poza zakresem 40–250: update() staje na walidacji.
    await ustaw('height', '39');
    await expect.poll(() => pochodne(page), { message: 'błąd zakresu: bez Cole i BMI' }).toEqual(PUSTE);
    expect(await faktyCole(), 'nagłówek raportu bez Cole poprzednich pól').toBeNull();

    await ustaw('height', '150');
    await expect.poll(() => cole(page), { message: 'poprawne pola: Cole wraca' }).toBeCloseTo(colePacjentkiA, 1);

    await ustaw('weight', '');
    await expect.poll(() => pochodne(page), { message: 'brak masy: bez Cole i BMI' }).toEqual(PUSTE);
  });

  test('kontrola: ta sama pacjentka po F5 i po ponownym wczytaniu zachowuje własny Cole', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpiszPacjentke(page, A);
    const colePacjentkiA = await cole(page);
    const pidA = await zapisz(page);

    await wczytajDoWyboru(page, pidA);
    await wybierz(page, '#vildaLcmRestore');
    await expect.poll(() => cole(page), { message: 'ponowne wczytanie i „Odtwórz zapis”' })
      .toBeCloseTo(colePacjentkiA, 1);
    // Odświeżenie pól z custom-fixes.js po 3,2 s nie gubi wartości.
    await page.waitForTimeout(4000);
    expect(await cole(page)).toBeCloseTo(colePacjentkiA, 1);
    await expect(page.locator('#intakeCard'), 'A z Cole ≥ 110%: karta spożycia rozwinięta').toBeVisible();

    await zalogowana(page);
    await expect.poll(() => cole(page), { message: 'F5: odtworzenie sesji liczy Cole A od nowa' })
      .toBeCloseTo(colePacjentkiA, 1);
    await page.waitForTimeout(4000);
    expect(await cole(page)).toBeCloseTo(colePacjentkiA, 1);
  });
});
