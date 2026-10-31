# Testosteron całkowity — zakresy wieku i pokwitania

Wersja danych: **2026-10-15.2**, moduł danych `1.1.0`; stan źródeł:
**15 października 2026**. Męski etap obejmuje zakresy wieku
i niezależną oś G; pierwsza partia żeńska dodaje profil wieku Mayo od
ukończenia 6 miesięcy, bez osi Th. Jest to zmiana interpretacji klinicznej,
nie walidacja kliniczna. Nie zmienia testosteronu wolnego ani krzywych
edukacyjnych. Dotychczasowe męskie liczby, kwalifikacja i noty ES/EAU
pozostają. Układ i obsługa historii pozostają dotychczasowe; odczyt
starszego TT bez utrwalonej oceny nie dodaje jednak norm ani kontekstu
dzisiejszego pacjenta. Zachowuje wynik oraz jawną normę zapisaną we wpisie.
Profil męski zachowuje własną wersję `2026-10-15.1`; nowy profil żeński
`mayo-ttst-female` ma wersję `2026-10-15.2`. Wspólna polityka wyboru
`testosterone-sex-specific-source-selection` nie wybiera źródła według
wartości wyniku.

**Uzupełnienie 1.11.2026 — osobne mediany niemowlęce:** po akceptacji
makiety nowa karta używa trzech dosłownych median żeńskiego TT Busch 2025/S3
0,19/0,13/0,08 nmol/L dla nazwanych grup dni. Nowa karta wymaga całego
PNA 5–184 dni i całego wieku <6 miesięcy kalendarzowych; dopuszcza
konserwatywną obwiednię istniejącego wieku miesięcznego, bez nowego
DOB. Nie tworzy laboratoryjnego RI, SDS lub historii; przy brakach
GA/metody/materiału pozostaje informacją źródłową. Johannsen upper,
kanoniczna ocena Mayo, Kushnir od kwalifikowanych 6 miesięcy i Madsen
zachowują własne reguły. Pełna polityka i odrębność mediany od normy:
[FEMALE_TT_INFANT_MEDIAN.md](hormone-lifespan/FEMALE_TT_INFANT_MEDIAN.md).

## Źródła i zakres odczytu

