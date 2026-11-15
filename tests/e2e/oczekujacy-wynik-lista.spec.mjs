import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';

// P-OCZEKUJACE-WYNIKI, etap 2 (decyzja właściciela 2026-11-15; makieta https://claude.ai/artifact/DSmqMe6YuCyj2VuJoBHraQ).
// Wynik wpisany w Jednostkach lab. bez wejścia z „Badań” też może zamknąć oczekujący wynik: okno przypięcia
// i pakiet pokazują oczekujące wyniki wczytanego pacjenta. Domyślnie nic się nie zamyka; aplikacja zaznacza wpis
// sama tylko wtedy, gdy dokładnie jeden ma badanie z listy przelicznika równe zapisywanemu.
// Wyłącznie fikcyjny sejf w efemerycznym profilu Playwrighta; natywny zegar (prawdziwe wczytanie pacjenta).
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

// Wpis taki, jaki zakłada Terminarz: kategoria „Badanie”, termin, bez wartości.
const zalozOczekujacy = (owner, patientId, title, termin) => owner.evaluate(async ({ patientId, title, termin }) => {
  const id = 'fikcyjny-oczekujacy-' + Math.random().toString(36).slice(2, 10);
  await window.VildaVault.savePatientNote({ id, patientId, title, body: '', category: 'wynik-badania', dueDateISO: termin });
  return id;
}, { patientId, title, termin });
const wpis = (owner, id) => owner.evaluate((noteId) => window.VildaVault.getPatientNote(noteId), id);
const zamkniete = async (owner, ids) => (await Promise.all(ids.map((id) => wpis(owner, id)))).map((note) => !!note.completedAtISO);
const wynikiPacjenta = (owner, patientId) => owner.evaluate(async (pid) => {
  const notes = await window.VildaVault.listPatientNotesForPatient(pid);
  return notes.filter((n) => n.category === 'wynik-badania' && n.labResult && (n.labResult.value || n.labResult.valueNum != null))
    .map((n) => n.labResult.testKey).sort();
}, patientId);

