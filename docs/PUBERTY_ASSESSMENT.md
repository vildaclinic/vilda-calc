# Wspólna ocena pokwitania — panel i kontrakt

Panel w formularzu głównym i DocPro zapisuje oddzielne G, Th i P. Laboratoria
oraz wzrastanie korzystają ze wspólnego odczytu właściwej osi. Podstawę zapisu
wprowadził #687; etap 2 udostępnia edycję i jawnie kwalifikuje obserwacje do
poszczególnych zastosowań, bez nowych tabel referencyjnych lub progów.

## Zapis

Opcjonalne `user.pubertyAssessment` w istniejącym payloadzie wizyty:

```json
{
  "version": 1,
  "sex": "M",
  "observations": {
    "G": {
      "stage": 3,
      "observedAtISO": "2026-10-01",
      "ageMonths": 144,
      "source": "clinician-entry"
    },
    "Th": null,
    "P": {
      "stage": 2,
      "observedAtISO": null,
      "ageMonths": 143.5,
      "source": null
    }
  }
}
```

- G = narządy płciowe, Th (B) = piersi, P = owłosienie łonowe. Osie są niezależne.
  Nie ma trzeciego, wyliczanego „ogólnego Tannera”.
- `stage`: liczba całkowita 1–5. Bez zamiany tekstu, wartości logicznej ani ułamka
  na stadium. Nieoceniona cecha ma wartość `null`; brak klucza cechy w v1 czytamy
  również jako `null`.
- `observedAtISO`: prawidłowa data kalendarzowa `YYYY-MM-DD` albo `null`.
  To data oceny cechy, nie znacznik czasu zapisu. Brak daty pozostaje brakiem.
- `ageMonths`: zapisany wiek podczas oceny, nieujemna skończona liczba miesięcy
  (może być ułamkowa) albo `null`. Wiek nie wyznacza automatycznie daty oceny.
- Oś wpisana w `currentAxes` znacznika wizyty ze źródłem `clinician-entry` niesie
  wiek i datę **tej wizyty**: stan formularza aktualizuje je przy każdym odczycie
  i w kolektorze, także gdy lekarz wpisał stadium przed wiekiem albo poprawił wiek
  po kliknięciu (P-POKWITANIE-WIZYTA, decyzja właściciela 2026-10-15). Osie spoza
  `currentAxes` są historią i nie są przepisywane. Obserwacja z innym jawnym
  źródłem zachowuje swoje wartości.
- `source`: niepusty tekst pochodzenia obserwacji albo `null`. Kod niczego nie
  dopowiada; brak źródła nie staje się „oceną lekarza”.
- `sex`: płeć źródłowej oceny `M`, `F` albo `null`. Zmiana płci w formularzu nie
  przepisuje historycznego G na Th lub odwrotnie.

Opcjonalne `sex` pojedynczej obserwacji ma pierwszeństwo przed płcią całego
obiektu. Podczas pierwszej edycji po zmianie płci istniejące obserwacje zachowują
swoją wcześniejszą płeć, a nowa obserwacja dostaje bieżącą. Dotyczy to także P.

Każda cecha ma własne pochodzenie. Edycja P nie aktualizuje daty G. Nie ma
automatycznej klasyfikacji na podstawie objętości jąder. Dotychczasowe opcjonalne pomiary i historia menarche
zachowują osobne kontrakty.

## Odczyt i zgodność

Czytelny moduł `vilda_puberty_assessment.js` publikuje
`VildaPubertyAssessment.readUser(user)`:

| Stan wejścia | `status` | `assessment` | `legacy` |
|---|---|---|---|
| Brak własnego klucza `pubertyAssessment` | `absent` | `null` | poprawny stary numer jako `{kind:'unspecified', stage:n}` albo `null` |
| Poprawna v1, także same puste cechy | `ready` | niezależna kopia znormalizowanych danych | `null` |
| Wyższa całkowita wersja schematu | `unsupported` | `null` | `null` |
| Obecny, wadliwy obiekt lub obserwacja | `invalid` | `null` | `null` |

Obecny pusty, błędny albo nieobsługiwany schemat nigdy nie uruchamia powrotu do
starego `user.tannerStage`. Odczyt nie modyfikuje payloadu. `clone()` kopiuje
wartości JSON; zapis zachowuje oryginalny obiekt, również dodatkowe pola i przyszłe
wersje, zamiast zapisywać okrojoną postać z normalizatora.

