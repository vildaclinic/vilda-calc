import { expect, test } from '../support/test-czas.mjs';
import { BEZ, O1, aktywna, bezPrzewijaniaWBok, karta, otworz, paski, tresc, zakladki, zapisz } from '../support/karta-leczenie.mjs';

// P-ROZPOZNANIA, rata 1 (decyzja właściciela 2026-11-24): sekcja „Rozpoznania pacjenta” w zakładce „Leczenie” Karty
// pacjenta na PRAWDZIWEJ stronie. Rozpoznanie jest tym samym zapisem, którego używa nowa Karta pacjenta (strona główna):
// notatką pacjenta kategorii „treatment” z zaszyfrowanym treatmentContext (docs/PATIENT_TREATMENT.md). Sekcja niczego
// nie wylicza — pokazuje i zapisuje to, co wpisał lekarz. Dane wyłącznie FIKCYJNE; sejf zakładany w teście.
test.use({ serviceWorkers: 'block', chwila: '2026-11-24T11:00:00Z' });

const KATALOG = /\/vilda_icd10_(pl_data|search|picker)\.js/;
const sekcja = (page) => tresc(page, 'leczenie').locator('.vilda-kr');
const wiersze = (page) => sekcja(page).locator('.vilda-kr-wiersz');
const arkusz = (page) => page.locator('.vilda-kr-arkusz');
const szukaj = (page) => arkusz(page).locator('.vpt-icd10-query');
const podpowiedzi = (page) => arkusz(page).locator('.vpt-icd10-option');
const zakladka = (page, id) => page.locator(`.vilda-patient-tabs > .vilda-patient-tab[data-tab="${id}"]`);
const zapisy = (page, pid) => page.evaluate(async (id) => (await window.VildaVault.listPatientNotesForPatient(id))
  .filter((n) => Object.prototype.hasOwnProperty.call(n, 'treatmentContext'))
  .map((n) => ({ id: n.id, patientId: n.patientId, category: n.category, title: n.title, body: n.body, rev: n.rev,
    clinicalDateISO: n.clinicalDateISO, kontekst: n.treatmentContext }))
  .sort((a, b) => (a.kontekst.dateISO < b.kontekst.dateISO ? 1 : -1)), pid);
async function leczenie(page, pid, rekord = BEZ) {
  await otworz(page);
  const id = pid || await zapisz(page, rekord);
  await karta(page, id);
  await zakladka(page, 'leczenie').click();
  await expect(sekcja(page)).toBeVisible();
  return id;
}
async function nowe(page) {
  await sekcja(page).getByRole('button', { name: 'Dodaj rozpoznanie' }).click();
  await expect(arkusz(page)).toBeVisible();
  await expect(szukaj(page)).toBeVisible({ timeout: 15000 });
  await expect(arkusz(page).getByRole('button', { name: 'Zapisz' })).toBeEnabled();
}
const zapiszFormularz = async (page) => {
  await arkusz(page).getByRole('button', { name: 'Zapisz' }).click();
  await expect(arkusz(page)).toHaveCount(0);
};

