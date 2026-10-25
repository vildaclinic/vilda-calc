# Cit/Cr w próbce punktowej — źródła, jednostki i polityka odniesień

Stan i odczyt źródeł: **24.10.2026**. Zakres: `CitCr_spot`, czyli iloraz
cytrynianów i kreatyniny w tej samej próbce moczu, albo gotowy iloraz
z laboratorium. Dokument nie dotyczy progów dobowego wydalania cytrynianów.

Właściciel zaakceptował 24.10.2026
[makietę przed/po na desktopie i telefonie](https://vilda-citcr-audyt-20261024.maciej-flader.chatgpt.site),
dobór źródeł oraz ostatnie uproszczenie jednostek. Źródło zaakceptowanej
makiety: `7cad8a3db257dc011cc8a3d7659d22ec59e83359`. Akceptacja tej polityki
i testy produkcyjnego kodu nie oznaczają nowej walidacji klinicznej.

## Przyjęte źródła i rzeczywiste granice wiedzy

### PathWest UCTCR — dolna granica u dzieci

[Citrate (Spot Urine), pełny katalog PathWest](https://pathwesttd.health.wa.gov.au/testdirectory/testdetail.aspx?TestID=2477),
ostatnia aktualizacja **13.08.2025**, odczyt 24.10.2026. Przeczytano pełny
opis materiału, odniesień, przygotowania i znaczenia klinicznego.

| Wiek wydrukowany w źródle | Dolna granica, mmol/mmol | Dokładne przeskalowanie, µmol/mmol |
|---|---:|---:|
| Od urodzenia do <3 lat | >0,30 | >300 |
| 3–<18 lat | >0,10 | >100 |

Jest to **dolna granica**, bez podziału według płci i bez opublikowanej
granicy górnej. Źródło używa ścisłego `>`: dokładnie 0,30 albo 0,10
mmol/mmol nie spełnia kryterium wyniku nieobniżonego. Nie zamienia się tego
znaku na `≥` i nie dopisuje normy górnej z innego laboratorium.

Katalog nie ujawnia metody oznaczenia, liczebności i pochodzenia kohorty
referencyjnej ani walidacji w wieku wcześniaczym. Obejmuje wiek od urodzenia,
ale nie dostarcza osobnego zweryfikowanego profilu wcześniaczego.
Ukończone lata 0, 1 lub 2 wystarczają do pierwszego pasma; nie wymaga się
nowego pytania o miesiące lub dni. Dokładnie 3 lata wybierają drugie pasmo,
a dokładnie 18 lat kończy zastosowanie tego profilu.

PathWest nie wykonuje tego badania punktowego od 18 lat i wskazuje wtedy
zbiórkę dobową. To reguła konkretnego laboratorium, a nie dowód, że każdy
punktowy Cit/Cr u dorosłych jest nieważny.

### Newcastle NHS — oddzielne zakresy dla dorosłych

[Citrate, urine, pełny katalog Newcastle Hospitals NHS](https://laboratories.newcastle-hospitals.nhs.uk/test-directory/citrate-urine/),
aktualizacja **20.11.2025**, odczyt 24.10.2026. Katalog wyraźnie dopuszcza
losową próbkę moczu dorosłych; opis dobowej zbiórki jest odrębny.

| Płeć źródła | Zakres źródłowy, mmol/mmol | Dokładne przeskalowanie, µmol/mmol |
|---|---:|---:|
| Mężczyźni | 0,04–0,33 | 40–330 |
| Kobiety | 0,11–0,55 | 110–550 |

Katalog nie drukuje granic wieku kohorty, maksymalnego wieku, metody
oznaczenia ani pochodzenia i liczebności populacji referencyjnej.
**Wybór tego źródła od ≥18 lat oraz włączenie obu końców przedziału są
jawną polityką aplikacji**, a nie dosłownymi operatorami lub granicami wieku
publikowanymi przez Newcastle. Nie dopisuje się limitu wieku starszego
pacjenta z innego kalkulatora.

Płeć pobiera się ze znanych danych pacjenta. Jej brak u dorosłego pozostawia
liczbę bez wybranego zakresu; nie wybiera się płci domyślnej i nie tworzy
wspólnego zakresu 40–550. W dziecięcym profilu PathWest płeć nie jest
warunkiem porównania.

Oba źródła są osobnymi profilami laboratoryjnymi. Przejście w wieku 18 lat
nie tworzy fizjologicznej krzywej, nie jest biologicznym skokiem i nie podlega
interpolacji. Porównanie jest orientacyjne. Pierwszeństwo ma właściwy zakres
laboratorium wykonującego oznaczenie, gdy różni się od wybranego profilu.

## Znaczenie wyniku i przygotowanie próbki

Przy obniżonym wyniku zaakceptowano dwa zdania:

> Obniżony Cit/Cr może wskazywać na słabszą ochronę przed kamicą wapniową.
> Bywa związany m.in. z kwasicą metaboliczną lub hipokaliemią; sam wynik
> nie ustala przyczyny.

Pełny PathWest w części **Clinical Use** opisuje hamowanie tworzenia
kamieni przez cytryniany oraz związek niskiego poziomu z kwasicą metaboliczną
i hipokaliemią. Uzupełniające źródło odczytano w całości:
Hoppe B, Kemper MJ, *Diagnostic examination of the child with urolithiasis
or nephrocalcinosis*, Pediatr Nephrol 2010;25:403–413, publikacja elektroniczna
23.12.2008, [DOI 10.1007/s00467-008-1073-x](https://doi.org/10.1007/s00467-008-1073-x),
[pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC2810372/).
Tabela 4 dotyczy ilorazów w próbce punktowej; tabela 3 i tekst omawiają
kwasicę oraz naturalne inhibitory kamicy. Starszych progów z tej pracy
nie przenosi się do bieżącego profilu PathWest.

Pojedynczy iloraz nie jest pomiarem dobowej utraty cytrynianów, nie rozpoznaje
kamicy lub kwasicy cewkowej i nie stanowi instrukcji leczenia. Wynik
nieobniżony nie wyklucza choroby ani nie wyznacza celu terapii. PathWest
nie daje kategorii „powyżej normy”; większa wartość w tym profilu pozostaje
nieobniżona. Wynik ponad dwustronny zakres Newcastle opisuje się jako
„Powyżej zakresu laboratoryjnego”, bez automatycznego rozpoznania choroby.

Rodzaj próbki oraz znane czynniki kliniczne pozostają kontekstem. Znana
zbiórka czasowa/DZM daje poprawną liczbę, lecz nie otrzymuje wybranej normy
punktowej; dotyczy to także gotowego raportu o znanym rodzaju próbki.
Znany bieżący kontekst wcześniaczy pozostaje bez osobnej normy. Dawny wywiad
wcześniactwa u starszego dziecka sam w sobie nie odbiera porównania.
Nie dodano obowiązkowej ankiety ciążowej, diety, leków, postu, porannej próbki,
stabilności czynności nerek, AKI ani IFCC.

Instrukcje przechowywania i przygotowania różnią się między laboratoriami.
PathWest opisuje zakwaszenie pH <3,6 w ciągu 30 minut, inne laboratoria
dopuszczają próbkę bez konserwantu lub wymagają innego postępowania.
Nie tworzy się z tego wspólnego pytania o zakwaszenie lub uniwersalnego
polecenia zmiany pH. Obowiązuje protokół rzeczywistego laboratorium;
znane problemy nie są wymazywane i nie wylicza się nieopisanej korekty wyniku.

## Minimalne dane i jednostki bez powtórzeń

Pierwszy i domyślny tryb **„Oblicz ze stężeń”** wymaga cytrynianów
i kreatyniny w moczu z jednostkami. Wspólna próbka jest opisanym założeniem
przy braku przeciwnej informacji. Znane różne próbki blokują dzielenie
stężeń. Drugi tryb **„Gotowy wynik Cit/Cr”** przyjmuje pojedynczy raportowany
iloraz wraz z jednostką i znakiem, jeśli występuje; działa niezależnie
od informacji o parze zachowanych stężeń.

Sam iloraz nie wymaga wieku, płci, krwi, masy, wzrostu, BSA, objętości
lub czasu zbiórki. Wiek, a dla dorosłych także płeć, są używane wyłącznie
do porównania i pobierane z istniejących danych pacjenta. Ich brak
nie blokuje poprawnego wyniku liczbowego.

Selektor cytrynianów ma **cztery unikalne jednostki: µmol/L, mmol/L,
mg/L, mg/dL**. Selektor gotowego ilorazu zachowuje siedem zapisów spotykanych
w raportach: µmol/mmol, mmol/mol, mmol/mmol, mol/mol, mg/mg, mg/g i mg/mmol.
Równoważne zapisy pozostają dostępne, by lekarz mógł przepisać raport bez
własnych przeliczeń.

Przy jednostce masowej pod polem jest czytelna postać z raportu i „Zmień”,
otwierające wybór kwasu cytrynowego bezwodnego, jonu cytrynianowego lub
„Nie podano”. Przy jednostkach molowych ten element znika. Nowy wpis
bez znanej postaci nie staje się automatycznie kwasem lub jonem. Znana
postać pozostaje zachowana przy zmianie skali mg/L ↔ mg/dL; wyczyszczenie
formularza usuwa ten kontekst. Brak postaci pozwala obliczyć iloraz masowy,
lecz nie uzasadnia konwersji do SI ani porównania z molową normą.

Historyczne pole `Cit_Cr_spot` przed rozszerzeniem było jednoznacznie
opisane jako **kwas cytrynowy w mg/dL**. Odtworzenie tej konwencji dla starej
sesji bez nowych pól jednostki/postaci jest zgodnością wsteczną z treścią
tamtego pola, a nie założeniem dotyczącym dowolnego nowego raportu „cytryniany”.
Wcześniej utraconej precyzji lub nieznanych faktów nie odtwarza się.

## Stałe i konwersje

| Wielkość | Deklarowana stała, mg/mmol | Pełne źródło fizyczne |
|---|---:|---|
| Kwas cytrynowy bezwodny, C₆H₈O₇ | 192,1235 | [NIST Chemistry WebBook, CAS 77-92-9](https://webbook.nist.gov/cgi/cbook.cgi?ID=C77929) |
| Jon cytrynianowy, C₆H₅O₇³⁻ | 189,099 | [ChEBI:16947](https://www.ebi.ac.uk/chebi/CHEBI:16947), masa średnia |
| Kreatynina, C₄H₇N₃O | 113,12 | [ChEBI:16737](https://www.ebi.ac.uk/chebi/CHEBI:16737), masa średnia 113,120 |

Sam tytuł „citric acid/citrate”, ogólna nazwa LOINC, odczynnik, kalibrator
lub sól używana w oznaczeniu nie dowodzą masowej podstawy raportu.
Nie podstawia się masy cytrynianu sodu ani monohydratu kwasu. Jednostka
molowa nie wymaga założenia o kwasie lub jonie.

Niech `r` oznacza iloraz na wspólnej osi **µmol/mmol**, a `M` właściwą
masę cytrynianów i `MCr = 113.12 mg/mmol`.

| Jednostka gotowego wyniku `x` | Wartość `r` w µmol/mmol |
|---|---|
| µmol/mmol lub mmol/mol | `x` |
| mmol/mmol lub mol/mol | `1000 × x` |
| mg/mg | `1000 × x × MCr / M` |
| mg/g kreatyniny | `x × MCr / M` |
| mg/mmol kreatyniny | `1000 × x / M` |

Ze stężeń molowych: `r = Cit[µmol/L] / Cr[mmol/L]`.
Cit mmol/L ×1000 daje µmol/L; Cr µmol/L ÷1000 daje mmol/L.
Cr mg/dL ×10 ÷113,12 daje mmol/L. Ze stężeń masowych najpierw
uzgadnia się objętość, a następnie `q[mg/mg] = Cit[mg/L] / Cr[mg/L]`.
Stężenie w mg/dL ×10 daje mg/L. Masa kreatyniny może być przeliczona
niezależnie od nieznanej postaci cytrynianów.

Przy tych samych dwóch stężeniach masowych wybór kwasu/jonu nie zmienia
samej liczby w mg/mg. Zmienia o około **1,6%** przeliczenie do osi molowej
i próg normy w jednostce masowej, co może zmienić ocenę przy granicy.
Próg 100 µmol/mmol odpowiada **0,16984043493635… mg/mg jako kwas** albo
**0,16716672560113… mg/mg jako jon**. Nie wolno połączyć tych konwencji.
Stała Cr 113,12 odpowiada 88,4016973… µmol/L na 1 mg/dL. Starsze 88,4
jest bliskim przybliżeniem; nowa ścieżka konsekwentnie stosuje jedną
zadeklarowaną stałą, bez mieszania skali przy porównywaniu progów.

Karta i domyślne tabele w Szczegółach używają **tej samej jednostki co wynik
i tego samego formatera granic**. Oryginalne źródłowe mmol/mmol są dostępne
w osobnej zwiniętej sekcji. Przy przeliczonych zaokrąglonych granicach
pokazuje się `≈`; ocena korzysta z pełnej wartości. Sama zmiana etykiety
jednostki przy pozostawieniu tej samej liczby nie jest konwersją raportu.

## Granice, precyzja, zapis i historia

- Puste pole nie staje się zerem. Cit=0 przy Cr>0 daje 0; Cr=0, ujemne
  stężenia, NaN, nieskończoność lub numeryczne przepełnienie/niedomiar
  nie tworzą poprawnego wyniku. Jednostkowo niespójny limit surowej Cr
  nie blokuje równoważnych stężeń po zmianie jednostki.
- Ocena poprzedza formatowanie, z dokładnych ułamków dziesiętnych wejścia
  i stałych. Nie stosuje się epsilona zmieniającego próg. Mały dodatni wynik
  pozostaje dodatni w karcie i zapisie; wynik nie jest ponownie obcinany
  do dwóch lub trzech miejsc dziesiętnych.
- Gotowe `<`, `≤`, `>` i `≥` są przedziałami. Przy dziecięcym kryterium
  `>100`, raport `>100` spełnia normę, `≤100` jej nie spełnia, a `≥100`
  pozostaje niejednoznaczny. Przy zamkniętym dorosłym `[40,330]` dokładne
  końce należą do zakresu, `<40` jest poniżej, `>330` powyżej,
  a `≤40` i `≥330` przecinają kategorie. Niejednoznaczność jest neutralna.
- Cenzurowana granica nie jest dokładnym punktem wykresu lub trendu.
  Nierówności stężeń nie są dzielone jak zwykłe liczby; wymagają odrębnego
  rachunku przedziałowego.
- Snapshot utrwala pełną liczbę i zapis wejściowy, znak, jednostki,
  postać masową, stężenia, wiek i płeć użyte przy ocenie, rodzaj próbki,
  znane fakty, stałe, źródło, jego wersję, zakres i ocenę z chwili zapisu.
  Brak oceny ma `outOfRange:null`, a nie `false`.
- Historia nie przelicza starej oceny dzisiejszym wiekiem/profilem i nie
  pożycza starszej normy do nowszego wyniku bez normy. Serie rozdziela
  jednostka **i postać masowa**. Edycja wartości, jednostki lub normy
  unieważnia niepasujący snapshot; stary wpis zachowuje czytelność bez
  dopisywania utraconych danych.
- Niepełna sesja nie zachowuje starych Cit/Cr. Odtworzenie łączy zachowane
  i bieżące pola sesji z pierwszeństwem jawnego bieżącego wpisu, także pustego.
  Brak pola nie jest zgodą na użycie dawnego DOM. Jawne „różne próbki”
  ma pierwszeństwo przed starym zaznaczeniem wspólnej próbki.

## Architektura i kontrakty regresji

Normy, ograniczenia, źródła i reguły wyboru są w osobnych danych
`clcr_citcr_reference_data.js`: polityka `CITCR_PATHWEST_NEWCASTLE_2026_10`,
wersja 1; profile `PATHWEST_CITCR_SPOT_2025` i `NEWCASTLE_CITCR_RANDOM_2025`,
wersje 1. Bezstanowy `VildaClcrCitcr.evaluate(input, policy)` w
`clcr_citcr.js` otrzymuje politykę jako argument. Wynik niesie źródło,
populację i zakres; renderer nie utrzymuje własnych progów. Snapshot
`clcr-citcr`, wersja 1, zachowuje wynik wraz z jego kontekstem.

| Syntetyczne wejście / stan | Oczekiwany wynik |
|---|---|
| 8 lat; Cit jako kwas 10 mg/dL; Cr 100 mg/dL | 0,100 mg/mg; 58,878794108998… µmol/mmol; obniżony wobec >100; norma przy liczbie >≈0,1698 mg/mg. |
| Te same stężenia, podstawa jonowa | Nadal 0,100 mg/mg, lecz 59,820517295173… µmol/mmol i próg >≈0,1672 mg/mg. |
| 8 lat; gotowe 0,168 mg/mg jako kwas / jako jon | Odpowiednio nie spełnia / spełnia dolną granicę; bez dowolnego założenia postaci. |
| 2 lata; 300 / 300,001 µmol/mmol | Nie spełnia / spełnia ścisły próg >300. |
| Dokładnie 3 lata; 100 / 100,001 µmol/mmol | Nie spełnia / spełnia ścisły próg >100. |
| Mężczyzna 18 lat; 40 / 330 / 39,999 / 330,001 µmol/mmol | W zakresie / w zakresie / poniżej / powyżej; włączenie końców według polityki aplikacji. |
| Kobieta 18 lat; 110 / 550 µmol/mmol | Obie granice w zakresie żeńskim. |
| Dorosły, płeć nieznana / wiek nieznany | Liczba bez wybranej normy, bez wspólnego zakresu płci. |
| Cit 0 / pusty / mały dodatni; Cr dodatnia | 0 z oceną / brak liczby / zachowana dodatnia liczba. |
| Cr 600 mg/dL i jego odpowiednik w µmol/L | Oba dopuszczone, bez blokady zależnej wyłącznie od surowego progu 50 000. Przy zadeklarowanej stałej odpowiednik 600 mg/dL to 53 041,018… µmol/L. |
| 8 lat; >100 / ≥100 / ≤100 µmol/mmol | Spełnia / niejednoznaczny / nie spełnia; znak zachowany, bez dokładnego punktu trendu. |
| Nieznana postać masowa / znana zbiórka czasowa / bieżący wcześniaczy kontekst | Poprawna liczba bez nieuzasadnionej normy, z konkretnym powodem. |
| Niepełna sesja, tylko zachowane pola lub jawnie puste Cit/Cr | Brak dziedziczenia poprzednich stężeń; puste wejście ma pierwszeństwo. |
| Zapis i odczyt po zmianie wieku, jednostki lub profilu | Zachowana precyzja i pierwotna ocena; rozdzielone serie; brak pożyczania normy. |

Regresje muszą wywoływać rzeczywiste funkcje produkcyjne, w tym
`VildaClcrCitcr.evaluate`, zapis i odtwarzanie sesji oraz historię.
Przykłady są jednoznacznie fikcyjne. Wyniki wykonanych testów i kontroli
CI podaje PR; dokument nie zastępuje tych kontroli.

## Rozpatrzone alternatywy i nieodczytane źródła

| Źródło | Ustalenie i powód niewłączenia do domyślnej polityki |
|---|---|
| [St. Boniface CITU](https://apps.sbgh.mb.ca/labmanual/test/view?seedId=29448) oraz [biuletyn 16.01.2026](https://healthproviders.sharedhealthmb.ca/download/706/clinical-biochemistry/45857/cpc-urine-citrate-method-update.pdf) | Pełne źródła: random, 1–11 mies. 0,14–2,41; 1–9 lat 0,07–0,67; 10–17 lat 0,03–0,50 mmol/mmol; brak <1 mies. Biuletyn opisuje Cobas Pro enzymatycznie od 26.01.2026 i wyniki około 13% wyższe, bez instrukcji podniesienia bieżących zakresów o 13%. To odrębny profil; jego górnej granicy nie dodaje się do PathWest. |
| [ARUP 0020852](https://ltd.aruplab.com/Tests/Pub/0020852) | Pełny katalog i oficjalny syntetyczny raport: random dopuszczony, enzymatycznie, ≥150 mg/g od 1 roku. Nie potwierdzono podstawy masowej do konwersji tej normy na SI; nazwa i LOINC 51792-0 tego nie rozstrzygają. |
| [Mayo CITRA](https://www.mayocliniclabs.com/test-catalog/Overview/606715) | Pełny katalog i czterostronicowy PDF: brak ustalonych RI, interpretacyjne P5 0,176 mg/mg w wieku 5–18 lat; bez ekstrapolacji na niemowlęta/dorosłych i bez górnej normy. Pełnej pierwotnej pracy Srivastava 2009 nie uzyskano. |
| [Labcorp 123880](https://www.labcorp.com/tests/123880/citric-acid-citrate-creatinine-ratio-random-urine) | Pełny katalog i oficjalny przykład z 2016 potwierdzają M 3–72 i K 5–96 mg/g. Nie „naprawia się” tych źródeł domniemanym mnożnikiem 10; różnice między laboratoriami są rzeczywiste. |
| [Kirejczyk i wsp. 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC4147207/) | Pełny tekst: 2334 zdrowych dzieci 2–18 lat, pojedyncza zbiórka 24 h, zwykła dieta; tabela P5/P10/P25/P50. To dane dobowe, a P50 jest medianą, nie górną granicą normy punktowej. |
| [HSL, październik 2025](https://www.hslpathology.com/media/bfent5pj/helix-ref-ranges-oct-2025.pdf) | Pełnego PDF nie uzyskano (403). Indeksowane wiersze „Any Age/Unknown” nie uzasadniają wdrożenia niezweryfikowanego wspólnego zakresu płci. |
| [Malaki/Seyedzadeh 2023](https://doi.org/10.4103/1319-2442.391007) | Tylko abstrakt, pełny tekst wydawcy niedostępny (402). Nie przejęto nieodczytanych metod i norm jako pełnego zweryfikowanego źródła. |

Pełne odczytane źródła przechowano w prywatnych dowodach audytu, bez
publikowania kopii PDF/HTML lub danych pacjentów w publicznym repozytorium.
Źródeł z blokadą dostępu nie przedstawia się jako odczytanych w całości.
