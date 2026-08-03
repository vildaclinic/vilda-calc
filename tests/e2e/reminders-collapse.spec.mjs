import { expect, test } from '@playwright/test';

// Zwijanie kategorii „Zaległe” w panelu przypomnień (vilda_reminders_collapse.js).
// Realny panel renderuje zminifikowany vilda_auth_ui.js i wymaga sejfu + danych, więc
// zamiast go odtwarzać, wstrzykujemy SYNTETYCZNĄ sekcję .vild-rem-sec-over (identyczna
// struktura co w produkcji: nagłówek .vild-rem-sec-head z etykietą + licznikiem, potem
// pozycje .vild-rem-row) i sprawdzamy zachowanie skryptu na tej strukturze.

async function openIndexGuest(page) {
  await page.addInitScript(() => {
    // Wyłącz bramkę regulaminu, by modal nie przechwytywał kliknięć (tylko na potrzeby testu).
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) {
      /* brak storage — pomiń */
    }
  });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: 'Korzystaj bez logowania', exact: true })
    .click();
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  await page.waitForFunction(
    () => window.VildaRemindersCollapse && window.VildaRemindersCollapse.__init,
  );
}

async function injectOverdueSection(page) {
  await page.evaluate(() => {
    var old = document.getElementById('vrc-test-panel');
    if (old) old.remove();
    var panel = document.createElement('div');
    panel.id = 'vrc-test-panel';
    // Umieść na wierzchu, u góry — by nic (np. baner cookies) nie przechwytywało kliknięć.
    panel.style.cssText =
      'position:fixed;top:0;left:0;z-index:2147483647;background:#fff;padding:8px;width:320px;';
    var sec = document.createElement('div');
    sec.className = 'vild-rem-sec vild-rem-sec-over';
    var head = document.createElement('div');
    head.className = 'vild-rem-sec-head';
    var lbl = document.createElement('span');
    lbl.textContent = 'Zaległe';
    var cnt = document.createElement('span');
    cnt.textContent = '2';
    head.appendChild(lbl);
    head.appendChild(cnt);
    var r1 = document.createElement('div');
    r1.className = 'vild-rem-row';
    r1.textContent = 'Pozycja 1';
    var r2 = document.createElement('div');
    r2.className = 'vild-rem-row';
    r2.textContent = 'Pozycja 2';
    sec.appendChild(head);
    sec.appendChild(r1);
    sec.appendChild(r2);
    panel.appendChild(sec);
    document.body.appendChild(panel);
  });
}

test('klik „Zaległe” zwija i rozwija pozycje oraz zapisuje stan w localStorage', async ({
  page,
}) => {
  await openIndexGuest(page);
  await injectOverdueSection(page);

  const rows = page.locator('#vrc-test-panel .vild-rem-row');
  const head = page.locator('#vrc-test-panel .vild-rem-sec-head');

  // Start: rozwinięte (brak wpisu w localStorage → domyślnie widoczne).
  await expect(rows.first()).toBeVisible();
  expect(
    await page.evaluate(() =>
      document.documentElement.classList.contains('vrc-overdue-collapsed'),
    ),
  ).toBe(false);

  // Klik nagłówka → zwinięte: pozycje ukryte, stan zapisany.
  await head.click();
  await expect(rows.first()).toBeHidden();
  await expect(rows.nth(1)).toBeHidden();
  expect(
    await page.evaluate(() =>
      localStorage.getItem('vilda-rem-overdue-collapsed-v1'),
    ),
  ).toBe('1');

  // Ponowny klik → rozwinięte.
  await head.click();
  await expect(rows.first()).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem('vilda-rem-overdue-collapsed-v1'),
    ),
  ).toBe('0');
});

test('stan zwinięcia przeżywa przeładowanie strony', async ({ page }) => {
  await openIndexGuest(page);
  await injectOverdueSection(page);

  // Zwiń i potwierdź zapis.
  await page.locator('#vrc-test-panel .vild-rem-sec-head').click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem('vilda-rem-overdue-collapsed-v1'),
    ),
  ).toBe('1');

  // Przeładowanie: skrypt na starcie czyta localStorage i OD RAZU ustawia klasę na <html>
  // (dzięki temu przy ponownym renderze panelu pozycje są ukryte bez migotania).
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.VildaRemindersCollapse && window.VildaRemindersCollapse.__init,
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem('vilda-rem-overdue-collapsed-v1'),
    ),
  ).toBe('1');
  expect(
    await page.evaluate(() =>
      document.documentElement.classList.contains('vrc-overdue-collapsed'),
    ),
  ).toBe(true);

  // Sekcja wstrzyknięta po przeładowaniu ma pozycje ukryte OD RAZU (klasa na <html> + CSS).
  await injectOverdueSection(page);
  await expect(page.locator('#vrc-test-panel .vild-rem-row').first()).toBeHidden();
});
