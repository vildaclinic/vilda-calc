# Testosteron całkowity — chłopcy i mężczyźni

Stan danych i polityki: **2026-10-15.1**. To zmiana porównania referencyjnego
TT u płci męskiej po ujednoliceniu danych pokwitania. Nie jest walidacją
kliniczną. Nie zmienia testosteronu wolnego, norm kobiet ani krzywych
edukacyjnych. Układ i obsługa historii pozostają dotychczasowe; odczyt
starszego TT bez utrwalonej oceny nie dodaje jednak norm ani kontekstu
dzisiejszego pacjenta. Zachowuje wynik oraz jawną normę zapisaną we wpisie.

## Źródła i zakres odczytu

| Źródło | Wersja i sprawdzone miejsce | Zastosowanie |
|---|---|---|
| [Mayo Clinic Laboratories TTST / 8533](https://www.mayocliniclabs.com/test-catalog/Overview/8533), *Testosterone, Total, Mass Spectrometry, Serum* | Pełny katalog odczytany 15.10.2026: Method Name, Specimen Type, Necessary Information, Clinical Information, Reference Values, Interpretation, Cautions, Supportive Data, Method Description, Clinical Reference, Test Classification | Oryginalne męskie zakresy wieku i Tannera w ng/dL |
| Bhasin i wsp., [Endocrine Society 2018](https://doi.org/10.1210/jc.2018-00229), JCEM 103(5):1715–1744 | Pełny tekst zachowany podczas audytu 14.10.2026; ponowny przegląd zalecenia 1.1, technical remarks, Table 2, Figure 1, harmonizacji, 1.2 i 2.4. [Aktualna strona CPG](https://www.endocrine.org/clinical-practice-guidelines/testosterone-therapy) sprawdzona 15.10.2026 nadal wskazuje to wydanie | Krótka notka o warunkach rozpoznawania niedoboru u dorosłych |
| [EAU Sexual and Reproductive Health Guidelines 2026 — Male Hypogonadism](https://uroweb.org/guidelines/sexual-and-reproductive-health/chapter/male-hypogonadism) | Świeży pełny rozdział, §§ 3.3.1–3.3.5, Table 3.3 i tabela zaleceń; wydanie 2026 potwierdzone [stroną wytycznych](https://uroweb.org/guidelines/sexual-and-reproductive-health) | Jak wyżej; pobrania, powtarzalność i SHBG/FT, bez diagnozy z liczby |
| [Endocrine Society — Statement on Testosterone Replacement Therapy](https://www.endocrine.org/news-and-advocacy/news-room/2026/statement-on-testosterone-replacement-therapy) | Stanowisko z 16.07.2026, pełna strona odczytana 15.10.2026, punkty 1–3 | Aktualny kontekst jakości pomiarów i diagnostyki; nie nowa tabela zakresów ani nowy CPG |

Ponowna próba pobrania artykułu ES 2018 od wydawcy 15.10.2026 zwróciła
HTTP 403. Wykorzystano wcześniej zachowany pełny artykuł, a aktualność
wydania potwierdzono świeżą stroną CPG. Nie przedstawiamy abstraktu jako
pełnej weryfikacji. Pełne kopie źródeł z audytu, wyciąg tabel i manifest
SHA-256 zachowano w materiałach roboczych. Metadane oraz hashe użytych
dokumentów znajdują się również w `vilda_lab_testosterone_data.js`.

Mayo nie podaje jawnej daty rewizji klinicznej tabeli. Wersja danych oznacza
**snapshot katalogu z 15.10.2026**, nie „wytyczne Mayo 2026”.

Repozytorium utrwala źródłowe fakty liczbowe, ich pochodzenie, ograniczenia
i cytowania. Nie publikuje pełnych chronionych artykułów ani PDF; licencja
Apache repozytorium nie jest deklaracją licencji do pełnych materiałów
wydawców. Kopie źródeł służą odczytowi i audytowi poza publicznym PR.

## Zakresy źródłowe Mayo

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

Nie dodajemy automatycznej niższej normy senioralnej, nowych profili
wcześniaczych, Johannsen/Greaves ani norm kobiet. Opisowy przypis Mayo
o początku pokwitania i osiąganiu V nie staje się nową regułą rozpoznawania
CPP lub opóźnienia dojrzewania. TT i „w zakresie G” nie rozstrzygają czasu
ani przyczyny dojrzewania.

Żeńska ścieżka TT korzysta nadal z wcześniejszych wierszy przelicznika,
nie z nowego profilu Mayo. Wspólny panel zapewnia jedno źródło wieku
i płci, ale nie pokazuje w tej ścieżce edycji Th/P: nowa typowana ocena
nie dobiera wcześniejszych żeńskich norm i nie jest przepisywana na
nieokreślony Tanner. Dotychczasowy zapis i żeńskie wiersze Tannera pozostają
bez zmian i wymagają osobnego audytu źródłowego; nie nadajemy im tutaj
nowej walidacji. Powrót do M przywraca dostępny według wieku edytor G.

## Notka ES/EAU u dorosłych

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

## Podział modułów, jednostki i utrwalenie

- `vilda_lab_testosterone_units.js` to niezależny, niezmienny rejestr
  transportu `tt-existing-mass-conversions`, wersja `1.0.0`. Nie zawiera
  norm. `Snapshot` potrzebuje tylko tego małego modułu, nie silnika i tabel.
- `vilda_lab_testosterone_data.js` przechowuje oryginalne ng/dL, źródła,
  kwalifikację oraz notkę ES/EAU. Silnik przyjmuje dane jako argument.
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

## Syntetyczne regresje

Poniższe przypadki sprawdzają rzeczywiste funkcje produkcyjne. Oczekiwania
to porównania z konkretnym źródłem, nie rozpoznania:

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

Pełna walidacja obejmuje też granice wieku i jednostek, zachowanie
przypiętych ocen, reset kontekstu po zmianie osoby/płci, telefon 320 px
oraz rzeczywistą aktualizację PWA i ponowny start offline. Wyniki kontroli
podaje PR; niniejsza dokumentacja sama nie deklaruje ich wykonania.
