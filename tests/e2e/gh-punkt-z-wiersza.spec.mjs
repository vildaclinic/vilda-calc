import { expect, test } from '../support/test-czas.mjs';

// P-GH-PUNKT-Z-WIERSZA (D8). Karta „Zaawansowane obliczenia wzrostowe” na prawdziwym Start: przy wierszu ręcznym
// przycisk „Zapisz jako punkt leczenia GH” (tylko gdy jest punkt Włączenia), panel pod wierszem, zapis przez
// VildaGhPunkty (reguły punktu wstecznego), po zapisie wiersz ręczny znika, a w karcie i w tabeli spożycia jest
// wiersz punktu GH z etykietą. Dalej: odmowa bez dawki, „Anuluj”, okno blokady mostka, F5, DocPro w powłoce
// i zgodność VildaGhProgramyDane z prawdziwą kartą leczenia i monitorem. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhPunktZWiersza!26';
const P1 = { id: 'gh-e2e-zw-1', type: 'start', ageYears: 8, ageMonths: 0, weight: 25, height: 122, boneAge: null,
  dose: 0.028, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.7 };
const P2 = { id: 'gh-e2e-zw-2', type: 'continue', ageYears: 8, ageMonths: 6, weight: 27, height: 125.5, boneAge: null,
  dose: 0.8 / 27, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP', igf1: 210, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.8 };
const ETYKIETA = { start: 'Punkt leczenia GH · Włączenie leczenia · poprawki w DocPro', continue: 'Punkt leczenia GH · Kontynuacja leczenia · poprawki w DocPro' };
const BEZ_DAWKI = 'Upewnij się, że wprowadziłeś poprawne, dodatnie dane: wiek, wagę, wzrost oraz dawkę.';
const ZAPISANO = '✓ Zapisano punkt leczenia GH: Kontynuacja leczenia, 9 l. 0 mies. Poprawki: DocPro → Monitorowanie leczenia GH.';

async function zaloguj(page, sciezka = '/index.html') {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto(sciezka, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
}

async function startGotowy(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && !document.documentElement.classList.contains('vilda-auth-locked') && Boolean(window.VildaProAccess)
    && Boolean(window.VildaGhPunktZWiersza));
  // Karta wymaga trybu profesjonalnego (jak w gh-wiersze-start-blokada.spec.mjs), bez usługi zewnętrznej.
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const t = document.getElementById('resultsModeToggle');
    if (t && !t.checked) { t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); }
    const b = document.getElementById('consent-banner');
    if (b) b.remove();
  });
}

// Pacjentka z dwoma punktami GH i wierszem ręcznym 9 l. 0 mies. w karcie zaawansowanej.
async function pacjentka(page, punkty = [P1, P2]) {
  await page.fill('#lastName', 'Fikcyjna');
  await page.fill('#firstName', 'Zofia');
  await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
    set('age', '9'); set('ageMonths', '6'); set('sex', 'F'); set('height', '131.2'); set('weight', '30.4');
    if (typeof window.update === 'function') window.update();
  });
  await page.waitForSelector('#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]', { state: 'attached' });
  await page.evaluate(() => {
    const t = document.getElementById('toggleAdvancedGrowth');
    const f = document.getElementById('advancedGrowthForm');
    if (!(f && getComputedStyle(f).display !== 'none')) t.click();
  });
  await expect(page.locator('#advancedGrowthForm')).toBeVisible({ timeout: 10000 });
  await page.waitForSelector('#advMeasurements .measure-row', { state: 'attached', timeout: 10000 });
  await page.evaluate(() => {
    const w = document.querySelector('#advMeasurements .measure-row');
    const set = (sel, v) => { const e = w.querySelector(sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
    set('.adv-age-years', '9'); set('.adv-age-months', '0'); set('.adv-height', '128.6'); set('.adv-weight', '29.1');
    window.calculateGrowthAdvanced();
  });
  await page.evaluate((pts) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', pts, { force: true });
    window.ghTherapyPoints = pts;
  }, punkty);
  await page.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
  await expect(page.locator('#advMeasurements .measure-row[data-gh-id]')).toHaveCount(punkty.length);
}

