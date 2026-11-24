import fs from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '../support/test-czas.mjs';
import { bezPrzewijaniaPoziomego } from '../support/baza-pacjentow-lista.mjs';
import { dodajRozpoznania, otworzStatystyki, przygotujStatystyki } from '../support/baza-pacjentow-statystyki.mjs';

// P-BAZA-GRUPY (makieta statystyk; decyzja właściciela 2026-11-24: „praca nad grupami pacjentów z makiety”):
// filtry zakresu w Statystykach (lista pacjentów, płeć, wiek, zapis w ostatnich 12 mies.), zapis grupy jako listy
// pacjentów i plik grupy dla Excela. Prawdziwy renderer, prawdziwy szyfrowany sejf i wyłącznie fikcyjne osoby
// (opis ośmiu osób a–h i ich leczenia: tests/support/baza-pacjentow-statystyki.mjs).
test.use({ serviceWorkers: 'block' });
test.setTimeout(150_000);

const LISTA = 'Fikcyjna lista kontrolna'; // c, d, e, f
const gotowe = async (database) => {
  await expect(database.locator('.pt-stat-cardsbar')).toContainText('Karty policzone o');
  await expect(database.locator('.pt-stat-check')).toBeEnabled();
};
const kafel = (frame, database, etykieta) => database.locator('.pt-stat-tile')
  .filter({ has: frame.locator('.pt-stat-label', { hasText: new RegExp(`^${etykieta}$`, 'i') }) });
