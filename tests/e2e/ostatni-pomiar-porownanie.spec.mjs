import { expect, test } from '@playwright/test';

// P-OSTATNI-1 na PRAWDZIWEJ stronie: karta „Ostatni pomiar" po ścieżce Wczytaj pacjenta → „Co chcesz
// zrobić?" → Nowy pomiar. Sekcja „W porównaniu do poprzedniego pomiaru" ma mówić TYM SAMYM
// zdaniem tempa i TYM SAMYM werdyktem pary, co silniki (VildaTempoWzrastania, VildaTrajectoryAnalysis)
// policzone w tej samej stronie z tych samych liczb — do SW 1.0.978 mówiła „alert" tam, gdzie
// Karta pacjenta mówiła „stabilny tor". Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Ostatni!26b';

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

async function pierwszaWizytaIWczytanie(page) {
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

  // wizyta 1: chłopiec 8 l 2 m, 126 cm / 26 kg
  await wpisz(page, { firstName: 'Testowy', lastName: 'Fikcyjny-Porownanie', sex: 'M', age: '8', ageMonths: '2', weight: '26', height: '126' });
  await page.waitForTimeout(400);
  await expect.poll(() => page.evaluate(async () => Boolean(await window.saveUserData())), { timeout: 15000 }).toBe(true);
  const pid = await expect.poll(async () => page.evaluate(async () => {
    const l = await window.VildaVault.listPatients();
    return l.length ? l[0].patientId : null;
  }), { timeout: 15000 }).not.toBeNull().then(() => page.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId));

  // wczytanie jak z Karty pacjenta (source: 'pick') → modal „Co chcesz zrobić?" → Nowy pomiar
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

// P-OSTATNI-2a: porównanie to tabela (kolumny Dziś / Zmiana) + pasek tempa w karcie „Porównanie z poprzednim pomiarem".
const sekcja = (page) => page.locator('#prevSummaryContent .porownanie-tabela');
const tekstPorownania = async (page) => (await sekcja(page).innerText()) + '\n' + (await page.locator('#porownanieTempo').innerText());

test('po 7 miesiącach: zdanie tempa i werdykty pary są słowo w słowo tym, co liczą silniki', async ({ page }) => {
  test.setTimeout(150_000);
  await pierwszaWizytaIWczytanie(page);
  await wpisz(page, { age: '8', ageMonths: '9', weight: '29.5', height: '129' });
  await expect(sekcja(page)).toBeVisible({ timeout: 10000 });
  const tekst = await tekstPorownania(page);

  // oczekiwania policzone W TEJ SAMEJ STRONIE przez silniki, z tych samych liczb
  const oczek = await page.evaluate(() => {
    const T = window.VildaTempoWzrastania, J = window.VildaTrajectoryAnalysis, B = window.VildaBmi;
    const prev = window.prevMeasurementInfo;
    const teraz = window.getAgeDecimal() * 12;
    const od = T.odcinek({ ageMonths: prev.ageMonths, height: prev.heightCm }, { ageMonths: teraz, height: 129 });
    const tempo = T.formatuj(T.ocenWartosc(od.cmPerYear, teraz - prev.ageMonths, teraz, 'M', { tannerStage: null })).zdanie;
    const zr = window.patientReportGetPreferredSource ? window.patientReportGetPreferredSource() : 'OLAF';
    const st = (p, v, m) => J.statFor(p, v, 'M', m / 12, zr);
    const wa = st('WT', prev.weightKg, prev.ageMonths), wb = st('WT', 29.5, teraz);
    const ha = st('HT', prev.heightCm, prev.ageMonths), hb = st('HT', 129, teraz);
    const ba = B.ocen({ bmi: prev.weightKg / (prev.heightCm / 100) ** 2, plec: 'M', wiekMies: prev.ageMonths, zrodlo: zr, dorosly: false });
    const bb = B.ocen({ bmi: 29.5 / 1.29 ** 2, plec: 'M', wiekMies: teraz, zrodlo: zr, dorosly: false });
    const vW = J.weightBmiOverlayVerdict(J.verdictForPair('weight', wa.sd, wb.sd, wa.percentile, wb.percentile), wb.sd - wa.sd,
      J.verdictForPair('bmi', ba.sds, bb.sds, ba.centyl, bb.centyl), bb.sds - ba.sds);
    return {
      tempo, gap: teraz - prev.ageMonths,
      masa: vW.l, bmi: J.verdictForPair('bmi', ba.sds, bb.sds, ba.centyl, bb.centyl).l,
      wzrost: J.verdictForPair('height', ha.sd, hb.sd, ha.percentile, hb.percentile).l,
    };
  });
  expect(oczek.gap, 'kontrola: odstęp 7 mies.').toBeCloseTo(7, 0);
  expect(oczek.tempo).toContain('5,1 cm/rok');
  expect(tekst).toContain(oczek.tempo);
  expect(tekst).toContain(oczek.masa);
  expect(tekst).toContain(oczek.bmi);
  expect(tekst).toContain(oczek.wzrost);
  // stary model zniknął
  expect(tekst).not.toMatch(/oczekiwanie/);
  expect(tekst).toMatch(/ΔwSDS|ΔbmiSDS|ΔhSDS/);
  // ten przypadek to trzy „stabilne tory" — stary model dawał tu trzy alerty
  expect(oczek.masa).toBe('stabilny tor masy ciała');
  expect(oczek.bmi).toBe('stabilny tor BMI');
  await expect(page.locator('#prevSummaryContent .pt-zmiana .status-alert')).toHaveCount(0);
});

test('kontrola negatywna: po 2 miesiącach tempo jest z oznaczeniem „krótki odstęp" i BEZ oceny normy', async ({ page }) => {
  test.setTimeout(150_000);
  await pierwszaWizytaIWczytanie(page);
  await wpisz(page, { age: '8', ageMonths: '4', weight: '26.8', height: '127' });
  await expect(sekcja(page)).toBeVisible({ timeout: 10000 });
  const tekst = await tekstPorownania(page);
  expect(tekst).toMatch(/Tempo wzrastania: .* cm\/rok \(z 2 mies\., krótki odstęp — bez oceny\)/);
  expect(tekst).not.toMatch(/norma/);
  expect(tekst).not.toMatch(/oczekiwanie/);
});
