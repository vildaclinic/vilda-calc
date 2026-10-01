import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij, ustawNaMiejscu } from '../support/uklad-czekanie.mjs';

// P-KLIRENS-ETYKIETY (2026-10-01) — kliknięcie w nazwę pola nie może otwierać dymku „i".
//
// `decorateField` (clcr_ui_workflow.js) buduje z etykiety pola nagłówek: nazwa, plakietka
// statusu i przycisk „i" — wstawiony do `<label>` PRZED samym polem. Etykieta bez atrybutu
// `for` wskazuje pierwszy etykietowalny element w swoim wnętrzu, a tym stał się przycisk.
// Zmierzone przed poprawką (P-BRAMKI-5, 2026-09-30): `label.control` = `BUTTON.clcr-info-button`
// dla `collectionStartVoidDiscarded`, `stoneTwoCollectionsConfirmed`, `age`, `V24`; klik
// w nazwę pola zbiórki nie zaznaczał pola, tylko otwierał dymek pomocy.
//
// Reguła po poprawce: etykieta wskazuje AKTYWNĄ kontrolkę pola. Zwykle to samo pole; gdy pole
// wyboru dostało listę odpowiedzi („Tak — potwierdzam / Nie / Nie wiem", `#ui_<id>_answer`),
// etykieta wskazuje listę — klik w nazwę daje jej fokus i NICZEGO nie potwierdza. Ukryte pole
// wyboru pod listą nie może się przełączyć kliknięciem w tekst.

async function otworzKalkulator(page, { tryb }) {
  await page.route(
    /^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//,
    (route) => route.abort(),
  );
  if (tryb === 'zgodnosci') {
    await page.addInitScript(() => {
      window.__CLCR_TEST_LEGACY_BROAD = true;
    });
  }
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  const gosc = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  await gosc.waitFor({ state: 'visible' });
  await gosc.evaluate((przycisk) => przycisk.click());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => (
    Boolean(window.ClcrUiWorkflow)
    && typeof window.applyVersion === 'function'
    && document.documentElement.classList.contains('clcr-workflow-ready')
  ));
  if (tryb === 'zgodnosci') {
    await page.evaluate(() => window.applyVersion('pro'));
    await page.waitForFunction(() => window.currentVersion === 'pro');
  } else {
    await page.evaluate((id) => window.ClcrUiWorkflow.selectFormula(id), tryb);
    await page.waitForFunction((id) => (
      window.ClcrUiWorkflow?.state?.activeFormulaId === id
      && document.getElementById('formulaPicker')?.value === id
    ), tryb);
  }
  await czekajNaUstabilizowanyUklad(page);
}

/* Etykiety, których cel (`label.control`) nie jest aktywną kontrolką pola. */
function zlyCelEtykiet(page) {
  return page.evaluate(() => {
    const etykiety = Array.from(document.querySelectorAll('label.clcr-field[data-clcr-field-id]'));
    const zle = etykiety.map((etykieta) => {
      const id = etykieta.dataset.clcrFieldId;
      const odpowiedz = document.getElementById(`ui_${id}_answer`);
      const aktywna = odpowiedz && etykieta.contains(odpowiedz) ? odpowiedz : document.getElementById(id);
      const cel = etykieta.control;
      return {
        id,
        cel: cel ? `${cel.tagName}${cel.id ? `#${cel.id}` : `.${cel.className}`}` : null,
        oczekiwany: aktywna ? `${aktywna.tagName}#${aktywna.id}` : null,
      };
    }).filter((w) => w.cel !== w.oczekiwany);
    return { liczba: etykiety.length, zle };
  });
}

const nazwa = (page, id) => page.locator(`#clcr-label-${id}`);
const dymek = (page, id) => page.locator(`#clcr-help-${id}`);
const info = (page, id) => page.locator(`.clcr-field[data-clcr-field-id="${id}"] .clcr-info-button`);

