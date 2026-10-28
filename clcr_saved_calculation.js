/* Persisted, versioned calculation inputs for Klirens. Reading never recalculates. */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (root) root.ClcrSavedCalculation = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const START = "[VILDA_CLCR_CALCULATION_V1]";
  const END = "[/VILDA_CLCR_CALCULATION_V1]";
  const MAX_LENGTH = 65536;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const text = value => typeof value === "string" ? value.trim() : "";
  const copy = value => JSON.parse(JSON.stringify(value));
  const forbidden = new Set(["__proto__", "prototype", "constructor"]);
  const primitive = value => value === null || ["string", "number", "boolean"].includes(typeof value);
  const cleanText = value => Array.from(String(value == null ? "" : value).replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").replace(/[\u200b-\u200d\ufeff]/g, "")).filter(character => character.charCodeAt(0) >= 32 || character === "\n" || character === "\t").join("").trim();
  const number = value => typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(",", ".")) : NaN;

  function safeTree(value, depth = 0) {
    if (depth > 18) return false;
    if (primitive(value)) return typeof value !== "number" || Number.isFinite(value);
    if (Array.isArray(value)) return value.length <= 1000 && value.every(item => safeTree(item, depth + 1));
    return object(value) && Object.keys(value).length <= 300 && Object.entries(value).every(([key, item]) => !forbidden.has(key) && safeTree(item, depth + 1));
  }
  function normalizeFields(fields, values) {
    return (Array.isArray(fields) ? fields : []).filter(field => object(field) && /^[a-zA-Z][\w-]{0,79}$/.test(field.id) && own(values, field.id)).map(field => ({
      id: field.id, label: text(field.label) || field.id,
      type: ["checkbox", "select", "date", "datetime-local", "number", "text", "radio"].includes(field.type) ? field.type : "text",
      required: field.required === true, unitFieldId: text(field.unitFieldId), historicalContext: field.historicalContext === true,
      options: (Array.isArray(field.options) ? field.options : []).map(option => typeof option === "string" ? { value: option, label: option } : { value: String(option.value ?? ""), label: String(option.label ?? option.text ?? option.value ?? "") }),
    }));
  }
  function assessmentCopy(datapoint) {
    const result = {};
    for (const [key, value] of Object.entries(datapoint || {})) {
      if (["capture", "element", "card", "root", "calculationSnapshot"].includes(key) || value === undefined || typeof value === "function") continue;
      if (safeTree(value)) result[key] = copy(value);
    }
    return result;
  }
  function createSnapshot(datapoint, options = {}) {
    const capture = options.capture || datapoint?.capture;
    if (!object(datapoint) || !object(capture) || !object(capture.values)) return null;
    const values = {};
    for (const [key, value] of Object.entries(capture.values)) {
      if (!/^[a-zA-Z][\w-]{0,79}$/.test(key) || forbidden.has(key) || !primitive(value) || typeof value === "string" && value.length > 4000 || typeof value === "number" && !Number.isFinite(value)) return null;
      values[key] = value;
    }
    const formulaId = text(datapoint.sourceFormulaId || capture.formulaId);
    const parameterKey = text(datapoint.id || datapoint.testKey);
    let fields = normalizeFields(capture.fields, values);
    const caDzm = formulaId === "Ca_mgkg" && root.ClcrCaDzmPersistence?.readSnapshot?.(JSON.stringify(datapoint.caDzmSnapshot));
    if (formulaId === "Ca_mgkg" && datapoint.caDzmSnapshot && !caDzm) return null;
    if (caDzm) {
      const input = caDzm.input;
      const fieldMap = { CA_inputMode: "mode", CA_concentration: "concentration", CA_concentrationUnit: "concentrationUnit", CA_volume: "volume", CA_volumeUnit: "volumeUnit", CA_reportedValue: "reportedValue", CA_reportedUnit: "reportedUnit", CA_collectionHours: "hours", CA_clinicalMode: "clinicalContext", weight: "weightKg" };
      // The rendered typed result owns its inputs. In the legacy broad form,
      // dormant dedicated controls may contain values from a prior session.
      for (const [id, key] of Object.entries(fieldMap)) values[id] = input[key] ?? "";
      for (const id of ["age", "ageMonths", "ageDays", "collectionStartAt", "collectionEndAt"]) if (own(input.knownFacts, id)) values[id] = input.knownFacts[id];
      values.sex = input.sex ?? "";
      fields = normalizeFields(root.ClcrCaDzmPersistence.captureFields(values, fields), values);
    }
    const ua = formulaId === "UA_mgkg" && root.ClcrUaPersistence?.readSnapshot?.(JSON.stringify(datapoint.uaSnapshot));
    if (formulaId === "UA_mgkg" && datapoint.uaSnapshot && !ua) return null;
    if (ua) {
      const input = ua.input;
      const fieldMap = { UA_inputMode: "mode", UA_concentration: "concentration", UA_concentrationUnit: "concentrationUnit", UA_volume: "volume", UA_volumeUnit: "volumeUnit", UA_reportedValue: "reportedValue", UA_reportedUnit: "reportedUnit", UA_collectionHours: "hours", weight: "weightKg" };
      // The rendered typed result owns its inputs. In the legacy broad form,
      // dormant dedicated controls may contain values from a prior session.
      for (const [id, key] of Object.entries(fieldMap)) values[id] = input[key] ?? "";
      for (const id of ["age", "ageMonths", "ageDays", "collectionStartAt", "collectionEndAt"]) if (own(input.knownFacts, id)) values[id] = input.knownFacts[id];
      values.sex = input.sex ?? "";
      fields = normalizeFields(root.ClcrUaPersistence.captureFields(values, fields), values);
    }
    if (!formulaId || !parameterKey || !fields.length || fields.length > 150) return null;
    const context = {};
    for (const [key, value] of Object.entries(capture)) if (!["values", "fields"].includes(key) && safeTree(value)) context[key] = copy(value);
    if (ua) context.ageYears = ua.input.ageYears;
    if (caDzm) context.ageYears = caDzm.input.ageYears;
    if (typeof options.clinicalDateISO === "string") context.clinicalDateISO = options.clinicalDateISO.slice(0, 10);
    const snapshot = { schema: "vilda-clcr-calculation", version: 1, formulaId, parameterKey, values, fields, capturedContext: context, assessment: assessmentCopy(datapoint) };
    return JSON.stringify(snapshot).length <= MAX_LENGTH - 3000 ? snapshot : null;
  }
  function binding(payload) {
    const lab = payload?.labResult || {};
    return { patientId: text(payload?.patientId), dateISO: text(payload?.clinicalDateISO).slice(0, 10), test: cleanText(lab.test), value: cleanText(lab.value), valueNum: finite(lab.valueNum) && lab.valueNum >= 0 ? String(lab.valueNum) : "", unit: cleanText(lab.unit), norm: cleanText(lab.norm) };
  }
  function serializeSnapshot(snapshot, payload) {
    if (!validShape(snapshot)) throw new Error("Brak kompletnych danych obliczenia do zapisu.");
    const result = { ...copy(snapshot), binding: binding(payload) };
    const encoded = JSON.stringify(result);
    if (encoded.length > MAX_LENGTH) throw new Error("Dane obliczenia przekraczają dopuszczalny rozmiar zapisu.");
    return START + "\n" + encoded + "\n" + END;
  }
  function hasSaved(note) { return typeof note?.body === "string" && note.body.includes(START); }
  function stripSnapshot(body) {
    const value = typeof body === "string" ? body : "";
    const start = value.indexOf(START), end = value.indexOf(END, start);
    return start < 0 ? value : end < start ? value.slice(0, start).trim() : (value.slice(0, start) + value.slice(end + END.length)).trim();
  }
  function validShape(snapshot) {
    return object(snapshot) && snapshot.schema === "vilda-clcr-calculation" && snapshot.version === 1 && /^[\w-]{1,80}$/.test(snapshot.formulaId || "") && typeof snapshot.parameterKey === "string" && snapshot.parameterKey.length <= 100 && object(snapshot.values) && Array.isArray(snapshot.fields) && snapshot.fields.length > 0 && snapshot.fields.length <= 150 && object(snapshot.assessment) && object(snapshot.capturedContext) && safeTree(snapshot);
  }
  function normBounds(value) {
    const raw = cleanText(value).replace(/,/g, ".");
    const token = "([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?)";
    const inequality = new RegExp("^(<|>|≤|≥|<=|>=)\\s*" + token + "(?:\\s|$)", "i").exec(raw);
    if (inequality) {
      const bound = Number(inequality[2]);
      if (!Number.isFinite(bound)) return null;
      const lower = [">", "≥", ">="].includes(inequality[1]);
      return { low: lower ? bound : null, high: lower ? null : bound, lowInclusive: lower && inequality[1] !== ">", highInclusive: !lower && inequality[1] !== "<" };
    }
    const interval = new RegExp("^" + token + "\\s*[–−-]\\s*" + token + "(?:\\s|$)", "i").exec(raw);
    return interval && Number(interval[1]) <= Number(interval[2]) ? { low: Number(interval[1]), high: Number(interval[2]), lowInclusive: true, highInclusive: true } : null;
  }
  function canonical(snapshot) {
    const dp = snapshot.assessment;
    const typed = dp.acrSnapshot || dp.pcrSnapshot || dp.cacrSnapshot || dp.oxcrSnapshot || dp.citcrSnapshot || dp.fenaSnapshot || dp.fekSnapshot || dp.feclSnapshot || dp.fehco3Snapshot || dp.uagSnapshot || dp.tmpGfrSnapshot || dp.phSnapshot || dp.uaSnapshot || dp.caDzmSnapshot;
    const model = dp.model || dp.resultModel;
    const category = dp.category?.code || dp.category || typed?.category || null;
    const toneValue = dp.tone || typed?.tone || model?.tone || "neutral";
    const tone = toneValue === "normal" ? "success" : ["success", "warning", "danger"].includes(toneValue) ? toneValue : "neutral";
    const storedStatus = ({ low: "below", high: "above", boundary: "above", "criterion-met": "above" })[typed?.status] || typed?.status;
    const status = ["within", "above", "below", "unassessed"].includes(dp.assessment) ? dp.assessment : storedStatus && ["within", "above", "below", "unassessed"].includes(storedStatus) ? storedStatus : model?.reference?.snapshot?.status || "unassessed";
    const raw = finite(dp.rawValue) ? dp.rawValue : finite(dp.valueNum) ? dp.valueNum : typed?.rawValue;
    const comparator = dp.comparator || typed?.comparator || "";
    const norm = text(dp.norm);
    const range = dp.measuredClearanceReference?.absoluteRange || model?.reference?.snapshot?.absoluteRange;
    const typedReference = typed?.reference;
    let exactBounds = dp.reference?.bounds || null;
    if (range && finite(range.lower) && finite(range.upper)) exactBounds = { low: range.lower, high: range.upper, lowInclusive: true, highInclusive: true };
    else if (typedReference && finite(typedReference.normalUpperExclusive ?? typedReference.lowerThreshold)) exactBounds = { low: null, high: typedReference.normalUpperExclusive ?? typedReference.lowerThreshold, lowInclusive: false, highInclusive: false };
    else if (typedReference && (finite(typedReference.lower) || finite(typedReference.upper))) exactBounds = { low: finite(typedReference.lower) ? typedReference.lower : null, high: finite(typedReference.upper) ? typedReference.upper : null, lowInclusive: typedReference.lowerInclusive === true, highInclusive: typedReference.upperInclusive === true };
    const sourceIds = typed?.reference?.sourceIds || [];
    const selectedSources = sourceIds.map(id => typed?.sources?.find(item => item.id === id)).filter(Boolean);
    const availableSources = selectedSources.length ? selectedSources : typed?.sources || [];
    const source = (["UA_mgkg", "Ca_mgkg"].includes(snapshot.formulaId) ? null : dp.source || dp.reference?.source || typed?.source || model?.reference?.source) || (availableSources.length === 1 ? availableSources[0] : availableSources.length ? { ids: availableSources.map(item => item.id), label: availableSources.map(item => item.label).filter(Boolean).join(" · "), sources: availableSources } : null);
    const version = dp.referenceProfileVersion ?? typed?.profileVersion ?? typed?.policy?.version ?? null;
    const profileVersion = version !== null && /^\d+$/.test(String(version)) ? Number(version) : version;
    const reference = norm ? { text: norm, bounds: exactBounds || root.ClcrSavedResults?.referenceBounds?.(norm, text(dp.unit)) || null, kind: typedReference?.kind === "criterion" ? "recorded-criterion" : "recorded", source, population: dp.reference?.population || typed?.population || model?.reference?.population || null, profileId: dp.referenceProfileId || typed?.profileId || typed?.policy?.id || null, profileVersion } : null;
    const outOfRange = ["pH_spot", "UA_mgkg", "Ca_mgkg"].includes(snapshot.formulaId) && status === "unassessed" ? null : typeof dp.outOfRange === "boolean" ? dp.outOfRange : typeof typed?.outOfRange === "boolean" ? typed.outOfRange : status === "within" ? false : ["above", "below"].includes(status) ? true : null;
    const basis = typeof dp.basis === "string" ? dp.basis : typeof typed?.basis === "string" ? typed.basis : typed?.reportingEntity || "";
    const interpretation = text(dp.interpretation || typed?.interpretation || typed?.categoryDescription || model?.interpretation);
    const comment = [...new Set([typed?.qualification?.note, typed?.interpretation, ...(typed?.cautions || []), ...(model?.reasons || []), ...(dp.warnings || [])].filter(value => typeof value === "string" && value && value !== interpretation))].join(" ");
    let displayValue = String(dp.displayValue ?? raw ?? "");
    // Older UAG captures kept a signed nonzero raw result alongside a rounded
    // zero. Restore that recorded quantity only; never recalculate old inputs
    // or attach today's interpretation to a historical measurement.
    if (snapshot.formulaId === "AGu_spot" && finite(raw) && raw !== 0 && /^[+-]?0+(?:[.,]0+)?$/.test(displayValue.trim().replace(/−/g, "-"))) displayValue = String(raw).replace(".", ",");
    // Earlier pH captures had no reference and recorded false merely because
    // the result lacked an error CSS class. Keep that history unassessed; use
    // the already recorded raw value without evaluating today's reference.
    if (snapshot.formulaId === "pH_spot" && finite(raw) && !dp.phSnapshot) displayValue = String(raw).replace(".", ",");
    const result = { formulaId: snapshot.formulaId, parameterKey: snapshot.parameterKey, rawValue: raw, valueNum: comparator ? null : raw, displayValue, unit: text(dp.unit), comparator, category, assessment: status, status, tone, outOfRange, norm, reference, source, context: copy(snapshot.capturedContext), inputs: copy(snapshot.values), method: text(dp.label), calculationMethod: text(dp.calculationMethod || typed?.method), basis, boundary: text(dp.boundary || typed?.boundary), interpretation, comment, assumptions: text(dp.assumptions || snapshot.capturedContext.calculationAssumptions?.assumptionsText), knownFacts: typed?.knownFacts || typed?.input?.knownFacts || null, contextReferences: typed?.references || [] };
    if (snapshot.formulaId === "Ca_mgkg" && dp.caDzmSnapshot) Object.assign(result.context, { clinicalContext: dp.caDzmSnapshot.input.clinicalContext, ageYears: dp.caDzmSnapshot.input.ageYears, sex: dp.caDzmSnapshot.input.sex, weightKg: dp.caDzmSnapshot.input.weightKg, hours: dp.caDzmSnapshot.input.hours });
    if (snapshot.formulaId === "pH_spot" && !dp.phSnapshot) Object.assign(result, { assessment: "unassessed", status: "unassessed", category: null, tone: "neutral", outOfRange: null, norm: "", reference: null, source: null });
    if (snapshot.formulaId === "UA_mgkg" && !dp.uaSnapshot) Object.assign(result, { assessment: "unassessed", status: "unassessed", category: null, tone: "neutral", outOfRange: null, norm: "", reference: null, source: null, interpretation: "Brak zapisanej oceny" });
    if (snapshot.formulaId === "Ca_mgkg" && !dp.caDzmSnapshot) Object.assign(result, { assessment: "unassessed", status: "unassessed", category: null, tone: "neutral", outOfRange: null, norm: "", reference: null, source: null, interpretation: "Brak zapisanej oceny" });
    return result;
  }
  function readSaved(note) {
    if (!hasSaved(note)) return null;
    const invalid = reason => ({ valid: false, invalidated: true, reason });
    const body = note.body;
    const start = body.indexOf(START), end = body.indexOf(END, start + START.length);
    if (end < 0 || body.indexOf(START, start + START.length) >= 0 || end - start > MAX_LENGTH + START.length + 10) return invalid("Nie można odczytać danych tego obliczenia.");
    let snapshot;
    try { snapshot = JSON.parse(body.slice(start + START.length, end).trim()); } catch (_) { return invalid("Nie można odczytać danych tego obliczenia."); }
    if (!validShape(snapshot) || !object(snapshot.binding)) return invalid("Zapis danych obliczenia ma nieobsługiwaną wersję lub strukturę.");
    const current = binding(note);
    // A legitimate merge of duplicate patient cards moves the canonical note.
    // Patient ownership is checked against the current note during mutations;
    // the original patient ID in this frozen envelope remains provenance.
    if (Object.keys(current).some(key => key !== "patientId" && cleanText(snapshot.binding[key]) !== current[key]) || note.category !== "wynik-klirens") return invalid("Dane obliczenia nie odpowiadają aktualnej wartości lub dacie tego pomiaru.");
    if (snapshot.formulaId === "TMP_GFR" && snapshot.assessment.tmpGfrSnapshot) {
      const persistence = root.ClcrTmpGfrPersistence;
      if (!persistence?.savedAssessment?.(note)) return invalid("Dane TmP/GFR nie odpowiadają utrwalonej ocenie tego pomiaru.");
    }
    if (snapshot.formulaId === "pH_spot" && snapshot.assessment.phSnapshot) {
      const recorded = root.ClcrPhPersistence?.savedAssessment?.(note);
      if (!recorded || !root.ClcrPhPersistence.readSnapshot(JSON.stringify(snapshot.assessment.phSnapshot))) return invalid("Dane pH nie odpowiadają utrwalonej ocenie tego pomiaru.");
      const frozen = { ...recorded };
      for (const key of ["displayValue", "comparator", "norm"]) delete frozen[key];
      if (JSON.stringify(frozen) !== JSON.stringify(snapshot.assessment.phSnapshot)) return invalid("Dane pH nie odpowiadają utrwalonej ocenie tego pomiaru.");
    }
    if (snapshot.formulaId === "Ca_mgkg" && snapshot.assessment.caDzmSnapshot) {
      const recorded = root.ClcrCaDzmPersistence?.savedAssessment?.(note);
      if (!recorded || !root.ClcrCaDzmPersistence.readSnapshot(JSON.stringify(snapshot.assessment.caDzmSnapshot))) return invalid("Dane wapnia nie odpowiadają utrwalonej ocenie tego pomiaru.");
      const frozen = { ...recorded };
      for (const key of ["displayValue", "comparator", "norm"]) delete frozen[key];
      if (JSON.stringify(frozen) !== JSON.stringify(snapshot.assessment.caDzmSnapshot)) return invalid("Dane wapnia nie odpowiadają utrwalonej ocenie tego pomiaru.");
      const recordedStatus = ({ low: "below", high: "above", boundary: "above", "criterion-met": "above", within: "within" })[recorded.status] || "unassessed";
      const recordedTone = recorded.tone === "normal" ? "success" : recorded.tone;
      if (snapshot.assessment.valueNum !== recorded.rawValue || snapshot.assessment.rawValue !== recorded.rawValue || snapshot.assessment.unit !== recorded.unit || snapshot.assessment.displayValue !== recorded.displayValue || snapshot.assessment.norm !== recorded.norm || snapshot.assessment.outOfRange !== recorded.outOfRange || snapshot.assessment.assessment !== recordedStatus || snapshot.assessment.tone !== recordedTone || snapshot.assessment.interpretation !== recorded.interpretation) return invalid("Wartość wapnia nie odpowiada utrwalonemu wynikowi.");
    }
    if (snapshot.formulaId === "UA_mgkg" && snapshot.assessment.uaSnapshot) {
      const recorded = root.ClcrUaPersistence?.savedAssessment?.(note);
      if (!recorded || !root.ClcrUaPersistence.readSnapshot(JSON.stringify(snapshot.assessment.uaSnapshot))) return invalid("Dane kwasu moczowego nie odpowiadają utrwalonej ocenie tego pomiaru.");
      const frozen = { ...recorded };
      for (const key of ["displayValue", "comparator", "norm"]) delete frozen[key];
      if (JSON.stringify(frozen) !== JSON.stringify(snapshot.assessment.uaSnapshot)) return invalid("Dane kwasu moczowego nie odpowiadają utrwalonej ocenie tego pomiaru.");
      const recordedStatus = ({ low: "below", high: "above", boundary: "above", within: "within" })[recorded.status] || "unassessed";
      const recordedTone = recorded.tone === "normal" ? "success" : recorded.tone;
      if (snapshot.assessment.valueNum !== recorded.rawValue || snapshot.assessment.rawValue !== recorded.rawValue || snapshot.assessment.unit !== recorded.unit || snapshot.assessment.displayValue !== recorded.displayValue || snapshot.assessment.norm !== recorded.norm || snapshot.assessment.outOfRange !== recorded.outOfRange || snapshot.assessment.assessment !== recordedStatus || snapshot.assessment.tone !== recordedTone || snapshot.assessment.interpretation !== recorded.interpretation) return invalid("Wartość kwasu moczowego nie odpowiada utrwalonemu wynikowi.");
    }
    const result = canonical(snapshot);
    if (!finite(result.rawValue) || !result.unit || !result.method) return invalid("Brak kompletnej wartości obliczenia.");
    return { valid: true, snapshot, ...result };
  }
  function describe(note) {
    const saved = note?.snapshot?.schema === "vilda-clcr-calculation" ? note : readSaved(note?.note || note);
    if (!saved?.valid || !saved.snapshot) return { editable: false, reason: saved?.reason || "Ten starszy zapis nie zawiera danych wejściowych potrzebnych do ponownego obliczenia." };
    const snapshot = saved.snapshot;
    if (snapshot.formulaId === "Ca_mgkg" && root.ClcrCaDzmPersistence) {
      const migrated = copy(snapshot);
      migrated.values = root.ClcrCaDzmPersistence.prepareValues(snapshot.values, snapshot.capturedContext, snapshot.assessment.caDzmSnapshot);
      const fields = root.ClcrCaDzmPersistence.editableFields(migrated.values);
      // Protocol facts remain in values for provenance, without becoming a
      // mandatory questionnaire when correcting a saved measurement.
      migrated.fields = root.ClcrCaDzmPersistence.captureFields(migrated.values, snapshot.fields);
      return { editable: true, reason: "", snapshot: migrated, fields: copy(fields), values: copy(migrated.values), context: copy(snapshot.capturedContext) };
    }
    if (snapshot.formulaId === "UA_mgkg" && root.ClcrUaPersistence) {
      const migrated = copy(snapshot);
      migrated.values = root.ClcrUaPersistence.prepareValues(snapshot.values, snapshot.capturedContext, snapshot.assessment.uaSnapshot);
      const fields = root.ClcrUaPersistence.editableFields(migrated.values);
      // Protocol facts remain in values for provenance, without becoming a
      // mandatory questionnaire when correcting a saved measurement.
      migrated.fields = root.ClcrUaPersistence.captureFields(migrated.values, snapshot.fields);
      return { editable: true, reason: "", snapshot: migrated, fields: copy(fields), values: copy(migrated.values), context: copy(snapshot.capturedContext) };
    }
    const missing = snapshot.fields.some(field => field.required && (!own(snapshot.values, field.id) || snapshot.values[field.id] === "" || snapshot.values[field.id] === null));
    const fields = snapshot.formulaId === "pH_spot" ? snapshot.fields.filter(field => field.id === "U_pH") : snapshot.fields;
    return { editable: !missing, reason: missing ? "W zapisie brakuje wymaganych danych wejściowych." : "", snapshot: copy(snapshot), fields: copy(fields), values: copy(snapshot.values), context: copy(snapshot.capturedContext) };
  }
  function dataDocument(values) {
    const context = { ClcrClinicalSafety: root.ClcrClinicalSafety, __vildaClcrVersionValueVault: { ...values } };
    return { defaultView: context, getElementById(id) { return own(values, id) ? { value: typeof values[id] === "boolean" ? "" : String(values[id] ?? ""), checked: values[id] === true, getAttribute() { return null; } } : null; } };
  }
  function ageOf(values) {
    if (root.ClcrClinicalSafety?.readAgeFromDocument) {
      const age = root.ClcrClinicalSafety.readAgeFromDocument(dataDocument(values));
      return age.valid ? age.exactYears : null;
    }
    const years = number(values.age), months = own(values, "ageMonths") && values.ageMonths !== "" ? number(values.ageMonths) : 0;
    return Number.isFinite(years) && years >= 0 && Number.isFinite(months) && months >= 0 && months <= 11 ? years + months / 12 : null;
  }
  function pinnedProfile(data, previous, fallback) {
    const id = previous?.profileId || previous?.policy?.id || fallback;
    const result = data?.getProfile?.(id) || data?.getPolicy?.(id) || (data?.DEFAULT_POLICY?.id === id ? data.DEFAULT_POLICY : null);
    const version = previous?.profileVersion ?? previous?.policy?.version;
    if (!result || version != null && result.version !== version) throw new Error("Zapisany profil obliczenia nie jest dostępny w tej wersji aplikacji.");
    return result;
  }
  function baseDatapoint(snapshot) {
    const old = snapshot.assessment;
    return { id: old.id || snapshot.parameterKey, sourceFormulaId: snapshot.formulaId, testKey: old.testKey, label: old.label, unit: old.unit, valueNum: null, rawValue: null, displayValue: "", category: null, tone: "neutral", assessment: "unassessed", norm: "", outOfRange: null, assumptions: old.assumptions || "", comparator: "", boundary: "", basis: old.basis || "" };
  }
  function preserveRecordedContext(input, prior, edited) {
    const fieldNames = { diureticUse: "spotDiureticUse", knownCKD: "spotKnownCKD", knownAKI: "suspectedAKI", bicarbonateLoad: "spotBicarbonateLoad", nagmaContext: "spotNagmaContext", potassiumSupplementation: "spotPotassiumSupplementation", menstruation: "spotMenstruation", hematuria: "spotHematuria", infection: "spotInfection", exercise: "spotExercise", acuteIllness: "spotAcuteIllness" };
    const facts = prior?.knownFacts || prior?.input?.knownFacts || {};
    const preserved = {};
    for (const [key, value] of Object.entries(facts)) {
      if (typeof value !== "boolean" && value !== null) continue;
      const field = fieldNames[key];
      if (field && (edited.has(field) || edited.has(`ui_${field}_answer`))) continue;
      if (key === "rapidlyChangingCreatinine" && edited.has("creatinineState")) continue;
      preserved[key] = value;
    }
    if (object(input.knownFacts)) input.knownFacts = { ...input.knownFacts, ...preserved };
    else Object.assign(input, preserved);
    const oldConfounders = prior?.context?.confounders || prior?.confounders;
    if (Array.isArray(input.confounders) && Array.isArray(oldConfounders)) {
      const next = new Set(input.confounders);
      for (const key of ["menstruation", "hematuria", "infection", "exercise", "acuteIllness"]) {
        const field = fieldNames[key];
        if (edited.has(field) || edited.has(`ui_${field}_answer`)) continue;
        if (oldConfounders.includes(key)) next.add(key); else next.delete(key);
      }
      input.confounders = [...next];
    }
    for (const [property, field, previous] of [["sameSpecimen", "spotSameSpecimen", prior?.context?.sameSpecimen], ["sameUrineSpecimen", "spotSameSpecimen", prior?.sample?.sameUrineSpecimen], ["pairedSameTime", "spotPairedChemistry", prior?.sample?.pairedSameTime]]) {
      if (["confirmed", "assumed", "different"].includes(previous) && own(input, property) && !edited.has(field) && !edited.has(`ui_${field}_answer`) && !edited.has("FENa_sample_status")) input[property] = previous;
    }
    return input;
  }
  function ratioCalculation(snapshot, values, edited) {
    const configs = {
      ACR: ["Acr", "acr", "KDIGO_ACR_2024"], PCR: ["Pcr", "pcr", "KDIGO_PCR_2024_2025"], CaCr_spot: ["Cacr", "cacr", "MAYO_CACR3_RANDOM_2026_10"],
      OxCr_spot: ["Oxcr", "oxcr"], CitCr_spot: ["Citcr", "citcr"], FENa_spot: ["Fena", "fena"], FEK_spot: ["Fek", "fek"], FECl_spot: ["Fecl", "fecl"], FEHCO3_spot: ["Fehco3", "fehco3"], AGu_spot: ["Uag", "uag"], TMP_GFR: ["TmpGfr", "tmpGfr"], pH_spot: ["Ph", "ph"],
    };
    const config = configs[snapshot.formulaId];
    if (!config) return null;
    const [name, key, fallback] = config;
    const engine = root["VildaClcr" + name], data = root["VildaClcr" + name + "ReferenceData"];
    if (!engine?.evaluate) throw new Error("Brak modułu obliczenia. Odśwież aplikację.");
    const prior = snapshot.assessment[key + "Snapshot"];
    const policy = pinnedProfile(data, prior, fallback || data?.DEFAULT_POLICY?.id);
    const doc = dataDocument(values);
    let input = ["AGu_spot", "TMP_GFR", "pH_spot"].includes(snapshot.formulaId) && engine.inputFromValues ? engine.inputFromValues(values, snapshot.capturedContext) : engine.readInputFromDocument ? engine.readInputFromDocument(doc) : {
      mode: values.ACR_entry_mode || "concentration", albuminValue: values.U_Alb ?? "", albuminUnit: values.U_Alb_unit || "mg/L", creatinineValue: values.Ucr_spot ?? "", creatinineUnit: values.Ucr_spot_unit || "mg/dl", reportedValue: values.ACR_reported ?? "", reportedUnit: values.ACR_reported_unit || "mg/g", ageYears: ageOf(values), sameSpecimen: values.ACR_same_specimen === "different" || values.ui_spotSameSpecimen_answer === "no" ? "different" : values.ACR_same_specimen === "confirmed" || values.ui_spotSameSpecimen_answer === "yes" || values.spotSameSpecimen === true ? "confirmed" : "assumed", sampleType: values.spotSampleKind || "", confounders: ["Menstruation", "Hematuria", "Infection", "Exercise", "AcuteIllness"].filter(field => values["spot" + field] === true).map(field => field[0].toLowerCase() + field.slice(1)),
    };
    if (snapshot.formulaId === "CitCr_spot" && prior?.input?.population) input = { ...input, population: copy(prior.input.population) };
    const parsedUagSample = snapshot.formulaId === "AGu_spot" ? input.sameUrineSpecimen : null;
    const tmpSample = snapshot.formulaId === "TMP_GFR" ? { sameUrineSpecimen: input.sameUrineSpecimen, pairedSameTime: input.pairedSameTime } : null;
    input = preserveRecordedContext(input, prior, edited);
    if (snapshot.formulaId === "pH_spot" && object(prior?.input?.knownFacts)) {
      for (const [field, value] of Object.entries(prior.input.knownFacts)) {
        if (!edited.has(field) && !edited.has(`ui_${field}_answer`) && primitive(value)) input.knownFacts[field] = value;
      }
    }
    if (snapshot.formulaId === "pH_spot" && prior?.input && own(prior.input, "newbornContext") && !edited.has("newbornContext") && !edited.has("phNewbornContext")) input.newbornContext = prior.input.newbornContext;
    if (snapshot.formulaId === "AGu_spot" && ["spotSameSpecimen", "ui_spotSameSpecimen_answer", "spotPairedChemistry", "ui_spotPairedChemistry_answer", "FENa_sample_status"].some(field => edited.has(field))) input.sameUrineSpecimen = parsedUagSample;
    if (snapshot.formulaId === "AGu_spot" && prior?.sample?.evidence && !["spotSameSpecimen", "ui_spotSameSpecimen_answer", "spotPairedChemistry", "ui_spotPairedChemistry_answer", "FENa_sample_status"].some(field => edited.has(field))) {
      input.sampleEvidence = copy(prior.sample.evidence);
    }
    if (tmpSample) {
      const sampleFields = ["spotSameSpecimen", "ui_spotSameSpecimen_answer", "spotPairedChemistry", "ui_spotPairedChemistry_answer", "tmpPairedSameTime", "FENa_sample_status"];
      if (sampleFields.some(field => edited.has(field))) Object.assign(input, tmpSample);
      else if (prior?.sample?.evidence) input.sampleEvidence = copy(prior.sample.evidence);
    }
    // Editing a recorded number cannot silently reuse a trend that depended
    // on the old value/date. A new comparison needs the patient's history.
    const result = engine.evaluate(input, policy);
    if (!result.valid) throw new Error(result.message || result.error || "Sprawdź dane potrzebne do obliczenia.");
    const typed = result.snapshot || result;
    const dp = baseDatapoint(snapshot);
    Object.assign(dp, { valueNum: result.rawValue, rawValue: result.rawValue, unit: result.unit, comparator: result.comparator || "", displayValue: String(result.display?.text || result.display?.value || result.rawValue), category: result.category || null, assessment: result.status || "unassessed", tone: result.tone === "normal" ? "success" : result.tone || "neutral", boundary: result.boundary || result.display?.boundary || "", interpretation: result.interpretation || result.categoryDescription || result.qualification?.note || "", [key + "Snapshot"]: copy(typed), norm: result.referenceAvailable && result.reference ? `${result.reference.limit || result.reference.range || result.reference.text || ""} ${result.unit}`.trim() : "", outOfRange: result.status === "unassessed" ? null : result.outOfRange ?? ["above", "below", "A2", "A3"].includes(result.status) });
    if (snapshot.formulaId === "ACR") dp.outOfRange = result.category ? result.category !== "A1" : null;
    const persistence = root["Clcr" + name + "Persistence"];
    if (persistence?.augmentDatapoint) persistence.augmentDatapoint({ getAttribute: () => JSON.stringify(typed) }, dp);
    return dp;
  }
  function caDzmCalculation(snapshot, values, edited, context) {
    if (snapshot.formulaId !== "Ca_mgkg") return null;
    const engine = root.VildaClcrCaDzm, persistence = root.ClcrCaDzmPersistence;
    if (!engine?.evaluate || !persistence || !root.ClcrCaDzmReferenceData?.DEFAULT_POLICY) throw new Error("Brak modułu obliczenia. Odśwież aplikację.");
    const prior = snapshot.assessment.caDzmSnapshot;
    const priorAge = prior?.input?.ageYears;
    const input = engine.inputFromValues(values, { ...context, ageYears: context.ageYears ?? priorAge ?? null });
    if (object(prior?.input?.knownFacts)) {
      input.knownFacts ||= {};
      for (const [field, value] of Object.entries(prior.input.knownFacts)) {
        if (!edited.has(field) && !edited.has(`ui_${field}_answer`) && primitive(value)) input.knownFacts[field] = value;
      }
    }
    const result = engine.evaluate(input, root.ClcrCaDzmReferenceData.DEFAULT_POLICY);
    if (!result.valid) throw new Error(result.error || "Sprawdź dane potrzebne do obliczenia wydalania wapnia.");
    const dp = { ...baseDatapoint(snapshot), label: "Wydalanie wapnia (DZM)", caDzmSnapshot: copy(result) };
    persistence.augmentDatapoint({ getAttribute: () => JSON.stringify(result) }, dp);
    return dp;
  }
  function uaCalculation(snapshot, values, edited, context) {
    if (snapshot.formulaId !== "UA_mgkg") return null;
    const engine = root.VildaClcrUa, persistence = root.ClcrUaPersistence;
    if (!engine?.evaluate || !persistence || !root.ClcrUaReferenceData?.DEFAULT_POLICY) throw new Error("Brak modułu obliczenia. Odśwież aplikację.");
    const prior = snapshot.assessment.uaSnapshot;
    const priorAge = prior?.input?.ageYears;
    const input = engine.inputFromValues(values, { ...context, ageYears: context.ageYears ?? priorAge ?? null });
    if (object(prior?.input?.knownFacts)) {
      input.knownFacts ||= {};
      for (const [field, value] of Object.entries(prior.input.knownFacts)) {
        if (!edited.has(field) && !edited.has(`ui_${field}_answer`) && primitive(value)) input.knownFacts[field] = value;
      }
    }
    const result = engine.evaluate(input, root.ClcrUaReferenceData.DEFAULT_POLICY);
    if (!result.valid) throw new Error(result.error || "Sprawdź dane potrzebne do obliczenia wydalania kwasu moczowego.");
    const dp = { ...baseDatapoint(snapshot), label: "Wydalanie kwasu moczowego (DZM)", uaSnapshot: copy(result) };
    persistence.augmentDatapoint({ getAttribute: () => JSON.stringify(result) }, dp);
    return dp;
  }
  function gfrCalculation(snapshot, values) {
    const id = snapshot.formulaId;
    if (!["egfr", "ckid_u25", "egfr_cr_cys", "ckid_u25_cys", "ckid_u25_cr_cys", "neonatal_egfr", "cg", "cg_norm", "cl24", "sch_idms"].includes(id)) return null;
    if (id === "cl24") return root.ClcrSavedLegacyCalculator?.recalculate(id, values, snapshot.parameterKey, snapshot.capturedContext) || null;
    const clinical = root.ClcrClinicalSafety, extended = root.ClcrExtendedEgfr;
    if (!clinical || !root.ClcrResultPresentation || !root.ClcrResultReferenceData) throw new Error("Brak modułu obliczenia. Odśwież aplikację.");
    const ageContext = clinical.readAgeFromDocument(dataDocument({ ...values, formulaPicker: id }));
    const ageYears = ageContext.valid ? ageContext.exactYears : null, sex = values.sex, height = number(values.height), weight = number(values.weight);
    if (id !== "ckid_u25_cys" && !["mg/dl", "umol"].includes(values.ScrUnit)) throw new Error("Wybierz prawidłową jednostkę kreatyniny zapisaną przy tym badaniu.");
    const scr = number(values.Scr), scrMgDl = values.ScrUnit === "umol" ? scr / 88.4 : scr;
    const sourceContext = { ...snapshot.capturedContext.sourceContext };
    for (const [field, key] of Object.entries({ creatinineState: "creatinineState", suspectedAKI: "suspectedAKI", ScrAssay: "scrAssay", CystatinCStandardization: "cystatinCStandardization", CystatinCAssayMethod: "cystatinCAssayMethod", CrCysStandardizationConfirmed: "crCysStandardizationConfirmed" })) if (own(values, field)) sourceContext[key] = values[field];
    const resolution = root.VildaClcrCalculationAssumptions?.resolve(id, sourceContext);
    if (resolution && !resolution.allowed) throw new Error(resolution.blockingReasons?.join(" ") || "Kontekst badania nie pozwala obliczyć wyniku.");
    const calculation = resolution?.calculationContext || {};
    const assay = calculation.presentationAssay || values.ScrAssay || "idms";
    const markerPolicy = calculation.markerPolicy || clinical.creatininePolicy(values.creatinineState || "stable", values.suspectedAKI === true);
    let raw = null, external = null;
    const common = { sex, ageYears, heightCm: height, creatinineMgDl: scrMgDl, heightValue: height, heightUnit: "cm", creatinineValue: scr, creatinineUnit: values.ScrUnit === "umol" ? "umol/L" : "mg/dL", cystatinCValue: number(values.CystatinC), cystatinCUnit: "mg/L", creatinineStandardization: calculation.creatinineStandardization || "IDMS", cystatinCStandardization: calculation.cystatinCStandardization || values.CystatinCStandardization, markerPolicy, scrAssay: values.ScrAssay };
    if (id === "egfr") raw = clinical.computeCkdEpi2021Cr(common);
    if (id === "ckid_u25") raw = clinical.computeCkidU25Creatinine(common);
    if (id === "sch_idms") raw = ageYears >= 1 && ageYears < 17 ? clinical.computeBedsideSchwartz(common) : null;
    if (id === "neonatal_egfr") {
      const eligible = clinical.formulaSafety(id, ageContext, markerPolicy, { termStatus: values.neonatalTermStatus, bodyWeightKg: weight, scrAssay: calculation.presentationAssay, creatinineStandardization: calculation.creatinineStandardization });
      raw = eligible.eligible ? clinical.computeNeonatalEgfr({ termBorn: true, daysOfLife: number(values.ageDays), heightCm: height, creatinineMgDl: scrMgDl, bodyWeightKg: weight }) : null;
    }
    if (["egfr_cr_cys", "ckid_u25_cys", "ckid_u25_cr_cys"].includes(id)) {
      const fn = id === "egfr_cr_cys" ? "computeCkdEpi2021CrCys" : id === "ckid_u25_cys" ? "computeCkidU25Cys" : "computeCkidU25CrCys";
      external = extended?.[fn]?.(common); raw = external?.ok ? external.value : null;
    }
    if (["cg", "cg_norm"].includes(id)) return root.ClcrSavedLegacyCalculator?.recalculate(id, values, snapshot.parameterKey, snapshot.capturedContext) || null;
    if (!finite(raw) || raw < 0) throw new Error(external?.error || "Dane nie spełniają warunków tego wzoru. Sprawdź wiek, wzrost i oznaczenia.");
    const profile = root.ClcrResultReferenceData.PROFILE;
    const oldProfile = snapshot.assessment.referenceProfileId || snapshot.capturedContext.referenceProfile?.id;
    if (oldProfile && oldProfile !== profile.id) throw new Error("Zapisany profil odniesienia nie jest dostępny w tej wersji aplikacji.");
    const formatted = clinical.formatGfrForDisplay(raw);
    let presentation = clinical.egfrPresentation({ value: raw, age: ageYears, assay, markerPolicy });
    if (id === "neonatal_egfr") presentation = { valueVisible: true, category: null, tone: "neutral", label: profile.neonatal?.resultLabel || "eGFR noworodka", reasons: [] };
    if (["egfr_cr_cys", "ckid_u25_cys", "ckid_u25_cr_cys"].includes(id)) {
      const eligible = resolution?.allowed !== false && markerPolicy.categoryAllowed;
      const category = eligible && ageYears !== null && ageYears >= profile.gfr.minimumCategoryAgeYears ? clinical.kdigoGCategory(raw) : null;
      const row = profile.gfr.rows.find(entry => entry.code === category?.code);
      presentation = { valueVisible: resolution?.allowed !== false && markerPolicy.calculationAllowed, category, tone: row?.tone || "neutral", label: category ? profile.gfr.resultLabels?.[category.code] || row.meaning : "Ocena zależna od wieku", reasons: [] };
    }
    // Preserve the existing calculator's method qualifications after editing.
    if (["ckid_u25", "ckid_u25_cr_cys", "sch_idms"].includes(id) && sourceContext.scrAssay === "jaffe_idms") presentation = { ...presentation, reasons: [...(presentation.reasons || []), "Podano metodę Jaffego kalibrowaną do IDMS. W równaniach pediatrycznych zalecane jest oznaczenie enzymatyczne; uwzględnij możliwy wpływ metody, zwłaszcza przy małych stężeniach."] };
    const warnings = external?.warnings ? copy(external.warnings) : [];
    const cystatinMethod = sourceContext.cystatinCAssayMethod;
    if (["ckid_u25_cys", "ckid_u25_cr_cys"].includes(id) && cystatinMethod !== "nephelometric" && (id !== "ckid_u25_cr_cys" || ["immunoturbidimetric", "other"].includes(cystatinMethod))) {
      const methodLabel = cystatinMethod === "immunoturbidimetric" ? "metodę immunoturbidymetryczną" : cystatinMethod === "other" ? "inną metodę" : "nie określono metody";
      warnings.push(`Metoda cystatyny C: ${methodLabel}. NIDDK opisuje dla CKiD U25 oznaczenie nefelometryczne; uwzględnij możliwe ograniczenie porównywalności.`);
    }
    const model = root.ClcrResultPresentation.createModel({ formulaId: id, series: snapshot.parameterKey, ageYears, ageDays: number(values.ageDays), value: raw, displayValue: formatted.rounded, unit: snapshot.assessment.unit, assay, markerPolicy, presentation, boundary: formatted.crossesCategoryBoundary ? formatted.raw : "", assumptions: resolution?.assumptionsText || "", assumptionProvenance: resolution?.provenance, calculationAssumptions: resolution, creatinineStandardization: calculation.creatinineStandardization, cystatinStandardization: calculation.cystatinCStandardization,
      calculationComponents: id === "ckid_u25_cr_cys" && external?.ok ? { egfrCreatinine: external.details.egfrCreatinine, egfrCystatin: external.details.egfrCystatin } : undefined,
    }, profile);
    if (!model.valueVisible) throw new Error("Nie można obliczyć wyniku dla tych danych.");
    const dp = baseDatapoint(snapshot), reference = model.reference;
    Object.assign(dp, { valueNum: raw, rawValue: raw, displayValue: String(model.displayValue ?? formatted.rounded), category: model.category?.code || null, tone: model.tone, outOfRange: ["warning", "danger"].includes(model.tone) ? true : model.tone === "success" ? false : null, norm: reference?.kind && reference.kind !== "none" ? `${reference.value} ${reference.unit || dp.unit}`.trim() : "", reference, referenceProfileId: profile.id, referenceProfileVersion: profile.version, model: copy(model), interpretation: model.interpretation, boundary: model.boundary || "", assumptions: resolution?.assumptionsText || "", warnings });
    return dp;
  }
  function recalculate(snapshotOrSaved, draft = {}) {
    const snapshot = snapshotOrSaved.snapshot || snapshotOrSaved;
    if (!validShape(snapshot)) throw new Error("Brak kompletnych danych obliczenia.");
    const changedValues = draft.values || draft.fields || {};
    const initialValues = snapshot.formulaId === "Ca_mgkg" && root.ClcrCaDzmPersistence ? root.ClcrCaDzmPersistence.prepareValues(snapshot.values, snapshot.capturedContext, snapshot.assessment.caDzmSnapshot) : snapshot.formulaId === "UA_mgkg" && root.ClcrUaPersistence ? root.ClcrUaPersistence.prepareValues(snapshot.values, snapshot.capturedContext, snapshot.assessment.uaSnapshot) : snapshot.values;
    const values = { ...initialValues, ...changedValues };
    if (snapshot.formulaId === "Ca_mgkg" && !own(snapshot.values, "CA_inputMode")) {
      if (own(changedValues, "U_Ca") && !own(changedValues, "CA_concentration")) values.CA_concentration = changedValues.U_Ca;
      if (own(changedValues, "V24") && !own(changedValues, "CA_volume")) values.CA_volume = changedValues.V24;
    }
    if (snapshot.formulaId === "UA_mgkg" && !own(snapshot.values, "UA_inputMode")) {
      if (own(changedValues, "U_UA") && !own(changedValues, "UA_concentration")) values.UA_concentration = changedValues.U_UA;
      if (own(changedValues, "V24") && !own(changedValues, "UA_volume")) values.UA_volume = changedValues.V24;
    }
    const edited = new Set([...(draft.changedFieldIds || []), ...Object.keys(changedValues).filter(field => changedValues[field] !== snapshot.values[field])]);
    for (const [field, value] of Object.entries(changedValues)) {
      const answer = `ui_${field}_answer`;
      const explicitAnswerChanged = own(changedValues, answer) && changedValues[answer] !== snapshot.values[answer];
      if (typeof value === "boolean" && edited.has(field) && !explicitAnswerChanged) { values[answer] = value ? "yes" : "no"; edited.add(answer); }
    }
    if (own(draft, "ageYears")) {
      const age = number(draft.ageYears);
      if (!Number.isFinite(age) || age < 0 || age > 120) throw new Error("Wpisz prawidłowy wiek z dnia badania.");
      const years = Math.floor(age), months = (age - years) * 12;
      if (Math.abs(months - Math.round(months)) > 0.000001) throw new Error("Podaj wiek z dokładnością do pełnego miesiąca.");
      values.age = String(years); values.ageMonths = String(Math.round(months));
      if (["UA_mgkg", "Ca_mgkg"].includes(snapshot.formulaId)) ["age", "ageMonths", "ageDays"].forEach(field => edited.add(field));
      if (years > 0 || months > 0) values.ageDays = "";
    }
    if (own(draft, "sex")) { values.sex = draft.sex; if (["UA_mgkg", "Ca_mgkg"].includes(snapshot.formulaId)) edited.add("sex"); }
    const context = { ...snapshot.capturedContext };
    const date = draft.clinicalDateISO || draft.dateISO || context.clinicalDateISO;
    if (date && ["KTV", "TMP_GFR"].includes(snapshot.formulaId)) context.clinicalDateISO = date;
    if (date && snapshot.formulaId === "KTV") context.evaluationDate = date;
    const dp = caDzmCalculation(snapshot, values, edited, context) || uaCalculation(snapshot, values, edited, context) || ratioCalculation({ ...snapshot, capturedContext: context }, values, edited) || gfrCalculation(snapshot, values) || root.ClcrSavedLegacyCalculator?.recalculate(snapshot.formulaId, values, snapshot.parameterKey, context);
    if (!dp || !finite(dp.valueNum)) throw new Error("Brak poprawnego wyniku dla podanych danych.");
    const typed = dp.acrSnapshot || dp.pcrSnapshot || dp.cacrSnapshot || dp.oxcrSnapshot || dp.citcrSnapshot || dp.fenaSnapshot || dp.fekSnapshot || dp.feclSnapshot || dp.fehco3Snapshot || dp.uagSnapshot || dp.tmpGfrSnapshot || dp.phSnapshot || dp.uaSnapshot || dp.caDzmSnapshot;
    const ageYears = typed?.input && own(typed.input, "ageYears") ? typed.input.ageYears : typed?.context && own(typed.context, "ageYears") ? typed.context.ageYears : ageOf(values);
    return { ...baseDatapoint(snapshot), ...dp, id: snapshot.assessment.id || snapshot.parameterKey, sourceFormulaId: snapshot.formulaId, capture: { ...copy(context), formulaId: snapshot.formulaId, values, fields: snapshot.formulaId === "Ca_mgkg" ? root.ClcrCaDzmPersistence.captureFields(values, snapshot.fields) : snapshot.formulaId === "UA_mgkg" ? root.ClcrUaPersistence.captureFields(values, snapshot.fields) : copy(snapshot.fields), ageYears } };
  }
  return Object.freeze({ START, END, MAX_LENGTH, createSnapshot, serializeSnapshot, readSaved, hasSaved, stripSnapshot, describe, recalculate, normBounds });
});
