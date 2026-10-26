import { expect, test } from '@playwright/test';

// P-PROGNOZA-KONSENSUS (decyzja właściciela 2026-09-15). W karcie „Podsumowanie wyników"
// jako prognoza wzrostu ostatecznego ma stać TYLKO konsensus metod; prognozy pojedynczych
// metod zostają do wglądu pod przyciskiem, a do schowka nie idą wcale.
//
// Mierzymy na prawdziwej stronie, bo sedno zmiany jest w DOM: czy w głównej części karty
// zostaje jedna linia prognozy, czy reszta naprawdę jest w rozwijanym bloku i czy blok
// przeżywa przeliczenie karty (karta przebudowuje się przy każdym ruchu w formularzu).
// W karcie z zakładkami metody należą do wspólnego bloku „Pozostałe parametry”.
// Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Prognoza!26aa';

async function otworzPro(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (t) => { window.__schowek = t; return Promise.resolve(); } },
      configurable: true,
    });
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => typeof window.calculateGrowthAdvanced === 'function');

  await page.evaluate(() => {
    const pro = document.getElementById('resultsModeToggle');
    if (pro && !pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  if (await page.locator('#sex').isEnabled()) await page.selectOption('#sex', 'F');
  await page.fill('#age', '10');
  await page.fill('#ageMonths', '0');
  await page.fill('#height', '145');

  // Pola karty zaawansowanej bywają zwinięte — ustawiamy je wprost, tak jak robią to
  // pozostałe testy prognoz, i dopiero potem wymuszamy przeliczenie.
  await page.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('advMotherHeight', 165);
    set('advFatherHeight', 178);
    set('advBoneAge', 9);
  });
  await page.fill('#weight', '38');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.waitForFunction(
    () => Boolean(window.advancedGrowthData && window.advancedGrowthData.finalHeightPrediction),
    null, { timeout: 20000 },
  );
  await page.fill('#weight', '38.5');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
}

const PREFIKS = 'Prognoza wzrostu ostatecznego';

// Wiersze WIDOCZNE od razu — z pominięciem tych w rozwijanym bloku.
const wierszeGlowne = (page) => page.evaluate(() => Array.from(
  document.querySelectorAll('#currentSummaryContent .professional-summary-main .current-summary-row'),
).map((el) => (el.textContent || '').trim()));

const wierszeUkryte = (page) => page.evaluate(() => Array.from(
  document.querySelectorAll('#currentSummaryContent .professional-summary-extras [data-summary-key="prediction"]'),
).map((el) => (el.textContent || '').trim()));

const blok = (page) => page.locator('#currentSummaryContent .professional-summary-extras');

// Oczekiwane liczby pochodzą z istniejącego generatora/splittera produkcyjnego,
// nie z kopii wzorów ani ze sztywnego wyniku po zaokrągleniu w makiecie.
const prognozyZModelu = (page) => page.evaluate(() => {
  const p = window.VildaGrowthPredictionLines.podziel(window.getFormattedProfessionalSummaryLines());
  const format = text => String(text).replace(/\u00a0/g, ' ').replace(/(\d)\.(\d)/g, '$1,$2').trim();
  return {
    glowne: p.widoczne.filter(t => t.startsWith('Prognoza wzrostu ostatecznego')).map(format),
    pozostale: p.pozostale.map(format),
  };
});

