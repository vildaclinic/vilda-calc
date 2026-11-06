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

## Dobowe wydalanie sodu — decyzja 30.10.2026

Dla `Na_mmol_d` pierwszą, domyślną opcją jest **„Oblicz ze stężenia”**:
sód w `mmol/L` oraz objętość całej zbiórki w `mL` albo `L`. Drugą jest
**„Gotowy wynik”** w `mmol/24 h`, `mg Na/24 h` albo `g Na/24 h`.
Nie powielaj `mEq/L` w selektorze — dla sodu jest liczbowo równe mmol/L.
Główny wynik ma jedną jednostkę: domyślnie `mmol/24 h`, opcjonalnie
`g Na/24 h`. Masa, wzrost, wiek i płeć nie blokują liczby; znany wiek
i potrzebna płeć służą wyłącznie doborowi normy, bez nowej ankiety.

Jedna karta B łączy wynik z etykietą **„Norma dla wieku”** i zakresem
w tej samej jednostce. **„W zakresie laboratoryjnym”** nie oznacza celu
diety. Odchylenia są bursztynowe, norma neutralna. Krótki komentarz
w zakresie: **„Zakres laboratoryjny nie jest celem spożycia soli.”**
Obie granice osi muszą być nazwane. Długi zakres może się zawinąć na
separatorze, zachowując obie granice i czytelny związek z jednostką.
Stała szerokość karty obowiązuje również przy bardzo długiej wartości,
zmianie jednostek, błędzie i otwartych Szczegółach. Skrócona liczba ma
**≈**, krótką uwagę i pełny zapis w Szczegółach; nigdy nie zmienia to oceny.

Automatyczny zakres pochodzi z jednego profilu Labcorp 003178:
dziewczynki 6–12 lat **33–185**, obie płcie 13–17 lat **30–250**,
mężczyźni 18–80 lat **58–337**, kobiety 18–80 lat **39–258**,
od 81 lat obie płcie **23–207 mmol/24 h**, z obiema granicami włączonymi.
To jawne przedziały ukończonych lat, bez interpolacji i zaokrąglania wieku
w górę. Identyczne zakresy obu płci działają także przy nieznanej płci.
Luka wieku/płci pozostawia neutralną liczbę z konkretnym powodem,
bez zastępczej normy dorosłych lub uzupełniania tabeli innym laboratorium.
Pełna polityka, źródła i ograniczenia: [SODIUM_DZM.md](SODIUM_DZM.md).

Dokładne zero pozostaje neutralne z uwagą o raporcie/oznaczalności;
dostępna norma nadal jest widoczna, bez klasyfikowania zera jako niskiego.
Mała dodatnia ilość nie może zostać pokazana lub zapisana jako zero.
Brak oceny pozostaje `null`, nie „w normie”. Nowa zbiórka ma rzeczywiście
wpisane 24 h z opcją **Zmień**. Znany inny czas zachowuje ograniczenie
normy, gotowej ilości nie skaluje się drugi raz, a historycznie nieznany
czas nie dostaje nowego domyślnego 24 h. Znane błędy zbiórki nadal blokują
oba tryby i zapis.

Odpowiednik NaCl, cele spożycia WHO/EAU, związek soli z kalciurią oraz
ograniczenia pojedynczej zbiórki należą wyłącznie do zwiniętych
**Szczegółów i źródeł**. Nie dodawaj selektora diety, choroby przytarczyc,
kamicy lub leczenia. Sam wynik nie określa natremii, spożycia soli
konkretnej osoby ani skuteczności leczenia. Zachowaj jeden pomiar
`Na_mmol_d`; zmiana jednostki i odpowiednik soli nie tworzą nowego badania.
Wynik, norma, Notatka, raport i zamrożona historia przedstawiają tę samą
ocenę, bez technicznego JSON w treści Notatki.

## Dobowe wydalanie potasu — decyzja 31.10.2026

Dla `K_mmol_d` domyślnie wystarczą stężenie **mmol/L** i objętość całej
zbiórki **mL/L**; alternatywą jest jeden gotowy wynik **mmol/24 h**.
Wynik ma stałą jednostkę **mmol/24 h**. Dla K⁺ mEq jest liczbowo równe mmol:
krótka uwaga zastępuje duplikaty jednostek. Nie dodawaj pytań o dane pacjenta
lub potas we krwi. Znany wiek i płeć służą wyłącznie dobraniu normy.

