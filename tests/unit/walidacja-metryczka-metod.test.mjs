import { beforeAll, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Etap 2b „Walidacji prognoz" (decyzja właściciela 2026-09-15). Reguły, którymi aplikacja
// zmienia każdą metodę, mieszkały wyłącznie w komentarzach w kodzie i w rejestrze algorytmów —
// lekarz nie miał do nich dostępu z aplikacji. Metryczka jest tym dostępem.
//
// Najważniejszy strażnik w tym pliku wiąże TREŚĆ z KODEM: metryczka nie może twierdzić
// „bez korekty wartości" o metodzie, dla której karta C ma regułę korekty. Bez tego opis
// rozjechałby się z zachowaniem przy pierwszej zmianie progów.
//
// Dane wyłącznie FIKCYJNE (metryczka ich nie zawiera — to stała treść z przypisami).

let L;
let C;
let M;

beforeAll(() => {
  const win = {};
  loadBrowserScript('vilda_blum_iss.js', win);
  loadBrowserScript('vilda_growth_card_c.js', win);
  loadBrowserScript('vilda_growth_prediction_validation_model.js', win);
  loadBrowserScript('vilda_growth_method_ledger.js', win);
  L = win.VildaGrowthMethodLedger;
  C = win.VildaGrowthCardC;
  M = win.VildaGrowthPredictionValidationModel;
});

describe('Metryczka metod — treść związana z kodem', () => {
  it('nie mówi „bez korekty" o metodzie, dla której karta C ma regułę korekty', () => {
    const zRegula = new Set();
    Object.keys(C.BIAS_RULES).forEach((nazwa) => {
      if (nazwa.indexOf('bp') === 0) zRegula.add('bp');
      if (nazwa.indexOf('rwt') === 0) zRegula.add('rwt');
    });
    expect(zRegula.has('bp')).toBe(true);
    expect(zRegula.has('rwt')).toBe(true);

    L.POZYCJE.forEach((p) => {
      const mowiBezKorekty = p.karta.indexOf('Bez korekty wartości') >= 0;
      if (zRegula.has(p.klucz)) {
        expect(mowiBezKorekty, `${p.nazwa} ma regułę korekty, a metryczka twierdzi inaczej`).toBe(false);
      }
    });
  });

  it('każda metoda podstawowa modelu ma wpis w metryczce', () => {
    const klucze = L.POZYCJE.map((p) => p.klucz);
    M.METODY_PODSTAWOWE.forEach((m) => {
      expect(klucze, `brak wpisu dla ${m.key}`).toContain(m.key);
    });
    // Metody wąskiego wskazania też — pojawiają się w karcie C, więc muszą być opisane.
    ['blum', 'tw2', 'menarche', 'mph'].forEach((k) => { expect(klucze).toContain(k); });
  });

  it('każdy wpis ma trzy warstwy i nazwane źródło', () => {
    L.POZYCJE.forEach((p) => {
      expect(p.nazwa, 'nazwa').toBeTruthy();
      expect(p.zrodlo, `${p.nazwa}: źródło`).toBeTruthy();
      expect(p.wzor.length, `${p.nazwa}: wzór autorów`).toBeGreaterThan(20);
      expect(p.silnik.length, `${p.nazwa}: warstwa silnika`).toBeGreaterThan(0);
      expect(p.karta.length, `${p.nazwa}: warstwa karty`).toBeGreaterThan(20);
    });
  });

  it('stałe przedziałów zgadzają się z tymi, które nadaje karta', () => {
    const kr = L.POZYCJE.filter((p) => p.klucz === 'khamis')[0];
    expect(kr.karta).toContain(String(C.KR_ERR_HALFWIDTH_CM.M).replace('.', ',') + ' cm');
    expect(kr.karta).toContain(String(C.KR_ERR_HALFWIDTH_CM.F).replace('.', ',') + ' cm');
    const re = L.POZYCJE.filter((p) => p.klucz === 'reinehr')[0];
    expect(re.karta).toContain(String(C.REINEHR_ERR_HALFWIDTH_CM).replace('.', ',') + ' cm');
    const mph = L.POZYCJE.filter((p) => p.klucz === 'mph')[0];
    expect(mph.karta).toContain(String(C.MPH_SHRINK).replace('.', ','));
    expect(mph.karta).toContain('×' + String(C.MPH_POSTMENARCHE_WEIGHT).replace('.', ','));
  });

  // Ograniczenie do zmierzonego wzrostu dotyczy wszystkich metod naraz — stoi osobno,
  // a nie powtórzone osiem razy, i musi mówić, że NIE jest korektą trafności.
  it('ograniczenie do zmierzonego wzrostu jest opisane raz i nazwane po imieniu', () => {
    expect(L.CLAMP.naglowek).toContain('zmierzonego wzrostu');
    expect(L.CLAMP.tresc).toContain('To nie jest korekta trafności metody');
    expect(L.CLAMP.tresc).toContain('zabezpieczenie przed liczbą fizycznie niemożliwą');
    const html = L.buildHtml();
    expect(html.split('Ograniczenie do zmierzonego wzrostu').length - 1).toBe(1);
  });
});

describe('Metryczka — budowa HTML', () => {
  it('pokazuje tylko metody, o które poprosi panel', () => {
    const html = L.buildHtml(['bp', 'mph']);
    expect(html).toContain('Bayley–Pinneau');
    expect(html).toContain('MPH');
    expect(html).not.toContain('Blum/ISS');
    expect(html).not.toContain('TW Mark II');
  });

  it('bez listy pokazuje wszystko', () => {
    const html = L.buildHtml();
    L.POZYCJE.forEach((p) => { expect(html).toContain(L._esc(p.nazwa)); });
  });

  it('MPH ma warstwę silnika oznaczoną jako nieistotną, a nie pustą', () => {
    const html = L.buildHtml(['mph']);
    expect(html).toContain('nie dotyczy — MPH nie jest metodą prognozy');
    expect(html).toContain('is-pusta');
  });

  it('pusta lista kluczy nie wywraca budowy', () => {
    expect(L.buildHtml([])).toContain('Bayley–Pinneau'); // [] = brak filtra
    expect(L.buildHtml(['czego-nie-ma'])).toBe('');
  });
});
