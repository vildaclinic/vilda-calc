import { expect, test } from '@playwright/test';
import { clinicalFingerprint, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { CARE_FORM, CARE_WORKSPACE, careFixture, mutatePlan, openCarePlans, readPlan, selectPlan } from '../support/care-plans-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

async function planMenuAction(panel, name) {
  const action = panel.getByRole('button', { name, exact: true });
  if (!await action.isVisible()) await panel.getByLabel('Opcje planu', { exact: true }).click();
  await action.click();
}

test('care plans: create from searchable patient picker, cancel without writes and keep independent parallel steps', async ({ page }) => {
  const created = await careFixture(page, { seed: false });
  const panel = await openCarePlans(page);
  const create = page.locator(CARE_WORKSPACE).getByRole('button', { name: 'Nowy plan opieki', exact: true });
  const before = await created.frame.evaluate(() => window.VildaVault.listCarePlans());
  for (const cross of [true, false]) {
    await create.click();
    const form = page.locator(CARE_FORM);
    await form.getByRole('searchbox', { name: 'Szukaj pacjenta', exact: true }).fill('Antoni');
    await form.getByRole('button', { name: 'Fikcyjny Antoni', exact: true }).click();
    await form.getByLabel('Nazwa planu', { exact: true }).fill('Fikcyjny niezapisany plan');
    await form.getByRole('button', { name: cross ? 'Anuluj formularz planu' : 'Anuluj', exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(await created.frame.evaluate(() => window.VildaVault.listCarePlans())).toEqual(before);
  }
  await create.click();
  const form = page.locator(CARE_FORM);
  await form.getByRole('searchbox', { name: 'Szukaj pacjenta', exact: true }).fill('Antoni');
  await form.getByRole('button', { name: 'Fikcyjny Antoni', exact: true }).click();
  await form.getByRole('button', { name: 'Wyczyść wybór', exact: true }).click();
  await expect(form.getByRole('searchbox', { name: 'Szukaj pacjenta', exact: true })).toBeVisible();
  await form.getByRole('searchbox', { name: 'Szukaj pacjenta', exact: true }).fill('Beata');
  await form.getByRole('button', { name: 'Fikcyjny Beata', exact: true }).click();
  await form.getByLabel('Nazwa planu', { exact: true }).fill('Fikcyjny nowy plan równoległy');
  await form.getByLabel('Cel i ustalenia (opcjonalnie)', { exact: true }).fill('Indywidualne fikcyjne kroki lekarza.');
  await form.getByRole('button', { name: 'Utwórz plan', exact: true }).click();
  await expect(form).toHaveCount(0);
  const plan = (await created.frame.evaluate(() => window.VildaVault.listCarePlans())).find(p => p.title === 'Fikcyjny nowy plan równoległy');
  expect(plan.patientId).toBe(created.ids.b);
  await selectPlan(panel, plan.id);
  for (const title of ['Fikcyjna pierwsza konsultacja', 'Fikcyjna druga konsultacja']) {
    await panel.getByRole('button', { name: /Dodaj krok$/ }).click();
    await form.getByLabel('Co jest do zrobienia?', { exact: true }).fill(title);
    await form.getByRole('button', { name: 'Dodaj krok', exact: true }).click();
    await expect(form).toHaveCount(0);
  }
  const saved = await readPlan(created.frame, plan.id);
  expect(saved.steps).toHaveLength(2);
  expect(saved.steps.every(step => step.state === 'pending' && !step.calendarNoteId)).toBe(true);
  expect(saved.steps.map(step => step.title)).toEqual(['Fikcyjna pierwsza konsultacja', 'Fikcyjna druga konsultacja']);
});

test('care plans: biopsy result is in the real patient record and adds a future control without an early reminder', async ({ page }) => {
  const created = await careFixture(page);
  const clinical = await clinicalFingerprint(created.frame, created.ids.a);
  const panel = await openCarePlans(page);
  await selectPlan(panel, created.plans.biopsy);
  await panel.locator(`[data-step-id="${created.steps.awaiting}"]`).getByRole('button', { name: 'Wpisz wynik', exact: true }).click();
  const form = page.locator(CARE_FORM);
  await form.getByLabel('Treść wyniku', { exact: true }).fill('Fikcyjny wynik biopsji: dokumentację omówiono z rodzicem.');
  await form.getByLabel('Dodaję kolejny krok', { exact: true }).check();
  await form.getByLabel('Kolejny krok', { exact: true }).fill('Fikcyjna kontrola za sześć miesięcy');
  await form.getByLabel('Przypomnij w dniu', { exact: true }).fill('2027-04-29');
  await form.getByRole('button', { name: 'Zapisz wynik', exact: true }).click();
  await expect(form).toHaveCount(0);
  const plan = await readPlan(created.frame, created.plans.biopsy);
  expect(plan.status).toBe('active'); expect(plan.needsDecision).toBe(false);
  const received = plan.steps.find(step => step.id === created.steps.awaiting);
  expect(received.state).toBe('done'); expect(received.resultNoteId).toBeTruthy();
  const result = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), received.resultNoteId);
  expect(result.patientId).toBe(created.ids.a); expect(result.body).toContain('Fikcyjny wynik biopsji: dokumentację omówiono z rodzicem.');
  expect(result.labResult.value).toContain('Wynik opisowy'); expect(result.clinicalDateISO).toBeNull();
  const control = plan.steps.find(step => step.title === 'Fikcyjna kontrola za sześć miesięcy');
  expect(control).toMatchObject({ state: 'pending', reminderDateISO: '2027-04-29' });
  const due = await created.frame.evaluate(async () => (await window.VildaVault.listPatientNotesDueByDate()).flatMap(group => group.notes || []));
  expect(due.some(note => note.id === control.reminderNoteId || note.id === received.reminderNoteId)).toBe(false);
  expect(await clinicalFingerprint(created.frame, created.ids.a)).toEqual(clinical);
  await panel.locator(`[data-step-id="${received.id}"]`).getByRole('button', { name: 'Otwórz wynik', exact: true }).click();
  const preview = panel.locator(`.vcp-record[data-note-id="${result.id}"]`);
  await expect(preview).toBeVisible();
  await expect(preview.locator('.vcp-record-body')).toHaveText(result.body);
  expect(await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), result.id)).toEqual(result);
});

