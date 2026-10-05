import { expect, test } from '../support/test-czas.mjs';

// P-OTYLOSC-CYKLE rata 4, obszar trajektorii (decyzje właściciela 2026-09-30, D1 i D6: dla otyłości granicą kursu są
// Zakończenie i Włączenie, bez progu przerwy 3 mies.; GH bez zmian). PRAWDZIWE strony: karta „Zaawansowane obliczenia
// wzrostowe” → „Analiza trajektorii”, karta „Porównanie z poprzednim pomiarem” (#porownanieKontekst) i panel
// „Analiza trajektorii” w Karcie pacjenta dziecka. Kursy leczenia otyłości to cykle z vilda_cykle_leczenia.js:
// dziecięcy odpowiednik CY-9 (Saxenda zakończona, po miesiącu Wegovy) daje dwa kursy, a nie jeden „Wegovy od 12 lat”.
// Dane wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#KursyCykle!26r4';
const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP\u20111)', dose: '3,0 mg / dobę' };
const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'Semaglutyd (agonista receptora GLP\u20111)', dose: '2,4 mg / tydz.' };

// Dziewczynka ur. 15.11.2011: wiek w miesiącach i data wizyty idą razem (145 mies. = 12 l. 1 mies. = 15.12.2023).
const DATA = { 145: '2023-12-15', 148: '2024-03-15', 150: '2024-05-15', 152: '2024-07-15', 154: '2024-09-15', 155: '2024-10-15', 156: '2024-11-15', 158: '2025-01-15', 161: '2025-04-15' };
const pkt = (type, mies, lek, kg) => ({
  id: `${type}-${mies}`, type, ageYears: Math.floor(mies / 12), ageMonths: mies % 12, dateISO: DATA[mies],
  weight: kg, height: 150, drug: lek.drug, substance: lek.substance, dose: lek.dose,
});

// Dziecięcy odpowiednik CY-9: cykl 1 Saxenda (W 12 l. 1 mies., K, Z 12 l. 10 mies.), cykl 2 Wegovy od 12 l. 11 mies.
// (przerwa 1 mies. — dotąd < 3 mies. kasowało Zakończenie i oba cykle były jednym kursem).
const CY9_DZIECKO = [
  pkt('start', 145, SAXENDA, 70), pkt('continue', 148, SAXENDA, 69), pkt('end', 154, SAXENDA, 68),
  pkt('start', 155, WEGOVY, 69), pkt('continue', 158, WEGOVY, 67), pkt('continue', 161, WEGOVY, 66),
];
const HIST_CY9 = [[12, 1, 70, 150], [12, 4, 69, 151], [12, 10, 68, 153], [12, 11, 69, 153.5], [13, 2, 67, 155]];
const CUR_CY9 = { y: 13, m: 5, w: 66, h: 156 };

async function otworzStrone(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await gotowa(page);
}

async function gotowa(page) {
  await page.waitForFunction(() => typeof window.update === 'function' && !!window.VildaTrajectoryAnalysis && !!window.VildaWerdykt
    && window.VildaTrajectoryAnalysis.version === '32' && !!window.VildaCykleLeczenia && typeof window.calculateGrowthAdvanced === 'function');
}

// Sejf testowy (wzorzec karta-otylosc-cykle-rata-3.spec.mjs) — dla Karty pacjenta i dla widoku karty na telefonie.
async function otworzZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.VildaCykleLeczenia));
  await gotowa(page);
}

