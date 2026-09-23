import { expect, test } from '@playwright/test';

// P-DIETA rata W (decyzje właściciela 2026-09-23): kontrola planu u rosnącego dziecka — spodziewana masa i próg
// z przyrostem ze wzrastania (własna prognoza wzrostu × mediana BMI), 12 tygodni przy tempie diety < 1 kg/mies.,
// zdanie o ważeniu w planie PDF; przy zaznaczonym „Wzrost zakończony” reguły wzrastania nie obowiązują
// (6 tygodni, bez przyrostu). PRAWDZIWA strona, dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.buildDietEnergyRecommendationResult === 'function'
    && !!window.VildaRaportPlan && window.VildaRaportPlan.version >= 10 && typeof window.energyKontrolaPlanu === 'function');
}

async function stan(page, c) {
  return page.evaluate(async (c) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) { el.disabled = false; el.checked = on; } };
    window.professionalMode = true; window.intakeHistory = null; window.lastLoadedData = null; window.hasUserModifiedAfterLoad = false;
    window.__vildaPlanPalTouched = false; window.__vildaPlanPalDefault = null;
    // jawny wybór „Redukcja” przez lekarza (bez tej flagi update() przywraca strategię domyślną)
    window.__vildaDietStrategyTouched = !!c.redukcja;
    set('name', 'Testowa Fikcyjna'); set('sex', c.sex); set('age', c.y); set('ageMonths', 0); set('weight', c.w); set('height', c.h); set('customGoalKg', '');
    if (typeof window.ensureDietRecommendationsElements === 'function') window.ensureDietRecommendationsElements();
    flag('reduceToggle', !!c.redukcja); flag('stabilizationToggle', false); flag('growthEndedFlag', !!c.wzrostZakonczony); flag('journeyFlag', true);
    window.update();
    await new Promise((r) => { setTimeout(r, 700); });
    const br = window.buildDietEnergyRecommendationResult();
    const d = br.dane || {};
    const html = window.VildaRaportPlan.html({ patient: { name: 'Testowa Fikcyjna', ageLabel: `${c.y} lat`, sexLabel: 'x', weightLabel: `${c.w} kg`, heightLabel: `${c.h} cm` }, baseResult: br });
    const norm = (s) => String(s || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      strategia: d.strategia, dieta: d.energia && d.energia.dietaKlucz, kontrola: d.kontrola,
      kafle: Array.from(html.matchAll(/vrp-kafel"><b>([^<]*)<\/b><span>([^<]*)<\/span><i>([^<]*)<\/i>/g)).map((x) => norm(x[1] + ' | ' + x[2] + ' | ' + x[3])),
      sekcje: Array.from(html.matchAll(/vrp-nag-blok"><span>([^<]*)<\/span>/g)).map((x) => x[1]),
      podkafle: Array.from(html.matchAll(/vrp-podkafle">([^<]*)<\/div>/g)).map((x) => norm(x[1])),
      kontrolaBox: norm((document.querySelector('#bmiJourneyMount .bmi-journey-kontrola') || {}).textContent),
      tekst: norm(br.textOutput),
    };
  }, c);
}

const f1 = (x) => x.toFixed(1).replace('.', ',');
const r1 = (x) => Math.round(x * 10) / 10;
const WAZENIE = 'Ważenie: rano, po toalecie, w bieliźnie, na tej samej wadze.';

test.describe('P-DIETA rata W — kontrola z uwzględnieniem wzrastania', () => {
  test('RW-1: dziewczynka 8 l, 130 cm, 45 kg (≥ 99c), dieta lekka — kontrola po 12 tygodniach z przyrostem ze wzrastania, wszędzie te same liczby', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { sex: 'F', y: 8, w: 45, h: 130 });
    expect(r.strategia).toBe('reduction');
    expect(r.dieta).toBe('light');
    const K = r.kontrola;
    expect(K).toMatchObject({ tygodnie: 12, wzrastanie: true, wzrostZakonczony: false, masaDzisKg: 45 });
    expect(K.przyrostKg).toBeGreaterThan(0.3); expect(K.przyrostKg).toBeLessThan(0.8);
    expect(K.masaSpodziewanaKg).toBe(r1(45 - K.ubytekDietyKg + K.przyrostKg));
    expect(K.progKg).toBe(r1(45 + K.przyrostKg - K.ubytekDietyKg / 2));
    expect(K.progKg - K.masaSpodziewanaKg).toBeGreaterThan(0.6); // połowa efektu diety po 12 tyg. ≈ 0,69 kg
    // karta drogi
    expect(r.kontrolaBox).toContain(`Kontrola za 12 tygodni (ok. ${K.terminTekst}): spodziewana masa ok. ${f1(K.masaSpodziewanaKg)} kg (z uwzględnieniem wzrastania). Jeśli będzie ${f1(K.progKg)} kg lub więcej, odejmij od planu 100–200 kcal`);
    // zalecenia
    expect(r.tekst).toContain(`Kontrola za 12 tygodni (ok. ${K.terminTekst}): spodziewana masa ciała ok. ${f1(K.masaSpodziewanaKg)} kg (z uwzględnieniem wzrastania). Jeśli masa będzie wynosić ${f1(K.progKg)} kg lub więcej`);
    // plan PDF
    expect(r.sekcje).toContain('KONTROLA ZA 12 TYGODNI');
    expect(r.kafle).toContain(`${K.terminKrotki} | ${K.terminRok} | termin kontroli (ok. 12 tygodni)`);
    expect(r.kafle).toContain(`ok. ${f1(K.masaSpodziewanaKg)} kg | spodziewana masa | z dietą i wzrastaniem (dziś 45,0 kg)`);
    expect(r.kafle).toContain(`≥ ${f1(K.progKg)} kg | odejmij od planu | 100–200 kcal`);
    expect(r.podkafle.join(' ')).toContain(WAZENIE);
  });

  test('RW-2: chłopiec 11 l, 150 cm, 60 kg, dieta lekka — bez flagi 12 tygodni z przyrostem; z „Wzrost zakończony” 6 tygodni, bez przyrostu i bez „wzrastania” w tekstach', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const bez = await stan(page, { sex: 'M', y: 11, w: 60, h: 150, redukcja: true });
    expect(bez.dieta).toBe('light');
    expect(bez.kontrola).toMatchObject({ tygodnie: 12, wzrastanie: true });
    const z = await stan(page, { sex: 'M', y: 11, w: 60, h: 150, redukcja: true, wzrostZakonczony: true });
    const K = z.kontrola;
    expect(K).toMatchObject({ tygodnie: 6, przyrostKg: 0, wzrastanie: false, wzrostZakonczony: true });
    expect(K.progKg).toBe(r1(60 - K.ubytekDietyKg / 2));
    expect(z.kontrolaBox).toContain(`Kontrola za 6 tygodni (ok. ${K.terminTekst}): spodziewana masa ok. ${f1(K.masaSpodziewanaKg)} kg. Jeśli będzie`);
    expect(z.kontrolaBox).not.toContain('wzrastania');
    expect(z.tekst).toContain(`spodziewana masa ciała ok. ${f1(K.masaSpodziewanaKg)} kg. Jeśli masa będzie wynosić ${f1(K.progKg)} kg`);
    expect(z.sekcje).toContain('KONTROLA ZA 6 TYGODNI');
    expect(z.kafle).toContain(`ok. ${f1(K.masaSpodziewanaKg)} kg | spodziewana masa | przy tej diecie (dziś 60,0 kg)`);
    expect(z.podkafle.join(' ')).toContain(WAZENIE);
  });
});
