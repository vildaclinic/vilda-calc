import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { znajdzNaruszenia, dotyczyReguly } from '../scripts/regula-nazwisk-testowych.mjs';

// P-NOTATKI rata 3 — trzy drobne długi z audytu „Dodaj notatkę do wizyty", które łączy jedno:
// każdy da się cofnąć jednym nieuważnym znakiem, a żaden nie ma innego strażnika.
//
// G26 — dziennik dostępu zapisywał „Utworzenie notatki" z `noteId:null`, bo id brał z ładunku
//       wejściowego (`Vt.id`), a to ustawia wyłącznie gałąź edycji. Wiersz w Ustawieniach
//       nie miał więc czym wskazać notatki, której dotyczy.
// G29 — pola tekstowe arkusza notatki nie miały `spellcheck="false"` ani `autocomplete="off"`,
//       choć pozostałe pola pacjenta w tym samym pliku je mają: treść kliniczna była podkreślana
//       przez słownik przeglądarki i uzupełniana z historii formularzy.
// G31 — cudzysłów polski otwierany „ i zamykany ASCII " w oknach i podpowiedziach notatek,
//       skrót „mc." w miejscu, w którym cała aplikacja pisze „mies.", i jeden komunikat bramki,
//       który omijał jedno źródło tekstów (VildaSession.TOOLTIPS.visitNote).
//
// Asercje czytają SUROWE źródło zminifikowane, więc polskie znaki są tu w formie escape'ów —
// dokładnie tak, jak leżą w pliku.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => readFileSync(path.join(korzen, plik), 'utf8');
const ui = zrodlo('vilda_auth_ui.js');
const mostek = zrodlo('vilda_session_bridge.js');
const bramka = zrodlo('custom-fixes.js');
const chrom = zrodlo('vilda_chrome.js');

describe('G26 — dziennik dostępu zna id utworzonej notatki', () => {
  it('bierze id z wyniku sejfu, nie z ładunku wejściowego', () => {
    expect(ui).toContain('noteId:Gc3&&Gc3.id?Gc3.id:Vt.id||null');
    expect(ui, 'stara postać nie może wrócić').not.toContain('note.create",{patientId:Vt.patientId||null,noteId:Vt.id||null}');
  });

  it('nadal jest dokładnie jedno wywołanie dziennika przy zapisie notatki', () => {
    expect(ui.split('VildaAuditLog.log(n?"note.edit":"note.create"').length - 1).toBe(1);
  });
});

describe('G29 — pola tekstowe arkusza notatki nie gadają z przeglądarką', () => {
  // Ciało `ga()` wycinamy po znaczniku nakładki, żeby nie liczyć pól z innych ekranów pliku.
  const start = ui.indexOf('vilda-patient-note-editor-overlay');
  const cialo = ui.slice(start, start + 40000);

  const POLA = [
    'b3-med-name', 'b3-med-previous-dose', 'b3-med-dose', 'b3-med-dose-num',
    'b3-med-dose-unit', 'b3-lab-test', 'b3-lab-value', 'b3-lab-unit', 'b3-lab-norm',
  ];
  for (const klasa of POLA) {
    it(`pole .${klasa} ma autocomplete=off i spellcheck=false`, () => {
      const i = cialo.indexOf(`class:"vilda-auth-input ${klasa}"`);
      expect(i, `pole ${klasa} musi być w arkuszu notatki`).toBeGreaterThan(0);
      const literal = cialo.slice(Math.max(0, i - 220), i);
      expect(literal, `${klasa}: autocomplete`).toContain('autocomplete:"off"');
      expect(literal, `${klasa}: spellcheck`).toContain('spellcheck:"false"');
    });
  }

  it('tytuł i treść notatki też', () => {
    expect(ui).toContain('E=e("input",{type:"text",autocomplete:"off",spellcheck:"false",class:"vilda-auth-input",placeholder:"np. Wprowadzono Euthyrox"');
    expect(ui).toContain('e("textarea",{autocomplete:"off",spellcheck:"false",class:"vilda-auth-input"');
  });

  it('pola nieliterowe zostają nietknięte — to nie jest zamiatanie atrybutu po całym pliku', () => {
    // Data zdarzenia klinicznego: input[type=date] bez tych atrybutów.
    expect(ui).toContain('ce=e("input",{type:"date",class:"vilda-auth-input b3-clinical-date"');
  });

  it('nie rusza atrybutu list, więc podpowiedzi leków i badań z sejfu żyją dalej', () => {
    expect(cialo).toContain('class:"vilda-auth-input b3-med-name",list:');
    expect(cialo).toContain('class:"vilda-auth-input b3-lab-test",list:');
  });
});

