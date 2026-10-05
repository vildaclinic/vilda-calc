/* Reusable assay selection for this device only. No patient or account data.
 * A configured method is distinct from a method reported for an actual sample.
 * Reference versions must match exactly; changed profiles require reselection.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaLabProfilePreferences = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var KEY = 'labAssayProfiles';
  var ANALYTES = ['lh', 'fsh'];

  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function empty() { return { schemaVersion: 1, profiles: { lh: null, fsh: null } }; }
  function findProfile(data, analyte, id) {
    if (!ANALYTES.includes(analyte) || typeof id !== 'string' || !object(data) || !Array.isArray(data.profiles)) return null;
    var matches = data.profiles.filter(function (profile) {
      return object(profile) && profile.id === id && profile.analyte === analyte;
    });
    if (matches.length !== 1) return null;
    var profile = matches[0];
    return profile.active === true && typeof profile.version === 'string' && profile.version.length > 0 &&
      object(profile.method) && typeof profile.method.id === 'string' && profile.method.id.length > 0 &&
      typeof profile.material === 'string' && profile.material.length > 0 ? profile : null;
  }
  function entry(profile) {
    return { profileId: profile.id, profileVersion: profile.version, methodId: profile.method.id, material: profile.material };
  }
  function normalize(raw, data) {
    var result = empty();
    if (!object(raw) || raw.schemaVersion !== 1 || !object(raw.profiles)) return result;
    ANALYTES.forEach(function (analyte) {
      var candidate = raw.profiles[analyte];
      if (!object(candidate)) return;
      var profile = findProfile(data, analyte, candidate.profileId);
      if (profile && candidate.profileVersion === profile.version && candidate.methodId === profile.method.id &&
          candidate.material === profile.material) result.profiles[analyte] = entry(profile);
    });
    return result;
  }
  function configure(settings, analyte, profileId, data) {
    var result = normalize(settings, data);
    if (!ANALYTES.includes(analyte)) return result;
    var profile = findProfile(data, analyte, profileId);
    result.profiles[analyte] = profile ? entry(profile) : null;
    return result;
  }
  function clear(settings, analyte, data) {
    var result = normalize(settings, data);
    if (ANALYTES.includes(analyte)) result.profiles[analyte] = null;
    return result;
  }
  function resolve(settings, analyte, data) {
    if (!ANALYTES.includes(analyte)) return null;
    var saved = normalize(settings, data).profiles[analyte];
    if (!saved) return null;
    var profile = findProfile(data, analyte, saved.profileId);
    return {
      profile: profile,
      assay: { profileId: saved.profileId, profileVersion: saved.profileVersion, methodId: saved.methodId, confirmation: 'configured' },
      specimen: saved.material
    };
  }
  function registered(persistence) {
    var meta = persistence && persistence.MODULE_KEY_META && persistence.MODULE_KEY_META[KEY];
    return !!(meta && meta.kind === 'preference' && meta.storage === 'local-persistent');
  }
  function read(persistence, data) {
    if (!registered(persistence) || typeof persistence.readPreferenceJSON !== 'function') return empty();
    try { return normalize(persistence.readPreferenceJSON(KEY, null), data); }
    catch (error) { return empty(); }
  }
  function write(persistence, settings, data) {
    if (!registered(persistence) || typeof persistence.writePreferenceJSON !== 'function') return false;
    try { return persistence.writePreferenceJSON(KEY, normalize(settings, data)) === true; }
    catch (error) { return false; }
  }

  return Object.freeze({
    version: '1.0.0', KEY: KEY, normalize: normalize, configure: configure, clear: clear,
    resolve: resolve, read: read, write: write
  });
});
