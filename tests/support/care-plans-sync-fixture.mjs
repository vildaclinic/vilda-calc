import { devices, expect } from '@playwright/test';
import { readyForPatient } from './centile-live-fixture.mjs';

// Fresh synthetic accounts only. Every request to the production worker URL is
// intercepted, including WebSocket; no request reaches an account or server.
const WORKER = 'https://vilda-sync.maciej-4b9.workers.dev';
const PASSWORD = 'Fikcyjny#CareSync2026!aA';
const CORS = {
  'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-expose-headers': 'ETag',
};

export function fictionalCareCloud() {
  const cloud = { blob: null, etag: 'care-E0', revision: 0, deltas: [], requests: [], pendingUploads: 0 };
  let gate = null, release = null;
  cloud.pauseUploads = () => { gate = new Promise(resolve => { release = resolve; }); };
  cloud.resumeUploads = () => { const done = release; gate = null; release = null; if (done) done(); };
  const upload = body => { cloud.blob = body; cloud.etag = 'care-E' + ++cloud.revision; };
  cloud.attach = async context => {
    await context.route(`${WORKER}/**`, async route => {
      const request = route.request(), method = request.method();
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const url = new URL(request.url()), endpoint = url.pathname.replace(/^\/v1\/slots\/[^/]+\/?/, '');
      const headers = request.headers();
      const item = { method, endpoint, kind: request.resourceType(), body: request.postData() };
      cloud.requests.push(item);
      const json = (status, body) => route.fulfill({ status,
        headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (endpoint === 'register' && method === 'POST') {
        if (cloud.blob) return json(409, {});
        upload(request.postDataBuffer()); return json(201, { etag: cloud.etag });
      }
      if (endpoint === 'status') return json(cloud.blob ? 200 : 404,
        { etag: cloud.etag, size: cloud.blob?.length || 0 });
      if (endpoint === 'blob' && method === 'GET') {
        if (!cloud.blob) return json(404, {});
        if (headers['if-none-match'] === `"${cloud.etag}"`) return route.fulfill({ status: 304, headers: CORS });
        return route.fulfill({ status: 200, headers: { ...CORS, etag: `"${cloud.etag}"`,
          'content-type': 'application/octet-stream' }, body: cloud.blob });
      }
      if (endpoint === 'blob' && method === 'PUT') {
        cloud.pendingUploads += 1;
        try {
          if (gate) await gate;
          if (headers['if-match'] && headers['if-match'] !== `"${cloud.etag}"`) return json(412, {});
          upload(request.postDataBuffer()); return json(200, { etag: cloud.etag });
        } finally { cloud.pendingUploads -= 1; }
      }
      if (endpoint === 'delta' && method === 'POST') {
        const body = JSON.parse(request.postData());
        cloud.deltas.push({ seq: cloud.deltas.length + 1, payload: body.payload });
        return route.fulfill({ status: 204, headers: CORS });
      }
      if (endpoint === 'changes' || endpoint === 'deltas') {
        const since = Number(url.searchParams.get('since') || 0);
        return json(200, { deltas: cloud.deltas.filter(delta => delta.seq > since), headSeq: cloud.deltas.length });
      }
      if (endpoint === 'entitlement') return json(200, { plan: 'free' });
      return json(404, {});
    });
    await context.routeWebSocket(/vilda-sync\.maciej-4b9\.workers\.dev/, ws => ws.close());
    await context.addInitScript(() => {
      localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      localStorage.setItem('analyticsConsent', 'denied');
      localStorage.setItem('pwzNumber', '0000000');
      // Startup/new-device dialogs are outside this scenario. Explicit pulls
      // below still execute the production synchronizer and merge guards.
      localStorage.setItem('vilda-sync-enabled-v1', 'false');
      sessionStorage.setItem('vilda-new-device-restore-shown-v1', '1');
      sessionStorage.setItem('vilda-probe-done-v1', '1');
      const pro = () => { if (window.VildaProAccess) {
        window.VildaProAccess.__setTokenModeForTest(false);
        window.VildaProAccess.setPlan('pro', '2099-12-31T23:59:59.000Z');
      } };
      document.addEventListener('DOMContentLoaded', pro, { once: true });
      document.addEventListener('vilda:session-changed', pro);
    });
  };
  return cloud;
}

async function openDevice(page, code) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaSync && window.VildaSyncIntegration));
  await page.evaluate(async ({ code, password }) => {
    if (code) await window.VildaVault.importSyncCode(code, password, { label: 'Fikcyjny telefon planów opieki' });
    else await window.VildaVault.createUser(password, { label: 'Fikcyjny komputer planów opieki', iterations: 10000 });
    sessionStorage.setItem('vilda-sync-pulled-v1', '1');
  }, { code, password: PASSWORD });
  // Like the shared synthetic-vault fixture, start a fresh document with the
  // persisted session. Creating an account during the initial guest UI boot
  // would leave its late welcome overlay above the unlocked application.
  await page.reload({ waitUntil: 'load' });
  await readyForPatient(page);
  await page.waitForFunction(() => Boolean(window.VildaCarePlans?.mount));
}

