import { expect, test } from '../support/test-czas.mjs';

// P-WZRASTANIE-PRZEBUDOWA — wczytanie pacjentki leczonej hormonem wzrostu nie przebudowuje
// tabeli historii w kółko (2026-10-12, zgłoszenie właściciela).
//
// Zgłoszenie: u pacjentki leczonej GH „Wczytaj tego pacjenta" → „Odtwórz zapis" trwało
// znacząco dłużej niż u innych pacjentów; „Nowy pomiar" działał prawidłowo.
//
// Przyczyna (zmierzona): moduł podstawowego wzrastania (growth-basic-module.js) przy każdym
// przeliczeniu porównuje „podpis" swojej historii z podpisem z ostatniej synchronizacji.
// Bieżącą historię podpisywał po posortowaniu wg wieku, a zapamiętaną — w kolejności wierszy.
// Punkty terapii GH mostek dopisuje na KOŃCU tabeli karty zaawansowanej, więc wystarczy jeden
// ręczny pomiar późniejszy niż pierwszy punkt terapii (albo bieżąca wizyta przeniesiona do
// historii), żeby podpisy nigdy się nie zgadzały. Wtedy każde przeliczenie karty podstawowej
// (każde zdarzenie w polach wieku, wzrostu, masy i płci, a „Odtwórz zapis" wysyła ich wiele)
// czyściło tabelę zaawansowaną i budowało ją od nowa, a każdy dodany wiersz wywoływał pełne
// przeliczenie karty zaawansowanej (z kartą spożycia i podsumowaniem). Koszt rósł z kwadratem
// liczby wierszy: 40 punktów GH i 10 pomiarów ręcznych — ok. 13 s zablokowanej strony.
//
// Strażnik liczy wywołania, nie mierzy czasu (czas zależy od maszyny). Oczekiwania:
//   * liczba pełnych przeliczeń nie zależy od liczby wierszy historii;
//   * tabela po wczytaniu jest taka sama jak przed zapisem (kolejność, wartości, znaczniki GH).
// Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhPrzeb!26a';

// Pomiary ręczne (miesiące życia) — ostatni (110) leży w trakcie terapii, jak wizyta kontrolna
// wpisana ręcznie. Punkty terapii GH co 3 miesiące od 8. roku życia.
const RECZNE = [60, 66, 72, 78, 84, 90, 110];
const PUNKTY_GH = Array.from({ length: 12 }, (_, k) => {
  const m = 96 + 3 * k;
  return {
    id: `gh-e2e-przebudowa-${k}`, ageYears: Math.floor(m / 12), ageMonths: m % 12,
    height: Number((75.3 + m * 0.45).toFixed(1)), weight: Number((8 + m * 0.17).toFixed(1)), type: 'gh',
  };
});
const WIERSZY = RECZNE.length + PUNKTY_GH.length;

async function otworz(page) {
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
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  await page.waitForFunction(() => Boolean(window.VildaProAccess));
  // Synchronizacja kart podstawowej i zaawansowanej działa w trybie profesjonalnym.
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const tryb = document.getElementById('resultsModeToggle');
    if (tryb && !tryb.checked) {
      tryb.checked = true;
      tryb.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

async function policzPacjentke(page) {
  await page.fill('#lastName', 'Probna');
  await page.fill('#firstName', 'Celina');
  await page.evaluate(() => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '12'); set('ageMonths', '0'); set('sex', 'F');
    set('height', '140.5'); set('weight', '33.5');
    if (typeof window.update === 'function') window.update();
  });
  await page.waitForSelector(
    '#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]',
    { state: 'attached' },
  );
  await expect(page.locator('#toggleAdvancedGrowth')).toBeEnabled();
  await page.evaluate(() => {
    const t = document.getElementById('toggleAdvancedGrowth');
    const f = document.getElementById('advancedGrowthForm');
    if (f && getComputedStyle(f).display !== 'none') return;
    if (t) t.click();
  });
  await expect(page.locator('#advancedGrowthForm')).toBeVisible({ timeout: 10000 });
  await page.waitForSelector('#advMeasurements .measure-row', { state: 'attached', timeout: 10000 });
  await page.evaluate((lista) => {
    lista.forEach((m, k) => {
      if (k > 0) window.addAdvMeasurementRow();
      const wiersze = document.querySelectorAll('#advMeasurements .measure-row');
      const w = wiersze[wiersze.length - 1];
      const set = (sel, v) => {
        const e = w.querySelector(sel);
        if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
      };
      set('.adv-age-years', String(Math.floor(m / 12))); set('.adv-age-months', String(m % 12));
      set('.adv-height', (75 + m * 0.45).toFixed(1)); set('.adv-weight', (8 + m * 0.17).toFixed(1));
    });
    window.calculateGrowthAdvanced();
  }, RECZNE);
  // Punkty terapii wchodzą tak, jak wprowadza je moduł monitorowania leczenia GH.
  await page.evaluate((p) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', p, { force: true });
    window.ghTherapyPoints = p;
  }, PUNKTY_GH);
  await page.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
  await expect.poll(() => page.evaluate(
    () => document.querySelectorAll('#advMeasurements .measure-row[data-gh-id]').length,
  )).toBe(PUNKTY_GH.length);
}

