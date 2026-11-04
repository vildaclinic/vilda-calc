import { expect, test } from '../support/test-czas.mjs';
import { otworzBadania, otworzSejf, sekcjaBadan, czekajNaBadania, zapiszHistorie } from '../support/lab-historia-dane.mjs';
import { czekajNaHistorie, sekcjaHistorii } from '../support/karta-czekanie.mjs';

// LAB-HISTORIA PR2: zakładka „Badania” w karcie pacjenta na desktopie. Każdy test zakłada świeży, fikcyjny sejf
// w osobnym kontekście przeglądarki (tests/support/lab-historia-dane.mjs). Zegar stron: 17.06.2026.
test.use({ serviceWorkers: 'block' });

const wynik = (badania, id) => badania.locator(`.vilda-lab-hist-result-row[data-note-id="${id}"]`);
const szczegoly = (badania, id) => badania.locator(`.vilda-lab-hist-result-details[data-note-id="${id}"]`);

test('Badania: domyślnie wyniki według dat, zapisane normy i kolory bez rozbudowanych ocen', async ({ page }) => {
  const patientId = await otworzSejf(page);
  const ids = await zapiszHistorie(page, patientId);
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid), patientId);
  await expect(page.locator('.vilda-patient-tabs > .vilda-patient-tab')).toHaveText(['Status', 'Siatki centylowe', 'Notatki', 'Historia', 'Badania', 'Plany opieki']);
  await page.locator('.vilda-patient-tab[data-tab="lab"]').click();
  await czekajNaBadania(page);
  const badania = sekcjaBadan(page);
  await expect(page.locator('.vilda-patient-tab[data-tab="lab"]')).toHaveClass(/vilda-patient-tab--active/);

  await expect(badania.getByRole('heading', { name: 'Wyniki badań', exact: true })).toBeVisible();
  await expect(badania.locator('.vilda-lab-hist-summary')).toHaveCount(0);
  await expect(badania.locator('.vilda-lab-hist-segment-btn[aria-pressed="true"]')).toHaveText('Tabela');
  await expect(badania.locator('.vilda-lab-hist-result-row')).toHaveCount(14);
  expect(await badania.locator('.vilda-lab-hist-result-row').evaluateAll((rows) =>
    [...new Set(rows.map((row) => row.getAttribute('data-series')))].sort()))
    .toEqual(['ft3', 'ft4', 'lh', 'prolactin', 'tsh']);
  expect(await badania.locator('.vilda-lab-hist-date-group').evaluateAll((groups) => groups.map((group) => group.getAttribute('data-date-iso'))))
    .toEqual(['2026-06-02', '2026-04-08', '2026-02-25', '2026-01-14']);
  await expect(badania.locator('.vilda-lab-hist-pending')).toContainText('Oczekujące wyniki (1)');
  await expect(badania.locator('.vilda-lab-hist-pending-title')).toHaveText('Kontrola TSH · termin 16.06.26');
  // Zlecenie z minionym terminem jest w liście przypomnień, więc odnośnik do arkusza jest widoczny.
  await expect(badania.locator('button.vilda-lab-hist-link', { hasText: 'Przypomnienia →' })).toBeVisible();

  const tsh = wynik(badania, ids.tsh4), ft4 = wynik(badania, ids.ft44);
  await expect(tsh).toContainText('0,12');
  await expect(tsh.locator('.vilda-lab-hist-result-norm')).toHaveText(/0,27.*4,2.*mIU\/L/);
  await expect(tsh.locator('.vilda-lab-hist-cell-value.tone-below')).toHaveCSS('color', 'rgb(207, 34, 46)');
  await expect(tsh).toContainText('↓');
  await expect(ft4).toContainText('17,8');
  await expect(ft4.locator('.vilda-lab-hist-result-norm')).toHaveText(/12.*22.*pmol\/L/);
  await expect(ft4.locator('.vilda-lab-hist-cell-value.tone-within')).toHaveCSS('color', 'rgb(8, 127, 91)');
  // Brak normy nie staje się prawidłowym wynikiem. Nierozpoznana jednostka i cenzorowanie zachowują zapis.
  await expect(wynik(badania, ids.ft3).locator('.vilda-lab-hist-result-norm')).toHaveText('—');
  await expect(wynik(badania, ids.ft3).locator('.tone-within')).toHaveCount(0);
  await expect(wynik(badania, ids.prl2)).toContainText('250');
  await expect(wynik(badania, ids.prl2)).toContainText('mU/l');
  await expect(wynik(badania, ids.prl2).locator('.tone-within')).toHaveCount(0);
  await expect(wynik(badania, ids.lh1)).toContainText('<0,1');
  await expect(wynik(badania, ids.lh1).locator('.tone-within')).toHaveCount(0);
  await expect(badania.locator('.vilda-lab-assessment-history-row, .vilda-lab-hist-comments')).toHaveCount(0);
  await expect(badania).not.toContainText('Fikcyjny komentarz LH');
  await expect(badania).not.toContainText('Zapisane oceny');
  await expect(badania.locator('.vilda-lab-hist-footer-main')).toHaveText('Wyniki pokazane tak, jak je zapisano. Historia nie jest oceniana dzisiejszymi normami.');
  // Filtry i wpisane zapytanie działają w obu widokach; przełączenie nie gubi wyboru.
  const panel = badania.getByRole('combobox', { name: 'Panel badań', exact: true });
  const search = badania.getByRole('searchbox', { name: 'Szukaj badania', exact: true });
  await expect(panel.locator('option[value="all"]')).toHaveText('Wszystkie wyniki');
  await panel.selectOption('thyroid');
  await expect(badania.locator('.vilda-lab-hist-result-row')).toHaveCount(9);
  await search.fill('fT4');
  await expect(badania.locator('.vilda-lab-hist-result-row')).toHaveCount(4);
  await badania.locator('.vilda-lab-hist-segment-btn', { hasText: 'Wykresy' }).click();
  await expect(search).toHaveValue('fT4');
  await expect(panel).toHaveValue('thyroid');
  await expect(badania.locator('.vilda-lab-hist-card')).toHaveCount(1);
  await expect(badania.locator('.vilda-lab-hist-card[data-series="ft4"]')).toBeVisible();
  await badania.getByRole('button', { name: 'Wyczyść wyszukiwanie badań', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(panel).toHaveValue('thyroid');
  await expect(badania.locator('.vilda-lab-hist-card')).toHaveCount(3);
  await badania.locator('.vilda-lab-hist-segment-btn', { hasText: 'Tabela' }).click();
  await expect(badania.locator('.vilda-lab-hist-result-row')).toHaveCount(9);
  await panel.selectOption('all');
  await expect(badania.locator('.vilda-lab-hist-result-row')).toHaveCount(14);
});