test('care plans: a received MR result preserves parallel GH steps and a deferred decision remains explicitly open', async ({ page }) => {
  const created = await careFixture(page);
  const panel = await openCarePlans(page);
  await selectPlan(panel, created.plans.gh);
  const original = await readPlan(created.frame, created.plans.gh);
  await panel.locator(`[data-step-id="${created.steps.gh.mr}"]`).getByRole('button', { name: 'Wpisz wynik', exact: true }).click();
  const form = page.locator(CARE_FORM);
  await expect(form.getByLabel('Plan ma już dalsze kroki', { exact: true })).toBeChecked();
  await form.getByLabel('Treść wyniku', { exact: true }).fill('Fikcyjny opis MR przysadki dołączony do dokumentacji.');
  await form.getByRole('button', { name: 'Zapisz wynik', exact: true }).click();
  await expect(form).toHaveCount(0);
  const gh = await readPlan(created.frame, created.plans.gh);
  expect(gh.status).toBe('active'); expect(gh.steps).toHaveLength(5);
  expect(gh.steps.filter(step => step.state === 'pending')).toHaveLength(3);
  for (const stepId of [created.steps.gh.second, created.steps.gh.eye, created.steps.gh.application]) {
    expect(gh.steps.find(step => step.id === stepId)).toEqual(original.steps.find(step => step.id === stepId));
  }
  await selectPlan(panel, created.plans.biopsy);
  await panel.locator(`[data-step-id="${created.steps.awaiting}"]`).getByRole('button', { name: 'Wpisz wynik', exact: true }).click();
  await form.getByLabel('Treść wyniku', { exact: true }).fill('Fikcyjny wynik do późniejszego ustalenia postępowania.');
  await form.getByLabel('Ustalę później', { exact: true }).check();
  await form.getByLabel('Kiedy wrócić do ustalenia dalszego postępowania?', { exact: true }).fill('2026-10-30');
  await form.getByRole('button', { name: 'Zapisz wynik', exact: true }).click();
  await expect(form).toHaveCount(0);
  const biopsy = await readPlan(created.frame, created.plans.biopsy);
  expect(biopsy).toMatchObject({ status: 'active', needsDecision: true, decisionDueDateISO: '2026-10-30' });
  await expect(panel.locator('.vcp-detail')).toContainText('Dalsze postępowanie do ustalenia');
  await page.reload({ waitUntil: 'load' }); await readyForPatient(page);
  expect(await readPlan(page, biopsy.id)).toMatchObject({ status: 'active', needsDecision: true, decisionDueDateISO: '2026-10-30' });
});

