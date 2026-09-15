import { expect, test } from '@playwright/test';

// P-SDS etap 4 (decyzja 5) — moduł ciśnienia liczy SDS wzrostu tą samą siatką, co karta.
// Audyt 2026-09-15: bp_module.js miał własny wzór na getLMSHeightHybrid (zawsze OLAF), więc
// przy wybranej Palczewskiej centyle ciśnienia szły z innej siatki niż hSDS na karcie.
test.use({ serviceWorkers: 'block' });

async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaSdsWzrostu)
    && typeof window.calcPercentileStats === 'function'
    && window.bpModuleApi && typeof window.bpModuleApi.computePediatricBp === 'function');
}

const ustawZrodlo = (page, id) => page.evaluate((i) => {
  const el = document.getElementById(i);
  el.disabled = false;
  el.checked = true;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, id);

const policz = (page) => page.evaluate(() => {
  const r = window.bpModuleApi.computePediatricBp({ ageYears: 10, sex: 'M', heightCm: 140, sbp: 110, dbp: 70 });
  const k = window.calcPercentileStats(140, 'M', 10, 'HT');
  return { ok: r && r.ok, zht: r && r.zht, karta: k && k.sd, siatka: k && k.siatka, percSbp: r && r.percSbp };
});

test.describe('Ciśnienie — SDS wzrostu z tej samej siatki, co karta', () => {
  test('przy OLAF i przy PALCZEWSKA zht modułu ciśnienia równa się hSDS karty', async ({ page }) => {
    await otworz(page);
    await ustawZrodlo(page, 'sourceOlaf');
    const olaf = await policz(page);
    expect(olaf.ok).toBe(true);
    expect(olaf.siatka).toBe('OLAF');
    expect(olaf.zht).toBeCloseTo(olaf.karta, 9);
    expect(olaf.percSbp).toBeGreaterThan(0);

    await ustawZrodlo(page, 'sourcePalczewska');
    const pal = await policz(page);
    expect(pal.ok).toBe(true);
    expect(pal.siatka).toBe('PALCZEWSKA');
    expect(pal.zht).toBeCloseTo(pal.karta, 9);
    // Dwie siatki, dwie liczby — dotąd moduł ciśnienia zawsze brał OLAF.
    expect(Math.abs(pal.zht - olaf.zht)).toBeGreaterThan(0.01);
  });
});
