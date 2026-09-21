import { expect, test } from '@playwright/test';

// P-DIETA-NIEDOWAGA (rata A, 2026-09-21) — gałąź dziecięca generatora zaleceń przestaje być binarna.
//
// Po co: gałąź miała tylko „nadmiar" i „w normie". Dziecku z BMI poniżej 5. centyla (nawet z-score −4)
// mówiła „Masa ciała dziecka mieści się w granicach normy", a potem dawała listę restrykcyjną dla
// otyłości („ograniczać tłuste potrawy, żółty ser…"). Dziecko w normie dostawało tę samą listę i
// `strategia: 'reduction'`. Te testy pilnują trzech rzeczy:
//  1. niedowaga jest nazwana po imieniu, z progu SILNIKA BMI (5. centyl), a nie z kopii progu;
//  2. lista restrykcyjna pojawia się WYŁĄCZNIE przy nadmiarze;
//  3. dla nadmiaru i dla dorosłych nic się nie zmienia.
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

function policz(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true; window.__vildaPlanPalTouched = false; window.__vildaDietStrategyTouched = false;
    // masa z centyla BMI silnika — test nie zgaduje kilogramów, tylko celuje w pasmo
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
    return { w, text: r.textOutput || '', zdania: d.zdania || {}, strategia: d.strategia, nadmiar: !!k.nadmiar, niedowaga: !!k.niedowaga,
      kat: k.klasaBmi && k.klasaBmi.categoryKey, centyl: k.klasaBmi && k.klasaBmi.percentile, docelowaKg: d.masa && d.masa.docelowaKg };
  }, s);
}

// „słone przekąski" celowo w kontekście listy otyłości: łagodny talerz nastolatka w normie (rata B) też
// wspomina słone przekąski, ale jako „okazjonalny dodatek", nie jako restrykcję.
const RESTRYKCJE = ['ograniczać tłuste potrawy', 'żółty ser', 'słone przekąski oraz fast', 'słone przekąski i fast', 'fast\u2011foody', 'Ogranicz fast foody'];

test('niedowaga u dziecka jest nazwana, a nie schowana pod „w normie" — oba rejestry, trzy pasma wieku', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  for (const s of [
    { age: 8, sex: 'F', h: 128, w: 18 },                 // z ≈ −4,3 — daleko poniżej 1. centyla
    { age: 8, sex: 'F', h: 128, w: 18, pf: true },
    { age: 14, sex: 'F', h: 160, w: 35 },                // nastolatka, z ≈ −3,2
    { age: 14, sex: 'F', h: 160, w: 35, pf: true },
    { age: 3, sex: 'F', h: 100, w: 12 },                 // 2–4 lata
    { age: 8, sex: 'F', h: 128, centyl: 4 }              // pasmo 3–5 c.: jeszcze niedowaga wg progu silnika
  ]) {
    const w = await policz(page, s);
    const t = norm(w.text);
    expect(w.kat, JSON.stringify(s)).toBe('niedowaga');
    expect(w.niedowaga, JSON.stringify(s)).toBe(true);
    expect(w.nadmiar).toBe(false);
    expect(t).not.toContain('w granicach normy');
    expect(t).toContain('niedowag');
    // zdanie klasyfikacji niesie BMI i z-score, jak zdanie o nadwadze
    expect(t).toMatch(/BMI( dziecka)?( wynosi)? \d+,\d kg\/m²/);
    expect(t).toMatch(/z-score −\d,\d\d/);
    // żadnej restrykcji dla dziecka z niedowagą
    for (const r of RESTRYKCJE) expect(t, 'restrykcja u dziecka z niedowagą: ' + r).not.toContain(r);
    // P-DIETA-PRZYROST rata D: talerz „przyrostowy” od 5 lat; P-DIETA-MALUCH rata E: także 2–4 lata (nie należy ograniczać grup produktów)
    expect(norm(w.zdania.talerz.join(' ')), JSON.stringify(s)).toMatch(/nie należy ograniczać jakichkolwiek grup produktów|nie ograniczaj jedzenia|Nie należy ograniczać żadnych grup produktów/u);
    // rola kontroli mówi wprost: nie ograniczać, ocenić przyczyny
    expect(w.zdania.kontrola, JSON.stringify(s)).toBeDefined();
    const k0 = norm(w.zdania.kontrola[0]);
    if (/ryzyka zaburzeń odżywiania|szybka wizyta u lekarza/.test(k0)) {
      // P-DIETA-AUDYT rata F: przy cechach ryzyka ZO (nastolatka 14 lat, z ≈ −3,2) zdanie o nadzorze zastępuje kontrolę A
      expect(k0).toMatch(/nie ograniczaj|nie zaleca się ograniczania/i);
      expect(k0).toMatch(/lekarz/);
    } else {
      expect(k0).toMatch(/nie ogranicza|nie zaleca się ograniczania/);
      expect(k0).toMatch(/przyczyn/);
    }
    // ruch zostaje (zalecenie uniwersalne), bez deficytu, bez celu redukcji; strategia „przyrost” (rata D; do niej: null)
    expect(w.zdania.ruch).toBeDefined();
    expect(w.strategia).toBe('przyrost');
    expect(w.docelowaKg).toBeNull();
  }
});

