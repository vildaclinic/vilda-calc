import { expect, test } from '@playwright/test';

// Testy regresyjne etapu 1 naprawy karty „Plan odchudzania":
//  - dorośli dostają liczbowy czas do górnej granicy normy BMI (cel z
//    toNormalBMITarget → 24,9, spójnie z kartą „Droga do normy BMI");
//    dotąd cel czytano z nieistniejącego ADULT_BMI.NORMAL_MAX i każdy
//    dorosły widział „– tyg. (≈ – lat)",
//  - druga karta wyniku u dorosłych mówi o „środku normy (BMI 22)"
//    zamiast pediatrycznego „50. centyla BMI" (ten zostaje u dzieci),
//  - fillDietSelect nie wybucha przy braku #dietChoiceWrap,
//  - martwy legacy export proposeDiets (BMR×PAL bez korekty wzrastania,
//    zero wywołań w repo) jest usunięty; proposeDietsFromTEE zostaje.
// Testy uruchamiają PRAWDZIWĄ ścieżkę produkcyjną window.update() na
// index.html i czytają wyrenderowaną kartę (AGENTS.md §3.5). Dane FIKCYJNE.

async function renderPlan(page, { age, months, sex, weight, height }) {
  return page.evaluate(({ age, months, sex, weight, height }) => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = String(v);
    };
    set('age', age);
    set('ageMonths', months);
    set('sex', sex);
    set('weight', weight);
    set('height', height);
    window.update();
    const card = document.getElementById('planCard');
    const results = document.getElementById('planResults');
    return {
      visible: !!card && card.style.display !== 'none',
      text: results ? results.textContent.replace(/\s+/g, ' ').trim() : '',
    };
  }, { age, months, sex, weight, height });
}

async function openIndex(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function');
}

test('PLAN-S1-ADULT-TARGET: dorosły dostaje liczbowy czas do granicy normy (cel 24,9 jak w Drodze do normy)', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  // Karta scalona: planCard ukryty, silnik renderuje do ukrytego planResults
  // (selecty, autosave, integracje) — asercje liczbowe pozostają ważne.
  expect(out.visible).toBe(false);
  // PAL 1,4, dieta umiarkowana (−588 kcal → 0,5345 kg/tydz.), cel 24,9 → 78,87 kg:
  // 16,13 kg / 2,32 kg/mies. → 7 mies. (siatka 0,5).
  expect(out.text).toMatch(/Stosując dietę umiarkowaną osiągniesz górną granicę normy BMI (w|we) \S+ \d{4} \(za ok\. 7 miesięcy\)/u);
  expect(out.text).toMatch(/7 mies\.\s*granica normy/u);
  expect(out.text).not.toContain('– mies.');
  expect(out.text).not.toContain('tyg.');
});

test('PLAN-S1-ADULT-LABEL: druga karta u dorosłego mówi o środku normy (BMI 22), nie o 50. centylu', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  // Układ 2.0: drugi cel jako znacznik osi czasu „BMI 22" z czasem w miesiącach.
  expect(out.text).toMatch(/\d+(,5)? mies\.\s*BMI 22/u);
  expect(out.text).not.toContain('50. centyl');
});

test('PLAN-S1-CHILD-LABEL: u dziecka druga karta zostaje przy 50. centylu BMI', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderPlan(page, { age: 8, months: 0, sex: 'M', weight: 45, height: 130 });
  expect(out.visible).toBe(false);
  expect(out.text).toContain('50. centyl BMI');
  expect(out.text).not.toContain('BMI 22');
  expect(out.text).toMatch(/osiągniesz górną granicę normy BMI/);
  expect(out.text).toMatch(/\d+(,5)? mies\.\s*granica normy/u);
});