test('care plans: existing calendar record is linked once and manual closure records unperformed steps without claiming a surgery', async ({ page }) => {
  const created = await careFixture(page);
  const panel = await openCarePlans(page); await selectPlan(panel, created.plans.biopsy);
  const eventBefore = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), created.event);
  await planMenuAction(panel, 'Dołącz istniejący termin');
  const form = page.locator(CARE_FORM);
  await form.getByLabel('Wybierz termin', { exact: true }).selectOption(created.event);
  await form.getByRole('button', { name: 'Dołącz termin', exact: true }).click();
  await expect(form).toHaveCount(0);
  const linked = await readPlan(created.frame, created.plans.biopsy);
  expect(linked.steps.filter(step => step.calendarNoteId === created.event)).toHaveLength(1);
  const calendar = await created.frame.evaluate(() => window.VildaVault.listPatientNotesInRange('2026-11-12', '2026-11-12T23:59:59.999Z'));
  expect(calendar.filter(note => note.title === eventBefore.title).map(note => note.id)).toEqual([created.event]);
  const eventLinked = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), created.event);
  expect(eventLinked.dueDateISO).toBe(eventBefore.dueDateISO); expect(eventLinked.completedAtISO).toBeNull();
  await planMenuAction(panel, 'Zamknij plan');
  await form.getByLabel('Powód zamknięcia', { exact: true }).selectOption({ label: 'Opiekę przekazano innemu specjaliście' });
  await form.getByLabel('Ustalenia / komu przekazano opiekę?', { exact: true }).fill('Fikcyjne skierowanie do poradni chirurgicznej. Dalsze prowadzenie przekazano.');
  await form.getByRole('button', { name: 'Zamknij plan', exact: true }).click();
  expect((await readPlan(created.frame, linked.id)).status).toBe('active');
  await form.getByLabel('Kończę pozostałe kroki jako niewykonane', { exact: true }).check();
  await form.getByRole('button', { name: 'Zamknij plan', exact: true }).click();
  await expect(form).toHaveCount(0);
  const closed = await readPlan(created.frame, linked.id);
  expect(closed.status).toBe('closed'); expect(closed.closeText).toContain('Dalsze prowadzenie przekazano');
  expect(closed.steps.filter(step => step.state === 'done')).toHaveLength(1);
  expect(closed.steps.filter(step => step.state === 'cancelled')).toHaveLength(2);
  expect((await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), created.event)).completedAtISO).toBeNull();
  await planMenuAction(panel, 'Wznów plan');
  await form.getByRole('button', { name: 'Wznów plan', exact: true }).click();
  await expect(form).toHaveCount(0);
  const resumed = await readPlan(created.frame, linked.id);
  expect(resumed.status).toBe('active'); expect(resumed.log.length).toBeGreaterThan(closed.log.length);
  expect(resumed.steps).toEqual(closed.steps);
});

