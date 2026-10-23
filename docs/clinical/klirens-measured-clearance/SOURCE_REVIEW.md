# Klirens ze zbiórki — źródła i rzeczywisty zakres dowodów

Odczyt: **2026-10-23**. Baza audytu: `8658bb759f93f69f3648503544a4ddc336655e94`.
Przedmiotem jest zmierzony endogenny klirens kreatyniny z czasowej zbiórki moczu,
nie eGFR, klirens egzogennego markera ani dobowe wydalanie kreatyniny.
Sposób użycia danych określa [REFERENCE_POLICY.md](REFERENCE_POLICY.md).

## PathWest — aktywny profil

[PathWest WA Health, Creatinine Clearance, CCL/CCR, TestID 521](https://pathwesttd.health.wa.gov.au/testdirectory/testdetail.aspx?TestID=521).
Pełny oficjalny katalog odczytany, łącznie z sekcjami General / Unit of Measure /
Reference Interval i Collection Requirements. Wpis podaje aktualizację
**20.03.2026, 08:10**. Jednostka: **mL/min/1,73 m²**; zakresy skorygowane do
powierzchni ciała z użyciem wzrostu i masy. Zbiórka: pojemnik UR24 bez
konserwantu oraz krew w heparynie litowej; krew dopuszczona w ciągu 24 h od
początku lub końca zbiórki. To okno krwi nie jest tolerancją czasu zbiórki.

Poniżej wierna transkrypcja wartości i jawnych granic wieku. Przedziały
liczbowe są zakresami laboratoryjnymi, a nie średnimi ± SD lub progami CKD.

| Wiek w latach | Mężczyźni | Kobiety |
|---|---:|---:|
| 3–<19 | 75–125 | 75–125 |
| 19–<30 | 94–140 | 72–110 |
| 30–<40 | 88–134 | 66–104 |
| 40–<50 | 81–127 | 59–97 |
| 50–<60 | 75–121 | 53–91 |
| 60–<70 | 68–114 | 46–84 |
| 70–<80 | 62–108 | 40–78 |
| 80–<90 | 55–101 | 33–71 |
| 90–<100 | 49–95 | 27–65 |
| 100–<120 | 42–88 | 20–58 |

Źródło nie podaje przedziału <3 lub ≥120 lat, metody oznaczenia kreatyniny,
standaryzacji analitycznej, równania BSA, publikacji pierwotnej, liczebności
ani kryteriów doboru kohorty. Nie dokumentuje osobnej populacji ciężarnych
ani walidacji każdej krótszej zbiórki. Identyfikator „PathWest” oznacza
pochodzenie zakresu laboratoryjnego; nie stanowi opisu potwierdzonej
populacji referencyjnej próbki pacjenta.

IDMS przyjmowane przy braku przeciwnych danych w uproszczonym `cl24` jest
jawnym założeniem aplikacji, nie właściwością oznaczenia ustaloną z katalogu
PathWest. Nie ustanawia się nowej bramki IDMS dla ilorazu Ucr/Scr: znane
non-IDMS zachowuje komentarz i nie jest automatycznie blokowane ani
przepisywane na IDMS. Równanie i stężenia nie otrzymują arbitralnej korekty;
brak blokady nie dowodzi zgodności metod ani znoszenia się błędów oznaczenia.

Wybór jednego ciągłego profilu 3–<120 zapobiega zmianie laboratorium źródłowego
wyłącznie dlatego, że pacjent przekracza górną granicę Mayo. Nie oznacza
uniwersalnej wyższości jego norm. Zakres laboratorium wykonującego badanie
ma pierwszeństwo. Odrębna linia PathWest `>77 mL/min` dla wyniku bez korekcji
nie ma określonej populacji wieku/płci i nie jest używana jako fallback.

## Pozostałe pełne źródła

| Źródło, wersja i zakres odczytu | Co potwierdza | Granice użycia |
|---|---|---|
| [Mayo Clinic Laboratories, CRCL](https://renal.testcatalog.org/show/CRCL), bieżący pełny katalog; brak odrębnej daty aktualizacji. Sekcje Specimen Required, Clinical Information / Creatinine Clearance, Reference Values, Interpretation. | Równanie bezwzględne i indeksowanie 1,73/BSA, krótsze okresy zbiórki, wydzielanie cewkowe. Mężczyźni 19–75: 77–160; kobiety 18–29: 78–161, 30–39: 72–154, 40–49: 67–146, 50–59: 62–139, 60–72: 56–131 mL/min/BSA. Surowica dopuszczona do 72 h przed startem lub po końcu. | Brak norm mężczyzn <19/≥76 i kobiet <18/≥73 nie dowodzi braku norm w innych laboratoriach. Tabela eGFR w tym samym katalogu nie służy do klasyfikacji CrCl. Protokół Mayo nie jest dopisywany do PathWest. |
| [Labcorp 003004, Creatinine Clearance](https://www.labcorp.com/tests/003004/creatinine-clearance), pełny bieżący katalog; brak odrębnej daty aktualizacji. Sekcje Limitations, Collection Instructions, Reference Range. | Zbiórka 24 h, normy oparte na BSA 1,73 m². Od 12 lat: M 97–137, K 88–128; poniżej 12 lat 50–90. Wpływ ciąży, wysiłku, leków, oznaczenia i wydzielania cewkowego; zmienność i błędy zbiórki. | Brak górnej granicy wieku w tabeli nie stanowi dowodu osobnej walidacji u seniorów. Szeroki przedział nie zastępuje doboru wieku w PathWest. |
| [Seattle Children's, LAB1765](https://seattlechildrenslab.testcatalog.org/show/LAB1765-1), pełny aktualny katalog; nie podano daty rewizji, copyright 2026 nie jest datą aktualizacji. Sekcje wymagań próbki, metody i wartości referencyjnych; także [LAB383](https://seattlechildrenslab.testcatalog.org/show/LAB383-1). | Opublikowane normy indeksowanego CrCl wcześniaków, noworodków, niemowląt, dzieci i dorosłych. Wymagane krew, mocz, wzrost i masa. Oznaczenie Two Point Rate, Vitros 4600. | Brak kohorty, wzoru BSA i jawnego czasu zbiórki na stronie CrCl. Nieokreślony wiek po urodzeniu/PMA w wierszu wcześniaków, brak normy donoszonych <2 dni, wspólne końce sąsiednich zakresów wieku. Brak automatycznego dołączenia do PathWest. |
| [Manchester University NHS Foundation Trust, Paediatric Biochemistry User Guide](https://mft.nhs.uk/app/uploads/2023/08/Paediatric-Biochemistry-User-Guide-May-2022-v1.1.pdf#page=33), Revision 29, CB-CLIN-PI-013, maj 2022. Pełny PDF, tabela na drukowanej s. 33/40, sprawdzona wizualnie. | Normy CrCl od wieku noworodkowego, jawna zbiórka 24 h, równoczesna krew, wzrost/masa, mL/min/1,73 m². | Brak zakresu 18–24 mies., nieokreślona liczbowo granica „adult”, brak osobnej definicji wcześniaczej. Metoda oznaczenia i wzór BSA nie są podane przy tabeli. |
| [Children's Minnesota, Creatinine Clearance, Serum and Urine](https://www.childrensmn.org/references/lab/chemistry/creatinine-clearance-serum-and-urine.pdf), pełny 3-stronicowy PDF; ostatnia widoczna aktualizacja 21.07.2015. S. 1–2: próbki, zbiórka, zakres. | Enzymatyczne oznaczenie skorelowane do metody IDMS, przedział 70–130 mL/min/1,73 m² opisany jako dla wszystkich grup wieku, oparty na zbiórce 24 h. Źródło wprost nie ustanawia norm krótszych okresów. | Szeroki przedział bez stratyfikacji dojrzewania różni się od Seattle/Manchester; nie służy do uzupełniania luk noworodkowych. Nie przenosi się dopuszczalnego tu wieku próbki krwi na ogólny formularz. |
| [UW Medicine, UCLEAR](https://testguide.labmed.uw.edu/view/UCLEAR), pełny bieżący katalog, sekcja Ordering & Collection. | Preferuje 24 h i dopuszcza krótsze zbiórki, np. 12, 8, 6 i 4 h; wymaga także kreatyniny z krwi. | Dopuszczenie pomiaru w tym laboratorium nie waliduje przedziałów PathWest dla każdego krótszego protokołu. Normy UW nie są łączone z normami PathWest. |
| [KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD](https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf), Kidney Int. 2024;105(Suppl 4S):S117–S314. Pełny PDF; PP 1.2.2.8, s. S183 / PDF 68, tabela 7, s. S178 / PDF 63; definicje GFR/CKD. | CrCl ze zbiórki czasowej bywa użyteczny przy niedostępnym mGFR i wątpliwym eGFRcr-cys; błędy zbiórki zaniżają lub zawyżają wynik. Kategorie G dotyczą GFR. | Nie dostarcza jednego zakresu CrCl ani wytycznej liczby pytań formularza; nie uzasadnia rozpoznania/wykluczenia CKD na podstawie samego porównania laboratoryjnego. |
| [Mayo, SI Unit Conversion](https://www.mayocliniclabs.com/order-tests/si-unit-conversion.html), pełna bieżąca tabela, wiersz CTU Creatinine 24 Hour Urine. | Mocz: mg/dL ×0,0884 = mmol/L; ilość dobowa mg/24 h ×0,00884 = mmol/dobę. | Stężenie i ilość dobowa są różnymi wielkościami. Samą zgodnością jednostek nie potwierdza się zgodności metod oznaczenia. |

## Mapa dostępności poniżej 3 lat

Te dane dowodzą istnienia pediatrycznych przedziałów; **nie są aktywnym
profilem automatycznej interpretacji**. Wartości w mL/min/1,73 m², obie płcie.
Nazwy wieku zachowują brzmienie granic źródłowych bez narzuconej aplikacyjnie
konwencji rozstrzygania wspólnych końców.

| Grupa opublikowana w Seattle | Przedział |
|---|---:|
| Wcześniak, bez określonego PNA/PMA | 29–65 |
| Donoszony: 2 dni–1 tydzień | 26–80 |
| Donoszony: 1–4 tygodnie | 28–68 |
| 4 tygodnie–6 miesięcy | 41–103 |
| 6–12 miesięcy | 49–157 |
| 12 miesięcy–2 lata | 63–175 |
| 2–13 lat | 89–165 |

Manchester publikuje dla wieku do 1 miesiąca 29–69, 1–3 mies. 31–91,
3–6 mies. 44–109, 6–12 mies. 51–165, 12–18 mies. 65–200 i 2–12 lat 90–173.
Różnice nie są błędem do „uśrednienia”; źródła mają odrębne metody i zakresy.
Uruchomienie osobnego profilu wymaga określenia protokołu, granic wieku,
zakresu wcześniactwa i przeliczenia BSA oraz odrębnej akceptacji zakresu.
Nie korzysta się z dawnego wcześniactwa jako uniwersalnej kwalifikacji
starszego dziecka do normy dla wcześniaka.

## Inne tropy i odrzucone uogólnienia

- [Lima Memorial, UCRP](https://lmhslab.testcatalog.org/show/UCRP): pełny katalog
  ma zakresy seniorów 70–79, 80–89 i ≥90 lat. Opis „corrected” nadal drukuje
  mL/min bez jawnego mianownika 1,73 i równania BSA. Zakres „0–39” nie jest
  podstawą automatycznej klasyfikacji noworodków. Platforma Mayo nie czyni
  tych przedziałów normami Mayo; laboratorium wykonujące to Lima Memorial.
- Legacy Health, *Chemistry Age Related Reference Ranges and Critical Values*,
  indeksowane PDF z 2020/2021: wyszukiwarka ujawnia przedziały do ≥90 lat,
  lecz pełne pliki przekierowują do 404. Nie wykorzystano ich jako źródła
  wdrożeniowego ani nie zastąpiono pełnego odczytu fragmentem wyszukiwarki.
- Sokoll LJ i wsp., *Establishment of creatinine clearance reference values
  for older women*, Clin Chem. 1994;40:2276–2281,
  [PMID 7988015](https://pubmed.ncbi.nlm.nih.gov/7988015/),
  [DOI 10.1093/clinchem/40.12.2276](https://doi.org/10.1093/clinchem/40.12.2276):
  dostępny abstrakt opisuje 279 kobiet 40–95 lat i pomiar CrCl. Pełny PDF nie
  był dostępny; nie przeniesiono jego tabel do norm aplikacji. Odczyt abstraktu
  nie jest deklarowany jako weryfikacja pełnych przedziałów.
- [Mayo STRC](https://www.mayocliniclabs.com/test-catalog/Overview/83316)
  dotyczy iotalamatu/PAH, nie CrCl. Podobnie tabela egzogennego mGFR,
  równanie Cockcrofta–Gaulta i stężenia kreatyniny w surowicy nie dostarczają
  zastępczych norm zmierzonego klirensu kreatyniny.
- [PathWest CR24](https://pathwesttd.health.wa.gov.au/testdirectory/testdetail.aspx?TestID=782)
  podaje wydalanie kreatyniny w mmol/dobę; nie są to zakresy klirensu.

## Zachowane wzory BSA i granica dowodu

Haycock GB, Schwartz GJ, Wisotsky DH. *Geometric method for measuring body
surface area: a height-weight formula validated in infants, children, and
adults*. J Pediatr. 1978;93:62–66,
[DOI 10.1016/S0022-3476(78)80601-5](https://doi.org/10.1016/S0022-3476(78)80601-5),
oraz Du Bois D, Du Bois EF. *Clinical calorimetry: tenth paper. A formula to
estimate the approximate surface area if height and weight be known*.
Arch Intern Med (Chic). 1916;XVII(6_2):863–871,
[DOI 10.1001/archinte.1916.00080130010002](https://doi.org/10.1001/archinte.1916.00080130010002)
są źródłami dotychczasowej polityki BSA aplikacji. Ten audyt jej nie zmienia.
Równania sprawdzono w rzeczywistych funkcjach produkcyjnych; dokumentacja
wcześniejszego [audytu Du Bois](../klirens-cg-normalized/source-review-2026-10-23.json)
odnotowuje odczyt skanu s. 870–871. Nie deklaruje się nowego odczytu pełnego
tekstu Haycocka ani nie przypisuje obu równań kohorcie PathWest.

Zgodność arytmetyczna przeliczenia przedziału, akceptacja interfejsu i zielone
testy nie rozwiązują nieznanej przenoszalności metody/kohorty ani nie zastępują
porównania z lokalnym laboratorium. Przyjęte porównanie pozostaje jawnym
odniesieniem źródłowym z opisanymi ograniczeniami.
