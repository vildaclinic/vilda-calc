import { afterEach, describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import {
  exportPreview, isPreviewAsset, isolateDocument, isolateText, isolateWorker, readRegularAsset, demoAccessDocument,
  PREVIEW_WORKER_NETWORK_GUARD,
} from '../../tools/home-preview/export.mjs';

const directories = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function repository() {
  const directory = await mkdtemp(path.join(tmpdir(), 'vilda-home-preview-'));
  directories.push(directory);
  const source = path.join(directory, 'source');
  await mkdir(source);
  const fixture = {
    'index.html': '<!doctype html><html><head><script>window.original = true;</script></head><body>Native form</body></html>',
    'app.html': '<!doctype html><html><head></head><body><iframe src="index.html"></iframe></body></html>',
    'docpro.html': '<!doctype html><html><head></head><body>DocPro</body></html>',
    'subskrypcja.html': '<!doctype html><html><head><title>Paid subscription</title></head><body><header>Native header</header><main class="main-content"><button id="subTrialBtn">Trial</button><button id="subBuyBtn">Checkout</button></main><footer>Native footer</footer><script defer src="inline_subskrypcja_00.js?v=2"></script><script defer src="inline_subskrypcja_01.js?v=1"></script></body></html>',
    'vilda_home_workspace.js': 'window.VildaHomeWorkspace = {};',
    'vilda_home_workspace.css': '.vilda-home-workspace { display: grid; }',
    'vilda_vault.js': "const nativeOrigin = 'https://vilda-sync.maciej-4b9.workers.dev'; const formula = 46 / (1.58 * 1.58);",
    'vilda_realtime.js': "const source = 'wss://vilda-sync.maciej-4b9.workers.dev';",
    'manifest.json': JSON.stringify({ name: 'Native app', short_name: 'Native', start_url: 'app.html#/start', scope: './' }),
    'service-worker-kalorii.js': "const SW_VERSION = '1.1.536';\nconst CACHE_PREFIX = 'pwa-kalorii';\nconst CORE_SHELL_URLS = [\n'/index.html'\n];",
    'runtime/clinical-workspace-v1/family/client/model.mjs': 'export const VERSION = 1;\n',
    'runtime/clinical-workspace-v1/family/precache.json': '{"schemaVersion":1,"files":[]}',
    'tests/fixtures/secret.json': '{"fixture":"not a deployable asset"}',
    '.env': 'FICTIONAL_SECRET=must-not-be-exported',
    'package.json': '{"name":"not-runtime"}',
  };
  for (const [relative, text] of Object.entries(fixture)) {
    await mkdir(path.dirname(path.join(source, relative)), { recursive: true });
    await writeFile(path.join(source, relative), text);
  }
  const git = args => execFileSync('git', args, { cwd: source, stdio: 'pipe' });
  git(['init', '-q']); git(['add', '.']);
  git(['-c', 'user.name=Fictional Preview Test', '-c', 'user.email=preview@example.invalid', 'commit', '-qm', 'Synthetic export fixture']);
  await writeFile(path.join(source, 'untracked-private.json'), '{"private":"excluded"}');
  return { directory, source, output: path.join(directory, 'output'), fixture };
}

describe('separate homepage preview export', () => {
  test('only indexed runtime assets are exported, original source and immutable modules stay byte-identical', async () => {
    const fixture = await repository();
    const result = await exportPreview(fixture);
    const manifest = JSON.parse(await readFile(path.join(fixture.output, '.vilda-home-preview-export.json'), 'utf8'));
    expect(result.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(result.sourceDirty).toBe(false);
    expect(manifest.sourceCommit).toBe(result.sourceCommit);
    const files = manifest.files.map(entry => entry.file);
    expect(files).not.toContain('.env');
    expect(files).not.toContain('tests/fixtures/secret.json');
    expect(files).not.toContain('untracked-private.json');
    expect(files).not.toContain('package.json');
    for (const entry of manifest.files) expect(hash(await readFile(path.join(fixture.output, entry.file)))).toBe(entry.sha256);
    for (const [relative, text] of Object.entries(fixture.fixture)) expect(await readFile(path.join(fixture.source, relative), 'utf8')).toBe(text);
    for (const relative of files.filter(file => file.startsWith('runtime/'))) {
      expect(await readFile(path.join(fixture.output, relative), 'utf8')).toBe(fixture.fixture[relative]);
    }
    const vault = await readFile(path.join(fixture.output, 'vilda_vault.js'), 'utf8');
    expect(vault).toContain('https://vilda-preview-disabled.invalid');
    expect(vault).toContain('const formula = 46 / (1.58 * 1.58);');
    expect(vault).not.toContain('workers.dev');
  });

  test('every HTML document installs network policy and bootstrap before any native script', async () => {
    const fixture = await repository();
    await exportPreview(fixture);
    for (const name of ['index.html', 'app.html', 'docpro.html', 'subskrypcja.html']) {
      const html = await readFile(path.join(fixture.output, name), 'utf8');
      expect(html.indexOf("connect-src 'self'")).toBeLessThan(html.indexOf('<script'));
      expect(html.match(/<script[^>]+src="([^"]+)"/)[1]).toMatch(/^vilda_home_preview\.js\?v=[0-9a-f]+$/);
      expect(html).toContain("frame-src 'self' blob:");
      expect(html).toContain("form-action 'self'");
    }
    expect(await readFile(path.join(fixture.output, '_headers'), 'utf8')).toContain("connect-src 'self'");
  });

  test('exported subscription is an honest demo screen with no purchase or trial handlers', async () => {
    const fixture = await repository();
    await exportPreview(fixture);
    const exported = await readFile(path.join(fixture.output, 'subskrypcja.html'), 'utf8');
    expect(exported).toContain('Dostęp demonstracyjny');
    expect(exported).toContain('app.html#/start');
    expect(exported).toContain('app.html#/docpro');
    expect(exported).toContain('Native header'); expect(exported).toContain('Native footer');
    expect(exported).not.toMatch(/subTrialBtn|subBuyBtn|inline_subskrypcja_0[01]\.js/);
    const native = await readFile(new URL('../../subskrypcja.html', import.meta.url), 'utf8');
    const transformed = demoAccessDocument(native);
    expect(transformed).not.toMatch(/subTrialBtn|subBuyBtn|inline_subskrypcja_0[01]\.js|49&nbsp;zł|2099|2100/);
    expect(transformed).toContain('vilda_auth_ui.js');
    expect(transformed).toContain('vilda_pro_access.js');
    expect(() => demoAccessDocument('<html><body>No main</body></html>')).toThrow(/subscription document/);
  });

  test('build identity changes with source bytes and rebuild safely updates its own output', async () => {
    const fixture = await repository();
    const first = await exportPreview(fixture);
    expect((await exportPreview(fixture)).buildId).toBe(first.buildId);
    await writeFile(path.join(fixture.source, 'vilda_home_workspace.css'), '.vilda-home-workspace { display: block; }');
    const second = await exportPreview(fixture);
    expect(second.buildId).not.toBe(first.buildId);
    expect(second.sourceDirty).toBe(true);
    const worker = await readFile(path.join(fixture.output, 'service-worker-kalorii.js'), 'utf8');
    expect(worker).toContain('vilda-home-preview');
    expect(worker).toContain('-preview-' + second.buildId);
    expect(worker).toContain('/vilda_home_preview.js?v=' + second.buildId);
    expect(worker).not.toContain(first.buildId);
  });

  test('refuses source overwrite, unknown output and symlink destinations', async () => {
    const fixture = await repository();
    await expect(exportPreview({ ...fixture, output: path.join(fixture.source, 'dist') })).rejects.toThrow(/separate/);
    await mkdir(fixture.output); await writeFile(path.join(fixture.output, 'user-file.txt'), 'Do not overwrite');
    await expect(exportPreview(fixture)).rejects.toThrow(/empty or belong/);
    expect(await readFile(path.join(fixture.output, 'user-file.txt'), 'utf8')).toBe('Do not overwrite');
    const link = path.join(fixture.directory, 'linked-output'); await symlink(fixture.output, link);
    await expect(exportPreview({ ...fixture, output: link })).rejects.toThrow(/symlink/);
  });

  test('source assets are read from a regular descriptor and source symlinks are never followed', async () => {
    const fixture = await repository();
    const regular = path.join(fixture.source, 'vilda_home_workspace.js');
    expect((await readRegularAsset(regular)).toString()).toBe(fixture.fixture['vilda_home_workspace.js']);
    await expect(readRegularAsset(fixture.source)).rejects.toThrow(/regular file/);
    await rm(regular);
    await symlink(path.join(fixture.source, '.env'), regular);
    await expect(readRegularAsset(regular)).rejects.toMatchObject({ code: 'ELOOP' });
    await expect(exportPreview(fixture)).rejects.toMatchObject({ code: 'ELOOP' });
  });

  test('fails closed if a future immutable package embeds a production endpoint', async () => {
    const fixture = await repository();
    await writeFile(path.join(fixture.source, 'runtime/clinical-workspace-v1/family/client/model.mjs'), "export const origin = 'https://vilda-sync.maciej-4b9.workers.dev';");
    await expect(exportPreview(fixture)).rejects.toThrow(/Production endpoint survived/);
  });

  test('rejects unsupported document and worker contracts instead of publishing partially isolated output', () => {
    expect(() => isolateDocument('<script>oldStartup()</script>', 'abc')).toThrow(/explicit head/);
    expect(() => isolateWorker('unknown worker format', 'abc')).toThrow(/Unknown service-worker/);
    expect(isolateText("'https://vilda-sync.maciej-4b9.workers.dev' 'wss://vilda-sync.maciej-4b9.workers.dev'"))
      .toBe("'https://vilda-preview-disabled.invalid' 'wss://vilda-preview-disabled.invalid'");
    for (const privatePath of ['.git/config', '/index.html', '../index.html', 'tests/data.json', 'node_modules/index.js', '.env', 'package-lock.json']) expect(isPreviewAsset(privatePath)).toBe(false);
  });

  test('actual generated service-worker network guard rejects external requests without reaching fetch', async () => {
    const calls = [];
    const scope = { location: { href: 'https://preview.example.invalid/service-worker-kalorii.js', origin: 'https://preview.example.invalid' },
      fetch(input, options) { calls.push({ input, options }); return Promise.resolve('local response'); } };
    vm.runInNewContext(PREVIEW_WORKER_NETWORK_GUARD, { self: scope, URL, Promise, TypeError });
    for (const url of ['https://vilda-sync.maciej-4b9.workers.dev/v1/slots/test', 'https://www.google-analytics.com/collect', '//external.example.invalid/api']) {
      await expect(scope.fetch(url)).rejects.toThrow(/disabled/);
    }
    await expect(scope.fetch({ url: 'https://vilda-sync.maciej-4b9.workers.dev/v1/workspace' })).rejects.toThrow(/disabled/);
    expect(calls).toHaveLength(0);
    await expect(scope.fetch('/index.html')).resolves.toBe('local response');
    await expect(scope.fetch(new URL('https://preview.example.invalid/app.js?v=1'))).resolves.toBe('local response');
    expect(calls).toHaveLength(2);
  });
});

const ACCOUNT_KEY = 'vilda-home-preview-fictional-account-v1';
const ACCOUNT_LABEL = 'Podgląd — wyłącznie fikcyjni pacjenci';
const RUNTIME_SOURCE = await readFile(new URL('../../tools/home-preview/runtime.js', import.meta.url), 'utf8');
const NATIVE_PRO_ACCESS_SOURCE = await readFile(new URL('../../vilda_pro_access.js', import.meta.url), 'utf8');

function previewStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return { getItem: key => values.get(key) ?? null, setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }, values };
}

