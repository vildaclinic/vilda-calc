import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';

// P-WIEK-NOWY-POMIAR (decyzja właściciela 2026-11-15). Po „Nowy pomiar” wiek pacjenta nie trafiał do sesji wspólnej,
// z której Jednostki lab. czytają pacjenta: przy przejściu w ciągu ok. 3 s, a w powłoce przy drugim i kolejnym
// pacjencie w tej samej karcie przeglądarki — wcale. Przelicznik bez wieku przyjmuje etap życia „dorosły”, więc
// wczytane dziecko dostawało zakresy dla dorosłych (TSH 0,4 mIU/L u 12-latki: „w zakresie normy” zamiast „poniżej”).
// Naprawa: „Nowy pomiar” zapisuje pola nowej wizyty do sesji od razu, a przelicznik ma zabezpieczenie — wiek bieżącej
// wizyty albo z daty urodzenia — i mówi „brak wieku”, gdy nie ma żadnego źródła.
// Wyłącznie fikcyjny sejf; natywny zegar (prawdziwa pauza autozapisu i zapis sesji).
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

// Wiek: brak klucza to błąd (null nie równa się wartości z formularza). Masa i wzrost: w korzeniu sesji „” i brak
// klucza znaczą to samo — czytelnicy (userData.js, przelicznik) traktują je jednakowo — a który z nich zostaje,
// zależy od chwili: zapis z kolejki autozapisu (vilda_persist_runtime.js, P-PERSIST-CURRENT-AGE) pustych wartości
// nie przenosi. Ustalone na wolniejszej maszynie CI (2026-11-15), gdzie kolejka zapisywała po wyborze wizyty.
// Wartość poprzedniej wizyty albo poprzedniego pacjenta w tych polach nadal nie przechodzi.
const sesjaWspolna = (owner) => owner.evaluate(() => {
  const s = window.VildaPersistence.readShared();
  return { age: s.age ?? null, ageMonths: s.ageMonths ?? null, weight: s.weight ?? '', height: s.height ?? '' };
});
const pola = (owner) => owner.evaluate(() => Object.fromEntries(['age', 'ageMonths', 'weight', 'height'].map((id) => [id, document.getElementById(id).value])));

async function przelicznik(page, shell) {
  if (shell) await page.evaluate(() => window.VildaShell.navigate('lab'));
  else await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  const lab = shell ? await shellFrame(page, 'Jednostki laboratoryjne') : page;
  await lab.waitForLoadState('load');
  await expect.poll(() => lab.evaluate(() => window.VildaSession?.getPatient?.()?.name ?? null).catch(() => null)).toBe('Fikcyjny Beata');
  return lab;
}

// TSH 0,4 mIU/L: u 12-latki poniżej zakresu dla wieku (0,5–4,3), u dorosłej w zakresie (0,3–4,2).
async function tsh(lab, wartosc = '0,4') {
  await lab.locator('#labSubstance').fill('TSH');
  await lab.locator('#labSubstanceDropdown .lab-substance-option[data-id="tsh"]').click();
  await lab.locator('#labUnit').selectOption('mIU/L');
  await lab.locator('#labValue').fill(wartosc);
}

for (const shell of [true, false]) {
  for (const drugi of [false, true]) {
    test(`${shell ? 'powłoka' : 'samodzielnie'}, ${drugi ? 'drugi' : 'pierwszy'} pacjent: po „Nowy pomiar” sesja ma wiek od razu, a przelicznik otwarty natychmiast ocenia jak dla dziecka`, async ({ page }) => {
      const fixture = await createFictionalVault(page, { shell });
      const start = fixture.frame;
      if (drugi) await loadPatient(start, fixture.ids.a, 'restore');
      await loadPatient(start, fixture.ids.b, 'new');

      // Zaraz po wyborze — bez czekania na lustro pól — sesja wspólna niesie pola nowej wizyty z formularza.
      const formularz = await pola(start);
      expect(formularz).toMatchObject({ age: '12', weight: '', height: '' });
      expect(await sesjaWspolna(start)).toEqual(formularz);
      // Zapis z kolejki autozapisu po wyborze (na wolnej maszynie trafia tuż po nim) nie usuwa wieku z sesji
      // i nie dopisuje masy ani wzrostu poprzedniej wizyty.
      await start.evaluate(() => window.vildaPersistFlushNow({ force: true }));
      expect(await sesjaWspolna(start)).toEqual(formularz);

      const lab = await przelicznik(page, shell);
      expect(await lab.evaluate(() => window.VildaSession.getPatient())).toMatchObject({ name: 'Fikcyjny Beata', sex: 'F', age: 12, ageMonths: Number(formularz.ageMonths) });
      await expect(lab.locator('#labPatientText')).toContainText(/Kobieta · 12(\.\d)? lat · wiek dziecięcy\/młodzieńczy/);
      await tsh(lab);
      await expect(lab.locator('#labResultStatus')).toHaveText('↓ poniżej normy');
      await expect(lab.locator('#labClinicalHint')).not.toContainText('Brak wieku pacjenta');
      if (shell) {
        // Zapis do sesji nie oznacza pacjenta jako zmienionego.
        await expect.poll(() => start.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision())).toMatchObject({ ready: true, state: 'saved' });
      }
    });
  }
}

