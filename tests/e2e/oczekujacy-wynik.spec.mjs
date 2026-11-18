import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';

// P-OCZEKUJACE-WYNIKI (decyzje właściciela 2026-11-15). „Oczekujący wynik” to wpis kategorii „Badanie” z Terminarza
// (termin albo „Czekam na wynik”), bez wartości. W zakładce „Badania” ma dwie akcje:
// - „Wpisz wynik →” otwiera Jednostki lab. z tym wpisem: wynik zapisuje się jak każdy przypięty wynik — z oceną —
//   a wpis zostaje oznaczony jako wykonany (znacznik w oknie przypięcia i przy zapisie pakietu), z „Cofnij”;
// - „Opisz wynik” zapisuje wynik opisowy tą samą operacją sejfu co „Dodaj wynik do kartoteki” w Przypomnieniach.
// Ręcznego wpisu wartości bez oceny już nie ma.
// Wyłącznie fikcyjny sejf w efemerycznym profilu Playwrighta; natywny zegar (prawdziwe wczytanie pacjenta).
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

const TERMIN = '2026-12-01';
const sekcjaBadan = (owner) => owner.locator('.vilda-patient-lab-section');

// Wpis taki, jaki zakłada Terminarz: kategoria „Badanie”, termin, bez wartości.
const zalozOczekujacy = (owner, patientId, title, extra = {}) => owner.evaluate(async ({ patientId, title, extra, termin }) => {
  const id = 'fikcyjny-oczekujacy-' + Math.random().toString(36).slice(2, 10);
  await window.VildaVault.savePatientNote({ id, patientId, title, body: '', category: 'wynik-badania', dueDateISO: termin, ...extra });
  return id;
}, { patientId, title, extra, termin: TERMIN });
const wpis = (owner, id) => owner.evaluate((noteId) => window.VildaVault.getPatientNote(noteId), id);
const wynikiPacjenta = (owner, patientId) => owner.evaluate(async (pid) => {
  const notes = await window.VildaVault.listPatientNotesForPatient(pid);
  return notes.filter((n) => n.category === 'wynik-badania' && n.labResult && (n.labResult.value || n.labResult.valueNum != null))
    .map((n) => ({ id: n.id, title: n.title, body: n.body, lab: n.labResult, completedAtISO: n.completedAtISO || null }));
}, patientId);

async function otworzKarte(page, owner, shell, patientId) {
  if (shell) await page.evaluate((pid) => window.VildaShell.openPatientCardInStart(pid, { activeTab: 'lab' }), patientId);
  else {
    await owner.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid, (record) => {
      if (record) window.applyLoadedData(record);
      window.VildaChrome?.refreshPatientChip?.();
    }, null, { activeTab: 'lab' }), patientId);
  }
  await expect(sekcjaBadan(owner).locator('.vilda-lab-hist-heading')).toBeVisible();
}

