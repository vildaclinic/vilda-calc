import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Execute the production adapter bodies, not a duplicate implementation. This
// catches an invalid shared duration being collapsed into blank, which the
// dedicated engines correctly interpret as a new assumed 24 h collection.
const source = fs.readFileSync(new URL('../../inline_kalkulator_klirens_04.js', import.meta.url), 'utf8');
const metadataSource = fs.readFileSync(new URL('../../inline_kalkulator_klirens_02.js', import.meta.url), 'utf8');
// The first, data-only portion also applies the production shared-duration
// requirement to the legacy formulas. Avoid executing unrelated DOM handlers.
const formulas = new Function(`return ${metadataSource.slice(0, metadataSource.indexOf('  const f ='))}\nreturn l;\n})();`)();
function actualFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing production adapter: ${name}`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

function harness(hours, { absent = false } = {}) {
  const w = { ClcrUiWorkflow: { state: { legacyBroad: true } } };
  for (const file of ['clcr_collection_duration.js', 'clcr_extended_egfr.js',
    'clcr_mg_dzm_reference_data.js', 'clcr_mg_dzm.js',
    'clcr_ca_dzm_reference_data.js', 'clcr_ca_dzm.js',
    'clcr_po4_dzm_reference_data.js', 'clcr_po4_dzm.js',
    'clcr_ua_reference_data.js', 'clcr_ua.js']) loadBrowserScript(file, w);
  const values = { age: '45', ageMonths: '0', weight: '60', height: '165', sex: 'F',
    U_Mg: '100', U_Ca: '2.5', U_UA: '20', U_PO4: '50', V24: '1000',
    Cl24DurationSource: absent ? 'assumed-24h' : 'hours', ...(!absent ? { Cl24DurationHours: hours } : {}) };
  const doc = { getElementById: id => Object.hasOwn(values, id) ? { value: values[id], type: 'text' } : null };
  const evaluate = name => new Function('window', 'document', '$',
    `${actualFunction('readClcrCollectionDurationMinutes')}\n${actualFunction(name)}\nreturn ${name}();`)(w, doc, id => doc.getElementById(id));
  return { w, doc, evaluate };
}

describe('Actual generic readiness gate agrees with the shared duration module', () => {
  const timed = ['Prot_mgkg', 'Na_mmol_d', 'K_mmol_d', 'Ox_mgkg', 'Cit_mgkg', 'pH24'];
  function canCompute(formula, hours, knownProblem = false, durationSource = null) {
    const w = { ClcrUiWorkflow: { state: { legacyBroad: true } } };
    for (const file of ['clcr_collection_duration.js', 'clcr_extended_egfr.js', 'clcr_saved_legacy_calculator.js',
      'clcr_protein_dzm_data.js', 'clcr_protein_dzm.js']) loadBrowserScript(file, w);
    const values = { age: '45', weight: '60', height: '165', V24: '1440', U_Na: '50', U_K: '20',
      U_PO4: '50', U_Prot: '1000', U_Ox: '5', U_Cit: '5', pH24: '5.5',
      oxalateReportingEntity: 'oxalate_ion', Cl24DurationHours: hours,
      Cl24DurationSource: durationSource ?? (hours === '' ? 'assumed-24h' : 'hours'),
      ...(knownProblem ? { ui_collectionNoMissedVoids_answer: 'no' } : {}) };
    const doc = { getElementById: id => Object.hasOwn(values, id)
      ? { value: values[id], type: 'text', tagName: id === 'oxalateReportingEntity' ? 'SELECT' : 'INPUT' } : null };
    return new Function('window', 'document', '$', 'FORMULAS', `${actualFunction('readClcrCollectionDurationMinutes')}\n${actualFunction('evaluateClcrProteinDzm')}\n${actualFunction('evaluateClcrSodiumDzm')}\n${actualFunction('canComputeFormula')}\nreturn canComputeFormula(${JSON.stringify(formula)});`)(w, doc, id => doc.getElementById(id), formulas);
  }
  it.each(timed)('%s accepts blank/default and explicit valid duration, rejects explicit invalid values', formula => {
    expect(formulas.find(item => item.id === formula).requires).toContain('Cl24DurationHours');
    if (formula === 'Na_mmol_d') expect(formulas.find(item => item.id === formula).requires).toContain('Na_collectionHours');
    for (const hours of ['', '24', '12']) expect(canCompute(formula, hours), `${formula}/${hours}`).toBe(true);
    for (const hours of ['0', '-1', 'abc']) expect(canCompute(formula, hours), `${formula}/${hours}`).toBe(false);
    expect(canCompute(formula, '', true)).toBe(false);
  });
  it('sodium broad adapter preserves historical missing and explicitly invalid clock provenance', () => {
    expect(canCompute('Na_mmol_d', '', false, 'historical-missing')).toBe(false);
    expect(canCompute('Na_mmol_d', '24', false, 'invalid')).toBe(false);
    expect(canCompute('Na_mmol_d', '', false, 'invalid')).toBe(false);
  });
});

describe('Actual result cleanup accepts IDs and DOM nodes', () => {
  function setup() {
    const doc = atrapaDokumentu(), w = { ClcrResultPresentation: {} };
    loadBrowserScript('inline_kalkulator_klirens_01.js', w);
    function node(tag = 'div', { id = '', className = '', formula = '', text = '' } = {}) {
      const element = doc.createElement(tag);
      element.id = id; element.className = className; element.textContent = text;
      element.dataset = { clcrFormula: formula };
      Object.defineProperty(element, 'parentElement', { get: () => element.parentNode });
      element.matches = selector => {
        if (!/^\.[\w-]+$/.test(selector)) throw new Error(`Unsupported local matches selector: ${selector}`);
        return element.classList.contains(selector.slice(1));
      };
      return element;
    }
    const api = new Function('window', 'document', '$', 'clcrClearElement',
      `${actualFunction('clearClcrResultElement')}\n${actualFunction('consolidateClcrEngineOutputs')}\nreturn {clearClcrResultElement,consolidateClcrEngineOutputs};`)(w, doc, id => doc.getElementById(id), w.clcrClearElement);
    return { doc, node, ...api };
  }

  it('clears descendants through the production trusted-DOM bridge for both call styles', () => {
    const h = setup(), host = h.node('div', { id: 'clcrInfo' }); h.doc.body.appendChild(host);
    host.appendChild(h.node('div', { text: 'Pierwsza stara karta' }));
    h.clearClcrResultElement('clcrInfo');
    expect(host.children).toEqual([]); expect(host.textContent).toBe('');
    host.appendChild(h.node('div', { text: 'Druga stara karta' }));
    h.clearClcrResultElement(host);
    expect(host.children).toEqual([]); expect(host.textContent).toBe('');
    expect(() => h.clearClcrResultElement('missing-id')).not.toThrow();
    expect(() => h.clearClcrResultElement(null)).not.toThrow();
  });

  it.each(['Mg_mgkg', 'Ca_mgkg', 'UA_mgkg', 'PO4_mgkg', 'Prot_mgkg', 'Na_mmol_d'])('%s retains one original result plus Details and removes separate BSA/dormant cards', formula => {
    const h = setup();
    const containers = Object.fromEntries(['clcrInfo', 'elecInfo', 'stoneInfo'].map(id => {
      const host = h.node('div', { id }); h.doc.body.appendChild(host); return [id, host];
    }));
    containers.clcrInfo.appendChild(h.node('div', { className: 'result-box', text: 'Powierzchnia ciała (BSA): 1,06 m²' }));
    containers.stoneInfo.appendChild(h.node('div', { className: 'clcr-result-card', formula: 'Cit_mgkg', text: 'Nieaktywna starsza zbiórka' }));
    const primary = h.node('div', { className: 'clcr-result-card', formula, text: 'Jeden wynik z interpretacją i normą' });
    const details = h.node('details', { className: 'clcr-result-details', formula, text: 'Szczegóły i źródła' });
    details.open = true;
    primary.setAttribute('data-clcr-value', '49.12775805692763');
    primary.setAttribute('data-clcr-saved-snapshot', '{"rawValue":49.12775805692763}');
    containers.elecInfo.appendChild(primary); containers.elecInfo.appendChild(details);

    h.consolidateClcrEngineOutputs(formula);

    expect(containers.clcrInfo.textContent).toBe(''); expect(containers.clcrInfo.children).toEqual([]);
    expect(containers.stoneInfo.textContent).toBe(''); expect(containers.stoneInfo.children).toEqual([]);
    expect(containers.elecInfo.children).toEqual([primary, details]);
    expect(h.doc.body.querySelectorAll('.clcr-result-card')).toEqual([primary]);
    expect(h.doc.body.querySelectorAll('.clcr-result-details')).toEqual([details]);
    expect(primary.parentElement).toBe(containers.elecInfo);
    expect(primary.getAttribute('data-clcr-value')).toBe('49.12775805692763');
    expect(primary.getAttribute('data-clcr-saved-snapshot')).toBe('{"rawValue":49.12775805692763}');
    expect(details.open).toBe(true);
    expect(details.querySelector('.clcr-result-extra')).toBeNull();
  });
});

describe.each([
  ['Mg', 'evaluateClcrMgDzm', 'MG_collectionHours'],
  ['Ca', 'evaluateClcrCaDzm', 'CA_collectionHours'],
  ['UA', 'evaluateClcrUa', 'UA_collectionHours'],
  ['PO4', 'evaluateClcrPo4Dzm', 'PO4_collectionHours'],
])('Actual broad %s adapter retains shared duration validation', (_label, name, field) => {
  it.each(['0', '-1', 'abc'])('rejects explicit invalid common hours %s without assuming 24', hours => {
    const h = harness(hours), result = h.evaluate(name);
    expect(h.w.ClcrCollectionDuration.readFromDocument(h.doc)).toMatchObject({ valid: false, invalid: true });
    expect(result).toMatchObject({ valid: false, rawValue: null });
    expect(result.invalidIds).toContain(field);
    expect(result.input.hours).toBe(hours);
  });
  it('keeps explicit 12 h and normalizes amount without a full-day reference', () => {
    const full = harness('24').evaluate(name), half = harness('12').evaluate(name);
    expect(full.valid).toBe(true);
    expect(half).toMatchObject({ valid: true, hours: 12, referenceActive: false, reference: null });
    expect(half.dailyMg).toBeCloseTo(full.dailyMg * 2, 12);
    expect(half.input.durationSource).toBe('hours');
  });
  it('defaults genuinely blank and absent new duration to 24 h', () => {
    for (const options of [{}, { absent: true }]) {
      const result = harness('', options).evaluate(name);
      expect(result).toMatchObject({ valid: true, hours: 24 });
      expect(result.input.hours).toBe('24');
      expect(result.input.durationSource).toBe('assumed-24h');
    }
  });
});
