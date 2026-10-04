import { expect, test } from '../support/test-czas.mjs';
import { quickSelect as select, quickFill as fill, configureProfile } from '../support/lab-puberty-quick.mjs';

// LH/FSH A01: real source broker -> converter adapter -> form -> engine/snapshot.
// Only getPatient's asynchronous storage boundary is controlled. Every browser
// context creates its own fictional vault; no production account or patient is used.
test.use({ serviceWorkers: 'block' });
const A = 'fictional-lh-context-a';
const B = 'fictional-lh-context-b';

async function open(page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol)
      ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#LhContext!2026', { label: 'Fikcyjny sejf kontekstu LH', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaLabPubertyRuntime && window.VildaPubertySource
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await page.locator('#labSubstance').fill('LH');
  await page.locator('#labSubstanceDropdown [data-id="lh"]').click();
  await installBoundary(page);
}

async function installBoundary(page) {
  await page.evaluate(({ idA, idB }) => {
    const original = window.VildaVault.getPatient.bind(window.VildaVault);
    const pending = new Map();
    const records = {
      [idA]: { patientId: idA, snapshots: [{ payload: {
        user: { name: 'Fikcyjny kontekst A', sex: 'M', age: 6, ageMonths: 0, tannerStage: '1' },
        puberty: { gnrhaStatus: 'brak' },
      } }] },
      [idB]: { patientId: idB, snapshots: [{ payload: {
        user: { name: 'Fikcyjny kontekst B', sex: 'M', age: 14, ageMonths: 0, tannerStage: '4' },
        puberty: { gnrhaStatus: 'w-trakcie' },
      } }] },
    };
    const requests = [];
    window.VildaVault.getPatient = (id) => {
      if (!Object.hasOwn(records, id)) return original(id);
      requests.push(id);
      return new Promise((resolve, reject) => {
        if (!pending.has(id)) pending.set(id, []);
        pending.get(id).push({ resolve, reject });
      });
    };
    window.__lhContext = {
      records, requests,
      load(id) {
        window._vildaCurrentPatientId = id;
        sessionStorage.setItem('vildaCurrentPatientId', id);
        const user = records[id].snapshots[0].payload.user;
        if (!window.VildaPersistence.writeShared({ ...user }, { force: true })) throw new Error('Cannot seed fictional shared patient state');
        document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id } }));
      },
      refresh(id, userChanges, pubertyChanges) {
        const payload = records[id].snapshots[0].payload;
        Object.assign(payload.user, userChanges);
        Object.assign(payload.puberty, pubertyChanges);
        if (!window.VildaPersistence.writeShared({ ...payload.user }, { force: true })) throw new Error('Cannot update fictional shared patient state');
        document.dispatchEvent(new CustomEvent('vilda:sync-status-changed'));
      },
      complete(id, error = false) {
        const waiting = pending.get(id) || [];
        if (!waiting.length) throw new Error('No production source read is pending for ' + id);
        pending.set(id, []);
        waiting.forEach(({ resolve, reject }) => error ? reject(new Error('Fictional record unavailable')) : resolve(structuredClone(records[id])));
      },
    };
    window.VildaPubertySource.zapomnij();
  }, { idA: A, idB: B });
}

const load = (page, id) => page.evaluate((patientId) => window.__lhContext.load(patientId), id);
const source = (page, id) => page.evaluate((patientId) => window.VildaPubertySource.kontekstPacjenta(patientId), id);
const snapshot = (page) => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment({
  testKey: 'lh', raw: document.getElementById('labValue').value, unit: document.getElementById('labUnit').value,
}));

async function complete(page, id, error = false) {
  await page.evaluate(({ patientId, failed }) => window.__lhContext.complete(patientId, failed), { patientId: id, failed: error });
  // The real broker batches its public source signal on animation frames.
  await page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
}
async function ready(page, id = B) {
  await load(page, id);
  await complete(page, id);
  await expect.poll(() => source(page, id).then((context) => context.status)).toBe('ready');
}
async function sample(page) {
  await configureProfile(page);
  await page.locator('#labValue').fill('2');
}
async function restart(page) {
  await page.locator('#labClearBtn').click();
  await page.locator('#labSubstance').fill('LH');
  await page.locator('#labSubstanceDropdown [data-id="lh"]').click();
}
const contextSummary = (page) => page.locator('#labPubertyPatientContext');