async function przelicznik(page, shell) {
  await expect(page).toHaveURL(shell ? /\/app\.html#\/lab/ : /\/przelicznik-jednostek\.html/, { timeout: 20_000 });
  const lab = shell ? await shellFrame(page, 'Jednostki laboratoryjne') : page;
  await lab.waitForLoadState('load');
  return lab;
}

async function wpiszBadanie(lab, id, nazwa, jednostka, wartosc) {
  await lab.locator('#labSubstance').fill(nazwa);
  await lab.locator(`#labSubstanceDropdown .lab-substance-option[data-id="${id}"]`).click();
  await lab.locator('#labUnit').selectOption(jednostka);
  await lab.locator('#labValue').fill(wartosc);
}

for (const shell of [true, false]) {
  test(`${shell ? 'powłoka' : 'samodzielnie'}: „Wpisz wynik →” → Jednostki lab. z wpisem → przypięcie zamyka oczekujący wynik → „Cofnij zamknięcie”`, async ({ page }) => {
    const fixture = await createFictionalVault(page, { shell });
    const start = fixture.frame;
    await loadPatient(start, fixture.ids.b, 'restore');
    const id = await zalozOczekujacy(start, fixture.ids.b, 'Kontrola TSH');
    await otworzKarte(page, start, shell, fixture.ids.b);
    const badania = sekcjaBadan(start);

    // Zakładka: dwie akcje i wyjaśnienie; bez ręcznego „Wpisz wynik” do edytora.
    const wiersz = badania.locator(`.vilda-lab-hist-pending-row[data-note-id="${id}"]`);
    await expect(wiersz.locator('.vilda-lab-hist-pending-title')).toHaveText('Kontrola TSH · termin 01.12.26');
    await expect(wiersz.locator('.vilda-lab-hist-pending-actions > *')).toHaveText(['Wpisz wynik →', 'Opisz wynik']);
    await expect(wiersz.locator('a.vilda-lab-hist-pending-enter')).toHaveAttribute('href', `przelicznik-jednostek.html?oczekujacy=${id}`);
    await expect(badania.locator('.vilda-lab-hist-pending-help')).toContainText('„Wpisz wynik →” otwiera Jednostki lab. z tym oczekującym wynikiem');

    await wiersz.locator('a.vilda-lab-hist-pending-enter').click();
    const lab = await przelicznik(page, shell);

    // Pasek pod tytułem karty: który wpis jest podpięty i co się z nim stanie.
    const pasek = lab.locator('#labPendingStrip');
    await expect(pasek).toBeVisible();
    await expect(pasek.locator('.lab-pending-title')).toHaveText('Oczekujący wynik: Kontrola TSH · termin 01.12.26');
    await expect(pasek).toContainText('Po przypięciu wyniku ten wpis zostanie oznaczony jako wykonany');
    await expect(pasek.getByRole('button', { name: 'Odłącz' })).toBeVisible();

    // Nazwa wpisana odręcznie: badania aplikacja nie zgaduje — wybiera je lekarz.
    await expect(lab.locator('#labSubstance')).toHaveValue('');
    await wpiszBadanie(lab, 'tsh', 'TSH', 'mIU/L', '2,5');
    await lab.locator('#labPinResultBtn').click();

    const okno = lab.locator('#labPinOverlay');
    const znacznik = okno.locator('#labPinPendingClose');
    await expect(znacznik).toBeChecked();
    await expect(okno.locator('.lab-pending-choice-text')).toHaveText('Zamknij oczekujący wynik: Kontrola TSH · termin 01.12.26');
    await expect(okno.locator('.lab-pending-choice-help')).toContainText('oczekujący wynik zostanie oznaczony jako wykonany');
    await okno.locator('#labPinSave').click();

    // Po zapisie: wynik z oceną jako osobny wpis, a oczekujący wynik wykonany.
    await expect(pasek).toHaveAttribute('role', 'status');
    await expect(pasek.locator('.lab-pending-text')).toHaveText('Oczekujący wynik „Kontrola TSH” oznaczony jako wykonany.');
    const zamkniety = await wpis(lab, id);
    expect(zamkniety.completedAtISO).toBeTruthy();
    expect(zamkniety.labResult ?? null).toBeNull();
    const wyniki = await wynikiPacjenta(lab, fixture.ids.b);
    expect(wyniki).toHaveLength(1);
    expect(wyniki[0].id).not.toBe(id);
    expect(wyniki[0].lab).toMatchObject({ testKey: 'tsh', valueNum: 2.5, unit: 'mIU/L' });
    expect(wyniki[0].lab.range).toBeTruthy();

    // „Cofnij zamknięcie”: wpis znów czeka i jest podpięty; zapisany wynik zostaje.
    await pasek.getByRole('button', { name: 'Cofnij zamknięcie' }).click();
    await expect(pasek).not.toHaveAttribute('role', 'status');
    await expect(pasek.locator('.lab-pending-title')).toHaveText('Oczekujący wynik: Kontrola TSH · termin 01.12.26');
    expect((await wpis(lab, id)).completedAtISO ?? null).toBeNull();
    expect(await wynikiPacjenta(lab, fixture.ids.b)).toHaveLength(1);
  });
}

test('odznaczony znacznik zostawia oczekujący wynik otwarty; „Odłącz” zdejmuje pasek i znacznik', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: false });
  await loadPatient(page, fixture.ids.b, 'restore');
  const id = await zalozOczekujacy(page, fixture.ids.b, 'Kontrola TSH');
  await page.goto(`/przelicznik-jednostek.html?oczekujacy=${id}`, { waitUntil: 'load' });
  const pasek = page.locator('#labPendingStrip');
  await expect(pasek.locator('.lab-pending-title')).toHaveText('Oczekujący wynik: Kontrola TSH · termin 01.12.26');

  await wpiszBadanie(page, 'tsh', 'TSH', 'mIU/L', '2,5');
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinPendingClose').uncheck();
  await expect(page.locator('#labPinOverlay .lab-pending-choice-help')).toHaveText('Oczekujący wynik zostanie otwarty i dalej będzie wracać w Przypomnieniach.');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);

  // Wynik zapisany, wpis dalej czeka i dalej jest podpięty.
  await expect.poll(() => wynikiPacjenta(page, fixture.ids.b)).toHaveLength(1);
  expect((await wpis(page, id)).completedAtISO ?? null).toBeNull();
  await expect(pasek).not.toHaveAttribute('role', 'status');
  await expect(pasek.locator('.lab-pending-title')).toHaveText('Oczekujący wynik: Kontrola TSH · termin 01.12.26');

  // „Odłącz”: pasek znika, a adres nie podpina wpisu ponownie po odświeżeniu. Wpis dalej czeka, więc okno
  // przypięcia proponuje go jak każdy oczekujący wynik pacjenta (etap 2) — odznaczonego, nic się samo nie zamyka.
  await pasek.getByRole('button', { name: 'Odłącz' }).click();
  await expect(pasek).toBeHidden();
  await expect(page).toHaveURL(/\/przelicznik-jednostek\.html$/);
  await page.locator('#labValue').fill('2,7');
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinOverlay #labPinDate')).toBeVisible();
  await expect(page.locator('#labPinOverlay input#labPinPendingClose')).not.toBeChecked();
  await expect(page.locator('#labPinOverlay .lab-pending-choice-help')).toHaveText('Pacjentka ma oczekujący wynik. Zaznacz, jeśli ten wynik go dotyczy.');
  await page.locator('#labPinCancel').click();
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#labPendingStrip')).toBeHidden();
  expect((await wpis(page, id)).completedAtISO ?? null).toBeNull();
});

