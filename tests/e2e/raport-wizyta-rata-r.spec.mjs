import { expect, test } from '@playwright/test';

// P-RAPORT rata R (decyzje właściciela 2026-09-22): nagłówek „Raportu po wizycie” z faktów na PRAWDZIWEJ stronie.
// Zbieracz faktów czyta klasyfikatory produkcyjne (silnik BMI, ciśnienie dziecka i dorosłego, talia, obwody),
// moduł vilda_raport_naglowek.js składa zdania. Dane pacjentów wyłącznie FIKCYJNE.

const NB = ' ';

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.patientReportBuildModel === 'function'
    && !!window.VildaRaportNaglowek && !!window.VildaBmi && typeof window.buildDietEnergyRecommendationResult === 'function');
}

async function model(page, s) {
  return page.evaluate(async (s) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v, fire) => {
      const el = document.getElementById(id); if (!el) return;
      el.value = v == null ? '' : String(v);
      if (fire) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    };
    window.professionalMode = true; window.intakeHistory = null; window.lastLoadedData = null; window.hasUserModifiedAfterLoad = false;
    ['bpSystolic', 'bpDiastolic', 'heartRate', 'respRate', 'adultBpSystolic', 'adultBpDiastolic', 'adultHeartRate', 'waistCm', 'hipCm', 'headCircumference', 'chestCircumference', 'advMotherHeight', 'advFatherHeight', 'customGoalKg'].forEach((id) => set(id, '', true));
    set('name', 'Testowy Fikcyjny'); set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h);
    Object.entries(s.extra || {}).forEach(([k, v]) => set(k, v, true));
    const sel = document.getElementById('wfhNormsSource');
    if (sel && s.wfh) { sel.value = s.wfh; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    if (typeof window.ensureDietRecommendationsElements === 'function') window.ensureDietRecommendationsElements();
    window.update();
    await new Promise((r) => { setTimeout(r, 400); });
    const m = window.patientReportBuildModel();
    const drab = window.VildaBmi.drabinkaCelow({ wzrostCm: s.h, masaKg: s.w, plec: s.sex, wiekMies: (s.age + (s.months || 0) / 12) * 12, zrodlo: window.bmiSource });
    return {
      h: m.headline,
      html: window.patientReportBuildHtml(m),
      lines: window.getFormattedProfessionalSummaryLines(),
      cole: m.coleCard && m.coleCard.value,
      nut: { badge: m.nutritionCard.badge, note: m.nutritionCard.note, rows: m.nutritionCard.rows.map((r) => `${r.label}: ${r.valueText}`) },
      pierwszy: drab && drab.szczeble && drab.szczeble.length ? drab.szczeble[0].masa : (drab && drab.cel ? drab.cel.masa : null),
      adultBp: window.adultVitalsApi ? window.adultVitalsApi.classifyBloodPressure(s.extra && s.extra.adultBpSystolic, s.extra && s.extra.adultBpDiastolic, window.adultVitalsApi.getState().guidelineKey).key : null,
    };
  }, s);
}

const f1 = (v) => v.toFixed(1).replace('.', ',');

