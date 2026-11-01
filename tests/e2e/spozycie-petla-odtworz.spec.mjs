import { expect, test } from '../support/test-czas.mjs';

// P-SPOZYCIE-PETLA — „Odtwórz zapis” nie wpada w rekurencję karty „Szacowane spożycie energii”
// (2026-10-12, zgłoszenie właściciela: pacjentka leczona GH wczytuje się kilkanaście sekund,
// „Nowy pomiar” działa prawidłowo; poprawka P-WZRASTANIE-PRZEBUDOWA nie pomogła).
//
// Przyczyna (zmierzona): karta spożycia rozwija się sama, gdy BMI dziecka wskazuje nadwagę,
// Cole ≥ 110% albo jest alert spożycia (np. spadek masy). Rozwinięcie — i() w app.js — paruje
// tabelę spożycia z historią karty zaawansowanej. Parowanie dobudowuje wiersz i przelicza kartę
// zaawansowaną, a to przeliczenie znów woła rozwinięcie karty spożycia. Gdy bieżący pomiar ma
// własny punkt terapii GH (punkt dodany w monitorze na tej wizycie), parowanie się nie stabilizuje:
// wiersz-lustro punktu jest dobudowywany i przycinany na zmianę. Rekurencja kończyła się dopiero
// przepełnieniem stosu: ok. 4,6 tys. parowań i pełnych przeliczeń, 42–62 s zablokowanej strony.
// „Nowy pomiar” czyści bieżący pomiar, więc karta się nie rozwija i pętli nie ma.
//
// Przy okazji (P4): monitor GH w DocPro budował lustro punktów w ukrytej karcie zaawansowanej
// z pełnym przeliczeniem karty po każdym punkcie — w powłoce app.html także w tle, na wspólnym
// wątku z Start. Teraz jedno przeliczenie na końcu, stan karty bez zmian.
//
// Strażnicy liczą wywołania, nie mierzą czasu. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#SpozPetla!26';

// Dziewczynka 12 l. 0 m., 150 cm. Pomiary ręczne przed terapią; punkty terapii GH co 6 mies.,
// ostatni NA BIEŻĄCEJ WIZYCIE (wiek, wzrost i masa jak w formularzu).
const RECZNE = [[96, 100, 30], [102, 103, 31.8], [108, 106, 33.6]];
const WIEK_PUNKTOW = [120, 126, 132, 138, 144];
const WARIANTY = [
  // 52 kg przy 150 cm: Cole ok. 128% — karta spożycia rozwija się z powodu nadwagi.
  { nazwa: 'nadwaga (Cole ≥ 110%)', masa: 52, masyPunktow: [40, 43, 46, 49] },
  // 40 kg: Cole ok. 98%, ale masa spada z 49 kg na poprzedniej wizycie — alert spożycia.
  { nazwa: 'spadek masy (alert spożycia)', masa: 40, masyPunktow: [40, 43, 46, 49] },
];

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
  // Karta zaawansowana i jej synchronizacja działają w trybie profesjonalnym.
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

const punktyGh = (wariant) => WIEK_PUNKTOW.map((m, k) => {
  const biezacy = k === WIEK_PUNKTOW.length - 1;
  return {
    id: `gh-e2e-petla-${k}`, type: k === 0 ? 'start' : 'continue',
    ageYears: Math.floor(m / 12), ageMonths: m % 12,
    height: biezacy ? 150 : 138 + k * 3, weight: biezacy ? wariant.masa : wariant.masyPunktow[k],
  };
});

