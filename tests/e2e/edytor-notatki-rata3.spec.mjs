import { expect, test } from '../support/test-czas.mjs';

// P-NOTATKI rata 3b (audyt „Dodaj notatkę do wizyty" 2026-09-18).
//
// G14b (decyzja właściciela D10). Sejf wykrywał tylko jeden rodzaj kolizji — zapis notatki
//     skasowanej gdzie indziej. Zwykła równoległa edycja przechodziła bez słowa: kto zapisał
//     drugi, ten wygrywał, a tekst pierwszego znikał bez śladu. Arkusz podaje teraz `baseRev`
//     (wersję, z którą się otworzył), sejf zatrzymuje zapis, a lekarz wybiera wersję.
// G21 (decyzja właściciela D12). Zamknięcie arkusza wyrzucało wpisany tekst bez pytania —
//     „Anuluj", Escape, kolejne wywołanie edytora i zamknięcie karty tak samo.
// G18. Arkusz notatki był jedynym ekranem bez nazwiska pacjenta, a otwiera go przycisk z menu,
//     który pacjenta nie pokazuje w żaden inny sposób.
//
// Service worker zablokowany: przy pierwszej wizycie instaluje się i robi `location.reload()`
// na `controllerchange`, co przerywa nawigację testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Rata3b!2026';

const NAZWISKO = 'Testowy';
const IMIE = 'Jan';

async function otworzZKontem(page) {
  // Bramka regulaminu to modal przechwytujący kliknięcia; akceptacja fikcyjna, na potrzeby testu.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  await page.waitForFunction(() => Boolean(window.VildaAuthUI));
}

const zalozPacjenta = (page) => page.evaluate(async (d) => {
  const wynik = await window.VildaVault.savePatient({
    name: `${d.nazwisko} ${d.imie}`,
    user: {
      lastName: d.nazwisko, firstName: d.imie, sex: 'M',
      age: 5, ageMonths: 6, height: 110, weight: 19,
    },
  }, { dedup: false });
  return wynik.patientId;
}, { nazwisko: NAZWISKO, imie: IMIE });

const notatki = (page, patientId) => page.evaluate(
  (id) => window.VildaVault.listPatientNotesForPatient(id),
  patientId,
);

const arkusz = (page) => page.locator('.vilda-patient-note-editor-overlay .vilda-pne');
const tresc = (page) => page.locator('.vilda-patient-note-editor-overlay textarea').first();

async function otworzNowa(page, patientId) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientNoteEditor({ patientId: id }), patientId);
  await expect(arkusz(page)).toBeVisible();
}

// Notatka w sejfie + arkusz otwarty na niej. Zwraca `{ noteId, rev }` z chwili otwarcia.
async function otworzIstniejaca(page, patientId) {
  await page.evaluate(async (id) => {
    await window.VildaVault.savePatientNote({
      patientId: id, title: 'Notatka kontrolna', body: 'Treść pierwotna.', category: 'observation',
    });
  }, patientId);
  const lista = await notatki(page, patientId);
  expect(lista.length, 'notatka założona').toBe(1);
  expect(typeof lista[0].rev, 'sejf podaje wersję notatki').toBe('number');

  await page.evaluate((d) => window.VildaAuthUI.showPatientNoteEditor({
    patientId: d.patientId, note: d.note,
  }), { patientId, note: lista[0] });
  await expect(page.getByRole('button', { name: 'Zapisz zmiany' })).toBeVisible();
  return { noteId: lista[0].id, rev: lista[0].rev };
}

// Zapis „z innego urządzenia" — bez `baseRev`, więc przechodzi i podnosi wersję notatki.
const inneUrzadzenie = (page, patientId, noteId, body) => page.evaluate((d) => window.VildaVault
  .savePatientNote({
    id: d.noteId, patientId: d.patientId, title: 'Notatka kontrolna', body: d.body,
    category: 'observation',
  }), { patientId, noteId, body });

