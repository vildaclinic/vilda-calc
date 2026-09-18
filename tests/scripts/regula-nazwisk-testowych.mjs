// P-NOTATKI rata 3 (G30) — dane testowe nie mogą brzmieć jak prawdziwy pacjent.
//
// docs/DATA_PROTECTION.md, punkt 2 sekcji „Dane syntetyczne": dane mają być JEDNOZNACZNIE
// oznaczone jako syntetyczne. Specy notatek i Karty pacjenta zakładały pacjentów „Kowalski Jan"
// i „Nowak Ala" — nazwiska nie do odróżnienia od prawdziwych. To nie jest teoria: Playwright
// zapisuje przy porażce ślad (`trace: 'retain-on-failure'`), a ślad idzie do artefaktu CI.
// Czytający raport nie ma jak stwierdzić, czy patrzy na dane wymyślone, czy na czyjeś.
//
// Reguła celowo jest wąska. Patrzy WYŁĄCZNIE na wartości kluczy tożsamości pacjenta
// (`name`, `lastName`, `firstName`) w plikach `tests/**/*.mjs`. Nie rusza bibliografii
// (Palczewska, Kułaga, Mazur, Khamis, Tanner występują w komentarzach i nazwach scenariuszy),
// nie czyta nazw plików ani opisów testów. Lista nazwisk nie zawiera wyrazów pospolitych
// (Król, Baran, Sikora, Duda, Wróbel), bo `name:` w JavaScripcie to klucz ogólnego przeznaczenia
// i takie pozycje produkowałyby fałszywe alarmy w kodzie niezwiązanym z pacjentem.

const KLUCZE_TOZSAMOSCI = ['name', 'lastName', 'firstName'];

// Pospolite polskie nazwiska, które NIE są jednocześnie wyrazami pospolitymi.
const NAZWISKA = new Set([
  'kowalski', 'kowalska', 'nowak', 'nowakowski', 'nowakowska',
  'wisniewski', 'wisniewska', 'wojcik', 'kowalczyk', 'kaminski', 'kaminska',
  'lewandowski', 'lewandowska', 'zielinski', 'zielinska', 'szymanski', 'szymanska',
  'wozniak', 'dabrowski', 'dabrowska', 'kozlowski', 'kozlowska',
  'jankowski', 'jankowska', 'wojciechowski', 'wojciechowska',
  'kwiatkowski', 'kwiatkowska', 'piotrowski', 'piotrowska',
  'grabowski', 'grabowska', 'pawlowski', 'pawlowska', 'michalski', 'michalska',
  'adamczyk', 'nowicki', 'nowicka', 'majewski', 'majewska',
  'olszewski', 'olszewska', 'jablonski', 'jablonska', 'malinowski', 'malinowska',
  'surdyk',
]);

// Tokeny, które mimo trafienia w listę mają przejść. Furtka działa w obu miejscach reguły,
// żeby pojedynczy fałszywy alarm nie zmuszał do osłabiania listy dla całego repozytorium.
const WYJATKI = new Set([]);

const ZNACZNIK_SYNTETYCZNY = /(test|fikcyj|pr[oó]bn|przyk[łl]ad|demo|syntet)/i;

function bezOgonkow(tekst) {
  return tekst
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase();
}

export function dotyczyReguly(sciezka) {
  const p = sciezka.replaceAll('\\', '/');
  return p.startsWith('tests/') && p.endsWith('.mjs');
}

// Wyciąga wartości literałów stringowych stojących pod kluczami tożsamości.
// Świadomie bez parsera: reguła ma być tania i czytelna, a nie kompletna —
// jej zadaniem jest złapać typowy zapis danych testowych, nie każdy możliwy.
function wartosciTozsamosci(tresc) {
  const znalezione = [];
  for (const klucz of KLUCZE_TOZSAMOSCI) {
    const wzor = new RegExp(`\\b${klucz}\\s*:\\s*(['"\`])((?:\\\\.|(?!\\1).)*)\\1`, 'g');
    for (const m of tresc.matchAll(wzor)) znalezione.push({ klucz, wartosc: m[2] });
  }
  return znalezione;
}

export function znajdzNaruszenia(sciezka, tresc) {
  if (!dotyczyReguly(sciezka)) return [];
  const naruszenia = [];
  for (const { klucz, wartosc } of wartosciTozsamosci(tresc)) {
    if (ZNACZNIK_SYNTETYCZNY.test(wartosc)) continue;
    for (const slowo of bezOgonkow(wartosc).split(/[^a-z]+/).filter(Boolean)) {
      if (WYJATKI.has(slowo) || !NAZWISKA.has(slowo)) continue;
      naruszenia.push(
        `${sciezka}: dane testowe pod kluczem "${klucz}" brzmią jak prawdziwe nazwisko `
        + `("${wartosc}") — użyj formy ze znacznikiem (Testowy/Fikcyjna/Próbna) `
        + 'albo dopisz token do WYJATKI w tests/scripts/regula-nazwisk-testowych.mjs',
      );
      break;
    }
  }
  return naruszenia;
}

export const __doTestow = { NAZWISKA, ZNACZNIK_SYNTETYCZNY, bezOgonkow, wartosciTozsamosci };
