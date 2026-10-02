import { expect, test } from '../support/test-czas.mjs';

// P-BA-WIZYTA: rzeczywiste zapisy sejfu i kolejne wizyty fikcyjnego pacjenta.
// Ostatnie badanie pozostaje dostępne do prognoz, ale nie staje się badaniem
// każdej nowej wizyty. Sprawdzamy także rzeczywisty canvas siatki, F5 i DocPro.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#WiekKostnyWizyty!26';

async function gotowaStrona(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && typeof window.collectUserData === 'function' && typeof window.calculateGrowthAdvanced === 'function');
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

async function otworzKonto(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('vilda-terms-accepted-v1',
      JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    // Uprawnienie tylko dla własnego fikcyjnego konta w tym efemerycznym profilu.
    // Jawny hook produkcyjnego modułu służy testom UI za bramką DocPro.
    const planTestowy = () => {
      const access = window.VildaProAccess;
      if (!access) return;
      access.__setTokenModeForTest(false);
      access.setPlan('pro', '2099-12-31T23:59:59.000Z');
    };
    document.addEventListener('DOMContentLoaded', planTestowy, { once: true });
    document.addEventListener('vilda:session-changed', planTestowy);
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw,
    { label: 'Fikcyjne konto E2E wieku kostnego', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowaStrona(page);
}

async function ustawPola(page, pola) {
  await page.evaluate((values) => {
    for (const [id, value] of Object.entries(values)) {
      const el = document.getElementById(id);
      if (!el) throw new Error(`Brak pola ${id}`);
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (typeof window.update === 'function') window.update();
    window.calculateGrowthAdvanced();
  }, pola);
}

async function otworzKarteWzrostu(page) {
  await page.waitForSelector('#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]',
    { state: 'attached', timeout: 10_000 });
  await page.evaluate(() => {
    const form = document.getElementById('advancedGrowthForm');
    if (form && getComputedStyle(form).display !== 'none') return;
    const toggle = document.getElementById('toggleAdvancedGrowth');
    toggle.disabled = false;
    toggle.click();
  });
  await expect(page.locator('#advancedGrowthForm')).toBeVisible();
}

async function wpiszBadanie(page, lata) {
  await otworzKarteWzrostu(page);
  await page.locator('#advBoneAge').fill(String(lata));
  await page.locator('#advBoneAge').blur();
  await page.evaluate(() => window.calculateGrowthAdvanced());
}

async function pierwszaWizyta(page) {
  await otworzKonto(page);
  await ustawPola(page, {
    lastName: 'Fikcyjna', firstName: 'Kostna', sex: 'F',
    age: 10, ageMonths: 3, height: 141, weight: 34,
    advMotherHeight: 165, advFatherHeight: 178,
  });
  await page.evaluate(() => {
    const pro = document.getElementById('resultsModeToggle');
    pro.checked = true;
    pro.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await wpiszBadanie(page, 9);
  await page.locator('#saveDataBtnSidebar').click();
  let id;
  await expect.poll(async () => {
    id = await page.evaluate(async () => {
      const patients = await window.VildaVault.listPatients();
      return patients.length === 1 ? patients[0].patientId : null;
    });
    return Boolean(id);
  }, { message: 'fikcyjna pierwsza wizyta została zapisana' }).toBe(true);
  return id;
}

const zapis = (page, id) => page.evaluate(async (patientId) => {
  const patient = await window.VildaVault.getPatient(patientId);
  return { count: patient.snapshots.length, payload: patient.snapshots[0].payload };
}, id);

async function zapiszWizyte(page, id, wiekMies) {
  const przed = await zapis(page, id);
  await page.locator('#saveDataBtnSidebar').click();
  await expect.poll(async () => {
    const po = await zapis(page, id);
    const u = po.payload.user;
    return po.count > przed.count && Number(u.age) * 12 + Number(u.ageMonths || 0) === wiekMies;
  }, { message: `zapis wizyty w wieku ${wiekMies} mies.` }).toBe(true);
}

async function wczytaj(page, id, wybor = 'new') {
  await page.evaluate(() => window.clearAllData());
  await page.evaluate((patientId) => window.VildaAuthUI.showPatientCard(patientId,
    (r) => { if (r) window.applyLoadedData(r); }, null), id);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
  await page.locator(wybor === 'restore' ? '#vildaLcmRestore' : '#vildaLcmNew').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  // Clear ma krótką blokadę autosave; następny zapis/F5 ma wejść po jej zakończeniu.
  await expect.poll(() => page.evaluate(() => window.VildaPersistence.isClearInProgress())).toBe(false);
}

const stan = (page) => page.evaluate(() => {
  window.calculateGrowthAdvanced();
  const payload = window.collectUserData();
  const d = window.advancedGrowthData;
  return {
    current: payload.advanced.boneAgeYears,
    context: payload.advanced.boneAgeContext || null,
    effectiveMonths: d?.boneAgeMonths,
    predictedAdultHeightCm: d?.bayleyPinneau?.predictedAdultHeightCm ?? null,
    predictionReason: d?.bayleyPinneau?.reason ?? null,
    calculationBoneAgeYears: window.VildaAdvancedGrowth.collectAdvancedGrowthCalculationInput().boneAgeVal,
    measurements: (payload.advanced.data?.measurements || []).map((m) => ({
      ageMonths: m.ageMonths, height: m.height, boneAgeYears: m.boneAgeYears ?? null,
    })),
    velocity: window.advancedGrowthTrajectory?.velocity || null,
    trajectoryBoneAge: window.advancedGrowthTrajectory?.context?.boneAge || null,
  };
});

async function markerySiatki(page) {
  return page.evaluate(() => {
    // Obserwujemy rysowanie bez zastępowania generatora, modelu i siatki.
    // Znaczniki wieku kostnego należą do siatki PRO; zwykły wariant ich nie rysuje.
    const poprzedniTryb = window.professionalMode;
    const przelacznikTrybu = document.getElementById('resultsModeToggle');
    const poprzedniPrzelacznik = przelacznikTrybu?.checked;
    window.professionalMode = true;
    if (przelacznikTrybu) przelacznikTrybu.checked = true;
    const proto = CanvasRenderingContext2D.prototype;
    const arc = proto.arc;
    const markery = [];
    proto.arc = function (x, y, radius, ...args) {
      if (radius === 24 && this.strokeStyle.toLowerCase() === '#00838d') markery.push({ x, y });
      return arc.call(this, x, y, radius, ...args);
    };
    try {
      const u = window.collectUserData().user;
      window.buildCentilePageCanvas({
        rangeMinX: 36, rangeMaxX: 216, sex: u.sex,
        userAgeMonths: Number(u.age) * 12 + Number(u.ageMonths || 0),
        userHeight: Number(u.height), userWeight: Number(u.weight),
        headerTitle: 'Fikcyjny pomiar E2E', headerSubtitle: '', footerText: '', chartSource: 'OLAF',
      });
      return markery;
    } finally {
      proto.arc = arc;
      window.professionalMode = poprzedniTryb;
      if (przelacznikTrybu) przelacznikTrybu.checked = poprzedniPrzelacznik;
    }
  });
}

function ostatnieBadanie(wynik, mies = 123, zPrognoza = true) {
  expect(wynik.current).toBeNull();
  expect(wynik.context.current).toBeNull();
  expect(wynik.context.last).toMatchObject({ years: 9, atAgeMonths: mies });
  expect(wynik.effectiveMonths).toBe(108);
  expect(wynik.calculationBoneAgeYears).toBe(9);
  if (zPrognoza) expect(Number.isFinite(wynik.predictedAdultHeightCm), 'Bayley–Pinneau rzeczywiście korzysta z ostatniego BA').toBe(true);
}

async function sprawdzSzerokosc(page) {
  const szerokosc = await page.evaluate(() => ({
    tresc: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    ekran: window.innerWidth,
  }));
  expect(szerokosc.tresc, 'formularz i informacja o poprzednim BA mieszczą się na ekranie').toBeLessThanOrEqual(szerokosc.ekran + 1);
}

test('nowa wizyta bez badania: jeden marker i niezmienione źródło BA po zapisie, F5, DocPro i trzeciej wizycie', async ({ page }) => {
  test.setTimeout(180_000);
  const id = await pierwszaWizyta(page);
  expect(Number.isFinite((await stan(page)).predictedAdultHeightCm)).toBe(true);
  expect((await markerySiatki(page)).length).toBe(1);
  await wczytaj(page, id);
  await expect(page.locator('#advBoneAge')).toHaveValue('');
  await ustawPola(page, { age: 10, ageMonths: 5, height: 142, weight: 35 });
  await otworzKarteWzrostu(page);
  await expect(page.locator('#advBoneAgeLastInfo')).toBeVisible();
  await expect(page.locator('#advBoneAgeLastInfo')).toContainText('9');
  await expect(page.locator('#advBoneAgeLastInfo')).toContainText('10 lat 3 mies.');
  await expect(page.locator('#advBoneAgeLastInfo')).toContainText('2 mies. temu');
  await sprawdzSzerokosc(page);
  ostatnieBadanie(await stan(page));
  expect((await markerySiatki(page)).length).toBe(1);
  await zapiszWizyte(page, id, 125);
  expect((await zapis(page, id)).payload.advanced.boneAgeYears).toBeNull();

  await page.reload({ waitUntil: 'load' });
  await gotowaStrona(page);
  await expect(page.locator('#height')).toHaveValue('142');
  await expect(page.locator('#advBoneAge')).toHaveValue('');
  ostatnieBadanie(await stan(page));
  await otworzKarteWzrostu(page);
  await expect(page.locator('#advBoneAgeLastInfo')).toBeVisible();
  await sprawdzSzerokosc(page);
  expect((await markerySiatki(page)).length).toBe(1);

  await page.goto('/docpro.html', { waitUntil: 'load' });
  await gotowaStrona(page);
  await expect(page.locator('#height')).toHaveValue('142');
  await expect(page.locator('#advBoneAge')).toHaveValue('');
  const docpro = await stan(page);
  // DocPro nie ładuje tabel BP: zachowujemy tę istniejącą dostępność metody,
  // sprawdzając rzeczywisty model wejścia z wcześniejszym BA oraz przyczynę braku wyniku.
  ostatnieBadanie(docpro, 123, false);
  expect(docpro.predictionReason).toBe('missing-dataset');
  // DocPro utrzymuje tę kartę jako ukrytą projekcję wspólnego stanu pacjenta.
  await expect(page.locator('#advBoneAgeLastInfo')).toContainText('10 lat 3 mies.');
  await sprawdzSzerokosc(page);
  expect((await markerySiatki(page)).length).toBe(1);

  await page.goto('/index.html', { waitUntil: 'load' });
  await gotowaStrona(page);
  await wczytaj(page, id);
  await ustawPola(page, { age: 10, ageMonths: 7, height: 143, weight: 36 });
  const trzecia = await stan(page);
  ostatnieBadanie(trzecia);
  expect(trzecia.measurements).toEqual(expect.arrayContaining([
    { ageMonths: 123, height: 141, boneAgeYears: 9 },
    { ageMonths: 125, height: 142, boneAgeYears: null },
  ]));
  expect((await markerySiatki(page)).length).toBe(1);
  await zapiszWizyte(page, id, 127);
  expect((await zapis(page, id)).payload.advanced.boneAgeContext.last.atAgeMonths).toBe(123);
});

test('rzeczywiste nowe badanie z identycznym BA daje drugi marker i zostaje przy swojej wizycie po F5', async ({ page }) => {
  test.setTimeout(150_000);
  const id = await pierwszaWizyta(page);
  await wczytaj(page, id);
  await ustawPola(page, { age: 10, ageMonths: 5, height: 142, weight: 35 });
  const zPoprzednimBadaniem = await stan(page);
  ostatnieBadanie(zPoprzednimBadaniem);
  await wpiszBadanie(page, 9);
  const nowe = await stan(page);
  expect(nowe.current).toBe(9);
  expect(nowe.context.current).toMatchObject({ years: 9, atAgeMonths: 125 });
  // Te same bieżące wejścia i BA dają tę samą rzeczywistą prognozę niezależnie
  // od tego, czy wynik pochodzi z wcześniejszego, czy z nowego badania.
  expect(nowe.predictedAdultHeightCm).toBe(zPoprzednimBadaniem.predictedAdultHeightCm);
  expect((await markerySiatki(page)).length).toBe(2);
  await zapiszWizyte(page, id, 125);
  await page.reload({ waitUntil: 'load' });
  await gotowaStrona(page);
  await expect(page.locator('#advBoneAge')).toHaveValue('9');
  expect((await stan(page)).context.current.atAgeMonths).toBe(125);
  await expect.poll(async () => (await markerySiatki(page)).length,
    { message: 'po F5 historia przywróciła oba rzeczywiste badania', timeout: 15_000 }).toBe(2);

  await wczytaj(page, id);
  await ustawPola(page, { age: 10, ageMonths: 7, height: 143, weight: 36 });
  ostatnieBadanie(await stan(page), 125);
  expect((await markerySiatki(page)).length).toBe(2);
});

test('Odtwórz zapis odtwarza badanie tej samej wizyty, bez dodawania markera', async ({ page }) => {
  test.setTimeout(120_000);
  const id = await pierwszaWizyta(page);
  await wczytaj(page, id, 'restore');
  await expect(page.locator('#height')).toHaveValue('141');
  await expect(page.locator('#advBoneAge')).toHaveValue('9');
  const odtworzone = await stan(page);
  expect(odtworzone.current).toBe(9);
  expect(odtworzone.context.current).toMatchObject({ years: 9, atAgeMonths: 123 });
  expect((await markerySiatki(page)).length).toBe(1);
});

test('normy tempa używają ostatniego badania przy 12 miesiącach, pomijają je przy 13 i nie odmładzają wyniku po F5', async ({ page }) => {
  test.setTimeout(150_000);
  const id = await pierwszaWizyta(page);
  await wczytaj(page, id);
  await ustawPola(page, { age: 11, ageMonths: 3, height: 148, weight: 38, tannerStage: '' });
  const dwanascie = await stan(page);
  ostatnieBadanie(dwanascie);
  expect(dwanascie.velocity.cmPerYear).toBeCloseTo(7, 1);
  expect(dwanascie.velocity.basis).toBe('boneAge');
  expect(dwanascie.trajectoryBoneAge).toMatchObject({ baMonths: 108, atAgeMonths: 123 });
  await zapiszWizyte(page, id, 135);
  await page.reload({ waitUntil: 'load' });
  await gotowaStrona(page);
  // Odtworzenie wierszy historii po starcie strony kończy się asynchronicznie.
  await expect.poll(async () => (await stan(page)).velocity?.basis,
    { message: 'po F5 wraca tempo z odtworzonej historii', timeout: 15_000 }).toBe('boneAge');

  await ustawPola(page, { age: 11, ageMonths: 4, height: 148.5, weight: 38.5 });
  const trzynascie = await stan(page);
  ostatnieBadanie(trzynascie);
  expect(trzynascie.velocity.basis).toBe('generic');
  expect(trzynascie.velocity.boneAgeOmittedReason).toBe('stale');
  expect(trzynascie.trajectoryBoneAge).toMatchObject({ baMonths: 108, atAgeMonths: 123 });
  expect(`${trzynascie.velocity.note || ''} ${trzynascie.velocity.normLabel || ''}`).toMatch(/12|nieaktual|starsz|pomini/);
  expect((await markerySiatki(page)).length).toBe(1);
});

test('dawny zapis bez pochodzenia badania pozostaje legacy po Odtwórz zapis, F5 i przejściu do DocPro', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzKonto(page);
  const id = await page.evaluate(async () => {
    const saved = await window.VildaVault.savePatient({
      name: 'Fikcyjna Dawna',
      user: { lastName: 'Fikcyjna', firstName: 'Dawna', sex: 'F', age: 10, ageMonths: 3, height: 141, weight: 34 },
      advanced: {
        boneAgeYears: 9, motherHeight: 165, fatherHeight: 178,
        data: { boneAgeMonths: 108, measurements: [{ ageMonths: 111, ageYears: 9.25, height: 135, weight: 31 }] },
      },
    }, { dedup: false });
    return saved.patientId;
  });
  await wczytaj(page, id, 'restore');
  await expect(page.locator('#advBoneAge')).toHaveValue('9');
  const sprawdzLegacy = async () => {
    const wynik = await stan(page);
    expect(wynik.current).toBe(9);
    expect(wynik.context.current).toMatchObject({ years: 9, source: 'legacy', atAgeMonths: 123 });
    expect(wynik.trajectoryBoneAge).toEqual({ baMonths: 108, atAgeMonths: null });
    expect(wynik.velocity.basis).toBe('generic');
    expect(wynik.velocity.boneAgeOmittedReason).toBe('unknown-time');
    expect((await markerySiatki(page)).length).toBe(1);
  };
  await sprawdzLegacy();
  await page.reload({ waitUntil: 'load' });
  await gotowaStrona(page);
  await expect(page.locator('#advBoneAge')).toHaveValue('9');
  await sprawdzLegacy();
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await gotowaStrona(page);
  await expect(page.locator('#advBoneAge')).toHaveValue('9');
  await sprawdzLegacy();
});
