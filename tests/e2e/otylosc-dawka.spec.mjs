import { expect, test } from '../support/test-czas.mjs';

// P-OTYLOSC-DAWKA (temat B projektu „Leczenie otyłości — wpisy poza wizytą”; decyzja właściciela 2026-11-19:
// „Przecinek + podpowiedzi”). Dawka zostaje wolnym tekstem i zapisuje się tak, jak ją wpisano. Zmienia się widok:
//   DW-1 monitor DocPro: tabela punktów pokazuje przecinek dziesiętny; pod formularzem — przyciski z dawkami z tabeli
//        ChPL wybranego leku (kliknięcie wpisuje dawkę), zdania o dawkach spoza zwykłego schematu; bez leku — nic;
//   DW-2 Karta pacjenta: „Wpisy leczenia” i podsumowanie „Leczenie otyłości” z przecinkiem; zapis bez zmian;
//   DW-3 telefon: przyciski dawek ≥ 44 px, bez poziomego przewijania.
// Dane pacjentów wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block', chwila: '2026-11-18T12:00:00Z' });

const HASLO = 'E2e#OtyloscDawka!26';
const WEGOVY = 'Wegovy (semaglutyd) – s.c. 1×/tydz.';
const P = (id, type, dateISO, mies, weight, height, dose) => ({
  id, type, dateISO, ageYears: 13, ageMonths: mies, weight, height,
  bmi: height > 0 ? +(weight / Math.pow(height / 100, 2)).toFixed(1) : null, drug: WEGOVY, substance: '', dose,
});
// Dawki tak, jak bywają wpisane: z kropką, bez jednostki.
const MIGAWKA = [P('p-start', 'start', '2026-04-14', 0, 80, 160, '0.25'), P('p-paz', 'continue', '2026-10-13', 6, 75.2, 162.9, '2.4')];

async function docpro(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('pwzNumber', '6000001');
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked() && Boolean(window.VildaProAccess)
    && typeof window.obesityAddTherapyPoint === 'function' && Boolean(window.VildaDziennikOtylosci));
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
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
}

async function pacjentka(page) {
  return page.evaluate(async (pts) => (await window.VildaVault.savePatient({
    name: 'Testowa Zuzanna',
    user: { lastName: 'Testowa', firstName: 'Zuzanna', sex: 'F', age: 13, ageMonths: 6, height: 162.9, weight: 75.2, dobISO: '2013-04-11' },
    obesityTherapyPoints: pts,
  }, { dedup: false })).patientId, MIGAWKA);
}

async function wczytaj(page, pid) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (rekord) => { if (rekord) window.applyLoadedData(rekord); }, null), pid);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
  await page.locator('#vildaLcmRestore').click();
  await page.waitForSelector('#vildaLoadChoiceModal', { state: 'detached', timeout: 10000 }).catch(() => {});
  await page.waitForFunction((id) => window._vildaCurrentPatientId === id, pid);
  const przelacznik = page.locator('#toggleObesityTherapy');
  const wizyta = page.locator('#obesityMonitorSection .obm-visit button').first();
  await expect(przelacznik).toBeVisible({ timeout: 20000 });
  if (!(await page.locator('#obesityCard').isVisible())) await przelacznik.click();
  if (!(await page.locator('#obesityMonitorSection').isVisible())) await page.locator('#obesityTabMonBtn').click();
  await expect(wizyta).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1500);
}

const wybierzLek = (page, klucz) => page.locator('#obesityMonDrug').selectOption(klucz);

