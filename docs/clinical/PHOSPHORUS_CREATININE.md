# Pᵢ/Cr w DZM — stosunek fosforu do kreatyniny

Właściciel zaakceptował [makietę przed/po na komputerze i telefonie](https://vilda-picr-20261103.maciej-flader.chatgpt.site) i polecił kodowanie **03.11.2026**. Źródło makiety: `1066223a9b91ae335d5bbdaa0d5c219aa9b11e0c`. Zakres obejmuje **Pᵢ/Cr (DZM)**, formułę `PO4_Cr` i serię `clcr:PO4_Cr`. Materiałem jest ta sama wymieszana dobowa zbiórka moczu. Dobowe wydalanie fosforu, próbka jednorazowa oraz TRP/TmP/GFR pozostają odrębnymi obliczeniami.

To zmiana kliniczna: dotychczasowa liczba bez normy otrzymuje orientacyjne porównanie z nazwanym źródłem dla wybranych grup wieku i płci. Dochodzą jednostki molowe, gotowy raport, spójna walidacja oraz utrwalenie precyzji i oceny. Dotychczasowy zwykły iloraz stężeń w mg P/dL i mg kreatyniny/dL był poprawny wymiarowo. Akceptacja i testy nie stanowią niezależnej walidacji klinicznej.

## Minimalne dane i materiał

Domyślne **„Oblicz ze stężeń”** wymaga tylko **fosforu nieorganicznego, następnie kreatyniny w moczu**, z jednostkami. Oba pola domyślnie mają mmol/L. Fosfor: mmol/L, µmol/L, **mg P/L**, **mg P/dL**; kreatynina: mmol/L, µmol/L, mg/L, mg/dL. Alternatywne **„Gotowy wynik Pᵢ/Cr”** wymaga jednego stosunku w mg/mg, mg/g albo mmol/mmol. Historyczne aliasy g/g i mol/mol zachowują znaczenie, bez dodatkowych pozycji w nowej liście.

Główny wynik i jego norma mają zawsze tę samą jednostkę: **mg P/mg kreatyniny**, skrót **mg/mg**. Przeliczenie molowe w Szczegółach nie jest drugim pomiarem. Wiek i płeć pochodzą z istniejących danych pacjenta i służą wyłącznie doborowi normy. Brak normy nie blokuje liczby. Nie dodaje się pytań o czas, objętość, masę, wzrost, powierzchnię ciała, krew, chorobę, AKI, IFCC lub dawkę leku.

Oba stężenia pochodzą z tej samej wymieszanej zbiórki: formularz pokazuje to założenie bez obowiązkowego checkboxa. Znane różne próbki blokują obliczenie ze stężeń. Niezależny gotowy raport pozostaje dostępny; przeciwna informacja o stężeniach nie znika po zmianie trybu, zapisie lub edycji.

Wspólne czynniki czasu i objętości skracają się w ilorazie. **Nie mnoży się Pᵢ/Cr przez `24/czas`** ani nie wyraża go w mg/24 h. Sam nieznany czas lub znany dodatni czas różny od 24 h nie blokuje liczby ani porównania z przyjętym profilem. Jest to jawna polityka aplikacji, nie dowód kompletności każdej zbiórki. Znany problem zbiórki pozostawia poprawną liczbę, ale wstrzymuje automatyczną ocenę w obu trybach. Znany czas zachowuje się bez dopisywania potwierdzonych 24 h; nie pożycza się zegara ani innych wartości z innego kalkulatora.

## Wzór i jednostki

`R_mass = U_P [mg P/L] / U_Cr [mg/L]`

`R_mass = R_molar × 30,973761998 / 113,12`

Fosfor: **30,973761998 mg P/mmol**, [CIAAW, rewizja masy atomowej 2013](https://ciaaw.org/phosphorus.htm), pełna karta odczytana 03.11.2026. Kreatynina: **113,12 mg/mmol**, [PubChem CID 588](https://pubchem.ncbi.nlm.nih.gov/compound/588), sekcja Molecular Weight, odczyt 03.11.2026. Stała kreatyniny jest klinicznym przybliżeniem masy molowej. Dokładna arytmetyka poniżej oznacza dokładne działania na zadeklarowanych stałych, nie nieograniczoną dokładność oznaczenia laboratoryjnego.

| Wejście | Przeliczenie do skali podstawowej |
| --- | --- |
| Stężenie mg P/L lub mg Cr/L | Bez zmiany liczby |
| Stężenie mg P/dL lub mg Cr/dL | ×10 do mg/L |
| Stężenie mmol/L | × masę molową danego analitu do mg/L |
| Stężenie µmol/L | × masę molową danego analitu /1000 do mg/L |
| Gotowy stosunek mg/g | ÷1000 do mg/mg |
| Gotowy stosunek mmol/mmol | ×30,973761998/113,12 do mg/mg |

**mg P oznacza masę pierwiastkowego fosforu, nie całego jonu PO₄.** Nie wolno użyć około 94,97 mg/mmol do przeliczenia rutynowego wyniku mg P. Jeden mol fosforanu zawiera jeden mol P, zatem ich ilości molowe są zgodne. mg/mg i mmol/mmol nie są tą samą liczbą: 1 mmol/mmol daje około **0,273813313277935 mg/mg**.

Historyczne `U_PO4` ma znaczenie **mg P/dL**, a `Ucr` **mg/dL**. Odczyt ani jawna edycja nie mogą potraktować tych pól jako nowych domyślnych mmol/L. Zwykłe 50 mg P/dL /100 mg Cr/dL nadal wynosi **0,5 mg/mg**; nie występuje brakujący mnożnik czasu lub objętości.

## Normy, populacje i ograniczenia źródeł

Osobne wersjonowane dane **`PICR_DZM_2026_11`** są argumentem silnika `VildaClcrPhosphorusCreatinine.evaluate(input, profile)`. Nazwa profilu określa wersję polityki aplikacji, a nie datę publikacji jednego badania. Pierwszeństwo ma ARUP dla 7–<18 lat, następnie Mayo dla mężczyzn od 18 lat. Nie wybiera się źródła według korzystniejszej oceny wyniku.

### Dzieci i młodzież 7–17 lat: ARUP

Pełny [katalog ARUP „Phosphorus, Urine”, 0020478](https://ltd.aruplab.com/Tests/Pub/0020478), odczyt **03.11.2026**: sekcje **Specimen Required, Methodology, Reference Interval, Interpretive Data**. Składnik stosunku: **0020583**, LOINC **13795-0**. Preferowany materiał to wymieszana zbiórka 24 h; katalog dopuszcza też mocz losowy. Metoda: ilościowa spektrofotometria. To bezpośrednie źródło dla DZM, nie przeniesienie normy z samej próbki porannej.

| Ukończone lata | Chłopcy: źródło mg/g | Dziewczynki: źródło mg/g | Chłopcy: wynik mg/mg | Dziewczynki: wynik mg/mg |
| --- | --- | --- | --- | --- |
| 7–9 | 165–1682 | 153–1443 | 0,165–1,682 | 0,153–1,443 |
| 10–12 | 144–1234 | 142–1321 | 0,144–1,234 | 0,142–1,321 |
| 13–15 | 101–1134 | 81–930 | 0,101–1,134 | 0,081–0,930 |
| 16–17 | 68–874 | 58–846 | 0,068–0,874 | 0,058–0,846 |

Źródłowe mg/g dzieli się **dokładnie przez 1000**. Przedziały ukończonych lat mapuje się na `[7,10)`, `[10,13)`, `[13,16)`, `[16,18)`, bez interpolacji i zaokrąglania wieku w górę. Oba liczbowe końce normy są włączone. Mapowanie wieku i włączenie końców są **jawnymi konwencjami aplikacji**; drukowana tabela źródłowa podaje zakresy z łącznikiem, bez osobnych operatorów nierówności.

Katalog nie podaje kohorty wyprowadzenia norm, metody percentylowej, daty wersji tabeli ani odrębnego profilu wcześniaczego. „W zakresie laboratoryjnym” oznacza zgodność z tą tabelą, nie rozpoznanie zdrowia lub skuteczności leczenia. Brak znanej płci nie tworzy wspólnego przedziału z minimum i maksimum obu kolumn. Interpretive Data dopuszcza użyteczność stosunku przy odstępstwach czasu/objętości; nie oznacza to potwierdzenia kompletności zbiórki.

### Dorośli mężczyźni: Mayo SUP24

Aktualny [katalog Mayo SUP24](https://www.mayocliniclabs.com/test-catalog/Overview/616180), odczyt **03.11.2026**, odsyła przez **Normal Reports** do pełnego, siedmiostronicowego [raportu przykładowego z 25.03.2026](https://www.mayocliniclabs.com/-/media/it-mmfiles/test%20notifications/2/9/4/616180-sample.pdf):

- **S. 2, Normalized Values:** phosphorus/creatinine **<0,75 mg/mg**, wartości odniesienia oparte na literaturze.
- **S. 4:** historia wartości z opisem zakresu referencyjnego dla mężczyzny w wieku 18 lat.
- **S. 5, General Comments — Adult Male Patients, Normalized Values, Reference Range 95%:** normalizacja dotyczy moczu z 24 h; P/Cr **<0,75 mg/mg**.

Profil stosuje się orientacyjnie do **mężczyzn ≥18 lat**, z górną granicą **ściśle wyłączoną**. Dokładnie 0,75 jest poza zakresem. Źródło **nie podaje dolnej granicy**: nie tworzy się normy „0–0,75” ani rozpoznania „obniżony Pᵢ/Cr” na podstawie samej tej normy. Granica osi zaczynającej się technicznie od zera nie może zostać przedstawiona jako źródłowa dolna norma.

Nie zweryfikowano niezależnie pierwotnej kohorty wyprowadzenia tego stosunku. Przypis o 48 mężczyznach i 52 kobietach dotyczy innych statystyk raportu i nie jest dowodem wielkości kohorty P/Cr. [Pełny starszy raport męski z 4.05.2023](https://news.mayocliniclabs.com/n1/96e99366cea7b0de/uploads/2023/06/Supersaturation-Sample-Report.pdf), s. 2 i 6, potwierdza tę samą granicę, ale podstawą wdrożenia jest aktualnie podlinkowany raport 2026.

### Grupy bez automatycznie skonfigurowanej normy

Brak wiarygodnego wieku, brak wymaganej płci, **wiek <7 lat** lub **dorosła kobieta** pozostawiają liczbę z neutralną informacją o braku odpowiedniego zweryfikowanego profilu. Nie stosuje się zastępczo normy dorosłego mężczyzny lub najbliższej grupy wieku. Brak normy w aplikacji nie jest twierdzeniem, że normy nie istnieją w literaturze.

- **Dorosłe kobiety:** historyczny oficjalny [raport Mayo z 14.07.2023](https://www.mayocliniclabs.com/-/media/it-mmfiles/test%20notifications/2/3/e/616180-sample.pdf) zawiera w indeksowanej s. 5/6 tabelę dla dorosłych kobiet i tę samą granicę <0,75 mg/mg. Pełny plik zwracał 404 podczas audytu; nie zaliczono go do źródeł odczytanych w całości. Ograniczenie wdrożenia wynika z dostępu do pełnego źródła, nie z dowodu odmiennej normy kobiet.
- **Młodsze dzieci:** Taranta-Janusz i wsp., *Acta Paediatr* 2017;106:1170–1175, [DOI 10.1111/apa.13856](https://doi.org/10.1111/apa.13856), [PMID 28370428](https://pubmed.ncbi.nlm.nih.gov/28370428/), opisują prawdziwą DZM u **3913 zdrowych dzieci 2–18 lat**, w tym P/Cr. Nie zweryfikowano dokładnych tabel i współczynników z [suplementu S1–S5](https://onlinelibrary.wiley.com/action/downloadSupplement?doi=10.1111%2Fapa.13856&file=apa13856-sup-0002-TableS1-S5.docx), niedostępnego podczas audytu (403). Median/IQR S2 i modelowanych percentyli S5 nie odtwarza się z abstraktu.

Nie przenosi się do DZM zakresów próbki losowej z [Newcastle NHS](https://laboratories.newcastle-hospitals.nhs.uk/test-directory/phosphate-urine/), drugiej porannej mikcji z [Matos 1997](https://pubmed.ncbi.nlm.nih.gov/9290612/), porannej próbki z [Canterbury](https://www.chl.co.nz/test/phosphate-creatinine-ratio-urine/) ani populacji moczu spontanicznego [Pott/HARP](https://academic.oup.com/jcem/article/109/3/668/7320373) lub dziennego badania [HARA 2026](https://academic.oup.com/ckj/article/19/6/sfag147/8673153). Nie dzieli się niezależnych norm dobowego wydalania fosforu i kreatyniny, aby wytworzyć normę ilorazu.

## Przytarczyce, XLH i burosumab

Bez selektora choroby. Główna karta zawiera krótkie wyjaśnienie konkretnego wyniku. Kontekst diety, leczenia i przydatności TmP/GFR należy do zwiniętych Szczegółów, zgodnie z zaakceptowaną makietą:

- PTH wpływa na wydalanie fosforanów. Sam Pᵢ/Cr nie rozpoznaje nadczynności ani niedoczynności przytarczyc; interpretacja wymaga m.in. wapnia, fosforanów i PTH we krwi.
- Wynik w zakresie zdrowej populacji nie potwierdza właściwej reabsorpcji fosforanów podczas hipofosfatemii. Ocena nerkowej utraty korzysta z powiązanych badań moczu i krwi, TRP/TmP/GFR oraz kontekstu pacjenta.
- Pᵢ/Cr DZM nie wystarcza do oceny skuteczności burosumabu. Odpowiedź obejmuje m.in. fosforany w surowicy na czczo, TmP/GFR i zmiany kliniczne, z uwzględnieniem czasu pobrania względem dawki. Spadek stosunku nie staje się automatycznie sukcesem, wzrost niepowodzeniem. Nie powstaje algorytm dawkowania, rozpoznania lub kwalifikacji operacyjnej.

**„Otwórz TmP/GFR”** oraz przejście do dobowego wydalania fosforu zachowują pacjenta, ale są nawigacją. Nie przenoszą automatycznie wymieszanej DZM do protokołu porannej próbki na czczo ani nie łączą jej z niepowiązaną próbką krwi.

Pełne źródła kontekstu odczytano **03.11.2026**:

| Źródło i wersja | Sprawdzone miejsce i znaczenie dla Pᵢ/Cr |
| --- | --- |
| [Crysvita, polska ChPL EMA](https://www.ema.europa.eu/pl/documents/product-information/crysvita-epar-product-information_pl.pdf), aktualny dokument przy [EPAR](https://www.ema.europa.eu/en/medicines/human/EPAR/crysvita) z aktualizacją 10.06.2026 | §4.1–4.5, szczególnie §4.2 i §4.4, PDF s. 3–11. Monitorowanie fosforanów w surowicy na czczo uwzględnia wiek i cykl dawkowania. §4.4 sugeruje kontrolę wapnia i fosforanów w moczu co 3 miesiące; nie narzuca DZM ani progu Pᵢ/Cr skuteczności leczenia. |
| Ali i wsp., IWG XLH u dzieci 2025, *JCEM* 110:2055–2070, [DOI 10.1210/clinem/dgaf093](https://doi.org/10.1210/clinem/dgaf093), [pełny PDF autorski](https://static.aeped.es/2025_IWG_Pediatric_Guidelines_final_ac106217d8.pdf) | Ocena początkowa PDF s. 3–4, kontrola s. 8, leczenie s. 9–10. Poranny mocz punktowy po 2–3 h na czczo i powiązana krew do TRP/TmP/GFR. To nie tabela norm DZM. Zalecenia monitorowania mają bardzo niską pewność dowodów; brak samodzielnego celu Pᵢ/Cr DZM. |
| Khan i wsp., IWG XLH u dorosłych 2025, *JCEM* 110:2353–2370, [DOI 10.1210/clinem/dgaf170](https://doi.org/10.1210/clinem/dgaf170), [pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC12261105/), [pełne XML Europe PMC](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12261105/fullTextXML) | Initial assessment, biochemical evaluation, Burosumab. DZM fosforu i kreatyniny występuje w szerszej ocenie dorosłych. Ocena TmP/GFR wymaga właściwie powiązanych próbek; brak progu Pᵢ/Cr DZM potwierdzającego odpowiedź na lek. |
| Haffner i wsp., XLH 2025, *Nat Rev Nephrol* 21:330–354, [DOI 10.1038/s41581-024-00926-x](https://doi.org/10.1038/s41581-024-00926-x), [pełny PDF autorski](https://xlhuk.org/wp-content/uploads/2025/01/Clinical-practice-recommendations-XLH.pdf) | Diagnosis/Table 1 PDF s. 5, follow-up/Box 4 s. 9, burosumab/Box 6 s. 11–13. Łączna ocena surowicy, TmP/GFR i kliniki. PDF autorski ma format przedpublikacyjny; wersję publikacji identyfikuje DOI. Brak celu terapeutycznego ratio DZM. |
| Bilezikian i wsp., Fifth International Workshop PHPT 2022, *JBMR* 37:2293–2314, [DOI 10.1002/jbmr.4677](https://doi.org/10.1002/jbmr.4677), [pełny PDF](https://jsbmr.umin.jp/guide/pdf/Bilezikian-2022-Evaluation-and-management-of-primar.pdf) | Summary 1.1/1.3/3.1/3.3, rozpoznanie i biochemia s. 2298–2299. Rozpoznanie opiera się na wapniu/PTH; wydalanie fosforu rzadko jest konieczne w rutynowej ocenie PHPT. Brak progu Pᵢ/Cr DZM rozpoznania lub operacji; źródło nie tworzy norm pediatrycznych. |
| Bollerslev i wsp., revised ESE HypoPT 2025, *EJE* 193:G83–G112, [DOI 10.1093/ejendo/lvaf222](https://doi.org/10.1093/ejendo/lvaf222), [pełny PDF](https://www.centrecalipso.com/wp-content/uploads/2026/02/lvaf222-2.pdf) | R.2.3–2.4 i R.4.2–4.4 z uzasadnieniem. Cele dotyczą m.in. fosforanów w surowicy i dobowego wapnia w moczu. To wytyczne dorosłych; brak osobnego celu Pᵢ/Cr DZM lub pediatrycznej normy tego stosunku. |

## Walidacja, precyzja i prezentacja

Każdy operand musi być poprawny i skończony: **P ≥0**, **Cr >0**, gotowy stosunek ≥0. Puste pole nie jest zerem, dwa ujemne stężenia nie mogą dać poprawnego dodatniego wyniku. Nie przenosi się arbitralnych sufitów starego formularza do nowych jednostek. Dodatni underflow lub overflow nie daje zapisywalnego zera lub nieskończoności; skończonego ilorazu nie niszczy przepełnienie pośredniej konwersji.

**Dokładne zero** pozostaje liczbą z neutralną uwagą o odróżnieniu od raportu poniżej oznaczalności. Nie otrzymuje automatycznej oceny niskiej lub prawidłowej; dostępna norma nadal jest widoczna. Mała dodatnia wartość nie może zostać pokazana ani zapisana jako zero.

Porównanie z normą odbywa się przed zaokrągleniem, w arytmetyce dokładnej dla wejść dziesiętnych i zadeklarowanych stałych. **≈** oznacza skrót prezentacji; pełny zapis i dokładny ułamek pozostają w Szczegółach i migawce. Przy granicy 0,75 liczba 0,74999999999999999 jest poniżej, mimo skrótu ≈0,75. Nie stosuje się epsilonu zmieniającego medyczną stronę granicy.

Gotowe raporty `<`, `≤`, `>` i `≥` zachowują znaczenie przedziału. W tej wersji wszystkie pozostają neutralne z widoczną dostępną normą, zgodnie z zaakceptowaną makietą. Nigdy nie powstaje fikcyjny dokładny punkt na wykresie. `<0` jest niemożliwym wynikiem nieujemnego stosunku; `≤0` pozostaje neutralne. Ewentualna przyszła ocena nierówności wymagałaby jednoznacznego wniosku dla wszystkich wartości dopuszczalnych przez operator, a nie porównania samej liczby granicznej.

Jedna karta B łączy **Wynik pacjenta** z **Normą dla wieku**, w tej samej jednostce i na wspólnej wysokości. Nazwane źródło i grupa są dostępne w Szczegółach. Norma, jej liczby i jednostka pozostają neutralne; odchylenia mają bursztynowe wyróżnienie. Brak profilu ma konkretny powód, `assessment/status: unassessed` i `outOfRange:null`, bez pozornego „W zakresie”. Źródło z samą górną granicą nie otrzymuje sztucznej dolnej normy.

Stałe szerokości, wyrównanie i symetria obowiązują przy zmianie trybu, jednostek, błędach i długich liczbach. Pola mobilne mają co najmniej 16 px tekstu i 48 px wysokości; pod czyszczeniem pozostaje co najmniej 20 px odstępu. Szczegóły pokazują wszystkie przedziały wieku w tej samej jednostce mg/mg co wynik.

## Utrwalenie i odczyt historyczny

Silnik, dane, UI i adapter zapisu są rozdzielone w modułach `clcr_phosphorus_creatinine*.js`. Migawka **`clcr-phosphorus-creatinine` v1**, pole `phosphorusCreatinineSnapshot`, utrwala formułę, materiał, tryb, tekst wejściowy i jednostki, podstawę masową P, operator, dokładną wartość/ułamek, prezentację, fakty o próbce, użyty wiek/płeć, normę z włączeniem granic, źródło/wersję i ocenę.

Zwykły **READ** Badań, Notatek, historii i raportu nie wywołuje dzisiejszego silnika ani nie dobiera normy według dzisiejszego wieku. Zachowuje użyty wynik i ocenę. Stare wpisy bez normy nie zyskują nowego zakresu ARUP/Mayo i nie stają się „W zakresie” z powodu dawnego technicznego `outOfRange:false`. Istniejącą wiarygodną pełną wartość można zachować; utraconej precyzji nie odtwarza się z samego zapisanego zera.

Dopiero jawne nowe obliczenie lub **EDIT** korzysta z aktualnej zatwierdzonej polityki, z zachowaniem kontekstu pomiaru i znaczenia dawnych jednostek. Edycja i usunięcie dotyczą tego samego ID i serii. Jeden wynik ma jeden kanoniczny zapis w mg/mg; mg/g i mmol/mmol nie tworzą oddzielnych pomiarów ani mieszanych skal na wykresie. Nierówność nie jest dokładnym punktem serii. Zapis wymaga istniejącej zapisanej karty pacjenta. Notatka pozostaje czytelna, bez surowego technicznego JSON.

## Syntetyczny kontrakt regresji

Poniższe oczekiwania dotyczą rzeczywistych funkcji produkcyjnych, nie drugiej implementacji wzoru w teście. Tabela określa wymagania; **nie deklaruje zakończonych uruchomień**. Wyniki testów i sprawdzony SHA podaje PR.

| Wejście lub stan | Oczekiwany wynik |
| --- | --- |
| Chłopiec 10 lat; P 15 mmol/L / Cr 10 mmol/L | Dokładnie `46460642997/113120000000` mg/mg, około 0,4107199699169024; skrót ≈0,411, w zakresie 0,144–1,234. |
| Oba stężenia po 1 mmol/L lub po 1000 µmol/L | Około 0,273813313277935 mg/mg; te same jednostkowo równoważne wyniki. |
| Gotowe 411 mg/g / gotowe 1,5 mmol/mmol | Dokładnie 0,411 / około 0,4107199699169024 mg/mg; skale nie są zamienne. |
| Chłopiec 13 lat; gotowe 1134 mg/g | Dokładnie 1,134 mg/mg, górna granica ARUP włączona. |
| Chłopiec 7 lat; P 18,6648 mg P/dL / Cr 10 mmol/L | Dokładnie 0,165 mg/mg, dolna granica ARUP włączona. |
| Mężczyzna 18 lat; gotowe 0,74999999999999999 /0,75 /0,75000000000000001 mg/mg | Poniżej granicy / poza zakresem / poza zakresem; ocena nie zależy od zaokrąglenia. |
| Wiek 5 lat, dorosła kobieta lub brak potrzebnych danych | Dostępna liczba i neutralny konkretny powód braku profilu; brak normy zastępczej. |
| P 0 przy dodatniej Cr / P pusty / Cr 0 / ujemny dowolny operand | Neutralna liczba 0 / brak wyniku / błąd / błąd, także przy dwóch ujemnych operandach. |
| P 0,00001 mg P/dL / Cr 100 mg/dL | Dodatnie 0,0000001 mg/mg we wszystkich projekcjach, bez zapisanego zera. |
| P 1e−300 mg P/dL / Cr 1e100 mg/dL | Brak zapisywalnego wyniku zamiast pozornego dokładnego zera. |
| Gotowe <0,8 mg/mg u dorosłego mężczyzny | Przedział przecina granicę normy: neutralna ocena, zachowany operator, brak punktu wykresu. |
| Znane różne próbki → gotowy raport → zapis/edycja → stężenia | Niezależny raport dostępny; fakt pozostaje; stężenia nadal zablokowane. |
| Znany czas 12 h / znany problem zbiórki | Ratio bez skalowania / poprawna liczba z wstrzymaną automatyczną oceną. |
| Odczyt po zmianie wieku, norm lub silnika / jawna edycja | Utrwalona historia bez ponownej oceny / aktualna polityka przy zachowaniu ID. |

Regresje obejmują pełną tabelę wieku/płci i granice, wszystkie jednostki i aliasy, znaki i operatory, precyzję, zero/tiny/underflow/overflow, znane fakty o materiale, walidację migawek, odczyt bez bieżącego silnika, edycję i projekcje zapisu, desktop/mobile oraz rzeczywistą instalację i aktualizację offline. Rozszerzenie profilu o kobiety, młodsze dzieci lub inną próbkę wymaga pełnej weryfikacji odpowiednich źródeł i akceptacji właściciela.
