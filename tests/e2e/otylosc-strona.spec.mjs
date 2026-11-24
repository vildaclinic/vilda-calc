import { expect, test } from '../support/test-czas.mjs';

// P-OTYLOSC-STRONA (temat D projektu „Leczenie otyłości — wpisy poza wizytą”; makieta zaakceptowana 2026-11-20:
// pomiary od pacjenta oznaczone w istniejących listach i siatkach, bez osobnych tabel). PRAWDZIWA strona główna:
//   ST-1 „Podsumowanie wyników”: wiersz Waga z linijką „◇ od pacjenta 12.11.2026: 74,6 kg”; siatka wagi — romby
//        obok przebiegu, legenda „dane z gabinetu” (kropka) i „dane od pacjenta” (romb), dymek przy rombie;
//   ST-2 „Zaawansowane obliczenia wzrostowe”: bloki „pomiar od pacjenta” tylko do odczytu w „Poprzednich pomiarach”
//        (w kolejności wieku, poza zapisem wizyty), liczniki w nagłówku, analiza trajektorii z wpisami; PDF siatki
//        z legendą „dane od pacjenta”;
//   ST-3 „Porównanie z poprzednim pomiarem”: żeton „w odcinku 2 pomiary od pacjenta” i linijka w wierszu Waga;
//   ST-4 telefon: siatka z rombami bez poziomego przewijania;
//   ST-5 pacjent bez dziennika — wszystko jak dotąd.
// Dane pacjentów wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#OtyloscStrona!26';
const W = 'Wegovy (semaglutyd) – s.c. 1×/tydz.';
const MIGAWKA = [
  { id: 'p-start', type: 'start', dateISO: '2026-04-14', ageYears: 13, ageMonths: 0, weight: 80, height: 160, drug: W, substance: '', dose: '0,25 mg / tydz.' },
  { id: 'p-paz', type: 'continue', dateISO: '2026-10-13', ageYears: 13, ageMonths: 6, weight: 75.2, height: 162.9, drug: W, substance: '', dose: '2,4 mg / tydz.' },
];
const POMIARY = [
  { ageYears: 11, ageMonths: 132, height: 150.2, weight: 63.0 },
  { ageYears: 12, ageMonths: 144, height: 155.0, weight: 70.5 },
  { ageYears: 13, ageMonths: 156, height: 160.0, weight: 80.0 },
];
const WPISY = [['2026-07-10', 3, 77.8], ['2026-08-12', 4, 76.9], ['2026-11-12', 7, 74.6]];

async function otworz(page, viewport) {
  if (viewport) await page.setViewportSize(viewport);
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked() && window.VildaProAccess
    && window.VildaDziennikOtylosci && typeof window.applyLoadedData === 'function');
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.evaluate(() => { const a = document.getElementById('vilda-auth-ui-root'); if (a) a.style.display = 'none'; });
  const baner = page.locator('#consent-decline');
  if (await baner.count() && await baner.isVisible()) await baner.click();
}

async function trybPro(page) {
  await page.waitForFunction(() => {
    window.VildaProAccess.hasAccess = () => true;
    const t = document.getElementById('resultsModeToggle');
    if (!t) return false;
    if (!t.checked) { t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); }
    return window.professionalMode === true;
  }, null, { timeout: 15000 });
}

/** Pacjentka z wizytami 11, 12, 13 lat i bieżącym pomiarem 13 l. 6 mies. (13.10.2026); wpisy od pacjenta w dzienniku. */
async function pacjentka(page, wpisy) {
  return page.evaluate(async ({ migawka, pomiary, wpisy: lista, lek }) => {
    const r = await window.VildaVault.savePatient({
      name: 'Testowa Zuzanna',
      user: { lastName: 'Testowa', firstName: 'Zuzanna', sex: 'F', age: 13, ageMonths: 6, height: 162.9, weight: 75.2, dobISO: '2013-04-11', measuredAtISO: '2026-10-13' },
      advanced: { data: { measurements: pomiary } },
      obesityTherapyPoints: migawka,
    }, { dedup: false });
    const D = window.VildaDziennikOtylosci;
    for (const [d, m, kg] of lista) {
      const plan = D.planNowego(await D.wczytaj(r.patientId, migawka), r.patientId, {
        type: 'continue', dateISO: d, ageYears: Math.floor(m / 12) + 13, ageMonths: m % 12, weight: kg, weightSource: 'pacjent', height: null, drug: lek, substance: '', dose: '2,4 mg / tydz.',
      });
      if (!plan.ok) throw new Error('plan: ' + JSON.stringify(plan.bledy));
      await D.zapisz(r.patientId, plan.wersje);
    }
    return r.patientId;
  }, { migawka: MIGAWKA, pomiary: POMIARY, wpisy, lek: W });
}

