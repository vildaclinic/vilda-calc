import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const decode = value => String(value).replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[entity]);
// Minimal DOM contract, populated from the actual production renderer output.
function renderedElement(html) {
  const root = html.match(/^<div\s+([^>]+)>/)[1];
  const attributes = Object.fromEntries([...root.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]));
  const range = html.match(/<p class="clcr-measured-reference-line"[^>]*>([\s\S]*?)<\/p>/);
  return {
    getAttribute: name => attributes[name] ?? null,
    getClientRects: () => [{ width: 400, height: 200 }],
    classList: { contains: name => String(attributes.class).split(' ').includes(name) },
    querySelector: selector => selector === '.clcr-measured-reference-line' && range
      ? { textContent: decode(range[1].replace(/<[^>]+>/g, '')) } : null,
  };
}

function harness() {
  const actualVault = {};
  loadBrowserScript('vilda_vault.js', actualVault);
  const captured = [];
  const browser = { VildaVault: {
    // Capture-only test adapter: no authentication or patient storage access.
    isUnlocked: () => true,
    savePatientNote: async payload => { captured.push(payload); return { id: 'fictional-note' }; },
  } };
  for (const file of [
    'clcr_measured_clearance_reference_data.js', 'clcr_measured_clearance_reference.js',
    'clcr_result_reference_data.js', 'clcr_result_presentation.js', 'clcr_ui_workflow.js',
  ]) loadBrowserScript(file, browser);
  // A saved clinical result belongs to the selected persisted synthetic record.
  browser.VildaVault.getPatient = async id => id === 'fictional-only' ? { id, patientId: id, name: 'Fikcyjny pacjent' } : null;
  browser.ClcrVisitSave._setPatientId('fictional-only');
  return { browser, captured, sanitizer: actualVault.VildaVault };
}

const specimens = [
  { name: 'dorosła, wynik powyżej zakresu i czas 12 h', request: { value: 200.123456, ageYears: 35, sex: 'F', bsa: 1.8481430181213463, bsaMethod: 'Du Bois', durationHours: 12 }, weight: 70, height: 175, status: 'above', hasNorm: true },
  { name: 'dziecko bez podanej płci, zakres dobowy', request: { value: 60, ageYears: 7, bsa: 0.9289825609969697, bsaMethod: 'Haycock', durationHours: 24 }, weight: 25, height: 125, status: 'within', hasNorm: true },
  { name: 'wiek poniżej 3 lat, bez dobranego zakresu', request: { value: 30, ageYears: 2, bsa: 0.55, bsaMethod: 'Haycock', durationHours: 24 }, weight: 12, height: 90, status: 'unavailable', hasNorm: false },
];

describe('Klirens zmierzony — snapshot interpretacji w zapisie i historii', () => {
  it.each(specimens)('$name', async ({ request, weight, height, status, hasNorm }) => {
    const { browser, captured, sanitizer } = harness();
    const profile = browser.ClcrMeasuredClearanceReferenceData.getProfile('PATHWEST_CCL_2026_03_20');
    const evaluated = browser.ClcrMeasuredClearanceReference.evaluate({ ...request, unit: 'mL/min' }, profile);
    expect(evaluated.status).toBe(status);
    const snapshot = {
      ...evaluated, durationSource: 'legacy-dates',
      inputs: { serumCreatinineMgDl: 1.2, urineCreatinineMgDl: 90, volumeMl: 1440, durationMinutes: request.durationHours * 60, ageYears: request.ageYears, sex: request.sex ?? null, weightKg: weight, heightCm: height },
      collectionAssumptions: { collectionCompleteness: 'assumed', serumSampling: 'assumed-compatible' },
    };
    const input = {
      formulaId: 'cl24', series: 'cl24', value: request.value, displayValue: String(Math.round(request.value)), unit: 'mL/min',
      calculationAssumptions: { assumptionsText: 'Założono stabilną czynność nerek, bez podejrzenia AKI.' },
      referenceContext: { measuredClearance: snapshot, durationHours: request.durationHours },
    };
    const rendered = browser.ClcrResultPresentation.render(input, browser.ClcrResultReferenceData.PROFILE);
    const element = renderedElement(rendered);
    const points = browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [element] }, { formulaId: 'cl24' });
    expect(points).toHaveLength(1);
    expect(points[0].measuredClearanceReference).toEqual(snapshot);
    expect((await browser.ClcrVisitSave.saveActiveResultToCard({ patientId: 'fictional-only', clinicalDateISO: '2026-10-23', datapoints: points })).ok).toBe(true);
    const saved = captured[0];
    const normalized = { ...saved, body: sanitizer.sanitizeNoteText(saved.body), labResult: sanitizer.sanitizeLabResult(saved.labResult) };
    expect(normalized.body).toBe(saved.body);
    expect(normalized.labResult).toEqual(saved.labResult);
    expect(normalized.labResult).not.toHaveProperty('measuredClearanceReference');
    expect(Boolean(normalized.labResult.norm)).toBe(hasNorm);
    for (const fragment of [
      'PathWest', '2026-03-20', 'PATHWEST_CCL_2026_03_20', 'wersja 1',
      'https://pathwesttd.health.wa.gov.au/testdirectory/testdetail.aspx?TestID=521',
      `wiek ${request.ageYears} lat`, `${request.durationHours} h`, request.bsaMethod,
      'stabilną czynność nerek', 'Założono pełną, prawidłową zbiórkę moczu.',
      'kreatynina w surowicy 1,2 mg/dL', 'Czas odtworzono z zapisanych dat początku i końca zbiórki.',
    ]) expect(normalized.body).toContain(fragment);
    if (hasNorm) {
      expect(normalized.body).toContain('Zakres źródłowy:');
      expect(normalized.body).toContain('Zakres po przeliczeniu na jednostkę wyniku, przed zaokrągleniem granic:');
      expect(normalized.body).toContain('Przedział wieku źródła:');
    }
    if (request.durationHours !== 24) expect(normalized.body).toContain(evaluated.protocolNote);
    if (status === 'above') expect(normalized.body).toContain('200,123456 mL/min');

    browser.ClcrMeasuredClearanceReference = { evaluate() { throw new Error('History must not recalculate a saved interpretation'); } };
    browser.ClcrMeasuredClearanceReferenceData = { getProfile() { throw new Error('History must not replace the source profile'); } };
    const history = browser.ClcrVisitSave.buildSeriesFromNotes([{ ...normalized, id: 'fictional-note' }], { formulaId: 'cl24' });
    expect(history).toHaveLength(1);
    expect(history[0].points[0]).toMatchObject({ norm: normalized.labResult.norm || '', valueNum: normalized.labResult.valueNum, outOfRange: status === 'above' });
    expect(sanitizer.isUnlocked()).toBe(false);
  });
});
