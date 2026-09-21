import { expect, test } from '@playwright/test';

// P-DIETA-NAWYKI (rata H, 2026-09-21) — zdania nawyków przy nadmiarze masy ciała.
//
// Po co: dobre treści z usuniętego planu SMART (rata F) — stałe pory posiłków, woda jako napój,
// posiłek powoli i bez ekranu, zaplanowana kolacja zamiast wieczornego podjadania, elastyczność
// zamiast „wszystko albo nic”, zmiana dla całej rodziny — wracają jako JEDNO zdanie generatora
// z rolą „talerz” (kolumna „Na talerzu” raportu), osobne dla dorosłego, nastolatka i dziecka
// 5–10 lat. Tylko nadmiar (strategie redukcji i stabilizacji); nic przy normie, niedowadze,
// celu własnym i u malucha 2–4 lata (rata E ma już ekran i nagrodę). Zdania zatwierdzone
// przez właściciela 2026-09-21. Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function' && !!window.VildaRaportPlan);
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.VildaDietRecommendations.generateRecommendations === 'function'));
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportFormatIssueList === 'function');
}

const norm = (v) => String(v == null ? '' : v).replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
const zl = (w, rola) => norm((w.zdania[rola] || []).join(' '));

function policz(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true; window.__vildaPlanPalTouched = false; window.__vildaDietStrategyTouched = false; window.__vildaDietGoalChoice = null;
    let w = s.w;
    if (s.centyl != null) {
      const q = window.VildaBmi.wartoscDlaCentyla({ centyl: s.centyl, plec: s.sex, wiekMies: (s.age + (s.months || 0) / 12) * 12, zrodlo: 'OLAF' });
      w = Math.round(q.bmi * Math.pow(s.h / 100, 2) * 10) / 10;
    }
    set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', w); set('height', s.h); set('customGoalKg', s.cel || '');
    window.ensureDietRecommendationsElements();
    flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', !!s.ge);
    flag('nutritionNormsFlag', true); flag('journeyFlag', true); flag('vitDSuppFlag', true); flag('hydrationFlag', true);
    if (s.click) { const bt = document.querySelector(`[data-diet-strategy-choice="${s.click}"]`); if (bt) bt.click(); }
    if (s.cel) { const bt = document.querySelector('[data-diet-goal-choice="custom"]'); if (bt) bt.click(); const px = document.getElementById('customGoalKgProxy'); if (px) { px.value = String(s.cel); px.dispatchEvent(new Event('change', { bubbles: true })); } }
    window.update();
    await new Promise((res) => { setTimeout(res, 160); });
    const r = window.VildaDietRecommendations.generateRecommendations();
    const d = r.dane || {};
    return { w, text: r.textOutput || '', html: r.htmlOutput || '', zdania: d.zdania || {}, punkty: d.punkty || {}, strategia: d.strategia };
  }, s);
}

const H_DOROSLY = 'Utrzymaniu planu sprzyjają stałe pory 3–4 posiłków bez podjadania między nimi, woda jako podstawowy napój, co najmniej jeden posiłek dziennie zjedzony powoli i bez ekranu oraz zaplanowana kolacja zamiast wieczornego podjadania; plan nie musi być idealny – pojedyncze odstępstwa nie przekreślają efektu, a podejście „wszystko albo nic” sprzyja porzucaniu zmian.';
const H_NASTOLATEK = 'Pomaga stały rytm posiłków ze śniadaniem, woda jako podstawowy napój, jeden posiłek dziennie bez telefonu i ekranu, jedzony powoli, oraz zaplanowana kolacja zamiast wieczornego podjadania; pojedyncze odstępstwo nie przekreśla planu – lepsze są rozsądne porcje niż zasada „nigdy więcej”.';
const H_DZIECKO = 'Zmiany powinny obejmować całą rodzinę i środowisko domowe: stałe pory posiłków, co najmniej jeden posiłek dziennie wspólnie przy stole i bez ekranu, przekąski tylko zaplanowane i podane na talerzu, jedzenie nie jako nagroda ani pocieszenie, bez komentowania wyglądu dziecka i porównywania go z rówieśnikami.';
const NAWYKI = /wieczornego podjadania|jedzenie nie jako nagroda|wszystko albo nic|nigdy więcej/u;

