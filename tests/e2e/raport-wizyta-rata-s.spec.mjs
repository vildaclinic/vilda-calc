import { expect, test } from '@playwright/test';

// P-RAPORT rata S (decyzje właściciela 2026-09-22): nagłówek bez dublowania osi wzrostu (P1/P2), jedno zdanie
// o nadwadze < 2 lat (P3), strażnik < 0,5 kg nazywa szczebel (P4), odniesienia kart bez „0,0” i z tolerancją (P5/P6),
// kropka w nocie masy (P7), etykieta centyla jak w kartach (P8). Wszystko na PRAWDZIWEJ stronie; dane FIKCYJNE.

const NB = '\u00A0';
const PRZECIETNE = 'Wynik mieści się w wartościach przeciętnych dla wieku.';
const PRZECIETNE_PLEC = 'Wynik mieści się w wartościach przeciętnych dla wieku i płci.';
// Reguła P5/P6 policzona w teście z SUROWYCH liczb strony (siatka źródłowa strony może różnić się od PDF właściciela).
function oczekiwaneOdniesienie(wartosc, odniesienie, tol, jedn, zdanie) {
  const d = wartosc - odniesienie; const a = Math.abs(d);
  const f = (x) => x.toFixed(1).replace('.', ',');
  if (f(wartosc) === f(odniesienie) || Number(f(a).replace(',', '.')) === 0 || a <= tol) return zdanie;
  return `To o ${f(a)} ${jedn} ${d > 0 ? 'powyżej' : 'poniżej'} tej wartości.`;
}

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.patientReportBuildModel === 'function'
    && !!window.VildaRaportNaglowek && window.VildaRaportNaglowek.WERSJA >= 2 && !!window.VildaBmi);
}

// s.h / s.w wprost albo s.hc / s.wc (centyle) — wartość z odwrotności siatki tej samej strony, plus przesunięcie dh / dw.
async function model(page, s) {
  return page.evaluate(async (s) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    window.professionalMode = true; window.intakeHistory = null; window.lastLoadedData = null; window.hasUserModifiedAfterLoad = false;
    ['bpSystolic', 'bpDiastolic', 'heartRate', 'adultBpSystolic', 'adultBpDiastolic', 'adultHeartRate', 'waistCm', 'hipCm', 'headCircumference', 'chestCircumference'].forEach((id) => set(id, ''));
    set('name', 'Testowy Fikcyjny'); set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex);
    set('weight', ''); set('height', ''); window.update(); // źródło siatki (WHO < 3 lat) ustala się w update()
    const wiek = s.age + (s.months || 0) / 12;
    let h = s.h, w = s.w;
    if (h == null) h = Math.round((window.patientReportGetMetricValueAtPercentile('HT', s.sex, wiek, s.hc) + (s.dh || 0)) * 10) / 10;
    if (w == null) w = Math.round((window.patientReportGetMetricValueAtPercentile('WT', s.sex, wiek, s.wc) + (s.dw || 0)) * 10) / 10;
    set('weight', w); set('height', h);
    if (typeof window.ensureDietRecommendationsElements === 'function') window.ensureDietRecommendationsElements();
    window.update();
    await new Promise((r) => { setTimeout(r, 400); });
    const m = window.patientReportBuildModel();
    const karta = (c) => c ? { badge: c.badge, note: c.note, ref: c.reference ? { median: c.reference.medianText, diff: c.reference.diffText, neutral: c.reference.neutral } : null } : null;
    const by = (k) => m.metricCards.find((c) => c.key === k);
    const b = window.patientReportGetCurrentBasics();
    const raw = { bmi: b.bmi, medBmi: window.patientReportGetMetricMedian('BMI', b.sex, b.ageYears, window.patientReportGetPreferredSource()), cole: window.colePercentValue };
    return { h, w, raw, hl: m.headline, html: window.patientReportBuildHtml(m), WT: karta(by('WT')), HT: karta(by('HT')), BMI: karta(by('BMI')), COLE: karta(m.coleCard) };
  }, s);
}

