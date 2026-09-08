import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// „Wyczyść dane urodzeniowe" w karcie SGA.
//
// Po dopisaniu sekcji `birth` do rekordu (GROWTH-BIRTH-REC) samo wyczyszczenie pól karty
// nie wystarczało: kolektor przenosił zapisaną wcześniej wartość z window.vildaBirthData,
// więc dane wracały przy następnym wczytaniu. Przycisk karty musi więc kasować OBIE rzeczy
// — pola i przeniesioną wartość — a przy kliknięciu jeszcze odświeżyć zapis sesji, żeby
// przeładowanie strony nie wskrzesiło danych ze starej migawki.

function pomocniki() {
  const src = fs.readFileSync(path.join(korzen, 'sga_birth_module.js'), 'utf8');
  const start = src.indexOf('function Bs0(');
  const end = src.indexOf('function le(', start);
  expect(start, 'znaleziono Bs0 (zerowanie przeniesionej wartości)').toBeGreaterThan(-1);
  expect(end, 'znaleziono koniec bloku po Bs1').toBeGreaterThan(start);
  return (okno) =>
    new Function('window', `${src.slice(start, end)}\nreturn { Bs0, Bs1 };`)(okno);
}

describe('Kasowanie przeniesionej wartości danych urodzeniowych', () => {
  it('zeruje window.vildaBirthData, żeby kolektor nie miał czego przenieść', () => {
    const okno = { vildaBirthData: { weeks: '34', weight: '1850' } };
    const { Bs0 } = pomocniki()(okno);
    expect(Bs0()).toBe(true);
    expect(okno.vildaBirthData).toBeNull();
  });

  it('na stronie bez okna nie wybucha', () => {
    const { Bs0 } = pomocniki()(undefined);
    expect(Bs0()).toBe(false);
  });

  it('okno broniące zapisu nie wywraca czyszczenia karty', () => {
    const okno = {};
    Object.defineProperty(okno, 'vildaBirthData', {
      get() { return null; },
      set() { throw new Error('tylko do odczytu'); },
      configurable: true,
    });
    const { Bs0 } = pomocniki()(okno);
    expect(Bs0()).toBe(false);
  });
});

describe('Odświeżenie zapisu sesji po ręcznym wyczyszczeniu', () => {
  it('woła vildaSession.schedule, żeby migawka sesji straciła dane urodzeniowe', () => {
    let wolane = 0;
    const okno = { vildaSession: { schedule: () => { wolane += 1; } } };
    const { Bs1 } = pomocniki()(okno);
    expect(Bs1()).toBe(true);
    expect(wolane, 'zapis sesji odświeżony dokładnie raz').toBe(1);
  });

  it('kontrola negatywna: bez API sesji nic nie woła i nie kłamie o sukcesie', () => {
    expect(pomocniki()({}).Bs1()).toBe(false);
    expect(pomocniki()({ vildaSession: {} }).Bs1(), 'API bez schedule').toBe(false);
    expect(pomocniki()(undefined).Bs1()).toBe(false);
  });

  it('wyjątek zapisu sesji nie przerywa czyszczenia karty', () => {
    const okno = { vildaSession: { schedule: () => { throw new Error('sesja nie wstała'); } } };
    expect(pomocniki()(okno).Bs1()).toBe(false);
  });
});
