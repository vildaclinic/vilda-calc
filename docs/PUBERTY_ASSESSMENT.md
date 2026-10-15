# Wspólna ocena pokwitania — kontrakt, etap 1

Pierwszy etap przygotowuje zapis i odczyt oddzielnych G, Th i P. Nie udostępnia
jeszcze edytora i nie zmienia wejść istniejących interpretacji, norm ani wyników.
Następny etap obejmuje zatwierdzony panel oraz jawne adaptery jego konsumentów.

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
- `source`: niepusty tekst pochodzenia obserwacji albo `null`. Kod niczego nie
  dopowiada; brak źródła nie staje się „oceną lekarza”.
- `sex`: płeć źródłowej oceny `M`, `F` albo `null`. Zmiana płci w formularzu nie
  przepisuje historycznego G na Th lub odwrotnie.

Każda cecha ma własne pochodzenie. Przyszła edycja P nie może aktualizować daty G.
W etapie 1 nie ma operacji edycji stadium ani automatycznej klasyfikacji na
podstawie objętości jąder. Dotychczasowe opcjonalne pomiary i historia menarche
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
nie koryguje historii. Przyszły adapter kliniczny musi osobno sprawdzić właściwą
oś, płeć, wiek i pochodzenie. Samo P nie może być wejściem gonadalnego stadium.

`VildaPubertySource.kontekstPacjenta()` udostępnia dodatkowe `assessmentContext`
z powyższym wynikiem dla potwierdzonego źródła. Nadal chronią je istniejące bramki
pacjenta, sejfu i generacji odczytu. Jest to kontekst odczytanego rekordu, bez
obietnicy „ocena z dzisiejszej wizyty”. Dotychczasowe API pozostaje zgodne;
starsze konsumery zostaną przepięte świadomie razem z edytorem w etapie 2.

## Cykl życia

`vilda_puberty_assessment_state.js` utrzymuje kopię załadowanej oceny w pamięci
aktywnego panelu i przekazuje ją do istniejącego kolektora oraz sesji głównej.
Nie tworzy nowego klucza storage i nie wyprowadza aktualności z `lastLoadedData`:
ten obiekt może zostać odświeżony głową rekordu w tle.

Jawne wczytanie zapisuje tryb transportu `loaded`, odtworzenie wizyty lub sesji —
`restored`. Ten tryb opisuje drogę wczytania, nie potwierdzenie badania na obecnej
wizycie; po odświeżeniu strony nie wolno z niego wyprowadzać aktualności oceny.
Przeniesienie do nowego pomiaru zachowuje wcześniejszą datę, bez potwierdzenia
nowej oceny. W etapie 1 takie dane nie są aktywowane w obliczeniach.
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

## Kolejny etap

Przed udostępnieniem edycji G/Th/P trzeba razem podłączyć formularz, import do
interpretacji laboratoryjnych oraz konsumentów wzrastania. Nie wolno dopuścić,
aby nowe G/Th i stary ogólny Tanner równolegle zasilały sprzeczne obliczenia.
Panel i ściągi mają korzystać z zaakceptowanej makiety; ta zmiana nie dodaje
jeszcze wartości orientacyjnych Pradera ani opisów morfologicznych do produktu.
