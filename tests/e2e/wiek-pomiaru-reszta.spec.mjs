import { expect, test } from '../support/test-czas.mjs';

// P-WIEK-POMIARU-3 (polecenie właściciela 2026-10-14) na prawdziwych stronach. Trzy miejsca, które poprzednie
// wpisy zostawiły poza zakresem:
//
// 1. Karta porównania, kolumna „Zmiana”: ΔSDS i werdykt pary liczyły oba punkty w pełnych miesiącach. Niemowlę
//    na medianie WHO w 31. i 58. dobie życia (oba punkty w 1. miesiącu) dostawało alarm „Zmiany”, choć obie
//    kolumny obok pokazują 50. centyl. (W 0. miesiącu karta „Zmiany” nie liczy wcale — wiek formularza 0.)
// 2. Masa poniżej 3 lat przy OLAF (decyzja właściciela 2026-10-14): Karta pacjenta, kolumna „Poprzednio”
//    i schowek liczyły ją na WHO 2006, formularz — na Palczewskiej.
//
// Wartości oczekiwane liczą w tej samej stronie silniki (VildaBmi) albo funkcje rdzenia z jawnym wiekiem.
// Zegar stron: 17 czerwca 2026 (tests/support/czas.mjs). Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#WiekPomiaru3!26';
const DNI_W_MIES = 30.4375;

async function zgodaNaRegulamin(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
}

async function otworzZKontem(page) {
  await zgodaNaRegulamin(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && !document.documentElement.classList.contains('vilda-auth-locked')
    && Boolean(window.VildaAuthUI) && typeof window.calcPercentileStats === 'function'
    && Boolean(window.VildaPatientSummaryCopy) && Boolean(window.VildaDobAge) && Boolean(window.VildaSummaryCards),
  null, { timeout: 30000 });
}

