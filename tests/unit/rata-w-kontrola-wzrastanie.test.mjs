import { afterAll, describe, expect, it } from 'vitest';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-DIETA rata W (decyzje właściciela 2026-09-23): kontrola planu u rosnącego dziecka.
//  1. spodziewana masa = dziś − ubytek z diety + PRZYROST ZE WZRASTANIA; przyrost = mediana BMI dla wieku ×
//     ((wzrost + roczne tempo wzrastania × czas)² − wzrost²) — masa beztłuszczowa „należna” wzrastaniu, bez przyrostu tłuszczu;
//  2. próg = dziś + przyrost − ½ ubytku (połowa efektu diety ponad wzrastanie);
//  3. przy tempie diety < 1 kg/mies. (dieta lekka 6–11 lat, 0,5 kg/mies.) kontrola po 12 tygodniach, inaczej po 6;
//  4. przy zaznaczonym „Wzrost zakończony” (albo praktycznie zakończonym wzrastaniu) reguły 1–3 NIE obowiązują —
//     wraca reguła raty V (6 tygodni, bez przyrostu).
// Powód (analiza 2026-09-23): wzrastanie dodaje dziecku 6–11 lat ok. 0,3–0,5 kg w 6 tygodni (siatka OLAF), a dieta lekka
// odejmuje 0,69 kg — dziecko w 100 % zgodne stało przy dawnym progu (−0,3 kg) albo go przekraczało.
// PRAWDZIWY silnik (vilda_diet_plan_ui.js + VildaBmi na tablicach OLAF). Dane FIKCYJNE.

const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => { for (const k of Object.keys(zapisane)) { if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k]; } });
ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; });
ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });
const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_diet_plan_ui.js');
const DZIS = new Date(2026, 8, 23);
const plan = (p) => win.energyBuildPlanReductionState({ ageMonthsOpt: 0, palInput: null, ...p });
const kontrola = (p, klucz, ge = false) => {
  const st = plan(p);
  const d = st.diets.find((x) => x.key === klucz);
  return { st, d, k: win.energyKontrolaPlanu(d, { weightKg: p.weightKg, floorKcal: st.floorKcal, dzis: DZIS, sex: p.sex, ageYears: p.ageYears, ageMonthsOpt: p.ageMonthsOpt || 0, heightCm: p.heightCm, growthEnded: ge }) };
};
// wyrocznia reguły (zapis decyzji właściciela) na danych silnika: prognoza wzrostu i mediana BMI
const przyrostWyrocznia = (p, tyg) => {
  const ol = win.energyChildGrowthOutlook({ ageYears: p.ageYears, sex: p.sex, heightCm: p.heightCm });
  const bm = win.VildaBmi.mediana(p.sex, p.ageYears * 12, 'OLAF').mediana;
  const h = p.heightCm / 100;
  return bm * ((h + ol.annualGrowthCm * tyg * 7 / 365.25 / 100) ** 2 - h ** 2);
};
const r1 = (x) => Math.round(x * 10) / 10;
const DZ8 = { sex: 'F', ageYears: 8, weightKg: 45, heightCm: 130 };

