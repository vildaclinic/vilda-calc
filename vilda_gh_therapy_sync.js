(function(global){
  'use strict';

  const GH_DB_NAME = 'ghTherapyDB';
  const GH_STORE_NAME = 'ghTherapyPoints';

  function logSwallowed(error, context){
    try {
      if (typeof global.vildaLogSwallowedCatch === 'function') {
        global.vildaLogSwallowedCatch('vilda_gh_therapy_sync.js', error, context || {});
      }
    } catch (_) {}
  }

  function openGHTherapyDB(){
    return new Promise((resolve, reject) => {
      try {
        if (typeof indexedDB === 'undefined') {
          return reject(new Error('IndexedDB not available'));
        }
        const req = indexedDB.open(GH_DB_NAME, 1);
        req.onupgradeneeded = function(ev){
          const db = ev.target.result;
          if (!db.objectStoreNames.contains(GH_STORE_NAME)) {
            db.createObjectStore(GH_STORE_NAME, { keyPath: 'id' });
          }
        };
        req.onsuccess = function(ev){
          const db = ev.target.result;
          attachGHTherapyDBVersionChangeHandler(db, 'openGHTherapyDB');
          resolve(db);
        };
        req.onerror = function(ev){ reject(ev.target.error); };
      } catch (err) {
        reject(err);
      }
    });
  }

  function attachGHTherapyDBVersionChangeHandler(db, contextLabel){
    try {
      if (!db) return db;
      db.onversionchange = function(){
        closeGHTherapyDBConnection(db, (contextLabel || 'openGHTherapyDB') + ':onversionchange');
      };
    } catch (error) {
      logSwallowed(error, { step: '8O-11a-c', context: contextLabel || 'gh-therapy-indexeddb-onversionchange' });
    }
    return db;
  }

  function closeGHTherapyDBConnection(db, contextLabel){
    try {
      if (db && typeof db.close === 'function') db.close();
    } catch (error) {
      logSwallowed(error, { step: '8O-11a-c', context: contextLabel || 'gh-therapy-indexeddb-close' });
    }
  }

  function isGhAdvancedImportSuppressed(){
    try {
      return Number(global.__vildaSuppressGhAdvancedImportUntil || 0) > Date.now();
    } catch (_) {
      return false;
    }
  }

  function readGhTherapyPointsFromModuleStorage(){
    try {
      if (global.VildaPersistence && typeof global.VildaPersistence.readModuleJSON === 'function') {
        const value = global.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', []);
        return Array.isArray(value) ? value : [];
      }
    } catch (_) {
      logSwallowed(_, { op: 'readGhTherapyPointsFromModuleStorage' });
    }
    return [];
  }

  function writeGhTherapyPointsToModuleStorage(points){
    try {
      if (global.VildaPersistence && typeof global.VildaPersistence.writeModuleJSON === 'function') {
        return global.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', Array.isArray(points) ? points : [], { force: true });
      }
    } catch (_) {
      logSwallowed(_, { op: 'writeGhTherapyPointsToModuleStorage' });
    }
    return false;
  }

  function clearGhTherapyPointsModuleStorage(){
    try {
      if (global.VildaPersistence && typeof global.VildaPersistence.removeModuleKey === 'function') {
        return global.VildaPersistence.removeModuleKey('GH_THERAPY_POINTS');
      }
    } catch (_) {
      logSwallowed(_, { op: 'clearGhTherapyPointsModuleStorage' });
    }
    return false;
  }

  const ghTherapyBroadcastChannel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('gh-therapy-sync') : null;
  let ghTherapyBroadcastChannelClosed = false;

  function handleGHTherapyBroadcastMessage(){
    try {
      if (typeof global.importTherapyPointsToAdvancedGrowth === 'function') {
        global.importTherapyPointsToAdvancedGrowth();
      }
    } catch (_) {
      logSwallowed(_, { op: 'handleGHTherapyBroadcastMessage' });
    }
  }

  function isGHTherapyBroadcastChannelOpen(){
    return !!(ghTherapyBroadcastChannel && ghTherapyBroadcastChannelClosed !== true);
  }

  function getGHTherapyBroadcastChannel(){
    return isGHTherapyBroadcastChannelOpen() ? ghTherapyBroadcastChannel : null;
  }

  function closeGHTherapyBroadcastChannel(contextLabel){
    if (!ghTherapyBroadcastChannel || ghTherapyBroadcastChannelClosed) return false;
    ghTherapyBroadcastChannelClosed = true;
    try {
      if (typeof ghTherapyBroadcastChannel.removeEventListener === 'function') {
        ghTherapyBroadcastChannel.removeEventListener('message', handleGHTherapyBroadcastMessage);
      }
    } catch (error) {
      logSwallowed(error, { step: '8O-11b', context: (contextLabel || 'gh-therapy-broadcast-channel-close') + ':remove-listener' });
    }
    try {
      if (typeof ghTherapyBroadcastChannel.close === 'function') ghTherapyBroadcastChannel.close();
      return true;
    } catch (error) {
      logSwallowed(error, { step: '8O-11b', context: contextLabel || 'gh-therapy-broadcast-channel-close' });
    }
    return false;
  }

  function registerGHTherapyBroadcastChannelLifecycleCleanup(){
    try {
      if (!ghTherapyBroadcastChannel || typeof global.addEventListener !== 'function') return false;
      const cleanup = function(){ closeGHTherapyBroadcastChannel('gh-therapy-broadcast-channel-page-lifecycle'); };
      global.addEventListener('pagehide', cleanup, { once: true });
      global.addEventListener('beforeunload', cleanup, { once: true });
      return true;
    } catch (error) {
      logSwallowed(error, { step: '8O-11b', context: 'gh-therapy-broadcast-channel-lifecycle-bind' });
    }
    return false;
  }

  if (ghTherapyBroadcastChannel) {
    try {
      ghTherapyBroadcastChannel.addEventListener('message', handleGHTherapyBroadcastMessage);
      registerGHTherapyBroadcastChannelLifecycleCleanup();
    } catch (_) {
      logSwallowed(_, { op: 'ghTherapyBroadcastChannel:init' });
    }
  }

  global.VildaGHTherapySync = {
    openGHTherapyDB,
    attachGHTherapyDBVersionChangeHandler,
    closeGHTherapyDBConnection,
    isGhAdvancedImportSuppressed,
    readGhTherapyPointsFromModuleStorage,
    writeGhTherapyPointsToModuleStorage,
    clearGhTherapyPointsModuleStorage,
    handleGHTherapyBroadcastMessage,
    isGHTherapyBroadcastChannelOpen,
    getGHTherapyBroadcastChannel,
    closeGHTherapyBroadcastChannel,
    registerGHTherapyBroadcastChannelLifecycleCleanup
  };
})(typeof window !== 'undefined' ? window : globalThis);