const filtr = (database, klucz) => database.locator(`.pt-filter-select[data-filter-key="${klucz}"]`);
const pacjenci = async (database) => (await database.locator('.pt-row').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-patient-id')))).sort();
const posortowane = (...ids) => ids.slice().sort();
async function start(page, { rozpoznania = false } = {}) {
  const baza = await przygotujStatystyki(page);
  if (rozpoznania) await dodajRozpoznania(baza.frame, baza.ids);
  baza.listaId = await baza.frame.evaluate(async ({ p, nazwa }) =>
    (await window.VildaVault.savePatientList({ name: nazwa, memberIds: [p.c, p.d, p.e, p.f] })).id, { p: baza.ids, nazwa: LISTA });
  await otworzStatystyki(baza.database);
  await gotowe(baza.database);
  return baza;
}
async function arkusze(pobranie) {
  const JSZip = createRequire(import.meta.url)('../../jszip.min.js');
  const archiwum = await JSZip.loadAsync(fs.readFileSync(await pobranie.path()));
  return { podsumowanie: await archiwum.file('xl/worksheets/sheet1.xml').async('string'), pacjenci: await archiwum.file('xl/worksheets/sheet2.xml').async('string') };
}
const wiersz = (xml, etykieta) => (xml.split('<row ').find((fragment) => fragment.includes(`>${etykieta}</t>`)) || '');
const liczby = (fragment) => Array.from(fragment.matchAll(/<v>([^<]*)<\/v>/g)).map((match) => Number(match[1]));
const napisy = (fragment) => Array.from(fragment.matchAll(/<t[^>]*>([^<]*)<\/t>/g)).map((match) => match[1]);

test('filtry zakresu: płeć, wiek, lista pacjentów i rozpoznanie łączą się; statystyki liczą się z pamięci wyników', async ({ page }) => {
  const { frame, database, ids } = await start(page, { rozpoznania: true });

  // Pasek filtrów: cztery pola wyboru z podpisami; lista pacjentów zna zapisaną listę.
  await expect(database.locator('.pt-filters .pt-filter-label')).toHaveText(['Zakres', 'Lista pacjentów', 'Płeć', 'Wiek']);
  await expect(filtr(database, 'recent').locator('option')).toHaveText(['cała baza (8)', 'z zapisem w ostatnich 12 mies. (8)']);
  await expect(filtr(database, 'list').locator('option')).toHaveText(['wszystkie', LISTA]);
  await expect(filtr(database, 'sex').locator('option')).toHaveText(['wszyscy', 'chłopcy', 'dziewczęta']);
  await expect(filtr(database, 'band').locator('option')).toHaveText(['wszystkie', '0–2 lata', '3–5 lat', '6–9 lat', '10–13 lat', '14–17 lat', '18+ lat']);
  await expect(database.locator('.pt-scope')).toHaveCount(0);
  await expect(kafel(frame, database, 'Pacjenci w bazie').locator('.pt-stat-value')).toHaveText('8');

  await frame.evaluate(() => {
    const vault = window.VildaVault, newest = vault.getNewestSnapshot, category = vault.listPatientNotesByCategory;
    window.__filtryOdczyty = 0;
    vault.getNewestSnapshot = function (...args) { window.__filtryOdczyty += 1; return newest.apply(this, args); };
    vault.listPatientNotesByCategory = function (...args) { window.__filtryOdczyty += 1; return category.apply(this, args); };
  });

  // Płeć: chłopcy to b, c, e, g. GH: b (bez programu), c i e (SNP); otyłość: e (Wegovy), g (Saxenda).
  await filtr(database, 'sex').selectOption('M');
  const baner = database.locator('.pt-scope');
  await expect(baner.locator('.pt-scope-kicker')).toHaveText('Statystyki grupy');
  await expect(baner.locator('.pt-scope-name')).toHaveText('chłopcy');
  await expect(baner.locator('.pt-scope-count')).toHaveText('4 osoby w tym zakresie');
  await expect(filtr(database, 'sex')).toBeFocused();
  await expect(filtr(database, 'sex')).toHaveClass(/\bon\b/);
  await expect(kafel(frame, database, 'Pacjenci w grupie').locator('.pt-stat-value')).toHaveText('4');
  await expect(kafel(frame, database, 'Chłopcy').locator('.pt-stat-value')).toHaveText('4');
  await expect(kafel(frame, database, 'Dziewczęta').locator('.pt-stat-value')).toHaveText('0');
  await expect(database.locator('.pt-gh .pt-stat-card-hint')).toHaveText('leczonych: 3 · SNP 2 · bez programu 1');
  await expect(database.locator('.pt-ob .pt-stat-card-hint')).toContainText('leczonych: 2');
  await expect(database.locator('.pt-stat-meter', { hasText: 'Co najmniej 2 pomiary wzrostu' }).locator('.pt-stat-meter-figure')).toHaveText('3 / 4');

  // Dodatkowo wiek 6–9 lat: zostaje c (h nie ma płci).
  await filtr(database, 'band').selectOption('6-9');
  await expect(baner.locator('.pt-scope-name')).toHaveText('chłopcy · 6–9 lat');
  await expect(baner.locator('.pt-scope-count')).toHaveText('1 osoba w tym zakresie');
  await expect(database.locator('.pt-gh .pt-stat-card-hint')).toHaveText('leczonych: 1 · SNP 1');

  // Lista pacjentów (c, d, e, f) zamiast wieku: chłopcy z listy to c i e.
  await filtr(database, 'band').selectOption('');
  await filtr(database, 'list').selectOption({ label: LISTA });
  await expect(baner.locator('.pt-scope-name')).toHaveText(`lista „${LISTA}” · chłopcy`);
  await expect(baner.locator('.pt-scope-count')).toHaveText('2 osoby w tym zakresie');
  await expect(database.locator('.pt-gh .pt-stat-card-hint')).toHaveText('leczonych: 2 · SNP 2');

  // Rozpoznanie wybrane w sekcji dołącza do filtrów: lista ∩ dziewczęta ∩ E66 (aktywne: d, e, f) = d, f.
  await filtr(database, 'sex').selectOption('F');
  await expect(baner.locator('.pt-scope-count')).toHaveText('2 osoby w tym zakresie');
  await database.locator('.pt-dx .pt-dx-row[data-dx="c:E66"]').click();
  await expect(baner.locator('.pt-scope-name')).toHaveText(`lista „${LISTA}” · dziewczęta · E66 — Otyłość`);
  await expect(baner.locator('.pt-scope-count')).toHaveText('2 osoby w tym zakresie');
  await expect(database.locator('.pt-ob .pt-stat-card-hint')).toHaveText('leczonych: 2 · Saxenda 1 · Wegovy 1');
  expect(await frame.evaluate(() => window.__filtryOdczyty), 'zmiana filtrów nie czyta kart ani notatek — liczy z pamięci wyników').toBe(0);

  // „Pokaż listę” otwiera tych pacjentów; nazwa grupy niesie cały zakres.
  await baner.getByRole('button', { name: 'Pokaż listę' }).click();
  await expect(database).toHaveAttribute('data-view', 'list');
  expect(await pacjenci(database)).toEqual(posortowane(ids.d, ids.f));
  await expect(database.locator('.pt-groupbar .lt')).toHaveText(`Grupa ze statystyk: lista „${LISTA}” · dziewczęta · E66 — Otyłość · 2 osoby`);
  await database.getByRole('button', { name: '← Statystyki' }).click();
  await expect(baner.locator('.pt-scope-name')).toHaveText(`lista „${LISTA}” · dziewczęta · E66 — Otyłość`);
  await gotowe(database);

  // Plik z zawężonych statystyk dotyczy zakresu.
  const [pobranie] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000, predicate: (zdarzenie) => zdarzenie.suggestedFilename().endsWith('.xlsx') }),
    database.locator('.pt-stat-cardsbar [data-export="xlsx"]').click(),
  ]);
  expect(pobranie.suggestedFilename()).toBe('statystyki-bazy-pacjentow-grupa-2026-06-17.xlsx');
  const plik = await arkusze(pobranie);
  expect(napisy(wiersz(plik.podsumowanie, 'Grupa pacjentów'))).toEqual(['Grupa pacjentów', `lista „${LISTA}” · dziewczęta · E66 — Otyłość`]);
  expect(liczby(wiersz(plik.podsumowanie, 'Pacjentów w grupie'))).toEqual([2]);
  expect((plik.pacjenci.match(/<row /g) || []).length).toBe(1 + 2);

  // Zakres, w którym nie ma nikogo, zostawia filtry na ekranie i mówi to wprost; „Cała baza” zdejmuje wszystko naraz.
  await filtr(database, 'band').selectOption('0-2');
  await expect(database.locator('.pt-stats .pt-empty h3')).toHaveText('Brak pacjentów w tym zakresie');
  await expect(database.locator('.pt-stats .pt-empty p')).toContainText('0–2 lata');
  await expect(database.locator('.pt-filters')).toBeVisible();
  await expect(database.locator('.pt-stat-tiles')).toHaveCount(0);
  await database.locator('.pt-stats .pt-empty').getByRole('button', { name: 'Cała baza' }).click();
  await expect(database.locator('.pt-scope')).toHaveCount(0);
  await expect(kafel(frame, database, 'Pacjenci w bazie').locator('.pt-stat-value')).toHaveText('8');
  for (const klucz of ['recent', 'list', 'sex', 'band']) await expect(filtr(database, klucz)).toHaveValue('');
  await expect(database.locator('.pt-ob .pt-stat-card-hint')).toHaveText('leczonych: 5 · Saxenda 3 · Wegovy 2');
});

