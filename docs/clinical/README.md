# Zarządzanie logiką kliniczną

Ten katalog jest rejestrem zmian mogących wpływać na wynik lub interpretację medyczną. Nie jest zestawem wytycznych do leczenia i nie zastępuje źródeł pierwotnych.

## Statusy

| Status | Znaczenie |
|---|---|
| `zinwentaryzowane` | Zidentyfikowano pliki i funkcję modułu |
| `źródło do weryfikacji` | Źródło jest niepełne, niejednoznaczne albo niepowiązane z każdą stałą |
| `test regresyjny` | Istnieje test chroniący wybrane zachowanie; nie oznacza walidacji klinicznej |
| `zweryfikowane technicznie` | Implementację porównano ze wskazaną specyfikacją techniczną |
| `zatwierdzone klinicznie` | Właściciel kliniczny zatwierdził zakres, źródło i przypadki referencyjne |
| `wymaga ponownego przeglądu` | Zmieniły się wytyczne, dane albo wykryto niejednoznaczność |

Statusu `zatwierdzone klinicznie` nie nadaje agent ani automatyczny test.

## Co trafia do rejestru

- wzory i współczynniki;
- tabele, LMS, siatki, interpolacje i modele predykcyjne;
- progi, zakresy referencyjne i kategorie interpretacji;
- dawki, maksima, częstości i czas terapii;
- konwersje jednostek oraz zaokrąglenia wpływające na wynik;
- reguły zależne od wieku, płci, populacji lub wskazania;
- ostrzeżenia i komunikaty mogące wpływać na decyzję użytkownika.

## Minimalny zapis zmiany

Każdy PR kliniczny aktualizuje `ALGORITHMS.md` i podaje:

```text
Identyfikator:
Cel i moduł:
Pliki/API:
Populacja i zakres:
Wejścia oraz jednostki:
Wynik, progi i zaokrąglenie:
Źródło i wersja:
Pochodzenie/licencja danych:
Ograniczenia:
Przypadki regresyjne:
Testy:
Wpływ względem poprzedniej wersji:
Akceptacja kliniczna i data:
Commit/PR:
Termin ponownego przeglądu:
```

## Proces

1. Zidentyfikuj, czy zmiana może wpłynąć na wynik kliniczny.
2. Zweryfikuj źródło pierwotne i zakres populacji.
3. Udokumentuj jednostki, granice przedziałów i zaokrąglenia.
4. Przygotuj niezależnie obliczone przypadki typowe i graniczne.
5. Dodaj test wywołujący kod produkcyjny.
6. Zaktualizuj rejestr i opisz różnicę w PR.
7. Uzyskaj akceptację kliniczną właściciela.
8. Po wdrożeniu zachowaj commit, wersję i datę przeglądu.

## Priorytet weryfikacji

1. dawkowanie i monitorowanie terapii;
2. równania nerkowe i przeliczenia dawek;
3. interpretacje laboratoryjne i wartości krytyczne;
4. siatki, LMS i prognozy wzrostu;
5. żywienie, energia i plan redukcji;
6. komunikaty edukacyjne bez wpływu na wynik.
