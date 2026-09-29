import { expect, test } from '@playwright/test';

// P-DIETA-AUDYT2 rata 1 (audyt zaleceń dietetycznych 2026-09-29, decyzja właściciela: „koduj ratę 1”) — PRAWDZIWA strona,
// dane FIKCYJNE. Każdy test odpowiada punktowi A1–A8 wpisu w docs/clinical/ALGORITHMS.md.
test.use({ serviceWorkers: 'block' });

async function otworz(page, strona = 'index.html') {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })); } catch (_) { /* brak storage */ }
  });
  await page.goto(`/${strona}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.buildDietEnergyRecommendationResult === 'function'
    && !!window.VildaRaportPlan && !!window.VildaBmi);
  await page.waitForTimeout(800);
  await page.evaluate(() => document.documentElement.classList.remove('vilda-auth-locked'));
}

async function wpisz(page, { sex, age, months = 0, weight, height }) {
  await page.selectOption('#sex', sex).catch(() => {});
  for (const [id, v] of [['age', age], ['ageMonths', months], ['height', height], ['weight', weight]]) await page.locator(`#${id}`).fill(String(v));
  await page.waitForTimeout(1500);
}

const stan = (page) => page.evaluate(() => {
  window.update();
  const norm = (t) => String(t || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
  const br = window.buildDietEnergyRecommendationResult();
  const d = (br && br.dane) || {};
  return { dieta: document.getElementById('dietLevel').value, dietaKlucz: d.energia && d.energia.dietaKlucz, podaz: d.energia && d.energia.podazZaokrKcal, strategia: d.strategia, tekst: norm(br && br.textOutput), dane: d };
});

// Wczytanie zapisu jak PLAN-PAL-RESTORE-KEPT (diet-plan-logic): minimalny payload nie wypełnia pól antropometrii, więc test je dopełnia.
async function wczytaj(page, user, plan) {
  await page.evaluate(({ u, p }) => {
    window.clearAllData();
    window.VildaDataImportExport.applyLoadedData({ version: 1, name: 'Testowy Fikcyjny', user: u, plan: p });
    const set = (id, v) => { const el = document.getElementById(id); if (el && !el.value) { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('sex', u.sex); set('age', u.age); set('ageMonths', u.ageMonths); set('weight', u.weight); set('height', u.height);
  }, { u: user, p: plan });
  await page.waitForTimeout(1500);
}

test.describe('A1 — dieta domyślna idzie za zaleceniem, dopóki lekarz jej nie wybierze', () => {
  test('A1-1: ten sam chłopiec 13 l., 160 cm: 62 kg (nadwaga) → 81 kg (otyłość) — zalecana umiarkowana ≤ 2100 (dotąd lekka ≤ 2250)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'M', age: 13, weight: 62, height: 160 });
    expect((await stan(page)).dieta).toBe('light');
    await page.locator('#weight').fill('81');
    await page.waitForTimeout(1500);
    const r = await stan(page);
    expect([r.dieta, r.dietaKlucz, r.podaz, r.strategia]).toEqual(['moderate', 'moderate', 2100, 'reduction']);
  });

  test('A1-2: „Wyczyść wszystkie pola” i nowy pacjent — dieta z zalecenia, nie z poprzedniego pacjenta', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'M', age: 13, weight: 62, height: 160 });
    await page.evaluate(() => window.clearAllData());
    await page.waitForTimeout(800);
    await wpisz(page, { sex: 'M', age: 13, weight: 81, height: 160 });
    const r = await stan(page);
    expect([r.dieta, r.podaz]).toEqual(['moderate', 2100]);
  });

  test('A1-3: wybór lekarza (lekka) zostaje po zmianie masy, trafia do zapisu i wraca po wczytaniu; zapis bez znacznika = domyślna', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'M', age: 13, weight: 81, height: 160 });
    await page.evaluate(() => { const el = document.getElementById('dietLevel'); el.value = 'light'; el.dispatchEvent(new Event('change', { bubbles: true })); if (typeof window.updatePlanFromDiet === 'function') window.updatePlanFromDiet(); });
    await page.waitForTimeout(600);
    await page.locator('#weight').fill('82');
    await page.waitForTimeout(1500);
    expect((await stan(page)).dieta).toBe('light');
    const plan = await page.evaluate(() => window.VildaDataImportExport.collectUserData().plan);
    expect(plan).toMatchObject({ dietLevel: 'light', dietaWybrana: true });
    const user = { age: 13, ageMonths: 0, sex: 'M', weight: 82, height: 160 };
    // zapis ze znacznikiem: wybór zostaje
    await wczytaj(page, user, plan);
    await page.waitForTimeout(1500);
    expect((await stan(page)).dieta).toBe('light');
    // zapis sprzed poprawki (bez znacznika): wartość domyślna, przeliczana
    await wczytaj(page, user, { palFactor: 1.4, dietLevel: 'light' });
    await page.waitForTimeout(1500);
    expect((await stan(page)).dieta).toBe('moderate');
  });
});