test('PLAN-S1-GUARDS: fillDietSelect bez #dietChoiceWrap nie rzuca; martwy proposeDiets usunięty', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await page.evaluate(() => {
    const w = document.getElementById('dietChoiceWrap');
    const parent = w.parentNode;
    const next = w.nextSibling;
    parent.removeChild(w);
    let guardOk = true;
    try {
      window.fillDietSelect([]);
      window.fillDietSelect([{ key: 'light', name: 'lekka', deficit: 300, intake: 1500, weeklyLoss: 0.3 }]);
    } catch (err) {
      guardOk = 'THROW: ' + err.message;
    }
    parent.insertBefore(w, next);
    return {
      guardOk,
      deadExport: typeof window.proposeDiets,
      liveExport: typeof window.proposeDietsFromTEE,
      moduleExport: typeof window.VildaDietPlanUI.proposeDietsFromTEE,
    };
  });
  expect(out.guardOk).toBe(true);
  expect(out.deadExport).toBe('undefined');
  expect(out.liveExport).toBe('function');
  expect(out.moduleExport).toBe('function');
});

// ===== Etap 2: minimum dziecięce max(1200, REE), bramka wieku trybu
// profesjonalnego, punkty opisu diety z realnych wartości pacjenta. =====

async function setProfessionalMode(page, on) {
  await page.evaluate((on) => {
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && tgl.checked !== on) {
      tgl.checked = on;
      tgl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, on);
}

test('PLAN-S2-FLOOR-REE: minimum dziecka = max(1200, REE) — intensywna znika przy PAL 1,4, wraca przy 1,6', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const diets = async (pal) => page.evaluate((pal) => {
    document.getElementById('palFactor').value = pal;
    window.update();
    return [...document.getElementById('dietLevel').options].map((o) => o.textContent);
  }, pal);
  await renderPlan(page, { age: 8, months: 0, sex: 'M', weight: 45, height: 130 });
  // REE Henry'ego (chłopiec 3–9): (0,0632·45 + 1,31·1,30 + 1,28)·239 ≈ 1393 kcal.
  // PAL 1,4 → TEE ≈ 1969; intensywna −591 → 1378 < 1393 → wypada.
  const low = await diets('1.4');
  expect(low.some((t) => t.includes('lekka'))).toBe(true);
  expect(low.some((t) => t.includes('umiarkowana'))).toBe(true);
  expect(low.some((t) => t.includes('intensywna'))).toBe(false);
  // PAL 1,6 → TEE ≈ 2251; intensywna −675 → 1576 ≥ 1393 → dostępna.
  const mid = await diets('1.6');
  expect(mid.some((t) => t.includes('intensywna'))).toBe(true);
});

test('PLAN-S2-PROF-GATE: tryb profesjonalny — <2 lat plan ukryty, 2–5 lat z adnotacją kliniczną, ≥5 bez niej', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  await setProfessionalMode(page, true);
  const under2 = await renderPlan(page, { age: 1, months: 6, sex: 'M', weight: 14, height: 80 });
  expect(under2.visible).toBe(false);
  const toddler = await renderPlan(page, { age: 3, months: 0, sex: 'F', weight: 20, height: 95 });
  expect(toddler.visible).toBe(true);
  const warn3 = await page.evaluate(() => {
    const el = document.getElementById('planWarning');
    return { display: el?.style.display, text: (el?.textContent || '').trim() };
  });
  expect(warn3.display).not.toBe('none');
  // Między „5" a „lat" jest wąska spacja niełamliwa (U+202F).
  expect(warn3.text).toContain('Wiek 2–5 lat');
  expect(warn3.text).toContain('do oceny klinicznej');
  const school = await renderPlan(page, { age: 8, months: 0, sex: 'M', weight: 45, height: 130 });
  // ≥5 lat: karta scalona przejmuje UI (planCard ukryty), ostrzeżenie 5–9 w panelu.
  expect(school.visible).toBe(false);
  const warn8 = await page.evaluate(() => document.getElementById('planWarning')?.style.display);
  expect(warn8).toBe('none');
  const mount8 = await page.evaluate(() => (document.getElementById('bmiJourneyMount')?.textContent || '').replace(/\s+/g, ' '));
  expect(mount8).toContain('Dieta u dzieci w wieku 5–9 lat wymaga nadzoru');
  // Poza trybem profesjonalnym 3-latek nadal bez planu (konsultacja).
  await setProfessionalMode(page, false);
  const control = await renderPlan(page, { age: 3, months: 0, sex: 'F', weight: 20, height: 95 });
  expect(control.visible).toBe(false);
});

