# Mg/Ca w DZM — stosunek magnezu do wapnia

Właściciel zaakceptował [makietę przed/po na komputerze i telefonie](https://vilda-mgca-20261102.maciej-flader.chatgpt.site) i polecił kodowanie **03.11.2026**. Źródło makiety: `275d2cae2eda94a85b50664d0c27fa07c7565631`. Zakres obejmuje wyłącznie **„Mg/Ca — magnez/wapń w DZM”** (`Mg_Ca` / `clcr:Mg_Ca`). Nie łączy się tej pozycji z ilorazem w próbce jednorazowej, wydalaniem dobowym magnezu lub wapnia, Ca/Cr ani ilorazem klirensów CCCR.

To zmiana kliniczna, nie sama zmiana wyglądu: dokładniejsza konwersja wapnia, dodatkowe jednostki i gotowy raport, poprawna obsługa zera oraz utrwalenie liczby bez pozornej oceny prawidłowości. Akceptacja i zielone testy nie stanowią niezależnej walidacji klinicznej.

## Minimalne dane i materiał

Domyślne **„Oblicz ze stężeń”** wymaga tylko **magnezu, następnie wapnia**, z ich jednostkami. Każde stężenie może być wyrażone w **mg/L, mg/dL, mmol/L lub µmol/L**. Alternatywne **„Gotowy wynik Mg/Ca”** wymaga jednego stosunku i jednej z dwóch różnych skal: **mg/mg** lub **mmol/mmol**. Historyczne aliasy `g/g = mg/mg` i `mol/mol = mmol/mmol` zachowują znaczenie; nie powielają nowych pozycji listy.

Jawne założenie formularza: oba stężenia pochodzą z tej samej wymieszanej dobowej zbiórki moczu. Nie ma obowiązkowego checkboxa potwierdzenia. Znany przeciwny fakt blokuje iloraz stężeń; niezależny gotowy raport pozostaje dostępny. Przeciwna informacja o stężeniach nie znika po przełączeniu na gotowy raport, zapisie i edycji.

Wspólne czynniki objętości i czasu skracają się w ilorazie. Nie mnoży się Mg/Ca przez `24/czas`, nie wyraża wyniku w mg/24 h i nie dodaje pytań o czas, objętość, masę, wzrost, wiek, płeć, krew, AKI, IFCC lub terapię. Własne znane metadane zbiórki zachowuje się bez dopisywania potwierdzonych 24 h; nie pożycza się zegara i faktów innego kalkulatora.

## Wzór, jednostki i zmiana współczynnika

`R_mass = U_Mg [mg/L] / U_Ca [mg/L]`

`R_molar = R_mass × 40,078 / 24,305`

Stałe dotyczą pierwiastków: **Mg 24,305 mg/mmol** i **Ca 40,078 mg/mmol**. Odczytano pełne karty NIST **02.11.2026**: [magnez, 24,3050 g/mol](https://webbook.nist.gov/cgi/cbook.cgi?ID=7439-95-4) i [wapń, 40,078 g/mol](https://webbook.nist.gov/cgi/cbook.cgi?ID=7440-70-2). Liczby g/mol i mg/mmol są równoważne. Nie stosuje się mas soli, jonów cytrynianowych lub uwodnionych związków.

| Jednostka stężenia | Przeliczenie na mg/L |
| --- | --- |
| mg/L | ×1 |
| mg/dL | ×10 |
| mmol/L | × masę molową danego pierwiastka |
| µmol/L | × masę molową danego pierwiastka /1000 |

**mg/mg i mmol/mmol nie są tą samą liczbą.** Przykładowo 0,5 mg/mg odpowiada około 0,82448056 mmol/mmol, natomiast 0,5 mmol/mmol około 0,30322122 mg/mg. Wynik gotowego raportu zachowuje swoją skalę; druga skala jest przeliczeniem, nie drugim niezależnym wynikiem.

Historyczny DZM używał wapnia `1 mmol/L →4 mg/dL`, odpowiadającego 40 mg/mmol. Nowy używa `→4,0078 mg/dL`. Dla Mg 20 mg/L i Ca 2 mmol/L dawny wynik wynosił 0,25 mg/mg, nowy około **0,249513448774889 mg/mg**. Dawny wynik jest o 0,195% większy od nowego. Zwykły odczyt historii nie przelicza zapisanych dawnych liczb przez nową stałą.

## Norma dla DZM: granica ustaleń źródłowych

W źródłach zweryfikowanych w tym audycie **nie ustalono profilu referencyjnego Mg/Ca odpowiedniego do automatycznej oceny DZM według wieku lub płci**. Dotyczy to sprawdzanego zakresu od noworodków i wcześniaków, przez niemowlęta, dzieci i młodzież, po dorosłych i osoby starsze. Jest to opis zakresu zweryfikowanych dowodów, **nie twierdzenie, że w całej literaturze nie istnieją żadne dane**.

Nie przenosi się do DZM progów 0,5 lub 0,8 mg/mg z moczu porannego, zbiorczych percentyli próbki jednorazowej, średniej ±SD chorych na kamicę, odrębnych norm Mg/Cr lub Ca/Cr, odwrotności Ca/Mg ani norm dobowej ilości magnezu. Nie interpoluje się niewykazanej tabeli wieku. Brak normy nie jest normą od zera i nie uzasadnia etykiety **„W zakresie”**.

| Pełne źródło odczytane 02.11.2026 | Populacja, materiał i metoda | Dlaczego nie jest normą Mg/Ca DZM |
| --- | --- | --- |
| Araujo e Sá i wsp., *Acta Med Port* 1992;5:128–130, [DOI 10.20344/amp.3216](https://doi.org/10.20344/amp.3216), [pełny PDF](https://www.actamedicaportuguesa.com/revista/index.php/amp/article/download/3216/2555/4147), metody s. 128, wyniki s. 129 | 327 zdrowych dzieci 4–11 lat z Lizbony; Mg/Ca oznaczono u 226. Druga poranna mikcja około 3 h po śniadaniu. Ca i Mg w mg/dL; Hitachi 717, Ca o-krezoloftaleina, Mg kalmagit. | To próbka poranna. Zbiorcze P2,5 0,09 i P97,5 7,49 mg/mg oraz średnia 1,56 (SD 1,48) nie są tabelą DZM ani tabelą grup wieku. Rozkład był nienormalny, a stosunek zależał od wieku. |
| Dyga i wsp., *Ann Acad Med Siles* 2017;71:139–147, [DOI 10.18794/aams/70366](https://doi.org/10.18794/aams/70366), [pełny PDF](https://annales.sum.edu.pl/pdf-70366-12492?filename=Kamica-ukladu-moczowego-u.pdf), metody s. 142, tabela III s. 143 | 59 hospitalizowanych dzieci z kamicą, jej podejrzeniem lub ryzykiem metabolicznym; dziewczynki 0,31–18 lat, chłopcy 1–17,2 roku. Roche Cobas e411/6000 według protokołów producenta. | Metody wyraźnie oddzielają wydalanie dobowe od **Mg/Ca z porannej porcji**. Przyjęte w pracy <0,8 i podgrupa <0,5 mg/mg nie są zdrowym przedziałem referencyjnym DZM. |
| [EAU Urolithiasis 2026, rozdział metaboliczny](https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention), §4.1.4–4.1.5, tabele 4.2–4.4 i §4.4.2–4.4.4; [EAU Paediatric Urology 2026, kamica](https://uroweb.org/guidelines/paediatric-urology/chapter/urinary-stone-disease), §18.2.1 i §18.3.2 | Pełne oficjalne rozdziały dla dorosłych i dzieci. Opisują ocenę metaboliczną, rolę magnezu i materiał badania. | Dorosły próg małego wydalania magnezu <3 mmol/dobę nie jest normą ratio. Pediatryczna tabela Mg/Cr nie jest Mg/Ca. W odczytanych rozdziałach nie ustalono tabeli Mg/Ca DZM według wieku lub płci. |
| Diangienda i wsp., *Pan Afr Med J* 2021;40:75, [pełny tekst, DOI 10.11604/pamj.2021.40.75.28349](https://www.panafrican-med-journal.com/content/article/40/75/full/) | 73 chorych na kamicę, średni wiek 47 ±14,2 roku; 35 zbiórek dobowych i 38 próbek porannych. Ca i Mg: absorpcja atomowa. | Stosunek Mg/Ca dotyczył próbki porannej. Średnia 1,52 ±1,36 mmol/mmol w grupie chorych nie jest zdrową normą, tabelą wieku lub normą wszystkich badanych zbiórek dobowych. |

Nie przejęto progów ze starszych prac dostępnych wyłącznie jako abstrakty, danych o odwróconym Ca/Mg bez potwierdzonych jednostek ani niedostępnych pełnych tabel. Dane źródłowe profilu **`MGCA_DZM_2026_11`** są oddzielone od silnika; profil utrwala brak zweryfikowanej normy, materiał, stałe i ograniczenia. Identyfikator oznacza wersję polityki aplikacji, nie datę publikacji jednego badania.

## Prezentacja, zera i precyzja

Jedna karta B łączy **wynik pacjenta** z **„Norma dla DZM — Brak zakresu”** i krótkim wyjaśnieniem. Nie ma pozornej osi normy, kategorii „niski/prawidłowy/wysoki” ani koloru sugerującego takie rozpoznanie. Wynik jest neutralny: `assessment/status: unassessed`, `category:null`, `reference:null`, `outOfRange:null`. Dotyczy to również Badań, Notatek, historii, wykresów i raportów. Szczegóły wyjaśniają materiał, jednostki, konwersję i ograniczenia źródeł. Nie dodaje się selektora choroby ani obliczania skuteczności burosumabu, PHPT/HypoPT, kamicy lub niedoboru magnezu.

Każdy operand musi być poprawny i skończony, **Mg ≥0**, **Ca >0**, gotowy stosunek ≥0. Puste pole nie jest zerem. Sprawdzenie odbywa się dla każdego pola oddzielnie: dwa ujemne stężenia nie stają się poprawnym dodatnim ilorazem. **Zero magnezu jest dostępnym wynikiem liczbowym**, z neutralną uwagą o raporcie/oznaczalności; nie oznacza prawidłowości ani rozpoznanego niedoboru.

Skończony wynik nie może zamienić się w zero wskutek przepełnienia konwersji pośredniej. Dodatni wynik zbyt mały lub zbyt duży do bezpiecznego zapisu nie staje się zapisywalnym zerem lub nieskończonością. Małe reprezentowalne wartości pozostają dodatnie również przy skróconym zapisie. **≈** oznacza przybliżenie prezentacji; pełna wartość, dokładny ułamek i oryginalne wejście pozostają utrwalone. Raporty `<`, `≤`, `>` i `≥` zachowują operator; nie otrzymują fikcyjnego dokładnego punktu na wykresie.

Stałe szerokości, wyrównanie jednostek, równe odstępy i symetria obowiązują w obu trybach. Pola mobilne mają co najmniej 16 px tekstu i 48 px wysokości, a przycisk czyszczenia zachowuje co najmniej 20 px odstępu od wyniku.

## Zapis i odczyt historyczny

Migawka **`clcr-magnesium-calcium` v1** utrwala źródłową formułę `Mg_Ca`, materiał, tryb, surowe wartości i jednostki, operator, dokładną liczbę/ułamek, konwersję, prezentację, własne fakty o próbce oraz neutralny stan bez normy. Czytnik sprawdza spójność typu, źródła, materiału, skali i utrwalonej matematyki. Odczyt nie wywołuje bieżącego silnika ani aktualnych danych referencyjnych.

Zwykły **READ** zachowuje historyczną liczbę, np. dawne 0,25 mg/mg, i nie przelicza jej nową stałą. Jeżeli stary zapis rzeczywiście zawiera pełne `raw`, może ono posłużyć do wiernego pokazania małej dodatniej liczby; nie odtwarza się utraconej precyzji tam, gdzie zapisano wyłącznie zero. Stary brak normy i stan bez oceny nie są przedstawiane jako „W zakresie” tylko dlatego, że dawny techniczny znacznik miał `outOfRange:false`.

Dopiero jawne **nowe obliczenie lub EDIT** używa zatwierdzonej nowej polityki konwersji i zapisu. Zmiana końcówki liczby po świadomej edycji dawnych operandów jest zamierzona; nie jest cichą migracją historii. Edycja i usunięcie dotyczą tego samego ID pomiaru i serii. Zapis wymaga istniejącej, zapisanej karty pacjenta. Audyt nie modyfikuje realnych danych sejfu.

## Kontrakt regresji

Poniższe oczekiwania dotyczą rzeczywistych funkcji produkcyjnych. Wyniki zakończonych uruchomień, SHA i PR podaje opis PR; tabela nie jest deklaracją wykonania testów.

| Wejście lub stan | Oczekiwane zachowanie |
| --- | --- |
| Mg 20 mg/L, Ca 2 mmol/L | Około 0,249513448774889 mg/mg, bez normy i automatycznej kategorii. |
| Mg i Ca po 1 mmol/L albo po 1000 µmol/L | Około 0,606442437247368 mg/mg; identyczna wartość. |
| Mg 24,305 mg/L, Ca 40,078 mg/L lub odpowiednio 2,4305 i 4,0078 mg/dL | Ten sam wynik jak przy 1 mmol/L obu pierwiastków. |
| Gotowe 0,5 mg/mg / 0,5 mmol/mmol | Odpowiednio 0,5 / około 0,303221218623684 mg/mg; niezamienne skale. |
| Mg 0, Ca 2 / Mg pusty / Ca 0 / każdy lub oba operandy ujemne | Neutralne liczbowe zero / brak liczby / błąd mianownika / błąd bez zapisu. |
| Mg 0,00001 mg/L, Ca 1 mmol/L | Około 2,49513448774889×10⁻⁷ mg/mg, nie 0,000 i nie zapisane zero. |
| Mg 1e308 mg/L, Ca 1e308 mmol/L | Około 0,024951344877489 mg/mg; przepełnienie pośrednie nie daje zera. |
| Mg 1e−300 mg/L, Ca 1e100 mmol/L | Brak zapisywalnego dodatniego wyniku zamiast pozornego zera. |
| Gotowy raport z `<`, `≤`, `>` lub `≥` | Operator, liczba i skala zachowane; brak fikcyjnego dokładnego punktu. |
| Znane różne próbki → gotowy raport → zapis → edycja → stężenia | Gotowy raport dostępny, przeciwny fakt zachowany, stężenia nadal zablokowane. |
| Dawne 0,25 po zmianie silnika / jawna edycja dawnych operandów | READ nadal 0,25 / nowe obliczenie około 0,249513448774889, z tym samym ID. |
| Brak normy w Badaniach, Notatkach, historii i raporcie | Neutralne „Brak zakresu”; brak „W zakresie” i fałszywego koloru prawidłowości. |

Wymagane regresje obejmują jednostki i aliasy, skończoność operandów, dokładność i zaokrąglenie, znak, operatory, materiał i niespójne migawki, zwykły odczyt bez silnika, świadomą edycję, projekcje zapisu, desktop/mobile oraz rzeczywistą instalację i aktualizację offline. Rozszerzenie o normy lub inną próbkę wymaga ponownego przeglądu pełnych źródeł i akceptacji właściciela.