async function trybPro(page) {
  await page.waitForFunction(() => {
    const pro = document.getElementById('resultsModeToggle');
    if (!pro) return false;
    if (!pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
    return window.professionalMode === true;
  }, null, { timeout: 15000 });
}

// Zapis pomiaru tak, jak trzyma go sejf: wiek z chwili pomiaru, data pomiaru, źródło siatek.
async function zalozPacjenta(page, d) {
  return page.evaluate(async (p) => {
    const user = {
      lastName: p.nazwisko, firstName: p.imie, sex: p.plec, dobISO: p.dobISO,
      age: p.lata, ageMonths: p.mies, height: p.wzrost, weight: p.masa,
    };
    if (p.dataPomiaru) user.measuredAtISO = p.dataPomiaru;
    if (p.tygodnie != null) user.ageWeeks = p.tygodnie;
    const w = await window.VildaVault.savePatient({
      name: `${p.nazwisko} ${p.imie}`, timestampISO: p.zapisISO, zscore: { dataSource: p.zrodlo }, user,
    }, { dedup: false });
    return w.patientId;
  }, d);
}

const wpisz = (page, pola) => page.evaluate((p) => {
  Object.keys(p).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error('brak pola ' + id);
    el.value = p[id];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  if (typeof window.update === 'function') window.update();
}, pola);

async function otworzKarte(page, pid, wczytaj = true) {
  await page.evaluate(({ id, zWczytaniem }) => window.VildaAuthUI.showPatientCard(id,
    (r) => { if (r && zWczytaniem && typeof window.applyLoadedData === 'function') window.applyLoadedData(r); }, null), { id: pid, zWczytaniem: wczytaj });
  await expect(page.locator('.vilda-patient-stat-label', { hasText: 'Wzrost' }).first()).toBeVisible({ timeout: 20000 });
}

async function wczytajJakoNowyPomiar(page, pid) {
  await otworzKarte(page, pid);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await page.waitForSelector('#vildaLoadChoiceModal', { state: 'visible', timeout: 8000 });
  await page.click('#vildaLcmNew');
  await page.waitForSelector('#vildaLoadChoiceModal', { state: 'detached', timeout: 8000 }).catch(() => {});
  await expect(page.locator('#prevSummaryWrap')).toBeVisible({ timeout: 20000 });
}

const liczbaCentyla = (tekst) => {
  const m = /(\d+)\.? centyl/.exec(String(tekst || ''));
  return m ? Number(m[1]) : null;
};
const wiersz = (page, klucz) => page.locator(`#prevSummaryContent tr[data-klucz="${klucz}"]`);
const centylPoprzednio = async (page, klucz) => liczbaCentyla(await wiersz(page, klucz).locator('.pt-kol-poprzednio').innerText());
const kafelek = (page, etykieta) => page.locator('.vilda-patient-stat')
  .filter({ has: page.locator('.vilda-patient-stat-label', { hasText: etykieta }) }).first();
const centylKafelka = async (page, etykieta) => liczbaCentyla(await kafelek(page, etykieta).innerText());
const schowek = (page, pid) => page.evaluate(async (id) => {
  const p = await window.VildaVault.getPatient(id);
  return window.VildaPatientSummaryCopy.buildSummaryTextFromPayload(p.snapshots[0].payload, {});
}, pid);
const centylSchowka = (tekst, etykieta) => liczbaCentyla((String(tekst).split('\n').find((l) => l.startsWith(`${etykieta}:`)) || ''));

// Chłopiec ur. 20 kwietnia 2026: pomiar 21 maja (31. doba, 1 mies. 1 dzień), dziś 17 czerwca (58. doba,
// 1 mies. 28 dni) — oba punkty w 1. pełnym miesiącu. Długość i masa na medianie WHO dla doby każdego pomiaru.
const DOBA_POPRZEDNIA = 31;
const DOBA_DZIS = 58;
// Mediany WHO 2006 wprost z siatki WHO (wzrost: silnik na wskazanej siatce, niezależnie od źródła formularza;
// masa: tablica niemowlęca WHO rdzenia z jawnym wiekiem).
const medianyWDobie = (page, doba) => page.evaluate(({ dz, d }) => {
  const w = dz / d;
  return {
    wzrost: Math.round(window.VildaSdsWzrostu.policzNaSiatce({ wzrost: 50, plec: 'M', wiekMies: w, siatka: 'WHO' }).mediana * 10) / 10,
    masa: Math.round(window.calcPercentileStats(3, 'M', 0, 'WT', { wiekMies: w }).median * 100) / 100,
  };
}, { dz: doba, d: DNI_W_MIES });

test('karta porównania (PRO): niemowlę na medianie WHO w 31. i 58. dobie — „Zmiana” bez fałszywego alarmu, ΔSDS z wieku dokładnego', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);
  await trybPro(page);
  const poprzednio = await medianyWDobie(page, DOBA_POPRZEDNIA);
  const dzis = await medianyWDobie(page, DOBA_DZIS);
  expect(dzis.wzrost - poprzednio.wzrost, 'w 27 dób przybywa ok. 3 cm długości').toBeGreaterThan(2);

  const pid = await zalozPacjenta(page, {
    nazwisko: 'Probny', imie: 'Miesieczny', plec: 'M', dobISO: '2026-04-20', dataPomiaru: '2026-05-21',
    zapisISO: '2026-05-21T09:00:00.000Z', lata: 0, mies: 1, tygodnie: 4, wzrost: poprzednio.wzrost, masa: poprzednio.masa, zrodlo: 'WHO',
  });
  await wczytajJakoNowyPomiar(page, pid);
  await expect(page.locator('#dobInput'), 'formularz ma datę urodzenia — dzisiejszy wiek dokładny jest znany').toHaveValue('20-04-2026');
  await expect.poll(() => page.evaluate(() => (window.VildaDobAge.readExactAge() || {}).days)).toBe(DOBA_DZIS);
  await wpisz(page, { height: String(dzis.wzrost), weight: String(dzis.masa) });

  const pigulka = (klucz) => wiersz(page, klucz).locator('.pt-zmiana .pt-pill').first();
  await expect(pigulka('wzrost')).toHaveText('stabilny tor wzrastania', { timeout: 15000 });
  await expect(pigulka('masa')).toHaveText('stabilny tor masy ciała');
  await expect(pigulka('bmi')).toHaveText('stabilny tor BMI');
  await expect(page.locator('#prevSummaryContent .pt-zmiana .status-alert')).toHaveCount(0);

  // ΔhSDS i ΔwSDS (tryb PRO) bliskie zera: oba punkty liczone w swoim wieku dokładnym.
  const dSds = async (klucz, etykieta) => {
    const t = await wiersz(page, klucz).locator('.pt-zmiana').innerText();
    const m = new RegExp(`${etykieta} ([+−\\-±]?\\d+,\\d+)`).exec(t);
    return m ? Number(m[1].replace('−', '-').replace('±', '').replace(',', '.')) : null;
  };
  const dh = await dSds('wzrost', 'ΔhSDS');
  const dw = await dSds('masa', 'ΔwSDS');
  expect(dh, 'ΔhSDS widoczne w trybie PRO').not.toBeNull();
  expect(Math.abs(dh)).toBeLessThanOrEqual(0.05);
  expect(dw, 'ΔwSDS widoczne w trybie PRO').not.toBeNull();
  expect(Math.abs(dw)).toBeLessThanOrEqual(0.05);
  // Kontrola, że przypadek mierzy błąd: w pełnych miesiącach (1 i 1) ten sam model daje alarm wzrostu.
  const wPelnych = await page.evaluate((h) => {
    const prev = { ...window.prevMeasurementInfo, wiekMies: null };
    const m = window.VildaSummaryCards.__porownanieZPoprzednim(prev, { ageMonths: 1, heightCm: h.wzrost, weightKg: h.masa },
      { plec: 'M', zrodlo: 'WHO', dorosly: false });
    return m.wiersze.find((w) => w.klucz === 'wzrost').werdykt.l;
  }, dzis);
  expect(wPelnych).not.toBe('stabilny tor wzrastania');
});

