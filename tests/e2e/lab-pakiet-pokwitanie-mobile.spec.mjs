import { expect, test } from '../support/test-czas.mjs';
import { kartaPakietu, otworzPakiet, utworzPakiet, wczytajPacjenta } from '../support/lab-pakiet-dane.mjs';
import { kliknij } from '../support/uklad-czekanie.mjs';

// LAB-PAKIETY PR6 na telefonie: ocena pokwitaniowa w pakiecie — krok „Pacjent” z edytorem stadium i wyborem
// „Cykl / menopauza” oraz karty wyników ze wspólnym widokiem oceny mieszczą się w szerokości ekranu, a nowe
// kontrolki są celami dotyku (≥ 44 px). Dane wyłącznie fikcyjne (tests/support/lab-pakiet-dane.mjs).
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

test('telefon: dziecko — edytor stadium w kroku „Pacjent” i karty z osiami wieku i stadium bez przewijania w poziomie, cele dotyku', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  await wczytajPacjenta(page, patientId, { name: 'Fikcyjna Wczesna', sex: 'F', age: 7, ageMonths: 2 });
  await utworzPakiet(page, 'Dojrzewanie', ['lh', 'fsh', 'estradiol', 'inhibin_b']);
  const karta = kartaPakietu(page);
  await page.locator('#labPkgValue-lh').fill('0,6');
  await page.locator('#labPkgValue-fsh').fill('3,2');
  await page.locator('#labPkgValue-inhibin_b').fill('60');

  await kliknij(page.locator('#labPkgStageEdit'));
  await expect(page.locator('#labPkgStageEditor')).toBeVisible();
  // Otwarty edytor: przycisk „Gotowe” i stadia 1–5 z „Nie oceniono” dla Th i P.
  const edytor = await miary(page, '#labPkgStageEdit, #labPkgStageEditor .vpa-segments button');
  expect(edytor).toMatchObject({ stronaBezPoziomego: true, kartaBezPoziomego: true, liczba: 13, wKarcie: true });
  expect(edytor.najnizszy).toBeGreaterThanOrEqual(44);
  expect(edytor.najwezszy).toBeGreaterThanOrEqual(44);
  await kliknij(page.locator('#labPkgStageEditor .vpa-segments [data-puberty-axis="Th"][data-puberty-stage="2"]'));
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Th2');
  await kliknij(page.locator('#labPkgStageEdit'));
  await expect(page.locator('#labPkgStageEditor')).toBeHidden();

  // Karty: LH i FSH z dwiema osiami, inhibina B z jedną; wspólny komunikat nad kartami.
  await expect(karta.locator('.lab-pkg-card[data-analyte="lh"] .vilda-lab-comparison')).toHaveCount(2);
  await expect(karta.locator('.lab-pkg-card[data-analyte="fsh"] .vilda-lab-comparison')).toHaveCount(2);
  await expect(karta.locator('.lab-pkg-card[data-analyte="inhibin_b"] .vilda-lab-comparison')).toHaveCount(1);
  await expect(page.locator('#labPkgClinical')).toBeVisible();
  const widok = await miary(page, '#labPkgStageEdit, #labPackageCard .lab-pkg-card.is-assessed button.lab-pkg-card-link');
  expect(widok).toMatchObject({ stronaBezPoziomego: true, kartaBezPoziomego: true, liczba: 4, wKarcie: true });
  expect(widok.najnizszy).toBeGreaterThanOrEqual(44);
  const ocena = await page.evaluate(() => {
    const p = (el) => el.getBoundingClientRect(), karta = document.getElementById('labPackageCard');
    const bloki = [...karta.querySelectorAll('.lab-pkg-card-assessment .vilda-lab-assessment, #labPkgClinical, #labPkgPuberty, .lab-pkg-card-assessment .vilda-lab-axis')].filter((el) => el.offsetParent !== null);
    return { liczba: bloki.length, wKarcie: bloki.every((el) => p(el).left >= p(karta).left - 1 && p(el).right <= p(karta).right + 1),
      bezUcinania: bloki.every((el) => el.scrollWidth <= el.clientWidth + 1) };
  });
  expect(ocena.liczba).toBeGreaterThanOrEqual(10);
  expect(ocena).toMatchObject({ wKarcie: true, bezUcinania: true });
});

test('telefon: dorosła kobieta — wybór „Cykl / menopauza” jest celem dotyku, lista zakresów mieści się w karcie', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  await wczytajPacjenta(page, patientId, { name: 'Fikcyjna Dorosła', sex: 'F', age: 30, ageMonths: 0 });
  await utworzPakiet(page, 'Oś gonadalna', ['lh', 'fsh']);
  await page.locator('#labPkgValue-lh').fill('6');
  await expect(page.locator('#labPkgCycle')).toBeVisible();
  await expect(page.locator('#labPkgStageEdit')).toBeHidden();
  const cykl = await miary(page, '#labPkgCycle');
  expect(cykl).toMatchObject({ stronaBezPoziomego: true, kartaBezPoziomego: true, liczba: 1, wKarcie: true });
  expect(cykl.najnizszy).toBeGreaterThanOrEqual(44);
  const lh = kartaPakietu(page).locator('.lab-pkg-card[data-analyte="lh"]');
  await expect(lh.locator('.vilda-lab-reference-variant')).toHaveCount(4);
  await page.locator('#labPkgCycle').selectOption('luteal');
  await expect(lh.locator('.vilda-lab-comparison')).toHaveCount(1);
  expect(await miary(page, '#labPkgCycle')).toMatchObject({ stronaBezPoziomego: true, kartaBezPoziomego: true });
});
