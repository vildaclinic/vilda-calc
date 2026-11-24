import fs from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '../support/test-czas.mjs';
import { bezPrzewijaniaPoziomego } from '../support/baza-pacjentow-lista.mjs';
import { OCZEKIWANE, otworzStatystyki, przygotujStatystyki } from '../support/baza-pacjentow-statystyki.mjs';
import { visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';

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
  // Przełącznik Lista/Statystyki stoi w jednej linii z „Dodaj pacjenta” i ma tę samą wysokość (zgłoszenie właściciela 2026-11-24).
  const przelacznik = await database.locator('.pt-viewseg').boundingBox(), dodaj = await database.locator('.pt-add').boundingBox();
  expect(Math.abs(przelacznik.y - dodaj.y), 'ta sama linia').toBeLessThan(0.6);
  expect(Math.abs(przelacznik.height - dodaj.height), 'ta sama wysokość').toBeLessThan(0.6);
  expect(przelacznik.x + przelacznik.width, 'przełącznik na lewo od przycisku').toBeLessThan(dodaj.x);
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
  await expect(database.locator('.pt-stat-card').first().locator('.pt-stat-legend')).toHaveText(/Chłopcy 4\s*Dziewczęta 3\s*Płeć nieznana 1/);
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

// P-BAZA-SZYBKIE (decyzja właściciela 2026-11-24): liczenie rusza samo przy wejściu w „Statystyki”
// i czyta z każdej karty tylko najnowszą wersję.
test('kompletność danych: liczenie rusza samo, jeden odczyt najnowszej wersji na pacjenta', async ({ page }) => {
  const { frame, database, ids } = await przygotujStatystyki(page);
  await frame.evaluate(() => {
    const vault = window.VildaVault, newest = vault.getNewestSnapshot, latest = vault.getLatestSnapshot;
    window.__statOdczyty = 0; window.__statWszystkieWersje = 0;
    vault.getNewestSnapshot = function (...args) { window.__statOdczyty += 1; return newest.apply(this, args); };
    vault.getLatestSnapshot = function (...args) { window.__statWszystkieWersje += 1; return latest.apply(this, args); };
  });
  expect(await frame.evaluate(() => window.__statOdczyty), 'sama lista nie czyta kart').toBe(0);
  await otworzStatystyki(database);

  const wiersz = (nazwa) => database.locator('.pt-stat-meter', { hasText: nazwa });
  await expect(wiersz('Data urodzenia').locator('.pt-stat-meter-figure')).toHaveText('7 / 8');
  await expect(wiersz('Płeć').locator('.pt-stat-meter-figure')).toHaveText('7 / 8');
  // Bez żadnego kliknięcia: wynik z kart pojawia się po wejściu w statystyki.
  await expect(database.locator('.pt-stat-cards .pt-stat-meter')).toHaveCount(3);
  await expect(database.locator('.pt-stat-cardsbar')).toContainText('Karty policzone o');
  expect(await frame.evaluate(() => window.__statOdczyty), 'jeden odczyt najnowszej wersji na pacjenta z bazy').toBe(8);
  expect(await frame.evaluate(() => window.__statWszystkieWersje), 'odczyt wszystkich wersji karty nie jest używany').toBe(0);
  await expect(wiersz('Co najmniej 2 pomiary wzrostu').locator('.pt-stat-meter-figure')).toHaveText(OCZEKIWANE.karty.pomiary);
  await expect(wiersz('Wzrost obojga rodziców').locator('.pt-stat-meter-figure')).toHaveText(OCZEKIWANE.karty.rodzice);
  await expect(wiersz('Masa urodzeniowa').locator('.pt-stat-meter-figure')).toHaveText(OCZEKIWANE.karty.masaUrodzeniowa);

  await wiersz('Masa urodzeniowa').locator('button.pt-stat-missing').click();
  await expect(database.locator('.pt-groupbar .lt')).toHaveText('Grupa ze statystyk: Masa urodzeniowa — brak · 6 osób');
  expect(await database.locator('.pt-row').evaluateAll((rows) => rows.map((row) => row.dataset.patientId).sort()))
    .toEqual([ids.b, ids.c, ids.e, ids.f, ids.g, ids.h].sort());

  // Powrót do statystyk sprawdza zmiany, ale nie czyta ponownie kart, które się nie zmieniły.
  await database.locator('.pt-groupbar button', { hasText: 'Statystyki' }).click();
  await expect(database.locator('.pt-stat-cards .pt-stat-meter')).toHaveCount(3);
  await expect(database.locator('.pt-stat-check')).toBeEnabled();
  expect(await frame.evaluate(() => window.__statOdczyty)).toBe(8);

  // „Policz ponownie” czyta wszystkie karty od nowa.
  await database.locator('.pt-stat-check').click();
  await expect.poll(() => frame.evaluate(() => window.__statOdczyty)).toBe(16);
  await expect(database.locator('.pt-stat-check')).toBeEnabled();
  await expect(wiersz('Masa urodzeniowa').locator('.pt-stat-meter-figure')).toHaveText(OCZEKIWANE.karty.masaUrodzeniowa);
});

/* P-BAZA-SZYBKIE: liczenie przyrostowe. Pamięć wyników kart żyje w widoku; karta jest czytana ponownie tylko wtedy,
   gdy zmieniła się chwila jej zapisu albo wpisy między wizytami (wpis nie zmienia chwili zapisu karty). */
test('liczenie przyrostowe: nowy wpis między wizytami i nowa wersja karty czytają tylko tę jedną kartę', async ({ page }) => {
  const { frame, database, ids } = await przygotujStatystyki(page);
  await frame.evaluate(() => {
    const vault = window.VildaVault, newest = vault.getNewestSnapshot, category = vault.listPatientNotesByCategory, perPatient = vault.listPatientNotesForPatient;
    window.__statKarty = []; window.__statWpisy = 0; window.__statRozpoznania = 0; window.__statNotatkiPacjenta = 0;
    vault.getNewestSnapshot = function (...args) { window.__statKarty.push(args[0]); return newest.apply(this, args); };
    // P-ROZPOZNANIA, rata 2: ten sam odczyt (inna kategoria) daje rozpoznania — liczony osobno.
    vault.listPatientNotesByCategory = function (...args) {
      if (args[0] === 'treatment') window.__statRozpoznania += 1; else window.__statWpisy += 1;
      return category.apply(this, args);
    };
    vault.listPatientNotesForPatient = function (...args) { window.__statNotatkiPacjenta += 1; return perPatient.apply(this, args); };
  });
  const E = OCZEKIWANE.otylosc, ob = database.locator('.pt-ob');
  const stan = () => frame.evaluate(() => ({ karty: window.__statKarty.slice(), wpisy: window.__statWpisy, rozpoznania: window.__statRozpoznania, notatkiPacjenta: window.__statNotatkiPacjenta }));
  const gotowe = async () => { await expect(database.locator('.pt-stat-cardsbar')).toContainText('Karty policzone o'); await expect(database.locator('.pt-stat-check')).toBeEnabled(); };

  await otworzStatystyki(database);
  await expect(ob.locator('.pt-stat-card-hint')).toHaveText(E.leki);
  await gotowe();
  let s1 = await stan();
  expect(s1.karty.slice().sort(), 'pierwsze wejście: każda karta raz').toEqual(Object.values(ids).filter((id) => id !== ids.spoza).sort());
  expect(s1.wpisy, 'wpisy między wizytami: jeden odczyt dla całej bazy').toBe(1);
  expect(s1.rozpoznania, 'rozpoznania: jeden odczyt dla całej bazy').toBe(1);
  expect(s1.notatkiPacjenta, 'bez odczytu notatek przy każdym pacjencie').toBe(0);

  // Ponowne wejście: jeden odczyt wpisów, żadnej karty.
  await database.locator('.pt-viewseg [data-view="list"]').click();
  await otworzStatystyki(database);
  await gotowe();
  let s2 = await stan();
  expect(s2.karty).toHaveLength(8);
  expect(s2.wpisy).toBe(2);
  expect(s2.rozpoznania).toBe(2);

  // Leczenie rozpoczęte wyłącznie wpisami między wizytami (karta c nie ma punktów otyłości w zapisie wizyty):
  // karta się nie zmienia, a statystyki i tak muszą to zobaczyć — i przeczytać ponownie tylko tę kartę.
  await frame.evaluate(async (id) => {
    const dziennik = window.VildaDziennikOtylosci;
    const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP‑1)' };
    const wpisy = [
      { type: 'start', dateISO: '2025-12-03', ageYears: 7, ageMonths: 10, weight: 30.0, weightSource: 'gabinet', height: 128.0, heightSource: 'gabinet', ...SAXENDA, dose: '0,6 mg', comment: '' },
      { type: 'continue', dateISO: '2026-02-25', ageYears: 8, ageMonths: 1, weight: 28.5, weightSource: 'pacjent', height: null, heightSource: null, ...SAXENDA, dose: '1,8 mg', comment: '' },
    ];
    for (const wpis of wpisy) {
      const plan = dziennik.planNowego(await dziennik.wczytaj(id, []), id, wpis);
      if (!plan || !plan.ok) throw new Error('plan wpisu dziennika: ' + JSON.stringify(plan && plan.bledy));
      await dziennik.zapisz(id, plan.wersje);
    }
  }, ids.c);
  await database.locator('.pt-viewseg [data-view="list"]').click();
  await otworzStatystyki(database);
  // d −3,0 · e −4,2 · f −6,0 · h +2,0 · c −5,0 → średnia −3,24.
  await expect(ob.locator('.pt-stat-card-hint')).toHaveText('leczonych: 6 · Saxenda 4 · Wegovy 2');
  await expect(ob.locator('.pt-stat-tile[data-window="w12"] .pt-stat-value')).toHaveText('−3,2%');
  await expect(ob.locator('.pt-stat-tile[data-window="w12"] .pt-stat-sub')).toContainText('n = 5');
  await gotowe();
  let s3 = await stan();
  expect(s3.karty.slice(8), 'po dopisaniu wpisów czytana jest tylko karta c').toEqual([ids.c]);
  expect(s3.wpisy).toBe(3);
  expect(s3.notatkiPacjenta, 'dwa odczyty samego testu przy dopisywaniu wpisów').toBe(2);

  // Nowa wersja karty d (dopisany wzrost rodziców): po powrocie do Bazy czytana jest tylko ta karta.
  await frame.evaluate(async (id) => {
    const vault = window.VildaVault, payload = (await vault.getLatestSnapshot(id)).payload;
    await vault.savePatient({ ...payload, advanced: { ...(payload.advanced || {}), motherHeight: 164, fatherHeight: 180 } }, { patientId: id, dedup: false });
  }, ids.d);
  await database.locator('.pt-home').click();
  const menu = await visibleChromeMenu(page);
  await menu.getByRole('button', { name: 'Baza pacjentów', exact: true }).click();
  await expect(database).toHaveAttribute('data-view', 'stats');
  await expect(database.locator('.pt-stat-meter', { hasText: 'Wzrost obojga rodziców' }).locator('.pt-stat-meter-figure')).toHaveText('2 / 8');
  await gotowe();
  let s4 = await stan();
  expect(s4.karty.slice(9), 'po zapisie nowej wersji czytana jest tylko karta d').toEqual([ids.d]);
  expect(s4.notatkiPacjenta, 'statystyki nie czytają notatek przy każdym pacjencie; te dwa odczyty zrobił sam test, dopisując wpisy').toBe(2);
  // Leczenie otyłości bez zmian po zapisie karty d.
  await expect(ob.locator('.pt-stat-card-hint')).toHaveText('leczonych: 6 · Saxenda 4 · Wegovy 2');
});

