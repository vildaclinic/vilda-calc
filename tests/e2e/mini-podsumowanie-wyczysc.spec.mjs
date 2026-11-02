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
  await start.waitForFunction(() => window.VildaAuthUI?.isBootReady()
    && !window.__vildaPersistRestoring && !window.__vildaLustroWpis
    && !window.VildaDataImportExport.isMainSessionRestorePending()
    && !window.VildaDobAge?.restorePending?.()
    && window.VildaSaveStatusIndicator?.getCurrentDecision().ready === true);

  // Dane pacjenta jak w zgłoszeniu (fikcyjne): 16 lat 4 mies., 62 kg, 142 cm → BMI 30,7, BSA 1,56 m².
  await wpisz(start, { sex: 'M', age: '16', ageMonths: '4', weight: '62', height: '142' });
  await expect.poll(async () => (await mini(page)).tekst, { message: 'podsumowanie pojawia się po wpisaniu danych', timeout: 10_000 })
    .toMatch(/Wiek.*16 lat i 4 miesiące.*Waga.*62,0.*Wzrost.*142,0.*BMI.*30,7.*Pow\. ciała.*1,56/);
  const przed = await mini(page);
  expect(przed.pasek, 'pasek ozdobny jest widoczny na 1440 px').toBe('block');
  expect(przed.display).toBe('block');
  expect(przed.maTresc).toBe(true);

  // test-czas instaluje sterowany zegar. Jego timery mierzymy tym samym zegarem,
  // zamiast porównywać ich kolejkę z czasem rzeczywistym obciążonego runnera.
  // Skok o minutę ustala punkt pomiarowy bez czekania; pauza poprzedza dialog,
  // więc nie unieważnia już przechwyconej decyzji strażnika niezapisanych zmian.
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 60_000)));
  await start.waitForFunction(() => {
    const decyzja = window.VildaSaveStatusIndicator.getCurrentDecision();
    return decyzja.ready && decyzja.state === 'new_patient';
  });

  // Fikcyjny, niezapisany pacjent wymaga potwierdzenia — nie pomijamy dialogu.
  await start.click('#clearAllDataBtn');
  const dialog = start.getByRole('dialog', { name: /^Zapisać wpisane dane przed wyczyszczeniem\?$/u });
  await expect(dialog).toBeVisible();
  await start.evaluate(() => {
    const pasek = window.parent.document.getElementById('vildaShellDecor');
    const pomiar = window.__miniClearTiming = { potwierdzono: null, ukryto: null, zaufanyKlik: false };
    const odrzuc = document.querySelector('.vug-btn.vug-danger');
    odrzuc.addEventListener('click', (zdarzenie) => {
      pomiar.potwierdzono = performance.now();
      pomiar.zaufanyKlik = zdarzenie.isTrusted;
    }, { capture: true, once: true });
    const obserwator = new MutationObserver(() => {
      const podsumowanie = pasek.querySelector('#miniSummary');
      if (pomiar.potwierdzono !== null && podsumowanie?.style.display === 'none') {
        pomiar.ukryto = performance.now();
        obserwator.disconnect();
      }
    });
    obserwator.observe(pasek, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true });
  });
  await dialog.getByRole('button', { name: 'Odrzuć dane i wyczyść', exact: true }).click();

  // Od rzeczywistego kliknięcia potwierdzenia wykonujemy tylko 1000 ms timerów.
  // Dawny fallback lustra (3200 ms) nie może naprawić wyniku tej próby.
  await page.clock.runFor(1000);
  const pomiar = await start.evaluate(() => window.__miniClearTiming);
  expect(pomiar.zaufanyKlik, 'rzeczywisty klik potwierdzenia').toBe(true);
  expect(pomiar.potwierdzono).not.toBeNull();
  expect(pomiar.ukryto, 'podsumowanie znika przed timerem lustra').not.toBeNull();
  expect(pomiar.ukryto - pomiar.potwierdzono, 'znikanie trwa mniej niż 1000 ms zegara przeglądarki').toBeLessThan(1000);

  const po = await mini(page);
  expect(po.display, 'podsumowanie znika bez zwłoki').toBe('none');
  expect(po.tekst, 'treść wyczyszczona').toBe('');
  expect(po.maTresc, 'pasek wraca do stanu bez treści').toBe(false);
  expect(await start.evaluate(() => ['age', 'ageMonths', 'weight', 'height'].map((id) => document.getElementById(id).value)))
    .toEqual(['', '', '', '']);
  expect(bledyStrony, 'poprawka nie wprowadza nieobsłużonych błędów').toEqual([]);
});