| Źródło | Wersja i sprawdzone miejsce | Zastosowanie |
|---|---|---|
| [Mayo Clinic Laboratories TTST / 8533](https://www.mayocliniclabs.com/test-catalog/Overview/8533), *Testosterone, Total, Mass Spectrometry, Serum* | Pełny katalog odczytany 15.10.2026: Method Name, Specimen Type, Necessary Information, Clinical Information, Reference Values, Interpretation, Cautions, Supportive Data, Method Description, Clinical Reference, Test Classification; pełny PDF definicji testu str. 3–4/8 i setup str. 2/2 | Oryginalne męskie i żeńskie zakresy w ng/dL; do żeńskiego profilu przyjęto wyłącznie wiek ≥6 miesięcy |
| Bhasin i wsp., [Endocrine Society 2018](https://doi.org/10.1210/jc.2018-00229), JCEM 103(5):1715–1744 | Pełny tekst zachowany podczas audytu 14.10.2026; ponowny przegląd zalecenia 1.1, technical remarks, Table 2, Figure 1, harmonizacji, 1.2 i 2.4. [Aktualna strona CPG](https://www.endocrine.org/clinical-practice-guidelines/testosterone-therapy) sprawdzona 15.10.2026 nadal wskazuje to wydanie | Krótka notka o warunkach rozpoznawania niedoboru u dorosłych |
| [EAU Sexual and Reproductive Health Guidelines 2026 — Male Hypogonadism](https://uroweb.org/guidelines/sexual-and-reproductive-health/chapter/male-hypogonadism) | Świeży pełny rozdział, §§ 3.3.1–3.3.5, Table 3.3 i tabela zaleceń; wydanie 2026 potwierdzone [stroną wytycznych](https://uroweb.org/guidelines/sexual-and-reproductive-health) | Jak wyżej; pobrania, powtarzalność i SHBG/FT, bez diagnozy z liczby |
| [Endocrine Society — Statement on Testosterone Replacement Therapy](https://www.endocrine.org/news-and-advocacy/news-room/2026/statement-on-testosterone-replacement-therapy) | Stanowisko z 16.07.2026, pełna strona odczytana 15.10.2026, punkty 1–3 | Aktualny kontekst jakości pomiarów i diagnostyki; nie nowa tabela zakresów ani nowy CPG |
| Elhassan i wsp., [Society for Endocrinology Clinical Practice Guideline for the Evaluation of Androgen Excess in Women, 2025](https://doi.org/10.1111/cen.15265), PMID 40364581 | Pełny tekst XML: §5 i tabela 3, §6.1–6.3.3; publikacja online 13.05.2025, odczyt 15.10.2026 | Żeńskie noty o nadmiarze androgenów, metodzie i pobraniu; >5 nmol/L jako próg działania, nie granica Mayo ani rozpoznanie |
| Teede i wsp., [International Evidence-based Guideline for PCOS, 2023](https://doi.org/10.1210/clinem/dgad463), PMID 37580314 | Pełny tekst XML, zalecenia 1.2.1–1.2.11 i diagnostyka; odczyt 15.10.2026. Oficjalny PDF Monash z aktualizacją terminologii 2026 zachowuje te zalecenia | Ograniczenia TT w diagnostyce hiperandrogenizmu, metod i leczenia; nie nowe normy TT |
| Wierman i wsp., [Androgen Therapy in Women: A Reappraisal, Endocrine Society 2014](https://doi.org/10.1210/jc.2014-2260), PMID 25279570 | Pełny tekst wydawcy: zalecenie 1.1 i Evidence §1.0–3.0; odczyt 15.10.2026 | Niski TT nie ustanawia zespołu niedoboru androgenów u kobiet ani wskazania do terapii |
| Davis i wsp., [Global Consensus Position Statement on the Use of Testosterone Therapy for Women, 2019](https://doi.org/10.1210/jc.2019-01603), PMID 31498871 | Pełny tekst XML: I(1)–I(3), III(12), Summary; odczyt 15.10.2026 | TT nie rozpoznaje HSDD; dane o terapii nie są pediatrycznymi RI |

Ponowna próba pobrania artykułu ES 2018 od wydawcy 15.10.2026 zwróciła
HTTP 403. Wykorzystano wcześniej zachowany pełny artykuł, a aktualność
wydania potwierdzono świeżą stroną CPG. Nie przedstawiamy abstraktu jako
pełnej weryfikacji. Pełne kopie źródeł z audytu, wyciąg tabel i manifest
SHA-256 zachowano w materiałach roboczych. Metadane oraz hashe użytych
dokumentów znajdują się również w `vilda_lab_testosterone_data.js`.

Mayo nie podaje jawnej daty rewizji klinicznej tabeli. Wersja danych oznacza
**snapshot katalogu z 15.10.2026**, nie „wytyczne Mayo 2026”.
Ponadto odczytano [pełną definicję testu PDF](https://www.mayocliniclabs.com/test-catalog/download-setup?format=pdf&unit_code=8533)
oraz [setup PDF](https://www.mayocliniclabs.com/test-catalog/setup.php?unit_code=8533&format=pdf),
wygenerowane tego dnia. Data generowania PDF nie jest datą rewizji norm.

Repozytorium utrwala źródłowe fakty liczbowe, ich pochodzenie, ograniczenia
i cytowania. Nie publikuje pełnych chronionych artykułów ani PDF; licencja
Apache repozytorium nie jest deklaracją licencji do pełnych materiałów
wydawców. Kopie źródeł służą odczytowi i audytowi poza publicznym PR.

## Zakresy źródłowe Mayo — chłopcy i mężczyźni

Materiał źródła: **surowica (`Serum Red`)**. Metoda: **LC-MS/MS**, własny,
nieopublikowany test Mayo, z izotopowo znakowanym standardem i derywatyzacją
hydroksyloaminą. Warunki źródła opisują źródło, nie ustalony materiał,
metodę lub porę pobrania próbki pacjenta.

| Wiek w katalogu | Zakres ng/dL | Kwalifikacja ukończonego wieku |
|---|---:|---|
| 0–5 miesięcy | 75–400 | od urodzenia do <6 miesięcy |
| 6 miesięcy–9 lat | <7–20 | ≥6 miesięcy do <10 lat |
| 10–11 lat | <7–130 | ≥10 do <12 lat |
| 12–13 lat | <7–800 | ≥12 do <14 lat |
| 14 lat | <7–1200 | ≥14 do <15 lat |
| 15–16 lat | 100–1200 | ≥15 do <17 lat |
| 17–18 lat | 300–1200 | ≥17 do <19 lat |
| ≥19 lat | 240–950 | od 19. urodzin, bez źródłowej górnej granicy wieku |

Nie interpolujemy między wierszami. Źródłowa granica dorosłego wiersza
przypada w **19. urodziny**; 18 lat i 11 miesięcy pozostaje w zakresie
300–1200. Stadium V nie zastępuje wieku ≥19 lat.

Katalog nie definiuje przeliczenia dni na miesiące. Odwzorowanie etykiet
na półotwarte przedziały ukończonych lat/miesięcy jest jawną polityką
aplikacji. Wiek i jego precyzja pochodzą ze wspólnego kontekstu; sama
liczba „0 lat” nie uprawnia do wyboru zakresu 0–5 miesięcy, gdy możliwy
wiek obejmuje także późniejszą część pierwszego roku. Cały możliwy wiek
musi być objęty właściwym wierszem. Przy przecięciu granicy zachowujemy
oddzielne warianty albo konkretny powód braku oceny, nigdy szeroką normę
utworzoną przez sklejenie wierszy.

Sam wiek pourodzeniowy w dniach nie określa dokładnie ukończonych miesięcy
kalendarzowych. Przykładowo 181 dni może przypadać już po ukończeniu 6 miesięcy, a 183 dni nadal przed jego ukończeniem, zależnie od dat.
Lokalny adapter TT stosuje konserwatywne granice z jawnej polityki
`postnatalCalendarAge`: rok ma 365–366 dni, a kalendarzowe przesunięcie
o sześć miesięcy 181–184 dni. Zachowuje cały przedział PNA, nie tworzy
daty urodzenia i nie dzieli po prostu liczby dni przez 365/366, aby wybrać
wiersz graniczny. Tablice minimalnych i maksymalnych długości przesunięć
o 0–11 miesięcy sprawdzono dla każdej daty pełnego 400-letniego cyklu
gregoriańskiego, z ograniczeniem dnia do końca miesiąca jak w istniejącym
resolverze dat. To arytmetyka kwalifikacji aplikacji, nie norma medyczna
Mayo. Przy niejednoznaczności porównanie pozostaje niedostępne lub
zachowuje oddzielne zakresy bez jednego werdyktu.

Obwiednia kalendarzowa dotyczy kwalifikacji tabeli laboratoryjnej Mayo.
Istniejący diagram edukacyjny zachowuje dotychczasowe położenie wieku
w dniach, własne dane i kwalifikację odniesienia; adapter nie przenosi
miesięcznego przedziału Mayo na jego punkt. Nie zmienia to zapisanej oceny.

| `Tanner Stages` w katalogu | Zakres ng/dL |
|---|---:|
| I — prepubertal | <7–20 |
| II | 8–66 |
| III | 26–800 |
| IV | 85–1200 |
| V — young adult | 300–950 |

Katalog nie opisuje szczegółowej metodologii oceniania cechy Tannera.
Aplikacja wymaga typowanej, bieżącej obserwacji **G** chłopca; P, Ax ani
legacy ogólny numer Tannera jej nie zastępują. Oś wieku jest niezależna
od osi G. Przykładowo u 18-latka z G5 wynik 1000 ng/dL mieści się
w zakresie wieku 300–1200, a przekracza zakres stadium 300–950.

**Oś G jest dostępna wyłącznie dla całego możliwego wieku ≥1 i <19 lat.**
Jest to zachowawcza, wersjonowana polityka aplikacji, a nie opublikowana
granica wieku Mayo. U niemowlęcia pozostawiamy obserwację w danych,
ale używamy wyłącznie wieku do porównania TT. G1 nie zastępuje profilu
niemowlęcego/minipokwitaniowego. Brak wiarygodnego wieku uniemożliwia
także kwalifikację G. Brak G nie blokuje dostępnej oceny według wieku.

## Pierwsza partia żeńska — wiek od 6 miesięcy, bez Th

Profil wybierany jest według płci i całego możliwego wieku, niezależnie
od wyniku. Nie dodaje pytań o metodę, objawy, cykl, menarche, SHBG lub
antykoncepcję przed pokazaniem dostępnego porównania. Wykorzystuje znane
już dane pacjentki. Brak wieku lub płci nie uruchamia normy dorosłej.

| Wiek w katalogu Mayo | Zakres ng/dL | Kwalifikacja ukończonego wieku |
|---|---:|---|
| 6 miesięcy–9 lat | <7–20 | ≥6 miesięcy do <10 lat |
| 10–11 lat | <7–44 | ≥10 do <12 lat |
| 12–16 lat | <7–75 | ≥12 do <17 lat |
| 17–18 lat | 20–75 | ≥17 do <19 lat |
| ≥19 lat | 8–60 | od 19. urodzin, bez górnej granicy wieku w katalogu |

W 18. urodziny nadal obowiązuje 20–75; przejście do 8–60 następuje
w 19. urodziny. Źródłowy zakres ≥19 nie jest osobną normą dla konkretnej
fazy cyklu, menopauzy lub ciąży. Nie ustalamy tych stanów z wieku ani TT.
Wybrana norma opisuje katalog Mayo, nie laboratorium i metodę pacjentki.

**Zmiana źródła ma wpływ kliniczny.** Stare wiekowe liczby Soldin 2009 były
w większości odtwarzalne; sam wybór Mayo nie dowodzi ich błędu dla każdego
oznaczenia. Rzeczywiste uchybienia starego słownika to przypisanie pięciu
tabel Tannera do Soldin bez takiej oceny w artykule oraz rozciągnięcie
wiersza 15–16 lat na opis 15–18, bez właściwej odrębnej grupy 17–18.
Nowy profil wieku i granica ≥19 zastępują tę ścieżkę dla nowych ocen.

Przykładowo F11 z TT 1,6 nmol/L przechodzi z dawnego zakresu 0,49–1,73
ponad górne 44 ng/dL (=1,52548 nmol/L), a F13 z TT 2 nmol/L z dawnego
„powyżej” mieści się w odniesieniu `<7–75`. U dorosłej TT 2,2 nmol/L
przekracza 60 ng/dL (=2,0802), mimo że stary zakres 0,3–2,4 go obejmował.
Są to zmiany porównania źródłowego, nie nowe rozpoznania.

### Dlaczego nie uruchamiamy osi Th

Mayo publikuje także żeńskie `Tanner Stages`: I `<7–20`, II `<7–47`,
III `17–75`, IV `20–75`, V `12–60` ng/dL. **Nie są aktywnymi wierszami
tego profilu.** Pełna strona, oba PDF, katalog pediatryczny i powiązane
katalogi TTST/TTFB nie definiują cechy jako breast/Th ani P. Ogólna
definicja skali Tannera nie potwierdza metodologii konkretnej tabeli TTST.

Th/P i dawne numery Tannera pozostają danymi klinicznymi, ale nie wybierają
żeńskiej normy TT; nie pokazujemy dodatkowej osi ani edycji stadium w tym
module. Odrębny pełny [PRINCE 2026](https://doi.org/10.1080/07853890.2026.2650008)
i suplement S3 rozróżniają B od PH, lecz autorzy wykluczają traktowanie
tabel stadium jako samodzielnych RI. Zawierają P5–P95 albo min–max przy
małym n i dotyczą Siemens Atellica IM CLIA. Nie przenosimy ich do Mayo
LC-MS/MS. Normatywne TT/Th pozostaje osobnym zadaniem źródłowym.

### Dlaczego poniżej 6 miesięcy pozostaje luka

Niewłączony wiersz Mayo 0–5 miesięcy podaje 20–80 ng/dL, czyli
0,6934–2,7736 nmol/L. Pełny [Johannsen 2018](https://doi.org/10.1210/jc.2018-00482),
tabela 1, dla zdrowych donoszonych dziewczynek podaje LC-MS/MS
`<LOD–0,21` w 2–<3,5 miesiąca (n=165) i `<LOD–0,17` w 3,5–5 miesiąca
(n=125); LOD 0,10 nmol/L, nie LOQ. GA 37+0–41+6, rzeczywisty żeński wiek
próbek 2,3–5,0 miesiąca. Dolna granica Mayo przekracza górne percentyle
Johannsen; katalog nie opisuje kohorty wystarczająco, aby tę różnicę
wyjaśnić. Nie wybieramy normy według korzystniejszego wyniku, nie
uśredniamy i nie tworzymy wspólnego szerokiego zakresu.

Pierwsza partia celowo odracza **całe <6 miesięcy**, zachowując przeliczenie
i konkretny powód braku oceny. Nie wraca do starej grupy 0–5 lat ani normy
dorosłej. Precyzyjny profil Johannsen wymaga własnej polityki granic wieku,
GA, metody i cenzurowania; nie wypełnia automatycznie pozostałych okien.
Pełny [Ljubičić 2022](https://doi.org/10.1210/clinem/dgac363) z suplementem
nie zawiera TT i nie zamyka tej luki. Znane wcześniactwo również nie
otrzymuje profilu zastępczego.

## Nieokreślony dolny kraniec `<7` i operatory wyniku

Zapis `<7–20` nie oznacza 0–20 ani 7–20. Katalog nie uzasadnia też
nazwania wartości 7 granicą wykrywalności lub oznaczalności. Dane zachowują
`bounds.lower = null` oraz `censoredLower` z operatorem `<` i wartością 7;
znaczenie to **nieokreślony dolny kraniec źródłowego zakresu**.

- Dokładne **6 ng/dL** względem `<7–20`: nie przekracza 20, ale dolnego
  krańca nie można ocenić. Bez „poniżej minimum” i bez pełnego zielonego
  „w normie”.
- Dokładne 7–20 ng/dL nie wykracza poza górny kraniec i leży powyżej
  źródłowego dolnego krańca, który jest <7. Zachowujemy informację
  o nieokreślonym minimum.
- Dokładne >20 ng/dL przekracza górny kraniec.
- Wynik pacjenta `<7`, `<LOD` lub `<LOQ` pozostaje wynikiem z operatorem;
  nie staje się zerem, połową granicy ani dokładnym punktem 7.
- `<LOD` / `<LOQ` bez liczbowej granicy nie ma liczbowego punktu osi/trendu.

Przy dokładnym L–U końce są włączone. Operatory wyniku zachowują własne
znaczenie zbiorowe: u ≥19-latka `<240` jest poniżej L=240, ale `≤240`
obejmuje również punkt graniczny. `>950` przekracza U=950, natomiast
`≥950` obejmuje także dopuszczalną wartość graniczną. Nie rysujemy punktu
oznaczającego dokładne 240/950 dla takiego zapisu.

## Warunki zastosowania i ograniczenia

Nieznana metoda, leczenie, rodzaj pobrania lub pora nie stają się
potwierdzonymi faktami. Dopuszczamy jedynie jawne **porównanie orientacyjne**
ze źródłem; nie potwierdzoną klasyfikację laboratoryjną. Brak danych nie
wymaga nowej ankiety. Znany fakt ma jednak pierwszeństwo przed domysłem:

- Jawnie niezgodna metoda lub materiał blokuje użycie tego profilu.
  Samo ogólne „LC-MS/MS” innego laboratorium nie dowodzi równoważności
  z metodą i populacją Mayo.
- Zakresy źródła oparto na porannych próbkach; znane wieczorne/nocne
  pobranie nie otrzymuje bazalnej oceny porannej.
- Znana terapia hormonalna lub stymulacja wymaga osobnego profilu.
  Ten moduł nie nadaje bazalnemu zakresowi roli celu terapii.
- Znane wcześniactwo w niemowlęctwie nie otrzymuje zakresu zastępczego.
  Katalog nie podaje wystarczającej kwalifikacji GA/PNA/PMA. Nie korygujemy
  wieku, aby dopasować wiersz i nie przenosimy profili LH/FSH. Dawny wywiad
  wcześniactwa nie usuwa późniejszej kwalifikacji starszego dziecka.

Katalog nie opisuje liczebności, rekrutacji, etniczności, percentyli tej
tabeli ani szczegółów oceny stadium. Nie nazywamy go polską normą,
prospektywną kohortą zdrowych lub 2,5.–97,5. percentylem. Nie przypisujemy
mu też niewymienionej populacji wyłącznie donoszonych niemowląt.
Nie zweryfikowano osobnego certyfikatu CDC HoST tej metody w tym audycie.

Nie dodajemy automatycznej niższej normy senioralnej ani nowych profili
wcześniaczych lub Johannsen/Greaves. Opisowy przypis Mayo
o początku pokwitania i osiąganiu V nie staje się nową regułą rozpoznawania
CPP lub opóźnienia dojrzewania. TT i „w zakresie G” nie rozstrzygają czasu
ani przyczyny dojrzewania.

Znane COCP, egzogenny testosteron, pozostałe steroidy płciowe, GnRHa lub
ciąża nie znikają przy zmianie jednostki/płci i nie stają się potwierdzonym
nieleczonym profilem. Moduł nie ma osobnego RI ciąży ani celu leczenia,
więc zachowuje przeliczenie i konkretne ograniczenie bazalnej oceny.
Nieznany kontekst pozostaje nieznany; nie wymaga dodatkowej ankiety.
Nie wydajemy automatycznej instrukcji odstawienia antykoncepcji lub leku.

## Notka ES/EAU u dorosłych mężczyzn — bez zmian

Zakres Mayo ≥19 lat to 240–950 ng/dL. **Nie zastępujemy go progiem
diagnostycznym 12 nmol/L z EAU ani granicą harmonizowanego zakresu ES.**
ES 2018 podaje osobny zakres 264–916 ng/dL (w źródle 9,2–31,8 nmol/L)
dla zdrowych nieotyłych mężczyzn 19–39 lat i oznaczeń zgodnych ze
standardem CDC. To inna populacja i inna podstawa zastosowania.

Notka przy wyniku dorosłego:

> Pojedynczy wynik nie rozpoznaje ani nie wyklucza hipogonadyzmu. Przy
> objawach lub niskiej/granicznej wartości potrzebna jest ocena kliniczna
> i potwierdzenie TT w co najmniej dwóch porannych pobraniach na czczo;
> SHBG i wolny testosteron — gdy wskazane.

EAU wskazuje zwykle 07:00–10:00, a u pracujących nocą okres po odpowiednim
śnie. Ostra choroba, leki, otyłość i zmienione SHBG mogą wpływać na wynik.
SHBG/FT nie są obowiązkową nową ankietą lub automatycznym zleceniem dla
każdej wartości. Nie rozpoznajemy LOH, nie określamy przyczyny ani wskazań
do TRT. Wynik np. 9 lub 10 nmol/L może mieścić się w zakresie Mayo,
a przy objawach wymagać dalszej oceny; status zakresowy nie wyklucza choroby.
Starszy wiek nie usprawiedliwia automatycznie niskiego TT.

## Żeńskie noty kliniczne są oddzielne od zakresu Mayo

**Powyżej zakresu** oznacza odchylenie od wybranego źródła. Nie rozpoznaje
PCOS, guza ani przyczyny zaburzenia. Szybka progresja lub wirylizacja
wymagają pilnej oceny również przy małym lub umiarkowanym wzroście TT.
Nie stosujemy dawnych etykiet „praktycznie pewny guz przy >14 nmol/L”
ani wykluczenia guza przez wynik poniżej dowolnego progu.

**W zakresie źródła** nie wyklucza hiperandrogenizmu. Przy odpowiednich
objawach potrzebna może być ocena SHBG i wolnego testosteronu; nie dodajemy
kalkulatora FT/FAI ani obowiązkowych pól SHBG/albuminy. SFE 2025 §6.2–6.3.3
i PCOS 2023 1.2.1 odróżniają to od samego statusu TT względem RI.

**Niski TT** u dorosłej nie rozpoznaje zespołu niedoboru androgenów,
„żeńskiego hipogonadyzmu” ani HSDD i nie stanowi automatycznego wskazania
do testosteronu. ES 2014 zalecenie 1.1 i Global Consensus 2019 I(3)/Summary
nie dostarczają takiego progu. Nie oznacza to, że niski wynik zawsze jest
bez znaczenia: ocenia się go z objawami, innymi hormonami, metodą i leczeniem.
Tych dorosłych przesłanek nie przedstawiamy jako kryteriów dojrzewania
dziewczynki.

### SFE >5 nmol/L — próg działania, nie nowa norma

SFE 2025 §6.2 i tabela 3 wskazują dalszą ocenę przy **TT >5 nmol/L**
w diagnostyce nadmiaru androgenów u kobiet, w tym weryfikację LC-MS/MS
i odpowiednią diagnostykę obrazową jajników/nadnerczy. Sama liczba nie
rozpoznaje guza. Ciężka insulinooporność i hipertekoza także mogą powodować
duże stężenia; część guzów daje wzrost niewielki lub umiarkowany.

Automatyczną notę tej partii ograniczono do **całego możliwego wieku
≥19 lat** i odpowiedniego kontekstu diagnostyki endogennego nadmiaru
androgenów. Jest to konserwatywny zakres produktu zgodny z dorosłym
wierszem Mayo, **nie biologiczny próg wieku opublikowany przez SFE**.
Znana ciąża, terapia lub stymulacja nie otrzymuje tej oceny jako dowodu
endogennego nadmiaru. Brak danych nie potwierdza braku tych okoliczności;
treść noty zachowuje warunkowy charakter porównania. U młodszej pacjentki
brak dorosłej reguły nie ukrywa przekroczenia właściwego zakresu wieku.

Próg nie zmienia górnej granicy dorosłego RI Mayo 60 ng/dL
(2,0802 nmol/L). Dokładnie 5 nie spełnia `>5`; ocena odbywa się przed
zaokrągleniem prezentacji i po rzeczywistej konwersji. Wyniki `>5` oraz
`≥6` są w całości powyżej 5; `≥5` zawiera również granicę, a `<6` nie
dowodzi przekroczenia. Cenzurowany wynik nie staje się dokładnym punktem.
Także `<LOD` bez liczby nie daje liczbowej decyzji progu.

W szczegółach znajdują się właściwe żeńskie warunki pobrania z SFE 2025
§6.1: zwykle 08:00–10:00 na czczo, wczesna faza folikularna, jeżeli to
możliwe. Brak regularnego cyklu nie blokuje wyświetlenia wyniku; źródłowa
tabela nie daje osobnych zakresów dla jego faz. Nie przenosimy męskiej
noty Bhasin/EAU do F ani twierdzenia o stałym procentowym spadku u kobiet.
Preferowane są wiarygodne LC-MS/MS, lecz różnice kalibracji pozostają;
immunoassay może mieć błąd dodatni lub ujemny zależnie od oznaczenia.

## Podział modułów, jednostki i utrwalenie

- `vilda_lab_testosterone_units.js` to niezależny, niezmienny rejestr
  transportu `tt-existing-mass-conversions`, wersja `1.0.0`. Nie zawiera
  norm. `Snapshot` potrzebuje tylko tego małego modułu, nie silnika i tabel.
- `vilda_lab_testosterone_data.js` przechowuje oryginalne ng/dL, źródła,
  kwalifikację oraz oddzielne męskie i żeńskie noty kliniczne. Silnik
  przyjmuje dane jako argument.
- `vilda_lab_testosterone.js` parsuje, przelicza i ocenia według przekazanych
  danych. Renderer nie tworzy własnych norm.

Zachowane współczynniki istniejącego przelicznika do nmol/L:
`nmol/L ×1`, `ng/dL ×0,03467`, `ng/mL ×3,467`, `pg/mL ×0,003467`.
W danych klinicznych nie ma drugiej kopii współczynników. Dla regresji
240–950 ng/dL daje 8,3208–32,9365 nmol/L; wyświetlanie nie wymaga takiej
liczby miejsc po przecinku.

Ocena i zakresy są kanoniczne w nmol/L. Oryginalne `raw`, `sourceValue`,
`sourceUnit`, operator, kontekst, zakres i wersja źródła pozostają
w przypiętym wyniku. TT zapisuje identyfikator/wersję polityki konwersji
i zastosowany współczynnik. Odczyt transportu sprawdza zgodność danych
z niezmiennym rejestrem, nie uruchamia ponownie klinicznej kwalifikacji.
Nie przeliczamy dawnej oceny według dzisiejszego wieku lub tabel.
Wynik z operatorem nie staje się dokładnym punktem trendu.
Starszy żeński wpis zachowuje własną zapisaną ocenę lub jawną normę;
nie dostaje retroaktywnie Mayo ani nowej noty SFE. Zmiana jednostki
wyświetlania nie zmienia źródła, kategorii, zapisanych progów i kontekstu.

## Syntetyczne regresje

Poniższe oczekiwania służą regresjom rzeczywistych funkcji produkcyjnych.
To porównania z konkretnym źródłem, nie rozpoznania. Wyniki uruchomień
testów podaje PR; tabela sama nie deklaruje ich wykonania.

| Wejście | Oczekiwane zachowanie |
|---|---|
| M, 3 ukończone miesiące, G1, 5 nmol/L | Oś wieku 75–400 ng/dL obejmuje wynik; bez osi G i bez alarmu dawnej grupy 0–6 lat |
| M, ukończone 6 miesięcy, 21 ng/dL | `<7–20`, powyżej górnego krańca; bez osi G |
| M, 8 lat, G1, 6 ng/dL | Brak przekroczenia górnego krańca, dolny nieokreślony; bez below i pełnego within |
| M, 12 lat, G3, 1 nmol/L | Wiek `<7–800`, G3 26–800; niezależne osie obejmują wartość |
| M, 18 lat 11 miesięcy, G5, 1000 ng/dL | W zakresie wieku 300–1200, ponad zakresem G5 300–950 |
| M, dokładnie 19 lat, 1000 ng/dL | Ponad 950 w wierszu ≥19 |
| M, 40 lub 80 lat, 9/10 nmol/L | W zakresie źródłowym, bez wykluczenia hipogonadyzmu; notka ES/EAU pozostaje |
| Brak wieku/płci, samo V | Przeliczenie pozostaje; brak domyślnej męskiej normy dorosłej |
| `<240`, `≤240`, `<LOD`, `<LOQ` | Operator i brak dokładnego punktu zachowane; nie są zerem |
| Znane wcześniactwo niemowlęcia, niezgodna metoda, terapia | Konkretny brak kwalifikowanego porównania, bez norm zastępczych |
| F, 5 ukończonych miesięcy lub niepewny wiek przecinający 6 miesięcy | Brak kwalifikowanego profilu w pierwszej partii; zachowane przeliczenie, bez normy 0–5 lat lub dorosłej |
| F, ukończone 6 miesięcy, 21 ng/dL | Powyżej górnego krańca `<7–20`; bez Th |
| F, 8 lat, Th3/P3, 6 ng/dL | Wiek `<7–20`, dolny kraniec nieokreślony; bez below, pełnego within ani osi stadium |
| F, 11 lat, 1,6 nmol/L | Powyżej 44 ng/dL (=1,52548 nmol/L) |
| F, 13 lat, 2 nmol/L | W zakresie źródłowym `<7–75`; nie jest to wykluczenie hiperandrogenizmu |
| F, 18 lat 11 miesięcy / dokładnie 19 lat, 10 ng/dL | Odpowiednio poniżej 20–75 / w 8–60; V nie zastępuje wieku |
| F, 30 lat, 2,2 nmol/L | Powyżej 60 ng/dL (=2,0802); bez rozpoznania PCOS/guza |
| F, ≥19 lat, dokładnie 5 / 5,01 nmol/L | Pierwszy nie spełnia ścisłego >5; drugi spełnia próg noty działania SFE, przy zachowaniu odrębnego RI Mayo |
| F, ≥19 lat, `>5`, `≥6` / `≥5`, `<6`, `<LOD` | Tylko pierwsza para dowodzi przekroczenia 5; nie rysować dokładnych punktów dla żadnego z operatorów |
| F, niskie TT / TT w RI przy objawach | Bez diagnozy niedoboru/HSDD; status w RI nie wyklucza hiperandrogenizmu |
| Znane COCP, egzogenny T, GnRHa, ciąża lub stymulacja | Bez pozornej oceny nieleczonej fizjologii i bez celu terapii lub rozpoznania endogennej przyczyny |
| Zmiana M→F→nieznana płeć→M, odczyt starej wizyty | Właściwy profil i nota dla aktualnego kontekstu; brak normy dorosłej przy brakach i brak ponownej oceny zapisanego wyniku |

Pełna walidacja obejmuje też granice wieku i jednostek, zachowanie
przypiętych ocen, reset kontekstu po zmianie osoby/płci, telefon 320 px
oraz rzeczywistą aktualizację PWA i ponowny start offline. Wyniki kontroli
podaje PR; niniejsza dokumentacja sama nie deklaruje ich wykonania.
