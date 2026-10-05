import { expect, test } from '@playwright/test';

// P-OTYLOSC-CYKLE rata 4, obszar monitora DocPro (decyzja właściciela 2026-09-30, D3: „zmiana
// substancji czynnej zaczyna nowy cykl”; 2026-10-01: „ruszaj z ratą 4”). Regułę R6 zna moduł
// vilda_cykle_leczenia.js (fala 1, otylosc-cykle-rata-4-modul.spec.mjs: odmowa przy kliknięciu
// i przy zapisie edycji). Ten plik sprawdza w prawdziwym DocPro to, co dokłada monitor:
//   • podgląd pod przyciskami liczy wizytę Z LEKIEM Z LISTY i odświeża się po zmianie leku —
//     Kontynuacja/Zakończenie z innym lekiem są wyłączone (aria-disabled) z krótkim powodem;
//   • baner porządkowania ma pozycję dla zmiany substancji w cyklu i dwukrokową poprawkę (z przypomnieniem
//     o kroku 2), a przy kilku zmianach w cyklu i przy drugim Włączeniu z innym lekiem nie prowadzi w złą stronę.
// Dane wyłącznie FIKCYJNE: dorosły, 170 cm; leki zapisane jak w monitorze (tekst opcji listy
// i etykieta substancji).

const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP‑1)' };
const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'Semaglutyd (agonista receptora GLP‑1)' };
const M = (id, type, lata, mies, masa, data, lek = SAXENDA) => ({
  id, type, ageYears: lata, ageMonths: mies, weight: masa, height: 170, dateISO: data, dose: '', ...lek,
});
const W_SAX = M('a', 'start', 40, 0, 104, '2024-01-12');
const K_SAX = M('b', 'continue', 40, 3, 99, '2024-04-12');
// Stary zapis sprzed raty 4: lek zmieniony w trakcie cyklu bez Zakończenia (Saxenda → Wegovy).
const STARY = [W_SAX, K_SAX, M('e', 'continue', 40, 6, 97, '2024-07-12', WEGOVY), M('f', 'continue', 40, 9, 95, '2024-10-12', WEGOVY)];

const HASLO = 'E2e#CykleRata4B!26';

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
const powod = (page, typ) => page.locator(`#obesityWhy-${typ}`);
const komunikat = (page) => page.locator('#obesityTherapyActionMsg');
const punkty = (page) => page.evaluate(() => (window.obesityTherapyPoints || []).map((p) => `${p.type}:${p.dateISO}:${String(p.drug).split(' ')[0]}`));
const blok = (page, n) => page.locator(`#obesityTherapyTableWrap .obm-cycle[data-cykl="${n}"]`);
const naglowek = (page, n) => blok(page, n).locator('.obm-chead').evaluate((e) => [...e.children].map((c) => c.textContent.trim()).join(' '));
const tekst = (loc) => loc.evaluate((e) => e.textContent.replace(/\s+/g, ' ').trim());

const KOMUNIKAT_CY11 = 'Ta wizyta ma inną substancję czynną (Wegovy) niż wcześniejsze wizyty cyklu 1 (Saxenda). Zmiana substancji czynnej zaczyna nowy cykl: zapisz najpierw Zakończenie cyklu 1 z lekiem Saxenda (może mieć tę samą datę), a tę wizytę jako Włączenie nowego cyklu.';
const POZYCJA_R6 = 'W cyklu 1 zmienia się substancja czynna: Saxenda (do 12.04.2024) → Wegovy (od 12.07.2024) bez Zakończenia między nimi.';
const PRZYPOMNIENIE_KROK_2 = 'Zakończenie zapisane. Teraz zmień wizytę 12.07.2024 na Włączenie (ołówek przy wizycie) — nie dopisuj nowego Włączenia.';
const PODPOWIEDZ_R6 = 'Wpisz wizytę kończącą leczenie Saxenda — datę (najpóźniej 12.07.2024; może być ten sam dzień), masę i wzrost — wybierz w liście lek Saxenda i „Zakończenie leczenia”. Potem zmień wizytę 12.07.2024 na Włączenie (ołówek przy wizycie).';

