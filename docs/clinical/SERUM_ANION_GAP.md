# AG surowicy bez potasu — źródła i kontrakt obliczenia

Stan źródeł i decyzja właściciela: **04.11.2026**. Właściciel zaakceptował
makietę przed/po desktop/mobile i polecił implementację.
Zakres: **`AGs` / `clcr:AGs`**, luka anionowa surowicy **bez potasu**.
Luka anionowa moczu UAG i wzory surowicze uwzględniające K pozostają odrębne.

## 1. Wpływ kliniczny i podział odpowiedzialności

Dotychczasowy wzór `Na − Cl − HCO₃` był poprawny, a formularz wymagał już
tylko trzech stężeń. Zmiana dodaje nazwany zakres referencyjny zależny od
wieku i opcjonalną korektę względem albuminy. Naprawia także walidację
edycji, prezentację małych wartości i niespójność precyzji zapisu.
Jest to zmiana kliniczna i funkcjonalna, nie wyłącznie zmiana wyglądu.
Akceptacja właściciela oraz testy nie nadają statusu walidacji klinicznej.

- `clcr_serum_anion_gap_data.js`: wersjonowany profil
  **`MAYO_ELPSR_AGS_2026_11`**, zakres, populacja, źródła i konwencja korekty.
- `clcr_serum_anion_gap.js`: bezstanowy
  `VildaClcrSerumAnionGap.evaluate(input, profile)`; profil jest argumentem,
  a brak właściwego profilu nie uruchamia ukrytej normy dorosłych.
- `clcr_serum_anion_gap_ui.js` / `.css`: formularz, jedna karta B, oś
  przyjętej normy i zwinięte Szczegóły.
- `clcr_serum_anion_gap_persistence.js`: utrwalony pomiar oraz odczyt jego
  historycznej wartości, kontekstu i oceny.

## 2. Wzór, próbka i minimum danych

`AG [mmol/L] = Na [mmol/L] − (Cl [mmol/L] + HCO₃ [mmol/L])`.

Wystarczają trzy stężenia z tego samego pobrania krwi: **sód, chlorki,
wodorowęglany / CO₂ całkowity**. Dla tych jednowartościowych jonów mEq/L
ma tę samą wartość liczbową co mmol/L; krótka uwaga zastępuje dodatkowy
selektor równoważnych jednostek. Potas nie uczestniczy w tym wariancie.

Preferowany jest ten sam panel biochemiczny. Oznaczone w nim tCO₂ służy
do obliczenia jako wodorowęglany. Przy przepisywaniu gazometrii chodzi
o **aktualne**, a nie standardowe HCO₃. tCO₂ panelu biochemicznego i HCO₃
obliczone z gazometrii nie są w każdych warunkach zamienne; zakres
przyjętego profilu pochodzi z panelu surowiczego opisanego niżej.
Źródłowa metoda nie jest ustalonym faktem o próbce konkretnego pacjenta.

Wspólne pobranie jest opisanym założeniem, bez obowiązkowego checkboxa.
Nie dodaje się pytań o AKI, stabilną czynność nerek, IFCC, pH, masę,
wzrost, płeć, laboratorium ani analizator. AG nie wymaga założenia
stabilnej czynności nerek; zaburzenia nerkowe mogą wpływać na jego wartość.
Znany wiek służy tylko dobraniu zakresu, bez kolejnego pola formularza.
Nie wprowadza się osobnego trybu przepisywania gotowego AG.

### Walidacja i precyzja

Każde stężenie musi być skończoną, nieujemną liczbą dziesiętną. Dopuszcza
się przecinek, kropkę i notację wykładniczą. Puste pole lub same białe
znaki oznaczają brak danych, nie zero. Hex, nierówność, tekst, nieskończoność
i ujemne stężenie są odrzucane także w edycji zapisanego pomiaru.

Matematyczne zero stężenia nie jest pustym polem. Dopuszczenie go w warstwie
obliczeniowej nie oznacza, że taka próbka jest fizjologicznie wiarygodna.
Nie dodaje się nieudokumentowanych granic fizjologicznych jako blokady wzoru.
Sam wynik AG może być dodatni, zerowy lub ujemny. Ujemny wynik nie oznacza
ujemnego stężenia wejściowego i nie jest automatycznie błędem obliczenia.