test('PLAN-S2-BULLETS: opis wybranej diety podaje realny deficyt i tempo pacjenta zamiast sztywnych zakresów', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  // Dorosły, dieta umiarkowana: deficyt 22% z TEE 2676 → 588 kcal, 0,5 kg/tydz.
  expect(out.text).toContain('ok. 588 kcal dziennie');
  expect(out.text).toContain('przewidywana utrata ok. 0,5 kg tygodniowo');
  expect(out.text).not.toContain('500–750 kcal dziennie');
});

// ===== Etap 3: wspólna symulacja wzrastania i czasy w miesiącach. =====

test('PLAN-S3-SIM-API: symulacja — dziecko szybciej niż liniowo, dorosły dokładnie liniowo, cel 50c dalej niż 85c', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await page.evaluate(() => {
    const sim = (o) => window.energySimulateMonthsToBmiTarget(o);
    const childNorm = sim({ ageYears: 13, ageMonthsOpt: 0, sex: 'M', weightKg: 58, heightCm: 158, weeklyLossKg: 0.313, target: 'norm' });
    const childMedian = sim({ ageYears: 13, ageMonthsOpt: 0, sex: 'M', weightKg: 58, heightCm: 158, weeklyLossKg: 0.313, target: 'median' });
    const adultNorm = sim({ ageYears: 40, ageMonthsOpt: 0, sex: 'M', weightKg: 95, heightCm: 178, weeklyLossKg: 0.5345, target: 'norm' });
    // Liniowy odpowiednik: kg do celu 85c przy STAŁYM wieku / tempo.
    const linear = (w, hCm, age, pace) => {
      const t = window.toNormalBMITarget(w, hCm, age, 'M');
      const kg = w - t * Math.pow(hCm / 100, 2);
      return Math.round((Math.ceil(kg / pace) * 12 / 52) * 2) / 2;
    };
    // Długi horyzont (otyłość, wolne tempo) — tu wzrastanie musi realnie skracać czas.
    const obese = sim({ ageYears: 12, ageMonthsOpt: 0, sex: 'M', weightKg: 70, heightCm: 150, weeklyLossKg: 0.2, target: 'norm' });
    return {
      childNorm, childMedian, adultNorm, obese,
      linearMonths: linear(58, 158, 13, 0.313),
      obeseLinearMonths: linear(70, 150, 12, 0.2),
    };
  });
  expect(out.childNorm.months).not.toBeNull();
  expect(out.childNorm.growthAware).toBe(true);
  // Tempo wzrastania z realnych median (chłopcy 13→14 lat: 160,2→167,2 cm).
  expect(out.childNorm.annualGrowthCm).toBeGreaterThan(5);
  // Krótki horyzont: siatka 0,5 mies. może zrównać wyniki — symulacja nigdy nie jest wolniejsza.
  expect(out.childNorm.months).toBeLessThanOrEqual(out.linearMonths);
  // Długi horyzont: przewaga symulacji musi być ścisła.
  expect(out.obese.months).not.toBeNull();
  expect(out.obese.months).toBeLessThan(out.obeseLinearMonths);
  // Cel 50. centyla jest dalej niż górna granica normy.
  expect(out.childMedian.months).toBeGreaterThan(out.childNorm.months);
  // Dorosły: brak projekcji wzrostu, wynik zgodny z matematyką liniową (16,13 kg / 2,32 kg/mies. → 7).
  expect(out.adultNorm.growthAware).toBe(false);
  expect(out.adultNorm.months).toBe(7);
});

