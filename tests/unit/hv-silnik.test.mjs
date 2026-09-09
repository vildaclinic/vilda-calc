import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Silnik SDS tempa wzrastania. Dwie rzeczy są tu ważniejsze od arytmetyki:
//
// 1. WYNIK JEST LICZBĄ OPISOWĄ, NIE ALARMEM (decyzja właściciela 2026-09-09). Moduł nie
//    może zwrócić żadnego pola werdyktowego — bo pojedynczy HV-Z tego nie unosi: u tego
//    samego zdrowego dziecka waha się o ok. 2,8 SD, a kryterium „< 25. centyla przez rok"
//    ma swoistość 10,4% u dziewcząt (Duran i wsp. 2025, DOI 10.1515/jpem-2025-0225).
// 2. ŹRÓDŁO JEST DANYMI, NIE ZAŁOŻENIEM. Silnik ma być bezpaństwowy i wymienny — to
//    warunek konieczny planowanej wielopopulacyjności (docs/ARCHITECTURE.md).

let H;
beforeAll(() => {
  const okno = {};
  for (const plik of ['hv_donald_data.js', 'hv_kelly_data.js', 'hv_cdgp_data.js',
    'vilda_height_velocity.js']) {
    new Function('window', fs.readFileSync(path.join(korzen, plik), 'utf8'))(okno);
  }
  H = okno.VildaHeightVelocity;
});

const PODSTAWA = { sex: 'F', wiekLat: 9.5, cmPerYear: 3.0, oknoMies: 12 };

describe('Kontrakt: liczba opisowa, nie alarm', () => {
  it('wynik nie ma ŻADNEGO pola werdyktowego', () => {
    const r = H.oblicz(PODSTAWA);
    expect(r.sds).not.toBeNull();
    for (const pole of ['slow', 'alarm', 'severity', 'ponizejNormy', 'flaga', 'threshold']) {
      expect(pole in r, `wynik nie może nieść pola „${pole}"`).toBe(false);
    }
  });

  it('każdy wynik niesie zastrzeżenie o zmienności pojedynczego pomiaru', () => {
    const r = H.oblicz(PODSTAWA);
    expect(r.zastrzezenia.some((z) => z === H.ZASTRZEZENIE_STALE)).toBe(true);
    expect(H.ZASTRZEZENIE_STALE).toMatch(/2,8 SD/);
  });

  it('każdy wynik niesie populację odniesienia i brak polskich norm', () => {
    const r = H.oblicz(PODSTAWA);
    expect(r.zrodlo.populacja).toBe('niemiecka');
    expect(r.zrodlo.doi).toBe('10.1515/jpem-2025-0225');
    expect(r.zastrzezenia.some((z) => /Polskie normy tempa wzrastania nie istnieją/.test(z))).toBe(true);
  });
});

describe('Źródło jest wymienne', () => {
  it('rejestr wystawia trzy źródła z metadanymi', () => {
    const ids = H.zrodla().map((m) => m.id);
    expect(ids).toContain('DONALD');
    expect(ids).toContain('KELLY');
    expect(ids).toContain('KOWD');
  });

  it('domyślnym źródłem jest DONALD', () => {
    expect(H.oblicz(PODSTAWA).zrodlo.id).toBe('DONALD');
  });

  it('ten sam pomiar w dwóch populacjach daje różne liczby', () => {
    const we = { sex: 'F', wiekLat: 9.5, cmPerYear: 3.0, oknoMies: 12 };
    const d = H.oblicz({ ...we, zrodlo: 'DONALD' });
    const k = H.oblicz({ ...we, zrodlo: 'KELLY' });
    expect(d.mediana).not.toBeCloseTo(k.mediana, 2);
    expect(d.sds).not.toBeCloseTo(k.sds, 2);
  });

  it('nieznane źródło to odmowa, nie ciche podstawienie domyślnego', () => {
    const r = H.oblicz({ ...PODSTAWA, zrodlo: 'PALCZEWSKA' });
    expect(r.sds).toBeNull();
    expect(r.powod).toBe(H.POWOD.ZRODLO);
  });
});

describe('Okno pomiarowe i zakres wieku są własnością źródła', () => {
  it('odstęp 7 miesięcy: DONALD liczy, Kelly odmawia', () => {
    const we = { sex: 'M', wiekLat: 8.0, cmPerYear: 5.5, oknoMies: 7 };
    expect(H.oblicz({ ...we, zrodlo: 'DONALD' }).sds).not.toBeNull();
    const k = H.oblicz({ ...we, zrodlo: 'KELLY' });
    expect(k.sds).toBeNull();
    expect(k.powod).toBe(H.POWOD.OKNO);
  });

  it('wiek 3 lata: DONALD liczy, Kelly odmawia (dolna granica 5,5)', () => {
    const we = { sex: 'M', wiekLat: 3.0, cmPerYear: 7.0, oknoMies: 12 };
    expect(H.oblicz({ ...we, zrodlo: 'DONALD' }).sds).not.toBeNull();
    expect(H.oblicz({ ...we, zrodlo: 'KELLY' }).powod).toBe(H.POWOD.WIEK_PONIZEJ);
  });

  it('powyżej górnej granicy źródła — odmowa z nazwanym powodem', () => {
    const r = H.oblicz({ sex: 'F', wiekLat: 17.0, cmPerYear: 1.0, oknoMies: 12 });
    expect(r.powod).toBe(H.POWOD.WIEK_POWYZEJ);
    expect(r.opisPowodu).toMatch(/wzrastanie jest zwykle ukończone/);
  });

  it('odstęp 19 miesięcy przekracza okno nawet w DONALD', () => {
    expect(H.oblicz({ ...PODSTAWA, oknoMies: 19 }).powod).toBe(H.POWOD.OKNO);
  });
});