test('care plans: real embedded inline heading, fixed search and patient plans read the same records', async ({ page }) => {
  const created = await careFixture(page, { shell: true, seed: false });
  const plans = [];
  for (let index = 0; index < 9; index += 1) {
    plans.push((await mutatePlan(created.frame, created.ids.a, null, 'create', {
      title: 'Fikcyjny plan przewijania ' + index, goal: 'Fikcyjny cel przewijania.',
    })).planId);
  }
  const inline = created.frame.locator('#remindersInline');
  await inline.getByRole('button', { name: 'Plany opieki', exact: true }).click();
  await expect(inline.locator('.vcp')).toBeVisible();
  await expect(inline.locator('[data-plan-id]')).toHaveCount(plans.length);
  await expect(inline.getByRole('button', { name: 'Nowy plan opieki', exact: true })).toBeVisible();
  const panel = await openCarePlans(page);
  const search = panel.locator('.vcp-search'), list = panel.locator('.vcp-list');
  const before = await search.boundingBox();
  await list.evaluate(node => { node.scrollTop = node.scrollHeight; });
  expect(await list.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  expect(Math.abs((await search.boundingBox()).y - before.y)).toBeLessThan(1);
  await page.locator(CARE_WORKSPACE).getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
  await created.frame.evaluate(id => window.VildaAuthUI.showPatientCard(id, null, null), created.ids.a);
  const patient = created.frame.locator('.vilda-auth-patient-card');
  await expect(patient).toBeVisible();
  await patient.getByRole('button', { name: 'Plany opieki', exact: true }).click();
  await expect(patient.locator('.vcp [data-plan-id]')).toHaveCount(plans.length);
  await page.goto('/app.html#/start'); const restored = await shellFrame(page); await readyForPatient(restored);
  expect((await restored.evaluate(() => window.VildaVault.listCarePlans())).map(plan => plan.id).sort()).toEqual(plans.sort());
});

test('care plans: native reminder form can add a timed step to the selected patient plan and still save a standalone reminder', async ({ page }) => {
  const created = await careFixture(page);
  const before = await readPlan(created.frame, created.plans.gh);
  await page.locator('#vildaRemindersBtn').click();
  const workspace = page.locator(CARE_WORKSPACE);
  await expect(workspace.locator('[data-tab=active]')).toHaveAttribute('aria-pressed', 'true');
  await workspace.getByRole('button', { name: 'Dodaj przypomnienie', exact: true }).click();
  const form = workspace.locator('.vb22-reminder-form');
  await form.getByRole('searchbox', { name: 'Szukaj pacjenta', exact: true }).fill('Beata');
  await form.locator(`[data-patient-id="${created.ids.b}"]`).click();
  await form.getByLabel('Plan opieki (opcjonalnie)', { exact: true }).selectOption(created.plans.gh);
  await form.getByLabel('Treść przypomnienia', { exact: true }).fill('Fikcyjne przypomnienie powiązane z planem');
  await form.getByLabel('Przypomnij w dniu', { exact: true }).fill('2026-10-29');
  await form.getByLabel('Godzina (opcjonalnie)', { exact: true }).fill('14:35');
  await form.getByLabel('Dodatkowe informacje (opcjonalnie)', { exact: true }).fill('Fikcyjny opis nowego kroku dokumentacji.');
  await form.getByRole('button', { name: 'Zapisz przypomnienie', exact: true }).click();
  await expect.poll(async () => (await readPlan(created.frame, before.id)).steps.length).toBe(before.steps.length + 1);
  const linked = await readPlan(created.frame, before.id);
  const step = linked.steps.find(s => s.title === 'Fikcyjne przypomnienie powiązane z planem');
  expect(step).toMatchObject({ state: 'pending', reminderDateISO: '2026-10-29', reminderTime: '14:35' });
  const note = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), step.reminderNoteId);
  expect(note).toMatchObject({ patientId: created.ids.b, dueTime: '14:35', careContext: { planId: linked.id } });
  const duplicates = await created.frame.evaluate(async patientId => (await window.VildaVault.listPatientNotesForPatient(patientId)).filter(n => n.title === 'Fikcyjne przypomnienie powiązane z planem').map(n => n.id), created.ids.b);
  expect(duplicates).toEqual([step.reminderNoteId]);
  await workspace.locator('[data-tab=active]').click();
  await workspace.locator(`[data-note-id="${step.reminderNoteId}"]`).click();
  await expect(workspace.locator('[data-tab=plans]')).toHaveAttribute('aria-pressed', 'true');
  await expect(workspace.locator('.vcp-title')).toHaveText(linked.title);
  await workspace.locator('[data-tab=active]').click();
  await workspace.getByRole('button', { name: 'Dodaj przypomnienie', exact: true }).click();
  await form.getByRole('searchbox', { name: 'Szukaj pacjenta', exact: true }).fill('Beata');
  await form.locator(`[data-patient-id="${created.ids.b}"]`).click();
  await expect(form.getByLabel('Plan opieki (opcjonalnie)', { exact: true })).toHaveValue('');
  await form.getByLabel('Treść przypomnienia', { exact: true }).fill('Fikcyjne samodzielne przypomnienie bez planu');
  await form.getByLabel('Godzina (opcjonalnie)', { exact: true }).fill('11:45');
  await form.getByRole('button', { name: 'Zapisz przypomnienie', exact: true }).click();
  await expect(workspace.locator('[data-tab=active]')).toHaveAttribute('aria-pressed', 'true');
  await expect(workspace.locator('.vb22-detail-title')).toHaveText('Fikcyjne samodzielne przypomnienie bez planu');
  const standalone = await created.frame.evaluate(async patientId => (await window.VildaVault.listPatientNotesForPatient(patientId)).find(n => n.title === 'Fikcyjne samodzielne przypomnienie bez planu'), created.ids.b);
  expect(standalone).toMatchObject({ patientId: created.ids.b, dueTime: '11:45', reminderContext: { kind: 'reminder' } });
  expect(standalone.careContext).toBeFalsy();
  expect((await readPlan(created.frame, linked.id)).steps).toEqual(linked.steps);
});

