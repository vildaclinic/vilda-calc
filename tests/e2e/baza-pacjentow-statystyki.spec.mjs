import { expect, test } from '../support/test-czas.mjs';
import { bezPrzewijaniaPoziomego } from '../support/baza-pacjentow-lista.mjs';
import { OCZEKIWANE, otworzStatystyki, przygotujStatystyki } from '../support/baza-pacjentow-statystyki.mjs';

// P-BAZA-STATYSTYKI, etap 1 (decyzja właściciela 2026-11-23): widok „Statystyki” w Bazie pacjentów.
// Prawdziwy renderer, prawdziwy szyfrowany sejf powłoki i wyłącznie fikcyjne osoby; zegar testu
// stoi na 17.06.2026, więc wiek jest stały (opis osób: tests/support/baza-pacjentow-statystyki.mjs).
test.use({ serviceWorkers: 'block' });
test.setTimeout(120_000);

function kafel(frame, database, etykieta) {
  return database.locator('.pt-stat-tile').filter({ has: frame.locator('.pt-stat-label', { hasText: new RegExp(`^${etykieta}$`, 'i') }) });
}

test('komputer: wiek, płeć i przedziały z nagłówków kart; osoba spoza bazy nie wchodzi do statystyk', async ({ page }) => {
  const { frame, database } = await przygotujStatystyki(page);
  await otworzStatystyki(database);

  await expect(database.locator('.pt-toolbar'), 'wyszukiwarka i zakładki listy znikają w statystykach').toBeHidden();
  await expect(database.locator('.pt-viewseg [data-view="stats"]')).toHaveAttribute('aria-pressed', 'true');

  const pacjenci = kafel(frame, database, 'Pacjenci w bazie');
  await expect(pacjenci.locator('.pt-stat-value')).toHaveText(String(OCZEKIWANE.razem));
  await expect(pacjenci.locator('.pt-stat-sub')).toHaveText('8 z zapisem w ostatnich 12 mies.');
  const wiek = kafel(frame, database, 'Średni wiek');
  await expect(wiek.locator('.pt-stat-value')).toHaveText(`${OCZEKIWANE.sredniWiek} roku`);
  await expect(wiek.locator('.pt-stat-sub')).toHaveText(`mediana ${OCZEKIWANE.mediana} · ${OCZEKIWANE.zakres}`);
  const chlopcy = kafel(frame, database, 'Chłopcy');
  await expect(chlopcy.locator('.pt-stat-value')).toHaveText(String(OCZEKIWANE.chlopcy.n));
  await expect(chlopcy.locator('.pt-stat-sub')).toHaveText(`${OCZEKIWANE.chlopcy.procent} · średni wiek ${OCZEKIWANE.chlopcy.sredniWiek}`);
  const dziewczeta = kafel(frame, database, 'Dziewczęta');
  await expect(dziewczeta.locator('.pt-stat-value')).toHaveText(String(OCZEKIWANE.dziewczeta.n));
  await expect(dziewczeta.locator('.pt-stat-sub')).toHaveText(`${OCZEKIWANE.dziewczeta.procent} · średni wiek ${OCZEKIWANE.dziewczeta.sredniWiek}`);

  for (const [klucz, liczba] of Object.entries(OCZEKIWANE.przedzialy)) {
    await expect(database.locator(`.pt-stat-band[data-band="${klucz}"] .pt-stat-band-total`), `przedział ${klucz}`).toHaveText(String(liczba));
  }
  await expect(database.locator('.pt-stat-legend')).toHaveText(/Chłopcy 4\s*Dziewczęta 3\s*Płeć nieznana 1/);
  await expect(database.locator('.pt-stat-card .pt-stat-note').first()).toContainText('Bez daty urodzenia: 1 (poza wiekiem).');
  // Słupki mają szerokość z danych: przedział 6–9 (2 osoby) jest dwa razy szerszy niż 0–2 (1 osoba).
  const szerokosc = async (klucz) => database.locator(`.pt-stat-band[data-band="${klucz}"] rect`)
    .evaluateAll((rects) => rects.reduce((suma, rect) => suma + rect.getBoundingClientRect().width, 0));
  const waski = await szerokosc('0-2'), szeroki = await szerokosc('6-9');
  expect(waski).toBeGreaterThan(40);
  expect(szeroki / waski).toBeGreaterThan(1.9);
  expect(szeroki / waski).toBeLessThan(2.1);
  await bezPrzewijaniaPoziomego(page, frame);
});