test('CY-11: przyciski z innym lekiem wyłączone z powodem i odświeżane po zmianie leku na liście', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, [W_SAX]);
  await wpisz(page, { lata: 40, mies: 3, masa: 99, data: '2024-04-12' });
  // Bez leku na liście wizyta jest neutralna — Kontynuacja aktywna, jak przed ratą 4.
  await expect(przycisk(page, 'Kontynuacja leczenia')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#obesityTherapyAssign')).toHaveText('Ta wizyta trafi do cyklu 1 (aktywny, od 12.01.2024).');

  // Sama zmiana leku na liście (bez dotykania pól) przelicza podgląd.
  await page.selectOption('#obesityMonDrug', 'wegovy');
  await expect(przycisk(page, 'Kontynuacja leczenia')).toHaveAttribute('aria-disabled', 'true');
  await expect(powod(page, 'continue')).toHaveText('Inna substancja niż w cyklu 1 (Saxenda)');
  await expect(przycisk(page, 'Zakończenie leczenia')).toHaveAttribute('aria-disabled', 'true');
  await expect(powod(page, 'end')).toHaveText('Zakończenie z lekiem cyklu 1 (Saxenda)');
  await expect(page.locator('#obesityTherapyAssign')).toBeHidden();

  // Kliknięcie nadal działa (aria-disabled nie blokuje klawiatury ani czytnika) i mówi pełne zdanie.
  await przycisk(page, 'Kontynuacja leczenia').click({ force: true });
  await expect(komunikat(page)).toHaveClass(/\berr\b/);
  await expect(komunikat(page)).toHaveText(KOMUNIKAT_CY11);
  expect(await punkty(page)).toEqual(['start:2024-01-12:Saxenda']);

  await page.selectOption('#obesityMonDrug', 'saxenda');
  await expect(przycisk(page, 'Kontynuacja leczenia')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(przycisk(page, 'Zakończenie leczenia')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(powod(page, 'continue')).toBeHidden();
  await expect(page.locator('#obesityTherapyAssign')).toHaveText('Ta wizyta trafi do cyklu 1 (aktywny, od 12.01.2024).');
  await przycisk(page, 'Kontynuacja leczenia').click();
  expect(await punkty(page)).toEqual(['start:2024-01-12:Saxenda', 'continue:2024-04-12:Saxenda']);
});

test('edycja: zmiana leku Włączenia na inny wyłącza przycisk z powodem, zanim cokolwiek się zapisze', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, [W_SAX, K_SAX]);
  await page.locator('#obesityTherapyTableWrap button.obm-edit[data-id="a"]').click();
  await expect(page.locator('#obesityEditBar')).toContainText('Edytujesz punkt: Włączenie');
  await expect(page.locator('#obesityMonDrug')).toHaveValue('saxenda');
  await expect(przycisk(page, 'Włączenie leczenia')).not.toHaveAttribute('aria-disabled', 'true');
  await page.selectOption('#obesityMonDrug', 'wegovy');
  await expect(przycisk(page, 'Włączenie leczenia')).toHaveAttribute('aria-disabled', 'true');
  await expect(powod(page, 'start')).toHaveText('Inna substancja niż wizyty cyklu 1 (Saxenda)');
});

