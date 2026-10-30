import { expect, test } from '@playwright/test';
import { createFictionalVault } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120000);

const WORKSPACE = 'dialog.vb22-modal';
const EDITOR = 'dialog.vb22-outcome';

async function fixture(page) {
  // The interval includes the October daylight-saving transition. Timers remain
  // real; only Date is fixed so lateness is compared as local calendar days.
  await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
  const created = await createFictionalVault(page);
  const notes = await page.evaluate(async ids => {
    const records = [];
    for (const days of [1, 3, 4, 14, 15, 0, -7]) {
      const date = new Date(); date.setDate(date.getDate() - days);
      const day = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      const note = await window.VildaVault.savePatientNote({
        patientId: days === 15 ? ids.b : ids.a,
        title: `Fikcyjna sprawa A7: ${days} dni`, body: 'Fikcyjne ustalenia testowe A7.',
        category: days === 15 || days < 0 ? 'wynik-badania' : 'reminder-exam',
        dueDateISO: day, dueTime: '09:00',
      });
      records.push({ id: note.id, days });
    }
    return records;
  }, created.ids);
  await expect(page.locator('#remindersInline .vb22-row:not(.vgs-row)')).toHaveCount(6);
  return { ...created, notes };
}

async function open(page) {
  await page.locator('#vildaRemindersBtn').click();
  await expect(page.locator(WORKSPACE)).toBeVisible();
}

test('A7 patient-first typography, calendar-day color boundaries and due-only counters match the accepted card', async ({ page }) => {
  const { notes } = await fixture(page);
  const css = await page.locator('#remindersInline .vb22-row:not(.vgs-row)').first().evaluate(row => {
    const style = node => {
      const value = getComputedStyle(node);
      return { family: value.fontFamily, size: value.fontSize, weight: value.fontWeight };
    };
    return {
      children: Array.from(row.children).map(node => node.classList.contains('vb22-row-patient') ? 'patient' : node.classList.contains('vb22-row-meta') ? 'when' : node.classList.contains('vb22-row-title') ? 'task' : 'unexpected'),
      patient: style(row.querySelector('.vb22-row-patient')),
      form: style(document.getElementById('weight')),
      task: style(row.querySelector('.vb22-row-title')),
    };
  });
  expect(css.children).toEqual(['patient', 'when', 'task']);
  expect(css.patient).toEqual(css.form);
  expect(css.patient.size).toBe('16.8px'); expect(css.patient.weight).toBe('400');
  expect(css.task.size).toBe('16px'); expect(css.task.weight).toBe('400');
  const colors = {
    1: ['short', 'rgb(14, 115, 120)'], 3: ['short', 'rgb(14, 115, 120)'],
    4: ['medium', 'rgb(137, 88, 18)'], 14: ['medium', 'rgb(137, 88, 18)'],
    15: ['long', 'rgb(165, 63, 75)'],
  };
  for (const { id, days } of notes.filter(note => note.days > 0)) {
    const label = page.locator(`#remindersInline [data-note-id="${id}"] .vb22-overdue`);
    await expect(label).toHaveText(`${days} ${days === 1 ? 'dzień' : 'dni'} po terminie`);
    await expect(label).toHaveClass(new RegExp(`vb22-overdue-${colors[days][0]}`));
    expect(await label.evaluate(node => getComputedStyle(node).color)).toBe(colors[days][1]);
    expect(await label.evaluate(node => Math.abs(node.getBoundingClientRect().right - node.parentElement.getBoundingClientRect().right))).toBeLessThan(1);
  }
  await expect(page.locator('#remindersInline .vb22-count')).toHaveText(['6', '5', '1', '1']);
  await expect(page.locator('#vildaRemindersBtn')).toHaveAttribute('data-count', '6');
  await open(page);
  const selectedId = notes.find(note => note.days === 15).id;
  await page.locator(`${WORKSPACE} [data-note-id="${selectedId}"]`).click();
  await expect(page.locator(`${WORKSPACE} .vb22-row[aria-current=true]`)).toHaveCount(1);
  await expect(page.locator(`${WORKSPACE} .vb22-row[aria-current=true]`)).toHaveAttribute('data-note-id', selectedId);
  await expect(page.locator(`${WORKSPACE} .vb22-detail h3`)).toHaveText('Fikcyjny Beata');
  await expect(page.locator(`${WORKSPACE} .vb22-detail-title`)).toHaveText('Fikcyjna sprawa A7: 15 dni');
  await expect(page.locator(`${WORKSPACE} .vb22-detail .vb22-overdue`)).toHaveCount(0);
  const category = page.locator(`${WORKSPACE} .vb22-meta .vb22-category`);
  await expect(category).toContainText('Oczekujący wynik');
  expect(await category.evaluate(node => Math.abs(node.getBoundingClientRect().right - node.parentElement.getBoundingClientRect().right))).toBeLessThan(1);
  await expect(page.locator(`${WORKSPACE} .vb22-detail-label`)).toHaveText('Szczegóły wydarzenia');
  await page.screenshot({ path: test.info().outputPath('reminders-a7-desktop.png') });
});

