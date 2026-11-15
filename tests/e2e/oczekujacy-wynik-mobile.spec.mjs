import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient } from '../support/centile-live-fixture.mjs';

// P-OCZEKUJACE-WYNIKI na telefonie (projekt mobile-chromium), na fikcyjnym sejfie: dwie akcje przy oczekującym
// wyniku, okno „Opisz wynik”, pasek w Jednostkach lab., znacznik w oknie przypięcia i komunikat po zamknięciu
// mieszczą się na ekranie, bez przewijania w bok; cele dotyku mają co najmniej 44 px.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

const bezPrzewijaniaWBok = (owner) => owner.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const wEkranie = (locator) => locator.evaluate((el) => {
  const b = el.getBoundingClientRect();
  return b.left >= -1 && b.right <= document.documentElement.clientWidth + 1;
});
const wysokosc = (locator) => locator.evaluate((el) => Math.round(el.getBoundingClientRect().height));
const zalozOczekujacy = (owner, patientId, title, termin = '2026-12-01') => owner.evaluate(async ({ patientId, title, termin }) => {
  const id = 'fikcyjny-oczekujacy-' + Math.random().toString(36).slice(2, 10);
  await window.VildaVault.savePatientNote({ id, patientId, title, body: '', category: 'wynik-badania', dueDateISO: termin });
  return id;
}, { patientId, title, termin });

test('telefon: oczekujący wynik w Badaniach, okno „Opisz wynik”, pasek i znacznik w Jednostkach lab. — bez przewijania w bok', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: false });
  await loadPatient(page, fixture.ids.b, 'restore');
  const id = await zalozOczekujacy(page, fixture.ids.b, 'Wynik: Biopsja tarczycy (BACC)');
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'lab' }), fixture.ids.b);

  // Zakładka „Badania”.
  const wiersz = page.locator(`.vilda-lab-hist-pending-row[data-note-id="${id}"]`);
  await expect(wiersz.locator('.vilda-lab-hist-pending-actions > *')).toHaveText(['Wpisz wynik →', 'Opisz wynik']);
  for (const akcja of await wiersz.locator('.vilda-lab-hist-pending-actions > *').all()) {
    expect(await wEkranie(akcja)).toBe(true);
    expect(await wysokosc(akcja)).toBeGreaterThanOrEqual(44);
  }
  expect(await wEkranie(page.locator('.vilda-lab-hist-pending-help'))).toBe(true);
  expect(await bezPrzewijaniaWBok(page)).toBe(true);

  // Okno „Opisz wynik”.
  await wiersz.getByRole('button', { name: 'Opisz wynik' }).tap();
  const opis = page.locator('#labPendingDescribeDialog');
  await expect(opis).toBeVisible();
  for (const pole of ['#labPendingDescribeText', '#labPendingDescribeDate', '.vilda-lab-hist-describe-save']) {
    expect(await wEkranie(opis.locator(pole))).toBe(true);
    expect(await wysokosc(opis.locator(pole))).toBeGreaterThanOrEqual(44);
  }
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
  await opis.getByRole('button', { name: 'Anuluj' }).tap();
  await expect(opis).toHaveCount(0);

  // Jednostki lab.: pasek, znacznik w oknie przypięcia, komunikat po zamknięciu.
  await wiersz.locator('a.vilda-lab-hist-pending-enter').tap();
  await expect(page).toHaveURL(/\/przelicznik-jednostek\.html\?oczekujacy=/);
  const pasek = page.locator('#labPendingStrip');
  await expect(pasek.locator('.lab-pending-title')).toHaveText('Oczekujący wynik: Wynik: Biopsja tarczycy (BACC) · termin 01.12.26');
  expect(await wEkranie(pasek)).toBe(true);
  expect(await wysokosc(pasek.getByRole('button', { name: 'Odłącz' }))).toBeGreaterThanOrEqual(44);
  expect(await bezPrzewijaniaWBok(page)).toBe(true);

  await page.locator('#labSubstance').fill('TSH');
  await page.locator('#labSubstanceDropdown .lab-substance-option[data-id="tsh"]').tap();
  await page.locator('#labUnit').selectOption('mIU/L');
  await page.locator('#labValue').fill('2,5');
  await page.locator('#labPinResultBtn').tap();
  const znacznik = page.locator('#labPinOverlay .lab-pending-choice');
  await expect(znacznik.locator('#labPinPendingClose')).toBeChecked();
  expect(await wEkranie(znacznik)).toBe(true);
  expect(await wysokosc(znacznik.locator('.lab-pending-choice-label'))).toBeGreaterThanOrEqual(44);
  await page.locator('#labPinSave').tap();

  await expect(pasek).toHaveAttribute('role', 'status');
  await expect(pasek.locator('.lab-pending-text')).toHaveText('Oczekujący wynik „Wynik: Biopsja tarczycy (BACC)” oznaczony jako wykonany.');
  for (const przycisk of await pasek.locator('button').all()) {
    expect(await wEkranie(przycisk)).toBe(true);
    expect(await wysokosc(przycisk)).toBeGreaterThanOrEqual(44);
  }
  expect(await wEkranie(pasek)).toBe(true);
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
  expect((await page.evaluate((noteId) => window.VildaVault.getPatientNote(noteId), id)).completedAtISO).toBeTruthy();
});

