import { expect, test } from '@playwright/test';

// P-DIETA rata G2 (decyzja właściciela 2026-09-26, po makiecie): stabilizacja dziecka w planie PDF i „Raporcie po wizycie”
// to plan UTRZYMANIA masy — tytuł „Twój plan utrzymania masy ciała”, „CEL NA TEN ETAP: utrzymanie obecnej masy ciała” bez osi
// w kilogramach i bez pierwszego kroku; w raporcie „Na tym etapie celem jest utrzymanie obecnej masy ciała (ok. X kg).”
// i karta masy „Cel na ten etap”. Redukcja (dziecko, dorosły) bez zmian. PRAWDZIWA strona; tytuł i treść kartki z prawdziwego
// dietRecommendationsCollectPdfPages (biblioteki PDF zaślepione, jak w audyt-zalecen). Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.buildDietEnergyRecommendationResult === 'function'
    && !!window.VildaRaportPlan && window.VildaRaportPlan.version >= 15 && typeof window.dietRecommendationsCollectPdfPages === 'function'
    && typeof window.patientReportBuildModel === 'function');
}

async function stan(page, s) {
  return page.evaluate(async (s) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true; window.intakeHistory = null; window.lastLoadedData = null; window.hasUserModifiedAfterLoad = false;
    window.__vildaPlanPalTouched = false; window.__vildaPlanPalDefault = null; window.__vildaDietStrategyTouched = false;
    document.querySelectorAll('#advMeasurements .measure-row .remove-measure').forEach((b) => b.click());
    set('name', 'Testowy Fikcyjny'); set('sex', s.sex); set('age', s.age); set('ageMonths', 0); set('weight', s.w); set('height', s.h); set('customGoalKg', '');
    set('tannerStage', s.tanner == null ? '' : s.tanner);
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
    const jf = document.getElementById('journeyFlag'); if (jf && !jf.checked) { jf.checked = true; jf.dispatchEvent(new Event('change', { bubbles: true })); }
    window.update();
    await new Promise((r) => { setTimeout(r, 700); });
    const norm = (t) => String(t || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    const d = window.buildDietEnergyRecommendationResult().dane;
    window.vildaEnsurePdfLibraries = async () => true;
    window.jspdf = window.jspdf || { jsPDF: function JsPdfStub() {} };
    window.html2canvas = window.html2canvas || (async () => { const c = document.createElement('canvas'); c.width = 1240; c.height = 1754; return c; });
    const captured = { html: '' };
    const observer = new MutationObserver(() => {
      document.querySelectorAll('.diet-pdf-root').forEach((root) => { if (root.innerHTML.length > captured.html.length) captured.html = root.innerHTML; });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const r = await window.dietRecommendationsCollectPdfPages({});
    observer.disconnect();
    const tmp = document.createElement('div'); tmp.innerHTML = captured.html.replace(/<style[\s\S]*?<\/style>/g, '');
    const droga = tmp.querySelector('.vrp-droga');
    const m = window.patientReportBuildModel();
    const wt = m.metricCards.find((c) => c.key === 'WT');
    return {
      strategia: d.strategia,
      tytul: r.title, h1: norm((tmp.querySelector('h1') || {}).textContent),
      // tekst bloków liściowych sekcji, rozdzielony „ | ” (nagłówek, etykieta, liczba, podpisy, stopka)
      droga: droga ? Array.from(droga.querySelectorAll('span, div')).filter((el) => !el.querySelector('div, span')).map((el) => norm(el.textContent)).filter(Boolean).join(' | ') : '', os: !!(droga && droga.querySelector('.vrp-pasek')),
      naglowek: norm(m.headline && m.headline.text),
      wtRef2: wt && wt.secondaryReference ? norm(`${wt.secondaryReference.label}: ${wt.secondaryReference.medianText}`) : null,
    };
  }, s);
}

test.describe('P-DIETA rata G2 — plan PDF i raport przy stabilizacji dziecka', () => {
  test('G2-1: dziewczynka 13 l., otyłość, Tanner I, 2 cm/rok (stabilizacja B1) — tytuł utrzymania, cel na ten etap, bez osi i pierwszego kroku', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { sex: 'F', age: 13, w: 75, h: 155, tanner: 1, historia: [{ age: 12, h: 153, w: 72 }] });
    expect(r.strategia).toBe('stabilization');
    expect(r.tytul).toBe('Twój plan utrzymania masy ciała');
    expect(r.h1).toBe('Twój plan utrzymania masy ciała');
    expect(r.droga).toBe('TWOJA DROGA | CEL NA TEN ETAP | 75,0 kg | utrzymanie obecnej masy ciała | Górna granica normy BMI przy obecnym wzroście: 53,8 kg (85. centyl).');
    expect(r.os).toBe(false);
    expect(r.naglowek).toContain('Na tym etapie celem jest utrzymanie obecnej masy ciała (ok. 75,0 kg).');
    expect(r.naglowek).not.toContain('Pierwszy krok');
    expect(r.wtRef2).toBe('Cel na ten etap: utrzymanie masy ok. 75,0 kg');
  });

  test('G2-2: chłopiec 10 l., nadwaga, 6 cm/rok (stabilizacja domyślna) — zachęta o wzrastaniu i czas dojścia przy stałej masie', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { sex: 'M', age: 10, w: 52, h: 145, historia: [{ age: 9, h: 139, w: 47 }] });
    expect(r.strategia).toBe('stabilization');
    expect(r.tytul).toBe('Twój plan utrzymania masy ciała');
    expect(r.droga).toMatch(/^TWOJA DROGA \| CEL NA TEN ETAP \| 52,0 kg \| utrzymanie obecnej masy ciała \| Wzrastanie wciąż trwa \(ok\. 6,0 cm\/rok\) i każdy centymetr sam obniża BMI, nawet przy niezmienionej masie ciała\. \| Górna granica normy BMI przy obecnym wzroście: 43,2 kg \(85\. centyl\)\. Dojście do normy BMI przy stałej masie ciała: .+\.$/);
    expect(r.droga).not.toMatch(/PIERWSZY CEL|pierwszy krok|Cel końcowy/);
    expect(r.naglowek).toBe('Na tym etapie celem jest utrzymanie obecnej masy ciała (ok. 52,0 kg). Najważniejsze jest, aby w kolejnych pomiarach masa ciała rosła wolniej niż wzrost.');
  });

  test('G2-3: redukcja bez zmian — dziewczynka 13 l., 7 cm/rok i dorosły z otyłością: tytuł redukcji, pierwszy cel i oś', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const d = await stan(page, { sex: 'F', age: 13, w: 75, h: 155, historia: [{ age: 12, h: 148, w: 70 }] });
    expect(d.strategia).toBe('reduction');
    expect(d.tytul).toBe('Twój plan redukcji masy ciała');
    expect(d.droga).toContain('PIERWSZY CEL | −5,3 kg | do 69,7 kg');
    expect(d.os).toBe(true);
    expect(d.naglowek).toContain('Pierwszy krok to ok. 69,7 kg, czyli około 5,3 kg mniej');
    expect(d.wtRef2).toBe('Pierwszy krok: do 69,7 kg');
    const a = await stan(page, { sex: 'M', age: 40, w: 100, h: 175 });
    expect(a.tytul).toBe('Twój plan redukcji masy ciała');
    expect(a.droga).toContain('PIERWSZY CEL');
  });
});