test('B completing before A keeps only B in the source, automatic controls and recorded assessment', async ({ page }) => {
  await open(page);
  await load(page, A);
  await load(page, B);
  await expect(page.locator('#labPubertyContext')).toHaveValue('unknown');
  await complete(page, B);
  expect(await source(page, B)).toMatchObject({ patientId: B, status: 'ready', puberty: { gnrhaStatus: 'w-trakcie' } });
  await complete(page, A);
  expect(await source(page, B)).toMatchObject({ patientId: B, status: 'ready', puberty: { gnrhaStatus: 'w-trakcie' } });
  expect((await source(page, A)).status).toBe('unavailable');
  await expect(contextSummary(page)).toContainText(/GnRHa.*w trakcie/);
  await expect(contextSummary(page)).not.toContainText('brak GnRHa');
  await expect(page.locator('#labPubertyContext')).toHaveValue('hormonal');
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('14');
  await expect(page.locator('#labPubertyStage')).toHaveValue('4');
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
  await select(page, 'Kind', 'G');
  await sample(page);
  const saved = await snapshot(page);
  expect(saved.status).toBe('recorded');
  expect(saved.evaluation.input.treatment).toMatchObject({ context: 'hormonal', gnrha: 'yes', sexSteroids: 'unknown' });
  expect(saved.evaluation.ageAtSample.lowerYears).toBe(14);
  expect(saved.evaluation.biochemical.primary).toBeNull();
  expect(saved.evaluation.biochemical.reasonCodes).toContain('treatment_requires_separate_profile');
  expect(saved.evaluation.clinical.code).toBe('treatment_context');
});

test('loading and rejected reads suspend automatic data without blocking explicit sample entry', async ({ page }) => {
  await open(page);
  await ready(page, A);
  // No GnRHa in the record is not a statement about all hormone treatment.
  await expect(page.locator('#labPubertyContext')).toHaveValue('unknown');
  await load(page, B);
  await expect(page.locator('#labPubertyContext')).toHaveValue('unknown');
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('');
  await fill(page, 'AgeYears', '9');
  await select(page, 'Kind', 'G');
  await select(page, 'Stage', '3');
  await select(page, 'Context', 'basal-untreated');
  await sample(page);
  await complete(page, B, true);
  expect(await source(page, B)).toMatchObject({ patientId: B, status: 'unavailable' });
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('9');
  await expect(page.locator('#labPubertyStage')).toHaveValue('3');
  await expect(page.locator('#labPubertyContext')).toHaveValue('basal-untreated');
  await expect(page.locator('#labValue')).toHaveValue('2');
  const saved = await snapshot(page);
  expect(saved.status).toBe('recorded');
  expect(saved.evaluation.input.age.years).toBe(9);
  expect(saved.evaluation.input.puberty).toMatchObject({ kind: 'G', stage: 3 });
  expect(saved.evaluation.input.treatment.gnrha).toBe('no');
});

test('logout and session reset cannot be reversed by a late patient response', async ({ page }) => {
  await open(page);
  await load(page, A);
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('');
  await page.evaluate(() => {
    window.VildaVault.lock('sync');
    window._vildaCurrentPatientId = null;
    sessionStorage.removeItem('vildaCurrentPatientId');
    window.dispatchEvent(new CustomEvent('vilda:user-state-cleared'));
  });
  await complete(page, A);
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  expect((await source(page, A)).status).toBe('unavailable');
  expect(await page.evaluate(() => window.VildaPubertySource.biezace())).toBeNull();
  await expect(page.locator('#labPubertyContext')).toHaveValue('unknown');
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('');
  await expect(page.locator('#labPubertyStage')).toHaveValue('');
  await expect(page.locator('#labValue')).toHaveValue('');
  await expect(contextSummary(page)).not.toContainText('brak GnRHa');
});

test('a current-patient update suspends copied context and automatically applies the completed current record', async ({ page }) => {
  await open(page);
  await ready(page);
  await sample(page);
  await expect(page.locator('#labPubertyContext')).toHaveValue('hormonal');
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('14');
  await expect(page.locator('#labPubertyStage')).toHaveValue('4');
  await page.evaluate((id) => window.__lhContext.refresh(id, { age: 15, tannerStage: '5' }, { gnrhaStatus: 'brak' }), B);
  await expect(page.locator('#labPubertyContext')).toHaveValue('unknown');
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('');
  await expect(page.locator('#labPubertyStage')).toHaveValue('');
  const pending = await snapshot(page);
  expect(pending.evaluation.input.treatment.gnrha).toBe('unknown');
  expect(pending.evaluation.input.puberty.stage).toBeNull();
  expect(pending.evaluation.ageAtSample.status).toBe('unknown');
  await complete(page, B);
  await expect(page.locator('#labPubertyContext')).toHaveValue('unknown');
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('15');
  await expect(page.locator('#labPubertyStage')).toHaveValue('5');
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
  // The result and configured assay remain independently owned by the form/device.
  await expect(page.locator('#labValue')).toHaveValue('2');
  await expect(page.locator('#labPubertyMethodSummary')).toContainText('AnshLite');
  const reviewed = await snapshot(page);
  expect(reviewed.status).toBe('recorded');
  expect(reviewed.evaluation.input.treatment.gnrha).toBe('no');
  expect(reviewed.evaluation.input.treatment.sexSteroids).toBe('unknown');
  expect(reviewed.evaluation.input.age.years).toBe(15);
  expect(reviewed.evaluation.input.puberty).toMatchObject({ kind: 'unspecified', stage: 5 });
});

