# Rozszerzanie interpretacji badań laboratoryjnych — instrukcja dla agentów AI

Stan: 9 października 2026. Instrukcja utrwala decyzje właściciela wypracowane
przy LH/FSH, w tym automatyczny dobór profili i ocenę dorosłych z PR #602.
Stosuj ją przy rozszerzaniu interpretacji o kolejne grupy wieku, etapy
pokwitania i anality, np. inhibinę B. Aktualne polecenie właściciela ma
pierwszeństwo; ogólne zasady pracy pozostają w [AGENTS.md](../../AGENTS.md).

## 1. Cel: szybkie sprawdzenie wyniku, „easy and clean”

Lekarz wybiera badanie, wpisuje wynik i jednostkę. Aplikacja wykorzystuje
znane już dane pacjenta, dobiera właściwy zakres i pokazuje czytelne porównanie.
Nie zamieniaj przelicznika w rozbudowaną ankietę ani formularz opisu próbki.

Najważniejsze wymagania:

- Maksymalnie wykorzystuj bieżący formularz i kartę pacjenta: wiek, płeć,
  ocenę pokwitania, wcześniactwo oraz dostępne dane okołoporodowe.
- Dodawaj pole tylko wtedy, gdy brakująca odpowiedź rzeczywiście zmienia
  dobór zakresu lub interpretację i nie można jej wiarygodnie pobrać z aplikacji.
- Zachowaj obecny układ przelicznika, dużą wartość wyniku, przeliczenia i osie.
  Rozszerzenie jednego hormonu nie uzasadnia przebudowy pozostałych badań.
- Automatyzuj dobór profilu źródłowego. Lekarz nie ma obowiązkowo wybierać
  publikacji, metody ani profilu przed każdym sprawdzeniem.

## 2. Najpierw ustal rzeczywiste pokrycie kliniczne

Celem jest interpretacja od wcześniactwa do późnej starości, w granicach
dostępnych dowodów. Dla danego analitu sporządź krótką mapę dostępności:
wcześniaki, noworodki i niemowlęta, dzieci przed pokwitaniem, poszczególne
stadia pokwitania, dorośli i osoby starsze, osobno dla płci. Uwzględnij cykl
lub menopauzę wyłącznie tam, gdzie ma to znaczenie dla tego analitu i źródła.

Dla każdego zakresu sprawdź pełną publikację lub aktualny katalog laboratorium
oraz potrzebny suplement. Zapisz źródło, wersję/datę odczytu, populację,
metodę, materiał, jednostkę, granice wieku i stadium oraz ograniczenia.
Podaj dokładną tabelę/stronę albo sekcję katalogu; nie przedstawiaj odczytu
abstraktu jako weryfikacji pełnych norm. Instrukcja producenta cytowana
przez katalog nie oznacza, że agent sam ją przeczytał.

Rozróżniaj zakres referencyjny, granicę oznaczalności, przedział ufności
granicy zakresu, średnią z odchyleniem i próg diagnostyczny. Nie zastępują
się wzajemnie. Nie odczytuj dokładnych norm z osi wykresu i nie twórz ich
przez nieuzasadnione przeliczenie statystyk.

Nie łącz norm z jednej publikacji z metodą, populacją lub kryteriami
kwalifikacji z innej bez udokumentowanego uzasadnienia. Wersja robocza
artykułu nie zastępuje zweryfikowanej wersji końcowej.

Brakujące dane nazwij konkretnie: jaka grupa pozostaje bez oceny i czego
brakuje do jej uruchomienia. Jeżeli potrzebny jest pełny tekst, wskaż
właścicielowi tytuł, DOI/PMID lub link oraz tabelę lub informację do sprawdzenia;
właściciel może dostarczyć artykuł. Równolegle wykonuj prace niezależne od tego
braku. Nie uzupełniaj luk wymyślonymi normami ani zastępczą normą dorosłych.

## 3. Dobieraj źródło automatycznie, zachowując jego ograniczenia

