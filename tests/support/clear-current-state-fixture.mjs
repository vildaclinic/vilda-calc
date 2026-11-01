import { expect, test } from './test-czas.mjs';
import { fixturePreferences, loadPatient as loadPatientBase, readyForPatient, shellFrame } from './centile-live-fixture.mjs';

const PASSWORD = 'Fikcyjny#ClearCurrent2026!aA';
export const CLEAR_DIALOG = /^Zapisać (wpisane dane|zmiany) przed wyczyszczeniem\?$/u;

// Only these existing debounce callbacks are delayed. In particular, the clock,
// animation frames, shared-persistence250/120ms, and all other timers keep running.
function installDebounceObserver() {
  const originalSet = window.setTimeout.bind(window);
  const originalClear = window.clearTimeout.bind(window);
  const entries = new Map(), journal = [];
  let armed = false;
  window.__clearInputActivity = [];
  window.__clearTrustedClicks = [];
  for (const type of ['input', 'change']) document.addEventListener(type, event => {
    if (!event.target?.id) return;
    const row = { type, field: event.target.id, value: event.target.value, trusted: event.isTrusted,
      before: window.VildaPubertyAssessmentState?.getActivityRevision?.() };
    window.__clearInputActivity.push(row);
    queueMicrotask(() => { row.after = window.VildaPubertyAssessmentState?.getActivityRevision?.(); });
  }, true);
  function observeClearClick(event) {
    const button = event.target?.closest?.('#clearAllDataBtn,#clearBtn');
    if (button) window.__clearTrustedClicks.push({ id: button.id, trusted: event.isTrusted });
  }
  window.addEventListener('click', observeClearClick, true);
  function source(delay, stack) {
    if (delay === 300 && /\/vilda_data_import_export\.js(?:\?|:)/.test(stack)) return 'main300';
    if (delay === 300 && /\/vilda_puberty_assessment_state\.js(?:\?|:)/.test(stack)) return 'puberty300';
    if (delay === 400 && /\/vilda_save_status_indicator\.js(?:\?|:)/.test(stack)) return 'status400';
    return null;
  }
  window.setTimeout = function (callback, delay, ...args) {
    const owner = typeof callback === 'function' && source(Number(delay), new Error().stack || '');
    if (!owner) return originalSet(callback, delay, ...args);
    const entry = { owner, delay: Number(delay), callback, args, armed, held: false, cancelled: false, executed: false };
    const id = originalSet(function () {
      if (entry.cancelled) return;
      if (armed && entry.armed) { entry.held = true; return; }
      entries.delete(id); entry.executed = true;
      return callback.apply(window, args);
    }, delay);
    entries.set(id, entry); journal.push(entry);
    return id;
  };
  window.clearTimeout = function (id) {
    const entry = entries.get(id);
    if (entry) { entry.cancelled = true; entries.delete(id); }
    return originalClear(id);
  };
  window.__clearDebounceProbe = {
    arm() {
      // Shell document replacement may reset early event listeners. Reattach to
      // the live window; its capture precedes the guard's document capture.
      window.removeEventListener('click', observeClearClick, true);
      window.addEventListener('click', observeClearClick, true);
      armed = true; journal.length = 0;
    },
    pending() { return [...entries.values()].filter(entry => !entry.cancelled).length; },
    snapshot() { return journal.map(({ owner, delay, armed, held, cancelled, executed }) => ({ owner, delay, armed, held, cancelled, executed })); },
    release() {
      armed = false;
      for (const [id, entry] of entries) {
        if (!entry.held || entry.cancelled) continue;
        entries.delete(id);
        originalSet(() => {
          if (entry.cancelled) return;
          entry.executed = true; entry.callback.apply(window, entry.args);
        }, 0);
      }
    },
  };
}

