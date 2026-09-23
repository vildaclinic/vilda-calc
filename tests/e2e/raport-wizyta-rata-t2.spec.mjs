import { expect, test } from '@playwright/test';

// P-RAPORT rata T2 (decyzje właściciela 2026-09-23): fakt o przesunięciu pozycji wzrostu w górę siatki (flaga w górę
// silnika trajektorii: ΔhSDS ≥ +1,0 od pierwszego pomiaru ≥ 36 mies., niedawna) w nagłówku „Raportu po wizycie”
// (A1–A4) oraz symetria dla niskiego wzrostu (N0–N3: MPH w zdaniu, oś mph wchłonięta, podtytuł bez powtórki).
// PRAWDZIWA strona (index i docpro), wiersze historii dodawane przyciskiem karty jak przez lekarza. Dane FIKCYJNE.

const NB = ' ';

async function otworz(page, strona) {
  await page.goto(`/${strona || 'index.html'}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.patientReportBuildModel === 'function'
    && !!window.VildaRaportNaglowek && window.VildaRaportNaglowek.WERSJA >= 4 && !!window.VildaTrajectoryAnalysis);
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
    return { h, wiersze, proLeksykalny: typeof professionalMode !== 'undefined' ? professionalMode : null, hl: m.headline, podsumowanie: (m.summaryLines || []).filter((l) => /mpSDS|MPH|hSDS/.test(String(l))) };
  }, s);
}

const SZESC = { age: 6, months: 2, sex: 'M', w: 24, hc: 98.3 };
const WYSOCY = { mo: 178, fa: 193 };

test.describe('P-RAPORT rata T2 — przesunięcie w górę siatki i niski wzrost wobec rodziców', () => {
  test('RT2-1 (A1): 6 lat 2 mies., 98 c, rodzice wysocy, historia 3 lat 2 mies. na 50. c — koniec uspokojenia, jedno zdanie o wzroście', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { ...SZESC, ...WYSOCY, historia: [{ age: 3, months: 2, hc: 50, w: 14 }] });
    expect(r.proLeksykalny).toBe(true);
    expect(r.hl.badge).toBe('Wysoki wzrost — do oceny'); expect(r.hl.tone).toBe('danger');
    expect(r.hl.title).toMatch(new RegExp(`^Wzrost jest wysoki jak na wiek: ${r.h.toFixed(1).replace('.', ',')}${NB}cm, 9[89]\\. centyl — od pomiaru z wieku 3 lat 2 mies\\. przesunął się w górę siatki\\.$`));
    expect(r.hl.text).toMatch(new RegExp(`^Wzrost jest zgodny ze wzrostem rodziców \\(wzrost docelowy wg rodziców 192,0${NB}cm, 9\\d\\. centyl dorosłych\\), ale od pomiaru z wieku 3 lat 2 mies\\. pozycja wzrostu na siatce podniosła się z 50\\. na 9[89]\\. centyl \\(o \\+(\\d,\\d\\d)${NB}SDS\\)\\. Taki wynik wymaga dalszej oceny, m\\.in\\. w kierunku przedwczesnego dojrzewania`));
    const d = Number(r.hl.text.match(/o \+(\d,\d\d)/)[1].replace(',', '.'));
    expect(d).toBeGreaterThanOrEqual(1.5);
    expect(r.hl.dodatkowe).toEqual([]);
    expect((r.hl.text.match(/wzrost/gi) || []).length).toBeGreaterThan(0);
    expect(r.hl.text).not.toMatch(/Dodatkowo/);
  });

  test('RT2-2: ta sama historia na 95. c (bez przesunięcia) → W1 jak w racie T; bez historii → W1', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { ...SZESC, ...WYSOCY, historia: [{ age: 3, months: 2, hc: 95, w: 15 }] });
    expect(r.hl.badge).toBe('Wysoki wzrost'); expect(r.hl.tone).toBe('warn');
    expect(r.hl.text).toMatch(/^Wzrost jest zgodny ze wzrostem rodziców \(.*\)\. Najwięcej informacji daje porównanie z wcześniejszymi pomiarami i tempo wzrastania\.$/);
    expect(r.hl.text).not.toMatch(/podniosła/);
    await otworz(page); // świeża strona: bez wierszy historii
    const bez = await model(page, { ...SZESC, ...WYSOCY });
    expect(bez.hl.text).toMatch(/^Wzrost jest zgodny ze wzrostem rodziców \(.*\)\. Najwięcej informacji daje tempo wzrastania w kolejnych pomiarach\.$/);
  });

  test('RT2-3: konstytucjonalne przyspieszenie (skok przed 3,5 r.ż., potem stabilnie) → bez faktu', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { ...SZESC, ...WYSOCY, historia: [{ age: 2, months: 0, hc: 50, w: 12 }, { age: 3, months: 6, hc: 97, w: 15.5 }] });
    expect(r.hl.badge).toBe('Wysoki wzrost'); expect(r.hl.tone).toBe('warn');
    expect(r.hl.text + r.hl.title).not.toMatch(/podniosła|przesunął/);
  });

  test('RT2-4 (A4): dziewczynka 7 lat na 90. c, historia 3 lat 6 mies. na 50. c, bez rodziców — własna oś, żółta odznaka', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { age: 7, months: 0, sex: 'F', w: 24, hc: 90, historia: [{ age: 3, months: 6, hc: 50, w: 15 }] });
    expect(r.hl.badge).toBe('Przesunięcie w górę siatki'); expect(r.hl.tone).toBe('warn');
    expect(r.hl.title).toMatch(new RegExp(`^Od pomiaru z wieku 3 lat 6 mies\\. pozycja wzrostu na siatce podniosła się z 50\\. na 9\\d\\. centyl \\(o \\+1,\\d\\d${NB}SDS\\)\\.$`));
    expect(r.hl.text).toBe('Taki wynik ocenia się razem z objawami dojrzewania i wiekiem kostnym.');
  });

  test('RT2-5 (N2): 6 lat 2 mies., 109,3 cm, 16,2 kg, rodzice 163/177, historia 4 lat 5 mies. — jedno zdanie o rodzicach, jedno „Dodatkowo”, bez podtytułu', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { age: 6, months: 2, sex: 'M', w: 16.2, h: 109.3, mo: 163, fa: 177, historia: [{ age: 4, months: 5, h: 97, w: 11.8 }] });
    expect(r.hl.badge).toBe('Niski wzrost'); expect(r.hl.tone).toBe('danger');
    expect(r.hl.title).toMatch(new RegExp(`^Wzrost jest wyraźnie niski jak na wiek: 109,3${NB}cm, [1-3]\\. centyl\\.$`));
    expect(r.hl.text).toMatch(new RegExp(`^Wzrost jest niższy, niż wynika ze wzrostu rodziców \\(wzrost docelowy wg rodziców 176,5${NB}cm, \\d+\\. centyl dorosłych; różnica −1,\\d\\d${NB}SDS\\)\\. Taki wynik ocenia się razem z tempem wzrastania i wiekiem kostnym\\. Dodatkowo masa ciała w stosunku do wzrostu jest za mała \\(wskaźnik Cole’a \\d+${NB}%, norma 90–110${NB}%\\)\\.$`));
    expect(r.hl.subtext).toBe('');
    expect((r.hl.text.match(/Dodatkowo/g) || []).length).toBe(1);
    expect(r.hl.text).not.toMatch(/Wzrost dziecka jest niższy|w odniesieniu do wzrostu rodziców/);
    const linia = r.podsumowanie.find((l) => /hSDS - mpSDS/.test(l));
    expect(linia).toMatch(new RegExp(`hSDS - mpSDS: ${r.hl.text.match(/różnica (−1,\d\d)/)[1]}$`));
  });

  test('RT2-6: tryb standardowy — fakt o przesunięciu bez liczby SDS', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { ...SZESC, ...WYSOCY, pro: false, historia: [{ age: 3, months: 2, hc: 50, w: 14 }] });
    expect(r.proLeksykalny).toBe(false);
    expect(r.hl.badge).toBe('Wysoki wzrost — do oceny');
    expect(r.hl.text).toMatch(/pozycja wzrostu na siatce podniosła się z \d+\. na \d+\. centyl\. Taki wynik wymaga dalszej oceny/);
    expect(r.hl.text + r.hl.title).not.toMatch(/SDS/);
  });

  test('RT2-7: docpro.html — N2 tą samą ścieżką', async ({ page }) => {
    await otworz(page, 'docpro.html');
    const r = await model(page, { age: 6, months: 2, sex: 'M', w: 16.2, h: 109.3, mo: 163, fa: 177, historia: [{ age: 4, months: 5, h: 97, w: 11.8 }] });
    expect(r.hl.badge).toBe('Niski wzrost');
    expect(r.hl.text).toMatch(/^Wzrost jest niższy, niż wynika ze wzrostu rodziców \(wzrost docelowy wg rodziców 176,5/);
    expect(r.hl.subtext).toBe('');
  });
});
