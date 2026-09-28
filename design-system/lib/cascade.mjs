// Kaskada dla własności niestandardowych: wylicza efektywną wartość tokenu w danym motywie
// (klasy body ustawiane przez ios26-ui.js: liquid-ios26, glass-level-N, high-contrast-level-N,
// dark-bg-level-N) przy desktopowym oknie 1200 px i jasnym schemacie systemowym.
import { expandContrastLevels, splitTopLevel, specificity } from './css.mjs';

export const THEMES = {
  light: { glass: 0, hc: 0, dark: 0 },
  'glass-4': { glass: 4, hc: 0, dark: 0 },
  'high-contrast-1': { glass: 0, hc: 1, dark: 0 },
  'high-contrast-2': { glass: 0, hc: 2, dark: 0 },
  'high-contrast-3': { glass: 0, hc: 3, dark: 0 },
  'dark-bg-1': { glass: 0, hc: 0, dark: 1 },
  'dark-bg-2': { glass: 0, hc: 0, dark: 2 },
};

const VIEWPORT = 1200;
const ABSENT_CLASSES = new Set(['vilda-embedded', 'display-mode-standalone', 'professional-bg', 'js-loading']);
const STATE_PSEUDO = /:(hover|focus|focus-visible|focus-within|active|checked|disabled|visited|target|open|empty|placeholder-shown)\b/;

function mediaApplies(contexts) {
  for (const ctx of contexts) {
    const c = ctx.toLowerCase();
    if (c.startsWith('@supports') || c.startsWith('@layer')) continue;
    if (/prefers-color-scheme\s*:\s*dark/.test(c)) return false;
    if (/prefers-reduced-motion/.test(c) || /\bprint\b/.test(c)) return false;
    const max = /max-width\s*:\s*([\d.]+)(px|rem|em)/.exec(c);
    if (max) { const px = Number(max[1]) * (max[2] === 'px' ? 1 : 16); if (VIEWPORT > px) return false; }
    const min = /min-width\s*:\s*([\d.]+)(px|rem|em)/.exec(c);
    if (min) { const px = Number(min[1]) * (min[2] === 'px' ? 1 : 16); if (VIEWPORT < px) return false; }
    if (/max-height\s*:\s*([\d.]+)px/.test(c)) return false;
  }
  return true;
}

function partApplies(part, theme) {
  if (STATE_PSEUDO.test(part)) return false;
  if (/\[data-theme/.test(part)) return false;
  // wytnij argumenty :not(...) — klasy w negacji nie są wymaganiem obecności
  const stripped = part.replace(/:not\([^)]*\)/g, '');
  // atrybut z wartością na elemencie innym niż html/body to stan (np. [data-ton="nowy"]), nie kontekst strony
  for (const m of stripped.matchAll(/([\w-]*)((?:\.[\w-]+)*)\[([\w-]+)\s*[~|^$*]?=/g)) {
    if (m[1] !== 'html' && m[1] !== 'body') return false;
  }
  for (const m of stripped.matchAll(/\.([\w-]+)/g)) {
    const cls = m[1];
    if (ABSENT_CLASSES.has(cls)) return false;
    let lv;
    if ((lv = /^glass-level-(\d)$/.exec(cls))) { if (Number(lv[1]) !== theme.glass) return false; continue; }
    if ((lv = /^high-contrast-level-(\d)$/.exec(cls))) { if (Number(lv[1]) !== theme.hc) return false; continue; }
    if ((lv = /^dark-bg-level-(\d)$/.exec(cls))) { if (Number(lv[1]) !== theme.dark) return false; continue; }
  }
  return true;
}

/**
 * Zwraca zwycięską deklarację `--name` w motywie albo null.
 * @param {string} name nazwa tokenu bez "--"
 * @param {Array<object>} rules reguły ze wszystkich źródeł (kolejność = kaskada)
 * @param {{glass:number, hc:number, dark:number}} theme
 */
export function resolveCustomProperty(name, rules, theme) {
  const prop = `--${name}`;
  let best = null;
  for (const rule of rules) {
    if (rule.type !== 'style') continue;
    const decls = rule.declarations.filter((d) => d.prop === prop);
    if (!decls.length) continue;
    if (!mediaApplies(rule.media)) continue;
    // P-STYLE rata 3: część z :is(.high-contrast-level-1, -2, -3) to trzy części po jednej na poziom
    const parts = splitTopLevel(rule.selector, ',').map((p) => p.trim()).filter(Boolean).flatMap((p) => expandContrastLevels(p));
    const applicable = parts.filter((p) => partApplies(p, theme));
    if (!applicable.length) continue;
    const spec = Math.max(...applicable.map((p) => specificity(p)));
    const decl = decls[decls.length - 1];
    const key = [decl.important ? 1 : 0, spec, rule.order];
    if (!best || compareKeys(key, best.key) >= 0) best = { key, value: decl.value, important: decl.important, rule, selector: applicable.join(', ') };
  }
  return best;
}

function compareKeys(a, b) {
  for (let k = 0; k < a.length; k++) { if (a[k] !== b[k]) return a[k] - b[k]; }
  return 0;
}

/** Wartość zwykłej właściwości w regule o dokładnie tym selektorze (dla tokenów pochodnych, np. tła strony). */
export function propertyOfSelector(rules, selector, property) {
  let found = null;
  for (const rule of rules) {
    if (rule.type !== 'style' || rule.selector !== selector || !mediaApplies(rule.media)) continue;
    const decl = rule.declarations.filter((d) => d.prop === property).pop();
    if (decl && (!found || decl.important || !found.important)) found = { value: decl.value, important: decl.important, file: rule.file, selector: rule.selector };
  }
  return found;
}

/** Wszystkie nazwy własności niestandardowych zadeklarowane w źródłach. */
export function declaredCustomProperties(rules) {
  const names = new Map();
  for (const rule of rules) {
    if (rule.type !== 'style') continue;
    for (const d of rule.declarations) {
      if (!d.prop.startsWith('--')) continue;
      const n = d.prop.slice(2);
      if (!names.has(n)) names.set(n, []);
      names.get(n).push({ file: rule.file, selector: rule.selector, value: d.value });
    }
  }
  return names;
}
