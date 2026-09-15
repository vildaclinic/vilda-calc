import { expect, test } from '@playwright/test';

// P-SDS etap 1 — w przeglądarce rdzeń app.js liczy SDS wzrostu przez vilda_sds_wzrostu.js.
//
// Audyt 2026-09-15: karta główna (calcPercentileStats) dawała dwulatkowi przy źródle OLAF
// siatkę WHO, a raport i historia (advHistoryResolveMetric) — Palczewską; różnica sięgała
// 0,7 SDS. Decyzja właściciela: przy OLAF poniżej 3 lat Palczewska, PALCZEWSKA pełnoprawna
// w rdzeniu (także w 18. roku życia). Tu obie ścieżki produkcyjne mają dać jedną liczbę.
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
    && typeof window.advHistoryResolveMetric === 'function');
}

/* Radio źródła bywa ukryte albo wyłączone (Palczewska do 18 lat) — ustawiamy je tak, jak
   robi to aplikacja: zaznaczenie + zdarzenie change, na które app.js przepina bmiSource. */
const ustawZrodlo = (page, id) => page.evaluate((i) => {
  const el = document.getElementById(i);
  el.disabled = false;
  el.checked = true;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, id);

const rdzen = (page, cm, plec, lata) => page.evaluate(({ h, p, y }) => {
  const r = window.calcPercentileStats(h, p, y, 'HT');
  return r ? { sd: r.sd, siatka: r.siatka, fallback: r.fallback, powod: r.powod } : null;
}, { h: cm, p: plec, y: lata });

const historia = (page, cm, plec, lata, zrodlo) => page.evaluate(({ h, p, y, z }) => {
  const r = window.advHistoryResolveMetric('HT', h, p, y, z);
  return r && r.result ? { sd: r.result.sd, source: r.source, reason: r.reason } : null;
}, { h: cm, p: plec, y: lata, z: zrodlo });

test.describe('SDS wzrostu — jeden silnik w przeglądarce', () => {
  test('dwulatek przy OLAF: karta główna i historia dają tę samą liczbę z Palczewskiej', async ({ page }) => {
    await otworz(page);
    await ustawZrodlo(page, 'sourceOlaf');
    const karta = await rdzen(page, 84, 'M', 2);
    const hist = await historia(page, 84, 'M', 2, 'OLAF');
    expect(karta.siatka).toBe('PALCZEWSKA');
    expect(karta.fallback).toBe(true);
    expect(karta.powod).toBe('brak danych OLAF dla wieku poniżej 3 lat');
    expect(hist.source).toBe('PALCZEWSKA');
    expect(hist.sd).toBeCloseTo(karta.sd, 9);
    // Ta sama liczba, którą daje bezpośrednie wołanie siatki Palczewskiej.
    const pal = await page.evaluate(() => window.calcPercentileStatsPal(84, 'M', 2, 'HT').sd);
    expect(pal).toBeCloseTo(karta.sd, 9);
  });

  test('przy WHO ten sam dwulatek liczy się z WHO 2006 — inna liczba, jawnie inna siatka', async ({ page }) => {
    await otworz(page);
    await ustawZrodlo(page, 'sourceWho');
    const karta = await rdzen(page, 84, 'M', 2);
    expect(karta.siatka).toBe('WHO');
    expect(karta.fallback).toBe(false);
    const hist = await historia(page, 84, 'M', 2, 'WHO');
    expect(hist.source).toBe('WHO');
    expect(hist.sd).toBeCloseTo(karta.sd, 9);
    const pal = await page.evaluate(() => window.calcPercentileStatsPal(84, 'M', 2, 'HT').sd);
    expect(Math.abs(karta.sd - pal)).toBeGreaterThan(0.2);
  });

  test('PALCZEWSKA jest pełnoprawna w rdzeniu: 18-latek liczony z Palczewskiej, nie z WHO', async ({ page }) => {
    await otworz(page);
    await ustawZrodlo(page, 'sourcePalczewska');
    const r = await rdzen(page, 176, 'M', 18);
    expect(r.siatka).toBe('PALCZEWSKA');
    expect(r.fallback).toBe(false);
    const pal = await page.evaluate(() => window.calcPercentileStatsPal(176, 'M', 18, 'HT').sd);
    expect(r.sd).toBeCloseTo(pal, 9);
  });

  test('od 3 lat przy OLAF liczby nie drgnęły: siatka OLAF, bez fallbacku', async ({ page }) => {
    await otworz(page);
    await ustawZrodlo(page, 'sourceOlaf');
    const r = await rdzen(page, 155, 'M', 12.5);
    expect(r.siatka).toBe('OLAF');
    expect(r.fallback).toBe(false);
    const hist = await historia(page, 155, 'M', 12.5, 'OLAF');
    expect(hist.source).toBe('OLAF');
    expect(hist.sd).toBeCloseTo(r.sd, 9);
  });
});