test.describe('A2 — czas do normy: miesiące wieku liczone raz, stabilizacja z przyrostem masy ze wzrastania', () => {
  test('A2-1: chłopiec 13 l. 6 mies., 76 kg, 168 cm, redukcja (dieta lekka) — zalecenia i „Droga do normy” podają ten sam czas', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await page.evaluate(() => { const jf = document.getElementById('journeyFlag'); if (jf && !jf.checked) { jf.checked = true; jf.dispatchEvent(new Event('change', { bubbles: true })); } });
    await wpisz(page, { sex: 'M', age: 13, months: 6, weight: 76, height: 168 });
    await page.evaluate(() => { window.__vildaDietStrategyTouched = true; document.getElementById('reduceToggle').checked = true; document.getElementById('stabilizationToggle').checked = false; });
    const r = await stan(page);
    expect(r.strategia).toBe('reduction');
    // „Droga do normy”: dieta + ruch w nagłówku i „dzięki ruchowi o N miesięcy szybciej” — sama dieta = suma
    const droga = await page.evaluate(() => String((document.getElementById('bmiJourneyMount') || {}).textContent || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' '));
    const zRuchem = Number((droga.match(/(\d+(?:,\d)?) mies\./) || [])[1].replace(',', '.'));
    const szybciej = Number((droga.match(/o (\d+(?:,\d)?) miesi/) || [])[1].replace(',', '.'));
    const sym = await page.evaluate((w) => window.energySimulateMonthsToBmiTarget({ ageYears: 13.5, ageMonthsOpt: 0, sex: 'M', weightKg: 76, heightCm: 168, weeklyLossKg: w, target: 'norm' }).months, r.dane.energia.tempoKgTydz);
    expect(sym).toBe(18);
    expect(zRuchem + szybciej).toBe(sym);
    expect(r.dane.czasDoNormy.miesiaceLabel).toBe('18,0'); // dotąd 17,5 — miesiące wieku liczone dwa razy
  });

  test('A2-2: stabilizacja (chłopiec 8 l., 33 kg, 130 cm) — czas z przyrostem masy ze wzrastania, zdanie nie obiecuje normy przy „masie zbliżonej do obecnej”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await page.evaluate(() => { const jf = document.getElementById('journeyFlag'); if (jf && !jf.checked) { jf.checked = true; jf.dispatchEvent(new Event('change', { bubbles: true })); } });
    await wpisz(page, { sex: 'M', age: 8, weight: 33, height: 130 });
    const r = await stan(page);
    expect(r.strategia).toBe('stabilization');
    expect(r.tekst).not.toContain('pozostanie zbliżona do obecnej');
    expect(r.tekst).toMatch(/masa ciała dziecka będzie przybywać tylko w tempie wynikającym ze wzrastania \(ok\. \d+,\d+ kg\/mies\.\)/);
    const sym = await page.evaluate(() => window.energySimulateMonthsToBmiTarget({ ageYears: 8, ageMonthsOpt: 0, sex: 'M', weightKg: 33, heightCm: 130, weeklyLossKg: 0, target: 'norm' }));
    // powyżej roku etykieta w pełnych miesiącach (symulacja liczy co 0,5 mies.)
    expect(r.dane.czasDoNormy.miesiaceLabel).toBe(String(Math.ceil(sym.months * 4.345) > 52 ? Math.round(sym.months) : sym.months).replace('.', ','));
    expect(sym.przyrostMasyKg).toBeGreaterThan(0);
  });
});