function fictionalNativeVault(patients = []) {
  const account = { userId: 'fictional-preview-account', label: ACCOUNT_LABEL };
  const calls = { listUsers: 0, listPatients: [], savePatient: [], unlock: [] };
  return {
    account, calls, patients,
    isUnlocked: () => true, getCurrentUser: () => ({ ...account }), listUsers: async () => { calls.listUsers++; return [{ ...account }]; },
    listPatients: async options => { calls.listPatients.push(options); return patients.map(patient => ({ ...patient })); },
    savePatient: async payload => {
      calls.savePatient.push(payload);
      const record = { patientId: 'fictional-preview-patient', createdAtISO: '2026-11-03T12:00:00Z' };
      patients.push(record); return { ...record };
    },
    unlockUser: async (...args) => { calls.unlock.push(args); },
  };
}

function bootPreview({ storage, vault, locks, pathname = '/index.html', hash = '', opened = true, hasAuth = true, authReady = () => true, hostedFrame = false, sameOriginWrapper = false }) {
  const nodes = [], listeners = new Map(), classes = new Set(['vilda-pro-inactive']);
  const calls = { reload: 0, timers: 0 };
  const node = () => ({ append() {}, remove() {}, setAttribute() {}, addEventListener() {} });
  const document = {
    readyState: 'complete',
    addEventListener(type, callback) { const entries = listeners.get(type) || []; entries.push(callback); listeners.set(type, entries); },
    removeEventListener(type, callback) { listeners.set(type, (listeners.get(type) || []).filter(entry => entry !== callback)); },
    createElement: node,
    documentElement: { classList: { toggle(name, value) { if (value) classes.add(name); else classes.delete(name); } } },
    getElementById: id => nodes.find(element => element.id === id) || (id === 'userSection' ? {} : null),
    body: { append(element) { nodes.push(element); } },
  };
  const window = {
    document, location: { hostname: 'preview.example.invalid', origin: 'https://preview.example.invalid', pathname, hash, reload() { calls.reload++; } },
    localStorage: storage, sessionStorage: previewStorage(opened ? { 'vilda-home-preview-opened-v1': '1' } : {}),
    navigator: { locks }, setTimeout(...args) { calls.timers++; return setTimeout(...args); }, clearTimeout,
    VildaVault: hasAuth ? vault : undefined, VildaAuthUI: hasAuth ? { isBootReady: authReady } : undefined,
    VildaPersistRuntime: { getSnapshot: () => ({ initialized: true }) },
    VildaDataImportExport: { isMainSessionRestorePending: () => false, isMainSessionAutosavePaused: () => false },
    VildaPersistence: { isAutosaveSuppressed: () => false }, VildaDobAge: { restorePending: () => false },
    VildaProAccess: { __setTokenModeForTest() {}, setPlan() {}, hasAccess: () => true },
    applyLoadedData() { throw new Error('Existing session must not be replaced.'); }, collectUserData() {},
  };
  window.top = hostedFrame ? {} : window;
  if (hostedFrame) {
    window.frameElement = null;
    window.parent = {};
    Object.defineProperty(window.parent, 'location', { get() { throw new Error('Cross-origin host is inaccessible.'); } });
  }
  if (sameOriginWrapper) {
    window.top = {};
    window.parent = { location: { origin: window.location.origin, pathname: '/app.html' } };
    window.frameElement = { classList: { contains: value => value === 'app-pane' }, contentWindow: window };
  }
  vm.runInNewContext(RUNTIME_SOURCE, { window, Promise, Date, JSON, Object, String, Error });
  return { window, nodes, calls, classes, fire(type) { for (const callback of [...(listeners.get(type) || [])]) callback(); } };
}

