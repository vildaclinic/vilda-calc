import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'espree';
import { expect, test } from '@playwright/test';
import { clinicalFingerprint, createFictionalVault } from '../support/centile-live-fixture.mjs';
import { openGlobalSearch, queryGlobal, resultFor } from '../support/global-search-fixture.mjs';
import { buildKlirensSearchCases, KLIRENS_SEARCH_PARAMETER_KEYS } from '../support/klirens-search-all-formulas.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(240000);

const resourceSource = readFileSync(new URL('../../clcr_record_resources.js', import.meta.url), 'utf8');
const editorSource = resourceSource.slice(resourceSource.indexOf('  const editor = ['), resourceSource.indexOf('  function load('));
const editorResources = [...editorSource.matchAll(/\["([^"?]+\.js)\?[^"\n]+",\s*"([^"\n]+)"\]/g)].map(([, file, name]) => ({ file, name }));
if (!editorResources.length) throw new Error('Missing production Klirens editor dependency manifest');

// DocPro's scheduler owns the actual note producer, not a public exported API.
// Extract its complete dependency closure with the parser, execute the unchanged
// functions in Node and capture only the write request. The browser then sends
// that real producer payload through the real encrypted vault. No clinical
// calculation or saved-result reader is replaced in the browser.
async function buildDocProSchedulerCases(patientId) {
  const source = readFileSync(new URL('../../gh_igf_therapy.js', import.meta.url), 'utf8');
  const required = ['Q', 'Gdm', 'Gdpod', 'Gdtzp', 'Gdtz', 'ot'];
  const functions = new Map();
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && required.includes(node.id?.name)) functions.set(node.id.name, source.slice(...node.range));
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(parse(source, { ecmaVersion: 'latest', sourceType: 'script', range: true }));
  expect([...functions.keys()].sort()).toEqual([...required].sort());
  const root = {}, written = [];
  for (const file of ['vilda_gh_dawka_dane.js', 'vilda_gh_dawka.js']) loadBrowserScript(file, root);
  root.VildaVault = { savePatientNote: async payload => { written.push(structuredClone(payload)); return { id: 'fictional-docpro-captured-' + written.length }; } };
  const write = new Function('window', required.map(name => functions.get(name)).join('\n') + '\nreturn ot;')(root);
  const daily = { program: 'SNP', programLabel: 'SNP (Fikcyjny program)', drug: 'Omnitrope 10 mg', mgKgDay: 0.7 / 24.7, mgDay: 0.7,
    weight: 24.7, height: 121, ageMonths: 108, ghPointId: 'fictional-module-coverage-daily', pointType: 'start', doseUnit: 'mg/kg/d' };
  const contexts = [
    ['docpro-daily', daily],
    ['docpro-weekly', { ...daily, drug: 'Ngenla 60 mg', mgKgDay: 0.66, mgDay: 16.302 / 7, ghPointId: 'fictional-module-coverage-weekly', pointType: 'continue', doseUnit: 'mg/kg/tydz' }],
    ['docpro-increlex', { ...daily, program: 'IGF-1', programLabel: 'IGF-1 (Fikcyjny program)', drug: 'Increlex 40 mg', mgKgDay: 0.24, mgDay: 4.8,
      ghPointId: 'fictional-module-coverage-increlex', pointType: 'end' }],
  ];
  const cases = [];
  for (const [key, context] of contexts) {
    const count = written.length;
    await write(patientId, '2027-01-15', '10:30', 20, context);
    expect(written).toHaveLength(count + 1);
    const notePayload = written.at(-1);
    expect(notePayload.medication.doseNum).toBe(context.mgKgDay);
    cases.push({ key, formulaId: 'DocPro scheduler', notePayload, expected: { summary: notePayload.body } });
  }
  expect(cases[0].notePayload.body).toContain('Dawka: 0,028 mg/kg/d (0,70 mg/d).');
  expect(cases[1].notePayload.body).toContain('Dawka: 16,3 mg/tydz (0,660 mg/kg/tydz).');
  expect(cases[2].notePayload.body).toContain('mg/kg na podanie');
  return cases;
}

