// Native patient documentation flows in the opted-in home workspace.
// All Vault records are created in the fixture's disposable fictional account.
import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { zapiszHistorie } from '../support/lab-historia-dane.mjs';

// The compact entry opens the accepted native B1 card. These selectors contain
// no synthetic rendering, copied clinical calculation or replacement writer.
const CARD = '#vhomePatientCard';
const NATIVE = '.vhome-native-patient-card';
const DETAIL = '.vilda-auth-card[role="dialog"]:has(.vhome-native-patient-card)';
const NOTE = '.vilda-patient-note-editor-overlay';
const nativeNote = frame => frame.locator(NOTE);
const noteBody = frame => nativeNote(frame).locator('textarea').first();
const tab = (frame, label) => frame.locator(CARD).getByRole('tab', { name: label });
const currentPanel = frame => frame.locator(`${CARD} [role=tabpanel]:not([hidden])`);

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
test.setTimeout(240_000);

async function settled(frame) {
  await frame.waitForFunction(() => window.VildaVault?.isUnlocked()
    && window.VildaAuthUI?.isBootReady()
    && !window.__vildaPersistRestoring && !window.__vildaLustroWpis
    && !window.__vildaSuspendIntakeUserReset
    && !window.VildaDataImportExport.isMainSessionRestorePending()
    && !window.VildaDobAge.restorePending());
}
async function setup(page, { shell = false } = {}) {
  await page.addInitScript(() => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true; });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)
      ? route.continue() : route.abort();
  });
  const fixture = await createFictionalVault(page, { shell, waitForAccountReadyBeforeReload: true });
  await loadPatient(fixture.frame, fixture.ids.a, 'restore');
  await settled(fixture.frame);
  await fixture.frame.waitForFunction(() => Boolean(window.VildaHomePatient));
  await expect(fixture.frame.locator(CARD)).toBeVisible();
  await fixture.frame.evaluate(() => {
    window.vildaPersistFlushNow({ force: true });
    window.VildaDataImportExport.saveMainSessionNow({ force: true });
  });
  return { ...fixture, id: fixture.ids.a };
}
async function refresh(frame) {
  await frame.evaluate(() => window.VildaHomePatient.refresh());
  await expect(frame.locator(CARD)).not.toHaveAttribute('aria-busy', 'true');
}
async function show(frame) {
  await frame.locator(CARD).getByRole('button', { name: 'Powiększ kartę pacjenta', exact: true }).click();
  const dialog = frame.locator(DETAIL);
  await expect(dialog).toBeVisible();
  return dialog;
}
async function selectTab(frame, name) {
  await tab(frame, name).click();
  await expect(tab(frame, name)).toHaveAttribute('aria-selected', 'true');
  return currentPanel(frame);
}
async function records(frame, id) {
  return frame.evaluate(async id => {
    const byId = rows => rows.slice().sort((a, b) => a.id.localeCompare(b.id));
    return {
      notes: byId(await window.VildaVault.listPatientNotesForPatient(id)),
      plans: byId(await window.VildaVault.listCarePlans({ patientId: id })),
      labs: await window.VildaVault.listPatientLabSeries(id),
      treatment: await window.VildaVault.listPatientTreatmentPeriods(id),
      patient: await window.VildaVault.getPatient(id),
    };
  }, id);
}
async function clinical(frame) {
  return frame.evaluate(() => {
    const payload = window.VildaDataImportExport.captureCurrentUserDataReadOnly();
    const session = window.VildaPersistence.readMainSession();
    delete payload.timestampISO;
    if (session) delete session.timestampISO;
    return { payload, session };
  });
}
async function notes(frame, id) {
  return frame.evaluate(async id => (await window.VildaVault.listPatientNotesForPatient(id))
    .sort((a, b) => a.id.localeCompare(b.id)), id);
}
async function seedGeneral(frame, id, body = 'Fikcyjna ogólna notatka podglądu.') {
  return frame.evaluate(async ({ id, body }) => {
    const saved = await window.VildaVault.savePatientNote({
      patientId: id, title: 'Fikcyjna notatka główna', body, category: 'observation',
    });
    return window.VildaVault.getPatientNote(saved.id);
  }, { id, body });
}
async function openNewNote(frame) {
  const panel = await selectTab(frame, /^Notatki/);
  await panel.getByRole('button', { name: 'Dodaj notatkę', exact: true }).click();
  await expect(frame.locator(NOTE)).toBeVisible();
  await expect(nativeNote(frame)).toBeVisible();
  return nativeNote(frame);
}
async function closeDetail(frame) {
  await frame.locator(DETAIL).getByRole('button', { name: 'Zamknij kartę', exact: true }).click();
  await expect(frame.locator(DETAIL)).toBeHidden();
}
async function selectNativeTab(frame, key) {
  const mobile = frame.locator(`${NATIVE} .vhome-b1-mobile-select`);
  if (await mobile.isVisible()) await mobile.selectOption(key);
  else await frame.locator(`${NATIVE} .vhome-b1-nav [data-tab="${key}"]`).click();
  const panel = frame.locator(`${NATIVE} .vilda-patient-tab-content[data-tab="${key}"]`);
  await expect(panel).toBeVisible(); return panel;
}
async function openExpandedNote(frame) {
  const panel = await selectNativeTab(frame, 'notes');
  await panel.getByRole('button', { name: /^\+ Dodaj notatkę$/ }).click();
  await expect(nativeNote(frame)).toBeVisible(); return nativeNote(frame);
}

// The mock's first row is Growth/Patient. Diet begins the following row.
// Tab interaction never resizes the compact desktop card or writes records.
test('home patient: approved position, equal desktop cards, keyboard tabs and pure expansion', async ({ page }) => {
  const { frame, id } = await setup(page);
  await seedGeneral(frame, id); await refresh(frame);
  const before = { records: await records(frame, id), clinical: await clinical(frame) };
  await frame.locator(CARD).scrollIntoViewIfNeeded();
  expect(await frame.locator('#vhomeMainCards').evaluate(root => [...root.children].map(node => node.id)))
    .toEqual(['vhomeGrowthCard', 'vhomePatientCard', 'vhomeDietCard']);
  const boxes = await Promise.all(['#vhomeGrowthCard', CARD, '#vhomeDietCard'].map(selector => frame.locator(selector).boundingBox()));
  for (const box of boxes) expect(box.height).toBe(352);
  expect(boxes[1].y).toBe(boxes[0].y);
  expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width);
  expect(boxes[2].y).toBeGreaterThanOrEqual(boxes[0].y + boxes[0].height);
  expect(boxes[1].width).toBe(boxes[0].width);
  await expect(tab(frame, /^Notatki/)).toHaveAttribute('aria-selected', 'true');
  await selectTab(frame, /^Badania/); await tab(frame, /^Badania/).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(frame, /^Plany/)).toBeFocused();
  await expect(tab(frame, /^Plany/)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End'); await expect(tab(frame, /^Notatki/)).toBeFocused();
  await expect(currentPanel(frame)).toContainText('Fikcyjna ogólna notatka podglądu.');
  await page.keyboard.press('Home'); await expect(tab(frame, /^Badania/)).toBeFocused();
  for (const name of [/^Plany/, /^Notatki/, /^Badania/]) {
    await selectTab(frame, name);
    expect(await frame.locator(CARD).boundingBox()).toEqual(boxes[1]);
  }
  // Ordinary card surface does not expand it.
  await frame.locator(CARD).getByRole('heading', { name: 'Karta pacjenta', exact: true }).click();
  await expect(frame.locator(DETAIL)).toBeHidden();
  const detail = await show(frame);
  await expect.poll(async () => {
    const bounds = await detail.boundingBox();
    return { width: bounds.width, height: bounds.height };
  }).toEqual({ width: 1000, height: 820 });
  await closeDetail(frame);
  expect(await clinical(frame)).toEqual(before.clinical);
  expect(await records(frame, id)).toEqual(before.records);
  await expect(frame.locator(CARD).getByRole('button', { name: 'Powiększ kartę pacjenta', exact: true })).toBeFocused();
});