test('pakiet badań otwarty z oczekującego wyniku: znacznik przy zapisie, zapis pakietu zamyka wpis', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: false });
  await loadPatient(page, fixture.ids.b, 'restore');
  const id = await zalozOczekujacy(page, fixture.ids.b, 'Kontrola tarczycy');
  await page.goto(`/przelicznik-jednostek.html?oczekujacy=${id}`, { waitUntil: 'load' });
  await expect(page.locator('#labPendingStrip .lab-pending-title')).toHaveText('Oczekujący wynik: Kontrola tarczycy · termin 01.12.26');

  await page.locator('#labModePackage').click();
  // Pasek jest w nagłówku karty: widać go także w pakiecie.
  await expect(page.locator('#labPendingStrip')).toBeVisible();
  const znacznik = page.locator('#labPkgPending #labPkgPendingClose');
  await expect(znacznik).toBeChecked();
  await expect(page.locator('#labPkgPending .lab-pending-choice-text')).toHaveText('Zamknij oczekujący wynik: Kontrola tarczycy · termin 01.12.26');
  await page.locator('#labPkgValue-tsh').fill('2,5');
  await page.locator('#labPkgValue-ft4').fill('14,2');
  await expect(znacznik).toBeChecked();
  await page.locator('#labPkgSave').click();

  await expect(page.locator('#labPkgDone')).toBeVisible();
  await expect(page.locator('#labPendingStrip .lab-pending-text')).toHaveText('Oczekujący wynik „Kontrola tarczycy” oznaczony jako wykonany.');
  await expect(page.locator('#labPkgPending')).toBeHidden();
  expect((await wpis(page, id)).completedAtISO).toBeTruthy();
  const wyniki = await wynikiPacjenta(page, fixture.ids.b);
  expect(wyniki.map((w) => w.lab.testKey).sort()).toEqual(['ft4', 'tsh']);
});

