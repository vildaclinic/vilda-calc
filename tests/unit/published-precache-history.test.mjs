import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { zaplanuj, zastosuj } from '../support/podbij-wersje.mjs';
import { biezaceWersje } from '../support/wersje-zasobow.mjs';

// Exercise the official planner on real, exclusively synthetic Git histories.
// A feature commit is not publication provenance, even when its URLs are in HEAD.
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PIN = 'tests/fixtures/home-published-precache-history.json';
const WORKER = 'service-worker-kalorii.js';
const ENV = {
  ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Fictional Test', GIT_AUTHOR_EMAIL: 'fictional@example.invalid',
  GIT_COMMITTER_NAME: 'Fictional Test', GIT_COMMITTER_EMAIL: 'fictional@example.invalid',
};
const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});
function temporary(prefix = 'published-precache-') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); directories.push(directory); return directory;
}
const digest = text => createHash('sha256').update(text).digest('hex');
function worker(version = '1.1.10', entries = [2, 3]) {
  return `const SW_VERSION = '${version}';\nconst ROOT_DOCUMENT = '/index.html';\nconst CORE_SHELL_URLS = [\n  ROOT_DOCUMENT,\n${entries.map(v => `  '/engine.js?v=${v}',`).join('\n')}\n];\nconst OPTIONAL_DOCUMENTS = ['/app.html'];\nconst OPTIONAL_ASSETS = [];\n`;
}
function fixture() {
  const directory = temporary();
  const git = (...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd: directory, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const write = (relative, text) => {
    const absolute = path.join(directory, relative); fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, text);
  };
  const read = relative => fs.readFileSync(path.join(directory, relative), 'utf8');
  write('index.html', '<!doctype html>\n<script src="engine.js?v=3"></script>\n<p>Fictional integration</p>\n');
  write('app.html', '<!doctype html>\n<script src="engine.js?v=3"></script>\n');
  write('engine.js', 'window.fictionalEngine = 1;\n');
  write(WORKER, worker());
  write('tests/unit/klirens-ui-model.test.mjs', "const SW_VERSION = '1.1.10';\n");
  const state = () => write('tests/fixtures/wersje-zasobow.json', JSON.stringify(biezaceWersje(directory), null, 1) + '\n');
  state(); git('init', '-q'); git('config', 'core.autocrlf', 'false'); git('checkout', '-q', '-b', 'integration');
  const commit = message => { git('add', '-A'); git('commit', '-q', '-m', message); return git('rev-parse', 'HEAD'); };
  const base = commit('fictional integration base');
  git('checkout', '-q', '-b', 'agent/feature');
  const plan = (baseRef = 'integration') => zaplanuj({ katalog: directory, baza: baseRef });
  const apply = (baseRef = 'integration') => { const result = plan(baseRef); zastosuj(result, { katalog: directory }); return result; };
  return { directory, git, write, read, state, commit, base, plan, apply };
}
function published(r, entries = [2, 3, 4, 5, 7]) {
  r.git('checkout', '-q', '-b', 'audyt', 'integration');
  r.write('engine.js', 'window.fictionalEngine = 2;\n');
  for (const relative of ['index.html', 'app.html']) r.write(relative, r.read(relative).replaceAll('engine.js?v=3', 'engine.js?v=7'));
  const source = worker('1.1.14', entries); r.write(WORKER, source); r.state();
  const commit = r.commit('fictional published worker');
  r.git('update-ref', 'refs/remotes/origin/audyt', commit);
  r.git('checkout', '-q', 'agent/feature'); r.git('merge', '-q', '--ff-only', 'audyt');
  const pin = { version: 1, commit, workerSHA256: digest(source) };
  r.write(PIN, JSON.stringify(pin) + '\n');
  return { pin, source };
}
function copyChecker(directory) {
  for (const relative of ['tests/scripts/podbij-wersje.mjs', 'tests/support/podbij-wersje.mjs', 'tests/support/wersje-zasobow.mjs']) {
    const target = path.join(directory, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(ROOT, relative), target);
  }
}
const output = result => `${result.stdout || ''}\n${result.stderr || ''}`.replace(/^::/gm, '> ::');

