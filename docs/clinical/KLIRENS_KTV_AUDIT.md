# Dawka hemodializy — audyt Kt/V i URR, 6 listopada 2026

Zakres: `KTV` na podstronie Klirens, czyli dawka pojedynczej sesji
**przewlekłej, przerywanej hemodializy (IHD)**. Właściciel zaakceptował
[makietę przed/po desktop/mobile](https://vilda-ktv-audyt-20261106.maciej-flader.chatgpt.site)+i polecił jej implementację wraz z naprawą wykrytych błędów. Baza
implementacji: `03c2ad99829d4965e04aa3fdf06fc609f950b0a9`.
Audyt wcześniejszego działania wykonano na `6649e7bd`.

To zmiana kliniczna i funkcjonalna, nie wyłącznie uporządkowanie wyglądu.
Nie nadaje narzędziu statusu niezależnie zwalidowanego klinicznie.
Odniesienia są **celami lub minimalną dawką sesji**, nie normą zdrowej
populacji ani krzywą norm według wieku. Wynik nie rozstrzyga samodzielnie
o skuteczności całego leczenia, odżywieniu, kontroli płynów lub potrzebie
zmiany przepisu dializy. Formularz nie rozszerza celów przewlekłej IHD
na PD, CRRT ani ocenę dawki w AKI.

## Jeden wariant, potrzebne dane, jeden wynik

Trzy równe przyciski wybierają **spKt/V**, **eKt/V** lub **URR**. Karta
wyniku zajmuje stałe miejsce obok formularza na desktopie i pod nim na
telefonie. Nie powstają trzy równorzędne karty ani oddzielny wynik
„liczbowy” i „z pełną interpretacją”.

| Wariant | Wymagane dane | Liczba pól |
|---|---|---:|
| spKt/V | Stężenie przed i po, rzeczywisty czas w min, UF netto w L, masa po HD w kg, sesje/tydzień, PIDI w dniach | 7 |
| eKt/V | Dane spKt/V oraz dostęp AV albo CVC | 8 |
| URR | Stężenie przed i po | 2 |

Wiek służy do wyboru właściwej ścieżki i porównania z istniejącego
kontekstu pacjenta; nie tworzy obowiązkowego pytania. URR nie wymaga
masy, UF, czasu, częstości, PIDI, wieku, wzrostu ani płci do obliczenia
procentu. Częstość i czas mogą być uzupełnione opcjonalnie lub wykorzystane
z tej samej opisanej sesji do historycznego porównania URR. Brak tych
danych nie blokuje liczby. Brakujące dane potrzebne samemu spKt/V/eKt/V
nie są zastępowane domyślnym schematem **3×/tydz., PIDI 2**.

Nie ma jednoopcyjnego selektora IHD, wyboru analitu/jednostki, trzech
pytań o prawidłowość pobrania, Kru, daty Kru lub regularności leczenia.
Oba stężenia muszą dotyczyć **tego samego oznaczenia — mocznika albo
BUN — i tej samej jednostki**. Wspólny przelicznik skraca się w ilorazie;
usunięcie wyboru nie upoważnia do łączenia mg/dL z mmol/L albo BUN
z mocznikiem. Masa po HD ma odrębne znaczenie od ogólnej masy pacjenta
i nie może zostać po cichu zastąpiona tą ostatnią.

Jawne **„Wyczyść wszystkie pola”** zachowuje wybraną zakładkę sp/e/URR,
ale usuwa operandy, schemat, dostęp i fakty poprzedniego pomiaru.
Nowy pacjent albo nowa sesja bez zapisanego wariantu zaczyna od spKt/V;
nie dziedziczy poprzedniej zakładki ani danych. Samo przełączenie
wariantu zachowuje dane i znane fakty tej samej sesji.

## Równania, jednostki i PIDI

Przy `R = stężenie po / stężenie przed`:

- **spKt/V = −ln(R − GFAC × t) + (4 − 3,5R) × UF/W**, gdzie `t` jest
  czasem w godzinach, `UF` w L, a `W` rzeczywistą masą po HD w kg.
- **eKt/V = spKt/V × T/(T+C)**, gdzie `T` jest czasem w minutach,
  `C = 35 min` dla przetoki/protezy AV i `C = 22 min` dla CVC.
  Jest to przybliżenie **Tattersalla**, z parą współczynników opisaną
  w UK 2019 Appendix A, nie równanie Daugirdasa 1995.
- **URR = 100 × (1 − R)**, w procentach.

Kt/V nie ma jednostki fizycznej; zapis historyczny zachowuje jednostkę
`—`, URR `%`. Wiek, wzrost, płeć ani BSA nie są członami tych równań.

PIDI oznacza odstęp **od rozpoczęcia poprzedniej do rozpoczęcia badanej
dializy**, a nie sam czas wolny od dializy. Daugirdas 2013, tabela 1,
dostarcza 12 obsługiwanych komórek; puste pola nie są zerami:

| Sesje/tydzień | PIDI 1 dzień | PIDI 2 dni | PIDI 3 dni | PIDI 4 dni |
|---|---:|---:|---:|---:|
| 2 | — | — | 0,0055 | 0,0045 |
| 3 | — | 0,0080 | 0,0060 | — |
| 4 | 0,0155 | 0,0090 | — | — |
| 5 | 0,0175 | 0,0095 | — | — |
| 6 | 0,0175 | 0,0095 | — | — |
| 7 | 0,0175 | 0,0175 | — | — |

Klasyczne `0,008` dotyczy 3×/tydz. i PIDI 2; nie jest neutralnym
domyślnym współczynnikiem. Podstawowy wzór, 12 komórek i dorosła
korekcja 35/22 nie zostały zamienione na nowe równania. W pracy 2013
walidację kliniczną opisano dla analizowanych schematów 3/4/6×/tydz.,
a macierz zawiera również wyniki symulacji. Nie wynika z niej
uniwersalna walidacja wszystkich grup wieku i przepisów dializy.

## Cele, minimum i populacje

| Populacja i warunki | Właściwe porównanie |
|---|---|
| ≥18 lat, IHD 3×/tydz., spKt/V | KDOQI 2015: minimum ≥1,2, cel ≥1,4. `<1,2` czerwony; `1,2–<1,4` bursztynowy; `≥1,4` osiągnięty cel dawki sesji. |
| ≥18 lat, IHD 3×/tydz., eKt/V | UK 2019: minimum ≥1,2, bez przeniesienia celu spKt/V 1,4. `<1,2` czerwony, `≥1,2` spełnia minimum. |
| ≥18 lat, IHD 3×/tydz., dodatni czas <300 min, URR | Historyczne KDOQI 2006: minimum ≥65%, cel ≥70%. `<65%` czerwony; `65–<70%` bursztynowy; `≥70%` osiągnięty historyczny cel. |
| 2–<18 lat, spKt/V, 3×/tydz., PIDI 2 / GFAC 0,008 | KDOQI 2006, rozdział pediatryczny: minimum ≥1,2. Bez automatycznego indywidualnego celu 1,4. Młodsze dziecko może wymagać większej dawki. |
| Dziecko przy innym GFAC | Dostępna liczba modelowa bez automatycznej oceny minimum; brak odrębnej walidacji pediatrycznej całej macierzy. |
| Znany wiek <18 lat, eKt/V | Dorosłe przybliżenie 35/22 nie jest stosowane. Istnienie pediatrycznych zaleceń eKt/V nie waliduje tej konkretnej korekcji. |
| Znany wiek <2 lat, spKt/V/eKt/V | Poza lokalnym zakresem tego uproszczonego kalkulatora. Nie jest to wytyczna zakazująca klinicznego pomiaru dawki w tym wieku. |
| Dziecko, również <2 lat, URR | Procent dostępny z odpowiedniej pary próbek, bez automatycznych dorosłych kategorii 65/70%. |
| Nieznany wiek | Nie zastępuje się go dorosłym. spKt/V i URR mogą pozostać liczbą bez celu; eKt/V ma jawny opis modelu dla dorosłych bez porównania z celem. |
| Inna/nieznana częstość tygodniowa | Nie przenosi się celu dla 3×/tydz. na ten schemat. URR pozostaje dostępny; spKt/V/eKt/V wymagają własnego, obsługiwanego GFAC. |

Dokładne minimum należy do spełnionego minimum. Przy spKt/V 1,2 lub
URR 65% właściwe jest **„Minimum osiągnięte · poniżej celu”**, a nie
„powyżej minimum”. Przy jednym progu skala ma jedną legendę minimum.
Progi pozostają neutralne kolorystycznie; kolor opisuje wynik pacjenta.
Porównanie poprzedza formatowanie, bez arbitralnego epsilon. Jeżeli
zaokrąglenie sugerowałoby osiągnięcie granicy od dołu, prezentacja
zachowuje większą precyzję lub jawną nierówność, np. `<1,20` / `<1,40`.

Przy innej częstości potrzebna bywa tygodniowa miara **stdKt/V**, nie
cel przeniesiony do spKt/V. KDOQI 2015 opisuje dla innych schematów
tygodniowy target 2,3 i minimum 2,1 z odpowiednim ujęciem UF i czynności
resztkowej. Te liczby nie są progami tego formularza. Pediatryczne
zalecenie UK dotyczące stdKt/V 2,2 również nie staje się celem spKt/V.

## Założenia nie są potwierdzonymi faktami

Krótki opis zakłada odpowiednio pobrane próbki przed i po **tej samej
sesji**, zgodnie z protokołem ośrodka. Nie dopisuje do zapisu jako
ustalonego faktu konkretnego przepływu 100 mL/min, czasu 15 s lub Kru=0.
Nieznana resztkowa czynność nerek nie jest znanym dodatnim udziałem.
**Nie doliczamy udziału nerek ani nie obniżamy celu** na jego podstawie.
Brak Kru nie blokuje nieobniżonego celu dawki jednej sesji, lecz wynik
poniżej celu nie dowodzi sam niedostatecznej łącznej dawki dializa+nerki.

Znane inne sesje, różne anality/jednostki, błędne pobranie, niezgodna
modalność albo już wyrównana próbka zachowują znaczenie po zmianie
wariantu, zapisie i edycji. Sprzeczność nie znika przez domyślne
założenie lub usunięcie pytania z UI. W szczególności próbka po
wyrównaniu 30–60 min nie otrzymuje ponownej korekcji eKt/V właściwej
dla próbki bezpośrednio po HD. Sam URR z takiej próbki może być jawnym
procentem bez standardowego porównania. U dziecka nie przyjmuje się
po cichu dorosłej metody stop-dialysate-flow jako zwalidowanej.

Jawne dawne odpowiedzi `ui_ktvSameSession_answer:'no'` i odpowiedniki
dwóch pozostałych pytań nadal oznaczają sprzeczność. Sam niezaznaczony
legacy checkbox (`false`) bez zapisanej odpowiedzi nie jest nowym
potwierdzonym „nie”. Metadane próbek zachowuje się odrębnie od
założenia użytego w nowym formularzu.

## Zakres przybliżenia i konserwatywne zabezpieczenia

spKt/V/eKt/V wymagają dodatniego stężenia przed, dodatniego czasu i
masy, nieujemnego UF, `0 < R < 1`, obsługiwanej pary GFAC oraz
dodatniego argumentu logarytmu. Błędny zapis lub niepoprawna dziedzina
nie stają się zerem, nieskończonością lub poprzednim wynikiem.
Równe/wyższe stężenie po sesji nie otrzymuje spKt/V/eKt/V. Osobny
URR może pokazać zero/ujemny procent z uwagą weryfikacji, bez sukcesu
terapii. Brak danych pomocniczych dla spKt/V nie blokuje poprawnego URR.

Zaakceptowane zabezpieczenia lokalnego kalkulatora wstrzymują liczbę
spKt/V/eKt/V, zachowując możliwość osobnego odczytu URR, gdy:

- **URR >88%**;
- **czas >300 min i URR >82%**;
- **5–7 sesji/tydz. i czas >300 min**.

Komunikat wskazuje potrzebę dokładniejszego modelu, bez oceny osiągnięcia
celu. Są to ostrożnościowe reguły narzędzia oparte na ograniczeniach D2,
**nie nowe normy, uniwersalne przeciwwskazania do dializy ani definicja
hemodializy nocnej**. W szczególności >300 min jest lokalnym wskaźnikiem
ostrożności, a nie granicą z definicji źródłowej. Przypis tabeli GFAC
proponuje korekcję +0,0010 dla długich schematów 5–7×/tydz.; aplikacja
nie dodaje jej potajemnie, lecz odsyła tę konfigurację do dokładniejszego
modelowania. Czas 120–420 min opisuje warunki symulacji, nie uniwersalny
kliniczny zakres stosowalności.

## Wersjonowane dane i trwały zapis

`VildaClcrKtv.evaluate(input, policy)` otrzymuje jawnie
`VildaClcrKtvReferenceData.DEFAULT_POLICY` z
`clcr_ktv_reference_data.js`: politykę
**`KTV_SESSION_2026_11` v1**. Współczynniki, progi, źródła, populacje
i reguły zabezpieczeń są danymi, a nie ukrytą normą w rendererze.
Profile są rozdzielone:

- `ADULT_SPKTV_KDOQI2015_3X`;
- `ADULT_EKTV_UK2019_3X`;
- `PEDIATRIC_SPKTV_KDOQI2006_3X_MIDWEEK`;
- `ADULT_URR_KDOQI2006_3X`.

Wariant sesji `ktvVariant` ma wartości `spktv` / `ektv` / `urr`.
Zapisywana jest **wyłącznie wybrana miara**, z zachowaniem istniejącej
tożsamości serii **`KTV_spktv`**, **`KTV_ektv`**, **`KTV_urr`**.
Serie historii nie są automatycznie konwertowane ani łączone.

`ClcrKtvPersistence`, atrybut `data-clcr-ktv-snapshot` i
`dp.ktvSnapshot` stosują schemat **`clcr-ktv` v1**. Zamrażane są dane
wejściowe, wybrany wariant, dokładny wynik, pomocnicze wartości,
prezentacja/nierówność, fakty i pochodzenie założeń, data kliniczna,
wiek użyty dla pomiaru oraz źródło, populacja, profil, wersja polityki
i ocena. `valueNum` zachowuje surową liczbę, nie tekst po formatowaniu.
`outOfRange` jest trójstanowe: `true` poniżej minimum/celu, `false`
przy spełnionym odpowiednim porównaniu i `null` bez oceny. Nie odtwarza
się go z klasy CSS zewnętrznego kontenera.

Badania, czytelna Notatka, wykresy i raport korzystają z tej samej
zamrożonej oceny (`ktvAssessment`). **READ nie wywołuje dzisiejszego
silnika**, nie dobiera nowego celu ani wieku obecnie aktywnego pacjenta.
Stary zapis bez nowego snapshotu zachowuje dawną liczbę i jej znaczenie,
bez dopisywania nowej oceny; techniczne dawne `outOfRange:false` nie
jest dowodem osiągnięcia celu. Nie migruje się realnych danych.

Jawna **EDIT** zachowuje własną serię i jej wariant, wykorzystuje ten
sam bieżący silnik co formularz i datę kliniczną pomiaru z właściwym
wiekiem. Data otwarcia aplikacji nie może zastępować tej daty. Nie
przypisuje się kategorii dorosłych na podstawie późniejszego wieku
pacjenta. Znana data urodzenia korzysta z istniejącej ścieżki wieku
dla daty badania; bez daty urodzenia jawny wiek pomiaru pozostaje
zamrożony, bez odejmowania lat od dzisiejszego wieku. Niezmieniona
edycja zachowuje pierwotne `clinicalDateISO`.
Usunięcie dotyczy wskazanego pomiaru. Zapis korzysta wyłącznie
z wcześniej zapisanej/wybranej karty pacjenta, zgodnie ze wspólną
ścieżką Klirens → Badania; nie tworzy równoległej lokalnej karty.

## Naprawiane problemy potwierdzone w audycie

1. Czerwona/bursztynowa karta spKt/V/URR była dzieckiem kontenera,
   z którego kolektor usuwał klasy oceny. Realny kolektor zwracał
   `outOfRange:false`, mimo widocznego wyniku 0,94/55% poniżej minimum.
2. Kolektor przechowywał np. `valueNum:1.4` przy raw 1,39999 i tekście
   `<1,40` oraz 70 przy raw URR 69,999. To zmieniało położenie w serii
   względem progu. Surowa liczba i prezentacja mają pozostać rozdzielone.
3. Formularz i edytor odmiennie wybierały dzień oceny aktualności Kru.
   Nowy nieobniżony cel sesji nie zależy od ankiety o aktualność Kru,
   a data kliniczna i wiek muszą pozostać wspólne w formularzu/edycji.
4. Poprawna arytmetycznie korekcja 35/22 była błędnie podpisana jako
   Daugirdas 1995, zamiast właściwego przybliżenia Tattersalla z UK 2019.
5. Brak zabezpieczenia przy bardzo wysokim URR mógł dawać pozornie
   wiarygodny Kt/V i ocenę celu poza właściwym zakresem przybliżenia.

## Syntetyczne kontrakty kodu produkcyjnego

Tabela opisuje oczekiwane działanie; nie jest raportem uruchomienia testów.
Kontrole dla końcowego commitu, ich wynik i pełny zakres regresji podaje PR.

| Wejście | Oczekiwany wynik / zachowanie |
|---|---|
| Dorosły, 120→36 w tej samej jednostce, 240 min, UF 2 L, W 70 kg, 3×/tydz., PIDI 2 | spKt/V 1,4010540127569946, cel osiągnięty; osobno wybrany URR 70%. |
| Te same dane, eKt/V z dostępem AV / CVC | 1,2227380474970133 / 1,2834082559606057; właściwe minimum eKt/V 1,2. |
| Dorosły z raw spKt/V 1,39999 | Poniżej celu, `valueNum` dokładnie 1,39999; bez zapisania 1,4 jako liczby serii. |
| Dorosły z raw spKt/V 1,2 / URR 65% | Minimum osiągnięte, poniżej celu; bez „powyżej minimum”. |
| Dorosły 20→9, 240 min, UF 2, W 70, 3×/PIDI 2 | spKt/V 0,941559560743095 lub osobno URR 55%; czerwony i `outOfRange:true`. |
| Wybrany URR 120→36 bez innych pól i wieku | 70%, neutralny bez celu; 2/2 danych. |
| Wiek 2 albo 17, standardowe 3×/PIDI 2, spKt/V 1,30 | Spełnia minimum 1,2, bez automatycznego celu 1,4. |
| To samo dziecko, eKt/V / URR | eKt/V bez liczby; URR liczbowy i bez dorosłych kategorii. |
| Znany wiek 1 rok, para 120→36 | spKt/V/eKt/V poza lokalnym zakresem; URR 70% dostępny. |
| Nieznany wiek, dostęp AV i komplet danych | eKt/V z jawną informacją o modelu dorosłych, bez dorosłego celu; spKt/V bez zastępczej kategorii. |
| Dorosły, 7×/tydz., PIDI 2, 240 min | Właściwy GFAC 0,0175; liczba sesji bez celu dla 3×/tydz. |
| URR 90% albo URR 85% przy 480 min | Brak liczby spKt/V/eKt/V; osobno wybrany URR zachowuje procent. |
| Znana różna sesja albo różne jednostki | Zachowane wejścia, bez obliczenia dawki pary; zmiana wariantu nie usuwa konfliktu. |
| Odczyt starego wyniku po zmianie aktywnego profilu/wieku | Dawny wynik bez nowego celu; odczyt nowego snapshotu zachowuje zapisane źródło i ocenę. |

57 przypadków i 46 kontroli obrazów/galerii wykonanych na zaakceptowanej
**makiecie** potwierdzały jej zachowanie i czytelność 1440/390/320 px.
Nie zastępują testów rzeczywistych funkcji produkcyjnych ani przepływu
zapis/odczyt/edycja/usunięcie. Regresje implementacji obejmują również
sąsiednie U25, pH i PD, shell/stronę samodzielną, reset, zmianę pacjenta,
mobile ≥16 px/48 px, odstęp ≥20 px oraz PWA offline. Stan ich wykonania
raportuje PR. Akceptacja właściciela i zielone testy nie są niezależną
walidacją medyczną algorytmu.

### Wykonana walidacja interfejsu produkcyjnego

**17 rzeczywistych testów przeglądarkowych — PASS** w plikach
`tests/e2e/klirens-ktv.spec.mjs`, `klirens-ktv-records.spec.mjs` oraz
`klirens-ktv-mobile.spec.mjs`. Korzystają z produkcyjnego formularza,
silnika, kolektora, pisarza notatek, wspólnej karty Badania i edytora;
nie kopiują równania do testowego kalkulatora. Wyłącznie fikcyjny
adapter zastępuje szyfrowane I/O, a oryginalny sejf pozostaje zablokowany.

Sprawdzono 7/8/2 pól i jeden wynik, populacje i guardy, wszystkie pięć
granic zaokrąglenia sp/e/URR w zapisie, surowy punkt wykresu,
neutralny ujemny URR, zamrożoną datę/wiek/źródło oraz edycję i usunięcie
wyłącznie wskazanej notatki. Notatki nie pokazują technicznego drzewa
ani JSON. Zmiana formularza nie przelicza historycznej oceny.
Kontrole obejmują także znane sprzeczności i ich jawne wyczyszczenie,
sąsiednie pH/CKiD U25, rzeczywisty wybór i fokus, 1440/390/320 px,
obrót telefonu, stronę samodzielną i shell, stałe szerokości,
widoczne etykiety, 16 px/48 px oraz odstęp co najmniej 20 px.

To pomiar Chromium z emulacją telefonu, nie test fizycznego Safari.
Dodatkowo **19 dotychczasowych testów stage0/stage2 — PASS**;
zachowano medyczne asercje dawnej ścieżki broad. W jej dwóch helperach
dostosowano jedynie `fill` do `selectOption` po zmianie typu kontrolki
częstości. W chwili tego wpisu pełne `npm test`, PWA i kontrole GitHub
pozostają do zakończenia; końcowy wynik dla commitu raportuje PR.
Zielone testy nie nadają modułowi statusu walidacji klinicznej.

## Źródła, wersje i ograniczenia odczytu

Odczyt w audycie: **06.11.2026**. Nie kopiowano publikacji do repozytorium.

1. **Daugirdas JT i wsp. Improved equation for estimating single-pool
   Kt/V at higher dialysis frequencies.** Nephrol Dial Transplant.
   2013;28:2156–2160 (online 2012).
   [DOI 10.1093/ndt/gfs115](https://doi.org/10.1093/ndt/gfs115),
   [pełny tekst PMC3765020](https://pmc.ncbi.nlm.nih.gov/articles/PMC3765020/).
   Methods, tabela 1 z przypisem i Discussion: PIDI, 12 GFAC, zakres
   symulacji/walidacji, ograniczenia przy dużym URR. Analiza FHN nie
   przedstawia odrębnej walidacji pediatrycznej całej macierzy. FHN Daily
   dopuszczało wiek ≥13 lat, Nocturnal ≥18, dlatego nie opisuje się tej
   podstawy kategorycznie jako „wyłącznie dorosłych”; por.
   [kwalifikacja FHN](https://pmc.ncbi.nlm.nih.gov/articles/PMC3338281/)
   i [NIDDK Nocturnal](https://repository.niddk.nih.gov/study/168).
2. **National Kidney Foundation. KDOQI Clinical Practice Guideline for
   Hemodialysis Adequacy: 2015 Update.** AJKD 2015;66(5):884–930,
   [DOI 10.1053/j.ajkd.2015.07.015](https://doi.org/10.1053/j.ajkd.2015.07.015),
   [PubMed 26498416](https://pubmed.ncbi.nlm.nih.gov/26498416/).
   §§3.1–3.3 i 4.1: spKt/V 1,4/1,2 dla 3×/tydz., pomiar czynności
   resztkowej przy indywidualizacji oraz odrębna dawka tygodniowa.
3. **Ashby D i wsp. Renal Association Clinical Practice Guideline on
   Haemodialysis.** Final July 2019; BMC Nephrol 2019;20:379,
   [DOI 10.1186/s12882-019-1527-3](https://doi.org/10.1186/s12882-019-1527-3),
   [oficjalny PDF](https://ukkidney.org/sites/default/files/FINAL-HD-Guideline.pdf).
   §2.2, §2.4, Appendix A, s. 65–67, zwłaszcza s. 66: dorosłe minimum
   eKt/V 1,2 oraz Tattersall `T/(T+C)`, C=35/22 min. Przewidziany przegląd
   w 2024 r. nie jest datą wydania nowej wytycznej.
4. **NKF KDOQI, Hemodialysis Adequacy, Update 2006.**
   [Wytyczna 3](https://kidneyfoundation.cachefly.net/professionals/KDOQI/guideline_upHD_PD_VA/hd_guide3.htm),
   §§3.1–3.4, Tables 5–6 i Limitations: wspólna sesja, nierozcieńczona
   próbka przed i pobranie po ograniczające recyrkulację; brak walidacji
   pediatrycznego stop-dialysate-flow.
   [Wytyczna 4](https://kidneyfoundation.cachefly.net/professionals/KDOQI/guideline_upHD_PD_VA/hd_guide4.htm),
   §§4.1–4.3: historyczne URR 65/70%, częstość 3×/tydz. i minimum dla
   sesji <5 h; źródłowy profil obejmował Kru <2 mL/min/1,73 m².
   [Wytyczna 8](https://kidneyfoundation.cachefly.net/professionals/KDOQI/guideline_upHD_PD_VA/hd_guide8.htm),
   §§8.2–8.3 i Rationale: metoda logarytmiczna u dzieci, minimum dawki
   i potrzeba indywidualizacji. Pełne oficjalne HTML odczytano.
5. **Tattersall JE i wsp. The post-hemodialysis rebound: predicting and
   quantifying its effect on Kt/V.** Kidney Int 1996;50(6):2094–2102,
   [DOI 10.1038/ki.1996.534](https://doi.org/10.1038/ki.1996.534),
   [PubMed 8943495](https://pubmed.ncbi.nlm.nih.gov/8943495/).
   Odczytano abstrakt i metadane: 29 pacjentów, 35 min jako przybliżenie.
   Potwierdzeniem pary 35/22 jest pełna wytyczna UK 2019, nie sam abstrakt.
6. **Goldstein SL, Sorof JM, Brewer ED. Natural logarithmic estimates of
   Kt/V in the pediatric hemodialysis population.** AJKD 1999;33:518–522,
   [DOI 10.1016/S0272-6386(99)70189-7](https://doi.org/10.1016/S0272-6386(99)70189-7),
   [PubMed 10070916](https://pubmed.ncbi.nlm.nih.gov/10070916/).
   Odczytano wyłącznie abstrakt/metadane, nie pełny tekst: 103 sesje,
   21 pacjentów 1,8–22,5 roku. Nie jest to walidacja wszystkich niemowląt
   ani późniejszej macierzy GFAC.
7. **Fischbach M i wsp. Hemodialysis in children: general practical
   guidelines.** Pediatr Nephrol 2005;20:1054–1066,
   [DOI 10.1007/s00467-005-1876-y](https://doi.org/10.1007/s00467-005-1876-y),
   [pełny tekst PMC1766474](https://pmc.ncbi.nlm.nih.gov/articles/PMC1766474/),
   części 10–11. Minimum i ocena kliniczna, nie norma wieku/płci.

Nie znaleziono opublikowanej końcowej aktualizacji KDOQI 2026 zastępującej
przywołane zalecenia. Nowy przegląd pediatryczny Paglialonga/Patel 2026
([DOI 10.1007/s00467-026-07525-x](https://doi.org/10.1007/s00467-026-07525-x))
podkreśla ocenę szerszą niż Kt/V; nie ustanawia nowej normy w tym module.
Brak zweryfikowanej krzywej wieku nie jest dowodem nieistnienia lokalnych
protokołów ośrodkowych.