test.describe('Karta pacjenta — „Rozpoznania pacjenta” w zakładce „Leczenie” (komputer)', () => {
  test('KR-1 pacjent bez leczenia: zakładka „Leczenie” z pustą sekcją; kod z katalogu uzupełnia nazwę; zapis jest wspólnym dokumentem leczenia', async ({ page }) => {
    test.setTimeout(150_000);
    const katalog = [];
    page.on('request', (r) => { if (KATALOG.test(r.url())) katalog.push(new URL(r.url()).pathname + new URL(r.url()).search); });
    const pid = await leczenie(page);

    // Zakładka jest teraz u każdego pacjenta (druga, po „Status”); bez leczenia GH i otyłości — bez paska nad zakładkami.
    await expect(zakladki(page)).toHaveText(['Status', 'Leczenie', 'Siatki centylowe', 'Notatki', 'Historia', 'Badania', 'Plany opieki']);
    await expect(aktywna(page)).toHaveText('Leczenie');
    await expect(paski(page)).toHaveCount(0);
    await expect(sekcja(page).locator('h4')).toHaveText('Rozpoznania pacjenta');
    await expect(sekcja(page).locator('.vilda-kr-naglowek .vilda-kr-opis')).toHaveText('Kod ICD-10 jest opcjonalny.');
    await expect(sekcja(page).locator('.vilda-kr-pusto')).toHaveText('Rozpoznania nie uzupełniono.');
    await expect(wiersze(page)).toHaveCount(0);
    expect(katalog, 'katalog ICD-10 (845 kB) nie jest pobierany przed otwarciem formularza').toEqual([]);
    expect(await zapisy(page, pid)).toEqual([]);

    await nowe(page);
    expect(katalog).toEqual(['/vilda_icd10_pl_data.js?v=1', '/vilda_icd10_search.js?v=1', '/vilda_icd10_picker.js?v=1']);
    await expect(arkusz(page).locator('.vilda-auth-sheet-title')).toHaveText('Dodaj rozpoznanie');
    await expect(arkusz(page).locator('.vilda-kr-pacjent')).toHaveText('Fikcyjny Bez Leczenia');
    await expect(arkusz(page).locator('input[name="dateISO"]')).toHaveValue('2026-11-24');
    await expect(arkusz(page).locator('select[name="status"]')).toHaveValue('active');
    await expect(arkusz(page).locator('.vpt-icd10-source')).toHaveText('Polski katalog ICD-10 · Centrum e-Zdrowia · 31.03.2021');

    // „e660” bez kropki odnajduje E66.0; nazwa z katalogu trafia do pustego pola nazwy.
    await szukaj(page).fill('e660');
    await expect(podpowiedzi(page).first()).toContainText('E66.0 — Otyłość spowodowana nadmierną podażą energii');
    await podpowiedzi(page).first().click();
    await expect(arkusz(page).locator('input[name="name"]')).toHaveValue('Otyłość spowodowana nadmierną podażą energii');
    await expect(arkusz(page).locator('input[name="code"]')).toHaveValue('E66.0');
    await expect(arkusz(page).locator('.vpt-icd10-parent').last()).toHaveText('Kategoria: E66 — Otyłość');
    await zapiszFormularz(page);

    await expect(wiersze(page)).toHaveCount(1);
    await expect(wiersze(page).locator('strong')).toHaveText('E66.0 — Otyłość spowodowana nadmierną podażą energii');
    await expect(wiersze(page).locator('.vilda-kr-opis')).toHaveText('Aktywne rozpoznanie · 24.11.2026');
    await expect(sekcja(page).locator('.vilda-kr-komunikat')).toHaveText('Zapisano rozpoznanie.');
    await expect(wiersze(page).getByRole('button', { name: 'Edytuj rozpoznanie: E66.0 — Otyłość spowodowana nadmierną podażą energii' })).toBeFocused();

    // Zapis w sejfie: dokładnie ten kształt, który czyta i pisze nowa Karta pacjenta (runtime/patient-treatment-v1/model.js).
    const [zapis] = await zapisy(page, pid);
    expect(zapis).toEqual({
      id: expect.stringMatching(/^tmt-[0-9a-f-]{36}$/), patientId: pid, category: 'treatment', rev: expect.any(Number),
      title: 'Rozpoznanie · Otyłość spowodowana nadmierną podażą energii',
      body: 'ICD-10: E66.0\nStan rozpoznania: aktywne\nData rozpoznania: 2026-11-24', clinicalDateISO: '2026-11-24',
      kontekst: { schemaVersion: 1, kind: 'diagnosis', name: 'Otyłość spowodowana nadmierną podażą energii', code: 'E66.0',
        codingSystem: 'ICD-10', status: 'active', dateISO: '2026-11-24' },
    });
    // Odczyt, z którego skorzystają statystyki Bazy: jeden przebieg po notatkach kategorii „treatment”.
    expect(await page.evaluate(async () => (await window.VildaVault.listPatientNotesByCategory('treatment'))
      .map((n) => n.treatmentContext && n.treatmentContext.code))).toEqual(['E66.0']);

    // Po ponownym otwarciu Karty rozpoznanie jest od razu na liście (z notatek, które Karta i tak czyta).
    await karta(page, pid, { activeTab: 'leczenie' });
    await expect(aktywna(page)).toHaveText('Leczenie');
    await expect(wiersze(page).locator('strong')).toHaveText('E66.0 — Otyłość spowodowana nadmierną podażą energii');
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
  });

  test('KR-2 edycja (zamknięcie, data), rozpoznanie bez kodu, kod ręczny, nierozstrzygnięte wyszukiwanie i niezapisane zmiany', async ({ page }) => {
    test.setTimeout(150_000);
    const pid = await leczenie(page);

    // Rozpoznanie bez kodu — sama nazwa wpisana przez lekarza.
    await nowe(page);
    await arkusz(page).locator('input[name="name"]').fill('Fikcyjne rozpoznanie bez kodu');
    await arkusz(page).locator('input[name="dateISO"]').fill('2025-03-10');
    await zapiszFormularz(page);
    await expect(wiersze(page).locator('strong')).toHaveText('Fikcyjne rozpoznanie bez kodu');

    // Wyszukiwanie bez wyboru nie jest kodem: „Zapisz” nie zapisuje, dopóki pole nie jest rozstrzygnięte albo puste.
    await nowe(page);
    await arkusz(page).locator('input[name="name"]').fill('Fikcyjny niedobór wzrostu');
    await szukaj(page).fill('E34');
    await arkusz(page).getByRole('button', { name: 'Zapisz' }).click();
    await expect(arkusz(page)).toBeVisible();
    expect(await szukaj(page).evaluate((x) => x.validationMessage)).toContain('Wybierz kod z katalogu albo zatwierdź wpis jako kod ręczny');
    expect((await zapisy(page, pid)).length).toBe(1);
    // Kod spoza podpowiedzi — jawne zatwierdzenie wpisu jako kodu ręcznego; nazwa lekarza zostaje.
    await szukaj(page).fill('E34.3X');
    await arkusz(page).locator('.vpt-icd10-option[data-icd10-manual="true"]').click();
    await expect(arkusz(page).locator('.vpt-icd10-official')).toHaveText('Kod ręczny: E34.3X');
    await expect(arkusz(page).locator('input[name="name"]')).toHaveValue('Fikcyjny niedobór wzrostu');
    await zapiszFormularz(page);
    await expect(wiersze(page).locator('strong')).toHaveText(['E34.3X — Fikcyjny niedobór wzrostu', 'Fikcyjne rozpoznanie bez kodu']);

    // Edycja: zamknięcie rozpoznania i zmiana daty — ten sam zapis, kolejna rewizja; lista od najnowszej daty.
    const przed = await zapisy(page, pid);
    await wiersze(page).nth(0).getByRole('button', { name: /^Edytuj rozpoznanie/ }).click();
    await expect(arkusz(page).locator('.vilda-auth-sheet-title')).toHaveText('Edytuj rozpoznanie');
    await expect(szukaj(page)).toHaveValue('E34.3X');
    await expect(arkusz(page).getByRole('button', { name: 'Zapisz' })).toBeEnabled();
    await arkusz(page).locator('select[name="status"]').selectOption('closed');
    await arkusz(page).locator('input[name="dateISO"]').fill('2024-01-15');
    await zapiszFormularz(page);
    await expect(wiersze(page).locator('strong')).toHaveText(['Fikcyjne rozpoznanie bez kodu', 'E34.3X — Fikcyjny niedobór wzrostu']);
    await expect(wiersze(page).nth(1).locator('.vilda-kr-opis')).toHaveText('Rozpoznanie zamknięte · 15.01.2024');
    await expect(wiersze(page).nth(1)).toHaveClass(/vilda-kr-wiersz--zamkniete/);
    const po = await zapisy(page, pid);
    const zmieniony = po.find((z) => z.kontekst.code === 'E34.3X'), dawny = przed.find((z) => z.kontekst.code === 'E34.3X');
    expect(zmieniony.id).toBe(dawny.id);
    expect(zmieniony.rev).toBe(dawny.rev + 1);
    expect(zmieniony.kontekst).toEqual({ schemaVersion: 1, kind: 'diagnosis', name: 'Fikcyjny niedobór wzrostu', code: 'E34.3X',
      codingSystem: 'ICD-10', status: 'closed', dateISO: '2024-01-15' });
    expect(zmieniony.title).toBe('Rozpoznanie · Fikcyjny niedobór wzrostu');
    expect(zmieniony.body).toBe('ICD-10: E34.3X\nStan rozpoznania: zamknięte\nData rozpoznania: 2024-01-15');
    expect(po.find((z) => !z.kontekst.code)).toEqual(przed.find((z) => !z.kontekst.code));

    // Niezapisane zmiany: „Anuluj” pyta; odmowa zostawia formularz z treścią, zgoda zamyka bez zapisu.
    await wiersze(page).nth(0).getByRole('button', { name: /^Edytuj rozpoznanie/ }).click();
    await arkusz(page).locator('input[name="name"]').fill('Fikcyjna zmiana do odrzucenia');
    const pytania = [];
    page.once('dialog', (d) => { pytania.push(d.message()); d.dismiss(); });
    await arkusz(page).getByRole('button', { name: 'Anuluj' }).click();
    await expect(arkusz(page).locator('input[name="name"]')).toHaveValue('Fikcyjna zmiana do odrzucenia');
    page.once('dialog', (d) => { pytania.push(d.message()); d.accept(); });
    await page.keyboard.press('Escape');
    await expect(arkusz(page)).toHaveCount(0);
    expect(pytania).toEqual(['Masz niezapisane zmiany. Odrzucić je i zamknąć formularz?', 'Masz niezapisane zmiany. Odrzucić je i zamknąć formularz?']);
    expect(await zapisy(page, pid)).toEqual(po);
    // Bez zmian formularz zamyka się bez pytania, a fokus wraca na przycisk, który go otworzył.
    await wiersze(page).nth(0).getByRole('button', { name: /^Edytuj rozpoznanie/ }).click();
    await expect(arkusz(page).getByRole('button', { name: 'Zapisz' })).toBeEnabled();
    await arkusz(page).getByRole('button', { name: 'Anuluj' }).click();
    await expect(arkusz(page)).toHaveCount(0);
    await expect(wiersze(page).nth(0).getByRole('button', { name: /^Edytuj rozpoznanie/ })).toBeFocused();
  });

  test('KR-3 historia notatek: rozpoznanie jest wpisem „Leczenie”; „Edytuj” otwiera formularz rozpoznania, „Usuń” usuwa je z sekcji', async ({ page }) => {
    test.setTimeout(150_000);
    const pid = await leczenie(page);
    await nowe(page);
    await szukaj(page).fill('E66.9');
    await podpowiedzi(page).first().click();
    await zapiszFormularz(page);
    await expect(wiersze(page)).toHaveCount(1);

    await zakladka(page, 'notes').click();
    const notatki = tresc(page, 'notes');
    await expect(notatki).toContainText('Rozpoznanie · Otyłość, nieokreślona');
    await expect(notatki).toContainText('ICD-10: E66.9');

    // Zwykły edytor notatki (.vilda-pne) nie otwiera się dla zapisu leczenia — pola rozpoznania zmienia tylko jego formularz.
    await notatki.getByRole('button', { name: 'Edytuj', exact: true }).first().click();
    await expect(arkusz(page)).toBeVisible();
    await expect(page.locator('.vilda-pne')).toHaveCount(0);
    await expect(arkusz(page).locator('.vilda-auth-sheet-title')).toHaveText('Edytuj rozpoznanie');
    await expect(szukaj(page)).toHaveValue('E66.9');
    await expect(arkusz(page).getByRole('button', { name: 'Zapisz' })).toBeEnabled();
    await arkusz(page).locator('select[name="status"]').selectOption('closed');
    await zapiszFormularz(page);
    await expect(notatki).toContainText('Stan rozpoznania: zamknięte');
    expect((await zapisy(page, pid))[0].kontekst.status).toBe('closed');
    // Sekcja w zakładce „Leczenie” widzi zmianę zrobioną w „Notatkach” (zdarzenie sejfu), bez ponownego otwierania Karty.
    await zakladka(page, 'leczenie').click();
    await expect(wiersze(page).locator('.vilda-kr-opis')).toHaveText('Rozpoznanie zamknięte · 24.11.2026');

    // Usunięcie wpisu w „Notatkach” usuwa rozpoznanie.
    await zakladka(page, 'notes').click();
    page.once('dialog', (d) => d.accept());
    await notatki.getByRole('button', { name: 'Usuń', exact: true }).first().click();
    await expect(notatki).not.toContainText('Rozpoznanie · Otyłość, nieokreślona');
    expect(await zapisy(page, pid)).toEqual([]);
    await zakladka(page, 'leczenie').click();
    await expect(sekcja(page).locator('.vilda-kr-pusto')).toHaveText('Rozpoznania nie uzupełniono.');
    await expect(wiersze(page)).toHaveCount(0);
  });

  test('KR-4 pacjent leczony (otyłość): sekcja rozpoznań jest pierwszym blokiem zakładki, karta leczenia i pasek bez zmian', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    const pid = await zapisz(page, O1);
    await karta(page, pid);
    await expect(zakladki(page)).toHaveText(['Status', 'Leczenie', 'Siatki centylowe', 'Notatki', 'Historia', 'Badania', 'Plany opieki']);
    await expect(aktywna(page)).toHaveText('Status');
    await expect(paski(page)).toHaveCount(1);
    await paski(page).first().click();
    await expect(aktywna(page)).toHaveText('Leczenie');
    const bloki = await tresc(page, 'leczenie').evaluate((t) => [...t.children].map((c) => c.className.split(' ')[0]));
    expect(bloki[0]).toBe('vilda-kr');
    expect(bloki.length).toBe(2);
    await expect(tresc(page, 'leczenie').locator('.vilda-gh-summary-badge')).toHaveText('Leczenie otyłości — Wegovy');
    await expect(sekcja(page).locator('.vilda-kr-pusto')).toHaveText('Rozpoznania nie uzupełniono.');

    await nowe(page);
    await szukaj(page).fill('otyłość spowodowana');
    await podpowiedzi(page).first().click();
    await zapiszFormularz(page);
    await expect(wiersze(page).locator('strong')).toHaveText('E66.0 — Otyłość spowodowana nadmierną podażą energii');
    // Zapis rozpoznania nie rusza karty: wersji tyle samo, punkty leczenia bez zmian, karta leczenia dalej na miejscu.
    const stan = await page.evaluate(async (id) => {
      const p = await window.VildaVault.getPatient(id);
      return { wersje: p.snapshots.length, punkty: p.snapshots[0].payload.obesityTherapyPoints.map((x) => x.id) };
    }, pid);
    expect(stan).toEqual({ wersje: 1, punkty: ['o1-start', 'o1-k1'] });
    const poZapisie = await tresc(page, 'leczenie').evaluate((t) => [...t.children].map((c) => c.className.split(' ')[0]));
    expect(poZapisie).toEqual(bloki);
    await expect(paski(page)).toHaveCount(1);
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
  });

  test('KR-5 katalog niedostępny: kod wpisuje się ręcznie; zablokowanie sejfu zamyka formularz', async ({ page }) => {
    test.setTimeout(150_000);
    await page.route(KATALOG, (trasa) => trasa.abort());
    const pid = await leczenie(page);
    await sekcja(page).getByRole('button', { name: 'Dodaj rozpoznanie' }).click();
    await expect(arkusz(page).locator('.vilda-kr-kod .vilda-kr-opis')).toHaveText('Katalog ICD-10 jest teraz niedostępny. Kod możesz wpisać ręcznie albo zostawić pole puste.');
    await expect(arkusz(page).locator('.vpt-icd10-query')).toHaveCount(0);
    await arkusz(page).locator('input[name="name"]').fill('Fikcyjne rozpoznanie bez katalogu');
    await arkusz(page).locator('input[name="code"]').fill('E66.0');
    await zapiszFormularz(page);
    await expect(wiersze(page).locator('strong')).toHaveText('E66.0 — Fikcyjne rozpoznanie bez katalogu');
    expect((await zapisy(page, pid))[0].kontekst).toMatchObject({ name: 'Fikcyjne rozpoznanie bez katalogu', code: 'E66.0', status: 'active' });

    // Formularz z wpisaną treścią nie przeżywa zablokowania sejfu (wspólny komputer) i niczego nie zapisuje.
    await wiersze(page).getByRole('button', { name: /^Edytuj rozpoznanie/ }).click();
    await arkusz(page).locator('input[name="name"]').fill('Fikcyjna treść przed blokadą');
    await page.evaluate(() => window.VildaVault.lock('manual'));
    await expect(arkusz(page)).toHaveCount(0);
    await expect(page.locator('.vilda-kr-nakladka')).toHaveCount(0);
  });
});