for (const shell of [true, false]) {
  test(`${shell ? 'powłoka' : 'samodzielnie'}: sesja wspólna bez wieku — przelicznik bierze wiek bieżącej wizyty i ocenia jak dla dziecka`, async ({ page }) => {
    const fixture = await createFictionalVault(page, { shell });
    const start = fixture.frame;
    await loadPatient(start, fixture.ids.b, 'restore');
    // Stan, który zostawiał błąd: pacjentka wczytana, a sesja wspólna bez wieku.
    await start.evaluate(() => window.VildaPersistence.updateShared((s, p) => {
      delete s.age; delete s.ageMonths;
      if (p && p.byId) { delete p.byId.age; delete p.byId.ageMonths; }
    }, { force: true }));
    const lab = await przelicznik(page, shell);
    expect(await lab.evaluate(() => window.VildaSession.getPatient())).toMatchObject({ name: 'Fikcyjny Beata', age: null });
    // Powłoka: wiek z żywego formularza Start; strona samodzielna: z sesji formularza tej pacjentki.
    await expect(lab.locator('#labPatientText')).toHaveText('Kobieta · 12 lat · wiek dziecięcy/młodzieńczy');
    await tsh(lab);
    await expect(lab.locator('#labResultStatus')).toHaveText('↓ poniżej normy');
    await expect(lab.locator('#labClinicalHint')).not.toContainText('Brak wieku pacjenta');
  });
}

test('samodzielnie: wczytany pacjent bez wieku i bez daty urodzenia w żadnym źródle — „brak wieku” i wyjaśnienie, także w pakiecie; bez pacjenta jak dotąd', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: false });
  // Bez wczytanego pacjenta przelicznik zostaje przy dotychczasowym opisie (domyślna płeć formularza, bez wieku)
  // — nie ma czyjego wieku brakować, więc nie ma też komunikatu.
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  expect(await page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBeNull();
  await tsh(page);
  await expect(page.locator('#labPatientText')).toHaveText('Mężczyzna');
  await expect(page.locator('#labClinicalHint')).not.toContainText('Brak wieku pacjenta');

  await page.goto('/index.html', { waitUntil: 'load' });
  await loadPatient(page, fixture.ids.b, 'restore');
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => window.VildaSession?.getPatient?.()?.name ?? null).catch(() => null)).toBe('Fikcyjny Beata');
  await page.evaluate(() => {
    window.VildaPersistence.updateShared((s, p) => {
      delete s.age; delete s.ageMonths; delete s.dobISO;
      if (p && p.byId) { delete p.byId.age; delete p.byId.ageMonths; }
    }, { force: true });
    const main = window.VildaPersistence.readMainSession();
    delete main.user.age; delete main.user.ageMonths; delete main.user.dobISO;
    window.VildaPersistence.writeMainSession(main);
  });
  await page.reload({ waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => window.VildaSession?.getPatient?.()?.name ?? null).catch(() => null)).toBe('Fikcyjny Beata');
  await tsh(page);
  await expect(page.locator('#labPatientText')).toHaveText('Kobieta · brak wieku');
  await expect(page.locator('#labClinicalHint')).toBeVisible();
  await expect(page.locator('#labClinicalHint')).toContainText('Brak wieku pacjenta — zakres nie jest dobrany do wieku. Uzupełnij wiek albo datę urodzenia na stronie głównej albo wpisz wiek w „Zmień ▼".');
  // Zakres dobrany bez wieku (etap życia „dorosły”) — dlatego komunikat jest konieczny.
  await expect(page.locator('#labResultStatus')).toHaveText('✓ w zakresie normy');

  // Wiek wpisany tutaj („Zmień ▼”) usuwa komunikat i dobiera zakres dla wieku.
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideAge').fill('12');
  await page.locator('#labOverrideAge').blur();
  await expect(page.locator('#labPatientText')).toContainText('12 lat');
  await expect(page.locator('#labPatientText')).not.toContainText('brak wieku');
  await expect(page.locator('#labClinicalHint')).not.toContainText('Brak wieku pacjenta');
  await expect(page.locator('#labResultStatus')).toHaveText('↓ poniżej normy');

  // Pakiet: ten sam opis pacjenta.
  await page.reload({ waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => window.VildaSession?.getPatient?.()?.name ?? null).catch(() => null)).toBe('Fikcyjny Beata');
  await page.locator('#labModePackage').click();
  await expect(page.locator('#labPackageCard')).toContainText('brak wieku');
});
