import { expect, test } from '../support/test-czas.mjs';
import { kartaPakietu, otworzPakiet, utworzPakiet, wczytajPacjentaZOcena } from '../support/lab-pakiet-dane.mjs';
import { kliknij } from '../support/uklad-czekanie.mjs';

// LAB-PAKIETY PR8 na telefonie: pakiet bez LH, FSH i testosteronu, w którym stadium dobiera normy katalogu
// (IGF-1, IGFBP-3) — wiersz stadium z notką, pytanie o dzień pobrania i norma, która na nie czeka, mieszczą się
// w szerokości ekranu, a kontrolki są celami dotyku (≥ 44 px). Dane wyłącznie fikcyjne; zegar stron 17.06.2026.
test.use({ serviceWorkers: 'block' });

// Pomiar do 0,01 px: przy ułamkowym położeniu na stronie prostokąt pola 44 px ma wysokość 43,99994 px.
const miary = (page, selektor) => page.evaluate((s) => {
  const strona = document.documentElement, karta = document.getElementById('labPackageCard');
  const cele = [...document.querySelectorAll(s)].filter((el) => el.offsetParent !== null);
  const wymiar = (el, bok) => Math.round(el.getBoundingClientRect()[bok] * 100) / 100;
  return {
    stronaBezPoziomego: strona.scrollWidth <= strona.clientWidth + 1,
    kartaBezPoziomego: karta.scrollWidth <= karta.clientWidth + 1,
    liczba: cele.length,
    najnizszy: Math.min(...cele.map((el) => wymiar(el, 'height'))),
    najwezszy: Math.min(...cele.map((el) => wymiar(el, 'width'))),
    wKarcie: cele.every((el) => el.getBoundingClientRect().left >= karta.getBoundingClientRect().left - 1 && el.getBoundingClientRect().right <= karta.getBoundingClientRect().right + 1),
  };
}, selektor);
const bloki = (page, selektor) => page.evaluate((s) => {
  const p = (el) => el.getBoundingClientRect(), karta = document.getElementById('labPackageCard');
  const lista = [...karta.querySelectorAll(s)].filter((el) => el.offsetParent !== null);
  return { liczba: lista.length, wKarcie: lista.every((el) => p(el).left >= p(karta).left - 1 && p(el).right <= p(karta).right + 1),
    bezUcinania: lista.every((el) => el.scrollWidth <= el.clientWidth + 1) };
}, selektor);

test('telefon: pakiet „Wzrost” — wiersz stadium z notką, pytanie o dzień pobrania i norma według Tannera, która czeka; bez przewijania w poziomie, cele dotyku', async ({ page }) => {
  const { patientId } = await otworzPakiet(page, { pacjent: false });
  await wczytajPacjentaZOcena(page, patientId, { name: 'Fikcyjna Hania', sex: 'F', age: 10, ageMonths: 2, dobISO: '2016-04-10' },
    { os: 'Th', stadium: 2, data: '2026-06-17', wiekMies: 122, biezace: true });
  await utworzPakiet(page, 'Wzrost', ['igf1', 'igfbp3', 'tsh']);
  const karta = kartaPakietu(page);
  await page.locator('#labPkgValue-igf1').fill('65');
  await page.locator('#labPkgValue-igfbp3').fill('4');
  await page.locator('#labPkgValue-tsh').fill('2,1');

  // Pobranie dziś: wiersz stadium z notką; edytor stadium to te same cele dotyku co w pakiecie z LH.
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Th2');
  await expect(page.locator('#labPkgPubertyNote')).toHaveText('Stadium dobiera normę według Tannera: IGF-1, IGFBP-3.');
  await kliknij(page.locator('#labPkgStageEdit'));
  await expect(page.locator('#labPkgStageEditor')).toBeVisible();
  const edytor = await miary(page, '#labPkgStageEdit, #labPkgStageEditor .vpa-segments button');
  expect(edytor).toMatchObject({ stronaBezPoziomego: true, kartaBezPoziomego: true, liczba: 13, wKarcie: true });
  expect(edytor.najnizszy).toBeGreaterThanOrEqual(44);
  expect(edytor.najwezszy).toBeGreaterThanOrEqual(44);
  await kliknij(page.locator('#labPkgStageEdit'));
  await expect(page.locator('#labPkgStageEditor')).toBeHidden();

  // Dawna próbka: pytanie w kroku „Pacjent” i „Potwierdź” w dwóch kartach z normą według Tannera.
  await page.locator('#labPkgDate').fill('2026-06-06');
  await expect(page.locator('#labPkgStageAskText')).toHaveText('Czy w dniu pobrania, 06.06.2026, stadium też było Th2?');
  await expect(karta.locator('.lab-pkg-card-pending')).toHaveCount(2);
  const pytanie = await miary(page, '#labPkgStageYes, #labPkgStageAskEdit, #labPackageCard button.lab-pkg-card-pending-link');
  expect(pytanie).toMatchObject({ stronaBezPoziomego: true, kartaBezPoziomego: true, liczba: 4, wKarcie: true });
  expect(pytanie.najnizszy).toBeGreaterThanOrEqual(44);
  expect(pytanie.najwezszy).toBeGreaterThanOrEqual(44);
  const czekanie = await bloki(page, '#labPkgStageAsk, #labPkgPuberty, #labPkgPubertyNote, .lab-pkg-card-pending, .lab-pkg-card-norm, .lab-pkg-save');
  expect(czekanie.liczba).toBeGreaterThanOrEqual(8);
  expect(czekanie).toMatchObject({ wKarcie: true, bezUcinania: true });

  await kliknij(page.locator('#labPkgStageYes'));
  await expect(page.locator('#labPkgStageChip')).toHaveText('potwierdzone dla 06.06.2026');
  await expect(karta.locator('.lab-pkg-card-pending')).toHaveCount(0);
  await expect(karta.locator('.lab-pkg-card[data-analyte="igf1"] .lab-pkg-card-norm')).toHaveText('Norma · Dziewczynki Tanner II: 15,5–59,1 nmol/L');
  const po = await bloki(page, '#labPkgPuberty, .lab-pkg-stage-value, #labPkgStageChip, .lab-pkg-card-norm, .lab-pkg-save');
  expect(po).toMatchObject({ wKarcie: true, bezUcinania: true });
});
