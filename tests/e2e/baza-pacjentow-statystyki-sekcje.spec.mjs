import fs from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '../support/test-czas.mjs';
import { bezPrzewijaniaPoziomego } from '../support/baza-pacjentow-lista.mjs';
import { dodajRozpoznania, otworzStatystyki, przygotujStatystyki } from '../support/baza-pacjentow-statystyki.mjs';

// P-BAZA-SEKCJE (decyzje właściciela 2026-11-24): „Rozpoznania” i „Kompletność danych” są domyślnie zwinięte do
// jednego wiersza z „Rozwiń”; w zakresie jednego leczenia nie ma pustej sekcji drugiego; elementy, które wybrany
// filtr czyni oczywistymi, nie są rysowane. Prawdziwy renderer, prawdziwy szyfrowany sejf i wyłącznie fikcyjne osoby
// (opis ośmiu osób a–h i ich leczenia: tests/support/baza-pacjentow-statystyki.mjs).
test.use({ serviceWorkers: 'block' });
test.setTimeout(150_000);

const gotowe = async (database) => {
  await expect(database.locator('.pt-stat-cardsbar')).toContainText('Karty policzone o');
  await expect(database.locator('.pt-stat-check')).toBeEnabled();
};
const filtr = (database, klucz) => database.locator(`.pt-filter-select[data-filter-key="${klucz}"]`);
const sekcja = (database, klucz) => database.locator(`.pt-stat-card--fold[data-fold="${klucz}"]`);
const przycisk = (database, klucz) => sekcja(database, klucz).locator('.pt-stat-fold');
async function start(page, { rozpoznania = true } = {}) {
  const baza = await przygotujStatystyki(page);
  if (rozpoznania) await dodajRozpoznania(baza.frame, baza.ids);
  await otworzStatystyki(baza.database, { rozwin: false });
  await gotowe(baza.database);
  return baza;
}

test('„Rozpoznania” i „Kompletność danych”: domyślnie jeden wiersz z podsumowaniem; „Rozwiń” pokazuje treść, a wybór zostaje po przerysowaniu', async ({ page }) => {
  const { frame, database } = await start(page);

  // Stan domyślny: zwinięte, w wierszu tytuł, jedno zdanie i „Rozwiń”.
  for (const [klucz, tytul, zdanie] of [['dx', 'Rozpoznania', 'z aktywnym rozpoznaniem: 5 z 8 (63%)'], ['data', 'Kompletność danych', 'z brakami: 5 z 5 pozycji']]) {
    await expect(przycisk(database, klucz)).toHaveAttribute('aria-expanded', 'false');
    await expect(przycisk(database, klucz).locator('.pt-stat-fold-title')).toHaveText(tytul);
    await expect(przycisk(database, klucz).locator('.pt-stat-card-hint')).toHaveText(zdanie);
    await expect(przycisk(database, klucz).locator('.pt-stat-fold-mark')).toHaveText('Rozwiń');
    await expect(sekcja(database, klucz).locator('.pt-stat-fold-body')).toBeHidden();
    // Przycisk jest w nagłówku sekcji i wskazuje treść, którą odsłania.
    expect(await przycisk(database, klucz).evaluate((node) => node.parentElement.tagName + ' ' + (document.getElementById(node.getAttribute('aria-controls')) === node.closest('section').querySelector('.pt-stat-fold-body')))).toBe('H3 true');
  }
  await expect(database.locator('.pt-dx-row').first()).toBeHidden();
  await expect(database.locator('.pt-data .pt-stat-meter').first()).toBeHidden();
  // Sekcje leczenia i wiek nie są zwijane.
  await expect(database.locator('.pt-stat-card--fold')).toHaveCount(2);
  await expect(database.locator('.pt-gh .pt-gh-body')).toBeVisible();

  // Rozwinięcie myszą i klawiaturą.
  await przycisk(database, 'dx').click();
  await expect(przycisk(database, 'dx')).toHaveAttribute('aria-expanded', 'true');
  await expect(przycisk(database, 'dx').locator('.pt-stat-fold-mark')).toHaveText('Zwiń');
  await expect(database.locator('.pt-dx .pt-dx-row').first()).toBeVisible();
  await expect(database.locator('.pt-dx .pt-dx-line > .pt-dx-row')).toHaveCount(4);
  await przycisk(database, 'data').focus();
  await page.keyboard.press('Enter');
  await expect(przycisk(database, 'data')).toHaveAttribute('aria-expanded', 'true');
  await expect(database.locator('.pt-data .pt-stat-meter')).toHaveCount(5);
  await expect(database.locator('.pt-data .pt-stat-meter').first()).toBeVisible();
  await expect(przycisk(database, 'data')).toBeFocused();

  // Wybór rozpoznania przerysowuje statystyki — sekcje zostają rozwinięte; podsumowanie dotyczy już grupy.
  await database.locator('.pt-dx .pt-dx-row[data-dx="c:E66"]').click();
  await expect(database.locator('.pt-scope-name')).toHaveText('E66 — Otyłość');
  await expect(przycisk(database, 'dx')).toHaveAttribute('aria-expanded', 'true');
  await expect(przycisk(database, 'data')).toHaveAttribute('aria-expanded', 'true');
  await expect(przycisk(database, 'dx').locator('.pt-stat-card-hint')).toHaveText('z aktywnym rozpoznaniem: 3 z 3 (100%)');

  // Zwinięcie jednej sekcji; powrót z listy i odświeżenie widoku po synchronizacji zachowują oba wybory.
  await przycisk(database, 'data').click();
  await expect(sekcja(database, 'data').locator('.pt-stat-fold-body')).toBeHidden();
  await database.locator('.pt-scope-list').click();
  await expect(database).toHaveAttribute('data-view', 'list');
  await database.getByRole('button', { name: '← Statystyki' }).click();
  await expect(przycisk(database, 'dx')).toHaveAttribute('aria-expanded', 'true');
  await expect(przycisk(database, 'data')).toHaveAttribute('aria-expanded', 'false');
  await frame.evaluate(() => { document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false })); });
  await expect(database).toHaveAttribute('data-view', 'stats');
  await expect(przycisk(database, 'dx')).toHaveAttribute('aria-expanded', 'true');
  await expect(przycisk(database, 'data')).toHaveAttribute('aria-expanded', 'false');
  await expect(database.locator('.pt-dx .pt-dx-row').first()).toBeVisible();
});