Zakres wybieraj według analitu, znanego kontekstu pacjenta i jawnej,
wersjonowanej polityki. Nigdy według tego, która norma daje korzystniejszy
werdykt dla wpisanej wartości. Liczba publikacji nie może przekładać się
na tyle samo obowiązkowych selektorów.

- Metoda i materiał publikacji opisują **zakres źródłowy**. Nie wpisuj ich
  automatycznie jako ustalonych faktów dotyczących próbki pacjenta.
- Dla LH/FSH zatwierdzono orientacyjne porównanie z automatycznie dobranym
  źródłem. Dla nowego analitu sprawdź, czy taki sposób porównania jest
  merytorycznie uzasadniony; sama zgodność jednostek nie dowodzi zgodności metod.
- Zachowaj w danych rozróżnienie porównania orientacyjnego i potwierdzonej
  klasyfikacji laboratoryjnej. W LH/FSH odpowiadają temu m.in. `referencePreview`
  oraz `biochemical`; nie sprowadzaj obu sytuacji do jednej flagi „prawidłowy”.
- Krótko podaj źródło, metodę zakresu i zakres zastosowania. Nie przywracaj
  odrzuconej etykiety **„metoda próbki niepotwierdzona”** ani równoważnego badge.
- Brak odpowiedzi nie oznacza braku leczenia ani potwierdzenia oznaczenia
  bazalnego. Znane leczenie, stymulacja lub niezgodny materiał/metoda muszą
  zachować znaczenie, nawet gdy uproszczony formularz nie pyta o te dane.
- Nie twierdź, że moduł dostosowuje normy do terapii lub testu stymulacyjnego,
  jeżeli nie ma osobnego, udokumentowanego profilu. Przy zakresie bazalnym
  wystarcza krótka informacja o zastosowaniu; selektor nie zastępuje algorytmu.

Wiek i stadium muszą odpowiadać definicjom źródła. Zachowuj nierówności
`<`, `≤`, `>`, `≥`; nie dopisuj precyzyjnej daty do wieku w latach/miesiącach.
Gdy niepewność wieku obejmuje różne zakresy, pokaż krótkie alternatywy lub
konkretną przyczynę braku porównania. Nie sklejaj zakresów w jedną szeroką normę.
Wyjątek doprecyzowany przy inhibinie B: gdy warianty są skrajnymi granicami
**jednej krzywej wieku**, obejmują cały możliwy wiek i wszystkie zapisane
porównania dają ten sam jednoznaczny status, pokaż ten pewny wniosek.
Niepewność wieku nie może ukrywać wyniku przekraczającego każdą możliwą
górną granicę. Zachowaj osobne granice i ograniczenia źródła; nie stosuj
tego wyjątku do różnych profili, metod, faz cyklu ani niezgodnych statusów.

Nie utożsamiaj wieku chronologicznego, skorygowanego, wieku po urodzeniu
(PNA) i postmenstruacyjnego (PMA). Granice wcześniacze i wyłączenie pierwszej
doby przy LH/FSH należą do konkretnego profilu Greaves; nie przenoś ich
automatycznie na inhibinę B lub inny hormon.

## 4. Formularz wykorzystuje bieżący kontekst pacjenta

Ocena nowego wyniku odnosi się do kontekstu widocznego w formularzu.
Lokalna korekta dotyczy tego sprawdzenia i nie może bez potrzeby zmieniać
karty pacjenta. Nie przypisuj dzisiejszego wieku lub stadium dawnej próbce.

Nie odtwarzaj usuniętych elementów jako domyślnej części nowego modułu:

- materiał, wybór profilu i rzeczywistej metody próbki, potwierdzanie metody;
- źródło obserwacji i potwierdzenie, że dotyczy dnia pobrania;
- osobne selektory leczenia/stymulacji i rozbudowany wywiad początku/przebiegu;
- pytania o OUN, regresję, dokładną objętość jąder i metodę jej pomiaru;
- „Wcześniejsze badanie”, „Wynik z innej daty” i dodatkową datę pobrania;
- „Zakres z wydruku” i przepisywanie norm laboratoryjnych.