async function previewFinished(window) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = window.VildaHomePreview.getState();
    if (state.status === 'ready' || state.status === 'error') return state;
    await new Promise(resolve => { setTimeout(resolve, 0); });
  }
  throw new Error('Preview fixture did not finish.');
}

describe('fictional preview patient selection remains inside the native vault', () => {
  test('legacy patient ID is removed only for the verified fictional account without replacing the session', async () => {
    const vault = fictionalNativeVault([{ patientId: 'fictional-original-patient', createdAtISO: '2026-11-03T12:00:00Z' }]);
    const storage = previewStorage({ [ACCOUNT_KEY]: JSON.stringify({ userId: vault.account.userId, patientId: 'fictional-original-patient' }) });
    const { window } = bootPreview({ storage, vault });
    expect((await previewFinished(window)).status).toBe('ready');
    expect(JSON.parse(storage.getItem(ACCOUNT_KEY))).toEqual({ userId: vault.account.userId });
    expect(vault.calls.listPatients).toHaveLength(1);
    expect(vault.calls.listPatients[0].strict).toBe(true);
    expect(vault.calls.listPatients[0].isCurrent()).toBe(true);
    expect(vault.calls.savePatient).toHaveLength(0);
    expect(vault.calls.unlock).toHaveLength(0);
  });

  test('concurrent first tabs share the native read-and-seed lock without persisting a patient ID', async () => {
    const vault = fictionalNativeVault();
    const storage = previewStorage({ [ACCOUNT_KEY]: JSON.stringify({ userId: vault.account.userId }) });
    let pending = Promise.resolve();
    const locks = { request(_name, callback) { const result = pending.then(callback); pending = result.catch(() => {}); return result; } };
    const first = bootPreview({ storage, vault, locks });
    const second = bootPreview({ storage, vault, locks });
    expect((await previewFinished(first.window)).status).toBe('ready');
    expect((await previewFinished(second.window)).status).toBe('ready');
    expect(vault.calls.savePatient).toHaveLength(1);
    expect(vault.calls.savePatient[0].user.lastName).toBe('Przykładowy');
    expect(vault.patients).toHaveLength(1);
    expect(JSON.parse(storage.getItem(ACCOUNT_KEY))).toEqual({ userId: vault.account.userId });
    expect([...storage.values.values()].join(' ')).not.toContain(vault.patients[0].patientId);
  });

  test('a foreign account neither migrates the marker nor reads or creates patients', async () => {
    const vault = fictionalNativeVault();
    vault.account.label = 'Fictional unrelated account';
    const priorMarker = JSON.stringify({ userId: vault.account.userId, patientId: 'fictional-unrelated-patient' });
    const storage = previewStorage({ [ACCOUNT_KEY]: priorMarker });
    const { window } = bootPreview({ storage, vault });
    expect((await previewFinished(window)).status).toBe('error');
    expect(storage.getItem(ACCOUNT_KEY)).toBe(priorMarker);
    expect(vault.calls.listPatients).toHaveLength(0);
    expect(vault.calls.savePatient).toHaveLength(0);
    expect(vault.calls.unlock).toHaveLength(0);
  });
});

