import { expect, test } from '@playwright/test';

// P-DIETA-PRZYROST (rata D, 2026-09-21) — strategia „przyrost” przy niedowadze.
//
// Po co: do raty D moduł „Zalecenia dietetyczne” był przy niedowadze ZAMKNIĘTY (rata B celowo),
// a generator nie miał żadnego zdania o energii dla niedowagi. Rata D otwiera bramkę (dorosły każde
// BMI; dziecko > 5 lat) i dodaje strategię `przyrost`:
//  - dorosły: nadwyżka 300–500 kcal/d nad zapotrzebowaniem BEZ korekty na ryzyko (moduł ryzyka
//    obniża TEE o 15 % przy BMI < 18,5 — to zaniżałoby przyrost), tempo z 7700 kcal/kg, czas
//    orientacyjny; plan liczbowy TYLKO od BMI 17,5 (próg AN modułu ryzyka, czytany z jego danych)
//    i bez cech ryzyka spoza samego BMI (szybka utrata masy z historii);
//  - dziecko i nastolatek: bez liczb (opcja A właściciela: także ≥ 16 lat po zakończeniu wzrastania);
//    Z5 (pilna ocena) zamiast Z2, gdy moduł ryzyka zgłasza cechy u nastolatka.
// Liczby ma silnik planu (energyGainAssess / energyBuildPlanReductionState.gainPlan) — generator
// je cytuje. Zdania zatwierdzone przez właściciela. Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function' && !!window.VildaRaportPlan && !!window.VildaAnorexiaRisk);
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.VildaDietRecommendations.generateRecommendations === 'function'));
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportFormatIssueList === 'function');
}

const norm = (v) => String(v == null ? '' : v).replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
const zl = (w, rola) => norm((w.zdania[rola] || []).join(' '));
const DZIEN = 864e5;

/** Ustawia pacjenta (masa wprost albo z centyla BMI silnika), historię masy i tryb; zwraca stan silnika, generatora i DOM. */
function policz(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    const pro = s.pro !== false;
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && tgl.checked !== pro) { tgl.checked = pro; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = pro; window.__vildaPlanPalTouched = false; window.__vildaDietStrategyTouched = false; window.__vildaDietGoalChoice = null;
    window.intakeHistory = s.historia || null;
    let w = s.w;
    if (s.centyl != null) {
      const q = window.VildaBmi.wartoscDlaCentyla({ centyl: s.centyl, plec: s.sex, wiekMies: (s.age + (s.months || 0) / 12) * 12, zrodlo: 'OLAF' });
      w = Math.round(q.bmi * Math.pow(s.h / 100, 2) * 10) / 10;
    }
    set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', w); set('height', s.h); set('customGoalKg', '');
    window.ensureDietRecommendationsElements();
    flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', !!s.wzrostZakonczony);
    flag('nutritionNormsFlag', true); flag('journeyFlag', true); flag('vitDSuppFlag', true); flag('hydrationFlag', true);
    flag('patientFacingToggle', !!s.pf);
    window.update();
    await new Promise((res) => { setTimeout(res, 160); });
    const r = window.VildaDietRecommendations.generateRecommendations();
    const d = r.dane || {};
    const st = window.energyBuildPlanReductionState({ ageYears: s.age, ageMonthsOpt: s.months || 0, sex: s.sex, weightKg: w, heightCm: s.h, palInput: null, history: s.historia || null, growthEnded: !!s.wzrostZakonczony });
    const vis = (id) => { const el = document.getElementById(id); return !!el && el.style.display !== 'none' && el.offsetParent !== null; };
    const kp = document.querySelector('[data-diet-strategy-proxy]'); const kc = kp && kp.closest('.diet-energy-control-card');
    const gc = document.querySelector('[data-diet-goal-card]'); const cgw = document.getElementById('customGoalWrap');
    return {
      w, bmi: w / Math.pow(s.h / 100, 2), text: r.textOutput || '', zdania: d.zdania || {}, punkty: d.punkty || {}, strategia: d.strategia,
      energia: d.energia || {}, masa: d.masa || {}, czas: d.czasDoNormy || null, klas: d.klasyfikacja || {},
      gp: st.gainPlan || null, teeRaw: st.teeRawKcal, teeBazowy: st.teeBaselineKcal, risk: st.risk ? { any: !!st.risk.any, isAdult: !!st.risk.isAdult, reasons: st.risk.reasons || [] } : null,
      cgReason: st.customGoal && st.customGoal.reason,
      progAN: window.VildaAnorexiaRisk.thresholds && window.VildaAnorexiaRisk.thresholds.adult && window.VildaAnorexiaRisk.thresholds.adult.bmiAN,
      przycisk: vis('dietRecommendationsBtn'), kartaStrategii: !!kc && kc.style.display !== 'none', kartaCel: !!gc && gc.style.display !== 'none', poleCelu: !!cgw && cgw.style.display !== 'none'
    };
  }, s);
}

