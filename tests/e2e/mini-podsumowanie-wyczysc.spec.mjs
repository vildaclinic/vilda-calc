import { expect, test } from '../support/test-czas.mjs';

// P-MINI-WYCZYSC (zgłoszenie właściciela 2026-09-27) — powłoka app.html na szerokim ekranie
// (≥ 1400 px) pokazuje na pasku ozdobnym po prawej mini-podsumowanie: wiek, masa, wzrost, BMI,
// powierzchnia ciała (custom-fixes.js, za bramką PRO). Po „Wyczyść wszystkie pola" znikało
// dopiero po ok. 3 s: `clearAllData` kasuje pola programowo, a krok rozsyłający po nich
// `input`/`change` wołał nieistniejące `scheduleTimeout` (ReferenceError połykany przez
// try/catch). Podsumowanie chował dopiero timer 3200 ms lustra formularza. Zmierzone przed
// poprawką: 3203 ms; po poprawce: kilka ms.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu; bramkę PRO podmieniamy jak inne testy
// (podpisanego tokenu nie podrabiamy); reszta ścieżki — pasek, moduł, przycisk — jest prawdziwa.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#MiniPodsumowanie!26';

async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaVault);
  }, tytul, { timeout: 30000 });
  const uchwyt = await page.$(`iframe.app-pane[title="${tytul}"]`);
  return uchwyt.contentFrame();
}

const wpisz = (fr, pola) => fr.evaluate((p) => {
  Object.keys(p).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error('brak pola ' + id);
    el.value = p[id];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}, pola);

/* Stan mini-podsumowania odczytany z dokumentu POWŁOKI — tam stoi pasek ozdobny. */
const mini = (page) => page.evaluate(() => {
  const pasek = document.getElementById('vildaShellDecor');
  const m = pasek ? pasek.querySelector('#miniSummary') : null;
  return {
    pasek: pasek ? getComputedStyle(pasek).display : null,
    display: m ? m.style.display : 'brak',
    tekst: m ? m.textContent.replace(/\s+/g, ' ').trim() : '',
    maTresc: Boolean(pasek && pasek.classList.contains('decor-sidebar--has-content')),
  };
});

test('mini-podsumowanie na pasku powłoki znika zaraz po „Wyczyść wszystkie pola", nie po 3 s', async ({ page }) => {
  test.setTimeout(120_000);
  const bledyStrony = [];
  page.on('pageerror', (e) => bledyStrony.push(String(e && e.message || e)));
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/app.html', { waitUntil: 'load' });
  let start = await ramka(page, 'Start');
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await start.waitForFunction(() => window.VildaVault.isUnlocked()
    && typeof window.clearAllData === 'function' && Boolean(window.VildaProAccess));
  await start.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await page.waitForTimeout(2000);

  // Dane pacjenta jak w zgłoszeniu (fikcyjne): 16 lat 4 mies., 62 kg, 142 cm → BMI 30,7, BSA 1,56 m².
  await wpisz(start, { sex: 'M', age: '16', ageMonths: '4', weight: '62', height: '142' });
  await expect.poll(async () => (await mini(page)).tekst, { message: 'podsumowanie pojawia się po wpisaniu danych', timeout: 10_000 })
    .toMatch(/Wiek.*16 lat i 4 miesiące.*Waga.*62,0.*Wzrost.*142,0.*BMI.*30,7.*Pow\. ciała.*1,56/);
  const przed = await mini(page);
  expect(przed.pasek, 'pasek ozdobny jest widoczny na 1440 px').toBe('block');
  expect(przed.display).toBe('block');
  expect(przed.maTresc).toBe(true);

  // Klik prawdziwego przycisku; straznik niezapisanych zmian może zapytać — wybieramy „bez zapisu".
  await start.click('#clearAllDataBtn');
  const straznik = await start.$('.vug-btn.vug-danger');
  if (straznik) await straznik.click();
  const t0 = Date.now();

  // Przed poprawką: 3203 ms. Budżet 1000 ms zostawia zapas na wolny runner, ale nie zmieści
  // ani timera lustra (3200 ms), ani niczego, co lekarz odebrałby jako opóźnienie.
  await expect.poll(async () => (await mini(page)).display, { message: 'podsumowanie znika bez zwłoki', timeout: 1000, intervals: [25, 50, 100] })
    .toBe('none');
  const trwalo = Date.now() - t0;
  expect(trwalo, `znikanie trwało ${trwalo} ms`).toBeLessThan(1000);

  const po = await mini(page);
  expect(po.tekst, 'treść wyczyszczona').toBe('');
  expect(po.maTresc, 'pasek wraca do stanu bez treści').toBe(false);
  expect(await start.evaluate(() => ['age', 'ageMonths', 'weight', 'height'].map((id) => document.getElementById(id).value)))
    .toEqual(['', '', '', '']);
  expect(bledyStrony, 'poprawka nie wprowadza nieobsłużonych błędów').toEqual([]);
});
