/* Ciphertext-only, account/tab-scoped UI handoffs. Clinical records, keys,
 * preferences and synchronization remain owned by the native Vault APIs.
 * Loading this module never inspects an account or starts authentication. */
(function (root) {
  'use strict';
  if (!root || root.VildaUiIntents) return;

  var PURPOSE = 'vilda-ui-intent', VERSION = 1, GH_TTL = 60000, EPOCH = 'vilda:ui-intent-epoch:v1';
  var KEYS = { 'gh-jump': 'vilda:gh-jump', 'pending-patient-load': 'vilda:pendingPatientLoad' };
  var serial = { 'gh-jump': 0, 'pending-patient-load': 0 }, blocked = { 'gh-jump': false, 'pending-patient-load': false }, pageGeneration = 0;
  function error(code) {
    var failure = new Error('Nie udało się bezpiecznie przekazać zamiaru. Spróbuj ponownie.');
    failure.code = 'UI_INTENT_' + code; return failure;
  }
  function key(kind) {
    if (!Object.prototype.hasOwnProperty.call(KEYS, kind)) throw error('INVALID');
    return KEYS[kind];
  }
  function reservationKey(kind) { key(kind); return 'vilda:ui-intent:' + kind + ':v1'; }
  function backend() {
    var store = root.sessionStorage;
    if (!store || store.__vildaMemoryStorage || typeof store.getItem !== 'function'
      || typeof store.setItem !== 'function' || typeof store.removeItem !== 'function') throw error('STORAGE');
    return store;
  }
  function tab() {
    var persistence = root.VildaPersistence;
    var value = persistence && typeof persistence.getTabId === 'function' ? persistence.getTabId() : null;
    if (typeof value !== 'string' || !value) throw error('UNAVAILABLE');
    return value;
  }
  function mode(vault) {
    var storageMode = typeof vault.getCurrentStorageModeSync === 'function' ? vault.getCurrentStorageModeSync() : null;
    var ephemeral = typeof vault.isEphemeralMode === 'function' ? vault.isEphemeralMode() : null;
    if (typeof vault.getCurrentStorageModeSync === 'function' && typeof storageMode !== 'string'
      || typeof vault.isEphemeralMode === 'function' && typeof ephemeral !== 'boolean') throw error('UNAVAILABLE');
    return { storageMode: storageMode, ephemeral: ephemeral };
  }
  function sameMode(left, right) { return !!(left && right && left.storageMode === right.storageMode && left.ephemeral === right.ephemeral); }
  function guest() {
    var auth = root.VildaAuthUI;
    return root.VildaGuestMode === true || !!(auth && typeof auth.isGuestMode === 'function' && auth.isGuestMode());
  }
  function inScope(scope) {
    try {
      if (scope == null) return true;
      return typeof scope === 'function' ? scope() === true
        : typeof scope.isCurrent === 'function' && scope.isCurrent() === true;
    } catch (_) { return false; }
  }
  function capture(kind, scope, createEpoch) {
    var vault = root.VildaVault;
    if (!vault || typeof vault.isUnlocked !== 'function' || !vault.isUnlocked() || guest()) throw error('LOCKED');
    if (typeof vault.getCurrentUser !== 'function' || typeof vault.captureSyncOperationSession !== 'function'
      || typeof vault.assertSyncOperationSession !== 'function'
      || typeof vault.encryptPayloadForCurrentUser !== 'function' || typeof vault.decryptPayloadForCurrentUser !== 'function') throw error('UNAVAILABLE');
    var user = vault.getCurrentUser();
    if (!user || typeof user.userId !== 'string' || !user.userId || !inScope(scope)) throw error('LOCKED');
    var owner = { vault: vault, account: user.userId, store: backend(), tab: tab(), document: root.document,
      generation: pageGeneration, serial: serial[kind], kind: kind, scope: scope,
      token: vault.captureSyncOperationSession(), mode: mode(vault) };
    owner.epoch = owner.store.getItem(EPOCH);
    vault.assertSyncOperationSession(owner.token);
    if (!currentOwner(owner, true)) throw error('SESSION_CHANGED');
    if (!owner.epoch && createEpoch) { owner.epoch = nonce(); write(owner.store, EPOCH, owner.epoch); }
    if (!currentOwner(owner, true)) throw error('SESSION_CHANGED');
    return owner;
  }
  function currentOwner(owner, includeScope) {
    try {
      var vault = root.VildaVault, user = vault && vault.getCurrentUser();
      if (!owner || vault !== owner.vault || !vault.isUnlocked() || guest() || !user || user.userId !== owner.account
        || backend() !== owner.store || tab() !== owner.tab || root.document !== owner.document
        || pageGeneration !== owner.generation || serial[owner.kind] !== owner.serial
        || owner.store.getItem(EPOCH) !== owner.epoch || !sameMode(mode(vault), owner.mode)
        || includeScope && !inScope(owner.scope)) return false;
      vault.assertSyncOperationSession(owner.token); return true;
    } catch (_) { return false; }
  }
  function nonce() {
    var crypto = root.crypto;
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    if (!crypto || typeof crypto.getRandomValues !== 'function') throw error('UNAVAILABLE');
    var bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  }
  function cleanValue(kind, value) {
    key(kind);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw error('INVALID');
    if (kind === 'pending-patient-load') {
      if (typeof value.patientId !== 'string' || !value.patientId) throw error('INVALID');
      return { patientId: value.patientId };
    }
    var hasGh = Object.prototype.hasOwnProperty.call(value, 'ghPointId');
    var hasObesity = Object.prototype.hasOwnProperty.call(value, 'obesity');
    if (hasGh === hasObesity) throw error('INVALID');
    var clean;
    if (hasObesity) {
      var target = value.obesity;
      if (typeof value.patientId !== 'string' || !value.patientId || !target || typeof target !== 'object'
        || Array.isArray(target) || Object.keys(target).sort().join(',') !== 'entryId,tryb'
        || !['edytuj', 'ponownie', 'wlaczenie'].includes(target.tryb)
        || (target.tryb === 'wlaczenie' ? target.entryId !== null : typeof target.entryId !== 'string' || !target.entryId)
        || typeof value.ts !== 'number' || !Number.isFinite(value.ts)) throw error('INVALID');
      clean = { patientId: value.patientId, obesity: Object.freeze({ tryb: target.tryb, entryId: target.entryId }), ts: value.ts };
    } else {
      if (typeof value.ghPointId !== 'string' || !value.ghPointId) throw error('INVALID');
      clean = { ghPointId: value.ghPointId };
    }
    if (Object.prototype.hasOwnProperty.call(value, 'patientId')) {
      if (value.patientId != null && typeof value.patientId !== 'string') throw error('INVALID');
      clean.patientId = value.patientId;
    }
    if (Object.prototype.hasOwnProperty.call(value, 'ts')) {
      if (value.ts != null && (typeof value.ts !== 'number' || !Number.isFinite(value.ts))) throw error('INVALID');
      clean.ts = value.ts;
    }
    return clean;
  }
  function expired(kind, value) { return kind === 'gh-jump' && typeof value.ts === 'number' && Date.now() - value.ts > GH_TTL; }
  function cipherValue(value) {
    return !!(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 2
      && typeof value.iv === 'string' && value.iv && typeof value.data === 'string' && value.data);
  }
  function write(store, name, value) {
    store.setItem(name, value);
    if (store.getItem(name) !== value) throw error('STORAGE');
  }
  function owns(owner, reservation, raw, includeScope) {
    return currentOwner(owner, includeScope) && owner.store.getItem(reservationKey(owner.kind)) === reservation
      && owner.store.getItem(key(owner.kind)) === raw;
  }
  // An unsupported old plaintext value is retired, never decrypted as an ID or
  // rewritten. A newer raw value or reservation is never removed by this read.
  function retire(owner, reservation, raw, removeReservation) {
    try {
      if (!owns(owner, reservation, raw, false)) return false;
      owner.store.removeItem(key(owner.kind));
      if (owner.store.getItem(key(owner.kind)) !== null) return false;
      if (removeReservation !== false && owner.store.getItem(reservationKey(owner.kind)) === reservation) owner.store.removeItem(reservationKey(owner.kind));
      return true;
    } catch (_) { return false; }
  }
  function peek(kind) { try { return backend().getItem(key(kind)); } catch (_) { return null; } }

  async function prepare(kind, value, scope) {
    var clean = cleanValue(kind, value); serial[kind]++;
    var owner = capture(kind, scope, true), reservation = nonce(), raw = null;
    try {
      if (expired(kind, clean)) throw error('EXPIRED');
      // The reservation is public random UI metadata. It contains no account,
      // patient, point, crypto key or other payload and is shared across frames.
      write(owner.store, reservationKey(kind), reservation);
      owner.store.removeItem(key(kind));
      if (!owns(owner, reservation, null, true)) throw error('SESSION_CHANGED');
      var plain = { namespace: PURPOSE, version: VERSION, purpose: kind, accountId: owner.account,
        tabId: owner.tab, epoch: owner.epoch, mode: owner.mode, nonce: reservation, value: clean };
      var cipher = await owner.vault.encryptPayloadForCurrentUser(plain);
      if (!owns(owner, reservation, null, true)) throw error('SESSION_CHANGED');
      if (expired(kind, clean)) throw error('EXPIRED');
      if (!cipherValue(cipher)) throw error('CRYPTO');
      raw = JSON.stringify({ iv: cipher.iv, data: cipher.data });
      write(owner.store, key(kind), raw);
      if (!owns(owner, reservation, raw, true)) throw error('SESSION_CHANGED');
      blocked[kind] = false;
      return Object.freeze({ raw: raw, current: function () {
        try { return !expired(kind, clean) && owns(owner, reservation, raw, true); } catch (_) { return false; }
      }, discardExact: function () { return retire(owner, reservation, raw); } });
    } catch (failure) {
      try { if (owns(owner, reservation, raw, false)) retire(owner, reservation, raw); } catch (_) {}
      throw failure;
    }
  }
  async function open(kind, raw, scope) {
    var owner, reservation;
    try {
      key(kind); if (blocked[kind] || typeof raw !== 'string' || !raw) return null;
      owner = capture(kind, scope, false); reservation = owner.store.getItem(reservationKey(kind));
      if (owner.store.getItem(key(kind)) !== raw) return null;
      var cipher; try { cipher = JSON.parse(raw); } catch (_) { retire(owner, reservation, raw, false); return null; }
      if (!cipherValue(cipher) || typeof reservation !== 'string' || !reservation || typeof owner.epoch !== 'string' || !owner.epoch) { retire(owner, reservation, raw, false); return null; }
      var plain = await owner.vault.decryptPayloadForCurrentUser(cipher.iv, cipher.data);
      if (!owns(owner, reservation, raw, true)) { retire(owner, reservation, raw); return null; }
      if (!plain || plain.namespace !== PURPOSE || plain.version !== VERSION || plain.purpose !== kind
        || plain.accountId !== owner.account || plain.tabId !== owner.tab || plain.epoch !== owner.epoch
        || !sameMode(plain.mode, owner.mode) || plain.nonce !== reservation) {
        retire(owner, reservation, raw, !!(plain && plain.nonce === reservation)); return null;
      }
      var value = Object.freeze(cleanValue(kind, plain.value));
      if (expired(kind, value)) { retire(owner, reservation, raw); return null; }
      var consumed = false, discarded = false;
      function current() {
        try { return !discarded && (consumed || !expired(kind, value)) && owns(owner, reservation, consumed ? null : raw, true); }
        catch (_) { return false; }
      }
      return Object.freeze({ value: value, current: current,
        consumeExact: function () {
          if (consumed || !current()) return false;
          try {
            owner.store.removeItem(key(kind));
            if (!owns(owner, reservation, null, true)) return false;
            consumed = true; return true;
          } catch (_) { return false; }
        },
        discardExact: function () {
          if (consumed || discarded) return false;
          var result = retire(owner, reservation, raw); if (result) discarded = true; return result;
        }
      });
    } catch (_) { if (owner && raw) retire(owner, reservation, raw, false); return null; }
  }
  function clear(kind) {
    var kinds = kind == null ? Object.keys(KEYS) : [kind], result = true;
    kinds.forEach(function (name) {
      try {
        // RAM authority ends even when an unavailable backend refuses cleanup.
        key(name); serial[name]++; blocked[name] = true;
        var store = backend();
        store.removeItem(key(name)); store.removeItem(reservationKey(name));
        if (store.getItem(key(name)) !== null || store.getItem(reservationKey(name)) !== null) throw error('STORAGE');
        blocked[name] = false;
      } catch (_) { result = false; }
    });
    if (kind == null) try {
      var store = backend(); store.removeItem(EPOCH);
      if (store.getItem(EPOCH) !== null) throw error('STORAGE');
    } catch (_) { kinds.forEach(function (name) { blocked[name] = true; }); result = false; }
    return result;
  }
  function onBoundary(detail) {
    var trigger = typeof detail === 'string' ? detail : detail && detail.trigger;
    return trigger === 'restore' ? false : clear();
  }
  // Producers own navigation readiness. This is only their source UI lifetime:
  // it never inspects an account, token, target patient or authentication phase.
  function captureCallerScope() {
    var active = true, cleanup = [], snapshot;
    function stop() {
      if (!active) return;
      active = false;
      cleanup.splice(0).forEach(function (remove) { try { remove(); } catch (_) {} });
    }
    function listen(target, type, callback) {
      if (!active || !target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, callback, true);
      cleanup.push(function () { target.removeEventListener(type, callback, true); });
    }
    function loadSequence(api) {
      return api && typeof api.getApplyLoadedDataSequence === 'function' ? api.getApplyLoadedDataSequence() : null;
    }
    try {
      var doc = root.document, frame = root.frameElement || null, host = frame ? root.parent : root;
      var store = backend(), importer = root.VildaDataImportExport || null;
      snapshot = { document: doc, frame: frame, host: host, hostDocument: host.document,
        href: String(root.location.href), hostHref: String(host.location.href),
        navId: (host.history && host.history.state || {}).shellNavId,
        store: store, patient: store.getItem('vildaCurrentPatientId'),
        importer: importer, sequence: loadSequence(importer) };
      if (!doc || doc.hidden === true || frame && (frame.hidden || typeof root.MutationObserver !== 'function')) stop();
      listen(root, 'pagehide', stop);
      listen(doc, 'visibilitychange', function () { if (doc.hidden === true) stop(); });
      listen(root, 'hashchange', stop); listen(root, 'popstate', stop);
      if (host !== root) { listen(host, 'hashchange', stop); listen(host, 'popstate', stop); }
      ['vilda:patient-loaded', 'vilda:json-imported', 'vilda:load-choice-applied',
        'vilda:state-restored', 'vilda:user-state-cleared'].forEach(function (type) { listen(doc, type, stop); });
      listen(root, 'vilda:user-state-cleared', stop);
      if (active && frame) {
        var observer = new root.MutationObserver(function (records) { if (records.length) stop(); });
        observer.observe(frame, { attributes: true, attributeFilter: ['hidden', 'src'] });
        cleanup.push(function () { observer.disconnect(); });
      }
    } catch (_) { stop(); }
    function isCurrent() {
      try {
        var frame = snapshot && snapshot.frame, host = snapshot && snapshot.host;
        return !!(active && snapshot && root.document === snapshot.document && snapshot.document.hidden !== true
          && (root.frameElement || null) === frame && host.document === snapshot.hostDocument
          && String(root.location.href) === snapshot.href && String(host.location.href) === snapshot.hostHref
          && (host.history && host.history.state || {}).shellNavId === snapshot.navId
          && (!frame || !frame.hidden && frame.isConnected !== false)
          && backend() === snapshot.store && snapshot.store.getItem('vildaCurrentPatientId') === snapshot.patient
          && (root.VildaDataImportExport || null) === snapshot.importer
          && loadSequence(snapshot.importer) === snapshot.sequence);
      } catch (_) { return false; }
    }
    return Object.freeze({ isCurrent: isCurrent, dispose: stop });
  }
  root.VildaUiIntents = Object.freeze({ version: VERSION, prepare: prepare, peek: peek, open: open,
    clear: clear, onBoundary: onBoundary, reservationKey: reservationKey, captureCallerScope: captureCallerScope });
  if (typeof root.addEventListener === 'function') root.addEventListener('pagehide', function () { pageGeneration++; });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
