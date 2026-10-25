# Klirens — zasady kolejnych poprawek interfejsu

Decyzje właściciela z audytu Klirensu, utrwalone 23.10.2026 po akceptacji
drugiej makiety ACR. Obowiązują przy kolejnych poprawkach w tym audycie.
Aktualne polecenie właściciela ma pierwszeństwo; sposób pracy z repozytorium
określa [AGENTS.md](../../AGENTS.md), a reguły kliniczne
[rejestr algorytmów](ALGORITHMS.md).

## Prosty, przewidywalny formularz

- Zachowuj stałą kolejność: wybór obliczenia → potrzebne dane → jeden wynik
  w stałym miejscu. Nie twórz osobnego wyniku liczbowego i „pełnego”.
- Wykorzystuj znane dane pacjenta. Dodawaj pytanie tylko wtedy, gdy zmienia
  obliczenie lub właściwe porównanie i odpowiedzi nie ma już w aplikacji.
- Brak danych do normy nie blokuje poprawnej liczby, jeżeli nie wymaga ich
  sam wzór. Krótko nazwij przyczynę braku porównania przy wyniku.
- Uproszczenie ankiety nie zmienia nieznanego faktu w potwierdzony.
  Założenia opisuj jako założenia; zachowuj znaczenie znanych sprzeczności.
- Dla ACR, PCR, Ca/Cr, Ox/Cr i Cit/Cr pierwszą, domyślną opcją jest **„Oblicz ze stężeń”**;
  **„Gotowy wynik ACR”**, **„Gotowy wynik PCR”**, **„Gotowy wynik Ca/Cr”**, **„Gotowy wynik Ox/Cr”** lub **„Gotowy wynik Cit/Cr”**
  jest drugą opcją.
- Dla Cit/Cr (decyzja 24.10.2026) lista stężenia cytrynianów ma cztery
  unikalne jednostki: **µmol/L, mmol/L, mg/L, mg/dL**. Postać masowa jest
  krótkim opisem z opcją **„Zmień”**, widocznym tylko przy mg; nie powiela
  jednostek w długich grupach. Nieznana postać nie staje się domyślnie
  kwasem lub jonem. Przy jednostkach molowych nie ma tego dodatkowego wyboru.

## Wyrównanie, porządek i symetria

- Szerokość formularza, karty wejścia, pól i karty wyniku nie może zależeć
  od trybu, wybranej opcji lub jednostki ani od długości wyniku i komunikatu.
  Sprawdź stan pusty, wynik prawidłowy, odchylenie, błąd i otwarte Szczegóły.
- Utrzymuj wspólne krawędzie, równy rytm odstępów i jednakowe wewnętrzne
  marginesy. Na desktopie wyrównuj górne krawędzie części formularza i wyniku.
- Równorzędne przyciski mają równe szerokości i wysokości. Wiersze wartości
  i jednostki mają stałe kolumny; dłuższa jednostka nie przesuwa reszty pól.
- Nie stosuj skalowania przy najechaniu, które zmienia widoczne wymiary
  przycisku lub karty. Zachowaj widoczny fokus i inne istniejące sygnały stanu.
- Etykiety nie mogą być zasłonięte przez obramowanie, kontrolkę lub legendę.
  Rozwinięcie opcji nie może powodować poziomego przewijania.
- Na telefonie pola wejściowe mają **co najmniej 16 px czcionki i 48 px
  wysokości**. Czcionka 16 px zapobiega typowemu automatycznemu przybliżeniu
  pól w Safari na iOS; sama wysokość pola nie wystarcza.
- Między dolną krawędzią przycisku **„Wyczyść wszystkie pola”** a sekcją
  wyniku zachowuj na telefonie **co najmniej 20 px odstępu**.
- Sekcja **„Zapisz wynik do karty pacjenta”** oraz jej akcje mają wspólne
  wyrównanie, równe odstępy i zrównoważony układ także po zmianie stanu zapisu.
- Korzystaj z design systemu aplikacji: istniejących tokenów, typografii,
  przycisków, obramowań i stanów. Lokalna poprawka jednego wzoru nie uzasadnia
  przebudowy innych formularzy.

## Jeden wynik z czytelną normą

