import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { fixturePreferences, shellFrame } from './centile-live-fixture.mjs';
import { rawCareStorage } from './care-plans-model-fixture.mjs';
import { globalSearchFixture, openGlobalSearch, queryGlobal, resultFor } from './global-search-fixture.mjs';
import { buildKlirensSearchCases, createKlirensSearchEnvironment } from './klirens-search-all-formulas.mjs';
import { LONG_QUERY, openLongResult, searchReturnFixture } from './search-return-browser-fixture.mjs';

export const MISSING_SEARCH_RECORD = 'Wskazany wpis jest niedostępny lub nie pasuje do aktualnych filtrów.';
export const SEARCH_READ_ERROR = 'Nie udało się przeszukać danych. Spróbuj ponownie.';

export async function openFictionalWriter(page, created) {
  const userId = await created.frame.evaluate(() => window.VildaVault.getCurrentUser().userId);
  const writer = await page.context().newPage();
  await fixturePreferences(writer);
  await writer.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
  await writer.goto('/index.html', { waitUntil: 'load' });
  await writer.waitForFunction(() => window.VildaAuthUI?.isBootReady());
  if (!await writer.evaluate(() => window.VildaVault.isUnlocked())) {
    const auth = writer.locator('#vilda-auth-ui-root');
    await auth.getByRole('button', { name: /Fikcyjny sejf testu panelu siatek/ }).click();
    await auth.locator('input[type=password]').fill('E2e#SiatkaNowyPomiar!2026');
    await auth.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  }
  await writer.waitForFunction(() => window.VildaVault?.isUnlocked() && !document.documentElement.classList.contains('vilda-auth-locked'));
  expect(await writer.evaluate(() => window.VildaVault.getCurrentUser().userId)).toBe(userId);
  return writer;
}

export async function lifecycleFixture(page, { shell = false, long = false } = {}) {
  const created = await (long ? searchReturnFixture(page, { shell }) : globalSearchFixture(page, { shell }));
  const writer = await openFictionalWriter(page, created);
  return { ...created, writer, shell };
}

export async function fullLongSearch(page, created) {
  const search = await openGlobalSearch(page);
  return openLongResult(page, created, { search });
}

export async function searchFor(page, kind, id, query) {
  const search = await openGlobalSearch(page);
  await queryGlobal(search, query);
  await resultFor(search, kind, id).click();
  return search;
}

export async function storedFingerprint(owner) {
  const raw = await rawCareStorage(owner);
  return createHash('sha256').update(JSON.stringify(raw)).digest('hex');
}

export async function changeNote(owner, id, patch) {
  return owner.evaluate(async ({ id, patch }) => {
    const note = await window.VildaVault.getPatientNote(id);
    if (!note) throw new Error('Missing fictional lifecycle note');
    await window.VildaVault.savePatientNote({ ...note, baseRev: note.rev, ...patch });
    return window.VildaVault.getPatientNote(id);
  }, { id, patch });
}

export async function renamePrimary(owner, patientId, suffix) {
  return owner.evaluate(async ({ patientId, suffix }) => {
    const patient = await window.VildaVault.getPatient(patientId);
    const payload = structuredClone(patient.snapshots[0].payload);
    payload.name = 'Fikcyjny ' + suffix + ' Antoni';
    payload.user.lastName = 'Fikcyjny ' + suffix; payload.user.firstName = 'Antoni';
    return window.VildaVault.savePatient(payload, { patientId, dedup: false });
  }, { patientId, suffix });
}

export async function renameExternal(owner, patientId, suffix) {
  return owner.evaluate(({ patientId, suffix }) => window.VildaVault.saveExternalPatient({
    patientId, lastName: 'Fikcyjny ' + suffix, firstName: 'Zewnętrzny',
  }), { patientId, suffix });
}

export async function strictReadCounter(owner) {
  await owner.evaluate(() => {
    const vault = window.VildaVault, original = vault.listAllPatientNotes;
    window.__searchLifecycleStrictReads = 0;
    vault.listAllPatientNotes = function (...args) {
      if (args[0]?.strict === true) window.__searchLifecycleStrictReads += 1;
      return original.apply(this, args);
    };
  });
  return () => owner.evaluate(() => window.__searchLifecycleStrictReads);
}

export async function assertMissingSearch(search, expected) {
  await expect(search.getByRole('searchbox', { name: 'Szukaj we wszystkich pacjentach i sprawach', exact: true })).toHaveValue(expected.query);
  await expect(search.getByRole('combobox', { name: 'Daty wpisów', exact: true })).toHaveValue(expected.time);
  await expect(search.getByRole('combobox', { name: 'Stan spraw', exact: true })).toHaveValue(expected.status);
  await expect(search.locator('.vgs-row')).toHaveCount(expected.count);
  await expect(search.locator('.vgs-list')).toContainText(MISSING_SEARCH_RECORD);
  await expect(search.locator('[aria-current="true"][data-search-id]')).toHaveCount(0);
  if (expected.listScroll !== undefined) await expect.poll(() => search.locator('.vgs-list').evaluate(node => node.scrollTop)).toBeCloseTo(expected.listScroll, 0);
}

