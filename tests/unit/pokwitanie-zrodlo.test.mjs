import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// GROWTH-PUB-SRC — wiek startu pokwitania i wiek menarche jako dane rekordu.
//
// Dwa pytania rozstrzygane w tym pliku:
//  1. czy podgrupy Kelly'ego dostają WŁAŚCIWĄ liczbę (wiek startu, nie menarche);
//  2. czy dziecko spoza kryteriów włączenia kohorty NIE dostaje podgrupy — bo
//     „wcześniej" i „później" to ćwiartki zdrowej populacji, z której przedwczesne
//     i opóźnione pokwitanie były wykluczone (Kelly i wsp. 2014, Metody).

function zbuduj() {
  const okno = { document: null };
  for (const plik of ['hv_donald_data.js', 'hv_kelly_data.js', 'hv_cdgp_data.js',
    'vilda_height_velocity.js', 'vilda_puberty_source.js']) {
    new Function('window', fs.readFileSync(path.join(korzen, plik), 'utf8'))(okno);
  }
  return okno;
}

let okno; let P; let H;
beforeEach(() => {
  okno = zbuduj();
  P = okno.VildaPubertySource;
  H = okno.VildaHeightVelocity;
});

describe('Zamiana sekcji rekordu na wejście silnika', () => {
  it('przenosi obie liczby i oznacza pochodzenie', () => {
    const we = P.naWejscie({ onsetAgeYears: 11.5, menarcheAgeYears: 13 });
    expect(we.wiekStartuPokwitaniaLat).toBe(11.5);
    expect(we.wiekMenarcheLat).toBe(13);
    expect(we.zKartyPacjenta).toBe(true);
  });

  it('czyta liczbę zapisaną z przecinkiem', () => {
    expect(P.naWejscie({ onsetAgeYears: '10,25' }).wiekStartuPokwitaniaLat).toBe(10.25);
  });

  it('pusta sekcja to null, a nie obiekt z samymi nullami', () => {
    expect(P.naWejscie({})).toBeNull();
    expect(P.naWejscie(null)).toBeNull();
    expect(P.naWejscie({ onsetAgeYears: '' })).toBeNull();
  });

  it('sama menarche wystarczy, żeby sekcja niosła dane', () => {
    const we = P.naWejscie({ menarcheAgeYears: 12 });
    expect(we.wiekMenarcheLat).toBe(12);
    expect(we.wiekStartuPokwitaniaLat).toBeNull();
    expect(P.niesieDane(we)).toBe(true);
  });
});

describe('Pamięć sekcji i cykl życia', () => {
  it('zapamiętuje sekcję razem z płcią rekordu', () => {
    P.zapamietaj({ puberty: { onsetAgeYears: 9.8 }, user: { sex: 'K' } });
    expect(P.biezace().wiekStartuPokwitaniaLat).toBe(9.8);
    expect(P.ocenStart().podgrupa).toBe('przecietnie');
  });

  it('wylogowanie kasuje pamięć — nie przenosimy pacjenta na pacjenta', () => {
    P.zapamietaj({ puberty: { onsetAgeYears: 9.8 }, user: { sex: 'K' } });
    P.zapomnij();
    expect(P.biezace()).toBeNull();
    expect(P.ocenStart('F')).toBeNull();
  });

  it('rekord bez sekcji kasuje poprzednią pamięć', () => {
    P.zapamietaj({ puberty: { onsetAgeYears: 9.8 }, user: { sex: 'K' } });
    P.zapamietaj({ user: { sex: 'K' } });
    expect(P.biezace()).toBeNull();
  });
});