// P-BAZA-STATYSTYKI, etap 2: leczenie hormonem wzrostu — tempo silnikiem aplikacji, hSDS jej siatkami.
test('leczenie GH: tempo w 1. roku, para „przed → 1. rok”, zmiana hSDS, programy i lata leczenia', async ({ page }) => {
  const { frame, database, ids } = await przygotujStatystyki(page);
  await otworzStatystyki(database);
  const gh = database.locator('.pt-gh');
  // Liczenie rusza samo po wejściu w statystyki.
  await expect(gh.locator('.pt-stat-card-hint')).toHaveText(OCZEKIWANE.gh.programy);

  const tempo = gh.locator('.pt-stat-tile', { hasText: /Tempo w 1\. roku leczenia/i });
  await expect(tempo.locator('.pt-stat-value')).toHaveText(`${OCZEKIWANE.gh.pierwszyRok} cm/rok`);
  await expect(tempo.locator('.pt-stat-sub')).toHaveText(`mediana ${OCZEKIWANE.gh.mediana} · n = ${OCZEKIWANE.gh.n}`);
  const para = gh.locator('.pt-stat-tile', { hasText: /Przed leczeniem/i });
  await expect(para.locator('.pt-stat-value')).toHaveText(`${OCZEKIWANE.gh.para} cm/rok`);
  await expect(para.locator('.pt-stat-sub')).toHaveText('n = 1 z pomiarem 9–15 mies. przed Włączeniem');

  // Zmiana hSDS: te same dwa punkty co tempo (Włączenie i kontrola 1. roku), liczone silnikiem siatek strony.
  const oczekiwanaDelta = await frame.evaluate(() => {
    const zrodlo = typeof window.bmiSource === 'string' && window.bmiSource ? window.bmiSource.toUpperCase() : null;
    const sds = (wzrost, plec, wiekMies) => window.VildaSdsWzrostu.policz({ wzrost, plec, wiekMies, zrodlo, populacja: 'OGOLNA' }).sds;
    const c = sds(121.4, 'M', 84) - sds(112.0, 'M', 72), d = sds(128.4, 'F', 120) - sds(121.0, 'F', 108);
    const srednia = (c + d) / 2, tekst = Math.abs(srednia).toFixed(2).replace('.', ',');
    return { c, d, tekst: (srednia > 0 ? '+' : srednia < 0 ? '−' : '') + tekst };
  });
  expect(Number.isFinite(oczekiwanaDelta.c) && Number.isFinite(oczekiwanaDelta.d), 'strona Start ma siatki wzrostu').toBe(true);
  const delta = gh.locator('.pt-stat-tile', { hasText: /Zmiana hSDS w 1\. roku/i });
  await expect(delta.locator('.pt-stat-value')).toHaveText(oczekiwanaDelta.tekst);
  await expect(delta.locator('.pt-stat-sub')).toContainText('n = 2');

  const program = (nazwa) => gh.locator(`.pt-gh-row[data-program="${nazwa}"]`);
  await expect(program('SNP').locator('.pt-gh-n')).toHaveText('n = 1 z 2 · mała grupa');
  await expect(program('SNP').locator('.pt-gh-figure')).toHaveText('4,5 → 9,4');
  await expect(program('ZT').locator('.pt-gh-figure')).toHaveText('7,4');
  await expect(program('bez programu').locator('.pt-gh-figure')).toHaveText('brak tempa');
  // Kropki stoją na skali: 9,4 leży na prawo od 4,5, a 7,4 (ZT) między nimi.
  const srodek = async (wiersz, klasa) => wiersz.locator(`line.${klasa}`).evaluate((node) => {
    const box = node.getBoundingClientRect(); return box.left + box.width / 2;
  });
  const przed = await srodek(program('SNP'), 'pt-gh-dot--before'), po = await srodek(program('SNP'), 'pt-gh-dot--first');
  const zt = await srodek(program('ZT'), 'pt-gh-dot--first');
  expect(po).toBeGreaterThan(przed);
  expect(zt).toBeGreaterThan(przed);
  expect(zt).toBeLessThan(po);

  for (const [rok, wartosc, n] of OCZEKIWANE.gh.lata) {
    const wiersz = gh.locator('.pt-gh-year', { hasText: rok });
    await expect(wiersz.locator('.pt-stat-meter-figure')).toHaveText(wartosc);
    await expect(wiersz.locator('.pt-stat-missing')).toHaveText(n);
  }
  await bezPrzewijaniaPoziomego(page, frame);

  // Grupy: program, pacjenci z tempem i pacjenci bez tempa z powodem.
  await program('SNP').click();
  await expect(database.locator('.pt-groupbar .lt')).toHaveText('Grupa ze statystyk: GH · SNP · 2 osoby');
  expect(await database.locator('.pt-row').evaluateAll((rows) => rows.map((row) => row.dataset.patientId).sort())).toEqual([ids.c, ids.e].sort());
  await database.locator('.pt-groupbar button', { hasText: 'Statystyki' }).click();
  await expect(gh.locator('.pt-stat-tile'), 'wynik z kart zostaje po powrocie').toHaveCount(3);

  await gh.locator('.pt-gh-gaps [data-reason="no-start"]').click();
  await expect(database.locator('.pt-groupbar .lt')).toHaveText('Grupa ze statystyk: GH · brak Włączenia ze wzrostem · 1 osoba');
  await expect(database.locator(`.pt-row[data-patient-id="${ids.b}"]`)).toBeVisible();
  await database.locator('.pt-groupbar button', { hasText: 'Statystyki' }).click();
  await gh.locator('.pt-gh-gaps [data-reason="too-early"]').click();
  await expect(database.locator(`.pt-row[data-patient-id="${ids.e}"]`)).toBeVisible();
  await database.locator('.pt-groupbar button', { hasText: 'Statystyki' }).click();
  await tempo.click();
  await expect(database.locator('.pt-groupbar .lt')).toHaveText('Grupa ze statystyk: GH · tempo w 1. roku · 2 osoby');
  expect(await database.locator('.pt-row').evaluateAll((rows) => rows.map((row) => row.dataset.patientId).sort())).toEqual([ids.c, ids.d].sort());
});