// Etap 2: lista oczekujących wyników (wynik wpisany bez wejścia z „Badań”) w oknie przypięcia i w pakiecie.
test('telefon: lista oczekujących wyników w oknie przypięcia i w pakiecie — w ekranie, cele dotyku 44 px, bez przewijania w bok', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: false });
  await loadPatient(page, fixture.ids.b, 'restore');
  const nazwy = ['Kontrola TSH', 'Kontrola IGF-1', 'Wynik: Biopsja tarczycy (BACC)', 'Kontrola kortyzolu po teście z Synacthenem — poranna próbka', 'Kontrola fT4'];
  const ids = [];
  for (let i = 0; i < nazwy.length; i++) ids.push(await zalozOczekujacy(page, fixture.ids.b, nazwy[i], `2026-12-0${i + 1}`));
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });

  await page.locator('#labSubstance').fill('TSH');
  await page.locator('#labSubstanceDropdown .lab-substance-option[data-id="tsh"]').tap();
  await page.locator('#labUnit').selectOption('mIU/L');
  await page.locator('#labValue').fill('2,5');
  await page.locator('#labPinResultBtn').tap();

  const okno = page.locator('#labPinOverlay');
  const lista = okno.locator('#labPinPendingClose.lab-pending-list');
  await expect(lista.locator('.lab-pending-list-option')).toHaveCount(4);
  await lista.getByRole('button', { name: 'Pokaż pozostałe (2)' }).tap();
  await expect(lista.locator('.lab-pending-list-option')).toHaveCount(6);
  expect(await wEkranie(lista)).toBe(true);
  for (const opcja of await lista.locator('.lab-pending-list-option').all()) {
    expect(await wEkranie(opcja)).toBe(true);
    expect(await wysokosc(opcja)).toBeGreaterThanOrEqual(44);
  }
  // Długa nazwa łamie się w obrębie listy, a okno przewija się w środku — przyciski zapisu są osiągalne.
  expect(await lista.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await okno.evaluate((el) => el.firstElementChild.getBoundingClientRect().bottom <= window.innerHeight + 1)).toBe(true);
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
  await lista.getByRole('radio', { name: /^Kontrola kortyzolu/ }).check();
  await okno.locator('#labPinSave').scrollIntoViewIfNeeded();
  await okno.locator('#labPinSave').tap();

  const pasek = page.locator('#labPendingStrip');
  await expect(pasek.locator('.lab-pending-text')).toHaveText('Oczekujący wynik „Kontrola kortyzolu po teście z Synacthenem — poranna próbka” oznaczony jako wykonany.');
  expect(await wEkranie(pasek)).toBe(true);
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
  expect((await page.evaluate((noteId) => window.VildaVault.getPatientNote(noteId), ids[3])).completedAtISO).toBeTruthy();

  // Pakiet: ta sama lista nad paskiem zapisu.
  await page.locator('#labModePackage').tap();
  const wPakiecie = page.locator('#labPkgPending #labPkgPendingClose.lab-pending-list');
  await expect(wPakiecie.locator('.lab-pending-list-option')).toHaveCount(4);
  await wPakiecie.scrollIntoViewIfNeeded();
  expect(await wEkranie(wPakiecie)).toBe(true);
  for (const opcja of await wPakiecie.locator('.lab-pending-list-option').all()) expect(await wysokosc(opcja)).toBeGreaterThanOrEqual(44);
  expect(await wysokosc(wPakiecie.locator('.lab-pending-list-more'))).toBeGreaterThanOrEqual(44);
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
});
