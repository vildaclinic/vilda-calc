import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Rata C z audytu sekcji „Pacjenci": P5 (Notatki) oraz P9/P10 (Historia).
//
// P5. Sejf odróżnia zapis nowej notatki od zapisu, który WSKRZESIŁ notatkę skasowaną
//     w międzyczasie na innym urządzeniu — zwraca `isNew:true` mimo podanego id.
//     Bramka w sejfie (`savePatientNote: notatka nie istnieje`) nie łapie tej ścieżki
//     z założenia: rzuca tylko wtedy, gdy payload NIE niesie tytułu i treści, a edytor
//     zawsze je niesie. Sygnałem jest więc `isNew`, i to edytor musi go obsłużyć.
// P9/P10. Widok domyślny Historii grupuje wpisy po `linkedAgeMonths`. Wpis bez tego
//     powiązania nie trafiał do żadnej grupy i znikał; wracał dopiero po włączeniu
//     filtra, bo filtr przełącza widok w tryb płaski.
//
// Zachowanie na żywej karcie mierzy tests/e2e/karta-pacjenta-notatki-historia.spec.mjs.
// Tutaj pilnujemy samych rozgałęzień, bo to po kilka znaków, które łatwo cofnąć.

// Źródło bez komentarzy: opis naprawy cytuje usunięty kod. Odrzucamy tylko linie będące
// w całości komentarzem — naiwne ucinanie od pierwszego „//" kaleczy plik zminifikowany,
// bo w łańcuchach znakowych siedzą adresy https://.
const kod = readFileSync(path.join(repoRoot, 'vilda_auth_ui.js'), 'utf8')
  .split('\n')
  .filter((w) => !/^\s*\/\//.test(w))
  .join('\n');

describe('P5 — edytor notatki pacjenta reaguje na wskrzeszenie', () => {
  it('nie wyrzuca już wyniku savePatientNote do kosza', () => {
    // Znak PRZED wywołaniem rozstrzyga: „=" znaczy, że wynik gdzieś idzie, „;" — że przepada.
    const wywolania = [...kod.matchAll(/(.)await a\.savePatientNote\(Vt\)/g)].map((m) => m[1]);
    expect(wywolania.length, 'jedno wywołanie zapisu w edytorze').toBe(1);
    expect(wywolania[0], 'wynik zapisu przypisany, nie porzucony').toBe('=');
    expect(kod).toContain('var Gc3=await a.savePatientNote(Vt)');
    expect(kod, 'wskrzeszenie to isNew przy edycji istniejącej notatki')
      .toContain('var Gc4=!!(n&&Gc3&&Gc3.isNew===!0)');
  });

  it('mówi wprost, co się stało, i daje wybór', () => {
    expect(kod).toContain('Ta notatka by\\u0142a w mi\\u0119dzyczasie skasowana na innym urz\\u0105dzeniu.');
    expect(kod, 'zostawienie notatki jest decyzją, nie domyślnym skutkiem').toContain('text:"Zostaw notatk\\u0119"');
    expect(kod, 'skasowanie można domknąć bez szukania notatki na liście').toContain('text:"Usu\\u0144 ponownie"');
    expect(kod).toContain('await a.removePatientNote(Gc3&&Gc3.id?Gc3.id:Vt.id)');
  });

  it('podmienia przyciski, zamiast dokładać im drugiego nasłuchu', () => {
    // e() wiesza onclick przez addEventListener — samo przestawienie .onclick zostawiłoby
    // działający stary zapis pod tym samym przyciskiem.
    expect(kod).toContain('Ce.parentNode.replaceChild(Gc6,Ce)');
    expect(kod).toContain('la.parentNode.replaceChild(Gc5,la)');
  });
});

describe('P9/P10 — Historia w widoku domyślnym', () => {
  it('nie porzuca już wpisów bez powiązania z pomiarem', () => {
    expect(kod.includes('A.forEach(function(q){q.linkedAgeMonths!=null&&rt(q)}),X.forEach(function(q){rt(q)})'),
      'wpisy bez linkedAgeMonths przepadały bez śladu').toBe(false);
    expect(kod, 'każdy wpis idzie albo pod kotwicę pomiaru, albo do osobnego zbioru')
      .toContain('function Gc1(q){q.linkedAgeMonths!=null?rt(q):f(q)&&Gc0.push(q)}');
  });

  it('pokazuje je w nazwanej sekcji z licznikiem', () => {
    expect(kod).toContain('tt("Bez przypisanego pomiaru ("+Gc0.length+")")');
    expect(kod, 'sekcja pomiarowa dostaje własny nagłówek, gdy nie stoi sama')
      .toContain('vt.length&&bt.appendChild(tt("Przy pomiarach"))');
  });

  it('nie mówi „brak wydarzeń", gdy takie wpisy są', () => {
    expect(kod).toContain('if(vt.length===0&&!dt&&Gc0.length===0)');
  });

  it('sortuje je po dacie zdarzenia, a nie po kolejności zapisu', () => {
    expect(kod).toContain('Gc0.sort(function(q,Y){var et=Gc2(q),xt=Gc2(Y);return et>xt?-1:et<xt?1:0})');
    expect(kod, 'data kliniczna ma pierwszeństwo przed datą utworzenia')
      .toContain('q.clinicalDateISO?q.clinicalDateISO.length===10?q.clinicalDateISO+"T00:00:00.000Z":q.clinicalDateISO:q.dateISO||q.updatedAtISO||""');
  });
});
