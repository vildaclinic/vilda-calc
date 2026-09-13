import { expect, test } from '@playwright/test';

// ADV-REPORT-1 (decyzja właściciela 2026-09-13), etap 1 naprawy Raportu wzrastania.
// Tabela raportu czyta świeże pola formularza, a blok prognoz pamięć ostatniego
// przeliczenia karty. Po zmianie danych bez kliknięcia „Oblicz" wydruk łączył nowe
// pomiary ze starymi prognozami i nic tego nie sygnalizowało. Teraz odcisk wejścia
// wykrywa rozjazd, a model raportu przy nieaktualnych prognozach ich NIE drukuje.
// Test jedzie PRAWDZIWĄ ścieżką produkcyjną na index.html (AGENTS.md §3.5).
// Dane wyłącznie FIKCYJNE.

async function openGrowth(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.calculateGrowthAdvanced === 'function'
    && !!window.VildaAdvancedGrowth);
}

// Dziewczynka 10 l, 145 cm / 55 kg, rodzice 165/178, wiek kostny 9 — komplet, z którego
// karta liczy co najmniej dwie metody prognozy.
async function setupPatient(page) {
  return page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    window.professionalMode = true;
    set('age', 10); set('ageMonths', 0); set('sex', 'F');
    set('height', 145); set('weight', 55);
    set('advMotherHeight', 165); set('advFatherHeight', 178); set('advBoneAge', 9);
    window.calculateGrowthAdvanced();
    const api = window.VildaAdvancedGrowth;
    return {
      fresh: api.advGrowthPredictionsMatchCurrentInput(),
      hasBp: !!(window.advancedGrowthData && window.advancedGrowthData.bayleyPinneau),
    };
  });
}

test('ADV-REPORT-1: zmiana danych bez „Oblicz" unieważnia prognozy, a raport ich nie drukuje', async ({ page }) => {
  test.setTimeout(120_000);
  await openGrowth(page);
  const after = await setupPatient(page);
  expect(after.fresh).toBe(true);
  expect(after.hasBp).toBe(true);

  const out = await page.evaluate(() => {
    const api = window.VildaAdvancedGrowth;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    // lekarz poprawia wzrost i NIE przelicza karty
    set('height', 151);
    const staleDetected = api.advGrowthPredictionsMatchCurrentInput() === false;

    const rows = api.advGrowthBuildReportRows();
    const withStale = api.advGrowthBuildReportPresentationModel(
      Object.assign({}, rows, { predictionsFresh: false })
    );
    const withFresh = api.advGrowthBuildReportPresentationModel(rows);
    const joined = (m) => m.summaryItems.join(' | ');
    return {
      staleDetected,
      staleSummary: joined(withStale),
      staleNotes: withStale.noteItems.join(' | '),
      freshSummary: joined(withFresh),
    };
  });

  expect(out.staleDetected).toBe(true);
  // przy nieaktualnych prognozach żadna liczba prognostyczna nie trafia do wydruku
  expect(out.staleSummary).not.toContain('Prognoza wzrostu ostatecznego');
  expect(out.staleSummary).not.toContain('Wiarygodność prognoz');
  expect(out.staleNotes).toContain('Prognoz wzrostu ostatecznego nie wydrukowano');
  // kontrola pozytywna: bez tej flagi blok prognoz nadal powstaje
  expect(out.freshSummary).toContain('Prognoza wzrostu ostatecznego');
});

test('ADV-REPORT-1: punkt aktualny scala się z wierszem historycznym o tym samym wieku', async ({ page }) => {
  test.setTimeout(120_000);
  await openGrowth(page);
  const out = await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    set('age', 10); set('ageMonths', 0); set('sex', 'F');
    set('height', 145); set('weight', 55);
    const api = window.VildaAdvancedGrowth;
    const before = api.advGrowthCollectAllPointsForReport();
    // pusty wiek nie może wyprodukować punktu „0 lat 0 mies. (akt.)"
    set('age', ''); set('ageMonths', '');
    const noAge = api.advGrowthCollectAllPointsForReport();
    return {
      currentCount: before.filter((p) => p.pointType === 'current' || p.isCurrentPoint === true).length,
      zeroAgeRows: noAge.filter((p) => p.ageMonths === 0).length,
    };
  });
  expect(out.currentCount).toBe(1);
  expect(out.zeroAgeRows).toBe(0);
});