test('silnik planu: gainPlan — nadwyżka na TEE bez korekty, tempo z 7700 kcal/kg, plan liczbowy od progu AN modułu ryzyka i bez cech ryzyka z historii', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  // kobieta 28 lat, 168 cm, 50 kg → BMI 17,7
  const a = await policz(page, { age: 28, sex: 'F', h: 168, w: 50 });
  expect(a.klas.niedowaga).toBe(true);
  expect(a.gp).not.toBeNull();
  expect(a.gp.available).toBe(true);
  expect(a.gp.reason).toBeNull();
  expect(a.progAN).toBe(17.5);
  expect(a.gp.bmiPlanFrom).toBe(a.progAN);
  expect(a.gp.lowerBmi).toBe(18.5);
  // podstawa: TEE bez korekty na ryzyko — moduł ryzyka obniża baseline o 15 % przy BMI < 18,5
  expect(a.risk.any).toBe(true);
  expect(a.teeBazowy).toBeLessThan(a.teeRaw);
  expect(a.gp.teeKcal).toBe(Math.round(a.teeRaw));
  expect(a.gp.surplusMinKcal).toBe(300); expect(a.gp.surplusMaxKcal).toBe(500);
  const r100 = (v) => Math.round(v / 100) * 100;
  expect(a.gp.intakeMinKcal).toBe(r100(a.gp.teeKcal + 300));
  expect(a.gp.intakeMaxKcal).toBe(r100(a.gp.teeKcal + 500));
  expect(a.gp.intakeMidKcal).toBe(r100(a.gp.teeKcal + 400));
  expect(a.gp.rateMinKgWeek).toBeCloseTo(300 * 7 / 7700, 6);
  expect(a.gp.rateMaxKgWeek).toBeCloseTo(500 * 7 / 7700, 6);
  expect(a.gp.kgToLower).toBeCloseTo(18.5 * 1.68 * 1.68 - 50, 3);
  expect(a.gp.weeksMin).toBe(Math.max(1, Math.round(a.gp.kgToLower / a.gp.rateMaxKgWeek)));
  expect(a.gp.weeksMax).toBe(Math.max(a.gp.weeksMin, Math.round(a.gp.kgToLower / a.gp.rateMinKgWeek)));
  expect([a.gp.weeksMin, a.gp.weeksMax]).toEqual([5, 8]);

  // próg planu liczbowego: 49,3 kg → BMI 17,47 (poniżej), 49,4 kg → BMI 17,50 (na progu)
  const pod = await policz(page, { age: 28, sex: 'F', h: 168, w: 49.3 });
  expect(pod.bmi).toBeLessThan(17.5);
  expect(pod.gp.available).toBe(false); expect(pod.gp.reason).toBe('bmi-ponizej');
  expect(pod.gp.intakeMinKcal).toBeNull(); expect(pod.gp.weeksMax).toBeNull();
  const na = await policz(page, { age: 28, sex: 'F', h: 168, w: 49.4 });
  expect(na.bmi).toBeGreaterThanOrEqual(17.5);
  expect(na.gp.available).toBe(true);

  // cechy ryzyka spoza BMI: szybka utrata masy z historii → bez planu liczbowego, choć BMI 18,1
  const teraz = Date.now();
  const ryz = await policz(page, { age: 28, sex: 'F', h: 168, w: 51, historia: [{ t: teraz - 30 * DZIEN, weight: 56 }, { t: teraz, weight: 51 }] });
  expect(ryz.gp.available).toBe(false); expect(ryz.gp.reason).toBe('ryzyko');
  expect(ryz.gp.riskExtra).toBe(true); expect(ryz.gp.riskReasons.length).toBe(1);
  expect(ryz.risk.reasons.length).toBe(2); // BMI + historia

  // poza niedowagą i u dziecka silnik nie oddaje gainPlan
  const norma = await policz(page, { age: 30, sex: 'M', h: 180, w: 72 });
  expect(norma.gp).toBeNull();
  const dziecko = await policz(page, { age: 8, sex: 'F', h: 128, centyl: 4 });
  expect(dziecko.gp).toBeNull();
});

