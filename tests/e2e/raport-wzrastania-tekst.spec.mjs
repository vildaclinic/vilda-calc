import { expect, test } from '@playwright/test';

// ADV-REPORT-8 (zgłoszenie właściciela 2026-09-13). Raport wzrastania zamawiany z okna wyboru PDF
// w Karcie Pacjenta powstawał inną drogą niż ten spod przycisku karty: jako ZDJĘCIE strony.
// Skutki, które właściciel zobaczył w gotowym pliku: tekstu nie dało się zaznaczyć ani wyszukać,
// a strony cięto po wysokości arkusza, więc wiersz tabeli bywał przecięty poziomo w połowie.
// Test sprawdza WPIĘCIE: czy z tamtej drogi wychodzi dokument tekstowy. Dane wyłącznie FIKCYJNE.

async function ustawPacjenta(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.calculateGrowthAdvanced === 'function' && !!window.VildaAdvancedGrowth);
  await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    window.professionalMode = true;
    set('age', 12); set('ageMonths', 0); set('sex', 'M');
    set('height', 150); set('weight', 40);
    set('advMotherHeight', 165); set('advFatherHeight', 180); set('advBoneAge', 12);
    const pole = document.getElementById('advName') || document.getElementById('name');
    if (pole) pole.value = 'Jan Przykładowy';
  });

  // Raport wymaga co najmniej jednego punktu historycznego — dodajemy go przyciskiem
  // karty, czyli tą samą drogą, co lekarz (karta bywa zwinięta, więc klik przez DOM).
  const punkty = await page.evaluate(() => {
    const btn = document.getElementById('advAddMeasurementBtn');
    if (btn) btn.click();
    const wiersze = document.querySelectorAll('#advMeasurements .measure-row');
    const w = wiersze[wiersze.length - 1];
    if (w) {
      const wpisz = (sel, v) => {
        const el = w.querySelector(sel);
        if (!el) return;
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      wpisz('.adv-age-years', 11); wpisz('.adv-age-months', 0);
      wpisz('.adv-height', 143); wpisz('.adv-weight', 35);
    }
    window.calculateGrowthAdvanced();
    return window.VildaAdvancedGrowth.advGrowthCollectHistoricalPointsForReport().length;
  });
  expect(punkty).toBeGreaterThanOrEqual(1);
}

test('ADV-REPORT-8: raport z okna wyboru PDF ma tekst, a nie zdjęcie strony', async ({ page }) => {
  test.setTimeout(180_000);
  await ustawPacjenta(page);

  const out = await page.evaluate(async () => {
    const api = window.VildaAdvancedGrowth;
    const wynik = await api.advGrowthBuildPdfDocumentBlob();
    const bajty = new Uint8Array(await wynik.blob.arrayBuffer());
    let tekst = '';
    for (let i = 0; i < bajty.length; i += 1) tekst += String.fromCharCode(bajty[i]);
    return {
      nazwa: wynik.filename,
      naglowek: tekst.slice(0, 8),
      obrazy: (tekst.match(/\/Subtype\s*\/Image/g) || []).length,
      fonty: (tekst.match(/\/FontFile/g) || []).length,
      rozmiar: bajty.length,
    };
  });

  expect(out.naglowek.startsWith('%PDF')).toBe(true);
  expect(out.nazwa).toMatch(/^Raport_wzrastania.*\.pdf$/);
  // Sedno zgłoszenia: dokument ma nieść KROJE PISMA i ani jednego obrazu strony.
  expect(out.fonty).toBeGreaterThan(0);
  expect(out.obrazy).toBe(0);
  expect(out.rozmiar).toBeGreaterThan(5000);
});

test('ADV-REPORT-8: okno wyboru PDF oddaje ten sam dokument tekstowy, gdy raport jest jedynym zaznaczonym', async ({ page }) => {
  test.setTimeout(180_000);
  await ustawPacjenta(page);

  const out = await page.evaluate(async () => {
    if (typeof window.patientReportBuildSelectedPdfPackage !== 'function') return { brak: true };
    const paczka = await window.patientReportBuildSelectedPdfPackage(['growth']);
    const bajty = new Uint8Array(await paczka.blob.arrayBuffer());
    let tekst = '';
    for (let i = 0; i < bajty.length; i += 1) tekst += String.fromCharCode(bajty[i]);
    return {
      vector: paczka.vector === true,
      nazwa: paczka.filename,
      obrazy: (tekst.match(/\/Subtype\s*\/Image/g) || []).length,
      fonty: (tekst.match(/\/FontFile/g) || []).length,
      producent: /jsPDF/.test(tekst),
    };
  });

  if (out.brak) test.skip(true, 'patientReportBuildSelectedPdfPackage nie jest wystawiony na window');
  expect(out.vector).toBe(true);
  expect(out.nazwa).toMatch(/^Raport_wzrastania.*\.pdf$/);
  expect(out.fonty).toBeGreaterThan(0);
  expect(out.obrazy).toBe(0);
  // jsPDF składa strony z obrazów — jego obecność znaczyłaby powrót do wariantu rastrowego.
  expect(out.producent).toBe(false);
});
