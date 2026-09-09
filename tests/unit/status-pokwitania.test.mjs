import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// GROWTH-PUB-ONE — jedno źródło prawdy o dojrzewaniu.
//
// Dwie reguły są tu ważniejsze od reszty:
//  1. ŚWIEŻOŚĆ (decyzja właściciela 2026-09-09): stadium z rekordu starsze niż 12 miesięcy
//     jest IGNOROWANE, nie tylko oznaczane. Stadium z bieżącego formularza nie ma daty
//     i jest zawsze aktualne.
//  2. SPRZECZNOŚCI są pokazywane, nigdy rozstrzygane za lekarza — moduł nic nie kasuje
//     i niczego nie poprawia.

let S;
beforeEach(() => {
  const okno = {};
  new Function('window', fs.readFileSync(path.join(korzen, 'vilda_pubertal_status.js'), 'utf8'))(okno);
  S = okno.VildaPubertalStatus;
});

describe('Świeżość stadium', () => {
  it('stadium z formularza wygrywa z rekordem i nigdy się nie starzeje', () => {
    const o = S.ocenEtap({
      etapFormularz: '3', etapRekord: 1, wiekWpisuMies: 10, wiekTerazMies: 200,
    });
    expect(o.etap).toBe(3);
    expect(o.zrodlo).toBe('formularz');
    expect(o.nieaktualny).toBe(false);
  });

  it('stadium z rekordu młodsze niż 12 mies. jest używane', () => {
    const o = S.ocenEtap({ etapRekord: 2, wiekWpisuMies: 120, wiekTerazMies: 131 });
    expect(o.etap).toBe(2);
    expect(o.zrodlo).toBe('rekord');
    expect(o.nieaktualny).toBe(false);
  });

  it('granica 12 miesięcy jest ostra — równo 12 jeszcze wchodzi', () => {
    expect(S.ocenEtap({ etapRekord: 2, wiekWpisuMies: 120, wiekTerazMies: 132 }).etap).toBe(2);
    expect(S.ocenEtap({ etapRekord: 2, wiekWpisuMies: 120, wiekTerazMies: 132.1 }).etap).toBeNull();
  });

  it('stadium starsze niż 12 mies. jest ignorowane, ale powód zostaje nazwany', () => {
    const o = S.ocenEtap({ etapRekord: 4, wiekWpisuMies: 100, wiekTerazMies: 140 });
    expect(o.etap, 'nie wolno go użyć w ocenie').toBeNull();
    expect(o.nieaktualny).toBe(true);
    expect(o.etapPominiety, 'lekarz ma wiedzieć, co pominięto').toBe(4);
  });

  it('brak stadium w obu miejscach to brak stadium, a nie zgadywanie z wieku', () => {
    const o = S.ocenEtap({ wiekTerazMies: 150 });
    expect(o.etap).toBeNull();
    expect(o.zrodlo).toBeNull();
    expect(o.nieaktualny).toBe(false);
  });

  it('wartości spoza zakresu I–V nie są stadium', () => {
    expect(S.ocenEtap({ etapFormularz: '0' }).etap).toBeNull();
    expect(S.ocenEtap({ etapFormularz: '6' }).etap).toBeNull();
    expect(S.ocenEtap({ etapFormularz: '' }).etap).toBeNull();
  });

  it('próg świeżości jest tą samą liczbą co strażnik karty trajektorii', () => {
    const traj = fs.readFileSync(path.join(korzen, 'vilda_trajectory_analysis.js'), 'utf8');
    expect(traj).toContain('TANNER_FRESH_M: 12');
    expect(S.SWIEZOSC_MIES).toBe(12);
  });
});

describe('Sprzeczności między polami', () => {
  it('Tanner I przy jądrach ≥ 4 ml', () => {
    const l = S.sprzecznosci({ etap: 1, plec: 'M', jadra: 'gt6' });
    expect(l).toHaveLength(1);
    expect(l[0]).toMatch(/Tanner I wyklucza/);
  });

  it('Tanner ≥ II przy jądrach < 4 ml', () => {
    expect(S.sprzecznosci({ etap: 3, plec: 'M', jadra: 'lt4' })[0]).toMatch(/gonadarche/);
  });

  it('jądra 4–6 ml przy Tanner II to zgodność, nie sprzeczność', () => {
    expect(S.sprzecznosci({ etap: 2, plec: 'M', jadra: '4to6' })).toEqual([]);
  });

  it('„nie wiem” nigdy nie jest sprzecznością', () => {
    expect(S.sprzecznosci({ etap: 1, plec: 'M', jadra: 'unknown' })).toEqual([]);
    expect(S.sprzecznosci({ etap: 4, plec: 'M', jadra: '' })).toEqual([]);
  });

  it('Tanner I u dziecka po starcie pokwitania', () => {
    const l = S.sprzecznosci({ etap: 1, plec: 'F', wiekStartuLat: 9, wiekLat: 11 });
    expect(l[0]).toMatch(/nie jest przedpokwitaniowe/);
  });

  it('start pokwitania w przyszłości względem wieku to nie sprzeczność', () => {
    expect(S.sprzecznosci({ etap: 1, plec: 'F', wiekStartuLat: 12, wiekLat: 11 })).toEqual([]);
  });

  it('menarche przy Tanner I–II i menarche u chłopca', () => {
    expect(S.sprzecznosci({ etap: 2, plec: 'F', wiekMenarcheLat: 12 })[0]).toMatch(/III–IV/);
    expect(S.sprzecznosci({ etap: 3, plec: 'M', wiekMenarcheLat: 12 })[0]).toMatch(/u chłopca/);
  });

  it('menarche wcześniejsza niż start pokwitania', () => {
    const l = S.sprzecznosci({ etap: 3, plec: 'F', wiekStartuLat: 12, wiekMenarcheLat: 10 });
    expect(l[0]).toMatch(/wcześniejszy niż wiek startu/);
  });

  it('komplet spójnych danych nie generuje ani jednej uwagi', () => {
    expect(S.sprzecznosci({
      etap: 4, plec: 'F', wiekStartuLat: 10.5, wiekMenarcheLat: 12.5, wiekLat: 13,
    })).toEqual([]);
    expect(S.sprzecznosci({ etap: 2, plec: 'M', jadra: '4to6', wiekStartuLat: 11, wiekLat: 11.5 }))
      .toEqual([]);
  });

  it('moduł niczego nie kasuje — zwraca wyłącznie listę tekstów', () => {
    const we = { etap: 1, plec: 'M', jadra: 'gt6', wiekStartuLat: 9, wiekLat: 11 };
    const kopia = JSON.parse(JSON.stringify(we));
    const l = S.sprzecznosci(we);
    expect(we, 'wejście nietknięte').toEqual(kopia);
    expect(l.every((x) => typeof x === 'string')).toBe(true);
  });
});
