import { expect, test } from '@playwright/test';

// P-OTYLOSC-CYKLE rata 1 (decyzja właściciela 2026-09-30: rekomendacje D1–D8 projektu „Cykle
// leczenia otyłości" przyjęte). Monitor leczenia otyłości w prawdziwym DocPro pilnuje reguł cykli:
// jedno Włączenie jako pierwszy punkt cyklu, jedno Zakończenie jako ostatni, nowy cykl dopiero po
// Zakończeniu, cykl bez Włączenia tylko świadomie, Włączenie i Zakończenie z datą. Komunikat stoi
// w miejscu przycisków (#obesityTherapyActionMsg), nie w okienku. Liczby w tabeli bez zmian.
// Dane wyłącznie FIKCYJNE: dorosły, 170 cm; cykl 1 — Saxenda, cykl 2 — Wegovy.

const P = (id, type, lata, mies, masa, data, lek = 'Saxenda') => ({
  id, type, ageYears: lata, ageMonths: mies, weight: masa, height: 170, dateISO: data, drug: lek, substance: '', dose: '',
});
const CYKL1 = [
  P('a', 'start', 40, 0, 104, '2024-01-12'),
  P('b', 'continue', 40, 3, 99, '2024-04-12'),
  P('c', 'end', 40, 9, 97.5, '2024-10-15'),
];
const CYKL2 = [
  P('d', 'start', 40, 10, 98.5, '2024-11-12', 'Wegovy'),
  P('e', 'continue', 41, 1, 95.5, '2025-02-12', 'Wegovy'),
];

const HASLO = 'E2e#CykleOtylosci!26';

async function otworzMonitor(page, punkty) {
  // Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki i moduł lekarski w trybie
  // profesjonalnym — wzorzec z urodzeniowe-rozbieznosc.spec.mjs (DocPro wymaga planu PRO).
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      // Zapamiętany numer PWZ pomija bramkę modułu lekarskiego; wartość jawnie fikcyjna.
      window.localStorage.setItem('pwzNumber', '0000000');
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked() && Boolean(window.VildaProAccess)
    && typeof window.obesityAddTherapyPoint === 'function' && Boolean(window.VildaCykleLeczenia));
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const tryb = document.getElementById('resultsModeToggle');
    if (tryb && !tryb.checked) { tryb.checked = true; tryb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(1200);
  // Okno „Moduł profesjonalny” i baner analityki zasłaniają przyciski — zamykamy je jak użytkownik.
  const potwierdzam = page.locator('#professionalConfirmBtn');
  if (await potwierdzam.isVisible()) await potwierdzam.click();
  const bezAnalityki = page.getByRole('button', { name: 'Nie zgadzam się', exact: true });
  if (await bezAnalityki.isVisible()) await bezAnalityki.click();
  await page.evaluate((pts) => {
    window.obesityTherapyMonitorSetPoints(pts);
    const karta = document.getElementById('obesityCard');
    if (!karta || karta.style.display === 'none' || !karta.style.display) document.getElementById('toggleObesityTherapy').click();
    document.getElementById('obesityTabMonBtn').click();
  }, punkty);
  await expect(page.locator('#obesityMonitorSection')).toBeVisible({ timeout: 10000 });
}

async function wpisz(page, pola) {
  await page.evaluate((p) => {
    // Zdarzenie „input” jak przy pisaniu — od raty 2 monitor przelicza wtedy przyciski i przydział do cyklu.
    const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('obesityAge', p.lata); set('obesityAgeMonths', p.mies);
    set('obesityWeight', p.masa); set('obesityHeight', 170);
    set('obesityDose', p.dawka || ''); set('obesityDate', p.data);
  }, pola);
}

const przycisk = (page, nazwa) => page.locator('#obesityMonitorSection .obm-visit button', { hasText: nazwa });
const komunikat = (page) => page.locator('#obesityTherapyActionMsg');
const punkty = (page) => page.evaluate(() => (window.obesityTherapyPoints || []).map((p) => `${p.type}:${p.dateISO}`));

