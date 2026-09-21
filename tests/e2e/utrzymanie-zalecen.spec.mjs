import { expect, test } from '@playwright/test';

// P-DIETA-UTRZYMANIE (rata B, 2026-09-21) — moduł „Zalecenia dietetyczne" otwiera się dla pacjenta
// z BMI w normie, a generator daje mu strategię „utrzymanie" z własnym, ŁAGODNYM zestawem zdań.
//
// Po co: do raty A bramka chowała moduł przy prawidłowym BMI, a generator dla normy pisał tylko
// „w granicach normy" (dziecko) albo listę otyłości (dorosły w górnej normie). Decyzje właściciela:
//  - dorosły w normie: talerz „utrzymaniowy" + OSOBNE zdanie o alkoholu (kaloryczny, ale przede
//    wszystkim szkodliwy; brak bezpiecznej ilości) + ruch 150 min; bez „kontroli";
//  - nastolatek (≥ 11 lat) w normie: talerz + zdanie o płatkach „crunchy" (syrop glukozowo-
//    -fruktozowy) z ogonem o płatkach naturalnych; bez alkoholu;
//  - dziecko 5–10 lat w normie: talerz „w spokojnej atmosferze" bez zmuszania do dojadania,
//    bez płatków, bez alkoholu, bez przedmowy „plan ma charakter poglądowy";
//  - 2–4 lata: bez talerza (rata E), strategia „utrzymanie" zostaje;
//  - bramka: przycisk widoczny dla normy (dorosły ≥ 18,5; dziecko ≥ P5) i nadmiaru, ukryty przy
//    niedowadze (do raty D) i do 5. roku życia (do raty E); karta wyboru strategii
//    (redukcja/stabilizacja) TYLKO przy nadmiarze.
// Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function');
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.VildaDietRecommendations.generateRecommendations === 'function'));
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportFormatIssueList === 'function');
}

const norm = (v) => String(v == null ? '' : v).replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
const zl = (w, rola) => norm((w.zdania[rola] || []).join(' '));

function policz(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true; window.__vildaPlanPalTouched = false; window.__vildaDietStrategyTouched = false;
    let w = s.w;
    if (s.centyl != null) {
      const q = window.VildaBmi.wartoscDlaCentyla({ centyl: s.centyl, plec: s.sex, wiekMies: (s.age + (s.months || 0) / 12) * 12, zrodlo: 'OLAF' });
      w = Math.round(q.bmi * Math.pow(s.h / 100, 2) * 10) / 10;
    }
    set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', w); set('height', s.h);
    window.ensureDietRecommendationsElements();
    flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', false);
    flag('nutritionNormsFlag', true); flag('journeyFlag', true); flag('vitDSuppFlag', true); flag('hydrationFlag', true);
    flag('patientFacingToggle', !!s.pf);
    window.update();
    await new Promise((res) => { setTimeout(res, 140); });
    const r = window.VildaDietRecommendations.generateRecommendations();
    const d = r.dane || {};
    const k = d.klasyfikacja || {};
    const btn = document.getElementById('dietRecommendationsBtn');
    const proxy = document.querySelector('[data-diet-strategy-proxy]');
    const karta = proxy && proxy.closest('.diet-energy-control-card');
    return {
      w, text: r.textOutput || '', zdania: d.zdania || {}, punkty: d.punkty || {}, strategia: d.strategia,
      nadmiar: !!k.nadmiar, niedowaga: !!k.niedowaga, kat: k.klasaBmi && k.klasaBmi.categoryKey,
      utrzymanieKcal: d.energia ? d.energia.utrzymanieKcal : undefined,
      docelowaKg: d.masa && d.masa.docelowaKg,
      przycisk: !!btn && btn.style.display !== 'none',
      kartaStrategii: !!karta && karta.style.display !== 'none'
    };
  }, s);
}

const RESTRYKCJE = ['ograniczać tłuste potrawy', 'żółty ser', 'Ogranicz fast foody', 'ograniczyć słodkie napoje, alkohol'];
const ALKOHOL = /alkohol (jest kaloryczny|też ma kalorie), ale przede wszystkim szkod/iu;
const PLATKI = /granole i musli typu „crunchy”.*syrop glukozowo-fruktozowy.*płatki naturalne bez dodatku cukru/iu;
const PRZEDMOWA = /charakter poglądowy/u;

