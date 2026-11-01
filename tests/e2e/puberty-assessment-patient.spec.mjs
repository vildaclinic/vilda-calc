import { expect, test } from '../support/test-czas.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

// Własny zaszyfrowany sejf w efemerycznym kontekście Playwrighta; wyłącznie fikcyjne dane.
// Publiczny ekran wczytania wykonuje applyLoadedData przed patient-loaded. Ta kolejność
// musi poprawnie powiązać przenoszoną ocenę z ID, także po przejściu Start -> DocPro.
test.use({ serviceWorkers: 'block' });

const RAW = {
  version: 1, sex: 'M',
  observations: {
    G: { stage: 3, observedAtISO: '2024-05-12', ageMonths: 137, source: 'fictional-visit' },
    Th: null,
    P: { stage: 2, observedAtISO: null, ageMonths: null, source: null }
  },
  extension: { fictionalMarker: 'preserve-raw-json', values: [1, null, '2'] }
};
const A = { name: 'Fikcyjny Aleksander', user: {
  lastName: 'Fikcyjny', firstName: 'Aleksander', sex: 'M', age: 12, ageMonths: 3,
  height: 150, weight: 40, tannerStage: '3', pubertyAssessment: RAW
} };
const B = { name: 'Probna Beata', user: {
  lastName: 'Probna', firstName: 'Beata', sex: 'F', age: 11, ageMonths: 0,
  height: 140, weight: 35, tannerStage: '1'
} };

async function ready(page) {
  await page.waitForFunction(() => window.VildaVault?.isUnlocked()
    && window.VildaAuthUI && window.VildaPubertyAssessmentState
    && typeof window.collectUserData === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await czekajNaOdtworzenieSesji(page);
}

async function loadPatient(page, id, choice) {
  await page.evaluate(pid => window.VildaAuthUI.showPatientCard(pid, record => {
    if (record) window.applyLoadedData(record);
  }, null), id);
  await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
  await page.locator(choice === 'restore' ? '#vildaLcmRestore' : '#vildaLcmNew').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await expect.poll(() => page.evaluate(pid => window.VildaPubertySource.kontekstPacjenta(pid).status, id)).toBe('ready');
}

const carried = page => page.evaluate(() => window.VildaPubertyAssessmentState.capture());
const collected = page => page.evaluate(() => window.collectUserData().user);
const sessionUser = page => page.evaluate(() => window.VildaPersistence.readMainSession()?.user || null);
const savedUser = (page, id) => page.evaluate(async pid => {
  const record = await window.VildaVault.getPatient(pid);
  return record.snapshots[0].payload.user;
}, id);

test('typowana ocena: wczytanie pacjenta, zapis, Start → DocPro oraz nowa wizyta innej osoby bez odziedziczenia danych', async ({ page, context }) => {
  test.setTimeout(150_000);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol)
      ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    localStorage.setItem('analyticsConsent', 'denied');
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#TypedPuberty!2026', {
    label: 'Fikcyjny sejf kontraktu pokwitania', iterations: 10000
  }));
  await page.reload({ waitUntil: 'load' });
  await ready(page);
  const ids = await page.evaluate(async ({ a, b }) => ({
    a: (await window.VildaVault.savePatient(a, { dedup: false })).patientId,
    b: (await window.VildaVault.savePatient(b, { dedup: false })).patientId
  }), { a: A, b: B });

  await loadPatient(page, ids.a, 'restore');
  expect(await carried(page)).toMatchObject({ present: true, raw: RAW, patientId: ids.a });
  expect((await collected(page)).pubertyAssessment).toEqual(RAW);
  await expect.poll(async () => (await sessionUser(page))?.pubertyAssessment, { timeout: 15000 }).toEqual(RAW);

  // Rzeczywisty kolektor i ścieżka Zapisz; sprawdzamy payload odczytany z szyfrowanego rekordu.
  await page.locator('#height').fill('151');
  expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await expect.poll(async () => Number((await savedUser(page, ids.a)).height)).toBe(151);
  expect((await savedUser(page, ids.a)).pubertyAssessment).toEqual(RAW);

  // Nawigacja strony korzysta z istniejącej pełnej sesji, bez ręcznego ustawiania carrier.
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await ready(page);
  await expect(page.locator('#height')).toHaveValue('151');
  expect(await carried(page)).toMatchObject({ present: true, raw: RAW, patientId: ids.a });
  expect((await collected(page)).pubertyAssessment).toEqual(RAW);

  await loadPatient(page, ids.b, 'new');
  expect(await carried(page)).toMatchObject({ present: false, raw: null, patientId: ids.b });
  expect(await collected(page)).not.toHaveProperty('pubertyAssessment');
  await expect.poll(async () => {
    const user = await sessionUser(page);
    return user && user.firstName === 'Beata' && !Object.hasOwn(user, 'pubertyAssessment');
  }, { timeout: 15000 }).toBe(true);

  // Fikcyjne konto nie ma planu PRO; dalszą edycję wykonujemy w dostępnym formularzu Start.
  await page.goto('/index.html', { waitUntil: 'load' });
  await ready(page);
  expect(await carried(page)).toMatchObject({ present: false, raw: null, patientId: ids.b });
  expect(await collected(page)).not.toHaveProperty('pubertyAssessment');
  await page.locator('#age').fill('11');
  await page.locator('#ageMonths').fill('0');
  await page.locator('#height').fill('141');
  await page.locator('#weight').fill('35');
  expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await expect.poll(async () => Number((await savedUser(page, ids.b)).height)).toBe(141);
  expect(await savedUser(page, ids.b)).not.toHaveProperty('pubertyAssessment');
  expect((await savedUser(page, ids.a)).pubertyAssessment).toEqual(RAW);
});
