import { expect, test } from '@playwright/test';

// P-OSTATNI-2b na PRAWDZIWEJ stronie: karta „Porównanie z poprzednim pomiarem" ocenia parę pomiarów
// w tym samym kontekście klinicznym, co Karta pacjenta i odcinki trajektorii — terapia GH z punktów
// monitora (zapisanych w rekordzie i wczytanych z nim) oraz kanał rodzicielski MPH z wzrostów
// rodziców. Do SW 1.0.980 ta sama para dostawała tu werdykt populacyjny. Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Kontekst!26d';

async function wpisz(page, pola) {
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

async function pierwszaWizytaIWczytanie(page, pierwszy, przedZapisem) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
    try { navigator.clipboard.writeText = () => Promise.resolve(); } catch (_) { /* brak schowka */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault.isUnlocked() && typeof window.update === 'function'
    && typeof window.saveUserData === 'function' && Boolean(window.VildaSummaryCards));
  await page.evaluate(() => { const a = document.getElementById('vilda-auth-ui-root'); if (a) a.style.display = 'none'; });
  const baner = page.locator('#consent-decline');
  if (await baner.count() && await baner.isVisible()) await baner.click();
  await page.waitForFunction(() => {
    const pro = document.getElementById('resultsModeToggle');
    if (!pro) return false;
    if (!pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
    return window.professionalMode === true;
  }, { timeout: 15000 });

  await wpisz(page, { firstName: 'Testowy', lastName: 'Fikcyjny-Kontekst', ...pierwszy });
  await przedZapisem(page);
  await page.waitForTimeout(400);
  await expect.poll(() => page.evaluate(async () => Boolean(await window.saveUserData())), { timeout: 15000 }).toBe(true);
  await expect.poll(async () => page.evaluate(async () => (await window.VildaVault.listPatients()).length), { timeout: 15000 }).toBeGreaterThan(0);
  const pid = await page.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);

  // świeża strona: rekord ma nieść kontekst sam (punkty GH, wzrosty rodziców), nie stan okna
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
  await expect(nowy, 'modal „Co chcesz zrobić?" z przyciskiem Nowy pomiar').toBeVisible({ timeout: 10000 });
  await nowy.click();
  await expect(page.locator('#prevSummaryCard')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#weight')).toHaveValue('');
  return pid;
}

const DZIECKO_1 = { sex: 'M', age: '8', ageMonths: '2', weight: '26', height: '126' };
const DZIECKO_2 = { age: '8', ageMonths: '9', weight: '29.5', height: '129' };
const PUNKT_GH = { id: 'gh-e2e-ctx', type: 'start', ageYears: 8, ageMonths: 2, weight: 26, height: 126, dose: 1, doseUnit: 'mg', drug: 'Genotropin', program: 'SNP' };

test('terapia GH z rekordu: po 7 mies. werdykt wzrostu to odpowiedź na GH (jak w Karcie pacjenta), chip „kontekst: GH 7 mies."', async ({ page }) => {
  test.setTimeout(150_000);
  await pierwszaWizytaIWczytanie(page, DZIECKO_1, async (p) => {
    await p.evaluate((pt) => {
      try { window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', [pt], { force: true }); } catch (_) { /* brak modułu */ }
      window.ghTherapyPoints = [pt];
    }, PUNKT_GH);
  });
  // punkty GH wróciły z rekordem (globalna lista po wczytaniu) — to je czyta karta porównania
  await expect.poll(() => page.evaluate(() => Array.isArray(window.ghTherapyPoints) ? window.ghTherapyPoints.length : -1)).toBe(1);
  await wpisz(page, DZIECKO_2);
  const wzrost = page.locator('#prevSummaryCard tr[data-klucz="wzrost"]');
  await expect(wzrost.locator('.pt-zmiana .pt-pill')).toHaveText('słaba odpowiedź na GH — do oceny', { timeout: 10000 });
  await expect(page.locator('#porownanieKontekst')).toBeVisible();
  await expect(page.locator('#porownanieKontekst')).toHaveText('kontekst: GH 7 mies. w odcinku');
  // parytet: ten sam werdykt daje jedna ścieżka silnika z kontekstem zbudowanym z tych samych globali
  const oczek = await page.evaluate(() => {
    const J = window.VildaTrajectoryAnalysis, prev = window.prevMeasurementInfo, teraz = window.getAgeDecimal() * 12;
    const zr = window.patientReportGetPreferredSource ? window.patientReportGetPreferredSource() : 'OLAF';
    const a = J.statFor('HT', prev.heightCm, 'M', prev.ageMonths / 12, zr), b = J.statFor('HT', 129, 'M', teraz / 12, zr);
    const ctx = J.buildClinicalContext({ ghTherapyPoints: window.ghTherapyPoints, obesityTherapyPoints: window.obesityTherapyPoints, sex: 'M', source: zr });
    return { ctx, v: J.pairVerdictInContext('height', { sd: a.sd, c: a.percentile, ageMonths: prev.ageMonths }, { sd: b.sd, c: b.percentile, ageMonths: teraz }, ctx) };
  });
  expect(oczek.ctx.gh).toEqual({ a: 98, b: null });
  expect(oczek.v.ghOn).toBe(true);
  expect(oczek.v.v.l).toBe('słaba odpowiedź na GH — do oceny');
  // bez terapii ta sama para była „stabilnym torem" — kontekst zmienia brzmienie, nie liczby
  const bezCtx = await page.evaluate(() => {
    const J = window.VildaTrajectoryAnalysis, prev = window.prevMeasurementInfo, teraz = window.getAgeDecimal() * 12;
    const zr = window.patientReportGetPreferredSource ? window.patientReportGetPreferredSource() : 'OLAF';
    const a = J.statFor('HT', prev.heightCm, 'M', prev.ageMonths / 12, zr), b = J.statFor('HT', 129, 'M', teraz / 12, zr);
    return J.pairVerdictInContext('height', { sd: a.sd, c: a.percentile, ageMonths: prev.ageMonths }, { sd: b.sd, c: b.percentile, ageMonths: teraz }, null).v.l;
  });
  expect(bezCtx).toBe('stabilny tor wzrastania');
});

test('wzrosty rodziców z rekordu: werdykt wzrostu w kanale rodzicielskim, chip MPH; bez rodziców — brak chipu', async ({ page }) => {
  test.setTimeout(150_000);
  await pierwszaWizytaIWczytanie(page, DZIECKO_1, async (p) => {
    await wpisz(p, { advMotherHeight: '160', advFatherHeight: '170' });
  });
  await expect(page.locator('#advMotherHeight')).toHaveValue('160');
  await wpisz(page, DZIECKO_2);
  const wzrost = page.locator('#prevSummaryCard tr[data-klucz="wzrost"]');
  await expect(wzrost.locator('.pt-zmiana .pt-pill')).toHaveText('w kanale rodzicielskim', { timeout: 10000 });
  await expect(page.locator('#porownanieKontekst')).toHaveText('kontekst: kanał rodzicielski (MPH)');
  // usunięcie wzrostu ojca → kontekst znika, werdykt populacyjny
  await wpisz(page, { advFatherHeight: '' });
  await wpisz(page, { weight: '29.5' });
  await expect(wzrost.locator('.pt-zmiana .pt-pill')).toHaveText('stabilny tor wzrastania');
  await expect(page.locator('#porownanieKontekst')).toBeHidden();
});