`ready` oznacza poprawny format, **nie potwierdzenie aktualności lub przydatności
klinicznej**. Odczyt zachowuje etykiety osi nawet przy niespójnej płci źródłowej;
nie koryguje historii. Adapter kliniczny musi osobno sprawdzić właściwą
oś, płeć, wiek i pochodzenie. Samo P nie może być wejściem gonadalnego stadium.

`VildaPubertySource.kontekstPacjenta()` udostępnia dodatkowe `assessmentContext`
z powyższym wynikiem dla potwierdzonego źródła. Nadal chronią je istniejące bramki
pacjenta, sejfu i generacji odczytu. Jest to kontekst odczytanego rekordu, bez
obietnicy „ocena z dzisiejszej wizyty”. Dotychczasowe API pozostaje zgodne;
czytniki kliniczne korzystają z jawnego adaptera, nie ze starego numeru.

## Cykl życia

`vilda_puberty_assessment_state.js` utrzymuje kopię załadowanej oceny w pamięci
aktywnego panelu i przekazuje ją do istniejącego kolektora oraz sesji głównej.
Nie tworzy nowego klucza storage i nie wyprowadza aktualności z `lastLoadedData`:
ten obiekt może zostać odświeżony głową rekordu w tle.

Jawne wczytanie zapisuje tryb transportu `loaded`, odtworzenie wizyty lub sesji —
`restored`. Ten tryb opisuje drogę wczytania, nie potwierdzenie badania na obecnej
wizycie; po odświeżeniu strony nie wolno z niego wyprowadzać aktualności oceny.
Przeniesienie do nowego pomiaru zachowuje wcześniejszą datę, bez potwierdzenia
nowej oceny. Sam transport nie kwalifikuje ich do bieżącej interpretacji.
Zmiana pacjenta, czyszczenie lub utrata właściwego sejfu unieważniają pamięć.
Przejście pomiędzy Start i DocPro używa istniejącej sesji, z zachowaniem pustego
obiektu i danych nieobsługiwanej wersji.

Przy zimnym starcie część pól może zostać przywrócona wcześniej niż pełna sesja.
Jeżeli formularz gościa jest już zajęty, jednorazowo odtwarzamy samą niewidoczną
ocenę z niezmienionej sesji tej samej karty, odczytanej przy starcie modułu.
Nie wymaga to nazwiska. Dostępne pola mogą wykluczyć sprzeczność, ale nie służą
do identyfikowania pacjenta na podstawie samego wieku, płci lub pomiarów.
Rzeczywista edycja użytkownika, jawne wczytanie (także bez oceny), czyszczenie,
zmiana pacjenta, nieaktualna ramka albo zmiana sesji od startu blokują tę ścieżkę.
Próba jest zużywana również przy odmowie; tymczasowa kopia sesji jest zwalniana.
Pusty formularz nadal korzysta z normalnego pełnego odtworzenia.

## Bieżąca wizyta i kwalifikacja

Opcjonalny `user.pubertyAssessmentVisit` jest znacznikiem transportu:
`{version:1, visitId, ownerPatientId, currentAxes, reference:{sex,ageMonths,measuredAtISO}}`.
Nie jest datą badania. Świadoma edycja oznacza wyłącznie wybraną oś jako ocenioną
w tej wizycie; nie zmienia dat pozostałych. Kolektor może uzupełnić odniesienie
wizyty, zachowując oryginalną datę, wiek i źródło każdej obserwacji.

Ta sama wizyta po zmianie karty lub F5 zachowuje znacznik. Nowy pomiar usuwa
bieżącą kwalifikację dawnych obserwacji. Zmiana płci odbiera niezgodnym osiom
status bieżący również po powrocie do poprzedniej płci; historia pozostaje.
Znacznik i ocena są kopiowane atomowo, bez uzupełniania pustych pól z wcześniejszej
sesji. Nieobsługiwane dane zachowujemy, a edytor nie nadpisuje ich po cichu.

Odniesienie wizyty liczy wiek z pól `age`, `ageMonths` i `ageWeeks`. Puste lata
z domyślnym „0” miesięcy to wiek nieznany (`null`), nie noworodek; same miesiące
albo tygodnie nadal opisują niemowlę. Tę samą wizytę rozpoznajemy po tym samym
ukończonym miesiącu wieku: konsument może podać wiek dokładny (146,07 mies.),
a formularz niesie miesiące ukończone (146); różnica poniżej jednego miesiąca nie
odbiera ocenie statusu bieżącej.

