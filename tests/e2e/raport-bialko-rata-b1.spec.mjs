import { expect, test } from '@playwright/test';

// P-NORMY rata B1 (decyzje właściciela 2026-09-24): norma białka w g/d liczona od MASY NALEŻNEJ — dziecko: mediana BMI
// dla wieku i płci × wzrost², dorosły: BMI 22 (Normy żywienia 2024: białko w g/kg należnej masy ciała; RDA dorosłych
// 0,83 g/kg, tabele 10–11). Karta „Normy żywieniowe” i „Raport po wizycie” pokazują TĘ SAMĄ liczbę; wiersz raportu to
// „ok. X g/d”, a podstawa w podpisie pod etykietą (bez wzoru „× … kg (masa referencyjna) ≈”). PRAWDZIWA strona, dane FIKCYJNE.

const NB = ' ';

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.patientReportBuildModel === 'function'
    && typeof window.nutritionNormsBuildCardModel === 'function' && typeof window.energyChildMedianBmi === 'function');
}

async function policz(page, s) {
  return page.evaluate(async (s) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    window.professionalMode = true; window.intakeHistory = null; window.lastLoadedData = null; window.hasUserModifiedAfterLoad = false;
    set('name', 'Testowy Fikcyjny'); set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h); set('customGoalKg', '');
    if (typeof window.ensureDietRecommendationsElements === 'function') window.ensureDietRecommendationsElements();
    window.update();
    await new Promise((r) => { setTimeout(r, 400); });
    const wiek = s.age + (s.months || 0) / 12;
    const m = window.patientReportBuildModel();
    const wiersz = m.nutritionCard.rows.find((r) => r.label === 'Białko');
    const nm = window.nutritionNormsBuildCardModel({ ageYears: wiek, ageMonthsOpt: s.months || 0, sex: s.sex, weightKg: s.w, heightCm: s.h, mainPal: null }, {});
    const med = s.age < 18 ? window.energyChildMedianBmi(s.sex, wiek, s.months || 0) : null;
    const html = window.patientReportBuildHtml(m);
    const host = document.createElement('div');
    window.vildaAppSetTrustedHtml(host, html, 'app:host');
    const tr = [...host.querySelectorAll('.patient-report-bmr-table--energy tr')].find((t) => (t.querySelector('td') || {}).textContent && t.querySelector('td').textContent.startsWith('Białko'));
    return {
      wiersz, med, rdaGKg: nm.protein.targets.rda_g_per_kg, refKg: nm.protein.targets.referenceWeightKg,
      karta: { gDzien: nm.protein.main.rdaGDay, masa: nm.protein.main.basisWeightKg, label: nm.protein.basisLabel, kind: nm.protein.basisKind },
      td: tr ? [...tr.querySelectorAll('td')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()) : null,
      detailEl: !!(tr && tr.querySelector('.patient-report-bmr-row-detail')),
    };
  }, s);
}

test.describe('P-NORMY rata B1 — białko od masy należnej, wiersz raportu bez wzoru', () => {
  test('RB1-1: dziewczynka 8 lat 5 mies., 122 cm, 25,8 kg — masa należna do wzrostu, ok. 22 g/d, ta sama liczba w karcie norm', async ({ page }) => {
    await otworz(page);
    const r = await policz(page, { age: 8, months: 5, sex: 'F', w: 25.8, h: 122 });
    const nalezna = r.med * 1.22 ** 2;
    expect(r.rdaGKg).toBe(0.92); // Normy 2024, tab. 9 (dziewczęta 8 lat)
    expect(r.karta.kind).toBe('nalezna'); expect(r.karta.label).toBe('masa należna do wzrostu');
    expect(r.karta.masa).toBeCloseTo(nalezna, 6);
    expect(Math.abs(r.karta.masa - r.refKg)).toBeGreaterThan(2); // niska dziewczynka: nie masa typowa dla wieku (26,6 kg)
    expect(r.wiersz.valueText).toBe(`ok.${NB}${Math.round(0.92 * nalezna)}${NB}g/d`);
    expect(r.wiersz.valueText).toBe(`ok.${NB}${Math.round(r.karta.gDzien)}${NB}g/d`); // jedna liczba z kartą „Normy żywieniowe”
    expect(r.wiersz.detail).toBe(`0,92${NB}g na kg należnej masy ciała (${nalezna.toFixed(1).replace('.', ',')}${NB}kg)`);
    expect(r.detailEl).toBe(true);
    expect(r.td[0]).toMatch(/^Białko\s*0,92\s*g na kg należnej masy ciała/);
    expect(r.td.join(' ')).not.toMatch(/×|≈|referencyjn/);
  });

  test('RB1-2: chłopiec 15 lat 3 mies., 186,7 cm, 102,5 kg — masa należna do wzrostu (nie aktualna, nie typowa dla wieku)', async ({ page }) => {
    await otworz(page);
    const r = await policz(page, { age: 15, months: 3, sex: 'M', w: 102.5, h: 186.7 });
    const nalezna = r.med * 1.867 ** 2;
    expect(r.rdaGKg).toBe(0.88);
    expect(r.karta.masa).toBeCloseTo(nalezna, 6);
    expect(r.wiersz.valueText).toBe(`ok.${NB}${Math.round(0.88 * nalezna)}${NB}g/d`);
    expect(Math.round(0.88 * nalezna)).toBeLessThan(Math.round(0.88 * 102.5));
  });

  test('RB1-3: kobieta 45 lat, 165 cm, 70 kg (nadwaga) — 0,83 g/kg × masa przy BMI 22 = ok. 50 g/d, jak w karcie norm; bez „BMI 22” w dokumencie', async ({ page }) => {
    await otworz(page);
    const r = await policz(page, { age: 45, months: 0, sex: 'F', w: 70, h: 165 });
    expect(r.rdaGKg).toBe(0.83); // Normy 2024, tab. 11
    expect(r.karta.kind).toBe('bmi22');
    expect(r.karta.masa).toBeCloseTo(22 * 1.65 ** 2, 6);
    expect(r.wiersz.valueText).toBe(`ok.${NB}50${NB}g/d`);
    expect(r.wiersz.detail).toBe(`0,83${NB}g na kg należnej masy ciała (59,9${NB}kg)`);
    expect(r.td.join(' ')).not.toMatch(/BMI 22|×|≈/);
  });
});
