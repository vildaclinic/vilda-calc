import { expect, test } from '../support/test-czas.mjs';

// P-GH-DOCPRO (2026-09-30). Karta „Zaawansowane obliczenia wzrostowe” na DocPro jest ukryta, ale żyje:
// dostaje wiersze ręczne ze wspólnego stanu pacjenta i wiersze punktów terapii z monitora GH.
//
// ZMIERZONE przed zmianą (audyt przepływu GH, U3):
// - Stan kart DocPro (docpro_state_persist.js) zapisywał pola bez id po POZYCJI w DOM i przy powrocie
//   na DocPro odtwarzał je z wysłaniem change. Po usunięciu wiersza ręcznego na Start wiersz punktu GH
//   dostawał wartości usuniętego wiersza, a zapis zwrotny monitora zmieniał sam PUNKT (wzrost, masa i dawka
//   w mg/d). Po dodaniu wiersza ręcznego nowy wiersz dostawał wartości punktu i prawdziwy pomiar znikał.
// - Zapis zwrotny wiersz → punkt przeliczał dawkę w mg/d przy zmianie masy.
// - Po usunięciu OSTATNIEGO punktu jego wiersz zostawał w ukrytej karcie do przeładowania.
// - Monitor kopiował listę punktów do IndexedDB ghTherapyDB, której po P-GH-ZRODLO nikt nie czyta.
//
// Test woła prawdziwe moduły strony. Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhDocpro!2026a';
// Dziewczynka 14 lat, 148,5 cm. Punkt terapii 13 l. 1 mies. / 139,9 cm / 45 kg, dawka 0,033 mg/kg/d = 1,49 mg/d.
const PUNKT = {
  id: 'gh-e2e-docpro', type: 'continue', ageYears: 13, ageMonths: 1, height: 139.9, weight: 45,
  dose: 0.033, doseUnit: 'mg/kg/d', doseAbs: 1.49, drug: 'Omnitrope 5 mg', program: 'SNP',
};
const W11 = ['11', '123.9', '35'];
const W12 = ['12', '131.3', '40.3'];
// Odtworzenie stanu DocPro biegnie w przebiegach do 1,5 s po starcie strony (+350 ms na zapis).
const PO_ODTWORZENIU_MS = 2500;

const wiersze = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#advMeasurements .measure-row'))
  .map((r) => ({
    y: r.querySelector('.adv-age-years')?.value, h: r.querySelector('.adv-height')?.value,
    w: r.querySelector('.adv-weight')?.value, gh: r.getAttribute('data-gh-id') || '',
  }))
  .filter((r) => r.h !== ''));
const punkty = (page) => page.evaluate(() => window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', []));
const bazyIdb = (page) => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));

async function otworz(page) {
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
  await naStartGotowy(page);
}

async function naStartGotowy(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaProAccess));
  // Na Start karta wymaga trybu profesjonalnego także po powrocie z DocPro.
  // Samo disabled=false otwierało ją tylko do następnego update. Jak w testach
  // GH poprawionych w #530: dostęp fikcyjny, bez zależności od zewnętrznego triala.
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

async function naDocPro(page) {
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function', null, { timeout: 60000 });
  await page.waitForTimeout(PO_ODTWORZENIU_MS);
}

async function naStart(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await naStartGotowy(page);
  await page.waitForFunction((id) => Boolean(document.querySelector(`#advMeasurements .measure-row[data-gh-id="${id}"]`)), PUNKT.id);
}

async function dodajWierszRecznyNaStart(page, [lata, cm, kg]) {
  await page.evaluate(([y, h, w]) => {
    const rows = () => document.querySelectorAll('#advMeasurements .measure-row');
    let r = Array.from(rows()).find((x) => !x.getAttribute('data-gh-id') && !x.querySelector('.adv-height').value);
    if (!r) { window.addAdvMeasurementRow(); r = rows()[rows().length - 1]; }
    const set = (sel, v) => {
      const e = r.querySelector(sel);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('.adv-age-years', y); set('.adv-age-months', '0'); set('.adv-height', h); set('.adv-weight', w);
    window.calculateGrowthAdvanced();
  }, [lata, cm, kg]);
}

async function pacjentkaZPunktem(page, reczne) {
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
  for (const w of reczne) await dodajWierszRecznyNaStart(page, w);
  // Punkt terapii wchodzi tak, jak wprowadza go monitor leczenia GH.
  await page.evaluate((p) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', [p], { force: true });
    window.ghTherapyPoints = [p];
  }, PUNKT);
  await page.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
  await page.waitForFunction((id) => Boolean(document.querySelector(`#advMeasurements .measure-row[data-gh-id="${id}"]`)), PUNKT.id);
}

function punktBezZmian(lista) {
  expect(lista).toHaveLength(1);
  const [p] = lista;
  expect(p.id).toBe(PUNKT.id);
  expect({ h: p.height, w: p.weight, dose: p.dose, doseAbs: p.doseAbs, y: p.ageYears, m: p.ageMonths })
    .toEqual({ h: 139.9, w: 45, dose: 0.033, doseAbs: 1.49, y: 13, m: 1 });
}