// P-BAZA-STATYSTYKI, etap 3: leczenie otyłości — cykle, tygodnie leczenia i BMI z silników aplikacji;
// pomiar po 6 mies. u pacjentki f istnieje tylko jako wpis między wizytami (dziennik w notatkach pacjenta).
test('leczenie otyłości: zmiana masy po 12 tyg. i po 6 mies., progi redukcji, BMI dzieci, leki i wykres pacjentów', async ({ page }) => {
  const { frame, database, ids } = await przygotujStatystyki(page);
  await otworzStatystyki(database);
  const E = OCZEKIWANE.otylosc;
  const ob = database.locator('.pt-ob');
  await expect(ob.locator('.pt-stat-card-hint')).toHaveText(E.leki);

  const okno = (klucz) => ob.locator(`.pt-stat-tile[data-window="${klucz}"]`);
  await expect(okno('w12').locator('.pt-stat-label')).toHaveText('Zmiana masy po 12 tyg.');
  await expect(okno('w12').locator('.pt-stat-value')).toHaveText(E.w12.srednia);
  await expect(okno('w12').locator('.pt-stat-sub')).toHaveText(E.w12.opis);
  await expect(okno('m6').locator('.pt-stat-label')).toHaveText('Zmiana masy po 6 mies.');
  await expect(okno('m6').locator('.pt-stat-value'), 'średnia zawiera pomiar z wpisu dziennika (f: −12,0%)').toHaveText(E.m6.srednia);
  await expect(okno('m6').locator('.pt-stat-sub')).toHaveText(E.m6.opis);
  const prog = ob.locator('.pt-stat-tile[data-tile="threshold"]');
  await expect(prog.locator('.pt-stat-label')).toHaveText(E.prog.etykieta);
  await expect(prog.locator('.pt-stat-value')).toHaveText(E.prog.wartosc);
  await expect(prog.locator('.pt-stat-sub')).toHaveText(E.prog.opis);

  // BMI dzieci: d i h mają BMI po 26 tyg.; BMI-SDS tylko d (h nie ma płci) — liczony silnikiem BMI strony na tych samych punktach.
  const sds = await frame.evaluate(() => {
    const zrodlo = typeof window.bmiSource === 'string' && window.bmiSource ? window.bmiSource.toUpperCase() : null;
    const z = (masaKg, wzrostCm, wiekMies) => window.VildaBmi.policz({ bmi: window.VildaBmi.bmi({ masaKg, wzrostCm }), plec: 'F', wiekMies, zrodlo, populacja: 'OGOLNA' }).sds;
    const delta = z(57.0, 147.0, 143) - z(60.0, 145.0, 137), tekst = Math.abs(delta).toFixed(2).replace('.', ',');
    return { delta, tekst: (Number(Math.abs(delta).toFixed(2)) === 0 ? '' : delta > 0 ? '+' : '−') + tekst };
  });
  expect(Number.isFinite(sds.delta), 'strona Start ma siatki BMI').toBe(true);
  const bmi = ob.locator('.pt-stat-tile[data-tile="bmi"]');
  await expect(bmi.locator('.pt-stat-label')).toHaveText('Dzieci: zmiana BMI po 6 mies.');
  await expect(bmi.locator('.pt-stat-value')).toHaveText(E.bmiDzieci);
  await expect(bmi.locator('.pt-stat-sub')).toHaveText(`n = 2 · BMI-SDS ${sds.tekst} (n = 1)`);

  // Leki: od najliczniejszego; kropka „po 6 mies.” przy większej redukcji leży dalej w prawo.
  const lek = (nazwa) => ob.locator(`.pt-ob-row[data-drug="${nazwa}"]`);
  expect(await ob.locator('.pt-ob-row').evaluateAll((rows) => rows.map((row) => row.dataset.drug))).toEqual(Object.keys(E.leki12i6));
  for (const [nazwa, [opis, liczby]] of Object.entries(E.leki12i6)) {
    await expect(lek(nazwa).locator('.pt-gh-n')).toHaveText(opis);
    await expect(lek(nazwa).locator('.pt-gh-figure')).toHaveText(liczby);
  }
  const srodek = async (wiersz, klasa) => wiersz.locator(`line.${klasa}`).evaluate((node) => {
    const box = node.getBoundingClientRect(); return box.left + box.width / 2;
  });
  const saxenda12 = await srodek(lek('Saxenda'), 'pt-gh-dot--before'), saxenda6 = await srodek(lek('Saxenda'), 'pt-gh-dot--first');
  const wegovy12 = await srodek(lek('Wegovy'), 'pt-gh-dot--before'), wegovy6 = await srodek(lek('Wegovy'), 'pt-gh-dot--first');
  expect(saxenda6).toBeGreaterThan(saxenda12);   // −1,0 za −0,5
  expect(wegovy12).toBeGreaterThan(saxenda6);    // −5,1 za −1,0
  expect(wegovy6).toBeGreaterThan(wegovy12);     // −12,0 za −5,1
  await expect(ob.locator('.pt-ob-scale span')).toHaveText(E.skala);

  // Wykres „każdy pacjent”: h +3,0 (przyrost, nad zerem), d −5,0 i f −12,0 (pod zerem), od najmniejszej redukcji.
  await expect(ob.locator('.pt-ob-tick')).toHaveText(E.podzialka);
  const wykres = await ob.locator('.pt-ob-fall').evaluate((fall) => {
    const plot = fall.querySelector('.pt-ob-fall-plot');
    const zero = plot.querySelector('.pt-ob-zero').getBoundingClientRect().top;
    const etykieta = Array.from(fall.querySelectorAll('.pt-ob-tick')).find((node) => node.textContent === '0%').getBoundingClientRect();
    return {
      zero, zeroEtykieta: etykieta.top + etykieta.height / 2,
      slupki: Array.from(plot.querySelectorAll('rect')).map((rect) => {
        const box = rect.getBoundingClientRect();
        return { przyrost: rect.classList.contains('pt-ob-bar--gain'), lewo: box.left, gora: box.top, dol: box.bottom, wysokosc: box.height };
      }),
    };
  });
  expect(wykres.slupki.map((slupek) => slupek.przyrost)).toEqual([true, false, false]);
  expect(wykres.slupki[1].lewo).toBeGreaterThan(wykres.slupki[0].lewo);
  expect(wykres.slupki[2].lewo).toBeGreaterThan(wykres.slupki[1].lewo);
  expect(Math.abs(wykres.slupki[0].dol - wykres.zero), 'przyrost stoi na linii zera').toBeLessThan(1);
  expect(Math.abs(wykres.slupki[1].gora - wykres.zero), 'ubytek wisi pod linią zera').toBeLessThan(1);
  expect(wykres.slupki[2].wysokosc / wykres.slupki[1].wysokosc, '−12,0% wobec −5,0%').toBeCloseTo(2.4, 1);
  expect(wykres.slupki[0].wysokosc / wykres.slupki[1].wysokosc, '+3,0% wobec −5,0%').toBeCloseTo(0.6, 1);
  // Podziałka stoi przy swoich liniach: etykieta „0%” na wysokości linii zera.
  expect(Math.abs(wykres.zeroEtykieta - wykres.zero)).toBeLessThan(4);
  await bezPrzewijaniaPoziomego(page, frame);

  // Grupy pacjentów: lek, okno, próg, przyrost i powody braku wyniku.
  const grupa = async (akcja, etykieta, klucze) => {
    await akcja();
    await expect(database.locator('.pt-groupbar .lt')).toHaveText(`Grupa ze statystyk: ${etykieta}`);
    expect(await database.locator('.pt-row').evaluateAll((rows) => rows.map((row) => row.dataset.patientId).sort())).toEqual(klucze.map((klucz) => ids[klucz]).sort());
    await database.locator('.pt-groupbar button', { hasText: 'Statystyki' }).click();
    await expect(ob.locator('.pt-stat-tile'), 'wynik z kart zostaje po powrocie').toHaveCount(4);
  };
  await grupa(() => lek('Wegovy').click(), 'Otyłość · Wegovy · 2 osoby', ['e', 'f']);
  await grupa(() => okno('m6').click(), 'Otyłość · masa po 6 mies. · 3 osoby', ['d', 'f', 'h']);
  await grupa(() => prog.click(), 'Otyłość · redukcja o ≥ 5% po 6 mies. · 2 osoby', ['d', 'f']);
  await grupa(() => ob.locator('.pt-ob-gaps [data-reason="gained"]').click(), 'Otyłość · przyrost masy po 6 mies. · 1 osoba', ['h']);
  await grupa(() => ob.locator('.pt-ob-gaps[data-window="w12"] [data-reason="no-start"]').click(), 'Otyłość · po 12 tyg. · brak Włączenia z masą · 1 osoba', ['g']);
  await grupa(() => ob.locator('.pt-ob-gaps[data-window="m6"] [data-reason="too-early"]').click(), 'Otyłość · po 6 mies. · leczenie krótsze niż 20 tyg. · 1 osoba', ['e']);
  await expect(ob.locator('.pt-ob-gaps[data-window="w12"] button')).toHaveCount(1);
  await expect(ob.locator('.pt-ob-gaps[data-window="m6"] button')).toHaveCount(2);
});

