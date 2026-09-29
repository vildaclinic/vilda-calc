import { expect, test } from '@playwright/test';

// P-PAL-ZAPIS (zgłoszenie i decyzja właściciela 2026-09-29) — PRAWDZIWA strona index.html, dane FIKCYJNE.
// Chłopiec 13 l. 2 mies., 76 kg, 168 cm (nadwaga, OLAF) wczytany z zapisu sprzed P-DIETA-STAB rata 3 miał w stabilizacji
// PAL 1,6 (≤ 2850 kcal) zamiast domyślnego 1,4 (≤ 2500 kcal): zapis trzymał wartość selecta, a wczytanie każdą wartość
// uznawało za wybór lekarza. Po poprawce zapis niesie plan.palWybrany; w zapisach bez znacznika 1,4 i 1,6 = domyślne.
test.use({ serviceWorkers: 'block' });

const CHLOPIEC = { age: 13, ageMonths: 2, sex: 'M', weight: 76, height: 168 };

async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.buildDietEnergyRecommendationResult === 'function'
    && !!window.VildaDataImportExport && typeof window.VildaDataImportExport.applyLoadedData === 'function');
  await page.waitForTimeout(800);
  await page.evaluate(() => document.documentElement.classList.remove('vilda-auth-locked'));
  // pierwszy wpis jak lekarz — select PAL ma już opcje, zanim wczytamy zapis
  await page.selectOption('#sex', 'M').catch(() => {});
  for (const [id, v] of [['age', '13'], ['ageMonths', '2'], ['weight', '76'], ['height', '168']]) await page.locator(`#${id}`).fill(v);
  await page.waitForTimeout(1200);
}

async function stan(page) {
  return page.evaluate(() => {
    window.update();
    const br = window.buildDietEnergyRecommendationResult();
    return {
      pal: document.getElementById('palFactor').value,
      wybrany: window.__vildaPlanPalTouched === true,
      palUzyty: br.dane.energia.palUzyty,
      palDomyslny: br.dane.energia.palDomyslny,
      podaz: br.dane.energia.podazZaokrKcal,
      strategia: br.dane.strategia,
    };
  });
}

async function wczytaj(page, plan, opcje) {
  await page.evaluate(({ plan: p, opcje: o, user }) => {
    window.VildaDataImportExport.applyLoadedData({ version: 1, name: 'Testowy Fikcyjny', user, plan: p }, o || {});
    const set = (id, v) => { const el = document.getElementById(id); if (el && !el.value) el.value = String(v); };
    set('age', user.age); set('weight', user.weight); set('height', user.height);
  }, { plan, opcje, user: CHLOPIEC });
}

test.describe('P-PAL-ZAPIS — zapisany PAL: wybór lekarza czy wartość domyślna', () => {
  test('PZ-1: świeży wpis — PAL domyślny 1,4 i zapis z palWybrany: false', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    expect(await stan(page)).toEqual({ pal: '1.4', wybrany: false, palUzyty: 1.4, palDomyslny: true, podaz: 2500, strategia: 'stabilization' });
    const zapis = await page.evaluate(() => window.VildaDataImportExport.collectUserData().plan);
    expect(zapis).toMatchObject({ palFactor: 1.4, palWybrany: false });
  });

  test('PZ-2 (przypadek zgłoszenia): zapis sprzed poprawki z PAL 1,6 bez znacznika → domyślny 1,4, ≤ 2500 kcal (było 1,6, ≤ 2850)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wczytaj(page, { palFactor: 1.6, dietLevel: null });
    expect(await stan(page)).toEqual({ pal: '1.4', wybrany: false, palUzyty: 1.4, palDomyslny: true, podaz: 2500, strategia: 'stabilization' });
  });

  test('PZ-3: zapis sprzed poprawki z PAL 1,8 (nigdy domyślny) → wybór lekarza zostaje', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wczytaj(page, { palFactor: 1.8, dietLevel: null });
    const s = await stan(page);
    expect(s).toMatchObject({ pal: '1.8', wybrany: true, palUzyty: 1.8, palDomyslny: false });
  });

  test('PZ-4: lekarz wybiera 1,6 → zapis palWybrany: true → po wczytaniu 1,6 zostaje (także przy wczytaniu sesji)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    // select PAL jest w zwiniętej karcie — wybór jak z niej: zmiana wartości i zdarzenie change (onchange → debouncedUpdate)
    await page.evaluate(() => { const el = document.getElementById('palFactor'); el.value = '1.6'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(800);
    const s = await stan(page);
    expect(s).toMatchObject({ pal: '1.6', wybrany: true, palUzyty: 1.6, palDomyslny: false });
    const plan = await page.evaluate(() => window.VildaDataImportExport.collectUserData().plan);
    expect(plan).toMatchObject({ palFactor: 1.6, palWybrany: true });
    // nowy stan strony: wyczyszczenie flag jak przy „Wyczyść wszystkie pola”, potem wczytanie zapisu
    await page.evaluate(() => { window.__vildaPlanPalTouched = false; window.__vildaPlanPalDefault = null; document.getElementById('palFactor').value = '1.4'; window.update(); });
    await wczytaj(page, plan);
    expect(await stan(page)).toMatchObject({ pal: '1.6', wybrany: true, palUzyty: 1.6, palDomyslny: false });
    await wczytaj(page, plan, { isSessionRestore: true });
    expect(await stan(page)).toMatchObject({ pal: '1.6', wybrany: true, palUzyty: 1.6 });
  });

  test('PZ-5: zapis z palWybrany: false (np. odtworzenie sesji) — PAL dalej idzie za regułą, gdy zmienia się masa', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wczytaj(page, { palFactor: 1.4, palWybrany: false, dietLevel: null }, { isSessionRestore: true });
    expect(await stan(page)).toMatchObject({ pal: '1.4', wybrany: false, palDomyslny: true });
    // ta sama osoba z masą w normie (52 kg, BMI 18,4) — domyślny PAL wraca do 1,6 normy dla 10–18 lat; dotąd po
    // wczytaniu PAL był „wybrany” i zostawał na 1,4
    await page.locator('#weight').fill('52');
    await page.waitForTimeout(1000);
    const s = await stan(page);
    expect(s).toMatchObject({ pal: '1.6', wybrany: false });
  });
});
