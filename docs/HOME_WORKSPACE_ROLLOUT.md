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

## Trzeci przyrost A — robocze dane pokwitaniowe

Przycisk danych pokwitaniowych otwiera w podglądzie krótkie okno oceny
bieżącej wizyty, bez zakładek i wywiadu. G/Th i P są oddzielnymi listami
rozwijalnymi. Data pozostaje datą otwartej wizyty. Objętość jąder udostępnia
obecnie etap 4 w danych zaawansowanych (decyzja właściciela 2026-11-16).
Wspólny renderer zachowuje dotychczasowe opisy i ściągi;
pozostałe miejsca korzystające z niego zachowują swoje obecne kontrolki.

Wejście do okna jest kafelkiem z zatwierdzonej makiety: dwuwierszowa nazwa,
ikona powiększenia i stan uzupełnienia, w połowie szerokości pary skrótów.
Na telefonie kafelek ma zwartą wysokość zależną od treści. Natywne odświeżenie
etykiety korzysta z tej prezentacji wyłącznie w podglądzie; zwykły formularz
i DocPro zachowują dotychczasowy przycisk. Opis ocen wcześniejszych lub
wymagających sprawdzenia pochodzi z istniejącego renderera, bez zmiany oceny.

Pola okna są szkicem bez identyfikatorów i nazw kanonicznych pól. Zdarzenia
szkicu kończą się przed dokumentowymi słuchaczami autosave. Otwarcie i
anulowanie nie zapisują sesji, nie przydzielają wizyty i nie zmieniają
pochodzenia oceny. „Zastosuj dane pokwitaniowe” przekazuje kompletny zestaw
ocen do natywnego stanu w jednej operacji. Objętość pozostaje w dotychczasowym
zapisie zaawansowanym; to okno jej nie edytuje. Wiek początku pokwitania,
dane menarche, KOWD i GnRHa pozostają w dotychczasowym zapisie, poza edytorem
bieżącego badania. Ich udostępnienie w nowych miejscach jest osobnym etapem;
zmiana okna ich nie usuwa ani nie przepisuje.

Krzyżyk, Escape, kliknięcie tła i Wstecz wymagają potwierdzenia odrzucenia
zmienionego szkicu. Zmiana konta, pacjenta, wizyty lub bazowych danych
unieważnia szkic. Okno ma rozmiar i animację 180 ms z makiety; ustawienie
ograniczonego ruchu wyłącza animację. Powłoka wykrywa otwarte okno w ramce
i chowa zasłaniający je dock. Po zwykłym zamknięciu wraca fokus przycisku.

Dane okołoporodowe i integracja SGA stanowią osobny przyrost 3B.

## Trzeci przyrost B — dane okołoporodowe i SGA

Drugi równy kafelek formularza otwiera okno danych okołoporodowych. Oba
edytory korzystają z tego samego szkieletu okna, geometrii, animacji i stopki.
Okno zawiera wiek ciążowy w tygodniach i dniach oraz masę, długość i obwód
głowy przy urodzeniu. Płeć pochodzi z formularza pacjenta. Stan kafelka
rozróżnia brak danych, dane częściowe i dane pozwalające obliczyć SGA.
Pola tego okna układają się na telefonie w jednej kolumnie, zgodnie z makietą;
główny formularz zachowuje swój osobny układ „Równe pola”.

Wynik aktualizuje się w szkicu bez tworzenia zapisu. Wybór Niklasson,
INTERGROWTH-21st i Malewski oraz ich porównanie wykorzystują dokładnie
natywną prezentację DocPro. Mechanicznie wydzielone funkcje pozostają w
`sga_birth_module.js`; nie zmieniono wzorów, norm, progów, jednostek ani
zaokrągleń. Czternaście przypadków sprzed wydzielenia utrwala kompletny HTML,
komunikaty i ocenę. Arkusz wyników jest odtwarzalnym podzbiorem oryginalnego
arkusza DocPro (`node tools/build-sga-result-styles.mjs --check`). Zmniejszenie
inwentarza stylów JS z 20 do 11 wynika z usunięcia dziewięciu powtórzeń
ukrywania wyniku z gałęzi walidacji, obsługiwanych teraz w jednym miejscu.

