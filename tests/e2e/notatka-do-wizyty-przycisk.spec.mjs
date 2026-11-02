import { expect, test } from '../support/test-czas.mjs';
import { czekajNaHistorie } from '../support/karta-czekanie.mjs';

// P-NOTATKI rata 2: po zmianie menu dokumentacja jest dostępna przez Kartę.
// G8 nadal pilnuje kotwicy 66 mies. i ostrzeżenia bez pasującego pomiaru;
// G24 walidacji zapisu, a G22 semantyki oraz Escape prawdziwego edytora.
// Ukrytego kompatybilnego addVisitNoteBtnSidebar nie aktywujemy.
const HASLO = 'E2e#Wizyta!2026';

async function wpiszPomiar(page, pola) {
  await page.evaluate((wartosci) => {
    for (const [id, value] of Object.entries(wartosci)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, pola);
}

async function przygotuj(page, strona) {
  await page.addInitScript(() => localStorage.setItem('vilda-terms-accepted-v1',
    JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })));
  await page.route('**/*', route => {
    const u = route.request().url();
    return u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:')
      ? route.continue() : route.abort();
  });
  await page.goto(strona, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async pw => window.VildaVault.createUser(pw,
    { label: 'Fikcyjne konto notatek wizyty', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await expect(page.locator('#addVisitNoteBtnSidebar'), 'globalna akcja wizyty nie jest już dostępna w menu').toBeHidden();
}

async function wczytajPacjenta(page, age = 5.5) {
  return page.evaluate(async wiek => {
    const zapis = await window.VildaVault.savePatient({
      name: 'Fikcyjna Pacjentka',
      user: { lastName: 'Fikcyjna', firstName: 'Pacjentka', sex: 'F', age: wiek, ageMonths: 0, height: 110, weight: 19 },
    }, { dedup: false });
    if (typeof window.applyLoadedData === 'function') {
      const p = await window.VildaVault.getPatient(zapis.patientId);
      window.applyLoadedData(p.snapshots[0].payload);
    }
    window._vildaCurrentPatientId = zapis.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', zapis.patientId);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: zapis.patientId, skipLoadChoice: true },
    }));
    window.VildaChrome.refreshPatientChip();
    return zapis.patientId;
  }, age);
}

async function klikKarte(page) {
  const sidebar = page.locator('aside.sidebar [data-menu-patient-card]');
  if (await sidebar.isVisible()) await sidebar.click();
  else {
    await page.locator('[data-vilda-chrome-menu-btn]').click();
    await page.locator('[data-vilda-chrome-drawer] [data-menu-patient-card]').click();
  }
}

async function otworzKarte(page) {
  await klikKarte(page);
  await expect(page.locator('.vilda-auth-patient-card')).toBeVisible();
  await expect(page.locator('.vilda-patient-note-editor-overlay'), 'samo otwarcie Karty nie otwiera edytora').toHaveCount(0);
}

async function dodajZNotatek(page) {
  await otworzKarte(page);
  const card = page.locator('.vilda-auth-patient-card');
  await card.locator('.vilda-patient-tab[data-tab="notes"]').click();
  await card.getByRole('button', { name: '+ Dodaj notatkę', exact: true }).click();
}

async function dodajPrzyPomiarze(page) {
  await otworzKarte(page);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  await czekajNaHistorie(page);
  await page.locator('.vilda-patient-timeline-list').getByRole('button', { name: 'Akcje dla pomiaru', exact: true }).click();
  await page.locator('.vilda-timeline-measure-menu').getByRole('button', { name: 'Dodaj notatkę', exact: true }).click();
}

for (const strona of ['/index.html', '/docpro.html']) {
  test(`G11/G8 — Karta → Historia → notatka przy pomiarze 66 mies. na ${strona}`, async ({ page }) => {
    await przygotuj(page, strona);
    // Bez pacjenta wejście do dokumentacji prowadzi do Bazy, nie do edytora.
    await klikKarte(page);
    const lista = page.locator('.vilda-auth-patients');
    await expect(lista).toBeVisible();
    await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
    await lista.getByRole('button', { name: 'Strona główna', exact: true }).click();
    const patientId = await wczytajPacjenta(page);
    await dodajPrzyPomiarze(page);
    const arkusz = page.locator('.vilda-patient-note-editor-overlay .vilda-pne');
    await expect(arkusz).toBeVisible();
    await expect(arkusz.locator('label.b3-anchor-option', { hasText: 'Powiąż z wizytą' })).toContainText('5 lat 6 mies.');
    const wieki = await page.evaluate(async id => (await window.VildaVault.listPatientTimelineEvents(id))
      .filter(z => z.type === 'measurement').map(z => z.ageMonths), patientId);
    expect(wieki).toContain(66);
    await expect(arkusz).toHaveAttribute('role', 'dialog');
    await expect(arkusz).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
  });
}

