import { expect, test } from '@playwright/test';

// ENERGY-REC-4 — język zaleceń energetycznych (PR 4 audytu, 2026-09-12), przez PRAWDZIWY przycisk
// „Generuj zalecenia energetyczne" na index.html:
//  • J1: wariant standardowy u 10-latka w formie bezosobowej (bez „Proszę", „Wybieraj", „podawaj", „Ograniczajcie",
//    „skonsultujcie", „Rodzice powinni");
//  • J2: 18-latka w trybie „ty" — „osoby w Twoim wieku", konsultacja bez „rodziców" i „psychologa dziecięcego";
//  • J3: stabilizacja 8-latki — cel raz, „nie planuje się dodatkowego deficytu", normy z podstawą w nawiasie,
//    bez „Przeliczenie wykonano", bez „masa ma rosnąć minimalnie";
//  • J4: czas dojścia: ≤ 52 tyg. „około N tygodni (ok. X miesiąca/miesięcy)", > roku tylko miesiące;
//    „kg tygodniowo", „przy tej diecie", polski cudzysłów zamykający przy poziomie aktywności dorosłego.
// Dane FIKCYJNE.

async function openAll(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function');
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => typeof window.generateDietRecommendations === 'function');
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportFormatIssueList === 'function');
}

function run(page, { age, months = 0, sex, w, h, click = null, pf = false, norms = true }) {
  return page.evaluate(async ({ age, months, sex, w, h, click, pf, norms }) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true;
    window.__vildaPlanPalTouched = false;
    window.__vildaDietStrategyTouched = false;
    set('age', age); set('ageMonths', months); set('sex', sex); set('weight', w); set('height', h);
    window.ensureDietRecommendationsElements();
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = on; };
    flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', false);
    flag('nutritionNormsFlag', !!norms); flag('journeyFlag', true); flag('vitDSuppFlag', true); flag('hydrationFlag', true); flag('patientFacingToggle', !!pf);
    if (click) { const bt = document.querySelector(`[data-diet-strategy-choice="${click}"]`); if (bt) bt.click(); }
    window.update();
    const tab = document.querySelector('[data-diet-mode="energy"]');
    if (tab && !tab.classList.contains('is-active')) tab.click();
    document.getElementById('generateEnergyDietBtn').click();
    await new Promise((res) => { setTimeout(res, 150); });
    const norm = (s) => (s || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    const res = document.getElementById('dietEnergyResult');
    const text = norm(res.innerHTML.replace(/<\/(li|p|div|h3)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' '));
    return { text, active: document.querySelector('[data-diet-strategy-choice].is-active')?.getAttribute('data-diet-strategy-choice') || null };
  }, { age, months, sex, w, h, click, pf, norms });
}

const count = (text, needle) => text.split(needle).length - 1;

test('J1: 10-latek, wariant standardowy — forma bezosobowa, bez zwrotów do rodziców w 2. osobie', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await run(page, { age: 10, sex: 'M', w: 55, h: 145, click: 'reduction' });
  expect(r.text).toContain('Zalecane jest regularne spożywanie przez dziecko 4–5 zdrowych posiłków dziennie');
  expect(r.text).toContain('Zalecana jest codzienna aktywność fizyczna dziecka przez co najmniej 60 minut');
  expect(r.text).toContain('Zalecane jest odpowiednie nawodnienie dziecka: zgodnie z polskimi normami');
  for (const zly of ['Proszę', 'Wybieraj', 'podawaj', 'Ograniczajcie', 'skonsultujcie', 'Rodzice powinni', 'unikaj', 'Nie podawaj', 'grzanek']) {
    expect(r.text, zly).not.toContain(zly);
  }
  expect(r.text).toContain('kg tygodniowo');
  expect(r.text).not.toContain('na tydzień');
  expect(r.text).toContain('Deficyt kaloryczny przy tej diecie wynosi');
  expect(r.text).not.toContain('Przeliczenie wykonano');
  expect(r.text).toMatch(/Normy żywieniowe dla planu około \d+ kcal\/d \(od zapotrzebowania dla masy należnej – mediany BMI dla wieku i wzrostu\):/u);
});

