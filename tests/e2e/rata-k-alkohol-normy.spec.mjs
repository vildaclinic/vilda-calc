import { expect, test } from '@playwright/test';

// P-DIETA-NORMY rata K (2026-09-22, decyzje właściciela):
//  - zdanie o alkoholu u dorosłego pochodzi z opcji dodatkowej „Alkohol” (domyślnie zaznaczona; u dziecka ukryta);
//  - zdanie o normach żywieniowych bez skrótów RDA/EAR i bez „białka do planowania”, w brzmieniu:
//    „Przy planie żywieniowym zakładającym około N kcal dziennie zalecane ilości składników to: białko A–B g (P–Q % energii),
//     tłuszcze …, węglowodany ….”; przy zapotrzebowaniu (bez planu): „Przy zapotrzebowaniu około N kcal dziennie …”.
//  Liczby bez zmian — test buduje oczekiwany napis z dane.normy. Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function' && !!window.VildaRaportPlan);
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.VildaDietRecommendations.generateRecommendations === 'function'));
}

const norm = (v) => String(v == null ? '' : v).replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
const ALKOHOL = 'Alkohol jest kaloryczny, ale przede wszystkim szkodliwy dla zdrowia – zwiększa m.in. ryzyko nowotworów; nie ma bezpiecznej ilości spożycia.';

function policz(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true; window.__vildaPlanPalTouched = false; window.__vildaDietStrategyTouched = false; window.__vildaDietGoalChoice = null;
    window.intakeHistory = null;
    set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h);
    set('customGoalKg', s.cel == null ? '' : s.cel);
    window.ensureDietRecommendationsElements();
    const tresc = document.getElementById('dietRecommendationsContent');
    if (tresc && tresc.style.display === 'none') document.getElementById('dietRecommendationsBtn').click();
    document.querySelectorAll('#dietStrategyOptions details').forEach((d) => { d.open = true; });
    flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', false);
    flag('nutritionNormsFlag', true); flag('journeyFlag', true); flag('vitDSuppFlag', true); flag('hydrationFlag', true); flag('peerMassFlag', false);
    if (s.alkohol != null) flag('alcoholFlag', s.alkohol);
    window.update();
    await new Promise((res) => { setTimeout(res, 160); });
    const r = window.VildaDietRecommendations.generateRecommendations();
    const d = r.dane || {};
    const el = document.getElementById('alcoholFlag');
    const g = el && el.closest('.diet-toggle-group');
    const raport = window.VildaRaportPlan.html({ patient: { name: 'Jan Testowy' }, baseResult: window.VildaDietRecommendations.buildEnergyRecommendationResult() });
    return {
      text: r.textOutput || '', zdania: d.zdania || {}, normy: d.normy || null, energia: d.energia || {}, strategia: d.strategia,
      flaga: { checked: !!(el && el.checked), disabled: !!(el && el.disabled), hidden: !!(g && g.hasAttribute('hidden')), widoczna: !!(g && g.offsetParent !== null) },
      raport: raport
    };
  }, s);
}

const g0 = (v) => String(Math.round(Number(v)));
const zakres = (r, jedn) => g0(r[0]) + '–' + g0(r[1]) + jedn;
function oczekiwaneNormy(n, kcal, planowe) {
  const czesci = [
    'białko ' + zakres(n.proteinPlanningGramRange, ' g') + ' (' + zakres(n.proteinPlanningPercentRange, ' % energii') + ')',
    'tłuszcze ' + zakres(n.fatGramRange, ' g') + ' (' + zakres(n.fatPercentRange, ' % energii') + ')',
    'węglowodany ' + zakres(n.carbGramRange, ' g') + ' (' + zakres(n.carbPercentRange, ' % energii') + ')'
  ];
  return 'Przy ' + (planowe ? 'planie żywieniowym zakładającym' : 'zapotrzebowaniu') + ' około ' + kcal + ' kcal dziennie zalecane ilości składników to: ' + czesci.join(', ') + '.';
}
const kcalNapis = (v) => String(Math.round(Number(v)));

