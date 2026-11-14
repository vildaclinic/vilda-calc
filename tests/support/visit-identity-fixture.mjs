import { expect } from '@playwright/test';
import { createFictionalVault } from './centile-live-fixture.mjs';

// Wyłącznie fikcyjny sejf w nowym, efemerycznym profilu Playwrighta.
// Nie zastępujemy zapisu, szyfrowania, kontekstu wizyty ani obliczeń produkcyjnych.
export async function prepareVisit(page, { shell = false } = {}) {
  const fixture = await createFictionalVault(page, { shell });
  await chooseVisit(fixture.frame, fixture.ids.a, 'new');
  await fillMeasurement(fixture.frame, { height: '159', weight: '47' });
  return fixture;
}

export async function chooseVisit(frame, patientId, choice, { clear = false } = {}) {
  if (clear) {
    await frame.evaluate(() => window.clearAllData());
    await frame.waitForFunction(() => !window.VildaPersistence.isClearInProgress());
  }
  await frame.evaluate(id => window.VildaAuthUI.showPatientCard(id,
    record => { if (record) window.applyLoadedData(record); }, null), patientId);
  await expect.poll(() => frame.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  await frame.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  const choices = frame.locator('#vildaLoadChoiceModal');
  const guard = frame.getByRole('dialog', { name: /^Zapisać (wpisane dane|zmiany) przed wczytaniem\?$/ });
  await expect(choices.or(guard)).toBeVisible();
  if (await guard.isVisible()) {
    await guard.getByRole('button', { name: /^Odrzuć (dane|zmiany) i wczytaj$/ }).click();
  }
  await expect(choices).toBeVisible();
  // Modal jest widoczny przed zakończeniem asynchronicznego odtwarzania DOB.
  // Czekamy na jego rzeczywisty finalizer, nie przewijamy zegara ani nie zmieniamy guardów.
  await frame.waitForFunction(() => !window.VildaDobAge.restorePending());
  await frame.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await frame.locator(choice === 'new' ? '#vildaLcmNew' : '#vildaLcmRestore').click();
  await expect(choices).toHaveCount(0);
  await expect.poll(() => frame.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(patientId);
  await frame.waitForFunction(() => !window.VildaDobAge.restorePending()
    && !window.__vildaPersistRestoring && !window.__vildaLustroWpis);
  if (choice === 'new') {
    await expect(frame.locator('#height')).toHaveValue('');
    await expect(frame.locator('#weight')).toHaveValue('');
  }
}

export async function fillMeasurement(frame, { height, weight }) {
  await frame.locator('#height').fill(height);
  await frame.locator('#weight').fill(weight);
  await frame.locator('#weight').blur();
  await frame.waitForFunction(() => window.VildaDataImportExport.getSaveReadiness().ready);
}

export const patientRecord = (frame, patientId) => frame.evaluate(id => window.VildaVault.getPatient(id), patientId);

export async function clickSave(page) {
  const save = page.locator('#saveDataBtnSidebar');
  if (await save.isVisible()) await save.click();
  else {
    await page.locator('[data-vilda-chrome-menu-btn]').click();
    await page.locator('[data-vilda-chrome-drawer] [data-drawer-btn="saveDataBtnSidebar"]').click();
  }
}

export async function saveVisit(page, frame, patientId, { sameAgeHistoryConflict = false } = {}) {
  const before = await patientRecord(frame, patientId);
  await clickSave(page);
  if (sameAgeHistoryConflict) {
    // Dwa pomiary tego samego dnia mają ten sam wiek w dotychczasowej tabeli
    // wzrastania. Jej istniejąca brama wymaga jawnego wyboru poprawionego wiersza.
    const conflict = frame.getByRole('alertdialog', { name: 'Ktoś inny zmienił ten rekord po wczytaniu danych' });
    await expect(conflict).toBeVisible();
    await expect(conflict).toContainText('w formularzu: wiek 13 lat, wzrost 159.5 cm, masa 47.5 kg');
    await conflict.getByRole('button', { name: 'Zapisz to, co w formularzu', exact: true }).click();
    await expect(conflict).toHaveCount(0);
  }
  await expect.poll(async () => (await patientRecord(frame, patientId)).snapshots.length,
    { message: 'rzeczywisty zapis dopisał wersję do szyfrowanego sejfu' }).toBe(before.snapshots.length + 1);
  await expect(page.locator('#vildaSaveFeedback[data-state="saved"]')).toBeVisible();
  return (await patientRecord(frame, patientId)).snapshots[0];
}

export const currentVisit = frame => frame.evaluate(() => window.collectUserData().visit);

export const currentClinicalState = frame => frame.evaluate(() => {
  const payload = window.collectUserData();
  // Czas eksportu jest techniczny; pozostały stan obejmuje także dane poza formularzem.
  delete payload.timestampISO;
  return JSON.parse(JSON.stringify(payload));
});

export async function expectNoHorizontalOverflow(page, dialog) {
  const geometry = await page.evaluate(() => ({
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    viewport: innerWidth,
  }));
  expect(geometry.content, 'strona mieści się w szerokości ekranu').toBeLessThanOrEqual(geometry.viewport + 1);
  const box = await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1),
    'treść historii wizyt nie wymaga poziomego przewijania').toBe(true);
}