test('home patient: tablet uses natural cards and phone preserves full labels without horizontal overflow', async ({ page }) => {
  const { frame } = await setup(page);
  for (const width of [1025, 1024, 851, 850, 820, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of [/^Badania/, /^Plany/, /^Notatki/]) {
      await selectTab(frame, name);
      expect(await frame.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      expect(await frame.locator(CARD).evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      const layout = await frame.locator(CARD).evaluate(node => ({
        height: node.getBoundingClientRect().height,
        minHeight: parseFloat(getComputedStyle(node).minHeight) || 0,
        maxHeight: getComputedStyle(node).maxHeight,
      }));
      if (width > 1024) expect(layout.height).toBe(352);
      else { expect(layout.minHeight).toBe(0); expect(layout.maxHeight).toBe('none'); }
    }
    await expect(tab(frame, /^Badania/)).toContainText('Badania');
    await expect(tab(frame, /^Plany/)).toContainText('Plany');
    await expect(tab(frame, /^Notatki/)).toContainText('Notatki');
    const dialog = await show(frame), box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(1001);
    await closeDetail(frame);
  }
});

test('home patient: native general-note Cancel is pure and Save survives F5 with the same record', async ({ page }) => {
  const fixture = await setup(page, { shell: true }); let frame = fixture.frame;
  const before = { notes: await notes(frame, fixture.id), clinical: await clinical(frame) };
  let editor = await openNewNote(frame);
  await editor.getByRole('radio', { name: /Notatka ogólna/ }).check();
  await noteBody(frame).fill('Fikcyjny niezapisany tekst do odrzucenia.');
  page.once('dialog', confirmation => confirmation.accept());
  await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(frame.locator(NOTE)).toHaveCount(0);
  expect(await notes(frame, fixture.id)).toEqual(before.notes);
  expect(await clinical(frame)).toEqual(before.clinical);
  editor = await openNewNote(frame);
  const title = 'Fikcyjna ogólna notatka po przebudowie';
  const body = 'Fikcyjny tekst <b>pozostaje zwykłym tekstem</b>.';
  await editor.getByRole('radio', { name: /Notatka ogólna/ }).check();
  await editor.locator('input[placeholder="np. Wprowadzono Euthyrox"]').fill(title);
  await noteBody(frame).fill(body);
  await editor.getByRole('button', { name: 'Dodaj notatkę', exact: true }).click();
  await expect(frame.locator(NOTE)).toHaveCount(0);
  const saved = (await notes(frame, fixture.id)).find(note => note.title === title);
  expect(saved).toMatchObject({ patientId: fixture.id, body });
  expect(saved.linkedAgeMonths ?? null).toBeNull(); expect(saved.clinicalDateISO ?? null).toBeNull();
  expect((await notes(frame, fixture.id)).length).toBe(before.notes.length + 1);
  await refresh(frame); await selectTab(frame, /^Notatki/);
  await expect(currentPanel(frame)).toContainText(body);
  await expect(currentPanel(frame).locator('b')).toHaveCount(0);
  expect(await clinical(frame)).toEqual(before.clinical);
  await page.reload({ waitUntil: 'load' }); frame = await shellFrame(page); await readyForPatient(frame);
  await settled(frame); await refresh(frame); await selectTab(frame, /^Notatki/);
  await expect(currentPanel(frame)).toContainText(title);
  await expect(currentPanel(frame)).toContainText(body);
  expect((await notes(frame, fixture.id)).find(note => note.id === saved.id)).toEqual(saved);
});

test('home patient: the shared care form preserves native Cancel and creates one patient-scoped plan', async ({ page }) => {
  const { frame, id } = await setup(page);
  const before = { records: await records(frame, id), clinical: await clinical(frame) };
  const panel = await selectTab(frame, /^Plany/);
  await panel.getByRole('button', { name: 'Otwórz plan opieki', exact: true }).click();
  const native = frame.locator(`${DETAIL} [data-home-patient-view="care"] .vcp`);
  await expect(native).toBeVisible();
  await native.getByRole('button', { name: 'Nowy plan', exact: true }).click();
  const form = frame.locator('dialog.vcp-dialog.vhome-patient-native-dialog');
  await expect(form).toBeVisible();
  await expect(form.getByRole('heading', { name: 'Dodaj plan opieki', exact: true })).toBeVisible();
  await form.getByLabel('Nazwa planu', { exact: true }).fill('Fikcyjny odrzucony plan');
  await form.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(form).toHaveCount(0);
  expect(await records(frame, id)).toEqual(before.records);
  expect(await clinical(frame)).toEqual(before.clinical);
  await native.getByRole('button', { name: 'Nowy plan', exact: true }).click();
  await expect(form).toBeVisible();
  const title = 'Fikcyjny plan z nowej strony głównej';
  const goal = 'Fikcyjny plan obserwacji ustalony przez lekarza.';
  await form.getByLabel('Nazwa planu', { exact: true }).fill(title);
  await form.getByLabel('Cel i ustalenia (opcjonalnie)', { exact: true }).fill(goal);
  await form.getByRole('button', { name: 'Utwórz plan', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect.poll(async () => (await records(frame, id)).plans.filter(plan => plan.title === title).length).toBe(1);
  const saved = (await records(frame, id)).plans.find(plan => plan.title === title);
  expect(saved.patientId).toBe(id);
  await closeDetail(frame); await refresh(frame); await selectTab(frame, /^Plany/);
  await expect(currentPanel(frame)).toContainText(title);
  await expect(currentPanel(frame)).toContainText(goal);
  expect(await clinical(frame)).toEqual(before.clinical);
  const after = await records(frame, id);
  expect(after.patient).toEqual(before.records.patient);
  expect(after.labs).toEqual(before.records.labs);
  expect(after.treatment).toEqual(before.records.treatment);
});

// Fixture records use the original public Vault writer. The norm belongs to the
// saved result, deliberately differing from the current calculator's age range.
async function seedLabs(frame, id) {
  return frame.evaluate(async id => {
    const lab = async (test, testKey, value, valueNum, unit, date, norm) => window.VildaVault.savePatientNote({
      patientId: id, title: 'Fikcyjne ' + test, body: 'Fikcyjny zapis historyczny.',
      category: 'wynik-badania', clinicalDateISO: date,
      labResult: { test, testKey, value, valueNum, unit, norm },
    });
    const tsh = await lab('TSH (tyreotropina)', 'tsh', '0,12 mIU/L', 0.12, 'mIU/L', '2026-06-02', '0,27–4,2 mIU/L');
    const ft4 = await lab('fT4 (wolna tyroksyna)', 'ft4', '17,8 pmol/L', 17.8, 'pmol/L', '2026-05-28', '12–22 pmol/L');
    return { tsh, ft4 };
  }, id);
}

test('home patient: actual lab count and saved norms remain distinct from current-patient interpretation', async ({ page }) => {
  const { frame, id } = await setup(page); const seeded = await seedLabs(frame, id);
  await refresh(frame);
  await expect(tab(frame, /^Badania/)).toContainText('2');
  const panel = await selectTab(frame, /^Badania/);
  await expect(panel.locator('.vhome-patient-result').first()).toContainText('0,12');
  await expect(panel.locator('.vhome-patient-unit').first()).toContainText('mIU/L');
  const before = { records: await records(frame, id), clinical: await clinical(frame) };
  await panel.getByRole('button', { name: 'Wszystkie badania', exact: true }).click();
  await expect(frame.locator(DETAIL)).toBeVisible();
  const row = frame.locator(`${DETAIL} .vilda-lab-hist-result-row[data-series="tsh"]`).first();
  await expect(row.locator('.vilda-lab-hist-result-norm')).toContainText('0,27–4,2 mIU/L');
  await expect(row.locator('.vilda-lab-hist-flag')).toHaveText('↓');
  await closeDetail(frame);
  expect(await records(frame, id)).toEqual(before.records);
  expect(await clinical(frame)).toEqual(before.clinical);
  expect((await notes(frame, id)).find(note => note.id === seeded.tsh.id).labResult.norm).toBe('0,27–4,2 mIU/L');
  const notesPanel = await selectTab(frame, /^Notatki/);
  await expect(notesPanel).not.toContainText('Fikcyjne TSH');
});

test('home patient: failed lab read is not reported as an empty history and retry preserves records', async ({ page }) => {
  const { frame, id } = await setup(page); await seedLabs(frame, id); await refresh(frame);
  const before = await records(frame, id);
  await frame.evaluate(() => {
    const original = window.VildaVault.listPatientLabSeries;
    window.__patientRealLabReader = original;
    // Only the real reader's completion is failed. No clinical values, model,
    // note writer or saved records are replaced.
    window.VildaVault.listPatientLabSeries = async function () { throw new Error('Fictional read failure'); };
    window.VildaHomePatient.refresh();
  });
  const panel = await selectTab(frame, /^Badania/);
  await expect(panel).toContainText(/Nie udało|niedostępne|Spróbuj/);
  await expect(panel).not.toContainText(/Brak wyników|Brak badań/);
  await expect(tab(frame, /^Badania/)).not.toContainText('0');
  await frame.evaluate(() => {
    window.VildaVault.listPatientLabSeries = window.__patientRealLabReader;
    delete window.__patientRealLabReader; window.VildaHomePatient.refresh();
  });
  await expect(tab(frame, /^Badania/)).toContainText('2');
  expect(await records(frame, id)).toEqual(before);
});

async function holdNoteRead(frame, id) {
  await frame.evaluate(id => {
    const original = window.VildaVault.listPatientNotesForPatient;
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    window.__patientHeldRead = { entered: 0, release() {
      window.VildaVault.listPatientNotesForPatient = original; release();
    } };
    window.VildaVault.listPatientNotesForPatient = function (patientId, ...args) {
      const read = original.call(this, patientId, ...args);
      if (patientId !== id) return read;
      window.__patientHeldRead.entered += 1;
      return Promise.resolve(read).then(value => wait.then(() => value));
    };
    window.VildaHomePatient.refresh();
  }, id);
  await expect.poll(() => frame.evaluate(() => window.__patientHeldRead.entered)).toBeGreaterThan(0);
}

test('home patient: a late real read cannot restore the previous patient or overwrite the next visit', async ({ page }) => {
  const { frame, ids } = await setup(page);
  const bodyA = 'Fikcyjna prywatna notatka tylko pacjenta A.';
  const bodyB = 'Fikcyjna notatka tylko pacjentki B.';
  await seedGeneral(frame, ids.a, bodyA); await seedGeneral(frame, ids.b, bodyB); await refresh(frame);
  await holdNoteRead(frame, ids.a);
  await loadPatient(frame, ids.b, 'restore'); await settled(frame);
  await frame.evaluate(() => { window.__patientHeldRead.release(); delete window.__patientHeldRead; });
  await refresh(frame); await selectTab(frame, /^Notatki/);
  await expect(currentPanel(frame)).toContainText(bodyB);
  await expect(frame.locator(CARD)).not.toContainText(bodyA);
  await show(frame); await expect(frame.locator(DETAIL)).not.toContainText(bodyA); await closeDetail(frame);
});

test('home patient: lock removes expanded content and an unsaved native note without writing it', async ({ page }) => {
  const { frame, id } = await setup(page);
  const privateText = 'Fikcyjna prywatna treść przed zablokowaniem.';
  await seedGeneral(frame, id, privateText); await refresh(frame); await show(frame);
  await selectNativeTab(frame, 'notes');
  await expect(frame.locator(DETAIL)).toContainText(privateText);
  await closeDetail(frame);
  await openNewNote(frame); await noteBody(frame).fill('Fikcyjny niezapisany tekst przed blokadą.');
  const before = await notes(frame, id);
  await frame.evaluate(() => window.VildaVault.lock());
  await expect(frame.locator(NOTE)).toHaveCount(0);
  await expect(frame.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
  await expect(frame.locator(DETAIL)).toBeHidden();
  await expect(frame.locator(CARD)).not.toContainText(privateText);
  expect(before.some(note => note.body === 'Fikcyjny niezapisany tekst przed blokadą.')).toBe(false);
  // A separate native unlock/restore test is needed to compare post-lock Vault
  // records; this case does not bypass lock to inspect encrypted data.
});

async function seedPending(frame, id) {
  return frame.evaluate(async patientId => window.VildaVault.savePatientNote({
    patientId, title: 'Fikcyjne oczekujące TSH', body: '', category: 'wynik-badania',
    dueDateISO: '2026-12-01', labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh' },
  }), id);
}
async function openPendingDescription(frame, noteId) {
  await selectTab(frame, /^Badania/);
  await frame.locator('#vhomePatientLabsOpen').click();
  const pending = frame.locator(`${DETAIL} .vilda-lab-hist-pending-row[data-note-id="${noteId}"]`);
  await expect(pending).toBeVisible();
  await pending.getByRole('button', { name: 'Opisz wynik', exact: true }).click();
  const dialog = frame.locator('#labPendingDescribeDialog'); await expect(dialog).toBeVisible();
  return dialog;
}
async function observeActualOutcomeWriter(frame, noteId) {
  await frame.evaluate(noteId => {
    const vault = window.VildaVault, original = vault.saveReminderOutcome;
    const observer = { noteId, calls: [], pending: [] };
    vault.saveReminderOutcome = function (...args) {
      if (args[0]?.id === observer.noteId) observer.calls.push(structuredClone(args));
      // Observe the actual native actor; preserve arguments, receiver, original
      // return value and synchronous exception. No literal result is supplied.
      const value = Reflect.apply(original, this, args);
      if (args[0]?.id === observer.noteId) observer.pending.push(Promise.resolve(value).then(() => {}, () => {}));
      return value;
    };
    observer.restore = () => { vault.saveReminderOutcome = original; };
    window.__patientOutcomeObserver = observer;
  }, noteId);
}
async function outcomeCalls(frame) {
  return frame.evaluate(async () => {
    const observer = window.__patientOutcomeObserver;
    await Promise.all(observer.pending);
    return observer.calls;
  });
}

test('home patient: a native pending description explicitly saves once and closes the original order', async ({ page }) => {
  const { frame, id, ids } = await setup(page);
  const pending = await seedPending(frame, id); await refresh(frame);
  const otherBefore = await records(frame, ids.b);
  const dialog = await openPendingDescription(frame, pending.id);
  await observeActualOutcomeWriter(frame, pending.id);
  await dialog.locator('#labPendingDescribeText').fill('Fikcyjny opis otrzymanego wyniku.');
  await dialog.locator('#labPendingDescribeDate').fill('2026-06-17');
  await dialog.getByRole('button', { name: 'Zapisz opis', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const calls = await outcomeCalls(frame); expect(calls).toHaveLength(1);
  expect(calls[0][0]).toMatchObject({ id: pending.id, patientId: id, action: 'result', dateISO: '2026-06-17', text: 'Fikcyjny opis otrzymanego wyniku.' });
  const stored = await notes(frame, id), original = stored.find(note => note.id === pending.id);
  expect(original.completedAtISO).toBeTruthy(); expect(original.labResult?.valueNum ?? null).toBeNull();
  const described = stored.filter(note => note.id !== pending.id && note.labResult?.value === 'Wynik opisowy — pełna treść w notatce');
  expect(described).toHaveLength(1); expect(described[0].body).toContain('Fikcyjny opis otrzymanego wyniku.');
  expect(await records(frame, ids.b)).toEqual(otherBefore);
  await frame.evaluate(() => { window.__patientOutcomeObserver.restore(); delete window.__patientOutcomeObserver; });
});

test('home patient: a late native pending-order read cannot save after teardown and loading another patient', async ({ page }) => {
  const { frame, id, ids } = await setup(page);
  const pending = await seedPending(frame, id); await refresh(frame);
  const beforeA = await notes(frame, id), beforeB = await notes(frame, ids.b);
  const dialog = await openPendingDescription(frame, pending.id);
  await dialog.locator('#labPendingDescribeText').fill('Fikcyjny opis, którego nie wolno zapisać po zmianie pacjenta.');
  await dialog.locator('#labPendingDescribeDate').fill('2026-06-17');
  await observeActualOutcomeWriter(frame, pending.id);
  await frame.evaluate(noteId => {
    const vault = window.VildaVault, original = vault.getPatientNote;
    let release, done;
    const wait = new Promise(resolve => { release = resolve; });
    const completed = new Promise(resolve => { done = resolve; });
    const gate = { entered: 0, completed,
      release() { vault.getPatientNote = original; release(); } };
    vault.getPatientNote = function (id, ...args) {
      const actual = Reflect.apply(original, this, [id, ...args]);
      if (id !== noteId) return actual;
      return Promise.resolve(actual).then(note => {
        // Capture the genuine note before delaying delivery of its read.
        gate.entered += 1; return wait.then(() => note);
      }).finally(done);
    };
    window.__patientPendingRead = gate;
  }, pending.id);
  await dialog.getByRole('button', { name: 'Zapisz opis', exact: true }).click();
  await expect.poll(() => frame.evaluate(() => window.__patientPendingRead.entered)).toBeGreaterThan(0);
  // The native detail is a busy top-layer dialog. Its owning workspace's
  // forced lifecycle teardown must release it before the ordinary patient
  // chooser can receive input; no locked Vault or writer guard is bypassed.
  await frame.evaluate(() => window.VildaHomePatient.close(true, false));
  await expect(dialog).toHaveCount(0); await noPatientDialogHistory(frame);
  await loadPatient(frame, ids.b, 'restore'); await settled(frame);
  await frame.evaluate(async () => {
    const gate = window.__patientPendingRead; gate.release(); await gate.completed;
    await new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); });
    delete window.__patientPendingRead;
  });
  expect(await outcomeCalls(frame)).toHaveLength(0);
  expect(await notes(frame, id)).toEqual(beforeA); expect(await notes(frame, ids.b)).toEqual(beforeB);
  await refresh(frame);
  await expect(frame.locator(CARD)).not.toContainText('Fikcyjne oczekujące TSH');
  await frame.evaluate(() => { window.__patientOutcomeObserver.restore(); delete window.__patientOutcomeObserver; });
});

async function createActualAcrNote(page, patientId, payload) {
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked()
    && window.VildaAuthUI?.isBootReady()
    && document.documentElement.classList.contains('clcr-workflow-ready')
    && typeof window.applyClcrSessionSnapshot === 'function'
    && Boolean(window.ClcrVisitSave) && window.clcrIsResetting !== true);
  await expect.poll(() => page.evaluate(() => window.ClcrVisitSave.resolveCurrentPatientId())).toBe(patientId);
  expect((await page.evaluate(() => window.ClcrVisitSave.ensurePersistedPatient())).ok).toBe(true);
  expect(await page.evaluate(data => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'spot', selectedFormula: 'ACR', inputs: {
      currentVersion: 'spot', formulaPicker: 'ACR', fullName: data.name,
      age: String(data.user.age), ageMonths: String(data.user.ageMonths || 0), ageDays: '',
      sex: data.user.sex, weight: String(data.user.weight), height: String(data.user.height),
      U_Alb: '45', U_Alb_unit: 'mg/L', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl',
      ACR_entry_mode: 'concentration', ACR_reported: '', ACR_reported_unit: 'mg/g',
      ACR_same_specimen: '', spotSampleKind: '', spotMenstruation: false,
      spotHematuria: false, spotInfection: false, spotExercise: false, spotAcuteIllness: false,
    },
  }, { source: 'e2e-fictional-home-patient', update: true, dispatchEvents: false, preserveAcrossVersions: true }), payload)).toBe(true);
  await expect(page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="ACR"]')).toBeVisible();
  await page.locator('#clcrVisitDate').fill('2026-06-17');
  await expect(page.locator('#clcrVisitSaveBtn')).toBeEnabled();
  await page.locator('#clcrVisitSaveBtn').click();
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano');
  const saved = await page.evaluate(async id => (await window.VildaVault.listPatientNotesForPatient(id))
    .filter(note => {
      if (note.category !== 'wynik-klirens') return false;
      const recorded = window.ClcrSavedCalculation.readSaved(note);
      return recorded?.valid === true && recorded.snapshot.formulaId === 'ACR';
    }), patientId);
  expect(saved).toHaveLength(1); expect(saved[0].patientId).toBe(patientId);
  expect(saved[0].body).toContain('[VILDA_CLCR_CALCULATION_V1]');
  return saved[0];
}

test('home patient: a genuinely saved Clcr result belongs to Badania while a plain Clcr-category note remains in Notes', async ({ page }) => {
  const { id, patients } = await setup(page);
  const saved = await createActualAcrNote(page, id, patients.a);
  const plain = await page.evaluate(async patientId => {
    const receipt = await window.VildaVault.savePatientNote({
      patientId, title: 'Fikcyjna zwykła notatka Klirensu', body: 'Fikcyjna uwaga bez zapisanego obliczenia.', category: 'wynik-klirens',
    });
    return window.VildaVault.getPatientNote(receipt.id);
  }, id);
  await page.goto('/index.html', { waitUntil: 'load' }); await readyForPatient(page); await settled(page);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(id);
  await refresh(page); await selectTab(page, /^Notatki/);
  await expect(currentPanel(page)).toContainText(plain.title);
  await expect(currentPanel(page)).toContainText(plain.body);
  await expect(currentPanel(page)).not.toContainText(saved.title);
  await selectTab(page, /^Badania/); await expect(tab(page, /^Badania/)).toContainText('1');
  await page.locator('#vhomePatientLabsOpen').click();
  const history = page.locator(`${DETAIL} [data-home-patient-view="labs"] .vilda-lab-hist`);
  await expect(history).toHaveAttribute('aria-busy', 'false');
  await history.locator('.vilda-lab-hist-panel-select').selectOption('renal');
  await history.getByRole('button', { name: 'Tabela', exact: true }).click();
  await expect(history.getByRole('button', { name: 'Tabela', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(history.locator(`.vilda-lab-hist-result-row[data-source="clcr"][data-note-id="${saved.id}"]`)).toBeVisible();
  const stored = await notes(page, id);
  expect(stored.find(note => note.id === saved.id)).toEqual(saved);
  expect(stored.find(note => note.id === plain.id).labResult ?? null).toBeNull();
});

test.describe('home patient: browser-local dates', () => {
  test.use({ timezoneId: 'Europe/Warsaw' });
  test('a real note saved near UTC midnight uses the native local date without changing the timestamp', async ({ page }) => {
    const { frame, id } = await setup(page);
    const realNow = new Date();
    await page.clock.setFixedTime(new Date('2026-11-17T23:30:00.000Z'));
    const saved = await seedGeneral(frame, id, 'Fikcyjna notatka zapisana po lokalnej północy.');
    await page.clock.setFixedTime(realNow);
    expect(saved.updatedAtISO).toBe('2026-11-17T23:30:00.000Z');
    await refresh(frame); await selectTab(frame, /^Notatki/);
    const nativeDate = await frame.evaluate(iso => new Date(iso).toLocaleDateString('pl-PL'), saved.updatedAtISO);
    expect(nativeDate).toBe('18.11.2026');
    const time = currentPanel(frame).locator('.vhome-patient-caption time');
    await expect(time).toHaveText(nativeDate); await expect(time).toHaveAttribute('datetime', saved.updatedAtISO);
    expect((await notes(frame, id)).find(note => note.id === saved.id).updatedAtISO).toBe(saved.updatedAtISO);
  });
});


test('home patient: historical hormone assessment remains the saved native snapshot when opened from the new card', async ({ page }) => {
  const { frame, ids } = await setup(page);
  const id = ids.b; await loadPatient(frame, id, 'restore'); await settled(frame);
  // The existing fixture evaluates the real production LH engine and records
  // its snapshot through the actual Vault writer. It contains no copied formula.
  const history = await zapiszHistorie(frame, id);
  const before = await frame.evaluate(noteId => window.VildaVault.getPatientNote(noteId), history.lh3);
  expect(before.labResult.assessment).toBeTruthy();
  await frame.evaluate(() => {
    const original = window.VildaLabPuberty;
    window.__patientHormoneReadChecks = { calls: 0, restore() { window.VildaLabPuberty = original; } };
    window.VildaLabPuberty = { ...original, evaluate(...args) {
      window.__patientHormoneReadChecks.calls += 1; return Reflect.apply(original.evaluate, original, args);
    } };
    if (window.VildaLabPuberty.evaluate === original.evaluate) throw Error('Cannot observe actual evaluation boundary');
  });
  await refresh(frame); await selectTab(frame, /^Badania/);
  await frame.locator('#vhomePatientLabsOpen').click();
  const row = frame.locator(`${DETAIL} .vilda-lab-hist-result-row[data-note-id="${history.lh3}"]`);
  await expect(row).toBeVisible(); await row.click();
  const details = frame.locator('#labResultDetailsDialog'); await expect(details).toBeVisible();
  await details.locator('.vilda-lab-hist-result-sources > summary').click();
  await expect(details.locator('.vilda-lab-hist-status')).toBeVisible();
  const after = await frame.evaluate(noteId => window.VildaVault.getPatientNote(noteId), history.lh3);
  expect(after).toEqual(before);
  expect(await frame.evaluate(() => window.__patientHormoneReadChecks.calls)).toBe(0);
  await frame.evaluate(() => { window.__patientHormoneReadChecks.restore(); delete window.__patientHormoneReadChecks; });
});

const historyState = frame => frame.evaluate(() => ({
  length: history.length, token: history.state?.vildaHomeDialog || null,
  tokens: history.state?.vildaHomeDialogStack?.tokens || [],
}));
// Expanded B1 is owned by native AuthUI's auth entry; the compact note
// continues to use HomeDialogHistory. Observe both genuine owners.
const nativeHistoryState = frame => frame.evaluate(() => {
  const host = window.parent !== window ? window.parent : window;
  const shell = host.VildaShell;
  return { length: host.history.length,
    token: host.history.state?.shellAuthId || history.state?.vildaNavSentinel || null,
    current: shell?.isAuthHistoryCurrent ? shell.isAuthHistoryCurrent(window) : history.state?.vildaNavSentinel === true,
    dialogs: document.querySelectorAll('.vhome-native-patient-card, .vilda-patient-note-editor-overlay').length };
});
async function noPatientDialogHistory(frame) {
  await expect.poll(() => frame.evaluate(() => {
    const home = history.state?.vildaHomeDialogStack?.tokens?.length || 0;
    const host = window.parent !== window ? window.parent : window;
    const native = host.VildaShell?.isAuthHistoryCurrent ? host.VildaShell.isAuthHistoryCurrent(window) : history.state?.vildaNavSentinel === true;
    return home + (native ? 1 : 0);
  })).toBe(0);
}

// Chromium can traverse an iframe's joint-history entry without committing a
// main-frame navigation. Playwright's Page.goBack then waits for that absent
// main-frame event. Bound only that API wait; every caller below still proves
// the actual native confirmation/pop, exact root, token, values and APP route.
async function browserBackInApp(page) {
  try { await page.goBack({ waitUntil: 'commit', timeout: 2500 }); }
  catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    await expect(page).toHaveURL(/\/app\.html#\/start$/);
  }
}

test('home patient: APP Back from a direct dirty note declines without replacing its root and accepts through the native prompt', async ({ page }) => {
  const { frame, id } = await setup(page, { shell: true });
  const before = { records: await records(frame, id), clinical: await clinical(frame) };
  const editor = await openNewNote(frame);
  await noteBody(frame).fill('Fikcyjny niezapisany wywiad zachowany po odmowie.');
  await editor.locator('input[placeholder="np. Wprowadzono Euthyrox"]').fill('Fikcyjny tytuł do zachowania');
  await frame.evaluate(() => { window.__patientBackNoteRoot = document.querySelector('.vilda-patient-note-editor-overlay'); });
  const opened = await historyState(frame); expect(opened.tokens).toHaveLength(1);
  const confirmations = []; let accept = false;
  const handler = async confirmation => {
    confirmations.push(confirmation.message());
    if (accept) await confirmation.accept(); else await confirmation.dismiss();
  };
  page.on('dialog', handler);
  try {
    await browserBackInApp(page);
    await expect.poll(() => confirmations.length).toBe(1);
    await expect(frame.locator(NOTE)).toBeVisible();
    await expect(page).toHaveURL(/\/app\.html#\/start$/);
    await expect(noteBody(frame)).toHaveValue('Fikcyjny niezapisany wywiad zachowany po odmowie.');
    await expect(editor.locator('input[placeholder="np. Wprowadzono Euthyrox"]')).toHaveValue('Fikcyjny tytuł do zachowania');
    expect(await frame.evaluate(() => document.querySelector('.vilda-patient-note-editor-overlay') === window.__patientBackNoteRoot)).toBe(true);
    await expect.poll(async () => (await historyState(frame)).token).toBe(opened.token);
    expect((await historyState(frame)).length).toBe(opened.length);
    expect(confirmations[0]).toContain('niezapisan');
    expect(await records(frame, id)).toEqual(before.records); expect(await clinical(frame)).toEqual(before.clinical);
    accept = true; await browserBackInApp(page);
    await expect.poll(() => confirmations.length).toBe(2);
    await expect(frame.locator(NOTE)).toHaveCount(0); await noPatientDialogHistory(frame);
    await expect(page).toHaveURL(/\/app\.html#\/start$/);
    await expect(frame.locator('#vhomePatientNoteAdd')).toBeFocused();
    expect(await records(frame, id)).toEqual(before.records); expect(await clinical(frame)).toEqual(before.clinical);
  } finally {
    page.removeListener('dialog', handler);
    await frame.evaluate(() => { delete window.__patientBackNoteRoot; });
  }
});

test('home patient: APP Back from the native care form cancels only that child and preserves its expanded parent', async ({ page }) => {
  const { frame, id } = await setup(page, { shell: true });
  const before = { records: await records(frame, id), clinical: await clinical(frame) };
  await selectTab(frame, /^Plany/); await frame.locator('#vhomePatientCareOpen').click();
  const parent = frame.locator(DETAIL); await expect(parent).toBeVisible();
  const parentHistory = await nativeHistoryState(frame); expect(parentHistory.current).toBe(true);
  const native = parent.locator('[data-home-patient-view="care"] .vcp');
  await native.getByRole('button', { name: 'Nowy plan', exact: true }).click();
  const child = frame.locator('dialog.vcp-dialog.vhome-patient-native-dialog'); await expect(child).toBeVisible();
  await child.getByLabel('Nazwa planu', { exact: true }).fill('Fikcyjny plan do anulowania przez Wstecz');
  expect((await nativeHistoryState(frame)).current).toBe(true);
  expect((await nativeHistoryState(frame)).length).toBe(parentHistory.length);
  await browserBackInApp(page);
  await expect(child).toHaveCount(0); await expect(parent).toBeVisible(); await expect(native).toBeVisible();
  await expect(page).toHaveURL(/\/app\.html#\/start$/);
  await expect.poll(async () => (await nativeHistoryState(frame)).current).toBe(true);
  expect((await nativeHistoryState(frame)).length).toBe(parentHistory.length);
  expect(await records(frame, id)).toEqual(before.records); expect(await clinical(frame)).toEqual(before.clinical);
  await closeDetail(frame); await noPatientDialogHistory(frame);
});

async function mergeNoteFromOtherDevice(frame, noteId, body) {
  return frame.evaluate(async ({ noteId, body }) => {
    const vault = window.VildaVault;
    const payload = structuredClone(await vault.exportSyncPayload());
    const note = payload.patientNotes.find(row => row.id === noteId);
    if (!note) throw Error('Missing fictional note in real exported payload');
    note.body = body;
    note.updatedAtISO = new Date(Math.max(Date.parse(note.updatedAtISO) + 1000, Date.now())).toISOString();
    await vault.mergeSyncPayload(payload);
    return vault.getPatientNote(noteId);
  }, { noteId, body });
}
async function openExistingNote(frame) {
  await show(frame); const panel = await selectNativeTab(frame, 'notes');
  await panel.locator('.vilda-patient-note-card').first().getByRole('button', { name: 'Edytuj', exact: true }).click();
  await expect(nativeNote(frame)).toBeVisible(); return nativeNote(frame);
}
const CHANGE_BANNER = 'Ta notatka zmieniła się na innym urządzeniu.';
const CONFLICT_NOTICE = 'Nowsza wersja tej notatki jest już w sejfie.';
const RELOAD_NOTE = 'Wczytaj nowszą (porzuci Twój tekst)';

test('home patient: native conflict reload keeps one same-id editor and its second merge warning alive', async ({ page }) => {
  const { frame, id } = await setup(page);
  const saved = await seedGeneral(frame, id, 'Fikcyjny pierwotny tekst przed konfliktem.'); await refresh(frame);
  let editor = await openExistingNote(frame);
  await noteBody(frame).fill('Fikcyjny mój niezapisany tekst przed konfliktem.');
  const second = await mergeNoteFromOtherDevice(frame, saved.id, 'Fikcyjna druga wersja z innego urządzenia.');
  await expect(editor.getByText(CHANGE_BANNER, { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
  await expect(editor.getByText(CONFLICT_NOTICE, { exact: true })).toBeVisible();
  const historyBefore = await nativeHistoryState(frame);
  await editor.getByRole('button', { name: RELOAD_NOTE, exact: true }).click();
  editor = nativeNote(frame);
  await expect(editor).toHaveCount(1); await expect(noteBody(frame)).toHaveValue(second.body);
  expect((await notes(frame, id)).find(note => note.id === saved.id)).toEqual(second);
  expect((await nativeHistoryState(frame)).token).toBe(historyBefore.token);
  expect((await nativeHistoryState(frame)).length).toBe(historyBefore.length);
  await expect(editor.getByText(CHANGE_BANNER, { exact: true })).toBeHidden();
  // The old root's unchanged native cleanup must not unregister the replacement
  // editor's watcher for this same note ID.
  const third = await mergeNoteFromOtherDevice(frame, saved.id, 'Fikcyjna trzecia wersja z kolejnego scalenia.');
  await expect(editor.getByText(CHANGE_BANNER, { exact: true })).toBeVisible();
  await expect(noteBody(frame)).toHaveValue(second.body);
  expect((await notes(frame, id)).find(note => note.id === saved.id)).toEqual(third);
  await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(frame.locator(NOTE)).toHaveCount(0); await expect(frame.locator(DETAIL)).toBeVisible();
  expect((await notes(frame, id)).find(note => note.id === saved.id)).toEqual(third);
});

test('home patient: a delayed native conflict reload cannot resurrect an old note after A to B to A', async ({ page }) => {
  const { frame, id, ids } = await setup(page);
  const saved = await seedGeneral(frame, id, 'Fikcyjna pierwotna notatka A.'); await refresh(frame);
  const editor = await openExistingNote(frame);
  await noteBody(frame).fill('Fikcyjna lokalna wersja A przed zmianą pacjenta.');
  await mergeNoteFromOtherDevice(frame, saved.id, 'Fikcyjna nowsza zapisana wersja A.');
  await editor.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
  await expect(editor.getByText(CONFLICT_NOTICE, { exact: true })).toBeVisible();
  const beforeA = await notes(frame, id), beforeB = await notes(frame, ids.b);
  await frame.evaluate(noteId => {
    const vault = window.VildaVault, original = vault.getPatientNote;
    let release, done;
    const wait = new Promise(resolve => { release = resolve; });
    const completed = new Promise(resolve => { done = resolve; });
    const gate = { entered: 0, completed, release() { vault.getPatientNote = original; release(); } };
    vault.getPatientNote = function (id, ...args) {
      const actual = Reflect.apply(original, this, [id, ...args]);
      if (id !== noteId) return actual;
      return Promise.resolve(actual).then(note => { gate.entered += 1; return wait.then(() => note); }).finally(done);
    };
    window.__patientConflictRead = gate;
  }, saved.id);
  await editor.getByRole('button', { name: RELOAD_NOTE, exact: true }).click();
  await expect.poll(() => frame.evaluate(() => window.__patientConflictRead.entered)).toBeGreaterThan(0);
  await frame.evaluate(() => window.VildaHomePatient.close(true, false));
  await expect(frame.locator(NOTE)).toHaveCount(0); await noPatientDialogHistory(frame);
  await loadPatient(frame, ids.b, 'restore'); await settled(frame);
  await loadPatient(frame, id, 'restore'); await settled(frame);
  await frame.evaluate(async () => {
    const gate = window.__patientConflictRead; gate.release(); await gate.completed;
    await new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); });
    delete window.__patientConflictRead;
  });
  await expect(frame.locator(NOTE)).toHaveCount(0);
  await expect(frame.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
  expect(await notes(frame, id)).toEqual(beforeA); expect(await notes(frame, ids.b)).toEqual(beforeB);
  await refresh(frame); await selectTab(frame, /^Notatki/);
  await expect(currentPanel(frame)).toContainText('Fikcyjna nowsza zapisana wersja A.');
  await expect(currentPanel(frame)).not.toContainText('Fikcyjna lokalna wersja A przed zmianą pacjenta.');
});

async function exactSharedFrame(dialog, referenceBounds) {
  await expect(dialog).toBeVisible();
  await expect.poll(async () => {
    const bounds = await dialog.boundingBox();
    return bounds ? Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Math.round(bounds[key] - referenceBounds[key]) || 0])) : null;
  }).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  const bounds = await dialog.boundingBox();
  for (const key of ['x', 'y', 'width', 'height']) expect(bounds[key]).toBeCloseTo(referenceBounds[key], 0);
  const actual = await dialog.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      viewportWidth: innerWidth, viewportHeight: innerHeight, overflow: node.scrollWidth - node.clientWidth };
  });
  expect(actual.width).toBeCloseTo(Math.min(1000, actual.viewportWidth - 32), 0);
  expect(actual.height).toBeCloseTo(Math.min(820, actual.viewportHeight - 32), 0);
  expect(actual.x).toBeCloseTo((actual.viewportWidth - actual.width) / 2, 0);
  expect(actual.y).toBeCloseTo((actual.viewportHeight - actual.height) / 2, 0);
  expect(actual.overflow).toBeLessThanOrEqual(1);
}
async function clcrTable(frame) {
  await selectTab(frame, /^Badania/); await frame.locator('#vhomePatientLabsOpen').click();
  const history = frame.locator(`${DETAIL} [data-home-patient-view="labs"] .vilda-lab-hist`);
  await expect(history).toHaveAttribute('aria-busy', 'false');
  await history.locator('.vilda-lab-hist-panel-select').selectOption('renal');
  await history.getByRole('button', { name: 'Tabela', exact: true }).click();
  await expect(history.getByRole('button', { name: 'Tabela', exact: true })).toHaveAttribute('aria-pressed', 'true');
  return history;
}

test('home patient: APP native Clcr details and edit/delete Cancel share the frame and cannot outlive a delayed owner read', async ({ page }) => {
  const initial = await setup(page, { shell: true });
  const saved = await createActualAcrNote(page, initial.id, initial.patients.a);
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  const frame = await shellFrame(page); await readyForPatient(frame); await settled(frame); await refresh(frame);
  await expect.poll(() => frame.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(initial.id);
  // The actual calculator owns its dedicated carrier. Native P-CHIP-KLIRENS
  // acknowledges it into MainSession; establish that canonical fixture before
  // testing that later read/edit-Cancel actions leave even metadata unchanged.
  await frame.waitForFunction(() => window.VildaDataImportExport.getSaveReadiness().ready
    && !window.VildaPersistence.isAutosaveSuppressed());
  expect(await frame.evaluate(() => window.VildaDataImportExport.saveMainSessionNow())).toBe(true);
  await expect.poll(() => frame.evaluate(() => {
    return JSON.stringify(window.VildaPersistence.readMainSession()?.clcr)
      === JSON.stringify(window.VildaPersistence.readClcrSession());
  })).toBe(true);
  const beforeA = await notes(frame, initial.id), beforeB = await notes(frame, initial.ids.b), beforeClinical = await clinical(frame);
  let table = await clcrTable(frame);
  const shared = frame.locator(DETAIL), viewportWidth = await frame.evaluate(() => innerWidth);
  // APP sidebars constrain its iframe. The accepted shared frame is at most
  // 1000px and keeps32px inside THAT viewport; standalone1440px is tested above.
  await expect.poll(async () => {
    const bounds = await shared.boundingBox();
    return bounds ? { width: bounds.width, height: bounds.height } : null;
  }).toEqual({ width: Math.min(1000, viewportWidth - 32), height: 820 });
  const referenceBounds = await shared.boundingBox();
  const rowSelector = `.vilda-lab-hist-result-row[data-source="clcr"][data-note-id="${saved.id}"]`;
  await table.locator(rowSelector).click();
  const detail = frame.locator('#detailsDialog'); await exactSharedFrame(detail, referenceBounds);
  for (const [width, height] of [[1440, 1000], [850, 1000], [390, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => shared.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const deltas = { width: rect.width - Math.min(1000, innerWidth - 32),
        height: rect.height - Math.min(820, innerHeight - 32),
        x: rect.x - (innerWidth - rect.width) / 2, y: rect.y - (innerHeight - rect.height) / 2 };
      return Object.fromEntries(Object.entries(deltas).map(([key, value]) => [key, Math.round(value) || 0]));
    })).toEqual({ width: 0, height: 0, x: 0, y: 0 });
    await exactSharedFrame(detail, await shared.boundingBox());
    await detail.getByRole('button', { name: 'Zamknij', exact: true }).click({ trial: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await exactSharedFrame(detail, referenceBounds);
  await expect(detail.locator('#calculationDetails')).toHaveAttribute('data-note-id', saved.id);
  await expect(detail.locator('#editMeasurement')).toBeEnabled();
  await detail.locator('#editMeasurement').click();
  const edit = frame.locator('#editDialog'); await exactSharedFrame(edit, referenceBounds);
  await edit.locator('[data-clcr-edit-field="U_Alb"]').fill('50');
  await browserBackInApp(page);
  await expect(edit).toBeHidden(); await expect(detail).toBeVisible();
  expect(await notes(frame, initial.id)).toEqual(beforeA); expect(await clinical(frame)).toEqual(beforeClinical);
  await detail.locator('#deleteMeasurement').click();
  const remove = frame.locator('#deleteDialog'); await exactSharedFrame(remove, referenceBounds);
  await browserBackInApp(page);
  await expect(remove).toBeHidden(); await expect(detail).toBeVisible();
  expect(await notes(frame, initial.id)).toEqual(beforeA);
  await browserBackInApp(page);
  await expect(detail).toHaveCount(0); await expect(frame.locator(DETAIL)).toBeVisible();
  expect(await notes(frame, initial.id)).toEqual(beforeA); expect(await clinical(frame)).toEqual(beforeClinical);

  // Delay completion of the native detail actor's actual note read. Its cached
  // result was obtained from this real Vault before the owner is invalidated.
  await frame.evaluate(noteId => {
    const vault = window.VildaVault, original = vault.getPatientNote;
    let release, done;
    const wait = new Promise(resolve => { release = resolve; });
    const completed = new Promise(resolve => { done = resolve; });
    const gate = { entered: 0, completed, release() { vault.getPatientNote = original; release(); } };
    vault.getPatientNote = function (id, ...args) {
      const actual = Reflect.apply(original, this, [id, ...args]);
      if (id !== noteId) return actual;
      return Promise.resolve(actual).then(note => { gate.entered += 1; return wait.then(() => note); }).finally(done);
    };
    window.__patientClcrRead = gate;
  }, saved.id);
  table = frame.locator(`${DETAIL} [data-home-patient-view="labs"] .vilda-lab-hist`);
  await table.locator(rowSelector).click();
  await expect.poll(() => frame.evaluate(() => window.__patientClcrRead.entered)).toBeGreaterThan(0);
  await frame.evaluate(() => window.VildaHomePatient.close(true, false));
  await expect(frame.locator('.clcr-result-dialogs')).toHaveCount(0); await noPatientDialogHistory(frame);
  await loadPatient(frame, initial.ids.b, 'restore'); await settled(frame);
  await frame.evaluate(async () => {
    const gate = window.__patientClcrRead; gate.release(); await gate.completed;
    await new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); });
    delete window.__patientClcrRead;
  });
  await expect(frame.locator('.clcr-result-dialogs')).toHaveCount(0);
  await expect(frame.locator('#detailsDialog, #editDialog, #deleteDialog')).toHaveCount(0);
  expect(await notes(frame, initial.id)).toEqual(beforeA); expect(await notes(frame, initial.ids.b)).toEqual(beforeB);
  await expect(page).toHaveURL(/\/app\.html#\/start$/);
});

test('home patient: APP cross-document history jump veto preserves the native dirty child without another push', async ({ page }) => {
  const { frame, id } = await setup(page, { shell: true });
  const before = { records: await records(frame, id), clinical: await clinical(frame) };
  await show(frame); await openExpandedNote(frame);
  const editor = nativeNote(frame); await expect(editor).toBeVisible();
  await noteBody(frame).fill('Fikcyjny tekst zachowany po skoku przez dwa wpisy historii.');
  await frame.evaluate(() => { window.__patientMenuJumpRoot = document.querySelector('.vilda-patient-note-editor-overlay'); });
  const opened = await nativeHistoryState(frame); expect(opened.current).toBe(true); expect(opened.dialogs).toBe(2);
  const question = page.waitForEvent('dialog');
  // Native gr() owns the child within one auth history entry. A genuine -2
  // jump crosses the document, so the native Qbu beforeunload veto is the
  // authority; its message is browser-controlled rather than the local prompt.
  await frame.evaluate(() => history.go(-2));
  const confirmation = await question;
  expect(confirmation.type()).toBe('beforeunload'); expect(confirmation.message()).toBe('');
  await confirmation.dismiss();
  await expect.poll(async () => (await nativeHistoryState(frame)).current).toBe(true);
  expect((await nativeHistoryState(frame)).length).toBe(opened.length);
  expect((await nativeHistoryState(frame)).dialogs).toBe(opened.dialogs);
  expect(await frame.evaluate(() => document.querySelector('.vilda-patient-note-editor-overlay') === window.__patientMenuJumpRoot)).toBe(true);
  await expect(noteBody(frame)).toHaveValue('Fikcyjny tekst zachowany po skoku przez dwa wpisy historii.');
  await expect(frame.locator(DETAIL)).toBeVisible(); await expect(page).toHaveURL(/\/app\.html#\/start$/);
  expect(await records(frame, id)).toEqual(before.records); expect(await clinical(frame)).toEqual(before.clinical);
  page.once('dialog', dialog => dialog.accept()); await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(frame.locator(NOTE)).toHaveCount(0); await expect(frame.locator(DETAIL)).toBeVisible();
  await closeDetail(frame); await noPatientDialogHistory(frame);
  expect(await records(frame, id)).toEqual(before.records);
  await frame.evaluate(() => { delete window.__patientMenuJumpRoot; });
});

async function restoreLockObserver(frame) {
  if (frame.isDetached()) return;
  try { await frame.evaluate(() => { window.__patientRestoreLockObserver?.restore(); delete window.__patientRestoreLockObserver; }); }
  catch (error) { if (!frame.isDetached() && !/Execution context was destroyed/.test(error.message)) throw error; }
}

test('home patient: APP lock while a rejected Back has queued its native forward restore clears the old note permanently', async ({ page }) => {
  const reports = [];
  // Native frame-sync reloads the entire APP after real lock. Send immutable
  // observations to Node before that reload destroys the old execution realm.
  await page.exposeFunction('__patientRestoreLockReport', report => { reports.push(report); });
  const { frame } = await setup(page, { shell: true });
  await openNewNote(frame); await noteBody(frame).fill('Fikcyjna prywatna treść przed blokadą w trakcie Wstecz.');
  const opened = await historyState(frame);
  await frame.evaluate(() => {
    const vault = window.VildaVault, nativeHistory = history, nativeGo = nativeHistory.go, originals = {};
    const observer = { queuedLocks: 0, calls: [], oldRoot: document.querySelector('.vilda-patient-note-editor-overlay') };
    function report(source) {
      const result = { source, queuedLocks: observer.queuedLocks, calls: observer.calls.slice(),
        connected: observer.oldRoot.isConnected, text: observer.oldRoot.textContent,
        length: nativeHistory.length, tokens: nativeHistory.state?.vildaHomeDialogStack?.tokens || [] };
      void window.__patientRestoreLockReport(result).catch(() => { /* A completed native reload has destroyed this realm. */ });
    }
    for (const name of ['savePatientNote', 'savePatientNoteOnce', 'updateExistingPatientNote', 'removePatientNote', 'removeExistingPatientNote']) {
      if (typeof vault[name] !== 'function') continue;
      const original = vault[name]; originals[name] = original;
      vault[name] = function (...args) { observer.calls.push(name); return Reflect.apply(original, this, args); };
    }
    nativeHistory.go = function (...args) {
      // Forward the actual browser operation unchanged. Lock synchronously only
      // AFTER the coordinator has queued its real forward restore, before that
      // queued browser event can execute. No timer or product flag is changed.
      const value = Reflect.apply(nativeGo, this, args);
      if (Number(args[0]) > 0 && observer.queuedLocks === 0) { observer.queuedLocks += 1; vault.lock(); }
      return value;
    };
    const onPop = () => { report('popstate'); }, onPageHide = () => { report('pagehide'); };
    addEventListener('popstate', onPop, true); addEventListener('pagehide', onPageHide);
    const unsubscribe = vault.onLock(() => { queueMicrotask(() => { report('lock'); }); });
    observer.restore = () => {
      nativeHistory.go = nativeGo;
      for (const [name, original] of Object.entries(originals)) vault[name] = original;
      removeEventListener('popstate', onPop, true); removeEventListener('pagehide', onPageHide);
      if (typeof unsubscribe === 'function') unsubscribe();
    };
    window.__patientRestoreLockObserver = observer;
  });
  try {
    const question = page.waitForEvent('dialog');
    const back = browserBackInApp(page);
    const confirmation = await question; expect(confirmation.message()).toContain('niezapisan'); await confirmation.dismiss();
    await back;
    await expect.poll(() => reports.filter(report => report.source === 'lock').length).toBeGreaterThan(0);
    const locked = reports.find(report => report.source === 'lock');
    expect(locked.queuedLocks).toBe(1); expect(locked.calls).toEqual([]);
    expect(locked.connected).toBe(false); expect(locked.text).toBe(''); expect(locked.length).toBe(opened.length);
    await expect.poll(() => reports.some(report => report.queuedLocks === 1 && report.tokens.length === 0)).toBe(true);
    await test.info().attach('lock-report-timeline', {
      body: Buffer.from(JSON.stringify(reports, null, 2)), contentType: 'application/json',
    });
    for (const report of reports) {
      expect(report.calls).toEqual([]);
      expect(report.length).toBe(opened.length);
      // A capture-phase observer can see the original Back before the native
      // dirty veto queues its forward restore and the real lock. Its still-live
      // editor is expected. Every observation after that lock must stay wiped.
      if (report.queuedLocks === 0) {
        expect(report.source).toBe('popstate'); expect(report.connected).toBe(true);
        expect(report.text.length).toBeGreaterThan(0);
      } else {
        expect(report.queuedLocks).toBe(1);
        expect(['lock', 'popstate', 'pagehide']).toContain(report.source);
        expect(report.connected).toBe(false); expect(report.text).toBe('');
      }
    }
    // The fresh shell must also remain locked. Do not retain an invalid Frame
    // after the native synchronization reload, or replace that reload in tests.
    await expect.poll(async () => {
      try { return await page.evaluate(() => !!window.VildaVault && window.VildaVault.isUnlocked() === false); }
      catch (error) {
        if (!/Execution context was destroyed|Cannot find context/.test(error.message)) throw error;
        return false;
      }
    }).toBe(true);
    await expect.poll(async () => {
      let count = 0;
      for (const current of page.frames()) {
        if (current.isDetached()) continue;
        try { count += await current.locator('#vhomePatientNoteDialog, .vilda-patient-note-editor-overlay').count(); }
        catch (error) { if (!current.isDetached() && !/Execution context was destroyed/.test(error.message)) throw error; }
      }
      return count;
    }).toBe(0);
    await expect(page).toHaveURL(/\/app\.html#\/start$/);
  } finally {
    // A destroyed realm has already discarded these observational wrappers.
    await restoreLockObserver(frame);
  }
});

test('home patient: APP desktop card heights follow the real device viewport while tablet and phone keep natural content', async ({ page }) => {
  const { frame, id } = await setup(page, { shell: true });
  await seedGeneral(frame, id); await refresh(frame);
  const before = { records: await records(frame, id), clinical: await clinical(frame) };
  const selectors = ['#vhomeGrowthCard', CARD, '#vhomeDietCard'];
  for (const width of [1920, 1440, 1280, 1025, 1024, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => innerWidth)).toBe(width);
    for (const name of [/^Badania/, /^Plany/, /^Notatki/]) {
      await selectTab(frame, name);
      if (width > 1024) {
        await expect.poll(async () => Promise.all(selectors.map(selector => frame.locator(selector)
          .evaluate(node => node.getBoundingClientRect().height)))).toEqual([352, 352, 352]);
      } else {
        await expect.poll(async () => Promise.all(selectors.map(selector => frame.locator(selector).evaluate(node => ({
          min: parseFloat(getComputedStyle(node).minHeight) || 0, max: getComputedStyle(node).maxHeight,
        }))))).toEqual([{ min: 0, max: 'none' }, { min: 0, max: 'none' }, { min: 0, max: 'none' }]);
      }
      expect(await frame.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    if (width === 1920 || width === 1440) {
      const boxes = await Promise.all(selectors.map(selector => frame.locator(selector).boundingBox()));
      expect(boxes[1].y).toBe(boxes[0].y); expect(boxes[1].width).toBe(boxes[0].width);
      expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width);
      expect(boxes[2].y).toBeGreaterThanOrEqual(boxes[0].y + boxes[0].height);
      if (width === 1440) {
        // This actual sidebar-constrained iframe is narrower than1024px,
        // while its containing device is a desktop and all previews stay352px.
        expect(await frame.evaluate(() => innerWidth)).toBeLessThanOrEqual(1024);
      }
    }
  }
  expect(await records(frame, id)).toEqual(before.records);
  expect(await clinical(frame)).toEqual(before.clinical);
});