async function przelicznik(page, shell) {
  if (shell) {
    await page.evaluate(() => window.VildaShell.navigate('lab'));
    await expect(page).toHaveURL(/\/app\.html#\/lab/, { timeout: 20_000 });
    const lab = await shellFrame(page, 'Jednostki laboratoryjne');
    await lab.waitForLoadState('load');
    return lab;
  }
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  return page;
}

async function wpiszBadanie(lab, id, nazwa, jednostka, wartosc) {
  await lab.locator('#labSubstance').fill(nazwa);
  await lab.locator(`#labSubstanceDropdown .lab-substance-option[data-id="${id}"]`).click();
  await lab.locator('#labUnit').selectOption(jednostka);
  await lab.locator('#labValue').fill(wartosc);
}

const DOMYSLNIE = 'Domyślnie nic się nie zamyka: nazwy wpisów są wpisane odręcznie, więc aplikacja nie zgaduje, którego badania dotyczą.';

for (const shell of [true, false]) {
  test(`${shell ? 'powłoka' : 'samodzielnie'}: lista oczekujących wyników w oknie przypięcia — domyślnie nic się nie zamyka; wybrany wpis zamyka się po zapisie, z „Cofnij zamknięcie”`, async ({ page }) => {
    const fixture = await createFictionalVault(page, { shell });
    const start = fixture.frame;
    await loadPatient(start, fixture.ids.b, 'restore');
    // Kolejność zakładania inna niż kolejność terminów: lista idzie od najbliższego terminu.
    const igf = await zalozOczekujacy(start, fixture.ids.b, 'Kontrola IGF-1', '2026-12-05');
    const bacc = await zalozOczekujacy(start, fixture.ids.b, 'Wynik: Biopsja tarczycy (BACC)', '2026-12-17');
    const tsh = await zalozOczekujacy(start, fixture.ids.b, 'Kontrola TSH', '2026-12-01');
    // Wpis innego pacjenta nie należy do listy.
    await zalozOczekujacy(start, fixture.ids.a, 'Kontrola kortyzolu', '2026-11-20');

    const lab = await przelicznik(page, shell);
    const pasek = lab.locator('#labPendingStrip');
    await expect(pasek).toBeHidden();
    await wpiszBadanie(lab, 'tsh', 'TSH', 'mIU/L', '2,5');
    await lab.locator('#labPinResultBtn').click();

    // Lista nad datą badania: „Nie zamykaj żadnego” zaznaczone, wpisy od najbliższego terminu.
    const okno = lab.locator('#labPinOverlay');
    const lista = okno.locator('#labPinPendingClose.lab-pending-list');
    await expect(lista.locator('.lab-pending-list-legend')).toHaveText('Pacjentka ma oczekujące wyniki. Zamknąć któryś tym wynikiem?');
    await expect(lista.locator('.lab-pending-list-option')).toHaveText([
      'Nie zamykaj żadnego', 'Kontrola TSH · termin 01.12.26', 'Kontrola IGF-1 · termin 05.12.26', 'Wynik: Biopsja tarczycy (BACC) · termin 17.12.26'
    ]);
    await expect(lista.getByRole('radio', { name: 'Nie zamykaj żadnego' })).toBeChecked();
    await expect(lista.locator('.lab-pending-choice-help')).toHaveText(DOMYSLNIE);
    await expect(lista.locator('.lab-pending-list-more')).toHaveCount(0);
    expect(await okno.evaluate((el) => {
      const list = el.querySelector('#labPinPendingClose'), date = el.querySelector('#labPinDate');
      return !!(list.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);

    // Zapis bez wyboru: wynik zapisany, żaden wpis się nie zamyka, komunikatu nie ma.
    await okno.locator('#labPinSave').click();
    await expect(okno).toHaveCount(0);
    await expect.poll(() => wynikiPacjenta(lab, fixture.ids.b)).toEqual(['tsh']);
    expect(await zamkniete(lab, [tsh, igf, bacc])).toEqual([false, false, false]);
    await expect(pasek).toBeHidden();

    // Wybrany wpis: opis mówi, co się stanie; po zapisie zamyka się tylko on.
    await lab.locator('#labValue').fill('2,7');
    await lab.locator('#labPinResultBtn').click();
    await lista.getByRole('radio', { name: /^Kontrola TSH/ }).check();
    await expect(lista.locator('.lab-pending-list-option.is-selected')).toHaveText('Kontrola TSH · termin 01.12.26');
    await expect(lista.locator('.lab-pending-choice-help')).toHaveText('Po zapisie „Kontrola TSH” zostanie oznaczony jako wykonany: zniknie z oczekujących i przestanie wracać w Przypomnieniach. Pozostałe wpisy dalej czekają.');
    await okno.locator('#labPinSave').click();
    await expect(pasek).toHaveAttribute('role', 'status');
    await expect(pasek.locator('.lab-pending-text')).toHaveText('Oczekujący wynik „Kontrola TSH” oznaczony jako wykonany.');
    await expect(pasek.getByRole('button', { name: 'Otwórz Badania →' })).toBeVisible();
    expect(await zamkniete(lab, [tsh, igf, bacc])).toEqual([true, false, false]);
    expect(await wynikiPacjenta(lab, fixture.ids.b)).toEqual(['tsh', 'tsh']);

    // Zamknięty wpis nie wraca na listę.
    await lab.locator('#labValue').fill('2,8');
    await lab.locator('#labPinResultBtn').click();
    await expect(lista.locator('.lab-pending-list-option')).toHaveText([
      'Nie zamykaj żadnego', 'Kontrola IGF-1 · termin 05.12.26', 'Wynik: Biopsja tarczycy (BACC) · termin 17.12.26'
    ]);
    await okno.locator('#labPinCancel').click();

    // „Cofnij zamknięcie”: wpis znów czeka, ale nie jest podpięty do strony — wraca na listę.
    await pasek.getByRole('button', { name: 'Cofnij zamknięcie' }).click();
    await expect(pasek).toBeHidden();
    expect(await zamkniete(lab, [tsh, igf, bacc])).toEqual([false, false, false]);
    await lab.locator('#labPinResultBtn').click();
    await expect(lista.locator('.lab-pending-list-option')).toHaveCount(4);
    await expect(lista.getByRole('radio', { name: 'Nie zamykaj żadnego' })).toBeChecked();
    await okno.locator('#labPinCancel').click();
    expect(await wynikiPacjenta(lab, fixture.ids.b)).toEqual(['tsh', 'tsh']);
  });
}

test('pacjent bez oczekujących wyników: okno przypięcia jak dotąd; jeden wpis: odznaczony znacznik, zaznaczony zamyka wpis', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: false });
  await loadPatient(page, fixture.ids.a, 'restore');
  await przelicznik(page, false);
  await wpiszBadanie(page, 'tsh', 'TSH', 'mIU/L', '2,5');
  await page.locator('#labPinResultBtn').click();
  const okno = page.locator('#labPinOverlay');
  await expect(okno.locator('#labPinDate')).toBeVisible();
  // Odczyt listy jest asynchroniczny: po zapisie do sejfu (kolejny odczyt) bloku nadal nie ma.
  await page.evaluate((pid) => window.VildaVault.listPatientNotesForPatient(pid), fixture.ids.a);
  await expect(okno.locator('.lab-pending-choice')).toHaveCount(0);
  await okno.locator('#labPinCancel').click();

  // Jeden oczekujący wynik: znacznik jak w etapie 1, ale odznaczony.
  const id = await zalozOczekujacy(page, fixture.ids.a, 'Kontrola TSH', '2026-12-01');
  await page.locator('#labPinResultBtn').click();
  const znacznik = okno.locator('input#labPinPendingClose');
  await expect(znacznik).not.toBeChecked();
  await expect(okno.locator('.lab-pending-list')).toHaveCount(0);
  await expect(okno.locator('.lab-pending-choice-text')).toHaveText('Zamknij oczekujący wynik: Kontrola TSH · termin 01.12.26');
  await expect(okno.locator('.lab-pending-choice-help')).toHaveText('Pacjent ma oczekujący wynik. Zaznacz, jeśli ten wynik go dotyczy.');
  await okno.locator('#labPinSave').click();
  await expect.poll(() => wynikiPacjenta(page, fixture.ids.a)).toEqual(['tsh']);
  expect((await wpis(page, id)).completedAtISO ?? null).toBeNull();
  await expect(page.locator('#labPendingStrip')).toBeHidden();

  // Zaznaczony: opis mówi, co się stanie; po zapisie wpis jest wykonany.
  await page.locator('#labValue').fill('2,7');
  await page.locator('#labPinResultBtn').click();
  await znacznik.check();
  await expect(okno.locator('.lab-pending-choice-help')).toHaveText('Po zapisie „Kontrola TSH” zostanie oznaczony jako wykonany: zniknie z oczekujących i przestanie wracać w Przypomnieniach.');
  await okno.locator('#labPinSave').click();
  await expect(page.locator('#labPendingStrip .lab-pending-text')).toHaveText('Oczekujący wynik „Kontrola TSH” oznaczony jako wykonany.');
  expect((await wpis(page, id)).completedAtISO).toBeTruthy();
  expect((await wpis(page, id)).labResult ?? null).toBeNull();
});

test('aplikacja zaznacza wpis sama tylko przy dokładnej nazwie przypinanego badania; przy innym badaniu i przy dwóch pasujących wpisach nie zgaduje', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: false });
  await loadPatient(page, fixture.ids.b, 'restore');
  // Tak nazywa wpis Terminarz po procedurze: „Wynik: ” + nazwa — tu dokładnie nazwa badania z listy przelicznika.
  const dokladny = await zalozOczekujacy(page, fixture.ids.b, 'Wynik: TSH (tyreotropina)', '2026-12-09');
  const odreczny = await zalozOczekujacy(page, fixture.ids.b, 'Kontrola TSH', '2026-12-01');
  await przelicznik(page, false);
  const okno = page.locator('#labPinOverlay');
  const lista = okno.locator('#labPinPendingClose.lab-pending-list');

  await wpiszBadanie(page, 'tsh', 'TSH', 'mIU/L', '2,5');
  await page.locator('#labPinResultBtn').click();
  await expect(lista.getByRole('radio', { name: /^Wynik: TSH \(tyreotropina\)/ })).toBeChecked();
  await expect(lista.locator('.lab-pending-choice-help')).toHaveText('Zaznaczono, bo ten wpis dotyczy TSH. Zmień, jeśli to inny wynik.');
  // Zmiana wyboru należy do lekarza: „Nie zamykaj żadnego” zostawia oba wpisy.
  await lista.getByRole('radio', { name: 'Nie zamykaj żadnego' }).check();
  await expect(lista.locator('.lab-pending-choice-help')).toHaveText(DOMYSLNIE);
  await okno.locator('#labPinCancel').click();

  // Inne badanie niż we wpisie: nic nie jest zaznaczone.
  await page.locator('#labValue').fill('');
  await wpiszBadanie(page, 'ft4', 'fT4', 'pmol/L', '14,2');
  await page.locator('#labPinResultBtn').click();
  await expect(lista.getByRole('radio', { name: 'Nie zamykaj żadnego' })).toBeChecked();
  await okno.locator('#labPinCancel').click();

  // Zaznaczenie aplikacji zamyka wpis jak wybór lekarza.
  await page.locator('#labValue').fill('');
  await wpiszBadanie(page, 'tsh', 'TSH', 'mIU/L', '2,5');
  await page.locator('#labPinResultBtn').click();
  await expect(lista.getByRole('radio', { name: /^Wynik: TSH \(tyreotropina\)/ })).toBeChecked();
  await okno.locator('#labPinSave').click();
  await expect(page.locator('#labPendingStrip .lab-pending-text')).toHaveText('Oczekujący wynik „Wynik: TSH (tyreotropina)” oznaczony jako wykonany.');
  expect(await zamkniete(page, [dokladny, odreczny])).toEqual([true, false]);

  // Dwa wpisy z tym samym badaniem z listy: aplikacja nie rozstrzyga, który zamknąć.
  await zalozOczekujacy(page, fixture.ids.b, 'Wynik: TSH (tyreotropina)', '2026-12-10');
  await zalozOczekujacy(page, fixture.ids.b, 'Wynik: TSH (tyreotropina)', '2026-12-11');
  await page.locator('#labValue').fill('2,6');
  await page.locator('#labPinResultBtn').click();
  await expect(lista.locator('.lab-pending-list-option')).toHaveCount(4);
  await expect(lista.getByRole('radio', { name: 'Nie zamykaj żadnego' })).toBeChecked();
  await expect(lista.locator('.lab-pending-choice-help')).toHaveText(DOMYSLNIE);
});

