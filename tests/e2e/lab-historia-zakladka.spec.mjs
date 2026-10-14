import { expect, test } from '../support/test-czas.mjs';
import { otworzBadania, otworzSejf, sekcjaBadan, czekajNaBadania, zapiszHistorie } from '../support/lab-historia-dane.mjs';
import { czekajNaHistorie, sekcjaHistorii } from '../support/karta-czekanie.mjs';

// LAB-HISTORIA PR2: zakładka „Badania” w karcie pacjenta na desktopie. Każdy test zakłada świeży, fikcyjny sejf
// w osobnym kontekście przeglądarki (tests/support/lab-historia-dane.mjs). Zegar stron: 17.06.2026.
test.use({ serviceWorkers: 'block' });

const bezTwardejSpacji = (t) => t.replace(/\u00a0/g, ' ');

test('pięć zakładek; Badania: podsumowanie, panele, oczekujące, karty z wartościami jak zapisano', async ({ page }) => {
  const patientId = await otworzSejf(page);
  await zapiszHistorie(page, patientId);
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid), patientId);
  await expect(page.locator('.vilda-patient-tabs > .vilda-patient-tab')).toHaveText(['Status', 'Siatki centylowe', 'Notatki', 'Historia', 'Badania']);
  await page.locator('.vilda-patient-tab[data-tab="lab"]').click();
  await czekajNaBadania(page);
  const badania = sekcjaBadan(page);
  await expect(page.locator('.vilda-patient-tab[data-tab="lab"]')).toHaveClass(/vilda-patient-tab--active/);

  await expect(badania.locator('.vilda-lab-hist-summary')).toHaveText('14 wyników · 5 badań · ostatnie badanie 02.06.26');
  await expect(badania.locator('.vilda-lab-hist-panel-h')).toHaveText(['Tarczyca', 'Oś gonadalna', 'Inne']);
  await expect(badania.locator('.vilda-lab-hist-segment-btn[aria-pressed="true"]')).toHaveText('Wykresy');
  await expect(badania.locator('.vilda-lab-hist-pending')).toContainText('Oczekujące wyniki (1)');
  await expect(badania.locator('.vilda-lab-hist-pending-title')).toHaveText('Kontrola TSH · termin 16.06.26');
  // Zlecenie z minionym terminem jest w liście przypomnień, więc odnośnik do arkusza jest widoczny.
  await expect(badania.locator('button.vilda-lab-hist-link', { hasText: 'Przypomnienia →' })).toBeVisible();

  const tsh = badania.locator('.vilda-lab-hist-card[data-series="tsh"]');
  await expect(tsh.locator('.vilda-lab-hist-value')).toHaveText('0,12');
  await expect(tsh.locator('.vilda-lab-hist-flag')).toHaveText('↓');
  expect(bezTwardejSpacji(await tsh.locator('.vilda-lab-hist-prev').innerText())).toBe('poprzednio 0,05 mIU/L (08.04.26) · różnica +0,07 mIU/L · po 55 dniach');
  await expect(tsh.locator('svg.vilda-lab-trend-chart')).toHaveCount(1);
  // Pierwszy TSH zapisany w μIU/mL: punkt przeliczony z obwódką, bez strzałki (jak w dawnym trendzie).
  await expect(tsh.locator('svg circle[stroke="#26215C"]')).toHaveCount(1);

  const ft4 = badania.locator('.vilda-lab-hist-card[data-series="ft4"]');
  await expect(ft4.locator('.vilda-lab-hist-value')).toHaveText('17,8');
  await expect(ft4.locator('.vilda-lab-hist-flag')).toHaveCount(0);
  await expect(badania.locator('.vilda-lab-hist-card[data-series="ft3"] .vilda-lab-hist-no-chart')).toHaveText('Za mało dokładnych wyników do wykresu.');

  const lh = badania.locator('.vilda-lab-hist-card[data-series="lh"]');
  await expect(lh.locator('.vilda-lab-hist-status.is-recorded')).toContainText('oceniono jako: dziewczynka · 12 l 2 m w dniu pobrania · Th3');
  await expect(lh.locator('.vilda-lab-hist-foot')).toHaveText('Poza wykresem: 1 (wynik z „<” lub „>”: 1)');
  // Zapisane oceny są rozwinięte od razu (ostrzeżenia kliniczne nie czekają za kliknięciem).
  await expect(lh.locator('.vilda-lab-hist-assess-h')).toHaveText('Zapisane oceny (3)');
  await expect(lh.locator('.vilda-lab-assessment-history-row')).toHaveCount(3);
  await expect(lh.locator('.vilda-lab-assessment-history-row').first()).toBeVisible();

  const prl = badania.locator('.vilda-lab-hist-card[data-series="prolactin"]');
  await expect(prl).toContainText('jednostka nierozpoznana albo brak jednostki — wynik jak zapisano, bez porównania');

  // Bez pasma dzisiejszych norm i bez czerwieni w zakładce (decyzje 6.1, 6.18).
  await expect(badania.locator('.vilda-trend-norm-band, .vilda-trend-norm-tag, .vilda-trend-norm-chip')).toHaveCount(0);
  await expect(badania.locator('[fill="#E24B4A"], [fill="#A32D2D"], [stroke="#efc2c2"]')).toHaveCount(0);
  await expect(badania.locator('.vilda-lab-hist-footer-main')).toHaveText('Wyniki pokazane tak, jak je zapisano. Historia nie jest oceniana dzisiejszymi normami.');
});

