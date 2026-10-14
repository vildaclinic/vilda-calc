import { expect, test } from '../support/test-czas.mjs';
import { czekajNaPacjentow, czekajNaZnikniecieRekordu } from '../support/sejf-czekanie.mjs';

// P-SCALANIE-SEKCJE (przegląd „trzy wady”, wada 3; przypadek T17 krytyka) — prawdziwy formularz index.html.
//
// Karta Y zapisana „Zapisz dane” bez dotykania planu: collectUserData zapisuje plan jako obiekt z PAL domyślnym
// (palWybrany:false), nie null. Karta X tego samego dziecka ma PAL 1,8 wybrany przez lekarza w #palFactor. Przed zmianą
// (audyt 2df41a8) „Zostaw ten, scal pozostałe” na Y trzymało domyślny plan Y, a wybrany PAL karty X znikał po cichu
// z bieżącej wersji — po wczytaniu Y formularz wracał do PAL z reguły wieku. Po zmianie: plan bez danych karty
// docelowej jest zastępowany w całości planem karty dołączonej; wczytanie Y daje plan X z PAL 1,8 jako wyborem lekarza.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#ScalSekcje!26aa';

async function przygotujKarte(page) {
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      // Baner zgody na analitykę leży na dole ekranu i przechwytuje kliknięcia.
      window.localStorage.setItem('analyticsConsent', 'denied');
    } catch (_) { /* brak storage — pomiń */ }
  });
}

async function gotowa(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && typeof window.update === 'function'
    && typeof window.collectUserData === 'function' && typeof window.applyLoadedData === 'function'
    && typeof window.VildaVault.mergePatients === 'function');
  await page.waitForTimeout(1200); // kaskady odtwarzania po starcie strony
}

