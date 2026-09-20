import { expect, test } from '../support/test-czas.mjs';

// P-KOTWICA na PRAWDZIWEJ stronie: panel „Dane analityczne — otyłość" w Karcie Pacjenta.
//
// Do SW 1.1.10 panel wydawał twardy werdykt „wg ChPL odstawić i ponownie ocenić" w 12. tygodniu
// OD WŁĄCZENIA liraglutydu, choć ChPL liczy te 12 tygodni od dawki podtrzymującej 3,0 mg/dobę
// (4 tyg. zwiększania dawki → 16. tydzień od włączenia). Testy jednostkowe pilnują silnika;
// ten test pilnuje tego, co lekarz naprawdę widzi na ekranie.
//
// Dane pacjentów wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Kotwica!26a';

const WLACZENIE = '2026-01-05';
const PO_12_TYG = '2026-03-30';   // +84 dni
const PO_16_TYG = '2026-04-27';   // +112 dni

async function otworzZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.ObesityResponseCriteria));
}

/** Pacjent dorosły na liraglutydzie: punkt „Włączenie" + punkt kontrolny w podanym dniu. */
async function pacjentNaLiraglutydzie(page, { imie, dataKontroli, masaKontrolna }) {
  return page.evaluate(async (d) => {
    const punkt = (type, dateISO, weight) => ({
      id: type + '-' + dateISO,
      type,
      ageYears: 40,
      ageMonths: 0,
      weight,
      height: 170,
      bmi: +(weight / Math.pow(1.7, 2)).toFixed(1),
      dose: '3,0 mg / dobę',
      dateISO,
      drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę',
      substance: 'liraglutide',
    });
    const wynik = await window.VildaVault.savePatient({
      name: `Testowy ${d.imie}`,
      user: { lastName: 'Testowy', firstName: d.imie, sex: 'M', age: 40, ageMonths: 0, height: 170, weight: d.masaKontrolna },
      obesityTherapyPoints: [
        punkt('start', d.wlaczenie, 100),
        punkt('continue', d.dataKontroli, d.masaKontrolna),
      ],
    }, { dedup: false });
    return wynik.patientId;
  }, { imie, dataKontroli, masaKontrolna, wlaczenie: WLACZENIE });
}

/** Otwiera Kartę, rozwija panel analityczny otyłości i oddaje treść werdyktu. */
async function werdykt(page, patientId) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  const przycisk = page.locator('.vilda-gha-btn', { hasText: 'Dane analityczne' });
  await expect(przycisk, 'panel analityczny otyłości istnieje w Karcie').toBeVisible();
  await przycisk.click();
  const blok = page.locator('.vilda-oba-verdict');
  await expect(blok, 'werdykt jest widoczny po rozwinięciu').toBeVisible();
  return page.evaluate(() => {
    const el = document.querySelector('.vilda-oba-verdict');
    return {
      klasa: el.className,
      tytul: (el.querySelector('.vilda-oba-vt') || {}).textContent || '',
      opis: (el.querySelector('.vilda-oba-vd') || {}).textContent || '',
    };
  });
}

test.describe('P-KOTWICA — Karta Pacjenta nie odstawia leku za wcześnie', () => {
  test('KOTWICA-1: w 12. tygodniu od włączenia liraglutydu panel NIE każe odstawić', async ({ page }) => {
    // Redukcja 3 % — poniżej progu 5 %. Przed poprawką panel orzekał tu „odstawić".
    await otworzZKontem(page);
    const pid = await pacjentNaLiraglutydzie(page, { imie: 'Kotwica-12', dataKontroli: PO_12_TYG, masaKontrolna: 97 });
    const w = await werdykt(page, pid);

    expect(w.tytul, 'okno oceny jeszcze nie jest otwarte').toContain('Przed oknem oceny');
    expect(w.tytul, 'żadnego nakazu odstawienia').not.toContain('odstawić');
    expect(w.klasa, 'nie czerwony').not.toContain('bad');
    expect(w.opis, 'panel mówi, o jaką dawkę chodzi').toContain('dawki podtrzymującej');
    expect(w.opis, 'nie pokazuje ujemnego numeru tygodnia').not.toMatch(/-\d+\.\s*tydz/);
  });

  test('KOTWICA-2: w 16. tygodniu okno jest otwarte i werdykt zapada — z nazwanym założeniem', async ({ page }) => {
    await otworzZKontem(page);
    const pid = await pacjentNaLiraglutydzie(page, { imie: 'Kotwica-16', dataKontroli: PO_16_TYG, masaKontrolna: 97 });
    const w = await werdykt(page, pid);

    expect(w.tytul, 'teraz ChPL rzeczywiście każe odstawić').toContain('odstawić');
    expect(w.klasa).toContain('bad');
    expect(w.opis, 'lekarz widzi, że kotwicę przyjęto nominalnie').toContain('nominalnego czasu zwiększania dawki');
    expect(w.opis, 'z podaną liczbą tygodni').toContain('4 tyg.');
  });

  test('KOTWICA-3: odpowiedź wystarczająca w 16. tygodniu to „kontynuować"', async ({ page }) => {
    // Kontrola pozytywna: poprawka nie blokuje werdyktu, tylko przesuwa jego moment.
    await otworzZKontem(page);
    const pid = await pacjentNaLiraglutydzie(page, { imie: 'Kotwica-Pass', dataKontroli: PO_16_TYG, masaKontrolna: 93 });
    const w = await werdykt(page, pid);

    expect(w.tytul).toContain('kontynuować');
    expect(w.klasa).toContain('good');
  });
});