test('A: usunięcie wiersza ręcznego na Start między wizytami w DocPro nie zmienia punktu GH ani jego wiersza', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await pacjentkaZPunktem(page, [W11, W12]);
  await naDocPro(page);
  expect(await wiersze(page)).toEqual([
    { y: '11', h: '123.9', w: '35', gh: '' },
    { y: '12', h: '131.3', w: '40.3', gh: '' },
    { y: '13', h: '139.9', w: '45', gh: PUNKT.id },
  ]);

  await naStart(page);
  await page.evaluate(() => {
    const r = Array.from(document.querySelectorAll('#advMeasurements .measure-row'))
      .find((x) => x.querySelector('.adv-age-years').value === '12' && !x.getAttribute('data-gh-id'));
    r.querySelector('.remove-measure').click();
  });
  await expect.poll(() => wiersze(page)).toEqual([
    { y: '11', h: '123.9', w: '35', gh: '' },
    { y: '13', h: '139.9', w: '45', gh: PUNKT.id },
  ]);

  await naDocPro(page);
  expect(await wiersze(page)).toEqual([
    { y: '11', h: '123.9', w: '35', gh: '' },
    { y: '13', h: '139.9', w: '45', gh: PUNKT.id },
  ]);
  punktBezZmian(await punkty(page));
});

test('B: wiersz ręczny dodany na Start zachowuje swoje wartości po wizycie w DocPro', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await pacjentkaZPunktem(page, [W11]);
  await naDocPro(page);
  expect(await wiersze(page)).toEqual([
    { y: '11', h: '123.9', w: '35', gh: '' },
    { y: '13', h: '139.9', w: '45', gh: PUNKT.id },
  ]);

  await naStart(page);
  await dodajWierszRecznyNaStart(page, W12);
  await naDocPro(page);
  const naDocProPo = await wiersze(page);
  expect(naDocProPo).toContainEqual({ y: '12', h: '131.3', w: '40.3', gh: '' });
  expect(naDocProPo.filter((r) => r.h === '139.9')).toEqual([{ y: '13', h: '139.9', w: '45', gh: PUNKT.id }]);

  await naStart(page);
  await page.waitForTimeout(1500);
  const naStartPo = await wiersze(page);
  expect(naStartPo).toContainEqual({ y: '12', h: '131.3', w: '40.3', gh: '' });
  expect(naStartPo.filter((r) => r.h === '139.9')).toEqual([{ y: '13', h: '139.9', w: '45', gh: PUNKT.id }]);
  punktBezZmian(await punkty(page));
});

test('C: zmiana w wierszu punktu w ukrytej karcie zaawansowanej DocPro nie zmienia punktu ani dawki', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await pacjentkaZPunktem(page, [W11]);
  await naDocPro(page);
  await page.evaluate((id) => {
    const r = document.querySelector(`#advMeasurements .measure-row[data-gh-id="${id}"]`);
    const set = (sel, v) => {
      const e = r.querySelector(sel);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('.adv-weight', '47.1'); set('.adv-height', '141');
  }, PUNKT.id);
  await page.waitForTimeout(500);
  punktBezZmian(await punkty(page));
  punktBezZmian(await page.evaluate(() => window.ghTherapyPoints));
});

test('D: usunięcie ostatniego punktu w monitorze usuwa jego wiersz z ukrytej karty zaawansowanej DocPro', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await pacjentkaZPunktem(page, [W11]);
  await naDocPro(page);
  const wysokosci = () => page.evaluate(() => JSON.stringify(window.advancedGrowthData || null));
  expect(await wysokosci(page)).toContain('139.9');

  await page.evaluate((id) => document.querySelector(`.delete-gh-pt-btn[data-id="${id}"]`).click(), PUNKT.id);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#ghDeleteOverlay button')).find((x) => x.textContent === 'Usuń');
    b.click();
  });
  await expect.poll(() => punkty(page)).toEqual([]);
  await expect.poll(() => wiersze(page)).toEqual([{ y: '11', h: '123.9', w: '35', gh: '' }]);
  expect(await wysokosci(page)).not.toContain('139.9');
});

test('E: dawna kopia punktów w IndexedDB znika przy starcie monitora i nie wraca po zmianie punktów', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await pacjentkaZPunktem(page, [W11]);
  // Kopia pozostawiona przez poprzednią wersję monitora (ta sama nazwa bazy, magazynu i klucza).
  await page.evaluate((p) => new Promise((ok, zle) => {
    const r = indexedDB.open('ghTherapyDB', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('ghTherapyPoints', { keyPath: 'id' });
    r.onsuccess = () => {
      const tx = r.result.transaction('ghTherapyPoints', 'readwrite');
      tx.objectStore('ghTherapyPoints').put(p);
      tx.oncomplete = () => { r.result.close(); ok(); };
      tx.onerror = () => zle(tx.error);
    };
    r.onerror = () => zle(r.error);
  }), PUNKT);
  expect(await bazyIdb(page)).toContain('ghTherapyDB');

  await naDocPro(page);
  await expect.poll(() => bazyIdb(page)).not.toContain('ghTherapyDB');

  // Zmiana listy w monitorze (usunięcie punktu) nie tworzy kopii na nowo.
  await page.evaluate((id) => document.querySelector(`.delete-gh-pt-btn[data-id="${id}"]`).click(), PUNKT.id);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#ghDeleteOverlay button')).find((x) => x.textContent === 'Usuń');
    b.click();
  });
  await expect.poll(() => punkty(page)).toEqual([]);
  await page.waitForTimeout(500);
  expect(await bazyIdb(page)).not.toContain('ghTherapyDB');
});