Nową potrzebę kliniczną rozwiąż najpierw odczytem istniejących danych lub
ograniczeniem zakresu działania. Jeśli dodatkowa informacja jest konieczna,
przedstaw jej rzeczywisty wpływ i najprostszy wariant obsługi. Nie dodawaj
pól „na wszelki wypadek” ani ukrytej obowiązkowej konfiguracji.

Brak stadium nie blokuje dostępnej oceny według wieku. Brak wiarygodnego
wieku może natomiast uniemożliwić kwalifikację do zakresu dla stadium.
Każde porównanie zachowuje własne warunki dostępności.

## 5. Pokwitanie, płeć i kontekst dorosłych

Oferuj cechy zgodne z wybraną płcią dla kryteriów: Th/M u dziewcząt i G
u chłopców. Nie pokazuj chłopcu thelarche ani dziewczynce objętości jąder.
Sam numer Tannera bez rodzaju cechy nie określa Th/M lub G; P i Ax nie
zastępują oceny rozwoju gonadalnego. Nie wyprowadzaj stadium z samego hormonu.

Zmiana pacjenta lub płci nie może przenieść sprzecznego lokalnego wyboru
do nowej oceny. Opóźniony odczyt danych poprzedniej osoby też nie może go
przywrócić. Przy braku zgodnego kontekstu nie zgaduj.

Wcześniactwo w wywiadzie nie usuwa pokwitania u starszego dziecka. W profilu
noworodkowym lub dla dorosłych nie pokazuj selektora Tannera, jeśli ta ocena
z niego nie korzysta. Nie usuwaj przez to istotnych obserwacji klinicznych,
także u niemowlęcia. Stadium V nie jest automatycznie uprawnieniem do normy
dorosłych.

Przy LH/FSH dorosła kobieta ma jeden wybór „Cykl / menopauza”. Nie ustalaj
fazy ani menopauzy z wieku lub pojedynczego FSH. Nieznany kontekst daje
alternatywne zakresy bez wspólnego werdyktu. Nie dodawaj tego selektora
do każdego hormonu, jeśli nie wynika to z jego danych referencyjnych.

## 6. Wynik: hierarchia informacji i istniejące osie

Zachowaj następującą kolejność i wagę informacji:

1. **Duża wartość wyniku i jednostka**, z dotychczasowymi przeliczeniami.
2. **Istotny komunikat kliniczny**, gdy rzeczywiście wynika z danych
   i udokumentowanych reguł, np. cechy dojrzewania zbyt wcześnie dla wieku.
3. **Porównanie na osi:** pasmo zakresu referencyjnego i znacznik pacjenta.
   Jeśli źródła pozwalają, osobno „Dla wieku” i „Dla stadium G3/Th3”.
4. **Jedna krótka notka o źródle i zastosowaniu zakresu.**
5. **Zwinięte „Szczegóły i źródła”** dla potrzebnych ograniczeń i cytowań.

U dorosłego lub we właściwym profilu niemowlęcym jedna odpowiednia oś może
wystarczyć. Jeśli jedna ocena jest niedostępna, zachowaj drugą, o ile spełnia
własne warunki. Alternatywne normy przedstawiaj zwartą listą; nie nadawaj im
wspólnego koloru ani globalnego werdyktu.
Powyższe nie wyklucza zgodnego wniosku dla skrajnych granic jednej krzywej
wieku, opisanego w § 3. W takim przypadku wspólne wyróżnienie znacznego
odchylenia wymaga spełnienia reguły dla **wszystkich** wariantów.

**„W zakresie dla stadium” nie oznacza prawidłowego czasu dojrzewania ani
prawidłowości całego obrazu klinicznego.** Nie maskuj niezależnego ostrzeżenia
klinicznego zielonym oznaczeniem stężenia. Przenoś reguły oceny rozwoju tylko
tam, gdzie są uzasadnione; nie rób z każdego hormonu testu rozpoznającego CPP,
hipogonadyzm lub przyczynę zaburzeń.