test('pasmo 3–5 c. formatuje centyl z jednym miejscem po przecinku, a <0,5 c. słowami', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const p4 = await policz(page, { age: 8, sex: 'F', h: 128, centyl: 4 });
  expect(p4.centyl).toBeGreaterThan(3); expect(p4.centyl).toBeLessThan(5);
  expect(norm(p4.text)).toMatch(/ok\. \d\. centyl dla wieku i płci|centyl ok\. \d,\d dla wieku i płci/);
  const glebokie = await policz(page, { age: 8, sex: 'F', h: 128, w: 18 });
  expect(norm(glebokie.text)).toContain('poniżej 1. centyla dla wieku i płci');
  // dziecko poniżej 10 lat dostaje przedmowę o ocenie pediatrycznej, nie „plan z nadwagą"
  expect(norm(glebokie.text)).toContain('z niedowagą wymaga oceny pediatrycznej');
  expect(norm(glebokie.text)).not.toContain('z nadwagą lub otyłością wymaga konsultacji');
});

test('dziecko w normie: bez listy restrykcyjnej, bez strategii redukcji, ruch zostaje, talerz lagodny (rata B)', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  for (const s of [
    { age: 8, sex: 'F', h: 128, w: 25 },
    { age: 8, sex: 'F', h: 128, w: 25, pf: true },
    { age: 12, sex: 'F', h: 150, w: 40 },
    { age: 3, sex: 'F', h: 100, w: 15.5 },
    { age: 8, sex: 'F', h: 128, centyl: 6 }              // tuż nad progiem: to już norma, nie niedowaga
  ]) {
    const w = await policz(page, s);
    const t = norm(w.text);
    expect(w.kat, JSON.stringify(s)).toBe('prawidlowe');
    expect(w.niedowaga).toBe(false); expect(w.nadmiar).toBe(false);
    expect(t).toContain('w granicach normy');
    for (const r of RESTRYKCJE) expect(t, 'restrykcja u dziecka w normie: ' + r).not.toContain(r);
    // P-DIETA-UTRZYMANIE rata B: norma od 5 lat dostaje lagodny „talerz" (bez restrykcji); P-DIETA-MALUCH
    // rata E: 2–4 lata talerz malego dziecka; kontroli nadal nie ma, strategia to „utrzymanie" zamiast null.
    expect(w.zdania.talerz, JSON.stringify(s)).toBeDefined();
    for (const r of RESTRYKCJE) expect(norm(w.zdania.talerz.join(' '))).not.toContain(r);
    if (s.age < 5) expect(norm(w.zdania.talerz.join(' '))).toMatch(/^Zalecane są 4–5 posiłków dziennie o stałych porach/u);
    expect(w.zdania.kontrola).toBeUndefined();
    expect(w.zdania.ruch).toBeDefined();
    expect(w.strategia).toBe('utrzymanie');
  }
});

test('kontrola ujemna: nadmiar u dziecka i dorośli — bez zmian', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const nad = await policz(page, { age: 14, months: 6, sex: 'F', h: 150, w: 75 });
  expect(nad.nadmiar).toBe(true);
  expect(nad.strategia).toBe('reduction');
  expect(nad.zdania.talerz).toBeDefined();
  expect(norm(nad.zdania.talerz[0])).toContain('ograniczać');
  expect(nad.zdania.kontrola).toBeDefined();
  expect(nad.docelowaKg).toBeGreaterThan(0);

  const maly = await policz(page, { age: 3, sex: 'F', h: 100, w: 22 });
  expect(maly.nadmiar).toBe(true);
  expect(maly.strategia).toBe('stabilization');
  expect(norm(maly.text)).toContain('z nadwagą lub otyłością wymaga konsultacji');

  const doroslaNiedowaga = await policz(page, { age: 28, sex: 'F', h: 168, w: 44 });
  expect(doroslaNiedowaga.niedowaga).toBe(true);
  expect(norm(doroslaNiedowaga.text)).toContain('Niedowaga wymaga oceny przyczyn klinicznych');
  const doroslyNorma = await policz(page, { age: 30, sex: 'M', h: 180, w: 72 });
  expect(norm(doroslyNorma.text)).toContain('mieści się w zakresie prawidłowym');
});