describe('published precache provenance and official version planning', () => {
  it('protects published URL multiplicities and derives new asset/SW ceilings from an older integration base', () => {
    const r = fixture(); published(r, [2, 3, 4, 4, 5, 7]);
    const plan = r.apply();
    expect(plan.bledy).toEqual([]); expect(plan.precache.usuniete).toEqual([]);
    expect(plan.pliki.find(entry => entry.plik === 'engine.js')).toMatchObject({ vBazy: 3, cel: 8, zmieniony: true });
    expect(plan.sw.cel).toBe('1.1.15'); expect(r.read('index.html')).toContain('engine.js?v=8');
    const result = r.read(WORKER);
    for (const version of [2, 3, 4, 5, 7, 8]) expect(result).toContain(`'/engine.js?v=${version}'`);
    expect(result.match(/'\/engine\.js\?v=4'/g)).toHaveLength(2);
    expect(r.plan().zmiany.size).toBe(0);
  });

  it('reports a missing published alias instead of silently deleting its provenance', () => {
    const r = fixture(); published(r);
    r.write(WORKER, r.read(WORKER).replace("  '/engine.js?v=5',\n", ''));
    const plan = r.plan(); expect(plan.bledy.join('\n')).toContain('/engine.js?v=5');
    expect(plan.precache.usuniete).not.toContain("'/engine.js?v=7'");
  });

  it('accepts publication ancestry through the actual pending MERGE_HEAD before committing the merge', () => {
    const r = fixture(), { pin } = published(r);
    r.git('checkout', '-q', '-B', 'agent/feature', 'integration');
    r.write('docs/fictional-feature.md', 'fictional independent change\n'); r.commit('fictional feature before merge');
    r.git('merge', '-q', '--no-commit', '--no-ff', 'audyt');
    expect(r.git('rev-parse', 'MERGE_HEAD')).toBe(pin.commit);
    expect(spawnSync('git', ['merge-base', '--is-ancestor', pin.commit, 'HEAD'], { cwd: r.directory, env: ENV }).status).toBe(1);
    const plan = r.plan(); expect(plan.bledy).toEqual([]); expect(plan.precache.usuniete).toEqual([]);
    expect(plan.pliki.find(entry => entry.plik === 'engine.js').cel).toBe(8);
  });

  it('still prunes an ordinary committed feature alias without approved publication provenance', () => {
    const r = fixture(); r.write(WORKER, worker('1.1.99', [2, 3, 999])); r.commit('fictional unnecessary feature versions');
    expect(fs.existsSync(path.join(r.directory, PIN))).toBe(false);
    const plan = r.apply(); expect(plan.bledy).toEqual([]);
    expect(plan.precache.usuniete).toContain("'/engine.js?v=999'");
    expect(r.read(WORKER)).toBe(worker()); expect(plan.sw.cel).toBe('1.1.10');
    expect(r.plan().zmiany.size).toBe(0);
  });

  it.each([
    ['malformed JSON', () => '{'],
    ['wrong version', pin => JSON.stringify({ ...pin, version: 2 })],
    ['unknown field', pin => JSON.stringify({ ...pin, urls: ['/engine.js?v=999'] })],
    ['missing commit', pin => JSON.stringify({ ...pin, commit: '0'.repeat(40) })],
    ['invalid commit shape', pin => JSON.stringify({ ...pin, commit: 'audyt' })],
    ['tampered worker hash', pin => JSON.stringify({ ...pin, workerSHA256: '0'.repeat(64) })],
    ['invalid hash shape', pin => JSON.stringify({ ...pin, workerSHA256: 'not-a-hash' })],
  ])('fails closed for %s', (_label, value) => {
    const r = fixture(), { pin } = published(r); r.write(PIN, value(pin));
    expect(() => r.plan()).toThrow();
  });

  it('rejects an existing but unrelated pinned commit with the exact worker hash', () => {
    const r = fixture(); published(r);
    r.git('checkout', '-q', '-b', 'unrelated', 'integration');
    const source = worker('1.1.44', [2, 3, 44]); r.write(WORKER, source); const commit = r.commit('fictional unrelated worker');
    r.git('checkout', '-q', 'agent/feature');
    r.write(PIN, JSON.stringify({ version: 1, commit, workerSHA256: digest(source) }) + '\n');
    expect(() => r.plan()).toThrow();
  });

  it('rejects a feature commit as its own publication provenance despite a valid worker hash and HEAD ancestry', () => {
    const r = fixture(); published(r);
    const source = worker('1.1.99', [2, 3, 4, 5, 7, 999]); r.write(WORKER, source);
    const commit = r.commit('fictional unapproved feature alias');
    r.write(PIN, JSON.stringify({ version: 1, commit, workerSHA256: digest(source) }) + '\n');
    expect(r.git('merge-base', '--is-ancestor', commit, 'HEAD')).toBe('');
    expect(() => r.plan()).toThrow();
  });

  it('rejects a pin when the independent publication ref is unavailable', () => {
    const r = fixture(); published(r); r.git('update-ref', '-d', 'refs/remotes/origin/audyt');
    expect(() => r.plan()).toThrow();
  });

  it('prepares and proves a pinned ancestor in a depth-two file-origin clone, then checks versions offline', () => {
    const r = fixture(); const { pin } = published(r); r.commit('record reviewed fictional publication pin');
    for (let index = 0; index < 5; index++) { r.write('docs/fictional-note.md', `fictional descendant ${index}\n`); r.commit(`fictional descendant ${index}`); }
    r.apply(); r.commit('official versions for fictional integration');
    // The synthetic PR merge and its parents exist, while the pinned published
    // ancestor lies outside actions/checkout's initial fetch-depth:2 boundary.
    r.git('checkout', '-q', '-b', 'pr/merge', 'integration'); r.git('merge', '-q', '--no-ff', '--no-edit', 'agent/feature');
    const clone = temporary('published-precache-shallow-');
    execFileSync('git', ['clone', '-q', '--depth=2', '--branch', 'pr/merge', `file://${r.directory}`, clone], { env: ENV, stdio: 'ignore' });
    expect(execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: clone, env: ENV, encoding: 'utf8' }).trim()).toBe('true');
    expect(spawnSync('git', ['cat-file', '-e', `${pin.commit}^{commit}`], { cwd: clone, env: ENV }).status).not.toBe(0);
    expect(() => zaplanuj({ katalog: clone, baza: 'HEAD^1' })).toThrow();
    // Merely possessing the pinned object is insufficient if a shallow boundary
    // still prevents proving that it belongs to the candidate's ancestry.
    execFileSync('git', ['fetch', '-q', '--no-tags', '--depth=1', 'origin', pin.commit], { cwd: clone, env: ENV, stdio: 'ignore' });
    execFileSync('git', ['update-ref', 'refs/remotes/origin/audyt', pin.commit], { cwd: clone, env: ENV });
    expect(spawnSync('git', ['cat-file', '-e', `${pin.commit}^{commit}`], { cwd: clone, env: ENV }).status).toBe(0);
    expect(() => zaplanuj({ katalog: clone, baza: 'HEAD^1' })).toThrow();
    execFileSync('git', ['update-ref', '-d', 'refs/remotes/origin/audyt'], { cwd: clone, env: ENV });
    const helper = spawnSync(process.execPath, [path.join(ROOT, 'tests/scripts/prepare-published-precache-history.mjs')], { cwd: clone, env: ENV, encoding: 'utf8' });
    expect(helper.status, output(helper)).toBe(0);
    expect(execFileSync('git', ['merge-base', '--is-ancestor', pin.commit, 'HEAD'], { cwd: clone, env: ENV, encoding: 'utf8' })).toBe('');
    // A dead origin proves the planner/checker do not depend on a network fallback.
    execFileSync('git', ['remote', 'set-url', 'origin', 'file:///fictional-unavailable-precache-origin'], { cwd: clone, env: ENV });
    copyChecker(clone);
    const check = spawnSync(process.execPath, ['tests/scripts/podbij-wersje.mjs', '--sprawdz', '--bez-sieci', '--baza=HEAD^1'], { cwd: clone, env: ENV, encoding: 'utf8' });
    expect(check.status, output(check)).toBe(0); expect(output(check)).not.toContain('BŁĄD:');
  });
});
