#!/usr/bin/env node
// Producent design systemu Vilda.
// Jedno polecenie odbudowuje pliki systemu z aktualnych stylów aplikacji:
//   node design-system/build.mjs            → design-system/out/ (gotowe do publikacji) + SYNC-REPORT.md
//   node design-system/build.mjs --update   → dodatkowo zapisuje odświeżone tokens.json i partiale do src/
//   node design-system/build.mjs --strict   → kod wyjścia 1, gdy źródła rozjechały się z src/ (kontrola w CI)
// Co jest generowane, a co kuratorowane — opisuje design-system/README.md.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSources } from './lib/css.mjs';
import { resyncTokens } from './lib/tokens.mjs';
import { indexSourceRules, resyncPartial } from './lib/partials.mjs';
import { assembleBundle, assembleTypes, compileTokensCss } from './lib/assemble.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const srcDir = path.join(here, 'src');
const args = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const outArg = process.argv.slice(2).find((a, i, arr) => arr[i - 1] === '--out');
const outDir = path.resolve(outArg || path.join(here, 'out'));
const update = args.has('--update');
const strict = args.has('--strict');

// Kanoniczna kolejność ładowania arkuszy (jak app.html/index.html; style stron i wstrzykiwane z JS idą po nich).
const SOURCES = {
  css: [
    'ios26-v2.css',
    'style.css',
    'sidebar.css',
    'vilda_chrome.css',
    'vilda_auth_ui.css',
    'vilda_save_status_indicator.css',
    'vilda_status_bar.css',
    'vilda_obesity_banner.css',
    'vilda_shell.css',
    'edu-video-ui.css',
    'ustawienia.css',
    'clcr_ui_workflow.css',
  ],
  html: true,
  js: true,
  jsSkip: ['service-worker-kalorii.js', 'app.js'],
};

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeFile(p, text) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }
function copyDir(from, to) {
  for (const d of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, d.name);
    const b = path.join(to, d.name);
    if (d.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copyDir(a, b); } else { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); }
  }
}
function gitSha() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(); } catch { return 'brak-git'; }
}

// 1. Źródła
const { rules, files } = loadSources(repoRoot, SOURCES);
const styleRules = rules.filter((r) => r.type === 'style');

// 2. Tokeny
const seedTokens = readJson(path.join(srcDir, 'project', 'tokens.json'));
const derived = readJson(path.join(srcDir, 'derived.json'));
const knownUnsynced = new Set(readJson(path.join(srcDir, 'known-unsynced.json')).names);
const { tokens, report: tokenReport } = resyncTokens(seedTokens, rules, { derived });
tokenReport.newProps = tokenReport.newProps.filter((n) => !knownUnsynced.has(n.name));
tokens.meta = {
  ...(tokens.meta || {}),
  source: 'github',
  repo: 'vildaclinic/vilda-calc',
  ref: `${(tokens.meta && tokens.meta.ref ? tokens.meta.ref.split('@')[0] : 'audyt')}@${gitSha()}`,
  synced: new Date().toISOString().slice(0, 10),
};

// 3. Partiale
const source = indexSourceRules(rules);
const partialsDir = path.join(srcDir, 'partials');
const partialTexts = {};
const partialChanges = [];
const partialUnmatched = [];
let partialRules = 0;
for (const name of fs.readdirSync(partialsDir).filter((f) => f.endsWith('.css')).sort()) {
  const text = fs.readFileSync(path.join(partialsDir, name), 'utf8');
  const r = resyncPartial(text, source, name);
  partialTexts[name] = r.text;
  partialChanges.push(...r.changes);
  partialUnmatched.push(...r.unmatched);
  partialRules += r.rules;
}

// 4. Wynik
fs.rmSync(outDir, { recursive: true, force: true });
const outProject = path.join(outDir, 'project');
copyDir(path.join(srcDir, 'project'), outProject);
writeFile(path.join(outProject, 'tokens.json'), `${JSON.stringify(tokens, null, 2)}\n`);
writeFile(path.join(outProject, 'components', 'bundle.css'), assembleBundle(partialsDir, partialTexts));
const types = assembleTypes(path.join(outProject, 'components'));
writeFile(path.join(outProject, 'components', 'index.d.ts'), types.text);
writeFile(path.join(outDir, 'build', 'tokens.css'), compileTokensCss(tokens));
for (const [name, text] of Object.entries(partialTexts)) writeFile(path.join(outDir, 'partials', name), text);

