// Parser CSS dla producenta design systemu Vilda.
// Czyta arkusze aplikacji (także zminifikowane), bloki <style> ze stron HTML i style
// wstrzykiwane z JS (<style>…</style> w literałach). Zwraca płaską listę reguł z kontekstem
// at-rules (@media, @supports), pozycją w kaskadzie i offsetami bloku deklaracji, żeby dało się
// podmienić deklaracje w pliku bez naruszania komentarzy.
import fs from 'node:fs';
import path from 'node:path';

const GROUPING_AT_RULES = new Set(['media', 'supports', 'layer', 'container', 'document', 'scope']);

/**
 * Parsuje tekst CSS.
 * @param {string} text
 * @param {{file?: string, kind?: string, orderBase?: number}} meta
 * @returns {Array<object>} reguły: {type:'style'|'at', file, kind, order, media:string[], selector, declarations, declStart, declEnd}
 */
export function parseCss(text, meta = {}) {
  const rules = [];
  const file = meta.file || '';
  const kind = meta.kind || 'css';
  let order = meta.orderBase || 0;
  const n = text.length;
  let i = 0;

  function skipComment() {
    // zakłada, że text[i] === '/' i text[i+1] === '*'
    const end = text.indexOf('*/', i + 2);
    i = end < 0 ? n : end + 2;
  }

  // Czyta "preludium" (selektor albo at-rule) aż do '{' lub ';' na głębokości 0 (poza stringami i nawiasami).
  function readPrelude() {
    let out = '';
    let depth = 0;
    let quote = null;
    while (i < n) {
      const c = text[i];
      if (quote) {
        out += c;
        if (c === '\\' && i + 1 < n) { out += text[i + 1]; i += 2; continue; }
        if (c === quote) quote = null;
        i++;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; out += c; i++; continue; }
      if (c === '/' && text[i + 1] === '*') { skipComment(); continue; }
      if (c === '(') depth++;
      if (c === ')') depth = Math.max(0, depth - 1);
      if (depth === 0 && (c === '{' || c === ';' || c === '}')) return { prelude: out, stop: c };
      out += c;
      i++;
    }
    return { prelude: out, stop: null };
  }

  // Czyta zawartość bloku od pozycji po '{' do pasującego '}' (zwraca surowy tekst, i staje za '}').
  function readRawBlock() {
    let depth = 1;
    let quote = null;
    const start = i;
    while (i < n) {
      const c = text[i];
      if (quote) {
        if (c === '\\') { i += 2; continue; }
        if (c === quote) quote = null;
        i++;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; i++; continue; }
      if (c === '/' && text[i + 1] === '*') { skipComment(); continue; }
      if (c === '{') depth++;
      if (c === '}') { depth--; if (depth === 0) { const body = text.slice(start, i); i++; return { body, start, end: i - 1 }; } }
      i++;
    }
    return { body: text.slice(start), start, end: n };
  }

  function parseBlock(media) {
    while (i < n) {
      const c = text[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && text[i + 1] === '*') { skipComment(); continue; }
      if (c === '}') { i++; return; }
      const { prelude, stop } = readPrelude();
      const head = prelude.trim();
      if (stop === ';') { i++; continue; } // @import, @charset itp.
      if (stop === '}') { i++; return; }
      if (stop === null) return;
      i++; // za '{'
      if (head.startsWith('@')) {
        const m = /^@([a-zA-Z-]+)\s*(.*)$/s.exec(head);
        const name = (m ? m[1] : '').toLowerCase();
        const params = m ? m[2].trim() : '';
        if (GROUPING_AT_RULES.has(name)) {
          parseBlock([...media, `@${name} ${params}`.trim()]);
        } else {
          const { body, start, end } = readRawBlock();
          rules.push({ type: 'at', name, prelude: params, body, media, file, kind, order: order++, declStart: start, declEnd: end });
        }
        continue;
      }
      const { body, start, end } = readRawBlock();
      rules.push({
        type: 'style',
        file,
        kind,
        order: order++,
        media,
        selector: normalizeWhitespace(head),
        declarations: parseDeclarations(body),
        declStart: start,
        declEnd: end,
      });
    }
  }

  parseBlock([]);
  return rules;
}

/** Dzieli tekst po separatorze na najwyższym poziomie (poza nawiasami i cudzysłowami). */
export function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (let k = 0; k < text.length; k++) {
    const c = text[k];
    if (quote) {
      current += c;
      if (c === '\\' && k + 1 < text.length) { current += text[k + 1]; k++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; current += c; continue; }
    if (c === '(') depth++;
    if (c === ')') depth = Math.max(0, depth - 1);
    if (c === separator && depth === 0) { parts.push(current); current = ''; continue; }
    current += c;
  }
  parts.push(current);
  return parts;
}

