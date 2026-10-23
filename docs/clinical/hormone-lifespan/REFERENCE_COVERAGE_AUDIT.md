# Pokrycie odniesień hormonalnych — audyt 18 października 2026

Pierwotny stan po scaleniu PR [#716](https://github.com/vildaclinic/vilda-calc/pull/716),
sprawdzony na `audyt` `d3a64f232556fec6068385da00f5139b8ec17cfb`.
Dane punktu pacjenta w audycie z 18.10: **82 profile, `2026-10-18.3`**.
Ten dokument aktualizuje rejestr pracy; **nie dodaje ani nie zatwierdza
nowych odniesień klinicznych**. Starsze wpisy etapowe w
[PATIENT_POINT.md](PATIENT_POINT.md) opisują stan w chwili danego wdrożenia.

Uzupełnienie 19.10.2026: osobny PR kwalifikacji laboratoryjnego E2 usuwa
opisany niżej domysł fazy folikularnej. Nie zmienia 82 profili ani zapisu
kontroli z 18.10. Szczegóły: [E2 — kontekst cyklu](../E2_CYCLE_CONTEXT.md).

Uzupełnienie 20.10.2026: po porównaniu Zhao z Assens i Wiedemann
właściciel zaakceptował [punkt samego LH dziewcząt w `(16,18)`](PATIENT_POINT.md#lh-dziewcząt--sam-wynik-bez-mediany-20-października-2026),
bez mediany. To zmiana prezentacji, nie nowy profil źródłowy; 82 profile
`2026-10-18.3` pozostają zachowane. Odrębna polityka
`female-lh-result-only-policy.json` nie rozszerza zwykłego modelu Madsen,
porównania płci ani norm laboratoryjnych. Poniższa tabela nadal opisuje
**dostępność odniesienia**, a nie samą możliwość zaznaczenia stężenia.

Uzupełnienie 21.10.2026: po poszerzonym audycie testosteronu właściciel
zaakceptował dwa przybliżone odniesienia grupowe **Kushnir 2010** dla
chłopców `[1,2)` i `[2,3)`. Bieżący rejestr to **84 profile,
`2026-10-21.1`**; wcześniejsze 82 zachowano. Zaktualizowane niżej pokrycie
nie przepisuje wyników historycznego skanu ani jego hashy z 18.10.
Źródłowy odczyt, tolerancja i granice są opisane w
[kontrakcie](PATIENT_POINT.md#testosteron-chłopców--przybliżone-mediany-dwóch-grup-21-października-2026).

Drugie uzupełnienie 21.10.2026: właściciel zaakceptował mały PR wyłącznie
z dalszym odczytem znanej **żeńskiej inhibiny B do 47,75 roku**.
Bieżący rejestr pozostaje przy **84 profilach**, wersja `2026-10-21.2`:
jeden zwykły profil zastąpiono rozszerzonym, 83 pozostałe są zachowane.
Trzy nowe punkty 47,25/47,5/47,75 → ≈10/8/7 pg/mL nie trafiają do
porównania płci. Dodanie sąsiadów do PCHIP zmienia też dawną interpolację
w `(46,47)` o maksymalnie około −0,42735 pg/mL w skanie; przy 46,5
14,4375 → 14,076923. To jawna zmiana odniesienia, bez przeliczania
historii, nowych RI, zmiany geometrii lub E2. Starszy skan z 18.10
i jego hashe pozostają zapisem ówczesnego stanu, nie testem nowej wersji.
[Kontrakt i granice](PATIENT_POINT.md#żeńska-inhibina-b--dalszy-odczyt-do-4775-roku-21-października-2026),
[odczyt źródła i kalibracja](evidence/patient-point/borelli2025-female-inhb-post47-digitized.json).

Uzupełnienie 22.10.2026: po ujawnieniu ograniczeń Kulle 2024 właściciel
zaakceptował jeden edukacyjny profil E2/Th1. Bieżący rejestr liczy
**85 profili, `2026-10-22.1`**; 84 wcześniejsze pozostają zachowane.
Nowe odniesienie to stałe **15 pmol/L** całej źródłowej grupy B1 1–8 lat,
N=213, przy aktualnym Th1 tej samej pacjentki i całym możliwym wieku
w otwartym `(1,6)`. Nie jest to model mediany dokładnego wieku lub RI.
Brak Th1 pozostawia lukę tego porównania i nie blokuje niezależnego wyniku.
Ta partia nie zmienia inhibiny B; jej odrębny PR #744 nie należy do tej bazy.
[Kontrakt i ograniczenia](PATIENT_POINT.md#żeński-e2--mediana-grupy-th1-w-16-22-października-2026),
[ekstrakt źródła](evidence/patient-point/kulle2024-female-e2-th1-group-median.json).

Synchronizacja 22.10.2026 po scaleniu PR #752: odświeżony PR #744
zachowuje E2/Th1 i rozszerzoną inhibinę B w jednym rejestrze
**85 profili, `2026-10-22.2`**. Inhibina B zastępuje jeden profil;
84 pozostałe, w tym dodany E2/Th1, są zachowane względem nowej bazy.
Nie rozszerzamy zakresów ani źródeł: inhibina B nadal kończy się na
47,75, a E2 nadal wymaga aktualnego Th1 i całego wieku w `(1,6)`.
Starsze wpisy wyżej opisują wersje poszczególnych etapów; ich hashe
oraz wyniki dawnych kontroli pozostają historyczne.

Uzupełnienie LiLACS 22.10.2026: po audycie i akceptacji makiety osobna
karta AMH mężczyzn 80–90 lat podaje medianę całej grupy **12,1 pmol/L,
około 1,7 ng/mL, N=257**, bez porównania z wynikiem pacjenta. To informacja
o publikacji poza **85 profilami / `2026-10-22.2`**; nie dodaje punktu,
RI ani migawki i nie wypełnia zwykłej luki >70. Cały możliwy wiek musi
mieścić się w `[80,90]`; dokładne 90 kwalifikuje, ukończone 90 nie.
[Kontrakt i ograniczenia](AMH_LILACS_SOURCE.md).

Uzupełnienie FSH 22.10.2026 po akceptacji makiety: osobna karta tabeli
producenta Roche pokazuje 6,9/12,3/3,6/67 IU/L dla nazwanej, już znanej
grupy cyklu/menopauzy. Wiek grupy pozostaje niepodany. To informacja
źródłowa poza 85 profilami, bez nowej mediany wieku, RI lub zapisów
historii; nie zamyka zwykłej luki FSH kobiet ≥19. Źródło i granice:
[FSH — mediana w tabeli producenta](FSH_SOURCE.md). W tym samym zakresie
zaakceptowano wyłącznie skalę podwykresu cyklu Stricker: sam FSH 0–20,
LH lub oba 0–50; źródłowe węzły i pozostałe skale pozostają zachowane.

## Co oznacza „luka”

Rozróżniamy zwykły liczbowy punkt na osi wieku, osobne zestawienie
grupowe/fazowe/stadium, zakres referencyjny laboratoryjny (RI) oraz samą
ilustrację. Brak pierwszego nie dowodzi braku pozostałych. Średnia,
mediana, RI i przedział ufności nie są zamienne.

Przegląd wywołuje rzeczywisty silnik produkcyjny i jego eksport
przeglądarkowy, z granicami profili, węzłami i sąsiednimi wartościami wieku.
Osobno sprawdzono porównania, panel seniorów, Xu i interpretację
laboratoryjną. [Zapis kontroli](evidence/reference-coverage-audit-2026-10-18.json)
podaje wersje, hashe wejść, domeny i wybrane odpowiedzi silników.
To kontrola techniczna pokrycia, nie walidacja kliniczna źródeł.

W tabeli wiek jest dokładny. Nawiasy `[]` włączają granicę, `()` ją
wyłączają. Dzień źródłowy przeliczamy przez 365,25 dni/rok; żeńskie
`0,02 roku` oznacza dokładnie 7,305 dnia, nie 7 dni. Szeroki wpis
„18 lat 0 miesięcy” może oznaczać przedział, a nie dokładne 18 lat.
Cały możliwy wiek musi pasować; nie wybieramy jego środka.

## Zwykły punkt z odniesieniem na osi wieku

Zakresy poniżej opisują możliwe dopasowanie przy kwalifikującym kontekście.
Donoszenie niemowlęcia oraz G1/Th1 wymagane przez Zec są jawnymi danymi
syntetycznych prób, nigdy wnioskiem z wieku. Znany niezgodny materiał,
metoda lub kontekst kliniczny mogą wyłączyć punkt również w tych zakresach.

| Analit | Chłopcy / mężczyźni | Dziewczęta / kobiety | Co pozostaje poza tym punktem |
|---|---|---|---|
| LH | [7,243] dni; [6,89] lat | [0,02;1] roku; [6,16] lat | M: po 243. dniu do <6 lat, >89 lat. F: >1–<6 i >16 lat. Niemowlęca część M po 243. dniu jest blokadą jakości/oznaczalności istniejącego odczytu, nie brakiem całej publikacji. |
| FSH | [7 dni,80 lat] | [0,02;19) lat | M >80; F ≥19. Wiek 1–<6 wymaga odpowiednio G1/Th1. Dorosłe kobiety mają osobne odniesienia fazowe/menopauzalne. |
| AMH | [7 dni,70 lat] | [0,02;46) lat | M >70; F ≥46 nie ma zwykłej mediany wieku. LiLACS ma osobną informację o medianie całej grupy M80–90, bez porównania z pacjentem. Xu udostępnia odrębne punkty P50 35/40/45/50/55. |
| Inhibina B | [7 dni,80 lat] | [0,02;47,75] lat | M >80 ma do 101 lat osobny aktywny panel średnich Baccarelli. F >47,75 pozostaje poza zatwierdzonym odczytem; nie jest to granica kohorty, LOD/LOQ ani rozpoznanie menopauzy. |
| Testosteron całkowity | [7,212] dni; [1,86] lat | Brak zwykłego profilu | M po 212. dniu do <1 roku; >86. W 1–<3 są dwie odrębne przybliżone mediany grup Kushnir, nie ciągły model. Po 212. dniu do 1 roku nadal działa blokada jakości/rozdzielczości obecnego odczytu. F ma niezależną interpretację laboratoryjną; nie dopisujemy p50 na podstawie RI. |
| Estradiol | Brak zwykłego profilu | [0,02;1] roku; `(1,6)` przy aktualnym Th1; [6,18] lat | W `(1,6)` wyłącznie stała mediana całej grupy B1 1–8 lat, nie model wieku; przy braku Th1 luka pozostaje. F >18 bez zwykłej mediany wieku. Dorosła faza cyklu ma własne odniesienia. M ma niezależne odniesienia laboratoryjne. |
| INSL3 | UI nie pokazuje liczbowego punktu | Brak zwykłego profilu | Niemowlęcy profil M istnieje wewnątrz silnika, ale UI świadomie go nie aktywuje. Względna linia nie jest stężeniem. Potrzebny osobny projekt ilościowego odniesienia. |

Ponadto zwykłe profile niemowlęce nie pokrywają pierwszych dni życia przed
podanym początkiem. Nie rozszerzamy ich na wcześniaków ani na starszy wiek.
Górne końce modeli są granicami danych wdrożonych, nie biologiczną granicą
występowania hormonu. Audyt sprawdził wiek 0–120 lat; nie zakłada referencji
poza domeną konkretnego źródła.

Zamknięte luki: FSH M [16,18), FSH F [16,19), AMH M [18,20),
LH M (16,18), a od 21.10 także T M [1,3) przez dwie mediany grupowe
oraz inhibina B F (47;47,75] przez dalszy odczyt tego samego modelu.
Od 22.10 E2 F `(1,6)` ma odniesienie grupowe wyłącznie przy aktualnym Th1;
pozostałe stadia i brak wiarygodnego stadium nie zyskują mediany.
Dokładne 16 lat w męskim LH nadal należy do Madsen,
a dokładne 18 do źródła dorosłego. Wypełnienie luki nie uprawnia
do przedłużania modelu ani do użycia go w innym widoku.

LH dziewcząt `(16,18)` nadal ma **lukę odniesienia źródłowego**. Osobny
tryb z 20.10 pokazuje wyłącznie rzeczywisty wynik na stałej osi całego
życia, bez jasnego znacznika mediany, łącznika ani werdyktu z krzywej.
Cały przedział wieku musi pasować: dokładne 16 zachowuje Madsen;
„16 lat 0 miesięcy” nie należy ściśle do `(16,18)`; `[17,18)` pasuje,
a dokładne 18 i przedział obejmujący je włącznie nie. Zbliżenie 6–16
odsyła do całego życia. Wynik z nierównością lub nieobsługiwaną jednostką,
znane przeciwwskazanie i niedostępny kontekst nie dostają zastępczego punktu.

## Dostępne warstwy, których nie należy ponownie „uzupełniać”

- **Dorosłe LH/FSH/E2 kobiet:** istnieją RI według znanej fazy cyklu lub
  menopauzy. Mediany Stricker (LH/FSH) i Anckaert (E2) mają własną oś
  cyklu/fazy. Nie są medianą wieku chronologicznego. Nie wnioskujemy fazy,
  menopauzy ani braku ciąży z wieku lub pustego formularza.
  LH/FSH przy nieznanym kontekście pokazuje cztery warianty RI bez
  wspólnego werdyktu. Osobna poprawka laboratoryjnego E2, opisana niżej,
  stosuje taką samą zasadę neutralnych alternatyw.
- **AMH Xu:** działa osobna informacja z pięcioma źródłowymi P50 i sąsiednimi
  punktami wieku. Nie tworzy ciągłej mediany, punktu pacjentki ani
  ekstrapolacji między grupami. Szczegóły: [plan AMH](../AMH_REFERENCE_PLAN.md).
- **Inhibina B seniorów:** istnieje aktywne porównanie ze średnią grupy
  Baccarelli [80,90) i [90,101]. Nie zastępujemy go medianą i nie
  przedłużamy zwykłego modelu Borelli ponad 80.
- **Inhibina B wcześniaków i według G:** obserwacje Kuiri-Hänninen oraz
  Crofton są już obecne; nie tworzą ciągłego modelu wieku ani punktu
  pacjenta. Nie wnioskujemy G z P, wieku lub samej objętości jąder.
- **Porównania płci i minipuberty:** mają własne kontrakty. Profil
  `ordinaryOnly` nie staje się odniesieniem porównania. Żeńskie mini-LH/FSH
  pokazuje względne średnie, bez punktu stężenia.

Wynik `<…` / `>…`, brak jednostki, niepewny wiek przecinający granicę,
brak wymaganego kontekstu czy znana niezgodność metody to powody kwalifikacji,
nie nowa luka źródłowa. Nieznanej metody nie nazywamy zgodną; dopuszczone
edukacyjne zestawienie nadal nie potwierdza porównywalności oznaczeń.

## Żeńskie LH Wilson/CALIPER — blokada pozostaje

[Wilson 2023](https://doi.org/10.1515/cclm-2022-1077) i dostarczony arkusz
`LH_F` nadal nie dają zgodnego odtworzenia ryciny. Monotoniczna zmiana
skali nie naprawia rozbieżności lokalizacji maksimum. Cztery oryginalne
pliki zachowały hashe wcześniejszego audytu.

Sprawdzono Crossref, PubMed, Crossmark i publiczne repozytorium współautora.
Nie znaleziono jednoznacznego sprostowania rozwiązującego ten konflikt.
Bieżącej kopii XLSX od wydawcy nie udało się uzyskać: odpowiedzi 202 miały
puste treści. Nie jest to dowód, że wydawca nie zmienił suplementu.
Późniejszy demonstracyjny skrypt GAMLSS nie potwierdza dokładnego
preprocessingu Wilsona. Nie przenosimy zaakceptowanej rekonstrukcji
męskiego LH na dziewczęta.

Do odblokowania Wilsona potrzebny byłby autorytatywny eksport `LH_F`
z wersją, jednostką, przekształceniem przed/po GAMLSS, rodziną rozkładu
i potwierdzeniem zgodności p50 z opublikowaną ryciną. Pytania przygotowano;
nie kontaktowano autorów.

## Niezależne źródła i następne decyzje

Poniższe wartości są ustaleniami audytu, **nie danymi automatycznie
wdrażanego profilu**. Odnotowana osobno decyzja z 21.10 dotyczy dwóch
median Kushnir; nie zatwierdza pozostałych kandydatów ani Kulle 2010.
Osobna decyzja z 22.10 wybiera wyłącznie wiersz B1 Kulle 2024 wraz
z jawnymi, nadal nierozstrzygniętymi ograniczeniami opisanymi poniżej.

| Priorytet i źródło pierwotne | Ustalenie | Ograniczenie / możliwy następny krok |
|---|---|---|
| 1. LH dziewcząt — [Zhao 2025](https://doi.org/10.21037/tp-24-399), pełny tekst i suplement S2 | Rzeczywista mediana grupy >15–18: 7,14 mIU/mL, N=112; >18–19: 5,87, N=30. Surowica, Mindray CL-6000i. Autorska szersza grupa >12–19 w tabeli 4 ma p50=6,79, N=244 (suma tabeli 1). | Po poszerzeniu przeglądu i decyzji właściciela 20.10 nie wdrażamy jej jako domyślnej mediany. Nie opisano precyzyjnego wyliczania wieku ani fazy cyklu/OCP osobno. Selekcja wymagała prawidłowych badań; dokładne kryteria wstępnego wykluczenia wyników hormonalnych są niejasne. To chińska grupa wieku, nie LMS Wilsona ani normy fazy. Nowa ścieżka pokazuje sam wynik bez wyboru lub uśredniania median. |
| 2. Testosteron M 1–<3 — [Kulle 2010](https://doi.org/10.1210/jc.2009-1670), tabela 3 | Grupa 1–3 lata: N=9, mediana 12 ng/dL (źródłowo zaokrąglone 0,40 nmol/L). Osocze, UPLC-MS/MS; LLOQ 0,1 nmol/L. | Mediana powyżej LLOQ, ale bardzo mała grupa, próbki pozostałe po badaniach klinicznych; pobrania 08–10. Nie uznawać automatycznie za medianę surowicy każdego małego chłopca. Po porównaniu źródeł 21.10 nie wybrano tej mediany do wdrożenia. Dwa odniesienia Kushnir opisano poniżej; badań nie uśredniamy. Okres po 212. dniu do 1 roku pozostaje bez mediany. |
| 3. Inhibina B F >47 — [Borelli-Kjær](https://doi.org/10.1210/clinem/dgae439), ponowne wykorzystanie znanego źródła | Po kontroli odczytu i akceptacji 21.10 zwykły profil ma trzy nowe węzły 47,25/47,5/47,75 → ≈10/8/7 pg/mL. Publikacja obejmuje 149 dorosłych kobiet 20–69 lat, ale nie dostarcza liczbowego eksportu modelu. | Granica aplikacji 47,75 jest konserwatywnym końcem odczytu, nie granicą kohorty lub menopauzy. Gen II, surowica, LOD 3 pg/mL, bez osobnego LOQ. ±2 pg/mL to tolerancja digitalizacji, nie CI/RI/LOQ; przy 48 tolerancja przecina LOD. Nie ekstrapolujemy do 48/69, nie używamy plateau ani LOD/2 za wynik pacjentki. |
| 4. AMH M >70 — [Chong 2013](https://doi.org/10.1371/journal.pone.0070967), pełny tekst i tabela 1 | LiLACS: N=257, 80–90 lat, mediana całej grupy 12,1 pmol/L. Po akceptacji 22.10 osobna karta informacji o publikacji, bez porównania z pacjentem. | Nie jest medianą dokładnego wieku ani rozwiązaniem zwykłej luki >70, zwłaszcza >70–<80. Zróżnicowane zdrowie; dwa historyczne testy globalnie, przydział do LiLACS nierozstrzygnięty, brak opisanej cenzury i LOQ tej grupy. Rycina średniej geometrycznej z CI nie dostarcza p50. Sprostowanie dotyczy nazwiska autora. [Kontrakt](AMH_LILACS_SOURCE.md). |
| 5. E2 F >1–<6 — [Kulle 2024](https://doi.org/10.1093/ejendo/lvae046), pełny tekst, tabela 3 | Po akceptacji 22.10 jeden profil `ordinaryOnly`: „B1 1–8 years”, N=213, estymowany P50 Harrella–Davisa 15,0 pmol/L. Stała mediana całej grupy, nie model dokładnego wieku. | Cały możliwy wiek `(1,6)` i aktualne typowane Th1; zachowane źródła przy 1 i 6. LC-MS/MS, kontekst surowicy; znane osocze blokuje przy nieznanym przydziale materiału do B1. LOD 4/LLOQ 11, reguła cenzury nieopisana; N1753/1724, błąd B4 oraz niejasność osoby/próbki nierozstrzygnięte. Nie poprawiamy liczb, nie importujemy RI i nie imputujemy niskich wyników. |
| 6. Dorosłe FSH/E2 kobiet — [Grisendi 2014](https://doi.org/10.3109/09513590.2014.893572) | Abstrakt: N=192, regularne miesiączki, pobranie w 3. dniu cyklu i centyle wieku. | Brak uzyskanego pełnego tekstu/tabel/współczynników; samo nachylenie nie wyznacza mediany. Aplikacja zna fazę, lecz nie dokładny dzień cyklu. Nie można automatycznie dopasować każdej fazy folikularnej do dnia 3. |

Źródła, których obecnie **nie należy używać do wypełnienia punktu**:

- [Fanelli 2013](https://doi.org/10.1210/jc.2013-1381): rzeczywista mediana LH
  dziewcząt 16–19, ale oryginalna tabela drukuje `µIU/mL`.
  Nie poprawiamy po cichu na `mIU/mL` ani nie wprowadzamy błędu ×1000.
- Zhao 2025 dla niskiego dziecięcego LH/T: raportowane wartości sięgają
  poniżej dolnej granicy podanej liniowości. Liniowość nie jest tożsama
  z LOD/LLOQ; potrzebne wyjaśnienie oznaczalności i postępowania z cenzurą.
- Zhou 2025 dla LH/T: imputacja `<LOD` oraz niespójne pozycje tabeli LH nie
  uzasadniają dokładnej mediany. Nie przenosi to automatycznie wątpliwości
  na już oddzielnie zweryfikowane dane inhibiny B.
- [Moya-Salazar 2022](https://doi.org/10.1016/j.heliyon.2022.e10592):
  przedstawiono średnie i RI, nie potrzebne p50; jednostki i wybrane liczby
  są niespójne między częściami artykułu. Nie liczymy mediany ze średniej/RI.
- [Albrethsen 2020, INSL3](https://doi.org/10.1210/clinem/dgaa145): istnieją
  ilościowe dane dojrzewających i dorosłych mężczyzn, ale oznaczenie
  statystyki środkowej i eksport liczbowy wymagają wyjaśnienia. Nie
  przeskalowujemy względnej ilustracji do stężenia i nie nazywamy jej p50.
  [Tulumcu 2025](https://doi.org/10.3389/fendo.2025.1574760) także podaje
  mediany grupowe, ale przypisanie wieku wizyt i materiału wymaga osobnej
  polityki. Nie jest to brak wszelkich źródeł INSL3.

## Poszerzenie przeglądu LH dziewcząt — decyzja 20.10.2026

[Assens 2020](https://doi.org/10.1210/clinem/dgaa355),
[pierwotna tabela 2](https://academic.oup.com/view-large/324219374),
dostarcza europejskiego porównania: duńska kohorta 12–18 lat, mediana
wieku 16,1; wśród regularnie miesiączkujących mediana LH 3,0 U/L,
**N oznaczeń 122**, a w całej analizowanej grupie po menarche bez
antykoncepcji hormonalnej 3,3 U/L, N=223. Liczebność klinicznej grupy
regularnych cykli wynosiła 130 i nie jest N oznaczeń LH. Surowica Delfia.
Próbowano pobierać w dniach 2–5, lecz tylko 131 uczestniczek pobrano
w tym oknie (175 w dniach 1–7). Nie opisujemy całej kohorty jako
jednolicie folikularnej ani regularnych cykli jako potwierdzenia owulacji.
Tabela przedstawia P10–P90 obok median, nie RI P2,5–P97,5.

[Wiedemann 1993](https://doi.org/10.1515/cclm.1993.31.6.395), tabela 4,
podaje empiryczną medianę LH **3,43 U/L** dziewcząt 14–18 lat, N=74.
Pobrania 08–10, u dojrzałych dziewcząt w pierwszych 10 dniach fazy
folikularnej; Abbott IMx MEIA, starsza kalibracja WHO 68/40.
Nie opublikowano odrębnej mediany wyłącznie 16–18 lat.

Niższe mediany tych grup nie dowodzą błędu Zhao ani wpływu samej
geografii. Zakres wieku, selekcja populacji, faza i metoda są różne.
Nie wyliczamy wspólnej mediany, „normy 3–7”, ilorazu zgodności metod
ani ciągłej krzywej wieku. Assens i Wiedemann również nie są gotowym
automatycznym zamiennikiem Zhao. Uzasadnia to zaakceptowaną prezentację
samego wyniku, przy zachowaniu źródeł w rozwijanej informacji.
Pełne źródła i zakres poprzedniego odczytu:
[zapis decyzji](evidence/female-lh-result-only-audit-2026-10-20.json).

## Testosteron chłopców 1–<3 — decyzja 21.10.2026

Pełny [Kushnir 2010](https://doi.org/10.1373/clinchem.2010.143222),
ryc. **4C** na s. **1146**, zawiera mediany rocznych grup chłopców.
Wektorowy odczyt czarnych trójkątów Te daje około **0,03/0,02 µg/L**,
czyli **0,10401/0,06934 nmol/L**. To przybliżenia figury, nie liczby
z tabeli i nie model dokładnego wieku. Właściciel zaakceptował użycie
wyłącznie dwóch stałych grup `[1,2)` i `[2,3)` w zwykłych widokach.

Obie mediany są ponad LOQ **10 ng/L** (LOD5) przy konwencji środka
bounding box i centroidu. Odczyt ma tolerancję około ±5 ng/L, nie CI.
Nie podano N dla rocznych grup ani reguły zastępowania <LOD/<LOQ;
N123/125 z tabeli 1 ma inne grupowanie. Dzieci z młodszej kohorty
pobierano po indukcji znieczulenia; 24 wysokie wyniki i dodanie 90% RI
nie dowodzą korekty median. Te ograniczenia pozostają w źródłach.

Porównanie alternatyw nie daje podstaw do uśredniania:

- [Kulle 2010](https://doi.org/10.1210/jc.2009-1670), N9/osocze,
  około 0,40 nmol/L: odrębna mała grupa. Zaokrąglenia 12 ng/dL i
  0,40 nmol/L mogą współistnieć, nie dowodzą błędu jednostki.
- [Holmes 2021](https://doi.org/10.1016/j.jmsacl.2021.10.005):
  w źródłowych danych 26/38 M1–<3 ma T na lub poniżej 0,05 nmol/L,
  dolnej granicy kalibracji/raportowania. Nie jest to wykazane LOD/LOQ
  ani dowód imputacji; przed dokładnym importem modelu trzeba wyjaśnić
  niskie wyniki. Tabela podaje predykcje w środkach grup, nie mediany grup.
- [Goel 2025](https://doi.org/10.1016/j.jpurol.2025.01.034), 1398 chłopców,
  surowica CMIA/GAMLSS: obiecujący kandydat, ale pełny tekst, szczegóły
  oznaczalności i parametry numeryczne nie zostały uzyskane. Brak dostępu
  nie oznacza odrzucenia analitycznego.

Dwa nowe profile `ordinaryOnly` zachowują pozostałe 82, Kelsey od dokładnie
3 lat, ilustrację i skalę, niezależne normy Mayo, bramki oraz dawne oceny.
Cały możliwy wiek musi pasować do jednej grupy; niepewność przecinająca
2 lub 3 nie tworzy mediany z połowy wieku. Nie jest wymagane G1 ani nowy
formularz. Luka **>212 dni–<1 roku** pozostaje; nie ekstrapolujemy.
[Ekstrakt źródła i geometrii](evidence/patient-point/kushnir2010-male-testosterone-group-medians.json)
oraz [kontrakt punktu](PATIENT_POINT.md#testosteron-chłopców--przybliżone-mediany-dwóch-grup-21-października-2026)
zawierają zakres akceptacji i syntetyczne kontrole produkcyjne.

## Osobny problem kwalifikacji E2 — poprawka 19.10.2026

Laboratoryjny wiersz `e2_female_default` w `lab_units_data.js` przy kobiecie
dorosłej bez fazy na bazie audytu dobierał domyślnie fazę folikularną. Potwierdzono to
wywołaniem produkcyjnego konwertera: F30, E2 50 pmol/L, faza nieznana →
pojedynczy zakres 70–290 i werdykt „poniżej”. Test
`lab-estradiol-reference-scope.test.mjs` utrwalał tę politykę.
To **problem interpretacji nieznanego kontekstu**, nie luka mediany wieku
i nie dowód ustalonej fazy pacjentki.

Po akceptacji propozycji przez właściciela osobny mały PR pokazuje cztery
neutralne warianty istniejących RI bez globalnego werdyktu, z natychmiastowym
przeliczeniem. Wykorzystuje istniejący wybór fazy; zachowuje znane fazy,
menopauzę i dawne zapisane oceny. Dorosły Tanner nie zastępuje kontekstu
cyklu. Nie dodaje pytania do formularza, liczb ani profili median wieku.
Dokładny zakres, przypadki i ograniczenia: [E2_CYCLE_CONTEXT.md](../E2_CYCLE_CONTEXT.md).

## Kolejność pracy

1. Decyzja o żeńskim LH została podjęta 20.10: dla `(16,18)` wdrożyć
   punkt samego wyniku bez domyślnej mediany, nowego profilu i dodatkowych
   pytań. Propozycja automatycznego Zhao została zastąpiona tym zakresem.
   Wilson pozostaje niezależnie zablokowany.
2. Zweryfikować nową ścieżkę przez rzeczywiste funkcje i interfejs:
   granice oraz niepewny wiek, jednostki, cenzurę, znane przeciwwskazania,
   tożsamość, stałą geometrię, zachowanie niezależnej oceny i historii.
   Do przekazania wymagane są instalacja/aktualizacja i zimny restart
   PWA offline oraz zakończenie wszystkich kontroli GitHub dla końcowego
   SHA po każdym pushu. Wyniki kontroli podaje opis PR.
3. Testosteron 1–<3 został osobno oceniony: decyzja z 21.10 wybiera dwa
   przybliżone odniesienia Kushnir, bez importu Kulle lub uśredniania.
   Dalszy odczyt znanej inhibiny B został osobno zaakceptowany 21.10:
   PR #744 rozszerza wyłącznie zwykły żeński profil do 47,75, z jawnym
   wpływem PCHIP w `(46,47)`. E2/Th1 w `(1,6)` z decyzji 22.10 wdrożono
   odrębnie w PR #752 z zachowaniem ograniczeń źródła, bez innych wierszy
   lub RI. Odświeżenie #744 zachowuje oba zakresy; nie dodaje kolejnego.
   Poprawka domyślnej fazy E2 ma osobny PR opisany wyżej; przegląd
   nowych źródeł E2 pozostaje odrębnym zadaniem.
4. Pozostałe źródła utrzymać jako obserwacyjne lub wymagające wyjaśnienia.
   Wiek poza zakresem, wynik cenzurowany i metoda niezgodna mają zachować
   uczciwy brak punktu oraz dostępną osobną interpretację.

Przegląd publikacji był ukierunkowany na LH F16–18 oraz wymienione
priorytetowe luki. Nie jest systematycznym przeglądem całego piśmiennictwa.
Pozostałe końce wieku (m.in. FSH M>80, LH M>89, T M>86), męski E2
i żeński T pozostają odrębnymi zadaniami źródłowymi; wykrycie braku
wdrożonego profilu nie oznacza dowodu braku publikacji.

Sam audyt z 18.10 nie zmieniał generatorów, danych runtime, norm, krzywych,
zapisu pacjenta ani zasobów PWA. Osobna poprawka E2 zmienia kwalifikację
laboratoryjną, nie pokrycie median. Aktualizacja rejestru nie nadaje nowym kandydatom statusu
„zwalidowany klinicznie”. Dwa profile Kushnir z 21.10 są odrębnym
wdrożeniem zaakceptowanego porównania edukacyjnego. Akceptacja
inhibiny B z 21.10 nie stanowiła akceptacji E2/Th1; ten wiersz grupowy
uzyskał osobną zgodę 22.10 i nie rozstrzyga rozbieżności publikacji.
Synchronizacja obu zakresów nie nadaje statusu walidacji klinicznej.