test.describe('Karta „Podsumowanie wyników" — jedna prognoza, reszta pod przyciskiem', () => {
  test('w głównej części karty zostaje DOKŁADNIE jedna prognoza i jest to konsensus', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzPro(page);
    await expect(blok(page)).toHaveCount(1, { timeout: 20000 });

    const widoczne = (await wierszeGlowne(page)).filter((t) => t.startsWith(PREFIKS));
    expect(widoczne.length, `główne wiersze karty:\n${widoczne.join('\n')}`).toBe(1);
    expect(widoczne, 'pełna linia i liczby konsensusu z istniejącego modelu').toEqual((await prognozyZModelu(page)).glowne);

    const etykieta = await page.evaluate(() => window.advancedGrowthData.finalHeightPrediction.sourceLabel);
    expect(widoczne[0]).toContain(`${PREFIKS} (${etykieta})`);
  });

  test('prognozy pojedynczych metod są w karcie — w bloku do rozwinięcia', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzPro(page);
    await expect(blok(page)).toHaveCount(1, { timeout: 20000 });

    const ukryte = await wierszeUkryte(page);
    expect(ukryte.length, 'blok ma zawierać prognozy metod').toBeGreaterThanOrEqual(2);
    expect(ukryte, 'wszystkie nazwy metod i ich źródłowe wartości pozostają dostępne').toEqual((await prognozyZModelu(page)).pozostale);
    await expect(blok(page).locator('> summary .professional-summary-extra-label')).toHaveText('Pozostałe parametry');
  });

  test('blok jest domyślnie zwinięty, a po kliknięciu pokazuje prognozy', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzPro(page);
    await expect(blok(page)).toHaveCount(1, { timeout: 20000 });

    const pierwszy = blok(page).locator('[data-summary-key="prediction"]').first();
    await expect(pierwszy).toBeHidden();
    await blok(page).locator('> summary').click();
    await expect(pierwszy).toBeVisible();
  });

  // Karta przelicza się przy każdym ruchu w formularzu. Gdyby stan „rozwinięte" ginął,
  // blok zamykałby się lekarzowi pod palcami przy pierwszej poprawce wagi.
  test('rozwinięty blok zostaje rozwinięty po przeliczeniu karty', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzPro(page);
    await expect(blok(page)).toHaveCount(1, { timeout: 20000 });
    await blok(page).locator('> summary').click();
    await expect(blok(page).locator('[data-summary-key="prediction"]').first()).toBeVisible();
    const wezel = await blok(page).elementHandle();

    await page.fill('#weight', '39');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await expect(blok(page)).toHaveCount(1);
    await expect(blok(page)).toHaveJSProperty('open', true);
    expect(await wezel.evaluate(el => el.isConnected), 'przeliczenie zachowuje węzeł rozwinięcia pod kursorem').toBe(true);
    await expect(blok(page).locator('[data-summary-key="prediction"]').first()).toBeVisible();
    expect(await wierszeUkryte(page), 'po edycji widok zawiera aktualne wartości wszystkich metod').toEqual((await prognozyZModelu(page)).pozostale);
  });

  test('do schowka idzie tylko konsensus', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzPro(page);
    await expect(blok(page)).toHaveCount(1, { timeout: 20000 });

    await page.click('#metabolicSummaryBtn');
    await expect.poll(() => page.evaluate(() => window.__schowek || ''), { timeout: 15000 })
      .toContain(PREFIKS);

    const tekst = await page.evaluate(() => window.__schowek || '');
    const prognozy = tekst.split('\n').filter((t) => t.trim().startsWith(PREFIKS));
    expect(prognozy.length, `schowek:\n${tekst}`).toBe(1);
    expect(prognozy[0]).not.toContain('Bayley-Pinneau');
    expect(prognozy[0]).not.toContain('(RWT)');
  });

  // GROWTH-PRED-PUBLIKACJA (2026-09-15): wiersze metod niosą wartości z publikacji, a konsensus
  // liczy się z wartości po korektach — bez tej linijki rozwinięty blok nie daje się pogodzić
  // arytmetycznie z wierszem konsensusu stojącym wyżej.
  test('rozwinięty blok mówi, dlaczego konsensus nie jest średnią metod', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzPro(page);
    await expect(blok(page)).toHaveCount(1, { timeout: 20000 });

    const nota = blok(page).locator('.professional-summary-prediction-note');
    await expect(nota).toHaveCount(1);
    await expect(nota).toContainText('Wartości pozostałych metod jak w publikacjach');
    await expect(nota).toContainText('nie jest ich średnią');
  });

  // MPH to cel genetyczny, nie prognoza, i musi zostać w głównej części karty oraz w schowku.
  test('MPH zostaje widoczne w karcie i nadal się kopiuje', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzPro(page);
    await expect(page.locator('#currentSummaryContent .professional-summary-main')).toBeVisible({ timeout: 20000 });

    const widoczne = await wierszeGlowne(page);
    expect(widoczne.some((t) => /^MPH\b/.test(t)), `wiersze główne:\n${widoczne.join('\n')}`).toBe(true);

    await page.click('#metabolicSummaryBtn');
    await expect.poll(() => page.evaluate(() => window.__schowek || ''), { timeout: 15000 })
      .toContain('MPH');
  });
});