Przyjęty schemat B łączy wynik pacjenta i normę w jednej karcie. Duża wartość
pacjenta z jednostką jest po lewej, dostępna norma w tej samej jednostce
po prawej, a krótki opis wyniku poniżej. Nie oddzielaj interpretacji od liczby
obcą wizualnie kartą i nie dodawaj kilku podobnych wierszy „odniesienia”.

- Stosuj prostą etykietę **„Norma dla wieku”**, jeśli istnieje odpowiednio
  uzasadnione odniesienie. Pokaż wyraźną granicę, np. **„<30 mg/g”** dla ACR.
- Na wykresie jasno oznacz, gdzie norma się zaczyna lub kończy. Jeśli brak
  miejsca albo wykres nie pomaga, wystarczy krótki opis i jawna nierówność.
- Wyniki nieprawidłowe oznaczaj bursztynowym lub czerwonym kolorem zgodnie
  z regułami danego profilu. Turkusowy nie sygnalizuje nieprawidłowości.
  Zachowaj tekstowy opis stanu; sam kolor nie wystarcza.
- Brak kwalifikującego wieku lub odpowiedniego profilu nie otrzymuje normy
  dorosłych ani zielonego werdyktu. Nie wymyślaj ciągłej krzywej wieku,
  jeśli źródło zawiera jedynie kategorie lub przedziały wieku.
- Dla FENa (decyzja 25.10.2026) karta pozostaje neutralna także >2%:
  **„Progi pomocnicze w AKI (dorośli)”** nie są normą zdrowej populacji.
  Dziecko lub nieznany wiek otrzymuje liczbę bez zastępczej normy i bez
  pytania o wiek do „pełnej interpretacji”. Znane PChN/diuretyki mają
  czytelną uwagę, a pochodzenie próbek jest opisanym założeniem; znana
  sprzeczność nadal blokuje obliczenie. Szczegóły polityki: [FENA.md](FENA.md).
- Dla FEK (decyzja 25.10.2026) formularz ma cztery stężenia w grupach
  **„Mocz”** i **„Krew”**, bez dodatkowej obowiązkowej ankiety. Właściwy
  wiek pobiera się z istniejących danych z zachowaniem ich dokładności.
  Orientacyjne pediatryczne P3–P97 opisuje się jako **„Norma dla wieku”**
  i zdrową populację; odchylenia są bursztynowe. Na granicy 12 miesięcy
  pokazuje się dwa nazwane zakresy bez jednej wspólnej oceny. Hipokaliemia
  oraz znane PChN/AKI/diuretyki mają pierwszeństwo przed uspokajającym
  statusem, nawet gdy liczba mieści się w zdrowym zakresie. Dorosłe 4–16%
  jest wyłącznie neutralnym **„Zakresem w badaniu dorosłych”**, nie normą
  całego życia. Brak właściwego profilu nie blokuje liczby i nie tworzy
  pytania do „pełnej interpretacji”. Granice i źródła: [FEK.md](FEK.md).
- Pełne poziomy, np. A1–A3 albuminurii, opisuj w zwiniętych
  **„Szczegółach i źródłach”**. Wyróżnij wyłącznie rzeczywiście nadaną
  kategorię pacjenta. Przycisk kategorii powinien otwierać właściwe Szczegóły.
- Wynik, porównanie, eksport i zapis mają opisywać tę samą ocenę. Zachowuj
  dokładną wartość, znak nierówności i kontekst użyty przed zaokrągleniem.

## Makieta i sprawdzenie przed przekazaniem

Każdą kolejną zmianę wizualną w audycie przedstaw najpierw do akceptacji jako
**„przed/po” na desktopie i telefonie**. Makieta ma być widoczna jako obraz
lub działający podgląd, a nie puste pole. Nie ponawiaj prośby o zgodę na zakres,
który właściciel już zaakceptował.

Po implementacji sprawdź prawdziwy formularz na desktopie oraz przy szerokości
390 i 320 px. Porównaj geometrię po przełączaniu trybów, jednostek i opcji,
nie tylko pojedynczy poprawny wynik. Sprawdź klawiaturę, fokus, czytelność
etykiet, brak przewijania w bok, odstęp pod czyszczeniem i sekcję zapisu.
Reguły wyglądu nie zastępują źródeł ani testów reguł klinicznych.
