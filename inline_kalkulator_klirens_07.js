// Addytywna migracja metadanych dorosłego CKD-EPI cr-cys. Jawne nowe false
// wygrywa ze starymi faktami. Nie zmieniamy niezależnych metod ani stabilności.
function normalizeCrCysConfirmation(session) {
  const normalize = window.ClcrUiModel?.normalizeCrCysSessionInputs;
  if (typeof normalize !== "function") return;
  const inputs = normalize({ ...(session.preservedInputs || {}), ...session.inputs });
  session.inputs = { ...session.inputs, CrCysStandardizationConfirmed: inputs.CrCysStandardizationConfirmed };
}
// Brak sesji Klirensu przy wczytaniu pacjenta oznacza również brak jego
// potwierdzenia standardów; nie dziedziczymy nowego faktu z poprzedniej karty.
function clearCrCysConfirmation() {
  const control = document.getElementById("CrCysStandardizationConfirmed");
  if (control) control.checked = false;
}
// Additive migration: only a legacy snapshot without the new duration key may
// derive hours from its own dates. An explicitly empty new value stays empty.
function normalizeCl24SessionInputs(session) {
  const inputs = { ...(session.preservedInputs || {}), ...session.inputs };
  const hasHours = Object.prototype.hasOwnProperty.call(inputs, "Cl24DurationHours");
  const start = Date.parse(inputs.collectionStartAt || ""), end = Date.parse(inputs.collectionEndAt || "");
  const legacyHours = Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 3600000 : null;
  const fields = {
    Cl24DurationHours: hasHours ? inputs.Cl24DurationHours : legacyHours !== null ? String(legacyHours) : "",
    Cl24DurationSource: hasHours
      ? (String(inputs.Cl24DurationHours ?? "").trim() === "" ? "" : inputs.Cl24DurationSource === "legacy-dates" ? "legacy-dates" : "hours")
      : legacyHours !== null ? "legacy-dates" : "",
    Cl24CollectionProblem: inputs.Cl24CollectionProblem === true,
  };
  for (const id of ["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]) {
    const key = `ui_${id}_answer`;
    // Missing legacy answers are unknown, not new patient inputs. In particular,
    // restoring another formula must not add controls that were never rendered.
    if (Object.prototype.hasOwnProperty.call(inputs, key)) fields[key] = inputs[key];
    else if (inputs[id] === true) fields[key] = "yes";
  }
  session.inputs = { ...session.inputs, ...fields };
}
// A previous patient's rendered protocol controls can outlive their session.
// Clear only absent answers in the DOM; do not manufacture persisted keys.
function clearMissingCl24ProtocolAnswers(session) {
  const inputs = { ...(session.preservedInputs || {}), ...session.inputs };
  for (const id of ["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]) {
    const key = `ui_${id}_answer`;
    const control = document.getElementById(id);
    if (Object.prototype.hasOwnProperty.call(inputs, key)) {
      // A saved answer also determines an otherwise absent checkbox; its old
      // checked state must not leak from the preceding patient into the snapshot.
      if (control && !Object.prototype.hasOwnProperty.call(inputs, id)) control.checked = inputs[key] === "yes";
      continue;
    }
    if (inputs[id] === true) continue;
    const answer = document.getElementById(key);
    if (answer) answer.value = "";
    if (control) control.checked = false;
  }
}
function clearCl24InputContext() {
  for (const id of ["Cl24DurationHours", "Cl24DurationSource"]) {
    const control = document.getElementById(id);
    if (control) control.value = "";
  }
  const problem = document.getElementById("Cl24CollectionProblem");
  if (problem) problem.checked = false;
  for (const id of ["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]) {
    const answer = document.getElementById(`ui_${id}_answer`);
    if (answer) answer.value = "";
    const control = document.getElementById(id);
    if (control) control.checked = false;
  }
}
// Additive ACR migration: a missing source is the existing concentration path.
// A known negative legacy specimen answer is never replaced by an assumption.
function normalizeAcrSessionInputs(session) {
  const input = { ...(session.preservedInputs || {}), ...session.inputs };
  clearAcrInputContext();
  // Missing specimen answers in another patient's session are unknown. Keep
  // provided facts, including negative answers, but never inherit old DOM state.
  clearMissingAcrSampleContext(input);
  const acrKeys = ["ACR_entry_mode", "ACR_reported", "ACR_reported_unit", "U_Alb_unit", "ACR_same_specimen"];
  if ((session.selectedFormula || input.formulaPicker) !== "ACR" && !acrKeys.some(key => Object.prototype.hasOwnProperty.call(input, key))) return;
  const unit = (key, supported, fallback) => Object.prototype.hasOwnProperty.call(input, key)
    ? supported.includes(input[key]) ? input[key] : "" : fallback;
  session.inputs = { ...session.inputs,
    ACR_entry_mode: input.ACR_entry_mode === "direct" ? "direct" : "concentration",
    ACR_reported: input.ACR_reported ?? "",
    ACR_reported_unit: unit("ACR_reported_unit", ["mg/g", "mg/mmol"], "mg/g"),
    U_Alb_unit: unit("U_Alb_unit", ["mg/L", "mg/dL"], "mg/L"),
    ACR_same_specimen: ["confirmed", "different"].includes(input.ACR_same_specimen) ? input.ACR_same_specimen
      : input.ui_spotSameSpecimen_answer === "no" ? "different"
        : input.ui_spotSameSpecimen_answer === "yes" || (input.spotSameSpecimen === true && input.ui_spotSameSpecimen_answer !== "unknown") ? "confirmed" : "",
  };
}
function clearAcrInputContext() {
  const defaults = { ACR_entry_mode: "concentration", ACR_reported: "", ACR_reported_unit: "mg/g", U_Alb_unit: "mg/L", ACR_same_specimen: "" };
  Object.entries(defaults).forEach(([id, value]) => { const control = document.getElementById(id); if (control) control.value = value; });
}
function clearMissingAcrSampleContext(input = {}) {
  const defaults = { spotSameSpecimen: false, ui_spotSameSpecimen_answer: "", spotSampleKind: "",
    spotMenstruation: false, spotHematuria: false, spotInfection: false, spotExercise: false, spotAcuteIllness: false };
  Object.entries(defaults).forEach(([id, value]) => {
    if (Object.prototype.hasOwnProperty.call(input, id)) return;
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value; else control.value = value; }
  });
}
// The existing concentration pathway remains the default for legacy PCR.
// Missing units have historical defaults; an explicitly unknown unit does not.
function normalizePcrSessionInputs(session) {
  // The quick problem picker is a derived view. Only its canonical sample
  // facts are persisted; restoring a UI selection must never create a fact.
  const withoutPicker = values => Object.fromEntries(Object.entries(values || {}).filter(([key]) => key !== "ui_pcr_known_problem"));
  if (Object.prototype.hasOwnProperty.call(session.inputs || {}, "ui_pcr_known_problem")) session.inputs = withoutPicker(session.inputs);
  if (Object.prototype.hasOwnProperty.call(session.preservedInputs || {}, "ui_pcr_known_problem")) session.preservedInputs = withoutPicker(session.preservedInputs);
  const input = { ...(session.preservedInputs || {}), ...session.inputs };
  clearPcrInputContext();
  clearMissingAcrSampleContext(input);
  const keys = ["PCR_entry_mode", "PCR_reported", "PCR_reported_unit", "U_Prot_spot_unit", "PCR_same_specimen"];
  if ((session.selectedFormula || input.formulaPicker) !== "PCR" && !keys.some(key => Object.prototype.hasOwnProperty.call(input, key))) return;
  const unit = (key, supported, fallback) => Object.prototype.hasOwnProperty.call(input, key)
    ? supported.includes(input[key]) ? input[key] : "" : fallback;
  const sampleFacts = {};
  for (const key of ["spotSameSpecimen", "ui_spotSameSpecimen_answer", "spotSampleKind", "spotMenstruation", "spotHematuria", "spotInfection", "spotExercise", "spotAcuteIllness"]) {
    if (Object.prototype.hasOwnProperty.call(input, key)) sampleFacts[key] = input[key];
  }
  session.inputs = { ...session.inputs,
    ...sampleFacts,
    PCR_entry_mode: input.PCR_entry_mode === "direct" ? "direct" : "concentration",
    PCR_reported: input.PCR_reported ?? "",
    PCR_reported_unit: unit("PCR_reported_unit", ["mg/g", "mg/mmol", "mg/mg", "g/g"], "mg/g"),
    U_Prot_spot_unit: unit("U_Prot_spot_unit", ["mg/L", "mg/dL", "g/L"], "mg/L"),
    PCR_same_specimen: ["confirmed", "different"].includes(input.PCR_same_specimen) ? input.PCR_same_specimen
      : input.ui_spotSameSpecimen_answer === "no" ? "different"
        : input.ui_spotSameSpecimen_answer === "yes" || (input.spotSameSpecimen === true && input.ui_spotSameSpecimen_answer !== "unknown") ? "confirmed" : "",
  };
}
function clearPcrInputContext() {
  const defaults = { PCR_entry_mode: "concentration", PCR_reported: "", PCR_reported_unit: "mg/g", U_Prot_spot_unit: "mg/L", PCR_same_specimen: "" };
  Object.entries(defaults).forEach(([id, value]) => { const control = document.getElementById(id); if (control) control.value = value; });
  const picker = document.getElementById("ui_pcr_known_problem");
  if (picker) picker.value = "";
}
// Ca/Cr keeps its own mode, source inputs and native result unit. Missing
// historical fields get defaults; a supplied unknown unit stays unknown.
function normalizeCacrSessionInputs(session) {
  const withoutPicker = values => Object.fromEntries(Object.entries(values || {}).filter(([key]) => key !== "ui_cacr_known_problem"));
  if (Object.prototype.hasOwnProperty.call(session.inputs || {}, "ui_cacr_known_problem")) session.inputs = withoutPicker(session.inputs);
  if (Object.prototype.hasOwnProperty.call(session.preservedInputs || {}, "ui_cacr_known_problem")) session.preservedInputs = withoutPicker(session.preservedInputs);
  const input = { ...(session.preservedInputs || {}), ...session.inputs };
  clearCacrInputContext();
  clearMissingAcrSampleContext(input);
  clearMissingCacrKnownContext(input);
  const keys = ["CaCr_entry_mode", "CaCr_reported", "CaCr_reported_unit", "CaCr_same_specimen"];
  if ((session.selectedFormula || input.formulaPicker) !== "CaCr_spot" && !keys.some(key => Object.prototype.hasOwnProperty.call(input, key))) return;
  const unit = (key, supported, fallback) => Object.prototype.hasOwnProperty.call(input, key)
    ? supported.includes(input[key]) ? input[key] : "" : fallback;
  const provided = {};
  for (const key of ["Ca_spot", "Ucr_spot", "Ucr_spot_unit", "spotSameSpecimen", "ui_spotSameSpecimen_answer", "spotSampleKind", "spotMenstruation", "spotHematuria", "spotInfection", "spotExercise", "spotAcuteIllness", "spotDiureticUse", "spotKnownCKD",
    "ui_spotMenstruation_answer", "ui_spotHematuria_answer", "ui_spotInfection_answer", "ui_spotExercise_answer", "ui_spotAcuteIllness_answer", "ui_spotDiureticUse_answer", "ui_spotKnownCKD_answer"]) {
    if (Object.prototype.hasOwnProperty.call(input, key)) provided[key] = input[key];
  }
  session.inputs = { ...session.inputs, ...provided,
    CaCr_entry_mode: input.CaCr_entry_mode === "direct" ? "direct" : "concentration",
    CaCr_reported: input.CaCr_reported ?? "",
    CaCr_reported_unit: unit("CaCr_reported_unit", ["mg/mg", "mg/g", "g/g", "mol/mol", "mmol/mmol", "mmol/mol", "mg/mmol"], "mg/mg"),
    Ca_spot_unit: unit("Ca_spot_unit", ["mg/dl", "mg/L", "mmol/L"], "mg/dl"),
    CaCr_same_specimen: ["confirmed", "different"].includes(input.CaCr_same_specimen) ? input.CaCr_same_specimen
      : input.ui_spotSameSpecimen_answer === "no" ? "different"
        : input.ui_spotSameSpecimen_answer === "yes" || (input.spotSameSpecimen === true && input.ui_spotSameSpecimen_answer !== "unknown") ? "confirmed" : "",
  };
}
function clearCacrInputContext() {
  const defaults = { CaCr_entry_mode: "concentration", CaCr_reported: "", CaCr_reported_unit: "mg/mg", CaCr_same_specimen: "" };
  Object.entries(defaults).forEach(([id, value]) => { const control = document.getElementById(id); if (control) control.value = value; });
  const picker = document.getElementById("ui_cacr_known_problem");
  if (picker) picker.value = "";
}
// Existing yes/no/unknown controls carry facts independently of the checkbox.
// Clear absent answers between patients; never turn a missing answer into no.
function clearMissingCacrKnownContext(input = {}) {
  for (const id of ["spotMenstruation", "spotHematuria", "spotInfection", "spotExercise", "spotAcuteIllness", "spotDiureticUse", "spotKnownCKD"]) {
    const key = `ui_${id}_answer`;
    const control = document.getElementById(id);
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      if (control && !Object.prototype.hasOwnProperty.call(input, id)) control.checked = input[key] === "yes";
      continue;
    }
    const answer = document.getElementById(key);
    if (answer) answer.value = "";
    if (control && !Object.prototype.hasOwnProperty.call(input, id)) control.checked = false;
  }
}
// Ox/Cr owns a combined unit/mass-basis value. Migrate only this session's
// historical concentration; an absent entity never inherits the previous DOM.
function normalizeOxcrSessionInputs(session) {
  const withoutPicker = values => Object.fromEntries(Object.entries(values || {}).filter(([key]) => key !== "ui_oxcr_known_problem"));
  if (Object.prototype.hasOwnProperty.call(session.inputs || {}, "ui_oxcr_known_problem")) session.inputs = withoutPicker(session.inputs);
  if (Object.prototype.hasOwnProperty.call(session.preservedInputs || {}, "ui_oxcr_known_problem")) session.preservedInputs = withoutPicker(session.preservedInputs);
  const input = { ...(session.preservedInputs || {}), ...session.inputs };
  clearOxcrInputContext({ sharedUnit: false });
  const has = key => Object.prototype.hasOwnProperty.call(input, key);
  const keys = ["OxCr_entry_mode", "OxCr_reported", "OxCr_reported_unit", "Ox_Cr_spot", "Ox_Cr_spot_unit", "oxalateSpotReportingEntity", "OxCr_same_specimen"];
  // A historical populated shared concentration without a unit meant mg/dL.
  // This applies independently of the previously displayed formula.
  if (!has("Ucr_spot_unit") && String(input.Ucr_spot ?? "").trim()) session.inputs.Ucr_spot_unit = "mg/dl";
  if ((session.selectedFormula || input.formulaPicker) !== "OxCr_spot" && !keys.some(has)) return;
  const legacyConcentration = !has("Ox_Cr_spot_unit") && has("Ox_Cr_spot") && String(input.Ox_Cr_spot ?? "").trim() !== "";
  const basis = input.oxalateSpotReportingEntity === "oxalic_acid" ? "acid" : input.oxalateSpotReportingEntity === "oxalate_ion" ? "ion" : "unknown";
  const supported = (key, values, fallback) => has(key) ? values.includes(input[key]) ? input[key] : "" : fallback;
  const oxUnits = ["umol/L", "mmol/L", ...["ion", "acid", "unknown"].flatMap(b => ["mg/L:" + b, "mg/dL:" + b])];
  const readyUnits = ["umol/mmol", "mmol/mol", "mmol/mmol", "mol/mol", ...["ion", "acid", "unknown"].flatMap(b => ["mg/mg:" + b, "mg/g:" + b, "mg/mmol:" + b])];
  const provided = {};
  for (const key of ["Ucr_spot", "Ucr_spot_unit", "spotSameSpecimen", "ui_spotSameSpecimen_answer", "spotSampleKind", "spotMenstruation", "spotHematuria", "spotInfection", "spotExercise", "spotAcuteIllness", "spotDiureticUse", "spotKnownCKD",
    "ui_spotMenstruation_answer", "ui_spotHematuria_answer", "ui_spotInfection_answer", "ui_spotExercise_answer", "ui_spotAcuteIllness_answer", "ui_spotDiureticUse_answer", "ui_spotKnownCKD_answer"]) {
    if (has(key)) provided[key] = input[key];
  }
  session.inputs = { ...session.inputs, ...provided,
    OxCr_entry_mode: input.OxCr_entry_mode === "direct" ? "direct" : "concentration",
    OxCr_reported: input.OxCr_reported ?? "",
    OxCr_reported_unit: supported("OxCr_reported_unit", readyUnits, "umol/mmol"),
    Ox_Cr_spot: input.Ox_Cr_spot ?? "",
    Ox_Cr_spot_unit: supported("Ox_Cr_spot_unit", oxUnits, legacyConcentration ? "mg/dL:" + basis : "umol/L"),
    oxalateSpotReportingEntity: has("oxalateSpotReportingEntity") ? input.oxalateSpotReportingEntity : "",
    OxCr_same_specimen: ["confirmed", "different"].includes(input.OxCr_same_specimen) ? input.OxCr_same_specimen
      : input.ui_spotSameSpecimen_answer === "no" ? "different"
        : input.ui_spotSameSpecimen_answer === "yes" || (input.spotSameSpecimen === true && input.ui_spotSameSpecimen_answer !== "unknown") ? "confirmed" : "",
  };
  if (!has("Ucr_spot_unit")) session.inputs.Ucr_spot_unit = legacyConcentration || String(input.Ucr_spot ?? "").trim() ? "mg/dl" : "mmol/L";
}
function clearOxcrInputContext(options = {}) {
  const defaults = { OxCr_entry_mode: "concentration", OxCr_reported: "", OxCr_reported_unit: "umol/mmol", Ox_Cr_spot: "", Ox_Cr_spot_unit: "umol/L", OxCr_same_specimen: "", oxalateSpotReportingEntity: "" };
  Object.entries(defaults).forEach(([id, value]) => { const control = document.getElementById(id); if (control) control.value = value; });
  const picker = document.getElementById("ui_oxcr_known_problem");
  if (picker) picker.value = "";
  if (options.sharedUnit !== false && document.getElementById("formulaPicker")?.value === "OxCr_spot") {
    const cr = document.getElementById("Ucr_spot_unit"); if (cr) cr.value = "mmol/L";
  }
}
// Cit/Cr stores a unique unit and a separately reported mass basis. Historical
// Cit concentrations were explicitly calculated as citric acid in mg/dL. This
// migrates that saved value; it is not an assumption for a new mass entry.
function normalizeCitcrSessionInputs(session) {
  const withoutPicker = values => Object.fromEntries(Object.entries(values || {}).filter(([key]) => key !== "ui_citcr_known_problem"));
  if (Object.prototype.hasOwnProperty.call(session.inputs || {}, "ui_citcr_known_problem")) session.inputs = withoutPicker(session.inputs);
  if (Object.prototype.hasOwnProperty.call(session.preservedInputs || {}, "ui_citcr_known_problem")) session.preservedInputs = withoutPicker(session.preservedInputs);
  const input = { ...(session.preservedInputs || {}), ...session.inputs };
  clearCitcrInputContext({ sharedUnit: false });
  const has = key => Object.prototype.hasOwnProperty.call(input, key);
  const selected = (session.selectedFormula || input.formulaPicker) === "CitCr_spot";
  const keys = ["CitCr_entry_mode", "CitCr_reported", "CitCr_reported_unit", "CitCr_reported_basis", "Cit_Cr_spot", "Cit_Cr_spot_unit", "citrateSpotReportingEntity", "CitCr_same_specimen"];
  if (!selected && !keys.some(has)) return;
  const legacyConcentration = !has("Cit_Cr_spot_unit") && has("Cit_Cr_spot") && String(input.Cit_Cr_spot ?? "").trim() !== "";
  const unit = (key, values, fallback) => has(key) ? values.includes(input[key]) ? input[key] : "" : fallback;
  const basis = (key, fallback) => has(key) ? ["ion", "acid", "unknown"].includes(input[key]) ? input[key] : "unknown" : fallback;
  const provided = {};
  for (const key of ["Ucr_spot", "Ucr_spot_unit", "spotSameSpecimen", "ui_spotSameSpecimen_answer", "spotSampleKind", "spotMenstruation", "spotHematuria", "spotInfection", "spotExercise", "spotAcuteIllness", "spotDiureticUse", "spotKnownCKD",
    "ui_spotMenstruation_answer", "ui_spotHematuria_answer", "ui_spotInfection_answer", "ui_spotExercise_answer", "ui_spotAcuteIllness_answer", "ui_spotDiureticUse_answer", "ui_spotKnownCKD_answer"]) {
    if (has(key)) provided[key] = input[key];
  }
  // A sparse session must not complete itself using either old DOM operand.
  // Explicit blanks in inputs take precedence over preservedInputs.
  if (selected || has("Cit_Cr_spot")) provided.Ucr_spot = input.Ucr_spot ?? "";
  if (!has("Ucr_spot_unit") && (selected || has("Cit_Cr_spot"))) provided.Ucr_spot_unit = legacyConcentration || String(input.Ucr_spot ?? "").trim() ? "mg/dl" : "mmol/L";
  session.inputs = { ...session.inputs, ...provided,
    CitCr_entry_mode: input.CitCr_entry_mode === "direct" ? "direct" : "concentration",
    CitCr_reported: input.CitCr_reported ?? "",
    CitCr_reported_unit: unit("CitCr_reported_unit", ["umol/mmol", "mmol/mol", "mmol/mmol", "mol/mol", "mg/mg", "mg/g", "mg/mmol"], "umol/mmol"),
    CitCr_reported_basis: basis("CitCr_reported_basis", "unknown"),
    Cit_Cr_spot: input.Cit_Cr_spot ?? "",
    Cit_Cr_spot_unit: unit("Cit_Cr_spot_unit", ["umol/L", "mmol/L", "mg/L", "mg/dL"], legacyConcentration ? "mg/dL" : "umol/L"),
    citrateSpotReportingEntity: basis("citrateSpotReportingEntity", legacyConcentration ? "acid" : "unknown"),
    CitCr_same_specimen: ["confirmed", "different"].includes(input.CitCr_same_specimen) ? input.CitCr_same_specimen
      : input.ui_spotSameSpecimen_answer === "no" ? "different"
        : input.ui_spotSameSpecimen_answer === "yes" || (input.spotSameSpecimen === true && input.ui_spotSameSpecimen_answer !== "unknown") ? "confirmed" : "",
  };
}
function clearCitcrInputContext(options = {}) {
  const defaults = { CitCr_entry_mode: "concentration", CitCr_reported: "", CitCr_reported_unit: "umol/mmol", CitCr_reported_basis: "unknown", Cit_Cr_spot: "", Cit_Cr_spot_unit: "umol/L", citrateSpotReportingEntity: "unknown", CitCr_same_specimen: "" };
  Object.entries(defaults).forEach(([id, value]) => { const control = document.getElementById(id); if (control) control.value = value; });
  const picker = document.getElementById("ui_citcr_known_problem");
  if (picker) picker.value = "";
  if (options.sharedUnit !== false && document.getElementById("formulaPicker")?.value === "CitCr_spot") {
    const cr = document.getElementById("Ucr_spot_unit"); if (cr) cr.value = "mmol/L";
  }
}
// FENa's four operands belong to the incoming sample. A thin session must not
// complete itself with old DOM values, sample confirmations or known factors.
// The optional problem picker is a derived view, never a clinical fact.
function normalizeFenaSessionInputs(session) {
  const picker = "ui_fena_sample_issue";
  const withoutPicker = values => Object.fromEntries(Object.entries(values || {}).filter(([key]) => key !== picker));
  if (Object.prototype.hasOwnProperty.call(session.inputs || {}, picker)) session.inputs = withoutPicker(session.inputs);
  if (Object.prototype.hasOwnProperty.call(session.preservedInputs || {}, picker)) session.preservedInputs = withoutPicker(session.preservedInputs);
  const input = { ...(session.preservedInputs || {}), ...session.inputs };
  clearFenaInputContext({ shared: false });
  // Incoming sessions are replacements, not partial DOM patches. This also
  // covers another formula followed by a switch to FENa: no old sodium or
  // creatinine may complete that new sample. Supplied shared values survive.
  const has = key => Object.prototype.hasOwnProperty.call(input, key);
  const fields = {};
  for (const id of ["U_Na_spot", "S_Na_spot", "Ucr_spot", "Scr_spot"]) fields[id] = input[id] ?? "";
  for (const id of ["Ucr_spot_unit", "Scr_spot_unit"]) {
    // The existing calculator's historical creatinine unit was mg/dL.
    // Explicit blank/unknown units stay unknown rather than acquiring a default.
    fields[id] = has(id) ? ["mg/dl", "mg/dL", "umol/L", "µmol/L", "umol", "µmol", "mmol/L", "mmol"].includes(input[id]) ? input[id] : "" : "mg/dl";
  }
  fields.FENa_sample_status = input.ui_spotSameSpecimen_answer === "no" || input.FENa_sample_status === "different-urine" ? "different-urine"
    : input.ui_spotPairedChemistry_answer === "no" ? "different-time"
      : ["different-time", "confirmed"].includes(input.FENa_sample_status) ? input.FENa_sample_status : "";
  for (const id of ["spotSameSpecimen", "spotPairedChemistry", "spotDiureticUse", "spotKnownCKD"]) {
    const key = `ui_${id}_answer`;
    fields[id] = input[id] === true;
    fields[key] = ["yes", "no", "unknown"].includes(input[key]) ? input[key] : "";
    // A supplied answer has precedence over a legacy checkbox. Unknown does
    // not turn into a negative clinical fact, but it does clear an old true.
    if (["yes", "no", "unknown"].includes(input[key])) fields[id] = fields[key] === "yes";
  }
  // A reported FENa problem also invalidates the shared paired-chemistry
  // confirmation used by FEK/FECl/FEHCO3/TRP. It is the same clinical fact even
  // when another formula is selected or an old snapshot still contains yes.
  const sharedIssueFields = [];
  if (["different-time", "different-urine"].includes(fields.FENa_sample_status)) {
    fields.spotPairedChemistry = false;
    fields.ui_spotPairedChemistry_answer = "no";
    sharedIssueFields.push("spotPairedChemistry", "ui_spotPairedChemistry_answer");
    // A time-only problem does not invalidate an otherwise confirmed urine
    // sample; urine-only calculations such as UAG may still use that sample.
    if (fields.FENa_sample_status === "different-urine") {
      fields.spotSameSpecimen = false;
      fields.ui_spotSameSpecimen_answer = "no";
      sharedIssueFields.push("spotSameSpecimen", "ui_spotSameSpecimen_answer");
    }
    // TmP/GFR shares these creatinine samples but carries its own time-only
    // confirmation. A urine mismatch withdraws confirmation without inventing
    // a wrong blood time; an independently reported no remains a known fact.
    if (has("tmpPairedSameTime") || has("ui_tmpPairedSameTime_answer") || document.getElementById("tmpPairedSameTime") || document.getElementById("ui_tmpPairedSameTime_answer")) {
      fields.tmpPairedSameTime = false;
      fields.ui_tmpPairedSameTime_answer = fields.FENa_sample_status === "different-time" || input.ui_tmpPairedSameTime_answer === "no" ? "no" : "unknown";
      sharedIssueFields.push("tmpPairedSameTime", "ui_tmpPairedSameTime_answer");
    }
  }
  // Clear existing controls, but do not invent unknown persisted keys for
  // absent controls. Explicit known issues remain facts even without a widget.
  const applicable = Object.fromEntries(Object.entries(fields).filter(([key]) => has(key) || document.getElementById(key) || sharedIssueFields.includes(key)));
  session.inputs = { ...session.inputs, ...applicable };
}
function clearFenaInputContext(options = {}) {
  const defaults = { FENa_sample_status: "", ui_fena_sample_issue: "" };
  if (options.shared !== false) {
    Object.assign(defaults, { U_Na_spot: "", S_Na_spot: "", Ucr_spot: "", Scr_spot: "", Scr_spot_unit: "mg/dl",
      spotSameSpecimen: false, ui_spotSameSpecimen_answer: "", spotPairedChemistry: false, ui_spotPairedChemistry_answer: "",
      spotDiureticUse: false, ui_spotDiureticUse_answer: "", spotKnownCKD: false, ui_spotKnownCKD_answer: "" });
    if (document.getElementById("formulaPicker")?.value === "FENa_spot") defaults.Ucr_spot_unit = "mg/dl";
  }
  Object.entries(defaults).forEach(([id, value]) => {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value; else control.value = value; }
  });
}
// FEK uses the same creatinine and sample facts as FENa, normalized above.
// Its potassium operands must also belong wholly to this incoming session,
// even if a different formula is currently selected. Never finish a new
// sample with potassium or known clinical context from the previous patient.
function normalizeFekSessionInputs(session) {
  const picker = "ui_fek_sample_issue";
  const withoutPicker = values => Object.fromEntries(Object.entries(values || {}).filter(([key]) => key !== picker));
  if (Object.prototype.hasOwnProperty.call(session.inputs || {}, picker)) session.inputs = withoutPicker(session.inputs);
  if (Object.prototype.hasOwnProperty.call(session.preservedInputs || {}, picker)) session.preservedInputs = withoutPicker(session.preservedInputs);
  const input = { ...(session.preservedInputs || {}), ...session.inputs };
  const has = key => Object.prototype.hasOwnProperty.call(input, key);
  clearFekInputContext();
  const fields = {
    U_K_spot: input.U_K_spot ?? "", S_K_spot: input.S_K_spot ?? "",
    suspectedAKI: input.suspectedAKI === true,
    creatinineState: ["stable", "rapidlyChanging", "unknown"].includes(input.creatinineState) ? input.creatinineState : "unknown",
  };
  const answer = "ui_suspectedAKI_answer";
  if (has(answer) || document.getElementById(answer)) {
    fields[answer] = ["yes", "no", "unknown"].includes(input[answer]) ? input[answer] : "";
    if (["yes", "no", "unknown"].includes(input[answer])) fields.suspectedAKI = fields[answer] === "yes";
  }
  // Do not invent an unrendered question or turn a missing legacy checkbox
  // into a confirmed absence. The engine distinguishes false from no answer.
  session.inputs = { ...session.inputs, ...Object.fromEntries(Object.entries(fields).filter(([key]) => has(key) || document.getElementById(key))) };
}
function clearFekInputContext() {
  const defaults = { U_K_spot: "", S_K_spot: "", ui_fek_sample_issue: "", suspectedAKI: false, ui_suspectedAKI_answer: "", creatinineState: "unknown" };
  Object.entries(defaults).forEach(([id, value]) => {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value; else control.value = value; }
  });
}
// New sessions replace the chloride pair even when a different spot formula
// is selected. Routine formula switches do not call this replacement path.
// FECl unit aliases are canonicalized before the shared FENa normalizer runs.
// That normalizer retains responsibility for shared creatinine/sample facts.
function normalizeFeclSessionInputs(session) {
  const picker = "ui_fecl_sample_issue";
  const withoutPicker = values => Object.fromEntries(Object.entries(values || {}).filter(([key]) => key !== picker));
  if (Object.prototype.hasOwnProperty.call(session.inputs || {}, picker)) session.inputs = withoutPicker(session.inputs);
  if (Object.prototype.hasOwnProperty.call(session.preservedInputs || {}, picker)) session.preservedInputs = withoutPicker(session.preservedInputs);
  const input = { ...(session.preservedInputs || {}), ...session.inputs };
  const has = key => Object.prototype.hasOwnProperty.call(input, key);
  clearFeclInputContext();
  const fields = { U_Cl_spot: input.U_Cl_spot ?? "", S_Cl_spot: input.S_Cl_spot ?? "" };
  if ((session.selectedFormula || input.formulaPicker) === "FECl_spot") {
    // Normalize equivalent unit names before native selects receive them.
    // Their option values are mg/dl, umol and mmol/L; assigning e.g. µmol/L
    // directly would empty the select despite an otherwise valid sample.
    // No concentration is converted: each alias denotes the same unit.
    for (const id of ["Ucr_spot_unit", "Scr_spot_unit"]) {
      if (!has(id)) continue;
      const unit = typeof input[id] === "string" ? input[id].trim().replace(/[µμ]/g, "u").toLowerCase() : "";
      fields[id] = unit === "mg/dl" ? "mg/dl" : ["umol", "umol/l"].includes(unit) ? "umol" : ["mmol", "mmol/l"].includes(unit) ? "mmol/L" : "";
    }
  }

  session.inputs = { ...session.inputs, ...Object.fromEntries(Object.entries(fields).filter(([key]) => has(key) || document.getElementById(key))) };
}
function clearFeclInputContext() {
  for (const id of ["U_Cl_spot", "S_Cl_spot", "ui_fecl_sample_issue"]) {
    const control = document.getElementById(id);
    if (control) control.value = "";
  }
}
// New sessions replace the bicarbonate pair and any old loading answer even when a different spot formula
// is selected. Routine formula switches do not call this replacement path.
// FEHCO3 unit aliases are canonicalized before the shared FENa normalizer runs.
// That normalizer retains responsibility for shared creatinine/sample facts.
function normalizeFehco3SessionInputs(session) {
  const picker = "ui_fehco3_sample_issue";
  const withoutPicker = values => Object.fromEntries(Object.entries(values || {}).filter(([key]) => key !== picker));
  if (Object.prototype.hasOwnProperty.call(session.inputs || {}, picker)) session.inputs = withoutPicker(session.inputs);
  if (Object.prototype.hasOwnProperty.call(session.preservedInputs || {}, picker)) session.preservedInputs = withoutPicker(session.preservedInputs);
  const input = { ...(session.preservedInputs || {}), ...session.inputs };
  const has = key => Object.prototype.hasOwnProperty.call(input, key);
  clearFehco3InputContext();
  const fields = { U_HCO3_spot: input.U_HCO3_spot ?? "", S_HCO3_spot: input.S_HCO3_spot ?? "" };
  // Loading is an independent fact. A missing incoming answer cannot inherit
  // a preceding patient's test, and unchecked alone does not establish no.
  const loadAnswer = "ui_spotBicarbonateLoad_answer";
  if (has("spotBicarbonateLoad") || has(loadAnswer) || document.getElementById("spotBicarbonateLoad") || document.getElementById(loadAnswer)) {
    fields.spotBicarbonateLoad = input.spotBicarbonateLoad === true;
    fields[loadAnswer] = ["yes", "no", "unknown"].includes(input[loadAnswer]) ? input[loadAnswer] : "";
    if (["yes", "no", "unknown"].includes(input[loadAnswer])) fields.spotBicarbonateLoad = fields[loadAnswer] === "yes";
  }
  if ((session.selectedFormula || input.formulaPicker) === "FEHCO3_spot") {
    // Normalize equivalent unit names before native selects receive them.
    // Their option values are mg/dl, umol and mmol/L; assigning e.g. µmol/L
    // directly would empty the select despite an otherwise valid sample.
    // No concentration is converted: each alias denotes the same unit.
    for (const id of ["Ucr_spot_unit", "Scr_spot_unit"]) {
      if (!has(id)) continue;
      const unit = typeof input[id] === "string" ? input[id].trim().replace(/[µμ]/g, "u").toLowerCase() : "";
      fields[id] = unit === "mg/dl" ? "mg/dl" : ["umol", "umol/l"].includes(unit) ? "umol" : ["mmol", "mmol/l"].includes(unit) ? "mmol/L" : "";
    }
  }

  session.inputs = { ...session.inputs, ...Object.fromEntries(Object.entries(fields).filter(([key]) => has(key) || document.getElementById(key))) };
}
function clearFehco3InputContext() {
  const defaults = { U_HCO3_spot: "", S_HCO3_spot: "", ui_fehco3_sample_issue: "", spotBicarbonateLoad: false, ui_spotBicarbonateLoad_answer: "" };
  for (const [id, value] of Object.entries(defaults)) {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value; else control.value = value; }
  }
}
// Clear values within the current FECl sample without erasing a known issue
// or claiming another formula's independent protocol has been confirmed.
function restoreClearedFeclContext(event) {
  const saved = event?.clcrPreservedFeclContext;
  if (event?.clcrClearedFormula !== "FECl_spot" || !saved || typeof saved !== "object" || Array.isArray(saved)) return;
  const keys = ["age", "ageMonths", "ageDays", "Ucr_spot_unit", "Scr_spot_unit", "FENa_sample_status", "creatinineState", "spotSampleKind"];
  for (const id of ["spotSameSpecimen", "spotPairedChemistry", "spotDiureticUse", "spotKnownCKD", "suspectedAKI", "tmpPairedSameTime", "tmpOvernightFasting", "spotBicarbonateLoad"]) keys.push(id, `ui_${id}_answer`);
  const vault = window.__vildaClcrVersionValueVault && typeof window.__vildaClcrVersionValueVault === "object" ? window.__vildaClcrVersionValueVault : (window.__vildaClcrVersionValueVault = {});
  for (const id of keys) {
    if (!Object.prototype.hasOwnProperty.call(saved, id) || !["string", "boolean", "number"].includes(typeof saved[id])) continue;
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = saved[id] === true; else control.value = String(saved[id]); }
    vault[id] = saved[id];
  }
}
// Clear values within the current FEHCO3 sample without erasing a known issue
// or claiming another formula's independent protocol has been confirmed.
function restoreClearedFehco3Context(event) {
  const saved = event?.clcrPreservedFehco3Context;
  if (event?.clcrClearedFormula !== "FEHCO3_spot" || !saved || typeof saved !== "object" || Array.isArray(saved)) return;
  const keys = ["age", "ageMonths", "ageDays", "Ucr_spot_unit", "Scr_spot_unit", "FENa_sample_status", "creatinineState", "spotSampleKind"];
  for (const id of ["spotSameSpecimen", "spotPairedChemistry", "spotDiureticUse", "spotKnownCKD", "suspectedAKI", "tmpPairedSameTime", "tmpOvernightFasting", "spotBicarbonateLoad"]) keys.push(id, `ui_${id}_answer`);
  const vault = window.__vildaClcrVersionValueVault && typeof window.__vildaClcrVersionValueVault === "object" ? window.__vildaClcrVersionValueVault : (window.__vildaClcrVersionValueVault = {});
  for (const id of keys) {
    if (!Object.prototype.hasOwnProperty.call(saved, id) || !["string", "boolean", "number"].includes(typeof saved[id])) continue;
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = saved[id] === true; else control.value = String(saved[id]); }
    vault[id] = saved[id];
  }
}
/* KLIRENS-UAG-SESSION: source tools/patch-klirens-uag-session.mjs */
function normalizeUagSessionInputs(session) {
  const input = { ...(session.preservedInputs || {}), ...session.inputs };
  const has = key => Object.prototype.hasOwnProperty.call(input, key);
  const flag = "spotNagmaContext", answer = "ui_spotNagmaContext_answer";
  const fields = {
    [flag]: input[flag] === true,
    [answer]: ["yes", "no", "unknown"].includes(input[answer]) ? input[answer] : "",
  };
  if (["yes", "no", "unknown"].includes(input[answer])) fields[flag] = fields[answer] === "yes";
  // This path replaces a session, including another formula followed by UAG.
  // A preceding patient's NAGMA must never complete that incoming sample.
  for (const [id, value] of Object.entries(fields)) {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value; else control.value = value; }
  }
  session.inputs = { ...session.inputs, ...Object.fromEntries(Object.entries(fields).filter(([id]) => has(id) || document.getElementById(id))) };
}
function clearUagInputContext() {
  const defaults = { U_Na_spot: "", U_K_spot: "", U_Cl_spot: "", spotNagmaContext: false, ui_spotNagmaContext_answer: "" };
  for (const [id, value] of Object.entries(defaults)) {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value; else control.value = value; }
  }
}
function restoreClearedUagContext(event) {
  const saved = event?.clcrPreservedUagContext;
  if (event?.clcrClearedFormula !== "AGu_spot" || !saved || typeof saved !== "object" || Array.isArray(saved)) return;
  const keys = ["age", "ageMonths", "ageDays", "Ucr_spot_unit", "Scr_spot_unit", "creatinineState"];
  for (const id of ["spotDiureticUse", "spotKnownCKD", "suspectedAKI", "spotNagmaContext", "tmpOvernightFasting", "spotBicarbonateLoad"]) keys.push(id, "ui_" + id + "_answer");
  const values = Object.fromEntries(keys.filter(id => Object.prototype.hasOwnProperty.call(saved, id) && ["string", "boolean", "number"].includes(typeof saved[id])).map(id => [id, saved[id]]));
  // Clear starts a new urine sample. Neither old mismatches nor confirmations
  // describe it. A known blood timing problem remains independent evidence:
  // it does not block urine-only UAG, but still matters after switching to FE.
  const bloodProblem = saved.FENa_sample_status === "different-time" || saved.ui_spotPairedChemistry_answer === "no" && saved.FENa_sample_status !== "different-urine";
  Object.assign(values, {
    U_Na_spot: "", U_K_spot: "", U_Cl_spot: "", spotSampleKind: "",
    spotSameSpecimen: false, ui_spotSameSpecimen_answer: "",
    spotPairedChemistry: false, ui_spotPairedChemistry_answer: bloodProblem ? "no" : "",
    FENa_sample_status: bloodProblem ? "different-time" : "",
    tmpPairedSameTime: false,
    ui_tmpPairedSameTime_answer: saved.ui_tmpPairedSameTime_answer === "no" ? "no" : saved.ui_tmpPairedSameTime_answer === "unknown" ? "unknown" : "",
  });
  const vault = window.__vildaClcrVersionValueVault && typeof window.__vildaClcrVersionValueVault === "object" ? window.__vildaClcrVersionValueVault : (window.__vildaClcrVersionValueVault = {});
  for (const [id, value] of Object.entries(values)) {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value === true; else control.value = String(value); }
    vault[id] = value;
  }
}
/* KLIRENS-TMP-GFR-SESSION: source tools/patch-klirens-tmp-session.mjs */
function prepareTmpGfrSession(session) {
  const preserved = session.preservedInputs;
  if (!preserved || typeof preserved !== "object" || Array.isArray(preserved)) return session;
  const formula = session.selectedFormula || session.inputs?.formulaPicker || preserved.formulaPicker;
  if (formula !== "TMP_GFR") return session;
  return { ...session, selectedFormula: formula, inputs: session.inputs && typeof session.inputs === "object" ? session.inputs : {} };
}
function normalizeTmpGfrSessionInputs(session) {
  const input = { ...(session.preservedInputs || {}), ...session.inputs };
  const has = key => Object.prototype.hasOwnProperty.call(input, key);
  const fields = {
    U_PO4_spot: input.U_PO4_spot ?? "",
    S_PO4_spot: input.S_PO4_spot ?? "",
    tmpBurosumab: input.tmpBurosumab === true,
    tmpDaysSinceDose: typeof input.tmpDaysSinceDose === "string" || typeof input.tmpDaysSinceDose === "number" ? input.tmpDaysSinceDose : "",
  };
  for (const id of ["U_PO4_spot_unit", "S_PO4_spot_unit"]) {
    const unit = typeof input[id] === "string" ? input[id].trim().toLowerCase() : "";
    fields[id] = !has(id) ? "mg/dl" : unit === "mg/dl" ? "mg/dl" : unit === "mmol/l" ? "mmol/L" : "";
  }
  // These fields remain historical facts, not mandatory new questions.
  for (const id of ["tmpPairedSameTime", "tmpOvernightFasting"]) {
    const key = "ui_" + id + "_answer";
    fields[id] = input[id] === true;
    fields[key] = ["yes", "no", "unknown"].includes(input[key]) ? input[key] : "";
    if (["yes", "no", "unknown"].includes(input[key])) { fields[id] = fields[key] === "yes"; }
  }
  if ((session.selectedFormula || input.formulaPicker) === "TMP_GFR") {
    for (const id of ["Ucr_spot_unit", "Scr_spot_unit"]) {
      if (!has(id)) continue;
      const unit = typeof input[id] === "string" ? input[id].trim().replace(/[µμ]/g, "u").toLowerCase() : "";
      fields[id] = unit === "mg/dl" ? "mg/dl" : ["umol", "umol/l"].includes(unit) ? "umol" : ["mmol", "mmol/l"].includes(unit) ? "mmol/L" : "";
    }
  }
  // Preserved-only sessions carry their historical patient context too.
  for (const id of ["age", "ageMonths", "ageDays", "sex"]) if (has(id)) fields[id] = input[id];
  const applicable = Object.fromEntries(Object.entries(fields).filter(([id]) => has(id) || document.getElementById(id)));
  for (const [id, value] of Object.entries(applicable)) {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value; else control.value = value; }
  }
  session.inputs = { ...session.inputs, ...applicable };
}
function clearTmpGfrInputContext() {
  const defaults = { U_PO4_spot: "", S_PO4_spot: "", U_PO4_spot_unit: "mg/dl", S_PO4_spot_unit: "mg/dl", tmpBurosumab: false, tmpDaysSinceDose: "",
    tmpPairedSameTime: false, ui_tmpPairedSameTime_answer: "", tmpOvernightFasting: false, ui_tmpOvernightFasting_answer: "" };
  for (const [id, value] of Object.entries(defaults)) {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value; else control.value = value; }
  }
}
function restoreClearedTmpGfrContext(event) {
  const saved = event?.clcrPreservedTmpGfrContext;
  if (event?.clcrClearedFormula !== "TMP_GFR" || !saved || typeof saved !== "object" || Array.isArray(saved)) return;
  const keys = ["age", "ageMonths", "ageDays", "sex", "Ucr_spot_unit", "Scr_spot_unit", "U_PO4_spot_unit", "S_PO4_spot_unit", "creatinineState", "tmpBurosumab"];
  for (const id of ["spotDiureticUse", "spotKnownCKD", "suspectedAKI", "spotBicarbonateLoad"]) keys.push(id, "ui_" + id + "_answer");
  const values = Object.fromEntries(keys.filter(id => Object.prototype.hasOwnProperty.call(saved, id) && ["string", "boolean", "number"].includes(typeof saved[id])).map(id => [id, saved[id]]));
  // Clear starts a new paired blood/urine sample. Neither old confirmations
  // nor known mismatches or the prior dose interval describe the new sample.
  Object.assign(values, { U_PO4_spot: "", S_PO4_spot: "", Ucr_spot: "", Scr_spot: "", tmpDaysSinceDose: "",
    FENa_sample_status: "", spotSampleKind: "", spotSameSpecimen: false, ui_spotSameSpecimen_answer: "",
    spotPairedChemistry: false, ui_spotPairedChemistry_answer: "", tmpPairedSameTime: false, ui_tmpPairedSameTime_answer: "",
    tmpOvernightFasting: false, ui_tmpOvernightFasting_answer: "" });
  const vault = window.__vildaClcrVersionValueVault && typeof window.__vildaClcrVersionValueVault === "object" ? window.__vildaClcrVersionValueVault : (window.__vildaClcrVersionValueVault = {});
  for (const [id, value] of Object.entries(values)) {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value === true; else control.value = String(value); }
    vault[id] = value;
  }
}
(function(){const b="vildaClcrSessionV1";function y(){try{if(typeof window<"u"&&window.VildaPersistence)return window.VildaPersistence}catch{}return null}function z(){try{const e=y();return e&&typeof e.isAutosaveSuppressed=="function"&&e.isAutosaveSuppressed()?!0:typeof window>"u"?!1:!!window.__vildaPersistRestoring||Number(window.__vildaPersistPauseUntil||0)>Date.now()}catch{return!1}}function h(){const e=document.getElementById("clcrForm");if(!e)return[];try{return Array.from(e.querySelectorAll("input, select, textarea"))}catch{return Array.from(e.elements||[])}}function _(e){if(!e||e.dataset&&e.dataset.clcrDerivedControl==="true")return"";const t=String(e.type||"").toLowerCase();return t==="button"||t==="submit"||t==="reset"||t==="file"?"":e.id||e.name||""}function j(){try{const e=document.querySelector(".version-option.selected[data-version]");if(e&&e.dataset&&e.dataset.version)return String(e.dataset.version)}catch{}try{if(typeof window<"u"&&window.currentVersion)return String(window.currentVersion)}catch{}return""}function k(e){if(!e)return null;const t=String(e.type||"").toLowerCase();return t==="checkbox"?!!e.checked:t==="radio"?e.checked?e.value:void 0:e.value==null?"":String(e.value)}function v(e,t){if(!e)return;const r=String(e.type||"").toLowerCase();r==="checkbox"?e.checked=!!t:r==="radio"?e.checked=String(e.value)===String(t)||t===!0:e.value=t==null?"":String(t)}function V(e,t){return!!e&&Object.prototype.hasOwnProperty.call(e,t)}function F(e){return e==null||typeof e=="string"&&e.trim()===""}function p(){try{return typeof window>"u"?{}:((!window.__vildaClcrVersionValueVault||typeof window.__vildaClcrVersionValueVault!="object")&&(window.__vildaClcrVersionValueVault={}),window.__vildaClcrVersionValueVault)}catch{return{}}}function q(){try{const e=p();return Object.keys(e).length>0}catch{return!1}}function C(){try{return!!(window.__vildaClcrPreserveVersionValues||q())}catch{return!1}}function P(e){try{let t=e;const r=document;for(;t&&t!==r;){if(t.style&&t.style.display==="none"||t.hidden)return!1;t=t.parentElement||t.parentNode}}catch{}return!0}function H(e,t){const r=t&&typeof t=="object"?t:{},n=e&&typeof e=="object"?e:{};try{typeof window<"u"&&(window.__vildaClcrVersionValueVault={})}catch{}const o=p();Object.keys(n).forEach(i=>{!i||i==="currentVersion"||(o[i]=n[i])});try{window.__vildaClcrPreserveVersionValues=r.preserve!==!1}catch{}return o}function S(){try{typeof window<"u"&&(window.__vildaClcrVersionValueVault={},window.__vildaClcrPreserveVersionValues=!1)}catch{}return!0}function g(e){const t=e&&typeof e=="object"?e:{};try{if(!t.force&&window.__vildaPersistRestoring)return null}catch{}if(!t.force&&!C())return null;const r=p();h().forEach(n=>{const o=_(n);if(!o||o==="currentVersion")return;const i=k(n);if(i===void 0)return;const u=P(n),c=F(i);!u&&c&&V(r,o)||!u&&c&&!V(r,o)||(r[o]=i)});try{window.__vildaClcrPreserveVersionValues=!0}catch{}return r}function N(e){const t=e&&typeof e=="object"?e:{};if(!C())return!1;const r=p();let n=!1;return h().forEach(o=>{const i=_(o);!i||!V(r,i)||t.visibleOnly!==!1&&!P(o)||(v(o,r[i]),n=!0)}),n}function J(e){!e||typeof e.dispatchEvent!="function"||["input","change"].forEach(t=>{try{e.dispatchEvent(new Event(t,{bubbles:!0}))}catch{}})}function m(e){const t=document.getElementById(e);if(!t||!t.children)return[];const r=[];return Array.from(t.children).forEach(n=>{const o=(n.textContent||"").trim().replace(/\u00A0/g," ");if(!o)return;const i=n.classList.contains("out-of-range")||n.classList.contains("warn-orange")||n.classList.contains("warn-yellow");r.push({text:o,isOut:i})}),r}function I(){if(!document.getElementById("clcrForm"))return null;const t=j(),r=(document.getElementById("formulaPicker")||{}).value||"";if(C())try{g({reason:"build-snapshot"})}catch{}const n=p(),o={version:2,legacyVersion:1,source:"kalkulator-klirens.html",savedAtISO:new Date().toISOString(),currentVersion:t,selectedFormula:r,preserveAcrossVersions:!!C(),preservedInputs:Object.assign({},n),inputs:{},summary:{clcr:m("clcrInfo"),elec:m("elecInfo"),stone:m("stoneInfo"),ktv:[].concat(m("ktvResult")).concat(m("ektvResult"))}};return Object.keys(n||{}).forEach(i=>{!i||i==="currentVersion"||(o.inputs[i]=n[i])}),h().forEach(i=>{const u=_(i);if(!u)return;const c=k(i);if(c===void 0)return;const d=P(i),w=F(c);(d||!w||!V(o.inputs,u))&&(o.inputs[u]=c)}),o.inputs.currentVersion=t,o.inputs.formulaPicker=r,o}function f(e){if(!(e&&typeof e=="object"?e:{}).force&&z())return!1;const r=I();if(!r)return!1;const n=y();if(n&&typeof n.writeClcrSession=="function")return!!n.writeClcrSession(r);try{if(typeof window<"u"&&window.sessionStorage)return window.sessionStorage.setItem(b,JSON.stringify(r)),!0}catch{}return!1}function L(e){const t=e&&typeof e=="object"?e:{};try{const r=document.getElementById("prevClcrCard");r&&r.parentNode&&r.parentNode.removeChild(r);const n=document.getElementById("clcrForm");n&&n.classList.remove("has-prev-clcr");const o=document.getElementById("prevClcrPlaceholder");o&&(o.style.display=t.showPlaceholder===!0?"flex":"none"),typeof window.setupPrevClcrCardHeight=="function"&&window.setupPrevClcrCardHeight();try{window.dispatchEvent(new Event("resize"))}catch{}}catch{}}function x(){const e=y();if(e&&typeof e.readClcrSession=="function")return e.readClcrSession();try{if(typeof window<"u"&&window.sessionStorage){const t=window.sessionStorage.getItem(b);return t?JSON.parse(t):null}}catch{}return null}function U(e){if(!e||typeof e!="object")return null;e=prepareTmpGfrSession(e);const t=e.inputs&&typeof e.inputs=="object"?e.inputs:e.preservedInputs&&typeof e.preservedInputs=="object"&&(e.selectedFormula==="FENa_spot"||e.preservedInputs.formulaPicker==="FENa_spot"||e.selectedFormula==="FEK_spot"||e.preservedInputs.formulaPicker==="FEK_spot"||e.selectedFormula==="FECl_spot"||e.preservedInputs.formulaPicker==="FECl_spot"||e.selectedFormula==="FEHCO3_spot"||e.preservedInputs.formulaPicker==="FEHCO3_spot"||e.selectedFormula==="AGu_spot"||e.preservedInputs.formulaPicker==="AGu_spot"||e.selectedFormula==="CitCr_spot"||e.preservedInputs.formulaPicker==="CitCr_spot"||Object.prototype.hasOwnProperty.call(e.preservedInputs,"Cit_Cr_spot")||Object.prototype.hasOwnProperty.call(e.preservedInputs,"CitCr_reported"))?{}:null;if(!t)return null;const r=e.currentVersion||t.currentVersion||e.calculatorVersion||"",n=e.selectedFormula||t.formulaPicker||t.formula||(["FENa_spot","FEK_spot","FECl_spot","FEHCO3_spot","AGu_spot"].includes((e.preservedInputs||{}).formulaPicker)?e.preservedInputs.formulaPicker:"");return Object.assign({},e,{currentVersion:r,selectedFormula:n,inputs:t})}function M(e){const t={basic:!0,advanced:!0,spot:!0,pro:!0},r=e&&e.currentVersion?String(e.currentVersion):"";if(t[r])return r;const n=e&&e.selectedFormula?String(e.selectedFormula):"";if(n&&Array.isArray(window.FORMULAS))try{const o=window.FORMULAS.find(i=>i&&i.id===n&&i.version);if(o&&t[String(o.version)])return String(o.version)}catch{}try{if(e&&e.inputs&&e.inputs.ktvToggle===!0)return"pro"}catch{}return j()}function E(e,t){const r=t&&typeof t=="object"?t:{},n=U(e);if(!n)return!1;normalizeCrCysConfirmation(n);normalizeCl24SessionInputs(n);normalizeAcrSessionInputs(n);normalizePcrSessionInputs(n);normalizeCacrSessionInputs(n);normalizeOxcrSessionInputs(n);normalizeCitcrSessionInputs(n);normalizeTmpGfrSessionInputs(n);normalizeFeclSessionInputs(n);normalizeFehco3SessionInputs(n);normalizeFenaSessionInputs(n);normalizeFekSessionInputs(n);normalizeUagSessionInputs(n);const o=document.getElementById("clcrForm");if(!o)return!1;let i=!1,u=0;try{i=!!window.__vildaPersistRestoring,u=Number(window.__vildaPersistPauseUntil||0),window.__vildaPersistRestoring=!0,window.__vildaPersistPauseUntil=Math.max(u,Date.now()+800)}catch{}try{clearMissingCl24ProtocolAnswers(n);const c={};let d=null;if(r.source==="autosave")try{const s=y(),l=s&&typeof s.readShared=="function"?s.readShared({ensurePersist:!1})||{}:{},Y={fullName:"name",age:"age",ageMonths:"ageMonths",weight:"weight",height:"height",sex:"sex"};d={},Object.keys(Y).forEach(R=>{const A=l[Y[R]];A!=null&&String(A).trim()!==""&&(c[R]=!0,d[R]=String(A))}),Object.keys(d).length||(d=null)}catch{}if(Object.prototype.hasOwnProperty.call(n.inputs,"samePatientMode")){const s=document.getElementById("samePatientMode");s&&v(s,n.inputs.samePatientMode)}try{const s=Object.assign({},n.preservedInputs||{},n.inputs||{});Object.keys(c).forEach(l=>{delete s[l]}),H(s,{preserve:r.preserveAcrossVersions!==!1})}catch{}const w=M(n);if(w&&typeof window.setVersion=="function")try{window.setVersion(w)}catch{}else if(w&&typeof window.applyVersion=="function")try{window.applyVersion(w)}catch{}if(Object.keys(n.inputs).forEach(s=>{if(s==="currentVersion"||c[s])return;const l=document.getElementById(s)||(o.elements&&typeof o.elements.namedItem=="function"?o.elements.namedItem(s):null);l&&(v(l,n.inputs[s]),r.dispatchEvents&&J(l))}),d&&Object.keys(d).forEach(s=>{const l=document.getElementById(s);l&&v(l,d[s])}),n.selectedFormula){const s=document.getElementById("formulaPicker");s&&(s.value=String(n.selectedFormula))}try{const s=window.ClcrUiWorkflow;s&&typeof s.refresh=="function"?s.refresh():s&&typeof s.restore=="function"&&s.restore()}catch{}try{g({reason:r.source||"restore-session",force:!0})}catch{}if(r.hideLoadedSummary&&L({showPlaceholder:r.showPlaceholder===!0}),r.update!==!1){if(typeof window.clcrUpdate=="function")try{window.clcrUpdate()}catch{}else if(typeof window.update=="function")try{window.update()}catch{}if(typeof window.syncClcrReportVisibility=="function")try{window.syncClcrReportVisibility()}catch{}}if(r.writeSession)try{f({force:!0})}catch{}const T=document.getElementById("restoreStateBtn");/* KLIRENS-JAWNE-ODTWORZENIE: preview is not ownership; only an applied restore rebinds the specimen. */if(r.source==="json-restore")window.ClcrVisitSave?.markRestoredPatientCalculation?.();return T&&r.hideRestoreButton&&(T.style.display="none"),!0}finally{try{window.__vildaPersistRestoring=i,window.__vildaPersistPauseUntil=u}catch{}}}function O(e){try{const t=x();return E(t,Object.assign({source:"autosave",hideLoadedSummary:!1,update:!0},e||{}))}catch{return!1}}function a(){a._timer&&clearTimeout(a._timer),a._timer=setTimeout(()=>f(),300)}function K(e){if(!e||e.__vildaClcrAutosaveBound)return;e.__vildaClcrAutosaveBound=!0,e.addEventListener("input",a),e.addEventListener("change",a);const t=document.getElementById("versionContainer");t&&t.addEventListener("click",a);const r=document.getElementById("formulaPicker");r&&r.addEventListener("change",a)}function B(){try{a._timer&&(clearTimeout(a._timer),a._timer=null),f({force:!0,reason:"page-exit"})}catch{}}try{window.addEventListener("pagehide",B),window.addEventListener("beforeunload",B),document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&B()})}catch{}document.addEventListener("DOMContentLoaded",()=>{const e=document.getElementById("clcrForm");if(!e)return;K(e),setTimeout(()=>{O();try{const r=document.getElementById("restoreStateBtn");r&&!r.__vildaRestoreStateButtonBound&&(r.style.display="none")}catch{}},0);const t=document.getElementById("clearBtn");t&&t.addEventListener("click",event=>{try{S()}catch{}try{clearCl24InputContext();clearAcrInputContext();clearPcrInputContext();clearCacrInputContext();clearOxcrInputContext();clearCitcrInputContext();clearFenaInputContext();clearFekInputContext();clearTmpGfrInputContext();clearFeclInputContext();clearFehco3InputContext();clearUagInputContext();clearMissingAcrSampleContext();clearMissingCacrKnownContext();restoreClearedFeclContext(event);restoreClearedTmpGfrContext(event);restoreClearedFehco3Context(event);restoreClearedUagContext(event)}catch{}try{const r=y();r&&typeof r.clearClcrSession=="function"?r.clearClcrSession():typeof window<"u"&&window.sessionStorage&&window.sessionStorage.removeItem(b)}catch{}try{if(typeof window.resetLoadedComparisonUiResidue=="function")window.resetLoadedComparisonUiResidue();else{window.lastLoadedData=null;const r=document.getElementById("restoreStateBtn");r&&(r.style.display="none")}}catch{}})});const Q={fullName:!0,age:!0,ageMonths:!0,weight:!0,height:!0,sex:!0};function X(e){if(!e)return!1;const t=String(e.tagName||"").toUpperCase();if(t==="TEXTAREA")return!0;if(t!=="INPUT")return!1;const r=String(e.type||"text").toLowerCase();return r==="text"||r==="number"||r==="search"||r==="tel"}function G(){let e=0;return h().forEach(t=>{const r=_(t);if(!(!r||Q[r]===!0)&&X(t)&&!(t.value===""||t.value==null))try{t.value="",e+=1}catch{}}),e}function D(){try{const e=x();if(U(e))return E(e,{source:"autosave",update:!0,hideLoadedSummary:!1,hideRestoreButton:!1,dispatchEvents:!1});try{S()}catch{}if(clearCrCysConfirmation(),clearCl24InputContext(),clearAcrInputContext(),clearPcrInputContext(),clearCacrInputContext(),clearOxcrInputContext(),clearCitcrInputContext(),clearFenaInputContext(),clearFekInputContext(),clearTmpGfrInputContext(),clearFeclInputContext(),clearFehco3InputContext(),clearUagInputContext(),clearMissingAcrSampleContext(),clearMissingCacrKnownContext(),G(),typeof window.clcrUpdate=="function")try{window.clcrUpdate()}catch{}else if(typeof window.update=="function")try{window.update()}catch{}try{f({force:!0})}catch{}return!0}catch{return!1}}window.__vildaClcrRehydrate=D,window.buildClcrSessionSnapshot=I,window.saveClcrSession=f,window.restoreClcrSession=O,window.applyClcrSessionSnapshot=E,window.hideLoadedClcrSummaryCard=L,window.clcrSaveSessionNow=f,window.clcrCaptureVersionValues=g,window.clcrRestoreVersionValues=N,window.clcrClearVersionValueVault=S,window.VildaClcrSessionRuntime=Object.freeze({__vildaClcrSessionRuntime:!0,version:"1.1.3",step:"8Q-4c2",collectCurrentSession:I,saveNow:f,restoreAutosavedSession:O,restoreFromSession:E,hidePreviousCard:L,resolveVersion:M,captureVersionValues:g,restoreVersionValues:N,clearVersionValueVault:S,rehydrateAfterExternalLoad:D})})();