test.describe('Dawka leczenia otyłości: przecinek dziesiętny i podpowiedzi z ChPL', () => {
  test('DW-1: monitor — przecinek w tabeli; dawki z ChPL wybranego leku wpisują się kliknięciem', async ({ page }) => {
    test.setTimeout(120_000);
    await docpro(page);
    const pid = await pacjentka(page);
    await wczytaj(page, pid);

    const tabela = page.locator('#obesityTherapyTableWrap');
    await expect(tabela).toContainText('0,25');
    await expect(tabela).toContainText('2,4');
    await expect(tabela).not.toContainText('0.25');

    const podp = page.locator('#obesityDoseHints');
    await wybierzLek(page, '');
    await expect(podp).toBeHidden();

    await wybierzLek(page, 'wegovy');
    await expect(podp).toBeVisible();
    await expect(podp).toContainText('Dawki wg ChPL — Wegovy:');
    const dawki = podp.locator('button.obm-dawka');
    await expect(dawki).toHaveText(['0,25 mg / tydz.', '0,5 mg / tydz.', '1,0 mg / tydz.', '1,7 mg / tydz.', '2,4 mg / tydz.', '7,2 mg / tydz.']);
    await expect(podp).toContainText('7,2 mg / tydz. — tylko dorośli z wyjściowym BMI ≥30 kg/m²');
    await expect(dawki.filter({ hasText: '2,4 mg / tydz.' })).toHaveAttribute('title', 'Tyg. 17+ · dawka podtrzymująca');

    await page.locator('#obesityDose').fill('');
    await dawki.filter({ hasText: '1,7 mg / tydz.' }).click();
    await expect(page.locator('#obesityDose')).toHaveValue('1,7 mg / tydz.');
    await expect(dawki.filter({ hasText: '1,7 mg / tydz.' })).toHaveAttribute('aria-pressed', 'true');
    await expect(dawki.filter({ hasText: '2,4 mg / tydz.' })).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#obesityDose').fill('1,7 mg 1×/tydz.');
    await expect(dawki.filter({ hasText: '1,7 mg / tydz.' }), 'własny tekst — żaden przycisk nie wciśnięty').toHaveAttribute('aria-pressed', 'false');

    await wybierzLek(page, 'saxenda');
    await expect(podp).toContainText('Dawki wg ChPL — Saxenda:');
    await expect(dawki).toHaveText(['0,6 mg / dobę', '1,2 mg / dobę', '1,8 mg / dobę', '2,4 mg / dobę', '3,0 mg / dobę']);

    await wybierzLek(page, 'mounjaro');
    await expect(dawki).toHaveText(['2,5 mg / tydz.', '5 mg / tydz.']);
    await expect(podp).toContainText('Podtrzymująco: 5, 10 lub 15 mg (maks. 15 mg 1×/tydz.)');

    await wybierzLek(page, 'mysimba');
    await expect(dawki.first()).toHaveText('1 tabl. rano');
    await expect(podp).not.toContainText('/ tydz.');
    await expect(podp).toContainText('2 tabl. rano + 2 tabl. wieczorem — maks. 4 tabl./dobę');

    // Edycja punktu: lista leku wraca do leku punktu, podpowiedzi za nią.
    await page.locator('#obesityTherapyTableWrap .obm-edit').first().click();
    await expect(page.locator('#obesityMonDrug')).toHaveValue('wegovy');
    await expect(podp).toContainText('Dawki wg ChPL — Wegovy:');
  });

  test('DW-2: Karta pacjenta — dawka z przecinkiem w „Wpisy leczenia” i w podsumowaniu; zapis bez zmian', async ({ page }) => {
    test.setTimeout(120_000);
    await docpro(page);
    const pid = await pacjentka(page);
    await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), pid);
    // P-KARTA-LECZENIE (etap 1): bloki leczenia stoją w zakładce „Leczenie” (druga, po „Status”).
    await page.locator('.vilda-patient-tab[data-tab="leczenie"]').click();
    await expect(page.locator('.vdo')).toBeVisible({ timeout: 15000 });
    const wiersz = (d) => page.locator(`.vdo-list:not(.vdo-list-deleted) > .vdo-item[data-date="${d}"]`);
    await expect(wiersz('2026-04-14').locator('.vdo-type')).toHaveText('Włączenie · 0,25');
    await expect(wiersz('2026-10-13').locator('.vdo-type')).toHaveText('Kontynuacja · 2,4');
    const dawka = page.locator('.vilda-gh-summary-grid > div').filter({ has: page.locator('.vilda-gh-summary-k', { hasText: /^Aktualna dawka$/ }) });
    await expect(dawka.locator('.vilda-gh-summary-v')).toHaveText('2,4');
    const zapis = await page.evaluate(async (id) => (await window.VildaVault.getPatient(id)).snapshots[0].payload.obesityTherapyPoints.map((p) => p.dose), pid);
    expect(zapis, 'sejf bez zmian — tylko widok').toEqual(['0.25', '2.4']);
  });

  test('DW-3: telefon — przyciski dawek ≥ 44 px, bez poziomego przewijania', async ({ page }) => {
    test.setTimeout(120_000);
    await docpro(page);
    const pid = await pacjentka(page);
    await wczytaj(page, pid);
    await page.setViewportSize({ width: 390, height: 844 });
    await wybierzLek(page, 'wegovy');
    const dawki = page.locator('#obesityDoseHints button.obm-dawka');
    await expect(dawki).toHaveCount(6);
    const wysokosci = await dawki.evaluateAll((b) => b.map((x) => x.getBoundingClientRect().height));
    for (const h of wysokosci) expect(h).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
