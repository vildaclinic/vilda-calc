import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function ui() {
  const window = {};
  loadBrowserScript('vilda_puberty_assessment_ui.js', window);
  return window.VildaPubertyAssessmentUI;
}

describe('shared puberty editor presentation', () => {
  it('summarizes G and P independently, including a previous observation', () => {
    const view = { assessmentContext: { status: 'ready', assessment: {
      sex: 'M', observations: { G: { stage: 3 }, P: { stage: 2 }, Th: null }
    } }, axisStates: { G: { current: false }, P: { current: true } } };
    expect(ui().summary(view, 'M')).toBe('G3 (wcześniej) · P2');
  });

  it('does not turn pubic hair alone into gonadal development', () => {
    expect(ui().summary({ assessment: { sex: 'F', observations: {
      G: null, Th: null, P: { stage: 3 }
    } } }, 'F')).toBe('P3');
  });

  it('retains an unspecified older Tanner as a separate explanatory message', () => {
    expect(ui().summary({ status: 'absent', assessment: null,
      legacy: { kind: 'unspecified', stage: 3 } }, 'M'))
      .toBe('Starszy zapis: Tanner 3 — cecha nieokreślona');
  });

  it('does not present an observation for the other sex as the current axis', () => {
    const view = { assessment: { sex: 'F', observations: {
      G: null, Th: null, P: { stage: 3, sex: 'M' }
    } } };
    expect(ui().summary(view, 'F')).toBe('Nie oceniono stadium');
  });

  it('uses sex-specific P2 descriptions and returns independent copies', () => {
    const presentation = ui();
    const male = presentation.descriptions('P', 'M');
    const female = presentation.descriptions('P', 'F');
    expect(male[1]).toContain('u podstawy prącia');
    expect(female[1]).toContain('wzdłuż warg sromowych');
    female[1] = 'changed';
    expect(presentation.descriptions('P', 'F')[1]).toContain('wzdłuż warg sromowych');
  });

  it('keeps the approved detailed morphology for Th2, Th3, Th4 and Th5', () => {
    const descriptions = ui().descriptions('Th', 'F', true);
    expect(descriptions[1]).toContain('wyczuwalny jest pączek gruczołowy');
    expect(descriptions[2]).toContain('jeden ciągły obrys');
    expect(descriptions[3]).toContain('odrębne, wtórne uwypuklenie');
    expect(descriptions[4]).toContain('Wystaje sama brodawka');
    expect(descriptions.every(description => !/ml|cm/.test(description))).toBe(true);
  });
});