test.describe('A3 — karta „Normy żywieniowe” liczy energię jak plan', () => {
  const karta = (page) => page.evaluate(() => {
    const nf = document.getElementById('nutritionNormsFlag'); if (nf && !nf.checked) { nf.checked = true; nf.dispatchEvent(new Event('change', { bubbles: true })); }
    window.update();
    const m = window.nutritionNormsBuildCardModel(window.nutritionNormsReadBasicsFromDom(), window.nutritionNormsGetUiState ? window.nutritionNormsGetUiState() : {});
    const t = String((document.getElementById('nutritionNormsMount') || {}).textContent || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ');
    return { energia: m && m.energy ? { main: m.energy.mainValue && Math.round(m.energy.mainValue), pal: m.energy.usedPal, etykieta: (m.ui && m.ui.palOptions || []).map((x) => x.label)[0] } : null, tekst: t, noty: m && Array.isArray(m.messages) ? m.messages.map((x) => x.text) : [] };
  });
  test('A3-1: chłopiec 13 l., 76 kg, 168 cm (nadwaga, PAL 1,4) — karta norm 2507 kcal jak plan (dotąd 2731 Henry × 1,4 × 1,01)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'M', age: 13, weight: 76, height: 168 });
    const k = await karta(page);
    const r = await stan(page);
    expect(r.dane.energia.utrzymanieKcal).toBe(2507);
    expect(k.energia.main).toBe(2507);
    expect(k.energia.pal).toBe(1.4);
    expect(k.noty.join(' ')).toContain('REE wg Molnára 1995 × PAL, bez dodatku na wzrastanie');
    expect(k.noty.join(' ')).not.toContain('oceny klinicznej');
  });
  test('A3-2: 13-latek z masą prawidłową — karta norm bez zmian (Henry × PAL × 1,01)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'M', age: 13, weight: 52, height: 168 });
    const k = await karta(page);
    const henry = (15.6 * 52 + 266 * 1.68 + 299) * 1.6 * 1.01;
    expect(k.energia.pal).toBe(1.6);
    expect(Math.abs(k.energia.main - henry)).toBeLessThan(2);
  });
  test('A3-3: dorosły 40 l., 80 kg, 180 cm, PAL 1,2 w planie — karta norm PAL 1,2 (dotąd po cichu 1,6 „Jak w planie”)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'M', age: 40, weight: 80, height: 180 });
    await page.evaluate(() => { const el = document.getElementById('palFactor'); el.value = '1.2'; el.dispatchEvent(new Event('change', { bubbles: true })); window.update(); });
    await page.waitForTimeout(800);
    const k = await karta(page);
    expect(k.energia.pal).toBe(1.2);
    expect(k.energia.etykieta).toBe('Jak w planie (PAL 1,2)');
    expect(k.noty.join(' ')).toContain('poza Normami 2024 dla dorosłych');
  });
});

test.describe('A4 — pacjent 18,0–18,99 lat', () => {
  test('A4-1: chłopiec 18 l. 3 mies., 95 kg, 180 cm — kategoria progami dorosłymi, masa docelowa z BMI 24,9 (jak silnik)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'M', age: 18, months: 3, weight: 95, height: 180 });
    const r = await stan(page);
    expect(r.tekst).toContain('BMI 29,3 kg/m² – nadwaga (BMI 25–29,9 kg/m²); od 18. roku życia BMI ocenia się progami dla dorosłych.');
    expect(r.tekst).not.toMatch(/centyl(a)? .* – nadwaga \(85\./);
    const cel = await page.evaluate(() => window.energyBuildPlanReductionState({ ageYears: 18.25, ageMonthsOpt: 3, sex: 'M', weightKg: 95, heightCm: 180, palInput: null }).targetWeightKg);
    expect(cel).toBeCloseTo(24.9 * 1.8 * 1.8, 1);
    expect(r.dane.masa && r.dane.masa.docelowaKg).toBeCloseTo(cel, 1);
  });
  test('A4-2: ten sam pacjent, lekarz wybiera stabilizację — „Droga do normy” pokazuje utrzymanie (jak zalecenia), nie dietę redukcyjną', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await page.evaluate(() => { const jf = document.getElementById('journeyFlag'); if (jf && !jf.checked) { jf.checked = true; jf.dispatchEvent(new Event('change', { bubbles: true })); } });
    await wpisz(page, { sex: 'M', age: 18, months: 3, weight: 95, height: 180 });
    await page.evaluate(() => { window.__vildaDietStrategyTouched = true; document.getElementById('reduceToggle').checked = false; document.getElementById('stabilizationToggle').checked = true; window.update(); });
    await page.waitForTimeout(1000);
    const r = await stan(page);
    expect(r.strategia).toBe('stabilization');
    const droga = await page.evaluate(() => String((document.getElementById('bmiJourneyMount') || {}).textContent || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' '));
    expect(droga).toContain(`≤ ${String(r.podaz).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} kcal`);
    expect(droga).not.toMatch(/dieta (lekka|umiarkowana|intensywna) \(nie cel/);
  });
});

