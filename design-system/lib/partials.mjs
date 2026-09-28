// Ponowna synchronizacja partiali komponentów (src/partials/Gxx.css) ze stylami aplikacji.
// Partial jest kuratorowanym manifestem reguł: selektory i kolejność zostają, a deklaracje każdej
// reguły są podmieniane na aktualne ze źródła, jeśli da się ją jednoznacznie rozpoznać
// (ten sam kontekst @media, selektory partiala zawarte w liście selektorów reguły źródłowej,
// zbieżny zestaw deklaracji). Komentarze i układ pliku są zachowane.
import { parseCss, canonicalSelectorList, normalizeWhitespace } from './css.mjs';

const COVER_THRESHOLD = 0.5; // udział właściwości partiala obecnych w regule źródłowej
const VALUE_THRESHOLD = 0.34; // zbieżność pełnych deklaracji (prop:wartość) dla reguły niebędącej identyczną

function normalizeMedia(contexts) {
  return contexts.map((c) => c.toLowerCase().replace(/\s+/g, '')).join('|');
}

function normalizeText(text) {
  return normalizeWhitespace(text)
    .replace(/(^|[\s,(:])0+\.(\d)/g, '$1.$2')
    .replace(/'/g, '"')
    .replace(/\s*([,:;{}])\s*/g, '$1')
    .replace(/#[0-9A-Fa-f]{3,8}\b/g, (m) => m.toLowerCase());
}

/** Klucz porównawczy deklaracji: ta sama wartość w innej notacji (0.8 / .8, cudzysłowy, wielkość heksów) to ta sama deklaracja. */
function declKey(d) {
  return `${d.prop}:${normalizeText(d.value)}${d.important ? '!important' : ''}`;
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function formatDeclarations(decls) {
  return `\n${decls.map((d) => `  ${d.prop}:${d.value}${d.important ? ' !important' : ''};`).join('\n')}\n`;
}

/** Indeks reguł źródłowych: klucz = kontekst media; wartość = lista {rule, canon:Set, props, keys}. Keyframes: wszystkie definicje po nazwie. */
export function indexSourceRules(sourceRules) {
  const index = new Map();
  const keyframes = new Map();
  for (const rule of sourceRules) {
    if (rule.type === 'at') {
      if (rule.name === 'keyframes' || rule.name === '-webkit-keyframes') {
        const name = rule.prelude.trim();
        if (!keyframes.has(name)) keyframes.set(name, []);
        keyframes.get(name).push(rule);
      }
      continue;
    }
    const key = normalizeMedia(rule.media);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ rule, canon: new Set(canonicalSelectorList(rule.selector)), props: rule.declarations.map((d) => d.prop), keys: rule.declarations.map(declKey) });
  }
  return { index, keyframes };
}

/**
 * Dobiera regułę źródłową do reguły partiala. Zwraca {cand, score, identical} albo null.
 * identical: ten sam zestaw deklaracji (po normalizacji) — nic do zmiany.
 */
function matchRule(rule, bucket, penalty = 0) {
  const canon = canonicalSelectorList(rule.selector);
  if (!canon.length) return null;
  const keys = rule.declarations.map(declKey);
  const props = rule.declarations.map((d) => d.prop);
  let best = null;
  for (const cand of bucket) {
    if (!canon.every((c) => cand.canon.has(c))) continue;
    // identyczna: ten sam zestaw deklaracji; wycinek: każda deklaracja partiala (np. :root z jedną zmienną) jest w źródle bez zmian
    const identical = keys.every((k) => cand.keys.includes(k)) && (keys.length === cand.keys.length || rule.selector.trim() === ':root' || props.every((p) => p.startsWith('--')));
    const covered = props.filter((p) => cand.props.includes(p)).length / Math.max(1, props.length);
    const values = jaccard(keys, cand.keys);
    if (!identical && (covered < COVER_THRESHOLD || values < VALUE_THRESHOLD)) continue;
    const score = (identical ? 2 : 0) + 0.6 * values + 0.4 * covered + (cand.canon.size === canon.length ? 0.05 : 0) - penalty;
    if (!best || score > best.score || (score === best.score && cand.rule.order > best.cand.rule.order)) best = { cand, score, identical };
  }
  return best;
}

/**
 * @param {string} text treść partiala
 * @param {{index: Map, keyframes: Map}} source z indexSourceRules
 * @param {string} label nazwa pliku do raportu
 */
export function resyncPartial(text, source, label) {
  const rules = parseCss(text, { file: label, kind: 'partial' });
  const changes = [];
  const unmatched = [];
  const splices = [];

  for (const rule of rules) {
    if (rule.type === 'at') {
      if (rule.name !== 'keyframes' && rule.name !== '-webkit-keyframes') continue;
      const defs = source.keyframes.get(rule.prelude.trim());
      if (!defs) { unmatched.push({ file: label, selector: `@keyframes ${rule.prelude}`, media: rule.media.join(' ') }); continue; }
      const mine = normalizeText(rule.body);
      if (defs.some((d) => normalizeText(d.body) === mine)) continue;
      const src = defs[defs.length - 1];
      splices.push({ start: rule.declStart, end: rule.declEnd, text: src.body });
      changes.push({ file: label, selector: `@keyframes ${rule.prelude}`, source: src.file, kind: 'keyframes' });
      continue;
    }
    const mediaKey = normalizeMedia(rule.media);
    let best = matchRule(rule, source.index.get(mediaKey) || []);
    if (!best && !rule.media.length) {
      // partial świadomie zdjął opakowanie @media (karta ma 960 px): szukaj w innych kontekstach, najpierw desktopowych
      for (const [key, bucket] of source.index) {
        if (!key) continue;
        const desktop = key.split('|').every((k) => /^@media(screenand)?\(min-width:[\d.]+(px|rem|em)\)$/.test(k));
        const cand = matchRule(rule, bucket, desktop ? 0.1 : 0.3);
        if (cand && (!best || cand.score > best.score)) best = cand;
      }
    }
    if (!best) { unmatched.push({ file: label, selector: rule.selector.slice(0, 120), media: rule.media.join(' ') }); continue; }
    if (best.identical) continue;
    const srcRule = best.cand.rule;
    const partialProps = new Set(rule.declarations.map((d) => d.prop));
    const partialHasVars = rule.declarations.some((d) => d.prop.startsWith('--'));
    // deklaracje partiala w wersji źródłowej; właściwości, których źródło już nie ma, wypadają;
    // nowe właściwości źródła dochodzą, z wyjątkiem własności niestandardowych (tokeny są w tokens.css) i reguł :root
    const next = [];
    for (const d of srcRule.declarations) {
      if (partialProps.has(d.prop)) { next.push(d); continue; }
      if (d.prop.startsWith('--') && !partialHasVars) continue;
      if (rule.selector.trim() === ':root') continue;
      next.push(d);
    }
    const before = rule.declarations.map(declKey);
    const after = next.map(declKey);
    if (before.join(';') === after.join(';')) continue;
    splices.push({ start: rule.declStart, end: rule.declEnd, text: formatDeclarations(next) });
    changes.push({ file: label, selector: rule.selector.slice(0, 120), source: srcRule.file, kind: 'declarations', before, after });
  }

  let out = text;
  for (const s of splices.sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + s.text + out.slice(s.end);
  return { text: out, changes, unmatched, rules: rules.filter((r) => r.type === 'style').length };
}