Korzystaj z istniejących komponentów osi i wyróżnień: drżenie znacznika,
mały wykrzyknik, komunikat o znacznym odchyleniu i pulsowanie wartości
przy znacznym przekroczeniu zakresu. Dla porównania źródłowego używaj
określenia „zakres referencyjny”. Reguła efektu wizualnego jest regułą UI,
nie nowym progiem diagnostycznym lub oceną pilności. Nie kopiuj jej jako
progu medycznego nowego analitu. Zachowaj tryb ograniczonego ruchu i druk;
nie dodawaj przycisku „Zatrzymaj animację”.

Nie rysuj dokładnego punktu dla `<LOD`, `<LOQ` czy wyniku z operatorem,
który nie określa dokładnej wartości. Nie zastępuj nieznanej granicy dolnej
zerem. Zakres na osi, etykieta i zapis oceny mają pochodzić z tych samych danych.

Nie pokazuj pustych osi, tabeli technicznego kontekstu ani powielonych
ograniczeń dla wieku i stadium. Nie wyświetlaj nieużywanych pól historycznych,
wersji silnika i profilu w głównym widoku. Zachowaj istotne ostrzeżenia ze
starszego zapisu bez odtwarzania całej dawnej ankiety. Pusty wynik to
„Wpisz wynik”, a niedostępny zakres to krótki, konkretny powód.

Przyciski „Zmień”, „Zmień stadium” i „Doprecyzuj” mają wyglądać i działać
jak pozostałe przyciski aplikacji. Używaj istniejących komponentów i tokenów
stylów. Sprawdź desktop oraz telefon 320 px, również po otwarciu edycji.

## 7. Dane, silnik, prezentacja i historia mają osobne zadania

