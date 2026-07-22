import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ignoredDirectories = new Set(['.git', 'coverage', 'node_modules', 'playwright-report', 'test-results']);

function collectJavaScriptFiles(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectJavaScriptFiles(absolutePath, output);
    if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) output.push(absolutePath);
  }
  return output;
}

const files = collectJavaScriptFiles(root).sort();
const failures = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures.push({
      file: path.relative(root, file),
      output: `${result.stdout || ''}${result.stderr || ''}`.trim()
    });
  }
}

if (failures.length) {
  for (const failure of failures) {
    process.stderr.write(`\n${failure.file}\n${failure.output}\n`);
  }
  process.exit(1);
}

process.stdout.write(`Składnia poprawna: ${files.length} plików JavaScript.\n`);
