import { expect, test } from '@playwright/test';

// P-DIETA-MALUCH (rata E, 2026-09-21) — bramka od 2 lat i zdania dla 2–4 lat.
//
// Po co: do raty E moduł „Zalecenia dietetyczne” był zamknięty do 5 lat, dziecko 2–4 lata w normie nie
// miało talerza, przy nadmiarze dostawało talerz dziecka szkolnego („chude mięso, żółty ser, fast‑foody”),
// a przy niedowadze nic z raty D. Decyzje właściciela: bramka od 2,0 lat (poniżej 2 lat nadal zamknięta);
// karta strategii ukryta w stadium 2–5 lat (silnik wymusza stabilizację); talerz małego dziecka w normie
// (karmienie responsywne, sok ≤ pół szklanki wg AAP 2017, mleko bez liczby porcji), przy nadmiarze (bez
// diety redukcyjnej, porcje do wieku, dokładka z warzyw przy dużym apetycie) i przy niedowadze; kontrola
// przyrostu malucha co 4–6 tygodni; ekran ≤ 1 h i sen 10–13 h (3–4 lata) / 11–14 h (2 lata) wg WHO 2019.
// Rata D: „nie należy ograniczać jakichkolwiek grup produktów” zamiast „bez ograniczania…”. Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function' && !!window.VildaRaportPlan);
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.VildaDietRecommendations.generateRecommendations === 'function'));
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportFormatIssueList === 'function');
}

const norm = (v) => String(v == null ? '' : v).replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
const zl = (w, rola) => norm((w.zdania[rola] || []).join(' '));
const SZKOLNY = ['żółty ser', 'fast‑foody', 'fast foody', 'chude mięso', 'słone przekąski', 'ciężkimi sosami', 'ciężkie sosy'];

function policz(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true; window.__vildaPlanPalTouched = false; window.__vildaDietStrategyTouched = false; window.__vildaDietGoalChoice = null;
    window.intakeHistory = null;
    let w = s.w;
    if (s.centyl != null) {
      const q = window.VildaBmi.wartoscDlaCentyla({ centyl: s.centyl, plec: s.sex, wiekMies: (s.age + (s.months || 0) / 12) * 12, zrodlo: 'OLAF' });
      w = Math.round(q.bmi * Math.pow(s.h / 100, 2) * 10) / 10;
    }
    set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', w); set('height', s.h); set('customGoalKg', '');
    window.ensureDietRecommendationsElements();
    flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', false);
    flag('nutritionNormsFlag', true); flag('journeyFlag', true); flag('vitDSuppFlag', true); flag('hydrationFlag', true);
    window.update();
    await new Promise((res) => { setTimeout(res, 160); });
    const r = window.VildaDietRecommendations.generateRecommendations();
    const d = r.dane || {};
    const k = d.klasyfikacja || {};
    const vis = (id) => { const el = document.getElementById(id); return !!el && el.style.display !== 'none' && el.offsetParent !== null; };
    const kp = document.querySelector('[data-diet-strategy-proxy]'); const kc = kp && kp.closest('.diet-energy-control-card');
    const gc = document.querySelector('[data-diet-goal-card]');
    return { w, text: r.textOutput || '', zdania: d.zdania || {}, punkty: d.punkty || {}, strategia: d.strategia, kat: k.klasaBmi && k.klasaBmi.categoryKey,
      nadmiar: !!k.nadmiar, niedowaga: !!k.niedowaga, przycisk: vis('dietRecommendationsBtn'), kartaStrategii: !!kc && kc.style.display !== 'none', kartaCel: !!gc && gc.style.display !== 'none' };
  }, s);
}

test('bramka: od 2,0 lat; 1 rok 11 mies. zamknięta; karta strategii ukryta w stadium 2–5 lat, widoczna od 6 lat przy nadmiarze', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const oczekiwania = [
    [{ age: 2, sex: 'M', h: 88, w: 12.5 }, { przycisk: true, kartaStrategii: false }],            // 2 lata 0 mies., norma
    [{ age: 1, months: 11, sex: 'M', h: 86, w: 12 }, { przycisk: false, kartaStrategii: false }], // poniżej 2 lat: nadal zamknięta
    [{ age: 3, sex: 'F', h: 100, w: 22 }, { przycisk: true, kartaStrategii: false }],             // otyłość 3 lata: stabilizacja wymuszona → bez karty
    [{ age: 4, months: 11, sex: 'F', h: 108, w: 17 }, { przycisk: true, kartaStrategii: false }], // do raty E zamknięta
    [{ age: 5, months: 6, sex: 'F', h: 112, w: 25 }, { przycisk: true, kartaStrategii: false }],  // 5,5 roku z otyłością: stadium 2–5 → bez karty
    [{ age: 6, sex: 'F', h: 115, w: 27 }, { przycisk: true, kartaStrategii: true }],               // 6 lat z otyłością: karta jak dotąd
    [{ age: 3, sex: 'F', h: 100, w: 12 }, { przycisk: true, kartaStrategii: false }]              // niedowaga 3 lata
  ];
  for (const [s, exp] of oczekiwania) {
    const w = await policz(page, s);
    expect({ przycisk: w.przycisk, kartaStrategii: w.kartaStrategii, kartaCel: w.kartaCel }, JSON.stringify(s)).toEqual({ ...exp, kartaCel: false });
  }
});

