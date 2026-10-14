import { expect, test } from '../support/test-czas.mjs';

// P-DIETA-WYCZYSC — wybór diety poprzedniego pacjenta nie przechodzi do następnego
// (2026-10-14, polecenie właściciela: punkt 5 listy po P-COLE-RESET).
//
// „Wyczyść wszystkie pola” i blokada sejfu (clearAllData) zerowały znaczniki diety, ale nie sam select #dietLevel.
// U następnego pacjenta bez planu redukcji (BMI w normie) select trzymał dietę poprzedniego, a collectUserData
// zapisywał ją w plan.dietLevel: w rekordzie, sesji karty i sejfie. Do tego DocPro i kalkulator klirensu (bez
// #palFactor i bez #dietLevel) nie zerowały znacznika „dieta wybrana przez lekarza”, a „Wyczyść” klirensu nie woła
// clearAllData wcale. W powłoce znacznik pacjenta A wracał przez sesję karty do Start po odświeżeniu i dieta
// domyślna nowej pacjentki stawała się „wyborem lekarza”: przy zmianie masy zalecenia zostawały przy diecie
// lekkiej (≤ 1700 kcal) zamiast iść za zaleceniem (umiarkowana ≤ 1550 kcal).
//
// Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#DietaWyczysc!26';

async function otworz(page, strona = 'index.html') {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto(`/${strona}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.collectUserData === 'function'
    && typeof window.clearAllData === 'function' && Boolean(window.VildaDataImportExport));
  if (strona === 'index.html') {
    await page.waitForFunction(() => typeof window.update === 'function' && Boolean(window.VildaBmi)
      && typeof window.updatePlanFromDiet === 'function');
  }
  await page.waitForTimeout(800);
  await page.evaluate(() => document.documentElement.classList.remove('vilda-auth-locked'));
}

async function wpisz(ctx, { sex, age, months = 0, weight, height }) {
  await ctx.locator('#sex').selectOption(sex, { timeout: 5000 }).catch(() => {});
  for (const [id, v] of [['age', age], ['ageMonths', months], ['height', height], ['weight', weight]]) {
    await ctx.locator(`#${id}`).fill(String(v));
  }
  await ctx.waitForTimeout(1500);
  await ctx.evaluate(() => window.update());
}

const plan = (ctx) => ctx.evaluate(() => {
  const p = window.collectUserData().plan;
  return { dietLevel: p.dietLevel, dietaWybrana: p.dietaWybrana };
});

// Wybór diety przez lekarza: zmiana selecta jak z karty planu (onchange → updatePlanFromDiet).
const wybierzDiete = (ctx, key) => ctx.evaluate((k) => {
  const el = document.getElementById('dietLevel');
  el.value = k;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, key);

// Wczytanie zapisu jak PLAN-PAL-RESTORE-KEPT (diet-plan-logic): minimalny payload nie wypełnia pól, więc test je dopełnia.
async function wczytaj(page, user, p) {
  await page.evaluate(({ u, p }) => {
    window.VildaDataImportExport.applyLoadedData({ version: 1, name: 'Fikcyjna ProbnaWczytana', user: u, plan: p });
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el && !el.value) { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    set('sex', u.sex); set('age', u.age); set('ageMonths', u.ageMonths); set('weight', u.weight); set('height', u.height);
  }, { u: user, p });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.update());
}

// Dziewczynka 12 l. 0 mies., 150 cm. 62 kg: otyłość, plan redukcji, zalecana dieta umiarkowana.
// 40 kg: BMI w normie, bez planu redukcji.
const OTYLA = { sex: 'F', age: 12, weight: 62, height: 150 };
const NORMA = { sex: 'F', age: 12, weight: 40, height: 150 };
const ZAPIS_WYBOR = { palFactor: 1.4, palWybrany: false, dietLevel: 'intense', dietaWybrana: true };

