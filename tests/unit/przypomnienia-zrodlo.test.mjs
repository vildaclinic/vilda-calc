import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Strażnicy źródłowe karty „Przypomnienia” (audyt 2026-09-03).
//
// vilda_auth_ui.js nie ma haka testowego w rodzaju window.VildaTerminarz.__internals, więc gn()
// i Br() są nieosiągalne dla testów jednostkowych — ich zachowanie pilnuje
// tests/e2e/przypomnienia-karta.spec.mjs na realnej stronie. Tutaj pilnujemy samego kształtu
// źródła: dwie rzeczy, które łatwo cofnąć nieuważną edycją i których e2e nie złapie tanio.

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUTH_UI_SOURCE = fs.readFileSync(path.join(repositoryRoot, 'vilda_auth_ui.js'), 'utf8');
const TERMINARZ_SOURCE = fs.readFileSync(path.join(repositoryRoot, 'vilda_terminarz.js'), 'utf8');
const ADAPTER_SOURCE = fs.readFileSync(
  path.join(repositoryRoot, 'vilda_persistence_adapter.js'), 'utf8',
);
const ME_ZRODLO = AUTH_UI_SOURCE.slice(AUTH_UI_SOURCE.indexOf('var Me={'));

/** Wycina początek zminifikowanej funkcji — klamry nie da się dopasować regexem w jednej linii. */
function wytnij(sygnatura, dlugosc) {
  const start = AUTH_UI_SOURCE.indexOf(sygnatura);
  expect(start, `funkcja ${sygnatura} istnieje`).toBeGreaterThan(-1);
  return AUTH_UI_SOURCE.slice(start, start + dlugosc);
}

