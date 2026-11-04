import { expect, test } from '../support/test-czas.mjs';
import { otworzBadania, otworzSejf, sekcjaBadan, zapiszHistorie } from '../support/lab-historia-dane.mjs';

// LAB-HISTORIA PR2: zakładka „Badania” na telefonie (projekt mobile-chromium, iPhone) i na najwęższym ekranie 320 px.
// Po dodaniu Planów opieki: sześć zakładek w siatce 2 + 2 + 2, domyślny widok „Tabela”; strona nie przewija
// się w poziomie; czytelny wynik i norma mieszczą się w wierszu. Dane wyłącznie fikcyjne.
test.use({ serviceWorkers: 'block' });

async function sprawdzUklad(page) {
  const patientId = await otworzSejf(page);
  const ids = await zapiszHistorie(page, patientId);
  await otworzBadania(page, patientId);
  const badania = sekcjaBadan(page);
  await expect(badania.locator('.vilda-lab-hist-segment-btn[aria-pressed="true"]')).toHaveText('Tabela');
  await expect(badania.locator('.vilda-lab-hist-date-group')).toHaveCount(4);
  await expect(badania.locator('.vilda-lab-hist-result-row')).toHaveCount(14);
  await expect(badania.locator('.vilda-lab-hist-card')).toHaveCount(0);
  const tsh = badania.locator(`.vilda-lab-hist-result-row[data-note-id="${ids.tsh4}"]`);
  await expect(tsh.locator('.vilda-lab-hist-result-norm')).toHaveText(/0,27.*4,2.*mIU\/L/);
  await expect(tsh.locator('.vilda-lab-hist-cell-value.tone-below')).toHaveCSS('color', 'rgb(138, 74, 24)');
  const zakladki = page.locator('.vilda-patient-tabs > .vilda-patient-tab');
  await expect(zakladki).toHaveCount(6);
  await expect(zakladki.locator('.vilda-patient-tab-lbl')).toHaveCount(6);

  const uklad = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.vilda-patient-tabs > .vilda-patient-tab')];
    const r = tabs.map((t) => t.getBoundingClientRect());
    const wiersze = [...new Set(r.map((b) => Math.round(b.top)))].map((top) => r.filter((b) => Math.round(b.top) === top).length);
    const wyniki = [...document.querySelectorAll('.vilda-lab-hist-result-row')];
    const strona = document.scrollingElement;
    const karta = document.querySelector('.vilda-auth-root');
    return {
      wiersze,
      // Wszystkie trzy pary dzielą te same dwie kolumny. Zachowujemy dotychczasową
      // tolerancję 4 px dla geometrii aktywnej zakładki.
      kolumnyWyrownane: [0, 2, 4].every((i) => Math.abs(r[i].left - r[0].left) <= 4 && Math.abs(r[i].right - r[0].right) <= 4)
        && [1, 3, 5].every((i) => Math.abs(r[i].left - r[1].left) <= 4 && Math.abs(r[i].right - r[1].right) <= 4),
      ostatniaParaTejSamejSzerokosci: Math.abs(r[4].width - r[0].width) <= 4 && Math.abs(r[5].width - r[1].width) <= 4,
      stronaBezPoziomego: strona.scrollWidth <= strona.clientWidth + 1 && karta.scrollWidth <= karta.clientWidth + 1,
      wynikiBezPoziomego: wyniki.every((row) => row.scrollWidth <= row.clientWidth + 1),
      wynikiWypelniajaGrupe: wyniki.every((row) => Math.abs(row.getBoundingClientRect().width - row.parentElement.clientWidth) <= 1),
      najmniejszyCelDotyku: Math.min(...[...document.querySelectorAll('.vilda-patient-tab, .vilda-lab-hist-segment-btn, .vilda-lab-hist-chip, .vilda-lab-hist-actions > *, .vilda-lab-hist-result-row')]
        .map((el) => el.getBoundingClientRect().height)),
    };
  });
  expect(uklad).toMatchObject({ wiersze: [2, 2, 2], kolumnyWyrownane: true, ostatniaParaTejSamejSzerokosci: true, stronaBezPoziomego: true, wynikiBezPoziomego: true, wynikiWypelniajaGrupe: true });
  expect(uklad.najmniejszyCelDotyku).toBeGreaterThanOrEqual(44);

  // Wykresy dalej są do wyboru; strona nadal bez przewijania w poziomie.
  await badania.locator('.vilda-lab-hist-segment-btn', { hasText: 'Wykresy' }).click();
  const tshChart = badania.locator('.vilda-lab-hist-card[data-series="tsh"]');
  await expect(tshChart.locator('svg.vilda-lab-result-chart-svg')).toHaveCount(1);
  await expect(tshChart).toContainText(/0,27.*4,2/);
  await expect(tshChart.locator('.vilda-lab-hist-value.tone-below')).toHaveCSS('color', 'rgb(138, 74, 24)');
  expect(await page.evaluate(() => {
    const strona = document.scrollingElement, karta = document.querySelector('.vilda-auth-root');
    return strona.scrollWidth <= strona.clientWidth + 1 && karta.scrollWidth <= karta.clientWidth + 1;
  })).toBe(true);
  await badania.locator('.vilda-lab-hist-segment-btn', { hasText: 'Tabela' }).click();
  await badania.locator(`.vilda-lab-hist-result-row[data-note-id="${ids.tsh4}"]`).click();
  const details = badania.locator(`.vilda-lab-hist-result-details[data-note-id="${ids.tsh4}"]`);
  await expect(details).toBeVisible();
  await expect(details).toContainText(/0,27.*4,2/);
  await expect(details.getByRole('button', { name: 'Edytuj wpis', exact: true })).toBeVisible();
  await details.locator('.vilda-lab-hist-details-close').click();
  await expect(details).toHaveCount(0);
}

test('telefon: zakładki 2 + 2 + 2, tabela i wykresy z normami bez przewijania w bok', async ({ page }) => {
  await sprawdzUklad(page);
});

test('320 × 760: ten sam układ bez poziomego przewijania strony', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await sprawdzUklad(page);
});
