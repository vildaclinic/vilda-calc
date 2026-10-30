import { expect } from '@playwright/test';
import { createFictionalVault } from './centile-live-fixture.mjs';
import { mutatePlan } from './care-plans-fixture.mjs';

export const SEARCH_WORKSPACE = 'dialog.vb22-modal';
export const GLOBAL_QUERY = 'Szukaj we wszystkich pacjentach i sprawach';

// A real synthetic encrypted vault in each fresh browser context. All names,
// clinical descriptions and dates below are fictional testing examples.
export async function globalSearchFixture(page, { shell = false } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
  const created = await createFictionalVault(page, { shell });
  const records = await created.frame.evaluate(async ({ ids, patients }) => {
    const vault = window.VildaVault;
    for (const [key, firstName] of [['a', 'Antoni'], ['b', 'Anna']]) {
      const payload = patients[key];
      payload.name = 'Fikcyjny Nowak ' + firstName;
      payload.user.lastName = 'Fikcyjny Nowak'; payload.user.firstName = firstName;
      await vault.savePatient(payload, { patientId: ids[key], dedup: false });
    }
    const noMattersPayload = structuredClone(patients.a);
    noMattersPayload.name = 'Fikcyjny Nowak Bez Wpisów';
    noMattersPayload.user.firstName = 'Bez Wpisów';
    const noMatters = (await vault.savePatient(noMattersPayload, { dedup: false })).patientId;
    const zolcPayload = structuredClone(patients.b);
    zolcPayload.name = 'Fikcyjna Żółć Maria';
    zolcPayload.user.firstName = 'Maria'; zolcPayload.user.lastName = 'Fikcyjna Żółć';
    const zolc = (await vault.savePatient(zolcPayload, { dedup: false })).patientId;
    const external = (await vault.saveExternalPatient({ firstName: 'Fikcyjny Zewnętrzny', lastName: 'Fikcyjny Nowak' })).patientId;
    const specs = {
      active: { patientId: ids.a, title: 'Fikcyjna bieżąca sprawa Nowak', category: 'reminder-task', dueDateISO: '2026-10-28', body: 'Fikcyjne ustalenie do wykonania.' },
      biopsy: { patientId: ids.a, title: 'Fikcyjne badanie ambulatoryjne', category: 'procedura', procedureType: 'Biopsja', dueDateISO: '2027-02-02', dueTime: '10:30', body: 'Fikcyjna przyszła procedura do organizacji.' },
      mri: { patientId: ids.b, title: 'Fikcyjny rezonans przysadki', category: 'followup', dueDateISO: '2027-03-04', body: 'Fikcyjny przyszły termin rezonansu.' },
      narrative: { patientId: ids.a, title: 'Fikcyjny wynik opisowy', category: 'lab-result', body: 'Fikcyjny opis biopsji otrzymany od pracowni.', clinicalDateISO: '2026-10-19', labResult: { test: 'Fikcyjna biopsja opisowa', value: 'Fikcyjny wynik opisowy', unit: '' } },
      undated: { patientId: ids.b, title: 'Fikcyjna notatka bez terminu', category: 'observation', body: 'Fikcyjne zalecenie do omówienia bez ustalonej daty.' },
      completed: { patientId: ids.a, title: 'Fikcyjny wykonany kontakt', category: 'reminder-contact', dueDateISO: '2026-10-20', completedAtISO: '2026-10-21T09:00:00.000Z', body: 'Fikcyjne ustalenia z rozmowy.' },
      activity: { patientId: vault.ACTIVITY_PATIENT_ID, title: 'Fikcyjne konsylium rezonans', category: 'activity-other', dueDateISO: '2027-04-05', body: 'Fikcyjne wydarzenie bez powiązania z pacjentem.' },
      literal: { patientId: ids.a, title: 'Fikcyjny znacznik tekstowy', category: 'observation', body: '<img src=x onerror="window.__fictionalSearchExecuted=true"> Fikcyjny dosłowny zapis.' },
      external: { patientId: external, title: 'Fikcyjna konsultacja zewnętrzna', category: 'followup', dueDateISO: '2027-04-06', body: 'Fikcyjny przyszły kontakt spoza podstawowej kartoteki.' },
    };
    const notes = {};
    for (const [key, spec] of Object.entries(specs)) notes[key] = (await vault.savePatientNote(spec)).id;
    return { noMatters, zolc, external, notes };
  }, { ids: created.ids, patients: created.patients });
  const plan = await mutatePlan(created.frame, created.ids.a, null, 'create', {
    title: 'Fikcyjny plan dalszego postępowania', goal: 'Fikcyjna dokumentacja: biopsja i dalsza kontrola.',
  });
  const step = await mutatePlan(created.frame, created.ids.a, plan.planId, 'addStep', {
    step: { title: 'Fikcyjna kontrola po biopsji', description: 'Fikcyjny bezterminowy krok planu.', kind: 'Kontrola', state: 'pending' },
  });
  const consent = page.locator('#consent-decline'); if (await consent.isVisible()) await consent.click();
  return { ...created, ...records, planId: plan.planId, stepId: step.stepId };
}

export async function openGlobalSearch(page) {
  await page.locator('#vildaRemindersBtn').click();
  const workspace = page.locator(SEARCH_WORKSPACE);
  await expect(workspace).toBeVisible();
  await workspace.locator('[data-tab=search]').click();
  const search = workspace.locator('.vgs'); await expect(search).toBeVisible();
  return search;
}

export const resultFor = (search, kind, id) => search.locator(`[data-search-id="${kind}:${id}"]`);
export async function queryGlobal(search, value) {
  await search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true }).fill(value);
  await expect(search).toHaveAttribute('aria-busy', 'false');
}