test('dorosły w normie: talerz utrzymaniowy, osobne zdanie o alkoholu, ruch, bez kontroli — oba rejestry', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  for (const s of [
    { age: 30, sex: 'M', h: 180, w: 72 },
    { age: 30, sex: 'M', h: 180, w: 72, pf: true },
    { age: 45, sex: 'F', h: 165, w: 51 },                 // BMI 18,7 — tuż nad dolną granicą normy
    { age: 24, sex: 'F', h: 170, w: 65.5 }                // BMI 22,7 — poniżej górnej normy (23,0)
  ]) {
    const w = await policz(page, s);
    const t = norm(w.text);
    expect(w.nadmiar, JSON.stringify(s)).toBe(false); expect(w.niedowaga).toBe(false);
    expect(w.strategia, JSON.stringify(s)).toBe('utrzymanie');
    expect(w.docelowaKg).toBeNull();
    expect(t).toContain('mieści się w zakresie prawidłowym');
    expect(t).toMatch(/deficytu energetycznego/u);
    expect(Object.keys(w.zdania).sort()).toEqual(['ruch', 'talerz']);
    expect(w.zdania.talerz).toHaveLength(2);
    expect(zl(w, 'talerz')).toMatch(/regularn/u);
    expect(zl(w, 'talerz')).toMatch(/woda|wodą/u);
    expect(zl(w, 'talerz')).toMatch(ALKOHOL);
    expect(zl(w, 'talerz')).toMatch(/ryzyko nowotworów/u);
    expect(zl(w, 'talerz')).toMatch(/nie ma bezpiecznej ilości/u);
    expect(zl(w, 'talerz')).not.toMatch(PLATKI);
    expect(zl(w, 'ruch')).toContain('150 minut');
    for (const r of RESTRYKCJE) expect(t, 'restrykcja u dorosłego w normie: ' + r).not.toContain(r);
    expect(t).not.toMatch(PRZEDMOWA);
    // każde zdanie roli jest DOSŁOWNIE w tekście
    for (const rola of Object.keys(w.zdania)) for (const zd of w.zdania[rola]) expect(t).toContain(norm(zd));
    // punkty raportu: talerz i ruch mają wersję punktową
    expect(Array.isArray(w.punkty.talerz) && w.punkty.talerz.length >= 4).toBe(true);
    expect(Array.isArray(w.punkty.ruch) && w.punkty.ruch.length >= 1).toBe(true);
    if (s.pf) expect(zl(w, 'talerz')).toMatch(/^Proszę jeść regularnie/u);
    else expect(zl(w, 'talerz')).toMatch(/^Warto opierać jadłospis/u);
  }
});

test('nastolatek w normie (11–17 lat): talerz + płatki „crunchy", bez alkoholu, bez kontroli — oba rejestry', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  for (const s of [
    { age: 12, sex: 'F', h: 150, w: 40 },
    { age: 12, sex: 'F', h: 150, w: 40, pf: true },
    { age: 17, sex: 'M', h: 178, w: 68 },
    { age: 11, sex: 'M', h: 145, centyl: 50 }
  ]) {
    const w = await policz(page, s);
    const t = norm(w.text);
    expect(w.kat, JSON.stringify(s)).toBe('prawidlowe');
    expect(w.strategia).toBe('utrzymanie');
    expect(w.utrzymanieKcal).toBeGreaterThan(1000);
    expect(t).toContain('w granicach normy');
    expect(Object.keys(w.zdania).sort()).toEqual(['ruch', 'talerz']);
    expect(w.zdania.talerz).toHaveLength(2);
    expect(zl(w, 'talerz')).toMatch(/śniadani/u);
    expect(zl(w, 'talerz')).toMatch(PLATKI);
    expect(zl(w, 'talerz')).not.toMatch(/alkohol/iu);
    expect(zl(w, 'ruch')).toContain('60 minut');
    for (const r of RESTRYKCJE) expect(t, 'restrykcja u nastolatka w normie: ' + r).not.toContain(r);
    expect(t).not.toMatch(PRZEDMOWA);
    for (const rola of Object.keys(w.zdania)) for (const zd of w.zdania[rola]) expect(t).toContain(norm(zd));
    if (s.pf) expect(zl(w, 'talerz')).toMatch(/^Jedz regularnie, ze śniadaniem/u);
    else expect(zl(w, 'talerz')).toMatch(/^Zalecane są regularne posiłki \(w tym śniadanie\)/u);
  }
});