test.describe('G14b — równoległa edycja tej samej notatki', () => {
  test('zapis zatrzymuje się i pokazuje wybór, a sejf zostaje nietknięty', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjenta(page);
    const { noteId } = await otworzIstniejaca(page, patientId);

    await tresc(page).fill('Moja wersja z tego urządzenia.');
    await inneUrzadzenie(page, patientId, noteId, 'Wersja z innego urządzenia.');

    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();

    await expect(page.getByText('Nowsza wersja tej notatki jest już w sejfie.'),
      'lekarz musi zobaczyć, że ktoś zapisał w międzyczasie').toBeVisible();
    await expect(page.getByRole('button', { name: 'Wczytaj nowszą (porzuci Twój tekst)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nadpisz moją wersją' })).toBeVisible();
    await expect(arkusz(page), 'arkusz zostaje otwarty z moim tekstem').toBeVisible();

    const wSejfie = await notatki(page, patientId);
    expect(wSejfie.length).toBe(1);
    expect(wSejfie[0].body, 'zapis nie przeszedł — cudza wersja nietknięta')
      .toBe('Wersja z innego urządzenia.');
  });

  test('„Nadpisz moją wersją" zapisuje mój tekst', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjenta(page);
    const { noteId } = await otworzIstniejaca(page, patientId);

    await tresc(page).fill('Moja wersja z tego urządzenia.');
    await inneUrzadzenie(page, patientId, noteId, 'Wersja z innego urządzenia.');
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
    await page.getByRole('button', { name: 'Nadpisz moją wersją' }).click();

    await expect(page.getByRole('button', { name: 'Zapisz zmiany' }),
      'po wyborze arkusz zamyka się jak przy zwykłym zapisie').toHaveCount(0);
    const wSejfie = await notatki(page, patientId);
    expect(wSejfie.length, 'nadal jedna notatka — nie powstał duplikat').toBe(1);
    expect(wSejfie[0].body).toBe('Moja wersja z tego urządzenia.');
  });

  test('„Wczytaj nowszą" otwiera arkusz na cudzej wersji', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjenta(page);
    const { noteId } = await otworzIstniejaca(page, patientId);

    await tresc(page).fill('Moja wersja z tego urządzenia.');
    await inneUrzadzenie(page, patientId, noteId, 'Wersja z innego urządzenia.');
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
    await page.getByRole('button', { name: 'Wczytaj nowszą (porzuci Twój tekst)' }).click();

    await expect(arkusz(page), 'arkusz wraca — na nowszej wersji').toBeVisible();
    await expect(tresc(page)).toHaveValue('Wersja z innego urządzenia.');
    await expect(page.locator('.vilda-patient-note-editor-overlay'),
      'jedna nakładka, nie dwie').toHaveCount(1);
    const wSejfie = await notatki(page, patientId);
    expect(wSejfie[0].body, 'nic nie zapisano po drodze').toBe('Wersja z innego urządzenia.');
  });

  test('zwykła edycja bez kolizji zapisuje się bez pytania', async ({ page }) => {
    // Kontrola negatywna: `baseRev` nie może utrudniać normalnej pracy.
    await otworzZKontem(page);
    const patientId = await zalozPacjenta(page);
    await otworzIstniejaca(page, patientId);

    await tresc(page).fill('Treść poprawiona.');
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();

    await expect(page.getByRole('button', { name: 'Zapisz zmiany' })).toHaveCount(0);
    await expect(page.getByText('Nowsza wersja tej notatki jest już w sejfie.')).toHaveCount(0);
    const wSejfie = await notatki(page, patientId);
    expect(wSejfie.length).toBe(1);
    expect(wSejfie[0].body).toBe('Treść poprawiona.');
  });
});

test.describe('G21 — arkusz pyta, zanim wyrzuci niezapisany tekst', () => {
  test('„Anuluj" pyta, a odmowa zostawia tekst na miejscu', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjenta(page);
    await otworzNowa(page, patientId);

    const pytania = [];
    page.on('dialog', (d) => { pytania.push(d.message()); d.dismiss(); });

    await tresc(page).fill('Wywiad: kaszel od tygodnia.');
    await page.locator('.vilda-patient-note-editor-overlay')
      .getByRole('button', { name: 'Anuluj', exact: true }).click();

    await expect.poll(() => pytania.length, { timeout: 5000 }).toBe(1);
    expect(pytania[0]).toContain('niezapisan');
    await expect(arkusz(page), 'odmowa = zostajemy w arkuszu').toBeVisible();
    await expect(tresc(page), 'tekst nietknięty').toHaveValue('Wywiad: kaszel od tygodnia.');
  });

  test('Escape pyta tak samo, a zgoda zamyka arkusz', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjenta(page);
    await otworzNowa(page, patientId);

    const pytania = [];
    page.on('dialog', (d) => { pytania.push(d.message()); d.accept(); });

    await tresc(page).fill('Wywiad: kaszel od tygodnia.');
    await page.keyboard.press('Escape');

    await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
    expect(pytania.length, 'Escape też pyta').toBe(1);
    expect((await notatki(page, patientId)).length, 'nic nie zapisano').toBe(0);
  });

  test('pusty arkusz zamyka się bez pytania', async ({ page }) => {
    // Kontrola negatywna: pytanie tylko wtedy, gdy jest o co pytać.
    await otworzZKontem(page);
    const patientId = await zalozPacjenta(page);
    await otworzNowa(page, patientId);

    const pytania = [];
    page.on('dialog', (d) => { pytania.push(d.message()); d.accept(); });

    await page.keyboard.press('Escape');
    await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
    expect(pytania, 'bez zmian nie ma o co pytać').toEqual([]);
  });

  test('kolejne wywołanie edytora pyta o porzucaną nakładkę', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjenta(page);
    await otworzNowa(page, patientId);

    const pytania = [];
    page.on('dialog', (d) => { pytania.push(d.message()); d.accept(); });

    await tresc(page).fill('Wywiad: kaszel od tygodnia.');
    await page.evaluate((id) => window.VildaAuthUI.showPatientNoteEditor({ patientId: id }), patientId);

    await expect.poll(() => pytania.length, { timeout: 5000 }).toBe(1);
    await expect(page.locator('.vilda-patient-note-editor-overlay'),
      'stara nakładka ustępuje nowej, nie zostaje obok').toHaveCount(1);
    await expect(tresc(page), 'nowy arkusz jest pusty').toHaveValue('');
  });
});

test('G18 — nagłówek arkusza mówi, czyja to notatka', async ({ page }) => {
  await otworzZKontem(page);
  const patientId = await zalozPacjenta(page);
  await otworzNowa(page, patientId);

  const naglowek = page.locator('#vilda-pne-title');
  await expect(naglowek).toBeVisible();
  await expect(naglowek, 'nazwisko dociągane po otwarciu, z nagłówków sejfu')
    .toContainText(NAZWISKO, { timeout: 10000 });
  await expect(naglowek).toContainText('Nowa notatka');
});