Odejmowanie i porównanie z granicami zachowują dokładność dziesiętnych
operandów. `140,1 − 116 − 24,1 = 0`; wyniki `0,04` oraz `−0,04` nie mogą
stać się widocznym lub zapisanym zerem. Nie stosuje się arbitralnego
epsilonu zerującego małe wyniki. Skrót prezentacyjny ma **≈** oraz pełny
zapis w Szczegółach; nie zmienia oceny. Wynik poza obsługiwaną reprezentacją
liczbową daje jawny błąd, a nie zapisywalne `Infinity` lub fałszywe zero.

## 3. Przyjęta norma i rzeczywiste pokrycie wieku

Źródło: **Mayo Clinic Laboratories, Electrolyte Panel, Serum — ELPSR**,
[pełny katalog](https://pediatric.testcatalog.org/show/ELPSR), odczyt
04.11.2026. Dokładne miejsca: **Reference Values → ANION GAP**,
**Method Description → Anion Gap**, opis próbek i metod panelu.
Katalog jawnie podaje `Na − (Cl + HCO₃)`, bez potasu.

Materiał: **surowica**. Na/Cl: pośrednia potencjometria; wodorowęglany:
fotometria. Katalog cytuje instrukcje Roche z maja 2024 i lutego 2023;
cytowanie producenta nie oznacza osobnego odczytu tych instrukcji.
Nie ujawnia tu pełnego rozkładu wieku i pochodzenia kohorty referencyjnej.

| Wiek pacjenta | Przyjęte odniesienie dla AG bez korekcji |
|---|---|
| Od ukończenia 7 lat, obie płcie | **7–15 mmol/L** |
| Poniżej 7 lat, także wcześniaki, noworodki i niemowlęta | Katalog nie ustala normy dla tej grupy; brak automatycznej oceny |
| Wiek nieznany lub nieprawidłowy | Liczba bez automatycznego porównania |

Katalog nie rozdziela AG według płci i nie podaje górnego limitu wieku.
Nie dodaje się przejścia na inną normę w 18. roku życia. Oba końce
drukowanego przedziału są włączone zgodnie z przyjętą polityką aplikacji:
`AG <7` — obniżone; `7 ≤ AG ≤15` — w przyjętej normie; `AG >15` — podwyższone.
Wiek nie jest zaokrąglany w górę do siódmych urodzin.

To **jeden nazwany profil laboratoryjny**, nie uniwersalna norma wszystkich
metod. Aplikacja nie zna wykonawcy ani analizatora badania pacjenta.
Etykieta główna brzmi **„Norma dla wieku”**, a notka
**„Przyjęty zakres; norma na wydruku może się różnić.”** Szczegóły podają
**„Źródło zakresu przyjętego w aplikacji: Mayo Clinic Laboratories”**.
Nie używa się sformułowania „W normie tego laboratorium”.

Brak właściwego wieku/profilu zachowuje liczbę i gotowość **3/3**.
Karta jest neutralna, bez osi normy i z `outOfRange:null`; podaje konkretny
powód. Dla dziecka <7 lat ograniczenie dotyczy **przyjętego źródła**,
nie oznacza twierdzenia, że nigdzie nie istnieją normy dla młodszych dzieci.
Nie pyta się o dane do „pełnej interpretacji”.

### Dlaczego nie połączono zakresów publikacyjnych?

Zakresy zależą od analityki i populacji. W przeglądzie odczytano:

| Źródło i dostęp | Ustalenie | Ograniczenie zastosowania |
|---|---|---|
| Ayala-Lopez N, Harb R. JALM 2020;5:126–135. [DOI 10.1373/jalm.2019.029496](https://academic.oup.com/jalm/article/5/1/126/5690023); pełny tekst, Methods, Table 1, Results/Discussion | Dorośli n=5034: 7–18; pediatryczna próba n=145: 8–19 mmol/L. Roche Modular DPP, pośrednie ISE; enzymatyczne tCO₂, głównie osocze heparynowe | Autorzy opisują niepewność grupy pediatrycznej; confidence ratio 0,41. Nie potwierdzono minimalnego wieku dzieci ani suplementu rozkładu wieku. Nie ustanawia osobnej normy noworodków |
| Sadjadi SA i wsp. 2013. [DOI 10.2147/IJNRD.S44689](https://pmc.ncbi.nlm.nih.gov/articles/PMC3681403/); pełny tekst, Methods, Results, Table 1 | 3–11 mmol/L u 409 dorosłych >18 lat; Beckman Unicell DXC800, pośrednie ISE | Szpital VA, 93,4% mężczyzn, prawidłowa funkcja nerek i albumina ≥4 g/dL; silnie wyselekcjonowana populacja |
| Chionh CY i wsp. 2022. [DOI 10.1111/imj.15396](https://pubmed.ncbi.nlm.nih.gov/34028972/); tylko abstrakt | 10–18 mmol/L, 284 uczestników badań przesiewowych, mediana wieku 35 lat | Pełne granice wieku i metoda niezweryfikowane; nie przyjęto profilu do wdrożenia |

Nie miesza się tych przedziałów z Mayo w pozornie jednolitą krzywą wieku.
Nie przyjęto także norm noworodkowych z katalogów, w których nie potwierdzono
wariantu bez K, ani średnich ±SD z badań krwi pępowinowej jako granic RI.
Rozszerzenie pokrycia <7 lat wymaga osobnego przeglądu pełnej tabeli,
populacji, materiału i wzoru źródła.

## 4. Opcjonalna albumina

Pełna podstawa konwencji: Jung B i wsp., **Diagnosis and management of
metabolic acidosis: guidelines from a French expert panel**, Ann Intensive
Care 2019;9:92, [DOI 10.1186/s13613-019-0563-2](https://link.springer.com/article/10.1186/s13613-019-0563-2).
Odczytano pełny tekst/PDF 04.11.2026, **R1.3–R1.4, s. 5–6 z 17**.
R1.3 dotyczy uwzględnienia albuminy w różnicowaniu mechanizmu kwasicy
metabolicznej (GRADE 2+, silna zgodność), nie ustalania zdrowej normy dzieci.

`cAG40 = AG + 0,25 × (40 − albumina [g/L])`

Równoważnie: `cAG40 = AG + 2,5 × (4 − albumina [g/dL])`.

Zwinięte **„Uwzględnij albuminę (opcjonalnie)”** udostępnia jedno pole
z jednostką g/L albo g/dL. Brak albuminy nie oznacza 40 g/L i nie blokuje
zwykłego AG. Podana albumina musi być dodatnia i skończona. Błędna wartość
pozostawia poprawny AG, pokazuje lokalny błąd i nie tworzy korekty; zapis
wymaga poprawienia lub usunięcia błędnego wpisu, bez jego cichego pomijania.
Wyłączenie opcji wyłącza korektę. Czyszczenie usuwa jej wartość i stan;
zmiana pacjenta nie przenosi albuminy poprzedniej osoby.

Korekta zachowuje znak: dla 50 g/L zmniejsza AG o 2,5 mmol/L. **40 g/L
jest bazą przeliczenia, nie dolną normą albuminy**. Nie rozpoznaje się
hipoalbuminemii na podstawie samego `albumina <40`.

Główna liczba i jej porównanie pozostają **AG bez korekcji**. cAG jest
mniejszym wierszem **„Po uwzględnieniu albuminy” w tej samej karcie**,
bez drugiej karty, osi, osobnej klasyfikacji ani nowej serii badań.
Przy dostępnej normie pojawia się **„Norma powyżej dotyczy AG bez korekcji.”**
Przy braku normy: **„Przeliczenie do albuminy 40 g/L, bez automatycznej oceny.”**
Gdy AG jest w przyjętej normie, a albumina <40 g/L, komentarz uzupełnia
zdanie **„Niższa albumina może jednak zaniżać lukę.”**

Praktyka kliniczna dopuszcza ocenę skorygowanego AG wobec właściwego metodzie
zakresu. Ten moduł nie deklaruje jednak osobnej walidacji rozkładu cAG40
w populacji Mayo i nie nadaje mu drugiego automatycznego statusu.

Pediatryczna praca Hatherill i wsp. 2002, [DOI 10.1136/adc.87.6.526](https://pubmed.ncbi.nlm.nih.gov/12456555/),
obejmowała 55 dzieci ze wstrząsem, mediana wieku 7 miesięcy, 93 próbki.
Zweryfikowano abstrakt i opis metody, nie pełny PDF. Używała **AG z K**
i bazy albuminy **44 g/L**. Jej progów diagnostycznych nie przenosi się
do no-K/40 g/L ani nie przedstawia jako zdrowej normy wieku.
Figge 1998 ([DOI 10.1097/00003246-199811000-00019](https://pubmed.ncbi.nlm.nih.gov/9824071/))
i Feldman 2005 ([DOI 10.1016/j.lab.2005.07.008](https://pubmed.ncbi.nlm.nih.gov/16310513/))
odczytano tylko jako abstrakty. Bezpośrednią podstawą współczynnika 0,25
i bazy 40 pozostają pełne wytyczne francuskie, bez mieszania współczynników
0,23/0,25 lub baz 40/44.

## 5. Interpretacja i prezentacja

Jedna karta B łączy liczbę, jednostkę, dostępną normę i komentarz. Niski
oraz wysoki AG są bursztynowe; norma i jej jednostka pozostają neutralne.
Samo AG nie ustanawia czerwonej klasy pilności. Zero i ujemny wynik
z kwalifikującym zakresem są niskie, nie automatycznie neutralne.

- W normie: **„AG mieści się w przyjętej normie.”**
- Podwyższony: **„Zwiększona luka może wskazywać na obecność dodatkowych
  anionów, np. mleczanów lub ciał ketonowych.”**
- Obniżony: **„Mała luka może wynikać m.in. z niskiej albuminy lub błędu
  oznaczenia; warto potwierdzić wynik.”**

To synteza komunikatów aplikacji, nie dosłowne cytaty zaleceń. Źródła
ograniczeń, pełne teksty odczytane 04.11.2026:

- Kraut JA, Nagami GT. CJASN 2013;8:2018–2024,
  [DOI 10.2215/CJN.04040413](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817910/),
  **Definition and Characterization of the Normal Serum Anion Gap**,
  **Recognition of an Increase in the Serum Anion Gap**, tabele 1–3.
- Haber LA i wsp. CCJM 2023;90:619–623,
  [DOI 10.3949/ccjm.90a.23035](https://www.ccjm.org/content/90/10/619),
  s. 619–621: **Definition**, **How low is too low?**, **Causes of a low
  anion gap**. Przy niedostępnej stronie wydawcy odczytano
  [pełną autorską wersję UCSF](https://escholarship.org/content/qt6qp590tq/qt6qp590tq_noSplash_27658a7c634e815166ca41217ab6f07d.pdf).

AG samo nie rozpoznaje kwasicy, jej przyczyny ani pilności leczenia.
Prawidłowe AG nie wyklucza kwasicy z prawidłową luką, zaburzeń maskowanych
małą albuminą lub podwyższonego mleczanu. Ograniczenia, wzory, tabela wieku,
metoda i źródła należą do zwiniętych Szczegółów.

Oś przedstawia przedział 7–15 z obiema nazwanymi granicami i tekstem
**„Norma: od 7 do 15 mmol/L.”** Stały pokazywany fragment −10 do 40 nie
jest zakresem możliwych wartości; wynik poza nim zachowuje liczbę i ma
stosowny dopisek. Brak normy nie tworzy pustej osi.

Szerokości, krawędzie, poziom jednostek wyniku/normy i odstępy pozostają
stałe przy rozwinięciu albuminy, zmianie jednostki, długim wyniku i błędzie.
Telefon: font pól ≥16 px, wysokość ≥48 px, odstęp pod „Wyczyść wszystkie
pola” ≥20 px. Dotychczasowe PDF/DOCX/AI i zapis do Badań pozostają dostępne.

## 6. Zapis, historia i edycja

AG jest badaniem **krwi**, nie wskaźnikiem DZM. Jeden pomiar `AGs` zachowuje
elektrolity, wiek użyty do oceny, albuminę/jednostkę/stan opcji, surowy
i dokładny AG, opcjonalną korektę, prezentację, przyjęty zakres, populację,
źródła, wersje oraz ograniczenia. `labResult.valueNum` pochodzi z wartości
obliczonej, nie z tekstu zaokrąglonego na karcie. `outOfRange:null` oznacza
brak oceny; `false` jest zarezerwowane dla uzasadnionego wyniku w zakresie.

Odczyt historyczny odtwarza utrwaloną ocenę bez dzisiejszego silnika,
normy lub wieku aktualnie wybranego pacjenta. Starsze wpisy nie otrzymują
albuminy lub normy Mayo wstecz. Nie rekonstruuje się utraconej precyzji:
starsza pełna koperta mogła zachować surową wartość, choć kanoniczny wynik
laboratoryjny był zaokrąglony. Świadoma edycja korzysta ze wspólnego
walidatora, zachowuje identyfikator i historyczny kontekst. Zapis, Notatka,
Badania, trend i raport przedstawiają zgodny pomiar, bez technicznego JSON
w treści Notatki. Korekta nie tworzy drugiego badania ani osobnego trendu.

## 7. Syntetyczne przypadki regresji

Poniższe wartości są niezależnymi oczekiwaniami dla rzeczywistych funkcji
produkcyjnych; nie są kopią implementowanego wzoru w teście.

| Na / Cl / HCO₃ [mmol/L] | Wiek / albumina | Oczekiwany wynik |
|---|---|---|
| 140 / 104 / 24 | 40 lat, bez albuminy | AG 12, w przyjętej normie, bez korekty |
| 140 / 100 / 18 | 10 lat | AG 22, podwyższony |
| 140 / 118 / 24 | 40 lat | AG −2, obniżony |
| 140 / 116 / 24 | 40 lat | AG 0, obniżony, zapisywalne zero |
| 140,1 / 116 / 24,1 | 40 lat | Dokładne 0, bez „−0,0” |
| 140,04 / 116 / 24 oraz 139,96 / 116 / 24 | 40 lat | Odpowiednio 0,04 i −0,04; zachowana liczba i znak |
| 140 / 109 / 24 oraz 140 / 101 / 24 | Dokładnie 7 lat | AG 7 i 15: obie granice włączone |
| 140 / 104 / 24 | 6,999 roku lub wiek nieznany | AG 12, neutralny, brak normy, gotowość 3/3 |
| 140 / 104 / 24 | 40 lat, 20 g/L albo 2 g/dL | AG 12, cAG40 17, jedna karta i pomiar |
| 140 / 104 / 24 | 40 lat, 30 / 40 / 50 g/L | cAG40 odpowiednio 14,5 / 12 / 9,5 |
| 140 / 104 / 24 | 3 lata, 20 g/L | AG 12 i cAG40 17 bez automatycznej oceny normy |
| 140 / 104 / 24 | Błędna podana albumina | AG 12 pozostaje; brak korekty, lokalny błąd, zapis wymaga poprawy/usunięcia wpisu |
| Ujemny operand, `0x8c`, `<140`, `Infinity` | Dowolny wiek | Błąd także po edycji zapisanego badania |
| 1e308 / 1e308 / 1 | 40 lat | AG −1, bez przepełnienia pośredniego |

Regresje obejmują również wartości tuż poza granicami przed zaokrągleniem,
brak profilu, reset/zmianę pacjenta, pełny odczyt z wyłączonym silnikiem,
edycję bez duplikowania ID, zgodność Notatek/raportu oraz desktop, 390/320 px
i rzeczywiste offline. Wyniki wykonania, końcowy SHA i kontrole GitHuba
dokumentuje PR; ten dokument definiuje kontrakt, nie zastępuje raportu testów.

Ponowny przegląd jest potrzebny przy zmianie katalogu Mayo, przyjęciu nowej
metody/populacji, rozszerzeniu pokrycia <7 lat albo dodaniu automatycznej
klasyfikacji skorygowanego AG.
