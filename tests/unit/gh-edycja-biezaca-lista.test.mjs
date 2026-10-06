import { describe, expect, it } from 'vitest';
import { rodzaje, utworzAtrapeMonitoraGh } from '../support/gh-monitor-atrapa.mjs';

// P-GH-EDYCJA-LISTA. Niezmienniki edycji punktu terapii GH w PRAWDZIWYM monitorze (gh_therapy_monitor.js):
// edycja dotyczy wyłącznie punktu z bieżącej listy pacjenta sesji karty, przy którym ją otwarto. Gdy punktu
// nie ma na liście albo pacjent sesji karty jest inny (oba znaczniki niepuste), edycja kończy się bez zmiany
// danych, a zapis takiej edycji kończy się komunikatem, bez zapisu. Odświeżenie tej samej listy u tego samego
// pacjenta edycję zachowuje. Atrapa przeglądarki: tests/support/gh-monitor-atrapa.mjs. Dane wyłącznie FIKCYJNE.

const NIE_ZAPISANO = 'Nie zapisano zmian: edytowany punkt nie należy do bieżącej listy punktów. Otwórz edycję ponownie.';

// Karta po przeliczeniu dla pól domyślnych atrapy: Omnitrope 10 mg, 0,025 mg/kg/d × 32 kg = 0,8 mg/d.
const KARTA = { drug: 'Omnitrope 10 mg', weight: 32, perDayMg: 0.8, perWeekMg: 5.6 };

const punkt = (id, type, nadpisania = {}) => ({
  id, type, ageYears: 9, ageMonths: 0, weight: 32, height: 130, boneAge: null, dose: 0.025, doseUnit: 'mg/kg/d',
  drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.8,
  ...nadpisania,
});
const WLACZENIE = punkt('fikc-start', 'start');
const KONTYNUACJA = punkt('fikc-kont', 'continue', { ageYears: 10, weight: 36, height: 138, doseAbs: 0.9 });

const zapisy = (wpisy) => wpisy.filter((w) => w.rodzaj === 'M' || w.rodzaj === 'RM' || w.rodzaj === 'BC');
const api = (atrapa) => atrapa.win.vildaGhTherapyMonitorPersistApi;
const odswiez = (atrapa) => atrapa.zdarzenieOkna('storage', { key: 'ghTherapyPoints' });
const ustawPacjenta = (atrapa, id) => {
  if (id === null) atrapa.win.sessionStorage.removeItem('vildaCurrentPatientId');
  else atrapa.win.sessionStorage.setItem('vildaCurrentPatientId', id);
};