test('zwinięta sekcja „Rozpoznania” mówi też, gdy rozpoznań nie ma', async ({ page }) => {
  const { database } = await start(page, { rozpoznania: false });
  await expect(przycisk(database, 'dx')).toHaveAttribute('aria-expanded', 'false');
  await expect(przycisk(database, 'dx').locator('.pt-stat-card-hint')).toHaveText('brak rozpoznań');
  await przycisk(database, 'dx').click();
  await expect(database.locator('.pt-dx .pt-stat-note')).toContainText('W bazie nie ma jeszcze rozpoznań.');
});

async function arkusz(pobranie) {
  const JSZip = createRequire(import.meta.url)('../../jszip.min.js');
  const archiwum = await JSZip.loadAsync(fs.readFileSync(await pobranie.path()));
  return archiwum.file('xl/worksheets/sheet1.xml').async('string');
}

test('zakres jednego leczenia: bez pustej sekcji drugiego leczenia na ekranie i w pliku; sekcja z danymi zostaje', async ({ page }) => {
  const { database } = await start(page);
  const gh = database.locator('.pt-stat-card.pt-gh'), otylosc = database.locator('.pt-stat-card.pt-ob');
  await expect(gh).toBeVisible();
  await expect(otylosc).toBeVisible();

  // Leczeni hormonem wzrostu w wieku 6–9 lat: c (bez leczenia otyłości) — sekcji „Leczenie otyłości” nie ma.
  await filtr(database, 'range').selectOption('gh');
  await filtr(database, 'band').selectOption('6-9');
  await expect(database.locator('.pt-scope-count')).toHaveText('1 osoba w tym zakresie');
  await expect(gh).toBeVisible();
  await expect(gh.locator('.pt-stat-card-hint')).toHaveText('leczonych: 1 · SNP 1');
  await expect(otylosc).toBeHidden();
  // Plik z tego widoku ma te same sekcje.
  const [pobranie] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000, predicate: (zdarzenie) => zdarzenie.suggestedFilename().endsWith('.xlsx') }),
    database.locator('.pt-stat-cardsbar [data-export="xlsx"]').click(),
  ]);
  const podsumowanie = await arkusz(pobranie);
  expect(podsumowanie).toContain('>Leczenie hormonem wzrostu</t>');
  expect(podsumowanie).not.toContain('>Leczenie otyłości</t>');

  // Leczeni z powodu otyłości w wieku 18+: f (bez leczenia GH) — sekcji „Leczenie hormonem wzrostu” nie ma.
  await filtr(database, 'range').selectOption('ob');
  await filtr(database, 'band').selectOption('18+');
  await expect(database.locator('.pt-scope-count')).toHaveText('1 osoba w tym zakresie');
  await expect(otylosc).toBeVisible();
  await expect(gh).toBeHidden();

  // Leczeni z powodu otyłości, cały wiek: d i e mają w karcie także punkty leczenia GH — danych się nie chowa.
  await filtr(database, 'band').selectOption('');
  await expect(database.locator('.pt-scope-count')).toHaveText('5 osób w tym zakresie');
  await expect(gh).toBeVisible();
  await expect(gh.locator('.pt-stat-card-hint')).toHaveText('leczonych: 2 · SNP 1 · ZT 1');

  // Zakres spoza leczenia (wiek 0–2 lata: a, bez leczenia): obie sekcje zostają i mówią o grupie, nie o bazie.
  await filtr(database, 'range').selectOption('');
  await filtr(database, 'band').selectOption('0-2');
  await expect(database.locator('.pt-scope-count')).toHaveText('1 osoba w tym zakresie');
  await expect(gh.locator('.pt-stat-note')).toHaveText('W tej grupie nie ma pacjentów z punktami leczenia hormonem wzrostu.');
  await expect(otylosc.locator('.pt-stat-note').first()).toHaveText('W tej grupie nie ma pacjentów z punktami leczenia otyłości.');

  // Cała baza: obie sekcje wracają.
  await database.locator('.pt-scope-clear').click();
  await expect(gh).toBeVisible();
  await expect(otylosc).toBeVisible();
});

