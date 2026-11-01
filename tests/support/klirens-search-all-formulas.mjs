import { readFileSync } from 'node:fs';
import { loadBrowserScript } from './load-browser-script.mjs';

// Explicit coverage manifest: every persisted parameter in the production
// ClcrSavedResults.PARAM_DICTIONARY (45 outputs from 41 source formula IDs).
// The matching test compares both sets with the live registry, so extending
// the calculator requires extending this fixture deliberately.
export const KLIRENS_SEARCH_PARAMETER_KEYS = Object.freeze([
  'egfr', 'ckid_u25', 'egfr_cr_cys', 'ckid_u25_cys', 'ckid_u25_cr_cys', 'neonatal_egfr', 'cg', 'cg_norm', 'cl24', 'sch_idms',
  'Ca_mgkg', 'UA_mgkg', 'Mg_mgkg', 'PO4_mgkg', 'Ox_mgkg', 'Cit_mgkg', 'Na_mmol_d', 'K_mmol_d',
  'Ca_Cr', 'KM_Cr', 'PO4_Cr', 'Mg_Ca', 'Ca_Cit', 'B_Cr', 'K_frac', 'AGs',
  'Prot_mg24', 'Prot_g24', 'Prot_bsa', 'CaCr_spot', 'OxCr_spot', 'CitCr_spot', 'ACR', 'PCR',
  'FENa_spot', 'FEK_spot', 'FECl_spot', 'FEHCO3_spot', 'AGu_spot', 'TMP_GFR', 'pH_spot', 'pH24',
  'KTV_spktv', 'KTV_ektv', 'KTV_urr',
]);
export const KLIRENS_SEARCH_DATE = '2026-07-28';

