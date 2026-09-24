import { expect, test } from '@playwright/test';

// P-RAPORT rata Q (decyzje właściciela 2026-09-22): „Raport po wizycie” na PRAWDZIWEJ stronie.
// Karta „Zapotrzebowanie energetyczne” cytuje `dane.energia` generatora zaleceń (ten sam PAL, co plan),
// energię „dla masy prawidłowej” liczy funkcją produkcyjną `energyBuildPlanReductionState`, odniesienia
// masy idą z silnika BMI (mediana BMI przy wzroście dziecka; drabinka celów; granice normy dorosłego).
// Dane pacjentów wyłącznie FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.patientReportBuildModel === 'function'
    && typeof window.buildDietEnergyRecommendationResult === 'function' && typeof window.energyBuildPlanReductionState === 'function' && !!window.VildaBmi);
}

async function ustaw(page, s) {
  await page.evaluate(async (s) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    window.professionalMode = true; window.intakeHistory = null;
    window.lastLoadedData = null; window.hasUserModifiedAfterLoad = false;
    set('name', 'Testowy Fikcyjny'); set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h); set('customGoalKg', '');
    set('bpSystolic', s.bp ? s.bp[0] : ''); set('bpDiastolic', s.bp ? s.bp[1] : ''); set('heartRate', s.hr || '');
    set('adultBpSystolic', s.bp ? s.bp[0] : ''); set('adultBpDiastolic', s.bp ? s.bp[1] : ''); set('adultHeartRate', s.hr || '');
    if (typeof window.ensureDietRecommendationsElements === 'function') window.ensureDietRecommendationsElements();
    window.update();
    await new Promise((r) => { setTimeout(r, 400); });
  }, s);
}

// Model raportu + liczby odniesienia policzone W TEJ SAMEJ stronie prawdziwymi funkcjami produkcyjnymi.
async function modelZOdniesieniem(page, s) {
  return page.evaluate((s) => {
    const m = window.patientReportBuildModel();
    const dane = window.buildDietEnergyRecommendationResult().dane;
    const pal = dane && dane.energia ? dane.energia.palUzyty : null;
    const cel = dane && dane.masa ? dane.masa.docelowaKg : null;
    const st = cel ? window.energyBuildPlanReductionState({ ageYears: s.age + (s.months || 0) / 12, ageMonthsOpt: s.months || 0, sex: s.sex, weightKg: cel, heightCm: s.h, palInput: pal, history: null, intakeKcalPerDay: null, customGoalKg: null, growthEnded: false }) : null;
    const dorosly = s.age >= 19;
    const drab = window.VildaBmi.drabinkaCelow({ wzrostCm: s.h, masaKg: s.w, plec: s.sex, wiekMies: (s.age + (s.months || 0) / 12) * 12, zrodlo: window.bmiSource, dorosly });
    const med = dorosly ? null : window.VildaBmi.mediana(s.sex, (s.age + (s.months || 0) / 12) * 12, window.bmiSource);
    const html = window.patientReportBuildHtml(m);
    const k = m.nutritionCard;
    return {
      nut: { kind: k.kind, title: k.title, badge: k.badge, value: k.value, note: k.note, rows: k.rows.map((r) => `${r.label}: ${r.valueText}`), bialkoDetail: (k.rows.find((r) => r.label === 'Białko') || {}).detail || null },
      dane: dane && { pal, cel, strategia: dane.strategia, podaz: dane.energia.podazZaokrKcal, utrzymanie: dane.energia.utrzymanieKcal, tee: dane.energia.teeBazowyKcal, nadmiar: dane.klasyfikacja && dane.klasyfikacja.nadmiar, niedowaga: dane.klasyfikacja && dane.klasyfikacja.niedowaga },
      // P-DIETA rata V: przy planie otyłości/nadwagi dziecka karta bierze zapotrzebowanie dla masy docelowej z PLANU
      // (generator: celTeeKcal = targetTeeKcal silnika) — jedna liczba z planem; poza tym dawna ścieżka (teeRaw dla masy celu)
      teeCel: dane && dane.energia && dane.energia.celTeeKcal != null && dane.strategia !== 'cel-wlasny' ? dane.energia.celTeeKcal : st ? st.teeRawKcal : null,
      planTeeCel: window.energyBuildPlanReductionState({ ageYears: s.age + (s.months || 0) / 12, ageMonthsOpt: s.months || 0, sex: s.sex, weightKg: s.w, heightCm: s.h, palInput: pal, history: null, intakeKcalPerDay: null, customGoalKg: null, growthEnded: false }).targetTeeKcal,
      teeRawCel: st ? st.teeRawKcal : null,
      drab: drab && { kierunek: drab.kierunek, cel: drab.cel && drab.cel.masa, pierwszy: drab.szczeble && drab.szczeble.length ? drab.szczeble[0] : null },
      medianaBmi: med && med.mediana,
      headline: m.headline,
      cards: m.metricCards.map((c) => ({ key: c.key, badge: c.badge, hideBadge: !!c.hideBadge, note: c.note, ref: c.reference, ref2: c.secondaryReference || null, scale: !!c.scale })),
      sourceLines: m.sourceLines, sourceLabel: m.sourceLabel,
      measurementLabel: m.measurementLabel, generatedLabel: m.generatedLabel, sameDay: m.dateChipsSameDay,
      html,
    };
  }, s);
}