test('generator dorosły: Z1–Z6 w obu rejestrach, strategia „przyrost”, role, dane strukturalne, bez treści redukcyjnych', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const pro = await policz(page, { age: 28, sex: 'F', h: 168, w: 50 });
  expect(pro.strategia).toBe('przyrost');
  const t = norm(pro.text);
  expect(t).toContain('BMI wynosi 17,7 (niedowaga)');
  expect(t).toContain('Dla przyrostu masy ciała proponowana jest nadwyżka 300–500 kcal dziennie, czyli podaż ok. 2100–2300 kcal dziennie; odpowiada to tempu ok. 0,3–0,5 kg tygodniowo, a dojście do dolnej granicy normy można orientacyjnie szacować na ok. 5–8 tygodni; z badań naukowych wynika, że w praktyce przyrost bywa wolniejszy niż z tego rachunku, dlatego o postępie decyduje kontrola masy ciała.');
  expect(t).toContain('wynosi ok. 1800 kcal/dzień');
  expect(t).toContain('Normy żywieniowe dla planu około 2200 kcal/d');
  expect(Object.keys(pro.zdania).sort()).toEqual(['kontrola', 'ruch', 'talerz']);
  expect(pro.zdania.talerz.length).toBe(2);
  expect(norm(pro.zdania.talerz[0])).toMatch(/^Warto zadbać o 4–5 regularnych/);
  expect(norm(pro.zdania.talerz[1])).toBe('Kaloryczność posiłków warto zwiększać dodatkami o dużej gęstości energetycznej – oliwą, orzechami, nasionami, pełnotłustym nabiałem i awokado – oraz przekąskami między posiłkami, zamiast powiększania objętości porcji.');
  expect(zl(pro, 'ruch')).toBe('Aktywność fizyczna pozostaje wskazana, ale przy przyroście masy ciała warto oprzeć ją na ćwiczeniach oporowych 2–3 razy w tygodniu i unikać długich treningów wytrzymałościowych o dużym wydatku energetycznym.');
  expect(pro.zdania.kontrola.length).toBe(2);
  expect(norm(pro.zdania.kontrola[0])).toContain('Niedowaga wymaga oceny przyczyn klinicznych');
  expect(norm(pro.zdania.kontrola[1])).toBe('Wskazana kontrola masy ciała co 2–4 tygodnie; brak przyrostu mimo zwiększonej podaży, niezamierzona utrata masy ciała, dolegliwości ze strony przewodu pokarmowego lub cechy zaburzeń odżywiania wymagają diagnostyki.');
  // dane strukturalne = to, co poszło do zdań
  expect(pro.energia.utrzymanieKcal).toBe(pro.gp.teeKcal);
  expect(pro.energia.nadwyzkaKcal).toEqual([300, 500]);
  expect(pro.energia.podazZakresKcal).toEqual([2100, 2300]);
  expect(pro.energia.tempoZakresKgTydz[0]).toBeCloseTo(300 * 7 / 7700, 6);
  expect(pro.energia.tempoZakresKgTydz[1]).toBeCloseTo(500 * 7 / 7700, 6);
  expect(pro.energia.deficytKcal).toBe(0); expect(pro.energia.tempoKgTydz).toBe(0); expect(pro.energia.podazZaokrKcal).toBeNull();
  expect(pro.masa.docelowaKg).toBeCloseTo(18.5 * 1.68 * 1.68, 2);
  expect(pro.masa.doPrzyrostuKg).toBeCloseTo(pro.gp.kgToLower, 6);
  expect(pro.masa.doRedukcjiKg).toBeNull();
  expect(pro.czas).toEqual(expect.objectContaining({ tygodnie: 8, tygodnieOd: 5 }));
  // nic z redukcji
  for (const zakazane of ['tempu redukcji', 'deficyt', 'redukcj', 'obwodu talii', 'Dodatkowym celem']) expect(t).not.toContain(zakazane);

  const pac = await policz(page, { age: 28, sex: 'F', h: 168, w: 50, pf: true });
  expect(pac.strategia).toBe('przyrost');
  const tp = norm(pac.text);
  expect(tp).toContain('Przy Twojej aktywności na poziomie „mała aktywność” (PAL 1,4) potrzebujesz ok. 1800 kcal dziennie. Żeby przybierać na wadze, jedz ok. 300–500 kcal więcej, czyli ok. 2100–2300 kcal dziennie. To przyrost ok. 0,3–0,5 kg tygodniowo; do dolnej granicy normy dojdziesz orientacyjnie za ok. 5–8 tygodni. Z badań naukowych wynika, że w praktyce przyrost bywa wolniejszy, niż wychodzi z rachunku – dlatego ważne jest regularne ważenie.');
  expect(norm(pac.zdania.talerz[1])).toBe('Dokładaj kalorie w małej objętości: oliwa, orzechy, nasiona, pełnotłusty nabiał, awokado, i jedz przekąski między posiłkami – zamiast zwiększać porcje.');
  expect(zl(pac, 'ruch')).toBe('Ruch jest nadal wskazany – najlepiej ćwiczenia siłowe 2–3 razy w tygodniu. Unikaj długich, wyczerpujących treningów wytrzymałościowych.');
  expect(norm(pac.zdania.kontrola[1])).toBe('Waż się co 2–4 tygodnie. Jeśli mimo jedzenia więcej masa ciała nie rośnie, chudniesz bez powodu, masz dolegliwości brzuszne albo zauważasz, że unikasz jedzenia lub boisz się przybrać na wadze – zgłoś to lekarzowi.');
  expect(tp).not.toContain('kg na tydzień');

  // Z6: BMI 15,6 — bez planu liczbowego, ale talerz, ruch i kontrola zostają
  const z6 = await policz(page, { age: 28, sex: 'F', h: 168, w: 44 });
  expect(z6.strategia).toBe('przyrost');
  expect(norm(z6.text)).toContain('Przy BMI poniżej 17,5 lub cechach ryzyka zaburzeń odżywiania aplikacja nie podaje planu liczbowego; wskazana ocena kliniczna, w tym ryzyka zespołu ponownego odżywienia, i prowadzenie żywienia pod nadzorem lekarza i dietetyka klinicznego.');
  expect(norm(z6.text)).not.toContain('nadwyżka');
  expect(norm(z6.text)).toContain('Normy żywieniowe dla zapotrzebowania około 1700 kcal/d');
  expect(z6.energia.nadwyzkaKcal).toBeNull(); expect(z6.energia.podazZakresKcal).toBeNull(); expect(z6.czas).toBeNull();
  expect(z6.energia.utrzymanieKcal).toBe(Math.round(z6.teeRaw));
  expect(z6.zdania.talerz.length).toBe(2); expect(z6.zdania.ruch.length).toBe(1); expect(z6.zdania.kontrola.length).toBe(2);
  const z6p = await policz(page, { age: 28, sex: 'F', h: 168, w: 44, pf: true });
  expect(norm(z6p.text)).toContain('Przy tak niskiej masie ciała aplikacja nie podaje planu liczbowego – potrzebna jest ocena lekarska, a plan jedzenia ustala się razem ze specjalistą (dietetykiem klinicznym, psychodietetykiem).');
  // Z6 także z historii (BMI 18,1, szybka utrata masy)
  const teraz = Date.now();
  const ryz = await policz(page, { age: 28, sex: 'F', h: 168, w: 51, historia: [{ t: teraz - 30 * DZIEN, weight: 56 }, { t: teraz, weight: 51 }] });
  expect(norm(ryz.text)).toContain('aplikacja nie podaje planu liczbowego');
  expect(ryz.energia.nadwyzkaKcal).toBeNull();
  // punkty: nowe klucze cytują zdania (liczby i słowa) — ta sama reguła co w punkty-zalecen
  for (const w of [pro, pac, z6p]) {
    expect(Object.keys(w.punkty).sort()).toEqual(Object.keys(w.zdania).sort());
    expect(w.punkty.ruch.join(' ')).toMatch(/2–3 razy w tygodniu/);
    expect(w.punkty.kontrola[0]).toBe(w.zdania.kontrola[0]);
    expect(w.punkty.kontrola.length).toBe(3);
  }
});