Jedna karta B pokazuje **Norma dla wieku · Labcorp**, neutralne granice,
bursztynowe odchylenie i obie nazwane granice osi. **W zakresie laboratoryjnym**
nie wyklucza nadmiernej utraty potasu przez nerki przy hipokaliemii.
Sam wynik nie rozpoznaje hipo- lub hiperkaliemii. Tabela wieku/płci i kontekst
kliniczny należą do zwiniętych Szczegółów. Nie mieszaj źródeł do uzupełniania
luk: <6 lat lub nieznany wiek/płeć pozostawiają liczbę bez oceny.

Nowa zbiórka ma jawne24 h z opcją Zmień. Nie wymyślaj historycznego czasu,
nie skaluj ponownie gotowej ilości, nie usuwaj znanych błędów zbiórki.
Zero neutralne, mała dodatnia wartość pozostaje dodatnia, brak oceny `null`.
Skrócona liczba ma **≈** i pełny zapis w Szczegółach oraz historii.
Jednostki wyniku i normy mają wspólny poziom również przy zawijaniu podpisów.
Źródła i kontrakt: [POTASSIUM_DZM.md](POTASSIUM_DZM.md).

## KM/Cr — decyzja 02.11.2026

Zachowaj jedną pozycję `KM_Cr` przy stosunkach do kreatyniny w obliczeniach
z próbki moczu. Pierwsze, domyślne **„Oblicz ze stężeń”** ma dwa pola:
**Kwas moczowy w moczu** i **Kreatynina w moczu**, każde z jednostką.
Drugie **„Gotowy wynik KM/Cr”** wymaga jednego stosunku. Czas, objętość,
masa, wzrost, płeć i krew nie są potrzebne; wiek bierze się z już znanych
danych wyłącznie do normy. Nie dodawaj pytań o AKI lub IFCC.

Krótki odczyt **„Rodzaj próbki: Próbka jednorazowa · Zmień”** zastępuje
stały dodatkowy selektor. Opcja DZM zachowuje te same pola i szerokości,
lecz nie otrzymuje automatycznie zakresu próbki punktowej. Historycznie
nieznany materiał pozostaje nieznany. Wybór jednostki interpretuje wpis
zgodnie z raportem, bez samoczynnego przeskalowania wartości pola.

Jeden wynik i **„Norma dla wieku · Newcastle NHS”** są zawsze w
**mmol/mmol**. Nie pokazuj równoległego głównego wyniku mg/mg.
Neutralne granice i ich jednostka są wizualnie zintegrowane z liczbą
pacjenta; obie granice osi mają czytelne oznaczenia, odchylenia są
bursztynowe. Brak wieku lub normy dla danego materiału nie blokuje liczby
i nie tworzy pytania do „pełnej interpretacji”. Dokładne zero pozostaje
neutralne, mała dodatnia liczba nie staje się zerem; znak **≈** musi
odnosić się do dokładnej wartości, również przy skrócie na granicy normy.

Komentarz podwyższonego wyniku ma brzmieć wyłącznie:
**„Podwyższony KM/Cr może wskazywać na zwiększone wydalanie kwasu moczowego.”**
Właściciel usunął dodatkowe zdanie o kamicy i wydalaniu dobowym z treści
głównego wyniku. Tabela wieku, pochodzenie norm, jawna konwencja 2 lat,
ograniczenia i pozostały kontekst należą do zwiniętych Szczegółów.
Użyta norma, źródło i pełna precyzja pozostają zgodne w Badaniach,
Notatkach, raporcie i zamrożonej historii. Kontrakt:
[URATE_CREATININE.md](URATE_CREATININE.md).

## Pᵢ/Cr (DZM) — decyzja 03.11.2026

