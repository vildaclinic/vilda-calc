# B/Cr w DZM — białko całkowite/kreatynina

Właściciel zaakceptował [makietę przed/po na komputerze i telefonie](https://vilda-bcr-dzm-20261103.maciej-flader.chatgpt.site) i polecił kodowanie **03.11.2026**. Źródło zaakceptowanej makiety: `7e21c025bbde72e2574872173bb85575a965787f`. Zakres: formuła **`B_Cr`**, seria **`clcr:B_Cr`**, stosunek białka całkowitego do kreatyniny z tej samej wymieszanej dobowej zbiórki moczu. Punktowy PCR, ACR i dobowa masa białka są odrębnymi obliczeniami i seriami.

To zmiana kliniczna i funkcjonalna: nowe obliczenia otrzymują porównanie z zakresem ARUP u dzieci 7–17 lat albo kategoriami KDIGO u dorosłych, dodatkowe jednostki oraz gotowy raport. Usuwa się rozbieżności walidacji, utratę małych wartości i fałszywą ocenę „W zakresie” bez normy. Historyczny wzór wykorzystujący masę całej zbiórki był poprawny wymiarowo; jego pola nie stają się stężeniami. Akceptacja i testy nie stanowią niezależnej walidacji klinicznej.

## Minimalny formularz i materiał

Domyślne **„Oblicz ze stężeń”** wymaga tylko dwóch wartości: **białko całkowite w moczu**, domyślnie mg/L, i **kreatynina w moczu**, domyślnie mg/dL. Białko dopuszcza mg/L, mg/dL i g/L; kreatynina mg/dL, mg/L, mmol/L i µmol/L. Alternatywne **„Gotowy wynik B/Cr”** wymaga jednej wartości w mg/mg, mg/g lub mg/mmol. Wynik, norma i kanoniczna seria mają zawsze **mg/mg**.

Wiek i płeć pochodzą z istniejących danych pacjenta i służą tylko doborowi porównania. Ich brak nie blokuje poprawnej liczby. Nie dodaje się pól czasu, objętości, masy, wzrostu, BSA, surowicy, choroby, wyboru źródła, IFCC ani stabilności czynności nerek. Gotowość formularza wynosi 2/2 albo 1/1; brak normy nie tworzy kolejnego pytania do „pełnej interpretacji”.

Wspólna wymieszana DZM jest opisanym założeniem, bez obowiązkowego checkboxa. Znane różne próbki białka i kreatyniny blokują obliczenie ze stężeń. Niezależny gotowy iloraz pozostaje dostępny, ale sprzeczny fakt o stężeniach nie znika po zmianie trybu, zapisie lub edycji. Znany problem zbiórki pozostawia liczbę, a wstrzymuje automatyczną ocenę w obu trybach.

W ilorazie stężeń czas i objętość się skracają. **Nie skaluje się B/Cr przez `24/czas`** i nie wyraża go w mg/24 h. Sam nieznany czas albo znany dodatni czas różny od 24 h nie zmienia liczby ani nie tworzy potwierdzenia prawidłowej zbiórki. Zachowuje się znane fakty bez dopisywania historycznych 24 h i bez przejmowania zegara innego obliczenia.

## Wzór, jednostki i historyczne wejście

`B/Cr [mg/mg] = U_białko [mg/L] / U_kreatynina [mg/L]`

Kreatynina: **113,12 mg/mmol**, [PubChem CID 588, Molecular Weight](https://pubchem.ncbi.nlm.nih.gov/compound/588), odczyt 03.11.2026. To zadeklarowane kliniczne przybliżenie masy molowej. Dokładna arytmetyka oznacza dokładne działania na tej stałej i wejściach dziesiętnych, a nie nieograniczoną dokładność oznaczenia.

| Wejście | Przeliczenie |
| --- | --- |
| Białko lub kreatynina w mg/dL | ×10 do mg/L |
| Białko w g/L | ×1000 do mg/L |
| Kreatynina w mmol/L | ×113,12 do mg/L |
| Kreatynina w µmol/L | ×0,11312 do mg/L |
| Gotowy stosunek mg/g | ÷1000 do mg/mg |
| Gotowy stosunek mg/mmol | ÷113,12 do mg/mg |

Nie istnieje jedna masa molowa „białka całkowitego”; **nie oferuje się mmol/L białka ani mmol/mmol B/Cr**.

Stare pole **`U_Prot` oznacza masę białka całej zbiórki w mg**, `Ucr` — stężenie mg/dL, a `V24` — objętość mL. Dawny wzór `U_Prot / (Ucr × V24 / 100)` jest zgodny wymiarowo. Nie wolno przemianować `U_Prot` na mg/L ani pominąć objętości przy interpretowaniu tych danych. Przykład: 450 mg białka w 1500 mL i kreatynina 100 mg/dL dają **0,3 mg/mg**. W nowym formularzu odpowiadają temu białko **300 mg/L** i kreatynina **100 mg/dL**.

Przy świadomej edycji starego zapisu można wyprowadzić stężenie `U_Prot ×1000/V24` tylko z poprawnych, zachowanych danych masy i objętości, z zachowaniem ich pochodzenia. Brakującej objętości, utraconej precyzji lub normy nie odtwarza się przez zgadywanie. Zwykły odczyt starego wyniku nie uruchamia takiej konwersji ani nowej oceny.

## Wersjonowany profil i źródła

Dane **`BCR_DZM_2026_11`** znajdują się w `clcr_protein_creatinine_data.js` i są argumentem `VildaClcrProteinCreatinine.evaluate(input, profile)`. Profil określa wersję polityki aplikacji, a nie rok jednego badania. Dobór jest stały: ARUP dla wieku 7–<18 lat z właściwą płcią, KDIGO od 18 lat bez wymogu płci. Nie wybiera się źródła według korzystniejszego wyniku. Wynik i migawka niosą źródło, jego typ, populację, granice, nierówność i ograniczenia.

### Dzieci 7–17 lat: górna granica zakresu ARUP

Pełny [katalog ARUP **Protein, Total, Urine, 0020479**](https://ltd.aruplab.com/Tests/Pub/0020479), odczyt **03.11.2026**: **Specimen Required → Collect/Specimen Preparation**, **Methodology**, **Reference Interval → Urine Total Protein/Creatinine Ratio**, **Interpretive Data** oraz **Interface Map**. Komponent wyniku **0020722**, LOINC **13801-6**, nie jest osobnym badaniem zamawianym. Materiał: **24-hour urine with no additive; also acceptable: random urine**; metoda: **Quantitative Spectrophotometry**. Katalog nie ogranicza tabeli ilorazu do próbki losowej. Oficjalne [Normal](https://ltd.aruplab.com/api/ltd/examplereport?report=0020479%2C%20Normal.pdf) i [Abnormal Report](https://ltd.aruplab.com/api/ltd/examplereport?report=0020479%2C%20Abnormal.pdf), druk 23.04.2025, dodatkowo pokazują iloraz i zakres przy zbiórce 24 h; nie są odrębną pediatryczną walidacją.

| Wiek | Chłopcy: źródło mg/g | Dziewczynki: źródło mg/g | Chłopcy: pełny zakres mg/mg | Dziewczynki: pełny zakres mg/mg |
| --- | --- | --- | --- | --- |
| 7–<10 lat | 61–220 | 70–548 | 0,061–0,220 | 0,070–0,548 |
| 10–<13 lat | 59–220 | 57–334 | 0,059–0,220 | 0,057–0,334 |
| 13–<16 lat | 41–371 | 33–307 | 0,041–0,371 | 0,033–0,307 |
| 16–<18 lat | 31–242 | 36–329 | 0,031–0,242 | 0,036–0,329 |

Przeliczenie mg/g ÷1000 jest dokładne. Źródłowe grupy ukończonych lat 7–9, 10–12, 13–15 i 16–17 mapuje się na półotwarte `[7,10)`, `[10,13)`, `[13,16)`, `[16,18)`, bez interpolacji lub zaokrąglania wieku w górę. **Górny koniec jest włączony** — to jawna konwencja aplikacji dla drukowanego zakresu z łącznikiem, nie dosłowny operator podany przez ARUP.

Główna karta używa wyłącznie **górnej granicy**: dodatni wynik ≤ tej granicy ma status **„B/Cr niepodwyższony”**, a > granicy **„Podwyższony B/Cr”**. Dolna granica pozostaje w pełnym źródłowym przedziale w danych i Szczegółach, lecz nie tworzy klinicznego alarmu „niski B/Cr”, niedoboru białka ani zalecenia zwiększenia jego podaży. Dokładne zero podlega odrębnej neutralnej regule.

To nazwane **odniesienie laboratoryjne**, nie uniwersalny próg rozpoznania choroby i nie zakres laboratorium wykonującego badanie pacjenta. Katalog nie ujawnia kohorty wyprowadzenia aktualnej tabeli, metody estymacji percentyli ani daty jej wersji; nie potwierdza też, że pierwotna kohorta składała się wyłącznie ze zbiórek dobowych. Obecnych liczb nie przypisuje się bezpośrednio publikacji Slev 2010, która podaje inne wartości dla losowego moczu. ARUP ostrzega o zaniżaniu białka wolnych łańcuchów lekkich przez metodę; niepodwyższony iloraz nie wyklucza takiej nieprawidłowości.

### Dorośli: kliniczne porównanie KDIGO

Levey AS, Eckardt KU, Dorman NM i wsp. **Nomenclature for Kidney Function and Disease: Executive Summary and Glossary from a Kidney Disease: Improving Global Outcomes (KDIGO) Consensus Conference.** *Am J Nephrol* **2020;51(7):579–587**, [DOI 10.1159/000509414](https://doi.org/10.1159/000509414), [pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC7446301/), **Tabela 2, „Albuminuria and proteinuria” / „Albuminuria and proteinuria categories”**, odczyt 03.11.2026. Wiersz PCR jawnie obejmuje **timed urine collection or spot urine collection**. Kategorie opisują ilość białkomoczu niezależnie od obecności choroby nerek.

| Kategoria | Źródłowe mg/g | Kanoniczne mg/mg |
| --- | --- | --- |
| Prawidłowy lub łagodnie zwiększony | <150 | **<0,15** |
| Umiarkowanie zwiększony | 150–500 | **0,15–0,5** |
| Znacznie zwiększony | >500 | **>0,5** |

Dokładnie **0,15** należy do kategorii umiarkowanej, dokładnie **0,5** nadal do umiarkowanej. Brak dolnej patologicznej granicy. Wiek **≥18 lat** jest polityką populacji aplikacji; tabela konsensusu sama nie drukuje takiego progu wieku, a tekst wskazuje potrzebę dalszego uszczegółowienia dla dzieci. To kliniczne kategorie, **nie zdrowy przedział referencyjny wieku i płci**. Nie stosuje się do B/Cr odznak A1–A3 ani automatycznego rozpoznania PChN, zespołu nerczycowego lub remisji.

Główna etykieta brzmi **„Zakres wg KDIGO”**, `<0,15 mg/mg`; status poniżej granicy: **„Prawidłowy lub łagodnie zwiększony B/Cr”**. Pełne trzy kategorie są w Szczegółach. Wcześniejsza propozycja dorosłego `<0,2 mg/mg` z katalogu UW nie jest przyjętym profilem: zakres **0,15–<0,2** w obecnej polityce należy już do kategorii umiarkowanie zwiększonej. Nie zmienia to historycznej oceny zwykłym odczytem.

Próg masowy 150 mg/g jest kanoniczny. Przy stałej kreatyniny 113,12 odpowiada dokładnie **16,968 mg/mmol**, nie 15 mg/mmol. Nie stosuje się równolegle pragmatycznie zaokrąglonej granicy SI z tabel wytycznych, bo zmiana jednostki zmieniałaby ocenę tej samej próbki.

Pełne **KDIGO 2021 Glomerular Diseases**, [oficjalny PDF z aktualizacją LN 2024](https://kdigo.org/wp-content/uploads/2017/02/KDIGO-2021-Glomerular-Diseases-Guideline_English_LN-2024-Update.pdf), s. **S16**, **S90–S92, §1.2, Practice Points 1.2.1, 1.2.2 i 1.2.5**, odczyt 03.11.2026, dodatkowo potwierdza kategorie i użycie ilorazu w aliquocie zamierzonej zbiórki 12–24 h. Zależność ilorazu od masy dobowej jest przybliżona i zależy od wydalania kreatyniny; **B/Cr nie jest dobową masą białka**.

### Brak profilu i normy niewdrożone

Brak wiarygodnego wieku, **wiek <7 lat** lub brak wymaganej płci w wieku 7–<18 lat pozostawiają neutralną liczbę z konkretną przyczyną braku porównania. Nie stosuje się normy dorosłych, najbliższej grupy ani szerszej kolumny płci. Sformułowanie **„Brak przyjętej normy dla DZM w tym wieku”** opisuje zakres aplikacji, a nie brak wszystkich publikacji medycznych.

- Pediatrycznych `<0,2 mg/mg` i niemowlęcych `<0,5 mg/mg` nie przenosi się automatycznie z pierwszej porannej próbki do DZM. **KDIGO 2012 CKD**, *Kidney Int Suppl* 2013;3:1–150, [pełny PDF](https://kdigo.org/wp-content/uploads/2017/02/KDIGO_2012_CKD_GL.pdf), s. 31–32, oraz **KDIGO 2024 CKD**, *Kidney Int* 2024;105(Suppl 4S):S117–S314, [pełny PDF](https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf), **S192–S193, Practice Point 1.3.1.4 i Pediatric considerations**, odczyt 03.11.2026, rozróżniają poranny PCR od ilości dobowej w mg/m²/dobę. Kryterium remisji zespołu nerczycowego także nie jest ogólną normą zdrowej populacji DZM.
- **Ding L, Ding Y, Xu S i wsp.** *Reference ranges for 24-h urinary protein/creatinine ratio and urinary microalbumin/creatinine ratio in Chinese children.* *Pediatr Nephrol* **2025;40:2311–2318**, [DOI 10.1007/s00467-025-06681-w](https://doi.org/10.1007/s00467-025-06681-w). Pełny tekst dostarczony przez właściciela odczytano; nie jest źródłem niedostępnym. Badanie zawiera rzeczywiste normy 24hUPCR dla 200 dzieci 2–<15 lat z jednego chińskiego ośrodka. **Tabela 4 i Rycina 1, s. 2314**, pozostawiają niewyjaśnioną rozbieżność: granica określona jako P95 **43,04 mg/mmol** dla dziewczynek 2–<6 lat przekracza wszystkie widoczne obserwacje wykresu (<40). Metody nie wyjaśniają tego modelowaniem lub przycięciem danych. Bez danych surowych nie rozstrzyga się, czy problem dotyczy tabeli, wykresu lub opisu; nie poprawia się liczb samodzielnie. **Automatyczne normy z tej pracy są wstrzymane do wyjaśnienia**, także pozostałe trzy podgrupy. ACR w tej pracy dotyczy porannego moczu i nie zmienia norm ACR aplikacji. PDF nie jest kopiowany do publicznego repozytorium.

### Dlaczego zakresy zależą od płci

Mniejsze wydalanie kreatyniny może zwiększać iloraz przy tej samej ilości białka. **KDIGO 2024, Tabela 16, S191** opisuje wpływ płci na kreatyninę i ACR/PCR. Wsparciem pediatrycznym mechanizmu jest Skinner AM, Addison GM, Price DA, *Eur J Pediatr* **1996;155:596–602**, [DOI 10.1007/BF01957912](https://doi.org/10.1007/BF01957912), [PMID 8831085](https://pubmed.ncbi.nlm.nih.gov/8831085/): publiczny abstrakt 528 zdrowych dzieci 4–16 lat z nocną zbiórką opisuje większe wydalanie kreatyniny u chłopców w związku z masą mięśniową. Pełnego tekstu Skinner nie użyto do ustalania norm.

To mechanizm możliwej różnicy, nie wyjaśnienie wszystkich konkretnych granic ARUP. **Dla 13–15 lat górna granica jest wyższa u chłopców (0,371) niż dziewczynek (0,307 mg/mg)**; nie twierdzi się, że u dziewczynek jest zawsze większa. Nie oznacza to większej dopuszczalnej utraty białka w mg/dobę. Nieznanej dokumentacji wyprowadzenia obecnych norm nie zastępuje się domniemanym wpływem hormonów, mięśni lub dojrzewania; nie dodaje się związanych z nimi pytań.

## Walidacja, precyzja i jeden wynik

Każdy operand jest sprawdzany oddzielnie: białko i gotowy stosunek **≥0**, kreatynina **>0**. Puste pole nie jest zerem, dwa ujemne stężenia nie dają poprawnego dodatniego wyniku. Walidacja obowiązuje także w edycji i zapisie. Nie przenosi się arbitralnych sufitów dawnego formularza do nowych jednostek.

Porównanie z granicami odbywa się przed zaokrągleniem, w dokładnej arytmetyce wejść dziesiętnych i zadeklarowanych stałych, bez epsilonu przesuwającego granicę. **≈** oznacza skrót prezentacji; pełny zapis oraz dokładny ułamek pozostają w Szczegółach i migawce. Mała dodatnia wartość nie staje się pokazanym ani zapisanym zerem. Przepełnienie pośredniej konwersji nie niszczy skończonego ilorazu; nieprzedstawialny dodatni underflow/overflow nie tworzy zapisywalnego zera lub nieskończoności.

Dokładne zero pozostaje neutralną liczbą z komentarzem **„Sprawdź, czy laboratorium podało zero, czy wynik poniżej granicy oznaczalności.”** Dostępna norma nadal jest widoczna. Gotowe `<`, `≤`, `>` i `≥` pozostają neutralne z zachowanym operatorem i bez fikcyjnego dokładnego punktu na wykresie. `<0` jest niepoprawne dla nieujemnego ilorazu; `≤0` jest neutralne.

Jedna karta B łączy liczbę pacjenta z normą w mg/mg. U dzieci: **„Górna granica normy”**, dopisek **„Dla wieku i płci”** i `≤` właściwej granicy. Niepodwyższony wynik jest turkusowy, podwyższony bursztynowy, brak oceny neutralny; liczba normy i jej jednostka pozostają neutralne. W Szczegółach: **„Źródło zakresu przyjętego w aplikacji: ARUP”**, pełna tabela w mg/mg, z wyróżnieniem tylko właściwej komórki wieku i płci. Główna karta nie mówi „w zakresie tego laboratorium” ani nie sugeruje, że próbkę oznaczono w ARUP.

Oś ma stały dla profilu zakres techniczny 0–2×górna granica, z granicą w połowie. Zero osi nie jest źródłową dolną normą; punkt poza osią jest oznaczony kierunkiem. Pod pediatryczną osią podpis brzmi **„Górna granica normy: … mg/mg.”**, pasmo **„do granicy”**. Nie umieszcza się tam podpisu „B/Cr niepodwyższony” pod wysokim wynikiem. Krótki komentarz podwyższenia: **„Podwyższenie może towarzyszyć chorobom nerek, ale bywa też przejściowe, np. podczas infekcji lub po wysiłku.”**

Stałe szerokości, wyrównanie i odstępy obowiązują przy zmianie trybu, jednostki, danych pacjenta, błędzie i długiej liczbie. Mobilne pola mają ≥16 px tekstu i ≥48 px wysokości, pod czyszczeniem pozostaje ≥20 px. Szczegóły są domyślnie zwinięte.

## Zapis, historia i edycja

Moduły danych, silnika, UI i adaptera zapisu są rozdzielone w `clcr_protein_creatinine*.js`. Migawka **`clcr-protein-creatinine` v1**, `proteinCreatinineSnapshot`, utrwala materiał, tryb, oryginalne wejścia i jednostki, operator, dokładną wartość i ułamek, prezentację, fakty o próbce, użyty wiek/płeć, pełny zakres źródłowy i używaną górną granicę, nierówności, źródło/wersję, populację, ograniczenia i ocenę.

Zwykły **READ** Badań, Notatek, raportu i historii używa utrwalonej oceny; nie wywołuje dzisiejszego silnika ani norm według dzisiejszego wieku. Stary brak normy nie otrzymuje nowej referencji ARUP/KDIGO, a techniczne `outOfRange:false` nie staje się „W zakresie”. Brak oceny pozostaje `outOfRange:null`. Wiarygodna zachowana pełna wartość pozostaje pełna; precyzji utraconej do zera nie rekonstruuje się.

Dopiero świadome nowe obliczenie albo **EDIT** używa aktualnej zaakceptowanej polityki, zachowując kontekst pomiaru, znaczenie dawnych danych i ID. Edycja i usunięcie dotyczą jednego kanonicznego rekordu; zmiana jednostki nie tworzy kolejnego badania. Seria `clcr:B_Cr` nie łączy się z punktowym PCR. Wynik z nierównością nie jest dokładnym punktem trendu. Zapis wymaga wcześniej zapisanej, wybranej karty pacjenta i powiązania z wizytą. Czytelna Notatka nie zawiera surowego technicznego JSON.

## Syntetyczny kontrakt regresji

Przypadki wywołują rzeczywiste funkcje produkcyjne. Poniższa tabela jest kontraktem, **nie deklaracją zakończonych testów**; wykonania, końcowy SHA i PR dokumentuje raport przekazania.

| Wejście / stan | Oczekiwany wynik |
| --- | --- |
| Białko 300 mg/L / kreatynina 100 mg/dL | 0,3 mg/mg; dorosły: umiarkowanie zwiększony; dziewczynka 10 lat: niepodwyższony względem ≤0,334. |
| Białko 30 mg/dL albo 0,3 g/L / Cr 1000 mg/L | To samo 0,3 mg/mg. |
| Białko 113,12 mg/L / Cr 1 mmol/L albo 1000 µmol/L | Dokładnie 1 mg/mg. |
| Gotowe 300 mg/g albo 33,936 mg/mmol | Dokładnie 0,3 mg/mg; ta sama ocena co ze stężeń. |
| Dziewczynka 10 lat: 0,334 / 0,33400000000000001 mg/mg | Górna granica włączona / podwyższony, mimo skrótu wyświetlania. |
| Chłopiec 13 lat: 0,371; dziewczynka 13 lat: 0,371 mg/mg | Niepodwyższony / podwyższony; profile nie są zamieniane. |
| Dziecko 7 lat: mały dodatni wynik poniżej dolnej granicy ARUP | Niepodwyższony, bez alarmu „niski B/Cr” lub niedoboru białka. |
| Dorosły: 0,14999999999999999 / 0,15 / 0,5 / 0,50000000000000001 mg/mg | Prawidłowy lub łagodnie zwiększony / umiarkowanie zwiększony / umiarkowanie zwiększony / znacznie zwiększony. |
| Dorosły: gotowe 16,968 mg/mmol | Dokładnie 0,15 mg/mg, umiarkowanie zwiększony. |
| Wiek 6,999 / brak wieku / brak płci w 10 lat | Liczba bez przyjętej normy; brak oceny nie blokuje zapisu poprawnego wyniku. |
| Dorosły bez płci | Zakres KDIGO dostępny. |
| Białko 0 / Cr 100 mg/dL | Dokładne 0 z neutralną oceną i uwagą o oznaczalności. |
| Białko 0,00001 mg/L / Cr 100 mg/dL | Dodatnie 0,00000001 mg/mg także w zapisie, historii i Notatce. |
| Ujemne białko, ujemna Cr, oba ujemne lub Cr 0 | Błąd, bez dodatniego wyniku lub zapisu. |
| Gotowe <0 / ≤0 / <0,15 mg/mg | Błąd / neutralny operator / neutralny operator; brak dokładnego punktu trendu. |
| Znane różne próbki → gotowy raport → edycja stężeń | Niezależny raport dostępny; znany fakt zachowany, stężenia nadal zablokowane. |
| Znany problem zbiórki | Poprawna liczba, bez automatycznej oceny normy w obu trybach. |
| Dawne U_Prot 450 mg, V24 1500 mL, Ucr 100 mg/dL | READ zachowuje dawny zapis; jawna edycja z poprawnymi danymi odtwarza równoważne 0,3, nie 0,45. |
| Odczyt po zmianie wieku, tabeli lub silnika / edycja | Zamrożona ocena / nowa świadoma ocena przy tym samym ID. |

Regresje obejmują wszystkie grupy wieku/płci i obie strony granic, konwersje, operatory, zero i małe liczby, underflow/overflow, walidację migawek, starsze masowe wejścia, save/edit/read, Notatki/Badania/raport, przejścia pacjenta i sesji, geometrię desktop/mobile oraz rzeczywistą instalację i aktualizację PWA offline. Źródła liczbowe są transkrypcją opublikowanych faktów; pełne publikacje i prywatne materiały audytu nie są częścią artefaktu wdrożeniowego. Ponowny przegląd przy zmianie katalogu ARUP, wytycznych KDIGO, wyjaśnieniu rozbieżności Ding lub rozszerzeniu populacji/materiału.
