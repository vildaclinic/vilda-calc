import { expect, test } from '../support/test-czas.mjs';

// Wyłącznie fikcyjne dane i osobne, efemeryczne konto. Synchronizacja nie jest
// gestem „wstecz”: zachowuje wybraną listę i nie zastępuje nowszej nawigacji.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#ListyNawigacja!26';
const LISTA = 'Ngenla — FIKCYJNA LISTA E2E';
const NAZWISKO = 'Fikcyjny00';

async function ramkaStart(page) {
  await page.waitForFunction(() => {
    const f = document.querySelector('iframe.app-pane[title="Start"]');
    return Boolean(f && f.contentWindow && f.contentWindow.VildaVault && f.contentWindow.VildaAuthUI);
  });
  return (await page.$('iframe.app-pane[title="Start"]')).contentFrame();
}

async function pacjenciWPowloce(page, liczba = 1) {
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date();
    const ymd = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
    localStorage.setItem('vilda-reminders-shown-v1', `${ymd}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${ymd}|${Date.now()}`);
  });
  await page.goto('/app.html', { waitUntil: 'load' });
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
  let start = await ramkaStart(page);
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
  start = await ramkaStart(page);
  await start.waitForFunction(() => window.VildaVault.isUnlocked() && !document.documentElement.classList.contains('vilda-auth-locked'));
  const fixture = await start.evaluate(async ({ count, lista }) => {
    // Ten sam sposób otwarcia funkcji PRO na fikcyjnym koncie co existing testy
    // przypomnień; nie powstaje podpisany token ani połączenie z chmurą.
    window.VildaProAccess.hasAccess = () => true;
    window.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const ids = [];
    for (let n = 0; n < count; n += 1) {
      const nazwisko = `Fikcyjny${String(n).padStart(2, '0')}`;
      const wynik = await window.VildaVault.savePatient({
        name: `${nazwisko} Jan`,
        user: { lastName: nazwisko, firstName: 'Jan', sex: 'M', age: 9, ageMonths: 0, height: 132, weight: 30 },
      }, { dedup: false });
      ids.push(wynik.patientId);
    }
    await window.VildaVault.savePatientList({ name: lista, memberIds: ids });
    return { ids };
  }, { count: liczba, lista: LISTA });
  await page.evaluate(() => window.VildaShell.openPatientsInStart());
  await expect(start.locator('.vilda-auth-patients')).toBeVisible();
  await expect(start.locator('.pt-count')).toContainText(String(liczba));
  return { start, ...fixture };
}

async function otworzListe(start) {
  await start.locator('.pt-seg').getByRole('button', { name: 'Listy', exact: true }).click();
  await start.locator('.pl-tile', { hasText: LISTA }).click();
  await expect(start.locator('.pt-count')).toHaveText(`Lista: ${LISTA}`);
  await expect(start.locator('.pt-scroll .pt-row')).toHaveCount(1);
}

const synchronizacja = (start) => start.evaluate(() => {
  document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false }));
});

test('synchronizacja pozostawia otwartą własną listę, wpisane wyszukiwanie i przewinięcie', async ({ page }) => {
  test.setTimeout(120_000);
  const { start, ids } = await pacjenciWPowloce(page, 12);
  await start.locator('.pt-seg').getByRole('button', { name: 'Listy', exact: true }).click();
  await start.locator('.pl-tile', { hasText: LISTA }).click();
  await expect(start.locator('.pt-count')).toHaveText(`Lista: ${LISTA}`);
  await start.locator('.pt-search input').fill('Fikcyjny');
  await expect(start.locator('.pt-scroll .pt-row')).toHaveCount(12);
  const przed = await start.evaluate(() => {
    const list = document.querySelector('.pt-scroll');
    list.scrollTop = 180;
    return list.scrollTop;
  });
  expect(przed, 'fixture rzeczywiście przewija listę').toBeGreaterThan(50);

  await synchronizacja(start);
  await page.waitForTimeout(1200); // debounce synchronizacji (250 ms) i odczyt prawdziwego sejfu
  await expect.soft(start.locator('.pt-count'), 'wybrana lista pozostaje otwarta').toHaveText(`Lista: ${LISTA}`);
  await expect.soft(start.locator('.pt-search input'), 'wpisane wyszukiwanie pozostaje').toHaveValue('Fikcyjny');
  const po = await start.evaluate(() => document.querySelector('.pt-scroll').scrollTop);
  expect.soft(po, 'odświeżenie nie przewija do początku').toBe(przed);

  // Rzeczywista zmiana nagłówka musi pojawić się także w otwartej liście.
  await start.evaluate(async (pid) => {
    const rekord = await window.VildaVault.getPatient(pid);
    const payload = JSON.parse(JSON.stringify(rekord.snapshots[0].payload));
    payload.name = 'Fikcyjny00 Zmieniony Jan';
    payload.user.lastName = 'Fikcyjny00 Zmieniony';
    await window.VildaVault.savePatient(payload, { patientId: pid, dedup: false });
    document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false }));
  }, ids[0]);
  await expect(start.locator('.pt-scroll .pt-row', { hasText: 'Fikcyjny00 Zmieniony Jan' }), 'nowe dane pacjenta są widoczne na wybranej liście').toHaveCount(1);
  await expect(start.locator('.pt-count')).toHaveText(`Lista: ${LISTA}`);
  await expect(start.locator('.pt-search input')).toHaveValue('Fikcyjny');
  expect(await start.evaluate(() => document.querySelector('.pt-scroll').scrollTop)).toBe(przed);
});

