import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');

// OBESITY-EDIT-1 (zgłoszenie właściciela 2026-09-13). Monitor leczenia otyłości pozwalał punkt
// tylko DODAĆ albo USUNĄĆ. Poprawka literówki w masie oznaczała skasowanie wizyty i wpisanie jej
// od nowa — a to zrywa powiązania: skarbiec buduje z każdego punktu z dawką wpis na oś czasu
// Karty Pacjenta, podpięty przez `obesityPointId`. Dlatego edycja musi zachować ID.
//
// Reguły, których pilnuje `Ed()` — czystej funkcji scalającej, wyciętej tu z pliku produkcyjnego
// i uruchamianej wprost:
//   • komplet wiek/masa/wzrost, tak samo jak przy dodawaniu;
//   • poprawny rodzaj wizyty;
//   • BRAK drugiego punktu „Włączenie" — kod bierze pierwszy `start` jako punkt odniesienia całej
//     oceny odpowiedzi na leczenie, więc dwa starty po cichu przestawiłyby baseline;
//   • przeliczenie zapisanego `bmi`, które inaczej pojechałoby stare w eksporcie.
//
// Dane wyłącznie FIKCYJNE.

function pomocnik() {
  const src = zrodlo('obesity_therapy_monitor.js');
  const odciecie = (od, doTekstu) => {
    const a = src.indexOf(od);
    expect(a, `nie znaleziono ${od}`).toBeGreaterThan(-1);
    const b = src.indexOf(doTekstu, a);
    expect(b, `nie znaleziono końca po ${od}`).toBeGreaterThan(a);
    return src.slice(a, b);
  };
  // Ed() liczy BMI przez L() i normalizuje nazwy leków przez f() — bierzemy je z tego samego pliku.
  const L = odciecie('function L(t,e)', 'var g=""');
  // f() rozpoznaje pusty wybór po stałej `ft` („– wybierz –"), więc bierzemy ją razem z funkcją.
  const f = odciecie('var ft="', 'function R(t)');
  const Ed = odciecie('function Ed(t,e,n)', 'function Q(t)');
  return new Function(`${L}\n${f}\n${Ed}\nreturn Ed;`)();
}

const Ed = pomocnik();

const PUNKTY = Object.freeze([
  { id: 'p1', type: 'start', ageYears: 13, ageMonths: 0, weight: 92, height: 165, bmi: 33.8, drug: 'Saxenda', substance: 'liraglutide', dose: '3,0 mg', dateISO: '2026-01-10' },
  { id: 'p2', type: 'continue', ageYears: 13, ageMonths: 3, weight: 88, height: 166, bmi: 31.9, drug: 'Saxenda', substance: 'liraglutide', dose: '3,0 mg', dateISO: '2026-04-11' },
]);

const late = (nad = {}) => Object.assign(
  { type: 'continue', ageMonthsTotal: 159, weight: 87.5, height: 166, dose: '3,0 mg', dateISO: '2026-04-11' },
  nad,
);

describe('Monitor otyłości — edycja punktu zachowuje tożsamość rekordu', () => {
  it('identyfikator przeżywa edycję — po nim skarbiec wiąże wpis na osi czasu Karty Pacjenta', () => {
    const w = Ed(PUNKTY, 'p2', late({ weight: 86 }));
    expect(w.ok).toBe(true);
    expect(w.point.id).toBe('p2');
    expect(w.points.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('nie rusza pozostałych punktów ani oryginalnej listy', () => {
    const w = Ed(PUNKTY, 'p2', late({ weight: 86 }));
    expect(w.points[0]).toBe(PUNKTY[0]);
    expect(PUNKTY[1].weight).toBe(88);
  });

  it('przelicza zapisane BMI — inaczej stara wartość pojechałaby w eksporcie', () => {
    const w = Ed(PUNKTY, 'p2', late({ weight: 80, height: 166 }));
    expect(w.point.bmi).toBeCloseTo(29.0, 1);
    expect(w.point.bmi).not.toBe(31.9);
  });

  it('wiek podany w miesiącach rozkłada się na lata i miesiące', () => {
    const w = Ed(PUNKTY, 'p2', late({ ageMonthsTotal: 160 }));
    expect(w.point.ageYears).toBe(13);
    expect(w.point.ageMonths).toBe(4);
  });
});

describe('Monitor otyłości — czego edycja nie przepuści', () => {
  it('drugie „Włączenie" jest odrzucane — baseline musi zostać jeden', () => {
    const w = Ed(PUNKTY, 'p2', late({ type: 'start' }));
    expect(w.ok).toBe(false);
    expect(w.reason).toBe('drugi-start');
  });

  it('ale sam punkt startowy wolno zapisać ponownie jako start', () => {
    const w = Ed(PUNKTY, 'p1', late({ type: 'start', ageMonthsTotal: 156, weight: 91 }));
    expect(w.ok).toBe(true);
    expect(w.point.type).toBe('start');
    expect(w.wasBaseline).toBe(true);
  });

  it('brak masy, wzrostu albo wieku zatrzymuje zapis — ta sama reguła co przy dodawaniu', () => {
    expect(Ed(PUNKTY, 'p2', late({ weight: 0 })).reason).toBe('braki');
    expect(Ed(PUNKTY, 'p2', late({ height: Number.NaN })).reason).toBe('braki');
    expect(Ed(PUNKTY, 'p2', late({ ageMonthsTotal: 0 })).reason).toBe('braki');
  });

  it('nieznany rodzaj wizyty nie przechodzi', () => {
    expect(Ed(PUNKTY, 'p2', late({ type: 'inny' })).reason).toBe('zly-rodzaj');
    expect(Ed(PUNKTY, 'p2', late({ type: '' })).reason).toBe('zly-rodzaj');
  });

  it('punkt spoza listy nie tworzy nowego wpisu po cichu', () => {
    const w = Ed(PUNKTY, 'nieistniejacy', late());
    expect(w.ok).toBe(false);
    expect(w.reason).toBe('brak-punktu');
  });

  it('mówi, czy ruszany punkt był odniesieniem — po to, by zapytać przed przeliczeniem oceny', () => {
    expect(Ed(PUNKTY, 'p1', late({ type: 'continue' })).wasBaseline).toBe(true);
    expect(Ed(PUNKTY, 'p2', late()).wasBaseline).toBe(false);
  });
});

describe('Monitor otyłości — pola tekstowe punktu', () => {
  it('wyczyszczona dawka zapisuje się jako pusta, nie jako „undefined"', () => {
    const w = Ed(PUNKTY, 'p2', late({ dose: '' }));
    expect(w.point.dose).toBe('');
  });

  it('wyczyszczona data zapisuje się jako pusta', () => {
    const w = Ed(PUNKTY, 'p2', late({ dateISO: '' }));
    expect(w.point.dateISO).toBe('');
  });

  it('lek i substancja idą przez tę samą normalizację, co przy dodawaniu', () => {
    const w = Ed(PUNKTY, 'p2', late({ drug: '– wybierz –', substance: '  liraglutide  ' }));
    expect(w.point.drug).toBe('');
    expect(w.point.substance).toBe('liraglutide');
  });

  it('pominięte lek i substancja zostają bez zmian', () => {
    const w = Ed(PUNKTY, 'p2', late());
    expect(w.point.drug).toBe('Saxenda');
    expect(w.point.substance).toBe('liraglutide');
  });
});
