import { expect, test } from '../support/test-czas.mjs';

// P-TRAJEKTORIA-DZIENNIK (decyzja właściciela 2026-11-19: „trajektoria i karta zbiorcza z dziennika”). Kursy leczenia
// otyłości w analizie trajektorii liczą się z dziennika leczenia, nie z samego zapisu ostatniej wizyty. Różnica jest
// wtedy, gdy dziennik wyprzedza zapis wizyty — tu: Zakończenie zapisane w dzienniku (tak, jak robi to monitor DocPro
// od razu przy dodaniu punktu), a zapis wizyty jeszcze go nie ma.
//   TR-1 Karta pacjenta dziecka, panel „Analiza trajektorii”: żeton kursu „Wegovy · od 12 lat 8 mies. do 13 lat 3 mies.”
//        zamiast „— nadal”; kontrola — ten sam pacjent bez wpisu w dzienniku: „— nadal”.
//   TR-2 karta „Porównanie z poprzednim pomiarem” na Start: odcinek 12 l. 6 mies. → 13 l. 5 mies. tylko częściowo w kursie
//        (Wegovy 12 l. 8 mies. → Zakończenie z dziennika 13 l. 3 mies.) — wiersze „— w tym 7 mies. leczenia redukcyjnego”
//        i bez paska „kontekst:”; z zapisu wizyty (kurs aktywny) było „kontekst: leczenie otyłości (Wegovy) — 9 mies.
//        w odcinku” (kursy-otylosci-cykle.spec.mjs, ten sam przypadek bez dziennika).
// Dane wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#TrajektoriaDziennik!26';
const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP‑1)', dose: '3,0 mg / dobę' };
const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'Semaglutyd (agonista receptora GLP‑1)', dose: '2,4 mg / tydz.' };

// Dziewczynka ur. 15.11.2011: wiek w miesiącach i data wizyty idą razem.
const DATA = { 145: '2023-12-15', 148: '2024-03-15', 150: '2024-05-15', 152: '2024-07-15', 156: '2024-11-15', 158: '2025-01-15', 159: '2025-02-15', 161: '2025-04-15' };
const pkt = (type, mies, lek, kg) => ({
  id: `${type}-${mies}`, type, ageYears: Math.floor(mies / 12), ageMonths: mies % 12, dateISO: DATA[mies],
  weight: kg, height: 150, drug: lek.drug, substance: lek.substance, dose: lek.dose,
});

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
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.VildaCykleLeczenia) && Boolean(window.VildaDziennikOtylosci)
    && typeof window.update === 'function' && Boolean(window.VildaTrajectoryAnalysis) && typeof window.calculateGrowthAdvanced === 'function');
}

/** Zakończenie Wegovy w dzienniku (jak monitor DocPro przy dodaniu punktu); zapis wizyty bez zmian. */
async function zakonczenieWDzienniku(page, pid, mies, kg) {
  await page.evaluate(async ({ id, d }) => {
    const D = window.VildaDziennikOtylosci;
    const p = await window.VildaVault.getPatient(id);
    const migawka = p.snapshots[0].payload.obesityTherapyPoints || [];
    const plan = D.planNowego(await D.wczytaj(id, migawka), id, d);
    if (!plan.ok) throw new Error('plan: ' + JSON.stringify(plan.bledy));
    await D.zapisz(id, plan.wersje);
  }, { id: pid, d: { type: 'end', dateISO: DATA[mies], ageYears: Math.floor(mies / 12), ageMonths: mies % 12, weight: kg, weightSource: 'gabinet', height: 155, heightSource: 'gabinet', ...WEGOVY } });
}

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

const KARTA_PUNKTY = [
  pkt('start', 145, SAXENDA, 70), pkt('continue', 148, SAXENDA, 68), pkt('end', 150, SAXENDA, 67),
  pkt('start', 152, WEGOVY, 73), pkt('continue', 156, WEGOVY, 70), pkt('continue', 158, WEGOVY, 68),
];
const KARTA_POMIARY = [[145, 150, 70], [148, 151, 68], [150, 152, 67], [152, 153, 73], [156, 154, 70], [158, 155, 68]]
  .map(([m, h, w]) => ({ ageMonths: m, ageYears: m / 12, height: h, weight: w }));

