import { expect, test } from '@playwright/test';

// P-VAR-TOAST (zgłoszenie właściciela 2026-09-28): na docpro, nawet przy pustym formularzu,
// „Wyczyść wszystkie pola" wywoływało przy lewej krawędzi ekranu turkusową etykietę z białym
// tekstem, uciętą do „…ły uaktualnione". To toast „Zalecenia zostały uaktualnione" modułu VAR
// (ospa wietrzna, flu_therapy.js). recalculateVar() słucha `input` na wieku i masie, a „Wyczyść"
// rozsyła po tych polach `input` (P-MINI-WYCZYSC) — przeliczenie ruszało przy zamkniętej karcie,
// a toast centrował się na jej prostokącie 0×0: left:0 + translateX(-50%) = połowa poza ekranem.
// Zmierzone przed poprawką (1440 px i 390 px): toast display:block, opacity 1, x = −156 px.
//
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#ToastVar!26ee';

async function otworzDocpro(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => typeof window.recalculateVar === 'function');
  // DocPro chowa kalkulator za bramką PRO; odsłaniamy kontener jak u użytkownika z aktywnym planem.
  await page.evaluate(() => {
    document.documentElement.classList.remove('vilda-pro-inactive');
    document.documentElement.classList.add('vilda-pro-active');
  });
  await page.waitForTimeout(800);
}

/* Stan toastu VAR; „widoczny" = wyświetlony i nieprzezroczysty. */
const toastVar = (page) => page.evaluate(() => {
  const t = document.getElementById('varTooltip');
  if (!t) return { jest: false, widoczny: false };
  const r = t.getBoundingClientRect();
  return {
    jest: true,
    widoczny: t.style.display !== 'none' && t.style.opacity !== '0',
    tekst: t.textContent,
    lewa: r.left,
    prawa: r.right,
    srodek: r.left + r.width / 2,
  };
});

/* Próbkuje toast przez `ms` — debounce toastu to 800 ms, więc okno musi być dłuższe. */
async function probkuj(page, ms) {
  const probki = [];
  const koniec = Date.now() + ms;
  while (Date.now() < koniec) {
    probki.push(await toastVar(page));
    await page.waitForTimeout(100);
  }
  return probki;
}

test('pusty docpro: „Wyczyść wszystkie pola" nie pokazuje toastu VAR przy lewej krawędzi', async ({ page }) => {
  test.setTimeout(120_000);
  const bledyStrony = [];
  page.on('pageerror', (e) => bledyStrony.push(String(e && e.message || e)));
  page.on('dialog', (d) => d.accept());
  await otworzDocpro(page);

  // karta leczenia przeciwwirusowego jest zamknięta — tak jak w zgłoszeniu
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('fluCard')).display)).toBe('none');
  expect(await page.textContent('#varResult')).toBe('');

  await page.click('#clearAllDataBtn');
  const probki = await probkuj(page, 1800);

  // Ścieżka zgłoszenia faktycznie zaszła: „Wyczyść" dotarło do modułu VAR i zalecenia
  // przeliczyły się (bez tego test przeszedłby pusto, gdyby zdarzenia przestały lecieć).
  await expect(page.locator('#varResult')).toContainText('Uzupełnij wiek i masę ciała');
  expect(probki.filter((p) => p.widoczny), JSON.stringify(probki.filter((p) => p.widoczny)[0] || null)).toEqual([]);
  expect(bledyStrony).toEqual([]);
});

test('widoczna sekcja VAR: toast „Zalecenia zostały uaktualnione" nadal działa i stoi nad kartą', async ({ page }) => {
  test.setTimeout(120_000);
  const bledyStrony = [];
  page.on('pageerror', (e) => bledyStrony.push(String(e && e.message || e)));
  await otworzDocpro(page);

  // Przycisk karty stoi za trybem profesjonalnym (numer PWZ) — odsłaniamy samą kartę, jak robi to
  // jej przełącznik (style.display = "block"). Dalej już prawdziwa ścieżka: wybór infekcji i dane.
  await page.evaluate(() => { document.getElementById('fluCard').style.display = 'block'; });
  await page.selectOption('#infectionSelect', 'ospawietrzna');
  await page.waitForTimeout(3200); // toast z samego wyboru infekcji gaśnie (0,8 s + 2 s + 0,2 s)
  await page.fill('#age', '6');
  await page.fill('#weight', '21');

  await expect.poll(async () => (await toastVar(page)).widoczny, { timeout: 3000 }).toBe(true);
  const toast = await toastVar(page);
  const { szerokosc, srodekKarty } = await page.evaluate(() => {
    const r = document.getElementById('fluCard').getBoundingClientRect();
    return { szerokosc: document.documentElement.clientWidth, srodekKarty: r.left + r.width / 2 };
  });
  expect(toast.tekst).toBe('Zalecenia zostały uaktualnione');
  expect(toast.lewa).toBeGreaterThanOrEqual(0);
  expect(toast.prawa).toBeLessThanOrEqual(szerokosc);
  expect(Math.abs(toast.srodek - srodekKarty)).toBeLessThan(2);
  expect(bledyStrony).toEqual([]);
});
