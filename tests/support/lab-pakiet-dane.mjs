import { expect } from '@playwright/test';
import { bezBaneraZgody, otworzSejf } from './lab-historia-dane.mjs';
import { kliknij, zaznacz } from './uklad-czekanie.mjs';

/**
 * LAB-PAKIETY PR1: przelicznik jednostek z odblokowanym fikcyjnym sejfem i (opcjonalnie) fikcyjną pacjentką
 * wczytaną tak, jak robi to formularz: identyfikator w sesji, dane wspólne i zdarzenie wczytania.
 * Dane wyłącznie FIKCYJNE. Zegar stron w testach to 17.06.2026 (tests/support/czas.mjs).
 */
export const PACJENTKA = Object.freeze({ name: 'Fikcyjna Badaniowa', sex: 'F', age: 12, ageMonths: 3 });

export async function wczytajPacjenta(scope, patientId, dane = PACJENTKA) {
  await scope.evaluate(({ pid, dane }) => {
    sessionStorage.setItem('vildaCurrentPatientId', pid);
    window.VildaPersistence.writeShared(dane, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: pid } }));
  }, { pid: patientId, dane });
}

export async function otworzPakiet(page, { pacjent = true } = {}) {
  await bezBaneraZgody(page);
  const patientId = await otworzSejf(page, '/przelicznik-jednostek.html');
  if (pacjent) await wczytajPacjenta(page, patientId);
  await page.locator('#labModePackage').click();
  return { patientId };
}

export const kartaPakietu = (scope) => scope.locator('#labPackageCard');
export const wynikiBadan = (scope, patientId) => scope.evaluate(async (pid) => (await window.VildaVault.listPatientNotesForPatient(pid))
  .filter((n) => n.category === 'wynik-badania')
  .sort((a, b) => String(a.labResult.testKey).localeCompare(String(b.labResult.testKey))), patientId);
export const tekst = async (locator) => (await locator.innerText()).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

// LAB-PAKIETY PR4/PR5: lista wyboru pakietu, własne pakiety konta i kreator.
export const opcjeListy = (page) => page.locator('#labPkgSelect').evaluate((s) => [...s.querySelectorAll('optgroup')].map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.textContent)]));
// Własne pakiety tak, jak ma je konto w sejfie — to ta wartość idzie do synchronizacji między urządzeniami.
export const pakietyKonta = (page) => page.evaluate(async () => {
  const wpis = (await window.VildaVault.exportSyncPayload()).userPreferences?.labCustomPackages;
  return wpis ? JSON.parse(wpis.value).packages.map((p) => [p.name, p.analytes]) : null;
});
// Pakiety zalogowanego konta w jego kopii na urządzeniu.
export const pakietyUrzadzenia = (page) => page.evaluate(() => window.VildaLabPackages.readCustom(window.VildaPersistence).packages.map((p) => [p.name, p.analytes]));

export async function utworzPakiet(page, nazwa, badania) {
  await page.locator('#labPkgNew').click();
  await page.locator('#labPkgCreatorName').fill(nazwa);
  // Grupy katalogu są zwinięte; test otwiera wszystkie naraz, żeby zaznaczać badania w zadanej kolejności.
  // Katalog z otwartymi grupami jest dłuższy niż okno, a strona przewija się płynnie (scroll-behavior: smooth):
  // zaznaczanie i zapis idą przez bramki układu (tests/support/uklad-czekanie.mjs), które ustawiają cel bez
  // animacji. Bez nich wolniejsza maszyna wpada w pętlę „element is not stable / outside of the viewport”.
  await page.locator('#labPkgCreatorGroups details').evaluateAll((grupy) => grupy.forEach((g) => { g.open = true; }));
  for (const id of badania) await zaznacz(page.locator(`#labPkgCreatorOpt-${id}`));
  await kliknij(page.locator('#labPkgCreatorSave'));
  await expect(page.locator('#labPkgCreator')).toBeHidden();
  await expect(page.locator('#labPkgSelect option:checked')).toHaveText(nazwa);
}