// Karta zaawansowana z historią pomiarów i punktami monitora otyłości (jak karty() z werdykt-kursy-rata-6.spec.mjs,
// punkty z datami wizyt jak w monitorze).
async function kartaZaawansowana(page, s) {
  return page.evaluate(async (s) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true;
    document.querySelectorAll('#advMeasurements .measure-row .remove-measure').forEach((b) => b.click());
    set('name', 'Testowa Fikcyjna'); set('sex', 'F'); set('age', s.cur.y); set('ageMonths', s.cur.m); set('weight', s.cur.w); set('height', s.cur.h);
    set('advMotherHeight', ''); set('advFatherHeight', '');
    window.ghTherapyPoints = [];
    window.obesityTherapyPoints = s.red;
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
    const out = { karty: {} };
    document.querySelectorAll('#advResults .vtap-card').forEach((c) => {
      const nm = norm(c.querySelector('.nm') && c.querySelector('.nm').textContent);
      if (!/^(Waga|BMI)$/.test(nm)) return;
      out.karty[nm] = { werdykt: norm(c.querySelector('.vdt') && c.querySelector('.vdt').textContent), linie: Array.from(c.querySelectorAll('.vtap-seg')).map((x) => norm(x.textContent)) };
    });
    out.zetony = Array.from(document.querySelectorAll('#advResults .vtap-meta .vtap-mchip'))
      .filter((x) => norm(x.querySelector('.k') && x.querySelector('.k').textContent) === '⬇ redukcja')
      .map((x) => norm(Array.from(x.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')));
    const T = window.advancedGrowthTrajectory;
    out.redKursy = T.context ? T.context.redKursy : null;
    const w = T.metrics.find((m) => m.metric === 'weight');
    out.chip = w && w.treatment ? { a: w.treatment.a.ageMonths, b: w.treatment.b.ageMonths, kursOd: w.treatment.kursOd, kursow: w.treatment.kursow, aktywne: w.treatment.aktywne } : null;
    out.total = w && w.total ? w.total.l : null;
    return out;
  }, s);
}

// Pola formularza strony głównej (wzorzec porownanie-rata-7.spec.mjs).
async function wpiszPola(page, pola) {
  await page.evaluate((p) => {
    Object.keys(p).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) throw new Error('brak pola ' + id);
      el.value = p[id];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (typeof window.update === 'function') window.update();
  }, pola);
}

// Karta pacjenta dziecka: dwa cykle z przerwą 6 mies. (Z 12 l. 6 mies. → W 13 l.), w przerwie masa rośnie.
const KARTA_PUNKTY = [
  pkt('start', 145, SAXENDA, 70), pkt('continue', 148, SAXENDA, 68), pkt('end', 150, SAXENDA, 67),
  pkt('start', 156, WEGOVY, 73), pkt('continue', 158, WEGOVY, 70), pkt('continue', 161, WEGOVY, 68),
];
const KARTA_POMIARY = [[145, 150, 70], [148, 151, 68], [150, 152, 67], [153, 153, 70.5], [156, 154, 73], [158, 155, 70]]
  .map(([m, h, w]) => ({ ageMonths: m, ageYears: m / 12, height: h, weight: w }));

async function kartaPacjentaDziecka(page, imie) {
  const pid = await page.evaluate(async (d) => {
    const wynik = await window.VildaVault.savePatient({
      name: `Testowa ${d.imie}`,
      user: { lastName: 'Testowa', firstName: d.imie, sex: 'K', age: 13, ageMonths: 5, height: 156, weight: 68 },
      growthBasic: { data: { measurements: d.pomiary } },
      obesityTherapyPoints: d.punkty,
    }, { dedup: false });
    return wynik.patientId;
  }, { imie, pomiary: KARTA_POMIARY, punkty: KARTA_PUNKTY });
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), pid);
  await page.locator('.vilda-patient-tab[data-tab="traj"]').click();
  const panel = page.locator('.vilda-patient-tab-content[data-tab="traj"] .vtap').first();
  await expect(panel).toBeAttached({ timeout: 15000 });
  return panel.evaluate((el) => {
    const norm = (t) => String(t || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      zetony: Array.from(el.querySelectorAll('.vtap-meta .vtap-mchip'))
        .filter((x) => norm(x.querySelector('.k') && x.querySelector('.k').textContent) === '⬇ redukcja')
        .map((x) => norm(Array.from(x.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(''))),
      odcinki: Array.from(el.querySelectorAll('.vtap-tb tbody tr')).map((tr) => Array.from(tr.children).map((td) => norm(td.textContent))),
      tekst: norm(el.textContent),
    };
  });
}

