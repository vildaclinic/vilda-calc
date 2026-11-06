import { expect } from '@playwright/test';
import { createFictionalVault, loadPatient } from './centile-live-fixture.mjs';

export const CLEAR_WARNING = /^Zapisać (wpisane dane|zmiany) przed wyczyszczeniem\?$/u;

export async function expectSaveState(owner, state) {
  await expect.poll(() => owner.evaluate(() => {
    const indicator = window.VildaSaveStatusIndicator;
    const decision = indicator.getCurrentDecision();
    return { displayed: indicator.getState(), ready: decision.ready, actual: decision.state };
  })).toEqual({ displayed: state, ready: true, actual: state });
}

export async function openCommittedPatient(page, { shell = false } = {}) {
  const fixture = await createFictionalVault(page, { shell });
  await loadPatient(fixture.frame, fixture.ids.a, 'restore');
  await expect(fixture.frame.locator('#height')).toHaveValue('158');
  await expectSaveState(fixture.frame, 'saved');
  return { ...fixture, owner: fixture.frame };
}

export async function record(owner, patientId) {
  return owner.evaluate(id => window.VildaVault.getPatient(id), patientId);
}

// The real encrypted vault still writes, notifies subscribers and returns its
// genuine receipt. A single optional gate delays only delivery of that receipt,
// after durable commit, to exercise another producer changing the live form.
export async function observeRealSave(owner, { holdAfterCommit = false } = {}) {
  await owner.evaluate(hold => {
    const vault = window.VildaVault, original = vault.savePatient;
    const probe = { calls: 0, commits: [], events: [], held: false };
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    probe.release = release;
    probe.restore = () => { vault.savePatient = original; release(); };
    vault.savePatient = async function (...args) {
      probe.calls++;
      const receipt = await original.apply(this, args);
      const stored = await vault.getPatient(receipt.patientId);
      const snapshot = stored.snapshots.find(value => value.snapshotId === receipt.snapshotId);
      probe.commits.push(JSON.parse(JSON.stringify({ receipt, snapshot })));
      if (hold && probe.commits.length === 1) { probe.held = true; await gate; }
      return receipt;
    };
    document.addEventListener('vilda:patient-loaded', event => {
      if (event.detail?.source === 'save') probe.events.push(JSON.parse(JSON.stringify(event.detail)));
    });
    window.__committedReferenceProbe = probe;
  }, holdAfterCommit);
}

export async function saveByVisibleMenu(page, owner) {
  const before = await owner.evaluate(() => window.__committedReferenceProbe.commits.length);
  await page.locator('aside.sidebar-v2 #saveDataBtnSidebar').click();
  await expect.poll(() => owner.evaluate(() => window.__committedReferenceProbe.commits.length)).toBe(before + 1);
}

export async function lastCommit(owner) {
  return owner.evaluate(() => window.__committedReferenceProbe.commits.at(-1));
}

export async function cancelNativeClear(owner) {
  await owner.locator('#clearAllDataBtn').click();
  const dialog = owner.getByRole('dialog', { name: CLEAR_WARNING });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

export async function reference(owner) {
  return owner.evaluate(() => window.VildaSaveStatusIndicator.getReferenceFingerprint());
}
