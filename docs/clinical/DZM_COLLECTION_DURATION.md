# DZM — domyślne 24 godziny i utrwalony czas zbiórki

Decyzja właściciela z 28.10.2026, zaakceptowana w makiecie
`https://vilda-mg-dzm-20261028.maciej-flader.chatgpt.site/czas-dzm.html`.

Nowe obliczenie z dobowej zbiórki moczu zaczyna się od faktycznie wpisanej
wartości **24 godziny**. Brak lub pusty wpis czasu oznacza jawne założenie
pełnej doby i nie blokuje liczby. Pole można rozwinąć przyciskiem „Zmień”.
Po opuszczeniu pustego pola przywracane jest 24; wyczyszczenie formularza
także wraca do 24. Wpisane 12 lub 23,5 godziny pozostają wpisanym czasem.
Zero, wartość ujemna, tekst i niejednoznaczny zapis nie stają się 24.

## Kontrakt modułu

`clcr_collection_duration.js` udostępnia `ClcrCollectionDuration`:

- `resolveHours(value, {source, historical})` — walidacja czasu; bez mutowania
  formularza i bez odczytywania dat;
- `fromValues(values, context, options)` — czas i jawne informacje o kompletności;
- `readFromDocument(document, options)` — ten sam kontrakt dla bieżącego formularza;
- `ensureDefaults(document)` — inicjalizacja lub reset żywych pól;
- `bindControl(control, {sourceControl})` — przywrócenie pustych 24 przy blur;
- `syncDurationView(document, {active, fieldViews, container})` — podsumowanie
  i opcjonalna edycja wspólnego pola czasu.

Wspólne identyfikatory to `Cl24DurationHours` i `Cl24DurationSource`.
Osobne formularze mają `CA_collectionHours`/`CA_collectionSource`,
`UA_collectionHours`/`UA_collectionSource` oraz
`MG_collectionHours`/`MG_collectionSource`. Wartości źródła to:
`assumed-24h`, `hours`, `captured`, a dla nierozstrzygniętego starego zapisu
`historical-missing`. Dawne `legacy-dates` może pozostać opisem pochodzenia
już utrwalonej liczby; moduł nie odtwarza jej ponownie z dat.

Wynik rozdziela `valid`, `missing` i `invalid`, niesie `hours`, `minutes`,
`source`, `assumed`, a oddzielnie `complete`, `protocol` i `knownProblems`.
`valid:true` nie oznacza kompletności zbiórki. Znany problem ma pierwszeństwo.

## Założenie a znana sprzeczność

Nie zaznaczamy automatycznie sześciu historycznych checkboxów. Przy braku
potwierdzonego problemu opisujemy kompletność jako założenie. Sam `false`
niezaznaczonego checkboxa oznacza brak potwierdzenia, a nie rozpoznane pominięcie
porcji moczu. Odpowiedź `ui_…_answer=no`, jawne `knownFacts.…=false` lub
`Cl24CollectionProblem=true` zachowują znaczenie i blokują ilościową ocenę
zgodnie z danym wzorem.

## Zakres

Reguła obejmuje zmierzony klirens kreatyniny oraz wydalanie Ca, UA, Mg, Pi,
białka, Na, K, szczawianów i cytrynianów. Dotychczasowe reguły porównywania
zbiórek innych niż 24 h pozostają przy właściwych wzorach. Ta poprawka nie
tworzy nowych norm tych parametrów.

pH DZM pozostaje zmierzonym pH: **nie mnożymy go przez 24/czas**. W ilorazach,
których równanie nie korzysta z czasu, nie dodajemy obowiązkowego pytania o czas.
Luka anionowa surowicy także nie staje się obliczeniem DZM.

## Stare wyniki

Odczyt historii nie wywołuje nowego obliczenia i nie dopisuje brakującego czasu.
Zamrożone wyniki, normy i interpretacje pozostają bez zmian. Świadoma edycja
starego pomiaru stosuje `historical:true`: bez liczbowo utrwalonego czasu trzeba
wpisać godziny. Dotyczy to również starych lokalnych dat bez strefy czasowej,
których nie wolno ponownie parsować przez `Date.parse` na innym urządzeniu.
Zapisane minuty/godziny mogą być użyte jako `captured`.

Dla Ca/UA/Mg znacznik `…_durationNeedsConfirmation=true` lub źródło
`historical-missing` powstrzymuje nowy domyślny czas przy pustym historycznym
polu. Po świadomym wpisaniu dodatnich godzin źródłem staje się `hours`.

## Przypadki regresyjne

Testy `tests/unit/klirens-collection-duration.test.mjs` wywołują rzeczywisty
moduł i producentów wyników: domyślne i puste 24, jawne 12/23,5, wartości
nieprawidłowe, historia bez domyślania czasu, założona kompletność oraz znane
sprzeczności. Na przykład 50 mmol/L Na × 1,5 L daje 75 mmol/24 h przy 24 h,
a 150 mmol/24 h po przeliczeniu z 12 h. UCr 100 mg/dL, SCr 1 mg/dL i 1440 mL
z 24 h dają 100 mL/min. pH 5,5 pozostaje 5,5 również przy 12 h.
