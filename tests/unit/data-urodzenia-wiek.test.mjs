import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// DOB-AGE-1 (decyzja właściciela 2026-09-13): data urodzenia w formularzu głównym wypełnia
// wiek w latach i miesiącach (ukończone pełne miesiące). Dane fikcyjne.

function zaladujModul() {
  const win = {};
  loadBrowserScript('vilda_dob_age.js', win);
  return win.VildaDobAge;
}

function zaladujSejf() {
  const win = {};
  loadBrowserScript('vilda_vault.js', win);
  return win.VildaVault;
}

// Dzień odniesienia dla wszystkich przypadków: 13 września 2026 (czas lokalny).
const DZIS = new Date(2026, 8, 13);

describe('DOB-AGE-1 — zapis daty', () => {
  const D = zaladujModul();

  it('przyjmuje separatory, których używa lekarz — także pomieszane w jednej dacie', () => {
    expect(D.parseDobInput('20-08-2025', DZIS)).toEqual({ status: 'ok', iso: '2025-08-20' });
    expect(D.parseDobInput('20.08.2026', DZIS).iso).toBe('2026-08-20');
    expect(D.parseDobInput('20/04/2023', DZIS).iso).toBe('2023-04-20');
    expect(D.parseDobInput('12-03-1984', DZIS).iso).toBe('1984-03-12');
    expect(D.parseDobInput('11.04/2025', DZIS).iso).toBe('2025-04-11');
  });

  it('przyjmuje zapisy z wklejenia: spacja, przecinek, bez separatora, ISO', () => {
    expect(D.parseDobInput('20 08 2025', DZIS).iso).toBe('2025-08-20');
    expect(D.parseDobInput('20,08,2025', DZIS).iso).toBe('2025-08-20');
    expect(D.parseDobInput('20082025', DZIS).iso).toBe('2025-08-20');
    expect(D.parseDobInput('2025-08-20', DZIS).iso).toBe('2025-08-20');
    expect(D.parseDobInput('  20.08.2025  ', DZIS).iso).toBe('2025-08-20');
  });

  it('nie zgaduje stulecia przy roku dwucyfrowym', () => {
    expect(D.parseDobInput('20-08-25', DZIS).status).toBe('format');
  });

  it('odrzuca dzień, którego nie ma w kalendarzu, i datę z przyszłości', () => {
    expect(D.parseDobInput('31-02-2020', DZIS).status).toBe('calendar');
    expect(D.parseDobInput('30-02-2020', DZIS).status).toBe('calendar');
    expect(D.parseDobInput('29-02-2020', DZIS).iso).toBe('2020-02-29'); // rok przestępny
    expect(D.parseDobInput('14-09-2026', DZIS).status).toBe('future');
    expect(D.parseDobInput('13-09-2026', DZIS).iso).toBe('2026-09-13'); // dzisiaj wolno
  });

  it('puste pole to nie błąd — formularz ma wtedy działać jak dotąd', () => {
    expect(D.parseDobInput('', DZIS).status).toBe('empty');
    expect(D.parseDobInput('   ', DZIS).status).toBe('empty');
    expect(D.parseDobInput(null, DZIS).status).toBe('empty');
    expect(D.parseDobInput('abc', DZIS).status).toBe('format');
  });

  it('każdy status odmowy ma gotowy komunikat dla lekarza', () => {
    ['format', 'year', 'calendar', 'future'].forEach((k) => {
      expect(String(D.messages[k] || '').length).toBeGreaterThan(10);
    });
  });

  it('pokazuje datę w zapisie DD-MM-RRRR', () => {
    expect(D.formatDobDisplay('2012-02-03')).toBe('03-02-2012');
    expect(D.formatDobDisplay('')).toBe('');
    expect(D.formatDobDisplay('bzdura')).toBe('');
  });
});