test('dziecko 5–10 lat w normie: talerz w spokojnej atmosferze, bez płatków, alkoholu, przedmowy; 2–4 lata bez talerza', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  for (const s of [
    { age: 8, sex: 'F', h: 128, w: 25 },
    { age: 8, sex: 'F', h: 128, w: 25, pf: true },
    { age: 5, months: 6, sex: 'M', h: 112, w: 19 },
    { age: 10, months: 11, sex: 'M', h: 142, centyl: 50 }   // ostatni miesiąc przed pasmem nastolatka
  ]) {
    const w = await policz(page, s);
    const t = norm(w.text);
    expect(w.kat, JSON.stringify(s)).toBe('prawidlowe');
    expect(w.strategia).toBe('utrzymanie');
    expect(w.utrzymanieKcal).toBeGreaterThan(800);
    expect(Object.keys(w.zdania).sort()).toEqual(['ruch', 'talerz']);
    expect(w.zdania.talerz).toHaveLength(1);
    expect(zl(w, 'talerz')).toMatch(/spokojnej atmosferze/u);
    expect(zl(w, 'talerz')).toMatch(/woda lub mleko/u);
    expect(zl(w, 'talerz')).not.toMatch(/dojadani/u);
    expect(zl(w, 'talerz')).not.toMatch(/crunchy|alkohol/iu);
    expect(zl(w, 'ruch')).toContain('60 minut');
    for (const r of RESTRYKCJE) expect(t, 'restrykcja u dziecka w normie: ' + r).not.toContain(r);
    expect(t).not.toMatch(PRZEDMOWA);
    expect(t).not.toMatch(/wymaga konsultacji/u);
    for (const rola of Object.keys(w.zdania)) for (const zd of w.zdania[rola]) expect(t).toContain(norm(zd));
    if (s.pf) expect(zl(w, 'talerz')).toMatch(/^Proszę podawać dziecku regularne posiłki/u);
  }
  // 2–4 lata: strategia „utrzymanie", ruch WHO 180 minut, ale talerz dopiero w racie E
  const maly = await policz(page, { age: 3, sex: 'F', h: 100, w: 15.5 });
  expect(maly.kat).toBe('prawidlowe');
  expect(maly.strategia).toBe('utrzymanie');
  expect(maly.zdania.talerz).toBeUndefined();
  expect(zl(maly, 'ruch')).toContain('180 minut');
});

test('kontrole ujemne: nadmiar, górna norma i niedowaga bez zdań normy; alkohol tylko u dorosłego w normie', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const otyly = await policz(page, { age: 42, sex: 'M', h: 178, w: 108 });
  expect(otyly.strategia).toBe('reduction');
  expect(Object.keys(otyly.zdania).sort()).toEqual(['kontrola', 'ruch', 'talerz']);
  expect(zl(otyly, 'talerz')).not.toMatch(ALKOHOL);
  expect(norm(otyly.text)).not.toMatch(/ryzyko nowotworów/u);

  const gornaNorma = await policz(page, { age: 35, sex: 'F', h: 164, w: 66 });
  expect(gornaNorma.strategia).toBe('utrzymanie');
  expect(norm(gornaNorma.text)).toContain('blisko jego górnej granicy');
  expect(zl(gornaNorma, 'talerz')).toMatch(/^Warto uporządkować regularność posiłków/u);
  expect(zl(gornaNorma, 'talerz')).not.toMatch(ALKOHOL);

  // P-DIETA-PRZYROST rata D: niedowaga ma własną strategię „przyrost” (do raty D: null)
  const niedowaga = await policz(page, { age: 28, sex: 'F', h: 168, w: 44 });
  expect(niedowaga.niedowaga).toBe(true);
  expect(niedowaga.strategia).toBe('przyrost');
  expect(zl(niedowaga, 'talerz')).not.toMatch(ALKOHOL);
  expect(zl(niedowaga, 'kontrola')).toContain('Niedowaga wymaga oceny przyczyn klinicznych');

  const nastoOtyly = await policz(page, { age: 16, sex: 'M', h: 176, w: 82 });
  expect(nastoOtyly.nadmiar).toBe(true);
  expect(norm(nastoOtyly.text)).not.toMatch(/crunchy/u);
  expect(zl(nastoOtyly, 'talerz')).toContain('ograniczać');

  const dzieckoNiedowaga = await policz(page, { age: 8, sex: 'F', h: 128, w: 18 });
  expect(dzieckoNiedowaga.niedowaga).toBe(true);
  expect(dzieckoNiedowaga.strategia).toBe('przyrost');
  // talerz niedowagi (rata D), nie talerz normy z raty B
  expect(zl(dzieckoNiedowaga, 'talerz')).not.toMatch(/porcjach dopasowanych do wieku i apetytu/u);
  expect(zl(dzieckoNiedowaga, 'talerz')).toMatch(/bez presji przy jedzeniu/u);
});