Zapis zatwierdza wyłącznie kanoniczne `birth`, wspólne z kartą SGA w DocPro.
Osobne `perinatal` Karty pacjenta i jego dodatkowy wywiad pozostają nietknięte;
zachowujemy dotychczasowe ostrzeżenie o rozbieżności. Gdy `birth` jest
nieobecne, okno może wyświetlić pomiary z `perinatal` jako szkic. Jawnie
zapisane puste `birth` nie jest ponownie wypełniane przy otwarciu.

Zapis korzysta z istniejących zabezpieczeń kolektora i sesji. Tylko jawnie
zatwierdzona wartość uzyskuje prawo edycji `birth`, powiązane z kontem,
pacjentem, wizytą, generacją wczytania i sesją vaulta. Późniejsza obca zmiana
globalnej zmiennej nie dziedziczy tego prawa. Nie powstaje automatycznie
wersja pacjenta w vault; tworzy ją dotychczasowy zapis pacjenta. Anulowanie,
odrzucenie szkicu i odczyt pozostają bez skutków zapisu. Dane częściowe można
zachować, ale bez fikcyjnej oceny SGA. Niezmieniony wynik zachowuje oryginalną
datę obliczenia. Wszystkie zmiany interfejsu pozostają opt-in.

Nowy pomiar przed pierwszym zapisem pacjenta zachowuje dane SGA po F5.
Dotyczy to również pomiaru bez wpisanego imienia i nazwiska.
Gdy natywny start pozostawia pola odtworzone przez `sharedUserData`, importer
odzyskuje tylko niezainicjalizowane `birth`: jednorazowo, przed edycją,
z niezmienionej sesji i z kontrolą konta, klucza, panelu, ramki oraz zgodności
imienia/nazwiska, płci, daty urodzenia i dostępnych pomiarów. Nie wczytuje przy
tym całego starego formularza ani nie tworzy wizyty. Osobne testy sprawdzają
odmowę po zmianie danych, właściciela lub sesji. Po czyszczeniu przycisk wraca
do aktywności po rzeczywistym końcu natywnej blokady; jej czas pozostaje ten sam.

## Czwarty przyrost — zaawansowane obliczenia wzrostowe

`vilda_home_growth.js` jest czytelnym, wykonywanym bez kompilacji modułem opt-in.
Na stronie głównej pokazuje zwartą kartę z tempem wzrastania, MPH i wiekiem
kostnym. Desktop zachowuje wysokość 352 px z makiety; tablet i telefon używają
naturalnej wysokości. Edycja i analiza otwierają wspólne okno o dotychczasowej
geometrii i animacji, z zakładkami **Analiza / Dane i pomiary / Prognozy**.
Po aktualizacji PWA i odtworzeniu sesji gotowość przycisków jest ponownie
sprawdzana również wtedy, gdy ostatnia natywna blokada znika bez zdarzenia.
To odświeżenie dotyczy wyłącznie dostępności UI, bez obliczeń i zapisu danych.

Decyzja właściciela z 2026-11-16: pytanie o objętość jąder jest wyłącznie
w danych zaawansowanych. Opis wyjaśnia zastosowanie w profilu KOWD/CDGP
i interpretacji prognoz oraz odrębność od G Tannera. Kanoniczny węzeł
`advTesticularVolume`, opcje i zapis `advanced.testicularVolume` pozostają
te same. Nie ma migracji ani zerowania wcześniej zapisanych wartości.
Kafelek pokwitania opisuje samą ocenę G/Th/P, a nie wywiad z innego okna.

Pola, dane rodzinne, wywiad i historyczne pomiary są szkicem bez kanonicznych
ID i nazw. Zdarzenia szkicu nie docierają do dokumentowego autosave. Otwarcie,
zakładki i anulowanie nie liczą ani nie zapisują danych klinicznych. Zastosowanie
najpierw sprawdza ważność konta, klucza vaulta, pacjenta, wizyty, generacji
wczytania i całego bazowego zestawu wejść. Zmiana właściciela unieważnia szkic;
zapis faktów ma również kontrolę po synchronicznym powiadomieniu odbiorców.