test('więcej niż trzy oczekujące wyniki: trzy z najbliższym terminem i „Pokaż pozostałe”; wpis zaznaczony przez aplikację jest widoczny od razu', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: false });
  await loadPatient(page, fixture.ids.b, 'restore');
  const nazwy = ['Kontrola A', 'Kontrola B', 'Kontrola C', 'Kontrola D', 'Kontrola E'];
  for (let i = 0; i < nazwy.length; i++) await zalozOczekujacy(page, fixture.ids.b, nazwy[i], `2026-12-0${i + 1}`);
  await przelicznik(page, false);
  const okno = page.locator('#labPinOverlay');
  const lista = okno.locator('#labPinPendingClose.lab-pending-list');

  await wpiszBadanie(page, 'tsh', 'TSH', 'mIU/L', '2,5');
  await page.locator('#labPinResultBtn').click();
  await expect(lista.locator('.lab-pending-list-option')).toHaveText([
    'Nie zamykaj żadnego', 'Kontrola A · termin 01.12.26', 'Kontrola B · termin 02.12.26', 'Kontrola C · termin 03.12.26'
  ]);
  const wiecej = lista.getByRole('button', { name: 'Pokaż pozostałe (2)' });
  await wiecej.click();
  await expect(lista.locator('.lab-pending-list-option')).toHaveCount(6);
  await expect(wiecej).toHaveCount(0);
  // Fokus trafia na pierwszy odsłonięty wpis; okno nie rośnie ponad ekran (przewija się w środku).
  await expect(lista.getByRole('radio', { name: /^Kontrola D/ })).toBeFocused();
  expect(await okno.evaluate((el) => el.firstElementChild.getBoundingClientRect().bottom <= window.innerHeight + 1)).toBe(true);
  await lista.getByRole('radio', { name: /^Kontrola E/ }).check();
  await okno.locator('#labPinSave').click();
  await expect(page.locator('#labPendingStrip .lab-pending-text')).toHaveText('Oczekujący wynik „Kontrola E” oznaczony jako wykonany.');

  // Wpis z badaniem z listy przelicznika i najdalszym terminem: zaznaczony przez aplikację, więc widoczny od razu.
  await zalozOczekujacy(page, fixture.ids.b, 'Wynik: TSH (tyreotropina)', '2026-12-20');
  await page.locator('#labValue').fill('2,7');
  await page.locator('#labPinResultBtn').click();
  await expect(lista.locator('.lab-pending-list-option')).toHaveText([
    'Nie zamykaj żadnego', 'Kontrola A · termin 01.12.26', 'Kontrola B · termin 02.12.26', 'Wynik: TSH (tyreotropina) · termin 20.12.26'
  ]);
  await expect(lista.getByRole('radio', { name: /^Wynik: TSH \(tyreotropina\)/ })).toBeChecked();
  await expect(lista.getByRole('button', { name: 'Pokaż pozostałe (2)' })).toBeVisible();
});

