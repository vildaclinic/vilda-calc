import { expect } from '@playwright/test';
import { loadPatient } from './centile-live-fixture.mjs';
import { prepareDocProUserFlow } from './clear-current-state-fixture.mjs';
import { GLOBAL_QUERY, globalSearchFixture, openGlobalSearch, queryGlobal, resultFor } from './global-search-fixture.mjs';

export const RETURN_TO_SEARCH = '← Wróć do Szukaj';
export const LONG_QUERY = 'Fikcyjny audyt powrotu';

export async function persistedSearchFingerprint(owner, patientId) {
  return owner.evaluate(async id => {
    const patient = await window.VildaVault.getPatient(id);
    const notes = await window.VildaVault.listPatientNotesForPatient(id);
    const bytes = new TextEncoder().encode(JSON.stringify({ patient, notes }));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      byte => byte.toString(16).padStart(2, '0')).join('');
  }, patientId);
}

// This is a real encrypted fictional vault, not a mock search service. The
// selected 81st record deliberately needs a second page and a long preview.
export async function searchReturnFixture(page, options = {}) {
  const created = await globalSearchFixture(page, options);
  const longNotes = await created.frame.evaluate(async ({ patientId, prefix }) => {
    const body = Array.from({ length: 65 }, (_, index) =>
      `Fikcyjny akapit ${index + 1}. Opis organizacyjny testu powrotu do wyszukiwarki, bez zaleceń medycznych.`).join('\n\n');
    const ids = [];
    for (let index = 0; index < 96; index += 1) {
      ids.push((await window.VildaVault.savePatientNote({
        patientId, title: `${prefix} ${String(index + 1).padStart(3, '0')}`,
        body, category: 'followup', dueDateISO: '2027-06-01', dueTime: '10:30', durationMin: 20,
      })).id);
    }
    return ids;
  }, { patientId: created.ids.a, prefix: LONG_QUERY });
  return { ...created, longNotes };
}

export async function openLongResult(page, created, { search: suppliedSearch, inline = false } = {}) {
  const search = suppliedSearch || await openGlobalSearch(page);
  await queryGlobal(search, LONG_QUERY);
  await search.getByRole('combobox', { name: 'Terminy spraw', exact: true }).selectOption('future');
  await search.getByRole('combobox', { name: 'Stan spraw', exact: true }).selectOption('open');
  await expect(search.locator('.vgs-row')).toHaveCount(50);
  await search.getByRole('button', { name: 'Pokaż kolejne wyniki (46)', exact: true }).click();
  await expect(search.locator('.vgs-row')).toHaveCount(96);
  const target = resultFor(search, 'note', created.longNotes[80]);
  await target.scrollIntoViewIfNeeded();
  const listScroll = await search.locator('.vgs-list').evaluate(node => node.scrollTop);
  expect(listScroll, 'the 81st result requires a nonzero list scroll').toBeGreaterThan(1000);
  await target.click();
  if (inline) return { listScroll, id: created.longNotes[80] };
  await expect(search).toHaveClass(/vgs-show-detail/);
  await expect(search.locator('.vgs-title')).toHaveText(`${LONG_QUERY} 081`);
  return { search, listScroll, id: created.longNotes[80] };
}

export async function contextAtAction(search, action) {
  await action.scrollIntoViewIfNeeded();
  const state = await search.evaluate(node => ({
    query: node.querySelector('.vgs-query').value,
    time: node.querySelector('[aria-label="Terminy spraw"]').value,
    status: node.querySelector('[aria-label="Stan spraw"]').value,
    selected: node.querySelector('[aria-current="true"]')?.dataset.searchId,
    count: node.querySelectorAll('.vgs-row').length,
    detail: node.classList.contains('vgs-show-detail'),
    listScroll: node.querySelector('.vgs-list').scrollTop,
    detailScroll: node.querySelector('.vgs-detail').scrollTop,
  }));
  return state;
}

export async function assertSearchContext(page, expected) {
  const search = page.locator('dialog.vb22-modal .vgs');
  await expect(search).toBeVisible();
  await expect(search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true })).toHaveValue(expected.query);
  await expect(search.getByRole('combobox', { name: 'Terminy spraw', exact: true })).toHaveValue(expected.time);
  await expect(search.getByRole('combobox', { name: 'Stan spraw', exact: true })).toHaveValue(expected.status);
  await expect(search.locator('.vgs-row')).toHaveCount(expected.count);
  if (expected.detail) await expect(search).toHaveClass(/vgs-show-detail/);
  else await expect(search).not.toHaveClass(/vgs-show-detail/);
  if (expected.selected) await expect(search.locator(`[data-search-id="${expected.selected}"]`)).toHaveAttribute('aria-current', 'true');
  // Restoration is applied after the asynchronous fresh vault read and render.
  await expect.poll(() => search.locator('.vgs-list').evaluate(node => node.scrollTop)).toBeCloseTo(expected.listScroll, 0);
  await expect.poll(() => search.locator('.vgs-detail').evaluate(node => node.scrollTop)).toBeCloseTo(expected.detailScroll, 0);
  return search;
}

export async function searchNote(page, noteId, query) {
  const search = await openGlobalSearch(page);
  await queryGlobal(search, query);
  const result = resultFor(search, 'note', noteId);
  await expect(result).toBeVisible();
  await result.click();
  await expect(search).toHaveClass(/vgs-show-detail/);
  return search;
}

// The GH point and its control note come from the actual DocPro monitor and
// scheduler. No invented ghPointId, replacement producer or intercepted writer.
export async function actualGhControl(page, created) {
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await prepareDocProUserFlow(page);
  await loadPatient(page, created.ids.a, 'restore', { clear: true });
  await page.waitForFunction(() => window.vildaGhIgfPersistApi && window.VildaGhDawka
    && typeof window.refreshGHTherapyMonitor === 'function', null, { timeout: 30000 });
  await page.evaluate(() => {
    window.vildaGhIgfPersistApi.ensureMounted();
    const card = document.getElementById('ghIgfTherapyCard');
    const surface = document.createElement('div');
    surface.style.cssText = 'position:relative;z-index:99999;background:white;padding:8px';
    document.body.prepend(surface); surface.appendChild(card); card.style.display = 'block';
    for (const [id, value] of [['therProg', 'SNP'], ['therDrug', 'Omnitrope 10 mg']]) {
      const control = document.getElementById(id); control.value = value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.ghActivateTab('mon');
  });
  await page.locator('#btnGhStart').click();
  const point = await page.evaluate(() => window.ghTherapyPoints.at(-1));
  expect(point?.id, 'the actual monitor created the saved point').toBeTruthy();
  await page.evaluate(() => window.VildaDataImportExport.saveUserData({}));
  await page.evaluate(() => window.ghActivateTab('rec'));
  await page.locator('#tzAdd90').click();
  await expect(page.locator('#tzGhVisitOverlay')).toBeVisible();
  await page.locator('#tzGhConfirm').click();
  await expect(page.locator('#tzGhVisitOverlay')).toHaveCount(0);
  const note = await page.evaluate(async ({ patientId, pointId }) =>
    (await window.VildaVault.listPatientNotesForPatient(patientId)).find(item => item.ghPointId === String(pointId)),
  { patientId: created.ids.a, pointId: point.id });
  expect(note?.id, 'the actual scheduler persisted the linked control').toBeTruthy();
  expect(note.medication.doseUnit).toBe('mg/kg/d');
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  return { point, note };
}
