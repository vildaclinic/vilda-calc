import { expect, test } from '../support/test-czas.mjs';
import { otworzStatystyki, przygotujStatystyki } from '../support/baza-pacjentow-statystyki.mjs';

// P-BAZA-ZAKRES (decyzja właściciela 2026-11-24: „popracuj nad selektorem Zakres bo tam jest mały wybór”):
// pole „Zakres” w Statystykach Bazy — okna ostatniego zapisu karty — i osobne pole „Leczenie” (P-BAZA-SEKCJE,
// decyzja właściciela 2026-11-24: „wydziel to pole Leczenie”). Prawdziwy renderer,
// prawdziwy szyfrowany sejf i wyłącznie fikcyjne osoby (osiem osób a–h: tests/support/baza-pacjentow-statystyki.mjs;
// zegar testu stoi na 17.06.2026). Test dopisuje fikcyjne osoby z dawnym zapisem karty:
//   i  dziewczynka, leczona GH (SNP), ostatni zapis 15.01.2025 — 17 mies. temu
//   j  chłopiec, bez leczenia, ostatni zapis 10.01.2024 — 29 mies. temu
test.use({ serviceWorkers: 'block' });
test.setTimeout(150_000);

const gotowe = async (database) => {
  await expect(database.locator('.pt-stat-cardsbar')).toContainText('Karty policzone o');
  await expect(database.locator('.pt-stat-check')).toBeEnabled();
};
const kafel = (frame, database, etykieta) => database.locator('.pt-stat-tile')
  .filter({ has: frame.locator('.pt-stat-label', { hasText: new RegExp(`^${etykieta}$`, 'i') }) });
const zakres = (database) => database.locator('.pt-filter-select[data-filter-key="range"]');
const leczenie = (database) => database.locator('.pt-filter-select[data-filter-key="treatment"]');
const filtr = (database, klucz) => database.locator(`.pt-filter-select[data-filter-key="${klucz}"]`);
const pacjenci = async (database) => (await database.locator('.pt-row').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-patient-id')))).sort();
const posortowane = (...ids) => ids.slice().sort();

// Zapis karty fikcyjnej osoby z chwilą zapisu w przeszłości: zegar okna aplikacji jest cofnięty tylko na czas
// samego zapisu w sejfie (sejf bierze chwilę zapisu z zegara), potem wraca wspólny zegar testu.
async function zapiszDawno(frame, osoby) {
  return frame.evaluate(async (lista) => {
    const Zegar = Date, wynik = {};
    for (const osoba of lista) {
      const stala = new Zegar(osoba.zapis).getTime();
      window.Date = class extends Zegar {
        constructor(...args) { if (args.length) super(...args); else super(stala); }
        static now() { return stala; }
      };
      try {
        const record = await window.VildaVault.savePatient({ version: 1, name: `${osoba.user.lastName} ${osoba.user.firstName}`, user: osoba.user, ...(osoba.extra || {}) }, { dedup: false });
        wynik[osoba.klucz] = record.patientId;
      } finally { window.Date = Zegar; }
    }
    return wynik;
  }, osoby);
}
const DAWNI = [
  { klucz: 'i', zapis: '2025-01-15T10:00:00.000Z',
    user: { lastName: 'Fikcyjna Statystyka', firstName: 'Iga', sex: 'F', dobISO: '2015-02-01', age: 9, ageMonths: 11, height: 130, weight: 27, measuredAtISO: '2025-01-15' },
    extra: { ghTherapyPoints: [
      { id: 'gh-i-1', type: 'start', ageYears: 9, ageMonths: 0, height: 124.0, weight: 24, program: 'SNP', drug: 'Genotropin 12 mg' },
      { id: 'gh-i-2', type: 'continue', ageYears: 9, ageMonths: 6, height: 128.0, weight: 26, program: 'SNP', drug: 'Genotropin 12 mg' },
    ] } },
  { klucz: 'j', zapis: '2024-01-10T10:00:00.000Z',
    user: { lastName: 'Fikcyjny Statystyk', firstName: 'Jan', sex: 'M', dobISO: '2012-04-04', age: 11, ageMonths: 9, height: 148, weight: 40, measuredAtISO: '2024-01-10' } },
];
const odswiezBaze = (frame) => frame.evaluate(() => { document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false })); });

