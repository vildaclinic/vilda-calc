import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCss, splitTopLevel } from '../../design-system/lib/css.mjs';
import { mapaWartosci, tokenizuj } from '../support/tokeny-css.mjs';
import { buildHomeDietBmiStyles, extractNativeBmiJourneyStyles, verifyHomeDietBmiStyles } from '../../tools/build-home-diet-bmi-styles.mjs';

const nativeSource = readFileSync(new URL('../../vilda_bmi_journey.js', import.meta.url), 'utf8');
const nativeCss = extractNativeBmiJourneyStyles(nativeSource);
const scope = '#vhomeDietDialog .vhome-diet-native-road';

describe('home diet dialog reuses the complete native BMI journey stylesheet', () => {
  it('reproduces the checked-in artifact and preserves every native declaration and media context', () => {
    const generated = verifyHomeDietBmiStyles();
    expect(generated).toBe(buildHomeDietBmiStyles());
    const native = parseCss(tokenizuj(nativeCss, mapaWartosci().mapa).text);
    const derived = parseCss(generated);
    expect(derived.map(rule => ({ declarations: rule.declarations, media: rule.media })))
      .toEqual(native.map(rule => ({ declarations: rule.declarations, media: rule.media })));
    expect(tokenizuj(generated, mapaWartosci().mapa).zamiany).toEqual([]);
  });

  it('confines all rules to the cloned road and retains native liquid, warning and disabled selectors', () => {
    const generated = buildHomeDietBmiStyles(), rules = parseCss(generated);
    expect(generated).not.toContain('#bmiJourneyMount');
    for (const rule of rules) for (const selector of splitTopLevel(rule.selector, ',')) expect(selector).toContain(scope);
    expect(generated).toContain('.liquid-ios26 ' + scope);
    expect(generated).toContain(scope + ' .bmi-journey-warn');
    expect(generated).toContain(scope + ' .bmi-journey-badge');
    expect(generated).toContain(scope + ' .bmi-journey-seg button:disabled');
  });

  it('reads only static literal concatenation and refuses dynamic or ambiguous source without evaluation', () => {
    const css = '#bmiJourneyMount{color:red}';
    expect(extractNativeBmiJourneyStyles("function ensureStyles(){var css='#bmiJourneyMount'+'{color:red}';}" )).toBe(css);
    expect(() => extractNativeBmiJourneyStyles('function ensureStyles(){var css=runClinicalModule();}'))
      .toThrow('static string literal');
    expect(() => extractNativeBmiJourneyStyles("function ensureStyles(){var css='#bmiJourneyMount{}';} function ensureStyles(){}"))
      .toThrow('exactly one native ensureStyles');
  });
});
