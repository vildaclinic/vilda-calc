import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);
const CARD = '#remindersInline';
const TITLE = 'Fikcyjna kontrola przypomnień';

async function open(page) {
  await page.addInitScript(() => {
    const day = new Date().toLocaleDateString('sv');
    localStorage.setItem('vilda-reminders-shown-v1', day + '|' + Date.now());
    localStorage.setItem('vilda-reminders-closed-v1', day + '|' + Date.now());
  });
  const created = await createFictionalVault(page);
  const notes = await page.evaluate(async ({ ids, title }) => {
    const day = new Date().toLocaleDateString('sv'), result = [];
    for (let n = 0; n < 2; n++) result.push((await window.VildaVault.savePatientNote({
      patientId: ids.a, title: title + ' ' + (n + 1), category: 'followup', dueDateISO: day,
    })).id);
    return result;
  }, { ids: created.ids, title: TITLE });
  await expect(page.locator(`${CARD} .vild-rem-row`)).toHaveCount(2);
  await expect(page.locator('#vildaRemindersBtn')).toHaveAttribute('data-count', '2');
  await page.evaluate(() => {
    const native = window.VildaVault.listPatientNotesDueByDate;
    const state = { fault: false, hold: false, holdSheet: false, calls: [], waiting: [], active: new Set(), paints: 0 };
    window.__reminderTest = state;
    new MutationObserver(changes => { for (const change of changes) state.paints += [...change.addedNodes].filter(node => node.classList?.contains('vild-rem-card')).length; })
      .observe(document.getElementById('remindersInline'), { childList: true });
    window.VildaVault.listPatientNotesDueByDate = function (...args) {
      const stack = new Error().stack || '';
      const inline = /\bBr\b/.test(stack);
      state.calls.push({ inline });
      let pending;
      if (state.hold && inline || state.holdSheet && /\btn\b/.test(stack)) pending = new Promise((resolve, reject) => { state.waiting.push({ resolve, reject }); });
      else if (state.fault) pending = Promise.reject(Error('FIKCYJNY_BŁĄD_ODCZYTU'));
      else pending = Promise.resolve(native.apply(this, args));
      state.active.add(pending);
      pending.finally(() => state.active.delete(pending)).catch(() => {});
      return pending;
    };
  });
  await settle(page);
  return { ...created, notes };
}

async function settle(page) {
  await page.evaluate(async () => {
    const frame = () => new Promise(resolve => { requestAnimationFrame(resolve); });
    await frame(); await frame();
    while (window.__reminderTest?.active.size) await Promise.allSettled([...window.__reminderTest.active]);
    await frame(); await frame();
  });
}

test('błąd odczytu nie udaje pustej listy; ponowienie przywraca kartę i licznik', async ({ page }) => {
  const { notes } = await open(page);
  await page.evaluate(async () => {
    window.__reminderTest.fault = true;
    await window.VildaAuthUI.renderRemindersInline(document.getElementById('remindersInline'));
    window.VildaChrome.refreshRemindersBtn();
  });
  const card = page.locator(CARD), badge = page.locator('#vildaRemindersBtn');
  await expect(card).toHaveAttribute('data-reminders-state', 'error');
  await expect(card.getByRole('alert')).toContainText('Nie udało się wczytać przypomnień');
  await expect(card).not.toContainText('Brak przypomnień na dziś');
  await expect(badge).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#vildaRemindersBadge')).toHaveText('?');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('vilda-reminders-count-v1')).count)).toBe(2);
  await page.screenshot({ path: test.info().outputPath('reminders-read-error.png') });
  await page.evaluate(() => { window.__reminderTest.fault = false; });
  await card.getByRole('button', { name: 'Spróbuj ponownie', exact: true }).click();
  await expect(card.locator('.vild-rem-row')).toHaveCount(2);
  await expect(card).toHaveAttribute('data-reminders-state', 'ready');
  await expect(badge).toHaveAttribute('data-state', 'today');
  await expect(page.locator('#vildaRemindersBadge')).toHaveText('2');
  // A real empty list still has its distinct, successful state.
  await page.evaluate(async notes => { for (const id of notes) await window.VildaVault.completePatientNote(id); }, notes);
  await expect(card).toContainText('Brak przypomnień na dziś');
  await expect(card).toHaveAttribute('data-reminders-state', 'ready');
  await expect(badge).toHaveAttribute('data-state', 'empty');
});

