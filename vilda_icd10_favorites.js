/* Account shortcuts contain only identifiers from the local ICD-10 catalogue.
 * The native preference adapter owns storage and synchronization. */
(function (w) {
  'use strict';
  if (w.VildaICD10Favorites) return;

  const key = 'icd10Favorites';
  const listeners = new Set();
  const vaults = new WeakSet();
  const adapters = new WeakSet();
  let notificationQueued = false;
  let attempted = null;

  function capture() {
    try {
      const persistence = w.VildaPersistence, vault = w.VildaVault;
      const meta = persistence?.MODULE_KEY_META?.[key];
      if (meta?.storage !== 'cloud-synced' || meta.kind !== 'preference' || meta.perUser !== true || meta.guest === true ||
          w.VildaGuestMode === true || w.VildaAuthUI?.isGuestMode?.() || !vault?.isUnlocked()) return null;
      const userId = vault.getCurrentUser()?.userId;
      if (!userId) return null;
      return { persistence, vault, userId, session: vault.captureSyncOperationSession() };
    } catch (_) { return null; }
  }

  function current(owner) {
    try {
      return w.VildaPersistence === owner.persistence && w.VildaVault === owner.vault &&
        owner.vault.isUnlocked() && owner.vault.getCurrentUser()?.userId === owner.userId &&
        w.VildaGuestMode !== true && !w.VildaAuthUI?.isGuestMode?.() &&
        owner.vault.assertSyncOperationSession(owner.session) === true;
    } catch (_) { return false; }
  }

  function known(catalogue, code) {
    return typeof code === 'string' && !!code && catalogue?.lookup?.(code)?.code === code;
  }

  function read(owner, catalogue) {
    const stored = owner.persistence.readPreferenceJSON(key, null);
    return stored?.schemaVersion === 1 && Array.isArray(stored.codes)
      ? Array.from(new Set(stored.codes.filter(code => known(catalogue, code)))) : [];
  }

  function pendingKey(owner) {
    return 'vilda:icd10-favorites-pending::' + owner.userId;
  }

  function pending(owner) {
    return owner.persistence.readRaw('local', pendingKey(owner));
  }

  function remember(owner, value) {
    return value == null ? owner.persistence.removeKey('local', pendingKey(owner))
      : owner.persistence.writeRaw('local', pendingKey(owner), value);
  }

  function validPending(raw, catalogue) {
    const value = JSON.parse(raw);
    if (value?.schemaVersion !== 1 || !Array.isArray(value.codes) || value.codes.length > catalogue.length ||
        Object.keys(value).length !== 2) return false;
    const codes = new Set(value.codes);
    if (codes.size !== value.codes.length) return false;
    for (const [code] of catalogue) codes.delete(code);
    return !codes.size;
  }

  function publish(owner, value) {
    if (!current(owner)) return false;
    attempted = {owner, value};
    // Clearing a visit pauses ordinary form persistence. An explicit favorite
    // only writes this authenticated account's preference.
    const options = owner.persistence.isClearInProgress() ? {force: true} : undefined;
    if (owner.persistence.writePreferenceRaw(key, value, options) === true) return true;
    attempted = null;
    return false;
  }

  function acknowledge(event) {
    if (event?.key !== key) return;
    const owner = capture();
    try {
      if (owner && current(owner) && pending(owner) === event.value) remember(owner, null);
    } catch (_) { /* Retry when the owner returns. */ }
  }

  function retry() {
    const owner = capture();
    if (!owner) return;
    try {
      const value = pending(owner);
      if (!value || !current(owner)) return;
      if (owner.persistence.readPreferenceRaw(key, null) !== value) {
        // An accepted edit or a cloud merge already replaced this local choice.
        remember(owner, null);
        return;
      }
      const catalogue = w.VildaICD10PLData?.entries;
      if (!Array.isArray(catalogue) || !validPending(value, catalogue)) return;
      if (attempted?.value === value && current(attempted.owner)) return;
      publish(owner, value);
    } catch (_) { /* Keep the intent for the next authorized activation. */ }
  }

  function getCodes(catalogue) {
    const owner = capture();
    if (!owner) return [];
    try {
      const codes = read(owner, catalogue);
      return current(owner) ? codes : [];
    } catch (_) { return []; }
  }

  function toggle(code, catalogue, isCurrent) {
    const owner = capture();
    if (!owner || typeof isCurrent !== 'function') return null;
    try {
      if (!known(catalogue, code) || isCurrent() !== true || !current(owner)) return null;
      followAccount();
      const codes = read(owner, catalogue);
      const found = codes.indexOf(code);
      if (found < 0) codes.push(code);
      else codes.splice(found, 1);
      const previous = pending(owner), value = JSON.stringify({schemaVersion: 1, codes});
      if (isCurrent() !== true || !current(owner) || !remember(owner, value)) return null;
      if (!publish(owner, value)) {
        if (current(owner) && pending(owner) === value) remember(owner, previous);
        return null;
      }
      notify();
      return current(owner) ? codes : null;
    } catch (_) { return null; }
  }

  function notify() {
    if (notificationQueued || !listeners.size) return;
    notificationQueued = true;
    queueMicrotask(function () {
      notificationQueued = false;
      for (const listener of Array.from(listeners)) {
        if (!listeners.has(listener)) continue;
        try { listener(); } catch (_) { /* Another picker can still refresh. */ }
      }
    });
  }

  function followAccount() {
    const vault = w.VildaVault, adapter = w.VildaPersistence;
    if (vault && !vaults.has(vault)) {
      vaults.add(vault);
      vault.onPreferenceChanged?.(function (event) { if (w.VildaVault === vault) acknowledge(event); });
      vault.onUnlock?.(function () { if (w.VildaVault === vault) { attempted = null; retry(); notify(); } });
      vault.onLock?.(function () { if (w.VildaVault === vault) { attempted = null; notify(); } });
    }
    if (adapter && !adapters.has(adapter)) {
      adapters.add(adapter);
      adapter.onPreferenceWrite?.(event => { if (event?.key === key) notify(); });
    }
  }

  function subscribe(listener) {
    followAccount();
    listeners.add(listener);
    retry();
    return () => listeners.delete(listener);
  }

  ['vilda:auth-loaded', 'vilda:session-changed'].forEach(function (type) {
    w.document?.addEventListener(type, function () { followAccount(); retry(); notify(); });
  });
  w.document?.addEventListener('vilda:sync-merged', function () { retry(); notify(); });
  w.addEventListener?.('storage', function (event) {
    const owner = capture();
    if (owner && (event.key === null || event.key === key + '::' + owner.userId)) notify();
  });

  w.VildaICD10Favorites = Object.freeze({canUse: () => !!capture(), getCodes, toggle, subscribe});
})(window);
