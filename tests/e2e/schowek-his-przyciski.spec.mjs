import { expect, test } from '../support/test-czas.mjs';
import { spozaWindows1250 } from '../support/windows1250.mjs';

// P-SCHOWEK-HIS-2 (zlecenie właściciela 2026-10-13: „zrób to samo dla pozostałych przycisków kopiowania,
// wolałbym wszędzie słownie »co najmniej«"). Przyciski kopiowania tekstu klinicznego przepuszczają tekst
// przez VildaSchowek.dlaSystemuSzpitalnego() — znak spoza Windows-1250 („≥", „−", „μ", „Δ", „²"…) wracał
// z systemu szpitalnego (Eskulap: PDF, P1) jako „?".
//
// Każdy test klika PRAWDZIWY przycisk dwa razy na tym samym stanie strony:
//   1. z modułem schowka — tekst ma się zmieścić w Windows-1250;
//   2. po chwilowym zdjęciu modułu (window.VildaSchowek = undefined) — to tekst SUROWY, jaki przycisk
//      kopiował dotąd. Kontrola dodatnia: surowy MUSI mieć znaki spoza Windows-1250, inaczej test
//      nic by nie dowodził. Do tego relacja dokładna: tekst z modułem === dlaSystemuSzpitalnego(surowy).
// Dwa kliknięcia sprawdzają też, że bez modułu przycisk dalej kopiuje (tekst bez zmian, jak przed zmianą).
// Wiązania pozostałych przycisków pilnuje strażnik tests/unit/schowek-his-przyciski.test.mjs. Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

// Schowek pod kontrolą testu: każdy zapis ląduje w window.__kopie (ten sam wzorzec, co w innych plikach).
async function przechwycSchowek(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
    window.__kopie = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t) => { window.__kopie.push(t); return Promise.resolve(); } },
    });
  });
}

async function nowyZapis(page, kliknij) {
  const przed = await page.evaluate(() => window.__kopie.length);
  await kliknij();
  await page.waitForFunction((n) => window.__kopie.length > n, przed, { timeout: 15000 });
  return page.evaluate(() => window.__kopie[window.__kopie.length - 1]);
}

// Dwa kliknięcia: z modułem i bez niego. Zwraca oba teksty i oczekiwany wynik zamiany.
async function zModulemIBez(page, kliknij) {
  expect(await page.evaluate(() => typeof (window.VildaSchowek || {}).dlaSystemuSzpitalnego),
    'kontrola: strona ładuje vilda_schowek.js').toBe('function');
  const zModulem = await nowyZapis(page, kliknij);
  await page.evaluate(() => { window.__modulSchowka = window.VildaSchowek; window.VildaSchowek = undefined; });
  let surowy;
  try {
    surowy = await nowyZapis(page, kliknij);
  } finally {
    await page.evaluate(() => { window.VildaSchowek = window.__modulSchowka; });
  }
  const oczekiwany = await page.evaluate((t) => window.VildaSchowek.dlaSystemuSzpitalnego(t), surowy);
  return { zModulem, surowy, oczekiwany };
}

function sprawdz({ zModulem, surowy, oczekiwany }) {
  expect(spozaWindows1250(surowy).length, `kontrola dodatnia — surowy tekst ma znaki spoza Windows-1250:\n${surowy}`)
    .toBeGreaterThan(0);
  expect(zModulem, 'schowek = zamiana surowego tekstu, nic więcej').toBe(oczekiwany);
  expect(spozaWindows1250(zModulem), 'każdy znak przeżyje stronę kodową Windows-1250').toEqual([]);
}

async function zalozKonto(page, url, haslo) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), haslo);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