test('grupa ze statystyk: „Zapisz jako listę” zakłada listę ręczną z tych pacjentów, „Eksport do Excela” daje plik grupy', async ({ page }) => {
  const { frame, database, ids } = await start(page);

  // Przedział 6–9 lat: c i h.
  await database.locator('.pt-stat-band[data-band="6-9"]').click();
  await expect(database).toHaveAttribute('data-view', 'list');
  const pasek = database.locator('.pt-groupbar');
  await expect(pasek.locator('.lt')).toHaveText('Grupa ze statystyk: 6–9 lat · 2 osoby');
  expect(await pacjenci(database)).toEqual(posortowane(ids.c, ids.h));
  const zapisz = pasek.getByRole('button', { name: 'Zapisz grupę jako listę pacjentów' });
  const eksport = pasek.getByRole('button', { name: 'Eksport grupy do Excela' });
  await expect(zapisz).toHaveText('Zapisz jako listę');
  await expect(eksport).toBeVisible();
  await expect(pasek.locator('.pt-group-form')).toBeHidden();

  // Formularz nazwy: podpowiada nazwę grupy; pusta nazwa nie zapisuje; „Anuluj” wraca do przycisków.
  const przed = await frame.evaluate(async () => (await window.VildaVault.listPatientLists()).length);
  await zapisz.click();
  const nazwa = pasek.getByLabel('Nazwa listy');
  await expect(nazwa).toBeFocused();
  await expect(nazwa).toHaveValue('6–9 lat');
  await expect(zapisz).toBeHidden();
  await nazwa.fill('   ');
  await pasek.getByRole('button', { name: 'Zapisz listę' }).click();
  await expect(pasek.locator('.pt-group-note')).toHaveText('Podaj nazwę listy.');
  await expect(pasek.locator('.pt-group-note')).toHaveAttribute('role', 'alert');
  await pasek.getByRole('button', { name: 'Anuluj' }).click();
  await expect(pasek.locator('.pt-group-form')).toBeHidden();
  await expect(zapisz).toBeFocused();
  expect(await frame.evaluate(async () => (await window.VildaVault.listPatientLists()).length)).toBe(przed);

  // Zapis: jedna lista ręczna z dokładnie tymi pacjentami; przycisk zapisu znika, „Otwórz listę” prowadzi do niej.
  await zapisz.click();
  await nazwa.fill('Fikcyjna grupa 6–9 lat');
  await nazwa.press('Enter');
  await expect(pasek.locator('.pt-group-note')).toHaveText('Zapisano listę „Fikcyjna grupa 6–9 lat” · 2 osoby.');
  await expect(pasek.locator('.pt-group-note')).toHaveAttribute('role', 'status');
  await expect(zapisz).toBeHidden();
  const otworz = pasek.getByRole('button', { name: 'Otwórz listę' });
  await expect(otworz).toBeFocused();
  const zapisane = await frame.evaluate(async () => (await window.VildaVault.listPatientLists())
    .filter((lista) => lista.name === 'Fikcyjna grupa 6–9 lat')
    .map((lista) => ({ rule: lista.rule || null, memberIds: lista.memberIds.slice().sort(), description: lista.description })));
  expect(zapisane).toEqual([{ rule: null, memberIds: posortowane(ids.c, ids.h), description: 'Grupa ze statystyk · 17.06.2026' }]);
  expect(await frame.evaluate(async () => (await window.VildaVault.listPatientLists()).length)).toBe(przed + 1);
  await otworz.click();
  await expect(database.locator('.pl-list-title')).toHaveText('Fikcyjna grupa 6–9 lat');
  expect(await pacjenci(database)).toEqual(posortowane(ids.c, ids.h));
  await expect(pasek).toBeHidden();

  // Plik grupy z paska na liście: własna nazwa, wiersz „Grupa pacjentów”, liczby grupy, bez danych osobowych.
  await database.locator('.pt-viewseg [data-view="stats"]').click();
  await gotowe(database);
  await database.locator('.pt-stat-band[data-band="6-9"]').click();
  await expect(pasek.locator('.lt')).toHaveText('Grupa ze statystyk: 6–9 lat · 2 osoby');
  const [pobranie] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000, predicate: (zdarzenie) => zdarzenie.suggestedFilename().endsWith('.xlsx') }),
    eksport.click(),
  ]);
  expect(pobranie.suggestedFilename()).toBe('statystyki-bazy-pacjentow-grupa-2026-06-17.xlsx');
  await expect(pasek.locator('.pt-group-note')).toHaveText('Zapisano plik statystyki-bazy-pacjentow-grupa-2026-06-17.xlsx. Plik nie zawiera nazwisk ani dat urodzenia.');
  const plik = await arkusze(pobranie);
  expect(napisy(wiersz(plik.podsumowanie, 'Grupa pacjentów'))).toEqual(['Grupa pacjentów', '6–9 lat']);
  expect(liczby(wiersz(plik.podsumowanie, 'Pacjentów w grupie'))).toEqual([2]);
  // c: GH SNP; h: otyłość, Saxenda — po jednym leczonym w każdej z dwóch sekcji leczenia.
  const leczonych = plik.podsumowanie.split('<row ').filter((fragment) => napisy(fragment)[0] === 'Leczonych').map((fragment) => liczby(fragment)[0]);
  expect(leczonych).toEqual([1, 1]);
  expect((plik.pacjenci.match(/<row /g) || []).length).toBe(1 + 2);
  const calosc = [plik.podsumowanie, plik.pacjenci].join('\n');
  ['Fikcyjna Statystyka', '2018-01-10', '2016-06-18'].concat(Object.values(ids)).forEach((napis) => expect(calosc, `plik nie zawiera „${napis}”`).not.toContain(napis));
  // Statystyki całej bazy zostają nietknięte: po powrocie nie ma zakresu.
  await database.getByRole('button', { name: '← Statystyki' }).click();
  await expect(database.locator('.pt-scope')).toHaveCount(0);
});