test('starsza odpowiedź i starszy błąd nie zastępują nowszych przypomnień', async ({ page }) => {
  await open(page);
  for (const completion of ['resolve', 'reject']) {
    await page.evaluate(() => {
      const state = window.__reminderTest; state.hold = true; state.waiting = [];
      const host = document.getElementById('remindersInline');
      state.older = window.VildaAuthUI.renderRemindersInline(host);
      state.newer = window.VildaAuthUI.renderRemindersInline(host);
    });
    await expect.poll(() => page.evaluate(() => window.__reminderTest.waiting.length)).toBe(2);
    await page.evaluate(async () => {
      const state = window.__reminderTest;
      state.waiting[1].resolve([{ patientId: 'fictional-snapshot', patientName: 'Nowszy Fikcyjny', notes: [{ id: 'fictional-note', title: 'NOWSZA LISTA', category: 'followup', dueDateISO: new Date().toLocaleDateString('sv') }] }]);
      await state.newer;
    });
    await expect(page.locator(CARD)).toContainText('NOWSZA LISTA');
    await page.evaluate(async completion => {
      const state = window.__reminderTest;
      if (completion === 'reject') state.waiting[0].reject(Error('FIKCYJNY_STARSZY_BŁĄD'));
      else state.waiting[0].resolve([]);
      await state.older; state.hold = false;
    }, completion);
    await expect(page.locator(CARD)).toContainText('NOWSZA LISTA');
    await expect(page.locator(CARD)).toHaveAttribute('data-reminders-state', 'ready');
  }
});

test('jedna akcja wykonania daje jeden odczyt i jedną przebudowę karty', async ({ page }) => {
  const { notes } = await open(page);
  await page.locator(`${CARD} .vild-rem-row`).filter({ hasText: TITLE + ' 1' }).click();
  await page.evaluate(() => { window.__reminderTest.calls = []; window.__reminderTest.paints = 0; });
  await page.locator('dialog.vb22-modal').getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  await page.locator('dialog.vb22-outcome').getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click();
  await expect.poll(() => page.evaluate(async id => !!(await window.VildaVault.getPatientNote(id)).completedAtISO, notes[0])).toBe(true);
  await expect(page.locator(`${CARD} .vild-rem-row`)).toHaveCount(1);
  await expect(page.locator('#vildaRemindersBtn')).toHaveAttribute('data-count', '1');
  await settle(page);
  const result = await page.evaluate(() => ({ reads: window.__reminderTest.calls.filter(call => call.inline).length, paints: window.__reminderTest.paints }));
  expect(result).toEqual({ reads: 1, paints: 0 }); // B2.2 updates content without remounting the card root.
});

test('zmiana rozmiaru zachowuje wiersze i nie odczytuje ponownie notatek', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__reminderTest.calls = []; window.__reminderTest.paints = 0; });
  for (const width of [1320, 1440, 1280]) { await page.setViewportSize({ width, height: 1000 }); await settle(page); }
  const result = await page.evaluate(() => ({ reads: window.__reminderTest.calls.filter(call => call.inline).length, paints: window.__reminderTest.paints }));
  expect(result).toEqual({ reads: 0, paints: 0 });
  await expect(page.locator(`${CARD} .vild-rem-row`)).toHaveCount(2);
});

