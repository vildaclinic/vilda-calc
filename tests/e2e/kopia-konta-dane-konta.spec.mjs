import { expect, test } from '@playwright/test';

// P-KOPIA-DANE-KONTA (2026-10-14, wada „Scal teraz”) — „Scal kopię konta” na prawdziwej przeglądarce, drogą lekarza:
// Importuj pacjentów → plik kopii → „Scal z moim kontem →” → hasło → „Sprawdź co zostanie scalone” → „Scal teraz”.
// Dwa osobne konteksty przeglądarki = dwa urządzenia (A robi kopię konta, C ją scala).
//
// Przed zmianą (audyt 2df41a8): kopia z samymi notatkami i listami dawała „Brak nowych danych — wszystko już masz”
// bez przycisku „Scal teraz” (notatek nie dało się scalić z ekranu), a X scalony tutaj z Y z poprawką notatki X w kopii
// dawał „Brak danych do dodania · pominięci: 1”, też bez przycisku. Po zmianie podgląd wymienia te dane, przycisk jest
// widoczny, a wynik mówi, co dodano, zaktualizowano i usunięto. Telefon 390 px: bez poziomego przewijania.
//
// Własne, fikcyjne konta sejfu w efemerycznych profilach przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO_A = 'E2e#DaneKontaA!26aa';
const HASLO_C = 'E2e#DaneKontaC!26aa';

function kontekst(rozmiar) {
  const baza = { baseURL: test.info().project.use.baseURL, locale: 'pl-PL', timezoneId: 'Europe/Warsaw', serviceWorkers: 'block' };
  return rozmiar === 'telefon'
    ? { ...baza, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
    : { ...baza, viewport: { width: 1440, height: 1000 } };
}

async function konto(page, haslo) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('vildaRetention', '0');
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), haslo);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && typeof window.VildaAuthUI.showImportPatientsFlow === 'function');
  await page.waitForTimeout(1200); // kaskady odtwarzania po starcie strony
}

const rekord = (nazwisko, imie, wieki) => ({
  name: `${nazwisko} ${imie}`,
  user: { lastName: nazwisko, firstName: imie, sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
  growthBasic: { data: { measurements: wieki.map((m) => ({ ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 })) } },
});

async function podglad(page, kopia) {
  await page.evaluate(() => window.VildaAuthUI.showImportPatientsFlow());
  await page.locator('.vilda-auth-screen input[type=file]').setInputFiles({
    name: 'kopia-konta-e2e.wiw', mimeType: 'application/octet-stream', buffer: Buffer.from(kopia, 'utf8'),
  });
  await page.getByRole('button', { name: 'Scal z moim kontem →' }).click();
  await page.getByPlaceholder('Hasło do tej kopii konta').fill(HASLO_A);
  await page.getByRole('button', { name: 'Sprawdź co zostanie scalone' }).click();
  return page.locator('.vilda-auth-merge');
}

const bezPrzewijania = (page) => page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
}));

// Zrzut do katalogu wyników testu (desktop 1440 i telefon 390 do przeglądu w PR). Ekran scalania leży w nakładce
// z własnym przewijaniem, więc zrzut całej strony nie pokazuje jej dołu — przy `cel` przewijamy do niego i zapisujemy widok.
async function zrzut(page, nazwa, cel) {
  if (cel) await cel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath(`${nazwa}.png`), fullPage: !cel });
}

/* A: karta „Testowy Adam” z notatką N0, lista oczekujących z terminem; C dostaje to synchronizacją. Na A po
   synchronizacji: nowa notatka, nowy szablon w Notatkach, nowa lista pacjentów, nowa lista oczekujących, usunięta
   notatka N0 i usunięta lista oczekujących z terminem. Kopia konta A. */
async function urzadzenia(browser, rozmiar) {
  const ctxA = await browser.newContext(kontekst('desktop'));
  const pageA = await ctxA.newPage();
  await konto(pageA, HASLO_A);
  const a1 = await pageA.evaluate(async (r) => {
    const V = window.VildaVault;
    const adam = (await V.savePatient(r, { dedup: false })).patientId;
    await V.savePatientNote({ patientId: adam, title: 'N0 (fikcja)', body: 'do usunięcia w kopii', category: 'followup' });
    await V.addWaitlistList('Fikcyjny zabieg stary');
    await V.setWaitlistSchedule('Fikcyjny zabieg stary', { dateISO: '2026-12-01', time: '09:00' });
    const l = await V.exportSyncPayload(); l.credential = null;
    return { adam, ladunek: JSON.stringify(l) };
  }, rekord('Testowy', 'Adam', [60]));
  const ctxC = await browser.newContext(kontekst(rozmiar));
  const page = await ctxC.newPage();
  await konto(page, HASLO_C);
  await page.evaluate(async (l) => { await window.VildaVault.mergeSyncPayload(JSON.parse(l)); }, a1.ladunek);
  const kopia = await pageA.evaluate(async ({ adam }) => {
    const V = window.VildaVault;
    await new Promise((r) => { setTimeout(r, 20); });
    await V.savePatientNote({ patientId: adam, title: 'N1 (fikcja)', body: 'wynik fikcyjny', category: 'followup' });
    await V.saveNote({ title: 'Szablon fikcyjny', body: 'opis fikcyjny', category: 'wlasne' });
    await V.savePatientList({ name: 'Lista fikcyjna', memberIds: [adam] });
    await V.addWaitlistList('Fikcyjny zabieg nowy');
    const [n0] = (await V.listPatientNotesForPatient(adam)).filter((n) => n.title === 'N0 (fikcja)');
    await V.removePatientNote(n0.id);
    await V.removeWaitlistList('Fikcyjny zabieg stary');
    const p = await V.exportVaultBackup();
    return typeof p === 'string' ? p : JSON.stringify(p);
  }, { adam: a1.adam });
  await ctxA.close();
  return { ctxC, page, kopia, adam: a1.adam };
}