test('bez dostępu do list pacjentów: nie ma filtra listy ani „Zapisz jako listę”; pozostałe filtry i plik grupy działają', async ({ page }) => {
  const { frame, database, ids } = await start(page);
  await filtr(database, 'list').selectOption({ label: LISTA });
  await expect(database.locator('.pt-scope-count')).toHaveText('4 osoby w tym zakresie');
  // Uprząż testu nadaje PRO w każdym oknie aplikacji (tests/support/centile-live-fixture.mjs): przy wczytaniu okna
  // i przy każdej zmianie sesji, a plan jest wspólny dla wszystkich okien. Powłoka doczytuje kolejne moduły w tle,
  // więc PRO wracałoby w połowie testu. Od tej chwili prośba o „pro” jest pomijana w oknach już otwartych
  // i w każdym następnym — tam jeszcze przed uprzężą (faza przechwytywania zdarzeń).
  const bezPro = () => {
    const wylacz = () => {
      const access = window.VildaProAccess;
      if (!access || access.__e2eBezPro) return;
      const setPlan = access.setPlan.bind(access);
      access.__e2eBezPro = true;
      access.__setTokenModeForTest(false);
      access.setPlan = (plan, until) => (plan === 'pro' ? undefined : setPlan(plan, until));
      setPlan('free');
    };
    wylacz();
    // Oba zdarzenia, przy których uprząż nadaje PRO; okno jest na ich drodze przed dokumentem.
    window.addEventListener('DOMContentLoaded', wylacz, true);
    window.addEventListener('vilda:session-changed', wylacz, true);
  };
  await page.addInitScript(bezPro);
  for (const okno of page.frames()) await okno.evaluate(bezPro);
  await expect.poll(() => frame.evaluate(() => window.VildaProAccess.hasAccess())).toBe(false);
  // Filtr listy przestaje zawężać i znika; statystyki wracają do całej bazy.
  await expect(filtr(database, 'list')).toHaveCount(0);
  await expect(database.locator('.pt-filters .pt-filter-label')).toHaveText(['Zakres', 'Płeć', 'Wiek']);
  await expect(database.locator('.pt-scope')).toHaveCount(0);
  await expect(kafel(frame, database, 'Pacjenci w bazie').locator('.pt-stat-value')).toHaveText('8');
  await gotowe(database);
  await filtr(database, 'sex').selectOption('F');
  await expect(database.locator('.pt-scope-count')).toHaveText('3 osoby w tym zakresie');
  await database.locator('.pt-scope-list').click();
  expect(await pacjenci(database)).toEqual(posortowane(ids.a, ids.d, ids.f));
  const pasek = database.locator('.pt-groupbar');
  await expect(pasek.getByRole('button', { name: 'Zapisz grupę jako listę pacjentów' })).toHaveCount(0);
  await expect(pasek.getByRole('button', { name: 'Eksport grupy do Excela' })).toBeVisible();
});