async function fingerprint(created) {
  const clinical = await clinicalFingerprint(created.frame, created.ids.a);
  const notes = await created.frame.evaluate(async patientId => {
    const all = await window.VildaVault.listPatientNotesForPatient(patientId);
    return JSON.stringify(all.sort((left, right) => left.id.localeCompare(right.id)));
  }, created.ids.a);
  return { clinical, notesSha256: createHash('sha256').update(notes).digest('hex') };
}

async function assertNoAdditionalClinicalEditors(search) {
  const state = await search.evaluate(node => {
    const owner = node.ownerDocument.defaultView;
    const names = owner.ClcrRecordResources.manifest.editor.map(([, name]) => name);
    const baseline = owner.__moduleCoverageEditorBaseline;
    return { names: names.sort(), baselineNames: [...baseline.keys()].sort(),
      loadedBefore: [...baseline].filter(([, value]) => value !== undefined).map(([name]) => name).sort(),
      loadedAfter: names.filter(name => owner[name] !== undefined).sort(),
      changed: names.filter(name => owner[name] !== baseline.get(name)) };
  });
  expect(state.names, 'The baseline covers the complete actual editor manifest').toEqual(state.baselineNames);
  expect(state.loadedAfter, 'Search adds no clinical engines, policy tables or editors').toEqual(state.loadedBefore);
  expect(state.changed, 'Preloaded clinical modules retain their original identity').toEqual([]);
  return state.loadedBefore;
}

