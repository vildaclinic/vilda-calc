import { expect } from './test-czas.mjs';
import { CHWILE } from './czas.mjs';
import { createFictionalVault, loadPatient, shellFrame } from './centile-live-fixture.mjs';

// P-BEZCZYNNOSC-KARTA — wspólne przygotowanie i odczyty testów „jedna karta przeglądarki = jedna sesja pracy”.
// Prawdziwa powłoka app.html, prawdziwy sejf, moduł konta i ramki paneli; wyłącznie fikcyjne konto
// (createFictionalVault) i fikcyjna pacjentka w efemerycznym profilu.
//
// Zegar strony startuje z ustalonej chwili i biegnie normalnym tempem (test-czas.mjs); skracany jest tylko
// limit bezczynności, jak w hormone-lifespan-activity.spec.mjs. Chwila jest przypięta do domyślnej także
// w przebiegach macierzowych (VILDA_CHWILA): ocena pokwitania pacjentki z 2026-05-10 jest wobec niej świeża
// (reguła 12 miesięcy), więc „Jednostki lab.” pokazują „Th IV” niezależnie od dnia uruchomienia testu.
export const TAB_TEST_OPTIONS = { serviceWorkers: 'block', reducedMotion: 'reduce', chwila: CHWILE.zwykla };

// Hasło fikcyjnego sejfu zakładanego przez createFictionalVault (centile-live-fixture.mjs).
const PASSWORD = 'E2e#SiatkaNowyPomiar!2026';
const stage = (value, date, months) => ({ stage: value, sex: 'F', observedAtISO: date, ageMonths: months, source: 'clinician-entry' });
const PATIENT = {
  version: 1, name: 'Zmyslona Weronika',
  user: {
    lastName: 'Zmyslona', firstName: 'Weronika', sex: 'F', dobISO: '2014-11-10', age: 11, ageMonths: 6,
    height: 148, weight: 40, measuredAtISO: '2026-05-10',
    pubertyAssessment: { version: 1, sex: 'F', observations: { G: null, Th: stage(4, '2026-05-10', 138), P: stage(4, '2026-05-10', 138) } },
  },
};

// Stan roboczy pacjenta w pamięci karty: sesje formularzy i znaczniki wczytanego pacjenta.
export const STATE_KEYS = ['vildaMainSessionV1', 'sharedUserData', 'vildaCurrentPatientId', 'vilda-save-ref-v1', 'vildaPrevSummaryPid',
  'vildaPrevSummaryAnchor', 'vildaLoadChoiceV1', 'vildaDobAgeZapisV1', 'vildaClcrSessionV1', 'vildaSteroidsSessionV1'];
// Zapis sesji sejfu w karcie.
export const SESSION_RECORD = 'vilda-vault-session-v2';
// Własne klucze testu w pamięci karty (dziennik blokad przeżywa nawigację dokumentu głównego).
const LOCK_LOG = '__e2eTabLocks';

// Powłoka z zalogowanym fikcyjnym kontem, pacjentką wczytaną z bazy i trzema panelami: Start, Terminarz
// i „Jednostki laboratoryjne” z wynikiem ocenianym wg stadium wczytanej pacjentki.
export async function openShellWithPatient(page) {
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
  await lab.locator('#labSubstance').fill('Estradiol');
  await lab.locator('#labSubstanceDropdown [data-id="estradiol"]').click();
  await lab.locator('#labValue').fill('40');
  // Punkt wyjścia: norma dobrana wg stadium wczytanej pacjentki.
  await expect(lab.locator('#labPatientText')).toContainText('Th IV');
  // Powłoka i trzy ramki mają własny sejf, własny licznik i własny moduł konta.
  await page.waitForFunction(() => [window, ...Array.from({ length: window.frames.length }, (_, index) => window.frames[index])]
    .filter(view => { try { return view.VildaVault?.isUnlocked() && view.VildaAuthUI; } catch (_) { return false; } }).length >= 4);
  return { start: frame, calendar, lab, patientId };
}

// Odczyt z dokumentu głównego, który po blokadzie bywa właśnie w trakcie nawigacji na ekran logowania.
async function readTab(page, read, argument) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await page.evaluate(read, argument);
    } catch (error) {
      const navigating = /Execution context was destroyed|Cannot find context with specified id|Inspected target navigated|Frame was detached/.test(error.message);
      if (attempt >= 20 || !navigating) throw error;
      await page.waitForLoadState('domcontentloaded');
    }
  }
}

// Stan karty: klucze stanu roboczego, wartości niosące dane fikcyjnej pacjentki (po treści — odporne na nowe
// klucze), zapis sesji sejfu i liczba odblokowanych dokumentów (dokument główny i jego ramki).
export function tabState(page, patientId = '') {
  return readTab(page, ({ keys, id, sessionRecord }) => {
    const withPatient = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index), value = String(sessionStorage.getItem(key) || '');
      if (key.startsWith('__e2e')) continue;
      if (/Zmyslona|Weronika|2014-11-10/.test(value) || (id && value.includes(id))) withPatient.push(key);
    }
    const unlocked = [window, ...Array.from({ length: window.frames.length }, (_, index) => window.frames[index])]
      .filter(view => { try { return view.VildaVault?.isUnlocked(); } catch (_) { return false; } }).length;
    return { keys: keys.filter(key => sessionStorage.getItem(key) != null), withPatient,
      session: sessionStorage.getItem(sessionRecord) != null, unlocked };
  }, { keys: STATE_KEYS, id: patientId, sessionRecord: SESSION_RECORD });
}
export const TAB_ENDED = { keys: [], withPatient: [], session: false, unlocked: 0 };