export async function openFictionalClearAccount(page, context, { path = '/index.html', width = 1440, shell = false } = {}) {
  const network = [];
  await context.route(/https?:\/\/[^/]+\.workers\.dev(?:\/|$)/, route => {
    const request = route.request(), url = new URL(request.url());
    const endpoint = url.pathname.replace(/^\/v1\/slots\/[^/]+\/?/, '');
    const status = request.method() === 'OPTIONS' ? 204 : endpoint === 'entitlement' ? 200 : 404;
    network.push({ method: request.method(), endpoint: '/fictional/' + endpoint, status });
    return route.fulfill({ status, headers: { 'access-control-allow-origin': '*',
      'access-control-allow-headers': '*', 'content-type': 'application/json' },
    ...(status === 204 ? {} : { body: JSON.stringify(endpoint === 'entitlement' ? { plan: 'free' } : {}) }) });
  });
  await context.routeWebSocket(/wss?:\/\/[^/]+\.workers\.dev(?:\/|$)/, socket => {
    network.push({ websocket: 'intercepted-and-closed' }); socket.close();
  });
  await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(installDebounceObserver);
  // The existing fictional-account preferences supply consent and DocPro access.
  // No restore/pause/dirty flags or patient/profile data are assigned by this test.
  await fixturePreferences(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(password => window.VildaVault.createUser(password, {
    label: 'Fikcyjny test decyzji Wyczyść', iterations: 10000,
  }), PASSWORD);
  await page.reload({ waitUntil: 'load' });
  await readyForPatient(page);
  let owner = page;
  if (shell) {
    await page.goto(path === '/docpro.html' ? '/app.html#/docpro' : '/app.html#/start', { waitUntil: 'load' });
    owner = await shellFrame(page, path === '/docpro.html' ? 'DocPro' : 'Start');
    await readyClearPage(owner);
  } else if (path !== '/index.html') { await page.goto(path, { waitUntil: 'load' }); await readyClearPage(page); }
  if (path === '/docpro.html') await prepareDocProUserFlow(owner);
  // Finish the owning producer and any already-created clinical sibling before
  // the first edit. Their startup callbacks can write the same shared session.
  await readyClearPage(owner);
  if (shell) {
    const panes = page.locator('iframe.app-pane[title="Start"],iframe.app-pane[title="DocPro"],iframe.app-pane[title="Kalkulator klirensu"]');
    for (const pane of await panes.elementHandles()) {
      const sibling = await pane.contentFrame();
      if (sibling && sibling !== owner) await readyClearPage(sibling);
    }
  }
  await expect.poll(() => owner.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('hidden');
  await owner.waitForFunction(() => window.__clearDebounceProbe.pending() === 0);
  return { network, owner };
}

async function loadPatient(frame, patientId, choice = 'new', options = {}) {
  // Arm before the click: the restore event is synchronous, whereas a cached
  // "saved" label can still belong to the initial, incomplete load state.
  const witness = await frame.evaluateHandle(({ patientId, choice }) => {
    const initialSequence = window.VildaDataImportExport.getApplyLoadedDataSequence();
    if (!Number.isSafeInteger(initialSequence)) throw Error('Missing initial patient-load sequence');
    const type = choice === 'new' ? 'vilda:load-choice-applied' : 'vilda:state-restored';
    let listener, complete;
    const dispose = () => {
      if (listener) document.removeEventListener(type, listener);
      listener = null;
    };
    const promise = new Promise(resolve => { complete = resolve; });
    listener = event => {
      const detail = event.detail || {};
      const currentPatient = sessionStorage.getItem('vildaCurrentPatientId');
      const sequence = window.VildaDataImportExport.getApplyLoadedDataSequence();
      if (currentPatient !== patientId || !Number.isSafeInteger(sequence) || sequence <= initialSequence) return;
      if (choice === 'new') {
        if (detail.choice !== 'new' || detail.patientId !== patientId || detail.applySequence !== sequence) return;
      } else {
        if (detail.source !== 'restoreLoadedState') return;
        if (detail.patientId !== undefined && detail.patientId !== patientId) return;
        if (detail.applySequence !== undefined && detail.applySequence !== sequence) return;
      }
      dispose();
      complete({ patientId, applySequence: sequence });
    };
    document.addEventListener(type, listener);
    return { promise, dispose };
  }, { patientId, choice });
  try {
    await loadPatientBase(frame, patientId, choice, options);
    const completed = await witness.evaluate(value => value.promise);
    await expect.poll(() => frame.evaluate(() => {
      const decision = window.VildaSaveStatusIndicator.getCurrentDecision();
      return { patientId: sessionStorage.getItem('vildaCurrentPatientId'),
        applySequence: window.VildaDataImportExport.getApplyLoadedDataSequence(),
        ready: decision.ready, state: decision.state };
    })).toEqual({ ...completed, ready: true, state: 'saved' });
  } finally {
    try { await witness.evaluate(value => value.dispose()); }
    finally { await witness.dispose(); }
  }
}

export async function readyClearPage(page) {
  await page.waitForFunction(() => Boolean(window.VildaDataImportExport));
  const initial = await page.evaluate(() => {
    const api = window.VildaDataImportExport;
    // The immutable RED runtime predates this public observer; retain its
    // existing live-flag checks without inventing a successful settlement.
    return typeof api.whenInitialMainSessionRestoreSettled === 'function'
      ? api.whenInitialMainSessionRestoreSettled() : null;
  });
  if (initial) expect(initial.ready, 'initial main-session restore has completed successfully').toBe(true);
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
    && !document.documentElement.classList.contains('vilda-auth-locked')
    && window.VildaSaveStatusIndicator && window.VildaDataImportExport
    && !window.__vildaPersistRestoring && !window.__vildaLustroWpis
    && !window.VildaDataImportExport.isMainSessionRestorePending()
    && !window.VildaDataImportExport.isMainSessionAutosavePaused()
    && !window.VildaPersistence.isAutosaveSuppressed()
    && !window.VildaDobAge?.restorePending?.());
}

export async function prepareDocProUserFlow(owner) {
  // Existing DocPro/shell fixtures wait for its own persistence boot, then grant
  // the fictional entitlement and acknowledge the actual professional overlay.
  await readyClearPage(owner);
  await owner.waitForFunction(() => window.VildaInit?.isInitialized('app:professional-module')
    && window.VildaDocproStatePersistence?.isReady()
    && !window.VildaDocproStatePersistence.isRestoring());
  await owner.evaluate(() => {
    window.VildaProAccess.__setTokenModeForTest(false);
    window.VildaProAccess.setPlan('pro', '2099-12-31T23:59:59.000Z');
  });
  const confirmation = owner.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await expect(owner.locator('#professionalOverlay')).toBeHidden();
  await readyClearPage(owner);
}

export async function openPuberty(page, sex = 'M', optional = false) {
  if (await page.locator('#sex').inputValue() !== sex) await page.locator('#sex').selectOption(sex);
  if (await page.locator('#tannerToggleBtn').getAttribute('aria-expanded') !== 'true') await page.locator('#tannerToggleBtn').click();
  if (optional && !await page.locator('#pubertyOptionalDetails').evaluate(el => el.open)) {
    await page.locator('#pubertyOptionalDetails > summary').click();
  }
  await page.waitForFunction(() => window.__clearDebounceProbe.pending() === 0);
}

export const stage = (page, axis, value) => page.locator(`.vpa-segments [data-puberty-axis="${axis}"][data-puberty-stage="${value}"]`);

export async function patientState(page) {
  return page.evaluate(() => {
    const persistence = window.VildaPersistence;
    const controls = [...document.querySelectorAll('input[id],select[id],textarea[id]')]
      .filter(el => !el.closest('.vug-backdrop'))
      .map(el => [el.id, el.value, el.checked]);
    return { controls,
      puberty: window.VildaPubertyAssessmentState?.capture(),
      activity: window.VildaPubertyAssessmentState?.getActivityRevision?.(),
      main: persistence.readMainSession(), shared: persistence.readShared(), clcr: persistence.readClcrSession(),
      patientId: sessionStorage.getItem('vildaCurrentPatientId'),
      choice: sessionStorage.getItem('vildaLoadChoiceV1'),
      reference: window.VildaSaveStatusIndicator.getReferenceFingerprint(),
    };
  });
}

async function auditSynchronousCurrentDecision(page) {
  const evidence = await page.evaluate(() => {
    const indicator = window.VildaSaveStatusIndicator;
    if (typeof indicator.getCurrentDecision !== 'function') return { available: false };
    const rows = storage => Object.fromEntries(Object.keys(storage).sort().map(key => [key, storage.getItem(key)]));
    const snapshot = () => ({ local: rows(localStorage), session: rows(sessionStorage),
      reference: indicator.getReferenceFingerprint(), activity: window.VildaPubertyAssessmentState.getActivityRevision(),
      controls: [...document.querySelectorAll('input,select,textarea')].map(el => [el.id, el.value, el.checked]),
      timers: window.__clearDebounceProbe.snapshot(),
    });
    const before = snapshot(), writes = [], restores = [];
    const prototypes = new Set([window.Storage.prototype, window.top.Storage.prototype]);
    for (const prototype of prototypes) for (const name of ['setItem', 'removeItem', 'clear']) {
      const original = prototype[name];
      prototype[name] = function (...args) { writes.push({ method: name, key: args[0] }); return original.apply(this, args); };
      restores.push(() => { prototype[name] = original; });
    }
    let decision;
    try { decision = indicator.getCurrentDecision(); }
    finally { restores.forEach(restore => restore()); }
    return { available: true, decision: { ready: decision.ready, state: decision.state }, before, after: snapshot(), writes };
  });
  // This observation is optional on the immutable old runtime. The RED is the
  // actual lost confirmation/data, never an absent new API.
  if (evidence.available) {
    expect(evidence.writes).toEqual([]);
    expect(evidence.after).toEqual(evidence.before);
    await test.info().attach('synchronous-current-decision-zero-observable-mutations', {
      body: JSON.stringify(evidence, null, 2), contentType: 'application/json',
    });
  }
}

async function expectPatientUnchangedAfterNativeAction(page, before) {
  const after = await patientState(page);
  const clinical = state => {
    const value = structuredClone(state);
    delete value.activity;
    if (value.puberty) delete value.puberty.activityRevision;
    return value;
  };
  expect(clinical(after)).toEqual(clinical(before));
  if (after.activity !== before.activity) {
    const events = await page.evaluate(() => window.__clearInputActivity);
    // A number input commits a trusted change on blur during the native click.
    // Account for that real input lifecycle separately from the pure getter.
    expect(events.some(event => event.trusted && ['input', 'change'].includes(event.type)
      && event.before >= before.activity && event.after === after.activity)).toBe(true);
    await test.info().attach('native-input-activity-revision', { body: JSON.stringify({
      before: before.activity, after: after.activity, events,
    }, null, 2), contentType: 'application/json' });
  }
}

export async function proveStaleDebounceWindow(page, requiredOwner) {
  // Drain the unrelated production shared autosave; the three main/status
  // callbacks remain delayed. No wall-clock click deadline or sleep is used.
  await page.waitForFunction(() => {
    const snapshot = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return snapshot && !snapshot.hasPendingSaveTimer && !snapshot.hasPendingForceSaveTimer
      && !snapshot.hasPendingElementRefreshTimer;
  });
  await page.waitForFunction(owner => {
    const rows = window.__clearDebounceProbe.snapshot();
    return [owner, 'status400'].every(source => rows.some(row => row.owner === source && row.held && !row.cancelled));
  }, requiredOwner);
  const evidence = await page.evaluate(() => ({ timers: window.__clearDebounceProbe.snapshot(),
    cachedState: window.VildaSaveStatusIndicator.getState(),
    user: window.VildaPersistence.readMainSession()?.user || null,
    puberty: window.VildaPersistence.readMainSession()?.puberty || null,
    height: document.getElementById('height').value, weight: document.getElementById('weight').value,
    age: document.getElementById('age').value, name: document.getElementById('name')?.value || '',
    unlocked: window.VildaVault.isUnlocked(),
  }));
  expect(evidence.cachedState).toBe('hidden');
  expect(evidence.unlocked).toBe(true);
  expect([evidence.height, evidence.weight, evidence.age, evidence.name]).toEqual(['', '', '', '']);
  expect(evidence.user?.pubertyAssessment).toBeUndefined();
  expect(evidence.puberty).toBeNull();
  expect(evidence.timers.filter(row => row.armed && row.executed)).toEqual([]);
  await test.info().attach('real-edit-before-delayed-autosave-status', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
}

export async function expectPubertyCleared(page) {
  const values = await page.evaluate(() => ['tannerStage', 'pubertyOnsetAge', 'pubertyMenarcheAge',
    'pubertyMenarcheHeight', 'pubertyMenarcheBoneAge', 'pubertyGnrhaStatus', 'pubertyGnrhaStartAge',
    'pubertyGnrhaStopAge', 'pubertyCdgp'].map(id => document.getElementById(id)?.value || ''));
  expect(values).toEqual(Array(9).fill(''));
  expect(await page.evaluate(() => window.VildaPubertyAssessmentState.capture().present)).toBe(false);
  await expect(page.locator('#tannerToggleBtn')).toHaveAttribute('aria-expanded', 'false');
}

export async function cancelThenDiscard(page, { invalidSave = false, catchUpDebounce = false } = {}) {
  await auditSynchronousCurrentDecision(page);
  const before = await patientState(page);
  await page.locator('#clearAllDataBtn').click();
  const dialog = page.getByRole('dialog', { name: CLEAR_DIALOG });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => window.__clearTrustedClicks.at(-1).trusted)).toBe(true);
  await expectPatientUnchangedAfterNativeAction(page, before);
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expectPatientUnchangedAfterNativeAction(page, before);
  await page.locator('#clearAllDataBtn').click();
  await expect(dialog).toBeVisible();
  if (catchUpDebounce) {
    await page.evaluate(() => window.__clearDebounceProbe.release());
    await page.waitForFunction(() => window.__clearDebounceProbe.pending() === 0);
    const journal = await page.evaluate(() => window.__clearDebounceProbe.snapshot());
    expect(journal.some(row => row.executed && row.owner === 'puberty300')).toBe(true);
    expect(journal.some(row => row.executed && row.owner === 'status400')).toBe(true);
    await expect(dialog).toBeVisible();
    await expect(stage(page, 'P', 3)).toHaveAttribute('aria-pressed', 'true');
    await test.info().attach('normal-debounce-catch-up-while-reading-clear-dialog', {
      body: JSON.stringify(journal, null, 2), contentType: 'application/json',
    });
  }
  if (invalidSave) {
    await dialog.getByRole('button', { name: 'Zapisz nowego i wyczyść', exact: true }).click();
    // Existing policy: without a name, return to its field so it can be entered.
    // This is not a successful save and must never authorize clearing the draft.
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement.id)).toMatch(/^(lastName|firstName|name)$/u);
    await expectPatientUnchangedAfterNativeAction(page, before);
    expect(await page.evaluate(async () => (await window.VildaVault.listPatients()).length)).toBe(0);
    await page.locator('#clearAllDataBtn').click();
    await expect(dialog).toBeVisible();
  }
  await dialog.getByRole('button', { name: /^Odrzuć (dane|zmiany) i wyczyść$/u }).click();
  await expect(dialog).toHaveCount(0);
  await expectPubertyCleared(page);
  await page.evaluate(() => window.__clearDebounceProbe.release());
  await page.waitForFunction(() => window.__clearDebounceProbe.pending() === 0);
  await expectPubertyCleared(page);
}

