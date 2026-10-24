# Ox/Cr — polityka odniesień, jednostek i zapisu

Wersja polityki: 1, 24.10.2026. Zakres: `OxCr_spot`.
Właściciel zaakceptował [makietę przed/po desktop/mobile](https://vilda-oxcr-audyt-20261024.maciej-flader.chatgpt.site)
i proponowany dobór źródeł 24.10.2026. Scalenie i wdrożenie pozostają
decyzją właściciela. [Przegląd pełnych źródeł i ograniczeń](SOURCE_REVIEW.md)
nie stanowi nowej walidacji klinicznej.

## Dane, silnik i automatyczny wybór źródła

Normy i reguły wyboru są wersjonowanymi danymi w
`clcr_oxcr_reference_data.js`. `VildaClcrOxcr.evaluate(input, policy)`
w `clcr_oxcr.js` przyjmuje politykę jako argument. Wynik niesie wybrany
profil, jego wersję, źródło, populację, charakter odniesienia i ograniczenia.
Renderer nie ma własnych progów. Formularz nie wymaga wyboru publikacji.

| Kontekst | Przyjęte odniesienie |
|---|---|
| Brak poprawnego wieku | Poprawna liczba bez normy; konkretny komunikat o wieku; `outOfRange:null`. |
| Dokładny wiek <1 miesiąca | Poprawna liczba bez normy noworodkowej; bez zastępczego profilu dorosłych. |
| 1 miesiąc ≤ dokładny wiek ≤17 lat | Fimlab v2.1, górny P95 w natywnej osi µmol/mmol. |
| Dokładny wiek >17 lat | Osobny Newcastle NHS, orientacyjny dwustronny zakres 2–83 µmol/mmol. |
| Jawny bieżący kontekst wcześniaczy | Poprawna liczba bez nieopracowanego odniesienia; nie podstawia się wieku skorygowanego. Sam dawny wywiad u starszego dziecka nie oznacza bieżącej populacji wcześniaczej. |
| Jawnie znana próbka ze zbiórki czasowej lub DZM (`sampleType:timed`) | Poprawna liczba bez normy dla próbki punktowej; powód `unsupported-sample-type`. |
| Nieznana postać analitu przy wyniku masowym | Poprawny iloraz w jednostce masowej, brak konwersji do SI i brak porównania z molową normą. |

Dla Fimlab pasma aplikacji to 1–<6 mies. ≤220; 6–<12 mies. ≤170;
1–<2 lat ≤130; 2–<3 lat ≤100; 3–<5 lat ≤80; 5–<7 lat ≤70;
7–dokładnie 17 lat ≤60 µmol/mmol. Wszystkie górne granice wyniku są
włączone zgodnie ze źródłowym `≤`. **Nie ma źródłowej dolnej granicy**:
zero jest dopuszczalną wartością ilorazu, nie wpisem „norma od 0” ani
przesłanką rozpoznania niedoboru. Opis: „Wynik niepodwyższony” lub
„Powyżej normy dla wieku”.

Newcastle: natywne 0,002–0,083 mmol/mmol dla >12 lat, aplikacja wybiera je
dopiero >17 lat. Skala 2–83 µmol/mmol jest dokładnym przeskalowaniem ×1000.
Oba końce wyniku są włączone jako **jawna konwencja aplikacji**. Nie dodano
nieopublikowanego maksymalnego wieku lub podziału według płci. Niskie wyniki
oznacza się „Poniżej zakresu laboratoryjnego”, bez sugerowania niedoboru.
Zmiana źródła po 17 latach nie jest biologiczną krzywą: nie interpoluje się
między 60 a 83 i nie ukrywa odrębnego pochodzenia norm.

## Minimalne wejście i znane fakty

Domyślne, pierwsze **„Oblicz ze stężeń”** wymaga szczawianów i kreatyniny
w moczu z jednostkami. **„Gotowy wynik Ox/Cr”** jest drugim trybem i wymaga
jednego wyniku z jednostką oraz znakiem, jeśli laboratorium go wydrukowało.
Wiek jest pobierany ze znanych danych pacjenta i służy wyłącznie do normy.

Nie wymaga się płci, masy, wzrostu, BSA, krwi, objętości ani czasu DZM,
porannej próbki, bycia na czczo, wywiadu kamicy ani potwierdzeń AKI/IFCC.
Nie dodaje się osobnego pytania o postać szczawianów w trybie molowym.
W trybie masowym postać jest częścią tego samego selektora jednostki,
z czytelnym opisem wybranej postaci pod kontrolką.

Wspólna próbka jest opisanym założeniem przy braku przeciwnych danych.
Znane różne próbki blokują iloraz stężeń, ale nie niezależny gotowy raport.
Znana zbiórka czasowa lub DZM pozostawia iloraz liczbowy, ale nie otrzymuje
normy dobranej dla próbki punktowej. Dotyczy to również gotowego raportu,
jeśli jego rodzaj próbki jest jawnie znany. Nie dodaje się nowego pytania:
ta reguła wykorzystuje istniejący kontekst i zachowuje znaną sprzeczność.
Znane informacje o próbce, lekach i czynnikach zostają w kontekście;
brak odpowiedzi nie potwierdza ich nieobecności. Nie stosuje się nieopisanych
korekt liczby i nie przenosi automatycznie blokad ACR/PCR. Nie dopisuje się
zgodności metody laboratoryjnej, porannego pobrania ani prawidłowego pH.

## Osie jednostek

Oś porównania `r` to **µmol szczawianów/mmol kreatyniny**. Przyjmuje się
stałe aplikacji: jon szczawianowy `M_Ox=88.019`, kwas szczawiowy bezwodny
`M_Ox=90.0349`, kreatynina `M_Cr=113.12 mg/mmol`. Stała 88,019 jest jawnym
przybliżeniem aplikacji, nie dokładną wartością bieżącego ChEBI 88,018.
Nie miesza się ich ze starszym zaokrąglonym przelicznikiem Cr 88,4 ani
z katalogowym Fimlab 11,11 µmol/mg.

| Gotowa jednostka | Wartość `r` w µmol/mmol |
|---|---|
| µmol/mmol lub mmol/mol | `x` |
| mmol/mmol lub mol/mol | `1000 × x` |
| mg/mg | `1000 × x × M_Cr / M_Ox` |
| mg/g kreatyniny | `x × M_Cr / M_Ox` |
| mg/mmol kreatyniny | `1000 × x / M_Ox` |

Jednostki masowe zachowują podstawę `ion`, `acid` lub `unknown` w modelu,
nie tylko skrócone mg/mg widoczne przy liczbie. Dla `unknown` nie wyznacza
się `r`; przeskalowania samej masy, np. mg/g ↔ mg/mg, zachowują tę samą
nieznaną podstawę. Dla stężeń masa/masa stosuje się wspólną objętość:
`q[mg/mg] = Ox[mg/L] / Cr[mg/L]`. Ox mg/dL ×10 daje mg/L, a Cr mg/dL ×10
daje mg/L. Cr molowe można przeliczyć na masę niezależnie od postaci Ox.

Dla molowych stężeń `r = Ox[µmol/L] / Cr[mmol/L]`.
Ox mmol/L ×1000 daje µmol/L; Cr µmol/L ÷1000 daje mmol/L.
Dla masowego Ox: `Ox[µmol/L] = 1000 × Ox[mg/L] / M_Ox`.
Wynik ze stężeń molowych jest prezentowany w µmol/mmol, ze stężeń
masowych w mg/mg; gotowy wynik zachowuje jednostkę i zapis wejściowy.
Norma na karcie ma tę samą jednostkę co wynik. Granice po konwersji mogą
być oznaczone `≈`, ale ocena pozostaje w pełnej natywnej osi SI.

## Zero, precyzja i nierówności

Puste pole nie jest zerem. `Ox=0` przy `Cr>0` daje poprawną liczbę 0;
`Cr=0`, liczby ujemne, NaN lub Infinity są błędnymi danymi. Kreatynina
ma tę samą kwalifikację niezależnie od jednostki: nie pozostaje surowy
limit 50 000 µmol/L blokujący wynik równoważny dopuszczonemu mg/dL.
Mały dodatni wynik nie może zostać wyświetlony lub zapisany jako zero.

Ocena poprzedza zaokrąglenie. Do porównania używa się dokładnych ułamków
dziesiętnych wejścia i zadeklarowanych stałych; nie stosuje się epsilona
przesuwającego próg. Formatowanie zwiększa potrzebną precyzję lub ujawnia
granicę, jeżeli zaokrąglony tekst przeczyłby ocenie. Zapis nie formatuje
ponownie wyniku do dwóch lub trzech miejsc dziesiętnych.

Znaki `<`, `≤`, `>` i `≥` są obsługiwane dla **gotowego ilorazu** jako
przedziały nieujemnej wielkości. Nie oznaczają dokładnego punktu.
Stężenia z nierównością wymagają osobnego rachunku przedziałowego i nie
są przedstawiane jako zwykły iloraz dwóch granic.

| Raport i profil | Ocena całego przedziału |
|---|---|
| Dziecko, P95 ≤60: `≤60`, `<60` | Wynik niepodwyższony. |
| Dziecko, P95 ≤60: `>60` | Powyżej normy. |
| Dziecko, P95 ≤60: `≥60` lub `<61` | Niejednoznaczne, bez jednej kategorii. |
| Newcastle 2–83: dokładnie `2` lub `83` | W zakresie laboratoryjnym. |
| Newcastle 2–83: `<2` lub `>83` | Odpowiednio poniżej / powyżej zakresu. |
| Newcastle 2–83: `≤2` lub `≥83` | Niejednoznaczne, ponieważ przedział obejmuje także włączony koniec zakresu. |

`<0` jest pustym przedziałem i jest odrzucane; `≤0` może oznaczać zero.
Dla cenzurowanego wyniku nie zapisuje się granicy jako dokładnego punktu
`valueNum` ani punktu na linii trendu.

## Jeden wynik i niezmienna historia

Jedna karta w schemacie B łączy większy wynik pacjenta z neutralnie
oznaczoną normą i jednym opisem. Odchylenia są bursztynowe, a brak oceny
neutralny. Źródło jest widoczne obok wyniku; wszystkie pasma, ograniczenia,
konwersje i rozróżnienie P95/RI są w zwiniętych Szczegółach. Dwa tryby
nie zmieniają szerokości karty. Pola mobilne mają minimum 16 px czcionki
i 48 px wysokości; odstęp pod czyszczeniem minimum 20 px.

Snapshot zapisu zachowuje co najmniej: oryginalny tekst i znak, jednostkę
z podstawą masową, stężenia źródłowe, pełną precyzję liczby, dokładność,
oś SI i wersję konwersji/stałe, wiek, znane fakty, źródło i jego wersję,
normę i ocenę z chwili zapisu. Brak porównania ma `outOfRange:null`.
Historia odtwarza zapisany stan bez ponownej oceny nowym wiekiem lub normą.
Serie o różnych jednostkach lub podstawach masowych nie łączą się.
Wspólna historia badań otrzymuje czytelną nazwę `labResult.test` z dopiskiem
podstawy dla jednostki masowej oraz odrębny `labResult.testKey` dla jonu,
kwasu albo postaci niepodanej i jednostki. Wynik SI zachowuje zwykłą nazwę,
bez dopisku postaci masowej. Pomocnik nazwy kanonicznej utrzymuje zgodność
rozpoznawania Ox/Cr przez istniejące widoki, a rozdzielenie serii nie zależy
wyłącznie od niewidocznego snapshotu lub miejscowego renderera Klirensu.
Edycja unieważnia niepasujący snapshot. Starszy wpis bez tych danych
nie otrzymuje domyślnie postaci, normy, nieznanej precyzji ani oceny.
Niepełna lub nowa sesja nie dziedziczy postaci analitu poprzedniej sesji.

## Syntetyczne kontrakty do testów funkcji produkcyjnych

| Wejście / stan | Oczekiwany wynik |
|---|---|
| 8 lat; Ox jako kwas 1 mg/dL; Cr 10 mg/dL | 0,100 mg/mg; 125,64016842358… µmol/mmol; ponad P95 ≤60, przeliczona granica masowa ≈0,0478 mg/mg. |
| 5 lat; Ox 0,350 mmol/L; Cr 5 mmol/L | 70 µmol/mmol, niepodwyższony na włączonej granicy. |
| 5 lat; gotowy 70,001 µmol/mmol | Powyżej normy, tekst nie sugeruje dokładnego 70. |
| Ox 20 mg/L, nieznana postać; Cr 100 mg/dL | 0,020 mg/mg bez SI i bez normy; podstawa pozostaje nieznana. |
| Gotowy 0,070 mol/mol / 0,070 mmol/mmol / 70 mmol/mol | Ta sama oś 70 µmol/mmol bez pytania o jon/kwas. |
| Ox 0 / pusty / mały dodatni; Cr dodatnia | Odpowiednio liczba 0 / brak wyniku / dodatnia liczba niewyzerowana przez formatowanie. |
| Wiek nieznany / <1 miesiąca / bieżąca populacja wcześniacza | Liczba z konkretnym powodem braku normy, bez dorosłego zastępstwa. |
| Jawnie znana próbka czasowa/DZM, iloraz stężeń lub gotowy raport | Poprawna liczba bez normy random; neutralne `unsupported-sample-type`, bez nowej ankiety. |
| Dokładnie 17 lat / >17 lat | Odpowiednio Fimlab ≤60 / Newcastle 2–83; jawna zmiana źródła, bez luki. |
| Zapis kwasu i jonu w tej samej jednostce, zmiana wieku, nowszy wynik bez normy | Odrębne serie podstawy masowej; dawna ocena nieprzeliczana; brak normy nie pożycza starszej. |

Testy wywołują kod produkcyjny; wyniki ich uruchomienia podaje PR.
Nie są dowodem walidacji klinicznej.