Normy i reguły kwalifikacji przechowuj jako wersjonowane dane, poza silnikiem.
Silnik przyjmuje źródło jako argument; wynik niesie użyte zakresy i ich
pochodzenie. Renderer przedstawia ocenę, nie wylicza własnych norm.
To także przygotowanie do różnych populacji odniesienia — patrz
[architektura](../ARCHITECTURE.md#kierunek-wielopopulacyjność-decyzja-właściciela-2026-09-09).

Wizyta, przypięty wynik i historia muszą zachować użyty kontekst, surowy
zapis wyniku z operatorem, jednostki, zakres, źródło, wersję i ograniczenia.
Odczyt odtwarza utrwaloną ocenę bez ponownego liczenia dzisiejszymi normami
lub danymi aktualnie wybranego pacjenta. Usunięcie kontrolki lub etykiety
nie jest zgodą na kasowanie dawnych danych. Starsze zapisy zachowują zgodność.

Punkty wejścia obecnej implementacji, do sprawdzenia przed zmianą:

| Obszar | Pliki |
|---|---|
| Dane i silnik LH/FSH | `vilda_lab_puberty_data.js`, `vilda_lab_puberty.js` |
| Formularz i dane pacjenta | `vilda_lab_puberty_ui.js`, `vilda_puberty_source.js`, `vilda_lab_neonatal_context.js` |
| Integracja i jednostki | `przelicznik-jednostek.html` (m.in. `VildaLabPubertyRuntime` w skrypcie strony), `lab_unit_converter.js` |
| Osie i zapis oceny | `vilda_lab_assessment_ui.js`, `vilda_lab_assessment_ui.css`, `vilda_lab_snapshot.js` |
| Uzasadnienia kliniczne | [LH_FSH.md](LH_FSH.md), [ALGORITHMS.md](ALGORITHMS.md) |

To wzorzec podziału odpowiedzialności, nie polecenie dopisania inhibiny B
do silnika ograniczonego do LH/FSH. Najpierw sprawdź kontrakty i możliwość
ponownego użycia komponentów. Nie przepisuj działającej architektury w ramach
samego dodania analitu; nie zmieniaj innych hormonów przy okazji.

## 8. Przykład zadania: inhibina B według wieku i pokwitania

1. Sprawdź obecną obsługę inhibiny B, jednostki, źródła i miejsca zapisu.
   Zanotuj, które działające grupy trzeba zachować.
2. Przygotuj mapę źródeł dla obu płci, grup wieku i typowanych stadiów.
   Oddziel dostępne normy wieku od norm stadium; wskaż luki i potrzebne artykuły.
3. Zweryfikuj metody, populacje i zastosowanie porównania orientacyjnego.
   Nie kopiuj norm, przelicznika IU/L↔mIU/mL, granic Greaves ani progów
   diagnostycznych LH/FSH do inhibiny B.
4. Zaproponuj automatyczny dobór źródła wykorzystujący znany wiek, płeć
   i pokwitanie. Nie pytaj ponownie o dostępne dane. Nie dodawaj cyklu,
   menopauzy ani innych kontekstów bez znaczenia w zweryfikowanym źródle.
5. Pokaż makietę w obecnym układzie: duży wynik, właściwe osie, ewentualny
   istotny komunikat, krótka notka i zwinięte źródła. Uwzględnij brak stadium
   i brak odpowiedniego zakresu, a nie tylko pełny szczęśliwy przypadek.
6. Wdróż dane, obliczenie, widok i zapis wraz z testami rzeczywistych funkcji.
   Liczbowe oczekiwania testów wyprowadź ze zweryfikowanego źródła.

**Ta instrukcja nie zawiera norm inhibiny B ani zgody na ich wymyślenie.**
Opisuje oczekiwany sposób wykonania przyszłego rozszerzenia.

## 9. Sposób pracy i warunki zakończenia

Przeczytaj aktualne `AGENTS.md` i dokumentację modułu. Przy większej zmianie
UI najpierw przedstaw makietę desktop/mobile. Rutynowe decyzje techniczne
podejmuj samodzielnie; korzystaj z już udzielonych zgód. Brakujące rozstrzygnięcia
kliniczne przedstaw konkretnie, z rekomendacją i źródłem, bez ponawiania
pytań rozstrzygniętych w rozmowie. Zmiany kliniczne dokumentuj i uzgadniaj
według § 3 `AGENTS.md`; testy nie nadają statusu walidacji klinicznej.

Przed oddaniem rozszerzenia sprawdź:

- Granice zakresów i wieku, każdą obsługiwaną płeć/stadium, niepewny wiek,
  brakujące lub sprzeczne dane, wartości z operatorem i poprawne konwersje.
- Niezależność osi wieku/stadium i ostrzeżenia klinicznego; brak pozornego
  wspólnego werdyktu dla alternatyw. Zachowanie wcześniej obsługiwanych grup,
  szczególnie dorosłych po rozszerzeniu pediatrycznym.
- Brak dodatkowej obowiązkowej konfiguracji, użycie danych z głównego
  formularza oraz reset lokalnego kontekstu po zmianie osoby lub płci.
- Przypięcie, wizytę, historię i odczyt starszych zapisów bez ponownego liczenia;
  spóźnione odświeżenie danych pacjenta nie może zmieniać osoby użytej do oceny.
- Desktop, mobile, animacje/reduced motion i rzeczywisty scenariusz offline.
  Wersjonowanie i wymagane kontrole wykonaj według `AGENTS.md`.

Po **każdym pushu** dopilnuj zakończenia **wszystkich kontroli GitHub dla
aktualnego SHA**. Przy błędzie przeczytaj log, popraw przyczynę i ponownie
sprawdź komplet CI. Nie kończ pracy na pushu lub samym uruchomieniu testów.
W podsumowaniu podaj wpływ kliniczny, sprawdzone grupy, pozostałe luki,
wyniki kontroli i PR. Scalenie i wdrożenie wymagają polecenia właściciela.