test('PLAN-S3-GROWTH-NOTE: dziecko widzi dopisek o wzrastaniu w planie i panelu, dorosły nie', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const child = await renderPlan(page, { age: 13, months: 0, sex: 'M', weight: 58, height: 158 });
  expect(child.text).toContain('uwzględnia dalsze wzrastanie');
  const panel = await page.evaluate(() => (document.getElementById('bmiJourneyMount')?.textContent || '').replace(/\s+/g, ' '));
  expect(panel).toContain('uwzględnia dalsze wzrastanie');
  const adult = await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  expect(adult.text).not.toContain('uwzględnia dalsze wzrastanie');
});

test('PLAN-S3-HORIZON: przy horyzoncie > 18 mies. pojawia się zastrzeżenie orientacyjności', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  // Ciężka otyłość dorosłego + lekka dieta → długi horyzont.
  await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 135, height: 170 });
  const out = await page.evaluate(() => {
    document.getElementById('dietLevel').value = 'light';
    window.updatePlanFromDiet();
    return (document.getElementById('planResults')?.textContent || '').replace(/\s+/g, ' ').trim();
  });
  expect(out).toContain('szacunek orientacyjny');
});

// ===== Plan odchudzania 2.0 (koncepcja C): hero, oś czasu, segmenty,
// karta w prawej kolumnie dla wszystkich (decyzja właściciela). =====

test('PLAN-C-LAYOUT: karta w prawej kolumnie (normWrapper) i u dorosłego, i u dziecka; stare kroki ukryte', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const probe = async (fill) => {
    await renderPlan(page, fill);
    return page.evaluate(() => ({
      parent: document.getElementById('planCard')?.parentElement?.id,
      inputs: getComputedStyle(document.getElementById('planInputs')).display,
      palSelect: !!document.getElementById('palFactor'),
      dietSelect: !!document.getElementById('dietLevel'),
    }));
  };
  const adult = await probe({ age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  expect(adult.parent).toBe('normWrapper');
  expect(adult.inputs).toBe('none');
  // Karta scalona: cały planCard ukryty, panel w toNormCard przejmuje UI.
  const cardDisplay = await page.evaluate(() => document.getElementById('planCard')?.style.display);
  expect(cardDisplay).toBe('none');
  const child = await probe({ age: 13, months: 0, sex: 'M', weight: 58, height: 158 });
  expect(child.parent).toBe('normWrapper');
  // Ukryte selecty pozostają źródłem prawdy (autosave, integracje).
  expect(child.palSelect).toBe(true);
  expect(child.dietSelect).toBe(true);
});

test('PLAN-C-SEGMENTS: segmenty diety i PAL sterują ukrytymi selectami i przeliczają kartę', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  await page.evaluate(() => document.querySelector('#planResults [data-plan2-diet="intense"]').click());
  let out = await page.evaluate(() => ({
    diet: document.getElementById('dietLevel').value,
    text: (document.getElementById('planResults').textContent || '').replace(/\s+/g, ' '),
  }));
  expect(out.diet).toBe('intense');
  expect(out.text).toContain('Stosując dietę intensywną');
  expect(out.text).toContain('−802 kcal/dzień');
  await page.evaluate(() => document.querySelector('#planResults [data-plan2-pal="1.6"]').click());
  await page.waitForTimeout(900); // debouncedUpdate
  out = await page.evaluate(() => ({
    pal: document.getElementById('palFactor').value,
    text: (document.getElementById('planResults').textContent || '').replace(/\s+/g, ' '),
  }));
  expect(out.pal).toBe('1.6');
  expect(out.text).toContain('−916 kcal/dzień');
  // Niedostępna dieta (podłoga REE u dziecka przy PAL 1,4) jest wyszarzona, nie znika.
  await renderPlan(page, { age: 13, months: 0, sex: 'M', weight: 58, height: 158 });
  const dis = await page.evaluate(() => {
    // PAL 1,6 został z poprzedniego kroku — wróć na 1,4 (przy 1,6 intensywna jest legalna).
    document.getElementById('palFactor').value = '1.4';
    window.update();
    const b = document.querySelector('#planResults [data-plan2-diet="intense"]');
    return { disabled: b?.disabled, label: (b?.textContent || '').trim() };
  });
  expect(dis.disabled).toBe(true);
  expect(dis.label).toContain('niedostępna');
});