/** Wczytanie pacjentki z sejfu jak z listy pacjentów; „Odtwórz” albo „Nowy pomiar”. */
async function wczytaj(page, pid, tryb, liczbaWpisow) {
  await page.evaluate(async (id) => {
    const p = await window.VildaVault.getPatient(id);
    const snap = p.snapshots[0];
    window.applyLoadedData(snap.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: id, savedAtISO: snap.savedAtISO || null, snapshotCount: p.snapshotCount || 1, source: 'pick' },
    }));
  }, pid);
  await page.waitForFunction(() => typeof window._vildaCurrentPatientId === 'string');
  if (tryb === 'nowy') {
    const nowy = page.getByRole('button', { name: 'Nowy pomiar' }).first();
    await expect(nowy).toBeVisible({ timeout: 10000 });
    await nowy.click();
  } else {
    // Okno „Odtwórz zapis / Nowy pomiar” pojawia się chwilę po wczytaniu pacjenta.
    const odtworz = page.locator('#vildaLcmRestore');
    await expect(odtworz).toBeVisible({ timeout: 15000 });
    await odtworz.click();
    await expect(page.locator('#currentSummaryCard')).toHaveAttribute('data-comparison-visible', 'false', { timeout: 15000 });
  }
  await trybPro(page);
  if (liczbaWpisow) {
    await expect.poll(() => page.evaluate(() => {
      const p = window.VildaDziennikOtylosci.punktyWczytanego();
      return p ? p.length : 0;
    }), { timeout: 15000 }).toBeGreaterThanOrEqual(liczbaWpisow);
  }
  await page.evaluate(() => { if (typeof window.update === 'function') window.update(); });
}