Zatwierdzenie uzupełnia dotychczasowe pola i powiadamia natywne słuchacze.
Istniejące wiersze pomiarów zachowują węzły, metadane, adnotacje i tożsamość
synchronizacji. Dodawanie i usuwanie przechodzi przez dotychczasowe akcje,
łącznie z powiązaniem ze Szacowanym spożyciem. Wiersze terapii GH są tylko
do odczytu. Zapis w vault pozostaje osobną akcją lekarza; zamknięcie okna
zatwierdza sesję, a nie tworzy automatycznie wersji pacjenta.

Widoki analityczne kopiują wyłącznie już wyrenderowane wyniki natywnego
`advResults`: trajektorię i tę samą kartę metod z uzasadnieniem, przedziałami
oraz ograniczeniami. ID kopii są odrębne od kanonicznych. Nie ma drugiej ścieżki
obliczeń, nowych norm, progów, współczynników ani danych demonstracyjnych
udających wynik. Niezastosowany szkic zasłania wyniki i wyłącza eksport.
Raport korzysta z istniejącego generatora. Skrót „Generuj siatki” i wejście
z Dokumentów pacjenta prowadzą do tego samego edytora ustawień i adnotacji.

Podsumowanie strony głównej zachowuje tylko linie konsensusu rozpoznane
przez natywne `linieKonsensusu()`, również przy nazwie pojedynczej metody.
Pozostałe metody są dostępne w oknie zaawansowanym. Nie zmienia to źródłowych
linii kopiowania ani prezentacji DocPro; brak konsensusu nie jest zastępowany
samodzielnie wybraną metodą. Pełny opis źródeł: `ZRODLA_ARTEFAKTOW.md`.

### Przyjęty wariant A2 — 17 listopada 2026

Dane rodzinne i aktualny wiek kostny są nad tabelą historycznych pomiarów.
Tabela pokazuje najnowsze pomiary na górze; kolejność kanonicznych węzłów
pozostaje niezmieniona. Warunki interpretacji i początek dojrzewania z wywiadem
są domyślnie zwinięte. Na telefonie tabela przechodzi w zwarte grupy pól.

Analiza pokazuje wykres surowych pomiarów, trzy natywne karty trajektorii obok
oraz kontekst tempa, MPH i wieku kostnego poniżej. Pełny natywny opis odcinków
pozostaje w szczegółach. Model jest przekazany wyłącznie jako metadane DOM
z tego samego renderowania, bez ponownego analizowania i bez kontekstu konta.
Wykres wartości nie zastępuje siatki centylowej.

Prognozy eksponują natywny konsensus i kontekst. Zakresy metod używają wartości
publikacyjnej i jej natywnego błędu; nie oznaczają przedziału ufności konsensusu.
Przy obciętym wyniku pozostaje sam punkt z pełnym dotychczasowym opisem zakresu.
Wykluczenia, korekty, wiarygodność i ograniczenia metod pozostają z oryginalnego
renderera. Nie ma dodatkowego wykluczania wyników przez nowy widok.

Akcja punktu GH osadza dotychczasowy formularz w tym samym wspólnym oknie.
Zapis przechodzi przez natywnego aktora VildaGhPunktZWiersza / VildaGhPunkty;
nie ma kopiowania reguł dawkowania ani drugiego zapisu. Po zapisie widok czeka
na natywny import wiersza terapii. Zapisane punkty pozostają tylko do odczytu,
z przejściem do DocPro po jawnej akcji. Anulowanie nie zmienia danych.

Komentarze, strzałki, układ PDF Palczewskiej (2 A4 pion / 1 A4 poziom) i tryb
publikacji są dostępne w jednym oknie „Generuj siatki”, również z Dokumentów.
Są szkicem z jawnym zastosowaniem. Generowanie i oba kreatory wywołują istniejące
przyciski, ich kwalifikację i kontekst. Okno nie wprowadza nowych generatorów,
interpretacji zakresu wieku, danych ani schematu zapisu. Ten skrót nie oznacza
zakończenia późniejszego etapu przebudowy całego centrum Dokumentów.

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
pakietu transportowego UI wizyt. Pakiet zawiera jedenaście zasobów zamiast trzech;
każdy nadal ma własny wersjonowany adres i niezmienioną treść w pamięci offline.
Historyczny pakiet pozostaje dostępny. Pozwala to zachować dotychczasowy limit
600 żądań podczas instalacji PWA, bez usuwania zasobów ani rozluźniania testów.
