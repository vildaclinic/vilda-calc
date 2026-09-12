import { expect, test } from '@playwright/test';

// GROWTH-PRED-TW2 — TW Mark II i profil „po menarche" przez PRAWDZIWY adapter karty zaawansowanej
// na index.html: wiek menarche z pola modułu dojrzewania (#pubertyMenarcheAge) → adapter wyznacza status
// menarche, liczy TW Mark II (tab. 3.1c) i pseudometodę „wzrost przy menarche / 0,955", przełącza BP na
// tablicę „przeciętną", wyłącza RWT i KR z konsensusu i obniża kotwicę MPH. Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.calculateGrowthAdvanced === 'function'
    && typeof window.calculateTW2Prediction === 'function' && Boolean(window.VildaPubertalStatus));
}

function policz(page, { lata, miesiace, wzrost, masa, ba, menarche }) {
  return page.evaluate(({ lata, miesiace, wzrost, masa, ba, menarche }) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    window.professionalMode = true;
    set('age', lata); set('ageMonths', miesiace); set('sex', 'F');
    set('height', wzrost); set('weight', masa);
    set('advMotherHeight', 165); set('advFatherHeight', 185); set('advBoneAge', ba);
    set('pubertyMenarcheAge', menarche);
    window.calculateGrowthAdvanced();
    const d = window.advancedGrowthData || {};
    const card = document.querySelector('.vgcc');
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    return {
      fhp: d.finalHeightPrediction || null,
      puberty: d.puberty || null,
      tw2: d.tw2 || null,
      menarche: d.menarche || null,
      bp: d.bayleyPinneau ? { cm: d.bayleyPinneau.predictedAdultHeightCm, groupKey: d.bayleyPinneau.groupKey, override: d.bayleyPinneau.groupOverrideApplied === true, reason: d.bayleyPinneau.groupReasonText } : null,
      cardText: norm(card ? card.textContent : ''),
    };
  }, { lata, miesiace, wzrost, masa, ba, menarche });
}

test('8 l 9 mies., 147,3 cm, BA 12, menarche 8,75: konsensus ok. 158 cm (przedtem 168), TW Mark II 3.1c, RWT/KR poza, BP z tablicy przeciętnej', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const r = await policz(page, { lata: 8, miesiace: 9, wzrost: 147.3, masa: 38.3, ba: 12, menarche: 8.75 });
  expect(r.puberty).toMatchObject({ postmenarcheal: true, menarcheAgeYears: 8.75, heightAtMenarcheCm: 147.3, boneAgeAtMenarcheYears: 12 });
  expect(r.tw2).toMatchObject({ available: true, table: '3.1c', rowAge: 11.5, extrapolatedBelowTable: true });
  expect(r.tw2.predictedAdultHeightCm).toBeCloseTo(157.9, 1);
  expect(r.menarche.predictedAdultHeightCm).toBeCloseTo(157.3, 1);
  expect(r.bp).toMatchObject({ groupKey: 'average', override: true });
  expect(r.bp.reason).toContain('tablicy dla dziewcząt przeciętnych');
  expect(r.fhp.postmenarcheal).toBe(true);
  expect(r.fhp.excludedMethods.slice().sort()).toEqual(['khamis', 'rwt']);
  expect(r.fhp.mphWeightFactor).toBeCloseTo(0.25, 6);
  expect(r.fhp.cm).toBeGreaterThan(156);
  expect(r.fhp.cm).toBeLessThan(160);
  expect(r.fhp.preferredKey).toBe('menarche');
  expect(r.cardText).toContain('≈ 158 cm');
  expect(r.cardText).toContain('TW Mark II');
  expect(r.cardText).toContain('Wzrost przy menarche / 0,955');
  expect(r.cardText).toContain('Profil po menarche:');
  expect(r.cardText).toContain('Po menarche użyto tablicy dla dziewcząt „przeciętnych"');
  expect(r.cardText).not.toContain('preferowana: RWT');
});

test('ta sama dziewczynka bez wieku menarche: przed 10. r.ż. liczona jak przed menarche (tab. 3.1a), RWT w konsensusie; 12-latka bez statusu — TW2 niedostępna', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const r = await policz(page, { lata: 8, miesiace: 9, wzrost: 147.3, masa: 38.3, ba: 12, menarche: null });
  expect(r.puberty).toMatchObject({ postmenarcheal: false, menarcheStatus: false, menarcheAgeYears: null });
  expect(r.tw2).toMatchObject({ available: true, table: '3.1a' });
  expect(r.bp).toMatchObject({ groupKey: 'accelerated', override: false });
  expect(r.fhp.postmenarcheal).toBe(false);
  expect(r.fhp.excludedMethods).toEqual(['khamis']);
  expect(r.fhp.cm).toBeGreaterThan(163);
  expect(r.cardText).not.toContain('Profil po menarche:');

  const s = await policz(page, { lata: 12, miesiace: 0, wzrost: 155, masa: 45, ba: 12.5, menarche: null });
  expect(s.puberty).toMatchObject({ postmenarcheal: false, menarcheStatus: null });
  expect(s.tw2).toMatchObject({ available: false, reason: 'menarche-status-unknown' });
  expect((s.fhp.methods || []).some((m) => m.key === 'tw2')).toBe(false);
});
