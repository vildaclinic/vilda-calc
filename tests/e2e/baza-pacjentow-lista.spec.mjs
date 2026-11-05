import { expect, test } from '../support/test-czas.mjs';
import {
  BAZA, PICKER, LISTA, DRUGA_LISTA, przygotujBaze, otworzListe, sortuj, bezPrzewijaniaPoziomego, ustawSzerokoscBazy,
} from '../support/baza-pacjentow-lista.mjs';

// Testujemy rzeczywisty renderer, karty i wspólny vault powłoki. Każdy test ma
// własny efemeryczny profil i jednoznacznie fikcyjne rekordy.
test.use({ serviceWorkers: 'block' });
test.setTimeout(120_000);

test('desktop: źródła, wyszukiwanie i katalog Listy działają w jednym widoku Bazy', async ({ page }) => {
  const { frame, database, base, external, members } = await przygotujBaze(page);
  await database.locator('.pt-seg [data-filter="base"]').click();
  await expect(database.locator('.pt-row')).toHaveCount(20);
  await expect(database.locator(`.pt-row[data-patient-id="${base[0]}"]`)).toContainText('Kobieta');
  await expect(database.locator(`.pt-row[data-patient-id="${base[1]}"]`)).toContainText('Mężczyzna');
  await database.locator('.pt-seg [data-filter="ext"]').click();
  await expect(database.locator('.pt-row')).toHaveCount(4);
  expect(await database.locator('.pt-row').evaluateAll(nodes => nodes.map(node => node.dataset.patientId).sort())).toEqual([...external].sort());
  await database.locator('.pt-seg [data-filter="all"]').click();
  await database.locator('.pt-search input').fill('zolc');
  await expect(database.locator('.pt-row')).toHaveCount(1);
  await expect(database.locator('.pt-row')).toContainText('Fikcyjna Żółć Maria');
  await database.locator('.pt-search input').fill('');

  await database.locator('.pt-seg [data-filter="lists"]').click();
  await expect(frame.locator(PICKER), 'desktop nie otwiera drugiego okna do przeglądania list').toHaveCount(0);
  await expect(database.locator('.pl-tile:not(.pl-tile--new)')).toHaveCount(2);
  await expect(database.locator('.pt-seg').getByText('PRO', { exact: true })).toHaveCount(0);
  await expect(database.locator('.pt-scroll').getByText('PRO', { exact: true })).toHaveCount(0);
  await database.locator('.pt-search input').fill('druga');
  await expect(database.locator('.pl-tile:not(.pl-tile--new)')).toHaveCount(1);
  await expect(database.locator('.pl-tile:not(.pl-tile--new)')).toContainText(DRUGA_LISTA);
  await database.locator('.pt-search input').fill('');
  await database.locator('.pl-tile', { hasText: LISTA }).click();
  await expect(database.locator('.pt-count')).toHaveText(`Lista: ${LISTA}`);
  await expect(database.locator('.pt-row')).toHaveCount(18);
  expect(await database.locator('.pt-row').evaluateAll(nodes => nodes.map(node => node.dataset.patientId).sort())).toEqual([...members].sort());
  await database.locator('.pl-back').click();
  await expect(database.locator('.pl-tile:not(.pl-tile--new)')).toHaveCount(2);
  await database.locator('.pt-seg [data-filter="all"]').click();
  await expect(database.locator('.pt-row'), 'powrót do Wszyscy przywraca całą bazę, a nie ostatnią listę').toHaveCount(24);
  await bezPrzewijaniaPoziomego(page, frame);
});

