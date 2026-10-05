import { expect, test } from '@playwright/test';

// P-OTYLOSC-CYKLE rata 4, obszar modułu (decyzja właściciela 2026-09-30, D3: „zmiana substancji
// czynnej zaczyna nowy cykl”; 2026-10-01: „ruszaj z ratą 4”). R6 żyje w module
// vilda_cykle_leczenia.js — monitor DocPro woła go przy zapisie wizyty i przy edycji bez żadnej
// zmiany po swojej stronie, a substancję rozpoznają produkcyjne kryteria ChPL ładowane na stronie
// wcześniej. Ten plik sprawdza tę drogę w prawdziwym DocPro: kliknięcie i zapis edycji. Podgląd
// pod przyciskami (lek z listy w kandydacie podglądu) i baner porządkowania (druga fala) sprawdza
// otylosc-cykle-rata-4.spec.mjs.
// Dane wyłącznie FIKCYJNE: dorosły, 170 cm; leki zapisane jak w monitorze (tekst opcji listy
// i etykieta substancji).

const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP\u20111)' };
const M = (id, type, lata, mies, masa, data, lek = SAXENDA) => ({
  id, type, ageYears: lata, ageMonths: mies, weight: masa, height: 170, dateISO: data, dose: '', ...lek,
});
const W_SAX = M('a', 'start', 40, 0, 104, '2024-01-12');
const K_SAX = M('b', 'continue', 40, 3, 99, '2024-04-12');

const HASLO = 'E2e#CykleRata4M!26';

async function otworzMonitor(page, punkty) {
  // Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki i moduł lekarski w trybie
  // profesjonalnym — wzorzec z otylosc-cykle-rata-1.spec.mjs (DocPro wymaga planu PRO).
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
    && typeof window.obesityAddTherapyPoint === 'function' && Boolean(window.VildaCykleLeczenia)
    && Boolean(window.ObesityResponseCriteria));
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
  await expect(page.locator('#obesityMonDrug option[value="wegovy"]')).toHaveCount(1);
}

async function wpisz(page, pola) {
  await page.evaluate((p) => {
    // Zdarzenie „input” jak przy pisaniu — monitor przelicza wtedy przyciski i przydział do cyklu.
    const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('obesityAge', p.lata); set('obesityAgeMonths', p.mies);
    set('obesityWeight', p.masa); set('obesityHeight', 170);
    set('obesityDose', p.dawka || ''); set('obesityDate', p.data);
  }, pola);
}

const przycisk = (page, nazwa) => page.locator('#obesityMonitorSection .obm-visit button', { hasText: nazwa });
const komunikat = (page) => page.locator('#obesityTherapyActionMsg');
const punkty = (page) => page.evaluate(() => (window.obesityTherapyPoints || []).map((p) => `${p.type}:${p.dateISO}:${String(p.drug).split(' ')[0]}`));

const KOMUNIKAT_CY11 = 'Ta wizyta ma inną substancję czynną (Wegovy) niż wcześniejsze wizyty cyklu 1 (Saxenda). Zmiana substancji czynnej zaczyna nowy cykl: zapisz najpierw Zakończenie cyklu 1 z lekiem Saxenda (może mieć tę samą datę), a tę wizytę jako Włączenie nowego cyklu.';

test('CY-11: Kontynuacja z Wegovy w cyklu Saxendy nie zostaje dodana; z Saxendą przechodzi', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, [W_SAX]);
  await wpisz(page, { lata: 40, mies: 3, masa: 99, data: '2024-04-12' });
  await page.selectOption('#obesityMonDrug', 'wegovy');
  // force: po drugiej fali przycisk będzie wyłączony z powodem (aria-disabled); kliknięcie nadal działa.
  await przycisk(page, 'Kontynuacja leczenia').click({ force: true });
  await expect(komunikat(page)).toBeVisible();
  await expect(komunikat(page)).toHaveClass(/\berr\b/);
  await expect(komunikat(page)).toHaveText(KOMUNIKAT_CY11);
  expect(await punkty(page)).toEqual(['start:2024-01-12:Saxenda']);

  await page.selectOption('#obesityMonDrug', 'saxenda');
  await przycisk(page, 'Kontynuacja leczenia').click();
  await expect(komunikat(page)).toBeHidden();
  expect(await punkty(page)).toEqual(['start:2024-01-12:Saxenda', 'continue:2024-04-12:Saxenda']);
});