// P-BAZA-STATYSTYKI, etap 4: raport PDF i plik dla Excela — prawdziwe pobranie z prawdziwej aplikacji.
// Biblioteki (pdfmake, JSZip) są lokalne; sieć zewnętrzna jest w teście odcięta.
test('raport PDF i plik dla Excela: pobranie z lokalnych bibliotek, liczby z ekranu, bez danych osobowych', async ({ page }) => {
  const zewnetrzne = [];
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => { zewnetrzne.push(route.request().url()); return route.abort(); });
  const { frame, database, ids } = await przygotujStatystyki(page);
  await otworzStatystyki(database);
  const pasek = database.locator('.pt-stat-cardsbar');
  await expect(pasek.locator('[data-export]')).toHaveText(['Raport PDF', 'Eksport do Excela']);
  await expect(pasek.locator('[data-export="pdf"]'), 'pliki są dostępne po zakończeniu liczenia').toBeEnabled();
  await expect(pasek.locator('.pt-stat-export-status')).toHaveText('Raport i plik dla Excela zawierają liczby z tego ekranu, bez nazwisk i dat urodzenia.');

  /* Czekamy na pobranie TEGO pliku, nie na „jakiekolwiek pobranie”: aplikacja sama zapisuje w tle kopię konta
     (`wagaiwzrost_konto_….wiw`) i przy obciążonej maszynie to pobranie wpada w okno pomiaru — pierwsza wersja tego
     testu padła tak w CI. Predykat usuwa wyścig (ten sam wzorzec, co POSTEPY-9 w postepy-doroslego-zakladka.spec.mjs). */
  const pobierz = async (rodzaj, przedKliknieciem) => {
    const [pobranie] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000, predicate: (zdarzenie) => zdarzenie.suggestedFilename().endsWith(`.${rodzaj}`) }),
      Promise.resolve(przedKliknieciem ? przedKliknieciem() : null).then(() => pasek.locator(`[data-export="${rodzaj}"]`).click()),
    ]);
    const sciezka = await pobranie.path();
    return { nazwa: pobranie.suggestedFilename(), bajty: fs.readFileSync(sciezka) };
  };
  // Kontrola negatywna: tuż przed kliknięciem startuje obce pobranie o nazwie kopii konta — test ma je przepuścić.
  const obcePobranie = () => frame.evaluate(() => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['x'], { type: 'application/octet-stream' }));
    link.download = 'wagaiwzrost_konto_e2e.wiw';
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  // PDF: zegar testu stoi na 17.06.2026, więc data w nazwie jest stała; w nazwie nie ma nic poza datą.
  const pdf = await pobierz('pdf', obcePobranie);
  expect(pdf.nazwa).toBe('statystyki-bazy-pacjentow-2026-06-17.pdf');
  expect(pdf.bajty.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdf.bajty.length, 'dokument z czcionką i trzema stronami').toBeGreaterThan(15_000);
  await expect(pasek.locator('.pt-stat-export-status')).toHaveText('Zapisano plik statystyki-bazy-pacjentow-2026-06-17.pdf.');
  await expect(pasek.locator('[data-export="pdf"]'), 'fokus wraca na przycisk').toBeFocused();

  // Excel: prawdziwy plik .xlsx — archiwum z arkuszami „Podsumowanie” i „Pacjenci”.
  const xlsx = await pobierz('xlsx');
  expect(xlsx.nazwa).toBe('statystyki-bazy-pacjentow-2026-06-17.xlsx');
  await expect(pasek.locator('.pt-stat-export-status')).toHaveText('Zapisano plik statystyki-bazy-pacjentow-2026-06-17.xlsx.');
  const JSZip = createRequire(import.meta.url)('../../jszip.min.js');
  const archiwum = await JSZip.loadAsync(xlsx.bajty);
  const czesc = (sciezka) => archiwum.file(sciezka).async('string');
  expect(Object.keys(archiwum.files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
  expect(await czesc('xl/workbook.xml')).toContain('<sheet name="Podsumowanie" sheetId="1" r:id="rId1"/><sheet name="Pacjenci" sheetId="2" r:id="rId2"/>');
  const podsumowanie = await czesc('xl/worksheets/sheet1.xml'), pacjenci = await czesc('xl/worksheets/sheet2.xml');
  const wiersz = (xml, etykieta) => (xml.split('<row ').find((fragment) => fragment.includes(`>${etykieta}</t>`)) || '');
  const liczby = (fragment) => Array.from(fragment.matchAll(/<v>([^<]*)<\/v>/g)).map((match) => Number(match[1]));
  // Te same liczby, co na ekranie (OCZEKIWANE): GH 8,4 cm/rok; otyłość −2,8% i −4,67% (na ekranie −4,7%); progi 2 z 3.
  expect(liczby(wiersz(podsumowanie, 'Pacjentów w bazie'))).toEqual([OCZEKIWANE.razem]);
  expect(liczby(wiersz(podsumowanie, 'Tempo w 1. roku leczenia'))).toEqual([8.4]);
  expect(liczby(wiersz(podsumowanie, 'Zmiana masy po 12 tyg.'))).toEqual([-2.8]);
  expect(liczby(wiersz(podsumowanie, 'Zmiana masy po 6 mies.'))).toEqual([-4.67]);
  expect(liczby(wiersz(podsumowanie, 'Redukcja o ≥ 5% po 6 mies.'))).toEqual([2]);
  expect(liczby(wiersz(podsumowanie, 'Saxenda'))).toEqual([3, -0.5, 2, -1, 2]);
  expect(liczby(wiersz(podsumowanie, 'Co najmniej 2 pomiary wzrostu'))).toEqual([7, 8, 88]);
  // Arkusz pacjentów: nagłówek i osiem wierszy; pomiar po 6 mies. z wpisu dziennika (−12%) jest w pliku.
  expect((pacjenci.match(/<row /g) || []).length).toBe(1 + OCZEKIWANE.razem);
  expect(pacjenci).toContain('<v>-12</v>');
  // Żadnych danych osobowych: nazwisk, imion, identyfikatorów ani dat urodzenia (nazwisko „Statystyk” pokrywa „Fikcyjn” —
  // samo słowo występuje w tytule raportu).
  const calosc = [podsumowanie, pacjenci, await czesc('xl/workbook.xml')].join('\n');
  ['Fikcyjn', 'Bartek', 'Cezary', 'Dorota', 'Felicja', 'Gustaw', 'Bezplci', '2014-03-20', '2010-09-01', '2005-05-05', '2016-06-18'].concat(Object.values(ids))
    .forEach((napis) => expect(calosc, `plik nie zawiera „${napis}”`).not.toContain(napis));

  // Biblioteki przyszły z plików aplikacji; nic nie poszło do sieci zewnętrznej po bibliotekę.
  const skrypty = await frame.evaluate(() => Array.from(document.querySelectorAll('script[data-vilda-pdfmake], script[data-vilda-jszip]')).map((node) => node.getAttribute('src')));
  expect(skrypty.sort()).toEqual(['jszip.min.js?v=1', 'pdfmake.min.js?v=1', 'pdfmake_vfs_fonts.js?v=1']);
  expect(zewnetrzne.filter((url) => /cdnjs|jsdelivr|sheetjs|pdfmake|jszip/i.test(url))).toEqual([]);

  // Ponowne policzenie czyści komunikat o pliku; pliki dalej są dostępne.
  await database.locator('.pt-stat-check').click();
  await expect(pasek.locator('.pt-stat-export-status')).toHaveText('Raport i plik dla Excela zawierają liczby z tego ekranu, bez nazwisk i dat urodzenia.');
  await expect(pasek.locator('[data-export]')).toHaveCount(2);
});