test('masa dwulatka przy OLAF: Karta pacjenta, kolumna „Poprzednio” i schowek na Palczewskiej — jak formularz', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);
  // Chłopiec ur. 10 czerwca 2024: pomiar 15 czerwca 2026 (2 lata 0 mies.), dziś 17 czerwca — też 24. miesiąc.
  const pid = await zalozPacjenta(page, {
    nazwisko: 'Probny', imie: 'Dwulatek', plec: 'M', dobISO: '2024-06-10', dataPomiaru: '2026-06-15',
    zapisISO: '2026-06-15T09:00:00.000Z', lata: 2, mies: 0, wzrost: 87, masa: 12.2, zrodlo: 'OLAF',
  });
  const oczek = await page.evaluate(() => ({
    pal: Math.round(window.calcPercentileStatsPal(12.2, 'M', 2, 'WT').percentile),
    who: Math.round(window.calcPercentileStats(12.2, 'M', 2, 'WT', { wiekMies: null }).percentile),
  }));
  expect(oczek.pal, 'Palczewska i WHO 2006 dają różne centyle — test coś mierzy').not.toBe(oczek.who);

  await otworzKarte(page, pid);
  expect(await centylKafelka(page, 'Waga'), 'kafelek „Waga” Karty pacjenta').toBe(oczek.pal);
  const tekst = await schowek(page, pid);
  expect(centylSchowka(tekst, 'Waga'), tekst).toBe(oczek.pal);

  await wczytajJakoNowyPomiar(page, pid);
  await expect.poll(() => centylPoprzednio(page, 'masa'), { timeout: 15000 }).toBe(oczek.pal);
});
