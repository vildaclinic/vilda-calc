import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';

// P-BEZCZYNNOSC-KARTA — przepływy, których poprawka nie może zmienić, oraz drogi bez zdarzenia blokady.
// Prawdziwa powłoka app.html, fikcyjne konto i fikcyjna pacjentka; czas rzeczywisty.
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
  await shellFrame(page, 'Terminarz');
  await page.evaluate(() => window.VildaShell.navigate('lab'));
  const lab = await shellFrame(page, 'Jednostki laboratoryjne');
  await lab.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI && document.getElementById('labValue'));
  await lab.locator('#labSubstance').fill('Estradiol');
  await lab.locator('#labSubstanceDropdown [data-id="estradiol"]').click();
  await lab.locator('#labValue').fill('40');
  await expect(lab.locator('#labPatientText')).toContainText('Th IV');
  return { start: frame, lab, patientId };
}
const patientKeys = page => page.evaluate(keys => {
  const present = keys.filter(key => sessionStorage.getItem(key) != null);
  const withPatient = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (/Zmyslona|Weronika|2014-11-10/.test(String(sessionStorage.getItem(key) || ''))) withPatient.push(key);
  }
  return { present, withPatient };
}, KEYS);
async function signIn(page) {
  const login = page.locator('#vilda-auth-ui-root');
  await login.getByRole('button', { name: /Fikcyjny sejf testu panelu siatek/ }).click();
  await login.locator('input[type=password]').fill(PASSWORD);
  await login.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
    && !document.documentElement.classList.contains('vilda-auth-locked'));
}

test('F5 przy odblokowanym sejfie zachowuje pacjentkę razem z oceną Th', async ({ page }) => {
  await openShellWithPatient(page);
  await page.reload({ waitUntil: 'load' });
  const start = await shellFrame(page);
  await start.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
    && typeof window.collectUserData === 'function' && !window.VildaDataImportExport.isMainSessionRestorePending());
  await expect(start.locator('#lastName')).toHaveValue('Zmyslona');
  await expect.poll(() => start.evaluate(() => {
    const carrier = window.VildaPubertyAssessmentState.capture();
    const user = window.collectUserData({ source: 'e2e' }).user || {};
    return { present: carrier.present, th: user.pubertyAssessment?.observations?.Th?.stage ?? null };
  })).toEqual({ present: true, th: 4 });
  // Ramki dociągane w tle odtwarzają sesję chwilę po dokumencie głównym.
  await expect.poll(() => page.evaluate(() => [window, ...Array.from({ length: frames.length }, (_, i) => frames[i])]
    .filter(view => view.VildaVault).every(view => view.VildaVault.isUnlocked()))).toBe(true);
});

test('jeden prawdziwy klawisz w ramce odświeża każdy dokument karty dokładnie raz; zdarzenie syntetyczne zostaje lokalne', async ({ page }) => {
  const { lab } = await openShellWithPatient(page);
  await page.evaluate(() => {
    window.__resets = {};
    for (const view of [window, ...Array.from({ length: frames.length }, (_, i) => frames[i])]) {
      const vault = view.VildaVault; if (!vault?.isUnlocked()) continue;
      const name = view.location.pathname; window.__resets[name] = 0;
      const original = vault.resetIdleTimer;
      vault.resetIdleTimer = function () { window.top.__resets[name] += 1; return original.apply(this, arguments); };
    }
  });
  await lab.locator('#labValue').focus();
  await page.evaluate(() => { for (const key of Object.keys(window.__resets)) window.__resets[key] = 0; });
  await page.keyboard.press('End');
  const real = await page.evaluate(() => ({ ...window.__resets }));
  expect(Object.keys(real).length).toBeGreaterThanOrEqual(4);
  expect(Object.values(real).every(count => count === 1)).toBe(true);
  await page.evaluate(() => { for (const key of Object.keys(window.__resets)) window.__resets[key] = 0; });
  await lab.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true })));
  const synthetic = await page.evaluate(() => ({ ...window.__resets }));
  expect(synthetic['/przelicznik-jednostek.html']).toBe(1);
  expect(Object.entries(synthetic).filter(([name]) => name !== '/przelicznik-jednostek.html').every(([, count]) => count === 0)).toBe(true);
});

