# UAG w próbce moczu — źródła i polityka prezentacji

Stan odczytu źródeł: **26.10.2026**. Zakres: `AGu_spot`, luka anionowa
moczu ze stężeń Na, K i Cl. Właściciel zaakceptował
[makietę przed/po na desktopie i telefonie](https://vilda-uag-audyt-20261026.maciej-flader.chatgpt.site)
oraz wdrożenie wraz z naprawą trzech potwierdzonych błędów.
Akceptacja zakresu i testy techniczne nie są nową walidacją kliniczną UAG.
Audyt kodu rozpoczęto od `audyt` `ebc150a5e12f9dcd8e95ca9112c3c87f2d2d1143`.

## Wzór, jednostki i minimum danych

`UAG [mmol/L] = U_Na + U_K − U_Cl`.

| Materiał | Wymagane stężenia | Jednostka formularza |
|---|---|---|
| Ta sama próbka moczu | Sód, potas, chlorki | mmol/L dla wszystkich trzech |

Dla jednowartościowych Na⁺, K⁺ i Cl⁻ mmol/L oraz mEq/L są liczbowo
równoważne. Stała etykieta usuwa zbędny wybór. Nie miesza się stężeń
z wydalaniem dobowym w mmol/24 h lub mEq/d. Nie dodaje się przelicznika
z sodu, potasu lub chlorków w mg bez jawnie określonej jednostki analitu.

Każde stężenie musi być obecne, skończone i nieujemne. **Zero jest
poprawnym operandem; ujemny może być wynik UAG, nie stężenie.** Puste
pole, same spacje, wartość logiczna, nienumeryczny obiekt, ujemne
stężenie, przepełnienie lub nierówność z raportu nie są dokładnym
wejściem. `<5` nie oznacza 5, a „nie wykryto” bez liczby nie oznacza 0.
Przecinek dziesiętny i kropka podlegają tej samej walidacji.

Wiek, płeć, masa, wzrost, kreatynina, dane krwi, objętość i czas zbiórki
nie są operandami. Nie ma dodatkowego pytania o porę lub rodzaj moczu
ani oddzielnego poziomu „pełnej interpretacji”. Brak wieku nie blokuje
liczby ani nie powoduje zastosowania zastępczej normy dorosłych.

## Założenia próbki i kontekst kliniczny

Przy braku znanej sprzeczności komunikat brzmi: **„Zakładamy, że
wszystkie trzy oznaczenia pochodzą z tej samej próbki moczu, jeśli nie
podano inaczej.”** To jawne
założenie, nie potwierdzenie pochodzenia próbki. Zachowane „nie wiem”
może współistnieć z założeniem, ale nie staje się potwierdzonym „tak”.
Dawne prawidłowe potwierdzenie wspólnej próbki zachowuje swoje pochodzenie.

Jawnie różne próbki moczu blokują obliczenie i zapis, zachowując
wpisane stężenia do poprawy. Sama informacja o innym czasie pobrania
krwi nie blokuje wzoru wyłącznie moczowego. Korekta informacji o moczu
nie potwierdza równoczesności krwi dla FE ani protokołu TmP/GFR.
Niezaznaczony dawny checkbox sam nie dowodzi niezgodności.

**Nie zakłada się kwasicy metabolicznej z prawidłową luką anionową krwi
(NAGMA).** Jest to warunek klinicznego zastosowania komentarza, a nie
domyślne założenie techniczne. Brak ankiety nie oznacza potwierdzonej
nieobecności PChN, AKI, leczenia ani innych czynników. UAG nie wymaga
potwierdzenia stabilności kreatyniny lub IFCC/IDMS; ogólne założenia
innych wzorów nie mogą usuwać znanego kontekstu UAG.

Znana PChN ma pierwszeństwo przed ogólnym komentarzem wiążącym znak
z wydalaniem amonu. Przy U_Na **<20 mmol/L** z jednego z trzech pól
pojawia się uwaga o ograniczeniu metody, szczególnie przy hipowolemii;
nie jest to nowy próg nieprawidłowego UAG ani automatyczne rozpoznanie
hipowolemii. Znany kontekst pozostaje w zapisanej ocenie. Nie dodaje
się obowiązkowych pytań o czynniki zakłócające tylko po to, by uzyskać
liczbę. Nie pobiera się pH z niezwiązanej próbki w celu automatycznej oceny.

## Jeden neutralny wynik i granica znaku

Karta B łączy podpis **„Ujemna luka anionowa”**, **„Dodatnia luka
anionowa”** albo **„Luka anionowa równa zero”**,
dużą liczbę z jednostką, **„Granica znaku: 0 mmol/L”** i zdanie
**„Nie jest granicą normy.”** Sam znak nie nadaje kategorii
„prawidłowy/nieprawidłowy”; `outOfRange` pozostaje `null`, nie `false`.
Uwaga o ograniczeniu może być bursztynowa, ale dodatni UAG nie staje się
automatycznie patologią, a ujemny nie otrzymuje uspokajającej zielonej oceny.

Zero i treść objaśnień należą do osobnych, wersjonowanych danych polityki,
nie do zaszytej w silniku normy. Oś, jeżeli występuje, pokazuje znak
i punkt wyniku bez pasma zdrowej populacji. Położenie zera nie definiuje
zakresu referencyjnego ani wartości krytycznej.

Komentarz główny jest krótki i **warunkowy**:

| Wynik | Znaczenie komentarza |
|---|---|
| UAG <0 | Jeżeli potwierdzono NAGMA, może odpowiadać zwiększonemu wydalaniu amonu; sam nie rozstrzyga przyczyny kwasicy. |
| UAG >0 | Jeżeli potwierdzono NAGMA, może sugerować ograniczone wydalanie amonu; sam dodatni UAG nie oznacza choroby. |
| UAG =0 | Suma stężeń Na i K jest równa stężeniu Cl; brak odrębnej kategorii klinicznej. |
| Znana PChN | UAG słabo odzwierciedla wydalanie amonu; do jego oceny preferowane jest bezpośrednie oznaczenie NH₄⁺. Ten komentarz zastępuje ogólne wnioskowanie ze znaku. |
| U_Na <20 mmol/L, bez powyższego kontekstu | Ograniczona przydatność UAG do oceny amonu; znak nie określa prawidłowości odpowiedzi nerek. |

W Szczegółach pozostaje pełne objaśnienie znaku, źródła i ograniczenia:

- dodatni UAG może występować fizjologicznie bez kwasicy;
- ujemny UAG nie wyklucza proksymalnej kwasicy cewkowej;
- niskie HCO₃ krwi może wynikać z przewlekłej zasadowicy oddechowej,
  więc samo nie potwierdza kwasicy metabolicznej;
- PChN, małe U_Na, wysokie pH moczu (np. >6,5), wielomocz oraz NH₄⁺
  wydalany z anionami innymi niż Cl⁻ ograniczają wnioskowanie;
- w pierwszych tygodniach życia, szczególnie u wcześniaków, związek
  UAG z amonem jest zawodny; nie tworzy się arbitralnej bramki <12 miesięcy;
- gdy ocena amonu ma znaczenie diagnostyczne, preferuje się bezpośrednie
  oznaczenie NH₄⁺ w moczu, jeśli jest dostępne.

Literatura różni się w ocenie przydatności UAG. Bonner/Hladik 2025
odradzają używanie go do szacowania NH₄⁺, a Batlle i wsp. 2025 bronią
orientacyjnego zastosowania w określonej kwasicy hiperchloremicznej.
Nie przedstawia się jednego z tych stanowisk jako jednolitego konsensusu.
UAG nie wylicza ilości NH₄⁺, nie rozpoznaje samodzielnie RTA, nie nadaje
kategorii G i nie potwierdza prawidłowej czynności nerek.

### Pokrycie wieku

W przejrzanych źródłach nie zweryfikowano odpowiednio opisanego zdrowego
przedziału referencyjnego **punktowego UAG zależnego od wieku**. Jest to
granica pokrycia tego przeglądu, nie dowód nieistnienia wszystkich norm.

| Grupa | Dostępne dane i konsekwencja |
|---|---|
| Wcześniaki i noworodki donoszone | Sulyok 1990 bada zależność od NH₄⁺ w małych grupach w określonych tygodniach/dniu życia; nie wyznacza RI. |
| Niemowlęta | Grupa porównawcza Sulyok, średnio 6,5 miesiąca, wykazuje związek z amonem; nie jest tabelą norm całego niemowlęctwa. |
| Dzieci przed pokwitaniem i dojrzewające, obie płcie | Nie zweryfikowano odpowiedniego zdrowego RI UAG ani zakresu zależnego od stadium. Nie przenosi się norm NH₄/Cr, pH lub luki anionowej krwi. |
| Dorośli, obie płcie | Badania diagnostyczne w kwasicy i szerokie rozkłady związane z dietą nie tworzą uniwersalnego RI punktowego UAG. |
| Osoby starsze | Ito 2025, mediana wieku 70 lat, dotyczy pacjentów poradni nefrologicznej; nie jest zdrową populacją referencyjną. |

Średnie dobowe **41–79 mEq/d** z zestawienia Uribarri 2021 nie są
granicami punktowego UAG w mmol/L. Orientacyjne wartości z przeglądów
ani zakres **−20…+20 mmol/L** z pojedynczego opisu przypadku nie
stanowią wystarczającej podstawy normy wieku. Brak takiego profilu
nie tworzy pytania o dodatkowe dane do „pełnej interpretacji”.

## Źródła, lokalizatory i granice odczytu

Nie kopiowano pełnych publikacji do repozytorium. Poniżej rozdzielono
pełny odczyt, dostępne zindeksowane fragmenty i abstrakty. Błąd dostępu
lub CAPTCHA nie jest dowodem paywalla. Dane bibliograficzne i krótkie
parafrazy służą śledzeniu pochodzenia reguł; nie nadają praw do publikacji.

1. **Batlle DC, Hizon M, Cohen E, Gutterman C, Gupta R.** *The Use of the
   Urinary Anion Gap in the Diagnosis of Hyperchloremic Metabolic Acidosis.*
   N Engl J Med. **1988;318:594–599**.
   [DOI 10.1056/NEJM198803103181002](https://doi.org/10.1056/NEJM198803103181002),
   [PMID 3344005](https://pubmed.ncbi.nlm.nih.gov/3344005/).
   Odczyt: zindeksowany abstrakt na domenach NEJM/PubMed, bez pełnego
   tekstu (bezpośredni dostęp wydawcy: 403). Populacja: 38 chorych
   z zaburzeniami dystalnego zakwaszania, 8 z biegunką, 7 zdrowych po
   NH₄Cl. Wspiera kontekstowe znaczenie znaku, nie normy wieku.
2. **Sulyok E, Guignard JP.** *Relationship of urinary anion gap to urinary
   ammonium excretion in the neonate.* Biol Neonate. **1990;57(2):98–106**.
   [DOI 10.1159/000243169](https://doi.org/10.1159/000243169),
   [PMID 2310794](https://pubmed.ncbi.nlm.nih.gov/2310794/).
   Odczyt abstraktu: 10 wcześniaków obserwowanych przez 6 tygodni,
   11 donoszonych noworodków w 7. dniu, 25 starszych niemowląt (średnio
   6,5 miesiąca). Brak korelacji przez pierwsze 2 tygodnie u wcześniaków
   oraz istotnego związku w 7. dniu u donoszonych; później obserwowano
   związek ujemny. Nie wyznacza RI ani uniwersalnej granicy 12 miesięcy.
3. **Raphael KL, Gilligan S, Ix JH.** *Urine Anion Gap to Predict Urine
   Ammonium and Related Outcomes in Kidney Disease.* CJASN.
   **2018;13(2):205–212**.
   [DOI 10.2215/CJN.03770417](https://doi.org/10.2215/CJN.03770417),
   [PMC5967420](https://pmc.ncbi.nlm.nih.gov/articles/PMC5967420/).
   Odczyt: zindeksowany abstrakt, metody/populacja, wyniki korelacji
   i tabela; bezpośrednie otwarcie PMC wymagało CAPTCHA. AASK: 1044
   dorosłych 18–70 lat z PChN, dobowe zbiórki. Standardowy UAG miał
   słabą dodatnią korelację z NH₄⁺, r=0,18; u 128 osób z kwasicą
   r=0,07. Wspiera pierwszeństwo bezpośredniego NH₄⁺ w PChN, nie
   punktowe RI. Nie uzasadnia twierdzenia, że każdy niski GFR daje
   zawsze dodatni UAG; w danych występują także wartości ujemne.
4. **Uribarri J, Oh MS.** *The Urine Anion Gap: Common Misconceptions.*
   JASN. **2021;32(5):1025–1028**.
   [DOI 10.1681/ASN.2020101509](https://doi.org/10.1681/ASN.2020101509),
   [PMC8259693](https://pmc.ncbi.nlm.nih.gov/articles/PMC8259693/).
   Odczyt zindeksowanych sekcji, w tym „What Is a Normal UAG”, tabeli
   badań i ograniczeń; nie pobierano całego PDF. Przegląd krytyczny,
   bez nowej zdrowej kohorty wieku. Dieta, stan równowagi i inne jony
   podważają uniwersalne ilościowe odwzorowanie UAG na NH₄⁺. Wartości
   dobowe z zestawienia nie są punktową normą stężenia.
5. **Uribarri J, Goldfarb DS, Raphael KL, Rein JL, Asplin JR.** *Beyond
   the Urine Anion Gap: In Support of the Direct Measurement of Urinary
   Ammonium.* AJKD. **2022;80(5):667–676**.
   [DOI 10.1053/j.ajkd.2022.05.009](https://doi.org/10.1053/j.ajkd.2022.05.009),
   [PMID 35810828](https://pubmed.ncbi.nlm.nih.gov/35810828/).
   Odczyt zindeksowanego abstraktu PubMed/ScienceDirect, nie pełnego
   artykułu. Perspektywa z oryginalnymi danymi dwóch dużych populacji;
   wspiera bezpośredni pomiar NH₄⁺, bez wdrażania norm z nieweryfikowanych
   tabel lub wyprowadzania zakresu wieku.
6. **Bonner R, Hladik G.** *Renal Tubular Acidosis: Core Curriculum 2025.*
   AJKD. **2025;85(4):501–512**.
   [DOI 10.1053/j.ajkd.2024.08.014](https://doi.org/10.1053/j.ajkd.2024.08.014),
   [PMID 39864011](https://pubmed.ncbi.nlm.nih.gov/39864011/),
   [odczytany publiczny pełny PDF](https://ucthebean.com/wp-content/uploads/2025/09/rta-core-curriculum-ajkd-2025.pdf).
   Potwierdzono DOI/paginację; UAG na s. **505**, piątej stronie PDF.
   Wydawca bezpośrednio zwrócił 403; tekst o UAG był także zindeksowany
   na jego domenie. Przegląd ekspercki, nie zdrowa kohorta referencyjna.
   Autorzy odradzają szacowanie NH₄⁺ przez UAG; omawiają inne aniony,
   dietę, hipowolemię i brak rozróżnienia biegunki od proksymalnej RTA.
7. **Batlle D, Ismail A, Mohammed B, Rosa R.** *The Concept, Usefulness,
   and Limitations of the Urine Anion Gap.* CJASN.
   **2025;20(12):1810–1813**.
   [DOI 10.2215/CJN.0000000742](https://doi.org/10.2215/CJN.0000000742),
   [PMC12708373](https://pmc.ncbi.nlm.nih.gov/articles/PMC12708373/).
   Odczyt zindeksowanych sekcji „Introduction”, „Applying the AG
   Concept”, „Clinical Use” i „Conclusion”; bezpośredni PMC wymagał
   CAPTCHA. Perspektywa autorów i analiza dawnych danych, nie konsensus
   towarzystwa. Dopuszcza orientacyjne zastosowanie w określonym
   kontekście; przyznaje szeroki zakres i brak odpowiednich badań
   wartości predykcyjnych. Omawia też zasadowicę oddechową.
8. **Berend K.** *Review of the Diagnostic Evaluation of Normal Anion
   Gap Metabolic Acidosis.* Kidney Dis (Basel). **2017;3(4):149–159**.
   [DOI 10.1159/000479279](https://doi.org/10.1159/000479279),
   [PMC5757610](https://pmc.ncbi.nlm.nih.gov/articles/PMC5757610/).
   Odczyt zindeksowanej sekcji o ograniczeniach UAG, z U_Na <20 mmol/L
   i pH >6,5; bezpośredni PMC wymagał CAPTCHA. Przegląd kliniczny,
   bez nowej populacji norm. Wskazuje wielomocz, inne aniony NH₄⁺
   i możliwość ujemnego UAG w proksymalnej RTA.
9. **Ito SH, Kanzaki G, Kuno H i wsp.** *Urine anion and osmolality gaps
   in the comprehensive evaluation of acid base balance across different
   levels of kidney function.* Sci Rep. **2025;15:22783**.
   [DOI 10.1038/s41598-025-05249-w / tekst wydawcy](https://www.nature.com/articles/s41598-025-05249-w).
   Odczyt zindeksowanego abstraktu, metod/populacji i ograniczeń na
   domenie Nature. 531 pacjentów poradni nefrologicznej, mediana wieku
   70 lat, punktowe próbki; brak bezpośredniego NH₄⁺ i kontroli diety,
   wykluczenie części leków. Nie wyznacza RI zdrowych osób starszych.

## Dane, silnik i zamrożona ocena

`clcr_uag_reference_data.js` udostępnia politykę
**`UAG_CONTEXT_2026_10`, wersja 1** jako
`VildaClcrUagReferenceData.DEFAULT_POLICY`. Zawiera siedem źródeł
wykorzystanych w opisie produkcyjnym, ograniczenia, warunkowe komentarze,
granicę znaku 0 i uwagę U_Na <20. Uribarri 2022 i Ito 2025 powyżej
stanowią uzupełnienie przeglądu, bez tworzenia dodatkowego profilu.
`profiles:[]` oznacza brak normy zdrowej populacji. Liczbowe zero
jest matematyczną granicą znaku, nie konfigurowalną normą populacji.

Publiczne API **`VildaClcrUag`** w `clcr_uag.js` rozdziela zadania:

- `inputFromValues(values)` odczytuje trzy stężenia oraz zachowane
  fakty/proweniencję z pól aplikacji; `readInputFromDocument(document)`
  jest adapterem DOM, a `FIELD_IDS` obejmuje także historyczne dowody
  wspólnej próbki używane przy przechwyceniu;
- `compute(input)` sprawdza ten sam model wejścia i wylicza dokładną
  sumę. Nie dobiera normy ani kontekstu diagnostycznego;
- `evaluate(input, policy)` otrzymuje politykę jako argument i tworzy
  ocenę; brak prawidłowej polityki nie blokuje poprawnej liczby,
  ale nie dostarcza domyślnej normy lub interpretacji diagnostycznej;
- `formatValue(rawValue, exactValue)` zachowuje znak przy adaptacyjnym
  zapisie do ośmiu cyfr znaczących, z przecinkiem, jawnym `+` dla liczby
  dodatniej i notacją naukową dla bardzo małych/dużych wartości. Dokładny
  wynik pozostaje odrębny od tego skróconego tekstu.

Ocena ma schemat **`clcr-uag`, `version:1`, `engineVersion:1`**.
`rawValue` to skończona liczba maszynowa; `exactValue` zawiera licznik
ze znakiem i dodatni mianownik jako łańcuchy dziesiętne. `sign` przyjmuje
`negative`, `zero` lub `positive`. Niezerowy dokładny wynik nie może
zostać zaakceptowany jako maszynowe zero wskutek niedomiaru. Przepełnienie
lub niereprezentowalny wynik daje błąd, nie sfabrykowane zero.

Prawidłowa ocena zachowuje `status:"unassessed"`, `tone:"neutral"`,
`outOfRange:null` i `category:null`. Przy właściwej polityce
`referenceAvailable:true` oznacza dostępne objaśnienie zera, natomiast
**`referenceActive:false`** oznacza brak aktywnej klasyfikacji według
normy. `reference.kind:"sign-boundary"` nie jest przedziałem referencyjnym.
Pierwszeństwo głównego komentarza: **znana PChN → U_Na <20 → znane
AKI/szybka zmiana kreatyniny → warunkowe objaśnienie NAGMA**. Wszystkie
znane uwagi są zachowane, także gdy jedna z nich zastępuje komentarz.

`ClcrUagPersistence` w `clcr_uag_persistence.js` wiąże liczbę i tekst
z utrwaloną oceną w istniejącej nocie laboratoryjnej. Snapshot zachowuje
wejścia, dokładny wynik, znak, tekst, źródła, wersje, kontekst, założenia
i oryginalne dowody wspólnej próbki. Czytelna część noty z typami wartości
odróżnia brak wiedzy od `false` i pierwotny tekst wejścia od liczby.
Nie jest to migracja modelu sejfu ani zapis według obecnego wieku pacjenta.

Historia odtwarza tę ocenę bez wywoływania dzisiejszego silnika lub
ponownego doboru źródeł. Istniejąca ogólna sanitacja sejfu może pominąć
ujemne `labResult.valueNum`; podpisany tekst i powiązana zamrożona
ocena zachowują ujemną wartość dla odczytu UAG. Nie wolno przez to
ustawiać wartości bezwzględnej lub zera. `norm` pozostaje puste:
objaśnienie „0 — granica znaku” nie jest przepisywane do pola normy.

Starszy zapis bez pełnej oceny zachowuje dostępny surowy wynik i tekst,
bez dopisywania dzisiejszych źródeł, normy lub NAGMA. Jeżeli istnieje
niezerowa surowa wartość, dawny tekst `0,0` może zostać poprawiony na
jej reprezentację. Gdy zachowało się jedynie zaokrąglone zero, utraconej
precyzji nie rekonstruuje się. Nierówność z raportu nie staje się
dokładnym punktem. Edycja wywołuje wspólny model produkcyjny i tworzy
nową spójną ocenę zamiast pozostawiać dawny snapshot przy zmienionej liczbie.
Przy istniejącej pełnej ocenie edytor zachowuje identyfikator i wersję
zapisanej polityki oraz niezmieniony kontekst; nie podmienia ich po cichu
na dzisiejszy profil lub dane innego pacjenta.

## Trzy błędy potwierdzone przed zmianą

1. Jedno miejsce po przecinku ukrywało prawdziwe ±0,04 jako `0,0`
   lub `−0,0`. Dodatkowo `0,3 + 0,6 − 0,9` dawało w arytmetyce
   binarnej małą ujemną resztę i wyświetlało `−0,0`, choć suma
   dziesiętnych wejść wynosi dokładnie zero. Surowa wartość ujemna
   była zachowana w kanonicznym zapisie; nie był to ogólny brak
   możliwości przechowywania ujemnego UAG.
2. Edytor zapisu akceptował ujemne stężenia, mimo że bieżący formularz
   je blokował: `−10 + 25 − 80` dawało −65, a Cl=−80 dawało +145.
   API przyjmowało też same spacje jako 0. Test spacji dotyczył API,
   nie wykazanej zwykłej ścieżki wpisywania do pola liczbowego.
3. Zapis pomijał dawne potwierdzenie `spotPairedChemistry=true` używane
   przez bieżący UAG. Przechwycona pochodna odpowiedź „yes” bez tego
   faktu nie wystarczała edytorowi i zapis poprawnego −15 stawał się
   nieedytowalny z komunikatem o braku wspólnej próbki. Naprawa ma
   zachować rzeczywistą podstawę potwierdzenia, nie zgadywać jej z etykiety.

## Precyzja i syntetyczne kontrakty regresyjne

Znak wynika z dokładnej sumy dziesiętnych wejść przed formatowaniem.
Prawdziwe ±0,04 pozostaje niezerowe, a dokładne dziesiętne anulowanie
daje 0 bez znaku ujemnego. Liczba maszynowa, dokładna reprezentacja
i tekst wyświetlany mają odrębne role. Nie wprowadza się arbitralnego
pasma „blisko zera” jako kategorii klinicznej. W Szczegółach jest
informacja, że blisko zera o znaku mogą decydować błędy oznaczeń:
**dokładność rachunku nie zwiększa dokładności pomiaru**.

| Wejście / stan | Oczekiwany wynik lub zachowanie |
|---|---|
| U_Na 40, U_K 25, U_Cl 80 mmol/L | −15 mmol/L; neutralny znak, bez normy wieku. |
| 40, 25, 40 | +25 mmol/L; nie jest automatycznie wynikiem nieprawidłowym. |
| 40, 25, 65 | 0 mmol/L; granica znaku, bez kategorii klinicznej. |
| 40, 25, 64,96 / 65,04 | +0,04 / −0,04, zachowane także po zapisie i edycji. |
| 0,3, 0,6, 0,9 | Dokładnie 0; bez binarnego artefaktu `−0,0`. |
| 0, 0, 0 / dowolne pole puste | Poprawne 0 / brak liczby. |
| Na=−10 albo Cl=−80 | Odrzucenie w formularzu i edytorze; nie powstaje zapis −65 lub +145. |
| Spacje, boolean, obiekt, nierówność lub przepełnienie | Odrzucenie bez niejawnego zamieniania na stężenie. |
| Ten sam komplet bez wieku, u dziecka i u dorosłego | Ta sama liczba i brak zastępczej normy. |
| 40, 25, 80; znana PChN | −15 z ograniczeniem PChN zamiast ogólnego wnioskowania o NH₄⁺. |
| 10, 25, 80; bez znanej PChN | −45 i uwaga U_Na <20; nie diagnoza hipowolemii lub patologicznego UAG. |
| Jawnie różne próbki moczu / wyłącznie różny czas krwi | Blokada liczby i zapisu / brak blokady wzoru moczowego. |
| Zachowane „nie wiem” | Jawne założenie wspólnej próbki; oryginalny nieznany fakt nie staje się potwierdzeniem. |
| Dawny `spotPairedChemistry=true`, Na40/K25/Cl80; przechwycenie i edycja Na→41 | −15 → −14; zachowana podstawa wspólnej próbki. |
| Zapis −0,04 wraz z kontekstem, potem zmiana obecnego pacjenta | Historia zachowuje znak, dane i ocenę z dnia zapisu; bez ponownej oceny według dzisiejszego kontekstu. |

Przypadki są całkowicie syntetyczne. Regresje wywołują rzeczywiste
funkcje produkcyjne i ścieżkę zapisu, nie kopię równania w teście.
Pliki `tests/unit/klirens-uag-engine.test.mjs`,
`tests/unit/klirens-uag-ui.test.mjs`,
`tests/unit/klirens-uag-save.test.mjs` i
`tests/unit/klirens-uag-session.test.mjs` sprawdzają renderer, wspólny
model, rzeczywistą sanitację sejfu, historię, edycję i odtworzenie
stanu. Ścieżka zapisu obejmuje `ClcrVisitSave.collectActiveDatapoints`,
`saveActiveResultToCard`, `ClcrSavedCalculation.readSaved/recalculate`
oraz `ClcrSavedResults.buildSeriesFromNotes`; odczyt historii musi
działać także po zastąpieniu aktualnego silnika funkcją zgłaszającą błąd.
`tests/e2e/klirens-uag-audit.spec.mjs` obejmuje rzeczywisty formularz,
historię, edytor, eksport i geometrię, a
`tests/e2e/klirens-uag-offline.spec.mjs` instalację/aktualizację PWA
i zimne starty offline. Samo istnienie tych testów nie potwierdza ich
przejścia. Wyniki pełnych wykonań, offline, CI, commit i PR podaje opis PR.
Ponowny przegląd jest konieczny po zmianie źródła, polityki interpretacji,
formatowania znaku lub kontraktu przechowywania wartości.
