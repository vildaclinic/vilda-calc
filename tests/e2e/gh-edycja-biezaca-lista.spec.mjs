import { expect, test } from '../support/test-czas.mjs';

// P-GH-EDYCJA-LISTA: edycja punktu terapii GH na prawdziwym DocPro dotyczy wyłącznie punktu z bieżącej listy.
// A — odświeżenie listy u tego samego pacjenta (inna ramka zapisała tę samą listę): edycja trwa i zapisuje punkt
//     w miejscu (ten sam id i pozycja).
// B — punktu nie ma już na liście: zapis edycji kończy się komunikatem, bez zapisu; lista, pamięć modułu i tabela
//     pokazują bieżącą listę.
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhEdycjaLista!26';
const NIE_ZAPISANO = 'Nie zapisano zmian: edytowany punkt nie należy do bieżącej listy punktów. Otwórz edycję ponownie.';

const P1 = {
  id: 'gh-e2e-l1', type: 'start', ageYears: 8, ageMonths: 0, weight: 25, height: 122, boneAge: null,
  dose: 0.028, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP',
  igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.7,
};
const P2 = {
  id: 'gh-e2e-l2', type: 'continue', ageYears: 8, ageMonths: 6, weight: 27, height: 125.5, boneAge: null,
  dose: 0.8 / 27, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP',
  igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.8,
};
const P3 = {
  id: 'gh-e2e-l3', type: 'continue', ageYears: 9, ageMonths: 0, weight: 29, height: 128.4, boneAge: null,
  dose: 0.9 / 29, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP',
  igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.9,
};

async function zaloguj(page) {
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
}

async function docProGotowe(page) {
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function'
    && Boolean(window.vildaGhIgfPersistApi) && Boolean(window.vildaGhTherapyMonitorPersistApi), null, { timeout: 60000 });
  await page.waitForTimeout(2500); // odtworzenie stanu DocPro biegnie do ~1,5 s po starcie strony
}

// Karta GH/IGF-1 z monitorem siedzi na DocPro w ukrytej sekcji modułów — do klikania jak lekarz przenosimy ją na wierzch.
async function kartaNaWierzch(page) {
  await page.evaluate(() => {
    window.vildaGhIgfPersistApi.ensureMounted();
    const k = document.getElementById('ghIgfTherapyCard');
    const pudlo = document.createElement('div');
    pudlo.style.cssText = 'position:relative;z-index:99999;background:#fff;padding:8px';
    document.body.prepend(pudlo);
    pudlo.appendChild(k);
    k.style.display = 'block';
    window.ghActivateTab('mon');
  });
}

async function otworzDocProZPunktami(page) {
  await zaloguj(page);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await docProGotowe(page);
  await kartaNaWierzch(page);
  await page.evaluate(() => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '9'); set('ageMonths', '0'); set('sex', 'M'); set('height', '130'); set('weight', '29');
    if (typeof window.update === 'function') window.update();
    set('therProg', 'SNP'); set('therDrug', 'Omnitrope 10 mg');
    document.getElementById('name').value = 'Fikcyjny Test Edycji';
  });
  await page.evaluate((lista) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', lista, { force: true });
    window.refreshGHTherapyMonitor();
  }, [P1, P2, P3]);
  await expect(page.locator('#ghTherapyTbody .edit-gh-pt-btn')).toHaveCount(3);
}

const punkty = (page) => page.evaluate(() => JSON.stringify(window.ghTherapyPoints));
const modul = (page) => page.evaluate(() => JSON.stringify(
  window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', [])));
const idWierszy = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#ghTherapyTbody .edit-gh-pt-btn'))
  .map((b) => b.getAttribute('data-id')));
const zamknijNakladkeEdycji = (page) => page.evaluate(() => {
  const o = document.getElementById('ghEditOverlay');
  const b = o && Array.from(o.querySelectorAll('button')).find((x) => x.textContent === 'Rozumiem');
  if (b) b.click();
});

test('A: odświeżenie listy u tego samego pacjenta — edycja trwa i zapisuje punkt w miejscu', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzDocProZPunktami(page);

  await page.click('.edit-gh-pt-btn[data-id="gh-e2e-l2"]');
  await zamknijNakladkeEdycji(page);
  await expect(page.locator('#ghTherapyEditContainer')).toBeVisible();
  await page.fill('#ghEditWeight', '27.6');
  await page.fill('#ghEditHeight', '126');
  // Inna ramka tej karty zapisała tę samą listę i dała znać kanałem; odbiornik app.js odświeża monitor.
  await page.evaluate(() => {
    window.__odswiezenia = 0;
    const odswiez = window.refreshGHTherapyMonitor;
    window.refreshGHTherapyMonitor = function () { window.__odswiezenia += 1; return odswiez.apply(this, arguments); };
    new BroadcastChannel('gh-therapy-sync').postMessage({ type: 'update', tabId: window.VildaPersistence.getTabId() });
  });
  await expect.poll(() => page.evaluate(() => window.__odswiezenia)).toBeGreaterThan(0);
  await expect(page.locator('#ghTherapyEditContainer')).toBeVisible();
  expect(await page.evaluate(() => {
    const s = window.vildaGhTherapyMonitorPersistApi.captureState();
    return s && { id: s.currentEditingId, waga: s.fields.weight, wzrost: s.fields.height };
  })).toEqual({ id: 'gh-e2e-l2', waga: '27.6', wzrost: '126' });

  await page.click('#btnGhContinue');
  await expect(page.locator('#ghTherapyEditContainer')).toBeHidden();

  const p2PoEdycji = { ...P2, weight: 27.6, height: 126, dose: 0.8 / 27.6, doseAbs: 0.8 };
  const oczekiwane = JSON.stringify([P1, p2PoEdycji, P3]);
  expect(await punkty(page)).toBe(oczekiwane);
  expect(await modul(page)).toBe(oczekiwane);
  expect(await idWierszy(page)).toEqual(['gh-e2e-l1', 'gh-e2e-l2', 'gh-e2e-l3']);
  await expect(page.locator('#ghInfoOverlay')).toHaveCount(0);
});

test('B: punktu nie ma już na liście — zapis edycji kończy się komunikatem, bez zapisu', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzDocProZPunktami(page);

  await page.click('.edit-gh-pt-btn[data-id="gh-e2e-l2"]');
  await zamknijNakladkeEdycji(page);
  await expect(page.locator('#ghTherapyEditContainer')).toBeVisible();
  await page.fill('#ghEditWeight', '27.6');
  // Lista tej karty zmienia się bez odświeżenia monitora (inny zapis tego samego pacjenta).
  await page.evaluate((lista) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', lista, { force: true });
  }, [P1, P3]);
  await page.click('#btnGhContinue');

  await expect(page.locator('#ghInfoOverlay')).toContainText(NIE_ZAPISANO);
  await expect(page.locator('#ghTherapyEditContainer')).toBeHidden();
  const oczekiwane = JSON.stringify([P1, P3]);
  expect(await punkty(page)).toBe(oczekiwane);
  expect(await modul(page)).toBe(oczekiwane);
  expect(await idWierszy(page)).toEqual(['gh-e2e-l1', 'gh-e2e-l3']);
  expect(await page.evaluate(() => window.vildaGhTherapyMonitorPersistApi.captureState())).toBeNull();
});
