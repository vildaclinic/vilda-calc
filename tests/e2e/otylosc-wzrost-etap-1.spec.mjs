import { expect, test } from '../support/test-czas.mjs';

// P-OTYLOSC-WZROST, etap 1 projektu „Leczenie otyłości — wpisy poza wizytą” (decyzje właściciela
// 2026-11-17/18; makieta zaakceptowana 2026-11-18). Rodzic co miesiąc przysyła masę dziecka, a wzrostu
// nie mierzy się co miesiąc (dorosły w ogóle nie rośnie). Na PRAWDZIWYCH stronach:
//  • monitor DocPro: Kontynuacja zapisuje się bez wzrostu; Włączenie i Zakończenie cyklu dziecka wymagają
//    wzrostu (R9); każdy nowy punkt wymaga daty wizyty (R8); zły wzrost to błąd przy polu; pod polem ostatni
//    zapisany wzrost; „Uzupełnij z formularza” wpisuje datę pomiaru tej wizyty;
//  • Karta pacjenta: u dziecka (ocena z BMI) ocena wg ChPL liczy się z ostatniego punktu ze wzrostem w oknie
//    oceny, a bez niego jest wstrzymana: „Potrzebny pomiar wzrostu do oceny ChPL”. Dorośli — bez zmian.
// Dane wyłącznie FIKCYJNE (przykład z makiety: Testowa Zuzanna, 13 l., Wegovy); sejf zakładany na potrzeby testu.

test.use({ chwila: '2026-11-18T12:00:00Z' });

const WEGOVY = 'Wegovy (semaglutyd) – s.c. 1×/tydz.';
const P = (id, type, dateISO, lata, mies, weight, height, drug = WEGOVY, dose = '2,4 mg / tydz.') => ({
  id, type, dateISO, ageYears: lata, ageMonths: mies, weight, height,
  bmi: height > 0 ? +(weight / Math.pow(height / 100, 2)).toFixed(1) : null, drug, substance: '', dose,
});
const WL = P('w', 'start', '2026-04-14', 13, 0, 80, 160, WEGOVY, '0,25 mg / tydz.');
const PAZ13 = P('k6', 'continue', '2026-10-13', 13, 6, 75.2, 162.9);
const PAZ27 = P('k6b', 'continue', '2026-10-27', 13, 6, 74.9, 163.0);
const LIS10 = P('k7', 'continue', '2026-11-10', 13, 7, 74.6, null);
const LIS17 = P('k8', 'continue', '2026-11-17', 13, 7, 74.3, 163.4);

const HASLO = 'E2e#WzrostOtylosc!26';

