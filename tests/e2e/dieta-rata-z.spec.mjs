import { expect, test } from '@playwright/test';

// P-DIETA rata Z (decyzje właściciela 2026-09-23): u DOROSŁEGO w redukcji i przy celu własnym kaloryczność diety
// to górna granica dnia (w dół do 50 kcal, nie poniżej podłogi K 1200 / M 1600), a plan ma kontrolę za 6 tygodni
// (sama dieta, próg = połowa spodziewanego ubytku, obniżka 100–200 kcal) — w planie PDF, karcie „Droga do normy BMI”
// i zaleceniach; „≤” także w karcie planu i „Raporcie po wizycie”. PRAWDZIWA strona (index i docpro), dane FIKCYJNE.

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
    set('name', 'Testowy Fikcyjny'); set('sex', c.sex); set('age', c.y); set('ageMonths', c.m || 0); set('weight', c.w); set('height', c.h); set('customGoalKg', c.cel == null ? '' : c.cel);
    if (typeof window.ensureDietRecommendationsElements === 'function') window.ensureDietRecommendationsElements();
    const jf = document.getElementById('journeyFlag'); if (jf && !jf.checked) { jf.checked = true; jf.dispatchEvent(new Event('change', { bubbles: true })); }
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
      planKarta: norm((document.getElementById('planResults') || {}).textContent),
      kcalInfo: norm((document.getElementById('dietCalorieInfo') || {}).textContent),
      raport: k ? { value: norm(k.value), rows: k.rows.map((r) => norm(`${r.label}: ${r.valueText}`)) } : null,
      szerokosc: { doc: document.documentElement.scrollWidth, okno: window.innerWidth, mount: mount ? mount.scrollWidth - mount.clientWidth : 0 },
    };
  }, c);
}

const K62 = { sex: 'F', y: 62, m: 0, w: 78, h: 158 };
const RE_TERMIN = '\\d{1,2} (stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia) \\d{4}';

