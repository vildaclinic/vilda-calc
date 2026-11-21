import { expect, test } from '../support/test-czas.mjs';

// P-OTYLOSC-WZROST, etap 1, na telefonie (projekt mobile-chromium). Karta pacjenta: stan „Potrzebny pomiar
// wzrostu do oceny ChPL” i kafelek „Wzrost do oceny” mieszczą się na ekranie bez przewijania w bok. Monitor DocPro:
// podpowiedź ostatniego wzrostu, reguła pod przyciskami i komunikat odmowy też. Dane wyłącznie FIKCYJNE.
test.use({ chwila: '2026-11-18T12:00:00Z', reducedMotion: 'reduce' });
test.setTimeout(150_000);

const HASLO = 'E2e#WzrostMobile!26';
const WEGOVY = 'Wegovy (semaglutyd) – s.c. 1×/tydz.';
const P = (id, type, dateISO, mies, weight, height) => ({
  id, type, dateISO, ageYears: 13, ageMonths: mies, weight, height,
  bmi: height > 0 ? +(weight / Math.pow(height / 100, 2)).toFixed(1) : null, drug: WEGOVY, substance: '', dose: '2,4 mg / tydz.',
});
const PUNKTY = [
  P('w', 'start', '2026-04-14', 0, 80, 160),
  P('k6', 'continue', '2026-10-13', 6, 75.2, 162.9),
  P('k7', 'continue', '2026-11-10', 7, 74.6, null),
];

const bezPrzewijaniaWBok = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const wEkranie = (locator) => locator.evaluate((el) => {
  const b = el.getBoundingClientRect();
  return b.left >= -1 && b.right <= document.documentElement.clientWidth + 1;
});

async function konto(page, strona) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('pwzNumber', '0000000');
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto(strona, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

test('telefon: Karta — „Potrzebny pomiar wzrostu do oceny ChPL” i kafelek wzrostu bez przewijania w bok', async ({ page }) => {
  await konto(page, '/index.html');
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.ObesityResponseCriteria));
  const pid = await page.evaluate(async (pts) => (await window.VildaVault.savePatient({
    name: 'Testowa Zuzanna',
    user: { lastName: 'Testowa', firstName: 'Zuzanna', sex: 'F', age: 13, ageMonths: 7, height: 163, weight: 74.6 },
    obesityTherapyPoints: pts,
  }, { dedup: false })).patientId, PUNKTY);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), pid);
  // P-KARTA-LECZENIE (etap 1): bloki leczenia stoją w zakładce „Leczenie” (druga, po „Status”).
  await page.locator('.vilda-patient-tab[data-tab="leczenie"]').click();
  // P-KARTA-LECZENIE (etap 2): panel „Dane analityczne — otyłość” to widok „Analiza” karty leczenia (dotąd belka).
  const przycisk = page.locator('.vilda-ko-seg').getByRole('tab', { name: 'Analiza' });
  await przycisk.scrollIntoViewIfNeeded();
  await przycisk.click();
  const werdykt = page.locator('.vilda-oba-verdict');
  await werdykt.scrollIntoViewIfNeeded();
  await expect(werdykt.locator('.vilda-oba-vt')).toHaveText('Potrzebny pomiar wzrostu do oceny ChPL');
  const kafelek = page.locator('.vilda-gha-tile', { has: page.locator('.vilda-gha-k', { hasText: 'Wzrost do oceny' }) });
  await expect(kafelek).toBeVisible();
  expect(await wEkranie(werdykt)).toBe(true);
  expect(await wEkranie(kafelek)).toBe(true);
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
});

test('telefon: monitor DocPro — ostatni wzrost, reguła pod przyciskami i odmowa bez daty mieszczą się na ekranie', async ({ page }) => {
  await konto(page, '/docpro.html');
  await page.waitForFunction(() => Boolean(window.VildaProAccess) && typeof window.obesityAddTherapyPoint === 'function'
    && Boolean(window.VildaCykleLeczenia));
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const tryb = document.getElementById('resultsModeToggle');
    if (tryb && !tryb.checked) { tryb.checked = true; tryb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(1200);
  const potwierdzam = page.locator('#professionalConfirmBtn');
  if (await potwierdzam.isVisible()) await potwierdzam.click();
  const bezAnalityki = page.getByRole('button', { name: 'Nie zgadzam się', exact: true });
  if (await bezAnalityki.isVisible()) await bezAnalityki.click();
  await page.evaluate((pts) => {
    window.obesityTherapyMonitorSetPoints(pts);
    const karta = document.getElementById('obesityCard');
    if (!karta || karta.style.display === 'none' || !karta.style.display) document.getElementById('toggleObesityTherapy').click();
    document.getElementById('obesityTabMonBtn').click();
  }, PUNKTY.slice(0, 2));
  await expect(page.locator('#obesityMonitorSection')).toBeVisible({ timeout: 10000 });

  const ostatni = page.locator('#obesityHeightLast');
  await expect(ostatni).toHaveText('Ostatni wzrost: 162,9 cm · 13.10.2026');
  await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); };
    set('obesityAge', 13); set('obesityAgeMonths', 7); set('obesityWeight', 74.6); set('obesityHeight', ''); set('obesityDate', '');
  });
  const kontynuacja = page.locator('#obesityMonitorSection .obm-visit button', { hasText: 'Kontynuacja leczenia' });
  await kontynuacja.scrollIntoViewIfNeeded();
  await kontynuacja.click({ force: true });
  const komunikat = page.locator('#obesityTherapyActionMsg');
  await expect(komunikat).toContainText('wymaga daty wizyty');
  for (const el of [ostatni, page.locator('#obesityMonitorSection .obm-rule'), komunikat, page.locator('#obesityWhy-continue')]) {
    expect(await wEkranie(el)).toBe(true);
  }
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
});