describe('rata W: dziewczynka 8 l, 130 cm, 45 kg (≥ 99c), dieta lekka 0,5 kg/mies.', () => {
  const { st, d, k } = kontrola(DZ8, 'light');
  it('dieta lekka domyślna, tempo 0,5 kg/mies. → kontrola po 12 tygodniach (16 grudnia 2026)', () => {
    expect(st.bmiClass.severe).toBe(true);
    expect(d.zalecana).toBe(true);
    expect(d.monthlyLossKg).toBe(0.5);
    expect(k.tygodnie).toBe(12);
    expect(k.terminTekst).toBe('16 grudnia 2026');
    expect(k.terminKrotki).toBe('16 XII');
  });
  it('spodziewana masa i próg z przyrostem ze wzrastania: ok. 44,2 kg, próg 44,8 kg', () => {
    const ub = d.weeklyLoss * 12, p = przyrostWyrocznia(DZ8, 12);
    expect(k.ubytekDietyKg).toBeCloseTo(ub, 2);
    expect(k.przyrostKg).toBeCloseTo(p, 2);
    expect(k.przyrostKg).toBeGreaterThan(0.4);
    expect(k.masaSpodziewanaKg).toBe(r1(45 - ub + p));
    expect(k.progKg).toBe(r1(45 + p - ub / 2));
    expect([k.masaSpodziewanaKg, k.progKg]).toEqual([44.2, 44.8]);
    expect(k.wzrastanie).toBe(true);
    expect(k.wzrostZakonczony).toBe(false);
  });
  it('dziecko w 100 % zgodne z planem mieści się ok. 0,7 kg pod progiem (dawna reguła po 6 tygodniach: ok. 0,1 kg)', () => {
    const zgodne = 45 - d.weeklyLoss * 12 + przyrostWyrocznia(DZ8, 12);
    expect(k.progKg - zgodne).toBeGreaterThan(0.6);
    const dawneZgodne6 = 45 - d.weeklyLoss * 6 + przyrostWyrocznia(DZ8, 6);
    expect(r1(45 - d.weeklyLoss * 3) - dawneZgodne6).toBeLessThan(0.2);
  });
  it('ta sama dziewczynka na diecie umiarkowanej (1 kg/mies.): 6 tygodni, przyrost też w progu', () => {
    const u = kontrola(DZ8, 'moderate').k;
    expect(u.tygodnie).toBe(6);
    expect(u.przyrostKg).toBeCloseTo(przyrostWyrocznia(DZ8, 6), 2);
    expect(u.wzrastanie).toBe(true);
  });
});

describe('rata W: nastolatek — 6 tygodni, przyrost z własnej prognozy wzrostu', () => {
  const CHL = { sex: 'M', ageYears: 15.25, ageMonthsOpt: 3, weightKg: 102.5, heightCm: 186.7 };
  it('chłopiec 15;3, umiarkowana: 6 tygodni, przyrost ok. 0,3 kg, spodziewana 100,7 kg, próg 101,8 kg', () => {
    const { d, k } = kontrola(CHL, 'moderate');
    const p = przyrostWyrocznia(CHL, 6);
    expect(k.tygodnie).toBe(6);
    expect(k.przyrostKg).toBeCloseTo(p, 2);
    expect(k.masaSpodziewanaKg).toBe(r1(102.5 - d.weeklyLoss * 6 + p));
    expect(k.progKg).toBe(r1(102.5 + p - d.weeklyLoss * 3));
  });
});

describe('rata W: „Wzrost zakończony” wyłącza reguły wzrastania (decyzja właściciela)', () => {
  it('chłopiec 11 l, 150 cm, 60 kg, lekka: z flagą — 6 tygodni, bez przyrostu, próg = dziś − ½ ubytku (reguła raty V)', () => {
    const P = { sex: 'M', ageYears: 11, weightKg: 60, heightCm: 150 };
    const bez = kontrola(P, 'light').k, z = kontrola(P, 'light', true);
    expect(bez.tygodnie).toBe(12);
    expect(bez.wzrastanie).toBe(true);
    expect(z.k.tygodnie).toBe(6);
    expect(z.k.przyrostKg).toBe(0);
    expect(z.k.wzrastanie).toBe(false);
    expect(z.k.wzrostZakonczony).toBe(true);
    expect(z.k.progKg).toBe(r1(60 - z.d.weeklyLoss * 3));
    expect(z.k.masaSpodziewanaKg).toBe(r1(60 - z.d.weeklyLoss * 6));
  });
  it('chłopiec z raportu z flagą: liczby raty V (100,4 kg, próg 101,5 kg)', () => {
    const { k } = kontrola({ sex: 'M', ageYears: 15.25, ageMonthsOpt: 3, weightKg: 102.5, heightCm: 186.7 }, 'moderate', true);
    expect([k.tygodnie, k.przyrostKg, k.masaSpodziewanaKg, k.progKg]).toEqual([6, 0, 100.4, 101.5]);
  });
  it('praktycznie zakończone wzrastanie (dziewczyna 17 l.) też bez przyrostu i bez 12 tygodni', () => {
    const P = { sex: 'F', ageYears: 17, weightKg: 90, heightCm: 165 };
    const ol = win.energyChildGrowthOutlook({ ageYears: 17, sex: 'F', heightCm: 165 });
    expect(ol.practicallyEnded).toBe(true);
    const { k } = kontrola(P, 'light');
    expect([k.tygodnie, k.przyrostKg, k.wzrastanie, k.wzrostZakonczony]).toEqual([6, 0, false, true]);
  });
  it('bez wieku, płci i wzrostu silnik niczego nie zgaduje: reguła raty V', () => {
    const k = win.energyKontrolaPlanu({ key: 'light', intake: 2000, gornaKcal: 2000, weeklyLoss: 126 * 7 / 7700, monthlyLossKg: 0.5 }, { weightKg: 45, floorKcal: 1400, dzis: DZIS });
    expect([k.tygodnie, k.przyrostKg, k.masaSpodziewanaKg, k.progKg]).toEqual([6, 0, 44.3, 44.7]);
  });
});

