import { expect, test } from '../support/test-czas.mjs';
import { otworzPrzelicznik, pasekHistorii, wybierzBadanie } from '../support/lab-historia-dane.mjs';

// LAB-HISTORIA 6.38 (P-PRZYPIETY-WYNIK, decyzje właściciela 2026-11-17): po przypięciu wynik formularza jest „już
// w karcie”. Przycisk „Przypnij do wizyty” pokazuje „✓ Przypięto”, pasek „Poprzednie wyniki pacjenta” nie rysuje
// tego samego pomiaru drugi raz (bez chipu i pasa „teraz”, chip i punkt notatki ze znacznikiem „✓ z formularza”),
// a okno przypięcia nie zapisze drugi raz tego samego wyniku z tą samą datą badania. Prawdziwy sejf z fikcyjną
// historią TSH (tests/support/lab-historia-dane.mjs; zegar stron 17.06.2026).
test.use({ serviceWorkers: 'block' });

const bezTwardejSpacji = (s) => String(s).replace(/\u00a0/g, ' ');
const tekst = async (locator) => bezTwardejSpacji(await locator.innerText()).replace(/\s+/g, ' ').trim();
const PRZYPNIJ = '\u{1F4CC} Przypnij do wizyty';
const BLOKADA = 'Ten sam wynik z tą datą badania jest już w karcie. Zmień datę badania albo anuluj.';

async function notatkiTsh(page, pid) {
  return (await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), pid))
    .filter((n) => n.labResult && n.labResult.testKey === 'tsh' && n.labResult.valueNum === 0.38)
    .map((n) => ({ id: n.id, data: n.clinicalDateISO }));
}