describe('edycja zapisuje wyłącznie punkt obecny na bieżącej liście', () => {
  it('punktu nie ma już na liście: komunikat, bez zapisu modułu i kanału; lista, moduł i tabela bez zmian', () => {
    const atrapa = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, KONTYNUACJA], ghTherapyCalc: KARTA });
    atrapa.edytuj(KONTYNUACJA.id, { ghEditHeight: '139' });
    // Lista tej karty zmieniła się bez odświeżenia monitora (inna ramka, ten sam pacjent).
    atrapa.ustawModul([WLACZENIE]);
    const od = atrapa.dziennik.length;

    atrapa.kliknij('btnGhContinue');

    const wpisy = atrapa.dziennik.slice(od);
    expect(rodzaje(wpisy)).toEqual(['E', 'K']);
    expect(wpisy.at(-1)).toEqual({ rodzaj: 'K', naglowek: 'Informacja', tekst: NIE_ZAPISANO });
    const s = atrapa.stan();
    expect(s.okno).toEqual([WLACZENIE]);
    expect(s.modul).toEqual([WLACZENIE]);
    expect(atrapa.idWierszy()).toEqual([WLACZENIE.id]);
    expect(s.edycjaWidoczna).toBe(false);
    expect(api(atrapa).captureState()).toBeNull();
  });

  it('po odmowie edycja jest zakończona: następny przycisk dodaje nowy punkt z karty, z nowym id', () => {
    const atrapa = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, KONTYNUACJA], ghTherapyCalc: KARTA });
    atrapa.edytuj(KONTYNUACJA.id, { ghEditHeight: '139' });
    atrapa.ustawModul([WLACZENIE]);
    atrapa.kliknij('btnGhContinue');
    atrapa.zamknijKomunikat();
    const od = atrapa.dziennik.length;

    atrapa.kliknij('btnGhContinue');

    expect(rodzaje(atrapa.dziennik.slice(od))).toEqual(['E', 'M', 'E', 'BC']);
    const s = atrapa.stan();
    expect(s.okno).toHaveLength(2);
    expect(s.okno[0]).toEqual(WLACZENIE);
    expect(s.okno[1].id).not.toBe(KONTYNUACJA.id);
    expect(s.okno[1]).toMatchObject({ type: 'continue', ageYears: 10, ageMonths: 3, weight: 32, height: 141, doseAbs: 0.8 });
    expect(s.modul).toEqual(s.okno);
  });

  it('ta sama lista u tego samego pacjenta, także po odświeżeniu monitora: zapis w miejscu (ten sam id i pozycja)', () => {
    const atrapa = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, KONTYNUACJA] });
    ustawPacjenta(atrapa, 'fikc-pacjent-1');
    atrapa.edytuj(KONTYNUACJA.id, { ghEditHeight: '139' });
    expect(rodzaje(odswiez(atrapa))).toEqual(['E']);
    expect(api(atrapa).captureState()).toMatchObject({ currentEditingId: KONTYNUACJA.id });
    const od = atrapa.dziennik.length;

    atrapa.kliknij('btnGhContinue');

    expect(rodzaje(atrapa.dziennik.slice(od))).toEqual(['E', 'M', 'E', 'BC']);
    const s = atrapa.stan();
    expect(s.okno.map((p) => p.id)).toEqual([WLACZENIE.id, KONTYNUACJA.id]);
    expect(s.okno[1]).toMatchObject({ id: KONTYNUACJA.id, type: 'continue', height: 139 });
    expect(s.komunikat).toBeNull();
  });
});

describe('stan edycji kończy się, gdy punktu nie ma na liście', () => {
  it('odświeżenie listy bez edytowanego punktu: formularz schowany, stan edycji pusty, bez zapisu modułu i kanału', () => {
    const atrapa = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, KONTYNUACJA] });
    atrapa.edytuj(KONTYNUACJA.id);
    expect(atrapa.stan().edycjaWidoczna).toBe(true);
    atrapa.ustawModul([WLACZENIE]);

    const wpisy = odswiez(atrapa);

    expect(rodzaje(wpisy)).toEqual(['E']);
    const s = atrapa.stan();
    expect(s.edycjaWidoczna).toBe(false);
    expect(s.modul).toEqual([WLACZENIE]);
    expect(atrapa.pole('ghEditNotice')).toBeNull();
    expect(atrapa.pole('ghEditOverlay')).toBeNull();
    expect(api(atrapa).captureState()).toBeNull();
  });

  it('usunięcie edytowanego punktu kończy edycję; usunięcie innego punktu jej nie kończy', () => {
    const inny = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, KONTYNUACJA] });
    inny.edytuj(KONTYNUACJA.id);
    inny.usun(WLACZENIE.id);
    expect(inny.stan().edycjaWidoczna).toBe(true);
    expect(api(inny).captureState()).toMatchObject({ currentEditingId: KONTYNUACJA.id });

    const ten = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, KONTYNUACJA] });
    ten.edytuj(KONTYNUACJA.id);
    const wpisy = ten.usun(KONTYNUACJA.id);

    expect(zapisy(wpisy).map((w) => w.rodzaj)).toEqual(['M', 'BC']);
    expect(ten.stan().okno).toEqual([WLACZENIE]);
    expect(ten.stan().edycjaWidoczna).toBe(false);
    expect(api(ten).captureState()).toBeNull();
  });

  it('inny pacjent sesji karty przy tych samych id punktów: edycja kończy się; pusty znacznik przy otwarciu albo teraz jej nie kończy', () => {
    const inny = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, KONTYNUACJA] });
    ustawPacjenta(inny, 'fikc-pacjent-1');
    inny.edytuj(KONTYNUACJA.id);
    ustawPacjenta(inny, 'fikc-pacjent-2');
    // Stan edycji nie jest utrwalany pod innym pacjentem jeszcze przed odświeżeniem listy.
    expect(api(inny).captureState()).toBeNull();

    expect(zapisy(odswiez(inny))).toEqual([]);
    expect(inny.stan().edycjaWidoczna).toBe(false);
    expect(inny.stan().modul).toEqual([WLACZENIE, KONTYNUACJA]);

    // Zapasowo zmienna okna, gdy sesja karty nie zna pacjenta.
    const okno = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, KONTYNUACJA] });
    okno.win._vildaCurrentPatientId = 'fikc-pacjent-1';
    okno.edytuj(KONTYNUACJA.id);
    okno.win._vildaCurrentPatientId = 'fikc-pacjent-2';
    odswiez(okno);
    expect(okno.stan().edycjaWidoczna).toBe(false);

    for (const [przyOtwarciu, teraz] of [[null, 'fikc-pacjent-1'], ['fikc-pacjent-1', null]]) {
      const atrapa = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, KONTYNUACJA] });
      ustawPacjenta(atrapa, przyOtwarciu);
      atrapa.edytuj(KONTYNUACJA.id);
      ustawPacjenta(atrapa, teraz);
      odswiez(atrapa);
      expect(atrapa.stan().edycjaWidoczna, `${przyOtwarciu} → ${teraz}`).toBe(true);
      expect(api(atrapa).captureState(), `${przyOtwarciu} → ${teraz}`).toMatchObject({ currentEditingId: KONTYNUACJA.id });
    }
  });
});