// Tytuł i treść planu PDF przez prawdziwy generator (jak raport-plan-stabilizacja-rata-g2): biblioteki PDF zastąpione atrapą.
const pdf = (page) => page.evaluate(async () => {
  window.vildaEnsurePdfLibraries = async () => true;
  window.jspdf = window.jspdf || { jsPDF: function JsPdfStub() {} };
  window.html2canvas = window.html2canvas || (async () => { const c = document.createElement('canvas'); c.width = 1240; c.height = 1754; return c; });
  const captured = { html: '' };
  const observer = new MutationObserver(() => { document.querySelectorAll('.diet-pdf-root').forEach((root) => { if (root.innerHTML.length > captured.html.length) captured.html = root.innerHTML; }); });
  observer.observe(document.body, { childList: true, subtree: true });
  const r = await window.dietRecommendationsCollectPdfPages({});
  observer.disconnect();
  const tmp = document.createElement('div'); tmp.innerHTML = captured.html.replace(/<style[\s\S]*?<\/style>/g, '');
  return { tytul: r.title, sekcje: Array.from(tmp.querySelectorAll('.vrp-nag-blok span')).map((x) => x.textContent) };
});

test.describe('A5/A8 — dorosły bez miejsca na deficyt; tytuł PDF przy przyroście', () => {
  test('A5-1: kobieta 70 l., 145 cm, 64 kg (BMI 30,4), PAL 1,2 — zdanie o minimum 1200 kcal zamiast „deficyt 500–750 kcal”; PDF bez „redukcji”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'F', age: 70, weight: 64, height: 145 });
    await page.evaluate(() => { const el = document.getElementById('palFactor'); el.value = '1.2'; el.dispatchEvent(new Event('change', { bubbles: true })); window.update(); });
    await page.waitForTimeout(800);
    const r = await stan(page);
    expect(r.dane.energia.dietaKlucz).toBeFalsy();
    expect(r.tekst).not.toContain('500–750');
    expect(r.tekst).toContain('nie ma miejsca na deficyt energetyczny bez zejścia poniżej minimalnej podaży 1200 kcal dziennie');
    const p = await pdf(page);
    expect(p.tytul).toBe('Twój plan żywieniowy');
    expect(p.sekcje).toContain('ZAPOTRZEBOWANIE ENERGETYCZNE (UTRZYMANIE MASY CIAŁA)');
    expect(p.sekcje.join(' ')).not.toContain('TEMPO REDUKCJI');
  });
  test('A8-1: kobieta 30 l., 50 kg, 168 cm (BMI 17,7, przyrost) — tytuł PDF „Twój plan przyrostu masy ciała”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'F', age: 30, weight: 50, height: 168 });
    const r = await stan(page);
    expect(r.strategia).toBe('przyrost');
    expect((await pdf(page)).tytul).toBe('Twój plan przyrostu masy ciała');
  });
});