async function start(page) {
  const baza = await przygotujStatystyki(page);
  Object.assign(baza.ids, await zapiszDawno(baza.frame, DAWNI));
  await odswiezBaze(baza.frame);
  await expect(baza.database.locator('.pt-row')).toHaveCount(11);
  await otworzStatystyki(baza.database);
  await gotowe(baza.database);
  return baza;
}

test('pola „Zakres” i „Leczenie”: pozycje z licznikami; okna ostatniego zapisu i leczenie zawężają statystyki — także razem — bez czytania sejfu', async ({ page }) => {
  const { frame, database, ids } = await start(page);

  // Dwa osobne pola; każda pozycja mówi, ilu pacjentów bazy obejmuje (liczniki leczenia — po policzeniu kart).
  await expect(database.locator('.pt-filters .pt-filter-label')).toHaveText(['Zakres', 'Leczenie', 'Lista pacjentów', 'Płeć', 'Wiek']);
  // Napisy pozycji są krótkie, żeby mieściły się w polu równej szerokości (P-BAZA-FILTRY); pełny opis pokazuje baner.
  await expect(zakres(database).locator('option')).toHaveText([
    'cała baza (10)',
    'zapis ≤ 3 mies. (8)', 'zapis ≤ 6 mies. (8)', 'zapis ≤ 12 mies. (8)',
    'zapis > 12 mies. (2)', 'zapis > 24 mies. (1)',
  ]);
  await expect(leczenie(database).locator('option')).toHaveText(['wszyscy', 'hormon wzrostu (5)', 'otyłość (5)']);
  await expect(kafel(frame, database, 'Pacjenci w bazie').locator('.pt-stat-value')).toHaveText('10');
  await expect(kafel(frame, database, 'Pacjenci w bazie').locator('.pt-stat-sub')).toHaveText('8 z zapisem w ostatnich 12 mies.');

  await frame.evaluate(() => {
    const vault = window.VildaVault, newest = vault.getNewestSnapshot, category = vault.listPatientNotesByCategory;
    window.__zakresOdczyty = 0;
    vault.getNewestSnapshot = function (...args) { window.__zakresOdczyty += 1; return newest.apply(this, args); };
    vault.listPatientNotesByCategory = function (...args) { window.__zakresOdczyty += 1; return category.apply(this, args); };
  });

  // Bez zapisu od ponad 12 mies.: i (17 mies.) oraz j (29 mies.).
  const baner = database.locator('.pt-scope');
  await zakres(database).selectOption('o12');
  await expect(baner.locator('.pt-scope-name')).toHaveText('bez zapisu od ponad 12 mies.');
  await expect(baner.locator('.pt-scope-count')).toHaveText('2 osoby w tym zakresie');
  await expect(zakres(database)).toBeFocused();
  await expect(zakres(database)).toHaveClass(/\bon\b/);
  await expect(kafel(frame, database, 'Pacjenci w grupie').locator('.pt-stat-value')).toHaveText('2');
  // Przy oknie ostatniego zapisu kafelek nie powtarza „z zapisem w ostatnich 12 mies.” (P-BAZA-SEKCJE).
  await expect(kafel(frame, database, 'Pacjenci w grupie').locator('.pt-stat-sub')).toHaveCount(0);
  await expect(database.locator('.pt-gh .pt-stat-card-hint')).toHaveText('leczonych: 1 · SNP 1');

  // Bez zapisu od ponad 24 mies.: tylko j. Z zapisem w ostatnich 3 mies.: osiem osób a–h.
  await zakres(database).selectOption('o24');
  await expect(baner.locator('.pt-scope-count')).toHaveText('1 osoba w tym zakresie');
  await expect(database.locator('.pt-gh .pt-stat-card-hint')).toHaveText('');
  await zakres(database).selectOption('m3');
  await expect(baner.locator('.pt-scope-name')).toHaveText('z zapisem w ostatnich 3 mies.');
  await expect(baner.locator('.pt-scope-count')).toHaveText('8 osób w tym zakresie');
  await expect(database.locator('.pt-gh .pt-stat-card-hint')).toHaveText('leczonych: 4 · SNP 2 · bez programu 1 · ZT 1');

  // Leczeni z powodu otyłości: d, e, f, g, h; z płcią „dziewczęta”: d, f.
  await zakres(database).selectOption('');
  await leczenie(database).selectOption('ob');
  await expect(leczenie(database)).toBeFocused();
  await expect(leczenie(database)).toHaveClass(/\bon\b/);
  await expect(baner.locator('.pt-scope-name')).toHaveText('leczeni z powodu otyłości');
  await expect(baner.locator('.pt-scope-count')).toHaveText('5 osób w tym zakresie');
  await expect(database.locator('.pt-ob .pt-stat-card-hint')).toHaveText('leczonych: 5 · Saxenda 3 · Wegovy 2');
  await filtr(database, 'sex').selectOption('F');
  await expect(baner.locator('.pt-scope-name')).toHaveText('leczeni z powodu otyłości · dziewczęta');
  await expect(baner.locator('.pt-scope-count')).toHaveText('2 osoby w tym zakresie');
  await expect(database.locator('.pt-ob .pt-stat-card-hint')).toHaveText('leczonych: 2 · Saxenda 1 · Wegovy 1');
  await filtr(database, 'sex').selectOption('');

  // Leczeni hormonem wzrostu: b, c, d, e oraz i — ci sami, których liczy sekcja „leczonych”.
  await leczenie(database).selectOption('gh');
  await expect(baner.locator('.pt-scope-name')).toHaveText('leczeni hormonem wzrostu');
  await expect(baner.locator('.pt-scope-count')).toHaveText('5 osób w tym zakresie');
  await expect(database.locator('.pt-gh .pt-stat-card-hint')).toHaveText('leczonych: 5 · SNP 3 · bez programu 1 · ZT 1');
  await expect(kafel(frame, database, 'Pacjenci w grupie').locator('.pt-stat-sub')).toHaveText('4 z zapisem w ostatnich 12 mies.');
  // …i dziewczęta: d, i.
  await filtr(database, 'sex').selectOption('F');
  await expect(baner.locator('.pt-scope-name')).toHaveText('leczeni hormonem wzrostu · dziewczęta');
  await expect(baner.locator('.pt-scope-count')).toHaveText('2 osoby w tym zakresie');
  // Oba pola naraz: leczeni hormonem wzrostu bez zapisu od ponad 12 mies. — tylko i; z zapisem w ostatnich 12 mies. — b, c, d, e.
  await filtr(database, 'sex').selectOption('');
  await zakres(database).selectOption('o12');
  await expect(baner.locator('.pt-scope-name')).toHaveText('bez zapisu od ponad 12 mies. · leczeni hormonem wzrostu');
  await expect(baner.locator('.pt-scope-count')).toHaveText('1 osoba w tym zakresie');
  await expect(database.locator('.pt-gh .pt-stat-card-hint')).toHaveText('leczonych: 1 · SNP 1');
  await zakres(database).selectOption('m12');
  await expect(baner.locator('.pt-scope-name')).toHaveText('z zapisem w ostatnich 12 mies. · leczeni hormonem wzrostu');
  await expect(baner.locator('.pt-scope-count')).toHaveText('4 osoby w tym zakresie');
  await zakres(database).selectOption('');
  await filtr(database, 'sex').selectOption('F');
  await expect(baner.locator('.pt-scope-count')).toHaveText('2 osoby w tym zakresie');
  expect(await frame.evaluate(() => window.__zakresOdczyty), 'zmiana zakresu i leczenia nie czyta kart ani notatek — wybiera z policzonego wyniku').toBe(0);

  // „Pokaż listę” otwiera pacjentów zakresu; nazwa grupy niesie zakres. Powrót zachowuje wybór.
  await baner.getByRole('button', { name: 'Pokaż listę' }).click();
  expect(await pacjenci(database)).toEqual(posortowane(ids.d, ids.i));
  await expect(database.locator('.pt-groupbar .lt')).toHaveText('Grupa ze statystyk: leczeni hormonem wzrostu · dziewczęta · 2 osoby');
  await database.getByRole('button', { name: '← Statystyki' }).click();
  await expect(leczenie(database)).toHaveValue('gh');
  await expect(baner.locator('.pt-scope-count')).toHaveText('2 osoby w tym zakresie');
  await filtr(database, 'sex').selectOption('');
  await leczenie(database).selectOption('');
  await zakres(database).selectOption('o12');
  await baner.getByRole('button', { name: 'Pokaż listę' }).click();
  expect(await pacjenci(database)).toEqual(posortowane(ids.i, ids.j));
  await expect(database.locator('.pt-groupbar .lt')).toHaveText('Grupa ze statystyk: bez zapisu od ponad 12 mies. · 2 osoby');
  await database.getByRole('button', { name: '← Statystyki' }).click();
  await expect(baner.locator('.pt-scope-name')).toHaveText('bez zapisu od ponad 12 mies.');

  // „Cała baza” zdejmuje zakres i leczenie.
  await leczenie(database).selectOption('gh');
  await expect(baner.locator('.pt-scope-count')).toHaveText('1 osoba w tym zakresie');
  await baner.getByRole('button', { name: 'Cała baza' }).click();
  await expect(database.locator('.pt-scope')).toHaveCount(0);
  await expect(zakres(database)).toHaveValue('');
  await expect(leczenie(database)).toHaveValue('');
  await expect(kafel(frame, database, 'Pacjenci w bazie').locator('.pt-stat-value')).toHaveText('10');
});