describe('standalone demo access', () => {
  test.each([
    ['/subskrypcja.html', ''], ['/docpro.html', ''], ['/ustawienia.html', ''], ['/app.html', '#/docpro'],
  ])('%s%s prepares owned access without reading, selecting or creating a patient', async (pathname, hash) => {
    const vault = fictionalNativeVault();
    const storage = previewStorage({ [ACCOUNT_KEY]: JSON.stringify({ userId: vault.account.userId }) });
    const frame = bootPreview({ storage, vault, pathname, hash, opened: false });
    expect(await previewFinished(frame.window)).toMatchObject({ status: 'ready', doctorAccess: true });
    expect(vault.calls.listPatients).toHaveLength(0); expect(vault.calls.savePatient).toHaveLength(0);
    expect(frame.window.sessionStorage.getItem('vilda-home-preview-opened-v1')).toBeNull();
    expect(frame.classes.has('vilda-pro-active')).toBe(true);
    expect(frame.classes.has('vilda-pro-inactive')).toBe(false);
    expect(frame.nodes.find(node => node.id === 'vildaHomePreviewBadge').textContent).toContain('lekarski aktywny');
    expect(storage.getItem('professionalConfirmedDate')).toBeNull();
  });

  test('a new standalone tab unlocks only the known fictional account then reloads the same page', async () => {
    const vault = fictionalNativeVault();
    let unlocked = false;
    vault.isUnlocked = () => unlocked; vault.getCurrentUser = () => unlocked ? { ...vault.account } : null;
    vault.unlockUser = async (...args) => { vault.calls.unlock.push(args); unlocked = true; };
    const storage = previewStorage({ [ACCOUNT_KEY]: JSON.stringify({ userId: vault.account.userId }) });
    const first = bootPreview({ storage, vault, pathname: '/subskrypcja.html', opened: false });
    for (let attempt = 0; attempt < 100 && !first.calls.reload; attempt++) await new Promise(resolve => { setTimeout(resolve, 0); });
    expect(first.calls.reload).toBe(1);
    expect(vault.calls.unlock).toHaveLength(1); expect(vault.calls.unlock[0][0]).toBe(vault.account.userId);
    const reopened = bootPreview({ storage, vault, pathname: '/subskrypcja.html', opened: false });
    expect(await previewFinished(reopened.window)).toMatchObject({ status: 'ready', doctorAccess: true });
    expect(vault.calls.listPatients).toHaveLength(0); expect(vault.calls.savePatient).toHaveLength(0);
  });

  test('standalone pages refuse a foreign account without unlocking or reading its patients', async () => {
    const vault = fictionalNativeVault(); vault.account.label = 'Unrelated fictional account';
    const storage = previewStorage({ [ACCOUNT_KEY]: JSON.stringify({ userId: vault.account.userId }), pwzNumber: 'fictional-foreign-pwz' });
    const frame = bootPreview({ storage, vault, pathname: '/subskrypcja.html', opened: false });
    const result = await previewFinished(frame.window);
    expect(result.status).toBe('error');
    expect(result.error).toContain('w nowym oknie prywatnym');
    expect(result.error).toContain('Nie zakładaj konta w aplikacji');
    expect(storage.getItem('pwzNumber')).toBe('fictional-foreign-pwz');
    expect(vault.calls.unlock).toHaveLength(0); expect(vault.calls.listPatients).toHaveLength(0);
    expect(frame.calls.reload).toBe(0);
    expect(frame.classes.has('vilda-pro-inactive')).toBe(true);
  });

  test('legal information without auth remains readable without waiting, creating an account or scheduling polling', async () => {
    const vault = fictionalNativeVault(), storage = previewStorage();
    const frame = bootPreview({ storage, vault, pathname: '/regulamin.html', hasAuth: false });
    expect(await previewFinished(frame.window)).toMatchObject({ status: 'ready', doctorAccess: false });
    expect(frame.calls.timers).toBe(0); expect(vault.calls.listUsers).toBe(0);
    expect(storage.getItem(ACCOUNT_KEY)).toBeNull();
  });

  test('an auth-bearing standalone page waits for the real auth finalizer and then proceeds once', async () => {
    const vault = fictionalNativeVault();
    const storage = previewStorage({ [ACCOUNT_KEY]: JSON.stringify({ userId: vault.account.userId }) });
    let authReady = false;
    const frame = bootPreview({ storage, vault, pathname: '/subskrypcja.html', authReady: () => authReady });
    await Promise.resolve();
    expect(frame.window.VildaHomePreview.getState().status).toBe('starting');
    expect(vault.calls.listUsers).toBe(0);
    authReady = true; frame.fire('vilda:auth-boot-settled');
    expect((await previewFinished(frame.window)).status).toBe('ready');
    frame.fire('vilda:auth-boot-settled');
    expect(vault.calls.listUsers).toBe(1);
    expect(frame.calls.timers).toBe(1);
  });

  test('a Site embedded by an inaccessible cross-origin host still owns bootstrap and creates its example', async () => {
    const vault = fictionalNativeVault();
    const storage = previewStorage({ [ACCOUNT_KEY]: JSON.stringify({ userId: vault.account.userId }) });
    const frame = bootPreview({ storage, vault, hostedFrame: true });
    expect(await previewFinished(frame.window)).toMatchObject({ status: 'ready', doctorAccess: true });
    expect(vault.calls.listUsers).toBe(1);
    expect(vault.calls.savePatient).toHaveLength(1);
    expect(frame.nodes.find(node => node.id === 'vildaHomePreviewBadge')).toBeTruthy();
  });

  test('a provider wrapper with a coincidental native-looking frame does not own bootstrap without the preview parent marker', async () => {
    const vault = fictionalNativeVault();
    const storage = previewStorage({ [ACCOUNT_KEY]: JSON.stringify({ userId: vault.account.userId }) });
    const frame = bootPreview({ storage, vault, sameOriginWrapper: true });
    expect((await previewFinished(frame.window)).status).toBe('ready');
    expect(vault.calls.savePatient).toHaveLength(1);
  });

  test('a freshly created verified fictional account receives only a missing demo PWZ before reload', async () => {
    const vault = fictionalNativeVault();
    let unlocked = false;
    vault.isUnlocked = () => unlocked; vault.getCurrentUser = () => unlocked ? { ...vault.account } : null;
    vault.listUsers = async () => [];
    vault.createUser = async () => { unlocked = true; return { userId: vault.account.userId }; };
    const storage = previewStorage();
    const frame = bootPreview({ storage, vault, pathname: '/subskrypcja.html', opened: false });
    for (let attempt = 0; attempt < 100 && !frame.calls.reload; attempt++) await new Promise(resolve => { setTimeout(resolve, 0); });
    expect(frame.calls.reload).toBe(1);
    expect(storage.getItem('pwzNumber')).toBe('0000000');
    expect(storage.getItem('professionalConfirmedDate')).toBeNull();
    expect(JSON.parse(storage.getItem(ACCOUNT_KEY))).toEqual({ userId: vault.account.userId });
  });

  test('an existing PWZ preference is preserved even on the verified fictional account', async () => {
    const vault = fictionalNativeVault();
    const storage = previewStorage({ [ACCOUNT_KEY]: JSON.stringify({ userId: vault.account.userId }), pwzNumber: 'fictional-existing-pwz' });
    const frame = bootPreview({ storage, vault, pathname: '/subskrypcja.html' });
    expect((await previewFinished(frame.window)).status).toBe('ready');
    expect(storage.getItem('pwzNumber')).toBe('fictional-existing-pwz');
    expect(storage.getItem('professionalConfirmedDate')).toBeNull();
  });
});

