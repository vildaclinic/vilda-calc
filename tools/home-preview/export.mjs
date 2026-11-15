import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, lstat, realpath, unlink, open } from 'node:fs/promises';
import { constants as fileConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCE = path.resolve(TOOL_DIRECTORY, '../..');
const EXPORT_MARKER = '.vilda-home-preview-export.json';
const BLOCKED_ORIGIN = 'https://vilda-preview-disabled.invalid';
export const PREVIEW_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' blob:; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";
export const PREVIEW_WORKER_NETWORK_GUARD = `/* Preview-only: a service worker has its own network context. */
(function () {
  const originalFetch = self.fetch.bind(self);
  self.fetch = function (input, options) {
    let url;
    try { url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, self.location.href); }
    catch (_) { return Promise.reject(new TypeError('Preview network request rejected.')); }
    if (url.origin !== self.location.origin) return Promise.reject(new TypeError('External networking is disabled in this preview.'));
    return originalFetch(input, options);
  };
})();
`;
const ASSET_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.pdf', '.webmanifest']);
const EXCLUDED_ROOT = /(?:^package(?:-lock)?\.json$|^eslint(?:[.-])|^playwright[.-]|^vitest[.-]|_regression_test\.js$)/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const isInside = (parent, candidate) => candidate === parent || candidate.startsWith(parent + path.sep);

export async function readRegularAsset(local) {
  // Check and read the same opened object. A path check followed by readFile
  // would let a concurrent path replacement turn a regular file into a link.
  if (typeof fileConstants.O_NOFOLLOW !== 'number') throw new Error('Preview export requires O_NOFOLLOW support.');
  const handle = await open(local, fileConstants.O_RDONLY | fileConstants.O_NOFOLLOW);
  try {
    if (!(await handle.stat()).isFile()) throw new Error('Preview asset must be a regular file: ' + local);
    return await handle.readFile();
  } finally { await handle.close(); }
}

export function isPreviewAsset(relative) {
  if (typeof relative !== 'string' || relative.startsWith('/') || relative.split('/').some(part => part === '..' || part.startsWith('.'))) return false;
  if (/^(?:runtime|pwa-icons|LICENSES|templates)\//.test(relative)) return true;
  if (relative.includes('/')) return false;
  if (['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md'].includes(relative)) return true;
  return ASSET_EXTENSIONS.has(path.extname(relative).toLowerCase()) && !EXCLUDED_ROOT.test(relative);
}

export function isolateDocument(source, buildId) {
  if (!/<head\b[^>]*>/i.test(source)) throw new Error('Preview HTML must have an explicit head.');
  const injection = '\n<meta charset="utf-8">\n'
    + '<meta http-equiv="Content-Security-Policy" content="' + PREVIEW_CSP + '">\n'
    + '<meta name="robots" content="noindex,nofollow">\n'
    + '<link rel="stylesheet" href="vilda_home_preview.css?v=' + buildId + '">\n'
    + '<script src="vilda_home_preview.js?v=' + buildId + '"></script>\n';
  return source.replace(/<head\b[^>]*>/i, match => match + injection)
    // Remote fonts are presentation-only. System fallbacks keep this preview
    // independent of third-party requests; clinical scripts remain untouched.
    .replace(/<link\b[^>]*\bhref=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/gi, '');
}

export function isolateText(source) {
  return source.replaceAll('https://vilda-sync.maciej-4b9.workers.dev', BLOCKED_ORIGIN)
    .replaceAll('wss://vilda-sync.maciej-4b9.workers.dev', 'wss://vilda-preview-disabled.invalid');
}

export function demoAccessDocument(source) {
  const main = /<main\b[^>]*>[\s\S]*?<\/main>/gi;
  if ([...source.matchAll(main)].length !== 1) throw new Error('Unknown subscription document contract.');
  return source.replace(main, `<main class="main-content">
    <section class="container vilda-preview-access" aria-labelledby="vildaPreviewAccessTitle">
      <p class="vilda-preview-access__eyebrow">Podgląd aplikacji</p>
      <h1 id="vildaPreviewAccessTitle">Dostęp demonstracyjny</h1>
      <p id="vildaHomePreviewAccessStatus" class="vilda-preview-access__status" role="status">Przygotowywanie dostępu do funkcji lekarskich…</p>
      <p>Funkcje lekarskie są dostępne na koncie demonstracyjnym. Nie trzeba aktywować okresu próbnego, kupować abonamentu ani podawać danych płatniczych.</p>
      <div class="vilda-preview-access__actions">
        <a href="app.html#/start">Otwórz stronę główną</a>
        <a href="app.html#/docpro">Otwórz DocPro</a>
      </div>
      <p class="vilda-preview-access__note">Używaj wyłącznie fikcyjnych danych. Zapisy pozostają w podglądzie, bez synchronizacji z kontem używanym w gabinecie.</p>
      <p class="vilda-preview-access__note">DocPro może poprosić o potwierdzenie otwarcia treści przeznaczonych dla lekarzy. Dostęp demonstracyjny nie potwierdza uprawnień zawodowych.</p>
    </section>
  </main>`)
    .replace(/<title>[\s\S]*?<\/title>/i, '<title>Vilda — dostęp demonstracyjny</title>')
    .replace(/<meta\b[^>]*\bname=["']description["'][^>]*>/i, '<meta name="description" content="Podgląd funkcji lekarskich na fikcyjnym koncie, bez aktywacji subskrypcji.">')
    // Keep a separator so removing a handler cannot concatenate HTML tokens.
    .replace(/<script\b[^>]*\bsrc=["']inline_subskrypcja_0[01]\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>/gi, '\n')
    .replace(/(<a\b[^>]*\bhref=["']subskrypcja\.html["'][^>]*>)Vilda PRO(<\/a>)/gi, '$1Dostęp demonstracyjny$2');
}

export function isolateWorker(source, buildId) {
  const output = source.replace(/const SW_VERSION = '([^']+)';/, (_, version) => "const SW_VERSION = '" + version + '-preview-' + buildId + "';")
    .replace("const CACHE_PREFIX = 'pwa-kalorii';", "const CACHE_PREFIX = 'vilda-home-preview';")
    .replace('const CORE_SHELL_URLS = [', 'const CORE_SHELL_URLS = [\n'
      + "  '/vilda_home_preview.js?v=" + buildId + "',\n"
      + "  '/vilda_home_preview.css?v=" + buildId + "',");
  if (output === source || !output.includes('-preview-' + buildId)) throw new Error('Unknown service-worker version contract.');
  return PREVIEW_WORKER_NETWORK_GUARD + output;
}

async function safeOutputDirectory(source, output) {
  if (!path.isAbsolute(output)) throw new Error('--output must be an absolute path outside the source repository.');
  await mkdir(path.dirname(output), { recursive: true });
  const parent = await realpath(path.dirname(output));
  const target = path.join(parent, path.basename(output));
  if (isInside(source, target) || isInside(target, source)) throw new Error('Preview output must be separate from the source repository.');
  await mkdir(target, { recursive: true });
  if ((await lstat(target)).isSymbolicLink()) throw new Error('Preview output cannot be a symlink.');
  const actual = await realpath(target);
  if (isInside(source, actual) || isInside(actual, source)) throw new Error('Preview output resolves into the source repository.');
  const entries = await readdir(actual);
  let prior = null;
  if (entries.includes(EXPORT_MARKER)) {
    prior = JSON.parse(await readFile(path.join(actual, EXPORT_MARKER), 'utf8'));
    if (prior.schemaVersion !== 1 || prior.kind !== 'vilda-home-preview' || !Array.isArray(prior.files)) throw new Error('Unknown preview output marker.');
  } else if (entries.length) throw new Error('Preview output must be empty or belong to this exporter.');
  return { directory: actual, prior };
}

export async function exportPreview({ source = DEFAULT_SOURCE, output }) {
  if (!output) throw new Error('Required argument: --output /absolute/path/outside/source');
  source = await realpath(source);
  const destination = await safeOutputDirectory(source, output);
  // Only Git-indexed files: never publish private untracked data, local state,
  // credentials, test fixtures, Git metadata, or node_modules.
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: source, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split('\0').filter(Boolean);
  const selected = tracked.filter(isPreviewAsset).sort();
  for (const required of ['app.html', 'index.html', 'docpro.html', 'service-worker-kalorii.js', 'manifest.json', 'vilda_home_workspace.js', 'vilda_home_workspace.css']) {
    if (!selected.includes(required)) throw new Error('Missing tracked runtime file: ' + required);
  }
  const input = new Map();
  for (const relative of selected) {
    const local = path.join(source, relative);
    input.set(relative, await readRegularAsset(local));
  }
  const bootstrap = await readFile(path.join(TOOL_DIRECTORY, 'runtime.js'));
  const stylesheet = await readFile(path.join(TOOL_DIRECTORY, 'preview.css'));
  const buildHash = createHash('sha256');
  for (const [relative, bytes] of input) buildHash.update(relative).update('\0').update(bytes).update('\0');
  buildHash.update(bootstrap).update(stylesheet).update(await readFile(fileURLToPath(import.meta.url)));
  const buildId = buildHash.digest('hex').slice(0, 20);
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
  const sourceDirty = Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: source, encoding: 'utf8' }).trim());
  const files = new Map();
  for (const [relative, bytes] of input) {
    let result = bytes;
    if (!relative.startsWith('runtime/') && ['.js', '.html'].includes(path.extname(relative))) {
      let text = isolateText(bytes.toString('utf8'));
      if (relative === 'subskrypcja.html') text = demoAccessDocument(text);
      if (relative.endsWith('.html')) text = isolateDocument(text, buildId);
      if (relative === 'service-worker-kalorii.js') text = isolateWorker(text, buildId);
      result = Buffer.from(text);
    }
    if (relative === 'manifest.json') {
      const manifest = JSON.parse(result.toString('utf8'));
      manifest.name = 'Vilda — podgląd nowej strony głównej';
      manifest.short_name = 'Vilda podgląd';
      result = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    }
    files.set(relative, result);
  }
  for (const [relative, bytes] of files) {
    if (['.html', '.js', '.mjs', '.json'].includes(path.extname(relative)) && bytes.includes(Buffer.from('vilda-sync.maciej-4b9.workers.dev'))) {
      throw new Error('Production endpoint survived preview export: ' + relative);
    }
  }
  files.set('vilda_home_preview.js', bootstrap);
  files.set('vilda_home_preview.css', stylesheet);
  // Cloudflare-compatible static response policy also protects service-worker
  // fetches. Every document additionally carries the same policy before scripts.
  files.set('_headers', Buffer.from('/*\n  Content-Security-Policy: ' + PREVIEW_CSP + '\n  X-Robots-Tag: noindex, nofollow\n'));
  const manifest = { schemaVersion: 1, kind: 'vilda-home-preview', sourceCommit, sourceDirty, buildId,
    isolation: { productionNetwork: 'blocked', account: 'fictional-local-only' },
    files: [...files].map(([file, bytes]) => ({ file, sha256: digest(bytes), size: bytes.length })) };
  for (const [relative, bytes] of files) {
    const target = path.join(destination.directory, relative);
    // Do not follow a pre-existing link left inside an export directory.
    for (let parent = target; parent !== destination.directory; parent = path.dirname(parent)) {
      const info = await lstat(parent).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
      if (info?.isSymbolicLink()) throw new Error('Preview output contains a symlink: ' + relative);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  for (const prior of destination.prior?.files || []) {
    if (typeof prior.file !== 'string' || prior.file.startsWith('/') || prior.file.split('/').includes('..')) throw new Error('Unsafe prior export entry.');
    if (!files.has(prior.file)) {
      const stale = path.join(destination.directory, prior.file);
      for (let parent = path.dirname(stale); parent !== destination.directory; parent = path.dirname(parent)) {
        const info = await lstat(parent).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
        if (info?.isSymbolicLink()) throw new Error('Prior preview output contains a symlink.');
      }
      await unlink(stale).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  await writeFile(path.join(destination.directory, EXPORT_MARKER), JSON.stringify(manifest, null, 2) + '\n');
  return { directory: destination.directory, sourceCommit, sourceDirty, buildId, files: files.size, bytes: [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output') throw new Error('Usage: node tools/home-preview/export.mjs --output /absolute/output/directory');
  console.log(JSON.stringify(await exportPreview({ output: args[1] }), null, 2));
}