const reczny = (page) => page.locator('#advMeasurements .measure-row:not([data-gh-id])').first();
const modul = (page) => page.evaluate(() => window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', null));
// Wiersze karty z danymi (pusty wiersz do wpisania pomiaru pomijamy), posortowane.
const wiersze = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#advMeasurements .measure-row'))
  .filter((r) => r.getAttribute('data-gh-id') || ['.adv-age-years', '.adv-height', '.adv-weight'].some((s) => r.querySelector(s).value !== ''))
  .map((r) => `${r.getAttribute('data-gh-id') ? 'GH' : 'ręczny'} ${r.querySelector('.adv-age-years').value}/${r.querySelector('.adv-age-months').value}`).sort());
const lustra = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#intakeMeasurements .measure-row-intake'))
  .filter((r) => r.getAttribute('data-locked') !== 'true' && r.querySelector('.intake-ageY') && r.querySelector('.intake-ageY').value !== '')
  .map((r) => `${r.getAttribute('data-gh-id') ? 'GH' : 'ręczny'} ${r.querySelector('.intake-ageY').value}/${r.querySelector('.intake-ageM').value}`).sort());

for (const [opis, rozmiar] of [['desktop', { width: 1280, height: 900 }], ['telefon (390 px)', { width: 390, height: 844 }]]) {
  test(`wiersz ręczny → punkt leczenia GH: przycisk, panel, odmowa bez dawki, zapis i wiersz GH — ${opis}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(rozmiar);
    const bledy = [];
    page.on('pageerror', (e) => bledy.push(String(e && e.message)));
    await zaloguj(page);
    await startGotowy(page);
    await pacjentka(page);

    // Przycisk tylko przy wierszu ręcznym; etykiety przy wierszach GH.
    await expect(page.locator('.gh-z-wiersza-btn')).toHaveCount(1);
    await expect(reczny(page).locator('.gh-z-wiersza-btn')).toHaveText('＋ Zapisz jako punkt leczenia GH');
    await expect(page.locator(`#advMeasurements .measure-row[data-gh-id="${P1.id}"] .gh-z-wiersza-etykieta`)).toHaveText(ETYKIETA.start);
    await expect(page.locator(`#advMeasurements .measure-row[data-gh-id="${P2.id}"] .gh-z-wiersza-etykieta`)).toHaveText(ETYKIETA.continue);
    expect(await lustra(page)).toEqual(['GH 8/0', 'GH 8/6', 'ręczny 9/0']);

    // Panel: pomiar z wiersza, rodzaje (Włączenie niedostępne), program i preparat z ostatniego punktu, dawka pusta.
    await reczny(page).locator('.gh-z-wiersza-btn').click();
    const panel = page.locator('#ghZWierszaPanel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.gh-z-wiersza-pomiar')).toHaveText('Wiek 9 l. 0 mies. · wzrost 128,6 cm · masa 29,1 kg · wiek kostny —');
    await expect(panel.locator('input[value="start"]')).toBeDisabled();
    await expect(panel.locator('input[value="continue"]')).toBeChecked();
    await expect(panel.locator('input[value="end"]')).toBeEnabled();
    await expect(page.locator('#ghZWierszaProgram')).toHaveValue('SNP');
    await expect(page.locator('#ghZWierszaPreparat')).toHaveValue('Omnitrope 10 mg');
    await expect(page.locator('#ghZWierszaDawka')).toHaveValue('');
    await expect(panel).toContainText('Dawka podawana (mg/dobę)');
    await expect(panel).toContainText('Program i preparat jak w ostatnim punkcie leczenia (8 l. 6 mies.) — można zmienić.');
    await expect(reczny(page).locator('.gh-z-wiersza-btn')).toHaveCount(0);

    // Bez dawki: komunikat z VildaGhPunkty, nic się nie zapisuje.
    await page.click('#ghZWierszaZapisz');
    await expect(page.locator('#ghZWierszaBlad')).toHaveText(BEZ_DAWKI);
    expect(await modul(page)).toEqual([P1, P2]);
    expect(await wiersze(page)).toEqual(['GH 8/0', 'GH 8/6', 'ręczny 9/0']);

    // Dawka 0,9 mg/d: podpowiedź przeliczenia jak w formularzu wstecznym, zapis.
    await page.fill('#ghZWierszaDawka', '0.9');
    await expect(page.locator('#ghZWierszaDawkaInfo')).toHaveText('= 0,031 mg/kg/d przy 29,1 kg');
    if (rozmiar.width <= 390) {
      const uklad = await page.evaluate(() => {
        const r = document.getElementById('ghZWierszaPanel').getBoundingClientRect();
        return { lewo: r.left, prawo: r.right, okno: window.innerWidth, przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      expect(uklad.lewo).toBeGreaterThanOrEqual(0);
      expect(uklad.prawo).toBeLessThanOrEqual(uklad.okno);
      expect(uklad.przewijanie).toBeLessThanOrEqual(0);
    }
    await page.click('#ghZWierszaZapisz');

    await expect(page.locator('#ghZWierszaStatus')).toHaveText(ZAPISANO);
    await expect(page.locator('#ghZWierszaPanel')).toHaveCount(0);
    const lista = await modul(page);
    expect(lista.slice(0, 2)).toEqual([P1, P2]);
    expect(lista[2]).toMatchObject({ type: 'continue', ageYears: 9, ageMonths: 0, weight: 29.1, height: 128.6, boneAge: null,
      dose: 0.9 / 29.1, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, doseAbs: 0.9 });
    await expect.poll(() => wiersze(page)).toEqual(['GH 8/0', 'GH 8/6', 'GH 9/0']);
    await expect(page.locator(`#advMeasurements .measure-row[data-gh-id="${lista[2].id}"] .gh-z-wiersza-etykieta`)).toHaveText(ETYKIETA.continue);
    await expect(page.locator('.gh-z-wiersza-btn')).toHaveCount(0);
    await expect.poll(() => lustra(page)).toEqual(['GH 8/0', 'GH 8/6', 'GH 9/0']);
    expect(bledy, `pageerror:\n${bledy.join('\n')}`).toEqual([]);
  });
}

test('bez punktu Włączenia przycisku nie ma; „Anuluj” niczego nie zmienia', async ({ page }) => {
  test.setTimeout(150_000);
  await zaloguj(page);
  await startGotowy(page);
  await pacjentka(page, [P2]);
  await page.waitForTimeout(300);
  await expect(page.locator('.gh-z-wiersza-btn')).toHaveCount(0);
  await expect(page.locator(`#advMeasurements .measure-row[data-gh-id="${P2.id}"] .gh-z-wiersza-etykieta`)).toHaveText(ETYKIETA.continue);

  // Po dopisaniu Włączenia (np. z DocPro) przycisk się pojawia; „Anuluj” zamyka panel bez zmian.
  await page.evaluate((pts) => window.VildaGhPunkty.zapisz(pts), [P1, P2]);
  await page.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
  await expect(page.locator('.gh-z-wiersza-btn')).toHaveCount(1);
  await reczny(page).locator('.gh-z-wiersza-btn').click();
  await page.fill('#ghZWierszaDawka', '0.9');
  await page.click('#ghZWierszaAnuluj');
  await expect(page.locator('#ghZWierszaPanel')).toHaveCount(0);
  await expect(page.locator('.gh-z-wiersza-btn')).toHaveCount(1);
  expect(await modul(page)).toEqual([P1, P2]);
  expect(await wiersze(page)).toEqual(['GH 8/0', 'GH 8/6', 'ręczny 9/0']);

  // Przeglądarka nie zapisała listy (modul: false): wiersz ręczny zostaje, lista okna jak przed zapisem, błąd w panelu.
  await reczny(page).locator('.gh-z-wiersza-btn').click();
  await page.fill('#ghZWierszaDawka', '0.9');
  // VildaPersistence jest zamrożone — błąd pamięci przeglądarki symulujemy na Storage dla klucza listy punktów GH.
  await page.evaluate(() => {
    window.__e2eZapis = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (/ghTherapyPoints$/.test(String(k))) throw new Error('e2e: pamięć pełna');
      return window.__e2eZapis.call(this, k, v);
    };
  });
  await page.click('#ghZWierszaZapisz');
  await expect(page.locator('#ghZWierszaBlad')).toHaveText('Nie zapisano punktu leczenia: przeglądarka nie zapisała listy punktów. Spróbuj ponownie.');
  await page.evaluate(() => { Storage.prototype.setItem = window.__e2eZapis; });
  expect(await page.evaluate(() => JSON.stringify(window.ghTherapyPoints))).toBe(JSON.stringify([P1, P2]));
  expect(await modul(page)).toEqual([P1, P2]);
  expect(await wiersze(page)).toEqual(['GH 8/0', 'GH 8/6', 'ręczny 9/0']);
  await page.click('#ghZWierszaAnuluj');

  // Niekompletny wiersz: przycisk nieaktywny z powodem.
  await reczny(page).locator('.adv-weight').fill('');
  await expect(reczny(page).locator('.gh-z-wiersza-btn')).toBeDisabled();
  await expect(reczny(page).locator('.gh-z-wiersza-btn')).toHaveAttribute('title', 'Uzupełnij wiek, wzrost i masę w tym wierszu.');
});