const norm = (t) => String(t || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();

async function siatkaWagi(page) {
  const karta = page.locator('#currentSummaryCard');
  await karta.locator('[role="tab"]').filter({ hasText: /^\s*Siatka centylowa\s*$/ }).first().click();
  await karta.locator('button').filter({ hasText: /^\s*Waga\s*$/ }).first().click();
  await expect(karta.locator('svg.vilda-centile-live-preview')).toBeVisible({ timeout: 15000 });
  return karta;
}

test.describe('Pomiary od pacjenta w całej aplikacji — odtworzenie ostatniej wizyty', () => {
  test.use({ chwila: '2026-11-20T12:00:00Z' });

  test('ST-1: „Podsumowanie wyników” — linijka pod Waga, romby na siatce, legenda i dymek', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    await trybPro(page);
    const pid = await pacjentka(page, WPISY);
    await wczytaj(page, pid, 'odtworz', 5);

    const karta = page.locator('#currentSummaryCard');
    await expect(karta).toBeVisible({ timeout: 15000 });
    const waga = karta.locator('.professional-summary-row[data-summary-key="weight"]');
    await expect(waga.locator('.professional-summary-reported')).toHaveText('od pacjenta 12.11.2026: 74,6 kg', { timeout: 15000 });
    await expect(karta.locator('.professional-summary-reported'), 'tylko w wierszu Waga').toHaveCount(1);

    await siatkaWagi(page);
    const romby = karta.locator('polygon.vilda-centile-live-preview-reported-patient');
    await expect(romby).toHaveCount(3, { timeout: 15000 });
    expect(await romby.evaluateAll((l) => l.map((e) => [e.dataset.ageMonths, e.dataset.value, e.dataset.date]))).toEqual([
      ['159', '77.8', '2026-07-10'], ['160', '76.9', '2026-08-12'], ['163', '74.6', '2026-11-12'],
    ]);
    // Przebieg (linia i kropki) — tylko pomiary z gabinetu.
    await expect(karta.locator('circle.vilda-centile-live-preview-point')).toHaveCount(4);
    const legenda = karta.locator('.vilda-centile-live-metadata');
    await expect(legenda.locator('.vilda-centile-live-legend--office')).toHaveText('dane z gabinetu');
    await expect(legenda.locator('.vilda-centile-live-legend--patient')).toHaveText('dane od pacjenta');
    await expect(legenda.locator('.vilda-centile-live-count')).toBeHidden();

    // Dymek przy rombie 12.11.2026.
    const romb = romby.nth(2);
    await romb.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await romb.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const dymek = karta.locator('.vilda-centile-live-tooltip').first();
    await expect(dymek).toBeVisible({ timeout: 5000 });
    await expect(dymek.locator('.vilda-centile-live-tooltip-age')).toHaveText('◇ od pacjenta · 13 lat 7 mies.');
    await expect(dymek.locator('.vilda-centile-live-tooltip-reading')).toHaveText('Waga 74,6 kg');
    await expect(dymek.locator('.vilda-centile-live-tooltip-date')).toHaveText('12.11.2026');
  });

  test('ST-2: „Poprzednie pomiary” — bloki „pomiar od pacjenta”, poza zapisem wizyty; analiza i PDF', async ({ page }) => {
    test.setTimeout(180_000);
    await otworz(page);
    await trybPro(page);
    const pid = await pacjentka(page, WPISY);
    await wczytaj(page, pid, 'odtworz', 5);
    await page.waitForSelector('#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]', { state: 'attached', timeout: 15000 });
    await page.locator('#toggleAdvancedGrowth').click();
    await page.evaluate(() => { if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced(); });

    const lista = page.locator('#advMeasurements');
    await expect(lista.locator(':scope > .adv-dz-row')).toHaveCount(3, { timeout: 15000 });
    // Kolejność wieku: trzy wizyty, potem trzy wpisy (13 l. 3, 4 i 7 mies.).
    await expect.poll(() => lista.evaluate((el) => [...el.children].map((n) => (n.classList.contains('adv-dz-row')
      ? 'dz:' + n.dataset.ageMonths : n.classList.contains('measure-row') ? 'w:' + n.querySelector('.adv-age-years').value : '?'))), { timeout: 10000 }).toEqual(
      ['w:11', 'w:12', 'w:13', 'dz:159', 'dz:160', 'dz:163']);
    await expect(lista.locator('.adv-dz-badge')).toHaveText(['pomiar od pacjenta', 'pomiar od pacjenta', 'pomiar od pacjenta']);
    expect(await lista.locator('.adv-dz-row').nth(2).locator('.adv-dz-value').allTextContents()).toEqual(['13', '7', '—', '74,6', '']);
    await expect(lista.locator('.adv-dz-row input'), 'blok tylko do odczytu').toHaveCount(0);
    await expect(page.locator('#advHistoryCount')).toHaveText('6 pomiarów');
    await expect(page.locator('#advHistoryPatient')).toHaveText('3 od pacjenta');
    // Zapis wizyty i obliczenia wierszy — bez bloków dziennika.
    expect(await page.evaluate(() => collectAdvancedMeasurements().length)).toBe(3);

    const analiza = page.locator('#advResults .vtap');
    await expect(analiza.locator('.vtap-mchip.vtap-pac')).toHaveText('w tym 3 od pacjenta', { timeout: 15000 });
    await expect(analiza.locator('.vtap-card-pac .nm')).toHaveText('Waga');
    await expect(analiza.locator('.vtap-card-pac .vtap-pac-l'), 'podpis karty schowany jak na makiecie').toBeHidden();

    // Zwinięta lista chowa bloki razem z wierszami.
    await page.locator('#advHistoryToggle').click();
    await expect(lista.locator(':scope > .adv-dz-row').first()).toBeHidden();
    await page.locator('#advHistoryToggle').click();

    // PDF „Generuj siatkę OLAF”: legenda „dane od pacjenta” pod siatkami (romby rysuje ten sam wywołany moduł).
    await page.evaluate(() => {
      window.__teksty = [];
      const org = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t) { window.__teksty.push(String(t)); return org.apply(this, arguments); };
    });
    const pobranie = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
    await page.getByRole('button', { name: /Generuj siatkę OLAF/ }).first().click();
    await expect.poll(() => page.evaluate(() => window.__teksty.includes('dane od pacjenta')), { timeout: 60000 }).toBe(true);
    expect(await page.evaluate(() => window.__teksty.includes('dane z gabinetu'))).toBe(true);
    expect(await page.evaluate(() => window.__teksty.some((t) => /od pacjenta \(|Wpisy leczenia/.test(t))), 'ramka podsumowania bez wpisów od pacjenta').toBe(false);
    await pobranie;
  });
});