test('stary zapis Saxenda → Wegovy w jednym cyklu: pozycja banera i poprawka w dwóch krokach', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, STARY);
  const pytania = [];
  page.on('dialog', async (d) => { pytania.push(d.message()); await d.accept(); });

  const baner = page.locator('#obesityTherapyFixBanner');
  await expect(baner).toBeVisible();
  const t = await tekst(baner);
  expect(t).toContain('Zapis wymaga uporządkowania. Nie spełnia reguł cykli leczenia. Nic nie zmienia się samo — popraw go:');
  expect(t).toContain(POZYCJA_R6);
  await expect(blok(page, 1).locator('.obm-chip.warn')).toHaveText('do uporządkowania');

  // „Edytuj wizytę” — na wypadek pomyłki w leku: ołówek dla pierwszej wizyty nowej substancji.
  await baner.getByRole('button', { name: 'Edytuj wizytę 12.07.2024' }).click();
  await expect(page.locator('#obesityEditBar')).toContainText('Edytujesz punkt: Kontynuacja');
  await expect(page.locator('#obesityMonDrug')).toHaveValue('wegovy');

  // Krok 1: Zakończenie Saxendy najpóźniej w dniu pierwszej wizyty Wegovy.
  await baner.getByRole('button', { name: 'Dopisz Zakończenie przed 12.07.2024' }).click();
  await expect(page.locator('#obesityEditBar')).toBeHidden();
  await expect(komunikat(page)).toHaveClass(/\bwarn\b/);
  await expect(komunikat(page)).toHaveText(PODPOWIEDZ_R6);
  expect(await punkty(page), 'podpowiedź niczego nie zapisuje').toHaveLength(4);

  await wpisz(page, { lata: 40, mies: 6, masa: 97, data: '2024-07-12' });
  await page.selectOption('#obesityMonDrug', 'wegovy');
  await expect(przycisk(page, 'Zakończenie leczenia')).toHaveAttribute('aria-disabled', 'true');
  await expect(powod(page, 'end')).toHaveText('Zakończenie z lekiem cyklu 1 (Saxenda)');
  await page.selectOption('#obesityMonDrug', 'saxenda');
  await expect(przycisk(page, 'Zakończenie leczenia')).not.toHaveAttribute('aria-disabled', 'true');
  await przycisk(page, 'Zakończenie leczenia').click();
  await expect(baner).toBeHidden();
  const kolejnosc = await page.locator('#obesityTherapyTableWrap .obm-cycle').evaluateAll((b) => b.map((x) => x.getAttribute('data-cykl')));
  expect(kolejnosc).toEqual(['2', '1']);
  expect(await naglowek(page, 2)).toContain('Cykl 2 aktywny bez Włączenia');
  expect(await naglowek(page, 1)).toContain('Cykl 1 zakończony Saxenda');
  // Baner zniknął (cykl bez Włączenia to nie niezgodność), więc krok 2 przypomina komunikat — zamiast
  // ogólnej rady „Dodaj go (także wstecznie)”, która prowadziłaby do drugiej wizyty z tą samą datą.
  await expect(komunikat(page)).toBeVisible();
  await expect(komunikat(page)).toHaveClass(/\bwarn\b/);
  await expect(komunikat(page).locator('.obm-msg-t')).toHaveText(PRZYPOMNIENIE_KROK_2);
  expect(await punkty(page), 'przypomnienie niczego nie zapisuje').toHaveLength(5);

  // Krok 2: pierwsza wizyta Wegovy staje się Włączeniem nowego cyklu (przycisk przypomnienia = ołówek przy wizycie).
  await komunikat(page).getByRole('button', { name: 'Edytuj wizytę 12.07.2024' }).click();
  await expect(page.locator('#obesityEditBar')).toContainText('Edytujesz punkt: Kontynuacja');
  await expect(page.locator('#obesityMonDrug')).toHaveValue('wegovy');
  await expect(przycisk(page, 'Włączenie leczenia')).not.toHaveAttribute('aria-disabled', 'true');
  await przycisk(page, 'Włączenie leczenia').click();
  await expect(baner).toBeHidden();
  await expect(komunikat(page)).toBeHidden();
  // Nazwa leku w nagłówku cyklu to tekst opcji przed „ –” (CyL), tu „Wegovy (semaglutyd)”.
  expect(await naglowek(page, 2)).toMatch(/^Cykl 2 aktywny Wegovy \(semaglutyd\) · od 12\.07\.2024 · /);
  expect(await naglowek(page, 2)).not.toContain('bez Włączenia');
  expect(await punkty(page)).toEqual(['start:2024-01-12:Saxenda', 'continue:2024-04-12:Saxenda', 'end:2024-07-12:Saxenda', 'start:2024-07-12:Wegovy', 'continue:2024-10-12:Wegovy']);
  expect(await page.evaluate(() => window.VildaCykleLeczenia.podziel(window.obesityTherapyPoints).niezgodnosci.length)).toBe(0);
  expect(pytania.some((p) => p.startsWith('Ten punkt jest odniesieniem')), 'zmiana na Włączenie pyta o punkt odniesienia').toBe(true);
});

