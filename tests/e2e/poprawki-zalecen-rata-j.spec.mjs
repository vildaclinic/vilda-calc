import { expect, test } from '@playwright/test';

// P-DIETA-POPRAWKI rata J (2026-09-22) — siedem poprawek właściciela w karcie „Zalecenia dietetyczne”:
//  1. u dorosłego nie ma podpowiedzi o stabilizacji u dzieci ani znaczka ℹ;
//  2. flagi niedostępne u dorosłego (wit. D, płyny, wzrost zakończony, masa rówieśnika) są UKRYTE,
//     nie wyszarzone (styl .diet-option-check ma display:grid!important — stąd atrybut hidden);
//  3. ruch dorosłego przy nadmiarze: łączny czas 150–300 min, w tym 2–3 sesje wzmacniające, przykłady zwykłego ruchu;
//  4. alkohol osobnym zdaniem także przy nadmiarze, bez dublowania w wyliczance talerza;
//  5. akapit o masie dziecka: pierwszy szczebel drabinki celów silnika BMI zamiast odległości od średniej;
//     zdanie o rówieśniku tylko z opcji „Masa rówieśnika”;
//  6. nawodnienie: norma łącznie z wodą z jedzenia + pasmo dla napojów (70–80 % normy);
//  7. zapis PDF na iOS z ekranu głównego przez arkusz udostępniania (download jest tam ignorowany).
// Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function' && !!window.VildaRaportPlan);
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.VildaDietRecommendations.generateRecommendations === 'function'));
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportDeliverFiles === 'function');
}

const norm = (v) => String(v == null ? '' : v).replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
const przec = (v, n) => Number(v).toFixed(n).replace('.', ',');

/** Ustawia pacjenta i flagi, generuje; oddaje tekst, zdania, punkty, dane i stan panelu opcji. */
function policz(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true; window.__vildaPlanPalTouched = false; window.__vildaDietStrategyTouched = false; window.__vildaDietGoalChoice = null;
    window.intakeHistory = null;
    set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h);
    set('customGoalKg', '');
    window.ensureDietRecommendationsElements();
    // karta rozwinięta i „opcje dodatkowe” otwarte, żeby widoczność flag dało się zmierzyć (offsetParent)
    const tresc = document.getElementById('dietRecommendationsContent');
    if (tresc && tresc.style.display === 'none') document.getElementById('dietRecommendationsBtn').click();
    document.querySelectorAll('#dietStrategyOptions details').forEach((d) => { d.open = true; });
    flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', false);
    flag('nutritionNormsFlag', true); flag('journeyFlag', true); flag('vitDSuppFlag', true); flag('hydrationFlag', true);
    flag('peerMassFlag', !!s.rowiesnik);
    if (s.flagi) Object.keys(s.flagi).forEach((id) => flag(id, s.flagi[id]));
    window.update();
    await new Promise((res) => { setTimeout(res, 160); });
    const r = window.VildaDietRecommendations.generateRecommendations();
    const d = r.dane || {};
    const wid = (id) => { const el = document.getElementById(id); const g = el && el.closest('.diet-toggle-group'); return { hidden: !!(g && g.hasAttribute('hidden')), widoczna: !!(g && g.offsetParent !== null), checked: !!(el && el.checked), disabled: !!(el && el.disabled) }; };
    const hint = document.querySelector('[data-diet-strategy-child-hint]');
    const ic = document.getElementById('stabilizationInfoIcon');
    const drab = window.VildaBmi && typeof window.VildaBmi.drabinkaCelow === 'function' && d.pacjent
      ? window.VildaBmi.drabinkaCelow({ wzrostCm: d.pacjent.wzrostCm, masaKg: d.pacjent.masaKg, plec: d.pacjent.plec, wiekMies: d.pacjent.wiekMies, zrodlo: window.bmiSource, dorosly: !!d.dorosly }) : null;
    const raport = window.VildaRaportPlan.html({ patient: { name: 'Jan Testowy' }, baseResult: window.VildaDietRecommendations.buildEnergyRecommendationResult() });
    return {
      text: r.textOutput || '', zdania: d.zdania || {}, punkty: d.punkty || {}, masa: d.masa || {}, plyny: d.plyny || null, strategia: d.strategia,
      hint: !!hint && !hint.hidden && hint.offsetParent !== null, ikona: !!ic && ic.style.display !== 'none' && ic.offsetParent !== null,
      flagi: { growthEndedFlag: wid('growthEndedFlag'), vitDSuppFlag: wid('vitDSuppFlag'), hydrationFlag: wid('hydrationFlag'), peerMassFlag: wid('peerMassFlag'), journeyFlag: wid('journeyFlag'), nutritionNormsFlag: wid('nutritionNormsFlag') },
      drab: drab && { kierunek: drab.kierunek, szczebel: drab.szczeble && drab.szczeble.length ? drab.szczeble[0] : null },
      raport: raport
    };
  }, s);
}

