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

## Prezentacja zapisanych wyników i dawek

Wyniki Klirensu w podglądzie oraz indeksie korzystają z
`ClcrNotesView.summary()`, opartego na tym samym `model()` co Notatki w Karcie
pacjenta. Skrót zawiera wynik z jednostką, ważne odniesienie przy zapisie,
utrwaloną ocenę i interpretację, istotne zastrzeżenia oraz komentarz lekarza.
Techniczne drzewa i blok `VILDA_CLCR_CALCULATION` pozostają w danych źródłowych,
ale nie są wyświetlane ani indeksowane. Nieaktualna lub uszkodzona ocena nie
odzyskuje normy ani interpretacji przez powrót do surowego tekstu.

Czytnik Notatek jest ładowany leniwie wyłącznie wtedy, gdy odczytane notatki
zawierają wynik Klirensu. Ładowanie współdzieli bieżące żądanie indeksu. Po jego
zakończeniu ponownie sprawdzane są konto i generacja. Brak modułu, błąd
ładowania albo stara wersja bez `summary()` daje błąd z możliwością ponowienia;
nie powoduje wyświetlenia technicznego zapisu. Podgląd nie ładuje silników
klinicznych, bieżących norm ani edytora obliczeń.

Dla zwykłych wyników wybierana jest jedna zapisana reprezentacja przez
`VildaLabAssessmentUI.formatResult()`. Zachowane pozostają zera, wyniki
jakościowe, operatory i tekst konwersji. Zapisana ocena laboratoryjna i
odniesienie hormonalne korzystają z tych samych rendererów co Notatki,
również dla jawnego stanu niedostępnego lub unieważnionego.

Zapisana linia `Dawka:` lub `Nowa dawka:` nie jest rekonstruowana z
`doseNum`. Tekstowe `medication.dose` jest pokazywane bez dodatkowej liczby,
jednostki i częstości. Liczbowe starsze wpisy GH korzystają z istniejącej
prezentacji historii; pozostałe leki nie otrzymują nowej reguły zaokrąglania.
Częstość nie powiela już jednostki dobowej lub tygodniowej; `/dL` pozostaje
jednostką stężenia. Oryginalne pola zwykłych notatek nadal są wyszukiwalne
w prywatnym indeksie, nawet gdy zduplikowana reprezentacja znika z podglądu.

Zmiana dotyczy odczytu i prezentacji. Nie zmienia zapisów pacjenta, snapshotów,
wyników obliczeń, progów ani zasad synchronizacji. Nawigacja i cykl aktualizacji
indeksu są odrębnymi częściami naprawy.

### Zakres sprawdzonych producentów

Regresje obejmują cały rejestr wyników, a nie tylko ACR i wapń:

- Klirens: 45 parametrów z 41 formuł źródłowych, w tym trzy wyjścia białka
  i trzy metryki KT/V. Łącznie 108 rzeczywistych zapisów obejmuje dodatkowe
  metody, jednostki, tryby wprowadzania, podstawy masy i zera. Zbiór kluczy jest
  porównywany z produkcyjnym `PARAM_DICTIONARY`, aby nowy wynik nie został
  pominięty. Historyczny, wyłączony `sch_var` nie jest rejestrowanym wynikiem
  możliwym do zapisu.
- Przelicznik laboratoryjny: 34/34 anality z `LabUnitConverter.list()`, rzeczywista
  konwersja, writer przypięcia, zapis i wyszukiwanie. Każdy analit ma też próbę
  zachowania kwalifikatora. Osobno sprawdzany jest utrwalony zakres TSH oraz
  zapisane stany ocen i odniesień; wyszukiwanie nie dobiera nowych norm.
- DocPro: rzeczywisty producent kontroli GH/IGF-1 dla dawkowania dobowego,
  tygodniowego i mekaserminy. Testy korzystają z kodu schedulera, zamiast
  tworzyć ręcznie tekst przypominający wynik modułu.
- Pozostałe rodziny: ręczne notatki, szybka kontrola pacjenta, Terminarz,
  tworzenie przypomnienia, wykonanie/przełożenie/wynik i kolejny krok,
  dokumentacja planu opieki oraz istniejące transporty i odzyskiwanie notatek.

Punkty monitorów GH i otyłości, wiek kostny i ocena pokwitania zapisane tylko
w snapshotach pacjenta nie są osobnymi `PatientNote`. Wirtualne pozycje Historii
mają `noteId: null`; indeks Szukaj nie odczytuje pełnych snapshotów ani biblioteki
osobistych szablonów. Próby sprawdzają tę granicę, bez dodawania fikcyjnych
notatek lub rozszerzania modelu wyszukiwania.

Przeglądarkowa próba całego zestawu otwiera 111 rzeczywistych wpisów przy każdej
z dwóch szerokości: 108 wyników Klirensu i trzy kontrole DocPro. Sprawdza
niezmienność zapisanych notatek i danych pacjenta, brak nowych zasobów edytora
oraz rzeczywiste wykonanie `readSaved` i zero wywołań `evaluate/recalculate`
w pokryciu V8. Silniki Na/K już obecne na stronie Start zachowują tożsamość;
wyszukiwanie nie ładuje ich ponownie.

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
