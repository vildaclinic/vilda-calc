import { expect, test } from '@playwright/test';

// P-RAPORT-DANE — generator zalecen energetycznych wystawia liczby, ktore i tak juz policzyl,
// w polu `dane`, zeby raport pacjenta i inne karty nie liczyly ich po raz drugi.
//
// Testy nie sprawdzaja liczb w oderwaniu od tekstu. Sprawdzaja, ze KAZDA liczba z `dane`
// jest dokladnie ta, ktora poszla do zdania — bo cala wartosc tego pola polega na tym, ze
// nie da sie rozjechac danych z tekstem. Zmiana wzoru bez aktualizacji drugiej strony
// wywala te testy.
//
// Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function');
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.VildaDietRecommendations.generateRecommendations === 'function'));
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportFormatIssueList === 'function');
}

// Spacje nierozdzielajace sa w tekscie wszedzie tam, gdzie liczba nie moze zostac oddzielona
// od jednostki. Test porownuje tresc, nie typografie, wiec obie strony ida przez ten sam
// normalizator bialych znakow.
const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

function policz(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true;
    window.__vildaPlanPalTouched = false;
    window.__vildaDietStrategyTouched = false;
    set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h);
    window.ensureDietRecommendationsElements();
    const opcje = s.opcje !== false;
    flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', false);
    flag('nutritionNormsFlag', opcje); flag('journeyFlag', opcje); flag('vitDSuppFlag', opcje); flag('hydrationFlag', opcje);
    if (s.strategia) {
      const bt = document.querySelector('[data-diet-strategy-choice="' + s.strategia + '"]');
      if (bt) bt.click();
    }
    window.update();
    await new Promise((res) => { setTimeout(res, 120); });
    const r = window.VildaDietRecommendations.generateRecommendations();
    // Czas dojscia formatuje sam modul (raz tygodnie, raz miesiace — zaleznie od progu
    // 52 tygodni). Test nie odtwarza tej frazy po swojemu, tylko prosi o nia modul: chodzi
    // o zgodnosc danych z tekstem, a nie o kopie reguly formatowania.
    const fmt = window.VildaDietRecommendations.formatujCzasDojscia;
    const cz = r.dane && r.dane.czasDoNormy;
    return {
      text: r.textOutput || '',
      html: r.htmlOutput || '',
      dane: r.dane,
      czasFmt: cz && typeof fmt === 'function' ? fmt(cz.tygodnie, cz.miesiaceLabel) : null,
      czasRuchFmt: cz && cz.zRuchemTygodnie != null && typeof fmt === 'function' ? fmt(cz.zRuchemTygodnie, null) : null
    };
  }, s);
}

const przecinek = (v, n) => v.toFixed(n).replace('.', ',');

test('dorosly z otyloscia: kazda liczba z dane wraca w zdaniach', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const w = await policz(page, { age: 42, sex: 'M', w: 108, h: 178 });
  const text = norm(w.text);
  const dane = w.dane;

  expect(dane).toBeTruthy();
  expect(dane.wersja).toBe(1);
  expect(dane.dorosly).toBe(true);
  expect(dane.klasyfikacja.klucz).toBe('obesity-1');
  expect(dane.klasyfikacja.otylosc).toBe(true);
  expect(dane.strategia).toBe('reduction');

  // masa: cel i roznica sa tymi samymi liczbami, ktore widzi pacjent
  expect(text).toContain(norm('o ok. ' + przecinek(dane.masa.doRedukcjiKg, 1) + ' kg'));
  expect(text).toContain(norm('wynosi ok. ' + przecinek(dane.masa.docelowaKg, 1) + ' kg'));

  // energia: podaz zaokraglona do 100, deficyt, tempo
  expect(text).toContain(norm('ok. ' + dane.energia.podazZaokrKcal + ' kcal/dzień'));
  expect(text).toContain(norm('ok. ' + dane.energia.deficytKcal + ' kcal/dobę'));
  expect(text).toContain(norm('ok. ' + przecinek(dane.energia.tempoKgTydz, 1) + ' kg/tydzień'));
  expect(dane.energia.podazZaokrKcal).toBe(Math.round(dane.energia.podazKcal / 100) * 100);
  expect(dane.energia.palUzyty).toBeGreaterThan(0);

  // normy zywieniowe: zakres bialka do planowania
  expect(dane.normy).toBeTruthy();
  expect(text).toContain(norm('białko do planowania ' + Math.round(dane.normy.proteinPlanningGramRange[0]) + '–' + Math.round(dane.normy.proteinPlanningGramRange[1]) + ' g/d'));
  expect(dane.normy.zrodlo).toContain('Normy żywienia dla populacji Polski');
  // dane niosa liczby, a nie caly model karty norm ze stanem UI
  expect(dane.normy.model).toBeUndefined();

  // czas dojscia do normy — fraza zlozona przez sam modul z liczb z `dane`
  expect(w.czasFmt).toBeTruthy();
  expect(text).toContain(norm(w.czasFmt));

  // u doroslego generator nie pisze o witaminie D ani o plynach — dane tego nie zmyslaja
  expect(dane.witD).toBeNull();
  expect(dane.plyny).toBeNull();
  expect(dane.wzrastanie).toBeNull();
});

