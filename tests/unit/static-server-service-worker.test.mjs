import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = 'tests/support/static-server.mjs';
const EXPECTED_PATHS = [
  '/vilda_visit_context.js', '/vilda_visit_history_ui.js', '/vilda_visit_history_ui.css',
  '/vilda_home_workspace.js', '/vilda_home_workspace.css',
  '/vilda_home_growth.js', '/vilda_home_growth_views.js', '/vilda_home_growth_views.css', '/vilda_home_growth_charts.js', '/vilda_home_perinatal.js', '/vilda_sga_birth_results.css',
  '/vilda_home_diet.js', '/vilda_home_diet_bmi.css', '/vilda_home_diet.css',
  '/vilda_home_dialog_history.js', '/vilda_home_patient_data.js', '/vilda_home_patient_note_host.js', '/vilda_home_patient_note_host.css', '/vilda_home_patient.js', '/vilda_home_patient.css',
  '/vilda_home_patient_native.js', '/vilda_home_patient_native.css', '/vilda_home_patient_native_note.js',
  '/vilda_patient_treatment_ui.js', '/vilda_patient_treatment_ui.css',
  '/vilda_icd10_pl_data.js', '/vilda_icd10_search.js', '/vilda_icd10_picker.js', '/vilda_icd10_picker.css',
  '/vilda_home_reminders.js', '/vilda_home_reminders.css', '/vilda_home_reminders_runtime.js',
];
const CONFIG = /const VISIT_UI_PRECACHE_PACK = Object\.freeze\((\{[\s\S]*?\})\);/;
const servers = [], directories = [];

async function startServer(directory = ROOT) {
  const child = spawn(process.execPath, [path.join(directory, SCRIPT)], {
    cwd: directory, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  servers.push(child);
  const origin = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    const timer = setTimeout(() => { reject(new Error('Static server did not become ready: ' + errors)); }, 5000);
    const fail = error => { clearTimeout(timer); reject(error); };
    child.once('error', fail);
    child.once('exit', code => fail(new Error('Static server exited before readiness: ' + code + ' ' + errors)));
    child.stderr.on('data', chunk => { errors += chunk; });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/vilda-calc test server: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  return { child, origin };
}

afterEach(async () => {
  for (const child of servers.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exit = once(child, 'exit');
    child.kill('SIGTERM');
    await exit;
  }
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe('actual E2E static-server service-worker endpoint', () => {
  it('serves all 32 exact versioned UI keys and continues serving the application afterwards', async () => {
    const { child, origin } = await startServer();
    const response = await fetch(origin + '/__test-service-worker-kalorii.js?wersja=fixture-8-ui');
    expect(response.status).toBe(200);
    expect(response.headers.get('service-worker-allowed')).toBe('/');
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    const worker = await response.text();
    expect(worker).toContain("const SW_VERSION = 'fixture-8-ui';");
    const config = JSON.parse(worker.match(CONFIG)[1]);
    const source = await readFile(path.join(ROOT, 'service-worker-kalorii.js'), 'utf8');
    expect(config).toEqual(JSON.parse(source.match(CONFIG)[1]));
    expect(config.files.map(file => file.url.split('?')[0]).sort()).toEqual([...EXPECTED_PATHS].sort());
    const core = worker.match(/const CORE_SHELL_URLS = \[[\s\S]*?\n\];/)[0];
    for (const file of config.files) {
      expect(file.url).toMatch(/\?v=[1-9][0-9]*$/);
      expect(core.split(JSON.stringify(file.url))).toHaveLength(2);
    }
    const page = await fetch(origin + '/index.html');
    expect(page.status).toBe(200);
    expect(await page.text()).toBe(await readFile(path.join(ROOT, 'index.html'), 'utf8'));
    expect(child.exitCode).toBeNull();
  });

  it.each([
    ['missing member', config => config.files.pop()],
    ['duplicate pathname with another version', config => { config.files[4] = { ...config.files[3], url: '/vilda_home_workspace.js?v=999' }; }],
    ['foreign member', config => { config.files[4].url = '/other.css?v=1'; }],
    ['unversioned member', config => { config.files[4].url = '/vilda_home_workspace.css'; }],
  ])('rejects %s with HTTP500 while the shared server stays alive', async (_name, mutate) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'vilda-static-server-contract-'));
    directories.push(directory);
    await mkdir(path.join(directory, 'tests/support'), { recursive: true });
    await writeFile(path.join(directory, SCRIPT), await readFile(path.join(ROOT, SCRIPT)));
    const source = await readFile(path.join(ROOT, 'service-worker-kalorii.js'), 'utf8');
    const config = JSON.parse(source.match(CONFIG)[1]);
    mutate(config);
    await writeFile(path.join(directory, 'service-worker-kalorii.js'),
      source.replace(CONFIG, 'const VISIT_UI_PRECACHE_PACK = Object.freeze(' + JSON.stringify(config) + ');'));
    await writeFile(path.join(directory, 'index.html'), '<!doctype html><p>Fictional server fixture</p>');
    const { child, origin } = await startServer(directory);
    const response = await fetch(origin + '/__test-service-worker-kalorii.js');
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('requires exactly the 32 versioned visit/home UI resources');
    const page = await fetch(origin + '/index.html');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Fictional server fixture');
    expect(child.exitCode).toBeNull();
  });
});
