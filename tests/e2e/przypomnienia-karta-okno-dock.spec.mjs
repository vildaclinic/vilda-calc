import { expect, test } from '../support/test-czas.mjs';

// Uwaga właściciela (2026-09-12) do okna zdarzenia z karty „Przypomnienia”: „uważaj na pasek
// nawigacyjny i strzałkę nawigacyjną w wersji mobile, żeby się nie nakładały”.
//
// Na wąskich ekranach (powłoka app.html do 991 px) na dole siedzi dock nawigacji, a nad nim
// strzałka „do góry”. Okno otwiera się WEWNĄTRZ ramki index.html, która sięga pod dock — bez
// wcięcia na dock wyśrodkowane okno (a zwłaszcza jego przyciski akcji) lądowało pod paskiem.
// Okno robi to samo, co pełnoekranowe „Przypomnienia” (er()): nakładka dostaje `bottom` równy
// wysokości docka powłoki, więc środek i dół okna liczą się względem widocznego obszaru.
// W dokumencie samodzielnym klasa `nav-ui-temporarily-hidden` chowa na czas okna strzałkę
// `#scrollTopBtn` (istniejąca reguła style.css, ta sama co przy modalu hasła w Ustawieniach).
test.use({ serviceWorkers: 'block', viewport: { width: 900, height: 600 } });

const HASLO = 'E2e#RemDock!26aa';
const DLUGA = Array.from({ length: 14 }, (_, k) => `Punkt ${k + 1}: skierowanie, wynik, omówić z rodzicami.`).join('\n');
const ramkaStart = (page) => page.frames().find((f) => f.url().includes('index.html?embedded=1'));

async function przygotujDane(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      const d = new Date(); const p = (n) => String(n).padStart(2, '0');
      const t = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      window.localStorage.setItem('vilda-reminders-shown-v1', `${t}|${Date.now()}`);
      window.localStorage.setItem('vilda-reminders-closed-v1', `${t}|${Date.now()}`);
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:')) ? route.continue() : route.abort();
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (a) => {
    await window.VildaVault.createUser(a.pw, { label: 'e2e', iterations: 10000 });
    const p = (n) => String(n).padStart(2, '0'); const d = new Date(); d.setDate(d.getDate() - 2);
    const zal = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const pid = (await window.VildaVault.savePatient({ name: 'Dokowa Daria', user: { age: 8, sex: 'F' } })).patientId;
    await window.VildaVault.savePatientNote({ patientId: pid, title: 'Długa obserwacja', body: a.body, category: 'observation', dueDateISO: zal, dueTime: null });
  }, { pw: HASLO, body: DLUGA });
}

async function otworzKarteWRamce(page) {
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('iframe'))
    .some((f) => (f.getAttribute('src') || '').includes('index.html?embedded=1')), null, { timeout: 20000 });
  const f = ramkaStart(page);
  await f.waitForFunction(() => Boolean(window.VildaVault && window.VildaVault.isUnlocked() && window.VildaProAccess), null, { timeout: 20000 });
  await f.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    window.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await f.waitForSelector('#remindersInline .vild-rem-row', { state: 'attached', timeout: 20000 });
  // Baner cookies powłoki podnosi dock w górę ekranu — odrzucamy go, żeby dock stał tam, gdzie
  // u lekarza (na samym dole), a pomiar dotyczył realnego układu.
  const cd = page.locator('#consent-decline');
  if (await cd.isVisible().catch(() => false)) {
    await cd.click();
    await page.waitForTimeout(400);
  }
  return f;
}

test('w powłoce z dockiem okno i jego przyciski leżą nad dockiem, nie pod nim', async ({ page }) => {
  await przygotujDane(page);
  const f = await otworzKarteWRamce(page);
  const dock = page.locator('#mobileBottomDock');
  await expect(dock, 'kontrola dodatnia: dock powłoki jest na ekranie przy 900 px').toBeVisible();

  await f.locator('#remindersInline .vild-rem-row .vild-rem-more').first().click();
  await f.waitForSelector('.vild-rem-dlg', { state: 'visible' });
  await page.waitForTimeout(800); // drugi pomiar wcięcia (600 ms) — jak w pełnoekranowych Przypomnieniach

  const dockTop = await page.evaluate(() => document.getElementById('mobileBottomDock').getBoundingClientRect().top);
  const ramkaTop = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('iframe')).find((x) => (x.getAttribute('src') || '').includes('index.html?embedded=1'));
    return el.getBoundingClientRect().top;
  });
  const g = await f.evaluate(() => {
    const d = document.querySelector('.vild-rem-dlg');
    const acts = document.querySelector('.vild-rem-dlg-acts');
    return { dlgBottom: d.getBoundingClientRect().bottom, actsBottom: acts.getBoundingClientRect().bottom, ovBottom: getComputedStyle(document.querySelector('.vild-rem-dlg-ov')).bottom };
  });
  expect(ramkaTop + g.actsBottom, `przyciski akcji (dół ${Math.round(ramkaTop + g.actsBottom)}) nad dockiem (góra ${Math.round(dockTop)})`).toBeLessThanOrEqual(dockTop + 1);
  expect(ramkaTop + g.dlgBottom, 'całe okno nad dockiem').toBeLessThanOrEqual(dockTop + 1);
  expect(g.ovBottom, 'nakładka ma wcięcie na dock').not.toBe('0px');
});

test('w dokumencie samodzielnym strzałka „do góry” chowa się na czas okna i wraca po nim', async ({ page }) => {
  await przygotujDane(page);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked() && window.VildaProAccess);
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    window.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await page.waitForSelector('#remindersInline .vild-rem-row', { state: 'attached', timeout: 20000 });
  const cd = page.locator('#consent-decline'); if (await cd.isVisible().catch(() => false)) await cd.click();
  const ukryta = () => page.evaluate(() => {
    const b = document.getElementById('scrollTopBtn');
    if (!b) return null;
    const st = getComputedStyle(b);
    return st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0';
  });
  await page.locator('#remindersInline .vild-rem-row .vild-rem-more').first().click();
  await page.waitForSelector('.vild-rem-dlg', { state: 'visible' });
  expect(await page.evaluate(() => document.body.classList.contains('nav-ui-temporarily-hidden')), 'klasa chowająca nawigację na czas okna').toBe(true);
  expect(await ukryta(), 'strzałka nawigacyjna schowana').not.toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.locator('.vild-rem-dlg')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.classList.contains('nav-ui-temporarily-hidden')), 'klasa zdjęta po zamknięciu').toBe(false);
});
