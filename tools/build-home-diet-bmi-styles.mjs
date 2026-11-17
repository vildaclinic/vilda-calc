// Reuse the native BMI journey presentation inside the home diet dialog.
// Read static CSS only; never execute or edit the clinical module.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'espree';
import { parseCss, splitTopLevel } from '../design-system/lib/css.mjs';
import { mapaWartosci, tokenizuj } from '../tests/support/tokeny-css.mjs';
import { formatujCss } from '../tests/scripts/formatuj-css.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'vilda_bmi_journey.js';
const TARGET = 'vilda_home_diet_bmi.css';
const SCOPE = '#vhomeDietDialog .vhome-diet-native-road';
function fail(message) { throw new Error('Home diet BMI styles: ' + message); }

export function extractNativeBmiJourneyStyles(source) {
  const ast = parse(source, { ecmaVersion: 'latest' }), functions = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && node.id?.name === 'ensureStyles') functions.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast);
  if (functions.length !== 1) fail('expected exactly one native ensureStyles function');
  const declarations = functions[0].body.body.filter(node => node.type === 'VariableDeclaration')
    .flatMap(node => node.declarations).filter(node => node.id.name === 'css');
  if (declarations.length !== 1) fail('expected exactly one native css declaration');
  function staticString(node) {
    if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
    if (node?.type === 'BinaryExpression' && node.operator === '+') return staticString(node.left) + staticString(node.right);
    fail('native css must remain a static string literal or literal concatenation');
  }
  const css = staticString(declarations[0].init);
  if (!css.includes('#bmiJourneyMount')) fail('native mount selector is missing');
  return css;
}

export function buildHomeDietBmiStyles(repository = ROOT) {
  const css = extractNativeBmiJourneyStyles(readFileSync(resolve(repository, SOURCE), 'utf8'));
  const rules = parseCss(css).map(rule => {
    if (rule.type !== 'style') fail('unsupported native at-rule: ' + rule.name);
    const selectors = splitTopLevel(rule.selector, ',').map(selector => {
      selector = selector.trim();
      return /#bmiJourneyMount\b/.test(selector)
        ? selector.replace(/#bmiJourneyMount\b/g, SCOPE) : SCOPE + ' ' + selector;
    });
    let output = selectors.join(',\n') + ' {' + css.slice(rule.declStart, rule.declEnd) + '}';
    for (const media of rule.media.slice().reverse()) output = media + ' {\n' + output + '\n}';
    return output;
  });
  if (!rules.length) fail('native stylesheet is empty');
  const scoped = rules.join('\n'), tokenized = tokenizuj(scoped, mapaWartosci().mapa).text;
  return '/* Generated from vilda_bmi_journey.js ensureStyles() by tools/build-home-diet-bmi-styles.mjs.\n'
    + '   Native declarations and clinical tones are preserved; only selectors and constant tokens are adapted. */\n'
    + formatujCss(tokenized);
}

export function verifyHomeDietBmiStyles(repository = ROOT) {
  const expected = buildHomeDietBmiStyles(repository);
  if (readFileSync(resolve(repository, TARGET), 'utf8') !== expected)
    fail('generated stylesheet differs; run node tools/build-home-diet-bmi-styles.mjs --write');
  return expected;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.length && args[0] !== '--write')
    fail('usage: node tools/build-home-diet-bmi-styles.mjs [--write]');
  const css = args.length ? buildHomeDietBmiStyles() : verifyHomeDietBmiStyles();
  if (args.length) writeFileSync(resolve(ROOT, TARGET), css);
  process.stdout.write('Home diet BMI styles: native presentation ' + (args.length ? 'written' : 'verified') + '.\n');
}
