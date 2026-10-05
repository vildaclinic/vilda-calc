import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P-GH-WAZNOSC (2026-10-05, decyzja właściciela D4): ile wkładów, wstrzykiwaczy albo fiolek wydać na okres
// leczenia GH/IGF-1, z ważnością po pierwszym użyciu (ChPL 6.3). Test ładuje PRAWDZIWY plik danych i silnik.
// Wartości ważności czytamy z pliku danych, a przypadki liczbowe są wyliczone ręcznie z ChPL:
// Omnitrope 28 dni, Genotropin 28 dni (po rekonstytucji), Ngenla 28 dni i 5 użyć, Increlex 30 dni.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function okno() {
  const w = {};
  for (const f of ['vilda_gh_opakowania_dane.js', 'vilda_gh_opakowania.js']) {
    new Function('window', 'globalThis', fs.readFileSync(path.join(korzen, f), 'utf8'))(w, w);
  }
  return w;
}
const w = okno();
const E = w.VildaGhOpakowania;
const D = w.VildaGhOpakowaniaDane;
const sztuki = (lek, dni, x) => E.policz({ lek, dni, ...x });

describe('Plik danych opakowań GH/IGF-1', () => {
  it('obejmuje dokładnie preparaty z listy karty GH/IGF-1, z zawartością jak w karcie', () => {
    expect(Object.keys(D.PREPARATY).sort()).toEqual([
      'Genotropin 12 mg', 'Genotropin 5,3 mg', 'Increlex 40 mg', 'Ngenla 24 mg', 'Ngenla 60 mg',
      'Omnitrope 10 mg', 'Omnitrope 5 mg',
    ]);
    const zawartosc = Object.fromEntries(Object.entries(D.PREPARATY).map(([k, v]) => [k, v.mgNaSztuke]));
    expect(zawartosc).toEqual({
      'Omnitrope 5 mg': 5, 'Omnitrope 10 mg': 10, 'Genotropin 5,3 mg': 5.3, 'Genotropin 12 mg': 12,
      'Ngenla 24 mg': 24, 'Ngenla 60 mg': 60, 'Increlex 40 mg': 40,
    });
    // Karta GH/IGF-1 ma te same zawartości (mgPerUnit) — gdyby się rozjechały, liczba z ilości leku byłaby inna.
    const karta = fs.readFileSync(path.join(korzen, 'gh_igf_therapy.js'), 'utf8');
    for (const [lek, mg] of Object.entries(zawartosc)) {
      expect(karta).toContain(`"${lek}":{mgPerUnit:${mg},`);
    }
  });

  it('ważność po pierwszym użyciu i limit użyć zgodne z ChPL 6.3; każdy preparat ma źródło z wersją', () => {
    const waznosc = Object.fromEntries(Object.entries(D.PREPARATY).map(([k, v]) => [k, [v.waznoscDni, v.maksUzyc]]));
    expect(waznosc).toEqual({
      'Omnitrope 5 mg': [28, null], 'Omnitrope 10 mg': [28, null],
      'Genotropin 5,3 mg': [28, null], 'Genotropin 12 mg': [28, null],
      'Ngenla 24 mg': [28, 5], 'Ngenla 60 mg': [28, 5],
      'Increlex 40 mg': [30, null],
    });
    for (const p of Object.values(D.PREPARATY)) {
      const z = D.ZRODLA[p.zrodlo];
      expect(z.punkt).toMatch(/^6\.3/);
      expect(z.wersja).toBeTruthy();
      expect(z.cytat).toMatch(/28|30/);
    }
    expect(Object.isFrozen(D.PREPARATY['Ngenla 60 mg'])).toBe(true);
  });
});

