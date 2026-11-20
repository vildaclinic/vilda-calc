import { expect, test } from '../support/test-czas.mjs';

// P-OTYLOSC-SIATKI (temat C projektu „Leczenie otyłości — wpisy poza wizytą”; decyzje właściciela 2026-11-19:
// analiza trajektorii także z masą od pacjenta — wariant B; wpis z gabinetu jak wizyta; romb w „Porównaj 2 pomiary”;
// na razie Karta pacjenta). Karta dziecka na PRAWDZIWEJ stronie:
//   SI-1 siatka wagi: masy od pacjenta — romby, wpis z gabinetu — kółko jak wizyta, bieżący pomiar raz; legenda;
//        analiza trajektorii z żetonem „w tym N od pacjenta” i podpisem karty wagi;
//   SI-2 dymek przy rombie: masa z odznaką „pacjent”;
//   SI-3 „Porównaj 2 pomiary”: wizyta (A) i romb (B) — panel podpisuje punkt B;
//   SI-4 wpis dopisany w „Wpisy leczenia” jest od razu na siatce i w analizie (bez ponownego otwarcia karty);
//   SI-5 pacjent bez dziennika — jak dotąd; telefon bez poziomego przewijania.
// Dane pacjentów wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block', chwila: '2026-11-18T12:00:00Z' });

const HASLO = 'E2e#OtyloscSiatki!26';
const W = 'Wegovy (semaglutyd) – s.c. 1×/tydz.';
const MIGAWKA = [
  { id: 'p-start', type: 'start', dateISO: '2026-04-14', ageYears: 13, ageMonths: 0, weight: 80, height: 160, drug: W, substance: '', dose: '0,25 mg / tydz.' },
  { id: 'p-paz', type: 'continue', dateISO: '2026-10-13', ageYears: 13, ageMonths: 6, weight: 75.2, height: 162.9, drug: W, substance: '', dose: '2,4 mg / tydz.' },
];
const POMIARY = [{ ageMonths: 132, height: 150.2, weight: 63.0 }, { ageMonths: 144, height: 155.0, weight: 70.5 }, { ageMonths: 156, height: 160.0, weight: 80.0 }];
const WPISY = [
  { dateISO: '2026-07-10', ageMonths: 3, weight: 77.8, weightSource: 'pacjent' },
  { dateISO: '2026-08-12', ageMonths: 4, weight: 76.9, weightSource: 'pacjent' },
  { dateISO: '2026-09-11', ageMonths: 5, weight: 76.0, weightSource: 'gabinet' },
];

async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.VildaDziennikOtylosci) && Boolean(window.VildaTrajectoryAnalysis));
}

async function pacjentka(page, wpisy) {
  return page.evaluate(async ({ migawka, pomiary, wpisy: lista, lek }) => {
    const r = await window.VildaVault.savePatient({
      name: 'Testowa Zuzanna',
      user: { lastName: 'Testowa', firstName: 'Zuzanna', sex: 'F', age: 13, ageMonths: 6, height: 162.9, weight: 75.2, dobISO: '2013-04-11', measuredAtISO: '2026-10-13' },
      advanced: { data: { measurements: pomiary } },
      obesityTherapyPoints: migawka,
    }, { dedup: false });
    const D = window.VildaDziennikOtylosci;
    for (const w of lista) {
      const stan = await D.wczytaj(r.patientId, migawka);
      const plan = D.planNowego(stan, r.patientId, { type: 'continue', dateISO: w.dateISO, ageYears: 13, ageMonths: w.ageMonths, weight: w.weight, weightSource: w.weightSource, height: null, drug: lek, substance: '', dose: '2,4 mg / tydz.' });
      await D.zapisz(r.patientId, plan.wersje);
    }
    return r.patientId;
  }, { migawka: MIGAWKA, pomiary: POMIARY, wpisy, lek: W });
}

async function siatki(page, pid) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), pid);
  // P-KARTA-LECZENIE (etap 1): bloki leczenia stoją w zakładce „Leczenie” (druga, po „Status”).
  await page.locator('.vilda-patient-tab[data-tab="leczenie"]').click();
  await expect(page.locator('.vdo')).toBeVisible({ timeout: 15000 });
  await page.locator('.vilda-patient-tab[data-tab="traj"]').click();
  await expect(page.locator('.vilda-siatka-charts svg.vilda-patient-chart').first()).toBeVisible();
}

