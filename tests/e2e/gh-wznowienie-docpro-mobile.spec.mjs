import { expect, test } from '../support/test-czas.mjs';
import { KONTYNUACJA_PO_Z, KURS_2, K8, W7, Z9, docPro, komunikat, punkty, zamknijKomunikat } from '../support/gh-wznowienie.mjs';
import { bezPrzewijaniaWBok, karta, tresc } from '../support/karta-leczenie.mjs';

// P-GH-WZNOWIENIE, część 2 (decyzje właściciela 2026-11-20, W2; docs/clinical/ALGORITHMS.md) — telefon (projekt
// mobile-chromium). Monitor GH na DocPro: po Zakończeniu Kontynuacja z karty jest odmową, Włączenie (wznowienie)
// przyciskiem karty przechodzi; wiersz „Kurs 2 — …” w tabeli punktów i metryk mieści się w karcie (tabele przewijają się
// w swoich ramkach, strona nie przewija się w bok); Karta pacjenta „kurs 2 z 2”. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

test('GW-EM1: wznowienie przyciskiem karty na telefonie — odmowa Kontynuacji po Zakończeniu, wiersz „Kurs 2”, bez przewijania strony w bok; Karta pacjenta „kurs 2 z 2”', async ({ page }) => {
  test.setTimeout(150_000);
  await docPro(page, [W7, K8, Z9]);
  await expect(page.locator('#ghTherapyStartHint')).toHaveText('Aby wznowić leczenie, dodaj „Włączenie leczenia”.');
  await page.click('#btnGhContinue');
  await expect(komunikat(page)).toHaveText(KONTYNUACJA_PO_Z);
  await zamknijKomunikat(page);
  await page.click('#btnGhStart');
  await expect.poll(() => punkty(page)).toEqual([['start', 7, 0], ['continue', 8, 0], ['end', 9, 0], ['start', 10, 0]]);
  const wiersz = page.locator('#ghTherapyTbody tr.gh-kurs-row');
  await expect(wiersz).toHaveText([KURS_2]);
  await expect(page.locator('#ghTherapyMetricsBody tr.gh-kurs-row')).toHaveText([KURS_2]);
  // Separator mieści tekst w komórce na całą szerokość tabeli (bez ucięcia), a strona nie przewija się w bok.
  const geo = await wiersz.locator('td').evaluate((td) => ({ colSpan: td.colSpan, wylewa: td.scrollWidth > td.clientWidth + 1 }));
  expect(geo).toEqual({ colSpan: 9, wylewa: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  const pid = await page.evaluate(async () => (await window.VildaVault.savePatient({
    name: 'Fikcyjny Wznowiony',
    user: { lastName: 'Fikcyjny', firstName: 'Wznowiony', sex: 'M', age: 10, ageMonths: 0, height: 130, weight: 27 },
    ghTherapyPoints: window.ghTherapyPoints,
  }, { dedup: false })).patientId);
  await karta(page, pid);
  await page.getByRole('button', { name: 'Leczony hormonem wzrostu (rhGH): otwórz zakładkę Leczenie' }).click();
  const lecz = tresc(page, 'leczenie');
  await expect(lecz.locator('.vilda-gh-summary-head .vilda-gh-summary-chip')).toHaveText(['aktywne', 'kurs 2 z 2']);
  await expect(lecz.locator('.vilda-gh-summary')).toContainText('Włączeniew wieku 10 l. 0 mies.');
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
});