async function policzPacjentke(page, wariant) {
  await page.fill('#lastName', 'Probna');
  await page.fill('#firstName', 'Dorota');
  await page.evaluate((masa) => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '12'); set('ageMonths', '0'); set('sex', 'F');
    set('height', '150'); set('weight', String(masa));
    if (typeof window.update === 'function') window.update();
  }, wariant.masa);
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
    lista.forEach(([m, cm, kg], k) => {
      if (k > 0) window.addAdvMeasurementRow();
      const wiersze = document.querySelectorAll('#advMeasurements .measure-row');
      const w = wiersze[wiersze.length - 1];
      const set = (sel, v) => {
        const e = w.querySelector(sel);
        if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
      };
      set('.adv-age-years', String(Math.floor(m / 12))); set('.adv-age-months', String(m % 12));
      set('.adv-height', String(cm)); set('.adv-weight', String(kg));
    });
    window.calculateGrowthAdvanced();
  }, RECZNE);
  // Punkty terapii wchodzą tak, jak wprowadza je moduł monitorowania leczenia GH.
  await page.evaluate((p) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', p, { force: true });
    window.ghTherapyPoints = p;
  }, punktyGh(wariant));
  await page.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
  await expect.poll(() => page.evaluate(
    () => document.querySelectorAll('#advMeasurements .measure-row[data-gh-id]').length,
  )).toBeGreaterThan(0);
}

