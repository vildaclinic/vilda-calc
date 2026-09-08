import { expect, test } from '../support/test-czas.mjs';

// Etap 2 silnika opisu (decyzja właściciela 2026-09-07): w karcie „Podsumowanie wyników"
// nad „Raport PDF dla pacjenta" stoi przycisk, który składa opis pacjenta i kopiuje go
// do schowka — BEZ pokazywania na stronie. Właściciel testuje opis w prawdziwej
// dokumentacji, a karta ma nie rosnąć.
//
// Ten plik sprawdza to, czego test jednostkowy nie może: że przycisk naprawdę wstaje
// w tym wrapperze, w tym miejscu, że przeżywa ponowny render karty, że do schowka
// trafia tekst opisu, a na stronę — nie; i że odmowa schowka nie jest cicha.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#OpisSchowek!26aa';

// Chłopiec 7 lat z dwoma pomiarami w historii — trajektoria ma z czego liczyć.
const REKORD = {
  name: 'Testowy Adam',
  user: { lastName: 'Testowy', firstName: 'Adam', sex: 'M', age: 7, ageMonths: 0, height: 117, weight: 20.5 },
  growthBasic: {
    data: {
      measurements: [
        { ageMonths: 48, ageYears: 4, height: 104, weight: 16 },
        { ageMonths: 72, ageYears: 6, height: 113, weight: 19 },
      ],
    },
  },
};

async function otworz(page, { schowek = 'dziala' } = {}) {
  await page.addInitScript((tryb) => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
    // Schowek pod kontrolą testu: zapis ląduje w window.__schowek albo jest odrzucany.
    const writeText = tryb === 'odmawia'
      ? () => Promise.reject(new Error('NotAllowedError'))
      : (t) => { window.__schowek = t; return Promise.resolve(); };
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    if (tryb === 'odmawia') document.execCommand = () => false;
  }, schowek);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaPatientNarrativeUI) && typeof window.applyLoadedData === 'function');
}

