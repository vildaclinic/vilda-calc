# Nowa strona główna — wdrażanie etapami

Decyzja właściciela z 2026-11-15: realizować zaakceptowaną makietę na osobnej
gałęzi `agent/nowa-strona-glowna` i udostępniać podgląd pod osobnym adresem.
Produkcja nadal pochodzi z `audyt`. Pierwsza baza: `28ee1c3e`.

## Ustalony kierunek

- Góra kontenera: wariant **Karta wizyty**; formularz **Dwie kolumny**.
- Telefon: **Równe pola**, jedna linia wizyty, daty i historii, bez dużego
  tytułu „Ocena pacjenta”. Tablet i telefon bez sztucznie pustych kart.
- Oryginalne podsumowanie **Wyniki/Siatka** zachowuje renderer, zakładki,
  dane i miniaturę SVG. Docelowo wyniki profesjonalne bez przełącznika trybu.
- Formularz zawiera imię i nazwisko oraz równe przyciski czyszczenia i
  kopiowania podsumowania. Kontekst zespołu Downa pochodzi z karty pacjenta.
- Wybór siatek referencyjnych jest listą rozwijalną jak w zatwierdzonej
  makiecie. Świadome odstępstwa wizualne i interakcyjne wymagają wcześniejszego
  uzgodnienia z właścicielem; nie zastępujemy samodzielnie rodzaju kontrolki.
- Dodatkowe dane w jednakowych oknach z animacją otwierania 180 ms, zgodnie
  z makietą. Wybrane 300 ms dotyczy nawigatora historii wizyt. Obie animacje
  respektują ograniczenie ruchu. Formularze pozostają w dokumencie właściciela.
- Cztery główne karty na desktopie mają jednakowy rozmiar; ich zakładki nie
  zmieniają wysokości. Rozszerzenie następuje wyłącznie przez jawną akcję.
- Dokumenty to jeden punkt wyboru generatorów, dostępny z istniejącego menu.
- Historia wizyt jest domyślnie tylko do odczytu. Wybór wizyty nie wczytuje
  jej do formularza i nie odrzuca bieżących zmian.

## Etapy

1. Podstawa układu, środowisko podglądu i wspólne zasady interakcji.
2. Dokończenie formularza i podsumowania oraz zachowania na małych ekranach.
3. Dane pokwitaniowe i okołoporodowe, z istniejącym wyliczaniem SGA.
4. Zaawansowane obliczenia wzrostowe, metody i analiza trajektorii.
5. Zalecenia dietetyczne wraz z drogą do normy BMI.
6. Karta pacjenta i Przypomnienia.
7. Pozostałe narzędzia i wspólny wybór dokumentów/siatek.
8. Jawne powiązania notatek, badań i planów z wizytą.
9. Historyczny kontekst leczenia i rozróżnienie informacji bieżących.
10. Przestrzenny nawigator wizyt i ich szczegóły.

Trwałe identyfikatory wizyt są już wdrożone przez PR #958. Historia opiera się
na `VildaVault.getPatientVisits(patientId)`, a nie na ponownym grupowaniu
rekordów wyłącznie po dacie: dwie jawnie rozpoczęte wizyty jednego dnia
zachowują odrębność. Zobacz `PATIENT_VISITS.md`.

## Pierwszy przyrost interfejsu

`vilda_home_workspace.js` i `.css` są czytelnymi źródłami wykonywanymi bez
kompilacji. Warstwa jest aktywna wyłącznie przy jawnej fladze
`window.__VILDA_HOME_WORKSPACE_PREVIEW__ === true`, ustawianej przez eksport
podglądu. Zwykłe wejście do aplikacji zachowuje dotychczasowy widok.

Moduł przenosi oryginalne węzły pól i przycisków w obrębie `index.html`.
Nie klonuje formularza, nie zmienia kolektorów i nie zapisuje stanu pacjenta.
Zachowuje również obecną datę urodzenia, tygodnie u niemowląt i reguły
tożsamości pacjenta, których starsza makieta nie odzwierciedlała w całości.

Na tym etapie przycisk historii otwiera istniejący podgląd tylko do odczytu.
Dolne moduły i formularz pokwitania pozostają w dotychczasowej postaci do
odpowiednich etapów. Podgląd aplikacji nie jest deklaracją ukończenia makiety.

## Drugi przyrost — formularz i natywne podsumowanie

