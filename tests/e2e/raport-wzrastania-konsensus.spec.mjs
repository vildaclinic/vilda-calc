import { expect, test } from '@playwright/test';

// ADV-REPORT-3, etap 3 naprawy Raportu wzrastania. Sprawdza WPIĘCIE: czy podsumowanie
// raportu naprawdę czyta model prognozy publikowany przez kartę, a nie surowe wyjścia
// silników. Karta i zalecenia dietetyczne liczą konsensusem, a raport dotąd drukował
// dwie–trzy pojedyncze metody i żadnej liczby wynikowej — ten sam pacjent miał trzy
// różne liczby w trzech miejscach aplikacji. Dane wyłącznie FIKCYJNE.

test('ADV-REPORT-3: podsumowanie raportu podaje ten sam konsensus, co karta', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.calculateGrowthAdvanced === 'function' && !!window.VildaAdvancedGrowth);

  const out = await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    window.professionalMode = true;
    set('age', 10); set('ageMonths', 0); set('sex', 'F');
    set('height', 145); set('weight', 55);
    set('advMotherHeight', 165); set('advFatherHeight', 178); set('advBoneAge', 9);
    window.calculateGrowthAdvanced();
    const api = window.VildaAdvancedGrowth;
    const fhp = (window.advancedGrowthData || {}).finalHeightPrediction || null;
    const model = api.advGrowthBuildReportPresentationModel(api.advGrowthBuildReportRows());
    return {
      fhpCm: fhp ? fhp.cm : null,
      fhpLabel: fhp ? fhp.sourceLabel : null,
      methodCount: fhp && Array.isArray(fhp.methods) ? fhp.methods.length : 0,
      summary: model.summaryItems.join(' | '),
    };
  });

  expect(out.fhpCm).toBeGreaterThan(100);
  expect(out.methodCount).toBeGreaterThanOrEqual(2);

  // 1. liczba w raporcie = liczba konsensusu z karty, co do 0,1 cm
  const cm = out.fhpCm.toFixed(1).replace('.', ',');
  expect(out.summary).toContain(`Prognoza wzrostu ostatecznego (${out.fhpLabel}): ${cm}`);

  // 2. stary format „Prognoza wzrostu ostatecznego (Bayley-Pinneau): …" znika — ta sama
  //    metoda nie występuje już dwa razy z dwiema różnymi liczbami
  expect(out.summary).not.toContain('Prognoza wzrostu ostatecznego (Bayley-Pinneau)');
  expect(out.summary).not.toContain('Prognoza wzrostu ostatecznego (RWT)');

  // 3. zgodność metod — informacja, której raport nie miał wcale
  expect(out.summary).toContain('Zgodność metod:');
});

// ADV-REPORT-4: dane kliniczne, które raport miał pod ręką i pomijał — wiek kostny wraz
// z wielkością opóźnienia, pasmo celu rodzicielskiego z odniesieniem prognozy do celu
// oraz blok pokwitaniowy. Sprawdza WPIĘCIE na prawdziwej stronie, nie sam budowniczy.
test('ADV-REPORT-4: podsumowanie podaje wiek kostny i pasmo celu rodzicielskiego', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.calculateGrowthAdvanced === 'function' && !!window.VildaAdvancedGrowth);

  const out = await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    window.professionalMode = true;
    set('age', 10); set('ageMonths', 0); set('sex', 'F');
    set('height', 145); set('weight', 55);
    set('advMotherHeight', 165); set('advFatherHeight', 178); set('advBoneAge', 8); // wiek kostny 2 lata niżej
    window.calculateGrowthAdvanced();
    const api = window.VildaAdvancedGrowth;
    const d = window.advancedGrowthData || {};
    const model = api.advGrowthBuildReportPresentationModel(api.advGrowthBuildReportRows());
    return { boneAgeMonths: d.boneAgeMonths, summary: model.summaryItems.join(' | ') };
  });

  expect(out.boneAgeMonths).toBe(96);
  // wiek kostny z wielkością opóźnienia — dotąd raport ostrzegał przed skutkiem, nie podając przyczyny
  expect(out.summary).toContain('Wiek kostny: 8 lat');
  expect(out.summary).toContain('opóźniony o 24 mies.');
  // pasmo celu rodzicielskiego zamiast samej liczby MPH
  expect(out.summary).toContain('pasmo celu');
});

