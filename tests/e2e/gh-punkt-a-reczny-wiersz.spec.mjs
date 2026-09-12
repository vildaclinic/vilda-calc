import { expect, test } from '../support/test-czas.mjs';

// GROWTH-HV-UI10 — ręczny wiersz w karcie zaawansowanej i identyczny punkt terapii GH
// pokazywały się podwójnie (2026-09-11, zgłoszenie właściciela).
//
// Scenariusz właściciela: najpierw historyczne pomiary wpisane ręcznie w „Zaawansowanych
// obliczeniach wzrostowych", potem te same pomiary wpisane wstecznie jako punkty terapii
// w monitorze GH (docpro). Po wczytaniu pacjenta każdy pomiar widniał dwa razy — raz jako
// wiersz ręczny, raz jako kopia punktu terapii. Usunięcie kopii i zapis nic nie dawało:
// zapis celowo nie przechowuje wierszy z terapii (GROWTH-HV-UI6), a mostek importu
// dokładał je z powrotem przy każdym wczytaniu.
//
// Przyczyna: mostek importTherapyPointsToAdvancedGrowth dopasowywał punkt terapii tylko do
// wierszy już oznaczonych jako pochodzące z terapii — wiersz ręczny o tym samym wieku
// i tych samych pomiarach był dla niego niewidzialny, więc zawsze dokładał drugi.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhDubel!26aa';

const wiersze = (page) => page.evaluate(() => Array.from(
  document.querySelectorAll('#advMeasurements .measure-row'),
).map((r) => ({
  y: r.querySelector('.adv-age-years')?.value,
  m: r.querySelector('.adv-age-months')?.value,
  h: r.querySelector('.adv-height')?.value,
  w: r.querySelector('.adv-weight')?.value,
  gh: r.getAttribute('data-gh-sync') === 'true',
})));

async function otworzZPacjentka(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));

  // Dane fikcyjne: dziewczynka 14 lat, 148,5 cm, 50,5 kg.
  await page.fill('#lastName', 'Probna');
  await page.fill('#firstName', 'Zofia');
  await page.evaluate(() => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '14'); set('ageMonths', '0'); set('sex', 'F');
    set('height', '148.5'); set('weight', '50.5');
    if (window.update) window.update();
  });
  await page.waitForSelector(
    '#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]',
    { state: 'attached' },
  );
  await page.evaluate(() => {
    const t = document.getElementById('toggleAdvancedGrowth');
    const f = document.getElementById('advancedGrowthForm');
    if (f && getComputedStyle(f).display !== 'none') return;
    if (t) { t.disabled = false; t.click(); }
  });
  await page.waitForSelector('#advMeasurements .measure-row', { state: 'attached', timeout: 10000 });

  // Ręczny wiersz historyczny: 13 lat 1 mies., 139,9 cm, 45 kg.
  await page.evaluate(() => {
    const w = document.querySelector('#advMeasurements .measure-row');
    const s = (q, v) => {
      const e = w.querySelector(q);
      if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    s('.adv-age-years', '13'); s('.adv-age-months', '1');
    s('.adv-height', '139.9'); s('.adv-weight', '45');
    window.calculateGrowthAdvanced();
  });
}

async function wpiszPunktyTerapii(page, punkty) {
  await page.evaluate((p) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', p, { force: true });
    window.ghTherapyPoints = p;
  }, punkty);
  await page.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
}

async function zapiszWczytajOdtworz(page) {
  await page.locator('#saveDataBtnSidebar').click();
  await page.waitForFunction(async () => (await window.VildaVault.listPatients()).length === 1);
  const pid = await page.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);
  await page.evaluate(() => window.clearAllData());
  await page.evaluate(
    (id) => window.VildaAuthUI.showPatientCard(id, (r) => { if (r) window.applyLoadedData(r); }, null),
    pid,
  );
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
  await page.locator('#vildaLcmRestore').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  // Po odtworzeniu karta zaawansowana bywa zwinięta — wiersze są w DOM, ale niewidoczne.
  await page.waitForSelector('#advMeasurements .measure-row', { state: 'attached' });
}

const RECZNY = { y: '13', m: '1', h: '139.9', w: '45', gh: false };

test('identyczny punkt terapii nie dubluje ręcznego wiersza — ani od razu, ani po wczytaniu', async ({ page }) => {
  await otworzZPacjentka(page);
  expect(await wiersze(page)).toEqual([RECZNY]);

  // Ten sam pomiar wpisany wstecznie w monitorze terapii GH (z minimalną różnicą
  // zaokrąglenia wzrostu: 140,0 zamiast 139,9 — nadal ten sam pomiar).
  await wpiszPunktyTerapii(page, [
    { id: 'gh-1', ageYears: 13, ageMonths: 1, height: 140, weight: 45, type: 'gh' },
  ]);
  await expect.poll(() => wiersze(page)).toEqual([RECZNY]);

  // Zapis → wczytanie → „Odtwórz zapis”: nadal jeden wiersz.
  await zapiszWczytajOdtworz(page);
  await expect.poll(() => wiersze(page), { timeout: 10_000 }).toEqual([RECZNY]);
});

test('punkt terapii z innej wizyty nadal dochodzi obok ręcznego wiersza (kontrola)', async ({ page }) => {
  await otworzZPacjentka(page);
  await wpiszPunktyTerapii(page, [
    { id: 'gh-1', ageYears: 13, ageMonths: 1, height: 139.9, weight: 45, type: 'gh' },
    { id: 'gh-2', ageYears: 13, ageMonths: 7, height: 144.2, weight: 47.5, type: 'gh' },
  ]);
  await expect.poll(() => wiersze(page)).toEqual([
    RECZNY,
    { y: '13', m: '7', h: '144.2', w: '47.5', gh: true },
  ]);

  await zapiszWczytajOdtworz(page);
  await expect.poll(() => wiersze(page), { timeout: 10_000 }).toEqual([
    RECZNY,
    { y: '13', m: '7', h: '144.2', w: '47.5', gh: true },
  ]);
});

test('inny pomiar w tym samym wieku to osobny punkt, nie dubel', async ({ page }) => {
  await otworzZPacjentka(page);
  // Ten sam wiek, ale wzrost różni się o 1,5 cm — to nie jest ten sam pomiar.
  await wpiszPunktyTerapii(page, [
    { id: 'gh-1', ageYears: 13, ageMonths: 1, height: 141.4, weight: 45, type: 'gh' },
  ]);
  await expect.poll(() => wiersze(page)).toEqual([
    RECZNY,
    { y: '13', m: '1', h: '141.4', w: '45', gh: true },
  ]);
});
