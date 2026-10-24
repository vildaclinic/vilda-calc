# Ox/Cr w próbce punktowej — przegląd źródeł

Data odczytu: 24.10.2026. Zakres: `OxCr_spot`, czyli iloraz szczawianów
i kreatyniny w tej samej próbce moczu, lub gotowy iloraz z laboratorium.
Nie obejmuje dobowego wydalania szczawianów ani samodzielnego rozpoznawania
pierwotnej hiperoksalurii (PH).

Właściciel zaakceptował 24.10.2026
[makietę desktop/mobile i dobór odniesień](https://vilda-oxcr-audyt-20261024.maciej-flader.chatgpt.site).
Akceptacja wdrożenia tej polityki nie jest nową walidacją kliniczną.
Reguły implementacyjne opisuje [REFERENCE_POLICY.md](REFERENCE_POLICY.md).

## Źródła przyjętych odniesień

### Fimlab: górne granice P95 dla dzieci i młodzieży

[OKSALAATTI, pełny katalog Fimlab](https://tutkimusohjekirja.fimlab.fi/ohjekirja/nayta.tmpl?setid=6533&sivu_id=322),
wersja **2.1**, zapis **6.03.2025**. Przeczytano pełną stronę, w tym opis
materiału, metody, tabelę i interpretację. Metoda źródła: **HPLC**.
Materiał: punktowy mocz dzieci i młodzieży. Tabela została przypisana przez
katalog do Matos 1999 i określa górny 95. percentyl, a nie dwustronny zakres
referencyjny ani próg rozpoznania PH.

| Wiek wydrukowany w źródle | Górna granica, µmol/mmol kreatyniny |
|---|---:|
| <6 miesięcy | ≤220 |
| 6 miesięcy–<1 roku | ≤170 |
| 1–<2 lat | ≤130 |
| 2–<3 lat | ≤100 |
| 3–<5 lat | ≤80 |
| 5–<7 lat | ≤70 |
| 7–17 lat | ≤60 |

Pierwsze sześć grup ma jednoznaczne fińskie „alle” (poniżej). Ostatni zapis
„7–17 v” nie definiuje automatycznie końca w dniu 18. urodzin.
**Minimum 1 miesiąca oraz maksimum dokładnego wieku 17 lat włącznie są
jawną, ostrożną polityką aplikacji**, a nie dosłownie wydrukowaną definicją
obu granic w katalogu. Nie używa się tej tabeli u noworodków <1 miesiąca,
dla bieżącego kontekstu wcześniaczego ani według wieku skorygowanego.

Źródło podaje zaokrąglony przelicznik 11,11 µmol/mg. Jest on zbliżony do
konwencji kwasu szczawiowego bezwodnego, ale **nie definiuje dokładnej masy
cząsteczkowej ani podstawy masowej każdego raportu „oxalate”**. Normę
przechowuje się w jej natywnej osi µmol/mmol, bez odtwarzania zaokrąglonej
masowej tabeli z innego katalogu. Metoda źródła nie jest dopisywana jako
potwierdzona metoda próbki pacjenta.

### Matos 1999: potwierdzona populacja, nieodczytany pełny artykuł

Matos V i wsp., *Urinary oxalate and urate to creatinine ratios in a healthy
pediatric population*. American Journal of Kidney Diseases 1999;
DOI [10.1053/AJKD034000e6](https://doi.org/10.1053/AJKD034000e6),
[PMID 10430995](https://pubmed.ncbi.nlm.nih.gov/10430995/),
[rekord instytucjonalny CHUV/SONAR](https://sonar.rero.ch/global/documents/189469).

Odczytano abstrakt i rekord instytucjonalny; **nie uzyskano pełnego artykułu
wydawcy**. Nie przedstawia się wszystkich metod i tabel oryginalnej pracy
jako niezależnie zweryfikowanych. Pełny bieżący katalog Fimlab jest źródłem
wdrażanej tabeli laboratoryjnej.

Abstrakt opisuje 384 zdrowych dzieci z Lozanny: 181 dziewcząt i 203 chłopców,
w wieku **1 miesiąc–17 lat**, oraz 627 drugich porannych próbek moczu.
W 63% przypadków próbki pobierano w dwóch kolejnych tygodniach. Nie wykazano
istotnej różnicy między płciami. Minimum wieku kohorty uzasadnia ostrożne
wyłączenie <1 miesiąca z polityki aplikacji, ale nie dowodzi norm dla
wcześniaków. Druga poranna próbka jest cechą badania; nie staje się nowym
obowiązkowym pytaniem ani potwierdzonym faktem dotyczącym pacjenta.

### Newcastle NHS: osobny zakres dla starszej młodzieży i dorosłych

[Oxalate, urine — pełny katalog Newcastle Hospitals NHS](https://laboratories.newcastle-hospitals.nhs.uk/test-directory/oxalate-urine/),
ostatnia aktualizacja **24.12.2024**, odczyt 24.10.2026. Katalog wyraźnie
dopuszcza losową próbkę moczu zarówno u dzieci, jak i dorosłych; opis DZM
jest odrębny.

Dla **wieku >12 lat** drukuje zakres **0,002–0,083 mmol/mmol kreatyniny**,
czyli dokładnie **2–83 µmol/mmol**. Aplikacja stosuje go wyłącznie dla
**dokładnego wieku >17 lat**, w całości wewnątrz opisanego pasma źródłowego.
Nie powstaje sztuczna luka 17–18 lat. Określenie populacji to „starsza
młodzież i dorośli”. Źródło nie podaje podziału według płci ani maksymalnego
wieku; nie dopisuje się limitu 83 lat z kalkulatora Ca/Cr.

Katalog drukuje myślnik, bez jawnych operatorów końców. **Przyjęcie obu
końców wyniku jako włączonych jest konwencją aplikacji**, a nie cytowanym
operatorem źródła. Metoda oznaczenia, pochodzenie i liczebność populacji
referencyjnej nie są ujawnione. Wynik pozostaje orientacyjnym porównaniem
z nazwanym zakresem zewnętrznego laboratorium; pierwszeństwo ma właściwy
zakres laboratorium wykonującego badanie.

Po dokładnym wieku 17 lat granica ≤60 z Fimlab ustępuje dwustronnemu
zakresowi 2–83 z Newcastle **z powodu zmiany źródła**. Nie jest to fizjologiczny
skok, ciągła krzywa wieku ani dowód, że ta sama wartość stała się biologicznie
prawidłowa w wyniku urodzin. Źródło jest widoczne przy wyniku, a zmiana
polityki opisana w Szczegółach.

## Konwersje chemiczne i podstawa masowa

| Wielkość | Stała aplikacji, mg/mmol | Pochodzenie i ograniczenia |
|---|---:|---|
| Jon szczawianowy | 88,019 | Jawne przybliżenie aplikacji. Bieżący [ChEBI, oxalate](https://www.ebi.ac.uk/chebi/CHEBI:30623) podaje 88,018; nie przypisuje się ChEBI dokładnej stałej 88,019. |
| Kwas szczawiowy bezwodny | 90,0349 | [NIST Chemistry WebBook, CAS 144-62-7](https://webbook.nist.gov/cgi/cbook.cgi?ID=C144627). |
| Kreatynina | 113,12 | [ChEBI:16737, creatinine](https://www.ebi.ac.uk/chebi/CHEBI:16737), masa 113,120. |

Nie wyprowadza się podstawy masowej wyniku z nazwy „szczawiany”, odczynnika
kalibracyjnego ani dihydratu kwasu. Laboratoria używają różnych konwencji.
Jednostka molowa nie wymaga pytania o postać. Jednostki masowe mają w jednym
selektorze jednostkę i podstawę: jon, kwas bezwodny albo „nie podano”.
Przy nieznanej podstawie pozostaje poprawny iloraz masowy, ale nie tworzy się
jednej zgadniętej konwersji do SI ani oceny względem molowej normy.

Jeżeli laboratorium podaje równocześnie wynik molowy, do porównania należy
przepisać **oryginalną wartość molową**, zamiast tylko zmienić jednostkę
bez zmiany liczby. Odwrócenie zaokrąglonego wyniku masowego może zmienić
ocenę w pobliżu granicy. Fizyczne konwersje aplikacji nie są dokładnym
odtworzeniem katalogowego, zaokrąglonego współczynnika Fimlab 11,11.

## Kontekst kliniczny i przygotowanie próbki

[Groothoff i wsp., ERKNet/OxalEurope 2023](https://doi.org/10.1038/s41581-022-00661-1),
*Clinical practice recommendations for primary hyperoxaluria: an expert
consensus statement from ERKNet and OxalEurope*, Nature Reviews Nephrology
19:194–211. Przeczytano pełny główny tekst i referencje; nie uzyskano tabel
suplementarnych 2/3 i nie przeniesiono z nich norm.

- S. 196–197 i tabela 1, s. 199: spot Ox/Cr może służyć do wstępnej analizy
  lub zastąpić DZM, gdy zbiórka jest klinicznie trudna; interpretacja wymaga
  wieku. Pojedynczy iloraz nie jest równoważny dobowemu wydalaniu.
- Wynik zależy m.in. od diety, czasu pobrania i zmienności biologicznej;
  wcześniaki mają wyższe wartości niż donoszone niemowlęta. Brak informacji
  nie staje się potwierdzonym brakiem tych czynników.
- Tabela 1, zalecenie 5, i s. 201: ustalenie hiperoksalurii wymaga powtarzanych
  podwyższonych oznaczeń. Pojedynczy wysoki wynik nie rozpoznaje PH, kamicy
  ani przyczyny podwyższenia. Wynik niepodwyższony nie wyklucza choroby.
- Próg >1 mmol/1,73 m²/dobę dotyczy DZM, a nie punktowego Ox/Cr. Zaawansowana
  niewydolność nerek może zmniejszać wydalanie do moczu i wymaga innego toru
  diagnostycznego; nie dodaje się kreatyniny w surowicy jako warunku samego
  dzielenia dwóch stężeń w moczu.

Przyjęte dwa odniesienia są dla próbki punktowej/losowej. Jeżeli istniejące
dane jawnie wskazują zbiórkę czasową lub DZM, matematyczny iloraz może być
pokazany, ale nie nadaje się mu tej normy random. Dotyczy to także gotowego
ilorazu z takiej zbiórki. Nie dodaje się nowej obowiązkowej ankiety o próbkę;
zachowuje się znaczenie już znanego faktu.

[ACB, Oxalate, 2012; przegląd 2013](https://www.acb.org.uk/static/bcc8d575-025f-4051-a663c44fc50ea343/oxalate.pdf),
pełna pięciostronicowa monografia: s. 4 nie przypisuje niskim wynikom
w moczu znaczenia klinicznego. Wynik <2 w profilu Newcastle można nazwać
„poniżej zakresu laboratoryjnego”, **bez rozpoznania niedoboru szczawianów**.
To źródło uzupełniające, a nie nowa uniwersalna tabela norm.

Instrukcje przedanalityczne różnią się między laboratoriami. Fimlab opisuje
kontrolę pH ≤6 dla próbki punktowej; Mayo ROXUR wymaga pH 4,5–8 i zabrania
korekty pH; [Labcorp 123500](https://www.labcorp.com/tests/123500/oxalate-creatinine-ratio-random-urine)
opisuje pH ≤3, a Newcastle dla użytkowników zewnętrznych pH <2.
**Nie tworzy się wspólnego checkboxa zakwaszenia ani ogólnego polecenia
samodzielnej zmiany pH.** Obowiązują instrukcje laboratorium wykonującego
oznaczenie. Wspólna próbka jest opisanym założeniem, jeśli nie ma znanej
sprzeczności; nie oznacza potwierdzenia diety, metody lub braku leków.

## Dlaczego nie zastosowano innych tabel

| Źródło odczytane w audycie | Przyczyna niewykorzystania jako domyślnej tabeli Ox/Cr |
|---|---|
| [Mayo ROXUR, pełna definicja 5 stron](https://www.mayocliniclabs.com/test-catalog/download-setup?format=pdf&unit_code=606747), wygenerowana 24.10.2026 | Formalne pole mówi „No established reference values”; oddzielna interpretacja podaje pediatryczne P95 Matos w mg/mg. Zakres zlecania <16 lat nie pokrywa się z tabelą do 17 lat. Proza ma wymiarowo niewłaściwe mmol/mL. Pary masowe wskazują przybliżenie kwasu, ale nie definiują podstawy każdego współczesnego raportu Mayo. |
| [EAU Urolithiasis 2026, §4, tabela 4.3](https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention) | Wydrukowane osie i liczby szczawianów mają nierozstrzygnięte niespójności skali oraz luki wieku. Nie naprawia się prefiksów przez zgadywanie i nie przenosi progów DZM na spot. |
| [GeneReviews PH1, tabela 2](https://www.ncbi.nlm.nih.gov/books/NBK1283/) | Para dla 2–5 lat: 0,14 mmol/mmol i 0,22 mg/mg nie tworzy spójnej konwersji. |
| [Waikato OXAU](https://lab.waikatodhb.health.nz/test-guide/view/1270/oxalatecreatinine-ratio) | Tabela zawiera >15 lat, ale zakres wykonywania random jest jawnie <14 lat; nie użyto tego jako normy dorosłych. |
| [UHB/HSL, urine oxalate](https://uhbpathology.com/biochemistry/bio-test-database/item/urine-oxalate-2) | Dorosłe progi F<45/M<33 µmol/mmol opisano przy dopuszczonej wyłącznie DZM, bez dowodu zastosowania jako normy random. |
| [Shen 2025, DOI 10.1186/s40001-025-02657-6](https://pmc.ncbi.nlm.nih.gov/articles/PMC12102841/) | Pełny główny tekst odczytano przez przeglądarkę źródeł. Populacja Wuhan 19–85 lat i poranny mocz na czczo, HPLC-UV, małe niektóre grupy oraz konflikt górnej wartości mężczyzn 19–29: tekst 53,39 vs tabela/abstrakt 54,39. Nie przyjęto jako uniwersalnego random RI. Lokalny plik CAPTCHA nie jest archiwum artykułu. |

Przegląd rozróżnia pełne katalogi i teksty od samego abstraktu Matos.
Wartości referencyjne pochodzą z nazwanych źródeł; oczekiwane konwersje
w testach wynikają z jawnych stałych, a nie z kopiowania implementacji.
