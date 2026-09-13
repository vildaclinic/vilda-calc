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
