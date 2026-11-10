// Exact, idempotent integration with the existing deployment artifacts.
// Clinical tables, interpolation and Zemel model producer remain unchanged.
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const check = process.argv.includes('--check');
const delegate = 'if(window.VildaPublicationCreator&&typeof window.VildaPublicationCreator.generateDsChart==="function")return window.VildaPublicationCreator.generateDsChart();';
const patches = [
  ...['inline_index_05.js', 'inline_docpro_03.js'].map(file => ({ file,
    before: 'async function W(){const e=document.getElementById("age")',
    after: 'async function W(){' + delegate + 'const e=document.getElementById("age")' })),
  { file: 'inline_index_07.js',
    before: 'var ok=r.visible&&mo<=216&&(r.source==="PALCZEWSKA"||r.source==="OLAF"&&mo>=36||r.source==="WHO"&&mo<=35);cc.style.display=ok?"":"none"',
    after: 'var ds=typeof window.VildaPopulacjaPacjenta==="function"&&window.VildaPopulacjaPacjenta()==="DS";var ok=ds?mo>=0&&mo<=240:r.visible&&mo<=216&&(r.source==="PALCZEWSKA"||r.source==="OLAF"&&mo>=36||r.source==="WHO"&&mo<=35);cc.style.display=ok?"":"none"' }
];
for (const patch of patches) {
  const path = new URL(patch.file, root), source = await readFile(path, 'utf8');
  if (source.split(patch.after).length === 2) continue;
  if (check) throw new Error('Missing Zemel Creator integration: ' + patch.file);
  if (source.split(patch.before).length !== 2) throw new Error('Unexpected Zemel Creator anchor: ' + patch.file);
  await writeFile(path, source.replace(patch.before, patch.after));
}
console.log('Zemel Creator integration: 3 exact artifact anchors verified.');