test('TSH 0,38: „✓ Przypięto”, pasek bez drugiego punktu, blokada tej samej daty, osobne badanie i stan po odświeżeniu', async ({ page }) => {
  const { patientId } = await otworzPrzelicznik(page, { wartosc: '' });
  await page.locator('#labUnit').selectOption('mIU/L');
  await page.locator('#labValue').fill('0,38');
  const przycisk = page.locator('#labPinResultBtn'), podpis = page.locator('#labPinSub');
  const pasek = pasekHistorii(page), svg = pasek.locator('svg.lab-strip-svg');
  await expect(przycisk).toHaveText(PRZYPNIJ);
  await expect(przycisk).not.toHaveClass(/is-pinned/);
  await expect(podpis).toHaveText('wynik trafi do karty pacjenta');
  await expect(pasek.locator('.lab-strip-now .lab-strip-chip-d')).toHaveText('teraz · niezapisany');

  // Przypięcie z proponowaną datą (dziś).
  await przycisk.click();
  await expect(page.locator('#labPinDate')).toHaveValue('2026-06-17');
  await expect(page.locator('#labPinDuplicate')).toBeHidden();
  await expect(page.locator('#labPinSave')).toHaveText('Zapisz do karty');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const [pierwsza] = await notatkiTsh(page, patientId);
  expect(pierwsza.data).toBe('2026-06-17');

  // Przycisk i podpis wiersza mówią na stałe, że wynik jest w karcie.
  await expect(przycisk).toHaveText('✓ Przypięto');
  await expect(przycisk).toHaveClass(/is-pinned/);
  await expect(przycisk).toHaveAttribute('title', /już w karcie/);
  await expect(podpis).toHaveText('TSH 0,38 mIU/L jest już w karcie · badanie 17.06.26');

  // Pasek: jeden chip i jeden punkt tej notatki ze znacznikiem, bez chipu i pasa „teraz”.
  await expect(pasek.locator('.lab-strip-sub')).toHaveText('Fikcyjna Badaniowa · 5 wyników · ostatni 17.06.26');
  await expect(pasek.locator('.lab-strip-now')).toHaveCount(0);
  await expect(pasek.locator('.lab-strip-sep')).toHaveCount(0);
  const przypiety = pasek.locator('button.lab-strip-chip.is-pinned');
  await expect(przypiety).toHaveCount(1);
  await expect(przypiety).toHaveAttribute('data-note-id', pierwsza.id);
  await expect(przypiety.locator('.lab-strip-chip-d')).toHaveText('17.06.26');
  await expect(przypiety.locator('.lab-strip-chip-pin')).toHaveText('· ✓ z formularza');
  // Strzałka wg zakresu zapisanego z wynikiem przy przypięciu (decyzja 6.3), jak przy każdym zapisanym chipie.
  await expect(przypiety.locator('.lab-strip-chip-v')).toHaveText('0,38↓');
  expect(await tekst(pasek.locator('.lab-strip-diff'))).toBe('ostatni zapisany wynik: 17.06.26 (dziś) · 0,38 mIU/L · to wynik z formularza, już w karcie');
  await expect(svg.locator('g.lab-strip-pt')).toHaveCount(5);
  await expect(svg.locator('line.lab-strip-drop')).toHaveCount(5);
  await expect(svg.locator('rect.lab-strip-lane')).toHaveCount(0);
  await expect(svg.locator('circle.lab-strip-now-dot')).toHaveCount(0);
  await expect(svg.locator('text.lab-strip-now-label')).toHaveCount(0);
  await expect(svg.locator('text.lab-strip-val')).toHaveText(['0,01', '0,02', '0,05', '0,12', '0,38']);
  await expect(svg.locator('g.lab-strip-pt.is-pinned')).toHaveAttribute('data-note-id', pierwsza.id);
  await expect(svg.locator('circle.lab-strip-pin-ring')).toHaveCount(1);
  await expect(svg.locator('text.lab-strip-pin-sub')).toHaveText('✓ z formularza');
  await expect(svg).toHaveAttribute('aria-label', /wynik z formularza 17\.06\.26 jest już w karcie$/);

  // Sama zmiana jednostki docelowej (przeliczenie) nie zmienia stanu: to ten sam pomiar.
  await page.locator('#labUnitTarget').selectOption({ index: 1 });
  await expect(przycisk).toHaveText('✓ Przypięto');

  // Inna wartość: znów „Przypnij do wizyty”, chip i pas „teraz”; powrót do 0,38 — znów przypięty.
  await page.locator('#labValue').fill('0,5');
  await expect(przycisk).toHaveText(PRZYPNIJ);
  await expect(przycisk).not.toHaveClass(/is-pinned/);
  await expect(podpis).toHaveText('wynik trafi do karty pacjenta');
  await expect(pasek.locator('.lab-strip-now .lab-strip-chip-d')).toHaveText('teraz · niezapisany');
  await expect(pasek.locator('button.lab-strip-chip.is-pinned')).toHaveCount(0);
  await expect(svg.locator('rect.lab-strip-lane')).toHaveCount(1);
  await expect(svg.locator('text.lab-strip-now-label')).toHaveText('teraz');
  await page.locator('#labValue').fill('0,38');
  await expect(przycisk).toHaveText('✓ Przypięto');
  await expect(pasek.locator('.lab-strip-now')).toHaveCount(0);

  // „✓ Przypięto” otwiera okno z ostrzeżeniem; ta sama data badania — zapis zablokowany, bez nowych pól.
  await przycisk.click();
  const ostrzezenie = page.locator('#labPinDuplicate');
  await expect(ostrzezenie).toBeVisible();
  await expect(ostrzezenie.locator('.lab-pin-duplicate-title')).toHaveText('Ten wynik jest już w karcie');
  await expect(ostrzezenie.locator('.lab-pin-duplicate-text')).toHaveText(/^TSH 0,38 mIU\/L · badanie 17\.06\.26 · przypięty dziś o \d\d:\d\d\. Zapisz drugi raz tylko wtedy, gdy to osobne badanie z inną datą\.$/);
  await expect(page.locator('#labPinDuplicateDate')).toHaveText(BLOKADA);
  await expect(page.locator('#labPinDate')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#labPinSave')).toBeDisabled();
  await expect(page.locator('#labPinSave')).toHaveText('Zapisz jako osobne badanie');
  await expect(page.locator('#labPinOverlay').locator('input, select, textarea')).toHaveCount(2);

  // Inna data: osobne badanie zapisuje się.
  await page.locator('#labPinDate').fill('2026-06-10');
  await expect(page.locator('#labPinDuplicateDate')).toBeHidden();
  await expect(page.locator('#labPinDate')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#labPinSave')).toBeEnabled();
  await expect(page.locator('#labPinSave')).toHaveText('Zapisz jako osobne badanie');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const obie = await notatkiTsh(page, patientId);
  expect(obie.map((n) => n.data).sort()).toEqual(['2026-06-10', '2026-06-17']);
  const druga = obie.find((n) => n.data === '2026-06-10');

  // Ostatnie przypięcie z tej strony (inna data niż dzisiejsza) — nadal „✓ Przypięto”, z jego datą badania.
  await expect(przycisk).toHaveText('✓ Przypięto');
  await expect(podpis).toHaveText('TSH 0,38 mIU/L jest już w karcie · badanie 10.06.26');
  await expect(pasek.locator('button.lab-strip-chip.is-pinned')).toHaveAttribute('data-note-id', druga.id);
  expect(await tekst(pasek.locator('.lab-strip-diff'))).toBe('ostatni zapisany wynik: 17.06.26 (dziś) · 0,38 mIU/L · wynik z formularza jest w karcie z datą 10.06.26');
  // Okno z proponowaną dzisiejszą datą: blokuje notatka z 17.06.26 i to ją nazywa ostrzeżenie (nie ostatnie przypięcie z 10.06.26).
  await przycisk.click();
  await expect(page.locator('#labPinSave')).toBeDisabled();
  await expect(page.locator('#labPinDuplicate .lab-pin-duplicate-text')).toHaveText(/^TSH 0,38 mIU\/L · badanie 17\.06\.26 · /);
  await page.locator('#labPinCancel').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);

  // Po odświeżeniu (pole wartości jest puste) ten sam wynik wpisany ponownie — stan z karty: notatka z dzisiejszą datą.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked());
  await page.evaluate((pid) => {
    sessionStorage.setItem('vildaCurrentPatientId', pid);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: pid } }));
  }, patientId);
  await wybierzBadanie(page, 'tsh', 'TSH');
  await page.locator('#labUnit').selectOption('mIU/L');
  await page.locator('#labValue').fill('0,38');
  await expect(przycisk).toHaveText('✓ Przypięto');
  await expect(podpis).toHaveText('TSH 0,38 mIU/L jest już w karcie · badanie 17.06.26');
  await expect(pasek.locator('button.lab-strip-chip.is-pinned')).toHaveAttribute('data-note-id', pierwsza.id);
  await expect(pasek.locator('.lab-strip-now')).toHaveCount(0);
  await przycisk.click();
  await expect(page.locator('#labPinSave')).toBeDisabled();
  await page.locator('#labPinCancel').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  expect(await notatkiTsh(page, patientId)).toHaveLength(2);
});

