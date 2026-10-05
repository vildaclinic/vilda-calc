import { expect, test } from '../support/test-czas.mjs';

// Dane wyłącznie fikcyjne, własne konto w efemerycznym profilu przeglądarki.
// Edycja historii wzrostu i odświeżenie monitora GH nie tworzą poprzedniej wizyty.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#StanPacjenta!26';
const POMIAR = { lastName: 'Fikcyjna', firstName: 'Alicja', sex: 'F', age: '14', ageMonths: '0', height: '148.5', weight: '50.5' };
const PUNKT_GH = {
  id: 'gh-e2e-stan-pacjenta', type: 'start', ageYears: 13, ageMonths: 1,
  height: 139.9, weight: 45, dose: 0.033, doseUnit: 'mg/kg/d',
  doseAbs: 1.49, drug: 'Omnitrope 5 mg', program: 'SNP',
};

async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaVault);
  }, tytul, { timeout: 30_000 });
  const uchwyt = await page.$(`iframe.app-pane[title="${tytul}"]`);
  const fr = await uchwyt.contentFrame();
  await fr.waitForFunction(() => window.VildaVault.isUnlocked()
    && typeof window.applyLoadedData === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  return fr;
}

async function otworzPowloke(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('vilda-terms-accepted-v1',
      JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
  });
  await page.goto('/app.html', { waitUntil: 'load' });
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
  await page.waitForFunction(() => {
    const fr = document.querySelector('iframe.app-pane[title="Start"]');
    return Boolean(fr && fr.contentWindow && fr.contentWindow.VildaVault);
  });
  const start = await (await page.$('iframe.app-pane[title="Start"]')).contentFrame();
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
  const gotowy = await ramka(page, 'Start');
  await page.waitForTimeout(1500);
  return gotowy;
}

