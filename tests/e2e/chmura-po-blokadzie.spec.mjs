import { expect, test } from '@playwright/test';

// P-CHMURA-OPIS (decyzja właściciela 2026-10-26, B) w prawdziwym Chromium, na stronie aplikacji: w trybie chmurowym
// po blokadzie z bezczynności i po załadowaniu karty z kluczem sesji po terminie (jak przywróconej po restarcie
// przeglądarki) pamięć karty jest bez danych sesji.
// Konto fikcyjne, tryb chmurowy od założenia (createUser na prawdziwym IndexedDB strony). Serwer synchronizacji nie jest
// potrzebny; żądania poza serwerem testowym są odrzucane. Odświeżenie strony czyta tę samą pamięć karty, co przywrócona
// karta, więc termin klucza sprawdzamy przez F5 z przestawionym expiresAtISO.

const HASLO = 'Haslo-Testowe-123';

const pamiecKarty = (page) => page.evaluate(() => ({
  odblokowany: Boolean(window.VildaVault && window.VildaVault.isUnlocked()),
  klucz: Boolean(sessionStorage.getItem('vilda-vault-session-v2')),
  znacznik: sessionStorage.getItem('vilda-cloud-only-session-v1'),
  veph: Object.keys(sessionStorage).filter((k) => k.startsWith('veph:')).sort(),
  jawne: Object.keys(sessionStorage).filter((k) => (sessionStorage.getItem(k) || '').includes('Testowy')),
}));

async function kontoChmurowe(page, baseURL) {
  await page.context().route('**/*', (r) => (r.request().url().startsWith(baseURL) ? r.continue() : r.abort()));
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI && window.VildaPersistence);
  const chmurowy = await page.evaluate(async (haslo) => {
    await window.VildaVault.createUser(haslo, { iterations: 1, label: 'Fikcyjna Lekarka', storageMode: 'cloud-only' });
    return window.VildaVault.isCloudOnlyMode();
  }, HASLO);
  expect(chmurowy, 'konto w trybie chmurowym').toBe(true);
}

const pacjent = { name: 'Testowy Jan', user: { lastName: 'Testowy', firstName: 'Jan', dobISO: '2016-03-12', sex: 'M', height: 120, weight: 22 } };

test('auto-wylogowanie z bezczynności w trybie chmurowym: po blokadzie pamięć karty bez danych sesji', async ({ page, baseURL }) => {
  await kontoChmurowe(page, baseURL);
  await page.evaluate(async (p) => {
    await window.VildaVault.savePatient(p, { dedup: false });
    window.VildaVault.lock('idle');
  }, pacjent);
  await page.waitForTimeout(500);
  expect(await pamiecKarty(page)).toEqual({ odblokowany: false, klucz: false, znacznik: null, veph: [], jawne: [] });
});

test('karta z kluczem sesji po terminie: po załadowaniu pamięć karty bez danych sesji i bez znacznika trybu', async ({ page, baseURL }) => {
  await kontoChmurowe(page, baseURL);
  // Zaraz po zalogowaniu strona czyści stan formularzy (krótkie okno bez zapisu) — stan formularza zapisany po nim,
  // jak po wpisaniu danych przez lekarza.
  await page.waitForFunction(() => window.VildaPersistence.writeShared({ name: 'Testowy Jan', age: 9, weight: 22 }, { force: true }),
    null, { timeout: 10_000 });
  await page.evaluate(async (p) => { await window.VildaVault.savePatient(p, { dedup: false }); }, pacjent);
  await page.waitForTimeout(300);
  const wTrakcie = await pamiecKarty(page);
  expect(wTrakcie.odblokowany).toBe(true);
  expect(wTrakcie.znacznik).toBe('1');
  expect(wTrakcie.veph, 'w trakcie sesji zrzut i stan formularza są w pamięci karty').toEqual(
    expect.arrayContaining(['veph:cloud-only:per-user-v1', 'veph:s:sharedUserData']));
  // Przeglądarka zamknięta bez wylogowania; karta wraca po czasie bezczynności.
  await page.evaluate(() => {
    const s = JSON.parse(sessionStorage.getItem('vilda-vault-session-v2'));
    s.expiresAtISO = new Date(Date.now() - 60_000).toISOString();
    sessionStorage.setItem('vilda-vault-session-v2', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(
    () => window.VildaAuthUI && typeof window.VildaAuthUI.isBootReady === 'function' && window.VildaAuthUI.isBootReady(),
    null, { timeout: 20_000 },
  );
  await page.waitForTimeout(300);
  expect(await pamiecKarty(page)).toEqual({ odblokowany: false, klucz: false, znacznik: null, veph: [], jawne: [] });
});
