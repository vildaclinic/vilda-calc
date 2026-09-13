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

  // 3. ADV-REPORT-9 (decyzja właściciela 2026-09-13): rozpiska metod i linia zgodności znikają
  //    z wydruku — zostaje sama liczba konsensusu. Lekarz ma szczegóły na karcie, na ekranie.
  expect(out.summary).not.toContain('Zgodność metod:');
  expect(out.summary).not.toContain('metoda preferowana');
});

// ADV-REPORT-9: podsumowanie ma zawierać DOKŁADNIE to, co lekarz czyta — i nic ponadto.
// Zgłoszenie właściciela: „za dużo zbędnych informacji". Test wylicza jedno i drugie, więc
// wyłapie zarówno powrót usuniętej linii, jak i zniknięcie potrzebnej.
test('ADV-REPORT-9: podsumowanie niesie tylko linie, które lekarz czyta', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.calculateGrowthAdvanced === 'function' && !!window.VildaAdvancedGrowth);

  const summary = await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    window.professionalMode = true;
    set('age', 9); set('ageMonths', 8); set('sex', 'M');
    set('height', 130); set('weight', 28);
    set('advMotherHeight', 170); set('advFatherHeight', 170); set('advBoneAge', 6);
    window.calculateGrowthAdvanced();
    const api = window.VildaAdvancedGrowth;
    return api.advGrowthBuildReportPresentationModel(api.advGrowthBuildReportRows()).summaryItems;
  });

  const tresc = summary.join(' | ');

  // Zostaje:
  expect(tresc).toContain('Płeć:');
  expect(tresc).toContain('Wzrost Mamy:');
  expect(tresc).toContain('Wzrost Taty:');
  expect(tresc).toContain('MPH (mid-parental height):');
  expect(tresc).toContain('Wiek kostny:');
  expect(tresc).toContain('Wzrost docelowy (potencjał rodzicielski):');
  expect(tresc).toContain('Prognoza wzrostu ostatecznego (');
  expect(tresc).toContain('Obliczenia wykonano na podstawie danych:');
  expect(tresc).toContain('Wygenerowano:');

  // Znika:
  for (const usuniete of [
    'Profil predykcyjny:',
    'Preferowany model dla tego profilu:',
    'Bayley-Pinneau może zawyżać',
    'Pokwitanie:',
    'Zgodność metod:',
    'Wiarygodność prognoz',
    'Punkty historyczne:',
  ]) expect(tresc, `usunięta linia „${usuniete}" nie wraca`).not.toContain(usuniete);

  // Rozpiska metod szła myślnikiem na początku linii — żadna linia tak się nie zaczyna.
  expect(summary.some((l) => l.trim().startsWith('–'))).toBe(false);
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


// ADV-REPORT-5: etykiety centyli. Na prawdziwej stronie sprawdzamy dwie rzeczy naraz —
// że „>100 centyla" nie powstaje nawet przy dziecku poza górnym krańcem siatki, i że
// podsumowanie mówi o centylu jednym formatem (linia MPH miała własny „– centyl: N",
// sąsiednie linie wzrostu rodziców „165 cm, 45 centyl"). Dane wyłącznie FIKCYJNE.
test('ADV-REPORT-5: raport nie mówi „>100 centyla" i ma jeden format centyla', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.calculateGrowthAdvanced === 'function' && !!window.VildaAdvancedGrowth);

  const out = await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    window.professionalMode = true;
    set('age', 10); set('ageMonths', 0); set('sex', 'M');
    set('height', 145); set('weight', 35);
    // Rodzice skrajnie wysocy — MPH ląduje poza górnym krańcem siatki dorosłych,
    // czyli dokładnie w miejscu, w którym raport drukował dotąd „>100 centyla".
    set('advMotherHeight', 190); set('advFatherHeight', 205); set('advBoneAge', 10);
    window.calculateGrowthAdvanced();
    const api = window.VildaAdvancedGrowth;
    const model = api.advGrowthBuildReportPresentationModel(api.advGrowthBuildReportRows());
    return {
      summary: model.summaryItems.join(' | '),
      notes: (model.noteItems || []).join(' | '),
      formatCentile99: typeof window.formatCentile === 'function' ? window.formatCentile(99.95) : null,
    };
  });

  const caly = `${out.summary} | ${out.notes}`;
  expect(caly).not.toContain('>100');
  expect(caly).not.toContain('&gt;100');
  expect(caly).not.toMatch(/\b100 centyl/);
  // Górna skrajność ma brzmieć „>99", i tak samo w pomocniku, z którego raport ją bierze.
  expect(out.formatCentile99).toBe('&gt;99');
  expect(out.summary).toContain('MPH (mid-parental height):');
  // Jeden format: linia MPH nie ma już własnej etykiety „centyl: N".
  expect(out.summary).not.toContain('centyl:');
  expect(out.summary).toMatch(/MPH \(mid-parental height\): [\d,]+ cm, (?:>99|<1|\d+) centyl/);
});
