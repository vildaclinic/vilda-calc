import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const tabKey = 'vildaTabIdV1';
const patientKeys = {
  vildaCurrentPatientId: 'FICTIONAL-PATIENT',
  vildaMainSessionV1: '{"user":{"height":159}}',
  'vilda-save-ref-v1': 'FICTIONAL-REFERENCE'
};

function storage(entries = {}) {
  const data = new Map(Object.entries(entries));
  return {
    get length() { return data.size; },
    key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(String(key)) ?? null,
    setItem: (key, value) => { data.set(String(key), String(value)); },
    removeItem: key => { data.delete(String(key)); },
    clear: () => { throw new Error('Tab isolation must not clear patient or account storage'); },
    snapshot: () => Object.fromEntries(data)
  };
}

function boot({ session = storage(), local = storage(), opener = null, top, uuid = 'FICTIONAL-NEW-TAB' } = {}) {
  const win = {
    sessionStorage: session, localStorage: local, opener, navigator: {}, name: '',
    crypto: { randomUUID: () => uuid }
  };
  if (opener === 'self') win.opener = win;
  win.top = top || win;
  loadBrowserScript('vilda_persistence_adapter.js', win);
  return win;
}

describe('native opener sessionStorage tab identity', () => {
  it('splits a copied identity before consumers run, preserving all patient and account data', () => {
    const local = storage({ vildaUserId: 'FICTIONAL-ACCOUNT', vildaVaultV1: 'FICTIONAL-VAULT' });
    const original = boot({ session: storage({ [tabKey]: 'FICTIONAL-OPENER', ...patientKeys }), local });
    const originalSession = original.sessionStorage.snapshot();
    const accountBefore = local.snapshot();
    const copied = storage(originalSession);

    const child = boot({ session: copied, local, opener: original });

    // Bootstrap must finish before the tab guard or clear-event listeners read it.
    expect(copied.getItem(tabKey)).toBe('FICTIONAL-NEW-TAB');
    expect(child.VildaPersistence.getTabId()).toBe('FICTIONAL-NEW-TAB');
    expect(copied.snapshot()).toEqual({ ...originalSession, [tabKey]: 'FICTIONAL-NEW-TAB' });
    expect(original.sessionStorage.snapshot()).toEqual(originalSession);
    expect(local.snapshot()).toEqual(accountBefore);
  });

  it('keeps the new identity through reload and later opener navigation or clear', () => {
    const original = boot({ session: storage({ [tabKey]: 'FICTIONAL-OPENER', ...patientKeys }) });
    const copied = storage(original.sessionStorage.snapshot());
    boot({ session: copied, opener: original });
    expect(copied.getItem(tabKey)).toBe('FICTIONAL-NEW-TAB');

    const reload = boot({ session: copied, opener: original, uuid: 'FICTIONAL-UNUSED' });
    expect(reload.VildaPersistence.getTabId()).toBe('FICTIONAL-NEW-TAB');
    original.sessionStorage.removeItem(tabKey);
    original.sessionStorage.removeItem('vildaCurrentPatientId');
    Object.defineProperty(original, 'sessionStorage', { get() { throw new Error('FICTIONAL-CROSS-ORIGIN'); } });

    expect(reload.VildaPersistence.getTabId()).toBe('FICTIONAL-NEW-TAB');
    const afterNavigation = boot({ session: copied, opener: original, uuid: 'FICTIONAL-UNUSED' });
    expect(afterNavigation.VildaPersistence.getTabId()).toBe('FICTIONAL-NEW-TAB');
    expect(copied.getItem('vildaCurrentPatientId')).toBe(patientKeys.vildaCurrentPatientId);
  });

  it('shares one identity with same-tab iframes and splits a popup opened from that tab', () => {
    const original = boot({ session: storage({ [tabKey]: 'FICTIONAL-OPENER' }) });
    const copied = storage(original.sessionStorage.snapshot());
    const child = boot({ session: copied, opener: original });
    const frame = boot({ session: copied, opener: original, top: child, uuid: 'FICTIONAL-UNUSED' });
    expect(frame.VildaPersistence.getTabId()).toBe(child.VildaPersistence.getTabId());

    const grandchild = boot({ session: storage(copied.snapshot()), opener: child, uuid: 'FICTIONAL-GRANDCHILD' });
    expect(grandchild.VildaPersistence.getTabId()).toBe('FICTIONAL-GRANDCHILD');
    expect(child.VildaPersistence.getTabId()).toBe('FICTIONAL-NEW-TAB');
    expect(original.VildaPersistence.getTabId()).toBe('FICTIONAL-OPENER');
  });

  it('does not split an iframe even when its top-level window still has a matching opener', () => {
    const original = boot({ session: storage({ [tabKey]: 'FICTIONAL-OPENER' }) });
    const sameTab = storage({ [tabKey]: 'FICTIONAL-OPENER' });
    const frame = boot({ session: sameTab, top: { opener: original }, opener: original });
    expect(frame.VildaPersistence.getTabId()).toBe('FICTIONAL-OPENER');
  });

  it.each(['standalone', 'distinct', 'closed', 'inaccessible', 'self'])('preserves an existing identity when opener is %s', kind => {
    let opener = null;
    const session = storage({ [tabKey]: 'FICTIONAL-EXISTING', ...patientKeys });
    if (kind === 'distinct') opener = boot({ session: storage({ [tabKey]: 'FICTIONAL-OTHER' }) });
    if (kind === 'closed') opener = { closed: true, sessionStorage: storage({ [tabKey]: 'FICTIONAL-EXISTING' }) };
    if (kind === 'inaccessible') opener = { get sessionStorage() { throw new Error('FICTIONAL-CROSS-ORIGIN'); } };
    if (kind === 'self') opener = 'self';
    const win = boot({ session, opener });
    expect(win.VildaPersistence.getTabId()).toBe('FICTIONAL-EXISTING');
    expect(session.snapshot()).toEqual({ [tabKey]: 'FICTIONAL-EXISTING', ...patientKeys });
  });

  it('generates the ordinary identity on first demand when no tab ID was copied', () => {
    const opener = boot({ session: storage({ [tabKey]: 'FICTIONAL-OPENER' }) });
    const child = boot({ session: storage(patientKeys), opener });
    expect(child.sessionStorage.getItem(tabKey)).toBeNull();
    expect(child.VildaPersistence.getTabId()).toBe('FICTIONAL-NEW-TAB');
    expect(child.sessionStorage.getItem('vildaCurrentPatientId')).toBe(patientKeys.vildaCurrentPatientId);
  });

  it('retains the existing identity and patient data if storage rejects the replacement', () => {
    const opener = boot({ session: storage({ [tabKey]: 'FICTIONAL-OPENER' }) });
    const session = storage({ [tabKey]: 'FICTIONAL-OPENER', ...patientKeys });
    session.setItem = () => { throw new Error('FICTIONAL-QUOTA-FAILURE'); };

    const child = boot({ session, opener });

    expect(child.VildaPersistence.getTabId()).toBe('FICTIONAL-OPENER');
    expect(session.snapshot()).toEqual({ [tabKey]: 'FICTIONAL-OPENER', ...patientKeys });
  });
});
