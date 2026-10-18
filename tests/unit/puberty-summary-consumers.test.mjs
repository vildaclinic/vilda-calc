import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const savedDocument = globalThis.document;
afterEach(() => {
  if (savedDocument === undefined) delete globalThis.document;
  else globalThis.document = savedDocument;
});
const observation = (stage, ageMonths = 144, observedAtISO = '2026-10-01') => ({ stage, ageMonths, observedAtISO, source: 'clinician-entry' });
const user = (sex = 'M', observations = {}) => ({ sex, tannerStage: '5', pubertyAssessment: { version: 1, sex, observations: { G: null, Th: null, P: null, ...observations } } });
const makeWindow = () => ({ document: { getElementById: id => id === 'tannerStage' ? { value: '5' } : null,
  addEventListener() {}, querySelectorAll: () => [] }, addEventListener() {}, navigator: {}, location: { pathname: '/' } });
function load(...files) {
  const w = makeWindow();
  globalThis.document = w.document;
  loadBrowserScript('vilda_puberty_assessment.js', w);
  for (const file of files) loadBrowserScript(file, w);
  return w;
}
function sentence(w, context, sex = 'M', ageMonths = 145) {
  const result = w.VildaPatientNarrative.compose({ sex, context, points: [{ ageMonths }], metrics: [] }, {});
  return result && result.sentences.find(s => s.id === 'dojrzewanie')?.text || null;
}

describe('Podsumowanie oceny — osobne cechy i własny czas badania', () => {
  it('opis pokazuje G i P z ich własnymi datami; wcześniejszej cechy nie odświeża drugą', () => {
    const w = load('vilda_patient_narrative.js');
    const assessmentContext = w.VildaPubertyAssessment.readUser(user('M', { G: observation(3, 144, '2026-09-01'), P: observation(2, 145, '2026-10-01') }));
    const text = sentence(w, { assessmentContext });
    expect(text).toContain('G3 (ocena 2026-09-01; w wieku 12 lat; wcześniejsza ocena)');
    expect(text).toContain('P2 (ocena 2026-10-01; w wieku 12 lat i 1 miesiąca)');
    expect(text).not.toContain('Tanner');
  });
  it('Th i P pozostają niezależne; P bez daty jest nazwane bez dopowiadania badania', () => {
    const w = load('vilda_patient_narrative.js');
    const assessmentContext = w.VildaPubertyAssessment.readUser(user('F', { Th: observation(1), P: observation(3, null, null) }));
    const text = sentence(w, { assessmentContext }, 'F');
    expect(text).toContain('Th1');
    expect(text).toContain('P3 (czas oceny nieznany)');
    expect(text).not.toContain('Tanner');
  });
  it('sam P nie staje się opisem gonadalnego stadium', () => {
    const w = load('vilda_patient_narrative.js');
    const assessmentContext = w.VildaPubertyAssessment.readUser(user('M', { P: observation(4) }));
    const text = sentence(w, { assessmentContext });
    expect(text).toContain('P4');
    expect(text).not.toMatch(/G4|Th4|Tanner IV/);
  });
  it('zachowuje etykietę płci źródłowego zapisu zamiast zmieniać G na Th', () => {
    const w = load('vilda_patient_narrative.js');
    const assessmentContext = w.VildaPubertyAssessment.readUser(user('M', { G: observation(3) }));
    const text = sentence(w, { assessmentContext }, 'F');
    expect(text).toContain('G3');
    expect(text).toContain('zapis dla płci męskiej');
    expect(text).not.toContain('Th3');
  });
  it('po edycji Th dla F nazywa źródłową płeć każdego zachowanego G/P dla M', () => {
    const w = load('vilda_patient_narrative.js');
    const data = user('F', {
      G: { ...observation(3), sex: 'M' },
      P: { ...observation(2), sex: 'M' },
      Th: { ...observation(2, 145), sex: 'F' }
    });
    const saved = structuredClone(data);
    const assessmentContext = w.VildaPubertyAssessment.readUser(data);
    const text = sentence(w, { assessmentContext }, 'F');
    expect(text).toMatch(/G3 \([^)]*zapis dla płci męskiej\)/);
    expect(text).toMatch(/P2 \([^)]*zapis dla płci męskiej\)/);
    expect(text).toMatch(/Th2 \(ocena 2026-10-01; w wieku 12 lat i 1 miesiąca\)/);
    expect(text).not.toMatch(/Th2 \([^)]*płci męskiej/);
    expect(data).toEqual(saved);
  });
  it('jawny brak płci cechy nie dziedziczy płci nowej edycji całego obiektu', () => {
    const w = load('vilda_patient_narrative.js');
    const assessmentContext = w.VildaPubertyAssessment.readUser(user('F', { P: { ...observation(2), sex: null } }));
    expect(sentence(w, { assessmentContext }, 'F')).toMatch(/P2 \([^)]*płeć źródłowej oceny nieznana\)/);
  });
  it('dawny ogólny Tanner ma jawnie nieokreślony rodzaj', () => {
    const w = load('vilda_patient_narrative.js');
    expect(sentence(w, { assessmentContext: w.VildaPubertyAssessment.readUser({ tannerStage: '3' }) }))
      .toBe('Zapisano Tanner III — rodzaj cechy nieokreślony.');
  });
  it.each([null, { version: 2 }, { version: 1, sex: 'M', observations: {} }])('obecny pusty/błędny/przyszły obiekt %j blokuje opis starego numeru', pubertyAssessment => {
    const w = load('vilda_patient_narrative.js');
    const assessmentContext = w.VildaPubertyAssessment.readUser({ tannerStage: '5', pubertyAssessment });
    expect(sentence(w, { assessmentContext, tannerStage: 5 })).toBeNull();
  });
  it('pełny silnik trajektorii przenosi P do opisu, bez rozpoznania opóźnienia gonadalnego', () => {
    const w = load('vilda_tempo_wzrastania.js', 'vilda_trajectory_analysis.js', 'vilda_patient_narrative.js');
    w.advHistoryResolveMetric = () => ({ result: { percentile: 50, sd: 0 }, source: 'OLAF' });
    const assessmentContext = w.VildaPubertyAssessment.readUser(user('M', { P: observation(4) }));
    const model = w.VildaTrajectoryAnalysis.analyze({ measurements: [{ ageMonths: 168, height: 150 }],
      currentAgeMonths: 180, currentHeight: 152, sex: 'M', source: 'OLAF', context: { assessmentContext } });
    expect(model.context.assessmentContext).toEqual(assessmentContext);
    expect(model.delayedPuberty).toBe(false);
    expect(sentence(w, model.context, 'M', 180)).toContain('P4');
  });
});

