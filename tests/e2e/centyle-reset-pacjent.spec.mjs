import { expect, test } from '../support/test-czas.mjs';

// P-CENTYLE-RESET — centyle masy i wzrostu poprzedniego pacjenta nie przechodzą na następnego
// (2026-10-14, polecenie właściciela: punkt 3 listy po P-COLE-RESET).
//
// lastWeightPercentile i lastHeightPercentile zapisuje tylko karta centyli w pełnym update(), i to tylko u dziecka
// ze statystykami. Dorosły, zatrzymany update() (puste pole, błąd zakresu), „Wyczyść” i wczytanie innego pacjenta
// zostawiały wartości poprzedniego dziecka. Czytają je puls trybu PRO (applyProModePulse) i ton wierszy
// „Waga”/„Wzrost” w Podsumowaniu (getProfessionalSummaryLineTone, P-TON-3). Widoczny skutek: w stanie błędu
// zakresu wiersz masy nowego dziecka dostawał kolor z centyla poprzedniego — fałszywy alarm albo brak alarmu.
//
// Kontrakt: global = bieżący formularz albo null. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#CentyleReset!26';
const KLUCZE = ['lastWeightPercentile', 'lastHeightPercentile'];
const PUSTE = { lastWeightPercentile: null, lastHeightPercentile: null };
// A: dziewczynka 10 l. 0 mies., 125 cm, 20 kg — masa ok. 0,1 c., wzrost ok. 0,9 c. (oba < 3).
// D: kobieta 35 l., 170 cm, 70 kg.
const A = { lastName: 'ProbnaMala', age: '10', ageMonths: '0', sex: 'F', height: '125', weight: '20' };
const D = { lastName: 'ProbnaDorosla', age: '35', ageMonths: '0', sex: 'F', height: '170', weight: '70' };

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
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
    const planTestowy = () => {
      const access = window.VildaProAccess;
      if (!access) return;
      access.__setTokenModeForTest(false);
      access.setPlan('pro', '2099-12-31T23:59:59.000Z');
    };
    document.addEventListener('DOMContentLoaded', planTestowy, { once: true });
    document.addEventListener('vilda:session-changed', planTestowy);
  });
  page.on('dialog', (d) => { d.accept().catch(() => {}); });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await zalogowana(page);
}

async function trybPro(page, wlaczony) {
  await page.evaluate((on) => {
    const t = document.getElementById('resultsModeToggle');
    if (t && t.checked !== on) { t.checked = on; t.dispatchEvent(new Event('change', { bubbles: true })); }
  }, wlaczony);
}

const centyle = (page) => page.evaluate((klucze) => Object.fromEntries(
  klucze.map((k) => [k, window[k] === undefined ? null : window[k]]),
), KLUCZE);

async function wpisz(page, p) {
  await page.evaluate((pola) => {
    for (const [id, v] of Object.entries(pola)) {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.update();
  }, p);
}

async function zapisz(page) {
  const przed = await page.evaluate(async () => (await window.VildaVault.listPatients()).map((x) => x.patientId));
  await page.locator('#saveDataBtnSidebar').click();
  let id = null;
  await expect.poll(async () => {
    const po = await page.evaluate(async () => (await window.VildaVault.listPatients()).map((x) => x.patientId));
    id = po.find((x) => !przed.includes(x)) || null;
    return id;
  }, { message: 'w sejfie pojawia się nowy pacjent' }).not.toBeNull();
  return id;
}

async function wczytajDoWyboru(page, pid) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (r) => { if (r) window.applyLoadedData(r); }, null), pid);
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

// Kolor wiersza z karty Podsumowania (tryb PRO): { tekst, kolor }.
const wierszPodsumowania = (page, etykieta) => page.evaluate((et) => {
  const r = [...document.querySelectorAll('#currentSummaryContent .current-summary-row')]
    .find((x) => x.textContent.trim().startsWith(et + ':'));
  return r ? { tekst: r.textContent.trim(), kolor: r.style.color } : null;
}, etykieta);

