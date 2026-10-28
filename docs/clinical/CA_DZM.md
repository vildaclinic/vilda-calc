# Dobowe wydalanie wapnia — audyt 28 października 2026

Zakres: `Ca_mgkg`. Właściciel zaakceptował [makietę przed/po desktop i mobile](https://vilda-ca-dzm-20261028.maciej-flader.chatgpt.site), w tym pediatryczny kontekst choroby przytarczyc i ostateczne brzmienie komentarzy, oraz wdrożenie z naprawą błędów. Baza implementacji: `audyt`, `d921497f63729e660478d4025c72b97d2cecfe87`. To zmiana kliniczna i funkcjonalna, nie sama kosmetyka. Testy techniczne nie stanowią niezależnej walidacji klinicznej.

## Minimum danych i obliczenie

Domyślnie **Oblicz ze stężeń**: wapń w moczu (mmol/L, mg/dL, mg/L) i objętość całej zbiórki (mL, L). Alternatywnie **Gotowe wydalanie**: mg/24 h, mmol/24 h lub mg/kg/24 h. Przyjmujemy pełne 24 h; opcjonalne Zmień otwiera jedno pole godzin zamiast dat i sześciu pytań o protokół. Znany błąd zbiórki pozostaje blokujący. Dawny niezaznaczony checkbox bez odpowiedzi nie jest ani potwierdzoną kompletnością, ani zgłoszonym błędem.

Jedna konwersja **40,078 mg/mmol**. Ilość dobowa to stężenie[mg/L] × objętość[L] × 24/czas[h]; podzielenie przez masę daje /kg. Gotowy wynik dobowy nie jest ponownie mnożony przez czas/objętość.

Wiek, płeć i masa pochodzą ze znanych danych. Dziecko ze znaną masą otrzymuje główne /kg i ilość dobową; dorosły główne mg/24 h i opcjonalne /kg. Bez masy lub wieku pozostaje dostępna ilość dobowa bez nieuprawnionej normy. Gotowe /kg nie wymaga masy do liczby ani pediatrycznego porównania; u dorosłego masa jest potrzebna do odzyskania mg/24 h. PTH, wapń we krwi, kreatynina, wzrost i BSA nie są dodatkowymi wymaganiami formularza.

Ujemne stężenie/wydalanie odrzucamy; podana masa, objętość i czas muszą być dodatnie. Dokładne zero jest neutralną liczbą z uwagą o sprawdzeniu oznaczalności, bez rozpoznania hipokalciurii lub FHH. <LOD/<LOQ nie staje się zerem. Mały dodatni wynik pozostaje dodatni. Ocena poprzedza zaokrąglenie, a jednostka nie zmienia strony granicy.

## Jawna polityka źródłowa

Pełne źródła i katalog zweryfikowano 28.10.2026. Normy są danymi w `clcr_ca_dzm_reference_data.js`; `evaluate(input,policy)` przyjmuje je z zewnątrz.

| Populacja / pytanie | Odniesienie | Równość |
|---|---|---|
| Niemowlę < 3 miesięcy | ≤ 5 mg/kg/24 h | W odniesieniu wieku |
| Dziecko ≥ 3 miesiące, < 18 lat | < 4 mg/kg/24 h | Granica odniesienia, bez automatycznej diagnozy |
| Dorosła kobieta/mężczyzna, ryzyko kamicy | < 200/< 250 mg/24 h | Osiągnięty próg ryzyka |
| Dorosła kobieta/mężczyzna, rozpoznana niedoczynność przytarczyc | < 250/< 300 mg/24 h | Nie spełnia ścisłego celu |
| Dorosła kobieta/mężczyzna, rozpoznana hiperkalcemiczna PHPT | > 250/> 300 mg/24 h | Nie przekracza kryterium |

**EAU Paediatric Urology 2026, 18.2.1** ([pełny rozdział](https://uroweb.org/guidelines/paediatric-urology/chapter/urinary-stone-disease)) opisuje > 4 mg/kg/d u dzieci < 60 kg i górną granicę 5 dla < 3 miesięcy. **EAU Urolithiasis 2026, limited update March, tabela 4.4, strona 48** ([PDF](https://d56bochluxqnz.cloudfront.net/documents/full-guideline/EAU-Guidelines-on-Urolithiasis-2026.pdf#page=48)) ma ogólną kolumnę pediatryczną < 4. Jawne uzgodnienie: szczegółowe niemowlęce ≤ 5, następnie < 4 z szerszej tabeli, także u cięższych nastolatków. Nie przypisujemy Paediatric pokrycia ≥ 60 kg ani ścisłego < 4 z innego dokumentu. Dokładnie 4 oznacza granicę, nie automatyczne rozpoznanie. Zaokrąglone 0,1 mmol/kg nie jest drugim niezależnym progiem. Nie ustalono osobnego profilu wcześniaczego ani krzywej dni życia. Samo 0 ukończonych lat bez miesięcy/dni obejmuje obie grupy: liczba pozostaje neutralna, z opisem alternatyw.

**Mayo CALU, Reference Values i przypis**, pełne 24 h, ≥ 18 lat ([katalog](https://www.mayocliniclabs.com/test-catalog/Overview/610854)): progi ryzyka kamicy, nie populacyjne przedziały referencyjne. Etykieta „Próg ryzyka kamicy”. Ryzyko ciągłe; wynik poniżej nie wyklucza kamicy. Progi uwagi 5/8 mmol w EAU mają inny cel i nie nadpisują wybranego porównania.

**ESE 2025, R.2.3 i uzasadnienie**, wyłącznie dorośli ([DOI](https://doi.org/10.1093/ejendo/lvaf222)): wybrano główny cel dobowy zależny od płci; alternatywne < 4 mg/kg/d dla obu płci pozostaje w Szczegółach. Nie łączymy ich w nową korzystniejszą normę. Dowody dla optymalnego celu wydalania są ograniczone. Osiągnięty cel kalciurii nie oznacza powodzenia całej terapii. Kalciuria może być zwiększona mimo docelowego wapnia we krwi.

**Fifth International Workshop 2022, panel 5.1.3.3** ([DOI](https://doi.org/10.1002/jbmr.4677)): jedno kryterium nerkowe w już rozpoznanej hiperkalcemicznej PHPT, nie diagnoza z moczu ani automatyczna kwalifikacja do operacji. Nie przenosimy tego progu na normokalcemiczną PHPT lub dzieci. Równość 250/300 nie spełnia >. Niespełnione kryterium jest neutralne, spełnione bursztynowe. Zapisane odniesienie ma prefiks „Kryterium PHPT”, aby znak > nie udawał normy zdrowia.

**CIAAW/IUPAC, Calcium** ([źródło](https://www.ciaaw.org/calcium.htm)): masa atomowa 40,078(4). Dawne 40 mg/mmol zaniżało ilość o około 0,195%; zwykle niewiele, ale może zmienić ocenę przy ścisłej granicy. Zmiana dotyczy Ca DZM; nie przebudowuje historycznych wzorów pozostałych wskaźników z innych etapów audytu.

## Dzieci — opcjonalny kontekst przytarczyc

Selektor dotyczy rozpoznanej choroby i jest dobrowolny. U dziecka zmienia komentarz, zachowując normę wieku. Nie wprowadza celów 250/300 mg dla dorosłych, werdyktu skuteczności terapii ani automatycznej decyzji o operacji. Nie wymaga nowych badań, pytania o lek lub dawkę.

- **Khan i wsp. 2025, Metabolism 171:156335**, tabela 1, pkt 9 i sekcja 4.6 ([DOI](https://doi.org/10.1016/j.metabol.2025.156335)): osobna część pediatryczna, monitorowanie moczu i coroczne USG nerek, ryzyko nerkowe leczenia wapniem/aktywną witaminą D oraz znaczenie etiologii, m.in. CASR. Nie ustanawia odrębnego uniwersalnego dobowego celu dla dzieci zastępującego normę wieku.
- **PTE 2023, Endokrynologia Polska 74(5):447–467, część 15** ([DOI](https://doi.org/10.5603/ep.96950)): indywidualne leczenie, monitorowanie gospodarki wapniowo-fosforanowej i nerek. Historycznego zdania o braku wytycznych pediatrycznych z 2023 nie powtarzamy jako aktualnego braku jakichkolwiek zaleceń.
- **SFE–AFCE–SFMN 2024/2025, rozdział 7, R 1**, Annales d’Endocrinologie 86:101696 ([DOI](https://doi.org/10.1016/j.ando.2025.101696)): powikłania nerkowe/kostne, diagnostyka genetyczna i doświadczony zespół pediatryczny. Brak ustanowienia osobnego dobowego progu samodzielnie rozstrzygającego o operacji nie oznacza zakazu korzystania z ogólnych zasad leczenia PHPT u dzieci.

Mała kalciuria sama nie rozpoznaje FHH. Osobny CCCR nie jest zwykłym moczowym Ca/Cr i wymaga także krwi; zachowuje ograniczenia różnicowania. Tych pól nie dodajemy do podstawowej DZM.

## Zapis i cykl życia

Polityka `CA_DZM_EAU_MAYO_ESE_PHPT_2026_10`, wersja 1; model `clcr-ca-dzm`, wersja 1 (`caDzmSnapshot`); badanie `clcr-ca-dzm`; identyfikator formuły pozostaje `Ca_mgkg`. Jeden producent jest używany przez UI, edycję, zapis i eksport.

Utrwalamy dokładny wynik, jednostkę, liczbowy czas, wiek z jego precyzją, płeć, masę, wybrany kontekst, granice, nierówności, tekst oceny i źródła. Historia nie uruchamia dzisiejszej oceny. Dawny zapis bez normy pozostaje nieoceniony do świadomej edycji. Serie mg/24 h i /kg są rozdzielone.

Dawnych lokalnych dat bez offsetu nie parsujemy ponownie w aktualnej strefie urządzenia. Edycja używa zapisanego czasu liczbowego, a przy jego braku wymaga jawnych godzin. Dotąd historyczny wynik jest zamrożony. Nowe `CA_*` nie nadpisują `U_Ca`/`V24` innych formuł. Nowy pacjent nie dziedziczy pomiaru lub diagnozy; czyszczenie pomiaru tego samego pacjenta zachowuje znany kontekst.

Zapis nadal wymaga istniejącej zapisanej karty pacjenta. Samo liczenie jest dostępne bez karty. Badania, edycja i usuwanie korzystają ze wspólnego istniejącego magazynu.

## Kontrakty syntetyczne funkcji produkcyjnych

| Wejście | Oczekiwany wynik |
|---|---|
| 10 lat, 30 kg, 5 mmol/L, 1200 mL, 24 h | 240,468 mg/24 h; 8,0156 mg/kg/24 h, pokazane 8,02, ponad < 4 |
| 20,039 mg/dL lub 200,39 mg/L, ta sama zbiórka | Ta sama liczba i ocena |
| Brak masy lub wieku | Dostępne 240,468 mg/24 h; neutralnie, bez nieuprawnionej normy |
| Gotowe 3 mg/kg/24 h u dziecka bez masy | Dostępne 3 i < 4 bez nowego wymaganego pola |
| 2 miesiące, 5 mg/kg/24 h | W odniesieniu ≤ 5 |
| 3 miesiące, 4 mg/kg/24 h | Granica odniesienia, nie diagnoza |
| Dziecko 3 lub 8 w każdym kontekście | Ta sama norma wieku, właściwy komentarz |
| Kobieta 45 lat, 220 mg/24 h | Kamica: ponad 200; hypoPT: spełnia < 250; PHPT: nie spełnia > 250 |
| Kobieta 250 mg/24 h | HypoPT: nie spełnia < 250; PHPT: nie przekracza > 250 |
| 0/−1/bardzo mała dodatnia liczba | Neutralne 0/odrzucenie/zachowany dodatni wynik |
| 12 h zamiast 24 h | Przeliczona ilość bez normy lub celu pełnej DZM |
| Zmiana wieku/norm po zapisie | Zapisana ocena bez zmiany |
| Stare daty bez czasu liczbowego, świadoma edycja | Żądanie godzin, bez nowego parsowania dat |

Regresje wywołują kod produkcyjny, sprawdzają odczyt bez ponownej oceny, edycję/usuwanie wybranego pomiaru, zmianę pacjenta, eksport, desktop/390/320 oraz PWA offline. Wyniki wykonań i dokładny commit CI podaje opis PR.