`VildaPubertyAssessment.gonadalContext(userOrReadResult, options)` zwraca G dla M
albo Th dla F; samo P i stary `unspecified` nigdy nie zastępują tej osi. Wynik
niesie osobno obserwację, `current`, `usableForGrowth`, powód i kwalifikowane
`stage` (albo `null`). `resolveAxis()` udostępnia tę samą kwalifikację dla każdej
osi, potrzebną także do prezentacji P.

- `scope:'current'`: wymaga znacznika świadomej oceny w tej wizycie, właściwej
  płci oraz braku sprzeczności znanych dat i wieku. Brak daty nie wymusza nazwiska,
  antropometrii ani wymyślonego dnia badania. Sama zgodność daty lub wieku nie
  zastępuje znacznika.
- `scope:'growth'`: oprócz bieżącej oceny dopuszcza właściwą wcześniejszą obserwację
  zgodnie z istniejącą granicą 12 miesięcy włącznie. To polityka aplikacji, nie
  biologiczna gwarancja ważności stadium. Przyszłe daty/wiek i sprzeczny stary
  zegar nie kwalifikują obserwacji; nieznany czas dawnej obserwacji nie dowodzi
  świeżości. Bez wieku dawnej oceny nie odtwarzamy czasu jej utrzymywania.

Świadoma edycja oceny ogłasza `vilda:puberty-assessment-changed` z powodem `edit`.
Wskaźnik stanu zapisu (`vilda_save_status_indicator.js`) przelicza po nim odcisk
formularza tak samo, jak po polu formularza, więc chip pacjenta w nagłówku pokazuje
niezapisane zmiany, a strażnik niezapisanych zmian pyta o zapis także po samej
zmianie stadium.

`VildaPubertyAssessmentContext.readActiveContext()` wybiera chroniony żywy
formularz, a dopiero przy jego braku potwierdzoną sesję. Kolejność działań
formularzy Start/DocPro jest liczona wyłącznie w RAM i nie staje się datą badania.
Pauza autosave nie pozwala starszej sesji zastąpić nowszej edycji. Lock, zmiana
konta/pacjenta i nieaktualny panel unieważniają źródło.

Podczas czyszczenia odczyt kończy się przed sprawdzeniem właściciela panelu:
identyfikator i pola są wtedy przejściowo niespójne. Po zakończeniu obowiązuje
zwykła ochrona pacjenta. Powtórzone syntetyczne zdarzenia z niezmienionymi polami
nie rozsyłają ponownie zmiany kontekstu; rzeczywista zmiana wieku wyliczonego
z daty urodzenia nadal ją rozsyła, a działanie użytkownika zachowuje priorytet
źródła w RAM.

Ogólny przelicznik (tabele Tanner-zależne), HOMA-IR, kreator epikryzy i Karta
Pacjenta czytają właściwą oś G/Th przez ten sam adapter z kwalifikacją `growth`
(bieżąca albo wcześniejsza do 12 miesięcy, oznaczona); samo P nigdy ich nie
zasila, a stary numer obowiązuje tylko bez typowanego zapisu
(P-POKWITANIE-KONSUMENCI).

Laboratorium może zamontować ten sam edytor bez opuszczania wyniku. Gdy nie ma
żywego formularza, korekta ma jawny lokalny zakres i nie zapisuje pacjenta.
Znane leczenie i wiek pobieramy z tego samego kontekstu. Osie wieku/stadium
zachowują odrębne warunki; brak stadium nie blokuje dostępnej oceny dla wieku.
Inhibina B nie dostaje nowych norm stadium, jeśli źródło ich nie zawiera.

## Pomoc w panelu

Panel ma dwie cechy dla wybranej płci, bez wyliczanego ogólnego Tannera.
Rozwinięcie ściągi i opcjonalnego wywiadu nie jest wymagane do wyboru stadium.
G i Th opisują budowę, P jest oceniane osobno. Pomoc G podaje orientacyjną
objętość pojedynczego jądra mierzoną orchidometrem Pradera: około 2 / 4–6 / 8–10 /
12–15 / 15–25 ml dla I–V. Są to wskazówki, nie granice klasyfikacji ani pełne normy;
nie zastępują morfologii i nie przenoszą się na USG. G2 przy 3 ml nie jest
automatycznie odrzucane. Źródła i wpływ kliniczny: `docs/clinical/ALGORITHMS.md`.