test.describe('Porównanie z poprzednim pomiarem — wpisy od pacjenta w odcinku', () => {
  // Dziś 13 l. 9 mies.; poprzedni pomiar 13 l. 6 mies. (13.10.2026); wpisy od pacjenta 13 l. 7 i 8 mies.
  test.use({ chwila: '2027-01-20T12:00:00Z' });

  test('ST-3: żeton „w odcinku 2 pomiary od pacjenta” i linijka pod „Dziś” w wierszu Waga; zmiana liczona między wizytami', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    await trybPro(page);
    const pid = await pacjentka(page, [['2026-11-12', 7, 74.6], ['2026-12-15', 8, 74.1]]);
    await wczytaj(page, pid, 'nowy', 4);
    await page.evaluate(() => {
      for (const [id, v] of [['weight', '73.5'], ['height', '163.6']]) {
        const el = document.getElementById(id);
        el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (typeof window.update === 'function') window.update();
    });
    const karta = page.locator('#prevSummaryCard');
    await expect(karta).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#porownaniePacjent')).toHaveText('w odcinku 2 pomiary od pacjenta', { timeout: 15000 });
    const waga = karta.locator('tr[data-klucz="masa"]');
    await expect(waga.locator('.pt-pacjent')).toHaveText('od pacjenta 15.12.2026: 74,1 kg');
    await expect(waga.locator('.pt-zmiana .pt-d')).toHaveText('−1,7 kg');
    await expect(karta.locator('.pt-pacjent'), 'tylko w wierszu Waga').toHaveCount(1);
  });
});

test.describe('Telefon i pacjent bez dziennika', () => {
  test.use({ chwila: '2026-11-20T12:00:00Z' });

  test('ST-4: telefon — siatka wagi z rombami i legendą, bez poziomego przewijania', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page, { width: 390, height: 844 });
    await trybPro(page);
    const pid = await pacjentka(page, WPISY);
    await wczytaj(page, pid, 'odtworz', 5);
    const karta = await siatkaWagi(page);
    await expect(karta.locator('polygon.vilda-centile-live-preview-reported-patient')).toHaveCount(3, { timeout: 15000 });
    await expect(karta.locator('.vilda-centile-live-legend--patient')).toBeVisible();
    expect(await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test('ST-5: pacjent bez dziennika — linijki, romby, bloki i żetony nie pojawiają się', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    await trybPro(page);
    const pid = await pacjentka(page, []);
    await wczytaj(page, pid, 'odtworz', 0);
    await page.waitForTimeout(1500);
    const karta = page.locator('#currentSummaryCard');
    await expect(karta.locator('.professional-summary-row[data-summary-key="weight"]')).toBeVisible({ timeout: 15000 });
    await expect(karta.locator('.professional-summary-reported')).toHaveCount(0);
    await siatkaWagi(page);
    await expect(karta.locator('polygon.vilda-centile-live-preview-reported-patient')).toHaveCount(0);
    expect(norm(await karta.locator('.vilda-centile-live-legend').first().textContent())).toBe('Przebieg pacjenta');
    await expect(karta.locator('.vilda-centile-live-legend--patient')).toBeHidden();
    await expect(karta.locator('.vilda-centile-live-count')).toHaveText(/Dziewczęta · 4 pomiary/);
    await expect(page.locator('#advMeasurements .adv-dz-row')).toHaveCount(0);
  });
});

/** PDF siatki Palczewskiej z przycisku strony: liczba stron i ile razy narysowano legendę „dane od pacjenta”. */
async function pdfPalczewskiej(page, poziom) {
  return page.evaluate(async (pozioma) => {
    window.__teksty = [];
    window.__strony = 0;
    if (!window.__szpieg) {
      window.__szpieg = true;
      const tekst = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t) { window.__teksty.push(String(t)); return tekst.apply(this, arguments); };
      const obraz = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function () { if (this.width > 1500) window.__strony += 1; return obraz.apply(this, arguments); };
      window.open = () => null;
    }
    window.VildaProAccess.hasAccess = () => true;
    const pal = document.getElementById('sourcePalczewska');
    pal.disabled = false; pal.checked = true; pal.dispatchEvent(new Event('change', { bubbles: true }));
    window.updateCentileButtons();
    const uklad = document.getElementById(pozioma ? 'palPdfLayoutLandscape' : 'palPdfLayoutPortrait');
    uklad.checked = true; uklad.dispatchEvent(new Event('change', { bubbles: true }));
    await window.generatePalczewskaCentileCharts();
    return { strony: window.__strony, legenda: window.__teksty.filter((t) => t === 'dane od pacjenta').length,
      gabinet: window.__teksty.filter((t) => t === 'dane z gabinetu').length };
  }, poziom);
}