// P-GH-PUNKT-Z-WIERSZA-ZGODNOSC (recenzja #582, P1; wariant właściciela 2026-10-08: panel się odświeża). Lekarz
// poprawia wiersz przy otwartym panelu: podsumowanie, podpowiedź mg/kg i „Zapisz” idą za wierszem, a zapisuje się
// dokładnie to, co pokazuje panel. Przed poprawką panel pokazywał pomiar z chwili otwarcia (29,1 kg, 0,031 mg/kg/d),
// a zapis brał wiersz po zmianie (20 kg → 0,045 mg/kg/d w punkcie).
test('panel pokazuje bieżący pomiar wiersza: podsumowanie, mg/kg i „Zapisz” idą za wierszem; zapis = to, co widać', async ({ page }) => {
  test.setTimeout(180_000);
  const bledy = [];
  page.on('pageerror', (e) => bledy.push(String(e && e.message)));
  await zaloguj(page);
  await startGotowy(page);
  await pacjentka(page);
  const panel = page.locator('#ghZWierszaPanel');
  const pomiar = panel.locator('.gh-z-wiersza-pomiar');
  const powod = page.locator('#ghZWierszaPowod');
  const zapisz = page.locator('#ghZWierszaZapisz');
  await reczny(page).locator('.gh-z-wiersza-btn').click();
  await page.fill('#ghZWierszaDawka', '0.9');
  await expect(page.locator('#ghZWierszaDawkaInfo')).toHaveText('= 0,031 mg/kg/d przy 29,1 kg');
  await expect(zapisz).toBeEnabled();
  await expect(powod).toBeHidden();

  // Masa w wierszu 29,1 → 20 kg: panel i podpowiedź za wierszem.
  await reczny(page).locator('.adv-weight').fill('20');
  await expect(pomiar).toHaveText('Wiek 9 l. 0 mies. · wzrost 128,6 cm · masa 20 kg · wiek kostny —');
  await expect(page.locator('#ghZWierszaDawkaInfo')).toHaveText('= 0,045 mg/kg/d przy 20 kg');

  // Niekompletny wiersz: „Zapisz” nieaktywny z powodem; uzupełnienie przywraca zapis.
  await reczny(page).locator('.adv-weight').fill('');
  await expect(pomiar).toHaveText('Wiek 9 l. 0 mies. · wzrost 128,6 cm · masa — · wiek kostny —');
  await expect(zapisz).toBeDisabled();
  await expect(powod).toHaveText('Uzupełnij wiek, wzrost i masę w tym wierszu.');
  // W spoczynku panel się nie przerysowuje: zero zmian w karcie przez sekundę (wcześniej powód wpisywany od nowa
  // był mutacją dla obserwatora karty i odświeżanie kręciło się w każdej klatce).
  expect(await page.evaluate(() => new Promise((ok) => {
    let n = 0;
    const o = new MutationObserver((ms) => { n += ms.length; });
    o.observe(document.getElementById('advMeasurements'), { childList: true, subtree: true, characterData: true });
    setTimeout(() => { o.disconnect(); ok(n); }, 1000);
  }))).toBe(0);
  await reczny(page).locator('.adv-weight').fill('20');
  await expect(zapisz).toBeEnabled();
  await expect(powod).toBeHidden();

  // Wiek przestawiony na miesiąc istniejącego punktu (8 l. 6 mies.): „Zapisz” nieaktywny z powodem.
  await reczny(page).locator('.adv-age-years').fill('8');
  await reczny(page).locator('.adv-age-months').fill('6');
  await expect(zapisz).toBeDisabled();
  await expect(powod).toHaveText('W tym miesiącu wieku jest już punkt leczenia GH.');
  await reczny(page).locator('.adv-age-years').fill('9');
  await reczny(page).locator('.adv-age-months').fill('0');
  await expect(zapisz).toBeEnabled();
  expect(await modul(page)).toEqual([P1, P2]);

  // Wiersz zmieniony bez zdarzenia (np. przez inny moduł) i od razu „Zapisz”: brak zapisu, panel pokazuje nowy pomiar
  // i prosi o ponowny zapis; drugi zapis bierze dokładnie pokazane 21 kg.
  await page.evaluate(() => {
    const e = document.querySelector('#advMeasurements .measure-row:not([data-gh-id]) .adv-weight');
    e.value = '21';
    document.getElementById('ghZWierszaZapisz').click();
  });
  await expect(page.locator('#ghZWierszaBlad')).toHaveText('Pomiar w wierszu się zmienił. Sprawdź dane w panelu i zapisz ponownie.');
  await expect(pomiar).toHaveText('Wiek 9 l. 0 mies. · wzrost 128,6 cm · masa 21 kg · wiek kostny —');
  await expect(page.locator('#ghZWierszaDawkaInfo')).toHaveText('= 0,043 mg/kg/d przy 21 kg');
  expect(await modul(page)).toEqual([P1, P2]);
  await zapisz.click();
  await expect(page.locator('#ghZWierszaStatus')).toHaveText(ZAPISANO);
  const lista = await modul(page);
  expect(lista).toHaveLength(3);
  expect(lista[2]).toMatchObject({ type: 'continue', ageYears: 9, ageMonths: 0, weight: 21, height: 128.6, dose: 0.9 / 21, doseAbs: 0.9 });
  expect(bledy, `pageerror:\n${bledy.join('\n')}`).toEqual([]);
});