describe('rata W: plan PDF — etykieta spodziewanej masy, nagłówek 12 tygodni, zdanie o ważeniu', () => {
  const okP = wczytajDoOkna(oknoZSilnikiem(), 'vilda_raport_plan.js');
  const kontr = (extra) => ({ tygodnie: 12, terminTekst: '16 grudnia 2026', terminKrotki: '16 XII', terminRok: 2026, masaDzisKg: 45, masaSpodziewanaKg: 44.2, progKg: 44.8, gornaKcal: 2000, obnizkaKcal: [100, 200], obnizkaMozliwa: true, podazPoObnizceKcal: [1800, 1900], przyrostKg: 0.53, wzrastanie: true, ...extra });
  const html = (k) => okP.VildaRaportPlan.html({ patient: { name: 'Testowa Fikcyjna' }, baseResult: { dane: {
    wersja: 1, dorosly: false, strategia: 'reduction', pacjent: { wiekLat: 8, wiekMies: 96, plec: 'F', masaKg: 45, wzrostCm: 130, bmi: 26.6 },
    klasyfikacja: { nadmiar: true, otylosc: true }, energia: { podazZaokrKcal: 2000, gornaGranica: true, deficytKcal: 126, tempoKgTydz: 0.11, dietaNazwa: 'lekka' },
    masa: { docelowaKg: 31.6 }, zdania: {}, punkty: {}, kontrola: k } } });
  it('rosnące dziecko: „KONTROLA ZA 12 TYGODNI”, „z dietą i wzrastaniem (dziś 45,0 kg)”, zdanie o ważeniu', () => {
    const h = html(kontr());
    expect(h).toContain('<span>KONTROLA ZA 12 TYGODNI</span>');
    expect(h).toContain('<b>16 XII</b><span>2026</span><i>termin kontroli (ok. 12 tygodni)</i>');
    expect(h).toContain('<b>ok. 44,2 kg</b><span>spodziewana masa</span><i>z dietą i wzrastaniem (dziś 45,0 kg)</i>');
    expect(h).toContain('<b>≥ 44,8 kg</b><span>odejmij od planu</span><i>100–200 kcal</i>');
    expect(h).toContain('Ważenie: rano, po toalecie, w bieliźnie, na tej samej wadze.');
  });
  it('wzrastanie zakończone: „przy tej diecie”, zdanie o ważeniu zostaje', () => {
    const h = html(kontr({ tygodnie: 6, przyrostKg: 0, wzrastanie: false, wzrostZakonczony: true }));
    expect(h).toContain('<span>KONTROLA ZA 6 TYGODNI</span>');
    expect(h).toContain('<i>przy tej diecie (dziś 45,0 kg)</i>');
    expect(h).not.toContain('wzrastaniem');
    expect(h).toContain('Ważenie: rano, po toalecie, w bieliźnie, na tej samej wadze.');
  });
});