test.describe('telefon', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('przełącznik pod tytułem, kafle w dwóch kolumnach, bez przewijania w bok', async ({ page }) => {
    const { frame, database } = await przygotujStatystyki(page);
    await otworzStatystyki(database);
    const kafle = await database.locator('.pt-stats > .pt-stat-tiles .pt-stat-tile').evaluateAll((nodes) => nodes.map((node) => {
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

    // Etap 2: sekcja leczenia GH mieści się na telefonie; kropki hantli mają stały rozmiar.
    await database.locator('.pt-groupbar button', { hasText: 'Statystyki' }).click();
    await expect(database.locator('.pt-gh .pt-stat-tile')).toHaveCount(3);
    await expect(database.locator('.pt-stat-check')).toBeEnabled();
    await bezPrzewijaniaPoziomego(page, frame);
    const kropka = await database.locator('.pt-gh-row[data-program="SNP"] line.pt-gh-dot--first').boundingBox();
    expect(Math.round(kropka.width), 'kropka 12 px niezależnie od szerokości').toBe(12);
    expect(Math.round(kropka.height)).toBe(12);

    // Etap 3: sekcja leczenia otyłości — kafle jeden pod drugim, podziałka wykresu w skali 1:1.
    const ob = database.locator('.pt-ob');
    await expect(ob.locator('.pt-stat-tile')).toHaveCount(4);
    const kafleOtylosci = await ob.locator('.pt-stat-tile').evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().left)));
    expect(new Set(kafleOtylosci).size, 'jedna kolumna').toBe(1);
    const podzialka = await ob.locator('.pt-ob-fall-axis').boundingBox(), slupki = await ob.locator('.pt-ob-fall-plot').boundingBox();
    expect(Math.round(podzialka.width)).toBe(46);
    expect(Math.round(podzialka.height)).toBe(132);
    expect(Math.round(slupki.height)).toBe(132);
    expect(slupki.x + slupki.width, 'wykres mieści się w karcie').toBeLessThanOrEqual(390);
    const kropkaLeku = await ob.locator('.pt-ob-row[data-drug="Wegovy"] line.pt-gh-dot--first').boundingBox();
    expect(Math.round(kropkaLeku.width)).toBe(12);

    // Etap 4: przyciski plików mieszczą się w pasku i mają cel dotyku co najmniej 44 px.
    for (const przycisk of await database.locator('.pt-stat-cardsbar button').all()) {
      const ramka = await przycisk.boundingBox();
      expect(ramka.height, 'cel dotyku co najmniej 44 px').toBeGreaterThanOrEqual(44);
      expect(ramka.x + ramka.width).toBeLessThanOrEqual(390);
    }
  });
});