// Uwagi z przeglądu (luki w testach): odświeżanie panelu po edycji wiersza nie kasuje komunikatu o zmianie schematu
// dawki (dawka pusta — podpowiedzi mg/kg nie ma czego liczyć), a panel zamyka się, gdy z listy zniknie Włączenie
// (warunek przycisku z decyzji D8; inaczej zostałby nieaktywny „Zapisz” z mylącym powodem).
test('odświeżanie panelu nie kasuje komunikatu o zmianie preparatu; bez Włączenia na liście panel się zamyka', async ({ page }) => {
  test.setTimeout(150_000);
  await zaloguj(page);
  await startGotowy(page);
  await pacjentka(page);
  await reczny(page).locator('.gh-z-wiersza-btn').click();
  await page.fill('#ghZWierszaDawka', '0.9');
  await page.selectOption('#ghZWierszaPreparat', 'Ngenla 24 mg');
  const komunikat = await page.evaluate(() => window.VildaGhDawka.komunikatZmianySchematu('dobowy', 'tygodniowy', 0.9));
  await expect(page.locator('#ghZWierszaDawka')).toHaveValue('');
  await expect(page.locator('#ghZWierszaDawkaInfo')).toHaveText(komunikat);
  await reczny(page).locator('.adv-weight').fill('22');
  await expect(page.locator('#ghZWierszaPomiar')).toHaveText('Wiek 9 l. 0 mies. · wzrost 128,6 cm · masa 22 kg · wiek kostny —');
  await expect(page.locator('#ghZWierszaDawkaInfo')).toHaveText(komunikat);
  await page.fill('#ghZWierszaDawka', '4.9');
  await expect(page.locator('#ghZWierszaDawkaInfo')).not.toHaveText(komunikat);

  // Włączenie usunięte (np. w DocPro) przy otwartym panelu: panel znika, przycisku nie ma, lista bez nowego punktu.
  await page.evaluate((pts) => window.VildaGhPunkty.zapisz(pts), [P2]);
  await page.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
  await expect(page.locator('#ghZWierszaPanel')).toHaveCount(0);
  await expect(page.locator('.gh-z-wiersza-btn')).toHaveCount(0);
  expect(await modul(page)).toEqual([P2]);
});