describe('DOB-AGE-1 — wiek z daty urodzenia', () => {
  const D = zaladujModul();

  it('liczy UKOŃCZONE pełne miesiące, nie zaokrągla w górę', () => {
    expect(D.ageFromDobISO('2019-08-20', DZIS)).toMatchObject({ years: 7, ageMonths: 0, totalMonths: 84 });
    expect(D.ageFromDobISO('2019-08-20', new Date(2026, 7, 19))).toMatchObject({ years: 6, ageMonths: 11 });
    expect(D.ageFromDobISO('2019-08-20', new Date(2026, 7, 20))).toMatchObject({ years: 7, ageMonths: 0 });
  });

  it('pożycza dzień miesiąca na przełomie', () => {
    expect(D.ageFromDobISO('2020-01-31', new Date(2020, 1, 29))).toMatchObject({ years: 0, ageMonths: 0 });
    expect(D.ageFromDobISO('2020-01-31', new Date(2020, 2, 1))).toMatchObject({ years: 0, ageMonths: 1 });
  });

  it('podaje też dni i ukończone tygodnie — podstawa pod ratę 2', () => {
    expect(D.ageFromDobISO('2026-07-14', DZIS)).toMatchObject({ years: 0, ageMonths: 1, days: 61, weeks: 8 });
  });

  it('data z przyszłości i śmieci nie dają wieku', () => {
    expect(D.ageFromDobISO('2026-09-14', DZIS)).toBeNull();
    expect(D.ageFromDobISO('', DZIS)).toBeNull();
    expect(D.ageFromDobISO(null, DZIS)).toBeNull();
  });

  it('opis wieku ma polską odmianę liczebnika', () => {
    expect(D.describeAge(D.ageFromDobISO('2025-08-20', DZIS))).toBe('1 rok 0 mies.');
    expect(D.describeAge(D.ageFromDobISO('2024-08-20', DZIS))).toBe('2 lata 0 mies.');
    expect(D.describeAge(D.ageFromDobISO('2019-08-20', DZIS))).toBe('7 lat 0 mies.');
    expect(D.describeAge(D.ageFromDobISO('2014-08-20', DZIS))).toBe('12 lat 0 mies.');
    expect(D.describeAge(D.ageFromDobISO('2004-08-20', DZIS))).toBe('22 lata 0 mies.');
  });
});

describe('DOB-AGE-1 — formularz i kartoteka liczą ten sam wiek', () => {
  const D = zaladujModul();
  const V = zaladujSejf();

  it('moduł formularza i calcAgeFromDOB sejfu zgadzają się co do miesiąca', () => {
    const daty = ['2019-08-20', '2026-07-14', '2012-02-03', '2020-01-31', '2008-12-31', '1984-03-12'];
    const dni = ['2026-09-13', '2026-08-19', '2026-08-20', '2026-03-01', '2026-12-31'];
    for (const dob of daty) {
      for (const dzien of dni) {
        const zSejfu = V.calcAgeFromDOB(dob, dzien);
        const [r, m, d] = dzien.split('-').map(Number);
        const zModulu = D.ageFromDobISO(dob, new Date(r, m - 1, d));
        if (zSejfu === null) {
          expect(zModulu, `${dob} @ ${dzien}`).toBeNull();
          continue;
        }
        expect({ years: zModulu.years, ageMonths: zModulu.ageMonths }, `${dob} @ ${dzien}`)
          .toEqual({ years: zSejfu.years, ageMonths: zSejfu.ageMonths });
      }
    }
  });
});

describe('DOB-AGE-1 — doba lokalna, nie UTC', () => {
  // Strefa dodatnia (Europa/Warszawa): 20 sierpnia 00:30 czasu lokalnego to jeszcze
  // 19 sierpnia w UTC. Wiek liczony po UTC dałby dziecku w dniu jego urodzin miesiąc mniej.
  function wSStrefie(tz, kod) {
    return execFileSync(process.execPath, ['-e', kod], {
      encoding: 'utf8',
      env: { ...process.env, TZ: tz }
    }).trim();
  }

  const PROGRAM = `
    const fs = require('fs');
    const w = {};
    new Function('window', 'globalThis', fs.readFileSync('vilda_vault.js', 'utf8'))(w, w);
    const a = w.VildaVault.calcAgeFromDOB('2019-08-20', new Date(2026, 7, 20, 0, 30));
    process.stdout.write(a.years + ':' + a.ageMonths);
  `;

  it('w dniu urodzin tuż po północy wiek jest już nowy (Europe/Warsaw)', () => {
    expect(wSStrefie('Europe/Warsaw', PROGRAM)).toBe('7:0');
  });

  it('ta sama reguła w strefie ujemnej (America/New_York)', () => {
    expect(wSStrefie('America/New_York', PROGRAM)).toBe('7:0');
  });

  it('data pomiaru bez godziny czytana jest wprost, bez przesunięcia strefy', () => {
    const PROG2 = `
      const fs = require('fs');
      const w = {};
      new Function('window', 'globalThis', fs.readFileSync('vilda_vault.js', 'utf8'))(w, w);
      const a = w.VildaVault.calcAgeFromDOB('2019-08-20', '2026-08-20');
      process.stdout.write(a.years + ':' + a.ageMonths);
    `;
    expect(wSStrefie('America/New_York', PROG2)).toBe('7:0');
    expect(wSStrefie('Pacific/Kiritimati', PROG2)).toBe('7:0');
  });
});