test('CY-1: drugie Włączenie w trakcie cyklu nie zostaje dodane, a komunikat stoi przy przyciskach', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, CYKL1.slice(0, 2));
  await wpisz(page, { lata: 40, mies: 5, masa: 98, data: '2024-06-10' });
  // Rata 2: przycisk jest wyłączony (aria-disabled) z krótkim powodem; kliknięcie nadal pokazuje pełny komunikat.
  await expect(przycisk(page, 'Włączenie leczenia')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#obesityWhy-start')).toHaveText('Cykl 1 ma już Włączenie (12.01.2024)');
  await przycisk(page, 'Włączenie leczenia').click({ force: true });

  await expect(komunikat(page)).toBeVisible();
  await expect(komunikat(page)).toHaveClass(/\berr\b/);
  await expect(komunikat(page)).toHaveText('Cykl 1 ma już Włączenie (12.01.2024). Nowy cykl rozpoczniesz po Zakończeniu cyklu 1.');
  expect(await punkty(page)).toEqual(['start:2024-01-12', 'continue:2024-04-12']);

  // Poprawna wizyta (Kontynuacja) przechodzi i zdejmuje komunikat.
  await przycisk(page, 'Kontynuacja leczenia').click();
  await expect(komunikat(page)).toBeHidden();
  expect(await punkty(page)).toHaveLength(3);
});

test('CY-2 i CY-3: Włączenie po Zakończeniu zaczyna cykl 2 i da się je poprawić jako Włączenie', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, CYKL1);
  await wpisz(page, { lata: 40, mies: 10, masa: 98.5, data: '2024-11-12' });
  await przycisk(page, 'Włączenie leczenia').click();
  await expect(komunikat(page)).toBeHidden();
  const id = await page.evaluate(() => String((window.obesityTherapyPoints || []).find((p) => p.dateISO === '2024-11-12').id));

  // Poprawka literówki w masie, zapis tym samym rodzajem. Dotąd: „Punkt „Włączenie” już istnieje…”.
  const out = await page.evaluate((pid) => {
    const pytania = [];
    const confirm = window.confirm;
    window.confirm = (m) => { pytania.push(String(m)); return true; };
    window.obesityEditTherapyPoint(pid);
    document.getElementById('obesityWeight').value = '98';
    const zapisano = window.obesitySaveTherapyPointEdit('start');
    window.confirm = confirm;
    const p = (window.obesityTherapyPoints || []).find((x) => String(x.id) === pid);
    return { zapisano, pytania, typ: p.type, masa: p.weight, ile: window.obesityTherapyPoints.length };
  }, id);
  expect(out.zapisano).toBe(true);
  expect(out.typ).toBe('start');
  expect(out.masa).toBe(98);
  expect(out.ile).toBe(4);
  // Pytanie o punkt odniesienia zostaje — zmiana dotyczy Włączenia.
  expect(out.pytania.join(' ')).toMatch(/odniesieniem dla całej oceny leczenia/);
  await expect(komunikat(page)).toBeHidden();
});

test('CY-4: Kontynuacja z datą w przerwie między cyklami jest odrzucana', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, [...CYKL1, ...CYKL2]);
  await wpisz(page, { lata: 40, mies: 9, masa: 97, data: '2024-11-01' });
  await expect(page.locator('#obesityWhy-continue')).toHaveText('Data w przerwie między cyklem 1 a 2');
  await przycisk(page, 'Kontynuacja leczenia').click({ force: true });
  await expect(komunikat(page)).toHaveText('Data 01.11.2024 wypada w przerwie między cyklem 1 (zakończony 15.10.2024) a cyklem 2 (Włączenie 12.11.2024). Popraw datę wizyty.');
  expect(await punkty(page)).toHaveLength(5);
});

test('D2: wizyta po zakończonym cyklu pyta — Włączenie albo świadomie cykl bez Włączenia', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, CYKL1);
  await wpisz(page, { lata: 41, mies: 0, masa: 100, data: '2025-01-10' });
  await przycisk(page, 'Kontynuacja leczenia').click();

  await expect(komunikat(page)).toHaveClass(/\bwarn\b/);
  await expect(komunikat(page)).toContainText('Cykl 1 jest zakończony (15.10.2024). Ta wizyta rozpocznie cykl 2.');
  const wybory = komunikat(page).locator('button');
  await expect(wybory).toHaveText(['Zapisz jako Włączenie nowego cyklu', 'Cykl bez Włączenia — leczenie rozpoczęte poza monitorowaniem', 'Anuluj']);
  expect(await punkty(page)).toHaveLength(3);

  await wybory.nth(1).click();
  await expect(komunikat(page)).toBeHidden();
  expect(await punkty(page)).toEqual(['start:2024-01-12', 'continue:2024-04-12', 'end:2024-10-15', 'continue:2025-01-10']);
});

