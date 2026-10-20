import { expect, test } from '../support/test-czas.mjs';

// P-PRO-BEZ-BANEROW (decyzje właściciela 2026-10-20): w trybie profesjonalnym (PRO) karty
// „Zaawansowane obliczenia wzrostowe" i „Obliczenia wzrostowe" nie pokazują banerów („Tempo wzrastania
// poniżej normy dla wieku, wskazana konsultacja endokrynologiczna, umów wizytę", obniżenie pozycji
// centylowej — ten drugi w baner-spadku-rata-t4) ani ramki alarmowej. Werdykt tempa zostaje w wierszu
// karty zaawansowanej, a model (advancedGrowthTrajectory.velocity.alarm) — dla podsumowania i Karty
// pacjenta — bez zmian. PRAWDZIWA strona, dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#ProBezBanera!26aa';

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
  await page.waitForFunction(() => Boolean(window.VildaTempoWzrastania) && Boolean(window.VildaTrajectoryAnalysis)
    && window.VildaTrajectoryAnalysis.version === '34');
  await page.waitForFunction(() => Boolean(window.VildaProAccess));
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const tryb = document.getElementById('resultsModeToggle');
    if (!tryb.checked) {
      tryb.checked = true;
      tryb.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await expect(page.locator('#resultsModeToggle')).toBeChecked();
}

// Dziewczynka 9 lat, 135 cm; rok wcześniej 131 cm → 4,0 cm/rok z 12 mies. przy normie 5–10 lat ≥5 cm/rok
// (alarm tempa). Pozycja na siatce prawie bez zmian — bez flagi obniżenia, więc baner mógłby pochodzić
// wyłącznie z tempa.
async function policz(page) {
  await page.evaluate(() => {
    document.getElementById('age').value = '9';
    document.getElementById('sex').value = 'F';
    document.getElementById('height').value = '135';
    document.getElementById('weight').value = '30';
    if (typeof window.update === 'function') window.update();
  });
  await page.waitForSelector('#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]', { state: 'attached' });
  await expect(page.locator('#toggleAdvancedGrowth')).toBeEnabled();
  if (!await page.locator('#advancedGrowthForm').isVisible()) await page.locator('#toggleAdvancedGrowth').click();
  await expect(page.locator('#advancedGrowthForm')).toBeVisible();
  await page.waitForSelector('#advMeasurements .measure-row');
  await page.evaluate(() => {
    const w = document.querySelector('#advMeasurements .measure-row');
    const set = (sel, v) => {
      const e = w.querySelector(sel);
      if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    set('.adv-age-years', '8');
    set('.adv-height', '131');
    set('.adv-weight', '27');
    if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced();
  });
  await page.waitForSelector('#advResults .vtap-tempo');
  // Karta podstawowa: ten sam wiersz historii w jej własnych polach i własne przeliczenie.
  await page.evaluate(() => {
    if (!document.querySelector('#basicGrowthMeasurements .measure-row')
      && typeof window.addBasicGrowthMeasurementRow === 'function') window.addBasicGrowthMeasurementRow();
    const w = document.querySelector('#basicGrowthMeasurements .measure-row');
    const set = (sel, v) => {
      const e = w && w.querySelector(sel);
      if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    set('.bg-age-years', '8');
    set('.bg-height', '131');
    set('.bg-weight', '27');
    if (typeof window.calculateBasicGrowth === 'function') window.calculateBasicGrowth();
  });
  await page.waitForFunction(() => /4,0 cm\/rok/.test(document.getElementById('basicGrowthResults')?.textContent || ''));
}

async function odczyt(page) {
  return page.evaluate(() => {
    const r = document.getElementById('advResults');
    const b = document.getElementById('basicGrowthResults');
    const t = window.advancedGrowthTrajectory || {};
    const TA = window.VildaTrajectoryAnalysis;
    return {
      karta: (r?.textContent || '').replace(/\s+/g, ' ').trim(),
      wiersz: (document.querySelector('#advResults .vtap-tempo')?.innerText || '').replace(/\s+/g, ' ').trim(),
      ramka: r ? r.style.borderColor : null,
      czcionka: r ? r.style.fontSize : null,
      podstawowa: (b?.textContent || '').replace(/\s+/g, ' ').trim(),
      ramkaPodstawowej: b ? b.style.borderColor : null,
      czcionkaPodstawowej: b ? b.style.fontSize : null,
      alarm: !!(t.velocity && t.velocity.alarm),
      flaga: TA && typeof TA.heightRedFlagOf === 'function' ? TA.heightRedFlagOf(t) : 'brak',
    };
  });
}

test.describe('Tryb PRO — karty wzrostowe bez banera tempa ze skierowaniem', () => {
  test('PRO: obie karty bez banera i ramki alarmowej, werdykt tempa w wierszu, model z alarmem; tryb zwykły — baner jak dotąd', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await policz(page);
    const pro = await odczyt(page);

    expect(pro.alarm, 'model tempa nadal alarmowy').toBe(true);
    expect(pro.flaga, 'bez flagi obniżenia pozycji').toBeNull();
    expect(pro.karta).not.toContain('Tempo wzrastania poniżej normy dla wieku');
    expect(pro.karta).not.toMatch(/umów wizytę|konsultacja endokrynologiczna/);
    expect(pro.wiersz, 'werdykt tempa widoczny dla lekarza').toContain('4,0 cm/rok');
    expect(pro.wiersz).toContain('poniżej normy');
    expect(pro.ramka).not.toBe('var(--danger)');
    expect(pro.czcionka).not.toBe('1.25rem');
    expect(pro.podstawowa, 'karta podstawowa liczy to samo tempo').toContain('4,0 cm/rok');
    expect(pro.podstawowa).not.toContain('Tempo wzrastania poniżej normy dla wieku');
    expect(pro.podstawowa).not.toMatch(/umów wizytę|konsultacja endokrynologiczna/);
    expect(pro.ramkaPodstawowej).not.toBe('var(--danger)');
    expect(pro.czcionkaPodstawowej).not.toBe('1.15rem');

    // Kontrola: ta sama karta przeliczona poza trybem profesjonalnym niesie baner i ramkę jak dotąd.
    await page.evaluate(() => {
      const tryb = document.getElementById('resultsModeToggle');
      tryb.checked = false;
      tryb.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced();
      if (typeof window.calculateBasicGrowth === 'function') window.calculateBasicGrowth();
    });
    await expect(page.locator('#resultsModeToggle')).not.toBeChecked();
    const zwykly = await odczyt(page);
    expect(zwykly.karta).toContain('Tempo wzrastania poniżej normy dla wieku, wskazana konsultacja endokrynologiczna, umów wizytę');
    expect(zwykly.ramka).toBe('var(--danger)');
    expect(zwykly.podstawowa).toContain('Tempo wzrastania poniżej normy dla wieku, wskazana konsultacja endokrynologiczna, umów wizytę');
    expect(zwykly.ramkaPodstawowej).toBe('var(--danger)');
  });
});
