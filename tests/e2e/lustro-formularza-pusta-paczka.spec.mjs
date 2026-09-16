import { expect, test } from '../support/test-czas.mjs';

// P-ODTWORZ-ZYWO (2026-09-16) — lustro formularza (custom-fixes.js) rozsyła po wczytaniu i po
// odtworzeniu paczki pól nadawcy 180/1000/2600 ms później. Paczka to MIGAWKA pól tamtego okna,
// bywa sprzed jego odtworzenia — pusta waga z takiej paczki kasowała wpisaną w tym oknie
// (jedyny mechanizm w kodzie z sygnaturą „znika po 2–3 s"). Reguła: pusta wartość z paczki
// nie kasuje wpisanej; jawne „Wyczyść" niesie clear i kasuje; ping pojedynczego pola (edycja
// lekarza w drugim oknie) nadal przenosi także wykasowanie.
test.use({ serviceWorkers: 'block' });

const wpisz = (page, pola) => page.evaluate((p) => {
  Object.keys(p).forEach((id) => {
    const el = document.getElementById(id);
    el.value = p[id];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}, pola);

const pola = (page) => page.evaluate(() => ({
  w: document.getElementById('weight').value, h: document.getElementById('height').value, age: document.getElementById('age').value,
}));

/* Wiadomość „z drugiego okna tej samej karty": ten sam tabId, obcy nadawca. */
const wyslij = (page, msg) => page.evaluate((m) => {
  const tab = (window.VildaPersistence && typeof window.VildaPersistence.getTabId === 'function' && window.VildaPersistence.getTabId())
    || window.sessionStorage.getItem('vildaTabIdV1') || '';
  new BroadcastChannel('vilda-form-mirror').postMessage(Object.assign({ sender: 'e2e-drugie-okno', tabId: tab, ts: Date.now() }, m));
}, msg);

test('pusta paczka z drugiego okna nie kasuje wagi i wzrostu; „Wyczyść" (clear) kasuje; ping pola kasuje', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.collectUserData === 'function' && Boolean(window.VildaPersistence));
  await page.waitForTimeout(1500);
  await wpisz(page, { sex: 'M', age: '9', ageMonths: '2', weight: '30.2', height: '134' });

  // Kontrola dodatnia toru: paczka z WARTOŚCIAMI dociera i nadpisuje.
  await wyslij(page, { type: 'bulk', fields: { weight: '31', height: '135' } });
  await expect.poll(async () => (await pola(page)).w, { message: 'paczka z wartościami dociera' }).toBe('31');
  expect((await pola(page)).h).toBe('135');

  // Zgłoszony przebieg: paczka z pustymi polami (migawka sprzed odtworzenia) — wartości zostają.
  await wyslij(page, { type: 'bulk', fields: { name: '', age: '', ageMonths: '', weight: '', height: '', sex: '' } });
  await page.waitForTimeout(700);
  const po = await pola(page);
  expect(po.w, 'pusta waga z paczki nie kasuje wpisanej').toBe('31');
  expect(po.h).toBe('135');
  expect(po.age, 'pusty wiek z paczki nie kasuje wpisanego').toBe('9');

  // Jawne „Wyczyść" w drugim oknie niesie clear — i wtedy kasuje.
  await wyslij(page, { type: 'bulk', clear: true, fields: { name: '', age: '', ageMonths: '', weight: '', height: '', sex: '' } });
  await expect.poll(async () => (await pola(page)).w, { message: 'clear kasuje' }).toBe('');
  expect((await pola(page)).h).toBe('');

  // Ping pojedynczego pola (lekarz edytuje w drugim oknie) przenosi także wykasowanie.
  await wpisz(page, { weight: '30.2' });
  await wyslij(page, { key: 'weight', value: '' });
  await expect.poll(async () => (await pola(page)).w, { message: 'ping pola z pustą wartością kasuje' }).toBe('');
});

test('okno odtwarzające wspólny stan (vildaPersistRestoreAll) nie odsyła echa lustrem', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.collectUserData === 'function');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.__pingi = [];
    new BroadcastChannel('vilda-form-mirror').addEventListener('message', (m) => { if (m.data && m.data.key) window.__pingi.push(m.data.key + '=' + m.data.value); });
  });
  await page.evaluate(() => { window.__vildaPersistRestoring = true; });
  await wpisz(page, { weight: '28' });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__pingi), 'w trakcie odtwarzania brak pingu').toEqual([]);
  await page.evaluate(() => { window.__vildaPersistRestoring = false; });
  await wpisz(page, { weight: '29' });
  await expect.poll(async () => page.evaluate(() => window.__pingi), { message: 'po odtworzeniu ping wraca' }).toContain('weight=29');
});
