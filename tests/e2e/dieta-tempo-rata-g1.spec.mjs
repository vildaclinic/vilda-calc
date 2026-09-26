import { expect, test } from '@playwright/test';

// P-DIETA rata G1 (decyzje właściciela 2026-09-24): tempo wzrastania w planie diety dziecka z nadwagą/otyłością.
// A — zdanie o pomiarze wzrostu na kontroli; B1 — tempo poniżej normy (alarm modelu tempa) → domyślnie stabilizacja,
// zdanie zamiast „wzrastanie trwa”, czerwona ramka w planie PDF; B2 — tempo „do oceny” → zdanie i żółta ramka, plan bez zmian;
// F0 — stabilizacja dziecka w planie PDF i Karcie pacjenta jako utrzymanie masy (bez deficytu).
// P-DIETA rata G1a (decyzje właściciela 2026-09-26): te same zdania w jednym rejestrze bezosobowym, bez odsyłania do lekarza
// („wymaga to dalszej oceny, m.in. w kierunku przyczyn hormonalnych”), wariant B1 wg strategii efektywnej i powodu stabilizacji,
// karta planu i „Droga do normy” przy B1, nagłówek raportu bez „Dodatkowo … Dodatkowo”, nota PAL bez „dopóki lekarz…”.
// PRAWDZIWA strona (index i docpro), wiersze historii dodawane przyciskiem karty zaawansowanej. Dane FIKCYJNE.