const RUCH_A = 'Zalecana jest aktywność fizyczna o łącznym czasie 150–300 minut tygodniowo, rozłożona na większość dni, w tym 2–3 sesje ćwiczeń wzmacniających mięśnie. Pomaga też więcej zwykłego ruchu w ciągu dnia: schody zamiast windy, spacer zamiast krótkiej jazdy autem, przerwy od siedzenia.';
const ALKOHOL = 'Alkohol jest kaloryczny, ale przede wszystkim szkodliwy dla zdrowia – zwiększa m.in. ryzyko nowotworów; nie ma bezpiecznej ilości spożycia.';

test('dorosły: bez podpowiedzi o dzieciach i ℹ, niedostępne flagi ukryte (nie wyszarzone), ruch A, alkohol osobno', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  // najpierw dziecko z zaznaczonymi flagami — po przejściu na dorosłego mają zniknąć, po powrocie wrócić ze stanem
  const dz = await policz(page, { age: 12, sex: 'F', w: 60, h: 150, rowiesnik: true });
  expect(dz.hint).toBe(true);
  expect(dz.flagi.vitDSuppFlag.widoczna).toBe(true); expect(dz.flagi.peerMassFlag.widoczna).toBe(true); expect(dz.flagi.peerMassFlag.checked).toBe(true);

  const a = await policz(page, { age: 42, sex: 'M', w: 108, h: 178, rowiesnik: true });
  expect(a.strategia).toBe('reduction');
  expect(a.hint, 'podpowiedź o stabilizacji u dzieci widoczna u dorosłego').toBe(false);
  expect(a.ikona).toBe(false);
  for (const id of ['growthEndedFlag', 'vitDSuppFlag', 'hydrationFlag', 'peerMassFlag']) {
    expect(a.flagi[id].hidden, id + ' bez atrybutu hidden').toBe(true);
    expect(a.flagi[id].widoczna, id + ' nadal widoczna u dorosłego').toBe(false);
  }
  expect(a.flagi.journeyFlag.widoczna).toBe(true); expect(a.flagi.nutritionNormsFlag.widoczna).toBe(true);
  expect(a.flagi.journeyFlag.hidden).toBe(false);

  // 3. ruch — zdanie A i punkty raportu
  expect(norm(a.zdania.ruch[0])).toBe(RUCH_A);
  expect(a.punkty.ruch.map(norm)).toEqual([
    '150–300 minut aktywności fizycznej tygodniowo, rozłożone na większość dni',
    '2–3 sesje ćwiczeń wzmacniających mięśnie',
    'więcej zwykłego ruchu w ciągu dnia: schody, spacer, przerwy od siedzenia'
  ]);
  expect(a.text).not.toContain('spontanicznej');

  // 4. alkohol: osobne zdanie (rola talerz), wyliczanka bez „alkohol”
  const talerz = (a.zdania.talerz || []).map(norm);
  expect(talerz[0]).toContain('należy ograniczyć słodkie napoje, słodycze i żywność wysoko przetworzoną.');
  expect(talerz[0]).not.toContain('alkohol');
  expect(talerz.filter((z) => z === ALKOHOL).length).toBe(1);
  expect((a.punkty.talerz || []).map(norm)).toContain('mniej: słodkie napoje, słodycze i żywność wysoko przetworzona');
  expect((a.punkty.talerz || []).map(norm).filter((p) => /^mniej:/u.test(p) && /alkohol/u.test(p)).length).toBe(0);
  expect(a.text).not.toContain('Przeciętna masa');

  // powrót do dziecka: flagi znów widoczne i nadal zaznaczone
  const dz2 = await policz(page, { age: 12, sex: 'F', w: 60, h: 150, flagi: {} });
  expect(dz2.hint).toBe(true);
  expect(dz2.flagi.vitDSuppFlag.widoczna).toBe(true); expect(dz2.flagi.vitDSuppFlag.hidden).toBe(false);
  expect(dz2.flagi.peerMassFlag.widoczna).toBe(true);
});

test('dorosły w normie: wyliczanka talerza bez „alkohol”, osobne zdanie o alkoholu dokładnie raz', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const n = await policz(page, { age: 40, sex: 'M', w: 70, h: 178 });
  expect(n.strategia).toBe('utrzymanie');
  const talerz = (n.zdania.talerz || []).map(norm);
  expect(talerz[0]).not.toContain('alkohol');
  expect(talerz.filter((z) => z === ALKOHOL).length).toBe(1);
  expect(norm(n.text)).not.toContain('napoje, alkohol');
  expect((n.punkty.talerz || []).map(norm).filter((p) => /alkohol/u.test(p) && /^mniej:/u.test(p)).length).toBe(0);
});

