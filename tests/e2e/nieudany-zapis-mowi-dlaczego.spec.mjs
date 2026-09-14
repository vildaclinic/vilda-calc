import { expect, test } from '../support/test-czas.mjs';

// P-CICHY-ZAPIS (zgłoszenie właściciela 2026-09-14) — nieudany zapis nie mówił nic.
//
// Wszystkie komunikaty tego modułu wisiały na `f("saveDataBtn")` albo `f("loadDataBtn")`,
// a OBU tych przycisków dawno nie ma w HTML (opcje zapisu przeniesiono do menu). `showTooltip`
// przy pustej kotwicy milczy, a `O()` i tak meldowało sukces, więc awaryjny alert nie miał
// szansy się odezwać. Zmierzone przed poprawką: `saveUserData()` → null, `.menu-tooltip` → 0,
// alert → brak. Lekarz klikał „Zapisz dane" i nic mu nie mówiło, że nic się nie zapisało.
//
// Ten test sprawdza to, czego test jednostkowy nie może: że komunikat NAPRAWDĘ pojawia się
// na stronie i że kursor ląduje na brakującym polu.
//
// Test zakłada WŁASNE, fikcyjne konto sejfu w efemerycznym profilu przeglądarki. Nie dotyka
// żadnego prawdziwego sejfu ani prawdziwych danych.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#CichyZapis!26a';

async function otworzZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => typeof window.saveUserData === 'function'
    && typeof window.clearAllData === 'function');
}

async function probujZapisac(page, pola) {
  await page.evaluate(() => { try { window.clearAllData(); } catch (_) { /* nieistotne */ } });
  await page.waitForTimeout(800);
  await page.evaluate((p) => {
    Object.keys(p).forEach((id) => {
      const e = document.getElementById(id);
      if (e) {
        e.value = p[id];
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }, pola);
  await page.waitForTimeout(600);
  await page.evaluate(async () => { await window.saveUserData(); });
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    // P-PASEK-STATUSU (2026-09-14): komunikat stoi teraz w STAŁYM pasku, a nie w dymku.
    // Czytamy stamtąd, gdzie naprawdę jest — z widocznego paska, a gdy go nie ma, z dymka.
    // Twierdzenia poniżej zostają bez zmian: to samo zdanie i ten sam kursor, inny nośnik.
    const paski = Array.prototype.slice.call(document.querySelectorAll('[data-vilda-status]'));
    const widoczny = paski.filter((el) => !el.hidden && el.offsetParent !== null)[0] || null;
    const wPasku = widoczny && widoczny.querySelector('.vilda-status-tekst');
    return {
      komunikat: wPasku
        ? wPasku.textContent
        : ((document.querySelector('.menu-tooltip') || {}).textContent || null),
      nosnik: wPasku ? 'pasek' : 'dymek',
      fokus: document.activeElement ? document.activeElement.id : null,
    };
  });
}

test.describe('Zapis, który nie doszedł do skutku, mówi dlaczego', () => {
  test('komunikat nazywa braki i stawia kursor na pierwszym z nich', async ({ page }) => {
    test.setTimeout(180_000);
    await otworzZKontem(page);

    // Trzy różne braki pod rząd. To także sprawdza, że licznik wygaszania starego dymka
    // nie gasi nowszego — przed poprawką drugi i trzeci komunikat znikały natychmiast.
    const bezWiekuIWagi = await probujZapisac(page,
      { firstName: 'Sonda', lastName: 'Fikcyjna', height: '130' });
    expect(bezWiekuIWagi.komunikat).toBe('Nie zapisano — uzupełnij: wiek i masę ciała.');
    expect(bezWiekuIWagi.nosnik, 'na index.html nosnikiem jest staly pasek').toBe('pasek');
    expect(bezWiekuIWagi.fokus).toBe('age');

    const bezWagi = await probujZapisac(page,
      { firstName: 'Sonda', lastName: 'Fikcyjna', age: '8', ageMonths: '0', height: '130' });
    expect(bezWagi.komunikat).toBe('Nie zapisano — uzupełnij: masę ciała.');
    expect(bezWagi.fokus).toBe('weight');

    const bezNazwiska = await probujZapisac(page,
      { age: '8', ageMonths: '0', height: '130', weight: '26' });
    expect(bezNazwiska.komunikat).toBe('Nie zapisano — uzupełnij: imię i nazwisko.');
    expect(bezNazwiska.fokus).toBe('lastName');
  });

  test('komplet danych zapisuje się bez komunikatu o brakach', async ({ page }) => {
    test.setTimeout(180_000);
    await otworzZKontem(page);

    // Formularz dochodzi do stanu ustalonego asynchronicznie, więc pojedyncza próba zapisu
    // bywa odrzucona przez niekompletne pola — powtarzamy, aż pacjent trafi do bazy, i dopiero
    // wtedy patrzymy na komunikat. Inaczej test migotałby z powodu, którego nie bada.
    let wynik = null;
    let ilu = 0;
    for (let proba = 0; proba < 8; proba += 1) {
      wynik = await probujZapisac(page, {
        firstName: 'Sonda', lastName: 'Fikcyjna', sex: 'M',
        age: '8', ageMonths: '0', height: '130', weight: '26',
      });
      ilu = await page.evaluate(async () => (await window.VildaVault.listPatients()).length);
      if (ilu >= 1) break;
    }
    expect(ilu, 'pacjent naprawdę trafił do bazy').toBeGreaterThan(0);
    expect(wynik.komunikat, 'przy komplecie danych nie straszymy brakami')
      .not.toContain('Nie zapisano');
  });
});