test('kliknięcie przedziału i wiersza „Brakuje” otwiera listę tych pacjentów; powrót zachowuje statystyki', async ({ page }) => {
  const { frame, database, ids } = await przygotujStatystyki(page);
  await otworzStatystyki(database);

  await database.locator('.pt-stat-band[data-band="6-9"]').click();
  await expect(database).toHaveAttribute('data-view', 'list');
  await expect(database.locator('.pt-groupbar .lt')).toHaveText('Grupa ze statystyk: 6–9 lat · 2 osoby');
  expect(await database.locator('.pt-row').evaluateAll((rows) => rows.map((row) => row.dataset.patientId).sort()))
    .toEqual([ids.c, ids.h].sort());
  // Wyszukiwanie działa wewnątrz grupy.
  await database.locator('.pt-search input').fill('cezary');
  await expect(database.locator('.pt-row')).toHaveCount(1);
  await database.locator('.pt-search input').fill('');
  await expect(database.locator('.pt-row')).toHaveCount(2);

  await database.locator('.pt-groupbar button', { hasText: 'Statystyki' }).click();
  await expect(database).toHaveAttribute('data-view', 'stats');

  await database.locator('.pt-stat-meter', { hasText: 'Data urodzenia' }).locator('button.pt-stat-missing').click();
  await expect(database.locator('.pt-groupbar .lt')).toHaveText('Grupa ze statystyk: Data urodzenia — brak · 1 osoba');
  await expect(database.locator('.pt-row')).toHaveCount(1);
  await expect(database.locator(`.pt-row[data-patient-id="${ids.g}"]`)).toBeVisible();

  await database.locator('.pt-groupbar button', { hasText: 'Pokaż wszystkich' }).click();
  await expect(database.locator('.pt-groupbar')).toBeHidden();
  await expect(database.locator('.pt-row')).toHaveCount(8); // zakładka „Z bazy”

  await otworzStatystyki(database);
  await kafel(frame, database, 'Dziewczęta').click();
  await expect(database.locator('.pt-groupbar .lt')).toHaveText('Grupa ze statystyk: Dziewczęta · 3 osoby');
  expect(await database.locator('.pt-row').evaluateAll((rows) => rows.map((row) => row.dataset.patientId).sort()))
    .toEqual([ids.a, ids.d, ids.f].sort());
});

test('kompletność danych: nagłówki od razu, karty dopiero po „Sprawdź karty”', async ({ page }) => {
  const { frame, database, ids } = await przygotujStatystyki(page);
  await otworzStatystyki(database);

  const wiersz = (nazwa) => database.locator('.pt-stat-meter', { hasText: nazwa });
  await expect(wiersz('Data urodzenia').locator('.pt-stat-meter-figure')).toHaveText('7 / 8');
  await expect(wiersz('Płeć').locator('.pt-stat-meter-figure')).toHaveText('7 / 8');
  await expect(database.locator('.pt-stat-cards .pt-stat-meter'), 'karty nie są odszyfrowywane bez prośby').toHaveCount(0);

  // Otwarcie statystyk nie czyta żadnego zapisu karty; robi to dopiero przycisk.
  await frame.evaluate(() => {
    const vault = window.VildaVault, original = vault.getLatestSnapshot;
    window.__statOdczyty = 0;
    vault.getLatestSnapshot = function (...args) { window.__statOdczyty += 1; return original.apply(this, args); };
  });
  await database.locator('.pt-viewseg [data-view="list"]').click();
  await otworzStatystyki(database);
  expect(await frame.evaluate(() => window.__statOdczyty)).toBe(0);

  await database.locator('.pt-stat-check').click();
  await expect(database.locator('.pt-stat-cards .pt-stat-meter')).toHaveCount(3);
  expect(await frame.evaluate(() => window.__statOdczyty), 'jeden odczyt na pacjenta z bazy').toBe(8);
  await expect(wiersz('Co najmniej 2 pomiary wzrostu').locator('.pt-stat-meter-figure')).toHaveText('2 / 8');
  await expect(wiersz('Wzrost obojga rodziców').locator('.pt-stat-meter-figure')).toHaveText('1 / 8');
  await expect(wiersz('Masa urodzeniowa').locator('.pt-stat-meter-figure')).toHaveText('2 / 8');
  await expect(database.locator('.pt-stat-cards-foot')).toContainText('Karty sprawdzone o');

  await wiersz('Masa urodzeniowa').locator('button.pt-stat-missing').click();
  await expect(database.locator('.pt-groupbar .lt')).toHaveText('Grupa ze statystyk: Masa urodzeniowa — brak · 6 osób');
  expect(await database.locator('.pt-row').evaluateAll((rows) => rows.map((row) => row.dataset.patientId).sort()))
    .toEqual([ids.b, ids.c, ids.e, ids.f, ids.g, ids.h].sort());

  // Wynik sprawdzenia kart zostaje po powrocie do statystyk — bez ponownego odszyfrowania.
  await database.locator('.pt-groupbar button', { hasText: 'Statystyki' }).click();
  await expect(database.locator('.pt-stat-cards .pt-stat-meter')).toHaveCount(3);
  expect(await frame.evaluate(() => window.__statOdczyty)).toBe(8);
});

test.describe('telefon', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('przełącznik pod tytułem, kafle w dwóch kolumnach, bez przewijania w bok', async ({ page }) => {
    const { frame, database } = await przygotujStatystyki(page);
    await otworzStatystyki(database);
    const kafle = await database.locator('.pt-stat-tile').evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width) };
    }));
    expect(kafle).toHaveLength(4);
    expect(new Set(kafle.map((k) => k.left)).size, 'dwie kolumny').toBe(2);
    expect(new Set(kafle.map((k) => k.top)).size, 'dwa rzędy').toBe(2);
    const przelacznik = await database.locator('.pt-viewseg').boundingBox();
    const tytul = await database.locator('.vilda-auth-title').boundingBox();
    expect(przelacznik.y, 'przełącznik stoi pod tytułem').toBeGreaterThan(tytul.y + tytul.height);
    for (const przycisk of await database.locator('.pt-viewseg button').all()) {
      expect((await przycisk.boundingBox()).height, 'cel dotyku co najmniej 44 px').toBeGreaterThanOrEqual(44);
    }
    await bezPrzewijaniaPoziomego(page, frame);

    await database.locator('.pt-stat-band[data-band="6-9"]').click();
    await expect(database.locator('.pt-row')).toHaveCount(2);
    await bezPrzewijaniaPoziomego(page, frame);
  });
});