// P-GH-PUNKT-Z-WIERSZA-ZGODNOSC (recenzja #582, P2). Panel i komunikat „Zapisano…” dotyczą pacjenta, przy którym
// powstały. Przed poprawką komunikat o punkcie pacjenta A zostawał nad kartą pacjenta B. Trzy drogi, każda w osobnym
// teście i bez pozostałych (znacznik pacjenta karty sprawdzany wprost), żeby każdy mechanizm miał własnego strażnika.
const znacznik = (page) => page.evaluate(() => window._vildaCurrentPatientId || sessionStorage.getItem('vildaCurrentPatientId') || null);

test('zmiana pacjenta (1/3): odtworzenie stanu karty zamyka otwarty panel; zapis nie powstaje', async ({ page }) => {
  test.setTimeout(150_000);
  await zaloguj(page);
  await startGotowy(page);
  await pacjentka(page);
  expect(await znacznik(page)).toBeNull();
  // vilda:patient-loaded najpierw: wcześniejsze zdarzenia uruchamiają w innych modułach opóźnioną przebudowę wierszy,
  // która zamknęłaby panel niezależnie od nasłuchu tego modułu (test przepuszczałby jego usunięcie).
  for (const zdarzenie of ['vilda:patient-loaded', 'vilda:state-restored', 'vilda:persist-restored']) {
    await expect(reczny(page).locator('.gh-z-wiersza-btn')).toBeEnabled();
    await reczny(page).locator('.gh-z-wiersza-btn').click();
    await page.fill('#ghZWierszaDawka', '0.9');
    // Bez patientId: znacznik pacjenta się nie zmienia, więc panel zamyka samo zdarzenie — od razu, w chwili
    // zdarzenia (inne moduły przebudowują wiersze dopiero po kilku sekundach i to też zamknęłoby panel).
    const otwartyPo = await page.evaluate((n) => {
      document.dispatchEvent(new CustomEvent(n, { detail: { source: 'e2e' } }));
      return Boolean(document.getElementById('ghZWierszaPanel'));
    }, zdarzenie);
    expect(otwartyPo, zdarzenie).toBe(false);
    expect(await znacznik(page), zdarzenie).toBeNull();
  }
  expect(await modul(page)).toEqual([P1, P2]);
});