// Tabela karty zaawansowanej: [miesiące, wzrost, masa, znacznik GH] w kolejności wierszy.
const tabela = (page) => page.evaluate(() => Array.from(
  document.querySelectorAll('#advMeasurements .measure-row'),
).map((w) => {
  const v = (s) => w.querySelector(s)?.value ?? '';
  const liczba = (s) => (v(s) === '' ? null : Number(v(s)));
  const m = (Number(v('.adv-age-years')) || 0) * 12 + (Number(v('.adv-age-months')) || 0);
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
  await expect.poll(() => page.evaluate(
    () => document.querySelectorAll('#advMeasurements .measure-row[data-gh-id]').length,
  )).toBeGreaterThan(0);
}

// Liczniki parowania karty spożycia z historią i pełnych przeliczeń karty zaawansowanej.
// Wywołania wewnętrzne idą przez globalne nazwy, więc obudowa je widzi.
async function wlaczLicznik(page) {
  await page.evaluate(() => {
    window.__liczPetli = { parowania: 0, przeliczenia: 0 };
    if (window.__liczPetliZalozony) return;
    window.__liczPetliZalozony = true;
    const paruj = window.vildaEnsureAdvancedIntakePairing;
    window.vildaEnsureAdvancedIntakePairing = function () {
      window.__liczPetli.parowania += 1;
      return paruj.apply(this, arguments);
    };
    const przelicz = window.calculateGrowthAdvanced;
    window.calculateGrowthAdvanced = function () {
      window.__liczPetli.przeliczenia += 1;
      return przelicz.apply(this, arguments);
    };
  });
}

const licznik = (page) => page.evaluate(() => ({ ...window.__liczPetli }));

test.describe('„Odtwórz zapis” u pacjentki z punktem GH na bieżącej wizycie i rozwiniętą kartą spożycia', () => {
  for (const wariant of WARIANTY) {
    test(`${wariant.nazwa}: bez rekurencji parowania, tabela jak przed zapisem`, async ({ page }) => {
      // Dotąd jedno „Odtwórz zapis” trwało tu kilkadziesiąt sekund — limit pozwala zmierzyć
      // czerwień na kodzie sprzed poprawki zamiast przerwać test w połowie pętli.
      test.setTimeout(240_000);
      await otworz(page);
      await policzPacjentke(page, wariant);
      const przedZapisem = await tabela(page);
      await page.locator('#saveDataBtnSidebar').click();
      const pid = await idZapisanegoPacjenta(page);

      await wczytajDoWyboru(page, pid);
      await wlaczLicznik(page);
      await page.locator('#vildaLcmRestore').click();
      await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
      await expect(page.locator('#weight')).toHaveValue(String(wariant.masa));
      // custom-fixes.js odświeża pola 3,2 s po 'vilda:state-restored' — to też przeliczenie.
      await page.waitForTimeout(4500);
      const odtworz = await licznik(page);

      expect(
        await page.evaluate(() => getComputedStyle(document.getElementById('intakeCard')).display),
        'warunek scenariusza: karta spożycia rozwinęła się sama',
      ).not.toBe('none');
      // Dotąd (audyt d002f96): ok. 4,6 tys. parowań i tyle samo pełnych przeliczeń.
      expect(odtworz.parowania, 'parowanie karty spożycia z historią po „Odtwórz zapis”').toBeLessThanOrEqual(60);
      expect(odtworz.przeliczenia, 'pełne przeliczenia karty zaawansowanej po „Odtwórz zapis”').toBeLessThanOrEqual(30);
      expect(await tabela(page), 'tabela po „Odtwórz zapis” jak przed zapisem').toEqual(przedZapisem);
      await expect(page.locator('#restoreStateBtn'), 'po odtworzeniu nie ma czego odtwarzać').toBeHidden();

      // „Nowy pomiar” był szybki i taki zostaje.
      await wczytajDoWyboru(page, pid);
      await wlaczLicznik(page);
      await page.locator('#vildaLcmNew').click();
      await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
      await page.waitForTimeout(1500);
      const nowy = await licznik(page);
      expect(nowy.parowania).toBeLessThanOrEqual(10);
      expect(nowy.przeliczenia).toBeLessThanOrEqual(10);
    });
  }
});

// Stan ukrytej karty zaawansowanej w DocPro: lustro punktów GH, wszystkie wiersze, wynik karty
// i pomiary w advancedGrowthData.
const stanDocPro = (page) => page.evaluate(() => {
  const wiersze = Array.from(document.querySelectorAll('#advMeasurements .measure-row')).map((w) => {
    const v = (s) => w.querySelector(s)?.value ?? '';
    const liczba = (s) => (v(s) === '' ? null : Number(v(s)));
    const m = (Number(v('.adv-age-years')) || 0) * 12 + (Number(v('.adv-age-months')) || 0);
    return [m, liczba('.adv-height'), liczba('.adv-weight'), w.getAttribute('data-gh-id') || '', w.getAttribute('data-gh-sync') || ''];
  });
  return {
    wiersze,
    lustro: wiersze.filter((w) => w[4] === 'true').map((w) => w.slice(0, 4)),
    wynik: (document.getElementById('advResults')?.innerText || '').trim(),
    pomiary: JSON.stringify((window.advancedGrowthData && window.advancedGrowthData.measurements) || []),
  };
});

test.describe('Monitor GH w DocPro buduje lustro punktów jednym przeliczeniem', () => {
  // Monitor GH w DocPro buduje w ukrytej karcie zaawansowanej lustro punktów (ue()). W powłoce
  // app.html robi to w tle przy każdym wczytaniu i odtworzeniu — na wspólnym wątku z Start.
  test('monitor GH w DocPro: odświeżenie monitora to jedno przeliczenie karty', async ({ page }) => {
    await otworz(page);
    await policzPacjentke(page, WARIANTY[0]);
    await page.goto('/docpro.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function', null, { timeout: 60000 });
    // Odtworzenie stanu DocPro biegnie w przebiegach do 1,5 s po starcie strony (+350 ms na zapis).
    await page.waitForTimeout(2500);
    const przed = await stanDocPro(page);
    expect(przed.lustro.length, 'lustro punktów GH w ukrytej karcie DocPro').toBeGreaterThanOrEqual(WIEK_PUNKTOW.length - 1);
    // Wiersze lustra niosą wartości punktów z monitora (pominięte przeliczenie pośrednie nie może
    // zostawić pustego ani przesuniętego wiersza).
    const oczekiwane = Object.fromEntries(punktyGh(WARIANTY[0]).map((p) => [p.id, [p.ageYears * 12 + p.ageMonths, p.height, p.weight]]));
    for (const [m, cm, kg, id] of przed.lustro) expect([m, cm, kg], `wiersz punktu ${id}`).toEqual(oczekiwane[id]);

    await wlaczLicznik(page);
    await page.evaluate(() => window.refreshGHTherapyMonitor());
    const odswiezenie = await licznik(page);
    // Dotąd: jedno przeliczenie na każdy punkt plus jedno na końcu.
    expect(odswiezenie.przeliczenia, 'pełne przeliczenia na jedno odświeżenie monitora').toBeLessThanOrEqual(2);
    expect(await stanDocPro(page), 'tabela, wyniki i dane karty po odświeżeniu monitora bez zmian').toEqual(przed);
  });
});
