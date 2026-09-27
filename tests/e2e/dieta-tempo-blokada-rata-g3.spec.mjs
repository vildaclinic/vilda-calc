import { expect, test } from '@playwright/test';

// P-DIETA rata G3 (decyzja właściciela 2026-09-27, po makiecie): tempo wzrastania poniżej normy (B1) wygrywa z blokadą
// stabilizacji z prognozy wzrostu końcowego („nie zdąży wyrosnąć”). Przełącznik stabilizacji zostaje aktywny, domyślna jest
// stabilizacja, dymek ℹ mówi, dlaczego; ręczna redukcja nadal wygrywa; tempo w normie i „do oceny” (B2) bez zmian; index
// i docpro liczą to samo. Dymek blokady bez nazwy serwisu. PRAWDZIWA strona; historia wzrostu dodawana przyciskiem karty
// zaawansowanej, wzrost rodziców w polach karty. Dane FIKCYJNE.

const NB = ' ';
const DYMEK_ALARM = `Tempo wzrastania poniżej normy (2,0${NB}cm/rok; norma ≥${NB}4${NB}cm/rok): domyślnie stabilizacja masy ciała. Prognoza wzrostu końcowego wskazywałaby redukcję, ale przy takim tempie wzrastania jest niepewna. Redukcję można wybrać ręcznie.`;
const DYMEK_BLOKADA = 'Według prognozy wzrostu końcowego pacjent nie zdąży wyrosnąć z otyłości — strategia: redukcja masy ciała.';