test.describe('P-DIETA-WYCZYSC — „Wyczyść” zeruje wybór diety', () => {
  test('W1: dziecko z dietą intensywną wybraną przez lekarza → „Wyczyść” → dziecko z BMI w normie: plan.dietLevel null', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, OTYLA);
    await wybierzDiete(page, 'intense');
    await page.waitForTimeout(600);
    expect(await plan(page), 'warunek scenariusza').toEqual({ dietLevel: 'intense', dietaWybrana: true });
    await page.evaluate(() => window.clearAllData());
    await page.waitForTimeout(800);
    await wpisz(page, NORMA);
    // Dotąd (audyt 2df41a8): { dietLevel: 'intense', dietaWybrana: false }.
    expect(await plan(page)).toEqual({ dietLevel: null, dietaWybrana: false });
  });

  test('W2: dorosła z otyłością (dieta domyślna) → „Wyczyść” → dorosła z BMI w normie: plan.dietLevel null', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'F', age: 35, weight: 90, height: 165 });
    expect((await plan(page)).dietLevel, 'warunek scenariusza').toBe('moderate');
    await page.evaluate(() => window.clearAllData());
    await page.waitForTimeout(800);
    await wpisz(page, { sex: 'F', age: 35, weight: 60, height: 165 });
    // Dotąd: 'moderate'.
    expect(await plan(page)).toEqual({ dietLevel: null, dietaWybrana: false });
  });

  test('W3 (straż): po „Wyczyść” następny pacjent z otyłością dostaje własną dietę domyślną', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, OTYLA);
    await wybierzDiete(page, 'intense');
    await page.waitForTimeout(600);
    await page.evaluate(() => window.clearAllData());
    await page.waitForTimeout(800);
    await wpisz(page, { sex: 'F', age: 12, weight: 60, height: 150 });
    expect(await plan(page)).toEqual({ dietLevel: 'moderate', dietaWybrana: false });
  });

  test('W4 (straż straty): wybór lekarza wraca przy wczytaniu zapisu tuż po „Wyczyść”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, OTYLA);
    await page.evaluate(() => window.clearAllData());
    await page.waitForTimeout(800);
    await wczytaj(page, { age: 12, ageMonths: 0, sex: 'F', weight: 62, height: 150 }, ZAPIS_WYBOR);
    // Usunięcie opcji selecta w clearAllData dawałoby tu 'moderate' (zmierzone) — dlatego zostają.
    expect(await plan(page)).toEqual({ dietLevel: 'intense', dietaWybrana: true });
  });

  test('W5: DocPro — znacznik „dieta wybrana” poprzedniego pacjenta znika po clearAllData', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page, 'docpro.html');
    await page.evaluate((p) => window.VildaDataImportExport.applyLoadedData({
      version: 1, name: 'Fikcyjna ProbnaWybor', user: { age: 12, ageMonths: 0, sex: 'F', weight: 62, height: 150 }, plan: p,
    }), ZAPIS_WYBOR);
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.clearAllData());
    await page.waitForTimeout(800);
    // Dotąd: true (Bt zerował znaczniki diety tylko przy #palFactor).
    expect((await plan(page)).dietaWybrana).toBe(false);
  });

  test('W6: kalkulator klirensu — wczytany zapis nie niesie znacznika „dieta wybrana” przez „Wyczyść” (#clearBtn)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page, 'kalkulator-klirens.html');
    await page.evaluate((p) => window.applyLoadedData({
      version: 1, name: 'Fikcyjna ProbnaWybor', user: { age: 12, ageMonths: 0, sex: 'F', weight: 62, height: 150 }, plan: p,
    }), ZAPIS_WYBOR);
    await page.waitForTimeout(1500);
    await page.evaluate(() => document.getElementById('clearBtn').click());
    await page.waitForTimeout(2500);
    // Dotąd: true — „Wyczyść” klirensu nie woła clearAllData, a strona bez #dietLevel przyjmowała znacznik z zapisu.
    expect((await plan(page)).dietaWybrana).toBe(false);
  });
});

async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaVault && f.contentDocument.readyState === 'complete');
  }, tytul, { timeout: 60000 });
  return (await page.$(`iframe.app-pane[title="${tytul}"]`)).contentFrame();
}

const gotowa = (fr) => fr.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked()
  && typeof window.applyLoadedData === 'function'
  && !document.documentElement.classList.contains('vilda-auth-locked'), null, { timeout: 60000 });

async function idz(page, trasa, tytul) {
  await page.evaluate((t) => window.VildaShell.navigate(t), trasa);
  const fr = await ramka(page, tytul);
  await gotowa(fr);
  await page.waitForTimeout(2500);
  return fr;
}