export function parseDeclarations(body) {
  const out = [];
  for (const raw of splitTopLevel(body, ';')) {
    const decl = raw.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!decl) continue;
    const colon = decl.indexOf(':');
    if (colon < 0) continue;
    const prop = decl.slice(0, colon).trim();
    let value = decl.slice(colon + 1).trim();
    let important = false;
    const im = /!\s*important\s*$/i.exec(value);
    if (im) { important = true; value = value.slice(0, im.index).trim(); }
    if (!prop) continue;
    out.push({ prop, value, important });
  }
  return out;
}

export function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Bloki <style>…</style> z tekstu (dokument HTML albo literał w JS). Skaner indeksowy zamiast wyrażenia
 * regularnego: znacznik otwierający kończy się na '>' poza cudzysłowami, zamykający to "</style" + '>'
 * (ewentualnie ze spacjami, także zapis "<\/style" w literałach JS).
 */
export function findStyleBlocks(text) {
  const blocks = [];
  const lower = text.toLowerCase();
  let i = 0;
  while ((i = lower.indexOf('<style', i)) >= 0) {
    const after = lower[i + 6];
    if (after !== '>' && after !== ' ' && after !== '\t' && after !== '\n' && after !== '\r' && after !== '/') { i += 6; continue; }
    let k = i + 6;
    let quote = null;
    while (k < text.length) {
      const c = text[k];
      if (quote) { if (c === quote) quote = null; k++; continue; }
      if (c === '"' || c === "'") { quote = c; k++; continue; }
      if (c === '>') break;
      k++;
    }
    const start = k + 1;
    // znacznik zamykający: "</style>" albo, w literałach JS, "<\/style>"; ewentualne spacje przed ">"
    const closeRe = /<\\?\/style\s*>/g;
    closeRe.lastIndex = start;
    const close = closeRe.exec(lower);
    if (!close) break;
    blocks.push(text.slice(start, close.index));
    i = close.index + close[0].length;
  }
  return blocks;
}

/** Bloki <style> z dokumentu HTML. */
export function extractHtmlStyles(html) {
  return findStyleBlocks(html);
}

const JS_ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', "'": "'", '\\': '\\', '/': '/', '`': '`' };

/** Odkodowuje sekwencje ucieczki literału JS w jednym przebiegu (każdy backslash rozpatrzony raz). */
function unescapeJsString(css) {
  if (!css.includes('\\')) return css;
  return css.replace(/\\(.)/gs, (m, c) => (Object.hasOwn(JS_ESCAPES, c) ? JS_ESCAPES[c] : m));
}

/**
 * Style wstrzykiwane z JS: fragmenty <style>…</style> w literałach oraz długie literały łańcuchowe,
 * które wyglądają jak arkusz (np. `t.textContent=Cn` w vilda_terminarz.js). Proste sekwencje ucieczki są odkodowane.
 */