test('karta odświeżona po terminie sesji: stan roboczy znika przed logowaniem, także gdy skrypt formularza dochodzi późno', async ({ page, context }) => {
  await openShellWithPatient(page);
  expect((await patientKeys(page)).withPatient.length).toBeGreaterThan(0);
  await page.evaluate(() => {
    const key = 'vilda-vault-session-v2', record = JSON.parse(sessionStorage.getItem(key));
    record.expiresAtISO = new Date(Date.now() - 60_000).toISOString();
    sessionStorage.setItem(key, JSON.stringify(record));
  });
  // Niekorzystna kolejność: reset formularza (clearAllData) pojawia się długo po starcie modułu konta.
  await context.route('**/vilda_data_import_export.js*', async route => { await new Promise(done => { setTimeout(done, 2500); }); await route.continue(); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.VildaAuthUI?.isBootReady());
  await expect.poll(() => patientKeys(page), { timeout: 20_000 }).toEqual({ present: [], withPatient: [] });
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  await context.unroute('**/vilda_data_import_export.js*');
  await signIn(page);
  const start = await shellFrame(page);
  await start.waitForFunction(() => window.VildaVault?.isUnlocked() && typeof window.collectUserData === 'function'
    && window.VildaAuthUI?.isBootReady() && !window.VildaDataImportExport.isMainSessionRestorePending());
  await expect(start.locator('#lastName')).toHaveValue('');
  expect(await start.evaluate(() => ({ carrier: window.VildaPubertyAssessmentState.capture().present,
    id: window._vildaCurrentPatientId || sessionStorage.getItem('vildaCurrentPatientId') }))).toEqual({ carrier: false, id: null });
  expect(await patientKeys(page)).toEqual({ present: [], withPatient: [] });
});

test('gość w powłoce → „Zaloguj się” → logowanie: dane wpisane przez gościa zostają', async ({ page }) => {
  // Konto istnieje, ale karta pracuje bez logowania.
  await createFictionalVault(page, { shell: true });
  await page.evaluate(() => window.VildaVault.lock('manual'));
  await expect(page).toHaveURL(/\/index\.html$/u);
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  await expect(guest).toBeVisible();
  await guest.click();
  await page.waitForFunction(() => window.VildaGuestMode === true && !document.documentElement.classList.contains('vilda-auth-locked'));
  const start = await shellFrame(page);
  const guestInFrame = start.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  await start.waitForFunction(() => window.VildaAuthUI?.isBootReady());
  if (await guestInFrame.isVisible()) await guestInFrame.click();
  await start.waitForFunction(() => window.VildaGuestMode === true && typeof window.collectUserData === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  // Wejście w tryb gościa czyści formularz i na chwilę wstrzymuje autozapis; wpisujemy dopiero po tym oknie.
  await start.waitForFunction(() => !window.__vildaPersistRestoring && !window.VildaDataImportExport.isMainSessionRestorePending()
    && !window.VildaDataImportExport.isMainSessionAutosavePaused() && !window.VildaPersistence.isAutosaveSuppressed());
  await start.locator('#lastName').fill('Goscinny');
  await start.locator('#firstName').fill('Fikcyjny');
  await start.locator('#age').fill('31');
  await start.locator('#height').fill('171');
  await start.locator('#weight').fill('71');
  await start.locator('#weight').press('Tab');
  await expect.poll(() => page.evaluate(() => /Goscinny/.test(String(sessionStorage.getItem('vildaMainSessionV1')))), { timeout: 20_000 }).toBe(true);
  const cleared = [];
  await page.exposeFunction('__guestCleared', source => cleared.push(source));
  await start.evaluate(() => window.addEventListener('vilda:user-state-cleared', event => window.top.__guestCleared(event.detail?.source || '')));
  await page.locator('button.chrome-menu-logout:visible').first().click();
  await expect(page.locator('#vilda-auth-ui-root')).toBeVisible();
  await signIn(page);
  const after = await shellFrame(page);
  await after.waitForFunction(() => window.VildaVault?.isUnlocked() && typeof window.collectUserData === 'function'
    && window.VildaAuthUI?.isBootReady() && !window.VildaDataImportExport.isMainSessionRestorePending());
  await page.waitForTimeout(3000);
  // Stan roboczy gościa zostaje w pamięci karty; żaden krok końca sesji go nie czyści.
  expect(await page.evaluate(() => {
    const raw = String(sessionStorage.getItem('vildaMainSessionV1'));
    return { name: /Goscinny/.test(raw), height: /171/.test(raw) };
  })).toEqual({ name: true, height: true });
  expect(cleared).toEqual([]);
  const form = await (await shellFrame(page)).evaluate(() => ({ lastName: document.getElementById('lastName').value,
    age: document.getElementById('age').value, height: document.getElementById('height').value }));
  console.log('FORMULARZ PO ZALOGOWANIU', JSON.stringify(form), 'ramka wymieniona:', after !== start);
  expect(form).toEqual({ lastName: 'Goscinny', age: '31', height: '171' });
});
