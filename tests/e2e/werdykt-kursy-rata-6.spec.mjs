import { expect, test } from '@playwright/test';

// P-WERDYKT rata 6 (audyt 2 werdyktów, decyzja właściciela 2026-09-27: „zgadzam się z rekomendacjami, koduj”):
// werdykt odpowiedzi na leczenie (GH, redukcja) tylko dla okna w jednym KURSIE i liczony na rok; okno mieszane dostaje
// werdykt populacyjny z dopiskiem „w tym N mies. …”; chip leczenia biegnie do ostatniego pomiaru W KURSIE i po zakończeniu
// kursu nie przejmuje nagłówka. PRAWDZIWA strona (karta Zaawansowane obliczenia wzrostowe → „Analiza trajektorii”, ten sam
// renderer w Karcie pacjenta); punkty monitorów GH/otyłości podane jak po wczytaniu pacjenta (globalne window.ghTherapyPoints /
// window.obesityTherapyPoints — tak czyta je karta zaawansowana i karty podsumowania). Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && !!window.VildaTrajectoryAnalysis && !!window.VildaWerdykt
    && window.VildaWerdykt.version === '7' && window.VildaTrajectoryAnalysis.version === '31' && typeof window.calculateGrowthAdvanced === 'function');
}

// s: { sex, cur: { y, m, w, h }, hist: [[lata, mies, kg, cm], …], gh: [[type, lata, mies], …], red: [[type, lata, mies, lek], …] }
async function karty(page, s) {
  return page.evaluate(async (s) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true;
    document.querySelectorAll('#advMeasurements .measure-row .remove-measure').forEach((b) => b.click());
    set('name', 'Testowy Fikcyjny'); set('sex', s.sex); set('age', s.cur.y); set('ageMonths', s.cur.m); set('weight', s.cur.w); set('height', s.cur.h);
    set('advMotherHeight', ''); set('advFatherHeight', '');
    const pkt = (p) => ({ type: p[0], ageYears: p[1], ageMonths: p[2], drug: p[3] || '' });
    window.ghTherapyPoints = (s.gh || []).map(pkt);
    window.obesityTherapyPoints = (s.red || []).map(pkt);
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
    out.ctx = T.context ? { gh: T.context.gh, red: T.context.red, ghKursy: T.context.ghKursy, redKursy: T.context.redKursy } : null;
    out.model = T.metrics.map((m) => ({
      k: m.metric, total: m.total && m.total.l, naglowek: m.naglowek && m.naglowek.l,
      faza: m.faza ? { od: m.faza.a.ageMonths, gapM: m.faza.gapM, zaKrotka: m.faza.zaKrotka, pokaz: m.faza.pokaz, w: m.faza.verdict && m.faza.verdict.l, wcz: m.faza.wczesniej && m.faza.wczesniej.verdict && m.faza.wczesniej.verdict.l } : null,
      segs: m.segments.map((sg) => ({ a: sg.a.ageMonths, b: sg.b.ageMonths, ghOn: sg.ghOn, rdOn: sg.rdOn, l: sg.verdict && sg.verdict.l })),
      chip: m.treatment ? { a: m.treatment.a.ageMonths, b: m.treatment.b.ageMonths, aktywne: m.treatment.aktywne, l: m.treatment.verdict.l } : null,
      flaga: m.redFlag ? { d: m.redFlag.dSds, wariant: m.redFlag.kontekst && m.redFlag.kontekst.wariant } : null,
    }));
    out.baner = norm((document.querySelector('#advancedGrowthOutput') || document.body).textContent).includes('sprzed leczenia GH');
    return out;
  }, s);
}