test('Notatki: „Kopiuj" oddaje treść notatki bez „?" w HIS — „≥" słownie, minus zwykły, mikro z Windows-1250', async ({ page }) => {
  await przechwycSchowek(page);
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });
  await zalozKonto(page, '/notatki.html', 'E2e#SchowekNotatki!26');
  await page.evaluate(async () => {
    // Notatki są za bramką PRO (podpisany token) — podmieniamy wyłącznie bramkę, jak w notatki-bledy.spec.mjs.
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    await window.VildaVault.saveNote({
      title: 'Kontrola endokrynologiczna',
      category: 'zalecenia',
      body: 'Tempo wzrastania \u22654 cm/rok; hSDS \u22121,20 (\u0394hSDS \u22120,10); TSH 2,1 \u03BCIU/mL; BMI 17,2 kg/m\u00B2.',
    });
  });
  await page.waitForFunction(() => [...document.querySelectorAll('.note-card__title')]
    .some((t) => t.textContent === 'Kontrola endokrynologiczna'), null, { timeout: 20000 });
  const kliknij = () => page.evaluate(() => {
    const karta = [...document.querySelectorAll('.note-card')]
      .find((k) => (k.querySelector('.note-card__title') || {}).textContent === 'Kontrola endokrynologiczna');
    karta.querySelector('.note-act--copy').click();
  });

  const wynik = await zModulemIBez(page, kliknij);
  sprawdz(wynik);
  expect(wynik.zModulem).toBe(
    'Tempo wzrastania co najmniej 4 cm/rok; hSDS -1,20 (zmiana hSDS -0,10); TSH 2,1 \u00B5IU/mL; BMI 17,2 kg/m2.');
});

test('Karta pacjenta (terminarz): „Skopiuj podsumowanie wyników" bez znaków spoza Windows-1250', async ({ page }) => {
  await przechwycSchowek(page);
  await zalozKonto(page, '/terminarz.html', 'E2e#SchowekKarta!26');
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.VildaPatientSummaryCopy));
  // Chłopiec 9;3, 24 kg, 126 cm (dane fikcyjne). Podsumowanie Karty niesie BMI w „kg/m²" — „²" jest spoza
  // Windows-1250 (tablica Windows dałaby „kg/m2" po cichu, a koder bez niej — „kg/m?").
  const id = await page.evaluate(async () => {
    const wynik = await window.VildaVault.savePatient({
      name: 'Testowy Schowek',
      user: { lastName: 'Testowy', firstName: 'Schowek', sex: 'M', age: 9, ageMonths: 3, height: 126, weight: 24 },
    }, { dedup: false });
    return wynik.patientId;
  });
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid), id);
  const przycisk = page.locator('.vilda-copy-summary-btn');
  await expect(przycisk).toBeVisible({ timeout: 15000 });

  const wynik = await zModulemIBez(page, () => przycisk.click());
  sprawdz(wynik);
  expect(wynik.zModulem).toMatch(/BMI: [0-9]+,[0-9] kg\/m2/);
});

test('Przelicznik jednostek: kliknięta wartość „μmol/L" trafia do schowka ze znakiem mikro z Windows-1250', async ({ page }) => {
  await przechwycSchowek(page);
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaSchowek) && Boolean(document.getElementById('labSubstance')));
  // Kortyzol 400 w jednostce domyślnej — w tabeli wyników wiersz „μmol/L" z grecką literą mi.
  await page.locator('#labSubstance').fill('Kortyzol');
  await page.locator('#labSubstanceDropdown [data-id="cortisol"]').click();
  await page.locator('#labValue').fill('400');
  const komorka = page.locator('#labResultsCard td.lab-value[data-copy-text*="\u03BCmol/L"]');
  await expect(komorka, 'kontrola: wiersz z greckim „\u03BC" w jednostce').toHaveCount(1, { timeout: 15000 });

  // Tabela wszystkich jednostek bywa zwinięta — klik idzie w prawdziwą komórkę, przez prawdziwy nasłuch tabeli.
  const wynik = await zModulemIBez(page, () => komorka.evaluate((td) => td.click()));
  sprawdz(wynik);
  expect(wynik.zModulem).toMatch(/^[0-9][0-9 ,]* \u00B5mol\/L$/);
});
