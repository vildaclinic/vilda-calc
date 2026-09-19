import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-ZRODLA: jeden wspólny sygnał „zmieniło się źródło danych pacjenta".
//
// Zgłoszenie właściciela (2026-09-19): po zaznaczeniu „Zespół Downa" w Karcie Pacjenta
// i powrocie na stronę główną wyniki zostawały na siatce populacyjnej, dopóki nie
// przeładowało się strony. Zmierzona przyczyna: trzy moduły źródłowe odświeżają swoją
// pamięć asynchronicznie (`VildaVault.getPatient(...).then(...)`) i nie ogłaszają tego
// nikomu, a karta główna przemalowywała się tylko przypadkiem — przy okazji zdarzenia
// `input` ze ścieżki zapisu. Kto przegrał ten wyścig, zostawał ze starą siatką na zawsze.
//
// Testy pilnują czterech rzeczy, które w takim sygnale psują się po cichu:
//   1. odcisk nie może uznawać kolejności kluczy za zmianę danych (inaczej strona liczy
//      się w kółko po każdym odczycie rekordu);
//   2. powtórzenie tej samej wartości musi być ciche — to bezpiecznik przed pętlą
//      przeliczenie → zapis → odczyt → przeliczenie;
//   3. kilka źródeł zmienionych po jednym odczycie rekordu to JEDNO przeliczenie;
//   4. każde z trzech źródeł naprawdę woła sygnał — i działa dalej, gdy sygnału nie ma.

function okno(dodatki = {}) {
  const w = { setTimeout, clearTimeout, ...dodatki };
  loadBrowserScript('vilda_zrodla_pacjenta.js', w);
  return w;
}

const tura = () => new Promise((res) => { setTimeout(res, 0); });

describe('Odcisk stanu źródła', () => {
  let Z;
  beforeEach(() => { Z = okno().VildaZrodlaPacjenta; });

  it('nie widzi zmiany w samej kolejności kluczy', () => {
    expect(Z.odcisk({ a: 1, b: { x: 1, y: 2 } })).toBe(Z.odcisk({ b: { y: 2, x: 1 }, a: 1 }));
  });

  it('widzi zmianę wartości i zmianę obecności pola', () => {
    expect(Z.odcisk({ ds: true })).not.toBe(Z.odcisk({ ds: false }));
    expect(Z.odcisk({ ds: true })).not.toBe(Z.odcisk({ ds: true, maRekord: true }));
    expect(Z.odcisk(null)).not.toBe(Z.odcisk({ maRekord: true, ds: false }));
  });

  it('wartość nieporównywalna zawsze uchodzi za zmianę — wolimy przeliczyć niż pokazać starą siatkę', () => {
    const cykl = {}; cykl.ja = cykl;
    expect(Z.odcisk(cykl)).not.toBe(Z.odcisk(cykl));
  });
});

describe('Ogłoszenie tylko przy faktycznej zmianie', () => {
  let w; let Z;
  beforeEach(() => { w = okno({ debouncedUpdate: vi.fn() }); Z = w.VildaZrodlaPacjenta; });

  it('pusty odczyt niczego nie budzi — strona i tak zakłada brak danych', () => {
    expect(Z.ogloszJesliInne('ds', null)).toBe(false);
  });

  it('pierwszy wczytany rekord jest zmianą, jego powtórzenie już nie', () => {
    expect(Z.ogloszJesliInne('ds', { maRekord: true, ds: true })).toBe(true);
    expect(Z.ogloszJesliInne('ds', { ds: true, maRekord: true })).toBe(false);
    expect(Z.ogloszJesliInne('ds', { maRekord: true, ds: false })).toBe(true);
    expect(Z.ogloszJesliInne('ds', null)).toBe(true);
  });

  it('źródła nie mieszają się między sobą', () => {
    expect(Z.ogloszJesliInne('ds', { ds: true })).toBe(true);
    expect(Z.ogloszJesliInne('puberty', { ds: true })).toBe(true);
    expect(Z.ogloszJesliInne('ds', { ds: true })).toBe(false);
  });

  it('bez nazwy źródła nie ogłasza niczego', () => {
    expect(Z.ogloszJesliInne('', { ds: true })).toBe(false);
  });
});