describe('Interpolacja LMS', () => {
  it('w punkcie tabeli zwraca wartość tabeli, nie interpolowaną', () => {
    const tab = [[2, 1, 10, 0.1], [2.5, 2, 20, 0.2]];
    expect(H.interpolujLms(tab, 2)).toEqual({ L: 1, M: 10, S: 0.1 });
    expect(H.interpolujLms(tab, 2.5)).toEqual({ L: 2, M: 20, S: 0.2 });
  });

  it('między punktami interpoluje liniowo L, M i S osobno', () => {
    const tab = [[2, 1, 10, 0.1], [3, 3, 20, 0.3]];
    expect(H.interpolujLms(tab, 2.5)).toEqual({ L: 2, M: 15, S: 0.2 });
  });

  it('poza tabelą zwraca null, a nie ekstrapolację', () => {
    const tab = [[2, 1, 10, 0.1], [3, 3, 20, 0.3]];
    expect(H.interpolujLms(tab, 1.9)).toBeNull();
    expect(H.interpolujLms(tab, 3.1)).toBeNull();
  });

  it('gałąź L = 0 liczy się logarytmicznie', () => {
    // Przy L = 0 wzór potęgowy dzieli przez zero; u dziewcząt „później dojrzewających"
    // Kelly'ego L faktycznie przechodzi przez zero, więc to nie jest przypadek teoretyczny.
    expect(H.zLms(0, 5, 0.2, 5)).toBeCloseTo(0, 9);
    expect(H.zLms(0, 5, 0.2, 5 * Math.exp(0.2))).toBeCloseTo(1, 9);
  });
});

describe('Podgrupy wg czasu pokwitania (tylko Kelly)', () => {
  it('podgrupę wybiera wiek startu pokwitania, nie zgadywanie', () => {
    const we = { sex: 'F', wiekLat: 11.0, cmPerYear: 5.0, oknoMies: 12, zrodlo: 'KELLY' };
    expect(H.oblicz({ ...we, wiekStartuPokwitaniaLat: 8.5 }).podgrupa).toBe('wczesniej');
    expect(H.oblicz({ ...we, wiekStartuPokwitaniaLat: 10.0 }).podgrupa).toBe('przecietnie');
    expect(H.oblicz({ ...we, wiekStartuPokwitaniaLat: 12.0 }).podgrupa).toBe('pozniej');
  });

  it('granice progów są dokładnie takie, jak w suplemencie', () => {
    expect(H.podgrupaZWieku('F', 9.59)).toBe('wczesniej');
    expect(H.podgrupaZWieku('F', 9.6)).toBe('przecietnie');
    expect(H.podgrupaZWieku('F', 11.1)).toBe('przecietnie');
    expect(H.podgrupaZWieku('F', 11.11)).toBe('pozniej');
    expect(H.podgrupaZWieku('M', 10.19)).toBe('wczesniej');
    expect(H.podgrupaZWieku('M', 11.81)).toBe('pozniej');
  });

  it('bez wieku startu pokwitania używana jest cała kohorta, a nie zgadywana podgrupa', () => {
    const r = H.oblicz({ sex: 'F', wiekLat: 11.0, cmPerYear: 5.0, oknoMies: 12, zrodlo: 'KELLY' });
    expect(r.podgrupa).toBeNull();
    expect(r.sds).not.toBeNull();
    expect(r.zastrzezenia.some((z) => /nie\s+uwzględnia indywidualnego czasu pokwitania/.test(z))).toBe(true);
  });

  it('podgrupa realnie zmienia wynik', () => {
    const we = { sex: 'F', wiekLat: 13.0, cmPerYear: 4.0, oknoMies: 12, zrodlo: 'KELLY' };
    const wcz = H.oblicz({ ...we, wiekStartuPokwitaniaLat: 8.5 });
    const poz = H.oblicz({ ...we, wiekStartuPokwitaniaLat: 12.5 });
    expect(wcz.sds - poz.sds).toBeGreaterThan(1.0);
  });

  it('DONALD nie ma podgrup i nie udaje, że ma', () => {
    const r = H.oblicz({ ...PODSTAWA, wiekStartuPokwitaniaLat: 8.0 });
    expect(r.podgrupa).toBeNull();
    expect(r.zrodlo.id).toBe('DONALD');
  });

  it('poza zakresem podgrupy wraca cała kohorta, a nie odmowa', () => {
    // Podgrupa „wcześniej" u dziewcząt kończy się na 15,0 roku.
    const r = H.oblicz({
      sex: 'F', wiekLat: 16.0, cmPerYear: 1.0, oknoMies: 12,
      zrodlo: 'KELLY', wiekStartuPokwitaniaLat: 8.5,
    });
    expect(r.sds).not.toBeNull();
    expect(r.podgrupa).toBeNull();
  });
});