// Tabela karty zaawansowanej: [miesiące, wzrost, masa, znacznik GH] w kolejności wierszy.
// Wartości jako liczby: pole wpisane „102.0” wraca z zapisu jako „102”.
const tabela = (page) => page.evaluate(() => Array.from(
  document.querySelectorAll('#advMeasurements .measure-row'),
).map((w) => {
  const v = (s) => w.querySelector(s)?.value ?? '';
  const m = (Number(v('.adv-age-years')) || 0) * 12 + (Number(v('.adv-age-months')) || 0);
  const liczba = (s) => (v(s) === '' ? null : Number(v(s)));
  return [m, liczba('.adv-height'), liczba('.adv-weight'), w.getAttribute('data-gh-id') || ''];
}));

async function idZapisanegoPacjenta(page) {
  let id = null;
  await expect
    .poll(
      async () => {
        id = await page.evaluate(async () => {
          const lista = await window.VildaVault.listPatients();
          return Array.isArray(lista) && lista.length === 1 && lista[0] ? lista[0].patientId : null;
        });
        return typeof id === 'string' && id.length > 0;
      },
      { message: 'sejf ma dokładnie jednego zapisanego pacjenta' },
    )
    .toBe(true);
  return id;
}

async function wczytajDoWyboru(page, pid) {
  await page.evaluate(() => window.clearAllData());
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (rekord) => {
    if (rekord) window.applyLoadedData(rekord);
  }, null), pid);
  await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
  // Wczytanie (z importem punktów terapii) ma się zakończyć przed liczeniem wyboru.
  await expect.poll(() => page.evaluate(
    () => document.querySelectorAll('#advMeasurements .measure-row[data-gh-id]').length,
  )).toBe(PUNKTY_GH.length);
}

// Licznik pełnych przeliczeń karty zaawansowanej i dodań wierszy jej historii. Wywołania
// wewnętrzne (app.js, moduły kart) idą przez globalne nazwy, więc obudowa je widzi.
async function wlaczLicznik(page) {
  await page.evaluate(() => {
    window.__liczPrzebudowy = { przeliczenia: 0, wiersze: 0 };
    if (window.__liczPrzebudowyZalozony) return;
    window.__liczPrzebudowyZalozony = true;
    const dodaj = window.addAdvMeasurementRow;
    window.addAdvMeasurementRow = function () {
      window.__liczPrzebudowy.wiersze += 1;
      return dodaj.apply(this, arguments);
    };
    const przelicz = window.calculateGrowthAdvanced;
    window.calculateGrowthAdvanced = function () {
      window.__liczPrzebudowy.przeliczenia += 1;
      return przelicz.apply(this, arguments);
    };
  });
}

