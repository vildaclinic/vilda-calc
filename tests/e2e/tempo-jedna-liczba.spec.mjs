import { expect, test } from '../support/test-czas.mjs';

// P-TEMPO etap 1 — „jedna liczba": ten sam pacjent daje IDENTYCZNE tempo (cm/rok) i odstęp
// w karcie zaawansowanej, w karcie podstawowej, w modelu trajektorii i w danych do zapisu.
//
// Audyt 2026-09-15: trzy karty liczyły tempo trzema kopiami tej samej logiki. Od SW 1.0.944
// liczy je wyłącznie vilda_tempo_wzrastania.js; ten plik patrzy na to, co realnie trafia
// na ekran i do window.*Data, nie na funkcje wołane wprost.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#JednaLiczba!26aa';

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
  await page.waitForFunction(() => Boolean(window.VildaTempoWzrastania) && Boolean(window.VildaTrajectoryAnalysis));
}

/* Dziewczynka `wiekLat`, `wzrost` cm dziś; jeden wiersz historii: `hLat` lat, `hWzrost` cm. */
async function policz(page, { wiekLat, wzrost, hLat, hWzrost }) {
  await page.evaluate(({ wiekLat, wzrost }) => {
    document.getElementById('age').value = String(wiekLat);
    document.getElementById('sex').value = 'F';
    document.getElementById('height').value = String(wzrost);
    document.getElementById('weight').value = '30';
    if (typeof window.update === 'function') window.update();
  }, { wiekLat, wzrost });
  await page.waitForSelector('#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]', { state: 'attached' });
  await page.evaluate(() => {
    const t = document.getElementById('toggleAdvancedGrowth');
    if (t) { t.disabled = false; t.click(); }
  });
  await expect(page.locator('#advancedGrowthForm')).toBeVisible();
  await page.waitForSelector('#advMeasurements .measure-row');
  await page.evaluate(({ hLat, hWzrost }) => {
    const w = document.querySelector('#advMeasurements .measure-row');
    const set = (sel, v) => {
      const e = w.querySelector(sel);
      if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    set('.adv-age-years', String(hLat));
    set('.adv-height', String(hWzrost));
    set('.adv-weight', '27');
    if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced();
  }, { hLat, hWzrost });
  await page.waitForSelector('#advResults .vtap-tempo');
  // Karta podstawowa: ten sam wiersz historii wpisany w jej własne pola, własne
  // przeliczenie — ma dać tę samą liczbę.
  await page.evaluate(({ hLat, hWzrost }) => {
    if (!document.querySelector('#basicGrowthMeasurements .measure-row')
      && typeof window.addBasicGrowthMeasurementRow === 'function') window.addBasicGrowthMeasurementRow();
    const w = document.querySelector('#basicGrowthMeasurements .measure-row');
    const set = (sel, v) => {
      const e = w && w.querySelector(sel);
      if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    set('.bg-age-years', String(hLat));
    set('.bg-height', String(hWzrost));
    set('.bg-weight', '27');
    if (typeof window.calculateBasicGrowth === 'function') window.calculateBasicGrowth();
  }, { hLat, hWzrost });
  await page.waitForFunction(() => /cm\/rok/.test(document.getElementById('basicGrowthResults')?.textContent || ''));
}

async function odczyt(page) {
  return page.evaluate(() => {
    const a = window.advancedGrowthData || {};
    const b = window.basicGrowthData || {};
    const t = window.advancedGrowthTrajectory || {};
    const r = (x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x);
    return {
      wiersz: (document.querySelector('#advResults .vtap-tempo')?.innerText || '').replace(/\s+/g, ' ').trim(),
      podstawowa: (document.getElementById('basicGrowthResults')?.textContent || '').replace(/\s+/g, ' ').trim(),
      adv: { v: r(a.growthVelocity), gap: a.growthVelocityGapM, okno: a.growthVelocityUsedLastYear,
        tempo: a.tempo ? { v: r(a.tempo.cmPerYear), gap: a.tempo.gapM, rodzaj: a.tempo.rodzaj } : null },
      basic: { v: r(b.growthVelocity), gap: b.growthVelocityGapM,
        tempo: b.tempo ? { v: r(b.tempo.cmPerYear), gap: b.tempo.gapM, rodzaj: b.tempo.rodzaj } : null },
      traj: t.velocity ? { v: r(t.velocity.cmPerYear), gap: t.velocity.gapM, rodzaj: t.velocity.rodzaj } : null,
    };
  });
}

test.describe('Tempo wzrastania — jedna liczba w całej aplikacji', () => {
  test('tempo roczne: karta zaawansowana, podstawowa, trajektoria i dane do zapisu zgadzają się co do liczby i odstępu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    // 9 lat, 135 cm; rok wcześniej 128 cm → 7,0 cm/rok z 12 mies., norma 5–10 lat ≥5 cm/rok.
    await policz(page, { wiekLat: 9, wzrost: 135, hLat: 8, hWzrost: 128 });
    const o = await odczyt(page);

    expect(o.wiersz, 'wiersz karty zaawansowanej').toContain('7,0 cm/rok');
    expect(o.wiersz).toContain('z 12 mies.');
    expect(o.wiersz).toContain('w normie');
    expect(o.wiersz, 'bez starego słownictwa').not.toMatch(/ostatnich|Aktualne|średni/);

    expect(o.podstawowa, 'wiersz karty podstawowej — to samo zdanie').toContain('Tempo wzrastania: 7,0 cm/rok (z 12 mies.) — w normie (norma ≥5 cm/rok)');
    expect(o.podstawowa).not.toMatch(/Aktualne tempo|obliczono jako średnią/);

    expect(o.adv.v).toBe(7);
    expect(o.adv.gap).toBe(12);
    expect(o.adv.okno).toBe(true);
    expect(o.adv.tempo).toEqual({ v: 7, gap: 12, rodzaj: 'roczne' });
    expect(o.basic.tempo, 'karta podstawowa niesie ten sam model').toEqual(o.adv.tempo);
    expect(o.basic.v).toBe(o.adv.v);
    expect(o.traj, 'trajektoria to to samo liczenie').toEqual(o.adv.tempo);
  });

  test('ostatni odcinek: 3 lata wstecz → liczba opisowa, „poza oknem oceny normy", bez alarmu, bez „średniej"', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    // 9 lat, 135 cm; trzy lata wcześniej 120 cm → 5,0 cm/rok z 36 mies.
    await policz(page, { wiekLat: 9, wzrost: 135, hLat: 6, hWzrost: 120 });
    const o = await odczyt(page);

    expect(o.wiersz).toContain('5,0 cm/rok');
    expect(o.wiersz).toContain('z 36 mies.');
    expect(o.wiersz).toContain('poza oknem oceny normy');
    expect(o.wiersz).not.toMatch(/w normie|poniżej normy/);

    expect(o.podstawowa).toContain('Tempo wzrastania: 5,0 cm/rok (z 36 mies., poza oknem oceny normy)');
    expect(o.podstawowa, 'liczba z dwóch punktów nie jest „średnią"').not.toMatch(/obliczono jako średnią|ostatnich 3 lat/);
    expect(o.podstawowa, 'bez czerwonego banera tempa').not.toContain('Tempo wzrastania poniżej normy');

    expect(o.adv.okno).toBe(false);
    expect(o.adv.tempo).toEqual({ v: 5, gap: 36, rodzaj: 'ostatni-odcinek' });
    expect(o.basic.tempo).toEqual(o.adv.tempo);
    expect(o.traj).toEqual(o.adv.tempo);
  });
});