describe('DOB-AGE-2 — wiek w ukończonych tygodniach', () => {
  const D = zaladujModul();

  it('okno tygodni sięga 3. miesiąca życia i ani dnia dalej', () => {
    expect(D.WEEKS_MONTH_LIMIT).toBe(3);
    expect([0, 1, 2].map((m) => D.weeksApplicable(m))).toEqual([true, true, true]);
    expect(D.weeksApplicable(3)).toBe(false);
    expect(D.weeksApplicable(-1)).toBe(false);
    expect(D.weeksApplicable(null)).toBe(false);
  });

  it('przelicza tygodnie na ukończone miesiące wg tabeli 0–4 → 0, 5–8 → 1, 9–13 → 2', () => {
    expect([0, 1, 2, 3, 4].map((t) => D.monthsFromWeeks(t))).toEqual([0, 0, 0, 0, 0]);
    expect([5, 6, 7, 8].map((t) => D.monthsFromWeeks(t))).toEqual([1, 1, 1, 1]);
    expect([9, 10, 11, 12, 13].map((t) => D.monthsFromWeeks(t))).toEqual([2, 2, 2, 2, 2]);
  });

  it('nie udaje, że zna miesiące, gdy tygodni nie podano', () => {
    expect(D.monthsFromWeeks('')).toBeNull();
    expect(D.monthsFromWeeks(null)).toBeNull();
    expect(D.monthsFromWeeks(undefined)).toBeNull();
    expect(D.monthsFromWeeks('abc')).toBeNull();
    expect(D.monthsFromWeeks(-1)).toBeNull();
  });

  it('przyjmuje tylko całkowite tygodnie z zakresu 0–13', () => {
    expect(D.parseWeeksInput('0')).toEqual({ status: 'ok', weeks: 0 });
    expect(D.parseWeeksInput('13')).toEqual({ status: 'ok', weeks: 13 });
    expect(D.parseWeeksInput('14').status).toBe('range');
    expect(D.parseWeeksInput('52').status).toBe('range');
    expect(D.parseWeeksInput('7,5').status).toBe('format');
    expect(D.parseWeeksInput('7.5').status).toBe('format');
    expect(D.parseWeeksInput('-2').status).toBe('format');
    expect(D.parseWeeksInput('abc').status).toBe('format');
    expect(D.parseWeeksInput('').status).toBe('empty');
    expect(D.parseWeeksInput(null).status).toBe('empty');
  });

  it('każda odmowa tygodni ma komunikat, a zakres mówi, co zrobić zamiast tego', () => {
    expect(String(D.weekMessages.format).length).toBeGreaterThan(10);
    expect(D.weekMessages.range).toContain('miesiącach');
  });

  it('opis tygodni ma polską odmianę liczebnika', () => {
    expect(D.describeWeeks(1)).toBe('1 tydzień');
    expect(D.describeWeeks(2)).toBe('2 tygodnie');
    expect(D.describeWeeks(4)).toBe('4 tygodnie');
    expect(D.describeWeeks(5)).toBe('5 tygodni');
    expect(D.describeWeeks(12)).toBe('12 tygodni');
    expect(D.describeWeeks(0)).toBe('0 tygodni');
  });

  it('z datą urodzenia tygodnie liczy kalendarz, a nie przelicznik', () => {
    // 14.07.2026 → 13.09.2026: 61 dni = 8 ukończonych tygodni i 1 pełny miesiąc.
    const wiek = D.ageFromDobISO('2026-07-14', DZIS);
    expect(wiek.days).toBe(61);
    expect(wiek.weeks).toBe(8);
    expect(wiek.ageMonths).toBe(1);
    // przelicznik ręczny z tych samych 8 tygodni daje ten sam miesiąc
    expect(D.monthsFromWeeks(wiek.weeks)).toBe(1);
  });

  it('przelicznik jest przybliżeniem — kalendarz potrafi dać miesiąc więcej', () => {
    // 01.01 → 01.03 (rok nieprzestępny): 59 dni = 8 tygodni, ale DWA pełne miesiące.
    const wiek = D.ageFromDobISO('2026-01-01', new Date(2026, 2, 1));
    expect(wiek.weeks).toBe(8);
    expect(wiek.ageMonths).toBe(2);
    expect(D.monthsFromWeeks(8)).toBe(1);
    // dlatego z datą urodzenia nic nie jest przeliczane — oba wyniki liczy kalendarz
  });
});
