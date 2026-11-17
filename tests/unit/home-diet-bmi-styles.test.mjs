import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalSelector, parseCss, specificity, splitTopLevel } from '../../design-system/lib/css.mjs';
import { mapaWartosci, tokenizuj } from '../support/tokeny-css.mjs';
import { zlozony } from '../support/skorka-css.mjs';
import { buildHomeDietBmiStyles, canonicalHomeDietBmiStyles, extractNativeBmiJourneyStyles, verifyHomeDietBmiStyles } from '../../tools/build-home-diet-bmi-styles.mjs';

const nativeSource = readFileSync(new URL('../../vilda_bmi_journey.js', import.meta.url), 'utf8');
const nativeCss = extractNativeBmiJourneyStyles(nativeSource);
const scope = '#vhomeDietDialog .vhome-diet-native-road';

// The application skin is always enabled. Compare the native cascade's winners
// with the derived sheet, while retaining every selector/property/media key.
function winningDeclarations(css, native = false) {
  const winners = new Map();
  for (const rule of parseCss(css)) for (const original of splitTopLevel(rule.selector, ',')) {
    let selector = zlozony(original) || original.trim();
    if (native) selector = selector.includes('#bmiJourneyMount')
      ? selector.replace(/#bmiJourneyMount\b/g, scope) : scope + ' ' + selector;
    selector = canonicalSelector(selector);
    rule.declarations.forEach((declaration, index) => {
      const key = JSON.stringify([rule.media, selector, declaration.prop]);
      const priority = [Number(declaration.important), specificity(original), rule.order, index];
      const before = winners.get(key);
      const difference = before && priority.map((value, i) => value - before.priority[i]).find(value => value !== 0);
      if (!before || difference > 0) winners.set(key, { priority, declaration });
    });
  }
  return [...winners].map(([key, value]) => [key, value.declaration]).sort(([a], [b]) => a.localeCompare(b));
}

describe('home diet dialog reuses the complete native BMI journey stylesheet', () => {
  it('reproduces the artifact and preserves every native winning declaration and media context with the always-on skin', () => {
    const generated = verifyHomeDietBmiStyles();
    expect(generated).toBe(buildHomeDietBmiStyles());
    expect(winningDeclarations(generated))
      .toEqual(winningDeclarations(tokenizuj(nativeCss, mapaWartosci().mapa).text, true));
    expect(tokenizuj(generated, mapaWartosci().mapa).zamiany).toEqual([]);
  });

  it('confines all rules to the cloned road, retains warning/disabled selectors and removes dead skin overrides', () => {
    const generated = buildHomeDietBmiStyles(), rules = parseCss(generated);
    expect(generated).not.toContain('#bmiJourneyMount');
    for (const rule of rules) for (const selector of splitTopLevel(rule.selector, ',')) expect(selector).toContain(scope);
    expect(generated).not.toContain('.liquid-ios26');
    expect(generated).toContain(scope + ' .bmi-journey-warn');
    expect(generated).toContain(scope + ' .bmi-journey-badge');
    expect(generated).toContain(scope + ' .bmi-journey-seg button:disabled');
    const nativeRules = parseCss(nativeCss), skinRules = nativeRules.filter(rule => rule.selector.includes('.liquid-ios26'));
    expect(skinRules).toHaveLength(3);
    expect(skinRules.reduce((count, rule) => count + rule.declarations.length, 0)).toBe(12);
    expect(rules).toHaveLength(nativeRules.length - skinRules.length);
    const declarations = rules.flatMap(rule => splitTopLevel(rule.selector, ',').flatMap(selector => rule.declarations
      .map(declaration => JSON.stringify([rule.media, canonicalSelector(selector), declaration.prop]))));
    expect(new Set(declarations).size).toBe(declarations.length);
  });

  it('folds native palette, gain and badge values without changing unrelated declarations or media', () => {
    const base = `${scope}{--bj-muted:#5b6f6f;--bj-kcalbg:rgba(46,143,87,.14)}
      ${scope} .bmi-journey-gain span{background:rgba(46,143,87,.14)}
      ${scope} .bmi-journey-badge{background:rgba(176,116,31,.13);color:#8a5c17}
      @media(max-width:680px){${scope} .unchanged{font-size:16px;color:teal!important}}`;
    const overrides = `.liquid-ios26 ${scope}{--bj-muted:#28494b;--bj-kcalbg:rgba(46,143,87,.16)}
      .liquid-ios26 ${scope} .bmi-journey-gain span{background:rgba(46,143,87,.16)}
      .liquid-ios26 ${scope} .bmi-journey-badge{background:rgba(255,244,214,.55);color:#6d4a12}`;
    const canonical = canonicalHomeDietBmiStyles(base + overrides);
    expect(canonical).not.toContain('.liquid-ios26');
    expect(parseCss(canonical).map(rule => ({ selector: rule.selector, declarations: rule.declarations, media: rule.media })))
      .toEqual(parseCss(base.replace('--bj-muted:#5b6f6f', '--bj-muted:#28494b')
        .replaceAll('rgba(46,143,87,.14)', 'rgba(46,143,87,.16)')
        .replace('rgba(176,116,31,.13)', 'rgba(255,244,214,.55)').replace('#8a5c17', '#6d4a12'))
        .map(rule => ({ selector: rule.selector, declarations: rule.declarations, media: rule.media })));
  });

  it.each([
    ['behavioral properties', `${scope}{display:block}.liquid-ios26 ${scope}{display:none}`],
    ['missing bases', `.liquid-ios26 ${scope}{color:teal}`],
    ['ambiguous bases', `${scope}{color:red}${scope}{color:blue}.liquid-ios26 ${scope}{color:teal}`],
    ['importance changes', `${scope}{color:red!important}.liquid-ios26 ${scope}{color:teal}`],
    ['different media contexts', `@media(max-width:680px){${scope}{color:red}}.liquid-ios26 ${scope}{color:teal}`],
  ])('refuses unsafe skin folds: %s', (_reason, css) => {
    expect(() => canonicalHomeDietBmiStyles(css)).toThrow();
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
