import { expect, test } from '../support/test-czas.mjs';

// P-CEL-WLASNY-ZAPIS (decyzja właściciela 2026-09-30): „Cel własny” (P-DIETA-CEL-WLASNY rata C/C′) zapisuje się
// w rekordzie pacjenta (plan.customGoalKg). Wraca przy „Wczytaj → Odtwórz zapis” i po F5; „Wczytaj → Nowy pomiar”
// zaczyna wizytę BEZ celu. Dotąd cel żył tylko w polu formularza (#customGoalKg) i w autozapisie karty:
//  1. pacjentka zapisana z celem własnym i wczytana w nowej karcie wracała BEZ celu;
//  2. po „Wyczyść wszystkie pola” i wczytaniu innej pacjentki (bez celu) cel poprzedniej zostawał w polu i napędzał
//     panel oraz plan NOWEJ pacjentki („Cel własny: −3,0 kg”).
// Precedens rozwiązania: P-PAL-ZAPIS (#470) — wybór lekarza w sekcji plan rekordu.
//
// Test zakłada WŁASNE, fikcyjne konto sejfu w efemerycznym profilu przeglądarki. Dane wyłącznie FIKCYJNE:
// „Testowa Celina” F 35 lat, 164 cm, 66 kg (BMI 24,5), cel własny 62 kg (BMI 23,1);
// „Fikcyjna Beata” F 40 lat, 164 cm, 65 kg (BMI 24,2), bez celu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#CelWlasnyZapis!26a';

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
  await page.waitForFunction(() => Boolean(window.VildaProAccess && window.VildaAuthUI) && typeof window.update === 'function'
    && typeof window.applyLoadedData === 'function' && typeof window.clearAllData === 'function');
  // Pole celu jest w trybie profesjonalnym (PRO). Dostęp podmieniamy jak w innych testach (wymaga
  // podpisanego tokenu), tryb profesjonalny włączamy tak, jak robi to użytkownik.
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const tryb = document.getElementById('resultsModeToggle');
    if (tryb && !tryb.checked) { tryb.checked = true; tryb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
}

async function otworzZKontem(page) {
  await przygotujKarte(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
}

/** Nowa karta przeglądarki (świeży stan karty), sejf otwarty tym samym fikcyjnym hasłem. */
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

async function wpiszPacjentke(page, { nazwisko, imie, wiek, masa }) {
  await page.fill('#lastName', nazwisko);
  await page.fill('#firstName', imie);
  await page.evaluate(({ w, m }) => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', w); set('ageMonths', '0'); set('sex', 'F'); set('height', '164'); set('weight', m);
    window.update();
  }, { w: wiek, m: masa });
}

/** Cel własny wpisany tak jak lekarz: segment „Cel własny” i pole „Masa docelowa” w karcie „Droga do normy BMI”. */
async function ustawCel(page, kg) {
  await expect(page.locator('#customGoalWrap')).toBeVisible();
  await page.locator('#customGoalWrap [data-cel-wlasny-choice="custom"]').click();
  await page.locator('#customGoalKg').fill(kg);
  await page.locator('#customGoalKg').dispatchEvent('change');
}

async function zapisz(page, ile) {
  await page.locator('#saveDataBtnSidebar').click();
  await expect.poll(() => page.evaluate(async () => (await window.VildaVault.listPatients()).length),
    { message: `sejf ma ${ile} pacjentów` }).toBe(ile);
  return page.evaluate(async () => (await window.VildaVault.listPatients()).map((p) => ({ id: p.patientId, nazwisko: p.header && p.header.lastName })));
}

/** Wczytanie jak u lekarza: Karta pacjenta → „Wczytaj tego pacjenta” → „Odtwórz zapis”. */
async function wczytajIOdtworz(page, pid, masa) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (rekord) => {
    if (rekord) window.applyLoadedData(rekord);
  }, null), pid);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
  await page.locator('#vildaLcmRestore').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await expect(page.locator('#weight'), 'odtworzenie przywraca ostatni pomiar').toHaveValue(masa, { timeout: 15000 });
  await expect(page.locator('#customGoalWrap'), 'pasmo BMI 23,0–24,9: karta celu widoczna').toBeVisible();
}

