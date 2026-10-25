# FENa w próbce moczu — źródła, obliczenie i polityka prezentacji

Stan i odczyt źródeł: **25.10.2026**. Zakres: `FENa_spot`, frakcyjne
wydalanie sodu obliczane z czterech stężeń. Nie jest to norma dobowego
wydalania sodu, oszacowanie GFR ani test samodzielnie rozpoznający AKI.

Właściciel zaakceptował 25.10.2026
[makietę przed/po na desktopie i telefonie](https://vilda-fena-audyt-20261025.maciej-flader.chatgpt.site),
politykę interpretacji i naprawę wykrytych błędów. Źródło makiety:
`33d8fcf036977515d83f8ce42a88fd02ad4760be`. Akceptacja zakresu i testy
produkcyjnych funkcji nie nadają metodzie statusu nowej walidacji klinicznej.

## Wzór, jednostki i minimum danych

`FENa [%] = 100 × U_Na × S_Cr / (S_Na × U_Cr)`.

Potrzebne są wyłącznie:

| Materiał | Stężenia | Jednostki formularza |
|---|---|---|
| Ta sama punktowa próbka moczu | Sód i kreatynina | Na: mmol/L; Cr: mg/dL, µmol/L lub mmol/L |
| Krew pobrana równocześnie | Sód i kreatynina | Na: mmol/L; Cr: mg/dL, µmol/L lub mmol/L |

Dla jednowartościowego jonu Na⁺ wartości w mmol/L i mEq/L są liczbowo
równoważne, więc stała etykieta mmol/L usuwa zbędny selektor. Obie
kreatyniny muszą mieć uzgodnione jednostki. Zachowano przelicznik istniejącej
ścieżki frakcji wydalanej: **1 mg/dL = 88,4 µmol/L**, a mmol/L = 1000 µmol/L.
Nie zastępuje się go po cichu stałą z audytowanych ilorazów kamicowych.

Wiek, płeć, masa, wzrost, BSA, objętość i czas zbiórki nie są składnikami
równania. Znany wiek jest używany wyłącznie do doboru treści komentarza.
Nie wymaga się dodatkowej ankiety o AKI, stabilności, IFCC, IDMS,
diuretykach lub PChN. FENa bywa używane właśnie w AKI, dlatego ogólne
założenie Klirensu „stabilna czynność nerek, bez podejrzenia AKI” **nie
kwalifikuje ani nie blokuje FENa**.

Pochodzenie Na i Cr z tej samej próbki moczu oraz równoczesne pobranie krwi
są jawnym **założeniem obliczenia**, bez obowiązkowego potwierdzenia.
Nie zapisuje się tego założenia jako ustalonego faktu. Znana różna próbka
lub inny czas pobrania blokują wynik. Brak zaznaczenia starszego checkboxu
nie oznacza sam w sobie potwierdzonej sprzeczności; jawna odpowiedź „Nie”
ma pierwszeństwo przed dawnym zaznaczeniem „Tak”. Znanej kreatyniny z
innego terminu nie wolno automatycznie uznać za równoczesną próbkę.

U_Na = 0 jest prawidłową wartością wejściową i daje FENa = 0. Pozostałe
trzy stężenia muszą być dodatnie; wszystkie cztery skończone. Puste pole
nie jest zerem. Ujemne wartości, nierówności zamiast dokładnego stężenia
oraz nieznane jednostki nie są traktowane jak poprawne dane liczbowe.
Nie stosuje się arbitralnego maksimum opartego na samej wpisanej liczbie,
które blokowałoby równoważne U_Cr w µmol/L i dopuszczało je w mg/dL.
Wyniku nie ucina się do 100%.

## Źródła i rzeczywisty zakres ich zastosowania

### KDIGO 2012 — wzór i pomocnicze progi w AKI

[KDIGO Clinical Practice Guideline for Acute Kidney Injury, Online Appendices A–F,
marzec 2012](https://kdigo.org/wp-content/uploads/2016/10/KDIGO-AKI-Suppl-Appendices-A-F_March2012.pdf).
Sprawdzono **tabelę 12, drukowana s. 66**, wzór i tekst na s. 67 oraz
omówienie ograniczeń na s. 67–68.

Tabela przedstawia FENa **<1%** i **>2%** jako wskaźniki pomocnicze w
różnicowaniu mechanizmu AKI. Nie są to dolna i górna granica zakresu
referencyjnego zdrowej populacji. Wynik wymaga kontekstu klinicznego;
diuretyki, zaawansowana PChN i glukozuria mogą ograniczać użyteczność.

Na dzień przeglądu [strona aktualizacji KDIGO AKI/AKD](https://kdigo.org/guidelines/acute-kidney-injury/)
oznacza dokument 2026 jako projekt. Nie zastępuje się nim opublikowanej
wytycznej ani nie przedstawia go jako końcowej rekomendacji.

### Abdelhafez i wsp. 2022 — skuteczność u dorosłych z AKI

*Diagnostic Performance of Fractional Excretion of Sodium for the
Differential Diagnosis of Acute Kidney Injury: A Systematic Review and
Meta-Analysis*. CJASN 2022; DOI
[10.2215/CJN.14561121](https://doi.org/10.2215/CJN.14561121),
[indeksowany pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC9269645/).
Sprawdzono kryteria włączenia, metody, wyniki i omówienie ograniczeń;
ponowny dostęp PMC podczas audytu bywał ograniczony przez CAPTCHA.

Do przeglądu włączono 19 badań i 1287 pacjentów; oszacowania dla progu 1%
obejmowały 15 badań i 872 osoby. Kryterium populacji: **dorośli ≥18 lat
z AKI**. Łączna czułość/swoistość wynosiła 90%/82%; w wybranej podgrupie
z oligurią bez PChN i diuretyków 95%/91%. Przy diuretykach swoistość
wynosiła 54%. Badania były heterogeniczne, a rozpoznanie referencyjne
bywało obciążone ryzykiem błędu; nie jest to badanie norm zdrowej populacji.

Ta populacja uzasadnia ostrożną politykę wyświetlania dorosłych progów
pomocniczych wyłącznie przy znanym wieku ≥18 lat. Nie dowodzi
fizjologicznej zmiany w dniu 18. urodzin.

### Schreuder i wsp. 2017 — dzieci poza AKI

*Interpretation of the Fractional Excretion of Sodium in the Absence of
Acute Kidney Injury: A Cross-Sectional Study*. Nephron 2017;136:221–225,
DOI [10.1159/000468547](https://doi.org/10.1159/000468547),
[pełny tekst wydawcy](https://karger.com/nef/article/136/3/221/227002/Interpretation-of-the-Fractional-Excretion-of).
Sprawdzono pełny tekst i PDF, w szczególności Methods, Table 1 i Discussion.

761 wyselekcjonowanych pacjentów poradni pediatrycznej w wieku około
4–18 lat (Methods: >4), GFR >60 mL/min/1,73 m², wiarygodne zbiórki
20–28 h; wykluczano udokumentowane diuretyki. Kreatynina: Jaffé; sód: ISE.
To nie była zdrowa populacja referencyjna ani walidacja normy punktowego
moczu. FENa zależała od GFR i podaży sodu; 18,9% badanych miało ≥1%.
Średnia 0,76% i SD 0,45 nie są granicami normy. Nie przenosi się ich,
regresji lub samego progu 1% do klasyfikacji każdego dziecka.

### Segar i wsp. 2021 — dojrzałość nerek wcześniaka

*Maturational changes in sodium metabolism in periviable infants*.
Pediatr Nephrol 2021;36:3693–3698, DOI
[10.1007/s00467-021-05119-3](https://doi.org/10.1007/s00467-021-05119-3),
[pełny tekst autorski](https://pmc.ncbi.nlm.nih.gov/articles/PMC8815317/).
Sprawdzono Methods, Table 1 i Discussion. Badanie obejmowało 23 niemowlęta
urodzone w 22+0–23+6 tygodniu, obserwowane w 2.–10. tygodniu życia.
FENa oznaczano zasadniczo około 2. tygodnia: n=22, 5,7 ±0,6%
(**średnia ±SE**, nie zakres referencyjny). Autorzy nie mogli wiarygodnie
ocenić częstości AKI. Ta wąska kohorta wyjaśnia zależność od dojrzałości,
ale nie dostarcza uniwersalnej tabeli norm PNA/PMA/GA.

### Źródła niewykorzystane do tworzenia norm

[Becue i wsp. 2022](https://www.frontiersin.org/journals/pediatrics/articles/10.3389/fped.2022.902252/full),
DOI 10.3389/fped.2022.902252, pełne Methods/Discussion: 299 dzieci
z niskorosłością; <1% dla Na przejęto jako podręcznikowy próg przesiewu
tubulopatii. Nie ustalano norm zdrowej populacji. Nie przenosi się go
na wszystkich pacjentów ani do samodzielnej diagnozy AKI/tubulopatii.

Dla prac neonatalnych [Ishizaki 1993](https://pubmed.ncbi.nlm.nih.gov/8379323/)
i [Al-Dahhan 1983](https://pubmed.ncbi.nlm.nih.gov/6859912/) zweryfikowano
jedynie abstrakty. Nie odczytano pełnych tabel i nie utworzono na ich
podstawie profilu aplikacji.

## Polityka aplikacji i jedna karta wyniku

Wersjonowane dane w `clcr_fena_reference_data.js` wystawiają
`VildaClcrFenaReferenceData.DEFAULT_POLICY`: **`FENA_CONDITIONAL_AKI_2026_10`,
wersja 1**. Bezstanowy `VildaClcrFena.evaluate(input, policy)` w
`clcr_fena.js` przyjmuje politykę jako argument; wynik zachowuje użyte
źródła, populację, wersje i ograniczenia. Progi nie są normą zaszytą
w rendererze. Wersja silnika: 1.

| Znany kontekst | Główna karta i dostępne odniesienie |
|---|---|
| Wiek ≥18 lat | Neutralna wartość; „Progi pomocnicze w AKI (dorośli)”, <1% / >2%, z warunkowym komentarzem. |
| Dziecko, także noworodek/wcześniak | Neutralna wartość; „Brak uniwersalnej normy dla wieku”. Znaczenie zależy od GFR, podaży sodu i dojrzałości nerek. |
| Wiek nieznany | Neutralna wartość; „Brak uniwersalnej normy”, bez żądania wieku do uzyskania liczby lub „pełnej interpretacji”. |
| Znana PChN lub stosowanie diuretyku | Liczba pozostaje; widoczny fakt i ograniczenie użyteczności, bez aktywnego przypisania do diagnostycznego pasma dorosłych. |
| Znane różne próbki moczu albo nierównoczesna krew | Brak obliczenia, z konkretnym powodem. |

Nie ma podziału progu według płci lub stadium pokwitania ani osobnej
normy dla osób starszych. Brak uzasadnionego maksymalnego wieku nie
oznacza potwierdzenia skuteczności w każdej podgrupie osób starszych.
Nie wymusza się nowych pytań o GA/PMA/PNA, by uzyskać niepotwierdzoną normę.

U dorosłego pomocniczy podział obejmuje:

| Dokładna relacja wyniku | Warunkowe znaczenie w przyjętej prezentacji |
|---|---|
| <1% | Przy AKI z oligurią może wspierać zmniejszoną perfuzję nerek; sam wynik nie ustala przyczyny. |
| 1–2%, oba końce włączone | Wynik między progami; sama FENa nie rozstrzyga mechanizmu AKI. |
| >2% | Przy AKI z oligurią może wspierać podejrzenie uszkodzenia cewek; diuretyki i PChN także mogą zwiększać FENa. |

Źródłowe są ścisłe progi <1 i >2. Przedział 1–2 z końcami włącznie jest
**ostrożną polityką prezentacji aplikacji**, nie dodatkowym zakresem normy.
Użyteczność jest największa w oligurycznym AKI bez diuretyków i PChN;
brak dawnego zaznaczenia nie jest potwierdzeniem ich nieobecności.

Każda główna karta FENa pozostaje **neutralna**, także >2%. Nie nadaje się
stanu „prawidłowy”, „nieprawidłowy”, kategorii G, rozpoznania AKI, etiologii
lub wskazania do płynoterapii na podstawie samej liczby. Małe bursztynowe
wyróżnienie może oznaczać znany czynnik ograniczający interpretację.
Dorosłe progi u dzieci lub przy nieznanym wieku są wyłącznie edukacyjną
treścią zwiniętych „Szczegółów i źródeł”, bez nadania pacjentowi kategorii.

Duża liczba, jednostka i uzasadnione odniesienie tworzą jedną kartę B,
z komentarzem poniżej. Formularz ma stałe szerokości, wspólne krawędzie
i równe odstępy; telefon 390 i 320 px: pola ≥16 px/48 px oraz odstęp
od „Wyczyść wszystkie pola” do wyniku ≥20 px.

## Precyzja, zapis, odtworzenie i historia

Wynik liczbowy zachowuje pełną dostępną precyzję. Prezentacja adaptuje
liczbę miejsc do wielkości i bliskości progu; nie zaokrągla małej dodatniej
wartości do zera ani 0,99% do 1%. Porównania progów korzystają z dokładnej
relacji oryginalnych danych dziesiętnych i jednostek, przed formatowaniem.
Nie stosuje się epsilona lub odczytu już zaokrąglonej karty do kwalifikacji.

Matematycznie dokładne 1% i 2% pozostają w paśmie pośrednim, także gdy
wcześniejsze mnożenia zmiennoprzecinkowe dawały 1,0000000000000002 albo
2,0000000000000004. Kontrola numeryczna nie dopuszcza cichego dodatniego
wyniku równego 0 po podprzepływie ani błędu wyłącznie z powodu
przepełnienia pośredniego iloczynu, gdy iloraz jest reprezentowalny.
Wynik poza reprezentowalnym zakresem jest jawnie niedostępny.

`ClcrFenaPersistence` zapisuje snapshot **`clcr-fena`, wersja 1**:
surową liczbę, zapis prezentacji, dokładny ułamek, cztery oryginalne
stężenia i jednostki, użyty wiek, założenie lub potwierdzenie pochodzenia
próbek, znane fakty, źródła, wersję polityki i ocenę z chwili zapisu.
Punkt historii zachowuje `fenaAssessment`; klucz `clcr-fena-percent`
rozróżnia tę serię. FENa nie ma normy zdrowej populacji, więc
`outOfRange:null` i pusty zakres nie stają się `false` lub „w normie”.

Historia odtwarza zapisaną ocenę, bez przeliczania według dzisiejszego
wieku lub faktów bieżącego pacjenta. Starszego wpisu bez kontekstu nie
interpretuje się nową polityką, nie pożycza mu innej normy i nie odtwarza
utraconej precyzji. Zmiana stężeń unieważnia niezgodną migawkę oceny.

Odtworzenie niepełnej sesji lub tylko zachowanych pól czyści nieobecne
stężenia i kontekst zamiast pożyczać je z poprzedniego DOM. Jawne puste
pole ma pierwszeństwo. Pełne zgodne sesje zachowują dane i jednostki;
pochodzenie próbek pozostaje odróżnione od założenia. Migracja stanu nie
oznacza nadpisania realnych zapisów pacjentów.

## Niezależne syntetyczne przypadki kontrolne

| U_Na / S_Na [mmol/L] | S_Cr / U_Cr | Oczekiwany wynik lub zachowanie |
|---|---|---|
| 20 / 140 | 2 / 100 mg/dL | 2/7% = 0,2857142857…%; pełna liczba w kolektorze i historii. |
| 20 / 140 | 176,8 µmol/L / 8,84 mmol/L | Ten sam wynik 2/7%. |
| 70 / 140 | 2 / 100 mg/dL | Dokładnie 1%; pasmo pośrednie. |
| 140 / 140 | 2 / 100 mg/dL | Dokładnie 2%; pasmo pośrednie, bez >2%. |
| 138,6 / 140 | 1 / 100 mg/dL | 0,99%; wyświetlanie i zapis nie robią z niego 1%. |
| 278,6 / 140 | 1 / 100 mg/dL | 1,99%; zapis nie robi z niego 2%. |
| 1,4 / 140 | 1 / 100 mg/dL | 0,01%; zapis nie robi z niego zera. |
| 0 / 140 | 2 / 100 mg/dL | 0%; zero sodu nie jest brakiem pola. |
| 20 / 0 albo puste pole | 2 / 100 mg/dL | Brak poprawnego wyniku. |
| 20 / 140 | S_Cr=0 albo U_Cr=0 | Brak poprawnego wyniku. |
| Równoważne U_Cr 50001 µmol/L i 50001/88,4 mg/dL | Pozostałe dane identyczne | Zgodna kwalifikacja i wynik, bez limitu zależnego od samej liczby jednostki. |
| Wszystkie cztery stężenia 1e308 w zgodnych jednostkach | Równy iloraz | 100%, bez przepełnienia pośrednich iloczynów. |
| Dodatni matematyczny wynik poniżej zakresu liczb | Poprawne dodatnie wejścia | Jawny błąd reprezentacji; brak fałszywego zera. |
| Dziecko / brak wieku / znany diuretyk lub PChN | Poprawne cztery stężenia | Neutralna liczba, bez nieuprawnionej normy lub rozpoznania. |
| Odtworzenie tylko U_Na po kompletnej sesji innej osoby | Pozostałe pola nieobecne | Nie powstaje liczba ze starych składników. |

Regresje produkcyjnych silników, sesji, kolektora, zapisu i historii
korzystają z fikcyjnych danych oraz izolowanych adapterów. Widoki są
sprawdzane na desktopie i telefonach, a PWA po instalacji i offline.
Wyniki wykonań oraz aktualny commit/PR podaje opis PR. Ponowny przegląd
źródeł jest potrzebny po publikacji końcowej aktualizacji KDIGO AKI/AKD
lub zmianie przyjętej polityki, populacji, jednostek lub progów.
