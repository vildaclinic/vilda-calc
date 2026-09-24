import { expect, test } from '@playwright/test';

// P-DIETA rata G1 (decyzje właściciela 2026-09-24): tempo wzrastania w planie diety dziecka z nadwagą/otyłością.
// A — zdanie o pomiarze wzrostu na kontroli; B1 — tempo poniżej normy (alarm modelu tempa) → domyślnie stabilizacja,
// zdanie zamiast „wzrastanie trwa”, czerwona ramka w planie PDF; B2 — tempo „do oceny” → zdanie i żółta ramka, plan bez zmian;
// F0 — stabilizacja dziecka w planie PDF i Karcie pacjenta jako utrzymanie masy (bez deficytu).
// PRAWDZIWA strona (index i docpro), wiersze historii dodawane przyciskiem karty zaawansowanej. Dane FIKCYJNE.

async function otworz(page, strona) {
  await page.goto(`/${strona || 'index.html'}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.buildDietEnergyRecommendationResult === 'function'
    && !!window.VildaRaportPlan && window.VildaRaportPlan.version >= 13 && typeof window.energyChildGrowthOutlook === 'function'
    && typeof window.patientReportBuildModel === 'function');
}

// s: { sex, age, w, h, tanner, historia: [{ age, h, w }], redukcja }
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
      const btn = document.getElementById('advAddMeasurementBtn'); if (btn) btn.click();
      const rows = document.querySelectorAll('#advMeasurements .measure-row');
      const w = rows[rows.length - 1];
      const wpisz = (sel, v) => { const el = w.querySelector(sel); if (!el) return; el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
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
    const br = window.buildDietEnergyRecommendationResult();
    const d = br.dane || {};
    const html = window.VildaRaportPlan.html({ patient: { name: 'Testowy Fikcyjny', ageLabel: `${s.age} lat`, sexLabel: 'x', weightLabel: `${s.w} kg`, heightLabel: `${s.h} cm` }, baseResult: br });
    const norm = (t) => String(t || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    const tp = window.advancedGrowthData && window.advancedGrowthData.tempo;
    const ol = window.energyChildGrowthOutlook({ ageYears: s.age, sex: s.sex, heightCm: s.h });
    const m = window.patientReportBuildModel();
    const k = m && m.nutritionCard;
    const rt = document.getElementById('reduceToggle'), sb = document.getElementById('stabilizationToggle');
    return {
      tempo: tp ? { cm: tp.cmPerYear, alarm: tp.alarm === true, sev: tp.severity || null } : null,
      outlook: { alarm: ol.tempoAlarm, ocena: ol.tempoDoOceny, cm: ol.tempoCmRok, norma: ol.tempoNormaCmRok, pe: ol.practicallyEnded },
      przelaczniki: rt && sb ? { redukcja: rt.checked, stabilizacja: sb.checked } : null,
      strategia: d.strategia,
      energia: { podaz: d.energia.podazZaokrKcal, gorna: d.energia.gornaGranica, deficyt: d.energia.deficytKcal, dieta: d.energia.dietaNazwa },
      kontrola: d.kontrola ? { tygodnie: d.kontrola.tygodnie, pomiarWzrostu: d.kontrola.pomiarWzrostu } : null,
      // zdanie ma twarde spacje przed „cm/rok” (bez łamania liczby i jednostki) — porównujemy po normalizacji
      tempoWzrastania: d.tempoWzrastania ? { ...d.tempoWzrastania, zdanie: norm(d.tempoWzrastania.zdanie) } : null,
      twardaSpacja: !!(d.tempoWzrastania && /\d\u00A0cm\/rok/.test(d.tempoWzrastania.zdanie)),
      punktyKontrola: (d.punkty && d.punkty.kontrola) || [],
      tekst: norm(br.textOutput),
      pdf: {
        sekcje: Array.from(html.matchAll(/vrp-nag-blok"><span>([^<]*)<\/span>/g)).map((x) => x[1]),
        kafle: Array.from(html.matchAll(/vrp-kafel"><b>([^<]*)<\/b><span>([^<]*)<\/span><i>([^<]*)<\/i>/g)).map((x) => norm(x[1] + ' | ' + x[2] + ' | ' + x[3])),
        ramka: (html.match(/<div class="vrp-tempo (vrp-tempo-\w+)">([^<]*)<\/div>/) || []).slice(1).map(norm),
        pomiarWzrostu: norm((html.match(/<div class="vrp-podkafle vrp-podkafle-wzrost">([^<]*)<\/div>/) || [])[1]),
        zacheta: /Wzrastanie wciąż trwa/.test(html),
      },
      karta: k ? { value: norm(k.value), rows: k.rows.map((r) => norm(`${r.label}: ${r.valueText}`)) } : null,
    };
  }, s);
}

const ZD_ALARM_STAB = 'Tempo wzrastania jest poniżej normy dla wieku: 2,0 cm/rok (norma ≥4 cm/rok). Spowolnienie wzrastania przy nadmiarze masy ciała wymaga oceny lekarskiej, m.in. w kierunku przyczyn hormonalnych, zanim zostanie wprowadzona dieta z ograniczeniem kalorii.';
const ZD_ALARM_RED = 'Tempo wzrastania jest poniżej normy dla wieku: 2,0 cm/rok (norma ≥4 cm/rok). Spowolnienie wzrastania przy nadmiarze masy ciała wymaga oceny lekarskiej, m.in. w kierunku przyczyn hormonalnych; w czasie diety z ograniczeniem kalorii wzrost dziecka powinien być mierzony na każdej wizycie.';
const ZD_DO_OCENY = 'Tempo wzrastania wymaga oceny: 3,0 cm/rok (norma ≥4 cm/rok). Na wizytach kontrolnych mierzony jest wzrost dziecka; jeśli spowolnienie się utrzyma, wskazana jest ocena lekarska jego przyczyny.';
const ZD_A_OSOBNE = 'Na wizytach kontrolnych mierzony jest także wzrost dziecka: prawidłowo prowadzona dieta nie spowalnia wzrastania, a tempo wzrastania ocenia się w odstępie co najmniej 6 miesięcy.';
const ZD_A_KONTROLA = 'Na kontroli mierzony jest także wzrost dziecka — prawidłowo prowadzona dieta nie spowalnia wzrastania.';
const PDF_A = 'Na kontroli mierzymy też wzrost dziecka — dobrze prowadzona dieta nie spowalnia wzrastania.';
const NAG_UTRZ = 'ZAPOTRZEBOWANIE ENERGETYCZNE (UTRZYMANIE MASY CIAŁA)';
const NAG_RED = 'KALORYCZNOŚĆ DIETY I TEMPO REDUKCJI MASY CIAŁA';

// dziewczynka 13 l., otyłość, Tanner I, 153 → 155 cm w 12 mies. (2 cm/rok < 4 cm/rok przed skokiem)
const M3 = { sex: 'F', age: 13, w: 75, h: 155, tanner: 1, historia: [{ age: 12, h: 153, w: 72 }] };

test.describe('P-DIETA rata G1 — tempo wzrastania w planie diety dziecka', () => {
  test('G1-1 (A, F0): chłopiec 10 l., nadwaga, 6 cm/rok — stabilizacja jako utrzymanie masy, zdanie o pomiarze wzrostu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { sex: 'M', age: 10, w: 52, h: 145, historia: [{ age: 9, h: 139, w: 47 }] });
    expect(r.tempo).toEqual({ cm: 6, alarm: false, sev: null });
    expect(r.outlook).toMatchObject({ alarm: false, ocena: false, cm: 6, norma: 4, pe: false });
    expect(r.przelaczniki).toEqual({ redukcja: false, stabilizacja: true });
    expect(r.strategia).toBe('stabilization');
    expect(r.energia).toEqual({ podaz: 2400, gorna: false, deficyt: null, dieta: null });
    expect(r.tempoWzrastania).toBeNull();
    expect(r.tekst).toContain(ZD_A_OSOBNE);
    expect(r.tekst).toContain('Dziecko wciąż rośnie');
    expect(r.punktyKontrola.slice(0, 2)).toEqual(['wzrost dziecka mierzony na wizytach kontrolnych', 'tempo wzrastania oceniane w odstępie co najmniej 6 miesięcy']);
    expect(r.pdf.sekcje).toContain(NAG_UTRZ);
    expect(r.pdf.sekcje).not.toContain(NAG_RED);
    expect(r.pdf.kafle).toEqual(['2 400 | kcal dziennie | zapotrzebowanie energetyczne']);
    expect(r.pdf.ramka).toEqual([]);
    expect(r.karta).toMatchObject({ value: '2400 kcal/d' });
    expect(r.karta.rows).toContain('Plan: utrzymanie masy ciała: 2400 kcal/d');
  });

  test('G1-2 (B2): ten sam chłopiec, 3 cm/rok — tempo „do oceny”: zdanie i żółta ramka, plan bez zmian', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { sex: 'M', age: 10, w: 52, h: 145, historia: [{ age: 9, h: 142, w: 50 }] });
    expect(r.tempo).toEqual({ cm: 3, alarm: false, sev: 'warn' });
    expect(r.outlook).toMatchObject({ alarm: false, ocena: true });
    expect(r.strategia).toBe('stabilization');
    expect(r.energia).toEqual({ podaz: 2400, gorna: false, deficyt: null, dieta: null });
    expect(r.tempoWzrastania).toEqual({ ocena: 'do-oceny', cmRok: 3, normaCmRok: 4, zdanie: ZD_DO_OCENY });
    expect(r.tekst).toContain(ZD_DO_OCENY);
    expect(r.tekst).toContain('Dziecko wciąż rośnie');
    expect(r.tekst).not.toContain(ZD_A_OSOBNE); // B2 zastępuje zdanie A
    expect(r.pdf.ramka).toEqual(['vrp-tempo-ocena', ZD_DO_OCENY]);
  });

  test('G1-3 (B1, F0): dziewczynka 13 l., Tanner I, 2 cm/rok — domyślnie stabilizacja, czerwona ramka, bez „wzrastanie trwa”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, M3);
    expect(r.tempo).toEqual({ cm: 2, alarm: true, sev: 'danger' });
    expect(r.outlook).toMatchObject({ alarm: true, ocena: false, cm: 2, norma: 4, pe: false });
    expect(r.przelaczniki).toEqual({ redukcja: false, stabilizacja: true });
    expect(r.strategia).toBe('stabilization');
    expect(r.energia).toEqual({ podaz: 2200, gorna: false, deficyt: null, dieta: null });
    expect(r.tempoWzrastania).toEqual({ ocena: 'ponizej', cmRok: 2, normaCmRok: 4, zdanie: ZD_ALARM_STAB });
    expect(r.twardaSpacja).toBe(true);
    expect(r.tekst).toContain(ZD_ALARM_STAB);
    expect(r.tekst).not.toContain('Wzrastanie nadal trwa');
    expect(r.tekst).not.toContain('Dziecko wciąż rośnie');
    expect(r.tekst).not.toContain(ZD_A_OSOBNE);
    expect(r.pdf.sekcje).toContain(NAG_UTRZ);
    expect(r.pdf.kafle).toEqual(['2 200 | kcal dziennie | zapotrzebowanie energetyczne']);
    expect(r.pdf.ramka).toEqual(['vrp-tempo-alarm', ZD_ALARM_STAB]);
    expect(r.pdf.zacheta).toBe(false);
    expect(r.karta.rows).toContain('Plan: utrzymanie masy ciała: 2200 kcal/d');
  });

  test('G1-4 (B1): ta sama dziewczynka, redukcja wybrana ręcznie — dieta zostaje, zdanie o pomiarze na każdej wizycie', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { ...M3, redukcja: true });
    expect(r.przelaczniki).toEqual({ redukcja: true, stabilizacja: false });
    expect(r.strategia).toBe('reduction');
    expect(r.energia).toMatchObject({ podaz: 1800, gorna: true, dieta: 'umiarkowana' });
    expect(r.kontrola).toEqual({ tygodnie: 6, pomiarWzrostu: false });
    expect(r.tempoWzrastania).toEqual({ ocena: 'ponizej', cmRok: 2, normaCmRok: 4, zdanie: ZD_ALARM_RED });
    expect(r.tekst).toContain(ZD_ALARM_RED);
    expect(r.tekst).not.toContain('Wzrastanie nadal trwa');
    expect(r.tekst).not.toContain(ZD_A_KONTROLA);
    expect(r.pdf.sekcje).toContain(NAG_RED);
    expect(r.pdf.kafle[0]).toBe('≤ 1 800 | kcal dziennie | górna granica dnia, nie cel');
    expect(r.pdf.ramka).toEqual(['vrp-tempo-alarm', ZD_ALARM_RED]);
    expect(r.pdf.pomiarWzrostu).toBe('');
    expect(r.karta.rows).toContain('Plan: dieta umiarkowana: ≤ 1800 kcal/d');
  });

  test('G1-5: 0,5 cm/rok przy alarmie tempa nie jest „praktycznie zakończonym wzrastaniem”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { ...M3, historia: [{ age: 12, h: 154.5, w: 72 }] });
    expect(r.tempo).toEqual({ cm: 0.5, alarm: true, sev: 'danger' });
    expect(r.outlook).toMatchObject({ alarm: true, pe: false });
    expect(r.strategia).toBe('stabilization');
    expect(r.tempoWzrastania).toMatchObject({ ocena: 'ponizej', cmRok: 0.5 });
    expect(r.tekst).toContain('Tempo wzrastania jest poniżej normy dla wieku: 0,5 cm/rok (norma ≥4 cm/rok).');
    expect(r.pdf.ramka[0]).toBe('vrp-tempo-alarm');
  });

  test('G1-6 (A): dziewczynka 13 l., 7 cm/rok, redukcja — zdanie w kontroli i linia pod kaflami kontroli w planie PDF', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { sex: 'F', age: 13, w: 75, h: 155, historia: [{ age: 12, h: 148, w: 70 }] });
    expect(r.tempo).toEqual({ cm: 7, alarm: false, sev: null });
    expect(r.strategia).toBe('reduction');
    expect(r.kontrola).toEqual({ tygodnie: 6, pomiarWzrostu: true });
    expect(r.tempoWzrastania).toBeNull();
    expect(r.tekst).toContain('Wzrastanie nadal trwa');
    expect(r.tekst).toMatch(/Kontrola za 6 tygodni \(ok\. [^)]+\): .*\(do 1600–1700 kcal dziennie\)\. Na kontroli mierzony jest także wzrost dziecka — prawidłowo prowadzona dieta nie spowalnia wzrastania\./);
    expect(r.tekst).not.toContain(ZD_A_OSOBNE);
    expect(r.pdf.pomiarWzrostu).toBe(PDF_A);
    expect(r.pdf.ramka).toEqual([]);
  });

  test('G1-7 (B1): docpro — ta sama dziewczynka z alarmem tempa dostaje stabilizację i czerwoną ramkę', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page, 'docpro.html');
    const r = await stan(page, M3);
    expect(r.tempo).toEqual({ cm: 2, alarm: true, sev: 'danger' });
    expect(r.strategia).toBe('stabilization');
    expect(r.energia).toEqual({ podaz: 2200, gorna: false, deficyt: null, dieta: null });
    expect(r.tempoWzrastania).toMatchObject({ ocena: 'ponizej', zdanie: ZD_ALARM_STAB });
    expect(r.tekst).toContain(ZD_ALARM_STAB);
    expect(r.pdf.sekcje).toContain(NAG_UTRZ);
    expect(r.pdf.ramka).toEqual(['vrp-tempo-alarm', ZD_ALARM_STAB]);
  });
});
