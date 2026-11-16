// DocPro owns these styles. Generate its result-only subset for the home modal;
// do not load the rest of the DocPro page's styles into the main form.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCss, splitTopLevel } from '../design-system/lib/css.mjs';

const source = new URL('../inline_docpro_00.css', import.meta.url);
const target = new URL('../vilda_sga_birth_results.css', import.meta.url);
const classes = new Set(['source-block', 'source-header', 'summary-box', 'summary-grid',
  'summary-item', 'summary-label', 'summary-value', 'result-grid', 'result-card',
  'note-box', 'meta-box', 'compare-table-stack', 'compare-table-block', 'compare-table-wrap',
  'compare-table', 'compare-value', 'compare-badge', 'compare-grid', 'compare-note',
  'compare-reference-box', 'compare-footnotes'].map(name => 'sga-birth-' + name));

export function buildSgaResultStyles() {
  const css = readFileSync(source, 'utf8');
  const rules = parseCss(css).filter(rule => rule.type === 'style').flatMap(rule => {
    const selectors = splitTopLevel(rule.selector, ',').filter(selector =>
      [...selector.matchAll(/\.([\w-]+)/g)].some(match => classes.has(match[1])));
    if (!selectors.length) return [];
    let output = selectors.join(',\n') + ' {' + css.slice(rule.declStart, rule.declEnd) + '}';
    for (const media of rule.media.slice().reverse()) output = media + ' {\n' + output + '\n}';
    return [output];
  });
  return '/* Generated from inline_docpro_00.css by tools/build-sga-result-styles.mjs. */\n' + rules.join('\n') + '\n';
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== buildSgaResultStyles()) throw Error('SGA result styles differ from DocPro');
  } else writeFileSync(target, buildSgaResultStyles());
}
