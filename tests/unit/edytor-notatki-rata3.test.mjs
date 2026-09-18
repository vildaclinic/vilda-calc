import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P-NOTATKI rata 3b — trzy zmiany w edytorze notatki pacjenta, każda do cofnięcia jednym znakiem.
// Zachowanie na żywym arkuszu mierzy tests/e2e/edytor-notatki-rata3.spec.mjs; tutaj pilnujemy
// rozgałęzień w źródle (zminifikowanym, więc polskie znaki w formie escape'ów).
//
// G14b (D10) — edytor podaje `baseRev` i obsługuje odpowiedź konfliktową z sejfu.
// G21  (D12) — niezapisany tekst nie ginie bez pytania: „Anuluj", Escape, zastąpienie arkusza,
//              przeładowanie strony. Blokada sejfu (onLock) tej ścieżki NIE dotyka i nigdy nie pyta.
// G18        — nagłówek mówi, dla kogo piszemy; zapis z menu zostawia potwierdzenie.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => readFileSync(path.join(korzen, plik), 'utf8');
const ui = zrodlo('vilda_auth_ui.js');
const sejf = zrodlo('vilda_vault.js');
const bramka = zrodlo('custom-fixes.js');

describe('G14b — edytor rozmawia z sejfem numerem wersji', () => {
  it('pamięta wersję, z którą się otworzył, i wysyła ją jako baseRev', () => {
    expect(ui).toContain('var Qbase=n&&r&&typeof r.rev=="number"&&isFinite(r.rev)?r.rev:null');
    expect(ui).toContain('Qbase!=null&&(Vt.baseRev=Qbase)');
  });

  it('odpowiedź konfliktowa zatrzymuje zapis i oddaje wybór', () => {
    expect(ui).toContain('if(Gc3&&Gc3.conflict===!0){Qkonflikt(Gc3);return}');
    expect(ui).toContain('Nowsza wersja tej notatki jest ju\\u017C w sejfie.');
    expect(ui).toContain('Wczytaj nowsz\\u0105 (porzuci Tw\\xF3j tekst)');
    expect(ui).toContain('Nadpisz moj\\u0105 wersj\\u0105');
  });

  it('„Nadpisz moją wersją" podnosi bazę do wersji z sejfu, zamiast trwale wyłączać ochronę', () => {
    expect(ui).toContain('Qw0&&typeof Qw0.rev=="number"&&isFinite(Qw0.rev)&&(Qbase=Qw0.rev)');
    expect(ui, 'nie ma trwałej flagi „ignoruj konflikty"').not.toContain('Qforce');
  });

  it('baner z raty 2 nie obiecuje już cichego nadpisania', () => {
    expect(ui).not.toContain('Zapis nadpisze tamt\\u0105 wersj\\u0119');
    expect(ui).toContain('Zapis zatrzyma si\\u0119 i pozwoli wybra\\u0107');
  });

  it('sejf sprawdza baseRev dopiero po bramce „tytuł albo treść"', () => {
    const iBramka = sejf.indexOf('savePatientNote: notatka musi mie\\u0107 tytu\\u0142 lub tre\\u015B\\u0107.');
    const iKonflikt = sejf.indexOf('conflict:!0');
    expect(iBramka).toBeGreaterThan(0);
    expect(iKonflikt).toBeGreaterThan(iBramka);
  });
});

describe('G21 — niezapisany tekst notatki nie ginie bez pytania', () => {
  it('pierwsza zmiana tytułu albo treści zapala flagę i znacznik na nakładce', () => {
    expect(ui).toContain('function Qdm(){Qdy=!0;try{d.setAttribute("data-pne-dirty","1")}catch{}}');
    expect(ui).toContain('E.addEventListener("input",function(){U=!0,Qdm()})');
    expect(ui).toContain('B.addEventListener("input",function(){O=!0,Qdm()})');
  });

  it('pyta na wszystkich trzech ścieżkach zamknięcia i przy przeładowaniu', () => {
    expect(ui, 'pytanie ma jedno brzmienie').toContain('i.confirm("Odrzuci\\u0107 niezapisan\\u0105 notatk\\u0119?")');
    expect(ui, '„Anuluj"').toContain('text:"Anuluj",onclick:function(){/* P-NOTATKI-3 (G21, D12) */if(!Qzap())return;');
    expect(ui, 'Escape').toContain('if(!Qzap())return;d.remove(),t&&typeof t.onCancel=="function"&&t.onCancel();return}');
    expect(ui, 'zastąpienie arkusza').toContain('o[Qo2].getAttribute("data-pne-dirty")==="1"');
    expect(ui, 'przeładowanie').toContain('i.addEventListener("beforeunload",Qbu)');
  });

  it('blokada sejfu kasuje nakładkę wprost — i dlatego nigdy nie pyta', () => {
    // onLock z P-NOTATKI-1 (G7) woła .remove() na węźle, omijając Qzap.
    const i = ui.indexOf('i.__vildaNoteEditorLockBound=!0');
    expect(i).toBeGreaterThan(0);
    const domkniecie = ui.slice(i, ui.indexOf('const d=e("div",{class:"vilda-auth-overlay', i));
    expect(domkniecie).toContain('.remove()');
    expect(domkniecie, 'w ścieżce blokady nie ma żadnego pytania').not.toContain('confirm');
    expect(domkniecie).not.toContain('Qzap');
  });

  it('strażnik przeładowania gaśnie tym samym obserwatorem, co nasłuch klawiatury z raty 2', () => {
    // Obserwator sprzątający stoi przy MutationObserverze, nie w samym handlerze klawiatury.
    const i = ui.indexOf('d.isConnected||(function(){');
    expect(i).toBeGreaterThan(0);
    const sprzatanie = ui.slice(i, i + 700);
    expect(sprzatanie).toContain('i.document.removeEventListener("keydown",Qkey,!0)');
    expect(sprzatanie).toContain('i.removeEventListener("beforeunload",Qbu)');
  });

  it('handler beforeunload milczy, gdy nakładki już nie ma', () => {
    expect(ui).toContain('function Qbu(Qb0){try{if(!Qdy||!d.isConnected)return;');
  });
});

describe('G18 — arkusz mówi, dla kogo piszemy, a zapis zostawia ślad', () => {
  it('nagłówek dociąga nazwisko po otwarciu, z samych nagłówków sejfu', () => {
    expect(ui).toContain('var Gp0=e("h3",{id:"vilda-pne-title"');
    expect(ui, 'listPatients nie odszyfrowuje migawek — arkusz otwiera się natychmiast')
      .toContain('typeof a.listPatients=="function"');
    expect(ui).toContain('Gp0.textContent=(n?"Edytuj notatk\\u0119 \\u2014 ":"Nowa notatka \\u2014 ")+Gp5');
  });

  it('nie zgaduje: pseudopacjent, błąd odczytu i zamknięty arkusz zostawiają stary tekst', () => {
    expect(ui).toContain('Gp1.indexOf("__vilda")!==0');
    expect(ui).toContain('Gp5==="(b\\u0142\\u0105d odczytu)"');
    expect(ui).toContain('if(!Gp0.isConnected)return');
  });

  it('zapis z menu potwierdza się dymkiem, bez nazwiska i bez treści', () => {
    expect(bramka).toContain('window.VildaDymek.pokaz("Notatka zapisana."');
    expect(bramka, 'dymek nie może nieść danych pacjenta').not.toContain('pokaz("Notatka zapisana \\u2014');
  });
});