test.describe('P-DIETA rata Z — górna granica dnia i kontrola planu u dorosłego', () => {
  test('RZ-1: kobieta 62 l., 78 kg / 158 cm (BMI 31,2) — ≤ 1 450 kcal (dawniej 1 500), kontrola: ok. 75,7 kg, próg 76,9 kg', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, K62);
    expect(r.energia).toMatchObject({ podaz: 1450, gorna: true });
    expect(r.kontrola).toMatchObject({ tygodnie: 6, masaDzisKg: 78, masaSpodziewanaKg: 75.7, progKg: 76.9, gornaKcal: 1450, obnizkaMozliwa: true, podazPoObnizceKcal: [1250, 1350], wzrastanie: false, przyrostKg: 0 });
    // zalecenia: zdanie o diecie i o kontroli (bez „z uwzględnieniem wzrastania”)
    expect(r.tekst).toContain('Dieta umiarkowana: nie więcej niż 1450 kcal dziennie — to górna granica dnia, nie cel do dobicia. Deficyt energetyczny przy tej diecie wynosi ok. 413 kcal/dobę, co odpowiada tempu redukcji ok. 0,4 kg/tydzień.');
    expect(r.tekst).toMatch(new RegExp('Kontrola za 6 tygodni \\(ok\\. ' + RE_TERMIN + '\\): spodziewana masa ciała ok\\. 75,7 kg\\. Jeśli masa będzie wynosić 76,9 kg lub więcej, realne spożycie jest wyższe, niż liczymy — należy odjąć od planu 100–200 kcal \\(do 1250–1350 kcal dziennie\\)\\.'));
    expect(r.tekst).not.toContain('wzrastania');
    expect(r.tekst).not.toContain('zalecana kaloryczność diety wynosi');
    // plan PDF: kafel ≤, sekcja kontroli, „przy tej diecie”
    expect(r.kafle[0]).toBe('≤ 1 450 | kcal dziennie | górna granica dnia, nie cel');
    expect(r.sekcje).toContain('KONTROLA ZA 6 TYGODNI');
    expect(r.kafle).toContain('ok. 75,7 kg | spodziewana masa | przy tej diecie (dziś 78,0 kg)');
    expect(r.kafle).toContain('≥ 76,9 kg | odejmij od planu | 100–200 kcal');
    // karta drogi: ≤ i ramka kontroli
    expect(r.journey).toContain('≤ 1 450 kcal/dzień');
    expect(r.journey).toContain('górna granica dnia — dieta umiarkowana (nie cel do dobicia)');
    expect(r.kontrolaBox).toMatch(/^Kontrola za 6 tygodni \(ok\. .+\): spodziewana masa ok\. 75,7 kg\. Jeśli będzie 76,9 kg lub więcej, odejmij od planu 100–200 kcal \(do 1 250–1 350 kcal\), bo realne spożycie jest wyższe, niż liczymy\.$/);
    // karta planu i raport po wizycie: ta sama liczba z „≤”
    expect(r.planKarta).toContain('≤ 1450');
    expect(r.planKarta).toContain('górna granica dnia — dieta umiarkowana (nie cel do dobicia)');
    expect(r.kcalInfo).toContain('1450');
    expect(r.raport && r.raport.value).toBe('≤ 1450 kcal/d');
  });

  test('RZ-2: mężczyzna 47 l., 112 kg / 167 cm (BMI 40,2) i 30 l., 150 kg / 180 cm — ≤ 2 200 i ≤ 2 800 (bez zmiany liczby), kontrola 6 tygodni', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const a = await stan(page, { sex: 'M', y: 47, m: 0, w: 112, h: 167 });
    expect(a.energia).toMatchObject({ podaz: 2200, gorna: true });
    expect(a.kontrola).toMatchObject({ tygodnie: 6, masaSpodziewanaKg: 108.6, progKg: 110.3, podazPoObnizceKcal: [2000, 2100] });
    const b = await stan(page, { sex: 'M', y: 30, m: 0, w: 150, h: 180 });
    expect(b.energia).toMatchObject({ podaz: 2800, gorna: true });
    expect(b.kontrola).toMatchObject({ tygodnie: 6, masaSpodziewanaKg: 145.9, progKg: 148, podazPoObnizceKcal: [2600, 2700] });
  });

  test('RZ-3: cel własny dorosłej (40 l., 66 kg / 165 cm, cel 62 kg) — ≤ podaży diety lekkiej i kontrola; utrzymanie przy normie bez granicy', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const c = await stan(page, { sex: 'F', y: 40, m: 0, w: 66, h: 165, cel: 62 });
    expect(c.energia.gorna).toBe(true);
    expect(c.energia.podaz % 50).toBe(0);
    expect(c.tekst).toContain(`podaż nie więcej niż ${c.energia.podaz} kcal dziennie (górna granica dnia, nie cel do dobicia)`);
    expect(c.kontrola).toMatchObject({ tygodnie: 6, wzrastanie: false, gornaKcal: c.energia.podaz });
    expect(c.journey).toContain('górna granica dnia — cel własny, dieta lekka (nie cel do dobicia)');
    expect(c.sekcje).toContain('KONTROLA ZA 6 TYGODNI');
    // ta sama osoba bez celu własnego (BMI 24,2) — utrzymanie masy, bez granicy i bez kontroli
    const u = await stan(page, { sex: 'F', y: 40, m: 0, w: 66, h: 165 });
    expect(u.energia.gorna).toBe(false);
    expect(u.kontrola).toBeNull();
    expect(u.sekcje).not.toContain('KONTROLA ZA 6 TYGODNI');
  });

  test('RZ-4: docpro.html — ta sama ścieżka i te same liczby', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page, 'docpro.html');
    const r = await stan(page, K62);
    expect(r.energia).toMatchObject({ podaz: 1450, gorna: true });
    expect(r.kontrola).toMatchObject({ masaSpodziewanaKg: 75.7, progKg: 76.9 });
    expect(r.tekst).toContain('Dieta umiarkowana: nie więcej niż 1450 kcal dziennie');
  });

  test('RZ-5: 390 px — karta drogi z ramką kontroli dorosłego bez poziomego przewijania', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await otworz(page);
    const r = await stan(page, K62);
    expect(r.kontrolaBox).toContain('Kontrola za 6 tygodni');
    expect(r.szerokosc.doc).toBeLessThanOrEqual(r.szerokosc.okno);
    expect(r.szerokosc.mount).toBeLessThanOrEqual(0);
  });
});
