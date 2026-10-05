import { expect, test } from '../support/test-czas.mjs';

// P-GH-TOZSAMOSC rata 2 (decyzja właściciela 2026-09-28, opcja (a) w dwóch ratach).
//
// Rata 1 nauczyła przebudowę tabeli zaawansowanej nie kasować wierszy punktów terapii GH. Rata 2 domyka
// drugą stronę: (1) po „Wyczyść wszystkie pola" flagi zawieszenia synchronizacji opadają w następnym
// ticku (dotąd martwe wywołanie `scheduleTimeout` zostawiało je do przeładowania — w świeżej karcie
// parowanie zaawansowane↔spożycie w ogóle nie działało); (2) lustro punktu terapii w tabeli „Szacowane
// spożycie energii" niesie tożsamość punktu (data-gh-id), parowanie łączy oba wiersze po identyfikatorze,
// a lustro bez punktu jest usuwane, nie awansowane na pomiar ręczny; (3) na ścieżce wczytania pacjenta
// import punktów ma pierwszeństwo przed parowaniem.
//
// Prawdziwa strona, sejf i F5. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhLustro!26a';
const PUNKT_GH = { id: 'gh-e2e-lustro', ageYears: 13, ageMonths: 1, height: 139.9, weight: 45, type: 'gh' };

const wierszeAdv = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#advMeasurements .measure-row')).map((r) => ({
  y: r.querySelector('.adv-age-years')?.value, m: r.querySelector('.adv-age-months')?.value,
  h: r.querySelector('.adv-height')?.value, gh: r.getAttribute('data-gh-sync') === 'true', id: r.getAttribute('data-gh-id') || '',
})));
const wierszeSpozycia = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#intakeMeasurements .measure-row-intake')).map((r) => ({
  y: r.querySelector('.intake-ageY')?.value, m: r.querySelector('.intake-ageM')?.value,
  h: r.querySelector('.intake-ht')?.value, gh: r.getAttribute('data-gh-sync') === 'true', id: r.getAttribute('data-gh-id') || '',
  locked: r.dataset.locked === 'true',
})));
const flagi = (page) => page.evaluate(() => [
  !!window.__vildaSuspendAdvIntakeSync, !!window.__vildaSuspendGrowthHistoryCrossSync, !!window.__vildaSuspendIntakeUserReset,
]);

const RECZNY_ADV = { y: '11', m: '0', h: '123.9', gh: false, id: '' };
const PUNKT_ADV = { y: '13', m: '1', h: '139.9', gh: true, id: 'gh-e2e-lustro' };
const RECZNY_SPOZ = { y: '11', m: '0', h: '123.9', gh: false, id: '', locked: false };
const LUSTRO_SPOZ = { y: '13', m: '1', h: '139.9', gh: true, id: 'gh-e2e-lustro', locked: false };

async function wlaczTrybProfesjonalny(page) {
  await page.waitForFunction(() => Boolean(window.VildaProAccess));
  // Test dotyczy synchronizacji wierszy, a karta wymaga trybu profesjonalnego.
  // Samo disabled=false pozwalało kliknąć, lecz kolejne update chowało kartę.
  // Taki sam fikcyjny dostęp stosuje historia-pomiarow-zwijanie.spec.mjs.
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const tryb = document.getElementById('resultsModeToggle');
    if (tryb && !tryb.checked) {
      tryb.checked = true;
      tryb.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await wlaczTrybProfesjonalny(page);
}

async function wpiszPodstawy(page) {
  await page.fill('#lastName', 'Probna');
  await page.fill('#firstName', 'Alicja');
  await page.evaluate(() => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '14'); set('ageMonths', '0'); set('sex', 'F'); set('height', '148.5'); set('weight', '50.5');
    if (typeof window.update === 'function') window.update();
  });
  await page.waitForSelector('#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]', { state: 'attached' });
  await expect(page.locator('#toggleAdvancedGrowth')).toBeEnabled();
  await page.evaluate(() => {
    const t = document.getElementById('toggleAdvancedGrowth');
    const f = document.getElementById('advancedGrowthForm');
    if (f && getComputedStyle(f).display !== 'none') return;
    if (t) t.click();
  });
  await expect(page.locator('#advancedGrowthForm')).toBeVisible({ timeout: 10000 });
  await page.waitForSelector('#advMeasurements .measure-row', { state: 'attached', timeout: 10000 });
}