describe('G31 — typografia i jedno źródło tekstów bramki', () => {
  it('okno usunięcia notatki zamyka cudzysłów', () => {
    expect(ui).toContain('Usun\\u0105\\u0107 notatk\\u0119 \\u201E"+ut+\'\\u201D? Akcja propaguje');
  });

  it('pusta lista notatek i podpowiedź Historii też', () => {
    expect(ui).toContain('Kliknij \\u201E+ Dodaj notatk\\u0119\\u201D, aby zapisa\\u0107');
    expect(ui).toContain('sekcja \\u201ENotatki og\\xF3lne\\u201D.');
  });

  it('wszystkie sześć kopii zdania bramki ma domknięty cudzysłów', () => {
    const domkniete = 'z listy \\u201EPacjenci\\u201D lub zapisz nowego pacjenta (\\u201EZapisz dane\\u201D)';
    const niedomkniete = 'z listy \\u201EPacjenci" lub zapisz nowego pacjenta (\\u201EZapisz dane")';
    const ile = (s, igla) => s.split(igla).length - 1;
    expect(ile(mostek, domkniete) + ile(bramka, domkniete) + ile(chrom, domkniete)).toBe(6);
    expect(ile(mostek, niedomkniete) + ile(bramka, niedomkniete) + ile(chrom, niedomkniete)).toBe(0);
  });

  it('edytor mówi „mies.", nie „mc."', () => {
    expect(ui).not.toContain('Kontrola TSH za 6 mc.');
    expect(ui.split('Kontrola TSH za 6 mies.').length - 1).toBe(2);
  });

  it('komunikat „brak wieku i pomiaru" ma jedno źródło', () => {
    expect(mostek).toContain('noAgeOrMeasure:"Wpisz wiek oraz wzrost lub mas\\u0119 cia\\u0142a');
    expect(bramka).toContain('.noAgeOrMeasure');
    expect(bramka, 'stary tekst poza jednym źródłem nie wraca')
      .not.toContain('"Wpisz wiek + wzrost lub wag\\u0119, aby kotwiczy\\u0107 notatk\\u0119 do wizyty."');
  });

  it('bramka mówi jednym słownikiem: „masę ciała", nie „wagę"', () => {
    expect(mostek).toContain('noMeasure:"Wpisz wzrost lub mas\\u0119 cia\\u0142a');
    expect(bramka).toContain('Qt0.noMeasure||"Wpisz wzrost lub mas\\u0119 cia\\u0142a');
  });
});

