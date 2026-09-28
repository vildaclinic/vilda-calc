// Ponowna synchronizacja wartości tokenów ze stylów aplikacji.
// Opisy (usage), nazwy, podział na rodziny i style tekstu są kuratorowane w src/project/tokens.json;
// ten moduł odświeża wyłącznie WARTOŚCI tokenów, które mają odpowiednik --nazwa w źródłach
// (albo wpis w src/derived.json, gdy wartość pochodzi ze zwykłej właściwości reguły motywu).
import { THEMES, resolveCustomProperty, declaredCustomProperties, propertyOfSelector } from './cascade.mjs';

const OBSERVED = /zaobserwowan|nazwa syntetyczna/i;
const FORBIDDEN_ANY = /var\(|calc\(|env\(|clamp\(|color-mix\(/i;
const NAMED_COLOURS = /^(transparent|inherit|currentcolor|none|initial|unset|white|black)$/i;
const THEMED_FAMILIES = new Set(['color', 'shadow']);

function normalizeValue(raw) {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/#[0-9A-Fa-f]{3,8}\b/g, (m) => m.toLowerCase());
}

function splitBlurSaturate(value) {
  const blur = /blur\([^)]*\)/.exec(value);
  const sat = /saturate\([^)]*\)/.exec(value);
  return { blur: blur ? blur[0] : null, saturate: sat ? sat[0] : null };
}

/**
 * Zamienia surową wartość ze źródła na wartość tokenu w gramatyce strony.
 * @returns {{value?: string, saturate?: string, skip?: string}}
 */
function toTokenValue(raw, family, colourNames) {
  let value = normalizeValue(raw);
  const varMatch = /^var\(--([\w-]+)(?:\s*,\s*([\s\S]*))?\)$/.exec(value);
  if (varMatch) {
    if (family === 'color' && colourNames.has(varMatch[1])) return { value: `{${varMatch[1]}}` };
    if (varMatch[2]) value = normalizeValue(varMatch[2]);
    else return { skip: `alias var(--${varMatch[1]}) bez wartości zapasowej` };
  }
  if (family === 'color' && NAMED_COLOURS.test(value)) return { skip: `nazwa koloru „${value}” nie jest wartością tokenu` };
  if (family === 'gradient') {
    if (/var\(/.test(value)) return { skip: 'gradient zawiera var()' };
    return { value };
  }
  if (FORBIDDEN_ANY.test(value)) return { skip: `wartość „${value.slice(0, 60)}” zawiera funkcję niedozwoloną w tokenie` };
  if (family === 'blur') {
    const parts = splitBlurSaturate(value);
    if (parts.blur && parts.saturate) return { value: parts.blur, saturate: parts.saturate };
    return { value };
  }
  return { value };
}

function seedValueFor(token, themeId) {
  if (typeof token.value === 'string') return themeId === 'light' ? token.value : undefined;
  return token.value ? token.value[themeId] : undefined;
}

/**
 * Odświeża wartości tokenów (na kopii) i zwraca raport.
 * @param {object} tokens zawartość src/project/tokens.json
 * @param {Array<object>} rules reguły ze wszystkich źródeł
 * @param {{derived?: object}} options
 */
export function resyncTokens(tokens, rules, options = {}) {
  const out = JSON.parse(JSON.stringify(tokens));
  const derived = options.derived || {};
  const declared = declaredCustomProperties(rules);
  const colourNames = new Set(out.color.tokens.map((t) => t.name));
  const report = { changed: [], skipped: [], missing: [], newProps: [] };
  const seen = new Set();
  const themeIds = out.color.themes.map((t) => t.id);

  for (const [family, body] of Object.entries(out)) {
    if (!body || !Array.isArray(body.tokens)) continue;
    const themed = THEMED_FAMILIES.has(family);
    const byName = new Map(body.tokens.map((t) => [t.name, t]));
    for (const token of body.tokens) {
      seen.add(token.name);
      if (OBSERVED.test(token.usage || '')) continue;
      if (family === 'blur' && token.name.endsWith('-saturate')) continue;
      const derivedSpec = derived[token.name] || {};
      if (!declared.has(token.name) && !Object.keys(derivedSpec).length) { report.missing.push({ family, name: token.name }); continue; }

      const resolved = {};
      const skips = [];
      for (const id of themed ? themeIds : ['light']) {
        const theme = THEMES[id];
        if (!theme) continue;
        if (derivedSpec[id]) {
          const found = propertyOfSelector(rules, derivedSpec[id].selector, derivedSpec[id].property);
          if (found) { resolved[id] = { value: normalizeValue(found.value), file: found.file, selector: found.selector }; continue; }
        }
        const win = resolveCustomProperty(token.name, rules, theme);
        if (!win) continue;
        const conv = toTokenValue(win.value, family, colourNames);
        if (conv.skip) { skips.push(`${id}: ${conv.skip}`); resolved[id] = { keep: true }; continue; }
        resolved[id] = { value: conv.value, saturate: conv.saturate, file: win.rule.file, selector: win.selector };
      }
      const usable = Object.values(resolved).filter((r) => !r.keep);
      if (!usable.length) {
        if (skips.length) report.skipped.push({ family, name: token.name, reason: skips.join('; ') });
        continue; // brak reprezentowalnej deklaracji: wartość kuratorowana zostaje
      }
      if (skips.length) report.skipped.push({ family, name: token.name, reason: `${skips.join('; ')} — wartość kuratorowana zostaje` });

      // tokeny hc-* nie mają deklaracji w motywie domyślnym: motyw domyślny pożycza pierwszą dostępną (konwencja pliku)
      if (!resolved.light && /^hc-/.test(token.name)) {
        const first = themeIds.find((id) => resolved[id] && !resolved[id].keep);
        if (first) resolved.light = { ...resolved[first], borrowed: first };
      }
      if (!resolved.light) continue;

      const valueFor = (id) => {
        const r = resolved[id];
        if (!r) return undefined;
        if (r.keep) return seedValueFor(token, id);
        return r.value;
      };
      let next;
      if (themed) {
        const light = valueFor('light');
        if (light === undefined) continue;
        next = { light };
        for (const id of themeIds.slice(1)) {
          const v = valueFor(id);
          if (v === undefined) continue;
          if (v !== light || seedValueFor(token, id) !== undefined) next[id] = v;
        }
        if (Object.keys(next).length === 1 && typeof token.value === 'string') next = next.light;
      } else {
        next = valueFor('light');
        if (next === undefined) continue;
      }
      applyChange(report, family, token, next, resolved);
      if (family === 'blur' && resolved.light.saturate) {
        const sibling = byName.get(`${token.name}-saturate`);
        if (sibling && sibling.value !== resolved.light.saturate) {
          report.changed.push({ family, name: sibling.name, theme: 'light', from: sibling.value, to: resolved.light.saturate, file: resolved.light.file, selector: resolved.light.selector });
          sibling.value = resolved.light.saturate;
        }
      }
    }
  }

  for (const [name, decls] of declared) {
    if (seen.has(name)) continue;
    const d = decls[0];
    report.newProps.push({ name, value: d.value.slice(0, 120), file: d.file, selector: d.selector.slice(0, 80), declarations: decls.length });
  }
  report.newProps.sort((a, b) => a.name.localeCompare(b.name));
  return { tokens: out, report };
}

function applyChange(report, family, token, next, resolved) {
  const before = token.value;
  if (JSON.stringify(before) === JSON.stringify(next)) return;
  const beforeMap = typeof before === 'object' && before ? before : { light: before };
  const nextMap = typeof next === 'object' && next ? next : { light: next };
  for (const id of new Set([...Object.keys(beforeMap), ...Object.keys(nextMap)])) {
    const from = beforeMap[id];
    const to = nextMap[id];
    if (from === to) continue;
    const src = resolved[id] && !resolved[id].keep ? resolved[id] : resolved.light;
    report.changed.push({ family, name: token.name, theme: id, from, to, file: src ? src.file : '', selector: src ? src.selector : '' });
  }
  token.value = next;
}