async function otworzZKontem(page) {
  await przygotujKarte(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
}

/** Nowa karta przeglądarki (świeży stan formularza), sejf otwarty tym samym fikcyjnym hasłem. */
async function nowaKarta(context) {
  const page = await context.newPage();
  await przygotujKarte(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => {
    const u = await window.VildaVault.listUsers();
    await window.VildaVault.unlockUser(u[0].userId, pw);
  }, HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
  return page;
}

const planGlowy = (page, id) => page.evaluate(async (pid) => (await window.VildaVault.getPatient(pid)).snapshots[0].payload.plan, id);

test.describe('P-SCALANIE-SEKCJE — „Scal pacjentów” z prawdziwym zapisem formularza', () => {
  test('„Zostaw ten, scal pozostałe”: plan z PAL wybranym w karcie dołączonej trafia do karty docelowej i do wczytanego formularza', async ({ page, context }) => {
    test.setTimeout(180_000);
    await otworzZKontem(page);

    // Y: lekarz wpisuje tylko pacjenta i pomiar, planu nie dotyka; „Zapisz dane”.
    await page.fill('#lastName', 'Testowy');
    await page.fill('#firstName', 'Jan');
    await page.evaluate(() => {
      const ustaw = (id, v) => {
        const e = document.getElementById(id);
        e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      };
      ustaw('age', '4'); ustaw('ageMonths', '6'); ustaw('sex', 'M'); ustaw('height', '104'); ustaw('weight', '17');
      window.update();
    });
    await expect.poll(() => page.evaluate(() => window.collectUserData().plan), { message: 'plan Y: PAL domyślny z reguły wieku' })
      .toMatchObject({ palFactor: 1.6, palWybrany: false });
    await page.locator('#saveDataBtnSidebar').click();
    await czekajNaPacjentow(page, 1);
    const y = await page.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);
    expect(await planGlowy(page, y), 'kontrola: zapis Y niesie plan-obiekt z wartością domyślną').toMatchObject({ palFactor: 1.6, palWybrany: false });

    // X: to samo dziecko w drugiej karcie (z datą urodzenia), lekarz WYBRAŁ PAL 1,8 w #palFactor. Karta planu jest
    // w trybie profesjonalnym, więc wybór idzie tym samym zdarzeniem „change”, które łapie vilda_diet_plan_ui.js.
    await page.evaluate(() => {
      const s = document.getElementById('palFactor');
      s.value = '1.8';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const zapisX = await page.evaluate(() => window.collectUserData());
    expect(zapisX.plan, 'kontrola: wybór lekarza w zapisie X').toMatchObject({ palFactor: 1.8, palWybrany: true });
    const x = await page.evaluate(async (z) => {
      z.user.dobISO = '2022-01-10';
      return (await window.VildaVault.savePatient(z, { dedup: false, forceNew: true })).patientId;
    }, zapisX);
    await czekajNaPacjentow(page, 2);

    // Pacjenci → Duplikaty → „Zostaw ten, scal pozostałe” na Y (wiersz bez daty urodzenia).
    await page.evaluate(() => window.VildaAuthUI.showPatientsList(() => {}));
    const przejrzyj = page.locator('.pt-dupbar button', { hasText: 'Przejrzyj' });
    await expect(przejrzyj, 'pasek duplikatów widoczny').toBeVisible({ timeout: 15000 });
    await przejrzyj.click();
    await expect(page.locator('.pt-dupgrp .pt-duprow')).toHaveCount(2);
    await page.locator('.pt-dupgrp .pt-duprow').filter({ hasNotText: 'ur.' }).locator('.pt-merge-btn--base').click();
    const arkusz = page.locator('.vilda-auth-sheet-conflict[aria-label="Scalić w jeden rekord?"]');
    await expect(arkusz).toBeVisible();
    await arkusz.locator('button', { hasText: 'Scal w jeden rekord' }).click();
    await czekajNaZnikniecieRekordu(page, x);
    await czekajNaPacjentow(page, 1);
    await expect.poll(() => planGlowy(page, y), { message: 'głowa Y: plan karty dołączonej w całości' }).toEqual(zapisX.plan);

    // Wczytanie Y jak u lekarza w świeżej karcie: Karta pacjenta → „Wczytaj tego pacjenta” → „Nowy pomiar”.
    const druga = await nowaKarta(context);
    await druga.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (rekord) => {
      if (rekord) window.applyLoadedData(rekord);
    }, null), y);
    await druga.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
    await expect(druga.locator('#vildaLoadChoiceModal')).toBeVisible();
    await druga.locator('#vildaLcmNew').click();
    await expect(druga.locator('#vildaLoadChoiceModal')).toHaveCount(0);
    await druga.waitForFunction((id) => window._vildaCurrentPatientId === id, y);
    await druga.waitForTimeout(1500); // kaskada zerowania pól wizyty i przeliczeń
    // Formularz wczytuje plan karty dołączonej (przed zmianą: domyślny plan Y, PAL niewybrany).
    expect(await druga.evaluate(() => (window.lastLoadedData || {}).plan), 'wczytany plan Y').toEqual(zapisX.plan);
    expect(await druga.evaluate(() => window.__vildaPlanPalTouched), 'PAL z rekordu jest wyborem lekarza (P-PAL-ZAPIS)').toBe(true);
    // Wartości selecta #palFactor tu nie sprawdzamy: w świeżej karcie select nie ma jeszcze opcji, gdy applyLoadedData
    // ustawia PAL, i po przeliczeniu pokazuje 1,4 — zmierzone 2026-10-14 także dla karty BEZ scalania (wczytanie
    // z Karty pacjenta, „Nowy pomiar” i „Odtwórz zapis”). To osobna wada ścieżki wczytania, poza P-SCALANIE-SEKCJE.
  });
});

// Recenzja końcowa P-SCALANIE-SEKCJE (uwaga U1) — prawdziwy kalkulator-klirens.html. Lekarz ma w karcie przeglądarki
// wczytaną starą kartę X z sesją klirensu (Scr 0,9 wpisana z jednostką µmol/L — pomyłka) i poprawia jednostkę na mg/dl;
// w drugiej karcie X zostaje scalona z Y. „Zapisz” daje odmowę, drugi zapis idzie jako ponowienie do Y. Poprawiona
// jednostka ma trafić do głowy Y (strona przy 'umol' liczy h/88,4). Test sprawdza też przesłankę reguły porównania:
// odtworzenie zapisanej sesji na stronie zmienia w inputs tylko antropometrię karty pacjenta, a zmiana jednostki —
// tylko ScrUnit.
const ANTROPOMETRIA_KLIRENSU = ['fullName', 'age', 'ageMonths', 'ageDays', 'sex', 'weight', 'height'];

async function gotowyKlirens(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => typeof window.saveUserData === 'function' && typeof window.collectUserData === 'function'
    && Boolean(window.VildaAuthUI) && typeof window.applyLoadedData === 'function'
    && typeof window.applyClcrSessionSnapshot === 'function');
  await page.waitForTimeout(1500); // odtwarzanie sesji klirensu po starcie strony
}