describe('odtworzenie stanu nie wpisuje pól punktu spoza listy', () => {
  const POLA = { age: '5', ageMonths: '2', weight: '20', height: '110', dose: '0.5', drug: 'Omnitrope 5 mg' };

  it('punktu nie ma na liście: wynik true jak dotąd, pola edycji puste, formularz schowany, bez zapisu', () => {
    const atrapa = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE] });
    atrapa.wyczyscDziennik();

    expect(api(atrapa).restoreState({ currentEditingId: 'fikc-nieobecny', fields: POLA })).toBe(true);

    expect(zapisy(atrapa.dziennik)).toEqual([]);
    expect(atrapa.stan().edycjaWidoczna).toBe(false);
    for (const id of ['ghEditAge', 'ghEditAgeMonths', 'ghEditWeight', 'ghEditHeight', 'ghEditDose']) {
      expect(atrapa.pole(id).value, id).toBe('');
    }
    expect(api(atrapa).captureState()).toBeNull();
    expect(atrapa.stan().modul).toEqual([WLACZENIE]);
  });

  it('trwająca edycja innego punktu zostaje przy własnych polach', () => {
    const atrapa = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE] });
    atrapa.edytuj(WLACZENIE.id, { ghEditWeight: '33' });

    expect(api(atrapa).restoreState({ currentEditingId: 'fikc-nieobecny', fields: POLA })).toBe(true);

    expect(atrapa.pole('ghEditWeight').value).toBe('33');
    expect(api(atrapa).captureState()).toMatchObject({ currentEditingId: WLACZENIE.id, fields: { weight: '33' } });
  });

  it('punkt jest na liście: edycja otwarta i pola wpisane jak dotąd', () => {
    const atrapa = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE] });

    expect(api(atrapa).restoreState({ currentEditingId: WLACZENIE.id, fields: { weight: '34', height: '131' } })).toBe(true);

    expect(atrapa.stan().edycjaWidoczna).toBe(true);
    expect(atrapa.pole('ghEditOverlay')).toBeNull();
    expect(atrapa.pole('ghEditWeight').value).toBe('34');
    expect(atrapa.pole('ghEditHeight').value).toBe('131');
    expect(api(atrapa).captureState()).toMatchObject({ currentEditingId: WLACZENIE.id });
    expect(atrapa.stan().modul).toEqual([WLACZENIE]);
  });
});