Dla `PO4_Cr` domyślne **„Oblicz ze stężeń”** ma tylko fosfor, następnie
kreatyninę w tej samej wymieszanej DZM, domyślnie w mmol/L. Alternatywą
jest jeden **„Gotowy wynik Pᵢ/Cr”** w mg/mg, mg/g lub mmol/mmol. W masowych
jednostkach fosforu pisz **mg P**, nie mg PO₄. Wiek i płeć wykorzystuj
z istniejącego kontekstu wyłącznie do normy. Nie dodawaj pytań o czas,
objętość, krew, masę, wzrost lub chorobę. Czas i objętość skracają się
w ilorazie; nie skaluj go przez `24/czas`.

Jedna karta B łączy **Wynik pacjenta** i **Normę dla wieku**, zawsze
w **mg/mg**. Norma z jednostką pozostaje neutralna, odchylenia bursztynowe.
ARUP obejmuje obie płcie 7–17 lat; Mayo mężczyzn od 18 lat, **<0,75 mg/mg**,
bez dolnej granicy. Brak odpowiedniego zweryfikowanego profilu pozostawia
liczbę z konkretnym powodem; nie oznacza, że normy nie istnieją w literaturze.
Nie twórz zastępczej normy dorosłych ani pytania do „pełnej interpretacji”.
Tabela Szczegółów ma tę samą jednostkę co główny wynik.

Główna karta ma krótki komentarz do konkretnego wyniku. Wpływ diety
i leczenia, przydatność TmP/GFR, przytarczyce i XLH/burosumab należą
do Szczegółów, bez selektora, werdyktu skuteczności leczenia lub doboru dawki.
Przejście do TmP/GFR nie przenosi automatycznie DZM do porannej próbki na czczo.

Zero ma neutralną uwagę o raporcie/oznaczalności, dostępna norma pozostaje
widoczna. Mały dodatni wynik nie staje się zerem; **≈** i pełna wartość
w Szczegółach nie zmieniają oceny. Nierówność nie jest dokładnym punktem
wykresu. Zachowaj stałe szerokości, wspólny poziom jednostek i równe odstępy
przy zmianie trybu, błędzie i długiej liczbie. Badania, Notatki i raport
odczytują zamrożoną normę oraz ocenę, bez dzisiejszego wieku lub nowego źródła.
Pełny kontrakt: [PHOSPHORUS_CREATININE.md](PHOSPHORUS_CREATININE.md).

## B/Cr (DZM) — decyzja 03.11.2026

Dla `B_Cr` domyślne **„Oblicz ze stężeń”** ma białko całkowite w moczu
(mg/L; także mg/dL i g/L) i kreatyninę (mg/dL; także mg/L, mmol/L i µmol/L).
**„Gotowy wynik B/Cr”** wymaga jednego stosunku mg/mg, mg/g lub mg/mmol.
Wynik i norma pozostają w **mg/mg**, bez kolejnych pól czasu, objętości,
masy, wzrostu, BSA lub krwi. Wiek i płeć wykorzystuje się z dostępnego
kontekstu tylko do oceny. Brak normy nie zmienia gotowości 2/2 lub 1/1.

Jedna karta B pokazuje dzieciom **„Górna granica normy”**, dopisek
**„Dla wieku i płci”** i `≤` właściwej granicy ARUP; dorosłym **„Zakres wg
KDIGO”**, `<0,15 mg/mg`. Nie używaj „w zakresie tego laboratorium”:
aplikacja nie zna wykonawcy badania. Nazwane źródło **„Źródło zakresu
przyjętego w aplikacji: ARUP”** i pełna tabela są w Szczegółach, z wyróżnieniem
tylko właściwej komórki wieku i płci. Dorosłe trzy kategorie KDIGO są opisowe,
bez odznak A1–A3 i bez przedstawiania progu jako zdrowej normy wieku.

ARUP 7–<18 lat ocenia się przez samą górną granicę, włączoną: dodatni
wynik do niej to **„B/Cr niepodwyższony”**; powyżej **„Podwyższony B/Cr”**,
bursztynowy. Dolna granica pozostaje w tabeli, bez alarmu „niski B/Cr”.
Dorosły poniżej 0,15 ma **„Prawidłowy lub łagodnie zwiększony B/Cr”**.
Liczba i jednostka normy są zawsze neutralne. Pod pediatryczną osią
pisz **„Górna granica normy: … mg/mg.”**, pasmo **„do granicy”**; nie umieszczaj
podpisu niepodwyższenia pod wysokim wynikiem. Skala 0–2×granica jest stała
dla profilu, a techniczne zero nie oznacza dolnej normy.

