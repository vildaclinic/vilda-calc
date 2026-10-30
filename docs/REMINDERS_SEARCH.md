# Przypomnienia: Szukaj i ukrywanie treści

Zakładka **Szukaj** zastępuje historię w obszarze Przypomnień. Historia
pomiarów w Karcie pacjenta zachowuje własny zakres i działanie.

## Wyszukiwanie

`vilda_global_search.js` buduje indeks w pamięci z nagłówków pacjentów
podstawowych i zewnętrznych, wszystkich notatek pacjentów i wydarzeń oraz
kanonicznych planów opieki. Indeks obejmuje przyszłe i bezterminowe sprawy,
zapisane opisy badań, nazwy procedur oraz treść kroków planu. Techniczne
przypomnienia planu nie tworzą powtórnych wyników tego samego planu.

Wyszukiwanie ignoruje wielkość liter i polskie znaki; wszystkie podane słowa
muszą wystąpić w wyniku. Filtry terminu i stanu działają niezależnie. Daty
wydarzenia, przypomnienia, badania i wykonania mają osobne etykiety.

Indeks powstaje dopiero przy pierwszym zapytaniu lub użyciu filtra. Kolejne
znaki zapytania nie powodują ponownego odszyfrowania danych. Zapis, usunięcie,
synchronizacja i zmiana sesji unieważniają indeks. Po odczytach asynchronicznych
sprawdzany jest właściciel sesji i numer generacji. Blokada usuwa zapytanie
i wyniki z widoku. Indeks nie jest zapisywany w storage ani wysyłany do usługi
zewnętrznej. Wyszukiwanie nie odczytuje pełnych migawek pomiarów i nie
interpretuje ponownie wyników klinicznych.

`vilda_global_search_view.js` udostępnia podgląd. Wybranie wyniku nie wczytuje
pacjenta do formularza; przejście do karty, sprawy, wydarzenia lub planu wymaga
osobnego przycisku. Na telefonie powrót zachowuje zapytanie, filtry i pozycję listy.

## Ukrywanie podczas prezentacji

`vilda_reminders_privacy.js` uruchamia się przed rendererem. Preferencja
`remindersPrivacyHidden` ma klasę `local-persistent` i dotyczy urządzenia,
bez synchronizacji konta. Klasa dokumentu chroni pierwszy render, a rejestracja
widoku dodaje `inert`, `aria-hidden` i ukrycie właściwej treści. Osłona pokazuje
neutralny wzór zamiast rozmywania nazwisk. Nie odsłania się po najechaniu myszą.

To samo ustawienie obejmuje kartę, powiększony obszar, wyszukiwarkę, plany
i osobne formularze wykonania lub planu otwarte z Przypomnień. Ukrycie nie
usuwa szkicu formularza. Nagłówek aplikacji i formularz pacjenta pozostają
poza zakresem tego przełącznika. Ramki powłoki otrzymują zmianę synchronicznie;
inne karty przeglądarki przez zdarzenie storage.

## Czyszczenie pacjenta

`vilda_centile_live_data.js` rozpoznaje jawne wyczyszczenie pól i natychmiast
zwraca stan niekwalifikujący się do pokazania siatki. Istniejąca kwarantanna
zapisu 2500 ms nadal blokuje spóźnionych autorów danych. Tymczasowy brak
identyfikatora podczas prawdziwego odtwarzania nadal oznacza oczekiwanie.
Wczytanie kolejnego pacjenta odwołuje znacznik jawnego czyszczenia.
