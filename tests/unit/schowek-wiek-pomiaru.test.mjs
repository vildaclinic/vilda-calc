import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// KARTA-SCHOWEK-WIEK — „Skopiuj podsumowanie wyników" na Karcie pacjenta liczy centyle
// w wieku Z CHWILI POMIARU (age/ageMonths rekordu), nie w wieku z daty urodzenia na dziś.
//
// Audyt SDS wzrostu 2026-09-15: schowek nadpisywał wiek rekordu wynikiem
// VildaVault.calcAgeFromDOB(dobISO) bez daty odniesienia, czyli wiekiem dzisiejszym.
// Dla rekordu sprzed roku centyl w schowku szedł na dzisiejszym wieku i starym wzroście,
// podczas gdy kafelek „Wzrost" obok (Rata B) używa wieku pomiaru. Ten test podstawia
// sejf, który dla tej samej daty urodzenia zwraca wiek o 9 miesięcy starszy, i pilnuje,
// że do siatek trafia wiek rekordu.

function okno({ dzisMies }) {
  const wywolania = [];
  const win = {
    professionalMode: false,
    bmiSource: 'OLAF',
    calcPercentileStats(value, sex, ageYears, kind) {
      wywolania.push({ value, sex, ageYears, kind });
      return { percentile: 50, sd: 0 };
    },
    VildaVault: {
      calcAgeFromDOB() {
        return { years: Math.floor(dzisMies / 12), ageMonths: dzisMies % 12, totalMonths: dzisMies };
      },
    },
  };
  loadBrowserScript('vilda_patient_summary_copy.js', win);
  return { win, wywolania };
}

const REKORD = {
  user: { sex: 'F', age: 12, ageMonths: 6, weight: 42, height: 152, dobISO: '2014-03-15' },
  advanced: { data: {} },
};

describe('Schowek Karty pacjenta — centyle w wieku pomiaru', () => {
  it('sejf zna datę urodzenia i podaje wiek dzisiejszy, a do siatek idzie wiek rekordu', () => {
    const { win, wywolania } = okno({ dzisMies: 159 });
    const txt = win.VildaPatientSummaryCopy.buildSummaryTextFromPayload(REKORD, {});
    expect(txt, 'schowek ma wiersz wzrostu').toMatch(/Wzrost:/);
    const ht = wywolania.find((w) => w.kind === 'HT');
    expect(ht, 'centyl wzrostu policzony').toBeTruthy();
    expect(ht.ageYears, 'wiek pomiaru 12 l 6 mies., nie 13 l 3 mies. z daty urodzenia').toBeCloseTo(12.5, 9);
    expect(ht.value).toBe(152);
    for (const w of wywolania) expect(w.ageYears, w.kind).toBeCloseTo(12.5, 9);
  });

  it('rekord bez wieku nie dostaje wieku z daty urodzenia w zastępstwie — schowek jest pusty', () => {
    const { win, wywolania } = okno({ dzisMies: 159 });
    const bezWieku = { user: { sex: 'F', weight: 42, height: 152, dobISO: '2014-03-15' }, advanced: { data: {} } };
    expect(win.VildaPatientSummaryCopy.buildSummaryTextFromPayload(bezWieku, {})).toBe('');
    expect(wywolania).toHaveLength(0);
  });
});