// Wiersz ręczny wpisany jak przez lekarza — zdarzenia input z pól, bez wołania calculateGrowthAdvanced().
async function wpiszWierszReczny(page) {
  await page.evaluate(() => {
    const w = document.querySelector('#advMeasurements .measure-row');
    const set = (sel, v) => { const e = w.querySelector(sel); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('.adv-age-years', '11'); set('.adv-age-months', '0'); set('.adv-height', '123.9'); set('.adv-weight', '35');
  });
}

async function wpiszPunktTerapii(page, punkty) {
  await page.evaluate((p) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', p, { force: true });
    window.ghTherapyPoints = p;
  }, punkty);
  await page.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
}

test('po „Wyczyść wszystkie pola" flagi zawieszenia opadają, a nowy wiersz zaawansowany od razu ma lustro w tabeli spożycia', async ({ page }) => {
  await otworz(page);
  // Świeża karta po zalogowaniu: czyszczenie startowe też przechodzi przez ten sam krok.
  await expect.poll(() => flagi(page), { message: 'po starcie karty flagi nie wiszą' }).toEqual([false, false, false]);
  await wpiszPodstawy(page);
  const wTrakcie = await page.evaluate(() => {
    window.clearAllData();
    return [!!window.__vildaSuspendAdvIntakeSync, !!window.__vildaSuspendGrowthHistoryCrossSync, !!window.__vildaSuspendIntakeUserReset];
  });
  expect(wTrakcie, 'w trakcie czyszczenia synchronizacja stoi (synchronicznie)').toEqual([true, true, true]);
  await expect.poll(() => flagi(page), { timeout: 1000, message: 'zdjęte w następnym ticku, nie po przeładowaniu' }).toEqual([false, false, false]);

  await wpiszPodstawy(page);
  await wpiszWierszReczny(page);
  // Parowanie „na żywo" działa w świeżej karcie: wiersz ręczny ma lustro w tabeli spożycia (bez znacznika GH).
  await expect.poll(() => wierszeSpozycia(page).then((w) => w.filter((r) => !r.locked)), { timeout: 5000 }).toEqual([RECZNY_SPOZ]);
});

test('lustro punktu terapii niesie tożsamość: po F5 zostaje ze znacznikiem, po usunięciu punktu znika bez wiersza-ducha', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await wpiszPodstawy(page);
  await wpiszWierszReczny(page);
  await wpiszPunktTerapii(page, [PUNKT_GH]);
  await page.waitForFunction(() => Number(window.advancedGrowthData && window.advancedGrowthData.growthVelocityGapM) === 11);

  // (1) lustro punktu w tabeli spożycia od razu po imporcie, z tożsamością punktu; lustro wiersza ręcznego bez niej
  await expect.poll(() => wierszeAdv(page)).toEqual([RECZNY_ADV, PUNKT_ADV]);
  await expect.poll(() => wierszeSpozycia(page).then((w) => w.filter((r) => !r.locked)), { timeout: 5000 }).toEqual([RECZNY_SPOZ, LUSTRO_SPOZ]);

  // (2) zapis do sejfu i F5 — lustro wraca ze swoją tożsamością, punkt ze znacznikiem, żadnych bliźniaków
  await page.locator('#saveDataBtnSidebar').click();
  await expect.poll(() => page.evaluate(async () => (await window.VildaVault.listPatients()).length), { message: 'sejf ma zapisanego pacjenta' }).toBe(1);
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked() && typeof window.calculateGrowthAdvanced === 'function');
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await wlaczTrybProfesjonalny(page);
  await expect(page.locator('#height'), 'F5 odtwarza ostatni pomiar').toHaveValue('148.5', { timeout: 15000 });
  await page.waitForTimeout(3000);
  expect(await wierszeAdv(page), 'po F5: wiersz ręczny i JEDEN punkt ze znacznikiem').toEqual([RECZNY_ADV, PUNKT_ADV]);
  expect((await wierszeSpozycia(page)).filter((r) => !r.locked), 'po F5: lustro ze znacznikiem, bez dubli').toEqual([RECZNY_SPOZ, LUSTRO_SPOZ]);
  expect(await flagi(page), 'po odtworzeniu stanu flagi opadły').toEqual([false, false, false]);

  // (3) punkt usunięty w monitorze terapii: znika z tabeli zaawansowanej BEZ wiersza-ducha 139,9
  //     (dotąd parowanie dorabiało go z lustra jako wiersz „ręczny"), a lustro znika razem z nim
  await wpiszPunktTerapii(page, []);
  await expect.poll(() => wierszeAdv(page), { timeout: 5000, message: 'bez punktu i bez ducha' }).toEqual([RECZNY_ADV]);
  await expect.poll(() => wierszeSpozycia(page).then((w) => w.filter((r) => !r.locked)), { timeout: 5000, message: 'lustro usunięte razem z punktem' }).toEqual([RECZNY_SPOZ]);
});