test('filtr, który czyni element oczywistym, zdejmuje go: kafelki płci przy wybranej płci, dopisek o zapisie przy oknie ostatniego zapisu', async ({ page }) => {
  const { database } = await start(page);
  // Kafelki nad wykresem wieku (sekcje leczenia mają własne).
  const siatka = database.locator('.pt-stats > .pt-stat-tiles');
  const kafelki = siatka.locator('> .pt-stat-tile > .pt-stat-label');
  const dopisek = siatka.locator('> .pt-stat-tile').first().locator('.pt-stat-sub');
  await expect(kafelki).toHaveText(['Pacjenci w bazie', 'Średni wiek', 'Chłopcy', 'Dziewczęta']);
  await expect(dopisek).toHaveText('8 z zapisem w ostatnich 12 mies.');

  // Płeć: kafelek wybranej płci miałby zawsze 100%, drugi zawsze 0 — zostają dwa kafelki na całą szerokość.
  await filtr(database, 'sex').selectOption('M');
  await expect(kafelki).toHaveText(['Pacjenci w grupie', 'Średni wiek']);
  await expect(siatka).toHaveClass(/pt-stat-tiles--two/);
  await expect(dopisek).toHaveText('4 z zapisem w ostatnich 12 mies.');
  const szerokosci = await siatka.evaluate((node) => {
    const ramka = node.getBoundingClientRect();
    return { siatka: ramka.width, kafelki: Array.from(node.children).map((kafel) => kafel.getBoundingClientRect().width) };
  });
  expect(szerokosci.kafelki).toHaveLength(2);
  expect(szerokosci.kafelki[0] + szerokosci.kafelki[1]).toBeGreaterThan(szerokosci.siatka * 0.95);
  await filtr(database, 'sex').selectOption('');
  await expect(kafelki).toHaveText(['Pacjenci w bazie', 'Średni wiek', 'Chłopcy', 'Dziewczęta']);

  // Okno ostatniego zapisu: „N z zapisem w ostatnich 12 mies.” byłoby zawsze wszystkimi albo nikim.
  for (const zakres of ['m3', 'm6', 'm12']) {
    await filtr(database, 'range').selectOption(zakres);
    await expect(kafelki.first()).toHaveText('Pacjenci w grupie');
    await expect(dopisek).toHaveCount(0);
  }
  // Zakres leczenia nie mówi nic o dacie zapisu — dopisek zostaje.
  await filtr(database, 'range').selectOption('gh');
  await expect(dopisek).toHaveText('4 z zapisem w ostatnich 12 mies.');
});

test.describe('telefon', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('zwinięte sekcje: wiersz ma co najmniej 44 px, podsumowanie mieści się pod tytułem, bez przewijania w poziomie', async ({ page }) => {
    const { frame, database } = await start(page);
    await bezPrzewijaniaPoziomego(page, frame);
    for (const klucz of ['dx', 'data']) {
      const wymiary = await przycisk(database, klucz).evaluate((node) => {
        const ramka = node.getBoundingClientRect(), karta = node.closest('section').getBoundingClientRect();
        const zdanie = node.querySelector('.pt-stat-card-hint').getBoundingClientRect(), tytul = node.querySelector('.pt-stat-fold-title').getBoundingClientRect();
        return { wysokosc: ramka.height, wKarcie: ramka.left >= karta.left && ramka.right <= karta.right + 0.5, zdaniePodTytulem: zdanie.top >= tytul.bottom - 1, zdanieWKarcie: zdanie.right <= karta.right + 0.5 };
      });
      expect(wymiary, klucz).toEqual({ wysokosc: expect.any(Number), wKarcie: true, zdaniePodTytulem: true, zdanieWKarcie: true });
      expect(wymiary.wysokosc).toBeGreaterThanOrEqual(44);
    }
    await przycisk(database, 'data').tap();
    await expect(database.locator('.pt-data .pt-stat-meter').first()).toBeVisible();
    await bezPrzewijaniaPoziomego(page, frame);
  });
});
