import { expect } from '@playwright/test';
import { createFictionalVault } from './centile-live-fixture.mjs';
import { visibleChromeMenu } from './chrome-menu-fixture.mjs';
import { BAZA } from './baza-pacjentow-lista.mjs';

// P-BAZA-STATYSTYKI, etapy 1–3. Prawdziwy szyfrowany sejf w nowym kontekście Playwrighta i wyłącznie
// fikcyjne osoby. Zegar testu stoi na 17.06.2026 (tests/support/czas.mjs), więc wiek jest stały:
//
//   klucz  płeć  data urodzenia  wiek            przedział  karta
//   a      F     2024-12-01      1 r. 6 mies.    0–2        2 pomiary, rodzice, masa ur. (birth)
//   b      M     2021-06-17      5 lat (dziś)    3–5        GH bez Włączenia (sama Kontynuacja)
//   c      M     2018-01-10      8 l. 5 mies.    6–9        GH SNP: 3 lata kontroli, pomiar rok przed Włączeniem
//   d      F     2014-03-20      12 l. 2 mies.   10–13      GH ZT: kontrola po roku; masa ur. (perinatal); otyłość: Saxenda
//   e      M     2010-09-01      15 l. 9 mies.   14–17      GH SNP: kontrola tylko po 5 mies.; otyłość: Wegovy od 12 tyg.
//   f      F     2005-05-05      21 l. 1 mies.   18+        otyłość: Wegovy, dorosła; pomiar po 6 mies. tylko we wpisie między wizytami
//   g      M     brak            —               —          wiek tylko w zapisie pomiaru; otyłość: sama Kontynuacja (Saxenda)
//   h      brak  2016-06-18      9 l. 11 mies.   6–9        urodziny jutro; otyłość: Saxenda, masa rośnie, BMI spada
//
// Razem 8 pacjentów z bazy i 1 osoba spoza bazy (nie wchodzi do statystyk).
//
// Leczenie GH (etap 2), tempo liczone silnikiem aplikacji:
//   c  Włączenie 6 l. 0 mies. 112,0 cm; rok wcześniej 107,5 cm → przed 4,5 cm/rok;
//      kontrole: 6 l. 6 mies. 116,0 · 7 l. 0 mies. 121,4 (1. rok 9,4) · 8 l. 0 mies. 128,0 (2. rok 6,6)
//   d  Włączenie 9 l. 0 mies. 121,0 cm; kontrola 10 l. 0 mies. 128,4 → 1. rok 7,4; bez pomiaru sprzed leczenia
//   e  Włączenie 14 l. 0 mies. 150,0 cm; kontrola 14 l. 5 mies. 153,5 → leczenie krótsze niż 9 mies.
//   b  Kontynuacja 4 l. 6 mies. 106,0 cm, bez Włączenia
//
// Leczenie otyłości (etap 3): zmiana masy od Włączenia, tygodnie z dat (silnik kryteriów ChPL):
//   d  Saxenda, Włączenie 10.09.2025 60,0 kg/145,0 cm; po 13 tyg. 58,2/146,0 (−3,0%); po 26 tyg. 57,0/147,0 (−5,0%; BMI −7,57%)
//   e  Wegovy, Włączenie 04.02.2026 100,0 kg/172,0 cm; po 12 tyg. 95,8 kg bez wzrostu (−4,2%); leczenie krótsze niż 20 tyg.
//   f  Wegovy, Włączenie 01.10.2025 100,0 kg; po 12 tyg. 94,0 (−6,0%); po 26 tyg. 88,0 (−12,0%) — WPIS DZIENNIKA od pacjentki
//   g  Saxenda, sama Kontynuacja (7 l., 40 kg) — brak Włączenia
//   h  Saxenda, Włączenie 05.11.2025 50,0 kg/138,0 cm; po 13 tyg. 51,0/139,5 (+2,0%); po 26 tyg. 51,5/141,0 (+3,0%; BMI −1,34%)
export const OCZEKIWANE = Object.freeze({
  razem: 8,
  sredniWiek: '10,5',          // (18+60+101+146+189+253+119) / 7 = 126,6 mies.
  mediana: '9,9 roku',         // 119 mies.
  zakres: 'od 1,5 roku do 21,1 roku',
  chlopcy: { n: 4, procent: '50%', sredniWiek: '9,7 roku' },
  dziewczeta: { n: 3, procent: '38%', sredniWiek: '11,6 roku' },
  przedzialy: { '0-2': 1, '3-5': 1, '6-9': 2, '10-13': 1, '14-17': 1, '18+': 1 },
  karty: { pomiary: '7 / 8', rodzice: '1 / 8', masaUrodzeniowa: '2 / 8' }, // pomiary: wszyscy poza g (f i h — wzrost z punktów leczenia otyłości)
  gh: {
    leczeni: 4,
    programy: 'leczonych: 4 · SNP 2 · bez programu 1 · ZT 1',
    pierwszyRok: '8,4',                 // (9,4 + 7,4) / 2
    mediana: '8,4',
    n: 2,
    para: '4,5 → 9,4',                  // tylko c
    lata: [['1. rok', '8,4 cm/rok', 'n = 2'], ['2. rok', '6,6 cm/rok', 'n = 1']],
  },
  otylosc: {
    leczeni: 5,
    leki: 'leczonych: 5 · Saxenda 3 · Wegovy 2',
    // 12 tyg.: d −3,0 · e −4,2 · f −6,0 · h +2,0; kg/mies. = zmiana w kg / (tygodnie / 4,348)
    w12: { srednia: '−2,8%', opis: 'mediana −3,6% · n = 4 · −1,0 kg/mies.' },
    // 6 mies.: d −5,0 · f −12,0 · h +3,0
    m6: { srednia: '−4,7%', opis: 'mediana −5,0% · n = 3 · −0,8 kg/mies.' },
    prog: { etykieta: 'Redukcja o ≥ 5% po 6 mies.', wartosc: '2 z 3', opis: '67% · o ≥ 10%: 1 (33%)' },
    bmiDzieci: '−4,5%',                  // (−7,57 − 1,34) / 2: d i h
    leki12i6: { Saxenda: ['leczonych 3 · 12 tyg.: 2 · 6 mies.: 2 · mała grupa', '−0,5 → −1,0%'], Wegovy: ['leczonych 2 · 12 tyg.: 2 · 6 mies.: 1 · mała grupa', '−5,1 → −12,0%'] },
    skala: ['0', '−5', '−10', '−15%'],
    podzialka: ['+5%', '0%', '−5%', '−10%', '−15%'],
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
    const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'Semaglutyd (agonista receptora GLP‑1)' };
    const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP‑1)' };
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
          obesityTherapyPoints: [
            { id: 'ob-d-1', type: 'start', dateISO: '2025-09-10', ageYears: 11, ageMonths: 5, weight: 60.0, height: 145.0, ...SAXENDA, dose: '0,6 mg' },
            { id: 'ob-d-2', type: 'continue', dateISO: '2025-12-10', ageYears: 11, ageMonths: 8, weight: 58.2, height: 146.0, ...SAXENDA, dose: '3 mg' },
            { id: 'ob-d-3', type: 'continue', dateISO: '2026-03-11', ageYears: 11, ageMonths: 11, weight: 57.0, height: 147.0, ...SAXENDA, dose: '3 mg' },
          ],
        } },
      { klucz: 'e', lastName: 'Fikcyjny Statystyk', firstName: 'Emil', sex: 'M', dobISO: '2010-09-01', age: 15, ageMonths: 9, height: 172, weight: 60,
        extra: { ghTherapyPoints: [
          { id: 'gh-e-1', type: 'start', ageYears: 14, ageMonths: 0, height: 150.0, weight: 42, program: 'SNP', drug: 'Genotropin 12 mg' },
          { id: 'gh-e-2', type: 'continue', ageYears: 14, ageMonths: 5, height: 153.5, weight: 44, program: 'SNP', drug: 'Genotropin 12 mg' },
        ],
        obesityTherapyPoints: [
          { id: 'ob-e-1', type: 'start', dateISO: '2026-02-04', ageYears: 15, ageMonths: 5, weight: 100.0, height: 172.0, ...WEGOVY, dose: '0,25 mg' },
          { id: 'ob-e-2', type: 'continue', dateISO: '2026-04-29', ageYears: 15, ageMonths: 7, weight: 95.8, height: null, ...WEGOVY, dose: '1 mg' },
        ] } },
      { klucz: 'f', lastName: 'Fikcyjna Statystyka', firstName: 'Felicja', sex: 'F', dobISO: '2005-05-05', age: 21, ageMonths: 1, height: 166, weight: 58,
        extra: { obesityTherapyPoints: [
          { id: 'ob-f-1', type: 'start', dateISO: '2025-10-01', ageYears: 20, ageMonths: 4, weight: 100.0, height: 166.0, ...WEGOVY, dose: '0,25 mg' },
          { id: 'ob-f-2', type: 'continue', dateISO: '2025-12-24', ageYears: 20, ageMonths: 7, weight: 94.0, height: 166.0, ...WEGOVY, dose: '1,7 mg' },
        ] },
        // Masa przysłana między wizytami: wpis dziennika (notatka pacjenta), nie punkt zapisu karty.
        dziennik: [{ type: 'continue', dateISO: '2026-04-01', ageYears: 20, ageMonths: 10, weight: 88.0, weightSource: 'pacjent', height: null, heightSource: null, ...WEGOVY, dose: '2,4 mg', comment: '' }] },
      { klucz: 'g', lastName: 'Fikcyjny Statystyk', firstName: 'Gustaw', sex: 'M', dobISO: '', age: 7, ageMonths: 0, height: 123, weight: 24,
        extra: { obesityTherapyPoints: [{ id: 'ob-g-1', type: 'continue', ageYears: 7, ageMonths: 0, weight: 40.0, height: 123.0, ...SAXENDA, dose: '1,2 mg' }] } },
      { klucz: 'h', lastName: 'Fikcyjna Osoba', firstName: 'Bezplci', sex: '', dobISO: '2016-06-18', age: 9, ageMonths: 11, height: 138, weight: 31,
        extra: { obesityTherapyPoints: [
          { id: 'ob-h-1', type: 'start', dateISO: '2025-11-05', ageYears: 9, ageMonths: 4, weight: 50.0, height: 138.0, ...SAXENDA, dose: '0,6 mg' },
          { id: 'ob-h-2', type: 'continue', dateISO: '2026-02-04', ageYears: 9, ageMonths: 7, weight: 51.0, height: 139.5, ...SAXENDA, dose: '2,4 mg' },
          { id: 'ob-h-3', type: 'continue', dateISO: '2026-05-06', ageYears: 9, ageMonths: 10, weight: 51.5, height: 141.0, ...SAXENDA, dose: '3 mg' },
        ] } },
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
      // Wpisy między wizytami zapisuje ten sam moduł, co przycisk „+ Kontynuacja” w Karcie (planNowego → zapisz).
      for (const wpis of osoba.dziennik || []) {
        const dziennik = window.VildaDziennikOtylosci;
        const plan = dziennik.planNowego(await dziennik.wczytaj(record.patientId, osoba.extra.obesityTherapyPoints), record.patientId, wpis);
        if (!plan || !plan.ok) throw new Error('plan wpisu dziennika');
        await dziennik.zapisz(record.patientId, plan.wersje);
      }
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