test('powrót z kart bazowego i zewnętrznego pacjenta zachowuje listę, query, sortowanie i scroll', async ({ page }) => {
  const { frame, base, external } = await przygotujBaze(page);
  const database = await otworzListe(frame);
  await database.locator('.pt-search input').fill('Lista');
  await expect(database.locator('.pt-row')).toHaveCount(16);
  await sortuj(frame, 'name-desc');
  await expect.poll(() => database.locator('.pt-row').evaluateAll(nodes => nodes.map(node => node.dataset.patientId))).toEqual(base.slice(0, 16).reverse());
  const order = await database.locator('.pt-row').evaluateAll(nodes => nodes.map(node => node.dataset.patientId));
  const scroll = database.locator('.pt-scroll');
  await scroll.hover();
  await page.mouse.wheel(0, 420);
  await expect.poll(() => scroll.evaluate(node => node.scrollTop), { message: 'długa fikcyjna lista została rzeczywiście przewinięta' }).toBeGreaterThan(150);
  const before = await scroll.evaluate(async node => {
    // Zaczekaj na klatki kończące zwykły scroll przed zapamiętaniem pozycji.
    await new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
    const bounds = node.getBoundingClientRect();
    const visible = [...node.querySelectorAll('.pt-row')].filter(row => {
      const rect = row.getBoundingClientRect();
      return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
    });
    return { scrollTop: node.scrollTop, patientId: visible[1]?.dataset.patientId };
  });
  expect(before.patientId, 'klikamy widoczny wiersz bez dodatkowego przewinięcia przez Playwright').toBeTruthy();
  await database.locator(`.pt-row[data-patient-id="${before.patientId}"] .pt-row-open`).click();
  await expect(frame.locator(BAZA)).toHaveCount(0);
  await frame.locator('[data-patients-return]').click();
  await expect(database.locator('.pt-count')).toHaveText(`Lista: ${LISTA}`);
  await expect(database.locator('.pt-search input')).toHaveValue('Lista');
  await expect.poll(() => database.locator('.pt-row').evaluateAll(nodes => nodes.map(node => node.dataset.patientId))).toEqual(order);
  await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBe(before.scrollTop);

  // Zewnętrzny rekord ma inny renderer karty, ale ten sam kontrakt powrotu.
  await database.locator('.pt-search input').fill('Spoza');
  await expect(database.locator('.pt-row')).toHaveCount(2);
  const externalOrder = await database.locator('.pt-row').evaluateAll(nodes => nodes.map(node => node.dataset.patientId));
  await database.locator(`.pt-row[data-patient-id="${external[0]}"] .pt-row-open`).click();
  await expect(frame.locator(BAZA)).toHaveCount(0);
  await frame.locator('[data-patients-return]').click();
  await expect(database.locator('.pt-count')).toHaveText(`Lista: ${LISTA}`);
  await expect(database.locator('.pt-search input')).toHaveValue('Spoza');
  await expect.poll(() => database.locator('.pt-row').evaluateAll(nodes => nodes.map(node => node.dataset.patientId))).toEqual(externalOrder);
});

