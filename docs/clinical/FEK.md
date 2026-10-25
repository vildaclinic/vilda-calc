# FEK w próbce moczu — źródła, zakresy i polityka prezentacji

Stan i odczyt źródeł: **25.10.2026**. Zakres: `FEK_spot`, frakcyjne
wydalanie potasu obliczane z czterech stężeń. Nie jest to dobowe wydalanie
potasu, oszacowanie GFR ani samodzielny test przyczyny hipokaliemii.

Właściciel zaakceptował 25.10.2026
[makietę przed/po na desktopie i telefonie](https://vilda-fek-audyt-20261025.maciej-flader.chatgpt.site)
oraz naprawę błędów wykrytych w audycie. Źródło zaakceptowanej makiety:
`8af3bac625a0395d12928dd65368e35382590e0f`. Akceptacja zakresu, przegląd
źródeł i testy techniczne nie nadają metodzie statusu nowej walidacji klinicznej.

## Wzór, jednostki i minimum danych

`FEK [%] = 100 × U_K × S_Cr / (S_K × U_Cr)`.

| Materiał | Potrzebne stężenia | Jednostki formularza |
|---|---|---|
| Ta sama punktowa próbka moczu | Potas i kreatynina | K: mmol/L; Cr: mg/dL, µmol/L lub mmol/L |
| Krew pobrana równocześnie | Potas i kreatynina | K: mmol/L; Cr: mg/dL, µmol/L lub mmol/L |

Dla K⁺ wartości w mmol/L i mEq/L są liczbowo równoważne. Stała etykieta
mmol/L usuwa zbędny wybór; jednostki obu kreatynin są uzgadniane przed
obliczeniem. Zachowano przelicznik istniejącej ścieżki frakcji wydalanych:
**1 mg/dL = 88,4 µmol/L = 0,0884 mmol/L**.

U_K = 0 daje poprawne FEK = 0. Pozostałe trzy stężenia muszą być dodatnie,
a wszystkie cztery skończone. Puste pole nie jest zerem. Ujemne wartości,
nierówności zamiast dokładnego stężenia oraz nieznane jednostki nie są
poprawnymi operandami. Nie ma arbitralnego maksimum zależnego od samej
liczby przed konwersją ani obcinania FEK do 100%.

Wiek, płeć, masa, wzrost, BSA, objętość i czas zbiórki nie są składnikami
równania. Wiek służy do dostępnego porównania; aplikacja wykorzystuje
istniejące dane pacjenta. Brak wieku lub normy nie blokuje poprawnej liczby
ani nie tworzy dodatkowego poziomu „pełnej interpretacji”. Nie wymaga się
nowej ankiety o PChN, diuretykach, AKI, IFCC lub IDMS.

## Założenia obliczenia i znane sprzeczności

Wspólna próbka moczu dla oznaczeń K i Cr oraz równoczesne pobranie krwi
są jawnym **założeniem**, chyba że zachowano potwierdzenie. Założenie nie
staje się potwierdzonym faktem pacjenta. Znana różna próbka lub inny czas
pobrania blokują liczbę. Brak zaznaczenia starszego checkboxu nie jest
potwierdzoną sprzecznością; jawne „Nie” ma pierwszeństwo przed starym „Tak”.

Zachowany wspólny kontekst próbek obowiązuje również po zmianie wzoru
i odtworzeniu sesji. Korekta FEK nie może automatycznie potwierdzać
niezależnego protokołu TmP/GFR. Inny czas krwi nie unieważnia sam w sobie
prawidłowej wspólnej próbki moczu dla UAG; różne próbki moczu ją unieważniają.

Ogólne założenie Klirensu „stabilna czynność nerek, bez podejrzenia AKI”
nie kwalifikuje ani nie blokuje **liczby FEK**. Znana PChN, podejrzenie AKI
lub stosowanie diuretyku mają natomiast pierwszeństwo przed porównaniem
ze zdrową populacją. Nieznany fakt nie staje się potwierdzoną nieobecnością.
Nie wyprowadza się prawidłowego GFR z pojedynczej kreatyniny mieszczącej się
w obserwowanym przedziale badania dorosłych.

## Pediatryczne zakresy zdrowej populacji

Lumbreras J, Morales García LJ i członkowie **AENP/SEQCML**.
*Estudio metabólico urinario para el diagnóstico y seguimiento de la litiasis
renal en pacientes pediátricos*. Rev Esp Pediatr. **2020;75(Supl.1):5–24**.
[Pełny dokument konsensusu](https://semedlab.es/wp-content/uploads/2026/02/litiasis_documento-consenso_aenp.pdf#page=12),
sekcja 1.3, **tabela 3, drukowana s. 12 / PDF s. 12**, przypis b.
Rok 2026 w adresie serwera nie zmienia edycji dokumentu z maja 2020.

| Populacja dokładnie nazwana w tabeli 3 | Mediana FEK | FEK, P3–P97 |
|---|---:|---:|
| Zdrowe niemowlęta, 1–12 miesięcy | 12,2% | **3,8–27,4%** |
| Zdrowe dzieci, 1–15 lat | 9,6% | **4,6–20,4%** |

Przedziały są jawnymi percentylami, a nie średnią ±SD lub progiem
rozpoznania nerkowej utraty potasu. Nie mają osobnego podziału według płci
lub pokwitania. Dokument omawia wpływ podaży i rytmu dobowego, dopuszcza
próbkę punktową do wstępnego różnicowania zaburzeń K, a w ocenie diety
i kamicy preferuje DZM. FEK z próbki nie zastępuje tej oceny dobowej.

Tabela jest opisana jako zmodyfikowana na podstawie Rodríguez-Soriano J,
Ubetagoyena M, Vallo A, *Pediatr Nephrol.* **1990;4:105–110**,
[DOI 10.1007/BF00858819](https://link.springer.com/article/10.1007/BF00858819).
Zweryfikowano abstrakt tego badania: 473 zdrowych dzieci w wieku od
1 miesiąca do 15 lat, w tym 108 niemowląt i 365 starszych dzieci. Pełny
tekst pierwotny był niedostępny za subskrypcją. Źródłem wdrożeniowym
zakresów FEK jest przeczytana w całości istotna tabela konsensusu,
bez deklarowania odczytu nieudostępnionego pierwotnego protokołu.

### Granice wieku i niepewność

W źródle „1–12 miesięcy” i „1–15 lat” nakładają się przy 12 miesiącach.
Nie ustalono w nim dnia zmiany profilu ani sposobu zaokrąglania wieku.
Przy tej granicy lub niepewności obejmującej obie grupy pokazuje się
**dwa osobno nazwane zakresy**, bez ich łączenia i wspólnego werdyktu.

Nie dopisuje się normy noworodkowej, wcześniaczej ani zakresu dla całego
wieku 15–<16 lat. Zachowuje się dokładność i pochodzenie istniejącego wieku;
liczba ukończonych lat nie staje się dokładną datą urodzenia. Jeżeli
niepewność obejmuje wiek poza zakresem źródła, nie wymusza się kwalifikacji.
Brak właściwego profilu nadal pozostawia wynik liczbowy.

W formularzu same ukończone lata oznaczają przedział od tych urodzin
do następnych, a jawnie podane ukończone miesiące — przedział do następnego
miesiąca. Cały przedział musi być objęty właściwymi profilami. Dlatego
„1 rok” lub „1 rok, 0 miesięcy” zachowują dwa zakresy na granicy,
a „15 lat” i „69 lat” nie są rozszerzane ponad źródłowe maksimum.
Bezpośrednie API może przyjąć jawnie określony punkt wieku; nie jest to
deklaracja dokładności przypisywana automatycznie polom formularza.

### Polityka dostępności porównania

Porównanie jest **orientacyjne**, opisane jako „Norma dla wieku” i „zdrowa
populacja”. Przy jednym właściwym profilu wynik wewnątrz przedziału,
z końcami włącznie, ma opis „W zakresie dla wieku”; poniżej i powyżej
stosuje się bursztynowe wyróżnienie i tekst kierunku odchylenia.
Nie rozpoznaje się z tego samego odchylenia choroby cewek lub utraty nerkowej.

Zachowawcze okno **S_K 3,5–5,0 mmol/L z końcami włącznie** jest przyjętą
polityką udostępniania porównania ze zdrową grupą. Nie pochodzi z centyli
FEK, nie jest nową biologiczną normą potasu dla każdego wieku i nie dowodzi
zdrowia lub prawidłowej filtracji.

[Royal Children’s Hospital/PIC, Hypokalaemia](https://www.rch.org.au/clinicalguide/guideline_index/hypokalaemia/),
Background, aktualizacja październik 2024: **S_K <3,5 mmol/L** oznacza
kontekst hipokaliemii. Ten kontekst, odczytany z już wymaganego pola,
zastępuje uspokajający status zdrowego przedziału, także gdy FEK liczbowo
w nim leży. Nerki powinny wtedy ograniczać wydalanie K, ale sama FEK
nie ustala przyczyny zaburzenia. Zdrowy zakres może pozostać wyłącznie
jawnie nieaktywną informacją lub w Szczegółach.

[RCH/PIC, Hyperkalaemia](https://www.rch.org.au/clinicalguide/guideline_index/Hyperkalaemia/),
Background, aktualizacja sierpień 2024, rozróżnia dzieci i noworodki.
**S_K 5,1 mmol/L nie otrzymuje tu automatycznej etykiety hiperkaliemii**:
jest poza przyjętym oknem zdrowego porównania FEK. Neonatów nie kwalifikuje
się do norm starszych niemowląt ani do ich polityki porównania.

## Dorośli: zakres obserwowany, bez normy całego życia

Elisaf M, Siamopoulos KC. *Fractional excretion of potassium in normal
subjects and in patients with hypokalaemia*. Postgrad Med J.
**1995;71(834):211–212**,
[DOI 10.1136/pgmj.71.834.211, pełny tekst PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2398075/).
Zweryfikowano obie oryginalne strony: 312 zdrowych osób **21–69 lat**,
świeża próbka moczu i krew żylna. Potas oznaczano fotometrią płomieniową,
kreatyninę metodą Harre. FEK **4–16%** jest obserwowanym minimum–maksimum,
a nie wyznaczonym przedziałem referencyjnym P3–P97.

„Zakres w badaniu dorosłych” może być pokazany informacyjnie w źródłowej
grupie 21–69 lat, przy S_K **3,6–5,2 mmol/L** i S_Cr **53–124 µmol/L**,
bez znanego kontekstu wykluczającego zdrowe porównanie. Są to ograniczenia
prezentacji wynikające z opisu zdrowej grupy, nie dowód prawidłowej funkcji
nerek pacjenta. Karta pozostaje neutralna, bez nadania prawidłowości FEK
na podstawie 4 lub 16%. Poza tymi warunkami zakres jest edukacyjny
w Szczegółach. Nie ekstrapoluje się go na >69 lat, dzieci lub brak wieku.

### Hipokaliemia: źródłowe progi nie stają się jedną regułą

Elisaf badał także 84 pacjentów z hipokaliemią w wieku 36–72 lat,
wykluczając cukrzycę oraz ostrą i przewlekłą niewydolność nerek.
Proponowany w podsumowaniu próg >6,5% dotyczył hipokaliemii przy
prawidłowej czynności nerek, nie normy zdrowych dzieci.

W kolejnych kohortach opisywano inne progi ROC:
[Li i wsp. 2020, DOI 10.1016/j.cca.2020.10.024](https://pubmed.ncbi.nlm.nih.gov/33096028/)
— 9,29% (zweryfikowany abstrakt, n130 z hipokaliemią, nie pełna metoda);
[Yuan i wsp. 2023, DOI 10.21037/atm-22-6410](https://atm.amegroups.org/article/view/108848/html)
— 9,8% (pełne metody i tabela 2, n155 z nadciśnieniem, bez PChN);
[Wang i wsp. 2025, DOI 10.1155/ije/9911400](https://pmc.ncbi.nlm.nih.gov/articles/PMC12440648/)
— 7,49% (pełny tekst, n380, ograniczenia doboru i niespójności kryteriów).
Nie wybrano z nich jednej automatycznej granicy 6,5/9,29/9,8/10%.
Nie rozpoznaje się na tej podstawie przyczyny utraty K, hiperaldosteronizmu
lub wskazania do suplementacji.

## Czynność nerek, leki i luki pokrycia

[KDIGO Controversies Conference, finalna publikacja 2020](https://kdigo.org/wp-content/uploads/2018/04/KDIGO-Potassium-Management-Final-publication.pdf),
Clase i wsp., *Kidney Int.* **97:42–61**, DOI 10.1016/j.kint.2019.09.018,
s. 43–44: wydalanie K zależy od kaliemii, podaży, aldosteronu, dostarczania
Na, przepływu dystalnego i równowagi kwasowo-zasadowej. PChN zmienia
wydalanie na pozostały nefron; diuretyki wpływają na utratę K.
[Maciel i wsp. 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC4103940/),
DOI 10.5935/0103-507x.20140021, pełne metody/dyskusja, n168 OIT:
FEK może rosnąć wraz z nasileniem AKI mimo spadku całkowitego wydalania.
Te źródła uzasadniają ograniczenia, nie nową normę FEK.

Znane PChN, AKI, diuretyki lub inne wiarygodnie zachowane czynniki
zmieniające kaliurezę otrzymują konkretną uwagę przy tym samym wyniku.
Nie znikają po ukryciu kontrolki ani w historii; jednoczesna hipokaliemia
i znany czynnik są zachowane razem. Nie powstaje z nich automatycznie
nowa „norma dla leczenia”.

W istniejącym formularzu informacja o AKI pochodzi z pola podejrzenia
`suspectedAKI`, nie z nowego rozpoznania. Szybka zmiana kreatyniny jest
osobnym faktem, a nie automatycznie rozpoznanym AKI. Bezpośredni interfejs
silnika może zachować informację o suplementacji; brak takiego pola w DOM
pozostaje nieznanym faktem i nie tworzy kolejnego pytania do lekarza.

Brak zweryfikowanego profilu w tej implementacji obejmuje wcześniaki,
noworodki <1 miesiąca, wiek poza zakresem pediatrycznym i dorosłą kohortą
oraz kontekst niezgodny ze zdrową populacją. Nie oznacza to dowodu
nieistnienia każdej normy lokalnej. Nie dodano podziału według płci lub
Tannera, dla którego przyjęte źródło pediatryczne nie zawiera zakresów.

## Rozdzielenie danych, wyniku, sesji i historii

`clcr_fek_reference_data.js` przechowuje wersjonowane źródła, populacje,
przedziały i warunki prezentacji. Silnik `clcr_fek.js` przyjmuje politykę
jako argument; renderer nie tworzy własnych norm. Ocena niesie użyte
źródło, populację, zakres i ograniczenia. Brak polityki referencyjnej
nie zastępuje jej domyślną normą wbudowaną w matematykę.
Przyjęta polityka to **`FEK_AGE_CONTEXT_2026_10`, wersja 1**.

Porównanie korzysta z dokładnego ilorazu dziesiętnych danych i jednostek,
przed formatowaniem. Adaptacyjna prezentacja nie przenosi 4,5999 do 4,6
ani 20,4001 do 20,4 przy przeciwnej ocenie granicy. Mały dodatni wynik
nie zmienia się w zero. Iloraz reprezentowalny nie ginie przez przepełnienie
pośredniego iloczynu; dodatni wynik poniżej reprezentowalnego zakresu
nie jest cicho zapisywany jako 0.

Snapshot **`clcr-fek`, wersja 1**, zachowuje surową liczbę, dokładny
ułamek, tekst prezentacji, cztery oryginalne stężenia i jednostki,
użyty kontekst wieku, założenia/potwierdzenia próbek, znane fakty,
źródła, wersję polityki oraz ocenę z chwili zapisu. Wykorzystuje istniejący
schemat noty laboratoryjnej, bez migracji modelu sejfu.

`outOfRange` ma znaczenie porównania z aktywnym pediatrycznym zakresem:
`false` wewnątrz, `true` poza nim. Bez uprawnionego porównania pozostaje
**`null`**, także dla dorosłego zakresu obserwowanego, nakładających się
grup wieku lub kontekstu hipokaliemii. Historia odtwarza zapisaną ocenę
bez stosowania dzisiejszego wieku, faktów lub nowych zakresów. Starszym
wpisom nie dopisuje normy ani utraconej precyzji. Zachowuje przecinek
i znak nierówności; endpointu `<1` nie przedstawia jako dokładnego pomiaru 1.

Odtworzenie niepełnej sesji czyści nieobecne operandy i kontekst FEK,
zamiast pożyczać K z poprzednich danych. Jawne puste pole ma pierwszeństwo.
Pełne sesje zachowują oryginalne liczby, jednostki i znane sprzeczności.
Wynik, zapis, raport i historia opisują tę samą ocenę.

## Niezależne syntetyczne kontrakty regresyjne

| Wejście / stan | Oczekiwany wynik lub zachowanie |
|---|---|
| U_K 20, S_K 4 mmol/L; S_Cr 1, U_Cr 100 mg/dL; wiek 8 lat | Dokładnie 5%; zakres 4,6–20,4%, orientacyjne „W zakresie dla wieku”. |
| U_K 30, S_K 4; S_Cr 88,4 µmol/L, U_Cr 8,84 mmol/L | Dokładnie 7,5%, tak samo jak przy S_Cr 1/U_Cr 100 mg/dL. |
| U_K 18,3996 / 18,4 / 81,6004; S_K 4, S_Cr 1, U_Cr 100 mg/dL | 4,5999 / 4,6 / 20,4001%; poniżej / na dolnej granicy / powyżej bez sprzecznego zaokrąglenia. |
| U_K 0,04; S_K 4, S_Cr 1, U_Cr 100 mg/dL | 0,01%, bez wyświetlenia lub zapisu 0. |
| U_K 0 / puste; pozostałe dodatnie | Poprawne 0% / brak liczby; S_K, S_Cr lub U_Cr = 0 blokują. |
| Wiek 6 miesięcy / 12 miesięcy / poza źródłem / brak wieku | 3,8–27,4% / dwa osobne zakresy bez oceny / liczba bez zastępczej normy. |
| S_K 2,8 i FEK w zdrowym przedziale; znane PChN i diuretyk | Brak uspokajającego statusu; wszystkie znane ograniczenia przy jednej liczbie. |
| Dorosły 45 lat, S_K 4, S_Cr 88,4 µmol/L | 4–16% wyłącznie jako zakres obserwowany, neutralna karta i `outOfRange:null`. |
| Równoważne U_Cr 50001 µmol/L lub 50001/88,4 mg/dL | Ta sama kwalifikacja i liczba, bez limitu zależnego od jednostki. |
| Cienka sesja bez K po wcześniejszym komplecie; zapis i późniejsza zmiana wieku | Brak mieszania operandów; historyczna ocena pozostaje z chwili zapisu. |

Regresje mają wywoływać rzeczywisty silnik, formularz, zapis, odczyt historii
i sesję, używając wyłącznie fikcyjnych danych. Wyniki wykonanych testów,
offline, kontroli GitHub oraz commit i PR są podawane w opisie PR.
Ponowny przegląd jest wymagany po zmianie źródeł lub przyjętej polityki.
