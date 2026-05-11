/*
 * Vilda File Export v1.0.0
 *
 * Etap 8R-4d: automatyczny zapis pliku .vilda po każdym savePatient. Obsługuje
 * dwa scenariusze:
 *   A) Chrome/Edge na desktopie z File System Access API → użytkownik raz
 *      wybiera folder kopii zapasowej, uchwyt jest zapisywany w IndexedDB
 *      i przy każdym kolejnym zapisie tworzymy/aktualizujemy plik
 *      vilda_<shortHash>.vilda w tym folderze (czyste nadpisanie).
 *   B) Pozostałe przeglądarki (Safari, Firefox, mobile) → fallback przez
 *      anchor.click() z download — przeglądarka decyduje gdzie zapisuje
 *      (zwykle Pobrane). W tym wariancie pliki o tej samej nazwie mogą
 *      się duplikować jako „(1).vilda”.
 *
 * Moduł jest pasywny: subskrybuje VildaVault.onPatientSaved(). UI (etap 4 cd.)
 * dostarczy przycisków „Wybierz folder kopii” / „Wyłącz auto-eksport”.
 *
 * Storage adapter dla uchwytu folderu trzymamy w osobnej bazie
 * vilda_export_settings (per-przeglądarka, NIE per-user — uchwyty FSA są
 * związane z origin), pole `folderHandleByUser` jest mapą userId → handle,
 * żeby każdy lekarz miał własny folder.
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaFileExport && global.VildaFileExport.__vildaFileExport) {
    return;
  }

  const VERSION = '1.3.0';
  const STEP = '8R-9a';
  const DB_NAME = 'vilda_export_settings';
  const DB_VERSION = 1;
  const STORE_HANDLES = 'folderHandlesByUser';
  const STORE_PREFS = 'preferencesByUser';
  // Etap 8R-5d: pliki kopii zapasowych nazywamy bezpośrednio od aplikacji
  // wagaiwzrost.pl, bez słowa „vilda" w nazwie. Stare pliki .vilda dalej można
  // importować — UI akceptuje oba rozszerzenia.
  const FILENAME_PREFIX = 'wagaiwzrost_pacjent_';
  const FILENAME_SUFFIX = '.wiw';
  const AUTO_VAULT_BACKUP_DEFAULT_INTERVAL_MIN = 5;
  const AUTO_VAULT_BACKUP_DEFAULT_ENABLED = true;
  const SUPPORTS_FSA = !!(global.window && typeof global.window.showDirectoryPicker === 'function');

  let bound = false;
  let storageAdapter = null;
  const onExportListeners = [];

  // ============ ZALEŻNOŚCI ============
  function getVault() { return global.VildaVault || null; }

  function logWarn(msg) {
    if (typeof global.vildaLogAppWarn === 'function') {
      try { global.vildaLogAppWarn('vilda_file_export', msg); return; } catch (_) {}
    }
    if (global.console && typeof global.console.warn === 'function') {
      global.console.warn('[VildaFileExport] ' + msg);
    }
  }

  function logError(msg, err) {
    if (typeof global.vildaLogAppError === 'function') {
      try { global.vildaLogAppError('vilda_file_export', msg, err); return; } catch (_) {}
    }
    if (global.console && typeof global.console.error === 'function') {
      global.console.error('[VildaFileExport] ' + msg, err);
    }
  }

  function notifyExport(detail) {
    onExportListeners.forEach(function (fn) {
      try { fn(detail); } catch (_) {}
    });
  }

  function onExport(fn) {
    if (typeof fn === 'function') onExportListeners.push(fn);
  }

  // ============ ADAPTER (IndexedDB / in-memory) ============
  function createIndexedDbAdapter() {
    function openDb() {
      return new Promise(function (resolve, reject) {
        const req = global.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function (e) {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_HANDLES)) {
            db.createObjectStore(STORE_HANDLES, { keyPath: 'userId' });
          }
          if (!db.objectStoreNames.contains(STORE_PREFS)) {
            db.createObjectStore(STORE_PREFS, { keyPath: 'userId' });
          }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    function reqToPromise(req) {
      return new Promise(function (resolve, reject) {
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    return {
      async getFolderHandle(userId) {
        const db = await openDb();
        const store = db.transaction(STORE_HANDLES, 'readonly').objectStore(STORE_HANDLES);
        const rec = await reqToPromise(store.get(userId));
        return rec ? rec.handle : null;
      },
      async putFolderHandle(userId, handle) {
        const db = await openDb();
        const store = db.transaction(STORE_HANDLES, 'readwrite').objectStore(STORE_HANDLES);
        await reqToPromise(store.put({ userId: userId, handle: handle }));
        return true;
      },
      async deleteFolderHandle(userId) {
        const db = await openDb();
        const store = db.transaction(STORE_HANDLES, 'readwrite').objectStore(STORE_HANDLES);
        await reqToPromise(store.delete(userId));
        return true;
      },
      async getPrefs(userId) {
        const db = await openDb();
        const store = db.transaction(STORE_PREFS, 'readonly').objectStore(STORE_PREFS);
        const rec = await reqToPromise(store.get(userId));
        return rec ? rec : null;
      },
      async putPrefs(userId, prefs) {
        const db = await openDb();
        const store = db.transaction(STORE_PREFS, 'readwrite').objectStore(STORE_PREFS);
        await reqToPromise(store.put(Object.assign({}, prefs, { userId: userId })));
        return true;
      }
    };
  }

  function createInMemoryAdapter() {
    const handles = new Map();
    const prefs = new Map();
    return {
      async getFolderHandle(userId) { return handles.has(userId) ? handles.get(userId) : null; },
      async putFolderHandle(userId, handle) { handles.set(userId, handle); return true; },
      async deleteFolderHandle(userId) { handles.delete(userId); return true; },
      async getPrefs(userId) { return prefs.has(userId) ? Object.assign({}, prefs.get(userId)) : null; },
      async putPrefs(userId, p) { prefs.set(userId, Object.assign({}, p)); return true; }
    };
  }

  function getAdapter() {
    if (storageAdapter) return storageAdapter;
    if (global.indexedDB && typeof global.indexedDB.open === 'function') {
      storageAdapter = createIndexedDbAdapter();
    } else {
      storageAdapter = createInMemoryAdapter();
    }
    return storageAdapter;
  }

  function setStorageAdapter(adapter) {
    storageAdapter = adapter || null;
  }

  // ============ FILE SYSTEM ACCESS API ============
  async function requestFolderHandle() {
    if (!SUPPORTS_FSA) {
      throw new Error('VildaFileExport: File System Access API niedostępne w tej przeglądarce.');
    }
    const handle = await global.window.showDirectoryPicker({
      id: 'vilda-vault-export',
      mode: 'readwrite',
      startIn: 'documents'
    });
    return handle;
  }

  async function ensureWriteAccess(handle) {
    if (!handle || typeof handle.requestPermission !== 'function') return false;
    let state = 'prompt';
    try { state = await handle.queryPermission({ mode: 'readwrite' }); } catch (_) {}
    if (state === 'granted') return true;
    try { state = await handle.requestPermission({ mode: 'readwrite' }); } catch (_) {}
    return state === 'granted';
  }

  async function setFolderForCurrentUser() {
    const V = getVault();
    if (!V || !V.isUnlocked()) {
      throw new Error('VildaFileExport: zaloguj się przed wyborem folderu kopii.');
    }
    const user = V.getCurrentUser();
    const handle = await requestFolderHandle();
    const granted = await ensureWriteAccess(handle);
    if (!granted) throw new Error('VildaFileExport: brak uprawnień do zapisu w wybranym folderze.');
    await getAdapter().putFolderHandle(user.userId, handle);
    return { name: handle.name || '(folder)' };
  }

  async function clearFolderForCurrentUser() {
    const V = getVault();
    if (!V || !V.isUnlocked()) return false;
    const user = V.getCurrentUser();
    await getAdapter().deleteFolderHandle(user.userId);
    return true;
  }

  async function getFolderInfoForCurrentUser() {
    const V = getVault();
    if (!V || !V.isUnlocked()) return { supported: SUPPORTS_FSA, hasFolder: false };
    const user = V.getCurrentUser();
    const handle = await getAdapter().getFolderHandle(user.userId);
    return {
      supported: SUPPORTS_FSA,
      hasFolder: !!handle,
      folderName: (handle && handle.name) || null
    };
  }

  // ============ ZAPIS PLIKU ============
  function buildFilename(shortHash) {
    const safeHash = (typeof shortHash === 'string' && /^[0-9a-f]+$/i.test(shortHash)) ? shortHash : '00000000';
    return FILENAME_PREFIX + safeHash + FILENAME_SUFFIX;
  }

  function sanitizeLabelForFilename(label) {
    const raw = (typeof label === 'string' && label.trim().length) ? label.trim() : 'konto';
    const noDiacritics = raw
      .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
      .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z')
      .replace(/Ą/g, 'A').replace(/Ć/g, 'C').replace(/Ę/g, 'E').replace(/Ł/g, 'L')
      .replace(/Ń/g, 'N').replace(/Ó/g, 'O').replace(/Ś/g, 'S').replace(/Ź/g, 'Z').replace(/Ż/g, 'Z');
    return noDiacritics
      .replace(/\s+/g, '_')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/[^A-Za-z0-9_\-\.]/g, '')
      .slice(0, 40) || 'konto';
  }

  // Stała nazwa (bez daty) — używana przez auto-backup, żeby plik był
  // nadpisywany przy każdym zapisie zamiast akumulować się w folderze.
  function buildVaultBackupFilenameStable(label) {
    return 'wagaiwzrost_konto_' + sanitizeLabelForFilename(label) + FILENAME_SUFFIX;
  }

  function buildVaultBackupFilename(label) {
    // sanitized label do bezpiecznej nazwy pliku — bez spacji, slashy, polskich
    // znaków diakrytycznych. Plus data dla czytelności wersji.
    const raw = (typeof label === 'string' && label.trim().length) ? label.trim() : 'konto';
    const noDiacritics = raw
      .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
      .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z')
      .replace(/Ą/g, 'A').replace(/Ć/g, 'C').replace(/Ę/g, 'E').replace(/Ł/g, 'L')
      .replace(/Ń/g, 'N').replace(/Ó/g, 'O').replace(/Ś/g, 'S').replace(/Ź/g, 'Z').replace(/Ż/g, 'Z');
    const safe = noDiacritics
      .replace(/\s+/g, '_')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/[^A-Za-z0-9_\-\.]/g, '')
      .slice(0, 40) || 'konto';
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return 'wagaiwzrost_konto_' + safe + '_' + dateStr + FILENAME_SUFFIX;
  }

  function envelopeToBlob(envelope) {
    const text = JSON.stringify(envelope, null, 2);
    return new global.Blob([text], { type: 'application/octet-stream' });
  }

  async function writeEnvelopeViaFsa(handle, filename, envelope) {
    if (!handle || typeof handle.getFileHandle !== 'function') {
      throw new Error('VildaFileExport: niepoprawny uchwyt folderu.');
    }
    const granted = await ensureWriteAccess(handle);
    if (!granted) throw new Error('VildaFileExport: utracone uprawnienia do folderu.');
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(envelopeToBlob(envelope));
    await writable.close();
    return { method: 'fsa', filename: filename, folderName: handle.name || '(folder)' };
  }

  function downloadEnvelopeViaBlob(filename, envelope) {
    if (!global.document) throw new Error('VildaFileExport: brak document dla downloadu.');
    const blob = envelopeToBlob(envelope);
    const url = (global.URL || global.webkitURL).createObjectURL(blob);
    const a = global.document.createElement('a');
    a.href = url;
    a.download = filename;
    global.document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { (global.URL || global.webkitURL).revokeObjectURL(url); } catch (_) {}
      try { if (a.parentNode) a.parentNode.removeChild(a); } catch (_) {}
    }, 0);
    return { method: 'download', filename: filename };
  }

  async function exportPatient(patientId, options) {
    const V = getVault();
    if (!V || !V.isUnlocked()) {
      throw new Error('VildaFileExport: zaloguj się przed eksportem.');
    }
    const opts = options || {};
    const envelope = await V.exportPatientEnvelope(patientId);
    const shortHash = (typeof V.shortHashOfPatientId === 'function')
      ? V.shortHashOfPatientId(patientId)
      : '00000000';
    const filename = (typeof opts.filename === 'string' && opts.filename) ? opts.filename : buildFilename(shortHash);
    const user = V.getCurrentUser();
    const handle = await getAdapter().getFolderHandle(user.userId);

    if (handle && SUPPORTS_FSA) {
      try {
        const result = await writeEnvelopeViaFsa(handle, filename, envelope);
        notifyExport(Object.assign({ patientId: patientId }, result));
        return result;
      } catch (e) {
        logWarn('FSA write failed, fallback to download: ' + (e && e.message ? e.message : e));
        // fallthrough do download
      }
    }
    if (opts.allowFallbackDownload === false) {
      throw new Error('VildaFileExport: brak folderu i fallback download wyłączony.');
    }
    const result = downloadEnvelopeViaBlob(filename, envelope);
    notifyExport(Object.assign({ patientId: patientId }, result));
    return result;
  }

  // ============ EKSPORT PEŁNEGO BACKUPU VAULTU ============
  // Wymaga zalogowanego usera. Buduje envelope z exportVaultBackup() i zapisuje
  // do FSA folderu (jeśli ustawiony) lub do Pobranych. Plik dostaje nazwę
  // wagaiwzrost_konto_<label>_<YYYY-MM-DD>.wiw.
  async function exportVaultBackupToFile(options) {
    const V = getVault();
    if (!V || !V.isUnlocked()) {
      throw new Error('VildaFileExport: zaloguj się przed eksportem kopii konta.');
    }
    const opts = options || {};
    const envelope = await V.exportVaultBackup();
    const user = V.getCurrentUser();
    const label = (opts.labelOverride && opts.labelOverride.trim()) || (user && user.label) || 'konto';
    const filename = (typeof opts.filename === 'string' && opts.filename) ? opts.filename : buildVaultBackupFilename(label);
    const handle = await getAdapter().getFolderHandle(user.userId);

    if (handle && SUPPORTS_FSA && opts.preferFolder !== false) {
      try {
        const result = await writeEnvelopeViaFsa(handle, filename, envelope);
        notifyExport(Object.assign({ kind: 'vault-backup', userId: user.userId }, result));
        return result;
      } catch (e) {
        logWarn('FSA vault backup failed, fallback to download: ' + (e && e.message ? e.message : e));
      }
    }
    if (opts.allowFallbackDownload === false) {
      throw new Error('VildaFileExport: brak folderu i fallback download wyłączony.');
    }
    const result = downloadEnvelopeViaBlob(filename, envelope);
    notifyExport(Object.assign({ kind: 'vault-backup', userId: user.userId }, result));
    return result;
  }

  // ============ AUTO-BACKUP CAŁEGO KONTA ============
  // Po każdym savePatient sprawdzamy preferences usera. Jeśli auto-backup
  // jest włączony i minęło >= intervalMin minut od poprzedniego, robimy
  // pełen backup vaultu do pliku ze stabilną nazwą (bez daty — nadpisywany).
  // Throttle chroni przed wielokrotnym ciężkim eksportem przy szybkich
  // zapisach kolejnych pacjentów.

  async function getAutoBackupPrefs(userId) {
    const stored = (await getAdapter().getPrefs(userId)) || {};
    return {
      enabled: stored.autoBackupEnabled !== false, // domyślnie true
      intervalMin: (typeof stored.autoBackupIntervalMin === 'number' && stored.autoBackupIntervalMin > 0)
        ? stored.autoBackupIntervalMin
        : AUTO_VAULT_BACKUP_DEFAULT_INTERVAL_MIN,
      lastBackupAtISO: stored.lastVaultBackupAtISO || null,
      lastBackupFilename: stored.lastVaultBackupFilename || null,
      lastBackupMethod: stored.lastVaultBackupMethod || null
    };
  }

  async function saveAutoBackupPrefs(userId, partial) {
    const stored = (await getAdapter().getPrefs(userId)) || {};
    const merged = Object.assign({}, stored, partial);
    await getAdapter().putPrefs(userId, merged);
    return merged;
  }

  async function setAutoBackupEnabled(flag) {
    const V = getVault();
    if (!V || !V.isUnlocked()) throw new Error('VildaFileExport: zaloguj się przed zmianą ustawień auto-backupu.');
    const user = V.getCurrentUser();
    await saveAutoBackupPrefs(user.userId, { autoBackupEnabled: !!flag });
    return getAutoBackupPrefs(user.userId);
  }

  async function setAutoBackupInterval(minutes) {
    const V = getVault();
    if (!V || !V.isUnlocked()) throw new Error('VildaFileExport: zaloguj się przed zmianą ustawień auto-backupu.');
    if (typeof minutes !== 'number' || minutes < 1 || minutes > 120) {
      throw new Error('VildaFileExport: interwał musi być liczbą minut (1–120).');
    }
    const user = V.getCurrentUser();
    await saveAutoBackupPrefs(user.userId, { autoBackupIntervalMin: minutes });
    return getAutoBackupPrefs(user.userId);
  }

  async function getAutoBackupStatus() {
    const V = getVault();
    if (!V || !V.isUnlocked()) return null;
    const user = V.getCurrentUser();
    const p = await getAutoBackupPrefs(user.userId);
    const lastTs = p.lastBackupAtISO ? new Date(p.lastBackupAtISO).getTime() : 0;
    const now = Date.now();
    const intervalMs = p.intervalMin * 60 * 1000;
    const sinceLastMs = lastTs ? (now - lastTs) : null;
    const nextDueMs = lastTs ? Math.max(0, lastTs + intervalMs - now) : 0;
    return {
      enabled: p.enabled,
      intervalMin: p.intervalMin,
      lastBackupAtISO: p.lastBackupAtISO,
      lastBackupFilename: p.lastBackupFilename,
      lastBackupMethod: p.lastBackupMethod,
      sinceLastMs: sinceLastMs,
      nextDueMs: nextDueMs,
      throttled: sinceLastMs != null && sinceLastMs < intervalMs
    };
  }

  async function tryAutoVaultBackup(options) {
    const V = getVault();
    if (!V || !V.isUnlocked()) return { skipped: true, reason: 'locked' };
    const opts = options || {};
    const user = V.getCurrentUser();
    const prefs = await getAutoBackupPrefs(user.userId);
    if (!prefs.enabled && !opts.force) {
      return { skipped: true, reason: 'disabled' };
    }
    const intervalMs = prefs.intervalMin * 60 * 1000;
    const lastTs = prefs.lastBackupAtISO ? new Date(prefs.lastBackupAtISO).getTime() : 0;
    const now = Date.now();
    if (!opts.force && lastTs > 0 && now - lastTs < intervalMs) {
      return { skipped: true, reason: 'throttled', remainingMs: intervalMs - (now - lastTs) };
    }
    const filename = buildVaultBackupFilenameStable(user.label);
    const result = await exportVaultBackupToFile({ filename: filename });
    await saveAutoBackupPrefs(user.userId, {
      lastVaultBackupAtISO: new Date().toISOString(),
      lastVaultBackupFilename: result.filename,
      lastVaultBackupMethod: result.method
    });
    return Object.assign({ skipped: false }, result);
  }

  // ============ AUTO-SUBSKRYBCJA NA savePatient ============
  function bindToVault() {
    if (bound) return;
    const V = getVault();
    if (!V || typeof V.onPatientSaved !== 'function') {
      logWarn('VildaVault niedostępny — pomijam wpięcie auto-eksportu.');
      return;
    }
    V.onPatientSaved(function (info) {
      if (!info || !info.patientId) return;
      // 1) Per-patient auto-export (jak dotychczas, fire-and-forget).
      Promise.resolve()
        .then(function () { return exportPatient(info.patientId); })
        .catch(function (e) { logError('auto-export failed for ' + info.patientId, e); });
      // 2) Auto-backup całego vaultu (też fire-and-forget) — throttle wewnątrz.
      Promise.resolve()
        .then(function () { return tryAutoVaultBackup(); })
        .catch(function (e) { logError('auto-vault-backup failed', e); });
    });
    bound = true;
  }

  // ============ EKSPORT API ============
  const api = {
    __vildaFileExport: true,
    VERSION: VERSION,
    STEP: STEP,
    SUPPORTS_FSA: SUPPORTS_FSA,
    DB_NAME: DB_NAME,
    setStorageAdapter: setStorageAdapter,
    requestFolderHandle: requestFolderHandle,
    setFolderForCurrentUser: setFolderForCurrentUser,
    clearFolderForCurrentUser: clearFolderForCurrentUser,
    getFolderInfoForCurrentUser: getFolderInfoForCurrentUser,
    exportPatient: exportPatient,
    exportVaultBackupToFile: exportVaultBackupToFile,
    buildFilename: buildFilename,
    buildVaultBackupFilename: buildVaultBackupFilename,
    buildVaultBackupFilenameStable: buildVaultBackupFilenameStable,
    onExport: onExport,
    bindToVault: bindToVault,
    tryAutoVaultBackup: tryAutoVaultBackup,
    setAutoBackupEnabled: setAutoBackupEnabled,
    setAutoBackupInterval: setAutoBackupInterval,
    getAutoBackupStatus: getAutoBackupStatus,
    AUTO_VAULT_BACKUP_DEFAULT_INTERVAL_MIN: AUTO_VAULT_BACKUP_DEFAULT_INTERVAL_MIN
  };

  global.VildaFileExport = api;

  // automatyczne wpięcie: po DOMContentLoaded (gdy VildaVault jest już
  // zarejestrowany) lub natychmiast jeśli stronę już załadowano.
  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', function () { bindToVault(); }, { once: true });
    } else {
      try { bindToVault(); } catch (e) { logError('autostart bindToVault', e); }
    }
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