test('manual sample overrides survive a source refresh and reset returns to the current card', async ({ page }) => {
  await open(page);
  await ready(page);
  await fill(page, 'AgeYears', '9');
  await select(page, 'Kind', 'G');
  await select(page, 'Stage', '3');
  await select(page, 'Context', 'basal-untreated');
  await sample(page);
  await page.evaluate((id) => window.__lhContext.refresh(id, { age: 15, tannerStage: '5' }, { gnrhaStatus: 'w-trakcie' }), B);
  await complete(page, B);
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('9');
  await expect(page.locator('#labPubertyKind')).toHaveValue('G');
  await expect(page.locator('#labPubertyStage')).toHaveValue('3');
  await expect(page.locator('#labPubertyContext')).toHaveValue('basal-untreated');
  const manual = await snapshot(page);
  expect(manual.evaluation.input.age.years).toBe(9);
  expect(manual.evaluation.input.puberty).toMatchObject({ kind: 'G', stage: 3 });
  expect(manual.evaluation.input.treatment.gnrha).toBe('no');
  await restart(page);
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('15');
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
  await expect(page.locator('#labPubertyStage')).toHaveValue('5');
  await expect(page.locator('#labPubertyContext')).toHaveValue('hormonal');
  await page.locator('#labValue').fill('2');
  const imported = await snapshot(page);
  expect(imported.evaluation.input.age.years).toBe(15);
  expect(imported.evaluation.input.treatment.gnrha).toBe('yes');
  expect(imported.evaluation.biochemical.primary).toBeNull();
});

test('the app frame uses current session identity B when its old window global still names A', async ({ page }) => {
  await open(page);
  await page.goto('/app.html#/lab', { waitUntil: 'load' });
  const iframe = page.locator('iframe.app-pane[title="Jednostki laboratoryjne"]');
  await expect(iframe).toBeVisible();
  const frame = await (await iframe.elementHandle()).contentFrame();
  await frame.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaLabPubertyRuntime && window.VildaPubertySource
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await frame.locator('#labSubstance').fill('LH');
  await frame.locator('#labSubstanceDropdown [data-id="lh"]').click();
  await installBoundary(frame);
  await load(frame, A);
  await complete(frame, A);
  await load(frame, B);
  await frame.evaluate((id) => { window._vildaCurrentPatientId = id; }, A);
  await complete(frame, B);
  expect(await frame.evaluate(() => ({ globalId: window._vildaCurrentPatientId, sessionId: sessionStorage.getItem('vildaCurrentPatientId') })))
    .toEqual({ globalId: A, sessionId: B });
  await expect(frame.locator('#labPubertyContext')).toHaveValue('hormonal');
  await expect(frame.locator('#labPubertyAgeYears')).toHaveValue('14');
  await sample(frame);
  const saved = await snapshot(frame);
  expect(saved.status).toBe('recorded');
  expect(saved.evaluation.input.treatment.gnrha).toBe('yes');
  expect(saved.evaluation.input.age.years).toBe(14);
  expect(saved.evaluation.biochemical.primary).toBeNull();
});

test('an unchanged refresh suspends imported data and restores the current sample after the read', async ({ page }) => {
  await open(page);
  await ready(page);
  await select(page, 'Kind', 'G');
  await sample(page);
  const before = await snapshot(page);
  await page.evaluate((id) => window.__lhContext.refresh(id, {}, {}), B);
  await expect(page.locator('#labPubertyContext')).toHaveValue('unknown');
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('');
  const pending = await snapshot(page);
  expect(pending.evaluation.input.treatment.gnrha).toBe('unknown');
  expect(pending.evaluation.biochemical.primary).toBeNull();
  await complete(page, B);
  await expect(page.locator('#labPubertyContext')).toHaveValue('hormonal');
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('14');
  await expect(page.locator('#labPubertyStage')).toHaveValue('4');
  await expect(page.locator('#labPubertyMethodSummary')).toContainText('AnshLite');
  expect((await snapshot(page)).evaluation.input).toEqual(before.evaluation.input);
});

test('manual corrections during an unchanged refresh survive without replacing the configured assay', async ({ page }) => {
  await open(page);
  await ready(page);
  await sample(page);
  await page.evaluate((id) => window.__lhContext.refresh(id, {}, {}), B);
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('');
  await select(page, 'Context', 'basal-untreated');
  await fill(page, 'AgeYears', '9');
  await complete(page, B);
  await expect(page.locator('#labPubertyContext')).toHaveValue('basal-untreated');
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('9');
  await expect(page.locator('#labPubertyStage')).toHaveValue('4');
  await expect(page.locator('#labPubertyMethodSummary')).toContainText('AnshLite');
  const corrected = await snapshot(page);
  expect(corrected.evaluation.input.treatment.gnrha).toBe('no');
  expect(corrected.evaluation.input.age.years).toBe(9);
  // Unspecified legacy Tanner remains ineligible even after choosing a method.
  expect(corrected.evaluation.biochemical.byStage.status).toBe('unavailable');
  await restart(page);
  await expect(page.locator('#labPubertyContext')).toHaveValue('hormonal');
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('14');
  await expect(page.locator('#labPubertyMethodSummary')).toContainText('AnshLite');
});
