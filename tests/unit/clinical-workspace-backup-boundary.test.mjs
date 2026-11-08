import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'espree';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { verifyClinicalWorkspaceBackup } from '../../tools/check_clinical_workspace_backup_boundary.mjs';

const settle = async () => { for (let index = 0; index < 45; index++) await Promise.resolve(); };
function fixture(mode = 'legacy') {
  const state = { route: { mode }, locked: false, generation: 1, userId: 'fictional-user', timers: [], prefs: {}, exports: [] };
  const document = atrapaDokumentu();
  const vault = { isUnlocked: () => !state.locked, getCurrentUser: () => state.locked ? null : ({ userId: state.userId, label: 'Fikcyjne konto' }),
    captureSyncOperationSession: () => state.generation,
    assertSyncOperationSession: token => { if (state.locked || token !== state.generation) throw new Error('Session changed'); },
    preparePatientClinicalRoute: vi.fn(async () => state.route), selectPatientClinicalRoute: () => ({ mode: 'legacy' }),
    isCloudOnlyMode: () => false, onPatientSaved: callback => { state.saved = callback; },
    exportVaultBackup: vi.fn(async () => ({ format: 'original-legacy-backup', fictional: true })),
    exportPatientEnvelope: vi.fn(async () => ({ format: 'original-patient-backup', fictional: true })),
    showPatientWorkspaceRecovery: vi.fn() };
  const win = { document, VildaVault: vault, Blob, URL: { createObjectURL: value => { state.exports.push(value); return 'blob:fictional'; }, revokeObjectURL() {} },
    setTimeout: (callback, delay) => { state.timers.push({ callback, delay }); return state.timers.length; }, clearTimeout() {} };
  win.window = win; loadBrowserScript('vilda_file_export.js', win);
  const storage = { getPrefs: vi.fn(async () => state.prefs), putPrefs: vi.fn(async (_, value) => { state.prefs = value; }),
    getFolderHandle: async () => null };
  win.VildaFileExport.setStorageAdapter(storage);
  return { state, vault, win, api: win.VildaFileExport, document, storage };
}

const settingsSource = readFileSync(new URL('../../inline_ustawienia_04.js', import.meta.url), 'utf8');
const settingsTree = parse(settingsSource, { ecmaVersion: 'latest', range: true });
const statements = settingsTree.body[0].expression.callee.body.body;
const functions = new Map(statements.filter(node => node.type === 'FunctionDeclaration').map(node => [node.id.name, settingsSource.slice(...node.range)]));
let forceSource;
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.object.name === 'R'
    && node.callee.property.name === 'addEventListener' && node.arguments[0].value === 'click') forceSource = settingsSource.slice(...node.arguments[1].range);
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
}
statements.forEach(visit);
function settings(f) {
  const ids = ['autoBackupTag','autoBackupEnabledToggle','autoBackupIntervalSelect','autoBackupRunNowBtn','autoBackupStatus',
    'backupSectionNote','backupFolderDesc','downloadVaultBackupBtn','clinicalWorkspaceBackupLink','backupChooseFolderBtn','backupClearFolderBtn',
    'backupSupportChip','backupFolderTag','backupFolderChip','vaultBackupStatus'];
  const elements = {};
  for (const id of ids) { const node = f.document.createElement('div'); node.id = id; node.textContent = 'original'; f.document.body.appendChild(node); elements[id] = node; }
  const deps = { M: elements.autoBackupEnabledToggle, W: elements.autoBackupIntervalSelect, R: elements.autoBackupRunNowBtn,
    J: elements.autoBackupStatus, ne: elements.autoBackupTag };
  const code = 'const {' + Object.keys(deps).join(',') + '}=deps;var ClinicalBackupOriginalLabels=null;\n'
    + ['n','e','zt','ClinicalBackupSettingsAvailability','re'].map(name => functions.get(name)).join('\n')
    + '\nreturn {refresh:re,force:' + forceSource + '};';
  return { ...new Function('window', 'document', 'deps', code)(f.win, f.document, deps), elements };
}