test('nastolatek z otyłością: pierwszy szczebel drabinki w akapicie o masie; rówieśnik tylko z opcji, osobnym akapitem', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const s = { age: 13, sex: 'F', w: 88, h: 150 };
  const r = await policz(page, s);
  expect(r.strategia).toBe('reduction');
  expect(r.drab && r.drab.kierunek).toBe('redukcja');
  const sz = r.drab.szczebel;
  expect(sz && sz.masa < 88 && sz.masa > r.masa.gornaNormaKg, 'silnik nie dał szczebla między normą a obecną masą').toBe(true);
  const oczek = 'Obecna masa ciała wynosi 88,0 kg. Pierwszy cel to ok. ' + przec(sz.masa, 1) + ' kg, czyli około ' + przec(88 - sz.masa, 1)
    + ' kg mniej; już taka zmiana poprawia ciśnienie, trójglicerydy i HDL. Górna granica normy dla wieku i wzrostu odpowiada masie ok. '
    + przec(r.masa.gornaNormaKg, 1) + ' kg, do której dochodzi się stopniowo, etapami.';
  expect(norm(r.text)).toContain(oczek);
  expect(r.text).not.toContain('Przeciętna masa');
  expect(r.text).not.toContain('wyższa od średniej');

  const z = await policz(page, { ...s, rowiesnik: true });
  const t = norm(z.text);
  expect(t).toContain(oczek);
  const m = t.match(/Przeciętna masa ciała rówieśnika w tym wieku i przy tym wzroście to ok\. (\d+,\d) kg, czyli obecna masa ciała jest o (\d+,\d) kg wyższa od średniej\./u);
  expect(m, 'brak zdania o rówieśniku po zaznaczeniu opcji').not.toBeNull();
  const q = Number(m[1].replace(',', '.')), dz = Number(m[2].replace(',', '.'));
  expect(Math.abs(88 - q - dz)).toBeLessThan(0.11);
  // osobny akapit: między „etapami.” a zdaniem o rówieśniku nie ma innego tekstu tego samego akapitu w textOutput (nowa linia)
  expect(z.text.replace(/[\u00A0\u202F]/g, ' ')).toMatch(/etapami\.\s*\n[\s\S]*?Przeciętna masa ciała rówieśnika/u);
});

test('młodsze dziecko: „Waga dziecka” z pierwszym celem, bez rówieśnika; stabilizacja bez rówieśnika', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const r = await policz(page, { age: 8, sex: 'M', w: 45, h: 130 });
  expect(r.strategia).toBe('reduction');
  const t = norm(r.text);
  const sz = r.drab && r.drab.szczebel;
  if (sz && sz.masa < 45 && sz.masa > r.masa.gornaNormaKg) {
    expect(t).toContain('Waga dziecka: 45,0 kg. Pierwszy cel to ok. ' + przec(sz.masa, 1) + ' kg, czyli około ' + przec(45 - sz.masa, 1)
      + ' kg mniej; już taka zmiana poprawia ciśnienie i wyniki lipidów. Aby masa ciała znalazła się w górnej granicy normy dla wieku i wzrostu, powinna wynosić ok. '
      + przec(r.masa.gornaNormaKg, 1) + ' kg.');
  } else {
    expect(t).toContain('Waga dziecka: 45,0 kg. Aby masa ciała znalazła się w górnej granicy normy dla wieku i wzrostu, masa ciała powinna wynosić ok. ' + przec(r.masa.gornaNormaKg, 1) + ' kg');
  }
  expect(t).not.toContain('Przeciętna waga');
  const p = await policz(page, { age: 8, sex: 'M', w: 45, h: 130, rowiesnik: true });
  expect(norm(p.text)).toMatch(/Przeciętna waga rówieśnika o takim wzroście i w tym wieku to ok\. \d+,\d kg, co oznacza, że masa ciała dziecka jest o \d+,\d kg wyższa niż średnia\./u);
  // stabilizacja (nastolatek) — bez szczebla i bez rówieśnika
  const st = await policz(page, { age: 13, sex: 'F', w: 60, h: 150, flagi: { stabilizationToggle: true, reduceToggle: false } });
  if (st.strategia === 'stabilization') {
    expect(norm(st.text)).toContain('Zalecane jest utrzymanie obecnej masy ciała podczas dalszego wzrastania');
    expect(st.text).not.toContain('Pierwszy cel');
    expect(st.text).not.toContain('Przeciętna masa');
  }
});