test.describe('Siatka Palczewskiej 1–18 lat (PDF) i DocPro', () => {
  test.use({ chwila: '2026-11-20T12:00:00Z' });

  test('ST-6: PDF siatki Palczewskiej 1–18 lat — romby i legenda na stronie wagi (pion) i pod stopką (poziom)', async ({ page }) => {
    test.setTimeout(180_000);
    await otworz(page);
    await trybPro(page);
    const pid = await pacjentka(page, WPISY);
    await wczytaj(page, pid, 'odtworz', 5);
    // Pion: dwie strony (wzrost, waga); romby tylko na wadze (wpisy bez wzrostu) — legenda raz.
    expect(await pdfPalczewskiej(page, false)).toEqual({ strony: 2, legenda: 1, gabinet: 1 });
    // Poziom: jedna strona z dwoma wykresami — legenda raz, pod stopką.
    expect(await pdfPalczewskiej(page, true)).toEqual({ strony: 1, legenda: 1, gabinet: 1 });
  });

  test('ST-7: pacjent bez dziennika — PDF Palczewskiej bez legendy', async ({ page }) => {
    test.setTimeout(150_000);
    await otworz(page);
    await trybPro(page);
    const pid = await pacjentka(page, []);
    await wczytaj(page, pid, 'odtworz', 0);
    expect(await pdfPalczewskiej(page, false)).toEqual({ strony: 2, legenda: 0, gabinet: 0 });
  });

  test('ST-8: DocPro — linijka pod Waga, romby na siatce i analiza z wpisami; bez bloków w „Poprzednich pomiarach”', async ({ page }) => {
    test.setTimeout(180_000);
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
        window.localStorage.setItem('pwzNumber', '6000001');
      } catch (_) { /* brak storage — pomiń */ }
    });
    await page.goto('/docpro.html', { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaVault));
    await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked() && window.VildaProAccess
      && window.VildaDziennikOtylosci && typeof window.applyLoadedData === 'function');
    await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
    await page.evaluate(() => {
      window.VildaProAccess.hasAccess = () => true;
      document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
      const t = document.getElementById('resultsModeToggle');
      if (t && !t.checked) { t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(1200);
    const potwierdzam = page.locator('#professionalConfirmBtn');
    if (await potwierdzam.isVisible()) await potwierdzam.click();
    const bezAnalityki = page.getByRole('button', { name: 'Nie zgadzam się', exact: true });
    if (await bezAnalityki.isVisible()) await bezAnalityki.click();
    const pid = await pacjentka(page, WPISY);
    await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (rekord) => { if (rekord) window.applyLoadedData(rekord); }, null), pid);
    await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
    await page.locator('#vildaLcmRestore').click();
    await page.waitForFunction((id) => window._vildaCurrentPatientId === id, pid);
    await expect.poll(() => page.evaluate(() => (window.VildaDziennikOtylosci.punktyWczytanego() || []).length), { timeout: 15000 }).toBe(5);
    await page.evaluate(() => { if (typeof window.update === 'function') window.update(); });

    const karta = page.locator('#currentSummaryCard');
    await expect(karta.locator('.professional-summary-row[data-summary-key="weight"] .professional-summary-reported'))
      .toHaveText('od pacjenta 12.11.2026: 74,6 kg', { timeout: 15000 });
    await siatkaWagi(page);
    await expect(karta.locator('polygon.vilda-centile-live-preview-reported-patient')).toHaveCount(3, { timeout: 15000 });
    await expect(karta.locator('.vilda-centile-live-legend--patient')).toHaveText('dane od pacjenta');

    await page.evaluate(() => { if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced(); });
    await expect(page.locator('#advResults .vtap-mchip.vtap-pac')).toHaveText('w tym 3 od pacjenta', { timeout: 15000 });
    // Bloki „pomiar od pacjenta” tylko na stronie głównej (lista ze zwijanym nagłówkiem); DocPro ma własny monitor.
    await expect(page.locator('#advMeasurements .adv-dz-row')).toHaveCount(0);
  });
});
