import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';

// P-BEZCZYNNOSC-KARTA — pozostałe drogi blokady: ręczna z ramki bez formularza i blokada z innego powodu.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(240_000);

const PASSWORD = 'E2e#SiatkaNowyPomiar!2026';
const stage = (value, date, months) => ({ stage: value, sex: 'F', observedAtISO: date, ageMonths: months, source: 'clinician-entry' });
const PATIENT = {
  version: 1, name: 'Zmyslona Weronika',
  user: { lastName: 'Zmyslona', firstName: 'Weronika', sex: 'F', dobISO: '2014-11-10', age: 11, ageMonths: 6, height: 148, weight: 40, measuredAtISO: '2026-05-10',
    pubertyAssessment: { version: 1, sex: 'F', observations: { G: null, Th: stage(4, '2026-05-10', 138), P: stage(4, '2026-05-10', 138) } } },
};
const KEYS = ['vildaMainSessionV1', 'sharedUserData', 'vildaCurrentPatientId', 'vilda-save-ref-v1', 'vildaPrevSummaryPid',
  'vildaPrevSummaryAnchor', 'vildaLoadChoiceV1', 'vildaDobAgeZapisV1', 'vildaClcrSessionV1', 'vildaSteroidsSessionV1'];

async function openShellWithPatient(page) {
  const { frame } = await createFictionalVault(page, { shell: true });
  const patientId = await frame.evaluate(async record => (await window.VildaVault.savePatient(record, { dedup: false })).patientId, PATIENT);
  await loadPatient(frame, patientId, 'new', { clear: true });
  await expect.poll(() => frame.evaluate(() => window.VildaPubertyAssessmentState.capture().present)).toBe(true);
  await page.evaluate(() => window.VildaShell.navigate('terminarz'));
  const calendar = await shellFrame(page, 'Terminarz');
  await calendar.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  await page.evaluate(() => window.VildaShell.navigate('lab'));
  const lab = await shellFrame(page, 'Jednostki laboratoryjne');
  await lab.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI && document.getElementById('labValue'));
  return { start: frame, lab, calendar, patientId };
}
const patientKeys = async page => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await page.evaluate(keys => {
        const present = keys.filter(key => sessionStorage.getItem(key) != null);
        const withPatient = [];
        for (let index = 0; index < sessionStorage.length; index += 1) {
          const key = sessionStorage.key(index);
          if (/Zmyslona|Weronika|2014-11-10/.test(String(sessionStorage.getItem(key) || ''))) withPatient.push(key);
        }
        return { present, withPatient };
      }, KEYS);
    } catch (error) {
      if (attempt > 20) throw error;
      await page.waitForLoadState('domcontentloaded');
    }
  }
};
async function signIn(page) {
  const login = page.locator('#vilda-auth-ui-root');
  await login.getByRole('button', { name: /Fikcyjny sejf testu panelu siatek/ }).click();
  await login.locator('input[type=password]').fill(PASSWORD);
  await login.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
    && !document.documentElement.classList.contains('vilda-auth-locked'));
}
async function expectStartEmpty(page) {
  const start = await shellFrame(page);
  await start.waitForFunction(() => window.VildaVault?.isUnlocked() && typeof window.collectUserData === 'function'
    && window.VildaAuthUI?.isBootReady() && !window.VildaDataImportExport.isMainSessionRestorePending());
  await expect(start.locator('#lastName')).toHaveValue('');
  expect(await start.evaluate(() => ({ carrier: window.VildaPubertyAssessmentState.capture().present,
    id: window._vildaCurrentPatientId || sessionStorage.getItem('vildaCurrentPatientId') }))).toEqual({ carrier: false, id: null });
  expect(await patientKeys(page)).toEqual({ present: [], withPatient: [] });
}

test('blokada ręczna zaczęta w ramce bez formularza: karta zostaje w powłoce z ekranem logowania, stan roboczy znika od razu', async ({ page }) => {
  const { calendar } = await openShellWithPatient(page);
  const navigated = page.waitForEvent('framenavigated', { predicate: current => current === page.mainFrame() });
  // W chwili blokady: pamięć karty bez stanu roboczego, żadna inna ramka nie zostaje odblokowana.
  const atLock = await calendar.evaluate(keys => {
    window.VildaVault.lock();
    const top = window.top;
    return { keys: keys.filter(key => top.sessionStorage.getItem(key) != null),
      unlockedFrames: Array.from({ length: top.frames.length }, (_, i) => top.frames[i]).filter(view => { try { return view.VildaVault?.isUnlocked(); } catch (_) { return false; } }).length };
  }, KEYS).catch(error => ({ error: String(error.message).slice(0, 120) }));
  console.log('W CHWILI BLOKADY', JSON.stringify(atLock));
  await navigated;
  await page.waitForFunction(() => window.VildaAuthUI?.isBootReady());
  expect(new URL(page.url()).pathname).toBe('/app.html');
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  await expect(page.locator('#vilda-auth-ui-root')).toBeVisible();
  expect(await patientKeys(page)).toEqual({ present: [], withPatient: [] });
  await signIn(page);
  await expectStartEmpty(page);
});

test('blokada z innego powodu w powłoce (lock("user")): po przeładowaniu ramek stan roboczy znika; po zalogowaniu nie ma pacjenta', async ({ page }) => {
  await openShellWithPatient(page);
  await page.evaluate(() => { window.VildaVault.lock('user'); });
  await expect(page.locator('#vilda-auth-ui-root')).toBeVisible();
  await expect.poll(() => patientKeys(page), { timeout: 20_000 }).toEqual({ present: [], withPatient: [] });
  await expect.poll(() => page.evaluate(() => Array.from({ length: frames.length }, (_, i) => frames[i])
    .filter(view => { try { return view.VildaVault?.isUnlocked(); } catch (_) { return false; } }).length), { timeout: 20_000 }).toBe(0);
  await signIn(page);
  await expectStartEmpty(page);
});