Brak wieku, wiek <7 lub brak wymaganej płci pozostawia neutralną liczbę
z krótką przyczyną. To brak przyjętego profilu, nie dowód braku norm
w literaturze. Zero i nierówności mają neutralną ocenę; mała dodatnia liczba
nie staje się zerem w historii. Znane sprzeczne próbki/problem zbiórki
zachowują znaczenie bez nowej ankiety. Stare `U_Prot` pozostaje masą całej
zbiórki, nigdy nowym stężeniem. Szczegóły polityki i zapisu:
[PROTEIN_CREATININE.md](PROTEIN_CREATININE.md).

## K/(K+Na) w moczu — decyzja 03.11.2026

`K_frac` znajduje się w **„Obliczeniach z próbki moczu”**. Dwa pola to
**potas, następnie sód w moczu**, oba mmol/L, z tej samej próbki.
Krótka uwaga wyjaśnia równoważność mEq/L oraz to, że **zbiórka dobowa
nie jest wymagana**. Nie dodawaj trybu raportu, pytań o wiek, płeć,
czas, objętość, surowicę, chorobę lub leki. Zero pojedynczego stężenia
jest poprawne przy dodatniej sumie; oba zera mają czytelny błąd.

Jedna neutralna karta B pokazuje **„Wynik pacjenta”** w % i obok
**„Norma — Brak uniwersalnej normy”**. Komentarz:
**„Wynik opisuje udział potasu w sumie potasu i sodu w moczu.”**
Pasek **„Udział w sumie K + Na”** ilustruje skład, bez pasma prawidłowości
i bez progu 60%. Matematyczne 0–100% nie jest normą. Nie nadawaj klinicznego
koloru nawet przy 0%, 100% lub >60%; brak oceny ma `outOfRange:null`.

Zastosowanie >60% łącznie z FENa <0,5% u dzieci z zespołem nerczycowym,
ograniczenia po diuretykach/płynach IV, wzór i źródła należą do zwiniętych
Szczegółów. Nie twórz z tego automatycznej diagnozy lub kolejnej ankiety.
Stałe szerokości i wyrównanie dotyczą też błędu i bardzo małych liczb,
które nie mogą stać się pokazanym lub zapisanym zerem.

Umiejscowienie w menu nie potwierdza pobrania spot. Nieznany materiał
pozostaje nieznany; historyczne DZM zachowuje swoje pochodzenie podczas
odczytu i edycji. Formularz, zapis, Badania i Notatki korzystają ze zgodnej
precyzji i neutralnej oceny. Kontrakt: [POTASSIUM_INDEX.md](POTASSIUM_INDEX.md).

## AG surowicy bez potasu — decyzja 04.11.2026

`AGs` wymaga tylko **sodu, chlorków i wodorowęglanów / CO₂ całkowitego**
z tego samego pobrania krwi, w mmol/L. Krótka uwaga wyjaśnia równoważność
mEq/L; nie dodawaj jednostkowych duplikatów. Wiek bierze się z istniejącego
kontekstu wyłącznie do normy. Bez nowego pytania o wiek, płeć, masę,
wzrost, AKI, stabilność nerek, IFCC, pH, laboratorium lub analizator.
Nie dodawaj trybu gotowego AG. W gazometrii chodzi o aktualne HCO₃;
ograniczenia porównywalności z panelem biochemicznym należą do Szczegółów.

Jedna karta B łączy **„AG bez korekcji”** i **„Norma dla wieku”** w mmol/L.
Przyjęty profil Mayo obejmuje **od ukończenia 7 lat: 7–15 mmol/L**,
obie granice włączone, obie płcie. Niski i wysoki wynik są bursztynowe;
liczba oraz jednostka normy pozostają neutralne. Nie wywodź czerwonej
pilności z samego AG. Granice osi są nazwane, a pod nią znajduje się
**„Norma: od 7 do 15 mmol/L.”** Fragment skali −10…40 nie jest granicą
możliwego wyniku. Notka **„Przyjęty zakres; norma na wydruku może się różnić.”**
oraz źródło w Szczegółach nie sugerują znajomości laboratorium pacjenta.

