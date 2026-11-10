import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_ktv_reference_data.js', 'clcr_ktv.js', 'clcr_ktv_ui.js', 'clcr_ui_workflow.js']) loadBrowserScript(file, browser);
const policy = browser.VildaClcrKtvReferenceData.DEFAULT_POLICY;
const base = { variant: 'spktv', preUrea: '120', postUrea: '36', durationMinutes: '240', netUfLiters: '2', postWeightKg: '70', sessionsPerWeek: '3', pidiDays: '2', accessType: 'AVF', ageYears: '50', evaluationDate: '2026-11-06' };
const decode = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// Only the DOM boundary is synthetic: result calculation, rendered metadata,
// snapshot validation and the patient-result collector are production code.
function node(attributes, { classes = [], text = '', visible = true } = {}) {
  return { getAttribute: key => attributes[key] ?? null, hasAttribute: key => Object.hasOwn(attributes, key),
    classList: { contains: key => classes.includes(key) }, textContent: text,
    getClientRects: () => visible ? [{ width: 100, height: 100 }] : [], querySelector: () => null };
}
function renderedNode(model) {
  const html = browser.ClcrKtvUi.renderResult(model);
  const openingTag = html.slice(0, html.indexOf('>') + 1);
  const attributes = Object.fromEntries([...openingTag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]));
  return node(attributes, { classes: attributes.class.split(/\s+/), text: `Wynik ${model.display.text}` });
}
function collect(nodes) {
  const scope = { querySelectorAll: selector => selector === '[data-clcr-series]' ? nodes : [] };
  return browser.ClcrVisitSave.collectActiveDatapoints(scope, { formulaId: 'KTV' });
}

describe('KTV — rzeczywisty kolektor oceny i surowej liczby', () => {
  it.each([
    ['warning', 'true', ['warn-yellow'], true],
    ['success', 'false', [], false],
    ['neutral', 'null', [], null],
  ])('historyczna karta %s zachowuje jawny stan %s', (tone, declared, classes, expected) => {
    const legacy = node({ 'data-clcr-series': 'KTV_spktv', 'data-clcr-formula': 'KTV', 'data-clcr-value': '1.3',
      'data-clcr-display-value': '1.30', 'data-clcr-tone': tone, 'data-clcr-out-of-range': declared }, { classes, text: 'spKt/V 1,30' });
    const points = collect([legacy]);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ id: 'KTV_spktv', valueNum: 1.3, rawValue: 1.3, tone, outOfRange: expected });
  });

  it.each([
    ['spktv', '36.0333423474967', 1.39999, 'below-target'],
    ['ektv', '36', 1.2227380474970135, 'within'],
    ['urr', '36.0000012', 69.999999, 'below-target'],
  ])('nowa karta %s zachowuje surową precyzję i wyłącznie wybraną serię', (variant, postUrea, expectedRaw, expectedStatus) => {
    const model = browser.VildaClcrKtv.evaluate({ ...base, variant, postUrea }, policy);
    expect(model.valid).toBe(true);
    const hiddenPrevious = node({ 'data-clcr-series': variant === 'urr' ? 'KTV_spktv' : 'KTV_urr', 'data-clcr-value': '1' }, { visible: false });
    const points = collect([hiddenPrevious, renderedNode(model)]);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ id: `KTV_${variant}`, rawValue: model.rawValue, valueNum: model.rawValue, outOfRange: model.outOfRange, ktvSnapshot: { status: expectedStatus, rawValue: model.rawValue } });
    expect(points[0].valueNum).toBeCloseTo(expectedRaw, 13);
    expect(points[0].displayValue).toBe(model.display.text);
    expect(JSON.parse(JSON.stringify(points[0])).valueNum).toBe(model.rawValue);
    if (variant === 'spktv') expect(points[0].valueNum).toBeLessThan(1.4);
    if (variant === 'urr') expect(points[0].valueNum).toBeLessThan(70);
  });

  it('typed URR poniżej 70 zachowuje ocenę, gdy najbliższy Number wynosi dokładnie 70', () => {
    const model = browser.VildaClcrKtv.evaluate({ ...base, variant: 'urr', preUrea: '11', postUrea: '3.3000000000000003' }, policy);
    expect(model).toMatchObject({ rawValue: 70, status: 'below-target', outOfRange: true, display: { text: '<70,0' } });
    const [point] = collect([renderedNode(model)]);
    expect(point).toMatchObject({ valueNum: 70, rawValue: 70, displayValue: '<70,0', outOfRange: true, assessment: 'below', tone: 'warning' });
    expect(point.ktvSnapshot.exactValue).toEqual(model.exactValue);
  });
});
