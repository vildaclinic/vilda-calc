import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-KLAWIATURA (zgłoszenie właściciela 2026-10-17): czyste obliczenia modułu vilda_klawiatura.js —
// pas ramki widoczny nad klawiaturą i przesunięcie pola. Moduł ładowany z pliku produkcyjnego,
// bez DOM. Liczby jak w PWA na iPhonie 15 Pro: okno 852 px, ramka od 150 px (nagłówek 91 px pod
// wcięciem 59 px), okno ramki 702 px, klawiatura 336 px. P-KLAWIATURA-2: margines 40 px nad zmierzoną
// klawiaturą i wysokość bazowa okna (nowaPodstawa).
const { VildaKlawiatura: K } = loadBrowserScript('vilda_klawiatura.js', {});

const IPHONE = { wysRamki: 702, ramkaGora: 150, vvGora: 0, oknoWys: 852 };

describe('pasWidoczny', () => {
  // P-KLAWIATURA-2: margines 40 px (wersja 1 miała 16 px) — mieści pływający pasek iOS 26 nad
  // klawiaturą, gdyby visualViewport go nie odliczał.
  it('otwarta klawiatura: pas kończy się nad nią z marginesem 40 px', () => {
    const pas = K.pasWidoczny({ ...IPHONE, vvWys: 852 - 336, klawiatura: 999 });
    expect(pas).toEqual({ gora: 8, dol: 852 - 336 - 150 - 40, otwarta: true });
  });

  it('zamknięta klawiatura: pas liczony ze zmierzonej wysokości, margines 40 px', () => {
    const pas = K.pasWidoczny({ ...IPHONE, vvWys: 852, klawiatura: 336 });
    expect(pas).toEqual({ gora: 8, dol: 852 - 336 - 150 - 40, otwarta: false });
  });

  it('klawiatura jeszcze nie zmierzona: szacunek 42% obejmuje pasek, margines 16 px — wiek się nie rusza', () => {
    const pas = K.pasWidoczny({ ...IPHONE, vvWys: 852, klawiatura: 358, szacunek: true });
    expect(pas).toEqual({ gora: 8, dol: 852 - 358 - 150 - 16, otwarta: false });
    expect(K.przesuniecie({ top: 427 - 150, bottom: 470 - 150 }, pas)).toBe(0);
    // Otwarta klawiatura zawsze z marginesem 40 px, także przy pierwszym pomiarze.
    expect(K.pasWidoczny({ ...IPHONE, vvWys: 516, klawiatura: 358, szacunek: true }).dol).toBe(516 - 150 - 40);
  });

  it('powłoka przesunięta przez iOS: góra ramki poza ekranem zawęża pas od góry', () => {
    const pas = K.pasWidoczny({ ...IPHONE, ramkaGora: 150 - 120, vvWys: 516, klawiatura: 0 });
    expect(pas.gora).toBe(8);
    expect(pas.dol).toBe(516 - 30 - 40);
    const przewinietyWidok = K.pasWidoczny({ ...IPHONE, vvGora: 200, vvWys: 516, klawiatura: 0 });
    expect(przewinietyWidok.gora).toBe(200 - 150 + 8);
  });

  it('pas nie wychodzi poza okno ramki', () => {
    const pas = K.pasWidoczny({ ...IPHONE, wysRamki: 300, vvWys: 852, klawiatura: 0 });
    expect(pas.dol).toBe(300 - 40);
  });

  it('wiek (dolna krawędź 470 px na ekranie) mieści się nad klawiaturą 336 px także z marginesem 40 px', () => {
    const pas = K.pasWidoczny({ ...IPHONE, vvWys: 852 - 336, klawiatura: 0 });
    expect(K.przesuniecie({ top: 427 - 150, bottom: 470 - 150 }, pas)).toBe(0);
  });

  it('wzrost tuż nad visualViewport (dolna krawędź 39 px nad nim) jest już poza pasem', () => {
    // Wersja 1: waga przesunięta na 361–404 px, wzrost na 435–477 px — przy linii 516 px wzrost
    // mieścił się z marginesem 16 px. Pod pływającym paskiem iOS 26 (ok. 44–50 px) byłby zasłonięty.
    const pas = K.pasWidoczny({ ...IPHONE, vvWys: 852 - 336, klawiatura: 0 });
    expect(K.przesuniecie({ top: 435 - 150, bottom: 477 - 150 }, pas)).toBeGreaterThan(0);
  });
});

describe('nowaPodstawa — wysokość okna powłoki bez klawiatury', () => {
  const START = { szer: 393, oknoWys: 852, vvWys: 852, poleAktywne: false };

  it('pierwszy pomiar: innerHeight i pełny visualViewport', () => {
    expect(K.nowaPodstawa(null, START)).toEqual({ szer: 393, wys: 852 });
  });

  it('klawiatura nie obniża podstawy — także gdy iOS skróciłby innerHeight razem z visualViewport', () => {
    const p = K.nowaPodstawa(null, START);
    expect(K.nowaPodstawa(p, { szer: 393, oknoWys: 852, vvWys: 516, poleAktywne: true })).toEqual({ szer: 393, wys: 852 });
    expect(K.nowaPodstawa(p, { szer: 393, oknoWys: 516, vvWys: 516, poleAktywne: true })).toEqual({ szer: 393, wys: 852 });
    // Wtedy pas liczy się od podstawy: klawiatura otwarta, choć innerHeight = visualViewport.
    const pas = K.pasWidoczny({ ...IPHONE, oknoWys: 852, vvWys: 516, klawiatura: 0 });
    expect(pas.otwarta).toBe(true);
  });

  it('visualViewport przy aktywnym polu nie podnosi podstawy; bez pola — podnosi', () => {
    const p = { szer: 393, wys: 700 };
    expect(K.nowaPodstawa(p, { szer: 393, oknoWys: 600, vvWys: 852, poleAktywne: true }).wys).toBe(700);
    expect(K.nowaPodstawa(p, { szer: 393, oknoWys: 600, vvWys: 852, poleAktywne: false }).wys).toBe(852);
  });

  it('obrót ekranu liczy podstawę od nowa', () => {
    const p = K.nowaPodstawa(null, START);
    expect(K.nowaPodstawa(p, { szer: 852, oknoWys: 393, vvWys: 393, poleAktywne: false })).toEqual({ szer: 852, wys: 393 });
    // Drobna zmiana szerokości (≤ 4 px) to nie obrót.
    expect(K.nowaPodstawa(p, { szer: 390, oknoWys: 800, vvWys: 800, poleAktywne: false })).toEqual({ szer: 393, wys: 852 });
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