/** Punkty siatek: [wiek w mies., wartość, źródło] z _vildaScale (to samo, co czyta dymek i porównanie). */
const punkty = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.vilda-siatka-charts svg')]
  .filter((s) => s._vildaScale).map((s) => {
    const c = s._vildaScale;
    const wiek = (x) => c.ageStart + (x - c.padL) / (c.W - c.padL - c.padR) * (c.ageEnd - c.ageStart);
    return [c.metric, c.pts.map((p) => [Math.round(wiek(p.x)), +p.val.toFixed(1), p.zr])];
  })));

/** Środek punktu nr `k` siatki `metryka` w pikselach okna — po przewinięciu siatki do widoku (przewijanie bywa płynne). */
async function srodek(page, metryka, k) {
  const pozycja = () => page.evaluate(({ metryka: m, k: n }) => {
    const s = [...document.querySelectorAll('.vilda-siatka-charts svg')].find((x) => x._vildaScale && x._vildaScale.metric === m);
    // Współrzędne punktu w układzie viewBox → piksele okna (siatka skaluje się z zachowaniem proporcji).
    const c = s._vildaScale, p = c.pts[n], q = s.createSVGPoint();
    q.x = p.x; q.y = c.toY(p.val);
    const e = q.matrixTransform(s.getScreenCTM());
    return { x: e.x, y: e.y, h: innerHeight };
  }, { metryka, k });
  await page.evaluate((m) => {
    const s = [...document.querySelectorAll('.vilda-siatka-charts svg')].find((x) => x._vildaScale && x._vildaScale.metric === m);
    s.scrollIntoView({ block: 'center' });
  }, metryka);
  // P-KARTA-LECZENIE: bez bloków leczenia nad zakładkami siatka stoi wyżej i jej punkt bywa w oknie JUŻ PRZED
  // przewinięciem. scrollIntoView strony formularza (custom-fixes.js) przewija dopiero po 100 ms, więc dwa równe odczyty
  // co 100 ms nie dowodzą końca przewijania — punkt musi stać w obu osiach przez trzy kolejne odczyty (≥ 300 ms).
  let poprzednia = null, stoiOdczytow = 0;
  await expect.poll(async () => {
    const teraz = await pozycja();
    const stoi = poprzednia && Math.abs(teraz.y - poprzednia.y) < 0.5 && Math.abs(teraz.x - poprzednia.x) < 0.5 && teraz.y > 0 && teraz.y < teraz.h;
    stoiOdczytow = stoi ? stoiOdczytow + 1 : 0;
    poprzednia = teraz;
    return stoiOdczytow >= 3;
  }, { intervals: [100] }).toBe(true);
  return poprzednia;
}

const WAGA_Z_DZIENNIKIEM = [[132, 63, null], [144, 70.5, null], [156, 80, null], [159, 77.8, 'pacjent'], [160, 76.9, 'pacjent'], [161, 76, null], [162, 75.2, null]];

