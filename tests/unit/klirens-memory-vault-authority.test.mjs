import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// Execute the actual encrypted-I/O fixture without importing the browser test
// runner. Its token contract must fail closed just like the real vault's API.
const fixture = fs.readFileSync(new URL('../support/klirens-patient-record.mjs', import.meta.url), 'utf8');
const source = fixture.slice(fixture.indexOf('export async function installMemoryVault('), fixture.indexOf('export const memory =')).replace(/^export /, '');
const patient = { name: 'Fikcyjny Pacjent Sesji Testowej', user: { age: 10, sex: 'F' } };
const install = new Function('OTHER_PATIENT_ID', 'PATIENT', `${source};return installMemoryVault;`)('fictional-other-session-patient', patient);

async function environment(host) {
  const original = { isUnlocked: () => false, sanitizeNoteText: value => value, sanitizeLabResult: value => value };
  const win = { VildaVault: original, VildaSession: {}, __clcrVaultLifecycleListeners: { onUnlock: [], onLock: [] } };
  win.top = host || win;
  await install({ evaluate: (callback, input) => new Function('window', 'input', `return (${callback.toString()})(input);`)(win, input) },
    { patientId: 'fictional-session-patient', select: false });
  return { win, vault: win.VildaVault, fixture: win.__clcrRecordFixture, original };
}

describe('fictional Klirens vault preserves the native operation-session contract', () => {
  it('issues opaque current tokens while the original encrypted vault remains locked', async () => {
    const h = await environment(), token = h.vault.captureSyncOperationSession();
    expect(Object.isFrozen(token)).toBe(true); expect(Object.keys(token)).toEqual([]);
    expect(h.vault.assertSyncOperationSession(token)).toBe(true);
    expect(() => h.vault.assertSyncOperationSession({})).toThrow();
    h.fixture.configure({ holdPatientReads: true });
    expect(h.vault.assertSyncOperationSession(token)).toBe(true);
    expect(h.original.isUnlocked()).toBe(false); expect(h.fixture.snapshot().originalsLocked).toBe(true);
  });

  it.each(['relogin', 'account-return'])('%s cannot revive an earlier operation token', async change => {
    const h = await environment(), token = h.vault.captureSyncOperationSession();
    if (change === 'relogin') {
      h.fixture.configure({ unlocked: false });
      expect(() => h.vault.captureSyncOperationSession()).toThrow();
      expect(() => h.vault.assertSyncOperationSession(token)).toThrow();
      h.fixture.configure({ unlocked: true });
    } else {
      h.fixture.configure({ userId: 'fictional-other-account' });
      h.fixture.configure({ userId: 'fictional-klirens-account' });
    }
    expect(() => h.vault.assertSyncOperationSession(token)).toThrow();
    expect(h.vault.assertSyncOperationSession(h.vault.captureSyncOperationSession())).toBe(true);
  });

  it('keeps tokens bound to their issuing vault, including sibling frames and replacements', async () => {
    const first = await environment(), second = await environment(first.win);
    const token = first.vault.captureSyncOperationSession();
    expect(() => second.vault.assertSyncOperationSession(token)).toThrow();
    first.win.VildaVault = second.vault;
    expect(() => first.vault.assertSyncOperationSession(token)).toThrow();
  });
});