test.describe('Pacjentka leczona GH: wczytanie nie przebudowuje historii w kółko', () => {
  test('„Odtwórz zapis" i „Nowy pomiar": przeliczeń nie przybywa z liczbą wierszy, tabela bez zmian', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await policzPacjentke(page);
    const przedZapisem = await tabela(page);
    expect(przedZapisem.length).toBe(WIERSZY);
    expect(przedZapisem.map((w) => w[0]), 'punkty terapii stoją za pomiarami ręcznymi, kolejność nie jest chronologiczna')
      .toEqual([...RECZNE, ...PUNKTY_GH.map((p) => p.ageYears * 12 + p.ageMonths)]);

    await page.locator('#saveDataBtnSidebar').click();
    const pid = await idZapisanegoPacjenta(page);

    // --- „Odtwórz zapis" ---
    await wczytajDoWyboru(page, pid);
    await wlaczLicznik(page);
    await page.locator('#vildaLcmRestore').click();
    await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
    await expect(page.locator('#height')).toHaveValue('140.5');
    // custom-fixes.js po „vilda:state-restored" odświeża pola po 3,2 s; to też przeliczenie
    // karty podstawowej, które dotąd przebudowywało tabelę. Czekamy, aż minie.
    await page.waitForTimeout(4500);
    const odtworz = await page.evaluate(() => ({ ...window.__liczPrzebudowy }));
    // Dotąd (audyt d0c1bda): 163 przeliczenia i 159 dodanych wierszy dla 19 wierszy historii.
    expect(odtworz.przeliczenia, 'pełne przeliczenia karty zaawansowanej po „Odtwórz zapis"').toBeLessThanOrEqual(6);
    expect(odtworz.wiersze, 'tabela budowana raz, nie przy każdym przeliczeniu').toBeLessThanOrEqual(WIERSZY);
    expect(await tabela(page), 'tabela po „Odtwórz zapis" jak przed zapisem').toEqual(przedZapisem);

    // --- „Nowy pomiar" ---
    await wczytajDoWyboru(page, pid);
    await wlaczLicznik(page);
    await page.locator('#vildaLcmNew').click();
    await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
    await page.waitForTimeout(4500);
    const nowy = await page.evaluate(() => ({ ...window.__liczPrzebudowy }));
    // Dotąd: 108 przeliczeń i 108 dodanych wierszy (bieżąca wizyta trafia do historii przed
    // punktami terapii, więc kolejność też nie jest chronologiczna).
    expect(nowy.przeliczenia, 'pełne przeliczenia karty zaawansowanej po „Nowy pomiar"').toBeLessThanOrEqual(6);
    expect(nowy.wiersze).toBeLessThanOrEqual(WIERSZY + 1);
    const poNowym = await tabela(page);
    expect(poNowym.filter((w) => w[3]).length, 'punkty terapii zostają oznaczone').toBe(PUNKTY_GH.length);
    expect(poNowym.map((w) => w[0]), 'bieżąca wizyta (144 mies.) przechodzi do historii')
      .toEqual([...RECZNE, 144, ...PUNKTY_GH.map((p) => p.ageYears * 12 + p.ageMonths)]);
  });

  // Przebudowa tabeli z karty podstawowej bywa potrzebna (lekarz zmienił historię w karcie
  // podstawowej). Ma wtedy kosztować jedno pełne przeliczenie na końcu, a nie jedno na każdy
  // dodany wiersz — dotąd 20 przeliczeń dla 19 wierszy.
  test('przebudowa tabeli z karty podstawowej: jedno przeliczenie, tabela i znaczniki GH bez zmian', async ({ page }) => {
    await otworz(page);
    await policzPacjentke(page);
    const przed = await tabela(page);
    await wlaczLicznik(page);
    const wykonana = await page.evaluate(() => window.syncBasicGrowthRowsToAdvanced());
    expect(wykonana, 'przebudowa się wykonała').toBe(true);
    const licznik = await page.evaluate(() => ({ ...window.__liczPrzebudowy }));
    expect(licznik.wiersze, 'każdy wiersz dodany raz').toBe(WIERSZY);
    expect(licznik.przeliczenia, 'jedno przeliczenie po zbudowaniu tabeli').toBe(1);
    expect(await tabela(page), 'tabela po przebudowie jak przed nią').toEqual(przed);
  });
});