test('Tabela: wiersze dat malejąco, różnica pod wartością, wiersze leczenia; wybór widoku zostaje po ponownym otwarciu karty', async ({ page }) => {
  const patientId = await otworzSejf(page);
  await zapiszHistorie(page, patientId);
  await otworzBadania(page, patientId);
  const badania = sekcjaBadan(page);
  await badania.locator('.vilda-lab-hist-segment-btn', { hasText: 'Tabela' }).click();
  await expect(badania.locator('.vilda-lab-hist-segment-btn[aria-pressed="true"]')).toHaveText('Tabela');
  const tarczyca = badania.locator('.vilda-lab-hist-panel[data-panel="thyroid"] table');
  await expect(tarczyca.locator('thead th')).toHaveText(['Data badania', 'TSHmIU/L', 'fT4pmol/L', 'fT3pmol/L', 'Komentarz']);
  await expect(tarczyca.locator('tbody th')).toHaveText(['02.06.26', '08.04.26', '08.04.26', '25.02.26', '25.02.26', '14.01.26', '14.01.26']);
  await expect(tarczyca.locator('tbody tr.vilda-lab-hist-tr-treatment')).toHaveText([/Tiamazol · zmiana dawki · 10 mg/, /Tiamazol · zmiana dawki · 20 mg/, /Tiamazol · włączono · 30 mg/]);
  const pierwszy = tarczyca.locator('tbody tr').first();
  await expect(pierwszy.locator('td').nth(0)).toHaveText('0,12 ↓+0,07');
  await expect(pierwszy.locator('td').last()).toHaveText('kontrola po redukcji do 10 mg');
  await expect(tarczyca.locator('.vilda-lab-hist-cell-value.is-converted')).toHaveText(['27', '0,01']);
  await expect(badania.locator('.vilda-lab-hist-panel[data-panel="other"] .vilda-lab-hist-cell-value')).toHaveText(['250 mU/l*', '12']);
  expect(await page.evaluate((pid) => sessionStorage.getItem(`vilda-lab-hist-view-${pid}`), patientId)).toBe('table');

  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'lab' }), patientId);
  await czekajNaBadania(page);
  await expect(sekcjaBadan(page).locator('.vilda-lab-hist-segment-btn[aria-pressed="true"]')).toHaveText('Tabela');
});

test('akcje: wartość otwiera wpis, „+ Dodaj wynik” i „Wpisz wynik” otwierają edytor z szablonem wyniku i datą badania', async ({ page }) => {
  const patientId = await otworzSejf(page);
  const ids = await zapiszHistorie(page, patientId);
  await otworzBadania(page, patientId);
  const badania = sekcjaBadan(page);
  const edytor = page.locator('.b3-template-select');

  await badania.locator(`.vilda-lab-hist-card[data-series="tsh"] .vilda-lab-hist-value[data-note-id="${ids.tsh4}"]`).click();
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
  await expect(badania.locator('.vilda-lab-hist-card[data-series="tsh"] .vilda-lab-hist-value')).toHaveText('0,4');
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
  await expect(sekcjaBadan(page).locator('.vilda-lab-hist-card[data-series="lh"]')).toBeVisible();
});

test('pacjent bez wyników: stan pusty; Historia bez odnośnika', async ({ page }) => {
  const patientId = await otworzSejf(page);
  await otworzBadania(page, patientId);
  await expect(sekcjaBadan(page).locator('.vilda-lab-hist-empty')).toContainText('Brak zapisanych wyników badań.');
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  await czekajNaHistorie(page);
  await expect(sekcjaHistorii(page).locator('.vilda-lab-trend-link')).toHaveCount(0);
});

test('okno 1100 px (karta ok. 675 px): pięć zakładek w jednym wierszu bez uciętych etykiet', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  const patientId = await otworzSejf(page);
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid), patientId);
  const zakladki = page.locator('.vilda-patient-tabs > .vilda-patient-tab');
  await expect(zakladki).toHaveCount(5);
  const pomiar = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.vilda-patient-tabs > .vilda-patient-tab')];
    return {
      wiersze: new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top))).size,
      uciete: tabs.map((t) => t.querySelector('.vilda-patient-tab-lbl')).filter((l) => l.scrollWidth > l.clientWidth + 1).map((l) => l.textContent),
    };
  });
  expect(pomiar).toEqual({ wiersze: 1, uciete: [] });
});