test('telefon i granica jednej kolumny: picker, wybrana lista i szkic edycji przetrwają zmianę szerokości', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { frame, database } = await przygotujBaze(page);
  await expect(database.locator('.pt-seg [data-filter="lists"]')).toBeHidden();
  await database.locator('.pt-lists-trigger').click();
  const picker = frame.locator(PICKER);
  await expect(picker).toBeVisible();
  await picker.locator('.pt-picker-search input, input.pt-picker-search').fill('kontroli');
  await expect(picker.locator('.pl-tile:not(.pl-tile--new)')).toHaveCount(1);
  await picker.locator('.pl-tile', { hasText: LISTA }).click();
  await expect(picker).toHaveCount(0);
  await expect(database.locator('.pt-count')).toHaveText(`Lista: ${LISTA}`);
  await expect(database.locator('.pt-row')).toHaveCount(18);
  await bezPrzewijaniaPoziomego(page, frame);

  await database.locator('.pl-back').click();
  await expect(picker).toBeVisible();
  await page.goBack();
  await expect(picker).toHaveCount(0);
  await expect(database.locator('.pt-row'), 'systemowy Wstecz zamyka picker i odrysowuje całą bazę').toHaveCount(24);
  await expect(database.locator('.pt-seg [data-filter="all"]')).toHaveAttribute('aria-pressed', 'true');
  await otworzListe(frame);
  await expect(database.locator('.pt-row')).toHaveCount(18);

  for (const width of [658, 991, 992, 1440, 390]) {
    await ustawSzerokoscBazy(page, frame, width);
    await expect(database.locator('.pt-count')).toHaveText(`Lista: ${LISTA}`);
    await expect(database.locator('.pt-row')).toHaveCount(18);
    await expect(picker).toHaveCount(0);
    if (width >= 992) await expect(database.locator('.pt-seg [data-filter="lists"]')).toBeVisible();
    else await expect(database.locator('.pt-seg [data-filter="lists"]')).toBeHidden();
    await bezPrzewijaniaPoziomego(page, frame);
  }
  await ustawSzerokoscBazy(page, frame, 1440);
  await database.locator('.pt-seg [data-filter="lists"]').click();
  await expect(database.locator('.pt-search input')).toHaveValue('kontroli');
  await database.locator('.pt-search input').fill('');
  await expect(database.locator('.pl-tile:not(.pl-tile--new)')).toHaveCount(2);
  await ustawSzerokoscBazy(page, frame, 991);
  await expect(picker).toBeVisible();
  await ustawSzerokoscBazy(page, frame, 992);
  await expect(picker).toHaveCount(0);
  await expect(database.locator('.pl-tile:not(.pl-tile--new)')).toHaveCount(2);
  await database.locator('.pl-tile', { hasText: LISTA }).click();
  await expect(database.locator('.pt-count')).toHaveText(`Lista: ${LISTA}`);
  await database.locator('.pl-edit').click();
  const editor = frame.locator('.vilda-pl-modal');
  const name = editor.locator('input[placeholder="np. Wegovy / Ciekawa tarczyca"]');
  await expect(editor).toBeVisible();
  await name.fill('Fikcyjny niezapisany szkic E2E');
  for (const width of [390, 992, 1440]) {
    await ustawSzerokoscBazy(page, frame, width);
    await expect(editor).toBeVisible();
    await expect(name).toHaveValue('Fikcyjny niezapisany szkic E2E');
    await expect(picker, 'zmiana układu nie zastępuje formularza pickerem').toHaveCount(0);
  }
  await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(database.locator('.pt-count')).toHaveText(`Lista: ${LISTA}`);
});

test('usunięcie etykiety PRO z Listy nie usuwa wymagania aktywnego dostępu', async ({ page }) => {
  const { frame, database } = await przygotujBaze(page);
  await frame.evaluate(() => {
    window.VildaProAccess.__setTokenModeForTest(false);
    window.VildaProAccess.setPlan('free');
  });
  await expect.poll(() => frame.evaluate(() => window.VildaProAccess.hasAccess())).toBe(false);
  await database.locator('.pt-seg [data-filter="lists"]').click();
  await expect(database.locator('.pl-tile:not(.pl-tile--new)')).toHaveCount(0);
  await expect(database.locator('.pt-scroll')).toContainText(/pakietu PRO|funkcja PRO|Aktywuj PRO/);
  await frame.evaluate(() => window.VildaProAccess.setPlan('pro', '2099-12-31T23:59:59.000Z'));
  await database.locator('.pt-seg [data-filter="all"]').click();
  await database.locator('.pt-seg [data-filter="lists"]').click();
  await expect(database.locator('.pl-tile:not(.pl-tile--new)')).toHaveCount(2);
  await expect(database.locator('.pt-seg').getByText('PRO', { exact: true })).toHaveCount(0);
  await expect(database.locator('.pt-scroll').getByText('PRO', { exact: true })).toHaveCount(0);
});

