# K/(K+Na) w moczu — udział potasu w sumie potasu i sodu

Właściciel zaakceptował [makietę przed/po na komputerze i telefonie](https://vilda-kfrac-20261103.maciej-flader.chatgpt.site) i polecił kodowanie **03.11.2026**. Źródło zaakceptowanej makiety: `4b25cd42df74963b13f2c81b3774bcd4d72278aa`. Zakres: formuła **`K_frac`**, seria **`clcr:K_frac`**. Jest to udział potasu w sumie stężeń potasu i sodu w moczu, a nie frakcja wydalania potasu FEK, Na/K, TTKG ani stosunek elektrolitów moczu do sodu osocza.

**Wpływ kliniczny:** poprawia się obsługę dokładnego zera, walidację ujemnych stężeń w edycji, precyzję oraz zgodność wyniku z zapisem. Dotychczasowa główna karta już nie stosowała normy 30–60%; ta zmiana nie „usuwa” nieistniejącej klasyfikacji. Zachowuje się neutralną ocenę, opisuje znaczenie liczby i dodaje źródła oraz ograniczony kontekst kliniczny w Szczegółach. Akceptacja i testy nie stanowią niezależnej walidacji klinicznej.

## Wzór i minimalne dane

`K/(K+Na) [%] = 100 × U_K / (U_K + U_Na)`

Dwa pola, w tej kolejności: **potas w moczu**, **sód w moczu**, oba w **mmol/L**, z tej samej próbki. Dla jednowartościowych K⁺ i Na⁺ wartości w mEq/L są liczbowo takie same jak w mmol/L. Nie stosuje się w tym wzorze stężeń masowych bez odpowiedniej konwersji. Wynik kanoniczny jest procentem, nie ułamkiem 0–1.

Każde stężenie musi być osobno nieujemne, a ich suma dodatnia. Dokładne K=0 przy Na>0 daje 0%; Na=0 przy K>0 daje 100%. Oba zera nie wyznaczają wyniku. Wyniku laboratoryjnego „poniżej granicy oznaczalności” nie zastępuje się dokładnym zerem; pola tej formuły przyjmują dokładne stężenia, nie operatory `<`, `≤`, `>` lub `≥`.

Wiek, płeć, masa, wzrost, BSA, kreatynina, surowica, czas i objętość zbiórki nie należą do wzoru. Nie dodaje się pytań o IFCC, stabilność nerek, choroby, leki lub wybór źródła. Istniejący formularz także potrzebował tylko dwóch stężeń; uproszczenie polega na czytelniejszej nazwie, miejscu w menu i wyjaśnieniu wyniku, nie na usunięciu wcześniej wymaganej ankiety.

## Materiał i zakres zastosowania

Pozycja przechodzi do sektora **„Obliczenia z próbki moczu”**, a formularz informuje **„Zbiórka dobowa nie jest wymagana.”** Obliczenie jest matematycznie możliwe również ze stężeń w tej samej wymieszanej DZM; czas i objętość się skracają. Nie mnoży się wskaźnika przez `24/czas` i nie przedstawia go jako wydalania dobowego.

Pozycja w menu nie potwierdza sposobu pobrania próbki. Nowy zapis bez takiej informacji ma **ogólny mocz / `sampleType: unspecified`**. Znany materiał DZM w dawnym zapisie pozostaje DZM; nie przemianowuje się go automatycznie na próbkę jednorazową. Kliniczne źródła dotyczą przede wszystkim próbki jednorazowej i nie ustanawiają równoważnych progów dla zbiórki dobowej.

Ta sama próbka jest opisanym założeniem, bez checkboxa. Jawna informacja odnosząca się do tego pomiaru, że K i Na pochodzą z różnych próbek, blokuje obliczenie i pozostaje zachowana po zapisie/edycji. Nie przejmuje się flagi innego obliczenia lub niepowiązanych próbek. Nieznany fakt nie staje się laboratoryjnym potwierdzeniem.

## Polityka oceny i źródła

Wersjonowany profil **`KFR_2026_11`** w `clcr_potassium_index_data.js` jest argumentem `VildaClcrPotassiumIndex.evaluate(input, profile)`. Obejmuje źródła, populację i ograniczenia komentarza; **nie zawiera uniwersalnej normy**. W badanych źródłach nie znaleziono zweryfikowanego zdrowego przedziału referencyjnego według wieku lub płci dla tego dokładnego wskaźnika. To zakres wykonanego przeglądu, nie twierdzenie, że nigdzie nie opublikowano żadnych danych referencyjnych.

Wszystkie poprawne liczby pozostają **neutralne i nieocenione**: `assessment: unassessed`, `tone: neutral`, `outOfRange: null`, brak normy. Dotyczy to również wartości 0%, 60%, >60% i 100%, dzieci, dorosłych oraz braku danych demograficznych. Przedział matematyczny **0–100% nie jest normą**. Nie wyprowadza się patologii ani prawidłowości z samej możliwości obliczenia.

### ISPN 2021 — podstawa ograniczonego komentarza klinicznego

Sinha A, Bagga A i wsp. **Steroid Sensitive Nephrotic Syndrome: Revised Guidelines.** *Indian Pediatrics* **2021;58:461–481**, online 20.03.2021. [Pełny tekst](https://www.indianpediatrics.net/may2021/may-461-481.htm), **Guideline 6: Management of Hypovolemia and Edema, §6.1, Rationale**; odczyt 03.11.2026.

Wytyczne opisują **dzieci z zespołem nerczycowym wrażliwym na steroidy**, u których **FENa <0,5% łącznie z potassium index >0,6** pomaga w ocenie wolemii z uwzględnieniem obrazu klinicznego. 0,6 odpowiada 60%; nie jest zdrową granicą wieku ani samodzielnym testem. Niedawne diuretyki oraz dożylne płyny ograniczają wiarygodność tych wskaźników.

Zaakceptowany tekst w zwiniętych Szczegółach:

> U dzieci z zespołem nerczycowym wskaźnik >60%, oceniany łącznie z FENa <0,5% i obrazem klinicznym, bywa pomocny w ocenie hipowolemii. Nie jest to norma dla zdrowej populacji; sam wynik nie rozpoznaje hipowolemii.
>
> Dane dotyczą przede wszystkim próbki jednorazowej. Diuretyki i dożylne płyny ograniczają interpretację.

To informacja o zastosowaniu opisywanym w źródłach, a nie automatyczna ocena aktualnego pacjenta. Formularz nie rozpoznaje zespołu nerczycowego, nie dopisuje brakującego FENa i nie rekomenduje albuminy, diuretyku ani zmiany leczenia.

### Badania pierwotne i ograniczenia przenoszenia progów

Źródła odczytano **03.11.2026**; zakres dostępu jest podany osobno.

- **Donckerwolcke RAMG i wsp.** *Distal nephron sodium-potassium exchange in children with nephrotic syndrome.* Clin Nephrol. **2003;59(4):259–266**, [DOI 10.5414/CNP59259](https://doi.org/10.5414/CNP59259), [PMID 12708565](https://pubmed.ncbi.nlm.nih.gov/12708565/). Odczytano **abstrakt**, nie pełny tekst. 85 dzieci z minimal lesion NS i 41 z innymi nefropatiami; >0,60 wiązano z aldosteronem/hipowolemią w podgrupie zatrzymującej sód, FENa <0,5%. Nie ustala norm całej populacji.
- **Matsumoto i wsp.** *Ratio of Urinary Potassium to Urinary Sodium and the Potassium and Edema Status in Nephrotic Syndrome.* Intern Med. **2011;50:551–555**, [DOI 10.2169/internalmedicine.50.4537](https://doi.org/10.2169/internalmedicine.50.4537), [pełny PDF](https://www.jstage.jst.go.jp/article/internalmedicine/50/6/50_6_551/_pdf). Odczytano pełne 5 stron, szczególnie Patients/Examination/Results i tabelę 2. 26 dorosłych z MCNS; wskaźnik pochodził z **spot urine**, choć w badaniu wykonywano również inne oznaczenia z DZM. Podział 0,46 był średnią chorej kohorty, nie normą. Średnie po remisji 0,24±0,05 i 0,25±0,05 nie ustanawiają dolnej granicy 30% ani zdrowego zakresu wieku.
- **Keenswijk W i wsp.** *Urinary potassium to urinary potassium plus sodium ratio can accurately identify hypovolemia in nephrotic syndrome: a provisional study.* Eur J Pediatr. **2018;177:79–84**, [DOI 10.1007/s00431-017-3029-2](https://doi.org/10.1007/s00431-017-3029-2), [PMID 29022080](https://pubmed.ncbi.nlm.nih.gov/29022080/). Odczytano **abstrakt**; pełny tekst pozostawał dostępny tylko w UGent. 44 dzieci z NS i 36 kontrolnych, wstępne >0,5–0,6. Nie jest to odczytana tabela norm wieku/płci.
- **Singh i wsp.** *Diagnostic Accuracy of Urinary Potassium Index Versus Inferior Vena Cava Collapsibility Index for Detection of Hypovolaemia in Oedematous Children with Idiopathic Nephrotic Syndrome.* Indian J Nephrol., online **15.07.2026**, [DOI 10.25259/IJN_387_2026](https://doi.org/10.25259/IJN_387_2026), [pełny tekst](https://indianjnephrol.org/diagnostic-accuracy-of-urinary-potassium-index-versus-inferior-vena-cava-collapsibility-index-for-detection-of-hypovolaemia-in-oedematous-children-with-idiopathic-nephrotic-syndrome/), Methods/Results/Discussion. 80 dzieci z nawrotem NS oraz 59 kontrolnych, spot urine. UKI: **AUC 0,610; 95% CI 0,484–0,737; p=0,100**; nie potwierdzono samodzielnego różnicowania hipowolemii. Złożony standard wolemii nie był niezależnie zwalidowany; w Methods wydrukowano też odwrócony wzór FENa. Bez danych surowych nie rozstrzyga się, czy jest to tylko błąd druku. Praca nie stanowi podstawy nowego progu lub normy.

Zakres **30–60%** znajduje się w przeglądzie Naushabayeva AY i wsp., *Rational diagnostic methods and algorithms for detecting kidney diseases in children*, Pediatricheskaya Farmakologiya **2009;6(4)**: [pełny PDF](https://med-click.ru/uploads/files/docs/ratsionalnye-metody-i-algoritmy-diagnostiki-zabolevaniy-pochek-u-detey.pdf), angielska tabela 11, **drukowana s.74 / PDF s.27**. Tabela dotyczy wolemii i leczenia obrzęków w zespole nerczycowym; „Normal” opisuje kategorię objętości wewnątrznaczyniowej w tym schemacie. Nie jest to pierwotne badanie zdrowych przedziałów referencyjnych. Nie wdraża się 30–60% jako normy dzieci lub dorosłych.

Nie przenosi się celów Na/K dla diety, progów FEK, TTKG ani danych PHA/CAH dotyczących innych ilorazów. Przegląd nie dostarczył podstawy do oceny skuteczności mineralokortykoidu przez sam K/(K+Na); nie dodaje się związanej z tym ankiety.

## Precyzja i prezentacja

Walidacja działa w nowym formularzu oraz przy świadomej edycji. Puste pole nie oznacza zera. Parser przyjmuje liczby dziesiętne z przecinkiem lub kropką, w tym poprawny zapis wykładniczy; odrzuca m.in. liczby ujemne, literały szesnastkowe, nieskończoność, nierówności i tekst. Suma dwóch dużych operandów nie może zmienić poprawnego ilorazu w zero przez przepełnienie. Dodatni wynik zbyt mały do kanonicznej reprezentacji liczbowej jest jawnie odrzucany zamiast stawać się zapisywalnym zerem.

Silnik zachowuje dokładny ułamek z dziesiętnych wejść oraz niezaokrągloną wartość liczbową osobno od tekstu. Skrócona prezentacja może mieć **≈**; mała dodatnia liczba nie staje się dokładnym 0% na ekranie, w Notatce lub zapisie. „Dokładny” dotyczy arytmetyki podanych liczb, nie nieograniczonej dokładności pomiaru laboratoryjnego.

Jedna neutralna karta B zawiera **„Wynik pacjenta”** z dużą liczbą i %, obok **„Norma — Brak uniwersalnej normy”**, poniżej **„Wynik opisuje udział potasu w sumie potasu i sodu w moczu.”** Pasek **„Udział w sumie K + Na”** przedstawia skład K/Na; nie ma pasma prawidłowości ani znacznika 60%. Kolory nie nadają kategorii klinicznej. Wzór, dokładniejszy zapis, źródła i kontekst nerczycowy należą do domyślnie zwiniętych Szczegółów.

Formularz ma stałe szerokości, wspólny poziom jednostek i równe odstępy w stanie pustym, przy błędzie i długiej liczbie. Pola mobilne mają ≥16 px tekstu i ≥48 px wysokości, pod przyciskiem czyszczenia pozostaje ≥20 px. Dotychczasowe akcje eksportu i zapis do karty pozostają dostępne zgodnie z ich istniejącymi warunkami.

## Zapis, odczyt historii i edycja

Moduły `clcr_potassium_index_data.js`, `clcr_potassium_index.js`, `clcr_potassium_index_ui.js` i `clcr_potassium_index_persistence.js` rozdzielają politykę, obliczenie, widok oraz odczyt zapisu. Migawka **`clcr-potassium-index` v1**, pole **`potassiumIndexSnapshot`**, utrwala oryginalne stężenia/jednostki, dokładną wartość i ułamek, prezentację, materiał i znane fakty o próbce, źródła/politykę oraz neutralną ocenę. Niezaokrąglona liczba trafia również do `labResult.valueNum`.

Zwykły **READ** Badań, Notatek i raportu nie uruchamia dzisiejszego silnika, nie dodaje nowej interpretacji i nie przemianowuje materiału. Dawna techniczna flaga `outOfRange:false` bez normy nie jest podstawą komunikatu „W normie”. Wiarygodna zachowana wartość surowa pozostaje zachowana; utraconej precyzji nie rekonstruuje się przez zgadywanie.

Nowe obliczenie i świadomy **EDIT** starego wpisu bez migawki korzystają z zaakceptowanej polityki. Wpis z migawką zachowuje wersję polityki i kontekst. Każda edycja zachowuje ID oraz znany materiał; usunięcie dotyczy tego samego kanonicznego rekordu. Nie tworzy się drugiego pomiaru wskutek przeniesienia pozycji menu. Zapis wymaga wcześniej zapisanej i wybranej karty pacjenta oraz powiązania z wizytą. Notatka jest czytelna, bez technicznego JSON.

## Syntetyczny kontrakt regresji

Poniższe przypadki mają wywoływać rzeczywiste funkcje produkcyjne, także pełną ścieżkę edycji zapisu. To kontrakt, **nie deklaracja wykonanych testów**; wyniki uruchomień, końcowy SHA i PR podaje raport przekazania.

| K / Na, oba w mmol/L, albo stan | Oczekiwany wynik |
| --- | --- |
| 60 / 20 | Dokładnie 75%, neutralnie, bez normy, Na stanowi 25%. |
| 40 / 60 | Dokładnie 40%, taka sama polityka bez wieku i z dowolnym wiekiem/płcią. |
| 0 / 60; 40 / 0 | Dokładnie 0%; 100%, poprawna gotowość dwóch pól. |
| 0 / 0 | Brak liczby; suma musi być >0. |
| −1 / −1; 1 / −0,5; −1 / 2 | Błąd osobnego ujemnego stężenia, również w pełnej edycji; brak zapisu 50%, 200% lub −100%. |
| 40,5 / 60 | Około 40,29850746268657%; przecinek zachowany jako poprawne wejście. |
| `0x10` / 60; `<1` / 60; puste / 60 | Błąd formatu lub brak danych; nie zamieniać na 16, 1 lub 0. |
| 0,000001 / 100 | Dodatnie około 9,9999999×10⁻⁷%, również w zapisie i historii; nigdy 0,0%. |
| 1e308 / 1e308 | 50%, bez przepełnienia sumy. |
| 1e−300 / 1e308 | Jawny brak zapisywalnej reprezentacji, nigdy pozorne dokładne zero. |
| 60 / 40; 60,0001 / 39,9999 | 60%; 60,0001%, oba neutralne, bez alarmu progowego. |
| Jawne różne próbki → zapis/edycja | Stężenia zablokowane; sprzeczność nie znika. |
| Nowy pomiar / stary znany materiał DZM | Nieokreślony rodzaj pobrania / zachowane DZM; zmiana menu nie migruje materiału. |
| READ starego wyniku bez bieżącego silnika | Odczyt utrwalonej liczby/oceny bez nowej klasyfikacji lub zgadywania precyzji. |
| EDIT i usunięcie | Ten sam ID, jedna kanoniczna historia; brak duplikatu. |

Ponowny przegląd jest potrzebny przy wprowadzeniu osobnego trybu klinicznego, nowego wiarygodnego zakresu referencyjnego lub zmianie populacji zastosowania. Samo dodanie źródła nie może automatycznie zmienić neutralnego wskaźnika w test diagnostyczny.