/** Wczytanie z „Nowy pomiar”: tożsamość i historia pacjenta, nowa wizyta bez pomiaru i bez celu. */
async function wczytajNowyPomiar(page, pid) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (rekord) => {
    if (rekord) window.applyLoadedData(rekord);
  }, null), pid);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
  await page.locator('#vildaLcmNew').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await expect(page.locator('#lastName')).not.toHaveValue('', { timeout: 15000 });
}

const tekst = (loc) => loc.evaluate((el) => String(el.textContent || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim());

test.describe('Cel własny w rekordzie pacjenta', () => {
  test('pacjentka zapisana z celem własnym wraca z nim po wczytaniu w nowej karcie', async ({ page, context }) => {
    test.setTimeout(180_000);
    await otworzZKontem(page);
    await wpiszPacjentke(page, { nazwisko: 'Testowa', imie: 'Celina', wiek: '35', masa: '66' });
    await ustawCel(page, '62');
    await expect(page.locator('#bmiJourneyMount'), 'przed zapisem: panel drogi do celu własnego').toContainText('Cel własny: −4,0 kg');
    const [celina] = await zapisz(page, 1);

    const druga = await nowaKarta(context);
    await wczytajIOdtworz(druga, celina.id, '66');
    // Przed poprawką: karta „Droga do normy BMI” mówi tylko, że BMI „zbliża się do jej górnej granicy”, pole celu jest
    // puste, a zalecenia (i raport pacjenta) wracają do utrzymania masy — cel wyznaczony przez lekarza przepadł.
    await expect(druga.locator('#toNormCard'), 'panel drogi do celu własnego po wczytaniu').toContainText('Cel własny: −4,0 kg');
    await expect(druga.locator('#bmiJourneyMount')).toContainText('Start: 66,0 kg → Cel: 62,0 kg');
    await expect(druga.locator('#customGoalKg'), 'masa docelowa wraca z rekordu').toHaveValue('62');
    await expect.poll(() => tekst(druga.locator('#customGoalHint'))).toMatch(/^Cel własny: 62,0 kg \(BMI 23,1\)/u);
    // Zalecenia dietetyczne (to samo źródło co raport PDF pacjenta): strategia celu własnego, nie utrzymanie.
    await druga.locator('#dietRecommendationsBtn').click();
    await druga.locator('#generateEnergyDietBtn').click();
    await expect(druga.locator('#dietEnergyResult'), 'zalecenia z celem własnym').toContainText('Przyjęty cel własny to ok. 62,0 kg (BMI 23,1)');

    // F5 w tej karcie (odtworzenie sesji) nie gubi celu.
    await druga.reload({ waitUntil: 'load' });
    await gotowa(druga);
    await expect(druga.locator('#weight'), 'F5 odtwarza pomiar').toHaveValue('66', { timeout: 15000 });
    await expect(druga.locator('#toNormCard'), 'po F5 panel celu własnego zostaje').toContainText('Cel własny: −4,0 kg');
    await expect(druga.locator('#customGoalKg')).toHaveValue('62');
    await druga.close();
  });

  test('„Wyczyść wszystkie pola” → wczytanie innej pacjentki: cel poprzedniej nie przechodzi na nową', async ({ page }) => {
    test.setTimeout(180_000);
    await otworzZKontem(page);
    // Beata — zapisana BEZ celu własnego.
    await wpiszPacjentke(page, { nazwisko: 'Fikcyjna', imie: 'Beata', wiek: '40', masa: '65' });
    await expect(page.locator('#customGoalWrap')).toBeVisible();
    await expect(page.locator('#customGoalKg')).toHaveValue('');
    const [beata] = await zapisz(page, 1);

    // Celina — z celem własnym 62 kg.
    await page.locator('#clearAllDataBtn').evaluate((b) => b.click());
    await wpiszPacjentke(page, { nazwisko: 'Testowa', imie: 'Celina', wiek: '35', masa: '66' });
    await ustawCel(page, '62');
    await expect(page.locator('#bmiJourneyMount')).toContainText('Cel własny: −4,0 kg');
    await zapisz(page, 2);

    // Lekarz czyści formularz i otwiera Beatę. „Wyczyść” czyści też pole celu.
    await page.locator('#clearAllDataBtn').evaluate((b) => b.click());
    await expect(page.locator('#weight')).toHaveValue('');
    await expect(page.locator('#customGoalKg'), '„Wyczyść” czyści cel własny').toHaveValue('');
    expect(await page.evaluate(() => window.__vildaDietGoalChoice || null), '„Wyczyść” zeruje wybór „Cel własny”').toBeNull();
    await wczytajIOdtworz(page, beata.id, '65');
    // Przed poprawką: pole zostaje z 62 kg Celiny, a karta Beaty pokazuje „Cel własny: −3,0 kg”
    // i plan redukcji do celu, którego nikt Beacie nie wyznaczył.
    await expect(page.locator('#toNormCard'), 'karta Beaty bez drogi do cudzego celu').not.toContainText('Cel własny: −');
    await expect(page.locator('#customGoalKg'), 'Beata nie dostaje celu Celiny').toHaveValue('');
    await expect(page.locator('#bmiJourneyMount'), 'brak panelu celu własnego u Beaty').toHaveCount(0);
    await expect(page.locator('#toNormInfo'), 'Beata: zwykła ocena górnej normy').toContainText('zbliża się do jej górnej granicy');
    await expect.poll(() => tekst(page.locator('#customGoalHint')), { message: 'Beata: podpowiedź bez celu' }).toMatch(/^Opcjonalnie: masa docelowa/u);

    // F5 z Beatą w formularzu: autozapis karty nie przywraca celu Celiny.
    await page.reload({ waitUntil: 'load' });
    await gotowa(page);
    await expect(page.locator('#weight'), 'F5 odtwarza pomiar Beaty').toHaveValue('65', { timeout: 15000 });
    await expect(page.locator('#customGoalWrap')).toBeVisible();
    await expect(page.locator('#toNormInfo'), 'po F5 nadal zwykła ocena górnej normy').toContainText('zbliża się do jej górnej granicy');
    await expect(page.locator('#toNormCard'), 'po F5 nadal bez cudzego celu').not.toContainText('Cel własny: −');
    await expect(page.locator('#customGoalKg')).toHaveValue('');

    // Powrót do Celiny w tej samej karcie: jej cel wraca z rekordu.
    await page.locator('#clearAllDataBtn').evaluate((b) => b.click());
    await expect(page.locator('#weight')).toHaveValue('');
    const celina = (await page.evaluate(async () => (await window.VildaVault.listPatients()).map((p) => ({ id: p.patientId, n: p.header && p.header.firstName }))))
      .find((p) => p.n === 'Celina');
    await wczytajIOdtworz(page, celina.id, '66');
    await expect(page.locator('#toNormCard')).toContainText('Cel własny: −4,0 kg');
    await expect(page.locator('#customGoalKg')).toHaveValue('62');
  });

  test('„Wczytaj → Nowy pomiar”: nowa wizyta bez celu własnego, także po F5; „Odtwórz zapis” przywraca go', async ({ page }) => {
    test.setTimeout(180_000);
    await otworzZKontem(page);
    await wpiszPacjentke(page, { nazwisko: 'Testowa', imie: 'Celina', wiek: '35', masa: '66' });
    await ustawCel(page, '62');
    await expect(page.locator('#bmiJourneyMount')).toContainText('Cel własny: −4,0 kg');
    const [celina] = await zapisz(page, 1);
    // Ta sama karta: po „Odtwórz zapis” cel jest w polu i w autozapisie formularza.
    await page.locator('#clearAllDataBtn').evaluate((b) => b.click());
    await wczytajIOdtworz(page, celina.id, '66');
    await expect(page.locator('#customGoalKg')).toHaveValue('62');

    // Kolejna wizyta: „Nowy pomiar” — pomiar i cel poprzedniej wizyty nie przechodzą na nową.
    await page.locator('#clearAllDataBtn').evaluate((b) => b.click());
    await wczytajNowyPomiar(page, celina.id);
    await expect(page.locator('#weight'), 'nowa wizyta bez masy').toHaveValue('');
    await expect(page.locator('#customGoalKg'), '„Nowy pomiar” bez celu poprzedniej wizyty').toHaveValue('');
    expect(await page.evaluate(() => window.__vildaDietGoalChoice || null), 'wybór celu wyzerowany').toBeNull();

    // F5 nie wskrzesza celu z autozapisu formularza.
    await page.reload({ waitUntil: 'load' });
    await gotowa(page);
    await expect(page.locator('#lastName'), 'po F5 nadal Celina').toHaveValue('Testowa', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await expect(page.locator('#customGoalKg'), 'po F5 nowa wizyta nadal bez celu').toHaveValue('');

    // Lekarz jednak odtwarza zapis — cel wraca z rekordu.
    await page.locator('#clearAllDataBtn').evaluate((b) => b.click());
    await wczytajIOdtworz(page, celina.id, '66');
    await expect(page.locator('#customGoalKg'), '„Odtwórz zapis” przywraca cel').toHaveValue('62');
  });

  test('docpro: skok z notatki do punktu GH Beaty przy niezapisanej Celinie z celem — po F5 i „Zapisz” Beata bez celu Celiny', async ({ page }) => {
    // Wczytanie bez „Wyczyść” (P-SESJA-OBCA, #492): pole celu i jego kopia w autozapisie formularza należą do Celiny.
    test.setTimeout(180_000);
    await przygotujKarte(page);
    await page.goto('/docpro.html', { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaVault));
    await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
    await page.reload({ waitUntil: 'load' });
    await gotowa(page);
    await wpiszPacjentke(page, { nazwisko: 'Fikcyjna', imie: 'Beata', wiek: '40', masa: '65' });
    const [beata] = await zapisz(page, 1);
    const notatka = await page.evaluate(async (pid) => {
      const w = await window.VildaVault.savePatientNote({
        patientId: pid, title: 'Somatropina', body: 'Dawka kontrolna.', category: 'treatment', ghPointId: 'gh-fikcja-b1',
        medication: { name: 'Somatropina', action: 'start', doseUnit: 'mg/kg/d', doseNum: 0.03 },
      });
      return (await window.VildaVault.listPatientNotesForPatient(pid)).find((n) => n.id === w.id) || null;
    }, beata.id);

    await page.locator('#clearAllDataBtn').evaluate((b) => b.click());
    await page.waitForTimeout(3000); // okno blokady zapisu po „Wyczyść”
    await wpiszPacjentke(page, { nazwisko: 'Testowa', imie: 'Celina', wiek: '35', masa: '66' });
    // Na docpro karta „Droga do normy” dorosłego bywa ukryta — cel wpisujemy tak, jak robi to jej obsługa.
    await page.evaluate(() => {
      window.__vildaDietGoalChoice = 'custom';
      const e = document.getElementById('customGoalKg');
      e.value = '62';
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(1200);

    await page.evaluate((d) => window.VildaAuthUI.showPatientNoteEditor({ patientId: d.id, note: d.notatka }), { id: beata.id, notatka });
    await page.locator('.vilda-pne button', { hasText: 'Siatki / punkt GH' }).click();
    try { await page.getByRole('button', { name: /^Odrzuć/ }).first().click({ timeout: 3000 }); } catch { /* bez okna */ }
    await expect(page.locator('#firstName'), 'skok wczytał Beatę').toHaveValue('Beata', { timeout: 15000 });
    await page.waitForTimeout(2500);
    await expect(page.locator('#customGoalKg'), 'po skoku Beata bez celu Celiny').toHaveValue('');

    await page.reload({ waitUntil: 'load' });
    await gotowa(page);
    await expect(page.locator('#firstName'), 'po F5 nadal Beata').toHaveValue('Beata', { timeout: 15000 });
    await page.waitForTimeout(2000);
    await expect(page.locator('#customGoalKg'), 'po F5 autozapis formularza nie wskrzesza celu Celiny').toHaveValue('');

    await page.evaluate(() => {
      const ustaw = (id, x) => { const e = document.getElementById(id); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
      ustaw('age', '40'); ustaw('weight', '64');
    });
    await page.waitForTimeout(800);
    await page.locator('#saveDataBtnSidebar').evaluate((b) => b.click());
    await expect.poll(() => page.evaluate(async (pid) => (await window.VildaVault.getPatient(pid)).snapshots.length, beata.id)).toBe(2);
    const cele = await page.evaluate(async (pid) => (await window.VildaVault.getPatient(pid)).snapshots
      .map((s) => (s.payload.plan && s.payload.plan.customGoalKg) ?? null), beata.id);
    expect(cele, 'rekord Beaty bez celu Celiny').toEqual([null, null]);
  });
});