test('Wykresy: zapisane normy i punkty właściwych wpisów; wybór widoku zostaje po ponownym otwarciu karty', async ({ page }) => {
  const patientId = await otworzSejf(page);
  const ids = await zapiszHistorie(page, patientId);
  await otworzBadania(page, patientId);
  const badania = sekcjaBadan(page);
  await badania.locator('.vilda-lab-hist-segment-btn', { hasText: 'Wykresy' }).click();
  await expect(badania.locator('.vilda-lab-hist-segment-btn[aria-pressed="true"]')).toHaveText('Wykresy');
  const tsh = badania.locator('.vilda-lab-hist-card[data-series="tsh"]');
  await expect(tsh.locator('svg.vilda-lab-result-chart-svg')).toHaveCount(1);
  await expect(tsh).toContainText(/0,27.*4,2/);
  await expect(tsh.locator('.vilda-lab-result-chart-point[data-note-id]')).toHaveCount(4);
  await expect(tsh.locator(`.vilda-lab-result-chart-point[data-note-id="${ids.tsh4}"]`)).toHaveCount(1);
  const ft4 = badania.locator('.vilda-lab-hist-card[data-series="ft4"]');
  await expect(ft4).toContainText(/12.*22/);
  await expect(ft4.locator('.vilda-lab-result-chart-point[data-note-id]')).toHaveCount(4);
  // Wynik <0,1 nie jest sztucznym zerem ani dokładnym punktem na wykresie.
  const lh = badania.locator('.vilda-lab-hist-card[data-series="lh"]');
  await expect(lh.locator('.vilda-lab-result-chart-point[data-note-id]')).toHaveCount(2);
  await expect(lh.locator(`.vilda-lab-result-chart-point[data-note-id="${ids.lh1}"]`)).toHaveCount(0);
  await expect(badania.locator('.vilda-lab-assessment-history-row')).toHaveCount(0);
  await expect(badania).toContainText('Tiamazol');
  await expect(badania).toContainText('30 mg');
  await expect(badania).toContainText('20 mg');
  await expect(badania).toContainText('10 mg');
  expect(await page.evaluate((pid) => sessionStorage.getItem(`vilda-lab-hist-view-${pid}`), patientId)).toBe('charts');

  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'lab' }), patientId);
  await czekajNaBadania(page);
  await expect(sekcjaBadan(page).locator('.vilda-lab-hist-segment-btn[aria-pressed="true"]')).toHaveText('Wykresy');
  await sekcjaBadan(page).locator('.vilda-lab-hist-segment-btn', { hasText: 'Tabela' }).click();
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'lab' }), patientId);
  await czekajNaBadania(page);
  await expect(sekcjaBadan(page).locator('.vilda-lab-hist-segment-btn[aria-pressed="true"]')).toHaveText('Tabela');
});