test('alkohol z opcji: dorosły z nadmiarem i w normie — domyślnie zdanie jest, po odznaczeniu znika; u dziecka opcja ukryta', async ({ page }) => {
  test.setTimeout(150_000);
  await otworz(page);
  const a = await policz(page, { age: 42, sex: 'M', w: 108, h: 178 });
  expect(a.strategia).toBe('reduction');
  expect(a.flaga.checked).toBe(true); expect(a.flaga.widoczna).toBe(true); expect(a.flaga.disabled).toBe(false);
  expect((a.zdania.talerz || []).map(norm).filter((z) => z === ALKOHOL).length).toBe(1);

  const bez = await policz(page, { age: 42, sex: 'M', w: 108, h: 178, alkohol: false });
  expect((bez.zdania.talerz || []).map(norm).filter((z) => z === ALKOHOL).length).toBe(0);
  expect(norm(bez.text)).not.toMatch(/ryzyko nowotworów/u);
  // wyliczanka talerza bez „alkohol” niezależnie od opcji (rata J)
  expect(norm(bez.zdania.talerz[0])).not.toMatch(/alkohol/u);
  expect((bez.zdania.talerz || []).length).toBe((a.zdania.talerz || []).length - 1);

  const n = await policz(page, { age: 40, sex: 'M', w: 70, h: 178, alkohol: true });
  expect(n.strategia).toBe('utrzymanie');
  expect((n.zdania.talerz || []).map(norm).filter((z) => z === ALKOHOL).length).toBe(1);
  const n0 = await policz(page, { age: 40, sex: 'M', w: 70, h: 178, alkohol: false });
  expect((n0.zdania.talerz || []).map(norm).filter((z) => z === ALKOHOL).length).toBe(0);

  // dziecko: opcja ukryta i wyłączona, zdania nie ma nawet przy zaznaczonej fladze
  const dz = await policz(page, { age: 12, sex: 'F', w: 60, h: 150, alkohol: true });
  expect(dz.flaga.hidden).toBe(true); expect(dz.flaga.widoczna).toBe(false); expect(dz.flaga.disabled).toBe(true);
  expect(norm(dz.text)).not.toMatch(/Alkohol jest kaloryczny/u);

  // powrót do dorosłego: opcja znów widoczna, stan zachowany
  const a2 = await policz(page, { age: 42, sex: 'M', w: 108, h: 178 });
  expect(a2.flaga.widoczna).toBe(true); expect(a2.flaga.checked).toBe(true);
});

test('normy żywieniowe bez skrótów: plan (dorosły z otyłością, nastolatek) i zapotrzebowanie (dorosły w normie); kafel raportu bez RDA', async ({ page }) => {
  test.setTimeout(150_000);
  await otworz(page);
  for (const s of [{ age: 47, sex: 'M', w: 112, h: 167 }, { age: 14, months: 6, sex: 'F', w: 75, h: 150 }]) {
    const w = await policz(page, s);
    expect(w.normy, JSON.stringify(s)).not.toBeNull();
    const t = norm(w.text);
    const oczek = oczekiwaneNormy(w.normy, kcalNapis(w.normy.targetEnergyKcal), true);
    expect(t, JSON.stringify(s)).toContain(oczek);
    expect(t).not.toMatch(/\bRDA\b|\bEAR\b|do planowania|kcal\/d:|Normy żywieniowe dla/u);
    // te same gramy co w dane.normy (liczby bez zmian)
    expect(w.normy.proteinRdaG).toBeGreaterThan(0);
    const kartka = norm(w.raport.replace(/<[^>]+>/g, ' '));
    expect(kartka).toContain('białko ' + zakres(w.normy.proteinPlanningGramRange, ' g/d') + ' ' + zakres(w.normy.proteinPlanningPercentRange, ' % energii'));
    expect(kartka).not.toMatch(/\bRDA\b/u);
  }
  const n = await policz(page, { age: 40, sex: 'M', w: 70, h: 178 });
  expect(n.strategia).toBe('utrzymanie');
  expect(n.normy).not.toBeNull();
  const t = norm(n.text);
  expect(t).toContain(oczekiwaneNormy(n.normy, kcalNapis(n.normy.targetEnergyKcal), false));
  expect(t).toContain('Przy zapotrzebowaniu około');
});