const wpisz = (fr, pola) => fr.evaluate((p) => {
  Object.entries(p).forEach(([id, wartosc]) => {
    const el = document.getElementById(id);
    if (!el) throw new Error('Brak pola ' + id);
    el.value = wartosc;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}, pola);

async function edytujHistorie(fr, wzrost = '123.9') {
  await fr.waitForSelector('#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]', { state: 'attached' });
  await fr.evaluate(() => {
    if (getComputedStyle(document.getElementById('advancedGrowthForm')).display !== 'none') return;
    const przycisk = document.getElementById('toggleAdvancedGrowth');
    przycisk.disabled = false;
    przycisk.click();
  });
  await fr.waitForSelector('#advMeasurements .measure-row', { state: 'attached' });
  await fr.evaluate((cm) => {
    const row = [...document.querySelectorAll('#advMeasurements .measure-row')]
      .find((r) => r.dataset.ghSync !== 'true');
    if (!row) throw new Error('Brak ręcznego wiersza historii');
    for (const [selector, wartosc] of [['.adv-age-years', '11'], ['.adv-age-months', '0'], ['.adv-height', cm], ['.adv-weight', '35']]) {
      const pole = row.querySelector(selector);
      pole.value = wartosc;
      pole.dispatchEvent(new Event('input', { bubbles: true }));
      pole.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.calculateGrowthAdvanced();
  }, wzrost);
}

// Tak samo jak istniejące testy GH: punkt trafia przez adapter persistence,
// a rzeczywisty monitor emituje swoje zdarzenia i odtwarza wiersz historii.
async function cyklTerapii(fr) {
  await fr.evaluate(async (p) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', [p], { force: true });
    window.ghTherapyPoints = [p];
    if (typeof window.refreshGHTherapyMonitor === 'function') await window.refreshGHTherapyMonitor();
    await window.importTherapyPointsToAdvancedGrowth();
  }, PUNKT_GH);
  await expect.poll(() => fr.evaluate(() => (window.ghTherapyPoints || []).map((p) => p.id)))
    .toEqual([PUNKT_GH.id]);
}

// Styl z danej ramki: ukryta ramka powłoki lub bramka PRO fikcyjnego konta
// nie mogą maskować błędnego stanu elementów formularza.
const stanElementow = (fr) => fr.evaluate(() => {
  const vis = (id) => {
    const el = document.getElementById(id);
    return Boolean(el && getComputedStyle(el).display !== 'none');
  };
  return { odtworz: vis('restoreStateBtn'), porownanie: vis('prevSummaryWrap') };
});

async function bezOdtworzeniaIPorownania(fr, etap) {
  expect.soft(await stanElementow(fr), etap).toEqual({ odtworz: false, porownanie: false });
}

async function przejdz(page, panel) {
  await page.evaluate((p) => window.VildaShell.navigate(p), panel);
  const fr = await ramka(page, panel === 'start' ? 'Start' : 'DocPro');
  await page.waitForTimeout(1800); // kaskada persistence, lustro formularza i monitor GH
  return fr;
}

async function zapiszIWczytaj(start, wybor) {
  expect(await start.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  const pid = await start.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);
  await start.evaluate(() => window.clearAllData());
  await start.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (rekord) => {
    if (rekord) window.applyLoadedData(rekord);
  }, null), pid);
  await expect(start.getByRole('button', { name: 'Wczytaj tego pacjenta' })).toBeVisible();
  await start.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(start.locator('#vildaLoadChoiceModal')).toBeVisible();
  await start.locator(wybor === 'restore' ? '#vildaLcmRestore' : '#vildaLcmNew').click();
  await expect(start.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await start.waitForTimeout(1800);
  return pid;
}

test('nowy pacjent: własny pierwszy zapis, historia wzrostu, terapia GH i przełączanie Start / DocPro nie proponują odtwarzania ani porównania', async ({ page }) => {
  test.setTimeout(120_000);
  const start = await otworzPowloke(page);
  await wpisz(start, POMIAR);
  await edytujHistorie(start);
  await bezOdtworzeniaIPorownania(start, 'nowy pacjent po edycji historii');
  expect(await start.evaluate(async () => (await window.VildaVault.listPatients()).length), 'jeszcze nie zapisano żadnej wizyty').toBe(0);
  expect(await start.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);

  const docpro = await przejdz(page, 'docpro');
  await expect(docpro.locator('#height')).toHaveValue(POMIAR.height);
  await bezOdtworzeniaIPorownania(docpro, 'nowy pacjent po pierwszym wejściu na DocPro');
  await edytujHistorie(docpro, '124.4');
  await cyklTerapii(docpro);
  await bezOdtworzeniaIPorownania(docpro, 'nowy pacjent po edycji i odświeżeniu GH');

  await przejdz(page, 'start');
  await bezOdtworzeniaIPorownania(start, 'nowy pacjent po powrocie na Start');
  await przejdz(page, 'docpro');
  await bezOdtworzeniaIPorownania(docpro, 'nowy pacjent po ponownym wejściu na DocPro');
  expect(await start.evaluate(async () => (await window.VildaVault.listPatients()).length), 'zapisano pierwszą wizytę, bez poprzedniej').toBe(1);
});

test('„Odtwórz zapis”: edycja historii, cykl GH, przełączanie paneli i F5 nie przywracają ukrytych elementów', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await otworzPowloke(page);
  await wpisz(start, POMIAR);
  await edytujHistorie(start);
  await cyklTerapii(start);
  await zapiszIWczytaj(start, 'restore');
  await expect(start.locator('#height')).toHaveValue(POMIAR.height);
  await bezOdtworzeniaIPorownania(start, 'bezpośrednio po „Odtwórz zapis”');

  const docpro = await przejdz(page, 'docpro');
  await expect(docpro.locator('#height')).toHaveValue(POMIAR.height);
  await edytujHistorie(docpro, '124.4');
  expect(await docpro.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await cyklTerapii(docpro);
  await bezOdtworzeniaIPorownania(docpro, 'odtworzony pacjent po edycji i odświeżeniu GH');
  await przejdz(page, 'start');
  await bezOdtworzeniaIPorownania(start, 'odtworzony pacjent po powrocie na Start');
  await przejdz(page, 'docpro');
  await bezOdtworzeniaIPorownania(docpro, 'odtworzony pacjent po ponownym wejściu na DocPro');

  await page.reload({ waitUntil: 'load' });
  const poF5 = await przejdz(page, 'docpro');
  await expect(poF5.locator('#height'), 'F5 odtwarza pomiar').toHaveValue(POMIAR.height);
  await cyklTerapii(poF5);
  await bezOdtworzeniaIPorownania(poF5, 'odtworzony pacjent po F5 i kolejnym odświeżeniu GH');
  expect(await poF5.evaluate(() => sessionStorage.getItem('vildaLoadChoiceV1'))).toBe('restore');
});

test('kontrola: „Nowy pomiar” zachowuje porównanie z rzeczywistą poprzednią wizytą również po edycji i przełączeniu', async ({ page }) => {
  test.setTimeout(120_000);
  const start = await otworzPowloke(page);
  await wpisz(start, POMIAR);
  await edytujHistorie(start);
  await zapiszIWczytaj(start, 'new');
  await expect(start.locator('#prevSummaryWrap')).toBeVisible();
  await expect(start.locator('#prevSummaryCard')).toContainText('148,5');
  await expect(start.locator('#restoreStateBtn')).toBeHidden();
  await wpisz(start, { age: '14', ageMonths: '6', height: '151', weight: '52' });

  const docpro = await przejdz(page, 'docpro');
  await expect(docpro.locator('#height')).toHaveValue('151');
  await edytujHistorie(docpro);
  await cyklTerapii(docpro);
  await expect.poll(() => stanElementow(docpro)).toEqual({ odtworz: false, porownanie: true });
  await expect(docpro.locator('#prevSummaryCard')).toContainText('148,5');
  await przejdz(page, 'start');
  await expect(start.locator('#prevSummaryWrap')).toBeVisible();
  await expect(start.locator('#prevSummaryCard')).toContainText('148,5');
});
