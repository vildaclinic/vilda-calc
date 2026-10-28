# Dobowe wydalanie kwasu moczowego — audyt 27 października 2026

Zakres: `UA_mgkg` na stronie Klirens. Właściciel zaakceptował
[makietę przed/po na desktopie i telefonie](https://vilda-ua-dzm-20261027.maciej-flader.chatgpt.site)
oraz wdrożenie wraz z naprawą potwierdzonych błędów. Baza audytu:
`25dfbbe057f2d67ec7be0dae24ec6360967f517f` na gałęzi `audyt`.
Pozostałe obliczenia ze zbiórki dobowej są odrębnymi etapami audytu.

## Wpływ kliniczny

Dla dodatniego stężenia w mg/dL, objętości w mL, masy w kg i pełnych
24 godzin dotychczasowe równanie jest algebraicznie poprawne. Nie zmienia
się jego zwykłego dodatniego wyniku. Zmiana obejmuje **nowe odniesienia
wieku i płci, walidację, konwersje jednostek, precyzję prezentacji oraz
utrwalanie czasu i oceny**. To zmiana kliniczna i funkcjonalna, nie sama
kosmetyka interfejsu.

Dzieci otrzymują jawne odniesienie z tabeli 4.4 EAU Urolithiasis 2026,
a dorośli od 18. roku życia — zakres laboratoryjny Mayo URCU. Dotychczas
karta nie miała aktywnej normy UA. Wynik porównuje się z jednym właściwym
profilem. Przekroczenie lub osiągnięcie ścisłej granicy pediatrycznej,
a także dorosły wynik poza zakresem, mają wyróżnienie bursztynowe.
Liczby normy pozostają neutralne. Brak właściwego porównania i dokładne
zero są neutralne; brak normy nie staje się potwierdzeniem prawidłowości.

Wynik nie rozpoznaje kamicy, przyczyny hiperurykozurii ani niedoboru,
nie ocenia skuteczności leczenia i nie proponuje leku lub dawki.
Wpływ diety, leków, jakości zbiórki i kontekstu klinicznego pozostaje
istotny. Akceptacja właściciela dotyczy opisanego zakresu i makiety;
testy techniczne nie nadają algorytmowi statusu „zwalidowany klinicznie”.

## Minimalny formularz i jednostki

Domyślny tryb **„Oblicz ze stężeń”** wymaga stężenia kwasu moczowego
w moczu i objętości całej zbiórki. Masa ciała, wiek i płeć pochodzą
z dostępnych danych pacjenta; nie należy przepisywać ich ponownie.
Masa jest potrzebna do przeliczenia całkowitego wydalania na kg.
Znany dorosły bez masy może od razu otrzymać wynik i normę w mg/24 h.
Wzrost, BSA, kreatynina, pH moczu i obowiązkowy wywiad o lekach nie są
wejściami wybranego równania ani wybranych profili.

Alternatywa **„Gotowe wydalanie”** przyjmuje wynik z laboratorium
w mg/24 h, mmol/24 h lub mg/kg/24 h. Nie wymaga odtwarzania stężenia
i objętości. Wynik już opisany na 24 h nie jest ponownie mnożony przez
`24 / czas` ani przez objętość. Gotowe mg/kg/24 h nie wymaga masy do
samej liczby ani do pediatrycznego porównania. U dorosłego bez masy nie
da się z niego odzyskać mg/24 h, więc porównanie Mayo pozostaje niedostępne.

Przyjęty współczynnik masy molowej kwasu moczowego wynosi
**168,11 mg/mmol**. Używa się go konsekwentnie we wszystkich trybach:

| Stężenie i objętość | Masa w całej zbiórce |
|---|---|
| mg/dL oraz mL | `stężenie × objętość / 100` mg |
| mg/L oraz mL | `stężenie × objętość / 1000` mg |
| mmol/L oraz L | `stężenie × 168,11 × objętość` mg |
| µmol/L oraz L | `stężenie × 168,11 / 1000 × objętość` mg |

Następnie `mg/24 h = mg ze zbiórki × 24 / godziny`, a
`mg/kg/24 h = mg/24 h / masa [kg]`. Dla pełnych 24 godzin mnożnik
czasu wynosi 1. W trybie gotowego wyniku `mmol/24 h × 168,11` daje
mg/24 h; gotowe mg/kg/24 h można pomnożyć przez znaną masę wyłącznie
w celu uzyskania równoważnego całkowitego wydalania.

Domyślnie widoczne jest założenie pełnych **24 godzin**. Opcjonalne
„Zmień” udostępnia jedno pole rzeczywistej liczby godzin zamiast dwóch
dat kalendarzowych. Usunięcie obowiązkowych potwierdzeń protokołu nie
potwierdza faktów, o które formularz już nie pyta. Jawnie znany problem
zbiórki, np. pominięta lub rozlana porcja, zachowuje znaczenie i blokadę;
nie zostaje zastąpiony pozytywnym założeniem. Sam dawny niezaznaczony
checkbox bez zapisanej odpowiedzi nie dowodzi zgłoszenia takiego problemu.

## Dzieci — EAU Urolithiasis 2026, tabela 4.4

Źródłem jest **kolumna masowa mg/kg/24 h** tabeli „Solute excretion in
24-hour urine samples in children”. Profil dotyczy obu płci. Nie ma
oddzielnej dolnej granicy; aplikacja nie wymyśla pediatrycznego progu
„obniżonego wydalania”.

| Wiek użyty do kwalifikacji | Odniesienie EAU |
|---|---|
| Od urodzenia do <1 roku | <13 mg/kg/24 h |
| Od 1 roku do dokładnie 5 lat włącznie | <11 mg/kg/24 h |
| >5 lat do <18 lat | <9,3 mg/kg/24 h |

Nierówności są **ścisłe**. Dokładnie 13, 11 lub 9,3 nie spełnia warunku
„poniżej”; wynik na tej granicy otrzymuje odrębny komunikat graniczny
i wyróżnienie ostrzegawcze. Nie porównuje się zaokrąglonej liczby ekranu.

Źródło zapisuje grupy „1–5” oraz „>5”, bez doprecyzowania, że chodzi
o szóste urodziny. Przyjęto jawną operacjonalizację wieku ciągłego:
`1 ≤ wiek ≤ 5` oraz `5 < wiek < 18`. Zatem dokładnie 5,0 roku korzysta
z <11, a **5 lat i 6 miesięcy — z <9,3**. Nie przesuwa się po cichu
granicy na 6 lat. To interpretacja zapisu tabeli, nie odrębnie zwalidowana
biologiczna granica urodzin. Wiek odczytuje się z dostępną precyzją;
sam zapis „5 lat” nie dowodzi znajomości dokładnego wieku ani daty urodzin.
Nie dopisuje się nieznanych miesięcy lub dni z domysłu.

Jeżeli wpisano wyłącznie **5 ukończonych lat**, bez miesięcy i dni,
adapter zachowuje `agePrecision: "completed-years"`. Taki wiek może
obejmować oba źródłowe odniesienia. Liczba pozostaje dostępna z neutralnym
komunikatem, który podaje alternatywy **<11 i <9,3 mg/kg/24 h**; nie
wybiera się jednej normy ani nie skleja ich w szerszy zakres. Jawny
zapis wieku 5,0 lub 5,5 korzysta z odpowiedniej reguły literalnej.
Nie dodaje się obowiązkowego pytania do każdego obliczenia.

Grupa <1 roku jest szerokim odniesieniem wytycznych. Tabela nie dostarcza
krzywej dni życia, osobnych norm wcześniaczych ani niezależnej walidacji
każdej fazy noworodkowej. Nie tworzy się zatem dodatkowego progu wieku
noworodkowego. Źródłowy przypis wskazuje zależność wydalania od diety,
płci i geografii. Tabela nie jest obietnicą identycznej normy każdego
laboratorium i każdej populacji.

### Rozbieżności w źródłach pediatrycznych

Kolumny molowa i masowa tabeli 4.4 nie są dokładnie równoważne:
70 µmol/kg/24 h odpowiada 11,7677 mg/kg/24 h, podczas gdy kolumna masowa
podaje 13; 65 µmol odpowiada 10,92715 mg, a 55 µmol — 9,24605 mg.
Wybrano konsekwentnie źródłową **kolumnę masową 13/11/9,3** i jeden
współczynnik 168,11. Zmiana jednostki wejściowej nie wybiera innej normy.
Nie kopiuje się niespójnych kolumn jako równoległych polityk.

EAU Paediatric Urology 2026 opisuje w kontekście kamicy próg >10 mg/kg/d,
natomiast sąsiednie 0,6 mmol/kg/d nie jest jego poprawnym przeliczeniem:
10 / 168,11 ≈0,05949 mmol/kg/d. Ten zapis nie zastępuje tabeli wieku.
EAU Urolithiasis ma też inne progi w określonych kontekstach kamicy;
nie wybiera się przypadkowego z nich jako uniwersalnej normy dziecka.
Odnośniki 648/649 przy tabeli 4.4 bieżącego PDF dotyczą badań dorosłej
kamicy; nie przedstawia się ich jako bezpośredniej pediatrycznej walidacji
każdej granicy. Podstawą wdrożonych liczb jest sama tabela wytycznych.

## Dorośli — Mayo URCU

Pełna 24-godzinna zbiórka, wiek **≥18 lat**:

| Profil źródłowy | Zakres mg/24 h, granice włącznie |
|---|---|
| Mężczyźni | 200–1000 |
| Kobiety | 250–750 |

Mayo nie ustala w tym teście normy <18 lat. Nie przenosi się jego zakresu
na dzieci. Od 18 lat potrzeba znanej płci do wyboru tego profilu; brak
wieku lub wymaganej płci nie blokuje poprawnej liczby, lecz pozostawia
ją bez automatycznej oceny. Nie ma odrębnego progu geriatrycznego w tym
wybranym źródle. Metoda kolorymetryczna opisuje źródło, nie potwierdza
techniki oznaczenia próbki konkretnego pacjenta.

Jeżeli wynik główny jest w mg/kg/24 h, oba końce zakresu dzieli się przez
**tę samą masę**, której użyto do wyniku. Dla 70 kg zakres męski wynosi
200/70–1000/70, czyli około 2,857142–14,285714 mg/kg/24 h; żeński
250/70–750/70, czyli około 3,571428–10,714286 mg/kg/24 h. To przeliczenie
zakresu całkowitego, nie niezależnie badana norma masowa. Źródłowe
mg/24 h i opis przeliczenia pozostają w Szczegółach.

**Klasyfikacja dorosłego porównuje dokładne mg/24 h z 200/1000 lub
250/750 przed formatowaniem.** Nie porównuje się dwóch zaokrąglonych
wartości mg/kg. Dokładne granice należą do zakresu. Przy braku masy
wynik ze stężenia/objętości lub gotowego całkowitego wydalania pozostaje
w mg/24 h, z tą samą źródłową normą; nie dodaje się masy jako obowiązku.

Wartość poniżej zakresu wymaga uwzględnienia m.in. diety i kompletności
zbiórki. Sama nie rozpoznaje niedoboru ani nie dowodzi małego ryzyka
kamicy. Wynik powyżej zakresu może mieć różne przyczyny; aplikacja
nie dobiera postępowania farmakologicznego.

### Norma laboratoryjna a progi kamicowe

Próg ryzyka/promowania kamicy nie jest tym samym co laboratoryjny zakres
referencyjny Mayo. EAU Urolithiasis 2026, tabela 4.2 i sekcja 4.7.2,
opisuje u dorosłych m.in. >4 mmol/d u kobiet i >5 mmol/d u mężczyzn;
sekcja 4.4.2 w kontekście promowania kamicy szczawianowej podaje
>4,5/>4,7 mmol/d. Te odniesienia mają różne zastosowanie. Przykładowo
5 mmol/d = 840,55 mg/d, a nie górna granica Mayo 1000 mg/d.
Nie łączy się ich w jeden automatyczny status ani nie zmienia koloru
wybranego zakresu Mayo na podstawie innego kontekstu.

Labcorp 003418 podaje inne zakresy zależne od wieku i płci. Jest
udokumentowaną alternatywą pokazującą różnice laboratoriów, a nie drugim
obowiązkowym wyborem formularza. Nie skleja się granic Mayo i Labcorp.

## Czas, zero, precyzja i walidacja

Normy dotyczą pełnej zbiórki **24 h**. Dla innego dodatniego czasu
`24 / godziny` daje ekstrapolowaną szybkość w jednostce dobowej.
Nie wykazano, że stanowi ona równoważny klinicznie substytut pełnej DZM.
Dlatego karta pozostaje neutralna, bez automatycznego porównania z normą
24-godzinną. EAU przy szczegółowej ocenie metabolicznej opisuje dwie
kolejne pełne zbiórki 24 h. Domyślny czas formularza nie potwierdza
kompletności rzeczywistej próbki.

Walidacja jest wspólna dla formularza, edycji i zapisu. Pusty wpis nie
jest zerem. Stężenie i gotowe wydalanie są nieujemne, a używana objętość,
masa i czas muszą być dodatnie. Ujemna podana masa nie jest po prostu
ignorowana w trybie, który może obejść brak masy. Odrzuca się wartości
nienumeryczne, nieskończoność, zapis szesnastkowy i wynik niemożliwy do
bezpiecznej reprezentacji; nie wprowadza się arbitralnego fizjologicznego
maksimum ani cichego obcięcia do granicy. Kropka i przecinek dziesiętny
są obsługiwane zgodnie.

**Dokładne 0** jest odrębne od braku danych: pokazuje liczbę i neutralną
uwagę o weryfikacji raportu/oznaczalności, bez zapewnienia o prawidłowości.
`<LOD`, `<LOQ` i wyniku z operatorem nie zamienia się w dokładne zero.

Ocena zachowuje stronę granicy przed zaokrągleniem. Mały dodatni wynik
nie może być pokazany jako 0, a liczba tuż poniżej 9,3 nie może wyglądać
jak dokładna granica i otrzymać sprzecznej oceny. Formatowanie może
zwiększyć liczbę cyfr lub użyć zapisu naukowego; nie podwyższa to
dokładności badania laboratoryjnego. Karta, podstawowy `labResult`,
zamrożona ocena, historia, edycja i eksport używają zgodnego tekstu
i zachowują surową wartość zamiast odzyskiwać ją z zaokrąglonej etykiety.

## Dane, silnik i historia

`clcr_ua_reference_data.js` zawiera wersjonowane normy, ich źródła,
populacje, granice i reguły zastosowania. Polityka
**`UA_DZM_EAU_MAYO_2026_10`, wersja 1**, jest przekazywana do
`VildaClcrUa.evaluate(input, policy)` w `clcr_ua.js`. Normy nie są zaszyte
w arytmetyce. `ClcrUaUi` przedstawia gotowy model, a
`ClcrUaPersistence` łączy go z istniejącą ścieżką zapisu do Badań pacjenta.

Nowe pola `UA_*` przechowują jednostkę i surowe wejście UA. Nie wpisuje
się nowej jednostki do współdzielonych dawnych `U_UA` w mg/dL lub `V24`
w mL, które obsługują również inne obliczenia. Zmiana tej karty nie
zmienia wzorów ani zasad pozostałych parametrów DZM.

Snapshot **`clcr-ua`, wersja 1**, zapisany jako `uaSnapshot` przy badaniu
`clcr-ua-dzm`, utrwala wejście, liczby, jednostkę wyniku głównego,
tekst, normę, źródła, status, kontekst, wersje reguł i liczbowy czas
w godzinach. Odczyt historii nie uruchamia obecnej polityki ani nie
podstawia dzisiejszych danych pacjenta. Dawne wyniki bez normy pozostają
nieocenione z `outOfRange:null`; nie otrzymują retrospektywnie EAU/Mayo.
Świadoma edycja uruchamia aktualny silnik i zapisuje spójną nową ocenę.

Stare daty `datetime-local` bez offsetu nie określają jednoznacznie
odstępu czasu w każdej strefie urządzenia. Jeżeli zachowano oryginalny
liczbowy czas w minutach, edytor może go wykorzystać. Gdy go brakuje,
edycja wymaga jawnego czasu, zamiast zgadywania przez `Date.parse`.
Do czasu prawidłowego ponownego przeliczenia zachowuje się zamrożony stary
wynik. Nie odtwarza się utraconej precyzji z domysłu.

Serie mg/24 h i mg/kg/24 h zachowują rozdzielenie jednostek; bez znanej
masy nie nakłada się ich jako porównywalnych wartości jednego trendu.
Zapis pozostaje dostępny wyłącznie dla wczytanego lub nowego zapisanego
pacjenta. Wspólne zasady edycji, usuwania i eksportu badań pozostają
obowiązujące.

## Potwierdzone problemy przed zmianą

1. Rzeczywista ścieżka edycji i przygotowania payloadu akceptowała
   ujemne stężenie/masę oraz `0x1e` jako liczbę 30. Przykłady dawały
   odpowiednio −0,4 i −12 mg/kg/24 h gotowe do zapisu.
2. Kontrola truthiness traktowała stężenie 0 jako brak wyniku.
3. Przy surowym 0,0004 mg/kg/24 h karta pokazywała 0,0, a podstawowy
   `labResult.value` — 0; `valueNum` zachowywał małą dodatnią liczbę.
   Była to myląca prezentacja, nie wykazana utrata surowego wyniku.
   Przy 1,2346 karta miała 1,2, a zapis podstawowy 1,23.
4. Ponowne liczenie lokalnych dat bez offsetu zależało od strefy
   urządzenia. 24.10.2026 08:00 → 25.10.2026 08:00 dawało w Warszawie
   25 godzin i 11,52 mg/kg/24 h, w UTC lub Nowym Jorku 24 godziny i 12.
   Normalizacja rzeczywistych 25 godzin jest poprawna; błędem jest
   reinterpretowanie tego samego dawnego zapisu przez nową strefę.
5. Brak aktywnej normy UA był luką interpretacji, nie błędem dodatniego
   równania ani dowodem, że normy w źródłach nie istnieją.

## Źródła i zakres odczytu

Odczyt źródeł w audycie: **27.10.2026**. Nie kopiowano pełnych publikacji
do repozytorium. Katalogi bez numeru wydania identyfikuje data dostępu.

1. **EAU Guidelines on Urolithiasis 2026, limited update March 2026.**
   [Pełny rozdział HTML](https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention),
   [PDF 2026](https://d56bochluxqnz.cloudfront.net/documents/full-guideline/EAU-Guidelines-on-Urolithiasis-2026.pdf).
   Odczytano sekcje 4.1.2, 4.1.4, 4.4.2, 4.7.2 oraz tabele 4.2 i 4.4.
   Tabelę 4.4 sprawdzono również wizualnie na stronie 48 PDF (indeks 47).
   Źródło aktywnego odniesienia pediatrycznego to jej kolumna masowa;
   różne progi kamicowe i rozbieżności jednostek opisano powyżej.
2. **EAU Guidelines on Paediatric Urology 2026, Urinary stone disease,
   sekcja 18.2.2.**
   [Pełny rozdział](https://uroweb.org/guidelines/paediatric-urology/chapter/urinary-stone-disease),
   [identyfikacja wydania](https://uroweb.org/guidelines/paediatric-urology).
   Odczytano kontekst progu >10 mg/kg/d; błędnego przeliczenia 0,6 mmol
   nie przyjęto jako danych aplikacji.
3. **Mayo Clinic Laboratories, URCU, Uric Acid, 24 Hour, Urine.**
   [Katalog główny](https://www.mayocliniclabs.com/test-catalog/overview/614044),
   [pełna kopia katalogu nerkowego Mayo](https://renal.testcatalog.org/show/URCU).
   Pełną stronę odczytano w katalogu nerkowym; główna strona okresowo
   przekraczała czas odpowiedzi. Sprawdzono Reference Values, wymagania
   zbiórki, metodę oraz Clinical Information/Cautions. Zakres dotyczy
   24 godzin; <18 lat nieustalony; dorośli M 200–1000 i F 250–750 mg/24 h.
4. **Labcorp, test 003418, Uric Acid, 24-Hour Urine.**
   [Pełny katalog](https://www.labcorp.com/tests/003418/uric-acid-24-hour-urine).
   Odczytano zakresy wieku/płci, metodę urykazową i zalecenie standardowej
   diety przed zbiórką. Źródło porównawcze, bez aktywnej hybrydy norm.
5. **NIST Chemistry WebBook, SRD 69, uric acid, CAS 69-93-2**
   ([168,1103 g/mol](https://webbook.nist.gov/cgi/cbook.cgi?ID=69-93-2))
   oraz **PubChem CID 1175**, wersja danych 2025.04.14
   ([168,11 g/mol](https://pubchem.ncbi.nlm.nih.gov/compound/Uric%20acid)).
   Podstawa jednej stałej konwersji 168,11 mg/mmol.

## Syntetyczne kontrakty regresyjne

Przy stężeniach poniżej domyślne dane to dziecko 10 lat, 30 kg,
1200 mL i 24 h, chyba że wiersz stanowi inaczej. To wyłącznie fikcyjne
przypadki. Testy powinny wywoływać rzeczywiste funkcje produkcyjne,
a nie kopię równania lub reguł klinicznych w kodzie testu.

| Wejście lub stan | Oczekiwany wynik |
|---|---|
| 30 mg/dL | 360 mg/24 h i 12 mg/kg/24 h; powyżej pediatrycznego <9,3, bursztynowy. |
| 300 mg/L lub równoważne mmol/L/µmol/L | Ten sam wynik i ta sama norma masowa; zmiana jednostki nie zmienia profilu. |
| Gotowe 360 mg/24 h lub równoważne mmol/24 h | 12 mg/kg/24 h; bez dodatkowego mnożenia przez objętość lub 24/czas. |
| Gotowe 12 mg/kg/24 h, wiek 10 lat, brak masy | Liczba i pediatryczne <9,3 dostępne; bez obowiązkowej masy. |
| Te same stężenie i objętość, 12 h / 48 h | 24 / 6 mg/kg/24 h jako ekstrapolowana szybkość; neutralnie, bez normy pełnych 24 h. |
| Stężenie 0 / pusty wpis | Dokładne 0 z neutralną weryfikacją raportu / brak liczby. |
| −1 mg/dL, masa −30 kg, objętość 0 lub czas 0 | Odrzucenie; brak ujemnego lub nieskończonego wyniku w zapisie. |
| `0x1e`, NaN, Infinity, `<LOD`, `<LOQ` | Brak cichej konwersji do poprawnej liczby lub zera. |
| 0,001 mg/dL | 0,0004 mg/kg/24 h; widoczne jako dodatnie w karcie, historii i eksporcie. |
| 0,00000000025 mg/dL | 1 × 10⁻¹⁰ mg/kg/24 h; bez zera ani wyjątku podczas formatowania. |
| 23,25 mg/dL | Dokładnie 9,3; ścisłe <9,3 niespełnione, status graniczny. |
| 23,24999999999 mg/dL | Nieznacznie poniżej 9,3; tekst nie udaje dokładnej granicy. |
| Gotowe 12 mg/kg/24 h, wiek 0,5 / 1 / 5 / 5,5 / 17,99 | Odpowiednio <13 / <11 / <11 / <9,3 / <9,3; bez przesunięcia na szóste urodziny. |
| Wyłącznie 5 ukończonych lat, bez miesięcy i dni | Liczba neutralna, obie alternatywy <11 i <9,3; brak arbitralnej jednej normy. |
| Wiek dokładnie 18 lat, znana płeć | Profil Mayo, bez pediatrycznego <9,3. |
| Dorosły 70 kg, M 200 / 1000 mg/24 h; F 250 / 750 | Wszystkie źródłowe granice w zakresie; prezentacja /kg nie zmienia porównania. |
| Dorosły M, 360 mg/24 h, brak masy | 360 mg/24 h i norma 200–1000; brak obowiązkowego pytania o masę. |
| Dorosły z gotowym mg/kg/24 h, brak masy albo płci | Liczba zachowana, brak nieuprawnionego porównania Mayo. |
| Brak wieku przy kompletnych danych do /kg | Liczba dostępna, brak zastępczej uniwersalnej normy. |
| Jawnie znany błąd zbiórki / nieodpowiedziany dawny checkbox | Zachowany problem i blokada / brak wymyślonej potwierdzonej sprzeczności. |
| Dawny zapis UA bez normy, potem zmiana wieku pacjenta | Oryginalna liczba i brak oceny, bez nowego profilu przy odczycie. |
| Nowy zapis, następnie zmiana strefy urządzenia | Ten sam liczbowy czas, wynik, tekst i zamrożona ocena. |
| Dawne lokalne daty 24–25.10.2026 08:00, brak czasu liczbowego | Bez nowego `Date.parse`; jawny czas wymagany do edycji, zachowany stary wynik. |
| Dawny zapis z zachowanymi 1500 minutami | Edycja używa 25 h niezależnie od strefy; 11,52 mg/kg/24 h neutralnie, bez normy 24 h. |

Testy silnika, interfejsu i zapisu są utrzymywane w plikach
`tests/unit/klirens-ua-*.test.mjs`. Sprawdzenie rzeczywistego formularza
obejmuje desktop, telefony 390/320 px, brak poziomego przewijania,
stałe szerokości, czytelne pola i odstęp przycisku czyszczenia od wyniku.
Zmiana zasobów wymaga sprawdzenia PWA, aktualizacji i ponownego
uruchomienia offline. Nie używa się realnych danych pacjentów ani sejfu.

Sam zapis kontraktu nie potwierdza przejścia testu. Wyniki wykonań,
CI, commit i PR dokumentuje opis PR. Ponowny przegląd jest potrzebny
po zmianie wytycznych EAU, katalogu Mayo, sposobu wyliczania wieku,
konwersji, polityki czasu lub reguł historii.