test('pakiet badań: lista oczekujących wyników przy zapisie; wybrany wpis zamyka się dopiero po zapisaniu wyników', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: false });
  await loadPatient(page, fixture.ids.b, 'restore');
  const tarczyca = await zalozOczekujacy(page, fixture.ids.b, 'Kontrola tarczycy', '2026-12-01');
  const igf = await zalozOczekujacy(page, fixture.ids.b, 'Kontrola IGF-1', '2026-12-05');
  await przelicznik(page, false);
  await page.locator('#labModePackage').click();

  const lista = page.locator('#labPkgPending #labPkgPendingClose.lab-pending-list');
  await expect(lista.locator('.lab-pending-list-legend')).toHaveText('Pacjentka ma oczekujące wyniki. Zamknąć któryś tym pakietem?');
  await expect(lista.locator('.lab-pending-list-option')).toHaveText(['Nie zamykaj żadnego', 'Kontrola tarczycy · termin 01.12.26', 'Kontrola IGF-1 · termin 05.12.26']);
  await expect(lista.getByRole('radio', { name: 'Nie zamykaj żadnego' })).toBeChecked();

  // Wybór lekarza zostaje przy wpisywaniu wyników.
  await lista.getByRole('radio', { name: /^Kontrola tarczycy/ }).check();
  await page.locator('#labPkgValue-tsh').fill('2,5');
  await page.locator('#labPkgValue-ft4').fill('14,2');
  await expect(lista.getByRole('radio', { name: /^Kontrola tarczycy/ })).toBeChecked();
  await expect(lista.locator('.lab-pending-choice-help')).toHaveText('Po zapisaniu wyników „Kontrola tarczycy” zostanie oznaczony jako wykonany. Zamyka się dopiero, gdy zapiszą się wszystkie wpisane wyniki.');
  expect(await zamkniete(page, [tarczyca, igf])).toEqual([false, false]);
  await page.locator('#labPkgSave').click();

  await expect(page.locator('#labPkgDone')).toBeVisible();
  await expect(page.locator('#labPendingStrip .lab-pending-text')).toHaveText('Oczekujący wynik „Kontrola tarczycy” oznaczony jako wykonany.');
  expect(await zamkniete(page, [tarczyca, igf])).toEqual([true, false]);
  expect(await wynikiPacjenta(page, fixture.ids.b)).toEqual(['ft4', 'tsh']);

  // Został jeden oczekujący wynik: pakiet pokazuje go jako odznaczony znacznik.
  const znacznik = page.locator('#labPkgPending input#labPkgPendingClose');
  await expect(znacznik).not.toBeChecked();
  await expect(page.locator('#labPkgPending .lab-pending-choice-text')).toHaveText('Zamknij oczekujący wynik: Kontrola IGF-1 · termin 05.12.26');
  await expect(page.locator('#labPkgPending .lab-pending-choice-help')).toHaveText('Pacjentka ma oczekujący wynik. Zaznacz, jeśli te wyniki go dotyczą.');

  // Zapis bez zaznaczenia zostawia wpis otwarty.
  await page.locator('#labPkgValue-tsh').fill('2,6');
  await page.locator('#labPkgSave').click();
  await expect(page.locator('#labPkgDone')).toBeVisible();
  expect(await zamkniete(page, [igf])).toEqual([false]);
});