test('J2: 18-latka w trybie „ty" — rówieśnik zamiast „dziecka", konsultacja bez rodziców i psychologa dziecięcego; standard 18-latki bez „Twoja"', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const p = await run(page, { age: 18, sex: 'F', w: 80, h: 165, pf: true });
  expect(p.text).toContain('Przeciętna masa ciała osoby w Twoim wieku i o Twoim wzroście');
  expect(p.text).not.toContain('dziecka w Twoim wieku');
  expect(p.text).toContain('Jeżeli wdrożenie zaleceń okaże się trudne, rozważ konsultację z dietetykiem lub psychologiem.');
  expect(p.text).not.toContain('rodzicami');
  expect(p.text).not.toContain('dziecięcym');
  const s = await run(page, { age: 18, sex: 'F', w: 80, h: 165 });
  expect(s.text).toContain('wskazana jest konsultacja z dietetykiem lub psychologiem, a w razie potrzeby także wsparcie trenera personalnego.');
  expect(s.text).not.toContain('Twoja');
  const s14 = await run(page, { age: 14, sex: 'M', w: 85, h: 165 });
  expect(s14.text).toContain('psychologiem dziecięcym');
});

test('J3: stabilizacja 8-latki — cel raz, „bez dodatkowego deficytu", bez „rosła minimalnie", normy z podstawą w nawiasie', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await run(page, { age: 8, sex: 'F', w: 40, h: 130 });
  expect(r.active).toBe('stabilization');
  expect(count(r.text, 'utrzymanie obecnej masy ciała')).toBe(1);
  expect(r.text).toContain('W strategii stabilizacji nie planuje się dodatkowego deficytu: podaż energii dziecka odpowiada zapotrzebowaniu dla masy należnej');
  expect(r.text).toContain('bez dodatku na wzrastanie.');
  expect(r.text).not.toContain('Celem jest utrzymanie obecnej masy ciała przy dalszym wzrastaniu');
  expect(r.text).not.toMatch(/rosła minimalnie|rosła jak najwolniej/u);
  expect(r.text).toContain('Przy stabilnej masie ciała dziecko z czasem „wyrośnie” z otyłości');
  expect(r.text).toMatch(/Normy żywieniowe dla planu około \d+ kcal\/d \(od zapotrzebowania dla masy należnej – mediany BMI dla wieku i wzrostu\):/u);
  expect(r.text).not.toContain('Przeliczenie wykonano');
  const p = await run(page, { age: 8, sex: 'F', w: 40, h: 130, pf: true });
  expect(p.text).toContain('W strategii stabilizacji nie planujemy dodatkowego deficytu: dzienna podaż energii dziecka powinna odpowiadać zapotrzebowaniu dziecka o prawidłowej masie ciała dla jego wieku i wzrostu');
  expect(count(p.text, 'ajważniejsze jest utrzymanie')).toBe(1);
});

test('J4: czas dojścia — 14-latek ≤ 52 tyg. „około N tygodni (ok. X miesiąca)", 3-latka > roku tylko miesiące, dorosły z cudzysłowem polskim', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r14 = await run(page, { age: 14, sex: 'M', w: 75, h: 165 });
  expect(r14.text).toMatch(/można szacować na około \d+ tygodni \(ok\. \d+(,\d)? miesi(ąca|ęcy)\)\. Regularna aktywność/u);
  expect(r14.text).not.toContain('mies.)');
  const r3 = await run(page, { age: 3, sex: 'F', w: 22, h: 100 });
  expect(r3.text).toMatch(/może zająć około \d+ miesięcy\. Przykładowy przebieg/u);
  expect(r3.text).not.toMatch(/może zająć około \d+ tygodni/u);
  const a = await run(page, { age: 35, sex: 'M', w: 105, h: 175 });
  expect(a.text).toMatch(/na poziomie „[^”]+” \(PAL \d,\d\)/u);
  expect(a.text).toMatch(/można szacować na około \d+ tygodni \(ok\. \d+(,\d)? miesi(ąca|ęcy)\)\.|można szacować na około \d+(,\d)? miesi(ąca|ęcy)\./u);
  expect(a.text).not.toContain('mies.)');
  expect(a.text).toContain('150–300 minut');
  expect(a.text).not.toContain('co najmniej 150–300');
});