const kcal = (v) => `${Math.round(v)} kcal/d`;

test.describe('P-RAPORT rata Q — Raport po wizycie', () => {
  test('RQ-1: dziewczynka 9 lat z otyłością — energia z generatora, masa wg wzrostu, pierwszy krok, bez „Normy”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const s = { age: 9, months: 3, sex: 'F', w: 52.6, h: 146.2, bp: [104, 61], hr: 86 };
    await ustaw(page, s);
    const r = await modelZOdniesieniem(page, s);
    expect(r.dane.nadmiar).toBe(true);
    expect(r.nut.kind).toBe('energy-demand');
    expect(r.nut.title).toBe('Zapotrzebowanie energetyczne');
    expect(r.nut.badge).toBe(r.dane.pal === 1.4 ? 'mała aktywność' : 'umiarkowana aktywność'); // rata R
    expect(r.nut.badge).not.toBe('Normy');
    // wartość główna = liczba planu z generatora; wiersz celu = funkcja produkcyjna dla masy docelowej generatora
    // P-DIETA rata G1 (F0, decyzja właściciela 2026-09-24): 9-latka z otyłością ma domyślnie stabilizację, a stabilizacja
    // dziecka to utrzymanie masy — zapotrzebowanie przy obecnej masie (jak zdanie „W strategii stabilizacji …”), bez „≤”
    // i nazwy diety. Dotąd karta pokazywała tu „≤” diety lekkiej, choć zalecenia mówiły „bez dodatkowego deficytu”.
    // „≤” przy redukcji dziecka (rata V pkt 1) pilnują: e2e dieta-tempo-rata-g1 (G1-4) i unit raport-wizyta-rata-q.
    expect(r.dane.strategia).toBe('stabilization');
    expect(r.nut.value).toBe(kcal(r.dane.podaz));
    expect(r.nut.rows[0]).toBe(`Dla masy prawidłowej (${r.dane.cel.toFixed(1).replace('.', ',')} kg): ${kcal(r.teeCel)}`);
    // rata V: ta sama liczba co „zapotrzebowanie dla masy docelowej” planu (bez ×1,01 na wzrastanie), nie osobne przeliczenie
    expect(r.teeCel).toBe(r.planTeeCel);
    expect(Math.round(r.teeRawCel)).not.toBe(r.planTeeCel);
    expect(r.nut.rows[1]).toBe(`Plan: utrzymanie masy ciała: ${kcal(r.dane.podaz)}`);
    expect(r.nut.rows.join(' ')).not.toContain('Przy obecnej masie');
    expect(r.nut.rows.join(' ')).not.toContain(kcal(r.dane.tee));
    expect(r.nut.rows.join(' ')).not.toContain(kcal(r.dane.utrzymanie));
    // P-NORMY rata B1: „ok. X g/d”, podstawa (g/kg i masa należna do wzrostu) w podpisie pod etykietą
    expect(r.nut.rows.find((x) => x.startsWith('Białko'))).toMatch(/^Białko: ok\.\u00A0\d+\u00A0g\/d$/);
    expect(r.nut.bialkoDetail).toMatch(/^\d,\d\d\u00A0g na kg należnej masy ciała \(\d+,\d\u00A0kg\)$/);
    expect(r.nut.rows.find((x) => x.startsWith('Węglowodany'))).toBe('Węglowodany: 45–65\u00A0% energii');
    expect(r.nut.rows.find((x) => x.startsWith('Tłuszcze'))).toBe('Tłuszcze: 30–40\u00A0% energii');
    // stara karta: 2412 kcal (masa aktualna × PAL 1,6) — nie ma prawa się pojawić
    expect(r.html).not.toContain('2412');
    expect(r.html).not.toContain('Normy żywieniowe');
    // masa: odniesienie do wzrostu = mediana BMI × wzrost²
    const masaWzrost = r.medianaBmi * (s.h / 100) ** 2;
    // P-NORMY rata B1: białko liczone od tej samej masy należnej do wzrostu, co karta masy
    expect(r.nut.bialkoDetail).toContain(`(${masaWzrost.toFixed(1).replace('.', ',')}\u00A0kg)`);
    const wt = r.cards.find((c) => c.key === 'WT');
    expect(wt.ref.label).toBe('Przeciętna masa dla tego wzrostu i wieku');
    expect(wt.ref.medianText).toBe(`${masaWzrost.toFixed(1).replace('.', ',')} kg`);
    expect(wt.ref.diffText).toBe(`To o ${(s.w - masaWzrost).toFixed(1).replace('.', ',')} kg powyżej tej wartości.`);
    // pierwszy krok = pierwszy szczebel drabinki (ten sam, co plan PDF)
    expect(r.drab.kierunek).toBe('redukcja');
    const pk = r.drab.pierwszy;
    expect(wt.ref2.label).toBe('Pierwszy krok');
    expect(wt.ref2.medianText).toBe(`do ${pk.masa.toFixed(1).replace('.', ',')} kg`);
    expect(r.headline.text).toContain(`Pierwszy krok to ok. ${pk.masa.toFixed(1).replace('.', ',')}\u00A0kg`);
    expect(r.headline.text).not.toContain('obserwowanie trendu');
    expect(r.html).not.toMatch(/Reinehr|doi:/);
    // data pomiaru: bez rekordu sejfu — dzień raportu, jeden czip
    expect(r.sameDay).toBe(true);
    expect(r.html).toContain('Pomiar i raport: ');
  });

  test('RQ-2: mężczyzna 47 lat, BMI 40 — granica 24,9, pierwszy krok, zakresy zamiast średnich populacyjnych, ton', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const s = { age: 47, months: 0, sex: 'M', w: 112, h: 167, bp: [142, 92], hr: 78 };
    await ustaw(page, s);
    const r = await modelZOdniesieniem(page, s);
    const h2 = (s.h / 100) ** 2, gora = 24.9 * h2, dol = 18.5 * h2;
    const f1 = (v) => v.toFixed(1).replace('.', ',');
    const wt = r.cards.find((c) => c.key === 'WT'), ht = r.cards.find((c) => c.key === 'HT'), bmi = r.cards.find((c) => c.key === 'BMI');
    expect(wt.ref.label).toBe('Prawidłowa masa dla tego wzrostu – górna granica (BMI\u00A024,9)');
    expect(wt.ref.medianText).toBe(`${f1(gora)} kg`);
    expect(wt.ref.diffText).toBe(`To o ${f1(s.w - gora)} kg powyżej tej wartości.`);
    expect(wt.ref2.label).toBe('Pierwszy krok');
    expect(wt.ref2.medianText).toBe(`do ${f1(r.drab.pierwszy.masa)} kg`);
    expect(wt.ref2.diffText).toContain('już ta zmiana poprawia ciśnienie i wyniki badań krwi');
    expect(wt.note).toBe('Masa ciała odpowiada otyłości III stopnia w klasyfikacji BMI.');
    // wzrost: bez centyla populacyjnego, zakres prawidłowej masy
    expect(ht.hideBadge).toBe(true); expect(ht.scale).toBe(false);
    expect(ht.ref.medianText).toBe(`${f1(dol)}–${f1(gora)} kg`);
    expect(ht.ref.diffText).toBe(`Obecna masa jest o ${f1(s.w - gora)} kg powyżej tego zakresu.`);
    expect(bmi.ref.medianText).toBe('18,5–24,9');
    expect(bmi.ref.diffText).toBe(`To o ${f1(s.w / h2 - 24.9)} pkt powyżej górnej granicy.`);
    // nagłówek: bez „pilnej konsultacji”, z pierwszym krokiem; brak żargonu i drugiej osoby w PDF
    expect(r.headline.text).toContain('Wynik wymaga leczenia i regularnej kontroli zgodnie z ustaleniami z wizyty.');
    expect(r.headline.text).toContain(`Pierwszy krok to ok. ${f1(r.drab.pierwszy.masa)}\u00A0kg`);
    expect(r.headline.text).not.toContain('pilnej');
    for (const zakazane of ['Główny box', 'Drugi box', 'Twoim', 'Twoja', 'BMI\u00A022', 'BMI 22', 'w Polsce', 'centyla dorosłych', 'przeciętn']) {
      expect(r.html, zakazane).not.toContain(zakazane);
    }
    expect(r.sourceLines).toEqual(['1. Normy żywienia dla populacji Polski, NIZP PZH – PIB, 2024.', '2. Klasyfikacja BMI u dorosłych według WHO.']);
    // energia: cel = masa przy BMI 24,9 (generator), funkcja produkcyjna
    expect(r.dane.cel).toBeCloseTo(gora, 1);
    expect(r.nut.rows[0]).toBe(`Dla masy prawidłowej (${f1(r.dane.cel)} kg): ${kcal(r.teeCel)}`);
    expect(r.nut.value).toBe('\u2264\u202F' + kcal(r.dane.podaz)); // P-DIETA rata Z: u dorosłego górna granica dnia
    expect(r.html).not.toContain('3269');
  });

  test('RQ-3: kobieta 28 lat z niedowagą — dolna granica 18,5, nie BMI 22; bez wiersza „przy obecnej masie”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const s = { age: 28, months: 0, sex: 'F', w: 48, h: 170 };
    await ustaw(page, s);
    const r = await modelZOdniesieniem(page, s);
    const dol = 18.5 * (s.h / 100) ** 2, f1 = (v) => v.toFixed(1).replace('.', ',');
    const wt = r.cards.find((c) => c.key === 'WT');
    expect(wt.ref.label).toBe('Prawidłowa masa dla tego wzrostu – dolna granica (BMI\u00A018,5)');
    expect(wt.ref.medianText).toBe(`${f1(dol)} kg`);
    expect(wt.ref.diffText).toBe(`To o ${f1(dol - s.w)} kg poniżej tej wartości.`);
    expect(wt.ref2).toEqual({ available: true, label: 'Cel: dolna granica normy', medianText: `do ${f1(dol)} kg`, diffText: `czyli ok. ${f1(dol - s.w)} kg więcej.`, neutral: false });
    expect(r.html).not.toContain('63,6 kg'); // dawna „idealna” masa przy BMI 22
    expect(r.dane.niedowaga).toBe(true);
    expect(r.nut.rows[0]).toBe(`Dla masy prawidłowej (${f1(r.dane.cel)} kg): ${kcal(r.teeCel)}`);
    expect(r.nut.rows.join(' ')).not.toContain('Przy obecnej masie');
  });

  test('RQ-4: kobieta 34 lata w normie — „przy obecnej masie” = utrzymanie z generatora, białko z obecnej masy', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const s = { age: 34, months: 0, sex: 'F', w: 62, h: 169 };
    await ustaw(page, s);
    const r = await modelZOdniesieniem(page, s);
    expect(r.dane.nadmiar).toBeFalsy(); expect(r.dane.niedowaga).toBeFalsy();
    expect(r.nut.rows[0]).toBe(`Przy obecnej masie: ${kcal(r.dane.utrzymanie)}`);
    expect(r.nut.value).toBe(kcal(r.dane.utrzymanie));
    expect(r.nut.rows.join(' ')).not.toMatch(/Dla masy|Plan/);
    // P-NORMY rata B1: dorosły — masa należna przy BMI 22 (22 × 1,69² = 62,8 kg), jak w karcie „Normy żywieniowe”; w dokumencie bez słów „BMI 22” (rata Q)
    expect(r.nut.rows.find((x) => x.startsWith('Białko'))).toBe('Białko: ok.\u00A052\u00A0g/d');
    expect(r.nut.bialkoDetail).toBe('0,83\u00A0g na kg należnej masy ciała (62,8\u00A0kg)');
    expect(r.nut.note).toBe('Poziom aktywności przyjęto domyślnie dla wieku, dopóki lekarz go nie zmieni.'); // P-PAL rata 1
    expect(r.cards.find((c) => c.key === 'HT').ref.diffText).toBe('Obecna masa mieści się w tym zakresie.');
    expect(r.cards.find((c) => c.key === 'BMI').ref.diffText).toBe('BMI mieści się w tym zakresie.');
  });

  test('RQ-5: nastolatka 15 lat z niedowagą — cel z drabinki (generator nie oddaje masy docelowej dziecka)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const s = { age: 15, months: 0, sex: 'F', w: 40, h: 165 };
    await ustaw(page, s);
    const r = await modelZOdniesieniem(page, s);
    const f1 = (v) => v.toFixed(1).replace('.', ',');
    expect(r.dane.niedowaga).toBe(true); expect(r.dane.cel).toBeNull();
    expect(r.drab.kierunek).toBe('przyrost');
    const teeCel = await page.evaluate((p) => window.energyBuildPlanReductionState({ ageYears: p.age, ageMonthsOpt: 0, sex: p.sex, weightKg: p.cel, heightCm: p.h, palInput: p.pal, history: null, intakeKcalPerDay: null, customGoalKg: null, growthEnded: false }).teeRawKcal, { ...s, cel: r.drab.cel, pal: r.dane.pal });
    expect(r.nut.rows[0]).toBe(`Dla masy prawidłowej (${f1(r.drab.cel)} kg): ${kcal(teeCel)}`);
    expect(r.cards.find((c) => c.key === 'WT').ref2.label).toBe('Cel: dolna granica normy');
  });

  test('RQ-6: data pomiaru z wczytanego rekordu sejfu; PDF „Raport po wizycie” nadal powstaje', async ({ page }) => {
    test.setTimeout(180_000);
    await otworz(page);
    const s = { age: 9, months: 3, sex: 'F', w: 52.6, h: 146.2 };
    await ustaw(page, s);
    const r = await page.evaluate(async () => {
      window.lastLoadedData = { user: { measuredAtISO: '2026-08-01T10:00:00.000Z' } };
      window.hasUserModifiedAfterLoad = false;
      const m = window.patientReportBuildModel();
      const html = window.patientReportBuildHtml(m);
      window.hasUserModifiedAfterLoad = true;
      const m2 = window.patientReportBuildModel();
      const p = await window.patientReportBuildSelectedPdfPackage(['visit']);
      const bajty = new Uint8Array(await p.blob.arrayBuffer());
      return { measurementLabel: m.measurementLabel, source: m.measurementSource, sameDay: m.dateChipsSameDay, html, poZmianie: m2.measurementSource, pdfBajty: bajty.length, naglowek: String.fromCharCode(...bajty.slice(0, 5)) };
    });
    expect(r.measurementLabel).toBe('01.08.2026'); expect(r.source).toBe('loaded'); expect(r.sameDay).toBe(false);
    expect(r.html).toContain('Pomiar: 01.08.2026');
    expect(r.html).toContain('Raport: ');
    expect(r.poZmianie).toBe('now');
    expect(r.naglowek).toBe('%PDF-'); expect(r.pdfBajty).toBeGreaterThan(20_000);
  });
});
