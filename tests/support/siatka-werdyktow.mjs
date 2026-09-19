import crypto from 'node:crypto';

/** Deterministyczna siatka wejść werdyktu odcinka — wspólna dla testu silnika i dla
 *  odcisku odniesienia policzonego na kodzie SPRZED wydzielenia silnika (P-WERDYKT rata 1).
 *  Punkty są dobrane pod granice reguł: każdy próg ΔSDS i każdy próg centylowy ma sąsiada
 *  po obu stronach, więc przesunięcie dowolnej nierówności o jeden krok zmienia odcisk. */
export const MIARY = ['height', 'weight', 'bmi'];
export const SDS = [-3, -1.6, -1.5, -1.4, -1, -0.5, 0, 0.5, 1, 1.4, 1.5, 1.6, 3];
export const DELTY = [
  -2.5, -1.6, -1.5, -1.4, -1.01, -1, -0.99, -0.6, -0.5, -0.49, -0.3, -0.21, -0.2, -0.19,
  -0.1, 0, 0.1, 0.19, 0.2, 0.21, 0.29, 0.3, 0.31, 0.49, 0.5, 0.51, 1, 1.5, 2.5,
];
export const CENTYLE = [
  null, 0, 0.5, 2, 3, 3.1, 4, 4.9, 5, 5.1, 9, 9.9, 10, 10.1, 25, 50, 74, 75, 75.1,
  84, 85, 85.1, 89, 90, 90.1, 96, 97, 97.1, 99, 100,
];
export const GH_MIES = [undefined, null, 0, 3, 5, 6, 12];
export const MPH_SDS = [undefined, null, -3, -2, -1.5, -1, 0, 1, 1.5, 2];
export const REDUKCJA = [false, true, undefined];
const WERDYKTY_WEJSCIOWE = [null, undefined, { t: 'stable', l: 'x' }, { t: 'good', l: 'x' }, { t: 'warn', l: 'x' }, { t: 'bad', l: 'x' }];

/**
 * Przemiata pełną siatkę przez cztery funkcje werdyktu i zwraca SHA-256 wyniku.
 * `fns` = { para, zKontekstem, nakladkaMasaBmi, nakladkaPozycjaWzrostu }.
 * Zwraca też licznik przypadków, żeby zmiana rozmiaru siatki nie przeszła niezauważona.
 */
export function odciskSiatki(fns) {
  const h = crypto.createHash('sha256');
  let n = 0;
  const wpis = (v) => { h.update(v ? `${v.t}\u0000${v.l}` : String(v)); h.update('\u0001'); n += 1; };

  for (const met of MIARY) {
    for (const sa of SDS) {
      for (const d of DELTY) {
        for (const ca of CENTYLE) for (const cb of CENTYLE) wpis(fns.para(met, sa, sa + d, ca, cb));
      }
    }
  }
  for (const met of MIARY) {
    for (const sa of [-2, -1, 0, 1, 2]) {
      for (const d of DELTY) {
        for (const ca of [null, 5, 9, 10, 50, 90, 97]) for (const cb of [null, 3, 9, 10, 50, 96, 97, 98]) {
          for (const gm of GH_MIES) for (const mp of MPH_SDS) for (const rd of REDUKCJA) {
            wpis(fns.zKontekstem(met, sa, sa + d, ca, cb, gm, mp, rd));
          }
        }
      }
    }
  }
  for (const v of WERDYKTY_WEJSCIOWE) {
    for (const dW of DELTY) for (const vB of WERDYKTY_WEJSCIOWE) for (const dB of DELTY) wpis(fns.nakladkaMasaBmi(v, dW, vB, dB));
  }
  for (const v of WERDYKTY_WEJSCIOWE) {
    for (const cb of CENTYLE) for (const mp of MPH_SDS) for (const sa of SDS) for (const gh of [false, true, 0, 1, undefined]) {
      wpis(fns.nakladkaPozycjaWzrostu(v, cb, mp, sa, gh));
    }
  }
  return { odcisk: h.digest('hex'), przypadkow: n };
}
