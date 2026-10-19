import { expect, test } from '@playwright/test';
import { atrapaSynchronizacji, zaakceptujRegulamin, zalozKonto } from '../support/atrapa-synchronizacji.mjs';

// P-KONTO-BEZ-SERWERA (decyzja właściciela 2026-10-19, przegląd ścieżki zakładania konta, punkt 3).
//
// Zaraz po createUser w kreatorze, jeszcze przed odpowiedzią w kroku 3 („Korzystasz z kilku urządzeń?”), aplikacja
// wysyłała do serwera synchronizacji trzy żądania z slotId i tokenem: GET /trial (vilda_auth_ui.js), GET /entitlement
// (vilda_pro_access.js) i GET /status (sonda nowego urządzenia, vilda_sync_integration.js). Przy „Nie, tylko to
// urządzenie” szły dalej przy każdym logowaniu, a /entitlement także przy powrocie do karty i co 20 minut.
//
// Teraz konto z kreatora samo z siebie nie łączy się z serwerem, dopóki użytkownik nie włączy synchronizacji albo
// sam nie aktywuje PRO (Subskrypcja). Konta spoza kreatora — bez zmian.
//
// Serwer synchronizacji to atrapa, która zapisuje każde żądanie; konto i hasło są fikcyjne.

const HASLO = 'Kawa-Drzewo-7-las!';
const ZNACZNIK = 'vilda-server-deferred-v1:';
const CISZA_MS = 3000; // /trial od razu, /entitlement po 150 i 1500 ms, sonda po 600 ms

const zPowrotemNaKarte = (page) => page.evaluate(() => {
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
});
const znacznik = (page) => page.evaluate((k) => {
  const u = window.VildaVault.getCurrentUser();
  return u ? localStorage.getItem(k + u.userId) : null;
}, ZNACZNIK);

async function kreatorDoKroku3(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Załóż konto', exact: true }).click();
  await page.getByPlaceholder('Twoje imię (np. dr Kowalska)').fill('dr Testowa');
  await page.getByPlaceholder('Hasło (min. 12 znaków, 3 z 4 typów)').fill(HASLO);
  await page.getByPlaceholder('Powtórz hasło').fill(HASLO);
  await page.getByRole('button', { name: 'Dalej', exact: true }).click();
  await page.locator('.vilda-auth-checkbox-row input[type=checkbox]').check();
  await page.getByRole('button', { name: 'Dalej', exact: true }).click();
  await expect(page.locator('.vilda-auth-step')).toHaveText('Krok 3 z 4', { timeout: 30_000 });
}

async function wylogujIZalogujHaslem(page) {
  await page.evaluate(() => window.VildaVault.lock('manual')); // to samo, co robi „Wyloguj się”
  await page.locator('.vilda-auth-user-card').first().click();
  await page.getByPlaceholder('Hasło', { exact: true }).fill(HASLO);
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await page.waitForFunction(() => window.VildaVault.isUnlocked(), null, { timeout: 30_000 });
}

test.describe.configure({ timeout: 120_000 }); // kreator i logowanie: domyślne 600 000 iteracji PBKDF2

test('„Nie, tylko to urządzenie”: zero żądań do serwera — w kreatorze, w aplikacji, po ponownym logowaniu i odświeżeniu', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  const zadania = await atrapaSynchronizacji(context, { slotNaSerwerze: false });

  await kreatorDoKroku3(page);
  await page.waitForTimeout(CISZA_MS);
  expect(zadania, 'przed odpowiedzią w kroku 3').toEqual([]);
  expect(await znacznik(page), 'znacznik konta z kreatora').toBeTruthy();

  await page.getByRole('button', { name: 'Nie, tylko to urządzenie' }).click();
  await page.getByRole('button', { name: 'Przejdź do aplikacji' }).click();
  await zPowrotemNaKarte(page);
  await page.waitForTimeout(CISZA_MS);
  expect(zadania, 'po wejściu do aplikacji i powrocie do karty').toEqual([]);

  await wylogujIZalogujHaslem(page);
  await zPowrotemNaKarte(page);
  await page.waitForTimeout(CISZA_MS);
  expect(zadania, 'po ponownym logowaniu hasłem').toEqual([]);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked(), null, { timeout: 20_000 });
  await page.waitForTimeout(CISZA_MS);
  expect(zadania, 'po odświeżeniu (odtworzona sesja)').toEqual([]);
  expect(await znacznik(page), 'znacznik zostaje').toBeTruthy();
  expect(await page.evaluate(() => window.VildaProAccess.hasAccess()), 'bez serwera konto jest bez PRO').toBe(false);
});

test('„Tak, włącz synchronizację”: cisza do odpowiedzi, potem kontakt z serwerem jak dotąd', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  const zadania = await atrapaSynchronizacji(context, { slotNaSerwerze: false });

  await kreatorDoKroku3(page);
  await page.waitForTimeout(CISZA_MS);
  expect(zadania, 'przed odpowiedzią w kroku 3').toEqual([]);

  await page.getByRole('button', { name: 'Tak, włącz synchronizację' }).click();
  await page.getByRole('button', { name: 'Przejdź do aplikacji' }).click();
  await wylogujIZalogujHaslem(page);
  await expect.poll(() => zadania.includes('GET /v1/slots/<slot>/entitlement'), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => zadania.includes('GET /v1/slots/<slot>/status'), { timeout: 15_000 }).toBe(true);
  expect(zadania).toContain('GET /v1/slots/<slot>/trial');
  expect(await znacznik(page), 'włączona synchronizacja zdejmuje znacznik na stałe').toBeNull();
});

test('aktywacja PRO (Subskrypcja) otwiera sprawdzanie uprawnień', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  const zadania = await atrapaSynchronizacji(context, { slotNaSerwerze: false });

  await kreatorDoKroku3(page);
  await page.getByRole('button', { name: 'Nie, tylko to urządzenie' }).click();
  await page.getByRole('button', { name: 'Przejdź do aplikacji' }).click();
  await page.waitForTimeout(CISZA_MS);
  expect(zadania).toEqual([]);

  // Tak kończy się udane POST /trial w inline_subskrypcja_00.js (wywołanie z wyboru użytkownika).
  await page.evaluate(() => window.VildaProAccess.setPlan('pro', new Date(Date.now() + 30 * 864e5).toISOString()));
  await zPowrotemNaKarte(page);
  await expect.poll(() => zadania.includes('GET /v1/slots/<slot>/entitlement'), { timeout: 15_000 }).toBe(true);
  expect(await znacznik(page)).toBeNull();
});

test('konto spoza kreatora (bez znacznika): sonda nowego urządzenia i PRO jak dotąd', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  const zadania = await atrapaSynchronizacji(context, { slotNaSerwerze: false });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await zalozKonto(page); // createUser bez deferServerContact — jak logowanie QR, kod zapasowy czy kopia .wiw

  await expect.poll(() => zadania.includes('GET /v1/slots/<slot>/status'), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => zadania.includes('GET /v1/slots/<slot>/entitlement'), { timeout: 15_000 }).toBe(true);
  expect(zadania).toContain('GET /v1/slots/<slot>/trial');
  expect(await znacznik(page)).toBeNull();
});