test('care plans: the linked calendar editor is hittable above reminders and changes the same event without moving its reminder', async ({ page }) => {
  const created = await careFixture(page);
  let panel = await openCarePlans(page); await selectPlan(panel, created.plans.gh);
  const original = await readPlan(created.frame, created.plans.gh);
  const step = original.steps.find(s => s.id === created.steps.gh.second);
  const before = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), step.calendarNoteId);
  await panel.locator(`[data-step-id="${step.id}"]`).getByRole('button', { name: 'Otwórz termin ↗', exact: true }).click();
  const editor = page.locator('.vilda-patient-note-editor-overlay');
  const body = editor.locator('textarea').first();
  await expect(body).toBeVisible();
  expect(await body.evaluate(node => {
    const r = node.getBoundingClientRect(), target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return target === node || node.contains(target);
  }), 'native calendar editor receives the pointer instead of the underlying reminder dialog').toBe(true);
  await body.fill('Fikcyjny niezapisany opis terminu planu.');
  page.once('dialog', dialog => dialog.accept());
  await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), step.calendarNoteId)).toEqual(before);
  await expect(page.locator(CARE_WORKSPACE)).toBeVisible();
  panel = page.locator(CARE_WORKSPACE).locator('.vcp');
  await expect(panel).toBeVisible();
  await selectPlan(panel, original.id);
  await panel.locator(`[data-step-id="${step.id}"]`).getByRole('button', { name: 'Otwórz termin ↗', exact: true }).click();
  await expect(editor).toBeVisible();
  await editor.locator('input[type=date]:not(.b3-clinical-date)').fill('2026-11-10');
  await editor.locator('input[type=time]').fill('09:45');
  await body.fill('Fikcyjny termin hospitalizacji przesunięty po uzgodnieniu.');
  await editor.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => (await readPlan(created.frame, original.id)).steps.find(s => s.id === step.id).eventDateISO).toBe('2026-11-10');
  const changed = await readPlan(created.frame, original.id), changedStep = changed.steps.find(s => s.id === step.id);
  expect(changedStep.calendarNoteId).toBe(step.calendarNoteId);
  expect(changedStep.reminderDateISO).toBe(step.reminderDateISO);
  const event = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), step.calendarNoteId);
  expect(event.dueDateISO.slice(0, 10)).toBe('2026-11-10'); expect(event.dueTime).toBe('09:45');
  expect(event.body).toContain('Fikcyjny termin hospitalizacji przesunięty po uzgodnieniu.');
  const helper = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), step.reminderNoteId);
  expect(helper.dueDateISO.slice(0, 10)).toBe(step.reminderDateISO);
});

