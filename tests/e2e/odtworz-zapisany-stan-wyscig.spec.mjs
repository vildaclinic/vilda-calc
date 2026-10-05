import { expect, test } from '../support/test-czas.mjs';

// P-ODTWORZ (zgłoszenie właściciela 2026-09-27): po wczytaniu pacjenta i „Odtwórz zapis” pod „Wyczyść wszystkie
// pola” „nie raz” wracał przycisk „Odtwórz zapisany stan”, który po kliknięciu nic nie robił. Wyścig: mostek
// punktów terapii GH startuje w applyLoadedData z przyciskiem widocznym i kończy się asynchronicznie; gdy kończy
// się PO kliknięciu „Odtwórz zapis”, przywracał przycisk. Tu wymuszamy najgorszy przypadek — import punktów trwa
// 1,5 s — na PRAWDZIWEJ stronie i sprawdzamy, że po dokonanym wyborze przycisk zostaje schowany. Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#OdtwWyscig!26';
const PUNKT_GH = { id: 'gh-e2e-odtw', ageYears: 13, ageMonths: 1, height: 139.9, weight: 45, type: 'gh' };

async function otworz(page) {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })); } catch (_) { /* brak storage */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaProAccess));
  // Najpierw przygotowujemy tryb wymagany przez kartę. Scenariusz sprawdza
  // odtwarzanie danych, a nie bramkę dostępu do obliczeń profesjonalnych.
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

async function policzPacjentke(page) {
  await page.fill('#lastName', 'Probna');
  await page.fill('#firstName', 'Alicja');
  await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
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
  await page.evaluate(() => {
    const w = document.querySelector('#advMeasurements .measure-row');
    const set = (sel, v) => { const e = w.querySelector(sel); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('.adv-age-years', '11'); set('.adv-age-months', '0'); set('.adv-height', '123.9'); set('.adv-weight', '35');
    window.calculateGrowthAdvanced();
  });
  await page.evaluate((p) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', [p], { force: true });
    window.ghTherapyPoints = [p];
  }, PUNKT_GH);
  await page.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
  await page.waitForFunction(() => Number(window.advancedGrowthData && window.advancedGrowthData.growthVelocityGapM) === 11);
}

async function idZapisanegoPacjenta(page) {
  let id = null;
  await expect.poll(async () => {
    id = await page.evaluate(async () => {
      const lista = await window.VildaVault.listPatients();
      return Array.isArray(lista) && lista.length === 1 && lista[0] ? lista[0].patientId : null;
    });
    return typeof id === 'string' && id.length > 0;
  }, { message: 'sejf ma dokładnie jednego zapisanego pacjenta' }).toBe(true);
  return id;
}

test('„Odtwórz zapis” w trakcie powolnego importu punktów GH: przycisk „Odtwórz zapisany stan” nie wraca', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await policzPacjentke(page);
  await page.locator('#saveDataBtnSidebar').click();
  const pid = await idZapisanegoPacjenta(page);
  await page.evaluate(() => window.clearAllData());
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (rekord) => { if (rekord) window.applyLoadedData(rekord); }, null), pid);
  await expect(page.locator('.vhv-tile')).toBeVisible();

  // Najgorszy przypadek wyścigu: import punktów terapii (mostek z applyLoadedData) trwa 1,5 s.
  await page.evaluate(() => {
    const orig = window.importTherapyPointsToAdvancedGrowth;
    window.__e2eImportCalls = 0;
    window.importTherapyPointsToAdvancedGrowth = function () {
      window.__e2eImportCalls += 1;
      return new Promise((resolve) => { setTimeout(async () => { try { resolve(await orig.apply(this, arguments)); } catch (e) { resolve(null); } }, 1500); });
    };
  });
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
  expect(await page.evaluate(() => window.__e2eImportCalls), 'mostek wystartował przy wczytaniu, z przyciskiem widocznym').toBeGreaterThan(0);

  await page.locator('#vildaLcmRestore').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await expect(page.locator('#height'), 'odtworzenie przywraca ostatni pomiar').toHaveValue('148.5');
  await expect(page.locator('#restoreStateBtn')).toBeHidden();
  // koniec powolnego importu (1,5 s) — dotąd właśnie tu przycisk wracał
  await page.waitForTimeout(2500);
  await expect(page.locator('#restoreStateBtn'), 'po dokonanym wyborze nikt nie pokazuje przycisku').toBeHidden();
  expect(await page.evaluate(() => window.sessionStorage.getItem('vildaLoadChoiceV1'))).toBe('restore');
  // punkt terapii mimo to wrócił do historii (mostek zrobił swoje, tylko bez przycisku)
  await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('#advMeasurements .measure-row[data-gh-sync="true"]')).map((r) => r.querySelector('.adv-height')?.value)), { timeout: 15_000 }).toEqual(['139.9']);
});