test.describe('P-WERDYKT rata 6 — kursy leczenia, okna na rok, chip w kursie', () => {
  test('R6-1: GH 8 → 9 lat (zakończone), potem 3 lata bez GH: odcinek w kursie oceniony jako odpowiedź na GH, całość z dopiskiem, faza od końca kursu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await karty(page, {
      sex: 'M', cur: { y: 12, m: 0, w: 34, h: 136 },
      hist: [[8, 0, 22, 116], [9, 0, 25, 124], [10, 0, 28, 128], [11, 0, 31, 132]],
      gh: [['start', 8, 0], ['continue', 8, 6], ['end', 9, 0]],
    });
    expect(r.ctx.ghKursy).toEqual([{ a: 96, b: 108, label: null }]);
    const h = r.model.find((m) => m.k === 'height');
    expect(h.segs[0]).toMatchObject({ a: 96, b: 108, ghOn: true });
    expect(h.segs[0].l).toMatch(/odpowiedź .*GH|odpowiedź umiarkowana \(GH\)/);
    expect(h.segs[1].ghOn).toBe(false);
    expect(h.segs[1].l).not.toContain('GH');
    // całość 8 → 12 lat: 12 z 48 mies. na GH — werdykt populacyjny z dopiskiem, nie ocena leczenia
    expect(h.total).toMatch(/(—|,) w tym 12 mies\. na GH$/);
    expect(h.total).not.toMatch(/^(dobra|słaba) odpowiedź|^odpowiedź umiarkowana/);
    // faza nie przechodzi przez granicę kursu: zaczyna się na końcu kursu GH
    expect(h.faza).not.toBeNull();
    expect(h.faza.od).toBe(108);
    expect(h.faza.wcz).toMatch(/GH/);
    expect(h.naglowek).not.toContain('GH');
    expect(r.Wzrost.werdykt).toContain('od 9 lat (36 mies.)');
    expect(r.Wzrost.linie[0]).toMatch(/^↳ wcześniej 8 lat → 9 lat: .*GH/);
  });

  test('R6-2: leczenie otyłości 9 → 10 lat (zakończone), potem przyrost: chip zakończony jako linia, nagłówek z fazy', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await karty(page, {
      sex: 'F', cur: { y: 12, m: 0, w: 62, h: 152 },
      hist: [[9, 0, 46, 136], [10, 0, 45, 141], [11, 0, 53, 146.5]],
      red: [['start', 9, 0, 'Saxenda'], ['end', 10, 0, 'Saxenda']],
    });
    expect(r.ctx.redKursy).toEqual([{ a: 108, b: 120, label: 'Saxenda' }]);
    const w = r.model.find((m) => m.k === 'weight');
    expect(w.chip).toMatchObject({ a: 108, b: 120, aktywne: false });
    expect(w.chip.l).toMatch(/^redukcja/);
    expect(w.naglowek).not.toBe(w.chip.l);
    expect(w.total).toMatch(/(—|,) w tym 12 mies\. leczenia redukcyjnego$/);
    expect(r.Waga.linie.some((l) => l.startsWith('↳ okres leczenia (9 lat → 10 lat, zakończone): ΔSDS'))).toBe(true);
    expect(r.Waga.werdykt).not.toMatch(/^redukcja|mimo leczenia/);
    const b = r.model.find((m) => m.k === 'bmi');
    expect(b.chip).toMatchObject({ a: 108, b: 120, aktywne: false });
    expect(r.BMI.linie.some((l) => l.includes('zakończone'))).toBe(true);
  });

  test('R6-3: aktywne leczenie otyłości od 10 lat bez ruchu masy przez 12 mies.: chip „brak istotnej odpowiedzi” jako nagłówek', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await karty(page, {
      sex: 'M', cur: { y: 11, m: 0, w: 49.5, h: 145 },
      hist: [[9, 0, 40, 134], [10, 0, 45, 140]],
      red: [['start', 10, 0, 'Wegovy']],
    });
    const w = r.model.find((m) => m.k === 'weight');
    expect(w.chip).toMatchObject({ a: 120, b: 132, aktywne: true });
    expect(w.chip.l).toBe('brak istotnej odpowiedzi na leczenie — po 12 mies.');
    expect(w.naglowek).toBe(w.chip.l);
    expect(r.Waga.werdykt).toBe('brak istotnej odpowiedzi na leczenie — po 12 mies.');
    expect(r.Waga.pasek).toBe('cw');
    expect(r.Waga.linie[0]).toBe('↳ okres leczenia (od 10 lat): ΔSDS ' + r.Waga.linie[0].split('ΔSDS ')[1].split(' —')[0] + ' — brak istotnej odpowiedzi na leczenie — po 12 mies.');
    // odcinek sprzed leczenia (9 → 10 lat) nie dostaje etykiety leczenia
    expect(w.segs[0].rdOn).toBe(false);
    expect(w.segs[0].l).not.toContain('leczenia');
  });
});