// Karta po końcu sesji: wszystkie dokumenty zablokowane, bez zapisu sesji i bez stanu roboczego pacjentki.
export async function expectTabEnded(page, patientId) {
  await expect.poll(() => tabState(page, patientId), { timeout: 20_000, intervals: [100, 250, 500] }).toEqual(TAB_ENDED);
}

// Dziennik blokad wszystkich dokumentów karty i — opcjonalnie — skrócony limit bezczynności: we wszystkich
// dokumentach albo tylko w ramce o podanym tytule. Bez idleMs sam dziennik.
export async function watchTabLocks(page, { idleMs = null, onlyFrame = null, patientId = '' } = {}) {
  await page.evaluate(({ timeout, onlyFrame, id, logKey }) => {
    sessionStorage.removeItem(logKey);
    const all = [window, ...Array.from({ length: window.frames.length }, (_, index) => window.frames[index])];
    for (const view of all) {
      const vault = view.VildaVault;
      if (!vault?.isUnlocked()) continue;
      // Nasłuch dopisany po nasłuchach aplikacji: zapisuje stan karty po obsłudze blokady w tym dokumencie.
      vault.onLock(reason => {
        const log = JSON.parse(sessionStorage.getItem(logKey) || '[]');
        const unlockedLeft = all.filter(other => { try { return other.VildaVault?.isUnlocked(); } catch (_) { return false; } }).length;
        const patientKeys = Object.keys(sessionStorage).filter(key => {
          const value = String(sessionStorage.getItem(key));
          return !key.startsWith('__e2e') && (/Zmyslona|Weronika|2014-11-10/.test(value) || (id && value.includes(id)));
        });
        log.push({ path: view.location.pathname, reason, at: Date.now(), unlockedLeft, patientKeys });
        sessionStorage.setItem(logKey, JSON.stringify(log));
      });
      if (timeout == null || (onlyFrame && view.frameElement?.title !== onlyFrame)) continue;
      vault.DEFAULT_IDLE_LOCK_MS = timeout;
      vault.startIdleTimer(timeout);
    }
  }, { timeout: idleMs, onlyFrame, id: patientId, logKey: LOCK_LOG });
}
export const tabLocks = page => readTab(page, logKey => JSON.parse(sessionStorage.getItem(logKey) || '[]'), LOCK_LOG);
export async function waitForTabLock(page, timeout) {
  await expect.poll(async () => (await tabLocks(page)).length, { timeout, intervals: [100, 250] }).toBeGreaterThan(0);
}

// Sejfy wszystkich dokumentów karty, które go mają: true = odblokowany.
export const unlockedVaults = page => page.evaluate(() => [window, ...Array.from({ length: window.frames.length }, (_, index) => window.frames[index])]
  .filter(view => { try { return view.VildaVault; } catch (_) { return false; } }).map(view => view.VildaVault.isUnlocked()));

// Skraca limit bezczynności w każdym odblokowanym dokumencie karty; zwraca ich liczbę.
export const shortenIdle = (page, idleMs) => page.evaluate(timeout => {
  let count = 0;
  for (const view of [window, ...Array.from({ length: window.frames.length }, (_, index) => window.frames[index])]) {
    const vault = view.VildaVault;
    if (!vault?.isUnlocked()) continue;
    vault.DEFAULT_IDLE_LOCK_MS = timeout;
    vault.startIdleTimer(timeout);
    count += 1;
  }
  return count;
}, idleMs);

// Logowanie fikcyjnego konta na ekranie logowania dokumentu głównego (powłoka albo samodzielny index.html).
export async function signIn(page) {
  const login = page.locator('#vilda-auth-ui-root');
  await login.getByRole('button', { name: /Fikcyjny sejf testu panelu siatek/ }).click();
  await login.locator('input[type=password]').fill(PASSWORD);
  await login.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
    && !document.documentElement.classList.contains('vilda-auth-locked'));
}

// Formularz Start po zalogowaniu: ramka powłoki albo — gdy karta jest na index.html — dokument główny.
export async function startForm(page) {
  const start = /\/index\.html$/.test(new URL(page.url()).pathname) ? page : await shellFrame(page);
  await start.waitForFunction(() => window.VildaVault?.isUnlocked() && typeof window.collectUserData === 'function'
    && window.VildaAuthUI?.isBootReady() && !window.VildaDataImportExport.isMainSessionRestorePending());
  return start;
}

// Po zalogowaniu: pusty formularz, brak oceny pokwitania i wczytanego pacjenta, pamięć karty bez danych pacjentki.
export async function expectNoPatientAfterSignIn(page, patientId) {
  const start = await startForm(page);
  await expect(start.locator('#lastName')).toHaveValue('');
  expect(await start.evaluate(() => ({ carrier: window.VildaPubertyAssessmentState.capture().present,
    id: window._vildaCurrentPatientId || sessionStorage.getItem('vildaCurrentPatientId') }))).toEqual({ carrier: false, id: null });
  expect((await tabState(page, patientId)).withPatient).toEqual([]);
}