test.describe('P-RAPORT rata S — nagłówek bez dublowania, odniesienia bez „0,0”', () => {
  test('RS-1: chłopiec 1 rok, 11,8 kg / 83,0 cm (odtworzony raport właściciela) — wzrost raz, w zdaniu masy; BMI i Cole „w wartościach przeciętnych”; kropka w nocie masy', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await model(page, { age: 1, months: 0, sex: 'M', w: 11.8, h: 83 });
    expect(r.hl.badge).toBe('Wysoka masa ciała'); expect(r.hl.tone).toBe('warn');
    expect(r.hl.title).toMatch(new RegExp(`^Masa ciała jest wysoka jak na wiek \\(11,8${NB}kg, 9\\d\\. centyl\\), ale w stosunku do wzrostu pozostaje prawidłowa\\.$`));
    expect(r.hl.text).toBe(`Wzrost jest również wysoki (83,0${NB}cm, powyżej 99. centyla); masa ciała jest proporcjonalna do wzrostu, a BMI mieści się w typowym zakresie.`);
    expect(r.hl.subtext).toBe('Sam wysoki wzrost nie jest nieprawidłowością; ocenia się go razem z tempem wzrastania i wzrostem rodziców.');
    expect(r.hl.dodatkowe).toEqual([]);
    for (const z of ['Dodatkowo wzrost', 'Wynika to z', '0,0 pkt', '0,0 kg', '0,0 cm']) expect(r.html, z).not.toContain(z);
    // P8: karta i nagłówek mówią to samo o wzroście
    expect(r.HT.badge).toBe('>99 centyla');
    // P5/P6: BMI wobec przeciętnego (tolerancja 0,2) i Cole wobec 100 % (tolerancja 1) — reguła z surowych liczb strony
    expect(typeof r.raw.medBmi).toBe('number');
    expect(r.BMI.ref.diff).toBe(oczekiwaneOdniesienie(r.raw.bmi, r.raw.medBmi, 0.2, 'pkt', PRZECIETNE));
    expect(r.COLE.ref.diff).toBe(oczekiwaneOdniesienie(r.raw.cole, 100, 1, 'pkt', PRZECIETNE_PLEC));
    expect(r.WT.ref.diff).toMatch(new RegExp(`^(${PRZECIETNE}|To o \\d,[1-9] kg (powyżej|poniżej) tej wartości\\.)$`));
    expect(r.HT.ref.diff).toMatch(/^To o \d,\d cm powyżej tej wartości\.$/);
    // P7
    expect(r.WT.note).toContain('powyżej typowego zakresu. Masa ciała i BMI oceniają co innego:');
  });

  test('RS-2: niski wzrost w tytule, niska masa przy prawidłowym BMI — „ale proporcjonalna do wzrostu”, bez „wynika z”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await model(page, { age: 1, months: 0, sex: 'M', w: 8.1, h: 70.2 });
    expect(r.hl.badge).toBe('Niski wzrost');
    expect(r.hl.title).toBe(`Wzrost jest wyraźnie niski jak na wiek: 70,2${NB}cm, poniżej 1. centyla.`);
    expect(r.hl.text).toMatch(new RegExp(`^Dodatkowo masa ciała jest niska jak na wiek \\(8,1${NB}kg, (poniżej 1\\. centyla|\\d\\. centyl)\\), ale proporcjonalna do wzrostu; BMI mieści się w typowym zakresie\\.$`));
    expect(r.hl.text).not.toMatch(/wynika|choć/);
    expect(r.BMI.badge).toBe('Prawidłowe');
  });

  test('RS-3 / RS-4: nadwaga u niemowlęcia — jedno zdanie; otyłość u 2-latka ze szczeblem 0,4 kg — bez „granicy normy”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const n = await model(page, { age: 0, months: 6, sex: 'M', w: 8.9, h: 67.6 });
    expect(n.hl.badge).toBe('Nadwaga');
    expect(n.hl.text).toBe('U małych dzieci nie stosuje się odchudzania; celem jest, aby masa ciała rosła wolniej niż wzrost.');
    // 80 cm u 2-latka to wzrost < 1 c (tytuł), otyłość w „Dodatkowo”; szczebel −0,25 BMI-SDS ma tu < 0,5 kg
    const o = await model(page, { age: 2, months: 0, sex: 'M', w: 16.3, h: 80 });
    expect(o.hl.badge).toBe('Niski wzrost'); expect(o.BMI.badge).toBe('Otyłość');
    expect(o.hl.text).toMatch(new RegExp(`Dodatkowo masa ciała i BMI są wyraźnie powyżej typowych wartości dla wieku \\(16,3${NB}kg, BMI 25,5\\)\\. Pierwszy krok to ok\\. 1\\d,\\d${NB}kg, czyli mniej niż 0,5${NB}kg; celem jest, aby masa ciała przestała rosnąć szybciej niż wzrost\\.$`));
    const k = await model(page, { age: 2, months: 0, sex: 'M', w: 12.2, h: 80 });
    expect(k.BMI.badge).toBe('Otyłość');
    expect(k.hl.text).toMatch(new RegExp(`(Do końca otyłości brakuje mniej niż 0,5${NB}kg|Pierwszy krok to ok\\. 1\\d,\\d${NB}kg, czyli mniej niż 0,5${NB}kg); celem jest, aby masa ciała przestała rosnąć szybciej niż wzrost\\.$`));
    for (const r of [o, k]) { expect(r.hl.text).not.toContain('granicy normy'); expect(r.hl.text).not.toContain('poprawia ciśnienie'); }
  });

  test('RS-5: tolerancje kart dziecka — wzrost ±1 cm, BMI ±0,2, masa 2 % — i różnica „0,0” jako brak odchylenia', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const zero = await model(page, { age: 1, months: 0, sex: 'F', hc: 50, wc: 50, dh: -0.2 }); // BMI 16,4 vs 16,4 (różnica < 0,05): dotąd „To o 0,0 pkt poniżej”
    expect(zero.BMI.ref.diff).toBe(PRZECIETNE);
    expect(zero.HT.ref.diff).toBe(PRZECIETNE); // 0,2 cm w tolerancji 1 cm
    const blisko = await model(page, { age: 1, months: 0, sex: 'F', hc: 50, wc: 50, dh: 0.9 });
    expect(blisko.HT.ref.diff).toBe(PRZECIETNE);
    const dalej = await model(page, { age: 1, months: 0, sex: 'F', hc: 50, wc: 50, dh: 1.1 });
    expect(dalej.HT.ref.diff).toBe('To o 1,1 cm powyżej tej wartości.'); expect(dalej.HT.ref.neutral).toBe(false);
    const masa = await model(page, { age: 9, months: 0, sex: 'M', hc: 50, wc: 50, dw: 0.5 }); // 0,5 kg przy odniesieniu ok. 31 kg (2 % = 0,6 kg)
    expect(masa.WT.ref.diff).toBe(PRZECIETNE);
    const masa2 = await model(page, { age: 9, months: 0, sex: 'M', hc: 50, wc: 50, dw: 1.1 });
    expect(masa2.WT.ref.diff).toMatch(/^To o (0,9|1,0|1,1) kg powyżej tej wartości\.$/);
  });

  test('RS-6: dorosły BMI 24,93 — „na górnej granicy zakresu” zamiast „0,0 pkt powyżej”; BMI 27 bez zmian', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const g = await model(page, { age: 47, months: 0, sex: 'M', w: 72.05, h: 170 });
    expect(g.BMI.ref.diff).toBe('BMI jest na górnej granicy zakresu.'); expect(g.BMI.ref.neutral).toBe(true);
    const n = await model(page, { age: 47, months: 0, sex: 'M', w: 78.03, h: 170 });
    expect(n.BMI.ref.diff).toBe('To o 2,1 pkt powyżej górnej granicy.');
  });
});