export async function calendarFrame(page, shell) {
  return shell ? shellFrame(page, 'Terminarz') : page;
}

// Deliberately damage only a persisted record belonging to this fixture's
// account. The original encrypted record stays in that writer's RAM and is
// restored byte-for-byte; no decryption function or search reader is replaced.
export async function corruptFictionalCipher(writer, noteId) {
  await writer.evaluate(async noteId => {
    const vault = window.VildaVault, userId = vault.getCurrentUser().userId;
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(vault.USER_DB_PREFIX + userId);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error('Missing fictional clinical database')); };
    });
    try {
      const record = await new Promise((resolve, reject) => {
        const request = database.transaction('patientNotes', 'readonly').objectStore('patientNotes').get(noteId);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      if (!record?.bodyCipher) throw new Error('Missing fictional encrypted note');
      window.__searchLifecycleCipherBackup = { userId, record: structuredClone(record) };
      record.bodyCipher = { ...record.bodyCipher, data: 'fictional-invalid-ciphertext' };
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('patientNotes', 'readwrite');
        transaction.objectStore('patientNotes').put(record);
        transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
      });
    } finally { database.close(); }
  }, noteId);
}

export async function restoreFictionalCipher(writer) {
  await writer.evaluate(async () => {
    const vault = window.VildaVault, backup = window.__searchLifecycleCipherBackup;
    if (!backup || backup.userId !== vault.getCurrentUser().userId) throw new Error('Fictional ciphertext owner changed');
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(vault.USER_DB_PREFIX + backup.userId);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('patientNotes', 'readwrite');
        transaction.objectStore('patientNotes').put(backup.record);
        transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
      });
      delete window.__searchLifecycleCipherBackup;
    } finally { database.close(); }
  });
}

export function representativeKlirens(patientId) {
  const root = createKlirensSearchEnvironment(), all = buildKlirensSearchCases(patientId, root);
  const chosen = ['ACR-registry', 'K_mmol_d-reported-potassium', 'Prot_mg24-typed-reported-g-24h'].map(key => {
    const item = all.find(entry => entry.key === key);
    if (!item) throw new Error('Missing production fixture ' + key);
    return { ...item, notePayload: { ...item.notePayload, title: 'Fikcyjny lifecycle wynik ' + key } };
  });
  // A pre-envelope legacy record still comes from the production calculator
  // and note writer; only the later frozen-envelope append is absent.
  const cg = all.find(entry => entry.key === 'cg-registry');
  const point = root.ClcrSavedCalculation.recalculate(root.ClcrSavedCalculation.readSaved(cg.note));
  const notePayload = root.ClcrSavedResults.buildPatientNotePayload(point, { patientId, clinicalDateISO: cg.note.clinicalDateISO,
    comment: 'Fikcyjny komentarz starszego producenta.' });
  notePayload.title = 'Fikcyjny lifecycle wynik cg-legacy';
  chosen.push({ key: 'cg-legacy', notePayload, expected: { summary: root.ClcrNotesView.summary(notePayload, { patientId }) } });
  return chosen;
}

const manifest = readFileSync(new URL('../../clcr_record_resources.js', import.meta.url), 'utf8');
const editorSource = manifest.slice(manifest.indexOf('  const editor = ['), manifest.indexOf('  function load('));
const editors = [...editorSource.matchAll(/\["([^"?]+\.js)\?[^"\n]+",\s*"([^"\n]+)"\]/g)].map(([, file, name]) => ({ file, name }));
const clinicalResources = editors.concat([
  { file: 'gh_igf_therapy.js', name: 'vildaGhIgfPersistApi' },
  { file: 'vilda_gh_dawka.js', name: 'VildaGhDawka' },
]);

export async function beginClinicalReadProof(page) {
  await page.waitForTimeout(4500);
  await page.evaluate(names => { window.__searchLifecycleEditors = new Map(names.map(name => [name, window[name]])); }, clinicalResources.map(entry => entry.name));
  const requested = [], files = new Set(clinicalResources.map(entry => entry.file));
  const onRequest = request => { if (files.has(new URL(request.url()).pathname.split('/').at(-1))) requested.push(request.url()); };
  page.on('request', onRequest);
  const profiler = await page.context().newCDPSession(page);
  await profiler.send('Profiler.enable');
  await profiler.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  return async () => {
    const coverage = await profiler.send('Profiler.takePreciseCoverage');
    await profiler.send('Profiler.stopPreciseCoverage'); await profiler.detach(); page.off('request', onRequest);
    expect(requested).toEqual([]);
    expect(await page.evaluate(() => [...window.__searchLifecycleEditors].filter(([name, value]) => window[name] !== value).map(([name]) => name))).toEqual([]);
    const calculations = coverage.result.filter(script => /\/clcr_[^/?]+\.js(?:\?|$)/.test(script.url)).flatMap(script =>
      script.functions.filter(fn => /^(?:evaluate|recalculate)$/.test(fn.functionName)).map(fn => ({ function: fn.functionName, calls: fn.ranges[0]?.count || 0 })));
    expect(calculations.some(entry => entry.function === 'recalculate')).toBe(true);
    expect(calculations.filter(entry => entry.calls > 0)).toEqual([]);
  };
}

export { LONG_QUERY };
