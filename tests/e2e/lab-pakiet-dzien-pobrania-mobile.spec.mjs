import { expect, test } from '../support/test-czas.mjs';
import { kartaPakietu, otworzPakiet, utworzPakiet } from '../support/lab-pakiet-dane.mjs';
import { kliknij } from '../support/uklad-czekanie.mjs';

// LAB-PAKIETY PR7 na telefonie: pytanie o stadium przy dacie pobrania innej niż dziś, stan oczekiwania w kartach
// wyników i stan po potwierdzeniu mieszczą się w szerokości ekranu, a nowe kontrolki („Tak, Th2”, „Zmień ocenę”,
// „Potwierdź”) są celami dotyku (≥ 44 px). Dane wyłącznie fikcyjne; zegar stron 17.06.2026.
test.use({ serviceWorkers: 'block' });

const DZIS = '2026-06-17';
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

test('telefon: pytanie o stadium w dniu pobrania i ocena, która na nie czeka — bez przewijania w poziomie, cele dotyku; po „Tak” osie wieku i stadium', async ({ page }) => {
  const { patientId } = await otworzPakiet(page, { pacjent: false });
  // Fikcyjna dziewczynka ur. 10.04.2019 (dziś 7 l 2 m) z Th2 ocenionym na dzisiejszej wizycie.
  await page.evaluate(({ pid, dzis }) => {
    const dane = { name: 'Fikcyjna Ola', sex: 'F', age: 7, ageMonths: 2, dobISO: '2019-04-10' };
    sessionStorage.setItem('vildaCurrentPatientId', pid);
    window.VildaPersistence.writeShared(dane, { force: true });
    window.VildaPersistence.writeMainSession({ version: 1, user: { ...dane, measuredAtISO: dzis,
      pubertyAssessment: { version: 1, sex: 'F', observations: { G: null, P: null, Th: { stage: 2, sex: 'F', observedAtISO: dzis, ageMonths: 86, source: 'clinician-entry' } } },
      pubertyAssessmentVisit: { version: 1, visitId: 'e2e-wizyta', ownerPatientId: pid, currentAxes: ['Th'], reference: { sex: 'F', ageMonths: 86, measuredAtISO: dzis } } } });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: pid } }));
  }, { pid: patientId, dzis: DZIS });
  await utworzPakiet(page, 'Dojrzewanie', ['lh', 'fsh', 'estradiol', 'inhibin_b']);
  const karta = kartaPakietu(page);
  await page.locator('#labPkgValue-lh').fill('0,6');
  await page.locator('#labPkgValue-fsh').fill('3,2');
  await page.locator('#labPkgValue-estradiol').fill('60');
  await page.locator('#labPkgValue-inhibin_b').fill('60');
  await page.locator('#labPkgDate').fill('2026-06-06');

  // Pytanie: dwie odpowiedzi w kroku „Pacjent” i „Potwierdź” w trzech kartach, które czekają na stadium.
  await expect(page.locator('#labPkgStageAskText')).toHaveText('Czy w dniu pobrania, 06.06.2026, stadium też było Th2?');
  await expect(karta.locator('.lab-pkg-card-pending')).toHaveCount(3);
  const pytanie = await miary(page, '#labPkgStageYes, #labPkgStageAskEdit, #labPackageCard button.lab-pkg-card-pending-link');
  expect(pytanie).toMatchObject({ stronaBezPoziomego: true, kartaBezPoziomego: true, liczba: 5, wKarcie: true });
  expect(pytanie.najnizszy).toBeGreaterThanOrEqual(44);
  expect(pytanie.najwezszy).toBeGreaterThanOrEqual(44);
  const czekanie = await bloki(page, '#labPkgStageAsk, #labPkgDateNote, #labPkgPuberty, .lab-pkg-card-pending, .lab-pkg-stage-value, .lab-pkg-save');
  expect(czekanie.liczba).toBeGreaterThanOrEqual(8);
  expect(czekanie).toMatchObject({ wKarcie: true, bezUcinania: true });

  // Edytor stadium otwarty z pytania: stadia są celami dotyku.
  await kliknij(page.locator('#labPkgStageAskEdit'));
  await expect(page.locator('#labPkgStageEditor')).toBeVisible();
  const edytor = await miary(page, '#labPkgStageAskEdit, #labPkgStageYes, #labPkgStageEditor .vpa-segments button');
  expect(edytor).toMatchObject({ stronaBezPoziomego: true, kartaBezPoziomego: true, wKarcie: true });
  expect(edytor.najnizszy).toBeGreaterThanOrEqual(44);
  expect(edytor.najwezszy).toBeGreaterThanOrEqual(44);
  await kliknij(page.locator('#labPkgStageAskEdit'));
  await expect(page.locator('#labPkgStageEditor')).toBeHidden();

  // „Tak, Th2”: znacznik potwierdzenia mieści się obok stadium, karty dostają osie wieku i stadium.
  await kliknij(page.locator('#labPkgStageYes'));
  await expect(page.locator('#labPkgStageChip')).toHaveText('potwierdzone dla 06.06.2026');
  await expect(karta.locator('.lab-pkg-card-pending')).toHaveCount(0);
  await expect(karta.locator('.lab-pkg-card[data-analyte="lh"] .vilda-lab-comparison')).toHaveCount(2);
  await expect(karta.locator('.lab-pkg-card[data-analyte="fsh"] .vilda-lab-comparison')).toHaveCount(2);
  const po = await miary(page, '#labPkgStageEdit, #labPkgSave');
  expect(po).toMatchObject({ stronaBezPoziomego: true, kartaBezPoziomego: true, liczba: 2, wKarcie: true });
  expect(po.najnizszy).toBeGreaterThanOrEqual(44);
  const potwierdzone = await bloki(page, '#labPkgPuberty, .lab-pkg-stage-value, #labPkgStageChip, #labPkgDateNote, #labPkgClinical, .lab-pkg-card-assessment .vilda-lab-assessment, .lab-pkg-save');
  expect(potwierdzone.liczba).toBeGreaterThanOrEqual(8);
  expect(potwierdzone).toMatchObject({ wKarcie: true, bezUcinania: true });
});
