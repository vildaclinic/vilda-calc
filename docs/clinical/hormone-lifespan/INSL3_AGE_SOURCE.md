# INSL3 — edukacyjny odczyt źródłowy według wieku

Stan i akceptacja zakresu przez właściciela: **24 października 2026**.
Dotyczy wyłącznie informacji w istniejącym rozwijanym „O wykresie i źródła”
przy wybranym męskim INSL3. Jest to nowa informacja medyczna o modelowanej
medianie źródłowej, odrębna od względnej ilustracji i interpretacji wyniku.
Akceptacja tego zakresu oraz testy techniczne **nie są walidacją kliniczną
modelu** ani zgodą na normy, SDS lub przelicznik INSL3.

## Pliki i kontrakt wykonania

- [`insl3-age-source-data.json`](insl3-age-source-data.json) przechowuje
  odrębne dane źródłowe i ich pochodzenie;
- [`insl3-age-source-policy.json`](insl3-age-source-policy.json) przechowuje
  domenę i reguły zastosowania;
- [`vilda_insl3_age_source.js`](../../../vilda_insl3_age_source.js) udostępnia
  `window.VildaInsl3AgeSource.read(data, policy, context)`;
- wykres otrzymuje `insl3AgeSourceData` i `insl3AgeSourcePolicy` przez runtime.

Czytnik przyjmuje dane i politykę jako argumenty, bez stałych norm
wbudowanych w silnik. Odczyt ma rodzaj edukacyjnej informacji źródłowej;
`valueKind` odróżnia `approximate-value` od `approximate-median-range`.
Nie jest profilem `VildaHormoneLifespanReference.evaluate()` i nie wymaga
fikcyjnego wyniku.

## Źródło i pochodzenie odczytu

