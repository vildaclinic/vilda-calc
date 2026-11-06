import { expect } from '@playwright/test';
import { createFictionalVault, loadPatient, readyForPatient, shellFrame } from './centile-live-fixture.mjs';

export const SGA_TILE = '[data-patient-sga-tile]';
export const SGA_DIALOG = '.vilda-patient-sga-dialog';
export const SGA_INPUT = Object.freeze({ sex: 'male', weeks: '34', days: '2', weight: '1650', length: '41', head: '29' });

// A real encrypted vault in a fresh browser context. The existing fixture only
// grants PRO to its fictional account; SGA calculation, capture, save and UI run
// their production code without substituting an engine or an assessment.
export async function openSgaFixture(page, { shell = false } = {}) {
  const created = await createFictionalVault(page, { shell });
  let frame;
  if (shell) {
    await page.evaluate(() => window.VildaShell.navigate('docpro'));
    frame = await shellFrame(page, 'DocPro');
  } else {
    await page.goto('/docpro.html', { waitUntil: 'load' });
    frame = page;
  }
  await readyForPatient(frame);
  const confirmation = frame.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await loadPatient(frame, created.ids.a, 'restore');
  await expect(frame.locator('#height')).toHaveValue('158');
  await frame.waitForFunction(() => Boolean(window.vildaSgaBirthPersistApi));
  return { ...created, frame, shell };
}

export async function computeSga(frame, { inputs = SGA_INPUT, sources = ['niklasson'] } = {}) {
  // The SGA switch can be below the fold or under a collapsed professional
  // toolbar. Invoke its actual click handler, then enter data through controls.
  await frame.evaluate(() => {
    const card = document.getElementById('sgaBirthCard');
    if (!card.style.display || card.style.display === 'none') document.getElementById('toggleSgaBirth').click();
  });
  await frame.locator(`label:has(input[name="sgaBirthSex"][value="${inputs.sex}"])`).click();
  await frame.locator('#sgaBirthWeeks').selectOption(inputs.weeks);
  await frame.locator('#sgaBirthDays').selectOption(inputs.days);
  for (const [key, id] of [['weight', 'sgaBirthWeight'], ['length', 'sgaBirthLength'], ['head', 'sgaBirthHead']]) {
    await frame.locator('#' + id).fill(inputs[key] || '');
  }
  // Select wanted sources first: the form deliberately keeps at least one on.
  for (const source of sources) {
    const control = frame.locator(`input[name="sgaBirthSource"][value="${source}"]`);
    if (!await control.isChecked()) await frame.locator(`label:has(input[name="sgaBirthSource"][value="${source}"])`).click();
  }
  for (const source of ['niklasson', 'intergrowth', 'malewski'].filter(value => !sources.includes(value))) {
    const control = frame.locator(`input[name="sgaBirthSource"][value="${source}"]`);
    if (await control.isChecked()) await frame.locator(`label:has(input[name="sgaBirthSource"][value="${source}"])`).click();
  }
  await frame.locator('#computeSgaBirth').click();
  await expect(frame.locator('#sgaBirthResults')).toHaveAttribute('data-has-computed', '1');
  const birth = await frame.evaluate(() => window.vildaSgaBirthPersistApi.captureStateReadOnly());
  expect(birth.assessment?.version, 'explicit Calculate captures a genuine assessment').toBe(1);
  expect(birth.assessment?.computedAtISO).toBeTruthy();
  expect(birth.assessment?.requestedSourceKeys).toEqual(sources);
  return birth;
}

export async function saveSga(frame, patientId) {
  const expected = await frame.evaluate(() => window.collectUserData().birth);
  const before = await frame.evaluate(id => window.VildaVault.getPatient(id), patientId);
  await frame.evaluate(async () => { await window.saveUserData(); });
  await expect.poll(async () => {
    const record = await frame.evaluate(id => window.VildaVault.getPatient(id), patientId);
    return record.snapshots[0].payload.birth;
  }, { message: 'global Save persists the actual captured SGA data' }).toEqual(expected);
  const after = await frame.evaluate(id => window.VildaVault.getPatient(id), patientId);
  expect(after.snapshotCount, 'an explicit save produces a saved patient version').toBeGreaterThan(before.snapshotCount);
  // Let the real success toast finish before measuring/photographing the UI;
  // in app.html its owner is the outer shell rather than the DocPro frame.
  await expect(frame.locator('#vildaDymek:visible, #vildaSaveFeedback:visible')).toHaveCount(0, { timeout: 10_000 });
  if (typeof frame.page === 'function') await expect(frame.page().locator('#vildaDymek:visible, #vildaSaveFeedback:visible')).toHaveCount(0, { timeout: 10_000 });
  return after;
}