test('zmiana pacjenta (2/3): inny znacznik pacjenta karty bez zdarzenia (zmiana w innej ramce) zamyka panel i komunikat', async ({ page }) => {
  test.setTimeout(150_000);
  await zaloguj(page);
  await startGotowy(page);
  await pacjentka(page);
  await reczny(page).locator('.gh-z-wiersza-btn').click();
  await page.fill('#ghZWierszaDawka', '0.9');
  await page.evaluate(() => { window._vildaCurrentPatientId = 'gh-e2e-znacznik-b'; });
  await reczny(page).locator('.adv-bone-age').fill('9');
  await expect(page.locator('#ghZWierszaPanel')).toHaveCount(0);
  expect(await modul(page)).toEqual([P1, P2]);

  // Zapis przy znaczniku B, komunikat; potem znacznik C i zmiana w karcie („Dodaj kolejny pomiar”) — komunikat znika.
  await reczny(page).locator('.adv-bone-age').fill('');
  await reczny(page).locator('.gh-z-wiersza-btn').click();
  await page.fill('#ghZWierszaDawka', '0.9');
  await page.click('#ghZWierszaZapisz');
  await expect(page.locator('#ghZWierszaStatus')).toHaveText(ZAPISANO);
  await page.waitForTimeout(500);
  await expect(page.locator('#ghZWierszaStatus'), 'ten sam pacjent: komunikat zostaje').toHaveText(ZAPISANO);
  await page.evaluate(() => { window._vildaCurrentPatientId = 'gh-e2e-znacznik-c'; });
  await page.click('#advAddMeasurementBtn');
  await expect(page.locator('#ghZWierszaStatus')).toHaveCount(0);
});