Poniżej 7 lat lub bez wieku zachowaj liczbę, neutralną kartę i gotowość
**3/3**, bez osi normy i pytań do „pełnej interpretacji”. Krótko nazwij
ograniczenie przyjętego źródła; nie twierdź, że norm nie ma nigdzie.
Zero i ujemny AG są możliwe; przy dostępnej normie 7–15 są niskie,
nie automatycznie neutralne. Małe wyniki zachowują znak i nie stają się
zerem; skrót **≈** nie zmienia klasyfikacji.

Zwinięte **„Uwzględnij albuminę (opcjonalnie)”** ma jedno pole g/L lub g/dL.
Brak albuminy nie zakłada 40 g/L i nie blokuje AG. Jej uwzględnienie daje
mniejszy wiersz **„Po uwzględnieniu albuminy” w tej samej karcie**, bez
drugiego wyniku głównego, osi, automatycznej kategorii lub osobnego badania.
Przy normie pisz **„Norma powyżej dotyczy AG bez korekcji.”**; bez normy
**„Przeliczenie do albuminy 40 g/L, bez automatycznej oceny.”**
Błędna wpisana albumina zachowuje poprawny AG i ma lokalny błąd; wymaga
poprawy lub usunięcia przed zapisem. Czyszczenie/zmiana pacjenta nie
przenosi jej do innej osoby. 40 g/L nie jest dolną normą albuminy,
a przy wartości >40 korekta zmniejsza AG.

Stałe szerokości, wspólny poziom jednostek, równe odstępy i działający
fokus obowiązują również po rozwinięciu albuminy, zmianie jednostki,
błędzie lub długim wyniku. Zapis pozostaje jednym pomiarem `AGs` w grupie
krwi. Badania, Notatki, raport i historia zachowują surowy wynik i ocenę
z dnia zapisu, bez dzisiejszego wieku lub norm. Kontrakt i źródła:
[SERUM_ANION_GAP.md](SERUM_ANION_GAP.md).

## Dobowe wydalanie szczawianów — decyzja 04.11.2026

Formuła `Ox_mgkg` pokazuje teraz główną **ilość na dobę**, a nie
obowiązkowe mg/kg. Domyślne **„Oblicz ze stężenia”** ma stężenie,
objętość i rzeczywiście wpisane **24 h**. Alternatywne **„Gotowy wynik
DZM”** przyjmuje jedną ilość dobową, bez ponownej korekty czasu.
Masa i wzrost nie blokują samej liczby; u dziecka istniejące dane
pacjenta służą wyłącznie do normy po przeliczeniu BSA.

Lista stężenia ma cztery unikalne jednostki: **µmol/L, mmol/L, mg/L,
mg/dL**, domyślnie µmol/L. Przy mg krótki opis **„Postać z wyniku”**
z opcją **„Zmień”** pozwala wskazać jon, bezwodny kwas szczawiowy
lub brak informacji. Nie powielaj jednostek w wielokrotnych grupach.
Jednostki molowe nie wymagają postaci. Przy nieznanej podstawie masowej
zachowaj dostępne **mg/24 h**, bez zgadywania przeliczenia i normy.

Jedna karta B łączy **wynik pacjenta** i **„Normę dla pacjenta”** w tej
samej jednostce: mmol/24 h dla wejścia molowego lub mg/24 h dla masowego.
Norma ERKNet/OxalEurope to **<0,46 mmol/24 h** u dorosłych; u dzieci
limit całkowity wynosi **0,46 ×BSA/1,73**, z dopiskiem **„Przeliczona
dla powierzchni ciała”**. Nie nazywaj go „Normą dla wieku”, nie obcinaj
do granicy dorosłego i nie dodawaj mnożnika niemowlęcego. Bez wieku
albo potrzebnego BSA pozostaw poprawną liczbę i konkretny powód braku
porównania, bez kolejnej ankiety.