test('wpis z badaniem z listy przelicznika otwiera to badanie; inny przypinany wynik — znacznik odznaczony z wyjaśnieniem', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: false });
  await loadPatient(page, fixture.ids.b, 'restore');
  // Tak nazywa wpis Terminarz po procedurze: „Wynik: ” + nazwa — tu dokładnie nazwa badania z listy.
  const id = await zalozOczekujacy(page, fixture.ids.b, 'Wynik: TSH (tyreotropina)');
  await otworzKarte(page, page, false, fixture.ids.b);
  const wejscie = sekcjaBadan(page).locator(`.vilda-lab-hist-pending-row[data-note-id="${id}"] a.vilda-lab-hist-pending-enter`);
  await expect(wejscie).toHaveAttribute('href', `przelicznik-jednostek.html?oczekujacy=${id}&badanie=tsh`);
  await wejscie.click();
  await expect(page).toHaveURL(/\/przelicznik-jednostek\.html\?oczekujacy=/);
  await expect(page.locator('#labPendingStrip')).toBeVisible();
  await expect(page.locator('#labSubstance')).toHaveValue('TSH (tyreotropina)');

  // Ten sam wynik co we wpisie: znacznik zaznaczony.
  await page.locator('#labUnit').selectOption('mIU/L');
  await page.locator('#labValue').fill('2,5');
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinPendingClose')).toBeChecked();
  await page.locator('#labPinCancel').click();

  // Inne badanie: aplikacja wie, że to nie ten wynik — znacznik odznaczony, z wyjaśnieniem.
  await page.locator('#labValue').fill('');
  await wpiszBadanie(page, 'ft4', 'fT4', 'pmol/L', '14,2');
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinPendingClose')).not.toBeChecked();
  await expect(page.locator('#labPinOverlay .lab-pending-choice')).toHaveClass(/is-mismatch/);
  await expect(page.locator('#labPinOverlay .lab-pending-choice-help')).toHaveText('Oczekujący wynik dotyczy TSH, a przypinany wynik to fT4. Zaznacz, jeśli mimo to chcesz go zamknąć.');
  await page.locator('#labPinSave').click();
  await expect.poll(() => wynikiPacjenta(page, fixture.ids.b)).toHaveLength(1);
  expect((await wpis(page, id)).completedAtISO ?? null).toBeNull();
  await expect(page.locator('#labPendingStrip .lab-pending-title')).toHaveText('Oczekujący wynik: Wynik: TSH (tyreotropina) · termin 01.12.26');
});

test('wpis innego pacjenta albo już zamknięty nie podpina się; zmiana pacjenta zdejmuje pasek', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: false });
  await loadPatient(page, fixture.ids.b, 'restore');
  const cudzy = await zalozOczekujacy(page, fixture.ids.a, 'Kontrola TSH');
  const zamkniety = await zalozOczekujacy(page, fixture.ids.b, 'Kontrola IGF-1');
  await page.evaluate((id) => window.VildaVault.completePatientNote(id), zamkniety);
  const wlasny = await zalozOczekujacy(page, fixture.ids.b, 'Kontrola fT4');

  for (const id of [cudzy, zamkniety]) {
    await page.goto(`/przelicznik-jednostek.html?oczekujacy=${id}`, { waitUntil: 'load' });
    await expect(page.locator('#labToast')).toHaveText('Ten oczekujący wynik jest już zamknięty albo nie należy do wczytanego pacjenta.');
    await expect(page.locator('#labPendingStrip')).toBeHidden();
    await expect(page).toHaveURL(/\/przelicznik-jednostek\.html$/);
  }

  await page.goto(`/przelicznik-jednostek.html?oczekujacy=${wlasny}`, { waitUntil: 'load' });
  await expect(page.locator('#labPendingStrip')).toBeVisible();
  // Wczytanie innego pacjenta: wpis należał do poprzedniego.
  await page.goto('/index.html', { waitUntil: 'load' });
  await loadPatient(page, fixture.ids.a, 'restore');
  await page.goto(`/przelicznik-jednostek.html?oczekujacy=${wlasny}`, { waitUntil: 'load' });
  await expect(page.locator('#labToast')).toHaveText('Ten oczekujący wynik jest już zamknięty albo nie należy do wczytanego pacjenta.');
  await expect(page.locator('#labPendingStrip')).toBeHidden();
  expect((await wpis(page, wlasny)).completedAtISO ?? null).toBeNull();
});