test('zmiana pacjenta (3/3): „Wyczyść wszystkie pola” na Start usuwa komunikat „Zapisano…”', async ({ page }) => {
  test.setTimeout(150_000);
  await zaloguj(page);
  await startGotowy(page);
  await pacjentka(page);
  await reczny(page).locator('.gh-z-wiersza-btn').click();
  await page.fill('#ghZWierszaDawka', '0.9');
  await page.click('#ghZWierszaZapisz');
  await expect(page.locator('#ghZWierszaStatus')).toHaveText(ZAPISANO);
  expect(await znacznik(page)).toBeNull();
  await page.click('#clearAllDataBtn');
  const straznik = page.locator('.vug-btn.vug-danger');
  if (await straznik.isVisible({ timeout: 2000 }).catch(() => false)) await straznik.click();
  await expect(page.locator('#lastName')).toHaveValue('');
  await expect(page.locator('#ghZWierszaStatus')).toHaveCount(0);
  expect(await znacznik(page), 'pacjent bez sejfu: znacznik pusty także po „Wyczyść”').toBeNull();
});

// Uwaga z przeglądu: „Zapisz dane” wysyła vilda:patient-loaded (source: 'save') i przy pierwszym zapisie zmienia
// znacznik pacjenta z pustego na id. To ten sam pacjent — panel z wpisaną dawką i komunikat „Zapisano…” zostają.
test('„Zapisz dane” bieżącego pacjenta nie zamyka panelu ani komunikatu (ten sam pacjent)', async ({ page }) => {
  test.setTimeout(150_000);
  await zaloguj(page);
  await startGotowy(page);
  await pacjentka(page);
  expect(await znacznik(page)).toBeNull();
  await reczny(page).locator('.gh-z-wiersza-btn').click();
  await page.fill('#ghZWierszaDawka', '0.9');
  await page.evaluate(() => window.VildaDataImportExport.saveUserData({}));
  await expect.poll(() => znacznik(page), { message: 'pierwszy zapis nadaje pacjentowi znacznik', timeout: 15000 }).not.toBeNull();
  await page.locator('#advMeasurements .measure-row[data-gh-id] .adv-bone-age').first().dispatchEvent('input');
  await page.waitForTimeout(500);
  await expect(page.locator('#ghZWierszaPanel')).toBeVisible();
  await expect(page.locator('#ghZWierszaDawka')).toHaveValue('0.9');

  await page.click('#ghZWierszaZapisz');
  await expect(page.locator('#ghZWierszaStatus')).toHaveText(ZAPISANO);
  await page.evaluate(() => window.VildaDataImportExport.saveUserData({}));
  await page.waitForTimeout(1500);
  await page.click('#advAddMeasurementBtn');
  await page.waitForTimeout(300);
  await expect(page.locator('#ghZWierszaStatus')).toHaveText(ZAPISANO);
});