test.describe('P-RAPORT rata R — nagłówek z faktów', () => {
  test('RR-1: dziewczynka 9 lat z otyłością i proporcją masy do wysokości 96 c — bez „jeszcze jednego parametru”; Cole i energia', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await model(page, { age: 9, months: 3, sex: 'F', w: 52.6, h: 146.2, wfh: 'imid' });
    expect(r.lines.some((l) => /^Proporcja masy do wysokości/.test(l))).toBe(true); // linia istnieje, ale nie wchodzi do nagłówka
    expect(r.h.badge).toBe('Otyłość'); expect(r.h.tone).toBe('danger');
    expect(r.h.title).toBe('Masa ciała i BMI są obecnie wyraźnie powyżej typowych wartości dla wieku.');
    expect(r.h.text).toBe(`Pierwszy krok to ok. ${f1(r.pierwszy)}${NB}kg (koniec otyłości), czyli około ${f1(52.6 - r.pierwszy)}${NB}kg mniej.`);
    for (const z of ['Równocześnie', 'jeszcze jeden parametr', 'inne parametry', 'Wymaga omówienia', 'Wynik nieprawidłowy']) expect(r.html, z).not.toContain(z);
    expect(r.cole).toBe(`149,1${NB}%`);
    expect(r.lines.find((l) => l.startsWith('Wskaźnik Cole'))).toBe(`Wskaźnik Cole’a: 149,1${NB}%`);
    expect(r.nut.badge).toBe('umiarkowana aktywność'); expect(r.nut.note).toBe('Poziom aktywności przyjęto domyślnie dla wieku, dopóki lekarz go nie zmieni.'); // P-PAL rata 1: 4–9 lat → 1,6; PAL nietknięty → oznaczony jako domyślny
    expect(r.nut.rows.find((x) => x.startsWith('Białko'))).toMatch(/× 30 kg \(masa referencyjna\) ≈/);
    expect(r.html).not.toMatch(/PAL 1,4|Henry/);
  });

  test('RR-2: dorosły BMI 24,5 z RR 165/100 — nadciśnienie w tytule, BMI w „Dodatkowo” (decyzja 1)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await model(page, { age: 47, sex: 'M', w: 70.8, h: 170, extra: { adultBpSystolic: 165, adultBpDiastolic: 100 } });
    expect(r.adultBp).toBe('hypertension');
    expect(r.h.badge).toBe('Nadciśnienie'); expect(r.h.tone).toBe('danger');
    expect(r.h.title).toBe(`Ciśnienie tętnicze odpowiada nadciśnieniu: 165/100${NB}mm${NB}Hg.`);
    expect(r.h.text).toBe('Rozpoznanie wymaga potwierdzenia w powtarzanych pomiarach; dalsze postępowanie ustalono na wizycie. Dodatkowo BMI (24,5) zbliża się do górnej granicy normy.');
  });

  test('RR-3: dorosły BMI 42, RR 185/125, tętno 108, talia 120 — pilna kontrola, krok „wyjście z otyłości III stopnia”, dwa „Dodatkowo”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await model(page, { age: 47, sex: 'M', w: 121.4, h: 170, extra: { adultBpSystolic: 185, adultBpDiastolic: 125, adultHeartRate: 108, waistCm: 120, hipCm: 110 } });
    expect(r.h.badge).toBe('Pilna kontrola');
    expect(r.h.title).toBe(`Ciśnienie tętnicze jest bardzo wysokie: 185/125${NB}mm${NB}Hg.`);
    expect(r.h.text).toContain('Taki wynik wymaga pilnej kontroli lekarskiej.');
    expect(r.h.text).toContain(`Pierwszy krok to ok. ${f1(r.pierwszy)}${NB}kg (wyjście z otyłości III stopnia)`);
    expect(r.h.text).toContain('Dodatkowo obwód talii wskazuje na otyłość brzuszną: 120,0');
    expect(r.h.text).not.toContain('otyłości II stopnia');
    expect(r.h.dodatkowe.map((d) => d.os)).toEqual(['masa', 'talia']);
  });

  test('RR-4: chłopiec 9 lat, wzrost < 3 c, otyłość — niski wzrost w tytule i krok masy w „Dodatkowo” (decyzja 2)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await model(page, { age: 9, sex: 'M', w: 41.5, h: 123.9 });
    expect(r.h.badge).toBe('Niski wzrost');
    expect(r.h.title).toMatch(new RegExp(`^Wzrost jest wyraźnie niski jak na wiek: 123,9${NB}cm, (poniżej 1\\. centyla|[12]\\. centyl)\\.$`)); // P8 (rata S): etykieta jak w kartach
    expect(r.h.text).toContain('Dodatkowo masa ciała i BMI są wyraźnie powyżej typowych wartości dla wieku');
    expect(r.h.text).toContain(`Pierwszy krok to ok. ${f1(r.pierwszy)}${NB}kg`);
    expect(r.h.subtext).toContain('tempa wzrastania');
  });

  test('RR-5: 1,5 roku z otyłością — bez kroku redukcji (decyzja 3); 18,5 roku — nagłówek dorosły (decyzja 4)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const male = await model(page, { age: 1, months: 6, sex: 'M', w: 13.1, h: 82.3 });
    expect(male.h.badge).toBe('Otyłość');
    expect(male.h.text).toBe('U małych dzieci nie stosuje się odchudzania; celem jest, aby masa ciała rosła wolniej niż wzrost.');
    const d = await model(page, { age: 18, months: 6, sex: 'M', w: 95, h: 175 });
    expect(d.h.badge).toBe('Otyłość I stopnia');
    expect(d.h.title).toBe('BMI wskazuje na otyłość I stopnia.');
    expect(d.h.text).toContain('(koniec otyłości)');
    expect(d.h.text).not.toContain('olbrzymiej');
  });

  test('RR-6: ciśnienie dziecka: < 3 lat zdanie o ocenie przez lekarza (decyzja 6); 9 lat 130/50 „wysokie” i 78/40 „niskie” z centylem', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const m = await model(page, { age: 2, months: 11, sex: 'M', w: 14.5, h: 95, extra: { bpSystolic: 125, bpDiastolic: 85 } });
    expect(m.h.tone).toBe('normal');
    expect(m.h.text).toBe('Ciśnienie tętnicze poniżej 3. roku życia wymaga oceny przez lekarza.');
    const w = await model(page, { age: 9, sex: 'M', w: 31, h: 136.3, extra: { bpSystolic: 130, bpDiastolic: 50 } });
    expect(w.h.badge).toBe('Ciśnienie wysokie'); expect(w.h.tone).toBe('danger');
    expect(w.h.title).toBe(`Ciśnienie tętnicze jest wysokie: 130/50${NB}mm${NB}Hg.`);
    expect(w.h.text).toMatch(/^Ciśnienie skurczowe (powyżej 99\. centyla|na 9\d\. centylu) dla wieku, płci i wzrostu\. Pojedynczy pomiar wymaga potwierdzenia/);
    const n = await model(page, { age: 9, sex: 'M', w: 31, h: 136.3, extra: { bpSystolic: 78, bpDiastolic: 40 } });
    expect(n.h.badge).toBe('Ciśnienie niskie'); expect(n.h.tone).toBe('warn');
    expect(n.h.title).toBe(`Ciśnienie tętnicze jest niskie: 78/40${NB}mm${NB}Hg.`);
  });

  test('RR-7: obwód głowy 43 cm u 1,5-latka — nazwany z kierunkiem i centylem; talia 80 cm u 15-latka', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const g = await model(page, { age: 1, months: 6, sex: 'M', w: 10.9, h: 82.3, extra: { headCircumference: 43 } });
    expect(g.h.badge).toBe('Obwód głowy'); expect(g.h.tone).toBe('danger');
    expect(g.h.title).toMatch(new RegExp(`^Obwód głowy jest mały jak na wiek: 43,0${NB}cm, (poniżej 1\\. centyla|[12]\\. centyl)\\.$`));
    expect(g.html).not.toContain('Szczególnej uwagi wymaga parametr');
    const t = await model(page, { age: 15, sex: 'M', w: 58.9, h: 172.5, extra: { waistCm: 80, hipCm: 115 } });
    expect(t.h.badge).toBe('Obwód talii'); expect(t.h.tone).toBe('warn');
    expect(t.h.title).toMatch(new RegExp(`^Obwód talii jest duży jak na wiek: 80,0${NB}cm, 8\\d\\. centyl\\.$`));
  });
});