describe('Karta pacjenta — prawdziwy hook źródła do trajektorii', () => {
  function run(w, m, sex = 'M', currentAgeMonths = 145) {
    const source = fs.readFileSync(path.join(root, 'vilda_auth_ui.js'), 'utf8');
    const begin = source.indexOf('/* P-POKWITANIE-UI: saved axis');
    const end = source.indexOf('}catch(_e9)', begin);
    expect(begin).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(begin);
    return new Function('i', 'm', 'it', 'I', `var _cx9={};${source.slice(begin, end)};return _cx9;`)(w, m, sex, currentAgeMonths);
  }
  it('przekazuje G z jego wiekiem obserwacji zamiast wiekiem ostatniego pomiaru', () => {
    const w = load();
    const data = user('M', { G: observation(3, 140), P: observation(2, 144) });
    expect(run(w, data)).toMatchObject({ tannerStage: 3, tannerKind: 'G', tannerAtAgeMonths: 140,
      assessmentContext: { status: 'ready', assessment: { observations: { P: { stage: 2, ageMonths: 144 } } } } });
  });
  it.each([
    user('M', { P: observation(4) }),
    { sex: 'M', tannerStage: '4' },
    user('M', { G: observation(4, 100) }),
    user('F', { Th: observation(4) }),
    { sex: 'M', tannerStage: '4', pubertyAssessment: null }
  ])('nie uruchamia gałęzi gonadalnych przy braku kwalifikującego G', data => {
    const w = load();
    expect(run(w, data).tannerStage).toBeUndefined();
  });
});

describe('Podsumowanie tempa korzysta ze wspólnej kwalifikacji', () => {
  it('ignoruje stary DOM Tanner V i używa wyłącznie G ze wspólnego adaptera', () => {
    const w = load('vilda_tempo_wzrastania.js', 'vilda_trajectory_analysis.js');
    w.VildaPubertyAssessmentContext = { gonadalForGrowth: () => ({ stage: 1, kind: 'G', usableForGrowth: true, ageMonths: 144 }) };
    loadBrowserScript('vilda_summary_cards.js', w);
    const verdict = w.__velocitySummaryVerdict({ growthVelocity: 2, growthVelocityGapM: 12, currentAgeMonths: 144, sex: 'M' });
    expect(verdict.basis).toBe('tanner1');
    expect(verdict.slow).toBe(true);
  });
  it('brak kwalifikacji nie odtwarza stadium z ukrytego DOM', () => {
    const w = load('vilda_tempo_wzrastania.js', 'vilda_trajectory_analysis.js');
    w.VildaPubertyAssessmentContext = { gonadalForGrowth: () => null };
    loadBrowserScript('vilda_summary_cards.js', w);
    const verdict = w.__velocitySummaryVerdict({ growthVelocity: 2, growthVelocityGapM: 12, currentAgeMonths: 100, sex: 'M' });
    expect(verdict.basis).toBe('age');
    expect(verdict.slow).toBe(true);
  });
  it('porównanie ma jawny pusty wynik adaptera; stary opt.tanner nie obchodzi braku G/Th', () => {
    const w = load('vilda_tempo_wzrastania.js', 'vilda_trajectory_analysis.js', 'vilda_summary_cards.js');
    const previous = { sex: 'M', ageMonths: 88, heightCm: 130, weightKg: 25 };
    const current = { ageMonths: 100, heightCm: 132, weightKg: 26 };
    const compare = gonadal => w.VildaSummaryCards.__porownanieZPoprzednim(previous, current,
      { plec: 'M', zrodlo: 'OLAF', tanner: 5, gonadal }).wiersze.find(row => row.klucz === 'wzrost').tempoZdanie;
    expect(compare(null)).toContain('poniżej normy dla wieku');
    expect(compare({ usableForGrowth: true, kind: 'P', stage: 4 })).toContain('poniżej normy dla wieku');
    expect(compare({ usableForGrowth: true, kind: 'G', stage: 4 })).toContain('G IV');
  });
});