test('wybrane „Leczenie” po zmianie w bazie: statystyki czekają na policzenie kart i pokazują nowy skład', async ({ page }) => {
  const { frame, database, ids } = await start(page);
  const baner = database.locator('.pt-scope');
  await leczenie(database).selectOption('gh');
  await expect(baner.locator('.pt-scope-count')).toHaveText('5 osób w tym zakresie');

  // Nowa fikcyjna osoba leczona GH zapisana w tle; odświeżony widok zachowuje wybrany zakres i liczy karty od nowa.
  const nowi = await frame.evaluate(async () => {
    const record = await window.VildaVault.savePatient({ version: 1, name: 'Fikcyjny Statystyk Karol',
      user: { lastName: 'Fikcyjny Statystyk', firstName: 'Karol', sex: 'M', dobISO: '2017-07-07', age: 8, ageMonths: 11, height: 126, weight: 25, measuredAtISO: '2026-06-17' },
      ghTherapyPoints: [{ id: 'gh-k-1', type: 'start', ageYears: 8, ageMonths: 6, height: 122.0, weight: 23, program: 'SGA', drug: 'Omnitrope 10 mg' }] }, { dedup: false });
    return { k: record.patientId };
  });
  await odswiezBaze(frame);
  await expect(database).toHaveAttribute('data-view', 'stats');
  await expect(leczenie(database)).toHaveValue('gh');
  await expect(baner.locator('.pt-scope-name')).toHaveText('leczeni hormonem wzrostu');
  await expect(baner.locator('.pt-scope-count')).toHaveText('6 osób w tym zakresie');
  await gotowe(database);
  await expect(database.locator('.pt-gh .pt-stat-card-hint')).toHaveText('leczonych: 6 · SNP 3 · bez programu 1 · SGA 1 · ZT 1');
  await expect(zakres(database).locator('option').first()).toHaveText('cała baza (11)');
  await expect(leczenie(database).locator('option[value="gh"]')).toHaveText('hormon wzrostu (6)');
  await baner.getByRole('button', { name: 'Pokaż listę' }).click();
  expect(await pacjenci(database)).toEqual(posortowane(ids.b, ids.c, ids.d, ids.e, ids.i, nowi.k));
});