test('bramka: przycisk dla normy, nadmiaru i niedowagi (rata D), ukryty do 5 lat; karta strategii tylko przy nadmiarze', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const oczekiwania = [
    [{ age: 30, sex: 'M', h: 180, w: 72 }, { przycisk: true, kartaStrategii: false }],   // dorosły w normie
    [{ age: 45, sex: 'F', h: 165, w: 50.4 }, { przycisk: true, kartaStrategii: false }], // BMI 18,51 — na progu normy
    [{ age: 45, sex: 'F', h: 165, w: 50.2 }, { przycisk: true, kartaStrategii: false }],  // BMI 18,44 — niedowaga (od raty D otwarta)
    [{ age: 42, sex: 'M', h: 178, w: 108 }, { przycisk: true, kartaStrategii: true }],   // otyłość
    [{ age: 35, sex: 'F', h: 165, w: 70 }, { przycisk: true, kartaStrategii: true }],    // BMI 25,7 — nadwaga
    [{ age: 8, sex: 'F', h: 128, w: 25 }, { przycisk: true, kartaStrategii: false }],    // dziecko w normie
    [{ age: 8, sex: 'F', h: 128, centyl: 6 }, { przycisk: true, kartaStrategii: false }], // tuż nad P5
    [{ age: 8, sex: 'F', h: 128, centyl: 4 }, { przycisk: true, kartaStrategii: false }],  // tuż pod P5 (od raty D otwarta)
    [{ age: 8, sex: 'F', h: 130, w: 40 }, { przycisk: true, kartaStrategii: true }],     // dziecko z otyłością
    [{ age: 14, months: 6, sex: 'F', h: 150, w: 75 }, { przycisk: true, kartaStrategii: true }],
    [{ age: 17, sex: 'M', h: 178, w: 68 }, { przycisk: true, kartaStrategii: false }],   // nastolatek w normie
    [{ age: 4, months: 11, sex: 'F', h: 108, w: 18 }, { przycisk: false, kartaStrategii: false }], // < 5 lat: rata E
    [{ age: 5, months: 1, sex: 'F', h: 110, w: 18.5 }, { przycisk: true, kartaStrategii: false }]  // > 5,0 lat
  ];
  for (const [s, exp] of oczekiwania) {
    const w = await policz(page, s);
    expect({ przycisk: w.przycisk, kartaStrategii: w.kartaStrategii }, JSON.stringify(s) + ' BMI≈' + (w.w / Math.pow(s.h / 100, 2)).toFixed(2)).toEqual(exp);
  }
  // przycisk znika, gdy karta jest wyłączona w widoczności kart — bramka nadal szanuje preferencję
  const wyl = await page.evaluate(async () => {
    const p = window.VildaPersistence;
    const prev = p.readPreferenceJSON('CARD_VISIBILITY', {});
    p.writePreferenceJSON('CARD_VISIBILITY', Object.assign({}, prev, { dietRecommendationsBtn: false }));
    window.update();
    await new Promise((res) => { setTimeout(res, 140); });
    const btn = document.getElementById('dietRecommendationsBtn');
    const r = !!btn && btn.style.display !== 'none';
    p.writePreferenceJSON('CARD_VISIBILITY', prev);
    return r;
  });
  expect(wyl).toBe(false);
});