test('PLAN-C-THEME: liquid glass nie przemalowuje segmentów (jawne style + #id + !important)', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  const out = await page.evaluate(() => {
    document.body.classList.add('liquid-ios26');
    const on = getComputedStyle(document.querySelector('#planResults .plan2-seg button[aria-pressed="true"]'));
    const off = getComputedStyle(document.querySelector('#planResults .plan2-seg button[aria-pressed="false"]'));
    document.body.classList.remove('liquid-ios26');
    return { onColor: on.color, onRadius: on.borderRadius, offBg: off.backgroundColor };
  });
  // `.liquid-ios26 button{...}!important` nie może wygrać z segmentami:
  expect(out.onColor).toBe('rgb(255, 255, 255)');
  expect(out.onRadius).toBe('0px');
  expect(out.offBg).toBe('rgba(0, 0, 0, 0)');
});

test('PLAN-C-NARROW: karta mieści się w wąskiej kolumnie bez poziomego przewijania', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 380, height: 900 });
  await openIndex(page);
  await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  const fits = await page.evaluate(() => {
    const card = document.getElementById('planCard');
    return { card: card.scrollWidth <= card.clientWidth + 1, doc: document.documentElement.scrollWidth <= 381 };
  });
  expect(fits.card).toBe(true);
  expect(fits.doc).toBe(true);
});

// ===== Fuzja kart, etap 1: jeden wybór diety w aplikacji — panel „Drogi
// do normy" czyta/ustawia #dietLevel; obie karty zawsze zgodne. =====

test('PLAN-SYNC-BOTH-WAYS: klik diety w Drodze ustawia plan i odwrotnie; zgodność przeżywa przeliczenia', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  const snap = () => page.evaluate(() => ({
    sel: document.getElementById('dietLevel').value,
    journey: document.querySelector('#bmiJourneyMount [data-journey="diet"][aria-pressed="true"]')?.textContent || '',
    plan: document.querySelector('#planResults [data-plan2-diet][aria-pressed="true"]')?.getAttribute('data-plan2-diet'),
  }));
  // Droga → Plan
  await page.evaluate(() => document.querySelector('#bmiJourneyMount [data-journey="diet"][data-key="intense"]').click());
  let s = await snap();
  expect(s.sel).toBe('intense');
  expect(s.plan).toBe('intense');
  expect(s.journey).toContain('intensywna');
  // Plan → Droga
  await page.evaluate(() => document.querySelector('#planResults [data-plan2-diet="light"]').click());
  s = await snap();
  expect(s.sel).toBe('light');
  expect(s.plan).toBe('light');
  expect(s.journey).toContain('lekka');
  // Przeliczenie karty (zmiana masy) nie gubi wspólnego wyboru.
  await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 94, height: 178 });
  s = await snap();
  expect(s.sel).toBe('light');
  expect(s.plan).toBe('light');
  expect(s.journey).toContain('lekka');
});

test('PLAN-SYNC-TIMES: przy wyłączonym ruchu obie karty pokazują ten sam termin dla tej samej diety', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  const out = await page.evaluate(() => {
    // Wyłącz spacer (domyślny ruch) — panel liczy wtedy samą dietę, jak plan.
    const walk = document.querySelector('#bmiJourneyMount .bmi-journey-chip[data-key="walk"]');
    if (walk && walk.getAttribute('aria-pressed') === 'true') walk.click();
    const j = (document.getElementById('bmiJourneyMount').textContent || '').match(/(\d+(?:,\d)?) mies\./);
    const p = (document.getElementById('planResults').textContent || '').match(/za ok\. (\d+(?:,\d)?) miesi/);
    const mode = (document.getElementById('bmiJourneyMount').textContent || '').includes('sama dieta');
    return { journey: j && j[1], plan: p && p[1], mode };
  });
  expect(out.mode).toBe(true);
  expect(out.journey).toBeTruthy();
  expect(out.journey).toBe(out.plan);
});