describe('G32 — pozycje menu bocznego pod klawiaturą', () => {
  it('spacja składa się w kliknięcie, Enter zostaje natywny', () => {
    expect(chrom).toContain('n.key!==" "&&n.key!=="Spacebar"||(n.preventDefault(),k.click())');
    expect(chrom, 'autorepeat nie może mnożyć kliknięć').toContain('n.repeat||(');
    expect(chrom, 'Enter nie może być dokładany — anchor aktywuje się sam')
      .not.toContain('n.key==="Enter"||n.key===" "||n.key==="Spacebar"');
  });

  it('dymek odzywa się przy najechaniu i przy fokusie, ale tylko dla wyłączonej pozycji', () => {
    expect(chrom).toContain('function Qg32h(k){if(k.getAttribute("aria-disabled")!=="true"&&!k.hasAttribute("disabled"))return;');
    expect(chrom).toContain('k.addEventListener("mouseenter",function(){Qg32h(k)})');
    expect(chrom).toContain('k.addEventListener("focus",function(){Qg32h(k)})');
  });

  it('nie wprowadza nowego napisu UI — tekst pochodzi z tego samego źródła co klik', () => {
    expect(chrom, 'brak data-tip znaczy brak dymka, a nie nowy tekst').toContain('var q=Qg32t(k);q&&F(k,q)');
    // Jedyny awaryjny napis w tym pliku pochodzi z raty 2 (szuflada mobilna, G19) i zostaje
    // jeden — hover/fokus z raty 3 nie dokłada drugiego.
    expect(chrom.split('Ta opcja jest teraz niedost').length - 1).toBe(1);
  });

  it('„Zapisz dane" na stronach bez bramki liczy ten sam tekst, co handler kliknięcia', () => {
    // custom-fixes.js jest wpięty tylko na Start i DocPro; gdzie indziej statyczny data-tip
    // z menu mówi o polach, których na tej stronie nie ma.
    expect(chrom).toContain('if(d==="saveDataBtnSidebar"){var v=r.VildaVault,u=!!(v&&typeof v.isUnlocked=="function"&&v.isUnlocked());return u?"Zapisywanie danych jest dost\\u0119pne na stronie g\\u0142\\xF3wnej pacjenta."');
  });

  it('pliki bramki zostają czystym ASCII', () => {
    for (const [nazwa, tresc] of [['vilda_chrome.js', chrom], ['vilda_session_bridge.js', mostek]]) {
      const spozaAscii = [...tresc].filter((z) => z.codePointAt(0) > 127);
      expect(spozaAscii, `${nazwa} ma ${spozaAscii.length} znaków spoza ASCII`).toEqual([]);
    }
  });
});

describe('G30 — dane testowe brzmią jak dane testowe', () => {
  // Nazwisko-przynętę składamy w locie: wpisane wprost, ten plik nie przeszedłby własnej reguły.
  const przyneta = ['Kowal', 'ski'].join('');

  it('reguła łapie nazwisko nie do odróżnienia od prawdziwego', () => {
    const naruszenia = znajdzNaruszenia('tests/unit/x.test.mjs', `const p = { name: '${przyneta} Jan', lastName: '${przyneta}' };`);
    expect(naruszenia).toHaveLength(2);
    expect(naruszenia[0]).toContain('brzmi');
  });

  it('przepuszcza dane ze znacznikiem syntetycznym', () => {
    expect(znajdzNaruszenia('tests/unit/x.test.mjs', "const p = { name: 'Testowy Jan', lastName: 'Testowy' };")).toEqual([]);
    expect(znajdzNaruszenia('tests/unit/x.test.mjs', "const p = { name: 'Fikcyjna-Testowa Anna' };")).toEqual([]);
  });

  it('nie rusza bibliografii ani kodu produkcyjnego', () => {
    // Nazwiska autorów tablic występują w testach w komentarzach i nazwach scenariuszy.
    expect(znajdzNaruszenia('tests/unit/x.test.mjs', "// Palczewska, Kułaga, Mazur, Khamis-Roche\nit('Tanner 3', () => {});")).toEqual([]);
    expect(dotyczyReguly('vilda_auth_ui.js')).toBe(false);
  });

  it('cały katalog tests/ przechodzi regułę', () => {
    // To samo sprawdzenie robi `npm run test:repo`; tutaj po to, żeby regres złapał też
    // zwykły `npx vitest run`, bez pamiętania o osobnym poleceniu.
    const pliki = execFileSync('git', ['ls-files', 'tests'], { cwd: korzen, encoding: 'utf8' })
      .split('\n').filter((f) => f.endsWith('.mjs'));
    const wszystkie = pliki.flatMap((f) => znajdzNaruszenia(f, readFileSync(path.join(korzen, f), 'utf8')));
    expect(wszystkie).toEqual([]);
  });
});
