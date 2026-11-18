import { expect, test } from '../support/test-czas.mjs';

// P-OTYLOSC-DZIENNIK (etap 3 projektu „Leczenie otyłości — wpisy poza wizytą”; decyzje właściciela 2026-11-17/18):
// monitor DocPro wczytanego pacjenta pracuje na dzienniku leczenia — wpis z masą od pacjenta dopisany w Karcie widać
// w monitorze (ze źródłem), a dodanie, poprawka i usunięcie punktu w monitorze zapisują od razu wersję wpisu
// w dzienniku (źródło „gabinet”). Dane pacjentów wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block', chwila: '2026-11-18T12:00:00Z' });

const HASLO = 'E2e#DziennikMonitor!26';
const WEGOVY = 'Wegovy (semaglutyd) – s.c. 1×/tydz.';
const P = (id, type, dateISO, mies, weight, height, dose = '2,4 mg / tydz.') => ({
  id, type, dateISO, ageYears: 13, ageMonths: mies, weight, height,
  bmi: height > 0 ? +(weight / Math.pow(height / 100, 2)).toFixed(1) : null, drug: WEGOVY, substance: '', dose,
});
const MIGAWKA = [P('p-start', 'start', '2026-04-14', 0, 80, 160, '0,25 mg / tydz.'), P('p-paz', 'continue', '2026-10-13', 6, 75.2, 162.9)];

async function docpro(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('pwzNumber', '0000000');
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked() && Boolean(window.VildaProAccess)
    && typeof window.obesityAddTherapyPoint === 'function' && Boolean(window.VildaDziennikOtylosci));
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const tryb = document.getElementById('resultsModeToggle');
    if (tryb && !tryb.checked) { tryb.checked = true; tryb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(1200);
  const potwierdzam = page.locator('#professionalConfirmBtn');
  if (await potwierdzam.isVisible()) await potwierdzam.click();
  const bezAnalityki = page.getByRole('button', { name: 'Nie zgadzam się', exact: true });
  if (await bezAnalityki.isVisible()) await bezAnalityki.click();
}

async function pacjentka(page) {
  return page.evaluate(async (pts) => (await window.VildaVault.savePatient({
    name: 'Testowa Zuzanna',
    user: { lastName: 'Testowa', firstName: 'Zuzanna', sex: 'F', age: 13, ageMonths: 6, height: 162.9, weight: 75.2, dobISO: '2013-04-11' },
    obesityTherapyPoints: pts,
  }, { dedup: false })).patientId, MIGAWKA);
}

/** Wpis „od pacjenta” zapisany w dzienniku tak, jak robi to okno „+ Kontynuacja” w Karcie. */
async function wpisOdPacjenta(page, pid, dane) {
  await page.evaluate(async ({ id, d }) => {
    const D = window.VildaDziennikOtylosci;
    const migawka = (await window.VildaVault.getPatient(id)).snapshots[0].payload.obesityTherapyPoints;
    const plan = D.planNowego(await D.wczytaj(id, migawka), id, d);
    await D.zapisz(id, plan.wersje);
  }, { id: pid, d: dane });
}

async function wczytaj(page, pid) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (rekord) => { if (rekord) window.applyLoadedData(rekord); }, null), pid);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
  await page.locator('#vildaLcmRestore').click();
  await page.waitForSelector('#vildaLoadChoiceModal', { state: 'detached', timeout: 10000 }).catch(() => {});
  await page.waitForFunction((id) => window._vildaCurrentPatientId === id, pid);
  await page.evaluate(() => {
    const karta = document.getElementById('obesityCard');
    if (!karta || karta.style.display === 'none' || !karta.style.display) document.getElementById('toggleObesityTherapy').click();
    document.getElementById('obesityTabMonBtn').click();
  });
  await expect(page.locator('#obesityMonitorSection')).toBeVisible({ timeout: 10000 });
}

const punkty = (page) => page.evaluate(() => (window.obesityTherapyPoints || []).map((p) => [p.type, p.dateISO, p.weight, p.weightSource || null]));
const notatkiDziennika = (page, pid) => page.evaluate(async (id) => (await window.VildaVault.listPatientNotesForPatient(id))
  .filter((n) => n.category === 'leczenie-otylosci').map((n) => n.title).sort(), pid);
