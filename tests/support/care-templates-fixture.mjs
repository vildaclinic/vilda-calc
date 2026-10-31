import { devices, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fictionalPatient, readyForPatient, shellFrame } from './centile-live-fixture.mjs';
import { CARE_WORKSPACE, openCarePlans } from './care-plans-fixture.mjs';
import { fictionalTemplateCloud } from './care-templates-cloud-fixture.mjs';

const PASSWORD = 'Fikcyjny#TemplateLibrary2026!aA';
export const TEMPLATE_ROOT = '.vct-dialog .vct';
export const TEMPLATE_REVIEW = 'Sprawdziłem nazwy i usunąłem informacje dotyczące pacjenta';

// The caller imports test-czas for a running clock. Every profile and account
// below is fictional; every production worker HTTP/WebSocket is intercepted.
async function openDevice(page, { shell = false, code = null } = {}) {
  await page.goto(shell ? '/app.html#/start' : '/index.html', { waitUntil: 'load' });
  let frame = shell ? await shellFrame(page) : page;
  await frame.waitForFunction(() => Boolean(window.VildaVault && window.VildaSync));
  await frame.evaluate(async ({ code, password }) => {
    if (code) await window.VildaVault.importSyncCode(code, password, { label: 'Fikcyjny telefon biblioteki szablonów' });
    else await window.VildaVault.createUser(password, { label: 'Fikcyjne konto biblioteki szablonów', iterations: 10000 });
    sessionStorage.setItem('vilda-sync-pulled-v1', '1');
  }, { code, password: PASSWORD });
  await page.reload({ waitUntil: 'load' });
  frame = shell ? await shellFrame(page) : page;
  await readyForPatient(frame);
  await frame.waitForFunction(() => Boolean(window.VildaCarePlans?.ensureTemplateLibrary));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  return frame;
}

export async function templateFixture(page, { shell = false, syncEnabled = false, cloud = fictionalTemplateCloud() } = {}) {
  await cloud.attach(page.context());
  const frame = await openDevice(page, { shell });
  const records = { a: fictionalPatient(), b: fictionalPatient({ firstName: 'Beata', sex: 'F', age: 12, height: 150, weight: 41 }) };
  const ids = await frame.evaluate(async records => {
    const ids = {};
    for (const [key, record] of Object.entries(records)) ids[key] = (await window.VildaVault.savePatient(record, { dedup: false })).patientId;
    return ids;
  }, records);
  // Establish the ordinary fictional legacy identity through its real client.
  // Opening the protected library later still starts uninitialized and empty.
  await frame.evaluate(() => window.VildaSync.syncPush());
  await frame.evaluate(value => window.VildaSyncIntegration.setSyncEnabled(value), syncEnabled);
  return { frame, ids, records, cloud };
}

export async function templateSyncPair({ page, context, browser, baseURL }) {
  const cloud = fictionalTemplateCloud();
  const mobileContext = await browser.newContext({ ...devices['iPhone 15 Pro'], baseURL,
    locale: 'pl-PL', timezoneId: 'Europe/Warsaw', serviceWorkers: 'block', reducedMotion: 'reduce' });
  try {
    await cloud.attach(context); await cloud.attach(mobileContext);
    const desktop = await openDevice(page);
    const patientId = await desktop.evaluate(async record => (await window.VildaVault.savePatient(record, { dedup: false })).patientId, fictionalPatient());
    await desktop.evaluate(() => window.VildaSync.syncPush());
    const code = await desktop.evaluate(password => window.VildaVault.exportSyncCode(password), PASSWORD);
    const phone = await mobileContext.newPage(); await openDevice(phone, { code });
    await phone.evaluate(() => window.VildaSync.syncPull());
    const credentialNotice = phone.getByRole('button', { name: 'Rozumiem', exact: true });
    await expect(credentialNotice).toBeVisible(); await credentialNotice.click();
    expect(await phone.evaluate(id => window.VildaVault.getPatient(id).then(Boolean), patientId)).toBe(true);
    for (const device of [desktop, phone]) await device.evaluate(() => window.VildaSyncIntegration.setSyncEnabled(true));
    return { desktop, phone, cloud, patientId, close: async () => {
      cloud.releaseTemplateAppends(); cloud.releaseTemplateReads(); cloud.resumeUploads(); await mobileContext.close();
    } };
  } catch (error) {
    cloud.releaseTemplateAppends(); cloud.releaseTemplateReads(); cloud.resumeUploads(); await mobileContext.close(); throw error;
  }
}

