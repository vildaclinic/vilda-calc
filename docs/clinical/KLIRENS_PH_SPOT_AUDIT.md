# pH pojedynczej próbki moczu — audyt 27 października 2026

Zakres: `pH_spot` na stronie Klirens. Właściciel zaakceptował
[makietę przed/po na desktopie i telefonie](https://vilda-urine-ph-20261027.maciej-flader.chatgpt.site)
oraz wdrożenie jej wraz z naprawą potwierdzonych błędów.
Baza audytu: `a83c87938621cfdeeb1de108878dfdb4e5de7131`, po scaleniu PR #802.
`pH24` i pozostałe obliczenia ze zbiórki dobowej pozostają odrębnym etapem.

## Wpływ kliniczny i zakres działania

To odczyt zmierzonego pH, a nie nowe równanie. Wynik otrzymuje porównanie
z jednym jawnym profilem laboratoryjnym: **Mayo PHU_, 4,5–8,0 włącznie**,
podpisanym **„Norma ogólna”**. Wcześniej karta była neutralna, bez tego
odniesienia. Wprowadzenie normy i kolorowej oceny jest zmianą kliniczną,
nie wyłącznie kosmetyczną. Wartość wpisana przez lekarza nie jest
przeliczana na inną jednostkę ani zastępowana wartością graniczną.

Wynik w tym zakresie jest turkusowy; poniżej 4,5 i powyżej 8,0 bursztynowy.
Kolor odnosi się do porównania z wybranym zakresem. Sam wynik nie rozpoznaje
ani nie wyklucza zakażenia, kwasicy cewkowej, kamicy lub zaburzeń zakwaszania
moczu. Nie ma nowego czerwonego progu pilności, oceny skuteczności leczenia
ani propozycji dawki. Liczby normy i źródło zachowują neutralne kolory.

Wymagane jest wyłącznie **pH z wyniku badania**. Nie ma jednostki fizycznej,
przełącznika jednostek ani dodatkowych pytań o wiek, płeć, masę, wzrost,
kreatyninę, stabilną czynność nerek, AKI lub IFCC. Założenia dotyczące
oszacowań filtracji i standaryzacji markerów nie są wymaganiami odczytu pH.

Dotychczasowe sześć kontrolek kontekstu było **opcjonalne i domyślnie
zwinięte**, nie stanowiło sześciu obowiązkowych pytań. Z formularza pH
znika rodzaj próbki oraz miesiączka, krwiomocz, zakażenie, wysiłek i ostra
choroba. Ich brak nie potwierdza nieobecności tych stanów. Nie usuwa się
znanych wspólnych faktów pacjenta ani informacji utrwalonych w starszym
zapisie; nie przenosi się tu komunikatów o albuminurii lub białkomoczu.

## Profil ogólny i pokrycie wieku

Mayo opisuje przypadkową próbkę moczu oraz pomiar pH-metrem. Metoda źródła
nie jest automatycznie przypisana badaniu pacjenta. Katalog pediatryczny
Mayo podaje ten sam przedział, bez rozdzielenia grup wieku lub płci.
Dlatego podpis wyniku brzmi „Norma ogólna”, a nie „Norma dla wieku”.

| Grupa | Pokrycie źródła i konsekwencja |
|---|---|
| Wiek nieznany | Dostępne ogólne odniesienie Mayo 4,5–8,0; brak obowiązkowego pytania o wiek. |
| Wcześniaki, noworodki, niemowlęta | Katalog pediatryczny podaje ten sam ogólny przedział; nie wykazano w nim odrębnej walidacji neonatalnej ani osobnej tabeli wcześniaków. Nie przedstawia się ogólnego porównania jako indywidualnej normy dla wieku ciążowego/dnia życia. |
| Dzieci przed pokwitaniem i dojrzewające | Ten sam profil katalogowy, bez norm według płci lub stadium pokwitania. |
| Dorośli i osoby starsze, obie płcie | Ten sam profil katalogowy, bez osobnego progu geriatrycznego. |

**Labcorp 013037 podaje 5,0–7,0 dla noworodków**, a następnie 4,5–8,0.
Jest to rzeczywisty przykład normy zależnej od wieku; aplikacja nie twierdzi,
że takie normy nie istnieją. Katalog nie definiuje jednak liczbowo końca
okresu noworodkowego. Nie dopisuje się do źródła granicy 28 dni ani profilu
norm o takim progu, nie wyprowadza dokładnego dnia życia z zaokrąglonego
wieku i nie buduje ukrytej hybrydy Labcorp/Mayo.

Informacja o Labcorp pozostaje w Szczegółach. Przy jawnym, znanym kontekście
noworodkowym może pojawić się przy wyniku uwaga:
„Noworodek: zakresy laboratoriów bywają węższe, np. 5,0–7,0 w Labcorp.
Uwzględnij normę na wyniku badania.” Nie zmienia ona aktywnego profilu
Mayo ani nie nadaje drugiej, sprzecznej kategorii.

Adapter może odczytać ten kontekst z wcześniej wypełnionego pola aplikacji
„dni życia noworodka” o istniejącej domenie technicznej 0–28, wyłącznie
gdy wpisano również 0 lat i 0 miesięcy. Wszystkie trzy wartości muszą być
obecne i prawidłowe. Sam wiek „0 lat” nie jest taką informacją. Ten odczyt
uruchamia tylko uwagę, nie źródłowy próg wieku lub inny zakres. Jawnie
zapisany `newbornContext` ma pierwszeństwo przed pochodnym kontekstem.

UW Medicine podaje 5,0–8,0 dla swojej metody spektrofotometrycznej od wieku 0.
To kolejny przykład różnic między laboratoriami/metodami, bez automatycznego
przełączania zakresu według tego, który daje korzystniejszy wynik.
Zakres z właściwego laboratorium i rzeczywisty kontekst nadal mają znaczenie.

## Jeden wynik i krótkie komunikaty

Karta B łączy dużą wartość pH, jej status, normę ogólną 4,5–8,0 i skalę
z widocznymi granicami. Wynik pozostaje w jednym stałym miejscu.
Komentarz jest krótki; rozwinięte ograniczenia, różnice źródeł i cele
terapii znajdują się w „Szczegółach i źródłach”.

| pH | Ocena względem Mayo | Znaczenie komentarza |
|---|---|---|
| <4,5 | Poniżej normy ogólnej | Wyraźnie kwaśny odczyn; potwierdzić odczyt i oceniać ze stanem klinicznym oraz pozostałymi badaniami. |
| 4,5–<5,5 | W zakresie normy ogólnej | Kwaśny odczyn może być prawidłowy; utrzymywanie się w kolejnych pomiarach ma znaczenie m.in. dla ryzyka złogów kwasu moczowego. |
| 5,5–<7,0 | W zakresie normy ogólnej | Kwaśny odczyn; wpływ diety i pory pobrania, ograniczenia pojedynczego pomiaru. |
| 7,0 | W zakresie normy ogólnej | Obojętny odczyn; sam nie rozpoznaje ani nie wyklucza choroby. |
| >7,0–8,0 | W zakresie normy ogólnej | Zasadowy odczyn może zależeć od diety lub leczenia; sam nie potwierdza zakażenia ani kwasicy cewkowej. |
| >8,0 | Powyżej normy ogólnej | Może towarzyszyć zakażeniu lub zmianom próbki podczas przechowywania; potwierdzić wynik i ocenić z objawami oraz badaniem ogólnym moczu. |

Podział komentarza przy 5,5 i 7,0 nie tworzy dodatkowych kategorii
prawidłowości ani rozpoznania. pH 5,0 i 7,5 nie są automatycznie nieprawidłowe.
Niskie pH nie wyklucza proksymalnej RTA ani RTA typu 4. Kryteriów RTA
opisanych dla zbiórki dobowej i drugiego porannego moczu na czczo nie
stosuje się automatycznie do dowolnej pojedynczej próbki.

Nie zakłada się, że próbka pacjenta była świeża, na czczo, druga poranna
lub oznaczona elektrodą. W Szczegółach wyjaśniono znaczenie świeżej próbki
i ograniczenia pomiaru paskowego. Dokładniejszy zapis liczby nie zwiększa
dokładności oznaczenia laboratoryjnego.

### Cele leczenia różnią się od normy

Edukacyjna część Szczegółów przywołuje EAU 2026 dla określonych sytuacji
leczenia kamicy u dorosłych: chemoliza złogów kwasu moczowego **pH 7,0–7,2**,
cystynuria **pH >7,5**. To cele terapii, nie populacyjna norma pH i nie
samodzielne zalecenie leczenia dla każdego pacjenta. Nie zmieniają koloru
głównego wyniku. Monitorowanie alkalizacji wymaga powtarzanych pomiarów
świeżego moczu oraz kontekstu; nadmierna alkalizacja może sprzyjać złogom
fosforanowo-wapniowym. Pojedynczy wpis nie wystarcza do oceny skuteczności
ani dostosowania dawki.

## Walidacja techniczna, precyzja i zapis

Formularz i edytor zapisanych badań używają tego samego technicznego
przedziału wejściowego **0–14 włącznie**. Odpowiada on skali opisanej dla
pomiaru pH; **nie jest fizjologicznym zakresem moczu ani normą**.
Skrajny zaakceptowany technicznie wynik otrzymuje odchylenie i informację
o konieczności weryfikacji. Nie jest bezwarunkowo uznawany za wiarygodny
pomiar próbki. Nie wprowadza się cichego obcięcia do 0 lub 14.

- Puste pole nie jest zerem; samo 0 jest poprawną liczbą wejściową.
- Wartość nienumeryczna, nieskończoność i wynik poza skalą są odrzucane.
- Kropka i przecinek dziesiętny oznaczają tę samą liczbę również we
  współdzielonym, dotychczasowym odczycie pH dla kontekstu DZM. Zmiana
  `5.8004` na `5,8004` nie może zmieniać dostępności przesiewowego wzorca
  EAU. Wspólny odczyt używa liczbowej walidacji `VildaClcrPh.compute`, aby
  wpis odrzucony na karcie pH (np. `15`, `0x6` lub utrata precyzji) nie
  zasilał równocześnie kontekstu DZM. Nie stosuje tam normy Mayo ani nie
  zmienia wzoru lub progów interpretacji `pH24`.
- Klasyfikacja opiera się na dokładnej zapisanej wartości przed formatowaniem.
  `4,4999` pozostaje poniżej normy, `4,5` i `8` należą do normy, a `8,0001`
  przekracza jej górną granicę. Tekst nie może ukryć tej różnicy.
- Nie dopisuje się dwóch miejsc po przecinku jako pozornej dokładności
  wyniku paskowego. Surowy wynik i jego pochodzenie są zachowane.
- Bieżąca karta, podstawowy `labResult`, zamrożona ocena, historia, eksport
  i edytor zachowują zgodną wartość; żaden czytelnik nie musi odzyskiwać
  poprawnej liczby z zaokrąglonego tekstu.

Normy i reguły komentarzy są wersjonowanymi danymi poza silnikiem.
`clcr_ph_reference_data.js` dostarcza politykę **`PH_SPOT_MAYO_2026_10`,
wersja 1**, przekazywaną do
`VildaClcrPh.evaluate(input, policy)` w `clcr_ph.js`.
Renderer `ClcrPhUi` przedstawia gotową ocenę, a `ClcrPhPersistence`
łączy ją z istniejącym modelem zapisu badania. Snapshot `clcr-ph`, wersja 1,
przechowuje wejście, surową liczbę, tekst, zakres, źródło, status,
ograniczenia i wersje użytych reguł.

Historia odczytuje zamrożoną ocenę bez ponownego liczenia dzisiejszym
silnikiem lub danymi aktualnego pacjenta. **Stary zapis bez oceny pozostaje
nieoceniony**, z `outOfRange:null`, również gdy dawny adapter ustawił
`false` wyłącznie z powodu braku klasy CSS. Taki techniczny boolean nie
potwierdza porównania z normą. Nie nadaje się historii retrospektywnie
nowego profilu Mayo. Świadoma edycja uruchamia aktualne reguły i zapisuje
nową spójną ocenę. Utraconej precyzji dawnego zaokrąglonego wyniku nie
odtwarza się z domysłu.

Zapis pozostaje dostępny wyłącznie dla wczytanej lub nowej zapisanej
karty pacjenta. Nie zmienia się modelu sejfu ani wspólnej ścieżki
edycji/usuwania w Badaniach i historii Klirensu.

## Potwierdzone problemy przed wdrożeniem

1. Formularz blokował pH >9, podczas gdy edytor akceptował wartości >0 do 14.
   Zero było traktowane jako brak danych albo odrzucane. To niespójność
   walidacji technicznej, nie dwa różne zakresy normy.
2. Neutralny wynik bez normy mógł mieć `outOfRange:false` zamiast `null`.
   Audyt wykazał niespójność danych; nie wykazał automatycznego zielonego
   rozpoznania w dotychczasowym interfejsie.
3. Przy pH 4,4999 podstawowy zapis otrzymywał `valueNum:4.5`, choć snapshot
   zachowywał 4,4999. Po dodaniu normy takie zaokrąglenie mogłoby powodować
   sprzeczność między liczbą a kategorią.
4. Dodatkowe opcje nie zmieniały neutralnej głównej karty pH, lecz mogły
   uruchamiać ogólne komunikaty gotowości dotyczące albuminurii/białkomoczu.
5. Brak zakresu w poprzedniej wersji nie był błędem równania. Zastosowanie
   konkretnego źródła z jawnymi ograniczeniami jest osobną, zaakceptowaną
   zmianą interpretacji.

## Źródła, wersje i granice odczytu

Odczyt źródeł w audycie: **27.10.2026**. Katalogi laboratoryjne nie miały
numeru wydania; datą identyfikującą odczytaną wersję jest data dostępu.
Nie kopiowano pełnych publikacji do repozytorium.

1. **Mayo Clinic Laboratories, PHU_, pH, Random, Urine.**
   [Pełny katalog](https://www.mayocliniclabs.com/test-catalog/overview/606510).
   Odczytano pełną stronę, w tym **Reference Values, Clinical Information,
   Cautions, Method Description**. Przypadkowa próbka moczu, pH-metr;
   RI 4,5–8,0 bez przedziałów wieku/płci. Opisuje zakres pomiarowy 0–14,
   wpływ diety i możliwość wysokiego pH przy zakażeniu drobnoustrojami
   rozkładającymi mocznik. Nie potwierdza metody próbki konkretnego pacjenta
   ani samodzielnej wartości diagnostycznej pojedynczego wyniku.
2. **Mayo Pediatric Test Catalog, PHU_.**
   [Pełna strona](https://pediatric.testcatalog.org/show/PHU_).
   Odczytano cały katalog, zwłaszcza **Reference Values** i metodę.
   To ten sam test i RI 4,5–8,0 w katalogu pediatrycznym, nie niezależna
   publikacja walidacyjna norm wcześniaków lub noworodków.
3. **Labcorp, test 013037, pH, Urine.**
   [Pełny katalog](https://www.labcorp.com/tests/013037/ph-urine).
   Odczytano **Reference Interval, Methodology** i wymagania próbki:
   świeża przypadkowa próbka, metoda elektrochemiczna/pH-metr;
   noworodki 5,0–7,0, później 4,5–8,0. Brak liczbowej definicji końca
   okresu noworodkowego. Źródło uwagi o różnicach norm, bez automatycznego
   zakresu neonatalnego w aplikacji.
4. **UW Medicine Laboratory Test Guide, UPH, pH, Urine.**
   [Pełny katalog](https://dlmp.uw.edu/test-guide/view/UPH).
   Odczytano **Reference Range, Method, Collection**: świeża przypadkowa
   próbka, metoda spektrofotometryczna, 5,0–8,0 od wieku 0 dla obu płci
   i płci nieznanej. Źródło różnic zależnych od laboratorium/metody,
   nie drugi aktywny profil.
5. **European Association of Urology, Guidelines on Urolithiasis 2026,
   aktualizacja marzec 2026.** Odczytano odpowiednie części pełnego HTML
   i otwarto pełny PDF z potwierdzeniem wydania:
   [Metabolic evaluation and recurrence prevention](https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention),
   [Guidelines — Chemolysis](https://uroweb.org/guidelines/urolithiasis/chapter/guidelines),
   [PDF 2026](https://d56bochluxqnz.cloudfront.net/documents/full-guideline/EAU-Guidelines-on-Urolithiasis-2026.pdf).
   Właściwe lokalizatory: pobieranie próbek i pomiar pH w części ogólnej
   oceny metabolicznej; **Oral chemolysis** dla 7,0–7,2;
   **Cystine stones** dla >7,5; omówienie podejrzenia RTA przy pH zbiórki
   dobowej >6,2 i drugiej porannej próbki na czczo >5,8. Ostatnich progów
   nie wdraża się jako rozpoznania z dowolnego pojedynczego pH.
   Cele leczenia opisano dla właściwych sytuacji klinicznych u dorosłych;
   nie są normami populacyjnymi ani instrukcją dawkowania. Źródło opisuje
   też wielokrotne oznaczenia świeżej próbki, problem konserwacji kwasem
   borowym i ryzyko kamicy fosforanowo-wapniowej przy nadmiernej alkalizacji.
6. **Kwong i wsp., 2013.**
   [DOI 10.1007/s00240-013-0546-y](https://doi.org/10.1007/s00240-013-0546-y),
   [PMID 23435644](https://pubmed.ncbi.nlm.nih.gov/23435644/).
   Odczytano pełny abstrakt PubMed; pełny tekst PMC wymagał CAPTCHA,
   więc nie deklaruje się jego pełnej weryfikacji. Porównanie pomiarów
   świeżego moczu paskiem i elektrodą wykazało rozbieżności >0,5 pH
   w około jednej czwartej wyników. Wspiera ostrożność wobec pomiaru
   paskowego i pozornej dokładności, bez wyznaczania normy aplikacji.

RCPA pH urine było dostępne tylko przez indeks wyszukiwarki
([adres źródła](https://www.rcpa.edu.au/Manuals/RCPA-Manual/Pathology-Tests/P/pH-urine),
bezpośrednio HTTP 403). Nie jest podstawą wdrożonego zakresu; nie deklaruje
się odczytu pełnej strony.

## Syntetyczne kontrakty regresyjne

| Wejście lub stan | Oczekiwany wynik |
|---|---|
| pH 6,5 bez danych pacjenta | 6,5; norma ogólna 4,5–8,0, status w zakresie. Brak nowych pytań. |
| pH 6,5 u dziecka i dorosłego | Ta sama liczba i profil, bez pozornej normy dobranej według wieku. |
| pH 4,4999 / 4,5 | Dokładnie 4,4999 poniżej / 4,5 w normie; zgodne tekst, kolor i zapis. |
| pH 8 / 8,0001 | 8 w normie / dokładnie 8,0001 powyżej; bez ukrycia odchylenia przez zaokrąglenie. |
| pH 5,0 / 7,5 | Oba w zakresie Mayo; bez automatycznej diagnozy kamicy lub ZUM. |
| pH 0 / 14 | Liczbowo poprawne techniczne wejście, poza normą z uwagą weryfikacji. |
| Brak, same spacje, tekst, NaN, nieskończoność, −0,01, 14,01 | Brak poprawnego wyniku; bez cichej zamiany na 0 lub granicę. |
| pH 4,8 i jawny kontekst noworodka | Główna ocena według Mayo; uwaga o węższym Labcorp 5–7, bez mieszania profili. |
| pH 7,5, dawna informacja o zakażeniu | Fakt zachowany; brak twierdzenia, że samo pH potwierdza albo wyklucza zakażenie. |
| Stary zapis neutralny z `outOfRange:false` | Odczyt jako nieoceniony, bez dopisania normy Mayo. |
| Nowy zapis 8,0001, potem zmiana danych pacjenta | Ta sama surowa wartość, źródło i zamrożona ocena w historii/eksporcie. |
| Świadoma edycja zapisanego pH | Wspólna walidacja 0–14 i nowy spójny snapshot; brak starej oceny przy nowej liczbie. |
| Użycie pH_spot, potem pH24 | Bez zmiany zasad odrębnego obliczenia dobowego. |

Testy mają wywoływać rzeczywiste funkcje produkcyjne silnika, renderera,
zapisu i edytora, a nie kopię reguł klinicznych w teście. Sprawdzenie UI
obejmuje desktop i telefony 390/320 px, dostępność pól, odstępy, neutralny
kolor normy oraz brak poziomego przewijania. Zmiana zasobów wymaga testu
instalacji/aktualizacji PWA i ponownego uruchomienia offline. Używane są
wyłącznie fikcyjne przypadki, bez otwierania realnego sejfu.

Regresje jednostkowe obejmują `klirens-ph-engine.test.mjs`,
`klirens-ph-ui.test.mjs`, `klirens-ph-persistence.test.mjs` oraz
`klirens-ph-session.test.mjs`; rzeczywisty formularz i ścieżki użytkownika
sprawdza `tests/e2e/klirens-ph-audit.spec.mjs`.

Sam opis testu nie potwierdza jego przejścia. Wyniki wykonań, testy offline,
CI, commit i PR podaje opis PR. Akceptacja właściciela dotyczy opisanej
polityki i zmian; testy techniczne nie stanowią walidacji klinicznej.