// Punkty cytują zdanie: liczby dokładnie, słowa ≥ 5 liter po 4-literowym rdzeniu (reguły punkty-zalecen.spec).
const zloz = (s) => norm(s).toLowerCase().replace(/[ąćęłńóśźż]/g, (c) => 'acelnoszz'['ąćęłńóśźż'.indexOf(c)]);
const LICZBY = /\d+(?:[.,]\d+)?/g; const SLOWA = /[0-9a-z-]+/g;
function punktyCytuja(w, rola, opis) {
  const zdanie = norm((w.zdania[rola] || []).join(' '));
  const liczby = new Set(zdanie.match(LICZBY) || []);
  const rdzenie = new Set((zloz(zdanie).match(SLOWA) || []).map((x) => x.slice(0, 4)));
  w.punkty[rola].forEach((p) => {
    (norm(p).match(LICZBY) || []).forEach((n) => { expect(liczby, `${opis}: liczba „${n}”`).toContain(n); });
    (zloz(p).match(SLOWA) || []).filter((x) => x.length >= 5 && !['wiecej', 'mniej', 'zamiast', 'codziennie', 'notowanie', 'obserwacja'].includes(x)).forEach((x) => { expect(rdzenie, `${opis}: słowo „${x}”`).toContain(x.slice(0, 4)); });
  });
}

test('nadmiar: dorosły, nastolatek i dziecko 5–10 lat dostają zdanie nawyków jako drugie zdanie talerza; punkty je cytują', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const przypadki = [
    ['dorosły otyłość', { age: 35, sex: 'M', h: 175, w: 105 }, H_DOROSLY, 'stałe pory 3–4 posiłków, bez podjadania'],
    ['dorosła nadwaga', { age: 40, sex: 'F', h: 165, w: 72 }, H_DOROSLY, 'pojedyncze odstępstwa nie przekreślają efektu'],
    ['nastolatek nadwaga (redukcja)', { age: 14, sex: 'M', h: 165, w: 75 }, H_NASTOLATEK, 'stały rytm posiłków ze śniadaniem'],
    ['nastolatka nadwaga (stabilizacja)', { age: 12, sex: 'F', h: 150, centyl: 92, click: 'stabilization' }, H_NASTOLATEK, 'pojedyncze odstępstwo nie przekreśla planu'],
    ['dziecko otyłość (stabilizacja)', { age: 8, sex: 'F', h: 128, centyl: 98 }, H_DZIECKO, 'jedzenie nie jako nagroda ani pocieszenie'],
    ['dziecko otyłość (jawna redukcja)', { age: 8, sex: 'F', h: 130, w: 40, click: 'reduction' }, H_DZIECKO, 'bez komentowania wyglądu dziecka'],
    ['5-latek nadwaga', { age: 5, months: 6, sex: 'M', h: 112, centyl: 93 }, H_DZIECKO, 'stałe pory posiłków'],
  ];
  for (const [opis, s, zdanie, punkt] of przypadki) {
    const w = await policz(page, s);
    expect(['reduction', 'stabilization'], opis).toContain(w.strategia);
    expect(w.zdania.talerz, opis).toHaveLength(2);
    expect(norm(w.zdania.talerz[1]), opis).toBe(zdanie);
    expect(norm(w.text), opis).toContain(zdanie);
    expect(w.punkty.talerz, opis).toContain(punkt);
    punktyCytuja(w, 'talerz', opis);
    // raport tekstowy: nadal numerowana lista, zdanie jako osobna pozycja
    expect((w.html.match(/<li>/g) || []).length, opis).toBe((w.text.match(/^\s*\d+\. /gm) || []).length);
  }
});

test('kontrole ujemne: norma, niedowaga, cel własny i maluch 2–4 lata bez zdania nawyków', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  for (const [opis, s] of [
    ['dorosła norma', { age: 30, sex: 'F', h: 168, w: 60 }],
    ['dorosła cel własny', { age: 30, sex: 'F', h: 168, w: 68, cel: 62 }],
    ['dorosła niedowaga', { age: 28, sex: 'F', h: 168, w: 50 }],
    ['nastolatka norma', { age: 15, sex: 'F', h: 162, centyl: 50 }],
    ['nastolatka cel własny', { age: 17, sex: 'F', h: 165, centyl: 80, ge: true, cel: 55 }],
    ['nastolatka niedowaga', { age: 12, sex: 'F', h: 150, centyl: 4 }],
    ['dziecko norma', { age: 8, sex: 'M', h: 128, centyl: 50 }],
    ['dziecko niedowaga', { age: 8, sex: 'F', h: 128, centyl: 4 }],
    ['maluch nadmiar', { age: 3, sex: 'F', h: 100, centyl: 97 }],
    ['maluch norma', { age: 3, sex: 'M', h: 100, centyl: 50 }],
  ]) {
    const w = await policz(page, s);
    expect(norm(w.text), opis).not.toMatch(NAWYKI);
    for (const k of ['talerz']) for (const z of (w.zdania[k] || [])) expect(norm(z), opis).not.toMatch(NAWYKI);
  }
  // maluch z nadmiarem ma własne zdanie raty E o nagrodzie — to nie jest zdanie raty H
  const m = await policz(page, { age: 3, sex: 'F', h: 100, centyl: 97 });
  expect(zl(m, 'talerz')).toContain('nie powinno służyć jako nagroda');
  expect(zl(m, 'talerz')).not.toContain('rówieśnikami');
});