test('okno blokady mostka: wiersz ręczny znika od razu, wiersz punktu GH pojawia się po końcu okna; F5 zachowuje stan', async ({ page }) => {
  test.setTimeout(180_000);
  await zaloguj(page);
  await startGotowy(page);
  await pacjentka(page);
  await reczny(page).locator('.gh-z-wiersza-btn').click();
  await page.fill('#ghZWierszaDawka', '0.9');
  // Okno 10 s, nie 2,5 s: pod obciążeniem (pełny zestaw, 4 workery) klik, zapis i odczyt wierszy
  // trwały dłużej niż 2,5 s, okno mijało przed asercją „wiersza GH jeszcze nie ma” i test padał,
  // choć moduł działał dobrze. Czekanie na wiersz po końcu okna — z zapasem.
  await page.evaluate(() => { window.__vildaSuppressGhAdvancedImportUntil = Date.now() + 10_000; });
  await page.click('#ghZWierszaZapisz');
  await expect(page.locator('#ghZWierszaStatus')).toHaveText(ZAPISANO);
  expect(await wiersze(page)).toEqual(['GH 8/0', 'GH 8/6']);
  await expect(page.locator('.gh-z-wiersza-btn')).toHaveCount(0);
  await expect.poll(() => wiersze(page), { timeout: 25_000 }).toEqual(['GH 8/0', 'GH 8/6', 'GH 9/0']);
  const lista = await modul(page);
  expect(lista).toHaveLength(3);

  await page.waitForTimeout(1500); // zapis sesji karty
  await page.reload({ waitUntil: 'load' });
  await startGotowy(page);
  await page.evaluate(() => {
    const t = document.getElementById('toggleAdvancedGrowth');
    const f = document.getElementById('advancedGrowthForm');
    if (t && !(f && getComputedStyle(f).display !== 'none')) t.click();
  });
  await expect.poll(() => modul(page), { timeout: 10000 }).toEqual(lista);
  await expect.poll(() => wiersze(page), { timeout: 10000 }).toEqual(['GH 8/0', 'GH 8/6', 'GH 9/0']);
});

test('powłoka: punkt zapisany z wiersza na Start jest w tabeli monitora w DocPro', async ({ page }) => {
  test.setTimeout(180_000);
  await zaloguj(page, '/app.html#/start');
  const ramka = async (tytul) => {
    await page.waitForFunction((n) => {
      const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
      return Boolean(f && f.contentWindow && f.contentWindow.VildaPersistence);
    }, tytul, { timeout: 30000 });
    return (await page.$(`iframe.app-pane[title="${tytul}"]`)).contentFrame();
  };
  const start = await ramka('Start');
  await startGotowy(start);
  await pacjentka(start);
  await start.locator('#advMeasurements .measure-row:not([data-gh-id]) .gh-z-wiersza-btn').click();
  await start.fill('#ghZWierszaDawka', '0.9');
  await start.click('#ghZWierszaZapisz');
  await expect(start.locator('#ghZWierszaStatus')).toHaveText(ZAPISANO);
  const id = (await start.evaluate(() => window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', []))).at(-1).id;

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await ramka('DocPro');
  await docpro.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(2600);
  await docpro.evaluate(() => window.refreshGHTherapyMonitor());
  await expect.poll(() => docpro.evaluate(() => Array.from(document.querySelectorAll('#ghTherapyTbody .edit-gh-pt-btn'))
    .map((b) => b.getAttribute('data-id')))).toEqual([P1.id, P2.id, String(id)]);
});

test('VildaGhProgramyDane = programy karty leczenia (kolejność, etykiety) i preparaty programu w monitorze (DocPro)', async ({ page }) => {
  test.setTimeout(150_000);
  await zaloguj(page, '/docpro.html');
  await page.waitForFunction(() => typeof window.ghOpenRetroForm === 'function' && Boolean(window.vildaGhIgfPersistApi), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const wynik = await page.evaluate(async () => {
    const wczytaj = (src) => new Promise((ok, zle) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = zle; document.head.appendChild(s); });
    if (!window.VildaGhProgramyDane) await wczytaj('vilda_gh_programy_dane.js');
    window.vildaGhIgfPersistApi.ensureMounted();
    window.ghOpenRetroForm();
    const prog = document.getElementById('therProg');
    const karta = Array.from(prog.options).map((o) => ({ kod: o.value, etykieta: o.textContent }));
    const monitor = {};
    const retro = document.getElementById('ghRetroProg');
    for (const o of Array.from(retro.options)) {
      retro.value = o.value;
      window.ghRetroProgramChanged();
      monitor[o.value] = Array.from(document.getElementById('ghRetroDrug').options).map((x) => x.value).filter(Boolean);
    }
    const dane = window.VildaGhProgramyDane.programy;
    return {
      karta, monitor,
      dane: dane.map((p) => ({ kod: p.kod, etykieta: p.etykieta })),
      danePreparaty: Object.fromEntries(dane.map((p) => [p.kod, p.preparaty.slice()])),
    };
  });
  expect(wynik.dane).toEqual(wynik.karta);
  expect(wynik.danePreparaty).toEqual(wynik.monitor);
});
