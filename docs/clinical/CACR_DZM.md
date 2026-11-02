# Ca/Cr z DZM — stosunek wapnia do kreatyniny

Właściciel zaakceptował zaktualizowaną [makietę przed/po na komputerze i telefonie](https://vilda-cacr-dzm-20261102.maciej-flader.chatgpt.site) oraz kodowanie **02.11.2026**. Zatwierdzony wariant zachowuje dwie osobne pozycje: **„Ca/Cr — DZM”** (`Ca_Cr`) i **„Ca/Cr — próbka jednorazowa”** (`CaCr_spot`), z własnymi polami, materiałem i historią. Nie ma przełącznika zmieniającego materiał edytowanego pomiaru.

To zmiana kliniczna: DZM otrzymuje nazwany profil laboratoryjny dla wieku i płci, dokładniejszą konwersję wapnia oraz jednolitą walidację i zapis. Tabela Mayo i granice wieku próbki jednorazowej pozostają odrębne. Wspólna polityka zera, dokładności i walidacji obejmuje obie pozycje zgodnie z zaakceptowaną makietą. Akceptacja i testy nie są niezależną walidacją kliniczną algorytmu.

## Źródło i pełna tabela norm DZM

Jedyny domyślny profil DZM to **ARUP Laboratories, Calcium, Urine, 0020472 / UCA**, składnik **0020721, Calcium/Creatinine Ratio, Urine**, LOINC **13717-4**. Odczytano pełny [katalog ARUP](https://ltd.aruplab.com/Tests/Pub/0020472) i obydwa oficjalne raporty przykładowe **02.11.2026**. Metoda: ilościowa spektrofotometria. Katalog nie podaje daty wersji tabeli, kohorty, percentyli ani osobnej populacji wcześniaczej. Wersja danych oznacza stan odczytu, nie wymyśloną datę publikacji.

Podstawowym materiałem katalogu jest zbiórka 24 h; dopuszcza on również mocz losowy. [Raport prawidłowy](https://ltd.aruplab.com/api/ltd/examplereport?report=0020472,%20Normal.pdf) wydaje ratio z normą przy 24 h, [nieprawidłowy](https://ltd.aruplab.com/api/ltd/examplereport?report=0020472,%20Abnormal.pdf) przy 25 h; obydwa wydrukowano 16.07.2026. ARUP nie jest więc źródłem wyłącznie dla DZM. To orientacyjne porównanie laboratoryjne, bez potwierdzenia zgodności metody lub populacji pacjenta, a nie przeniesienie Mayo dla moczu losowego.

Źródłowa jednostka to **mg/g kreatyniny**. Ta sama tabela jest poniżej dokładnie przeliczona przez `÷1000` na mg/mg.

| Wiek źródłowy | M mg/g | F mg/g | M mg/mg | F mg/mg |
| --- | ---: | ---: | ---: | ---: |
| 0–11 miesięcy | 30–810 | 30–810 | 0,030–0,810 | 0,030–0,810 |
| 12–23 miesiące | 30–560 | 30–560 | 0,030–0,560 | 0,030–0,560 |
| 24–35 miesięcy | 20–500 | 20–500 | 0,020–0,500 | 0,020–0,500 |
| 3–4 lata | 20–410 | 20–410 | 0,020–0,410 | 0,020–0,410 |
| 5–6 lat | 10–300 | 10–300 | 0,010–0,300 | 0,010–0,300 |
| 7–9 lat | 6–431 | 11–457 | 0,006–0,431 | 0,011–0,457 |
| 10–12 lat | 8–300 | 12–309 | 0,008–0,300 | 0,012–0,309 |
| 13–15 lat | 6–293 | 8–313 | 0,006–0,293 | 0,008–0,313 |
| 16–17 lat | 10–264 | 20–271 | 0,010–0,264 | 0,020–0,271 |
| ≥18 lat | 20–240 | 20–300 | 0,020–0,240 | 0,020–0,300 |

**Konwencja aplikacji:** ukończone miesiące/lata odpowiadają przedziałom `[0,1)`, `[1,2)`, `[2,3)`, `[3,5)`, `[5,7)`, `[7,10)`, `[10,13)`, `[13,16)`, `[16,18)`, `[18,∞)` w latach. Bez interpolacji, zaokrąglania wieku do sąsiedniej grupy lub tolerancji przesuwającej granicę. Oba liczbowe końce normy są włączone. Są to jawne reguły implementacji; źródłowe etykiety wieku pozostają zachowane.

Jeżeli wpisano tylko ukończone **0 lat**, bez miesięcy i dni, DZM zachowuje przedział wieku `[0,1)` zamiast udawać dokładny wiek 0 miesięcy. Cały ten przedział ma jedną wspólną normę ARUP, więc nie wymaga dodatkowego pytania. Ta niepewność pozostaje w migawce, odczycie i edycji; nie przenosi się tego wyjątku do Mayo, którego zakres zaczyna się od 1. miesiąca.

Wiek i płeć pochodzą z istniejących danych pacjenta. Przed 7. urodzinami zakresy obu płci są identyczne, więc nieznana płeć nie blokuje tego wspólnego zakresu. Od 7 lat nie wybiera się dowolnie M/F ani nie tworzy przecięcia; bez płci pozostaje liczba bez oceny. Nie ma nowej ankiety. Ograniczenie kontekstu aplikacji do wiarygodnego wieku 0–120 lat nie jest górną granicą ARUP. Pacjent 84-letni może mieć normę DZM, mimo osobnego ograniczenia Mayo SPOT po dokładnym wieku 83 lat.

ARUP jawnie obejmuje 0–11 miesięcy; nie przenosi się dolnej granicy 1 miesiąca z Mayo. Znany bieżący kontekst wcześniaczy pozostawia liczbę z konkretnym ograniczeniem porównania, bez wieku skorygowanego lub normy zastępczej. Sam dawny wywiad wcześniactwa starszego dziecka nie usuwa normy. Źródło nie dowodzi osobnej walidacji wcześniaczej.

## Materiał i czas zbiórki

W pozycji DZM zakłada się, zgodnie z jawnym opisem formularza, że wapń i kreatynina pochodzą z tej samej wymieszanej zbiórki. Nie ma obowiązkowego potwierdzania próbki. Znane przeciwne fakty nie są nadpisywane założeniem ani pobierane z niepowiązanego kalkulatora.

Iloraz nie wymaga czasu i objętości: wspólny czynnik `objętość ×24/czas` skraca się w liczniku i mianowniku. Nie mnoży się Ca/Cr przez `24/czas`, nie wyraża go w mg/24 h i nie dodaje pól krwi, masy, wzrostu, czasu, objętości lub ankiety AKI/IFCC.

ARUP nie publikuje okna 22–26 h — nie przenosi się go z Litholink. Znany inny **dodatni** czas albo nieznany czas historyczny nie wstrzymuje sam w sobie porównania z ogólnym profilem ARUP. To jawna, zaakceptowana polityka aplikacji oparta na dopuszczeniu różnych materiałów i raporcie 25 h, nie twierdzenie o walidacji dowolnej długości i kompletności zbiórki. Znany czas pozostaje w Szczegółach; brak czasu nie jest potwierdzeniem 24 h. Nie pożycza się zegara z innego obliczenia.

Jawnie znana błędna lub niepełna zbiórka wstrzymuje automatyczną ocenę, ale nie poprawny iloraz liczbowy. Nieprawidłowy własny zapis czasu, np. zero, wartość ujemna albo tekst zamiast liczby, również nie otrzymuje oceny. Komunikat wskazuje rzeczywisty problem. Znane różne próbki blokują obliczanie ze stężeń. Niezależny gotowy raport laboratorium pozostaje dostępny; przeciwne metadane zachowują się i po powrocie do stężeń znów blokują iloraz.

## Minimalne dane, jednostki i dokładność

Domyślne **„Oblicz ze stężeń”** wymaga dwóch wartości z jednostkami; **„Gotowy wynik Ca/Cr”** jednego stosunku z jednostką raportu. Dla stężeń główną jednostką jest mg/mg; gotowy stosunek zachowuje skalę raportu. Norma i tabela Szczegółów są zawsze w tej samej jednostce co wynik.

`R_mass = U_wapń [mg/L] / U_kreatynina [mg/L]`

Stałe są spójne z dotychczasowym obliczeniem próbki jednorazowej: **Ca 40,078 mg/mmol**, **Cr 113,12 mg/mmol**. Dane NIST: [wapń 40,078](https://webbook.nist.gov/cgi/cbook.cgi?ID=7440-70-2) i [kreatynina 113,1179](https://webbook.nist.gov/cgi/cbook.cgi?ID=60-27-5), zaokrąglona do 113,12. Nie miesza się ich z oddzielnym zaokrąglonym przelicznikiem 88,4.

| Jednostka gotowego stosunku | Do mg/mg |
| --- | --- |
| mg/mg | ×1 |
| mg/g | ÷1000 |
| mmol/mmol | ×40,078/113,12 |
| mmol/mol | ×40,078/(113,12×1000) |
| mg/mmol | ÷113,12 |

To pięć różnych skal. Historyczne aliasy **g/g = mg/mg** i **mol/mol = mmol/mmol** nadal zachowują znaczenie w sesjach, importach i edycji. Nowe obliczenie może użyć równoważnej etykiety kanonicznej, zachowując surową jednostkę wejścia w migawce. Uproszczenie listy nowych wyborów nie przepisuje jednostki dawnych wyników podczas ich odczytu.

Stary DZM używał `1 mmol/L Ca →4 mg/dL`, nowy `→4,0078 mg/dL`. Wynik przy molowym stężeniu wapnia jest o 0,195% większy. To jawna zmiana konwersji; podczas zwykłego odczytu nie przelicza się dawnych liczb przez nowy współczynnik.

Wapń i gotowy stosunek muszą być ≥0, kreatynina >0. Każdy operand jest sprawdzany osobno: dwa ujemne stężenia nie tworzą poprawnego dodatniego wyniku, a puste pole nie jest zerem. Ujemne, niefinitywne dane, nieobsługiwana jednostka oraz dodatni underflow/overflow nie mogą utworzyć zapisywalnego zera lub nieskończoności. Dokładna arytmetyka chroni również skończony iloraz przed przepełnieniem pośredniej konwersji. Nie stosuje się arbitralnych wspólnych sufitów Ca/Cr jako progów fizjologicznych.

**Zero w obu pozycjach Ca/Cr** pozostaje dostępną dokładną liczbą z neutralną uwagą o raporcie/oznaczalności, bez automatycznej pozytywnej lub niskiej kategorii. To zaakceptowana zmiana wspólnego zachowania; nie zmiana tabeli Mayo. Mały dodatni wynik nie staje się zerem. Operatory `<`, `≤`, `>` i `≥` opisują cały przedział możliwych wartości, nie fikcyjny punkt na granicy.

Ocena poprzedza skrócenie prezentacji i nie używa epsilon przesuwającego próg. Znak **≈** oznacza skrócony zapis; pełna wartość lub dokładny ułamek i operator pozostają w Szczegółach oraz zapisie. Wynik z nierównością nie otrzymuje dokładnego punktu, jeśli operator go nie wyznacza.

## Jeden wynik, dwie historie

Jedna karta B łączy liczbę pacjenta z normą dla jego kontekstu i widocznym źródłem **ARUP**. Obie granice pasma są podpisane, liczby normy neutralne, odchylenia bursztynowe. Brak oceny nie jest wynikiem prawidłowym. Szczegóły zawierają pełną tabelę w aktywnej jednostce i opis źródłowej osi mg/g. Stałe szerokości, wyrównanie jednostek, pola ≥16 px/48 px i odstęp pod czyszczeniem ≥20 px obowiązują we wszystkich trybach i stanach.

Tożsamości są odrębne: **`Ca_Cr` / `clcr:Ca_Cr`** to DZM, **`CaCr_spot` / `clcr:CaCr_spot`** to próbka jednorazowa. Pola, historie i edytowane pomiary nie przechodzą między seriami. Nawigacja do drugiej pozycji nie zmienia materiału lub ID edytowanego rekordu. Nowy pomiar ma nowe ID, zwykła edycja zachowuje własne ID.

Wspólny silnik `VildaClcrCacr` przyjmuje wersjonowane dane norm jako argument. DZM używa **`ARUP_CACR_DZM_2026_11`**, próbka jednorazowa własnego **`MAYO_CACR3_RANDOM_2026_10`**. Migawka **`cacrSnapshot` v2** utrwala surowe operandy, jednostki/operator, dokładną wartość, kontekst próbki, wiek/płeć, użyty profil, granice i ocenę. Brak oceny zachowuje `outOfRange:null`, nie `false`.

Normy znajdują się w `clcr_cacr_reference_data.js`, a obliczenia w `clcr_cacr.js`. Warstwę formularza DZM obsługuje `clcr_cacr_dzm_ui.js`; `clcr_cacr_dzm_persistence.js` sprawdza utrwaloną migawkę i odtwarza ją bez wywołania bieżącego silnika lub odczytywania bieżącej tabeli norm.

Badania, Notatki, wyszukiwanie, raport i historia odtwarzają zapis bez przeliczania dzisiejszym wiekiem, profilem lub silnikiem. Starsza liczba z `×4`, jednostka, zakres i rzeczywiście utrwalona ocena pozostają historyczne; nie dostają nowego ARUP albo `×4,0078`. Nie odzyskuje się precyzji utraconej przez dawny zapis. Brak normy nie jest dopisywanym „w zakresie”.

Dopiero jawne nowe obliczenie lub edycja starego wpisu używa zatwierdzonej nowej konwersji/polityki i utrwala użyty kontekst. Dlatego identyczne stare operandy mogą po świadomej edycji dać inną końcówkę liczby oraz nową ocenę; zwykły odczyt tego nie robi. Edycja i usunięcie dotyczą tego samego pomiaru. Zapis wymaga istniejącej, wcześniej zapisanej karty pacjenta. Audyt nie zmienia prawdziwych danych sejfu.

Puste ustawienia nowego formularza i migracja równoważnych aliasów jednostek nie oznaczają zmiany danych pacjenta. Porównanie statusu zapisu zachowuje rzeczywiste operandy, ich jednostki oraz jawne fakty o próbce; samo porównanie nie modyfikuje sesji ani historycznej migawki. Na wąskim ekranie również dziewięcioznakowa przeliczona granica normy korzysta z istniejącego zwartego wariantu typografii, aby cała liczba mieściła się w kolumnie.

## Przytarczyce, XLH i burosumab — tylko kontekst w Szczegółach

**Ca/Cr, dobowe wydalanie wapnia i iloraz klirensów CCCR są różnymi wielkościami.** Dobowe wydalanie ma jednostkę mg/24 h lub mg/kg/24 h. CCCR wymaga także równoczesnego wapnia i kreatyniny we krwi: `CCCR = (U_Ca × S_Cr) / (S_Ca × U_Cr)` przy uzgodnionych jednostkach. Nie stosuje się progów CCCR, np. 0,01, do prostego stosunku w moczu.

W chorobach przytarczyc ratio może być elementem oceny, lecz nie rozpoznaje PHPT/FHH ani wskazania do operacji. [Fifth International Workshop 2022](https://doi.org/10.1002/jbmr.4677) rozdziela wydalanie dobowe od CCCR. [PARAT 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8789028/) opisuje potrzebę równoczesnych danych krwi/moczu i ograniczenia CCCR. [Zrewidowane wytyczne ESE dla dorosłych z HypoPT, 2025](https://doi.org/10.1093/ejendo/lvaf222) wiążą kontrolę kalciurii z ilościową oceną dobową. Nie zamienia się ich progów mg/24 h na normę ratio ani nie tworzy algorytmu leczenia.

[EAU Paediatric Urology 2026, §18.2.1](https://uroweb.org/guidelines/paediatric-urology/chapter/urinary-stone-disease) odróżnia stosunek przesiewowy od ilościowego wydalania w DZM. [EAU Urolithiasis, §4](https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention) opisuje pełną ocenę metaboliczną kamicy. Odnośnik do istniejącego **dobowego wydalania wapnia** jest właściwą dodatkową ścieżką, bez dodawania masy, czasu i objętości do samego ratio.

[Wytyczne XLH Haffner i wsp., 2025](https://doi.org/10.1038/s41581-024-00926-x), Nat Rev Nephrol 21:330–354, pełny [PDF publikacji](https://xlhuk.org/wp-content/uploads/2025/01/Clinical-practice-recommendations-XLH.pdf), rozdzielają monitorowanie kalciurii i skuteczność burosumabu. Ca/Cr uczestniczy w ocenie bezpieczeństwa; odpowiedź na lek obejmuje m.in. fosforany, TmP/GFR, ALP i obraz kliniczny. Przy bardzo małym UCr, np. małej masie mięśniowej, wskazują przydatność oceny dobowej. Kontekst pozostaje w Szczegółach, bez selektora choroby, dawkowania lub deklaracji skuteczności leku na podstawie ratio.

Źródła interpretacyjne odczytano podczas audytu 02.11.2026; wersje podano w cytowaniach. Nie miesza się ich progów z tabelą ARUP. Wstępna propozycja Litholink nie jest wdrażanym profilem ani normą wybieraną według korzystniejszej oceny.

## Wpływ kliniczny i kontrakt regresji

Poniższe oczekiwania dotyczą rzeczywistych funkcji produkcyjnych; nie stanowią deklaracji zakończonych testów.

| Wejście / stan | Oczekiwane zachowanie |
| --- | --- |
| DZM, 40 lat, M; Ca 5 mmol/L / Cr 100 mg/dL | 0,20039 mg/mg; ARUP 0,020–0,240, w zakresie. Dawne `×4` dawało 0,2; READ starego zapisu zachowuje 0,2. |
| DZM, 8 lat, M; te same stężenia | Ta sama dokładna liczba; ARUP 0,006–0,431 mg/mg, w zakresie. |
| DZM, 8 lat, F; te same stężenia | ARUP 0,011–0,457 mg/mg, w zakresie. |
| DZM, 40 lat, M; Ca 8 mmol/L / Cr 100 mg/dL | 0,320624 mg/mg, powyżej 0,240. |
| DZM, 8 lat, M; gotowe 300 mg/g | W zakresie ARUP 6–431. Osobne SPOT Mayo dla 0,3 mg/mg: powyżej 0,01–0,25; bez mieszania serii. |
| DZM, dokładnie 7 lat, M; 6 / 431 / 431,0000000000000000001 mg/g | W zakresie / w zakresie / powyżej, także gdy skrót prezentacji trafia na granicę. |
| DZM, 4 lata, nieznana płeć / od 7 lat bez płci | Wspólny zakres 20–410 mg/g / liczba bez automatycznej normy. |
| DZM, wiek nieznany / 121 lat / bieżący kontekst wcześniaczy | Liczba z konkretnym ograniczeniem, bez normy zastępczej. |
| DZM, 84 lata, znana płeć | Właściwy zakres ARUP; ograniczenie wieku Mayo dotyczy osobnej próbki jednorazowej. |
| Obie pozycje: wapń lub gotowy stosunek 0, Cr>0 | Dokładne zero z neutralną uwagą o oznaczeniu; bez pozornej kategorii prawidłowej lub niskiej. |
| Ca 0,0001 mmol/L / Cr 100 mg/dL | Dodatnie 0,0000040078 mg/mg, identycznie niezerowe we wszystkich projekcjach zapisu. |
| Ujemny Ca, ujemny Cr, dwa ujemne operandy lub Cr 0 | Błąd; brak zapisu pozornie poprawnego ilorazu. |
| Dodatni underflow/overflow | Brak dokładnego zera lub nieskończoności udających poprawny wynik. |
| Inny dodatni czas / nieznany czas | Bez skalowania `24/czas`; jawna polityka ARUP, czas zachowany bez dopisania potwierdzonych 24 h. |
| Znana błędna lub niepełna zbiórka | Liczba dostępna, automatyczna ocena wstrzymana z konkretnym powodem. |
| Znane różne próbki | Stężenia zablokowane; niezależny gotowy raport dostępny, przeciwne metadane zachowane. |
| Zapis, zmiana wieku/norm/silnika, ponowny READ | Historyczne liczba, materiał, jednostka i ocena odtworzone bez przeliczania. |
| Jawny EDIT starego DZM i nawigacja do SPOT | Edycja zachowuje ID i serię; druga pozycja nie przejmuje danych lub zapisu. |

Wymagane regresje obejmują wszystkie dziesięć grup ARUP, obie kolumny płci, granice 1/2/3/5/7/10/13/16/18 lat, jednostki i aliasy, brak kontekstu, nierówności, dokładność, spójność projekcji, edycję/usuwanie, wersje historyczne, desktop/mobile oraz rzeczywistą instalację i aktualizację offline. Wyniki wykonanych testów, końcowy commit i PR podaje opis PR. Przegląd trzeba ponowić po zmianie źródła lub rozszerzeniu materiału/populacji.