test.describe('etykiety pól Klirensu wskazują pole, nie przycisk „i"', () => {
  test('każda etykieta pola wskazuje swoją aktywną kontrolkę (tryb zgodności)', async ({ page }) => {
    await otworzKalkulator(page, { tryb: 'zgodnosci' });
    const { liczba, zle } = await zlyCelEtykiet(page);
    expect(liczba, 'kontrola sensu: strona ma udekorowane pola').toBeGreaterThan(50);
    expect(zle, JSON.stringify(zle.slice(0, 8))).toEqual([]);
  });

  test('klik w nazwę pola wyboru przełącza pole, a „i" tylko otwiera pomoc', async ({ page }) => {
    await otworzKalkulator(page, { tryb: 'zgodnosci' });
    const pole = page.locator('#collectionStartVoidDiscarded');
    await expect(pole).not.toBeChecked();

    await kliknij(nazwa(page, 'collectionStartVoidDiscarded'));
    await expect(pole, 'klik w nazwę zaznacza pole').toBeChecked();
    await expect(dymek(page, 'collectionStartVoidDiscarded'), 'klik w nazwę nie otwiera pomocy').toBeHidden();

    await kliknij(nazwa(page, 'collectionStartVoidDiscarded'));
    await expect(pole, 'drugi klik odznacza — zwykłe zachowanie etykiety').not.toBeChecked();

    await kliknij(info(page, 'collectionStartVoidDiscarded'));
    await expect(dymek(page, 'collectionStartVoidDiscarded'), '„i" nadal otwiera pomoc').toBeVisible();
    await expect(pole, 'klik w „i" wewnątrz etykiety nie przełącza pola').not.toBeChecked();
  });

  test('klik w nazwę pola tekstowego ustawia w nim fokus', async ({ page }) => {
    await otworzKalkulator(page, { tryb: 'zgodnosci' });
    await kliknij(nazwa(page, 'age'));
    await expect(page.locator('#age')).toBeFocused();
    await expect(dymek(page, 'age')).toBeHidden();
  });

  test('pole z listą odpowiedzi: klik w nazwę daje fokus liście i niczego nie potwierdza', async ({ page }) => {
    await otworzKalkulator(page, { tryb: 'ACR' });
    const lista = page.locator('#ui_spotSameSpecimen_answer');
    await expect(lista).toBeVisible();
    await expect(lista).toHaveValue('');

    const { zle } = await zlyCelEtykiet(page);
    expect(zle, JSON.stringify(zle.slice(0, 8))).toEqual([]);

    await kliknij(nazwa(page, 'spotSameSpecimen'));
    await expect(lista, 'fokus na liście odpowiedzi').toBeFocused();
    await expect(lista, 'klik w nazwę nie wybiera odpowiedzi').toHaveValue('');
    await expect(page.locator('#spotSameSpecimen'), 'ukryte pole wyboru zostaje niezaznaczone').not.toBeChecked();
    await expect(dymek(page, 'spotSameSpecimen')).toBeHidden();

    await kliknij(info(page, 'spotSameSpecimen'));
    await expect(dymek(page, 'spotSameSpecimen')).toBeVisible();
    await expect(lista).toHaveValue('');
    await expect(page.locator('#spotSameSpecimen')).not.toBeChecked();
  });
});

test.describe('ekran telefonu', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('dotknięcie nazwy pola wyboru przełącza pole, „i" otwiera pomoc', async ({ page }) => {
    await otworzKalkulator(page, { tryb: 'zgodnosci' });
    const pole = page.locator('#collectionStartVoidDiscarded');
    const nazwaPola = nazwa(page, 'collectionStartVoidDiscarded');
    await ustawNaMiejscu(nazwaPola);
    await nazwaPola.tap();
    await expect(pole).toBeChecked();
    await expect(dymek(page, 'collectionStartVoidDiscarded')).toBeHidden();

    const przycisk = info(page, 'collectionStartVoidDiscarded');
    await ustawNaMiejscu(przycisk);
    await przycisk.tap();
    await expect(dymek(page, 'collectionStartVoidDiscarded')).toBeVisible();
    await expect(pole, 'dotknięcie „i" nie przełącza pola').toBeChecked();
  });
});