test('wyniki tego samego dnia i nakładające się zera zachowują normy, kolory oraz dostęp do każdego wpisu; blokada usuwa podgląd', async ({ page }) => {
  const patientId = await otworzSejf(page);
  const ids = await page.evaluate(async (pid) => {
    const save = (value, norm) => window.VildaVault.savePatientNote({
      patientId: pid, title: 'Fikcyjny wynik TSH', body: '', category: 'wynik-badania', clinicalDateISO: '2026-06-10',
      labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: String(value), valueNum: value, unit: 'mIU/L', norm },
    });
    return {
      zero: (await save(0, '0,27–4,2 mIU/L')).id,
      zeroTwin: (await save(0, '0,6–4,5 mIU/L')).id,
      high: (await save(6.2, '0,6–4,5 mIU/L')).id,
    };
  }, patientId);
  await otworzBadania(page, patientId);
  const badania = sekcjaBadan(page);
  await expect(badania.locator('.vilda-lab-hist-date-group')).toHaveCount(1);
  await expect(badania.locator('.vilda-lab-hist-result-row')).toHaveCount(3);
  const zero = wynik(badania, ids.zero), high = wynik(badania, ids.high);
  await expect(zero.locator('.vilda-lab-hist-cell-value')).toHaveText('0');
  await expect(zero.locator('.vilda-lab-hist-result-norm')).toHaveText(/0,27.*4,2/);
  await expect(zero.locator('.vilda-lab-hist-cell-value.tone-below')).toHaveCSS('color', 'rgb(207, 34, 46)');
  await expect(high.locator('.vilda-lab-hist-result-norm')).toHaveText(/0,6.*4,5/);
  await expect(high.locator('.vilda-lab-hist-cell-value.tone-above')).toHaveCSS('color', 'rgb(207, 34, 46)');
  await high.click();
  await expect(szczegoly(badania, ids.high)).toContainText(/0,6.*4,5/);
  await page.keyboard.press('Escape');
  await expect(szczegoly(badania, ids.high)).toHaveCount(0);
  await badania.locator('.vilda-lab-hist-segment-btn', { hasText: 'Wykresy' }).click();
  const chart = badania.locator('.vilda-lab-hist-card[data-series="tsh"] .vilda-lab-result-chart');
  await expect(chart.locator(`.vilda-lab-result-chart-point[data-note-id="${ids.high}"]`)).toHaveCount(1);
  const shared = chart.locator('.vilda-lab-result-chart-point[data-count="2"]');
  await expect(shared).toHaveCount(1);
  await shared.click();
  const chooser = chart.locator('.vilda-lab-result-chart-chooser');
  await expect(chooser).toBeVisible();
  await expect(chooser.locator('.vilda-lab-result-chart-choice')).toHaveCount(2);
  expect(await chooser.locator('.vilda-lab-result-chart-choice').evaluateAll((choices) => choices.every((choice) => choice.getBoundingClientRect().height >= 44))).toBe(true);
  await chooser.locator(`.vilda-lab-result-chart-choice[data-note-id="${ids.zero}"]`).click();
  await expect(szczegoly(badania, ids.zero)).toContainText(/0,27.*4,2/);
  await expect(szczegoly(badania, ids.high)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await shared.click();
  await expect(chooser).toBeVisible();
  await chooser.locator(`.vilda-lab-result-chart-choice[data-note-id="${ids.zeroTwin}"]`).click();
  await expect(szczegoly(badania, ids.zeroTwin)).toContainText(/0,6.*4,5/);
  await expect(szczegoly(badania, ids.zero)).toHaveCount(0);
  await page.evaluate(() => window.VildaVault.lock('manual'));
  await expect(page.locator('.vilda-lab-hist-result-details, .vilda-lab-hist-result-row')).toHaveCount(0);
});

