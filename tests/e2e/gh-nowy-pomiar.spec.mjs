import { expect, test } from '../support/test-czas.mjs';

// P-GH-NOWY-POMIAR (2026-10-01). Typowa wizyta: lekarz wpisuje bieżący pomiar i robi z niego punkt terapii GH,
// zapisuje pacjenta, a na następnej wizycie wczytuje go i wybiera „Nowy pomiar”.
//
// ZMIERZONE przed zmianą (`audyt` f254852): „Nowy pomiar” przenosił bieżący pomiar wizyty 1 do historii karty
// zaawansowanej jako wiersz RĘCZNY. Mostek chował wtedy wiersz punktu (reguła „wiersz ręczny wygrywa”), więc
// pomiar 13 l. 1 mies. / 139,9 cm wyglądał jak ręczny i dawał się poprawiać bez blokady P-GH-BLOKADA; poprawka
// (140,4) nie wracała do punktu, a po F5 karta pokazywała dwa pomiary z tego samego wieku. Zapis trzymał ten
// pomiar dwa razy (advanced.data.measurements i ghTherapyPoints).
//
// REGUŁA: pomiar, z którego powstał punkt (ten sam miesiąc, wzrost i masa ±0,11 jak w mostku), nie jest dopisywany
// do historii karty jako nowy wiersz ręczny; w historii jest wiersz punktu. Inne pomiary — jak dotąd.
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhNowyPomiar!26';
const PUNKT = {
  id: 'gh-e2e-nowy', type: 'start', ageYears: 13, ageMonths: 1, height: 139.9, weight: 45,
  dose: 0.033, doseUnit: 'mg/kg/d', doseAbs: 1.49, drug: 'Omnitrope 5 mg', program: 'SNP',
};

function ustawPola(page, pola) {
  return page.evaluate((p) => {
    Object.entries(p).forEach(([id, v]) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (typeof window.update === 'function') window.update();
  }, pola);
}

const wiersze = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#advMeasurements .measure-row'))
  .map((r) => ({
    wiek: `${r.querySelector('.adv-age-years')?.value}/${r.querySelector('.adv-age-months')?.value}`,
    h: r.querySelector('.adv-height')?.value,
    gh: !!r.getAttribute('data-gh-id'),
    blok: !!r.querySelector('.adv-height')?.disabled,
  }))
  .filter((r) => r.h));
const lustra = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#intakeMeasurements .measure-row-intake'))
  .filter((r) => r.dataset.locked !== 'true')
  .map((r) => ({
    wiek: `${r.querySelector('.intake-ageY')?.value}/${r.querySelector('.intake-ageM')?.value}`,
    h: r.querySelector('.intake-ht')?.value,
    gh: !!r.getAttribute('data-gh-id'),
  }))
  .filter((r) => r.h));

async function wizytaPierwsza(page, punkty) {
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
  await page.waitForFunction(() => Boolean(window.VildaProAccess));
  // Fikstura bada historię pomiarów w trybie profesjonalnym. Samo usunięcie
  // disabled z przycisku nie włącza tego trybu: kolejna aktualizacja dostępu
  // ponownie ukrywa formularz, powodując wyścig jeszcze przed pomiarem GH.
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const tryb = document.getElementById('resultsModeToggle');
    if (!tryb.checked) {
      tryb.checked = true;
      tryb.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await expect(page.locator('#resultsModeToggle')).toBeChecked();

  await page.fill('#lastName', 'Probna');
  await page.fill('#firstName', 'Alicja');
  await ustawPola(page, { age: '13', ageMonths: '1', sex: 'F', height: '139.9', weight: '45' });
  await page.waitForSelector('#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]', { state: 'attached' });
  await expect(page.locator('#toggleAdvancedGrowth')).toBeEnabled();
  if (!await page.locator('#advancedGrowthForm').isVisible()) await page.locator('#toggleAdvancedGrowth').click();
  await expect(page.locator('#advancedGrowthForm')).toBeVisible({ timeout: 10000 });
  await page.waitForSelector('#advMeasurements .measure-row', { state: 'attached', timeout: 10000 });
  await page.evaluate(() => {
    const w = document.querySelector('#advMeasurements .measure-row');
    const set = (sel, v) => {
      const e = w.querySelector(sel);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('.adv-age-years', '11'); set('.adv-age-months', '0'); set('.adv-height', '123.9'); set('.adv-weight', '35');
    window.calculateGrowthAdvanced();
  });
  // Punkt terapii wchodzi tak, jak wprowadza go monitor leczenia GH.
  await page.evaluate((p) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', p, { force: true });
    window.ghTherapyPoints = p;
  }, punkty);
  await page.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
  await page.locator('#saveDataBtnSidebar').click();
  let pid = null;
  await expect.poll(async () => {
    pid = await page.evaluate(async () => {
      const l = await window.VildaVault.listPatients();
      return Array.isArray(l) && l.length === 1 && l[0] ? l[0].patientId : null;
    });
    return Boolean(pid);
  }, { message: 'sejf ma dokładnie jednego zapisanego pacjenta' }).toBe(true);
  return pid;
}

async function nowyPomiar(page, pid) {
  await page.evaluate(() => window.clearAllData());
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (r) => { if (r) window.applyLoadedData(r); }, null), pid);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
  await page.locator('#vildaLcmNew').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
}