export async function careSyncPair({ page, context, browser, baseURL }) {
  const cloud = fictionalCareCloud();
  const mobileContext = await browser.newContext({ ...devices['iPhone 15 Pro'], baseURL,
    locale: 'pl-PL', timezoneId: 'Europe/Warsaw', serviceWorkers: 'block', reducedMotion: 'reduce' });
  try {
    await cloud.attach(context); await cloud.attach(mobileContext);
    await openDevice(page);
    const patientId = await page.evaluate(async () => (await window.VildaVault.savePatient({
      name: 'Fikcyjna Alicja Synchronizacja', user: { lastName: 'Fikcyjna', firstName: 'Alicja', sex: 'F', age: 12, height: 155, weight: 44 },
    }, { dedup: false })).patientId);
    await page.evaluate(() => window.VildaSync.syncPush());
    const code = await page.evaluate(password => window.VildaVault.exportSyncCode(password), PASSWORD);
    const phone = await mobileContext.newPage(); await openDevice(phone, code);
    const slots = await Promise.all([page, phone].map(device => device.evaluate(async () => (await window.VildaVault.getSyncMaterial()).slotId)));
    expect(slots[0]).toBe(slots[1]);
    await phone.evaluate(() => window.VildaSync.syncPull());
    // A sync-code import creates local credential metadata. The first shared
    // blob adopts the original account metadata and shows this native notice.
    // Acknowledge it exactly as the synthetic account owner would.
    const credentialNotice = phone.getByRole('button', { name: 'Rozumiem', exact: true });
    await expect(credentialNotice).toBeVisible();
    await credentialNotice.click();
    expect(await phone.evaluate(id => window.VildaVault.getPatient(id).then(Boolean), patientId)).toBe(true);
    return { desktop: page, phone, cloud, patientId, close: async () => { cloud.resumeUploads(); await mobileContext.close(); } };
  } catch (error) { cloud.resumeUploads(); await mobileContext.close(); throw error; }
}

export async function pullUntilPlan(page, id, check) {
  await expect.poll(async () => {
    await page.evaluate(() => window.VildaSync.syncPull());
    const plan = await page.evaluate(id => window.VildaVault.getCarePlan(id), id);
    return check(plan);
  }, { timeout: 15000, intervals: [100, 250, 500] }).toBe(true);
}

export async function watchCareBeacons(page, rejectLarge) {
  await page.evaluate(rejectLarge => {
    const send = navigator.sendBeacon.bind(navigator);
    window.__careSyncBeacons = [];
    navigator.sendBeacon = function (url, body) {
      if (!String(url).endsWith('/delta')) return send(url, body);
      const attempt = { size: body?.size || 0, rejected: !!(rejectLarge && body?.size > 65536), text: null };
      window.__careSyncBeacons.push(attempt);
      if (body?.text) body.text().then(text => { attempt.text = text; });
      return attempt.rejected ? false : send(url, body);
    };
  }, rejectLarge);
}
