import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

test.use({ serviceWorkers: 'allow' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pages = ['index.html', 'docpro.html', 'kalkulator-klirens.html', 'przelicznik-jednostek.html'];
const moduleNames = ['vilda_puberty_assessment.js', 'vilda_puberty_assessment_state.js', 'vilda_puberty_source.js'];

// Distinct observation dates and deliberately absent provenance must survive
// as recorded. The legacy number is intentionally different from typed G/P.
const typed = {
  version: 1, sex: 'M', observations: {
    G: { stage: 3, observedAtISO: '2026-04-14', ageMonths: 144, source: 'clinician-entry' },
    Th: null,
    P: { stage: 2, observedAtISO: null, ageMonths: 143.5, source: null },
  },
  sourceExtension: { fictional: true, values: [null, 'keep unchanged'] },
};
const empty = { version: 1, sex: 'M', observations: { G: null, Th: null, P: null } };
const future = {
  version: 7, sex: 'F', observations: { futureAxis: { category: 'unrecognized', date: null } },
  futureExtension: { values: [false, null, { preserve: 'Fikcyjne dane przyszłego formatu' }] },
};

function payload(assessment) {
  return {
    version: 1, name: 'Fikcyjny Pacjent Pokwitanie Offline',
    user: { age: 12, ageMonths: 0, sex: 'M', weight: 40, height: 150, tannerStage: '5', pubertyAssessment: assessment },
    advanced: { data: { measurements: [] } },
  };
}

function resourcesFor(documentName) {
  const html = fs.readFileSync(path.join(root, documentName), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(match => match[1]);
  return moduleNames.flatMap(name => {
    const resource = scripts.find(url => url.split('?')[0] === name);
    return resource ? [{ url: '/' + resource,
      sha256: createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex') }] : [];
  });
}

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
    child.once('exit', code => reject(new Error(`Static server exited before startup: ${code}`)));
  });
  return { origin, stop: () => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve);
    child.kill('SIGKILL');
  }) };
}

async function installProductionWorker(page, origin) {
  await page.goto(`${origin}/tests/fixtures/service-worker-runner.html`);
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
    const worker = registration.installing || registration.waiting || registration.active;
    const finished = () => ['activated', 'redundant'].includes(worker.state);
    if (!finished()) await new Promise(resolve => {
      worker.addEventListener('statechange', () => { if (finished()) resolve(); });
    });
    return worker.state;
  });
  expect(state, 'complete, unmodified production SW install').toBe('activated');
}

async function restoreAndCollect(page, raw) {
  return page.evaluate(record => {
    window.VildaDataImportExport.applyLoadedData(record, { isSessionRestore: true });
    const user = window.collectUserData().user;
    return {
      present: Object.prototype.hasOwnProperty.call(user, 'pubertyAssessment'),
      raw: user.pubertyAssessment,
      interpreted: window.VildaPubertyAssessment.readUser(user),
    };
  }, payload(raw));
}