test('pusty sygnał synchronizacji nie odłącza karty pacjenta; rzeczywista zmiana danych nadal odświeża kartę', async ({ page }) => {
  test.setTimeout(120_000);
  const { start, ids } = await pacjenciWPowloce(page);
  await otworzListe(start);
  await start.locator('.pt-row', { hasText: NAZWISKO }).click();
  await expect(start.locator('.vilda-patient-hero-name')).toHaveText(`${NAZWISKO} Jan`);
  await start.locator('.vilda-patient-tab[data-tab="notes"]').click();
  await start.evaluate(() => {
    const card = document.querySelector('.vilda-auth-patient-card');
    window.__navOriginalCard = card;
    window.__navCardRemoved = false;
    const observer = new MutationObserver((changes) => {
      if (changes.some((change) => [...change.removedNodes].some((node) => node === card || node.contains(card)))) {
        window.__navCardRemoved = true;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__navObserver = observer;
  });

  await synchronizacja(start);
  await page.waitForTimeout(1200);
  const stan = await start.evaluate(() => ({ removed: window.__navCardRemoved, connected: window.__navOriginalCard.isConnected }));
  expect.soft(stan, 'bez zmiany rekordu karta nie miga przez ponowne Wczytywanie danych').toEqual({ removed: false, connected: true });
  await expect(start.locator('.vilda-patient-tab[data-tab="notes"]')).toHaveClass(/is-active|active/);

  // Kontrola: synchronizacja nowych danych nie może zostać wyłączona przez poprawkę.
  await start.evaluate(async (pid) => {
    const rekord = await window.VildaVault.getPatient(pid);
    const payload = JSON.parse(JSON.stringify(rekord.snapshots[0].payload));
    payload.name = 'Fikcyjny Zmieniony Jan';
    payload.user.lastName = 'Fikcyjny Zmieniony';
    await window.VildaVault.savePatient(payload, { patientId: pid, dedup: false });
    document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false }));
  }, ids[0]);
  await expect(start.locator('.vilda-patient-hero-name'), 'nowe dane są widoczne').toHaveText('Fikcyjny Zmieniony Jan');
  await expect(start.locator('.vilda-patient-tab[data-tab="notes"]')).toHaveClass(/is-active|active/);
});

test('odczyt listy rozpoczęty przed otwarciem karty nie może cofnąć użytkownika po zakończeniu', async ({ page }) => {
  test.setTimeout(120_000);
  const { start } = await pacjenciWPowloce(page);
  await otworzListe(start);
  await start.evaluate(() => {
    const vault = window.VildaVault;
    const original = vault.listPatients;
    window.__navReadStarted = false;
    window.__navReadReleased = false;
    let pierwszy = true;
    vault.listPatients = function (...args) {
      const result = original.apply(this, args);
      if (!pierwszy) return result;
      pierwszy = false;
      return Promise.resolve(result).then((rows) => new Promise((resolve) => {
        window.__navReadStarted = true;
        window.__navReleaseRead = () => {
          window.__navReadReleased = true;
          resolve(rows);
        };
      }));
    };
  });
  await synchronizacja(start);
  await start.waitForFunction(() => window.__navReadStarted);
  await start.locator('.pt-row', { hasText: NAZWISKO }).click();
  await expect(start.locator('.vilda-patient-hero-name')).toHaveText(`${NAZWISKO} Jan`);
  await start.evaluate(() => window.__navReleaseRead());
  await page.waitForTimeout(1200);
  await expect(start.locator('.vilda-patient-hero-name'), 'spóźniony odczyt nie zastępuje nowszej nawigacji').toHaveText(`${NAZWISKO} Jan`);
  await expect(start.locator('.vilda-auth-patients')).toHaveCount(0);
});