Norma i jej jednostka pozostają neutralne. Wynik na ścisłej granicy
ma podpis **„Na górnej granicy”**, zwiększony — bursztynowy kolor.
Znaczne podwyższenie ma czerwone wyróżnienie i komentarz o ocenie
przyczyny, bez automatycznej diagnozy PH. U dorosłego między
**>0,40 a <0,46 mmol/24 h** zachowaj źródłową normę oraz status
**„Poniżej górnej granicy”**, z krótką bursztynową uwagą o niższym progu
EAU w ocenie kamicy. Nie twórz drugiego wyniku lub drugiej normy.

Przy formularzu wystarczy **„Porównanie z normą dotyczy kompletnej
zbiórki 24-godzinnej.”** Znane 12 h, niepełna zbiórka lub eGFR <30
nie znikają po przełączeniu trybu. Nie dodawaj checkboxów ani pola eGFR.
Inny czas daje oszacowanie bez normy; gotowa ilość zachowuje liczbę.
Literalne zero jest dozwolone i przy dostępnej ocenie leży poniżej
górnej granicy; nie zastępuje `<LOD`. Małe dodatnie wartości muszą
pozostać widoczne i zapisywane jako dodatnie.

Szczegóły zawierają źródło, konwersje, BSA i pomocniczą ilość
indeksowaną, bez kolejnego pomiaru. Stałe szerokości, wspólny poziom
jednostek, symetria, mobile ≥16 px/48 px i odstęp ≥20 px pod czyszczeniem
obowiązują w każdym trybie oraz stanie błędu. Czyszczenie zostawia
pacjenta i 24 h, usuwa dane próbki i jej postać. Nowy zapis `Ox_total24`
nie łączy się z dawnymi `/kg` ani inną podstawą masową; historia zachowuje
ocenę z dnia zapisu. Pełny kontrakt: [OXALATE_DZM.md](OXALATE_DZM.md).

## Dobowe wydalanie cytrynianów — decyzja 05.11.2026

