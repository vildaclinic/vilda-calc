process.env.TZ = 'Europe/Warsaw';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-NOTATKI rata 3c (audyt „Dodaj notatkę do wizyty", pozycja G33).
//
// Terminarz ma DWA wejścia do pełnego edytora notatki i żadne nie miało strażnika.
//
// 1. Routing „✎ Edytuj" — funkcja Bn rozstrzyga, czy wpis dostaje szybki modal „Edytuj termin"
//    (#tzNewTermOverlay), czy pełny arkusz VildaAuthUI.showPatientNoteEditor. Bn === true to
//    szybki modal; Bn === false — czyli wpis MA kotwicę wieku albo datę zdarzenia — to pełny
//    edytor, bo szybki modal nie ma tych pól i po cichu by je zgubił. Audyt odczytał tę bramkę
//    ODWROTNIE. Pułapka: linkedAgeMonths === 0 (noworodek, G9 z raty 2) też jest kotwicą,
//    bo `0 != null` jest prawdą — i to jest przypadek, którego nikt nie sprawdzał.
//    Bn nie było w hooku __internals, więc nie dało się jej w ogóle przetestować.
//
// 2. Przycisk „Pełny edytor →" przekazywał ładunek bez `dueTime` i `durationMin`: godzina
//    i długość wizyty wpisane w szybkim modalu ginęły bez słowa.
//
// Ten plik ładuje PRAWDZIWY vilda_terminarz.js do fałszywego okna bez DOM (wzorzec
// z terminarz-daty.test.mjs) dla punktu 1, a punkt 2 pilnuje na źródle — handler
// przycisku siedzi w domknięciu modalu, którego bez DOM nie da się otworzyć.

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TERMINARZ = fs.readFileSync(path.join(repositoryRoot, 'vilda_terminarz.js'), 'utf8');

function loadTerminarz() {
  const win = {
    document: {
      readyState: 'complete',
      getElementById() { return null; },
      addEventListener() {},
    },
  };
  win.window = win;
  loadBrowserScript('vilda_terminarz.js', win);
  if (!win.VildaTerminarz || !win.VildaTerminarz.__internals) {
    throw new Error('vilda_terminarz.js nie wystawił window.VildaTerminarz.__internals');
  }
  return win;
}

const I = loadTerminarz().VildaTerminarz.__internals;

describe('G33 — bramka Bn rozstrzyga, który edytor otwiera „Edytuj"', () => {
  it('jest wystawiona w hooku testowym (przed ratą 3c w ogóle nie dało się jej sprawdzić)', () => {
    expect(typeof I.Bn).toBe('function');
  });

  // true = szybki modal „Edytuj termin"; false = pełny arkusz notatki.
  const przypadki = [
    ['brak wpisu', null, false],
    ['pusty obiekt bez id', {}, false],
    ['zwykły termin pacjenta', { id: 'x' }, true],
    ['zajęcie (nie jest notatką pacjenta)', { id: 'x', isActivity: true }, false],
    ['wpis bez kotwicy wieku', { id: 'x', linkedAgeMonths: null }, true],
    ['NOWORODEK: kotwica 0 mies. (G9) to też kotwica', { id: 'x', linkedAgeMonths: 0 }, false],
    ['kotwica 108 mies.', { id: 'x', linkedAgeMonths: 108 }, false],
    ['data zdarzenia', { id: 'x', clinicalDateISO: '2026-01-15' }, false],
    ['pusta data zdarzenia nie jest datą', { id: 'x', clinicalDateISO: '' }, true],
    ['wpis bez id (jeszcze niezapisany)', { linkedAgeMonths: null }, false],
  ];

  for (const [nazwa, wpis, oczekiwane] of przypadki) {
    it(`${nazwa} → ${oczekiwane ? 'szybki modal' : 'pełny edytor'}`, () => {
      expect(I.Bn(wpis)).toBe(oczekiwane);
    });
  }
});

describe('G33 — „Pełny edytor →" nie gubi godziny i długości wizyty', () => {
  // Handler siedzi w domknięciu modalu; bez DOM nie da się go wywołać, więc pilnujemy źródła.
  const handler = () => {
    const i = TERMINARZ.indexOf('var F=o?Object.assign({},o):{},O=Object.assign(F,{title:');
    expect(i, 'ładunek dla showPatientNoteEditor').toBeGreaterThan(0);
    return TERMINARZ.slice(i, i + 1400);
  };

  it('ładunek niesie dueTime i durationMin', () => {
    const h = handler();
    expect(h).toContain('O.dueTime=it.value');
    expect(h).toContain('O.durationMin=J>=5&&J<=240?J:30');
  });

  it('używa tej samej bramki kategorii i tego samego formatu godziny, co „Zapisz termin"', () => {
    const h = handler();
    expect(h).toContain('$a(h)&&it&&/^([01]\\d|2[0-3]):[0-5]\\d$/.test(it.value||"")');
    // Ten sam wzorzec w ścieżce zapisu terminu — jedno źródło reguł, nie dwie kopie.
    expect(TERMINARZ).toContain('$a(h)&&it&&/^([01]\\d|2[0-3]):[0-5]\\d$/.test(it.value||"")){M.dueTime=it.value');
  });

  it('wymaga daty przypomnienia — inaczej nie wysyła pary, którą walidacja G24 i tak by zatrzymała', () => {
    expect(handler()).toContain('if(O.dueDateISO&&$a(h)');
  });

  it('gałąź else zeruje OBA pola, także przeniesione z edytowanego wpisu', () => {
    expect(handler()).toContain('else O.dueTime=null,O.durationMin=null;');
  });

  it('nie zapisuje preferencji długości — ta ścieżka jeszcze niczego nie zapisała', () => {
    const h = handler();
    expect(h).not.toContain('Sn(');
    // Kontrola pozytywna: „Zapisz termin" preferencję zapisuje i to zostaje bez zmian.
    expect(TERMINARZ).toContain('M.durationMin=Se,Sn(Se)');
  });
});

describe('G33 — sprostowanie audytu: stopka z „Pełny edytor →" w trybach bez pacjenta', () => {
  it('jest ukrywana dla Zajęcia i Nieobecności, więc komunikat o osobie spoza bazy zostaje prawdziwy', () => {
    // Audyt twierdził, że przycisk odmawia „nie tym powodem" w trybach bez pacjenta.
    // Zmierzone: ua() chowa całą stopkę .tz-modal__footnote, więc przycisku tam nie ma.
    expect(TERMINARZ).toContain('we&&(we.style.display=F?"none":"")');
    expect(TERMINARZ).toContain('.tz-modal__footnote');
    expect(TERMINARZ).toContain('s=r?"absence":n?"activity":"patient"');
  });
});
