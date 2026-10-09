import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_puberty.js');
const data = require('../../vilda_lab_puberty_data.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const ui = require('../../vilda_lab_assessment_ui.js');

function evaluate(overrides = {}) {
  return engine.evaluate({
    analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M', age: { years: 60, precision: 'year' },
    contextBasis: 'current-patient', referenceSelection: 'automatic', reproductiveContext: 'unknown',
    specimen: 'unknown', measurementKind: 'unknown', assay: { confirmation: 'unknown' }, preterm: 'unknown',
    treatment: { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' }, ...overrides,
  }, data);
}
function documentDouble() {
  const doc = { createElement: (tag) => new Element(tag) };
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.ownerDocument = doc; this._text = ''; }
    set textContent(value) { this.children = []; this._text = String(value); }
    get textContent() { return this._text + this.children.map((child) => child.textContent).join(' '); }
    set innerHTML(_) { throw new Error('HTML assignment is forbidden'); }
    get firstChild() { return this.children[0] || null; }
    appendChild(child) { this.children.push(child); return child; }
    removeChild(child) { this.children = this.children.filter((value) => value !== child); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
  }
  return doc;
}
function descendants(element, predicate) {
  return element.children.flatMap((child) => [...(predicate(child) ? [child] : []), ...descendants(child, predicate)]);
}
function visibleText(element) { return element.tagName === 'details' ? '' : element._text + ' ' + element.children.map(visibleText).join(' '); }
function render(evaluation, historical = false) {
  const container = documentDouble().createElement('main');
  if (historical) ui.renderAssessment(container, snapshot.normalize(JSON.parse(JSON.stringify(snapshot.create(evaluation)))));
  else ui.renderEvaluation(container, evaluation, { live: true });
  return container;
}

describe('Automatyczny LH/FSH — zapis osobnego źródła i rzeczywistej próbki', () => {
  it('przenosi referencyjny profil dorosłego przez przypięcie i historię bez potwierdzania materiału ani metody próbki', () => {
    const evaluation = evaluate();
    const lab = { testKey: 'lh', test: 'LH', value: '2', valueNum: 2, unit: 'IU/L', norm: '', clinicalDateISO: '2026-10-09' };
    const assessment = snapshot.create(evaluation, lab);
    expect(assessment.status).toBe('recorded');
    const stored = JSON.parse(JSON.stringify({ ...lab, assessment }));
    const read = snapshot.forSeries(stored, lab.clinicalDateISO);
    expect(read.assessment).toEqual(assessment);
    expect(read.valueNum).toBe(2);
    expect(read.assessment.evaluation.input).toMatchObject({ referenceSelection: 'automatic', reproductiveContext: 'unknown', specimen: 'unknown', assay: { confirmation: 'unknown', methodId: '', profileId: '' } });
    expect(read.assessment.evaluation.biochemical).toMatchObject({ status: 'unavailable', primary: null });
    expect(read.assessment.evaluation.referenceSelection).toMatchObject({ status: 'selected', profileIds: ['mayo-lh-adult'] });
    expect(read.assessment.evaluation.referencePreview).toMatchObject({ kind: 'automatic-source-reference', byAge: { status: 'within', range: { basis: 'adult', material: 'serum', bounds: { lower: { value: 1.3 }, upper: { value: 9.6 } } } } });
    expect(read.assessment.evaluation.referencePreview.reasonCodes).toEqual(expect.arrayContaining(['source_method_unconfirmed', 'specimen_unconfirmed']));
    expect(read.assessment.evaluation.provenance.selectionPolicyId).toBe(data.automaticReferencePolicy.id);
    expect(read.assessment.evaluation.provenance.selectionPolicyVersion).toBe(data.automaticReferencePolicy.version);
  });

  it.each(['lh', 'fsh'])('nie redukuje czterech wariantów kobiety %s do pojedynczego zakresu przy odczycie', (analyte) => {
    const assessment = snapshot.create(evaluate({ analyte, sex: 'F', value: '20' }));
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation.referenceSelection.status).toBe('variants');
    expect(assessment.evaluation.referencePreview.byAge.status).toBe('unavailable');
    expect(assessment.evaluation.referencePreview.variants.map((variant) => variant.reproductiveContext)).toEqual(['follicular', 'ovulation', 'luteal', 'postmenopause']);
    expect(assessment.evaluation.referencePreview.variants.every((variant) => variant.comparison.range.basis === 'adult')).toBe(true);
    expect(snapshot.normalize(JSON.parse(JSON.stringify(assessment)))).toEqual(assessment);
  });

  it('zachowuje profile i zakresy z obu stron niepewnej granicy wieku 18 lat', () => {
    const assessment = snapshot.create(evaluate({ age: { years: 18, precision: 'year' } }));
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation.referenceSelection).toMatchObject({ status: 'variants', profileIds: ['mayo-lh-standard-transition', 'mayo-lh-adult'] });
    expect(assessment.evaluation.provenance).toMatchObject({ profileId: null, profileVersion: null });
    expect(assessment.evaluation.referencePreview.variants.map((variant) => variant.comparison.range.basis)).toEqual(['age-transition', 'adult']);
    expect(snapshot.normalize(JSON.parse(JSON.stringify(assessment)))).toEqual(assessment);
  });

  it('zachowuje osobną ocenę G3, gdy tylko przedział wieku przecina pediatryczne zakresy FSH', () => {
    const evaluation = evaluate({ analyte: 'fsh', age: { years: 10, months: 0, precision: 'month' }, puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true } });
    const assessment = snapshot.create(evaluation);
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation.referencePreview.byStage).toMatchObject({ status: 'within', range: { stage: { kind: 'G', value: 3 } } });
    expect(assessment.evaluation.referencePreview.variants).toHaveLength(2);
  });

  it('przechowuje automatycznie dobrany zakres wcześniaka razem z kwalifikacją dniową', () => {
    const assessment = snapshot.create(evaluate({ age: null, preterm: 'yes', neonatalAge: { postnatalDays: { lower: 43, upper: 43, source: 'manual-completed-days' }, gestationalDays: { lower: 200, upper: 200, source: 'patient-record' } } }));
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation.referencePreview.byAge.range).toMatchObject({ basis: 'preterm', age: { axis: 'postmenstrualDays' } });
    expect(assessment.evaluation.neonatalAge.postmenstrualDays).toEqual({ lower: 243, upper: 243 });
    expect(assessment.evaluation.input.specimen).toBe('unknown');
    expect(snapshot.normalize(JSON.parse(JSON.stringify(assessment)))).toEqual(assessment);
  });

  it.each([
    { measurementKind: 'stimulated' },
    { treatment: { context: 'hormonal', gnrha: 'unknown', sexSteroids: 'unknown' } },
    { specimen: 'urine' },
    { assay: { methodId: 'other-method', confirmation: 'reported' } },
    { reproductiveContext: 'invalid-context' },
  ])('zachowuje jawną blokadę niepasującego kontekstu %j', (input) => {
    const assessment = snapshot.create(evaluate(input));
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation.referenceSelection.status).toBe('unavailable');
    expect(assessment.evaluation.referencePreview).toBeUndefined();
    expect(snapshot.normalize(JSON.parse(JSON.stringify(assessment)))).toEqual(assessment);
  });

  it('zgodna rzeczywiście zgłoszona metoda nie jest opisywana jako niepotwierdzona, nadal zapis pozostaje referencyjny', () => {
    const profile = data.profiles.find((item) => item.id === 'mayo-lh-adult');
    const assessment = snapshot.create(evaluate({ specimen: 'serum', measurementKind: 'basal', assay: { methodId: profile.method.id, confirmation: 'reported' }, treatment: { context: 'none', gnrha: 'no', sexSteroids: 'no' } }));
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation.referencePreview.reasonCodes).not.toContain('source_method_unconfirmed');
    expect(assessment.evaluation.referencePreview.reasonCodes).not.toContain('specimen_unconfirmed');
    expect(assessment.evaluation.biochemical.primary).toBeNull();
  });

  it.each([
    ['brak kwalifikatora wejściowego', (e) => { delete e.input.referenceSelection; }],
    ['brak wybranego profilu', (e) => { delete e.referenceSelection; }],
    ['brak kontekstu w nowym zapisie', (e) => { delete e.input.reproductiveContext; }],
    ['inna polityka odczytu', (e) => { e.referenceSelection.mode = 'confirmed'; }],
    ['brak wersji polityki', (e) => { delete e.provenance.selectionPolicyVersion; }],
    ['błędny kontekst', (e) => { e.input.reproductiveContext = 'pregnancy'; }],
    ['brak warunkowości metody', (e) => { e.referencePreview.reasonCodes = e.referencePreview.reasonCodes.filter((code) => code !== 'source_method_unconfirmed'); }],
    ['brak warunkowości materiału', (e) => { e.referencePreview.reasonCodes = e.referencePreview.reasonCodes.filter((code) => code !== 'specimen_unconfirmed'); }],
    ['potwierdzona inna metoda', (e) => { e.input.assay = { ...e.input.assay, confirmation: 'reported', methodId: 'other' }; e.referencePreview.reasonCodes = e.referencePreview.reasonCodes.filter((code) => code !== 'source_method_unconfirmed'); }],
    ['materiał inny niż surowica', (e) => { e.input.specimen = 'urine'; }],
    ['podmieniona metoda zakresu', (e) => { e.referencePreview.byAge.range.method.id = ''; }],
    ['podmieniona płeć zakresu', (e) => { e.referencePreview.byAge.range.sex = 'F'; }],
    ['ujemne granice zakresu', (e) => { e.referencePreview.byAge.range.bounds.lower.value = -1; }],
    ['odwrócone granice zakresu', (e) => { e.referencePreview.byAge.range.bounds.lower.value = 100; }],
    ['niezgodny profil zakresu', (e) => { e.referenceSelection.profileIds = ['other']; }],
    ['niezgodna wersja zakresu', (e) => { e.provenance.profileVersion = 'other'; }],
    ['awans do pewnej biochemii', (e) => { e.biochemical.status = 'available'; e.biochemical.primary = 'age'; e.biochemical.byAge = e.referencePreview.byAge; }],
  ])('odrzuca uszkodzony zapis referencyjny: %s', (_label, mutate) => {
    const assessment = snapshot.create(evaluate());
    mutate(assessment.evaluation);
    expect(snapshot.normalize(assessment).status).toBe('unavailable');
  });

  it.each([
    ['usunięte warianty', (e) => { delete e.referencePreview.variants; }],
    ['jeden wariant udający wiele', (e) => { e.referencePreview.variants.length = 1; }],
    ['powtórzone identyfikatory', (e) => { e.referencePreview.variants[1].id = e.referencePreview.variants[0].id; }],
    ['brak kontekstu wariantu', (e) => { delete e.referencePreview.variants[0].reproductiveContext; }],
    ['nieznany zamiast konkretnego kontekstu', (e) => { e.referencePreview.variants[0].reproductiveContext = 'unknown'; }],
    ['wybór jednej fazy przy nieznanym cyklu', (e) => { e.referencePreview.byAge = e.referencePreview.variants[0].comparison; }],
    ['inna faza niż zgłoszona', (e) => { e.input.reproductiveContext = 'follicular'; }],
    ['wariant bez zakresu', (e) => { e.referencePreview.variants[0].comparison.range = null; }],
  ])('odrzuca uszkodzony zapis wariantów: %s', (_label, mutate) => {
    const assessment = snapshot.create(evaluate({ sex: 'F' }));
    mutate(assessment.evaluation);
    expect(snapshot.normalize(assessment).status).toBe('unavailable');
  });

  it('dawny zapis explicit nie otrzymuje pól automatycznych, nowego kontekstu ani nowych zakresów', () => {
    const legacy = snapshot.create(engine.evaluate({ analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M', age: { years: 6, precision: 'year' }, specimen: 'serum', measurementKind: 'basal', assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' }, puberty: { kind: 'G', stage: 3, appliesToSample: true }, treatment: { gnrha: 'no', sexSteroids: 'no' } }, data));
    expect(legacy.status).toBe('recorded');
    expect(legacy.evaluation.input).not.toHaveProperty('referenceSelection');
    expect(legacy.evaluation.input).not.toHaveProperty('reproductiveContext');
    expect(legacy.evaluation).not.toHaveProperty('referenceSelection');
    expect(legacy.evaluation.provenance).not.toHaveProperty('selectionPolicyId');
    expect(snapshot.normalize(JSON.parse(JSON.stringify(legacy)))).toEqual(legacy);
  });
});

