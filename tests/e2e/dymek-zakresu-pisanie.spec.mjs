import { expect, test } from '../support/test-czas.mjs';

// P-DYMEK-ZAKRESU (decyzja właściciela 2026-10-17): dymek „poza zakresem” nie miga przy pisaniu.
// Zmierzone przed zmianą: przy wpisywaniu wzrostu 135 dymek „Wzrost poza zakresem (40–250 cm)”
// pokazywał się po „1” i po „13”, przy 45 po „4”, przy 205 po „2” i „20”. Prawdziwa strona,
// prawdziwy fokus i klawiatura. Walidacja bez zmian: dla „13” wyniki nadal się nie liczą.
// Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#DymekZakresu!26';

async function otworzStart(page) {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })); } catch (_) { /* brak storage */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && window.VildaVault);
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && window.VildaVault.isUnlocked()
    && !document.documentElement.classList.contains('vilda-auth-locked'), null, { timeout: 30000 });
  const zgoda = page.locator('#consent-decline');
  if (await zgoda.isVisible()) await zgoda.click();
}

const dymek = (page, id) => page.locator(`label:has(#${id}) .vild-range-tip.is-on`);

async function wpisz(page, id, tekst) {
  await page.locator('#' + id).focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  for (const znak of tekst) {
    await page.keyboard.type(znak);
    // update() idzie w klatce animacji po każdym znaku, a dymek dostaje klasę w następnej
    await page.evaluate(() => new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); }));
  }
}

test('wpisywanie wzrostu 135, 45 i 205: dymek nie miga, a wynik liczy się jak dotąd', async ({ page }) => {
  test.setTimeout(90_000);
  await otworzStart(page);
  await wpisz(page, 'age', '9');
  await wpisz(page, 'weight', '40');

  const widziane = [];
  for (const wzrost of ['135', '45', '205']) {
    await page.locator('#height').focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    for (const znak of wzrost) {
      await page.keyboard.type(znak);
      await page.waitForTimeout(150);
      const stan = await page.evaluate(() => ({
        wartosc: document.getElementById('height').value,
        dymek: Boolean(document.querySelector('#height')?.closest('label')?.querySelector('.vild-range-tip.is-on')),
        aria: document.getElementById('height').getAttribute('aria-invalid'),
      }));
      widziane.push(stan);
    }
  }
  expect(widziane.filter((s) => s.dymek || s.aria), 'żaden początek prawdziwego wzrostu nie pokazał dymka').toEqual([]);

  // Walidacja bez zmian: „13” to wzrost poza zakresem — wyniki się nie liczą, dopóki pole nie dostanie 135.
  await wpisz(page, 'height', '13');
  await expect(page.locator('#results')).toBeHidden();
  await page.keyboard.type('5');
  await expect(page.locator('#bmiResult .result-number')).toHaveText('21,9', { timeout: 15000 });
  await expect(dymek(page, 'height')).toHaveCount(0);
});

test('wartość, której dopisanie cyfr nie naprawi, pokazuje dymek od razu; „13” pokazuje go po wyjściu z pola', async ({ page }) => {
  test.setTimeout(90_000);
  await otworzStart(page);
  await wpisz(page, 'age', '9');
  await wpisz(page, 'weight', '40');

  await wpisz(page, 'height', '3');
  await expect(dymek(page, 'height'), '„3” nie stanie się wzrostem 40–250').toHaveCount(1);
  await expect(page.locator('#height')).toHaveAttribute('aria-invalid', 'true');

  await wpisz(page, 'height', '260');
  await expect(dymek(page, 'height')).toHaveCount(1);

  await wpisz(page, 'height', '13');
  await expect(dymek(page, 'height'), 'w trakcie pisania czeka').toHaveCount(0);
  await page.locator('#weight').focus();
  await expect(dymek(page, 'height'), 'po wyjściu z pola dymek wraca jak dotąd').toHaveCount(1);
  await expect(dymek(page, 'height')).toContainText('Wzrost poza zakresem (40–250 cm)');

  // Powrót do pola i dokończenie wartości chowa dymek.
  await page.locator('#height').focus();
  await page.keyboard.press('End');
  await page.keyboard.type('5');
  await expect(dymek(page, 'height')).toHaveCount(0);
  await expect(page.locator('#bmiResult .result-number')).toHaveText('21,9', { timeout: 15000 });

  // Waga 0,5 kg: część dziesiętna kończy liczbę, więc dymek od razu.
  await wpisz(page, 'weight', '0.5');
  await expect(dymek(page, 'weight')).toHaveCount(1);
});
