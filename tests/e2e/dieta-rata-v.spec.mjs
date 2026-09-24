import { expect, test } from '@playwright/test';

// P-DIETA rata V (decyzje właściciela 2026-09-23): u dziecka 10–18 lat z otyłością REE = Molnár 1995
// (doi:10.1016/s0022-3476(95)70114-1, dane w vilda_ree_rownania_data.js), jedno równanie dla REE, podłogi,
// zapotrzebowania aktualnego i zapotrzebowania dla masy docelowej; kaloryczność diety dziecka jako górna granica
// dnia (w dół do 50 kcal); kontrola za 6 tygodni w planie PDF, karcie „Droga do normy BMI” i zaleceniach.
// PRAWDZIWA strona (index i docpro), dane FIKCYJNE.

async function otworz(page, strona) {
  await page.goto(`/${strona || 'index.html'}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.buildDietEnergyRecommendationResult === 'function'
    && !!window.VildaRaportPlan && window.VildaRaportPlan.version >= 9 && !!window.VildaBmi && !!window.VildaReeRownania
    && typeof window.energyKontrolaPlanu === 'function');
}

async function stan(page, c) {
  return page.evaluate(async (c) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    window.professionalMode = true; window.intakeHistory = null; window.lastLoadedData = null; window.hasUserModifiedAfterLoad = false;
    window.__vildaPlanPalTouched = false; window.__vildaPlanPalDefault = null;
    set('name', 'Testowy Fikcyjny'); set('sex', c.sex); set('age', c.y); set('ageMonths', c.m || 0); set('weight', c.w); set('height', c.h); set('customGoalKg', '');
    if (typeof window.ensureDietRecommendationsElements === 'function') window.ensureDietRecommendationsElements();
    const jf = document.getElementById('journeyFlag'); if (jf && !jf.checked) { jf.checked = true; jf.dispatchEvent(new Event('change', { bubbles: true })); }
    // P-DIETA rata N2: sama nadwaga 12–18 lat ma domyślnie stabilizację — test diety redukcyjnej wybiera redukcję jawnie
    if (c.redukcja) { window.__vildaDietStrategyTouched = true; const rt = document.getElementById('reduceToggle'); if (rt) rt.checked = true; const sb = document.getElementById('stabilizationToggle'); if (sb) sb.checked = false; }
    window.update();
    await new Promise((r) => { setTimeout(r, 700); });
    const br = window.buildDietEnergyRecommendationResult();
    const d = br.dane || {};
    const html = window.VildaRaportPlan.html({ patient: { name: 'Testowy Fikcyjny', ageLabel: `${c.y} lat`, sexLabel: 'x', weightLabel: `${c.w} kg`, heightLabel: `${c.h} cm` }, baseResult: br });
    const norm = (s) => String(s || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    const m = typeof window.patientReportBuildModel === 'function' ? window.patientReportBuildModel() : null;
    const k = m && m.nutritionCard;
    const mount = document.getElementById('bmiJourneyMount');
    return {
      energia: { podaz: d.energia.podazZaokrKcal, gorna: d.energia.gornaGranica, celTee: d.energia.celTeeKcal, ree: d.energia.reeRownanie && d.energia.reeRownanie.id },
      kontrola: d.kontrola,
      kafle: Array.from(html.matchAll(/vrp-kafel"><b>([^<]*)<\/b><span>([^<]*)<\/span><i>([^<]*)<\/i>/g)).map((x) => norm(x[1] + ' | ' + x[2] + ' | ' + x[3])),
      sekcje: Array.from(html.matchAll(/vrp-nag-blok"><span>([^<]*)<\/span>/g)).map((x) => x[1]),
      podkafle: Array.from(html.matchAll(/vrp-podkafle">([^<]*)<\/div>/g)).map((x) => norm(x[1])),
      journey: norm(mount && mount.textContent),
      kontrolaBox: norm((document.querySelector('#bmiJourneyMount .bmi-journey-kontrola') || {}).textContent),
      tekst: norm(br.textOutput),
      raport: k ? { value: norm(k.value), rows: k.rows.map((r) => norm(`${r.label}: ${r.valueText}`)) } : null,
      szerokosc: { doc: document.documentElement.scrollWidth, okno: window.innerWidth, mount: mount ? mount.scrollWidth - mount.clientWidth : 0 },
    };
  }, c);
}

const CHLOPIEC = { sex: 'M', y: 15, m: 3, w: 102.5, h: 186.7 };
const RE_TERMIN = '\\d{1,2} (stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia) \\d{4}';

test.describe('P-DIETA rata V — REE Molnára, górna granica dnia, kontrola za 6 tygodni', () => {
  test('RV-1: chłopiec 15;3, 102,5 / 186,7 — ≤ 2 700 kcal, REE Molnára w danych, kontrola w karcie drogi, zaleceniach i planie PDF', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, CHLOPIEC);
    expect(r.energia).toEqual({ podaz: 2700, gorna: true, celTee: 2731, ree: 'MOLNAR_1995' });
    expect(r.kontrola).toMatchObject({ tygodnie: 6, masaDzisKg: 102.5, gornaKcal: 2700, obnizkaKcal: [100, 200], obnizkaMozliwa: true, podazPoObnizceKcal: [2500, 2600], wzrastanie: true, wzrostZakonczony: false });
    // rata W: przyrost ze wzrastania (własna prognoza wzrostu × mediana BMI) w spodziewanej masie i w progu
    const K = r.kontrola, r1 = (x) => Math.round(x * 10) / 10, f1 = (x) => x.toFixed(1).replace('.', ',');
    expect(K.przyrostKg).toBeGreaterThan(0.1); expect(K.przyrostKg).toBeLessThan(0.5);
    expect(K.masaSpodziewanaKg).toBe(r1(102.5 - K.ubytekDietyKg + K.przyrostKg));
    expect(K.progKg).toBe(r1(102.5 + K.przyrostKg - K.ubytekDietyKg / 2));
    // karta drogi: hero „≤ 2700” i ramka kontroli pod nim
    expect(r.journey).toMatch(/≤ ?2 ?700 kcal\/dzień ?górna granica dnia — dieta umiarkowana \(nie cel do dobicia\)/);
    expect(r.kontrolaBox).toMatch(new RegExp(`^Kontrola za 6 tygodni \\(ok\\. ${RE_TERMIN}\\): spodziewana masa ok\\. ${f1(K.masaSpodziewanaKg)} kg \\(z uwzględnieniem wzrastania\\)\\. Jeśli będzie ${f1(K.progKg)} kg lub więcej, odejmij od planu 100–200 kcal \\(do 2 ?500–2 ?600 kcal\\), bo realne spożycie jest wyższe, niż liczymy\\.$`));
    // zalecenia
    expect(r.tekst).toContain('Dieta umiarkowana: nie więcej niż 2700 kcal dziennie — to górna granica dnia, nie cel do dobicia.');
    expect(r.tekst).toMatch(new RegExp(`Kontrola za 6 tygodni \\(ok\\. ${RE_TERMIN}\\): spodziewana masa ciała ok\\. ${f1(K.masaSpodziewanaKg)} kg \\(z uwzględnieniem wzrastania\\)\\. Jeśli masa będzie wynosić ${f1(K.progKg)} kg lub więcej, realne spożycie jest wyższe, niż liczymy — należy odjąć od planu 100–200 kcal \\(do 2500–2600 kcal dziennie\\)\\.`));
    // plan PDF: kafel „≤”, sekcja kontroli po kaloryczności, trzeci kafel wg uwagi właściciela
    expect(r.kafle[0]).toBe('≤ 2 700 | kcal dziennie | górna granica dnia, nie cel');
    const iK = r.sekcje.indexOf('KONTROLA ZA 6 TYGODNI');
    expect(iK).toBe(r.sekcje.indexOf('KALORYCZNOŚĆ DIETY I TEMPO REDUKCJI MASY CIAŁA') + 1);
    expect(r.kafle).toContain(`${r.kontrola.terminKrotki} | ${r.kontrola.terminRok} | termin kontroli (ok. 6 tygodni)`);
    expect(r.kafle).toContain(`ok. ${f1(K.masaSpodziewanaKg)} kg | spodziewana masa | z dietą i wzrastaniem (dziś 102,5 kg)`);
    expect(r.kafle).toContain(`≥ ${f1(K.progKg)} kg | odejmij od planu | 100–200 kcal`);
    expect(r.kafle.join(' ')).not.toContain('realne spożycie');
    expect(r.podkafle).toContain('Liczba kcal to górna granica dnia, nie cel do dobicia. Sprawdzianem jest waga na kontroli, nie liczenie kalorii w pamięci. Ważenie: rano, po toalecie, w bieliźnie, na tej samej wadze.');
    // raport po wizycie: jedna liczba dla masy docelowej (z planu) i „≤” przy planie
    expect(r.raport.rows).toContain('Dla masy prawidłowej (82,1 kg): 2731 kcal/d');
    expect(r.raport.rows).toContain('Plan: dieta umiarkowana: ≤ 2700 kcal/d');
    expect(r.raport.rows.join(' ')).not.toContain('2937');
  });

  test('RV-2: dziewczynka 12 l, 70 kg / 150 cm — Molnár podnosi dietę (umiarkowana ≤ 1 750 kcal; rata U: 1 500)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { sex: 'F', y: 12, m: 0, w: 70, h: 150 });
    expect(r.energia.ree).toBe('MOLNAR_1995');
    expect(r.energia.podaz).toBe(1750);
    expect(r.tekst).toContain('Dieta umiarkowana: nie więcej niż 1750 kcal dziennie');
    // rata W: umiarkowana (1,5 kg/mies.) — 6 tygodni, próg z przyrostem ze wzrastania
    expect(r.kontrola.tygodnie).toBe(6);
    expect(r.kontrola.wzrastanie).toBe(true);
    expect(r.kontrola.progKg).toBe(Math.round((70 + r.kontrola.przyrostKg - r.kontrola.ubytekDietyKg / 2) * 10) / 10);
  });

  test('RV-3: nadwaga 13 l (Henry, bez korekty) — górna granica i kontrola też są; dorosły — od raty Z także', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    // rata N2: nadwaga 12–18 lat — domyślnie stabilizacja; górną granicę i kontrolę sprawdzamy na wybranej redukcji
    const n = await stan(page, { sex: 'M', y: 13, m: 0, w: 60, h: 155, redukcja: true });
    expect(n.energia.ree).toBe('HENRY_2005');
    expect(n.energia.gorna).toBe(true);
    expect(n.energia.podaz % 50).toBe(0);
    expect(n.tekst).toContain('Dieta lekka: nie więcej niż');
    expect(n.kontrola).not.toBeNull();
    const d = await stan(page, { sex: 'M', y: 40, m: 0, w: 95, h: 178 });
    // P-DIETA rata Z (decyzja właściciela 2026-09-23): dorosły ma górną granicę dnia i kontrolę za 6 tygodni (bez wzrastania)
    expect(d.energia.gorna).toBe(true);
    expect(d.energia.podaz % 50).toBe(0);
    expect(d.kontrola).not.toBeNull();
    expect(d.kontrola.wzrastanie).toBe(false);
    expect(d.sekcje).toContain('KONTROLA ZA 6 TYGODNI');
    expect(d.tekst).toMatch(/Dieta [a-ząćęłńóśźż]+: nie więcej niż \d+ kcal dziennie — to górna granica dnia/u);
    expect(d.journey).toContain('Kontrola za 6 tygodni');
  });

  test('RV-4: docpro.html — ta sama ścieżka i te same liczby', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page, 'docpro.html');
    const r = await stan(page, CHLOPIEC);
    expect(r.energia).toEqual({ podaz: 2700, gorna: true, celTee: 2731, ree: 'MOLNAR_1995' });
    expect(r.kafle).toContain(`≥ ${r.kontrola.progKg.toFixed(1).replace('.', ',')} kg | odejmij od planu | 100–200 kcal`);
  });

  test('RV-5: widok mobilny 390 px — ramka kontroli w karcie drogi bez poziomego przewijania', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await otworz(page);
    const r = await stan(page, CHLOPIEC);
    expect(r.kontrolaBox).toContain('Kontrola za 6 tygodni');
    expect(r.szerokosc.doc).toBeLessThanOrEqual(r.szerokosc.okno);
    expect(r.szerokosc.mount).toBeLessThanOrEqual(0);
  });
});
