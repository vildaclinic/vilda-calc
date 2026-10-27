import { test } from "vitest";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const engine = require("../../clcr_tmp_gfr.js");
const { DEFAULT_POLICY: policy } = require("../../clcr_tmp_gfr_reference_data.js");
const legacy = require("../../clcr_clinical_safety.js");
const base = Object.freeze({ ageYears: 10, sex: "M", serumPhosphate: 1.1, serumPhosphateUnit: "mmol/L", urinePhosphate: 20, urinePhosphateUnit: "mmol/L", serumCreatinine: 50, serumCreatinineUnit: "µmol/L", urineCreatinine: 5, urineCreatinineUnit: "mmol/L", burosumab: true, daysSinceDose: 14, clinicalDate: "2026-10-26", patientId: "synthetic-tmp" });
const evaluate = (change = {}, options = {}) => engine.evaluate({ ...base, ...change }, policy, options);
const before = (change = {}) => evaluate({ clinicalDate: "2026-09-28", serumPhosphate: 0.8, ...change });
const values = Object.freeze({ age: "10", ageMonths: "", ageDays: "", sex: "M", U_PO4_spot: "20", U_PO4_spot_unit: "mmol/L", S_PO4_spot: "1.8", S_PO4_spot_unit: "mmol/L", Scr_spot: "50", Scr_spot_unit: "umol", Ucr_spot: "5", Ucr_spot_unit: "mmol/L", tmpBurosumab: true, tmpDaysSinceDose: "14" });
const close = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should equal ${expected}`);

test("GPN synthetic child calculation keeps independent TmP, TRP and serum assessments", () => {
  const result = evaluate({ serumPhosphate: 1.8 });
  close(result.rawValue, 1.6); close(result.trp, 8 / 9); close(result.fePo4, 1 / 9);
  assert.equal(result.display.text, "1,60");
  assert.equal(result.status, "within"); assert.equal(result.tone, "success");
  assert.equal(result.serumPhosphate.status, "above"); assert.equal(result.serumPhosphate.tone, "danger");
  assert.equal(result.trpResult.display.text, "88,9"); assert.equal(result.trpResult.tone, "neutral");
  assert.equal(result.reference.lower, 0.97); assert.equal(result.reference.upper, 1.64);
  assert.equal(result.reference.unit, "mmol/L"); assert.equal(result.referenceText, "0,97–1,64");
  assert.equal(result.trpResult.referenceText, "85–95%");
});

test("therapy toggle never changes numeric, reference or primary result tone", () => {
  for (const serumPhosphate of [1.1, 1.17, 1.4, 1.8, 1.9]) {
    const yes = evaluate({ serumPhosphate }), no = evaluate({ serumPhosphate, burosumab: false });
    for (const key of ["rawValue", "status", "tone", "referenceText"]) assert.equal(yes[key], no[key]);
    assert.deepEqual(yes.reference, no.reference); assert.equal(no.treatment.enabled, false);
  }
});

test("phosphate and creatinine unit combinations yield the same production result", () => {
  const phosphorus = [[1.8, "mmol/L"], [1.8 * 3.097, "mg/dL"], [1.8 * 3.097, "mg/dl"]];
  const urinePhosphorus = [[20, "mmol/L"], [20 * 3.097, "mg/dl"]];
  const serumCreatinine = [[50, "µmol/L"], [50, "μmol/L"], [50, "umol"], [0.05, "mmol/L"], [50 / 88.4, "mg/dl"]];
  const urineCreatinine = [[5, "mmol/L"], [5000, "umol/L"], [5000 / 88.4, "mg/dL"], [50000 / 88.4, "mg/L"]];
  for (const [s, su] of phosphorus) for (const [u, uu] of urinePhosphorus) for (const [c, cu] of serumCreatinine) for (const [r, ru] of urineCreatinine) {
    const result = evaluate({ serumPhosphate: s, serumPhosphateUnit: su, urinePhosphate: u, urinePhosphateUnit: uu, serumCreatinine: c, serumCreatinineUnit: cu, urineCreatinine: r, urineCreatinineUnit: ru });
    assert.equal(result.valid, true); close(result.rawValue, 1.6); assert.equal(result.status, "within"); assert.equal(result.serumPhosphate.status, "above");
  }
});

test("legacy arithmetic remains consistent at the 19-year method switch and TRP branch", () => {
  for (const ageYears of [0, 10, 18.999, 19, 20, 80, 120]) for (const urinePhosphate of [5, 14, 15, 25]) {
    const input = { ...base, ageYears, serumPhosphate: 1, urinePhosphate, urineCreatinine: 10, serumCreatinine: 100, sampleKind: "secondMorning", pairedSameTime: true, overnightFasting: true };
    const old = legacy.computeTmpGfr(input), result = engine.compute(input);
    assert.equal(result.valid, true); close(result.rawValue, old.tmpGfrMmolL); close(result.trp, old.trp); assert.equal(result.method, old.method); assert.equal(result.branch, old.branch);
  }
  close(evaluate({ ageYears: 18.999, serumPhosphate: 1, urinePhosphate: 5, urineCreatinine: 10, serumCreatinine: 100 }).rawValue, 0.95);
  close(evaluate({ ageYears: 19, serumPhosphate: 1, urinePhosphate: 5, urineCreatinine: 10, serumCreatinine: 100 }).rawValue, 1.1875);
});

test("urine phosphate zero is a valid boundary, zero denominators and inconsistent FE are rejected", () => {
  const noExcretion = evaluate({ urinePhosphate: 0 });
  assert.equal(noExcretion.valid, true); assert.equal(noExcretion.trp, 1); close(noExcretion.rawValue, 1.1);
  const completeExcretion = evaluate({ serumPhosphate: 1, urinePhosphate: 100 });
  assert.equal(completeExcretion.valid, true); assert.equal(completeExcretion.rawValue, 0); assert.equal(completeExcretion.trp, 0);
  for (const key of ["serumPhosphate", "serumCreatinine", "urineCreatinine"]) assert.equal(evaluate({ [key]: 0 }).errorCode, "invalid-concentration");
  assert.equal(evaluate({ serumPhosphate: 1, urinePhosphate: 101 }).errorCode, "invalid-fraction");
});

test("invalid numeric data never becomes an assumed zero or a valid snapshot", () => {
  for (const value of [" ", null, undefined]) assert.equal(evaluate({ urinePhosphate: value }).errorCode, "missing-concentration");
  for (const value of [-1, "-0.01", true, {}, [], Infinity, NaN, "1,2,3", "0x10", "1e-999", "1e999", "<2"]) assert.equal(evaluate({ urinePhosphate: value }).valid, false, String(value));
  assert.equal(evaluate({ urinePhosphateUnit: "mg/24h" }).valid, false);
  assert.equal(evaluate({ ageYears: null }).errorCode, "missing-age");
  for (const value of [-1, 121, true, "abc"]) assert.equal(evaluate({ ageYears: value }).errorCode, "invalid-age");
  assert.equal(evaluate({ serumPhosphate: "1,8" }).valid, true);
  assert.notEqual(engine.formatValue(0.00001), "0,00"); assert.match(engine.formatValue(0.00001), /e-5/);
});

test("threshold comparison absorbs machine noise but not a clinically distinct rounded value", () => {
  assert.equal(evaluate({ serumPhosphate: 1.17 }).status, "within");
  assert.equal(evaluate({ serumPhosphate: 1.16999999 }).status, "below");
  assert.equal(evaluate({ serumPhosphate: 1.84 }).status, "within");
  assert.equal(evaluate({ serumPhosphate: 1.84000001 }).status, "above");
  const upper = 5.4 / 3.097;
  assert.equal(evaluate({ serumPhosphate: upper }).serumPhosphate.status, "within");
  assert.equal(evaluate({ serumPhosphate: upper + 1e-8 }).serumPhosphate.status, "above");
});

test("source-specific age coverage never mixes Brodehl and Walton reference ranges", () => {
  for (const [ageYears, lower, upper] of [[0, 1.02, 2], [5 / 12, 1.02, 2], [0.5, 1.13, 1.88], [11 / 12, 1.13, 1.88], [13 / 12, 1.05, 1.78], [5.999, 1.05, 1.78], [6, 0.97, 1.64], [12.999, 0.97, 1.64], [13, 0.91, 1.68], [15.999, 0.91, 1.68], [16, 0.84, 1.23], [18.999, 0.84, 1.23], [19.01, 0.7, 1.35], [20, 0.7, 1.35], [120, 0.7, 1.35]]) {
    const result = evaluate({ ageYears }); assert.equal(result.reference.lower, lower); assert.equal(result.reference.upper, upper); assert.equal(result.reference.method, result.method);
  }
  for (const ageYears of [1, 1.05]) { const result = evaluate({ ageYears }); assert.equal(result.reference, null); assert.equal(result.referenceAlternatives.length, 2); assert.equal(result.status, "unassessed"); }
  const exactly19 = evaluate({ ageYears: 19 }); assert.equal(exactly19.reference, null); assert.equal(exactly19.method, "Walton–Bijvoet/Payne");
  assert.equal(engine.evaluate(engine.inputFromValues({ ...values, age: "19", ageMonths: "" }), policy).reference, null);
  assert.equal(engine.evaluate(engine.inputFromValues({ ...values, age: "19", ageMonths: "1" }), policy).reference.sourceId, "AACB_ANZBMS_2025");
});

test("Mayo sex-specific references use unrounded conversions and leave infants unassessed", () => {
  for (const [ageYears, sex, lower, upper] of [[1, "M", 4.3, 5.4], [4.99, "M", 4.3, 5.4], [5, "M", 3.7, 5.4], [13.99, "M", 3.7, 5.4], [14, "M", 3.5, 5.3], [16, "M", 3.1, 4.7], [18, "M", 2.5, 4.5], [1, "F", 4.3, 5.4], [7.99, "F", 4.3, 5.4], [8, "F", 4, 5.2], [14, "F", 3.5, 4.9], [16, "F", 3.1, 4.7], [18, "F", 2.5, 4.5]]) {
    const reference = evaluate({ ageYears, sex }).serumPhosphate.reference; close(reference.lower, lower / 3.097); close(reference.upper, upper / 3.097);
  }
  assert.equal(evaluate({ ageYears: 0.99 }).serumPhosphate.reference, null);
  assert.equal(evaluate({ sex: null }).serumPhosphate.status, "unassessed");
  for (const ageYears of [1.5, 3, 16, 18, 100]) assert.ok(evaluate({ ageYears, sex: null }).serumPhosphate.reference);
});

test("norms are injected policy data, never a hidden engine fallback", () => {
  const unavailable = engine.evaluate(base, null); assert.equal(unavailable.valid, true); assert.equal(unavailable.reference, null); assert.equal(unavailable.status, "unassessed");
  const changed = structuredClone(policy); changed.id = "SYNTHETIC_TEST_POLICY"; changed.profiles = changed.profiles.map(item => item.id === "GPN_6_12_YEARS" ? { ...item, lower: 0.5, upper: 2.5 } : item);
  const result = engine.evaluate(base, changed); assert.equal(result.status, "within"); assert.equal(result.reference.lower, 0.5); assert.equal(result.policy.id, changed.id);
  assert.equal(policy.profiles.find(item => item.id === "GPN_6_12_YEARS").lower, 0.97);
});

test("known sample contradictions survive simplified inputs and hidden legacy fields", () => {
  for (const evidence of [{ ui_spotSameSpecimen_answer: "no" }, { ui_spotPairedChemistry_answer: "no" }, { ui_tmpPairedSameTime_answer: "no" }, { FENa_sample_status: "different-urine" }, { FENa_sample_status: "different-time" }]) {
    const input = engine.inputFromValues({ ...values, ...evidence }); assert.equal(engine.evaluate(input, policy).errorCode, "different-specimens");
  }
  const assumed = engine.inputFromValues({ ...values, tmpPairedSameTime: false, tmpOvernightFasting: false });
  assert.equal(assumed.pairedSameTime, "assumed"); assert.equal(engine.evaluate(assumed, policy).valid, true);
  const noOvernight = engine.inputFromValues({ ...values, ui_tmpOvernightFasting_answer: "no" });
  assert.equal(noOvernight.overnightFasting, false); assert.equal(engine.evaluate(noOvernight, policy).valid, true);
  assert.equal(engine.evaluate(noOvernight, policy).cautions.length, 0, "No overnight fast does not establish a nonfasting sample");
  const context = engine.inputFromValues(values, { clinicalDateISO: "2026-10-26" }); assert.equal(context.clinicalDate, "2026-10-26"); assert.equal(context.daysSinceDose, 14);
});

test("document reader preserves hidden vault facts without inventing positive checkbox evidence", () => {
  const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, typeof value === "boolean" ? { type: "checkbox", checked: value } : { type: "text", value }]));
  const documentRef = { defaultView: { __vildaClcrVersionValueVault: { ui_tmpPairedSameTime_answer: "no", spotKnownCKD: true } }, getElementById: id => controls[id] || null };
  const result = engine.evaluate(engine.readInputFromDocument(documentRef), policy);
  assert.equal(result.errorCode, "different-specimens"); assert.equal(result.knownFacts.knownCKD, true);
});

test("comparable numeric trends describe change without claiming efficacy, including high serum phosphate", () => {
  for (const [serumPhosphate, direction] of [[0.7, "down"], [0.8, "same"], [1.1, "up"], [1.8, "up"], [1.9, "up"]]) {
    const result = evaluate({ serumPhosphate }, { previous: before() });
    assert.equal(result.treatment.comparisonAllowed, true); assert.equal(result.treatment.direction, direction);
    assert.match(result.treatment.limitations.join(" "), /nie rozstrzyga o skuteczności/);
    assert.doesNotMatch(result.treatment.trendMessage, /poprawę|poprawa|skuteczny|nieskuteczny/);
    if (serumPhosphate >= 1.8) { assert.equal(result.treatment.tone, "danger"); assert.match(result.treatment.message, /ocena bezpieczeństwa/); }
    if (serumPhosphate === 1.9) assert.match(result.treatment.cautions.join(" "), /nie traktuj wzrostu jako celu/);
  }
  assert.equal(evaluate({ daysSinceDose: 7 }, { previous: before({ daysSinceDose: 7 }) }).treatment.comparisonAllowed, true, "14 days is not a fabricated comparability gate");
  assert.equal(evaluate({ serumPhosphate: 0.800001 }, { previous: before() }).treatment.direction, "up", "No clinical stable cutoff");
});

test("serum safety warning remains independent of missing or incomparable history", () => {
  for (const [previous, reason] of [[null, "no-history"], [before({ method: "ignored", ageYears: 20 }), "method-change"], [before({ burosumab: false }), "unknown-treatment"], [before({ daysSinceDose: null }), "missing-timing"], [before({ daysSinceDose: 7 }), "different-timing"], [before({ clinicalDate: "2026-10-26" }), "ambiguous-date"], [before({ clinicalDate: "2026-10-27" }), "ambiguous-date"], [before({ patientId: "other-synthetic" }), "different-patient"], [before({ knownAKI: true }), "clinical-context"]]) {
    const result = evaluate({ serumPhosphate: 1.8 }, { previous }); assert.equal(result.treatment.comparisonAllowed, false); assert.equal(result.treatment.reason, reason); assert.equal(result.treatment.direction, null); assert.match(result.treatment.message, /bezpieczeństwa/); assert.ok(result.treatment.trendMessage);
  }
  for (const reason of ["history-loading", "history-unavailable", "patient-unavailable", "no-patient", "missing-date", "unknown-previous-context", "no-earlier-result", "ambiguous-date"]) {
    const result = evaluate({}, { comparisonReason: reason }); assert.equal(result.treatment.reason, reason); assert.ok(result.treatment.trendMessage);
  }
});

test("treatment chronology validates literal calendar dates, including leap years and normalized invalid dates", () => {
  for (const [priorDate, clinicalDate] of [["2024-02-28", "2024-02-29"], ["2000-02-29", "2000-03-01"], ["2026-04-30", "2026-05-01"], ["2026-12-31", "2027-01-01"]]) {
    const result = evaluate({ clinicalDate }, { previous: before({ clinicalDate: priorDate }) });
    assert.equal(result.treatment.comparisonAllowed, true, `${priorDate} → ${clinicalDate}`);
    assert.equal(result.treatment.comparison.current.date, clinicalDate);
    assert.equal(result.treatment.comparison.previous.date, priorDate);
  }
  for (const clinicalDate of ["2026-02-29", "1900-02-29", "2100-02-29", "2024-02-30", "2026-04-31", "2026-00-10", "2026-13-01", "2026-01-00", "2026-01-32", "2026-1-02", "2026-01-02T00:00:00Z", " 2026-01-02"]) {
    const currentInvalid = evaluate({ clinicalDate }, { previous: before({ clinicalDate: "1899-01-01" }) });
    assert.equal(currentInvalid.treatment.reason, "ambiguous-date", `Invalid current date ${clinicalDate}`);
    const priorInvalid = evaluate({ clinicalDate: "2101-01-01" }, { previous: before({ clinicalDate }) });
    assert.equal(priorInvalid.treatment.reason, "ambiguous-date", `Invalid prior date ${clinicalDate}`);
  }
});

test("date-only comparison keeps the same clinical days in positive and negative UTC offsets", () => {
  const enginePath = fileURLToPath(new URL("../../clcr_tmp_gfr.js", import.meta.url));
  const policyPath = fileURLToPath(new URL("../../clcr_tmp_gfr_reference_data.js", import.meta.url));
  const source = `const engine = require(${JSON.stringify(enginePath)}); const policy = require(${JSON.stringify(policyPath)}).DEFAULT_POLICY; const input = ${JSON.stringify(base)}; const previous = engine.evaluate({...input, clinicalDate:'2026-10-25'}, policy); const result = engine.evaluate(input, policy, {previous}); process.stdout.write(JSON.stringify({allowed:result.treatment.comparisonAllowed,current:result.treatment.comparison.current.date,previous:result.treatment.comparison.previous.date}));`;
  for (const timezone of ["UTC", "Europe/Warsaw", "Pacific/Kiritimati", "America/Los_Angeles"]) {
    const result = JSON.parse(execFileSync(process.execPath, ["-e", source], { encoding: "utf8", env: { ...process.env, TZ: timezone } }));
    assert.deepEqual(result, { allowed: true, current: "2026-10-26", previous: "2026-10-25" }, timezone);
  }
});

test("known renal facts and unknown timing limit comparison without erasing numbers or current serum alert", () => {
  for (const change of [{ knownAKI: true }, { knownCKD: true }, { rapidlyChangingCreatinine: true }]) {
    const result = evaluate({ serumPhosphate: 1.8, ...change }, { previous: before() }); assert.equal(result.valid, true); assert.equal(result.treatment.reason, "clinical-context"); assert.ok(result.cautions.length); assert.equal(result.serumPhosphate.status, "above");
    for (const caution of result.cautions) assert.ok(!result.treatment.cautions.includes(caution), "Do not repeat the same renal caution in two visible sections");
  }
  for (const daysSinceDose of [null, "", -1, "abc"]) assert.equal(evaluate({ daysSinceDose }, { previous: before() }).treatment.reason, "missing-timing");
  for (const daysSinceDose of [-1, "abc"]) {
    const result = evaluate({ daysSinceDose }, { previous: before() });
    assert.equal(result.valid, true); assert.equal(result.input.daysSinceDose, null); assert.equal(result.input.daysSinceDoseState, "invalid"); assert.equal(result.input.daysSinceDoseRaw, daysSinceDose); assert.match(result.treatment.cautions.join(" "), /nieujemną liczbą/);
  }
  assert.match(evaluate({ ageYears: 30 }).treatment.limitations[0], /sprawność/); assert.doesNotMatch(evaluate({ ageYears: 30 }).treatment.limitations[0], /wzrastanie|krzywicy/);
  assert.match(evaluate({ ageYears: 0.5 }).treatment.message, /Brak dopasowanej normy/);
});

test("cross-product of source states and trend directions has independent assessments", () => {
  // Inputs are generated from desired physiological fractions; the tested engine
  // still performs all arithmetic and assessments itself.
  for (const serumPhosphate of [1.1, 1.4, 1.8]) for (const trp of [0.2, 0.8, 0.95]) for (const priorFactor of [0.7, 1, 1.1]) {
    const urinePhosphate = serumPhosphate * 5 * (1 - trp) / 0.05;
    const current = evaluate({ serumPhosphate, urinePhosphate });
    const prior = before({ serumPhosphate: serumPhosphate * priorFactor, urinePhosphate: urinePhosphate * priorFactor });
    const result = evaluate({ serumPhosphate, urinePhosphate }, { previous: prior });
    assert.equal(result.valid, true); assert.equal(result.status, current.status); assert.equal(result.tone, current.tone); assert.equal(result.serumPhosphate.status, current.serumPhosphate.status); assert.equal(result.trpResult.tone, "neutral");
    assert.equal(result.treatment.comparisonAllowed, true); assert.doesNotMatch(result.treatment.trendMessage, /poprawę|skuteczny|nieskuteczny/);
  }
});

test("snapshots are frozen, serializable and keep the policy used at calculation time", () => {
  const result = evaluate({}, { previous: before() });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.input)); assert.ok(Object.isFrozen(result.reference)); assert.ok(Object.isFrozen(result.treatment));
  assert.equal(result.schema, "clcr-tmp-gfr"); assert.equal(result.version, 1); assert.equal(result.policy.id, policy.id);
  assert.throws(() => { result.reference.lower = 0; }, TypeError);
});
