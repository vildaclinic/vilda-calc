import { expect, test } from '@playwright/test';

// P-DIETA-STAB rata 3 (decyzje właściciela 2026-09-29) — PRAWDZIWA strona index.html, dane FIKCYJNE:
//  • nastolatek z NADWAGĄ 10–18 lat: REE wg Molnára 1995 i domyślny PAL 1,4 (jak przy otyłości);
//  • kategoria nadwaga/otyłość (a przez nią strategia domyślna) z siatki wybranej w karcie „Centyle i BMI” —
//    z-score klasy diety = bmiSDS z „Podsumowania wyników” (Kopiuj podsumowanie, tryb PRO) dla OLAF, WHO i Palczewskiej.
test.use({ serviceWorkers: 'block' });

async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__schowek = t; return Promise.resolve(); } }, configurable: true });
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.buildDietEnergyRecommendationResult === 'function'
    && !!window.VildaBmi && !!window.VildaReeRownania);
  await page.waitForTimeout(800);
}

async function pacjent(page, zrodlo) {
  return page.evaluate(async (zr) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const pro = document.getElementById('resultsModeToggle');
    if (pro && !pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
    window.intakeHistory = null; window.lastLoadedData = null; window.hasUserModifiedAfterLoad = false;
    window.__vildaPlanPalTouched = false; window.__vildaPlanPalDefault = null; window.__vildaDietStrategyTouched = false;
    set('name', 'Testowy Fikcyjny'); set('sex', 'M'); set('age', 13); set('ageMonths', 0); set('weight', 76); set('height', 168); set('customGoalKg', '');
    /* Radio źródła ustawiane jak w aplikacji (zaznaczenie + change, na które app.js przepina bmiSource) — jak w bmi-jedna-liczba. */
    const r = document.getElementById({ OLAF: 'sourceOlaf', WHO: 'sourceWho', PALCZEWSKA: 'sourcePalczewska' }[zr]);
    r.disabled = false; r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof window.ensureDietRecommendationsElements === 'function') window.ensureDietRecommendationsElements();
    window.update();
    await new Promise((res) => { setTimeout(res, 700); });
    const br = window.buildDietEnergyRecommendationResult();
    const d = (br && br.dane) || {};
    const kl = d.klasyfikacja && d.klasyfikacja.klasaBmi;
    window.__schowek = '';
    document.getElementById('metabolicSummaryBtn').click();
    const zazn = document.querySelector('input[name="dataSource"]:checked');
    return {
      zrodloRadio: zazn ? zazn.value : null,
      bmiSource: window.bmiSource,
      klasa: kl ? { source: kl.source, z: kl.z, obese: kl.obese, overweight: kl.overweight } : null,
      strategia: d.strategia || null,
      ree: d.energia && d.energia.reeRownanie ? d.energia.reeRownanie.id : null,
      pal: d.energia ? d.energia.palUzyty : null,
      palDomyslny: d.energia ? d.energia.palDomyslny : null,
      palFormularz: Number((document.getElementById('palFactor') || {}).value),
    };
  }, zrodlo);
}

test('P3-1: chłopiec 13 l., 76 kg / 168 cm — klasa diety z siatki karty „Centyle i BMI”, bmiSDS = „Podsumowanie wyników”; Molnár i PAL 1,4 w każdej siatce', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const wyniki = {};
  for (const zr of ['OLAF', 'WHO', 'PALCZEWSKA']) {
    const r = await pacjent(page, zr);
    await page.waitForFunction(() => typeof window.__schowek === 'string' && window.__schowek.includes('bmiSDS'));
    r.schowek = await page.evaluate(() => window.__schowek);
    const m = /BMI: [^\n]*\(bmiSDS ([−+]?\d,\d\d)\)/.exec(r.schowek);
    r.sdsPodsumowania = m ? m[1] : null;
    r.sdsDiety = await page.evaluate((z) => window.VildaBmi.fmtSds(z), r.klasa && r.klasa.z);
    wyniki[zr] = r;
  }
  for (const zr of ['OLAF', 'WHO', 'PALCZEWSKA']) {
    const r = wyniki[zr];
    expect(r.zrodloRadio, zr).toBe(zr);
    expect(r.klasa.source, `${zr}: klasa diety liczona z wybranej siatki`).toBe(zr);
    expect(r.sdsPodsumowania, `${zr}: bmiSDS w podsumowaniu`).not.toBeNull();
    expect(r.sdsDiety, `${zr}: z-score klasy diety = bmiSDS „Podsumowania wyników”`).toBe(r.sdsPodsumowania);
    expect(r.ree, `${zr}: REE Molnára (nadwaga i otyłość 10–18 lat)`).toBe('MOLNAR_1995');
    expect([r.pal, r.palDomyslny], `${zr}: domyślny PAL 1,4 w zaleceniach`).toEqual([1.4, true]);
    expect(r.palFormularz, `${zr}: ta sama wartość w selekcie PAL`).toBe(1.4);
  }
  expect(wyniki.OLAF.sdsPodsumowania).toBe('+1,78'); // 13 l. 0 mies. (w zgłoszeniu +1,77 — wiek z miesiącami)
  expect([wyniki.OLAF.klasa.overweight, wyniki.OLAF.klasa.obese]).toEqual([true, false]);
  expect([wyniki.WHO.klasa.obese, wyniki.PALCZEWSKA.klasa.obese]).toEqual([true, true]);
  expect([wyniki.OLAF.strategia, wyniki.WHO.strategia, wyniki.PALCZEWSKA.strategia]).toEqual(['stabilization', 'reduction', 'reduction']);
});

test('P3-2: ten sam chłopiec (OLAF, stabilizacja) — zalecenia: ≤ 2500 kcal zamiast ok. 3100', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await pacjent(page, 'OLAF');
  const r = await page.evaluate(() => {
    const br = window.buildDietEnergyRecommendationResult();
    const norm = (s) => String(s || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    return { podaz: br.dane.energia.podazZaokrKcal, gorna: br.dane.energia.gornaGranica, tekst: norm(br.textOutput) };
  });
  expect(r.podaz).toBe(2500);
  expect(r.gorna).toBe(true);
  expect(r.tekst).toContain('nie powinna przekraczać 2500 kcal dziennie');
  expect(r.tekst).not.toMatch(/3 ?[01]\d\d kcal/);
});
