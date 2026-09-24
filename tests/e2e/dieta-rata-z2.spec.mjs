import { expect, test } from '@playwright/test';

// P-DIETA rata Z2 (decyzje właściciela 2026-09-24): u DOROSŁEGO szczebel „−5 % masy” (Wing 2011, doi:10.2337/dc10-2415)
// w drabince celów — pierwszy krok, gdy leży najbliżej; inaczej „lepsze wyniki badań” na osi i wskazanie w zdaniach.
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
      os: Array.from(html.matchAll(/vrp-zn vrp-t-(\w+)( vrp-zn-dol)?" style="left:([\d.]+)%">.*?vrp-kg">([^<]*)<small>.*?vrp-pd">([^<]*)</g)).map((x) => [norm(x[4]), x[5], !!x[2]]),
      krokO: norm((html.match(/vrp-krok-o">([^<]*)</) || [])[1]),
      naglowekRaportu: (() => { try { const mm = window.patientReportBuildModel(); const s = JSON.stringify(mm); const h = s.match(/Pierwszy krok to[^"]*/); return h ? norm(h[0]) : null; } catch (e) { return null; } })(),
      szerokosc: { doc: document.documentElement.scrollWidth, okno: window.innerWidth, mount: mount ? mount.scrollWidth - mount.clientWidth : 0 },
    };
  }, c);
}

test.describe('P-DIETA rata Z2 — próg −5 % masy u dorosłego', () => {
  test('RZ2-1: M 47 l., 112 kg / 167 cm (BMI 40,2) — pierwszy cel −5,6 kg (106,4 kg), oś „pierwszy krok”, raport', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { sex: 'M', y: 47, m: 0, w: 112, h: 167 });
    expect(r.tekst).toContain('Pierwszy cel to ok. 106,4 kg (5 % masy ciała), czyli około 5,6 kg mniej; już taka zmiana poprawia ciśnienie i wyniki badań krwi (cholesterol, trójglicerydy).');
    expect(r.os).toEqual([['112,0', 'dziś', false], ['106,4', 'pierwszy krok', true], ['97,6', 'wyjście z otyłości III stopnia', false], ['83,7', 'koniec otyłości', false], ['69,4', 'norma BMI', false]]);
    expect(r.krokO).toBe('pierwszy krok: już ta zmiana poprawia ciśnienie i wyniki badań krwi');
    expect(r.journey).toContain('Po drodze: −5,6 kg → −5 % masy — próg poprawy: ciśnienie, trójglicerydy, HDL (Wing 2011)');
    expect(r.naglowekRaportu).toBe('Pierwszy krok to ok. 106,4 kg, czyli około 5,6 kg mniej; już ta zmiana poprawia ciśnienie i wyniki badań krwi.');
  });

  test('RZ2-2: K 62 l., 78 kg / 158 cm (BMI 31,2) — pierwszy BMI 30, −5 % (74,1 kg) wskazane osobno; na osi drugi rząd', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { sex: 'F', y: 62, m: 0, w: 78, h: 158 });
    expect(r.tekst).toContain('Pierwszy cel to ok. 74,9 kg (BMI 30), czyli około 3,1 kg mniej – koniec otyłości; już ok. 5 % masy (ok. 74,1 kg) poprawia ciśnienie i wyniki badań krwi (cholesterol, trójglicerydy).');
    expect(r.os).toEqual([['78,0', 'dziś', false], ['74,9', 'koniec otyłości', false], ['74,1', 'lepsze wyniki badań', true], ['62,2', 'norma BMI', false]]);
    expect(r.krokO).toBe('pierwszy krok: koniec otyłości');
    expect(r.naglowekRaportu).toBe('Pierwszy krok to ok. 74,9 kg (koniec otyłości), czyli około 3,1 kg mniej; już ok. 5 % masy (ok. 74,1 kg) poprawia ciśnienie i wyniki badań krwi.');
  });

  test('RZ2-3: nadwaga — K 45 l., 80 kg / 165 cm (BMI 29,4): pierwszy cel −4,0 kg; BMI 25,5 bez kroku pośredniego', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const a = await stan(page, { sex: 'F', y: 45, m: 0, w: 80, h: 165 });
    expect(a.tekst).toContain('Pierwszy cel to ok. 76,0 kg (5 % masy ciała), czyli około 4,0 kg mniej; już taka zmiana poprawia ciśnienie i wyniki badań krwi (cholesterol, trójglicerydy).');
    expect(a.os.map((p) => p[1])).toEqual(['dziś', 'pierwszy krok', 'norma BMI']);
    const b = await stan(page, { sex: 'F', y: 45, m: 0, w: 65.3, h: 160 });
    expect(b.tekst).not.toContain('Pierwszy cel');
    expect(b.tekst).toContain('Do uzyskania zakresu prawidłowego BMI dla dorosłych potrzebna byłaby redukcja masy ciała');
  });

  test('RZ2-4: docpro.html — te same zdania i oś', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page, 'docpro.html');
    const r = await stan(page, { sex: 'M', y: 47, m: 0, w: 112, h: 167 });
    expect(r.tekst).toContain('Pierwszy cel to ok. 106,4 kg (5 % masy ciała)');
    // 106,4 kg leży 13 % osi od „dziś” (< 18 %) — drugi rząd z łącznikiem (rata Y)
    expect(r.os[1]).toEqual(['106,4', 'pierwszy krok', true]);
  });
});