async function konto(page, strona) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      // Zapamiętany numer PWZ pomija bramkę modułu lekarskiego; wartość jawnie fikcyjna.
      window.localStorage.setItem('pwzNumber', '0000000');
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto(strona, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

async function otworzMonitor(page, punkty) {
  await konto(page, '/docpro.html');
  await page.waitForFunction(() => Boolean(window.VildaProAccess) && typeof window.obesityAddTherapyPoint === 'function'
    && Boolean(window.VildaCykleLeczenia));
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
  await page.evaluate((pts) => {
    window.obesityTherapyMonitorSetPoints(pts);
    const karta = document.getElementById('obesityCard');
    if (!karta || karta.style.display === 'none' || !karta.style.display) document.getElementById('toggleObesityTherapy').click();
    document.getElementById('obesityTabMonBtn').click();
  }, punkty);
  await expect(page.locator('#obesityMonitorSection')).toBeVisible({ timeout: 10000 });
}

async function wpisz(page, pola) {
  await page.evaluate((p) => {
    const set = (id, v) => { const e = document.getElementById(id); if (e && v !== undefined) { e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('obesityAge', p.lata); set('obesityAgeMonths', p.mies);
    set('obesityWeight', p.masa); set('obesityHeight', p.wzrost);
    set('obesityDose', p.dawka); set('obesityDate', p.data);
  }, pola);
}

const przycisk = (page, nazwa) => page.locator('#obesityMonitorSection .obm-visit button', { hasText: nazwa });
const komunikat = (page) => page.locator('#obesityTherapyActionMsg');
const punkty = (page) => page.evaluate(() => (window.obesityTherapyPoints || []).map((p) => ({
  typ: p.type, data: p.dateISO, masa: p.weight, wzrost: p.height, bmi: p.bmi,
})));

test.describe('monitor DocPro', () => {
  test('WZ-1: Kontynuacja z samą masą zapisuje się bez wzrostu; Zakończenie u dziecka wymaga wzrostu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzMonitor(page, [WL, PAZ13]);
    await expect(page.locator('#obesityHeightLast'), 'pod polem ostatni zapisany wzrost').toHaveText('Ostatni wzrost: 162,9 cm · 13.10.2026');
    await expect(page.locator('#obesityMonitorSection .obm-rule')).toContainText('Kontynuacja — wzrost tylko, jeśli był mierzony');
    await wpisz(page, { lata: 13, mies: 7, masa: 74.6, wzrost: '', data: '2026-11-10' });

    await expect(przycisk(page, 'Kontynuacja leczenia')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(przycisk(page, 'Zakończenie leczenia')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#obesityWhy-end')).toHaveText('Wymaga wzrostu');

    await przycisk(page, 'Kontynuacja leczenia').click();
    await expect(komunikat(page)).toBeHidden();
    const po = await punkty(page);
    expect(po).toHaveLength(3);
    expect(po[2]).toEqual({ typ: 'continue', data: '2026-11-10', masa: 74.6, wzrost: null, bmi: null });
    // Wiersz bez wzrostu: BMI „—”, redukcja masy liczona.
    const wiersz = page.locator('#obesityTherapyTableWrap tr', { hasText: '10.11.2026' });
    await expect(wiersz).toContainText('74,6');
    await expect(wiersz).toContainText('−6,8%');
    // Dawny wzrost dalej jest „ostatnim”.
    await expect(page.locator('#obesityHeightLast')).toHaveText('Ostatni wzrost: 162,9 cm · 13.10.2026');

    // Zakończenie dziecka bez wzrostu: kliknięcie pokazuje pełny komunikat i wskazuje pole.
    await wpisz(page, { lata: 13, mies: 7, masa: 74.4, wzrost: '', data: '2026-11-17' });
    await przycisk(page, 'Zakończenie leczenia').click({ force: true });
    await expect(komunikat(page)).toHaveClass(/\berr\b/);
    await expect(komunikat(page)).toContainText('Zakończenie leczenia u dziecka wymaga wzrostu');
    await expect(page.locator('#obesityHeight')).toHaveAttribute('aria-invalid', 'true');
    expect(await punkty(page)).toHaveLength(3);
    // Wpisanie wzrostu zdejmuje oznaczenie pola, a Zakończenie przechodzi.
    await wpisz(page, { wzrost: '163,4' });
    await expect(page.locator('#obesityHeight')).not.toHaveAttribute('aria-invalid', 'true');
    await przycisk(page, 'Zakończenie leczenia').click();
    await expect(komunikat(page)).toBeHidden();
    expect((await punkty(page))[3]).toMatchObject({ typ: 'end', wzrost: 163.4 });
  });

  test('WZ-2: nowa Kontynuacja bez daty — odmowa przy przycisku i przy polu daty', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzMonitor(page, [WL, PAZ13]);
    await wpisz(page, { lata: 13, mies: 7, masa: 74.6, wzrost: '', data: '' });
    await expect(przycisk(page, 'Kontynuacja leczenia')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#obesityWhy-continue')).toHaveText('Wymaga daty wizyty');
    await przycisk(page, 'Kontynuacja leczenia').click({ force: true });
    await expect(komunikat(page)).toContainText('Punkt „Kontynuacja” wymaga daty wizyty');
    await expect(page.locator('#obesityDate')).toHaveAttribute('aria-invalid', 'true');
    expect(await punkty(page)).toHaveLength(2);
  });

  test('WZ-3: wpisany, ale zły wzrost to błąd — nie znika po cichu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzMonitor(page, [WL, PAZ13]);
    await wpisz(page, { lata: 13, mies: 7, masa: 74.6, wzrost: 'abc', data: '2026-11-10' });
    await przycisk(page, 'Kontynuacja leczenia').click({ force: true });
    await expect(komunikat(page)).toHaveText('Wzrost: wpisz liczbę w cm (np. 163,5) albo zostaw pole puste, jeśli wzrostu nie mierzono.');
    await expect(page.locator('#obesityHeight')).toHaveAttribute('aria-invalid', 'true');
    expect(await punkty(page)).toHaveLength(2);
    // Masa nadal obowiązkowa — komunikat już bez wzrostu.
    await wpisz(page, { masa: '', wzrost: '' });
    await przycisk(page, 'Kontynuacja leczenia').click({ force: true });
    await expect(komunikat(page)).toHaveText('Uzupełnij co najmniej wiek i masę, aby dodać punkt leczenia.');
  });

  test('WZ-4: Włączenie bez wzrostu wyłączone; ze wzrostem przechodzi', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzMonitor(page, []);
    await wpisz(page, { lata: 13, mies: 0, masa: 80, wzrost: '', data: '2026-04-14' });
    await expect(przycisk(page, 'Włączenie leczenia')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#obesityWhy-start')).toHaveText('Wymaga wzrostu');
    await expect(page.locator('#obesityHeightLast')).toBeHidden();
    await wpisz(page, { wzrost: '160' });
    await expect(przycisk(page, 'Włączenie leczenia')).not.toHaveAttribute('aria-disabled', 'true');
    await przycisk(page, 'Włączenie leczenia').click();
    expect(await punkty(page)).toEqual([{ typ: 'start', data: '2026-04-14', masa: 80, wzrost: 160, bmi: 31.2 }]);
  });

  test('WZ-5: „Uzupełnij z formularza” wpisuje datę pomiaru tej wizyty, a bez pewnej daty — dzisiejszą', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzMonitor(page, [WL]);
    const wynik = await page.evaluate(() => {
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
      set('age', '13'); set('ageMonths', '6'); set('weight', '75.2'); set('height', '162.9');
      const dob = window.VildaDobAge;
      const oryg = dob && dob.readMeasuredAtISO;
      const out = {};
      dob.readMeasuredAtISO = () => '2026-10-13';
      window.obesityPrefillTherapyPoint();
      out.zPomiaru = document.getElementById('obesityDate').value;
      out.wzrost = document.getElementById('obesityHeight').value;
      dob.readMeasuredAtISO = () => null;
      window.obesityPrefillTherapyPoint();
      out.bezPewnejDaty = document.getElementById('obesityDate').value;
      dob.readMeasuredAtISO = oryg;
      return out;
    });
    expect(wynik).toEqual({ zPomiaru: '2026-10-13', wzrost: '162.9', bezPewnejDaty: '2026-11-18' });
    await expect(page.locator('.obm-prefill-hint')).toContainText('data pomiaru tej wizyty');
  });

  test('WZ-6: edycja — usunięcie wzrostu z Kontynuacji pyta o skutki, z Włączenia jest odmową', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzMonitor(page, [WL, PAZ13]);
    const out = await page.evaluate(() => {
      const pytania = [];
      const confirm = window.confirm;
      window.confirm = (m) => { pytania.push(String(m)); return true; };
      window.obesityEditTherapyPoint('k6');
      document.getElementById('obesityHeight').value = '';
      const kontynuacja = window.obesitySaveTherapyPointEdit('continue');
      window.obesityEditTherapyPoint('w');
      document.getElementById('obesityHeight').value = '';
      const wlaczenie = window.obesitySaveTherapyPointEdit('start');
      const msg = document.getElementById('obesityTherapyActionMsg').textContent;
      window.confirm = confirm;
      const pts = window.obesityTherapyPoints;
      return { kontynuacja, wlaczenie, pytania, msg, wzrosty: pts.map((p) => p.height), bmi: pts.map((p) => p.bmi) };
    });
    expect(out.kontynuacja).toBe(true);
    expect(out.pytania.join('\n')).toContain('Usunięcie wzrostu: punkt straci BMI i BMI-SDS');
    expect(out.wlaczenie).toBe(false);
    expect(out.msg).toContain('Punkt „Włączenie” wymaga wzrostu');
    expect(out.wzrosty).toEqual([160, null]);
    expect(out.bmi[1]).toBeNull();
  });
});

async function pacjent(page, imie, plec, punktyTerapii) {
  return page.evaluate(async (d) => {
    const wynik = await window.VildaVault.savePatient({
      name: `Testowa ${d.imie}`,
      user: { lastName: 'Testowa', firstName: d.imie, sex: d.plec, age: 13, ageMonths: 7, height: 163, weight: 74 },
      obesityTherapyPoints: d.punktyTerapii,
    }, { dedup: false });
    return wynik.patientId;
  }, { imie, plec, punktyTerapii });
}

async function panel(page, patientId) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  // P-KARTA-LECZENIE (etap 1): bloki leczenia stoją w zakładce „Leczenie” (druga, po „Status”).
  await page.locator('.vilda-patient-tab[data-tab="leczenie"]').click();
  const przyciskPanelu = page.locator('.vilda-gha-btn', { hasText: 'Dane analityczne' });
  await expect(przyciskPanelu).toBeVisible();
  await przyciskPanelu.click();
  await expect(page.locator('.vilda-oba-verdict')).toBeVisible();
  return page.evaluate(() => {
    const el = document.querySelector('.vilda-oba-verdict');
    const kafelki = {};
    document.querySelectorAll('.vilda-gha-tile').forEach((t) => {
      const k = (t.querySelector('.vilda-gha-k') || {}).textContent || '';
      kafelki[k] = { v: (t.querySelector('.vilda-gha-v') || {}).textContent || '', sub: (t.querySelector('.vilda-gha-sub') || {}).textContent || '' };
    });
    return {
      klasa: el.className,
      tytul: (el.querySelector('.vilda-oba-vt') || {}).textContent || '',
      opis: (el.querySelector('.vilda-oba-vd') || {}).textContent || '',
      kafelki,
    };
  });
}