test('Saxenda → Wegovy → Zakończenie z Saxendą: pozycja Zakończenia mówi o sąsiedniej wizycie i daje edycję obu', async ({ page }) => {
  test.setTimeout(120_000);
  // Jedna pomyłkowa wizyta (Wegovy) w środku cyklu Saxendy, który kończy Zakończenie z Saxendą.
  await otworzMonitor(page, [W_SAX, K_SAX, M('e', 'continue', 40, 6, 97, '2024-07-12', WEGOVY), M('c', 'end', 40, 9, 97.5, '2024-10-15')]);
  const baner = page.locator('#obesityTherapyFixBanner');
  await expect(baner).toBeVisible();
  const pozycje = baner.locator('.obm-fix-list > li');
  await expect(pozycje).toHaveCount(2);
  expect(await tekst(pozycje.nth(0).locator('span').first())).toBe(POZYCJA_R6);
  expect(await tekst(pozycje.nth(1).locator('span').first())).toBe('Zakończenie cyklu 1 (15.10.2024) ma inny lek (Saxenda) niż wcześniejsza wizyta tego cyklu (Wegovy, 12.07.2024). Lek zmienia się w tym cyklu więcej niż raz — sprawdź leki tych wizyt.');
  expect(await pozycje.nth(1).locator('button').allTextContents()).toEqual(['Edytuj wizytę 12.07.2024', 'Edytuj wizytę 15.10.2024']);

  // Poprawka pomyłkowej wizyty: Wegovy → Saxenda. Baner znika, w cyklu 1 nie ma niezgodności.
  await pozycje.nth(1).getByRole('button', { name: 'Edytuj wizytę 12.07.2024' }).click();
  await expect(page.locator('#obesityEditBar')).toContainText('Edytujesz punkt: Kontynuacja');
  await expect(page.locator('#obesityMonDrug')).toHaveValue('wegovy');
  await page.selectOption('#obesityMonDrug', 'saxenda');
  await expect(przycisk(page, 'Kontynuacja leczenia')).not.toHaveAttribute('aria-disabled', 'true');
  await przycisk(page, 'Kontynuacja leczenia').click();
  await expect(baner).toBeHidden();
  expect(await punkty(page)).toEqual(['start:2024-01-12:Saxenda', 'continue:2024-04-12:Saxenda', 'continue:2024-07-12:Saxenda', 'end:2024-10-15:Saxenda']);
});

test('drugie Włączenie z innym lekiem: akcje tylko w pozycji R6 (bez „Zmień na Kontynuację” i bez drugiego „Dopisz Zakończenie”)', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzMonitor(page, [W_SAX, K_SAX, M('g', 'start', 40, 6, 97, '2024-07-12', WEGOVY), M('h', 'continue', 40, 9, 95, '2024-10-12', WEGOVY)]);
  const pozycje = page.locator('#obesityTherapyFixBanner .obm-fix-list > li');
  await expect(pozycje).toHaveCount(2);
  expect(await tekst(pozycje.nth(0))).toBe('W cyklu 1 są dwa punkty „Włączenie” (12.01.2024 i 12.07.2024) bez Zakończenia między nimi.');
  await expect(pozycje.nth(0).locator('.obm-msg-actions')).toHaveCount(0);
  expect(await tekst(pozycje.nth(1).locator('span').first())).toBe(POZYCJA_R6);
  expect(await pozycje.nth(1).locator('button').allTextContents()).toEqual(['Dopisz Zakończenie przed 12.07.2024', 'Edytuj wizytę 12.07.2024']);
  await expect(page.locator('#obesityTherapyFixBanner').getByRole('button', { name: 'Dopisz Zakończenie przed 12.07.2024' })).toHaveCount(1);
});

test('telefon (390 px): baner R6 i powód pod przyciskiem bez poziomego przewijania', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await otworzMonitor(page, STARY);
  const baner = page.locator('#obesityTherapyFixBanner');
  await expect(baner).toContainText(POZYCJA_R6);
  await wpisz(page, { lata: 40, mies: 11, masa: 94, data: '2024-12-12' });
  await page.selectOption('#obesityMonDrug', 'saxenda');
  await expect(powod(page, 'continue')).toHaveText('Inna substancja niż w cyklu 1 (Wegovy)');
  await baner.scrollIntoViewIfNeeded();
  const pomiar = await page.evaluate(() => {
    const prawe = ['obesityTherapyFixBanner', 'obesityWhy-continue']
      .map((id) => document.getElementById(id).getBoundingClientRect())
      .concat([...document.querySelectorAll('#obesityTherapyFixBanner button')].map((b) => b.getBoundingClientRect()));
    return {
      przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      lewo: Math.min(...prawe.map((r) => r.left)),
      prawo: Math.max(...prawe.map((r) => r.right)),
      szerokoscOkna: window.innerWidth,
    };
  });
  expect(pomiar.przewijanie).toBeLessThanOrEqual(0);
  expect(pomiar.lewo).toBeGreaterThanOrEqual(0);
  expect(pomiar.prawo).toBeLessThanOrEqual(pomiar.szerokoscOkna);
});
