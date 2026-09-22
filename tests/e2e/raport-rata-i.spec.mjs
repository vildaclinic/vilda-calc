import { expect, test } from '@playwright/test';

// P-RAPORT rata I (2026-09-22) — jednostronicowy plan pacjenta: droga do celu własnego, oś przez środki
// znaczników, skala w obie strony (do SKALA_MAX, nagłówek do SKALA_MAX_GORA).
//
// Zasada bez zmian: raport NICZEGO NIE LICZY. Każda liczba na kartce jest liczbą generatora (`dane`)
// albo silnika planu; asercje budują oczekiwany napis z danych i szukają go w HTML.
// Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function'
    && !!window.VildaRaportPlan
    && typeof window.energyBuildPlanReductionState === 'function'
    && typeof window.ensureDietRecommendationsElements === 'function'
    && !!(window.VildaDietRecommendations && window.VildaDietRecommendations.buildEnergyRecommendationResult));
}

const norm = (v) => String(v == null ? '' : v).replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
const tekstZHtml = (h) => norm(String(h).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '));
const przec = (v, n) => Number(v).toFixed(n).replace('.', ',');

/** Ustawia pacjenta (opcjonalnie cel własny i flagę wzrostu), buduje HTML planu i oddaje dane generatora. */
function zbuduj(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true;
    window.__vildaPlanPalTouched = false; window.__vildaDietStrategyTouched = false; window.__vildaDietGoalChoice = null;
    window.intakeHistory = null;
    set('name', 'Jan Testowy');
    set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h);
    set('customGoalKg', s.cel == null ? '' : s.cel);
    window.ensureDietRecommendationsElements();
    ['reduceToggle', 'stabilizationToggle'].forEach((id) => flag(id, false));
    flag('growthEndedFlag', !!s.ge);
    ['nutritionNormsFlag', 'journeyFlag', 'vitDSuppFlag', 'hydrationFlag'].forEach((id) => flag(id, s.opcje !== false));
    window.update();
    await new Promise((r) => { setTimeout(r, 180); });
    const baseResult = window.VildaDietRecommendations.buildEnergyRecommendationResult();
    const ctx = { patient: { name: 'Jan Testowy', ageLabel: s.age + ' lat', sexLabel: s.sex === 'F' ? 'żeńska' : 'męska',
                             weightLabel: s.w + ',0 kg', heightLabel: s.h + ',0 cm' }, baseResult: baseResult };
    const dane = baseResult && baseResult.dane;
    const st = window.energyBuildPlanReductionState({ ageYears: s.age, ageMonthsOpt: s.months || 0, sex: s.sex, weightKg: s.w, heightCm: s.h,
      palInput: null, history: null, growthEnded: !!s.ge });
    const czas = dane && dane.czasDoNormy && window.VildaDietRecommendations.formatujCzasDojscia
      ? window.VildaDietRecommendations.formatujCzasDojscia(dane.czasDoNormy.tygodnie, dane.czasDoNormy.miesiaceLabel) : '';
    return { html: window.VildaRaportPlan.html(ctx), dane: dane, cg: st.customGoal || null, czas: czas };
  }, s);
}