// P-BAZA-FILTRY (decyzja właściciela 2026-11-25): pola filtrów mają tę samą szerokość, a znaczek rozwijania stoi
// w stałym odstępie od prawej krawędzi pola.
const wymiaryPol = (database) => database.locator('.pt-filters').evaluate((pasek) => {
  const miarka = document.createElement('span');
  document.body.appendChild(miarka);
  const pola = Array.from(pasek.querySelectorAll('.pt-filter-select')).map((pole) => {
    const styl = getComputedStyle(pole), ramka = pole.getBoundingClientRect(), znaczek = getComputedStyle(pole.parentElement, '::after');
    Object.assign(miarka.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap', font: styl.font });
    miarka.textContent = pole.options[pole.selectedIndex].textContent;
    return {
      klucz: pole.getAttribute('data-filter-key'), szerokosc: ramka.width, lewa: ramka.left, gora: ramka.top, wysokosc: ramka.height,
      napis: miarka.getBoundingClientRect().width, wnetrze: ramka.width - parseFloat(styl.paddingLeft) - parseFloat(styl.paddingRight),
      wyglad: styl.appearance, odstepPrawy: parseFloat(styl.paddingRight), ramka: pole.parentElement.className,
      znaczekOdKrawedzi: parseFloat(znaczek.right), znaczekSzerokosc: parseFloat(znaczek.width), znaczekTresc: znaczek.content,
    };
  });
  miarka.remove();
  return { pola, pasek: pasek.getBoundingClientRect().width, przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});

test('pola filtrów mają tę samą szerokość; znaczek rozwijania jest odsunięty od prawej krawędzi, a wybrana pozycja mieści się w polu', async ({ page }) => {
  // Konto testowe ma dostęp do list pacjentów, więc pól jest pięć.
  const { database } = await start(page);
  await zakres(database).selectOption('m12');
  await leczenie(database).selectOption('gh');
  await expect(database.locator('.pt-scope-name')).toHaveText('z zapisem w ostatnich 12 mies. · leczeni hormonem wzrostu');

  // [szerokość okna, ile pól w pierwszym wierszu]
  for (const [okno, wPierwszymWierszu] of [[1440, 5], [1280, 5], [1024, 4], [900, 3]]) {
    await page.setViewportSize({ width: okno, height: 900 });
    await expect.poll(async () => (await wymiaryPol(database)).pola.filter((pole, _, wszystkie) => Math.abs(pole.gora - wszystkie[0].gora) < 1).length, { message: `okno ${okno} px` }).toBe(wPierwszymWierszu);
    const { pola, przewijanie } = await wymiaryPol(database);
    expect(pola.map((pole) => pole.klucz), `okno ${okno} px`).toEqual(['range', 'treatment', 'list', 'sex', 'band']);
    const szerokosci = pola.map((pole) => pole.szerokosc);
    expect(Math.max(...szerokosci) - Math.min(...szerokosci), `okno ${okno} px: pola równej szerokości`).toBeLessThan(1);
    expect(przewijanie, `okno ${okno} px`).toBeLessThanOrEqual(0);
    for (const pole of pola) {
      // Strzałka systemowa jest wyłączona; znaczek rysuje ramka pola, co najmniej 12 px od prawej krawędzi,
      // a napis kończy się przed znaczkiem.
      expect(pole.wyglad, pole.klucz).toBe('none');
      expect(pole.ramka, pole.klucz).toBe('pt-filter-box');
      expect(pole.znaczekTresc, pole.klucz).not.toBe('none');
      expect(pole.znaczekOdKrawedzi, pole.klucz).toBeGreaterThanOrEqual(12);
      expect(pole.odstepPrawy, pole.klucz).toBeGreaterThanOrEqual(pole.znaczekOdKrawedzi + pole.znaczekSzerokosc + 4);
      expect(pole.wysokosc, pole.klucz).toBeGreaterThanOrEqual(44);
      expect(pole.napis, `okno ${okno} px, ${pole.klucz}: wybrana pozycja mieści się w polu`).toBeLessThanOrEqual(pole.wnetrze);
    }
  }
});

test.describe('telefon', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('pola filtrów stoją w dwóch równych kolumnach; pełny opis zakresu pokazuje baner', async ({ page }) => {
    const { database } = await start(page);
    await zakres(database).selectOption('m12');
    await expect(database.locator('.pt-scope-name')).toHaveText('z zapisem w ostatnich 12 mies.');
    const { pola, pasek, przewijanie } = await wymiaryPol(database);
    expect(pola).toHaveLength(5);
    const szerokosci = pola.map((pole) => pole.szerokosc);
    expect(Math.max(...szerokosci) - Math.min(...szerokosci)).toBeLessThan(1);
    // Dwa pola w wierszu: lewa kolumna 1., 3. i 5. pola, prawa — 2. i 4.
    expect(szerokosci[0]).toBeGreaterThan(pasek * 0.45);
    expect(szerokosci[0]).toBeLessThan(pasek * 0.5);
    for (const numer of [2, 4]) expect(Math.round(pola[numer].lewa)).toBe(Math.round(pola[0].lewa));
    expect(Math.round(pola[3].lewa)).toBe(Math.round(pola[1].lewa));
    expect(pola[1].lewa).toBeGreaterThan(pola[0].lewa + szerokosci[0]);
    expect(Math.round(pola[1].gora)).toBe(Math.round(pola[0].gora));
    expect(pola[2].gora).toBeGreaterThan(pola[0].gora + pola[0].wysokosc);
    for (const pole of pola) {
      expect(pole.wysokosc, pole.klucz).toBeGreaterThanOrEqual(44);
      expect(pole.znaczekOdKrawedzi, pole.klucz).toBeGreaterThanOrEqual(12);
    }
    expect(przewijanie).toBeLessThanOrEqual(0);
  });
});
