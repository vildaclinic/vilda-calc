import fs from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '../support/test-czas.mjs';
import { bezPrzewijaniaPoziomego } from '../support/baza-pacjentow-lista.mjs';
import { ROZPOZNANIA, dodajRozpoznania, otworzStatystyki, przygotujStatystyki } from '../support/baza-pacjentow-statystyki.mjs';

// P-ROZPOZNANIA, rata 2 (decyzja właściciela 2026-11-24): statystyki Bazy według rozpoznania.
// Prawdziwy renderer, prawdziwy szyfrowany sejf i wyłącznie fikcyjne osoby (opis: tests/support/baza-pacjentow-statystyki.mjs).
// Rozpoznania zapisuje ten sam magazyn, którego używa Karta pacjenta (VildaPatientTreatmentStore).
test.use({ serviceWorkers: 'block' });
test.setTimeout(150_000);

const sekcja = (database) => database.locator('.pt-dx');
const opisWiersza = (wiersz) => wiersz.evaluate((w) => [
  (w.querySelector('.pt-dx-code') || {}).textContent || '', w.querySelector('.pt-dx-title').textContent,
  w.querySelector('.pt-dx-n').textContent, w.querySelector('.pt-dx-pct').textContent, (w.querySelector('.pt-dx-closed') || {}).textContent || '']);
const wiersze = async (database, wybor) => {
  const lista = sekcja(database).locator(wybor);
  await expect(lista.first()).toBeVisible();
  return Promise.all((await lista.all()).map(opisWiersza));
};
const gotowe = async (database) => {
  await expect(database.locator('.pt-stat-cardsbar')).toContainText('Karty policzone o');
  await expect(database.locator('.pt-stat-check')).toBeEnabled();
};
const kafel = (frame, database, etykieta) => database.locator('.pt-stat-tile')
  .filter({ has: frame.locator('.pt-stat-label', { hasText: new RegExp(`^${etykieta}$`, 'i') }) });

