import { expect, test } from '@playwright/test';

// P-WERDYKT rata 5 (decyzja właściciela 2026-09-27, po makiecie): nagłówek werdyktu wiersza w „Analizie trajektorii”
// (karta Zaawansowane obliczenia wzrostowe; ten sam renderer w Karcie pacjenta) to OSTATNIA FAZA obserwacji, z prefiksem
// „od <wiek> (N mies.)” i ΔSDS fazy, a wcześniejszy okres dostaje linię „↳ wcześniej …”. Gałęzie poziomu nadwagi: masa
// „stabilna” przy BMI ≥85c / Cole ≥110 % i BMI stabilne w paśmie 85.–97. centyla ostrzegają. PRAWDZIWA strona, historia
// wpisywana przyciskiem karty zaawansowanej. Dane FIKCYJNE (scenariusze syntetyczne).

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && !!window.VildaTrajectoryAnalysis && !!window.VildaWerdykt
    && window.VildaWerdykt.version === '7' && typeof window.calculateGrowthAdvanced === 'function');
}

// s: { sex, mama, tata, cur: { y, m, w, h }, hist: [[lata, mies, kg, cm], …] }
async function karty(page, s) {
  return page.evaluate(async (s) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true;
    document.querySelectorAll('#advMeasurements .measure-row .remove-measure').forEach((b) => b.click());
    set('name', 'Testowy Fikcyjny'); set('sex', s.sex); set('age', s.cur.y); set('ageMonths', s.cur.m); set('weight', s.cur.w); set('height', s.cur.h);
    set('advMotherHeight', s.mama == null ? '' : s.mama); set('advFatherHeight', s.tata == null ? '' : s.tata);
    for (const p of s.hist) {
      document.getElementById('advAddMeasurementBtn').click();
      const rows = document.querySelectorAll('#advMeasurements .measure-row');
      const w = rows[rows.length - 1];
      const wp = (sel, v) => { const el = w.querySelector(sel); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
      wp('.adv-age-years', p[0]); wp('.adv-age-months', p[1]); wp('.adv-height', p[3]); wp('.adv-weight', p[2]);
    }
    window.calculateGrowthAdvanced();
    window.update();
    await new Promise((r) => { setTimeout(r, 900); });
    const norm = (t) => String(t || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    const out = {};
    document.querySelectorAll('.vtap-card').forEach((c) => {
      const nm = norm(c.querySelector('.nm') && c.querySelector('.nm').textContent);
      if (!/^(Wzrost|Waga|BMI)$/.test(nm)) return;
      out[nm] = { pasek: (c.className.match(/\bc[bwgs]\b/) || [])[0], werdykt: norm(c.querySelector('.vdt') && c.querySelector('.vdt').textContent), linie: Array.from(c.querySelectorAll('.vtap-seg')).map((x) => norm(x.textContent)) };
    });
    const T = window.advancedGrowthTrajectory;
    out.model = T.metrics.map((m) => ({ k: m.metric, total: m.total && m.total.l, naglowek: m.naglowek && m.naglowek.l, faza: m.faza ? { od: m.faza.a.ageMonths, gapM: m.faza.gapM, zaKrotka: m.faza.zaKrotka, pokaz: m.faza.pokaz } : null }));
    out.flaga = !!(T.metrics[0] && T.metrics[0].redFlag);
    return out;
  }, s);
}

test.describe('P-WERDYKT rata 5 — ostatnia faza jako nagłówek werdyktu, poziom nadwagi', () => {
  test('R5-1: dziewczynka 13,3 → 16 l.: catch-up od 15 lat 3 mies. w nagłówku, wcześniej <3c; masa i BMI z poziomem nadwagi', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await karty(page, { sex: 'F', mama: 158, tata: 170, cur: { y: 16, m: 0, w: 60, h: 150 }, hist: [[13, 4, 44, 139.5], [14, 0, 45, 141], [14, 9, 50, 144], [15, 3, 54, 145.2], [15, 6, 55.5, 146.2]] });
    expect(r.Wzrost.werdykt).toBe('od 15 lat 3 mies. (9 mies.): nadrabia względem kanału rodzicielskiego (ΔSDS +0,70)');
    expect(r.Wzrost.pasek).toBe('cg'); // ton z fazy, nie z całości
    expect(r.Wzrost.linie[0]).toBe('↳ wcześniej 13 lat 4 mies. → 15 lat 3 mies.: tor stabilny, ale poniżej 3. centyla — niedobór wzrostu (<1c → <1c, ΔSDS +0,13)');
    expect(r.Wzrost.linie[1]).toMatch(/^↳ najpoważniejszy odcinek: 13 lat 4 mies. → 14 lat \(ΔSDS −0,20\)/);
    expect(r.Waga.werdykt).toBe('od 14 lat (24 mies.): istotne przesunięcie centylowe w górę (ΔSDS +1,34)');
    expect(r.Waga.linie[0]).toBe('↳ wcześniej 13 lat 4 mies. → 14 lat: tor masy ciała stabilny, ale wskaźnik Cole\'a sięga 110% (28c → 22c, ΔSDS −0,21)');
    // gałąź poziomu: odcinek masy +0,42 (poniżej progu ruchu) przy BMI ≥85c ostrzega zamiast „stabilnego toru”
    expect(r.Waga.linie[1]).toBe('↳ najpoważniejszy odcinek: 15 lat 6 mies. → 16 lat (ΔSDS +0,42) — tor masy ciała stabilny, ale BMI w paśmie nadwagi (≥85c)');
    expect(r.BMI.werdykt).toBe('od 14 lat (24 mies.): istotne przesunięcie centylowe w górę (ΔSDS +0,73)');
    expect(r.BMI.linie[0]).toBe('↳ wcześniej 13 lat 4 mies. → 14 lat: stabilny tor BMI (85c → 83c, ΔSDS −0,08)');
    const wz = r.model.find((m) => m.k === 'height');
    expect(wz.total).toBe('nadrabia względem kanału rodzicielskiego');
    expect(wz.faza).toMatchObject({ od: 183, gapM: 9, zaKrotka: false, pokaz: true });
  });

  test('R5-2: jednostajny spadek (8 → 11 l.) — bez fazy, nagłówek jak dotąd, flaga w dół; masa bez nieinformatywnego podziału', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await karty(page, { sex: 'M', cur: { y: 11, m: 0, w: 32, h: 136 }, hist: [[8, 0, 25, 128.5], [9, 0, 27, 132], [10, 0, 29.5, 134.5]] });
    expect(r.Wzrost.werdykt).toBe('istotna deceleracja wzrastania');
    expect(r.Wzrost.pasek).toBe('cb');
    expect(r.Wzrost.linie).toEqual([]);
    expect(r.flaga).toBe(true);
    expect(r.model.find((m) => m.k === 'height').faza).toBeNull();
    // masa: faza od 10 lat istnieje, ale wszędzie „stabilny tor masy ciała” → bez prefiksu i bez linii
    expect(r.Waga.werdykt).toBe('stabilny tor masy ciała');
    expect(r.Waga.linie).toEqual([]);
    expect(r.model.find((m) => m.k === 'weight').faza).toMatchObject({ od: 120, gapM: 12, pokaz: false });
    expect(r.BMI.werdykt).toBe('od 9 lat (24 mies.): BMI rośnie szybciej niż wzrastanie — do obserwacji (ΔSDS +0,47)');
    expect(r.BMI.linie[0]).toBe('↳ wcześniej 8 lat → 9 lat: stabilny tor BMI (29c → 28c, ΔSDS −0,01)');
  });

  test('R5-3: 75c → 25c do 10 l., potem stabilnie — całość „istotna deceleracja”, BMI z fazą od 9 lat', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await karty(page, { sex: 'M', cur: { y: 12, m: 0, w: 38, h: 145.5 }, hist: [[7, 0, 24, 125.5], [8, 0, 26, 130.5], [9, 0, 28, 134.5], [10, 0, 30.5, 137.5], [11, 0, 34, 141.5]] });
    // wzrost spada w każdym odcinku (klasy −,−,−,−,−) → faza = całość, nagłówek bez zmian
    expect(r.Wzrost.werdykt).toBe('istotna deceleracja wzrastania');
    expect(r.model.find((m) => m.k === 'height').faza).toBeNull();
    expect(r.BMI.werdykt).toBe('od 9 lat (36 mies.): istotne przesunięcie centylowe w górę (ΔSDS +0,53)');
    expect(r.BMI.linie[0]).toBe('↳ wcześniej 7 lat → 9 lat: stabilny tor BMI (38c → 28c, ΔSDS −0,27)');
    const b = r.model.find((m) => m.k === 'bmi');
    expect(b.total).toBe('stabilny tor BMI'); // całość milczała — faza ją prostuje
    expect(b.naglowek).toBe('istotne przesunięcie centylowe w górę');
  });
});
