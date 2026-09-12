import { expect, test } from '@playwright/test';

// GROWTH-PRED-PUB1 — profil pokwitaniowy przez PRAWDZIWY adapter karty zaawansowanej na index.html:
// dane z panelu „Dane pokwitaniowe" (etap, wiek startu, GnRHa) + wiek kostny bieżący i z wiersza historii
// → adapter wyznacza profil i tempo, karta pokazuje etykietę i akapit. GROWTH-PRED-PUB2: w profilu
// przedwczesnym / wczesnym działają reguły wag (RWT i KR poza, BP z tablicy przeciętnej ×1,3, TW2
// orientacyjna) i zdanie „konsensus wobec celu rodzicielskiego". GROWTH-PRED-PUB3: wiersze informacyjne
// poza konsensusem („Wzrost dla wieku kostnego", Wu 2023). Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.calculateGrowthAdvanced === 'function'
    && Boolean(window.VildaPubertyProfile) && Boolean(window.VildaPubertalStatus));
}

function policz(page, a) {
  return page.evaluate((a) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    window.professionalMode = true;
    set('age', a.lata); set('ageMonths', a.miesiace); set('sex', a.plec);
    set('height', a.wzrost); set('weight', a.masa);
    set('advMotherHeight', 165); set('advFatherHeight', 185); set('advBoneAge', a.ba);
    set('tannerStage', a.tanner); set('pubertyOnsetAge', a.start); set('advTesticularVolume', a.jadra);
    set('pubertyMenarcheAge', a.menarche);
    set('pubertyGnrhaStatus', a.gnrha); set('pubertyGnrhaStartAge', a.gnrhaStart); set('pubertyGnrhaStopAge', a.gnrhaStop);
    const t = document.getElementById('toggleAdvancedGrowth'); const f = document.getElementById('advancedGrowthForm');
    if (t && f && getComputedStyle(f).display === 'none') { t.disabled = false; t.click(); }
    const row = document.querySelector('#advMeasurements .measure-row');
    if (row) {
      const sr = (sel, v) => { const e = row.querySelector(sel); if (e) { e.value = v == null ? '' : String(v); e.dispatchEvent(new Event('input', { bubbles: true })); } };
      const h = a.historia || {};
      sr('.adv-age-years', h.lata); sr('.adv-age-months', h.miesiace); sr('.adv-height', h.wzrost); sr('.adv-weight', h.masa); sr('.adv-bone-age', h.ba);
    }
    window.calculateGrowthAdvanced();
    const d = window.advancedGrowthData || {};
    const card = document.querySelector('.vgcc');
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const bp = d.bayleyPinneau || null;
    return { profile: d.pubertyProfile || null, fhp: d.finalHeightPrediction || null, cardText: norm(card ? card.textContent : ''),
      bp: bp ? { available: bp.available === true, cm: bp.predictedAdultHeightCm, groupKey: bp.groupKey, auto: bp.groupAutoKey, override: bp.groupOverrideApplied === true, reason: bp.groupReasonText, altCm: bp.autoGroupPredictedAdultHeightCm } : null,
      lms: d.adultHeightLMS || null, hBa: d.heightSdsForBoneAge != null ? d.heightSdsForBoneAge : null };
  }, a);
}