test('generator dziecko i nastolatek: bez liczb, Z2 albo Z5 z modułu ryzyka, talerz i kontrola przyrostu, 18-latek bez rodziców', async ({ page }) => {
  test.setTimeout(240_000);
  await otworz(page);
  // 8 lat, P4: rodzic
  const d8 = await policz(page, { age: 8, sex: 'F', h: 128, centyl: 4 });
  expect(d8.klas.niedowaga).toBe(true);
  expect(d8.strategia).toBe('przyrost');
  expect(d8.gp).toBeNull();
  const t8 = norm(d8.text);
  expect(t8).toContain('Przy niedowadze u dziecka aplikacja nie wyznacza liczbowej nadwyżki energetycznej; podstawą jest ocena przyczyn, regularne i energetycznie gęste posiłki oraz obserwacja przyrostów masy ciała i wzrostu.');
  expect(t8).toContain('z niedowagą wymaga oceny pediatrycznej');
  expect(zl(d8, 'talerz')).toBe('Zalecane jest 5 regularnych posiłków dziennie w spokojnej atmosferze, bez presji przy jedzeniu, z dodatkami zwiększającymi kaloryczność w małej objętości (oliwa, masło, pasty orzechowe, pełnotłusty nabiał); nie należy ograniczać jakichkolwiek grup produktów.');
  expect(d8.zdania.kontrola.length).toBe(2);
  expect(norm(d8.zdania.kontrola[1])).toBe('Wskazana kontrola masy ciała i wzrostu co 4–6 tygodni na siatkach centylowych; brak przyrostu, spadek centyla lub cechy zaburzeń odżywiania wymagają wcześniejszej oceny.');
  expect(t8).not.toMatch(/nadwyżk[aę] \d|kcal więcej|kg tygodniowo/u);
  expect(d8.energia.nadwyzkaKcal).toBeNull(); expect(d8.energia.utrzymanieKcal).toBeCloseTo(d8.teeRaw, 3);
  const d8p = await policz(page, { age: 8, sex: 'F', h: 128, centyl: 4, pf: true });
  expect(norm(d8p.text)).toContain('Aplikacja nie wyznacza dziecku dodatkowych kalorii – ważne są regularne, pożywne posiłki i sprawdzanie, czy masa ciała i wzrost rosną.');
  expect(zl(d8p, 'talerz')).toBe('Proszę podawać dziecku 5 regularnych posiłków dziennie, w spokojnej atmosferze i bez presji przy jedzeniu, z dodatkami zwiększającymi kaloryczność w małej objętości: oliwą, masłem, pastami orzechowymi, pełnotłustym nabiałem. Nie należy ograniczać żadnych grup produktów.');
  expect(norm(d8p.zdania.kontrola[1])).toBe('Proszę kontrolować masę ciała i wzrost dziecka co 4–6 tygodni; brak przyrostu lub spadek na siatce wymaga wcześniejszej wizyty.');

  // 12 lat, P4: nastolatka bez cech ryzyka (EBW liczone od 13 lat) → Z2
  const n12 = await policz(page, { age: 12, sex: 'F', h: 150, centyl: 4 });
  expect(n12.risk.any).toBe(false);
  expect(n12.strategia).toBe('przyrost');
  expect(norm(n12.text)).toContain('aplikacja nie wyznacza liczbowej nadwyżki energetycznej');
  expect(norm(n12.text)).not.toContain('pilna ocena kliniczna');
  expect(zl(n12, 'talerz')).toBe('Zalecane są regularne posiłki (5 dziennie, w tym śniadanie i przekąski) o zwiększonej gęstości energetycznej – z dodatkiem orzechów, nasion, oliwy, pełnotłustego nabiału i awokado; nie należy ograniczać jakichkolwiek grup produktów.');
  expect(norm(n12.zdania.kontrola[1])).toContain('cechy zaburzeń odżywiania u nastolatka wymagają wcześniejszej oceny');
  const n12p = await policz(page, { age: 12, sex: 'F', h: 150, centyl: 4, pf: true });
  expect(norm(n12p.text)).toContain('Aplikacja nie wyznacza Ci dodatkowych kalorii do zjedzenia – ważne są regularne, pożywne posiłki i sprawdzanie, czy masa ciała rośnie.');
  expect(zl(n12p, 'talerz')).toBe('Jedz regularnie 5 posiłków dziennie, ze śniadaniem, i dokładaj do nich pożywne produkty w małej objętości: orzechy, nasiona, oliwę, pełnotłusty nabiał, awokado. Nie pomijaj posiłków i nie ograniczaj jedzenia.');
  expect(norm(n12p.zdania.kontrola[1])).toBe('Ważenie i mierzenie co 4–6 tygodni; jeśli masa ciała nie rośnie albo zauważasz, że unikasz jedzenia lub boisz się przybrać na wadze, powiedz o tym rodzicom lub lekarzowi.');

  // 15 lat, P4: masa < 85 % należnej (moduł ryzyka) → Z5 zamiast Z2
  const n15 = await policz(page, { age: 15, sex: 'F', h: 160, centyl: 4 });
  expect(n15.risk.any).toBe(true);
  expect(n15.risk.reasons.join(' ')).toMatch(/85%/);
  expect(norm(n15.text)).toContain('Cechy ryzyka zaburzeń odżywiania (masa poniżej 85 % należnej lub szybka utrata masy ciała) – wskazana pilna ocena kliniczna; plan żywieniowy wyłącznie pod nadzorem lekarza i dietetyka klinicznego.');
  expect(norm(n15.text)).not.toContain('nie wyznacza liczbowej nadwyżki');
  const n15p = await policz(page, { age: 15, sex: 'F', h: 160, centyl: 4, pf: true });
  expect(norm(n15p.text)).toContain('Twoja masa ciała jest wyraźnie za niska albo szybko spadła – potrzebna jest szybka wizyta u lekarza, a plan jedzenia ustala się razem ze specjalistą (dietetykiem klinicznym, psychodietetykiem).');

  // 18 lat (gałąź dziecięca, moduł ryzyka liczy jak dorosłego): sam próg BMI < 18,5 to nie cecha ryzyka → Z2;
  // BMI < 17,5 → Z5; bez „rodzicom”
  const n18 = await policz(page, { age: 18, sex: 'M', h: 178, centyl: 4, pf: true });
  expect(n18.risk.isAdult).toBe(true);
  expect(n18.bmi).toBeGreaterThanOrEqual(17.5); expect(n18.bmi).toBeLessThan(18.5);
  expect(n18.strategia).toBe('przyrost');
  expect(norm(n18.text)).toContain('Aplikacja nie wyznacza Ci dodatkowych kalorii');
  expect(norm(n18.text)).not.toContain('szybka wizyta u lekarza');
  expect(norm(n18.zdania.kontrola[1])).toMatch(/powiedz o tym lekarzowi\.$/u);
  expect(norm(n18.zdania.kontrola[1])).not.toContain('rodzicom');
  expect(n18.cgReason).toBe('niedowaga'); // pole celu własnego nie pokazuje się z podpowiedzią o utrzymaniu
  expect(n18.poleCelu).toBe(false);
  const n18n = await policz(page, { age: 18, sex: 'M', h: 178, w: 53.9, pf: true }); // BMI 17,0
  expect(n18n.bmi).toBeLessThan(17.5);
  expect(norm(n18n.text)).toContain('szybka wizyta u lekarza');

  // 16 lat po zakończeniu wzrastania: nadal bez liczb (opcja A), pole celu ukryte z powodem „niedowaga”
  const n16 = await policz(page, { age: 16, sex: 'M', h: 176, centyl: 4, wzrostZakonczony: true });
  expect(n16.gp).toBeNull(); expect(n16.cgReason).toBe('niedowaga'); expect(n16.poleCelu).toBe(false);
  expect(norm(n16.text)).not.toMatch(/kcal więcej|nadwyżka \d/u);

  // 3 lata: strategia „przyrost”; zdania dla 2–4 lat doszły w racie E (talerz malucha, kontrola malucha) — patrz maluch-zalecen.spec
  const m3 = await policz(page, { age: 3, sex: 'F', h: 100, w: 12 });
  expect(m3.strategia).toBe('przyrost');
  expect(zl(m3, 'talerz')).toMatch(/^Zalecane jest 5 posiłków dziennie o stałych porach/u);
  expect(m3.zdania.kontrola.length).toBe(2);
  expect(norm(m3.text)).toContain('nie wyznacza');
  expect(zl(m3, 'ruch')).toContain('180 minut');
});

