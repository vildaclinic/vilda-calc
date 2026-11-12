import { bezBaneraZgody, otworzSejf } from './lab-historia-dane.mjs';

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