function embeddedPreview({ foreign = false, alreadyUnlocked = false, lazy = false } = {}) {
  const listeners = new Map(), unlockListeners = [];
  const account = { userId: foreign ? 'fictional-foreign-account' : 'fictional-preview-account', label: ACCOUNT_LABEL };
  let unlocked = alreadyUnlocked;
  const storage = previewStorage({ [ACCOUNT_KEY]: JSON.stringify({ userId: 'fictional-preview-account' }) });
  const document = {
    readyState: 'loading',
    addEventListener(type, callback, options) {
      const callbacks = listeners.get(type) || [];
      callbacks.push({ callback, once: options?.once === true }); listeners.set(type, callbacks);
    },
    dispatchEvent(event) {
      for (const entry of [...(listeners.get(event.type) || [])]) {
        entry.callback(event);
        if (entry.once) listeners.set(event.type, listeners.get(event.type).filter(item => item !== entry));
      }
    },
  };
  const window = {
    document, top: {}, location: { hostname: 'preview.example.invalid', origin: 'https://preview.example.invalid', pathname: '/docpro.html' },
    localStorage: storage, sessionStorage: previewStorage(),
    addEventListener() {}, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1,
    atob, btoa,
  };
  window.parent = { location: { origin: window.location.origin, pathname: '/app.html' }, __VILDA_HOME_WORKSPACE_PREVIEW__: true };
  window.frameElement = { classList: { contains: value => value === 'app-pane' }, contentWindow: window };
  class CustomEvent { constructor(type) { this.type = type; } }
  const context = vm.createContext({ window, CustomEvent, TextEncoder, TextDecoder, Uint8Array, Promise });
  // Export bootstrap is the first script. Native deferred modules appear later.
  vm.runInContext(RUNTIME_SOURCE, context);
  const attachVault = () => {
    window.VildaVault = {
      isUnlocked: () => unlocked, getCurrentUser: () => unlocked ? { ...account } : null,
      onUnlock(callback) { unlockListeners.push(callback); },
    };
  };
  const loadAccess = () => vm.runInContext(NATIVE_PRO_ACCESS_SOURCE, context);
  if (!lazy) { attachVault(); loadAccess(); }
  const fire = type => document.dispatchEvent(new CustomEvent(type));
  return {
    window, storage, unlockListeners, fire, attachVault, loadAccess,
    unlock() { unlocked = true; for (const listener of [...unlockListeners]) listener(); },
    lock() { unlocked = false; },
  };
}

