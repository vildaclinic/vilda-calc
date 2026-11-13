import { expect, test } from '../support/test-czas.mjs';
import { czekajNaBadania, otworzSejf, sekcjaBadan } from '../support/lab-historia-dane.mjs';
import { kartaPakietu, wczytajPacjenta, wynikiBadan } from '../support/lab-pakiet-dane.mjs';

// LAB-PAKIETY PR1 w prawdziwej powłoce (app.html) na prawdziwym, fikcyjnym sejfie: skrót „Wpisz pakiet: Tarczyca”
// w zakładce „Badania” otwiera trasę przelicznika z pakietem (?pakiet=tarczyca doręcza powłoka), zapis trafia do karty
// pacjentki, a „Otwórz Badania” wraca do jej karty przez powłokę. Dane wyłącznie fikcyjne.
test.use({ serviceWorkers: 'block' });

async function ramka(page, tytul) {
  const iframe = page.locator(`iframe.app-pane[title="${tytul}"]`);
  await expect(iframe).toBeVisible();
  const frame = await (await iframe.elementHandle()).contentFrame();
  if (!frame) throw new Error(`Brak ramki ${tytul}`);
  await frame.waitForLoadState('load');
  return frame;
}

test('Badania → pakiet w przeliczniku → zapis → powrót do Badań, wszystko przez powłokę', async ({ page }) => {
  const patientId = await otworzSejf(page);
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  const start = await ramka(page, 'Start');
  await start.waitForFunction(() => window.VildaVault?.isUnlocked() && Boolean(window.VildaAuthUI && window.VildaLabHistoryTab));
  for (const scope of [page, start]) {
    const consent = scope.locator('#consent-decline');
    if (await consent.isVisible()) await consent.click();
  }
  await wczytajPacjenta(start, patientId);
  await page.evaluate((pid) => window.VildaShell.openPatientCardInStart(pid, { activeTab: 'lab' }), patientId);
  await czekajNaBadania(start);

  const skrot = sekcjaBadan(start).locator('a.vilda-lab-hist-package');
  await expect(skrot).toHaveText('Wpisz pakiet: Tarczyca →');
  await skrot.click();
  await expect(page).toHaveURL(/\/app\.html#\/lab/);
  const lab = await ramka(page, 'Jednostki laboratoryjne');
  await expect(lab.locator('#labModePackage')).toHaveAttribute('aria-selected', 'true');
  await expect(lab.locator('#labPkgValue-tsh')).toBeVisible();
  await expect(lab.locator('#labFormPane')).toBeHidden();
  await expect(kartaPakietu(lab).locator('.lab-pkg-save-ctx')).toHaveText('Fikcyjna Badaniowa · wizyta: 12 l 3 m');

  await lab.locator('#labPkgValue-tsh').fill('2,5');
  await lab.locator('#labPkgValue-ft3').fill('6,1');
  await lab.locator('#labPkgSave').click();
  await expect(lab.locator('#labPkgDone')).toBeVisible();
  expect((await wynikiBadan(lab, patientId)).map((n) => [n.labResult.testKey, n.labResult.valueNum, n.labResult.range.classification, n.clinicalDateISO])).toEqual([
    ['ft3', 6.1, 'within', '2026-06-17'], ['tsh', 2.5, 'within', '2026-06-17'],
  ]);

  // „Otwórz Badania” wraca do karty pacjentki na zakładce „Badania” przez powłokę; wyniki są na liście.
  await lab.locator('#labPkgOpenCard').click();
  await expect(page).toHaveURL(/\/app\.html#\/start/);
  await expect(start.locator('.vilda-patient-tab[data-tab="lab"]')).toHaveClass(/active/);
  await czekajNaBadania(start);
  await expect(sekcjaBadan(start).locator('.vilda-lab-hist-result-row')).toHaveCount(2);

  // Karta badania (?badanie=) po pakiecie wraca do pojedynczego badania w tej samej ramce.
  await sekcjaBadan(start).getByRole('button', { name: 'Wykresy', exact: true }).click();
  await sekcjaBadan(start).locator('.vilda-lab-hist-card[data-series="tsh"] a.vilda-lab-hist-card-check').click();
  await expect(page).toHaveURL(/\/app\.html#\/lab/);
  await expect(lab.locator('#labModeSingle')).toHaveAttribute('aria-selected', 'true');
  await expect(lab.locator('#labFormPane')).toBeVisible();
  await expect(lab.locator('#labPackageCard')).toBeHidden();
  await expect(lab.locator('#labSubstance')).toHaveValue('TSH (tyreotropina)');
});
