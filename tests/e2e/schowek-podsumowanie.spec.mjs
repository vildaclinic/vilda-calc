import { expect, test } from '../support/test-czas.mjs';

// P-IOS-SCHOWEK na PRAWDZIWEJ stronie i PRAWDZIWYM schowku systemowym.
//
// Zgłoszenie z iOS (2026-09-16): treść skopiowana przyciskiem „Podsumowanie wyników" wklejała się
// w Notatkach i Wiadomościach JAKO ŁĄCZA, choć w polu przyjmującym czysty tekst ta sama zawartość
// była poprawna, a inne przyciski aplikacji działały. Przyczyna: na schowku iOS leżą obok siebie
// różne warianty tej samej treści — `writeText` zapisuje wyłącznie czysty tekst, a `execCommand`
// z pola `contentEditable` dokłada wariant HTML, który Notatki wolą od tekstu.
//
// UWAGA CO DO ZAKRESU: to Chromium, nie WebKit — ten plik NIE dowodzi zachowania na iPhonie.
// Dowodzi tego, co da się sprawdzić bez tamtej platformy: że tekst ląduje w systemowym schowku
// i że przy dostępnym Clipboard API druga droga zapisu w ogóle nie rusza. Dane FIKCYJNE.
test.use({ serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });

const ZNACZNIK = 'POPRZEDNIA-ZAWARTOSC-SCHOWKA-1234';
const HASLO = 'E2e#Schowek!26a';

async function otworz(page, { bezApiSchowka = false, zepsuteZaznaczenie = false, podgladExec = false } = {}) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  if (podgladExec) {
    await page.addInitScript(() => {
      window.__execCopy = 0;
      const orig = document.execCommand ? document.execCommand.bind(document) : null;
      document.execCommand = function (cmd) {
        if (cmd === 'copy') window.__execCopy += 1;
        return orig ? orig(cmd) : false;
      };
    });
  }
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

test('tekst ląduje w SYSTEMOWYM schowku, a druga droga zapisu nie rusza', async ({ page }) => {
  await otworz(page, { podgladExec: true });
  await wpiszPacjenta(page);
  await zasiejZnacznik(page, ZNACZNIK);

  await page.locator('#metabolicSummaryBtn').click();
  await expect(page.locator('#metabolicSummaryCopyToast')).toBeVisible({ timeout: 10000 });

  // istota naprawy: skoro Clipboard API jest dostępne, execCommand NIE ma prawa się uruchomić
  // — inaczej dołożyłby na schowek wariant HTML, przez który Notatki wklejają łącza
  // najpierw upewniamy się, że podgląd w ogóle stoi — inaczej zero poniżej nic nie znaczy
  expect(await page.evaluate(() => typeof window.__execCopy), 'podgląd execCommand zainstalowany').toBe('number');
  expect(await page.evaluate(() => window.__execCopy), 'żadnego execCommand obok writeText').toBe(0);

  const wklejone = await wklejZeSchowka(page);
  expect(wklejone, 'schowek nie może zostać z poprzednią zawartością').not.toContain(ZNACZNIK);
  expect(wklejone).toContain('BMI:');
  expect(wklejone).toContain('Waga:');
  expect(wklejone).toContain('Wzrost:');
});

test('bez Clipboard API rusza ścieżka zapasowa — i wtedy podgląd faktycznie ją widzi', async ({ page }) => {
  await otworz(page, { bezApiSchowka: true, podgladExec: true });
  await wpiszPacjenta(page);
  const brakApi = await page.evaluate(() => !navigator.clipboard);
  test.skip(!brakApi, 'nie udało się wyłączyć navigator.clipboard w tej przeglądarce');

  await page.locator('#metabolicSummaryBtn').click();
  await expect(page.locator('#metabolicSummaryCopyToast')).toBeVisible({ timeout: 10000 });

  // kontrola DODATNIA dla testu wyżej: ten sam podgląd tutaj liczy wywołania, więc zero
  // w tamtym teście jest wynikiem pomiaru, a nie niedziałającego podglądu
  expect(await page.evaluate(() => window.__execCopy), 'tu droga zapasowa musi ruszyć').toBeGreaterThan(0);

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