describe('Liczba sztuk: większa z liczby z ilości leku i z ważności', () => {
  it('Omnitrope 10 mg, 0,3 mg/d (12 kg × 0,025): 90 dni — 4 zamiast 3, 180 dni — 7 zamiast 6', () => {
    const r90 = sztuki('Omnitrope 10 mg', 90, { mgNaDobe: 0.3 });
    expect([r90.mg, r90.sztukiZDawki, r90.sztukiZWaznosci, r90.sztuki, r90.decydujeWaznosc]).toEqual([27, 3, 4, 4, true]);
    expect(sztuki('Omnitrope 10 mg', 180, { mgNaDobe: 0.3 }).sztuki).toBe(7);
    expect(r90.zrodlo.id).toBe('OMNITROPE');
  });

  it('Omnitrope 10 mg, 1,0 mg/d: decyduje ilość leku, wynik jak dotąd (9 / 18), bez dopisku', () => {
    const r = sztuki('Omnitrope 10 mg', 90, { mgNaDobe: 1.0 });
    expect([r.sztukiZDawki, r.sztukiZWaznosci, r.sztuki, r.decydujeWaznosc]).toEqual([9, 4, 9, false]);
    expect(E.dopisek(r)).toBe('');
    expect(sztuki('Omnitrope 10 mg', 180, { mgNaDobe: 1.0 }).sztuki).toBe(18);
  });

  it('Genotropin 12 mg, 0,3 mg/d: 28 dni po rekonstytucji — 4 na 90 dni, 7 na 180 dni', () => {
    expect(sztuki('Genotropin 12 mg', 90, { mgNaDobe: 0.3 }).sztuki).toBe(4);
    expect(sztuki('Genotropin 12 mg', 180, { mgNaDobe: 0.3 }).sztuki).toBe(7);
    expect(sztuki('Genotropin 5,3 mg', 28, { mgNaDobe: 0.15 }).sztuki).toBe(1);
  });

  it('Increlex, 0,8 mg/d (2 × 0,4 mg): 30 dni po otwarciu — 3 fiolki na 90 dni, 6 na 180', () => {
    const r = sztuki('Increlex 40 mg', 90, { mgNaDobe: 0.8 });
    expect([r.sztukiZDawki, r.sztukiZWaznosci, r.sztuki]).toEqual([2, 3, 3]);
    expect(sztuki('Increlex 40 mg', 180, { mgNaDobe: 0.8 }).sztuki).toBe(6);
    expect(sztuki('Increlex 40 mg', 30, { mgNaDobe: 0.8 }).sztuki).toBe(1);
    expect(sztuki('Increlex 40 mg', 31, { mgNaDobe: 0.8 }).sztuki).toBe(2);
  });

  it('Ngenla 60 mg, 9 mg/tydz: najwyżej 5 dawek z wstrzykiwacza — 3 na 90 dni, 6 na 180', () => {
    const r = sztuki('Ngenla 60 mg', 90, { mgNaTydzien: 9 });
    expect([r.dawki, r.mg, r.dawekNaSztuke, r.sztukiZDawki, r.sztukiZWaznosci, r.sztuki]).toEqual([13, 117, 5, 2, 3, 3]);
    expect(sztuki('Ngenla 60 mg', 180, { mgNaTydzien: 9 }).sztuki).toBe(6);
  });

  it('Ngenla przy dużej dawce: decyduje ilość leku (33 mg/tydz → 8 wstrzykiwaczy 60 mg na 90 dni)', () => {
    const r = sztuki('Ngenla 60 mg', 90, { mgNaTydzien: 33 });
    expect([r.sztukiZDawki, r.sztukiZWaznosci, r.sztuki, r.decydujeWaznosc]).toEqual([8, 3, 8, false]);
  });

  it('nieznany preparat, brak dawki albo dni — bez wyniku (karta liczy jak dotąd)', () => {
    expect(E.policz({ lek: 'Inny 5 mg', dni: 90, mgNaDobe: 1 })).toEqual({ znany: false, lek: 'Inny 5 mg' });
    expect(sztuki('Omnitrope 10 mg', 90, { mgNaDobe: 0 }).sztuki).toBe(0);
    expect(sztuki('Omnitrope 10 mg', 0, { mgNaDobe: 1 }).sztuki).toBe(0);
    expect(sztuki('Ngenla 24 mg', 90, {}).sztuki).toBe(0);
  });
});

describe('Teksty dla lekarza', () => {
  it('notka podaje ważność, źródło i to, że sztukę się wyrzuca mimo resztek leku', () => {
    expect(E.notka('Omnitrope 5 mg')).toBe('Liczba wkładów uwzględnia ważność po pierwszym użyciu: 28 dni '
      + '(ChPL Omnitrope, pkt 6.3). Po tym czasie wkład się wyrzuca, nawet jeśli w nim został lek. Wynik zaokrąglamy w górę.');
    expect(E.notka('Genotropin 12 mg')).toContain('ważność po przygotowaniu roztworu: 28 dni (ChPL Genotropin, pkt 6.3)');
    expect(E.notka('Ngenla 24 mg')).toContain('28 dni i najwyżej 5 użyć (ChPL Ngenla, pkt 6.3), czyli najwyżej 5 dawek '
      + 'tygodniowych z jednego wstrzykiwacza');
    expect(E.notka('Increlex 40 mg')).toContain('Po tym czasie fiolkę się wyrzuca, nawet jeśli w niej został lek.');
    expect(E.notka('Inny')).toBe('');
  });

  it('dopisek tylko wtedy, gdy zdecydowała ważność', () => {
    expect(E.dopisek(sztuki('Omnitrope 10 mg', 90, { mgNaDobe: 0.3 })))
      .toBe(' · uwzględniono ważność 28 dni (z samej ilości leku: 3)');
    expect(E.dopisek(sztuki('Ngenla 60 mg', 90, { mgNaTydzien: 9 })))
      .toBe(' · uwzględniono ważność 28 dni i najwyżej 5 użyć (z samej ilości leku: 2)');
    expect(E.dopisek(null)).toBe('');
  });
});