for (const width of [1440, 390]) {
  test(`all Klirens saved parameters and real DocPro scheduler notes stay canonical and read-only at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
    const created = await createFictionalVault(page, { shell: width === 390 });
    const klirens = buildKlirensSearchCases(created.ids.a);
    expect([...new Set(klirens.map(entry => entry.parameterKey))].sort()).toEqual([...KLIRENS_SEARCH_PARAMETER_KEYS].sort());
    const cases = [...klirens, ...await buildDocProSchedulerCases(created.ids.a)];
    const saved = await created.frame.evaluate(async entries => {
      const result = [];
      for (const { key, notePayload } of entries) {
        const write = await window.VildaVault.savePatientNote(notePayload);
        const note = await window.VildaVault.getPatientNote(write.id);
        if (!note || note.id !== write.id) throw new Error('Missing real persisted module note: ' + key);
        if (notePayload.medication && JSON.stringify(note.medication) !== JSON.stringify(notePayload.medication)) {
          throw new Error('The real DocPro medication metadata must survive the vault sanitizer: ' + key);
        }
        result.push({ key, id: write.id, note });
      }
      return result;
    }, cases.map(({ key, notePayload }) => ({ key, notePayload })));
    expect(new Set(saved.map(entry => entry.id)).size).toBe(cases.length);
    // Finish the existing main-form compatibility refresh before measuring the
    // unchanged current patient, snapshots and complete encrypted note records.
    await page.waitForTimeout(4500);
    const consent = page.locator('#consent-decline');
    if (await consent.isVisible()) await consent.click();
    expect(await page.evaluate(() => Boolean(window.ClcrNotesView))).toBe(false);
    expect(await created.frame.evaluate(() => Boolean(window.ClcrNotesView))).toBe(false);
    const before = await fingerprint(created);
    await created.frame.evaluate(() => {
      window.__moduleCoverageWrites = [];
      window.VildaVault.onPatientNoteChanged(event => window.__moduleCoverageWrites.push({ kind: 'note', action: event?.action }));
      window.VildaVault.onPatientSaved(event => window.__moduleCoverageWrites.push({ kind: 'patient', id: event?.patientId }));
    });
    // index.html already owns Na/K calculation modules for its save-status
    // integration. Compare every production dependency with the real baseline;
    // Search must neither add a module nor replace any existing implementation.
    await page.evaluate(names => {
      window.__moduleCoverageEditorBaseline = new Map(names.map(name => [name, window[name]]));
    }, editorResources.map(({ name }) => name));
    const editorRequests = [], editorFiles = new Set(editorResources.map(({ file }) => file));
    page.on('request', request => {
      const file = new URL(request.url()).pathname.split('/').at(-1);
      if (editorFiles.has(file)) editorRequests.push(request.url());
    });
    const profiler = await page.context().newCDPSession(page);
    await profiler.send('Profiler.enable');
    await profiler.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
    const search = await openGlobalSearch(page);
    await queryGlobal(search, 'Fikcyjny');
    const more = search.locator('.vgs-more');
    while (await more.count()) await more.click();
    for (const entry of saved) await expect(resultFor(search, 'note', entry.id), entry.key).toHaveCount(1);
    const evidence = [];
    for (const entry of cases) {
      const stored = saved.find(item => item.key === entry.key);
      await resultFor(search, 'note', stored.id).click();
      const body = search.locator('.vgs-detail .vb22-body');
      await expect(body, entry.key).toBeVisible();
      expect(await body.textContent(), entry.key).toBe(entry.expected.summary);
      const actual = await body.textContent();
      expect(actual.length, entry.key).toBeGreaterThan(0);
      expect(actual.length, entry.key).toBeLessThan(10000);
      expect(actual, entry.key).not.toMatch(/\b(?:NaN|Infinity|undefined|null)\b/);
      for (const technical of ['VILDA_CLCR_CALCULATION', 'Kalkulator klirensu', 'exactMain', 'engineVersion', 'numerator', '[dane]', '[tekst]', 'capturedContext']) {
        expect(actual, entry.key).not.toContain(technical);
      }
      if (entry.expected.model) {
        const model = await search.evaluate((node, note) => node.ownerDocument.defaultView.ClcrNotesView.model(note), stored.note);
        for (const field of ['label', 'display', 'unit', 'norm', 'referenceLabel', 'tone', 'category', 'outOfRange', 'status', 'interpretation', 'boundary', 'caution', 'comment']) {
          expect(model[field], entry.key + ': ' + field).toEqual(entry.expected.model[field]);
        }
      } else {
        expect(actual.match(/Dawka:/g), entry.key).toHaveLength(1);
        expect(actual, entry.key).not.toMatch(/mg\/kg\/(?:d|tydz) (?:dzień|tydzień)/);
      }
      expect(await search.evaluate(node => node.scrollWidth <= node.clientWidth + 1), entry.key + ': no horizontal overflow').toBe(true);
      evidence.push({ key: entry.key, formulaId: entry.formulaId, parameterKey: entry.parameterKey || null, variant: entry.variant || 'producer', id: stored.id, bodyLength: actual.length });
      if (width <= 700) await search.getByRole('button', { name: '← Wyniki wyszukiwania', exact: true }).click();
    }
    const preloadedEditors = await assertNoAdditionalClinicalEditors(search);
    expect(editorRequests, 'No clinical editor or engine resource is requested while searching').toEqual([]);
    const coverage = await profiler.send('Profiler.takePreciseCoverage');
    await profiler.send('Profiler.stopPreciseCoverage');
    await profiler.detach();
    const calculationCalls = coverage.result.filter(script => /\/clcr_[^/?]+\.js(?:\?|$)/.test(script.url)).flatMap(script =>
      script.functions.filter(fn => /^(?:evaluate|recalculate|readSaved)$/.test(fn.functionName)).map(fn => ({
        url: script.url, function: fn.functionName, calls: fn.ranges[0]?.count || 0,
      })));
    expect(calculationCalls.some(entry => /clcr_saved_calculation\.js/.test(entry.url) && entry.function === 'readSaved' && entry.calls > 0), 'Precise browser coverage observes the real frozen reader').toBe(true);
    expect(calculationCalls.some(entry => /clcr_saved_calculation\.js/.test(entry.url) && entry.function === 'recalculate'), 'The real recalculation function is covered by the counter').toBe(true);
    expect(calculationCalls.filter(entry => entry.function !== 'readSaved' && entry.calls > 0), 'No production evaluate/recalculate function runs while searching').toEqual([]);
    expect(await fingerprint(created)).toEqual(before);
    expect(await created.frame.evaluate(() => window.__moduleCoverageWrites)).toEqual([]);
    expect(await search.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await testInfo.attach('module-search-presentation-coverage', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      width, shell: width === 390, klirensParameters: new Set(klirens.map(entry => entry.parameterKey)).size,
      sourceFormulas: new Set(klirens.map(entry => entry.formulaId)).size, cases: evidence,
      preloadedEditors, editorRequests, calculationCalls,
    }, null, 2)) });
  });
}