test('sekcja „Rozpoznania”: grupy według kodu, podkody kategorii, „bez rozpoznania” i jeden odczyt notatek rozpoznań', async ({ page }) => {
  const { frame, database, ids } = await przygotujStatystyki(page);
  await dodajRozpoznania(frame, ids);
  await frame.evaluate(() => {
    const vault = window.VildaVault, category = vault.listPatientNotesByCategory, perPatient = vault.listPatientNotesForPatient;
    window.__dxOdczyty = []; window.__dxNotatkiPacjenta = 0;
    vault.listPatientNotesByCategory = function (...args) { window.__dxOdczyty.push(args[0]); return category.apply(this, args); };
    vault.listPatientNotesForPatient = function (...args) { window.__dxNotatkiPacjenta += 1; return perPatient.apply(this, args); };
  });
  await otworzStatystyki(database);
  await gotowe(database);

  const dx = sekcja(database);
  await expect(dx.locator('h3')).toHaveText('Rozpoznania');
  await expect(dx.locator('.pt-stat-card-hint')).toHaveText(ROZPOZNANIA.podpowiedz);
  // Nazwę kategorii (E66 — Otyłość) daje katalog ICD-10 doczytany przez statystyki; pozostałe etykiety to nazwy z rozpoznań.
  await expect(dx.locator('.pt-dx-row[data-dx="c:E66"] .pt-dx-title')).toHaveText('Otyłość');
  expect(await wiersze(database, '.pt-dx-row:not(.pt-dx-row--sub)')).toEqual(ROZPOZNANIA.wiersze);
  await expect(dx.locator('.pt-stat-note')).toContainText('Liczone są rozpoznania aktywne. Pacjent z kilkoma rozpoznaniami jest w każdym z nich');

  // Kategoria z kilkoma podkodami rozwija się; rozpoznanie z jednym kodem nie ma przycisku rozwinięcia.
  await expect(dx.locator('button.pt-dx-toggle')).toHaveCount(1);
  const rozwin = dx.getByRole('button', { name: 'Rozwiń podkody: E66 — Otyłość' });
  await expect(rozwin).toHaveAttribute('aria-expanded', 'false');
  await rozwin.click();
  await expect(dx.getByRole('button', { name: 'Zwiń podkody: E66 — Otyłość' })).toHaveAttribute('aria-expanded', 'true');
  expect(await wiersze(database, '.pt-dx-row--sub')).toEqual(ROZPOZNANIA.podkodyE66);

  // Jeden odczyt notatek rozpoznań dla całej bazy (obok jednego odczytu wpisów między wizytami), bez odczytu notatek przy pacjencie.
  expect(await frame.evaluate(() => ({ odczyty: window.__dxOdczyty.slice().sort(), przyPacjencie: window.__dxNotatkiPacjenta })))
    .toEqual({ odczyty: ['leczenie-otylosci', 'treatment'], przyPacjencie: 0 });

  // „Bez rozpoznania” i „Tylko zamknięte” otwierają listę tych pacjentów.
  await dx.getByRole('button', { name: /^Tylko zamknięte rozpoznania: 1 osoba\. Pokaż listę$/ }).click();
  await expect(database).toHaveAttribute('data-view', 'list');
  await expect(database.locator('.pt-row')).toHaveCount(1);
  await expect(database.locator(`.pt-row[data-patient-id="${ids.h}"]`)).toBeVisible();
  await database.getByRole('button', { name: '← Statystyki' }).click();
  await gotowe(database);
  await sekcja(database).getByRole('button', { name: /^Bez rozpoznania: 2 osoby\. Pokaż listę$/ }).click();
  await expect(database.locator('.pt-row')).toHaveCount(2);
  expect((await database.locator('.pt-row').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-patient-id')))).sort()).toEqual([ids.a, ids.g].sort());
  await database.getByRole('button', { name: '← Statystyki' }).click();
  await gotowe(database);

  // Zamknięcie rozpoznania w Karcie (zmiana notatki, nie karty) jest widoczne po ponownym wejściu — bez czytania kart.
  await frame.evaluate(async (id) => {
    const scope = window.VildaPatientTreatmentStore.createScope({ vault: window.VildaVault, patientId: id, isCurrent: () => true });
    const dane = await scope.read();
    await scope.updateDiagnosis(dane.diagnoses[0], { status: 'closed' });
    scope.dispose();
    window.__dxKarty = 0;
    const vault = window.VildaVault, newest = vault.getNewestSnapshot;
    vault.getNewestSnapshot = function (...args) { window.__dxKarty += 1; return newest.apply(this, args); };
  }, ids.f);
  await database.locator('.pt-viewseg [data-view="list"]').click();
  await otworzStatystyki(database);
  await gotowe(database);
  await expect(sekcja(database).locator('.pt-stat-card-hint')).toHaveText('z aktywnym rozpoznaniem: 4 z 8 (50%)');
  expect((await wiersze(database, '.pt-dx-row:not(.pt-dx-row--sub)'))[0]).toEqual(['E66', 'Otyłość', '2', '25%', '+ 2 zamkn.']);
  expect(await frame.evaluate(() => window.__dxKarty), 'zmiana rozpoznania nie czyta żadnej karty').toBe(0);
});

test('wybór rozpoznania: statystyki grupy (wiek, płeć, leczenie, kompletność), lista grupy, powrót do całej bazy i plik grupy', async ({ page }) => {
  const { frame, database, ids } = await przygotujStatystyki(page);
  await dodajRozpoznania(frame, ids);
  await otworzStatystyki(database);
  await gotowe(database);
  await expect(kafel(frame, database, 'Pacjenci w bazie').locator('.pt-stat-value')).toHaveText('8');
  await frame.evaluate(() => {
    const vault = window.VildaVault, newest = vault.getNewestSnapshot, category = vault.listPatientNotesByCategory;
    window.__grupaOdczyty = 0;
    vault.getNewestSnapshot = function (...args) { window.__grupaOdczyty += 1; return newest.apply(this, args); };
    vault.listPatientNotesByCategory = function (...args) { window.__grupaOdczyty += 1; return category.apply(this, args); };
  });

  // E66 — Otyłość: d (12 l., K, Saxenda, GH ZT), e (15 l., M, Wegovy, GH SNP), f (21 l., K, Wegovy).
  await sekcja(database).getByRole('button', { name: /^E66 — Otyłość: 3 osoby z aktywnym rozpoznaniem \(38%\), tylko zamknięte: 1\. Pokaż statystyki tej grupy$/ }).click();
  const baner = database.locator('.pt-scope');
  await expect(baner.locator('.pt-scope-kicker')).toHaveText('Statystyki grupy');
  await expect(baner.locator('.pt-scope-name')).toHaveText('E66 — Otyłość');
  await expect(baner.locator('.pt-scope-count')).toHaveText('3 osoby z tym rozpoznaniem');
  await expect(kafel(frame, database, 'Pacjenci w grupie').locator('.pt-stat-value')).toHaveText('3');
  await expect(kafel(frame, database, 'Pacjenci w bazie')).toHaveCount(0);
  await expect(kafel(frame, database, 'Chłopcy').locator('.pt-stat-value')).toHaveText('1');
  await expect(kafel(frame, database, 'Dziewczęta').locator('.pt-stat-value')).toHaveText('2');
  // Przedziały wieku: d 10–13, e 14–17, f 18+.
  expect(await database.locator('.pt-stat-band[data-band]').evaluateAll((rows) => rows.map((row) => [row.getAttribute('data-band'), row.querySelector('.pt-stat-band-total').textContent])))
    .toEqual([['0-2', '0'], ['3-5', '0'], ['6-9', '0'], ['10-13', '1'], ['14-17', '1'], ['18+', '1']]);
  // Leczenie liczone tymi samymi funkcjami na kartach grupy: otyłość d (Saxenda), e i f (Wegovy); GH d (ZT) i e (SNP).
  await expect(database.locator('.pt-ob .pt-stat-card-hint')).toHaveText('leczonych: 3 · Wegovy 2 · Saxenda 1');
  await expect(database.locator('.pt-gh .pt-stat-card-hint')).toHaveText('leczonych: 2 · SNP 1 · ZT 1');
  // 12 tyg.: d −3,0 · e −4,2 · f −6,0 → średnia −4,4%; 6 mies.: d −5,0 · f −12,0 → −8,5%.
  await expect(database.locator('.pt-ob .pt-stat-tile[data-window="w12"] .pt-stat-value')).toHaveText('−4,4%');
  await expect(database.locator('.pt-ob .pt-stat-tile[data-window="m6"] .pt-stat-value')).toHaveText('−8,5%');
  await expect(database.locator('.pt-stat-meter', { hasText: 'Co najmniej 2 pomiary wzrostu' }).locator('.pt-stat-meter-figure')).toHaveText('3 / 3');
  // Rozpoznania współwystępujące w grupie: E23.0 ma tu tylko zamknięte (e), Q96 — d.
  expect(await wiersze(database, '.pt-dx-row:not(.pt-dx-row--sub)')).toEqual([
    ['E66', 'Otyłość', '3', '100%', ''], ['Q96', 'Zespół Turnera', '1', '33%', ''], ['E23.0', 'Niedoczynność przysadki', '0', '0%', '+ 1 zamkn.']]);
  expect(await frame.evaluate(() => window.__grupaOdczyty), 'zawężenie do grupy nie czyta sejfu — liczy z pamięci wyników').toBe(0);

  // Lista pacjentów grupy i powrót do statystyk tej samej grupy.
  await baner.getByRole('button', { name: 'Pokaż listę' }).click();
  await expect(database).toHaveAttribute('data-view', 'list');
  expect((await database.locator('.pt-row').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-patient-id')))).sort()).toEqual([ids.d, ids.e, ids.f].sort());
  await database.getByRole('button', { name: '← Statystyki' }).click();
  await expect(database.locator('.pt-scope-name')).toHaveText('E66 — Otyłość');
  await gotowe(database);

  // Plik grupy: własna nazwa, wiersz „Grupa pacjentów”, liczby grupy i trzy wiersze pacjentów z kolumnami rozpoznań.
  const pasek = database.locator('.pt-stat-cardsbar');
  const [pobranie] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000, predicate: (zdarzenie) => zdarzenie.suggestedFilename().endsWith('.xlsx') }),
    pasek.locator('[data-export="xlsx"]').click(),
  ]);
  expect(pobranie.suggestedFilename()).toBe('statystyki-bazy-pacjentow-grupa-2026-06-17.xlsx');
  const JSZip = createRequire(import.meta.url)('../../jszip.min.js');
  const archiwum = await JSZip.loadAsync(fs.readFileSync(await pobranie.path()));
  const podsumowanie = await archiwum.file('xl/worksheets/sheet1.xml').async('string'), pacjenci = await archiwum.file('xl/worksheets/sheet2.xml').async('string');
  const wiersz = (xml, etykieta) => (xml.split('<row ').find((fragment) => fragment.includes(`>${etykieta}</t>`)) || '');
  const liczby = (fragment) => Array.from(fragment.matchAll(/<v>([^<]*)<\/v>/g)).map((match) => Number(match[1]));
  const napisy = (fragment) => Array.from(fragment.matchAll(/<t[^>]*>([^<]*)<\/t>/g)).map((match) => match[1]);
  expect(napisy(wiersz(podsumowanie, 'Grupa pacjentów'))).toEqual(['Grupa pacjentów', 'E66 — Otyłość']);
  expect(liczby(wiersz(podsumowanie, 'Pacjentów w grupie'))).toEqual([3]);
  expect(wiersz(podsumowanie, 'Pacjentów w bazie')).toBe('');
  expect(liczby(wiersz(podsumowanie, 'Pacjenci z aktywnym rozpoznaniem'))).toEqual([3]);
  expect(liczby(wiersz(podsumowanie, 'Zmiana masy po 12 tyg.'))).toEqual([-4.4]);
  // Tabela rozpoznań: kategoria „razem” i podkody; kolumny: pacjenci, odsetek, tylko zamknięte.
  expect(napisy(wiersz(podsumowanie, 'Otyłość — razem')).slice(0, 2)).toEqual(['E66', 'Otyłość — razem']);
  expect(liczby(wiersz(podsumowanie, 'Otyłość — razem'))).toEqual([3, 100, 0]);
  expect(liczby(wiersz(podsumowanie, 'Otyłość spowodowana nadmierną podażą energii'))).toEqual([2, 67, 0]);
  expect(liczby(wiersz(podsumowanie, 'Niedoczynność przysadki'))).toEqual([0, 0, 1]);
  expect((pacjenci.match(/<row /g) || []).length).toBe(1 + 3);
  expect(napisy(pacjenci.split('<row ')[1]).slice(0, 6)).toEqual(['Lp.', 'Płeć', 'Wiek (lata)', 'Przedział wieku', 'Rozpoznania aktywne', 'Rozpoznania zamknięte']);
  // Wiersze w kolejności wieku: d (E66.0; Q96), e (E66.0, zamknięte E23.0), f (E66.9).
  expect(pacjenci).toContain('>E66.0; Q96</t>');
  expect(pacjenci).toContain('>E23.0</t>');
  expect(pacjenci).toContain('>E66.9</t>');
  // Bez nazwisk, dat urodzenia i identyfikatorów — także w pliku grupy.
  const calosc = [podsumowanie, pacjenci].join('\n');
  ['Dorota', 'Felicja', '2014-03-20', '2010-09-01', '2005-05-05'].concat(Object.values(ids)).forEach((napis) => expect(calosc, `plik nie zawiera „${napis}”`).not.toContain(napis));

  // „Cała baza” wraca do statystyk wszystkich pacjentów; „wstecz” przeglądarki nie jest do tego potrzebne.
  await database.locator('.pt-scope-clear').click();
  await expect(database.locator('.pt-scope')).toHaveCount(0);
  await expect(kafel(frame, database, 'Pacjenci w bazie').locator('.pt-stat-value')).toHaveText('8');
  await expect(sekcja(database).locator('.pt-stat-card-hint')).toHaveText(ROZPOZNANIA.podpowiedz);
  await expect(database.locator('.pt-ob .pt-stat-card-hint')).toHaveText('leczonych: 5 · Saxenda 3 · Wegovy 2');
});

test.describe('telefon', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('sekcja „Rozpoznania” i baner grupy mieszczą się w szerokości ekranu; wiersze mają co najmniej 44 px', async ({ page }) => {
    const { frame, database, ids } = await przygotujStatystyki(page);
    await dodajRozpoznania(frame, ids);
    await otworzStatystyki(database);
    await gotowe(database);
    await expect(sekcja(database).locator('.pt-dx-row').first()).toBeVisible();
    await bezPrzewijaniaPoziomego(page, frame);
    const wysokosci = await sekcja(database).locator('.pt-dx-row').evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    expect(Math.min(...wysokosci)).toBeGreaterThanOrEqual(44);
    await sekcja(database).locator('.pt-dx-row[data-dx="c:E66"]').click();
    await expect(database.locator('.pt-scope-name')).toHaveText('E66 — Otyłość');
    await bezPrzewijaniaPoziomego(page, frame);
    const przyciski = await database.locator('.pt-scope-actions > *').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    expect(Math.min(...przyciski)).toBeGreaterThanOrEqual(40);
  });
});
