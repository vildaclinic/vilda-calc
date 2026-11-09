import { fileURLToPath } from 'node:url';
import { test, expect, devices } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fixturePreferences, readyForPatient, fictionalPatient } from '../support/centile-live-fixture.mjs';
import { openTemplates, listTemplates, getTemplate, templateRow } from '../support/care-templates-fixture.mjs';

const FILE = fileURLToPath(new URL('../../templates/sga/SGA-kwalifikacja-Maciej-Flader.vilda-template.json', import.meta.url));
const PASSWORD = 'Fictional#SGADraftCheck2026!aA';
test.setTimeout(180_000);

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
  return page.evaluate(async payload => {
    await window.VildaCarePlans.ensureTemplateLibrary({ ui: false });
    return (await window.VildaVault.savePatient(payload, { dedup: false })).patientId;
  }, fictionalPatient());
}
async function previewFile(page, library) {
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), library.getByRole('button', { name: 'Importuj szablon', exact: true }).click()]);
  await picker.setFiles(FILE);
  await expect(library.getByRole('heading', { name: 'Import szablonu', exact: true })).toBeVisible();
  await expect(library.locator('.vct-publication')).toContainText('Maciej Flader');
  await expect(library.locator('.vct-publication')).toContainText('sprzedaż szablonu');
  await expect(library.locator('.vct-publication')).toContainText('osobnej zgody autora');
  await expect(library.locator('.vct-publication')).toContainText('B.64');
  await expect(library.locator('.vct-preview-step')).toHaveCount(10);
  expect(await library.locator('.vct-scroll-pane').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

test('the owner-approved SGA version 1.0 imports through the production UI and creates a fictional patient plan; phone preview preserves source and custom terms', async ({ page, browser, baseURL }, testInfo) => {
  const ARTIFACTS = testInfo.outputDir;
  await mkdir(ARTIFACTS, { recursive: true });
  const envelope = JSON.parse(await readFile(FILE, 'utf8'));
  const definition = envelope.definition;
  expect(definition.publication.version).toBe('1.0');
  expect(definition.name).not.toMatch(/projekt|do oceny|draft/iu);
  expect(definition.stages).toHaveLength(3);
  expect(definition.steps).toHaveLength(10);
  const patientId = await account(page, 'Fikcyjny test importu wersji 1.0 SGA');
  const library = await openTemplates(page);
  await previewFile(page, library);
  await page.screenshot({ path: ARTIFACTS + '/sga-import-desktop.png' });
  await library.getByLabel('Zapoznałem się z autorstwem i zasadami udostępniania', { exact: true }).check();
  await page.screenshot({ path: ARTIFACTS + '/sga-import-desktop-final-steps.png' });
  await library.getByRole('button', { name: 'Zapisz jako nowy szablon', exact: true }).click();
  await expect(library.locator('.vct-library-list')).toBeVisible();
  const rows = await listTemplates(page);
  expect(rows).toHaveLength(1);
  const imported = await getTemplate(page, rows[0].templateId);
  expect(imported.definition.steps).toHaveLength(10);
  expect(imported.definition.publication.authors).toEqual(['Maciej Flader']);
  expect(imported.definition.publication.license).toEqual(definition.publication.license);
  expect(imported.definition.publication.sources).toEqual(definition.publication.sources);
  await templateRow(library, rows[0].templateId).getByRole('button', { name: 'Użyj u pacjenta: ' + definition.name, exact: true }).click();
  await library.locator('[data-patient-id="' + patientId + '"]').click();
  await library.getByRole('button', { name: 'Dalej', exact: true }).click();
  await library.getByRole('button', { name: 'Utwórz plan', exact: true }).click();
  await expect(library).toHaveCount(0);
  const plans = await page.evaluate(id => window.VildaVault.listCarePlans({ patientId: id }), patientId);
  expect(plans).toHaveLength(1);
  const selectedSteps = definition.steps.filter(step => step.includedByDefault);
  expect(plans[0].careContext.steps).toHaveLength(selectedSteps.length);
  expect(plans[0].careContext.stages.map(stage => stage.control.state)).toEqual(['planned', 'planned', 'planned']);
  await page.reload({ waitUntil: 'load' });
  await readyForPatient(page);
  const saved = await page.evaluate(id => window.VildaVault.getPatientNote(id), plans[0].id);
  expect(saved.careContext.nativeState.source.definition).toEqual(imported.definition);
  expect(saved.careContext.nativeState.source.definition.publication.license).toEqual(definition.publication.license);
  const device = devices['iPhone 15 Pro'];
  const phone = await browser.newContext({ viewport: device.viewport, deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile, hasTouch: device.hasTouch, userAgent: device.userAgent, baseURL,
    serviceWorkers: 'block', reducedMotion: 'reduce', locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
  try {
    const mobile = await phone.newPage();
    await account(mobile, 'Fikcyjne konto podglądu SGA 1.0 na telefonie');
    const mobileLibrary = await openTemplates(mobile);
    await previewFile(mobile, mobileLibrary);
    await mobile.screenshot({ path: ARTIFACTS + '/sga-import-phone.png' });
    await mobileLibrary.locator('.vct-publication').scrollIntoViewIfNeeded();
    await mobile.screenshot({ path: ARTIFACTS + '/sga-import-phone-rights.png' });
    await mobileLibrary.getByLabel('Zapoznałem się z autorstwem i zasadami udostępniania', { exact: true }).scrollIntoViewIfNeeded();
    await mobile.screenshot({ path: ARTIFACTS + '/sga-import-phone-final-steps.png' });
    await mobileLibrary.getByRole('button', { name: 'Anuluj', exact: true }).click();
    expect(await listTemplates(mobile)).toEqual([]);
    await writeFile(ARTIFACTS + '/result.json', JSON.stringify({ technicalVerificationOnly: true,
      ownerClinicalApproval: true, approvalBasis: 'Explicit owner approval of all ten steps in the current conversation', independentClinicalValidation: false, publicationVersion: definition.publication.version, contentDigest: envelope.contentDigest, stages: definition.stages.length, sourceSteps: definition.steps.length,
      selectedPatientPlanSteps: selectedSteps.length, preservedAuthors: definition.publication.authors,
      license: definition.publication.license.id, sourceCount: definition.publication.sources.length,
      desktopImport: true, patientPlanReload: true, mobilePreview: true, mobileHorizontalOverflow: false }, null, 2) + '\n');
  } finally { await phone.close(); }
});