export async function exerciseReadOnlyHistory(page, { screenshotPath } = {}) {
  const { frame, ids, patients } = await createFictionalVault(page);
  const seeded = await frame.evaluate(async ({ patientId, template }) => {
    const save = async (visitId, clinicalDateISO, height) => {
      const payload = structuredClone(template);
      payload.user.height = height;
      payload.user.measuredAtISO = clinicalDateISO;
      payload.user.age = clinicalDateISO.startsWith('2025') ? 12 : 13;
      payload.visit = {
        version: 1, visitId, patientId, clinicalDateISO,
        createdAtISO: clinicalDateISO + 'T10:00:00.000Z', origin: 'explicit',
      };
      return window.VildaVault.savePatient(payload, { patientId, skipAdvancedAntiClobber: true });
    };
    const olderId = 'aaaaaaaa-1111-4111-8111-111111111111';
    const currentId = 'bbbbbbbb-2222-4222-8222-222222222222';
    const sameDayId = 'cccccccc-3333-4333-8333-333333333333';
    await save(olderId, '2025-06-17', 140);
    const corrected = await save(olderId, '2025-06-17', 141);
    await save(currentId, '2026-06-17', 159);
    await save(currentId, '2026-06-17', 159.5);
    await save(sameDayId, '2026-06-17', 160);
    return { olderId, currentId, sameDayId, correctedSnapshotId: corrected.snapshotId };
  }, { patientId: ids.a, template: patients.a });
  await chooseVisit(frame, ids.a, 'restore');
  await expect(frame.locator('#height')).toHaveValue('160');
  await frame.waitForFunction(() => window.VildaDataImportExport.getSaveReadiness().ready);
  const before = await currentClinicalState(frame);
  const vaultBefore = await patientRecord(frame, ids.a);
  const visits = await frame.evaluate(id => window.VildaVault.getPatientVisits(id), ids.a);
  expect(visits).toHaveLength(4); // dawny zapis oraz trzy jawnie odrębne wizyty
  expect(visits.find(visit => visit.visitId === seeded.olderId)).toMatchObject({
    snapshotId: seeded.correctedSnapshotId, revisionCount: 2,
  });
  await frame.evaluate(() => {
    window.__visitHistoryLoadEvents = [];
    for (const type of ['vilda:patient-loaded', 'vilda:data-applied']) {
      document.addEventListener(type, event => window.__visitHistoryLoadEvents.push(event.type));
    }
  });

  await frame.evaluate(id => window.VildaAuthUI.showPatientCard(id,
    record => { if (record) window.applyLoadedData(record); }, null), ids.a);
  // Starsza Historia wersji wstrzykuje swój CSS dopiero przy otwarciu.
  // Obie historie mają współistnieć bez kolizji klas i bez zmiany danych.
  await frame.getByRole('button', { name: 'Historia wersji', exact: true }).click();
  const versions = frame.locator('.vvh-backdrop');
  await expect(versions).toBeVisible();
  await expect(versions.locator('.vvh-v')).toHaveCount(vaultBefore.snapshots.length);
  await versions.locator('.vvh-x').click();
  await expect(versions).toHaveCount(0);
  // Rzeczywisty punkt wejścia obok istniejącej Historii wersji.
  await frame.getByRole('button', { name: 'Historia wizyt', exact: true }).click();
  const dialog = page.locator('.vvisit-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.vvisit-visit')).toHaveCount(4);
  await expect(dialog.locator('.vvisit-visit').filter({ hasText: '17.06.2026' })).toHaveCount(3);
  await expect(dialog.locator('.vvisit-visit').filter({ hasText: 'Z dawnych zapisów' })).toHaveCount(1);
  await dialog.locator('.vvisit-visit').filter({ hasText: '17.06.2025' }).click();
  await expect(dialog.locator('.vvisit-visit[aria-pressed="true"]')).toHaveCount(1);
  await expect.poll(() => dialog.evaluate(el => {
    const selected = el.querySelector('.vvisit-visit[aria-pressed="true"]');
    const other = el.querySelector('.vvisit-visit[aria-pressed="false"]');
    return getComputedStyle(selected).backgroundColor !== getComputedStyle(other).backgroundColor;
  }), { message: 'wybrana wizyta jest wizualnie odróżniona od pozostałych' }).toBe(true);
  await expect(dialog.locator('.vvisit-detail')).toContainText('141 cm');
  await expect(dialog.locator('.vvisit-detail')).toContainText('Zachowane wersje tej wizyty: 2');
  await expect(dialog.locator('.vvisit-detail')).not.toContainText('140 cm');
  await expect(dialog.locator('input, select, textarea')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /wczytaj|przywróć|zapisz/i })).toHaveCount(0);
  await expectNoHorizontalOverflow(page, dialog);
  const heading = await dialog.locator('.vvisit-header').boundingBox();
  expect(heading.height, 'nagłówek nie zabiera miejsca przeznaczonego na wizyty').toBeLessThan(160);
  const patientName = await dialog.locator('.vvisit-patient-name').evaluate(el => ({
    height: el.getBoundingClientRect().height, lineHeight: Number.parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(patientName.height, 'imię i nazwisko nie łamią się po jednej literze').toBeLessThanOrEqual(patientName.lineHeight * 2 + 1);
  await expect(dialog.locator('.vvisit-detail h3')).toBeInViewport();
  if (screenshotPath) await page.screenshot({ path: screenshotPath });
  // Każda kartka jest tylko podglądem. Nie wczytuje nawet na moment starej wizyty.
  for (let index = 0; index < visits.length; index++) {
    await dialog.locator('.vvisit-visit').nth(index).click();
    expect(await currentClinicalState(frame)).toEqual(before);
  }
  await dialog.locator('.vvisit-close').click();
  await expect(dialog).toHaveCount(0);
  expect(await currentClinicalState(frame)).toEqual(before);
  expect(await patientRecord(frame, ids.a)).toEqual(vaultBefore);
  expect(await frame.evaluate(() => window.__visitHistoryLoadEvents)).toEqual([]);
  return { frame, ids };
}