describe('Podgrupa Kelly’ego wybierana wiekiem startu pokwitania', () => {
  it('progi z publikacji, po obu stronach każdego z nich', () => {
    expect(H.podgrupaZWieku('F', 9.5)).toBe('wczesniej');
    expect(H.podgrupaZWieku('F', 9.6)).toBe('przecietnie');
    expect(H.podgrupaZWieku('F', 11.1)).toBe('przecietnie');
    expect(H.podgrupaZWieku('F', 11.2)).toBe('pozniej');
    expect(H.podgrupaZWieku('M', 10.1)).toBe('wczesniej');
    expect(H.podgrupaZWieku('M', 10.2)).toBe('przecietnie');
    expect(H.podgrupaZWieku('M', 11.8)).toBe('przecietnie');
    expect(H.podgrupaZWieku('M', 11.9)).toBe('pozniej');
  });

  it('menarche NIE wybiera podgrupy: sam jej wiek zostawia całą kohortę', () => {
    P.zapamietaj({ puberty: { menarcheAgeYears: 12.5 }, user: { sex: 'K' } });
    const s = P.biezace();
    const r = H.oblicz({
      sex: 'F', wiekLat: 12, cmPerYear: 6, oknoMies: 12, zrodlo: 'KELLY',
      wiekStartuPokwitaniaLat: s.wiekStartuPokwitaniaLat,
      wiekMenarcheLat: s.wiekMenarcheLat,
    });
    expect(r.podgrupa).toBeNull();
    expect(r.wiekMenarcheLat).toBe(12.5);
    expect(r.zastrzezenia.join(' ')).toMatch(/nie zastępuje/);
  });
});

describe('Dziecko spoza kryteriów włączenia kohorty', () => {
  it('dziewczynka z telarche w 8. r.ż. NIE dostaje podgrupy „wcześniej”', () => {
    // Kelly wykluczał rozwój piersi przed 8. r.ż.; granica jest ostra, 8,0 jeszcze wchodzi.
    expect(H.podgrupaZWieku('F', 7.9)).toBeNull();
    expect(H.podgrupaZWieku('F', 8)).toBe('wczesniej');
    const o = H.ocenStartPokwitania('F', 7.5);
    expect(o.podgrupa).toBeNull();
    expect(o.pozaKohorta).toBe(H.POZA_KOHORTA.PRZEDWCZESNE);
    expect(o.uwaga).toMatch(/poza kryteriami włączenia/);
  });

  it('chłopiec z powiększeniem jąder przed 9. r.ż. — tak samo', () => {
    expect(H.podgrupaZWieku('M', 8.9)).toBeNull();
    expect(H.podgrupaZWieku('M', 9)).toBe('wczesniej');
    expect(H.ocenStartPokwitania('M', 8).pozaKohorta).toBe(H.POZA_KOHORTA.PRZEDWCZESNE);
  });

  it('pokwitanie opóźnione też leży poza tabelami', () => {
    expect(H.podgrupaZWieku('F', 13)).toBe('pozniej');
    expect(H.podgrupaZWieku('F', 13.1)).toBeNull();
    expect(H.podgrupaZWieku('M', 14)).toBe('pozniej');
    expect(H.podgrupaZWieku('M', 14.1)).toBeNull();
    expect(H.ocenStartPokwitania('F', 14).pozaKohorta).toBe(H.POZA_KOHORTA.OPOZNIONE);
  });

  it('wynik silnika mówi o tym wprost, zamiast po cichu użyć całej kohorty', () => {
    const r = H.oblicz({
      sex: 'F', wiekLat: 10, cmPerYear: 7, oknoMies: 12, zrodlo: 'KELLY',
      wiekStartuPokwitaniaLat: 7.5,
    });
    expect(r.podgrupa).toBeNull();
    expect(r.sds).not.toBeNull();
    expect(r.start.pozaKohorta).toBe(H.POZA_KOHORTA.PRZEDWCZESNE);
    expect(r.zastrzezenia.join(' ')).toMatch(/poza kryteriami włączenia/);
  });

  it('zakres kohorty pochodzi z danych źródła, nie ze stałej w silniku', () => {
    expect(okno.VildaHvKellyData.ZAKRES_STARTU).toEqual({
      F: { min: 8, max: 13 }, M: { min: 9, max: 14 },
    });
  });
});

describe('Kontrola negatywna', () => {
  it('dziecko w środku kohorty dostaje podgrupę i inną medianę niż cała kohorta', () => {
    const wspolne = { sex: 'F', wiekLat: 11, cmPerYear: 6, oknoMies: 12, zrodlo: 'KELLY' };
    const bez = H.oblicz(wspolne);
    const zPodgrupa = H.oblicz({ ...wspolne, wiekStartuPokwitaniaLat: 12.5 });
    expect(bez.podgrupa).toBeNull();
    expect(zPodgrupa.podgrupa).toBe('pozniej');
    expect(zPodgrupa.mediana).not.toBe(bez.mediana);
  });
});
