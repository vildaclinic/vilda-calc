import { expect, test } from '@playwright/test';

// P-RAPORT rata T3 (decyzje właściciela 2026-09-24): obniżenie pozycji wzrostu na siatce (flaga w dół silnika trajektorii:
// ΔhSDS ≤ −1,0 od pierwszego pomiaru ≥ 36 mies. na tej samej siatce) w nagłówku „Raportu po wizycie” (D0–D3) oraz baza
// flagi lekarza od 36 mies. PRAWDZIWA strona (index i docpro), wiersze historii dodawane przyciskiem karty. Dane FIKCYJNE.

const NB = '\u00A0';

async function otworz(page, strona) {
  await page.goto(`/${strona || 'index.html'}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.patientReportBuildModel === 'function'
    && !!window.VildaRaportNaglowek && window.VildaRaportNaglowek.WERSJA >= 5 && !!window.VildaTrajectoryAnalysis);
}

// s: { age, months, sex, w, h (cm) albo hc (centyl), mo, fa, pro, historia: [{ age, months, hc|h, w }] }
async function model(page, s) {
  return page.evaluate(async (s) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const tgl = document.getElementById('resultsModeToggle');
    const ustawTryb = (pro) => { if (tgl && tgl.checked !== pro) { tgl.checked = pro; tgl.dispatchEvent(new Event('change', { bubbles: true })); } };
    ustawTryb(true); // wiersze historii wpisujemy w trybie profesjonalnym (karta zaawansowana)
    window.intakeHistory = null; window.lastLoadedData = null; window.hasUserModifiedAfterLoad = false;
    ['bpSystolic', 'bpDiastolic', 'heartRate', 'respRate', 'waistCm', 'hipCm', 'headCircumference', 'chestCircumference', 'customGoalKg'].forEach((id) => set(id, ''));
    document.querySelectorAll('#advMeasurements .measure-row .remove-measure').forEach((b) => b.click());
    set('name', 'Testowy Fikcyjny'); set('sex', s.sex); set('age', s.age); set('ageMonths', s.months || 0);
    set('weight', ''); set('height', ''); window.update();
    const wiek = s.age + (s.months || 0) / 12;
    const przyCentylu = (ageY, pc) => Math.round(window.patientReportGetMetricValueAtPercentile('HT', s.sex, ageY, pc) * 10) / 10;
    const h = s.h != null ? s.h : przyCentylu(wiek, s.hc);
    set('weight', s.w); set('height', h);
    set('advMotherHeight', s.mo == null ? '' : s.mo); set('advFatherHeight', s.fa == null ? '' : s.fa);
    const wiersze = [];
    for (const r of s.historia || []) {
      const btn = document.getElementById('advAddMeasurementBtn'); if (btn) btn.click();
      const rows = document.querySelectorAll('#advMeasurements .measure-row');
      const w = rows[rows.length - 1];
      const ageY = r.age + (r.months || 0) / 12;
      const hh = r.h != null ? r.h : przyCentylu(ageY, r.hc);
      const wpisz = (sel, v) => { const el = w.querySelector(sel); if (!el) return; el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
      wpisz('.adv-age-years', r.age); wpisz('.adv-age-months', r.months || 0); wpisz('.adv-height', hh); wpisz('.adv-weight', r.w);
      wiersze.push({ age: r.age, months: r.months || 0, h: hh });
    }
    if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced();
    if (s.pro === false) ustawTryb(false);
    window.update();
    await new Promise((r) => { setTimeout(r, 500); });
    const m = window.patientReportBuildModel();
    const TA = window.VildaTrajectoryAnalysis;
    const rf = TA && typeof TA.heightRedFlagOf === 'function' ? TA.heightRedFlagOf(window.advancedGrowthTrajectory || null) : 'brak';
    return { rf, h, wiersze, proLeksykalny: typeof professionalMode !== 'undefined' ? professionalMode : null, hl: m.headline, podsumowanie: (m.summaryLines || []).filter((l) => /mpSDS|MPH|hSDS/.test(String(l))) };
  }, s);
}

const D8 = { age: 8, months: 0, sex: 'F', w: 24, hc: 12, historia: [{ age: 4, months: 0, hc: 50, w: 16 }, { age: 6, months: 0, hc: 42, w: 20 }] };

test.describe('P-RAPORT rata T3 — obniżenie pozycji wzrostu na siatce', () => {
  test('RT3-1 (D1): dziewczynka 8 lat, 4 l. na 50. c → dziś 12. c, BMI prawidłowe — żółte, własna oś, liczba SDS w trybie profesjonalnym', async ({ page }) => {
    await otworz(page);
    const r = await model(page, D8);
    expect(r.rf).toMatchObject({ baseAgeMonths: 48, lastAgeMonths: 96 });
    expect(r.hl.badge).toBe('Obniżenie pozycji na siatce'); expect(r.hl.tone).toBe('warn');
    expect(r.hl.title).toMatch(new RegExp(`^Od pomiaru z wieku 4 lat pozycja wzrostu na siatce obniżyła się z 50\\. na 1[12]\\. centyl \\(o −1,\\d\\d${NB}SDS\\)\\.$`));
    expect(r.hl.text).toBe('Taki wynik ocenia się razem z tempem wzrastania, masą ciała i wiekiem kostnym.');
  });

  test('RT3-2 (D1, tryb standardowy): to samo zdanie bez liczby SDS', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { ...D8, pro: false });
    expect(r.proLeksykalny).toBe(false);
    expect(r.hl.title).toMatch(/^Od pomiaru z wieku 4 lat pozycja wzrostu na siatce obniżyła się z 50\. na 1[12]\. centyl\.$/);
    expect(r.hl.title).not.toMatch(/SDS/);
  });

  test('RT3-3 (D1+): ta sama dziewczynka z nadwagą wg BMI — ciężkość 2, zdanie o przyczynach hormonalnych', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { ...D8, w: 31 });
    const zd = 'przy nadmiarze masy ciała wymaga';
    expect(r.hl.title + ' ' + r.hl.text).toMatch(/obniżyła się z 50\. na 1[12]\. centyl/);
    expect(r.hl.title + ' ' + r.hl.text).toContain(zd);
    expect(r.hl.title + ' ' + r.hl.text).toMatch(/m\.in\. w kierunku przyczyn hormonalnych/);
    expect(r.hl.tone).toBe('danger');
  });

  test('RT3-4 (D2): chłopiec 8 lat na 2. c, od 3 lat z 25. c, rodzice przeciętni — jedno zdanie o wzroście, „Niski wzrost — do oceny”', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { age: 8, months: 0, sex: 'M', w: 22.7, hc: 2, mo: 170, fa: 182, historia: [{ age: 3, months: 0, hc: 25, w: 14 }, { age: 5, months: 0, hc: 15, w: 17 }, { age: 7, months: 0, hc: 5, w: 20 }] });
    expect(r.hl.badge).toBe('Niski wzrost — do oceny'); expect(r.hl.tone).toBe('danger');
    expect(r.hl.title).toMatch(/^Wzrost jest wyraźnie niski jak na wiek: /);
    expect(r.hl.text).toMatch(/^Wzrost jest wyraźnie niższy, niż wynika ze wzrostu rodziców \(.*\), a od pomiaru z wieku 3 lat pozycja wzrostu na siatce obniżyła się z 25\. na 2\. centyl \(o −1,\d\d\u00A0SDS\)\. Taki wynik wymaga dalszej oceny: tempa wzrastania, wieku kostnego i przyczyn niskiego wzrostu\./);
    expect((r.hl.text.match(/obniżyła się/g) || []).length).toBe(1);
  });

  test('RT3-5 (D0): chłopiec 8 lat, 3 l. na 97. c → dziś 72. c, cel rodziców ok. 50. c — flaga lekarza jest, nagłówek bez faktu', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { age: 8, months: 0, sex: 'M', w: 29, hc: 72, mo: 163, fa: 176, historia: [{ age: 3, months: 0, hc: 97, w: 16 }, { age: 5, months: 0, hc: 90, w: 21 }] });
    expect(r.rf).toMatchObject({ baseAgeMonths: 36 });
    expect(r.hl.title + ' ' + r.hl.text).not.toMatch(/obniżyła się/);
  });

  test('RT3-6 (silnik): powrót na niższy kanał w 2.–3. r.ż. nie daje flagi — baza od 36 mies.', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { age: 5, months: 0, sex: 'F', w: 18.5, hc: 55, historia: [{ age: 2, months: 0, hc: 90, w: 12.5 }, { age: 2, months: 6, hc: 80, w: 13.5 }, { age: 3, months: 0, hc: 70, w: 14.5 }] });
    expect(r.rf).toBeNull();
    expect(r.hl.title + ' ' + r.hl.text).not.toMatch(/obniżyła się/);
  });

  test('RT3-7 (D3): chłopiec 13 lat, 3 l. na 50. c → dziś 15. c — żółte, odniesienie do etapu dojrzewania', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { age: 13, months: 0, sex: 'M', w: 42.8, hc: 15, historia: [{ age: 3, months: 0, hc: 50, w: 14.5 }, { age: 6, months: 0, hc: 50, w: 21 }, { age: 10, months: 0, hc: 45, w: 32 }, { age: 12, months: 0, hc: 25, w: 38 }] });
    const t = r.hl.title + ' ' + r.hl.text;
    expect(t).toMatch(/od pomiaru z wieku 3 lat pozycja wzrostu na siatce obniżyła się z 50\. na 1[45]\. centyl/i);
    expect(t).toMatch(/etapu dojrzewania i wieku kostnego/);
    expect(r.hl.tone).toBe('warn');
  });

  test('RT3-8: docpro — ten sam nagłówek D1 co index', async ({ page }) => {
    await otworz(page, 'docpro.html');
    const r = await model(page, D8);
    expect(r.hl.badge).toBe('Obniżenie pozycji na siatce');
    expect(r.hl.title).toMatch(/^Od pomiaru z wieku 4 lat pozycja wzrostu na siatce obniżyła się z 50\. na 1[12]\. centyl/);
  });
});