// Historia z rekordu + pola formularza jak lekarz + tryb PRO prawdziwym przełącznikiem.
// Wzrost rodziców siedzi w zwiniętej sekcji zaawansowanej, więc idzie przez wartość
// pola i zdarzenia — tak jak w tests/e2e/diet-recommendations-logic.spec.mjs.
async function wypelnij(page, { zHistoria = true } = {}) {
  if (zHistoria) {
    await page.evaluate((rekord) => window.applyLoadedData(JSON.parse(JSON.stringify(rekord))), REKORD);
  }
  // Po wczytaniu rekordu płeć jest zablokowana (idzie z rekordu) — wybieramy ją
  // tylko wtedy, gdy formularz jest pusty.
  if (await page.locator('#sex').isEnabled()) await page.selectOption('#sex', 'M');
  await page.fill('#age', '7');
  await page.fill('#ageMonths', '0');
  await page.fill('#height', '117');
  await page.fill('#weight', '20.5');
  await page.evaluate(() => {
    const ustaw = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    ustaw('advMotherHeight', 163);
    ustaw('advFatherHeight', 180);
    // Przełącznik PRO może być schowany w zwiniętym panelu — ta sama ścieżka co klik:
    // zmiana stanu i zdarzenie „change", na którym wisi obsługa trybu.
    const pro = document.getElementById('resultsModeToggle');
    if (pro && !pro.checked) {
      pro.checked = true;
      pro.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced();
  });
}

const przycisk = (page) => page.locator('.current-summary-actions [data-patient-narrative-copy-btn]');
const toast = (page) => page.locator('#patientReportPdfToast, #patientNarrativeToast');

// Etap 4: przebieg prognozy w czasie. Ten test sprawdza PRAWDZIWY łańcuch — eksport
// silnika Bayleya-Pinneau z vilda_advanced_growth.js, wczytanie jego tabel, adapter
// w vilda_patient_narrative_ui.js i moduł vilda_prediction_drift.js. Logika samego
// porównania ma testy jednostkowe; tutaj chodzi o to, że ogniwa naprawdę się łączą.
const REKORD_Z_WIEKIEM_KOSTNYM = {
  name: 'Testowy Adam',
  user: { lastName: 'Testowy', firstName: 'Adam', sex: 'M', age: 12, ageMonths: 0, height: 141, weight: 34 },
  advanced: {
    name: 'Testowy Adam',
    boneAgeYears: 13,
    motherHeight: 163,
    fatherHeight: 180,
    data: {
      measurements: [
        { ageMonths: 96, ageYears: 8, height: 122, weight: 24, boneAgeYears: 7.5 },
        { ageMonths: 120, ageYears: 10, height: 132, weight: 29, boneAgeYears: 10.5 },
      ],
    },
  },
};

test.describe('Przebieg prognozy w czasie — łańcuch do prawdziwego silnika', () => {
  test('prognoza jest przeliczana dla dawnych wizyt z wieku kostnego zapisanego przy pomiarze', async ({ page }) => {
    await otworz(page);
    await page.evaluate((r) => window.applyLoadedData(JSON.parse(JSON.stringify(r))), REKORD_Z_WIEKIEM_KOSTNYM);
    if (await page.locator('#sex').isEnabled()) await page.selectOption('#sex', 'M');
    await page.fill('#age', '12');
    await page.fill('#ageMonths', '0');
    await page.fill('#height', '141');
    await page.fill('#weight', '34');

    const stan = await page.evaluate(() => {
      const ustaw = (id, v) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      ustaw('advMotherHeight', 163);
      ustaw('advFatherHeight', 180);
      ustaw('advBoneAge', 13);
      const pro = document.getElementById('resultsModeToggle');
      if (pro && !pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
      if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced();
      const we = window.VildaPatientNarrativeUI.buildInput(
        window.advancedGrowthData || {},
        window.advancedGrowthTrajectory,
      );
      return {
        // Eksport jest globalem, jak reszta pomocników advGrowth* w tym pliku.
        silnikWyeksportowany: typeof window.advGrowthComputeBayleyPinneau === 'function',
        modulDryfu: Boolean(window.VildaPredictionDrift),
        dryf: we.predictionDrift,
      };
    });

    expect(stan.silnikWyeksportowany, 'silnik BP dostępny dla konsumentów').toBe(true);
    expect(stan.modulDryfu, 'moduł przebiegu prognozy załadowany').toBe(true);
    expect(stan.dryf, 'prawdziwy silnik policzył przebieg prognozy').not.toBeNull();
    // Co najmniej dwie wizyty z wiekiem kostnym → co najmniej dwa punkty prognozy.
    expect(stan.dryf.points.length).toBeGreaterThanOrEqual(2);
    for (const p of stan.dryf.points) {
      expect(Number.isFinite(p.cm), `prognoza dla ${p.ageMonths} mies. to liczba`).toBe(true);
      expect(p.cm).toBeGreaterThan(100);
      expect(p.cm).toBeLessThan(230);
    }
    // Punkty są posortowane wiekiem, a miara pochodzi z przedziału pierwszej prognozy.
    expect(stan.dryf.points[0].ageMonths).toBeLessThan(stan.dryf.points[stan.dryf.points.length - 1].ageMonths);
    expect(stan.dryf.yardstickCm, 'przedział błędu metody z prawdziwych tabel').toBeGreaterThan(0);
    expect(stan.dryf.coverage).toBe(90);
  });
});

test.describe('„Kopiuj opis pacjenta" w karcie Podsumowanie wyników', () => {
  test('przycisk stoi nad „Raport PDF dla pacjenta" i przeżywa ponowny render karty', async ({ page }) => {
    await otworz(page);
    await wypelnij(page);
    await expect(przycisk(page)).toBeVisible({ timeout: 20000 });

    const porzadek = await page.evaluate(() => {
      const wr = document.querySelector('.current-summary-actions');
      const kopiuj = wr.querySelector('[data-patient-narrative-copy-btn]');
      const pdf = wr.querySelector('[data-patient-report-pdf-btn]');
      return {
        tenSamWrapper: Boolean(kopiuj && pdf),
        kopiujPrzedPdf: Boolean(kopiuj && pdf && (kopiuj.compareDocumentPosition(pdf) & Node.DOCUMENT_POSITION_FOLLOWING)),
        ile: document.querySelectorAll('[data-patient-narrative-copy-btn]').length,
        etykieta: kopiuj && kopiuj.textContent.trim(),
      };
    });
    expect(porzadek.tenSamWrapper).toBe(true);
    expect(porzadek.kopiujPrzedPdf, 'nad przyciskiem PDF, nie pod').toBe(true);
    expect(porzadek.ile).toBe(1);
    expect(porzadek.etykieta).toBe('Kopiuj opis pacjenta');

    // Zmiana masy przerysowuje kartę (wrapper akcji jest budowany od nowa) — przycisk
    // ma wrócić dokładnie raz, nie zniknąć i nie zdublować się.
    await page.fill('#weight', '21');
    await expect(przycisk(page)).toBeVisible();
    await expect.poll(() => page.evaluate(
      () => document.querySelectorAll('[data-patient-narrative-copy-btn]').length,
    )).toBe(1);
  });

  test('kliknięcie kopiuje akapit do schowka i NIE pokazuje go na stronie', async ({ page }) => {
    await otworz(page);
    await wypelnij(page);
    await expect(przycisk(page)).toBeVisible({ timeout: 20000 });

    await przycisk(page).click();
    await expect(toast(page)).toContainText('skopiowano do schowka');

    const wynik = await page.evaluate(() => ({
      schowek: window.__schowek || '',
      naStronie: document.body.innerText,
    }));
    // Ten chłopiec na siatce OLAF spada z 104 cm w 4. roku na 117 cm w 7. — karta
    // stawia flagę deceleracji, więc przebieg idzie zdaniem o obniżeniu pozycji.
    expect(wynik.schowek).toContain('W wieku 7 lat chłopiec mierzy 117 cm');
    expect(wynik.schowek).toContain('pozycja centylowa wzrostu obniżyła się o');
    expect(wynik.schowek).toContain('Tempo wzrastania liczone z ostatnich 12 miesięcy obserwacji wynosi');
    expect(wynik.schowek).toContain('Wzrost matki wynosi 163 cm, ojca 180 cm; potencjał genetyczny wzrostu (MPH) oceniono na 178 cm (±8,5 cm,');
    expect(wynik.schowek).toContain('Prognozowany wzrost ostateczny wynosi');
    expect(wynik.schowek, 'jeden akapit, nie lista').not.toContain('\n');
    // Opis ma zostać w schowku — na stronie nie ma go w ogóle.
    expect(wynik.naStronie).not.toContain('pozycja centylowa wzrostu obniżyła się o');
    expect(wynik.naStronie).not.toContain('W wieku 7 lat chłopiec mierzy');
    expect(wynik.naStronie).not.toContain('potencjał genetyczny wzrostu (MPH)');
  });

  test('odmowa schowka nie jest cicha', async ({ page }) => {
    await otworz(page, { schowek: 'odmawia' });
    await wypelnij(page);
    await expect(przycisk(page)).toBeVisible({ timeout: 20000 });

    await przycisk(page).click();
    await expect(toast(page)).toContainText('odmówiła dostępu do schowka');
    expect(await page.evaluate(() => window.__schowek)).toBeUndefined();
  });

  test('bez historii pomiarów przycisk mówi, czego brakuje, i niczego nie kopiuje', async ({ page }) => {
    await otworz(page);
    await wypelnij(page, { zHistoria: false });
    await expect(przycisk(page)).toBeVisible({ timeout: 20000 });

    await przycisk(page).click();
    await expect(toast(page)).toContainText('co najmniej dwóch pomiarów');
    expect(await page.evaluate(() => window.__schowek)).toBeUndefined();
  });
});

// Etap 4b: SGA bez catch-upu. Ten test sprawdza PRAWDZIWY łańcuch na index.html — czyli
// tam, gdzie karty SGA w ogóle nie ma. Dane urodzeniowe idą z rekordu pacjenta (sekcja
// `birth`, GROWTH-BIRTH-REC), SDS liczy silnik karty SGA załadowany bez UI, a progi
// vilda_sga_catchup.js. To domyka obietnicę, że opis mówi to samo na obu stronach.
const REKORD_SGA = {
  name: 'Testowa Zofia',
  user: { lastName: 'Testowa', firstName: 'Zofia', sex: 'F', age: 4, ageMonths: 2, height: 92, weight: 13 },
  birth: {
    sourceChoice: 'niklasson', sourceKeys: ['niklasson'], sex: 'female',
    weeks: '39', days: '0', weight: '2150', length: '44', head: '32', hasComputed: true,
  },
  advanced: {
    name: 'Testowa Zofia',
    motherHeight: 158,
    fatherHeight: 170,
    data: {
      measurements: [
        { ageMonths: 24, ageYears: 2, height: 79, weight: 10 },
        { ageMonths: 36, ageYears: 3, height: 85, weight: 11.5 },
      ],
    },
  },
};

test.describe('SGA bez catch-upu — łańcuch bez karty SGA na stronie', () => {
  test('opis rozpoznaje SGA z rekordu i nazywa próg konsensusu', async ({ page }) => {
    await otworz(page);
    // Kontrola pozytywna: na index.html karty SGA naprawdę nie ma, a mimo to silnik
    // SDS urodzeniowych i moduł progów są dostępne.
    expect(await page.evaluate(() => Boolean(document.getElementById('sgaBirthCard')))).toBe(false);
    expect(await page.evaluate(() => Boolean(window.VildaSgaBirth && window.VildaSgaCatchUp))).toBe(true);

    await page.evaluate((r) => window.applyLoadedData(JSON.parse(JSON.stringify(r))), REKORD_SGA);
    if (await page.locator('#sex').isEnabled()) await page.selectOption('#sex', 'F');
    await page.fill('#age', '4');
    await page.fill('#ageMonths', '2');
    await page.fill('#height', '92');
    await page.fill('#weight', '13');
    await page.evaluate(() => {
      const pro = document.getElementById('resultsModeToggle');
      if (pro && !pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
      if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced();
    });

    await przycisk(page).click();
    await page.waitForFunction(() => typeof window.__schowek === 'string' && window.__schowek.length > 0);
    const t = await page.evaluate(() => window.__schowek);

    expect(t).toMatch(/urodzon[ae] jako SGA/);
    expect(t).toMatch(/39 tc/);
    expect(t).toMatch(/poniżej progu −2,0 SD/);
    expect(t).toMatch(/konsensus międzynarodowy z 2023 roku/);
  });
});

// GROWTH-PERINATAL-SRC: ten sam pacjent, ale dane urodzeniowe wpisane WYŁĄCZNIE w Karcie
// Pacjenta („Dane okołoporodowe"), bez sekcji `birth` i bez karty SGA. Do SW 1.0.863 opis
// w takiej sytuacji w ogóle nie powstawał.
//
// Uczciwie o harnessie: sekcja `perinatal` żyje w zaszyfrowanym rekordzie i normalnie
// trafia do pamięci modułu po wczytaniu pacjenta z sejfu. Test podaje ją wprost przez
// `zapamietaj(...)` — czyli podmienia JEDNO ogniwo (odczyt z sejfu). Wszystko dalej jest
// prawdziwe: zamiana pól, wybór źródła, silnik SDS, progi konsensusu i kompozycja opisu.
const REKORD_BEZ_BIRTH = {
  name: 'Testowa Zofia',
  user: { lastName: 'Testowa', firstName: 'Zofia', sex: 'F', age: 4, ageMonths: 2, height: 92, weight: 13 },
  advanced: {
    name: 'Testowa Zofia',
    motherHeight: 158,
    fatherHeight: 170,
    data: {
      measurements: [
        { ageMonths: 24, ageYears: 2, height: 79, weight: 10 },
        { ageMonths: 36, ageYears: 3, height: 85, weight: 11.5 },
      ],
    },
  },
};

const PERINATAL = {
  gestationalWeeks: '39', gestationalDays: '0',
  birthWeightG: '2150', birthLengthCm: '44', birthHeadCircCm: '32',
  gravidity: '2', parity: '2',
};

test.describe('Dane okołoporodowe z Karty Pacjenta zasilają opis', () => {
  test('opis powstaje, choć rekord nie ma sekcji `birth`, a strona nie ma karty SGA', async ({ page }) => {
    await otworz(page);
    await page.waitForFunction(() => Boolean(window.VildaPerinatalSource));

    await page.evaluate((r) => window.applyLoadedData(JSON.parse(JSON.stringify(r))), REKORD_BEZ_BIRTH);
    await page.evaluate((per) => {
      window.VildaPerinatalSource.zapamietaj({ perinatal: per, user: { sex: 'F' } });
    }, PERINATAL);

    // Kontrole pozytywne: karty SGA nie ma, sekcji `birth` nie ma, a mimo to dane są.
    const stan = await page.evaluate(() => ({
      kartaSga: Boolean(document.getElementById('sgaBirthCard')),
      przeniesione: window.vildaBirthData,
      zrodlo: window.VildaPerinatalSource.biezace(),
    }));
    expect(stan.kartaSga, 'na index.html karty SGA nie ma').toBe(false);
    expect(stan.przeniesione, 'rekord nie niósł sekcji `birth`').toBeFalsy();
    expect(stan.zrodlo.weight, 'dane idą z Karty Pacjenta').toBe('2150');
    expect(stan.zrodlo.sex, 'płeć wzięta z sekcji `user` rekordu').toBe('female');

    if (await page.locator('#sex').isEnabled()) await page.selectOption('#sex', 'F');
    await page.fill('#age', '4');
    await page.fill('#ageMonths', '2');
    await page.fill('#height', '92');
    await page.fill('#weight', '13');
    await page.evaluate(() => {
      const pro = document.getElementById('resultsModeToggle');
      if (pro && !pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
      if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced();
    });

    await przycisk(page).click();
    await page.waitForFunction(() => typeof window.__schowek === 'string' && window.__schowek.length > 0);
    const t = await page.evaluate(() => window.__schowek);

    expect(t).toMatch(/urodzon[ae] jako SGA/);
    expect(t).toMatch(/39 tc/);
    expect(t).toMatch(/poniżej progu −2,0 SD/);
  });
});
