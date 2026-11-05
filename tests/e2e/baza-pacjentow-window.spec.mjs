import { expect, test } from '../support/test-czas.mjs';

// The production renderer above a deterministic read adapter. Integration with
// the encrypted vault and patient cards remains in baza-pacjentow-lista.
async function openRenderer(page, { count = 870, slowLists = false } = {}) {
  await page.route('**/__patients-renderer.html', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="pl"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/vilda_auth_ui.css"><link rel="stylesheet" href="/vilda_patients_list.css"></head><body><div class="vilda-auth-root vilda-auth-database" style="display:block"><div class="vilda-auth-overlay"><div class="vilda-auth-card" id="host"></div></div></div><script src="/vilda_patients_list.js"></script></body></html>` }));
  await page.goto('/__patients-renderer.html');
  await page.evaluate(({ count, slowLists }) => {
    const patients = Array.from({ length: count }, (_, index) => ({ patientId: `fictional-${index}`, __ext: index % 5 === 0,
      header: { name: `Fikcyjny Pacjent ${String(index).padStart(4, '0')}${index % 11 === 0 ? ' Bardzo Długie Dwuczłonowe Nazwisko Testowe' : ''}` }, lastSavedAtISO: '2026-11-01T10:00:00.000Z' }));
    let described = 0;
    const membership = { manual: [], automatic: [patients[0].patientId] };
    const calls = {}, changed = [];
    let resolveAutomatic;
    const automatic = slowLists ? new Promise(resolve => { resolveAutomatic = resolve; }) : Promise.resolve({ count: 1, memberIds: membership.automatic });
    const lists = [{ id: 'manual', name: 'Fikcyjna ręczna', memberIds: [] }, { id: 'automatic', name: 'Fikcyjna automatyczna', rule: { type: 'gh' } }];
    const vault = {
      listPatientLists: async () => lists,
      getPatientListMembers: async list => {
        calls[list.id] = (calls[list.id] || 0) + 1;
        return list.id === 'automatic' ? automatic : { count: membership.manual.length, memberIds: membership.manual.slice() };
      },
      addPatientToList: async (id, patientId) => { membership[id].push(patientId); changed.push(patientId); },
      removePatientFromList: async (id, patientId) => { membership[id] = membership[id].filter(value => value !== patientId); },
    };
    const opts = { patients, vault, hasListAccess: () => true, initialState: { focused: false },
      describePatient: () => { described += 1; return { birth: '15.01.2016', birthHint: '', age: '10 lat', sex: 'Kobieta' }; },
      onOpenPatient: patient => { window.openedPatient = patient.patientId; },
      sortPatients: (rows, sort) => rows.slice().sort((a, b) => a.header.name.localeCompare(b.header.name, 'pl') * (sort === 'name-desc' ? -1 : 1)),
      onHome: () => { window.homePressed = true; },
    };
    const view = window.VildaPatientsList.create(opts);
    window.beforeMountDescriptions = described;
    document.getElementById('host').appendChild(view.root); view.mount();
    window.harness = { view, opts, calls, changed, described: () => described, resolveAutomatic };
  }, { count, slowLists });
  await expect(page.locator('.pt-count')).toHaveText(`Wyświetlono: ${count}`);
}

async function firstVisible(page) {
  return page.locator('.pt-scroll').evaluate(node => {
    const top = node.getBoundingClientRect().top;
    const row = [...node.querySelectorAll('.pt-row')].find(value => value.getBoundingClientRect().bottom > top);
    return { id: row?.dataset.patientId, offset: row?.getBoundingClientRect().top - top, scrollTop: node.scrollTop };
  });
}

test('870 osób: pojedynczy montaż, mały DOM, wyszukiwanie i sort obejmują całą bazę', async ({ page }) => {
  await openRenderer(page);
  expect(await page.evaluate(() => window.beforeMountDescriptions)).toBe(0);
  expect(await page.evaluate(() => window.harness.described())).toBeLessThan(60);
  expect(await page.locator('.pt-row').count()).toBeLessThan(60);
  await expect(page.locator('.pt-row').first()).toHaveAttribute('aria-setsize', '870');
  await page.locator('.pt-search input').fill('0869');
  await expect(page.locator('.pt-row')).toHaveCount(1);
  await expect(page.locator('.pt-row')).toHaveAttribute('data-patient-id', 'fictional-869');
  await page.locator('.pt-row-open').click();
  expect(await page.evaluate(() => window.openedPatient)).toBe('fictional-869');
  await page.locator('.pt-search input').fill('');
  await page.locator('.pt-sortpill').click();
  await page.locator('[data-s="name-desc"]').click();
  await expect(page.locator('.pt-row').first()).toHaveAttribute('data-patient-id', 'fictional-869');
  expect(await page.locator('.pt-row').count()).toBeLessThan(60);
});

test('wirtualne wiersze zachowują kotwicę powrotu i pełną nawigację klawiaturą', async ({ page }) => {
  await openRenderer(page);
  await page.locator('.pt-row-open').first().focus();
  await page.evaluate(() => {
    const { view, opts } = window.harness, initialState = window.harness.view.read();
    view.destroy(); view.root.remove(); window.harness.view = window.VildaPatientsList.create({ ...opts, initialState });
    document.getElementById('host').appendChild(window.harness.view.root); window.harness.view.mount();
  });
  await expect.poll(() => page.locator('.pt-scroll').evaluate(node => node.scrollTop)).toBe(0);
  await expect(page.locator('.pt-row').first().locator('.pt-row-open')).toBeFocused();
  for (let index = 0; index < 65; index += 1) await page.keyboard.press('Tab');
  await expect(page.locator('.pt-row[data-patient-id="fictional-65"] .pt-row-open')).toBeFocused();
  expect(await page.locator('.pt-row').count()).toBeLessThan(60);
  await page.keyboard.press('End');
  await expect(page.locator('.pt-row[data-patient-id="fictional-869"] .pt-row-open')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.locator('.pt-row[data-patient-id="fictional-0"] .pt-row-open')).toBeFocused();
  await page.locator('.pt-search input').focus();
  await page.locator('.pt-scroll').evaluate(node => { node.scrollTop = 30000; });
  await expect.poll(async () => (await firstVisible(page)).scrollTop).toBeGreaterThan(20000);
  await page.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
  const before = await firstVisible(page);
  await page.locator(`.pt-row[data-patient-id="${before.id}"] .pt-row-open`).evaluate(node => node.focus({ preventScroll: true }));
  await page.evaluate(() => {
    const { view, opts } = window.harness;
    const initialState = view.read();
    view.destroy(); view.root.remove();
    window.harness.view = window.VildaPatientsList.create({ ...opts, initialState });
    document.getElementById('host').appendChild(window.harness.view.root); window.harness.view.mount();
  });
  await expect.poll(async () => (await firstVisible(page)).id).toBe(before.id);
  await expect.poll(async () => Math.abs((await firstVisible(page)).offset - before.offset)).toBeLessThan(1);
  await expect(page.locator(`.pt-row[data-patient-id="${before.id}"] .pt-row-open`)).toBeFocused();
  expect(await page.locator('.pt-row').count()).toBeLessThan(60);
});

test('kotwica nie przenosi się na inną listę; mały wynik i zmiana szerokości nie psują dużej bazy', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openRenderer(page);
  await page.locator('.pt-search input').fill('0869');
  await expect(page.locator('.pt-row')).toHaveCount(1);
  await page.evaluate(() => {
    const { view, opts } = window.harness;
    const initialState = view.read(); view.destroy(); view.root.remove();
    window.harness.view = window.VildaPatientsList.create({ ...opts, initialState });
    document.getElementById('host').appendChild(window.harness.view.root); window.harness.view.mount();
  });
  await page.locator('.pt-search input').fill('');
  await expect(page.locator('.pt-count')).toHaveText('Wyświetlono: 870');
  await page.locator('.pt-search input').focus();
  await page.locator('.pt-scroll').evaluate(node => { node.scrollTop = 20000; });
  await page.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
  let before = await firstVisible(page);
  for (const width of [390, 700, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(async () => (await firstVisible(page)).id).toBe(before.id);
    before = await firstVisible(page);
    expect(await page.locator('.pt-row').count()).toBeLessThan(60);
  }
  // Returning with an initial anchor must consume it exactly once. A subsequent
  // choice of another list starts at that list's own beginning.
  await page.evaluate(() => {
    const { view, opts } = window.harness;
    const initialState = view.read(); view.destroy(); view.root.remove();
    window.harness.view = window.VildaPatientsList.create({ ...opts, initialState });
    document.getElementById('host').appendChild(window.harness.view.root); window.harness.view.mount();
  });
  await expect.poll(async () => (await firstVisible(page)).id).toBe(before.id);
  await page.locator('[data-filter="lists"]').click();
  await page.locator('.pl-tile[data-list-id="automatic"]').click();
  await expect(page.locator('.pt-row')).toHaveCount(1);
  await expect.poll(() => page.locator('.pt-scroll').evaluate(node => node.scrollTop)).toBe(0);
  expect(errors).toEqual([]);
});

test('mobile: pełne dane, długie nazwiska i koniec bazy bez ucinania; powrót po obu stronach 700 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRenderer(page);
  await expect(page.locator('.pt-row').first().locator('.pt-meta')).toHaveText('ur. 15.01.201610 latKobieta');
  await expect(page.locator('.pt-saved').first()).toBeHidden();
  await expect(page.locator('.pt-badge').first()).toBeHidden();
  for (const width of [320, 699, 700]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('.pt-home')).toBeVisible();
    expect(await page.locator('.vilda-patient-database').evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.locator('.pt-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(page.locator('.pt-row[data-patient-id="fictional-869"]')).toBeVisible();
  await expect(page.locator('.pt-row[data-patient-id="fictional-869"] .pt-person-name')).toHaveText('Fikcyjny Pacjent 0869 Bardzo Długie Dwuczłonowe Nazwisko Testowe');
  expect(await page.locator('.pt-row').count()).toBeLessThan(60);
  await page.locator('.pt-home').click();
  expect(await page.evaluate(() => window.homePressed)).toBe(true);
});

test('Listy: nazwy i lista ręczna nie czekają na wolną regułę, licznik współdzieli odczyt z otwarciem', async ({ page }) => {
  await openRenderer(page, { slowLists: true });
  await page.locator('[data-filter="lists"]').click();
  await expect(page.locator('.pl-tile')).toHaveCount(2);
  await expect(page.locator('.pl-heading')).toHaveCount(0);
  const automatic = page.locator('.pl-tile[data-list-id="automatic"]');
  await expect(automatic.locator('.pl-num')).toHaveText('…');
  await expect(page.locator('.pl-tile[data-list-id="manual"] .pl-num')).toHaveText('0 osób');
  await page.locator('.pl-tile[data-list-id="manual"]').click();
  await expect(page.locator('.pt-count')).toHaveText('Lista: Fikcyjna ręczna');
  await expect(page.locator('.pt-empty')).toContainText('Lista jest pusta');
  expect(await page.evaluate(() => window.harness.calls.manual)).toBe(1);
  await page.locator('.pl-back').click();
  await expect(automatic.locator('.pl-num')).toHaveText('…');
  await page.evaluate(() => window.harness.resolveAutomatic({ count: 1, memberIds: ['fictional-0'] }));
  await expect(automatic.locator('.pl-num')).toHaveText('1 osoba');
  await automatic.click();
  await expect(page.locator('.pt-row')).toHaveCount(1);
  expect(await page.evaluate(() => window.harness.calls.automatic)).toBe(1);
});

test('zaznaczenia do listy pozostają po wyszukiwaniu i zmianie okna wirtualnych wierszy', async ({ page }) => {
  await openRenderer(page);
  await page.locator('[data-filter="lists"]').click();
  await page.locator('.pl-tile[data-list-id="manual"]').click();
  await page.getByRole('button', { name: '+ Dodaj pacjentów', exact: true }).click();
  await page.locator('.pt-row[data-patient-id="fictional-0"] input').check();
  await page.locator('.pt-search input').fill('0869');
  await page.locator('.pt-row[data-patient-id="fictional-869"] input').check();
  await expect(page.locator('.pl-confirm-add')).toHaveText('Dodaj (2)');
  await page.locator('.pt-search input').fill('');
  await expect(page.locator('.pt-row[data-patient-id="fictional-0"] input')).toBeChecked();
  await page.locator('.pl-confirm-add').click();
  await expect(page.locator('.pt-row')).toHaveCount(2);
  expect(await page.evaluate(() => window.harness.changed)).toEqual(['fictional-0', 'fictional-869']);
});

test('opóźniona klatka starego widoku nie zeruje przewinięcia po nowym wyszukiwaniu', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame;
    const queued = [];
    window.requestAnimationFrame = callback => { queued.push(callback); return queued.length; };
    window.releaseQueuedFrames = () => {
      window.requestAnimationFrame = original;
      queued.splice(0).forEach(callback => callback(performance.now()));
    };
  });
  await openRenderer(page, { count: 24 });
  const before = await page.evaluate(() => {
    const input = document.querySelector('.pt-search input'), scroll = document.querySelector('.pt-scroll');
    input.value = 'Fikcyjny'; input.dispatchEvent(new Event('input', { bubbles: true }));
    scroll.scrollTop = 180;
    return scroll.scrollTop;
  });
  expect(before).toBe(180);
  await page.evaluate(() => window.releaseQueuedFrames());
  expect(await page.locator('.pt-scroll').evaluate(node => node.scrollTop)).toBe(before);
});

test('stan początkowego wczytywania zachowuje aktywny powrót', async ({ page }) => {
  await openRenderer(page, { count: 1 });
  await page.evaluate(() => {
    window.harness.view.destroy(); window.harness.view.root.remove();
    const view = window.VildaPatientsList.createLoading({ onHome: () => { window.homePressed = true; } });
    document.getElementById('host').appendChild(view.root); view.mount();
  });
  await expect(page.locator('.vilda-patient-database')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.pt-loading')).toBeVisible();
  await expect(page.locator('.pt-list-footer')).toBeHidden();
  await page.locator('.pt-home').click();
  expect(await page.evaluate(() => window.homePressed)).toBe(true);
});
