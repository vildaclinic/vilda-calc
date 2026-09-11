import { expect, test } from '@playwright/test';

// GROWTH-PRED-BIAS — łańcuch przez PRAWDZIWY adapter (vilda_advanced_growth.js) na index.html:
//  • masa urodzeniowa z sekcji „Dane okołoporodowe" (VildaPerinatalSource) trafia do Blum/ISS,
//    więc przy obojgu rodzicach i wieku kostnym silnik wybiera model M1 (z masą urodzeniową),
//    a bez niej M2;
//  • mediana wzrostu dorosłego (LMS 18 l) trafia do karty, więc konsensus liczy z celem
//    warunkowym MPH (M + 0,78·(MPH − M)), a kafel dalej pokazuje surowe MPH;
//  • chłopiec z opóźnieniem kostnym 24 mies. dostaje korektę BP −2,0 cm (wiersz pokazuje
//    wartość skorygowaną, Szczegóły — surową).
// Dane fikcyjne: chłopiec 10 l, 121 cm (hSDS ≈ −2,5), 22 kg, rodzice 160/170, wiek kostny 8 l.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.calculateGrowthAdvanced === 'function'
    && Boolean(window.VildaPerinatalSource) && typeof window.calculateBlumIssPrediction === 'function');
}

function policz(page, { masaUrodzeniowaG }) {
  return page.evaluate((mg) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    window.professionalMode = true;
    if (mg) window.VildaPerinatalSource.zapamietaj({ perinatal: { birthWeightG: String(mg) }, user: { sex: 'M' } });
    else window.VildaPerinatalSource.zapomnij();
    set('age', 10); set('ageMonths', 0); set('sex', 'M');
    set('height', 121); set('weight', 22);
    set('advMotherHeight', 160); set('advFatherHeight', 170); set('advBoneAge', 8);
    window.calculateGrowthAdvanced();
    const d = window.advancedGrowthData || {};
    const fhp = d.finalHeightPrediction || null;
    const card = document.querySelector('.vgcc');
    return {
      blum: d.blum ? { available: d.blum.available, modelId: d.blum.modelId, birthWeightKg: d.blum.birthWeightKg, heightSds: d.blum.heightSds } : null,
      fhp,
      cardText: card ? card.textContent : '',
      detailsHtml: card ? (card.querySelector('.vgcc-det-body') || {}).innerHTML || '' : '',
    };
  }, masaUrodzeniowaG);
}

test('masa urodzeniowa z Danych okołoporodowych → Blum M1; bez niej M2', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const bez = await policz(page, { masaUrodzeniowaG: null });
  expect(bez.blum, 'Blum liczy się dla niskiego chłopca z rodzicami i wiekiem kostnym').not.toBeNull();
  expect(bez.blum.available).toBe(true);
  expect(bez.blum.heightSds).toBeLessThanOrEqual(-1.28);
  expect(bez.blum.modelId).toBe(2);
  expect(bez.blum.birthWeightKg).toBeNull();

  const z = await policz(page, { masaUrodzeniowaG: 2600 });
  expect(z.blum.available).toBe(true);
  expect(z.blum.birthWeightKg).toBeCloseTo(2.6, 5); // gramy → kg
  expect(z.blum.modelId).toBe(1);
});

test('cel warunkowy MPH i korekta BP −2,0 przy opóźnieniu kostnym idą przez adapter do karty', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const r = await policz(page, { masaUrodzeniowaG: null });
  const fhp = r.fhp;
  expect(fhp).not.toBeNull();
  // MPH = (160 + 170 + 13) / 2 = 171,5; cel warunkowy leży między MPH a medianą dorosłych (regresja do średniej).
  expect(fhp.mphInConsensus).toBe(true);
  expect(fhp.mphAnchorCm).not.toBeNull();
  expect(fhp.mphAnchorCm).toBeGreaterThan(171.5);
  expect(fhp.mphAnchorCm).toBeLessThan(180);
  expect(fhp.mphWeightFactor, 'hSDS ≤ −2 → waga kotwicy ×0,5').toBe(0.5);
  expect(r.cardText).toContain('Cel rodzicielski (MPH): 171,5 cm'); // kafel bez zmian
  expect(r.detailsHtml).toContain('MPH w konsensusie jako cel warunkowy');
  // Δ = 8·12 − 120 = −24 → BP −2,0 cm u chłopca; RWT −1,3 (hSDS ≤ −2).
  expect(fhp.deltaMonths).toBe(-24);
  const bp = fhp.methods.find((m) => m.key === 'bp');
  const rwt = fhp.methods.find((m) => m.key === 'rwt');
  expect(bp).toBeTruthy();
  expect(bp.biasCm).toBe(-2.0);
  expect(bp.cm).toBeCloseTo(bp.uncorrectedCm - 2.0, 5);
  expect(rwt.biasCm).toBe(-1.3);
  expect(fhp.biasApplied).toEqual(['rwt', 'bp']);
  expect(r.detailsHtml).toContain('Korekta błędu systematycznego');
  expect(r.detailsHtml).toContain('Reinehr 2019; Brämswig 1990');
});
