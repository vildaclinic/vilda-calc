import { expect, test } from '@playwright/test';

// P-DIETA rata U (decyzje właściciela 2026-09-23): u dziecka z otyłością od 10 lat korekta REE × 0,9 (błąd równania)
// osobno od PAL 1,4; podstawa diety = zapotrzebowanie dla masy docelowej (85c) − 200/350/500 kcal (Mazur 2022),
// nie szybciej niż 1/1,5/2 kg/mies.; u 12–18 lat z otyłością domyślna dieta umiarkowana; oś planu PDF: „pierwszy krok”
// tylko na pierwszym szczeblu, bliskie etykiety w drugim rzędzie; zdanie o ruchu prawdziwe; korzyść Reinehra tylko pod
// progiem Reinehra. PRAWDZIWA strona (index i docpro), dane FIKCYJNE.
// P-DIETA rata V (2026-09-23): × 0,9 zastąpione równaniem Molnára 1995 (otyłość 10–18 lat, dane w
// vilda_ree_rownania_data.js); liczby poniżej są liczbami raty V; kaloryczność dziecka to górna granica dnia (w dół do 50).

async function otworz(page, strona) {
  await page.goto(`/${strona || 'index.html'}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.buildDietEnergyRecommendationResult === 'function'
    && !!window.VildaRaportPlan && window.VildaRaportPlan.version >= 8 && !!window.VildaBmi);
}

async function stan(page, c) {
  return page.evaluate(async (c) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    window.professionalMode = true; window.intakeHistory = null; window.lastLoadedData = null; window.hasUserModifiedAfterLoad = false;
    window.__vildaPlanPalTouched = false; window.__vildaPlanPalDefault = null;
    set('name', 'Testowy Fikcyjny'); set('sex', c.sex); set('age', c.y); set('ageMonths', c.m || 0); set('weight', c.w); set('height', c.h);
    if (typeof window.ensureDietRecommendationsElements === 'function') window.ensureDietRecommendationsElements();
    const jf = document.getElementById('journeyFlag'); if (jf && !jf.checked) { jf.checked = true; jf.dispatchEvent(new Event('change', { bubbles: true })); }
    // P-DIETA rata N2: sama nadwaga 12–18 lat ma domyślnie stabilizację — test diety redukcyjnej wybiera redukcję jawnie
    if (c.redukcja) { window.__vildaDietStrategyTouched = true; const rt = document.getElementById('reduceToggle'); if (rt) rt.checked = true; const sb = document.getElementById('stabilizationToggle'); if (sb) sb.checked = false; }
    window.update();
    await new Promise((r) => { setTimeout(r, 700); });
    if (c.dieta) { const sel = document.getElementById('dietLevel'); if (sel) { sel.value = c.dieta; } if (sel) { sel.dispatchEvent(new Event('change', { bubbles: true })); } if (typeof window.updatePlanFromDiet === 'function') window.updatePlanFromDiet(); window.update(); await new Promise((r) => { setTimeout(r, 700); }); }
    const br = window.buildDietEnergyRecommendationResult();
    const d = br.dane || {};
    const st = window.energyBuildPlanReductionState({ ageYears: c.y + (c.m || 0) / 12, ageMonthsOpt: c.m || 0, sex: c.sex, weightKg: c.w, heightCm: c.h, palInput: null, history: null, intakeKcalPerDay: null, mountId: 'anorexiaTmpMount' });
    const html = window.VildaRaportPlan.html({ patient: { name: 'Testowy Fikcyjny', ageLabel: `${c.y} lat`, sexLabel: 'x', weightLabel: `${c.w} kg`, heightLabel: `${c.h} cm` }, baseResult: br });
    const norm = (s) => String(s || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      dietLevel: (document.getElementById('dietLevel') || {}).value || null, // docpro nie ma karty planu — selektu może nie być
      silnik: { pal: st.palUsed, fac: st.reeFactor, ree: st.reeKcal, reeAdj: st.reeAdjustedKcal, maint: st.maintenanceKcal, teeT: st.targetTeeKcal, cel: st.targetWeightKg,
        diety: st.diets.map((x) => ({ k: x.key, kcal: x.intake, def: x.deficit, mies: x.monthlyLossKg, sufit: x.tempoSufit, zal: x.zalecana, baza: x.bazaCeluKcal, defCelu: x.deficytCeluKcal })) },
      energia: { podaz: d.energia.podazZaokrKcal, def: d.energia.deficytKcal, dieta: d.energia.dietaKlucz, baza: d.energia.bazaCeluKcal, defCelu: d.energia.deficytCeluKcal, sufit: d.energia.tempoSufit },
      naglowek: (html.match(/vrp-krok-n">([^<]*)<\/div><div class="vrp-krok-s">([^<]*)<\/div>(?:<div class="vrp-krok-o">([^<]*)<\/div>)?/) || []).slice(1).map(norm),
      os: Array.from(html.matchAll(/vrp-zn vrp-t-(\w+)( vrp-zn-dol)?" style="left:([\d.]+)%">.*?vrp-kg">([^<]*)<small>.*?vrp-pd">([^<]*)</g)).map((x) => ({ typ: x[1], dol: !!x[2], kg: norm(x[4]), pod: x[5] })),
      dwaRzedy: /vrp-pasek vrp-pasek-2r/.test(html),
      kafle: Array.from(html.matchAll(/vrp-kafel"><b>([^<]*)<\/b><span>([^<]*)<\/span>/g)).map((x) => norm(x[1] + ' ' + x[2])),
      ruch: norm((html.match(/vrp-ruchdek">(.*?)<\/div>/) || [])[1]).replace(/<[^>]+>/g, ''),
      nota: norm((document.querySelector('.plan-needed-note') || {}).textContent),
      plan: norm(document.getElementById('planResults')?.textContent),
      journey: norm(document.getElementById('bmiJourneyMount')?.textContent),
      tekst: norm(br.textOutput),
    };
  }, c);
}

const CHLOPIEC = { sex: 'M', y: 15, m: 3, w: 102.5, h: 186.7 };

test.describe('P-DIETA rata U — dieta dziecka z otyłością od masy docelowej, korekta REE, oś planu PDF', () => {
  test('RU-1: chłopiec 15;3, 102,5 kg / 186,7 cm — domyślnie umiarkowana, rata V: ≤ 2 700 kcal (rata U 2 600), −379 kcal, REE Molnára osobno od PAL 1,4, nota i punkt planu z podstawą od masy docelowej, kontrola za 6 tygodni', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, CHLOPIEC);
    expect(r.dietLevel).toBe('moderate');
    expect(r.silnik.pal).toBe(1.4); expect(r.silnik.fac).toBeCloseTo(2199 / r.silnik.ree, 3);
    expect(r.silnik.reeAdj).toBe(2199);
    expect(r.silnik.maint).toBe(3079);
    expect(r.silnik.teeT).toBe(2731); expect(r.silnik.cel).toBeCloseTo(82.1, 1);
    expect(r.silnik.diety.map((x) => x.kcal)).toEqual([2826, 2700, 2573]);
    expect(r.silnik.diety.map((x) => x.def)).toEqual([253, 379, 506]);
    expect(r.silnik.diety.map((x) => x.sufit)).toEqual([true, true, true]);
    expect(r.silnik.diety.map((x) => x.zal)).toEqual([false, true, false]);
    expect(r.energia).toEqual({ podaz: 2700, def: 379, dieta: 'moderate', baza: 2731, defCelu: 350, sufit: true });
    expect(r.kafle.slice(0, 3)).toEqual(['≤ 2 700 kcal dziennie', '−379 kcal na dobę', '−0,3 kg tygodniowo']);
    expect(r.nota).toContain('dieta liczona od zapotrzebowania dla masy docelowej ok. 82,1 kg (85. centyl BMI): ok. 2731 kcal/dzień przy PAL 1,4, pomniejszonego o 200–500 kcal (Mazur 2022), nie szybciej niż 1–2 kg/mies.; zapotrzebowanie przy obecnej masie ciała ok. 3079 kcal/dzień (REE wg Molnára 1995, zwalidowane u nastolatków z otyłością); minimum 2199 kcal/dzień (spoczynkowa przemiana materii)');
    expect(r.nota).not.toContain('korektą');
    expect(r.plan).toContain('od zapotrzebowania dla masy docelowej ok. 2731 kcal odjęto 350 kcal (Mazur 2022), a tempo ograniczono do ok. 1,5 kg/mies.; deficyt ok. 379 kcal dziennie względem zapotrzebowania przy obecnej masie ciała (tempo ok. 1,5 kg/mies.; Mazur 2022: bezpiecznie do 1–2 kg/mies.)');
    expect(r.journey).toContain('od zapotrzebowania dla masy docelowej ok. 2 731 kcal odjęto 350 kcal (Mazur 2022), a tempo ograniczono do ok. 1,5 kg/mies.; deficyt ok. 379 kcal/dzień względem zapotrzebowania przy obecnej masie ciała (tempo ok. 1,5 kg/mies.)');
    expect(r.journey).toMatch(/≤ ?2 ?700 kcal\/dzień ?górna granica dnia — dieta umiarkowana \(nie cel do dobicia\)/);
    expect(r.journey).toMatch(/Kontrola za 6 tygodni \(ok\. \d{1,2} [a-ząćęłńóśźż]+ \d{4}\): spodziewana masa ok\. [\d,]+ kg \(z uwzględnieniem wzrastania\)\. Jeśli będzie [\d,]+ kg lub więcej, odejmij od planu 100–200 kcal \(do 2 ?500–2 ?600 kcal\), bo realne spożycie jest wyższe, niż liczymy\./);
    expect(r.tekst).toContain('Dieta umiarkowana: nie więcej niż 2700 kcal dziennie — to górna granica dnia, nie cel do dobicia. Deficyt kaloryczny przy tej diecie wynosi około 379 kcal');
    expect(r.tekst).not.toContain('dostarcza około');
    expect(r.tekst).toMatch(/Kontrola za 6 tygodni \(ok\. \d{1,2} [a-ząćęłńóśźż]+ \d{4}\): spodziewana masa ciała ok\. [\d,]+ kg \(z uwzględnieniem wzrastania\)\. Jeśli masa będzie wynosić [\d,]+ kg lub więcej, realne spożycie jest wyższe, niż liczymy — należy odjąć od planu 100–200 kcal \(do 2500–2600 kcal dziennie\)\./);
  });

  test('RU-2: ten sam chłopiec — oś planu PDF: „koniec otyłości” przed „lepsze wyniki badań” (drugi rząd), nagłówek „pierwszy krok: koniec otyłości”, zdanie o ruchu prawdziwe, narracja bez korzyści Reinehra pod 97. centylem', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, CHLOPIEC);
    expect(r.naglowek).toEqual(['−4,7 kg', 'do 97,8 kg', 'pierwszy krok: koniec otyłości']);
    expect(r.os.map((p) => [p.kg, p.pod, p.dol])).toEqual([['102,5', 'dziś', false], ['97,8', 'koniec otyłości', false], ['96,4', 'lepsze wyniki badań', true], ['82,1', 'norma BMI', false]]);
    expect(r.dwaRzedy).toBe(true);
    expect(r.os.filter((p) => p.pod === 'pierwszy krok')).toEqual([]);
    // P-RAPORT rata Y: suma tygodniowa nazwana jako deficyt i zaokrąglona do 50 (3 783 → 3 800), kaloryczność „dziennie”
    expect(r.ruch).toMatch(/^Twój zadeklarowany plan: dieta umiarkowana \(do 2 700 kcal dziennie\) i spacer 30 min\/d — razem to ok\. 3 800 kcal tygodniowo mniej, niż organizm zużywa\. Tempo pokazane powyżej dotyczy samej diety; z ruchem to ok\. −0,5 kg tygodniowo\. Dzięki ruchowi dojdziesz do celu o /);
    expect(r.ruch).not.toContain('już to uwzględnia');
    expect(r.tekst).toContain('Pierwszy cel to ok. 97,8 kg, czyli około 4,7 kg mniej (koniec otyłości). Górna granica normy');
    expect(r.tekst).not.toContain('już taka zmiana poprawia');
  });

  test('RU-3: lekka i intensywna z selektu — rata V: ≤ 2 800 / ≤ 2 550 kcal (górna granica w dół do 50), deficyt 253 / 506', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const l = await stan(page, { ...CHLOPIEC, dieta: 'light' });
    expect(l.energia.podaz).toBe(2800); expect(l.energia.def).toBe(253); expect(l.kafle[0]).toBe('≤ 2 800 kcal dziennie');
    const i = await stan(page, { ...CHLOPIEC, dieta: 'intense' });
    expect(i.energia.podaz).toBe(2550); expect(i.energia.def).toBe(506); expect(i.kafle[0]).toBe('≤ 2 550 kcal dziennie');
  });

  // P-DIETA rata N2 (2026-09-24): przy samej nadwadze 12–18 lat domyślnie stabilizacja, a redukcja ma sufit 0,5 / 1 / 1,5 kg/mies.
  // — sufit 0,5 kg/mies. (126 kcal) jest niższy niż deficyt Mazura 200 kcal, więc wiąże także tuż nad celem.
  test('RU-4: chłopiec 13 l, 155 cm, 55 kg (nadwaga tuż nad celem) — bez korekty, PAL 1,6; domyślnie stabilizacja; redukcja lekka z sufitem 0,5 kg/mies. (rata N2)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const s = await stan(page, { sex: 'M', y: 13, m: 0, w: 55, h: 155 });
    expect(s.journey).toContain('utrzymanie masy');
    const r = await stan(page, { sex: 'M', y: 13, m: 0, w: 55, h: 155, redukcja: true });
    expect(r.dietLevel).toBe('light');
    expect(r.silnik.fac).toBe(1); expect(r.silnik.pal).toBe(1.6);
    expect(r.silnik.reeAdj).toBe(Math.round(r.silnik.ree));
    const lekka = r.silnik.diety[0];
    expect(lekka.sufit).toBe(true); expect(lekka.zal).toBe(true);
    expect(lekka.def).toBe(126);
    expect(lekka.kcal).toBe(r.silnik.maint - 126);
    expect(lekka.mies).toBe(0.5);
    expect(r.energia.sufit).toBe(true); expect(r.energia.defCelu).toBe(200);
    expect(r.plan).toContain(`od zapotrzebowania dla masy docelowej ok. ${r.silnik.teeT} kcal odjęto 200 kcal (Mazur 2022), a tempo ograniczono do ok. 0,5 kg/mies.`);
    expect(r.plan).toContain('przy nadwadze ubytek stopniowy: do 0,5–1,5 kg/mies.');
    expect(r.plan).toContain('Nadwaga u nastolatka 12–18 lat: zalecane utrzymanie masy ciała');
    expect(r.tekst).toContain('Przy nadwadze u nastolatka ubytek masy powinien być stopniowy — tempo ograniczono do ok. 0,5 kg/mies.');
  });

  test('RU-5: bramka wieku równania — 8 lat z otyłością Henry bez korekty (1), 11 lat z otyłością Molnár (rata V)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const m8 = await stan(page, { sex: 'M', y: 8, m: 0, w: 45, h: 130 });
    expect(m8.silnik.fac).toBe(1); expect(m8.silnik.reeAdj).toBe(Math.round(m8.silnik.ree)); expect(m8.dietLevel).toBe('light');
    expect(m8.nota).toContain('dieta liczona od zapotrzebowania dla masy docelowej');
    expect(m8.nota).not.toContain('korektą');
    const m11 = await stan(page, { sex: 'M', y: 11, m: 0, w: 65, h: 150 });
    const molnar11 = (50.9 * 65 + 25.3 * 150 - 50.3 * 11 + 26.9) / 4.184; // Molnár 1995, 1A
    expect(m11.silnik.reeAdj).toBe(Math.round(molnar11)); expect(m11.silnik.fac).toBeCloseTo(molnar11 / m11.silnik.ree, 6);
    expect(m11.nota).toContain('REE wg Molnára 1995');
  });

  test('RU-6: dziewczynka 16;4, 94,8 kg / 175,5 cm (próg Reinehra pierwszy) — „pierwszy krok” na osi i korzyść w narracji bez zmian', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { sex: 'F', y: 16, m: 4, w: 94.8, h: 175.5 });
    expect(r.naglowek[2]).toBe('pierwszy krok: już ta zmiana poprawia ciśnienie i wyniki badań krwi');
    expect(r.os.map((p) => p.pod)).toContain('pierwszy krok');
    expect(r.os.map((p) => p.pod)).not.toContain('lepsze wyniki badań');
    expect(r.tekst).toContain('kg mniej; już taka zmiana poprawia ciśnienie i wyniki badań krwi (cholesterol, trójglicerydy).');
  });

  test('RU-7: docpro.html — ta sama ścieżka (rata V: 2 700 kcal, umiarkowana, oś z drugim rzędem)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page, 'docpro.html');
    const r = await stan(page, CHLOPIEC);
    expect(r.energia.dieta).toBe('moderate');
    expect(r.energia.podaz).toBe(2700);
    expect(r.os.map((p) => p.pod)).toEqual(['dziś', 'koniec otyłości', 'lepsze wyniki badań', 'norma BMI']);
    expect(r.dwaRzedy).toBe(true);
  });
});
