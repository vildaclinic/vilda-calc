import { expect } from '@playwright/test';
import { createFictionalVault } from './centile-live-fixture.mjs';
import { visibleChromeMenu } from './chrome-menu-fixture.mjs';
import { BAZA } from './baza-pacjentow-lista.mjs';

// P-BAZA-STATYSTYKI, etap 1. Prawdziwy szyfrowany sejf w nowym kontekście Playwrighta i wyłącznie
// fikcyjne osoby. Zegar testu stoi na 17.06.2026 (tests/support/czas.mjs), więc wiek jest stały:
//
//   klucz  płeć  data urodzenia  wiek            przedział  karta
//   a      F     2024-12-01      1 r. 6 mies.    0–2        2 pomiary, rodzice, masa ur. (birth)
//   b      M     2021-06-17      5 lat (dziś)    3–5        GH bez Włączenia (sama Kontynuacja)
//   c      M     2018-01-10      8 l. 5 mies.    6–9        GH SNP: 3 lata kontroli, pomiar rok przed Włączeniem
//   d      F     2014-03-20      12 l. 2 mies.   10–13      GH ZT: kontrola po roku; masa ur. (perinatal)
//   e      M     2010-09-01      15 l. 9 mies.   14–17      GH SNP: kontrola tylko po 5 mies.
//   f      F     2005-05-05      21 l. 1 mies.   18+        —
//   g      M     brak            —               —          wiek tylko w zapisie pomiaru
//   h      brak  2016-06-18      9 l. 11 mies.   6–9        urodziny jutro
//
// Razem 8 pacjentów z bazy i 1 osoba spoza bazy (nie wchodzi do statystyk).
//
// Leczenie GH (etap 2), tempo liczone silnikiem aplikacji:
//   c  Włączenie 6 l. 0 mies. 112,0 cm; rok wcześniej 107,5 cm → przed 4,5 cm/rok;
//      kontrole: 6 l. 6 mies. 116,0 · 7 l. 0 mies. 121,4 (1. rok 9,4) · 8 l. 0 mies. 128,0 (2. rok 6,6)
//   d  Włączenie 9 l. 0 mies. 121,0 cm; kontrola 10 l. 0 mies. 128,4 → 1. rok 7,4; bez pomiaru sprzed leczenia
//   e  Włączenie 14 l. 0 mies. 150,0 cm; kontrola 14 l. 5 mies. 153,5 → leczenie krótsze niż 9 mies.
//   b  Kontynuacja 4 l. 6 mies. 106,0 cm, bez Włączenia
export const OCZEKIWANE = Object.freeze({
  razem: 8,
  sredniWiek: '10,5',          // (18+60+101+146+189+253+119) / 7 = 126,6 mies.
  mediana: '9,9 roku',         // 119 mies.
  zakres: 'od 1,5 roku do 21,1 roku',
  chlopcy: { n: 4, procent: '50%', sredniWiek: '9,7 roku' },
  dziewczeta: { n: 3, procent: '38%', sredniWiek: '11,6 roku' },
  przedzialy: { '0-2': 1, '3-5': 1, '6-9': 2, '10-13': 1, '14-17': 1, '18+': 1 },
  karty: { pomiary: '5 / 8', rodzice: '1 / 8', masaUrodzeniowa: '2 / 8' }, // pomiary: a, b, c, d, e
  gh: {
    leczeni: 4,
    programy: 'leczonych: 4 · SNP 2 · bez programu 1 · ZT 1',
    pierwszyRok: '8,4',                 // (9,4 + 7,4) / 2
    mediana: '8,4',
    n: 2,
    para: '4,5 → 9,4',                  // tylko c
    lata: [['1. rok', '8,4 cm/rok', 'n = 2'], ['2. rok', '6,6 cm/rok', 'n = 1']],
  },
});