async function otworz(page, strona) {
  await page.goto(`/${strona || 'index.html'}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.buildDietEnergyRecommendationResult === 'function'
    && !!window.VildaRaportPlan && window.VildaRaportPlan.version >= 14 && typeof window.energyChildGrowthOutlook === 'function'
    && typeof window.patientReportBuildModel === 'function');
}

// s: { sex, age, w, h, tanner, historia: [{ age, h, w }], redukcja, pal }
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
    const jf = document.getElementById('journeyFlag'); if (jf && !jf.checked) { jf.checked = true; jf.dispatchEvent(new Event('change', { bubbles: true })); }
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
    if (s.pal) set('palFactor', s.pal);
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
      karta: k ? { value: norm(k.value), rows: k.rows.map((r) => norm(`${r.label}: ${r.valueText}`)), nota: norm(k.note) } : null,
      naglowek: norm(m && m.headline && m.headline.text),
      kartaPlanu: norm((document.getElementById('planResults') || {}).textContent),
      droga: norm((document.getElementById('bmiJourneyMount') || {}).textContent),
    };
  }, s);
}

// rata G1a: brzmienia w głosie lekarza (bez „oceny lekarskiej”), nastolatek (od 11 lat) bez słowa „dziecka”
const OCENA = 'Przy nadmiarze masy ciała wymaga to dalszej oceny, m.in. w kierunku przyczyn hormonalnych';
const ZD_ALARM_STAB = `Tempo wzrastania jest poniżej normy: 2,0 cm/rok (norma ≥ 4 cm/rok). ${OCENA}, dlatego plan ma charakter stabilizacji masy ciała. Wzrost jest mierzony na każdej wizycie kontrolnej.`;
const ZD_ALARM_RED = `Tempo wzrastania jest poniżej normy: 2,0 cm/rok (norma ≥ 4 cm/rok). ${OCENA}. W czasie diety redukcyjnej wzrost jest mierzony na każdej wizycie kontrolnej.`;
const ZD_DO_OCENY = 'Tempo wzrastania wymaga oceny: 3,0 cm/rok (norma ≥ 4 cm/rok). W tym wieku zależy ono od etapu dojrzewania, dlatego wzrost dziecka jest mierzony na kolejnych wizytach kontrolnych. Jeśli tempo pozostanie poniżej 4 cm/rok, wymaga to dalszej oceny, m.in. w kierunku przyczyn hormonalnych.';
const ZD_A_OSOBNE = 'Na każdej wizycie kontrolnej mierzone są masa ciała i wzrost dziecka; tempo wzrastania ocenia się na podstawie pomiarów wykonanych w odstępie co najmniej 6 miesięcy.';
const ZD_A_KONTROLA = 'Na kontroli mierzony jest także wzrost — prawidłowo prowadzona dieta nie spowalnia wzrastania.';
const PDF_A = ZD_A_KONTROLA; // rata G1a: plan PDF cytuje zdanie generatora (bez „mierzymy”/„dobrze”)
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
    expect(r.punktyKontrola.slice(0, 2)).toEqual(['masa ciała i wzrost dziecka mierzone na każdej wizycie kontrolnej', 'tempo wzrastania oceniane na podstawie pomiarów w odstępie co najmniej 6\u00A0miesięcy']);
    expect(r.kartaPlanu).toContain('szacunek orientacyjny — wzrost warto mierzyć co 3–6 miesięcy');
    expect(r.karta.nota).toBe('Poziom aktywności przyjęto domyślnie dla wieku.');
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
    expect(r.tekst).toContain(`Tempo wzrastania jest poniżej normy: 0,5 cm/rok (norma ≥ 4 cm/rok). ${OCENA}, dlatego plan ma charakter stabilizacji masy ciała.`);
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
    expect(r.tekst).toMatch(/Kontrola za 6 tygodni \(ok\. [^)]+\): .*\(do 1600–1700 kcal dziennie\)\. Na kontroli mierzony jest także wzrost — prawidłowo prowadzona dieta nie spowalnia wzrastania\./);
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

test.describe('P-DIETA rata G1a — zdania w głosie lekarza, wariant wg strategii efektywnej, karty planu i drogi', () => {
  test('G1a-1: dziewczynka 13 l., Tanner I, 2 cm/rok — karta planu i „Droga do normy” bez „praktycznie zakończonego wzrastania”, nagłówek raportu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, M3);
    expect(r.strategia).toBe('stabilization');
    expect(r.tekst).toContain(ZD_ALARM_STAB);
    expect(r.tekst).toContain('Zalecane jest utrzymanie obecnej masy ciała podczas dalszego wzrastania, aby BMI mogło stopniowo się obniżać.');
    expect(r.tekst).not.toMatch(/lekarsk|ograniczeniem kalorii/);
    expect(r.kartaPlanu).toContain('Przy obecnym tempie wzrastania samo utrzymanie masy ciała nie doprowadzi do normy BMI; kolejny etap planu zależy od wyniku dalszej oceny.');
    expect(r.kartaPlanu).toContain('strategia domyślna przy tempie wzrastania poniżej normy');
    expect(r.kartaPlanu).not.toMatch(/praktycznie zakończonym|rozważ strategię redukcji|BMI obniża się wraz ze wzrostem|Barlow 2007/);
    expect(r.droga).toContain('przy obecnym tempie wzrastania samo utrzymanie masy nie doprowadzi do normy BMI');
    expect(r.droga).toContain('Kolejny etap planu zależy od wyniku dalszej oceny.');
    expect(r.droga).not.toMatch(/praktycznie zakończonym|BMI obniży się dzięki dalszemu wzrastaniu/);
    expect(r.naglowek).toContain('Dodatkowo tempo wzrastania jest poniżej normy: 2,0 cm/rok (norma ≥ 4 cm/rok).');
    expect(r.karta.nota).toBe('Poziom aktywności przyjęto domyślnie dla wieku.');
  });

  test('G1a-2: chłopiec 4 l. — alarm tempa: zdanie bez zapowiedzi diety i bez „dlatego”; bez alarmu: zachęta „Wzrastanie wciąż trwa” w planie PDF', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const a = await stan(page, { sex: 'M', age: 4, w: 24, h: 100, historia: [{ age: 3, h: 97, w: 21 }] });
    expect(a.tempo).toEqual({ cm: 3, alarm: true, sev: 'danger' });
    const ZD = `Tempo wzrastania jest poniżej normy: 3,0 cm/rok (norma ≥ 6 cm/rok). ${OCENA}. Wzrost dziecka jest mierzony na każdej wizycie kontrolnej.`;
    expect(a.tempoWzrastania).toMatchObject({ ocena: 'ponizej', zdanie: ZD });
    expect(a.tekst).toContain(ZD);
    expect(a.pdf.ramka).toEqual(['vrp-tempo-alarm', ZD]);
    expect(a.pdf.zacheta).toBe(false);
    expect(a.naglowek).not.toMatch(/Dodatkowo[^.]*\.[^]*Dodatkowo/);
    // ten sam chłopiec, tempo w normie (7 cm/rok ≥ 6) — zachęta w PDF jest; sprawdzenie „bez zachęty” przy alarmie nie jest więc puste
    const b = await stan(page, { sex: 'M', age: 4, w: 24, h: 104, historia: [{ age: 3, h: 97, w: 21 }] });
    expect(b.tempoWzrastania).toBeNull();
    expect(b.pdf.zacheta).toBe(true);
  });

  test('G1a-3: dziewczynka 9 l., otyłość < 99. c. — stabilizacja z powodu wieku: zdanie bez „dlatego plan…”, karta planu z powodem wieku', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { sex: 'F', age: 9, w: 38, h: 130, historia: [{ age: 8, h: 127, w: 35 }] });
    expect(r.tempo).toEqual({ cm: 3, alarm: true, sev: 'danger' });
    expect(r.strategia).toBe('stabilization');
    expect(r.tekst).toContain(`Tempo wzrastania jest poniżej normy: 3,0 cm/rok (norma ≥ 5 cm/rok). ${OCENA}. Wzrost dziecka jest mierzony na każdej wizycie kontrolnej.`);
    expect(r.tekst).not.toContain('dlatego plan ma charakter stabilizacji');
    expect(r.kartaPlanu).toContain('strategia domyślna dla wieku 2–5 lat oraz 6–11 lat przy BMI poniżej 99. centyla (Barlow 2007)');
  });

  test('G1a-4: dziewczynka 6 l., redukcja wybrana ręcznie, żadna dieta nie spełnia minimum — stabilizacja i zdanie w wariancie stabilizacji', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { sex: 'F', age: 6, w: 17, h: 85, pal: '1.4', redukcja: true, historia: [{ age: 5, h: 82, w: 16 }] });
    expect(r.tempo).toMatchObject({ alarm: true });
    expect(r.strategia).toBe('stabilization');
    expect(r.tekst).toContain('Żadna dieta redukcyjna nie spełnia minimum kalorycznego');
    expect(r.tempoWzrastania.zdanie).toBe(`Tempo wzrastania jest poniżej normy: 3,0 cm/rok (norma ≥ 5 cm/rok). ${OCENA}. Wzrost dziecka jest mierzony na każdej wizycie kontrolnej.`);
    expect(r.tekst).not.toContain('W czasie diety redukcyjnej wzrost');
  });

  test('G1a-5: chłopiec 12 l., otyłość, 0,8 cm/rok bez Tannera („do oceny”) — samo B2, bez „Wzrost prawie się zakończył”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { sex: 'M', age: 12, w: 70, h: 152, historia: [{ age: 11, h: 151.2, w: 67 }] });
    expect(r.tempo).toMatchObject({ alarm: false, sev: 'warn' });
    expect(r.tekst).toContain('Tempo wzrastania wymaga oceny: 0,8 cm/rok (norma ≥ 4 cm/rok). W tym wieku zależy ono od etapu dojrzewania, dlatego wzrost jest mierzony na kolejnych wizytach kontrolnych.');
    expect(r.tekst).not.toMatch(/Wzrost prawie się zakończył|Wzrastanie nadal trwa/);
  });

  test('G1a-6: chłopiec 13 l., sama nadwaga, Tanner I, 2 cm/rok, redukcja ręczna — bez zapewnienia z raty N2, że BMI obniży się przy wzrastaniu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { sex: 'M', age: 13, w: 58, h: 155, tanner: 1, redukcja: true, historia: [{ age: 12, h: 153, w: 55 }] });
    expect(r.strategia).toBe('reduction');
    expect(r.tekst).toContain(`Tempo wzrastania jest poniżej normy: 2,0 cm/rok (norma ≥ 4 cm/rok). ${OCENA}. W czasie diety redukcyjnej wzrost jest mierzony na każdej wizycie kontrolnej.`);
    expect(r.tekst).toContain('Przy nadwadze u nastolatka ubytek masy powinien być stopniowy');
    expect(r.tekst).not.toContain('U rosnącego nastolatka często wystarcza utrzymanie masy ciała');
  });
});