test('A7 completion cancellation preserves the selected task and mobile controls remain visible through a shorter viewport', async ({ page }) => {
  const { notes } = await fixture(page); await open(page);
  const noteId = notes.find(note => note.days === 1).id;
  await page.locator(`${WORKSPACE} [data-note-id="${noteId}"]`).click();
  const action = page.locator(`${WORKSPACE} .vb22-detail`).getByRole('button', { name: 'Oznacz jako wykonane', exact: true });
  for (const method of ['button', 'close', 'escape']) {
    await action.click(); await expect(page.locator(EDITOR)).toBeVisible();
    const before = await page.evaluate(id => window.VildaVault.getPatientNote(id), noteId);
    await page.locator(EDITOR).getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Fikcyjny niezapisany szkic A7.');
    if (method === 'button') await page.locator(EDITOR).getByRole('button', { name: 'Anuluj', exact: true }).click();
    else if (method === 'close') await page.locator(`${EDITOR} .vb22-outcome-close`).click();
    else await page.keyboard.press('Escape');
    await expect(page.locator(EDITOR)).toHaveCount(0);
    await expect(page.locator(`${WORKSPACE} .vb22-row[aria-current=true]`)).toHaveAttribute('data-note-id', noteId);
    const after = await page.evaluate(id => window.VildaVault.getPatientNote(id), noteId);
    expect(after.body).toBe(before.body); expect(after.completedAtISO).toBeNull();
  }
  for (const viewport of [{ width: 320, height: 800 }, { width: 393, height: 852 }, { width: 393, height: 480 }, { width: 852, height: 393 }]) {
    await page.setViewportSize(viewport);
    if (!await action.isVisible()) await page.locator(`${WORKSPACE} [data-note-id="${noteId}"]`).click();
    await action.click();
    const editor = page.locator(EDITOR), textarea = editor.getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true });
    expect(await textarea.evaluate(node => node === document.activeElement)).toBe(false);
    await editor.locator('.vb22-next-step summary').click();
    const controls = await editor.locator('input,textarea').evaluateAll(nodes => nodes.map(node => ({
      font: parseFloat(getComputedStyle(node).fontSize), height: node.getBoundingClientRect().height,
      width: node.getBoundingClientRect().width,
    })));
    expect(controls.every(control => control.font >= 16 && control.height >= 44 && control.width > 0)).toBe(true);
    const save = editor.getByRole('button', { name: 'Zapisz wykonanie', exact: true });
    const hit = await save.evaluate(node => {
      const rect = node.getBoundingClientRect(), target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return rect.top >= 0 && rect.bottom <= innerHeight + 1 && (target === node || node.contains(target));
    });
    expect(hit).toBe(true);
    expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
    await expect(page.locator(`${WORKSPACE} .vb22-detail`)).toBeVisible();
    if (viewport.width <= 700) {
      await expect(page.locator(`${WORKSPACE} .vb22-list-pane`)).toBeHidden();
      await page.locator(`${WORKSPACE} .vb22-back`).click();
      await expect(page.locator(`${WORKSPACE} .vb22-list-pane`)).toBeVisible();
      await expect(page.locator(`${WORKSPACE} .vb22-detail`)).toBeHidden();
      await expect(page.locator(`${WORKSPACE} .vb22-row[aria-current=true]`)).toHaveAttribute('data-note-id', noteId);
      await page.locator(`${WORKSPACE} [data-note-id="${noteId}"]`).click();
      await expect(page.locator(`${WORKSPACE} .vb22-list-pane`)).toBeHidden();
      await expect(page.locator(`${WORKSPACE} .vb22-detail`)).toBeVisible();
    } else {
      await expect(page.locator(`${WORKSPACE} .vb22-list-pane`)).toBeVisible();
    }
  }
});

test('A7 is shared by DocPro and required narrative validation protects the patient record', async ({ page }) => {
  const { notes, ids } = await fixture(page);
  await page.goto('/docpro.html');
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  const professionalConfirm = page.locator('#professionalConfirmBtn');
  if (await professionalConfirm.isVisible()) await professionalConfirm.click();
  await open(page);
  const noteId = notes.find(note => note.days === 15).id;
  await page.locator(`${WORKSPACE} [data-note-id="${noteId}"]`).click();
  await page.locator(`${WORKSPACE} .vb22-detail`).getByRole('button', { name: 'Dodaj wynik do kartoteki', exact: true }).click();
  const editor = page.locator(EDITOR), description = editor.getByLabel('Opis otrzymanego wyniku', { exact: true });
  await editor.getByRole('button', { name: 'Zapisz wynik', exact: true }).click();
  await expect(editor).toBeVisible(); expect(await description.evaluate(node => node.validity.valueMissing)).toBe(true);
  await description.fill('   '); await editor.getByRole('button', { name: 'Zapisz wynik', exact: true }).click();
  await expect(editor).toBeVisible(); expect(await description.evaluate(node => node.validity.valid)).toBe(false);
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), noteId)).completedAtISO).toBeNull();
  await description.fill('Fikcyjny wynik opisowy A7.'); await editor.getByRole('button', { name: 'Zapisz wynik', exact: true }).click();
  await expect(editor).toHaveCount(0); await expect(page.locator(`${WORKSPACE} .vb22-notice`)).toContainText('Wynik zapisany');
  const result = await page.evaluate(async ({ id, patientId }) => {
    const note = await window.VildaVault.getPatientNote(id);
    return { note, result: await window.VildaVault.getPatientNote(note.reminderContext.resultNoteId), labs: await window.VildaVault.listPatientLabSeries(patientId) };
  }, { id: noteId, patientId: ids.b });
  expect(result.note.completedAtISO).toBeTruthy(); expect(result.result.body).toContain('Fikcyjny wynik opisowy A7.');
  expect(result.result.patientId).toBe(ids.b); expect(result.result.clinicalDateISO).toBeNull(); expect(result.labs).toEqual([]);
});
