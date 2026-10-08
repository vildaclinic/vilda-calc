import { expect, test } from '@playwright/test';

// P-KOPIA-POMIJA (decyzja właściciela 2026-10-08, przegląd „co dalej po #518”, punkt A5d) — „Scal kopię konta” na
// prawdziwej przeglądarce, drogą lekarza: Importuj pacjentów → plik kopii → „Scal z moim kontem →” → podgląd → „Scal
// teraz”.
//
// Po zrobieniu kopii lekarz usuwa pacjentkę „Fikcyjna Ewa” i scala kartę „Testowy Jan” z drugą kartą „Testowy Jan”.
// Przed zmianą (audyt 8c13b80) podgląd obiecywał dwóch nowych pacjentów, a scalenie zgłaszało ich dodanie: usunięta
// znikała od razu, a karta docelowa scalenia traciła wersje. Po zmianie podgląd i wynik wymieniają obu jako pominiętych
// (z kartą docelową scalenia), a w magazynie zmienia się tylko to, czego naprawdę brakowało (wersja z kosza karty Adama).
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#KopiaPomija!26aa';

async function regulamin(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('vildaRetention', '0');
    } catch (_) { /* brak storage — pomiń */ }
  });
}

async function konto(page) {
  await regulamin(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaAuthUI)
    && typeof window.VildaAuthUI.showImportPatientsFlow === 'function');
  await page.waitForTimeout(1200); // kaskady odtwarzania po starcie strony
}

/* Stan magazynu: karta → liczba wersji (posortowane po nazwie karty). */
const stan = (page) => page.evaluate(async () => {
  const V = window.VildaVault;
  const wynik = [];
  for (const k of await V.listPatients()) {
    const r = await V.getPatient(k.patientId);
    wynik.push(`${r.header.name}:${r.snapshots.length}`);
  }
  return wynik.sort();
});

test.describe('P-KOPIA-POMIJA — „Scal kopię konta” pomija usuniętych i scalonych tutaj', () => {
  test('podgląd i wynik wymieniają pominiętych z kartą docelową; dochodzi tylko brakująca wersja', async ({ page }) => {
    test.setTimeout(120_000);
    await konto(page);
    const kopia = await page.evaluate(async () => {
      const V = window.VildaVault;
      const r = (nazwisko, imie, wieki) => ({
        name: `${nazwisko} ${imie}`,
        user: { lastName: nazwisko, firstName: imie, sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
        growthBasic: { data: { measurements: wieki.map((m) => ({ ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 })) } },
      });
      const zapisz = async (p, id) => (await V.savePatient(p, id ? { patientId: id, dedup: false } : { dedup: false })).patientId;
      const adam = await zapisz(r('Testowy', 'Adam', [60]));
      await zapisz(r('Testowy', 'Adam', [60, 66]), adam);
      const ewa = await zapisz(r('Fikcyjna', 'Ewa', [60]));
      const y = await zapisz(r('Testowy', 'Jan', [48]));
      const x = await zapisz(r('Testowy', 'Jan', [60]));
      const plik = await V.exportVaultBackup();
      const wersje = (await V.getPatient(adam)).snapshots;
      await V.moveSnapshotToTrash(adam, wersje[wersje.length - 1].snapshotId);
      await V.removePatient(ewa);
      await V.mergePatients(x, y);
      return typeof plik === 'string' ? plik : JSON.stringify(plik);
    });
    const przed = await stan(page);
    expect(przed, 'Adam 1 wersja (druga w koszu), Jan: 2 wersje + wersja scalenia').toEqual(['Testowy Adam:1', 'Testowy Jan:3']);

    await page.evaluate(() => window.VildaAuthUI.showImportPatientsFlow());
    await page.locator('.vilda-auth-screen input[type=file]').setInputFiles({
      name: 'kopia-konta-e2e.wiw', mimeType: 'application/octet-stream', buffer: Buffer.from(kopia, 'utf8'),
    });
    await page.getByRole('button', { name: 'Scal z moim kontem →' }).click();
    await expect(page.getByText('Nie przywraca pacjentów scalonych tutaj z inną kartą ani usuniętych tutaj po ich ostatnim zapisie w kopii.')).toBeVisible();
    await page.getByPlaceholder('Hasło do tej kopii konta').fill(HASLO);
    await page.getByRole('button', { name: 'Sprawdź co zostanie scalone' }).click();

    const ekran = page.locator('.vilda-auth-merge');
    await expect(ekran.getByText('Pominięci — nie zostaną dodani (2)')).toBeVisible();
    await expect(ekran.getByText('scalony tutaj z kartą „Testowy Jan”')).toBeVisible();
    await expect(ekran.getByText(/^usunięty na tym urządzeniu/)).toBeVisible();
    await expect(ekran.getByText('Tylko w pliku kopii: 1 zapis.')).toBeVisible();
    await expect(ekran.getByText('Kopia konta nie przywraca pacjentów scalonych tutaj z inną kartą ani usuniętych tutaj po ich ostatnim zapisie w kopii.')).toBeVisible();
    await expect(ekran.getByText('Nowi pacjenci do dodania')).toHaveCount(0);
    await expect(ekran.getByText('1 nowych zapisów zostanie dodanych · pominięci: 2')).toBeVisible();
    const scal = page.getByRole('button', { name: /^Scal teraz/ });
    await expect(scal).toHaveText('Scal teraz (1 nowych zapisów)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'bez poziomego przewijania').toBe(true);

    await scal.click();
    await expect(ekran.getByText('✓ Łącznie dodano 1 zapisów')).toBeVisible();
    await expect(ekran.getByText('⊘ Pominięto „Testowy Jan” — scalony tutaj z kartą „Testowy Jan”')).toBeVisible();
    await expect(ekran.getByText(/^⊘ Pominięto „Fikcyjna Ewa” — usunięty na tym urządzeniu/)).toBeVisible();
    await expect(ekran.getByText(/^➕ Dodano/)).toHaveCount(0);
    expect(await stan(page), 'usunięta nie wraca, karta Jana zachowuje wersje, Adam odzyskuje wersję').toEqual(['Testowy Adam:2', 'Testowy Jan:3']);
  });
});