test('odświeżenie katalogu i anulowanie dodawania nie zastępują pustego wyszukiwania list zapytaniem pacjentów', async ({ page }) => {
  const { frame, database, otherListId } = await przygotujBaze(page);
  await database.locator('.pt-search input').fill('Anna');
  await expect(database.locator('.pt-row')).toHaveCount(14);
  await database.locator('.pt-seg [data-filter="lists"]').click();
  await expect(database.locator('.pt-search input')).toHaveValue('');
  await expect(database.locator('.pl-tile')).toHaveCount(2);

  const changedName = `${DRUGA_LISTA} — odświeżona`;
  await frame.evaluate(async ({ id, name }) => {
    const list = await window.VildaVault.getPatientList(id);
    await window.VildaVault.savePatientList({ ...list, name });
    document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false }));
  }, { id: otherListId, name: changedName });
  // Nowa nazwa potwierdza zakończenie rzeczywistego odczytu; sama obecność
  // starego katalogu mogłaby dać fałszywie zielony wynik przed debounce sync.
  await expect(database.locator('.pl-tile', { hasText: changedName })).toBeVisible();
  await expect(database.locator('.pt-search input')).toHaveValue('');
  await expect(database.locator('.pl-tile')).toHaveCount(2);

  await database.locator('.pt-add').click();
  await expect(frame.locator(BAZA)).toHaveCount(0);
  await frame.locator('#vilda-auth-ui-root').getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(database.locator('.pl-tile', { hasText: changedName })).toBeVisible();
  await expect(database.locator('.pt-search input')).toHaveValue('');
  await expect(database.locator('.pl-tile')).toHaveCount(2);
  await database.locator('.pt-seg [data-filter="all"]').click();
  await expect(database.locator('.pt-search input'), 'zapytanie pacjentów ma osobny zachowany kontekst').toHaveValue('Anna');
  await expect(database.locator('.pt-row')).toHaveCount(14);
});

test('telefon: synchronizacja podczas otwartego pickera pozostawia wybór i odświeża bazę po zamknięciu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { frame, database } = await przygotujBaze(page);
  await database.locator('.pt-lists-trigger').click();
  const picker = frame.locator(PICKER);
  await expect(picker).toBeVisible();
  await picker.locator('input.pt-picker-search').fill('druga');
  await expect(picker.locator('.pl-tile')).toHaveCount(1);
  const added = await frame.evaluate(async () => {
    const patient = await window.VildaVault.saveExternalPatient({
      firstName: 'Testowa', lastName: 'Fikcyjna Synchronizacja E2E', birthYear: 2016,
    });
    document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false }));
    return patient.patientId;
  });
  // Sygnał musi trafić do odświeżania, gdy picker nadal blokuje widok.
  // Produkcyjny debounce ma 250 ms; natychmiastowe zamknięcie omijałoby regresję.
  await page.waitForTimeout(700);
  await expect(picker).toBeVisible();
  await expect(picker.locator('input.pt-picker-search')).toHaveValue('druga');
  await expect(picker.locator('.pl-tile')).toHaveCount(1);
  await picker.locator('.pl-edit').click();
  const editor = frame.locator('.vilda-pl-modal');
  const draft = editor.locator('input[placeholder="np. Wegovy / Ciekawa tarczyca"]');
  await expect(editor).toBeVisible();
  await draft.fill('Fikcyjny szkic podczas synchronizacji');
  // Otwarty edytor nadal blokuje odłożoną synchronizację. Nie wolno odłączyć
  // jego kontekstu powrotu, gdy picker został zastąpiony formularzem listy.
  await page.waitForTimeout(700);
  await expect(editor).toBeVisible();
  await expect(draft).toHaveValue('Fikcyjny szkic podczas synchronizacji');
  await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(picker).toBeVisible();
  await expect(picker.locator('input.pt-picker-search')).toHaveValue('druga');
  await picker.getByRole('button', { name: 'Zamknij listy', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(database.locator('.pt-row'), 'odłożona synchronizacja nie zostawia starego zestawu 24 osób').toHaveCount(25);
  await expect(database.locator(`.pt-row[data-patient-id="${added}"]`)).toHaveCount(1);
});