test('dorosly z prawidlowym BMI: brak celu redukcji zamiast celu rownego normie', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const w = await policz(page, { age: 30, sex: 'M', w: 72, h: 180 });
  const dane = w.dane;

  expect(dane.klasyfikacja.nadmiar).toBe(false);
  // P-DIETA-UTRZYMANIE rata B: norma dostaje strategie „utrzymanie" (bez celu redukcji, bez deficytu)
  expect(dane.strategia).toBe('utrzymanie');
  // kontrola ujemna: pacjentowi w normie nie wolno podac „masy docelowej" nizszej od obecnej
  expect(dane.masa.docelowaKg).toBeNull();
  expect(dane.masa.doRedukcjiKg).toBeNull();
  // ale gorna granica normy zostaje — to cecha wzrostu, nie cel terapii
  expect(dane.masa.gornaNormaKg).toBeGreaterThan(dane.pacjent.masaKg);
  expect(norm(w.text)).toContain('mieści się w zakresie prawidłowym');
});

test('nastolatka z otyloscia: masa docelowa, redukcja, witamina D, plyny i czas z tych samych liczb', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const w = await policz(page, { age: 14, months: 6, sex: 'F', w: 75, h: 150 });
  const text = norm(w.text);
  const dane = w.dane;

  expect(dane.dorosly).toBe(false);
  expect(dane.klasyfikacja.otylosc).toBe(true);
  expect(dane.klasyfikacja.klasaBmi.source).toBeTruthy();

  expect(text).toContain(norm('odpowiada masie ok. ' + przecinek(dane.masa.docelowaKg, 1) + ' kg'));
  expect(text).toContain(norm('redukcji o około ' + przecinek(dane.masa.doRedukcjiKg, 1) + ' kg'));

  // kontrola ujemna: masa docelowa to gorna granica normy, a NIE masa przy medianie BMI
  // (mediana to liczba z sasiedniego zdania o przecietnej masie rowiesnika; pomylenie ich
  //  dawalo cel zanizony o kilka kilogramow)
  expect(dane.masa.docelowaKg).not.toBeCloseTo(dane.klasyfikacja.klasaBmi.neededWeightKg, 1);
  expect(Math.abs(dane.pacjent.masaKg - dane.masa.docelowaKg - dane.masa.doRedukcjiKg)).toBeLessThan(0.01);

  expect(text).toContain(norm('około ' + dane.energia.podazZaokrKcal + ' kcal dziennie'));
  expect(text).toContain(norm('około ' + dane.energia.deficytKcal + ' kcal'));
  expect(text).toContain(norm('ok. ' + przecinek(dane.energia.tempoKgTydz, 1) + ' kg tygodniowo'));

  expect(dane.witD.pasmo).toBe('11–18 lat');
  expect(text).toContain(norm('w wieku ' + dane.witD.pasmo + ' ' + dane.witD.std + ' IU dziennie'));
  expect(text).toContain(norm('dawka podwojona – ' + dane.witD.podwojona + ' IU dziennie'));
  expect(text).toContain(norm('Dawki powyżej ' + dane.witD.ul + ' IU dziennie'));

  expect(text).toContain(norm('około ' + String(dane.plyny.litry).replace('.', ',') + ' l dziennie'));

  expect(text).toContain(norm(w.czasFmt));
  expect(text).toContain(norm(w.czasRuchFmt));
  expect(text).toContain(norm('(ok. ' + dane.czasDoNormy.sesjaKcal + ' kcal każda)'));
  expect(dane.czasDoNormy.zRuchemTygodnie).toBeLessThan(dane.czasDoNormy.tygodnie);
});

