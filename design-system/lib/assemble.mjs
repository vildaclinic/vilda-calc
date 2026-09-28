// Składanie plików generowanych: bundle.css (partiale + przepisanie selektorów motywów),
// index.d.ts (typy dokumentacyjne komponentów) i tokens.css (do lokalnej kontroli podglądów).
import fs from 'node:fs';
import path from 'node:path';

/**
 * Przepisuje selektory motywów źródła (klasy na body) na kontrakt strony design systemu
 * (<html data-theme="…">). Klasa liquid-ios26 zostaje: każdy podgląd ma ją na <body>, jak aplikacja.
 */
export function rewriteThemeSelectors(css) {
  return css
    .replace(/body((?:\.[\w-]+)*)\.high-contrast-level-([123])/g, '[data-theme="high-contrast-$2"] body$1')
    .replace(/(^|[^\w"\]-])\.high-contrast-level-([123])/g, '$1[data-theme="high-contrast-$2"]')
    .replace(/body\.glass-level-4/g, '[data-theme="glass-4"] body')
    .replace(/body\.glass-level-0/g, 'body')
    .replace(/body((?:\.[\w-]+)*)\.dark-bg-level-([12])/g, '[data-theme="dark-bg-$2"] body$1')
    .replace(/body\.dark-bg-level-0/g, 'body');
}

export function assembleBundle(partialsDir, partialTexts) {
  const names = Object.keys(partialTexts).sort();
  let css = `/* Vilda — bundle.css: statyczne reguły komponentów przepisane ze stylów aplikacji i sklejone z partiali ${names.join(', ')} (design-system/src/partials). Selektory motywów źródła (body.high-contrast-level-N, body.glass-level-4, body.dark-bg-level-N) są przepisane na [data-theme="…"]; klasa liquid-ios26 zostaje na <body>, jak w aplikacji. Wartości są dosłowne; plik jest generowany przez npm run design-system. */\n`;
  for (const name of names) css += `\n/* ===== ${name} ===== */\n${rewriteThemeSelectors(partialTexts[name])}\n`;
  if (/<\/style/i.test(css)) throw new Error('bundle.css zawiera literał </style');
  return css;
}

export function assembleTypes(componentsDir) {
  const dirs = fs.readdirSync(componentsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'Cover').map((d) => d.name).sort();
  let dts = '// Vilda — typy dokumentacyjne komponentów (nigdy nie kompilowane). Każdy komponent to znacznik HTML + klasy z bundle.css; opis w components/<Nazwa>/README.md. Plik generowany przez npm run design-system.\n';
  let count = 0;
  for (const d of dirs) {
    const p = path.join(componentsDir, d, `${d}.d.ts`);
    if (!fs.existsSync(p)) continue;
    dts += `\n// ===== ${d} =====\n${fs.readFileSync(p, 'utf8').trim()}\n`;
    count++;
  }
  return { text: dts, count };
}

/** Kompiluje tokens.json do CSS tak, jak robi to strona (do lokalnych renderów). */
export function compileTokensCss(t) {
  const esc = (n) => n.replace(/\./g, '\\.');
  const themes = (t.color && t.color.themes) || [{ id: 'light' }];
  const first = themes[0].id;
  const cssVal = (v) => { const m = /^\{([A-Za-z0-9_.-]+)\}$/.exec(v); return m ? `var(--${esc(m[1])})` : v; };
  const pick = (tok, theme) => {
    const v = tok.value;
    if (typeof v === 'string') return theme === first ? v : null;
    if (theme === first) return v[first] !== undefined ? v[first] : Object.values(v)[0];
    return v[theme] !== undefined ? v[theme] : null;
  };
  let out = '';
  const perTheme = (theme, selector) => {
    const lines = [];
    for (const tok of (t.color ? t.color.tokens : [])) { const v = pick(tok, theme); if (v != null) lines.push(`  --${esc(tok.name)}: ${cssVal(v)};`); }
    for (const tok of (t.shadow ? t.shadow.tokens : [])) { const v = pick(tok, theme); if (v != null) lines.push(`  --${esc(tok.name)}: ${v};`); }
    if (lines.length) out += `${selector} {\n${lines.join('\n')}\n}\n`;
  };
  perTheme(first, `:root, [data-theme="${first}"]`);
  for (const th of themes.slice(1)) perTheme(th.id, `[data-theme="${th.id}"]`);
  const lines = [];
  for (const [fam, body] of Object.entries(t)) {
    if (['name', 'version', 'meta', 'color', 'shadow', 'type'].includes(fam)) continue;
    if (!body || !Array.isArray(body.tokens)) continue;
    for (const tok of body.tokens) lines.push(`  --${esc(tok.name)}: ${typeof tok.value === 'string' ? tok.value : Object.values(tok.value)[0]};`);
  }
  for (const [k, stack] of Object.entries((t.type && t.type.families) || {})) lines.push(`  --font-${k}: ${stack};`);
  if (lines.length) out += `:root {\n${lines.join('\n')}\n}\n`;
  for (const g of ((t.type && t.type.groups) || [])) {
    for (const s of (g.styles || [])) {
      const f = s.family || g.family;
      const decl = [];
      if (f) decl.push(`font-family: var(--font-${f})`);
      if (s.fontSize) decl.push(`font-size: ${s.fontSize}`);
      if (s.lineHeight) decl.push(`line-height: ${s.lineHeight}`);
      if (s.fontWeight) decl.push(`font-weight: ${s.fontWeight}`);
      if (s.letterSpacing) decl.push(`letter-spacing: ${s.letterSpacing}`);
      if (s.fontStyle) decl.push(`font-style: ${s.fontStyle}`);
      out += `.${esc(s.name)} { ${decl.join('; ')}; }\n`;
    }
  }
  return out;
}