test('zmiana członkostwa zapisuje ręczną listę, a zdjęcie członka automatycznego zapisuje wykluczenie', async ({ page }) => {
  const { frame, base, listId, members } = await przygotujBaze(page);
  const database = await otworzListe(frame);
  await database.getByRole('button', { name: '+ Dodaj pacjentów', exact: true }).click();
  await database.locator(`.pt-row[data-patient-id="${base[18]}"] .pl-cb`).check();
  await database.locator('.pl-confirm-add').click();
  await expect(database.locator('.pt-row')).toHaveCount(19);
  await expect.poll(() => frame.evaluate(async id => (await window.VildaVault.getPatientList(id)).memberIds.sort(), listId)).toEqual([...members, base[18]].sort());
  page.once('dialog', dialog => dialog.accept());
  await database.locator(`.pt-row[data-patient-id="${base[18]}"] .pl-rm`).click();
  await expect(database.locator('.pt-row')).toHaveCount(18);
  await expect.poll(() => frame.evaluate(async id => (await window.VildaVault.getPatientList(id)).memberIds.sort(), listId)).toEqual([...members].sort());

  // Wpis lekowy tylko kotwiczy istniejącą produkcyjną regułę członkostwa.
  // Nie dodajemy dawki, obliczeń ani kopii reguły w teście.
  const automatic = await frame.evaluate(async patientId => {
    await window.VildaVault.savePatientNote({
      patientId, title: 'Fikcyjny lek E2E', body: 'Fikcyjny wpis testu członkostwa.',
      category: 'treatment', clinicalDateISO: '2026-05-01',
      medication: { name: 'Fikcyjny lek E2E', action: 'start' },
    });
    const list = await window.VildaVault.savePatientList({
      name: 'Fikcyjna automatyczna lista E2E', memberIds: [],
      rule: { type: 'medication', value: 'Fikcyjny lek E2E', scope: 'active' },
    });
    const result = await window.VildaVault.getPatientListMembers(list.id);
    document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false }));
    return { id: list.id, name: list.name, result };
  }, base[0]);
  expect(automatic.result.memberIds).toEqual([base[0]]);
  expect(automatic.result.viaRule[base[0]], 'fixture naprawdę pochodzi z reguły, a nie ręcznego dopisania').toBe(true);
  await database.locator('.pt-seg [data-filter="lists"]').click();
  await database.locator('.pl-tile', { hasText: automatic.name }).click();
  await expect(database.locator('.pt-row')).toHaveCount(1);
  let confirmationText = '';
  page.once('dialog', async dialog => { confirmationText = dialog.message(); await dialog.accept(); });
  await database.locator(`.pt-row[data-patient-id="${base[0]}"] .pl-rm`).click();
  expect(confirmationText).toContain('wykluczenie');
  await expect(database.locator('.pt-row')).toHaveCount(0);
  const saved = await frame.evaluate(async id => {
    const list = await window.VildaVault.getPatientList(id);
    return { excludeIds: list.excludeIds, members: await window.VildaVault.getPatientListMembers(id), matchingRule: [...await window.VildaVault.evaluatePatientListRule(list.rule)] };
  }, automatic.id);
  expect(saved.excludeIds).toContain(base[0]);
  expect(saved.members.memberIds).toEqual([]);
  expect(saved.matchingRule, 'reguła nadal pasuje; brak osoby wynika z zapisanego wykluczenia').toEqual([base[0]]);
  await database.locator('.pt-seg [data-filter="all"]').click();
  await database.locator('.pt-seg [data-filter="lists"]').click();
  await database.locator('.pl-tile', { hasText: automatic.name }).click();
  await expect(database.locator('.pt-row')).toHaveCount(0);
});
