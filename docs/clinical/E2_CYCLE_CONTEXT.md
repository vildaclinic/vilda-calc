# Estradiol — nieznana faza cyklu

Stan: 19 października 2026. Zmiana kwalifikacji istniejących odniesień,
bez nowych norm, median, progów i przeliczników. Właściciel zlecił wdrożenie
po propozycji pokazania alternatyw bez domyślnej fazy folikularnej.

## Zachowanie

Wynik i przeliczenie jednostek są dostępne od razu. U dorosłej kobiety
nieustalony kontekst reprodukcyjny daje cztery oddzielnie podpisane
odniesienia: fazę folikularną, pik owulacyjny, fazę lutealną i stan po
menopauzie. Są to alternatywy, bez klasyfikacji każdego wariantu i bez
wspólnego werdyktu, strzałki lub koloru sugerującego prawidłowość.
Nie wybieramy zakresu najlepiej pasującego do wyniku i nie tworzymy
wspólnej obwiedni. Formularz nie wymaga dodatkowej odpowiedzi.

Znana faza lub menopauza korzysta z dotychczasowego odpowiedniego wiersza.
Wiek, wiek menarche i pojedyncze stężenie nie ustalają fazy ani menopauzy.
Wiersze dorosłych zachowują istniejącą kwalifikację `life_stage: adult`;
nie dopisujemy źródłowej granicy wieku, której źródło nie podaje.
U dorosłej kobiety zachowane stadium Tannera I–V nie zastępuje kontekstu
cyklu: nie może przywrócić pojedynczej normy przez wcześniejszy wiersz
stadium. Jawny wybór fazy ma pierwszeństwo. Pediatryczne wiersze stadium
i wieku zachowują dotychczasowe działanie.

U dorosłej kobiety znana ciąża (`pregnancy_t1`, `pregnancy_t2`, `pregnancy_t3`) lub inna
nieobsługiwana niepusta wartość kontekstu nie jest kontekstem nieznanym.
Nie uruchamia ani normy folikularnej, ani czterech odniesień zwykłego
cyklu/menopauzy: dostępne pozostaje przeliczenie, bez dopasowanego RI.
Pusty kontekst lub jawne `unknown` daje warianty opisane wyżej.

## Liczby i pochodzenie

Zachowujemy istniejące aplikacyjne wiersze Tietz 2018 w pmol/L:
folikularny 70–290, owulacyjny 380–1460, lutealny 200–770 oraz
postmenopauzalny zapisany liczbowo jako 0–110. Ich źródła i przeliczniki
nie zmieniają się. Pełna odpowiednia tabela *Tietz Textbook of Clinical
Chemistry and Molecular Diagnostics*, wydanie 6, 2018, nie była dostępna
w tym przeglądzie. Nie deklarujemy ponownego potwierdzenia tych liczb,
metody oznaczenia ani pełnej charakterystyki populacji referencyjnej.

Istniejący opis postmenopauzy podaje `<110 pmol/L`, podczas gdy wiersz
numeryczny zapisuje 0–110, a dotychczasowa ocena znanej menopauzy obejmuje
110. Ten PR zachowuje wcześniejszą semantykę znanego kontekstu;
nie rozstrzyga przy okazji operatorów tych norm. Zero w takim zapisie
nie dowodzi dolnego RI równego zero, LOD ani LOQ. Nie wyprowadzamy granic
oznaczalności z RI i nie zastępujemy wyników `<LOD`/`<LOQ` dokładnym punktem.

## Pełne źródła uzasadniające zależność od kontekstu

- [Mayo Clinic Laboratories EEST/81816](https://www.mayocliniclabs.com/test-catalog/Overview/81816),
  pełny HTML i [Test Definition PDF](https://www.mayocliniclabs.com/test-catalog/download-setup?format=pdf&unit_code=81816),
  7 stron, odczyt 19.10.2026: Clinical Information s. 2, Reference Values
  s. 3 oraz Interpretation s. 4. Katalog surowicy LC-MS/MS, pg/mL,
  oddziela premenopauzę i postmenopauzę oraz opisuje zmienność w cyklu.
  Nie przedstawia pełnej kohorty ani jej reprezentatywności. Data
  wygenerowania PDF nie jest datą rewizji zaleceń.
- Anckaert i wsp., *Practical Laboratory Medicine* 25 (2021) e00211,
  DOI [10.1016/j.plabm.2021.e00211](https://doi.org/10.1016/j.plabm.2021.e00211):
  przeczytano zachowany pełny tekst pierwotny i suplement, w tym Methods,
  tabelę 1 i Discussion. Badanie obejmowało 85 kobiet z naturalnymi
  owulacyjnymi cyklami, UE 18–37/USA 22–37 lat; surowica, Roche Elecsys
  Estradiol III/cobas e801, pmol/L. Próbki zbierano podczas jednego cyklu.
  Wykluczono m.in. antykoncepcję hormonalną, ciążę i laktację. Populacja
  nie potwierdza norm dla menopauzy, ciąży ani innych metod oznaczenia.

Te źródła uzasadniają usunięcie domysłu fazy. Nie stają się pochodzeniem
dotychczasowych liczb Tietz i nie potwierdzają metody próbki pacjentki.
Krzywe wieku, mediany i edukacyjny schemat cyklu pozostają odrębne.
Szczegóły przeglądu:
[zapis źródłowy](hormone-lifespan/evidence/e2-cycle-context-policy-review-2026-10-19.json).

## Przypadki syntetyczne i zapis

- F, 30 lat, E2 50 pmol/L, nieznany kontekst → wynik 50 pmol/L i dostępne
  przeliczenia; cztery odniesienia bez klasyfikacji. Wcześniej: pojedynczy
  zakres folikularny 70–290 i werdykt „poniżej”.
- Ten sam wynik i znana faza folikularna → dotychczasowy zakres 70–290
  i dotychczasowa klasyfikacja. Analogicznie pozostają znane inne fazy
  i menopauza.
- Dorosła z zapisanym Tanner V i nieznaną fazą → te same cztery warianty;
  ze znaną fazą lutealną → odpowiedni dotychczasowy zakres lutealny.
- Dorosła kobieta, znana ciąża lub nieobsługiwany kontekst → przeliczenie, bez dopasowanego
  RI i bez wariantów zwykłego cyklu.

Nowy wynik z nieznanym kontekstem zapisuje dotychczasowy snapshot v1 jako
`unavailable`, bez klasyfikacji i granic jednego zastosowanego zakresu,
z zachowanym pomiarem i kontekstem. Lista wariantów nie staje się normą
próbki. Nie dodajemy `lab.norm` ani nowego schematu. Dawne zapisane oceny
są odtwarzane bez przeliczenia aktualną polityką; wcześniejszy domyślny
werdykt nie jest automatycznie przepisywany.

Zmiana wpływa na interpretację kliniczną przez usunięcie nieuprawnionego
domysłu fazy. Testy techniczne nie stanowią walidacji medycznej; przegląd
kliniczny i scalenie pozostają decyzją właściciela.