// P-ROZPOZNANIA, rata 2: rozpoznania (fikcyjne) dopisane tym samym magazynem, którego używa Karta pacjenta.
//   b  „Fikcyjna niskorosłość idiopatyczna” (bez kodu), aktywne
//   c  E23.0 aktywne
//   d  Q96 aktywne, E66.0 aktywne
//   e  E66.0 aktywne, E23.0 zamknięte
//   f  E66.9 aktywne
//   h  E66.0 zamknięte (tylko zamknięte)
//   a, g — bez rozpoznania
// Z aktywnym rozpoznaniem: b, c, d, e, f = 5 z 8 (63%); tylko zamknięte: h; bez rozpoznania: a, g.
export const ROZPOZNANIA = Object.freeze({
  podpowiedz: 'z aktywnym rozpoznaniem: 5 z 8 (63%)',
  // [kod, nazwa, pacjenci, odsetek, dopisek o zamkniętych]
  wiersze: [
    ['E66', 'Otyłość', '3', '38%', '+ 1 zamkn.'],
    ['E23.0', 'Niedoczynność przysadki', '1', '13%', '+ 1 zamkn.'],
    ['', 'Fikcyjna niskorosłość idiopatyczna', '1', '13%', ''],
    ['Q96', 'Zespół Turnera', '1', '13%', ''],
  ],
  podkodyE66: [
    ['E66.0', 'Otyłość spowodowana nadmierną podażą energii', '2', '25%', '+ 1 zamkn.'],
    ['E66.9', 'Otyłość, nieokreślona', '1', '13%', ''],
  ],
});
export async function dodajRozpoznania(frame, ids) {
  await frame.evaluate(async (pacjenci) => {
    const lista = [
      [pacjenci.b, { name: 'Fikcyjna niskorosłość idiopatyczna', code: '', status: 'active', dateISO: '2025-09-01' }],
      [pacjenci.c, { name: 'Niedoczynność przysadki', code: 'E23.0', status: 'active', dateISO: '2024-01-15' }],
      [pacjenci.d, { name: 'Zespół Turnera', code: 'Q96', status: 'active', dateISO: '2022-05-10' }],
      [pacjenci.d, { name: 'Otyłość spowodowana nadmierną podażą energii', code: 'E66.0', status: 'active', dateISO: '2025-09-10' }],
      [pacjenci.e, { name: 'Otyłość spowodowana nadmierną podażą energii', code: 'E66.0', status: 'active', dateISO: '2026-02-04' }],
      [pacjenci.e, { name: 'Niedoczynność przysadki', code: 'E23.0', status: 'closed', dateISO: '2023-03-03' }],
      [pacjenci.f, { name: 'Otyłość, nieokreślona', code: 'E66.9', status: 'active', dateISO: '2025-10-01' }],
      [pacjenci.h, { name: 'Otyłość spowodowana nadmierną podażą energii', code: 'E66.0', status: 'closed', dateISO: '2025-11-05' }],
    ];
    for (const [patientId, values] of lista) {
      const scope = window.VildaPatientTreatmentStore.createScope({ vault: window.VildaVault, patientId, isCurrent: () => true });
      await scope.createDiagnosis(values);
      scope.dispose();
    }
  }, ids);
}
