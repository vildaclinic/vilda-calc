# Dobowe wydalanie fosforu (fosforanów) — PO4_mgkg

Stan polityki: 29.10.2026. Właściciel zaakceptował [makietę desktop/mobile](https://vilda-po4-dzm-20261029.maciej-flader.chatgpt.site), zakres źródłowy i kodowanie pakietu. [Źródła i decyzje makiety](https://vilda-po4-dzm-20261029.maciej-flader.chatgpt.site/zrodla.html) utrwalają propozycję zaakceptowaną przed implementacją. Baza audytu: `eee483016505f3267c61629af3db1216c5d79fe2`. Nowe odniesienie i reguły zapisu są zmianą kliniczną i funkcjonalną. Akceptacja właściciela ani testy techniczne nie oznaczają niezależnej walidacji klinicznej.

## Potwierdzone problemy i granice ustaleń

Audyt odtworzył poniższe zachowania rzeczywistych funkcji produkcyjnych i formularza, z danymi fikcyjnymi:

- Producent przyjmował dokładne zero, a formularz je blokował.
- Dla 0,001 mg P/dL i 1500 mL producent zwracał 0,015 mg P/24 h, lecz wynik pokazywał 0,0. Kolektor zapisu potrafił zastąpić liczbę surową zaokrąglonym zerem w `labResult.valueNum`; obwiednia obliczenia nadal zachowywała dodatnie `rawValue`. Odczyt Klirensu i ogólne Badania/Notatki mogły więc przedstawiać różne liczby. Nie wykazano utraty surowej liczby we wszystkich ścieżkach.
- Brak normy bywał zapisywany jako `outOfRange:false`, mimo braku wykonanej oceny. Sama karta pozostawała neutralna; nie potwierdzono błędu polegającego na zielonym werdykcie w bieżącym widoku.
- Obecny moduł nie miał wdrożonego profilu wieku. Komunikat „Brak uniwersalnej normy” nie dowodzi nieistnienia źródeł pediatrycznych.

Nie potwierdzono błędu podstawy chemicznej ani mnożnika około 3,066: istniejący producent poprawnie liczył masę P i stosował 30,9738 mg P/mmol. Nie wykazano też potrzeby zmiany wspólnej obsługi czasu: nowe puste pole przyjmowało 24 h, jawne 12 h pozostawało 12 h, czas 0 i znana błędna zbiórka blokowały wynik, a nieznany czas historyczny wymagał podania godzin przy edycji. Te zabezpieczenia należy zachować.

## Formularz, jednostki i obliczenie

Domyślnie **Oblicz ze stężeń**: stężenie fosforu w moczu (`mg P/dL`, `mg P/L`, `mmol/L`) i objętość całej zbiórki (`mL`, `L`). Drugą opcją jest **Gotowy wynik dobowy** w `mg P/24 h` lub `mmol/24 h`. Główny wynik jest ilością dobową, bez wymagania masy ciała. Znana dodatnia masa umożliwia wyłącznie dodatkowe przeliczenie `mg P/kg/24 h` w Szczegółach. Wiek i płeć pochodzą z istniejących danych pacjenta; brak danych do normy nie blokuje poprawnej liczby. Nie potrzeba wzrostu, BSA, kreatyniny, PTH ani fosforanów we krwi do samego obliczenia.

Przelicznik zachowuje dotychczasową wartość **1 mmol = 30,9738 mg P**. `mg P` oznacza masę pierwiastkowego fosforu, a nie masę jonu PO₄. Jeden mol fosforanu zawiera jeden mol P; wartości molowe są równe, lecz masa jonu około 94,97 mg/mmol nie jest przelicznikiem rutynowego wyniku w mg P. Historyczny identyfikator `PO4_mgkg` pozostaje stabilny i nie nakazuje dzielenia głównego wyniku przez masę.

Po sprowadzeniu jednostek:

`ilość mg P/24 h = stężenie mg P/L × objętość L × 24 / czas h`.

Dla pełnych 24 h równoważnie: `stężenie mg P/dL × objętość mL / 100`. Wynik molowy to ilość mg P/24 h podzielona przez 30,9738. Gotowy wynik dobowy jest już ilością na dobę: nie mnoży się go ponownie przez objętość ani 24/czas. Zmiana jednostki ma zachować tę samą ilość, także na granicy odniesienia.

W nowym pomiarze rzeczywiście wpisane domyślne 24 h jest jawnym założeniem użytkowym, a **Zmień** otwiera jedno pole godzin. Puste nowe pole korzysta z tej samej reguły `ClcrCollectionDuration`. Jawny czas musi być skończoną liczbą dodatnią; 0, wartość ujemna lub błędny tekst nie stają się 24. Inny dodatni czas daje oszacowanie na dobę bez normy pełnej DZM. Znany czas 12 h odbiera prawo do normy także po przejściu na gotowy wynik, choć podana ilość dobowa nie jest ponownie skalowana.

Jawnie znana niepełna lub błędna zbiórka blokuje oba tryby. Krótszy czas nie naprawia brakującej porcji. Niezaznaczony dawny checkbox bez odpowiedzi nie oznacza sam przez się zgłoszonego błędu. Zachowujemy jawne odpowiedzi negatywne i `Cl24CollectionProblem`. Nie dodajemy obowiązkowej ankiety o protokół.

## Precyzja, zero i ocena

Ujemne stężenie lub gotowe wydalanie są odrzucane; objętość musi być dodatnia. Opcjonalne /kg wymaga poprawnej dodatniej masy; jej brak lub nieprawidłowy wpis pozostawia ilość dobową, z uwagą o niedostępnym przeliczeniu. Dokładne zero pozostaje neutralną liczbą z uwagą o sprawdzeniu raportu laboratorium i granicy oznaczalności. Zapis `<LOD`/`<LOQ` nie jest dokładnym zerem. Samo zero nie otrzymuje rozpoznania niedoboru ani automatycznego werdyktu „poniżej normy”.

Mała dodatnia wartość pozostaje widocznie dodatnia w formularzu, raporcie, Badaniach, Notatkach, eksporcie, historii i edycji. Surowej liczby nie odtwarza się z zaokrąglonego napisu. Klasyfikacja odbywa się przed prezentacją; liczba pacjenta i granice są formatowane tak, aby pozorna równość nie przeczyła ocenie. Przepełnienie, niedomiar lub utrata obsługiwanej precyzji mają prowadzić do błędu, a nie zmienionej liczby.

Brak właściwej oceny ma `outOfRange:null`, a nie `false`. Dotyczy m.in. nieznanego wieku, nieznanej wymaganej płci, wieku poza profilem, czasu innego niż 24 h, zera i niedostępnej polityki. Dopiero rzeczywiste porównanie uprawnia do `false` (w zakresie) lub `true` (poza zakresem). Dostępność liczby, dostępność normy i możliwość oceny są osobnymi stanami.

## Jeden jawny profil laboratoryjny

Normy są wersjonowanymi danymi poza silnikiem; wybrane źródło jest argumentem obliczenia. Zatwierdzona polityka stosuje spójny profil **Labcorp 003251**, bez dobierania laboratorium do korzystniejszego wyniku i bez łączenia z Mayo lub percentylami badawczymi. Katalog sprawdzono 29.10.2026; metoda kolorymetryczna, próbka: mocz z pełnych 24 h.

| Źródłowa grupa wieku | Mężczyźni, mg P/24 h | Kobiety, mg P/24 h |
| --- | ---: | ---: |
| 0–5 lat | Nie ustalono | Nie ustalono |
| 6–12 lat | 130–941 | 130–941 |
| 13–80 lat | 390–1425 | 261–1078 |
| >80 lat | 210–888 | 96–706 |

**Obie granice każdego zakresu należą do zakresu.** Przyjęta i zaakceptowana konwencja programowa to ukończone lata: `6 ≤ wiek < 13`, `13 ≤ wiek < 81`, `wiek ≥ 81`. Obejmuje również dokładniejszy wiek, np. 80,5 roku w grupie 13–80. Sam katalog podaje grupy lat bez dokładniejszej reguły przejścia; konwencja jest decyzją wdrożeniową, nie dodatkową informacją źródłową. Nie tworzymy ciągłej krzywej ani kategorii Tannera. Niepewny wiek obejmujący więcej niż jedną grupę nie uprawnia do arbitralnego wyboru.

W wieku 6–12 lat płeć nie jest potrzebna do wspólnego przedziału. Od ukończonych 13 lat brak wymaganej płci pozostawia liczbę bez porównania. Poniżej 6 lat: „Brak ustalonego zakresu referencyjnego dla tego wieku w wybranym źródle”. Nie stosujemy dorosłej normy zastępczej ani nie deklarujemy, że nie istnieją żadne pediatryczne dane.

To przedziały konkretnego laboratorium, nie uniwersalna norma zdrowia, polska walidacja, cel leczenia, próg kamicy ani rozpoznanie nerkowej utraty fosforanów. Katalog nie podaje wielkości kohorty, definicji percentyli ani szczegółowej walidacji populacyjnej. Odniesienie jest orientacyjne dla wybranego źródła. Wynik i norma mają tę samą jednostkę, także po przełączeniu na mmol/24 h; dodatkowe /kg nie zastępuje odniesienia w ilości dobowej.

Mayo POU podaje inny zakres dorosły, 226–1797 mg/24 h od 18 lat. Jest źródłem kontekstu i ograniczeń, bez automatycznego przełączania z Labcorp. Praca Taranta-Janusz i wsp. 2017 obejmuje 3913 zdrowych dzieci w wieku 2–18 lat, lecz dokładne percentyle suplementu S5 nie zostały zweryfikowane. Nie odtwarzamy norm z wykresów ani median/IQR z S2. Suplement pozostaje konkretną luką dowodową dla ewentualnego osobnego profilu badawczego; percentyle 5.–95. nie byłyby domyślnie laboratoryjnym RI 2,5.–97,5.

## Kontekst kliniczny bez nowych pytań

Przy głównej liczbie wystarcza krótka uwaga: **„Na wydalanie wpływają dieta i leczenie. Oceniaj łącznie z fosforanami w surowicy.”** Jedna karta B łączy wynik z odniesieniem w tej samej jednostce; liczby zakresu są neutralne, odchylenie bursztynowe. Brak porównania nie daje zielonego werdyktu. Poniższe informacje należą do domyślnie zwiniętych **Szczegółów**. Nie dodajemy selektora choroby, pól krwi, dawki, pory pobrania ani ankiety o leczenie.

**Przytarczyce.** Nadmiar PTH może zwiększać fosfaturię, lecz sama ilość dobowa nie rozpoznaje nadczynności/niedoczynności przytarczyc ani skuteczności leczenia. W przejrzanych zaleceniach PHPT/HypoPT nie znaleziono celu terapeutycznego fosforanów w DZM. Ocena opiera się na właściwych parametrach krwi i czynności nerek; w HypoPT cele moczowe dotyczą przede wszystkim wapnia. Dotyczy to także ograniczeń pediatrycznych: nie przenosimy celów kalciurii dorosłych na fosfaturię dzieci. W PChN decyzje wymagają łącznej seryjnej oceny Ca, fosforu i PTH; mała ilość wydalana nie dowodzi braku problemu przy zmniejszonej filtracji.

**Krzywica hipofosfatemiczna i XLH.** Krzywica hipofosfatemiczna obejmuje przyczyny inne niż XLH; DZM nie ustala etiologii ani wskazania do burosumabu. IWG 2025 uwzględnia dobowy fosfor i kreatyninę w szerszej początkowej ocenie dorosłych z XLH, przy bardzo niskiej pewności dowodów. U dzieci preferuje się punktowe, odpowiednio sparowane próbki moczu i krwi dla TRP/TmP/GFR. Laboratoryjny zakres ilości dobowej nie wyklucza nieadekwatnej utraty nerkowej przy hipofosfatemii. Sam wynik podwyższony również jej nie rozpoznaje.

**Burosumab.** Aktualna polska ChPL Crysvita, punkt **4.4**, sugeruje kontrolę wapnia i fosforanów w moczu co **3 miesiące**. Nie narzuca w tym zaleceniu metody 24-godzinnej i nie podaje ilościowego progu DZM skuteczności ani bezpieczeństwa. Odpowiedź ocenia się łącznie z fosforanami w surowicy na czczo, zakresem wieku, TmP/GFR i odpowiedzią kliniczną, z uwzględnieniem czasu pobrania względem dawki. Bezpieczeństwo obejmuje także wapń, PTH i czynność nerek. Nie nadajemy werdyktu „leczenie skuteczne” na podstawie DZM ani nie odtwarzamy algorytmu dawkowania.

Odnośnik **Otwórz TmP/GFR** prowadzi do istniejącego modułu i zachowuje pacjenta. Ilość dobowa nie staje się stężeniem próbki punktowej; nie tworzymy brakujących danych do TmP/GFR i nie przypisujemy automatycznie dawnej surowicy do nowego pomiaru. Dobór próbek musi odpowiadać właściwemu protokołowi; zbiórka 24-godzinna nie jest samym tym faktem próbką na czczo. Zasady TmP/GFR pozostają opisane w [TMP_GFR.md](TMP_GFR.md).

## Historia, edycja i zapis

`clcr_po4_dzm_reference_data.js` udostępnia politykę `PO4_DZM_LABCORP_003251_2026_10_29`, wersja 1, a `VildaClcrPo4Dzm.evaluate(input, policy)` jest producentem oceny. Wspólny model `clcr-po4-dzm`, wersja 1, służy formularzowi, raportowi, zapisowi, Notatkom, eksportowi i świadomej edycji; `ClcrPo4DzmPersistence` zapisuje `po4DzmSnapshot`, a klucz badania to `clcr-po4-dzm`. Snapshot zamraża surową wartość i prezentację, podstawę masową P, jednostkę, tryb i wejścia, czas liczbowy i jego pochodzenie, znane ograniczenia zbiórki, wiek z precyzją, płeć, ewentualną masę, status oceny, granice i ich inkluzywność, grupę wieku, źródło, datę odczytu oraz wersję polityki. Źródło nie może zależeć od korzystności wyniku.

Odczyt historyczny nie uruchamia dzisiejszego silnika lub katalogu norm i nie pożycza dzisiejszego wieku pacjenta. Stare wpisy bez utrwalonej normy pozostają nieocenione, także gdy dawny techniczny `outOfRange:false` nie oznaczał wykonanego porównania. Nie migrujemy danych realnego sejfu ani nie przepisujemy dawnych liczb, prezentacji i ocen. Zaufane dodatnie `rawValue` zachowuje znaczenie mimo historycznego tekstu 0,0; brak surowej liczby nie uprawnia do odtworzenia nieznanej precyzji.

Świadoma edycja jest odrębnym obliczeniem według bieżącej polityki. Legacy `U_PO4` oznacza mg P/dL, a `V24` — mL; nowe jednostki nie zmieniają znaczenia tych aliasów używanych gdzie indziej. Utrwalony czas liczbowy jest używany wprost. Jeśli dawny wpis zawiera jedynie lokalne daty bez offsetu i brak liczbowego czasu, edycja wymaga jawnych godzin. Nie używamy `Date.parse` w aktualnej strefie urządzenia i nie podstawiamy nowego domyślnego 24 h do historycznej niewiadomej. Do edycji wynik pozostaje zamrożony.

Serie w mg P/24 h, mmol/24 h i /kg zachowują jawną jednostkę i podstawę masową; nie miesza się nieporównywalnych miar. Nowy pacjent nie dziedziczy pomiaru ani kontekstu poprzedniego. Samo liczenie pozostaje dostępne bez zapisanej karty; zapis nadal wymaga istniejącej zapisanej karty pacjenta i wspólnego magazynu aplikacji.

## Źródła, wersje i dokładne lokalizatory

Przegląd źródeł wykonano 29.10.2026. Poniżej rozróżniamy katalog laboratoryjny, wytyczne i dokument produktu. Pełne wskazane sekcje zostały sprawdzone w audycie; publiczna dokumentacja nie zawiera kopii PDF wydawców, prywatnych logów audytu ani danych pacjentów.

1. [Labcorp 003251, Phosphorus, 24-Hour Urine](https://www.labcorp.com/tests/003251/phosphorus-24-hour-urine): **Reference Range**, Methodology, Use i wymagania próbki. Wiek/płeć i zakresy jak w tabeli wyżej; katalog nie podaje wersji ani szczegółów kohorty.
2. [CIAAW/IUPAC, Phosphorus](https://ciaaw.org/phosphorus.htm): standardowa masa atomowa **30,973761998(5)**, rewizja 2013. Zachowane 30,9738 jest przybliżeniem klinicznym obecnego producenta, a nie nieskończenie dokładną stałą. [Labtest Phosphorus UV Liquiform Ref. 12, instrukcja](https://labtest.com.br/wp-content/uploads/2016/09/INS_USO_12_EdicNovembro1996_RevSetembro2012_Ref_13062303_Eng.pdf), s. 2, **Calculations / Conversion**: mg/dL × mL/100 i molowe ×0,323; wsparcie wymiarowe, nie nowe normy.
3. [Mayo POU, Phosphorus, 24 Hour, Urine](https://www.mayocliniclabs.com/test-catalog/overview/610832): **Reference Values**, Clinical Information, Interpretation i Method Description. ≥18 lat, 226–1797 mg/24 h; brak ustalonego w tym katalogu zakresu <18 lat. Inne odniesienie niż zatwierdzony profil Labcorp.
4. Taranta-Janusz K i wsp. *Determining normal values of urinary phosphorus excretion in 3913 healthy children aged 2–18 to aid early diagnosis and treatment for urolithiasis*. Acta Paediatr 2017;106:1170–1175, [DOI 10.1111/apa.13856](https://doi.org/10.1111/apa.13856). Metody i opis **S2 (mediany/IQR), S5 (percentyle regresyjne)**; dokładnych tabel S5 nie zweryfikowano, więc nie są danymi automatycznego porównania.
5. Bilezikian JP i wsp. **Fifth International Workshop, PHPT 2022**, JBMR 37:2293–2314, [DOI 10.1002/jbmr.4677](https://doi.org/10.1002/jbmr.4677): Summary **1.1, 1.3, 3.1, 3.3, 9.1, 9.3.3**, Diagnosis oraz Biochemical evaluation. Khan AA i wsp. **Second International Workshop, HypoPT 2022**, JBMR 37:2568–2585, [DOI 10.1002/jbmr.4691](https://doi.org/10.1002/jbmr.4691), wersja of record 14.11.2022: Summary **1.1–1.2, 5.1, 6.2–6.5**, optimal monitoring strategy. Cele wapnia w moczu nie są celami fosforanów w DZM.
6. Bollerslev J i wsp. **Revised ESE guideline, chronic HypoPT in adults 2025**, EJE 193:G83–G112, finalny rekord 13.11.2025, [DOI 10.1093/ejendo/lvaf222](https://doi.org/10.1093/ejendo/lvaf222): **R.1.1, R.2.3–2.4 (G94–G96), R.4.2–4.4 (G102)**. Khan AA i wsp. **Best practice recommendations 2025**, Metabolism 171:156335, online 26.06.2025, [DOI 10.1016/j.metabol.2025.156335](https://doi.org/10.1016/j.metabol.2025.156335): **Table 1, punkt 9 (PDF s. 4), §4.6 (PDF s. 12)**, dzieci. Lemaitre i wsp., **SFE–AFCE–SFMN 2024/2025, Chapter 7**, Ann Endocrinol 86:101696, 14.01.2025, [DOI 10.1016/j.ando.2025.101696](https://doi.org/10.1016/j.ando.2025.101696): **§1.1–1.3, Childhood recommendations**. Żadne z tych odniesień nie tworzy tu celu leczenia fosforanów w DZM.
7. **KDIGO CKD-MBD 2017**, Kidney Int Suppl 7:1–59, [pełne wytyczne](https://kdigo.org/wp-content/uploads/2026/04/KDIGO-2017-CKD-MBD-Guideline.pdf): **3.1.1–3.1.5, 4.1.1–4.1.5, 4.2.1 i uzasadnienie**. Dotyczy PChN, a nie każdej pozanerkowej przyczyny wtórnej nadczynności przytarczyc; data ścieżki PDF nie zmienia wersji 2017.
8. Khan AA i wsp. **IWG adult XLH 2025**, JCEM 110:2353–2370, online 17.04.2025, [pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC12261105/), [DOI 10.1210/clinem/dgaf170](https://doi.org/10.1210/clinem/dgaf170): **Initial assessment, Clinical manifestations / biochemical evaluation, Follow-up, Treatment recommendations / Burosumab**. Ali DS i wsp. **IWG pediatric XLH 2025**, JCEM 110:2055–2070, online 17.02.2025, [DOI 10.1210/clinem/dgaf093](https://doi.org/10.1210/clinem/dgaf093), [pełny autorski PDF](https://static.aeped.es/2025_IWG_Pediatric_Guidelines_final_ac106217d8.pdf): **Initial assessment i Follow-up, PDF s. 3–4, 7–10**. Zalecenia monitorowania są słabe, z bardzo niską pewnością dowodów; nie stanowią walidacji lokalnego kalkulatora.
9. Haffner D i wsp. **Clinical practice recommendations for the diagnosis and management of XLH 2025**, Nat Rev Nephrol 21:330–354, publikacja 15.01.2025, korekta wydawcy 4.02.2025, [DOI 10.1038/s41581-024-00926-x](https://doi.org/10.1038/s41581-024-00926-x), [pełny autorski PDF](https://xlhuk.org/wp-content/uploads/2025/01/Clinical-practice-recommendations-XLH.pdf): **Diagnosis / Box 1 (PDF s. 4), Table 1 / Box 4 (s. 8–9), Box 6 / Management of burosumab (s. 11–13)**. PDF autorski zachowuje format przedpublikacyjny. Nie wyznacza dobowego progu skuteczności.
10. **Crysvita, aktualna polska ChPL EMA**, [pełny PDF](https://www.ema.europa.eu/pl/documents/product-information/crysvita-epar-product-information_pl.pdf), [EPAR](https://www.ema.europa.eu/en/medicines/human/EPAR/crysvita), wykaz zaktualizowany 10.06.2026, odczyt 29.10.2026: pełne **4.1–4.5, PDF s. 3–11**, zwłaszcza **4.4 (wapń i fosforany w moczu co 3 miesiące)**; 4.2 dotyczy właściwego monitorowania fosforanów w surowicy. [EMA DHPC, severe hypercalcaemia](https://www.ema.europa.eu/en/documents/dhpc/direct-healthcare-professional-communication-dhpc-crysvita-burosumab-risk-severe-hypercalcaemia_en.pdf), komunikat 9.10.2025 / publikacja EMA 20.10.2025, **Summary / Background, s. 1–2**: bezpieczeństwo wapnia/PTH; starszy komunikat nie zastępuje aktualnej ChPL.

## Syntetyczne kontrakty i plan weryfikacji

Poniższe przypadki są wymaganiami dla testów wywołujących rzeczywisty kod produkcyjny, a nie dowodem ich wykonania. Wyniki uruchomień, sprawdzenia przeglądarkowe, offline i aktualne SHA kontroli CI podaje opis PR.

| Wejście lub stan | Oczekiwany wynik |
| --- | --- |
| 10 lat, 50 mg P/dL, 1500 mL, 24 h, bez masy | 750 mg P/24 h; Labcorp 130–941, w zakresie. |
| 500 mg P/L i 1,5 L albo równoważne mmol/L | Ta sama ilość i ocena; zmiana jednostki nie zmienia strony granicy. |
| 1 mmol/L, 1,5 L, 24 h | 46,4607 mg P/24 h = 1,5 mmol/24 h. |
| Gotowe 750 mg P/24 h / równoważne mmol/24 h | Ta sama ilość bez wymagania stężenia, objętości i masy. |
| 50 mg P/dL, 1500 mL, 12 h | 1500 mg P/24 h jako neutralne oszacowanie, bez normy 24 h. |
| Gotowe 750 mg P/24 h przy znanym czasie 12 h | Nadal 750, bez normy; przełączenie trybu nie usuwa ograniczenia. |
| Czas nowy pusty / 0 / historycznie nieznany | Założone 24 / błąd / wymagane jawne godziny przy edycji. |
| Znana brakująca porcja w dowolnym trybie | Brak wyniku i zapisu, bez „naprawy” przez zmianę czasu lub trybu. |
| 0 / −1 / 0,001 mg P/dL, 1500 mL | Neutralne dokładne 0 / odrzucenie / dodatnie 0,015 we wszystkich ścieżkach. |
| 0,000001 mg P/dL, 1500 mL | Dodatnie 0,000015, bez odtworzenia z zaokrąglonego napisu. |
| Każda dokładna dolna/górna granica Labcorp | W zakresie; wartości tuż poza granicami mają zgodną ocenę i prezentację. |
| Wiek 5,999 / 6 / 12,999 / 13 / 80,999 / 81 lat | Bez normy / 6–12 / 6–12 / 13–80 / 13–80 / >80. |
| 6–12 lat bez płci / ≥13 bez płci / brak wieku | Wspólna norma / liczba bez normy / liczba bez normy. |
| Zmiana wieku, źródeł lub strefy po zapisie | Historia zachowuje utrwaloną liczbę, czas i ocenę. |
| Dawne `outOfRange:false` bez utrwalonej normy | Brak retrospektywnego werdyktu „w normie”; zapis źródłowy pozostaje zachowany. |
| Zmiana pacjenta, edycja/usunięcie, eksport, Notatki | Operacje na tym samym pomiarze, bez obcych danych i rozbieżności liczbowych. |

Plan obejmuje testy silnika, danych referencyjnych, UI i zapisu/odczytu/edycji, normalizacji magazynu oraz pełny przepływ na desktopie i przy 390/320 px. Trzeba sprawdzić stałą geometrię karty, 16 px/48 px pól na telefonie, brak poziomego przewijania, odstęp pod czyszczeniem, fokus, przełączanie jednostek i trybów oraz PWA offline. Przegląd źródeł należy ponowić po zmianie katalogu Labcorp, ChPL, polityki wieku, przelicznika, czasu lub kontraktu historii.