test.describe('Wpisy z dziennika leczenia na siatkach i w analizie trajektorii (Karta pacjenta)', () => {
  test('SI-1: romby mas od pacjenta, wpis z gabinetu jak wizyta, legenda i analiza z podpisem', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await pacjentka(page, WPISY);
    await siatki(page, pid);

    const p = await punkty(page);
    expect(p.weight).toEqual(WAGA_Z_DZIENNIKIEM);
    expect(p.height.map((x) => x[0]), 'wpisy bez wzrostu — nie na siatce wzrostu').toEqual([132, 144, 156, 162]);
    expect(p.bmi.map((x) => x[0])).toEqual([132, 144, 156, 162]);
    const waga = page.locator('.vilda-siatka-charts svg').filter({ has: page.locator('polygon.vilda-pt-pacjent') });
    await expect(waga).toHaveCount(1);
    await expect(waga.locator('polygon.vilda-pt-pacjent')).toHaveCount(2);

    const legenda = page.locator('.vilda-patient-chart-legend');
    await expect(legenda).toContainText('pomiary w gabinecie');
    await expect(legenda.locator('.vilda-legend-pac')).toBeVisible();
    await expect(legenda.locator('.vilda-legend-pac')).toHaveText('pomiary od pacjenta (Wpisy leczenia)');

    const analiza = page.locator('.vtap');
    await expect(analiza.locator('.vtap-mchip.vtap-pac')).toHaveText('w tym 2 od pacjenta');
    await expect(analiza.locator('.vtap-pac-l')).toHaveCount(1);
    await expect(analiza.locator('.vtap-card-pac .nm')).toHaveText('Waga');
    await expect(analiza.locator('.vtap-card-pac .vtap-pac-l')).toHaveText('z wpisami od pacjenta (2)');
    // bieżący pomiar i pomiar osi czasu z tego samego miesiąca analiza scala w jeden (jak dotąd)
    await expect(analiza.locator('.vtap-meta')).toContainText('7 pomiarów');
  });

  test('SI-2: dymek przy rombie — masa z odznaką „pacjent”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await pacjentka(page, WPISY);
    await siatki(page, pid);
    const pt = await srodek(page, 'weight', 4);
    await page.mouse.move(pt.x - 20, pt.y, { steps: 4 });
    await page.mouse.move(pt.x, pt.y, { steps: 4 });
    const dymek = page.locator('.vilda-siatka-tip');
    await expect(dymek).toContainText('76,9 kg');
    await expect(dymek.locator('.vilda-tip-pac')).toHaveText('pacjent');
    await expect(dymek.locator('.vilda-tip-a')).toContainText('◇ od pacjenta');
    const wizyta = await srodek(page, 'weight', 2);
    await page.mouse.move(wizyta.x, wizyta.y, { steps: 4 });
    await expect(dymek).toContainText('80,0 kg');
    await expect(dymek.locator('.vilda-tip-pac')).toHaveCount(0);
    await expect(dymek.locator('.vilda-tip-a')).toContainText('● pomiar');
  });

  test('SI-3: „Porównaj 2 pomiary” — wizyta A i romb B, panel podpisuje B', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await pacjentka(page, WPISY);
    await siatki(page, pid);
    await page.getByRole('button', { name: /Porównaj 2 pomiary/ }).click();
    const a = await srodek(page, 'weight', 2);
    await page.mouse.click(a.x, a.y);
    const b = await srodek(page, 'weight', 3);
    await page.mouse.click(b.x, b.y);
    const panel = page.locator('.vilda-cmp-panel');
    await expect(panel).toContainText('Porównanie pomiarów');
    await expect(panel.locator('.vilda-cmp-pac')).toHaveText('◇ B: pomiar od pacjenta z „Wpisy leczenia”');
    await expect(panel).toContainText('77,8');
    // B to sama masa od pacjenta: wzrost i BMI w B nie są odczytywane z linii między wizytami.
    const karty = panel.locator('.vilda-cmp-kpi');
    await expect(karty.filter({ hasText: 'Wzrost' })).toContainText('— brak pomiaru w tym punkcie');
    await expect(karty.filter({ hasText: 'BMI' })).toContainText('— brak pomiaru w tym punkcie');
    await expect(karty.filter({ hasText: 'Waga' })).not.toContainText('brak pomiaru');
  });

  test('SI-4: wpis dopisany w „Wpisy leczenia” jest od razu na siatce i w analizie', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await pacjentka(page, WPISY);
    await siatki(page, pid);
    // P-KARTA-LECZENIE (etap 1): „Wpisy leczenia” w zakładce „Leczenie” (dotąd nad zakładkami, widoczne na „Status”).
    await page.locator('.vilda-patient-tab[data-tab="leczenie"]').click();
    await page.getByRole('button', { name: 'Kontynuacja' }).click();
    const okno = page.getByRole('dialog', { name: /Nowy wpis leczenia/ });
    await expect(okno).toBeVisible();
    await okno.locator('#vdoDate').fill('2026-11-12');
    await okno.locator('#vdoW').fill('74,6');
    await okno.getByRole('button', { name: 'Zapisz wpis' }).click();
    await expect(okno).toBeHidden();

    await page.locator('.vilda-patient-tab[data-tab="traj"]').click();
    await expect.poll(async () => (await punkty(page)).weight).toEqual([...WAGA_Z_DZIENNIKIEM, [163, 74.6, 'pacjent']]);
    await expect(page.locator('.vtap .vtap-mchip.vtap-pac')).toHaveText('w tym 3 od pacjenta');
    await expect(page.locator('.vtap .vtap-card-pac .vtap-pac-l')).toHaveText('z wpisami od pacjenta (3)');
    await expect(page.locator('.vilda-siatka-charts polygon.vilda-pt-pacjent')).toHaveCount(3);
  });

  test('SI-5: bez dziennika — siatki i analiza jak dotąd; telefon bez poziomego przewijania', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await pacjentka(page, []);
    await siatki(page, pid);
    expect((await punkty(page)).weight).toEqual([[132, 63, null], [144, 70.5, null], [156, 80, null], [162, 75.2, null]]);
    await expect(page.locator('.vilda-siatka-charts polygon.vilda-pt-pacjent')).toHaveCount(0);
    await expect(page.locator('.vilda-legend-pac')).toBeHidden();
    await expect(page.locator('.vtap .vtap-pac, .vtap .vtap-pac-l')).toHaveCount(0);

    const pid2 = await pacjentka(page, WPISY);
    await page.setViewportSize({ width: 390, height: 844 });
    await siatki(page, pid2);
    await expect(page.locator('.vilda-legend-pac')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