Właściciel zaakceptował
[makietę przed/po desktop/mobile](https://vilda-citrate-dzm-20261105.maciej-flader.chatgpt.site)
i implementację. Wybór `Cit_mgkg` prowadzi do **ilości na dobę**.
Domyślne **„Oblicz ze stężenia”** ma stężenie w **mmol/L**, objętość
oraz rzeczywiście wpisane **24 h** z opcją zmiany. Alternatywne
**„Gotowy wynik”** przyjmuje jedną ilość mg/24 h lub mmol/24 h.
Masa nie blokuje liczby; wiek/płeć i dziecięce masa/wzrost służą
do normy z istniejącego kontekstu pacjenta.

Lista stężeń ma cztery unikalne jednostki: **µmol/L, mmol/L, mg/L,
mg/dL**. Przy masie krótki wiersz **„Zmień”** pozwala wskazać jon,
bezwodny kwas cytrynowy lub niepodaną postać. Nie powielaj jednostek
w grupach. Molowe jednostki nie wymagają postaci; masowe bez niej
dają mg/24 h bez zgadniętej konwersji i normy. Przy przejściu
z moli do masy udostępnij potrzebny wybór, także gdy pole już
zawiera liczbę. Zmiana jednostki tej samej ilości zachowuje ocenę.

Jedna karta B łączy **wynik pacjenta** i neutralną **„Normę dla
pacjenta”** w tej samej jednostce. EAU 2026: dorosły mężczyzna
**≥1,7**, kobieta **≥1,9 mmol/24 h**; dziecko **>1,9 chłopcy**
i **>1,6 dziewczynki mmol/1,73 m²/24 h**, przeliczone przez
**BSA/1,73** bez maksimum dorosłego. U dziecka dopisz
**„Przeliczona dla powierzchni ciała”**. Nie nazywaj jej samą
„Normą dla wieku” i nie stosuj równolegle zaokrąglonego progu mg.
Dolna norma EAU dotyczy oceny kamicy; nie jest dwustronnym zakresem
ani indywidualnym celem leczenia.

Automatyczna norma dziecięca obejmuje **1–<18 lat**, dorosła od
18 lat. **Brak automatycznej oceny poniżej 1. roku jest przyjętą
decyzją aplikacji, nie granicą wieku określoną w EAU.** Niemowlę,
brak wieku/płci lub potrzebnego BSA zachowują liczbę z konkretną
przyczyną braku porównania, bez nowej ankiety lub normy zastępczej.

Status **„Wydalanie nieobniżone”** nie potwierdza braku kamicy
lub skuteczności leczenia. Obniżenie jest bursztynowe; dokładna
równość dziecięcego ścisłego progu to **„Na dolnej granicy”**,
także bursztynowe. Dorosła równość jest włączona. Norma i jednostka
pozostają neutralne. Nie dodawaj górnego czerwonego progu.
Główny komentarz obniżenia: **„Mała ilość cytrynianów osłabia
ochronę przed tworzeniem złogów wapniowych i może zwiększać
ryzyko kamicy.”** Możliwe przyczyny i rekomendacja dwóch zbiórek
należą do Szczegółów, bez dodatkowych checkboxów.

Notka **„Porównanie z normą dotyczy kompletnej zbiórki 24-godzinnej”**
zastępuje pytania o kontekst/wiarygodność/dwie zbiórki. Znany inny
czas daje oszacowanie bez normy, gotowa ilość zachowuje liczbę
bez ponownego skalowania. Znana niepełna zbiórka blokuje wiarygodny
wynik i zapis; fakty nie znikają po zmianie trybu. Historycznego
nieznanego czasu nie zastępuje się domyślną dobą.

Literalne zero jest neutralną liczbą z uwagą o oznaczalności,
nie brakiem danych ani wynikiem `<LOD`. Małe dodatnie ilości
pozostają dodatnie; ujemne operandy blokują również edytor.
Stałe szerokości, wyrównanie jednostek, symetria, mobile ≥16 px/48 px
i odstęp ≥20 px pod czyszczeniem obowiązują we wszystkich stanach.
Szczegóły nie tworzą drugiego wyniku. Czyszczenie zachowuje pacjenta
i domyślne 24 h, usuwa próbkę i postać; nowy pacjent nie przejmuje
poprzedniego pomiaru. Zapis **`Cit_total24`** pozostaje oddzielny
od dawnych **mg/kg/24 h**, a historia zachowuje normę i ocenę
z dnia zapisu. Kontrakt: [CITRATE_DZM.md](CITRATE_DZM.md).

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

## Ca/Cit — decyzja 05.11.2026

Właściciel zaakceptował
[makietę przed/po desktop/mobile](https://vilda-ca-cit-20261105.maciej-flader.chatgpt.site)
i implementację. Dla `Ca_Cit` domyślne **„Oblicz ze stężeń”** ma
wapń, następnie cytryniany z tej samej wymieszanej DZM, domyślnie
**mmol/L** i **mg/dL**. **„Gotowy wynik Ca/Cit”** ma jeden iloraz
**mg/mg** albo **mmol/mmol**. Nie dodawaj objętości, czasu, masy,
wzrostu, krwi ani checkboxów. Wiek/płeć wykorzystuje się wyłącznie
do normy z istniejącego kontekstu; brak normy nie blokuje gotowości
**2/2** lub **1/1**.

Lista cytrynianów ma cztery unikalne jednostki **µmol/L, mmol/L,
mg/L, mg/dL**, bez selektora postaci masowej. Jednostka interpretuje
liczbę z raportu, nie przelicza cicho wpisu. Wejście masowe daje
**mg/mg**, molowe **mmol/mmol**. Nie przeliczaj masy cytrynianów
ani tabeli norm na mole: źródło2014 nie określa jednoznacznie
podstawy masowej.

Jedna karta B łączy **„Wynik pacjenta”** i **„Normę dla wieku”**,
z dopiskiem **„Dla wieku i płci”**. Dla mg/mg przyjęto orientacyjne
górne P95 zdrowej kohorty Kirejczyk2014: M/F **2–<7:0,48/0,42;
7–<13:0,60/0,47; 13–<18:0,80/0,60**. **≤P95** jest niepodwyższone,
>P95 bursztynowe. Liczba i jednostka normy pozostają neutralne.
P5 jest tylko w tabeli Szczegółów, bez alarmu niskiego ilorazu.
Niepodwyższenie nie wyklucza kamicy, a przekroczenie jej nie rozpoznaje.

Wynik molowy, <2 lub ≥18 lat, brak wieku/płci lub znany niezgodny
profil zachowują neutralną liczbę i konkretny powód braku porównania.
Znane spot, inny czas, niepełna zbiórka lub historycznie nieznany
materiał nie otrzymują normy DZM; ilorazu nie skaluje się czasem.
Znane różne próbki Ca i cytrynianów blokują obliczenie pary stężeń,
bez kasowania wejść. Gotowy iloraz może pozostać liczbą, ale konflikt
wyłącza normę i nie znika po zmianie trybu. Dopiero własne jawne
metadane poprawnego materiału niezależnego raportu mogą przywrócić
porównanie; nie dodawaj pytania w UI.
Opisane założenie nowej wspólnej DZM nie potwierdza
kompletności lub dawnych faktów. Nie zastępuj luk progiem0,33 lub
normą dorosłych i nie dodawaj pytań do „pełnej interpretacji”.

Dokładne zero Ca/gotowego ilorazu jest liczbą neutralną z uwagą
o raporcie i oznaczalności; zero cytrynianów jest błędem mianownika.
Mały dodatni wynik nie staje się zerem, **≈** i pełna wartość
w Szczegółach nie zmieniają oceny. Ujemne operandy blokują także
edycję i zapis. Stałe szerokości, wyrównane jednostki, symetria,
mobile ≥16 px/48 px i odstęp ≥20 px pod czyszczeniem obowiązują
we wszystkich trybach i stanach. Szczegóły nie tworzą drugiej karty.

Stary masowy `Ca_Cit` zachowuje liczbę z dawnego ×4 i brak oceny
przy odczycie; nowe ×4,0078 jest zmianą liczbową. Jawne przeliczenie
używa nowego silnika. Molarne **`Ca_Cit_mol`** pozostaje osobną serią
bez konwersji/łączenia z mg/mg. Nowy zapis zachowuje dokładny wynik,
źródło i ocenę z dnia zapisu, zgodne w Badaniach, Notatkach i raporcie.
Pełny kontrakt i ograniczenia: [CALCIUM_CITRATE.md](CALCIUM_CITRATE.md).

## pH dobowej zbiórki — decyzja 06.11.2026

Właściciel zaakceptował [makietę przed/po desktop/mobile](https://vilda-ph-dzm-20261106.maciej-flader.chatgpt.site)
i wdrożenie jednego pola zmierzonego **pH DZM**. Czas, objętość, wiek,
płeć i antropometria nie są dodatkowymi wymaganiami. Przyjmujemy DZM 24 h;
pH nie przeliczamy przez czas ani objętość i nie wyznaczamy go jako średniej
arytmetycznej pomiarów jednorazowych.

Karta B pokazuje **„Norma ogólna: 4,5–8,0”**, z obiema granicami włączonymi,
według Mayo **UPH24**, właściwego dla DZM, także w katalogu pediatrycznym.
Nie jest to norma dla wieku lub potwierdzenie laboratorium/metody pacjenta.
Odchylenia są bursztynowe, liczby normy neutralne. W zakresie ogólnym
pozostaje krótki komentarz o odczynie: pH 5,2 jest w zakresie, ale kwaśny
mocz sprzyja krystalizacji kwasu moczowego. Nie dodajemy drugiej karty
lub sprzecznej kategorii nieprawidłowości.

Przesiewowe progi EAU, preanalityka i monitorowanie alkalizacji znajdują
się w Szczegółach. Samo pH DZM nie nadaje rozpoznania RTA/ZUM ani oceny
skuteczności leczenia; alkalizację kontroluje się w świeżych próbkach o
różnych porach. Znana niezgodność próbki lub konserwacja zmieniająca pH
zachowuje odczytaną liczbę bez porównania. Nie przenosimy faktów próbki
jednorazowej do DZM. Techniczna skala wpisu 0–14 nie jest normą moczu.

Zapis zachowuje dokładny odczyt, źródło i ocenę; historia nie otrzymuje
nowej normy retrospektywnie. pH DZM i próbka jednorazowa pozostają
oddzielnymi seriami. Źródła i ograniczenia: [audyt pH DZM](KLIRENS_PH_DZM_AUDIT.md).