test('D2: wybór „Zapisz jako Włączenie nowego cyklu” zapisuje wizytę jako Włączenie', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, CYKL1);
  await wpisz(page, { lata: 41, mies: 0, masa: 100, data: '2025-01-10' });
  await przycisk(page, 'Kontynuacja leczenia').click();
  await komunikat(page).locator('button', { hasText: 'Zapisz jako Włączenie nowego cyklu' }).click();
  await expect(komunikat(page)).toBeHidden();
  expect((await punkty(page)).slice(-1)).toEqual(['start:2025-01-10']);
});

test('R7: Włączenie bez daty wizyty nie zostaje dodane', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, []);
  await wpisz(page, { lata: 41, mies: 0, masa: 100, data: '' });
  await expect(page.locator('#obesityWhy-start')).toHaveText('Wymaga daty wizyty');
  await przycisk(page, 'Włączenie leczenia').click({ force: true });
  await expect(komunikat(page)).toHaveText('Punkt „Włączenie” wymaga daty wizyty — od niej liczą się okna oceny wg ChPL i granice cykli.');
  expect(await punkty(page)).toEqual([]);
});

test('CY-6: usunięcie Zakończenia między cyklami jest odrzucane bez pytania, usunięcie Włączenia pyta o skutek', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, [...CYKL1, ...CYKL2]);
  const pytania = [];
  page.on('dialog', async (d) => { pytania.push(d.message()); await d.dismiss(); });

  // Rata 2: zakończony cykl 1 jest zwinięty — rozwijamy go, żeby dostać się do jego punktów.
  await page.locator('#obesityTherapyTableWrap .obm-cycle[data-cykl="1"] .obm-ctoggle').click();
  await page.locator('#obesityTherapyTableWrap .obm-del[data-id="c"]').click();
  await expect(komunikat(page)).toHaveText('Usunięcie tego Zakończenia połączyłoby cykl 1 z cyklem 2. Najpierw usuń albo zmień Włączenie cyklu 2 (12.11.2024).');
  expect(pytania).toEqual([]);
  expect(await punkty(page)).toHaveLength(5);

  await page.locator('#obesityTherapyTableWrap .obm-del[data-id="d"]').click();
  await expect.poll(() => pytania.length).toBe(1);
  expect(pytania[0]).toContain('Cykl 2 straci punkt odniesienia (Włączenie 12.11.2024).');
  // Odmowa w oknie potwierdzenia zostawia punkt.
  expect(await punkty(page)).toHaveLength(5);
});

test('telefon (390 px): wybór nowego cyklu mieści się na ekranie bez poziomego przewijania', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await otworzMonitor(page, CYKL1);
  await wpisz(page, { lata: 41, mies: 0, masa: 100, data: '2025-01-10' });
  await przycisk(page, 'Kontynuacja leczenia').click();
  const m = komunikat(page);
  await expect(m).toBeVisible();
  await m.scrollIntoViewIfNeeded();
  const pomiar = await page.evaluate(() => {
    const el = document.getElementById('obesityTherapyActionMsg');
    const r = el.getBoundingClientRect();
    const przyciski = [...el.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
    return {
      przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      lewo: r.left, prawo: r.right, szerokoscOkna: window.innerWidth,
      najnizszyPrzycisk: Math.min(...przyciski.map((b) => b.height)),
      najdalejWPrawo: Math.max(...przyciski.map((b) => b.right)),
    };
  });
  expect(pomiar.przewijanie).toBeLessThanOrEqual(0);
  expect(pomiar.lewo).toBeGreaterThanOrEqual(0);
  expect(pomiar.prawo).toBeLessThanOrEqual(pomiar.szerokoscOkna);
  expect(pomiar.najdalejWPrawo).toBeLessThanOrEqual(pomiar.prawo);
  expect(pomiar.najnizszyPrzycisk).toBeGreaterThanOrEqual(44);
});