test.describe('A6 — dziecko poniżej 2 lat i górna granica stabilizacji', () => {
  test('A6-1: chłopiec 1 r. 3 mies., 11,5 kg, 75 cm — bez zaleceń energetycznych i bez planu „2–5 lat” (komunikat „od 2. roku życia”)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'M', age: 1, months: 3, weight: 11.5, height: 75 });
    const r = await page.evaluate(() => {
      const br = window.buildDietEnergyRecommendationResult();
      const st = window.energyBuildPlanReductionState({ ageYears: 1.25, ageMonthsOpt: 3, sex: 'M', weightKg: 11.5, heightCm: 75, palInput: null });
      return { dane: br.dane, tekst: br.textOutput, plan: st.childObesityPlan, maint: st.maintenanceKcal, nadwaga: st.bmiClass && st.bmiClass.overweight };
    });
    expect(r.nadwaga).toBe(true);
    expect(r.dane).toBeNull();
    expect(r.tekst).toBe('Zalecenia energetyczne są dostępne od 2. roku życia; u młodszego dziecka energię i sposób żywienia ustala się indywidualnie.');
    expect(r.plan).toBe(false);
    expect(r.maint).toBeNull();
  });
  test('A6-2: górna granica stabilizacji nigdy wyższa od zapotrzebowania (2–5 lat, także gdy zapotrzebowanie < 1000 kcal)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const wyniki = await page.evaluate(() => {
      const out = [];
      for (const [sex, y, h, w] of [['F', 2, 80, 12.2], ['F', 2, 82, 13], ['M', 2, 84, 14], ['M', 3, 92, 17], ['F', 4, 100, 20], ['M', 5, 108, 24]]) {
        const st = window.energyBuildPlanReductionState({ ageYears: y, ageMonthsOpt: 0, sex, weightKg: w, heightCm: h, palInput: null });
        if (st.childObesityPlan) out.push({ sex, y, w, maint: st.maintenanceKcal, gorna: st.maintenanceGornaKcal, floor: st.floorKcal });
      }
      return out;
    });
    expect(wyniki.length).toBeGreaterThan(3);
    for (const x of wyniki) expect(x.gorna, JSON.stringify(x)).toBeLessThanOrEqual(x.maint);
    expect(wyniki.some((x) => x.maint < x.floor), 'jest przypadek z zapotrzebowaniem poniżej minimum').toBe(true);
  });
});

test.describe('A7 — bez sprzecznych zdań', () => {
  const karta = (page) => page.evaluate(() => String((document.getElementById('planResults') || {}).textContent || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' '));
  test('A7-1: dziewczynka 17 l. 1 mies., 72 kg, 165 cm (wzrastanie praktycznie zakończone) — bez „U rosnącego nastolatka… przy dalszym wzrastaniu”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'F', age: 17, months: 1, weight: 72, height: 165 });
    await page.evaluate(() => { window.__vildaDietStrategyTouched = true; document.getElementById('reduceToggle').checked = true; document.getElementById('stabilizationToggle').checked = false; });
    const r = await stan(page);
    expect(r.strategia).toBe('reduction');
    expect(r.tekst).toContain('Przy nadwadze u nastolatka ubytek masy powinien być stopniowy');
    expect(r.tekst).not.toContain('U rosnącego nastolatka często wystarcza');
    const k = await karta(page);
    expect(k).not.toContain('przy wzrastaniu BMI obniży się');
    expect(k).toContain('wzrastanie jest zakończone, więc samo utrzymanie masy ciała nie obniży BMI');
  });
  test('A7-2: dziewczynka 11 l. 6 mies., 55 kg, 150 cm, „Wzrost zakończony” — zdanie o limicie tempa bez „przy trwającym wzrastaniu”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await page.evaluate(() => { const g = document.getElementById('growthEndedFlag'); g.checked = true; g.dispatchEvent(new Event('change', { bubbles: true })); });
    await wpisz(page, { sex: 'F', age: 11, months: 6, weight: 55, height: 150 });
    const r = await stan(page);
    expect(r.tekst).not.toContain('przy trwającym wzrastaniu');
  });
  test('A7-3: karta planu — powód stabilizacji z reguły (13-latek z nadwagą) i tempo z diet silnika (8-latek < 99. c.); „nie większa niż zapotrzebowanie”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'M', age: 13, weight: 76, height: 168 });
    let k = await karta(page);
    expect(k).toContain('strategia domyślna przy nadwadze u nastolatka');
    expect(k).not.toContain('6–11 lat przy BMI poniżej 99. centyla (Barlow 2007)');
    expect(k).toContain('podaż energii nie większa niż zapotrzebowanie przy obecnej masie ciała');
    expect(k).not.toContain('równa zapotrzebowaniu');
    await page.evaluate(() => window.clearAllData());
    await page.waitForTimeout(600);
    await wpisz(page, { sex: 'M', age: 8, weight: 40, height: 131 });
    const r = await stan(page);
    expect(r.strategia).toBe('reduction');
    k = await karta(page);
    expect(k).not.toContain('nie szybciej niż 1–2 kg/mies.');
    expect(k).toContain('nie szybciej niż 0,5 kg/mies.');
  });
});

