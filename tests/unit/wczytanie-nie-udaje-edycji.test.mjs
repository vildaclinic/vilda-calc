import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-DOB-LOAD (zgłoszenie właściciela 2026-09-14) — u pacjenta z datą urodzenia znikał wybór
// „Nowy pomiar / Odtwórz zapisany stan".
//
// MECHANIZM. Po wczytaniu rekordu aplikacja pokazuje przycisk „Odtwórz zapisany stan" i zakłada
// JEDNORAZOWY nasłuch `input`/`change` w fazie przechwytywania (`at()` w kolektorze). Pierwsze
// takie zdarzenie robi trzy rzeczy naraz: chowa przycisk, ustawia `hasUserModifiedAfterLoad`
// i WYREJESTROWUJE nasłuch — bo z punktu widzenia aplikacji lekarz zaczął edytować formularz.
// Markup mówi to wprost: „Przycisk zostanie automatycznie ukryty po użyciu lub po pierwszej
// edycji formularza przez użytkownika" (index.html).
//
// `vilda_dob_age.js` zaraz po wczytaniu wpisuje wiek wyliczony z daty urodzenia i wysyła
// `input`. U pacjenta Z DATĄ przycisk znikał więc, zanim lekarz zdążył go zobaczyć: wyboru nie
// było wcale, a wizyta zaczynała się tak, jakby wybrano „Nowy pomiar". Bez daty urodzenia
// moduł niczego nie wpisywał i przycisk zostawał — stąd różnica widoczna w aplikacji.
//
// Zmierzone przed poprawką (sonda w przeglądarce, dwa osobne przebiegi na czystej stronie):
//   bez daty urodzenia → hasUserModifiedAfterLoad = false
//   z datą urodzenia   → hasUserModifiedAfterLoad = TRUE
//
// POPRAWKA. `bezZnaczaniaEdycji()` zachowuje wokół własnego, programowego wpisu stan sprzed
// niego. Samo przywrócenie widoczności nie wystarcza — nasłuch już się wyrejestrował, więc
// pierwsza PRAWDZIWA edycja lekarza nie schowałaby przycisku. Dlatego uzbrajamy go ponownie
// przez `showRestoreButton()`, czyli funkcję samej aplikacji.
//
// Funkcja jest WYCINANA Z PLIKU PRODUKCYJNEGO i uruchamiana wprost. Dane wyłącznie FIKCYJNE.

const src = fs.readFileSync(path.join(korzen, 'vilda_dob_age.js'), 'utf8');

function wytnij(nazwa) {
  const i = src.indexOf(`function ${nazwa}(`);
  if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k += 1) {
    if (src[k] === '{') d += 1;
    else if (src[k] === '}') {
      d -= 1;
      if (d === 0) return src.slice(i, k + 1);
    }
  }
  return null;
}

/* Buduje funkcję z podstawionym oknem i dokumentem — `dok()` i `zgloc()` to jej zależności
   w module produkcyjnym. */
function silnik(okno, dokument) {
  const cialo = wytnij('bezZnaczaniaEdycji');
  expect(cialo, 'vilda_dob_age.js ma bezZnaczaniaEdycji()').toBeTruthy();
  return new Function('w', 'dokument', `
    function dok() { return dokument; }
    function zgloc() { /* w teście nie logujemy */ }
    ${cialo}
    return bezZnaczaniaEdycji;
  `)(okno, dokument);
}

/* Atrapa przycisku „Odtwórz zapisany stan" plus atrapa dokumentu. */
function scena({ widoczny = true, maShowRestore = true } = {}) {
  const przycisk = { style: { display: widoczny ? 'inline-block' : 'none' } };
  const dokument = { getElementById: (id) => (id === 'restoreStateBtn' ? przycisk : null) };
  const okno = { hasUserModifiedAfterLoad: false, uzbrojenia: 0 };
  if (maShowRestore) {
    okno.showRestoreButton = () => { okno.uzbrojenia += 1; przycisk.style.display = 'inline-block'; };
  }
  return { przycisk, dokument, okno };
}

/* To, co robi nasz wpis po wczytaniu: aplikacja widzi `input`, więc chowa przycisk,
   ustawia flagę i wyrejestrowuje nasłuch. */
function wpisJakPoWczytaniu(s) {
  return () => {
    s.przycisk.style.display = 'none';
    s.okno.hasUserModifiedAfterLoad = true;
  };
}

describe('Wypełnienie wieku po wczytaniu nie może uchodzić za edycję lekarza', () => {
  it('flaga edycji wraca do stanu sprzed wpisu', () => {
    const s = scena();
    silnik(s.okno, s.dokument)(wpisJakPoWczytaniu(s));
    expect(s.okno.hasUserModifiedAfterLoad).toBe(false);
  });

  it('przycisk „Odtwórz zapisany stan" zostaje widoczny', () => {
    const s = scena();
    silnik(s.okno, s.dokument)(wpisJakPoWczytaniu(s));
    expect(s.przycisk.style.display).toBe('inline-block');
  });

  it('nasłuch jest uzbrajany ponownie, a nie tylko odsłaniany przycisk', () => {
    const s = scena();
    silnik(s.okno, s.dokument)(wpisJakPoWczytaniu(s));
    // Bez tego pierwsza prawdziwa edycja lekarza nie schowałaby już przycisku.
    expect(s.okno.uzbrojenia).toBe(1);
  });

  it('bez showRestoreButton przycisk i tak wraca — gorzej, ale nie gorzej niż przed zmianą', () => {
    const s = scena({ maShowRestore: false });
    silnik(s.okno, s.dokument)(wpisJakPoWczytaniu(s));
    expect(s.przycisk.style.display).toBe('inline-block');
  });
});

describe('Nie udajemy stanu, którego nie było', () => {
  it('przycisk ukryty przed wpisem zostaje ukryty', () => {
    const s = scena({ widoczny: false });
    silnik(s.okno, s.dokument)(wpisJakPoWczytaniu(s));
    expect(s.przycisk.style.display).toBe('none');
    expect(s.okno.uzbrojenia).toBe(0);
  });

  it('flaga ustawiona PRZED wpisem zostaje ustawiona', () => {
    const s = scena({ widoczny: false });
    s.okno.hasUserModifiedAfterLoad = true;
    silnik(s.okno, s.dokument)(() => { s.okno.hasUserModifiedAfterLoad = true; });
    expect(s.okno.hasUserModifiedAfterLoad).toBe(true);
  });

  it('brak przycisku w dokumencie nie wywraca wpisu', () => {
    const s = scena();
    const pusty = { getElementById: () => null };
    let wykonano = false;
    silnik(s.okno, pusty)(() => { wykonano = true; });
    expect(wykonano).toBe(true);
  });
});

describe('Wyjątek we wpisie nie gubi przywrócenia stanu', () => {
  it('flaga i przycisk wracają mimo błędu w środku', () => {
    const s = scena();
    expect(() => silnik(s.okno, s.dokument)(() => {
      s.przycisk.style.display = 'none';
      s.okno.hasUserModifiedAfterLoad = true;
      throw new Error('awaria w trakcie wpisu');
    })).toThrow('awaria w trakcie wpisu');
    expect(s.okno.hasUserModifiedAfterLoad).toBe(false);
    expect(s.przycisk.style.display).toBe('inline-block');
  });
});

describe('Okablowanie modułu', () => {
  it('przyjmijZWczytanego przechodzi przez bezZnaczaniaEdycji', () => {
    const cialo = wytnij('przyjmijZWczytanego');
    expect(cialo).toBeTruthy();
    expect(cialo).toContain('bezZnaczaniaEdycji(');
  });
});