test.describe('P-DIETA-WYCZYSC — powłoka app.html', () => {
  test('A z wyborem lekarza → DocPro → klirens → Start „Wyczyść” → nowa pacjentka → F5: dieta idzie za zaleceniem, nie za znacznikiem A', async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem(
          'vilda-terms-accepted-v1',
          JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
        );
      } catch (_) { /* brak storage — pomiń */ }
    });
    page.on('dialog', (d) => { d.accept().catch(() => {}); });
    await page.goto('/app.html', { waitUntil: 'load' });
    let start = await ramka(page, 'Start');
    await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
    await page.reload({ waitUntil: 'load' });
    start = await ramka(page, 'Start');
    await gotowa(start);
    await page.waitForTimeout(2000);

    // A: dziewczynka z otyłością, zapisana z dietą intensywną wybraną przez lekarza; „Odtwórz zapis” w Start,
    // tak jak lista pacjentów (applyLoadedData + 'vilda:patient-loaded'). Ramki DocPro i klirensu biorą
    // potem rekord bieżącego pacjenta z sejfu.
    const idA = await start.evaluate(async (p) => {
      const w = await window.VildaVault.savePatient({
        name: 'ProbnaOtylaPowloka Fikcyjna',
        user: { lastName: 'ProbnaOtylaPowloka', firstName: 'Fikcyjna', sex: 'F', age: 12, ageMonths: 0, height: 150, weight: 62 },
        plan: p,
      }, { dedup: false });
      return w.patientId;
    }, ZAPIS_WYBOR);
    await start.evaluate(async (pid) => {
      const p = await window.VildaVault.getPatient(pid);
      const snap = p.snapshots[0];
      window.applyLoadedData(snap.payload);
      document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
        detail: { patientId: pid, savedAtISO: snap.savedAtISO || null, snapshotCount: p.snapshotCount || 1, source: 'pick' },
      }));
    }, idA);
    await expect(start.locator('#vildaLcmRestore')).toBeVisible({ timeout: 15000 });
    await start.locator('#vildaLcmRestore').click();
    await page.waitForTimeout(5000);
    // Pierwsze odtworzenie w świeżej karcie nie przywraca diety (osobny błąd), więc lekarz wybiera ją ponownie.
    await wybierzDiete(start, 'intense');
    await page.waitForTimeout(1500);
    expect(await plan(start), 'warunek scenariusza: wybór lekarza u A').toEqual({ dietLevel: 'intense', dietaWybrana: true });

    // Ramki DocPro i klirensu przejmują A z sesji karty.
    await idz(page, 'docpro', 'DocPro');
    await idz(page, 'klirens', 'Kalkulator klirensu');
    start = await idz(page, 'start', 'Start');

    // „Wyczyść” w Start (echo w ramkach), potem nowa pacjentka z nadwagą.
    await start.locator('#clearAllDataBtn').click();
    await page.waitForTimeout(1000);
    const odrzuc = start.getByRole('button', { name: /^Odrzuć (zmiany|dane) i wyczyść/ });
    if (await odrzuc.count()) await odrzuc.first().click();
    await page.waitForTimeout(3500);
    await start.locator('#lastName').fill('ProbnaNowaPowloka');
    await start.locator('#firstName').fill('Fikcyjna');
    await wpisz(start, { sex: 'F', age: 12, weight: 56, height: 150 });
    await idz(page, 'docpro', 'DocPro');
    start = await idz(page, 'start', 'Start');

    // Zapis nowej pacjentki przyciskiem powłoki, jak lekarz.
    const przed = await start.evaluate(async () => (await window.VildaVault.listPatients()).length);
    const zapiszPowloka = page.locator('aside.sidebar #saveDataBtnSidebar');
    if (await zapiszPowloka.isVisible().catch(() => false)) await zapiszPowloka.click();
    else await start.evaluate(() => window.saveUserData());
    await expect.poll(() => start.evaluate(async () => (await window.VildaVault.listPatients()).length),
      { message: 'nowa pacjentka zapisana w sejfie' }).toBe(przed + 1);
    await page.waitForTimeout(2000);

    // Odświeżenie powłoki: ramki zapisują sesję karty przy pagehide.
    await page.reload({ waitUntil: 'load' });
    start = await ramka(page, 'Start');
    await gotowa(start);
    await page.waitForTimeout(4000);
    await expect(start.locator('#lastName')).toHaveValue('ProbnaNowaPowloka');
    // Dotąd: true — znacznik A wracał z sesji zapisanej przez klirens.
    expect.soft(await start.evaluate(() => window.__vildaDietLevelTouched === true), 'znacznik wyboru lekarza po F5').toBe(false);

    // Zmiana masy na otyłość: dieta idzie za zaleceniem (umiarkowana), jak w świeżej karcie.
    await start.locator('#weight').fill('60');
    await start.locator('#weight').dispatchEvent('change');
    await page.waitForTimeout(2000);
    await start.evaluate(() => window.update());
    await page.waitForTimeout(1000);
    // Dotąd: { dietLevel: 'light', dietaWybrana: true } — dieta lekka nadwagi utrwalona jako wybór lekarza.
    expect(await plan(start)).toEqual({ dietLevel: 'moderate', dietaWybrana: false });
  });
});