test('kolejne wczytanie pacjenta znów proponuje wybór — zapamiętany wybór „restore” nie blokuje przycisku dla następnej wizyty', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await policzPacjentke(page);
  await page.locator('#saveDataBtnSidebar').click();
  const pid = await idZapisanegoPacjenta(page);
  await page.evaluate(() => window.clearAllData());
  const wczytaj = async () => {
    await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (rekord) => { if (rekord) window.applyLoadedData(rekord); }, null), pid);
    await expect(page.locator('.vhv-tile')).toBeVisible();
    await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
    await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
  };
  await wczytaj();
  await page.locator('#vildaLcmRestore').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await expect(page.locator('#restoreStateBtn')).toBeHidden();
  // druga wizyta: modal „Co chcesz zrobić?” pojawia się, bo nowe wczytanie kasuje wybór z sesji
  await page.evaluate(() => window.clearAllData());
  await wczytaj();
  await page.locator('#vildaLcmNew').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await expect(page.locator('#restoreStateBtn')).toBeHidden();
  expect(await page.evaluate(() => window.sessionStorage.getItem('vildaLoadChoiceV1'))).toBe('new');
});

// Ścieżka F5 (pytanie właściciela 2026-09-27): po „Odtwórz zapis” odświeżenie strony odtwarza sesję przez
// applyLoadedData({ isSessionRestore: true }) — ten sam mostek punktów GH startuje od nowa, a start persistence
// decyduje o przycisku wg zapamiętanego wyboru. Sprawdzamy dwa F5 pod rząd: przycisk nie wraca, wybór „restore”
// zostaje w sesji, modal nie pyta ponownie, punkt terapii jest w historii. Powolnego importu nie da się tu
// wymusić z zewnątrz (moduł analizy wzrastania jest zamrożony, a przy odtwarzaniu sesji mostek idzie przez
// zależności app.js, nie przez window) — ten wyścig pokrywa test jednostkowy na prawdziwym module
// (tests/unit/odtworz-po-wyborze.test.mjs); tu liczy się prawdziwa ścieżka F5 na prawdziwej stronie.
test('F5 po „Odtwórz zapis” u pacjenta z punktami GH: przycisk nie wraca — także po drugim F5', async ({ page }) => {
  test.setTimeout(150_000);
  await otworz(page);
  await policzPacjentke(page);
  await page.locator('#saveDataBtnSidebar').click();
  const pid = await idZapisanegoPacjenta(page);
  await page.evaluate(() => window.clearAllData());
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (rekord) => { if (rekord) window.applyLoadedData(rekord); }, null), pid);
  await expect(page.locator('.vhv-tile')).toBeVisible();
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
  await page.locator('#vildaLcmRestore').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await expect(page.locator('#height')).toHaveValue('148.5');
  await expect(page.locator('#restoreStateBtn')).toBeHidden();

  // Sesję główną zapisuje pagehide przy F5; zapis jest wstrzymany przez 2,5 s po „Wyczyść wszystkie pola”
  // (okno blokady persistence). Człowiek nie zdąży w tym oknie wczytać, odtworzyć i odświeżyć — test musiałby.
  await expect.poll(() => page.evaluate(() => window.VildaPersistence.isClearInProgress()), { message: 'okno blokady zapisu po czyszczeniu zamknięte' }).toBe(false);

  const poF5 = async (ktore) => {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
    await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
    await expect(page.locator('#height'), `${ktore}: sesja odtworzona`).toHaveValue('148.5', { timeout: 15_000 });
    // kaskady po starcie (mostek punktów GH, odtworzenie historii) kończą się asynchronicznie
    await page.waitForTimeout(2500);
    await expect(page.locator('#restoreStateBtn'), `${ktore}: po odtworzeniu nie ma czego odtwarzać`).toBeHidden();
    expect(await page.evaluate(() => document.getElementById('restoreStateBtn').style.display), `${ktore}: styl inline przycisku`).toBe('none');
    expect(await page.evaluate(() => window.sessionStorage.getItem('vildaLoadChoiceV1')), `${ktore}: wybór zostaje w sesji`).toBe('restore');
    expect(await page.evaluate(() => Boolean(document.getElementById('vildaLoadChoiceModal'))), `${ktore}: F5 nie pyta ponownie`).toBe(false);
    // punkt terapii jest w historii i tempo liczy się z niego (11 mies.), jak przed F5
    await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('#advMeasurements .measure-row')).map((r) => r.querySelector('.adv-height')?.value)), { message: `${ktore}: punkt terapii w historii`, timeout: 15_000 }).toEqual(['123.9', '139.9']);
    await expect.poll(() => page.evaluate(() => Number(window.advancedGrowthData && window.advancedGrowthData.growthVelocityGapM)), { message: `${ktore}: tempo z ostatnich 11 mies.` }).toBe(11);
  };
  await poF5('pierwsze F5');
  await poF5('drugie F5');
});
