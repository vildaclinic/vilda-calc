import { devices, expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fictionalPatient, fixturePreferences, readyForPatient } from '../support/centile-live-fixture.mjs';
import { CARE_WORKSPACE } from '../support/care-plans-fixture.mjs';
import { rawCareStorage } from '../support/care-plans-model-fixture.mjs';
import { getTemplate, listTemplates, openTemplate, openTemplates, previewTemplateDraft,
  rawTemplateStorage, templateRevisions, templateRow } from '../support/care-templates-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);

const PASSWORD = 'Fictional#SingleTemplateSharing2026!aA';
const TITLE = 'Fikcyjny przenośny schemat dokumentacji';
const AUTHOR = 'Fikcyjna autorka opracowania';
const ADAPTER = 'Fikcyjny autor zmian';
const SOURCE = 'Fikcyjne źródło przykładu technicznego';
const SOURCE_URL = 'https://example.org/fictional-template-source';
const INSTRUCTION = 'Fikcyjna instrukcja: <img data-fictional-injection src="x" onerror="window.__fictionalPortableInjection=1">';
const RIGHTS = 'Mam prawo udostępnić ten szablon na wskazanych zasadach';
const PRIVACY = 'Sprawdziłem treść szablonu i nie zawiera ona danych pacjentów';
const IMPORT_REVIEW = 'Zapoznałem się z autorstwem i zasadami udostępniania';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PHONE = devices['iPhone 15 Pro'];

async function ownServer() {
  const child = spawn(process.execPath, [path.join(ROOT, 'tests/support/static-server.mjs')], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const origin = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /http:\/\/127\.0\.0\.1:(\d+)/u.exec(output);
      if (match) resolve('http://127.0.0.1:' + match[1]);
    });
    child.once('error', reject);
    child.once('exit', code => reject(Error('Single-template offline server exited: ' + code)));
  });
  return { origin, stop: () => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve); child.kill('SIGKILL');
  }) };
}

async function account(page, label) {
  await fixturePreferences(page);
  await page.route('https://vilda-sync.maciej-4b9.workers.dev/**', route => route.abort());
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
  await page.evaluate(async ({ password, label }) => {
    await window.VildaVault.createUser(password, { label, iterations: 10000, deferServerContact: true });
  }, { password: PASSWORD, label });
  await page.reload({ waitUntil: 'load' });
  await readyForPatient(page);
  await page.evaluate(() => window.VildaSyncIntegration.setSyncEnabled(false));
  const patientId = await page.evaluate(async payload => {
    await window.VildaCarePlans.ensureTemplateLibrary({ ui: false });
    return (await window.VildaVault.savePatient(payload, { dedup: false })).patientId;
  }, fictionalPatient());
  const binding = await page.evaluate(async () => (await window.VildaVault.captureCareTemplateSession()).keyBinding);
  return { patientId, binding };
}

async function sourceTemplate(page) {
  return page.evaluate(async ({ title, instruction }) => {
    const model = window.VildaCareTemplateModel;
    const definition = model.createDefinitionDraft({ stageId: 'fictional-shared-source-stage', stepId: 'fictional-shared-source-step' }).definition;
    definition.name = title;
    definition.purpose = 'Fikcyjny schemat, bez danych klinicznych i danych osoby.';
    definition.stages[0].title = 'Fikcyjny etap dokumentacji';
    definition.steps[0].title = 'Fikcyjne sprawdzenie kompletu dokumentów';
    definition.steps[0].instruction = instruction;
    definition.steps[0].requiredOutcome = 'decision';
    definition.steps[0].reminderRule = { kind: 'none' };
    const templateId = crypto.randomUUID();
    const saved = await window.VildaVault.saveCarePlanTemplateRevision({
      templateId, operationId: crypto.randomUUID(), baseToken: null, definition,
    });
    if (!saved.saved) throw Error('Fictional source template not saved');
    return templateId;
  }, { title: TITLE, instruction: INSTRUCTION });
}

async function chooseFile(page, library, text, name = 'fikcyjny-schemat.vilda-template.json') {
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    library.getByRole('button', { name: 'Importuj szablon', exact: true }).click(),
  ]);
  await picker.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
}