export async function ensureTemplates(frame) {
  await frame.evaluate(() => window.VildaCarePlans.ensureTemplateLibrary({ ui: false }));
  await frame.waitForFunction(() => Boolean(window.VildaCareTemplateModel && window.VildaVault?.listCarePlanTemplates));
}

export async function openTemplates(page) {
  await openCarePlans(page);
  await page.locator(CARE_WORKSPACE).getByRole('button', { name: 'Moje szablony', exact: true }).click();
  const library = page.locator(TEMPLATE_ROOT);
  await expect(library).toBeVisible();
  return library;
}

export async function rawTemplateStorage(frame, { includeMeta = true } = {}) {
  return frame.evaluate(async includeMeta => {
    const token = await window.VildaVault.captureCareTemplateSession();
    const name = 'vilda_template_library_v1_' + token.keyBinding;
    if (!(await indexedDB.databases()).some(database => database.name === name)) return null;
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => { request.transaction.abort(); reject(Error('Template observer must not create a database')); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const names = [...database.objectStoreNames].filter(name => includeMeta || name !== 'meta').sort();
      const transaction = database.transaction(names, 'readonly');
      const rows = await Promise.all(names.map(name => new Promise((resolve, reject) => {
        const request = transaction.objectStore(name).getAll();
        request.onsuccess = () => resolve([name, request.result]); request.onerror = () => reject(request.error);
      })));
      return { name, version: database.version, stores: Object.fromEntries(rows) };
    } finally { database.close(); }
  }, includeMeta);
}

export const templateSyncState = frame => frame.evaluate(async () => {
  const token = await window.VildaVault.captureCareTemplateSession();
  return window.VildaVault.getCareTemplateSyncState(token);
});

export const syncTemplates = frame => frame.evaluate(() => window.VildaSync.syncTemplateLibrary());

export async function captureTemplateUI(page, name) {
  const directory = process.env.VILDA_TEMPLATE_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, name + '.png') });
  const metrics = await page.locator(TEMPLATE_ROOT).evaluate(root => {
    const win = root.ownerDocument.defaultView, areas = {};
    for (const selector of ['.vct-header', '.vct-breadcrumb', '.vct-wizard-steps', '.vct-scroll-pane', '.vct-editor-main', '.vct-footer']) {
      const element = root.querySelector(selector);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      areas[selector] = { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom,
        clientHeight: element.clientHeight, scrollHeight: element.scrollHeight };
    }
    const rectOf = rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height });
    const textGeometry = [...root.querySelectorAll('.vct-preview-step h4, .vct-preview-step .vcp-help')].map(element => {
      const range = element.ownerDocument.createRange(); range.selectNodeContents(element);
      const ancestors = [];
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = win.getComputedStyle(parent);
        ancestors.push({ tag: parent.tagName, className: parent.className, rect: rectOf(parent.getBoundingClientRect()),
          overflowX: style.overflowX, overflowY: style.overflowY, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom,
          borderTop: style.borderTopWidth, borderBottom: style.borderBottomWidth,
          scrollTop: parent.scrollTop, scrollHeight: parent.scrollHeight, clientHeight: parent.clientHeight });
        if (parent === root) break;
      }
      const style = win.getComputedStyle(element);
      return { tag: element.tagName, className: element.className, rect: rectOf(element.getBoundingClientRect()),
        fontSize: style.fontSize, lineHeight: style.lineHeight, textRects: [...range.getClientRects()].map(rectOf), ancestors };
    });
    return { viewport: { width: win.innerWidth, height: win.innerHeight }, areas, textGeometry };
  });
  await writeFile(path.join(directory, name + '.json'), JSON.stringify(metrics, null, 2) + '\n');
}

