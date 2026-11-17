import { expect } from '@playwright/test';
import { czekajNaOdtworzenieSesji } from './sesja-czekanie.mjs';

// Wyłącznie syntetyczny sejf w efemerycznym profilu. Helper nie narzuca
// zegara ani service workers: wspólny również dla prawdziwych testów PWA.

const PASSWORD = 'E2e#SiatkaNowyPomiar!2026';
export const NOTE_A = 'E2E-LIVE-A';
export const NOTE_B = 'E2E-LIVE-B';
const HISTORY = [
  { ageMonths: 84, height: 123.6, weight: 23.9 },
  { ageMonths: 108, height: 135, weight: 29.9 },
  { ageMonths: 120, height: 141, weight: 33 },
  { ageMonths: 144, height: 153, weight: 40 },
];

export function fictionalPatient({ firstName = 'Antoni', sex = 'M', age = 13, height = 158, weight = 46, note = NOTE_A } = {}) {
  return {
    version: 1, name: `Fikcyjny ${firstName}`,
    user: {
      lastName: 'Fikcyjny', firstName, sex, age, ageMonths: 0, height, weight,
      dobISO: `${2026 - age}-06-17`, measuredAtISO: '2026-06-17',
    },
    advanced: {
      name: `Fikcyjny ${firstName}`, motherHeight: 165, fatherHeight: 180,
      data: {
        name: `Fikcyjny ${firstName}`, sex, currentAgeMonths: age * 12,
        currentHeight: height, currentWeight: weight, motherHeight: 165, fatherHeight: 180,
        measurements: HISTORY.map(row => ({ ...row })),
      },
    },
    zscore: { resultsMode: true, dataSource: 'OLAF' },
    chartCreator: {
      growth: {
        version: 1, shared: {}, layout: { height: {}, weight: {} },
        free: {
          height: [{ id: 901, ageMonths: 108, value: 135, txt: note, arrow: false }],
          weight: [],
        },
      },
    },
  };
}

export async function fixturePreferences(page) {
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    localStorage.setItem('analyticsConsent', 'denied');
    localStorage.setItem('pwzNumber', '0000000');
    const proForFictionalAccount = () => {
      const access = window.VildaProAccess;
      if (!access) return;
      access.__setTokenModeForTest(false);
      access.setPlan('pro', '2099-12-31T23:59:59.000Z');
    };
    document.addEventListener('DOMContentLoaded', proForFictionalAccount, { once: true });
    document.addEventListener('vilda:session-changed', proForFictionalAccount);
    window.__siatkaE2eLifecycle = [];
    document.addEventListener('DOMContentLoaded', () => {
      window.VildaCentileLiveData?.subscribe(event => {
        window.__siatkaE2eLifecycle.push({
          ...event, now: Date.now(),
          patientId: sessionStorage.getItem('vildaCurrentPatientId'),
          mode: sessionStorage.getItem('vildaLoadChoiceV1'),
          applying: window.__vildaPersistRestoring, mirror: window.__vildaLustroWpis,
          clearUntil: window.__vildaPersistClearUntil,
          pending: window.VildaDobAge?.restorePending?.(),
        });
        if (window.__siatkaE2eLifecycle.length > 100) window.__siatkaE2eLifecycle.shift();
      });
    }, { once: true });

    // Spy na rzeczywiste rysowanie, bez zastępowania generatora ani wyników klinicznych.
    window.__siatkaE2eTexts = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      if (String(text).startsWith('E2E-LIVE-')) window.__siatkaE2eTexts.push(String(text));
      return fillText.call(this, text, ...args);
    };
  });
}

export async function shellFrame(page, title = 'Start') {
  await page.waitForFunction(name => {
    const iframe = [...document.querySelectorAll('iframe.app-pane')].find(el => el.title === name);
    return iframe?.contentWindow?.VildaVault && iframe.contentDocument?.readyState === 'complete';
  }, title);
  const handle = await page.$(`iframe.app-pane[title="${title}"]`);
  return handle.contentFrame();
}