async function assertOfflineResources(page, resources, loaded) {
  for (const resource of resources) {
    expect(loaded.get(resource.url), `${resource.url} is served by the production SW`).toBe(true);
    const hash = await page.evaluate(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Cannot read cached resource ${url}: ${response.status}`);
      const bytes = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }, resource.url);
    expect(hash, `offline bytes match the current source: ${resource.url}`).toBe(resource.sha256);
  }
}

// A full production precache, an isolated persistent browser profile, and an
// actually stopped origin. Each clinical document is opened for the first time
// after the browser restart: no HTTP/document memory can replace missing cache.
test('typed puberty contract survives production PWA install and cold offline restore on all consumers', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(180_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-puberty-offline-'));
  const server = await startServer();
  const expected = new Map(pages.map(name => [name, resourcesFor(name)]));
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL', timezoneId: 'Europe/Warsaw',
    viewport: { width: 1440, height: 1000 },
  });
  let context;
  try {
    context = await launch();
    const installer = context.pages()[0] || await context.newPage();
    await installProductionWorker(installer, server.origin);
    await context.close();
    context = null;
    await server.stop();

    context = await launch();
    await context.addInitScript(() => {
      localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    });
    const page = context.pages()[0] || await context.newPage();
    const noNetwork = () => page.evaluate(() => fetch(`/__puberty-offline-network-probe-${Date.now()}`).then(() => false, () => true));
    for (const documentName of pages) {
      const resources = expected.get(documentName);
      expect(resources.length, `${documentName}: expected modules wired`).toBe(documentName === 'przelicznik-jednostek.html' ? 2 : 3);
      const loaded = new Map();
      const responseListener = response => {
        const url = new URL(response.url());
        if (resources.some(resource => resource.url === url.pathname + url.search)) {
          loaded.set(url.pathname + url.search, response.fromServiceWorker());
        }
      };
      page.on('response', responseListener);
      await page.goto(`${server.origin}/${documentName}`, { waitUntil: 'load' });
      await page.waitForFunction(() => Boolean(window.VildaPubertyAssessment && window.VildaPubertySource));
      expect(await noNetwork(), `${documentName}: origin remains unavailable`).toBe(true);
      await assertOfflineResources(page, resources, loaded);

      if (documentName === 'przelicznik-jednostek.html') {
        const result = await page.evaluate(raw => ({
          hasCarrier: Boolean(window.VildaPubertyAssessmentState),
          read: window.VildaPubertyAssessment.readUser({ pubertyAssessment: raw, tannerStage: '5' }),
        }), typed);
        expect(result.hasCarrier, 'Lab only needs the read-only model and source provider').toBe(false);
        expect(result.read).toMatchObject({ status: 'ready', legacy: null, assessment: {
          observations: { G: typed.observations.G, Th: null, P: typed.observations.P },
        } });
      } else {
        await page.waitForFunction(() => Boolean(window.VildaPubertyAssessmentState && window.VildaDataImportExport)
          && typeof window.collectUserData === 'function');
        await czekajNaOdtworzenieSesji(page);
        for (const [raw, status] of [[typed, 'ready'], [empty, 'ready'], [future, 'unsupported']]) {
          const result = await restoreAndCollect(page, raw);
          expect(result.present, `${documentName}: collector preserves present schema`).toBe(true);
          expect(result.raw, `${documentName}: restore → actual collector preserves exact JSON`).toEqual(raw);
          expect(result.interpreted.status).toBe(status);
          expect(result.interpreted.legacy, 'present schema never falls back to generic Tanner').toBeNull();
          if (raw === empty) expect(result.interpreted.assessment.observations).toEqual({ G: null, Th: null, P: null });
        }
        if (documentName === 'index.html') {
          await expect.poll(() => page.evaluate(() => {
            window.saveMainSessionNow();
            return window.VildaPersistence.readMainSession()?.user?.pubertyAssessment;
          }), { message: 'production session writer persists the unknown future schema', timeout: 15_000 }).toEqual(future);
          await page.reload({ waitUntil: 'load' });
          await expect.poll(() => page.evaluate(() => typeof window.collectUserData === 'function'
            ? window.collectUserData().user?.pubertyAssessment : null),
          { message: 'offline reload restores exact future JSON into the real collector', timeout: 15_000 }).toEqual(future);
        }
      }
      page.off('response', responseListener);
    }
    expect(await noNetwork(), 'origin remains stopped after all roundtrips').toBe(true);
  } finally {
    if (context) await context.close();
    await server.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

// DOB restores an age-months field before the full session restore. An unnamed
// guest must still retain the opaque assessment when those partial fields make
// the existing form restore return early. Use a new profile: a previous name
// would conceal this regression.
test('anonymous girl with DOB retains exact puberty JSON after a cold offline start and F5', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(180_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-puberty-anonymous-offline-'));
  const server = await startServer();
  const resources = resourcesFor('index.html');
  const record = payload(future);
  record.name = '';
  record.user.sex = 'F';
  record.user.dobISO = '2014-04-14';
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL', timezoneId: 'Europe/Warsaw',
    viewport: { width: 1440, height: 1000 },
  });
  let context;
  try {
    context = await launch();
    await installProductionWorker(context.pages()[0] || await context.newPage(), server.origin);
    await context.close();
    context = null;
    await server.stop();

    context = await launch();
    await context.addInitScript(() => {
      localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    });
    const page = context.pages()[0] || await context.newPage();
    const loaded = new Map();
    page.on('response', response => {
      const url = new URL(response.url());
      if (resources.some(resource => resource.url === url.pathname + url.search)) {
        loaded.set(url.pathname + url.search, response.fromServiceWorker());
      }
    });
    await page.goto(`${server.origin}/index.html`, { waitUntil: 'load' });
    await czekajNaOdtworzenieSesji(page);
    await assertOfflineResources(page, resources, loaded);
    await expect(page.locator('#name'), 'a fresh profile has no inherited patient name').toHaveValue('');
    await page.evaluate(data => window.VildaDataImportExport.applyLoadedData(data, { isSessionRestore: true }), record);
    await expect(page.locator('#name')).toHaveValue('');
    await expect(page.locator('#sex')).toHaveValue('F');
    await expect(page.locator('#dobInput')).toHaveValue('14-04-2014');
    await expect.poll(() => page.evaluate(() => {
      window.saveMainSessionNow();
      const saved = window.VildaPersistence.readMainSession();
      return { name: saved?.name, sex: saved?.user?.sex, dobISO: saved?.user?.dobISO, raw: saved?.user?.pubertyAssessment };
    }), { message: 'actual session writer stores the unnamed girl and exact future JSON', timeout: 15_000 }).toEqual({
      name: '', sex: 'F', dobISO: '2014-04-14', raw: future,
    });

    await page.reload({ waitUntil: 'load' });
    expect(await page.evaluate(() => window.VildaPersistence.readMainSession()?.user?.pubertyAssessment),
      'raw session is intact immediately after offline F5').toEqual(future);
    await czekajNaOdtworzenieSesji(page);
    const restored = await page.evaluate(() => ({
      name: document.getElementById('name').value,
      sex: document.getElementById('sex').value,
      patientId: sessionStorage.getItem('vildaCurrentPatientId'),
      carrier: window.VildaPubertyAssessmentState.capture(),
      user: window.collectUserData().user,
    }));
    expect(restored.name, 'restoration does not require or invent a name').toBe('');
    expect(restored.sex).toBe('F');
    expect(restored.patientId, 'the fixture remains an anonymous guest').toBeNull();
    expect(restored.carrier.present).toBe(true);
    expect(restored.user.pubertyAssessment, 'completed restore returns the exact raw future JSON through the production collector').toEqual(future);
    expect(await page.evaluate(() => fetch(`/__anonymous-puberty-offline-${Date.now()}`).then(() => false, () => true)),
      'the origin remains unavailable throughout the guest roundtrip').toBe(true);
  } finally {
    if (context) await context.close();
    await server.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