describe('Zamówienie przeliczenia strony', () => {
  it('trzy źródła zmienione po jednym odczycie rekordu to jedno przeliczenie', async () => {
    const w = okno({ debouncedUpdate: vi.fn() });
    w.VildaZrodlaPacjenta.ogloszJesliInne('ds', { ds: true });
    w.VildaZrodlaPacjenta.ogloszJesliInne('perinatal', { p: 1 });
    w.VildaZrodlaPacjenta.ogloszJesliInne('puberty', { s: 1 });
    expect(w.debouncedUpdate).not.toHaveBeenCalled();
    await tura();
    expect(w.debouncedUpdate).toHaveBeenCalledTimes(1);
  });

  it('cicha zmiana nie zamawia przeliczenia', async () => {
    const w = okno({ debouncedUpdate: vi.fn() });
    w.VildaZrodlaPacjenta.ogloszJesliInne('ds', null);
    await tura();
    expect(w.debouncedUpdate).not.toHaveBeenCalled();
  });

  it('bez debouncedUpdate sięga po update', async () => {
    const w = okno({ update: vi.fn() });
    w.VildaZrodlaPacjenta.ogloszJesliInne('ds', { ds: true });
    await tura();
    expect(w.update).toHaveBeenCalledTimes(1);
  });

  it('strona bez publicznego przeliczenia nie wywala modułu', async () => {
    const w = okno();
    expect(() => w.VildaZrodlaPacjenta.ogloszJesliInne('ds', { ds: true })).not.toThrow();
    await tura();
  });
});

// Ścieżka produkcyjna: prawdziwe moduły źródłowe na prawdziwym sygnale.
const ZRODLA = [
  {
    plik: 'vilda_ds_source.js', api: 'VildaDsSource', nazwa: 'ds',
    payload: { clinical: { downSyndrome: true } },
  },
  {
    plik: 'vilda_perinatal_source.js', api: 'VildaPerinatalSource', nazwa: 'perinatal',
    payload: { perinatal: { gestationalWeeks: '34', birthWeightG: '1850' }, user: { sex: 'M' } },
  },
  {
    plik: 'vilda_puberty_source.js', api: 'VildaPubertySource', nazwa: 'puberty',
    payload: { puberty: { onsetAgeYears: '11.2' }, user: { sex: 'F' } },
  },
];

describe.each(ZRODLA)('Źródło $plik woła wspólny sygnał', ({ plik, api, nazwa, payload }) => {
  it('ogłasza wczytanie rekordu i jego skasowanie, a powtórkę przemilcza', () => {
    const w = okno({ debouncedUpdate: vi.fn() });
    const wolania = [];
    const oryginal = w.VildaZrodlaPacjenta.ogloszJesliInne;
    w.VildaZrodlaPacjenta.ogloszJesliInne = (n, v) => {
      const r = oryginal(n, v);
      wolania.push({ nazwa: n, zmiana: r });
      return r;
    };
    loadBrowserScript(plik, w);
    const Z = w[api];

    Z.zapamietaj(payload);
    Z.zapamietaj(payload);
    Z.zapomnij();

    expect(wolania.map((x) => x.nazwa)).toEqual([nazwa, nazwa, nazwa]);
    expect(wolania.map((x) => x.zmiana)).toEqual([true, false, true]);
  });

  it('działa jak dotąd, gdy wspólnego sygnału nie ma na stronie', () => {
    const w = { setTimeout, clearTimeout };
    loadBrowserScript(plik, w);
    expect(() => w[api].zapamietaj(payload)).not.toThrow();
    expect(() => w[api].zapomnij()).not.toThrow();
  });
});
