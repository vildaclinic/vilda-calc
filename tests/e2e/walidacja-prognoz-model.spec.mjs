import { expect, test } from '@playwright/test';

// Etap 2a „Walidacji prognoz" (decyzja właściciela 2026-09-15). Karta liczyła prognozy czterema
// surowymi silnikami, omijając kartę zaawansowaną: nie mierzyła konsensusu, nie znała Blum/ISS,
// TW Mark II ani „wzrostu przy menarche", a kolumna Reinehr/CDGP nigdy się nie wypełniała.
//
// Ten plik mierzy to, czego nie zmierzy test jednostkowy: czy po wpięciu modelu panel na
// PRAWDZIWEJ stronie pokazuje więcej metod, kolumnę konsensusu i wypełnionego Reinehra —
// oraz czy hSDS, którego model potrzebuje do korekt i do Blum/ISS, naprawdę się liczy
// (w środowisku testu jednostkowego siatek centylowych nie ma).
// Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Walidacja!26aa';

async function otworzZPacjentem(page) {
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
  await page.waitForFunction(() => Boolean(window.VildaGrowthPredictionValidationModel)
    && Boolean(window.VildaGrowthCardC) && typeof window.calcPercentileStats === 'function');

  // Chłopiec z KOWD: wiek kostny ok. 2,5 roku za metrykalnym, wzrost ostateczny 171 cm w 18 l.
  return page.evaluate(async () => {
    const w = await window.VildaVault.savePatient({
      name: 'Testowy Bartek',
      user: { lastName: 'Testowy', firstName: 'Bartek', sex: 'M', age: 18, ageMonths: 0, height: 171, weight: 62 },
      advanced: {
        motherHeight: 158, fatherHeight: 172, boneAgeYears: 18,
        growthExclusion: 'nie', testicularVolume: 'lt4', familyDelayedPuberty: 'yes',
        data: { measurements: [
          { ageMonths: 120, ageYears: 10, height: 125, weight: 25, boneAgeYears: 7.5 },
          { ageMonths: 144, ageYears: 12, height: 137, weight: 32, boneAgeYears: 9.5 },
          { ageMonths: 168, ageYears: 14, height: 148, weight: 40, boneAgeYears: 11.5 },
          { ageMonths: 192, ageYears: 16, height: 163, weight: 54, boneAgeYears: 14 },
        ] },
      },
    }, { dedup: false });
    return w.patientId;
  });
}

async function model(page) {
  const id = await otworzZPacjentem(page);
  return page.evaluate(async (patientId) => {
    const snap = await window.VildaVault.getLatestSnapshot(patientId);
    const m = window.VildaGrowthPredictionValidationModel.policzDlaPayloadu(snap.payload, {});
    return {
      ok: m.ok,
      metody: m.methods.map((x) => x.key),
      hSds: m.points.map((p) => p.heightSds),
      reinehr: m.points.filter((p) => p.ageMonths === 168).map((p) => p.preds.reinehr && p.preds.reinehr.publikacja)[0],
      konsensus: m.konsensus,
      best: m.best,
      bp168: m.points.filter((p) => p.ageMonths === 168).map((p) => p.preds.bp)[0],
    };
  }, id);
}

test.describe('Panel walidacji liczy tą samą ścieżką, co karta zaawansowana', () => {
  test('hSDS liczy się na prawdziwych siatkach — bez niego nie działają korekty ani Blum/ISS', async ({ page }) => {
    test.setTimeout(120_000);
    const m = await model(page);
    expect(m.ok).toBe(true);
    const policzone = m.hSds.filter((x) => typeof x === 'number');
    expect(policzone.length, `hSDS: ${JSON.stringify(m.hSds)}`).toBeGreaterThanOrEqual(4);
    expect(Math.min(...policzone)).toBeLessThan(0); // niskorosły chłopiec
  });

  test('kolumna Reinehr/CDGP wreszcie ma liczbę', async ({ page }) => {
    test.setTimeout(120_000);
    const m = await model(page);
    expect(typeof m.reinehr, 'Reinehr w wieku 14 l').toBe('number');
    expect(m.reinehr).toBeGreaterThan(150);
  });

  test('konsensus jest mierzony, a ranking go nie obejmuje', async ({ page }) => {
    test.setTimeout(120_000);
    const m = await model(page);
    expect(m.konsensus.n).toBeGreaterThanOrEqual(3);
    expect(typeof m.konsensus.mae).toBe('number');
    expect(m.best).not.toBe('konsensus');
  });

  test('panel w Karcie pacjenta pokazuje kolumnę konsensusu i więcej metod niż cztery', async ({ page }) => {
    test.setTimeout(120_000);
    const id = await otworzZPacjentem(page);
    await page.evaluate((patientId) => window.VildaAuthUI.showPatientCard(patientId), id);

    const kafelek = page.locator('.vgpv-tile');
    await expect(kafelek).toBeVisible({ timeout: 20000 });
    await expect(kafelek).toContainText('konsensus');
    await kafelek.click();

    const naglowki = await page.evaluate(() => Array.from(
      document.querySelectorAll('.vgpv-tbl thead th')).map((t) => (t.textContent || '').trim()));
    expect(naglowki, `nagłówki: ${naglowki.join(' | ')}`).toContain('Konsensus');
    const metody = naglowki.filter((t) => ['RWT', 'Bayley–Pinneau', 'Khamis–Roche', 'Reinehr/CDGP', 'TW Mark II', 'Blum/ISS'].indexOf(t) >= 0);
    expect(metody.length, `metody w nagłówku: ${metody.join(', ')}`).toBeGreaterThan(4);

    // Kolumna konsensusu ma liczby, nie same kreski.
    const konsensusy = await page.evaluate(() => Array.from(
      document.querySelectorAll('.vgpv-tbl td.vgpv-konscell')).map((t) => (t.textContent || '').trim()));
    expect(konsensusy.filter((t) => /\d/.test(t)).length).toBeGreaterThanOrEqual(3);
  });

  test('wykluczona metoda jest oznaczona w komórce, a pusta mówi dlaczego', async ({ page }) => {
    test.setTimeout(120_000);
    const id = await otworzZPacjentem(page);
    await page.evaluate((patientId) => window.VildaAuthUI.showPatientCard(patientId), id);
    await expect(page.locator('.vgpv-tile')).toBeVisible({ timeout: 20000 });
    await page.locator('.vgpv-tile').click();

    await expect(page.locator('.vgpv-outtag').first()).toContainText('poza konsensusem');
    const powody = await page.evaluate(() => Array.from(
      document.querySelectorAll('.vgpv-cellwhy')).map((t) => (t.textContent || '').trim()));
    expect(powody.length, 'puste komórki mają nazwany powód').toBeGreaterThan(0);
    expect(powody.every((t) => t.length > 0)).toBe(true);
  });
});
