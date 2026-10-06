import { describe, expect, it } from 'vitest';
import { idDeterministyczne, rodzaje, utworzAtrapeMonitoraGh } from '../support/gh-monitor-atrapa.mjs';

// P-GH-PUNKTY-TESTY. Test dymny wspólnej atrapy monitora GH (tests/support/gh-monitor-atrapa.mjs).
// Sprawdza, że atrapa uruchamia PRAWDZIWY gh_therapy_monitor.js z produkcyjnym znacznikiem karty, a jej
// dziennik oddaje kolejność zapisu i sygnałów, na której oprą się testy charakteryzujące punktów GH.
// To nie jest test kliniczny: liczby są fikcyjne i dobrane tak, żeby wynik karty dało się sprawdzić ręcznie.

// 15 kluczy rekordu w kolejności zapisu monitora (mapa punktów GH, §1.1).
const KLUCZE = ['id', 'type', 'ageYears', 'ageMonths', 'weight', 'height', 'boneAge', 'dose', 'doseUnit', 'drug',
  'program', 'igf1', 'igf1Unit', 'igf1DaysSinceDose', 'doseAbs'];
// Karta po przeliczeniu: Omnitrope 10 mg, 0,025 mg/kg/d × 32 kg = 0,8 mg/d (krok 0,1 mg).
const KARTA = { drug: 'Omnitrope 10 mg', weight: 32, perDayMg: 0.8, perWeekMg: 5.6 };

describe('Atrapa monitora GH — prawdziwy monitor, jeden dziennik', () => {
  it('Włączenie z karty (Omnitrope 10 mg) zapisuje rekord 15 kluczy; dziennik [E, M, E, BC] bez echa i bez setTimeout', () => {
    const atrapa = utworzAtrapeMonitoraGh({ ghTherapyCalc: KARTA });
    // Start monitora: D() przed i po zamontowaniu karty.
    expect(rodzaje(atrapa.dziennikStartu)).toEqual(['E', 'E']);
    expect(atrapa.pole('btnGhStart').textContent).toBe('Włączenie leczenia');
    const timery = atrapa.timery.length;

    const wpisy = atrapa.dodajZKarty('start');

    expect(rodzaje(wpisy)).toEqual(['E', 'M', 'E', 'BC']);
    const s = atrapa.stan();
    expect(s.okno).toHaveLength(1);
    expect(Object.keys(s.okno[0])).toEqual(KLUCZE);
    expect(s.okno[0]).toEqual({
      id: idDeterministyczne(0), type: 'start', ageYears: 10, ageMonths: 3, weight: 32, height: 141, boneAge: null,
      dose: 0.025, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP',
      igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.8,
    });
    const [eOdczyt, m, eZapis, bc] = wpisy;
    expect(eOdczyt).toEqual({ rodzaj: 'E', detail: { source: 'gh' }, okno: [] });
    expect(m).toEqual({ rodzaj: 'M', klucz: 'GH_THERAPY_POINTS', wartosc: s.okno, opcje: { force: true } });
    expect(eZapis).toEqual({ rodzaj: 'E', detail: { source: 'gh' }, okno: s.okno });
    expect(bc).toEqual({ rodzaj: 'BC', kanal: 'gh-therapy-sync', wiadomosc: { type: 'update', tabId: 'fikcyjna-karta-1' } });
    expect(s.modul).toEqual(s.okno);
    expect(s.komunikat).toBeNull();
    expect(s.powiadomienia).toEqual(['gh-point-saved']);
    expect(atrapa.idWierszy()).toEqual([idDeterministyczne(0)]);
    // Zapis nie planuje niczego na później: dziennik jest pełny bez echa app.js i bez timerów.
    expect(atrapa.timery.length).toBe(timery);
    expect(atrapa.ostrzezenia).toEqual([]);
  });

  it('usunięcie przyciskiem idzie przez nakładkę potwierdzenia, a bez niej przez re() wprost; oba dają [M, E, BC]', () => {
    for (const nakladkaUsuwania of [true, false]) {
      const atrapa = utworzAtrapeMonitoraGh({ nakladkaUsuwania, ghTherapyCalc: KARTA });
      atrapa.dodajZKarty('start');
      const id = atrapa.stan().okno[0].id;

      const wpisy = atrapa.usun(id);

      expect(rodzaje(wpisy), String(nakladkaUsuwania)).toEqual(['M', 'E', 'BC']);
      expect(wpisy[0].wartosc).toEqual([]);
      expect(atrapa.stan().okno).toEqual([]);
      expect(atrapa.pole('ghDeleteOverlay')).toBeNull();
      expect(atrapa.stan().powiadomienia).toEqual(['gh-point-saved', 'gh-point-deleted']);
    }
  });
});