describe('actual legacy backup functions respect the native clinical route', () => {
  it('preserves both pinned artifacts outside the reviewed boundary', () => { expect(verifyClinicalWorkspaceBackup()).toBe(2); });
  it('keeps legacy auto-backup defaults, actual timer export, original format and last-backup preferences', async () => {
    const f = fixture();
    expect(await f.api.getAutoBackupStatus()).toMatchObject({ enabled: true, effectivelyEnabled: true });
    f.state.saved({ patientId: 'fictional-patient' });
    expect(f.state.timers.at(-1).delay).toBe(2000); f.state.timers.at(-1).callback(); await settle();
    expect(f.vault.exportVaultBackup).toHaveBeenCalledTimes(1);
    expect(f.state.prefs.lastVaultBackupFilename).toMatch(/\.wiw$/);
    expect(JSON.parse(await f.state.exports[0].text())).toEqual({ format: 'original-legacy-backup', fictional: true });
  });
  it('disables protected auto status and stops force, timer, manual account and patient exports before legacy calls', async () => {
    const f = fixture('protected-workspace');
    const status = await f.api.getAutoBackupStatus();
    expect(status).toMatchObject({ supported: false, enabled: false, effectivelyEnabled: false, reason: 'protected-workspace', nextDueMs: null });
    expect(status.message).toContain('Kopia i odtwarzanie');
    expect(await f.api.tryAutoVaultBackup({ force: true })).toMatchObject({ skipped: true, supported: false });
    await expect(f.api.exportVaultBackupToFile()).rejects.toMatchObject({ code: 'CLINICAL_WORKSPACE_LEGACY_BACKUP_UNAVAILABLE' });
    await expect(f.api.exportPatient('fictional-patient')).rejects.toMatchObject({ code: 'CLINICAL_WORKSPACE_LEGACY_BACKUP_UNAVAILABLE' });
    await expect(f.api.setAutoBackupEnabled(true)).rejects.toMatchObject({ code: 'CLINICAL_WORKSPACE_LEGACY_BACKUP_UNAVAILABLE' });
    f.state.saved({ patientId: 'fictional-patient' }); f.state.timers.at(-1).callback(); await settle();
    expect(f.vault.exportVaultBackup).not.toHaveBeenCalled(); expect(f.vault.exportPatientEnvelope).not.toHaveBeenCalled();
    expect(f.storage.putPrefs).not.toHaveBeenCalled(); expect(f.state.exports).toEqual([]);
  });
  it('awaits native marker discovery rather than trusting synchronous legacy selection', async () => {
    const f = fixture(); let release, completed = false;
    f.vault.preparePatientClinicalRoute.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = f.api.getAutoBackupStatus().then(value => { completed = true; return value; });
    await settle(); expect(completed).toBe(false);
    release({ mode: 'protected-workspace' }); expect(await pending).toMatchObject({ enabled: false, reason: 'protected-workspace' });
  });
  it.each(['missing', 'corrupt', 'unsupported'])('fails closed when native route is %s', async kind => {
    const f = fixture();
    if (kind === 'missing') delete f.vault.preparePatientClinicalRoute;
    else if (kind === 'corrupt') f.vault.preparePatientClinicalRoute.mockRejectedValue(new Error('corrupt marker'));
    else f.state.route = { mode: 'protected-unavailable' };
    expect(await f.api.getAutoBackupStatus()).toMatchObject({ enabled: false, effectivelyEnabled: false, reason: 'route-unavailable' });
    expect(await f.api.tryAutoVaultBackup({ force: true })).toMatchObject({ skipped: true, reason: 'route-unavailable' });
    expect(f.vault.exportVaultBackup).not.toHaveBeenCalled();
  });
  it('rechecks cutover that happens while preferences are being read', async () => {
    const f = fixture(); f.storage.getPrefs.mockImplementation(async () => { f.state.route = { mode: 'protected-workspace' }; return {}; });
    expect(await f.api.getAutoBackupStatus()).toMatchObject({ enabled: false, effectivelyEnabled: false });
  });
  it('does not export when the account changes during native route discovery', async () => {
    const f = fixture(); f.vault.preparePatientClinicalRoute.mockImplementation(async () => { f.state.userId = 'other-account'; f.state.generation++; return { mode: 'legacy' }; });
    expect(await f.api.tryAutoVaultBackup({ force: true })).toMatchObject({ skipped: true, reason: 'route-unavailable' });
    expect(f.vault.exportVaultBackup).not.toHaveBeenCalled();
  });
});

describe('actual settings status and force handlers', () => {
  it('does not claim enabled/ready and exposes the full recovery link for protected data', async () => {
    const f = fixture('protected-workspace'), ui = settings(f); await ui.refresh();
    expect(ui.elements.autoBackupTag.textContent).toBe('Niedostępny dla tego zapisu');
    expect(ui.elements.autoBackupEnabledToggle.checked).toBe(false);
    for (const id of ['autoBackupEnabledToggle','autoBackupIntervalSelect','autoBackupRunNowBtn','downloadVaultBackupBtn']) expect(ui.elements[id].disabled).toBe(true);
    expect(ui.elements.autoBackupStatus.textContent).toContain('Kopia i odtwarzanie');
    expect(ui.elements.clinicalWorkspaceBackupLink.hidden).toBe(false);
    await ui.force(); expect(ui.elements.autoBackupStatus.textContent).toContain('Kopia i odtwarzanie');
    expect(ui.elements.autoBackupStatus.textContent).not.toContain('gotowy');
  });
  it('preserves a real manual export failure instead of overwriting it in the final status refresh', async () => {
    const f = fixture(), ui = settings(f);
    f.vault.exportVaultBackup.mockRejectedValue(new Error('Fictional disk failure'));
    await ui.force();
    expect(ui.elements.autoBackupStatus.textContent).toContain('Fictional disk failure');
    expect(f.state.prefs.lastVaultBackupAtISO).toBeUndefined();
  });
  it('restores legacy controls when switching back to a verified legacy account without changing preferences', async () => {
    const f = fixture('protected-workspace'), ui = settings(f); await ui.refresh();
    f.state.route = { mode: 'legacy' }; await ui.refresh();
    expect(ui.elements.autoBackupTag.textContent).toBe('Włączony');
    expect(ui.elements.autoBackupEnabledToggle.disabled).toBe(false);
    expect(ui.elements.clinicalWorkspaceBackupLink.hidden).toBe(true);
    expect(f.storage.putPrefs).not.toHaveBeenCalled();
  });
});
