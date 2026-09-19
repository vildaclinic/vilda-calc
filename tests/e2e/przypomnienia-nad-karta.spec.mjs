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
// STEROWANY ZEGAR (2026-09-19, po porażce w pełnym przebiegu przy 6 workerach). Pierwsza wersja
// tego testu zakładała, że Karta zdąży się otworzyć przed upływem 3 s od odblokowania sejfu.
// Pod obciążeniem to założenie pada: arkusz wchodził PIERWSZY, a test widział go nad Kartą
// otwartą chwilę później i zgłaszał usterkę produktu tam, gdzie była usterka testu. Zegar strony
// zatrzymujemy więc zanim odliczanie arkusza dobiegnie, otwieramy Kartę, i dopiero wtedy
// przesuwamy czas ręcznie. Kolejność zdarzeń przestaje zależeć od obciążenia maszyny.
//
// Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Arkusz!26a';
// Zegar arkusza (3 s) + oczekiwanie na syncPull (2,5 s) + zapas.
const PO_ZEGARZE_MS = 12_000;

const ARKUSZ = '.vilda-reminders-modal-overlay';

// Dozowanie czasu przy zatrzymanym zegarze: przesuwamy go krótkimi krokami, aż warunek
// będzie spełniony. Suma kroków (600 ms) zostaje poniżej zegara arkusza, więc odliczanie
// przypomnień nadal nie może dobiec, zanim test otworzy Kartę.
async function dozujAzDo(page, warunek, krokMs = 50, maksKrokow = 12) {
  for (let i = 0; i < maksKrokow; i += 1) {
    if (await warunek()) return;
    await page.clock.runFor(krokMs);
    await page.waitForTimeout(150);
  }
  if (!(await warunek())) throw new Error('strona nie wstała w budżecie dozowanego czasu');
}

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

  // Zegar strony zatrzymujemy PRZED przeładowaniem — odliczanie arkusza rusza przy odblokowaniu
  // sejfu, czyli w trakcie startu strony, i po starcie jest już za późno, żeby je wyprzedzić.
  const teraz = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(teraz + 2000));

  await page.reload({ waitUntil: 'load' });
  // Start strony potrzebuje własnych timerów, więc czas dozujemy porcjami — tyle, ile trzeba,
  // by sejf się odblokował i wstało API, ale mniej niż zegar arkusza (3 s + do 2,5 s na syncPull).
  await dozujAzDo(page, () => page.evaluate(() => Boolean(window.VildaVault)
    && window.VildaVault.isUnlocked() && Boolean(window.VildaAuthUI)));
  return patientId;
}

test('arkusz nie przykrywa otwartej Karty Pacjenta, a po jej zamknięciu sam wraca', async ({ page }) => {
  test.setTimeout(180_000);
  const patientId = await kontoZNotatkaNaDzis(page);

  // Zatrzymujemy czas strony, zanim odliczanie arkusza dobiegnie…
  // Pauzujemy w chwili BIEŻĄCEJ dla strony (nie w CHWILI startowej — czas zdążył już ruszyć,
  // a `pauseAt` w przeszłość rzuca „Cannot fast-forward to the past"). Margines 100 ms
  // trzyma nas po właściwej stronie tej granicy.
  const terazStrony = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(terazStrony + 100));

  // …lekarz wchodzi w Kartę…
  await page.evaluate((id) => window.VildaAuthUI.showPatientEditScreen(id), patientId);
  await expect(page.getByRole('button', { name: 'Zapisz zmiany' })).toBeVisible({ timeout: 30000 });

  // …i dopiero teraz puszczamy czas daleko poza zegar arkusza (3 s) i oczekiwanie na syncPull (2,5 s).
  await page.clock.runFor(PO_ZEGARZE_MS);
  await page.waitForTimeout(1500);

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
  await page.clock.runFor(10_000);
  await expect(page.locator(ARKUSZ), 'arkusz wraca po zamknięciu Karty')
    .toBeVisible({ timeout: 30_000 });
});

test('kontrola: bez otwartej Karty arkusz nadal pokazuje się sam', async ({ page }) => {
  test.setTimeout(180_000);
  await kontoZNotatkaNaDzis(page);
  // Karty nie otwieramy — puszczamy czas poza zegar arkusza i arkusz ma wejść sam.
  await page.clock.runFor(PO_ZEGARZE_MS);
  await expect(page.locator(ARKUSZ), 'dzienny przegląd działa jak dotąd')
    .toBeVisible({ timeout: 30_000 });
});