test('bramka: przycisk przy niedowadze dorosłego i dziecka od 2 lat (rata E); karta strategii, karta „Cel” i pole celu ukryte; < 2 lat zamknięte', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const oczekiwania = [
    [{ age: 45, sex: 'F', h: 165, w: 50.2 }, true],   // BMI 18,44 — niedowaga dorosłego (do raty D ukryty)
    [{ age: 28, sex: 'F', h: 168, w: 44 }, true],     // BMI 15,6 — bez planu liczbowego, moduł otwarty
    [{ age: 8, sex: 'F', h: 128, centyl: 4 }, true],  // tuż pod P5 (do raty D ukryty)
    [{ age: 14, sex: 'F', h: 160, w: 35 }, true],
    [{ age: 4, months: 11, sex: 'F', h: 108, w: 12 }, true],  // 2–4 lata: od raty E otwarta
    [{ age: 1, months: 11, sex: 'F', h: 86, w: 9 }, false],    // < 2 lat: zamknięta
    [{ age: 5, months: 1, sex: 'F', h: 110, centyl: 4 }, true]
  ];
  for (const [s, exp] of oczekiwania) {
    const w = await policz(page, s);
    expect({ przycisk: w.przycisk, kartaStrategii: w.kartaStrategii, kartaCel: w.kartaCel, poleCelu: w.poleCelu }, JSON.stringify(s) + ' BMI≈' + w.bmi.toFixed(2))
      .toEqual({ przycisk: exp, kartaStrategii: false, kartaCel: false, poleCelu: false });
  }
  // tryb pacjenta (nie profesjonalny): bramka zamknięta jak dotąd
  const pacjent = await policz(page, { age: 45, sex: 'F', h: 165, w: 50.2, pro: false });
  expect(pacjent.przycisk).toBe(false);
});