test('nawodnienie: norma łącznie z jedzeniem plus pasmo dla napojów (70–80 %), także na kartce raportu', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const n = await policz(page, { age: 14, sex: 'M', w: 75, h: 165 });
  expect(n.plyny && n.plyny.litry).toBe(2.35);
  expect(n.plyny.napojeOdL).toBeCloseTo(2.35 * 0.7, 6);
  expect(n.plyny.napojeDoL).toBeCloseTo(2.35 * 0.8, 6);
  expect(norm(n.text)).toContain('Zalecane jest odpowiednie nawodnienie: według polskich norm żywienia wystarczające spożycie płynów w tym wieku i tej płci wynosi około 2,35 l dziennie, licząc też wodę z jedzenia. Około jednej piątej tej ilości dają posiłki (zupy, owoce, warzywa, nabiał), więc w napojach potrzeba ok. 1,6–1,9 l dziennie, najlepiej wody i napojów niesłodzonych.');
  expect(n.text).not.toContain('łącznie z wodą zawartą w pożywieniu');
  expect(norm(n.raport.replace(/<[^>]+>/g, ' '))).toContain('2,35 l dziennie licząc wodę z jedzenia; w napojach ok. 1,6–1,9 l, najlepiej woda i napoje niesłodzone');
  const d = await policz(page, { age: 3, sex: 'F', w: 22, h: 100 });
  expect(norm(d.text)).toContain('wynosi około 1,25 l dziennie, licząc też wodę z jedzenia. Około jednej piątej tej ilości dają posiłki (zupy, owoce, warzywa, nabiał), więc w napojach potrzeba ok. 0,9–1,0 l dziennie');
});

test('zapis PDF: iOS z ekranu głównego → arkusz udostępniania z plikiem PDF; poza nim pobranie; toast wg drogi', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const w = await page.evaluate(async () => {
    const out = {};
    const blob = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });
    // symulacja iOS z ekranu głównego + Web Share z plikami
    window.patientReportIosStandalone = () => true;
    const shared = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { shared.push(d); } });
    out.ios = await window.patientReportDownloadBlob(blob, 'zalecenia.pdf');
    out.plik = shared[0] && shared[0].files && shared[0].files[0] ? { nazwa: shared[0].files[0].name, typ: shared[0].files[0].type, jestFile: shared[0].files[0] instanceof File } : null;
    out.dwa = await window.patientReportDeliverFiles([{ blob, filename: 'a.pdf' }, { blob, filename: 'b.txt' }]);
    out.dwaPliki = shared[1] ? shared[1].files.map((f) => f.name) : null;
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; } });
    out.anulowane = await window.patientReportDownloadBlob(blob, 'zalecenia.pdf');
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
    out.brak = await window.patientReportDownloadBlob(blob, 'zalecenia.pdf');
    out.toasty = {
      udostepnij: window.patientReportToastPoZapisie({ droga: 'udostepnij' }, 'ok'),
      anulowane: window.patientReportToastPoZapisie({ droga: 'anulowane' }, 'ok'),
      brak: window.patientReportToastPoZapisie({ droga: 'brak' }, 'ok'),
      pobierz: window.patientReportToastPoZapisie({ droga: 'pobierz' }, 'ok')
    };
    // zwykła przeglądarka: pobranie przez <a download>
    window.patientReportIosStandalone = () => false;
    const klik = new Promise((res) => { document.addEventListener('click', (e) => { const a = e.target && e.target.closest && e.target.closest('a[download]'); if (a) { e.preventDefault(); res(a.getAttribute('download')); } }, { capture: true, once: true }); });
    out.pobierz = await window.patientReportDownloadBlob(blob, 'zalecenia.pdf');
    out.pobierzNazwa = await klik;
    return out;
  });
  expect(w.ios).toEqual({ droga: 'udostepnij' });
  expect(w.plik).toEqual({ nazwa: 'zalecenia.pdf', typ: 'application/pdf', jestFile: true });
  expect(w.dwa).toEqual({ droga: 'udostepnij' }); expect(w.dwaPliki).toEqual(['a.pdf', 'b.txt']);
  expect(w.anulowane).toEqual({ droga: 'anulowane' });
  expect(w.brak).toEqual({ droga: 'brak' });
  expect(w.toasty.udostepnij).toContain('arkusza udostępniania');
  expect(w.toasty.anulowane).toContain('anulowane');
  expect(w.toasty.brak).toContain('Safari');
  expect(w.toasty.pobierz).toBe('ok');
  expect(w.pobierz).toEqual({ droga: 'pobierz' });
  expect(w.pobierzNazwa).toBe('zalecenia.pdf');
});
