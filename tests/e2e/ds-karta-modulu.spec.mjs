import { expect, test } from '../support/test-czas.mjs';

// P-DS-2 na PRAWDZIWEJ stronie: karta modułu zespołu Downa liczy centyle SILNIKIEM BMI.
// Do 1.0.967 moduł miał własną kopię wzoru LMS (__ds_zFromLMS) i własne przybliżenie
// dystrybuanty (Zelen–Severo), więc jego centyle powstawały inną drogą niż wszystkie
// pozostałe w aplikacji. Ten test idzie całą ścieżką produkcyjną: kolejność skryptów,
// dostęp do silnika, tablice DS i render karty. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#DsKarta!26a';

async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaBmi) && Boolean(window.DS) && Boolean(window.VildaDobAge));
}

async function wypelnij(page, pola) {
  await page.evaluate((p) => {
    for (const [id, v] of Object.entries(p)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, pola);
}

test('karta DS liczy centyle silnikiem — ta sama liczba, co VildaBmi na siatce DS', async ({ page }) => {
  await otworz(page);
  await wypelnij(page, { sex: 'M', age: '10', ageMonths: '0', weight: '45', height: '135' });
  await expect(page.locator('#toggleDownSyndrome')).toBeVisible({ timeout: 15000 });
  await page.locator('#toggleDownSyndrome').click();
  await expect(page.locator('#downSyndromeCard')).toBeVisible();

  const box = page.locator('#dsPercentiles');
  await expect(box).toContainText('(DS)');
  await expect(box).toContainText('Pediatrics 2015');
  await expect(box).toContainText('Waga:');
  await expect(box).toContainText('Wzrost:');

  const zKarty = await box.evaluate((el) => {
    const wiersz = Array.from(el.querySelectorAll('div')).find((d) => /^BMI:/.test(d.textContent.trim()));
    const m = wiersz && wiersz.textContent.match(/(\d+)\.\s*centyl/);
    return m ? Number(m[1]) : null;
  });
  const zSilnika = await page.evaluate(() => {
    const r = window.VildaBmi.policz({ bmi: 45 / 1.35 ** 2, plec: 'M', wiekMies: 120, zrodlo: 'OLAF', populacja: 'DS' });
    return { siatka: r.siatka, centyl: Math.round(r.centyl) };
  });
  expect(zSilnika.siatka).toBe('DS');
  expect(zKarty).toBe(zSilnika.centyl);

  // kontrola negatywna: siatka DS to NIE jest siatka populacyjna — gdyby moduł po cichu wrócił
  // do OLAF, ta liczba by się nie zgadzała
  const olaf = await page.evaluate(() => Math.round(window.VildaBmi.policz({ bmi: 45 / 1.35 ** 2, plec: 'M', wiekMies: 120, zrodlo: 'OLAF' }).centyl));
  expect(zKarty).not.toBe(olaf);
});

test('rozpoznanie z rekordu przestawia siatki całej strony; sama rozwinięta karta — niczego', async ({ page }) => {
  await otworz(page);
  await wypelnij(page, { sex: 'M', age: '10', ageMonths: '0', weight: '45', height: '135' });
  const wiersz = page.locator('#bmiResult');
  await expect(wiersz).toBeVisible({ timeout: 15000 });

  const centyl = async () => wiersz.evaluate((el) => {
    const m = el.textContent.match(/(\d+)\s*centyl/);
    return m ? Number(m[1]) : null;
  });
  await expect(wiersz, 'bez rozpoznania — bez noty o siatce DS').not.toContainText('Downa');
  const przed = await centyl();
  expect(przed).toBeGreaterThan(0);

  // rozwinięcie karty informacyjnej NIE jest rozpoznaniem (P-DS-4: zaostrzona decyzja D1)
  await page.locator('#toggleDownSyndrome').click();
  await expect(page.locator('#downSyndromeCard')).toBeVisible();
  await wypelnij(page, { weight: '45' });
  await expect(wiersz).not.toContainText('Downa');
  expect(await centyl(), 'centyl karty głównej bez zmian po rozwinięciu karty').toBe(przed);

  // rozpoznanie w rekordzie przestawia wynik i NAZYWA siatkę (decyzja D4)
  await page.evaluate(() => window.VildaDsSource.zapamietaj({ clinical: { downSyndrome: true } }));
  await wypelnij(page, { weight: '45' });
  await expect(wiersz).toContainText('Downa', { timeout: 10_000 });

  const zKarty = await centyl();
  const oczekiwane = await page.evaluate(() => {
    const r = window.VildaBmi.policz({ bmi: 45 / 1.35 ** 2, plec: 'M', wiekMies: 120, zrodlo: 'OLAF', populacja: 'DS' });
    const o = window.VildaBmi.policz({ bmi: 45 / 1.35 ** 2, plec: 'M', wiekMies: 120, zrodlo: 'OLAF', populacja: 'OGOLNA' });
    return { ds: Math.round(r.centyl), ogolna: Math.round(o.centyl) };
  });
  expect(zKarty).toBe(oczekiwane.ds);
  expect(oczekiwane.ds, 'kontrola: siatka DS naprawdę daje inną liczbę').not.toBe(oczekiwane.ogolna);

  // i wraca po wyczyszczeniu stanu (wylogowanie / inny pacjent)
  await page.evaluate(() => window.VildaDsSource.zapomnij());
  await wypelnij(page, { weight: '45' });
  await expect(wiersz).not.toContainText('Downa');
});