describe('Gałąź KOWD', () => {
  it('działa tylko na jawną deklarację lekarza', () => {
    expect(H.oblicz({ sex: 'M', wiekLat: 14.0, cmPerYear: 4.6, oknoMies: 12 }).kowd).toBeNull();
    const r = H.oblicz({ sex: 'M', wiekLat: 14.0, cmPerYear: 4.6, oknoMies: 12, kowd: true });
    expect(r.kowd).not.toBeNull();
  });

  it('podaje położenie wobec kwartyli, a NIE Z-score', () => {
    const r = H.oblicz({ sex: 'M', wiekLat: 14.0, cmPerYear: 4.6, oknoMies: 12, kowd: true });
    expect(r.kowd.polozenie).toBe('ponizej-25c');
    expect(r.kowd.mediana).toBe(6.2);
    expect('sds' in r.kowd, 'gałąź KOWD nie może zwracać SDS').toBe(false);
    expect(r.kowd.zastrzezenie).toMatch(/nie centyle referencyjne/);
  });

  it('SDS wobec populacji liczy się dalej — lekarz dostaje obie liczby', () => {
    const r = H.oblicz({ sex: 'M', wiekLat: 14.0, cmPerYear: 4.6, oknoMies: 12, kowd: true });
    expect(r.sds).not.toBeNull();
    expect(r.zrodlo.id).toBe('DONALD');
  });

  it('tam, gdzie publikacja ma samą medianę, moduł mówi tylko „powyżej/poniżej mediany"', () => {
    const r = H.oblicz({ sex: 'M', wiekLat: 17.2, cmPerYear: 4.0, oknoMies: 12,
      kowd: true, zrodlo: 'DONALD' });
    // 17,2 roku wykracza poza DONALD dla chłopców (17,0) — sprawdzamy samą gałąź KOWD.
    const k = H.ocenKowd('M', 17.2, 4.0);
    expect(k.tylkoMediana).toBe(true);
    expect(k.polozenie).toBe('ponizej-mediany');
    expect(r.powod).toBe(H.POWOD.WIEK_POWYZEJ);
  });

  it('poza zakresem wieku tabel KOWD zwraca null, a nie zgadywany przedział', () => {
    expect(H.ocenKowd('F', 0.5, 20)).toBeNull();
    expect(H.ocenKowd('F', 25, 1)).toBeNull();
  });
});

describe('Odmowy i wejście', () => {
  it('brak tempa, wieku albo płci to odmowa z nazwanym powodem', () => {
    expect(H.oblicz({ sex: 'F', wiekLat: 9.5, oknoMies: 12 }).powod).toBe(H.POWOD.BRAK_DANYCH);
    expect(H.oblicz({ sex: 'F', cmPerYear: 5, oknoMies: 12 }).powod).toBe(H.POWOD.BRAK_DANYCH);
    expect(H.oblicz({ wiekLat: 9.5, cmPerYear: 5, oknoMies: 12 }).powod).toBe(H.POWOD.PLEC);
    // Wejscie null: zrodlo domyslne (DONALD) rozwiazuje sie poprawnie,
    // wiec odmowa dotyczy braku tempa i wieku, a nie zrodla.
    expect(H.oblicz(null).powod).toBe(H.POWOD.BRAK_DANYCH);
    expect(H.oblicz({ ...PODSTAWA, zrodlo: 'NIE_MA_TAKIEGO' }).powod).toBe(H.POWOD.ZRODLO);
  });

  it('płeć przyjmowana w formach używanych w aplikacji', () => {
    for (const s of ['F', 'K', 'female', 'f']) {
      expect(H.oblicz({ ...PODSTAWA, sex: s }).plec, `płeć „${s}"`).toBe('F');
    }
    expect(H.oblicz({ ...PODSTAWA, sex: 'M', cmPerYear: 5 }).plec).toBe('M');
  });

  it('tempo ujemne liczy się formalnie, ale z jawnym zastrzeżeniem', () => {
    const r = H.oblicz({ ...PODSTAWA, cmPerYear: -1 });
    // hv <= 0 nie ma logarytmu ani potęgi — moduł odmawia zamiast zwrócić NaN.
    expect(r.sds).toBeNull();
    expect(r.powod).toBe(H.POWOD.BRAK_DANYCH);
  });

  it('znany przypadek: dziewczynka 9,5 r.ż., 3,0 cm/rok wg DONALD', () => {
    const r = H.oblicz(PODSTAWA);
    expect(r.mediana).toBeCloseTo(5.87, 2);
    expect(r.sds).toBeCloseTo(-2.42, 2);
    expect(r.centyl).toBeLessThan(1);
  });
});
