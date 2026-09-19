import { describe, expect, it } from 'vitest';
import { bezKomentarzy, funkcjaZ, zrodlo } from '../support/silnik-bmi.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-LEK (2026-09-18, decyzja właściciela „napraw to").
//
// Edycja punktu leczenia w monitorze terapii otyłości nie przywracała wyboru leku:
// Ee() wypełniało wiek, masę, wzrost, dawkę i datę, ale NIE listę „obesityMonDrug".
// Eb() przy zapisie bezwarunkowo czytało bieżący stan tej listy, więc poprawka masy
// nadpisywała preparat tym, co akurat było wybrane — albo kasowała go, gdy lista stała
// na podpowiedzi. Kryteria odpowiedzi wg ChPL różnią się między preparatami, więc
// podmieniony lek zmienia próg, według którego oceniana jest skuteczność terapii.

const MON = zrodlo('obesity_therapy_monitor.js');
const TER = zrodlo('obesity_therapy.js');

describe('P-LEK — edycja punktu przywraca zapisany lek', () => {
  it('Ee() ustawia listę leku, zanim cokolwiek się przeliczy', () => {
    const f = bezKomentarzy(funkcjaZ(MON, 'Ee'));
    expect(f, 'lek wraca z punktu').toContain('Eg(e.drug,e.substance)');
    const iEw = f.indexOf('Eg(e.drug,e.substance)');
    const iEu = f.indexOf('Eu()');
    expect(iEw, 'Ew przed Eu — przeliczenie widzi właściwy lek').toBeLessThan(iEu);
  });

  it('zapis nie kasuje preparatu, gdy lista go nie pokazuje', () => {
    // Np. etykieta preparatu zmieniła brzmienie i dopasowanie nie znalazło opcji.
    const f = funkcjaZ(MON, 'Eh');
    expect(f).toContain('if(!Es||f(t.drug)||f(t.substance))return t');
    expect(f, 'zapas bierze lek z edytowanego punktu').toContain('String(n.id)===String(Es)');
    expect(funkcjaZ(MON, 'Eb'), 'zapis idzie przez Eh, nie przez goły ht').toContain('h=Eh()');
  });

  it('jest JEDEN dopasowywacz opcji leku, nie dwie kopie', () => {
    // Ep() (podpowiedź kontynuacji) miało własną, identyczną pętlę po opcjach.
    expect(MON).toContain('function Eg(t,e)');
    expect(funkcjaZ(MON, 'Ep'), 'kontynuacja używa tego samego').toContain('Eg(h.drug,h.substance)');
    const petle = (MON.match(/getAttribute\("data-substance"\)/g) || []).length;
    expect(petle, 'dopasowanie po data-substance tylko w Ew i w ht (odczyt wybranej opcji)').toBe(2);
  });

  it('Eg() nie zgaduje: bez nazwy i bez substancji nie rusza listy', () => {
    const f = funkcjaZ(MON, 'Eg');
    expect(f).toContain('if(!o&&!r)return!1');
    expect(f, 'oddaje informację, czy dopasowało').toContain('return!0');
  });

  it('nowy pomocnik nie przesłonił istniejącej funkcji', () => {
    // Plik używa krótkich nazw E*; pierwsza wersja tej poprawki nazwała matcher „Ew",
    // a Ew() już istniało i wpina przycisk podpowiedzi — przycisk przestał działać.
    // Złapał to e2e OBESITY-PREFILL-1. Strażnik pilnuje, że oryginał żyje.
    expect(MON, 'Ew() nadal wpina przycisk podpowiedzi').toContain('function Ew(){var t=c("obesityPrefillBtn")');
    expect(MON, 'i nadal jest wołane przy starcie modułu').toMatch(/U\(\),Ew\(\)/);
  });
});

describe('P-LEK — dlaczego to jest błąd kliniczny, a nie kosmetyczny', () => {
  it('kryteria odpowiedzi wg ChPL różnią się między preparatami', () => {
    // Gdyby wszystkie leki miały ten sam próg, podmiana preparatu nie zmieniałaby oceny.
    // Ten test utrwala, że tak NIE jest — i dlatego integralność zapisu ma znaczenie.
    //
    // P-CHPL (2026-09-19): do SW 1.1.9 test wyłuskiwał progi regexem z tekstu
    // `obesity_therapy.js`, bo warstwa UI trzymała tam własne kopie reguł. Kopie zniknęły
    // (jedynym źródłem jest `obesity_response_criteria.js`), więc ta sama teza jest teraz
    // sprawdzana na danych produkcyjnych zamiast na zminifikowanym napisie.
    const K = loadBrowserScript('obesity_response_criteria.js', {}).ObesityResponseCriteria;
    const dorosli = ['Wegovy', 'Saxenda', 'Mysimba', 'Mounjaro']
      .map((nazwa) => K.getCriterion(nazwa, '', 40).group);

    const progi = new Set(dorosli.map((g) => String(g.thresholdPct)));
    expect(progi.size, 'co najmniej dwa różne progi odpowiedzi').toBeGreaterThanOrEqual(2);
    const okna = new Set(dorosli.map((g) => String(g.windowWeeks)));
    expect(okna.size, 'co najmniej dwa różne okna oceny').toBeGreaterThanOrEqual(2);
    // Dwa preparaty nie mają w ChPL progu w ogóle — podmiana leku potrafi więc nie tylko
    // przesunąć próg, ale całkiem zdjąć ocenę automatyczną. Tym bardziej zapis musi trzymać lek.
    expect(dorosli.filter((g) => g.thresholdPct === null), 'Wegovy i Mounjaro bez progu').toHaveLength(2);

    expect(TER, 'liraglutyd').toContain('Liraglutyd');
    expect(TER, 'semaglutyd').toContain('Semaglutyd');
  });

  it('punkt leczenia nadal niesie preparat i substancję osobno', () => {
    // Substancja jest tym, co wiąże punkt z kryterium; nazwa handlowa jest dla człowieka.
    expect(funkcjaZ(MON, 'ht')).toContain('substance:f(n&&n.getAttribute&&n.getAttribute("data-substance")');
    expect(funkcjaZ(MON, 'Eb')).toContain('drug:h.drug,substance:h.substance');
  });
});
