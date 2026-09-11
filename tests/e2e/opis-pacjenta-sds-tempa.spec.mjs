import { expect, test } from '../support/test-czas.mjs';

// GROWTH-HV-UI8 — SDS tempa w opisie spod „Kopiuj opis pacjenta" (2026-09-10, zgłoszenie
// właściciela).
//
// Karta pacjenta i „Podsumowanie wyników" niosły SDS tempa, a opis kopiowany do
// dokumentacji — nie. Co gorsza, opis mówił wtedy „poza oknem automatycznej oceny normy
// tempa" także wtedy, gdy norma prędkości wzrastania istnieje i daje wynik: progi
// getVelocityThreshold kończą się na 10. roku życia, a normy HV-SDS sięgają dalej.
//
// Druga reguła właściciela: gdy SDS się nie liczy, komunikat „nie policzono — odstęp …"
// do opisu NIE wchodzi. Opis jest notatką do dokumentacji; powód odmowy zostaje w karcie.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#OpisSds!26aa';

async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
}

// Dziewczynka 14 lat, 148,5 cm. Jeden pomiar historyczny — jego wiek rozstrzyga o odstępie:
//   13 lat 1 mies. → 11 mies. → tempo 9,4 cm/rok, SDS +2,5 (99 centyl);
//   11 lat         → 36 mies. → tempo 8,2 cm/rok, SDS poza oknem norm („nie policzono").
async function pacjentka(page, lata, miesiace, wzrost) {
  await page.fill('#lastName', 'Probna');
  await page.fill('#firstName', 'Alicja');
  await page.evaluate(() => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '14'); set('ageMonths', '0'); set('sex', 'F');
    set('height', '148.5'); set('weight', '50.5');
    if (typeof window.update === 'function') window.update();
  });
  await page.waitForSelector(
    '#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]',
    { state: 'attached' },
  );
  await page.evaluate(() => {
    const t = document.getElementById('toggleAdvancedGrowth');
    const f = document.getElementById('advancedGrowthForm');
    if (f && getComputedStyle(f).display !== 'none') return;
    if (t) { t.disabled = false; t.click(); }
  });
  await expect(page.locator('#advancedGrowthForm')).toBeVisible();
  await page.waitForSelector('#advMeasurements .measure-row');
  await page.evaluate(([l, m, h]) => {
    const w = document.querySelector('#advMeasurements .measure-row');
    const set = (sel, v) => {
      const e = w.querySelector(sel);
      if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    set('.adv-age-years', l); set('.adv-age-months', m);
    set('.adv-height', h); set('.adv-weight', '45');
    window.calculateGrowthAdvanced();
  }, [lata, miesiace, wzrost]);
  // Czekamy na OBECNOŚĆ kafelka, nie na jego widoczność. Kafelek powstaje przy każdym
  // przeliczeniu karty zaawansowanej, niezależnie od tego, czy karta jest akurat rozwinięta —
  // a asercje niżej czytają jego tekst, do czego widoczność nie jest potrzebna. Domyślny
  // `waitForSelector` czeka na WIDOCZNOŚĆ i na CI wywrócił się z komunikatem
  // „113 × locator resolved to hidden <div class=\"vtap-card cs vtap-hvc\">": karta była
  // zwinięta, choć wynik był już policzony i poprawny.
  await page.waitForSelector('#advResults .vtap-hvc', { state: 'attached' });
}

const opis = (page) => page.evaluate(
  () => window.VildaPatientNarrativeUI.describeCurrent(),
);

test.describe('Opis pacjenta niesie SDS tempa', () => {
  test('odstęp 11 mies.: opis ma zdanie o SDS tempa z tą samą liczbą co kafelek', async ({ page }) => {
    await otworz(page);
    await pacjentka(page, '13', '1', '139.9');

    await expect(page.locator('#advResults .vtap-hvc'), 'punkt odniesienia — kafelek karty')
      .toContainText('+2,5');

    const o = await opis(page);
    expect(o.text, 'opis powstał').toBeTruthy();
    const zdanie = (o.sentences || []).find((z) => z.id === 'tempo-sds');
    expect(zdanie, 'opis ma osobne zdanie o SDS tempa').toBeTruthy();
    expect(zdanie.text).toContain('+2,5');
    expect(zdanie.text).toContain('99 centyl');
    expect(zdanie.text, 'atrybucja źródła idzie z liczbą')
      .toMatch(/wg Duran i wsp\., J Pediatr Endocrinol Metab 2025/);
    expect(o.text, 'zdanie jest w kopiowanym akapicie, nie tylko na liście')
      .toContain(zdanie.text);

    const idx = (o.sentences || []).map((z) => z.id);
    expect(idx.indexOf('tempo-sds'), 'stoi zaraz po zdaniu o tempie')
      .toBe(idx.indexOf('tempo') + 1);
  });

  test('odstęp 36 mies.: opis milczy o SDS, bez komunikatu „nie policzono”', async ({ page }) => {
    await otworz(page);
    await pacjentka(page, '11', '0', '123.9');

    await expect(page.locator('#advResults .vtap-hvc'), 'karta odmawia z powodem — i tak ma być')
      .toContainText('nie policzono');

    const o = await opis(page);
    expect(o.text, 'opis powstał mimo braku SDS').toBeTruthy();
    expect(o.text, 'powód odmowy zostaje w karcie, nie w notatce')
      .not.toMatch(/nie policzono/);
    expect(o.text).not.toMatch(/SDS tempa/);
    expect((o.sentences || []).some((z) => z.id === 'tempo-sds'), 'zdania po prostu nie ma')
      .toBe(false);
    expect(o.text, 'zdanie o samym tempie zostaje').toContain('8,2 cm/rok');
  });
});
