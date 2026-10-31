# TT dziewczynek przed 6. miesiącem — mediany grup wieku

Właściciel zaakceptował prywatną makietę median niemowlęcego TT i polecił
wdrożenie (1 listopada 2026). Karta korzysta z trzech dosłownych wartości
Busch 2025, tabela S3. Karta dotyczy bieżącej pacjentki. Cały możliwy
wiek po urodzeniu (PNA) musi wynosić co najmniej 5 dni, a cały wiek
chronologiczny pozostawać przed 6 miesiącami kalendarzowymi.
To zamierzona zmiana informacji medycznej i porównania źródłowego;
nie dodaje laboratoryjnego RI, SDS, centyla pacjentki, diagnozy lub oceny
pilności. Akceptacja makiety nie jest walidacją kliniczną.

## Źródła i dokładny odczyt

Busch AS, Ljubicic ML, Upners EN i wsp. *Serum steroid metabolome dynamics
in infancy: a longitudinal cohort study of healthy infants.*
European Journal of Endocrinology. 2025;193(4):403–411.
DOI [10.1093/ejendo/lvaf193](https://doi.org/10.1093/ejendo/lvaf193),
[PMID 40974100](https://pubmed.ncbi.nlm.nih.gov/40974100/).

Przeczytano pełny dostarczony końcowy PDF, 9 stron: Methods s.404–405,
Results i rycinę 2/s.407, Discussion i ograniczenia s.409–410.
SHA-256: **b6b01d485ce67e61e57945e30bd64cfd316f306ab0cf5dec0a29b59697298470**.
Źródłem aktywowanych liczb jest dostarczony wyciąg suplementu
*Supplementary Tables_R2_TableS3.xlsx*, arkusz **Table S3**,
wiersze **78–80**, komórki mediany **F78/F79/F80**.
Plik ma 13 908 bajtów, SHA-256
**3545cc135c50896f96607a299ff2efd144180900c95c40da16ba0cda9e7ee32b**.
Arkusz odczytano w całości: jedna widoczna karta, 98 wierszy i 8 kolumn,
bez formuł, ukrytych danych, komentarzy lub dodatkowych przypisów.
Jednostki nie wydrukowano w XLSX; **nmol/L** dla całkowitego T potwierdza
główny artykuł. Odrębny *Free Testosterone* jest wyliczanym FT w pmol/L
i nie dostarcza tych trzech wartości.

| Etykieta Age_bin w S3 | Wiersz żeńskiego Testosterone | Mediana nmol/L |
| --- | --- | ---: |
| 0–30 dni | 78, F78 | 0,19 |
| 31–180 dni | 79, F79 | 0,13 |
| 181–400 dni | 80, F80 | 0,08 |

Kolumna F jest jawnie podpisana **median**. Nie jest to środek RI lub
odczyt ryciny. Bez eksportu od autorów można użyć tych dosłownych liczb.
Nie opisano jednak dostatecznie sposobu agregacji modelu w grupach,
żeby nazywać je surową empiryczną medianą albo dokładną P50 danego dnia.
Preferowany opis: **mediana opublikowana dla grupy wieku**.

Kolumny −2SD/−1SD/+1SD/+2SD nie są przedziałem ufności mediany lub
średniej. Nie aktywujemy ich jako norm, SDS i percentyli. Nie
odtwarzamy L/M/S z zaokrąglonych podsumowań ani nie interpolujemy
między trzema medianami. Zmiana grupy nie oznacza biologicznego skoku
lub plateau stężenia. Nie łączymy grup linią ani mostem z innym badaniem.

Pełne pliki PDF/XLSX pozostają poza repozytorium. Publiczny
[dowód audytu](evidence/female-tt-infant-median-busch2025-audit-2026-11-01.json)
zawiera tylko potrzebne fakty, hashe, decyzje i fikcyjne przypadki.
Nie odczytano całego dużego ZIP ani rycin S1/S2; nie są one źródłem
tych dosłownych komórek i nie deklarujemy ich weryfikacji.

## Populacja i analityka

- Zdrowe kaukaskie dzieci z ciąż pojedynczych, COPENHAGEN Minipuberty,
  rekrutacja 2016–2018. Wyłączono urodzone przed 37 lub po 42 tygodniu
  oraz SGA/LGA. Dokładnej definicji SGA/LGA nie podano w tym arkuszu
  ani głównym opisie; nie dopisujemy własnego progu centylowego.
- **88 dziewczynek i 101 chłopców, 446 pobrań**, średnio 2,4 (SD 1,2)
  na dziecko. Z wcześniejszego pełnego Frederiksen 2024 wynika
  **204 próbek żeńskich i 242 męskich** w tej części danych.
  N=88 lub N=204 nie jest liczebnością każdej grupy S3; w odczytanym
  arkuszu i głównym artykule N tych grup nie podano. To powtarzane
  obserwacje, nie 446 niezależnych dzieci.
- Główny artykuł wprost wskazuje wcześniejszą ogólną analizę tych samych
  danych w [Frederiksen 2024](https://doi.org/10.1016/j.cca.2024.119852).
  Nie liczymy tych publikacji jako niezależnych replikacji kohorty.
- Obserwowany wiek całej kohorty: **5–485 dni**; osobnych żeńskich
  skrajnych wieków TT nie podano. W analizach pierwszy przedział ma
  5–30 dni, a S3 drukuje 0–30. Nie dowodzi to pokrycia dni 0–4.
- Surowica po wykrzepieniu krwi, magazynowanie −20°C, izotopowe
  rozcieńczenie online TurboFlow-LC-MS/MS w Rigshospitalet.
  Pobrania 10:00–16:50, mediana 12:40. Nie przenosimy dorosłej
  reguły porannego pobrania ani nie obiecujemy oceny rytmu dobowego.
- Pełny Frederiksen 2024 i jego 19-stronicowy suplement potwierdzają
  dla cytowanej metody **LOD TT 0,031 i LOQ 0,10 nmol/L**.
  LOQ jest obliczone metodą ICH, nie empirycznym progiem CV20%.
  Najniższa pokazana kontrola międzydniowa TT ma 0,25 nmol/L, RSD 4,8%;
  nie dowodzi precyzji każdego wyniku przy 0,031–0,10.
- Mediana 0,08 jest niższa od LOQ tej metody. Samo to nie unieważnia
  opublikowanej statystyki populacyjnej i nie uprawnia do podwyższenia
  jej do 0,10. Nie zamieniamy mediany na LOD/2 lub LOQ/2.
  Busch 2025 podaje raportowanie wyników <LOD jako LOD/2; nie
  opisuje jednoznacznie cenzurowania konkretnego dopasowania GAMLSS.
  Nie przypisujemy mu automatycznie szczegółowej reguły modelowania
  z Frederiksen 2024. Nie odczytano tabeli S1 Busch z limitami.

## Zakres aplikacji i pełny wiek

Źródłowe mediany i polityka ich wyboru są osobnymi wersjonowanymi
plikami female-tt-infant-median-data.json oraz
female-tt-infant-median-policy.json. Produkcyjny czysty silnik
VildaFemaleTTInfantMedian.evaluate(data, policy, context) przyjmuje
je jako argumenty. Runtime dodaje femaleTtInfantMedianData oraz
femaleTtInfantMedianPolicy. Nie są 86. zwykłym profilem.
Źródło, grupa i mediana w wyniku pochodzą z tego samego wejścia;
renderer nie tworzy nowych liczb i nie wybiera publikacji według wyniku.

Warunki obejmują jednocześnie **cały możliwy PNA ≥5 dni** i **cały
możliwy wiek chronologiczny <6 miesięcy kalendarzowych**.
Pierwsze 5 dni jest jawną konserwatywną polityką na podstawie
zaobserwowanego minimum całej kohorty; nie udowodnionym minimum
żeńskiej podgrupy TT. Oryginalny wiersz 0–30 nie jest przemianowanym
wierszem autorów 5–30. Trzecia mediana 181–400 dotyczy wyłącznie
części tego wiersza przed 6 miesiącami, nie rozszerza tej zmiany do
400 dni lub całego pierwszego roku.

Polityka dodatkowo wymaga całego PNA **≤184 dni**. To konserwatywna
osłona produktu zgodna z istniejącym maxMonthSpanDays[6], a nie
przeniesiona ze źródła granica trzeciej grupy. Nie zastępuje osobnego
warunku całego wieku kalendarzowego <6 miesięcy.

Sześć miesięcy kalendarzowych nie oznacza stałych 180 dni.
Przedział PNA **181–182 dni** może należeć jeszcze do bieżącego
wieku przed 6 miesiącami albo już do późniejszej ścieżki, zależnie
od kalendarza. Zachowujemy istniejące granice rocznic i pełną
niepewność. Wiek obejmujący granicę 6 miesięcy nie dostaje nowej
mediany przez przycięcie zakresu, wybór środka lub użycie samego PNA.

Adapter **adaptMedian** rozszerza istniejący adapter źródłowy,
zachowując dotychczasowe **adapt** dla Johannsen. Przy zgodnym,
aktualnym kontekście zachowuje PNA z formularza. Nie transportuje
nowego DOB lub daty próbki i nie zmienia kanonicznego wieku oceny.
Gdy PNA nie jest dostępne, ale bieżący podany wiek ma precyzję
ukończonych miesięcy i 0 lat, adapter może użyć obwiedni miesięcznej
**już istniejącej polityki TT postnatalCalendarAge**.
Jej minMonthSpanDays[m] i maxMonthSpanDays[m+1] wyznaczają
konserwatywny cały przedział dni, nie dokładny wiek. Nie kopiujemy
tabeli do danych klinicznych, nie tworzymy DOB, stałej długości
miesiąca ani środka przedziału.

Przykłady tej arytmetyki: **3 ukończone miesiące → 89–123 dni**
mieści się w 31–180 i pozwala wybrać 0,13. **1 miesiąc → 28–62**
oraz **5 miesięcy → 150–184** przecinają grupy i nie dają pojedynczej
mediany. Zdezaktualizowany lub należący do innej osoby PNA nie
zastępuje aktualnie wpisanego wieku. Obwiednia jest kwalifikacją
aplikacji, nie nową normą lub definicją wieku autorów.

Cały PNA musi pasować do jednej grupy, aby możliwe było pojedyncze
porównanie. **[30,31]** daje 0,19 i 0,13, a **[180,181]** daje
0,13 i 0,08 jako dwie oddzielne informacje; bez wspólnej mediany,
punktu lub krotności. Nie średniujemy i nie wybieramy bliższej grupy.
Brak pokrycia części wieku nie uprawnia do odniesienia dla pozostałej.

## Kontekst pacjentki i niezależność interpretacji

Porównanie wyniku wymaga bieżącej zgodnej tożsamości/płci/analitu,
jednej grupy PNA, całego zgodnego znanego GA, zgłoszonej surowicy
i LC-MS/MS. Dokładne GA **259–294 dni, 37+0–42+0**, jest
konserwatywną polityką aplikacji; nie odzyskaną z zapisu autorów
konwencją dnia granicznego. Cały możliwy GA musi się w niej mieścić.
Nie zastępujemy górnej granicy GA samym podanym dolnym tygodniem.

Nieznane GA, materiał lub metoda pozostawiają **informację o źródle**,
bez punktu pacjentki i ilorazu. Metoda źródła nie potwierdza metody
próbki. Znane wcześniactwo, niezgodny materiał/metoda, leczenie
hormonalne lub stymulacja wstrzymują zestawienie. Znane SGA/LGA
pozostają niezgodnością ze źródłową populacją. Brak wywiadu nie
oznacza potwierdzonego braku leczenia lub pełnej zgodności kohorty.
Korzystamy z istniejących danych; bez nowej ankiety, selektora
publikacji, potwierdzania metody lub Tannera.

Po zmianie osoby, płci, analitu, kontekstu, blokadzie lub odtwarzaniu
historycznego wyniku karta usuwa poprzednie odniesienie i punkt.
Nie dopisuje mediany, krotności lub współrzędnych do historii,
migawki laboratoryjnej, karty pacjenta i synchronizacji.

Johannsen zachowuje osobne górne odniesienie i własną kwalifikację.
Nie łączymy jego górnej wartości z medianą Busch w jeden RI.
Od kwalifikowanych **6 miesięcy kalendarzowych** pozostaje Kushnir,
a później Madsen; nowa mediana 0,08 ich nie zastępuje. Mayo i
kanoniczne oceny laboratoryjne pozostają odrębne. Męski TT i inne
hormony nie korzystają z tych żeńskich trzech komórek.

## Prezentacja i wymagane regresje

Jedna zwarta karta pokazuje wybraną medianę grupy, źródło i — przy
pełnej kwalifikacji — dokładny wynik oraz krotność mediany. Krotność
nie jest SDS, centylem ani odchyleniem od normy. Samo położenie ponad
medianą nie jest alarmem klinicznym. Nie tworzymy statusu w normie/
poza normą, pasma zielonego lub progu pilności z mediany.

Skala zaakceptowanej karty to **0–3 × mediana wybranej grupy**;
nie zależy od wartości pacjentki. Po zmianie jednostki wynik i mediana
korzystają z tego samego istniejącego przelicznika TT. Ponad osią
strzałka pokazuje prawdziwą wartość; nie obcina ani nie przesuwa
mediany. Zmiana grupy skali nie jest nową krzywą hormonalną wieku.
Dotychczasowe formatowanie i reguły istotnego przekroczenia własnego
zakresu pozostają oddzielne od porównania mediany.

Tylko dokładne stężenie ma pojedynczy punkt i krotność. **<0,10,
>0,20, <LOD, <LOQ** pozostają operatorami po konwersji; źródłowy
LOD/LOQ nie uzupełnia nieznanej granicy wyniku pacjentki. Mediana
źródła może pozostać widoczna, bez fikcyjnej dokładnej kropki.

| Fikcyjne wejście przy zgodnych pozostałych warunkach | Oczekiwane zachowanie produkcyjnych funkcji/UI |
| --- | --- |
| F12 dni, cały PNA [11,12], TT 0,18 | Mediana 0,19; dokładny punkt i krotność, bez nowego werdyktu normy |
| F3 ukończone miesiące bez DOB/PNA, TT 0,26 | Obwiednia 89–123; mediana 0,13, krotność 2,00 |
| F5 mies. 29 dni, PNA [181,182], cały wiek przed 6 mies., TT 0,09 | Mediana 0,08 trzeciej grupy; nie zastępczy Kushnir ani LOQ 0,10 |
| F1 miesiąc / F5 miesięcy bez PNA | Obwiednia odpowiednio 28–62 / 150–184; dwie mediany, brak pojedynczego punktu/krotności |
| PNA [30,31] / [180,181] | Odpowiednio 0,19/0,13 lub 0,13/0,08; bez uśredniania |
| PNA 0–4 / PNA przekraczający 184 / wiek obejmujący 6 miesięcy | Bez nowej mediany dla części wieku |
| Nieznana metoda, materiał albo GA | Informacja źródłowa bez punktu i krotności |
| Znane wcześniactwo/osocze/immunoassay/leczenie | Zestawienie wstrzymane; bez źródła zastępczego |
| <0,10 / >0,20 / <LOD | Źródłowa mediana zachowana przy kwalifikującym wieku, operator bez dokładnego punktu i ilorazu |
| Kwalifikowane ≥6 mies. / historia / zmiana osoby / lock | Dotychczasowy Kushnir / bez ponownej oceny / usunięte stare odniesienie |

Regresje wywołują rzeczywisty silnik, adapter, parser/konwersje i UI,
sprawdzają granice dni i kalendarza, split, brak DOB, kontekst,
nierówności, reset osoby, desktop/mobile, pełny ekran oraz rzeczywiste
zimne uruchomienie i aktualizację PWA offline. Wykonane wyniki i
wszystkie kontrole końcowego SHA podaje PR; ta lista nie jest deklaracją
zaliczenia kontroli.