test('dziewczynka 7 l 6 mies., Tanner II od 7,0, BA 9,5 z BA 7,5 rok wcześniej: profil przedwczesne, tempo szybkie (ΔBA/ΔCA 2,0; BA +24 mies.), etykieta i akapit w karcie', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const r = await policz(page, { plec: 'F', lata: 7, miesiace: 6, wzrost: 130, masa: 28, ba: 9.5, tanner: '2', start: 7.0, historia: { lata: 6, miesiace: 6, wzrost: 121, masa: 23, ba: 7.5 } });
  expect(r.profile).toMatchObject({ profil: 'przedwczesne', kategoriaStartu: 'przedwczesne', tempo: 'szybkie', zrodloStartu: 'pole', wiekStartuLat: 7 });
  expect(r.profile.wskazniki.przyspieszenieMies).toBe(24);
  expect(r.profile.wskazniki.dBAdCA).toBeCloseTo(2.0, 1);
  expect(r.profile.etykieta).toBe('przedwczesne pokwitanie (tempo szybkie)');
  expect(r.fhp.pubertyProfile).toMatchObject({ profil: 'przedwczesne', tempo: 'szybkie' });
  expect(r.cardText).toContain('Profil predykcyjny: przedwczesne pokwitanie (tempo szybkie)');
  expect(r.cardText).toContain('Profil pokwitaniowy: przedwczesne pokwitanie (tempo szybkie) — start pokwitania w wieku 7 l — przedwczesne (próg 8/9 l); Tanner II; tempo szybkie: wiek kostny wyprzedza metrykalny o 24 mies.');
  expect(r.cardText).toContain('ΔBA/ΔCA 2 z ostatnich 12 mies.');
  // GROWTH-PRED-PUB2: reguły wag w profilu
  expect(r.fhp.pubertyRulesActive).toBe(true);
  expect(r.fhp.excludedMethods).toEqual(expect.arrayContaining(['rwt', 'khamis']));
  expect(r.bp).toMatchObject({ available: true, override: true, auto: 'accelerated', groupKey: 'average' });
  expect(r.bp.reason).toContain('w profilu przedwczesnego / wczesnego pokwitania użyto tablicy dla dzieci przeciętnych');
  expect(typeof r.bp.altCm).toBe('number');
  expect(r.bp.altCm).not.toBeCloseTo(r.bp.cm, 1);
  expect(r.fhp.methods.find((m) => m.key === 'bp')).toMatchObject({ profileSigmaFactor: 1.3, bpGroupOverride: true, excluded: false });
  expect(r.fhp.methods.find((m) => m.key === 'rwt').gateNote).toContain('Zachmann 1978');
  expect(r.lms).toMatchObject({ M: expect.any(Number), S: expect.any(Number) });
  expect(r.fhp.targetAssessment).toMatchObject({ tier: expect.stringMatching(/^(w-zakresie-celu|ponizej-celu|niskoroslosc-dorosla)$/), diffCm: expect.any(Number), adultSds: expect.any(Number) });
  expect(r.cardText).toContain('Konsensus wobec celu rodzicielskiego:');
  expect(r.cardText).toContain('Reguły konsensusu w profilu przedwczesnego pokwitania: RWT i Khamis–Roche poza konsensusem (Zachmann 1978); Bayley–Pinneau z tablicy „przeciętnej" zamiast „przyspieszonej"');
  expect(r.cardText).toContain('tablica przyspieszona dałaby');
  expect(r.cardText).toContain('Tempo szybkie: bez leczenia wzrost ostateczny bywa 5–8 cm poniżej celu (Kauli 1997)');
  expect(r.cardText).not.toContain('w przygotowaniu');
  // GROWTH-PRED-PUB3: wiersze informacyjne — SDS wzrostu dla wieku kostnego z tych samych norm co centyle
  expect(typeof r.hBa).toBe('number');
  expect(r.fhp.infoRows.map((x) => x.key)).toEqual(['hba', 'wu2023']);
  const hba = r.fhp.infoRows[0];
  expect(hba.cm).toBeGreaterThan(120);
  expect(hba.cm).toBeLessThan(190);
  expect(r.fhp.methods.map((m) => m.key)).not.toContain('hba');
  expect(r.cardText).toContain('Wzrost dla wieku kostnego poza konsensusem');
  expect(r.cardText).toContain('Wu 2023 (CPP, dziewczęta) poza konsensusem');
  expect(r.cardText).toContain('Wiersze informacyjne (poza konsensusem, bez wagi): Wzrost dla wieku kostnego');
  expect(r.cardText).toContain('populacja chińska');
});

