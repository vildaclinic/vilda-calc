import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function loadBrowserScript(relativePath, browserGlobal = {}) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const execute = new Function('window', 'globalThis', source);
  execute(browserGlobal, browserGlobal);
  return browserGlobal;
}