test('R6: Zakończenie z nowym lekiem jest odrzucane — Zakończenie zapisuje się z lekiem cyklu', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, [W_SAX, K_SAX]);
  await wpisz(page, { lata: 40, mies: 9, masa: 97.5, data: '2024-10-15' });
  await page.selectOption('#obesityMonDrug', 'wegovy');
  await przycisk(page, 'Zakończenie leczenia').click({ force: true });
  await expect(komunikat(page)).toHaveText('Zakończenie zamyka cykl 1 — zapisz je z lekiem tego cyklu (Saxenda). Nowy lek (Wegovy) zapiszesz potem jako Włączenie nowego cyklu, także tego samego dnia.');
  expect(await punkty(page)).toHaveLength(2);

  // Zmiana leku bez przerwy (CY-8): Zakończenie z Saxendą, potem Włączenie Wegovy tego samego dnia.
  await page.selectOption('#obesityMonDrug', 'saxenda');
  await przycisk(page, 'Zakończenie leczenia').click();
  await expect(komunikat(page)).toBeHidden();
  await wpisz(page, { lata: 40, mies: 9, masa: 97.5, data: '2024-10-15' });
  await page.selectOption('#obesityMonDrug', 'wegovy');
  await przycisk(page, 'Włączenie leczenia').click();
  await expect(komunikat(page)).toBeHidden();
  expect(await punkty(page)).toEqual(['start:2024-01-12:Saxenda', 'continue:2024-04-12:Saxenda', 'end:2024-10-15:Saxenda', 'start:2024-10-15:Wegovy']);
  expect(await page.evaluate(() => window.VildaCykleLeczenia.podziel(window.obesityTherapyPoints).niezgodnosci.length)).toBe(0);
});

test('R6: zmiana leku Włączenia w cyklu z wizytami jest odrzucana przy zapisie edycji', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, [W_SAX, K_SAX]);
  const out = await page.evaluate(() => {
    const pytania = [];
    const confirm = window.confirm;
    window.confirm = (m) => { pytania.push(String(m)); return true; };
    window.obesityEditTherapyPoint('a');
    const sel = document.getElementById('obesityMonDrug');
    sel.value = 'wegovy';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const zapisano = window.obesitySaveTherapyPointEdit('start');
    window.confirm = confirm;
    const a = (window.obesityTherapyPoints || []).find((p) => String(p.id) === 'a');
    return { zapisano, pytania, lek: a.drug };
  });
  expect(out.zapisano).toBe(false);
  expect(out.lek).toBe(SAXENDA.drug);
  await expect(komunikat(page)).toHaveText('Wizyty cyklu 1 mają inną substancję czynną (Saxenda) niż to Włączenie (Wegovy). Włączenie musi mieć lek swojego cyklu — popraw lek albo datę.');
});

test('telefon (390 px): komunikat R6 mieści się przy przyciskach bez poziomego przewijania', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await otworzMonitor(page, [W_SAX]);
  await wpisz(page, { lata: 40, mies: 3, masa: 99, data: '2024-04-12' });
  await page.selectOption('#obesityMonDrug', 'wegovy');
  await przycisk(page, 'Kontynuacja leczenia').click({ force: true });
  const m = komunikat(page);
  await expect(m).toHaveText(KOMUNIKAT_CY11);
  await m.scrollIntoViewIfNeeded();
  const pomiar = await page.evaluate(() => {
    const r = document.getElementById('obesityTherapyActionMsg').getBoundingClientRect();
    return {
      przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      lewo: r.left, prawo: r.right, szerokoscOkna: window.innerWidth,
    };
  });
  expect(pomiar.przewijanie).toBeLessThanOrEqual(0);
  expect(pomiar.lewo).toBeGreaterThanOrEqual(0);
  expect(pomiar.prawo).toBeLessThanOrEqual(pomiar.szerokoscOkna);
});