/** Wkłada HTML planu do próbnej strony A4 (jak generator PDF), dopasowuje i mierzy oś oraz nagłówek. */
function zmierz(page, html) {
  return page.evaluate(async (h) => {
    document.querySelectorAll('.vrp-probna').forEach((n) => n.remove());
    const sek = document.createElement('section');
    sek.className = 'diet-pdf-page vrp-probna';
    sek.style.cssText = 'position:fixed;left:-9999px;top:0;width:1240px;height:1754px;box-sizing:border-box;padding:54px 58px 74px;overflow:hidden;';
    sek.innerHTML = h + '<footer class="diet-pdf-footer" style="position:absolute;left:58px;right:58px;bottom:26px;height:46px;"></footer>';
    document.body.appendChild(sek);
    const klatka = () => new Promise((r) => { requestAnimationFrame(() => { requestAnimationFrame(r); }); });
    await klatka();
    const skala = window.VildaRaportPlan.dopasuj(sek);
    await klatka();
    const v = sek.querySelector('.vrp');
    const st = sek.querySelector('.diet-pdf-footer');
    const tor = sek.querySelector('.vrp-tor');
    const t = tor ? tor.getBoundingClientRect() : null;
    const znaczniki = Array.from(sek.querySelectorAll('.vrp-kr')).map((k) => {
      const b = k.getBoundingClientRect();
      return { w: b.width, h: b.height, cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
    });
    const chipy = Array.from(sek.querySelectorAll('.vrp-chipy span')).map((c) => Math.round(c.getBoundingClientRect().top));
    const wynik = {
      skala: skala,
      sg: parseFloat(v.style.getPropertyValue('--sg')),
      luz: parseFloat(v.style.getPropertyValue('--luz')),
      zapas: Math.round(st.getBoundingClientRect().top - v.getBoundingClientRect().bottom),
      tor: t ? { cy: t.top + t.height / 2, left: t.left, right: t.right } : null,
      znaczniki: znaczniki,
      chipyWiersze: Array.from(new Set(chipy)).length
    };
    sek.remove();
    return wynik;
  }, html);
}

test('cel własny dorosłego: sekcja „Twoja droga” z liczbami generatora, dwa punkty osi', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const w = await zbuduj(page, { age: 34, sex: 'F', w: 68, h: 169, cel: 63 });
  const d = w.dane;
  expect(d.strategia).toBe('cel-wlasny');
  expect(w.cg && w.cg.active).toBe(true);
  // BMI celu w `dane.masa` pochodzi z silnika planu (customGoal.targetBmi), nie z raportu
  expect(d.masa.docelowaBmi).toBeCloseTo(w.cg.targetBmi, 6);
  expect(d.masa.docelowaKg).toBe(63);
  expect(d.masa.doRedukcjiKg).toBe(5);

  const t = tekstZHtml(w.html);
  expect(t).toContain('TWOJA DROGA');
  expect(t).toContain('CEL WŁASNY');
  expect(t).toContain('−' + przec(d.masa.doRedukcjiKg, 1) + ' kg');
  expect(t).toContain('do ' + przec(d.masa.docelowaKg, 1) + ' kg cel własny (BMI ' + przec(d.masa.docelowaBmi, 1) + ')'); // rata O: bez kreski, opis w osobnej linii
  expect(t).toContain('Masa docelowa: ' + przec(d.masa.docelowaKg, 1) + ' kg (BMI ' + przec(d.masa.docelowaBmi, 1) + ') – cel uzgodniony z pacjentem, nie wskazanie medyczne.');
  expect(w.czas).toBeTruthy();
  expect(t).toContain('Orientacyjny czas: ' + norm(w.czas));
  // oś: dziś → cel własny; bez szczebli drabinki i bez „normy BMI”
  expect((w.html.match(/class="vrp-zn vrp-t-/g) || []).length).toBe(2);
  expect(w.html).toContain('vrp-t-start');
  expect(w.html).toContain('vrp-t-cel');
  expect(t).toContain(przec(68, 1) + ' kg dziś');
  expect(t).toContain(przec(63, 1) + ' kg cel własny');
  expect(t).not.toContain('norma BMI');
  expect(t).not.toContain('PIERWSZY CEL');
});

test('cel własny nastolatka po zakończeniu wzrastania: droga jak u dorosłego, BMI celu z silnika', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const w = await zbuduj(page, { age: 17, months: 2, sex: 'M', w: 76, h: 176, cel: 68, ge: true });
  const d = w.dane;
  expect(w.cg && w.cg.teen && w.cg.active).toBe(true);
  expect(d.strategia).toBe('cel-wlasny');
  expect(d.masa.docelowaBmi).toBeCloseTo(w.cg.targetBmi, 6);
  const t = tekstZHtml(w.html);
  expect(t).toContain('TWOJA DROGA');
  expect(t).toContain('−' + przec(d.masa.doRedukcjiKg, 1) + ' kg');
  expect(t).toContain('cel własny (BMI ' + przec(d.masa.docelowaBmi, 1) + ')');
  expect(t).toContain('cel uzgodniony z pacjentem, nie wskazanie medyczne');
  expect(t).toContain('Orientacyjny czas: ' + norm(w.czas));
  // bez flagi wzrostu celu nie ma → nie ma też drogi
  const bez = await zbuduj(page, { age: 17, months: 2, sex: 'M', w: 76, h: 176, cel: 68, ge: false });
  expect(bez.dane.strategia).not.toBe('cel-wlasny');
  expect(bez.dane.masa.docelowaBmi).toBeNull();
  expect(tekstZHtml(bez.html)).not.toContain('TWOJA DROGA');
});

test('bez celu własnego: norma bez drogi, nadmiar z drabinką jak dotąd', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const norma = await zbuduj(page, { age: 40, sex: 'M', w: 70, h: 178 });
  expect(norma.dane.masa.docelowaBmi).toBeNull();
  expect(tekstZHtml(norma.html)).not.toContain('TWOJA DROGA');
  const otylosc = await zbuduj(page, { age: 47, sex: 'M', w: 112, h: 167 });
  const t = tekstZHtml(otylosc.html);
  expect(otylosc.dane.masa.docelowaBmi).toBeNull();
  expect(t).toContain('PIERWSZY CEL');
  expect(t).toContain('kg norma BMI');
  expect(t).not.toContain('cel uzgodniony z pacjentem');
});

test('oś drogi: znaczniki jednej wielkości, tor przechodzi przez ich środki i kończy się na skrajnych', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  for (const s of [
    { age: 47, sex: 'M', w: 112, h: 167 },               // drabinka: 4 punkty
    { age: 14, months: 3, sex: 'M', w: 72, h: 165 },     // drabinka dziecka: 3 punkty
    { age: 34, sex: 'F', w: 68, h: 169, cel: 63 }        // cel własny: 2 punkty
  ]) {
    const w = await zbuduj(page, s);
    const m = await zmierz(page, w.html);
    expect(m.tor, 'brak toru dla ' + JSON.stringify(s)).not.toBeNull();
    expect(m.znaczniki.length).toBeGreaterThanOrEqual(2);
    const w0 = m.znaczniki[0].w;
    for (const z of m.znaczniki) {
      expect(Math.abs(z.w - w0)).toBeLessThan(0.6);
      expect(Math.abs(z.h - z.w)).toBeLessThan(0.6);
      expect(Math.abs(z.cy - m.tor.cy), 'środek znacznika poza torem').toBeLessThan(1);
    }
    expect(Math.abs(m.znaczniki[0].cx - m.tor.left)).toBeLessThan(1);
    expect(Math.abs(m.znaczniki[m.znaczniki.length - 1].cx - m.tor.right)).toBeLessThan(1);
  }
});

