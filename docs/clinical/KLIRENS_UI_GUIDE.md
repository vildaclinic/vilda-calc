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
- Dla FECl formularz ma cztery stężenia w grupach **„Mocz”** i **„Krew”**,
  bez obowiązkowej ankiety o próbki, wiek, stabilność, AKI lub leczenie.
  Wspólna próbka moczu i równoczesna krew są opisanym założeniem;
  znana sprzeczność blokuje liczbę i zachowuje wpisane stężenia.
  Karta B pokazuje **„Norma dla wieku / Brak normy do porównania”**
  i krótki komentarz o kontekście. Brak odpowiednio zweryfikowanego
  przedziału dla punktowego FECl oznacza neutralną kartę i brak
  klasyfikacji, nie dowód nieistnienia wszystkich norm. Znane PChN,
  AKI, diuretyk lub szybka zmiana kreatyniny pozostają czytelną uwagą,
  także po zapisie. **>0,5%** z KDIGO to warunkowe kryterium podejrzenia
  Gitelmana, opisane wyłącznie w Szczegółach; nie jest normą lub
  automatyczną diagnozą. Małe dodatnie wyniki nie stają się zerem,
  a brak normy nie tworzy kolejnego pytania. Źródła: [FECL.md](FECL.md).
- Dla FEHCO₃ (decyzja 25.10.2026) wystarczają cztery stężenia w grupach
  **„Mocz”** i **„Krew”**, bez pytań o porę/rodzaj moczu, obciążenie,
  metodę lub dane do „pełnej interpretacji”. Wspólna próbka moczu
  i równoczesna krew są opisanym założeniem; znana sprzeczność blokuje
  liczbę i zapis. Nie zakłada się wykonania lub zakończenia obciążenia.
  Jedna neutralna karta B pokazuje **„Norma dla wieku / Brak normy do
  porównania”** i krótki komentarz; brak odpowiednio zweryfikowanej
  normy nie jest dowodem nieistnienia wszystkich publikacji.
  **<5 / 5–15 / >15%** według Yaxley 2016 opisuje się wyłącznie
  w Szczegółach jako warunkowe progi testu, z uwagą o niemowlętach;
  nie klasyfikują zwykłej próbki ani samego faktu podania zasad.
  Z gazometrii wpisuje się aktualne, nie standardowe HCO₃; tCO₂ krwi
  jest opisanym przybliżeniem bez dodatkowego przeliczenia. Małe wyniki,
  znane fakty i znaczenie nierówności pozostają w zapisie i historii.
  Źródła i ograniczenia: [FEHCO3.md](FEHCO3.md).
- Dla UAG (decyzja 26.10.2026) wystarczają **trzy stężenia w moczu:
  Na, K i Cl**, ze stałą jednostką mmol/L. Wspólna próbka jest opisanym
  założeniem, bez obowiązkowego checkboxa; jawnie różne próbki moczu
  blokują liczbę i zapis. Sam inny czas krwi nie blokuje tego wzoru.
  Nie zakłada się kwasicy metabolicznej z prawidłową luką anionową krwi
  ani nie dodaje pytania o wiek do „pełnej interpretacji”. Jedna neutralna
  karta B łączy podpis znaku, liczbę, **„Granica znaku: 0 mmol/L”**
  oraz **„Nie jest granicą normy.”** Nie oznaczaj samego dodatniego UAG
  jako nieprawidłowego ani ujemnego jako prawidłowego. Krótki komentarz
  o amonie jest warunkowy; znana PChN zastępuje go uwagą o ograniczeniu.
  U_Na <20 mmol/L z istniejącego pola daje uwagę o przydatności metody,
  nie diagnozę lub kategorię patologicznego UAG. Szczegóły wyjaśniają
  brak zweryfikowanej normy wieku, ograniczenia i niepewność oznaczeń
  blisko zera. Nie twórz dowolnego pasma „blisko zera”; zachowuj mały
  dodatni i ujemny wynik, dokładne zero oraz zamrożony kontekst historii.
  Źródła i reguły: [UAG.md](UAG.md).
- Pełne poziomy, np. A1–A3 albuminurii, opisuj w zwiniętych
  **„Szczegółach i źródłach”**. Wyróżnij wyłącznie rzeczywiście nadaną
  kategorię pacjenta. Przycisk kategorii powinien otwierać właściwe Szczegóły.
- Wynik, porównanie, eksport i zapis mają opisywać tę samą ocenę. Zachowuj
  dokładną wartość, znak nierówności i kontekst użyty przed zaokrągleniem.