describe('Automatyczny LH/FSH — prezentacja dorosłych i wariantów', () => {
  it('mężczyzna widzi jedną oś i jedną notkę, bez pediatrycznej oceny pokwitania', () => {
    const container = render(evaluate());
    expect(descendants(container, (node) => node.getAttribute('role') === 'img')).toHaveLength(1);
    expect(descendants(container, (node) => node.getAttribute('data-applicability') === 'source-reference')).toHaveLength(1);
    expect(descendants(container, (node) => node.getAttribute('data-reference-conditions') === 'automatic-source-reference')).toHaveLength(1);
    expect(visibleText(container)).toContain('Dla mężczyzn');
    expect(visibleText(container)).toContain('W zakresie');
    expect(visibleText(container)).toContain('porównanie orientacyjne');
    expect(visibleText(container)).toContain('bazalnych w surowicy bez leczenia hormonalnego');
    expect(container.textContent).not.toMatch(/metoda próbki niepotwierdzona|metoda badania pacjenta nie została potwierdzona/i);
    expect(container.textContent).not.toMatch(/Rozwój płciowy|Dla stadium|Brak pokwitania|kliniczny nie obejmuje/);
  });

  it('stara konfiguracja Greaves nie zmienia prezentacji automatycznie wybranego profilu dorosłego', () => {
    const evaluation = evaluate({ age: { years: 70, precision: 'year' }, assay: { profileId: 'greaves-preterm-lh-candidate', methodId: 'roche-cobas-e601-lh-greaves-2015', confirmation: 'configured' } });
    expect(evaluation.referenceSelection.profileIds).toEqual(['mayo-lh-adult']);
    expect(snapshot.create(evaluation).status).toBe('recorded');
    expect(ui.buildView(evaluation).pretermProfile).toBe(false);
    expect(ui.buildView(evaluation).presentation.context.some((row) => row.value.includes('e601'))).toBe(false);
    const container = render(evaluation, true);
    expect(visibleText(container)).toContain('Dla mężczyzn');
    expect(visibleText(container)).not.toContain('Dla wcześniaka');
  });

  it('zgłoszona inna metoda próbki nie otrzymuje etykiety metody źródłowej', () => {
    const view = ui.buildView(evaluate({ assay: { methodId: 'other', confirmation: 'reported' } }));
    expect(view.presentation.context.find((row) => row.label === 'Metoda').value).toContain('metoda podana dla próbki');
    expect(view.presentation.context.find((row) => row.label === 'Metoda').value).not.toContain('metoda zakresu źródłowego');
  });

  it('nieznany cykl daje cztery spokojne wiersze zakresów, bez osi ani wspólnej klasyfikacji', () => {
    const evaluation = evaluate({ sex: 'F', analyte: 'fsh', value: '20' });
    const view = ui.buildView(evaluation), container = render(evaluation);
    expect(view.result.visualState).toBe('');
    expect(view.result.visualAlert).toBeNull();
    expect(descendants(container, (node) => node.getAttribute('role') === 'img')).toHaveLength(0);
    const rows = descendants(container, (node) => node.getAttribute('data-comparison') === 'variant');
    expect(rows).toHaveLength(4);
    expect(rows.map((node) => node.getAttribute('data-reproductive-context'))).toEqual(['follicular', 'ovulation', 'luteal', 'postmenopause']);
    expect(rows.every((node) => node.getAttribute('data-status') === null)).toBe(true);
    expect(visibleText(container)).toContain('16–157 IU/L');
    expect(visibleText(container)).not.toMatch(/W zakresie|Powyżej|Poniżej|Dla stadium|Brak dopasowanej/);
  });

  it('jednoznaczna faza daje pojedynczą oś; znamienne odchylenie zachowuje animację z etykietą zakresu referencyjnego', () => {
    const evaluation = evaluate({ sex: 'F', analyte: 'fsh', value: '40', reproductiveContext: 'follicular' });
    const view = ui.buildView(evaluation), container = render(evaluation);
    expect(view.result.visualState).toBe('is-uwaga-high');
    expect(view.result.visualAlert.label).toBe('Uwaga — znacznie powyżej zakresu referencyjnego');
    expect(descendants(container, (node) => (node.className || '').includes('vilda-lab-axis-marker above is-uwaga-high'))).toHaveLength(1);
    expect(visibleText(container)).toContain('Faza folikularna');
    expect(visibleText(container)).toContain('orientacyjnie');
    expect(visibleText(container)).not.toMatch(/normy|Warunkowo|warunkowo|Dla stadium/);
  });

  it('pediatryczne warianty wieku zachowują niezależną oś G3', () => {
    const container = render(evaluate({ analyte: 'fsh', age: { years: 10, months: 0, precision: 'month' }, puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true } }));
    expect(descendants(container, (node) => node.getAttribute('data-comparison') === 'variant')).toHaveLength(2);
    expect(descendants(container, (node) => node.getAttribute('role') === 'img')).toHaveLength(1);
    expect(visibleText(container)).toContain('Dla stadium G3');
  });

  it('na granicy 18 lat wyświetla polskie granice wieku zamiast technicznego opisu źródła', () => {
    const container = render(evaluate({ age: { years: 18, precision: 'year' } }));
    const rows = descendants(container, (node) => node.getAttribute('data-comparison') === 'variant');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Wiek >14 i ≤18 lat');
    expect(rows[1].textContent).toContain('Wiek >18 lat');
    expect(visibleText(container)).not.toMatch(/years|application routing|Adult|context/);
  });

  it('starsze niemowlę poza profilem wcześniaczym nie jest proszone o niewidoczne pola GA/PNA', () => {
    const container = render(evaluate({ preterm: 'yes', age: { years: 0, months: 3, precision: 'month' } }));
    expect(visibleText(container)).toContain('Wiek dziecka jest poza okresem objętym profilem wcześniaczym.');
    expect(visibleText(container)).not.toMatch(/Uzupełnij wiek ciążowy|Uzupełnij ukończone dni/);
  });

  it('u dziecka zachowuje istotny alarm rozwoju i dwie niezależne osie', () => {
    const evaluation = evaluate({ age: { years: 2, months: 9, precision: 'month' }, puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true } });
    const container = render(evaluation);
    expect(visibleText(container)).toContain(evaluation.clinical.title);
    expect(visibleText(container)).toContain('Dla wieku');
    expect(visibleText(container)).toContain('Dla stadium G3');
    expect(descendants(container, (node) => node.getAttribute('role') === 'img')).toHaveLength(2);
  });

  it.each([{ measurementKind: 'stimulated' }, { specimen: 'urine' }, { assay: { methodId: 'other', confirmation: 'reported' } }])('znany niepasujący kontekst ma jasną blokadę %j', (input) => {
    const container = render(evaluate(input));
    expect(descendants(container, (node) => node.getAttribute('data-reference-block') === 'true')).toHaveLength(1);
    expect(descendants(container, (node) => node.getAttribute('role') === 'img')).toHaveLength(0);
    expect(visibleText(container)).not.toMatch(/Brak dopasowanej oceny|Dla stadium/);
  });

  it('historyczne auto zachowuje warianty bez odwołania do bieżącego zegara', () => {
    const evaluation = evaluate({ sex: 'F', analyte: 'fsh', value: '20' });
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('No current date in historical presentation'); });
    try {
      const container = render(evaluation, true);
      expect(descendants(container, (node) => node.getAttribute('data-comparison') === 'variant')).toHaveLength(4);
      expect(visibleText(container)).toContain('Po menopauzie');
      expect(clock).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  });
});