const historiaZapisu = (page, pid) => page.evaluate(async (id) => {
  const p = await window.VildaVault.getPatient(id);
  const pl = p && p.snapshots && p.snapshots[0] && p.snapshots[0].payload;
  return {
    advanced: (pl.advanced.data.measurements || []).map((m) => `${m.ageMonths}m ${m.height}`),
    punkty: (pl.ghTherapyPoints || []).map((q) => `${q.ageYears}/${q.ageMonths} ${q.height}`),
  };
}, pid);

test('A: „Nowy pomiar” po wizycie z punktem z bieżącego pomiaru — w historii jeden wiersz punktu, bez kopii ręcznej, także w zapisie i po F5', async ({ page }) => {
  test.setTimeout(180_000);
  const pid = await wizytaPierwsza(page, [PUNKT]);
  await nowyPomiar(page, pid);

  const historia = [{ wiek: '11/0', h: '123.9', gh: false, blok: false }, { wiek: '13/1', h: '139.9', gh: true, blok: true }];
  await expect.poll(() => wiersze(page), { timeout: 15000 }).toEqual(historia);
  await expect.poll(() => lustra(page), { timeout: 15000 }).toEqual([
    { wiek: '11/0', h: '123.9', gh: false }, { wiek: '13/1', h: '139.9', gh: true },
  ]);

  // Wizyta 2: nowy bieżący pomiar; tempo liczy się z punktu sprzed 6 miesięcy.
  await ustawPola(page, { age: '13', ageMonths: '7', height: '144.7', weight: '47.2' });
  await expect.poll(() => page.evaluate(() => Number(window.advancedGrowthData && window.advancedGrowthData.growthVelocityGapM)), { timeout: 15000 }).toBe(6);
  await page.locator('#saveDataBtnSidebar').click();
  await expect.poll(() => historiaZapisu(page, pid).then((h) => h.advanced), { timeout: 15000 }).toEqual(['132m 123.9']);
  expect((await historiaZapisu(page, pid)).punkty).toEqual(['13/1 139.9']);

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await expect.poll(() => wiersze(page), { timeout: 20000 }).toEqual(historia);
});

test('B: punkt z innym pomiarem w tym samym miesiącu (141,0 cm) — pomiar bieżący trafia do historii jak dotąd, obok wiersza punktu', async ({ page }) => {
  test.setTimeout(180_000);
  const pid = await wizytaPierwsza(page, [{ ...PUNKT, height: 141.0 }]);
  await nowyPomiar(page, pid);
  await expect.poll(() => wiersze(page).then((w) => w.map((r) => `${r.wiek} ${r.h}${r.gh ? ' GH' : ''}`).sort()), { timeout: 15000 })
    .toEqual(['11/0 123.9', '13/1 139.9', '13/1 141 GH']);
});

test('C: bez punktu GH — „Nowy pomiar” przenosi bieżący pomiar do historii jako wiersz ręczny, jak dotąd', async ({ page }) => {
  test.setTimeout(180_000);
  const pid = await wizytaPierwsza(page, []);
  await nowyPomiar(page, pid);
  await expect.poll(() => wiersze(page), { timeout: 15000 }).toEqual([
    { wiek: '11/0', h: '123.9', gh: false, blok: false }, { wiek: '13/1', h: '139.9', gh: false, blok: false },
  ]);
});