Góra kontenera odwzorowuje „Kartę wizyty”: tytuł, wyśrodkowany kontekst daty
i przycisk historii. Formularz oraz podsumowanie zajmują dwie kolumny powyżej
850 px, a na tablecie do 850 px układają się pionowo i zachowują naturalne
wysokości. Telefon do 600 px ma zwartą górę, równe pola i przyciski „Wyczyść”
oraz „Skopiuj wyniki”. Daty urodzenia, tygodnie niemowląt, komunikaty błędów
i zasady edycji tożsamości pozostają natywne.

Lista rozwijalna OLAF / OLA, Palczewska, WHO odwzorowuje makietę. Oryginalny
`dataToggleContainer` z radiami pozostaje niewidocznym nośnikiem stanu w tym
samym formularzu: zachowuje słuchacze, wybór ręczny i natywne reguły dostępności.
Lista wyłącznie odczytuje `checked`/`disabled`, a wybór użytkownika wywołuje
kliknięcie oryginalnego radia. Nie ma własnych progów wieku ani stanu do zapisu.
Nie posiada ID ani nazwy; jej własne zdarzenia są zatrzymywane przed
dokumentowym autosave, zaś natywne zdarzenia radia przechodzą zwykłą drogą.
Po potwierdzeniu
rzeczywistego dostępu lekarskiego oraz zakończeniu odtwarzania widok używa
natywnego przełącznika do ustawienia wyników profesjonalnych i dopiero wtedy
ukrywa kontrolkę trybu oraz etykiety PRO. To zmiana preferencji prezentacji,
nie uprawnień konta. Starszy zapis standardowy otrzymuje profesjonalny tryb
wyświetlania bez zmiany jego wartości klinicznych.

Kopiowanie respektuje zarówno dostępność natywnego przycisku, jak i
`CARD_VISIBILITY.metabolicSummaryBtn`; widoczna sekcja zaleceń dietetycznych
nie wystarcza do odblokowania kopiowania. Przy wyłączonym przez użytkownika
przycisku pozostaje jedna akcja czyszczenia.

Renderer podsumowania, zakładki i pojedynczy SVG pozostają oryginalne.
Natywna geometria nadal odpowiada za dopasowanie wysokości na desktopie.
Obecne reguły porównania z poprzednim pomiarem zachowują osobny widok;
docelowa polityka samego konsensusu oraz współistnienia bieżącego podsumowania
i porównania należy do etapu 4. Okna pokwitania i danych okołoporodowych
należą do etapu 3.

## Podgląd i odbiór

Podgląd jest osobnym eksportem z gałęzi roboczej, z własnym pochodzeniem
sieciowym i fikcyjnymi danymi. Ustawienia demonstracyjne nie są ładowane
przez aplikację produkcyjną. Eksport ma odłączone usługi produkcyjne;
osobny adres bez takiej blokady nie byłby wystarczający.

Zmiany trafiają przez PR do gałęzi integracyjnej. Każdy przyrost przechodzi
kontrole swojej dokładnej wersji, w tym testy przechowywania danych i
zachowania interfejsu. Procedura GitHub i wersjonowania:
`GITHUB_WORKFLOW.md`, sekcja nowej strony głównej.

Publikacja do `audyt` nastąpi dopiero po osobnym odbiorze całego rozwiązania.
Przed końcowym PR należy scalić aktualne `audyt`, przeliczyć wersje względem
niego i ponownie sprawdzić cały wynik. Nie zmieniamy wzorów ani interpretacji
medycznych w ramach przebudowy układu.

Końcowy PR musi także jawnie włączyć docelowy interfejs w zwykłym wejściu
aplikacji i sprawdzić ten wariant bez demonstracyjnego bootstrapu. Samo
scalenie modułu opt-in nie zmienia domyślnego widoku. Eksporter, fikcyjne
konto i blokada usług są wyłącznie narzędziami podglądu.

Nowy JS i CSS strony głównej korzystają z istniejącego, sprawdzanego po SHA
pakietu transportowego UI wizyt. Pakiet zawiera pięć zasobów zamiast trzech;
każdy nadal ma własny wersjonowany adres i niezmienioną treść w pamięci offline.
Historyczny pakiet pozostaje dostępny. Pozwala to zachować dotychczasowy limit
600 żądań podczas instalacji PWA, bez usuwania zasobów ani rozluźniania testów.