test.describe('P-OTYLOSC-CYKLE rata 4 — kursy otyłości z cykli w analizie trajektorii i kartach porównania', () => {
  test('karta zaawansowana: dziecięcy CY-9 — dwa żetony kursów, chip okresu leczenia od drugiego kursu, całość z dopiskiem', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzStrone(page);
    const r = await kartaZaawansowana(page, { cur: CUR_CY9, hist: HIST_CY9, red: CY9_DZIECKO });
    expect(r.redKursy).toEqual([{ a: 145, b: 154, label: 'Saxenda' }, { a: 155, b: null, label: 'Wegovy' }]);
    // dotąd jeden żeton „Wegovy · od 12 lat 1 mies. — nadal”
    expect(r.zetony).toEqual(['Saxenda · od 12 lat 1 mies. do 12 lat 10 mies.', 'Wegovy · od 12 lat 11 mies. — nadal']);
    expect(r.chip).toEqual({ a: 155, b: 161, kursOd: 155, kursow: 2, aktywne: true });
    expect(r.karty.Waga.linie.some((l) => l.startsWith('↳ okres leczenia (od 12 lat 11 mies.): ΔSDS'))).toBe(true);
    // okno 12 l. 1 mies. → 13 l. 5 mies. obejmuje dwa kursy: werdykt populacyjny z dopiskiem (9 + 6 mies. leczenia)
    expect(r.total).toMatch(/ w tym 15 mies\. leczenia redukcyjnego$/);
  });

  test('telefon (390 px): pasek meta z dwoma żetonami kursów bez poziomego przewijania', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await otworzZKontem(page);
    await page.evaluate((c) => {
      document.getElementById('age').value = String(c.y);
      document.getElementById('sex').value = 'F';
      document.getElementById('height').value = String(c.h);
      document.getElementById('weight').value = String(c.w);
      if (typeof window.update === 'function') window.update();
    }, CUR_CY9);
    // Karta podpina przycisk leniwie (jak zaawansowane-wzrostowe-uklad-mobile.spec.mjs); bramkę trybu pomijamy.
    await page.waitForSelector('#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]', { state: 'attached' });
    await page.evaluate(() => { const t = document.getElementById('toggleAdvancedGrowth'); if (t) { t.disabled = false; t.click(); } });
    await expect(page.locator('#advancedGrowthForm')).toBeVisible();
    const r = await kartaZaawansowana(page, { cur: CUR_CY9, hist: HIST_CY9, red: CY9_DZIECKO });
    expect(r.zetony).toHaveLength(2);
    const meta = page.locator('#advResults .vtap-meta').first();
    await expect(meta).toBeVisible();
    await meta.scrollIntoViewIfNeeded();
    const pomiar = await page.evaluate(() => {
      const zetony = Array.from(document.querySelectorAll('#advResults .vtap-meta .vtap-mchip'));
      return {
        przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        prawo: Math.max(...zetony.map((z) => z.getBoundingClientRect().right)),
        // .vtap ucina zawartość (overflow:hidden) — żeton dłuższy niż pasek byłby ucięty, a nie przewijany
        prawoPaska: document.querySelector('#advResults .vtap-meta').getBoundingClientRect().right,
        szerokoscOkna: window.innerWidth,
      };
    });
    expect(pomiar.przewijanie).toBeLessThanOrEqual(0);
    expect(pomiar.prawo).toBeLessThanOrEqual(pomiar.prawoPaska);
    expect(pomiar.prawoPaska).toBeLessThanOrEqual(pomiar.szerokoscOkna);
  });

  test('Karta pacjenta dziecka: panel „Analiza trajektorii” liczy dwa kursy — odcinek w przerwie między cyklami nie jest „mimo leczenia redukcyjnego”', async ({ page }) => {
    test.setTimeout(150_000);
    await otworzZKontem(page);
    const r = await kartaPacjentaDziecka(page, 'Kursy-Karta');
    // dotąd panel dostawał samą kopertę: jeden żeton „Wegovy · od 12 lat 1 mies. — nadal”, przerwa liczona jako leczenie
    expect(r.zetony).toEqual(['Saxenda · od 12 lat 1 mies. do 12 lat 6 mies.', 'Wegovy · od 13 lat — nadal']);
    const wiersz = (param, odcinek) => r.odcinki.find((x) => x[0] === param && x[1].replace(/ ⬇$/, '') === odcinek);
    for (const param of ['Waga', 'BMI']) {
      for (const odcinek of ['12 lat 6 mies. → 12 lat 9 mies.', '12 lat 9 mies. → 13 lat']) {
        const w = wiersz(param, odcinek);
        expect(w, `${param} ${odcinek}`).toBeTruthy();
        expect(w[1], `${param} ${odcinek}: odcinek w przerwie bez znacznika leczenia`).toBe(odcinek);
        expect(w[4]).not.toContain('leczenia');
      }
    }
    // odcinki w kursach zostają odcinkami leczenia
    expect(wiersz('Waga', '12 lat 1 mies. → 12 lat 4 mies.')[1]).toBe('12 lat 1 mies. → 12 lat 4 mies. ⬇');
    expect(wiersz('Waga', '13 lat 2 mies. → 13 lat 5 mies.')[1]).toBe('13 lat 2 mies. → 13 lat 5 mies. ⬇');
    expect(r.tekst).not.toContain('mimo leczenia redukcyjnego');
    // chip okresu leczenia liczy bieżący (drugi) kurs, nie „od 12 lat 1 mies.”
    expect(r.tekst).toContain('↳ okres leczenia (od 13 lat): ΔSDS');
    expect(r.tekst).not.toContain('↳ okres leczenia (od 12 lat 1 mies.)');
  });

  test('karta „Porównanie z poprzednim pomiarem”: kontekst leczenia liczony w kursie bieżącego cyklu (9 mies.), nie od Zakończenia poprzedniego (11 mies.)', async ({ page }) => {
    test.setTimeout(150_000);
    await otworzZKontem(page);
    await page.evaluate(() => { const a = document.getElementById('vilda-auth-ui-root'); if (a) a.style.display = 'none'; });
    const baner = page.locator('#consent-decline');
    if (await baner.count() && await baner.isVisible()) await baner.click();
    await page.waitForFunction(() => {
      const pro = document.getElementById('resultsModeToggle');
      if (!pro) return false;
      if (!pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
      return window.professionalMode === true && Boolean(window.VildaSummaryCards) && typeof window.saveUserData === 'function';
    }, { timeout: 15000 });
    // Pierwsza wizyta 12 l. 6 mies. (dzień Zakończenia Saxendy); Wegovy od 12 l. 8 mies. (przerwa 2 mies. — dotąd < 3 mies.
    // sklejało oba cykle w jeden kurs od 12 l. 1 mies.).
    await wpiszPola(page, { firstName: 'Testowa', lastName: 'Fikcyjna-Kursy', sex: 'F', age: '12', ageMonths: '6', weight: '67', height: '152' });
    const punkty = [
      pkt('start', 145, SAXENDA, 70), pkt('continue', 148, SAXENDA, 68), pkt('end', 150, SAXENDA, 67),
      pkt('start', 152, WEGOVY, 68),
      pkt('continue', 158, WEGOVY, 66),
    ];
    await page.evaluate((pts) => {
      try { window.VildaPersistence.writeModuleJSON('OBESITY_THERAPY_POINTS', pts, { force: true }); } catch (_) { /* brak modułu */ }
      window.obesityTherapyPoints = pts;
    }, punkty);
    await page.waitForTimeout(400);
    await expect.poll(() => page.evaluate(async () => Boolean(await window.saveUserData())), { timeout: 15000 }).toBe(true);
    await expect.poll(async () => page.evaluate(async () => (await window.VildaVault.listPatients()).length), { timeout: 15000 }).toBeGreaterThan(0);
    const pid = await page.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked() && typeof window.applyLoadedData === 'function');
    await page.evaluate(() => { const a = document.getElementById('vilda-auth-ui-root'); if (a) a.style.display = 'none'; });
    await page.evaluate(async (id) => {
      const p = await window.VildaVault.getPatient(id);
      const snap = p.snapshots[0];
      window.applyLoadedData(snap.payload);
      document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
        detail: { patientId: id, savedAtISO: snap.savedAtISO || null, snapshotCount: p.snapshotCount || 1, source: 'pick' },
      }));
    }, pid);
    await page.waitForFunction(() => typeof window._vildaCurrentPatientId === 'string');
    const nowy = page.getByRole('button', { name: 'Nowy pomiar' }).first();
    await expect(nowy).toBeVisible({ timeout: 10000 });
    await nowy.click();
    await expect(page.locator('#prevSummaryCard')).toBeVisible({ timeout: 10000 });
    await expect.poll(() => page.evaluate(() => (Array.isArray(window.obesityTherapyPoints) ? window.obesityTherapyPoints.length : -1))).toBe(5);

    await wpiszPola(page, { age: '13', ageMonths: '5', weight: '64', height: '156' });
    await expect(page.locator('#porownanieKontekst')).toHaveText('kontekst: leczenie otyłości (Wegovy) — 9 mies. w odcinku', { timeout: 10000 });
  });
});