const przycisk = (page, nazwa) => page.locator('#obesityMonitorSection .obm-visit button', { hasText: nazwa });
const komunikat = (page) => page.locator('#obesityTherapyActionMsg');

test.describe('monitor DocPro na dzienniku leczenia', () => {
  test('DZM-1: wpis od pacjenta z Karty widać w monitorze; Kontynuacja z monitora zapisuje się w dzienniku jako „gabinet”', async ({ page }) => {
    test.setTimeout(150_000);
    await docpro(page);
    const pid = await pacjentka(page);
    await wpisOdPacjenta(page, pid, { type: 'continue', dateISO: '2026-11-10', ageYears: 13, ageMonths: 6, weight: 74.6, weightSource: 'pacjent', drug: WEGOVY, dose: '2,4 mg / tydz.' });
    await wczytaj(page, pid);
    await expect.poll(() => punkty(page), { timeout: 10000 }).toEqual([
      ['start', '2026-04-14', 80, 'gabinet'], ['continue', '2026-10-13', 75.2, 'gabinet'], ['continue', '2026-11-10', 74.6, 'pacjent'],
    ]);
    await expect(page.locator('#obesityTherapyTableWrap tr', { hasText: '10.11.2026' })).toContainText('74,6 (pacjent)');

    await page.evaluate(() => {
      const set = (id, v) => { const e = document.getElementById(id); e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); };
      set('obesityAge', 13); set('obesityAgeMonths', 7); set('obesityWeight', '74,3'); set('obesityHeight', '163,4'); set('obesityDose', '2,4 mg / tydz.'); set('obesityDate', '2026-11-17');
    });
    await przycisk(page, 'Kontynuacja leczenia').click();
    await expect(komunikat(page)).toHaveText('Zapisano w dzienniku leczenia — wpis widać w Karcie pacjenta i na innych urządzeniach.');
    expect(await notatkiDziennika(page, pid)).toEqual([
      'Leczenie otyłości — Kontynuacja 10.11.2026', 'Leczenie otyłości — Kontynuacja 13.10.2026',
      'Leczenie otyłości — Kontynuacja 17.11.2026', 'Leczenie otyłości — Włączenie 14.04.2026',
    ]);
    const lista = await punkty(page);
    expect(lista[3]).toEqual(['continue', '2026-11-17', 74.3, 'gabinet']);
    // Projekcja: identyfikatory punktów monitora to identyfikatory wpisów dziennika.
    const zgodne = await page.evaluate(async (id) => {
      const D = window.VildaDziennikOtylosci;
      const s = D.zloz(await window.VildaVault.listPatientNotesForPatient(id), []);
      return (window.obesityTherapyPoints || []).every((p) => s.wpisy.some((x) => x.entryId === p.id));
    }, pid);
    expect(zgodne).toBe(true);
  });

  test('DZM-2: usunięcie punktu w monitorze to wersja „usunięty” w dzienniku (do cofnięcia w Karcie)', async ({ page }) => {
    test.setTimeout(150_000);
    await docpro(page);
    const pid = await pacjentka(page);
    await wczytaj(page, pid);
    await expect.poll(() => punkty(page)).toHaveLength(2);
    const id = await page.evaluate(() => String(window.obesityTherapyPoints.find((p) => p.dateISO === '2026-10-13').id));
    page.once('dialog', (d) => d.accept());
    await page.locator(`#obesityTherapyTableWrap button.obm-del[data-id="${id}"]`).click();
    await expect(komunikat(page)).toHaveText('Zapisano w dzienniku leczenia — wpis widać w Karcie pacjenta i na innych urządzeniach.');
    expect(await notatkiDziennika(page, pid)).toEqual([
      'Leczenie otyłości — Kontynuacja 13.10.2026', 'Leczenie otyłości — Kontynuacja 13.10.2026 (usunięty)', 'Leczenie otyłości — Włączenie 14.04.2026',
    ]);
    expect(await punkty(page)).toEqual([['start', '2026-04-14', 80, 'gabinet']]);
  });
});
