import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-KLAWIATURA (zgłoszenie właściciela 2026-10-17): czyste obliczenia modułu vilda_klawiatura.js —
// pas ramki widoczny nad klawiaturą i przesunięcie pola. Moduł ładowany z pliku produkcyjnego,
// bez DOM. Liczby jak w PWA na iPhonie 15 Pro: okno 852 px, ramka od 150 px (nagłówek 91 px pod
// wcięciem 59 px), okno ramki 702 px, klawiatura 336 px.
const { VildaKlawiatura: K } = loadBrowserScript('vilda_klawiatura.js', {});

const IPHONE = { wysRamki: 702, ramkaGora: 150, vvGora: 0, oknoWys: 852 };

describe('pasWidoczny', () => {
  it('otwarta klawiatura: pas kończy się nad nią z marginesem 16 px', () => {
    const pas = K.pasWidoczny({ ...IPHONE, vvWys: 852 - 336, klawiatura: 999 });
    expect(pas).toEqual({ gora: 8, dol: 852 - 336 - 150 - 16, otwarta: true });
  });

  it('zamknięta klawiatura: pas liczony z podanej (zmierzonej albo domyślnej) wysokości', () => {
    const pas = K.pasWidoczny({ ...IPHONE, vvWys: 852, klawiatura: 358 });
    expect(pas).toEqual({ gora: 8, dol: 852 - 358 - 150 - 16, otwarta: false });
  });

  it('powłoka przesunięta przez iOS: góra ramki poza ekranem zawęża pas od góry', () => {
    const pas = K.pasWidoczny({ ...IPHONE, ramkaGora: 150 - 120, vvWys: 516, klawiatura: 0 });
    expect(pas.gora).toBe(8);
    expect(pas.dol).toBe(516 - 30 - 16);
    const przewinietyWidok = K.pasWidoczny({ ...IPHONE, vvGora: 200, vvWys: 516, klawiatura: 0 });
    expect(przewinietyWidok.gora).toBe(200 - 150 + 8);
  });

  it('pas nie wychodzi poza okno ramki', () => {
    const pas = K.pasWidoczny({ ...IPHONE, wysRamki: 300, vvWys: 852, klawiatura: 0 });
    expect(pas.dol).toBe(300 - 16);
  });
});

describe('przesuniecie', () => {
  const pas = { gora: 8, dol: 350 };

  it('pole w pasie: zero — nic się nie rusza', () => {
    expect(K.przesuniecie({ top: 285, bottom: 328 }, pas)).toBe(0);
    expect(K.przesuniecie({ top: 8, bottom: 350 }, pas)).toBe(0);
  });

  it('pole pod klawiaturą: dolna krawędź nad zapasem 96 px na kolejny wiersz', () => {
    // Waga w ramce na 494–537 px → 283 px w dół, waga na 211–254 px, wzrost (o 74 px niżej) jeszcze w pasie.
    expect(K.przesuniecie({ top: 494, bottom: 537 }, pas)).toBe(537 - (350 - 96));
  });

  it('wąski pas: zapas to najwyżej trzecia część pasu', () => {
    const waski = { gora: 8, dol: 158 };
    expect(K.przesuniecie({ top: 400, bottom: 440 }, waski)).toBe(440 - (158 - 50));
  });

  it('pole nad pasem: wraca w dół do tego samego miejsca', () => {
    expect(K.przesuniecie({ top: -60, bottom: -17 }, pas)).toBe(-17 - (350 - 96));
  });

  it('pole wyższe niż miejsce nad zapasem: górna krawędź przy górze pasa', () => {
    expect(K.przesuniecie({ top: 300, bottom: 700 }, pas)).toBe(300 - 8);
  });

  it('pusty albo odwrócony pas: zero', () => {
    expect(K.przesuniecie({ top: 400, bottom: 440 }, { gora: 100, dol: 90 })).toBe(0);
    expect(K.przesuniecie(null, pas)).toBe(0);
  });
});