test('akcje: szczegóły wyniku prowadzą do edycji, „+ Dodaj wynik” i „Wpisz wynik” zachowują formularze i zamknięcie zlecenia', async ({ page }) => {
  const patientId = await otworzSejf(page);
  const ids = await zapiszHistorie(page, patientId);
  await otworzBadania(page, patientId);
  const badania = sekcjaBadan(page);
  const edytor = page.locator('.b3-template-select');

  await wynik(badania, ids.tsh4).click();
  const podglad = szczegoly(badania, ids.tsh4);
  await expect(podglad).toBeVisible();
  await expect(podglad).toContainText('0,12');
  await expect(podglad).toContainText(/0,27.*4,2/);
  await expect(podglad).toContainText('kontrola po redukcji do 10 mg');
  await podglad.getByRole('button', { name: 'Edytuj wpis', exact: true }).click();
  await expect(edytor).toHaveValue('lab');
  await expect(page.locator('.b3-lab-test')).toHaveValue('TSH (tyreotropina)');
  await page.keyboard.press('Escape');
  await expect(edytor).toHaveCount(0);

  await badania.getByRole('button', { name: '+ Dodaj wynik' }).click();
  await expect(edytor).toHaveValue('lab');
  await expect(page.locator('input[name="b3-anchor"][value="date"]')).toBeChecked();
  await expect(page.locator('.b3-clinical-date')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(edytor).toHaveCount(0);

  await badania.getByRole('button', { name: 'Wpisz wynik' }).click();
  await expect(edytor).toHaveValue('lab');
  await expect(page.locator('.b3-lab-test')).toHaveValue('TSH (tyreotropina)');
  await expect(page.locator('input[name="b3-anchor"][value="date"]')).toBeChecked();
  await expect(page.locator('.b3-clinical-date')).toBeFocused();
  // Wpisanie wyniku zamyka zlecenie: wpis przenosi się z „Oczekujących” do serii TSH.
  await page.locator('.b3-clinical-date').fill('2026-06-16');
  await page.locator('.b3-lab-value-row input').first().fill('0,4');
  await page.getByRole('dialog', { name: /Edytuj notatkę/ }).getByRole('button', { name: 'Zapisz zmiany' }).click();
  await expect(edytor).toHaveCount(0);
  await expect(badania.locator('.vilda-lab-hist-pending')).toHaveCount(0);
  await expect(wynik(badania, ids.zlecenie)).toContainText('0,4');
});

test('Historia bez sekcji „Trend wyników”: odnośnik przełącza na zakładkę Badania', async ({ page }) => {
  const patientId = await otworzSejf(page);
  await zapiszHistorie(page, patientId);
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  await czekajNaHistorie(page);
  await expect(sekcjaHistorii(page).locator('.vilda-lab-trend-section')).toHaveCount(0);
  const link = sekcjaHistorii(page).getByRole('button', { name: 'Trend i porównanie wyników są w zakładce Badania →' });
  await expect(link).toBeVisible();
  await link.click();
  await czekajNaBadania(page);
  await expect(page.locator('.vilda-patient-tab[data-tab="lab"]')).toHaveClass(/vilda-patient-tab--active/);
  await expect(sekcjaBadan(page).locator('.vilda-lab-hist-result-row')).toHaveCount(14);
});

test('pacjent bez wyników: stan pusty; Historia bez odnośnika', async ({ page }) => {
  const patientId = await otworzSejf(page);
  await otworzBadania(page, patientId);
  await expect(sekcjaBadan(page).locator('.vilda-lab-hist-empty')).toContainText('Brak zapisanych wyników badań.');
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  await czekajNaHistorie(page);
  await expect(sekcjaHistorii(page).locator('.vilda-lab-trend-link')).toHaveCount(0);
});

test('okna 1100 i 1440 px: sześć zakładek w jednym wierszu bez uciętych etykiet', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  const patientId = await otworzSejf(page);
  for (const width of [1100, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid), patientId);
    const zakladki = page.locator('.vilda-patient-tabs > .vilda-patient-tab');
    await expect(zakladki).toHaveCount(6);
    await expect(zakladki.locator('.vilda-patient-tab-lbl')).toHaveCount(6);
    const pomiar = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.vilda-patient-tabs > .vilda-patient-tab')];
      return {
        wiersze: new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top))).size,
        uciete: tabs.map((t) => t.querySelector('.vilda-patient-tab-lbl')).filter((l) => l.scrollWidth > l.clientWidth + 1).map((l) => l.textContent),
      };
    });
    expect(pomiar, `etykiety zakładek przy szerokości okna ${width} px`).toEqual({ wiersze: 1, uciete: [] });
  }
});