[Albrethsen J. i wsp., *Evaluation of Serum Insulin-like Factor 3
Quantification by LC-MS/MS as a Biomarker of Leydig Cell Function*,
JCEM 2020;105(6):1868–1877](https://doi.org/10.1210/clinem/dgaa145).
Pierwsza publikacja: 25.03.2020; wersja po korekcie i składzie: 23.04.2020.
Sprawdzono cały końcowy PDF, szczególnie Subjects/Methods s. 1869–1870,
ryc. 1A s. 1870 oraz opis oznaczenia s. 1872–1874. To nie odrębne
podłużne badanie pokwitania o DOI `10.1210/clinem/dgaa496`.

| Artefakt audytu | SHA-256 |
| --- | --- |
| Pełny końcowy PDF, 10 stron, 11 278 353 bajty | `022d8743db5658393fcb50d465cd540590e31bc721f736a0b55fe80847e4d1fc` |
| Dostarczony eksport PowerPoint ryc. 1 (`Figure.pptx`) | `edd744309066842d2e8c2504a6bd1c1705a7c62d0200568df5839562c10270b5` |
| Końcowy natywny ślad odczytu każdej kolumny obrazu | `6d12d51185ae614633b9cc0ee036cbc6f4672e624fb40e8c52ac61a89ba7aed1` |
| Końcowa konfiguracja wyboru kreski i błędu graficznego | `3ad71db3a066f2bf7d4f709314b3383102c28b5bdb9aeda71fd97f4d2187eaa4` |

W repozytorium utrwalamy pochodzenie i dane odczytu, bez redystrybucji
pełnego PDF lub plików właściciela. Ryc. 1 jest płaskim rastrem
4049×1320 pikseli, osadzonym na trzeciej stronie PDF. Nie ma osobnych
wektorów krzywych lub punktów. Sześć dostarczonych PPTX zawiera płaskie
obrazy, bez edytowalnego modelu, arkusza lub współczynników; ryc. 1 ma
taką samą geometrię jak PDF. W 732 wcześniej odczytanych kolumnach
maksymalna różnica środka kreski między PDF i PPTX wyniosła około
0,00146 µg/L. PPTX nie odsłaniają zasłoniętego odcinka 18–19 lat.

Kontrolowana digitizacja zachowuje **732 czytelne kolumny w 17 odcinkach**,
około 11,806–65,125 roku, z przerwami. Niezależny odczyt potwierdził
tożsamość środkowej linii; kontrola techniczna objęła kalibrację,
grubość tuszu, progi koloru i perturbacje podziałek. Współczynniki
autorskiego GAMLSS, jego rodzina, dane indywidualne i reguła cenzury
nie zostały odzyskane. Nie dopasowano zastępczego modelu biologicznego.

## Statystyka, populacja i oznaczenie

Methods określa krzywą M jako medianę zależną od wieku i opisuje powrót
percentyli po transformacji potęgowej Boxa–Coxa do oryginalnego rozkładu.
Wśród pięciu krzywych wymienia 50. percentyl. Dlatego używamy określenia
**„przybliżona modelowana P50 według Methods — odczyt ryc. 1A”**.
Jednocześnie rycina i jej podpis używają etykiety **Mean**; zachowujemy
tę rozbieżność. Nie wykazano równości mediany ze średnią arytmetyczną na
oryginalnej skali ani nie odzyskano dokładnego eksportu modelu. Osobny
model logarytmiczny rytmu dobowego nie jest wzorem tej krzywej wieku.

Źródłowe N=1073 dotyczy chłopców i mężczyzn z trzech duńskich kohort:
398 z Copenhagen Puberty Study (deklarowane 10,0–21,8 lat), 373 młodych
mężczyzn (17,8–27,6) oraz 302 z populacyjnego Health2008 (31,4–60,9).
Autorzy określają ich jako zdrowych; nie podają tu kompletu szczegółowych
wykluczeń chorób lub leków. Uwzględniono zróżnicowanie BMI, palenia
i alkoholu. Jest to przekrojowe odniesienie wieku, nie trajektoria
pojedynczego chłopca. Oddzielne kohorty rytmu dobowego i hCG, obejmujące
także podejrzenie niewydolności jąder, nie rozszerzają tej referencji.
Ryc. 2 przedstawia osobne średnie G1/G2/G3+G4/G5, nie używane w tym odczycie;
G ani owłosienie łonowe nie są wyprowadzane z wieku.

Materiał źródłowy: **surowica; in-house LC-MS/MS**. Jednostka źródła
µg/L jest tożsama z ng/mL, w której prezentujemy odczyt. To równość
jednostek, nie kalibracja różnych oznaczeń lub materiałów. Discussion
obniża LOD z 0,06 do **0,03 µg/L**, zachowując **LOQ 0,15 µg/L**;
międzydniowe RSD metody wynosi <15%. Nie podano reguły zastępowania,
wyłączania lub modelowania obserwacji poniżej granic ani ich liczebności
według wieku. Autorzy zastrzegają nieustaloną wydajność wykrywania
wczesnego pokwitania. Nie przenosimy imputacji z odrębnej pracy Busch.

## Jawna polityka wieku i braków

Pierwsza wersja używa domen **[10;27,6] ∪ [31,4;60,9] lat**, z końcami
włącznie, oraz wyłącznie bezpośrednio czytelnych odcinków kreski.
To konserwatywna polityka aplikacji oparta na deklarowanych zakresach
kohort, nie rozstrzygnięty rzeczywisty zakres obserwacji. Na ryc. 1A
widać punkty poniżej 10 lat i między 27,6 a 31,4; Results opisuje 5–60 lat.
Nie przedstawiamy tych przedziałów jako udowodnionego braku uczestników.

| Sytuacja | Odczyt w źródłach |
| --- | --- |
| <10, (27,6;31,4) lub >60,9 lat | Bez liczby: poza przyjętą domeną; dla środkowej przerwy odrębny powód niespójnego opisu wieku. |
| 10 do około 11,806 lat | Bez liczby: niskie krzywe są zlane/zasłonięte, choć wiek należy do deklarowanej kohorty. |
| Wiek wewnątrz jednego czytelnego odcinka i jednej domeny | Przybliżony odczyt P50 z jednostką i źródłem. |
| Zasłonięcie, także krótkie | Bez liczby: brak bezpośrednio czytelnej kreski; nie oznacza to braku kohorty. |
| Koniec czytelnego odcinka | Dostępny, jeżeli należy do domeny; np. dokładnie 17,50 pozostaje odczytem przed długą luką. |

Przerwa po 17,50 do około 19,916 roku wynika z zasłonięcia centralnej
linii punktami. Krótkie mosty graficzne istnieją w audycie jako osobna
rekonstrukcja, lecz **nie zasilają pierwszej wersji**. Nie stosujemy
interpolacji przez brak, najbliższego wieku, wartości granicznej lub
mediany wizyty Tulumcu jako zastępstwa. Odczyty rastra ponad 60,9 do
około 65,125 zachowano w audycie z flagą; nie rozszerzają routingu.
Końce tuszu nie są biologicznymi progami wieku.

Resampling liniowy jest dozwolony tylko pomiędzy sąsiednimi natywnymi
kolumnami tego samego widocznego odcinka. Samo sąsiedztwo dwóch
liczbowych węzłów siatki kwartalnej nie upoważnia do przejścia przez
zasłonięcie. Odczyt nie zależy od wysokości wyniku, nie używa Tannera
i nie zmienia geometrii, skali lub przerywanego stylu ilustracji.

## Kontekst wieku, niepewność i niski odczyt

Wykorzystujemy pełny istniejący kontekst **aktualnego formularza**:
płeć, wiek i jego precyzję/granice. Nie odtwarzamy przedziału z dolnego
wieku wykresu lub napisu „25 lat”, nie przeliczamy dawnej próbki ani
zapisów historii. Brak wieku, nieznana dokładność, zablokowany kontekst,
inna płeć, wyłączony INSL3 lub porównanie płci nie tworzą nowej liczby.
Zmiana osoby lub korekta wieku tej samej osoby odświeża albo usuwa odczyt.
Nie dodajemy obowiązkowego pytania lub fikcyjnego pomiaru INSL3.

Cały możliwy przedział wieku, z jego domknięciami, musi mieścić się
w **jednej domenie i jednym bezpośrednio czytelnym odcinku**. Przy pełnym
pokryciu min/max obejmuje końce oraz wszystkie wewnętrzne węzły śladu,
ponieważ drobne nierówności rastra mogą zmienić ekstremum. Jedno `≈`
pokazujemy tylko, gdy wszystkie mediany mają to samo zaokrąglenie
do 0,01 ng/mL; inaczej prezentujemy zakres median zaokrąglony na zewnątrz.
To zakres wartości modelu dla możliwego wieku, **nie norma osób, IQR
lub CI mediany**. Częściowa czytelność nie uprawnia do wyboru dostępnej
części przedziału.

Konserwatywny błąd graficzny wynosi ±0,05 ng/mL przed 20 latami i ±0,02
później; resampling zachowuje większy błąd końców, także przy 20 latach.
Obwiednia dla niepewnego wieku obejmuje każdą przecinaną parę sąsiednich
kolumn z większym błędem jej końców; granice zaokrąglamy na zewnątrz.
Nie jest to CI, SD, RSD analityczny ani pełna niepewność populacji/modelu.
Pochodzi z kontroli odczytu rastra, nie z liczebności badania.

Przecięcie źródłowej LOQ przez obwiednię błędu graficznego jest **notą
o niskim odczycie**, nie automatycznym odrzuceniem P50. LOQ próbki nie
jest podłogą mediany modelu. Nie przycinamy do 0,15, nie zapisujemy
zamiast liczby `<LOQ` lub zera i nie przypisujemy tej LOQ metodzie pacjenta.
Źródłowa nieznana reguła cenzury pozostaje ograniczeniem interpretacji.

## Przypadki syntetyczne i wpływ kliniczny

| Fikcyjny kontekst z formularza | Oczekiwane zachowanie |
| --- | --- |
| Mężczyzna, 25 lat jako `[25,26)` | Całość czytelna; modelowana mediana `≈1,27 ng/mL`. |
| Mężczyzna, dokładnie 40 lat lub `[40,41)` | Czytelne `≈1,25 ng/mL`. |
| Dokładnie 18 lat lub `[18,19)` | Bez liczby: zasłonięta centralna linia. |
| Dokładnie 12 lat, znana precyzja | `≈0,18 ng/mL` i nota o przecięciu źródłowej LOQ przez błąd graficzny. |
| Zapis „12 lat” jako `[12,13)` | Bez liczby: cały przedział nie mieści się w jednym czytelnym odcinku. |
| Dokładnie 12,5 lub 55 lat | Bez liczby: krótki most z audytu nie jest odczytem direct. |
| Dokładnie 30 lub 61 lat | Bez liczby: poza przyjętą domeną, bez zastępczej wartości granicznej. |
| Nieznana dokładność wieku lub kontekst dawnej próbki | Bez liczby dobranej do wieku; dokumentacja publikacji pozostaje dostępna. |

Zmiana dodaje do źródeł edukacyjną informację o stężeniu modelowym dla
wieku, co jest zmianą informacji klinicznej wymagającą opisanego źródła,
polityki i akceptacji zakresu. Nie jest to wynik pacjenta ani interpretacja
laboratoryjna. Nie aktywuje konwertera INSL3, norm, SDS, percentyla wyniku,
czerwonego lub jasnego punktu stężenia, historii i synchronizacji.
Dotychczasowe dwa bezpieczniki punktu INSL3 oraz pozostałe profile
odniesienia pozostają odrębne. Nowa liczba nie kalibruje względnej linii.

Wymagana weryfikacja obejmuje rzeczywisty czytnik produkcyjny na odrębnych
danych, powyższe przypadki, wszystkie luki i granice, pełny kontekst wieku,
tożsamość i odświeżanie źródeł, UI na komputerze/telefonie oraz PWA/offline.
Regresje wywołują rzeczywisty moduł w
[`insl3-age-source.test.mjs`](../../../tests/unit/insl3-age-source.test.mjs);
integrację i PWA sprawdzają
[`insl3-age-source.spec.mjs`](../../../tests/e2e/insl3-age-source.spec.mjs)
i [`insl3-age-source-offline.spec.mjs`](../../../tests/e2e/insl3-age-source-offline.spec.mjs).
Wyniki testów i kontroli GitHub raportuje PR. Akceptacja właściciela
24.10.2026 dotyczy tego ograniczonego zakresu; nie nadaje modelowi statusu
„zwalidowany klinicznie”.