test('care plans: direct patient-card navigation scopes records to that patient and keeps search above a scrolling list', async ({ page }) => {
  const created = await careFixture(page, { shell: true, seed: false });
  const own = [];
  for (let index = 0; index < 12; index += 1) own.push((await mutatePlan(created.frame, created.ids.a, null, 'create', {
    title: 'Fikcyjny plan karty pacjenta ' + String(index).padStart(2, '0'), goal: 'Fikcyjny cel tego pacjenta.',
  })).planId);
  const other = await mutatePlan(created.frame, created.ids.b, null, 'create', { title: 'Fikcyjny plan innego pacjenta' });
  await created.frame.evaluate(id => window.VildaAuthUI.showPatientCard(id, null, null), created.ids.a);
  const patient = created.frame.locator('.vilda-auth-patient-card');
  await expect(patient).toBeVisible();
  const careSection = patient.locator('.vilda-patient-care-section');
  await expect(careSection).toBeHidden();
  await patient.getByRole('button', { name: 'Plany opieki', exact: true }).click();
  await expect(careSection).toBeVisible();
  const panel = patient.locator('.vcp'), list = panel.locator('.vcp-list'), search = panel.locator('.vcp-search');
  await expect(panel.locator('[data-plan-id]')).toHaveCount(12);
  await expect(panel.locator(`[data-plan-id="${other.planId}"]`)).toHaveCount(0);
  await expect(page.locator(CARE_WORKSPACE)).toHaveCount(0);
  const rowStyle = await list.locator('.vcp-row').first().evaluate(row => {
    const rowStyle = getComputedStyle(row), nameStyle = getComputedStyle(row.querySelector('.vcp-patient'));
    const list = row.closest('.vcp-list'), listStyle = getComputedStyle(list);
    return { fontSize: parseFloat(nameStyle.fontSize), fontWeight: nameStyle.fontWeight, shadow: rowStyle.boxShadow,
      rowWidth: row.getBoundingClientRect().width,
      availableWidth: list.clientWidth - parseFloat(listStyle.paddingLeft) - parseFloat(listStyle.paddingRight) };
  });
  expect(rowStyle.fontSize, 'patient typography matches actual 16.8px input values').toBeCloseTo(16.8, 1);
  expect(rowStyle.fontWeight).toBe('400'); expect(rowStyle.shadow).toBe('none');
  expect(Math.abs(rowStyle.rowWidth - rowStyle.availableWidth), 'rows fill the list instead of inheriting compact global button dimensions').toBeLessThan(2);
  // Hover first lets Playwright bring the partly clipped patient-card panel
  // into view. Measure the wheel action after that browser-managed scroll.
  await list.hover();
  const before = await search.boundingBox();
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => list.evaluate(node => node.scrollTop)).toBeGreaterThan(100);
  expect(Math.abs((await search.boundingBox()).y - before.y)).toBeLessThan(1);
  expect(await search.evaluate(node => {
    const r = node.getBoundingClientRect(), target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return target === node || node.contains(target);
  })).toBe(true);
  await search.fill('karty pacjenta 11');
  await expect(panel.locator('[data-plan-id]')).toHaveCount(1);
  await selectPlan(panel, own[11]);
  await expect(panel.locator('.vcp-title')).toHaveText('Fikcyjny plan karty pacjenta 11');
  expect((await readPlan(created.frame, own[11])).patientId).toBe(created.ids.a);
  await patient.getByRole('button', { name: 'Notatki', exact: true }).click();
  await expect(careSection).toBeHidden();
});