export function extractJsStyles(js) {
  const blocks = [];
  const seen = new Set();
  let m;
  for (const block of findStyleBlocks(js)) {
    const css = unescapeJsString(block);
    seen.add(css.slice(0, 200));
    // fragmenty łączone przez "+" albo `${…}` zostają jak są: reguła z wyrażeniem nie sparsuje się jako deklaracja i zostanie pominięta
    blocks.push(css);
  }
  // literały łańcuchowe zaczynające się od selektora CSS (np. var Cn='.terminarz-shell{…}'): skaner nie tokenizuje JS,
  // tylko szuka cudzysłowu, po którym stoi selektor i '{', i czyta do zamykającego, nieescapowanego cudzysłowu
  const startRe = /(["'`])(?=\s*(?:[.#@]|[a-zA-Z][\w-]*(?:[\s,.#:[>+~]|\{))[^"'`]{0,200}\{)/g;
  while ((m = startRe.exec(js))) {
    const quote = m[1];
    let k = m.index + 1;
    let raw = '';
    while (k < js.length) {
      const c = js[k];
      if (c === '\\' && k + 1 < js.length) { raw += c + js[k + 1]; k += 2; continue; }
      if (c === quote) break;
      if (c === '\n' && quote !== '`') break; // zwykły literał nie przechodzi przez koniec linii
      raw += c;
      k++;
    }
    startRe.lastIndex = k + 1;
    if (raw.length < 120) continue;
    const css = unescapeJsString(raw);
    if (seen.has(css.slice(0, 200))) continue;
    const ruleLike = css.match(/[.#a-zA-Z@][\w-]*[^{}]*\{[^{}]*:[^{}]*\}/g);
    if (!ruleLike || ruleLike.length < 2) continue;
    if (/\$\{/.test(css)) continue; // szablon z wyrażeniami — nie parsujemy
    seen.add(css.slice(0, 200));
    blocks.push(css);
  }
  return blocks;
}

/**
 * Wczytuje wszystkie źródła stylów aplikacji w kanonicznej kolejności ładowania.
 * @param {string} repoRoot
 * @param {{css: string[], html?: boolean, js?: boolean}} config
 */
export function loadSources(repoRoot, config) {
  const rules = [];
  const files = [];
  let orderBase = 0;
  for (const name of config.css) {
    const p = path.join(repoRoot, name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    const parsed = parseCss(text, { file: name, kind: 'css', orderBase });
    orderBase += parsed.length;
    rules.push(...parsed);
    files.push(name);
  }
  if (config.html !== false) {
    for (const name of fs.readdirSync(repoRoot).filter((f) => f.endsWith('.html')).sort()) {
      const text = fs.readFileSync(path.join(repoRoot, name), 'utf8');
      extractHtmlStyles(text).forEach((block, idx) => {
        const parsed = parseCss(block, { file: `${name}#style${idx + 1}`, kind: 'html', orderBase });
        orderBase += parsed.length;
        rules.push(...parsed);
      });
      files.push(name);
    }
  }
  if (config.js !== false) {
    const skip = new Set(config.jsSkip || []);
    for (const name of fs.readdirSync(repoRoot).filter((f) => /\.js$/.test(f) && !/\.min\.js$/.test(f) && !skip.has(f)).sort()) {
      const text = fs.readFileSync(path.join(repoRoot, name), 'utf8');
      if (!text.includes('<style')) continue;
      extractJsStyles(text).forEach((block, idx) => {
        const parsed = parseCss(block, { file: `${name}#style${idx + 1}`, kind: 'js', orderBase });
        orderBase += parsed.length;
        rules.push(...parsed);
      });
      files.push(name);
    }
  }
  return { rules, files };
}

// ---------- selektory: postać kanoniczna i swoistość ----------

const COMBINATOR_RE = /\s*([>+~])\s*|\s+/;

function splitCompound(compound) {
  // proste selektory: element, #id, .klasa, [attr], :pseudo(...), ::pseudo
  const simples = [];
  let cur = '';
  let depth = 0;
  for (const c of compound) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (depth === 0 && (c === '.' || c === '#' || c === '[' || c === ':') && cur && !cur.endsWith(':')) {
      simples.push(cur);
      cur = c;
      continue;
    }
    cur += c;
  }
  if (cur) simples.push(cur);
  return simples;
}

/** Postać kanoniczna jednego selektora (bez listy): w każdym złożeniu proste selektory posortowane. */
export function canonicalSelector(part) {
  const s = normalizeWhitespace(part).replace(/\s*([>+~])\s*/g, ' $1 ');
  const tokens = s.split(/\s+/).filter(Boolean);
  const out = [];
  for (const tok of tokens) {
    if (tok === '>' || tok === '+' || tok === '~') { out.push(tok); continue; }
    const simples = splitCompound(tok);
    const element = simples.filter((x) => /^[a-zA-Z*]/.test(x));
    const rest = simples.filter((x) => !/^[a-zA-Z*]/.test(x)).sort();
    out.push([...element, ...rest].join(''));
  }
  return out.join(' ');
}

export function canonicalSelectorList(selector) {
  return splitTopLevel(selector, ',').map((p) => canonicalSelector(p)).filter(Boolean);
}

/** Swoistość jednego selektora jako liczba (ids*10000 + klasy*100 + elementy). */
export function specificity(part) {
  let ids = 0;
  let classes = 0;
  let elements = 0;
  const s = part.replace(/\s*([>+~])\s*/g, ' ').trim();
  for (const tok of s.split(/\s+/).filter(Boolean)) {
    for (const simple of splitCompound(tok)) {
      if (simple.startsWith('#')) ids++;
      else if (simple.startsWith('.') || simple.startsWith('[')) classes++;
      else if (simple.startsWith('::')) elements++;
      else if (simple.startsWith(':')) {
        const m = /^:([a-zA-Z-]+)(?:\((.*)\))?$/s.exec(simple);
        const name = m ? m[1] : '';
        if (name === 'where') continue;
        if (name === 'not' || name === 'is' || name === 'has') {
          const inner = m && m[2] ? splitTopLevel(m[2], ',').map((x) => specificity(x.trim())) : [0];
          const max = Math.max(...inner);
          ids += Math.floor(max / 10000);
          classes += Math.floor((max % 10000) / 100);
          elements += max % 100;
        } else if (name === 'before' || name === 'after' || name === 'first-line' || name === 'first-letter') elements++;
        else classes++;
      } else if (simple !== '*') elements++;
    }
  }
  return ids * 10000 + classes * 100 + elements;
}

export const COMBINATOR_SPLIT = COMBINATOR_RE;