async function otworz(page, strona) {
  await page.goto(`/${strona || 'index.html'}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.buildDietEnergyRecommendationResult === 'function'
    && typeof window.energyChildGrowthOutlook === 'function' && typeof window.vildaStabilizacjaZablokowanaPrognoza === 'function');
}

// s: { sex, age, w, h, tanner, mama, tata, historia: [{ age, h, w }], redukcja }
async function stan(page, s) {
  return page.evaluate(async (s) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true; window.intakeHistory = null; window.lastLoadedData = null; window.hasUserModifiedAfterLoad = false;
    window.__vildaPlanPalTouched = false; window.__vildaPlanPalDefault = null; window.__vildaDietStrategyTouched = false;
    set('name', 'Testowa Fikcyjna'); set('sex', s.sex); set('age', s.age); set('ageMonths', 0); set('weight', s.w); set('height', s.h); set('customGoalKg', '');
    set('tannerStage', s.tanner == null ? '' : s.tanner);
    set('advMotherHeight', s.mama == null ? '' : s.mama); set('advFatherHeight', s.tata == null ? '' : s.tata);
    for (const r of s.historia || []) {
      document.getElementById('advAddMeasurementBtn').click();
      const rows = document.querySelectorAll('#advMeasurements .measure-row');
      const w = rows[rows.length - 1];
      const wpisz = (sel, v) => { const el = w.querySelector(sel); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
      wpisz('.adv-age-years', r.age); wpisz('.adv-age-months', 0); wpisz('.adv-height', r.h); wpisz('.adv-weight', r.w);
    }
    if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced();
    window.update();
    await new Promise((r) => { setTimeout(r, 700); });
    if (typeof window.ensureDietRecommendationsElements === 'function') window.ensureDietRecommendationsElements();
    if (s.redukcja) {
      window.__vildaDietStrategyTouched = true;
      const rt = document.getElementById('reduceToggle'), sb = document.getElementById('stabilizationToggle');
      if (sb) sb.checked = false;
      if (rt) { rt.checked = true; rt.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    window.update();
    await new Promise((r) => { setTimeout(r, 700); });
    const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();
    const d = window.buildDietEnergyRecommendationResult().dane || {};
    const agd = window.advancedGrowthData || {};
    const sb = document.getElementById('stabilizationToggle'), rt = document.getElementById('reduceToggle'), ic = document.getElementById('stabilizationInfoIcon');
    const planKarta = document.getElementById('planCard');
    return {
      prognozaCm: agd.finalHeightPrediction && agd.finalHeightPrediction.cm, tempo: agd.tempo ? { cm: agd.tempo.cmPerYear, alarm: agd.tempo.alarm === true, sev: agd.tempo.severity || null } : null,
      blokada: window.vildaStabilizacjaZablokowanaPrognoza(),
      przelaczniki: sb && rt ? { stabWylaczona: sb.disabled, stab: sb.checked, redukcja: rt.checked } : null,
      dymek: ic && ic.style.display !== 'none' ? ic.title : null,
      strategia: d.strategia, podaz: d.energia && d.energia.podazZaokrKcal, deficyt: d.energia && d.energia.deficytKcal,
      zdanieTempa: d.tempoWzrastania ? norm(d.tempoWzrastania.zdanie).replace(/\u00A0/g, ' ') : null, ocena: d.tempoWzrastania && d.tempoWzrastania.ocena,
      powodWKarcie: planKarta ? /strategia domyślna przy tempie wzrastania poniżej normy/.test(planKarta.textContent) : null,
    };
  }, s);
}

const A = { sex: 'F', age: 13, w: 75, h: 155, tanner: 1, mama: 160, tata: 172, historia: [{ age: 12, h: 153, w: 72 }] };
const B1_ZDANIE = 'Tempo wzrastania jest poniżej normy: 2,0 cm/rok (norma ≥ 4 cm/rok). Przy nadmiarze masy ciała wymaga to dalszej oceny, m.in. w kierunku przyczyn hormonalnych';

test.describe('P-DIETA rata G3 — tempo poniżej normy a blokada stabilizacji z prognozy', () => {
  test('G3-1: 13 l., Tanner I, 2 cm/rok, rodzice 160/172 (prognoza „nie zdąży wyrosnąć”) → stabilizacja 2200 kcal, przełącznik aktywny, dymek', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, A);
    expect(r.tempo).toMatchObject({ cm: 2, alarm: true });
    expect(r.blokada).toBe(true); // bez alarmu prognoza wyłączyłaby stabilizację
    expect(r.przelaczniki).toEqual({ stabWylaczona: false, stab: true, redukcja: false });
    expect(r.dymek).toBe(DYMEK_ALARM);
    expect(r.strategia).toBe('stabilization');
    expect(r.podaz).toBe(2200);
    expect(r.deficyt).toBeNull();
    expect(r.zdanieTempa).toBe(`${B1_ZDANIE}, dlatego plan ma charakter stabilizacji masy ciała. Wzrost jest mierzony na każdej wizycie kontrolnej.`);
    expect(r.powodWKarcie).toBe(true);
  });

  test('G3-2: ta sama pacjentka, redukcja wybrana ręcznie → redukcja i zdanie B1 w wariancie redukcji', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { ...A, redukcja: true });
    expect(r.strategia).toBe('reduction');
    expect(r.podaz).toBe(1800);
    expect(r.zdanieTempa).toBe(`${B1_ZDANIE}. W czasie diety redukcyjnej wzrost jest mierzony na każdej wizycie kontrolnej.`);
  });

  test('G3-3: bez zmian — tempo w normie (7 cm/rok) i „do oceny” (14 l., 3 cm/rok): blokada działa, dymek blokady bez nazwy serwisu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const n = await stan(page, { ...A, tanner: null, historia: [{ age: 12, h: 148, w: 70 }] });
    expect(n.tempo).toMatchObject({ cm: 7, alarm: false });
    expect(n.przelaczniki).toMatchObject({ stabWylaczona: true, stab: false });
    expect(n.dymek).toBe(DYMEK_BLOKADA);
    expect(n.strategia).toBe('reduction');
    expect(n.podaz).toBe(1800);
    await otworz(page);
    const b = await stan(page, { sex: 'M', age: 14, w: 90, h: 160, tanner: 2, mama: 158, tata: 170, historia: [{ age: 13, h: 157, w: 86 }] });
    expect(b.tempo).toMatchObject({ cm: 3, alarm: false, sev: 'warn' });
    expect(b.ocena).toBe('do-oceny');
    expect(b.przelaczniki).toMatchObject({ stabWylaczona: true });
    expect(b.strategia).toBe('reduction');
  });

  test('G3-4: docpro (bez przełączników) — ta sama pacjentka jak w index: stabilizacja 2200 kcal i zdanie B1 „tempo”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page, 'docpro.html');
    const r = await stan(page, A);
    expect(r.przelaczniki).toBeNull();
    expect(r.blokada).toBe(true);
    expect(r.strategia).toBe('stabilization');
    expect(r.podaz).toBe(2200);
    expect(r.zdanieTempa).toBe(`${B1_ZDANIE}, dlatego plan ma charakter stabilizacji masy ciała. Wzrost jest mierzony na każdej wizycie kontrolnej.`);
  });
});