async function downloadSelected(page, library) {
  await library.getByLabel(RIGHTS, { exact: true }).check();
  await library.getByLabel(PRIVACY, { exact: true }).check();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    library.getByRole('button', { name: 'Pobierz szablon', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.vilda-template\.json$/u);
  const text = await readFile(await download.path(), 'utf8');
  return { text, envelope: JSON.parse(text) };
}

async function firstExport(page, library, templateId) {
  await templateRow(library, templateId).getByRole('button', { name: 'Eksportuj szablon: ' + TITLE, exact: true }).click();
  await expect(library.getByRole('heading', { name: 'Eksport szablonu', exact: true })).toBeVisible();
  await library.getByLabel('Autor opracowania', { exact: true }).fill(AUTHOR);
  await library.getByLabel('Wersja opracowania', { exact: true }).fill('1.0');
  await library.getByLabel('Zasady udostępniania', { exact: true }).selectOption('CC-BY-4.0');
  await library.getByLabel('Źródło medyczne (opcjonalnie)', { exact: true }).fill(SOURCE);
  await library.getByLabel('Adres źródła (opcjonalnie)', { exact: true }).fill(SOURCE_URL);
  await library.getByLabel('Wersja źródła (opcjonalnie)', { exact: true }).fill('Fikcyjna wersja 1');
  await library.getByLabel(RIGHTS, { exact: true }).check();
  await library.getByLabel(PRIVACY, { exact: true }).check();
  await library.getByRole('button', { name: 'Zapisz informacje o szablonie', exact: true }).click();
  await expect(library.getByRole('button', { name: 'Pobierz szablon', exact: true })).toBeVisible();
  return downloadSelected(page, library);
}

async function assertPreview(library) {
  await expect(library.getByRole('heading', { name: 'Import szablonu', exact: true })).toBeVisible();
  await expect(library).toContainText(AUTHOR);
  await expect(library).toContainText(SOURCE);
  await expect(library).toContainText('CC BY');
  await expect(library).toContainText('Fikcyjne sprawdzenie kompletu dokumentów');
  await expect(library).toContainText(INSTRUCTION);
  await expect(library.locator('[data-fictional-injection]')).toHaveCount(0);
}

test('a single template crosses independent accounts, retains attribution through patient-plan use and reload, and re-exports an attributed adaptation', async ({ page, browser, baseURL }, testInfo) => {
  const a = await account(page, 'Fikcyjne konto autorki szablonu');
  const templateId = await sourceTemplate(page);
  const clinicalBefore = await rawCareStorage(page);
  const libraryA = await openTemplates(page);
  await expect(libraryA.getByRole('button', { name: 'Eksportuj bibliotekę', exact: true })).toHaveCount(0);
  await expect(libraryA.getByRole('button', { name: 'Importuj bibliotekę', exact: true })).toHaveCount(0);
  const exported = await firstExport(page, libraryA, templateId);
  expect(Object.keys(exported.envelope).sort()).toEqual(['contentDigest', 'definition', 'format']);
  expect(exported.envelope.format).toBe('vilda-care-template/v1');
  expect(exported.envelope.definition.contentVersion).toBe(2);
  expect(exported.envelope.definition.publication).toMatchObject({ authors: [AUTHOR], version: '1.0',
    sources: [{ title: SOURCE, url: SOURCE_URL, version: 'Fikcyjna wersja 1' }],
    license: { id: 'CC-BY-4.0', allowRedistribution: true, allowAdaptation: true } });
  for (const privateValue of [a.patientId, a.binding, templateId, PASSWORD, 'fictional-shared-source-stage', 'fictional-shared-source-step']) expect(exported.text).not.toContain(privateValue);
  expect(await rawCareStorage(page)).toEqual(clinicalBefore);
  expect((await getTemplate(page, templateId)).definition.publication).toEqual(exported.envelope.definition.publication);

  const other = await browser.newContext({ baseURL, locale: 'pl-PL', timezoneId: 'Europe/Warsaw',
    serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
  try {
    const recipient = await other.newPage();
    const b = await account(recipient, 'Fikcyjne niezależne konto odbiorcy');
    expect(b.binding).not.toBe(a.binding);
    const libraryB = await openTemplates(recipient);
    const beforePreview = await rawTemplateStorage(recipient, { includeMeta: false });
    const beforeImport = await rawCareStorage(recipient);
    await chooseFile(recipient, libraryB, exported.text);
    await assertPreview(libraryB);
    await recipient.screenshot({ path: testInfo.outputPath('single-template-import-desktop.png') });
    expect(await rawTemplateStorage(recipient, { includeMeta: false })).toEqual(beforePreview);
    await libraryB.getByRole('button', { name: 'Anuluj', exact: true }).click();
    expect(await listTemplates(recipient)).toEqual([]);
    expect(await rawTemplateStorage(recipient, { includeMeta: false })).toEqual(beforePreview);
    await chooseFile(recipient, libraryB, exported.text);
    await assertPreview(libraryB);
    await libraryB.getByLabel(IMPORT_REVIEW, { exact: true }).check();
    await libraryB.getByRole('button', { name: 'Zapisz jako nowy szablon', exact: true }).click();
    await expect(libraryB.locator('.vct-library-list')).toBeVisible();
    const importedRows = await listTemplates(recipient);
    expect(importedRows).toHaveLength(1);
    const importedId = importedRows[0].templateId;
    expect(importedId).not.toBe(templateId);
    const imported = await getTemplate(recipient, importedId);
    expect(imported.definition.publication).toMatchObject({ authors: [AUTHOR],
      origin: { id: exported.envelope.definition.publication.id, contentDigest: exported.envelope.contentDigest,
        authors: [AUTHOR], license: exported.envelope.definition.publication.license } });
    const oldIds = new Set([...exported.envelope.definition.stageOrder, ...exported.envelope.definition.steps.map(step => step.id)]);
    expect([...imported.definition.stageOrder, ...imported.definition.steps.map(step => step.id)].some(id => oldIds.has(id))).toBe(false);
    expect(await rawCareStorage(recipient)).toEqual(beforeImport);

    // Applying the actual imported V2 definition exercises the native clinical
    // codec, transaction and reload; a model-only round trip would miss these.
    await templateRow(libraryB, importedId).getByRole('button', { name: 'Użyj u pacjenta: ' + TITLE, exact: true }).click();
    await libraryB.locator('[data-patient-id="' + b.patientId + '"]').click();
    await libraryB.getByRole('button', { name: 'Dalej', exact: true }).click();
    await libraryB.getByRole('button', { name: 'Utwórz plan', exact: true }).click();
    await expect(libraryB).toHaveCount(0);
    const plans = await recipient.evaluate(id => window.VildaVault.listCarePlans({ patientId: id }), b.patientId);
    expect(plans).toHaveLength(1);
    const planId = plans[0].id;
    await recipient.reload({ waitUntil: 'load' });
    await readyForPatient(recipient);
    const persisted = await recipient.evaluate(id => window.VildaVault.getPatientNote(id), planId);
    expect(persisted.careContext.nativeState.source.definition).toEqual(imported.definition);
    expect(persisted.careContext.nativeState.source.templateId).toBe(importedId);
    const clinicalWithPlan = await rawCareStorage(recipient);

    const revisedLibrary = await openTemplates(recipient);
    await openTemplate(revisedLibrary, importedId);
    await revisedLibrary.getByRole('button', { name: 'Edytuj', exact: true }).click();
    await revisedLibrary.getByRole('navigation', { name: 'Kroki kreatora szablonu', exact: true })
      .getByRole('button', { name: 'Nazwa', exact: true }).click();
    const adaptedTitle = TITLE + ' — fikcyjna adaptacja';
    await revisedLibrary.getByLabel('Nazwa szablonu', { exact: true }).fill(adaptedTitle);
    await previewTemplateDraft(revisedLibrary);
    await revisedLibrary.getByLabel('Autor zmian', { exact: true }).fill(ADAPTER);
    await revisedLibrary.getByLabel('Opis zmian', { exact: true }).fill('Fikcyjna zmiana nazwy opracowania.');
    await revisedLibrary.getByLabel('Wersja opracowania', { exact: true }).fill('2.0');
    await revisedLibrary.getByRole('button', { name: 'Zapisz nową wersję', exact: true }).click();
    await expect(revisedLibrary.locator('.vct-library-list')).toBeVisible();
    const revised = await getTemplate(recipient, importedId);
    expect(revised.definition.publication.authors).toEqual([AUTHOR]);
    expect(revised.definition.publication.contributors).toContain(ADAPTER);
    expect(revised.definition.publication.license).toEqual(exported.envelope.definition.publication.license);
    await templateRow(revisedLibrary, importedId).getByRole('button', { name: 'Eksportuj szablon: ' + adaptedTitle, exact: true }).click();
    const adapted = await downloadSelected(recipient, revisedLibrary);
    expect(adapted.envelope.definition.publication.authors).toEqual([AUTHOR]);
    expect(adapted.envelope.definition.publication.contributors).toContain(ADAPTER);
    expect(adapted.envelope.definition.publication.sources).toEqual(exported.envelope.definition.publication.sources);
    expect(adapted.envelope.definition.publication.origin).toEqual(imported.definition.publication.origin);
    expect(await rawCareStorage(recipient)).toEqual(clinicalWithPlan);
    expect((await recipient.evaluate(id => window.VildaVault.getPatientNote(id), planId)).careContext.nativeState.source.definition).toEqual(imported.definition);
  } finally { await other.close(); }
});

test.describe('phone', () => {
  test.use({ viewport: PHONE.viewport, deviceScaleFactor: PHONE.deviceScaleFactor,
    isMobile: PHONE.isMobile, hasTouch: PHONE.hasTouch, userAgent: PHONE.userAgent });
  test('import previews and cancels without writes, rejects invalid files and requires an explicit choice for a duplicate', async ({ page }, testInfo) => {
    await account(page, 'Fikcyjne konto telefonu');
    const sourceId = await sourceTemplate(page);
    const library = await openTemplates(page);
    const exported = await firstExport(page, library, sourceId);
    const sourceBeforeImport = (await getTemplate(page, sourceId)).definition;
    await library.getByRole('button', { name: 'Anuluj', exact: true }).click();
    const before = await rawTemplateStorage(page, { includeMeta: false });
    const clinical = await rawCareStorage(page);
    for (const [name, text] of [
      ['niepoprawny.json', '{'],
      ['przyszla-wersja.json', JSON.stringify({ ...exported.envelope, format: 'vilda-care-template/v99' })],
      ['biblioteka.vctlib', JSON.stringify({ format: 'vilda-care-template-library/v1', namespace: 'care-template-library', version: 1 })],
    ]) {
      await chooseFile(page, library, text, name);
      await expect(library.locator('.vct-errors')).toBeVisible();
      expect(await rawTemplateStorage(page, { includeMeta: false })).toEqual(before);
      expect(await rawCareStorage(page)).toEqual(clinical);
      await library.getByRole('button', { name: 'Anuluj', exact: true }).click();
    }
    await chooseFile(page, library, exported.text);
    await assertPreview(library);
    await page.screenshot({ path: testInfo.outputPath('single-template-import-phone.png') });
    const duplicate = library.getByLabel('Rozumiem, że zapiszę dodatkową kopię istniejącego szablonu', { exact: true });
    await expect(duplicate).not.toBeChecked();
    await library.getByLabel(IMPORT_REVIEW, { exact: true }).check();
    await expect(library.getByRole('button', { name: 'Zapisz dodatkową kopię', exact: true })).toBeDisabled();
    expect(await rawTemplateStorage(page, { includeMeta: false })).toEqual(before);
    await duplicate.check();
    await library.getByRole('button', { name: 'Zapisz dodatkową kopię', exact: true }).click();
    await expect(library.locator('.vct-library-list')).toBeVisible();
    const rows = await listTemplates(page);
    expect(rows).toHaveLength(2);
    expect((await getTemplate(page, sourceId)).definition).toEqual(sourceBeforeImport);
    expect(await templateRevisions(page, sourceId)).toHaveLength(2);
    const importedId = rows.find(row => row.templateId !== sourceId).templateId;
    expect((await getTemplate(page, importedId)).definition.publication.authors).toEqual([AUTHOR]);
    expect(await rawCareStorage(page)).toEqual(clinical);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await library.getByRole('button', { name: 'Zamknij bibliotekę szablonów', exact: true }).click();
    await expect(page.locator(CARE_WORKSPACE)).toBeVisible();
    await expect(page.locator(CARE_WORKSPACE).getByRole('button', { name: 'Moje szablony', exact: true })).toBeFocused();
  });
});

test('single-template import and export work after a cold restart with the real production service worker and stopped server', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(240_000);
  const profile = await mkdtemp(path.join(os.tmpdir(), 'vilda-single-template-offline-'));
  const server = await ownServer();
  const launch = () => playwright[browserName].launchPersistentContext(profile, { ...launchOptions,
    baseURL: server.origin, serviceWorkers: 'allow', reducedMotion: 'reduce',
    locale: 'pl-PL', timezoneId: 'Europe/Warsaw', viewport: { width: 1440, height: 1000 } });
  let context;
  try {
    context = await launch();
    const installer = context.pages()[0] || await context.newPage();
    await installer.goto('/tests/fixtures/service-worker-runner.html');
    expect(await installer.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
        worker.addEventListener('statechange', () => { if (['activated', 'redundant'].includes(worker.state)) resolve(); });
      });
      return worker.state;
    })).toBe('activated');
    await context.close(); context = null;
    await server.stop();
    context = await launch();
    const page = context.pages()[0] || await context.newPage();
    const served = new Map();
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === server.origin) served.set(url.pathname + url.search, response.fromServiceWorker());
    });
    await account(page, 'Fikcyjne konto pojedynczego szablonu offline');
    expect(await page.evaluate(() => fetch('/__single-template-offline-network-probe').then(() => false, () => true))).toBe(true);
    const sourceId = await sourceTemplate(page);
    const library = await openTemplates(page);
    const exported = await firstExport(page, library, sourceId);
    await library.getByRole('button', { name: 'Anuluj', exact: true }).click();
    await chooseFile(page, library, exported.text);
    await assertPreview(library);
    await library.getByLabel(IMPORT_REVIEW, { exact: true }).check();
    await library.getByLabel('Rozumiem, że zapiszę dodatkową kopię istniejącego szablonu', { exact: true }).check();
    await library.getByRole('button', { name: 'Zapisz dodatkową kopię', exact: true }).click();
    await expect(library.locator('.vct-library-list')).toBeVisible();
    const rows = await listTemplates(page);
    expect(rows).toHaveLength(2);
    const importedId = rows.find(row => row.templateId !== sourceId).templateId;
    const imported = await getTemplate(page, importedId);
    expect(imported.definition.publication.authors).toEqual([AUTHOR]);
    await templateRow(library, importedId).getByRole('button', { name: 'Eksportuj szablon: ' + TITLE, exact: true }).click();
    const repeated = await downloadSelected(page, library);
    expect(repeated.envelope.definition.publication).toEqual(imported.definition.publication);
    const resource = [...served].find(([url]) => url.split('?')[0] === '/vilda_care_template_transfer.js');
    expect(resource, 'the portable module is requested only after the cold offline restart').toBeTruthy();
    expect(resource[1], 'the new module is served by the production service worker').toBe(true);
    const expectedDigest = createHash('sha256').update(await readFile(path.join(ROOT, 'vilda_care_template_transfer.js'))).digest('hex');
    const actualDigest = await page.evaluate(async url => {
      const response = await fetch(url);
      if (!response.ok) throw Error('Missing offline portable-template module');
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
    }, resource[0]);
    expect(actualDigest).toBe(expectedDigest);
    await page.reload({ waitUntil: 'load' });
    await readyForPatient(page);
    await page.evaluate(() => window.VildaCarePlans.ensureTemplateLibrary({ ui: false }));
    expect(await listTemplates(page)).toHaveLength(2);
    expect((await getTemplate(page, importedId)).definition).toEqual(imported.definition);
  } finally {
    if (context) await context.close();
    await server.stop();
    await rm(profile, { recursive: true, force: true });
  }
});
