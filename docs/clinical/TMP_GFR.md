# TmP/GFR i TRP — zakresy wieku oraz monitorowanie burosumabu w XLH

Stan odczytu źródeł: **26.10.2026**. Zakres: `TMP_GFR`, cztery
stężenia w sparowanej próbce krwi i moczu, pomocnicze TRP i FEPO₄,
porównanie z właściwym zakresem oraz opcjonalny kontekst leczenia XLH.

Właściciel zaakceptował
[makietę desktop/mobile](https://vilda-tmp-gfr-burosumab-20261026.maciej-flader.chatgpt.site/po.html)
z TRP w głównej karcie i niezależnym kolorem fosforanów. Następnie
zlecił sprawdzenie kombinacji komunikatów monitorowania przed kodowaniem.
Audyt ujawnił, że automatyczne określanie wzrostu jako możliwej poprawy
mogło obejmować także przekroczenie normy TmP/GFR. Wdrożenie opisuje
kierunek zmiany, zachowując osobną ocenę aktualnych fosforanów i konkretne
ograniczenia porównania. Akceptacja zakresu i testy techniczne nie są
nową walidacją kliniczną metody.

## Liczba, metoda i jednostki

Po uzgodnieniu jednostek obu oznaczeń tego samego analitu:

- `FEPO₄ = U_P × S_Cr / (S_P × U_Cr)`;
- `TRP = 1 − FEPO₄`;
- metoda bezpośrednia Brodehla: `TmP/GFR = S_P × TRP`;
- metoda Waltona–Bijvoeta/Payne’a: przy `TRP ≤0,86` jak powyżej,
  a przy `TRP >0,86`: `TmP/GFR = S_P × (0,3 × TRP) / (1 − 0,8 × TRP)`.

Zachowano dotychczasowy wybór metody w aplikacji: **wiek <19 lat —
Brodehl; wiek ≥19 lat — Walton–Bijvoet/Payne**. To reguła doboru metody,
nie przedział wieku źródła GPN. Nie przenosi się zakresu z innego wzoru
nawet wtedy, gdy obie gałęzie dla małego TRP dają tę samą liczbę.
Zmiana metody może sama zmienić wynik; nie jest zmianą odpowiedzi na lek.

Przykład syntetyczny: S_P=1 mmol/L, U_P=5 mmol/L, S_Cr=100 µmol/L,
U_Cr=10 mmol/L daje TRP=95%. Bezpośrednio TmP/GFR=0,95 mmol/L,
a wzór skorygowany daje 1,1875 mmol/L. Zmiana wieku z 18,99 do 19 lat
nie może w historii stać się informacją o poprawie o 25%.

Fosforany przyjmują mmol/L lub mg/dL; stosuje się przelicznik
**1 mmol/L = 3,097 mg/dL**. Kreatynina: mg/dL, µmol/L lub mmol/L;
**1 mg/dL = 88,4 µmol/L = 0,0884 mmol/L**. To nie molowa masa
całego anionu PO₄. Wynik główny TmP/GFR ma mmol/L, TRP i FEPO₄ — %.

S_P, S_Cr i U_Cr muszą być dodatnie; U_P może wynosić dokładnie zero,
co daje FEPO₄=0 i TRP=100%. Puste pole nie jest zerem. Nierówności
raportu, np. `<0,1`, nie stają się dokładnym stężeniem. Ujemne liczby,
nieznane jednostki, wartości nieskończone oraz niespójne TRP poza
0–100% nie dają zapisywalnego wyniku. Nie obcina się ich do granic.
Klasyfikacja używa wartości przed formatowaniem, z ochroną wyłącznie
przed binarnym szumem arytmetyki; zaokrąglenie do dwóch miejsc nie
ustanawia nowego pasma prawidłowości.

Wiek służy doborowi metody i odniesienia i jest pobierany z bieżącego
kontekstu pacjenta. Nie należy zgadywać pediatrycznej lub dorosłej
metody przy nieznanym wieku. Masa, wzrost, BSA, objętość moczu i czas
zbiórki nie są dodatkowymi polami tego obliczenia.

## Próbki i znane fakty

Uproszczony formularz nie wymaga ponownego potwierdzania trzech pytań
o porannym moczu, sparowaniu i nocnym poście. Przy braku sprzecznych
faktów prezentuje jawne założenie sparowanych oznaczeń i stabilnej
czynności nerek bez podejrzenia AKI. Założenie nie staje się zapisanym
potwierdzeniem pacjenta.

Preferowane są poranne, sparowane próbki pobrane zgodnie z tym samym
protokołem w kolejnych badaniach. Podczas monitorowania burosumabu
fosforany surowicy ocenia się na czczo. Nie wymaga się nocnego postu
u każdego dziecka: GPN dopuszcza bezpośrednie obliczenie także bez postu,
a pediatryczne IWG opisuje preferowane poranne pobranie po 2–3 godzinach
postu. Z tych zaleceń nie wyprowadza się nowego arbitralnego limitu
odstępu pomiędzy próbkami dla całego kalkulatora.

Znana różna próbka moczu lub niesparowana krew ma pierwszeństwo przed
założeniem i blokuje obliczenie. Znane AKI, szybko zmieniająca się
kreatynina lub PChN pozostają istotnym kontekstem; nie można z nich
wyprowadzić automatycznej oceny skuteczności burosumabu. Samo zwiększone
stężenie kreatyniny nie rozpoznaje AKI lub PChN. Znana PChN nie oznacza
automatycznie ciężkiej niewydolności nerek. Nie dodaje się rutynowej
ankiety o te stany, a wcześniejszych sprzecznych danych nie usuwa się
przy uproszczeniu interfejsu.

## Mapa odniesień TmP/GFR

Zakresy są wersjonowanymi danymi przekazywanymi do silnika. Wybór źródła
zależy od metody i wieku, nigdy od tego, które odniesienie da korzystniejszą
ocenę. Porównanie ma charakter orientacyjny względem wskazanego źródła;
nie potwierdza metody próbki ani lokalnej walidacji laboratorium pacjenta.

GPN, tabela metody **bezpośredniej** (mmol/L):

| Wiek w źródle | Zakres | n |
|---|---:|---:|
| 0–5 miesięcy | 1,02–2,00 | 41 |
| 6–12 miesięcy | 1,13–1,88 | 10 |
| 1–5 lat | 1,05–1,78 | 54 |
| 6–12 lat | 0,97–1,64 | 62 |
| 13–15 lat | 0,91–1,68 | 27 |
| ≥16 lat i dorośli | 0,84–1,23 | 16 |

GPN nie podaje osobnych zakresów dla płci ani stadium pokwitania.
W aplikacji ostatni wiersz dotyczy jedynie wieku 16–<19 lat, ponieważ
później zmienia się metoda. Nie jest to stwierdzenie, że GPN wyklucza
dorosłych. Zakresów GPN nie przedstawia się jako nowej harmonizacji
IDMS. Wcześniactwo nie ma w tej tabeli odrębnie zweryfikowanego profilu.

Etykiety 6–12 miesięcy i 1–5 lat nakładają się w 12. ukończonym miesiącu.
Przy wieku 12–<13 miesięcy pokazuje się oba odniesienia bez arbitralnego
wyboru jednego przedziału lub wspólnego werdyktu. To zachowawcza reguła
aplikacji dla niejednoznaczności tabeli. Nie należy przedstawiać granic
wieku zapisanych w całych miesiącach/latach jako precyzyjnych punktów
wyznaczonych przez autorów z dokładnością do dnia.

Dla metody **Waltona–Bijvoeta/Payne’a** stosuje się osobny profil
**AACB–ANZBMS 2025: wiek >19 lat, 0,70–1,35 mmol/L, obie płcie**.
Tabela 1 źródła zapisuje dosłownie `>19`, a wcześniejszy przedział
kończy na `<19`; dokładnie 19 lat oraz zapis wieku, którego niepewność obejmuje tę
granicę, pozostają bez automatycznej normy tego profilu. Nie zamieniono nierówności źródła na `≥19` przez domysł.
Publiczny kalkulator ANZBMS nie dostarczył niezależnego rozstrzygnięcia
tej granicy; wymaga formularza serwerowego z CAPTCHA.

Profil AACB–ANZBMS jest harmonizowany dla oznaczeń kreatyniny zgodnych
z IDMS. W źródle wykazano zależność od platformy analitycznej, zwłaszcza
możliwe zawyżenie przy Ortho/Vitros, oraz ograniczenia innych niewłączonych
platform. Porównanie w aplikacji jest orientacyjne, bez deklarowania
potwierdzonej platformy próbki. Pediatryczne przedziały AACB–ANZBMS nie
są przypinane do Brodehla. Brak osobnej górnej granicy wieku w tabeli
nie dowodzi niezależnej walidacji osób w każdej dekadzie starości.

Dostępne są także starsze zakresy Payne’a przytoczone w GeneReviews,
z wydzielonymi grupami wieku i płci oraz lukami między nimi. Nie miesza
się ich z profilem AACB–ANZBMS, nie interpoluje luk i nie traktuje jako
zamiennika GPN. Brak normy w określonym przypadku oznacza ograniczenie
skonfigurowanego pokrycia, nie nieistnienie wszystkich norm w literaturze.

## Fosforany w surowicy i TRP

Mayo PHOS, zakresy źródłowe w mg/dL:

| Płeć | Wiek | Zakres |
|---|---|---:|
| M | 1–4 lata | 4,3–5,4 |
| M | 5–13 lat | 3,7–5,4 |
| M | 14–15 lat | 3,5–5,3 |
| M | 16–17 lat | 3,1–4,7 |
| F | 1–7 lat | 4,3–5,4 |
| F | 8–13 lat | 4,0–5,2 |
| F | 14–15 lat | 3,5–4,9 |
| F | 16–17 lat | 3,1–4,7 |
| Obie płcie | ≥18 lat | 2,5–4,5 |

Brak zakresu poniżej 12 miesięcy. Metoda katalogu: fotometryczna.
Wyświetlenie w mmol/L używa /3,097, a granice porównuje się przed
zaokrągleniem. Przy nieznanej płci pojedynczy przedział można dobrać
tylko tam, gdzie zakresy obu płci są identyczne. Źródło nosi opis
„Porównanie orientacyjne wg Mayo”. Nie dodaje się pola do przepisywania
normy laboratorium ani ponownego oznaczania znanego już stężenia.

**TRP 85–95%** z GPN jest zakresem orientacyjnym, bez podziału wieku.
TRP pozostaje neutralnym, mniejszym wynikiem w tej samej karcie.
Prawidłowe TRP nie wyklucza nerkowej utraty fosforanów, szczególnie przy
hipofosfatemii; wysokie TRP może odpowiadać odpowiedniej reabsorpcji
przy małym stężeniu fosforanów. Dlatego nie tworzy się automatycznego
czerwonego werdyktu dla TRP >95% ani etykiety skuteczności leczenia.
FEPO₄ i wzory pozostają w Szczegółach.

## Monitorowanie burosumabu: znaczenie i komunikaty

Opcja **„Monitorowanie burosumabu · XLH”** jest domyślnie wyłączona;
brak odpowiedzi nie potwierdza nieleczenia. Dodaje jedno opcjonalne pole:
liczbę dni od ostatniej dawki do pobrania. Nie zakłada się 14 dni ani
stosowania leku na podstawie samego rozpoznania lub wyniku.

Aktualna ChPL opisuje w XLH kontrolę fosforanów na czczo około dwóch
tygodni po dawce. Ta sama liczba dni nie znaczy u wszystkich pacjentów
„tuż przed kolejną dawką”: schematy dzieci i dorosłych mogą się różnić.
Moduł nie ustala dawki, terminu wstrzymania lub wznowienia leczenia.
Aktualne wskazanie EMA obejmuje XLH od 1. miesiąca życia; nie utrwala
się starszego ograniczenia ≥1 rok jako blokady wyniku.

Źródła traktują odpowiedź jako ocenę biochemiczną i kliniczną. Nie ma
uniwersalnego progu przyrostu TmP/GFR oznaczającego skuteczność.
Pojedynczy wynik poniżej normy nie przesądza o niepowodzeniu, a wynik
wyższy lub prawidłowy nie zastępuje oceny kości, objawów i ALP.
U dzieci notka dotyczy również wzrastania i krzywicy; u dorosłych —
bólu, sprawności i gojenia zmian osteomalacyjnych.

| Fosforany obecnie | Znaczenie komunikatu podczas monitorowania |
|---|---|
| Powyżej zakresu | Konieczna ocena bezpieczeństwa leczenia; wyższy TmP/GFR nie oznacza większej skuteczności. Lokalny czerwony alert działa także bez historii. |
| Poniżej zakresu | Fosforany pozostają obniżone; sam ten wynik nie przesądza o nieskuteczności. |
| W zakresie | Fosforany mieszczą się w zastosowanym odniesieniu; nie jest to pełna ocena skuteczności. |
| Brak dopasowanego zakresu | Nie określa się osiągnięcia celu leczenia lub bezpieczeństwa na podstawie tego porównania. |

W każdej gałęzi TmP/GFR zachowuje niezależną ocenę. TmP/GFR ponad normą
nie jest dodatkowym celem leczenia; norma TmP/GFR nie kasuje niskich
lub wysokich fosforanów. Brak normy TmP/GFR nie kasuje dostępnego
ostrzeżenia o wysokich fosforanach. Nie tworzy się arbitralnej liczbowej
strefy „dolna część normy” ani osobnej normy podczas terapii.

### Porównanie z historią

Historia pochodzi wyłącznie od bieżącego zapisanego pacjenta.
Najstarszy wpis nie jest automatycznie pomiarem sprzed leczenia.
Porównanie wymaga zgodnej metody, znanego czasu pobrania względem dawki,
odpowiedniej chronologii i zachowanego kontekstu leczenia. Nowszy,
edytowany własny wpis lub dane innego pacjenta nie stają się poprzednim
pomiarem. Zapis legacy bez tych danych nie stanowi dowodu zgodności.

| Przypadek | Zachowanie |
|---|---|
| Brak wcześniejszego pomiaru | Zachowaj wynik, opisz możliwość porównania z kolejnymi zapisami; nie deklaruj stanu przed leczeniem. |
| Brak metody, czasu lub kontekstu leku w dawnym zapisie | Konkretny brak danych do porównania, bez fikcyjnego poprzednika. |
| Inna metoda | Nie oceniaj różnicy jako zmiany odpowiedzi na lek. |
| Różny lub nieznany czas od dawki | Nie oceniaj różnicy jako poprawy lub pogorszenia odpowiedzi. |
| Zgodne warunki techniczne porównania | Pokaż rzeczywiste liczby, daty i opisowy kierunek zmiany; sama różnica nie rozstrzyga o skuteczności. |
| Równa liczba | „Ta sama wartość”, bez diagnozy stabilności całej choroby. |

Równy znany odstęp od dawki jest konserwatywną regułą prezentacji
aplikacji, nie zwalidowanym klinicznie oknem skuteczności. Nie dopisuje
się arbitralnej tolerancji ±dni ani procentowej „minimalnej poprawy”.
Zmiana dawki, schematu, wieku lub warunków pobrania może nadal wpływać
na wynik. Ostrzeżenie o hiperfosfatemii nie nadpisuje komunikatu o
nieporównywalnej metodzie lub czasie — obie informacje zostają dostępne.

## Zapis, odczyt i edycja

Jeden zapis główny reprezentuje TmP/GFR. TRP, FEPO₄, stężenia, wiek,
płeć, metoda, protokół, źródło i wersja normy, założenia, zachowane fakty
oraz kontekst burosumabu są częścią tego samego zamrożonego obliczenia.
Pomocnicze TRP nie tworzy drugiego niezależnego wyniku pacjenta.

Historia odtwarza ocenę z dnia zapisu, bez dzisiejszych norm i wieku.
Zmiana bieżącego pacjenta nie podmienia kontekstu dawnych wyników.
Edycja musi przeliczyć liczbę i zbudować zgodny snapshot; nie wolno
zostawić dawnej oceny przy zmienionych wejściach. Dawny wpis bez metody
nie dostaje jej przez zgadywanie na podstawie aktualnego wieku.
Serie różnych metod nie tworzą jednego trendu odpowiedzi na lek.

## Źródła i granice odczytu

Pełnych publikacji nie kopiuje się do repozytorium. Poniżej podano
lokalizatory i rzeczywisty zakres weryfikacji:

1. **GPN, Haffner D, Schnabel D.**
   [Measurement of TmP/GFR](https://gpn.de/service/tmp-gfr-calculator),
   autorstwo 2021, datownik strony 23.05.2024; pełna strona odczytana
   26.10.2026. Sekcje Procedure, Reference values, Formula, Interpretation.
   Nie odczytano niezależnie pełnych pierwotnych prac Brodehla, Alona i
   Starka cytowanych przez stronę. Dane służą profilowi bezpośredniemu.
2. **Barth JH, Jones RG, Payne RB.** *Calculation of renal tubular
   reabsorption of phosphate: the algorithm performs better than the
   nomogram.* Ann Clin Biochem. 2000;37:79–81.
   [DOI i pełny PDF](https://journals.sagepub.com/doi/pdf/10.1258/0004563001901371).
   Odczytano wszystkie trzy strony; równanie i warunek TRP na s. 79.
   Badanie porównuje odczyt nomogramu z algorytmem, nie tworzy nowego
   kompletnego zakresu wieku ani progu odpowiedzi na burosumab.
3. **Chiang C i wsp.** *Harmonized Tubular Maximum Phosphate reabsorption
   per Glomerular Filtration Rate reporting in adults and children in
   Australia and New Zealand.* JBMR Plus. 2025;9(Suppl 5):v94–v100.
   [DOI 10.1093/jbmrpl/ziae140](https://doi.org/10.1093/jbmrpl/ziae140),
   [pełny tekst](https://academic.oup.com/jbmrplus/article/9/Supplement_5/v94/7888801),
   [PMC12723803](https://pmc.ncbi.nlm.nih.gov/articles/PMC12723803/).
   Odczytano pełny tekst końcowy, tabelę 1, równania oraz dyskusję
   ograniczeń. Wdrożony wiersz: >19 lat; źródło obejmuje harmonizację
   i lokalną weryfikację retrospektywną, nie prospektywną walidację Vilda.
4. **Mayo Clinic Laboratories, PHOS.**
   [Phosphorus (Inorganic), Serum](https://www.mayocliniclabs.com/test-catalog/Overview/8408),
   pełny katalog odczytany 26.10.2026: Reference Values, Cautions,
   Method Description. Cytowanej instrukcji Roche 10/2023 nie odczytano
   niezależnie. Dobór według wieku i płci, porównanie orientacyjne.
5. **EMA, Crysvita.**
   [Aktualny angielski SmPC](https://www.ema.europa.eu/en/documents/product-information/crysvita-epar-product-information_en.pdf),
   odczyt 26.10.2026; sekcje 4.1–4.4 i 5.2 właściwe dla XLH.
   Nie przedstawia się próby odczytu polskiego PDF jako przeczytania go.
   Wskazanie i bezpieczeństwo są odrębne od wyliczenia TmP/GFR.
6. **Haffner D i wsp.** *Clinical practice recommendations for the
   diagnosis and management of X-linked hypophosphataemia.* 2025.
   [DOI 10.1038/s41581-024-00926-x](https://doi.org/10.1038/s41581-024-00926-x),
   [pełny PDF](https://xlhuk.org/wp-content/uploads/2025/01/Clinical-practice-recommendations-XLH.pdf).
   Pełny tekst, zwłaszcza Box 3, 4, 6 i 21 oraz Management of burosumab.
   Brak uniwersalnego progu zmiany; ocena wieloparametrowa i zależność
   od czasu pobrania. Nie przeniesiono zaleceń dawkowania do kalkulatora.
7. **Ali DS i wsp., IWG.** *X-Linked Hypophosphatemia Management in
   Children: An International Working Group Clinical Practice Guideline.*
   JCEM. 2025;110:2055–2070.
   [DOI 10.1210/clinem/dgaf093](https://doi.org/10.1210/clinem/dgaf093),
   [PMC12187519](https://pmc.ncbi.nlm.nih.gov/articles/PMC12187519/).
   Odczytano zindeksowane rozdziały Initial assessment, Follow-up i
   Treatment recommendations; bezpośredni PMC okresowo zwracał CAPTCHA.
   Zalecenia pediatryczne, nie zastępcza norma TmP/GFR dorosłych.
8. **GeneReviews, Laurent MR i wsp., aktualizacja 14.12.2023.**
   [Tabela 1, zakresy TmP/GFR](https://www.ncbi.nlm.nih.gov/books/NBK83985/table/rickets-xlh.T.agerelated_normal_range_of/),
   pełna tabela i przypis odczytane. Wtórne zestawienie Payne 1998;
   pełnej pracy Payne’a nie uznano przez to za przeczytaną. Źródło
   porównawcze mapy pokrycia, bez mieszania tych norm z profilem ANZ.

## Kontrakt modułów produkcyjnych

`clcr_tmp_gfr_reference_data.js` udostępnia jawny profil
`TMP_GFR_GPN_MAYO_2026_10`, wersja 1, przez
`VildaClcrTmpGfrReferenceData.DEFAULT_POLICY`. Profil zawiera osobne
zakresy metod GPN i AACB–ANZBMS, normy fosforanów Mayo, orientacyjne
TRP oraz źródła i treści komunikatów. Nazwa identyfikatora zachowuje
pierwotny skrót profilu; jego populacja i źródła opisują także ANZ.

`VildaClcrTmpGfr` w `clcr_tmp_gfr.js` rozdziela:

- `inputFromValues` i `readInputFromDocument`: odczyt istniejącego
  formularza, kontekstu wieku oraz zachowanych faktów;
- `compute(input)`: konwersje, walidacja, TRP, FEPO₄ i właściwa metoda;
- `evaluate(input, policy, options)`: osobne odniesienia, kolory,
  ograniczenia oraz porównanie z wcześniejszym snapshotem;
- `compareTreatment`: opis stanu i zgodności porównania, bez dawkowania
  i bez nowego progu skuteczności.

Snapshot ma schemat `clcr-tmp-gfr`, `version:1`, `engineVersion:1`.
Statusy TmP/GFR i fosforanów (`below`, `within`, `above`, `unassessed`)
są niezależne. `outOfRange:null` oznacza brak aktywnego odniesienia,
a nie prawidłowość. `referenceAlternatives` zachowuje różne zakresy
zamiast sklejania ich w jeden. `trpResult` pozostaje neutralny.
`treatment.comparisonAllowed` dotyczy porównania opisanego regułami
modułu; nie jest zgodą kliniczną na terapię ani oceną jej skuteczności.
`reason`, `trendMessage`, `message`, `cautions` i `limitations` mają
odrębne role, tak aby jeden alert nie kasował innych istotnych informacji.

`ClcrTmpGfrUi` renderuje obliczoną ocenę zamiast dobierać własne progi.
`ClcrTmpGfrPersistence` wiąże tę ocenę z istniejącym zapisem Badań,
historią i edytorem; nie jest migracją sejfu ani nowym miejscem zapisu.

## Syntetyczne kontrakty regresyjne

Dla 10-letniego chłopca, U_P=20 mmol/L, U_Cr=5 mmol/L,
S_Cr=50 µmol/L:

| S_P mmol/L | TmP/GFR mmol/L | TRP | Oczekiwane znaczenie |
|---|---:|---:|---|
| 1,10 | 0,90 | 81,8% | TmP/GFR i fosforany niskie; brak werdyktu nieskuteczności. |
| 1,17 | 0,97 | 82,9% | Dolna granica TmP/GFR; binarne 0,969999… nie tworzy fałszywego odchylenia. |
| 1,40 | 1,20 | 85,7% | Oba parametry w zastosowanych zakresach, bez automatycznego werdyktu skuteczności. |
| 1,80 | 1,60 | 88,9% | TmP/GFR w normie; czerwone tylko fosforany i uwaga terapii. |
| 1,90 | 1,70 | 89,5% | TmP/GFR ponad normą, fosforany wysokie; brak tekstu o poprawie. |

Dodatkowe przypadki obejmują: zgodne jednostki, zero U_P, niepoprawne
wejścia i TRP, granice wieku i normy, nieznaną płeć, niemowlę bez normy
Mayo, niejednoznaczny 12. miesiąc i dokładnie 19 lat, wysokie TmP/GFR
przy prawidłowych fosforanach, zmianę metody w historii, brak lub różny
czas od dawki, brak historii i starszy niepełny zapis, edycję własnego
pomiaru, zmianę pacjenta oraz znane AKI/PChN. Testy mają wywoływać
rzeczywisty silnik i zapis produkcyjny. Odczyt zapisanej oceny nie może
wymagać wywołania dzisiejszego silnika. Wyniki faktycznych wykonań testów,
PWA, CI i identyfikator PR podaje przekazanie pracy, nie ten dokument.