test('dopasowanie do strony: krótka treść rośnie do SKALA_MAX, nagłówek najwyżej do SKALA_MAX_GORA, długa nie wychodzi poza stronę', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const R = await page.evaluate(() => ({ max: window.VildaRaportPlan.SKALA_MAX, gora: window.VildaRaportPlan.SKALA_MAX_GORA, min: window.VildaRaportPlan.SKALA_MIN }));
  expect(R.max).toBe(1.4); expect(R.gora).toBe(1.1);

  // norma bez opcji: dwa bloki — skala idzie w górę, treść nadal nad stopką, chipy w jednym rzędzie
  const krotki = await zbuduj(page, { age: 40, sex: 'M', w: 70, h: 178, opcje: false });
  const mk = await zmierz(page, krotki.html);
  expect(mk.skala).toBeGreaterThan(1.2);
  expect(mk.skala).toBeLessThanOrEqual(R.max);
  expect(mk.sg).toBeCloseTo(Math.min(R.gora, mk.skala), 6);
  expect(mk.zapas).toBeGreaterThanOrEqual(0);
  expect(mk.chipyWiersze).toBe(1);

  // cel własny bez opcji (dawniej pół pustej strony): też rośnie
  const cw = await zbuduj(page, { age: 34, sex: 'F', w: 68, h: 169, cel: 63, opcje: false });
  const mc = await zmierz(page, cw.html);
  expect(mc.skala).toBeGreaterThan(1.1);
  expect(mc.zapas).toBeGreaterThanOrEqual(0);
  expect(mc.chipyWiersze).toBe(1);

  // komplet opcji przy otyłości i u nastolatka: mieści się, skala nie schodzi do podłogi
  for (const s of [{ age: 47, sex: 'M', w: 112, h: 167 }, { age: 14, months: 6, sex: 'F', w: 75, h: 150 }]) {
    const w = await zbuduj(page, s);
    const m = await zmierz(page, w.html);
    expect(m.zapas, 'pacjent ' + s.age + ' lat wychodzi poza stronę').toBeGreaterThanOrEqual(0);
    expect(m.skala).toBeGreaterThan(0.8);
    expect(m.skala).toBeLessThanOrEqual(R.max);
    expect(m.sg).toBeLessThanOrEqual(R.gora);
  }
});
