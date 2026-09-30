import { expect, test } from '@playwright/test';

// P-OTYLOSC-CYKLE rata 2 (decyzja właściciela 2026-09-30: rekomendacje D1–D8 projektu „Cykle
// leczenia otyłości” przyjęte; „ruszaj z ratą 2”). Monitor leczenia otyłości w prawdziwym DocPro:
// tabela w blokach cykli (najnowszy na górze, punkty w cyklu od najstarszego), redukcja od Włączenia
// TEGO cyklu (bez Włączenia — od jego 1. punktu), przerwy między cyklami, zakończone cykle zwinięte,
// przydział wizyty do cyklu na żywo, przyciski z powodem, baner porządkowania starego zapisu.
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
  P('f', 'continue', 41, 4, 93, '2025-05-10', 'Wegovy'),
];
// Stary zapis sprzed raty 1: drugie Włączenie bez Zakończenia między nimi.
const STARY = [
  P('a', 'start', 40, 0, 104, '2024-01-12'),
  P('b', 'continue', 40, 3, 99, '2024-04-12'),
  P('g', 'start', 40, 4, 99, '2024-05-03'),
  P('h', 'continue', 40, 8, 96, '2024-09-01'),
];

const HASLO = 'E2e#CykleRata2!26';

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

const blok = (page, n) => page.locator(`#obesityTherapyTableWrap .obm-cycle[data-cykl="${n}"]`);
const redukcje = (loc) => loc.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].slice(7, 9).map((td) => td.textContent)));
const tekst = (loc) => loc.evaluate((e) => e.textContent.replace(/\s+/g, ' ').trim());
// Nagłówek cyklu to kilka elementów obok siebie (numer, znaczniki, opis, wynik, przełącznik) — łączymy je spacją.
const naglowek = (page, n) => blok(page, n).locator('.obm-chead').evaluate((e) => [...e.children].map((c) => c.textContent.trim()).join(' '));

test('bloki cykli: najnowszy na górze, redukcja od Włączenia cyklu, przerwa, zakończony cykl zwinięty', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, [...CYKL1, ...CYKL2]);

  const kolejnosc = await page.locator('#obesityTherapyTableWrap .obm-cycle').evaluateAll((b) => b.map((x) => x.getAttribute('data-cykl')));
  expect(kolejnosc).toEqual(['2', '1']);

  const naglowek2 = await naglowek(page, 2);
  expect(naglowek2).toBe('Cykl 2 aktywny Wegovy · od 12.11.2024 · 25,6 tyg. · 3 punkty od Włączenia −5,6%');
  // Dotąd redukcja w cyklu 2 liczyła się od 104,0 kg (start Saxendy): −5,3%, −8,2%, −10,6%.
  expect(await redukcje(blok(page, 2))).toEqual([['—', '—'], ['−3,0%', '−3,0%'], ['−5,6%', '−5,6%']]);
  await expect(blok(page, 2).locator('.obm-ctable')).toBeVisible();

  await expect(page.locator('#obesityTherapyTableWrap .obm-gap')).toHaveText('przerwa 28 dni · 15.10.2024 → 12.11.2024');

  const naglowek1 = await naglowek(page, 1);
  expect(naglowek1).toBe('Cykl 1 zakończony Saxenda · 12.01.2024 – 15.10.2024 · 39,6 tyg. · 3 punkty wynik −6,3% Pokaż punkty (3) ▾');
  await expect(blok(page, 1).locator('.obm-ctable')).toBeHidden();
  const przelacznik = blok(page, 1).locator('.obm-ctoggle');
  await expect(przelacznik).toHaveAttribute('aria-expanded', 'false');
  await przelacznik.click();
  await expect(blok(page, 1).locator('.obm-ctable')).toBeVisible();
  await expect(blok(page, 1).locator('.obm-ctoggle')).toHaveText('Ukryj punkty ▴');
  expect(await redukcje(blok(page, 1))).toEqual([['—', '—'], ['−4,8%', '−4,8%'], ['−6,3%', '−6,3%']]);
});