// --- Domyślny PAL wg pasma normatywnego dla wieku (2026-08-13) -----------------
// Nastolatek 10–18 lat: pasmo normatywne Norm 2024 to 1,6–2,0, więc nietknięty
// formularz dostaje 1,6 (dotąd: kliniczne 1,4 dla każdego). Jawny wybór i wartości
// z zapisu pacjenta mają pierwszeństwo (flaga __vildaPlanPalTouched).

test('PLAN-PAL-DEFAULT-TEEN: nietknięty formularz 12-latka dostaje PAL 1,6 + dopisek o wartości domyślnej', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  await renderPlan(page, { age: 12, months: 0, sex: 'M', weight: 70, height: 150 });
  const out = await page.evaluate(() => ({
    pal: document.getElementById('palFactor').value,
    engineDefault: typeof energyDefaultPlanPal === 'function' ? energyDefaultPlanPal(12, 0) : null,
    touched: window.__vildaPlanPalTouched === true,
    note: (document.getElementById('bmiJourneyMount')?.textContent || '').includes('PAL przyjęty domyślnie dla wieku'),
  }));
  expect(out.engineDefault).toBe(1.6);
  expect(out.pal).toBe('1.6');
  expect(out.touched).toBe(false);
  expect(out.note).toBe(true);
});

test('PLAN-PAL-DEFAULT-ADULT: dorosły zostaje przy PAL 1,4 (dolna granica pasma normatywnego)', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  await renderPlan(page, { age: 30, months: 0, sex: 'M', weight: 95, height: 178 });
  const out = await page.evaluate(() => ({
    pal: document.getElementById('palFactor').value,
    engineDefault: typeof energyDefaultPlanPal === 'function' ? energyDefaultPlanPal(30, 0) : null,
  }));
  expect(out.engineDefault).toBe(1.4);
  expect(out.pal).toBe('1.4');
});

test('PLAN-PAL-TOUCHED-KEPT: jawny wybór 1,4 u nastolatka przeżywa kolejne przeliczenia (bez nadpisania na 1,6)', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  await renderPlan(page, { age: 12, months: 0, sex: 'M', weight: 70, height: 150 });
  const out = await page.evaluate(() => {
    const sel = document.getElementById('palFactor');
    // Świadomy wybór jak z UI: zmiana wartości + natywne zdarzenie 'change'.
    sel.value = '1.4';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    window.update();
    window.update(); // drugie przeliczenie — wartość ma przetrwać
    return {
      pal: sel.value,
      touched: window.__vildaPlanPalTouched === true,
      note: (document.getElementById('bmiJourneyMount')?.textContent || '').includes('PAL przyjęty domyślnie dla wieku'),
    };
  });
  expect(out.touched).toBe(true);
  expect(out.pal).toBe('1.4');
  expect(out.note).toBe(false);
});

test('PLAN-PAL-RESTORE-KEPT: wczytany zapis nastolatka z PAL 1,4 nie jest nadpisywany wartością domyślną', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  await renderPlan(page, { age: 12, months: 0, sex: 'M', weight: 70, height: 150 });
  const out = await page.evaluate(() => {
    // Ścieżka produkcyjna wczytania zapisu (pacjent/JSON/sesja): applyLoadedData
    // z plan.palFactor oznacza wartość jako świadomą (touched) i ustawia select.
    window.VildaDataImportExport.applyLoadedData({
      version: 1,
      name: 'Testowy Pacjent',
      user: { age: 12, ageMonths: 0, sex: 'M', weight: 70, height: 150 },
      plan: { palFactor: 1.4, dietLevel: null },
    });
    // Dopewnij pola antropometryczne (payload testowy jest minimalny), potem przelicz.
    const set = (id, v) => { const el = document.getElementById(id); if (el && !el.value) el.value = String(v); };
    set('age', 12); set('weight', 70); set('height', 150);
    window.update();
    return {
      pal: document.getElementById('palFactor').value,
      touched: window.__vildaPlanPalTouched === true,
    };
  });
  expect(out.touched).toBe(true);
  expect(out.pal).toBe('1.4');
});