test('G24 — „Wpisz datę zdarzenia” bez daty zatrzymuje zapis z Notatek pacjenta', async ({ page }) => {
  await przygotuj(page, '/index.html');
  await wczytajPacjenta(page);
  await dodajZNotatek(page);
  const arkusz = page.locator('.vilda-patient-note-editor-overlay .vilda-pne');
  await expect(arkusz).toBeVisible();
  await arkusz.locator('input[name="b3-anchor"][value="date"]').check();
  await arkusz.locator('textarea').first().fill('Fikcyjna treść notatki kontrolnej');
  await arkusz.getByRole('button', { name: 'Dodaj notatkę', exact: true }).click();
  await expect(arkusz).toContainText('Wpisz datę zdarzenia albo wybierz inną opcję powiązania.');
  await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(1);
  expect(await page.evaluate(async () => (await window.VildaVault.listAllPatientNotes()).length)).toBe(0);
});

test('G8 — edycja notatki przy 48 mies. bez zapisanego pomiaru ostrzega i pozwala zapisać treść', async ({ page }) => {
  await przygotuj(page, '/index.html');
  const patientId = await wczytajPacjenta(page, 3);
  const noteId = await page.evaluate(async id => (await window.VildaVault.savePatientNote({
    patientId: id, title: 'Fikcyjna notatka bez pomiaru', body: 'Treść przed edycją',
    category: 'observation', linkedAgeMonths: 48,
  })).id, patientId);
  await otworzKarte(page);
  const card = page.locator('.vilda-auth-patient-card');
  await card.locator('.vilda-patient-tab[data-tab="notes"]').click();
  await card.locator(`[data-note-id="${noteId}"]`).getByRole('button', { name: 'Edytuj', exact: true }).click();
  const arkusz = page.locator('.vilda-patient-note-editor-overlay .vilda-pne');
  await expect(arkusz).toBeVisible();
  await expect(arkusz).toContainText('Dla tego wieku nie ma jeszcze zapisanego pomiaru');
  await arkusz.locator('textarea').first().fill('Fikcyjna notatka przed zapisem pomiaru');
  await arkusz.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
  await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
  const notes = await page.evaluate(async id => window.VildaVault.listPatientNotesForPatient(id), patientId);
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({ id: noteId, linkedAgeMonths: 48, body: 'Fikcyjna notatka przed zapisem pomiaru' });
});

test('niezapisany pomiar formularza nie otwiera automatycznie edytora ani kotwicy po wejściu do Karty', async ({ page }) => {
  await przygotuj(page, '/index.html');
  await wczytajPacjenta(page, 3);
  await wpiszPomiar(page, { age: '4', height: '102', weight: '16' });
  await expect(page.locator('#addVisitNoteBtnSidebar')).toBeHidden();
  await otworzKarte(page);
  const card = page.locator('.vilda-auth-patient-card');
  await card.locator('.vilda-patient-tab[data-tab="notes"]').click();
  await card.getByRole('button', { name: '+ Dodaj notatkę', exact: true }).click();
  const arkusz = page.locator('.vilda-patient-note-editor-overlay .vilda-pne');
  await expect(arkusz.locator('input[name="b3-anchor"][value="general"]')).toBeChecked();
  await expect(arkusz.locator('input[name="b3-anchor"][value="visit"]')).toHaveCount(0);
  await expect(page.locator('#age')).toHaveValue('4');
  expect(await page.evaluate(async () => (await window.VildaVault.listAllPatientNotes()).length)).toBe(0);
});

test('G20 — poza formularzem Dokumenty wskazują Start/DocPro, globalny skrót notatki jest niedostępny', async ({ page }) => {
  await przygotuj(page, '/terminarz.html');
  const documents = page.locator('#patientDocumentsBtnSidebar');
  await expect(documents).toBeVisible();
  await expect(documents).toHaveAttribute('aria-disabled', 'true');
  await expect(documents).toHaveAttribute('data-tip', /(?:Start|głównej).*DocPro/);
  const box = await documents.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
  // Natywny klik widocznej aria-disabled akcji pozwala przeczytać powód;
  // nie omija układu ani nie aktywuje ukrytego legacy przycisku.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.menu-tooltip, .vilda-tip').first()).toContainText('DocPro');
  await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
});

test('G24 — długość wizyty spoza zakresu wygrywa z regułą „wymaga daty”', async ({ page }) => {
  await przygotuj(page, '/index.html');
  await wczytajPacjenta(page);
  await dodajZNotatek(page);
  const arkusz = page.locator('.vilda-patient-note-editor-overlay .vilda-pne');
  await expect(arkusz).toBeVisible();
  await arkusz.locator('textarea').first().fill('Fikcyjna notatka z błędną długością wizyty');
  await arkusz.locator('input[type="number"][max="1440"]').fill('3');
  await arkusz.getByRole('button', { name: 'Dodaj notatkę', exact: true }).click();
  await expect(arkusz).toContainText('od 5 do 1440');
  await expect(arkusz).not.toContainText('ustaw datę albo wyczyść te pola');
});