describe('fictional access follows actual native auth completion in each frame', () => {
  test('DCL before asynchronous unlock activates native access and auth completion handles a late cache reset', async () => {
    const frame = embeddedPreview();
    const access = frame.window.VildaProAccess;
    frame.fire('DOMContentLoaded');
    expect(access.__isTokenModeOn()).toBe(true);
    expect(access.hasAccess()).toBe(false);
    frame.unlock();
    await Promise.resolve(); await Promise.resolve();
    expect(access.__isTokenModeOn()).toBe(false);
    expect(access.hasAccess()).toBe(true);
    const subscriptions = frame.unlockListeners.length;
    access.invalidateCache();
    expect(access.hasAccess()).toBe(true);
    frame.fire('vilda:auth-boot-settled');
    frame.fire('vilda:auth-boot-settled');
    expect(access.hasAccess()).toBe(true);
    expect(frame.unlockListeners).toHaveLength(subscriptions);
  });

  test('an already restored owned frame activates immediately when parsing completes', () => {
    const frame = embeddedPreview({ alreadyUnlocked: true });
    frame.fire('DOMContentLoaded');
    expect(frame.window.VildaProAccess.__isTokenModeOn()).toBe(false);
    expect(frame.window.VildaProAccess.hasAccess()).toBe(true);
  });

  test('lazy auth loader binds and activates access even when auth settles before the access module loads', () => {
    const frame = embeddedPreview({ alreadyUnlocked: true, lazy: true });
    frame.fire('DOMContentLoaded');
    frame.attachVault();
    frame.fire('vilda:auth-boot-settled');
    frame.loadAccess();
    // The native module's first access-state event can now reconcile the
    // already owned account before the lazy loader emits auth-loaded.
    expect(frame.window.VildaProAccess.__isTokenModeOn()).toBe(false);
    expect(frame.window.VildaProAccess.hasAccess()).toBe(true);
    frame.fire('vilda:auth-loaded');
    expect(frame.window.VildaProAccess.__isTokenModeOn()).toBe(false);
    expect(frame.window.VildaProAccess.hasAccess()).toBe(true);
  });

  test('foreign and locked accounts never receive the fictional plan from auth events', () => {
    const foreign = embeddedPreview({ foreign: true });
    foreign.fire('DOMContentLoaded'); foreign.unlock(); foreign.fire('vilda:auth-boot-settled');
    expect(foreign.window.VildaProAccess.__isTokenModeOn()).toBe(true);
    expect(foreign.window.VildaProAccess.getSnapshot()).toBeNull();
    const locked = embeddedPreview();
    locked.fire('DOMContentLoaded'); locked.fire('vilda:auth-boot-settled');
    expect(locked.window.VildaProAccess.__isTokenModeOn()).toBe(true);
    expect(locked.window.VildaProAccess.getSnapshot()).toBeNull();
  });

  test('a late native pro gate is reconciled after its result-mode listeners, without a timer or recursive loop', async () => {
    const frame = embeddedPreview({ alreadyUnlocked: true });
    const access = frame.window.VildaProAccess;
    frame.fire('DOMContentLoaded');
    let professionalResults = true, notifications = 0;
    frame.window.document.addEventListener('vilda:pro-gate-active', () => { professionalResults = false; });
    frame.window.document.addEventListener('vildaProAccessChanged', () => { notifications++; professionalResults = access.hasAccess(); });
    frame.fire('vilda:pro-gate-active');
    expect(professionalResults).toBe(false);
    await Promise.resolve();
    expect(access.hasAccess()).toBe(true);
    expect(professionalResults).toBe(true);
    expect(notifications).toBe(1);
    frame.lock(); access.invalidateCache(); frame.fire('vilda:pro-gate-active');
    await Promise.resolve();
    expect(access.hasAccess()).toBe(false);
    expect(access.getSnapshot()).toBeNull();
  });
});