test.describe('A8 — pozostałe', () => {
  test('A8-2: cel własny nastolatki (17 l., 62 kg, 165 cm, cel 58 kg, wzrost zakończony) — górna granica dnia z silnika, tempo do 1 kg/mies.', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    // ustawienie jak w cel-wlasny-nastolatek.spec: pola, elementy zaleceń, potem flagi i przeliczenie
    const r = await page.evaluate(async () => {
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
      const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
      window.__vildaPlanPalTouched = false; window.__vildaDietStrategyTouched = false; window.__vildaDietGoalChoice = null;
      set('age', 17); set('ageMonths', 0); set('sex', 'F'); set('weight', 62); set('height', 165); set('customGoalKg', 58);
      window.ensureDietRecommendationsElements();
      flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', true);
      window.update();
      await new Promise((res) => { setTimeout(res, 300); });
      const g = window.VildaDietRecommendations.generateRecommendations();
      const st = window.energyBuildPlanReductionState({ ageYears: 17, ageMonthsOpt: 0, sex: 'F', weightKg: 62, heightCm: 165, palInput: null, customGoalKg: 58, growthEnded: true });
      return { tekst: String(g.textOutput || '').replace(/[\u00A0\u202F]/g, ' '), energia: g.dane && g.dane.energia, strategia: g.dane && g.dane.strategia, cg: st.customGoal, d0: st.diets[0], floor: st.floorKcal };
    });
    expect(r.cg.teen).toBe(true);
    expect(r.cg.active).toBe(true);
    expect(r.strategia).toBe('cel-wlasny');
    expect(r.d0.gornaGranica).toBe(true);
    expect(r.d0.gornaKcal).toBeGreaterThanOrEqual(r.floor);
    expect(r.d0.gornaKcal).toBeLessThanOrEqual(r.d0.intake);
    expect(r.energia.gornaGranica).toBe(true);
    expect(r.energia.podazZaokrKcal).toBe(r.d0.gornaKcal);
    expect(r.tekst).toContain('nie powinno być większe niż 1 kg miesięcznie');
    expect(r.tekst).toContain(`podaż energii nie większa niż ${r.d0.gornaKcal} kcal dziennie — to górna granica dnia`);
  });
  test('A8-3: flaga „Wit. D” u 8-latka z masą prawidłową — zdanie o suplementacji (dotąd brak)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await page.evaluate(() => { const v = document.getElementById('vitDSuppFlag'); v.checked = true; v.dispatchEvent(new Event('change', { bubbles: true })); });
    await wpisz(page, { sex: 'M', age: 8, weight: 26, height: 130 });
    const r = await stan(page);
    expect(r.tekst).toMatch(/Wskazana jest u dziecka suplementacja witaminy D: w wieku [^.]* IU dziennie/);
    expect(r.tekst).not.toContain('Ze względu na');
  });
  test('A8-4: dane zaleceń — REE i TEE po korekcie planu (13-latek 76 kg: REE Molnára 1791, TEE 2507)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'M', age: 13, weight: 76, height: 168 });
    const r = await stan(page);
    expect(r.dane.energia.reeRownanie.id).toBe('MOLNAR_1995');
    expect(Math.round(r.dane.energia.reeKcal)).toBe(1791);
    expect(Math.round(r.dane.energia.teeBazowyKcal)).toBe(2507);
  });
  // A8-5 (dziecko bez klasy BMI) — tests/unit/dieta-audyt2.test.mjs: na stronie klasa BMI ma źródło zapasowe, więc ścieżkę sprawdza okno bez silnika BMI.
});
