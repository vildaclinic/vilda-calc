import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { openGlobalSearch, queryGlobal, resultFor } from '../support/global-search-fixture.mjs';
import { GH_DOSE, GH_RAW_DOSE, presentationFingerprint, searchPresentationFixture } from '../support/search-presentation-fixture.mjs';

test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// The exact production worker and complete precache are installed on an
// isolated origin. The origin is stopped before the entire browser restarts.
// This is the established native-reminders cold-offline test's server path.
async function startServer() {
  const child = spawn(process.execPath, [path.join(root, 'tests/support/static-server.mjs')], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const origin = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Search presentation offline server exited: ${code}`)));
  });
  return { origin, stop: () => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve); child.kill('SIGKILL');
  }) };
}

function currentResources() {
  const sources = ['index.html', 'vilda_auth_ui.js', 'clcr_record_resources.js'].map(name => fs.readFileSync(path.join(root, name), 'utf8'));
  const loaded = sources.flatMap(source => [...source.matchAll(/["']([^"'\s]+\.(?:js|css)\?v=\d+)["']/g)].map(match => match[1]));
  return ['vilda_global_search.js', 'vilda_global_search_view.js', 'vilda_auth_ui.js', 'clcr_record_resources.js',
    'clcr_notes_view.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_ca_dzm_persistence.js'].map(name => {
    const url = loaded.find(value => value.split('?')[0] === name);
    if (!url) throw new Error(`Missing versioned production resource: ${name}`);
    return { url: '/' + url, sha256: sha256(fs.readFileSync(path.join(root, name))) };
  });
}

async function expectClinicalEnginesUnloaded(page) {
  expect(await page.evaluate(() => [window.VildaClcrCaDzm, window.ClcrCaDzmReferenceData,
    window.VildaClcrAcr, window.VildaClcrAcrReferenceData].every(value => value === undefined))).toBe(true);
}

test('Search formats saved rhGH, Ca and ACR on a cold offline mobile start with the exact production worker and lazy reader', async ({ playwright, browserName, launchOptions }, testInfo) => {
  test.setTimeout(240000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-search-presentation-offline-'));
  const server = await startServer();
  const resources = currentResources();
  const launch = offline => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, serviceWorkers: 'allow', offline, baseURL: server.origin,
    locale: 'pl-PL', timezoneId: 'Europe/Warsaw', viewport: { width: 390, height: 1000 }, reducedMotion: 'reduce',
  });
  let context;
  try {
    context = await launch(false);
    const installer = context.pages()[0] || await context.newPage();
    await installer.goto('/tests/fixtures/service-worker-runner.html');
    const installed = await installer.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
        worker.addEventListener('statechange', () => { if (['activated', 'redundant'].includes(worker.state)) resolve(); });
      });
      return worker.state;
    });
    expect(installed).toBe('activated');
    await context.close(); context = null;
    await server.stop();

    context = await launch(true);
    const page = context.pages()[0] || await context.newPage();
    const served = new Map(), failed = [], errors = [];
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === server.origin) served.set(url.pathname + url.search, response.fromServiceWorker());
    });
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin === server.origin && !url.pathname.startsWith('/__search-presentation-offline-probe-')) failed.push(request.url());
    });
    page.on('pageerror', error => errors.push(error.message));
    const created = await searchPresentationFixture(page);
    expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
    expect(await page.evaluate(() => fetch('/__search-presentation-offline-probe-' + Date.now()).then(() => false, () => true))).toBe(true);
    expect(await page.evaluate(() => Boolean(window.ClcrNotesView))).toBe(false);
    await expectClinicalEnginesUnloaded(page);
    const before = await presentationFingerprint(page, created);
    const search = await openGlobalSearch(page);
    for (const key of ['gh', 'calcium', 'acr', 'corrupted']) {
      await queryGlobal(search, 'Fikcyjny audyt');
      await resultFor(search, 'note', created.presentationNotes[key]).click();
      const body = search.locator('.vgs-detail .vb22-body');
      await expect(body).toBeVisible();
      const text = await body.textContent();
      if (key === 'gh') {
        expect(text).toContain(GH_DOSE);
        expect(text.match(/Dawka:/g)).toHaveLength(1);
        expect(text).not.toContain(String(GH_RAW_DOSE));
      } else {
        const model = await page.evaluate(async id => window.ClcrNotesView.model(await window.VildaVault.getPatientNote(id)), created.presentationNotes[key]);
        expect(text).toContain(`Wynik: ${model.display} ${model.unit}`);
        for (const field of ['norm', 'status', 'interpretation', 'comment']) if (model[field]) expect(text, field).toContain(model[field]);
        for (const technical of ['Kalkulator klirensu', 'VILDA_CLCR', 'exactMain', 'engineVersion', 'numerator', '[dane]']) expect(text).not.toContain(technical);
        if (key === 'calcium') expect(model).toMatchObject({ display: '2,77', unit: 'mg/kg/24 h', norm: '<4 mg/kg/24 h', status: 'W zakresie' });
        if (key === 'acr') expect(model).toMatchObject({ category: 'A2', outOfRange: true, norm: '<30 mg/g' });
        if (key === 'corrupted') expect(model).toMatchObject({ norm: '', status: 'Bez zapisanej oceny', outOfRange: null });
      }
      await search.getByRole('button', { name: '← Wyniki wyszukiwania', exact: true }).click();
    }
    expect(await presentationFingerprint(page, created)).toEqual(before);
    await expectClinicalEnginesUnloaded(page);
    expect(await search.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const resource of resources) {
      expect(served.get(resource.url), `${resource.url} executed from the real production worker on a cold start`).toBe(true);
      const actual = await page.evaluate(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Missing offline resource: ${url}`);
        const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      }, resource.url);
      expect(actual, `${resource.url}: cold offline bytes match the reviewed source`).toBe(resource.sha256);
    }
    expect(failed).toEqual([]);
    expect(errors).toEqual([]);
    await testInfo.attach('search-presentation-cold-offline-proof', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      worker: 'unmodified-production-service-worker-kalorii.js', coldBrowserRestarts: 1, originStopped: true,
      clinicalEnginesLoaded: false, resources, failedApplicationRequests: failed, pageErrors: errors,
    }, null, 2)) });
  } finally {
    if (context) await context.close().catch(() => {});
    await server.stop(); fs.rmSync(profile, { recursive: true, force: true });
  }
});