export function createKlirensSearchEnvironment() {
  const root = {};
  // Use the production reader/editor dependency manifest, preserving its order.
  // UI-only modules need a DOM and play no part in producing frozen records.
  const source = readFileSync(new URL('../../clcr_record_resources.js', import.meta.url), 'utf8');
  const files = [...source.matchAll(/\["(clcr_[^"?]+\.js)\?v=[^"]+",\s*"[^"\n]+"\]/g)].map(match => match[1]);
  for (const file of files.filter(file => !['clcr_saved_results_view.js', 'clcr_result_details.js'].includes(file))) loadBrowserScript(file, root);
  loadBrowserScript('clcr_notes_view.js', root);
  loadBrowserScript('vilda_global_search.js', root);
  return root;
}

const protocol = Object.fromEntries(['collectionStartVoidDiscarded', 'collectionFinalVoidIncluded', 'collectionNoMissedVoids',
  'collectionNoSpillage', 'collectionNoExtraVoids', 'collectionStorageFollowed'].map(key => [key, true]));
const timed = {
  age: '45', ageMonths: '0', sex: 'M', weight: '50', height: '150', Scr: '1', ScrUnit: 'mg/dl', ScrAssay: 'enzymatic_idms', creatinineState: 'stable',
  collectionStartAt: '2026-07-20T08:00', collectionEndAt: '2026-07-21T08:00', Cl24DurationHours: '24', Cl24DurationSource: 'hours',
  V24: '1500', Ucr: '100', U_UA: '20', U_Ca: '2', U_Mg: '20', U_PO4: '10', U_Ox: '0.2', U_Cit: '5', U_Na: '60', U_K: '40', U_Prot: '300',
  CA_collectionHours: '24', UA_collectionHours: '24', MG_collectionHours: '24', PO4_collectionHours: '24',
  ...protocol,
};
const spot = { age: '10', ageMonths: '0', sex: 'F', height: '140', weight: '35', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', Scr_spot: '0.6', Scr_spot_unit: 'mg/dl' };
const gfr = { age: '10', ageMonths: '0', sex: 'F', height: '140', weight: '35', Scr: '0.6', ScrUnit: 'mg/dl', ScrAssay: 'enzymatic_idms', creatinineState: 'stable', CystatinC: '1', CystatinCStandardization: 'ERM-DA471/IFCC', CystatinCAssayMethod: 'nephelometric' };
const dialysis = { ...timed, age: '50', ktvModality: 'IHD', ktvSessionsPerWeek: '3', ktvPidiDays: '2', UreaPre: '120', UreaPost: '36', ktvUreaAnalyte: 'BUN', ktvUreaUnit: 'mg/dL', ktvDurationMinutes: '240', ktvUF: '2', ktvW: '70', ktvAccessType: 'AVF/AVG', ktvTreatmentsDelivered: true, ktvSameSession: true, ktvPreBeforeDialysis: true, ktvPreNoDilution: true, ktvPostMethod: 'slow_flow_100ml_15s' };
const spotExtra = {
  ACR: { U_Alb: '45', U_Alb_unit: 'mg/L', ACR_entry_mode: 'concentration' },
  PCR: { U_Prot_spot: '45', U_Prot_spot_unit: 'mg/L', PCR_entry_mode: 'concentration' },
  CaCr_spot: { Ca_spot: '5', Ca_spot_unit: 'mg/dl', CaCr_entry_mode: 'concentration' },
  OxCr_spot: { Ox_Cr_spot: '100', Ox_Cr_spot_unit: 'umol/L', OxCr_entry_mode: 'concentration' },
  CitCr_spot: { Cit_Cr_spot: '200', Cit_Cr_spot_unit: 'umol/L', CitCr_entry_mode: 'concentration' },
  FENa_spot: { U_Na_spot: '50', S_Na_spot: '140' }, FEK_spot: { U_K_spot: '30', S_K_spot: '4' },
  FECl_spot: { U_Cl_spot: '50', S_Cl_spot: '100' }, FEHCO3_spot: { U_HCO3_spot: '5', S_HCO3_spot: '24' },
  AGu_spot: { U_Na_spot: '20', U_K_spot: '10', U_Cl_spot: '45' },
  TMP_GFR: { U_PO4_spot: '20', U_PO4_spot_unit: 'mg/dl', S_PO4_spot: '4', S_PO4_spot_unit: 'mg/dl', spotSampleKind: 'secondMorning', tmpPairedSameTime: true, tmpOvernightFasting: true },
  pH_spot: { U_pH: '6.1' },
};

const workflowSource = readFileSync(new URL('../../clcr_ui_workflow.js', import.meta.url), 'utf8');
const mapStart = workflowSource.indexOf('  function toNumber(raw) {');
const mapEnd = workflowSource.indexOf('  // Zbiór formuł-źródeł do zapisu', mapStart);
if (mapStart < 0 || mapEnd < mapStart) throw new Error('Missing production Klirens datapoint mapper');
const productionMapper = root => new Function('model', workflowSource.slice(mapStart, mapEnd) + '\nreturn mapDatapoint;')(() => root.ClcrSavedResults);

function baselineValues(entry) {
  const id = entry.sourceFormulaId;
  if (Object.hasOwn(spotExtra, id)) return { ...spot, ...spotExtra[id] };
  if (['egfr', 'egfr_cr_cys'].includes(id)) return { ...gfr, age: '50' };
  if (['ckid_u25', 'ckid_u25_cys', 'ckid_u25_cr_cys', 'sch_idms'].includes(id)) return { ...gfr };
  if (id === 'neonatal_egfr') return { ...gfr, age: '0', ageDays: '10', neonatalTermStatus: 'term', height: '52', weight: '3.5' };
  if (id === 'cg' || id === 'cg_norm') return { ...timed, age: '60', ageMonths: '6', weight: '80', height: '175', Scr: '1.2' };
  if (id === 'cl24') return { ...timed, weight: '70', height: '175', V24: '1440' };
  if (id === 'KTV') return { ...dialysis };
  if (entry.id === 'Prot_bsa') return { ...timed, age: '10' };
  if (id === 'AGs') return { ...timed, S_Na: '140', S_Cl: '105', S_HCO3: '25' };
  if (id === 'pH24') return { ...timed, pH24: '6.1' };
  return { ...timed };
}

function captured(values, formulaId) {
  return { formulaId, values, ageYears: Number(values.age) + Number(values.ageMonths || 0) / 12,
    sourceContext: { creatinineState: values.creatinineState, scrAssay: values.ScrAssay, cystatinCStandardization: values.CystatinCStandardization, cystatinCAssayMethod: values.CystatinCAssayMethod },
    fields: Object.entries(values).map(([id, value]) => ({ id, label: id, type: typeof value === 'boolean' ? 'checkbox' : 'text', required: false })) };
}

function produce(root, entry, values) {
  const seed = { id: entry.id, parameterKey: entry.id, sourceFormulaId: entry.sourceFormulaId, testKey: entry.testKey,
    label: entry.label, valueNum: 1, unit: entry.unit, norm: '', tone: 'neutral' };
  const initial = root.ClcrSavedCalculation.createSnapshot(seed, { capture: captured(values, entry.sourceFormulaId), clinicalDateISO: KLIRENS_SEARCH_DATE });
  return root.ClcrSavedCalculation.recalculate(initial);
}

function persist(root, entry, variant, patientId, values, producer = produce) {
  const key = entry.id + '-' + variant;
  let point;
  try { point = producer(root, entry, values); }
  catch (cause) { throw new Error('Klirens fixture ' + key + ': ' + cause.message, { cause }); }
  // The calculator page starts with the registry metadata before augmenting
  // its computed result. In particular dimensionless legacy pH24 owns no unit.
  const mapped = productionMapper(root)(entry.testKey, point.valueNum);
  point = { ...mapped, ...point, unit: point.unit || mapped.unit };
  const capture = point.capture || captured(values, entry.sourceFormulaId);
  const notePayload = root.ClcrSavedResults.buildPatientNotePayload(point, { patientId, clinicalDateISO: KLIRENS_SEARCH_DATE, comment: 'Fikcyjny komentarz ' + key + '.' });
  const snapshot = root.ClcrSavedCalculation.createSnapshot(point, { capture, patientId, clinicalDateISO: KLIRENS_SEARCH_DATE });
  notePayload.body += '\n\n' + root.ClcrSavedCalculation.serializeSnapshot(snapshot, notePayload);
  const note = { ...notePayload, id: 'fictional-klirens-search-' + key, rev: 1 };
  const read = root.ClcrSavedCalculation.readSaved(note);
  if (!read?.valid) throw new Error('Klirens fixture does not round-trip: ' + key + ': ' + JSON.stringify(read));
  return { key, formulaId: entry.sourceFormulaId, parameterKey: entry.id, variant, notePayload, note,
    expected: { summary: root.ClcrNotesView.summary(note, { patientId }), model: root.ClcrNotesView.model(note, { patientId }) } };
}

function proteinProducer(root, entry, values) {
  const result = root.VildaClcrProteinDzm.evaluate(root.VildaClcrProteinDzm.inputFromValues(values), root.ClcrProteinDzmReferenceData.DEFAULT_POLICY);
  if (!result.valid) throw new Error(result.error);
  const point = { id: entry.id, sourceFormulaId: entry.sourceFormulaId, testKey: entry.testKey, label: entry.label };
  root.ClcrProteinDzmPersistence.augmentDatapoint({ getAttribute: key => key === 'data-clcr-protein-dzm-snapshot' ? JSON.stringify(result) : null }, point);
  return point;
}

function potassiumProducer(root, entry, values) {
  const result = root.VildaClcrPotassiumDzm.evaluate(root.VildaClcrPotassiumDzm.inputFromValues(values), root.ClcrPotassiumDzmReferenceData.DEFAULT_POLICY);
  if (!result.valid) throw new Error(result.error);
  const point = { id: entry.id, sourceFormulaId: entry.sourceFormulaId, testKey: entry.testKey, label: entry.label };
  root.ClcrPotassiumDzmPersistence.augmentDatapoint({ getAttribute: key => key === 'data-clcr-potassium-dzm-snapshot' ? JSON.stringify(result) : null }, point);
  return point;
}

function variants(root, patientId) {
  const cases = [];
  const add = (key, name, patch, producer) => {
    const entry = root.ClcrSavedResults.getParam(key);
    cases.push(persist(root, entry, name, patientId, { ...baselineValues(entry), ...patch }, producer));
  };
  for (const key of ['egfr', 'egfr_cr_cys', 'ckid_u25', 'sch_idms']) add(key, 'creatinine-micromol-male', { sex: 'M', Scr: '53.04', ScrUnit: 'umol' });
  for (const key of ['ckid_u25', 'ckid_u25_cr_cys', 'sch_idms']) add(key, 'recorded-jaffe-method', { ScrAssay: 'jaffe_idms' });
  for (const key of ['ckid_u25_cys', 'ckid_u25_cr_cys']) add(key, 'recorded-cystatin-method', { CystatinCAssayMethod: 'immunoturbidimetric' });
  for (const key of ['cg', 'cg_norm']) add(key, 'female-micromol', { sex: 'F', Scr: '106.08', ScrUnit: 'umol' });
  add('cl24', 'non24h-collection', { Cl24DurationHours: '12', collectionStartAt: '', collectionEndAt: '' });
  for (const key of ['KTV_spktv', 'KTV_ektv', 'KTV_urr']) add(key, 'qualified-session', { ktvKru: '1.5', ktvKruMeasuredAt: '2026-06-01' });
  add('pH24', 'recorded-cystinuria-target', { pH24: '7.8', stoneKnownCystinuria: true, stonePhPersistent: true, stoneCollectionPlausibilityReviewed: true, stoneTwoCollectionsConfirmed: true });
  add('TMP_GFR', 'adult-corrected', { age: '30' });
  add('TMP_GFR', 'adult-linear', { age: '30', U_PO4_spot: '200' });
  add('pH_spot', 'below-recorded-range', { U_pH: '4.4' });
  add('pH_spot', 'above-recorded-range', { U_pH: '8.1' });
  add('AGu_spot', 'exact-zero', { U_Na_spot: '20', U_K_spot: '10', U_Cl_spot: '30' });

  add('ACR', 'direct-mass-axis-censored', { ACR_entry_mode: 'direct', ACR_reported: '<3', ACR_reported_unit: 'mg/g' });
  add('ACR', 'direct-molar-axis', { ACR_entry_mode: 'direct', ACR_reported: '4.5', ACR_reported_unit: 'mg/mmol' });
  add('PCR', 'direct-mass-axis-censored', { PCR_entry_mode: 'direct', PCR_reported: '<100', PCR_reported_unit: 'mg/g' });
  add('PCR', 'direct-molar-axis', { PCR_entry_mode: 'direct', PCR_reported: '20', PCR_reported_unit: 'mg/mmol' });
  add('CaCr_spot', 'direct-mass-axis', { CaCr_entry_mode: 'direct', CaCr_reported: '<0.3', CaCr_reported_unit: 'mg/mg' });
  add('CaCr_spot', 'direct-molar-axis', { CaCr_entry_mode: 'direct', CaCr_reported: '0.5', CaCr_reported_unit: 'mmol/mmol' });
  for (const [key, prefix, raw] of [['OxCr_spot', 'OxCr', '60'], ['CitCr_spot', 'CitCr', '250']]) {
    add(key, 'direct-molar-axis', { [prefix + '_entry_mode']: 'direct', [prefix + '_reported']: raw, [prefix + '_reported_unit']: 'umol/mmol' });
    for (const basis of ['acid', 'ion', 'unknown']) add(key, 'direct-mass-' + basis, { [prefix + '_entry_mode']: 'direct', [prefix + '_reported']: '0.1', [prefix + '_reported_unit']: 'mg/mg:' + basis });
  }
  for (const [key, urine, serum] of [['FENa_spot', 'U_Na_spot', 'S_Na_spot'], ['FEK_spot', 'U_K_spot', 'S_K_spot'], ['FECl_spot', 'U_Cl_spot', 'S_Cl_spot'], ['FEHCO3_spot', 'U_HCO3_spot', 'S_HCO3_spot']]) {
    add(key, 'recorded-CKD-context', { spotKnownCKD: true, [urine]: spotExtra[key][urine], [serum]: spotExtra[key][serum] });
  }

  for (const [unit, value] of [['mg/24h', '100'], ['mmol/24h', '2.5'], ['mg/kg/24h', '3']]) add('Ca_mgkg', 'reported-' + unit.replaceAll('/', '-'), { CA_inputMode: 'reported', CA_reportedValue: value, CA_reportedUnit: unit, CA_collectionSource: 'hours' });
  for (const mode of ['hypo', 'phpt']) add('Ca_mgkg', 'clinical-context-' + mode, { CA_clinicalMode: mode });
  add('Ca_mgkg', 'pediatric-per-kg', { age: '10', weight: '30' });
  add('Ca_mgkg', 'exact-zero', { CA_inputMode: 'concentration', CA_concentration: '0', CA_concentrationUnit: 'mmol/L', CA_volume: '1500', CA_volumeUnit: 'mL' });
  for (const [unit, value] of [['mg/24h', '300'], ['mmol/24h', '2'], ['mg/kg/24h', '8']]) add('UA_mgkg', 'reported-' + unit.replaceAll('/', '-'), { UA_inputMode: 'reported', UA_reportedValue: value, UA_reportedUnit: unit, UA_collectionSource: 'hours' });
  add('UA_mgkg', 'reported-daily-no-weight', { weight: '', UA_inputMode: 'reported', UA_reportedValue: '300', UA_reportedUnit: 'mg/24h', UA_collectionSource: 'hours' });
  add('Mg_mgkg', 'reported-daily', { MG_inputMode: 'reported', MG_reportedValue: '88', MG_reportedUnit: 'mg/24h', MG_collectionSource: 'hours' });
  add('Mg_mgkg', 'pediatric-bsa', { age: '10', weight: '30', height: '140', MG_inputMode: 'concentration', MG_concentration: '20', MG_concentrationUnit: 'mg/L', MG_volume: '1500', MG_volumeUnit: 'mL', MG_collectionSource: 'hours' });
  add('Mg_mgkg', 'reported-per-kg-no-context', { age: '', weight: '', height: '', MG_inputMode: 'reported', MG_reportedValue: '1', MG_reportedUnit: 'mg/kg/24h', MG_collectionSource: 'hours' });
  for (const unit of ['mgP/24h', 'mmol/24h']) add('PO4_mgkg', 'reported-' + unit.replaceAll('/', '-'), { PO4_inputMode: 'reported', PO4_reportedValue: '25', PO4_reportedUnit: unit, PO4_outputUnit: 'mmol/24h', PO4_collectionSource: 'hours' });
  add('Na_mmol_d', 'reported-sodium-grams', { Na_inputMode: 'reported', Na_reportedValue: '2.3', Na_reportedUnit: 'gNa/24h', Na_outputUnit: 'gNa/24h', Na_collectionHours: '24', Na_collectionSource: 'hours' });
  add('Na_mmol_d', 'reported-sodium-milligrams', { Na_inputMode: 'reported', Na_reportedValue: '2300', Na_reportedUnit: 'mgNa/24h', Na_outputUnit: 'mmol/24h', Na_collectionHours: '24', Na_collectionSource: 'hours' });
  add('K_mmol_d', 'reported-potassium', { K_inputMode: 'reported', K_reportedValue: '60', K_reportedUnit: 'mmol/24h', K_outputUnit: 'mmol/24h', K_collectionHours: '24', K_collectionSource: 'hours' }, potassiumProducer);
  add('K_mmol_d', 'exact-zero', { K_inputMode: 'reported', K_reportedValue: '0', K_reportedUnit: 'mmol/24h', K_outputUnit: 'mmol/24h', K_collectionHours: '24', K_collectionSource: 'hours' }, potassiumProducer);
  const protein = { Prot_inputMode: 'concentration', Prot_concentration: '200', Prot_concentrationUnit: 'mg/L', Prot_volume: '1500', Prot_volumeUnit: 'mL', Prot_collectionHours: '24', Prot_collectionSource: 'hours', weight: '30', height: '140', age: '10', ageMonths: '0', sex: 'F' };
  for (const unit of ['mg/24h', 'g/24h']) {
    add('Prot_mg24', 'typed-concentration-' + unit.replaceAll('/', '-'), { ...protein, Prot_outputUnit: unit }, proteinProducer);
    add('Prot_mg24', 'typed-reported-' + unit.replaceAll('/', '-'), { ...protein, Prot_inputMode: 'reported', Prot_reportedValue: unit === 'g/24h' ? '0.3' : '300', Prot_reportedUnit: unit, Prot_outputUnit: unit }, proteinProducer);
  }
  return cases;
}

// Node-side fixture production for unit and encrypted-browser tests. The seed
// is only an input envelope for the real editor calculator; no seed number is
// saved as a clinical result. Every final note uses the production writer.
export function buildKlirensSearchCases(patientId = 'fictional-klirens-all-formulas', root = createKlirensSearchEnvironment()) {
  const registry = KLIRENS_SEARCH_PARAMETER_KEYS.map(key => {
    const entry = root.ClcrSavedResults.getParam(key);
    if (!entry) throw new Error('Missing production Klirens parameter: ' + key);
    return persist(root, entry, 'registry', patientId, baselineValues(entry));
  });
  return registry.concat(variants(root, patientId));
}
