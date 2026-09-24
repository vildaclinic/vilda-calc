import { expect, test } from '@playwright/test';

// P-TRAJ rata T4 (decyzje właściciela 2026-09-24): kontekst flagi w dół w banerze lekarza — P1 (okno okołopokwitaniowe,
// Tanner I: żółty), P0 (okno bez Tannera: żółty), P2 (Tanner II–III: czerwony), R (ku celowi rodziców: żółty), D (czerwony),
// wiek bazy w dopełniaczu. PRAWDZIWA strona (index i docpro), wiersze historii dodawane przyciskiem karty. Dane FIKCYJNE.

const ZOLTY = 'rgb(178, 106, 0)';

async function otworz(page, strona) {
  await page.goto(`/${strona || 'index.html'}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.patientReportBuildModel === 'function'
    && !!window.VildaRaportNaglowek && !!window.VildaTrajectoryAnalysis && window.VildaTrajectoryAnalysis.version >= '27');
}

// s: { age, months, sex, w, h (cm) albo hc (centyl), mo, fa, pro, historia: [{ age, months, hc|h, w }] }
async function model(page, s) { // + s.tanner (1–5 albo null)
  return page.evaluate(async (s) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const tgl = document.getElementById('resultsModeToggle');
    const ustawTryb = (pro) => { if (tgl && tgl.checked !== pro) { tgl.checked = pro; tgl.dispatchEvent(new Event('change', { bubbles: true })); } };
    ustawTryb(true); // wiersze historii wpisujemy w trybie profesjonalnym (karta zaawansowana)
    window.intakeHistory = null; window.lastLoadedData = null; window.hasUserModifiedAfterLoad = false;
    ['bpSystolic', 'bpDiastolic', 'heartRate', 'respRate', 'waistCm', 'hipCm', 'headCircumference', 'chestCircumference', 'customGoalKg'].forEach((id) => set(id, ''));
    document.querySelectorAll('#advMeasurements .measure-row .remove-measure').forEach((b) => b.click());
    set('name', 'Testowy Fikcyjny'); set('sex', s.sex); set('age', s.age); set('ageMonths', s.months || 0);
    set('weight', ''); set('height', ''); window.update();
    const wiek = s.age + (s.months || 0) / 12;
    const przyCentylu = (ageY, pc) => Math.round(window.patientReportGetMetricValueAtPercentile('HT', s.sex, ageY, pc) * 10) / 10;
    const h = s.h != null ? s.h : przyCentylu(wiek, s.hc);
    set('weight', s.w); set('height', h);
    set('tannerStage', s.tanner == null ? '' : s.tanner);
    set('advMotherHeight', s.mo == null ? '' : s.mo); set('advFatherHeight', s.fa == null ? '' : s.fa);
    const wiersze = [];
    for (const r of s.historia || []) {
      const btn = document.getElementById('advAddMeasurementBtn'); if (btn) btn.click();
      const rows = document.querySelectorAll('#advMeasurements .measure-row');
      const w = rows[rows.length - 1];
      const ageY = r.age + (r.months || 0) / 12;
      const hh = r.h != null ? r.h : przyCentylu(ageY, r.hc);
      const wpisz = (sel, v) => { const el = w.querySelector(sel); if (!el) return; el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
      wpisz('.adv-age-years', r.age); wpisz('.adv-age-months', r.months || 0); wpisz('.adv-height', hh); wpisz('.adv-weight', r.w);
      wiersze.push({ age: r.age, months: r.months || 0, h: hh });
    }
    if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced();
    if (s.pro === false) ustawTryb(false);
    window.update();
    await new Promise((r) => { setTimeout(r, 500); });
    const m = window.patientReportBuildModel();
    const TA = window.VildaTrajectoryAnalysis;
    const rf = TA && typeof TA.heightRedFlagOf === 'function' ? TA.heightRedFlagOf(window.advancedGrowthTrajectory || null) : 'brak';
    // banery kart wzrostowych (widoczne akapity z treścią flagi w dół) — prawdziwy DOM
    const banery = [...document.querySelectorAll('p')].filter((p) => /pozycji centylowej wzrostu \(zmiana hSDS/.test(p.textContent))
      .map((p) => ({ tekst: p.textContent.trim(), kolor: getComputedStyle(p).color, widoczny: !!p.offsetParent, gdzie: (p.closest('[id]') || {}).id || null }));
    return { rf, h, wiersze, banery, hl: m.headline };
  }, s);
}

const KOWD = { age: 12, months: 0, sex: 'M', w: 34, hc: 15, historia: [{ age: 3, months: 0, hc: 50, w: 14 }, { age: 8, months: 0, hc: 45, w: 25 }, { age: 11, months: 0, hc: 25, w: 31 }] };
// baner renderuje karta podstawowa (basicGrowthResults) i zaawansowana (advResults) — obie z buildCardAlertsHtml;
// w teście sekcje wyników bywają zwinięte, więc sprawdzamy treść wyrenderowanego DOM, nie widoczność.
const jeden = (r) => {
  expect(r.banery.length, JSON.stringify(r.banery)).toBeGreaterThan(0);
  for (const b of r.banery) expect(['basicGrowthResults', 'advResults']).toContain(b.gdzie);
  expect(new Set(r.banery.map((b) => b.tekst)).size, 'obie karty mówią to samo').toBe(1);
  return r.banery[0];
};

test.describe('P-TRAJ rata T4 — baner lekarza przy obniżeniu pozycji wzrostu', () => {
  test('RT4-1 (P1): chłopiec 12 lat, Tanner I, 3 l. na 50. c → dziś 15. c — żółty, bez skierowania', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { ...KOWD, tanner: 1 });
    expect(r.rf && r.rf.kontekst).toMatchObject({ wariant: 'P1', ton: 'warn' });
    const b = jeden(r);
    expect(b.tekst).toMatch(/^Obniżenie pozycji centylowej wzrostu \(zmiana hSDS: −1,\d\d względem pomiaru z wieku 3 lat\) w wieku okołopokwitaniowym, bez cech dojrzewania \(Tanner I\) — obraz częsty przy późniejszym skoku pokwitaniowym/);
    expect(b.tekst).not.toMatch(/endokrynolog|umów wizytę/);
    expect(b.kolor).toBe(ZOLTY);
  });

  test('RT4-2 (P2): ta sama seria, Tanner III — czerwony, „mimo cech dojrzewania”, konsultacja', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { ...KOWD, tanner: 3 });
    expect(r.rf.kontekst.wariant).toBe('P2');
    const b = jeden(r);
    expect(b.tekst).toMatch(/^Z analizy siatki centylowej wynika istotne obniżenie pozycji centylowej wzrostu \(zmiana hSDS: −1,\d\d względem pomiaru z wieku 3 lat\) mimo cech dojrzewania \(Tanner III\), gdy oczekiwany jest skok pokwitaniowy — obraz deceleracji wzrastania, wskazana konsultacja endokrynologiczna, umów wizytę$/);
    expect(b.kolor).not.toBe(ZOLTY);
  });

  test('RT4-3 (P0): ta sama seria bez stadium Tannera — żółty, prośba o uzupełnienie', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { ...KOWD, tanner: null });
    expect(r.rf.kontekst.wariant).toBe('P0');
    const b = jeden(r);
    expect(b.tekst).toMatch(/w wieku okołopokwitaniowym — ocena zależy od etapu dojrzewania: .* Uzupełnij stadium Tannera\.$/);
    expect(b.kolor).toBe(ZOLTY);
  });

  test('RT4-4 (R): chłopiec 8 lat, 3 l. na 97. c → dziś 72. c, rodzice 163/176 — żółty, w kierunku celu rodziców', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { age: 8, months: 0, sex: 'M', w: 26, hc: 72, mo: 163, fa: 176, historia: [{ age: 3, months: 0, hc: 97, w: 16 }, { age: 5, months: 0, hc: 90, w: 20 }] });
    expect(r.rf.kontekst.wariant).toBe('R');
    const b = jeden(r);
    expect(b.tekst).toMatch(/w kierunku wzrostu docelowego wg rodziców \(hSDS − mpSDS: z \+\d,\d\d na [+−]?\d,\d\d\) — wzrost pozostaje w kanale rodzinnym; wskazana kontrola tempa wzrastania w kolejnych pomiarach\.$/);
    expect(b.kolor).toBe(ZOLTY);
  });

  test('RT4-5 (D): dziewczynka 8 lat, 4 l. na 50. c → dziś 12. c — czerwony jak dotąd, wiek bazy w dopełniaczu', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { age: 8, months: 0, sex: 'F', w: 24, hc: 12, historia: [{ age: 4, months: 0, hc: 50, w: 16 }, { age: 6, months: 0, hc: 42, w: 20 }] });
    expect(r.rf.kontekst.wariant).toBe('D');
    const b = jeden(r);
    expect(b.tekst).toMatch(/^Z analizy siatki centylowej wynika istotne obniżenie pozycji centylowej wzrostu \(zmiana hSDS: −1,\d\d względem pomiaru z wieku 4 lat\) — obraz deceleracji wzrastania, wskazana konsultacja endokrynologiczna, umów wizytę$/);
    expect(b.kolor).not.toBe(ZOLTY);
  });

  test('RT4-6: docpro — ten sam wariant P1 i ta sama treść co index', async ({ page }) => {
    await otworz(page, 'docpro.html');
    const r = await model(page, { ...KOWD, tanner: 1 });
    expect(r.rf.kontekst.wariant).toBe('P1');
    expect(jeden(r).tekst).toMatch(/bez cech dojrzewania \(Tanner I\) — obraz częsty przy późniejszym skoku pokwitaniowym/);
  });
});