test('ta sama dziewczynka w trakcie GnRHa od 7,2 l: tempo nieoceniane, nota Lazar 2007; chłopiec 9 l 6 mies. z jądrami 4–6 ml bez wieku startu: wczesne z górnej granicy i prośba o wiek startu', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const g = await policz(page, { plec: 'F', lata: 7, miesiace: 6, wzrost: 130, masa: 28, ba: 9.5, tanner: '2', start: 7.0, gnrha: 'w-trakcie', gnrhaStart: 7.2 });
  expect(g.profile).toMatchObject({ profil: 'przedwczesne', tempo: 'nieoceniane' });
  expect(g.profile.gnrha).toMatchObject({ status: 'w-trakcie', wTrakcie: true, startLat: 7.2 });
  expect(g.cardText).toContain('Profil predykcyjny: przedwczesne pokwitanie (tempo nieoceniane), GnRHa w trakcie');
  expect(g.cardText).toContain('W trakcie leczenia GnRHa prognoza rezydualnego wzrostu jest nierzetelna');
  expect(g.cardText).toContain('W trakcie GnRHa liczby Bayley–Pinneau i TW Mark II traktuj ostrożnie');
  expect(g.fhp.excludedMethods).toEqual(expect.arrayContaining(['rwt', 'khamis']));
  // GROWTH-PRED-PUB4: Tanner I pod leczeniem GnRHa bez wpisanego startu → przedwczesne z początku leczenia, nie „standardowy"
  const t1 = await policz(page, { plec: 'F', lata: 8, miesiace: 0, wzrost: 132, masa: 30, ba: 10.5, tanner: '1', start: null, gnrha: 'w-trakcie', gnrhaStart: 7.0 });
  expect(t1.profile).toMatchObject({ profil: 'przedwczesne', zrodloStartu: 'gnrha', wiekStartuLat: 7 });
  expect(t1.cardText).toContain('Profil predykcyjny: przedwczesne pokwitanie (tempo nieoceniane), GnRHa w trakcie');
  expect(t1.cardText).not.toContain('pokazano standardowe modele Bayley-Pinneau i RWT');
  expect(t1.bp.reason).toContain('w profilu przedwczesnego pokwitania (leczonego GnRHa) użyto tablicy dla dzieci przeciętnych');

  const b = await policz(page, { plec: 'M', lata: 9, miesiace: 6, wzrost: 140, masa: 34, ba: 11, tanner: '', start: null, jadra: '4to6', gnrha: '', gnrhaStart: null });
  expect(b.profile).toMatchObject({ profil: 'wczesne', zrodloStartu: 'gorna-granica', tempo: 'wolne' });
  expect(b.profile.wiekStartuLat).toBeCloseTo(9.5, 1);
  expect(b.cardText).toContain('Profil predykcyjny: wczesne pokwitanie (tempo wolne)');
  expect(b.cardText).toContain('Brakuje: wiek startu pokwitania');
  // profil wczesny jak przedwczesny (decyzja właściciela): RWT poza, BP z tablicy przeciętnej (Δ +18 → grupa auto „przyspieszona")
  expect(b.fhp.pubertyRulesActive).toBe(true);
  expect(b.fhp.excludedMethods).toEqual(expect.arrayContaining(['rwt', 'khamis']));
  expect(b.bp).toMatchObject({ override: true, auto: 'accelerated', groupKey: 'average' });
  expect(b.cardText).toContain('Reguły konsensusu w profilu wczesnego pokwitania: RWT i Khamis–Roche poza konsensusem (Zachmann 1978; w profilu wczesnym jak w przedwczesnym — decyzja właściciela)');
  expect(b.cardText).toContain('Tempo wolne: metody z wieku kostnego zaniżają o ok. 3–4 cm');
  expect(b.cardText).toContain('U chłopców Bayley–Pinneau w stadium Tanner 3 zawyża (Lazar 2001)');
  expect(b.cardText).toContain('Konsensus wobec celu rodzicielskiego:');
  expect(b.fhp.infoRows.map((x) => x.key)).toEqual(['hba']); // chłopiec: bez Wu 2023
});

test('bez danych pokwitaniowych profil standardowy: etykieta z modelu wiarygodności bez zmian, akapit tylko z listą braków', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const r = await policz(page, { plec: 'M', lata: 9, miesiace: 0, wzrost: 145, masa: 40, ba: 12, tanner: '', start: null, jadra: '', gnrha: '' });
  expect(r.profile).toMatchObject({ profil: 'standardowy', tempo: 'nieoceniane' });
  expect(r.cardText).toContain('Profil predykcyjny: Profil standardowy');
  expect(r.cardText).toContain('Profil pokwitaniowy: standardowy. Brakuje: brak danych pokwitaniowych (etap Tannera, wiek startu, objętość jąder)');
  expect(r.cardText).not.toContain('Reguły konsensusu w profilu');
  expect(r.cardText).not.toContain('Konsensus wobec celu rodzicielskiego');
  expect(r.fhp.pubertyRulesActive).toBe(false);
  expect(r.fhp.targetAssessment).toBeNull();
  expect(r.bp).toMatchObject({ override: false, groupKey: 'accelerated' });
  expect(r.fhp.excludedMethods).toEqual(['khamis']); // tylko bramka Δ +36, jak w GROWTH-PRED-DOBOR
  expect(r.fhp.infoRows).toEqual([]);
  expect(r.cardText).not.toContain('Wiersze informacyjne');
  // GROWTH-PRED-PUB4: sam wpisany wiek startu (bez etapu Tannera) wystarcza do profilu
  const s = await policz(page, { plec: 'F', lata: 7, miesiace: 6, wzrost: 130, masa: 28, ba: 9.5, tanner: '', start: 7.0 });
  expect(s.profile).toMatchObject({ profil: 'przedwczesne', zrodloStartu: 'pole', tempo: 'szybkie' });
  expect(s.fhp.pubertyRulesActive).toBe(true);
  expect(s.bp).toMatchObject({ override: true, groupKey: 'average' });
  expect(s.cardText).not.toContain('bez oznak pokwitania');
});
