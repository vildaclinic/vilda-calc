import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function ownServer() {
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

test('shared Lab edit, shell reload and normal Start save work with the production SW and stopped origin', async ({ browser }) => {
  test.setTimeout(180_000);
  const server = await ownServer();
  const context = await browser.newContext({ baseURL: server.origin, serviceWorkers: 'allow', reducedMotion: 'reduce',
    locale: 'pl-PL', timezoneId: 'Europe/Warsaw', viewport: { width: 1440, height: 1000 } });
  try {
    const page = await context.newPage();
    await page.goto('/tests/fixtures/service-worker-runner.html');
    expect(await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
        worker.addEventListener('statechange', () => { if (['activated', 'redundant'].includes(worker.state)) resolve(); });
      });
      return worker.state;
    })).toBe('activated');
    const { frame: start, ids } = await createFictionalVault(page, { shell: true, waitForAccountReadyBeforeReload: true });
    await loadPatient(start, ids.a, 'restore');
    await start.locator('#tannerToggleBtn').click();
    await start.locator('#pubertyAssessmentEditor .vpa-segments [data-puberty-axis="G"][data-puberty-stage="3"]').click();
    await start.locator('#pubertyAssessmentEditor .vpa-segments [data-puberty-axis="P"][data-puberty-stage="1"]').click();
    const badge = page.locator('aside.sidebar-v2 [data-menu-save-status]');
    const save = page.locator('aside.sidebar-v2 #saveDataBtnSidebar');
    await save.click();
    await expect(badge).toHaveAttribute('data-save-state', 'saved');
    const before = await start.evaluate(async id => (await window.VildaVault.getPatient(id)).snapshots, ids.a);
    await server.stop();
    await context.setOffline(true);
    expect(await fetch(server.origin + '/__shared-puberty-no-network', { signal: AbortSignal.timeout(3000) }).then(() => false, () => true)).toBe(true);
    await page.locator('aside.sidebar-v2 a[href="przelicznik-jednostek.html"]').click();
    const lab = await shellFrame(page, 'Jednostki laboratoryjne');
    await lab.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaAuthUI?.isBootReady());
    await lab.locator('#labSubstance').fill('LH');
    await lab.locator('#labSubstanceDropdown [data-id="lh"]').click();
    await lab.locator('#labValue').fill('2');
    await lab.locator('#labPubertyRefineStage').click();
    await expect(lab.locator('#labPubertyStageHint')).toContainText('Wspólna ocena tej wizyty');
    await lab.locator('#labPubertySharedEditor .vpa-segments [data-puberty-axis="P"][data-puberty-stage="2"]').click();
    await expect(badge).toHaveAttribute('data-save-state', 'dirty');
    await page.reload({ waitUntil: 'load' });
    await shellFrame(page, 'Jednostki laboratoryjne');
    await expect(badge).toHaveAttribute('data-save-state', 'dirty');
    await page.locator('aside.sidebar-v2 a[href="index.html"]').click();
    const restored = await shellFrame(page);
    await expect.poll(() => restored.evaluate(() => window.VildaPubertyAssessmentState.read().assessment?.observations?.P?.stage)).toBe(2);
    expect(await restored.evaluate(async id => (await window.VildaVault.getPatient(id)).snapshots, ids.a)).toEqual(before);
    await save.click();
    await expect(badge).toHaveAttribute('data-save-state', 'saved');
    const after = await restored.evaluate(async id => (await window.VildaVault.getPatient(id)).snapshots, ids.a);
    expect(after).toHaveLength(before.length + 1);
    expect(after[0].payload.user.pubertyAssessment.observations.P.stage).toBe(2);
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    for (const name of ['vilda_puberty_assessment_state.js', 'vilda_puberty_assessment_context.js']) {
      const expected = createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
      const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
      const resource = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)]
        .map(match => match[1]).find(url => url.split('?')[0] === name);
      expect(resource, name + ' is loaded by the clinical page').toBeTruthy();
      const actual = await page.evaluate(async resource => {
        const response = await fetch('/' + resource);
        if (!response.ok) throw new Error('Missing cached resource: ' + resource);
        const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      }, resource);
      expect(actual, name + ' offline bytes equal current production source').toBe(expected);
    }
  } finally {
    await context.close();
    await server.stop();
  }
});