const stanC = (page, adam) => page.evaluate(async (pid) => {
  const V = window.VildaVault;
  return {
    wersje: (await V.getPatient(pid)).snapshots.length,
    notatki: (await V.listPatientNotesForPatient(pid)).map((n) => n.title).sort(),
    szablony: (await V.listNotes()).map((n) => n.title),
    listy: (await V.listPatientLists()).map((l) => l.name),
    oczekujacy: Object.values(await V.getWaitlistLists()).map((l) => l.label).sort(),
    terminy: Object.values(await V.getWaitlistSchedules()).length,
  };
}, adam);

test.describe('P-KOPIA-DANE-KONTA — „Scal kopię konta” mówi o notatkach i listach z kopii', () => {
  test('desktop: kopia z samymi notatkami i listami → przycisk widoczny, podgląd i wynik wymieniają dodane i usunięte', async ({ browser }) => {
    test.setTimeout(180_000);
    const { ctxC, page, kopia, adam } = await urzadzenia(browser, 'desktop');
    const przed = await stanC(page, adam);
    expect(przed).toEqual({ wersje: 1, notatki: ['N0 (fikcja)'], szablony: [], listy: [], oczekujacy: ['Fikcyjny zabieg stary'], terminy: 1 });

    const ekran = await podglad(page, kopia);
    await expect(ekran.getByText('Aplikacja doda tylko zapisy i pacjentów, których tu brakuje, a notatki i listy scali jak synchronizacja')).toBeVisible();
    await expect(ekran.getByText('Nie przywraca pacjentów scalonych z inną kartą ani usuniętych po ich ostatnim zapisie w kopii.')).toBeVisible();
    await expect(ekran.getByText('Brak nowych zapisów · 1 nowa notatka pacjenta · 1 nowy szablon w Notatkach · 1 nowa lista pacjentów'
      + ' · 1 nowa lista oczekujących · usunięte w kopii: 1 notatka pacjenta, 1 lista oczekujących, 1 termin listy oczekujących'
      + ' (zostaną usunięte także tutaj)')).toBeVisible();
    const scal = page.getByRole('button', { name: /^Scal teraz/ });
    await expect(scal).toHaveText('Scal teraz (2 notatki, 2 listy)');
    expect((await bezPrzewijania(page)).scrollWidth).toBeLessThanOrEqual(1440);
    expect(await stanC(page, adam), 'podgląd niczego nie zmienia').toEqual(przed);
    await zrzut(page, 'podglad-desktop-1440');
    await zrzut(page, 'podglad-desktop-1440-przycisk', scal);

    await scal.click();
    await expect(ekran.getByText('✓ Dodano 1 notatkę pacjenta, 1 szablon w Notatkach, 1 listę pacjentów, 1 listę oczekujących')).toBeVisible();
    await expect(ekran.getByText('⊖ Usunięto tak jak w kopii: 1 notatkę pacjenta, 1 listę oczekujących, 1 termin listy oczekujących')).toBeVisible();
    await expect(ekran.getByText(/^Brak zmian/)).toHaveCount(0);
    await expect(ekran.getByText(/^🔀 Uzupełniono zapisy/), 'żadna karta nie dostała nowych wersji').toHaveCount(0);
    const s = await bezPrzewijania(page);
    expect(s.scrollWidth).toBeLessThanOrEqual(s.innerWidth);
    await zrzut(page, 'wynik-desktop-1440', ekran.getByText(/^⊖ Usunięto/));
    expect(await stanC(page, adam)).toEqual({
      wersje: 1, notatki: ['N1 (fikcja)'], szablony: ['Szablon fikcyjny'], listy: ['Lista fikcyjna'], oczekujacy: ['Fikcyjny zabieg nowy'], terminy: 0,
    });
    await ctxC.close();
  });

  test('telefon 390: ten sam podgląd i wynik bez poziomego przewijania', async ({ browser }) => {
    test.setTimeout(180_000);
    const { ctxC, page, kopia } = await urzadzenia(browser, 'telefon');
    const ekran = await podglad(page, kopia);
    const scal = page.getByRole('button', { name: /^Scal teraz/ });
    await expect(scal).toHaveText('Scal teraz (2 notatki, 2 listy)');
    const p = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.vilda-auth-merge button')).find((x) => /^Scal teraz/.test(x.textContent));
      const r = b.getBoundingClientRect();
      return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, prawa: r.right, lewa: r.left };
    });
    expect(p.scrollWidth, 'bez poziomego przewijania').toBeLessThanOrEqual(p.innerWidth);
    expect(p.lewa).toBeGreaterThanOrEqual(0);
    expect(p.prawa).toBeLessThanOrEqual(p.innerWidth);
    await zrzut(page, 'podglad-telefon-390', scal);
    await scal.click();
    await expect(ekran.getByText('✓ Dodano 1 notatkę pacjenta, 1 szablon w Notatkach, 1 listę pacjentów, 1 listę oczekujących')).toBeVisible();
    const s = await bezPrzewijania(page);
    expect(s.scrollWidth).toBeLessThanOrEqual(s.innerWidth);
    await zrzut(page, 'wynik-telefon-390', ekran.getByText(/^✓ Dodano/));
    await ctxC.close();
  });

  test('K6: X scalony tutaj z Y, poprawka notatki X w kopii → „1 poprawiona notatka pacjenta · pominięci: 1”, po scaleniu notatka pod Y poprawiona', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctxA = await browser.newContext(kontekst('desktop'));
    const pageA = await ctxA.newPage();
    await konto(pageA, HASLO_A);
    const a1 = await pageA.evaluate(async (r) => {
      const V = window.VildaVault;
      const y = (await V.savePatient(r.y1, { dedup: false })).patientId;
      await V.savePatient(r.y2, { patientId: y, dedup: false });
      const x = (await V.savePatient(r.x1, { dedup: false })).patientId;
      await V.savePatient(r.x2, { patientId: x, dedup: false });
      await V.savePatientNote({ patientId: x, title: 'N-X (fikcja)', body: 'wynik pierwotny (fikcja)', category: 'followup' });
      const l = await V.exportSyncPayload(); l.credential = null;
      return { x, y, ladunek: JSON.stringify(l) };
    }, { y1: rekord('Testowy', 'Jan', [60]), y2: rekord('Testowy', 'Jan', [60, 66]), x1: rekord('Testowy', 'Jan', [61]), x2: rekord('Testowy', 'Jan', [61, 67]) });
    const ctxC = await browser.newContext(kontekst('desktop'));
    const page = await ctxC.newPage();
    await konto(page, HASLO_C);
    await page.evaluate(async ({ l, x, y }) => {
      await window.VildaVault.mergeSyncPayload(JSON.parse(l));
      await new Promise((r) => { setTimeout(r, 20); });
      await window.VildaVault.mergePatients(x, y);
    }, { l: a1.ladunek, x: a1.x, y: a1.y });
    const kopia = await pageA.evaluate(async ({ x }) => {
      const V = window.VildaVault;
      await new Promise((r) => { setTimeout(r, 20); });
      const [n] = await V.listPatientNotesForPatient(x);
      await V.savePatientNote({ ...n, body: 'POPRAWIONY wynik (fikcja)' });
      const p = await V.exportVaultBackup();
      return typeof p === 'string' ? p : JSON.stringify(p);
    }, { x: a1.x });
    await ctxA.close();

    const ekran = await podglad(page, kopia);
    await expect(ekran.getByText('Pominięci — nie zostaną dodani (1)')).toBeVisible();
    await expect(ekran.getByText('Brak nowych zapisów · 1 poprawiona notatka pacjenta · pominięci: 1')).toBeVisible();
    const scal = page.getByRole('button', { name: /^Scal teraz/ });
    await expect(scal).toHaveText('Scal teraz (1 notatka)');
    await zrzut(page, 'k6-podglad-desktop-1440', scal);
    await scal.click();
    await expect(ekran.getByText('✓ Zaktualizowano 1 notatkę pacjenta')).toBeVisible();
    await expect(ekran.getByText('⊘ Pominięto „Testowy Jan” — scalony z kartą „Testowy Jan”')).toBeVisible();
    await expect(ekran.getByText(/^Brak zmian/)).toHaveCount(0);
    const notatkiY = await page.evaluate(async (y) => (await window.VildaVault.listPatientNotesForPatient(y)).map((n) => n.body), a1.y);
    expect(notatkiY).toEqual(['POPRAWIONY wynik (fikcja)']);
    await zrzut(page, 'k6-wynik-desktop-1440', ekran.getByText('✓ Zaktualizowano 1 notatkę pacjenta'));
    await ctxC.close();
  });
});