test('wpis podpięty z „Badań” (etap 1) ma pierwszeństwo: okno pokazuje tylko jego, zaznaczonego — bez listy', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: false });
  await loadPatient(page, fixture.ids.b, 'restore');
  const podpiety = await zalozOczekujacy(page, fixture.ids.b, 'Kontrola TSH', '2026-12-01');
  const inny = await zalozOczekujacy(page, fixture.ids.b, 'Kontrola IGF-1', '2026-12-05');
  await page.goto(`/przelicznik-jednostek.html?oczekujacy=${podpiety}`, { waitUntil: 'load' });
  await expect(page.locator('#labPendingStrip .lab-pending-title')).toHaveText('Oczekujący wynik: Kontrola TSH · termin 01.12.26');

  await wpiszBadanie(page, 'tsh', 'TSH', 'mIU/L', '2,5');
  await page.locator('#labPinResultBtn').click();
  const okno = page.locator('#labPinOverlay');
  await expect(okno.locator('input#labPinPendingClose')).toBeChecked();
  await expect(okno.locator('.lab-pending-choice-text')).toHaveText('Zamknij oczekujący wynik: Kontrola TSH · termin 01.12.26');
  await expect(okno.locator('.lab-pending-list')).toHaveCount(0);
  await okno.locator('#labPinSave').click();
  await expect(page.locator('#labPendingStrip .lab-pending-text')).toHaveText('Oczekujący wynik „Kontrola TSH” oznaczony jako wykonany.');
  expect(await zamkniete(page, [podpiety, inny])).toEqual([true, false]);
});