const ustawPole = (page, id, wartosc) => page.evaluate(([i, w]) => {
  const e = document.getElementById(i);
  e.value = w;
  e.dispatchEvent(new Event('input', { bubbles: true }));
  e.dispatchEvent(new Event('change', { bubbles: true }));
}, [id, wartosc]);

const rozneKlucze = (a, b) => [...new Set(Object.keys(a).concat(Object.keys(b)))]
  .filter((k) => JSON.stringify(a[k] === undefined ? null : a[k]) !== JSON.stringify(b[k] === undefined ? null : b[k]))
  .filter((k) => !ANTROPOMETRIA_KLIRENSU.includes(k))
  .sort();

test.describe('P-SCALANIE-SEKCJE — kalkulator klirensu: ponowienie zapisu po scaleniu', () => {
  test('poprawiona jednostka Scr w formularzu starej karty trafia do karty docelowej przy ponowieniu (U1)', async ({ page, context }) => {
    test.setTimeout(180_000);
    await przygotujKarte(page);
    await page.goto('/kalkulator-klirens.html', { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaVault));
    await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
    await page.reload({ waitUntil: 'load' });
    await gotowyKlirens(page);

    // X: sesja zbudowana przez prawdziwą stronę (Scr 0,9 z jednostką µmol/L); Y: to samo dziecko z index (klirens null).
    for (const [id, w] of [['age', '4'], ['ageMonths', '6'], ['height', '104'], ['weight', '17'], ['ScrUnit', 'umol'], ['Scr', '0.9']]) {
      await ustawPole(page, id, w);
    }
    await page.waitForTimeout(600);
    const { x, y } = await page.evaluate(async () => {
      const V = window.VildaVault;
      const zx = window.collectUserData();
      zx.name = 'Testowy Jan';
      zx.user = Object.assign({}, zx.user, { lastName: 'Testowy', firstName: 'Jan', sex: 'M' });
      zx.growthBasic = { data: { measurements: [{ ageMonths: 54, ageYears: 4.5, height: 104, weight: 17 }] } };
      const a = await V.savePatient(zx, { dedup: false });
      const zy = { name: 'Testowy Jan', user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 4, ageMonths: 0, height: 100, weight: 16 },
        growthBasic: { data: { measurements: [{ ageMonths: 48, ageYears: 4, height: 100, weight: 16 }] } }, clcr: null };
      const b = await V.savePatient(zy, { dedup: false });
      return { x: a.patientId, y: b.patientId };
    });
    const sesjaX = await page.evaluate(async (id) => (await window.VildaVault.getPatient(id)).snapshots[0].payload.clcr, x);
    expect([sesjaX.inputs.Scr, sesjaX.inputs.ScrUnit], 'kontrola: sesja X ze strony').toEqual(['0.9', 'umol']);

    // Karta A: świeża karta przeglądarki; X wczytana z Karty pacjenta, zapisana sesja odtworzona do formularza.
    const A = await context.newPage();
    await przygotujKarte(A);
    await A.goto('/kalkulator-klirens.html', { waitUntil: 'load' });
    await A.waitForFunction(() => Boolean(window.VildaVault));
    await A.evaluate(async (pw) => {
      const u = await window.VildaVault.listUsers();
      await window.VildaVault.unlockUser(u[0].userId, pw);
    }, HASLO);
    await A.reload({ waitUntil: 'load' });
    await gotowyKlirens(A);
    await A.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (r) => { if (r) window.applyLoadedData(r); }, null), x);
    await A.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
    await A.waitForTimeout(800);
    if (await A.locator('#vildaLoadChoiceModal').count()) await A.locator('#vildaLcmNew').click();
    await A.waitForFunction((id) => window._vildaCurrentPatientId === id, x);
    await A.waitForTimeout(1500);
    expect(await A.evaluate(() => window.applyClcrSessionSnapshot(window.lastLoadedData.clcr, { source: 'json-restore', update: true,
      hideLoadedSummary: true, showPlaceholder: false, hideRestoreButton: true, dispatchEvents: false, writeSession: true })),
    'odtworzenie zapisanej sesji X').toBe(true);
    for (const [id, w] of [['fullName', 'Testowy Jan'], ['age', '6'], ['ageMonths', '0'], ['weight', '20'], ['height', '112']]) {
      await ustawPole(A, id, w); // pola wymagane do zapisu
    }
    await A.waitForTimeout(600);
    const poOdtworzeniu = await A.evaluate(() => window.collectUserData().clcr.inputs);
    expect(rozneKlucze(poOdtworzeniu, sesjaX.inputs), 'odtworzona sesja różni się od zapisanej tylko antropometrią').toEqual([]);
    await ustawPole(A, 'ScrUnit', 'mg/dl'); // lekarz poprawia jednostkę; strona nie przelicza wartości
    await A.waitForTimeout(600);
    const poPoprawie = await A.evaluate(() => window.collectUserData().clcr.inputs);
    expect(rozneKlucze(poPoprawie, sesjaX.inputs), 'zmiana jednostki zmienia w sesji tylko ScrUnit').toEqual(['ScrUnit']);
    expect([poPoprawie.Scr, poPoprawie.ScrUnit]).toEqual(['0.9', 'mg/dl']);

    // Karta B: X scalona z Y — głowa Y dostaje sesję X (Y nie miała klirensu; tak samo na audyt).
    await page.evaluate(async (ids) => window.VildaVault.mergePatients(ids.x, ids.y), { x, y });
    expect((await page.evaluate(async (id) => (await window.VildaVault.getPatient(id)).snapshots[0].payload.clcr, y)).inputs.ScrUnit,
      'kontrola: głowa Y po scaleniu').toBe('umol');

    // Karta A: „Zapisz” (odmowa — karta X scalona), drugi zapis (ponowienie do Y).
    await A.bringToFront();
    const zapisz = () => A.evaluate(async () => {
      try { await window.saveUserData(); return true; } catch (_) { return false; }
    });
    await zapisz();
    await A.waitForTimeout(1500);
    await zapisz();
    await expect.poll(() => A.evaluate(async (id) => (await window.VildaVault.getPatient(id)).snapshots.length, y),
      { message: 'ponowienie dopisało wersję do Y', timeout: 15000 }).toBe(4);
    const wynik = await A.evaluate(async (id) => {
      const V = window.VildaVault;
      const c = (await V.getPatient(id)).snapshots[0].payload.clcr;
      return { Scr: c.inputs.Scr, ScrUnit: c.inputs.ScrUnit, karty: (await V.listPatients()).length };
    }, y);
    expect(wynik, 'głowa Y po ponowieniu: poprawiona jednostka').toEqual({ Scr: '0.9', ScrUnit: 'mg/dl', karty: 1 });
  });
});