export async function readyForPatient(frame) {
  await frame.waitForFunction(() => window.VildaVault?.isUnlocked()
    && window.VildaAuthUI?.isBootReady()
    && window.VildaPersistRuntime?.getSnapshot().initialized
    && ['app:main-session-restore-init', 'app:estimated-intake-init', 'app:intake-live-wiring']
      .every(name => window.VildaInit?.isInitialized(name))
    && typeof window.collectUserData === 'function'
    && typeof window.applyLoadedData === 'function' && typeof window.clearAllData === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await czekajNaOdtworzenieSesji(frame);
  await frame.waitForFunction(() => Boolean(window.VildaProAccess));
  await frame.evaluate(() => {
    window.VildaProAccess.__setTokenModeForTest(false);
    window.VildaProAccess.setPlan('pro', '2099-12-31T23:59:59.000Z');
    const mode = document.getElementById('resultsModeToggle');
    if (mode && !mode.checked) {
      mode.checked = true;
      mode.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  // The restore finalizer uses another animation frame and setTimeout(0)
  // after the session helper's two frames. PRO setup can also queue work.
  // Load the patient only after these real startup guards have cleared.
  await frame.waitForFunction(() => !window.__vildaPersistRestoring && !window.__vildaLustroWpis
    && !window.__vildaSuspendIntakeUserReset
    && !window.VildaDataImportExport.isMainSessionRestorePending()
    && !window.VildaDataImportExport.isMainSessionAutosavePaused()
    && !window.VildaPersistence.isAutosaveSuppressed()
    && !window.VildaDobAge.restorePending());
}

export async function createFictionalVault(page, { shell = false, waitForAccountReadyBeforeReload = false } = {}) {
  await fixturePreferences(page);
  await page.goto(shell ? '/app.html#/start' : '/index.html', { waitUntil: 'load' });
  let frame = shell ? await shellFrame(page) : page;
  await frame.waitForFunction(() => Boolean(window.VildaVault));
  const created = await frame.evaluate(password => window.VildaVault.createUser(password, {
    label: 'Fikcyjny sejf testu panelu siatek', iterations: 10000,
  }), PASSWORD);
  // Fixed-date fixtures use the reload to reset temporary clear/autosave guards.
  // Waiting for those timestamp guards before reloading is opt-in.
  if (waitForAccountReadyBeforeReload) {
    // Creating the account in Start also notifies the shell and preloaded panes.
    // Wait for the host and current Start before our one deliberate reload.
    // Read Start through the host on every poll: auth may replace either document.
    await page.waitForFunction(({ shell, userId }) => {
      const authReady = target => Boolean(target?.document.readyState === 'complete'
        && target.VildaVault?.isUnlocked()
        && target.VildaVault.getCurrentUser()?.userId === userId
        && target.VildaAuthUI?.isBootReady()
        && !target.document.documentElement.classList.contains('vilda-auth-locked'));
      const current = shell
        ? document.querySelector('iframe.app-pane[title="Start"]')?.contentWindow : window;
      return authReady(window) && authReady(current)
        && current.VildaPersistRuntime?.getSnapshot().initialized
        && ['app:main-session-restore-init', 'app:estimated-intake-init', 'app:intake-live-wiring']
          .every(name => current.VildaInit?.isInitialized(name))
        && typeof current.collectUserData === 'function'
        && typeof current.applyLoadedData === 'function' && typeof current.clearAllData === 'function'
        && !current.__vildaPersistRestoring && !current.__vildaLustroWpis
        && !current.__vildaSuspendIntakeUserReset
        && current.VildaDataImportExport && !current.VildaDataImportExport.isMainSessionRestorePending()
        && !current.VildaDataImportExport.isMainSessionAutosavePaused()
        && current.VildaPersistence && !current.VildaPersistence.isAutosaveSuppressed()
        && current.VildaDobAge && !current.VildaDobAge.restorePending();
    }, { shell, userId: created.userId });
  }
  await page.reload({ waitUntil: 'load' });
  frame = shell ? await shellFrame(page) : page;
  await readyForPatient(frame);
  const patients = {
    a: fictionalPatient(),
    b: fictionalPatient({ firstName: 'Beata', sex: 'F', age: 12, height: 150, weight: 41, note: NOTE_B }),
  };
  const ids = await frame.evaluate(async records => {
    const result = {};
    for (const [key, payload] of Object.entries(records)) {
      result[key] = (await window.VildaVault.savePatient(payload, { dedup: false })).patientId;
    }
    return result;
  }, patients);
  expect(ids.a).toBeTruthy();
  expect(ids.b).toBeTruthy();
  expect(ids.a).not.toBe(ids.b);
  return { frame, ids, patients };
}

export async function loadPatient(frame, patientId, choice = 'new', { clear = false } = {}) {
  // Like the app's own menu (vilda_chrome.js), open the card only after the auth UI has finished
  // starting and the vault is open. Right after a page navigation, a card opened earlier is
  // silently dropped or closed when the start-up completes, and „Wczytaj tego pacjenta” never shows.
  await expect.poll(() => frame.evaluate(() => {
    const ui = window.VildaAuthUI, vault = window.VildaVault;
    const ready = !ui || typeof ui.isBootReady !== 'function' || ui.isBootReady();
    return !!(ready && vault && typeof vault.isUnlocked === 'function' && vault.isUnlocked());
  })).toBe(true);
  await frame.evaluate(({ patientId, clear }) => {
    if (clear) window.clearAllData();
    window.VildaAuthUI.showPatientCard(patientId, record => {
      if (record) window.applyLoadedData(record);
    }, null);
  }, { patientId, clear });
  await expect.poll(() => frame.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  await frame.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  const choices = frame.locator('#vildaLoadChoiceModal');
  const guard = frame.getByRole('dialog', { name: /^Zapisać (wpisane dane|zmiany) przed wczytaniem\?$/ });
  await expect(choices.or(guard)).toBeVisible();
  if (await guard.isVisible()) {
    await guard.getByRole('button', { name: /^Odrzuć (dane|zmiany) i wczytaj$/ }).click();
    await expect(guard).toHaveCount(0);
  }
  await expect(choices).toBeVisible();
  // A person can pick a choice only after the modal has been painted. By then the
  // page has run what the apply queued before showing it: vilda_dob_age.js accepts
  // the record's age (setTimeout 0, then `vilda:dob-restored` runs a main update)
  // and the rAF-debounced main update runs. Those updates rebuild the age-dependent
  // plan PAL <option>s that Restore writes the saved PAL into. Under page.clock
  // (tests/support/test-czas.mjs) both are fake timers decoupled from rendering, so
  // Playwright could see and click the modal while they were still queued; Restore
  // then wrote into the "nie dotyczy"-only select and the PAL fell back to 1.4.
  // Wait for the age acceptance, then two page frames (fake timers run in
  // callAt/creation order, so the earlier-queued update runs first).
  await frame.waitForFunction(() => !window.VildaDobAge?.restorePending?.());
  await frame.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); }));
  await frame.locator(choice === 'new' ? '#vildaLcmNew' : '#vildaLcmRestore').click();
  await expect(choices).toHaveCount(0);
  await expect.poll(() => frame.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(patientId);
  if (choice === 'new') {
    await expect(frame.locator('#height')).toHaveValue('');
    await expect(frame.locator('#weight')).toHaveValue('');
  }
}

export async function clinicalFingerprint(frame, patientId) {
  return frame.evaluate(async id => {
    const payload = window.collectUserData();
    delete payload.timestampISO; // Wyłącznie czas wykonania eksportu, nie data pomiaru.
    const record = await window.VildaVault.getPatient(id);
    return JSON.parse(JSON.stringify({
      payload,
      creator: window.chartCreatorData,
      vaultSnapshots: record.snapshots,
      dirty: window.VildaSaveStatusIndicator?.getState(),
    }));
  }, patientId);
}
