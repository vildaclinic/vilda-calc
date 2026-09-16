import { expect, test } from '../support/test-czas.mjs';

// P-IOS-SCHOWEK na PRAWDZIWEJ stronie i PRAWDZIWYM schowku systemowym.
//
// Zgłoszenie z iOS (2026-09-16): „Podsumowanie wyników — kliknij i skopiuj" meldowało sukces,
// ale w Wiadomościach wklejał się bezsensowny ciąg znaków, a w Notatkach — łącze. Na komputerze
// działało. Przyczyna: do schowka NIC nie trafiało i wklejała się jego poprzednia zawartość.
//
// UWAGA CO DO ZAKRESU: to Chromium, nie WebKit — ten plik NIE dowodzi, że naprawa działa na
// iPhonie. Dowodzi trzech rzeczy, których stary kod nie spełniał i które były warunkiem błędu:
// tekst faktycznie ląduje w schowku systemowym (a nie tylko w podmienionym `writeText`),
// ścieżka zapasowa działa BEZ `navigator.clipboard`, a nieudane kopiowanie mówi prawdę
// zamiast pokazywać „skopiowane". Dane FIKCYJNE.
test.use({ serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });

const ZNACZNIK = 'POPRZEDNIA-ZAWARTOSC-SCHOWKA-1234';
const HASLO = 'E2e#Schowek!26a';

async function otworz(page, { bezApiSchowka = false, zepsuteZaznaczenie = false } = {}) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  if (bezApiSchowka) {
    // Tak wygląda świat, w którym zostaje wyłącznie ścieżka synchroniczna — czyli ta,
    // która na iOS była zepsuta.
    await page.addInitScript(() => {
      try { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); } catch (_) { /* nie da się podmienić */ }
    });
  }
  if (zepsuteZaznaczenie) {
    // Model awarii z iOS: przeglądarka MÓWI, że skopiowała, ale zaznaczenie nie powstało.
    await page.addInitScript(() => {
      try {
        HTMLTextAreaElement.prototype.setSelectionRange = function () { /* iOS bez contentEditable */ };
        document.execCommand = () => true;
      } catch (_) { /* nie da się podmienić */ }
    });
  }
  await page.goto('/index.html', { waitUntil: 'load' });
  // Bez odblokowanego sejfu cała treść strony stoi na `visibility:hidden` — przycisk istnieje,
  // ale nie da się go kliknąć. Konto zakładamy jak w pozostałych testach e2e, dane FIKCYJNE.
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => typeof window.update === 'function' && Boolean(window.VildaBmi));
  await page.waitForFunction(() => Boolean(window.VildaSchowek));
}

async function wpiszPacjenta(page) {
  // Przycisk podsumowania pokazuje się dopiero w trybie profesjonalnym — włączamy go
  // prawdziwym przełącznikiem, jak lekarz. Ponawiamy, aż zadziała: zaraz po wczytaniu strony
  // nasłuch przełącznika bywa jeszcze niepodpięty i pojedyncze kliknięcie przepada.
  await page.waitForFunction(() => {
    const pro = document.getElementById('resultsModeToggle');
    if (!pro) return false;
    if (!pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
    return window.professionalMode === true;
  }, { timeout: 15000 });
  await page.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', 9); set('ageMonths', 3); set('sex', 'M'); set('weight', 28); set('height', 123.8);
    window.update();
  });
  await expect(page.locator('#metabolicSummaryBtn')).toBeVisible({ timeout: 15000 });
}

/* Czyta schowek SYSTEMOWY przez wklejenie z klawiatury — celowo nie przez `navigator.clipboard`,
   bo to właśnie jest API badane w tym teście. */
async function wklejZeSchowka(page) {
  await page.evaluate(() => {
    let pole = document.getElementById('__testPaste');
    if (!pole) {
      pole = document.createElement('textarea');
      pole.id = '__testPaste';
      pole.style.cssText = 'position:fixed;bottom:0;left:0;width:200px;height:60px;z-index:99999;';
      document.body.appendChild(pole);
    }
    pole.value = '';
    pole.focus();
  });
  await page.keyboard.press('ControlOrMeta+V');
  return page.evaluate(() => document.getElementById('__testPaste').value);
}

async function zasiejZnacznik(page, znacznik) {
  await page.evaluate(async (z) => { await navigator.clipboard.writeText(z); }, znacznik);
}

test('tekst ląduje w SYSTEMOWYM schowku, a nie zostaje po nim poprzednia zawartość', async ({ page }) => {
  await otworz(page);
  await wpiszPacjenta(page);
  await zasiejZnacznik(page, ZNACZNIK);

  await page.locator('#metabolicSummaryBtn').click();
  await expect(page.locator('#metabolicSummaryCopyToast')).toBeVisible({ timeout: 10000 });

  const wklejone = await wklejZeSchowka(page);
  expect(wklejone, 'schowek nie może zostać z poprzednią zawartością').not.toContain(ZNACZNIK);
  expect(wklejone).toContain('BMI:');
  expect(wklejone).toContain('Waga:');
  expect(wklejone).toContain('Wzrost:');
});

test('ścieżka zapasowa działa BEZ navigator.clipboard — to ta, która na iOS była zepsuta', async ({ page }) => {
  await otworz(page, { bezApiSchowka: true });
  await wpiszPacjenta(page);
  const brakApi = await page.evaluate(() => !navigator.clipboard);
  test.skip(!brakApi, 'nie udało się wyłączyć navigator.clipboard w tej przeglądarce');

  await page.locator('#metabolicSummaryBtn').click();
  await expect(page.locator('#metabolicSummaryCopyToast')).toBeVisible({ timeout: 10000 });

  const wklejone = await wklejZeSchowka(page);
  expect(wklejone, 'sam execCommand musi wystarczyć').toContain('BMI:');
});

test('gdy kopiowanie się nie uda, przycisk mówi prawdę zamiast pokazywać „skopiowane"', async ({ page }) => {
  await otworz(page, { bezApiSchowka: true, zepsuteZaznaczenie: true });
  await wpiszPacjenta(page);
  await zasiejZnacznik(page, ZNACZNIK).catch(() => { /* API wyłączone — znacznik zasiewamy niżej */ });

  const komunikaty = [];
  page.on('dialog', (d) => { komunikaty.push(d.message()); d.dismiss().catch(() => {}); });

  await page.locator('#metabolicSummaryBtn').click();
  await page.waitForTimeout(1500);

  expect(komunikaty.join(' '), 'lekarz musi wiedzieć, że schowek został bez zmian').toMatch(/nie uda/i);
  await expect(page.locator('#metabolicSummaryCopyToast'), 'żadnego fałszywego „skopiowane"').toHaveCount(0);
});