test.describe('telefon', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('filtry i pasek grupy mieszczą się w szerokości ekranu; pola mają co najmniej 44 px i 16 px pisma', async ({ page }) => {
    const { frame, database } = await start(page);
    await bezPrzewijaniaPoziomego(page, frame);
    const pola = await database.locator('.pt-filter-select').evaluateAll((nodes) => nodes.map((node) => {
      const ramka = node.getBoundingClientRect();
      return { wysokosc: ramka.height, pismo: parseFloat(getComputedStyle(node).fontSize), lewa: ramka.left, prawa: ramka.right };
    }));
    expect(pola).toHaveLength(4);
    expect(Math.min(...pola.map((pole) => pole.wysokosc))).toBeGreaterThanOrEqual(44);
    expect(Math.min(...pola.map((pole) => pole.pismo)), 'pismo < 16 px powiększa widok na iPhonie przy wejściu w pole').toBeGreaterThanOrEqual(16);
    // Dwa pola w wierszu.
    expect(Math.round(pola[0].lewa)).toBe(Math.round(pola[2].lewa));
    expect(pola[1].lewa).toBeGreaterThan(pola[0].prawa);

    await filtr(database, 'band').selectOption('6-9');
    await expect(database.locator('.pt-scope-name')).toHaveText('6–9 lat');
    await bezPrzewijaniaPoziomego(page, frame);
    await database.locator('.pt-scope-list').click();
    const pasek = database.locator('.pt-groupbar');
    await expect(pasek.locator('.lt')).toHaveText('Grupa ze statystyk: 6–9 lat · 2 osoby');
    await bezPrzewijaniaPoziomego(page, frame);
    // Opis grupy ma własny wiersz na całą szerokość paska; przyciski są pod nim.
    const uklad = await pasek.evaluate((bar) => {
      const opis = bar.querySelector('.lt').getBoundingClientRect(), przyciski = Array.from(bar.querySelectorAll(':scope > button:not([hidden])')).map((node) => node.getBoundingClientRect());
      return { szerokoscOpisu: opis.width, szerokoscPaska: bar.clientWidth, podOpisem: przyciski.every((ramka) => ramka.top >= opis.bottom - 1), najnizszy: Math.min(...przyciski.map((ramka) => ramka.height)) };
    });
    expect(uklad.szerokoscOpisu).toBeGreaterThan(uklad.szerokoscPaska * 0.8);
    expect(uklad.podOpisem).toBe(true);
    expect(uklad.najnizszy).toBeGreaterThanOrEqual(34);

    await pasek.getByRole('button', { name: 'Zapisz grupę jako listę pacjentów' }).click();
    const nazwa = pasek.getByLabel('Nazwa listy');
    expect(await nazwa.evaluate((node) => ({ wysokosc: node.getBoundingClientRect().height, pismo: parseFloat(getComputedStyle(node).fontSize) })))
      .toEqual({ wysokosc: expect.any(Number), pismo: expect.any(Number) });
    expect((await nazwa.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await nazwa.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
    await bezPrzewijaniaPoziomego(page, frame);
    await nazwa.fill('Fikcyjna grupa z telefonu');
    await pasek.getByRole('button', { name: 'Zapisz listę' }).click();
    await expect(pasek.locator('.pt-group-note')).toHaveText('Zapisano listę „Fikcyjna grupa z telefonu” · 2 osoby.');
    await bezPrzewijaniaPoziomego(page, frame);
  });
});