test('widoczna siatka zatrzymuje odczyty ukrytej karty; po wyczyszczeniu formularza przypomnienia wracają', async ({ page }) => {
  const { ids } = await open(page);
  await loadPatient(page, ids.a, 'new');
  await expect(page.locator('svg.vilda-centile-live-preview')).toBeVisible({ timeout: 30_000 });
  await settle(page);
  await page.evaluate(() => {
    window.__reminderTest.calls = [];
    window.__vildaRemindersResync();
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new CustomEvent('vilda:sync-merged'));
  });
  await settle(page);
  expect(await page.evaluate(() => window.__reminderTest.calls.filter(call => call.inline).length)).toBe(0);
  await expect(page.locator(CARD)).toBeHidden();
  await page.evaluate(() => window.clearAllData());
  await expect(page.locator(`${CARD} .vild-rem-row`)).toHaveCount(2);
  await expect(page.locator(CARD)).toBeVisible();
});

test('dzwonek pozwala ponowić nieudany odczyt pełnej listy', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__reminderTest.fault = true; });
  await page.locator('#vildaRemindersBtn').click();
  const error = page.getByRole('dialog', { name: 'Błąd wczytywania przypomnień', exact: true });
  await expect(error).toBeVisible();
  await expect(error).toContainText('Nie udało się wczytać przypomnień');
  await page.evaluate(() => { window.__reminderTest.fault = false; });
  await error.getByRole('button', { name: 'Spróbuj ponownie', exact: true }).click();
  await expect(error).toHaveCount(0);
  await expect(page.locator('.vilda-reminders-modal-overlay')).toBeVisible();
  await expect(page.locator('.vilda-reminders-row')).toHaveCount(2);
});

test('błąd odświeżenia po akcji nie zamyka pełnego arkusza i pozwala ponowić odczyt', async ({ page }) => {
  await open(page);
  await page.locator('#vildaRemindersBtn').click();
  const modal = page.locator('.vilda-reminders-modal-overlay');
  await expect(modal.locator('.vilda-reminders-row')).toHaveCount(2);
  await page.evaluate(() => { window.__reminderTest.fault = true; });
  await modal.locator('.vilda-reminders-row').first().click();
  await modal.getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  await page.locator('dialog.vb22-outcome').getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click();
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('alert')).toContainText('Nie udało się wczytać przypomnień');
  await page.evaluate(() => { window.__reminderTest.fault = false; });
  await modal.getByRole('button', { name: 'Spróbuj ponownie', exact: true }).click();
  await expect(modal.locator('.vilda-reminders-row')).toHaveCount(1);
  await modal.getByRole('button', { name: /^Do wykonania/ }).click();
  await expect(modal.locator('.vilda-reminders-row')).toHaveCount(1);
});

test('automatyczne sprawdzanie nie anuluje ręcznego otwarcia dzwonkiem', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const state = window.__reminderTest;
    state.sheetData = await window.VildaVault.listPatientNotesDueByDate();
    state.holdSheet = true; state.waiting = [];
    localStorage.removeItem('vilda-reminders-shown-v1');
    localStorage.removeItem('vilda-reminders-closed-v1');
    window.VildaPersistence.writeModuleRaw('remindersLastShownDate', null);
    state.manualSheet = window.VildaAuthUI.maybeShowReminders({ force: true });
    state.automaticSheet = window.VildaAuthUI.maybeShowReminders();
  });
  await page.evaluate(async () => { await new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }); });
  expect(await page.evaluate(() => window.__reminderTest.waiting.length)).toBe(1);
  const opened = await page.evaluate(async () => {
    const state = window.__reminderTest;
    state.waiting[0].resolve(state.sheetData);
    const result = { manual: await state.manualSheet, automatic: await state.automaticSheet };
    state.holdSheet = false; return result;
  });
  expect(opened).toEqual({ manual: true, automatic: false });
  await expect(page.locator('.vilda-reminders-modal-overlay')).toHaveCount(1);
  await expect(page.locator('.vilda-reminders-row')).toHaveCount(2);
});