test('wynik bez przypięcia z tą samą liczbą sprzed miesięcy: zwykłe okno, bez ostrzeżenia i bez blokady', async ({ page }) => {
  // Fikcyjna historia ma TSH 0,12 mIU/L z 02.06.26: ten sam wynik w innym dniu to nowe badanie, nie duplikat.
  const { patientId } = await otworzPrzelicznik(page, { wartosc: '' });
  await page.locator('#labUnit').selectOption('mIU/L');
  await page.locator('#labValue').fill('0,12');
  await expect(page.locator('#labPinResultBtn')).toHaveText(PRZYPNIJ);
  await expect(pasekHistorii(page).locator('.lab-strip-now .lab-strip-chip-d')).toHaveText('teraz · niezapisany');
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinDuplicate')).toBeHidden();
  await expect(page.locator('#labPinDuplicateDate')).toBeHidden();
  await expect(page.locator('#labPinSave')).toBeEnabled();
  await expect(page.locator('#labPinSave')).toHaveText('Zapisz do karty');
  // Data badania jak u wpisu z historii: duplikat — blokada bez wcześniejszego przypięcia z tej strony.
  await page.locator('#labPinDate').fill('2026-06-02');
  await expect(page.locator('#labPinDuplicate')).toBeVisible();
  await expect(page.locator('#labPinDuplicateDate')).toHaveText(BLOKADA);
  await expect(page.locator('#labPinSave')).toBeDisabled();
  await page.locator('#labPinDate').fill('2026-06-17');
  await expect(page.locator('#labPinSave')).toBeEnabled();
  await expect(page.locator('#labPinSave')).toHaveText('Zapisz do karty');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  await expect(page.locator('#labPinResultBtn')).toHaveText('✓ Przypięto');
  const tsh012 = (await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), patientId))
    .filter((n) => n.labResult && n.labResult.testKey === 'tsh' && n.labResult.valueNum === 0.12);
  expect(tsh012.map((n) => n.clinicalDateISO).sort()).toEqual(['2026-06-02', '2026-06-17']);
});