test.describe('Karta pacjenta — „Rozpoznania pacjenta” (telefon)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('KR-6 telefon: sekcja i formularz mieszczą się w szerokości ekranu; pola mają co najmniej 44 px i 16 px pisma', async ({ page }) => {
    test.setTimeout(150_000);
    const pid = await leczenie(page);
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
    await nowe(page);
    await szukaj(page).fill('E66');
    await expect(podpowiedzi(page).first()).toBeVisible();
    const miary = await arkusz(page).evaluate((a) => {
      const pola = [...a.querySelectorAll('input:not([type="hidden"]), select')];
      const r = a.getBoundingClientRect();
      return { szerokosc: r.right <= window.innerWidth + 1 && r.left >= -1, wBok: a.scrollWidth - a.clientWidth,
        najnizsze: Math.min(...pola.map((p) => p.getBoundingClientRect().height)),
        pismo: Math.min(...pola.map((p) => parseFloat(getComputedStyle(p).fontSize))),
        podpowiedz: Math.min(...[...a.querySelectorAll('.vpt-icd10-option')].map((p) => p.getBoundingClientRect().height)) };
    });
    expect(miary.szerokosc).toBe(true);
    expect(miary.wBok).toBeLessThanOrEqual(1);
    expect(miary.najnizsze).toBeGreaterThanOrEqual(44);
    expect(miary.pismo, 'pismo < 16 px powiększa widok na iPhonie przy wejściu w pole').toBeGreaterThanOrEqual(16);
    expect(miary.podpowiedz).toBeGreaterThanOrEqual(44);
    await arkusz(page).locator('.vpt-icd10-option[data-icd10-code="E66.1"]').click();
    await zapiszFormularz(page);
    await expect(wiersze(page).locator('strong')).toHaveText('E66.1 — Otyłość polekowa');
    expect((await zapisy(page, pid))[0].kontekst.code).toBe('E66.1');
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
  });
});
