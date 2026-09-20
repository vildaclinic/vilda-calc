import { expect, test } from '@playwright/test';

// P-RAPORT-ZDANIA — generator oddaje swoje zdania z podzialem na role, zeby raport pacjenta
// CYTOWAL zalecenia, a nie pisal wlasnej parafrazy.
//
// Po co: zalecenia ruchowe i zywieniowe roznia sie pasmami wieku. 2–4 lata maja 180 minut
// ruchu dziennie i limit czasu przed ekranem, starsze dzieci 60 minut, dorosli 150–300 minut
// tygodniowo z treningiem oporowym. Gdyby raport mial te listy wpisane na sztywno, na krancach
// wieku pokazalby pacjentowi inne zalecenie niz raport tekstowy tej samej aplikacji, z tej samej
// wizyty. Te testy pilnuja, ze kazde zdanie w `dane.zdania` jest DOKLADNIE zdaniem, ktore poszlo
// do tekstu.
//
// Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function');
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.VildaDietRecommendations.generateRecommendations === 'function'));
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportFormatIssueList === 'function');
}

const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

function policz(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true;
    window.__vildaPlanPalTouched = false;
    window.__vildaDietStrategyTouched = false;
    set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h);
    window.ensureDietRecommendationsElements();
    const opcje = s.opcje !== false;
    flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', false);
    flag('nutritionNormsFlag', opcje); flag('journeyFlag', opcje); flag('vitDSuppFlag', opcje); flag('hydrationFlag', opcje);
    flag('patientFacingToggle', !!s.pf);
    window.update();
    await new Promise((res) => { setTimeout(res, 120); });
    const r = window.VildaDietRecommendations.generateRecommendations();
    return { text: r.textOutput || '', zdania: (r.dane && r.dane.zdania) || {} };
  }, s);
}

/** Kazde zdanie kazdej roli musi byc doslownie obecne w tekscie zalecen. */
function rolePokrywajaTekst(w) {
  const t = norm(w.text);
  Object.keys(w.zdania).forEach((rola) => {
    w.zdania[rola].forEach((zd) => {
      expect(t, 'rola ' + rola + ': zdanie spoza tekstu zalecen').toContain(norm(zd));
    });
  });
}

test('dorosly z otyloscia: trzy role cytuja zdania z tekstu', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const w = await policz(page, { age: 42, sex: 'M', w: 108, h: 178 });

  expect(Object.keys(w.zdania).sort()).toEqual(['kontrola', 'ruch', 'talerz']);
  rolePokrywajaTekst(w);

  expect(norm(w.zdania.ruch[0])).toContain('150–300 minut tygodniowo');
  expect(norm(w.zdania.ruch[0])).toContain('treningu oporowego');
  expect(norm(w.zdania.kontrola[0])).toContain('monitorowanie masy ciała raz w tygodniu');
  expect(norm(w.zdania.talerz[0])).toContain('Jadłospis');

  // kontrola ujemna: rola „ruch" nie moze zlapac zdania o kaloriach ani o czasie dojscia
  expect(norm(w.zdania.ruch[0])).not.toContain('kcal');
  expect(norm(w.zdania.talerz[0])).not.toContain('minut');
});

test('pasma wieku: 3-latka dostaje 180 minut i limit ekranu, nastolatka 60 minut', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  const male = await policz(page, { age: 3, sex: 'F', w: 22, h: 100 });
  rolePokrywajaTekst(male);
  const ruchMale = norm(male.zdania.ruch[0]);
  expect(ruchMale).toContain('co najmniej 180 minut dziennie');
  expect(ruchMale).toContain('czasu przed ekranem do 1 godziny');

  const nasto = await policz(page, { age: 14, months: 6, sex: 'F', w: 75, h: 150 });
  rolePokrywajaTekst(nasto);
  const ruchNasto = norm(nasto.zdania.ruch[0]);
  expect(ruchNasto).toContain('co najmniej 60 minut każdego dnia');

  // TO JEST POWOD ISTNIENIA TEJ RATY: jedna statyczna lista w raporcie przeczylaby
  // zaleceniom tekstowym u jednego z tych dwojga pacjentow.
  expect(ruchMale).not.toBe(ruchNasto);
  expect(ruchNasto).not.toContain('180 minut');
  expect(ruchMale).not.toContain('60 minut każdego dnia');
});

test('rejestr „Dla pacjenta" zmienia brzmienie ról, a nie ich przypisanie', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const pro = await policz(page, { age: 14, months: 6, sex: 'F', w: 75, h: 150, pf: false });
  const pac = await policz(page, { age: 14, months: 6, sex: 'F', w: 75, h: 150, pf: true });

  rolePokrywajaTekst(pro);
  rolePokrywajaTekst(pac);
  expect(Object.keys(pro.zdania).sort()).toEqual(Object.keys(pac.zdania).sort());
  // inne brzmienie (rejestr osobowy), ta sama rola
  expect(norm(pro.zdania.ruch[0])).not.toBe(norm(pac.zdania.ruch[0]));
  expect(norm(pac.zdania.ruch[0])).toContain('minut');
});

test('kontrole ujemne: brak zdania to brak roli, a role nie przeciekaja miedzy pacjentami', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  // najpierw pacjent z kompletem rol
  const zRolami = await policz(page, { age: 42, sex: 'M', w: 108, h: 178 });
  expect(Object.keys(zRolami.zdania).sort()).toEqual(['kontrola', 'ruch', 'talerz']);

  // to samo okno, dorosly w normie: generator nie pisze o talerzu ani o ruchu, wiec rol NIE MA.
  // Gdyby zbiornik przeciekal, raport pokazalby zdrowemu pacjentowi zalecenia poprzedniego.
  const wNormie = await policz(page, { age: 30, sex: 'M', w: 72, h: 180 });
  expect(wNormie.zdania.talerz).toBeUndefined();
  expect(wNormie.zdania.ruch).toBeUndefined();
  expect(wNormie.zdania.kontrola).toBeUndefined();
  expect(norm(wNormie.text)).toContain('mieści się w zakresie prawidłowym');

  // i z powrotem — role wracaja dla pacjenta, ktory je ma
  const znowu = await policz(page, { age: 42, sex: 'M', w: 108, h: 178 });
  expect(Object.keys(znowu.zdania).sort()).toEqual(['kontrola', 'ruch', 'talerz']);
  rolePokrywajaTekst(znowu);
});

test('dziecko 6-11 lat i nastolatek z nadwaga: role cytuja tekst bez wyjatku', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  for (const s of [
    { age: 8, months: 3, sex: 'M', w: 45, h: 130 },
    { age: 16, sex: 'M', w: 82, h: 176 },
    { age: 12, sex: 'F', w: 40, h: 150 },
    { age: 14, months: 6, sex: 'F', w: 75, h: 150, opcje: false }
  ]) {
    const w = await policz(page, s);
    rolePokrywajaTekst(w);
    expect(norm(w.zdania.ruch[0])).toContain('minut');
  }
});
