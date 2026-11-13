/**
 * Dwa fikcyjne konta w jednej przeglądarce (jedno urządzenie): przelogowania przez prawdziwy sejf.
 * Używane w testach „każde konto widzi tylko swoje” (LAB-PAKIETY PR5, P-USTAWIENIA-KONTA). Dane wyłącznie fikcyjne.
 */

// Wylogowanie na stronie pobocznej przenosi na stronę główną z ekranem logowania; na stronie głównej zostajemy.
export async function wyloguj(page) {
  await Promise.all([
    page.waitForURL(/\/index\.html(?:[?#]|$)/),
    page.evaluate(() => { window.VildaVault.lock(); }).catch(() => { /* nawigacja przerwała wywołanie */ }),
  ]);
  await page.waitForLoadState('load');
  await page.evaluate(() => window.VildaSession?.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault) && !window.VildaVault.isUnlocked());
}

// Nowe konto na tym samym urządzeniu; zwraca jego identyfikator. Strona zostaje na stronie głównej.
export async function zalozKonto(page, haslo, etykieta) {
  await wyloguj(page);
  return page.evaluate(async ({ haslo: h, etykieta: e }) => (await window.VildaVault.createUser(h, { label: e, iterations: 10000 })).userId, { haslo, etykieta });
}

// Powrót na istniejące konto. Strona zostaje na stronie głównej.
export async function zalogujKonto(page, userId, haslo) {
  await wyloguj(page);
  await page.evaluate(({ userId: id, haslo: h }) => window.VildaVault.unlockUser(id, h), { userId, haslo });
}

// Strona otwarta przez zalogowanego użytkownika: sejf odblokowany, ekran logowania schowany.
export async function otworzZalogowany(page, sciezka) {
  await page.goto(sciezka, { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && Boolean(window.VildaAuthUI));
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}
