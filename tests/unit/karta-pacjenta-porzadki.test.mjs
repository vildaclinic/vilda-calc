import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Rata D z audytu sekcji „Pacjenci" — części, których nie widać z poziomu kliknięć:
// unieważnianie pamięci podręcznej karty (P4) i cel nasłuchu zdarzenia synchronizacji.
//
// `vilda:sync-merged` jest wysyłane przez vilda_sync.js na `document`, z `bubbles:false`.
// Nasłuch powieszony na oknie nigdy się nie odezwie — a taki właśnie odświeżał kartę
// „Przypomnienia". To ta sama pomyłka, którą trzeba było ominąć przy naprawie P1.
//
// Zachowanie na żywych ekranach mierzy tests/e2e/karta-pacjenta-porzadki.spec.mjs.

const bezKomentarzy = (nazwa) => readFileSync(path.join(repoRoot, nazwa), 'utf8')
  .split('\n')
  .filter((w) => !/^\s*\/\//.test(w))
  .join('\n');

const kod = bezKomentarzy('vilda_auth_ui.js');

describe('P1 — nasłuch zmian z zewnątrz', () => {
  it('zdarzenie synchronizacji jest odbierane na document, nie na oknie', () => {
    const naOknie = kod.match(/(?<!\.document)\.addEventListener\("vilda:sync-merged"/g) || [];
    expect(naOknie.length,
      'bubbles:false — nasłuch na oknie nigdy się nie odezwie').toBe(0);
    expect(kod).toContain('i.document.addEventListener("vilda:sync-merged",Gd7)');
  });

  it('odświeżenie odtwarza ekran, na którym stoi lekarz', () => {
    expect(kod).toContain('if(t.screen==="card"&&t.patientId){se(t.patientId,le.onPick,le.listOptions,{activeTab:t.tab||"antro",_navRestore:!0});return}');
    expect(kod).toContain('if(t.screen==="list"){Be(le.onPick,le.listOptions,!0);return}');
  });

  it('nie przerywa otwartego okna dialogowego', () => {
    expect(kod, 'render pod modalem zabrałby lekarzowi wpisywane dane')
      .toContain('if(i.document.querySelector(".vilda-auth-overlay-sheet"))return');
  });
});

describe('P4 — pamięć podręczna karty', () => {
  it('jest unieważniana przy zmianie z zewnątrz', () => {
    expect(kod, 'xa trzyma gotowy DOM; bez tego powrót celowo odtwarzał stary widok')
      .toContain('function Gd9(){try{xa=null;');
  });
});

describe('drobne', () => {
  it('P2 — żeton terminu rozróżnia zaległość', () => {
    expect(kod.includes('text:(M.status==="overdue","Termin: "+M.label)'),
      'operator przecinkowy: porównanie liczone i wyrzucane').toBe(false);
    expect(kod).toContain('text:(M.status==="overdue"?"Zaleg\\u0142y termin: ":"Termin: ")+M.label');
  });

  it('P6 — techniczny prefiks nie trafia na ekran', () => {
    expect(kod).toContain('a=a.replace(/^[A-Za-z_$][A-Za-z0-9_$]*:\\s*/,"").trim()');
    expect(kod, 'komunikat wchodzi przez filtr, nie prosto z wyjątku').toContain('catch(Vt){Gd3(Gd0(Vt))}');
  });

  it('P7 — długość wizyty jest sprawdzana przed zapisem', () => {
    expect(kod).toContain('if(!isFinite(Gd2)||Gd2<5||Gd2>1440){Gd3("D\\u0142ugo\\u015B\\u0107 wizyty podaj w minutach, od 5 do 1440.")');
  });

  it('P8 — wynik nieliczbowy zapowiada się jako tekst', () => {
    expect(kod).toContain('na wykres trendu trafiaj\\u0105 tylko warto\\u015Bci liczbowe');
    expect(kod, 'ten sam wzorzec, którym sejf decyduje o valueNum')
      .toContain('Gd4.style.display=Te!==""&&!/^[0-9]+([.,][0-9]+)?$/.test(Te)?"block":"none"');
  });

  it('P11 — „Klirens" ma chip i wygrywa z labResult', () => {
    expect(kod).toContain('{id:"wynik-klirens",label:"Klirens"}');
    expect(kod).toContain('function Yr(t){return t?t.category==="wynik-klirens"?"wynik-klirens":t.medication?"treatment"');
  });

  it('P12 — przejście z Historii wskazuje wpis i nie używa alert()', () => {
    expect(kod.includes('else try{i.alert(f.title+(f.description?`\n\n`+f.description:""))}catch{}'),
      'surowy alert() przeglądarki dla obserwacji').toBe(false);
    expect(kod).toContain('L.click(),f.noteId&&Gd6(f.noteId)');
    expect(kod).toContain('else Gd5(f.title||"Wpis",f.description||"")');
    expect(kod, 'karta notatki niesie swój identyfikator').toContain('"data-note-id":S.id||""');
  });
});