export async function pullTemplateUntil(frame, templateId, check) {
  await expect.poll(async () => {
    await syncTemplates(frame);
    return check(await getTemplate(frame, templateId));
  }, { timeout: 15000, intervals: [100, 250, 500] }).toBe(true);
}

export async function templateMutation(frame, action, templateId, extra = {}, supplied = null) {
  return frame.evaluate(async ({ action, templateId, extra, supplied }) => {
    const vault = window.VildaVault, current = await vault.getCarePlanTemplate(templateId);
    const request = supplied || { templateId, operationId: 'e2e-template-' + crypto.randomUUID(), baseToken: current?.baseToken || null, ...extra };
    const method = action === 'save' ? 'saveCarePlanTemplateRevision' : action === 'archive' ? 'setCarePlanTemplateArchived' : 'resolveCarePlanTemplateConflict';
    return { request, result: await vault[method](request) };
  }, { action, templateId, extra, supplied });
}

export const createSecondTemplateAccount = frame => frame.evaluate(password => window.VildaVault.createUser(password, {
  label: 'Drugie wyłącznie fikcyjne konto biblioteki', iterations: 10000,
}), PASSWORD);

export async function beginTemplate(library, name = 'Fikcyjny własny schemat lekarza') {
  await library.getByRole('button', { name: 'Nowy szablon', exact: true }).click();
  await library.getByLabel('Nazwa szablonu', { exact: true }).fill(name);
  await library.getByRole('button', { name: 'Dalej', exact: true }).click();
  await expect(library.getByLabel('Nazwa etapu', { exact: true })).toBeVisible();
}

export async function fillTemplateFirstStep(library, { stage = 'Fikcyjny etap', title = 'Fikcyjny równoległy krok',
  kind = 'examination', outcome = 'performance' } = {}) {
  await library.getByLabel('Nazwa etapu', { exact: true }).fill(stage);
  await library.getByLabel('Co jest do zrobienia?', { exact: true }).fill(title);
  await library.getByLabel('Rodzaj kroku', { exact: true }).selectOption(kind);
  await library.getByLabel('Co kończy ten krok?', { exact: true }).selectOption(outcome);
}

export const listTemplates = frame => frame.evaluate(() => window.VildaVault.listCarePlanTemplates({ archived: 'all' }));
export const getTemplate = (frame, templateId) => frame.evaluate(id => window.VildaVault.getCarePlanTemplate(id), templateId);
export const templateRevisions = (frame, templateId) => frame.evaluate(id => window.VildaVault.listCarePlanTemplateRevisions(id), templateId);
export const templateRow = (library, templateId) => library.locator(`.vct-template-row[data-template-id="${templateId}"]`);

export async function openTemplate(library, templateId) {
  await templateRow(library, templateId).getByRole('button', { name: 'Podgląd', exact: true }).click();
  await expect(library.getByRole('heading', { name: 'Podgląd szablonu', exact: true })).toBeVisible();
}

export async function previewTemplateDraft(library) {
  await library.getByRole('navigation', { name: 'Kroki kreatora szablonu', exact: true })
    .getByRole('button', { name: 'Podgląd', exact: true }).click();
  await expect(library.getByRole('button', { name: /^(Zapisz szablon|Zapisz nową wersję)$/ })).toBeVisible();
}

export async function saveSimpleTemplate(library, frame, name = 'Fikcyjny własny schemat lekarza') {
  await beginTemplate(library, name); await fillTemplateFirstStep(library);
  await previewTemplateDraft(library);
  await library.getByRole('button', { name: 'Zapisz szablon', exact: true }).click();
  await expect(library.locator('.vct-library-list')).toBeVisible();
  const item = (await listTemplates(frame)).find(item => item.title === name);
  expect(item, 'the real guarded library contains the saved fictional template').toBeTruthy();
  await expect(templateRow(library, item.templateId)).toBeVisible();
  return item;
}