export async function przygotujStatystyki(page) {
  await page.addInitScript(() => {
    const date = new Date();
    const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    for (const key of ['vilda-reminders-shown-v1', 'vilda-reminders-closed-v1']) {
      localStorage.setItem(key, `${day}|${Date.now()}`);
    }
  });
  const created = await createFictionalVault(page, { shell: true });
  const frame = created.frame;
  const ids = await frame.evaluate(async ({ existing }) => {
    const vault = window.VildaVault;
    const osoby = [
      { klucz: 'a', lastName: 'Fikcyjna Statystyka', firstName: 'Ala', sex: 'F', dobISO: '2024-12-01', age: 1, ageMonths: 6, height: 82, weight: 11,
        extra: {
          advanced: { motherHeight: 165, fatherHeight: 178 },
          birth: { weeks: '39', days: '0', weight: '3300', length: '53', head: '', sex: 'female' },
          growthBasic: { data: { measurements: [
            { ageMonths: 12, ageYears: 1, height: 75, weight: 9.5 },
            { ageMonths: 18, ageYears: 1.5, height: 82, weight: 11 },
          ] } },
        } },
      { klucz: 'b', lastName: 'Fikcyjny Statystyk', firstName: 'Bartek', sex: 'M', dobISO: '2021-06-17', age: 5, ageMonths: 0, height: 110, weight: 19,
        extra: { ghTherapyPoints: [{ id: 'gh-b-1', type: 'continue', ageYears: 4, ageMonths: 6, height: 106, weight: 17.5 }] } },
      { klucz: 'c', lastName: 'Fikcyjny Statystyk', firstName: 'Cezary', sex: 'M', dobISO: '2018-01-10', age: 8, ageMonths: 5, height: 130, weight: 27,
        extra: {
          growthBasic: { data: { measurements: [
            { ageMonths: 60, ageYears: 5, height: 107.5, weight: 18 },
            { ageMonths: 101, ageYears: 8.4, height: 130, weight: 27 },
          ] } },
          ghTherapyPoints: [
            { id: 'gh-c-1', type: 'start', ageYears: 6, ageMonths: 0, height: 112.0, weight: 20, program: 'SNP', drug: 'Genotropin 12 mg' },
            { id: 'gh-c-2', type: 'continue', ageYears: 6, ageMonths: 6, height: 116.0, weight: 21.5, program: 'SNP', drug: 'Genotropin 12 mg' },
            { id: 'gh-c-3', type: 'continue', ageYears: 7, ageMonths: 0, height: 121.4, weight: 23, program: 'SNP', drug: 'Genotropin 12 mg' },
            { id: 'gh-c-4', type: 'continue', ageYears: 8, ageMonths: 0, height: 128.0, weight: 26, program: 'SNP', drug: 'Genotropin 12 mg' },
          ],
        } },
      { klucz: 'd', lastName: 'Fikcyjna Statystyka', firstName: 'Dorota', sex: 'F', dobISO: '2014-03-20', age: 12, ageMonths: 2, height: 152, weight: 42,
        extra: {
          perinatal: { gestationalWeeks: 38, birthWeightG: 2900 },
          ghTherapyPoints: [
            { id: 'gh-d-1', type: 'start', ageYears: 9, ageMonths: 0, height: 121.0, weight: 24, program: 'ZT', drug: 'Omnitrope 10 mg' },
            { id: 'gh-d-2', type: 'continue', ageYears: 10, ageMonths: 0, height: 128.4, weight: 27, program: 'ZT', drug: 'Omnitrope 10 mg' },
          ],
        } },
      { klucz: 'e', lastName: 'Fikcyjny Statystyk', firstName: 'Emil', sex: 'M', dobISO: '2010-09-01', age: 15, ageMonths: 9, height: 172, weight: 60,
        extra: { ghTherapyPoints: [
          { id: 'gh-e-1', type: 'start', ageYears: 14, ageMonths: 0, height: 150.0, weight: 42, program: 'SNP', drug: 'Genotropin 12 mg' },
          { id: 'gh-e-2', type: 'continue', ageYears: 14, ageMonths: 5, height: 153.5, weight: 44, program: 'SNP', drug: 'Genotropin 12 mg' },
        ] } },
      { klucz: 'f', lastName: 'Fikcyjna Statystyka', firstName: 'Felicja', sex: 'F', dobISO: '2005-05-05', age: 21, ageMonths: 1, height: 166, weight: 58 },
      { klucz: 'g', lastName: 'Fikcyjny Statystyk', firstName: 'Gustaw', sex: 'M', dobISO: '', age: 7, ageMonths: 0, height: 123, weight: 24 },
      { klucz: 'h', lastName: 'Fikcyjna Osoba', firstName: 'Bezplci', sex: '', dobISO: '2016-06-18', age: 9, ageMonths: 11, height: 138, weight: 31 },
    ];
    // Dwie karty wspólnej fikstury mają własną historię pomiarów i wzrost rodziców; zapis na ich
    // identyfikatorach zachowałby te sekcje. Statystyki liczymy na kartach znanych w całości.
    for (const id of existing) await vault.removePatient(id);
    const wynik = {};
    for (let index = 0; index < osoby.length; index += 1) {
      const osoba = osoby[index];
      const user = { lastName: osoba.lastName, firstName: osoba.firstName, sex: osoba.sex, age: osoba.age, ageMonths: osoba.ageMonths,
        height: osoba.height, weight: osoba.weight, measuredAtISO: '2026-06-17' };
      if (osoba.dobISO) user.dobISO = osoba.dobISO;
      const record = await vault.savePatient({ version: 1, name: `${osoba.lastName} ${osoba.firstName}`, user, ...(osoba.extra || {}) }, { dedup: false });
      wynik[osoba.klucz] = record.patientId;
    }
    const spoza = await vault.saveExternalPatient({ lastName: 'Fikcyjna Spozabazy', firstName: 'Anna', birthYear: 2016 });
    wynik.spoza = spoza.patientId;
    return wynik;
  }, { existing: [created.ids.a, created.ids.b] });
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  const menu = await visibleChromeMenu(page);
  await menu.getByRole('button', { name: 'Baza pacjentów', exact: true }).click();
  const database = frame.locator(BAZA);
  await expect(database).toBeVisible();
  await expect(database.locator('.pt-row')).toHaveCount(9);
  return { frame, database, ids };
}

export async function otworzStatystyki(database) {
  await database.locator('.pt-viewseg [data-view="stats"]').click();
  await expect(database).toHaveAttribute('data-view', 'stats');
  await expect(database.locator('.pt-stats')).toBeVisible();
}