describe('vilda_auth_ui.js — kształt źródła po audycie karty „Przypomnienia”', () => {
  it('PR 12: gn() liczy „dziś” z lokalnych składników daty, nie z UTC', () => {
    // Punkt odniesienia musi być lokalny (getFullYear/Month/Date), bo sekcje „Zaległe”/„Dziś”
    // dzieli Fa() z lokalnej daty. Sama data notatki zostaje czytana z UTC — dueDateISO jest
    // zapisane jako północ UTC zamierzonego dnia, więc getUTC* zwraca właściwy dzień kalendarzowy.
    // Funkcja jest zminifikowana w jednej linii — bierzemy jej początek i stały odcinek dalej,
    // bo dopasowanie klamry regexem po zminifikowanym kodzie urywa się na pierwszym `}`.
    const start = AUTH_UI_SOURCE.indexOf('function gn(t){');
    expect(start, 'funkcja gn() istnieje').toBeGreaterThan(-1);
    const gn = AUTH_UI_SOURCE.slice(start, start + 700);
    expect(gn, 'odniesienie „dziś” z lokalnych składników')
      .toContain('Date.UTC(n.getFullYear(),n.getMonth(),n.getDate())');
    expect(gn, 'data notatki nadal czytana z UTC')
      .toContain('Date.UTC(a.getUTCFullYear(),a.getUTCMonth(),a.getUTCDate())');
  });

  it('nigdzie w pliku „dziś” nie jest budowane z UTC-owych składników bieżącej chwili', () => {
    // Wzorzec `var X=new Date, Y=new Date(Date.UTC(X.getUTCFullYear(), …))` to rodzina błędu D8:
    // na wschód i zachód od UTC daje dobę przesuniętą o jeden dzień. Miały go gn() (naprawione
    // w PR 12) i martwa Fs() (usunięta w PR 14).
    const wzorzec = /new Date,\s*\w+\s*=\s*new Date\(Date\.UTC\(\w+\.getUTCFullYear\(\)/g;
    const trafienia = AUTH_UI_SOURCE.match(wzorzec) || [];
    expect(trafienia, `znaleziono ${trafienia.length} wystąpień wzorca UTC-owego „dziś”`)
      .toHaveLength(0);
  });

  it('PR 16: słownik Me zna każdą kategorię z terminem, jaką zapisuje Terminarz', () => {
    // To jest strażnik klasy błędu, nie pojedynczego wpisu. Kategorie rodzą się w Terminarzu,
    // a kolor i etykietę nadaje im słownik Me w vilda_auth_ui.js. Gdy kategorii w Me brakuje,
    // nic się nie psuje głośno — wiersz po prostu dostaje awaryjny kolor i etykietę „Notatka”,
    // co właściciel zobaczył 2026-09-03 na zrzutach: procedury szare w karcie, niebieskie w
    // modalu. „absence” (urlop) jest poza listą świadomie — PR 11 wycina je z kanału przypomnień.
    const koniec = ME_ZRODLO.indexOf('};function Jv(');
    expect(koniec, 'blok var Me={…} kończy się przed resolverem Jv()').toBeGreaterThan(-1);
    const klucze = new Set(
      (ME_ZRODLO.slice(0, koniec).match(/[{,]"?([a-z-]+)"?:\{label:/g) || [])
        .map((m) => m.replace(/^[{,]"?/, '').replace(/"?:\{label:$/, '')),
    );
    expect(klucze.size, 'słownik Me odczytany ze źródła').toBeGreaterThan(5);
    const zTerminarza = new Set(
      (TERMINARZ_SOURCE.match(/category:"[a-z-]+"/g) || []).map((m) => m.slice(10, -1)),
    );
    zTerminarza.delete('absence');
    const brakujace = Array.from(zTerminarza).filter((k) => !klucze.has(k)).sort();
    expect(brakujace, 'kategorie Terminarza bez wpisu w Me').toEqual([]);
    expect(klucze.has('procedura'), 'procedura').toBe(true);
    expect(klucze.has('reservation'), 'rezerwacja').toBe(true);
  });

  it('PR 16: karta i modal rozwiązują kategorię tym samym resolverem Jv()', () => {
    // Przed poprawką każdy z dwóch widoków miał własny łańcuch awaryjny: karta szary #8E8E93 i
    // etykietę „Notatka”, modal niebieski #32ADE6 i surowy klucz kategorii. Dopóki obie ścieżki
    // przechodzą przez Jv(), nie mogą się rozjechać.
    const ri = wytnij('function ri(t,a,n,Je){', 200);
    const it_ = wytnij('function it(G,nt){', 400);
    expect(ri, 'wiersz karty pyta Jv()').toContain('var r=Jv(a.category),o=r.accent,Jk=r.color,l=r.label,');
    expect(it_, 'wiersz modalu pyta Jv()').toContain('B=Jv(E.category),U=B.color,O=B.accent,J=B.label,');
    expect(ri, 'karta bez własnego koloru awaryjnego').not.toContain('#8E8E93');
    expect(it_, 'modal bez własnego koloru awaryjnego').not.toContain('#32ADE6');
  });

  it('PR 16: nagłówek sekcji modalu nie nadpisuje koloru procedury', () => {
    // ft() miał wyjątek `G==="procedura"&&(j="#AF52DE",…)` — fioletowy nagłówek nad wierszami,
    // które brały kolor skądinąd. Kolor ma pochodzić wyłącznie ze słownika.
    const ft = wytnij('function ft(G){', 200);
    expect(ft, 'ft() czyta ze słownika').toContain('var nt=Jv(G),j=nt.accent,E=nt.bg;');
    expect(ft, 'bez wyjątku na procedurę').not.toContain('#AF52DE');
  });

  it('PR 17: stan zwinięcia kategorii jest preferencją synchronizowaną w chmurze', () => {
    // Cross-device działa tylko dla kluczy o klasie `cloud-synced`: taki klucz jedzie przez
    // onPreferenceWrite do `userPreferences` sejfu, a stamtąd do payloadu synchronizacji.
    // Klucz zapisany jako `local-persistent` zostałby na jednym urządzeniu i nikt by tego nie
    // zauważył — stąd ten strażnik pilnuje samej KLASY, nie istnienia klucza.
    expect(ADAPTER_SOURCE, 'klucz jest w katalogu')
      .toContain('REMINDERS_COLLAPSED_CATEGORIES:"remindersCollapsedCategories"');
    expect(ADAPTER_SOURCE, 'z klasą cloud-synced')
      .toContain('[s.REMINDERS_COLLAPSED_CATEGORIES]:Object.freeze({scope:"reminders",'
        + 'kind:"preference",storage:"cloud-synced"})');
    expect(ADAPTER_SOURCE, 'i z aliasem, po którym woła go karta')
      .toContain('remindersCollapsedCategories:s.REMINDERS_COLLAPSED_CATEGORIES');
    expect(AUTH_UI_SOURCE, 'karta czyta i pisze dokładnie ten klucz')
      .toContain('Qa1="remindersCollapsedCategories"');
  });

  it('PR 17: nowe identyfikatory nie kolidują z nazwami minifikatora', () => {
    // Zmierzone na własnej skórze przy pierwszym podejściu: nazwy `Ka`, `Ke`, `Ki` i `Kl` były
    // już zajęte przez minifikator, więc druga deklaracja `function Ki(` przesłoniła moją i
    // nagłówki kategorii renderowały się PUSTE, bez żadnego błędu w konsoli. Plik jest
    // zminifikowany i nie da się tego zobaczyć okiem — stąd strażnik liczy deklaracje.
    const nowe = ['Qa0', 'Qa1', 'Qa2', 'Qa3', 'Qa4', 'Qa5', 'Qa6', 'Qa7', 'Qa8', 'Qa9'];
    for (const nazwa of nowe) {
      const deklaracje = (AUTH_UI_SOURCE.match(
        new RegExp(`(function\\s+${nazwa}\\s*\\(|[\\s,;]${nazwa}=)`, 'g'),
      ) || []).length;
      expect(deklaracje, `identyfikator ${nazwa} zadeklarowany dokładnie raz`).toBe(1);
    }
  });

  it('PR 17: oba widoki znakują sekcje kategorii tym samym atrybutem', () => {
    // `data-vild-cat` jest jedynym spoiwem między kartą a modalem: przełącznik szuka po nim
    // WSZYSTKICH sekcji tej kategorii w dokumencie, więc jeden klik zwija ją w obu widokach.
    const karta = wytnij('function Qa9(t,a){', 900);
    const modal = wytnij('function rt(G,nt,j){', 1600);
    expect(karta, 'nagłówek kategorii w karcie').toContain('"data-vild-cat":u');
    expect(karta, 'kontener wierszy w karcie').toContain('"data-vild-flow":"block"');
    expect(modal, 'nagłówek kategorii w modalu').toContain('"data-vild-cat":G');
    expect(modal, 'kontener wierszy w modalu').toContain('"data-vild-flow":"flex"');
    expect(AUTH_UI_SOURCE, 'wszystkie trzy sekcje czasowe karty grupują po kategoriach')
      .toContain('Qa9(o,"over")');
    expect(AUTH_UI_SOURCE).toContain('Qa9(l,"today")');
    expect(AUTH_UI_SOURCE).toContain('Qa9(d,"pend")');
  });

  it('PR 14: martwa funkcja Fs() nie wróciła', () => {
    // Formatowała datę względną („dziś · HH:MM”), niosła powyższy błąd doby i nie miała ani
    // jednego wywołania. Usunięta; gdyby wróciła, wróciłby też nieużywany kod z wadą.
    expect(AUTH_UI_SOURCE).not.toMatch(/\bfunction Fs\s*\(/);
    expect((AUTH_UI_SOURCE.match(/\bFs\b/g) || []).length, 'identyfikator Fs nie występuje').toBe(0);
  });
});