test.describe('Karta pacjenta — ocena wg ChPL', () => {
  test('WZ-7: dziecko, okno trwa, ostatni wzrost sprzed okna — „Potrzebny pomiar wzrostu do oceny ChPL”', async ({ page }) => {
    test.setTimeout(120_000);
    await konto(page, '/index.html');
    await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.ObesityResponseCriteria));
    const pid = await pacjent(page, 'Zuzanna', 'F', [WL, PAZ13, LIS10]);
    const w = await panel(page, pid);
    expect(w.tytul).toBe('Potrzebny pomiar wzrostu do oceny ChPL');
    expect(w.klasa).not.toMatch(/\b(bad|good)\b/);
    expect(w.opis).toContain('Wegovy 12–17 l. ocenia odpowiedź z BMI.');
    expect(w.opis).toContain('Okno oceny trwa od 27.10.2026');
    expect(w.opis).toContain('Ostatni wzrost: 162,9 cm z 13.10.2026 — przed oknem.');
    expect(w.opis).toContain('Poproś pacjenta o pomiar wzrostu');
    expect(w.opis).toContain('Masa od włączenia: −6,8% (74,6 kg, 10.11.2026)');
    expect(w.opis, 'żadnego nakazu odstawienia').not.toContain('odstawić');
    expect(w.kafelki['Wzrost do oceny']).toEqual({ v: '—', sub: 'brak pomiaru w oknie oceny' });
    expect(w.kafelki['Redukcja BMI'].sub).toBe('ostatni wpis bez wzrostu');
  });

  test('WZ-8: dziecko, ostatni wpis ze wzrostem (pomiar pacjenta) — ocena z niego, jak dotąd', async ({ page }) => {
    test.setTimeout(120_000);
    await konto(page, '/index.html');
    await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.ObesityResponseCriteria));
    const pid = await pacjent(page, 'Zuzanna-2', 'F', [WL, PAZ13, LIS10, LIS17]);
    const w = await panel(page, pid);
    expect(w.tytul).toBe('Odpowiedź wystarczająca — kontynuować leczenie');
    expect(w.klasa).toContain('good');
    expect(w.opis).toContain('(BMI)');
    expect(w.opis).not.toContain('ostatniego ze wzrostem');
    expect(w.kafelki['Wzrost do oceny']).toEqual({ v: '163,4 cm', sub: 'pomiar z 17.11.2026' });
  });

  test('WZ-9: dziecko, ostatni wpis bez wzrostu, wcześniejszy w oknie ze wzrostem — ocena z wcześniejszego, nazwana', async ({ page }) => {
    test.setTimeout(120_000);
    await konto(page, '/index.html');
    await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.ObesityResponseCriteria));
    const pid = await pacjent(page, 'Zuzanna-3', 'F', [WL, PAZ13, PAZ27, LIS10]);
    const w = await panel(page, pid);
    expect(w.tytul).toBe('Odpowiedź wystarczająca — kontynuować leczenie');
    expect(w.opis).toContain('Ocena z wpisu 27.10.2026 — ostatniego ze wzrostem; nowsze wpisy nie mają wzrostu.');
    expect(w.opis, 'tygodnie z wpisu oceny: 28 od włączenia = 12 dawki podtrzymującej').toContain('po 12 tyg. stosowania dawki podtrzymującej');
    expect(w.kafelki['Wzrost do oceny']).toEqual({ v: '163 cm', sub: 'pomiar z 27.10.2026 · ostatni wpis bez wzrostu' });
    // Redukcja do oceny = BMI z wpisu 27.10 (31,25 → 28,19 kg/m²), nie „—” z ostatniego wpisu.
    expect(w.kafelki['Redukcja do oceny'].v).toBe('−9,8%');
  });

  test('WZ-10: dorosły — ocena z masy ostatniego wpisu bez wzrostu, bez kafelka wzrostu (bez zmian)', async ({ page }) => {
    test.setTimeout(120_000);
    await konto(page, '/index.html');
    await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.ObesityResponseCriteria));
    const SAX = 'Saxenda (liraglutyd) – s.c. 1×/dobę';
    const d = (p) => ({ ...p, ageYears: 40, drug: SAX, dose: '3,0 mg / dobę' });
    const pid = await pacjent(page, 'Dorosła', 'F', [
      d(P('a', 'start', '2026-01-05', 40, 0, 100, 170)),
      d(P('b', 'continue', '2026-04-27', 40, 3, 93, null)),
    ]);
    const w = await panel(page, pid);
    expect(w.tytul).toContain('kontynuować');
    expect(w.klasa).toContain('good');
    expect(w.kafelki['Wzrost do oceny']).toBeUndefined();
  });
});