test('przydział do cyklu na żywo i przyciski wyłączone z powodem', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, [...CYKL1, ...CYKL2]);

  await wpisz(page, { lata: 41, mies: 5, masa: 92, data: '2025-06-10' });
  await expect(page.locator('#obesityTherapyAssign')).toHaveText('Ta wizyta trafi do cyklu 2 (aktywny, od 12.11.2024).');
  await expect(przycisk(page, 'Włączenie leczenia')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#obesityWhy-start')).toHaveText('Cykl 2 ma już Włączenie (12.11.2024)');
  await expect(przycisk(page, 'Kontynuacja leczenia')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(przycisk(page, 'Zakończenie leczenia')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#obesityWhy-continue')).toBeHidden();

  // Data w przerwie między cyklami: żaden rodzaj wizyty nie przejdzie, przydziału nie ma.
  await wpisz(page, { lata: 40, mies: 9, masa: 97, data: '2024-11-01' });
  await expect(page.locator('#obesityWhy-continue')).toHaveText('Data w przerwie między cyklem 1 a 2');
  await expect(page.locator('#obesityWhy-end')).toHaveText('Cykl 1 jest już zakończony');
  await expect(page.locator('#obesityWhy-start')).toHaveText('Cykl 2 ma już Włączenie (12.11.2024)');
  await expect(page.locator('#obesityTherapyAssign')).toBeHidden();

  // Wstecz, w trakcie zakończonego cyklu 1: Kontynuacja trafia do cyklu 1.
  await wpisz(page, { lata: 40, mies: 6, masa: 98, data: '2024-07-15' });
  await expect(page.locator('#obesityTherapyAssign')).toHaveText('Ta wizyta trafi do cyklu 1 (zakończony 15.10.2024).');
  await przycisk(page, 'Kontynuacja leczenia').click();
  await blok(page, 1).locator('.obm-ctoggle').click();
  expect(await redukcje(blok(page, 1))).toEqual([['—', '—'], ['−4,8%', '−4,8%'], ['−5,8%', '−5,8%'], ['−6,3%', '−6,3%']]);
});

test('baner starego zapisu: „Zmień na Kontynuację” usuwa niezgodność', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, STARY);
  const baner = page.locator('#obesityTherapyFixBanner');
  await expect(baner).toBeVisible();
  const t = await tekst(baner);
  expect(t).toContain('Zapis wymaga uporządkowania. Nie spełnia reguł cykli leczenia. Nic nie zmienia się samo — popraw go:');
  expect(t).toContain('W cyklu 1 są dwa punkty „Włączenie” (12.01.2024 i 03.05.2024) bez Zakończenia między nimi.');
  await expect(blok(page, 1).locator('.obm-chip.warn')).toHaveText('do uporządkowania');

  const pytania = [];
  page.on('dialog', async (d) => { pytania.push(d.message()); await d.accept(); });
  await baner.getByRole('button', { name: 'Zmień 03.05.2024 na Kontynuację' }).click();
  await expect(baner).toBeHidden();
  expect(pytania).toEqual(['Zmienić punkt 03.05.2024 z „Włączenie” na „Kontynuacja”?']);
  expect(await punkty(page)).toEqual(['start:2024-01-12', 'continue:2024-04-12', 'continue:2024-05-03', 'continue:2024-09-01']);
});

test('baner starego zapisu: dopisane Zakończenie rozdziela dwa Włączenia na dwa cykle', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, STARY);
  const baner = page.locator('#obesityTherapyFixBanner');
  await baner.getByRole('button', { name: 'Dopisz Zakończenie przed 03.05.2024' }).click();
  await expect(komunikat(page)).toHaveText('Wpisz dane wizyty, która zakończyła wcześniejszy cykl — datę (przed 03.05.2024), masę i wzrost — i wybierz „Zakończenie leczenia”.');

  await wpisz(page, { lata: 40, mies: 3, masa: 99, data: '2024-04-30' });
  await expect(przycisk(page, 'Zakończenie leczenia')).not.toHaveAttribute('aria-disabled', 'true');
  await przycisk(page, 'Zakończenie leczenia').click();
  await expect(baner).toBeHidden();
  const kolejnosc = await page.locator('#obesityTherapyTableWrap .obm-cycle').evaluateAll((b) => b.map((x) => x.getAttribute('data-cykl')));
  expect(kolejnosc).toEqual(['2', '1']);
  expect(await naglowek(page, 2)).toContain('od Włączenia −3,0%');
});

test('cykl bez Włączenia po zakończonym: redukcja od jego 1. punktu, z podpisem w nagłówkach kolumn', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, [...CYKL1, P('k1', 'continue', 41, 3, 108, '2025-04-07', 'Wegovy'), P('k2', 'continue', 41, 8, 101, '2025-09-15', 'Wegovy')]);
  const n2 = await naglowek(page, 2);
  expect(n2).toContain('Cykl 2 aktywny bez Włączenia');
  expect(n2).toContain('od 1. punktu −6,5%');
  expect(await blok(page, 2).locator('th.obm-th-red').allTextContents()).toEqual(['Redukcja masy (od 1. punktu)', 'Redukcja BMI (od 1. punktu)']);
  expect(await redukcje(blok(page, 2))).toEqual([['—', '—'], ['−6,5%', '−6,5%']]);
});

test('telefon (390 px): dwa cykle i baner bez poziomego przewijania strony', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await otworzMonitor(page, [...CYKL1, ...CYKL2]);
  await blok(page, 1).scrollIntoViewIfNeeded();
  const pomiar = await page.evaluate(() => {
    const naglowki = [...document.querySelectorAll('#obesityTherapyTableWrap .obm-chead')].map((h) => h.getBoundingClientRect());
    const p = document.querySelector('#obesityTherapyTableWrap .obm-ctoggle').getBoundingClientRect();
    return {
      przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      prawo: Math.max(...naglowki.map((r) => r.right)),
      szerokoscOkna: window.innerWidth,
      przelacznik: p.height,
    };
  });
  expect(pomiar.przewijanie).toBeLessThanOrEqual(0);
  expect(pomiar.prawo).toBeLessThanOrEqual(pomiar.szerokoscOkna);
  expect(pomiar.przelacznik).toBeGreaterThanOrEqual(44);
});