test('norma 2–4 lata: talerz małego dziecka, ekran i sen WHO z pasmem wieku; 5 lat bez zmian', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const n3 = await policz(page, { age: 3, sex: 'F', h: 100, w: 15.5 });
  expect(n3.kat).toBe('prawidlowe');
  expect(n3.strategia).toBe('utrzymanie');
  expect(zl(n3, 'talerz')).toBe('Zalecane są 4–5 posiłków dziennie o stałych porach, bez podjadania między nimi: codziennie warzywa i owoce, produkty zbożowe, mleko i przetwory mleczne, mięso, ryby, jaja lub nasiona roślin strączkowych; do picia woda, bez napojów słodzonych, sok najwyżej pół szklanki (ok. 120 ml) dziennie. Rodzic decyduje, co i kiedy dziecko je, dziecko – ile zje; bez nagradzania i pocieszania jedzeniem.');
  expect(n3.zdania.ruch.length).toBe(2);
  expect(norm(n3.zdania.ruch[0])).toContain('180 minut');
  expect(norm(n3.zdania.ruch[1])).toBe('Zgodnie z zaleceniami WHO dla dzieci do 5 lat czas przed ekranem nie powinien przekraczać 1 godziny dziennie (im mniej, tym lepiej), a sen powinien trwać 10–13 godzin na dobę łącznie z drzemkami.');
  expect(n3.zdania.kontrola).toBeUndefined();
  for (const r of SZKOLNY) expect(norm(n3.text)).not.toContain(r);
  expect(norm(n3.text)).not.toMatch(/przedmow|charakter poglądowy/u);
  // 2-latek: pasmo snu 11–14 h
  const n2 = await policz(page, { age: 2, sex: 'M', h: 88, w: 12.5 });
  expect(norm(n2.zdania.ruch[1])).toContain('11–14 godzin');
  const n4 = await policz(page, { age: 4, months: 11, sex: 'F', h: 108, w: 17 });
  expect(norm(n4.zdania.ruch[1])).toContain('10–13 godzin');
  // 5 lat: talerz raty B, bez zdania o ekranie i śnie
  const n5 = await policz(page, { age: 5, months: 1, sex: 'F', h: 110, w: 18.5 });
  expect(zl(n5, 'talerz')).toMatch(/porcjach dopasowanych do wieku i apetytu/u);
  expect(n5.zdania.ruch.length).toBe(1);
  expect(norm(n5.text)).not.toContain('drzemkami');
});

test('nadmiar 2–4 lata: talerz małego dziecka zamiast szkolnego, reszta zdań stabilizacji bez zmian', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const o3 = await policz(page, { age: 3, sex: 'F', h: 100, w: 22 });
  expect(o3.nadmiar).toBe(true);
  expect(o3.strategia).toBe('stabilization');
  const t = norm(o3.text);
  expect(zl(o3, 'talerz')).toBe('W wieku 2–4 lat nie stosuje się diety redukcyjnej. Zalecane są 4–5 posiłków o stałych porach, przy stole i bez ekranu, w porcjach odpowiednich do wieku; przy dużym apetycie dokładką mogą być warzywa, nie kolejna porcja dania. Między posiłkami tylko woda – bez podjadania, napojów słodzonych i soków; słodycze, słodkie płatki i wędliny rzadko i w małych ilościach. Jedzenie nie powinno służyć jako nagroda ani pocieszenie.');
  for (const r of SZKOLNY) expect(t, 'talerz szkolny u 3-latki: ' + r).not.toContain(r);
  // zdania stabilizacji, witaminy D, płynów i kamieni milowych zostają
  expect(t).toContain('W strategii stabilizacji nie planuje się dodatkowego deficytu');
  expect(t).toContain('celem jest utrzymanie obecnej masy ciała dziecka');
  expect(t).toMatch(/witaminy D/u);
  expect(t).toMatch(/1,25 l dziennie/u);
  expect(t).toContain('z nadwagą lub otyłością wymaga konsultacji');
  expect(norm(o3.zdania.ruch[1])).toContain('10–13 godzin');
  // nadwaga 4 lat (P90): ten sam talerz; 6 lat z otyłością: talerz szkolny jak dotąd
  const w4 = await policz(page, { age: 4, sex: 'M', h: 105, centyl: 90 });
  expect(w4.nadmiar).toBe(true);
  expect(zl(w4, 'talerz')).toMatch(/^W wieku 2–4 lat nie stosuje się diety redukcyjnej/u);
  const o6 = await policz(page, { age: 6, sex: 'F', h: 115, w: 27 });
  expect(zl(o6, 'talerz')).toMatch(/^Zalecane jest regularne spożywanie przez dziecko 4–5 zdrowych posiłków/u);
});