async function zetonyKursow(page, pid) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), pid);
  await page.locator('.vilda-patient-tab[data-tab="traj"]').click();
  const panel = page.locator('.vilda-patient-tab-content[data-tab="traj"] .vtap').first();
  await expect(panel).toBeAttached({ timeout: 15000 });
  return panel.evaluate((el) => {
    const norm = (t) => String(t || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    return Array.from(el.querySelectorAll('.vtap-meta .vtap-mchip'))
      .filter((x) => norm(x.querySelector('.k') && x.querySelector('.k').textContent) === '⬇ redukcja')
      .map((x) => norm(Array.from(x.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')));
  });
}

test.describe('P-TRAJEKTORIA-DZIENNIK — kursy leczenia otyłości w analizie trajektorii z dziennika', () => {
  test('TR-1: Karta pacjenta — żeton kursu kończy się na Zakończeniu z dziennika; bez wpisu „— nadal”', async ({ page }) => {
    test.setTimeout(150_000);
    await otworzZKontem(page);
    const [zDziennikiem, bez] = await page.evaluate(async (d) => {
      const zapisz = async (imie) => (await window.VildaVault.savePatient({
        name: `Testowa ${imie}`,
        user: { lastName: 'Testowa', firstName: imie, sex: 'K', age: 13, ageMonths: 5, height: 156, weight: 66 },
        growthBasic: { data: { measurements: d.pomiary } },
        obesityTherapyPoints: d.punkty,
      }, { dedup: false })).patientId;
      return [await zapisz('Dziennik-Tr'), await zapisz('Bez-Dziennika-Tr')];
    }, { pomiary: KARTA_POMIARY, punkty: KARTA_PUNKTY });
    await zakonczenieWDzienniku(page, zDziennikiem, 159, 67);

    expect(await zetonyKursow(page, bez)).toEqual(['Saxenda · od 12 lat 1 mies. do 12 lat 6 mies.', 'Wegovy · od 12 lat 8 mies. — nadal']);
    await page.keyboard.press('Escape');
    expect(await zetonyKursow(page, zDziennikiem)).toEqual(['Saxenda · od 12 lat 1 mies. do 12 lat 6 mies.', 'Wegovy · od 12 lat 8 mies. do 13 lat 3 mies.']);
  });

  test('TR-2: Start, „Porównanie z poprzednim pomiarem” — leczenie do Zakończenia z dziennika: „w tym 7 mies.”, nie „kontekst … 9 mies.”', async ({ page }) => {
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
    // Pierwsza wizyta 12 l. 6 mies.; Wegovy od 12 l. 8 mies., w zapisie wizyty aktywne.
    await wpiszPola(page, { firstName: 'Testowa', lastName: 'Fikcyjna-Trajektoria', sex: 'F', age: '12', ageMonths: '6', weight: '67', height: '152' });
    const punkty = [
      pkt('start', 145, SAXENDA, 70), pkt('continue', 148, SAXENDA, 68), pkt('end', 150, SAXENDA, 67),
      pkt('start', 152, WEGOVY, 68), pkt('continue', 158, WEGOVY, 66),
    ];
    await page.evaluate((pts) => {
      try { window.VildaPersistence.writeModuleJSON('OBESITY_THERAPY_POINTS', pts, { force: true }); } catch (_) { /* brak modułu */ }
      window.obesityTherapyPoints = pts;
    }, punkty);
    await page.waitForTimeout(400);
    await expect.poll(() => page.evaluate(async () => Boolean(await window.saveUserData())), { timeout: 15000 }).toBe(true);
    await expect.poll(async () => page.evaluate(async () => (await window.VildaVault.listPatients()).length), { timeout: 15000 }).toBeGreaterThan(0);
    const pid = await page.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);
    // Zakończenie Wegovy 13 l. 3 mies. — w dzienniku, nie w zapisie wizyty.
    await zakonczenieWDzienniku(page, pid, 159, 65.5);

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
    // Formularz wizyty zostaje przy zapisie wizyty (5 punktów) — dziennik go nie zmienia.
    await expect.poll(() => page.evaluate(() => (Array.isArray(window.obesityTherapyPoints) ? window.obesityTherapyPoints.length : -1))).toBe(5);
    await expect.poll(() => page.evaluate(() => {
      const p = window.VildaDziennikOtylosci.punktyWczytanego();
      return p ? p.map((x) => x.type).join(',') : null;
    }), { timeout: 10000 }).toBe('start,continue,end,start,continue,end');

    await wpiszPola(page, { age: '13', ageMonths: '5', weight: '64', height: '156' });
    const karta = page.locator('#prevSummaryCard');
    for (const param of ['Waga', 'BMI']) {
      await expect(karta.getByRole('row', { name: new RegExp('^' + param + ' ') }), param)
        .toContainText('w tym 7 mies. leczenia redukcyjnego', { timeout: 10000 });
    }
    await expect(page.locator('#porownanieKontekst'), 'odcinek nie jest cały w kursie — bez paska kontekstu').toBeHidden();
    await expect(karta).not.toContainText('9 mies. w odcinku');
  });
});