test.describe('Centyle masy i wzrostu nie przechodzą na następnego pacjenta', () => {
  test('dorosła po dziecku: okno wyboru i „Odtwórz zapis” bez centyli dziecka', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, A);
    await expect.poll(async () => (await centyle(page)).lastWeightPercentile).toBeLessThan(3);
    const pidA = await zapisz(page);
    await page.evaluate(() => window.clearAllData());
    await wpisz(page, D);
    const pidD = await zapisz(page);

    await wczytajDoWyboru(page, pidA);
    await wybierz(page, '#vildaLcmRestore');
    await expect.poll(async () => (await centyle(page)).lastWeightPercentile, { message: 'A: własny centyl masy' }).toBeLessThan(3);

    // Na bazie (2df41a8): 0,08 / 0,8 — wartości A.
    await wczytajDoWyboru(page, pidD);
    expect.soft(await centyle(page), 'okno wyboru D: bez centyli A').toEqual(PUSTE);
    await wybierz(page, '#vildaLcmRestore');
    await page.waitForTimeout(1500);
    expect(await centyle(page), 'D po „Odtwórz zapis”: dorosły nie ma centyli masy/wzrostu').toEqual(PUSTE);
  });

  test('„Wyczyść” i literówka wzrostu: wiersz masy nowego dziecka bez koloru poprzedniego', async ({ page }) => {
    test.setTimeout(90_000);
    await otworz(page);
    await trybPro(page, true);
    await wpisz(page, A);
    await expect.poll(async () => (await centyle(page)).lastWeightPercentile).toBeLessThan(3);

    const poWyczysc = await page.evaluate((klucze) => {
      window.clearAllData();
      return Object.fromEntries(klucze.map((k) => [k, window[k] === undefined ? null : window[k]]));
    }, KLUCZE);
    expect.soft(poWyczysc, 'centyle zaraz po clearAllData()').toEqual(PUSTE);

    // Nowe dziecko: 33 kg (ok. 47 c.) i wzrost 14 cm zamiast 140 (poza zakresem 40–250) — update() staje.
    await wpisz(page, { lastName: 'ProbnaLiterowka', age: '10', ageMonths: '0', sex: 'F', weight: '33', height: '14' });
    await page.waitForTimeout(1200);
    expect.soft(await centyle(page), 'błąd zakresu: bez centyli').toEqual(PUSTE);
    const waga = await wierszPodsumowania(page, 'Waga');
    expect(waga && waga.tekst, 'warunek: Podsumowanie pokazuje masę nowego dziecka').toMatch(/33 kg, 47 centyl/);
    // Na bazie: var(--danger) — ton z centyla masy A (0,08).
    expect(waga.kolor, 'kolor wiersza masy z centyla w tym wierszu').toBe('var(--primary)');
  });

  test('odwrotnie: po dziecku w normie masa < 1. centyla nowego dziecka nie traci alarmu przy błędzie zakresu', async ({ page }) => {
    test.setTimeout(90_000);
    await otworz(page);
    await trybPro(page, true);
    // N: dziewczynka 10 l., 140 cm, 33 kg — oba centyle w normie.
    await wpisz(page, { lastName: 'ProbnaNorma', age: '10', ageMonths: '0', sex: 'F', height: '140', weight: '33' });
    await expect.poll(async () => (await centyle(page)).lastWeightPercentile).toBeGreaterThan(10);
    await page.evaluate(() => window.clearAllData());
    // Nowe dziecko: 20 kg (< 1. centyla) i wzrost 14 cm zamiast 140 — update() staje na błędzie zakresu.
    await wpisz(page, { lastName: 'ProbnaLiterowka', age: '10', ageMonths: '0', sex: 'F', weight: '20', height: '14' });
    await page.waitForTimeout(1200);
    const waga = await wierszPodsumowania(page, 'Waga');
    expect(waga && waga.tekst, 'warunek: Podsumowanie pokazuje masę nowego dziecka').toMatch(/20 kg, <1 centyla/);
    // Na bazie: var(--primary) — ton z centyla masy dziecka w normie, czyli brak alarmu.
    expect(waga.kolor, 'alarm masy < 1. centyla').toBe('var(--danger)');
  });

  test('ten sam pacjent 17 → 19 lat: dorosły bez centyli z wieku dziecięcego', async ({ page }) => {
    test.setTimeout(90_000);
    await otworz(page);
    await wpisz(page, { lastName: 'ProbnaSiedemnastka', age: '17', ageMonths: '0', sex: 'F', height: '148', weight: '40' });
    await expect.poll(async () => (await centyle(page)).lastHeightPercentile).toBeLessThan(3);
    await wpisz(page, { age: '19' });
    await page.waitForTimeout(1200);
    expect(await centyle(page), '19 lat: bez centyli z 17 lat').toEqual(PUSTE);
  });

  test('kontrola: dziecko < 3 c. po F5 i ponownym wczytaniu zachowuje centyle, puls PRO działa', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await trybPro(page, true);
    await wpisz(page, A);
    await expect.poll(async () => (await centyle(page)).lastWeightPercentile).toBeLessThan(3);
    const wlasne = await centyle(page);
    const pidA = await zapisz(page);

    await wczytajDoWyboru(page, pidA);
    await wybierz(page, '#vildaLcmRestore');
    await expect.poll(() => centyle(page), { message: 'ponowne wczytanie: te same centyle' }).toEqual(wlasne);
    await page.waitForTimeout(4000);
    expect(await centyle(page)).toEqual(wlasne);

    await trybPro(page, false);
    await trybPro(page, true);
    await expect(page.locator('#whResult .pro-overlay.bmi-danger'), 'puls karty centyli po włączeniu PRO').toHaveCount(1);
    expect((await wierszPodsumowania(page, 'Waga')).kolor, 'ton masy dziecka bez zmian').toBe('var(--danger)');

    await zalogowana(page);
    await expect.poll(() => centyle(page), { message: 'F5: odtworzenie sesji liczy centyle A od nowa' }).toEqual(wlasne);
  });
});