## Fosforany w DZM — decyzja 29.10.2026

Dla `PO4_mgkg` główną miarą jest ilość dobowa **mg P/24 h**, z opcją
**mmol/24 h**. Domyślnie wystarczają stężenie i objętość; drugi tryb przyjmuje
gotowy wynik dobowy. Masa nie jest wymagana, a znana masa daje jedynie
dodatkowe /kg w Szczegółach. `mg P` oznacza fosfor, nie masę jonu PO₄.

Jedna karta B pokazuje wynik i orientacyjny zakres **Labcorp 003251** w tej
samej jednostce, z nazwą źródła i grupą wieku w Szczegółach. Liczby normy są
neutralne, odchylenie bursztynowe. Brak właściwego wieku/płci/profilu daje
liczbę z krótką przyczyną braku porównania, bez zielonego werdyktu. Dokładne
zero jest neutralne z uwagą o oznaczalności, a mały dodatni wynik pozostaje
dodatni także w raporcie i zapisie.

Nowe jawne 24 h ma opcję **Zmień**. Znana błędna zbiórka blokuje oba tryby;
znany inny czas zachowuje ograniczenie po zmianie trybu, bez normy pełnej
DZM i bez ponownego skalowania gotowej ilości dobowej. Kontekst przytarczyc,
krzywicy hipofosfatemicznej/XLH i burosumabu należy do zwiniętych
**Szczegółów**, z odnośnikiem do TmP/GFR. Nie dodawaj selektora choroby,
nowych pól krwi, dawki ani ankiety. Pełne źródła i reguły: [PO4_DZM.md](PO4_DZM.md).

## Białko całkowite w DZM — decyzja 29.10.2026

Dla `Prot_mgkg` pierwszą, domyślną opcją jest **„Oblicz ze stężenia”**
(białko w `mg/L`, `mg/dL` lub `g/L` i objętość w `mL` albo `L`), drugą
**„Gotowy wynik”** z jedną ilością dobową. Główny wynik pozostaje w
`mg/24 h` lub `g/24 h` u wszystkich pacjentów. Masa i wzrost nie blokują
liczby; znane dane pacjenta wykorzystuje się do porównania przez BSA.

Główna karta B ma prostą etykietę **„Norma dla pacjenta”**, zgodną także
z raportem i zapisem. Status poniżej przyjętej granicy brzmi
**„W przyjętej normie”**. Nie wracają etykiety „Próg oceny”, „Próg wg KDIGO”
ani dodatkowy wiersz „Oceniaj jego utrzymywanie się i kontekst kliniczny.”.
Wynik i norma mają tę samą jednostkę; liczby normy są neutralne,
zwiększone wydalanie bursztynowe, a zakres nerczycowy czerwony.

Od 6 miesięcy do <18 lat przyjęta granica to
**`min(150 × BSA, 150) mg/24 h`**, z nierównością **`<`**. Dla BSA 0,7 m²
pokazuje się <105 mg/24 h, a dla BSA 1,0 lub 1,5 m² <150 mg/24 h.
Jeżeli ograniczono przeliczenie, krótki dopisek wyjaśnia użycie limitu
dorosłych. Szczegóły pokazują Haycock BSA, przeliczenie przed limitem,
zastosowaną granicę i źródła. Całkowity limit jest decyzją właściciela,
nie dosłownym zapisem KDIGO; rozbieżność z AEP `<100 mg/m²/24 h`
pozostaje jawna. Limit nie przełącza pediatrycznego progu nerczycowego
na dorosły. Pełna polityka i ograniczenia: [PROTEIN_DZM.md](PROTEIN_DZM.md).

Przeliczenie na m² jest zwykłym wierszem Szczegółów tego samego wyniku,
nie osobną kartą i nie kolejnym badaniem. Nowy zapis tworzy jeden pomiar;
dawne serie zachowują zgodność. Zero jest liczbą neutralną z uwagą
o raporcie, mała dodatnia wartość nie staje się zerem, a brak oceny
pozostaje brakiem oceny. Nie dodawaj pytań do „pełnej interpretacji”.

Nowe 24 h jest rzeczywiście wpisane z opcją **Zmień**. Znana błędna
zbiórka blokuje oba tryby; znany inny czas pozostawia ograniczenie bez
normy pełnej DZM. Gotowa ilość dobowa nie jest skalowana drugi raz,
a historycznie nieznany czas nie dostaje domyślnego 24 h.
Nie reinterpretuj dawnego `U_Prot`, które oznacza masę całej zbiórki.

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