test('niedowaga 2–4 lata: Z2 bez liczb, talerz malucha, kontrola co 4–6 tygodni z trudnościami z karmieniem; rata D z „nie należy ograniczać”', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const u3 = await policz(page, { age: 3, sex: 'F', h: 100, w: 12 });
  expect(u3.niedowaga).toBe(true);
  expect(u3.strategia).toBe('przyrost');
  const t = norm(u3.text);
  expect(t).toContain('Przy niedowadze u dziecka nie wyznacza się liczbowej nadwyżki energetycznej');
  expect(t).toContain('z niedowagą wymaga oceny pediatrycznej');
  expect(zl(u3, 'talerz')).toBe('Zalecane jest 5 posiłków dziennie o stałych porach, w spokojnej atmosferze i bez presji przy jedzeniu, z pełnotłustym nabiałem i dodatkami zwiększającymi kaloryczność w małej objętości (masło, oliwa, pasty orzechowe); mleko i soki nie powinny zastępować posiłków ani zaspokajać głodu między nimi; nie należy ograniczać jakichkolwiek grup produktów.');
  expect(u3.zdania.kontrola.length).toBe(2);
  expect(norm(u3.zdania.kontrola[0])).toContain('Niedowaga u dziecka wymaga oceny przyczyn klinicznych');
  expect(norm(u3.zdania.kontrola[1])).toBe('Wskazana kontrola masy ciała i wzrostu co 4–6 tygodni na siatkach centylowych; brak przyrostu, spadek centyla lub narastające trudności z karmieniem wymagają wcześniejszej oceny.');
  expect(t).not.toContain('zaburzeń odżywiania');
  expect(t).not.toMatch(/nadwyżk[aę] \d|kcal więcej/u);
  // 2 lata 0 mies. też dostaje komplet; 1 rok 11 mies. — jak przed ratą E (tylko klasyfikacja, normy, ruch, kontrola raty A)
  const u2 = await policz(page, { age: 2, sex: 'M', h: 88, w: 9.5 });
  expect(u2.niedowaga).toBe(true);
  expect(u2.zdania.talerz).toBeDefined();
  expect(u2.zdania.kontrola.length).toBe(2);
  const u1 = await policz(page, { age: 1, months: 11, sex: 'M', h: 86, w: 9.2 });
  expect(u1.niedowaga).toBe(true);
  expect(u1.zdania.talerz).toBeUndefined();
  expect(u1.zdania.kontrola.length).toBe(1);
  expect(norm(u1.text)).not.toContain('nie wyznacza');
  // rata D (5–10 lat i nastolatek): nowe brzmienie końcówki talerza
  const d8 = await policz(page, { age: 8, sex: 'F', h: 128, centyl: 4 });
  expect(zl(d8, 'talerz')).toMatch(/pełnotłusty nabiał\); nie należy ograniczać jakichkolwiek grup produktów\.$/u);
  expect(norm(d8.zdania.kontrola[1])).toContain('cechy zaburzeń odżywiania wymagają wcześniejszej oceny');
  const n12 = await policz(page, { age: 12, sex: 'F', h: 150, centyl: 4 });
  expect(zl(n12, 'talerz')).toMatch(/i awokado; nie należy ograniczać jakichkolwiek grup produktów\.$/u);
  expect(d8.punkty.talerz).toContain('nie ograniczać grup produktów');
});

test('punkty: nowe klucze 2–4 lat cytują zdania (liczby i słowa)', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const zloz = (s) => norm(s).toLowerCase().replace(/[ąćęłńóśźż]/g, (c) => 'acelnoszz'['ąćęłńóśźż'.indexOf(c)]);
  const LICZBY = /\d+(?:[.,]\d+)?/g; const SLOWA = /[0-9a-z-]+/g;
  const RAMA = new Set(['wiecej', 'mniej', 'zamiast', 'codziennie', 'notowanie', 'obserwacja']);
  const przypadki = [
    { age: 3, sex: 'F', h: 100, w: 15.5 },
    { age: 3, sex: 'F', h: 100, w: 22 },
    { age: 3, sex: 'F', h: 100, w: 12 },
    { age: 2, sex: 'M', h: 88, w: 12.5 }
  ];
  for (const s of przypadki) {
    const w = await policz(page, s);
    expect(Object.keys(w.punkty).sort(), JSON.stringify(s)).toEqual(Object.keys(w.zdania).sort());
    Object.keys(w.punkty).forEach((rola) => {
      const zdanie = norm((w.zdania[rola] || []).join(' '));
      const liczby = new Set(zdanie.match(LICZBY) || []);
      const rdzenie = new Set((zloz(zdanie).match(SLOWA) || []).map((x) => x.slice(0, 4)));
      w.punkty[rola].forEach((p) => {
        (norm(p).match(LICZBY) || []).forEach((n) => { expect(liczby, `${JSON.stringify(s)} / ${rola}: liczba „${n}”`).toContain(n); });
        (zloz(p).match(SLOWA) || []).filter((x) => x.length >= 5 && !RAMA.has(x)).forEach((x) => { expect(rdzenie, `${JSON.stringify(s)} / ${rola}: słowo „${x}”`).toContain(x.slice(0, 4)); });
      });
    });
    expect(w.punkty.ruch.length).toBe(5); // 3 punkty ruchu WHO + ekran + sen
  }
});
