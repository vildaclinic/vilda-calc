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

function policz(page, { lata, miesiace, wzrost, masa, ba, menarche, plec = 'F', wzrostMenarche = null }) {
  return page.evaluate(({ lata, miesiace, wzrost, masa, ba, menarche, plec, wzrostMenarche }) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    window.professionalMode = true;
    set('age', lata); set('ageMonths', miesiace); set('sex', plec);
    set('height', wzrost); set('weight', masa);
    set('advMotherHeight', 165); set('advFatherHeight', 185); set('advBoneAge', ba);
    set('pubertyMenarcheAge', menarche); set('pubertyMenarcheHeight', wzrostMenarche);
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
  }, { lata, miesiace, wzrost, masa, ba, menarche, plec, wzrostMenarche });
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

// GROWTH-PRED-TW2B — chłopcy z tab. 2.1 i pole „Wzrost przy menarche" w panelu „Dane pokwitaniowe".
test('chłopiec 9 l, 145 cm, BA 12: TW Mark II z tab. 2.1 (186,6 ±6,7) wchodzi do konsensusu obok BP i RWT; bez profilu po menarche', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const r = await policz(page, { plec: 'M', lata: 9, miesiace: 0, wzrost: 145, masa: 40, ba: 12, menarche: null });
  expect(r.puberty).toMatchObject({ sexF: false, postmenarcheal: false, menarcheStatus: null });
  expect(r.tw2).toMatchObject({ available: true, table: '2.1', rowAge: 9, sex: 'M', extrapolatedAboveTable: false });
  expect(r.tw2.predictedAdultHeightCm).toBeCloseTo(186.6, 1);
  expect(r.tw2.errorBoundHalfWidthCm).toBeCloseTo(6.7, 1);
  expect(r.menarche).toBeNull();
  const tw2 = (r.fhp.methods || []).find((m) => m.key === 'tw2');
  expect(tw2).toMatchObject({ tw2Table: '2.1', excluded: false });
  expect(r.fhp.excludedMethods).toEqual(['khamis']); // tylko bramka Δ +36
  expect(r.fhp.postmenarcheal).toBe(false);
  expect(r.fhp.cm).toBeGreaterThan(180);
  expect(r.fhp.cm).toBeLessThan(188);
  expect(r.cardText).toMatch(/TW Mark II\s*186,6 cm ±6,7/);
  expect(r.cardText).toContain('równania Tannera i wsp. (1983) dla chłopców, tablica 2.1');
  expect(r.cardText).not.toContain('Profil po menarche:');
});

test('pole „Wzrost przy menarche": menarche 8,75 przy 147 cm, dziś 10 l 3 mies. i 152 cm — pseudometoda liczy z pola (baza 153,9), bez pola jest niedostępna', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await expect(page.locator('#pubertyMenarcheHeight')).toBeAttached();
  const r = await policz(page, { lata: 10, miesiace: 3, wzrost: 152, masa: 42, ba: 13, menarche: 8.75, wzrostMenarche: 147 });
  expect(r.puberty).toMatchObject({ postmenarcheal: true, heightAtMenarcheCm: 147, heightAtMenarcheSource: 'field', menarcheRecent: false, boneAgeAtMenarcheYears: null });
  expect(r.menarche).toMatchObject({ available: true, baseCm: 153.9, boneAgeAdjustmentCm: 0 });
  expect(r.menarche.predictedAdultHeightCm).toBeCloseTo(153.9, 1);
  expect((r.fhp.methods || []).find((m) => m.key === 'menarche')).toMatchObject({ excluded: false });
  expect(r.cardText).toMatch(/Wzrost przy menarche \/ 0,955\s*153,9 cm ±3,2/);
  expect(r.cardText).toContain('bez wieku kostnego przy menarche — bez korekty');

  const bez = await policz(page, { lata: 10, miesiace: 3, wzrost: 152, masa: 42, ba: 13, menarche: 8.75, wzrostMenarche: null });
  expect(bez.puberty).toMatchObject({ postmenarcheal: true, heightAtMenarcheCm: null, heightAtMenarcheSource: null });
  expect(bez.menarche).toMatchObject({ available: false, reason: 'missing-height-at-menarche' });
  expect((bez.fhp.methods || []).some((m) => m.key === 'menarche')).toBe(false);
  expect(bez.cardText).not.toContain('Wzrost przy menarche / 0,955');
});