test('dziecko 6–11 lat: flaga ograniczonego tempa idzie razem ze zdaniem o limicie', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  // Domyslna strategia w tym wieku jest stabilizacja — limit tempa wypisuje sie dopiero
  // po wybraniu redukcji przez lekarza.
  const stab = await policz(page, { age: 8, months: 3, sex: 'M', w: 45, h: 130 });
  expect(stab.dane.strategia).toBe('stabilization');
  // kontrola ujemna: sama „ograniczona" dieta nie wystarczy — bez zdania o limicie flaga
  // musi byc falszywa, inaczej raport napisze pacjentowi o limicie, ktorego nikt nie podal
  expect(norm(stab.text)).not.toContain('ograniczono do ok. 0,5 kg/mies.');
  expect(stab.dane.energia.tempoOgraniczone).toBe(false);

  const w = await policz(page, { age: 8, months: 3, sex: 'M', w: 45, h: 130, strategia: 'reduction' });
  expect(w.dane.strategia).toBe('reduction');
  expect(w.dane.energia.tempoOgraniczone).toBe(true);
  expect(norm(w.text)).toContain(norm('tempo ubytku masy ograniczono do ok. 0,5 kg/mies.'));
  expect(norm(w.text)).toContain(norm('(deficyt ok. ' + w.dane.energia.deficytKcal + ' kcal/dzień)'));
});

test('dziecko w normie i plan bez opcji dodatkowych: dane nie wypelniaja sie na zapas', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  // Najpierw pelny plan z wszystkimi opcjami, zeby zbiornik danych mial co zgubic.
  const zOpcjami = await policz(page, { age: 14, months: 6, sex: 'F', w: 75, h: 150 });
  expect(zOpcjami.dane.normy).toBeTruthy();
  expect(zOpcjami.dane.witD).toBeTruthy();
  expect(zOpcjami.dane.plyny).toBeTruthy();
  expect(zOpcjami.dane.czasDoNormy).toBeTruthy();

  // kontrola ujemna: to samo okno, ten sam pacjent, opcje odznaczone. Gdyby dane z
  // poprzedniego wywolania przeciekly, raport pokazalby zalecenia, ktorych lekarz nie zaznaczyl.
  const bez = await policz(page, { age: 14, months: 6, sex: 'F', w: 75, h: 150, opcje: false });
  // kontrola ujemna: wylaczone opcje dodatkowe nie moga wypelniac danych „na wszelki wypadek"
  expect(bez.dane.normy).toBeNull();
  expect(bez.dane.witD).toBeNull();
  expect(bez.dane.plyny).toBeNull();
  expect(bez.dane.czasDoNormy).toBeNull();
  // ale rdzen planu jest zawsze
  expect(bez.dane.energia.deficytKcal).toBeGreaterThan(0);

  const norma = await policz(page, { age: 12, sex: 'F', w: 40, h: 150 });
  expect(norma.dane.klasyfikacja.nadmiar).toBe(false);
  expect(norma.dane.masa.docelowaKg).toBeNull();
  expect(norm(norma.text)).toContain(norm('Masa ciała mieści się w granicach normy'));
});

test('opakowanie raportu przepuszcza dane dalej', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const wynik = await page.evaluate(async () => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    window.professionalMode = true;
    set('age', 42); set('ageMonths', 0); set('sex', 'M'); set('weight', 108); set('height', 178);
    window.ensureDietRecommendationsElements();
    window.update();
    await new Promise((res) => { setTimeout(res, 120); });
    const r = window.VildaDietRecommendations.buildEnergyRecommendationResult();
    return { maDane: !!(r && r.dane), bmi: r && r.dane ? r.dane.pacjent.bmi : null };
  });
  expect(wynik.maDane).toBe(true);
  expect(wynik.bmi).toBeGreaterThan(30);
});
