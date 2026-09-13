import { expect, test } from '@playwright/test';

// ADV-REPORT-7, etap 7 i ostatni naprawy Raportu wzrastania. Sprawdza WPIĘCIE na prawdziwej
// stronie: czy przełącznik naprawdę istnieje w kontrolkach raportu, czy jest domyślnie
// wyłączony i czy po zaznaczeniu znika nazwisko z OBU miejsc — z nagłówka i z nazwy pliku.
// Dane wyłącznie FIKCYJNE.

test('ADV-REPORT-7: przełącznik anonimizacji zdejmuje nazwisko z nagłówka i z nazwy pliku', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.calculateGrowthAdvanced === 'function' && !!window.VildaAdvancedGrowth);

  const out = await page.evaluate(async () => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    window.professionalMode = true;
    set('age', 10); set('ageMonths', 0); set('sex', 'F');
    set('height', 140); set('weight', 33);
    set('advMotherHeight', 165); set('advFatherHeight', 178); set('advBoneAge', 10);
    const pole = document.getElementById('advName') || document.getElementById('name');
    if (pole) pole.value = 'Zofia Przykładowska';
    window.calculateGrowthAdvanced();

    const api = window.VildaAdvancedGrowth;
    api.ensureAdvancedGrowthReportControls();
    const chk = document.getElementById('advReportAnon');

    const model = () => api.advGrowthBuildReportPresentationModel(api.advGrowthBuildReportRows());
    const przed = model();
    const domyslnie = chk ? chk.checked : null;

    if (chk) { chk.checked = true; }
    const po = model();

    return {
      maPrzelacznik: !!chk,
      domyslnie,
      nazwaPrzed: przed.nameValue,
      nazwaPo: po.nameValue,
      podsumowaniePrzed: przed.summaryItems.join(' | '),
      podsumowaniePo: po.summaryItems.join(' | '),
      plikPrzed: api.advGrowthResolveReportPatientName(),
    };
  });

  expect(out.maPrzelacznik).toBe(true);
  // Domyślnie wyłączony — wydruk zachowuje się jak dotąd, dopóki lekarz sam nie zdecyduje.
  expect(out.domyslnie).toBe(false);
  expect(out.nazwaPrzed).toBe('Zofia Przykładowska');
  expect(out.podsumowaniePrzed).toContain('Pacjent: Zofia Przykładowska');
  // Po zaznaczeniu nazwisko znika z nagłówka…
  expect(out.nazwaPo).toBe('Z.P.');
  expect(out.podsumowaniePo).toContain('Pacjent: Z.P.');
  expect(out.podsumowaniePo).not.toContain('Przykładowska');
  // …i z nazwy pliku, bo obie idą przez ten sam punkt.
  expect(out.plikPrzed).toBe('Z.P.');
});