test('raport pacjenta: nagłówek „przyrost” i kafle nadwyżki; bez planu liczbowego i u dziecka tylko zapotrzebowanie', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const raport = (s) => page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    window.professionalMode = true; window.intakeHistory = null;
    set('age', s.age); set('ageMonths', 0); set('sex', s.sex); set('weight', s.w); set('height', s.h); set('customGoalKg', '');
    window.ensureDietRecommendationsElements();
    ['reduceToggle', 'stabilizationToggle', 'growthEndedFlag', 'patientFacingToggle'].forEach((id) => { const el = document.getElementById(id); if (el) el.checked = false; });
    ['nutritionNormsFlag', 'journeyFlag', 'vitDSuppFlag', 'hydrationFlag'].forEach((id) => { const el = document.getElementById(id); if (el) el.checked = true; });
    window.update();
    await new Promise((r) => { setTimeout(r, 180); });
    const baseResult = window.VildaDietRecommendations.buildEnergyRecommendationResult();
    const ctx = { patient: { name: 'Anna Testowa', ageLabel: s.age + ' lat', sexLabel: s.sex === 'F' ? 'żeńska' : 'męska', weightLabel: s.w + ',0 kg', heightLabel: s.h + ',0 cm' }, baseResult };
    const html = window.VildaRaportPlan.html(ctx);
    const m = html.match(/vrp-nag-blok">([^<]*)<\/div><div class="vrp-kafle[^"]*">([\s\S]*?)<\/div><\/div>/);
    return { strategia: baseResult.dane && baseResult.dane.strategia, naglowek: m && m[1], kafle: m ? m[2].replace(/<[^>]+>/g, '|').replace(/\|+/g, '|') : '', html };
  }, s);
  const a = await raport({ age: 28, sex: 'F', h: 168, w: 50 });
  expect(a.strategia).toBe('przyrost');
  expect(a.naglowek).toBe('ZAPOTRZEBOWANIE ENERGETYCZNE I PRZYROST MASY CIAŁA');
  expect(norm(a.kafle)).toContain('1 780|kcal dziennie|zapotrzebowanie energetyczne');
  expect(norm(a.kafle)).toContain('300–500|kcal na dobę|nadwyżka energetyczna');
  expect(norm(a.kafle)).toContain('2 100–2 300|kcal dziennie|zalecana podaż energii');
  expect(norm(a.kafle)).toContain('0,3–0,5|kg tygodniowo|spodziewane tempo przyrostu');
  expect(a.html).not.toContain('TEMPO REDUKCJI');
  expect(a.html).not.toContain('TWOJA DROGA');
  const z6 = await raport({ age: 28, sex: 'F', h: 168, w: 44 });
  expect(z6.naglowek).toBe('ZAPOTRZEBOWANIE ENERGETYCZNE I PRZYROST MASY CIAŁA');
  expect(norm(z6.kafle)).toContain('zapotrzebowanie energetyczne');
  expect(norm(z6.kafle)).not.toContain('nadwyżka');
  const dz = await raport({ age: 8, sex: 'F', h: 128, w: 21.7 });
  expect(dz.strategia).toBe('przyrost');
  expect(dz.naglowek).toBe('ZAPOTRZEBOWANIE ENERGETYCZNE I PRZYROST MASY CIAŁA');
  expect(norm(dz.kafle)).toContain('zapotrzebowanie energetyczne');
  expect(norm(dz.kafle)).not.toContain('nadwyżka');
});
