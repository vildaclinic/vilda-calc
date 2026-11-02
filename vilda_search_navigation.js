/* Short-lived encrypted UI handoff. It never writes a clinical record or key.
 * Load after vault/persistence and before AuthUI starts session restoration. */
(function (root) {
  'use strict';
  if (!root || root.VildaSearchNavigation) return;

  var KEY = 'vilda-search-navigation-v1', SESSION = 'vilda-search-navigation-session-v1';
  var PURPOSE = 'vilda-search-navigation', TTL = 30 * 60 * 1000, MAX_BYTES = 32768;
  var PATHS = ['app.html', 'cukrzyca.html', 'docpro.html', 'genotropin-instrukcja.html', 'homa-ir.html',
    'index.html', 'instrukcja.html', 'kalkulator-klirens.html', 'kontakt.html', 'materialy-edukacyjne.html',
    'ngenla-instrukcja.html', 'notatki.html', 'o-aplikacji.html', 'omnitrope-instrukcja.html',
    'polityka-prywatnosci.html', 'przelicznik-doposilkowy-instrukcja.html', 'przelicznik-jednostek.html',
    'regulamin.html', 'steroidy.html', 'subskrypcja.html', 'terminarz.html', 'ustawienia.html'];
  var ROUTES = ['start', 'docpro', 'lab', 'klirens', 'terminarz'];
  var stores = new Set(), vault = null, ready = false, generation = 0, pending = null, known = null;

  function error(code) { var value = new Error('Nie udało się zachować powrotu do wyszukiwania.'); value.code = code; return value; }
  function text(value, maximum, nullable) {
    if (nullable && (value == null || value === '')) return null;
    if (typeof value !== 'string' || value.length > maximum) throw error('SEARCH_NAVIGATION_INVALID');
    return value;
  }
  function identifier(value) {
    value = text(value, 256, false);
    if (!value || !/^[A-Za-z0-9._:-]+$/.test(value)) throw error('SEARCH_NAVIGATION_INVALID');
    return value;
  }
  function number(value, fallback, minimum) {
    if (value == null) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > 1000000000) throw error('SEARCH_NAVIGATION_INVALID');
    return value;
  }
  function choice(value, choices) { return choices.indexOf(value) >= 0 ? value : 'all'; }
  function context(value) {
    value = value || {};
    var result = { version: 1, query: text(value.query == null ? '' : value.query, 4096, false),
      time: choice(value.time, ['all', 'future', 'past', 'today', 'undated']),
      status: choice(value.status, ['all', 'open', 'waiting', 'completed', 'no-show']),
      id: text(value.id, 256, true), mode: value.mode === 'list' ? 'list' : 'detail',
      limit: Math.max(50, Math.floor(number(value.limit, 50, 0))),
      listScrollTop: number(value.listScrollTop, 0, 0), detailScrollTop: number(value.detailScrollTop, 0, 0),
      focus: text(value.focus, 256, true), origin: null };
    if (value.origin) result.origin = { query: text(value.origin.query == null ? result.query : value.origin.query, 4096, false),
      time: choice(value.origin.time, ['all', 'future', 'past', 'today', 'undated']),
      status: choice(value.origin.status, ['all', 'open', 'waiting', 'completed', 'no-show']),
      id: text(value.origin.id, 256, true), limit: Math.max(50, Math.floor(number(value.origin.limit, 50, 0))),
      listScrollTop: number(value.origin.listScrollTop, 0, 0) };
    return result;
  }
  function parent(value) {
    if (!value) return null;
    if (value.kind === 'plan') return { kind: 'plan', planId: text(value.planId, 256, true), recordId: text(value.recordId, 256, true) };
    if (value.kind === 'matter') return { kind: 'matter', noteId: text(value.noteId, 256, true) };
    throw error('SEARCH_NAVIGATION_INVALID');
  }
  function sourcePath(value) {
    value = text(value, 512, false);
    var base = new root.URL('.', root.location.href), url = new root.URL(value, base);
    var name = url.pathname.slice(base.pathname.length);
    if (url.origin !== base.origin || url.search || url.hash || url.pathname !== base.pathname + name || PATHS.indexOf(name) < 0) throw error('SEARCH_NAVIGATION_INVALID');
    return name;
  }
  function data(value) {
    value = value || {};
    if (value.sourceRoute != null && ROUTES.indexOf(value.sourceRoute) < 0) throw error('SEARCH_NAVIGATION_INVALID');
    return { id: identifier(value.id), context: context(value.context), parent: parent(value.parent),
      sourcePath: sourcePath(value.sourcePath), sourceRoute: value.sourceRoute || null,
      targetNoteId: text(value.targetNoteId, 256, true), targetPatientId: text(value.targetPatientId, 256, true) };
  }
  function random() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    if (!root.crypto || typeof root.crypto.getRandomValues !== 'function') throw error('SEARCH_NAVIGATION_UNAVAILABLE');
    var bytes = root.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  }
  function storage() {
    var persistence = root.VildaPersistence;
    var result = persistence && typeof persistence.getStorage === 'function' ? persistence.getStorage('session') : null;
    if (!result || result.__vildaMemoryStorage) throw error('SEARCH_NAVIGATION_STORAGE');
    stores.add(result); return result;
  }
  function remove(store, key) { try { store.removeItem(key); } catch {} }
  function write(store, key, value) {
    try { store.setItem(key, value); if (store.getItem(key) !== value) throw error('SEARCH_NAVIGATION_STORAGE'); }
    catch (_) { throw error('SEARCH_NAVIGATION_STORAGE'); }
  }
  // The opaque UI epoch shares the tab scope of getTabId, across storage-mode
  // prefixes. A fresh login or new UI intent must also invalidate old prefixes.
  function markerStorage() {
    var result = root.sessionStorage;
    if (!result || result.__vildaMemoryStorage) throw error('SEARCH_NAVIGATION_STORAGE');
    return result;
  }
  function removeMarker(expected) {
    try { var store = markerStorage(); if (expected == null || store.getItem(SESSION) === expected) store.removeItem(SESSION); } catch {}
  }
  function marker(create) {
    var store = markerStorage(), value = store.getItem(SESSION);
    if (!value && create) { value = random(); write(store, SESSION, value); }
    return value;
  }
  function clear(id) {
    var removed = false;
    if (id != null) {
      if (pending && pending.id === id) { removeMarker(pending.session); pending = null; generation++; removed = true; }
      if (known && known.id === id) {
        try { if (known.store.getItem(KEY) === known.raw) { known.store.removeItem(KEY); removeMarker(known.session); removed = true; generation++; } } catch {}
        known = null;
      }
      return removed;
    }
    generation++; pending = null; known = null;
    try { storage(); } catch {}
    stores.forEach(function (store) { remove(store, KEY); });
    removeMarker();
    return true;
  }
  function clearOwner() {
    clear(); ready = false;
    stores.clear();
  }
  function guest() { return !!(root.VildaAuthUI && typeof root.VildaAuthUI.isGuestMode === 'function' && root.VildaAuthUI.isGuestMode()); }
  function resetUnlocked() {
    clearOwner(); ready = !!(vault && vault.isUnlocked() && !guest());
    if (ready) try { storage(); marker(true); } catch {}
  }
  function bind() {
    var candidate = root.VildaVault;
    if (!candidate || candidate === vault) return;
    if (vault) clearOwner();
    vault = candidate; ready = false;
    if (typeof vault.onLock !== 'function' || typeof vault.onUnlock !== 'function') return;
    candidate.onLock(function () { if (vault === candidate) clearOwner(); });
    candidate.onUnlock(function (detail) {
      if (vault !== candidate) return;
      if (!detail || detail.trigger !== 'restore') clearOwner();
      else { generation++; pending = null; known = null; }
      ready = !guest();
      if (ready) try { storage(); marker(true); } catch {}
    });
    // An already unlocked vault may have missed a fresh-login notification.
    // Preserve nothing from that unknown lifecycle; new prepare calls are safe.
    if (candidate.isUnlocked()) {
      clearOwner(); ready = !guest();
      if (ready) try { storage(); marker(true); } catch {}
    }
  }
  function capture(createMarker) {
    bind();
    if (guest()) { clearOwner(); throw error('SEARCH_NAVIGATION_LOCKED'); }
    if (!vault || !ready || !vault.isUnlocked()) throw error('SEARCH_NAVIGATION_LOCKED');
    if (typeof vault.captureSyncOperationSession !== 'function' || typeof vault.assertSyncOperationSession !== 'function') throw error('SEARCH_NAVIGATION_UNAVAILABLE');
    var account = vault.getCurrentUser(), store = storage(), session = marker(createMarker);
    var tab = root.VildaPersistence && root.VildaPersistence.getTabId();
    if (!account || !account.userId || !session || !tab) throw error('SEARCH_NAVIGATION_LOCKED');
    return { vault: vault, account: account.userId, store: store, session: session, tab: tab,
      fence: vault.captureSyncOperationSession(), generation: generation };
  }
  function current(owner) {
    var account = vault && vault.getCurrentUser();
    return vault === owner.vault && root.VildaVault === owner.vault && ready && vault.isUnlocked() && !guest() && generation === owner.generation
      && account && account.userId === owner.account && marker(false) === owner.session
      && root.VildaPersistence.getTabId() === owner.tab && vault.assertSyncOperationSession(owner.fence);
  }
  function discard(owner, raw) {
    try { if (current(owner) && owner.store.getItem(KEY) === raw) { owner.store.removeItem(KEY); known = null; } } catch {}
  }
  function readCurrent(options) {
    try { return !options || typeof options.isCurrent !== 'function' || !!options.isCurrent(); } catch { return false; }
  }
  async function prepare(value) {
    var clean = data(value); clear();
    var owner = capture(true), operation = { id: clean.id, session: owner.session }; pending = operation;
    var now = Date.now(), plain = Object.assign({ namespace: PURPOSE, version: 1, purpose: 'calendar-return',
      nonce: random(), userId: owner.account, tabId: owner.tab, sessionId: owner.session,
      createdAt: now, expiresAt: now + TTL }, clean);
    if (JSON.stringify(plain).length > MAX_BYTES) throw error('SEARCH_NAVIGATION_INVALID');
    try {
      var cipher = await vault.encryptPayloadForCurrentUser(plain);
      if (!current(owner) || pending !== operation) throw error('SEARCH_NAVIGATION_SESSION_CHANGED');
      if (Date.now() >= plain.expiresAt) throw error('SEARCH_NAVIGATION_EXPIRED');
      var raw = JSON.stringify({ iv: cipher.iv, data: cipher.data });
      if (raw.length > MAX_BYTES * 2) throw error('SEARCH_NAVIGATION_INVALID');
      write(owner.store, KEY, raw); known = { id: clean.id, raw: raw, store: owner.store, session: owner.session };
      return { id: clean.id };
    } finally { if (pending === operation) pending = null; }
  }
  async function read(id, options) {
    var owner, raw;
    try {
      if (!readCurrent(options)) return null;
      owner = capture(false); raw = owner.store.getItem(KEY);
      if (!raw || raw.length > MAX_BYTES * 2) { if (raw) discard(owner, raw); return null; }
      var cipher = JSON.parse(raw);
      if (!cipher || Object.keys(cipher).length !== 2 || typeof cipher.iv !== 'string' || typeof cipher.data !== 'string') { discard(owner, raw); return null; }
      var plain = await vault.decryptPayloadForCurrentUser(cipher.iv, cipher.data);
      if (!current(owner) || owner.store.getItem(KEY) !== raw || !readCurrent(options)) return null;
      var now = Date.now();
      if (!plain || plain.namespace !== PURPOSE || plain.version !== 1 || plain.purpose !== 'calendar-return'
        || plain.userId !== owner.account || plain.tabId !== owner.tab || plain.sessionId !== owner.session
        || typeof plain.nonce !== 'string' || !plain.nonce || !Number.isSafeInteger(plain.createdAt)
        || !Number.isSafeInteger(plain.expiresAt) || plain.createdAt > now || plain.expiresAt <= now
        || plain.expiresAt - plain.createdAt !== TTL || JSON.stringify(plain).length > MAX_BYTES) { discard(owner, raw); return null; }
      var clean = data(plain);
      if (id != null && clean.id !== id) return null;
      known = { id: clean.id, raw: raw, store: owner.store, session: owner.session };
      if (options && options.consume) { owner.store.removeItem(KEY); removeMarker(owner.session); generation++; known = null; }
      return Object.assign(clean, { expiresAt: plain.expiresAt });
    } catch (_) { if (owner && raw && readCurrent(options)) discard(owner, raw); return null; }
  }

  root.VildaSearchNavigation = Object.freeze({ prepare: prepare, read: read, clear: clear });
  bind();
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('pagehide', function () { generation++; pending = null; });
    root.addEventListener('vilda:user-state-cleared', resetUnlocked);
  }
  if (root.document && typeof root.document.addEventListener === 'function') {
    root.document.addEventListener('vilda:auth-loaded', bind);
    root.document.addEventListener('vilda:user-state-cleared', resetUnlocked);
    root.document.addEventListener('vilda:guest-mode-changed', function (event) {
      if (event.detail && event.detail.guest === true) clearOwner();
    });
    root.document.addEventListener('vilda:auth-boot-settled', function () {
      bind(); if (!vault || !vault.isUnlocked() || guest()) clearOwner();
    });
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