// 5. Indeks systemu (design-system.json) — wartości z src/system.json, lastChange z git
const system = readJson(path.join(srcDir, 'system.json'));
const encodeKey = (name) => name.replace(/[^A-Za-z0-9_./-]/g, (c) => `~${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
const assetGroups = {};
for (const g of system.groups) {
  const filesMap = {};
  for (const f of g.files) filesMap[encodeKey(f.name)] = { name: f.name, blob: f.blob, size: f.size, type: f.type };
  assetGroups[g.name] = { name: g.name, tile: g.tile, order: g.files.map((f) => f.name).sort(), files: filesMap };
}
const componentCount = fs.readdirSync(path.join(outProject, 'components'), { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'Cover').length;
const tokenCount = Object.values(tokens).reduce((n, fam) => n + (fam && Array.isArray(fam.tokens) ? fam.tokens.length : 0), 0);
const index = {
  v: 3,
  layout: 'files',
  createdOnFiles: system.createdOnFiles,
  title: system.title,
  namespace: system.namespace,
  libraries: system.libraries || [],
  sections: {},
  groups: system.groups.map((g) => g.name),
  assetGroups,
  blobs: {},
  docs: { readme: 'project/README.md', sections: [] },
  lastChange: {
    by: process.env.DS_BY || 'Vilda Clinic',
    at: new Date().toISOString(),
    via: `design-system/build.mjs · GitHub · vildaclinic/vilda-calc@${gitSha()}`,
    note: `Odbudowa ze stylów: ${tokenCount} tokenów, ${componentCount} kart, ${tokenReport.changed.length} zmienionych wartości, ${partialChanges.length} odświeżonych reguł`,
  },
};
writeFile(path.join(outProject, 'design-system.json'), `${JSON.stringify(index, null, 2)}\n`);

// 6. Mapa plików do publikacji (Artifact tool: root = design-system/out, file_path = …/project/design-system.json, files = ta mapa)
const publish = {};
const walk = (dir) => {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    const rel = path.relative(outDir, p).split(path.sep).join('/');
    if (d.isDirectory()) { walk(p); continue; }
    if (rel === 'project/design-system.json') continue;
    if (/^project\/assets\/.*\.(png|jpe?g|webp|svg|gif|mp4|webm|pdf)$/i.test(rel)) continue;
    publish[rel] = rel.endsWith('.d.ts') ? { from: rel, contentType: 'text/plain' } : rel;
  }
};
walk(outProject);
writeFile(path.join(outDir, 'publish-files-map.json'), `${JSON.stringify(publish)}\n`);

// 7. Zapis zwrotny do src (--update)
if (update) {
  writeFile(path.join(srcDir, 'project', 'tokens.json'), `${JSON.stringify(tokens, null, 2)}\n`);
  for (const [name, text] of Object.entries(partialTexts)) writeFile(path.join(partialsDir, name), text);
}

// 8. Raport
const lines = [];
lines.push('# Raport synchronizacji design systemu', '', `Źródła: ${files.length} plików, ${styleRules.length} reguł stylów. Commit: ${gitSha()}. Data: ${new Date().toISOString()}.`, '');
lines.push(`## Tokeny: ${tokenReport.changed.length} zmienionych wartości`, '');
for (const c of tokenReport.changed) lines.push(`- \`${c.family}/${c.name}\` [${c.theme}]: \`${c.from === undefined ? '(brak)' : c.from}\` → \`${c.to}\` (${c.file}: \`${c.selector}\`)`);
if (!tokenReport.changed.length) lines.push('- bez zmian');
lines.push('', `## Tokeny pominięte (wartość źródła nie mieści się w gramatyce tokenów): ${tokenReport.skipped.length}`, '');
for (const s of tokenReport.skipped) lines.push(`- \`${s.family}/${s.name}\`: ${s.reason}`);
lines.push('', `## Tokeny bez deklaracji w źródłach (kandydaci do usunięcia): ${tokenReport.missing.length}`, '');
for (const m of tokenReport.missing) lines.push(`- \`${m.family}/${m.name}\``);
lines.push('', `## Nowe własności niestandardowe w źródłach bez tokenu (do opisania ręcznie): ${tokenReport.newProps.length}`, '');
for (const n of tokenReport.newProps) lines.push(`- \`--${n.name}\` = \`${n.value}\` (${n.file}: \`${n.selector}\`, deklaracji: ${n.declarations})`);
lines.push('', `## Partiale: ${partialChanges.length} odświeżonych reguł z ${partialRules}`, '');
for (const c of partialChanges) {
  lines.push(`- ${c.file}: \`${c.selector}\` ← ${c.source}${c.kind === 'keyframes' ? ' (keyframes)' : ''}`);
  if (c.before) {
    const removed = c.before.filter((d) => !c.after.includes(d));
    const added = c.after.filter((d) => !c.before.includes(d));
    for (const d of removed) lines.push(`  - było: \`${d}\``);
    for (const d of added) lines.push(`  - jest: \`${d}\``);
  }
}
lines.push('', `## Reguły partiali nieodnalezione w źródłach (zostawione bez zmian): ${partialUnmatched.length}`, '');
for (const u of partialUnmatched) lines.push(`- ${u.file}: \`${u.selector}\`${u.media ? ` @ ${u.media}` : ''}`);
lines.push('', `## Wynik`, '', `- ${outProject}: ${Object.keys(publish).length + 1} plików do publikacji, ${componentCount} kart, ${types.count} plików typów, ${tokenCount} tokenów.`, `- Mapa publikacji: ${path.join(outDir, 'publish-files-map.json')}.`, '');
writeFile(path.join(outDir, 'SYNC-REPORT.md'), lines.join('\n'));

const drift = tokenReport.changed.length + partialChanges.length;
console.log(`design-system: ${styleRules.length} reguł z ${files.length} źródeł → ${outDir}`);
console.log(`tokeny: ${tokenCount} (${tokenReport.changed.length} zmienionych, ${tokenReport.skipped.length} pominiętych, ${tokenReport.missing.length} bez deklaracji, ${tokenReport.newProps.length} nowych własności bez tokenu)`);
console.log(`partiale: ${partialRules} reguł (${partialChanges.length} odświeżonych, ${partialUnmatched.length} nieodnalezionych)`);
console.log(`karty: ${componentCount}, typy: ${types.count}; raport: ${path.join(outDir, 'SYNC-REPORT.md')}${update ? ' (src/ zaktualizowane)' : ''}`);
if (strict && drift) { console.error(`design-system --strict: ${drift} rozjazdów między stylami a src/ — uruchom npm run design-system -- --update i przejrzyj diff.`); process.exit(1); }