export async function reloadSavedSga(frame, patientId) {
  await frame.evaluate(id => window.VildaAuthUI.showPatientCard(id, record => {
    if (record) window.applyLoadedData(record);
  }), patientId);
  await expect.poll(() => frame.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  const before = await frame.evaluate(async id => ({
    record: await window.VildaVault.getPatient(id),
    decision: window.VildaSaveStatusIndicator.getCurrentDecision(),
  }), patientId);
  expect(before.decision.ready).toBe(true);
  expect(['saved', 'dirty']).toContain(before.decision.state);
  await frame.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  if (before.decision.state === 'dirty') {
    // Legacy partial DocPro fixtures can carry an automatically mirrored basic
    // history that the ordinary save collector does not persist. The exact
    // committed reference now detects that existing producer mismatch. Reload
    // deliberately discards the working copy through the real guard.
    const guard = frame.getByRole('dialog', { name: 'Zapisać zmiany przed wczytaniem?', exact: true });
    await expect(guard).toBeVisible();
    await expect(guard).toContainText('to ten sam pacjent, który jest już wczytany');
    await guard.getByRole('button', { name: 'Odrzuć zmiany i wczytaj', exact: true }).click();
    await expect(guard).toHaveCount(0);
  } else {
    const confirmation = frame.getByRole('dialog', { name: 'Ten pacjent jest już wczytany' });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Wczytaj ponownie', exact: true }).click();
    await expect(confirmation).not.toBeVisible();
  }
  await expect(frame.locator('#vildaLoadChoiceModal')).toBeVisible();
  await frame.locator('#vildaLcmRestore').click();
  await expect(frame.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await expect(frame.locator('.vilda-auth-patient-card')).not.toBeVisible();
  expect(await frame.evaluate(id => window.VildaVault.getPatient(id), patientId),
    'discard and reload preserve every saved SGA snapshot').toEqual(before.record);
}

export async function openStatusCard(owner, patientId) {
  await owner.evaluate(id => window.VildaAuthUI.showPatientCard(id), patientId);
  const card = owner.locator('.vilda-auth-patient-card');
  await expect(card.locator('.vilda-patient-hero-name')).toBeVisible();
  await card.getByRole('button', { name: 'Status', exact: true }).click();
  return card;
}

export async function goToSgaCard(page, fixture, route) {
  let owner = fixture.frame;
  if (route === 'index') {
    await page.goto('/index.html', { waitUntil: 'load' });
    owner = page;
    await readyForPatient(owner);
  }
  // For app.html this is the DocPro iframe. Its AuthUI shares the shell's Back
  // transport, while the standalone routes use native document history.
  const card = await openStatusCard(owner, fixture.ids.a);
  return { owner, card };
}

export async function expectSgaValues(owner) {
  const source = owner.locator(`${SGA_DIALOG} [data-sga-source="niklasson"]`);
  await expect(source.locator('[data-sga-sds="weight"]')).toContainText(/[−-]3,13/);
  await expect(source.locator('[data-sga-sds="length"]')).toContainText(/[−-]3,48/);
  await expect(source.locator('[data-sga-sds="head"]')).toContainText(/[−-]2,29/);
}

export async function scrollPosition(owner) {
  return owner.evaluate(() => [
    window.scrollY,
    document.getElementById('vilda-auth-ui-root')?.scrollTop || 0,
    document.querySelector('.vilda-auth-overlay')?.scrollTop || 0,
    document.querySelector('.vilda-auth-card')?.scrollTop || 0,
  ]);
}

export async function expectNoSgaOverflow(page, owner) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(await owner.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const dialog = owner.locator(SGA_DIALOG);
  expect(await dialog.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  expect(await dialog.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return bounds.left >= -1 && bounds.right <= innerWidth + 1;
  })).toBe(true);
  expect(await dialog.locator('h2').evaluate(title => {
    const bounds = title.getBoundingClientRect(), container = title.closest('dialog').getBoundingClientRect();
    return bounds.left >= container.left && bounds.right <= container.right
      && bounds.top >= container.top && bounds.bottom <= container.bottom;
  }), 'global app header styles must not clip the SGA title').toBe(true);
}
