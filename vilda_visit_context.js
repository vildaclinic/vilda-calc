/* Working encounter identity. This is deliberately separate from the puberty
 * assessment marker and from a vault snapshot (one visit may have many saves).
 * Persistence uses the existing patient payload/session; no second store. */
(function (root) {
  "use strict";
  let current = null, currentOwner = null, boundVault = null;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function day(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(value + "T12:00:00.000Z");
    const parts = value.split("-").map(Number);
    return Number.isFinite(parsed.getTime()) && parsed.getUTCFullYear() === parts[0]
      && parsed.getUTCMonth() + 1 === parts[1] && parsed.getUTCDate() === parts[2] ? value : null;
  }
  function today() {
    const date = new Date();
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }
  function patient(value) { return typeof value === "string" && value.trim() ? value.trim() : null; }
  function copy(value) { return value ? Object.assign({}, value) : null; }
  function normalize(value) {
    if (!value || value.version !== 1 || !uuidPattern.test(value.visitId || "") || (!day(value.clinicalDateISO) && value.clinicalDateISO !== null)
      || !Number.isFinite(Date.parse(value.createdAtISO)) || !["explicit", "legacy-inferred"].includes(value.origin)) return null;
    const result = { version: 1, visitId: value.visitId, patientId: patient(value.patientId),
      clinicalDateISO: value.clinicalDateISO, createdAtISO: value.createdAtISO, origin: value.origin };
    if (["measuredAt", "savedAt", "timestamp", "unknown"].includes(value.dateSource)) result.dateSource = value.dateSource;
    return result;
  }
  function owner() {
    try { const user = root.VildaVault && root.VildaVault.getCurrentUser(); return user && user.userId || null; }
    catch (_) { return null; }
  }
  function clear() { current = null; currentOwner = owner(); }
  function checkOwner() {
    const vault = root.VildaVault;
    if (vault && boundVault !== vault && typeof vault.onLock === "function") {
      boundVault = vault;
      vault.onLock(clear);
    }
    if (currentOwner !== owner()) clear();
  }
  function uuid() {
    const crypto = root.crypto;
    if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    if (!crypto || typeof crypto.getRandomValues !== "function") throw new Error("Brak bezpiecznego generatora identyfikatorów wizyt.");
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }
  function create(options) {
    const settings = options || {};
    return { version: 1, visitId: uuid(), patientId: patient(settings.patientId),
      clinicalDateISO: day(settings.clinicalDateISO) || today(), createdAtISO: new Date().toISOString(), origin: "explicit" };
  }
  function beginNew(options) { checkOwner(); current = create(options); currentOwner = owner(); return copy(current); }
  function load(payload) {
    checkOwner(); current = normalize(payload && payload.visit); currentOwner = owner(); return copy(current);
  }
  function forImportedFile(payload, patientId) {
    const visit = normalize(payload && payload.visit);
    if (payload && payload.visit != null && !visit) {
      const error = new Error("Nieprawidłowa lub nieobsługiwana identyfikacja wizyty w pliku.");
      error.code = "INVALID_VISIT_IDENTITY";
      throw error;
    }
    // Pure projection. Only the native accepted file-load operation decides the
    // local patient association; a portable file never grants save authority.
    return visit ? Object.assign(visit, { patientId: patient(patientId) }) : null;
  }
  function hasPatientData(payload) {
    const user = payload && payload.user || {};
    return !!(payload && typeof payload.name === "string" && payload.name.trim())
      || ["age", "weight", "height", "dobISO"].some(key => user[key] != null && user[key] !== "");
  }
  // Start owns the selected consultation. DocPro can read that state only as
  // the current shell-attested writer for this same account, patient and visit.
  function homeEncounterState() {
    if (root.__VILDA_HOME_GABINET_PREVIEW__ !== true || !current?.patientId || currentOwner !== owner()) return null;
    try {
      const encounter = root.VildaHomeEncounter || root.parent?.VildaShell?.captureHomeVisitWriter(root)?.encounter;
      const state = encounter?.state(current.patientId);
      return state?.visitId === current.visitId ? state : null;
    } catch (_) { return null; }
  }
  function capture(payload, options) {
    const settings = options || {}, patientId = patient(settings.patientId);
    if (settings.readOnly) {
      if (currentOwner !== owner()) return null;
    } else checkOwner();
    // The caller resolves patient authority using the same guard as Save.
    // A renamed/cleared form cannot borrow a previous patient's encounter.
    const candidate = current && current.patientId === patientId ? current : null;
    // Never derive the day of a selected consultation from the day of one of
    // its measurements. Null-payload calls are also used to attest the writer.
    const bound = candidate && payload && homeEncounterState();
    const clinicalDateISO = bound ? bound.date : day(payload && payload.user && payload.user.measuredAtISO);
    if (settings.readOnly) return candidate ? Object.assign(copy(candidate), bound || clinicalDateISO ? { clinicalDateISO } : {}) : null;
    if (!candidate) {
      current = null;
      if (settings.allowCreate === false || !hasPatientData(payload)) return null;
      current = create({ patientId, clinicalDateISO });
    } else if (bound || clinicalDateISO) current.clinicalDateISO = clinicalDateISO;
    return copy(current);
  }
  function commit(payload, patientId) {
    checkOwner();
    const visit = normalize(payload && payload.visit);
    if (!visit || visit.patientId !== patient(patientId)) return null;
    // The importer has already verified the vault's committed-save witness.
    current = visit; currentOwner = owner(); return copy(current);
  }
  function currentFor(patientId) {
    checkOwner();
    return current && current.origin === "explicit" && patient(patientId)
      && current.patientId === patient(patientId) ? copy(current) : null;
  }
  function forMeasurement(payload, options) {
    const settings = options || {}, visit = normalize(payload && payload.visit);
    // Appending a historical growth row is not a new current encounter.
    if (settings.historical) return visit;
    if (settings.mode !== "edit") {
      const pending = normalize(settings.pending);
      const result = pending && pending.patientId === patient(settings.patientId) ? pending
        : create({ patientId: settings.patientId, clinicalDateISO: payload && payload.user && payload.user.measuredAtISO });
      result.clinicalDateISO = day(payload && payload.user && payload.user.measuredAtISO) || result.clinicalDateISO;
      return result;
    }
    if (visit) {
      visit.clinicalDateISO = day(payload && payload.user && payload.user.measuredAtISO) || visit.clinicalDateISO;
      return visit;
    }
    return null; // The vault supplies legacy inference; never invent a visit while editing.
  }
  root.VildaVisitContext = Object.freeze({ create, beginNew, load, forImportedFile, capture, homeEncounterState, commit, currentFor, clear, forMeasurement });
})(typeof window !== "undefined" ? window : globalThis);
