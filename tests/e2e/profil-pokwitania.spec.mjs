import { expect, test } from '@playwright/test';

// GROWTH-PRED-PUB1 — profil pokwitaniowy przez PRAWDZIWY adapter karty zaawansowanej na index.html:
// dane z panelu „Dane pokwitaniowe" (etap, wiek startu, GnRHa) + wiek kostny bieżący i z wiersza historii
// → adapter wyznacza profil i tempo, karta pokazuje etykietę i akapit. W tym etapie liczby prognoz
// pozostają jak w profilu standardowym. Dane FIKCYJNE.

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
    return { profile: d.pubertyProfile || null, fhp: d.finalHeightPrediction || null, cardText: norm(card ? card.textContent : '') };
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
  expect(r.cardText).toContain('Reguły wag konsensusu dla tego profilu — w przygotowaniu');
});

test('ta sama dziewczynka w trakcie GnRHa od 7,2 l: tempo nieoceniane, nota Lazar 2007; chłopiec 9 l 6 mies. z jądrami 4–6 ml bez wieku startu: wczesne z górnej granicy i prośba o wiek startu', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const g = await policz(page, { plec: 'F', lata: 7, miesiace: 6, wzrost: 130, masa: 28, ba: 9.5, tanner: '2', start: 7.0, gnrha: 'w-trakcie', gnrhaStart: 7.2 });
  expect(g.profile).toMatchObject({ profil: 'przedwczesne', tempo: 'nieoceniane' });
  expect(g.profile.gnrha).toMatchObject({ status: 'w-trakcie', wTrakcie: true, startLat: 7.2 });
  expect(g.cardText).toContain('Profil predykcyjny: przedwczesne pokwitanie (tempo nieoceniane), GnRHa w trakcie');
  expect(g.cardText).toContain('W trakcie leczenia GnRHa prognoza rezydualnego wzrostu jest nierzetelna');

  const b = await policz(page, { plec: 'M', lata: 9, miesiace: 6, wzrost: 140, masa: 34, ba: 11, tanner: '', start: null, jadra: '4to6', gnrha: '', gnrhaStart: null });
  expect(b.profile).toMatchObject({ profil: 'wczesne', zrodloStartu: 'gorna-granica', tempo: 'wolne' });
  expect(b.profile.wiekStartuLat).toBeCloseTo(9.5, 1);
  expect(b.cardText).toContain('Profil predykcyjny: wczesne pokwitanie (tempo wolne)');
  expect(b.cardText).toContain('Brakuje: wiek startu pokwitania');
});

test('bez danych pokwitaniowych profil standardowy: etykieta z modelu wiarygodności bez zmian, akapit tylko z listą braków', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const r = await policz(page, { plec: 'M', lata: 9, miesiace: 0, wzrost: 145, masa: 40, ba: 12, tanner: '', start: null, jadra: '', gnrha: '' });
  expect(r.profile).toMatchObject({ profil: 'standardowy', tempo: 'nieoceniane' });
  expect(r.cardText).toContain('Profil predykcyjny: Profil standardowy');
  expect(r.cardText).toContain('Profil pokwitaniowy: standardowy. Brakuje: brak danych pokwitaniowych (etap Tannera, wiek startu, objętość jąder)');
  expect(r.cardText).not.toContain('Reguły wag konsensusu');
});