export async function fillValidPatient(page, firstName = 'Alicja Wyczyść') {
  for (const [id, value] of Object.entries({ lastName: 'Fikcyjna', firstName, age: '12', ageMonths: '0', height: '150', weight: '40' })) {
    await page.locator('#' + id).fill(value);
  }
}

export async function holdRealSaveReturn(page) {
  await page.evaluate(() => {
    const vault = window.VildaVault, original = vault.savePatient;
    const probe = window.__clearSaveProbe = { holdNext: true, pending: false, savedId: null, returned: false, receiptFinished: false, clears: 0, actualClears: 0 };
    let release;
    window.addEventListener('vilda:user-state-cleared', () => { probe.clears++; });
    vault.savePatient = async function (...args) {
      const held = probe.holdNext;
      if (held) probe.holdNext = false;
      const result = await original.apply(vault, args);
      if (held) {
        probe.savedId = result.patientId; probe.pending = true;
        await new Promise(resolve => { release = resolve; });
        probe.returned = true;
      }
      return result;
    };
    const importer = window.VildaDataImportExport, receipt = importer.saveUserDataWithReceipt;
    const clear = importer.clearAllData;
    // Legacy Clear listeners can emit multiple notifications after the adapter's
    // 150 ms deduplication window. Count the real public Clear entry separately.
    importer.clearAllData = function (...args) {
      probe.actualClears++;
      return clear.apply(this, args);
    };
    if (typeof receipt === 'function') importer.saveUserDataWithReceipt = async function (...args) {
      try { return await receipt.apply(importer, args); }
      finally { probe.receiptFinished = true; }
    };
    probe.release = () => release();
  });
}

export async function finishOwnReceipt(page) {
  await page.evaluate(() => window.__clearSaveProbe.release());
  await page.waitForFunction(() => window.__clearSaveProbe.receiptFinished);
  await page.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); }));
}

export { loadPatient };
